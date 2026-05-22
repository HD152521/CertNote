# Day 45 - Week 9 복습 + 시나리오 문제 10

📅 날짜: Week 9 (Day 5)
🎯 주제: 모니터링·운영 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- "누가·언제·무엇·왜" 4가지 질문에 대응 서비스를 매핑한다
- 알람·자동 대응·트레이싱 패턴을 그릴 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **SLI/SLO/SLA**: 지표·목표·합의. CW + X-Ray가 SLI 수집.

---

## 📖 한 주 핵심 정리

1. **CloudWatch**: 메트릭·알람·로그·Insights.
2. **CloudTrail**: API 감사. Org Trail / Data Events / Lake.
3. **Config**: 구성 상태 + Rule + 자동 교정.
4. **SSM**: Session/Patch/Run/State/Window/Parameter/Inventory.
5. **X-Ray**: 분산 트레이싱.
6. **Trusted Advisor**: 5대 권고.
7. **Health Dashboard**: AWS 측 이벤트.

### 헷갈리기 쉬운 비교표

| 질문 | 도구 |
|------|------|
| **누가 변경했나** | CloudTrail |
| **지금 상태/규칙 준수** | Config |
| **트래픽 흐름** | VPC Flow Logs |
| **분산 호출 지연** | X-Ray |
| **AWS 측 사고** | Health Dashboard |
| **모범 사례 권고** | Trusted Advisor / Compute Optimizer |

---

## 🏗️ 한 주 통합 아키텍처

```
[ 통합 관찰성/거버넌스 ]

  EC2/Lambda/Container → CloudWatch (Metrics/Logs/Insights)
                       → X-Ray (Trace)
  API → CloudTrail → S3 (Object Lock) + Logs + Lake
  Resource Change → Config → Rule 위반 → SSM Automation 교정
  AWS Events → Health Dashboard → EventBridge → SNS
  TA + Compute Optimizer → 비용·보안 권고
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** 누가 보안 그룹을 0.0.0.0/0로 열었는가:

A) Config B) CloudTrail C) Flow Logs D) X-Ray

**정답: B**.

---

**문제 2.** 현재 모든 S3 버킷이 BPA 활성인지 점검:

A) CloudTrail B) Config Rule C) Inspector D) Macie

**정답: B**.

---

**문제 3.** Lambda → DDB → API의 지연 원인:

A) CW Metrics B) X-Ray C) TA D) Logs Insights

**정답: B**.

---

**문제 4.** SSH 키 없이 셸 접속:

A) Bastion B) Session Manager C) EC2 Connect만 D) VPN

**정답: B**.

---

**문제 5.** 100대 EC2 패치 자동:

A) UserData B) Patch Manager + Maintenance Window C) ASG Refresh D) Lambda

**정답: B**.

---

**문제 6.** 멀티 계정 통합 감사:

A) Org Trail B) Config Aggregator C) Security Hub D) 전부 (조합)

**정답: D** — Org Trail + Aggregator + SH 모두 멀티 계정 패턴.

---

**문제 7.** 점검 시간대 AWS 측 이벤트 알림:

A) GuardDuty B) Health Dashboard + EventBridge C) Trusted Advisor D) Inspector

**정답: B**.

---

**문제 8.** Service Quota 임박 알림:

A) Trusted Advisor + EventBridge B) IAM 정책 C) Macie D) Config

**정답: A**.

---

**문제 9.** EC2 메모리 메트릭:

A) 표준 B) CW Agent 설치 + 사용자 정의 메트릭 C) X-Ray D) Inspector

**정답: B**.

---

**문제 10.** Config 위반 → 자동 수정:

A) Lambda 단독 B) SSM Automation Runbook + EventBridge C) Step Functions D) Inspector

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. 관찰성 + 거버넌스의 핵심 서비스 매핑이 보안 도메인의 두 번째 축.
2. 다음 주: **비용 최적화** — 도메인 4(20%).
