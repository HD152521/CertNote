# Day 4 - Elastic Beanstalk: AWS's Most Friendly PaaS

The typical scene when a startup first adopts AWS: two developers, code in Flask or Express, "We have to launch this somehow, but what's ALB, what's ASG, what's IAM Role?" To solve this situation, AWS launched **Elastic Beanstalk** in January 2011. The promise: "Just zip and upload your code, we'll automatically create EC2, ELB, ASG, CloudWatch — everything." 

On DVA-C02, Beanstalk joins ECS, Lambda, App Runner as a "**when to choose which compute**" scenario axis. Especially the six deployment strategies' trade-offs, `.ebextensions` vs `.platform` distinction, and the RDS-inside-environment trap are consistent high-frequency exam points. This article begins from Beanstalk's internal structure — actually CloudFormation abstraction on top — through how each deployment strategy actually works.

## The Problem Beanstalk Aimed to Solve: Heroku Experience on AWS

Beanstalk launched in 2011 when Heroku (2007 startup, 2010 Salesforce acquisition) was setting PaaS market standards. `git push heroku main` deploying code to production in one line was revolutionary then. AWS brought that experience to its platform while claiming "deeper AWS infrastructure access than Heroku" as differentiation.

Beanstalk's promise in one line: "Mind your code only, EC2/ALB/ASG/CloudWatch/VPC we handle." But that promise's trade-off is the key — when abstraction leaks (special nginx tuning, specific OS package needed), Beanstalk suddenly feels limiting.

> 💡 **Related theory**: Whether PaaS abstraction truly works relates directly to "Joel Spolsky's Law of Leaky Abstractions" (2002). "Every nontrivial abstraction leaks somewhat," the thesis goes. Beanstalk hides EC2/ALB complexity, but mid-operation when special needs emerge, you must touch underlying layers and the abstraction breaks. `.ebextensions` and `.platform` are precisely "escape hatches" filling abstraction cracks.

> 🔍 **Going deeper**: Internally, Beanstalk **creates CloudFormation stacks**. One `eb create` generates CloudFormation template defining EC2, ALB, ASG, Security Group, IAM Role, CloudWatch Alarm — that template deploys. Beanstalk environment = CloudFormation stack's friendly UI. This fact explains ① what deletes when environment dies ② why drift detection works ③ why Beanstalk resources import into CFN.

## Two Environment Types: Web vs Worker

Beanstalk environments come in two kinds. Both exist in same application, usually together.

### Web Server Environment

```
[Route 53 or Beanstalk DNS]
       │
       ▼
[Application Load Balancer]
       │
       ├── [EC2-1 (web)] ┐
       ├── [EC2-2 (web)] ├── Auto Scaling Group
       └── [EC2-N (web)] ┘
                │
                ▼
        [RDS (separate recommended)]
```

### Worker Environment

```
[SQS Queue]
   │ (message arrives)
   ▼
[SQS Daemon on EC2]
   │ (converts message to HTTP POST)
   ▼
[Application container (port 80)]
```

> 🔍 **Going deeper**: Worker environment's magic is a separate process called **SQS Daemon**. Pre-installed on EC2, this daemon polls SQS queue, converts arriving message to application HTTP endpoint (default `/`) as POST. Application is just HTTP server; no SQS SDK needed. Pattern unifies event and HTTP handling in same codebase. Heroku's worker dyno follows same philosophy.

```yaml
# cron.yaml (Worker environment scheduled jobs)
version: 1
cron:
  - name: "daily-report"
    url: "/jobs/daily-report"
    schedule: "0 0 * * *"
  - name: "hourly-cleanup"
    url: "/jobs/cleanup"
    schedule: "0 * * * *"
```

SQS Daemon reads cron.yaml, auto-creates schedule, at time inserts message into its queue. Message flows back to application HTTP for processing. Schedule work without external cron service — clean pattern.

> ⚠️ **Trap**: Worker has no ALB. SQS Daemon → EC2 local application direct HTTP call. External HTTP exposure needs separate Web Server Environment. When "Worker needs public endpoint" appears on exam, it's almost always a trap — needs separate Web environment.

## Six Deployment Strategies: Exam Standard Table

Beanstalk's deployment strategy table appears on almost every exam. Memorizing each strategy's "downtime / deploy speed / cost / rollback speed" catches 70%+ of scenario problems.

| Strategy | Downtime | New Instances | Extra Cost | Rollback Time | Best For |
|----------|---------|-------------|----------|----------|----------|
| **All at once** | Yes (minutes) | None | None | Redeploy (slow) | Dev/budget |
| **Rolling** | None | None | None | Redeploy | General production |
| **Rolling with additional batch** | None | Some | +Cost | Redeploy | Capacity maintenance |
| **Immutable** | None | New ASG entirely | 2x (temporary) | Fast (ASG delete) | Safe production |
| **Traffic Splitting** (Canary) | None | New ASG | 2x (temporary) | Auto (CloudWatch) | Gradual validation |
| **Blue/Green** (manual) | None | New environment | 2x | Instant (URL swap) | Complete separation |

> 💡 **Scenario Quick Map**:
> - "Minimum cost + simple" → All at once
> - "General production" → Rolling
> - "Capacity never drops" → Rolling with additional batch
> - "Production + instant rollback" → Immutable
> - "10% first, auto-validate" → Traffic Splitting
> - "Completely separated + one-swap" → Blue/Green

### Immutable Operation Flow

```
Initially:   [Existing ASG]
             [EC2 v1] [EC2 v1] [EC2 v1]   ← 100% traffic

Step 1:      [Existing ASG]              [New Temp ASG]
             [EC2 v1] [EC2 v1] [EC2 v1]   [EC2 v2] (1) ← Await health check

Step 2:                                   [Expand new ASG]
             [EC2 v1]...                  [EC2 v2] [EC2 v2] [EC2 v2]

Step 3:                                   [Temp → Permanent swap]
                                          [EC2 v2] [EC2 v2] [EC2 v2] ← 100% traffic

Step 4:      Delete existing ASG
                                          [EC2 v2] [EC2 v2] [EC2 v2]
```

> 🔍 **Going deeper**: Immutable's core is "step 1: boot v2 instance(s) first, must pass health check before proceeding." If v2 fails startup, new ASG deletes immediately, existing untouched — production unaffected. Rolling's critical difference: stops existing first, new on same slot, if new fails that slot's capacity vanishes.

### Traffic Splitting (Canary) Operation

```
Initially:    [ASG v1: 3 instances]                     100% traffic
              (weighted: v1 = 100%)

Step 1:       [ASG v1: 3] [ASG v2: 3]                  v1 = 90%, v2 = 10%
              (monitor metrics N minutes)

Success:      [ASG v1: deleted]
              [ASG v2: 3]                               100% traffic

Failure:      [ASG v2: deleted]                         Auto rollback
              [ASG v1: 3]                               100% traffic
```

> ⚠️ **Trap**: Traffic Splitting uses ALB **weighted target group** feature. This doesn't work with Classic Load Balancer or Network Load Balancer. When "Beanstalk + Traffic Splitting" appears on exam, ALB is implicit prerequisite.

## .ebextensions vs .platform: Two Ways to Patch Abstraction Cracks

Customizing EC2 inside Beanstalk environment has two ways. Recommended approach changed over time.

### .ebextensions (Traditional, Amazon Linux 1 Based)

```yaml
# .ebextensions/01_packages.config
packages:
  yum:
    git: []
    jq: []
    htop: []

files:
  "/etc/nginx/conf.d/custom.conf":
    mode: "000644"
    owner: root
    group: root
    content: |
      client_max_body_size 50M;

commands:
  01_npm_install:
    command: "npm install -g pm2"

container_commands:
  01_migrate:
    command: "python manage.py migrate"
    leader_only: true   # Run on one ASG instance only (DB migration etc.)

option_settings:
  aws:elasticbeanstalk:application:environment:
    DJANGO_SETTINGS: production
  aws:autoscaling:asg:
    MinSize: '2'
    MaxSize: '10'
```

> 🔍 **Going deeper**: `.ebextensions` files execute in **alphabetical order**. That's why `01_xxx.config`, `02_xxx.config` prefix enforces order. `commands` run before application code unpacked, `container_commands` after. DB migration requiring application code needs `container_commands`.

> ⚠️ **Trap**: `leader_only: true` guarantees exactly one ASG instance execution. Running DB migration simultaneously on all instances causes race condition — `leader_only` is mandatory. However, this option only applies at **initial deploy**; newly added instances (scale-out) don't run it.

### .platform (Amazon Linux 2/2023, Recommended)

```
my-app/
  .platform/
    nginx/
      conf.d/
        custom.conf           # Add nginx config (doesn't overwrite base)
    hooks/
      prebuild/
        01_install_pkg.sh     # After code download, before build
      predeploy/
        01_run_migration.sh   # After build, before deploy
      postdeploy/
        01_warm_cache.sh      # After deploy
```

> 💡 **Related theory**: Post-Amazon Linux 2 (2017), AWS redesigned `.ebextensions` functionality via `.platform/` directory. Reasons: ① clearer hook timing separation ② standard shell script writing ③ append-only nginx config instead of full replacement. `.ebextensions` still works, but `.platform/` is recommended for new projects. AL2 environments can use both.

## RDS Trap: Creating Inside Environment Deletes It Together

Beanstalk console has "create RDS together with environment" option. Convenient-looking but almost always anti-pattern for production.

```
[Beanstalk Environment]
  ├── EC2 (web)
  ├── ALB
  ├── ASG
  └── RDS    ← Deletes when environment deletes!
```

Reason: Beanstalk includes RDS in environment's CloudFormation stack. `eb terminate` or console environment delete removes RDS too. Data vanishes.

> ⚠️ **Trap**: Exam often shows "Beanstalk environment deleted, production data gone" scenario — standard answer is this. Correct pattern: **Create RDS separately outside Beanstalk**, connect via environment variables only. Environment can redeploy many times; DB stays safe.

```yaml
# .ebextensions connecting external RDS
option_settings:
  aws:elasticbeanstalk:application:environment:
    RDS_HOSTNAME: my-prod-db.cxxxx.ap-northeast-2.rds.amazonaws.com
    RDS_PORT: '5432'
    RDS_DB_NAME: myapp
    # Passwords via Secrets Manager reference
```

> 📚 **Case study**: AWS re:Invent customer talk, SaaS company separated staging/prod Beanstalk environments, created staging RDS together. During staging redeploy, RDS deleted. Fortunately auto-backup existed, 2-hour recovery took place. Policy changed: all RDS outside Beanstalk.

## CLI Based Operation: eb Commands

```bash
# Project initialization
eb init --platform "Python 3.11 running on 64bit Amazon Linux 2023" --region ap-northeast-2

# Create environment
eb create production-env --instance-type t3.medium --elb-type application

# Deploy new version (zips current directory, uploads)
eb deploy

# Set environment variables
eb setenv DB_HOST=mydb.com LOG_LEVEL=INFO

# View logs (last 100 lines from CloudWatch)
eb logs --all

# SSH access
eb ssh

# Blue/Green: URL swap
eb swap production-env --destination_name staging-env

# Delete environment (all resources including RDS if inside)
eb terminate production-env
```

## Comparison with Other PaaS

| Dimension | Beanstalk | Heroku | Google App Engine | Azure App Service |
|-----------|-----------|--------|---------------------|---------------------|
| Hosting | User AWS account EC2 | Heroku multitenant | GCP multitenant (Standard) or GCE (Flexible) | Azure multitenant |
| Pricing | EC2/ALB/RDS standard rates | Per dyno hour | Per instance hour | Per plan hour |
| Infrastructure Access | Full (SSH possible) | Limited | Limited (Standard), Full (Flexible) | Limited |
| Auto-scaling | ASG integrated | Heroku autoscaler | Auto | Auto |
| Database | RDS external recommended | Heroku Postgres add-on | Cloud SQL separate | Azure SQL separate |
| Custom Runtime | Possible (.platform) | Buildpack | Possible (Flexible) | Possible (Custom Container) |

> 💡 **Related theory**: Biggest Heroku-Beanstalk difference is **infrastructure access**. Heroku: "don't look how instances work" — complete abstraction. Beanstalk: "SSH in, tweak nginx directly if needed" — escape hatch exists. This matters for production debugging — Heroku "why OOM?" is hard; Beanstalk `eb ssh` then `top` answers it.

## When to Choose Beanstalk

| Scenario | Choice |
|----------|--------|
| Fast PoC, no time learning AWS depth | **Beanstalk** |
| Standard web app (Django, Express, Rails) + full infrastructure access | **Beanstalk** |
| Docker containers + microservices | **ECS Fargate / EKS** |
| Event-driven short-lived functions, zero cost idle | **Lambda** |
| Container + autoscaling without Kubernetes + automatic HTTPS | **App Runner** |
| HPC, GPU, special instances | **EC2 direct** |

> 🔍 **Going deeper**: 2021's AWS App Runner is Beanstalk's spiritual successor. "Container image or source code → auto build + deploy + autoscale + HTTPS" is App Runner's promise — simpler and container-native. Internally AWS treats Beanstalk as "not deprecated but not actively recommended"; new workloads steer toward App Runner or ECS Fargate.

## Wrapping Up

Beanstalk is "AWS's most ambitious attempt to abstract all infrastructure complexity into one command." The promise mostly holds, but abstraction cracks needed `.ebextensions`/`.platform` escape hatches, and RDS lifecycle management remains user responsibility.

For DVA-C02 prep: six deployment strategies' trade-offs, Web vs Worker environment difference, "don't put RDS inside environment" trap — nail these three and 80% of Beanstalk questions solve themselves. Next article: this week's finale — **CloudFormation's internals and SAM/CDK**.

---

## 📝 연습 문제

**문제 1.** Best Beanstalk deployment strategy for production with **no downtime, fastest rollback possible**?

A) All at once
B) Rolling
C) Immutable
D) Blue/Green (URL swap)

**정답: D**

해설: Blue/Green maintains two environments, URL swap transfers traffic. Rollback just reverses swap — **seconds to complete**. C) Immutable safe but rollback deletes new ASG, reactivates old — slightly slower. A) AllAtOnce has downtime. B) Rolling is redeploy-based rollback. When "instant rollback + zero downtime," Blue/Green is typical answer, though Immutable sometimes qualifies.

---

**문제 2.** In .ebextensions, to run DB migration **on one ASG instance only**?

A) `commands:` + `singleton: true`
B) `container_commands:` + `leader_only: true`
C) `option_settings:` + `aws:autoscaling:asg:MinSize:1`
D) `packages:` + `once: true`

**정답: B**

해설: `container_commands` executes after application code unpacked (migration needs source), `leader_only: true` designates one leader. DB migration needs ① source availability ② single execution (race condition prevention). A) `singleton` doesn't exist. C) MinSize is capacity, not execution gating. D) `packages` is package installation section. When "DB migration once," leader_only is standard exam answer.

---

**문제 3.** Difference between Beanstalk Web Server and Worker Environment?

A) Worker has no ALB, SQS Daemon converts messages to HTTP to application
B) Web is SQS-based, Worker is HTTP-based
C) Worker lacks Auto Scaling Group
D) Web requires RDS integration

**정답: A**

해설: Worker's core: EC2 SQS Daemon polls queue, converts message → HTTP POST to application (default `/`). Application just HTTP server, no SQS SDK needed. B) Opposite — Web is HTTP, Worker is SQS-based. C) Worker has ASG (scales by queue length). D) RDS is optional for both, external recommended. When Worker environment pattern, SQS + Daemon is core.

---

**문제 4.** When Beanstalk environment created with "Create new RDS DB" option in console, then `eb terminate` executed, what happens?

A) RDS stays separate
B) RDS deletes too, data permanent loss possible
C) RDS auto-snapshots then deletes
D) Beanstalk warns and prevents termination

**정답: B**

해설: RDS inside environment's CloudFormation stack deletes on termination. Auto-backup (if enabled) preserves data temporarily; without it, permanent loss. A) No, part of stack. C) Optional snapshot setting, data loss likely. D) Warning shown but doesn't block. Standard trap — production RDS **must** be **outside** Beanstalk. When "environment delete + RDS loss" scenario, typical exam trap.

---

**문제 5.** Amazon Linux 2 Beanstalk, increase nginx `client_max_body_size` to 50MB. Recommended method?

A) `.ebextensions/nginx.config` full config overwrite
B) `.platform/nginx/conf.d/custom.conf` add-only config
C) `eb ssh` direct nginx.conf edit
D) Beanstalk console nginx option

**정답: B**

해설: AL2+ recommends `.platform/`. Settings in `.platform/nginx/conf.d/` append (base preserved), not overwrite like `.ebextensions`. A) Overwrite risks losing AWS base config. C) SSH edit vanishes on instance recreation (non-persistent). D) Console lacks nginx options. When AL2 + custom nginx, .platform is answer.

---

**문제 6.** Beanstalk Traffic Splitting prerequisite?

A) Worker Environment only
B) Web Server Environment with Application Load Balancer
C) Classic Load Balancer
D) RDS embedded in environment

**정답: B**

해説: Traffic Splitting uses ALB **weighted target group** feature. CLB/NLB lack weight routing. A) Worker has no ALB. C) Classic LB no weights. D) RDS unrelated. When "Traffic Splitting + Beanstalk," ALB is implicit.

---

**문題 7.** Beanstalk Immutable deployment, first new ASG instance fails health check, what happens?

A) Production unaffected, new ASG auto-deletes, deployment marked failed
B) Existing ASG also terminates
C) Auto-switches to Rolling
D) Environment completely deletes

**正答: A**

해説: Immutable's safety core — new ASG separate from production. Failed health check → new ASG deleted only, existing continues traffic. Deployment fails but service safe. B/C/D wrong behaviors. When "Immutable safety," health check failure answer is A.
