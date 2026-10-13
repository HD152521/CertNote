# Day 1 - Lambda Advanced: Concurrency, Cold Starts, and SnapStart's Internal Operations

When you first launch a Lambda function, everything feels magical. You upload code as a zip or point to a container image, and someone else automatically spins it up and scales it. But the moment traffic suddenly surges 10x in production, questions emerge: "Why did my response time jump from 50ms yesterday to 5 seconds today?" The answer is almost always one of three things: concurrency limits, cold starts, or VPC ENI exhaustion.

In the SAP-C02 exam, Lambda is the centerpiece of the serverless domain. Simple "event → function execution" problems rarely appear. Most questions focus on operational perspectives: "What's the most cost-efficient way to handle traffic spikes?", "How do I reduce cold starts without additional cost?", "How do I avoid ENI explosion when Lambda accesses RDS Proxy inside VPC?" Today, we examine the internal operations that create these operational challenges.

## Firecracker and Lambda Execution Model — Why Micro VMs Were Chosen Over Containers

Many resources call Lambda a "container service," but technically it's not. Each function instance runs on a **Firecracker** micro VM atop its own Virtual Machine Monitor (VMM). Firecracker, which AWS open-sourced in 2018, was built to replace QEMU and reduced boot time to approximately 125ms.

Why micro VMs instead of containers (cgroups + namespaces)? The core reason is **isolation strength in multi-tenant environments**. Hundreds of customer functions can run side-by-side on a single bare metal server, but container-only isolation cannot prevent side-channel attacks (e.g., Spectre, Meltdown) due to kernel sharing. Firecracker runs on KVM while radically minimizing the device model, reducing VM boot overhead to container-like levels.

> 💡 **Related Theory**: Firecracker is detailed in the NSDI 2020 paper "Firecracker: Lightweight Virtualization for Serverless Applications." The key insight is that a minimal VMM (under 20,000 lines of Rust code) minimizes attack surface. The same technology powers Fargate, so "Lambda and Fargate are different abstractions over essentially the same isolation technology" is an accurate mental model. From a CS perspective, Lambda provides a stateless function abstraction while Fargate provides a stateful container abstraction, leading to different use cases.

> 🔍 **Deeper Dive**: Firecracker doesn't create new micro VMs for every invocation. AWS maintains a pool of **Slots** (pre-warmed micro VMs) on **Workers** (bare metal EC2 instances). When a cold start request arrives, AWS retrieves a Slot, injects function code, and executes init. Cold start time thus decomposes into: (1) Slot allocation — nearly 0 (2) Code download and decompression — proportional to zip/image size (3) Runtime bootup — Java JVM is heaviest (4) Init code execution — user responsibility. In exam questions asking "how to reduce cold start," the correct answer typically targets one of (2), (3), or (4).

## Breaking Down the Three Types of Concurrency

Concurrency is one of Lambda's most confusing concepts. The same word is used with three different meanings.

| Type | Meaning | Impact |
|------|---------|--------|
| **Account Concurrency Limit (Unreserved)** | A shared pool per region across all functions. Default 1,000 (soft limit). | One runaway function throttles others |
| **Reserved Concurrency** | Reserve part of the pool for a specific function. Also acts as an upper limit. | Isolation + upper bound |
| **Provisioned Concurrency (PC)** | Maintain N pre-warmed (initialized) instances. | Zero cold start, but costs apply |

Reserved and PC can be used together. For example, "this function is Reserved=200, PC=50" means 50 instances are always warm, traffic above that scales up to 150 cold, and requests exceeding 200 are throttled.

> ⚠️ **Trap**: Exam options often say "Setting Reserved Concurrency means only N instances can run." More precisely, **it guarantees N concurrent executions while acting as an upper limit**. Reserved=10 means at most 10 simultaneous executions; beyond that is throttled. Overlooking the "upper limit" aspect leads to incorrect scenario analysis.

> 📚 **Case Study**: In 2019, a fintech company experienced Lambda payment processing throttling due to a nighttime batch function traffic spike. Both functions shared the same account concurrency pool (1,000); the batch function occupied 950 during one hour, leaving only 50 for payment processing, causing a ~30% payment failure rate. The fix: assign Reserved=500 to the payment function for isolation. The SAP exam's "one function affects another" scenario follows exactly this pattern.

## Cold Start — Decomposing Causes Reveals Solutions

Lambda cold start time is cumulative, not a single number. By AWS official data, a Java 11 Lambda cold start breaks down as:

- **AWS Side** (code download + Slot allocation + runtime bootup): 100~600ms
- **Init Code** (user code class loading, DB connection pool initialization, etc.): 1~5 seconds (Java baseline)
- **First Handler Execution**: 200~1,000ms (JIT warmup)

The largest component is **Init Code**. A Java Spring Boot function can lose 2~3 seconds loading thousands of classes. SnapStart is the tool to address this.

**SnapStart's Operating Principle:**
1. When publishing a function version, AWS executes Init once.
2. At that moment, AWS captures and encrypts the micro VM memory and disk state as a snapshot.
3. On the next cold start, instead of re-executing init, the snapshot is restored via the **CRaC (Coordinated Restore at Checkpoint)** mechanism.
4. After restoration, the handler executes immediately.

> 💡 **Related Theory**: CRaC is an official OpenJDK project that standardizes checkpoint and restore of Java JVM process state. It's based on CRIU (Checkpoint/Restore In Userspace), a Linux kernel feature. SnapStart adopted CRaC, first for Java, then extended to Python and .NET in 2024. The core model follows a general distributed systems optimization pattern: **"initialize once, run infinitely."**

> 🔍 **Deeper Dive**: SnapStart is free because AWS benefits from better compute efficiency. Executing init on every cold start costs more CPU, memory, and network than restoring a pre-built snapshot from page cache. However, a pitfall exists: the snapshot **copies memory and disk state identically**, so random seeds, unique IDs, and DB connection TCP states created during init are identical across all restorations. That's why SnapStart guidelines emphasize "don't generate uniqueness state during init," and provide Crac.Resource interface hooks for beforeCheckpoint/afterRestore.

> ⚠️ **Trap**: Enabling SnapStart breaks the stateless function assumption. For example, if init generates a UUID.randomUUID() as an instance ID for cache keys, all SnapStart restorations get the same ID, causing cache collisions. The exam doesn't ask directly, but it's a common real-world pitfall worth knowing.

## VPC Integration and Hyperplane ENI — Before and After 2019

Lambda functions accessing RDS or ElastiCache inside VPC require VPC integration. Before 2019, Lambda VPC integration was notoriously problematic: each new concurrent execution **attached a new ENI**, and ENI creation took 10~15 seconds. With 100 concurrent executions, 100 ENIs were created, hitting VPC ENI limits (typically ~5,000 per subnet), causing function timeouts.

In September 2019, AWS completely redesigned this with the **Hyperplane ENI** architecture. Hyperplane is an AWS internal network virtualization layer (also powering VPC, NAT GW, NLB) operating as follows:

1. On first use of a function and VPC/Subnet/SG combination, a single cross-account ENI is created.
2. That ENI is **shared** by function instances. Even 100 concurrent executions typically end with just a few ENIs.
3. When the function becomes inactive, the ENI persists briefly before garbage collection.

This change made VPC Lambda cold starts nearly identical to non-VPC cold starts. Exam questions like "how do I avoid ENI explosion with Lambda VPC integration" are now rare, but understanding "ENI count per function is not proportional to concurrency" remains operationally important.

> 🔍 **Deeper Dive**: Hyperplane acts as a distributed NAT/LB layer inside AWS, similar to systems like **Andromeda**. NLB, PrivateLink, Lambda VPC ENI, NAT Gateway, and S3 Gateway Endpoint all run on Hyperplane. This means Lambda VPC integration "uses subnet IPs but actual traffic routes through Hyperplane" is the architectural insight. The AWS re:Invent 2019 session "A Serverless Journey: AWS Lambda Under the Hood" is the best primary source.

> 🎯 **Scenario**: "A company sends 500 queries/second from a Lambda to a VPC RDS PostgreSQL with max_connections=200. When concurrent executions grow to 1,000, 'too many connections' errors appear. Best solution?" — Answer: **RDS Proxy**. The Lambda → RDS Proxy → RDS pattern applies connection multiplexing (pooling), binding 1,000 Lambda instances to ~50 RDS connections. Additionally, RDS Proxy provides IAM auth and connection holding during failover. Exam keywords "Lambda + RDS + concurrency + connection error" almost always point to RDS Proxy.

## Asynchronous Invocation's Retry Model and Destinations

Lambda invocations come in three types — synchronous, asynchronous, and stream-based — each with different retry models.

| Invocation Model | Caller | Retries |
|----------|--------|---------|
| **Synchronous (Sync)** | API GW, ALB, Function URL, direct invoke | Caller's responsibility (Lambda doesn't retry) |
| **Asynchronous (Async)** | S3 Event, SNS, EventBridge | Lambda auto-retries 2x (3 total attempts) |
| **Stream Poll** | SQS/Kinesis/DDB Streams | ESM retries + DLQ/PartialBatch |

Failure handling for async invocations uses two approaches: **DLQ** (legacy, function execution failures only) and **Destinations** (2019, routes success and failure). Destinations are recommended, supporting four targets (Lambda, SNS, SQS, EventBridge).

> 📚 **Case Study**: In 2020, an e-commerce company ran an S3 → Lambda (image resize) pipeline with DLQ but struggled tracking "at which stage and with what input did failure occur?" Switching to Destinations, sending OnFailure to EventBridge, the failure event contained original input + response payload + execution context, simplifying analysis. DLQ preserves only the payload without context.

## Function URL — Bypassing API Gateway for Simple HTTPS

Function URL, launched in 2022, provides direct HTTPS endpoints to Lambda functions. Access is possible without API Gateway via https://<id>.lambda-url.<region>.on.aws. Authentication is NONE or IAM (AWS_IAM). CORS and CloudFront front-end are supported.

When to use:
- **Single function not worth API GW overhead** (simple webhook receiver, status endpoint, etc.)
- **Wanting to reduce API GW costs** (API GW costs $3.50/M per invocation; Function URL has no per-invocation cost — only Lambda invocation charges)
- **Caching behind CloudFront**

When not to use:
- API GW features needed (API keys, throttle, JWT validation)
- Non-REST protocols like WebSocket or SOAP
- Routing multiple functions under one domain

> ⚠️ **Trap**: Function URL supports only IAM authentication, not Cognito User Pool integration. JWT-based user authentication requires API GW + Cognito Authorizer. In exams, "Cognito user auth + Lambda" scenarios almost always point to API GW.

## Lambda Packaging — Layer vs Container Image

Function packaging supports two approaches.

| Method | Size Limit | Use Case |
|--------|-----------|----------|
| **zip + Layer** | zip 50MB (direct) / 250MB unzipped (S3), 5 layers max | General functions + shared libraries |
| **Container Image (OCI)** | 10GB | ML models, large binaries (ffmpeg, headless Chrome), existing container workflows |

Container Image pushes to ECR, then Lambda unpacks the image into the micro VM. The 10GB limit is large, but cold start can be longer (image pull time). However, Lambda uses **layer-wise lazy loading**, downloading only what's needed for first execution, reducing startup. This is detailed in the SOSP 2023 paper "Faster Cold Starts for Lambda with On-Demand Code Loading."

> 🔍 **Deeper Dive**: Lambda doesn't use the ECR original directly; instead, AWS stores the image in an internal distributed cache with **block-level deduplication**. If 10,000 functions use the same base image (e.g., public.ecr.aws/lambda/python:3.11), storage is consumed only once. During cold start, the entire image is not downloaded; only blocks needed for function execution are lazy-fetched. This enables even 10GB images to start first invocation in 200~500ms.

## Graviton2/3 (ARM) — 20% Savings Nearly Free

Lambda supports two architectures: x86_64 and arm64. arm64 (Graviton2) is ~20% cheaper and 19% faster. Without compatibility issues, ARM is almost always the answer.

When ARM cannot be used:
- Native binaries (x86-only .so/.dll) in libraries
- Some ML inference libraries (especially NVIDIA CUDA dependent)
- Container images not built multi-arch

Most Node.js/Python/Go/Java functions migrate to ARM unchanged. In SAP exams, "cost optimization" + "Lambda" keywords make ARM migration the first candidate.

## Lambda Burst Concurrency — The Limit on Sudden Traffic

Lambda doesn't scale to its concurrency limit (e.g., 1,000) instantly from 0. A **Burst Concurrency** initial spike limit exists, varying by region:
- us-east-1, us-west-2, eu-west-1: 3,000 burst
- ap-northeast-1, eu-central-1 and other major regions: 1,000 burst
- Other new regions: 500 burst

Beyond this, scaling increases +500 per minute gradually. So a workload needing 0 → 5,000 concurrent executions in under 5 minutes will face throttling (HTTP 429) for the first few minutes. To avoid this, pre-warm with Provisioned Concurrency.

> 🎯 **Scenario**: "Black Friday sale happens once monthly; 50x traffic surge in 5 minutes. Lambda must handle without throttle." — Answer: **Use Application Auto Scaling to increase Provisioned Concurrency on schedule**. Raise PC=2000 30 minutes before sale start, then reduce PC=10 after. PC charges per-hour, but throttle avoidance and consistent latency are worth more.

## Summary

On the surface, Lambda promises "just write code and it runs," but production operations are shaped by micro VM isolation, Hyperplane ENI, CRaC snapshots, and concurrency pooling, all determining cost and latency. Frequently tested exam scenarios map to four categories: "cold start (SnapStart vs PC vs init optimization)," "concurrency isolation (Reserved)," "VPC + DB connections (RDS Proxy)," and "ARM migration."

Next day, we'll see Step Functions, which lets you chain Lambda functions into workflows. The key next topic is how Step Functions supplements Lambda's limits (15-minute timeout, simple retry model).

---

## 📝 연습 문제

**문제 1.** Java 17 Spring Boot 기반 Lambda 함수의 콜드 스타트가 평균 4초다. 운영팀은 추가 비용 없이 이를 1초 이하로 줄이려 한다. 가장 적합한 방법은?

A) Provisioned Concurrency = 100 설정
B) SnapStart 활성화 + init에서 uniqueness state 제거
C) 메모리를 10GB로 올림
D) Function URL로 전환

**정답: B**
해설: "추가 비용 없이"가 핵심. Provisioned Concurrency(A)는 시간당 과금이 발생한다. SnapStart는 무료이고 Java/Python/.NET 모두 지원한다. CRaC 기반 스냅샷 복원으로 init 시간이 거의 0이 된다. 다만 init에서 uniqueness state(난수 시드, UUID, DB connection의 TCP 상태)를 만들면 모든 복원본에 복제되어 충돌이 생기므로 Crac.Resource 인터페이스로 beforeCheckpoint/afterRestore에서 재초기화해야 한다. C는 비용 증가, D는 콜드 스타트와 무관. 추가 학습: SnapStart는 publish된 버전에만 적용되고  적용 안 됨.

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
