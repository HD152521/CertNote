# Day 4 - X-Ray, Trusted Advisor, Health Dashboard: When One Request Crosses Many Services, How Do You Know Who's Slow?

Splitting a system into microservices gains you something and costs you something. What you gain is independent deployment and scaling; what you lose is "the whole picture." In the monolith era, when a request was slow you could see which function was the bottleneck from a single stack trace. But once one request passes through API Gateway → Lambda → DynamoDB → an external payment API → SNS → yet another Lambda, each service's logs only know the fragment they saw. The Lambda log says "I took 200ms," the DynamoDB metric says "I was 5ms," yet the user waited 3 seconds. Where the remaining 2.8 seconds leaked, no single service knows. This problem of "stitching a fragmented truth back into one" is exactly what distributed tracing tries to solve, and in AWS that tool is **X-Ray**.

This article follows how X-Ray reconstructs the entire journey of one request into a single trace, why it samples rather than tracing every request, and what question each of X-Ray's companion operational tools answers — **Trusted Advisor** (best-practice recommendations), **Health Dashboard** (AWS-side incidents), and **Compute Optimizer** (ML-based right-sizing). The SAA exam repeatedly tests your ability to map these four tools onto four distinct questions: "latency in my code / recommendations for my environment / incidents on AWS's side / the size of my resources."

## How X-Ray Stitches Fragmented Logs Into One Journey

The core idea of distributed tracing is surprisingly simple. At the first point where a request enters the system, issue a unique **Trace ID**, and make that ID follow the request through every service it passes through. Each service records the segment it handled as "one fragment of this Trace ID." Later, when you gather the fragments carrying the same Trace ID in time order, the scattered logs are reconstructed into a single continuous journey.

In X-Ray's terminology, this fragment is a **Segment**. The entire work of one service (say, a Lambda function) from receiving a request to returning a response is a single Segment, and within it, external calls (a DynamoDB query, an HTTP request) are broken down further into **Subsegments**. So a single trace becomes a tree structure like `Segment(API GW) → Segment(Lambda) → Subsegment(DynamoDB) + Subsegment(external API)`. Each node carries a start time, duration, and error status, so "Lambda is 200ms but the external-API Subsegment inside it is 2.8 seconds" becomes visible at a glance.

> 💡 **Related theory**: This Trace ID propagation (context propagation) approach wasn't invented by X-Ray — it was formalized in the paper **Dapper** that Google published in 2010. Dapper proposed the structure "a trace is a tree of spans, and each span carries its parent span ID," and afterward Zipkin (Twitter) and Jaeger (Uber) implemented it as open source. X-Ray's Segment/Subsegment correspond to Dapper's span. In other words, X-Ray is an AWS-managed implementation of the standard distributed-tracing model, which is why it can interconvert with standard trace contexts like OpenTelemetry.

> 🔍 **Going deeper**: How does the Trace ID propagate across service boundaries? In an HTTP call, the trace context rides in the **`X-Amzn-Trace-Id`** header and passes to the next service. This header contains the fields `Root=` (trace ID), `Parent=` (parent segment ID), and `Sampled=` (whether to trace this request). That is, once the decision "will we sample this request" is made at the first entry point, that decision travels via the header to every downstream service and is applied consistently. This is why you never get the inconsistency of one service being traced and the next not. The W3C-standardized `traceparent` header (Trace Context, a W3C Recommendation) embodies the same idea, and ADOT handles both.

X-Ray's most powerful output is the **Service Map**. It synthesizes the collected traces and automatically draws a "call graph between services," where nodes are services, edges are call relationships, and each node/edge shows average latency, error rate, and request volume in color. A node glowing red is a bottleneck or the origin of errors. What matters here is that this isn't a human hand-drawing an architecture diagram — it's the "observed architecture" produced by real traffic. What gets drawn is the calls that actually happened at runtime, not the intent written in code.

> ⚠️ **Pitfall**: The scenario "a Lambda function is slow, and I want to know whether it's the function's own code or the downstream it calls (DynamoDB / external API)" almost always resolves to **X-Ray Active Tracing**. CloudWatch Metrics only tells you Lambda Duration is long; it can't distinguish which call inside is the culprit. CloudWatch Logs Insights only sees what you explicitly logged and can't automatically build the tree-shaped causal relationship. "Latency decomposition that includes downstream calls" is a capability unique to tracing.

## SDK, Daemon, ADOT — By What Path Does Trace Data Reach X-Ray

Understanding the path by which an application sends traces to X-Ray sharpens the choices among integration methods. The traditional path is the **X-Ray SDK + X-Ray daemon**. When an application is instrumented with the X-Ray SDK, it doesn't send segment data directly to the X-Ray API; it flushes it over UDP to the **X-Ray daemon** running on the same host. The daemon collects these and uploads them to the X-Ray API in batches. Why insert a daemon as an intermediate step? Because if the application synchronously called the X-Ray API for every segment, the response latency would be added straight onto the user request path. By "firing and forgetting" over UDP to a local daemon, the application doesn't wait for trace transmission, and since the daemon does the batch upload asynchronously, it doesn't affect the latency of the actual request.

> 💡 **Related theory**: This pattern of "a local agent buffers and batch-sends telemetry" is a common design across observability systems. The CloudWatch Agent, Fluent Bit, the OpenTelemetry Collector, and the Datadog Agent all share the same structure. The application throws telemetry to the local side quickly, and the sidecar/agent takes responsibility for reliable transmission (retries, batching, compression). It's a textbook case of separation of concerns, and it frees the application code from network-reliability problems.

The degree to which this path is automated differs by environment. **Lambda** simply requires you to turn on Active Tracing — the equivalent of the X-Ray daemon is built into the execution environment, so no separate installation is needed. **API Gateway and ALB** inject and propagate trace headers on their own. On **ECS, EKS, and EC2**, you have to run the X-Ray daemon yourself as a sidecar container or a host process. The future path AWS is pushing is **ADOT (AWS Distro for OpenTelemetry)** — a distribution in which AWS packages the vendor-neutral OpenTelemetry standard. Once you instrument with OTel, you can send the same data not only to X-Ray but also to Prometheus, Jaeger, and others, reducing lock-in.

> 🔍 **Going deeper**: X-Ray's newer integration, **CloudWatch Application Signals**, raises tracing one level higher. Whereas classic X-Ray is individual diagnosis of "why was this trace slow," Application Signals automatically extracts SLIs (latency, error rate, throughput) from OTel instrumentation and even tracks SLOs (e.g., "meet p99 latency < 300ms 99.9% of the time"). In other words, it automatically generates a management-level metric — the service-level objective — from the raw data that traces are. It's the answer signal for the modern SAA scenario "automatically track SLOs and alarm on violation."

## Why It Doesn't Trace Every Request — The Statistics of Sampling

By default, X-Ray does not trace every incoming request. The default sampling rule is "the first 1 request per second + 5% of everything else." At first glance it looks stingy, but there's a rationale on both the cost and the statistics sides.

The cost side is simple. In a service handling tens of thousands per second, storing and analyzing the full trace of every request (each segment's timing, metadata) becomes another gigantic data pipeline in its own right. You get the cart-before-horse situation where the cost of tracing rivals the cost of the actual service.

The statistics side is more fundamental. To grasp a system's latency distribution and error patterns, a **representative sample** is enough. You don't need to look at all 100 million requests to learn "the external API is slow at p99" — with a sufficient sample you reach the same conclusion. This is the same principle as an opinion poll capturing a trend from a sample of a few thousand rather than the entire population. So with "guarantee 1 per second (reservoir)" even low-traffic services secure a minimum of tracing, and with "5% rate" you maintain sample representativeness at high traffic while suppressing cost.

> 💡 **Related theory**: This "reservoir + rate" structure is an application of the **reservoir sampling** family of algorithms. The key insight is a dual strategy: "when traffic is low, guarantee an absolute count; when it's high, control by rate." If you used only the 5% rate, a service taking 2 requests per second would on average be almost never traced, leaving you no sample when a problem occurs. The reservoir (per-second minimum guarantee) fills this gap. Jaeger and Zipkin also offer similar adaptive sampling, and tail-based sampling — "tail latency matters, so sample slow requests more" — is the latest trend.

> ⚠️ **Pitfall**: It's easy to mistake "a specific slow request isn't visible in the traces" for a bug. With 5% sampling, 95% of requests aren't traced in the first place, so if you absolutely must capture a specific user's specific request, you have to adjust the sampling rule (FixedRate=1 on a specific URL path) or raise the rate during the debugging period. The very premise that "every request should be in the traces" is wrong.

## Trusted Advisor — Who Checks the Best Practices I Overlooked

If X-Ray looks at "why is this request slow right now," Trusted Advisor answers a completely different question — "is my entire account following AWS best practices?" Since a human can't inspect hundreds of resources one by one, AWS turns its accumulated operational experience into automated check rules and scans your account. The key is that it splits into five categories, each corresponding to a pillar of the Well-Architected Framework.

| Category | Example checks | Corresponding WA pillar |
|---|---|---|
| **Cost Optimization** | Underutilized EC2, unassociated EIPs, idle ELBs, unused RDS | Cost Optimization |
| **Performance** | Excessive security group rules, EBS throughput near its limit | Performance Efficiency |
| **Security** | Root without MFA, ports open to 0.0.0.0/0, public S3, exposed IAM keys | Security |
| **Fault Tolerance** | Single-AZ placement, no ASG, no backups, Multi-AZ not applied | Reliability |
| **Service Limits** | Service quota usage at 80% or above | (Operations) |

> ⚠️ **Pitfall**: The **free (Basic/Developer Support)** scope of Trusted Advisor is limited — only some core security items and the service-limit checks are provided free, while **the full check across all five categories and programmatic (API) access open only on the Business/Enterprise Support** plans. On the exam, "I want to fetch TA check results programmatically and automate them" presupposes Business or above. Questions about this free/paid boundary are a regular. 

> 🔍 **Going deeper**: Trusted Advisor check results can be piped to **EventBridge**, becoming a trigger for automation. For example, when "a service limit reaches 80%," TA updates that status, and an EventBridge rule catches it and fires an SNS notification or a Lambda auto-response (a limit-increase request). What matters for operational automation is that it can be used as an "event source," not merely as "a tool you eyeball in the console." When you need more sophisticated security recommendations, the role shifts to Security Hub; for cost recommendations, to Cost Explorer / Compute Optimizer.

## Health Dashboard — How Do You Learn About AWS-Side Incidents That Aren't Your Fault

There's another decisively different question: "My system is acting strange right now — is it a problem in my code or an incident on AWS's infrastructure side?" Without this distinction, an engineer can spend hours digging through perfectly fine code of their own, only to belatedly learn it was an EBS failure in a particular AZ. The **AWS Health Dashboard** answers this question.

You must distinguish two layers. The **Service Health Dashboard (now AWS Health Dashboard - Service health)** is a public page showing the global status of all AWS services — anyone can see "is S3 in us-east-1 healthy right now." In contrast, the **Personal Health Dashboard (now Account health)** shows only the events that actually affect the resources in your account. Even if S3 worldwide is fine, an alert that applies only to you — like "the hardware running the instance you use will undergo a maintenance reboot at 02:00 UTC on May 30" — appears here.

> 💡 **Related theory**: This distinction is monitoring theory's "global status vs. personalized impact." The global status page is the same information for everyone (a blackbox external view), while personal health projects incidents onto your resource topology (personalized impact). The latter is far more actionable, because it filters out "the 99% that has nothing to do with me" among thousands of AWS events and leaves only "the 1% I must respond to." From an SRE perspective, it's a textbook example of filtering that "reduces noise and leaves only signal."

> 🔍 **Going deeper**: The **AWS Health API + EventBridge** combination is the core of automated response. If you receive PHD events via EventBridge, you can detect "my instance will soon undergo a maintenance reboot" and set up automation to preemptively drain traffic to another AZ or scale out the ASG in advance. In an Organizations environment, **AWS Health Organizational View** lets you see the health events of all member accounts from the management account at once. The answer for the scenario "automatically respond to scheduled AWS-side maintenance" is Health API + EventBridge — clearly distinct from GuardDuty (threat detection), Config (configuration compliance), and Trusted Advisor (best practices).

> 📚 **Case study**: The **large-scale AWS us-east-1 outage of December 7, 2021** occurred when automatic scaling of internal network devices triggered unexpected behavior, causing internal APIs to flood (congestion). Ironically, at that time **the Service Health Dashboard itself depended on the same regional infrastructure**, so status updates were delayed, and AWS had to update the dashboard manually during the incident. After this event AWS improved the isolation of the health-information path from incident impact, and the lesson is observability's first principle: "a monitoring system must not share a failure domain with what it monitors." When the system watching itself dies along with it, you go blind at that very moment.

## Compute Optimizer — ML Answers How Big to Provision Resources

The last tool solves the "right-sizing" problem. Engineers usually provision instances generously out of anxiety — they spin up an m5.2xlarge but actually use only 10% CPU and 20% memory. This over-provisioning is one of the biggest sources of cloud waste. **Compute Optimizer** analyzes CloudWatch metric history with ML and gives concrete recommendations like "this workload can shrink to m5.large, saving $X/month with no performance degradation."

Its scope is broad — not just EC2 but EBS volumes (over-provisioned IOPS), Lambda (memory setting), Auto Scaling Groups, and even ECS on Fargate. If Trusted Advisor's cost check is a coarse signal that "there's an underutilized instance," Compute Optimizer differs in that it goes as far as prescribing "exactly which type to switch to."

> ⚠️ **Pitfall**: Compute Optimizer **needs the CloudWatch Agent to see memory metrics** (the same memory problem from Day 1 reappears here). Without the Agent, only CPU- and network-based recommendations come out, and the accuracy of memory-based right-sizing drops. Also, the quality of the recommendations depends on how representative the workload was over the observation window (14 days or more by default), so a service with an end-of-quarter surge must include that period to avoid being incorrectly downsized.

Taken together, the four tools are complementary, each answering a different question. **X-Ray** answers "why is this request slow (the causality of my code/calls)," **Trusted Advisor** answers "does my environment follow best practices (recommendations)," **Health Dashboard** answers "what happened on AWS's side (infrastructure incidents)," and **Compute Optimizer** answers "how big should I provision resources (sizing)." The exam tests your ability to identify which of these four a scenario's question belongs to. The one-line mapping — "my code = X-Ray / environment recommendations = Trusted Advisor / AWS-side incidents = Health / right-sizing = Compute Optimizer" — decides half the questions.

## Getting Hands-On With the CLI

```bash
# Turn on Lambda Active Tracing (the moment you enable it, much of the X-Ray daemon function is built in)
aws lambda update-function-configuration --function-name saa-fn \
  --tracing-config Mode=Active

# X-Ray sampling rule: guarantee 1 per second (reservoir) + 5% of the rest (rate)
aws xray create-sampling-rule --sampling-rule '{
  "RuleName":"default","Priority":1000,"FixedRate":0.05,
  "ReservoirSize":1,"ServiceName":"*","ServiceType":"*",
  "Host":"*","HTTPMethod":"*","URLPath":"*","Version":1
}'

# Trace only a specific path at 100% (a high-priority rule for a debugging period)
aws xray create-sampling-rule --sampling-rule '{
  "RuleName":"checkout-debug","Priority":1,"FixedRate":1.0,
  "ReservoirSize":5,"ServiceName":"*","ServiceType":"*",
  "Host":"*","HTTPMethod":"POST","URLPath":"/checkout","Version":1
}'

# Query Trusted Advisor check results (Business+ plan; endpoint is us-east-1)
aws support describe-trusted-advisor-checks --language en --region us-east-1

# Compute Optimizer EC2 right-sizing recommendations (after account opt-in)
aws compute-optimizer get-ec2-instance-recommendations

# Create a rule to receive Health events via EventBridge for automated response
aws events put-rule --name aws-health-events \
  --event-pattern '{"source":["aws.health"]}'
```

## Wrapping Up

X-Ray makes the Trace ID follow the request to reconstruct scattered logs into one journey, and draws the "observed architecture" with the Service Map to pinpoint bottlenecks. Not tracing every request has a rationale on both cost and statistics, and the reservoir (per-second guarantee) + rate (proportion) structure handles low and high traffic simultaneously. With the SDK+daemon or ADOT, data is sent asynchronously so it doesn't affect the latency of the actual request, and Application Signals automatically extracts even SLOs from traces. Trusted Advisor checks best practices across five categories, but the full check and the API open on Business+; the Health Dashboard distinguishes global status (Service) from your account's impact (Personal) and, with Health API + EventBridge, responds automatically to AWS-side incidents. Compute Optimizer prescribes right-sizing with ML, but memory accuracy needs the CloudWatch Agent. The one-line mapping of the four tools — my code is X-Ray, environment recommendations are Trusted Advisor, AWS incidents are Health, resource size is Compute Optimizer — is the backbone of this exam.

In the next article, we integrate the week's observability and governance services under the four questions of "who / when / what / why," and cement that mapping with scenario questions in the form that appears on the actual exam.

---

## 📝 연습 문제

**문제 1.** An application processes a request in the order API Gateway → Lambda → DynamoDB → external payment API, and the response the user perceives is a slow 3 seconds. In CloudWatch Metrics you only see that Lambda Duration is long, and it isn't decomposed into which downstream call is the bottleneck. Which is the most appropriate tool?

A) Full-scan the logs with CloudWatch Logs Insights
B) Turn on X-Ray Active Tracing to decompose per-call latency into Segments/Subsegments
C) Run Trusted Advisor's Performance check
D) Increase the Lambda memory with Compute Optimizer

**정답: B**

해설: "Decomposing latency, including downstream calls, on a per-call basis" is a capability unique to distributed tracing. X-Ray breaks DynamoDB and the external API into separate Subsegments inside the Lambda Segment and shows which span eats up the 2.8 seconds. A's Logs Insights only sees what you explicitly logged and can't automatically build the tree-shaped causal relationship. C's Trusted Advisor is a best-practice check, not runtime latency diagnosis. D's Compute Optimizer is a right-sizing tool, and if the cause is the external API, increasing memory is meaningless. Additionally, remembering that X-Ray propagates the Trace ID issued at the first entry point via the `X-Amzn-Trace-Id` header to bind everything across service boundaries into the same trace makes the scope of integration easy to understand.

---

**문제 2.** A team uses X-Ray's default sampling (1 per second + 5%), but a slow request reported by a specific user isn't visible in the traces. Which is the most accurate explanation and response?

A) It's an X-Ray bug, so restart the daemon
B) With 5% sampling most requests aren't traced, so this is normal; add a rule with a higher FixedRate on that path
C) It's because the CloudWatch Agent is missing; install the Agent
D) It's because Lambda Active Tracing is off; turn it on

**정답: B**

해설: Default sampling doesn't trace every request, for both cost and statistical reasons. With a 5% rate, 95% aren't traced in the first place, so a specific request being invisible isn't a bug. When debugging, add a high-priority rule (FixedRate=1.0) on that URL path to trace only that path at 100%. A is a wrong diagnosis. C's memory-metric problem is unrelated to sampling. D is not the cause, because part of the trace is already visible (the sampled 5%), which means Active Tracing is already on. It's good to also remember that the reservoir (guarantee of 1 per second) lets low-traffic services secure a minimum of tracing while the rate (5%) suppresses high-traffic cost — a dual strategy.

---

**문제 3.** A security team wants to programmatically (via API) collect, every day, best-practice violations like "ports open to 0.0.0.0/0, root without MFA, public S3" and put them on a dashboard. Which is the correct precondition and tool?

A) Call the Trusted Advisor API on the free Basic Support
B) Use the Trusted Advisor full check + API on the Business or Enterprise Support plan
C) Use the Health Dashboard API
D) Use the Compute Optimizer API

**정답: B**

해설: Trusted Advisor's full check across all five categories and programmatic (API) access open only on the Business/Enterprise Support plans. The free scope is limited to some core security items and the service-limit checks and is unsuitable for API automation (A is wrong). C's Health Dashboard is a tool for viewing AWS-side infrastructure incidents, not for checking your account's best-practice violations. D's Compute Optimizer is dedicated to right-sizing. If you need more sophisticated, continuous security-posture management, expanding to Security Hub is the next step.

---

**문제 4.** An operations team wants to "automatically respond (move traffic to another AZ) to scheduled AWS-side maintenance and failures that actually affect the resources in my account." Which is the most appropriate configuration?

A) Periodically refresh the public Service Health Dashboard page
B) Receive GuardDuty alerts via EventBridge
C) Receive AWS Health API (Personal Health) events via EventBridge and trigger a Lambda auto-response
D) Remediate Config Rule violations with SSM Automation

**정답: C**

해설: AWS-side events that affect your account are the domain of Personal Health (Account health), and receiving them via Health API + EventBridge lets you set up automated responses to signals like "my instance will soon undergo a maintenance reboot." A is a global public page that doesn't provide personalized impact on your resources and is unsuitable for automation. B's GuardDuty is threat detection, not an AWS infrastructure-maintenance event. D's Config is a matter of your resources' configuration compliance, not an AWS-side incident. The case where the Service Health Dashboard itself depended on the same infrastructure and had delayed updates during the 2021 us-east-1 outage nicely illustrates the value of a "personalized Health signal."

---

**문제 5.** A cost review revealed that 50 m5.2xlarge instances are over-provisioned at 12% average CPU and 18% memory. You want a prescription that goes as far as "exactly which instance type to shrink to for cost savings with no performance degradation." Also, how do you improve the accuracy of memory-based recommendations?

A) Trusted Advisor Cost check alone is enough
B) Use Compute Optimizer, and install the CloudWatch Agent for accurate memory-based recommendations
C) Right-size with X-Ray
D) View instance sizes with the Health Dashboard

**정답: B**

해설: Trusted Advisor's cost check only gives a coarse signal that "there's an underutilized instance" (A lacks a prescription), while Compute Optimizer gives a concrete prescription with ML: "switch to this type to save $X/month with no performance degradation." However, memory metrics are guest-OS-internal information, so without the CloudWatch Agent they aren't collected and memory-based right-sizing accuracy drops (the same principle as the memory-metric pitfall from Day 1). C's X-Ray is a latency-diagnosis tool, not resource sizing. D is irrelevant. A practical point is that the observation window must be representative of the workload (including the end-of-quarter surge) to avoid an incorrect downsize.

---

**문제 6.** A SaaS runs microservices on ECS on Fargate and wants to instrument tracing in a standard, vendor-neutral way, leaving room to send the same data to Prometheus/Jaeger as well as X-Ray in the future. Which is the most appropriate approach?

A) Instrument directly with the X-Ray SDK only
B) Instrument with the OTel standard using ADOT (AWS Distro for OpenTelemetry) and export to X-Ray
C) Install only the CloudWatch Agent
D) Turn on Lambda Active Tracing

**정답: B**

해설: If you want vendor neutrality and portability, the OpenTelemetry standard is the answer, and ADOT is AWS's packaged distribution of it. Once you instrument with OTel, you can swap the backend (X-Ray, Prometheus, Jaeger, etc.), reducing lock-in. A's X-Ray SDK-only instrumentation is strongly AWS-dependent. C's CloudWatch Agent is for metric/log collection, not the standard for distributed-tracing instrumentation. D is a Lambda-only feature, not for Fargate. Remembering that on ECS/EKS you have to run a daemon or Collector as a sidecar helps organize the integration structure.

---

**문제 7.** An operations team wants to automatically extract SLIs (latency, error rate, throughput) from traces collected by X-Ray, track SLOs ("meet p99 < 300ms 99.9% of the time"), and alarm on violation. To handle this in a managed way without hand-building a separate dashboard, what should they use?

A) Manually combine CloudWatch Composite Alarms
B) Use CloudWatch Application Signals
C) Look at the Trusted Advisor Performance check
D) Schedule Logs Insights queries

**정답: B**

해설: CloudWatch Application Signals automatically extracts SLIs from OTel/X-Ray instrumentation and provides SLO tracking and alarming in a managed way, automatically generating a higher-level metric — the service-level objective — from the raw data that traces are. A is a manual threshold combination, so you'd have to implement the SLO's "attainment ratio (99.9%)" concept yourself, which is cumbersome. C is a best-practice check, not SLO tracking. D is possible with log queries but is far from managed SLO tracking and takes a lot of hands-on effort. Remember that Application Signals is the answer signal for the modern scenario "automatically track SLOs."

---

Supplementary note: Distinguish the four tools by "the kind of question." Runtime causality (why is it slow) is X-Ray, best-practice compliance is Trusted Advisor (full check and API on Business+), the impact of AWS incidents on my account is Health (Personal) + EventBridge, and resource size is Compute Optimizer (memory needs the Agent). For X-Ray, the recent exam points are Trace ID propagation, the Segment/Subsegment tree, reservoir+rate sampling, and the Service Map, plus Application Signals (SLO) and ADOT (standard instrumentation).
