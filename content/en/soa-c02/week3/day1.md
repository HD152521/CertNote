# Day 1 - CloudWatch Alarms: M of N Evaluation Model and Composite Alarm Design Philosophy

2:43am, on-call engineer's phone rings three times. 15 PagerDuty alerts. EC2 CPU High, RDS Connections High, ALB 5xx High, ElastiCache CPU High, SQS Queue Depth High... all from same incident. Root cause was one, engineer overwhelmed by 15 alerts, doesn't know where to start. **Alert fatigue** textbook form.

CloudWatch Alarm is AWS operations' most basic automation trigger. But simple "exceed threshold → alert" design exhausts overnight on-call. Today explores alarm state machine, M of N evaluation algorithm, TreatMissingData, Composite Alarm, and Anomaly Detection internals.

## CloudWatch Alarm's 3 States and Finite State Machine Structure

CloudWatch Alarm has exactly three states. **OK**: metric within threshold. **ALARM**: threshold violated. **INSUFFICIENT_DATA**: not enough data to judge. State transitions implement computer science's **Finite State Machine (FSM)** concept directly.

> 💡 **Related theory**: FSM formalized 1950s Mealy (1955) and Moore (1956). Defined: state set Q, input set Σ, transition function δ: Q×Σ→Q, initial state q₀, accepting states F. CloudWatch Alarm: Q={OK, ALARM, INSUFFICIENT_DATA}, inputs = metric values per eval period, transition function = M of N algorithm. EventBridge event emission on each transition resembles Mealy machine (output depends on state transition).

State transition triggers EventBridge's automatic `CloudWatch Alarm State Change` event. Lambda, SNS, SSM Automation, Auto Scaling Policy, EC2 Action (Stop/Terminate/Reboot/Recover) cascade-trigger from this event. Alarm itself = "judge"; actual response logic = targets linked to transition events. This separation principle = key design.

Initial state = INSUFFICIENT_DATA. After first eval period post-creation, transitions to OK or ALARM. Newcomer operators unaware, think alarm "doesn't work" immediately after creation.

## M of N Evaluation Algorithm: Why Designed This Way?

"Among last N data points, M violate threshold → ALARM." Three parameters:

- `Period`: time represented by one data point (seconds). 60 = 1 minute
- `EvaluationPeriods`: count of data points to observe (= N)
- `DatapointsToAlarm`: how many must violate (= M)

Period=60, EvaluationPeriods=5, DatapointsToAlarm=3: "Last 5 minutes, 3 minutes violate → ALARM". M=N requires N consecutive violations. M=1 triggers on first violation.

Design basis: **hysteresis** principle. In electrical engineering, hysteresis = system's prior state affects current output. Thermostat set exactly 20°C would toggle constantly. Real thermostat uses "turn on below 19°, turn off above 21°" dual threshold. M<N design serves exactly same purpose — ignore transient spike, alert on sustained violation.

> 💡 **Related theory**: Time-series anomaly detection calls similar concept "windowed threshold." Sliding window calculates threshold-violation ratio. Holt-Winters (CloudWatch Anomaly Detection basis) or CUSUM algorithms more sophisticated but harder to interpret. M of N simple, operators intuitively understand and tune it — CloudWatch's choice. Ref: Chandola et al., "Anomaly Detection: A Survey", ACM Computing Surveys (2009).

Exam M of N patterns three forms: "spike causes false alarms often" → M<N. "Alarm response slow, triggers minutes after incident" → N too large or Period too long. "5-minute spike every hour, normal traffic but alarm triggers" → design M of N to absorb spike.

## TreatMissingData: What Alarm Should Do When Data Absent?

Option deciding handling when metric data doesn't arrive. Four options:

| Option | Behavior | When |
|--------|----------|------|
| **missing** (default) | Ignore missing, eval by other data | General workload |
| **notBreaching** | Missing = within threshold | Idle workload, terminated instances |
| **breaching** | Missing = threshold violation | Critical availability, "no data = problem" |
| **ignore** | Keep current alarm state | Maintenance window state preservation |

> ⚠️ **Pitfall**: Default `missing` more dangerous than seems. EC2 instance terminates, CloudWatch metric stream stops. Alarm transitions INSUFFICIENT_DATA, stays there forever. Is terminated instance alarm INSUFFICIENT_DATA? Depends on design intent. "Monitor while instance alive" → `notBreaching` better. "Always running instance" → `breaching` correct.

> 📚 **Case study**: 2022 Korean fintech startup (unnamed) payment server EC2 OOM-terminated. Alarm TreatMissingData default `missing`, only 3 of 5 EvaluationPeriods missing yet, didn't transition ALARM. Payment server dead 15 minutes, alarm silently INSUFFICIENT_DATA. Incident discovered via user complaints, not alarm. Team changed that instance's alarm to `breaching` after.

## EC2 Auto Recovery: StatusCheckFailed_System vs Instance

EC2 status checks two types. `StatusCheckFailed_System` = AWS infrastructure (host, network, power) issue. `StatusCheckFailed_Instance` = guest OS, kernel panic, network config etc. software issue.

Auto Recovery action meaningful only for `StatusCheckFailed_System`. AWS migrates instance to new physical host. Private IP, Elastic IP, EBS volumes, instance ID preserved. Instance store (ephemeral) data lost.

For `StatusCheckFailed_Instance`, `reboot` action better than Auto Recovery. OS-level issues often resolved by restart. Complex response (SSM Run Command collect memory dump → reboot → analyze) via EventBridge → Lambda → SSM.

```bash
# StatusCheckFailed_System → Auto Recovery
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-SystemCheck-Recover" \
  --metric-name StatusCheckFailed_System \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --period 60 \
  --statistic Maximum \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --datapoints-to-alarm 2 \
  --alarm-actions "arn:aws:automate:ap-northeast-2:ec2:recover"

# StatusCheckFailed_Instance → Reboot
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-InstanceCheck-Reboot" \
  --metric-name StatusCheckFailed_Instance \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --period 60 \
  --statistic Maximum \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 3 \
  --alarm-actions "arn:aws:automate:ap-northeast-2:ec2:reboot"
```

## Composite Alarm: Structural Solution to Alert Noise

Composite Alarm combines multiple child alarm states via Boolean expression. Available operators: `ALARM()`, `OK()`, `INSUFFICIENT_DATA()`, `AND`, `OR`, `NOT`.

```
ALARM("EC2-CPU-High") AND ALARM("ALB-5xx-High")
ALARM("RDS-CPU-High") OR ALARM("RDS-Connections-High")
(ALARM("a") OR ALARM("b")) AND NOT ALARM("maintenance-window")
```

Most important feature: **Actions Suppressor**. Disables child alarm actions (SNS, PagerDuty), fires only Composite alarm actions. Enables "15 child alarms simultaneously → 1 PagerDuty alert."

> 💡 **Related theory**: Composite Alarm design follows systems engineering's **information abstraction hierarchy** principle. Like Jens Rasmussen's 1983 "Skills, Rules, and Knowledge" cognitive model, abstracts low-level signals (child alarms) to high-level semantic unit (Composite Alarm). Operators receive single signal "service X degraded," not "which metric violated?" Netflix SRE's "Symptom-based alerting" philosophy: wake people on symptoms, not causes.

> 📚 **Case study**: Shopify 2021 Black Friday preparation addressed thousands-alarm noise via Composite-like structure (SRECon 2022 talk). Core: separate "paging alerts" (wake people) from "logging alerts" (log only). Composite = paging, child = logging layers.

## Metric Math Alarm: Standard Pattern for Ratio-Based Alerts

Alarms by formula, not single metric. Error rate alarm typical case.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "ALB-ErrorRate-High" \
  --metrics '[
    {"Id":"e","MetricStat":{"Metric":{"Namespace":"AWS/ApplicationELB",
      "MetricName":"HTTPCode_Target_5XX_Count",
      "Dimensions":[{"Name":"LoadBalancer","Value":"app/my-alb/abc"}]},
      "Period":60,"Stat":"Sum"},"ReturnData":false},
    {"Id":"r","MetricStat":{"Metric":{"Namespace":"AWS/ApplicationELB",
      "MetricName":"RequestCount",
      "Dimensions":[{"Name":"LoadBalancer","Value":"app/my-alb/abc"}]},
      "Period":60,"Stat":"Sum"},"ReturnData":false},
    {"Id":"er","Expression":"e/r*100","Label":"Error Rate %","ReturnData":true}
  ]' \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --treat-missing-data notBreaching
```

`e/r*100` divides 5xx count by total requests, percentage. Much more robust than absolute threshold. 100x traffic increase, 5% error rate = still 5%. Absolute "5xx > 100 count" triggers on traffic surge even when healthy.

> 🔍 **Deeper context**: Metric Math supports 40+ functions per AWS docs. `SEARCH()` retrieves all matching metrics, sum them. Example: `SUM(SEARCH('{AWS/EC2,InstanceId} MetricName="CPUUtilization"', 'Average', 60))` sums all account EC2 average CPU. Single alarm monitors entire fleet load. Caveat: SEARCH results can't directly feed alarms (`ReturnData:false` forced); another expression must consume.

## Anomaly Detection Alarm: ML-Based Dynamic Threshold

`ANOMALY_DETECTION_BAND()` function: CloudWatch internal ML model auto-calculates metric's "normal range band." Instead fixed threshold, "this time-of-day, this weekday's normal range" computed dynamically.

Internal algorithm AWS doesn't reveal, but published architecture suggests **STL decomposition (Seasonal-Trend decomposition using LOESS)**-like approach: decompose time-series into trend + seasonality + residual, construct confidence band from residual distribution.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "API-Latency-Anomaly-High" \
  --metrics '[
    {"Id":"m1","MetricStat":{"Metric":{"Namespace":"AWS/ApiGateway",
      "MetricName":"Latency"},"Period":300,"Stat":"p99"}},
    {"Id":"ad1","Expression":"ANOMALY_DETECTION_BAND(m1, 2)"}
  ]' \
  --threshold-metric-id ad1 \
  --comparison-operator GreaterThanUpperThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --treat-missing-data notBreaching
```

Second parameter `2` = std-dev multiplier. 2 = ~95% normal data in band (Gaussian assumption). 1 = more sensitive, 3 = less sensitive. Early morning low traffic = lower band, lunch peak = higher band, auto-adjusted.

> 💡 **Related theory**: Anomaly Detection ML model needs min 2 weeks, recommended 6+ weeks data to learn. Enable immediately on new service → 2 weeks band unstable. Learning period = frequent exam question. "Anomaly Detection enabled, first week no alarms triggered. Problem?" → Normal. Learning. Weekday seasonality (Mon-Fri) needs min 2 weeks; monthly pattern needs 6.

> 🔍 **Deeper context**: `GreaterThanUpperThreshold` alarms only exceeding band upper. "Faster response not problem, so" one-way check appropriate. `LessThanLowerOrGreaterThanUpperThreshold` = bidirectional. Lambda invocation count drop = anomaly (traffic not reaching). Confusion between `GreaterThanUpperThreshold`, `LessThanLowerThreshold`, `LessThanLowerOrGreaterThanUpperThreshold` = exam pitfall.

## Comparison with Other Monitoring Platforms

CloudWatch Alarm philosophy compared to others clarifies design choices.

| Item | CloudWatch | GCP Cloud Monitoring | Azure Monitor |
|------|-----------|---------------------|---------------|
| Alarm unit | Metric Alarm | Alerting Policy | Alert Rule |
| M of N eval | Native | Condition window-based | Dynamic threshold |
| Composite | Composite Alarm | Multiple condition AND/OR | Action Groups |
| Anomaly | Anomaly Detection Band | Auto-forecast threshold | Dynamic Threshold |
| Alarm states | 3 (OK/ALARM/INSUFFICIENT) | 2 (OK/ALERTING) | 3 (OK/Fired/Resolved) |
| Metric storage | Default 15mo | Default 6wk | Default 93d |

GCP Alerting Policy condition window similar to M of N but less intuitive. Azure Dynamic Threshold closest to CloudWatch Anomaly Detection, equally ML-based.

> 📚 **Case study**: Datadog 2023 State of DevOps report: 90% high-maturity SRE teams use Composite Alarm or equivalent "upper-level aggregate alarm." Conversely, teams with high alert noise: 78% use single-metric alarms only. Strong correlation between alarm design maturity and MTTR (Mean Time To Recovery).

## High Resolution Alarm and Cost Model

Standard alarm min Period=60s. 10s or 30s High Resolution metrics enable High Resolution Alarms. Different cost:

- Standard (60s+ Period): $0.10/alarm/month
- High Resolution (10s, 30s): $0.30/alarm/month

High Resolution needed "catastrophic failure spreads in 5min" scenario: payment processors, live auctions, game matching servers. Most web services sufficient at 60s resolution.

```bash
# High Resolution Alarm: 10-second CPU
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-HighCPU-Fast" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --period 10 \
  --statistic Maximum \
  --threshold 90 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 3 \
  --alarm-actions arn:aws:sns:ap-northeast-2:123456789012:critical-alerts
```

## Operator Antipatterns List

Frequent wrong design patterns in exam and operations.

**Antipattern 1: M=1, N=1 (immediate trigger)** — all alarms "any violation → instant." Reacts to every spike. Fix: adjust M of N per workload.

**Antipattern 2: PagerDuty action per child alarm** — one incident → dozens alerts. Fix: suppress child actions, Composite Alarm only.

**Antipattern 3: All alarms TreatMissingData=breaching** — brief CloudWatch collection delay → ALARM. Fix: selectively apply per service.

**Antipattern 4: Short Period, few EvaluationPeriods** — fast response but noisy. Fix: recognize trade-off between response speed and noise.

**Antipattern 5: Direct cross-region alarms** — CloudWatch Alarms eval same-region metrics only. Multi-region needs Metric Stream copy to central account, alarm there. Unaware design = multi-region monitoring gap.

## Summary

CloudWatch Alarm simple-seeming, but M of N, TreatMissingData, Composite Alarm, Anomaly Detection combination determines design quality. Difference between overwhelmed overnight on-call (15 alerts) vs meaningful single alert = design philosophy. Exam asks each parameter meaning and correct setting per scenario.

---

## 📝 Practice Problems

**Problem 1.** EC2 has hourly 30-second CPU spike (scheduled batch). Spike triggers PagerDuty each time. Adjust?

A) Raise Threshold to 90%
B) Set EvaluationPeriods=5, DatapointsToAlarm=4, ignore transient spike
C) Reduce Period to 10s
D) Change TreatMissingData to breaching

**정답: B**

해설: 30-second spike within single 60s Period data point. M of N with N=5, M=4: "5min, 4 minutes violate → alarm." One-time spike passes. Raising Threshold misses real overload. Shorter Period detects more violations, worsens.

---

**Problem 2.** Payment EC2 OOM-terminated. Alarm TreatMissingData default missing, EvaluationPeriods=5, currently 3 points missing. Alarm state?

A) ALARM — instance died
B) INSUFFICIENT_DATA — insufficient missing
C) OK — missing treated normal
D) Alarm disabled

**정답: B**

해설: missing ignores missing data, evals by others. 5 of 10 missing → evals remaining 2 points. If last 2 normal, alarm OK or INSUFFICIENT_DATA. True availability monitoring needs TreatMissingData=breaching.

---

**Problem 3.** One incident: 20 alarms simultaneous (EC2, RDS, ALB, ElastiCache), PagerDuty flooded. Fix?

A) Raise thresholds all
B) Extend EvaluationPeriods all
C) Composite Alarm group children, Actions Suppressor, parent to PagerDuty only
D) Standardize Period 5min all

**정답: C**

해설: Core Composite Alarm design purpose. Suppress child actions via Suppressor, AND/OR express "real service degradation," parent alarm alone to PagerDuty. Raising thresholds/Period slows detection, different problem.

---

**Problem 4.** EC2 Auto Recovery set, guest OS kernel panic, Recovery doesn't trigger. Why?

A) Auto Recovery disabled
B) StatusCheckFailed_Instance won't recover. System Check failure only
C) Recovery needs no EBS
D) Region limit

**정答: B**

解說: Auto Recovery only `StatusCheckFailed_System` — AWS infrastructure (hardware, power, network). Guest OS panic = `StatusCheckFailed_Instance`, software layer AWS can't control. Needs Reboot or SSM Automation.

---

**Problem 5.** Monitor API Gateway response via Anomaly Detection. Alert only "slower than normal." Correct ComparisonOperator?

A) LessThanLowerOrGreaterThanUpperThreshold
B) GreaterThanUpperThreshold
C) LessThanLowerThreshold
D) GreaterThanThreshold

**정답: B**

解說: Faster response not problem. Band exceeding = slower. `GreaterThanUpperThreshold` detects upper only. Bidirectional (too fast or too slow) needs `LessThanLowerOrGreaterThanUpperThreshold` — Lambda invocation count dropping = anomaly.

---

**Problem 6.** Cross-Region limitation effects?

A) Can't send SNS to other-region
B) Alarm evals same-region metrics only; can't direct-alarm other-region source
C) Can't recover other-region EC2
D) Composite Alarm children one-region only

**정答: B**

解説: Fundamental limit: Alarms eval same-region metrics only. us-east-1 metric, alarm in ap-northeast-2 impossible. Multi-region needs Metric Stream copy to central, alarm there, or cross-region EventBridge rules.

---

**Problem 7.** EvaluationPeriods=10, DatapointsToAlarm=1 behavior?

A) 10 consecutive violations needed
B) 1 of 10 violates → immediate alarm
C) 5 of 10 violations needed
D) INSUFFICIENT_DATA

**正答: B**

解説: DatapointsToAlarm=1 most sensitive — single N-window violation triggers. Used when 10-min window any 5xx event = alarm scenario.

