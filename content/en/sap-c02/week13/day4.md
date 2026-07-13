# Day 4 - Cost & Sustainability Pillars Deep Dive — Unit Economics, Regulatory Roots of Carbon Accounting, Trade-Offs Between Two Pillars

The most common mistake in reducing cloud costs is looking only at the "total." When monthly bills drop from $100k to $90k it looks like success, but if traffic fell 50% in that period, you've actually **worsened unit cost**. Cost Optimization's real metric isn't total spend but **unit economics (cost per request, per user, per transaction).** Sustainability translates this same thinking to carbon—the goal is reducing "carbon per useful work," not absolute emissions.

In SAP-C02, the two pillars appear with keywords like "Graviton shift for simultaneous cost and power savings," "zero idle cost," "auto-tier cold data," "measure carbon emissions." Interestingly, the pillars usually align (remove idle resources) but don't always coincide. Today we dig into unit economics, regulatory roots of carbon accounting, and trade-offs between both pillars.

## Cost Optimization — Consumption Model and Unit Economics

Cost's five principles are "adopt consumption model, measure total efficiency, stop datacenter operating expenses, analyze costs, leverage managed services." The first, "consumption model," is cloud economics' core—pay only for what you use; unused = $0. On-premises requires upfront investment for peak capacity (fixed cost), but cloud converts to variable cost.

| Lever | Tool | Benefit |
|-------|------|---------|
| Commitment discount | Savings Plans, RI | Stable baseline save up to 72% |
| Spot | Spot Instance, Fargate Spot | Interruption-tolerant workloads save up to 90% |
| Remove idle | Auto Scaling, serverless | Unused time cost $0 |
| Storage tiering | S3 Lifecycle, Intelligent-Tiering | Cold data to low-cost class |
| Right-sizing | Compute Optimizer | Reduce over-provisioning |
| Reduce data transfer | VPC Endpoint, CloudFront | Bypass NAT, egress |
| Cost visibility | Cost Allocation Tag, Budgets, Cost Anomaly Detection | Attribution, budgeting, anomaly detection |
| Multi-account sharing | Organizations consolidated billing | Share SP/RI, volume tier |

> 💡 **Related Theory**: "Measure total efficiency" is the finance concept of **unit economics**. Like SaaS firms tracking "cost to serve one customer," cloud costs must be measured as **cost relative to business output, not absolute dollars**. Cost per 1M requests, cost per active user is the real metric. If this improves, traffic rise raising total cost is healthy growth; if it degrades, total cost decline hides inefficiency. AWS Cost Allocation Tags to attribute costs by workload, team, and function is the starting point for unit economics measurement. In exams, "cost attribution by team/function, showback/chargeback" signals Cost Allocation Tag + Cost Categories as correct answers.

> 📚 **Case Study**: In 2018, Pinterest discovered during a cost surge investigation that **data transfer (especially inter-AZ and internet egress)** rivaled compute in cost. They repositioned services to communicate within the same AZ, routed S3 access via Gateway Endpoint, and moved external transfer to CloudFront, significantly reducing transfer costs. Lesson: cost optimization must account for **invisible data transfer costs**, not just compute and storage, and Cost and Usage Report (CUR) must be decomposed to hour and resource granularity to expose hidden costs.

> 🔍 **Deeper Dive**: **Data transfer cost** is exam secret gold. AWS charges mostly free inbound but bills outbound, inter-region, and inter-AZ transfer. Two common reduction patterns: (1) **VPC Endpoint**—when instances in private subnets access S3/DynamoDB, using NAT Gateway incurs NAT processing + egress, but Gateway Endpoint (S3/DynamoDB only, free) routes via AWS backbone, eliminating NAT cost. (2) **CloudFront**—direct S3/ALB-to-internet egress costs more per byte than CloudFront routing plus caching reduces origin requests. In exams, "reduce NAT Gateway data processing" signals VPC Endpoint; "reduce internet egress" signals CloudFront.

## Cost Visibility Tools — No Optimization Without Measurement

| Tool | Role |
|------|------|
| **Cost Explorer** | Visualize cost trends, forecast, recommend SP/RI |
| **Cost and Usage Report (CUR)** | Most detailed billing data (hourly, per resource) |
| **Budgets** | Budget threshold alerts and auto-actions |
| **Cost Anomaly Detection** | ML-based detection of abnormal spend spikes |
| **Cost Allocation Tag, Cost Categories** | Attribute costs by team, environment, function |
| **Compute Optimizer** | Recommend right-sizing by metrics |
| **Trusted Advisor** | Auto-check idle resources, unused RI, etc. |

> ⚠️ **Pitfall**: "Auto-detect and alert abnormal cost spike" is **Cost Anomaly Detection** (ML-based), not Budgets. Budgets are static-threshold-based—"alert if over pre-set limit (e.g., $10k/month)." Cost Anomaly Detection learns historical patterns and dynamically detects "unexpected sudden surge." They're complementary—predictable boundaries use Budgets; unpredictable anomalies use Anomaly Detection. In exams, "detect unexpected sudden cost surge" is Cost Anomaly Detection.

## Sustainability — Regulatory Roots of Carbon Accounting

Sustainability's (added 2021) six principles are "understand impact, set targets, maximize utilization (zero idle), apply new technology, use managed services, reduce downstream impact." The core is **"minimize resources and carbon per useful work"**—translating Cost's thinking to power and carbon.

| Practice | Tool/Tech | Relation to Cost |
|----------|-----------|------------------|
| Zero idle | Auto Scaling, serverless, Fargate Spot | Aligns (both ↓) |
| Same performance, lower power | Graviton, Inferentia, Trainium | Aligns |
| Cold data, lower power | S3 Storage Class, Lifecycle | Aligns |
| Renewable energy region | Region choice (AWS official data) | Cost-independent (per-region pricing only) |
| Compute density | EKS Bin Packing, Fargate | Aligns |
| Carbon measurement | Customer Carbon Footprint Tool (CCFT) | Visibility tool |

> 💡 **Related Theory**: AWS's 2025 100% renewable energy and 2040 Net-Zero goals (moved up from 2030) are not PR—they're **regulatory response**. The EU's **CSRD (Corporate Sustainability Reporting Directive)** mandates **Scope 3 (supply chain, indirect)** reporting from large companies starting 2024. GHG Protocol splits emissions into Scope 1 (direct), Scope 2 (purchased power), Scope 3 (supply chain, indirect). When a firm uses cloud, that carbon enters the firm's Scope 3. This number is reported directly from AWS-provided data (CCFT), so **CCFT accuracy equals ESG reporting accuracy**. In exams, "ESG reporting, Scope 3, carbon measurement" signals CCFT.

> 🔍 **Deeper Dive**: **Embodied Carbon** is Sustainability's subtle concept. A server's carbon footprint includes not just operational carbon (running power) but **embodied carbon (manufacturing, shipping, disposal).** This clarifies why "maximize utilization" is a Sustainability principle—idle hardware means already-emitted embodied carbon is wasted. Running 30 servers at 100% is better than 100 at 30% in embodied carbon and power. This grounds why EKS Bin Packing (pack pods densely to minimize nodes), Fargate, and serverless raise Sustainability scores.

> 📚 **Case Study**: In 2019, a global media company changed the habit of running dev and staging environments 24/7 despite nearly zero nighttime/weekend traffic. They adopted **Instance Scheduler (Lambda + EventBridge)** for auto-shutdown outside business hours. Result: non-prod cost dropped ~60%, and carbon emissions proportionally decreased since no unused compute was running. Lesson: "idle resources waste cost and carbon simultaneously"—a textbook Sustainability-Cost alignment case. Conversely, if they'd also shut down production DR after hours, they'd have sacrificed RTO for Reliability—identifying *which* environment matters is the key trade-off judgment.

> ⚠️ **Pitfall**: "Move to renewable energy region" improves Sustainability but **costs may be unchanged or worsen**. Per-region service pricing varies, and moving farther from users increases latency (Performance) and data transfer cost. In exams, "reduce carbon only" makes renewable regions correct; "reduce cost too" requires actions where both pillars improve (Graviton, zero idle). Region moves are carbon-only.

## Cost and Sustainability Trade-Off — Not Always Aligned

Cost and Sustainability usually align but pro exams trap on misalignment.

| Action | Cost | Sustainability | Note |
|--------|------|----------------|------|
| Graviton shift | ↓ | ↓ | Both improve (typical answer) |
| Kill idle instance | ↓ | ↓ | Both improve |
| FSx Lustre (HPC) | ↑ | ↑(resources↑) | Cost rises for throughput |
| Renewable region move | Variable | ↓ | Carbon ↓ but cost depends on per-region pricing, latency |
| Over-aggressive Multi-Region | ↑ | ↑(resources↑) | Reliability cost and carbon increase accepted |

> 🎯 **Scenario**: "A company is told to reduce both cost and carbon. They run web/app workloads on x86 EC2. What single action is most effective?" — Answer: **Graviton (ARM) shift**. Graviton (ARM Neoverse-based) outperforms x86 on both price and power (up to 40% price-to-performance improvement, significant power reduction). One shift satisfying both Cost and Sustainability is the hallmark of pro answers. Requires ARM-compatible builds, prioritize compiled languages and container workloads. "Improve cost and environment together" almost always signals Graviton.

> 🔍 **Deeper Dive**: Graviton's power advantage comes from **instruction set architecture (ISA)** differences. x86 is CISC (complex instructions)—one instruction does much but decoding/execution circuits are complex and power-hungry. ARM is RISC (reduced instructions)—simple, fast instructions with high performance-per-watt (originally designed for mobile/embedded with power efficiency). AWS built ARM cores (Neoverse) into custom chips (Graviton2/3/4) for datacenters. Related specialized chips are ML-focused **Inferentia** (inference) and **Trainium** (training), improving performance-per-watt and cost vs. GPU. In exams, "inference cost/power reduction" signals Inferentia; "large-scale training cost reduction" signals Trainium.

> 💡 **Related Theory**: Spot Instance economics mirror a **secondary market**. AWS auctions unused capacity unsold via commitments and on-demand to raise utilization (supplier benefit); customers accept interruption risk for up to 90% discount (demand benefit). The key constraint: **2-minute interruption notice**, so suitable only for stateless, checkpoint-able, re-runnable workloads (batch, CI/CD, rendering, distributed learning). From a Sustainability angle, Spot activates idle capacity ("maximize already-on resources"), aligning with the "maximize utilization" principle. In exams, "interruption-tolerant + max cost savings" is Spot/Fargate Spot.

## Multi-Account Cost — Consolidated Billing and BillingConductor

Organizations consolidated billing offers two on the cost side: **(1) SP/RI sharing** (commitments bought in one account apply org-wide), **(2) volume tier discounts** (aggregate usage crosses higher discount thresholds). The design principle: split accounts for cost separation, share discounts. To redistribute margin and discounts by department (showback/chargeback), use **AWS BillingConductor** to set custom billing groups and rates.

## Summary

Cost Optimization measures unit economics (cost per request, per user), not total, via consumption model, commitment discounts, Spot, zero idle, storage tiering, data transfer reduction (VPC Endpoint, CloudFront). Sustainability translates the same thinking to carbon—"minimize carbon per useful work"—via zero idle, Graviton, renewable regions, CCFT measurement. Both pillars usually align (Graviton, zero idle) but HPC Lustre shows trade-offs. CCFT connects directly to EU CSRD Scope 3 reporting, holding regulatory weight.

SAP exam frequent mappings: (1) "Reduce cost, power, carbon simultaneously with same performance" → **Graviton shift**, (2) "Carbon emissions measurement and ESG/Scope 3 reporting" → **CCFT**, (3) "Auto-tier cold data to low-cost/low-carbon" → **S3 Lifecycle/Intelligent-Tiering**, (4) "Unexpected sudden cost spike detection" → **Cost Anomaly Detection** (not Budgets), (5) "Cost attribution by team/function" → **Cost Allocation Tag/Cost Categories**, (6) "Remove NAT data processing cost" → **VPC Endpoint**, (7) "Multi-account SP/RI sharing + volume discount" → **Organizations consolidated billing**, (8) "Custom billing and chargeback by department" → **BillingConductor**, (9) "Zero idle + interruption-tolerant compute" → **Fargate Spot/serverless**. Next day integrates all six pillars with a comprehensive review scenario.

---

## 📝 연습 문제

**문제 1.** 한 회사가 x86 EC2에서 웹·앱 워크로드를 운영 중이며, 경영진이 비용과 탄소 배출을 동시에 줄이라고 지시했다. 동급 성능을 유지하면서 가장 효과적인 단일 액션은?

A) Intel x86 최신 세대로 업그레이드

B) Graviton(ARM) 기반 인스턴스로 전환

C) GPU 인스턴스(F1)로 전환

D) 더 큰 인스턴스 타입으로 통합

**정답: B**
해설: Graviton은 ARM Neoverse 기반으로 동급 x86 대비 가격 성능비(최대 40% 개선)와 전력 효율이 모두 우위라, 한 번의 전환으로 Cost·Sustainability 두 기둥을 동시에 만족한다 — Pro 정답의 전형. A는 비용·탄소 대폭 개선이 어렵고, C(F1/GPU)는 특수 워크로드용으로 비용이 오르며, D는 right-sizing 역행이다. 함정: "비용·환경 동시 개선 + 동급 성능"은 거의 항상 Graviton이다.

---

**문제 2.** 한 대기업이 EU CSRD에 따라 클라우드 사용으로 인한 Scope 3 탄소 배출을 ESG 보고서에 포함해야 한다. AWS 사용분의 월별 탄소 배출 데이터를 얻으려면 무엇을 사용하나?

A) Trusted Advisor

B) Customer Carbon Footprint Tool(CCFT)

C) Cost Explorer

D) Sustainability Lens

**정답: B**
해설: CCFT는 AWS 사용으로 인한 Scope 1·2·3 탄소 배출을 월별로 보고하며, 이 데이터가 그대로 고객 ESG 보고(Scope 3)에 들어간다. A(Trusted Advisor)는 비용·보안 체크지 탄소 측정이 아니다. C(Cost Explorer)는 비용 데이터다. D(Sustainability Lens)는 아키텍처 가이드일 뿐 측정 도구가 아니다. 함정: "탄소 측정·ESG·Scope 3"은 CCFT, Sustainability Lens는 설계 가이드로 구분한다.

---

**문제 3.** 한 회사의 클라우드 비용이 평소와 다르게 갑자기 급증했는데, 어떤 워크로드나 서비스가 원인인지 모른다. 사전에 정한 예산 임계치와 무관하게 비정상적 지출 패턴을 자동으로 탐지·알림받고 싶다. 가장 적합한 도구는?

A) AWS Budgets

B) Cost Anomaly Detection

C) Cost and Usage Report

D) Compute Optimizer

**정답: B**
해설: Cost Anomaly Detection은 과거 지출 패턴을 ML로 학습해 "평소와 다른 갑작스러운 급증"을 동적으로 탐지·알림한다. A(Budgets)는 사전에 정한 정적 임계치 초과 시 알림하는 것으로 "예측 못 한 이상"은 못 잡는다. C(CUR)는 상세 청구 데이터지 자동 이상 탐지가 아니다. D는 right-sizing 권고다. 함정: "예측 못 한 비정상 급증 탐지"는 Cost Anomaly Detection, "사전 임계치 알림"은 Budgets다.

---

**문제 4.** 프라이빗 서브넷의 EC2 인스턴스들이 S3에 대량의 데이터를 읽고 쓰는데, 현재 NAT Gateway를 경유해 NAT 데이터 처리 비용이 크다. 이 비용을 제거하는 가장 적합한 방법은?

A) NAT Gateway를 더 큰 크기로 변경

B) S3용 Gateway VPC Endpoint를 추가해 NAT 없이 AWS 백본으로 직행

C) S3 버킷을 퍼블릭으로 전환

D) CloudFront를 S3 앞에 배치

**정답: B**
해설: S3·DynamoDB용 Gateway VPC Endpoint는 무료이며, 프라이빗 서브넷에서 NAT Gateway를 거치지 않고 AWS 백본으로 직행해 NAT 데이터 처리 비용과 egress를 없앤다. A는 비용을 줄이지 못하고, C는 보안 위반이며, D(CloudFront)는 인터넷 egress·캐싱용이지 VPC 내부 S3 접근의 NAT 비용 제거가 아니다. 함정: "NAT 데이터 처리 비용 제거"는 VPC(Gateway) Endpoint다.

---

**문제 5.** 한 Organization이 비용 분리를 위해 부서별로 계정을 나눴지만, 약정 할인(SP/RI)과 볼륨 할인은 전체에서 공유하고 싶다. 가장 적합한 구성은?

A) 각 계정이 독립 결제로 분리

B) Organizations 통합 결제를 사용해 SP/RI 공유와 볼륨 티어 할인을 전 계정에 적용

C) 모든 워크로드를 단일 계정으로 통합

D) On-Demand만 사용

**정답: B**
해설: Organizations 통합 결제는 SP/RI를 전 계정에 공유하고, 사용량을 합산해 더 높은 볼륨 티어 할인을 적용한다. 계정을 비용 분리 목적으로 나누되 할인은 공유하는 것이 멀티 계정 비용 설계의 핵심이다. A는 할인 공유·볼륨 합산을 잃고, C는 비용 분리를 포기하며, D는 약정 할인을 포기한다. 함정: "계정 분리 + 할인 공유"는 통합 결제다.

---

**문제 6.** 다음 중 Cost와 Sustainability 두 기둥이 **항상 같은 방향으로 개선되지는 않는** 경우의 예로 가장 적절한 것은?

A) 유휴 인스턴스를 종료한다 (둘 다 ↓)

B) Graviton으로 전환한다 (둘 다 ↓)

C) HPC 처리량을 위해 FSx for Lustre를 도입한다 (비용 ↑, 성능 ↑)

D) Auto Scaling으로 유휴 시간을 줄인다 (둘 다 ↓)

**정답: C**
해설: FSx for Lustre는 처리량·성능을 위해 비용이 오르는 경우로, "비용↓"라는 Cost 목표와 반드시 일치하지 않는다. Sustainability 관점에서도 고성능 스토리지가 항상 저탄소는 아니다. A·B·D는 모두 Cost와 Sustainability가 동시에 개선되는 전형적 일치 사례다. 함정: 두 기둥은 대개 일치하지만(유휴 제거·Graviton), 고성능을 위해 비용을 감수하는 경우처럼 trade-off가 존재함을 Pro는 구분해야 한다.

---