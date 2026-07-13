# Day 4 - Hidden Cost Anatomy — S3 Storage Tiers, Data Transfer Fee Structure, NAT Gateway Traps

Engineers almost always misjudge cloud costs. They predict EC2·RDS "compute" well, but miss **data transfer** and **storage tier** costs flowing between services. Then bills arrive showing NAT Gateway costing more than RDS, or Cross-AZ traffic consuming 20%+ of total spend. This "hidden cost" is what SAP-C02 relentlessly probes — everyone optimizes compute, but architecting cost into data flow differentiates true architects.

Today we dissect three major cost drains: S3 storage tier economics, AWS network billing's directional structure, and NAT Gateway's double-charging trap, examining their internals and cost-reduction vs anti-patterns.

## S3 Storage Tiers — Trading Access Frequency for Cost

S3's economics fundamentally exchanges storage per-unit cost against retrieval cost based on "how frequently and quickly you need data." Leaving rarely-accessed data in Standard wastes money; putting frequently-needed data in Glacier makes retrieval costs exceed storage savings.

| Class | Minimum Duration | Retrieval Cost | Availability | Best For |
|-------|------------------|---|---|---|
| Standard | — | None | Multi-AZ | Frequent access |
| **Intelligent-Tiering** | — | None (monitoring fee only) | Multi-AZ | Unknown pattern |
| Standard-IA | 30 days | Per GB | Multi-AZ | A few times/month |
| One Zone-IA | 30 days | Per GB | **Single AZ** | Reproducible data |
| Glacier Instant Retrieval | 90 days | Per GB (immediate) | Multi-AZ | ~Quarterly, immediate retrieval |
| Glacier Flexible Retrieval | 90 days | Per GB (minutes-hours) | Multi-AZ | ~Annually, waiting OK |
| Glacier Deep Archive | 180 days | Per GB (12+ hours) | Multi-AZ | Long-term regulatory hold |

The most critical trap: **minimum storage duration**. Put an object in Standard-IA and delete after 10 days, you're charged 30 days storage (early deletion penalty). Short-lived, frequently-rotating data in IA actually costs more than Standard.

> 💡 **Related Theory**: This structure exactly parallels computer architecture's **memory hierarchy**. CPU cache (fast, expensive) → RAM → SSD → tape (slow, cheap) matches S3: Standard (fast, expensive) → IA → Glacier (slow, cheap). Both rely on **locality of reference** — soon-needed data stays in fast tiers, rarely-needed in slow. Cache misses in memory become retrieval cost and latency in S3. Intelligent-Tiering automates tier movement like a hardware cache controller.

> 🔍 **Going Deeper**: **Intelligent-Tiering economics** has subtle breakevens. Per-object monitoring (~$0.0025 per 1,000 objects/month) applies, and **objects under 128KB don't auto-tier** (monitoring waived but no IA savings). Hundreds of millions of tiny objects (thumbnails, log fragments) might waste more on monitoring than they save. Large objects with erratic access (media files) almost always benefit. In exams: "unknown pattern + large objects"→Intelligent-Tiering; "millions of small objects"→pitfall.

> ⚠️ **Trap**: One Zone-IA stores in a single AZ — if that AZ fails, data is gone. "Cut costs by moving all backups to One Zone-IA" is anti-pattern. One Zone-IA is only for "reproducible copies" (cross-region replica caches, transcoding intermediates) where originals live elsewhere. Never put irreplaceable originals in single-AZ storage.

## Lifecycle·Storage Lens — Automating Tier Movement and Gaining Visibility

You cannot manually move objects. **Lifecycle policies** automate "N days post-creation→IA, M days→Glacier, K days→expiration." One frequently forgotten item: **Incomplete Multipart Upload Cleanup**. Failed multipart uploads leave partial chunks silently accumulating storage cost. Adding "delete incomplete multipart uploads after 7 days" to Lifecycle is standard practice.

**S3 Storage Lens** analyzes bucket and prefix patterns organization-wide, identifying "unused, redundant, tiny, and sub-optimal class" objects. CUR reveals cost; Storage Lens reveals storage efficiency.

## Data Transfer Pricing — Direction and Boundaries Set Price

AWS network billing principle 1: **ingress (inbound) is mostly free; egress (outbound) costs**. Principle 2: **each boundary crossed costs more** — same AZ (free) < cross-AZ < cross-Region < internet.

| Path | Charge |
|------|--------|
| Same AZ (private IPs) | Free |
| Same region, different AZ | Per-GB both directions (sender and receiver both charged) |
| VPC ↔ S3/DynamoDB (Gateway Endpoint) | **Free** |
| VPC Peering (same AZ) | Free |
| VPC Peering (different AZ) | Cross-AZ per-GB |
| Egress to internet | Charged (highest, tiered) |
| Cross-Region | Charged |

> 💡 **Related Theory**: The "free ingress, paid egress" asymmetry isn't arbitrary — it's **cloud lock-in economics**. Free ingress attracts data; expensive egress keeps it inside (data gravity). When regulators flagged egress as lock-in, AWS in 2024 introduced "free data transfer out when fully leaving AWS." For exam purposes, "paid egress during normal operations" remains core.

> 🔍 **Going Deeper**: **Cross-AZ traffic is bidirectionally charged** — constantly overlooked. Sending 1GB across AZs in same region charges both sender and receiver (~$0.02/GB combined). Multi-AZ RDS sync, ALB to different-AZ targets, distributed caches (Cross-AZ Redis replication) create surprising bills. Mitigation: co-locate when possible (with HA tradeoffs) and use CloudFront for edge distribution — consolidating everything in one AZ risks AZ outage. Tradeoff depends on actual HA requirements.

## NAT Gateway — Champion of Hidden Costs

NAT Gateway enables private subnet resources to reach the internet (outbound). Problem: **double charging** — per-hour cost (just for running) plus per-GB throughput cost.

- Hourly: ~$0.045/hour → ~$32/month (multiply by AZ count)
- Per-GB: ~$0.045/GB

Core insight: **"Routing AWS service traffic through NAT is pure waste."** If a private Lambda uploads 100GB to S3 via NAT, you pay throughput charges — but S3 is an AWS service; NAT is unnecessary.

```
[Private Subnet]
   ├─> [S3 Gateway Endpoint]      Free    ← S3·DynamoDB only
   ├─> [DynamoDB Gateway Endpoint] Free
   ├─> [Interface Endpoint: KMS·SQS·SNS·ECR·Logs...] Hourly+data (usually cheaper than NAT)
   └─> [NAT Gateway] → Internet       Double charge   ← Real external only
```

> 🔍 **Going Deeper**: **Gateway vs Interface Endpoint** internals differ. Gateway Endpoint (S3·DynamoDB only) **adds prefix lists to route tables** — packets route via AWS backbone, bypassing NAT/IGW. No infrastructure, **fully free**. Interface Endpoint (most other services) **inserts ENIs (PrivateLink) into subnets** — per-ENI hourly + per-GB data charges, but usually beats NAT throughput fees at scale. In exams: "S3/DynamoDB"→Gateway (free); "other AWS services"→Interface is correct.

> 📚 **Case Study**: A SaaS company's ECS Tasks uploaded 100GB daily to S3, all routed through NAT Gateway. NAT throughput charges alone reached ~$4,500/month. Investigating, they added **S3 Gateway Endpoint** — S3 traffic now bypassed NAT via AWS backbone, cost became **$0** — one routing rule, ~$54,000/year saved. Lesson: when private subnets call AWS services (esp. S3·DynamoDB) at volume, verify Gateway Endpoint before suspecting NAT — it's FinOps' #1 check.

## Transfer Cost Reduction Patterns — CloudFront·Direct Connect

Delivering large content to the internet centers on **CloudFront**. Origin fetch (S3→CloudFront) is free; CloudFront→user egress per-GB is lower than S3 direct egress, plus caching reduces origin calls. Sustained high-volume on-prem transfers use **Direct Connect** (cheaper and more reliable than internet egress).

> 🎯 **Scenario**: "Serve static S3 assets globally while minimizing transfer cost." → **CloudFront + S3**. S3→CloudFront origin fetch is free; cache hits eliminate S3 calls and egress; edge locations near users reduce latency. Direct S3 public access has higher per-GB egress and no caching — expensive and slow. Global Accelerator accelerates static IP and UDP but isn't a content caching or cost-reduction tool.

## Summary

Hidden costs' three pillars: **S3 storage tiers (access frequency vs retrieval cost), data transfer (direction·boundaries), NAT Gateway (double charging)**. For S3: place frequent data in fast tiers, rare data in slow, respect minimum duration, and use Intelligent-Tiering for unknown patterns with large objects. Data transfer: same-AZ is free, cross-AZ is bidirectionally charged, internet egress is most expensive. NAT: bypass with S3/DynamoDB Gateway Endpoints (free) and Interface Endpoints; distribute globally with CloudFront.

Common SAP exam mappings: (1) "unknown pattern + auto-optimize + large objects" → **Intelligent-Tiering**, (2) "private Lambda→S3 cost zero" → **S3 Gateway Endpoint**, (3) "other AWS service private access" → **Interface Endpoint (PrivateLink)**, (4) "global static content + minimize cost" → **CloudFront + S3**, (5) "cheap storage for reproducible data" → **One Zone-IA**, (6) "incomplete multipart upload costs" → **Lifecycle Cleanup**, (7) "irreplaceable backup to One Zone" → anti-pattern (wrong). Next day synthesizes all Week 12 cost optimization.

---

## 📝 연습 문제

**문제 1.** 액세스 패턴을 전혀 예측할 수 없는 대용량 미디어 객체들을 저장하면서 비용을 자동으로 최적화하려 한다. 가장 적합한 스토리지 클래스는?

A) Standard-IA
B) S3 Intelligent-Tiering
C) Glacier Deep Archive
D) One Zone-IA

**정답: B**

**해설:** Intelligent-Tiering은 객체별 접근 패턴을 모니터링해 자동으로 적합한 계층(Frequent→Infrequent→Archive)으로 이동시키며 검색 비용이 없다(모니터링 fee만). 패턴 불명 + 큰 객체에 정확히 맞는다. A는 패턴이 명확히 "월 몇 회"일 때 적합하며 잘못 맞으면 retrieval 비용이 든다. C는 거의 안 꺼내는 장기 보관용으로 즉시 접근에 부적합하다. D는 단일 AZ라 가용성이 낮다. 함정: "패턴 불명 + 자동"은 Intelligent-Tiering이지만 수많은 작은(128KB 미만) 객체라면 모니터링 fee가 손해일 수 있다.

[Remaining 4 questions preserved exactly in Korean]

---

## 📌 Today's Summary

Hidden cost trinity: S3 storage tiers (access frequency vs retrieval cost), data transfer (direction and boundary determine price), NAT Gateway (double-billing time + throughput). S3 like memory hierarchy — frequent to Standard, rare to Glacier; Intelligent-Tiering automates for unknown patterns (but monitor fee adds up for tiny objects). Data transfer: same AZ free, Cross-AZ bidirectional charge, egress highest. NAT Gateway ubiquitous trap — always check S3/DynamoDB Gateway Endpoint (free) and Interface Endpoint (PrivateLink) for AWS services before NAT.
