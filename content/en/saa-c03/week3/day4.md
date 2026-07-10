# Day 4 - Auto Scaling Groups: Control Theory, Predictive Scaling, and the Art of Graceful Shutdown

The idea of auto scaling sounds simple. When CPU is high, add more servers; when it's low, remove some. But once you actually implement it, unexpected problems surface. During the two minutes it takes a new instance to come up, CPU pegs at 100% and triggers another scale-out. An in-flight order on a terminating instance vanishes. Users flood in every morning at 9:00, but Target Tracking only reacts after CPU has already climbed.

This article covers how AWS Auto Scaling Group (ASG) solves these problems — including its internal design principles and its grounding in control theory. Once you understand the mathematical differences between the four scaling policies, the usage patterns of Lifecycle Hooks, the economics of Warm Pools, and the ML model behind Predictive Scaling, you can apply them directly to real production designs, not just exam scenarios.

## The Historical Background of ASG: Why Auto Scaling Was Needed

Before 2008, a web service had to keep servers running at peak capacity at all times to handle peak load. When Netflix was still a DVD-rental website, it maintained the same number of servers during weekday afternoons just to serve Friday-evening traffic. This was waste.

The 2009 launch of AWS Auto Scaling changed the paradigm. You could now adjust the instance count automatically in response to traffic. But early Auto Scaling was crude: "when a CloudWatch alarm fires, add an instance." That was the beginning of the Simple Scaling Policy.

Over time, the limits of Simple Scaling became clear. An alarm fires and you add an instance; for the three minutes the new instance takes to come up, CPU is still high, so another alarm fires and you add yet another instance — an overreaction. To fix this, Step Scaling, Target Tracking, Scheduled Scaling, and Predictive Scaling were added in turn.

## ASG Components: Each Part of the Blueprint

An ASG is a system assembled from several components. You need to understand what each one does.

**Launch Template**: the blueprint for how to launch an instance. It includes the AMI ID, instance type, key pair, security groups, IAM instance profile, User Data, and EBS volume configuration. As the successor to the Launch Configuration (deprecated), it supports versioning, so beyond `$Latest` or `$Default` you can pin a specific version. With Instance Refresh you can roll out a new Launch Template version gradually.

**Min / Max / Desired**: Min is the minimum instance count to always maintain (guaranteed even during failures), Max is the ceiling you'll never exceed (cost protection), and Desired is the current target instance count. Scaling policies adjust Desired. Desired only ever moves between Min and Max.

**AZ distribution**: the ASG spreads instances evenly across the subnets you specify. Specify three AZs with one subnet each, and it tries to keep Desired/3 instances per AZ. If one AZ dies, it moves instances to the remaining AZs (Rebalancing).

**Health Check**: the criterion for judging an instance's health.

```
[ ASG Health Check types and differences ]

EC2 Health Check (default):
- AWS monitors the physical host status
- StatusCheckFailed_System or StatusCheckFailed_Instance
- Judged Healthy even if the instance is alive but the app is dead

ELB Health Check:
- Reflects ALB/NLB health check results into the ASG
- Marks Unhealthy on app-level health check failure (HTTP 200, etc.)
- Detects the "instance is up but the app returns 500 errors" case too

Recommended: enable both (EC2 + ELB)
Health Check Grace Period: the warm-up window before a new instance
  starts receiving ELB health checks (default 300s). During this window
  the instance is not judged Unhealthy.
```

**Cooldown**: the wait time after a scaling action before the next action. It applies only to Simple Scaling (Target Tracking and Step Scaling have their own warm-up mechanisms). Default 300s.

> 💡 **Related theory**: An ASG's balanced instance distribution (Rebalancing) ties into **load-balancing theory** from distributed systems. The ASG attempts a rebalance when the instance-count difference between AZs is 1 or more. When rebalancing, it first launches the new instance and only then terminates the instance in the over-provisioned AZ (start before stop). This is a "start before stop" strategy that keeps balance while preserving availability.

## The Four Scaling Policies: Understanding Them Through Control Theory

A scaling policy is the algorithm for how you close the gap between the "current state" and the "target state." Viewed through the lens of control theory, each policy's character becomes clear.

### Target Tracking Scaling: Shades of PID Control

With Target Tracking, you set a target value — like "keep average CPU at 50%" — and the ASG automatically adjusts the instance count. This is conceptually similar to **proportional-integral control (PI Control)** from control theory. It decides scaling strength by looking at how far the current value has strayed from the target (the error) and how long the error has persisted (the integral).

Target Tracking scales in more conservatively than it scales out. Even after the error drops below the target, it waits at least 15 minutes (the default) before scaling in. If a sudden spike disappears, cutting instances too quickly and then getting hit by returning traffic is a bad outcome.

Supported metrics:
- `ASGAverageCPUUtilization`: average CPU utilization
- `ASGAverageNetworkIn` / `ASGAverageNetworkOut`: average network traffic
- `ALBRequestCountPerTarget`: request count per target from the ALB

`ALBRequestCountPerTarget` is the most practical Target Tracking metric, because it measures actual request load directly rather than CPU. CPU can rise from background work unrelated to request count (GC, indexing, and so on), whereas request count reflects traffic load purely.

> 🔍 **Going deeper**: Target Tracking Scaling internally and automatically creates two CloudWatch alarms — one for scale-out (above target) and one for scale-in (below target × 0.9). The reason it only scales in when the value drops well below 90% of the target is to prevent oscillation. You should not modify these auto-generated alarms directly.

### Step Scaling: A Staircase Response

Step Scaling triggers scaling of different magnitudes depending on the severity of the alarm.

```
CPU 60-70%: +1 instance
CPU 70-80%: +3 instances
CPU 80%+:   +5 instances (immediately, can overlap even during warm-up)
```

Use Step Scaling when you need finer control than Target Tracking. For example, on a workload where request-queue depth matters more than CPU, you can configure a large scale-out when the queue exceeds 100 and an emergency bulk scale-out when it exceeds 1,000.

Step Scaling can execute multiple steps in an overlapping fashion without a Cooldown (aggregation). It's the second choice when Target Tracking doesn't fit.

### Scheduled Scaling: Predictable Patterns

For traffic with a predictable pattern, you schedule scaling in advance. You specify times with a cron expression.

```bash
# Scale to 10 instances every weekday (Mon-Fri) at 8:30 AM
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name app-asg \
  --scheduled-action-name morning-scale-out \
  --recurrence "30 8 * * 1-5" \
  --min-size 5 --desired-capacity 10 --max-size 20

# Scale down to minimum every day at 6 PM
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name app-asg \
  --scheduled-action-name evening-scale-in \
  --recurrence "0 18 * * 1-5" \
  --min-size 2 --desired-capacity 2 --max-size 20
```

Scheduled Scaling is used in combination with Target Tracking. Raise the minimum ahead of time at 8 AM, and let Target Tracking handle the fine adjustments from there.

### Predictive Scaling: ML-Based Proactive Scaling

Predictive Scaling (GA in 2021) uses ML to analyze the metric patterns of the past two weeks, forecasts future load, and scales out ahead of the load arriving. It's "proactive," not "reactive."

It's effective on workloads with a weekly or daily pattern. For a business app whose traffic always doubles at 9 AM on Monday, Predictive Scaling adds instances ahead of time at 8:45. Target Tracking has a 2-3 minute reaction lag, because it only responds after traffic actually rises and CPU climbs.

> 💡 **Related theory**: The internal model of Predictive Scaling is a **time-series forecasting** algorithm. AWS doesn't disclose it, but it's presumed to be a decomposition model that separates daily/weekly seasonality and trend, or a Prophet-like model (the Facebook open-source project). The key point is that training requires at least two weeks of data, so for a new service the forecasts aren't accurate during the first two weeks.

> 📚 **Case study**: At AWS re:Invent 2020, Amazon.com's Prime Day preparation was presented as a case study. Using Predictive Scaling, they trained on past Prime Day patterns and automatically added thousands of instances starting tens of minutes before the day's traffic surge. Response time improved 15% versus using reactive scaling alone.

## Lifecycle Hooks: Controlling an Instance's Beginning and End

Normally an ASG puts an instance into service the moment it launches and removes it the moment a termination decision is made. Lifecycle Hooks provide intervention points in this process.

```
[ ASG instance lifecycle ]

EC2:Pending
    ↓ [Pending:Wait] ← Lifecycle Hook can intervene
EC2:Pending:Wait
    ↓ (processing complete or timeout)
EC2:Pending:Proceed
    ↓
EC2:InService ← starts receiving traffic

EC2:Terminating
    ↓ [Terminating:Wait] ← Lifecycle Hook can intervene
EC2:Terminating:Wait
    ↓ (processing complete or timeout)
EC2:Terminating:Proceed
    ↓
EC2:Terminated
```

**Launch-time (Pending:Wait) usage patterns**:
1. Install additional software via SSM
2. Fetch application config files from Parameter Store and apply them
3. Cache warm-up (Redis, local cache)
4. Register with deployment tooling
5. Signal `complete-lifecycle-action SUCCESS` once ready

**Termination-time (Terminating:Wait) usage patterns**:
1. Wait for in-flight requests to complete (separate from ELB Deregistration Delay)
2. Save in-memory state to S3 (checkpoint)
3. Upload log files to CloudWatch Logs
4. Collect debugging data
5. Send a deregistration notification

Lifecycle Hook notifications can be sent to EventBridge, SNS, or SQS. Wiring them to Lambda for automatic handling is a common pattern.

> 📚 **Case study**: Discord uses Lifecycle Hooks on its real-time message-processing servers. When a server is terminating, the Terminating:Wait hook migrates the WebSocket connections it's currently handling to another server, and only sends the termination signal once all connections have moved. This lets a server be swapped out without users experiencing an abrupt disconnect.

## Warm Pool: A Revolution in Scaling Latency

Consider how long it takes for a new EC2 instance to become fully serviceable.

```
EC2 boot time: 30-60s
OS startup from AMI: 60-120s
User Data execution (software install, configuration): 2-5 min
Application startup (JVM, ML model load): 1-3 min
ELB Health Check pass: 30-90s
─────────────────────────────────────────
Total ready time: 5-10 min
```

Those 5-10 minutes are the problem. During a sudden traffic surge, CPU is already at 100% and you have to survive 5-10 minutes until a new instance comes up.

**Warm Pool** keeps these prepared instances waiting in advance. An instance that is fully initialized but not receiving traffic (Stopped or Running) is held in the pool. When a scale-out signal arrives, it's pulled from the Warm Pool immediately and transitioned to InService. Ready time shrinks to 30-60 seconds.

Warm Pool instance states:
- `Stopped`: launch complete, stopped. No EC2 cost (EBS cost only). 30-60s to restart.
- `Running`: launch complete, running (just no traffic). Incurs EC2 cost. Available instantly.
- `Hibernated`: RAM state preserved. Even faster resume.

> 🔍 **Going deeper**: When a Warm Pool instance is in the Stopped state, the ASG tracks it as `Warmed:Stopped`. On a scale-out signal, the ASG Starts the instance, and if a Lifecycle Hook exists it goes through `Pending:Wait` before reaching InService. It's far faster than launching a brand-new instance, but if the Lifecycle Hook performs long work, that adds latency. The optimal design is to complete the heavy initialization ahead of time in the Warm Pool and leave the Lifecycle Hook to do only short work (fetching config files, registering health checks, and so on).

## Termination Policy: Which Instance to Terminate First

When scaling in, deciding which instance to terminate matters too.

| Policy | Behavior |
|--------|----------|
| Default | AZ balance → oldest Launch Config/Template → closest to the billing hour |
| OldestInstance | Terminate the oldest instance (natural replacement with new types) |
| NewestInstance | Terminate the newest instance (to quickly roll back a new-configuration deployment) |
| OldestLaunchConfiguration | Preferentially terminate instances using an older LC |
| ClosestToNextInstanceHour | Terminate the instance closest to its next billing-hour boundary (cost optimization) |

**Logic of the Default Policy**:
1. Terminate in the AZ with the most instances (AZ balance)
2. Within that AZ, the instance using the oldest Launch Configuration/Template
3. If tied, the instance closest to its next billing-hour boundary

Since EC2 bills per second, ClosestToNextInstanceHour has little significance now. It's still useful, however, when optimizing utilization of RIs billed at the On-Demand rate.

**Scale-in Protection**: excludes specific instances from the ASG's scale-in targets. Apply it temporarily to instances doing stateful work (multi-step transactions, game session hosting).

## Mixed Instances Policy: Balancing Spot + On-Demand

A Mixed Instances Policy mixes multiple instance types and On-Demand/Spot within a single ASG.

```json
{
  "MixedInstancesPolicy": {
    "LaunchTemplate": {
      "LaunchTemplateSpecification": {
        "LaunchTemplateName": "app-lt",
        "Version": "$Latest"
      },
      "Overrides": [
        {"InstanceType": "c6i.xlarge"},
        {"InstanceType": "c6a.xlarge"},
        {"InstanceType": "c7g.xlarge"},
        {"InstanceType": "m6i.xlarge"}
      ]
    },
    "InstancesDistribution": {
      "OnDemandPercentageAboveBaseCapacity": 20,
      "SpotAllocationStrategy": "capacity-optimized",
      "OnDemandBaseCapacity": 2
    }
  }
}
```

What this configuration means: at least 2 instances are On-Demand (baseline stability), 20% of the rest are On-Demand and 80% are Spot. Spot is chosen from among the four instance types using the `capacity-optimized` strategy (minimizing interruption frequency).

**Capacity Rebalancing**: when a Spot interruption warning arrives, the ASG automatically launches a new Spot instance first and then terminates the instance targeted for interruption. It protects availability while keeping the instance count steady.

> 💡 **Related theory**: Allowing multiple instance types in a Mixed Instances Policy is similar to diversified investing in **portfolio theory**. If you depend on a single instance type only, interruptions cluster when that type's Spot availability is low. Spread across several types, and even if Spot pressure hits one type, the others cover it. AWS calls this "instance type diversification."

## Instance Refresh: Zero-Downtime AMI Updates

This feature gradually replaces existing instances with a new AMI or a new Launch Template version. The deployment strategy follows a Rolling approach.

```bash
# Start Instance Refresh
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name app-asg \
  --preferences '{
    "MinHealthyPercentage": 80,
    "InstanceWarmup": 120
  }'
```

`MinHealthyPercentage: 80` means that at least 80% of instances stay Healthy at all times, even during the replacement. It replaces roughly 2 out of 10 instances at a time, waiting for each batch to stabilize. Building an AMI in a CI/CD pipeline and auto-deploying it with Instance Refresh has become the standard for EC2-based deployments.

> ⚠️ **Pitfall**: Instance Refresh terminates an old instance only after the new one becomes Healthy. But if a Lifecycle Hook's Terminating:Wait is present, it waits for the hook to process before terminating. If hook processing is slow, the total Instance Refresh time can become very long. During an Instance Refresh, consider setting the Lifecycle Hook timeout short, or disabling the hook itself.

## Comparing Auto Scaling Across Other Clouds

| Feature | AWS ASG | GCP Managed Instance Groups | Azure VMSS |
|---------|---------|----------------------------|------------|
| Policy types | Target Tracking, Step, Scheduled, Predictive | Target Utilization, Scaling Policy | Metric-based, Schedule |
| Predictive Scaling | Yes (ML-based) | Yes (Predictive Autoscaling) | Limited |
| Lifecycle Hook | Yes | Limited (startup/shutdown scripts) | Yes (Extension hooks) |
| Warm Pool | Yes | Yes (Warm Pool GCE) | No (must implement yourself) |
| Spot integration | Mixed Instances Policy | Preemptible VM ratio setting | Azure Spot VM ratio |
| Instance type diversification | Yes (Overrides) | Yes (Instance Templates) | Yes (VM Profiles) |

GCP's Managed Instance Group has a structure very similar to AWS ASG. Azure VMSS (Virtual Machine Scale Sets) has no Warm Pool, so scale-out latency can be long.

## Standard Architecture Pattern

```
[ Highly available 3-tier web architecture + ASG ]

Internet → ALB (HTTPS, Multi-AZ)
              ↓
         ASG (Web Tier)
         - LT: ami-xxx, c6i.large
         - Min=2, Max=20, Desired=4
         - AZ: ap-ne-2a, 2b, 2c
         - Health: EC2 + ELB
         - Policy: Target Tracking (ALBRequestCountPerTarget=1000)
         - Lifecycle: Pending:Wait (120s) → load SSM config
         - Warm Pool: 2 instances (Stopped)
              ↓
         Internal ALB
              ↓
         ASG (App Tier, Spot 80% + OD 20%)
         - Mixed Instances (c6i.xlarge, c6a.xlarge, m6i.xlarge)
         - Policy: Target Tracking (CPU 60%)
         - Capacity Rebalancing: enabled
              ↓
         RDS Multi-AZ (MySQL)
```

## Cementing It with the CLI

```bash
# Create a Launch Template (enforce IMDSv2)
aws ec2 create-launch-template \
  --launch-template-name app-lt-v2 \
  --launch-template-data '{
    "ImageId": "ami-0c55b159cbfafe1f0",
    "InstanceType": "c6i.large",
    "IamInstanceProfile": {"Name": "app-instance-profile"},
    "MetadataOptions": {"HttpTokens": "required", "HttpEndpoint": "enabled"},
    "UserData": "base64-encoded-script"
  }'

# Create an ASG (Multi-AZ, ELB Health Check)
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name prod-asg \
  --launch-template "LaunchTemplateName=app-lt-v2,Version=\$Latest" \
  --min-size 2 --max-size 20 --desired-capacity 4 \
  --vpc-zone-identifier "subnet-priv-a,subnet-priv-b,subnet-priv-c" \
  --target-group-arns arn:aws:elasticloadbalancing:...:targetgroup/app-tg/xxx \
  --health-check-type ELB \
  --health-check-grace-period 120

# Target Tracking (based on ALB request count)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name prod-asg \
  --policy-name alb-request-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget",
      "ResourceLabel": "app/prod-alb/xxx/targetgroup/app-tg/yyy"
    },
    "TargetValue": 1000.0,
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'

# Lifecycle Hook (upload logs on termination)
aws autoscaling put-lifecycle-hook \
  --auto-scaling-group-name prod-asg \
  --lifecycle-hook-name graceful-terminate \
  --lifecycle-transition autoscaling:EC2_INSTANCE_TERMINATING \
  --heartbeat-timeout 120 \
  --default-result CONTINUE \
  --notification-target-arn arn:aws:sqs:...:lifecycle-queue \
  --role-arn arn:aws:iam::...:role/asg-lifecycle-role

# Warm Pool configuration (keep up to 3 Stopped instances waiting)
aws autoscaling put-warm-pool \
  --auto-scaling-group-name prod-asg \
  --pool-state Stopped \
  --min-size 1 \
  --max-group-prepared-capacity 3

# Enable Predictive Scaling
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name prod-asg \
  --policy-name predictive-cpu \
  --policy-type PredictiveScaling \
  --predictive-scaling-configuration '{
    "MetricSpecifications": [{
      "TargetValue": 50.0,
      "PredefinedMetricPairSpecification": {
        "PredefinedMetricType": "ASGCPUUtilization"
      }
    }],
    "Mode": "ForecastAndScale",
    "SchedulingBufferTime": 300
  }'
```

## Wrapping Up

An ASG is not simply "add servers when CPU is high." Control-theory-based Target Tracking, staircase-response Step Scaling, forecast-based Predictive Scaling, and time-based Scheduled Scaling each solve a different problem. And Lifecycle Hooks let you insert business logic between launch and termination to enable graceful operations.

In practice, most people use Target Tracking as the baseline and add Predictive or Scheduled when there's a predictable pattern. Shortening scaling response time with a Warm Pool and optimizing cost with a Mixed Instances Policy is the current best practice.

---

## 📝 연습 문제

**문제 1.** An e-commerce platform has a pattern where traffic triples every day at 9 AM and returns to normal at 9 PM. It also experiences sudden additional traffic spikes. What is the most suitable scaling strategy?

A) Use Target Tracking only
B) Use Scheduled Scaling only
C) Combine Scheduled Scaling + Target Tracking
D) Simple Scaling + 300s Cooldown

**정답: C**
해설: Scheduled Scaling raises Min/Desired ahead of time at 9 AM to handle the predictable traffic, and Target Tracking handles the unexpected spikes in real time. Using Target Tracking alone means scale-out only starts after traffic has risen and CPU has climbed, causing performance degradation for the first several minutes. Using Scheduled alone can't respond flexibly to spikes. Simple Scaling reacts slowly because of the Cooldown.

---

**문제 2.** An ASG runs behind an ALB. On an instance, the application stops responding (app crash), but the EC2 instance itself is running normally. What configuration is needed for the ASG to detect this instance as Unhealthy and replace it?

A) Strengthen the EC2 Health Check (shorten the StatusCheck interval)
B) Enable the ELB Health Check type on the ASG
C) Collect app metrics with the CloudWatch Agent
D) Enable Auto Recovery (aws:autorecover)

**정답: B**
해설: The EC2 Health Check only verifies the instance's physical/OS status. Even if the app crashes, the EC2 instance itself stays in the Running state and is judged Healthy. The ELB Health Check has the ALB call an endpoint like `/health` to judge health at the app level, and passes that result to the ASG. Setting `health-check-type ELB` on the ASG lets it receive the ALB's Unhealthy verdict, terminate the instance, and launch a new one.

---

**문제 3.** You run a JVM-based application server on an ASG. When a new instance starts, performance is low for 5 minutes until JIT compilation finishes. How do you keep the ALB from sending a lot of traffic to that instance during this period?

A) Set the Health Check Grace Period to 300 seconds
B) Set the ASG Health Check to the EC2 type
C) Set Slow Start to 300 seconds on the ALB Target Group
D) Wait 300 seconds with a Lifecycle Hook Pending:Wait

**정답: C**
해설: Slow Start is an ALB Target Group-level feature that gradually ramps up traffic sent to a newly registered target. During the configured window, the new instance receives less traffic than existing instances. The Health Check Grace Period is the period during which the ASG ignores ELB health check results — it doesn't reduce traffic. Waiting 300 seconds with a Lifecycle Hook Pending:Wait means the instance receives no traffic at all during that time, defeating the purpose of scaling.

---

**문제 4.** You use large-scale GPU instances in an ASG for an ML training batch job. To optimize cost, you want to run at an 80% Spot / 20% On-Demand ratio. How do you maximize availability during Spot interruptions?

A) Mixed Instances Policy + `lowest-price` Spot strategy + Capacity Rebalancing
B) Mixed Instances Policy + `capacity-optimized` Spot strategy + Capacity Rebalancing
C) Two separate ASGs (Spot-only + On-Demand-only)
D) Use EC2 Fleet for Spot only and manage On-Demand separately

**정답: B**
해설: A Mixed Instances Policy manages the On-Demand baseline (20%) and Spot (80%) in a single ASG. The `capacity-optimized` strategy picks the Spot pool with the most spare capacity in AWS right now, minimizing interruption frequency (not the lowest cost, but availability first). `lowest-price` concentrates on the cheapest pool, raising interruption risk. Capacity Rebalancing preserves continuity by launching a replacement Spot instance ahead of time when an interruption warning is received.

---

**문제 5.** When an ASG instance terminates, you want to put the in-memory in-progress order data back onto SQS to prevent loss. How do you implement this?

A) Write a shutdown script in User Data
B) Set the ASG Termination Policy to OldestInstance
C) ASG Lifecycle Hook (Terminating:Wait) + EventBridge + Lambda
D) Detect instance termination with CloudWatch Events, then invoke Lambda

**정답: C**
해설: The Lifecycle Hook's `EC2_INSTANCE_TERMINATING` event pauses the instance in the `Terminating:Wait` state before it terminates. You receive this event through EventBridge to trigger a Lambda, or send a notification to an SQS queue for an in-instance Agent to handle. The in-instance Agent puts the in-progress orders onto SQS and calls `complete-lifecycle-action SUCCESS`. The instance then terminates. A shutdown script in User Data runs at OS shutdown, but it can run later than ASG scale-in and has a time limit.

---

**문제 6.** During scale-out, it takes 7 minutes for a new instance to become fully Ready. What is the most effective AWS feature for reducing this 7-minute gap during a traffic surge?

A) Reduce the Health Check Grace Period to 0
B) Upgrade to a faster instance type
C) Configure an ASG Warm Pool to keep pre-initialized instances waiting
D) Disable ALB Slow Start

**정답: C**
해설: A Warm Pool keeps fully initialized instances waiting in advance in the Stopped (or Running) state. On a scale-out signal, you only need to Start them, so the 7 minutes shrinks to 30-60 seconds. Reducing the Health Check Grace Period to 0 sends traffic straight to an instance that's still initializing, causing errors instead. Upgrading the instance helps somewhat but doesn't address the root cause of the 7 minutes (application initialization).
