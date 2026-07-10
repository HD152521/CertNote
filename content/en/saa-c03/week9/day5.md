# Day 5 - Week 9 Synthesis: Threading Observability and Governance Through "Who / When / What / Why"

The services from this week — CloudWatch, CloudTrail, Config, Systems Manager, X-Ray, Trusted Advisor, Health Dashboard — look at first glance like a miscellaneous collection of operational tools. But there's a question that threads them into one line. When something happens to a system, the questions an engineer throws out come down to four: "**who** did this (audit)," "**what state is it in now** (configuration / metrics)," "**why** is it slow or broken (tracing / logs)," and "is this **my problem or an AWS problem** (health)." Every service in Week 9 exists to answer one of these four questions, and the SAA exam relentlessly tests your ability to identify which of the four a scenario's question belongs to.

This article realigns the week's services along these four question axes, cements the confusing boundaries (CloudTrail vs. Config, Metrics vs. Logs vs. Trace, Health vs. Trusted Advisor) with incident case studies, and then locks the mapping in with 12 scenario questions in the form that appears on the actual exam. Since the depth of each individual service was covered in Days 1–4, here we build the grain of the decision "which signal points to which tool."

## Week 9 Realigned Around the Four Questions

The worst way to memorize operational tools is as a "service list." The best way is a "question → tool" mapping, because exam questions always arrive in the form of a question.

| Question | Core tool | Companion / distinction |
|---|---|---|
| **Who did what, when** (behavior audit) | CloudTrail | Config is "state," CloudTrail is "behavior" |
| **Does the resource configuration follow the rules now** (state / compliance) | Config | Auto-remediation is SSM Automation |
| **How is the system's health** (CPU / error rate / availability) | CloudWatch Metrics/Alarm | Guest-internal (memory) needs the Agent |
| **What exactly happened at that moment** (detailed context) | CloudWatch Logs/Insights | Can't aggregate; kept raw |
| **Why is this request slow** (distributed causality) | X-Ray | Decomposes down to downstream |
| **Network traffic flow** | VPC Flow Logs | Packet metadata |
| **What incident occurred on AWS's side** (impact on my account) | Health Dashboard (Personal) | + EventBridge auto-response |
| **Am I following best practices** (recommendations) | Trusted Advisor | Full check / API on Business+ |
| **How big should I provision resources** (right-sizing) | Compute Optimizer | Memory needs the Agent |
| **Execute operational tasks** (patch / access / commands) | Systems Manager | Session/Patch/Run/State |

> 💡 **Related theory**: These four questions are observability theory's "three pillars (metrics, logs, traces)" plus one governance axis (audit, configuration). Metrics answer "something is wrong" (the symptom), logs answer "the context of that moment," and traces answer "causality spanning multiple services." The three pillars are complementary, and no single one is enough — the essence is cross-analysis: detect an anomaly with metrics, narrow to which service with a trace, and find the exact culprit line with logs. CloudTrail and Config add a governance dimension on top of this — "who made the system this way."

## CloudTrail vs. Config — How Do "Behavior" and "State" Split

This is the boundary most often confused. Both seem related to "change," but the questions they answer are opposite. **CloudTrail records behavior (who called which API)** in time order, while **Config records state (what this resource's configuration is now, and whether it follows the rules)**.

Concretely, take the event "a security group was opened to 0.0.0.0/0." **Who** opened it (which IAM user called `AuthorizeSecurityGroupIngress`, and when) is answered by CloudTrail. Whether that security group is **now** in a rule-violating state (e.g., "no SG should allow 0.0.0.0/0:22") is answered by Config. That is, CloudTrail is "the actor and time of the event," and Config is "the current state and compliance status."

> 🔍 **Going deeper**: Config builds a **Configuration Item timeline** of a resource — it preserves the "history of state," such as "at time t1 port 22 was closed, and at t2 someone opened it and it became a violating state." If you attach a Config Rule here, it detects the violation and even connects to auto-remediation (closing it again) via an **SSM Automation Runbook**. CloudTrail, by contrast, leaves the actor, source IP, and request parameters of the API call that caused that t1→t2 transition. Using them together answers both "what became a bad state (Config)" and "who made it so (CloudTrail)" — a complete picture for security-incident analysis.

> ⚠️ **Pitfall**: The answer to "check whether all S3 buckets currently have Block Public Access (BPA) enabled" is a Config Rule (state check). The answer to "track who turned off BPA," on the other hand, is CloudTrail (behavior tracking). If the question's verb is "is it currently in ~ state / does it comply," it splits to Config; if it's "who / when did ~," it splits to CloudTrail.

> 📚 **Case study**: The 2019 **Capital One data breach** (about 100 million credit-application records) was an incident in which a misconfigured WAF/IAM permission let an attacker steal excessive S3 access permissions via EC2 metadata. In the post-incident analysis, CloudTrail logs played the decisive role — abnormal `ListBuckets` and `GetObject` call patterns were recorded, allowing the scope and path of the breach to be reconstructed. There are two lessons. First, CloudTrail must be "on from before the incident happens" for post-incident analysis to be possible (after the incident is too late). Second, had Config been continuously checking rules like "no public S3, no excessive IAM permissions," the bad state would have been caught in advance. Behavior audit (CloudTrail) and state compliance (Config) are the two wings of incident prevention and analysis.

## Metrics vs. Logs vs. Trace — Three Angles on the Same Outage

How three tools look differently at the single event "the service is slow" is the core of observability. **CloudWatch Metrics** shows the **time series of the symptom** — "p99 latency spiked from its usual 200ms to 3 seconds" — a signal that something is wrong. **X-Ray Trace** follows that one slow request and gives the **decomposition of causality** — "Lambda is 200ms, but the external payment-API Subsegment inside it is 2.8 seconds" — telling you which service is the culprit. **CloudWatch Logs** gives the **exact context** from the log at the moment of that external-API call — "gateway timeout after 3 retries" — telling you why.

This order is the standard flow of real-world debugging: detect an anomaly with metrics → narrow to the service with a trace → confirm the culprit line with logs. No single one is enough. With metrics alone you only get "it's slow"; with logs alone you don't know where to look among hundreds of millions of lines; with traces alone you know "the slow span" but not the exact error message inside it.

> 💡 **Related theory**: That these three data types have fundamentally different storage structures was the core of Day 1. Metrics are pre-aggregated time series (cheap and fast, but they lose "that one second"), logs are raw text (expensive, but preserve exact context), and traces are span trees bound by a Trace ID (causality between services). So even the same event answers different questions depending on which tool you view it through. The principle "high-cardinality tracking (per-user) is the job of logs/traces, not metrics" also comes from here — put a user ID in a metric dimension and the time series explodes.

> ⚠️ **Pitfall**: For "alarm on EC2 memory utilization," memory isn't in the standard metrics, so installing the CloudWatch Agent is the answer. CPU, network, and disk I/O are visible at the hypervisor (Nitro) level, but memory and free disk space are guest-OS-internal information the hypervisor can't see. This pitfall is an SAA regular that recurs in Day 1, Day 4 (Compute Optimizer), and Day 5.

## Health vs. Trusted Advisor — "AWS's Incident" and "My Environment's Recommendation"

Another confusing boundary. **Health Dashboard** answers "the impact on my account of something that happened on AWS's infrastructure side," while **Trusted Advisor** answers "does the environment I built follow best practices." The former is AWS's area of responsibility, the latter is my area of responsibility.

"The hardware running my instance will undergo a maintenance reboot next Tuesday" is Health (Personal) — an event AWS causes. "Your EIP is being wasted, not attached to anything; your security group is open to 0.0.0.0/0" is Trusted Advisor — a recommendation about my configuration. It splits by who the responsible party is.

> 🔍 **Going deeper**: What both have in common is that they combine with EventBridge to become a source of automation, but their uses differ. Health (Personal) + EventBridge is preemptive response like "move traffic to another AZ ahead of AWS maintenance," while Trusted Advisor + EventBridge is recommendation-based response like "request an automatic increase when a service limit reaches 80%." In an Organizations environment, Health Organizational View lets you see all member accounts' health from the management account; for deeper security recommendations you expand to Security Hub, and for cost to Compute Optimizer / Cost Explorer.

> 📚 **Case study**: During the large-scale us-east-1 outage of December 7, 2021, **the Service Health Dashboard itself depended on the same regional infrastructure**, so status updates were delayed. Many customers were confused because "my service is acting strange, yet the AWS status page is green." There are two lessons. First, Personal Health, personalized to my account, is more actionable than the global Service Health. Second, a monitoring system must not share a failure domain with what it monitors (the eye watching itself must not go blind along with it). Afterward, AWS further isolated the health path from incident impact.

## Systems Manager — The Single Gateway for Operational "Tasks"

The other axis of Week 9 is not "observation" but "execution." SSM is the single gateway for operational tasks: access 100 EC2 instances without SSH keys (Session Manager), automatically apply patches (Patch Manager + Maintenance Window), run commands in bulk (Run Command), enforce a desired state (State Manager), and store secrets and settings (Parameter Store).

Session Manager in particular is an exam regular — it's the answer to the requirement "shell access without a bastion host, without SSH keys, without opening an inbound port." The way it works: the instance's SSM Agent makes an **outbound** connection to the SSM service, and the user reaches the shell through that service — there's no need to open inbound port 22, so the attack surface shrinks, and every session is audited via CloudTrail / CloudWatch Logs.

> 💡 **Related theory**: Session Manager's idea of "eliminating inbound ports with an outbound connection" is a core pattern of **zero-trust networking**. A traditional bastion is perimeter security that places a "trusted jump host" and trusts what's inside it, but it has the weaknesses of lost keys, port exposure, and unaudited sessions. Session Manager eliminates the network path itself, controls access with IAM (authentication and authorization), and records every session (audit), shifting trust to be identity-based rather than perimeter-based. Replacing the long-lived credential that is an SSH key with IAM temporary credentials is in the same vein.

## The Week's Integrated Architecture

```
[ Integrated observability + governance picture ]

  EC2/Lambda/Container
    ├─ symptom detection ─→ CloudWatch (Metrics/Alarm)  ── memory needs the Agent
    ├─ exact context ─→ CloudWatch Logs/Insights
    └─ distributed causality ─→ X-Ray (Trace/ServiceMap) ─→ Application Signals(SLO)

  API calls (behavior) ─→ CloudTrail ─→ S3(Object Lock) + Logs + Lake
  resource state (compliance) ─→ Config Rule ─violation→ SSM Automation auto-remediation
  operational tasks ─→ Systems Manager (Session/Patch/Run/State/Parameter)

  AWS-side incident ─→ Health(Personal) ─→ EventBridge ─→ SNS/Lambda auto-response
  best-practice recommendations ─→ Trusted Advisor (full check on Business+) ─→ EventBridge
  resource size ─→ Compute Optimizer (memory needs the Agent)
```

The gist of this picture is that the "detect → diagnose → respond" flow never breaks. When metrics detect an anomaly, a trace narrows the service, logs confirm the cause, CloudTrail reveals the responsible party, and Config/SSM remediates the state. If any one tool is missing, this chain breaks and the "expensive time of not knowing the cause" grows.

## 시나리오 연습 문제 12

**문제 1.** In a security audit, you must track "who, when, and which IAM user opened a particular security group to 0.0.0.0/0." Which is the most appropriate tool?

A) AWS Config
B) CloudTrail
C) VPC Flow Logs
D) X-Ray

**정답: B**

해설: Behavior tracking of "who called which API, when" is CloudTrail's domain. CloudTrail leaves the principal (IAM principal), time, source IP, and request parameters of the `AuthorizeSecurityGroupIngress` call. A's Config answers the current state and compliance ("is that SG in a rule-violating state now") but doesn't directly reveal the actor. C's Flow Logs is network traffic metadata (who sent packets where), not a configuration-change API call. D is distributed tracing and is irrelevant. Remember the signal: if the verb is "who did ~," it's CloudTrail.

---

**문제 2.** A compliance team wants to continuously check "whether all S3 buckets currently have Block Public Access enabled" and automatically remediate on violation. Which is the most appropriate configuration?

A) Use CloudTrail to see only who turned it off
B) Check the compliance state with an AWS Config Rule and auto-remediate with an SSM Automation Runbook
C) Scan for vulnerabilities with Inspector
D) Classify sensitive data with Macie

**정답: B**

해설: "Is it currently in ~ state / does it comply" is Config's domain, and auto-remediation on violation follows the standard path Config Rule → SSM Automation Runbook. A's CloudTrail is behavior tracking, so it can tell "who turned it off" but can't do current-state checking or auto-remediation. C's Inspector is EC2/container vulnerability assessment, and D's Macie is S3 sensitive-data classification — both differ from BPA compliance checking. Remember "state compliance + auto-remediation" as the Config + SSM Automation combination.

---

**문제 3.** In the flow API Gateway → Lambda → DynamoDB → external payment API, user-perceived latency is 3 seconds, but CloudWatch Metrics only shows that Lambda Duration is long and you can't tell which downstream is the bottleneck. Which is the most appropriate tool?

A) Look at CloudWatch Metrics more
B) Decompose latency at the Subsegment level with X-Ray (Active Tracing)
C) Trusted Advisor Performance check
D) Increase Lambda memory with Compute Optimizer

**정답: B**

해설: "Per-call latency decomposition that includes downstream calls" is a capability unique to distributed tracing. X-Ray breaks DynamoDB and the external API into separate Subsegments inside the Lambda Segment and shows which span eats the 2.8 seconds. A's metrics only go as far as the symptom (slowness). C is a best-practice check, not runtime diagnosis. D's right-sizing is meaningless if the cause is the external API. "Why is it slow + causality across multiple services" = X-Ray.

---

**문제 4.** An operator wants shell access to 100 EC2 instances without deploying SSH keys, without opening inbound port 22, and with every access audited. Which is the most appropriate method?

A) Place a bastion host
B) Use Systems Manager Session Manager
C) Use EC2 Instance Connect only
D) Site-to-Site VPN

**정답: B**

해설: Session Manager reaches the shell via the instance SSM Agent's outbound connection, so there's no need to open inbound port 22; it controls access with IAM instead of the long-lived credential of an SSH key, and audits every session via CloudTrail/Logs. It conforms to zero trust. A's bastion leaves the burden of key management, port exposure, and auditing. C's EC2 Instance Connect injects a temporary key but still often presupposes an inbound SSH path, so Session Manager is superior for the "no open port, 100 in bulk, audited" requirement. D is a network-connection method, not a shell-access gateway.

---

**문제 5.** You want to automatically apply security patches to a 1,000-instance EC2 fleet only within a defined maintenance window, and receive a report of the results. Which is the most appropriate combination?

A) A UserData script
B) Systems Manager Patch Manager + Maintenance Window
C) Auto Scaling instance refresh
D) SSH in with Lambda and patch

**정답: B**

해설: "Automatically applying large-scale patches within a defined window (Maintenance Window) + compliance reporting" is the exact use of Patch Manager + Maintenance Window. You define the apply policy with a Patch Baseline and aggregate results as compliance. A's UserData runs once at boot and is unsuitable for repeated patching during operation. C's instance refresh is AMI-replacement-based, which is a different grain from "patch existing instances." D is inferior on SSH dependence, scalability, and auditing all at once.

---

**문제 6.** In a multi-account Organizations environment you want to ① audit the API behavior of all accounts in one place, ② view configuration compliance of all accounts in a unified way, and ③ aggregate security findings. Which is the most appropriate combination?

A) Organization Trail only
B) Config Aggregator only
C) Security Hub only
D) Organization Trail + Config Aggregator + Security Hub combined

**정답: D**

해설: The three requirements each correspond to a different tool — ① multi-account API behavior audit is Organization Trail (CloudTrail), ② unified multi-account configuration-compliance viewing is Config Aggregator, and ③ security-finding aggregation is Security Hub. No single tool does it all, so the combination is the answer. Remember multi-account governance as the triangle of "audit (CloudTrail) + state (Config) + security aggregation (Security Hub)." The single-tool options (A, B, C) each satisfy only part of the requirement.

---

**문제 7.** An operations team wants to detect "scheduled AWS-side maintenance and failures that actually affect the resources in my account" and set up automation to preemptively move traffic to another AZ. Which is the most appropriate configuration?

A) Periodically refresh the Service Health Dashboard page
B) Receive AWS Health API (Personal) events via EventBridge and run a Lambda auto-response
C) GuardDuty alerts
D) Trusted Advisor checks

**정답: B**

해설: AWS-side events that affect my account are Personal Health's domain, and the standard is to receive them via Health API + EventBridge to trigger an auto-response. A's global Service Health doesn't provide personalized impact and is unsuitable for automation, and the case where that page itself had delayed updates during the 2021 us-east-1 outage shows its limits. C's GuardDuty is threat detection and D's Trusted Advisor is best-practice recommendations — both differ from an AWS infrastructure incident.

---

**문제 8.** You want to be alerted automatically when a service limit (e.g., the number of security groups per VPC) is near its ceiling. Which is the most appropriate configuration?

A) Trusted Advisor (Service Limits) + EventBridge
B) An IAM policy
C) Macie
D) Config Aggregator only

**정답: A**

해설: Service-limit checking is Trusted Advisor's Service Limits category, and you receive it via EventBridge to connect to an SNS notification or an automatic increase request. Service-limit checking is provided even in the free scope, but the full categories and API automation presuppose Business+. B is permission control, C is sensitive-data classification, and D is multi-account configuration aggregation — all unrelated to limit alerts. For reference, the Service Quotas service can also tie some limits to CloudWatch alarms, but on the exam the representative signal for best-practice / limit recommendations is Trusted Advisor.

---

**문제 9.** You want to set an alarm on EC2 memory utilization, but there's no memory metric in the `AWS/EC2` namespace. What is the correct solution?

A) It's already in the standard metrics, so change the region
B) Install the CloudWatch Agent so the guest OS reports memory directly, and alarm on the custom metric
C) View memory with X-Ray
D) Check with Inspector

**정답: B**

해설: Memory and free disk space are guest-OS-internal information the hypervisor (Nitro) can't see, and they simply aren't in the standard metrics. You must install the CloudWatch Agent in the guest so the OS reports directly, enabling memory metrics and alarms. A is the false premise that memory exists in the standard metrics. C and D are irrelevant. This pitfall connects to the point that Compute Optimizer's memory-based right-sizing accuracy also needs the Agent for the same reason.

---

**문제 10.** A Config Rule detected a resource violating "EBS volumes must be encrypted." You want to automatically remediate (or isolate) it without human intervention. Which is the most appropriate configuration?

A) Poll with Lambda alone
B) Config Rule (detect violation) → EventBridge → SSM Automation Runbook for auto-remediation
C) Step Functions only
D) Inspector

**정답: B**

해설: The standard pattern for auto-remediation is Config detecting the violation, receiving that event via EventBridge, and having an SSM Automation Runbook execute a standardized remediation procedure (re-encrypt, isolate, tag). Config can also attach a Remediation Action (SSM Automation) directly to some managed Rules. A's Lambda polling has cursor-management, duplication, and scalability problems, C is an orchestration tool but not the standard entry point for Config remediation, and D is vulnerability assessment and irrelevant.

---

**문제 11.** A SaaS runs ECS on Fargate microservices and wants to instrument tracing in a standard, vendor-neutral way — leaving room to swap among X-Ray, Prometheus, and Jaeger later — and at the same time automatically track SLOs from traces. Which is the most appropriate combination?

A) X-Ray SDK-only instrumentation
B) Standard instrumentation with ADOT (OpenTelemetry) + SLO tracking with CloudWatch Application Signals
C) CloudWatch Agent only
D) Lambda Active Tracing

**정답: B**

해설: If you want vendor neutrality and portability, the OpenTelemetry standard is the answer, and ADOT is its AWS distribution. Once you instrument with OTel, you can swap the backend, reducing lock-in. Adding Application Signals on top automatically extracts SLIs from traces/metrics and tracks and alarms on SLOs ("meet p99<300ms 99.9% of the time") in a managed way. A is strongly AWS-dependent, C is not standard tracing instrumentation, and D is Lambda-only, not Fargate. Also remember that on ECS/EKS you run the Collector as a sidecar.

---

**문제 12.** A payment service's availability alarm was set to "ALARM when error rate exceeds 5%," but when the service died completely and requests dropped to 0, the alarm didn't fire. Also, you want to view the metrics/logs of three global regions on one screen. What is the correct response to each?

A) Lower the threshold, and view each region's console separately
B) Set missing-data handling to breaching, and use a Cross-region (Cross-account if needed) CloudWatch Dashboard
C) Switch to Anomaly Detection, and re-send the metrics to one region
D) Increase the evaluation period, and use the Service Health Dashboard

**정답: B**

해설: When requests are 0, the error-rate metric itself isn't reported, so the alarm becomes INSUFFICIENT_DATA and under the default (missing) handling doesn't transition to ALARM. Availability alarms must handle missing data as breaching so that "traffic stopped" is also caught as an outage. For global unified visibility, since metrics are region-isolated by default, a Cross-region/Cross-account Dashboard composites multiple regions' widgets into one view. A doesn't solve the no-data problem and only increases operational burden. C's re-sending creates cost and duplication problems, and Anomaly Detection hits the same limit with no data. D's Service Health is an AWS-side status page, not your own metric dashboard.

---

Supplementary note: The core of Week 9 is doing the "question → tool" mapping without wavering. Who did it (CloudTrail) / current state and compliance (Config) / health symptoms (CloudWatch Metrics) / context of that moment (Logs) / distributed causality (X-Ray) / traffic flow (Flow Logs) / the impact of an AWS-side incident on me (Health Personal + EventBridge) / best-practice recommendations (Trusted Advisor, Business+) / resource size (Compute Optimizer, memory needs the Agent) / operational tasks (Systems Manager). The recurring pitfalls on the exam are ① EC2 memory needs the Agent, ② availability alarms need missing=breaching, ③ the distinction of CloudTrail (behavior) vs. Config (state), and ④ the distinction of Health (AWS incident) vs. Trusted Advisor (my recommendation). Next week moves to the cost-optimization domain and looks at how this week's Compute Optimizer and Trusted Advisor Cost interweave with the cost tools.
