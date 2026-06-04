# Day 15 - Week 3 복습: Lambda 종합 시나리오로 실전 감각 다지기

Week 3에서 다룬 Lambda는 단순한 "서버리스 함수"가 아니다. Firecracker MicroVM의 실행 모델, 세 가지 호출 방식의 신뢰성 모델, 버전·별칭·레이어의 배포 라이프사이클, 동시성 제어의 네 계층 — 이 모든 것이 유기적으로 연결된 시스템이다.

오늘은 암기로 외우는 것이 아니라, "왜 이렇게 설계됐는가"라는 질문을 가지고 전체 지도를 다시 그려본다. 그런 다음 시험에서 실제로 나오는 형태인 시나리오 문제 12개로 실전 감각을 확인한다.

## Lambda 핵심 사양 한눈에 보기

```
실행 환경
├── 런타임: Python 3.12/3.11/3.10, Node.js 20/18, Java 21/17/11/8
│          Go 1.x, .NET 8/6, Ruby 3.3, Custom Runtime
├── 메모리: 128MB ~ 10,240MB (64MB 단위, 1,769MB = 1 vCPU)
├── 타임아웃: 1초 ~ 900초 (15분)
├── /tmp: 512MB ~ 10,240MB
├── 환경 변수: 4KB 전체
└── 배포
    ├── ZIP 직접: 50MB
    ├── ZIP S3 경유: 250MB (압축 해제)
    ├── 컨테이너 이미지: 10GB
    └── 레이어: 최대 5개, 코드+레이어 합계 250MB

페이로드
├── 동기 (요청/응답): 6MB
├── 비동기: 256KB
└── Response Streaming: 20MB

동시성
├── 계정/리전 기본: 1,000 (증가 요청 가능)
├── 초기 버스트: 500~3,000 (리전별)
└── 분당 추가: +500
```

## 세 가지 호출 방식: 설계 원칙부터 다시

Lambda의 세 가지 호출 방식은 각각 다른 신뢰성 요구에서 탄생했다.

**동기 호출**은 "즉각적인 응답이 필요한 요청"에서 출발했다. API Gateway가 HTTP 요청을 받으면 클라이언트는 응답을 기다리고 있다. Lambda가 실패하면 API Gateway가 바로 클라이언트에 오류를 반환한다. 재시도는 클라이언트의 결정이다. **단순하지만 내구성 없음.**

**비동기 호출**은 "이벤트를 잃으면 안 되는 경우"에서 탄생했다. S3에 파일이 업로드됐다는 이벤트는 처리될 때까지 Lambda 서비스가 내구적으로 보관한다. 2회 재시도 후에도 실패하면 DLQ로 보내 나중에 분석한다. **내구성 높음, 즉각 응답 없음.**

**ESM 폴링**은 "큐/스트림을 소비하는 워커"에서 나왔다. SQS나 Kinesis는 이미 데이터를 내구적으로 보관하고 있다. Lambda가 능동적으로 폴링해서 처리하는 것이 자연스럽다. **큐/스트림의 내구성을 그대로 활용.**

```
호출 방식 → 사용 사례 매핑

API Gateway → Lambda (동기)
   → RESTful API, 실시간 조회, 동기 처리

S3 이벤트 → Lambda (비동기)
   → 파일 처리, 이미지 리사이즈, 업로드 트리거

SNS → Lambda (비동기, 팬아웃)
   → 여러 처리 함수에 이벤트 분배

EventBridge → Lambda (비동기, 이벤트 버스)
   → 이벤트 패턴 매칭, 스케줄 실행

SQS → Lambda (ESM, 부하 분산)
   → 주문 처리, 이메일 발송, 비동기 작업 큐

Kinesis → Lambda (ESM, 순서 보장)
   → 클릭스트림 분석, 실시간 집계, 시계열 처리

DynamoDB Streams → Lambda (ESM, 변경 반응)
   → 검색 인덱스 동기화, 캐시 갱신, 감사 로그
```

## 버전·별칭·레이어: Git과의 유사성

Lambda의 배포 모델을 이해하는 가장 쉬운 방법은 Git 비유다.

```
Git                    Lambda
────────────────────────────────────────
커밋 해시              버전 번호 (불변)
HEAD                  $LATEST (수정 가능)
브랜치 포인터          별칭 (변경 가능 포인터)
Git Tag               버전 + Description
.npmignore            레이어 (공유 의존성)
```

`git checkout feature-branch`처럼 별칭을 바꾸면 다른 버전으로 트래픽이 이동한다. `git merge --ff-only`처럼 카나리 배포로 10%씩 점진적 병합이 가능하다.

## 동시성 제어: 층위별 정리

| 계층 | 설정 위치 | 비용 | 콜드 스타트 | 목적 |
|------|----------|------|------------|------|
| 계정 한도 | AWS Support 티켓 | - | - | 전체 상한 |
| Reserved Concurrency | 함수 | 없음 | 영향 없음 | 함수별 격리·상한 |
| Provisioned Concurrency | 버전/별칭 | 있음 | 제거 | 콜드 스타트 해결 |
| 버스트 한도 | 리전 고정 | - | - | 스케일아웃 속도 제한 |

**공동 책임 관계:**
- Reserved=300: 이 함수는 최대 300개, 나머지 함수에서 300개가 차감됨
- Provisioned=20 on Reserved=300: 300개 중 20개는 항상 웜, 나머지 280개는 필요시 콜드 스타트

## 에러 처리 의사결정 트리

```
Lambda에서 에러 발생?
    │
    ├── 동기 호출이면?
    │       → 즉시 에러 응답 (HTTP 200 + FunctionError 헤더)
    │       → 재시도: 클라이언트 책임
    │       → DLQ: 없음
    │
    ├── 비동기 호출이면?
    │       → Lambda 서비스가 1분 후 재시도 (1회)
    │       → 2분 후 재시도 (2회)
    │       → 최종 실패 → DLQ 또는 Destinations OnFailure
    │       → 이벤트 나이 최대 6시간
    │
    └── ESM 폴링이면?
            ├── SQS?
            │       → 가시성 타임아웃 후 메시지 복귀
            │       → maxReceiveCount 초과 → SQS DLQ
            │       → ReportBatchItemFailures로 부분 실패 격리
            │
            └── Kinesis/DDB Streams?
                    → 기본 무한 재시도 (샤드 블록 위험!)
                    → MaximumRetryAttempts 설정 필수
                    → BisectBatchOnFunctionError로 격리
                    → OnFailure Destination으로 최종 실패 처리
```

## 콜드 스타트 최적화 의사결정

```
콜드 스타트가 문제인가?
    │
    ├── Java 함수?
    │       → SnapStart (무료, 버전 필요)
    │
    ├── 응답 SLA가 엄격한가 (p99 < 100ms)?
    │       → Provisioned Concurrency (비용 발생)
    │
    ├── 패키지 크기가 큰가 (>50MB)?
    │       → 레이어로 분리
    │       → 컨테이너 이미지 (Lambda SnapStart 활용)
    │
    ├── 대용량 라이브러리 import가 느린가?
    │       → 지연 import (필요할 때만 import)
    │       → 메모리 증가 (CPU 비례 증가 → INIT 빨라짐)
    │
    └── VPC Lambda?
            → Hyperplane ENI 이후 크게 개선
            → 여전히 느리면 단일 AZ 서브넷 → 다중 AZ로
```

## 시험 함정 집중 복습

**함정 1**: Provisioned Concurrency는 `$LATEST`에 설정할 수 없다.
→ 버전을 발행하거나 별칭을 만든 후 그것에 설정해야 한다.

**함정 2**: SnapStart는 버전 발행 시 스냅샷이 생성된다.
→ `$LATEST`에서는 동작하지 않는다. 코드 변경 후 반드시 버전 발행 필요.

**함정 3**: Kinesis ESM의 기본 재시도는 무한이다.
→ `MaximumRetryAttempts`를 명시적으로 설정하지 않으면 샤드가 영구 블록될 수 있다.

**함정 4**: VPC 연결 Lambda는 퍼블릭 서브넷이어도 인터넷 직접 접근 불가.
→ NAT Gateway + 프라이빗 서브넷 필요.

**함정 5**: Lambda 별칭 가중치는 2개 버전만.
→ 3분할 불가능.

**함정 6**: SQS DLQ와 Lambda DLQ는 다른 개념이다.
→ SQS-Lambda ESM 실패는 SQS DLQ, S3/SNS 비동기 실패는 Lambda DLQ.

**함정 7**: API 키는 인증이 아니다.
→ 사용량 추적과 제한 목적.

**함정 8**: Lambda 컨테이너 이미지는 레이어를 사용할 수 없다.

**함정 9**: /tmp는 같은 실행 환경의 다음 호출에서 공유된다.
→ 민감 데이터 주의. 실행 환경이 다르면 공유 안 됨.

**함정 10**: 비동기 재시도는 2회, 간격은 1분/2분.
→ 무한이 아니다.

## DVA-C02 출제 도메인과 Lambda 연결

| 도메인 | Lambda 관련 키워드 |
|--------|-------------------|
| 개발(32%) | 런타임, 핸들러, 이벤트 구조, 컨텍스트 객체, 레이어 |
| 보안(26%) | Execution Role, Function Policy, VPC, IMDSv2, 환경 변수 암호화 |
| 배포(24%) | 버전, 별칭, CodeDeploy, SnapStart, SAM, CloudFormation |
| 문제 해결(18%) | CloudWatch 메트릭, X-Ray 트레이싱, 콜드 스타트 진단 |

---

## 📝 Week 3 종합 시나리오 문제

**문제 1.** 결제 API Lambda 함수가 트래픽 급증 시 높은 레이턴시를 보인다. CloudWatch `ConcurrentExecutions`는 정상 범위이고, `Duration` P99이 3,000ms를 넘는 상황이다. 가장 가능성 높은 원인과 해결책은?

A) VPC ENI 생성 지연으로 매 호출이 느려진다 → Lambda를 VPC에서 분리한다 — Hyperplane ENI 이후 핫패스 ENI 생성이 없고 ConcurrentExecutions도 정상이라 원인 불일치  
B) 트래픽 급증 시 새 실행 환경이 생성되어 콜드 스타트가 발생한다 → Provisioned Concurrency 설정  
C) 메모리 부족으로 GC·스왑이 발생한다 → MemorySize를 10GB로 올린다 — 메모리 부족이면 OOM 에러와 Max Memory Used 포화가 먼저 보이나 그 징후가 없음  
D) Reserved Concurrency 상한에 걸려 큐잉된다 → Reserved 설정을 제거한다 — 그러면 Throttles 메트릭이 증가해야 하는데 Duration P99만 치솟아 증상과 다름  

**정답: B**  
해설: `ConcurrentExecutions`가 정상이지만 P99 Duration이 갑자기 치솟는 패턴은 콜드 스타트의 전형적 징후다. 트래픽 급증 시 새 실행 환경이 생성되면서 INIT 단계(런타임 부팅 + 코드 로딩 + 글로벌 초기화)가 추가된다. 해결책은 Provisioned Concurrency로 미리 초기화된 인스턴스를 확보하는 것이다. A는 이미 정상 범위의 ConcurrentExecutions이므로 ENI 문제가 아니다. C는 메모리 부족이면 `MemorySize` 메트릭과 `OOM` 에러가 나타난다. D는 Reserved 제거로는 콜드 스타트가 해결되지 않는다.

---

**문제 2.** S3에 이미지가 업로드되면 Lambda가 썸네일을 생성해 같은 버킷의 `thumbnails/` 디렉토리에 저장한다. 운영 중 Lambda가 무한 루프에 빠진 것을 발견했다. 원인과 해결책은?

A) 썸네일 생성이 타임아웃 내에 끝나지 않아 같은 객체가 재처리된다 → 타임아웃을 900초로 늘린다 — 타임아웃이 늘어도 출력이 다시 입력 이벤트를 트리거하는 한 루프는 그대로  
B) `thumbnails/` 디렉토리에 파일이 저장될 때 새 S3 이벤트가 발생해 Lambda가 다시 호출된다 → 이벤트 알림에 suffix 필터(`*.jpg`)를 추가하고 썸네일은 다른 확장자로 저장하거나, 입출력 버킷을 분리한다  
C) 동시성이 부족해 이벤트가 재시도 큐에 쌓여 반복 호출된다 → Reserved Concurrency를 1000으로 늘린다 — 동시성을 늘려도 자기 출력이 새 이벤트를 만드는 재귀 구조는 해소되지 않음  
D) 실행 역할에 `s3:PutObject` 권한이 없어 저장이 반복 재시도된다 → 역할에 S3 full access를 부여한다 — 권한 부족이면 무한 루프가 아니라 AccessDenied로 즉시 실패  

**정답: B**  
해설: 원본 이미지(`.jpg`) 업로드 → Lambda 실행 → `thumbnails/thumb.jpg` 저장 → 새 S3:ObjectCreated 이벤트 발생 → Lambda 재호출 → 무한 루프. 해결책은 두 가지다. ① 입출력 버킷을 완전히 분리한다(가장 깔끔). ② 같은 버킷을 써야 한다면 이벤트 알림에 prefix 필터(`/` 없이 원본 디렉토리 이름)를 설정하고, Lambda가 썸네일을 저장할 때 이벤트를 트리거하지 않도록 다른 prefix나 확장자를 사용한다. A, C, D는 모두 이 문제와 무관하다.

---

**문제 3.** 주문 처리 시스템에서 Lambda가 SQS를 폴링해 주문을 처리한다. 배치 크기는 100이고, 하나의 주문이 외부 API 타임아웃으로 실패했다. 나머지 99개도 다시 처리되는 문제가 발생했다. 어떻게 해결하는가?

A) SQS 큐에 maxReceiveCount 기반 DLQ를 설정해 실패 메시지를 격리한다 — DLQ는 최종 실패 후에야 작동하고 나머지 99개의 재처리 자체는 막지 못함  
B) ESM의 비동기 재시도 횟수를 0으로 설정해 재시도를 끈다 — SQS ESM은 비동기 호출이 아니며 이 설정으로 부분 실패 격리가 되지 않음  
C) `ReportBatchItemFailures`를 활성화하고 Lambda가 실패한 메시지 ID만 `batchItemFailures`로 반환하도록 구현한다  
D) 배치 크기를 100에서 1로 줄여 메시지를 한 건씩 처리한다 — 부분 실패는 사라지나 호출 수가 100배로 늘어 비효율적  

**정답: C**  
해설: SQS ESM에서 배치 중 일부만 실패했을 때 전체를 재처리하는 것은 기본 동작이다. `ReportBatchItemFailures`를 활성화하면 Lambda가 `batchItemFailures`에 실패한 메시지 ID만 담아 반환할 수 있고, Lambda 서비스는 그 메시지들만 SQS에 돌려보낸다. 성공한 99개는 삭제된다. A는 최종 실패 이후에 작동하므로 직접적 해결책이 아니다. D는 동작하지만 처리량이 100배 줄어 비효율적이다.

---

**문제 4.** Java Spring Boot를 Lambda로 운영 중이다. 콜드 스타트가 3~5초에 달해 API 응답 SLA를 위반한다. 비용 효율적인 해결책은?

A) 메모리를 10GB로 최대화해 vCPU를 늘리고 INIT을 가속한다 — CPU는 빨라지나 JVM 클래스 로딩이 지배적이라 3-5초 콜드 스타트가 충분히 줄지 않고 메모리 비용만 급증  
B) Lambda SnapStart를 활성화하고 버전/별칭을 통해 배포한다  
C) Provisioned Concurrency를 1,000으로 설정해 항상 웜 인스턴스를 확보한다 — 효과는 있으나 실트래픽을 크게 초과하는 PC 1,000개라 비용이 막대  
D) Java에서 Node.js로 런타임을 교체해 부팅을 줄인다 — 콜드 스타트는 개선되나 전체 코드 재작성이 필요한 대규모 리팩토링  

**정답: B**  
해설: SnapStart는 Java 함수의 JVM 초기화 상태를 버전 발행 시 스냅샷으로 저장해 콜드 스타트를 90% 이상 줄인다. 무료(스냅샷 S3 저장 비용만)이며 버전/별칭과 함께 사용한다. A는 CPU는 빨라지지만 JVM 클래스 로딩 시간은 크게 줄지 않아 3-5초에서 1-2초 정도 줄이는 수준이다. C는 효과적이지만 1,000개 PC는 막대한 비용이 발생하고 실제 트래픽보다 훨씬 많다. D는 런타임 교체는 대규모 리팩토링이 필요하다.

---

**문제 5.** Lambda 함수의 환경 변수에 DB 비밀번호를 저장했다. 보안팀이 이것이 기본 KMS 관리 키로만 암호화되어 계정 내 다른 팀도 잠재적으로 접근 가능하다고 지적했다. 가장 효과적인 해결책은?

A) 비밀번호를 Base64로 인코딩한 뒤 환경 변수에 저장해 평문 노출을 막는다 — Base64는 암호화가 아니라 누구나 디코딩 가능해 보안 효과가 없음  
B) AWS Secrets Manager로 이전하거나, 환경 변수를 팀별 고객 관리 KMS 키(CMK)로 암호화한다  
C) 환경 변수를 삭제하고 비밀번호를 코드에 상수로 하드코딩한 뒤 리포지토리 접근을 제한한다 — 소스에 비밀이 박혀 git 이력·배포 패키지로 더 광범위하게 노출  
D) 실행 역할에서 KMS 복호화 권한을 제거해 다른 팀의 접근을 차단한다 — 환경 변수 복호화가 막혀 함수 자체가 동작 불능이 됨  

**정답: B**  
해설: 기본 AWS 관리 키(`aws/lambda`)로 암호화된 환경 변수는 계정 내 Lambda 권한이 있는 누구나 볼 수 있다. 팀별 고객 관리 KMS 키(CMK)로 암호화하면 키 정책으로 접근을 제한할 수 있다. 더 나아가 Secrets Manager는 자동 로테이션, 감사 로그, 교차 계정 공유, 세밀한 접근 제어를 제공하므로 DB 비밀번호에 더 적합하다. A는 Base64는 암호화가 아니다. C는 보안을 더 악화시킨다. D는 KMS 권한을 제거하면 함수가 아예 동작하지 않는다.

---

**문제 6.** 한 팀이 Lambda 함수에 Reserved Concurrency 500을 설정했다. 계정 전체 동시성 한도는 1,000이다. 다음 날 다른 팀의 함수가 급격한 트래픽 증가로 스로틀링됐다. 원인은?

A) 다른 팀 함수의 코드 결함으로 동시 실행이 누수되어 스로틀링이 났다 — 코드 문제가 아니라 공유 풀이 차감된 구조적 원인  
B) Reserved Concurrency 500 설정으로 계정 공유 풀이 500으로 줄어, 다른 함수들이 총 500개밖에 쓸 수 없게 됐다  
C) Lambda 동시성 한도는 함수·팀별로 독립 할당되므로 한 함수의 예약이 다른 함수에 영향을 주지 않는다 — 실제로는 단일 계정/리전 풀을 공유  
D) 다른 팀 함수에 Provisioned Concurrency가 설정되지 않아 버스트를 견디지 못했다 — PC 부재는 콜드 스타트 이슈일 뿐 스로틀링의 원인이 아님  

**정답: B**  
해설: Reserved Concurrency는 계정 전체 풀에서 차감된다. 계정 한도 1,000에서 한 함수가 500을 예약하면, 나머지 모든 함수들은 500을 공유한다. 트래픽 급증 시 다른 함수들이 집합적으로 500을 초과하면 스로틀링이 발생한다. 이는 Lambda Reserved Concurrency의 의도된 동작이지만, 계획 없이 큰 값을 설정하면 다른 팀에 영향을 줄 수 있다. 서비스 중요도에 따라 Reserved를 배분하고, 전체 합계가 계정 한도를 넘지 않도록 관리해야 한다.

---

**문제 7.** Lambda 함수가 Kinesis Data Streams를 폴링하는데, CloudWatch에서 `IteratorAge` 메트릭이 지속적으로 증가하고 있다. 무엇을 의미하며 어떻게 대응하는가?

A) 함수 메모리 부족으로 처리가 지연되어 지표가 오른다 → MemorySize를 늘린다 — 메모리는 한 요인일 수 있으나 IteratorAge 증가의 근본은 소비 속도가 생산 속도에 못 미치는 처리량 격차  
B) Lambda가 Kinesis 스트림 레코드를 처리하는 속도가 생성 속도보다 느리다 → ParallelizationFactor 증가, 샤드 수 증가, 처리 로직 최적화  
C) Kinesis 스트림 레코드 보존 기간이 만료되어 lag이 커졌다 → 보존 기간을 7일로 늘린다 — 보존 기간은 데이터 만료 시점일 뿐 IteratorAge(미처리 lag)와 무관  
D) ESM 실행 역할에 Kinesis 읽기 권한이 부족하다 → KinesisFullAccess를 부여한다 — 권한 부족이면 폴링이 아예 실패하지 lag이 점진 증가하지 않음  

**정답: B**  
해설: `IteratorAge`는 현재 시간과 처리 중인 레코드가 Kinesis에 Put된 시간의 차이다. 이 값이 증가한다면 Lambda가 실시간으로 데이터를 처리하지 못하고 뒤처지고 있음을 의미한다. 대응: ① `ParallelizationFactor`를 높여 샤드당 병렬 Lambda 수를 늘린다(1~10). ② Kinesis 샤드 수를 늘려(split shard) 병렬 처리 용량을 확장한다. ③ Lambda 실행 시간 자체를 최적화해 처리 속도를 높인다. 하나의 레코드가 실패해 샤드가 블록된 경우라면 `MaximumRetryAttempts`와 `BisectBatchOnFunctionError`를 설정한다.

---

**문제 8.** 여러 Lambda 함수에서 동일한 pandas, numpy 라이브러리를 사용한다. 각 함수의 ZIP 크기가 200MB에 달해 배포 속도가 느리다. 어떻게 개선하는가?

A) 모든 함수를 하나의 큰 Lambda로 합쳐 의존성을 한 번만 패키징한다 — 단일 책임을 깨고 복잡도·blast radius가 커지며 배포는 더 무거워짐  
B) pandas, numpy를 Lambda Layer로 분리하고, 각 함수는 비즈니스 로직만 포함한다  
C) 모든 함수를 컨테이너 이미지(최대 10GB)로 전환해 라이브러리를 베이스 이미지에 굽는다 — 동작하나 레이어 대비 과하고 컨테이너 이미지는 Layer를 함께 쓸 수 없음  
D) 함수 메모리 설정을 낮춰 배포 패키지 크기를 줄인다 — MemorySize는 런타임 자원일 뿐 ZIP 크기와 전혀 무관  

**정답: B**  
해설: Lambda Layer는 공통 라이브러리를 분리해 여러 함수가 공유할 수 있게 한다. pandas+numpy 레이어를 한 번 발행하면, 각 함수의 ZIP은 비즈니스 로직만 포함해 수 KB~수 MB로 줄어든다. 이는 배포 속도를 크게 개선하고, 레이어가 캐싱되므로 Lambda 콜드 스타트에도 유리하다. A는 단일 책임 원칙 위반이고 복잡성 증가. C는 해결책이지만 레이어보다 오버킬이며 컨테이너는 레이어를 사용할 수 없다. D는 메모리와 패키지 크기는 무관하다.

---

**문제 9.** Lambda Destinations와 DLQ를 동시에 설정한 경우 어떻게 동작하는가?

A) DLQ가 Destinations보다 우선순위가 높아 실패 이벤트는 DLQ로만 전송된다 — 실제 우선순위는 반대로 Destinations가 DLQ를 대체  
B) Destinations OnFailure가 설정되어 있으면 DLQ는 무시된다  
C) 두 설정이 모두 적용되어 동일한 실패 이벤트가 DLQ와 Destinations 양쪽으로 중복 전송된다 — 둘 중 Destinations만 적용되므로 중복 전송되지 않음  
D) 설정 충돌로 Lambda가 ConfigurationError를 던져 둘 중 하나만 남기도록 요구한다 — 둘 다 설정 가능하며 충돌 오류 없이 Destinations가 우선 적용  

**정답: B**  
해설: Lambda Destinations OnFailure가 설정되어 있으면 비동기 호출 최종 실패 시 Destinations로만 이벤트가 전송된다. DLQ는 Destinations가 없을 때의 폴백이다. AWS 공식 문서는 "Destinations supersede DLQ"라고 명시한다. 단, SQS ESM에서는 이 규칙이 다르다 — Lambda DLQ가 아닌 SQS 큐의 DLQ가 적용된다.

---

**문제 10.** Lambda 함수 코드에서 DB 연결을 핸들러 함수 내부에 생성하고 있다. 운영팀이 DB 연결 수 급증으로 RDS Connection Limit 오류가 난다고 보고했다. 가장 효과적인 해결책은?

A) Lambda 메모리를 줄여 동시에 뜨는 실행 환경 수를 억제한다 — 메모리는 연결 수와 무관하며 오히려 처리량만 떨어뜨림  
B) 핸들러 외부(글로벌 스코프)로 DB 연결 코드를 이동하거나, Amazon RDS Proxy를 사용한다  
C) Reserved Concurrency를 1로 설정해 동시 연결을 한 개로 강제한다 — 연결 폭증은 막으나 사실상 직렬 처리가 되어 처리량이 붕괴  
D) RDS 인스턴스 크기를 키워 max_connections 한도를 높인다 — 한도만 늘릴 뿐 비효율적 연결 생성 패턴은 그대로라 근본 해결이 아님  

**정답: B**  
해설: 핸들러 내부에서 DB 연결을 생성하면 매 호출마다 새 연결을 만들고 닫는다. 동시 실행이 100개면 순간적으로 100개 연결이 생긴다. 핸들러 외부(글로벌 스코프)에서 연결하면 실행 환경이 재사용될 때(웜 스타트) 기존 연결을 재사용해 연결 수를 크게 줄인다. 추가로 RDS Proxy는 연결 풀링으로 Lambda의 대규모 동시성에서도 RDS Connection Limit 문제를 해결한다. C는 동시성을 1로 제한하면 처리량이 극도로 낮아진다. D는 근본 해결이 아니다.

---

**문제 11.** Lambda 비동기 호출의 이벤트 나이(event age) 최대값은?

A) 1시간  
B) 6시간  
C) 24시간  
D) 7일  

**정답: B**  
해설: Lambda 비동기 호출에서 이벤트는 최대 6시간(21,600초) 동안 내부 큐에 보관된다. 이 시간 내에 처리되지 않으면 폐기된다(DLQ/Destinations 설정이 있으면 그곳으로 전송). `MaximumEventAgeInSeconds`로 이 값을 60초 ~ 21,600초 사이로 설정할 수 있다. 처리 가능한 시간이 지난 오래된 이벤트를 DLQ로 보내지 않고 폐기하고 싶을 때 이 값을 낮춘다.

---

**문제 12.** Lambda 함수가 사내 온프레미스 데이터베이스에 접근해야 한다. 이 DB는 VPN 연결을 통해서만 접근 가능하다. 어떻게 구성하는가?

A) Lambda Function URL을 발급해 그 엔드포인트로 온프레미스 DB와 통신한다 — Function URL은 함수를 인터넷에 노출하는 인바운드 HTTPS 엔드포인트일 뿐 사내망 아웃바운드 경로가 아님  
B) Lambda 함수에 Elastic IP를 직접 할당해 고정 IP로 VPN 터널을 통과시킨다 — Lambda에는 EIP를 붙일 수 없고 아웃바운드 고정 IP는 VPC+NAT로만 가능  
C) Lambda를 VPC에 연결하고, VPC에 Direct Connect 또는 Site-to-Site VPN으로 온프레미스 네트워크를 연결한다  
D) Lambda 실행 역할에 적절한 IAM 권한을 부여하면 AWS가 온프레미스까지 VPN을 자동 구성한다 — IAM은 권한 제어일 뿐 네트워크 경로를 만들지 못함  

**정답: C**  
해설: 온프레미스 DB 접근은 네트워크 경로가 필요하다. Lambda를 VPC에 연결하고, 그 VPC에서 Direct Connect 또는 Site-to-Site VPN으로 온프레미스 네트워크까지 라우팅 경로를 구성한다. Lambda는 VPC의 ENI를 통해 프라이빗 IP로 DB에 접근한다. A는 Function URL은 인터넷으로 연결된 엔드포인트로, 사내 DB 접근과 무관하다. B는 Lambda는 VPC 밖에서 Elastic IP를 할당할 수 없다. D는 IAM Role은 AWS 서비스 권한이지 네트워크 경로가 아니다.

---

## 자기 평가

| 정답 수 | 평가 |
|--------|------|
| 11-12 | Lambda 마스터 — DVA 시험 준비 완료 |
| 9-10 | 우수 — 틀린 문제 시나리오 재검토 |
| 7-8 | 양호 — Day 11-14 재독 후 재도전 |
| 5-6 | 보통 — Firecracker MicroVM부터 다시 |
| 0-4 | 미흡 — Week 3 전체 처음부터 |

