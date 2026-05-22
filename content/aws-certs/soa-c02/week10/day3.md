# Day 3 - RDS Multi-AZ vs Read Replica, Aurora Global Database

📅 날짜: Week 10 (Day 3)
🎯 주제: 데이터베이스 HA·DR·읽기 확장 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- RDS Multi-AZ와 Read Replica의 차이를 명확히 안다
- Aurora의 Cluster 구조와 Global Database를 이해한다
- DB 백업·PITR·Cross-Region 복제 운영을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Synchronous vs Asynchronous replication**: 동기(완전 일관성) vs 비동기(지연 가능)
- **Active-Active vs Active-Passive**: 양쪽 운영 vs 한쪽 대기
- **Read scaling**: 읽기 부하를 복제본에 분산
- **Quorum-based replication**: 다수결 합의로 일관성 보장 (Aurora)

---

## 📖 이론 내용

### 1. RDS Multi-AZ (HA)

#### 개념
- Primary + Standby가 다른 AZ에 위치
- **동기 복제**
- Primary 장애 시 자동 페일오버 (1~2분)

#### 사용 목적
- **가용성**: 단일 AZ 장애 견딤
- **DR이 아님**: 같은 리전 (지역 장애엔 무력)
- **읽기 확장 X**: Standby는 클라이언트가 접근 못 함

#### Multi-AZ DB Cluster (Aurora 아닌 RDS)
- Primary + Reader 2개 (3 노드)
- 읽기 부하 분산 가능
- 더 빠른 페일오버 (35초 이하)
- MySQL/PostgreSQL만 지원

### 2. RDS Read Replica

#### 개념
- 비동기 복제로 읽기 전용 사본
- 읽기 부하 분산 (Read scaling)
- 별도 endpoint로 클라이언트가 접근

#### 사용 목적
- **읽기 성능 향상** (분석, 리포트)
- **다른 리전 복제** 가능 (Cross-Region Read Replica)
- **DR**: 다른 리전 RR을 promote 가능

#### 한계
- 비동기 → 지연 가능
- 일부 엔진은 읽기 전용 (write 불가)
- Promote 후엔 원본과 분리

### 3. Multi-AZ vs Read Replica 비교 (⭐⭐⭐ 시험 빈출)

| 항목 | Multi-AZ | Read Replica |
|------|----------|--------------|
| 목적 | HA (가용성) | 읽기 확장 |
| 복제 | 동기 | 비동기 |
| Endpoint | 자동 페일오버 (같은 endpoint) | 별도 endpoint |
| 읽기 가능 | X (Standby 접근 X) | O (RR endpoint) |
| 다른 리전 | X (기본 Multi-AZ) | O (Cross-Region RR) |
| 페일오버 | 자동 1~2분 | 수동 promote |
| 백업 영향 | Standby에서 백업 | 영향 없음 |

> 💡 시험 빈출: "가용성 향상" → Multi-AZ, "읽기 성능" → Read Replica, "둘 다 필요" → 같이 사용

### 4. Aurora 아키텍처

#### 핵심 차이점
- 분리된 storage 레이어 (6 way replication across 3 AZ)
- 자동 복구·확장
- MySQL/PostgreSQL 호환

#### Aurora 구성

```
Aurora Cluster
├── Cluster Endpoint (Primary, 읽기·쓰기)
├── Reader Endpoint (Reader, 읽기 로드 밸런싱)
├── Custom Endpoint (특정 인스턴스 그룹)
└── Instance Endpoint (개별 인스턴스)

Storage Layer:
   6 copies across 3 AZs (자동)
   Continuous backup to S3
   Self-healing (손상된 블록 자동 복구)
```

#### Aurora vs RDS

| 항목 | RDS | Aurora |
|------|-----|--------|
| 호환 엔진 | MySQL/PostgreSQL/MariaDB/Oracle/SQL Server | MySQL/PostgreSQL |
| Storage | EBS 1AZ | 분산 스토리지 6/3AZ |
| Read Replica | 비동기 | 분산 스토리지 공유 (지연 ~수십 ms) |
| 자동 확장 | 수동 | Auto Scaling |
| 가용성 | 99.95% (Multi-AZ) | 99.99% |
| 비용 | 저렴 | 비쌈 (단 성능 ↑) |

### 5. Aurora Global Database

#### 개념
- 1 Primary Region + 최대 5 Secondary Region
- 비동기 복제 (RPO < 1초, RTO < 1분)
- 리전 간 DR 표준

#### 동작
- Primary Region에서 쓰기
- Secondary Region은 읽기 전용 (수십 ms 지연)
- Primary 다운 시 promote (60초 이내)

#### 시나리오
- 글로벌 사용자에 빠른 읽기
- 리전 단위 DR
- 멀티 리전 분석

### 6. Aurora Serverless

#### v1 vs v2

| 항목 | v1 | v2 |
|------|-----|-----|
| 확장 단위 | ACU (Aurora Capacity Unit) | 더 세밀 |
| 시작 시간 | 30~60초 | 즉시 |
| 사용 사례 | 간헐적 워크로드 | 모든 워크로드 |

→ v2가 일반적으로 권장.

### 7. RDS Backup

#### 자동 백업
- 매일 백업 + Transaction log 보관
- 보존 기간 1~35일
- Backup window 지정

#### PITR (Point-in-time Recovery)
- 보존 기간 내 임의 시점(5분 단위) 복원
- 새 DB Instance 생성

#### Manual Snapshot
- 자동 백업 외 수동 trigger
- 보존 기간 무관 (직접 삭제 전까지)

#### Cross-Region Automated Backup
- 자동 백업을 다른 리전에 복제
- DR 보조

### 8. DB 운영 트러블슈팅

#### Read Replica Lag
- CloudWatch 메트릭 `ReplicaLag` 모니터링
- Lag 큰 경우: 네트워크, Storage IOPS, 트랜잭션 폭증
- 1초 이상 알람 권장

#### 페일오버 테스트
- 의도적 페일오버 명령: `aws rds reboot-db-instance --force-failover`
- 분기별 DR 훈련 권장

#### 연결 폭증 (Connection Storm)
- RDS Proxy 사용 권장 (Connection Pool)
- Lambda + RDS의 경우 거의 필수

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **RDS Proxy** | Connection Pool. Lambda·서버리스 통합 | Connection storm 방어 |
| **Aurora Backtrack** | DB를 시간 되돌리기 (PITR과 다름) | 빠른 복구 |
| **Aurora Clone** | 같은 데이터로 별도 Cluster (Copy-on-write) | 테스트 환경 빠른 복제 |
| **DB Parameter Group** | 엔진 파라미터 묶음 | 운영 튜닝 |
| **Option Group (RDS)** | 옵션 기능 활성화 | Oracle/SQL Server |

> ⚠️ **함정 1**: Multi-AZ는 DR이 아님 (같은 리전). DR엔 Cross-Region Read Replica 또는 Global DB.
>
> ⚠️ **함정 2**: Standby는 클라이언트 직접 접근 불가. RR이 필요.
>
> 💡 **암기 팁**: Multi-AZ(HA), Read Replica(읽기 확장 + Cross-Region DR), Aurora Global DB(글로벌 DR).

### 관련 서비스 Cross-Reference

- **RDS → Week 9 Day 2 Secrets Manager** (자동 회전)
- **RDS Multi-AZ → Week 1 Day 1** (HA 패턴)
- **Aurora Global → Week 10 Day 4** (Multi-Region 패턴)
- **RDS Backup → Week 10 Day 2 AWS Backup**

---

## 🏗️ 아키텍처 다이어그램

```
RDS Multi-AZ + Cross-Region Read Replica
==========================================================

   ap-northeast-2 (Primary Region)
   ───────────────────────────────
        Multi-AZ
        ─────────
        Primary (AZ-a)  ←── 동기 복제 ──→ Standby (AZ-b)
            │                              │
            │ (자동 페일오버 1-2분)         │
            │                              │
        Read Replica (AZ-c)
        Read Replica (AZ-d)
            │
            │ 비동기 복제
            ▼
   us-east-1 (DR Region)
   ─────────────────────
        Cross-Region Read Replica
        (Promote 시 새 Master 됨)
```

```
Aurora Global Database
==========================================================

   ap-northeast-2 (Primary)         us-east-1 (Secondary)
   ┌──────────────────────┐         ┌──────────────────────┐
   │  Writer Endpoint     │         │  Reader Only         │
   │  Reader Endpoints    │ ←─────  │  (RPO < 1초)         │
   │  Storage (6/3AZ)     │ replic. │  Storage (6/3AZ)     │
   └──────────────────────┘         └──────────────────────┘

   장애 시:
   - Secondary를 promote (60초 이내)
   - 새 Primary가 됨
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Multi-AZ = HA (가용성), Read Replica = 읽기 확장** — 목적이 다름
2. ⭐ **Multi-AZ는 동기, Read Replica는 비동기**
3. ⭐ **Multi-AZ Standby는 클라이언트 접근 X**, Read Replica는 별도 endpoint
4. ⭐ **Cross-Region DR = Cross-Region Read Replica 또는 Aurora Global DB**
5. ⭐ **PITR = 보존 기간 내 5분 단위 시점 복원**

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. RDS Multi-AZ 활성화 (기존 인스턴스에)
aws rds modify-db-instance \
  --db-instance-identifier prod-db \
  --multi-az \
  --apply-immediately

# 2. Read Replica 생성 (같은 리전)
aws rds create-db-instance-read-replica \
  --db-instance-identifier prod-db-rr1 \
  --source-db-instance-identifier prod-db \
  --db-instance-class db.t3.medium \
  --availability-zone ap-northeast-2c

# 3. Cross-Region Read Replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier prod-db-dr \
  --source-db-instance-identifier arn:aws:rds:ap-northeast-2:123:db:prod-db \
  --region us-east-1 \
  --kms-key-id arn:aws:kms:us-east-1:123:key/abc

# 4. Read Replica를 Promote (Master로)
aws rds promote-read-replica \
  --db-instance-identifier prod-db-dr

# 5. Aurora Global Database 생성
aws rds create-global-cluster \
  --global-cluster-identifier myapp-global \
  --source-db-cluster-identifier arn:aws:rds:ap-northeast-2:123:cluster:prod-aurora

# Secondary Region Cluster 추가
aws rds create-db-cluster \
  --global-cluster-identifier myapp-global \
  --db-cluster-identifier prod-aurora-us \
  --engine aurora-mysql \
  --region us-east-1

aws rds create-db-instance \
  --db-instance-identifier prod-aurora-us-1 \
  --db-cluster-identifier prod-aurora-us \
  --db-instance-class db.r6g.large \
  --engine aurora-mysql \
  --region us-east-1

# 6. PITR
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db \
  --target-db-instance-identifier prod-db-restored \
  --restore-time 2026-05-22T10:30:00Z \
  --db-instance-class db.t3.medium

# 7. 강제 페일오버 테스트
aws rds reboot-db-instance \
  --db-instance-identifier prod-db \
  --force-failover

# 8. Read Replica Lag 모니터링
aws cloudwatch put-metric-alarm \
  --alarm-name "RDS-ReplicaLag-High" \
  --metric-name ReplicaLag \
  --namespace AWS/RDS \
  --dimensions Name=DBInstanceIdentifier,Value=prod-db-rr1 \
  --period 60 \
  --statistic Average \
  --threshold 60 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3

# 9. Aurora Backtrack (시간 되돌리기)
aws rds backtrack-db-cluster \
  --db-cluster-identifier prod-aurora \
  --backtrack-to 2026-05-22T10:00:00Z

# 10. RDS Proxy 생성 (Lambda + RDS Connection Pool)
aws rds create-db-proxy \
  --db-proxy-name prod-db-proxy \
  --engine-family MYSQL \
  --auth Description="DB auth",AuthScheme=SECRETS,SecretArn=arn:aws:secretsmanager:...:secret:rds-creds,IAMAuth=DISABLED \
  --role-arn arn:aws:iam::123:role/RDSProxyRole \
  --vpc-subnet-ids subnet-priv-a subnet-priv-b \
  --require-tls
```

---

## 📝 연습 문제

**문제 1.** "단일 AZ 장애에서 자동 복구"가 목적. 어떤 RDS 기능?

A) Read Replica
B) Multi-AZ - 동기 복제 + 자동 페일오버
C) Snapshot
D) PITR

**정답: B**
해설: Multi-AZ는 정확히 HA용. 동기 복제 + 1~2분 자동 페일오버. Read Replica는 읽기 확장, DR엔 Cross-Region RR.

---

**문제 2.** 운영 중 DB 읽기 부하가 폭증한다. 비용 효율적인 해결?

A) DB 인스턴스 크기 ↑
B) Read Replica 추가 (비동기, 읽기 분산)
C) Multi-AZ
D) Snapshot

**정답: B**
해설: Read Replica가 정확한 도구. 별도 endpoint로 읽기 분산. Multi-AZ는 읽기 분산 X (Standby 접근 불가).

---

**문제 3.** 회사가 글로벌 사용자(아시아·미국·유럽)에게 빠른 읽기 + 리전 단위 DR을 원한다. 가장 적합한 도구는?

A) Multi-AZ
B) Aurora Global Database - 최대 5 Secondary Region
C) RDS Multi-AZ
D) DynamoDB Global Table

**정답: B**
해설: Aurora Global Database가 정확한 사용 사례. 멀티 리전 읽기 + DR 표준. RPO < 1초, RTO < 1분.

---

**문제 4.** RDS 자동 백업 보존 기간이 7일. 30일 전 데이터를 복원해야 한다면?

A) PITR
B) Manual Snapshot 또는 AWS Backup (자동 백업 외 별도 보관) 필요
C) Multi-AZ
D) Read Replica

**정답: B**
해설: 자동 백업은 보존 기간 내만. 그 이상 보관은 Manual Snapshot 또는 AWS Backup으로 명시적 보존.

---

**문제 5.** Lambda 함수가 RDS에 동시 1000개 호출 시 Connection 한도 초과. 해결책은?

A) DB 크기 ↑
B) RDS Proxy - Connection Pool 관리
C) Multi-AZ
D) Aurora

**정답: B**
해설: RDS Proxy의 정확한 사용 사례. Lambda + RDS 표준 패턴. Connection Pool + 자동 페일오버 + Secrets Manager 통합.

---

## 📌 오늘의 요약

1. Multi-AZ = HA, 동기 복제, 자동 페일오버. Read Replica = 읽기 확장, 비동기, 별도 endpoint
2. DR엔 Cross-Region Read Replica 또는 Aurora Global Database
3. Aurora = 분리 Storage(6/3AZ) + 자동 복구 + Auto Scaling
4. PITR = 자동 백업 보존 기간 내 5분 단위 시점 복원
5. RDS Proxy로 Connection Storm 방어 — Lambda + RDS 표준
