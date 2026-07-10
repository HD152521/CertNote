# Day 3 - Config and Systems Manager: How Do You Enforce a Desired State

When cloud infrastructure grows to hundreds of resources, it becomes impossible for a human to directly answer "is our environment in a safe state right now?" Yesterday every S3 bucket had Block Public Access (BPA) on, but what if someone flipped one bucket to public today? Yesterday every EBS volume was encrypted, but what if a newly created volume is plaintext? This "drift away from the desired state" accumulates over time, and that one gap becomes the entryway for a security incident. The core problem is twofold — first, how do you **continuously detect** drift; second, when you find drift, how do you **automatically remediate** it.

AWS splits these two problems across two services. **AWS Config** (2014) is the governance tool that "continuously records resource configurations and compares them against the desired state (Rules) to detect violations." **Systems Manager (SSM)** is the operations tool that "actually manipulates and remediates instances and resources from a central place." When Config tells you "what is wrong," SSM "fixes it." Rather than list the two services' features, this article traces "why the desired-state model is the core paradigm of infrastructure management," "how Session Manager eliminated SSH keys and bastion hosts," and "what control loop Config + SSM auto-remediation creates" — pinning down the essence of the SAA operations domain.

## Desired State: The Paradigm of Declarative Infrastructure Management

To understand AWS Config's Rules you first have to grasp the "desired state" model. This isn't unique to Config — it's a paradigm that runs through all of modern infrastructure management.

Traditional imperative management instructs "execute these steps" — "create the bucket, turn on BPA, set up encryption." The problem is that state changes over time and an imperative script can't remember "what it already did." Declarative management is different — you declare "the final state should look like this," and the system computes the diff between the current state and the desired state and adjusts only by that difference. A Config Rule is exactly this model. "Every S3 bucket must have BPA on" is the desired state, and Config evaluates the actual buckets against this rule and finds violations (NON_COMPLIANT).

> 💡 **Related theory**: The desired-state model is also the heart of Kubernetes. In K8s, when you declare "this Deployment must have 3 replicas," a controller continuously compares the current state (the number of Pods actually up) with the desired state (3) and fills the gap — this is called a **reconciliation loop**. Terraform's `plan`/`apply` and GitOps' "Git is the source of truth" are all the same idea. Config + auto-remediation builds a reconciliation loop for AWS resources, and in "detect drift and return to desired state" it shares the same philosophy as a K8s controller.

Config Rules come in three kinds. **Managed Rules** are hundreds of AWS-prebuilt rules (s3-bucket-public-read-prohibited, encrypted-volumes, etc.), **Custom Rules** are ones you write yourself with Lambda or Guard (a policy language). A **Conformance Pack** is a template bundling multiple rules by regulatory framework (PCI DSS, HIPAA, NIST 800-53), so you can "deploy the 50 rules needed for PCI compliance in one shot." And an **Aggregator** lets you view multi-account, multi-region Config data centrally from one account, seeing the whole organization's compliance at a glance.

> ⚠️ **Pitfall**: Config is billed per "configuration item," and in a large environment with frequent resource changes cost rises quickly. So instead of "recording every resource type," you need tuning to selectively record only important types or exclude resources that change explosively. On the exam, when "reduce Config cost in a large environment" appears, "limit the recorded resource types" is the answer direction.

## The CloudTrail-and-Config Pair: "Who Did It" + "What Is It Now"

On Day 2 we said CloudTrail answers "who did what." Config answers its counterpart, "so what state is it in now and does it follow the rules." The two are used together in incident analysis.

For example, if there's an incident of "some bucket became public," Config shows the state "this bucket is currently public and violates the 'no public-read' rule" along with the timeline of that change (since when it was public). But "who made that change" isn't answered by Config directly — you have to follow the CloudTrail events linked to Config's configuration-item timeline to find the actor. That is, Config is "the history of state," CloudTrail is "the record of action," and they integrate such that clicking a configuration change in the Config console links you to the CloudTrail event that caused it.

> 🔍 **Going deeper**: A Config configuration item (CI) is a point-in-time snapshot of a resource. Each time a resource changes, a new CI is created, and these form the "configuration timeline." So you can rewind, point by point, to "what rules this SG had 3 months ago" — just like git's commit history. Combine this time-series configuration record with CloudTrail's action record and you get the complete picture of "when, what changed how, and who changed it." Look at the two services separately and each is a half; look at them together and forensics is complete.

## Systems Manager: One Umbrella Over Scattered Operations Tools

Systems Manager isn't a single feature but an umbrella service bundling the many tools operations needs. Session Manager, Run Command, Patch Manager, State Manager, Maintenance Windows, Parameter Store, Inventory, Automation, and more live under one console. The common foundation of this bundle is the **SSM Agent** — this agent installed on an instance communicates with the SSM service, receives commands, and executes them. It comes pre-installed on Amazon Linux, Ubuntu, and Windows, and the instance needs the `AmazonSSMManagedInstanceCore` IAM Role.

The philosophy running through this bundle is "don't touch infrastructure directly — manipulate it via API." Traditional operations of SSHing into a server and typing commands can't be tracked (no record of who typed what), can't scale (you'd have to enter 100 machines one by one), and are vulnerable to human error. SSM turns all this manipulation into API calls, making it trackable, scalable, and automatable.

## Session Manager: The Idea That Eliminated SSH Keys and Bastion Hosts

The most exam-frequent part of SSM is **Session Manager**. It's a tool that connects to an instance's shell without an SSH key, without opening port 22, and without a bastion host. Why this matters is clear once you look at the security burden of traditional SSH access.

Traditionally, to reach an EC2 in a private subnet you had to ① put a bastion (jump) host in a public subnet, ② manage and distribute an SSH key pair, ③ open the bastion's port 22 to the operator's IP, and ④ SSH-jump again from the bastion into the interior. Every step here is attack surface — what if the SSH key leaks? What if the bastion is compromised? What if a brute-force attack comes in on port 22? Session Manager flips this structure completely. The instance's SSM Agent makes an **outbound** connection to the SSM endpoint, and the operator receives a shell through that channel. That is, you connect without opening a single inbound port (port 22 stays closed), without a key, with IAM permissions alone. Every session is recorded in CloudTrail, and even the commands typed during the session can be logged to S3/CloudWatch Logs.

> 💡 **Related theory**: Session Manager's idea of "making an inbound channel from an outbound connection" is the reverse-tunnel pattern. When a machine inside a firewall makes a connection outward, you can flow traffic from outside to inside through that connection — without opening an inbound rule. SSH reverse tunnels, ngrok, and Cloudflare Tunnel all use the same principle. This creates the powerful security property of "zero inbound ports." An attacker has no open port, so there's no surface to knock on directly.

> ⚠️ **Pitfall**: The answer to "securely access private-subnet EC2 without an SSH key" is almost always Session Manager. Even in a fully internet-isolated private subnet, if you place a **VPC Interface Endpoint** for SSM/SSM Messages/EC2 Messages, it works without a NAT gateway or IGW — traffic flows only over AWS's internal network. On the exam, when "manage a private instance without an internet gateway" appears, Session Manager + VPC Endpoint is the answer.

> 📚 **Case study**: SSH-key-based access creates "key management hell" as operational scale grows. It becomes impossible to track who holds which key, whether a departed employee's key was revoked, or which laptop a key was copied to. Many organizations discover "hundreds of unrevoked SSH keys" in a security audit and switch to Session Manager to eliminate keys themselves and consolidate access via IAM permissions and SSO. With access permissions concentrated in IAM alone, revoking a departed employee's access is instant, and because every connection is left in CloudTrail, auditing is complete.

## Patch Manager and Maintenance Windows: Patching 100 Machines Safely

Defer OS security patches and you're exposed to vulnerabilities; apply them all at once and the whole service reboots simultaneously, causing an outage. **Patch Manager** resolves this tension. With a **Patch Baseline** you define "which classification of patch (security/critical) to auto-approve, how many days after release," and with a **Patch Group** you bundle instances by tag. And with **Maintenance Windows** you define a time window like "maintenance only Sundays 2–4 AM" so patches run only within it.

The key is **gradual rollout**. Set concurrency and an error threshold in a Maintenance Window and you can roll safely, like "patch 25% at a time, and stop immediately if the error rate crosses 10%." This way, even if a patch causes a problem, only a portion is affected rather than the whole, and the rest is protected. This applies the standard pattern of deployment safety (canary/rolling) to patching.

> 🔍 **Going deeper**: Patch Manager's "auto-approval delay" is clever risk distribution. Apply a patch the moment it's released and you risk a bug in the patch itself (a supply-chain incident); apply it too late and you're exposed to the vulnerability. A setting like "auto-approve 7 days after release" buys "collective validation" time in those 7 days for other organizations to install first and find problems, while also forcing you not to defer indefinitely. It expresses the balance point between security and stability as time.

## Config + SSM Automation: The Control Loop From Detection to Remediation

When Config and SSM combine, a complete auto-remediation loop is formed. The flow goes like this.

```
[ Config + SSM Auto-Remediation Control Loop ]

  Resource change (e.g., someone creates an EBS volume as plaintext)
      │ CloudTrail records the action
      ▼
  Config Recording → Config Rule evaluation
      │ "encrypted-volumes violation!" (NON_COMPLIANT)
      ▼
  EventBridge rule (or Config Remediation)
      │
      ▼
  SSM Automation Runbook execution
      │ (e.g., isolate the volume, snapshot then re-create encrypted, alert SecOps)
      ▼
  Resource returns to desired state → Config re-evaluates → COMPLIANT
```

The elegance of this loop is that **the environment converges to a compliant state on its own, without human intervention**. Even if someone accidentally creates a rule-violating resource, within a few minutes Config detects it and SSM Automation remediates it. SSM Automation's execution unit, the **Document (Runbook)**, is a pre-defined procedure, and you can use AWS's hundreds of standard Runbooks (restart an instance, create a snapshot, revoke a security-group rule, etc.) or custom Runbooks you build yourself.

> 💡 **Related theory**: This "detect → evaluate → remediate → re-detect" is a **feedback control loop (closed-loop control)** from control theory, plain and simple. It has the same structure as a thermostat measuring the current temperature (detect), comparing it against the target (evaluate), turning on the heater (remediate), and measuring again (re-detect). It's the perspective of seeing infrastructure not as "a static thing you set once and forget" but as "a dynamic system continuously pulled toward the desired state," and it's a core idea shared by modern cloud operations (SRE, GitOps, K8s).

> 📚 **Case study**: Auto-remediation requires caution. Overly aggressive remediation that "deletes the resource immediately upon finding a violation" can revert legitimate changes and paralyze operations. One organization set up "auto-revoke rules on finding a public SG," then hit an incident where an SG in the middle of a legitimate migration kept getting revoked, causing the work to fail in an infinite loop. So the mature pattern grades things — "critical violations get auto-remediation + isolation, ambiguous violations get alert-only + remediation after human approval." The greater automation's power, the more precisely you must design its trigger conditions.

## Parameter Store, Inventory, AppConfig: The Rest of the Operations Tools

**Parameter Store** (part of SSM) stores configuration values and secrets by hierarchical path (`/app/prod/db/password`). It supports plaintext String, StringList, and KMS-encrypted SecureString. It's often compared to Secrets Manager (from Week 8) — Parameter Store has a free tier (Standard) and no automatic rotation, while Secrets Manager is paid but provides automatic rotation integrated with RDS and more. "Cost matters and rotation is unneeded" points to Parameter Store; "automatic rotation is needed" points to Secrets Manager.

**Inventory** collects each instance's installed packages, running services, and configuration to visualize "what software is installed across our fleet." You use it to find, in one shot, which instances have a library that was found vulnerable. **AppConfig** safely deploys an application's dynamic configuration (feature flags, thresholds) without redeploying code — it builds in validation, gradual rollout, and automatic rollback to revert bad configuration before it spreads to everything.

> 🔍 **Going deeper**: The boundary between Parameter Store and Secrets Manager looks blurry, but their design intent differs. Parameter Store started as a "configuration management" tool and expanded to handle secrets too, while Secrets Manager was specialized from the start for "secret lifecycle (creation, rotation, expiry) management." That's why Secrets Manager builds in a Lambda that automatically rotates credentials for RDS/Redshift/DocumentDB — which Parameter Store doesn't have. On the exam, when "automatic DB password rotation" appears, Secrets Manager is almost always the answer.

## Getting Hands-On With the CLI

```bash
# Set up the Config recorder + delivery channel, then start
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:aws:iam::111:role/Config

aws configservice put-delivery-channel \
  --delivery-channel name=default,s3BucketName=config-logs-bucket

aws configservice start-configuration-recorder \
  --configuration-recorder-name default

# Managed Rule: detect unencrypted EBS volumes
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName":"encrypted-volumes",
  "Source":{"Owner":"AWS","SourceIdentifier":"ENCRYPTED_VOLUMES"}
}'

# Connect via Session Manager without an SSH key (no port 22 needed)
aws ssm start-session --target i-1234567890abcdef0

# Run a command across many instances at once via Run Command
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets "Key=tag:Environment,Values=production" \
  --parameters 'commands=["yum update -y --security"]' \
  --max-concurrency "25%" --max-errors "10%"

# Patch Baseline (security patches, auto-approve 7 days after release)
aws ssm create-patch-baseline --name "saa-baseline" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules 'PatchRules=[{
    "PatchFilterGroup":{"PatchFilters":[{"Key":"CLASSIFICATION","Values":["Security"]}]},
    "ApproveAfterDays":7,
    "ComplianceLevel":"CRITICAL"
  }]'

# Store a SecureString secret in Parameter Store (KMS-encrypted)
aws ssm put-parameter --name "/app/prod/db/password" \
  --value "s3cr3t" --type SecureString --key-id alias/saa-app

# Wire auto-remediation via SSM Automation on Config Rule violation
aws configservice put-remediation-configurations \
  --remediation-configurations '[{
    "ConfigRuleName":"encrypted-volumes",
    "TargetType":"SSM_DOCUMENT",
    "TargetId":"AWS-CreateSnapshot",
    "Automatic":true
  }]'
```

## Wrapping Up

Config and Systems Manager are the governance-and-operations pair that "detect and enforce the desired state." The essence compresses into five points. ① Config detects configuration drift with the desired-state (Rule) model and extends with Managed/Custom Rules, Conformance Packs (regulatory bundles), and Aggregators (multi-account aggregation) — the same philosophy as a K8s reconciliation loop. ② Config (current state/rules) pairs with CloudTrail (who did it) to combine the configuration timeline and the action record for complete forensics. ③ Session Manager uses the reverse-tunnel idea to eliminate SSH keys, bastions, and inbound ports entirely, connecting with IAM permissions alone, and manages internet-less private instances via VPC Endpoints. ④ Patch Manager + Maintenance Windows safely patch 100 machines with gradual rollout and auto-approval delay. ⑤ Config + SSM Automation converge the environment to compliance on its own via the detect → evaluate → remediate → re-detect feedback control loop.

In the next article, we go beyond metrics, logs, and audit to look at distributed tracing (X-Ray), which tracks "the flow of one request passing through multiple services," and AWS's proactive best-practice recommendations (Trusted Advisor) and infrastructure-status notifications (Health Dashboard). The key is how tracing, observability's third pillar, reveals microservice bottlenecks.

---

## 📝 연습 문제

**문제 1.** An organization wants to "continuously check that every S3 bucket always keeps BPA (Block Public Access) enabled." Which is the most suitable service?

A) CloudTrail
B) AWS Config Rule
C) Amazon Inspector
D) Amazon Macie

**정답: B**

해설: "Continuously check that a configuration keeps the desired state (BPA enabled)" is the desired-state evaluation domain of Config Rule. A Managed Rule (s3-account-level-public-access-blocks, etc.) detects violations. CloudTrail (A) answers the action of who turned BPA off, Inspector (C) is vulnerability scanning, and Macie (D) is sensitive-data detection — all different from configuration-state evaluation.

---

**문제 2.** You want to do shell access and command execution on 100 private-subnet EC2 instances without SSH keys, without opening port 22, and without a bastion host. There's no internet gateway either. Which is the most suitable solution?

A) Bastion host + SSH key distribution
B) Session Manager + SSM/EC2 Messages VPC Interface Endpoint
C) Direct SSH over a VPN
D) Assign a Public IP then open port 22 in the SG

**정답: B**

해설: Session Manager provides a shell with zero inbound ports because the instance's SSM Agent makes an outbound connection. In an internet-less private subnet, placing VPC Interface Endpoints for SSM, SSMMessages, and EC2Messages makes it work without NAT/IGW, over AWS's internal network only. Every connection is recorded in CloudTrail. A, C, and D all leave the attack surface of key management or open ports.

---

**문제 3.** You want to apply OS security patches to 100 EC2 instances only during a weekend early-morning maintenance window, gradually 25% at a time, stopping if the error rate is high. Which is the most suitable combination?

A) A UserData script
B) Patch Manager + Maintenance Windows (with concurrency and error-threshold settings)
C) Run Command alone with full simultaneous execution
D) ASG Instance Refresh

**정답: B**

해설: Define the patch policy (Baseline) with Patch Manager and set the maintenance window plus concurrency (25%) and error threshold with Maintenance Windows, and you get a safe gradual rollout. C runs everything simultaneously so failures affect all; A is a one-time boot script; D is for AMI replacement, not an OS-patch automation tool.

---

**문제 4.** What is required for EC2 to be managed by Systems Manager (Session Manager, Run Command, etc.)?

A) A Public IP and port 22 open in the SG
B) The AmazonSSMManagedInstanceCore IAM Role + SSM Agent
C) Allowing port 22 in the NACL
D) An internet gateway connection

**정답: B**

해설: The foundation of SSM management is the SSM Agent (pre-installed on major OSes) and the AmazonSSMManagedInstanceCore IAM Role that grants the instance permission to communicate with SSM. Session Manager uses an outbound connection, so it needs no Public IP, port 22, or IGW. A, C, and D are all remnants of the inbound-access model SSM is trying to eliminate.

---

**문제 5.** When a Config Rule detects "an unencrypted EBS volume" as a violation, you want to automatically execute remediation (snapshot, isolate, alert) without human intervention. Which is the most suitable pattern?

A) Run a Lambda in polling mode to inspect directly
B) Config Remediation (or EventBridge) → SSM Automation Runbook
C) Handle it with Step Functions alone
D) Scan with Inspector

**정답: B**

해설: A Config Rule violation is connected to an SSM Automation Runbook via Config Remediation or an EventBridge rule and auto-remediated. This creates the detect → evaluate → remediate feedback control loop. A is inefficient polling, C is an orchestration tool rather than the standard Config integration, and D is vulnerability scanning, different from remediation execution.

---

**문제 6.** A team wants to view, from one account, "the whole organization's compliance state (which resources in which accounts violate rules)" in a multi-account, multi-region environment. Which is the most suitable feature?

A) Check each account's Config console separately
B) Config Aggregator
C) CloudTrail Organization Trail
D) Trusted Advisor

**정답: B**

해설: Config Aggregator gathers multi-account, multi-region Config data into one account for a unified compliance view (requires cross-account authorization). CloudTrail Organization Trail (C) is API-audit aggregation, not configuration-compliance aggregation, and Trusted Advisor (D) is best-practice recommendations, different from Config-rule aggregation.

---

**문제 7.** An application stores a DB password and needs regular automatic rotation. Operational automation takes priority over cost. Between Parameter Store and Secrets Manager, which fits?

A) Parameter Store SecureString (built-in automatic rotation)
B) Secrets Manager (RDS-integrated automatic rotation)
C) They're identical
D) KMS-encrypted storage in S3

**정답: B**

해설: Secrets Manager was specialized for secret lifecycle from the start and builds in automatic rotation for RDS/Redshift/DocumentDB credentials. Parameter Store has a free tier and supports SecureString but has no automatic-rotation feature. Since "automatic rotation needed" is the key requirement, Secrets Manager is the answer. A falsely presumes automatic rotation, and D has no rotation or integration.

---

Supplementary note: Config and SSM are the center of the SAA operations and governance domain, and the exam repeatedly asks about "Config (state/rules) vs CloudTrail (action)," "Session Manager's key-less, port-less access," "the Patch Manager + Maintenance Window combination," and "Config + SSM Automation auto-remediation." Grasp the big picture of the desired-state model and the feedback control loop and every individual feature threads onto a single line — why it was designed that way.
