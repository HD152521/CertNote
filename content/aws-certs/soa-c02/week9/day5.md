# Day 5 - Week 9 복습 + 시나리오 10문제

📅 날짜: Week 9 (Day 5)
🎯 주제: 보안·암호화·위협탐지 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 9 핵심 개념 한 줄 요약

1. **KMS Key 종류**: AWS Owned / AWS Managed / Customer Managed. CMK는 $1/월
2. **Envelope Encryption**: KMS 4KB 한도 → DEK + 로컬 암호화
3. **Key Policy가 1순위** — IAM 권한 있어도 Key Policy 없으면 거부
4. **삭제 대기 7~30일**. 영구 복호화 불가 위험
5. **Multi-Region Key = Cross-Region 복호화** 유일 방법
6. **Secrets Manager = 자동 회전 + Cross-Region**, Parameter Store는 그 외
7. **IAM Access Analyzer**: External 노출 자동 탐지 + Policy Generation (CloudTrail 90일)
8. **Trusted Advisor 5대**: Cost/Performance/Security/Fault Tolerance/Service Limits
9. **GuardDuty(위협) + Inspector(취약점) + Macie(민감 데이터) + Security Hub(통합)**
10. **자동 대응: 보안 도구 → EventBridge → SSM Automation/Lambda**

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | KMS | CloudHSM |
|------|-----|----------|
| 관리 | AWS 공유 | 단독 HSM |
| FIPS | 140-2 L2 | 140-2 L3 |
| 비용 | $1/월/키 | $1.45+/시간 |
| 사용 사례 | 일반 | 규제 산업 |

| 항목 | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| 비용 | 무료/Advanced 저렴 | $0.40/시크릿/월 |
| 자동 회전 | X | O |
| Cross-Region | X | O |
| 사용 사례 | 일반 설정 | DB 자격증명 |

| 항목 | GuardDuty | Inspector | Macie |
|------|-----------|-----------|-------|
| 목적 | 위협 탐지 | 취약점 스캔 | 민감 데이터 발견 |
| 대상 | 계정 활동 전반 | EC2/ECR/Lambda | S3 |
| 에이전트 | X (Runtime은 별도) | SSM Agent | X |
| 데이터 소스 | Flow Logs/CloudTrail/DNS | OS 패키지/이미지/코드 | S3 객체 |

---

## 📝 시나리오 10문제

**문제 1.** IAM 사용자가 `kms:*` 권한 있는데 KMS Key 사용이 거부됐다. 가능한 원인은?

A) MFA 부족
B) Key Policy에 명시적 Allow 없음 — KMS는 Resource Policy(Key Policy) 우선
C) 리전
D) 만료

**정답: B**
해설: KMS의 특이점. Key Policy가 1순위, IAM은 다음. 기본 Key Policy의 `iam::account:root` Allow 없으면 IAM이 무의미.

---

**문제 2.** 1GB 파일을 KMS로 암호화하려는데 4KB 한도 에러. 해결책은?

A) 파일 분할
B) Envelope Encryption (GenerateDataKey → DEK로 파일 암호화 → CipherDEK 함께 저장)
C) S3 직접
D) S3 SSE만

**정답: B**
해설: KMS 표준 사용법. KMS는 작은 데이터만 직접. 큰 데이터는 DEK + 로컬.

---

**문제 3.** RDS 비밀번호를 30일마다 자동 회전하려 한다. 가장 적합한 도구는?

A) Parameter Store
B) Secrets Manager + AWS 제공 RDS Rotation Lambda
C) Lambda 직접
D) Manual

**정답: B**
해설: Parameter Store는 자동 회전 X. Secrets Manager + AWS 제공 Lambda(직접 작성 불필요).

---

**문제 4.** S3 버킷이 외부 계정에 의도치 않게 공유됐는지 자동 탐지하려면?

A) GuardDuty
B) IAM Access Analyzer (External Access)
C) Trusted Advisor
D) Macie

**정답: B**
해설: Access Analyzer의 External Access 기능. Zone of Trust 외부의 접근 자동 탐지.

---

**문제 5.** EC2 인스턴스가 비트코인 채굴 C&C 서버와 통신한다. 자동 탐지하려면?

A) Inspector
B) GuardDuty (Threat Intel + ML로 알려진 악성 도메인 탐지)
C) Macie
D) Config

**정답: B**
해설: GuardDuty의 정확한 사용 사례. DNS Logs 분석으로 알려진 악성 도메인 통신 자동 감지.

---

**문제 6.** S3 버킷에 신용카드 번호가 업로드됐는지 자동 탐지하려면?

A) Macie - PII/신용카드/SSN 자동 발견
B) GuardDuty
C) Inspector
D) Access Analyzer

**정답: A**
해설: Macie가 S3 민감 데이터 발견 전용. ML + 정규식 패턴.

---

**문제 7.** EC2 OS 취약점 자동 스캔에 어떤 도구?

A) GuardDuty
B) Inspector v2 (CVE DB 기반 자동 스캔, SSM Agent 필요)
C) Macie
D) Trusted Advisor

**정답: B**
해설: Inspector v2가 자동 취약점 스캔. EC2/ECR/Lambda 모두 지원.

---

**문제 8.** GuardDuty 발견 시 의심 EC2를 자동 격리하려 한다. 흐름은?

A) Lambda 폴링
B) GuardDuty → EventBridge → SSM Automation(`AWS-IsolateEC2InstanceFromGuardDutyFinding`) 또는 Lambda
C) Config Rule
D) Inspector

**정답: B**
해설: 자동 대응 표준 패턴. SSM Automation Runbook이 SG를 격리 SG로 변경하는 표준 Runbook 제공.

---

**문제 9.** Global DynamoDB Table에 KMS 암호화를 적용하려 한다. 어떤 키?

A) 일반 CMK
B) Multi-Region Key - Cross-Region 동일 키 ID로 복호화 가능
C) AWS Managed Key
D) CloudHSM

**정답: B**
해설: 일반 KMS Key는 리전 종속. Multi-Region Key가 Global Table 같은 멀티 리전에서 같은 키 ID로 복호화 가능.

---

**문제 10.** 회사가 모든 계정의 GuardDuty/Inspector/Macie/Access Analyzer finding을 한 화면에서 통합 관리하려 한다. 어떤 도구?

A) CloudWatch Dashboard
B) Security Hub (모든 보안 finding 통합 + ASFF 표준 + 보안 표준 자동 평가)
C) Config
D) Audit Manager

**정답: B**
해설: Security Hub의 정확한 사용 사례. CIS/PCI/NIST 표준 자동 평가도. Delegated Admin으로 Organizations 통합.

---

## 🔮 다음 주 예고 (Week 10)

Week 10은 **백업·DR 운영** — Snapshot, AWS Backup, Multi-AZ, Cross-Region.

- Day 1: EBS Snapshot, AMI, DLM (Data Lifecycle Manager)
- Day 2: AWS Backup - Plan, Vault, Cross-Region/Cross-Account
- Day 3: RDS Multi-AZ vs Read Replica, Aurora Global DB
- Day 4: S3 복제(CRR/SRR), Storage Gateway, Elastic Disaster Recovery
- Day 5: Week 10 복습 + 시나리오 10문제

> 💡 안정성·BCP(16%) 도메인의 핵심. RTO/RPO 시나리오 빈출.
