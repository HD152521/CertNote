# Day 2 - 최종 복습 2: S3, DynamoDB, RDS, ElastiCache

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

## 🗺️ 데이터 계층 선택: 표 대신 결정 트리로

스토리지·DB 문제는 "서비스 설명"이 아니라 "요구사항 목록"으로 출제된다. 그래서 서비스별 특징표를 외우는 것보다, 요구사항에서 **어떤 단어를 만나면 어디로 꺾이는지**를 트리로 갖고 있는 편이 훨씬 빠르다.

```
요구사항 문장에서 먼저 찾을 단어들
────────────────────────────────────────────────────────────
"파일" · "이미지" · "정적 자산" · "아카이브"
        └─▶ S3 ── 접근 빈도는? ── 자주 → Standard
                              ├─ 가끔(30일+) → Standard-IA / One Zone-IA
                              ├─ 거의 없음(90일+) → Glacier 계열
                              └─ 패턴 예측 불가 → Intelligent-Tiering

"키로 조회" · "밀리초" · "무제한 확장" · "서버리스"
        └─▶ DynamoDB ── 더 빨라야? → + DAX(마이크로초, VPC 내부)
                     ├─ 변경 이력 필요? → Streams(24h) / Kinesis(최대 365일)
                     └─ 다중 리전 쓰기? → Global Tables(Last Writer Wins)

"조인" · "트랜잭션" · "SQL" · "기존 애플리케이션 이관"
        └─▶ RDS ── 가용성? → Multi-AZ(동기·자동 페일오버)
                 ├─ 읽기 확장? → Read Replica(비동기, RDS 5 / Aurora 15)
                 ├─ 커넥션 폭주(Lambda)? → RDS Proxy
                 └─ 간헐적·예측 불가 → Aurora Serverless

"캐시" · "세션" · "리더보드" · "Pub/Sub"
        └─▶ ElastiCache ── 영속성·HA·자료구조 필요? → Redis
                        └─ 단순 문자열 캐시·멀티스레드 → Memcached

"여러 EC2가 같은 파일을" → EFS      "초고속 임시 디스크" → 인스턴스 스토어
```

이 트리에서 가장 자주 틀리는 갈림길은 **Multi-AZ와 Read Replica**다. 둘 다 "복제본을 만든다"지만 목적이 정반대다. Multi-AZ는 **동기 복제 + 대기 인스턴스**로 장애 시 자동 전환(고가용성)을 노리고, 대기 인스턴스는 원칙적으로 읽기에 쓸 수 없다. Read Replica는 **비동기 복제**로 읽기 부하를 나눠 갖는 것이며, 복제 지연이 존재하므로 "방금 쓴 값을 즉시 읽어야 하는" 경로에는 쓰면 안 된다. 시험에서 "성능 향상"이라는 단어가 나오면 Multi-AZ는 오답, "장애 시 다운타임 최소화"가 나오면 Read Replica는 오답이다.

> 💡 **관련 이론**: 동기 복제와 비동기 복제의 차이는 분산 시스템의 **CAP·PACELC** 논의 그대로다. 동기 복제는 쓰기를 두 곳에 확정한 뒤 응답하므로 일관성(C)은 좋지만 쓰기 지연(L)이 늘고, 한쪽이 느려지면 전체가 느려진다. 비동기 복제는 쓰기 응답이 빠르지만 복제본이 잠시 뒤처져 최종 일관성이 된다. Aurora는 이 이분법을 스토리지 계층으로 옮겨 풀었다 — 3개 AZ에 6개 사본을 두고 **쓰기 정족수 4/6**, 읽기 정족수 3/6으로 처리해, 한 AZ가 통째로 사라져도 쓰기가 계속되면서 지연은 정족수만큼만 기다린다. "6사본·4/6 정족수"라는 숫자를 외울 때 정족수가 왜 과반보다 큰지(AZ 하나 + 디스크 하나가 동시에 죽어도 견디려고)까지 붙여 두면 잊히지 않는다.

---

## 🪣 S3를 코드로: 프리사인 URL과 버킷 정책

S3 문제에서 가장 실무적인 축은 "**서버를 거치지 않고 클라이언트가 직접 올리고 받게 하라**"는 요구다. 답은 프리사인 URL이다.

```python
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3", region_name="ap-northeast-2")

def create_upload_url(bucket: str, key: str, expires: int = 900) -> str:
    """클라이언트가 서버를 거치지 않고 직접 PUT 하도록 만드는 서명 URL."""
    try:
        return s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": "image/jpeg",
                "ServerSideEncryption": "aws:kms",   # 업로드 시 암호화 강제
            },
            ExpiresIn=expires,      # 초 단위. SigV4 기준 최대 7일(604800초)
        )
    except ClientError as e:
        # 서명 자체는 로컬 계산이라 여기서 실패하면 대개 자격 증명/리전 문제
        raise RuntimeError(f"presign failed: {e}") from e
```

프리사인 URL에서 반드시 짚어야 할 성질이 둘 있다. 첫째, **URL의 권한은 URL을 만든 주체의 권한을 넘지 못한다.** Lambda 실행 역할에 `s3:PutObject`가 없으면 URL은 만들어져도 사용 시 403이 난다. 둘째, **만료 시간은 서명한 자격 증명의 수명에도 묶인다.** 역할의 임시 자격 증명이 1시간짜리면 7일짜리 URL을 발급해도 그 자격 증명이 끝나는 순간 무효가 된다. "7일"이라는 숫자만 외우고 이 조건을 놓치면 실무에서 반드시 한 번 데인다.

```json
// 버킷 정책 — HTTPS 강제 + 암호화되지 않은 업로드 거부
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::my-media-bucket",
        "arn:aws:s3:::my-media-bucket/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    },
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::my-media-bucket/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    }
  ]
}
```

`aws:SecureTransport=false`를 **Deny** 하는 형태여야 한다는 점이 시험 포인트다. "`true`를 Allow"로 쓰면 다른 곳의 Allow가 여전히 HTTP를 허용할 수 있어 강제가 되지 않는다. 강제는 언제나 Deny로 건다.

### 암호화 세 방식 — 키를 누가 쥐느냐

| 방식 | 키 소유·관리 | 요청 헤더 | 감사(CloudTrail) | 특징 |
|------|------------|----------|-----------------|------|
| **SSE-S3** | AWS가 전부 관리 | `AES256` | 키 사용 로그 없음 | 가장 단순, 추가 비용 없음 |
| **SSE-KMS** | KMS 키(고객 관리 가능) | `aws:kms` | **키 사용 내역 남음** | 접근 제어·감사 강함, KMS API 호출 발생 |
| **SSE-C** | **고객이 키를 매 요청에 제공** | 키를 헤더로 전달 | AWS가 키 보관 안 함 | **HTTPS 필수**, 키 분실 시 복구 불가 |

> ⚠️ **함정**: 트래픽이 많은 버킷에서 SSE-KMS를 쓰면 **객체 접근마다 KMS API가 호출되어** KMS 요청 한도에 걸리고 비용도 급증한다. 해법이 **S3 Bucket Key**다 — 버킷 단위 중간 키를 두어 KMS 호출 횟수를 줄이고, 이를 통해 KMS 비용을 최대 99%까지 낮춘다. 시험에서 "SSE-KMS 사용 후 비용 급증/스로틀링"이 보이면 답은 거의 항상 Bucket Key다. 또 하나, 정적 웹사이트 호스팅은 **HTTP만** 지원하므로 HTTPS가 요구되면 반드시 CloudFront + ACM(인증서는 **us-east-1**)이 함께 나와야 한다.

```bash
# 대용량 업로드는 CLI가 알아서 멀티파트로 쪼갠다 (8MB 초과 시 기본 동작)
aws s3 cp ./bigfile.zip s3://my-media-bucket/backups/bigfile.zip \
  --sse aws:kms --sse-kms-key-id alias/media-key

# 미완료 멀티파트는 요금을 계속 먹는다 — 반드시 확인·정리
aws s3api list-multipart-uploads --bucket my-media-bucket
aws s3api abort-multipart-upload \
  --bucket my-media-bucket --key backups/bigfile.zip --upload-id "EXAMPLE_ID"

# 근본 처방: 수명 주기 규칙으로 미완료 멀티파트 자동 정리
aws s3api put-bucket-lifecycle-configuration --bucket my-media-bucket \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "abort-incomplete-mpu",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    }]
  }'
```

> 📚 **사례**: "S3 청구서에 저장한 적 없는 용량이 잡힌다"는 신고의 고전적 원인이 **미완료 멀티파트 업로드**다. 업로드가 중간에 끊기면 이미 올라간 파트들이 버킷에 남지만 객체 목록(`ListObjects`)에는 보이지 않는다. 콘솔에서 아무리 뒤져도 파일이 없는데 스토리지 요금은 계속 나가는 상황이 이렇게 만들어진다. 처방은 위처럼 `AbortIncompleteMultipartUpload` 수명 주기 규칙을 걸어 두는 것이고, 이 규칙은 사실상 모든 프로덕션 버킷의 기본 설정으로 취급된다.

> 🔍 **더 깊이**: S3의 요청 성능은 **접두사(prefix) 단위로 확장**된다. 접두사당 초당 3,500회의 PUT/COPY/POST/DELETE와 5,500회의 GET/HEAD를 처리하며, 접두사를 늘리면 그만큼 선형으로 늘어난다. 그래서 `logs/2026-08-10/...`처럼 날짜가 앞에 오는 키 설계는 특정 날짜에 요청이 몰려 한 접두사에 부하가 집중되지만, `logs/a3f/2026-08-10/...`처럼 해시를 앞에 두면 여러 접두사로 흩어진다. 이 "앞자리를 흩뜨려 분산한다"는 발상은 DynamoDB의 write sharding과 완전히 같은 아이디어다 — 저장소가 달라도 **핫스팟은 키의 앞부분이 만든다**는 원리는 반복된다.

---

## 🧮 DynamoDB: 계산과 조건부 쓰기

용량 계산은 공식보다 **기준 단위**를 먼저 떠올려야 한다. 읽기는 4KB, 쓰기는 1KB, 언제나 올림(ceil).

```
강력한 일관성 읽기 = ceil(항목KB / 4) × 1 × 초당 요청수
최종 일관성 읽기   = ceil(항목KB / 4) × 0.5 × 초당 요청수
트랜잭션 읽기      = ceil(항목KB / 4) × 2 × 초당 요청수

일반 쓰기          = ceil(항목KB / 1) × 1 × 초당 요청수
트랜잭션 쓰기      = ceil(항목KB / 1) × 2 × 초당 요청수

빠른 검산: 5KB 강력 읽기 100회/초 → ceil(5/4)=2 → 2×1×100 = 200 RCU
          5KB 일반 쓰기 100회/초 → ceil(5/1)=5 → 5×1×100 = 500 WCU
          같은 항목이라도 쓰기가 압도적으로 비싸다
```

동시 수정 문제는 **조건부 쓰기(conditional write)** 로 푼다. 낙관적 잠금(Optimistic Locking)은 별도 기능이 아니라 조건부 쓰기의 응용이다.

```python
from botocore.exceptions import ClientError

def update_stock_safely(table, product_id: str, expected_version: int, new_stock: int):
    """버전이 그대로일 때만 갱신 — 다른 사람이 먼저 바꿨으면 실패시킨다."""
    try:
        table.update_item(
            Key={"PK": f"PRODUCT#{product_id}", "SK": "DETAIL"},
            UpdateExpression="SET stock = :s, version = :nv",
            ConditionExpression="version = :ev",          # 낙관적 잠금의 핵심
            ExpressionAttributeValues={
                ":s": new_stock,
                ":nv": expected_version + 1,
                ":ev": expected_version,
            },
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # 다른 요청이 먼저 갱신함 → 최신 항목을 다시 읽고 재시도
            raise ConcurrencyConflict(product_id) from e
        raise
```

`ConditionExpression`이 없으면 마지막 쓰기가 앞의 쓰기를 조용히 덮어쓴다(lost update). 반대로 `ADD stock :delta` 같은 **원자적 카운터**는 동시성에는 안전하지만 **멱등하지 않다** — 같은 요청이 두 번 도착하면 두 번 더해진다. "동시성 안전"과 "재시도 안전(멱등)"은 다른 문제이며, 시험은 이 둘을 구분해서 묻는다.

| 상황 | 올바른 도구 |
|------|------------|
| 항목이 없을 때만 생성 | `ConditionExpression: attribute_not_exists(PK)` |
| 남이 안 바꿨을 때만 수정 | 버전 속성 + `ConditionExpression`(낙관적 잠금) |
| 조회수·재고 증감 | `ADD`(원자적 카운터) — 단, 중복 호출 주의 |
| 여러 항목을 전부 성공/전부 실패 | `TransactWriteItems`(WCU 2배) |
| 중복 호출 방지 | 요청 ID를 키로 한 `attribute_not_exists` 삽입(멱등성 테이블) |

### DynamoDB 에러로 원인 가르기

| 에러 | 뜻 | 처방 |
|------|-----|------|
| `ProvisionedThroughputExceededException` | 용량 초과(스로틀링) | RCU/WCU 증액, 온디맨드 전환, 핫 파티션 완화 |
| `ConditionalCheckFailedException` | 조건 불충족 | 재조회 후 재시도 (오류가 아니라 설계된 신호) |
| `ValidationException` | 요청 형식·크기 위반 | 항목 400KB 초과, 키 누락, 예약어 사용 여부 확인 |
| `TransactionCanceledException` | 트랜잭션 일부 실패 | `CancellationReasons`로 실패 항목 확인 |
| `ItemCollectionSizeLimitExceededException` | LSI 항목 컬렉션 10GB 초과 | LSI 재설계 또는 GSI로 전환 |
| `ResourceNotFoundException` | 테이블/인덱스 없음 | 리전·이름·GSI 생성 완료 여부 확인 |

> ⚠️ **함정**: 스로틀링을 만나면 반사적으로 용량을 올리는데, **테이블 전체 용량은 남는데도 특정 파티션만 터지는** 경우가 많다. 파티션 하나가 감당하는 상한은 약 3,000 RCU와 1,000 WCU이고, 파티션 키가 `status`나 `날짜`처럼 카디널리티가 낮으면 트래픽이 한 파티션에 몰린다. 이때의 답은 증액이 아니라 **키 설계 변경(샤딩·고카디널리티 키)** 이다. 시험에서 "용량을 늘렸는데도 스로틀링이 계속된다"는 문장이 나오면 곧바로 핫 파티션을 의심한다.

---

## 🔌 RDS와 ElastiCache: 연결과 캐시의 실제

Lambda + RDS 조합은 서버리스에서 가장 자주 깨지는 지점이다. 함수는 순식간에 수백 개로 늘어나는데, RDS의 최대 연결 수는 인스턴스 크기에 묶여 있다. 그래서 **RDS Proxy**가 등장한다 — 연결을 풀링해 재사용하고, 장애 조치 시간을 크게 줄이며, IAM 인증과 Secrets Manager를 통합한다.

```bash
# 비밀번호 대신 IAM 인증 토큰으로 접속 (토큰 유효 15분, SSL 필수)
TOKEN=$(aws rds generate-db-auth-token \
  --hostname myproxy.proxy-abc123.ap-northeast-2.rds.amazonaws.com \
  --port 3306 --region ap-northeast-2 --username app_user)

mysql --host=myproxy.proxy-abc123.ap-northeast-2.rds.amazonaws.com \
      --port=3306 --user=app_user --password="$TOKEN" \
      --ssl-ca=/opt/rds-ca-bundle.pem

# 기존 미암호화 RDS를 암호화하려면? 스냅샷 → 암호화 복사 → 복원 (in-place 불가)
aws rds create-db-snapshot --db-instance-identifier prod-db --db-snapshot-identifier prod-snap
aws rds copy-db-snapshot --source-db-snapshot-identifier prod-snap \
  --target-db-snapshot-identifier prod-snap-enc --kms-key-id alias/rds-key
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier prod-db-enc --db-snapshot-identifier prod-snap-enc
```

"이미 돌고 있는 RDS의 암호화를 켤 수 있는가"는 매년 나오는 질문이고, 답은 **불가 — 스냅샷을 암호화하며 복사한 뒤 새 인스턴스로 복원**이다. 암호화는 생성 시점에 정해지는 속성이라는 원칙을 기억하면 된다.

캐시 전략은 코드로 보면 차이가 선명하다.

```python
# Lazy Loading (Cache-Aside): 읽을 때만 채운다
def get_product(product_id):
    cached = redis.get(f"product:{product_id}")
    if cached:
        return json.loads(cached)                  # 캐시 히트
    row = db.query_product(product_id)             # 캐시 미스 → DB
    redis.setex(f"product:{product_id}", 300, json.dumps(row))  # TTL 필수
    return row

# Write-Through: 쓸 때 캐시도 같이 갱신한다
def update_product(product_id, payload):
    db.update_product(product_id, payload)
    redis.setex(f"product:{product_id}", 300, json.dumps(payload))
```

| 전략 | 장점 | 단점 | 어울리는 상황 |
|------|------|------|--------------|
| **Lazy Loading** | 실제로 읽는 데이터만 캐시, 캐시 장애에 강함 | 첫 요청은 항상 느림(미스), 갱신 누락 시 오래된 값 | 읽기 편중, 데이터 일부만 뜨겁게 쓰일 때 |
| **Write-Through** | 캐시가 항상 최신 | 쓰기마다 비용, 안 읽힐 데이터도 캐시 점유 | 쓴 직후 곧바로 읽는 패턴 |
| **TTL 병행** | 위 둘의 오래된 값 문제를 시간으로 상쇄 | 완벽한 최신성은 아님 | 사실상 모든 실무 구성의 기본 |

실무에서는 둘 중 하나를 고르는 게 아니라 **Lazy Loading + TTL**을 기본으로 깔고, 즉시 최신성이 필요한 소수 키에만 Write-Through를 얹는다. 시험에서 "오래된 데이터가 보인다"는 증상은 TTL 부재 또는 무효화 누락이고, "쓰기가 느려졌다"는 증상은 Write-Through의 대가다.

> 📚 **사례**: 캐시를 도입한 서비스가 새벽 배포 직후 DB 부하로 넘어지는 일이 반복된다. 원인은 **캐시 스탬피드(cache stampede)** — 캐시를 비우거나 대량의 키가 동시에 TTL 만료를 맞으면, 수천 개의 요청이 동시에 미스를 내고 전부 DB로 몰린다. 완화책은 (1) TTL에 무작위 지터를 더해 만료 시점을 흩고, (2) 같은 키에 대해서는 한 요청만 DB에 가도록 잠그며(single-flight), (3) 배포 후 핵심 키를 미리 채워 두는 워밍이다. "캐시를 켰는데 오히려 장애가 났다"는 시나리오의 정체는 대부분 이것이다.

---

## 정리하며

스토리지·DB 영역의 시험 문제는 결국 **"이 데이터에 어떤 접근 패턴이 있는가"** 한 질문으로 수렴한다. 파일이면 S3, 키 조회면 DynamoDB, 조인·트랜잭션이면 RDS, 반복 조회 가속이면 캐시다. 그 위에 얹히는 세부 규칙 — S3 강제는 Deny 조건으로, KMS 비용은 Bucket Key로, 암호화 전환은 스냅샷 복사로, DynamoDB 동시성은 조건부 쓰기로, Lambda의 연결 폭주는 RDS Proxy로 — 은 모두 "그 접근 패턴이 만들어내는 부작용을 어떻게 막느냐"의 답이다. 숫자(5TB·400KB·35일·15분·48시간)는 마지막에 얹는 확인 도장일 뿐, 먼저 잡아야 할 것은 언제나 접근 패턴이다.

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
