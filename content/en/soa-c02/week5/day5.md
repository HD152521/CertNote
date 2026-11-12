# Day 5 - Week 5 Review: Systems Manager Comprehensive Scenario

Week 5 covered the entire massive AWS Systems Manager operational platform. From Managed Instance registration conditions to command automation (Run Command), state management (State Manager), scheduled tasks (Maintenance Window), patch automation (Patch Manager), configuration centralization (Parameter Store), keyless access (Session Manager), and complex operational workflows (Automation Runbook). All these tools converge on one goal: **enable operators to escape from repetitive and risky manual work and focus on what matters.**

Today we review the entire Week 5 using real-world scenario formats from exams. Each question doesn't simply ask "what is this tool" but trains logical reasoning about "why this tool." SOA-C02 often has all four choices as SSM tools, making precise role distinction a pass/fail factor.

## One-Line Core Concept Summary

1. **Managed Instance 3 requirements**: SSM Agent running + IAM Role(`AmazonSSMManagedInstanceCore`) + network reachability
2. **Private VPC 3 required Endpoints**: ssm / ssmmessages / ec2messages (all Interface, HTTPS 443)
3. **Hybrid Activations**: On-premises/other clouds get `mi-xxx` ID same as EC2
4. **Run Command(one-time) / State Manager(persistent + drift correction) / Maintenance Window(scheduled + order guarantee)** — role division
5. **Patch Group tag name = exactly "Patch Group"** (with space, case-sensitive)
6. **AWS default baseline = Security/Critical only** — Important and above needs Custom Baseline
7. **Dev(0 days) → Stage(3 days) → Prod(14 days) gradual apply** = ApproveAfterDays difference
8. **Parameter Store SecureString = KMS encrypted** — auto-rotation handled by Secrets Manager
9. **Session Manager = SSH/RDP without keys, port 22 closed, IAM-based, auto-audit sessions**
10. **Automation Runbook = multi-step workflow** — Config Auto Remediation, EventBridge trigger

> 💡 **Related theory**: SSM is a precise implementation of the "control plane vs. data plane" separation architecture used in distributed systems. The SSM API layer (registering commands, querying status) is the control plane; the SSM Agent (actually executing commands, sending heartbeats) is the data plane. A control plane failure (an SSM service issue) does not affect Agent tasks that are already running. This is exactly the "control plane / data plane separation" that AWS CTO Werner Vogels returns to in every re:Invent keynote — and SSM is a real-world implementation of it.

## Comparison Table: Clarifying Confusing Concepts

**Command Execution Tools Comparison:**

| Characteristic | Run Command | State Manager | Maintenance Window |
|--------|-------------|---------------|---------------------|
| Execution | Manual trigger (one-time) | Schedule + auto on new instance | Auto at scheduled time |
| Drift Correction | No | Yes | No |
| Auto-include new instances | No | Yes (tag-based) | Tag-based |
| Multi-task order guarantee | No | No | Yes (Priority) |
| Immediate execution possible | Yes | Yes (start-associations-once) | Manual trigger possible |
| Primary scenario | Urgent batch commands | Maintain config standardization | Patch/backup/maintenance |

**Secret Management Tools Comparison:**

| Characteristic | Parameter Store Standard | Parameter Store Advanced | Secrets Manager |
|------|--------------------------|--------------------------|-----------------|
| Cost | Free | $0.05/parameter/month | $0.40/secret/month |
| Max value size | 4KB | 8KB | 64KB |
| Auto-rotation | No | No | Yes (RDS/Redshift/Lambda) |
| Cross-region replication | No | No | Yes |
| Parameter Policy (expiration/notification) | No | Yes | No |
| Version management | Yes | Yes | Yes |
| CFn/Lambda/EC2 integration | Yes | Yes | Yes |

**Access Method Comparison:**

| Characteristic | SSH + Bastion | Session Manager | EC2 Instance Connect |
|------|---------------|-----------------|----------------------|
| Port 22 needed | Yes | No | Yes |
| SSH key management | Yes (key distribution) | No (IAM-based) | No (ephemeral key) |
| Auto session logging | Requires config | Yes (S3/CW Logs) | No |
| Private VPC access | VPN/DX needed | VPC Endpoint | VPC Endpoint |
| MFA enforcement | Difficult | Easy via IAM policy | No |
| Port forwarding | Yes (manual) | Yes (document support) | No |

> 🔍 **Going deeper**: Session Manager's IAM-based access control goes beyond "who is allowed to connect" and makes fine-grained policies possible: "to which instances, at what time, running which commands only." For example, adding `ssm:resourceTag/Environment=prod` as a condition on `ssm:startSession` allows sessions only on instances tagged prod. The `aws:MultiFactorAuthPresent: true` condition lets you enforce MFA. That kind of granular control is very hard to achieve with traditional SSH keys. Combined with IAM Identity Center (SSO), you can even drive access control from a central directory.

**Patch Manager Key Comparison:**

| Item | AWS Default Baseline | Custom Baseline |
|------|-------------------|-----------------|
| Applied classifications | Security only | Configurable |
| Approval period | Varies by OS (usually 7 days) | User-set |
| Compliance Level | Not configurable | CRITICAL/HIGH/MEDIUM choice |
| Deny patches | Not configurable | Explicit BLOCK possible |
| Multi-OS | Separate default per OS | Separate per OS needed |

> 💡 **Related theory**: Patch Manager's "Approval Rules → Maintenance Window → Compliance" pipeline is a structure that automatically satisfies the ISO 27001 A.12.6.1 requirement (technical vulnerability management). In an ISO 27001 certification audit you can submit the Patch Compliance report directly as evidence that the vulnerability-patching process is automated. Control 7 of CIS Controls v8 (vulnerability management) follows the same idea. AWS Audit Manager's ISO 27001 and NIST 800-53 frameworks automatically collect Patch Manager data as evidence.

## Collection of Common Patch Mistakes

Knowing repeated operational mistakes helps avoid exam trap questions.

| Mistake | Symptom | Correct Method |
|------|------|-------------|
| Create tag named `PatchGroup` | Patch group not recognized | `Patch Group` (with space) |
| Create Baseline but don't link to Patch Group | Default Baseline patches instead | `register-patch-baseline-for-patch-group` required |
| Use `NoReboot` instead of `RebootIfNeeded` | InstalledPendingRebootCount accumulates | Maintenance Window includes reboot |
| Mix up Scan vs Install | Compliance updates without actual patch | Install applies actual patch |
| Think default Baseline includes Important | Security audit findings | Default Baseline = Security/Critical only |
| Think `ApproveAfterDays=0` means instant apply | Understanding error | =0 means "approve immediately upon release" |

> ⚠️ **Pitfall**: `ApproveAfterDays=0` means "approved from the day the patch is released." So the next time Patch Manager runs, any patch that has already been released is applied immediately. If the Maintenance Window runs once a week, the patch lands up to 7 days after release. It does not mean "applied instantly in real time" — it means "on the next Maintenance Window run, apply every patch released on or after its release date."

## 📝 Scenario Practice Questions

**Question 1.** The operations team manages EC2 instances with SSM in a private VPC (no internet gateway). The instance has the `AmazonSSMManagedInstanceCore` IAM role attached and the SSM Agent is running, but the instance does not appear in Fleet Manager in the SSM console. What is the cause?

A) The IAM role is missing additional permissions such as `ssm:UpdateInstanceInformation`, so the Agent cannot complete the registration handshake
B) The SSM Agent is in a stale cache state, so the `amazon-ssm-agent` service must be restarted for it to appear in Fleet Manager
C) The VPC does not have the ssm, ssmmessages, and ec2messages Interface Endpoints, or port 443 to those Endpoints is blocked by a security group
D) The instance is in only a single AZ, so the cross-AZ heartbeat required for Managed Instance registration cannot be established

**Answer: C**
Explanation: Private VPC (no internet) + IAM role correct + Agent running → the remaining cause is the network. The SSM Agent communicates with the three endpoints `ssm`, `ssmmessages`, and `ec2messages` over HTTPS (443). In a private VPC, this communication is impossible without the 3 VPC Interface Endpoints. In addition, the Endpoint security group must allow inbound 443 from the instance subnet. If either condition is missing, it appears as `PingStatus=ConnectionLost`.

---

**Question 2.** A company uses an Auto Scaling group to adjust web server capacity dynamically. Each time a new EC2 instance is launched by the ASG, the CloudWatch Agent configuration must be applied automatically. The operations team must not need to intervene. What is the most appropriate configuration?

A) Hardcode the CW Agent configuration JSON in the User Data script of the ASG Launch Template and redeploy the script every time the AMI is updated
B) Assign a `MonitoringEnabled=true` tag to ASG instances, configure a State Manager Association with the same tag, and run the `AmazonCloudWatch-ManageAgent` Document on a daily schedule
C) Detect the EC2 `RunInstances` (or ASG launch) event with EventBridge and have a Lambda function run `AmazonCloudWatch-ManageAgent` on the new instance through Run Command
D) Set a Maintenance Window to run every 30 minutes and periodically apply a CW Agent configuration Task to the tagged target instances

**Answer: B**
Explanation: The key characteristic of a State Manager Association is that "it runs immediately the moment a new Managed Instance matches the tag." When a new instance is launched by the ASG, the Association runs automatically the moment it registers as a Managed Instance. With User Data (A), it is hard to update the CW Agent configuration without changing the AMI, and drift is not corrected. A Lambda function (C) also works but is more complex than State Manager and does not correct drift. A Maintenance Window (D) is schedule-based, so a new instance runs without the configuration until the next window, and a 30-minute cycle falls short of State Manager's "run immediately on tag match + continuous enforcement" in terms of immediacy and drift correction.

---

**Question 3.** The company's patch policy is as follows: "For Web servers (Linux) in the prod environment, apply only Critical patches in the Security classification, and only those more than 14 days past release. Manage by Patch Group." What is the minimum set of configuration steps to implement this, in the correct order?

A) Create a Maintenance Window → create a Patch Baseline (Security/Critical, 14 days) → add the `Patch Group=prod-web` tag to the EC2 instances (create the Window first to fix the schedule)
B) Add the EC2 tag (`Patch Group=prod-web`) → create a Patch Baseline (Security/Critical, 14 days) → associate the Patch Baseline with the prod-web group → register a Task in the Maintenance Window
C) Create a Patch Baseline (Security/Critical, 14 days) → add the `Patch Group=prod-web` tag to the EC2 instances → create a Maintenance Window (the Baseline-to-group association is applied automatically by the tag alone)
D) Use the AWS default baseline (Security/Critical, 14-day approval) as is and configure only a Maintenance Window to minimize operational burden

**Answer: B**
Explanation: This is the correct configuration order. (1) Add the tag `Patch Group=prod-web` to the EC2 instances (the exact name, including the space), (2) create a Custom Patch Baseline (Security/Critical, ApproveAfterDays=14), (3) associate the Baseline with the group using `register-patch-baseline-for-patch-group`, (4) create a Maintenance Window and register the Target and Task (AWS-RunPatchBaseline). C leaves a gap because a Custom Baseline is not automatically associated with the group by the tag alone (without an explicit `register-patch-baseline-for-patch-group`, patching uses the AWS default baseline). The AWS default baseline (D) is right about the Security/Critical-only classification, but its approval wait period is the OS-specific default (usually 7 days), which differs from the 14-day requirement, and the classification cannot be customized.

---

**Question 4.** The security team has presented the following requirements. "All EC2 connection sessions must be retained in an auditable form. All commands entered by the user must be logged. Port 22 is not allowed in security groups." What is a way for the operations team to implement these requirements while also meeting developers' access needs?

A) Connect to the instance indirectly from AWS CloudShell and send the CloudShell session logs to CloudWatch Logs to audit the commands
B) Enable Session Manager and configure an S3 bucket and a CloudWatch Logs group in Session Preferences. Grant the `ssm:StartSession` permission in the developers' IAM policy
C) With port 22 closed, record all commands of SSH sessions as API events with CloudTrail Data Events and retain them in S3
D) Set up a VPN + Bastion Host, attach auditd/script logging to the Bastion, and send all session commands to S3

**Answer: B**
Explanation: Session Manager satisfies all requirements: IAM-based access without port 22, automatic logging of session input and output (S3/CloudWatch Logs), and a KMS encryption option. CloudTrail (C) records AWS API calls, not SSH commands. A Bastion (D) requires port 22 and session logging must be configured separately.

---

**Question 5.** An operator thinks a patch Task in a running Maintenance Window is likely to exceed the `Window Duration`. Cutoff is set to 1 hour. It is currently 30 minutes before the Window ends, and a request to run a new Task has arrived. What happens?

A) The new Task runs immediately. Cutoff is only advisory and does not prevent new Tasks from starting as long as the Window has not ended
B) The new Task execution is rejected. 30 minutes before the Window ends is past the Cutoff time (1 hour before the end), so a new Task cannot be started
C) All in-progress and pending Tasks are stopped immediately, and the Window is forcibly terminated because the Cutoff has been passed
D) The Window is automatically extended by the Cutoff amount (1 hour) so that both the new Task and the existing Tasks can complete

**Answer: B**
Explanation: With Cutoff=1 hour, starting new Tasks is blocked from 1 hour before the Window ends. 30 minutes before the Window ends is already past the Cutoff, so the new Task execution is rejected. Tasks currently in progress keep running until they complete, even after the Window ends, regardless of Cutoff. The purpose of Cutoff is to prevent "a new Task from starting at the end of the Window and being cut off in an incomplete state."

---

**Question 6.** A Lambda function needs a password to access Production RDS. Currently the plaintext password is stored in a Lambda environment variable. The security team has requested an improvement. The password must be changed automatically every 90 days, and the new password must be used without changing the Lambda code. What is the most appropriate solution?

A) Migrate to Parameter Store SecureString (KMS encryption), update the value directly every 90 days with an EventBridge schedule + rotation Lambda, and have the application look it up through the API
B) Migrate to Secrets Manager and configure automatic RDS rotation. Implement the Lambda SDK so that it always fetches the latest secret
C) Encrypt the Lambda environment variable with a KMS Customer Managed Key and turn on key rotation so that the password is renewed every 90 days
D) Include an encrypted configuration file in a Lambda Layer and deploy a new Layer version every 90 days to replace the password

**Answer: B**
Explanation: "90-day automatic rotation + without changing the Lambda code" is the key. Secrets Manager supports automatic rotation integrated with RDS, and during rotation the Lambda (rotation function) automatically sets the new password in RDS and updates Secrets Manager. The application Lambda then always gets the latest value by calling `get_secret_value()`. Parameter Store (A) has no native automatic rotation, so you must build and maintain the rotation Lambda yourself. In KMS encryption (C), key rotation only replaces the encryption key and does not change the RDS password value itself, so it does not meet the requirement. Redeploying a Layer in D is a redeployment of code (artifacts), which conflicts with the "without code changes" condition.

---

**Question 7.** The operations team wants to detect a "public S3 bucket" with a Config rule and automatically block the bucket's public access immediately upon detection. Which SSM feature is most appropriate?

A) Run Command — call the AWS CLI with `AWS-RunShellScript` to block public access on the violating bucket
B) State Manager — continuously enforce the S3 public access block setting as a desired state through an Association
C) Automation Runbook (as the Config Auto Remediation target)
D) Session Manager — open a session so the operator immediately blocks the violating bucket manually

**Answer: C**
Explanation: Config Auto Remediation runs an SSM Automation Document when it finds a non-compliant resource. Standard Runbooks such as `AWS-DisableS3BucketPublicReadWrite` are provided. Run Command (A) targets EC2 instances and does not directly control S3 buckets. State Manager (B) is mainly for managing EC2 configuration. Automation can call any AWS API with the `executeAwsApi` action, so it can control a variety of resources such as S3, EC2, and IAM.

---

**Question 8.** During the transition of the installed Node.js version from 14.x to 18.x, the development team asked, "please pull a list of prod servers currently using 14.x." Which SSM feature can answer this most efficiently?

A) Run `node --version` in bulk on all prod-tagged instances with Run Command, and grep for 14.x in the output to compile the server list
B) Filter for the Node.js version in SSM Inventory (`AWS:Application` data)
C) Search npm/yum install-related API events with SQL in CloudTrail Lake and trace back the servers that have a Node.js 14.x installation history
D) Scan the prod instances with Amazon Inspector and extract the list of instances where a Node.js 14.x package was detected

**Answer: B**
Explanation: The `AWS:Application` type of SSM Inventory periodically collects the names and versions of software installed on each instance. After syncing to S3 with Resource Data Sync, you can immediately query "the list of prod instances with Node.js 14.x installed" using Athena SQL. Run Command (A) also works, but it is a real-time one-time query and compiling the results is cumbersome. Inventory continuously collects data with a single setup, so it is ideal for this kind of query.

---

**Question 9.** A company manages 50 on-premises servers with SSM using Hybrid Activations. It wants to apply security patches to these servers weekly. Which Patch Manager features should it use, and what format is the SSM identifier of an on-premises server?

A) They are registered in the same i-xxx format as EC2, but on-premises servers have no hypervisor metadata, so Patch Manager cannot be used and only Run Command works
B) mi-xxx format; Patch Baseline + Maintenance Window can be used exactly as with EC2
C) They are identified by ARN format, and the Patch Group tag is EC2-only, so on-premises servers must be grouped separately with a Resource Group
D) The registered IP address is used as the identifier, and only Run Command is supported on-premises, with no Patch Baseline association possible

**Answer: B**
Explanation: On-premises servers registered with Hybrid Activations receive an ID in the format `mi-xxxxxxxxxxxxxxxxx`. After that, you can use Patch Manager, Run Command, Session Manager, and State Manager exactly as with EC2. For the Patch Group tag as well, just set `Key=Patch Group,Value=onprem-prod` in the same way and associate the baseline. 50 servers fall within the Standard Tier (free) range, so there is no additional cost.

---

**Question 10.** A patch Task in a Maintenance Window failed. Concurrency is set to 10% and Error Tolerance to 5%, and 6% of instances failed. What happens?

A) When the Error Tolerance is detected as exceeded, an automatic rollback starts for everything, including instances that were already patched
B) Only the failed instances are automatically rolled back to the previous patch state, and patching continues on the remaining instances
C) Because Error Tolerance (5%) was exceeded, Task execution on the remaining instances is stopped. Instances that already succeeded are left as they are
D) When the failure rate approaches the threshold, Error Tolerance automatically expands up to Concurrency (10%) and execution continues

**Answer: C**
Explanation: Error Tolerance is a circuit breaker that "stops the remaining execution once failures reach this rate." When 6% fail, the 5% threshold is exceeded and Task execution on the remaining instances stops immediately. Instances that were already patched successfully are left as they are, and instances not yet patched are skipped. There is no automatic rollback feature, and you must rerun after identifying the cause of the failure.

---

**Question 11.** You want to send an automatic notification when the Parameter Store parameter `/myapp/prod/db/password` has not been changed for 90 days, and also have this parameter deleted automatically on January 1, 2027. What configuration is required?

A) Run a Lambda function daily on an EventBridge schedule to check the parameter's LastModifiedDate, send an SNS notification when it exceeds 90 days, and call `delete-parameter` on 2027-01-01
B) Parameter Store Advanced + NoChangeNotification policy (90 days) + Expiration policy (2027-01-01)
C) Keep it in Parameter Store Standard and automate notification and deletion by detecting no-change and expiration with CloudWatch Events (EventBridge) rules
D) Move it to Secrets Manager, set up 90-day rotation, and add a lifecycle policy that deletes the secret on the expiration date

**Answer: B**
Explanation: Parameter Policies are exclusive to the Parameter Store Advanced tier. `NoChangeNotification` raises a notification event through EventBridge if the value is not changed for the specified period. `Expiration` automatically deletes the parameter on the specified date. Both policies can be applied to a single parameter at the same time. The Standard tier (C) does not support Policies.

---

**Question 12.** Which of the following is NOT a correct reason why Session Manager is better than the traditional SSH/Bastion approach?

A) Port 22 does not need to be opened, and connecting with outbound 443 only, with no inbound SG rules, reduces the attack surface
B) IAM-based access control enables fine-grained permission assignment, even with tag, MFA, and time conditions
C) All session input and output are automatically recorded in S3/CloudWatch Logs, providing an audit trail without separate configuration
D) It uses a stronger encryption algorithm than SSH keys

**Answer: D**
Explanation: SSH already uses strong encryption (RSA 4096, ED25519, etc.). The claim that Session Manager uses "stronger encryption" than SSH is incorrect. Session Manager uses AWS KMS-based encryption, but this does not mean it is stronger than SSH encryption. The real advantages of Session Manager are A (no port required), B (fine-grained IAM control), C (automatic audit logging), plus removing the burden of SSH key distribution and making it easier to enforce MFA.

---

> 📚 **Case study**: In 2023, a mid-sized logistics company, Company E, disclosed its operational metrics one year after a full SSM rollout. Zero patch-related security incidents, a 65% reduction in operators' weekly manual work time, new server onboarding time from 8 hours to 15 minutes, and compliance audit preparation time from 3 weeks to 2 days. These numbers best show the "value of operations automation" that SSM provides. This is why the SOA-C02 exam gives SSM a heavy weighting.

## Week 6 Preview

Week 6 focuses on **IaC Operations**, centered on CloudFormation.

- Day 1: CloudFormation Fundamentals — Template structure, Stack lifecycle, cfn-signal
- Day 2: Change Set, Drift Detection, Rollback Trigger — safe CFn operation patterns
- Day 3: Nested Stack, Cross-Stack Reference, StackSets — large-scale multi-account IaC
- Day 4: Service Catalog, AppConfig, AppRegistry — self-service provisioning
- Day 5: Week 6 Review + 10 scenario questions

CloudFormation is the core of SOA-C02's "deployment, provisioning, automation" domain. Drift Detection, Change Set, StackSets appear frequently. If Week 5's SSM Automation is "instance-level automation," CloudFormation is "infrastructure-level automation." Combined, they form complete operational automation stack.
