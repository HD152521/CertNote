# Day 1 - Four DR Strategies and RTO/RPO Mapping — History of Disaster Recovery, Physics of Sync/Async Replication, Cloud DR Economics

On August 14, 2003, the Northeast Blackout struck the northeastern US and Canada, leaving 50 million people without power. Many companies depending solely on their own datacenters stopped operations—but financial institutions with geographically distant DR sites survived. This event embedded "DR is not IT's insurance but the core of Business Continuity" across the industry. Twenty years later, AWS commoditized DR by replacing what would cost hundreds of millions in on-premises building a second datacenter with a few API calls.

In SAP-C02 exams, understanding DR as "turning on backups" stays at SAA level. Pro's core is the decision-making skill: choosing a strategy that precisely meets **RTO (Recovery Time Objective) and RPO (Recovery Point Objective)**—two numbers defined by business—while minimizing cost. Today we decompose why the four DR strategies organize into this spectrum, how sync/async replication obeys physical law, and how cloud inverted DR's economics.

## RTO and RPO — Two Numbers That Decide Everything

DR design starts with two time metrics. **RTO (Recovery Time Objective)** is "maximum time allowed from failure to service recovery," and **RPO (Recovery Point Objective)** is "time span of data loss tolerable during failure." RTO points to the **future after failure** on the timeline, while RPO points to the **past before failure**. RTO 1 hour + RPO 5 minutes means "recover within 1 hour, but up to 5 minutes of data loss is acceptable."

These two numbers aren't set arbitrarily by IT but are outputs of **BIA (Business Impact Analysis)**. Only when business specifies "loss per minute of downtime," can you justify spending 10x more to achieve RTO of 1 minute instead of 10 minutes.

> 💡 **Related Theory**: RTO/RPO are formally defined in **ISO 22301** (Business Continuity Management System standard). ISO 22301 mandates deriving MTPD (Maximum Tolerable Period of Disruption) through BIA, then setting RTO within it. NIST SP 800-34 (Federal IT Emergency Planning Guide) uses the same RTO/RPO/WRT framework. WA Framework's Reliability pillar question (REL13: "how do you plan disaster recovery?") borrows these standard terms. In exams, "data loss business tolerates" immediately maps to RPO; "service recovery time" maps to RTO.

> 🔍 **Deeper Dive**: RTO and RPO are independent. A system can have RPO≈0 (can't lose any transaction) but RTO of hours (okay to recover slowly)—e.g., nighttime batch accounting settlement must preserve every trade (RPO≈0) but only needs recovery by next business morning (RTO hours). Conversely, catalog reads prioritize RTO≈0 (must be instant) but tolerate RPO of minutes (re-sync price changes). Exams separate these two numbers to create traps. When "RPO 0" appears, think sync replication or Active-Active; when "RTO hours allowed," think cost-saving room (Backup & Restore).

## Four Strategies — A Spectrum of "How Much Infrastructure Stays On"

The 2021 AWS DR whitepaper organizes DR into four tiers. The essence is simple: **how much infrastructure does the DR region keep running normally?** The percentage (0% to 100%) determines both cost and RTO simultaneously.

| Strategy | RTO | RPO | Cost | DR Region State | Suitable Workloads |
|----------|-----|-----|------|-----------------|-------------------|
| **Backup & Restore** | Hours to days | Hours | ★ | 0%(data only) | Dev, staging, non-critical |
| **Pilot Light** | 10 min–hours | Minutes | ★★ | DB only active, apps cold | Medium importance |
| **Warm Standby** | Minutes–30 min | Seconds–minutes | ★★★ | Scaled-down full stack always running | Mission-critical |
| **Multi-Site Active-Active** | 0–seconds | 0–seconds | ★★★★ | 100%, both process traffic | Finance, payments, gaming |

> 🔍 **Deeper Dive**: Don't memorize the four—understand this one sentence: **"capacity and RTO are inversely proportional; capacity and cost are proportional."** Backup & Restore keeps 0% compute in DR region, cheapest but RTO longest (infrastructure built from scratch). Multi-Site runs 100%, cost nearly 2x but RTO approaches 0 (traffic already flowing). The critical difference between Pilot Light and Warm Standby is **"whether app servers run"**—Pilot Light keeps only DB hot, apps cold (AMI prepared); Warm Standby keeps a reduced app stack always up. Warm Standby only "scales out," but Pilot Light must "start apps," yielding longer RTO.

### Backup & Restore — Lowest-Cost Baseline

Regular snapshots (EBS, RDS) and S3 Cross-Region Replication send only data to the DR region; on failure, rebuild entire infrastructure via IaC (CloudFormation, Terraform). Cost is essentially storage only, but infrastructure provisioning plus data recovery takes hours.

> 📚 **Case Study**: The **February 28, 2017 AWS S3 us-east-1 massive outage** (4 hours) started when an engineer mistyped a command, causing mass removal of S3 billing subsystem servers. Countless services (Trello, Quora, Slack partial) depending solely on single-region S3 backup went down simultaneously. Lesson is clear: **backups must be isolated to different regions (or accounts)**. Same-region backup disappears with the region. In exams, "guard against region-wide failure" signals Cross-Region requirement.

### Pilot Light — DB Hot, Apps Cold

Named after airplane pilot light—a small flame keeping the engine ready. DR region keeps DB (Aurora Global Reader, DDB Global Table) always on continuously replicating data, but app servers exist only as AMI/Launch Template (not running). On failure, raise ASG min capacity to start apps and Route 53 switches traffic.

### Warm Standby — Scaled-Down Stack Always Running

DR region runs the **entire stack at reduced capacity** always. App servers already run, so on failure, scale out ASG to production level—RTO is just the scaling time.

### Multi-Site Active-Active — Both Regions Processing Traffic

Both regions process production traffic. Aurora Global (write forwarding) or DDB Global Tables keep data bidirectional sync, Route 53 Latency/Weighted or Global Accelerator distributes traffic. One region dies, the other already processes traffic—RTO approaches 0. Trade-off: data consistency design complexity (conflict resolution) and nearly 2x cost.

> 🎯 **Scenario**: "A global payment company promises 99.99% SLA (annual downtime ~53 minutes). What DR strategy?" — Answer: **Multi-Site Active-Active + Aurora Global (or DDB Global) + Route 53**. 4 nines leave only ~53 minutes annual downtime, so Pilot Light or Warm Standby needing minutes to tens of minutes recovery is practically impossible. 2x cost justified since payment minute-downtime loss exceeds it. In exams, "99.99%+ SLA + global" signals Multi-Site.

## Sync vs Async Replication — The Physics Law Determining RPO

DR strategy RPO ultimately depends on **data replication method**. Replication method is bound by the physics of light speed.

**Synchronous replication** waits until write reaches primary and all copies, receives confirmation (ack), then returns success to client. RPO becomes 0 but round-trip latency (RTT) to copies adds to every write. **Asynchronous replication** returns success immediately after primary write, sending copies later. Writes are fast but if primary dies, unsent data is lost—RPO > 0.

The key is **distance**. us-east-1 (Virginia) and us-west-2 (Oregon) are ~4,000km apart; light round-trip through fiber takes physically ~40ms alone. Sync replication across regions adds this 40ms to every write, collapsing throughput. Therefore **sync replication is only practical across AZs (few km, 1-2ms latency); cross-region is almost always async**.

> 💡 **Related Theory**: This is the physical root of CAP Theorem and PACELC trade-offs. CAP says "during partition (P), choose Consistency (C) or Availability (A)." PACELC goes further: "even without partition (Else), choose between Latency (L) and Consistency (C)." Cross-region sync replication chooses strong Consistency (C), tolerating Latency (L). Async trades latency for Consistency (eventual). Aurora uses cross-region async (storage-level) and within-region sync specifically because of this latency-consistency balance. In exams, "cross-region RPO 0" is nearly impossible or hides massive latency cost.

> ⚠️ **Pitfall**: Don't memorize "RPO 0 = always sync replication." DDB Global Tables are **async** Active-Active but operationally RPO approaches 0—all regions accept writes, so one region dying means data already written elsewhere. Aurora Global's secondary is read-only (single-region writes), RPO usually sub-1-second (not zero). In exams, "RPO 0 + dual-region writes" is DDB Global Tables; "RPO 1 second + global SQL" is Aurora Global.

## Cloud Inverted DR Economics

On-premises, DR meant **building a second datacenter**. It buried hundreds of millions in "insurance" on buildings, servers, cooling, staff that never saw production traffic—only large enterprises and finance could afford genuine DR. Cloud fundamentally changed this.

| Aspect | On-Premises DR | Cloud DR |
|--------|----------------|----------|
| **Initial Investment** | Build second datacenter (CAPEX) | Zero (provision when needed) |
| **Idle Cost** | 100% resource cost always | Pilot Light only DB cost |
| **DR Testing** | Can't validate without real failure | FIS, Game Days regularly |
| **Scaling** | Limited to pre-purchased capacity | Auto Scaling unlimited on failure |
| **Shorten RTO** | Buy more hardware | Change to Warm/Multi-Site (config) |

The core: **"Stop guessing capacity"** (WA general principle) shines brightest in DR. On-premises had to pre-buy entire production capacity for DR region, but cloud runs Pilot Light—DB on, apps off—then Auto Scales explosively only on failure—near-zero idle cost while meeting RTO.

> 🔍 **Deeper Dive**: This economic shift enables cloud DR to **recycle DR sites as cost-saving opportunity**. E.g., Warm Standby's reduced DR stack normally runs batch/analytics, or Multi-Site's dual regions via Latency Routing serve users from the nearer region **simultaneously achieving DR and performance optimization**. Impossible on-premises: "dual-use of DR resources." In exams, "use DR region normally for cost efficiency" signals Active-Active.

## Route 53-Based Failover Orchestration

DR's final puzzle: "detect failure and route traffic to DR." AWS standard is **Route 53 Failover Routing + Health Check**. Attach Health Check to primary record; when unhealthy, DNS automatically switches to Secondary (DR).

- **Failover Routing**: Primary/Secondary redundancy. Auto-switch on Health Check failure.
- **Latency Routing**: Route to fastest region (Multi-Site suitable).
- **Weighted Routing**: Distribute by weight (gradual switchover, canary).
- **Geolocation**: Based on user location (data sovereignty).

> ⚠️ **Pitfall**: DNS Failover has hidden **TTL delay** trap. Even if Route 53 changes record, clients and intermediate resolvers cache the old IP for TTL duration—switching isn't instant. RTO requiring seconds needs more than DNS Failover alone; **Global Accelerator** (anycast IP, fixed endpoint bypassing DNS cache) or Active-Active needed. In exams, "RTO 0–seconds + bypass DNS cache" signals Global Accelerator; "RTO minutes acceptable" signals Route 53 Failover.

## Summary

DR is **business defines RTO/RPO → choose one of four strategies meeting both at lowest cost → implement via Route 53 and replication**. Four strategies (Backup & Restore, Pilot Light, Warm Standby, Multi-Site) spectrum is "how much infrastructure stays on"; capacity and RTO inversely proportional, cost proportional. RPO determined by sync (within-AZ, RPO 0) or async (cross-region, RPO>0) replication, rooted in light-speed physics and CAP/PACELC.

SAP exam frequent mappings: (1) "RTO 24hrs, minimize cost" → **Backup & Restore**, (2) "DB always replicate, apps stopped" → **Pilot Light**, (3) "Reduced stack always, minutes RTO" → **Warm Standby**, (4) "99.99% SLA, dual-region traffic" → **Multi-Site Active-Active**, (5) "RPO 0 + dual-region writes" → **DDB Global Tables**, (6) "Global SQL, RPO 1 second" → **Aurora Global**, (7) "Auto-switch DR traffic" → **Route 53 Failover + Health Check**, (8) "RTO seconds, bypass DNS cache" → **Global Accelerator**. Next day digs into backup infrastructure (AWS Backup, Vault Lock, Cross-Region Copy) to tool level.

---

## 📝 연습 문제

**문제 1.** 한 개발팀이 스테이징 환경의 DR을 설계한다. 비즈니스 SLA는 RTO 24시간·RPO 12시간으로 매우 관대하고, 비용을 최소화하라는 지시를 받았다. 가장 적합한 전략은?

A) Multi-Site Active-Active

B) Warm Standby

C) Pilot Light

D) Backup & Restore

**정답: D**

해설: RTO 24시간·RPO 12시간이라는 관대한 목표와 "비용 최소" 지시가 동시에 주어지면, DR 리전에 컴퓨트를 0% 켜두는 Backup & Restore가 정답이다. 정기 스냅샷·CRR로 데이터만 보내두고 장애 시 IaC로 인프라를 재생성하면 수 시간이 걸리지만 24시간 RTO 안에 충분히 들어온다. A·B·C는 모두 더 빠른 RTO를 제공하지만 그만큼 유휴 자원 비용이 발생해, 충족할 필요 없는 RTO를 위해 돈을 낭비하는 over-engineering이다. 함정: "충족 가능한 가장 저렴한 전략"을 고르는 것이 Pro 사고이며, RTO를 과도하게 초과 달성하는 것은 비용 낭비다.

---

**문제 2.** 한 회사가 DR 리전인 us-west-2와 production인 us-east-1 사이에 데이터베이스를 **리전 간 동기 복제(RPO 0)**로 구성하려 했더니 쓰기 처리량이 급감했다. 원인으로 가장 정확한 것은?

A) us-west-2의 인스턴스 사양이 부족하다

B) 약 4,000km 거리로 인한 왕복 지연이 모든 쓰기에 더해졌다

C) KMS 암호화가 복제를 느리게 한다

D) Route 53 TTL이 너무 길다

**정답: B**

해설: 동기 복제는 모든 사본의 ack를 받아야 쓰기가 완료되므로, primary와 사본 사이의 왕복 지연(RTT)이 모든 쓰기 지연에 더해진다. us-east-1↔us-west-2는 약 4,000km로 빛의 물리적 왕복만 약 40ms이며, 여기에 네트워크 오버헤드가 더해져 쓰기마다 수십 ms가 추가된다. 이것이 리전 간 동기 복제가 비현실적이고 거의 항상 비동기를 쓰는 이유다(CAP/PACELC의 지연-일관성 트레이드오프). A는 사양 문제로 오해한 것이고, C·D는 처리량 급감의 본질과 무관하다. 함정: "리전 간 RPO 0"을 요구하면 큰 지연 대가를 의심해야 한다.

---

**문제 3.** 한 미디어 회사가 DR 리전에 production과 동일한 전체 스택을 **축소된 capacity로 항상 가동**하고, 장애 시 Auto Scaling으로 확장해 수 분 내 복구하려 한다. 이 전략은?

A) Backup & Restore

B) Pilot Light

C) Warm Standby

D) Multi-Site Active-Active

**정답: C**

해설: Warm Standby의 정의는 "DR 리전에 축소된 capacity의 전체 스택(앱 서버 포함)을 상시 가동하고, 장애 시 스케일 아웃으로 production 수준에 도달"이다. 앱 서버가 이미 떠 있어 스케일 아웃 시간만 걸리므로 RTO가 수 분이다. B(Pilot Light)는 DB만 켜두고 앱은 콜드(AMI만 준비)라 앱을 처음 시작해야 해 RTO가 더 길다 — "앱 서버가 항상 떠 있느냐"가 둘을 가르는 결정적 차이다. A는 DR 리전에 아무것도 안 켜두고, D는 양쪽이 트래픽을 받는다. 함정: "축소판 전체 스택 상시 가동"은 Warm Standby의 직답 키워드다.

---

**문제 4.** 한 글로벌 게임 회사가 매치메이킹 서비스에 99.99% 가용성과 양 리전 동시 쓰기를 요구한다. 가장 적합한 DR·데이터 구성은?

A) Backup & Restore + S3 CRR

B) Pilot Light + Aurora Read Replica

C) Warm Standby + RDS Multi-AZ

D) Multi-Site Active-Active + DynamoDB Global Tables

**정답: D**

해설: 99.99% SLA(연간 다운타임 약 53분)는 장애 시 수 분이 걸리는 Pilot Light·Warm Standby로는 사실상 불가능하고, 양 리전이 이미 트래픽을 받는 Multi-Site Active-Active만이 RTO를 0에 수렴시킨다. "양 리전 동시 쓰기"는 multi-master인 DynamoDB Global Tables가 정답이다(Aurora Global의 secondary는 read-only). A·B·C는 모두 RTO가 분 단위 이상이라 4 9 SLA를 못 맞추고, B의 Read Replica는 양 리전 쓰기를 지원하지 않는다. 함정: "99.99% + 양 리전 쓰기"는 Multi-Site + DDB Global Tables의 직답 조합이다.

---

**문제 5.** 한 회사가 Route 53 Failover Routing으로 DR 전환을 구성했으나, 실제 장애 시 일부 사용자가 수 분간 여전히 죽은 primary로 접속했다. 원인과 RTO를 초 단위로 줄이는 해법으로 가장 정확한 것은?

A) Health Check 간격을 늘린다

B) DNS TTL 캐싱이 원인이며, Global Accelerator로 DNS 캐싱을 우회한다

C) Secondary 레코드를 삭제한다

D) Route 53를 다른 리전으로 옮긴다

**정답: B**

해설: Route 53가 레코드를 Secondary로 바꿔도 클라이언트·중간 DNS 리졸버가 이전 IP를 TTL 동안 캐싱하면 그 시간만큼 전환이 지연된다 — 이것이 DNS 기반 Failover의 본질적 한계다. RTO를 초 단위로 요구하면 Global Accelerator의 애니캐스트 고정 IP를 쓰면 된다. 클라이언트는 항상 같은 IP를 보고, AWS 네트워크 내부에서 엔드포인트를 즉시 전환하므로 DNS 캐싱 영향을 받지 않는다. A는 오히려 감지를 느리게 하고, C·D는 무관하다. 함정: "DNS 캐싱으로 인한 전환 지연 + 초 단위 RTO"는 Global Accelerator의 시그널이다.

---

**문제 6.** 한 기업이 비용 절감을 위해 DR 리전을 평소에는 유휴로 두지 않고 사용자 트래픽 처리에도 활용하고 싶다. 가장 적합한 접근은?

A) Backup & Restore로 전환한다

B) Pilot Light에서 DB만 더 크게 띄운다

C) Multi-Site Active-Active로 양 리전을 Latency Routing으로 묶어 DR과 성능 최적화를 동시에 달성한다

D) DR 리전을 삭제한다

**정답: C**

해설: 클라우드 DR의 경제학이 온프레미스와 다른 핵심은 DR 자원을 이중 활용할 수 있다는 점이다. Multi-Site Active-Active로 양 리전을 모두 production으로 운영하고 Route 53 Latency Routing으로 사용자에게 더 가까운 리전을 제공하면, DR(한쪽 장애 시 다른 쪽이 흡수)과 성능 최적화(지연 감소)를 동시에 얻는다 — 유휴 자원이 사라진다. A·B는 오히려 DR 리전을 더 유휴화하고, D는 DR을 포기하는 것이다. 함정: "DR 리전을 평소에도 활용"은 Active-Active 구성의 신호다.

---

**문제 7.** RTO와 RPO의 관계로 가장 정확한 설명은?

A) RTO와 RPO는 항상 같은 값이어야 한다

B) RTO는 장애 이후 복구까지의 미래 시간, RPO는 장애 이전 허용 데이터 손실의 과거 시간으로 서로 독립적이다

C) RPO가 0이면 RTO도 반드시 0이다

D) RTO는 데이터 손실, RPO는 복구 시간을 의미한다

**정답: B**

해설: RTO(Recovery Time Objective)는 시간축에서 장애 이후 미래(복구까지 허용 시간)를, RPO(Recovery Point Objective)는 장애 이전 과거(잃어도 되는 데이터의 시간 폭)를 가리키며 서로 독립적이다. 야간 배치 회계 시스템처럼 RPO≈0(모든 거래 보존)이지만 RTO는 수 시간(다음 영업일까지 복구)인 경우가 실재한다. C는 둘을 잘못 연동한 것이고, D는 RTO와 RPO의 정의를 뒤바꾼 것이다. 함정: "허용 데이터 손실"은 RPO, "복구 시간"은 RTO로 정확히 구분해야 하며 둘은 따로 흔들린다.

---