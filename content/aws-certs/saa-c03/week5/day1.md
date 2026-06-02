# Day 21 - RDS 기초: 엔진, Multi-AZ, Read Replica

📅 날짜: Week 5 (Day 1)
🎯 주제: 관리형 관계형 DB
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- RDS 6개 엔진을 구분한다
- Multi-AZ vs Read Replica 목적·동기성을 안다
- RDS Proxy / 백업 / 암호화의 설계 포인트를 안다

---

## 🧩 사전 지식 (CS 기초)

- **ACID**: Atomicity, Consistency, Isolation, Durability. RDB의 강점.
- **동기 vs 비동기 복제**: 동기는 데이터 손실 0, 지연 ↑. 비동기는 빠르지만 손실 가능.
- **연결 풀(Connection Pool)**: 짧은 연결의 비용을 줄이는 캐시 풀.
- **데이터 백업 종류**: Full / Incremental / Snapshot / PITR(Point-In-Time Recovery).

---

## 📖 이론 내용

### 1. RDS 지원 엔진 6종

- **MySQL / PostgreSQL / MariaDB / Oracle / SQL Server / Aurora**.
- 관리형: AWS가 패치·백업·HA·모니터링 담당.
- 게스트 OS 접근 불가(관리형의 trade-off).

### 2. Multi-AZ — HA

- **동기식** 복제로 다른 AZ에 standby.
- 평소 standby는 트래픽 안 받음.
- 장애 시 자동 페일오버(보통 60~120초).
- **백업/스냅샷은 standby에서 수행 → 프라이머리 영향 ↓**.

### 3. Read Replica — Read 확장

- **비동기 복제** (Aurora는 거의 동기).
- 최대 5개(MySQL/PostgreSQL은 인스턴스당, Aurora는 15개).
- **다른 리전**도 가능 → DR + 지역별 읽기.
- 승격(Promote) 시 독립 DB로 분리됨.

### 4. Multi-AZ + Read Replica 비교

| 항목 | Multi-AZ | Read Replica |
|------|----------|---------------|
| 목적 | HA / 페일오버 | 읽기 확장 |
| 복제 | 동기 | 비동기 |
| 트래픽 받음? | 평시 No | Yes (read endpoint) |
| 비용 | 인스턴스 ×2 | 인스턴스 ×N |
| 리전 간 | DB Cluster Multi-AZ(Aurora) | Cross-region Read Replica |

### 5. RDS Proxy

- 연결 풀링 → DB 연결 비용 ↓.
- **Lambda 같은 단발 연결 폭증** 시 필수.
- IAM 인증 / Secrets Manager 통합.
- 페일오버 시 클라이언트 영향 ↓.

### 6. 백업 & 복구

- **자동 백업**: 0~35일 보존. PITR(5분 단위).
- **수동 스냅샷**: 사용자가 보존 결정. 다른 리전/계정 복사 가능.
- 복원은 **새 인스턴스로** 만들어짐 (기존 인스턴스 직접 복원 X).

### 7. 보안

- **KMS 암호화** (생성 시에만 활성. 활성된 DB는 변경 불가).
- **TLS** 클라이언트 강제.
- **IAM DB 인증**(MySQL/PG) — 토큰 기반.
- **Performance Insights / Enhanced Monitoring** — OS·SQL 가시성.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Multi-AZ Cluster (3 노드)** | 1 writer + 2 standby reader. 빠른 페일오버 + 읽기 | 신규 옵션 |
| **Storage Auto Scaling** | 용량 자동 확장 | 운영 단순화 |
| **Blue/Green Deployments** | 메이저 업그레이드 안전 | 무중단 |
| **DB Parameter Group** | 엔진 설정. 변경 시 일부는 재시작 필요 | 시험 가벼움 |
| **Option Group** | TDE, Oracle Native Network Encryption 등 | 엔진별 기능 |

> ⚠️ **함정**: "RDS의 백업을 위해 standby에서 스냅샷" → Multi-AZ면 자동. 그게 Multi-AZ의 장점 중 하나.

> 💡 **암기 팁**: HA = Multi-AZ, Read 확장 = Read Replica. 둘은 다른 목적.

### 관련 서비스 Cross-Reference

- Aurora 상세 → Day 2
- DynamoDB / DAX → Day 3-4
- Secrets Manager → Week 8
- Disaster Recovery → Week 11

---

## 🏗️ 아키텍처 다이어그램

```
[ RDS Multi-AZ + Read Replica + Proxy ]

  App (Lambda)
     │
     ▼
  RDS Proxy ───── Secrets Manager (회전)
     │
     ▼
  Primary (AZ-a) ──── 동기 ──── Standby (AZ-b)
     │
     │ 비동기
     ▼
  Read Replica (AZ-c)   ←— 읽기 트래픽
  Read Replica (다른 리전)  ←— DR / 지역별 읽기
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Multi-AZ는 HA·동기**, **Read Replica는 읽기 확장·비동기**.
2. ⭐ Read Replica는 cross-region 가능 → DR/지역 읽기.
3. ⭐ **RDS Proxy**는 Lambda 같은 단발 연결 폭증 해결.
4. ⭐ 자동 백업 0~35일 PITR. 수동 스냅샷은 보존 결정 사용자.
5. ⭐ 암호화는 **생성 시점에 결정**. 활성 인스턴스는 변경 불가(스냅샷 후 새로).

---

## 💻 실제 예시 - AWS CLI

```bash
# Multi-AZ RDS 생성
aws rds create-db-instance \
  --db-instance-identifier saa-mysql \
  --db-instance-class db.m6i.large \
  --engine mysql --engine-version 8.0.36 \
  --master-username admin --master-user-password 'StrongPass!' \
  --allocated-storage 100 --storage-type gp3 \
  --multi-az --storage-encrypted \
  --backup-retention-period 7

# Read Replica (다른 리전)
aws rds create-db-instance-read-replica \
  --db-instance-identifier saa-mysql-ro-us \
  --source-db-instance-identifier arn:aws:rds:ap-northeast-2:111:db:saa-mysql \
  --region us-east-1

# RDS Proxy
aws rds create-db-proxy --db-proxy-name saa-proxy \
  --engine-family MYSQL --role-arn arn:... \
  --auth file://auth.json --vpc-subnet-ids ...
```

---

## 📝 연습 문제

**문제 1.** "쓰기 부하는 적은데 읽기 트래픽이 5배". 정답?

A) Multi-AZ B) Read Replica 추가 C) DAX D) ElastiCache로 마이그레이션

**정답: B**.

---

**문제 2.** RDS 정기 점검 시 다운타임 최소화:

A) Multi-AZ 활성 (페일오버) B) Read Replica 추가 C) 스토리지 확장 D) Backup 빈도 ↑

**정답: A**.

---

**문제 3.** Lambda가 RDS에 연결 폭증으로 max_connections 오류. 권장:

A) Connection retry 무한 B) RDS Proxy C) Read Replica D) DDB로 변경

**정답: B**.

---

**문제 4.** 5분 단위 PITR 가능 기간 최대:

A) 1일 B) 7일 C) 35일 D) 90일

**정답: C**.

---

**문제 5.** 기존 평문 RDS를 암호화로 전환:

A) 콘솔에서 토글 B) 스냅샷 후 암호화로 복원 C) 자동 변환 D) 변경 불가

**정답: B**.

---

## 📌 오늘의 요약

1. RDS는 6개 엔진. 관리형이라 OS 접근 X.
2. Multi-AZ = HA·동기. Read Replica = 읽기 확장·비동기.
3. RDS Proxy는 Lambda/Stateless 앱 연결 폭증의 정답.
4. 자동 백업 PITR 35일 / 수동 스냅샷 영구 + 다른 리전·계정 복사.
5. 암호화는 생성 시 결정.
