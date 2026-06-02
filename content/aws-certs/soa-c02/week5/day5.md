# Day 5 - Week 5 복습 + 시나리오 10문제

📅 날짜: Week 5 (Day 5)
🎯 주제: Systems Manager 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 5 핵심 개념 한 줄 요약

1. **Managed Instance 조건**: Agent + IAM Role(`AmazonSSMManagedInstanceCore`) + 네트워크 도달
2. **사설 VPC = 3개 Interface Endpoint** (ssm/ssmmessages/ec2messages) 필수
3. **Hybrid Activations**로 온프레미스 서버도 `mi-xxx` ID로 EC2처럼
4. **Run Command(일회성) / State Manager(지속) / Maintenance Window(스케줄)** 3종 세트
5. **Patch Group 태그 = 정확히 "Patch Group"** (공백 포함, 시험 함정)
6. **AWS 기본 베이스라인 = Security/Critical만** — Important는 Custom
7. **Dev→Stage→Prod 점진 적용 = ApproveAfterDays 차이**로 구현
8. **Parameter Store SecureString**: KMS 암호화. 자동 회전은 Secrets Manager
9. **Session Manager**: SSH/RDP 키 없이, 포트 22 닫고, IAM 기반, 자동 감사
10. **Automation Runbook**: 멀티 스텝 워크플로. EventBridge·Config Auto Remediation 표적

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | Run Command | State Manager | Maintenance Window |
|------|-------------|---------------|---------------------|
| 실행 | 일회성 | 지속/주기 | 스케줄 시간대 |
| Drift 교정 | X | O (재실행) | X (스케줄만) |
| 신규 인스턴스 | X | 자동 포함 | 태그 매칭 시 |
| 사용 사례 | ad-hoc 명령 | 표준 설정 강제 | 패치 등 묶음 |

| 항목 | Parameter Store Standard | Parameter Store Advanced | Secrets Manager |
|------|-------------------------|--------------------------|-----------------|
| 비용 | 무료 | $0.05/파라미터/월 | $0.40/시크릿/월 |
| 값 크기 | 4KB | 8KB | 64KB |
| 자동 회전 | X | X | O (RDS/Lambda) |
| Cross-Region | X | X | O |
| Policy(만료) | X | O | X |

| 항목 | SSH/Bastion | Session Manager |
|------|-------------|-----------------|
| 인증 | SSH 키 | IAM 권한 |
| 포트 22 | 열어야 | 닫아도 됨 |
| 감사 | 별도 구성 | 자동 (S3/CW Logs) |
| 키 분배 | 필요 | 불필요 |
| MFA 강제 | 어려움 | IAM 조건으로 쉬움 |

---

## 📝 시나리오 10문제

**문제 1.** EC2 인스턴스가 SSM Managed Instance 목록에 안 나타난다. IAM Role도 부여했다. 사설 VPC에서 인터넷 차단 환경이다. 가장 가능성 높은 원인은?

A) Agent 버전
B) VPC Endpoint(ssm/ssmmessages/ec2messages) 누락 - 인터넷 차단 시 필수
C) Region 잘못
D) AMI 종류

**정답: B**
해설: 사설 VPC + 인터넷 차단 = VPC Endpoint 3개 필수. NAT 없이 SSM 사용하려면 Interface Endpoint. SG에서 Endpoint로의 443 허용도 필요.

---

**문제 2.** 회사가 모든 prod 태그 EC2에 CloudWatch Agent 설정을 항상 일관되게 적용하고 신규 인스턴스도 자동 포함하려 한다. 적합한 도구는?

A) Run Command
B) State Manager Association (태그 기반 + 주기 점검 + drift 교정)
C) Maintenance Window
D) Lambda

**정답: B**
해설: 지속적 desired state + 신규 인스턴스 자동 포함 = State Manager. Run Command는 일회성, Maintenance Window는 스케줄만.

---

**문제 3.** 운영팀이 매주 일요일 새벽 안전한 시간대에 prod 인스턴스 패치를 자동 적용하려 한다. 구성은?

A) Cron job on EC2
B) Maintenance Window(cron) + Patch Baseline + Patch Group 태그 + AWS-RunPatchBaseline Task
C) Lambda + EventBridge
D) Run Command 수동

**정답: B**
해설: 표준 패치 자동화 조합. Baseline(정책) + Patch Group(분류) + Maintenance Window(언제·어떻게).

---

**문제 4.** 회사가 SSH 키 분배 부담을 없애고 모든 EC2 접속을 감사하고 싶다. 가장 좋은 방법은?

A) Bastion Host 운영
B) Session Manager - IAM 권한 + 자동 S3/Logs 감사 + 포트 22 불필요
C) VPN
D) Public IP에 SSH

**정답: B**
해설: Session Manager는 운영 보안 모범 사례. SSH 키 X, IAM 기반, 자동 감사, 포트 22 닫아도 됨. MFA 강제도 쉬움.

---

**문제 5.** Patch Group 태그가 설정됐는데 인스턴스에 패치가 적용 안 된다. 가장 흔한 이유는?

A) IAM Role
B) 태그 이름이 정확히 "Patch Group"(공백 포함)이 아님 (예: "PatchGroup")
C) Region
D) AMI

**정답: B**
해설: 시험 빈출 함정. SSM은 정확히 `Patch Group`(스페이스 포함)만 인식. PatchGroup, Patch_Group은 무시됨.

---

**문제 6.** 회사가 Config Rule로 S3 public 발견 시 자동 차단을 원한다. 어떤 SSM 기능이 트리거되나?

A) Run Command
B) Automation Runbook (`AWS-DisableS3BucketPublicReadWrite`)
C) Session Manager
D) Patch Manager

**정답: B**
해설: Config Auto Remediation의 표적은 SSM Automation Runbook. AWS 제공 표준 다수. IAM Role에 대상 리소스 수정 권한 필요.

---

**문제 7.** 회사가 1000개 EC2 인스턴스에 일회성 점검 명령을 실행하려 한다. 동시 폭주를 막고 5% 에러 시 중단하려면?

A) 1000개 한 번에 전송
B) Run Command `--max-concurrency 10%` + `--max-errors 5%`
C) Maintenance Window
D) State Manager

**정답: B**
해설: Run Command의 Concurrency·Error tolerance가 점진 배포 표준. 100대씩 실행, 50대 에러 시 자동 중단.

---

**문제 8.** Lambda 함수가 DB 자격증명을 사용해야 한다. 90일마다 자동 회전이 필요하다면?

A) Parameter Store SecureString
B) Secrets Manager - RDS 자동 회전 통합
C) Lambda 환경 변수에 박기
D) DynamoDB

**정답: B**
해설: Parameter Store는 자동 회전 X. Secrets Manager만 RDS와 통합되어 자동 회전. 단, 비용 더 높음($0.40/시크릿).

---

**문제 9.** 회사가 EC2 인스턴스에 설치된 모든 소프트웨어 패키지를 추적해 라이선스·취약점 관리를 하려 한다. 어떤 도구?

A) CloudWatch Agent
B) SSM Inventory + Resource Data Sync (S3 + Athena 또는 콘솔)
C) Trusted Advisor
D) Config

**정답: B**
해설: Inventory가 모든 Managed Instance의 설치된 SW·OS 정보 수집. Resource Data Sync로 S3 통합 후 SQL 분석.

---

**문제 10.** 운영팀이 Automation Runbook에 "운영자 승인" 단계를 넣어야 한다. 어떤 옵션?

A) Lambda 트리거
B) `aws:approve` action 단계 + Change Manager (정교한 승인 워크플로)
C) SNS만
D) 불가능

**정답: B**
해설: Automation에 `aws:approve` 단계로 승인자 명시 + SNS 통지. Change Manager는 더 정교한 RFC(Request for Change) 워크플로 제공.

---

## 🔮 다음 주 예고 (Week 6)

Week 6는 **IaC 운영** — CloudFormation 중심.

- Day 1: CloudFormation 기초 - Stack, Template, Resource
- Day 2: Change Set, Drift Detection, Rollback Trigger
- Day 3: Nested Stack, Cross-Stack Reference, StackSets
- Day 4: Service Catalog, AppConfig, AppRegistry
- Day 5: Week 6 복습 + 시나리오 10문제

> 💡 CloudOps 시험에서 CFn은 "배포·프로비저닝·자동화" 도메인의 핵심. 운영자 관점에서 Drift Detection, StackSets가 특히 중요.
