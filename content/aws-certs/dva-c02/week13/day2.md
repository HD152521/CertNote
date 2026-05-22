# Day 62 - 최종 복습 2: S3, DynamoDB, RDS, ElastiCache

📅 날짜: 2026년 8월 10일 (월요일)  
🎯 주제: 스토리지 및 데이터베이스 최종 복습  
⏱️ 학습 시간: 약 120분

---

## 🎯 학습 목표

- S3, DynamoDB, RDS, ElastiCache의 시험 핵심을 최종 정리한다
- 데이터베이스 선택 시나리오 문제를 풀어본다

---

## 📖 최종 핵심 정리

### S3 핵심 암기
```
최대 객체 크기: 5TB
멀티파트: 5GB+ 필수, 100MB+ 권장
스토리지 클래스: Standard > IA(30일) > Glacier(90일) > Deep Archive(180일)
암호화: SSE-S3(AWS관리), SSE-KMS(KMS), SSE-C(고객키제공+HTTPS)
Block Public Access: 버킷 정책 Override
HTTPS 강제: aws:SecureTransport=false Deny
버전 관리: 삭제 마커, Suspend만 가능 (비활성화 불가)
CRR/SRR: 버전 관리 필수, 기존 객체 자동 복제 안 됨
프리사인 URL: 최대 7일, PUT으로 직접 업로드
정적 웹사이트: HTTP만, HTTPS는 CloudFront+ACM
```

### DynamoDB 핵심 암기
```
항목 최대 크기: 400KB
RCU: 강력한(1/4KB), 최종적(0.5/4KB), 트랜잭션(2/4KB)
WCU: 1/1KB, 트랜잭션 2/1KB
LSI: 같은 PK, 다른 SK, 생성 시만, 강력 일관성 지원
GSI: 다른 PK/SK, 언제든, 최종적만, 별도 용량
Streams: 24시간 보존, 4가지 뷰 유형
TTL: 무료, 48시간 내 비동기 삭제
트랜잭션: 최대 25개 항목, 4MB, 비용 2배
Optimistic Locking: 버전 번호로 동시 수정 방지
```

### RDS 핵심 암기
```
Multi-AZ: 동기 복제, 자동 Failover, 고가용성
Read Replica: 비동기 복제, 읽기 확장, 최대 15개
암호화 변경: 스냅샷 → 암호화 복사 → 새 DB
IAM 인증 토큰: 15분 유효
자동 백업: 최대 35일, DB 삭제 시 함께 삭제
수동 스냅샷: 무기한, DB 삭제 후 유지
Aurora: 3AZ 6사본, MySQL 5배, Serverless, 글로벌 DB(1초 미만)
```

### ElastiCache 핵심 암기
```
Redis: 영속성, 백업, Multi-AZ, 복잡한 자료구조
Memcached: 단순, 멀티스레드, 영속성 없음
Lazy Loading: Cache Miss → DB 조회 → 캐시 저장
Write-Through: 쓰기 시 캐시도 업데이트
```

---

## 🧠 도메인 1·2 추가 - 스토리지·DB 시험 직전 압축

### S3 함정 모음 (자주 출제)

| 함정 | 정답 |
|------|------|
| "최대 객체 크기?" | **5 TB** |
| "단일 PUT 최대?" | **5 GB** |
| "멀티파트 파트 최소?" | **5 MB** (마지막 제외) |
| "멀티파트 파트 최대?" | **10,000개** |
| "버전 관리 비활성화 가능?" | **❌** (Suspended만) |
| "정적 웹사이트 HTTPS?" | **❌** → CloudFront + ACM |
| "CloudFront ACM 리전?" | **us-east-1 강제** |
| "OAI vs OAC?" | OAC 권장 (SSE-KMS·SigV4 지원) |
| "강력한 일관성 시점?" | **2020년부터 모든 동작** |
| "Glacier 최소 보존?" | **90일** (Instant Retrieval/Flexible), Deep Archive **180일** |
| "SSE-S3 헤더?" | `AES256` |
| "SSE-KMS 헤더?" | `aws:kms` |
| "Bucket Key 효과?" | KMS 비용 최대 **99% 절감** |

### DynamoDB 함정 모음

| 함정 | 정답 |
|------|------|
| "항목 최대 크기?" | **400 KB** |
| "트랜잭션 최대 항목?" | **100개** (이전 25개), 4MB |
| "LSI 추가 시점?" | **테이블 생성 시만** |
| "GSI 일관성?" | **Eventually Consistent만** |
| "Strong Consistency 1KB?" | **1 RCU** |
| "Eventually 1KB?" | **0.5 RCU** |
| "Transaction Write 1KB?" | **2 WCU** |
| "Streams 보존?" | **24시간** (고정) |
| "Kinesis for DDB 보존?" | 최대 **1년** |
| "DAX 용도?" | DDB **마이크로초** 캐시 (VPC 내부) |
| "MemoryDB vs ElastiCache Redis?" | Strong consistent vs Eventually |
| "Atomic Counter 멱등성?" | ❌ — 중복 위험 |
| "TTL 만료 후 삭제 시간?" | 0~48시간 |
| "PartiQL?" | DDB의 SQL 호환 쿼리 |

### RDS·Aurora 함정

| 함정 | 정답 |
|------|------|
| "Multi-AZ Standby 읽기?" | **불가** (Cluster Deployment는 가능) |
| "Read Replica 최대?" | RDS 5 / Aurora **15** |
| "기존 RDS 암호화 변경?" | 스냅샷 → 암호화 복사 → 새 DB |
| "Aurora 사본?" | **3 AZ × 2 = 6** |
| "Aurora 쓰기 정족수?" | **4/6** |
| "Aurora Replica Failover?" | **< 30초** |
| "Aurora Global Replication?" | **< 1초**, RTO < 1분 |
| "Aurora Backtrack?" | MySQL only, 72시간 in-place |
| "RDS Proxy 효과?" | 연결 풀링·Lambda·Failover 66% ↓ |
| "IAM 토큰?" | **15분** + SSL 필수 |
| "Auto 백업 최대?" | **35일** + DB 삭제 시 함께 삭제 |
| "수동 스냅샷?" | 무기한·DB 삭제 후 유지 |

### Redis vs Memcached 한 줄 결정

| 필요 | 선택 |
|------|------|
| 영속성 | **Redis** |
| Multi-AZ HA | **Redis** |
| 복잡한 자료구조 | **Redis** |
| Sorted Set (리더보드) | **Redis** |
| 멀티스레드 단순 캐시 | **Memcached** |

---

## 📝 최종 모의고사 - Part 2

**문제 1.** DynamoDB에서 5KB 항목을 강력한 일관성으로 읽을 때 RCU는?

A) 1 RCU  
B) 1.5 RCU  
C) 2 RCU  
D) 3 RCU  

**정답: C** - ceil(5/4) × 1 = 2 RCU (강력한 일관성은 1 RCU/4KB)

---

**문제 2.** S3 버킷에 HTTPS만 허용하는 버킷 정책의 조건은?

A) aws:SecureTransport = true  
B) aws:SecureTransport = false → Deny  
C) s3:ssl = required  
D) aws:RequestedRegion 설정  

**정답: B** - `aws:SecureTransport=false`인 요청을 Deny하면 HTTP 요청을 거부하여 HTTPS만 허용됩니다.

---

**문제 3.** 운영 중인 RDS 테이블에 GSI를 추가할 수 있는가?

A) 불가능 (DynamoDB만 가능)  
B) 가능, RDS에서 인덱스 추가 가능  
C) DynamoDB GSI는 운영 중에도 추가 가능  
D) 새 테이블로 마이그레이션 필요  

**정답: C** - DynamoDB GSI(Global Secondary Index)는 테이블 생성 후에도 언제든지 추가/삭제 가능합니다.

---

**문제 4.** ElastiCache에서 Write-Through 전략의 단점은?

A) 캐시에 오래된 데이터 존재  
B) 모든 쓰기 작업에 캐시 업데이트 비용 추가  
C) Cache Miss 빈도 증가  
D) 구현 복잡도  

**정답: B** - Write-Through는 모든 쓰기 시 DB와 캐시 모두 업데이트하므로 쓰기 지연과 추가 비용이 발생합니다.

---

**문제 5.** S3 교차 리전 복제(CRR)의 전제 조건은?

A) 동일 계정만 가능  
B) 버전 관리 활성화 필수  
C) Transfer Acceleration 필요  
D) S3 Sync 도구 필요  

**정답: B** - CRR/SRR 모두 소스와 대상 버킷에 버전 관리가 활성화되어 있어야 합니다.

---

**문제 6.** Aurora Serverless의 최적 사용 케이스는?

A) 항상 고부하인 서비스  
B) 간헐적이고 예측 불가능한 트래픽  
C) 다중 리전 서비스  
D) 읽기 부하가 매우 높은 서비스  

**정답: B** - Aurora Serverless는 트래픽이 없을 때 자동으로 0으로 스케일 다운하므로 간헐적 사용에 비용 효율적입니다.

---

**문제 7.** DynamoDB TTL 만료 후 실제 삭제까지 걸리는 시간은?

A) 즉시  
B) 1시간  
C) 최대 48시간  
D) 7일  

**정답: C** - TTL은 만료 후 48시간 이내에 비동기적으로 삭제됩니다.

---

**문제 8.** S3 수명 주기 정책에서 Glacier로 이동하기 위한 최소 보존 기간은?

A) 1일  
B) 30일  
C) 90일  
D) 180일  

**정답: C** - S3 Glacier는 최소 90일 보존 요구 사항이 있습니다.

---

## 📌 오늘의 요약

1. S3: HTTPS 강제(SecureTransport), 버전 관리, CRR(버전관리 필수), 스토리지 클래스
2. DynamoDB: RCU/WCU 계산, LSI(생성시만)/GSI(언제든), TTL(48시간), 트랜잭션(2배)
3. RDS: Multi-AZ(동기/Failover) vs Read Replica(비동기/읽기확장)
4. Aurora: 3AZ 6사본, MySQL 5배, Serverless(간헐적), 글로벌(1초 미만)
5. ElastiCache: Redis(영속성/복잡) vs Memcached(단순/멀티스레드)
