# Day 60 - Week 12 복습 + 시나리오 10문항

📅 Week 12 (Day 5)
🎯 주제: 비용 최적화 종합
⏱️ 약 90분

---

## 📌 한 페이지 요약

### 약정 할인
- **Compute SP**: EC2·Fargate·Lambda 통합 (유연)
- **EC2 Instance SP**: family·region 고정 (최대 할인)
- **Standard RI**: 가장 큰 RI 할인 (family·OS 고정)
- **Convertible RI**: family·OS 변경 가능
- **Zonal RI**: 용량 보장 + 할인
- 적용 순서: RI → SP → On-Demand

### Spot
- 최대 90% 할인 + 2분 알림
- 중단 OK 워크로드 (배치·CI·Spark·렌더링)

### 권고·분석
- **Compute Optimizer**: EC2·ASG·EBS·Lambda·ECS·RDS
- **Trusted Advisor**: 5 카테고리 (Business+ 지원)
- **Cost Explorer**: 시각화·Forecast·Rightsizing
- **Budgets**: 알림 + Action(자동 중지·SCP)
- **CUR**: 시간 단위 상세 → Athena·QuickSight
- **Cost Anomaly Detection**: ML 이상

### 숨은 비용
- NAT GW = 시간 + 처리량 (S3·DDB Gateway Endpoint로 우회)
- AZ 간 트래픽 과금
- Internet Egress = CloudFront로 절감
- Storage Class·Lifecycle·Incomplete MPU 정리

---

## 📝 시나리오 10문항

**문제 1.** EC2 + Fargate + Lambda 통합 할인 + 인스턴스 family 자유.

A) Standard RI
B) EC2 Instance SP
C) Compute Savings Plans
D) Spot

**정답: C**

---

**문제 2.** 24시간 가동되는 m6i family·특정 리전 — 최대 할인.

A) Compute SP
B) EC2 Instance SP (또는 Standard RI)
C) Convertible RI
D) On-Demand

**정답: B**

---

**문제 3.** 5분 단위 데이터 처리·중단 허용 배치.

A) On-Demand
B) Reserved
C) Spot
D) SP

**정답: C**

---

**문제 4.** Private Lambda → S3 — NAT 비용 0.

A) Interface Endpoint
B) S3 Gateway Endpoint
C) NAT GW 유지
D) Internet GW

**정답: B**

---

**문제 5.** S3 액세스 패턴 모름·자동 최적화.

A) Standard
B) Intelligent-Tiering
C) Glacier
D) IA

**정답: B**

---

**문제 6.** 월 예산 초과 시 EC2 자동 중지.

A) Lambda 스케줄
B) Budgets Action
C) Config Remediation
D) SCP만

**정답: B**

---

**문제 7.** EBS 권고 (gp2→gp3·IOPS).

A) Trusted Advisor
B) Compute Optimizer
C) Storage Lens
D) Cost Explorer

**정답: B**

---

**문제 8.** 시간 단위 모든 청구 항목 SQL 분석.

A) Cost Explorer
B) CUR + Athena
C) Budgets
D) Trusted Advisor

**정답: B**

---

**문제 9.** Lambda 메모리 추천.

A) Compute Optimizer
B) X-Ray
C) CloudWatch Insights
D) Trusted Advisor

**정답: A**

---

**문제 10.** 글로벌 사용자 대상 정적 콘텐츠 비용 ↓.

A) S3 공개
B) CloudFront + S3 (Origin Shield)
C) Transfer Acceleration
D) Global Accelerator

**정답: B**

---

## 📌 Week 12 한 줄 정리

> "SP·RI·Spot로 약정·즉시 할인, Compute Optimizer·CE·Budgets·CUR로 가시화·자동화, NAT/Storage Class/Transfer로 숨은 비용 잡기."

---

## 🎯 다음 주 (Week 13) 예고

Well-Architected Framework 6 기둥 — 운영 우수성·보안·안정성·성능·비용·지속 가능성.
