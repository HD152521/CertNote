# Day 2 - Domain 3+4 Integrated: Resilience and Observability as Failure Prevention

Today: **resilience (22%) and monitoring (14%)**, together 36% of the exam. Again, split in the blueprint but woven in practice. Resilience without observability is blind — you rebuild the same failure. Observability without resilience is watching burndown without circuit breakers. Today, link them as "observability detects failure, resilience contains blast radius, feedback loop prevents recurrence."

## RTO/RPO Math — Defining Failure's Business Impact

Resilience starts with business language, not engineering.

> 💡 **Related theory**: RTO (Recovery Time Objective) and RPO (Recovery Point Objective) are **legal/business contracts**, not technical specs. RTO = "how long can you be down?" RPO = "how much data loss is acceptable?" From these, architecture **must follow.** RTO 1min, RPO 1sec → multi-region active-active + continuous replication. RTO 4h, RPO 1h → single-region with hourly backup. RTO/RPO define **Tier** (Tier-1 critical vs Tier-3 non-critical), which drives cost·complexity.

| Use Case | RTO | RPO | Architecture | Cost |
|---|---|---|---|---|
| Banking core | 1min | 0 sec (sync replication) | Multi-region active-active, Aurora Global, DynamoDB Global Tables | $$$ |
| SaaS web app | 1h | 15min | Standby region (cross-region read replica), hourly snapshot | $$ |
| Data warehouse | 8h | 1h | Single-region snapshot, restore as needed | $ |
| Development | 24h | 1h | Local backup to S3 | $ |

> 🔍 **Deeper**: **RTO and RPO are asymmetric.** "RTO 1min, RPO 24h" means: failover fast but tolerate 1 day of data loss (e.g., cold analytics). DynamoDB Global Tables: RTO ~sec (instant failover), RPO ~1sec (nearly sync). Aurora Global Database: RTO ~1sec (Failover API), RPO depends on replication lag (~100ms typical, but not zero). Exam: "what RTO/RPO" → read scenario, map to architecture.

> 📚 **Case study**: 2017 **GitHub DDoS + DNS hiccup**, took 25 min to fail over to backup region, not because technology failed but because "what is our RTO?" was never documented. Result: regulatory fine + SLA breach. Lesson: define RTO/RPO first, then pick architecture.

## Disaster Recovery Strategies — Four Models

AWS defines four patterns; each trades cost vs speed.

| Strategy | Description | Failover speed | Data loss | Cost | AWS service fit |
|---|---|---|---|---|---|
| **Backup & Restore** | Backup snapshot to S3, restore on demand | Hours | Up to RPO interval | Lowest | S3 + AMI + RDS Backup |
| **Pilot Light** | Minimal replica running, scale on failure | Minutes | Low (streaming replication) | Low-medium | Cross-region RDS read, EC2 standby |
| **Warm Standby** | Full replica running, ready to take traffic | Minutes | Near-zero (sync replication) | Medium | Aurora multi-AZ, cross-region read replica + ALB failover |
| **Multi-region Active-Active** | Full production in each region, traffic split | Seconds | Zero (continuous sync) | Highest | Global Accelerator, DynamoDB Global, Aurora Global |

> 💡 **Related theory**: Each step up trades speed for cost. Backup+Restore: cheapest, slowest. Active-Active: fastest, most expensive. Middle ground (Warm Standby) is **most popular for cloud** — define your RTO, buy just enough replica to hit it. "RTO 4h" doesn't need active-active; pilot light suffices.

> ⚠️ **Gotcha**: **Failover is not automatic in Pilot/Warm.** You must: (1) detect failure (CloudWatch alarm), (2) invoke failover (manual API call or Lambda). This is why **Circuit Breaker + Health Checks** matter — application detects bad region, stops sending traffic before you manually failover. Exam: "automatic failover" → DynamoDB Global (automatic) or manual + Lambda trigger (on-demand).

> 📚 **Case study**: 2013 **Netflix Simian Army** — forced chaos (Chaos Monkey killed random servers) to ensure resilience practices stuck. Lesson: DR is only proven by **running it.** Chaos Engineering (FIS, Gremlin) validates RTO/RPO before real failure hits.

## Observability Trio — Metrics, Logs, Traces

Observability is three orthogonal dimensions.

| Dimension | Queries | Cost | Retention | Use |
|---|---|---|---|---|
| **Metrics** (CloudWatch) | "What is CPU now?" | Low | 15mo (standard), 3y (long) | Aggregates (count, average, max), alarms, dashboards |
| **Logs** (CloudWatch Logs) | "What happened in this service at 3:05pm?" | Medium (storage + analysis) | Configurable (default 7y) | Troubleshooting, audit, compliance |
| **Traces** (X-Ray) | "Why did this request take 5s?" | High (per-request sampling) | 30 days (free), custom retention | Latency root cause, service dependencies |

> 💡 **Related theory**: **Metrics are sparse, logs are verbose, traces are structured.** Metrics: "API p99 latency = 500ms" (one number). Logs: "Request 123, queried DB, DB slow, retried" (narrative). Traces: "Request 123 → A (50ms) → B (200ms, retried) → C (250ms, success)" (path). Pro scenario: "Why did deploy hurt latency?" Metrics show spike, logs show "timeout," traces show "downstream service slow." Missing any dimension, you guess; all three, root cause is clear.

> 🔍 **Deeper**: **Log tiers exist for cost.** CloudWatch Logs (all logs) is most expensive. Log Insights queries run post-hoc, cost per gigabyte scanned. Solution: **Route logs by tier**: (1) INFO+ to long-term archive (S3, Athena query), (2) WARN+ to real-time CloudWatch (for alarms), (3) ERROR only to DLQ. Exam: "log cost explosion" → data tiering. Also, **ADOT (AWS Distro OpenTelemetry)** makes metrics/logs/traces portable; if observability SaaS contract changes, ADOT → new vendor without code change.

> 📚 **Case study**: Pinterest (2019) traffic spike, logging system didn't scale, cascaded to application logs being dropped. Result: no visibility, slower incident response. Lesson: **observability is part of capacity planning.** Log volume scales with traffic; must auto-scale storage and query.

## CloudWatch OAM (Observability Account Management)

Multi-account observability is hard. Aggregate metrics/logs/alarms across 100 accounts without central admin role? Slow before OAM.

**CloudWatch OAM** solves this: each spoke account shares metrics/logs/alarms to hub account (Monitoring Account). Hub admin sees unified dashboards, sets alarms on spoke data, no cross-account role needed.

> 💡 **Related theory**: OAM is **opt-in data sharing**, like Delegated Admin but for observability. Spoke account *shares*, hub account *receives*. Hub sees all, spokes see only their own. Enables **central compliance monitoring** (audit account sees all logs) and **central on-call** (single dashboard for all alarms).

> ⚠️ **Gotcha**: OAM does NOT aggregate logs into a central stream. Logs stay in spoke CloudWatch Logs group; hub can run Logs Insights across all spoke groups. Different from centralized logging stack (all logs → central Kinesis/Datadog), cheaper but less powerful.

## Chaos Engineering (FIS — Fault Injection Service)

Resilience is only proven by **failure.** Fault Injection Service runs controlled chaos: disable AZ, kill Lambda, corrupt data, inject latency. Then measure: did Circuit Breaker catch it? Did health check fail? Did we failover?

> 💡 **Related theory**: **Antifragility** (Nassim Taleb): system should improve under stress. Chaos engineering forces this. "Will my failover work?" → deploy FIS experiment in staging, trigger failover, measure RTO. Only then safe for prod.

> 📚 **Case study**: 2011 **AWS us-east-1 outage**, EBS volumes cascaded failure, many SaaS firms down for hours. Lesson: assumed redundancy works, didn't test it. Post-incident, industry adopted chaos engineering to validate.

## Unified Thread: Observability → Resilience → Chaos → Feedback

```
1. Observability: Metrics show spike, logs detail failure, traces pinpoint service
   ↓
2. Resilience: Circuit breaker stops bad requests, failover activates, cache masks outage
   ↓
3. Incident Response: Auto-remediation (Lambda from EventBridge), manual escalation (Incident Manager)
   ↓
4. Postmortem: "Why did failover take 10min? Why didn't alarm trigger?"
   ↓
5. Chaos Test: FIS experiment validates fix
   ↓
6. Prevention: Application updated, alerting refined, runbook improved
   → Repeat
```

> 🎯 **Scenario**: "Global SaaS, multi-region Aurora, 60 accounts. Metrics show one region latency spike. What's the sequence?" → (1) CloudWatch Alarm on p99 latency (observability), (2) X-Ray traces show "DB query slow" (pinpoint), (3) CloudWatch Cross-Region Alarm triggers failover to read-only replica (resilience), (4) Lambda auto-remediation increases read replica capacity (incident response), (5) Incident Manager pages on-call, escalates if unresolved in 5min (human loop), (6) Postmortem: "DB was under memory pressure" → FIS experiment tests "what if replica out of memory" → application now has circuit breaker for slow reads (prevention). Six steps, three domains (observability, resilience, incident response, with chaos validation).

## Summary

Today wove Domain 3+4's 36% together. First, **resilience starts with RTO/RPO business contracts**, which define architecture tier. Second, **four DR strategies** (Backup, Pilot, Warm, Active-Active) trade cost vs speed; choose tier that fits RTO. Third, **observability trio** (metrics, logs, traces) is orthogonal; all three needed for root cause. Fourth, **multi-account observability via OAM** centralizes hub monitoring. Fifth, **chaos engineering (FIS) validates resilience**, measured by RTO/RPO hit or miss. Sixth, **unified thread: observe → contain → remediate → test → prevent**, feedback loop hardens system.

Next: Domain 5+6 (incident response and security) closes final 18%.

---

## 📝 연습 문제

(Practice questions 1-8 in Korean on domain 3+4 resilience, observability, RTO/RPO, DR strategies, FIS, OAM)

---

## 📌 오늘의 요약

오늘 도메인 3+4의 36%를 엮었다. 첫째, 복원력은 RTO/RPO 비즈니스 규약에서 시작하고 이는 아키텍처 계층을 정의한다. 둘째, 네 가지 DR 전략(백업, 파일럿, 웜, 액티브-액티브)은 비용과 속도를 트레이드오프한다. 셋째, 관찰성 3층(메트릭, 로그, 트레이스)은 직교하며 근본 원인 파악에 모두 필요하다. 넷째, 다중 계정 관찰성은 OAM으로 중앙화한다. 다섯째, 혼돈 공학(FIS)은 복원력을 검증하고 RTO/RPO 달성 여부를 측정한다. 여섯째, 단일 피드백 루프: 관찰→격리→자동치유→테스트→예방, 이 흐름이 시스템을 견고하게 한다.
