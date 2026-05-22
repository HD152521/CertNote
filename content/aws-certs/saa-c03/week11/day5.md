# Day 55 - Week 11 복습 + 시나리오 문제 10

📅 날짜: Week 11 (Day 5)
🎯 주제: HA / DR / 마이그레이션 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 복원력·DR·마이그레이션 시나리오 키워드 매핑이 자동으로 나온다

---

## 🧩 사전 지식 (CS 기초)

- **재해(Disaster)의 범위**: 단일 AZ, 단일 리전, 글로벌. 설계는 가장 큰 범위까지 견디게.

---

## 📖 한 주 핵심 정리

1. Multi-AZ(HA) vs Multi-Region(DR).
2. 4단계 DR: Backup-Restore / Pilot Light / Warm Standby / Active-Active.
3. Route 53 7가지 정책 + Health Check + ARC.
4. DB=DMS(+SCT), 서버=MGN, 파일=DataSync/Snow.
5. AWS Backup / DRS / Resilience Hub로 거버넌스.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **Multi-AZ vs Multi-Region** | HA | DR |
| **Aurora Global vs Cross-region RR** | 1초·5리전 | 비동기 |
| **DMS vs MGN** | DB | 서버 |
| **DataSync vs Storage Gateway** | 마이그/복제 | 영구 하이브리드 |
| **DRS vs MGN** | DR | 마이그 |

---

## 🏗️ 한 주 통합 아키텍처

```
[ DR + 마이그 통합 ]

  Region A (Prod)
   └─ ALB → ECS → Aurora Global Writer
   └─ S3 (CRR ▶ Region B)

  Region B (DR Warm Standby)
   └─ ALB scale=2 → ECS scale=0 (자동 Up)
   └─ Aurora Global Reader (승격 가능)

  Route 53
   ├─ Failover → Primary A
   └─ Failover → Secondary B (Health Check)

  Migration:
   온프레 DB → DMS → Aurora
   온프레 VM → MGN → EC2
   온프레 파일 → DataSync → S3
   페타바이트 오프라인 → Snowball Edge Cluster
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** 리전 장애 시 RTO 30초:

A) Backup-Restore B) Pilot Light C) Warm Standby D) Active-Active (Aurora Global + Route 53 Failover)

**정답: D**.

---

**문제 2.** Oracle → Aurora PG 다운타임 최소:

A) DMS + SCT B) Snow C) DataSync D) MGN

**정답: A**.

---

**문제 3.** 200대 VM lift-and-shift:

A) MGN B) DMS C) DataSync D) Snow

**정답: A**.

---

**문제 4.** 100TB + 네트워크 부족:

A) DataSync B) DMS C) Snowball Edge D) MGN

**정답: C**.

---

**문제 5.** 루트 도메인 → CloudFront:

A) CNAME B) Alias C) A 레코드 D) NS

**정답: B**.

---

**문제 6.** 글로벌 사용자에게 가장 빠른 리전:

A) Geo B) Latency C) Weighted D) Failover

**정답: B**.

---

**문제 7.** Backup Vault WORM:

A) IAM 정책 B) Backup Vault Lock C) BPA D) MFA Delete

**정답: B**.

---

**문제 8.** 5개 리전 NoSQL 액티브-액티브:

A) Aurora Global B) DDB Global Tables C) RDS CR Replica D) DocumentDB

**정답: B**.

---

**문제 9.** 회사 비용 ↓ DR (앱 OFF·DB 복제):

A) Backup-Restore B) Pilot Light C) Warm Standby D) Active-Active

**정답: B**.

---

**문제 10.** 명시적 리전 페일오버 제어 도구:

A) Failover Policy 단독 B) Route 53 ARC C) GuardDuty D) Inspector

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. 복원력·DR·마이그 시나리오 매핑이 SAA 도메인 2의 큰 부분.
2. 다음 주: **최종 복습 + 모의고사 + 시험 D-Day 체크리스트**.
