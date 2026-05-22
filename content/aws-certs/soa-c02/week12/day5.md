# Day 5 - D-Day 체크리스트 + 마무리

📅 날짜: Week 12 (Day 5) - 최종일
🎯 주제: 시험 당일 체크리스트 + 오답노트 + 짧은 모의고사 20문항
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 시험 당일까지의 D-7 / D-1 / D-Day 체크리스트를 점검한다
- 오답노트 양식으로 약점을 마지막으로 정리한다
- 짧은 모의고사 20문항으로 컨디션 조정

---

## 🧩 사전 지식 (시험 운영)

- **Pearson VUE / PSI**: AWS 시험 벤더 (선택 가능)
- **Onsite vs OnVUE/Online**: 시험장 vs 자택 응시 (웹캠 + 감독)
- **180분 / 65문항**: 약 2분 45초/문항
- **합격선**: 720/1000

---

## 📖 이론 내용

### 1. D-7 ~ D-Day 체크리스트

#### D-7 (시험 1주일 전)

- [ ] Week 12 Day 1·2·3 도메인 복습 재정독
- [ ] Day 4 모의고사 약점 도메인 day.md 다시 보기
- [ ] AWS 공식 Exam Guide PDF 한 번 통독
- [ ] 시험 예약 확인 (날짜·시간·언어)
- [ ] 시험장(또는 OnVUE) 환경 점검

#### D-3 (시험 3일 전)

- [ ] 핵심 매핑 표 (키워드 → 정답 서비스) 암기 점검
- [ ] 헷갈리는 쌍 정리: SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica
- [ ] 모의고사 오답만 다시 풀기
- [ ] 영어 응시면 영어 시험 용어 친숙도 점검 (한국어 응시 권장)

#### D-1 (시험 전날)

- [ ] **새로운 학습 X** — 기존 핵심 포인트만 가볍게 회독
- [ ] 신분증 2개 준비 (한국 시험장 기준: 주민등록증/운전면허/여권 등)
- [ ] OnVUE면: 웹캠/마이크/네트워크/조용한 공간 확보
- [ ] 충분한 수면 (7-8시간)

#### D-Day (시험 당일)

- [ ] 30분 전 도착 (시험장) / 15분 전 OnVUE 체크인
- [ ] 가벼운 식사 + 카페인 적정량
- [ ] 시험 시작 → **첫 10문항은 페이스 잡기**
- [ ] 헷갈리는 문항은 **Flag 후 다음으로** (Review 단계에서 재검토)
- [ ] **마지막 10분 Review** — 빈 답안 없는지 확인

### 2. 시험 응시 전략

#### 시간 배분

| 단계 | 시간 | 작업 |
|------|------|------|
| 1st pass | 100분 | 65문항 한 번 다 풀기 (헷갈리면 Flag) |
| Review | 60분 | Flag된 문항 재검토 |
| Final check | 20분 | 빈 답 없는지 / 마지막 검토 |

#### 문제 풀이 5단계

1. **질문 끝까지 읽기** — "MOST cost-effective", "LEAST operational overhead" 등 한정어가 정답 단서
2. **시나리오 키워드 캐치** — "자동", "감사", "비용 효율", "운영 부하 최소"
3. **틀린 보기 먼저 제거** — 4지선다는 보통 2개가 명백히 틀림
4. **남은 2개에서 더 정확한 답 선택** — "단어 하나" 차이가 정답
5. **확신 없으면 Flag** — 시간 낭비 금지

#### 자주 나오는 한정어 ↔ 정답 패턴

| 한정어 | 자주 나오는 정답 키워드 |
|--------|-------------------------|
| "MOST cost-effective" | Compute SP / Gateway Endpoint / S3 Intelligent-Tiering |
| "LEAST operational overhead" | Managed Service (Backup / Secrets Manager / Session Manager) |
| "automatically" | Auto Scaling / DLM / Lifecycle Policy |
| "highly available" | Multi-AZ / Multi-Region / Route 53 Failover |
| "auditable" | CloudTrail / Config / Audit Manager |
| "fastest recovery" | Multi-Site / Aurora Global / Pilot Light → Warm |

### 3. 오답노트 양식

각 오답을 아래 양식으로 1장씩 정리하면 가장 효과적.

```
[오답노트 #N]
=====================================
📅 작성일: YYYY-MM-DD
📚 출제 도메인: 도메인 X (XX%)
🎯 출제 영역: <예: CloudWatch Composite Alarm>

📝 문제 요약
<핵심 시나리오 1-2줄>

❌ 내가 고른 답: <보기>
✅ 정답: <보기>

🔍 왜 틀렸는가?
- <오답 사유: 키워드 놓침 / 서비스 혼동 / 함정>

💡 핵심 학습
- <한 줄로 기억할 패턴>

🔗 관련 day.md
- weekN/dayM.md - 섹션
=====================================
```

### 4. 최종 암기 카드 (시험 직전 5분 회독용)

#### 모니터링·로깅

- 메모리/디스크 메트릭 = **CloudWatch Agent**
- API 이력 = **CloudTrail**, 구성 이력 = **Config**
- 알람 통합 = **Composite Alarm**
- 동적 임계 = **Anomaly Detection**

#### 안정성·BCP

- HA = **Multi-AZ**, 읽기 확장 = **Read Replica**, 글로벌 = **Aurora Global DB**
- DR 4종 = Backup&Restore / Pilot Light / Warm Standby / Multi-Site
- 객체 보존 = **S3 Object Lock**, 백업 보존 = **Backup Vault Lock**

#### 배포·자동화

- 멀티 계정 IaC = **StackSets**
- 즉시 롤백 = **Blue/Green**
- 패치 = **Patch Manager + MW**
- 접속 = **Session Manager**
- DB 비밀 = **Secrets Manager**

#### 보안

- Org 가드레일 = **SCP**
- 권한 상한 = **Permission Boundary**
- 위협 탐지 = **GuardDuty**
- 취약점 = **Inspector**
- S3 PII = **Macie**
- 통합 = **Security Hub**

#### 네트워킹

- SG = Stateful, NACL = Stateless
- S3/DDB = **Gateway Endpoint** (무료)
- 경로 분석 = **Reachability Analyzer**
- UDP 가속 = **Global Accelerator**

#### 비용·성능

- Right Sizing = **Compute Optimizer**
- 가장 유연 약정 = **Compute SP**
- 90% 할인 = **Spot**
- 용량 보장 = **Capacity Reservation**
- 이상 탐지 = **Cost Anomaly Detection**

---

## 🏗️ 시험 당일 흐름 다이어그램

```
시험 당일 타임라인
==========================================================

  -30분  ──► 시험장 도착 / OnVUE 체크인
            신분증 + 보관함

  -15분  ──► NDA + 튜토리얼
            화면 / 마우스 / 키보드 점검

   0분  ──► 시험 시작 (180분)
            │
   100분 ──► 1st pass 완료 (65문항)
            │  Flag된 문항 표시
   160분 ──► Review 완료
            │
   180분 ──► 종료 / 즉시 점수 (Pass/Fail)

  종료 후 ► AWS 공식 결과 메일 (24-48시간 내 상세 점수)
            합격 시 Credly 디지털 배지
```

---

## ⭐ 최종 핵심 포인트 (시험 직전 한 번 더)

1. ⭐ **CloudWatch + SSM이 전체의 30%** — 두 서비스 깊이 파면 합격선 근접
2. ⭐ **시나리오 한정어**가 정답 단서: "MOST cost-effective", "LEAST overhead"
3. ⭐ **헷갈리는 쌍** 마지막 점검: SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica
4. ⭐ **시간 관리**: 65문항 / 180분 = 약 2분 45초. 헷갈리면 Flag 후 다음
5. ⭐ **D-1은 새로운 공부 X**, 핵심 카드만 가볍게 회독 + 충분한 수면

---

## 💻 시험 직전 점검용 CLI 한눈에 (실습 환경)

```bash
# 빠른 환경 점검 (계정/리전/Identity)
aws sts get-caller-identity
aws ec2 describe-regions --query 'Regions[*].RegionName' --output table

# 핵심 서비스 헬스
aws health describe-events --max-results 5

# 본인 계정의 핵심 리소스 현황
aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name]' --output table
aws rds describe-db-instances --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus,MultiAZ]'

# 비용 빠른 점검
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY --metrics UnblendedCost
```

---

## 📝 짧은 모의고사 20문항 (컨디션 조정용)

**문제 1.** SSM에서 EC2에 SSH 키 없이 접속하는 기능은?
A) Run Command  B) Session Manager  C) Patch Manager  D) State Manager
**정답: B**

---

**문제 2.** CloudFront에서 S3 origin 보호 표준은?
A) OAI (구식)  B) OAC  C) Signed URL  D) Bucket Policy
**정답: B**

---

**문제 3.** Org 단위 권한 가드레일은?
A) IAM Policy  B) SCP  C) Permission Boundary  D) Identity Center
**정답: B**

---

**문제 4.** EC2 + Fargate + Lambda 통합 약정은?
A) Standard RI  B) EC2 Instance SP  C) Compute Savings Plans  D) Convertible RI
**정답: C**

---

**문제 5.** 두 리소스 간 경로 정적 분석은?
A) VPC Flow Logs  B) Reachability Analyzer  C) Traffic Mirroring  D) Ping
**정답: B**

---

**문제 6.** 다운타임 0 + 즉시 롤백 배포는?
A) Rolling  B) All at once  C) Blue/Green  D) In-place
**정답: C**

---

**문제 7.** S3 PII 자동 탐지는?
A) Inspector  B) GuardDuty  C) Macie  D) Detective
**정답: C**

---

**문제 8.** 멀티 계정 IaC 배포는?
A) Nested Stack  B) StackSets  C) Change Set  D) Drift Detection
**정답: B**

---

**문제 9.** 동적 임계 알람은?
A) Composite  B) Anomaly Detection  C) Standard  D) Metric Math
**정답: B**

---

**문제 10.** Spot 회수 2분 알림 수신은?
A) CloudWatch Alarm  B) EventBridge (EC2 Spot Instance Interruption Warning)  C) Cron  D) SQS
**정답: B**

---

**문제 11.** RDS PostgreSQL 약정 할인은?
A) Compute SP  B) EC2 Instance SP  C) Reserved Instances (RDS RI)  D) Spot
**정답: C**

---

**문제 12.** 리전 장애 대비 RDS는?
A) Multi-AZ  B) Cross-Region Read Replica / Aurora Global DB  C) Snapshot  D) Backup
**정답: B**

---

**문제 13.** SG의 특징은?
A) Stateless  B) Stateful  C) 서브넷 단위  D) Deny 규칙
**정답: B**

---

**문제 14.** S3 / DynamoDB만 무료 사설 연결은?
A) Interface Endpoint  B) Gateway Endpoint  C) PrivateLink  D) NAT
**정답: B**

---

**문제 15.** Right Sizing 권장 도구는?
A) Trusted Advisor만  B) Compute Optimizer  C) Cost Explorer  D) Budgets
**정답: B**

---

**문제 16.** Config Rule 자동 수정 메커니즘은?
A) Lambda 직접  B) SSM Automation Remediation  C) EventBridge  D) CloudFormation
**정답: B**

---

**문제 17.** UDP 게임 글로벌 가속은?
A) CloudFront  B) Global Accelerator  C) Route 53 Latency  D) ALB
**정답: B**

---

**문제 18.** DB 패스워드 자동 회전은?
A) Parameter Store SecureString  B) Secrets Manager + Lambda  C) KMS  D) IAM
**정답: B**

---

**문제 19.** 비용 임계 도달 시 자동 차단은?
A) Cost Anomaly Detection  B) Budgets + Budget Action  C) CloudWatch Alarm  D) Trusted Advisor
**정답: B**

---

**문제 20.** 컴플라이언스 보고서 자동화 (PCI/SOC/HIPAA)는?
A) Security Hub  B) Audit Manager  C) Config  D) Artifact
**정답: B**

---

## 📌 최종 요약 & 응원

1. **12주 학습 완주를 축하합니다** — 출퇴근 + 주말 꾸준함이 가장 큰 자산
2. **CloudOps는 "운영자 관점"의 시험** — 어떤 장애에 어떻게 대응할 것인가
3. **헷갈리는 쌍 한 번 더**: SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica
4. **시간 관리 + Flag 전략**으로 침착하게 풀어 갈 것
5. **D-1엔 새 공부 X**, 푹 자고 시험 당일은 가벼운 컨디션으로

> 🏆 **합격을 기원합니다. 12주간 정말 수고 많으셨습니다. Fighting!**
