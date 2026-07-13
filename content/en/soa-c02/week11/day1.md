# Day 1 - Compute Optimizer: How 14 Days of Metrics Resize Instances

Cloud's costliest mistake isn't failure but **neglect**. Someone provisioned m5.4xlarge "generously" three years ago; the service actually needs m5.large but no one revisits. CPU averaging 4% runs 24/365 at full price. On-premises this waste stayed hidden—server was sunk cost. Cloud bills hourly, so over-provisioning hits invoices instantly. **Right Sizing** is narrowing the gap: provisioned capacity vs actual usage.

The problem: humans can't eye-measure. CPU alone misses memory; averages miss peaks; one instance misses two hundred. **AWS Compute Optimizer** delegates to ML—learns 14 days of metrics, auto-outputs "downsize this to m5.large, save $X/month." This article dives into where that recommendation comes from, why missing memory metrics breaks recommendations, and what EC2 instance family alphabet codes actually mean as hardware.

## Right Sizing's Root—Statistical Multiplexing and Over-Provisioning History

Over-provisioning isn't cloud-created; cloud **exposed** it. Datacenter-era server average utilization remained **10~15%** per surveys. Reason: buying to peaks. Black Friday traffic meant 1-year at that capacity, 364 days idle. Virtualization raised this slightly but peak-buying structures persisted.

Cloud promised to flip this—rent when needed, stop when unused (elasticity). But humans kept old habits: provision "generously," forget to stop. So cloud servers still run 10% utilization. Difference: now that waste converts to **hourly billing visible**. Right Sizing ultimately replaces "buy-to-peak" with "buy-to-measured," and Compute Optimizer auto-measures.

> 💡 **Related Theory**: Right Sizing grounds in statistical multiplexing and queueing theory. Core insight: "many independent workloads together have total peak far smaller than sum of individual peaks." 100 services peak at different times; probability all peak simultaneously approaches zero (law of large numbers). Larger pools sustain high utilization safely. Single workload isolated must match its peak, forcing low utilization. Queuing M/M/1 model shows wait time explodes non-linearly as utilization (ρ) approaches 1—safe target usually 70~80%, not 100%. Compute Optimizer recommends "fitted with headroom," not "exact fit."

## Compute Optimizer Learns What—14 Days, Percentiles, ML

Compute Optimizer's recommendation inputs "recent 14-day CloudWatch metrics." Why 14? Too short (1 day) catches random traffic swings, wrong recommendation; too long misses recent workload changes. Two weeks captures weekly patterns (weekday vs weekend) minimum twice—Monday peak and Sunday valley both seen before truly knowing "this instance's shape."

Internally, Optimizer doesn't just average. It analyzes **percentile distributions** of CPU, memory, network, disk metrics. Average CPU 10% but P99 (top 1%) at 95% means occasional maxing; careless downsizing tanks performance then. ML model cross-references this distribution against EC2 type performance database to find "smallest container holding this workload shape." Result: three Findings.

| Finding | Meaning | Action |
|---------|---------|--------|
| **Over-provisioned** | Container too large—CPU/memory excess | Downsize (cost save) |
| **Under-provisioned** | Container too small—risk performance | Upsize or change family |
| **Optimized** | Proper—headroom right | Maintain |

Scope expanded from EC2 instances: ASGs, EBS volumes, Lambda, ECS Fargate, RDS, commercial software licenses. Basic free; Enhanced (EC2, paid) offers external metric integration, longer lookback.

> 🔍 **Deeper Dive**: Optimizer's biggest blind spot is **memory**. EC2 standard CloudWatch lacks memory utilization—hypervisor can't peek inside guest OS memory. It knows VM allocated memory but not OS usage (cache vs actual). Memory metrics need **CloudWatch Agent installed inside guest**, pushing `mem_used_percent`. Without it, Optimizer treats memory as "unknown," recommending on CPU/network alone—risky for memory-bound workloads (Redis, large JVM). Wrong downsizing happens. "Optimizer weird?" diagnosis: usually missing Agent, memory gap.

> ⚠️ **Trap**: Optimizer sees **current workload only**—ignores future growth or coming features. P99 "Optimized" means nothing if next month's promo quintuples traffic. Applying recommendations cuts headroom, leaving vulnerable to spikes. Exam: "applied Optimizer, then performance tanked"—usually past-tense (14-day basis), missing memory metrics, or ignoring planned growth.

## EC2 Instance Families—Single Letter Codes Real Hardware

Instance names look cryptic but well-engineered. `c7gn.2xlarge` breaks into five pieces:

```
c   7   g n   .   2xlarge
│   │   │ │       └─ Size (vCPU·memory multiple)
│   │   │ └──────── Added feature (n = network enhanced)
│   │   └────────── Processor (g = Graviton/ARM)
│   └────────────── Generation (higher = newer)
└────────────────── Family (c = compute optimized)
```

Family letter decides **CPU:memory ratio**, which accelerators/storage attach. Ratio must match workload shape for efficiency.

| Family | vCPU:Memory | Fits | Example |
|--------|----------|--------|---------|
| **T (Burstable)** | Various | Idle then spiky | t3.medium, t4g.large |
| **M (General)** | 1:4 | Balanced web/apps | m6i.xlarge, m7g.large |
| **C (Compute)** | 1:2 | CPU-bound encoding/HPC | c7g.xlarge, c6i.large |
| **R (Memory)** | 1:8 | Memory-bound in-memory DB | r6i.xlarge, r7g.large |
| **X (High Memory)** | 1:16+ | Ultra in-memory SAP HANA | x2idn.16xlarge |
| **I (Storage IO)** | NVMe SSD | High IOPS NoSQL/DW | i4i.large |
| **D (Dense Storage)** | HDD packed | Bulk sequential distributed FS | d3.xlarge |
| **G/P (GPU)** | GPU attached | Graphics (G) / ML training (P) | g5.xlarge, p4d.24xlarge |
| **Inf/Trn** | AWS chip | ML inference (Inf) / training (Trn) | inf2.xlarge, trn1.32xlarge |
| **HPC** | Max network/core | Tightly-coupled cluster | hpc7g.16xlarge |

Mnemonic: **M** = medium (balanced), **C** = compute (CPU), **R** = RAM (memory), **I** = IO, **G/P** = GPU. First letter = use. Exam: "memory-intensive cache" → R; "CPU-bound batch" → C; "balanced web" → M.

> 💡 **Related Theory**: Family selection is **identifying bottleneck resource**. Workloads split CPU-bound / memory-bound / IO-bound / network-bound by which saturates first. Amdahl's Law: system performance determined by slowest part—double CPU when memory bottlenecks, performance barely improves. Family letter chooses "which resource abundant." Memory-bound workload on C-family (CPU-rich, memory-poor) runs swapped, expensive CPU idle, performance crashes. Right Sizing sometimes means **changing family**, not just size—wrong family never works efficiently.

## Graviton—AWS Custom ARM Chip Rewrites Cost Curve

Instances with `g` suffix (c7**g**, m7**g**, r7**g**) use **Graviton**, AWS's custom ARM processor. Not option but computing economics game-changer.

Decades: x86 (Intel, AMD) monopoly. ARM was phones/embedded—good power efficiency, weak server performance. AWS acquired Annapurna Labs (2015), released first Graviton (2018), then Graviton2 (2019), Graviton3/4—inverted perception. Cost motivation: no x86 license, design for cloud workloads (many cores, moderate single-thread), deliver same perf cheaper, power-efficient. Result: Graviton instances **~20% cheaper than equivalent x86** with better price/performance.

Tradeoff: **architecture compatibility**. ARM/x86 instruction sets differ; x86-compiled native binaries don't run ARM unchanged. Fortunately containers, interpreter languages (Java, Node, Python, Go, .NET) have runtimes absorbing architecture gaps—mostly work without recompile. Stuck: C/C++ native extensions, arch-specific libs. Practical pattern: "stage with ARM AMI, build/test → if compatible, switch operations."

> 📚 **Case Study**: Graviton adoption isn't experiment anymore. AWS 2023 re:Invent: "last 2 years EC2 capacity >50% Graviton-based." Snap, Twilio, SmugMug migrated major workloads, reported two-digit cost cuts public. AWS managed services (Lambda, Fargate, RDS, ElastiCache, OpenSearch) offer Graviton—users needn't think architecture; AWS builds runtimes ARM-compatible. SOA exam: "Node.js/Java microservice 20% cost cut" keyword almost always → Graviton switch.

## T Family Trap—CPU Credits as Debt System

T instances (t3, t4g) look cheapest, most often misused. Core: T is **burstable**—baseline low performance guaranteed, burst to full only using accumulated credits. Misunderstand, operations hit mystery performance drops.

Mechanics: **CPU Credit** debt system. t3.medium has 20% baseline per vCPU—normally only 20% core available. Usage below baseline accumulates credits (hourly quota); above baseline consumes credits, burst to 100%. Night idle savings, day burns. Problem: **credits exhaust**—then baseline (20%) force-caps, performance cliffs. CPU graph suddenly ceiling-hits 20%, app response tanks. Operators suspect "AWS outage?"—classic credit starvation.

Escape: two paths. **T3 Unlimited mode** continues burst, charges overages (vCPU-hour)—fine for occasional spikes but constant high-load stacks fees until M-family cheaper. Correct: **sustained workloads pick M/C from start**; T only truly-idle (dev servers, low-traffic internal tools).

> ⚠️ **Trap**: T baseline varies per size (t3.nano 5%, t3.medium 20%, t3.xlarge 40%). "T so fine under load" wrong; sustained load = T forbidden. Exam: "T workload performance cliff after time" → credit starvation, fix is M/C switch (not Unlimited, wastes).

## EBS Right Sizing Too—gp2→gp3 No-Downtime Switch

Right Sizing applies beyond instances. Optimizer analyzes **EBS volumes**, most common finding: **gp2→gp3 switch**. Nearly-free SOA optimization both exam and ops.

gp2 design flaw: **IOPS tied to size**. gp2 gives 3 IOPS/GB, so 3,000 IOPS needs 1TB volume. Need 100GB, buy 1TB for IOPS—another over-provisioning. gp3 broke this tie. **Baseline 3,000 IOPS·125MB/s guaranteed, independent of size**, add more IOPS/throughput separately. Plus ~20% cheaper per GB.

| Item | gp2 | gp3 |
|------|-----|-----|
| IOPS | 3/GB (size-coupled) | 3,000 baseline (independent) |
| Throughput | IOPS-coupled | 125MB/s baseline (independent) |
| Cost/GB | Baseline | ~20% cheaper |
| Modify | — | Online no-downtime from gp2 |

Best part: switch **no-downtime**. `modify-volume` API changes type, instance stays up, background migration runs. No snapshot, no rebuild. "Hundreds gp2 account" gets bill cut instantly, zero downtime—textbook quick win.

## Wrapping Up

Cost optimization usually starts Right Sizing—verify instance size before discounts. Wrong size + discount = wrong cost committed 3 years.

Five for operators: ① Optimizer analyzes 14-day metric percentile distributions, ML judges Over/Under/Optimized. ② Memory metrics missing standard so **CloudWatch Agent required**—absent, memory-bound misdiagnosed. ③ Family letter = CPU:memory ratio + accelerators: M (balance), C (CPU), R (memory), I (IO), G/P (GPU). Match bottleneck resource. ④ Graviton (`g`) ARM-based ~20% cheaper, containers/runtime languages mostly compatible. ⑤ T family CPU credit debt model—sustained ops unfit, credit exhaustion = baseline ceiling. EBS gp2→gp3 no-downtime switch ~20% save + performance boost.

Next: Trusted Advisor—five auto-checks across account (security, performance, cost, fault-tolerance, service limits).

---

## 📝 연습 문제

**문제 1.** Compute Optimizer가 메모리 집약적 워크로드(Redis 캐시)를 운영 중인 인스턴스에 대해 "Over-provisioned, 더 작은 타입으로 줄이라"고 권장했다. 이 권장을 의심해야 하는 가장 큰 이유는?

A) Compute Optimizer는 캐시 워크로드를 지원하지 않는다
B) EC2 표준 메트릭에 메모리 사용률이 없어, CloudWatch Agent가 없으면 메모리를 모른 채 CPU·네트워크만으로 권장하므로 메모리 바운드 워크로드를 오판할 수 있다
C) 14일은 너무 짧은 분석 기간이다
D) Redis는 다운사이즈할 수 없다

**정답: B**

해설: EC2의 표준 CloudWatch 메트릭에는 CPU·네트워크·디스크는 있지만 메모리 사용률이 없다. 하이퍼바이저가 게스트 OS 내부 메모리 사용을 들여다볼 수 없기 때문이다. 메모리 메트릭을 얻으려면 게스트 OS 안에 CloudWatch Agent를 설치해 `mem_used_percent`를 푸시해야 한다. Agent가 없으면 Compute Optimizer는 메모리를 "모르는 값"으로 두고 CPU만으로 권장하는데, Redis 같은 메모리 바운드 워크로드는 CPU 사용률이 낮아도 메모리가 꽉 차 있을 수 있어 다운사이즈가 위험하다. 권장의 신뢰도는 Agent 설치 여부에 직결된다.

---

**문제 2.** 컴퓨팅 집약적 동영상 인코딩 배치 작업을 위한 인스턴스 패밀리를 골라야 한다. 작업은 CPU를 거의 100%까지 쓰지만 메모리는 적게 쓴다. 가장 적합한 패밀리는?

A) R (메모리 최적화)
B) C (컴퓨팅 최적화) — vCPU:메모리 비율이 1:2로 CPU가 풍부
C) T (버스터블)
D) X (초고메모리)

**정답: B**

해설: 패밀리 선택은 병목 자원에 풍부한 자원을 매칭하는 문제다. CPU 바운드 워크로드는 C 패밀리(컴퓨팅 최적화)가 맞는다 — vCPU 대비 메모리 비율이 약 1:2로, 같은 가격에 더 많은 CPU를 준다. R(A)은 메모리가 풍부한 대신 CPU당 단가가 비싸 CPU 바운드 작업엔 낭비다. T(C)는 꾸준한 고부하에 크레딧이 고갈된다. X(D)는 초대형 인메모리 DB용이다.

---

**문제 3.** Node.js 마이크로서비스 클러스터의 컴퓨팅 비용을 약 20% 줄이라는 지시를 받았다. 코드 변경은 최소화하고 싶다. 가장 효과적인 첫 시도는?

A) 인스턴스 크기를 한 단계 키운다
B) Graviton(예: c6g/c7g) 기반 인스턴스로 전환 — ARM 기반으로 약 20% 저렴하고, Node 같은 인터프리터/런타임 언어는 대부분 재컴파일 없이 동작
C) 모든 인스턴스를 Spot으로 바꾼다
D) Lambda로 전부 재작성한다

**정답: B**

---

**문제 4.** t3.medium에서 운영 중인 API 서버가 매일 오후가 되면 응답이 급격히 느려지고 CPU 그래프가 20%에 천장을 친 듯 눌린다. AWS 장애는 없다. 원인과 올바른 해결은?

A) 네트워크 대역폭 부족
B) CPU 크레딧 고갈로 baseline(20%)에 묶인 것 — M/C 패밀리로 변경이 정석
C) 디스크 IOPS 부족 — gp3로 변경
D) 메모리 누수 — 인스턴스 재시작

**정답: B**

---

**문제 5.** 수백 개의 gp2 EBS 볼륨이 있는 계정에서, 다운타임 없이 즉시 스토리지 비용을 약 20% 줄이고 성능도 개선하려 한다. 무엇을 해야 하나?

A) 모든 볼륨의 스냅샷을 찍어 더 작은 볼륨으로 복원
B) `modify-volume`으로 gp2 → gp3 무중단 전환 — GB당 약 20% 저렴하고 기본 3,000 IOPS·125MB/s를 크기와 무관하게 보장
C) 볼륨을 io2로 변경
D) 볼륨을 S3로 이전

**정답: B**

---

**문제 6.** Compute Optimizer가 한 인스턴스를 "Optimized"로 판정했지만, 다음 달 대규모 프로모션으로 트래픽이 5배 증가할 예정이다. 이 권장을 어떻게 다뤄야 하나?

A) Compute Optimizer 권장은 항상 정확하므로 그대로 신뢰한다
B) Compute Optimizer는 과거 14일 데이터만 보고 미래 부하 증가를 모르므로, 예정된 트래픽 급증을 감안해 권장을 보정해야 한다
C) 권장을 무시하고 인스턴스를 종료한다
D) 14일을 1일로 줄여 재분석한다

**정답: B**

---

**문제 7.** 100개의 독립적인 서비스를 큰 공용 인스턴스 풀에 모아 운영하면, 각 서비스를 단독 인스턴스에 격리할 때보다 평균 사용률을 더 높게 안전하게 가져갈 수 있다. 그 이론적 근거는?

A) AWS가 풀이 크면 자동 할인을 준다
B) 통계적 다중화 — 독립 워크로드가 많을수록 전체 동시 피크 확률이 낮아져(대수의 법칙) 전체 피크가 개별 피크의 합보다 작다
C) 큰 인스턴스가 항상 더 빠르다
D) Auto Scaling은 사용률을 무시한다

**정답: B**

---
