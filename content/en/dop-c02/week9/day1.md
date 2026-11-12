# Day 1 - Systems Manager: Run Command·Session Manager·Patch Manager's Deep Story

Managing one EC2 instance is easy. You SSH in and type commands. But the moment that one instance becomes ten, then a hundred, then thousands, everything falls apart. How do you distribute and rotate keys? How do you audit who ran which command and when? Is it right to leave port 22 open to the internet? How do you apply patches to all of them at once, and safely? AWS Systems Manager (SSM) is a set of tools built to tackle this problem of "fleet-scale operations" head on. It has a single name, but in reality it is a dozen independent features - Run Command, Session Manager, Patch Manager, State Manager, Inventory, Automation, and more - gathered under one umbrella.

Today we look at the three most frequently used features under that umbrella: remote command execution (Run Command), shell access (Session Manager), and patch automation (Patch Manager). We go beyond "this feature exists" and dig into why SSM abandoned SSH for a pull model built on the SSM Agent, how Session Manager brings up a shell without opening a single port, and what operational philosophy is packed into one number: the Patch Baseline's approval delay (approve-after-days). On the DOP exam, SSM is one of the heaviest areas for a single service, and scenarios such as "connect without a Bastion," "patch thousands of instances at once," and "on-premises integration" show up in nearly every sitting.

## SSM Agent — Why Pull Instead of Push

Every SSM feature stands on top of a small daemon running inside the instance, the **SSM Agent**. How this agent works compresses the design philosophy of SSM as a whole. The key point is that it is a model in which **AWS does not push commands into the instance; the instance reaches out to AWS and pulls its work**.

Traditional remote management tools - SSH, WinRM, old-style configuration management - are mostly push. The management server connects to an open port (22, 5985) on the target machine and throws commands at it. This model requires the target machine to keep an inbound port open, requires the management server to know the IP of every target, and requires a network path open from the management server to the target. When the fleet grows to thousands of machines, that inbound exposure becomes an enormous attack surface.

The SSM Agent goes in the opposite direction. The agent periodically makes an **outbound HTTPS long poll** to the SSM service endpoints (`ssm`, `ssmmessages`, `ec2messages`). When it asks "Do you have any work for me?", the SSM service returns the commands queued up as the response. The instance does not need to open a single inbound port. SSM works even when the security group's inbound rules are completely empty. This is the fundamental reason Session Manager can bring up a shell without port 22.

> Push versus pull is an old theme in distributed systems. In monitoring it is the contrast between Prometheus (pull) and StatsD/Pushgateway (push); in configuration management it is the pull model where Puppet/Chef agents check in with the master. The core advantages of the pull model are **firewall friendliness (only outbound is needed)** and **self-registration** - a new node connects to the center on its own, so the center does not need to know every node's IP in advance. By choosing the pull model, SSM gained the strong security posture of "zero inbound."

> For the SSM Agent to communicate, three things must all be in place. (1) **The agent itself** - included by default since 2017 in the official AMIs for Amazon Linux 2/2023, recent Ubuntu, and Windows Server. (2) **An IAM Instance Profile** - a role with the `AmazonSSMManagedInstanceCore` managed policy attached. Without it, the agent has no permission to call the SSM APIs and does not even get registered as a "managed instance." (3) **A network path** - the SSM endpoints must be reachable: through an internet gateway for a public subnet, through a NAT gateway for a private one, or through three VPC interface endpoints (`ssm`/`ssmmessages`/`ec2messages`) for a fully isolated environment. If any one of the three is missing, the instance does not show up in the "managed nodes" list. The first step of debugging is always to check these three.

> ⚠️ **Pitfall**: In a private subnet with neither NAT nor VPC endpoints, SSM does not work. But a subtler pitfall is **forgetting `ssmmessages` when creating the VPC endpoints**. If you create only the `ssm` endpoint, Run Command's command polling works but Session Manager does not, because Session Manager uses `ssmmessages`, a separate two-way message channel. Likewise, `ec2messages` is the older Run Command channel, so it is safest to create it as well. The symptom "Run Command works but only Session Manager fails" is almost always a missing `ssmmessages` endpoint.

## Run Command — Safeguards for Fleet-Scale Command Execution

Run Command does a simple job: "run the same command on many instances at the same time." But a simple job becomes not so simple at the scale of thousands. Suppose you throw a single command that restarts nginx at 3,000 instances simultaneously, and the new configuration has a typo so nginx does not come up. All 3,000 die at once. The real value of Run Command is not running commands but the **concurrency and error controls** that govern this blast radius.

```bash
aws ssm send-command \
  --document-name AWS-RunShellScript \
  --targets Key=tag:Environment,Values=prod \
  --parameters 'commands=["sudo systemctl restart nginx && systemctl is-active nginx"]' \
  --max-concurrency 10% \
  --max-errors 5 \
  --comment "Restart nginx on prod fleet"
```

`--max-concurrency 10%` means run on only 10% of all targets at a time. With 3,000 instances, it spreads in waves of 300. `--max-errors 5` means that once cumulative failures exceed 5, **stop the entire rollout immediately**. If the new configuration has a typo and 5 of the first 300 instances fail, Run Command does not start the next batch. The other 2,995 instances survive untouched. Without these two numbers, Run Command is just a fast way to "kill everything at the same time."

`--targets` is how you pick instances, and the most powerful form is tag-based (`Key=tag:Environment,Values=prod`). You do not have to list instance IDs one by one, and newly launched instances are included automatically as long as the tag matches. This is decisive in environments where the fleet changes dynamically (ASG).

> The combination of `max-concurrency` + `max-errors` is a **progressive rollout (canary)** for distributed deployment, pure and simple. Kubernetes' RollingUpdate `maxSurge`/`maxUnavailable`, CodeDeploy's deployment configurations, even the restart intensity of an Erlang/OTP supervisor all express the same idea: "change only a portion at a time, and stop when failures exceed a threshold." The goal is to **detect failure quickly and cut off its propagation (fail-fast + circuit break)**. Run Command builds this pattern into command execution itself.

> 📚 **Case**: In the field it is common to mistake Run Command for an SSH loop and set `--max-concurrency` to 100%. In one company, for an urgent security patch, a command that bulk-edited configuration files with `sed` was run against the entire fleet at 100% concurrency; a single sed expression corrupted the configuration files and hundreds of services went down at the same time. Had the same command been sent with `--max-concurrency 1 --max-errors 1`, it would have been stopped at the very first instance. Fleet commands always call for the canary habit of "verify on the first one."

## Session Manager — Shells Without Ports, and the End of the Bastion

Session Manager is the SSM feature that has changed operations the most. It connects you to an instance's shell without SSH keys, without port 22, and without a Bastion host.

```bash
aws ssm start-session --target i-1234567890abcdef0
```

How does this one line work? It is exactly the pull model we saw above. The SSM Agent keeps open a two-way, WebSocket-like channel to the `ssmmessages` endpoint, and when you run `start-session`, the SSM service relays the shell session through that channel. My terminal <-> SSM service <-> (outbound channel) <-> the shell inside the instance. From the instance's point of view there is no inbound connection at all. The connection works even if the security group's inbound rules are completely empty, and even if the instance sits deep inside a private subnet.

The implication is large. **The Bastion host disappears entirely.** Traditionally, reaching a private instance meant placing a Bastion (jump box) in a public subnet, SSHing to it, and then SSHing again into the internal network - a two-hop jump was the standard. The Bastion had to be running at all times, exposed port 22 to the internet, was a patching target, and was the most tempting attack target. Session Manager removes this Bastion completely.

Access control is done with IAM. You control who can perform `ssm:StartSession` on which instances through IAM policies, even down to tag conditions. Every session is recorded in CloudTrail, and the entire input and output during a session can be streamed to CloudWatch Logs and S3.

```bash
# Configure session logging (all keystrokes/output to S3 + CloudWatch Logs)
aws ssm update-document \
  --name SSM-SessionManagerRunShell \
  --content file://session-config.json \
  --document-version '$LATEST'
# Specify the CloudWatch Logs group + S3 bucket + KMS key in session-config.json
```

For cases where you are reluctant to give up the existing SSH toolchain (scp, rsync, Ansible's ssh transport), there is also a way to layer SSH on top of Session Manager.

```
# ~/.ssh/config
Host i-* mi-*
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
```

With this, `ssh ec2-user@i-1234...` internally goes in through the SSM channel as a ProxyCommand. Port 22 stays closed to the internet, and the standard SSH tools keep working as they are.

> Session Manager's model is a form of Zero Trust Network Access (ZTNA): the principle of "do not trust the network perimeter; authenticate, authorize, and audit every access based on identity." Whereas the traditional Bastion follows a "once you are inside the internal network, you are trusted" model, Session Manager authenticates every session with an IAM identity and audits it with CloudTrail. Google's BeyondCorp, HashiCorp Boundary, and Teleport are tools with the same philosophy. In effect, AWS built this ZTNA into its own service.

> Session Manager also does port forwarding. With `aws ssm start-session --document-name AWS-StartPortForwardingSession --parameters '{"portNumber":["3306"],"localPortNumber":["13306"]}'` you can tunnel port 3306 of a private RDS instance to local port 13306. Going further, if you use `AWS-StartPortForwardingSessionToRemoteHost`, the instance serves as a jump host and forwards all the way to an RDS endpoint beyond it. In other words, Session Manager alone replaces everything the Bastion used to do: SSH access + file transfer (ProxyCommand) + DB tunneling. If the exam asks for "connect to a private RDS with a local DB client, without a Bastion," the answer is Session Manager port forwarding.

> 🎯 **Scenario**: "The audit team requires that everything an operator types on prod servers be recorded. The current setup is SSH keys + a Bastion. What should be done?" — The answer is to remove the Bastion, switch to Session Manager, and turn on session logging (CloudWatch Logs + S3 + KMS). In an SSH environment users can erase their shell history, so it cannot be trusted, but Session Manager records session input and output on the AWS side in a tamper-proof way. IAM controls who can connect, CloudTrail records who opened a session and when, and the session log records what they typed - a three-layer audit is complete.

## Patch Manager — The Operating Philosophy of the Approval Delay

Patch Manager automates OS and application patching. But the hardest part of patch automation is not "which patches to apply" but "**when** to apply them." If Microsoft releases a new security patch on a Tuesday and you install it on prod that same day, the patch itself may contain a bug and take your servers down. Conversely, if you postpone too long, you are left exposed to known vulnerabilities. The core mechanism for handling this tension is the **Patch Baseline's approval delay (approve-after-days)**.

```bash
aws ssm create-patch-baseline \
  --name "Prod-Linux-Baseline" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules '{
    "PatchRules": [{
      "PatchFilterGroup": {
        "PatchFilters": [
          {"Key":"CLASSIFICATION","Values":["Security","Bugfix"]},
          {"Key":"SEVERITY","Values":["Critical","Important"]}
        ]
      },
      "ApproveAfterDays": 7,
      "ComplianceLevel": "CRITICAL"
    }]
  }'
```

`ApproveAfterDays: 7` is the key. It is a rule that says "Security and important-severity patches are automatically approved 7 days after release." During this 7-day buffer, other users around the world install the patch first and make noise if there is a problem. You get a kind of crowd-sourced validation for free. The standard pattern is to tier it: `ApproveAfterDays: 0` (immediate) for dev, 3 days for staging, and 7 days for prod. If the same patch blows up in dev first, it is filtered out before it reaches prod.

The full picture of Patch Manager is three things meshing together.

- **Patch Baseline**: The policy for which patches to approve (CVE classification, severity, approval delay).
- **Patch Group**: Which baseline applies to which instances. When you attach the tag `Patch Group=Prod-Linux` to an instance, that baseline is applied.
- **Maintenance Window**: When to apply. You set a time such as "Saturday at 3 a.m." with a cron schedule.

```bash
# Start Saturday at 3 a.m., 4-hour window, 1-hour cutoff
aws ssm create-maintenance-window \
  --name "Prod-Patching" \
  --schedule "cron(0 3 ? * SAT *)" \
  --duration 4 --cutoff 1 \
  --allow-unassociated-targets

aws ssm register-task-with-maintenance-window \
  --window-id mw-abc \
  --task-arn AWS-RunPatchBaseline \
  --task-type RUN_COMMAND \
  --task-invocation-parameters '{"RunCommand":{"Parameters":{"Operation":["Install"]}}}' \
  --max-concurrency 10% --max-errors 5
```

`cutoff 1` is often confusing here. With a 4-hour window and a 1-hour cutoff, **no new tasks are started during the last hour before the window ends** (tasks already started run to completion). That is, in a 3 a.m.-7 a.m. window, no new instance patching starts after 6 a.m. If patching one instance takes 30 minutes on average, a task started at 6 a.m. finishes at 6:30 a.m. and wraps up inside the window. The cutoff is a safety margin that keeps work from running over the window.

And in the task above, `--max-concurrency 10% --max-errors 5` appears again. That is because Patch Manager internally calls Run Command (`AWS-RunPatchBaseline`). Patching also spreads gradually, and stops when failures accumulate. If a reboot is needed during patching, the instance is rebooted (`Operation: Install`).

| Operation | Behavior | Use |
|------|------|------|
| **Scan** | Only checks whether patches are needed; installs nothing | Compliance reporting, pre-checks |
| **Install** | Actually applies patches, rebooting if needed | The actual patch window |

> The approval delay (approve-after-days) is the same as the **bake time** concept in reliability engineering. Before rolling out a new change everywhere, you leave a period of observation in which to discover regressions. A canary deployment's bake, AppConfig's final-bake-time, and the observation period after a CodeDeploy traffic shift all follow the same principle. It nails the rule of thumb that "the risk of a change reveals itself over time" into policy. Lengthening the approval delay from dev to staging to prod means differentiating bake time by environment.

> Besides approval rules, a Patch Baseline also has **explicit approve/reject lists** (approved patches / rejected patches). You can unconditionally reject a specific KB number or package, or force approval of one that no approval rule catches. For example, if you put "this kernel patch conflicts with our driver, so reject it permanently" into rejected patches, that patch will never be installed no matter how many days pass under the approval rule. Conversely, when an urgent zero-day hits, you do not wait for `ApproveAfterDays`; you put it directly into approved patches and apply it immediately. The division of labor is: approval rules are peacetime automation, and explicit lists are exception handling.

> ⚠️ **Pitfall**: The key of the Patch Group tag must be exactly `Patch Group` (with the space, exact capitalization). If you attach it as `PatchGroup` (no space) or `patch group` (lowercase), Patch Manager does not recognize it, and the instance is patched with the default baseline or dropped from patching altogether. It is a reserved tag key written into the AWS documentation, so you cannot change it freely. The symptom "patches are applied with the default baseline instead of the intended one" is almost always a typo in this tag key.

## State Manager and Hybrid Activation — The Periphery of Patch Automation

They are side branches of today's topic, but two more things appear bundled together on the exam. One is State Manager and the other is Hybrid Activation.

**State Manager** "enforces a desired state on a regular basis." If Run Command is a one-off command, a State Manager Association runs periodically like cron and reports the result as compliance. For example, you can enforce "every prod instance must always have the CloudWatch Agent installed" every 7 days.

```bash
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{"action":["Install"],"name":["AmazonCloudWatchAgent"]}' \
  --schedule-expression "rate(7 days)" \
  --apply-only-at-cron-interval
```

What differs from cron is **central management + compliance reporting + automatic application to new instances**. A newly launched instance automatically gets the association as long as its tags match, so a standard state is guaranteed after its first boot. We cover this in depth tomorrow (Day 2).

**Hybrid Activation** extends SSM beyond EC2. On-premises servers and VMs in other clouds also become SSM-managed targets once you install the SSM Agent and register them with an activation code. In this case the instance ID carries the prefix `mi-` (managed instance) rather than `i-`.

```bash
aws ssm create-activation \
  --default-instance-name onprem-1 \
  --iam-role SSMOnPremRole \
  --registration-limit 100 \
  --expiration-date "2026-12-31T00:00:00Z"
# On-premises machine: amazon-ssm-agent -register -code ... -id ... -region ap-northeast-2
```

With this, you use Run Command, Session Manager, Patch Manager, and Inventory on on-premises servers in exactly the same way. In a hybrid environment, "patching on-premises and cloud from one console" becomes possible. It pairs with ECS Anywhere/EKS Anywhere, which do the same thing for container workloads.

> 🎯 **Scenario**: "We want to manage the 200 physical servers left in the data center and our AWS EC2 fleet under one patch policy. We do not want to operate two separate patching tools." — The answer is to install the SSM Agent on the on-premises servers, register them with Hybrid Activation, and then apply the same Patch Baseline, Patch Group, and Maintenance Window as for EC2. `mi-` instances are also included as-is in tag-based targeting and compliance reporting. You see the patch compliance of the hybrid fleet at a glance in a single console.

## Summary

Today's picture has four parts. First, the **SSM Agent is a pull model**, so no inbound port is needed, and that is why Session Manager works without port 22 - for it to work, the agent, IAM, and the network path must all be right. Second, **the real value of Run Command is in the `max-concurrency`/`max-errors`** blast-radius controls. Third, **Session Manager removes the Bastion entirely** as a ZTNA tool, replaces even DB tunneling with port forwarding, and audits the whole session in a tamper-proof way. Fourth, **Patch Manager's approve-after-days is bake time turned into policy**, and the three pieces Baseline + Patch Group + Maintenance Window mesh together to share the responsibility of "what, where, and when" to patch.

In the next article we look deeply at State Manager and Inventory. We follow how the abstraction of "enforcing a desired state on a regular basis" shares the same roots as Kubernetes and Puppet, and on to a data pipeline that streams the collected inventory to S3 and queries it with SQL through Athena.

---

## 📝 Practice Questions

**Question 1.** In a private subnet EC2 instance, Run Command works normally but only Session Manager fails with "connection failed." What is the most likely cause?

A) The IAM instance profile lacks AmazonSSMManagedInstanceCore
B) The `ssmmessages` VPC interface endpoint is missing
C) The SSM agent is not installed
D) The instance type is too small

**Answer: B**

Explanation: Run Command working means that IAM (A), the agent (C), and the basic `ssm` endpoint path are all fine. Session Manager additionally uses the `ssmmessages` endpoint, a bidirectional message channel, and if only this one is missing, you get exactly this symptom: Run Command works and only Session Manager fails. To use all of SSM in a private subnet, you must create all three endpoints: `ssm`, `ssmmessages`, and `ec2messages`. The instance type (D) is unrelated to SSM operation.

---

**Question 2.** You deploy a configuration change command to a 3000-instance prod fleet with Run Command. How do you prevent a total outage even if a bad configuration is applied?

A) `--max-concurrency 100% --max-errors 100%`
B) Roll out gradually with `--max-concurrency 10% --max-errors 5` + automatically stop when the failure threshold is reached
C) Run on all instances at the same time and then monitor
D) Connect to each one over SSH and run manually

**Answer: B**

Explanation: `max-concurrency` spreads the change to only 10% (300 instances) at a time, and `max-errors 5` immediately halts the entire rollout when cumulative failures reach 5. If a bad configuration is applied, failures accumulate in the first batch and the rollout stops, protecting most instances. This is a fail-fast + circuit break pattern. A is a way to take everything down at once, C has no control mechanism, and D is unrealistic at the scale of 3000 instances and also hard to audit.

---

**Question 3.** Audit requirement: "Every command an operator runs on a prod server must be recorded in a tamper-proof way." The current setup is SSH keys + a bastion. What is the most appropriate transition?

A) Strengthen sudo logging on the bastion
B) Switch to Session Manager + enable session logging (CloudWatch Logs + S3 + KMS), control access with IAM, and audit session starts with CloudTrail
C) Rotate SSH keys frequently
D) Introduce a VPN

**Answer: B**

Explanation: Shell history in an SSH environment can be erased by the user, so it cannot be trusted as audit evidence. Session Manager records session input and output on the AWS side, so operators cannot tamper with it, and a three-tier audit is completed: IAM (who can connect), CloudTrail (when the session started), and the session log (what was executed). At the same time the bastion is removed, so the exposure of port 22 also disappears. A and C leave the fundamental limitations of the SSH model, and D is unrelated to auditing.

---

**Question 4.** What is the most accurate meaning of `ApproveAfterDays: 7` in a patch baseline in a prod environment?

A) Do not install patches for 7 days and install them all at once later
B) Security and critical patches are automatically approved 7 days after release — securing a bake time for other users to validate them first
C) Scan for patches every 7 days
D) Reboot instances after 7 days

**Answer: B**

Explanation: approve-after-days is a buffer period from patch release until automatic approval. During these 7 days you get the crowd-validation effect of other users around the world applying the patch first and surfacing problems. It is the bake time of reliability engineering turned into policy. The standard is to differentiate by environment: dev 0 days (immediate), staging 3 days, prod 7 days. It is unrelated to the scan cycle (C) or rebooting (D).

---

**Question 5.** A maintenance window has `--duration 4 --cutoff 1` and starts at 3 AM. What is the effect of cutoff?

A) Patching runs for only 1 hour
B) No new tasks are started from 1 hour before the window ends (6 AM) — tasks that have already started run to completion
C) Repeats every hour
D) A 1-hour timeout after a task starts

**Answer: B**

Explanation: Cutoff is a safety margin that prevents starting new tasks before the window ends. In a 3 AM to 7 AM window with a cutoff of 1, no new instance patching starts after 6 AM. It prevents a task from running wild well past the window boundary. Tasks that started before 6 AM continue to the end.

---

**Question 6.** How do you manage 200 physical servers in a data center and an EC2 fleet together under a single patch policy?

A) Operate a separate patching tool for the physical servers
B) Install the SSM agent on the physical servers + register them with a hybrid activation (`mi-` ID), then apply the same patch baseline, patch group, and maintenance window
C) Migrate all physical servers to EC2
D) Patch the physical servers manually

**Answer: B**

Explanation: If you register on-premises servers as SSM managed nodes (`mi-` prefix) with a hybrid activation, you can use Run Command, Patch Manager, and Inventory the same as with EC2. They are included in the same tag-based targeting and compliance reporting, so you manage the hybrid fleet from a single console. A separate tool (A) doubles the operational burden, migration (C) is excessively costly, and manual (D) is unrealistic at scale.

---

**Question 7.** What is the fundamental reason the SSM agent works without any inbound ports?

A) Because AWS pushes commands to the instance
B) Because the agent uses a pull model that long-polls the SSM endpoint outbound, so no inbound connection is needed
C) Because security groups automatically allow SSM traffic
D) Because SSM uses UDP

**Answer: B**

Explanation: The SSM agent is a pull model in which the instance reaches out to the SSM service (outbound HTTPS) to fetch work. The instance does not need to open a single inbound port, which minimizes the attack surface. This pull model is the fundamental principle that lets Session Manager open a shell without port 22. The push model (A) is the way of traditional SSH and requires inbound exposure.

---

## 📌 Today's Summary

The four key takeaways from today are as follows. First, the SSM agent is a pull model in which the instance polls the SSM endpoint outbound, so no inbound ports are needed, and to work, three things must all be in place: the agent, IAM (AmazonSSMManagedInstanceCore), and the network path (`ssm`/`ssmmessages`/`ec2messages`). Second, the core value of Run Command lies in the blast radius control of `max-concurrency`/`max-errors` (fail-fast + circuit break). Third, Session Manager is a ZTNA tool that removes the bastion and port 22, replaces even DB tunneling with port forwarding, and audits the entire session in a tamper-proof way. Fourth, Patch Manager approve-after-days is bake time turned into policy, and the three elements Patch Baseline (what), Patch Group (where), and Maintenance Window (when) work together, internally calling Run Command to roll out gradually.
