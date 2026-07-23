# Day 2 - CloudWatch Dashboards: Cross-Account Aggregation, Variables, Observability Design

Conference room TV shows rotating CloudWatch dashboard. Someone asks "shouldn't you understand service status glance at that screen?" Honest operator answers: "Theoretically yes, but even seeing something odd, don't know where to start." Dashboard existence ≠ dashboard meaning.

Today covers CloudWatch Dashboard widget structure, JSON body, cross-account/region Observability, Dashboard Variables. Simultaneously, based on Google SRE **Golden Signals** and Netflix's **observability hierarchy**, design dashboards where "seeing screen → understanding."

## Observability's Three Pillars and CloudWatch's Position

Observability originated control theory. Kalman (1960) first used "completely estimate internal system state from external outputs" as control theory term. Modern operations engineering: estimate system internals via three signals — Logs, Metrics, Traces.

CloudWatch covers all three. CloudWatch Metrics (quantifiable numbers), CloudWatch Logs (structured/unstructured text), X-Ray Traces (request paths) integrate as dashboard widgets. Dashboard = "observability entry point" cross-referencing three signals.

> 💡 **Related theory**: Cindy Sridharan's *Distributed Systems Observability* (O'Reilly, 2018) defines modern observability as ability to explore "unknown unknowns." Traditional monitoring detects known failure patterns via threshold; observability tracks novel failure types through clues. CloudWatch dashboard should be visual exploration start.

## Widget Types: When Use What?

Dashboard arranges widgets on 24-column grid. Each widget type suits different scenarios.

| Widget | Best use | Antipattern |
|--------|----------|-------------|
| **Line** | Time-series trend, comparison | Instantaneous values, poor readability |
| **Stacked Area** | Component-by-component sum | Vastly different values hide small ones |
| **Number** | Current single KPI | Multiple numbers, contextless confusion |
| **Gauge** | 0-100% utilization | Absolute values poorly suited |
| **Bar** | Category comparison (by region, service) | Time-series, pattern invisible |
| **Pie** | Ratios (5 items max) | Similar values, difference imperceptible |
| **Logs Insights** | Real-time query results, error samples | Large queries, slow widget load |
| **Alarm Status** | Alarm state grid, service status board | Too many, readability collapses |
| **Text** | Section titles, descriptions, links | Excessive explanation text, space wasted |
| **Custom (iframe)** | Grafana panels, external viz | CORS, security policy constraints |

> 💡 **Related theory**: Edward Tufte's *The Visual Display of Quantitative Information* (1983) classic. Tufte's "data-ink ratio" principle: maximum ink representing actual data. Unnecessary gridlines, excessive 3D, decoration impede data transmission. Same applies CloudWatch. Widget title, unit, Y-axis range must be clear.

## Dashboard JSON Structure and IaC Management

Dashboard fully represented by JSON. Managing this JSON as CloudFormation `AWS::CloudWatch::Dashboard` resource versions dashboard code.

```json
{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "ALB Requests & 5xx Error Rate (1min aggregate)",
        "metrics": [
          ["AWS/ApplicationELB", "RequestCount",
           "LoadBalancer", "app/prod-alb/abc123",
           {"stat": "Sum", "label": "Requests", "yAxis": "right"}],
          [{"expression": "errors/requests*100",
            "label": "5xx Error Rate (%)", "id": "errorRate", "yAxis": "left"}],
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count",
           "LoadBalancer", "app/prod-alb/abc123",
           {"id": "errors", "visible": false, "stat": "Sum"}],
          ["AWS/ApplicationELB", "RequestCount",
           "LoadBalancer", "app/prod-alb/abc123",
           {"id": "requests", "visible": false, "stat": "Sum"}]
        ],
        "period": 60,
        "view": "timeSeries",
        "yAxis": {
          "left": {"min": 0, "max": 100, "label": "Error Rate (%)"},
          "right": {"min": 0, "label": "Request Count"}
        },
        "annotations": {
          "horizontal": [{"value": 5, "color": "#ff6600", "label": "5% Error Threshold"}]
        },
        "region": "ap-northeast-2"
      }
    },
    {
      "type": "log",
      "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Recent Errors (Real-time)",
        "query": "SOURCE '/aws/lambda/order-service' | fields @timestamp, @message | filter @message like /ERROR|FATAL/ | sort @timestamp desc | limit 20",
        "region": "ap-northeast-2",
        "view": "table"
      }
    }
  ]
}
```

Dual Y-axes (error rate % + request count absolute) useful viewing different-scale metrics' correlation. Traffic increase → error rate also rise? Or error rate fixed, error count increases?

## Cross-Account/Cross-Region Observability: Internals

Multi-account CloudWatch per-account console = operational inefficiency. AWS GA'd 2022 **CloudWatch Cross-Account Observability (OAM)**. OAM = **Observability Access Manager**.

Simple architecture: **Sink** in Monitoring Account, Source Accounts create **Link** toward Sink. Link connected → Source Account Metrics, Logs, Traces transparently visible Monitoring Account CloudWatch console.

```bash
# 1. Create Sink in Monitoring Account
SINK_ARN=$(aws oam create-sink \
  --name "prod-observability-sink" \
  --query 'Arn' --output text)

# 2. Set access policy (which accounts can Link)
aws oam put-sink-policy \
  --sink-identifier "$SINK_ARN" \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "AWS": ["arn:aws:iam::111122223333:root",
                "arn:aws:iam::444455556666:root",
                "arn:aws:iam::777788889999:root"]
      },
      "Action": ["oam:CreateLink", "oam:UpdateLink"],
      "Resource": "*"
    }]
  }'

# 3. Create Link in each Source Account
aws oam create-link \
  --label-template '$AccountName-$AccountId' \
  --resource-types \
    AWS::CloudWatch::Metric \
    AWS::Logs::LogGroup \
    AWS::XRay::Trace \
  --sink-identifier "$SINK_ARN"
```

Dashboard widget referencing other-account metrics specifies `accountId` and `region`.

```json
{
  "metrics": [
    ["AWS/EC2", "CPUUtilization", "InstanceId", "i-aaa111bbb",
     {"accountId": "111122223333", "region": "ap-northeast-2",
      "label": "Prod EC2 CPU (Account A)"}],
    ["AWS/EC2", "CPUUtilization", "InstanceId", "i-ccc333ddd",
     {"accountId": "444455556666", "region": "us-east-1",
      "label": "DR EC2 CPU (Account B, us-east-1)"}]
  ]
}
```

> 🔍 **Deeper context**: OAM internal = IAM role-based delegation. Monitoring Account CloudWatch service Assumes pre-created service-linked role in Source Account, reads data. No actual replication — instead Monitoring Account CloudWatch console directly calls Source Account CloudWatch API. So Source Account data stays Source Account; Monitoring Account provides "read-only transparent view." Key difference: Metric Stream (physically copies data) vs OAM (read delegation).

> 📚 **Case study**: Large Korean e-commerce platform operates 30+ AWS accounts. Operations team previously logged each account separately; 2021 migrated to unified Monitoring Account. Post-OAM MTTD (Mean Time To Detect) dropped average 8min→3min per internal talk. Single dashboard cross-account alarms, incident spreading between accounts detected much faster.

## Comparison with Other Platforms

| Item | CloudWatch Dashboard | Grafana (OSS) | Datadog |
|------|---------------------|---------------|---------|
| Data source | CloudWatch native | Multi-source | Datadog native + integrations |
| Cross-account | OAM support | IAM role config | Account integration |
| Pricing | 3 free, then $3/month | OSS free, hosted paid | Usage-based |
| Code definition | JSON (CloudFormation) | JSON (Grafana API) | Terraform Provider |
| Alarm overlay | Alarm Status widget | Annotation | Monitor Alert |
| Logs integration | Logs Insights widget | External source | Log Management |

GCP Cloud Monitoring uses MQL (Monitoring Query Language), more flexible than CloudWatch but steeper learning. Azure Monitor introduces Workbooks (interactive report concept), closer analysis than dashboard. CloudWatch strength = AWS native integration.

## Golden Signals and Hierarchical Dashboard Design

Google SRE Book (2016) Chapter 4 proposes **Four Golden Signals**: Latency (delay), Traffic (throughput), Errors (error rate), Saturation (saturation). Well-showing these four captures 90% service state.

Practical dashboard design effective at three-level structure:

**Level 1 — Executive Dashboard (Business KPI)**
- Visitor count, payment completion, revenue (business metrics)
- Whole service availability (single number)
- 1 dashboard, <10 widgets

**Level 2 — Service Dashboard (Golden Signals)**
- Per-service p50/p95/p99 latency
- Request count & error rate
- Key resource saturation (CPU, memory, queue depth)
- 1 dashboard per service

**Level 3 — Operational Dashboard (drill-down)**
- Specific instance/Lambda/RDS detail metrics
- Opened during incident analysis

Most operations teams display Level 2 dashboard on TV. Level 1 for executive reports, Level 3 for per-incident review.

## Dashboard Variables: One Dashboard, Multiple Environments

Variables make dashboard dynamic. Dropdown selecting environment (dev/stage/prod) or instance changes all widgets simultaneously.

```json
{
  "variables": [
    {
      "type": "property",
      "property": "InstanceId",
      "inputType": "select",
      "id": "InstanceId",
      "label": "EC2 Instance",
      "visible": true,
      "search": {
        "expression": "SEARCH('{AWS/EC2,InstanceId} MetricName=\"CPUUtilization\"', 'Average', 60)",
        "populateFrom": "InstanceId"
      }
    },
    {
      "type": "property",
      "property": "FunctionName",
      "inputType": "select",
      "id": "FunctionName",
      "label": "Lambda Function",
      "visible": true,
      "values": [
        {"label": "order-service", "value": "order-service"},
        {"label": "payment-service", "value": "payment-service"},
        {"label": "notification-service", "value": "notification-service"}
      ]
    }
  ],
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/EC2", "CPUUtilization", "InstanceId", "${InstanceId}"]
        ]
      }
    }
  ]
}
```

Insert variables like `${InstanceId}` into metric Dimension values. SEARCH expressions auto-populate Variables; new instances auto-add dropdown without dashboard modification.

> 🔍 **Deeper context**: Variable `search` type leverages CloudWatch SEARCH function dynamically populating metric Dimension values current account/region. Pattern type makes metric name itself variable. E.g., `{AWS/EC2,InstanceId}` namespace MetricName pattern → dropdown selecting CPUUtilization/NetworkIn/DiskReadOps creates "universal EC2 dashboard." Caveat: SEARCH-based Variables dynamically fetch results, slightly longer dashboard load.

## Automatic Dashboards and Container Insights

Enabling service auto-creates default dashboard. EC2, Lambda, RDS, DynamoDB, API Gateway main targets. Auto-dashboard unmodifiable but useful "starting point." Add missing metrics, connections in custom dashboard.

Container Insights = automatic dashboard for ECS/EKS. Cluster, service, Task, Pod-level CPU/memory/network auto-collected, pre-configured dashboard. Like EC2 needs CloudWatch Agent, Container Insights runs agent as DaemonSet (EKS) or sidecar (ECS).

## Dashboard Sharing and Security

- **IAM user sharing**: Grant dashboard read permission account IAM users
- **SSO/Identity Center**: Federation users org-wide
- **Public Sharing**: URL access without auth

> ⚠️ **Pitfall**: Public Sharing convenient but risky. Dashboard-displayed EC2 IDs, traffic patterns, error messages, IP addresses exposed externally. Single instance ID lets attacker know "which instance externally exposed," "peak traffic timing." Public Sharing limited "demo" or "completely non-sensitive data only."

## Cost Structure

- First 3 dashboards free
- 4th dashboard onward $3/month each
- 500 dashboard limit/account (default)
- Auto-dashboards not counted

50 teams each creating dashboard = $141/month dashboard cost. Negligible amount, but "dashboard governance" absent → often hundreds duplicate dashboards. CloudFormation JSON management → prevent duplication, cost tracking.

> 💡 **Related theory**: Amazon "Two-Pizza Team" principle like (Jeff Bezos), dashboard similarly "one service dashboard + one operational dashboard per team" appropriate. Dashboard fatigue = Alert fatigue phenomenon. Too many dashboards → "which dashboard view" unknown. Netflix SRE: "dashboards answer questions, shouldn't just create."

## Summary

Dashboard = "observability tool," not "resolution tool." Find issue in dashboard → alarms and automation respond, dashboard adds context. Operator waking 3am directly watching TV dashboard unsustainable. Alarms detect "something wrong," dashboard shows "how wrong, what correlates" — proper design division.

---

## 📝 Practice Problems

**Problem 1.** Company 5 AWS accounts (Dev/Stage/Prod/DR/Log). Operations wants single dashboard viewing Prod+DR EC2 CPU simultaneously. Correct sequence?

A) Each account separate dashboard, switch tabs
B) OAM Sink in Monitoring Account → Link in Prod/DR → Monitoring Account dashboard widget accountId specified
C) CloudFormation StackSet deploy identical dashboard each account
D) Cross-Region auto-supported, no setup needed

**정답: B**

해설: OAM (CloudWatch Cross-Account Observability) standard config. Sink = Monitoring Account receives; Link = Source Accounts send. Widget metric definition accountId = multiple-account metrics single widget. StackSet each-account same dashboard = still per-account login needed.

---

**Problem 2.** Operations wants single dashboard dev/staging/production dropdown-switching. What feature?

A) Create 3 dashboards, provide URL links
B) Dashboard Variables — Values environment resource IDs, widget variable reference
C) Search Expression all-environment metrics single graph
D) CloudFormation parameters deploy environment-specific dashboards

**정답: B**

해설: Dashboard Variables designed this purpose. Dropdown-type variable environment dev/stage/prod resource IDs Values, widget metrics `${EnvironmentId}` reference. Dropdown change → all widgets change. 3 separate dashboards = 3x maintenance burden.

---

**Problem 3.** Display 100 EC2 CPUs single graph, new instances auto-included?

A) Manually list 100 instance IDs widget
B) SEARCH expression: `SEARCH('{AWS/EC2,InstanceId} MetricName="CPUUtilization"', 'Average', 60)`
C) Use ASG metrics instead
D) Lambda daily dashboard update

**정답: B**

해설: SEARCH expression dynamically retrieves metrics matching namespace, Dimension pattern. New instance starts → CPUUtilization metric auto-published → auto-included SEARCH result. Manual listing → update per new instance. ASG metrics only group average, no per-instance tracking.

---

**Problem 4.** Public Sharing dashboard URL external partner. Security risks?

A) AWS charges reach external partner
B) Partner can terminate EC2 instances
C) Instance IDs, traffic patterns, error messages exposed without auth
D) IAM policy auto-changes

**정답: C**

해설: Public Sharing = anyone with URL sees dashboard. Instance IDs, error patterns, traffic spike patterns = useful attacker info. Read-only so can't directly modify, but information exposure risk. External sharing needs SSO users or separate read-only IAM account.

---

**Problem 5.** CloudFormation-manage dashboard JSON biggest advantage?

A) Dashboard faster loads
B) Change history, team review (PR), environment auto-deploy, drift detection
C) Cost reduced per dashboard
D) 3+ dashboards free

**정답: B**

해설: IaC management includes code review (PR), Git history "who when what widget added," environment (dev/prod) parameters auto-deploy identical template. Cost/speed unchanged. `AWS::CloudWatch::Dashboard` DashboardBody property JSON.

---

**Problem 6.** Operations team 20 dashboards, don't know which view — "Dashboard Fatigue." Improve?

A) Delete all, use CloudWatch console default only
B) Redesign Executive → Service → Operational hierarchy, TV display Service level; drill-down Operational on anomaly
C) Consolidate all metrics single dashboard
D) Reduce alarms, separate dashboard correlation

**정답: B**

해설: Hierarchical dashboard standard solution. Normally display Level 2 (Golden Signals per-service) on TV. Discover anomaly → drill-down Level 3 (Operational). Level 1 (business KPI) executive reports. Not viewing all 20, but "which level now" clear.

