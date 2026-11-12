# Day 3 - Auto-Healing and Control Theory: When Systems Repair Themselves

The human operations model breaks at scale. When you have a thousand services and one person wakes up at 3 AM to find 40 services in degraded state, that person is the bottleneck. Worse, human-paced recovery is slow — restarting a service takes minutes; by then customers have moved to competitors. **Auto-healing** is the inversion of that model: systems detect their own failure and self-repair, so humans only wake up when repair fails.

Auto-healing sounds like magic but it is engineering. It rests on three pillars. **First, monitoring** must detect failure quickly (sub-minute latency). **Second, response procedures** must be well-defined and safe to run without human review. **Third, feedback** from repair success/failure loops back to avoid repeated failure. This is **MAPE-K** (Monitor-Analyze-Plan-Execute-Knowledge) from autonomic computing, but applied to cloud operations.

Today we build on Week 11's monitoring and Week 12 Day 2's Automation to ask: how do we automatically detect problems and trigger healing? What patterns and guardrails prevent repair runways? What role does **chaos engineering** (Fault Injection Service) play?

## MAPE-K Loop — Autonomic Systems Framework

**MAPE-K** is a 2003 autonomic computing framework (IBM) formalizing self-healing.

```
[Monitor] — observe the system
         ↓
[Analyze] — compare against policy; is current state normal or deviation?
         ↓
[Plan] — if deviation, what recovery action?
         ↓
[Execute] — carry out the action
         ↓
[Knowledge] — feedback on success/failure; refine policy
         ↑_______________________________________________↑
```

In AWS, this maps to.

| Component | AWS Service/Pattern |
|-----------|---------------------|
| **Monitor** | CloudWatch Metrics, Logs, X-Ray traces |
| **Analyze** | CloudWatch Alarms, custom Lambda analysis |
| **Plan** | Runbooks stored in Systems Manager Automation, decision trees in Lambda |
| **Execute** | EventBridge → Automation, Lambda invocation |
| **Knowledge** | CloudWatch Insights, QuickSight dashboards, incident reviews (post-mortems) |

In Week 11, we saw monitoring emit facts (metric value, log event, trace span). Today, we ask the question that closes the loop: **given the fact, what auto-response is safe?**

> 💡 **Related theory**: MAPE-K is the inverse of **chaos engineering**. Chaos creates controlled failures and observes recovery. MAPE-K *automates* recovery from real failures. Together they form a learning loop: chaos reveals what can break and how → improve detection and recovery plans → run chaos again to validate the fix. This is **resilience by practice**.

## Auto-Healing Patterns — Tiers of Increasingly Risky Actions

Not all recovery actions are equally safe. AWS and industry practice defines a hierarchy.

**Tier 1: Stateless Service Restart**

The safest action — restart a service with no persistent state, e.g., a stateless Lambda orchestrator or ECS task running an API gateway.

```yaml
- name: RestartStatelessTask
  action: 'aws:executeAwsApi'
  inputs:
    Service: ecs
    Api: UpdateService
    Cluster: '{{ ClusterName }}'
    Service: '{{ ServiceName }}'
    ForceNewDeployment: true  # Forces ECS to restart all tasks
```

Risk: Service is down briefly during restart; existing client connections drop. But new connections immediately succeed. RTO is seconds.

**Tier 2: Horizontal Scaling Out**

Add capacity before trying to fix the problem.

```yaml
- name: ScaleOutASG
  action: 'aws:executeAwsApi'
  inputs:
    Service: autoscaling
    Api: SetDesiredCapacity
    AutoScalingGroupName: '{{ ASGName }}'
    DesiredCapacity: '{{ CurrentCapacity + 2 }}'
```

Rationale: If one instance is degraded (e.g., high CPU), scaling out shifts load to healthy instances, buying time to investigate the root cause without immediate customer impact. Blue-green pattern applied to cloud ops.

**Tier 3: Circuit Breaker — Stop Calling Failing Dependency**

If downstream service is unavailable, stop calling it immediately. Return degraded response (e.g., stale cache, fallback data) rather than fail or hang.

```python
# Pseudo-code
try:
    response = call_payment_service(order_id)
except Exception as e:
    circuit_breaker.mark_failure()
    if circuit_breaker.is_open():
        # Stop calling, return fallback
        return {'status': 'pending', 'note': 'payment processing delayed'}
    else:
        raise
```

Circuit breaker state machine:

```
[CLOSED] — normal, call through
    ↓ (repeated failures)
[OPEN] — fail-fast, return degraded
    ↓ (timeout, ~60s)
[HALF_OPEN] — try one call
    ↓ (success) or (failure)
[CLOSED] or [OPEN]
```

Risk: Controlled degradation rather than cascading failure. Customers see delayed result, not error page.

**Tier 4: Failover to Standby (Stateful)**

For databases and stateful services, failover to a pre-warmed replica. Requires careful state synchronization.

```yaml
- name: WaitForApproval
  action: 'aws:approve'
  inputs:
    Approvers:
      - 'arn:aws:iam::123456789012:role/DBTeam'
    Message: 'Failover from {{ PrimaryEndpoint }} to {{ StandbyEndpoint }}?'

- name: PromoteStandby
  action: 'aws:executeAwsApi'
  inputs:
    Service: rds
    Api: PromoteReadReplica
    DBInstanceIdentifier: '{{ StandbyInstanceId }}'
```

Risk: High. DNS caches and application pools may still point to old primary. In-flight transactions may be lost. This action typically requires human approval (aws:approve step).

**Tier 5: Blue-Green Deployment**

Switch all traffic to a new version without stopping the old. Rollback is switching back. Used when a degradation is traced to bad code (recent deployment bug).

```yaml
- name: GetCurrentWeight
  action: 'aws:executeAwsApi'
  outputs:
    - Name: BlueWeight
      Selector: $.TargetGroups[0].TargetGroupStickinessConfig.Enabled
      
- name: SwitchToGreen
  action: 'aws:executeAwsApi'
  inputs:
    Service: elbv2
    Api: ModifyTargetGroup
    TargetGroupArn: '{{ TargetGroupArn }}'
    Attributes:
      - Key: stickiness.lb_cookie.enabled
        Value: 'false'  # Remove stickiness to let new targets receive traffic
```

Risk: Very high. If green version is also buggy, both are now active and degraded. Common pattern: switch 10% → monitor 30s → if error rate good, switch 100%.

> 🔍 **Going deeper**: This hierarchy reflects **safety and observability tradeoff**. Low-tier actions (restart, scale out) are fast and low-risk but don't fix root cause. High-tier actions (failover, blue-green) fix root cause but high-risk. In practice, teams implement **staged remediation**: detect issue → apply Tier 1-2 (fast, low-risk) → if issue persists, escalate to Tier 3-4 (human approval or limited rollout). This mirrors SRE's **error budget** thinking — if we're confident in reliability, spend budget on fast auto-response; if budget is exhausted, slow down and require human approval.

## Safety Nets — Preventing Runaway Healing

Automatic healing can spiral: Automation tries to fix → makes it worse → tries again harder → catastrophe. To prevent this, we need **guardrails**.

**Pattern 1: Circuit Breaker for Automation**

Automation should not run continuously. After an execution, wait and observe. If issue is still present, re-run. But if issue goes away, stop.

```yaml
- name: CheckIfHealed
  action: 'aws:waitForAwsResourceProperty'
  inputs:
    Service: cloudwatch
    Api: GetMetricStatistics
    MetricName: CPUUtilization
    Namespace: AWS/EC2
    Dimensions:
      - Name: InstanceId
        Value: '{{ InstanceId }}'
    StartTime: '{{ now() - 300 }}'  # Last 5 minutes
    EndTime: '{{ now() }}'
    Period: 60
    Statistics:
      - Average
    PropertySelector: $.Datapoints[0].Average
    DesiredValues:
      - '< 80'  # If CPU is below 80%, consider healed
    MaxAttempts: 10
    TimeoutSeconds: 600
```

If CPU drops below 80% within 10 minutes, the loop exits. Otherwise, escalate to human.

**Pattern 2: Exponential Backoff in Re-Trigger**

Don't re-trigger Automation immediately on failure. Wait 30s, then 60s, then 2m, etc. This spaces out retries and gives transient issues time to resolve.

```yaml
- name: WaitBeforeRetry
  action: 'aws:sleep'
  inputs:
    Duration: 'PT{{ BackoffDuration }}S'  # ISO 8601 duration

- name: IncrementBackoff
  action: 'aws:executeScript'
  inputs:
    Runtime: python3.8
    Handler: increment_handler
    Script: |
      def increment_handler(events, context):
        backoff = int(events['BackoffDuration'])
        backoff = min(backoff * 2, 600)  # Cap at 10 minutes
        return {'BackoffDuration': str(backoff)}
```

**Pattern 3: Bounded Execution Count**

Track how many times Automation has run for the same issue. If it exceeds a threshold (e.g., 5 times), escalate to human instead of re-triggering.

```python
# Pseudo-code: in Automation or wrapper Lambda
execution_count = dynamodb.get_item(
    TableName='AutomationExecutionLog',
    Key={'IssueId': issue_id, 'Timestamp': today}
)['Item'].get('Count', 0)

if execution_count > 5:
    # Stop auto-healing, escalate to on-call
    sns.publish(TopicArn=on_call_topic, Message='Excessive auto-healing attempts for ' + issue_id)
else:
    trigger_automation()
    dynamodb.update_item(Count=execution_count + 1)
```

**Pattern 4: Change Windows and Freeze Dates**

Auto-healing should not run during deployments or maintenance windows. Systems Manager **Change Calendar** integrates with Automation to suppress triggering during frozen periods.

```bash
aws ssm create-document \
  --name 'DeploymentFreezeCalendar' \
  --document-type 'ChangeCalendar' \
  --content '{
    "Items": [
      {
        "Name": "MondayDeployment",
        "StartDateTime": "2026-07-14T10:00:00Z",
        "DurationInHours": 2
      }
    ]
  }'

aws events put-rule --name auto-heal-rule \
  --event-pattern '{"source": ["custom.monitoring"]}'
```

Then in Automation, add a step that checks the Change Calendar before executing.

## Fault Injection Service — Controlled Chaos

**AWS Fault Injection Simulator (FIS)** lets you deliberately inject faults (kill processes, block network, spike latency) into running systems to test recovery. This is **chaos engineering** — if auto-healing is *reactive*, FIS is *proactive practice*.

```bash
aws fis create-experiment-template \
  --cli-input-json file://experiment.json
  
# experiment.json
{
  "description": "Kill 30% of Fargate tasks in prod to test auto-scaling",
  "targets": {
    "Instances": {
      "resourceType": "ec2:instance",
      "resourceTags": {"env": ["prod"]},
      "selectionMode": "PERCENTAGE(30)"
    }
  },
  "actions": {
    "KillTasksAction": {
      "actionId": "aws:ecs:stop-task",
      "targets": {"Clusters": "prod-cluster"},
      "parameters": {"taskCount": "{{ Instances | length }}"  }
    }
  },
  "stopConditions": [
    {
      "source": "cloudwatch",
      "value": "arn:aws:cloudwatch:us-east-1:123456789012:alarm:HighErrorRate"
    }
  ]
}
```

FIS will kill tasks; auto-healing should detect and re-launch them. If it doesn't, the experiment has a stop condition (high error rate alarm) that terminates it to prevent full outage.

> 💡 **Related theory**: FIS is **testing under failure assumption**. Traditional testing assumes happy path; chaos testing assumes something will always be broken and asks "how do we detect and recover?" This mindset, SRE's **Chaos Engineering Practice** (Gremlin, LitmusChaos ecosystem), shifts from MTBF (mean time between failures — never happens) to MTTR (mean time to recovery — when it happens, be fast).

## Wrapping Up

Today we covered five things. First, **MAPE-K** (Monitor-Analyze-Plan-Execute-Knowledge) is the autonomic-systems framework formalizing self-healing loops. Second, **auto-healing tiers** range from Tier 1 (safe restarts) to Tier 5 (risky blue-green), reflecting safety vs. risk tradeoff; teams stage remediation across tiers. Third, **safety nets** (circuit breakers for automation, exponential backoff, execution counts, change windows) prevent runaway healing cascades. Fourth, **Fault Injection Service** is proactive chaos testing to validate recovery procedures before real failures. Fifth, as systems scale, shifting from human-paced to self-paced repair enables recovery sub-minute, transforming customer experience from failure-to-outage to failure-to-transparent-healing.

The next article explores **ChatOps and Incident Manager** — when humans do need to intervene, how do we coordinate response across teams?

---

## 📝 Practice Questions

**Question 1.** Which of the following correctly gives the order of the MAPE-K loop and its mapping to AWS services?

A) Monitor(X-Ray) → Analyze(Lambda) → Plan(Automation) → Execute(EventBridge) → Knowledge(Insights)

B) Monitor (CloudWatch metrics/logs) → Analyze (CloudWatch Alarm, Lambda) → Plan (Systems Manager Automation, decision tree) → Execute (EventBridge → Automation) → Knowledge (CloudWatch Insights, postmortems)

C) Go straight back to Monitor after Execute (a cycle) — Knowledge is optional

D) Knowledge is human interviews and cannot be automated

**Answer: B**

Explanation: MAPE-K is the cycle Monitor (observe) → Analyze (check for deviation) → Plan (decide the recovery action) → Execute (carry out) → Knowledge (feedback and learning). Each stage is implemented with AWS services, and Knowledge is reflected through CloudWatch Insights (data analysis) and post-mortems (organizational learning) to improve policy. Without Knowledge, you fall into a vicious cycle of repeatedly self-healing the same problem.

---

**Question 2.** Among the safety tiers of automated healing actions, which tier is "scale out by adding 2 instances when CPU is high"?

A) Tier 1 — restart a stateless service (safest)

B) Tier 2 — horizontal scale-out (shifting load before the root cause is fixed)

C) Tier 3 — Circuit Breaker (stop calls to a dependency)

D) Tier 4 — Failover (stateful services)

**Answer: B**

Explanation: Scaling out adds instances to spread load onto healthy instances; it does not fix the root cause (a memory leak, an inefficient query, and so on), but it immediately reduces customer impact. Like the blue-green pattern, it is an action that buys time, so it is Tier 2.

---

**Question 3.** A report comes in that "a database failover was triggered, and the self-healing Automation has been running more than 5 times for the same problem." Which safety nets prevent this?

A) Set `MaxRetries: 1` in the Automation code

B) Bounded Execution Count — if the same IssueId occurs 5 or more times a day, stop automatic healing and escalate to on-call

C) Disable the Automation

D) The Circuit Breaker for Automation pattern — after a failover, wait until the health check passes, stop once it passes, and escalate to a human if it does not

**Answer: B, D**

Explanation: Both are correct. B prevents an infinite loop with an upper bound on repeated executions for the same issue (bounded execution count), and D is the Circuit Breaker for Automation pattern, which monitors a specific condition (a health check) and exits the self-healing loop once it determines "it has already recovered." Real operations apply both — condition-based exit (D) + a timeout safety net (B).

---

**Question 4.** An incident occurred in which "during a Monday morning deployment, an Automation restarted the service and the deployment was rolled back." How can you prevent this?

A) Disable the Automation starting this week

B) Register a "MondayDeployment" freeze window in the Systems Manager Change Calendar and add a condition so that the Automation rule is not triggered during the freeze

C) Delay monitoring so that it starts 30 minutes after deployment

D) Disable the alarms

**Answer: B**

Explanation: Change Calendar is a mechanism for expressing, as code, a policy of "no automated changes during this period," such as maintenance/deployment windows. If you add a condition to the EventBridge rule so that it checks "is it a freeze period now?" before the Automation is triggered, the automation will not interfere during deployments.

---

**Question 5.** A self-healing Automation keeps failing. When exponential backoff is applied, what is the wait schedule until it reaches the maximum wait time of 600 seconds (10 minutes)?

A) 30s → 60s → 120s → 240s → 480s → 600s (cap 600s)

B) 1s → 2s → 4s → 8s → 16s → 32s (doubling exponentially)

C) 30s → 90s → 270s → 810s (tripling each time)

D) A fixed 30s repeated

**Answer: A**

Explanation: Exponential backoff usually increases by 2x each time. Starting from an initial 30s, the path is 30 → 60 → 120 → 240 → 480 → 960 (capped at the 600 upper limit). This gives fast retries for transient errors (a brief network drop) and progressively more room for persistent errors (misconfiguration), while also preventing endless pile-ups (a thundering herd).

---

**Question 6.** In an AWS Fault Injection Simulator (FIS) experiment that "kills 30% of the Fargate tasks in the prod cluster," what happens if the error rate suddenly spikes to 50%?

A) Immediately stop the experiment and find the cause

B) Continue for another 10 minutes as planned to measure self-healing performance

C) If a "CloudWatch error rate > 40% alarm" has been registered as a StopCondition, the experiment stops automatically, preventing a disaster

D) FIS cannot be used in production

**Answer: C**

Explanation: FIS is **controlled chaos**. You must specify a StopCondition (stop-condition) in advance so that the experiment stops automatically when it reaches a dangerous level. If a 50% error rate differs from expectations, the StopCondition triggers, stops the task killing, and prevents a disaster. This is the safety mechanism of chaos engineering, and it is what lets you run experiments in production with confidence.

---

## 📌 Today's Summary

There are five key takeaways today. First, **MAPE-K** (Monitor-Analyze-Plan-Execute-Knowledge) is the framework for a self-healing loop, with AWS services implementing each stage. Second, the **self-healing action tiers** reflect trade-offs from Tier 1 (restart, safe) to Tier 5 (blue-green, risky), and protect safety through staged escalation. Third, **safety nets** (Automation Circuit Breaker, exponential backoff, execution count, change window) prevent runaway self-healing. Fourth, **FIS (Fault Injection Simulator)** is proactive chaos testing that validates recovery procedures before a real failure arrives. Fifth, shifting from human-centered to system-centered operations as scale grows shortens recovery time from minutes to seconds and transforms the customer experience from "outage" to "transparent healing."
