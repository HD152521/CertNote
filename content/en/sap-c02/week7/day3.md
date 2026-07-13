# Day 3 - Fargate Cost Anatomy — Serverless Container's Real Price Tag

"Fargate is expensive" is half-true. Looking at the price list alone, it is roughly 2× more expensive per vCPU than EC2, but that omits node ops, idle resources, and bin-packing inefficiency. Compare an EC2 cluster averaging 30% node utilization to a Fargate Task running ~100% loaded—results flip. SAP exams drill this precise breakpoint with one to two questions per domain. "Variable traffic, 24/7 ops," "Peak 10× baseline," "GPU inference"—answers branch among EC2, Fargate, Lambda.

This article dissects Fargate's billing structure per second, showing why vCPU-memory combinations form peculiar matrices. Then we examine three discount levers—Fargate Spot, Compute Savings Plans, Graviton ARM—combined to halve per-unit cost. Finally, image pull cold-start, SOCI lazy loading, Lambda/EC2 breakpoints. Before the next service mesh topic, we aim to build intuition for "when Fargate doesn't fit."

## Fargate Billing's Fine Structure — Per-Second + 1-Minute Floor

Fargate bills vCPU-hours and memory-hours separately. Roughly, us-east-1 rates are **vCPU $0.04048/h**, **memory $0.004445/GB-h**. Billing granulates per-second but with a 1-minute floor applied. Even 30-second Task completion gets billed as 1 minute.

First cost trap: **image pull time is included in billing**. Fargate lacks node cache, so every Task downloads images from ECR fresh. Large images take 30-60 seconds. Task time during traffic receipt blockage burns vCPU/memory costs. Short jobs (batch 30s) with large images (2GB) see pull cost exceed job cost.

```
[Task startup]
  │ (1) Micro-VM boot ~3s            ← Billing begins
  │ (2) ECR image pull 30-60s         ← Cost flows
  │ (3) Container runs + job processes ← Real work
  │ (4) Graceful shutdown            ← Billing ends
[Task termination]
```

> 💡 **Related Theory**: Cloud container service billing exemplifies **fine-grained billing**. EC2 hourly, Lambda millisecond, Fargate second-granular (1-minute floor). This difference is decisive per workload shape. Lambda's 1ms granularity dominates short, frequent calls (100ms per request); EC2 hourly favors long, steady load (24/7). Fargate optimizes "minute-to-hour scale, appearing then vanishing" workloads. Billing model evolution appears in AWS' *"Serverless Architectures with AWS Lambda"* whitepaper and NSDI 2020 Firecracker paper.

## vCPU·Memory Combination's Strange Matrix

Fargate Task Definition's vCPU-memory assignment is confusing because arbitrary values fail; only preset matrices work.

| vCPU | Allowed Memory |
|------|--------|
| 0.25 | 0.5, 1, 2 GB |
| 0.5  | 1-4 GB (1GB unit) |
| 1    | 2-8 GB (1GB unit) |
| 2    | 4-16 GB (1GB unit) |
| 4    | 8-30 GB (1GB unit) |
| 8    | 16-60 GB (4GB unit) |
| 16   | 32-120 GB (8GB unit) |

This matrix exists because Fargate internally runs on EC2 instance families. AWS exposes the vCPU-memory ratios (1:2, 1:4, 1:8) directly. 8 vCPU / 64GB (1:8) memory-heavy combinations work, but 0.25 vCPU / 32GB unrealistic pairing is rejected.

Unaware users attempting "32GB memory + 0.5 vCPU" get registration failure. Need more memory? Must increase vCPU proportionally, raising costs. One reason Fargate costs more than EC2 for some workloads: forcing vCPU purchase alongside memory needs. Memory-intensive workloads (in-memory cache, JVM heap) pay for unwanted vCPU.

> 🔍 **Deeper Dive**: Matrix workaround pattern: **multi-container Task**. Single Task with main container (0.25 vCPU, 0.5GB) + sidecar (0.25 vCPU, 1.5GB) totals 0.5 vCPU·2GB overall, using `memoryReservation` in container specs to concentrate memory. Works only well on EC2 Launch Type; Fargate stricter isolation limits effectiveness. SAP exams don't ask this deeply, but real-world sees it often.

## Fargate Spot — The ~70% Discount Cost

Fargate Spot discounts ~70% off standard Fargate. Tradeoff: AWS reserves reclamation rights, signaling with **2-minute SIGTERM before killing**. Within 2 minutes, graceful shutdown (finish in-flight requests, requeue messages, flush cache) must complete.

```
[Spot Task runs normally]
   │
[AWS detects capacity shortage → reclamation decision]
   │
[Task receives SIGTERM]  ← 2-minute countdown starts
   │
[Application graceful shutdown:
  - Deregister from ALB Target Group
  - Complete in-flight responses
  - Reset SQS message visibility timeout]
   │
[2 minutes elapsed → SIGKILL]
[Task forcefully terminated]
```

Fargate Spot fits:
- **Stateless back-office APIs**: Short requests, instant replacement available
- **Batch jobs**: Restartable workers
- **Dev/staging**: Cost over availability priority

Poor fit:
- **Long transactions** (reclamation rollback costs)
- **Stateful** (in-memory sessions, WebSocket long connections)
- **Real-time** (no SIGTERM response time)

ECS Service Capacity Provider mixes with weight and base. Example: base=2, FARGATE weight=1, FARGATE_SPOT weight=4 → first 2 Tasks always On-Demand, then 20:80 ratio.

```bash
aws ecs put-cluster-capacity-providers \
  --cluster prod \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    'capacityProvider=FARGATE,weight=1,base=2' \
    'capacityProvider=FARGATE_SPOT,weight=4'
```

> 💡 **Related Theory**: Spot instances' principle is **price discovery via auction**. AWS datacenters always have some idle capacity buffer; selling at list price finds insufficient demand. Instead, selling at market price (spot price) with reclamation rights when on-demand demand spikes. Reclamation notice duration (2-minute SIGTERM) is calibrated as minimum for graceful shutdown. EC2 Spot averages <5% reclamation, but Fargate Spot's smaller pool may see higher rates (official figures private).

> 📚 **Case Study**: 2023, Pinterest migrated some backend workloads to ECS Fargate + 80% Fargate Spot, cutting container infrastructure costs ~40%. They standardized 120-second `STOPTIMEOUT`, SIGTERM handlers for graceful HTTP request draining, and SQS message visibility timeout reset patterns. re:Invent 2023 CON401.

## Compute Savings Plans — Commitments Discounted for Fargate Too

Savings Plans (SP) offer discounts when users commit "I'll buy N dollars worth of compute hourly for 1 or 3 years." Two types; Fargate uses **Compute Savings Plans**.

| Type | Applies to | Discount | Flexibility |
|------|-----------|----------|------------|
| **EC2 Instance SP** | Specific EC2 family+region only | ~72% | Low (family, region fixed) |
| **Compute SP** | EC2 + Fargate + Lambda all | ~66% | Very high (family, region, service free) |

Compute SP's power is **flexibility**. Buy $10/h compute on 1-year commitment; apply it to ECS Fargate, EC2, Lambda interchangeably. During EC2-to-Fargate migration, commitment survives, preventing cost spikes.

```
[Compute SP $10/h commitment]
       │
       ├─ EC2 m5.xlarge × 2 $0.38/h → Auto-applies SP
       ├─ Fargate Task 5 × $4.20/h → Auto-applies SP
       └─ Lambda invocation $5.42/h → Auto-applies SP
                                      Total within commitment
```

Spot and Compute SP are **distinct discount mechanisms**, so Fargate Spot doesn't stack SP on top (Spot discount alone applies). On-Demand portions receive SP. So Capacity Provider mixing (base=2 On-Demand + Spot 80%) yields **dual discount pattern**: On-Demand gets SP discount, Spot gets Spot discount.

> 🔍 **Deeper Dive**: Reserved Instances (RI) predate SP, with separate programs per EC2/RDS/ElastiCache. RI fixes instance type and includes capacity reservation; SP skips capacity reservation, providing billing discounts only. AWS' 2019 SP announcement effectively signaled "RI no longer recommended," making SP standard for new workloads. SAP exams: "flexibility, multi-service" → Compute SP; "EC2 fixed, max discount" → EC2 Instance SP; "storage/DB capacity assurance required" → RI.

## Graviton (ARM64) — Same Workload, 20% Cheaper

Fargate supports x86_64 and ARM64 (Graviton2-based). ARM64 costs ~20% less for identical performance. Change Task Definition's `runtimePlatform.cpuArchitecture` to `ARM64`—that's it.

```json
{
  "family": "myapp",
  "runtimePlatform": {
    "cpuArchitecture": "ARM64",
    "operatingSystemFamily": "LINUX"
  },
  "cpu": "1024",
  "memory": "2048",
  ...
}
```

Prerequisite: container images **must be multi-architecture built**. Use `docker buildx` to push both amd64 and arm64; Fargate auto-selects the right image. Some native binaries (C/C++) or ML libraries lack ARM64 support yet, requiring pre-migration dependency checks.

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t myrepo/myapp:1 --push .
```

> 📚 **Case Study**: 2022, Snap migrated some backend microservices to Graviton2 Fargate, achieving ~22% cost savings. Biggest work: securing ARM64 builds of dependent libraries (especially JNI-bound Java libraries, native node-gyp modules). AWS re:Invent 2022 CMP301 presentation. Core lesson: 80% of Graviton savings comes from infra change, 20% from dependency cleanup.

> 💡 **Related Theory**: ARM64's cheaper per-unit cost stems from two factors. First, AWS designs the chip, avoiding Intel/AMD royalties. Second, ARM (RISC) architecture packs more cores per transistor (Graviton3 = 64-core/socket). Same datacenter space and power yield more compute—the cost difference's essence. This trend parallels Apple Silicon (M1-M3), likely making ARM the cloud's default.

## Three Discount Levers Combined

Fargate Spot (70%) + Compute SP (66%) + Graviton (20%) are orthogonal discounts; combining yields large cumulative effect, though multiplicatively coupled rather than purely additive.

**Scenario: Back-office API, 1-year operation, average 5 Tasks × 1 vCPU × 2GB memory**

| Configuration | Per-Month Cost | Notes |
|---------------|----------------|-------|
| Baseline: x86 Fargate On-Demand 100% | ~$200 | Reference |
| + Graviton ARM | ~$160 | -20% |
| + Compute SP 1-year commitment | ~$108 | -32% (SP discount) |
| + Capacity Provider base=2 + Spot 80% | ~$60 | Spot portion adds savings |
| Total savings | **~70%** | |

Interesting: Spot and SP are **mutually complementary**. Spot carries reclamation risk; SP carries commitment burden. Mixed, stable portion (SP + On-Demand) and variable portion (Spot) naturally separate.

> 🎯 **Scenario**: "A SaaS runs back-office API on ECS Fargate. Average traffic: 5 Tasks; marketing campaigns spike to 30 Tasks. 1-year commitment possible; reclamation tolerable. Cost-optimal config?" — **Compute SP 5-Task commitment + Capacity Provider (base=2 On-Demand + Spot 80%)**. Anchor baseline 5 Tasks with SP, handle excess traffic via Spot. base=2 ensures minimum availability on reclamation. Resources within SP limit get SP discount; beyond limit get Spot discount. Two levers naturally bifurcate.

## Image Pull and Cold-Start — SOCI as New Option

Fargate cold-start's biggest culprit: **image pull**. No node cache means ECR downloads, decompresses entire images each Task. 2GB images take network + decompression time.

Three solutions:

**1. Shrink images themselves.** Distroless, Alpine, multi-stage build to <200MB. Most impactful.

**2. ECR Pull Through Cache.** Cache Docker Hub, quay.io images in ECR. Reduces external network cost, failure risk.

**3. SOCI (Seekable OCI).** Lazy-load images. Container reads only needed files from network; rest fetch backgrounded. Huge ML images (8GB+) see 50-80% startup reduction.

```
[Traditional pull]
ECR ────[entire 2GB]────► Task decompress 30s ► Execute

[SOCI lazy]
ECR ────[manifest + index]────► Task execute immediately
       │                          │
       └─[fetch needed files only]┘ Backgrounded
                              (typically 200-500MB actual use)
```

SOCI requires ECR pre-indexing; user-side changes minimal. Fargate Task Definition auto-applies.

> 🔍 **Deeper Dive**: SOCI's lazy-load concept derives from **demand paging** (OS virtual memory). OS doesn't load entire process memory upfront; pages only load on fault. Container filesystem similarly: only subset of files read in practice. Academia covered this in ATC 2016's "Slacker: Fast Distribution with Lazy Docker Containers"; SOCI implements it atop OCI standard.

> ⚠️ **Trap**: SOCI's benefit scales with image size; small images (<100MB) see index overhead exceed gains. "Enable SOCI on all images" is wrong. Small images are faster fetched directly.

## Lambda vs. Fargate vs. EC2 Cost Breakpoints

Placing identical workload among three compute options is SAP's canonical scenario. Breakpoints hinge on workload **lifetime**, **frequency**, **resource size** axes.

| Workload | Lambda | Fargate | EC2 |
|----------|--------|---------|-----|
| 100ms × 10k/day (short, frequent) | ⭐ Optimal | Expensive | Most expensive |
| 5min × 100/day (mid-range) | Near limits | ⭐ Optimal | Idle overage large |
| 24/7 × 4 Tasks (long, steady) | Unsuitable | Expensive | ⭐ Optimal (RI/SP) |
| GPU inference | Unsupported | Limited | ⭐ G/P series |
| Variable + spiky | Good | ⭐ Capacity Provider | Over-provisioning |

**Empirical breakpoints**:
- Average 40%+ utilization + 24/7 steady = EC2 + Compute SP
- Variable + Spiky + 5min+ = Fargate
- 100ms-5min events = Lambda (max 10GB memory)

Lambda since 2020 supports 10GB memory, 6 vCPU, 15-minute execution, replacing some Fargate. Back-office APIs requiring connection pools still favor Fargate.

> 📚 **Case Study**: 2023, a log analysis company moved some batch jobs from Fargate to Lambda. Job duration: 3min average; frequency: 200/hour; memory: 4GB. Fargate: 2 Tasks always-on, idle costs high. Lambda: billed only for execution, slashing monthly cost ~60%. Tradeoff: Lambda cold-start (VPC connection 1-2s) acceptable.

## Application Auto Scaling — Fargate's Standard Auto-Scaling

ECS Service Task count adjusts via **Application Auto Scaling**, a separate service powering ECS, DynamoDB, Aurora, SageMaker scalers.

Three policy types:
- **Target Tracking**: "Keep CPU average at 60%," most common.
- **Step Scaling**: "CPU >70% add 2, >85% add 5," discrete steps.
- **Scheduled**: "Weekday 9am min=10, 10pm min=2," time-based.

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/prod/myapp \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 50

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/prod/myapp \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-target \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 60.0,
    "PredefinedMetricSpecification":
      {"PredefinedMetricType":"ECSServiceAverageCPUUtilization"}
  }'
```

Target Tracking internally auto-creates CloudWatch alarms adjusting desired count. Mechanically close to PID control, but AWS's implementation is simple proportional. Default pattern: scale-up fast, scale-down slow—stable against traffic churn.

> 💡 **Related Theory**: Auto-Scaling applies **control theory**. Measures value (CPU%), target (60%), error difference, adjusts actuator (Task count). Proper PID uses integral/derivative terms; AWS Target Tracking resembles simple P-control. Simpler risks oscillation, so long scale-in cooldown is standard. Netflix built **Scryer**, a predictive autoscaler, ML-predicting traffic patterns past this limitation.

## Summary

Fargate looks expensive on price sheets alone, but Fargate Spot (70%) + Compute SP (66%) + Graviton (20%) combined run workloads ~70% cheaper. Price comparison hinges most on **average utilization** and **traffic variability**. Steady 40%+ 24/7 → EC2 + SP wins; otherwise Fargate wins operationally.

Tomorrow we cover service mesh and service discovery. ECS Service Connect, AWS Cloud Map, App Mesh differences; how mTLS, canaries, circuit breakers implement. Ten microservices on Fargate—how inter-service communication becomes safe and observable.

---

## 📝 연습 문제

**문제 1.** 한 SaaS가 ECS Fargate로 백오피스 API를 운영한다. 평균 트래픽은 5 Task로 충분하지만 마케팅 캠페인 때 30 Task까지 폭증한다. 1년 약정 가능, 일부 회수 허용. 비용 최적 구성은?

A) FARGATE On-Demand 100%, EC2 Instance Savings Plans
B) FARGATE_SPOT 100%
C) Compute Savings Plans 5 Task 약정 + Capacity Provider(base=2 FARGATE + FARGATE_SPOT 80%)
D) EC2 Launch Type + Reserved Instance

**정답: C**
A SaaS operates back-office API on ECS Fargate. Average traffic needs 5 Tasks; marketing campaigns spike to 30. 1-year commitment possible; some reclamation tolerable. Cost-optimal config?

Two traffic profiles (stable 5-baseline + variable spike) matched with two discount levers: SP anchors stable portion, Spot handles variable. base=2 On-Demand ensures minimum availability on Spot reclamation. A: EC2 Instance SP doesn't apply to Fargate. B: All Spot risks simultaneous reclamation outage. D: EC2 RI inefficient against spike variability. Trap: "Can't use Spot and SP together" is false—different resources, so naturally coexist.

---

**문제 2.** Fargate Task Definition에 cpu=512(0.5 vCPU), memory=8192(8GB)를 설정하니 등록 실패. 원인은?

A) 메모리는 8192 대신 8GB로 입력해야 함
B) 0.5 vCPU에 허용되는 메모리는 최대 4GB
C) Fargate는 8GB 이상 메모리 미지원
D) Task Role 미설정

**정답: B**
Fargate Task Definition setting cpu=512 (0.5 vCPU), memory=8192 (8GB) fails registration. Root cause?

Fargate's vCPU-memory matrix: 0.5 vCPU allows only 1-4GB. Need 8GB? Increase vCPU to 1 (1 vCPU + 2-8GB). Matrix stems from Fargate's underlying EC2 families' vCPU-memory ratios (1:2, 1:4, 1:8). A: Unit notation (8192 vs. 8GB) unrelated to registration failure. C: Up to 16GB supported, so false. D: Registration independent of Task Role. Trap: Attempt increasing only memory while keeping vCPU—typical wrong-answer pattern.

---

**문제 3.** Fargate 콜드 스타트가 평균 60초나 걸린다. 이미지 크기는 4GB이고, 머신러닝 추론용이다. 시작 시간을 가장 효과적으로 줄이는 방법은?

A) ECS Service의 desired count를 미리 늘려두기
B) SOCI(Seekable OCI) 인덱스 생성 후 Fargate에서 lazy 로딩 활용
C) ECR Replication으로 다른 리전에 복제
D) Compute Savings Plans 적용

**정답: B**
Fargate cold-start averages 60 seconds. Image: 4GB, ML inference. Most effective startup reduction?

SOCI standardizes lazy-loading for large images. Container reads only actual-need files from network; rest fetches backgrounded, reducing startup 50-80%. 4GB ML image is SOCI's sweet spot. A: Pre-sizing desired count doesn't solve cold-start (warm-up ≠ cold avoidance). C: Same-region Pull speed unaffected by replication. D: Cost discount, not speed. Trap: "Shrink image itself" is correct but impractical for ML models/libraries—SOCI more realistic.

---

**문제 4.** 한 회사가 EC2와 Fargate를 동시에 쓴다. 1년 약정 할인을 받되 EC2와 Fargate에 모두 적용되어야 하고, 마이그레이션 중 워크로드를 EC2에서 Fargate로 이동해도 할인이 유지되어야 한다. 어떤 약정을 쓰는가?

A) EC2 Instance Savings Plans
B) Compute Savings Plans
C) Standard Reserved Instance
D) Convertible Reserved Instance

**정답: B**
Company uses EC2 and Fargate simultaneously. Needs 1-year commitment discount applying to both; discount persists during EC2-to-Fargate workload migration. Which commitment?

Only Compute SP applies across EC2 + Fargate + Lambda, auto-tracking through migration. A: EC2 Instance SP (family, region fixed) excludes Fargate. C/D: RI is EC2-only, billing model (capacity reservation vs. pure discount) differs from SP. Bonus: Compute SP's auto-application requires no instance specification or modification.

---

**문제 5.** 머신러닝 추론 워크로드. 평균 100ms 처리, 시간당 5만 회 호출, 메모리 3GB. 가장 비용 효율적인 컴퓨트는?

A) Lambda
B) Fargate On-Demand
C) Fargate Spot
D) EC2 + Reserved Instance

**정답: A**
ML inference workload: 100ms average processing, 50k/hour calls, 3GB memory. Most cost-efficient compute?

Lambda's 1ms billing dominates short, frequent calls. 100ms × 50k = 5,000s/hour = 1.4 hours' billed time. Fargate (B, C): 1-minute floor + Task overhead while idle = higher cost. EC2 (D): 1 instance × 24h = always-on highest cost. Trap: 3GB within Lambda's 10GB limit. Over-limit or cold-start sensitivity shifts to Fargate. Bonus: Lambda Provisioned Concurrency nearly eliminates cold-start.

---

**문제 6.** Fargate Spot Task가 SIGTERM을 받았다. 2분 안에 graceful shutdown을 보장하기 위한 표준 패턴은?

A) `stopTimeout`을 기본값 30초로 두고 SIGTERM은 무시
B) `stopTimeout`을 120초로 늘리고 애플리케이션에 SIGTERM 핸들러 구현 (in-flight 요청 마무리, ALB deregister, 큐 visibility 해제)
C) 애플리케이션을 그대로 두고 ALB Health Check만 짧게 설정
D) Fargate Spot 대신 Lambda로 대체

**정답: B**
Fargate Spot Task receives SIGTERM. Standard pattern ensuring 2-minute graceful shutdown?

Standard: dual config. Extend `stopTimeout` (default 30s, max 120s) letting ECS wait until SIGKILL. Application code: SIGTERM handler executing ① reject new requests ② complete in-flight responses ③ ALB Target Group deregister ④ SQS message visibility timeout reset ⑤ close DB. A: Ignores graceful shutdown entirely. C: ALB alone can't guarantee in-flight requests. D: Overkill workload replacement. Pinterest case identical.

---

**문제 7.** Fargate Task가 평균 노드 사용률 60%로 24/7 운영된다. 평균 8 Task가 항상 떠 있다. 1년 약정 가능. 비용 면에서 가장 유리한 선택은?

A) Fargate On-Demand + Compute SP 1년
B) Fargate Spot 100%
C) EC2 Launch Type + Compute SP 1년 + Bin Packing
D) Lambda 변환

**정답: C**
Fargate Task: average 60% utilization, 24/7 operation. 8 Tasks always-on. 1-year commitment possible. Most cost-advantageous?

60% utilization + 24/7 + steady load = EC2's domain. Bin-packing spreads multiple Tasks per node, unit cost lower; Compute SP adds 1-year commitment discount. A: Fargate ~2× pricier per vCPU than EC2; even with identical SP, EC2 wins. B: 24/7 stable load + Spot reclamation risk mismatched. D: 24/7 + 8 Tasks → Lambda conversion yields low call frequency, poor efficiency. Trap: Price-list-only view chooses "Fargate + SP" wrongly. 24/7 + high utilization = EC2 superior.

---

## 📌 오늘의 요약

1. **Fargate billing = vCPU·hours + memory·hours**, per-second minimum 1-minute, **image pull time billed**
2. **vCPU-memory matrix**: 0.5 vCPU = 1-4GB, 1 vCPU = 2-8GB etc., EC2 family ratios exposed
3. **Fargate Spot 70% discount** + 2-min SIGTERM, base=2 + Spot 80% Capacity Provider standard pattern
4. **Compute Savings Plans only** cover Fargate·EC2·Lambda; EC2 Instance SP EC2-only
5. **Graviton ARM64** adds 20% savings, multi-arch build prerequisite
6. **SOCI lazy-load** cuts large-image cold-start 50-80%
7. **40%+ utilization + 24/7 = EC2 + SP**, else variable/spiky = Fargate, short/frequent = Lambda
