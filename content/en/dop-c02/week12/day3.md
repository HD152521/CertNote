# Day 3 - Auto-Healing: The Control Theory of Automatic Recovery and the Safety Engineering That Stops Runaway Automation

Run operations long enough and you arrive at one truth: you cannot prevent failures, you can only fix them quickly. SRE talks about availability with two numbers, MTBF (Mean Time Between Failures) and MTTR (Mean Time To Restore), and if you look closely at the formula availability = MTBF / (MTBF + MTTR), something interesting shows up. Making failures rarer (MTBF up) has a marginal cost that rises steeply, while making recovery faster (MTTR down) buys a large availability gain relatively cheaply. That is why the center of gravity in modern operations moved from "eliminate failures" to "recover from failures automatically and fast." The time it takes for a person to receive a page, wake up, connect to the VPN, read logs, and type commands makes up most of MTTR. Auto-healing cuts that human loop out.

Today we do not treat automatic recovery as "a script that restarts an instance with Lambda." We dig into the control theory and safety engineering underneath it. We look at why auto-healing is fundamentally a **closed-loop controller**, how badly designed automation can bring down a perfectly healthy system on its own (a major 2017 incident was exactly this), which electrical engineering concept the Circuit Breaker came from, and why Cooldown and Bounded Action are mandatory rather than optional. On the DOP exam, auto-healing is a core part of the incident automation domain, and it shows up repeatedly in scenarios like "How do you connect a GuardDuty finding to automatic isolation?", "How does an ASG replace instances on its own?", and "How do you keep automation from running away?"

## Where Auto-Healing Came From — Control Theory and Self-Healing Systems

The idea that "a system senses its own state and corrects it" is much older than software. James Watt's **centrifugal governor** in 1788, which automatically held a steam engine's speed constant, is the prototype of industrial-age feedback control, and in 1948 Norbert Wiener established "control and communication through feedback" as a discipline in *Cybernetics*. The core diagram of control theory is always the same: a closed loop of **sense → compare → actuate**. You move the actuator in the direction that reduces the difference (error) between the target value (setpoint) and the current value.

Cloud auto-healing transplants this loop onto infrastructure as is. A CloudWatch Alarm is the sensor, the threshold comparison is the compare step, and the recovery action of Lambda/SSM/ASG is the actuator. IBM's **Autonomic Computing** vision, published in 2001, applied this explicitly to IT, and its core model is the **MAPE-K loop**: Monitor → Analyze → Plan → Execute, plus the Knowledge shared by all four. Every AWS auto-healing mechanism we cover today is, in effect, an implementation of MAPE-K.

> 💡 **Related theory**: When designing auto-healing you need to be conscious of the difference between **open-loop and closed-loop control**. Open-loop just acts, like "restart unconditionally whenever the alarm fires," without measuring the result again. It is like a toaster that watches only the timer and never looks at the toast. Closed-loop control re-measures after acting to check "did it really get better?" and acts again if not (the Verify step in the earlier diagram). Immature auto-healing is open-loop, so it repeats "restart → still failing → restart again" forever and exhausts resources. Mature auto-healing is closed-loop, and here **hysteresis** becomes important. So that the system does not snap back the other way the moment a threshold is crossed once, you set the on-threshold and the off-threshold differently (like an air conditioner that turns on at 26 degrees and off at 24 degrees), which prevents flapping at the boundary. The CloudWatch Alarm's `evaluation-periods` and `datapoints-to-alarm` implement exactly this hysteresis.

> AWS auto-healing has three layers, and each layer runs the same MAPE-K loop at a different level of abstraction. **(1) Built-in platform recovery**: the ASG's ELB health check, the ECS task health check, and EC2 `StatusCheckFailed_System → ec2:recover` are cases where AWS manages the entire loop. You only choose the thresholds. **(2) Declarative recovery**: you declare "for this symptom, follow this procedure" as code with an SSM Automation Runbook, and EventBridge triggers it. **(3) Imperative recovery**: you write arbitrary logic with Lambda. It is the most flexible, but you become responsible for implementing the safety nets (Cooldown, Bounded, Idempotent) yourself. The design principle is "use the lowest layer possible." If you write in Lambda something the platform already does, you throw away the closed-loop control AWS has already validated and take on the risk of creating your own bugs. This is why the answer to "automatic recovery from an EC2 hardware failure" is `ec2:recover`, not Lambda, on the exam.

## A Taxonomy of Recovery Patterns — What Are We Reverting?

Recovery actions are divided by "what they manipulate." Keeping this classification in your head lets you pick the right pattern in a scenario instantly.

| Pattern | Target manipulated | AWS implementation | Failure it recovers from |
|------|----------|----------|----------------|
| **Restart** | Process/instance state | EC2 Reboot, forced ECS task replacement, Lambda re-invocation | Transient memory leaks, deadlocks |
| **Replace** | The instance itself | ASG ReplaceUnhealthy, ECS ForceNewDeployment | Damaged nodes, bad disks |
| **Quarantine** | Network path | SG replacement, ALB deregister, NACL | Security compromise, contaminated nodes |
| **Scale** | Capacity | ASG/App Auto Scaling desired count up | Load surges |
| **Failover** | Traffic routing | Route 53 health check, RDS Multi-AZ | AZ/Region failures |
| **Circuit Break** | Dependency calls | Temporarily halting external calls | Cascading downstream failures |

The difference between restart and replace is a key exam point. A **restart** revives the same resource (when its state is only temporarily broken), while a **replace** throws that resource away and brings up a new one (when the resource itself is damaged). The cloud-native philosophy is close to "don't fix it, replace it" (cattle, not pets). Instead of struggling to debug an instance back to life, it is faster and more deterministic to kill it and launch a new one.

> On February 28, 2017, the **AWS S3 us-east-1 major outage** (about 4 hours) is a canonical case showing what happens when automation misfires faster and more broadly than a person could. An engineer, while debugging the billing system, ran a command from a playbook, and it removed more servers than intended. The removed servers included core capacity of the S3 index subsystem and placement subsystem, and because restarting those subsystems took longer than expected, S3 in us-east-1 stopped. A huge number of services that depended on S3 (even AWS's own status dashboard) collapsed in a chain. **Three lessons**: first, there was no **upper bound (bounded action)** on the amount of resources one command could affect, and AWS later added guardrails that keep capacity from dropping below a certain safety line. Second, nobody knew the core subsystems could take that long to restart, which means **the restart path was never validated in normal times (Game Day)**. Third, the status dashboard depending on S3 was a failure of **failure-domain isolation**. This incident proves why the principles we cover today, Bounded Action, FIS validation, and minimizing blast radius, are mandatory.

## ASG and EC2 — The Closed Loop the Platform Runs

The most robust auto-healing is the kind you did not write yourself. The ASG's health check is a complete closed loop managed by AWS.

```bash
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name myapp \
  --health-check-type ELB \
  --health-check-grace-period 300
```

`health-check-type ELB` means to trust the application-level health check sent by the ELB (HTTP 200 and so on) instead of EC2's default status check. The EC2 status check only sees "is the instance powered on," and does not know "is the app actually responding," so only the ELB health check can catch a zombie instance whose OS is alive but whose app is hung. `grace-period 300` is a grace time during which health checks are ignored while a new instance boots and the app starts. Without it, you misjudge a perfectly healthy instance that is still booting as "unhealthy," kill it, launch it again, kill it again, and fall into a **restart loop**.

Failures of EC2's own infrastructure (underlying hardware faults) are handled by a separate mechanism.

```bash
aws cloudwatch put-metric-alarm --alarm-name EC2Recover \
  --metric-name StatusCheckFailed_System \
  --namespace AWS/EC2 --statistic Maximum --period 60 \
  --evaluation-periods 2 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=InstanceId,Value=i-xxx \
  --alarm-actions arn:aws:automate:ap-northeast-2:ec2:recover
```

`StatusCheckFailed_System` points to problems on the AWS side (host hardware, networking), and `ec2:recover` brings the instance back up on healthy hardware **with the same ID, same ENI, same IP, and same EBS**. You lose instance store (ephemeral) data, but the network identity is preserved.

> ⚠️ **Pitfall**: Do not confuse `StatusCheckFailed_System` (an AWS infrastructure failure, fixed by `ec2:recover`) with `StatusCheckFailed_Instance` (a problem inside the instance such as the OS, app, or network configuration, which recover does not fix). For internal problems the answer is reboot/replace, not recover. Also, requiring several consecutive violations rather than one, as in `evaluation-periods 2`, is intentional hysteresis: it keeps you from touching a healthy instance in reaction to one-off measurement noise (metric noise). On the exam, the answer to "why does auto-healing trigger too often?" is often "evaluation-periods is too short or set to 1."

## The Three Pillars of Safety Nets — Idempotent, Cooldown, Bounded Action

The risk of auto-healing is not "recovery fails" but "recovery runs away." In control theory terms, it is falling into a **positive feedback loop**: the action makes the problem bigger, and the bigger problem triggers a bigger action. The three safeguards that prevent this are within exam scope.

| Principle | Failure mode it prevents | Implementation |
|------|---------------|------|
| **Idempotent** | The action running twice because the same alarm was delivered twice | Duplicate blocking based on event ID/state |
| **Cooldown** | Handling the same target repeatedly at short intervals | Record lastActionTime in DynamoDB |
| **Bounded Action** | Touching too many resources at once | A "maximum N per trigger" counter |

```python
import boto3, os, time
ec2 = boto3.client('ec2')
cooldown = boto3.resource('dynamodb').Table(os.environ['COOLDOWN_TABLE'])
COOLDOWN_SECONDS = 1800   # 30 minutes - no magic numbers, use a constant
MAX_QUARANTINE_PER_RUN = 3  # Bounded Action upper limit

def handler(event, context):
    detail = event['detail']
    instance_id = detail['resource']['instanceDetails']['instanceId']
    now = int(time.time())

    # 1) Cooldown: do not reprocess the same instance within 30 minutes
    last = cooldown.get_item(Key={'instanceId': instance_id}).get('Item')
    if last and now - int(last['lastAt']) < COOLDOWN_SECONDS:
        print(f'Cooldown active for {instance_id}, skip')
        return

    # 2) Idempotent: block concurrent duplicate runs with a conditional write
    try:
        cooldown.put_item(
            Item={'instanceId': instance_id, 'lastAt': now},
            ConditionExpression='attribute_not_exists(instanceId) OR lastAt < :cutoff',
            ExpressionAttributeValues={':cutoff': now - COOLDOWN_SECONDS})
    except cooldown.meta.client.exceptions.ConditionalCheckFailedException:
        print('Concurrent run already handled this, skip')
        return

    # 3) Quarantine action (Bounded Action is limited to N by the caller / Step Functions Map)
    ec2.modify_instance_attribute(InstanceId=instance_id, Groups=['sg-quarantine'])

    boto3.client('sns').publish(
        TopicArn=os.environ['ONCALL_TOPIC'],
        Subject=f'Quarantined {instance_id}',
        Message=str(detail))   # Alert backup: humans also know what the automation did
```

> **Idempotency** is a foundational concept in distributed systems, the mathematical property that "applying the same operation several times gives the same result as applying it once" (f(f(x)) = f(x)). In HTTP, GET, PUT, and DELETE are defined as idempotent (RFC 9110, HTTP Semantics), and POST is non-idempotent. The reason auto-healing must be idempotent is that EventBridge and CloudWatch both provide **at-least-once delivery**: the same alarm can be delivered twice, and if you are not idempotent you get side effects like quarantining twice or doubling a scale-out. The DynamoDB `ConditionExpression` in the code above is the standard pattern for enforcing idempotency as **optimistic concurrency control**, and the Idempotency utility in AWS Lambda Powertools abstracts it as a decorator.

> Cooldown and Bounded Action are really two variants of **rate limiting**. Cooldown is a "time-axis" limit (the same key once per T seconds), and Bounded Action is a "space-axis" limit (the number of resources one trigger may touch). Combined, they put a ceiling on the automation's throughput, so even when it misbehaves the damage (blast radius) stays bounded. A more refined form is the **token bucket** algorithm, which allows bursts in normal times but limits the long-run average rate. In a truly large outage (hundreds of nodes unhealthy at once) you respond quickly, but an infinite loop caused by a malfunction stops when the bucket runs empty. Putting a global cap on an auto-healing system, such as "never replace more than 20% of the entire ASG within this hour," is the direct implementation of the lesson the 2017 S3 incident left behind.

## Circuit Breaker — Preventing Cascading Failures, Borrowed from the Electrical Breaker

In microservices, when one downstream service slows down, every thread calling it gets tied up waiting for a response, and when the tied-up threads run out the upstream service stops too, and this spreads upward until everything collapses: a **cascading failure**. The **Circuit Breaker** pattern borrowed its name from the breaker in an electrical circuit. Just as a breaker cuts the circuit on overcurrent to prevent a fire, when the downstream failure rate crosses a threshold, it cuts the calls themselves and fails immediately (fail fast).

![The three Circuit Breaker states, Closed, Open, and Half-Open, and their transition conditions](/diagrams/en/circuit-breaker-states.svg)

The three states are the key. **Closed** is normal: calls pass through. When failures pile up past the threshold it switches to **Open**, and for a set time it rejects every call immediately (giving the downstream room to breathe and recover). After a timeout it goes to **Half-Open** and sends just one trial call; if that succeeds it returns to Closed, and if it fails it goes back to Open. In AWS, the **ECS Deployment Circuit Breaker** applies this pattern to deployments: if new tasks keep failing health checks, it automatically halts the deployment and rolls back to the last healthy version.

> It was **Netflix's Hystrix** (open sourced in 2012) that popularized the Circuit Breaker. Netflix had hundreds of microservices calling one another, so a single slow dependency could paralyze all of streaming. Hystrix isolated each dependency call in a separate thread pool (the bulkhead pattern) and wrapped it in a Circuit Breaker, so one service's failure could not spread past the bulkhead. The pattern was canonized in a 2014 article by Martin Fowler and later spread through resilience4j, Polly, and others. The lesson: auto-healing is not only "fixing," it also includes "cutting things off so the problem spreads no further." Sometimes the fastest recovery is to give up on a dependency for a while and hold on with graceful degradation (running at reduced quality).

## Complex Recovery as a Workflow — Step Functions

Simple recovery (quarantine, restart) is fine with a single Lambda, but recovery that intertwines **branching, waiting, retrying, and compensation**, like "RDS failover → wait for failover to complete → invalidate cache → verify health check → report to Slack → create ticket," should not be crammed into one Lambda function. Lambda has a 15-minute maximum, loses intermediate state, and makes you write retry logic yourself. **Step Functions** is the answer.

```
[Detect] → [RDS Failover] → [Wait 60s] → [Verify Health]
                                            │
                          ┌─────Healthy─────┴──────Failed─────┐
                          ▼                                    ▼
                   [Invalidate Cache]                    [Escalate to Human]
                          ▼                                    │
                   [Notify Slack] ◀────────────────────────────┘
                          ▼
                   [Create Ticket]
```

Step Functions lets you declaratively attach `Retry` (with backoff) and `Catch` (a compensating transaction on failure) to each step, the service preserves the workflow state, and the execution history is visualized, which makes post-incident analysis easy. It is also a natural implementation of the **Saga pattern** (splitting a distributed transaction into compensable steps).

> 🎯 **Scenario**: Build a flow where "when GuardDuty detects a Critical threat (for example, a compromised EC2 communicating with a cryptocurrency-mining C2 server), the instance is automatically isolated, a snapshot is taken for forensics, Slack is notified, and then **human approval is required** before the instance is terminated." → EventBridge pattern-matches the GuardDuty finding (`severity >= 7`) and triggers an **SSM Automation Runbook** or Step Functions. Isolation (SG replacement) and the snapshot are automatic (`aws:executeAwsApi`), and a human gate (`aws:approve` or the Step Functions callback pattern) goes before termination. The key design judgment: **reversible actions (isolation) are automatic, and irreversible actions (termination) sit behind human approval**. This is the principle of limiting automation's blast radius on irreversible operations.

## Validating Automation — Game Day and FIS

The biggest risk of auto-healing logic is that it "rusts from disuse." It is not triggered in normal times and works for the first time during a real outage, and that is when the bugs show up (the restart path in the 2017 S3 incident was exactly this). That is why **chaos engineering**, deliberately injecting failures to regularly verify that automation works, is a must.

AWS **FIS** (Fault Injection Service) provides this as a managed service. It safely runs (with stop-condition alarms) EC2 termination, CPU/memory stress, network latency and blocking, API error injection, and AZ failure simulation. A **Game Day** is an event where the team gathers, injects an intentional failure, and rehearses the whole thing end to end: auto-healing, alerts, runbooks, and human response.

> Chaos engineering started with **Netflix Chaos Monkey** (2011). The core philosophy is "failures will happen, so let's cause them in advance in a controlled environment and discover the system's weaknesses in peacetime." It extends into operations Dijkstra's insight from software engineering that "testing does not prove that code works, it exposes defects." The **Reliability Pillar** of the AWS Well-Architected Framework also states "regularly test failure of the whole workload (REL12)." Until you have proven with FIS that the auto-healing you built really works, it is not working automation, just code you believe will work.

## Wrapping Up

Today's picture has five parts. First, **auto-healing is a closed-loop controller from control theory** (MAPE-K), and because reducing MTTR is more cost-effective than raising MTBF, it became the center of gravity of modern operations. Second, **recovery patterns are classified as restart, replace, quarantine, scale, failover, and circuit break**, and the cloud-native philosophy of "don't fix it, replace it" is the core. Third, **prefer built-in platform recovery (ASG, `ec2:recover`)**, and treat imperative Lambda recovery as a last resort because you must carry the safety nets yourself. Fourth, **the three pillars of safety nets are Idempotent, Cooldown, and Bounded Action**, which prevent positive feedback loops and blast radius runaway, and the 2017 S3 incident proved why they are needed. Fifth, **complex recovery goes in Step Functions (Saga)**, cascading failures are cut with a Circuit Breaker, and all automation must be **regularly verified with FIS Game Days**.

In the next article we look deeply at the point where automation meets people, **ChatOps and Incident Manager**, that is, how incidents that auto-healing could not handle are handed over to the human organization.

---

## 📝 Practice Questions

**Question 1.** You must decide where to invest to raise availability. For the same cost, which is generally more efficient, increasing MTBF (mean time between failures) or reducing MTTR (mean time to restore), and which reason is correct?

A) MTBF up — eliminating failures entirely is the fundamental fix, so it is always superior

B) MTTR down — in availability = MTBF/(MTBF+MTTR), recovery automation gives a large availability improvement at a relatively low marginal cost, and since human response time makes up most of MTTR, there is a lot of room for automation

C) The two contribute equally to the availability formula, so there is no difference

D) MTBF up — MTTR depends on humans and cannot be automated

**Answer: B**

Explanation: Availability = MTBF/(MTBF+MTTR). Increasing MTBF (making failures rarer) has a marginal cost that climbs steeply through hardware redundancy, rigorous testing, and so on, whereas reducing MTTR gives a large improvement relatively cheaply once auto-healing cuts out the human loop (receiving the page, waking up, analyzing logs, typing commands). That is why the center of gravity in modern operations moved to auto-healing. MTTR is not impossible to automate (D); it is actually the primary target of automation, and the claim that the two contribute equally (C) is a misunderstanding that ignores the cost curve.

---

**Question 2.** An auto-healing Lambda quarantined one instance twice because the same alarm was delivered twice, and it is being triggered repeatedly at short intervals and exhausting resources. Which combination of the three safety nets best prevents the runaway?

A) Set RetryPolicy to 0 and remove the DLQ

B) Idempotent (duplicate blocking based on event/state) + Cooldown (DynamoDB lastActionTime) + Bounded Action (an upper limit of N per trigger)

C) Fix Lambda concurrency at 1

D) Delete the CloudWatch Alarm and switch to manual response

**Answer: B**

Explanation: The real risks of auto-healing are the positive feedback loop (the action makes the problem bigger) and blast radius runaway. The three pillars that prevent them are idempotency (with at-least-once delivery, the result is the same as one run even if the same alarm arrives twice — DynamoDB ConditionExpression / Lambda Powertools Idempotency), Cooldown (no reprocessing of the same target within T seconds — a time-axis rate limit), and Bounded Action (an upper limit on the number of resources one trigger may touch — a space-axis limit). Fixing concurrency at 1 (C) kills throughput and cannot replace idempotency or Cooldown, and RetryPolicy 0 (A) causes loss on transient failures. This design is the direct lesson of the 2017 S3 incident.

---

**Question 3.** An EC2 instance is not responding because of an underlying host hardware failure. You want to recover it automatically onto healthy hardware while keeping the same IP, ENI, and EBS. What is the correct configuration?

A) A Lambda that terminates the instance and creates a new one every time

B) A `StatusCheckFailed_System` metric alarm + the `ec2:recover` alarm action

C) A `StatusCheckFailed_Instance` alarm + the `ec2:recover` action

D) Put it in an ASG and set health-check-type to EC2

**Answer: B**

Explanation: `StatusCheckFailed_System` points to a failure on the AWS side (host hardware, networking), and the `ec2:recover` action brings the instance back up on healthy hardware with the same ID, ENI, IP, and EBS (only instance store data is lost). This is a built-in platform closed loop, so it is more proven and safer than a direct Lambda implementation (A). `StatusCheckFailed_Instance` (C) is a problem inside the instance such as the OS, app, or network configuration, which recover does not fix, and reboot/replace is the answer. The distinction between system failure and instance failure is a key exam point.

---

**Question 4.** You want to build a recovery that intertwines branching, waiting, retrying, and compensation: "RDS failover → wait for completion → invalidate cache → verify health check → on failure escalate to a human, on success report to Slack + create a ticket." Which is most suitable?

A) Implement all steps in a single Lambda function with if-else and sleep

B) A Step Functions State Machine — Retry/Catch on each step, state preservation, Saga compensation

C) Chain several EventBridge Rules together

D) A Lambda that polls every minute with cron

**Answer: B**

Explanation: Step Functions suits workflows that intertwine branching, waiting, retrying, and compensation: you declaratively attach Retry (backoff) and Catch (compensating transaction) to each step, the service preserves the workflow state, and the execution history is visualized for easy post-incident analysis. This is an implementation of the Saga pattern, which splits a distributed transaction into compensable steps. A single Lambda (A) has the 15-minute limit, state loss, and manual retry logic problems, and waiting with sleep blows up cost and timeouts. An EventBridge chain (C) is poor at expressing branching, waiting, and compensation.

---

**Question 5.** In a microservices system, one downstream dependency slowed down, all the threads calling it got tied up, and the effect spread to the upstream services until everything stopped. What is the standard pattern for cutting this cascading failure?

A) Increase every service's timeout to infinity and wait

B) Circuit Breaker — when the failure rate exceeds a threshold, cut the calls and fail immediately (fail fast), and test recovery with Half-Open

C) Set unlimited retries on dependency calls

D) Restart all instances at the same time

**Answer: B**

Explanation: A cascading failure is the phenomenon where a slow dependency exhausts the caller's threads/resources and spreads upward. The Circuit Breaker is a pattern borrowed from the electrical breaker: when the downstream failure rate crosses a threshold, it switches the circuit to Open, rejecting calls immediately (fail fast) and giving the downstream time to recover. After a timeout it goes to Half-Open and sends one trial call, and if that succeeds it returns to Closed (popularized by Netflix Hystrix). An infinite timeout (A) and unlimited retries (C) actually accelerate thread exhaustion. Sometimes the fastest recovery is to cut off the dependency for a while and hold on with graceful degradation.

---

**Question 6.** The operations team built auto-healing logic, but when a real outage first occurred, the logic had a bug and did not work. What is the standard approach to discovering this kind of "rusty automation" in normal times?

A) Write more automation code to cover every case

B) Regularly inject failures with AWS FIS (Fault Injection Service) and rehearse auto-healing, alerts, and runbooks in a Game Day (chaos engineering)

C) Disable automation in production and keep only manual response

D) Extend the log retention period

**Answer: B**

Explanation: The big risk of auto-healing is that it is not triggered in normal times, rusts, and shows its bugs when it works for the first time in a real outage (the restart path in the 2017 S3 incident was like that). Chaos engineering is the philosophy that "failures will happen, so cause them in advance in a controlled environment to find weaknesses" (originating with Netflix Chaos Monkey), and AWS FIS safely injects (with stop conditions) EC2 termination, resource stress, network failures, and AZ failures. A Game Day is an event where the team gathers to rehearse the whole response. The Well-Architected Reliability Pillar (REL12) also calls for regular failure testing.

---

**Question 7.** GuardDuty detected a compromised EC2 instance. You want isolation (SG replacement) and a forensic snapshot to run automatically, and instance termination to run only after human approval. What is the core principle behind this design judgment?

A) Automate every action to bring MTTR to 0

B) Reversible actions (isolation, snapshot) are automatic, and irreversible actions (termination) get a human approval gate — limiting blast radius on irreversible operations

C) Require human approval for every action to maximize safety

D) Run termination automatically first and report afterward

**Answer: B**

Explanation: The core judgment in automation design is to split automatic from manual by the reversibility of the action. Isolation (SG replacement) can be undone if it turns out to be wrong, so automate it to block the threat quickly; termination is irreversible (loss of data and evidence), so put a human approval gate (SSM `aws:approve` or a Step Functions callback) in front of it. This is the principle of limiting the blast radius of automation for irreversible operations. Automating everything (A) magnifies irreversible damage on false positives, and making everything manual (C) throws away the benefit of automation. Running termination first (D) is the worst irreversible mistake.

---

## 📌 Today's Summary

There are five key takeaways today. First, auto-healing is a closed-loop controller from control theory (MAPE-K from IBM Autonomic Computing), and in the availability formula, MTTR down is more cost-effective than MTBF up, which made it the center of modern operations. Second, recovery patterns divide into restart, replace, quarantine, scale, failover, and circuit break, "don't fix it, replace it" (cattle not pets) is the cloud-native philosophy, and built-in platform recovery (ASG ELB health check, `StatusCheckFailed_System` → `ec2:recover`) is preferred over imperative Lambda. Third, the three pillars of safety nets are idempotency (against at-least-once delivery), Cooldown (a time-axis rate limit), and Bounded Action (a space-axis upper limit), which prevent positive feedback loops and blast radius runaway, and the 2017 S3 us-east-1 incident proved why they are needed. Fourth, cascading failures are cut with a Circuit Breaker (Closed → Open → Half-Open, Netflix Hystrix), and complex recovery is orchestrated with Step Functions (Saga compensation). Fifth, automation must be regularly verified with FIS chaos engineering and Game Days to be truly working automation, and irreversible actions (termination) go behind a human approval gate (REL12).
