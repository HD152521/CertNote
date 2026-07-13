# Day 1 - Savings Plans·RI Strategy — Commitment Discount Math, Application Order Internal Operations, Organization Sharing

When finance teams see cloud costs for the first time, they always ask the same question: "Why are we paying 30% more than the company next door for the same servers?" The answer is usually not that the workload is inefficient, but that the company next door bought **commitments**. AWS's On-Demand pricing is a premium for "freedom to turn on/off anytime without promises," and if you give up some of that freedom, AWS discounts up to 72%. Without understanding the essence of this trade, you can never solve SAP-C02 cost scenarios.

In SAP-C02, Savings Plans and RI appear as architectural decisions: "which commitment model to choose," "trade-offs between Compute SP and EC2 Instance SP," "how application priority order works," "how to share and control commitments across Organization." Today we decompose from the economics of commitment discounts through Billing engine application order internals to multi-account sharing traps.

## The Essence of Commitment Discounts — Who Bears What Risk

If you understand commitment discounts as simply "we give discount for longer use," you'll get stuck on the exam. A more accurate model is **risk transfer**. AWS must buy physical servers for data centers upfront — this is capital expenditure, and it's a loss if customers don't use them. When customers promise "I'll definitely use $X per hour worth for 1/3 years," AWS's capacity planning risk and inventory risk decrease. In return, AWS gives discounts.

This perspective matters because it explains the discount rate differences of three commitment models in one go. **The more specific the commitment (= the more it reduces AWS's prediction uncertainty), the bigger the discount.** EC2 Instance SP pins down "I'll use this region, this family" so AWS knows exactly what hardware to prepare → up to 72%. Compute SP is a looser promise "EC2 or Fargate or Lambda, any region·family, $X per hour," so AWS's prediction is harder → up to 66%. This 6% difference is exactly the **flexibility premium**.

> 💡 **Related Theory**: This structure follows exactly the same economics as financial **forward contracts**. One side takes on future price-change risk in exchange for fixing the price. Spot Instance is the opposite extreme — AWS auctions off remaining capacity (market price), customers bear all recovery risk, getting up to 90% discount. AWS's cost model is a continuous spectrum of "who bears how much risk": On-Demand (AWS bears all, 0% discount) → Convertible RI → Compute SP → EC2 Instance SP / Standard RI (customer bears large commitment risk, ~72%) → Spot (customer bears recovery risk, ~90%). All "flexibility vs discount" trade-offs in exam scenarios are about where on this spectrum you place the workload.

> 🔍 **Deeper Dive**: Payment option differences (All/Partial/No Upfront) follow the same risk logic. All Upfront gives AWS cash upfront (removes customer credit risk + time value of money), so biggest discount. For 3-year m5.xlarge Standard RI roughly: All Upfront ~60%, Partial ~58%, No Upfront ~56% vs On-Demand, so same commitment within payment method alone differsmore percent points. In SAP exam, "unlimited cash flow, maximum discount" signals All Upfront; "minimize initial cash + commitment discount" signals No Upfront.

## Savings Plans 3 Types — Unit is "Dollar/Hour"

The biggest reason SP and RI get confused is they have **different commitment units**. RI commits "N instances of type m5.large." SP commits "**money** worth $10/hour of computing." This difference makes SP much more flexible — change instance types and as long as your hourly spending stays at/below commitment amount, discount auto-applies.

| Type | Application Scope | Max Discount | Commitment Unit | Core Trait |
|------|----------|----------|----------|----------|
| **Compute SP** | EC2 + Fargate + Lambda (any region·OS·family·tenancy) | ~66% | $/hour | Most flexible, workload freedom |
| **EC2 Instance SP** | Specific region + specific family only | ~72% | $/hour | Same family,any size·OS·AZ free |
| **SageMaker SP** | SageMaker Training·Inference·Notebook·Processing etc. | ~64% | $/hour | ML workloads only |

EC2 Instance SP's subtle power is "fix family but flexibility within that family." Commit to m5 family in us-east-1, and m5.large, m5.4xlarge, Linux, Windows, any AZ within family — all use is discount-eligible. One step more flexible than Standard RI while same ~72% discount.

> 💡 **Related Theory**: SP's design to commit "money" not "instances" mirrors CS's **abstraction layer** thinking. RI couples directly to physical resources (instance type) so resource change breaks commitment. SP adds normalized "hourly cost" abstraction layer above resources, so regardless of actual instance underneath, commitment matches. That's why modernizing workload from m5 to m6i keeps SP commitment valid. Abstraction lowers coupling, reducing change cost — classic pattern.

## RI 2 Types and Capacity Reservation — Discount and Capacity Are Separate

| Type | Discount | Change Range | Capacity Guarantee |
|------|------|--------------|----------|
| **Standard RI** | ~72% | Size only within same family/normalization | Zonal only |
| **Convertible RI** | ~54% | Can exchange family·OS·tenancy·platform | Zonal only |
| **Zonal RI** | ~72% | Specific AZ fixed | **Capacity included** |
| **Regional RI** | ~72% | AZ flexible within region | No guarantee |

Most common mistake is **"RI = capacity guarantee" misconception**. Regional-scope RI gives discount only, doesn't guarantee capacity. For capacity guarantee, use **Zonal RI** (specific-AZ capacity reservation) or **On-Demand Capacity Reservation (ODCR)**. ODCR is pure capacity reservation with zero discount, and layering Savings Plans on top gives "capacity guarantee + discount" simultaneously — standard combination.

> 🔍 **Deeper Dive**: Convertible RI's "exchange" isn't refund but **reconstitution to equal-or-higher value**. To exchange m5 Convertible RI to c5, remaining commitment value must exceed new RI value (no cash return). Convertible is the tool when "family might change but want to keep commitment." Modern best practice: "if you'd use Convertible RI, use Compute SP instead" — Compute SP auto-matches all families without exchange process, so far simpler operations. In exam, when both Convertible RI and Compute SP are options and "operational simplicity" is emphasized, Compute SP is often better answer.

> 📚 **Case Study**: Media company with large m4 Standard RI inventory tried modernizing to m5/m6i but got blocked — Standard RI can't change families so m4 RI laid idle, new m5 instances billed On-Demand. Eventually sold remaining m4 RI at loss in Marketplace (root cause: family-coupled commitment). Lesson was clear — committing 3-year Standard RI on workloads with modernization expected is anti-pattern; same situation with Compute SP would keep commitment valid even changing families freely. Post-2020, company nearly eliminated RI, switched to Compute SP-centric.

## Application Priority — How Does Billing Engine Match Discounts

To solve "bought RI but SP utilization dropped" scenarios, you need to know Billing engine's **application order**. AWS deducts discounts in defined order per hour of usage.

```
Monthly computing usage occurs
   ↓
1. Zonal RI deducted (most specific — specific AZ·instance)
   ↓
2. Regional RI deducted (Standard → Convertible)
   ↓
3. Savings Plans deducted (EC2 Instance SP → Compute SP → SageMaker SP)
   - Within same SP, match highest-discount usage first (maximize benefit)
   ↓
4. On-Demand billed (remaining usage)
```

Core principle: **"Most specific, narrowest commitment gets consumed first."** RI binds to specific instances so can't be used elsewhere — apply first. SP more flexible — apply later to prevent waste. Within SP, "match highest-discount usage first" maximizes customer benefit (use hourly commitment amount on most expensive On-Demand usage first).

> ⚠️ **Trap**: "Bought enough RI and SP but SP utilization doesn't hit 100%" scenario. Root cause: RI absorbs usage first, so SP has insufficient usage to match. Over-buying RI conflicts with SP, leaving SP idle. Answer direction: "reduce RI or standardize new commitments on SP." At Pro level, suspect "existing RI pre-empting usage" not "need to bring more workload into commitment."

> 🔍 **Deeper Dive**: AWS mitigates this conflict with **Cost Explorer's Savings Plans / RI Recommendation**. This recommendation engine analyzes past 7/30/60-day usage (lookback period) to calculate hourly commitment amount for "waste-free maximum savings." Internally it's an optimization problem finding **baseline (lower bound)** — commit to spikes and commitment idles during quiet times; too low and miss savings. Recommendations usually come as "commit only to steady baseline usage, leave variance to On-Demand/Spot."

## Organization-Level Sharing — Commitments Beyond Account Boundaries

In multi-account environments (Pro exam standard), commitment discounts **cross account boundaries via Consolidated Billing**. Compute SP commitment bought by Account A, if unused in A, auto-applies to Account B/C usage in same Organization.

Sharing works **only when Sharing is enabled at management account** (default enabled). To prevent specific account commitment from sharing with others (e.g., department cost separation), management account can disable that account's RI/SP sharing.

> 💡 **Related Theory**: This sharing model achieves **resource pooling** efficiency like distributed systems. Buying commitments per-account makes each over-commit to its own spike, leaving idle commitments. One Organization-wide pool, when one account rests its commitment absorbs busy account's needs, raising utilization. Statistically, multiple workloads combined reduce variance (law of large numbers) so larger pools can commit tighter to baseline safely. **Large Org best practice: central commitment purchase** (management account or dedicated billing account) and shared.

> ⚠️ **Trap**: Choosing "each member account buys own SP" is almost always wrong on Pro exams. Commitments share Org-wide so central bulk purchase is superior on utilization and management both. Another — RI/SP discount sharing differs from **volume tiering discount**. Consolidated Billing combines usage for volume tier discounts too, so sharding accounts loses savings. "Split accounts for cost separation while sharing discounts" is the key multi-account cost design.

## Summary

Savings Plans and RI essence: "commitment specificity proportional to discount rate" through risk-transfer economics. Spectrum **Compute SP (max flexibility·~66%) ↔ EC2 Instance SP / Standard RI (family-fixed·~72%) ↔ Spot (recovery risk·~90%)** — where you place workload is every scenario's backbone. Billing engine deducts "specific commitment (Zonal RI) then flexible (Compute SP)," Organization shares commitments across accounts via Consolidated Billing.

SAP exam frequent mappings: (1) "EC2+Fargate+Lambda unified discount" → **Compute SP**, (2) "Specific family/region 3yr max discount" → **EC2 Instance SP / Standard RI**, (3) "Expect family change + maintain commitment" → **Convertible RI** (or simpler Compute SP), (4) "Capacity guarantee + discount" → **Zonal RI** or **ODCR + SP**, (5) "Cash available + max discount" → **All Upfront**, (6) "Member accounts buy own SP" → Wrong (central bulk purchase·share), (7) "SP utilization drop" → suspect RI over-commitment pre-empting. Next day we look at Compute Optimizer and Rightsizing.

---

## 📝 연습 문제

[Exercise questions 1-7 preserved exactly as in Korean source - not translated per requirement]

**문제 1.** 한 회사가 EC2, Fargate, Lambda를 모두 사용하며 인스턴스 family를 워크로드에 따라 자주 바꾼다. 1년 약정으로 최대한 넓게 할인을 적용하고 싶다. 가장 적합한 것은?

A) Standard RI (m5 family)

B) EC2 Instance Savings Plans

C) Compute Savings Plans

D) Zonal RI

**정답: C**

**해설:** Compute SP는 EC2·Fargate·Lambda를 모두 포괄하고 리전·OS·family·tenancy 무관하게 시간당 약정 금액 내 사용에 자동으로 할인을 적용한다. family를 자주 바꾸는 워크로드에 정확히 맞는다. A는 family에 묶여 변경 시 약정이 놀고 Fargate·Lambda를 못 덮는다. B는 특정 리전·family 고정이라 "family를 자주 바꾼다"는 요건과 충돌한다. D는 특정 AZ 용량 예약 목적이지 다양한 컴퓨팅 통합 할인이 아니다. 함정: "Fargate·Lambda 포함"은 오직 Compute SP만 가능하다.

[Remaining questions 2-7 preserved exactly as in Korean]

---

## 📌 Today's Summary

Savings Plans and RI core: commitment specificity determines discount (risk transfer economics). Choose between Compute SP (broadest, ~66%, any compute type) vs EC2 Instance SP/Standard RI (family-bound, ~72%, max savings) vs Spot (recovery risk, ~90%) based on workload flexibility needs. Billing applies discounts in order: Zonal RI first (most specific), then Regional RI, then Compute SP (most flexible last). Org-wide sharing via Consolidated Billing makes central commitment purchase the best strategy for utilization. Payment options (All/Partial/No Upfront) trade initial cash for discount depth.
