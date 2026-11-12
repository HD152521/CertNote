# Day 1 - Systems Manager: Run Command·Session Manager·Patch Manager's Deep Story

Managing one EC2 is easy. SSH in, run commands, done. That one becomes ten, becomes hundreds, becomes thousands, everything collapses. How to distribute keys and rotate them, who did what when for audit, should port 22 be internet-exposed, how to safely apply patches simultaneously across thousands. AWS Systems Manager (SSM) exists to address "fleet-scale operations" directly. One name, actually ten independent features: Run Command, Session Manager, Patch Manager, State Manager, Inventory, Automation, under one umbrella.

Today we cover the three most-used — remote command execution (Run Command), shell access (Session Manager), automatic patching (Patch Manager) — not just "this feature exists" but **why SSM Agent chose pull over push**, how Session Manager enables shells without port 22 opening, and what operational philosophy backs Patch Baseline's approve-after-days number. DOP tests frequent SSM: "access without Bastion," "patch thousands simultaneously," "hybrid on-premise integration" are near-universal scenarios each test.

## SSM Agent — Why Pull Not Push

**All SSM features sit on SSM Agent**, a small daemon running in instances. Its design philosophy compresses all SSM thinking: **AWS doesn't push commands into instances; instances pull from AWS with an outbound request**.

Traditional remote management — SSH, WinRM, old configuration management — mostly uses push. Management server connects to target machine's open port (22, 5985) and sends commands. Targets must expose inbound ports, management must know all target IPs, network path must route management → target. At thousands of instances, this inbound exposure becomes a massive attack surface.

SSM Agent goes opposite. **Agent periodically polls SSM service endpoints** (`ssm`, `ssmmessages`, `ec2messages`) **with outbound HTTPS long-polling**. "Any work for me?" SSM responds with queued commands. Instances need zero inbound ports. Security group inbound can be completely empty. SSM works anyway. Session Manager gets shellless access *because* of this pull model.

> 💡 **Related Theory**: Push vs pull is an old distributed systems theme. Monitoring: Prometheus (pull) vs StatsD/Pushgateway (push). Configuration management: Puppet/Chef agents phone home (pull) vs centralized push. Pull's core advantage: **firewall-friendliness (outbound only)** and **self-registration** — new nodes reach central without central pre-knowing all node IPs. SSM chose pull, achieving "zero inbound" — strong security posture.

> 🔍 **Deeper**: For SSM Agent communication, three things all needed: (1) **Agent itself** — default in Amazon Linux 2/2023, recent Ubuntu, Windows Server AMIs post-2017. (2) **IAM Instance Profile** — `AmazonSSMManagedInstanceCore` policy needed. Without it, agent lacks permission to call SSM APIs, instance won't register as "managed". (3) **Network path** — public subnet needs internet gateway, private needs NAT, complete isolation needs `ssm`/`ssmmessages`/`ec2messages` VPC endpoints. Missing any, instance isn't "managed instance." First debug step: always check these three.

> ⚠️ **Pitfall**: Private subnet without NAT nor VPC endpoints = no SSM. Subtler: **building VPC endpoints but forgetting `ssmmessages`**. `ssm` endpoint alone makes Run Command work but Session Manager fails. Session Manager uses `ssmmessages` for bidirectional channels. Missing `ec2messages` (old Run Command channel) also causes issues. "Run Command works but only Session Manager fails" symptom is almost always `ssmmessages` endpoint omission. Three endpoints all required for full feature set.

## Run Command — Safety Mechanisms for Fleet-Scale Execution

Run Command "run same command on multiple instances simultaneously." Simple work becomes complex at fleet scale. nginx restart command on 3000 instances at once — if new config has typos, nginx won't start, 3000 instances die together. Run Command's real value isn't execution, it's **blast radius control with concurrency and error limits**.

```bash
aws ssm send-command \
  --document-name AWS-RunShellScript \
  --targets Key=tag:Environment,Values=prod \
  --parameters 'commands=["sudo systemctl restart nginx && systemctl is-active nginx"]' \
  --max-concurrency 10% \
  --max-errors 5 \
  --comment "Restart nginx on prod fleet"
```

`--max-concurrency 10%` = 10% of targets at once. 3000 instances = 300 waves. `--max-errors 5` = cumulative failures reach 5, **immediately stop entire rollout**. New config broken on first 300, 5 fail → stop. 2995 survive untouched. Without these numbers, Run Command is "kill everything fast method."

`--targets` selects instances; most powerful is tag-based (`Key=tag:Environment,Values=prod`). New instances with matching tags auto-included. Critical in dynamic environments (ASG).

> 💡 **Related Theory**: `max-concurrency` + `max-errors` = **progressive rollout** (canary deployment). Kubernetes RollingUpdate `maxSurge`/`maxUnavailable`, CodeDeploy deployment configs, Erlang supervisor restart intensity — all same: "change some gradually, stop if failures exceed threshold." Core: **fail-fast + circuit break** — detect problems in small blast, stop propagation. Run Command bakes this into command execution.

> 📚 **Case**: Teams often mistake Run Command for SSH loop, setting `--max-concurrency` to 100%. Company patched 200 servers with broken sed expression, parallel execution mangled configs → hundreds down instantly. Same command with `--max-concurrency 1 --max-errors 1` would stop at first server. Fleet commands need "validate on first instance" habit.

## Session Manager — Shellless Access and Bastion's End

Session Manager most changes operations. SSH keys, port 22, Bastion host — none needed. Shell access to instance without any.

```bash
aws ssm start-session --target i-1234567890abcdef0
```

How? Pull model again. SSM Agent holds bidirectional WebSocket-like channel on `ssmmessages`. When `start-session` runs, SSM service uses that channel for shell session relay. Your terminal ↔ SSM service ↔ (outbound channel) ↔ instance shell. No inbound connection. Empty security group inbound works, private subnet deep inside works.

This transforms everything. **Bastion disappears entirely.** Traditionally, private instance access meant Bastion in public subnet, SSH there, then SSH inside. Bastion always running, port 22 internet-exposed, patch target, most-desired attack target. Session Manager removes all three.

Access control via IAM. Who can `ssm:StartSession` to which instance, tag-conditional. All sessions in CloudTrail, inputs/outputs stream to CloudWatch Logs and S3, unalterable.

```bash
# Session logging (all keyboard input/output to S3 + CloudWatch + KMS)
aws ssm update-document \
  --name SSM-SessionManagerRunShell \
  --content file://session-config.json
```

For SSH tool integration:

```
# ~/.ssh/config
Host i-* mi-*
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
```

`ssh ec2-user@i-1234...` tunnels through SSM internally. Port 22 still internet-closed, SSH tooling unchanged.

> 💡 **Related Theory**: Session Manager is Zero Trust Network Access (ZTNA) applied. "Don't trust network perimeter, authenticate all access by identity + audit." Traditional Bastion = "inside network = trust." Session Manager authenticates each session via IAM, audits via CloudTrail. Google BeyondCorp, HashiCorp Boundary, Teleport are same philosophy. AWS embedded this into its own services.

> 🔍 **Deeper**: Session Manager port-forwards too. `aws ssm start-session --document-name AWS-StartPortForwardingSession --parameters '{"portNumber":["3306"],"localPortNumber":["13306"]}'` tunnels private RDS port 3306 to local 13306. Further, `AWS-StartPortForwardingSessionToRemoteHost` makes instance jump host — tunneling past to RDS. Session Manager replaces all Bastion jobs: shell access, file transfer (ProxyCommand), DB tunneling. Test pattern: "access private RDS with local DB client, no Bastion" → Session Manager port-forwarding.

> 🎯 **Scenario**: "Audit team: all prod server commands must log. Current SSH+Bastion setup." → Answer is remove Bastion, switch to Session Manager with logging (CloudWatch Logs + S3 + KMS). SSH in traditional setup lets users clear shell history; Session Manager logs from AWS side, operator can't alter. Three-layer audit complete: IAM (who), CloudTrail (when), session log (what).

## Patch Manager — The Philosophy of Approve-After-Days

Patch Manager automates OS/application patching. Hardest part isn't "which patch," it's **"when."** Microsoft releases Tuesday patches; applying prod that day risks that patch's bugs. Too long waiting leaves known vulnerabilities exposed. Core tension managed by **Patch Baseline's approve-after-days**.

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

`ApproveAfterDays: 7` is core: "Security/important patches auto-approve 7 days after release." This 7-day buffer lets worldwide users test first, surface problems if any, free validation. Development uses 0 (immediate), staging 3, prod 7 — staged testing before prod.

Patch Manager three components mesh:

- **Patch Baseline**: Policy (CVE class, severity, approval delay)
- **Patch Group**: Tag assigns baseline to instances (`Patch Group=Prod-Linux` tag)
- **Maintenance Window**: Cron schedule ("Saturday 3am")

```bash
# Saturday 3am start, 4hr window, 1hr cutoff
aws ssm create-maintenance-window \
  --name "Prod-Patching" \
  --schedule "cron(0 3 ? * SAT *)" \
  --duration 4 --cutoff 1

aws ssm register-task-with-maintenance-window \
  --window-id mw-abc \
  --task-arn AWS-RunPatchBaseline \
  --task-type RUN_COMMAND \
  --task-invocation-parameters '{"RunCommand":{"Parameters":{"Operation":["Install"]}}}' \
  --max-concurrency 10% --max-errors 5
```

`cutoff 1` often confuses: 4hr window, 1hr cutoff = **don't start new work 1hr before window end** (already-running work completes). 3am-7am window, cutoff 1hr, so 6am onwards no new instance patching starts. 30-min per-instance patch means 6am start → 6:30am done, before 7am. Cutoff is "work doesn't overflow window."

Again `--max-concurrency 10% --max-errors 5` — Patch Manager internally calls Run Command (`AWS-RunPatchBaseline`). Patches roll progressively, failures halt.

| Task | Action | Purpose |
|------|--------|---------|
| **Scan** | Check need, don't install | Compliance reporting, preview |
| **Install** | Apply patches, reboot if needed | Actual patch window |

> 💡 **Related Theory**: Approve-after-days = **bake time** in reliability engineering. Let changes "cook" a period, see regression. Canary deploy bake, AppConfig final-bake-time, CodeDeploy traffic shift+observe all same: "problems show over time." Patch Manager brings this discipline to security patching — dev→staging→prod with increasing bake enforces quality.

> 🔍 **Deeper**: Baselines have approval rules plus **explicit approved/denied patch lists** (approved patches / rejected patches). Certain KB numbers can be forever-denied (conflict with driver). Zero-day hits, add to approved patches, bypass approve-after-days. Approval rules = automated peacetime, explicit lists = exception handling.

> ⚠️ **Pitfall**: Patch Group tag key exact: `Patch Group` (space, capital P/G). `PatchGroup` or `patch group` unrecognized, instance gets default baseline or none. "Patch applied to wrong baseline" symptom = almost always this tag typo.

## Summary

Today four parts. First, **SSM Agent pull model needs zero inbound**, Session Manager's foundation. Three things all required: agent, IAM, network path. Second, **Run Command's true value is `max-concurrency`/`max-errors`** blast radius control. Third, **Session Manager replaces Bastion entirely**, ZTNA enforcement, triple-layer audit. Fourth, **Patch Baseline's approve-after-days is bake time discipline**, Baseline(what)·Group(where)·Window(when) split responsibility.

Next we cover State Manager and Inventory. "Desired state enforcement" principle extends this pattern to ongoing infrastructure compliance.

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
