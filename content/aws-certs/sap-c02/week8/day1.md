# Day 36 - Lambda 고급: 동시성, 콜드 스타트, SnapStart의 내부 동작

람다 함수를 처음 띄울 때는 모든 게 마법처럼 느껴진다. 코드를 zip으로 올리거나 컨테이너 이미지를 가리키기만 하면 누군가가 알아서 띄우고 알아서 스케일링한다. 그러나 production에서 트래픽이 갑자기 10배로 뛰는 순간, "어제까지 50ms였던 응답이 왜 갑자기 5초가 되었나" 같은 질문이 떠오른다. 그 답은 거의 항상 동시성 한도, 콜드 스타트, VPC ENI 셋 중 하나에 있다.

SAP-C02 시험에서 Lambda는 서버리스 도메인의 중심축이고, 단순한 "이벤트 → 함수 실행" 수준의 문제는 거의 안 나온다. 대부분의 문제는 "트래픽 스파이크에 대응하는 가장 비용 효율적인 방법", "콜드 스타트를 비용 추가 없이 줄이는 방법", "VPC 안에서 Lambda가 RDS Proxy에 접속할 때 ENI 폭증을 피하는 방법" 같은 운영 관점이다. 오늘은 그 운영 관점을 만드는 내부 동작을 본다.

## Firecracker와 Lambda 실행 모델 — micro VM이 컨테이너 대신 선택된 이유

Lambda를 "컨테이너 서비스"라고 부르는 자료가 많지만, 정확히는 컨테이너가 아니다. 각 함수 인스턴스는 **Firecracker**라는 자체 마이크로 VMM(Virtual Machine Monitor) 위에 올라간 micro VM이다. AWS가 2018년 OSS로 공개한 Firecracker는 QEMU를 대체할 목적으로 만들어졌고, 부팅 시간을 약 125ms까지 줄였다.

왜 컨테이너(cgroups + namespaces)가 아니라 micro VM인가. 핵심은 **멀티테넌트 환경에서의 격리 강도** 때문이다. 한 베어메탈 서버에 수백 명의 고객 함수가 옆에 떠 있을 수 있는데, 컨테이너 격리만으로는 커널 공유로 인한 side-channel 공격(예: Spectre, Meltdown)을 막을 수 없다. Firecracker는 KVM 위에 동작하면서도 device model을 minimal하게 잘라내어, VM 부팅 오버헤드를 컨테이너 수준으로 줄였다.

> 💡 **관련 이론**: Firecracker는 NSDI 2020에 발표된 "Firecracker: Lightweight Virtualization for Serverless Applications" 논문에 자세히 설명되어 있다. 핵심은 minimal VMM(2만 줄 미만의 Rust 코드)으로 attack surface를 최소화했다는 점. 같은 기술이 Fargate에도 쓰여서 "Lambda와 Fargate는 본질적으로 같은 격리 기술 위에 다른 추상화를 얹은 것"이라고 보면 된다. CS적으로 보면 Lambda는 stateless function 추상화, Fargate는 stateful container 추상화로 사용 사례가 갈린다.

> 🔍 **더 깊이**: Firecracker가 매번 새 micro VM을 만드는 건 아니다. AWS는 **Worker(베어메탈 EC2)** 위에 **Slot**이라는 단위로 사전 워밍업된 micro VM 풀을 유지한다. 새 콜드 스타트 요청이 오면 Slot에서 가져와 함수 코드를 주입하고 init을 실행하는 식이다. 즉 콜드 스타트의 시간 분해는 (1) Slot 할당 — 거의 0 (2) 코드 다운로드·압축 해제 — zip/이미지 크기에 비례 (3) 런타임 부팅 — Java JVM이 가장 무거움 (4) Init 코드 실행 — 사용자 책임. 시험 문제에서 "콜드 스타트를 줄이려면" 보기 중 (2)(3)(4)를 공격하는 것이 정답 후보다.

## 동시성 3종의 차이를 분해하기

동시성은 Lambda에서 가장 헷갈리는 개념 중 하나다. 같은 단어가 세 가지 다른 의미로 쓰인다.

| 종류 | 의미 | 영향 |
|------|------|------|
| **계정 동시성 한도(Unreserved)** | 리전당 모든 함수가 공유하는 풀. 기본 1,000(소프트). | 한 함수가 폭주하면 다른 함수가 throttle |
| **Reserved Concurrency** | 특정 함수에 풀의 일부를 예약. 동시에 상한 역할도 함. | 격리 + 상한 |
| **Provisioned Concurrency (PC)** | 미리 따뜻한(initialized) 인스턴스를 N개 유지. | 콜드 스타트 0, 비용 발생 |

Reserved와 PC는 동시에 쓸 수 있다. 예를 들어 "이 함수는 Reserved=200, PC=50"이라고 설정하면, 평상시 50개는 항상 따뜻하게 유지되고 그 위 트래픽은 150까지 cold scale-out된다. 트래픽이 더 몰리면 그 함수는 200에서 throttle되고, 그 throttle이 다른 함수를 보호한다.

> ⚠️ **함정**: "Reserved Concurrency를 설정하면 그 함수에 N개만 띄울 수 있다"는 표현이 보기에 자주 나온다. 정확히는 **N개의 동시 실행을 보장하면서 동시에 상한**으로 작동한다. Reserved=10이라면 평상시 10개까지만 동시 실행되고, 나머지는 throttle된다. 이걸 격리 목적으로만 보고 "상한"이라는 의미를 빼먹으면 시나리오를 잘못 푼다.

> 📚 **사례**: 2019년 한 핀테크가 결제 처리용 Lambda 함수가 새벽 배치 작업 함수의 트래픽 스파이크에 휘말려 throttle된 사건이 있다. 두 함수가 같은 계정 동시성 풀(1,000)을 공유했고, 배치 함수가 1시간 동안 950개를 점유하면서 결제 함수가 50개만 받게 되어 결제 거부율이 30% 가까이 치솟았다. 사후 대응은 결제 함수에 Reserved=500을 부여해 격리. SAP 시험의 "한 함수가 다른 함수에 영향을 준다" 시나리오는 정확히 이 패턴이다.

## 콜드 스타트 — 원인을 분해하면 해결책이 보인다

콜드 스타트의 시간은 단일 숫자가 아니라 누적이다. AWS 공식 데이터 기준 Java 11 Lambda의 콜드 스타트는 다음과 같이 분해된다:

- **AWS Side**(코드 다운로드 + Slot 할당 + 런타임 부팅): 100~600ms
- **Init 코드**(사용자 코드의 클래스 로딩, DB 연결 풀 초기화 등): 1~5초 (Java 기준)
- **첫 핸들러 실행**: 200~1,000ms (JIT warmup)

여기서 가장 큰 비중은 **Init 코드**다. Java Spring Boot 함수는 클래스 수천 개를 로드하면서 평균 2~3초가 사라진다. 이를 줄이는 도구가 SnapStart다.

**SnapStart의 동작 원리:**
1. 함수 버전을 publish할 때 AWS가 Init까지 한 번 실행한다.
2. 그 시점의 micro VM 메모리 + 디스크 상태를 스냅샷으로 캡처해 암호화 저장한다.
3. 새 콜드 스타트가 오면 init을 다시 실행하지 않고 스냅샷을 **CRaC(Coordinated Restore at Checkpoint)** 메커니즘으로 복원한다.
4. 복원 후 핸들러가 즉시 실행된다.

> 💡 **관련 이론**: CRaC는 OpenJDK의 공식 프로젝트로, Java JVM 프로세스의 상태를 체크포인트로 저장·복원하는 표준이다. CRIU(Checkpoint/Restore In Userspace)라는 Linux 커널 기능을 기반으로 한다. SnapStart는 CRaC를 채택해 Java에 먼저 적용했고, 2024년 Python·.NET로 확장됐다. 이 모델의 핵심은 **"초기화는 한 번, 실행은 무한"**이라는 분산 시스템의 일반적 최적화 패턴이다.

> 🔍 **더 깊이**: SnapStart가 무료인 이유는 AWS 입장에서도 컴퓨팅 효율이 더 좋기 때문이다. 매 콜드 스타트마다 init을 실행하는 것보다, 한 번 만든 스냅샷을 page cache에서 복원하는 게 CPU·메모리·네트워크 모두 저렴하다. 다만 함정이 있다. 스냅샷은 **메모리·디스크 상태를 그대로 복사**하므로 init 단계에서 생성한 난수 시드, 고유 ID, DB connection의 TCP 상태가 모든 복원본에 동일하게 들어간다. 그래서 SnapStart 가이드는 "init에서 uniqueness state를 만들지 말 것"을 강조하고, `Crac.Resource` 인터페이스로 `beforeCheckpoint`/`afterRestore` 훅을 제공한다.

> ⚠️ **함정**: SnapStart로 활성화하면 함수 환경이 stateless라는 가정이 깨진다. 예를 들어 init에서 `UUID.randomUUID()`로 인스턴스 ID를 만들고 캐시 key로 쓰는 코드가 있다면, 모든 SnapStart 복원본이 같은 ID를 갖게 되어 캐시 충돌이 생긴다. 시험에서는 직접 묻지 않지만 실무에서 흔한 함정이라 알아두면 좋다.

## VPC 통합과 Hyperplane ENI — 2019년 이전과 이후가 다르다

VPC 안의 RDS·ElastiCache에 접속하는 Lambda는 VPC 통합이 필수다. 그런데 2019년 이전의 Lambda VPC 통합은 악명 높은 함정이었다. 함수가 새 동시 실행을 만들 때마다 **ENI(Elastic Network Interface)를 새로 attach**했고, ENI 생성에 10~15초가 걸렸다. 함수가 100개 동시 실행되면 ENI 100개가 만들어졌고, VPC ENI 한도(서브넷당 보통 ~5,000)에 부딪혀 함수가 timeout나는 사고가 빈번했다.

AWS는 2019년 9월 **Hyperplane ENI** 아키텍처로 이를 완전히 재설계했다. Hyperplane은 AWS 내부 네트워크 가상화 레이어(VPC, NAT GW, NLB도 같은 기반)이고, 다음과 같이 동작한다:

1. 함수와 VPC/Subnet/SG 조합을 처음 사용할 때 한 번의 cross-account ENI를 만든다.
2. 그 ENI는 함수 인스턴스가 **공유**한다. 동시 실행 100개여도 ENI는 보통 몇 개로 끝난다.
3. 함수가 비활성화되면 ENI는 한동안 유지됐다가 GC된다.

이 변화 덕분에 VPC Lambda 콜드 스타트는 비-VPC와 거의 동일한 수준으로 떨어졌다. 시험에서 "Lambda VPC 통합 시 ENI 폭증을 어떻게 피하나" 같은 질문은 이제 거의 안 나오지만, 운영 관점에서 "한 함수당 ENI 개수는 동시성에 비례하지 않는다"는 사실은 알아두어야 한다.

> 🔍 **더 깊이**: Hyperplane은 AWS 내부에서 분산 NAT/LB 역할을 하는 **Andromeda** 같은 SDN 시스템이다. NLB와 PrivateLink, Lambda VPC ENI, NAT Gateway, S3 Gateway Endpoint 모두 Hyperplane 위에서 동작한다. 그래서 Lambda VPC 통합이 "서브넷 내 IP를 쓰지만 실제 트래픽 경로는 Hyperplane을 거친다"는 점이 동작 원리의 핵심이다. AWS re:Invent 2019 "A Serverless Journey: AWS Lambda Under the Hood" 세션이 가장 좋은 1차 자료.

> 🎯 **시나리오**: "한 회사가 Lambda 함수에서 VPC 내부 RDS PostgreSQL에 초당 500건 쿼리를 보낸다. 동시 실행이 1,000개로 늘면 RDS의 max_connections=200 한도를 초과해 'too many connections' 오류가 발생한다. 가장 적합한 해결책은?" — 답은 **RDS Proxy**. Lambda → RDS Proxy → RDS 패턴으로 connection multiplexing(pooling)을 적용하면, Lambda 1,000개가 RDS 50개 연결로 묶인다. 추가로 RDS Proxy는 IAM 인증과 fail-over 시 connection holding도 제공한다. 시험에서 "Lambda + RDS + 동시성 + connection 오류" 키워드 조합은 거의 RDS Proxy가 답이다.

## 비동기 호출의 재시도 모델과 Destinations

Lambda 호출은 동기/비동기/스트림 3가지가 있고, 각각 재시도 모델이 다르다.

| 호출 모델 | 호출자 | 재시도 |
|----------|--------|--------|
| **동기(Sync)** | API GW, ALB, Function URL, 직접 invoke | 호출자 책임 (Lambda는 재시도 안 함) |
| **비동기(Async)** | S3 Event, SNS, EventBridge | Lambda가 자동 2회 재시도 (총 3회) |
| **스트림 폴(Poll)** | SQS/Kinesis/DDB Streams | ESM이 재시도 + DLQ/PartialBatch |

비동기 호출의 실패 처리는 두 가지가 있다. **DLQ**(legacy, 함수 실행 자체가 실패한 케이스만)와 **Destinations**(2019, 성공/실패 모두 라우팅). Destinations가 권장 방식이고 4가지 타겟(Lambda, SNS, SQS, EventBridge)을 지원한다.

> 📚 **사례**: 2020년 한 e-commerce가 S3 → Lambda(이미지 리사이즈) 파이프라인을 DLQ로 운영하다가, 실패한 이미지에 대해 "어떤 단계에서 어떤 입력으로 실패했는지"를 추적하기 어려워 Destinations로 전환했다. OnFailure → EventBridge로 보내면 실패 이벤트에 원본 입력 + 응답 페이로드 + 실행 컨텍스트가 모두 포함되어 분석이 쉬워졌다. DLQ는 페이로드만 남고 컨텍스트가 없다.

## Function URL — API Gateway를 우회하는 단순 HTTPS

2022년 출시된 Function URL은 Lambda 함수에 직접 HTTPS endpoint를 부여한다. API Gateway 없이도 `https://<id>.lambda-url.<region>.on.aws`로 접근 가능. 인증은 NONE 또는 IAM(AWS_IAM). CORS·CloudFront 앞단 가능.

언제 쓰나:
- **API GW를 쓸 가치가 없는 단일 함수** (간단한 webhook receiver, status endpoint 등)
- **API GW 비용을 줄이고 싶을 때** (API GW는 호출당 $3.50/M, Function URL은 호출당 비용 없음 — Lambda 호출 비용만)
- **CloudFront 뒤에 두고 캐싱하고 싶을 때**

언제 쓰면 안 되나:
- API 키 관리, throttle, JWT 검증 등 API GW 기능이 필요할 때
- WebSocket·SOAP 같은 비-REST 프로토콜
- 여러 함수를 하나의 도메인 아래 라우팅해야 할 때

> ⚠️ **함정**: Function URL은 IAM 인증만 지원하고 Cognito User Pool 통합이 없다. JWT 기반 사용자 인증이 필요하면 API GW + Cognito Authorizer를 써야 한다. 시험에서 "Cognito 사용자 인증 + Lambda" 시나리오는 거의 API GW가 답이다.

## Lambda 패키징 — Layer vs Container Image

함수 패키징은 두 가지 방식이 있다.

| 방식 | 크기 한도 | 사용 사례 |
|------|----------|----------|
| **zip + Layer** | zip 50MB(직접 업로드) / 250MB unzipped(S3 경유), Layer 5개 | 일반 함수 + 공통 라이브러리 |
| **Container Image (OCI)** | 10GB | ML 모델, 큰 바이너리(ffmpeg, headless Chrome), 기존 컨테이너 워크플로 |

Container Image는 ECR Push 후 Lambda가 이미지를 unpack해 micro VM에 주입한다. 10GB 한도는 매우 크지만, 콜드 스타트가 더 길 수 있다(이미지 pull 시간 때문). 대신 Lambda는 이미지를 **레이어 단위 lazy loading**으로 가져와서 첫 실행 시간을 줄인다. 이는 SOSP 2023 "Faster Cold Starts for Lambda with On-Demand Code Loading" 논문에 자세히 설명되어 있다.

> 🔍 **더 깊이**: Lambda는 컨테이너 이미지를 받으면 ECR 원본을 그대로 쓰지 않고, AWS 내부 분산 캐시에 **block-level deduplication**을 적용해 저장한다. 같은 base image(예: `public.ecr.aws/lambda/python:3.11`)를 쓰는 함수가 1만 개 있어도 storage는 한 번만 쓰인다. 콜드 스타트 시에도 이미지 전체를 다운로드하지 않고, 함수 실행에 필요한 블록만 lazy fetch한다. 이 덕분에 10GB 이미지도 200~500ms 안에 첫 호출이 시작된다.

## Graviton2/3 (ARM) — 거의 공짜로 얻는 20% 절감

Lambda는 x86_64와 arm64 두 아키텍처를 지원한다. arm64(Graviton2)는 약 20% 저렴하고 19% 빠르다. 호환성 문제만 없으면 거의 무조건 ARM이 답이다.

언제 ARM을 못 쓰나:
- 네이티브 binary(x86 전용 .so/.dll)를 포함한 라이브러리
- 일부 ML 추론 라이브러리(특히 NVIDIA CUDA 의존)
- 컨테이너 이미지가 multi-arch 빌드되지 않은 경우

대부분의 Node.js/Python/Go/Java 함수는 그대로 ARM으로 옮길 수 있다. SAP 시험에서 "비용 최적화" + "Lambda" 키워드면 ARM 전환이 첫 번째 후보다.

## Lambda Burst Concurrency — 갑작스러운 트래픽의 한계

Lambda는 동시성 한도(예: 1000)까지 무한정 즉시 스케일링되지 않는다. **Burst Concurrency**라는 초기 폭증 한도가 있고, 리전에 따라 다르다:
- us-east-1, us-west-2, eu-west-1: 3,000 burst
- ap-northeast-1, eu-central-1 등 주요 리전: 1,000 burst
- 그 외 신규 리전: 500 burst

이를 초과하면 분당 +500씩 gradual scale-up된다. 즉 0에서 갑자기 5,000 동시 실행이 필요한 워크로드는 처음 몇 분간 throttle된다(HTTP 429). 이를 피하려면 Provisioned Concurrency를 사전에 워밍업해야 한다.

> 🎯 **시나리오**: "월 1회 발생하는 블랙프라이데이 세일 시작 시 평소의 50배 트래픽이 5분 안에 몰린다. Lambda 함수가 throttle 없이 처리하게 하려면?" — 답은 **Application Auto Scaling으로 Provisioned Concurrency를 스케줄 기반으로 미리 증가**시키는 것. 세일 시작 30분 전부터 PC=2000으로 올려두고, 끝나면 PC=10으로 내린다. 비용은 PC 시간당이지만 throttle 회피와 일관된 latency가 더 가치 있다.

## 정리하며

Lambda는 표면적으로는 "코드만 쓰면 알아서 돈다"는 약속이지만, production 운영에서는 micro VM 격리·Hyperplane ENI·CRaC 스냅샷·동시성 풀 같은 내부 모델이 비용과 latency를 결정한다. 시험에서 자주 등장하는 시나리오는 "콜드 스타트(SnapStart vs PC vs init 최적화)", "동시성 격리(Reserved)", "VPC + DB 연결(RDS Proxy)", "ARM 전환" 네 가지 카테고리에 거의 다 매핑된다.

다음 day에서는 Step Functions로 Lambda를 여러 개 묶어 워크플로우를 만드는 방법을 본다. 비동기 호출의 한계(15분 timeout, 재시도 모델의 단순함)를 Step Functions가 어떻게 보완하는지가 다음 글의 핵심이다.

---

## 📝 연습 문제

**문제 1.** Java 17 Spring Boot 기반 Lambda 함수의 콜드 스타트가 평균 4초다. 운영팀은 추가 비용 없이 이를 1초 이하로 줄이려 한다. 가장 적합한 방법은?

A) Provisioned Concurrency = 100 설정
B) SnapStart 활성화 + init에서 uniqueness state 제거
C) 메모리를 10GB로 올림
D) Function URL로 전환

**정답: B**
해설: "추가 비용 없이"가 핵심. Provisioned Concurrency(A)는 시간당 과금이 발생한다. SnapStart는 무료이고 Java/Python/.NET 모두 지원한다. CRaC 기반 스냅샷 복원으로 init 시간이 거의 0이 된다. 다만 init에서 uniqueness state(난수 시드, UUID, DB connection의 TCP 상태)를 만들면 모든 복원본에 복제되어 충돌이 생기므로 `Crac.Resource` 인터페이스로 `beforeCheckpoint`/`afterRestore`에서 재초기화해야 한다. C는 비용 증가, D는 콜드 스타트와 무관. 추가 학습: SnapStart는 publish된 버전에만 적용되고 $LATEST에는 적용 안 됨.

---

**문제 2.** 한 결제 처리 Lambda 함수가 다른 분석 배치 Lambda의 트래픽 스파이크 때문에 throttle된다. 두 함수는 같은 AWS 계정에서 동작한다. 결제 함수의 최소 500 동시 실행을 보장하고 격리하려면?

A) 계정 동시성 한도를 5,000으로 증액
B) 결제 함수에 Reserved Concurrency = 500 설정
C) 결제 함수를 별도 계정으로 이전
D) 분석 함수에 Provisioned Concurrency = 0 설정

**정답: B**
해설: Reserved Concurrency는 함수에 동시성 풀의 일부를 예약하면서 동시에 상한 역할도 한다. 결제 함수에 500을 reserve하면 다른 함수가 폭주해도 결제 함수는 500까지 보장된다. A(한도 증액)는 풀을 늘릴 뿐 분배 문제를 해결 못함. C는 운영 부담이 너무 큼. D는 분석 함수의 콜드 스타트를 줄이는 옵션이지 동시성 격리와 무관. 함정: Reserved는 격리만이 아니라 상한이기도 함. 추가: 매우 중요한 함수는 Reserved + Provisioned 조합으로 격리 + 콜드 0을 모두 잡는다.

---

**문제 3.** Lambda 함수가 VPC 안의 RDS PostgreSQL에 접속한다. 동시 실행이 1,500개로 증가하면서 "FATAL: too many connections" 오류가 발생한다. RDS max_connections는 200이다. 가장 적합한 해결책은?

A) RDS 인스턴스 클래스를 키워 max_connections를 2,000으로 올림
B) Lambda Reserved Concurrency를 200으로 제한
C) RDS Proxy를 도입하고 Lambda는 Proxy에 연결
D) Lambda VPC 통합을 제거

**정답: C**
해설: RDS Proxy는 connection multiplexing(pooling)을 제공해 1,500개의 Lambda가 50개 내외의 RDS 연결로 묶이게 한다. 추가로 IAM 인증과 failover 시 connection holding을 지원해 가용성도 향상된다. A는 비용·DB 부하 증가에 비해 근본적 해결이 안 됨(Lambda는 더 많이 늘 수 있음). B는 가용성을 희생함(throttle 발생). D는 RDS 접속이 아예 불가능. 함정: "connection 부족"을 보면 거의 RDS Proxy가 답이다. SAP 시험 단골 패턴. 추가: Proxy는 Aurora·RDS MySQL/PostgreSQL/MariaDB/SQL Server를 지원하고 IAM 인증 + Secrets Manager 통합도 자동.

---

**문제 4.** S3 → Lambda 비동기 호출 파이프라인에서 실패한 이벤트의 원본 페이로드 + 응답 + 실행 컨텍스트를 모두 분석하고 싶다. 가장 적합한 구성은?

A) DLQ(SQS)
B) Destinations OnFailure → EventBridge
C) X-Ray 트레이싱만
D) CloudWatch Logs Insights

**정답: B**
해설: Lambda Destinations(2019)는 비동기 호출의 성공/실패 결과를 SNS/SQS/EventBridge/Lambda로 라우팅하면서 **원본 입력 + 응답 페이로드 + 실행 컨텍스트**를 모두 포함한 풍부한 이벤트를 전송한다. DLQ(A)는 페이로드만 남고 컨텍스트가 없는 legacy 방식. X-Ray(C)는 분산 트레이싱이지만 실패 이벤트 라우팅이 아님. CloudWatch Logs(D)는 사후 검색용이지 자동 라우팅이 아님. 함정: "비동기 + 실패 분석"이면 Destinations. 추가: Destinations와 DLQ를 동시에 설정하면 Destinations가 우선.

---

**문제 5.** 한 ML 추론 함수가 1.8GB의 PyTorch 모델 가중치를 포함한다. zip 기반 Lambda의 250MB unzipped 한도를 초과한다. 동시 실행 100개에서도 적절히 동작해야 한다. 가장 적합한 패키징은?

A) Lambda Layer 5개로 분산해 1.25GB 확보
B) Container Image(OCI)로 패키징, 최대 10GB
C) EFS 마운트로 모델만 외부에 저장
D) S3에서 매 호출마다 모델 다운로드

**정답: B**
해설: Container Image는 최대 10GB이고 ECR에서 lazy block-level loading으로 콜드 스타트도 빠르다(첫 호출 200~500ms). A는 5×50MB=250MB 한도라 불가능. C(EFS)는 가능하지만 EFS 마운트 latency와 비용이 추가되고 컨테이너 이미지가 표준. D는 매 호출마다 다운로드 시간·트래픽 비용이 발생하고 콜드 스타트가 폭증. 함정: ML 모델은 거의 Container Image가 답. 추가: AWS Deep Learning Containers에서 PyTorch/TensorFlow base image를 제공해 빌드 부담을 줄일 수 있고, Lambda의 block-level dedup으로 storage 비용도 효율적.

---

**문제 6.** 블랙프라이데이 세일 시작 시 0에서 5,000 Lambda 동시 실행으로 5분 안에 폭증한다. us-east-1 burst 한도는 3,000이고 그 이후 분당 +500 gradual. throttle 없이 트래픽을 받으려면?

A) Reserved Concurrency = 5,000 설정
B) Application Auto Scaling으로 PC를 세일 30분 전부터 5,000으로 미리 설정
C) 함수 메모리를 10GB로 증가
D) Function URL로 변경

**정답: B**
해설: Burst 한도(3,000)는 함수 동시성 한도와 별개의 초기 폭증 제한이다. 0→5,000을 5분 안에 달성하려면 PC로 미리 워밍업해야 한다. Application Auto Scaling은 스케줄 기반(예: 매주 금요일 19:30) PC 조정을 지원해 운영 부담을 줄인다. A(Reserved)는 상한이지 미리 띄우는 게 아니므로 burst 한도에 여전히 막힘. C는 cold start만 약간 줄임. D는 무관. 함정: "예측 가능한 트래픽 스파이크" 시나리오는 거의 PC + Auto Scaling이 답.

---

**문제 7.** Lambda 함수가 Python 3.11이고 NumPy/Pandas만 사용한다. 운영팀이 비용 20% 절감을 원한다. 가장 단순한 변경은?

A) 메모리를 절반으로 줄임
B) Graviton2(arm64) 아키텍처로 전환
C) Provisioned Concurrency 도입
D) Container Image로 전환

**정답: B**
해설: Graviton2(arm64)는 약 20% 단가 할인 + 19% 성능 향상을 거의 코드 변경 없이 제공한다. Python 3.11 + NumPy/Pandas는 ARM에서 동일하게 동작한다(PyPI에 arm64 wheel 제공). A(메모리 감소)는 실행 시간이 늘어나 오히려 비용이 증가할 수 있음(메모리=CPU 비례). C는 비용 증가. D는 아키텍처와 무관. 함정: Lambda Power Tuning은 메모리·CPU 최적점을 찾는 도구지만 아키텍처 변경만큼 큰 절감은 아니다. 추가: ARM이 안 되는 경우는 x86 전용 native binary(.so) 의존이나 CUDA 의존 정도다.

---

## 📌 오늘의 요약

1. **Firecracker micro VM**으로 격리, Slot 풀에서 워밍업 → 콜드 스타트 분해(다운로드/런타임/Init/JIT)
2. **동시성 3종**: 계정 한도(1,000 기본) / Reserved(격리+상한) / Provisioned(따뜻함, 비용 발생)
3. **SnapStart**(CRaC 기반) — Java/Python/.NET, 무료, init uniqueness 주의
4. **Hyperplane ENI**(2019~) — VPC 통합 시 ENI 공유, **RDS Proxy**로 connection 폭증 해결
5. **비동기 재시도** 2회 자동 + **Destinations**(SNS/SQS/EB/Lambda)로 풍부 라우팅
6. **Function URL** — API GW 우회 단순 HTTPS, IAM 인증만
7. **Container Image 10GB** + block-level lazy loading, **Graviton2 ARM 20% 절감**
8. **Burst Concurrency** 한도(us-east-1=3,000) → 예측 가능 스파이크는 PC + Auto Scaling
