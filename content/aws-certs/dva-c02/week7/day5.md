# Day 5 - Week 7 종합: 데이터 계층 의사결정의 모든 것

이번 주는 AWS의 데이터 계층 3대 축 — **RDS, ElastiCache, Aurora** — 를 통과했다. 각각이 다른 문제를 풀고, 다른 trade-off를 가진다는 걸 봤다. RDS는 관계형 DB의 운영 부담을 AWS에 위임하는 1세대 관리형 DB, Aurora는 그 한 단계 위에서 스토리지·복제 레이어를 클라우드 네이티브로 재설계한 2세대, ElastiCache는 그 둘 위에서 인메모리 캐시 계층을 제공하는 보완재다.

DVA-C02 시험의 데이터 영역 문제 패턴은 거의 정해져 있다 — "이런 요구사항(가용성, latency, 비용, 확장성, 일관성)이 주어졌을 때 어느 서비스를 어떻게 구성하나"를 시나리오로 묻는다. 오늘은 이번 주 내용을 시나리오 중심으로 다시 묶고, 12문항의 실전 시나리오로 종합 점검한다.

## 의사결정 프레임워크: 데이터 계층 선택 5단계

production에서 데이터 계층을 결정할 때 거치는 사고 흐름은 다음 5단계다. 시험 시나리오 분석에도 그대로 적용된다.

```
1단계: 데이터 모델
  └─ 관계형(JOIN, 트랜잭션 필요)        → RDS / Aurora
  └─ 키-값 (단일 entity 조회 위주)      → DynamoDB / ElastiCache
  └─ 문서·시계열·그래프 등             → DocumentDB / Timestream / Neptune

2단계: 일관성 요구
  └─ Strong consistency (ACID 필요)    → RDS / Aurora / MemoryDB
  └─ Eventual consistency 허용         → DynamoDB / ElastiCache Replica

3단계: latency 요구
  └─ μs (마이크로초)                   → ElastiCache / MemoryDB / DAX
  └─ ms (밀리초 한 자리)                → Aurora primary / DynamoDB
  └─ 수 ms ~ 수십 ms                   → RDS / Aurora Replica / S3

4단계: 가용성·DR 요구
  └─ Single AZ OK                      → 기본 RDS Single-AZ
  └─ AZ 장애 자동 복구 (RTO 분 단위)    → RDS Multi-AZ
  └─ Cross-region DR (RTO 분 단위)      → Aurora Global / DynamoDB Global Tables

5단계: 비용 모델
  └─ 안정 트래픽                       → Reserved Instance (~50-70% 절감)
  └─ 변동 트래픽                       → Aurora Serverless v2 / DynamoDB On-Demand
  └─ 개발/스테이징                     → Single-AZ + Reserved (or Serverless auto-pause)
```

> 💡 **관련 이론**: 이 의사결정 흐름은 본질적으로 **CAP/PACELC 정리의 응용**이다. Eric Brewer의 CAP 정리(2000)는 "분할(Partition) 발생 시 일관성(Consistency)과 가용성(Availability) 중 하나만 선택 가능"을 말했고, Daniel Abadi의 PACELC 정리(2012)는 "분할 없을 때도(Else) 일관성(C)과 latency(L) 사이의 trade-off가 있다"를 추가했다. RDS Multi-AZ는 PC/EC(분할 시 일관성, 평상시 일관성), DynamoDB Global Tables는 PA/EL(분할 시 가용성, 평상시 latency)에 해당한다. Aurora는 quorum 기반으로 PC/EC를 단일 리전에서 달성하면서 cross-region에선 Global Database로 PA/EL로 전환할 수 있는 하이브리드다.

## RDS·ElastiCache·Aurora 비교: 같은 질문 다른 답

### "고가용성"에 대한 세 서비스의 답

| 서비스 | 메커니즘 | 페일오버 시간 | RPO |
|--------|---------|--------------|-----|
| RDS Multi-AZ Instance | 블록 동기 복제 (1 standby) | 60-120초 | ~0 |
| RDS Multi-AZ Cluster | 동기 quorum (2 readable standby) | 35초 이하 | ~0 |
| ElastiCache Redis Multi-AZ | Primary-Replica + sentinel | 60초 이하 | replica lag |
| Aurora Multi-AZ | 6 사본 quorum | 30초 이하 | ~0 |
| Aurora Global Database | redo log shipping (cross-region) | 1분 이하 (managed failover) | 1초 미만 |

### "읽기 확장"에 대한 세 서비스의 답

| 서비스 | 메커니즘 | 최대 개수 | 복제 lag |
|--------|---------|-----------|----------|
| RDS Read Replica | binlog/WAL 비동기 | 15 (MySQL/PG/MariaDB) | 초 ~ 분 |
| ElastiCache Redis Replica | Redis replication | 5 per shard | ms |
| Aurora Replica | redo log 알림 (공유 스토리지) | 15 | 10-20ms |

### "비밀번호/키 관리"에 대한 답

| 도구 | 보호 대상 | 회전 | RDS 호환 |
|------|-----------|------|----------|
| AWS KMS | 데이터 암호화 키 | 자동 (1년) | ✅ at-rest |
| Secrets Manager | 비밀번호, API 키 | 자동 (Lambda 또는 native) | ✅ |
| IAM DB Authentication | 비밀번호 자체 제거 | N/A (15분 토큰) | ✅ MySQL/PG |
| Parameter Store | 일반 설정값 (SecureString도 가능) | 수동 | △ (가능하지만 회전 없음) |

## 시험 함정 15가지 정리

오랫동안 출제된 패턴 중 학습자가 가장 자주 틀리는 함정들. 시험 직전에 꼭 다시 보길 권한다.

1. **Multi-AZ Standby는 읽기 불가** — 단 Multi-AZ Cluster Deployment(2022~)는 readable standby 2개 제공
2. **암호화 전환 = 스냅샷 → KMS copy → restore** — direct modify 불가
3. **자동 백업 0일 설정 시 PITR/Read Replica 생성 모두 차단**
4. **IAM DB Auth 토큰 = 15분 SigV4, SSL 필수**
5. **DB 삭제 시 자동 백업은 함께 삭제 (Final Snapshot 옵션 필수)**, 수동 스냅샷은 유지
6. **Read Replica 쓰기 직후 조회 = stale data** (Read-Your-Writes 위반 가능)
7. **Aurora Replica 자동 failover < 30초**, RDS Multi-AZ는 60-120초
8. **Aurora 스토리지 = 3 AZ × 2 사본 = 6, W=4 R=3**
9. **Aurora Serverless v1은 분 단위 + 콜드 스타트**, v2는 초 단위 + 거의 없음
10. **Redis Cluster Mode Disabled는 단일 샤드** — 한 노드 메모리가 한도
11. **Memcached는 영속성·백업·Multi-AZ·복제 모두 없음**
12. **Redis Sorted Set = 리더보드 정답 (ZADD/ZREVRANK O(log N))**
13. **DAX는 DynamoDB 전용**, ElastiCache는 범용 (서로 못 바꿈)
14. **RDS Proxy = Lambda + RDS connection storm 해결책 1순위**
15. **Aurora Backtrack = MySQL only, 72시간 in-place** (PITR과 다른 메커니즘)

> ⚠️ **함정 예시 1 — 자동 백업 보존 기간 0일**: 자동 백업을 "끄고 싶다"는 의도로 보존 기간을 0일로 설정하면 그 순간 PITR이 불가능해지고 Read Replica 생성도 막힌다. 시험 문제: "Read Replica 생성 시도가 실패하는 가장 흔한 원인은?" → 자동 백업 비활성화. 해결책: 보존 기간 1일 이상으로 설정.

> ⚠️ **함정 예시 2 — Aurora vs RDS Read Replica 최대 개수**: 2022년 이전 정답은 "Aurora 15개, RDS 5개"였지만, 그 후 RDS도 MySQL/PostgreSQL/MariaDB 한정으로 15개까지 상향. Oracle/SQL Server는 여전히 5개. 시험에서 "RDS Read Replica 최대 개수"라는 단순 문제가 나오면 엔진을 보고 답해야 한다.

## 실전 패턴: 자주 출제되는 시나리오 매핑

| 시나리오 키워드 | 답 |
|----------------|-----|
| "Lambda + RDS + connection 폭증" | RDS Proxy |
| "비밀번호 자동 회전 + 무중단" | Secrets Manager rotation |
| "비밀번호 자체를 코드에서 제거" | IAM DB Authentication |
| "DROP TABLE 즉시 복구 (Aurora MySQL)" | Backtrack |
| "DROP TABLE 어제 데이터 복구" | PITR |
| "DB 삭제 후에도 백업 유지" | 수동 스냅샷 / Final Snapshot |
| "쿼리 wait event 분석" | Performance Insights |
| "OS 프로세스 단위 모니터링" | Enhanced Monitoring |
| "리더보드/순위 캐싱" | Redis Sorted Set |
| "여러 EC2 인스턴스 간 세션 공유" | ElastiCache Redis |
| "DynamoDB 캐시" | DAX |
| "글로벌 RDBMS + 1초 미만 lag" | Aurora Global Database |
| "글로벌 NoSQL + 멀티 마스터" | DynamoDB Global Tables |
| "간헐적 RDB 트래픽 + 자동 확장" | Aurora Serverless v2 |
| "PII 저장 + 감사 로그 1년" | Audit log → CloudWatch Logs + KMS |
| "랜섬웨어 방어 백업" | AWS Backup Vault Lock (WORM) |
| "Multi-AZ인데 standby에서 읽고 싶다" | Multi-AZ Cluster Deployment |
| "Aurora replica 부하 한 노드에만 몰림" | DNS TTL/connection 유지 문제, RDS Proxy 또는 cluster-aware client |
| "CA 인증서 만료로 connection 실패" | RDS CA rotation, 트러스트 스토어 갱신 |
| "마이크로초 latency + DB 수준 durability" | MemoryDB for Redis |

## 알아두면 좋은 cross-service 패턴

### 패턴 1: "고성능 OLTP + 분석 격리 + DR"

```
Production 서울:
  Aurora MySQL Multi-AZ
    ├── Writer endpoint → OLTP 트래픽
    ├── Reader endpoint → 일반 read
    └── Custom endpoint (큰 인스턴스 2개) → 분석 워크로드 격리

DR 도쿄:
  Aurora Global Database secondary
    └── Read-only, region 내 latency 최소화
    └── Primary region 다운 시 promote (RTO < 1분)

캐시 계층:
  ElastiCache Redis Cluster Mode Enabled (서울)
    ├── 세션 데이터
    ├── 인기 상품 정보 (Lazy Loading + TTL 5분)
    └── 리더보드 (Sorted Set)

비밀 관리:
  Secrets Manager + RDS Proxy (Lambda function 측)
  KMS CMK로 스토리지/스냅샷/Secrets 모두 암호화
```

이 한 구성에 이번 주 거의 모든 개념이 들어간다. 시험 시나리오의 끝판왕.

### 패턴 2: "스타트업 MVP에서 production까지 진화"

```
Phase 1 (MVP):
  RDS MySQL Single-AZ db.t3.micro + 로컬 in-memory 캐시 (라이브러리)

Phase 2 (트래픽 증가):
  RDS MySQL Multi-AZ db.t3.medium + ElastiCache Redis (세션, 인기 데이터)

Phase 3 (확장):
  Aurora MySQL Multi-AZ + Aurora Replica 3개 + ElastiCache Redis Cluster
  RDS Proxy 도입 (Lambda 함수가 늘어남에 따라)

Phase 4 (글로벌):
  Aurora Global Database (서울 + 도쿄)
  CloudFront + S3 static asset CDN
  ElastiCache Replica를 각 region에
```

> 📚 **사례**: Coupang이 약 2017~2020년 동안 비슷한 진화 경로를 거쳤다(공개 컨퍼런스 발표 기준). MySQL → Aurora MySQL 전환으로 동일 트래픽에서 인스턴스 클래스 한 단계 축소, replica 수는 5→15로 늘려 분석 워크로드 격리, ElastiCache Redis로 세션/카탈로그 캐시 추가. 이 패턴이 한국 e-commerce의 표준 스택으로 자리 잡았다.

### 패턴 3: "Compliance 강화 환경"

```
- RDS at-rest 암호화 (KMS CMK, 회사 소유 키)
- TLS 강제 (rds.force_ssl=1)
- IAM DB Auth + Secrets Manager (인간 사용자는 IAM, 애플리케이션은 Secrets Manager + RDS Proxy)
- Audit log → CloudWatch Logs (KMS 암호화) → 1년 보존 → S3 archive
- AWS Backup Vault Lock으로 백업 WORM 보호
- VPC private subnet only, NAT Gateway 없음 (egress 차단)
- CloudTrail 데이터 이벤트 활성화
```

HIPAA, PCI-DSS, ISO 27001 같은 인증을 받는 환경의 표준 구성.

## 비용 관점: Reserved Instance와 Serverless의 손익분기

| 옵션 | 약정 기간 | 비용 절감 |
|------|---------|----------|
| On-Demand | 없음 | 0% (기준) |
| 1년 Standard RI No Upfront | 1년 | 약 30% |
| 1년 Standard RI All Upfront | 1년 | 약 38% |
| 3년 Standard RI All Upfront | 3년 | 약 60% |
| Aurora Serverless v2 (안정 트래픽) | 없음 | -20% (오히려 비쌈) |
| Aurora Serverless v2 (간헐 트래픽) | 없음 | 50-80% (사용 안 할 땐 0 ACU) |

> 💡 **시험 출제**: "비용 최적화" 시나리오에서 트래픽 패턴이 안정적이면 Reserved Instance, 변동적이면 Serverless가 답. 변동의 기준은 "사용량이 시간대별로 5배 이상 차이" 정도. 그 미만이면 RI가 거의 항상 유리.

## CLI/SDK 빠른 참조

```bash
# RDS 생성 (Multi-AZ + 암호화 + IAM 인증)
aws rds create-db-instance \
  --db-instance-identifier prod-mysql \
  --db-instance-class db.r6g.large \
  --engine mysql --master-username admin \
  --master-user-password "$(aws secretsmanager get-random-password --output text --query RandomPassword)" \
  --allocated-storage 100 --storage-type gp3 \
  --multi-az --storage-encrypted \
  --enable-iam-database-authentication \
  --backup-retention-period 14 \
  --enable-cloudwatch-logs-exports '["audit","error","general","slowquery"]'

# Aurora Cluster 생성 (Global Database 준비)
aws rds create-global-cluster --global-cluster-identifier my-global \
  --engine aurora-mysql
aws rds create-db-cluster --db-cluster-identifier my-primary \
  --engine aurora-mysql --global-cluster-identifier my-global \
  --master-username admin --master-user-password ... 
aws rds create-db-instance --db-instance-identifier my-primary-instance \
  --db-cluster-identifier my-primary --db-instance-class db.r6g.large \
  --engine aurora-mysql

# Secondary region에 추가
aws rds create-db-cluster --region us-east-1 \
  --db-cluster-identifier my-secondary \
  --engine aurora-mysql --global-cluster-identifier my-global

# ElastiCache Redis Cluster Mode Enabled
aws elasticache create-replication-group \
  --replication-group-id prod-cache \
  --replication-group-description "production cache" \
  --engine redis --cache-node-type cache.r7g.large \
  --num-node-groups 3 --replicas-per-node-group 2 \
  --automatic-failover-enabled --multi-az-enabled \
  --at-rest-encryption-enabled --transit-encryption-enabled \
  --auth-token "$(aws secretsmanager get-random-password ...)"

# RDS Proxy 생성
aws rds create-db-proxy \
  --db-proxy-name my-proxy \
  --engine-family MYSQL \
  --auth '[{"AuthScheme":"SECRETS","SecretArn":"arn:aws:secretsmanager:..."}]' \
  --role-arn arn:aws:iam::123456789012:role/rdsproxyrole \
  --vpc-subnet-ids subnet-aaa subnet-bbb \
  --require-tls
```

## 정리하며

이번 주의 핵심은 결국 두 가지로 압축된다. **첫째, "관계형 vs 키-값", "강일관성 vs 최종일관성", "동기 복제 vs 비동기 복제" 같은 분산 시스템의 근본 trade-off가 AWS 데이터 서비스 선택에 그대로 투영된다.** 둘째, **같은 문제(가용성, 확장성, latency)에 RDS/Aurora/ElastiCache가 각자 다른 답을 가지며, 시험은 그 답들 중 "주어진 제약에서 가장 적절한 하나"를 묻는다.**

다음 주는 NoSQL — DynamoDB — 로 넘어간다. DynamoDB는 RDS와 거의 정반대 철학(샤딩 자동, 강일관성 옵션, 무제한 확장, 관계형 모델 포기)을 가진 서비스다. 이번 주 RDS/Aurora를 이해하면 DynamoDB의 "왜 그렇게 다르게 설계됐나"가 훨씬 잘 보인다.

---

## 📝 Week 7 종합 실전 시나리오 12문항

**문제 1.** 한 SaaS 회사가 production RDS MySQL을 운영 중이다. Lambda 함수 500개가 burst 트래픽 시 동시 호출되어 "Too many connections" 에러가 발생하고, 동시에 보안팀이 "비밀번호를 코드에 두지 말 것 + 자동 회전 + connection 안정성" 세 요구를 모두 요구한다. 가장 적절한 구성은?

A) Lambda 환경변수에 비밀번호를 KMS 암호화로 저장 + reserved concurrency 50으로 동시성 제한 + provisioned concurrency로 cold start 완화
B) RDS IAM Authentication을 단독 사용하고 Lambda가 매 호출마다 SigV4 토큰을 생성해 직접 접속
C) RDS Proxy + Secrets Manager 자동 회전 + Lambda IAM 인증으로 Proxy 접속
D) DynamoDB로 전체 마이그레이션 후 DAX 캐시 계층을 추가해 connection 개념 자체를 제거

**정답: C**

해설: 세 요구를 모두 만족하려면 ① RDS Proxy로 connection pool 안정성 ② Secrets Manager로 자동 회전 ③ Lambda → RDS Proxy 인증은 IAM(또는 Secrets ARN)으로 — 세 가지가 함께 작동해야 한다. RDS Proxy는 Secrets Manager의 비밀 갱신을 자동 인식해 백엔드 connection을 갱신하므로 무중단 회전 가능. A) 동시성 제한은 throughput 손해. B) IAM 단독은 connection storm 해결 안 됨(15분 토큰 + 200/초 한도). D) 데이터 모델 변경 과도.

---

**문제 2.** 한 핀테크 회사가 다음을 모두 만족하는 RDS 구성을 원한다: ① RPO ≈ 0 ② standby에서 분석 쿼리 실행 가능 ③ 페일오버 시간 < 60초. 가장 적합한 옵션은?

A) RDS Multi-AZ DB Instance Deployment(동기 standby 1개) + Read Replica 2개를 분석 쿼리용으로 분리
B) RDS Multi-AZ DB Cluster Deployment (2022 신규)
C) Aurora MySQL Multi-AZ
D) RDS Single-AZ + 자동 백업 보존 7일 + 분석용 일일 스냅샷 복원

**정답: B (또는 C도 가능)**

해설: Multi-AZ DB Cluster Deployment(MySQL/PostgreSQL 한정, 2022 신규)는 1 writer + 2 readable standby 구조 + 동기 quorum 복제로 ① RPO≈0 ② standby에서 읽기 가능 ③ 페일오버 35초 이내를 동시에 만족한다. A) Standby는 일반 Multi-AZ Instance에서 읽기 불가 — Read Replica는 별개. C) Aurora Multi-AZ도 모두 만족하지만 엔진을 Aurora로 바꿔야 하는 큰 변경 — Cluster Deployment가 더 가까운 답. D) Single-AZ는 ①③ 모두 미충족.

---

**문제 3.** ElastiCache Redis Cluster Mode Enabled에서 한 핫 키(인기 상품 ID)에 트래픽이 집중되어 한 샤드의 CPU가 100%이고 다른 샤드는 5%다. 가장 효과적인 해결책은?

A) Cluster Mode를 Disabled로 변경하고 단일 샤드 + Read Replica 5개로 읽기를 분산
B) hash tag를 사용해 그 키를 여러 슬롯에 분산 (key sharding)
C) 인스턴스 클래스를 cache.r7g.large에서 한 단계 올려 핫 샤드의 CPU/메모리 헤드룸을 확보
D) Read Replica를 더 추가

**정답: B (또는 D)**

해설: B의 본질은 "한 키를 여러 서브 키로 분산"(예: `product:123:shard{0}` ~ `product:123:shard{9}`)해서 다른 슬롯/샤드에 흩어지게 만드는 패턴이다. 클라이언트가 random shard에서 읽고 쓰기는 모든 shard에 broadcast. D) Read Replica는 읽기 분산엔 효과적이지만 같은 shard 안에서만 — 쓰기가 핫 키에 몰린다면 효과 제한. A) Cluster Mode 해제는 확장성을 잃음. C) 단기 미봉책이지만 핫 키 본질 해결 못 함.

---

**문제 4.** 한 회사가 Aurora MySQL을 사용 중인데, 개발자가 production DB에 `DELETE FROM orders WHERE created_at > '2024-01-01'`를 실수로 실행했다. 가장 빠른 복구 방법은? (사고 직후 30분 이내)

A) PITR로 5분 전 시점의 새 클러스터를 생성한 뒤 삭제된 행만 mysqldump로 export/import
B) Backtrack으로 사고 시점 직전으로 in-place 복구
C) Multi-AZ failover를 수동 트리거해 다른 AZ의 인스턴스로 전환 후 재시작
D) 최근 자동 스냅샷에서 별도 클러스터로 복원 후 endpoint를 교체

**정답: B**

해설: Backtrack은 Aurora MySQL의 in-place 시간 되돌리기 기능 — 최대 72시간 전까지, 클러스터 자체를 새 인스턴스 생성 없이 과거 시점으로 복구. 수 초 ~ 수 분에 완료. A) PITR은 새 인스턴스 생성(30분) + endpoint 전환 절차 필요해 훨씬 느림. C) Failover는 데이터 복구와 무관. D) 스냅샷 복원은 분 ~ 시간 단위로 느리고 새 인스턴스 endpoint 전환 필요. 시험에서 "Aurora MySQL + 빠른 실수 복구"는 Backtrack 즉답.

---

**문제 5.** 한 게임 회사가 글로벌 사용자를 대상으로 실시간 리더보드를 운영한다. 다음 요구를 모두 만족해야 한다: ① 1억 명 점수 정렬 ② 특정 유저 순위 조회 < 10ms ③ 점수 업데이트 초당 10만 회. 가장 적합한 구성은?

A) DynamoDB에 점수를 GSI 파티션 키로 두고 Query + ScanIndexForward로 정렬, DAX로 읽기 가속
B) RDS MySQL에 score 컬럼 B-tree 인덱스 + ORDER BY score DESC LIMIT + Read Replica 분산
C) ElastiCache Redis Sorted Set
D) S3에 점수 이벤트를 적재하고 Athena로 ORDER BY 쿼리 + QuickSight 대시보드

**정답: C**

해설: Redis Sorted Set은 정확히 이 유스케이스를 위해 존재하는 자료구조다. ZADD O(log N), ZREVRANK O(log N), ZRANGE O(log N + M) — 1억 데이터에서도 27회 비교로 처리. 단일 노드 처리량은 초당 100K+ 명령. A) DynamoDB GSI는 정확한 순위 계산이 어렵고 throughput 비용 큼. B) Aurora ORDER BY는 1억 row 정렬에 분 단위. D) S3+Athena는 batch 분석용. 시험에서 "leaderboard/ranking/실시간 점수" 키워드는 거의 항상 Redis Sorted Set.

---

**문제 6.** 한 의료 SaaS가 RDS PostgreSQL에 PHI(Protected Health Information)를 저장한다. HIPAA 감사 요건상 ① 저장 데이터 KMS 회사 키 암호화 ② TLS 강제 ③ "누가 어떤 쿼리를 실행했는지" 1년 보존 ④ 백업 WORM 보호. 누락된 것 한 가지는 무엇인가? 다음 중 적용해야 할 항목을 모두 선택:

(A) `pgaudit` extension 활성화 + CloudWatch Logs export  
(B) `rds.force_ssl=1` 파라미터  
(C) KMS CMK(고객 관리 키)로 인스턴스 암호화  
(D) AWS Backup Vault Lock 활성화

A) A, C만
B) B, D만
C) A, B, C, D 모두
D) C, D만

**정답: C (A, B, C, D 모두)**

해설: HIPAA-grade RDS 구성의 표준 체크리스트가 정확히 이 4가지다. (A) Audit log는 pgaudit/MariaDB audit plugin으로 활성화 후 CloudWatch Logs export → 1년 보존 정책. (B) TLS 강제는 평문 트래픽 차단. (C) KMS CMK는 회사가 키를 직접 관리/회전. (D) Vault Lock(WORM)으로 랜섬웨어/내부자 위협으로부터 백업 보호. 하나라도 빠지면 감사에서 finding 발생.

---

**문제 7.** 한 e-commerce가 Aurora MySQL에 ElastiCache Redis로 상품 정보 캐싱을 구현했다. Lazy Loading + 1시간 TTL을 사용. 그런데 운영팀이 "상품 가격을 변경해도 1시간 동안 옛 가격이 보인다"고 보고한다. 가장 적절한 해결책은?

A) TTL을 1시간에서 5분으로 단축하고 인기 상품만 더 짧은 TTL로 차등 적용
B) Write-Through 패턴 추가 (상품 업데이트 시 캐시도 동시 갱신)
C) Lazy Loading을 제거하고 모든 조회를 Aurora Read Replica로 직접 보내 캐시 정합성 문제를 회피
D) Memcached로 전환해 더 빠른 캐시 무효화와 multi-threaded 처리를 활용

**정답: B (또는 A 보조)**

해설: 본질 문제는 "DB가 갱신되어도 캐시는 모름". Write-Through로 update API에서 DB + 캐시 동시 갱신하면 stale window 제거. A) TTL 단축은 stale window를 줄이지만 완전 해결 아님 + 캐시 hit ratio 감소. C) 캐시 효과 자체 포기. D) 같은 패턴이라 해결 안 됨. 실무 표준 패턴: Write-Through + TTL(보험)을 함께 사용. 더 robust한 방법은 CDC(Debezium 등) 또는 DynamoDB Streams 같은 이벤트 기반 무효화.

---

**문제 8.** 한 회사가 Aurora MySQL을 도쿄에서 운영 중이다. 글로벌 사용자가 늘면서 미국·유럽에서도 read latency가 50ms 이하여야 하고, 도쿄 region 다운 시 자동으로 다른 region으로 promote 가능해야 한다. 적절한 구성은?

A) Aurora Cross-Region Read Replica를 미국·유럽에 각 1개씩 두고 binlog 비동기 복제로 동기화
B) Aurora Global Database (Primary: 도쿄, Secondary: 버지니아, 아일랜드)
C) DynamoDB Global Tables로 멀티 리전 멀티 마스터를 구성하고 애플리케이션을 키-값 모델로 재작성
D) Aurora Multi-AZ를 3개 AZ로 확장하고 Route 53 latency 라우팅으로 글로벌 사용자를 도쿄로 연결

**정답: B**

해설: Aurora Global Database는 ① 전용 인프라로 cross-region lag < 1초 ② managed failover RTO < 1분 ③ 각 secondary region에 자체 read replica 가능 → region 내 latency 최소화. A) Cross-Region Read Replica도 가능하지만 lag와 failover 자동화가 약함. C) RDBMS 호환성 잃음(MySQL → NoSQL 마이그레이션 과도). D) Multi-AZ는 동일 region 내 가용성만, cross-region 불가. 단 "자동" failover라는 표현은 함정 — Aurora Global도 managed failover지 자동은 아니다(운영자가 트리거).

---

**문제 9.** 한 스타트업이 개발/스테이징 환경 RDS 비용을 줄이려 한다. 평일 9-18시만 사용하고 주말과 야간엔 사용하지 않는다. 가장 비용 효율적인 구성은?

A) RDS Single-AZ db.t3.micro + 1년 All Upfront Reserved Instance로 약 38% 절감, 야간엔 인스턴스를 유지하되 storage를 gp3로 낮춰 비용 절감
B) RDS Multi-AZ db.t3.medium + Storage Auto Scaling으로 야간 부하에 맞춰 자동 축소하고 read replica로 분석 쿼리 격리
C) Aurora Serverless v2 (Min 0 ACU - auto-pause)
D) EventBridge 스케줄로 평일 18시 인스턴스 stop, 9시 start하는 RDS Single-AZ 자동화 + stop 상태에서도 storage/backup 과금되는 점 감수

**정답: C**

해설: Aurora Serverless v2는 트래픽 없을 때 0 ACU로 자동 축소(auto-pause) — 야간/주말 비용이 거의 0. 사용 시점에 초 단위로 확장. 개발/스테이징의 전형적인 사용 패턴. A) Single-AZ + RI는 24시간 과금이라 야간 비용 발생. B) Multi-AZ는 비용 2배. D) RDS는 Spot 미지원(EC2만). 시험에서 "간헐적·예측 불가·개발환경"은 Aurora Serverless v2 즉답.

---

**문제 10.** 한 회사가 Multi-AZ RDS MySQL을 운영 중이다. 마이너 패치가 자동 실행되면서 평일 오전 트래픽 피크 시 4분 다운타임이 발생했다. 향후 같은 사고를 방지하는 방법으로 적절하지 않은 것은?

A) `preferred-maintenance-window`를 일요일 03:00-04:00 UTC 같은 트래픽 최저 시간대로 명시 설정
B) `auto-minor-version-upgrade`를 false로 변경하고 staging에서 검증 후 수동 패치 일정을 관리
C) RDS Proxy를 도입해 connection 안정성 확보
D) Multi-AZ Cluster Deployment로 전환 (동기 quorum 복제 + 페일오버 35초 이내)

**정답: C**

해설: RDS Proxy는 connection pooling을 제공하지만 인스턴스 패치 자체의 다운타임은 해결하지 못한다 — backend RDS가 다운되면 Proxy도 함께 영향. A)B)D)는 모두 효과적: A 윈도우 시간 조정으로 트래픽 낮은 시간에 패치, B 수동 관리로 일정 통제, D Cluster Deployment는 동기 quorum 복제 + 빠른 페일오버로 다운타임 최소화. 시험에서 "패치 다운타임 최소화"의 답은 ① Multi-AZ ② 유지보수 윈도우 설정 ③ Cluster Deployment(더 빠른 페일오버).

---

**문제 11.** 한 회사가 ElastiCache Redis를 사용 중인데, 노드 한 대가 갑자기 다운되면서 캐시 전체가 비고, 그 순간 RDS로 트래픽이 폭증해 RDS까지 다운되는 cascading failure를 겪었다. 향후 같은 사고를 방지하는 가장 적절한 구성은?

A) Redis를 Memcached multi-node로 변경하고 노드 분산으로 단일 장애점을 제거
B) Multi-AZ Redis replication + 애플리케이션 측 single-flight + RDS Proxy + circuit breaker 패턴
C) RDS 인스턴스 클래스를 두 단계 올리고 max_connections를 상향해 폭증 트래픽을 흡수
D) 모든 읽기 요청을 ElastiCache로만 보내고 캐시 미스 시 빈 응답을 반환하도록 변경

**정답: B**

해설: Thundering herd / cascading failure 방어는 ① 캐시 자체 가용성(Multi-AZ replication) ② 동일 키에 대한 동시 DB 호출 제한(single-flight) ③ DB connection 안정성(RDS Proxy) ④ 장애 전파 차단(circuit breaker) — 다층 방어가 표준. A) Memcached는 영속성/Multi-AZ 없음 — 오히려 악화. C) 비용만 늘고 근본 해결 X. D) 캐시 미스 시 DB가 필요하므로 불가능.

---

**문제 12.** 다음 시나리오 중 **DAX(DynamoDB Accelerator)가 답이 아닌** 경우는?

A) DynamoDB read latency를 한 자리 ms에서 마이크로초 단위로 단축 (in-memory write-through 캐시)
B) DynamoDB read 비용을 절감 (캐시 hit으로 RCU 소비 감소 + 반복 조회 부하 흡수)
C) ElastiCache Redis의 범용 캐시로 사용
D) DynamoDB Eventually Consistent Read의 반복 응답 시간을 캐시에서 즉시 반환으로 개선

**정답: C**

해설: DAX는 DynamoDB 전용 캐시(in-memory write-through)다. ElastiCache처럼 일반 데이터 캐시로는 사용 불가 — DynamoDB API 호환만 제공. A)B)D)는 모두 DAX의 정확한 유스케이스. A) 마이크로초 단위 응답. B) 캐시 hit이면 DynamoDB RCU 소비 안 함. D) Eventually Consistent도 DAX는 캐시에서 즉시 응답. 시험에서 "DynamoDB 캐시"는 DAX, "일반 캐시"는 ElastiCache로 명확히 구분.
