# Day 5 - Week 12 Integrated Review: Wiring the Whole Nervous System of Incident Automation Together

Over the past week we dissected the automation domain part by part: EventBridge as the nervous system, SSM Automation as procedures turned into code, Auto-healing as the reflexes, and ChatOps and Incident Manager as the touchpoint with the human organization. Today we reassemble these parts into one living organism. In real life, an incident never uses these components separately. One detection triggers automatic recovery, a failed recovery pages a human, the human coordinates through ChatOps, and when it is over, a postmortem feeds learning back into the cycle. You need to be able to draw this whole flow as a single picture in your head to solve the composite scenarios on the DOP exam.

## The Core of Week 12 as a Single Flow

```
                    [Sense]
   CloudWatch Alarm · GuardDuty · EC2 StatusCheck · Synthetics
                          │
                          ▼
              [Routing - EventBridge Day 1]
       Event Pattern matching (decision tree, partial match, array=OR)
                          │
        ┌─────────────────┼──────────────────┬───────────────┐
        ▼                 ▼                  ▼               ▼
   [Simple auto-recovery] [Standard procedure] [Complex recovery] [Critical]
   Lambda Day 3     SSM Automation     Step Functions   Incident Mgr
   (isolate/restart) Runbook Day 2      (Saga, Day 3)    Day 4 (ICS)
   Cooldown·Bounded  aws:approve gate                    Escalation
   ·Idempotent                                          Timeline·PIR
        │                 │                  │               │
        └─────────────────┴──────────────────┴───────────────┘
                          ▼
              [Notify - Day 4]
   CodeStar Notifications → Chatbot(Slack) · PagerDuty(API Destination)
                          │
                          ▼
              [Learn]  Blameless postmortem · Game Day(FIS)
                          │
                          ▼ (feedback loop: add new patterns to the automated response)
```

The five stages in this picture, **Sense → Route → Respond → Notify → Learn**, are the skeleton of the whole of Week 12. Let us revisit the key point of each stage.

1. **EventBridge (Day 1)**: the nervous system of automation. It implements the message bus and Content-Based Router from EAI/EIP, cutting coupling so that senders do not know their receivers. Event Pattern matching is compiled into a decision tree (the quamina/Rete family) rather than compared sequentially, so it is fast regardless of the number of rules, and it has partial-match and array=OR semantics. Pipes (pipe-and-filter, eliminating polling glue), Scheduler (millions of schedules, and Flexible Time Window jitter prevents the thundering herd), Archive/Replay (event-sourcing reprocessing). Delivery is at-least-once, so consumers must be idempotent.

2. **SSM Automation (Day 2)**: operational procedures as code. You declare the procedure as a Runbook (`aws:executeAwsApi`, `aws:invokeLambdaFunction`, `aws:approve`) and insert a human gate into the workflow with `aws:approve`.

3. **Auto-healing (Day 3)**: the closed loop of control theory (MAPE-K). Lowering MTTR is more cost-effective than raising MTBF. The patterns are restart, replace, isolate, scale, failover, and circuit breaker. Prefer what is built into the platform (ASG ELB health check, `StatusCheckFailed_System` → `ec2:recover`). The three pillars of the safety net (Idempotent, Cooldown, Bounded Action) stop blast radius runaway (the lesson of the 2017 S3 incident), a Circuit Breaker cuts cascading failures, and FIS Game Days verify all of it.

4. **ChatOps & Incident Manager (Day 4)**: the touchpoint with the human organization. Chatbot (the SNS-to-Slack bridge, IAM Role ∩ Guardrail), CodeStar Notifications (the standard for pipeline notifications), Incident Manager (the Incident Command System codified: Response Plan, Escalation, Timeline, PIR), and API Destination (external SaaS integration).

5. **Learn**: a blameless postmortem (the Swiss cheese model and Just Culture) turns data into learning and closes the feedback loop.

> 💡 **Related theory**: The whole of Week 12 is really one giant **MAPE-K loop** (IBM Autonomic Computing): Monitor (CloudWatch/GuardDuty) → Analyze (EventBridge pattern matching) → Plan (deciding which response path to send it down) → Execute (Lambda/SSM/Step Functions/Incident Manager), plus the Knowledge shared by all four (runbooks, postmortems, schema registry). If you understand things by which stage of this loop each service belongs to, instead of memorizing individual services, a scenario you have never seen decomposes easily: "this is a routing problem at the Analyze stage → EventBridge." And the learning stage updating Knowledge to improve the next loop is the essence of an autonomous system.

## Decision Tree for Choosing a Component

The exam asks "which service fits this situation?" Let us sort out the confusing boundaries.

| Situation | Answer | Why not the others |
|------|------|---------------------|
| Precise content-based routing, branching to many AWS services | EventBridge Rule | SNS is coarse fan-out, SQS is a point-to-point queue |
| SQS/Kinesis polling → filter → enrich → target | EventBridge Pipes | Rules are push-only and do not support polling sources |
| Per-user cron schedules for millions of users | EventBridge Scheduler | CloudWatch cron hits the rule count limit |
| Simple isolate/restart auto-recovery | Lambda (the 3 safety nets are mandatory) | Unsuitable for complex branching |
| Recovery with branching, waiting, retries, and compensation | Step Functions (Saga) | Lambda has the 15-minute limit and loses state |
| Standard operating procedure + human approval gate | SSM Automation Runbook | aws:approve is the key |
| Recovery from underlying EC2 hardware failure | `StatusCheckFailed_System` → `ec2:recover` | A hand-built Lambda is not verified |
| Automatic replacement of ASG instances | health-check-type ELB + Grace Period | EC2 status alone cannot catch zombies |
| Pipeline failure Slack notification (standard) | CodeStar Notifications + Chatbot | A Lambda webhook is excessive glue |
| On-call escalation for Critical incidents | Incident Manager Escalation Plan | Notifying everyone via SNS diffuses responsibility |
| EventBridge → authenticated delivery to an external SaaS | API Destination + Connection | Calling Lambda directly burdens you with plumbing |

> A consistent principle runs beneath this table: **"the highest abstraction possible, as managed as possible."** You could do the same job with Lambda, but if AWS offers a managed option (Pipes, Scheduler, `ec2:recover`, CodeStar Notifications, API Destination), use it. There are three reasons. (1) **A verified safety net**: for managed services, AWS has already verified retries, idempotency, and rate limits. (2) **Less glue code**: if you build it yourself, you must hand-manage the plumbing such as polling, batching, errors, and credential refresh. (3) **Operational burden shifts**: AWS takes on patching, scaling, and availability. The answer on the DOP exam almost always converges on "the managed option with the least operational overhead," and "build it all with Lambda" is usually a wrong-answer trap (it works, but it goes against the Operational Excellence pillar).

## Anti-patterns in Integrated Scenarios

Finally, let us look at the common anti-patterns of assembling these components wrongly. The exam often asks "what is wrong?"

> ⚠️ **Pitfall**: The three major anti-patterns of integrated automation. **(1) Missing idempotency**: EventBridge and CloudWatch are at-least-once, so duplicates are delivered, and if the consumer is not idempotent you get double isolation and double billing. The answer to "events are occasionally processed twice" is almost always a missing idempotency in the consumer. **(2) Infinite auto-recovery**: repeating "restart → fail → restart" in an open loop (without checking the result), or running away without Cooldown and Bounded Action (2017 S3). **(3) Automating irreversible actions**: isolation (reversible) is fine to automate, but automating termination or deletion (irreversible) without a human gate permanently destroys data and evidence on a false positive. What prevents these three is idempotency, the three pillars of the safety net, and the `aws:approve` gate.

## Summary

Week 12 stacked five layers (detection, routing, response, notification, and learning) under the single word "automation." The key insight is that these are not separate pieces but one closed feedback loop (MAPE-K); at each layer AWS presents "the most managed option" as the answer; and the safety of all automation rests on three principles: idempotency, blast radius limits, and gates on irreversible actions. We check this integrated picture with the 12 scenarios below.

---

## 📝 Practice Questions

**Question 1.** GuardDuty detected a Critical threat (a compromised EC2 instance communicating with a C2 server). You want to build a flow that automatically isolates the instance and takes a forensic snapshot, then runs termination only after operator approval. Which is the most suitable?

A) A single Lambda runs detection, isolation, snapshot, and termination all immediately and automatically, minimizing MTTR with no human intervention

B) EventBridge pattern-matches the GuardDuty Finding (by severity) → SSM Automation Runbook (isolation and snapshot with aws:executeAwsApi, a termination gate with aws:approve)

C) A Lambda polls CloudTrail logs every minute, finds traces of C2 communication, and runs isolation, snapshot, and termination

D) Send the GuardDuty alert only as an SNS email and have operators handle isolation, snapshot, and termination entirely by hand

**Answer: B**

Explanation: EventBridge matches the GuardDuty Finding with an Event Pattern (for example, severity ≥ 7) and triggers an SSM Automation Runbook. Isolation (swapping the SG) and the snapshot are reversible, so they are automatic (`aws:executeAwsApi`); termination is irreversible (loss of data and evidence), so it gets a human approval gate (`aws:approve`). Splitting automatic from manual by reversibility is the core principle of Day 3. Doing everything automatically (A) magnifies irreversible damage on a false positive, and CloudTrail polling (C) throws away GuardDuty's real-time detection and is not meant for replaying payloads. Doing everything manually (D) inflates MTTR.

---

**Question 2.** You want to build a flow that polls messages from an SQS queue, does first-pass filtering with an event pattern, enriches the missing information through an external API, and stores the result in DynamoDB, all without glue code. Which is the most suitable?

A) Write a Lambda yourself that handles SQS long polling, event filtering, external API enrichment, and DynamoDB storage in a single function

B) EventBridge Pipes (Source: SQS → Filter → Enrichment → Target: DynamoDB)

C) Specify SQS directly as the event source of an EventBridge Rule, enrich with an Input Transformer, and use DynamoDB as the target

D) Distribute messages to multiple subscribers with SNS fan-out, and have each one filter, enrich, and store to DynamoDB

**Answer: B**

Explanation: EventBridge Pipes is an implementation of the pipe-and-filter architecture. It takes sources that require polling (SQS/Kinesis/DynamoDB Streams/MSK) and connects them in a managed way through Filter (event pattern) → Enrichment (Lambda/Step Functions/API Destination) → Target. AWS absorbs the plumbing of polling, batching, and error handling, so compared with writing your own Lambda (A) the glue code disappears. An EventBridge Rule (C) is push-only and cannot take a polling source (SQS) directly as a source, which is exactly why Pipes exists separately. Also, because the Filter comes before Enrichment, you get the economics of early filtering (predicate pushdown): unnecessary events are discarded before the expensive enrichment.

---

**Question 3.** An auto-recovery Lambda isolates the same instance twice because of duplicate delivery of the same alarm, is triggered repeatedly at short intervals and exhausts resources, and touches too many instances at once. Which combination of safety nets stops the runaway?

A) Increase the Lambda timeout and memory so the isolation action is guaranteed to finish without being cut off midway

B) Idempotent (DynamoDB ConditionExpression) + Cooldown (lastActionTime, no reprocessing within T seconds) + Bounded Action (a cap of at most N per trigger)

C) Set the EventBridge RetryPolicy to 0 to block duplicate triggers caused by retries at the source

D) Lengthen the CloudWatch Alarm evaluation period to lower the frequency of duplicate and consecutive triggers itself

**Answer: B**

Explanation: The real danger of auto-recovery is positive feedback loops and blast radius runaway. The three pillars of the safety net are idempotency (even if duplicates arrive through at-least-once delivery, the result equals a single run: DynamoDB optimistic concurrency control / Lambda Powertools Idempotency), Cooldown (no reprocessing of the same target within T seconds: a rate limit along the time axis), and Bounded Action (a cap on the number of resources one trigger can touch: a limit along the spatial axis). The absence of this design was the direct cause of the 2017 S3 us-east-1 incident (one command removed too many servers). Raising the timeout (A), RetryPolicy 0 (C), and deleting the Alarm (D) all fail to address the root cause.

---

**Question 4.** Every day at exactly 3:00 AM, 50,000 per-user backup jobs run simultaneously and the downstream collapses under the load. Also, there are hundreds of thousands of such per-user schedules, so you hit the CloudWatch cron rule count limit. What is the correct solution?

A) Move the cron time up to 02:59 to shift to a quieter period for the downstream and avoid the load collision

B) EventBridge Scheduler: supports millions of schedules + Flexible Time Window spreads executions across the window (injecting jitter, preventing the thundering herd)

C) Greatly increase the Lambda reserved concurrency limit so that all 50,000 concurrent executions are accommodated

D) Manually divide the jobs into 10 groups and place them at different cron times to spread the load over time

**Answer: B**

Explanation: It solves both problems at once. First, EventBridge Scheduler treats each individual schedule as a first-class object and supports millions of schedules, so it goes beyond the CloudWatch cron rule count limit. Second, Flexible Time Window spreads executions along the time axis as "anywhere within this window" instead of "exactly at that time," preventing the thundering herd. This is the classic technique of deliberately injecting jitter in distributed systems, the same principle as exponential backoff with jitter and spreading cache expirations. Shifting the time (A) and raising concurrency (C) do not resolve the simultaneous rush, and manual splitting (D) only adds operational burden.

---

**Question 5.** In a Critical incident, if the primary on-call person does not respond within 30 minutes, you want to automatically page the secondary group, and if there is still no response, the manager, with the whole process recorded automatically on a timeline. What is the AWS-native solution?

A) Subscribe all on-call staff to an SNS topic to notify them at the same time and let whoever responds first handle it

B) AWS Incident Manager: Escalation Plan (next stage after N minutes without a response) + Engagement (SMS/Voice/Email) + Timeline (automatic recording) + PIR

C) A Lambda polls every 30 minutes for whether anyone responded and, if not, sends SMS sequentially to the next stage's group

D) Create several CloudWatch Alarms per stage and notify the primary, secondary, and manager with time offsets

**Answer: B**

Explanation: Incident Manager codifies the ICS (Incident Command System) of 1970s wildfire response. The Escalation Plan implements "if there is no acknowledgement within N minutes, succession passes to the next stage's group" (ICS's automatic succession for unresponsive resources), and it integrates with Engagement (paging), Timeline (the ICS activity log), and PIR (a draft of the post-incident analysis). Notifying everyone at once (A) invites diffusion of responsibility (the bystander effect, where nobody picks up), and Lambda polling (C) and time-offset Alarms (D) carry the burden of building it yourself and state management problems.

---

**Question 6.** In Slack, you want operators to freely run diagnostic commands through Chatbot, but never be able to terminate prod EC2 instances or delete RDS even by mistake. You want to keep the IAM Role broad for operational convenience. What is the correct configuration?

A) Restrict the IAM Role used by Chatbot to read-only permissions so it cannot make any change or deletion

B) An explicit Deny (ec2:TerminateInstances, rds:Delete*) in the Chatbot channel Guardrail Policy: blocked regardless of the IAM Role

C) Switch the Slack channel to private and invite-only so that only privileged operators can type dangerous commands

D) Turn off Chatbot's command execution (run command) feature and use it only for lookups and receiving notifications

**Answer: B**

Explanation: Chatbot command permission is the intersection of the IAM Role and the Guardrail Policy. A Guardrail works with IAM's explicit-deny-always-wins evaluation model, so however broad the Role is, it cannot do what the guardrail blocks. It is a permission ceiling mechanism just like an Organizations SCP. That is why the standard is "keep the Role broad, Deny only dangerous actions with the Guardrail, and do writes through the pipeline." Narrowing the Role to read-only (A) loses even the permissions needed for operations, and disabling commands (D) throws away the benefits of ChatOps. Making the channel private (C) has nothing to do with permissions.

---

**Question 7.** An EC2 instance is unresponsive because of a failure in the underlying host hardware. You want to recover it automatically onto healthy hardware while keeping the same IP, ENI, and EBS. What is the correct configuration?

A) Put it in an ASG and set health-check-type to EC2

B) `StatusCheckFailed_System` metric alarm + `ec2:recover` alarm action

C) `StatusCheckFailed_Instance` alarm + terminate and recreate with Lambda

D) Fail over with a Route 53 health check

**Answer: B**

Explanation: `StatusCheckFailed_System` points to a failure in AWS-side infrastructure (host hardware, network), and the `ec2:recover` action brings the instance back up on healthy hardware with the same ID, ENI, IP, and EBS (only instance store is lost). This is a closed loop built into the platform, so it is verified. `StatusCheckFailed_Instance` (C) is for problems inside the instance such as the OS, app, or network configuration, which recover cannot fix, and distinguishing a system failure from an instance failure is the key. The ELB health check (the EC2 type in A) cannot catch zombie instances, and Route 53 (D) is Region/endpoint failover, not single-instance hardware recovery.

---

**Question 8.** You want to build a recovery in which branching, waiting, retries, and compensation are intertwined: "RDS failover → wait for completion → cache invalidation → health check → on failure escalate to a human, on success report to Slack + create a ticket." Which is the most suitable?

A) Implement failover, invalidation, health check, and escalation all in a single Lambda with if-else branches and sleep waits

B) A Step Functions State Machine: Retry/Catch on each step, state preservation, Saga compensation

C) Make each step an EventBridge Rule and chain them so that one step's completion event triggers the next Rule

D) A Lambda polling every minute by cron checks the current recovery stage and decides the next action to proceed

**Answer: B**

Explanation: Step Functions suits workflows where branching, waiting, retries, and compensation are intertwined: you attach Retry (backoff) and Catch (compensating transactions) declaratively to each step, the service preserves the workflow state, and the execution history is visualized, which makes post-incident analysis easy. It is an implementation of the Saga pattern, which breaks a distributed transaction into compensable steps. A single Lambda (A) has the 15-minute limit, lost state, and sleep costs, and an EventBridge chain (C) is weak at expressing branching, waiting, and compensation.

---

**Question 9.** You want to announce CodePipeline failures to a Slack channel in the simplest, most standard way. Which is the most suitable?

A) Trigger a Lambda on every pipeline failure event to call the Slack Incoming Webhook directly

B) CodeStar Notifications rule → AWS Chatbot (Slack channel) target

C) A cron Lambda that polls CodePipeline's CloudWatch Logs finds failure logs and posts them to Slack

D) Add a manual approval stage to the pipeline so that a Slack notification goes to the approver on failure

**Answer: B**

Explanation: CodeStar Notifications is the standard path for state-change notifications from CodePipeline/CodeBuild/CodeDeploy/CodeCommit. You only declare "which event types to which channel," and internally it flows through EventBridge → SNS → Chatbot. Calling a Lambda webhook directly (A) and polling logs (C) are unnecessary glue code and bring the burden of retries, authentication, and maintenance. On the exam, "the simplest/standard" points to CodeStar Notifications + Chatbot. This is DOP's consistent principle that "the most managed option" is the answer.

---

**Question 10.** The operations team built auto-recovery logic, but when a real failure first occurred, it did not work because of a bug (like the restart path in the 2017 S3 incident). What is the standard approach for discovering such "rusty automation" in normal times?

A) Write more automation code to cover every possible failure case in advance without gaps

B) Regularly inject failures with AWS FIS and rehearse auto-recovery, notifications, and runbooks as a whole in a Game Day (chaos engineering)

C) Turn off the unreliable auto-recovery in production and run only the proven human-centered manual response

D) Lengthen the retention period of the related logs so that automation failures can be traced after the fact

**Answer: B**

Explanation: The big risk of auto-recovery is that it is rarely triggered, so it rusts, and a bug is revealed only when it runs for the first time during a real failure. Chaos engineering is the philosophy that "failures will happen, so let us cause them in advance in a controlled environment and find the weaknesses" (originating with Netflix Chaos Monkey), and AWS FIS safely injects EC2 termination, resource stress, and network/AZ failures (including stop-condition alarms). A Game Day is an event where the team gathers to rehearse the entire response. The Well-Architected Reliability pillar (REL12) also calls for regular failure testing.

---

**Question 11.** Payment events processed through EventBridge are occasionally processed twice, causing double billing. What are the root cause and the solution?

A) EventBridge delivering events in duplicate is a bug, so contact AWS Support and request a fix

B) EventBridge delivery is at-least-once, so duplicates are normal: add idempotency logic to the consumer (duplicate blocking based on the event ID: DynamoDB conditional write, Lambda Powertools Idempotency)

C) Set the EventBridge target's RetryPolicy to 0 to eliminate duplicate delivery caused by retries at the source

D) Remove the payment consumer's DLQ to simplify the path so that failed events are not re-ingested and reprocessed

**Answer: B**

Explanation: EventBridge's delivery guarantee is at-least-once (a minimum of once), and by the nature of distributed systems, the same event can be delivered twice (exactly-once generally cannot be guaranteed). Idempotency (f(f(x))=f(x), the concept of idempotent HTTP methods in RFC 9110) is the consumer's responsibility for preventing duplicate processing: use optimistic concurrency control keyed on the event ID (DynamoDB ConditionExpression) or Lambda Powertools Idempotency. RetryPolicy 0 (C) loses events on transient failures, and removing the DLQ (D) loses permanently failed events. Duplication is designed behavior, not a bug (A), and this is anti-pattern number 1 of integrated automation.

---

**Question 12.** You want to send incidents securely, with authentication, from EventBridge to an external SaaS (PagerDuty), without hand-coding credential refresh, rate limiting, retries, or secret management. Which is the most suitable?

A) A Lambda calls the PagerDuty REST API directly and handles authentication by storing the API Key in an environment variable

B) EventBridge API Destination + Connection (authentication managed through Secrets Manager, rate limiting, using EventBridge retries and DLQ)

C) Send the incident notification through an SNS Email subscription to PagerDuty's email integration address

D) Write the events to S3 and have PagerDuty poll the bucket periodically to create incidents

**Answer: B**

Explanation: EventBridge API Destination provides managed calls to external HTTPS endpoints: the Connection stores the authentication (API Key/OAuth/Basic) and manages the secret with Secrets Manager, rate limiting protects the external API, and on failure you get the EventBridge retry and DLQ safety nets. Calling Lambda directly (A) means hand-managing credential refresh, rate limits, retries, and secret rotation, and keeping the API Key in an environment variable risks exposure. Email (C) and S3 polling (D) are unsuitable in terms of reliability and latency. It is an extension of EventBridge's philosophy of "absorbing glue code into managed features."

---

## 🔜 Week 13 Preview

**Resilience: DR and Multi-Region**

If Week 12 was the nervous system that detects, recovers, and coordinates failures "within a single Region," Week 13 deals with what happens when that nervous system loses an entire Region: the mathematics of RTO/RPO, the cost-versus-recovery-time trade-offs of Backup, Pilot Light, Warm Standby, and Multi-Site Active/Active, Route 53 failover, and the consistency problems of cross-Region data replication. If Week 12's auto-recovery operated at the "node level," Week 13 is recovery at the "Region level."
