# Day 66 - DR 4가지 전략과 RTO/RPO 매핑

📅 Week 14 (Day 1)
🎯 주제: 재해 복구 전략
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- DR 4전략 (Backup·Pilot Light·Warm Standby·Multi-Site)
- 각 전략의 RTO/RPO·비용 트레이드오프
- DR 사이트 데이터 동기화 패턴

---

## 🧩 사전 지식 (CS 기초)

- **RTO** (Recovery Time Objective): 얼마 만에 복구하나
- **RPO** (Recovery Point Objective): 얼마만큼 데이터 손실 허용
- **Failover**: 주->보조 전환
- **Failback**: 보조->주 복귀

---

## 📖 이론 내용

### 1. 4가지 전략

| 전략 | RTO | RPO | 비용 | 특징 |
|------|-----|-----|------|------|
| **Backup & Restore** | 시간~일 | 시간 | ★ | 백업만 (가장 저렴) |
| **Pilot Light** | 10분~수시간 | 분 | ★★ | 핵심만 가동·데이터 복제 |
| **Warm Standby** | 분~수십분 | 초~분 | ★★★ | 축소판 풀가동 |
| **Multi-Site Active-Active** | 0~수초 | 0~수초 | ★★★★ | 양쪽 풀가동·동시 트래픽 |

### 2. Backup & Restore

- AWS Backup·EBS Snapshot·RDS Snapshot·S3 CRR
- IaC(CFN)로 인프라 즉시 재현
- DR 비용 최소

### 3. Pilot Light

- 데이터는 지속 복제(RDS·Aurora·DDB Streams), 컴퓨트는 정지·축소
- 장애 시 인프라 자동 확장 + DNS 전환

### 4. Warm Standby

- 축소 규모로 항상 가동
- 자동 확장 + Route 53 Failover

### 5. Multi-Site Active-Active

- 양쪽 동시 트래픽 처리
- Aurora Global·DDB Global·Route 53 Latency/Weighted
- 데이터 일관성 설계 필수 (Conflict resolution)

### 6. Route 53 DR

- Failover Routing + Health Check
- Latency·Geo·Weighted 조합으로 더 정교한 트래픽 분배

---

## 🧠 심화 이론

### 함정 매핑

| 키워드 | 전략 |
|--------|------|
| "RTO 24시간·비용 최소" | Backup & Restore |
| "RTO 1시간·핵심 가동" | Pilot Light |
| "RTO 30분·축소 인스턴스" | Warm Standby |
| "RTO 0·이중 액티브" | Multi-Site |

### Pro 함정

- **"가장 비용 효율적 + RTO 충족"** → 충족하는 최저 전략 선택
- **"운영 부담 최소"** → Managed (Aurora Global > 자체 복제)

---

## 🏗️ 다이어그램 — Pilot Light

```
[Region A: 운영]               [Region B: Pilot Light]
[ALB·ASG·App]                  [정지된 LT·축소 ASG]
[Aurora Global Writer]  ───▶   [Aurora Global Reader]
[S3 CRR]                ───▶   [S3 Replica]
                       장애
                        ▼
                [Route 53 Failover]
                        ▼
                 [B로 확장·Promote]
```

---

## ⭐ 핵심 포인트

1. ⭐ 4전략·RTO·RPO·비용 매핑 암기
2. ⭐ Aurora Global·DDB Global·S3 CRR = 데이터 복제 표준
3. ⭐ Route 53 Failover + Health Check
4. ⭐ Multi-Site는 일관성 설계 필수
5. ⭐ 운영 부담 최소 = Managed 선택

---

## 💻 CLI 예시

```bash
# Route 53 Failover Health Check
aws route53 create-health-check ...
aws route53 change-resource-record-sets ... \
  --change-batch file://failover.json
```

---

## 📝 연습 문제

**문제 1.** RTO 24시간·비용 최소.

A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site

**정답: A**

---

**문제 2.** RTO 5분·RPO 1초·항상 트래픽 처리.

A) Pilot Light
B) Warm Standby
C) Multi-Site Active-Active
D) Backup

**정답: C**

---

**문제 3.** Aurora Multi-Region·RPO 1초·RTO 1분.

A) Read Replica
B) Aurora Global Database
C) DMS
D) Snapshot Copy

**정답: B**

---

**문제 4.** 핵심 DB만 항시 복제·컴퓨트는 정지.

A) Backup
B) Pilot Light
C) Warm Standby
D) Multi-Site

**정답: B**

---

**문제 5.** DR 사이트로 트래픽 자동 전환.

A) ALB
B) Route 53 Failover + Health Check
C) CloudFront
D) Global Accelerator (가능하나 R53이 정석)

**정답: B**

---

**문제 6.** RTO 30분·축소 인스턴스 가동.

A) Pilot Light
B) Warm Standby
C) Multi-Site
D) Backup

**정답: B**

---

## 📌 오늘의 요약

1. 4전략·RTO·RPO·비용
2. Aurora Global·DDB Global·S3 CRR
3. Route 53 Failover + Health Check
4. Multi-Site = 일관성 설계
