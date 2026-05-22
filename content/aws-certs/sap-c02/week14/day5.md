# Day 70 - Week 14 복습 + 시나리오 10문항

📅 Week 14 (Day 5)
🎯 주제: 복원력·DR 종합
⏱️ 약 90분

---

## 📌 한 페이지 요약

### DR 4전략
| 전략 | RTO | RPO | 비용 |
|------|-----|-----|------|
| Backup & Restore | 시간~일 | 시간 | ★ |
| Pilot Light | 10분~ | 분 | ★★ |
| Warm Standby | 분~수십분 | 초~분 | ★★★ |
| Multi-Site | 0~수초 | 0~수초 | ★★★★ |

### 백업·복원
- AWS Backup = 중앙
- Vault Lock Compliance = WORM
- Cross-Region·Account Copy
- Backup Audit Manager 준수 평가

### 검증
- Resilience Hub = RTO/RPO 격차·권고
- FIS = 카오스·Stop Condition
- DRS = 지속 DR / MGN = 마이그레이션
- Route 53 ARC + Zonal Shift

### 데이터 DR
- RDS Multi-AZ Cluster (35초 Failover)
- Aurora Global (RPO<1s, RTO<1min, 최대 5 리전)
- DDB Global Tables Active-Active
- Redis Global Datastore
- S3 MRAP·CRR·RTC

---

## 📝 시나리오 10문항

**문제 1.** RTO 5분·RPO 1초·글로벌 SQL DB.

A) RDS Multi-AZ
B) Aurora Global Database
C) DMS
D) Read Replica

**정답: B**

---

**문제 2.** 운영 중 의도적 장애 + 알람 시 자동 중단.

A) Lambda 수동
B) FIS + Stop Condition
C) Trusted Advisor
D) Resilience Hub

**정답: B**

---

**문제 3.** 규제: 백업 7년·즉시 변경 불가.

A) S3 Glacier
B) Backup Vault Compliance Lock
C) Vault Governance
D) Object Lock Governance

**정답: B** — Vault Compliance Lock

---

**문제 4.** 양 리전 모두 쓰기 가능 DB.

A) Aurora Global (Read-Only Secondary)
B) DDB Global Tables
C) RDS Read Replica
D) DocumentDB

**정답: B**

---

**문제 5.** 문제 AZ만 즉시 트래픽 제외.

A) NACL
B) Route 53 ARC Zonal Shift
C) ASG Detach
D) ALB Drain

**정답: B**

---

**문제 6.** 온프레 → AWS 지속적 DR.

A) MGN
B) DRS
C) DataSync
D) Snowball

**정답: B**

---

**문제 7.** RDS Failover 30초.

A) Multi-AZ Instance
B) Multi-AZ Cluster
C) Read Replica
D) Snapshot

**정답: B**

---

**문제 8.** DR 격차 자동 식별·권고.

A) Trusted Advisor
B) Resilience Hub
C) WA Tool
D) Config

**정답: B**

---

**문제 9.** S3 다중 리전 + 단일 엔드포인트.

A) CloudFront
B) MRAP
C) Global Accelerator
D) Route 53

**정답: B**

---

**문제 10.** 사람의 의도적 의사결정 Failover.

A) Route 53 ARC Routing Control
B) Health Check 자동
C) Lambda
D) Global Accelerator

**정답: A**

---

## 📌 Week 14 한 줄 정리

> "DR 4전략 RTO/RPO 매핑, AWS Backup·Vault Lock, Resilience Hub·FIS·DRS·ARC. 데이터는 Aurora Global·DDB Global·Redis Global Datastore."

---

## 🎯 다음 주 (Week 15) 예고

종합 시나리오 — 대기업·스타트업·금융·미디어·정부/헬스케어.
