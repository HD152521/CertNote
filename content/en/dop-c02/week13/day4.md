# Day 4 - Validating Resilience: Chaos Engineering with Resilience Hub and FIS

No matter how well you design a DR strategy, "does it actually work?" is a separate matter. A 5-minute RTO on paper becomes 30 minutes when real failure hits, and a system you thought was "safe because Multi-AZ" collapses the moment one AZ dies. The uncomfortable truth of software reliability is "untested recovery doesn't work." That's where **Chaos Engineering** comes in — a methodology that intentionally injects failures into healthy systems to expose weaknesses before real disasters strike.

AWS has productized this into two services. **Resilience Hub** analyzes your workloads to measure "how much can you actually withstand versus your RTO/RPO goals," and **FIS (Fault Injection Service, formerly Fault Injection Simulator)** actually injects failures like EC2 terminations, network delays, and API throttling. The key is combining both to automate the "measure → experiment → improve" loop. Today we explore where chaos engineering came from (Netflix), what its scientific methodology is, what safety mechanisms (Stop Conditions) FIS uses to prevent operational disasters, and the patterns for periodic automation of all this.

In the DOP exam, this domain shows up as scenarios like "How do you validate and automate resilience?", "What safety mechanisms prevent chaos experiments from destroying operations?", "How do you periodically verify DR failovers?" and the like.

## Where Did Chaos Engineering Come From — Netflix and Chaos Monkey

The origin of chaos engineering is Netflix around 2010. As Netflix migrated from its own data centers to AWS cloud, it faced the reality that "instances can die anytime in the cloud (failure is normal)." The traditional approach was "prevent failures from happening," but Netflix flipped the script — **"Failures will happen anyway. So let's intentionally cause some failures in advance, forcing our system to tolerate them."** That's how **Chaos Monkey** (released 2011) was born — a program that randomly killed instances in production environments.

Chaos Monkey soon evolved into the **Simian Army** (the monkey army) — Latency Monkey (injecting delays), Conformity Monkey (terminating instances that violate rules), Chaos Gorilla (simulating entire AZ failures), Chaos Kong (simulating entire region failures). FIS is AWS's managed service implementation of the Simian Army's philosophy, with strengthened safety mechanisms.

> 💡 **Related Theory**: Chaos engineering isn't just "throwing failures at systems" but applying **scientific method** to system reliability. The 2015 *Principles of Chaos Engineering* articulated by Netflix and others makes this explicit — (1) define the normal state (steady state) with measurable metrics (e.g., 99.9% success rate), (2) form a **hypothesis** that "the system will maintain steady state even under X failure," (3) actually inject failures to validate the hypothesis, (4) if steady state breaks, that's a discovered weakness. This resembles Karl Popper's falsifiability — you attempt to disprove the belief that "the system tolerates this," and if it's not disproven, confidence builds; if it is disproven, you fix the weakness. The core shift is handling resilience not as "belief" but as "verified evidence." That's what changes everything.

## The 5 Principles of Chaos Engineering

Principles to follow when designing FIS experiments:

1. **Hypothesis**: Start with a verifiable claim like "this system maintains 99.9% success rate even if one AZ dies."
2. **Steady State Definition**: Fix metrics before and after the experiment that you'll compare (success rate, P99 latency, throughput) and make them measurable.
3. **Start with Small Blast Radius**: Begin small — one instance, 5% of traffic — and expand as trust builds.
4. **Environment Similar to Production**: Validate from staging, but ultimately in production (or production-like) — weaknesses only surface there.
5. **Stop Condition Always Required**: Always have a safety net to halt the experiment immediately if it gets dangerous.

> 🔍 **Deeper Dive**: "Blast radius" is the core concept of chaos engineering — the scope the experiment affects. Starting with a small blast radius isn't just caution; it's about **efficiency of risk versus learning** — big experiments risk big accidents but teach a lot at once, small experiments are safer but teach slowly. Mature organizations use **progressive exposure** — "start small and expand gradually as safety is confirmed." This mirrors the canary deployment strategy — just as canary "exposes new code to only 5% to contain risk," chaos "confines failure to a small scope" to manage risk. FIS's SelectionMode (PERCENT/COUNT) is precisely this blast radius control mechanism.

## AWS FIS — Managed Chaos Injection

FIS defines and executes **Experiment Templates** (experiment designs). Templates consist of three elements — **Targets** (where), **Actions** (what), **Stop Conditions** (when to stop).

Supported key faults:

| Category | Action Examples |
|----------|-----------------|
| **EC2** | Stop, Terminate, Reboot, CPU/Memory stress, API Throttle |
| **ECS/EKS** | Task/Pod kill, Container CPU/Memory stress |
| **RDS** | Failover, Reboot |
| **Network** | Packet loss, latency injection, DNS errors, connection blocking (SSM Agent-based) |
| **API** | Throttle/error injection to specific AWS APIs |
| **AZ Power** | AZ power failure simulation (disrupt-connectivity) |

```bash
aws fis create-experiment-template \
  --description "30% EC2 CPU stress for 5 min" \
  --role-arn arn:aws:iam::...:role/FISRole \
  --targets '{
    "myInstances": {
      "resourceType": "aws:ec2:instance",
      "resourceTags": {"Environment":"prod"},
      "selectionMode": "PERCENT(30)"
    }
  }' \
  --actions '{
    "cpuStress": {
      "actionId": "aws:ssm:send-command",
      "parameters": {
        "documentArn":"arn:aws:ssm:::document/AWSFIS-Run-CPU-Stress",
        "duration":"PT5M"
      },
      "targets": {"Instances":"myInstances"}
    }
  }' \
  --stop-conditions '[{
    "source":"aws:cloudwatch:alarm",
    "value":"arn:aws:cloudwatch:...:alarm:P99Latency"
  }]'
```

### Target Selection Mode — The Blast Radius Dial

- **ResourceArns**: Specify exact resources.
- **ResourceTags**: Match by tag (e.g., `Environment=prod`).
- **SelectionMode**: `ALL` (all), `COUNT(N)` (N count), `PERCENT(N%)` (N% random).

`PERCENT(30)` means "30% random from tag-matched instances." This dial quantitatively controls blast radius — start at `PERCENT(5)` and scale up to `PERCENT(50)`.

## Stop Condition — Chaos's Safety Belt

FIS's most critical safety mechanism. If a **CloudWatch Alarm fires during the experiment, FIS immediately halts and rolls back the injected failure**. For example, if "P99 latency exceeds threshold," the alarm fires and FIS instantly stops CPU stress — preventing chaos experiments from turning into real disasters.

> ⚠️ **Pitfall**: Chaos experiments without Stop Conditions aren't chaos engineering — they're just **intentional failure**. In exams, the answer to "how do you make chaos experiments safe to minimize operational impact" is almost always "Stop Condition (CloudWatch Alarm-based)." Another common pitfall: Stop Condition only **stops** the experiment, it doesn't undo already-caused damage — so starting with a small blast radius and having Stop Condition must go together (small blast radius means damage before stopping is also small). Safety is multi-layered: "small radius + fast stop," not a single device.

> 📚 **Case Study**: The 2017 AWS S3 us-east-1 massive outage started when engineers debugging accidentally terminated more servers than intended with a single command — essentially an uncontrolled chaos experiment happening by accident. One key lesson from the incident was "**large-scale operations must have blast radius limits and safety mechanisms built-in**." AWS subsequently strengthened safety guardrails on such commands. FIS's SelectionMode (blast radius limit) and Stop Condition (immediate halt) are precisely this incident's lessons productized. The lesson: whether chaos or operational work, "one large operation at once that can't be undone" is the most dangerous anti-pattern.

## AWS Resilience Hub — Measuring and Evaluating Resilience

If FIS is the "hand that injects failure," Resilience Hub is the "doctor who diagnoses resilience." Register a workload, and Resilience Hub analyzes its configuration (CloudFormation stacks, Resource Groups, etc.) to evaluate **whether it can actually achieve your configured RTO/RPO goals**.

```bash
# Resilience policy: RTO/RPO goals by fault type
aws resiliencehub create-resiliency-policy --policy-name Tier1 \
  --policy '{
    "Hardware":{"rtoInSecs":300,"rpoInSecs":60},
    "Software":{"rtoInSecs":300,"rpoInSecs":60},
    "AZ":{"rtoInSecs":600,"rpoInSecs":120},
    "Region":{"rtoInSecs":3600,"rpoInSecs":600}
  }' \
  --tier MissionCritical

aws resiliencehub start-app-assessment --app-arn ... --assessment-name weekly
```

Core value:

- **Measure vs Goal**: Reveals gaps like "RTO goal is 5 minutes but actual configuration needs 12 minutes" (by fault type — Hardware/Software/AZ/Region).
- **Recommendations + Cost Impact**: Offers concrete proposals like "enabling Multi-AZ reduces AZ RTO from 10→2 min, adds $X/month."
- **FIS Integration**: Automatically generates and runs FIS experiments to validate assessment results.
- **Regular Reports**: Tracks resilience score trends.

> 💡 **Related Theory**: Resilience Hub automates and quantifies the AWS **Well-Architected Framework's Reliability Pillar**. Well-Architected prescribes principles like "test recovery procedures," "automatically recover from failure," "scale horizontally for availability," but these are abstract. Resilience Hub translates this to quantified metrics like "your workload's actual AZ failure RTO is X seconds versus goal 600 seconds." This applies the software engineering principle "if you can't measure it, you can't improve it" (often attributed to Drucker, frequently cited by Tom DeMarco) — it handles resilience not as vague confidence but as scores and gaps, making improvement data-driven.

## Periodic Automation — The Measure-Experiment-Improve Loop

The real value of chaos engineering comes not from one-off runs but **periodic repetition**. As code changes and infrastructure evolves, yesterday's resilient system breaks today. Automate FIS experiments with **EventBridge Scheduler** for periodic runs, and collect results via Resilience Hub and CloudWatch.

```
Periodic Chaos Loop
   EventBridge Scheduler (weekly cron)
        ▼
   Lambda → fis:StartExperiment
        ▼
   FIS Experiment (Targets PERCENT(30) / CPU stress / Stop Conditions)
        ▼
   System under stress → Auto-healing (ASG/ECS) active + Alarms monitored
        ▼ (P99 > threshold triggers Stop Condition)
   Report → Resilience Hub updated + Slack notification + Runbook updated with lessons
```

### ARC + FIS — DR Failover Itself as Chaos Target

Trigger the Route 53 ARC Routing Control switch as a FIS Action, you can **periodically validate the DR failover procedure itself**. Automatically verify every month "does region failover actually finish within RTO?" — directly addressing the "untested DR doesn't work" risk emphasized in Day 3.

> 🔍 **Deeper Dive**: **Game Day** and **Chaos Engineering** are often confused but different. Game Day is a **one-time event** where teams gather to manually execute failure scenarios and validate people, processes, and runbooks (quarterly/annually, learning-focused). Chaos Engineering automates failure injection with tools like FIS into **periodic runs** (daily/weekly, validation-focused). They complement each other — Game Day validates "how do people respond to failure" (are runbooks clear, who does what), and Chaos validates "how does the system respond to failure" (does auto-recovery work). Mature organizations train people via quarterly Game Days and validate systems via weekly automated chaos. In exams: "one-time training for people/processes" = Game Day; "periodic automated system validation" = Chaos/FIS.

> ⚠️ **Pitfall**: When automating periodic chaos in production, if "you set Stop Condition thresholds too sensitively out of fear the experiment causes real damage," experiments halt immediately and you learn nothing. Conversely, if too insensitive, experiments become real disasters. So Stop Condition thresholds must be carefully set based on "steady state" metrics, and initially start with small blast radius + conservative thresholds and tune gradually. Safety and learning are a trade-off; balancing this is the art of chaos engineering operations.

## Summary

Today's picture is four-fold. First, **chaos engineering originated from Netflix Chaos Monkey — a methodology applying scientific method (hypothesis→experiment→validation) to system reliability**, the mental shift from "prevent failure" to "intentionally cause failure to force tolerance." Second, **FIS implements this as a managed service** composed of Targets (blast radius dial: PERCENT/COUNT), Actions (failure types), and Stop Conditions (safety belt). Third, **Resilience Hub quantifies the Well-Architected Reliability Pillar**, revealing RTO/RPO goal gaps by fault type, recommended improvements, and costs, with FIS integration for validated verification. Fourth, **EventBridge Scheduler + FIS automates periodic testing**, running the measure-experiment-improve loop, and ARC + FIS periodically validates DR failover itself, with Game Day (people/one-time) and Chaos (system/periodic) as complementary.

Next time we comprehensively review all of Week 13 — Multi-AZ, Multi-Region, DR 4 strategies, Resilience Hub/FIS — through scenario problems.

---

## 📝 연습 문제

**문제 1.** You want to inject CPU stress for 5 minutes into a random 30% of EC2 production instances, but have it immediately stop and roll back if P99 latency exceeds a threshold during the experiment. Which FIS configuration is correct?

A) SelectionMode ALL + no Stop Condition

B) Target SelectionMode PERCENT(30) + Action AWSFIS-Run-CPU-Stress(PT5M) + Stop Condition (CloudWatch P99 Alarm)

C) Terminate all instances

D) Manually raise CPU from the console

**정답: B**

해설: The random 30% is quantitatively blast-radius-controlled via SelectionMode PERCENT(30), CPU stress runs the AWSFIS-Run-CPU-Stress SSM document for 5 minutes (PT5M), and immediate halt on P99 latency threshold exceedance is implemented with a CloudWatch Alarm-based Stop Condition. SelectionMode ALL with no Stop Condition (A) is dangerous because the blast radius is the entire fleet with no safety net; terminating everything (C) differs from the intent (CPU stress) and is too destructive; manual (D) can't be reproduced or automated. The combination of PERCENT (blast radius) + Stop Condition (safety belt) is the core of safe chaos.

---

**문제 2.** What distinguishes chaos engineering from simply "throwing intentional failures" at a system?

A) It kills more instances

B) It follows the scientific method — defining the steady state with measurable metrics, forming the hypothesis that "the system maintains steady state even under fault X," and validating it through experiments

C) It's done only in production

D) It uses no safety mechanisms

**정답: B**

해설: Chaos engineering is an application of the scientific method — you define the steady state with measurable metrics (success rate, P99, etc.), form the hypothesis that "the system will maintain steady state even under a specific fault," then inject a real failure to validate or falsify that hypothesis (Principles of Chaos Engineering). If falsified, that is a discovered weakness. Like Popper's falsificationism, this treats resilience as "verified evidence" rather than "belief." Killing more (A), production-only (C), and removing safety mechanisms (D) are all not the essence of chaos engineering — in fact D is a dangerous anti-pattern.

---

**문제 3.** What is the rationale for the recommended approach of "starting a chaos experiment with a small blast radius (e.g., 5% of instances) and expanding gradually"?

A) Because doing it small is cheaper

B) Progressive exposure — confining and controlling risk in a small scope while gradually building trust, the same idea as canary deployment

C) Because AWS prohibits large experiments

D) Because small experiments are more accurate

**정답: B**

해설: Starting with a small blast radius is a progressive exposure strategy that confines and controls risk in a small scope while gradually building trust — the same idea as a canary deployment that exposes new code to only 5%, controlling risk by "confining failure to a small scope." FIS's SelectionMode (PERCENT/COUNT) is this blast radius dial. Cost (A) and accuracy (D) are not the core, and AWS does not prohibit large experiments (C) — once safety is confirmed, you deliberately expand.

---

**문제 4.** What is the most important safety mechanism preventing a FIS chaos experiment from escalating into a real operational failure?

A) Keep the experiment duration short

B) Stop Condition (CloudWatch Alarm-based) — on threshold exceedance FIS immediately halts and rolls back the experiment, multi-layered defense together with a small blast radius

C) Run the experiment only at night

D) Manually inspect after the experiment

**정답: B**

해설: FIS's Stop Condition is the core safety mechanism that immediately halts the experiment and rolls back the injected failure when a CloudWatch Alarm fires during the experiment (e.g., P99 latency threshold exceeded) — preventing chaos from escalating into a real failure. However, a Stop Condition only stops; it can't undo damage already done, so it must be paired with a small blast radius (PERCENT) as a "small radius + fast stop" multi-layered defense. Short duration (A), nighttime execution (C), and post-hoc inspection (D) are only supplementary — the real-time automatic halt of the Stop Condition is most important.

---

**문제 5.** You want to measure whether your actual configuration achieves the workload's set RTO/RPO goals (e.g., AZ failure RTO 600 seconds), and receive improvement proposals and cost impact when it falls short. Which service is most appropriate?

A) Use FIS alone

B) AWS Resilience Hub — analyzes the workload to present measured gaps versus RTO/RPO goals by fault type (Hardware/Software/AZ/Region) plus recommended improvements and costs, with integrated FIS validation

C) CloudWatch Dashboard

D) AWS Config

**정답: B**

해설: Resilience Hub analyzes the workload configuration to evaluate whether it actually achieves the set resilience policy (RTO/RPO by Hardware/Software/AZ/Region), presents concrete improvement proposals and cost impact when it falls short, and validates results with FIS experiments — it's the quantification tool for the Well-Architected Reliability Pillar. FIS (A) is the hand that injects failure, not something that measures against goals or recommends; CloudWatch Dashboard (C) is metric visualization; and Config (D) tracks configuration compliance, not RTO/RPO evaluation.

---

**문제 6.** You want to automatically verify every month whether the DR region failover procedure actually works within RTO. Which combination is most appropriate?

A) The ops team manually fails over each quarter

B) Trigger the Route 53 ARC Routing Control switch as a FIS Action to automatically validate the DR failover itself as a periodic chaos experiment

C) Only document the procedure

D) Perform Backup more frequently

**정답: B**

해설: Triggering the Route 53 ARC Routing Control switch as a FIS Action lets you validate the DR failover procedure itself as a periodic automated experiment — automatically confirming every month "does region failover actually finish within RTO?", directly resolving the risk that "untested DR doesn't work." Manual quarterly failover (A) is infrequent and error-prone, documentation (C) doesn't validate actual operation, and frequent Backup (D) is unrelated to validating the failover procedure.

---

**문제 7.** What most accurately describes the relationship between Game Day and Chaos Engineering?

A) They are different names for the same thing

B) Game Day is a one-time drill (quarterly/annual) validating people, processes, and runbooks, while Chaos Engineering is periodic automation (daily/weekly) validating the system's auto-recovery — they complement each other

C) Chaos Engineering has replaced Game Day

D) Game Day runs more frequently

**정답: B**

해설: Game Day is a one-time drill (quarterly/annual, learning-focused) where a team gathers to manually execute intentional failure scenarios and check people, processes, and runbooks, while Chaos Engineering periodically automates failure injection (daily/weekly, validation-focused) with tools like FIS. They are complementary — Game Day validates "how do people respond to failure," Chaos validates "how does the system respond to failure." Mature organizations train people with quarterly Game Days and validate systems with weekly automated chaos. They are neither the same thing (A) nor a replacement relationship (C), and since periodic-automated Chaos runs more often, D is also wrong.

---

## 📌 Today's Summary

Today's key points are four-fold. First, chaos engineering is a methodology originating from Netflix Chaos Monkey/Simian Army, applying scientific method (steady state definition→hypothesis→failure injection→validation) to system reliability—the shift from "prevent failure" to "intentionally cause and force tolerance." Second, FIS implements this as managed with Targets (blast radius: ALL/COUNT/PERCENT dial), Actions (EC2/network/RDS/API failures), and Stop Conditions (CloudWatch Alarm-based immediate halt/rollback, chaos's safety belt), with "small radius + fast stop" multi-layered defense as core. Third, Resilience Hub quantifies Well-Architected Reliability Pillar, presenting RTO/RPO goal gaps by fault type, recommended improvements, and costs, with FIS integration for validated verification. Fourth, EventBridge Scheduler + FIS automates periodic measure-experiment-improve loop, ARC + FIS periodically validates DR failover itself, and Game Day (people/one-time training) and Chaos (system/periodic automated) complement each other.
