# Day 4 - 전체 모의고사 (50문항) + 약점 분석

📅 날짜: Week 12 (Day 4)
🎯 주제: SOA-C02 전 도메인 통합 모의고사 + 약점 진단
⏱️ 학습 시간: 약 120분 (시험 시뮬레이션)

---

## 🎯 학습 목표

- 6개 도메인 50문항을 시간 안에 풀어 본다
- 약점 도메인을 식별하고 D-7 학습 계획에 반영한다
- 정답·해설로 오답 패턴을 학습한다

---

## 🧩 응시 가이드

- **권장 시간**: 90분 (실제 시험 180분의 절반 페이스)
- **채점 기준**: 정답 / 50 × 100 (80% = 합격선 근처)
- **마킹법**: 헷갈리는 문항은 별표 (★) 후 나중에 재검토

---

## 📝 모의고사 50문항

### 도메인 1: 모니터링·로깅·수정 (10문항)

**문제 1.** EC2 메모리 사용률 메트릭 수집은?
A) 기본 메트릭에 포함
B) CloudWatch Agent 설치 필요
C) CloudTrail
D) Config

**정답: B**

---

**문제 2.** 여러 알람을 결합해 알람 폭주를 막는 기능은?
A) Anomaly Detection
B) Composite Alarm
C) Metric Math
D) Dashboard

**정답: B**

---

**문제 3.** API 호출 이력 추적 서비스는?
A) CloudWatch Logs
B) CloudTrail
C) VPC Flow Logs
D) Config

**정답: B**

---

**문제 4.** SG 변경 이력을 시간순으로 보려면?
A) CloudTrail
B) Config (구성 이력)
C) CloudWatch
D) VPC Flow Logs

**정답: B**
해설: CloudTrail은 API 호출, Config는 리소스 구성 변경 이력. 시간순 구성은 Config.

---

**문제 5.** Logs Insights에서 특정 에러 로그 개수 집계 쿼리는?
A) `count(*) by error`
B) `stats count(*) by @message`
C) `filter @message like /ERROR/ | stats count() as cnt by bin(5m)`
D) `select count(*)`

**정답: C**

---

**문제 6.** Config Rule이 비준수 리소스를 자동 수정하려면?
A) Lambda 직접 호출
B) Remediation Action (SSM Automation Document)
C) EventBridge
D) CloudFormation

**정답: B**

---

**문제 7.** 동적 임계 알람을 원할 때?
A) 표준 Alarm
B) Composite Alarm
C) Anomaly Detection (ML 학습 밴드)
D) Metric Filter

**정답: C**

---

**문제 8.** 멀티 계정 CloudWatch 대시보드 통합은?
A) 각 계정 별도
B) Cross-Account Observability (Source + Monitoring 계정)
C) CloudTrail
D) Config Aggregator

**정답: B**

---

**문제 9.** Log Group에서 ERROR 단어를 메트릭으로 변환하려면?
A) Subscription Filter
B) Metric Filter
C) Insights Query
D) EMF

**정답: B**

---

**문제 10.** CloudTrail Lake의 목적은?
A) 실시간 알림
B) Trail 데이터를 SQL로 검색 가능한 데이터 레이크에 장기 보존
C) Config 대체
D) Logs 대체

**정답: B**

---

### 도메인 2: 안정성·BCP (8문항)

**문제 11.** RDS Multi-AZ의 목적은?
A) 읽기 성능 향상
B) HA (자동 failover)
C) 백업
D) 비용 절감

**정답: B**

---

**문제 12.** RDS 읽기 성능 확장은?
A) Multi-AZ
B) Read Replica
C) Snapshot
D) RI

**정답: B**

---

**문제 13.** 리전 장애 대비 Aurora 글로벌 배포는?
A) Aurora Global Database
B) Multi-AZ
C) Cross-Region Snapshot
D) RDS Proxy

**정답: A**

---

**문제 14.** EBS 일일 자동 스냅샷 + 보존은?
A) AWS Backup
B) Data Lifecycle Manager (DLM)
C) CloudFormation
D) Snapshot 수동

**정답: B**
해설: DLM이 EBS 전용 자동 스냅샷. AWS Backup도 가능하지만 더 가벼운 방법은 DLM.

---

**문제 15.** RTO 분 단위 + 비용 적당한 DR 전략은?
A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**정답: B**
해설: 분 단위 = Pilot Light. Warm Standby는 분 이내 + 더 비쌈.

---

**문제 16.** S3 객체를 다른 리전에 자동 복제는?
A) S3 Lifecycle
B) Cross-Region Replication (CRR)
C) Snowball
D) Storage Gateway

**정답: B**

---

**문제 17.** Route 53 Active/Passive 라우팅 정책은?
A) Weighted
B) Failover (Primary + Secondary + Health Check)
C) Latency
D) Geolocation

**정답: B**

---

**문제 18.** AWS Backup Vault Lock의 목적은?
A) 비용 절감
B) 백업 삭제 방지 (WORM, 규제 요건)
C) 암호화
D) 압축

**정답: B**

---

### 도메인 3: 배포·자동화 (9문항)

**문제 19.** CloudFormation 변경 사전 검토는?
A) Drift Detection
B) Change Set
C) Rollback
D) Nested Stack

**정답: B**

---

**문제 20.** 멀티 계정/리전 IaC 일괄 배포는?
A) Nested Stack
B) StackSets
C) Cross-Stack Reference
D) Change Set

**정답: B**

---

**문제 21.** 다운타임 0 + 즉시 롤백 배포는?
A) All at once
B) Rolling
C) Blue/Green
D) In-place

**정답: C**

---

**문제 22.** SSM에서 EC2 OS 패치 자동화는?
A) Run Command 수동
B) Patch Manager + Maintenance Window
C) State Manager만
D) Automation만

**정답: B**

---

**문제 23.** EC2에 SSH 키 없이 안전 접속은?
A) Bastion
B) Session Manager
C) VPN
D) Direct Connect

**정답: B**

---

**문제 24.** DB 패스워드 자동 회전은?
A) Parameter Store SecureString
B) Secrets Manager + Lambda Rotation
C) KMS만
D) IAM

**정답: B**

---

**문제 25.** CFN 템플릿과 실제 차이 탐지는?
A) Change Set
B) Drift Detection
C) Rollback Trigger
D) Nested Stack

**정답: B**

---

**문제 26.** 사용자가 승인된 IaC를 셀프서비스로 배포하려면?
A) CloudFormation 콘솔만
B) Service Catalog
C) Proton
D) Beanstalk

**정답: B**

---

**문제 27.** 100대 EC2에 즉시 명령 실행은?
A) Run Command
B) State Manager
C) Patch Manager
D) Maintenance Window

**정답: A**

---

### 도메인 4: 보안·컴플라이언스 (8문항)

**문제 28.** Org 단위 권한 가드레일은?
A) IAM Policy
B) Permission Boundary
C) SCP
D) Identity Center

**정답: C**

---

**문제 29.** IAM 엔티티의 최대 권한 상한 설정은?
A) SCP
B) Permission Boundary
C) Resource Policy
D) Session Policy

**정답: B**

---

**문제 30.** S3 PII 자동 탐지는?
A) Inspector
B) Macie
C) GuardDuty
D) Security Hub

**정답: B**

---

**문제 31.** EC2/ECR 취약점 스캔은?
A) GuardDuty
B) Inspector
C) Macie
D) Detective

**정답: B**

---

**문제 32.** VPC Flow Logs + DNS + CloudTrail 기반 위협 탐지는?
A) Macie
B) GuardDuty
C) Inspector
D) Config

**정답: B**

---

**문제 33.** 여러 보안 서비스 finding 통합 대시보드는?
A) GuardDuty
B) Security Hub
C) Detective
D) Config

**정답: B**

---

**문제 34.** 외부에 노출된 IAM 정책 자동 탐지는?
A) IAM Access Analyzer
B) GuardDuty
C) Config
D) Trusted Advisor

**정답: A**

---

**문제 35.** PCI-DSS 컴플라이언스 보고서 자동화는?
A) Security Hub
B) Audit Manager
C) Artifact
D) Config

**정답: B**

---

### 도메인 5: 네트워킹·콘텐츠 전송 (9문항)

**문제 36.** SG의 특징은?
A) Stateless
B) Stateful (응답 자동 허용)
C) 서브넷 단위
D) Deny 규칙 지원

**정답: B**

---

**문제 37.** S3 / DynamoDB만 사설로 연결하는 무료 옵션은?
A) Interface Endpoint
B) Gateway Endpoint
C) PrivateLink
D) NAT Gateway

**정답: B**

---

**문제 38.** 두 리소스 간 네트워크 경로 정적 분석은?
A) VPC Flow Logs
B) Reachability Analyzer
C) Traffic Mirroring
D) Network Access Analyzer

**정답: B**

---

**문제 39.** UDP 게임 트래픽 글로벌 가속은?
A) CloudFront
B) Global Accelerator
C) Route 53
D) ALB

**정답: B**

---

**문제 40.** CloudFront에서 S3 직접 접근 차단 표준은?
A) OAI (구식)
B) OAC (Origin Access Control)
C) Signed URL만
D) Bucket Policy만

**정답: B**

---

**문제 41.** 멀티 VPC 허브 연결은?
A) VPC Peering
B) Transit Gateway
C) Direct Connect
D) VPN

**정답: B**

---

**문제 42.** 가장 가까운 리전으로 라우팅은?
A) Failover
B) Latency-based Routing
C) Weighted
D) Simple

**정답: B**

---

**문제 43.** VPC Flow Logs의 한계는?
A) 허용/거부 트래픽 메타데이터만, 패킷 페이로드는 X
B) 모든 패킷 캡처
C) IPv6 미지원
D) 실시간 불가

**정답: A**
해설: 페이로드까지 보려면 Traffic Mirroring.

---

**문제 44.** Direct Connect의 백업으로 흔히 사용하는 것은?
A) 또 다른 DX
B) Site-to-Site VPN
C) NAT
D) TGW

**정답: B**

---

### 도메인 6: 비용·성능 최적화 (6문항)

**문제 45.** EC2/Fargate/Lambda 모두 적용되는 가장 유연한 약정은?
A) Standard RI
B) Compute Savings Plans
C) EC2 Instance SP
D) Convertible RI

**정답: B**

---

**문제 46.** Spot 회수 2분 알림 처리는?
A) Cron
B) EventBridge → Lambda / Lifecycle Hook
C) CloudWatch Alarm
D) SQS 폴링

**정답: B**

---

**문제 47.** EC2/EBS/Lambda Right Sizing 권장은?
A) Trusted Advisor만
B) Compute Optimizer
C) Cost Explorer
D) Budgets

**정답: B**

---

**문제 48.** 비용 이상치 ML 자동 탐지는?
A) Budgets
B) Cost Anomaly Detection
C) Trusted Advisor
D) CloudWatch Alarm

**정답: B**

---

**문제 49.** 신규 인스턴스 타입 용량 보장 (할인 X)은?
A) Standard RI
B) EC2 Capacity Reservation
C) Spot
D) Compute SP

**정답: B**

---

**문제 50.** 예산 임계 도달 시 자동으로 EC2 stop 또는 SCP 부착은?
A) Cost Anomaly Detection
B) Budgets + Budget Action
C) CloudWatch Alarm
D) Trusted Advisor

**정답: B**

---

## 📊 채점 & 약점 분석

### 도메인별 정답률 기록

| 도메인 | 문항 수 | 정답 수 | 정답률 | 비중 가중치 |
|--------|---------|---------|--------|-------------|
| 도메인 1 (모니터링·로깅) | 10 | __/10 | __ % | 20% |
| 도메인 2 (안정성·BCP) | 8 | __/8 | __ % | 16% |
| 도메인 3 (배포·자동화) | 9 | __/9 | __ % | 18% |
| 도메인 4 (보안·컴플라이언스) | 8 | __/8 | __ % | 16% |
| 도메인 5 (네트워킹) | 9 | __/9 | __ % | 18% |
| 도메인 6 (비용·성능) | 6 | __/6 | __ % | 12% |
| **합계** | **50** | **__/50** | **__ %** | 100% |

### 점수대별 진단

| 정답률 | 진단 | 처방 |
|--------|------|------|
| ≥ 90% | 합격 안정권 | 시간 관리 + 함정 문제만 복습 |
| 80-89% | 합격선 | 약점 도메인 day.md 재정독 |
| 70-79% | 위험 | 약점 2개 도메인 집중 복습 + 추가 문제 |
| < 70% | 부족 | week1~12 핵심 포인트만 빠르게 회독 |

### 약점 도메인별 처방

- **도메인 1 부족** → Week 2·3·4 day.md 재정독, CloudWatch + CloudTrail + Config 차이 정리
- **도메인 2 부족** → Week 10 day.md, RDS Multi-AZ vs Read Replica vs Aurora Global 표 암기
- **도메인 3 부족** → Week 5·6·7 day.md, SSM 6대 컴포넌트 + 배포 정책 5종 암기
- **도메인 4 부족** → Week 1·9 day.md, IAM 평가 순서 + 보안 서비스 5종 매핑
- **도메인 5 부족** → Week 8 day.md, SG/NACL/Endpoint/TGW/Route 53 정책 표 암기
- **도메인 6 부족** → Week 11 day.md, SP/RI/Spot/Capacity Reservation 의사결정 트리

---

## 📌 오늘의 요약

1. 모의고사 결과는 **도메인별 정답률**로 봐야 진짜 약점이 보인다
2. **80% 이상이면 시험 응시 가능 수준**. 미만이면 약점 day.md 재정독
3. 자주 틀리는 키워드: **SG vs NACL**, **CloudTrail vs Config**, **SP vs RI**
4. **시나리오 키워드**: "비용 효율", "운영 부하 최소", "자동 복구", "감사 요건" → 정답 단서
5. 내일(Day 5) D-Day 체크리스트 + 짧은 모의고사 20문항으로 마무리
