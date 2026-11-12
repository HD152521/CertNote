# Day 5 - Week 12 Synthesis: The Five-Stage Pipeline and Decision Trees

This week, we built the complete **operational automation and incident response layer** of a mature cloud system. Monday was EventBridge and Pipes (the event bus and content-based routing). Tuesday was Automation Documents (procedures-as-code). Wednesday was auto-healing and MAPE-K (self-repair loops). Thursday was ChatOps and Incident Manager (human coordination when repair fails). Today we synthesize: *when does each tool apply, and what's the decision tree?*

The pattern that emerges is a **five-stage pipeline**: Detect → Route → Respond → Notify → Learn. Within each stage are choices, and poor choices lead to fragility (brittle automation), visibility chaos (alerts everywhere but no signal), or uncontrolled scaling (auto-healing spiral). Today we draw the decision tree and show real scenarios.

## The Five-Stage Pipeline

Every incident — from a cached CDN error to a database corruption — flows through this pipeline.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DETECT: Monitoring Emits Facts               │
│                   (CloudWatch, X-Ray, Logs)                     │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                   ROUTE: Content-Based Routing                  │
│              (EventBridge Rules, Event Patterns)                │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                    RESPOND: Automation Tiers                    │
│         (Tier 1-5: Restart → Scale → Circuit → Failover)       │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                  NOTIFY: ChatOps & Incident Mgr                 │
│              (Alert team, open war room if needed)              │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│            LEARN: Timeline, Post-Mortem, Improvement            │
│              (Reconstruct, analyze, iterate)                    │
└─────────────────────────────────────────────────────────────────┘
```

### Stage 1: DETECT — Monitoring Emits Facts

Observability is prerequisite. Facts come in three forms (Week 11's three pillars).

| Form | Tool | Latency | Example |
|------|------|---------|---------|
| **Metric** | CloudWatch | 1m | CPU 95%, request latency 500ms |
| **Log** | CloudWatch Logs, AWS Logs | 10-60s | "OOM killed process 1234" |
| **Trace** | X-Ray | 1-2s | Request took 30s, 15s in DynamoDB |

**Decision**: Which form best detects the failure class?

- **Traffic spike** → Metrics (request count, latency percentiles)
- **Code bug introduced** → Logs (exception stacks, error codes) + X-Ray (traces to function showing where time spent)
- **Resource exhaustion** → Metrics (CPU, memory, disk)
- **Cascading failure** → Traces (service map showing dead path)

Alerts should be specific and low-noise. A generic "high CPU" alert that fires 10 times per day and is noise 9 times is useless. Better: "CPU > 80% for 5 min *and* request queue length increasing" — two independent signals indicating real problem, not transient spike.

### Stage 2: ROUTE — Content-Based Routing

The alert is emitted. The question: who should react? If the alert is "DynamoDB replication lag > 10s", only the data platform team cares. If "us-east-1 network timeout on all services", everyone cares. **EventBridge Event Pattern** is the router.

```json
{
  "source": ["aws.cloudwatch"],
  "detail-type": ["CloudWatch Alarm State Change"],
  "detail": {
    "alarmName": ["DynamoDB-Replication-Lag"],
    "newState": ["ALARM"]
  }
}
```

**Decision tree**:

1. Is the problem **infrastructure** (region down, AZ failure) or **application** (service bug, runaway query)?
   - Infrastructure → Route to Platform team + Infrastructure Automation
   - Application → Route to Application team + application-specific Automation
2. Is the problem **reversible** (restart, scale out) or **irreversible** (data deletion, account suspension)?
   - Reversible → Can auto-heal Tier 1-3 without approval
   - Irreversible → Route to **aws:approve** gate in Automation
3. Is the problem **isolated** (one service) or **cascading** (multiple services)?
   - Isolated → Targeted Automation
   - Cascading → war room + Incident Manager

### Stage 3: RESPOND — Automation Tiers and Safety Nets

The alarm is routed. EventBridge Target is an Automation Document. Which tier do you attempt?

**Tier 1: Stateless Restart** → 90% safe, try first

```yaml
- name: RestartService
  action: 'aws:executeAwsApi'
  inputs:
    Service: ecs
    Api: UpdateService
    ForceNewDeployment: true
```

Safety net: Add a check step after. If issue persists, escalate to Tier 2.

**Tier 2: Horizontal Scale Out** → 85% safe, try if Tier 1 doesn't work

```yaml
- name: ScaleOut
  action: 'aws:executeAwsApi'
  inputs:
    Service: autoscaling
    Api: SetDesiredCapacity
    DesiredCapacity: '{{ CurrentCapacity + 2 }}'
```

Safety net: Bounded execution count. If we've scaled out 3 times in the last hour, stop and escalate to human.

**Tier 3: Circuit Breaker** → 80% safe if circuit threshold is tuned, harder to undo

```python
if call_downstream_service():
    # normal path
else:
    circuit_breaker.open()
    return fallback_response()
```

Safety net: Canary testing. Deploy circuit breaker logic to 1% of traffic first, measure error rate, then roll out.

**Tier 4: Failover (Stateful)** → 50% safe, requires human approval

```yaml
- name: RequestApproval
  action: 'aws:approve'
  inputs:
    Message: 'Failover primary DB?'
    MinRequiredApprovals: 1
```

**Tier 5: Blue-Green** → 40% safe, highest blast radius, rare

Don't attempt. Escalate to human.

### Stage 4: NOTIFY — ChatOps & Incident Manager

Automation is running, but humans need to know. **Chatbot** sends summary to Slack. If Automation succeeds quickly (Tier 1), alert disappears. If it fails or takes time (Tier 2-4), **Incident Manager** opens a war room.

**Decision tree**:

1. **Severity of impact** (MTTI, MTTR, customer visibility)
   - SEV-3 (low impact, customer-facing but non-critical) → Notify on-call in Slack
   - SEV-2 (high impact, many customers affected) → Page on-call + open Slack channel
   - SEV-1 (critical, revenue impact) → Page multiple on-calls + war room + notify leadership
2. **Predictability of resolution**
   - Known workaround (fast fix, <15min ETA) → Automated notification + ETA in Slack
   - Unknown cause → War room + IC assigns investigation parties
3. **Scope of coordination**
   - Single team → Slack thread + team lead
   - Multi-team → War room + Incident Manager + IC

### Stage 5: LEARN — Timeline, Post-Mortem, Improvement

Incident Manager auto-generated a timeline. Post-mortem meeting scheduled for next day. The RCA process (root cause analysis):

1. **Narrative reconstruction** — Exactly what happened and when? (from Timeline)
2. **Root cause** — Why did it happen? (what assumption was wrong, what was overlooked)
3. **Why it wasn't caught** — What gap in monitoring/testing missed it?
4. **Preventative actions** — How do we prevent recurrence?
5. **Detective actions** — If it recurs, how do we catch it faster?

```
Example: "ECS task crashed due to OOM. Root cause: new feature used 2x memory.
Why missed: No memory trend monitoring. Preventative: Add memory usage alert.
Detective: Add X-Ray trace showing memory growth per request."
```

**Decision tree**:

1. Is this a **class A** incident (novel, never happened before)?
   - Yes → Full post-mortem, assign preventative actions, update runbooks
2. Is this a **class B** incident (happened before, but we thought we fixed it)?
   - Yes → **Why did the preventative action fail?** Update that prevention
3. Is this a **class C** incident (known issue, recurring)?
   - Yes → Automate the response (move to Tier 1 Automation), add alert, reduce MTTR

## The Five-Column Decision Table

Synthesizing all decisions, here's the table that operations teams use to choose tools:

| Scenario | Severity | Detection | Response | Notification | Learning |
|----------|----------|-----------|----------|--------------|----------|
| **Single service restart** | SEV-3 | CloudWatch Alarm (CPU > 80%) | Tier 1: ECS restart | Slack notification | If recurring, add auto-restart Automation |
| **Database replication lag** | SEV-2 | X-Ray ServiceMap + CloudWatch Metric | Tier 2: Scale read replicas | Slack + incident Mgr | Tune query, add caching |
| **Application OOM cascade** | SEV-1 | Logs (OOM) + X-Ray (trace path) | Tier 2: Scale ASG + Tier 3: Circuit Breaker fallback | War room + IC | Add memory limits, quota alerts |
| **Data corruption** | SEV-1 | Logs (data anomaly detected) | Tier 5: No auto-fix, manual investigation | War room + IC + legal | Add data validation, audit logging |
| **Credential compromise** | SEV-1 | GuardDuty (suspicious activity) | Tier 4: Isolate instance + Tier 5: Rotate creds | War room + security team | Rotate all creds, tighten IAM |

## Real Scenario: Deployment Breaks API Latency

**12:00 UTC**: Deployment ships new API version.

**12:05 UTC**: CloudWatch alarm fires — **API latency p99 jumped 200ms → 800ms**.

```
[DETECT] Metric: LatencyHigh
    ↓
[ROUTE] EventBridge matches source=aws.cloudwatch, alarmName=APILatencyHigh
    → Target: Automation/api-latency-response
    ↓
[RESPOND] Automation starts Tier 1: Restart API tasks
    - name: RestartTasks
      action: aws:executeAwsApi (UpdateService, ForceNewDeployment=true)
    ↓
[CHECK] Wait 30s, sample new latency
    - Latency still 700ms? No improvement.
    ↓
[ESCALATE] Move to Tier 2: Add instances
    - name: ScaleOut
      action: aws:executeAwsApi (SetDesiredCapacity +3)
    ↓
[CHECK] Wait 1m, sample latency
    - Latency 600ms, trending down? Yes.
    - Latency < 400ms at 12:07? No, still 550ms.
    ↓
[ESCALATE] Move to Tier 3: Activate Circuit Breaker
    - Switch to fallback cache instead of calling new code path
    ↓
[CHECK] Latency drops to 200ms at 12:08.
    → Issue is the new code, not infrastructure
    ↓
[NOTIFY] Chatbot posts in #incidents
    Message: "API Latency resolved at 12:08 by Circuit Breaker.
    Root cause: new code path slow query. Rollback recommended."
    ↓
[IC DECISION] IC pages deployment team.
    "12:08: Automation activated circuit breaker.
     12:09: On-call API engineer joins war room.
     12:10: Engineer confirms: new index not created in DB.
     12:11: Rollback deployment.
     12:12: Latency back to normal.
    [Service restored]"
    ↓
[LEARN] Post-mortem: "Why wasn't index creation tested?"
    Action: Add database schema validation to CI/CD.
```

RTO: 8 minutes (12:00 → 12:08). MTTR: 12 minutes (12:00 → 12:12, including rollback).

## Anti-Patterns and Pitfalls

**Anti-Pattern 1: No MAPE-K Loop**

Alerts fire, on-call manually fixes, no learning. Same issue repeats monthly. Fix: Document every incident in Incident Manager, schedule post-mortems.

**Anti-Pattern 2: Automation Runaway**

Auto-healing loops endlessly, making things worse. Fix: Bounded execution count, circuit breaker for automation itself, Change Windows.

**Anti-Pattern 3: Alert Fatigue**

Generic high-CPU alerts fire constantly, team ignores them. Fix: Alerts must be specific (composite conditions) and actionable (clear remediation).

**Anti-Pattern 4: No Approval Gate**

Automation deletes production data without review. Fix: Tier 4-5 actions require aws:approve + guardrail policy.

**Anti-Pattern 5: Lost Context**

On-call fixes issue, posts "fixed" in Slack, nobody knows what was tried. Fix: All actions in war room must be timestamped (Incident Manager timeline).

## Wrapping Up

Week 12 synthesized the full **detection → response → notification → learning** cycle. EventBridge routes, Automation responds, ChatOps coordinates, Incident Manager records. The decision tree guides tool selection, and safety nets prevent cascades. When systems scale, this structure is the difference between "on-call exhausted, repeatedly fixing same bugs" and "system recovers within minutes, humans focus on improvement."

In two weeks (Week 13-14), we'll cover **cost optimization and governance** — how to operationalize auto-healing, monitoring, and incident response at enterprise scale without explosive cloud spend.

---

## 📝 Practice Questions

**Question 1.** When an alarm fires saying "API latency has spiked," how would you construct the 5-stage pipeline?

A) Detect (CloudWatch latency metric) → Route (EventBridge, event pattern) → Respond (Tier 1 restart) → Notify (Slack alert) → Learn (post-mortem)

B) Detect (the on-call engineer checks the console by hand) → Route (email) → Respond (manual SSH login) → Notify (status page) → Learn (none)

C) Automate only Respond and leave the rest manual

D) Ignore the alarm and judge by customer complaints

**Answer: A**

Explanation: The 5-stage pipeline is a fully automated flow of detect → route → respond → notify → learn. B is the legacy model (slow and prone to human error), C is incomplete (no monitoring or learning), and D is irresponsible.

---

**Question 2.** In which of the following situations should you try **Tier 2 (scale out)** instead of **Tier 1 (restart)**?

A) An ECS task process crash (happened only once)

B) API average latency 500 ms, CPU 92%, request queue keeps growing (a load problem)

C) Database index corruption (a structural problem)

D) The authentication service is completely down (a dependency)

**Answer: B**

Explanation: Tier 1 (restart) fixes a one-time crash or a state problem (A). B is a problem of "high load," so adding capacity (Tier 2) is right. C and D cannot be solved by restarting or scaling, so a higher tier or manual intervention is needed.

---

**Question 3.** An Automation keeps retrying repeatedly for the same problem (5 times, 10 times, 15 times...). Which safety net is needed?

A) Exponential backoff — gradually increase the wait time between retries (30s → 60s → 120s...)

B) Bounded execution count — if the same IssueId occurs 5 or more times a day, escalate to a human

C) Circuit breaker for Automation — a condition check (for example, exit if the health check passes), and request a human if it does not

D) A, B, and C are all needed

**Answer: D**

Explanation: Each prevents a runaway from a different angle. A gives transient errors time, B sets a limit on the count for persistent errors, and C provides state-based exit. All should be applied to be robust.

---

**Question 4.** A SEV-1 incident has occurred: "Data deletion — a wrong query deleted a production table." What are the response steps?

A) Run a "restore table" Automation as self-healing

B) Data recovery cannot be automated — immediately open a war room, assign an IC, start the manual procedure to recover from backup, and at the same time notify the legal/regulatory teams

C) Only sound the alarm and resolve it quietly

D) Contact only AWS Support

**Answer: B**

Explanation: Data deletion (Tier 5) is a task that cannot be automated. Immediately: war room → IC → mobilize experts → start recovery from backup → assess impact → regulatory reporting. This is a procedural and legal matter, so a structured response is essential.

---

**Question 5.** In a post-mortem, someone points out, "It's the same problem again — it happened 2 months ago too." What is the RCA question?

A) Were the preventive actions from last time not completed?

B) Were the preventive actions completed but ineffective?

C) Were the preventive actions completed, but the problem recurred in a new code path?

D) One of A, B, or C — improvement is needed in any case

**Answer: D**

Explanation: A recurring problem (Class B) is a signal that something went wrong with the prevention last time. All three cases are possible and all need improvement. However, blaming the team because "the same problem occurred again" is not problem solving (the blameless principle).

---

**Question 6.** If you fill in all the cells of the "single service restart" row in the decision table, which is correct?

| Cell | Content |
|----|------|
| Severity | SEV-3 (no or minimal customer impact) |
| Detection | CloudWatch Alarm (CPU/memory/crash) |
| Response | Tier 1: ECS UpdateService ForceNewDeployment |
| Notification | Slack notification (no war room) |
| Learning | If it recurs, add an automatic restart Automation |

A) All are correct

B) Notification should be a war room

C) Response needs approval (aws:approve)

D) Learning is unnecessary (Tier 1 is an obvious fix)

**Answer: A**

Explanation: A single service restart is a low-risk action, and the standard path is SEV-3, CloudWatch, Tier 1 automation, Slack notification, and adding automation if it recurs.

---

**Question 7.** An EC2 instance is unresponsive because of a failure in the underlying host hardware. You want to recover it automatically onto healthy hardware while keeping the same IP, ENI, and EBS volumes. What is the correct configuration?

A) Place it in an ASG and set health-check-type to EC2

B) An alarm on the `StatusCheckFailed_System` metric + the `ec2:recover` alarm action

C) A `StatusCheckFailed_Instance` alarm + terminate and recreate with Lambda

D) Fail over with a Route 53 health check

**Answer: B**

Explanation: `StatusCheckFailed_System` indicates a failure in AWS-side infrastructure (host hardware, network), and the `ec2:recover` action brings the instance back up on healthy hardware with the same ID, ENI, IP, and EBS volumes (only instance store is lost). This is a closed loop built into the platform, so it is proven. `StatusCheckFailed_Instance` (C) refers to problems inside the instance such as the OS, application, or network configuration, which recover does not fix; distinguishing system failures from instance failures is the key. The ELB health check (the EC2 type in A) cannot catch zombie instances, and Route 53 (D) performs Region/endpoint failover, not hardware recovery for a single instance.

---

**Question 8.** You want to build a recovery in which branching, waiting, retries, and compensation are intertwined: "RDS failover → wait for completion → invalidate cache → verify health → on failure escalate to a human, on success report to Slack + create a ticket." What is the most suitable approach?

A) Implement failover, invalidation, health verification, and escalation all in a single Lambda function with if-else branching and sleep waits

B) A Step Functions state machine — Retry/Catch on each step, state persistence, Saga compensation

C) Build each step as an EventBridge rule and chain them so that one step's completion event triggers the next rule

D) A Lambda function polling every minute via cron checks the current recovery stage and decides the next action to proceed

**Answer: B**

Explanation: A workflow with intertwined branching, waiting, retries, and compensation is a fit for Step Functions — you declaratively attach Retry (backoff) and Catch (compensating transactions) to each step, the service persists workflow state, and the execution history is visualized, which makes post-incident analysis easy. This is an implementation of the Saga pattern, which breaks a distributed transaction into compensable steps. A single Lambda function (A) has the 15-minute limit, state loss, and sleep cost problems, and an EventBridge chain (C) is poor at expressing branching, waiting, and compensation.

---

**Question 9.** You want to notify a Slack channel of CodePipeline failures in the simplest, most standard way. What is the most suitable approach?

A) Trigger a Lambda function on every pipeline failure event and call a Slack Incoming Webhook directly

B) A CodeStar Notifications rule → AWS Chatbot (Slack channel) target

C) A cron Lambda function polls the CodePipeline CloudWatch Logs, finds failure logs, and posts them to Slack

D) Add a manual approval stage to the pipeline so that the approver receives a Slack notification on failure

**Answer: B**

Explanation: CodeStar Notifications is the standard path for status-change notifications from CodePipeline/CodeBuild/CodeDeploy/CodeCommit; you only declare "which event types go to which channel," and internally it flows EventBridge → SNS → Chatbot. Calling a Lambda webhook directly (A) and polling logs (C) are unnecessary glue code that adds retry, authentication, and maintenance burden. On the exam, "simplest/standard" points to CodeStar Notifications + Chatbot. This reflects DOP's consistent principle that "the most managed option" is the right answer.

---

**Question 10.** An operations team built automated recovery logic, but when a real outage first occurred, it did not work because of a bug (like the restart path in the 2017 S3 incident). What is the standard approach for discovering such "rusty automation" in normal times?

A) Write more automation code to cover every possible failure case in advance without gaps

B) Regularly inject failures with AWS FIS and rehearse the entire automated recovery, notification, and runbook in a Game Day (chaos engineering)

C) Turn off the unreliable automated recovery in production and operate only proven, human-centered manual response

D) Extend the retention period of related logs so that automation failures can be traced afterward

**Answer: B**

Explanation: The big risk of automated recovery is that it rusts because it is not triggered in normal times, and only when a real outage occurs does it run for the first time and expose its bugs. Chaos engineering is the philosophy that "failures will happen, so let's cause them in advance in a controlled environment to discover weaknesses" (originating with Netflix's Chaos Monkey), and AWS FIS safely injects EC2 termination, resource stress, and network/AZ failures (including stop-condition alarms). A Game Day is an event where the team gathers to rehearse the entire response. The Well-Architected Reliability pillar (REL12) also specifies regular failure testing.

---

**Question 11.** Payment events processed through EventBridge are occasionally processed twice, causing double billing. What are the root cause and the fix?

A) EventBridge delivering events more than once is a bug, so contact AWS Support and request a fix

B) EventBridge delivery is at-least-once, so duplicates are normal — add idempotency logic to the consumer (event-ID-based duplicate blocking: DynamoDB conditional write, Lambda Powertools Idempotency)

C) Set the RetryPolicy of the EventBridge target to 0 to eliminate duplicate deliveries caused by retries at the source

D) Remove the payment consumer's DLQ so that failed events are not re-injected and reprocessed, simplifying the path

**Answer: B**

Explanation: EventBridge's delivery guarantee is at-least-once (minimum once), and by the nature of distributed systems the same event can be delivered twice (exactly-once is generally not guaranteed). Idempotency (f(f(x))=f(x), the concept of idempotent HTTP methods in RFC 9110) is the consumer's responsibility for preventing duplicate processing — use optimistic concurrency control keyed on the event ID (DynamoDB ConditionExpression) or Lambda Powertools Idempotency. A RetryPolicy of 0 (C) causes loss on transient failures, and removing the DLQ (D) causes loss of permanently failed events. Duplicates are not a bug (A) but designed behavior, and this is the number-one anti-pattern in integration automation.

---

**Question 12.** You want to send incidents securely, including authentication, from EventBridge to an external SaaS (PagerDuty) without coding authentication renewal, rate limiting, retries, and secret management yourself. What is the most suitable approach?

A) A Lambda function calls the PagerDuty REST API directly and handles authentication by storing the API key in an environment variable

B) EventBridge API Destination + Connection (authentication managed through Secrets Manager, rate limiting, using EventBridge retries and DLQ)

C) Send incident notifications to PagerDuty's email integration address via an SNS Email subscription

D) Write events to S3 and have PagerDuty poll the bucket periodically to create incidents

**Answer: B**

Explanation: EventBridge API Destinations provide managed calls to external HTTPS endpoints — the Connection stores the authentication (API Key/OAuth/Basic) and manages secrets through Secrets Manager, rate limiting protects the external API, and on failure you get the EventBridge retry and DLQ safety nets. A direct Lambda call (A) means you must manually manage authentication renewal, rate limiting, retries, and secret rotation, and keeping the API key in an environment variable creates exposure risk. Email (C) and S3 polling (D) are unsuitable in terms of reliability and latency. This extends EventBridge's philosophy of "absorbing glue code into a managed service."

---

## 📌 Today's Summary

There are three key takeaways today. First, the **5-stage pipeline** (Detect → Route → Respond → Notify → Learn) provides the structure of every incident, and tool selection at each stage determines success or failure. Second, the **decision tree** guides which tier of automation and which level of human intervention are needed depending on severity, detectability, and scope. Third, **safety nets** (bounded count, circuit breaker, approval gate, change window) prevent both automation runaways and excessive escalation, enabling stable automation. Once this structure is established, the operations team can focus on improving the system instead of fixing recurring problems.
