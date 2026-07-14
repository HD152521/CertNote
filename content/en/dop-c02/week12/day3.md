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

## 📝 연습 문제

**문제 1.** MAPE-K 루프의 순서와 AWS 서비스 매핑으로 옳은 것은?

A) Monitor(X-Ray) → Analyze(Lambda) → Plan(Automation) → Execute(EventBridge) → Knowledge(Insights)

B) Monitor(CloudWatch 메트릭/로그) → Analyze(CloudWatch Alarm, Lambda) → Plan(Systems Manager Automation, 결정 트리) → Execute(EventBridge → Automation) → Knowledge(CloudWatch Insights, 포스트모템)

C) Execute 후 바로 Monitor로 다시 (순환) — Knowledge는 선택 사항

D) Knowledge는 사람 인터뷰이고 Automation화 불가

**정답: B**

해설: MAPE-K는 Monitor(관찰) → Analyze(편차 검사) → Plan(회복 액션 결정) → Execute(수행) → Knowledge(피드백·학습) 순환이다. 각 단계가 AWS 서비스로 구현되며, Knowledge는 CloudWatch Insights(데이터 분석)와 post-mortems(조직 학습)로 반영되어 정책을 개선한다. Knowledge가 없으면 같은 문제로 반복 치유하는 악순환에 빠진다.

---

**문제 2.** 자동 치유 액션의 안전성 티어 중 "CPU 높음 시 인스턴스 2개 추가 스케일 아웃"은 어느 티어인가?

A) Tier 1 — 상태 없는 서비스 재시작(가장 안전)

B) Tier 2 — 수평 스케일 아웃(근본 원인 수정 전 부하 전환)

C) Tier 3 — Circuit Breaker(의존성 호출 중단)

D) Tier 4 — Failover(상태 보존 서비스)

**정답: B**

해설: 스케일 아웃은 인스턴스 추가로 건강한 인스턴스에 부하를 몰아주는 것으로, 근본 원인(메모리 누수, 비효율 쿼리 등)을 고치지는 않지만 즉시 고객 영향을 줄인다. Blue-green 패턴처럼 시간을 버는 행동이므로 Tier 2다.

---

**문제 3.** "데이터베이스 Failover를 트리거했는데, 같은 문제로 계속 해서 5번 이상 자동 치유 Automation이 실행되고 있다"는 신고가 들어왔다. 이를 막는 안전망은?

A) Automation 코드에 `MaxRetries: 1` 설정

B) Bounded Execution Count — 같은 IssueId에 대해 하루에 5회 이상이면 자동 치유 중단, on-call 에스컬레이션

C) Automation을 비활성화

D) Circuit Breaker for Automation 패턴 — Failover 후 헬스 체크 통과 시까지 기다렸다가 통과하면 중단, 통과 못하면 인간에게 에스컬레이션

**정답: B, D**

해설: 둘 다 정답이다. B는 동일 이슈에 대한 반복 실행 횟수 상한선(bounded execution count)으로 무한 루프를 막는 것이고, D는 특정 조건(헬스 체크)을 모니터링하다 "이미 회복됐다"고 판단되면 자동 치유 루프를 빠져나오는 Circuit Breaker for Automation 패턴이다. 실제 운영은 둘 다 적용 — 조건 기반 탈출(D) + 타임아웃 안전망(B).

---

**문제 4.** "월요일 오전 배포 중에 Automation이 서비스를 재시작해서 배포가 롤백됐다"는 인시던트가 발생했다. 이를 방지하려면?

A) Automation을 이번 주부터 비활성화

B) Systems Manager Change Calendar에 "MondayDeployment" 프리즈 윈도우 등록, Automation rule이 프리즈 중에는 트리거되지 않도록 조건 추가

C) 배포 후 30분 지나서 모니터링 시작하도록 연체

D) 알람을 비활성화

**정답: B**

해설: Change Calendar는 유지보수/배포 윈도우 같은 "이 기간에는 자동 변경 금지" 정책을 코드로 표현하는 메커니즘이다. Automation이 트리거되기 전에 "지금이 프리즈 기간인가?" 체크하도록 EventBridge rule에 조건을 추가하면 자동화가 배포 중에 간섭하지 않는다.

---

**문제 5.** 자동 치유 Automation이 계속 실패하고 있다. 기하급수적 재시도(exponential backoff)를 적용했을 때 최대 대기 시간 600초(10분)에 도달할 때까지의 대기 스케줄은?

A) 30s → 60s → 120s → 240s → 480s → 600s (cap 600s)

B) 1s → 2s → 4s → 8s → 16s → 32s (지수 2배)

C) 30s → 90s → 270s → 810s (3배씩)

D) 고정 30s 반복

**정답: A**

해설: Exponential backoff는 보통 2배씩 증가한다. 초기 30s 시작 시 30 → 60 → 120 → 240 → 480 → 960(상한 600으로 cap) 경로다. 이는 transient 에러(일시 네트워크 끊김)에는 빠른 재시도를 주고, persistent 에러(설정 오류)에는 점차 여유를 두면서도 무한 밀려남(thundering herd)을 막는다.

---

**문제 6.** AWS Fault Injection Simulator(FIS)에서 "prod 클러스터의 30% Fargate 태스크를 죽이는" 실험을 하는데, 에러율이 갑자기 50%로 치솟으면?

A) 즉시 실험 중단, 원인 파악

B) 예정대로 10분 더 진행해서 자동 치유 성능을 측정

C) StopCondition에 "CloudWatch 에러율 > 40% 알람" 등록해 놓으면 자동 중단, 재해 방지

D) FIS는 프로덕션에 쓸 수 없다

**정답: C**

해설: FIS는 **통제된 카오스**다. StopCondition(stop-condition)을 미리 지정해 실험이 위험 수준에 도달하면 자동 중단되도록 해야 한다. 50% 에러율이 예상과 다르면 StopCondition이 발동해 태스크 킬링을 멈추고 재해를 방지한다. 이것이 카오스 엔지니어링의 안전 장치이며, 프로덕션에서 자신 있게 할 수 있게 한다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, **MAPE-K**(Monitor-Analyze-Plan-Execute-Knowledge)는 자기 치유 루프의 틀로, AWS 서비스들이 각 단계를 구현한다. 둘째, **자동 치유 액션 티어**는 Tier 1(재시작·안전)부터 Tier 5(블루-그린·위험)까지 트레이드오프를 반영하고, 단계적 에스컬레이션으로 안전을 지킨다. 셋째, **안전망**(Automation Circuit Breaker, exponential backoff, execution count, change window)은 자동 치유 폭주를 막는다. 넷째, **FIS(Fault Injection Simulator)**는 실제 장애가 오기 전에 회복 절차를 검증하는 능동적 카오스 테스트다. 다섯째, 규모 확대에 따라 인간 중심에서 시스템 중심으로 전환하면 복구 시간을 분 단위에서 초 단위로 단축하고, 고객 경험을 "중단"에서 "투명한 치유"로 변모시킨다.
