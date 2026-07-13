# Day 2 - Compute Optimizer·Rightsizing — Internal Workings of ML-Based Recommendations, Tool Comparison, Automation Patterns

Cost optimization has two parallel paths. One is "buying cheaper" (commitments·Spot, covered yesterday with SP·RI), the other is "using only what you need" (rightsizing). The latter is more fundamental — no matter how good a commitment discount you buy, if an m5.4xlarge is consistently using only 5% CPU, that''s the same as buying an m5.large at 8x the price. Moreover, commitment discounts and rightsizing compound multiplicatively: applying a 72% commitment discount to an 8x over-provisioned instance is still vastly inferior to first reducing that 8x to 1x. Industry surveys like AWS''s FinOps whitepaper and Flexera''s State of the Cloud reach the same conclusion every year — over 30% of enterprise cloud spending is wasted, and the #1 cause is over-provisioning. Rightsizing delivers immediate impact without any commitments, making it the fastest lever available.

In SAP-C02, this domain is tested through operational design: "which tool gives which recommendation," "why aren''t memory recommendations appearing," "how do I consolidate recommendations across multiple accounts," "how do I safely auto-apply recommendations." Today we''ll cover Compute Optimizer''s internal ML analysis, the precise boundaries with Trusted Advisor·Cost Explorer, automated rightsizing pipelines, and equivalent capabilities in other clouds.

## Why Rightsizing Is Difficult — The Observability Trap

Although rightsizing seems simple in theory, it always gets stuck in practice due to a fundamental architectural limitation: **the hypervisor cannot see inside the guest OS**. EC2''s CPU·network·disk I/O are automatically metered at the hypervisor (Nitro) layer and flow into CloudWatch. But **memory utilization** is only visible inside the guest OS — from the hypervisor''s perspective, it cannot see how much of the allocated RAM is actually being used. Whether the guest OS uses 4GB out of 16GB or 15GB, all the host sees is "I allocated 16GB to this VM." Thus memory metrics can only be collected by installing a **CloudWatch Agent** inside the guest.

This single fact creates half of the exam''s pitfalls. In scenarios where "Compute Optimizer isn''t giving memory recommendations," the answer is almost always "memory metrics are missing because the CloudWatch Agent isn''t installed." Relying solely on CPU-based downsizing could incorrectly shrink memory-bound workloads (JVM heaps, in-memory caches, data pipelines, etc.), causing OOM (Out of Memory) events. The presence or absence of memory metrics is thus crucial to rightsizing safety.

> 💡 **Related Theory**: This is the **semi-opacity problem** in virtualization. The goal of virtualization is to isolate guests so they don''t know they''re running on a VM (transparency), but that isolation paradoxically prevents the host from seeing inside the guest. In OS theory, this is called the **semantic gap** — the hypervisor knows about physical page allocation but doesn''t know whether the guest OS classifies those pages as "in-use·cached·free." To recover guest-freed pages, the host must cooperate through a balloon driver (virtio-balloon, VMware Tools'' vmmemctl) that voluntarily returns memory from within the guest. For the same reason, in container environments (ECS/EKS), memory and application metrics require a separate agent (CloudWatch Agent, ADOT Collector). The general principle in this domain is that to achieve observability, you must intentionally pierce the isolation boundary with instrumentation.

> 🔍 **Deeper Dive**: AWS created two workarounds for this memory blind spot. (1) CloudWatch Agent''s `mem_used_percent` metric — the standard method. (2) **CloudWatch Application Signals / Application Insights** augment some memory signals. But for Compute Optimizer to produce memory recommendations, it ultimately needs CW Agent''s memory metrics continuously throughout the lookback period. Moreover, Compute Optimizer conservatively marks instances lacking memory data as "insufficient recommendation data," rather than guessing and recommending downsizing — this conservatism is a safety mechanism.

## Compute Optimizer — What Does It Analyze, and How

Compute Optimizer analyzes 14+ days of CloudWatch metrics using machine learning to produce specific recommendations per resource. The key difference from Trusted Advisor is that "analysis" is not simple threshold comparison.

| Resource | Recommendation Content |
|----------|------------------------|
| **EC2 Instances** | Downsize/upsize, family change, generational modernization (m5→m6i) |
| **Auto Scaling Group** | Recommended instance type·size |
| **EBS Volumes** | gp2→gp3 conversion, IOPS·Throughput adjustment |
| **Lambda Functions** | Memory setting recommendations (cost·performance co-optimization) |
| **ECS on Fargate** | Task CPU·Memory recommendations |
| **RDS DB Instances** | DB instance resizing (added 2024) |
| **Commercial Software Licenses** | License optimization (e.g., SQL Server) |

Each EC2 recommendation is classified as a **finding** — Under-provisioned (insufficient resources, needs upsize), Over-provisioned (excess resources, can downsize), Optimized (appropriate). Each carries a **performance risk** score quantifying the impact on performance if that downsizing is performed.

> 🔍 **Deeper Dive**: The critical insight is that Compute Optimizer''s ML examines **time-series patterns**, not just simple averages. If you only look at average CPU at 10%, you''d recommend downsizing, but if a daily batch job spikes to 90%, that downsizing would crash it. CO examines percentiles like P95·P99 and hourly patterns, then presents "up to 3 recommended options + performance risk level (Very Low~Very High) for each." Additionally, if you enable **enhanced infrastructure metrics** (adding memory·EBS I/O·network metrics), the lookback extends from the default 14 days to up to 93 days (3 months), yielding more precise recommendations. This is a paid option billed per active resource hour. In exams, if you need "higher precision across longer periods" or "recommendations reflecting seasonality," enhanced metrics is the keyword.

> 🔍 **Deeper Dive**: Compute Optimizer doesn''t just recommend "smaller." **Generational modernization recommendations** often yield better results for both cost and performance. For example, m5.xlarge → m6i.large increases per-core performance so you can reduce size while maintaining performance, and the per-unit cost also drops. Graviton recommendations (e.g., m6g/m7g) come with a separate **migration effort tier** (whether code rebuilding is needed), so the tool doesn''t blindly suggest ARM for x86-dependent workloads. In exams, if "maintain performance + reduce cost + minimize architecture changes" appears, look for same-ISA generational upgrade; if "maximize price-to-performance + can rebuild," that''s a Graviton signal.

> ⚠️ **Pitfall**: The old knowledge that "Compute Optimizer doesn''t support RDS" is outdated. Since 2024, RDS DB instance (and storage) recommendations are included. SAP exams often test bleeding-edge features beyond typical learning material — "DB instance rightsizing recommendation" might have Compute Optimizer as the answer. Conversely, "why aren''t memory recommendations appearing" is always answered by the absence of CloudWatch Agent memory metrics. Don''t confuse these two pitfalls.

## The Three-Tool Triangle — Compute Optimizer vs Trusted Advisor vs Cost Explorer

All three tools offer "savings recommendations," but they differ in depth and purpose. Exams test these boundaries precisely.

| Item | Compute Optimizer | Trusted Advisor | Cost Explorer Rightsizing |
|------|-------------------|-----------------|---------------------------|
| Analysis Method | **ML / time-series** | Simple rules (thresholds) | CO data reused |
| Depth | Precise (type·IOPS·memory) | Summary (unused·underutilized) | Cost-focused simplified |
| Target Resources | EC2·ASG·EBS·Lambda·ECS·RDS | 5 categories broadly | EC2 mainly |
| Cost | Free (basic) / enhanced paid | Business+ Support required (full checks) | Free |
| Strength | Concrete action recommendations | Broad coverage | Cost impact visualization |

Core distinction: **Trusted Advisor is "broad and shallow"** (sweeps 5 categories — Cost·Performance·Security·Fault Tolerance·Service Limits — using rule-based checks), **Compute Optimizer is "narrow and deep"** (precision ML analysis of compute·storage resources). Cost Explorer Rightsizing repackages CO''s recommendation data from a cost perspective; use it when you want to see "how much can we save."

> 💡 **Related Theory**: This division mirrors the SRE concept of **signal-to-noise tradeoff**. Rule-based approaches like Trusted Advisor are fast and interpretable but generate many false positives — "CPU under 10%" as a simple rule will incorrectly flag batch spike workloads. ML-based (CO) learns patterns to reduce false positives but requires 14+ days of data, training time, and offers less intuitive explanations (harder for humans to trace why this recommendation appeared). This is the classic precision-recall tradeoff in classifier evaluation. In operations, you use both in layers — TA broadly screens the entire infrastructure (high recall), then CO provides precise analysis on suspect resources (high precision) before action.

> 💡 **Related Theory**: Other clouds solve the same problem equivalently. **Azure Advisor** (5 categories: Cost·Security·Reliability·Performance·Operational Excellence) corresponds to Trusted Advisor, while **GCP Recommender / Active Assist** (instance rightsizing, idle resource detection) corresponds to Compute Optimizer.

| Feature | AWS | Azure | GCP |
|---------|-----|-------|-----|
| Rule-based broad checks | Trusted Advisor | Azure Advisor | Recommendation Hub |
| ML rightsizing recommendations | Compute Optimizer | Azure Advisor (VM right-size) | Recommender (machine type) |
| Cost visualization | Cost Explorer | Cost Management | Cloud Billing Reports |
| Detailed billing export | CUR | Cost Management Exports | BigQuery Billing Export |

The key insight is that all three clouds share the same 4-layer structure: "broad rule checks + ML rightsizing + cost visualization + detailed export." In multi-cloud FinOps scenarios, knowing this correspondence reveals the answer.

## Automated Rightsizing Pipeline — Safely Applying Recommendations

If operations teams manually apply recommendations each time, they''ll fall behind as scale grows. SAP exams ask you to design a "safe pipeline for auto-applying recommendations." The standard pattern is:

```
[CloudWatch + CW Agent Metrics]  ← Agent required for memory recommendations
        ↓ Collect 14+ days
[Compute Optimizer ML Analysis]
        ↓ Daily Export (recommendation export to S3)
[S3 (Recommendations CSV/Parquet)]
        ↓ Trigger
[EventBridge Scheduler → Lambda Parsing·Filtering]
        ↓  Pass only performance risk = Very Low + Over-provisioned
[SNS / Step Functions Approval Gate] ← Production instances need human approval
        ↓ After approval
[Stop → ModifyInstanceAttribute → Start]
Or [ASG Launch Template Update + Instance Refresh]
Or [EBS gp2 → gp3 ModifyVolume (zero-downtime)]
```

There are two design points here. First, **EC2 type changes require stop→modify→start, bringing downtime**, while EBS gp2→gp3 conversion is **zero-downtime via ModifyVolume**. Second, **add an approval gate (SNS/manual approval) for production workloads** to avoid blindly auto-applying ML recommendations. Non-production has lower risk so it can be fully automated; production needs human approval — this two-tier approach is the standard SAP answer pattern.

> 🔍 **Deeper Dive**: In ASG environments, you cannot directly stop/modify instances — ASG will mark them unhealthy on health checks and terminate them, then spin up new ones to match desired capacity. The correct approach is to **create a new Launch Template version** with the recommended type and perform **Instance Refresh** to rolling-replace the fleet. Instance Refresh respects `MinHealthyPercentage` for gradual replacement approaching zero-downtime, and `checkpoints` allow partial rolling replacement then validation before proceeding. More sophisticated approaches use **Mixed Instances Policy + attribute-based instance selection (ABIS)** where you specify attributes like "4 vCPU, 8GB+ memory" and let ASG auto-select suitable types. In exams, if an answer includes "directly modify instances in ASG," it''s a trap; the correct answer is "Launch Template + Instance Refresh."

> 📚 **Case Study**: An e-commerce company operated thousands of EC2 instances and manually attempted rightsizing quarterly, but the review pace couldn''t keep up with infrastructure growth, resulting in chronic 30%+ over-provisioning (buying commitments but never actually reducing size — waste stacking on top of commitments). The solution was a pipeline: Compute Optimizer recommendations exported to S3 daily → Lambda filters only "performance risk Very Low + Over-provisioned" recommendations → auto-apply to non-production, require Slack approval before applying to production. Within 6 months, roughly 22% computing cost reduction. Lesson: rightsizing is not a one-time project but a **continuous operational practice**, and without automation, you''ll inevitably fall behind at scale.

> 📚 **Case Study**: A counterexample failure also aids exam thinking. A fintech company looked only at average CPU and bulk-downsized their overnight batch instances from m5.2xlarge → m5.large, but daily 02:00 settlement batches began failing with OOM errors cascading daily. The root cause: no CloudWatch Agent meant no memory metrics, so Compute Optimizer couldn''t make memory recommendations, and operations saw only CPU recommendations and downsized accordingly. Lesson: downsizing based only on CPU metrics without memory is an anti-pattern, and batch-like spike workloads must have percentiles·hourly patterns verified before action.

## Organization-Wide Recommendation Consolidation

In multi-account environments, designate Compute Optimizer as a **delegated administrator** to see recommendations from all member accounts in one place. No need to hop between account consoles; you aggregate savings opportunities across the entire Org and export·analyze in bulk from the delegated admin account.

> ⚠️ **Pitfall**: For "centrally viewing rightsizing recommendations across multiple accounts," the answer is **Compute Optimizer delegated administrator + Org-level opt-in**, not Config Aggregator or Cost Explorer. Config Aggregator collects resource configuration compliance, not rightsizing recommendations. Cost Explorer shows cost trends, not type·IOPS-level precision recommendations. You must distinguish tool purposes precisely. Additionally, it''s common exam material that the delegated administrator activates Org-wide in one step — member accounts don''t each individually opt-in separately.

## Summary

The essence of rightsizing is "use only what you need," powered by the **Compute Optimizer** engine analyzing 14+ days of metrics with ML. Memory recommendations depend on **CloudWatch Agent** due to virtualization''s semi-opacity (semantic gap). Recommendations are automated via an **S3 Export → EventBridge → Lambda filtering → approval gate → apply** pipeline, with ASG nodes replaced via **Launch Template + Instance Refresh** (not direct instance modify). The same 4-layer structure (rule checks·ML rightsizing·cost visualization·detailed export) exists identically in Azure and GCP.

Common SAP exam mappings: (1) "precise type·IOPS·memory recommendations" → **Compute Optimizer**, (2) "no memory recommendations appearing" → **CW Agent not installed**, (3) "broad shallow 5-category checks" → **Trusted Advisor (Business+)**, (4) "auto-apply recommendations pipeline" → **S3 Export + EventBridge + Lambda (+approval)**, (5) "ASG instance replacement" → **Launch Template + Instance Refresh**, (6) "consolidate Org-wide recommendations" → **CO delegated administrator**, (7) "DB instance rightsizing" → **Compute Optimizer (RDS support)**, (8) "preserve performance + minimal change savings" → same-ISA generational upgrade, "can rebuild + maximum value" → Graviton. Next day covers Cost Explorer·Budgets·CUR for cost visibility and control.

---

## 📝 연습 문제

**문제 1.** 한 팀이 Compute Optimizer를 활성화했는데 EC2 인스턴스에 대해 CPU 기반 권고만 나오고 메모리 기반 권고가 전혀 없다. 가장 가능성 높은 원인은?

A) Compute Optimizer는 메모리를 지원하지 않는다

B) 게스트 OS에 CloudWatch Agent가 없어 메모리 메트릭이 수집되지 않는다

C) 14일이 지나지 않았다

D) IAM 권한이 부족하다

**정답: B**
해설: 하이퍼바이저는 게스트 OS 내부의 메모리 사용량을 볼 수 없다(가상화의 시맨틱 갭). 따라서 메모리 메트릭은 CloudWatch Agent를 인스턴스에 설치해야만 수집되며, Agent가 없으면 Nitro가 자동 계측하는 CPU·네트워크·디스크 권고는 나오지만 메모리 권고는 생성되지 않는다. A는 틀림(CO는 메모리 권고 제공). C는 가능성이 있으나 "메모리만 없고 CPU는 나온다"는 단서가 메트릭 종류 문제(특정 메트릭 부재)임을 가리킨다 — 14일 미달이면 CPU 권고도 안 나온다. D도 권고 자체가 아예 안 나올 것이다. 함정: "메모리 권고만 부재"의 정답은 거의 항상 CW Agent 미설치다.

---

**문제 2.** 운영팀이 수천 대 EC2의 rightsizing을 일회성이 아니라 지속적으로 자동화하려 한다. 권고를 안전하게 적용하는 파이프라인으로 가장 적합한 것은?

A) Trusted Advisor 콘솔에서 매주 수동 검토

B) Compute Optimizer 권고를 S3로 Export → EventBridge → Lambda 필터 → 비프로덕션 자동 적용, 프로덕션은 승인 게이트 후 적용

C) 모든 권고를 즉시 자동 적용하는 Lambda

D) CloudWatch Alarm으로 CPU 낮으면 자동 종료

**정답: B**
해설: 지속적·안전한 rightsizing은 CO 권고를 S3로 Export하고 Lambda가 performance risk 낮은 Over-provisioned 권고만 필터링한 뒤, 위험이 낮은 비프로덕션은 자동 적용하고 프로덕션에는 승인 게이트를 둬 적용하는 파이프라인이다. A는 규모에서 검토 속도가 인프라 증가를 못 따라간다. C는 ML 권고를 무비판적으로 적용해 spike 워크로드를 잘못 줄일 위험이 있다. D는 평균 CPU만 보는 단순 룰이라 배치 spike를 죽일 수 있다. 함정: 운영 워크로드에는 반드시 승인 게이트를 두고, 위험도에 따라 자동/수동을 이원화한다.

---

**문제 3.** ASG로 관리되는 인스턴스들을 Compute Optimizer 권고에 따라 더 작은 타입으로 교체하려 한다. 올바른 방법은?

A) 각 인스턴스를 stop → ModifyInstanceAttribute → start

B) Launch Template 새 버전에 권장 타입을 넣고 Instance Refresh로 롤링 교체

C) ASG를 삭제하고 새로 생성

D) 인스턴스를 직접 종료하면 ASG가 알아서 새 타입으로 띄운다

**정답: B**
해설: ASG 환경에서 인스턴스를 직접 stop/modify하면 ASG가 헬스 체크에서 비정상으로 판단해 종료·재생성하며, 이때 옛 Launch Template의 기존 타입으로 다시 뜬다. 올바른 방법은 Launch Template의 새 버전에 권장 타입을 넣고 Instance Refresh로 MinHealthyPercentage를 지키며 점진적으로 무중단 교체하는 것이다. A는 ASG가 간섭해 실패한다. C는 불필요하게 파괴적이다. D는 기존 Launch Template의 옛 타입으로 다시 띄워져 교체가 안 된다. 함정: "ASG 인스턴스 직접 modify"는 오답이며 Launch Template + Instance Refresh가 정답이다.

---

**문제 4.** 보안·성능·내결함성·비용·서비스 한도를 아우르는 넓은 점검을 룰 기반으로 빠르게 받고 싶다. 어떤 도구인가?

A) Compute Optimizer

B) Trusted Advisor (Business 이상 Support)

C) CUR

D) X-Ray

**정답: B**
해설: Trusted Advisor는 Cost·Performance·Security·Fault Tolerance·Service Limits 5개 카테고리를 룰 기반으로 넓게 점검하며, 전체 체크는 Business 이상 Support에서 활성화된다. A(Compute Optimizer)는 컴퓨팅·스토리지를 ML로 좁고 깊게 분석하지 정책·내결함성 전반을 보지 않는다. C(CUR)는 청구 데이터이지 점검 도구가 아니다. D(X-Ray)는 분산 추적이다. 함정: "넓고 얕게 5개 카테고리"는 Trusted Advisor, "좁고 깊게 정밀 권고"는 Compute Optimizer. (참고: Azure는 Azure Advisor, GCP는 Recommender가 대응.)

---

**문제 5.** 50개 멤버 계정으로 구성된 Organization에서 모든 계정의 rightsizing 권고를 한 화면에서 통합해 보려 한다. 가장 적합한 방법은?

A) 각 계정 콘솔을 순회하며 확인

B) Compute Optimizer를 위임 관리자로 지정하고 Org 차원에서 활성화(opt-in)

C) Config Aggregator로 권고 수집

D) Cost Explorer에서 계정별 필터

**정답: B**
해설: Compute Optimizer를 위임 관리자로 지정하면 Org 전체 멤버 계정의 권고를 중앙에서 집계해 보고 일괄 export·분석할 수 있다. A는 규모에서 비현실적이다. C(Config Aggregator)는 리소스 구성 규정 준수를 모으는 것이지 rightsizing 권고가 아니다. D(Cost Explorer)는 비용 가시화이지 정밀 rightsizing 권고 통합이 아니다. 함정: "여러 계정 rightsizing 권고 통합"은 CO 위임 관리자이며, compliance 통합(Config Aggregator)·비용 통합(Cost Explorer)과 구분해야 한다.

---

**문제 6.** EBS 볼륨을 gp2에서 gp3로 전환하라는 Compute Optimizer 권고를 받았다. 이 전환의 특징으로 옳은 것은?

A) 볼륨을 분리·재생성해야 하므로 긴 다운타임이 필요하다

B) ModifyVolume으로 무중단 전환이 가능하며 보통 비용·성능이 개선된다

C) 인스턴스를 stop해야만 변경된다

D) 데이터가 손실되므로 스냅샷에서 복원해야 한다

**정답: B**
해설: gp2→gp3 전환은 ModifyVolume API로 볼륨을 떼지 않고 무중단(online)으로 수행되며, gp3는 동일 성능 기준 보통 약 20% 더 저렴하고 IOPS·Throughput을 용량과 독립적으로 설정할 수 있다(gp2는 용량에 IOPS가 연동). A·C는 EC2 타입 변경(stop→modify→start)과 혼동한 것으로, EBS 타입 변경은 인스턴스 중단이 불필요하다. D는 틀림(데이터 보존). 함정: EC2 타입 변경은 중단을 동반하지만 EBS gp2→gp3는 무중단이다.

---

**문제 7.** 한 워크로드를 더 긴 lookback과 메모리·디스크 I/O를 반영한 정밀 권고로 분석하고 싶다. 계절성(월말 spike)이 있어 14일로는 부족하다. 어떻게 해야 하나?

A) Trusted Advisor로 전환한다

B) Compute Optimizer의 enhanced infrastructure metrics를 활성화해 lookback을 최대 93일로 늘린다

C) Cost Explorer Forecast를 본다

D) 인스턴스를 더 크게 키운다

**정답: B**
해설: Compute Optimizer의 enhanced infrastructure metrics를 켜면 추가 메트릭(메모리·디스크 I/O 등)을 반영하고 lookback을 기본 14일에서 최대 93일(3개월)로 확장해 월말 spike 같은 계절성을 반영한 정밀 권고를 얻는다. 활성 리소스 시간당 과금되는 유료 옵션이다. A는 룰 기반이라 계절성 패턴을 못 본다. C는 비용 예측이지 rightsizing 권고가 아니다. D는 문제 해결이 아니다. 함정: "더 긴 기간·계절성 반영 정밀 권고"는 enhanced infrastructure metrics가 단서다.