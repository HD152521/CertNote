# Day 2 - Rereading Domains 3 and 4: Deploy Automatically, Lock Down with Least Privilege

Domain 3 (Deployment, Provisioning, and Automation, 18%) and Domain 4 (Security and Compliance, 16%) look like opposites at first glance. One is "change things quickly," the other is "keep people from changing things carelessly." But the two domains are two sides of the same question: **how do you handle change safely?** Deployment automation makes change fast and reversible, and security confines the authority to make that change to the minimum. Security without fast deployment paralyzes operations, and fast deployment without security mass-produces incidents.

Instead of skimming the two domains by keyword, this post digs into why CloudFormation was designed to be "declarative and idempotent," what mathematical trade-offs deployment policies make between availability and cost, the internal mechanism by which Session Manager replaces SSH, and what decision tree IAM policy evaluation follows.

## The Roots of IaC: Why Declarative Beat Imperative

When "reviewing" CloudFormation you memorize stacks, templates, and Change Sets, but the bigger story underneath is **the history of declarative beating imperative.** Grasp this difference and all of IaC falls into place at a glance.

Imperative provisioning writes down a **procedure**: "create this, then connect that, then turn on this setting." Early automation scripts (bash, early tools) worked this way. There are two problems: (1) if the script fails midway, the system is left in a half-finished state (only partly created), and (2) if you run the same script twice, it creates duplicates or conflicts (no idempotency).

Declarative provisioning writes down not a procedure but the **desired final state**. You declare "this VPC, this subnet, and this EC2 must exist," and the tool compares against the current state and creates or fixes only the difference. CloudFormation, Terraform, and CDK all work this way. The key benefit is **convergence**: no matter how many times you run it, and no matter what state you start from, it ends up converging on the declared state. So declarative is inherently idempotent, and it is safe to rerun a failed deployment.

CloudFormation's automatic rollback is also possible thanks to this declarative model. If one resource fails during stack creation, CloudFormation reverts everything created up to that point and **converges back to the previous state** (rollback). With an imperative script you would have to track "how far it got" one by one and delete in reverse order, but declarative has a clear target, the "previous declared state," so rollback is clean.

> 💡 **Related theory**: Declarative versus imperative is a long-standing topic in programming paradigms (the same distinction as SQL being declarative and C being imperative). The decisive reason declarative won in infrastructure is the **state reconciliation loop**. Kubernetes controllers, Terraform's plan/apply, and CloudFormation's drift detection all use the same pattern: compute the difference (diff) between the "desired state" and the "actual state," and execute only the actions that bring that difference to zero. This reconciliation loop has the same structure as feedback control in control theory. Drift Detection is exactly the feature that exposes this diff computation in a form people can read: if someone changes something by hand in the console and the actual state departs from the desired state (drift), it reports the difference.

## The Math of Deployment Policies: The Triangle Trade-off of Availability, Speed, and Cost

Memorizing the deployment policy table (All at once / Rolling / Immutable / Blue-Green / Canary) is easy. The hard part is choosing "which is right" in a scenario, and for that you must understand where each policy stands on the three axes of **availability, rollback speed, and cost**.

The key insight is this: **the cost of zero-downtime deployment is ultimately "spare capacity."** To reduce downtime, you must set aside separate room to bring up the new version, and that room is the cost.

- **All at once**: Replaces all existing instances with the new version simultaneously. Zero spare capacity (cheapest), but total downtime at the moment of replacement. If it fails, everything is affected.
- **Rolling**: Replaces a portion at a time, sequentially. Zero spare capacity, but available capacity temporarily drops by the number of instances being replaced (risk of capacity shortage). Rollback requires rolling again.
- **Rolling with Additional Batch**: Brings up an extra batch before replacing, to prevent the capacity drop. Maintains capacity at a small extra cost.
- **Immutable**: Brings up the entire new version in a completely new ASG, then swaps. A temporary 2x cost for the new ASG, but the existing environment remains intact, so rollback is clean.
- **Blue/Green**: Runs two independent environments (blue = old, green = new) and switches DNS or the Target Group. 2x the environment cost, but rollback is instant with **a single switch**.
- **Canary**: Gradually exposes the new version to traffic, such as 5% -> 25% -> 100%. A problem is exposed only to a small number of users, and you expand after verifying with metrics.

| Policy | Downtime | Rollback speed | Extra cost | Key point |
|------|----------|-----------|-----------|------|
| All at once | Yes | Slow | 0 | Dev/non-critical |
| Rolling | None (capacity reduced) | Slow (re-roll) | 0 | Cost first |
| Rolling + Batch | None | Slow | Small | Maintain capacity |
| Immutable | None | Fast (existing kept) | Temporary 2x | Safe replacement |
| Blue/Green | None | Instant (switch) | 2x | Instant rollback required |
| Canary | None | Fast (reduce exposure) | Small to medium | Gradual verification |

The real reason Blue/Green rollback is "instant" is that **it leaves the old version in place instead of deleting it.** The switch only changes traffic routing (a DNS record or an ALB Target Group), so when a problem occurs, rollback is a single action of reverting the routing. However, if you use a DNS switch, **TTL caching** means some clients keep going to the old version for a while; so when you need a fast switch, use an ALB Target Group swap (takes effect immediately) rather than DNS. Another trap is the **database schema**. If blue and green share the same DB, the moment you change the schema for green, blue can break. So the real difficulty of zero-downtime deployment lies not in the application but in DB migration (backward-compatible schema changes, the expand-contract pattern).

The 2017 AWS S3 us-east-1 major outage is a symbolic event showing the risk of deployment and automation. An engineer, debugging a slowdown in the billing system, tried to remove some servers with a playbook command, but **entered the command's input parameter incorrectly**, and far more servers were removed than intended. Those servers handled S3's index and placement subsystems, so they stalled in a cascade, and the restart needed for recovery took several hours (those subsystems had not been fully restarted in a long time, so booting took longer than expected). There were three lessons: (1) powerful manual commands need safeguards (a cap on the maximum that can be removed at once), (2) automation tools must validate incorrect input, and (3) recovery procedures (including restarts) must be rehearsed regularly to actually work. This is the background for why the SOA exam repeatedly stresses "minimize manual operations + automation + safeguards."

## How Session Manager Replaces SSH: Opening a Shell Without Opening a Port

In Domain 3 you memorize the 7 SSM components, but for Session Manager you need to **know the internal behavior** to see why it is so powerful. The core of Session Manager is that it starts a shell on EC2 "without opening a single inbound port."

Traditional SSH access requires opening port 22 inbound: you allow 22 in the security group, manage key pairs, and usually place a bastion host (jump server). The problems of this model are clear. An open port is an attack surface, keys risk being lost or leaked, and the bastion is yet another thing to manage.

Session Manager flips this model. The **SSM Agent inside EC2 first establishes an outbound connection to the SSM service** (outbound 443, HTTPS). When an operator starts a session, traffic flows over this pre-established outbound channel, which means the EC2 side can have zero inbound ports. Access is controlled not by key pairs but by IAM (who can open a session to which instance), every session is recorded in CloudTrail, and session logs can be sent to S3 or CloudWatch Logs.

This pattern of "building a reverse channel from outbound connections alone" is not new; it is the classic technique of a reverse tunnel for controlling a machine behind a firewall from outside. Session Manager provides it as a managed service, with IAM authentication and auditing attached. It also works for instances in a private subnet (no internet gateway) as long as they reach SSM through a VPC Interface Endpoint (PrivateLink), opening a shell without any internet exposure.

Session Manager's security model is one implementation of the **Zero Trust** philosophy. Traditional network security was a perimeter model of "trust the internal network, block the outside," and the bastion host was the door in that perimeter. Zero Trust is the principle that "you do not trust based on network location; every access is authenticated, authorized, and recorded by identity." Session Manager's change from IP/port-based access (SSH port 22 + bastion) to identity-based access (IAM policy + CloudTrail audit) is exactly this shift. It is why, on the exam, when "remove the burden of managing SSH keys and strengthen auditing" appears, the answer is almost always Session Manager: this is not mere convenience but a shift in the security paradigm.

## IAM Policy Evaluation: A Decision Tree in Which an Explicit Deny Beats Everything

In Domain 4 you memorize the evaluation order "SCP -> Permission Boundary -> Identity -> Resource," but strictly speaking this is not an order but a **decision tree**. The algorithm AWS uses to decide "should this request be allowed?" rests on two unwavering principles.

Principle 1: **the default is implicit deny.** If no policy explicitly allows it, it is denied. A permission is not "something that works because nothing blocks it" but "something that works only when explicitly allowed."

Principle 2: **an explicit deny beats everything.** If a Deny is explicitly set in any policy, the result is denial even if 100 other policies Allow. Deny is an absolute veto.

On top of these two principles, evaluation examines every policy type. SCPs (organization guardrails), Permission Boundaries (the upper limit of an IAM entity's permissions), Identity policies (policies attached to users/roles), Resource policies (such as S3 bucket policies), and Session policies all go in as inputs. These form an **AND intersection**: the SCP must allow **and** the Boundary must allow **and** the Identity policy must allow before the request finally passes. If any one is missing (or denies), the request is blocked.

```
Request evaluation decision tree
─────────────────────────────────
1. Is there an explicit Deny anywhere? ── Yes ──► Deny (end)
                │ No
                ▼
2. Does the SCP allow this action? ── No ──► Deny
   (applies only to org member accounts)
                │ Yes
                ▼
3. Does the Permission Boundary allow it? ── No ──► Deny
   (only for entities with a Boundary set)
                │ Yes
                ▼
4. Is there an explicit Allow in an
   Identity or Resource policy? ── No ──► Deny (implicit deny)
                │ Yes
                ▼
            Allow
```

> ⚠️ **Pitfall**: An SCP **does not grant permissions; it only restricts.** Even if you write "Allow S3FullAccess" in an SCP, the users in that account do not automatically gain the permission. An SCP only defines "the ceiling (upper limit) of permissions possible in this account," and actual permissions must still be granted through IAM Identity policies. In other words, an SCP's Allow is a permitted scope, "it is okay to allow up to here," not a grant. On the exam, if "I put an Allow in the SCP but there is still no permission" appears, the answer is "an SCP is only a guardrail (ceiling); the actual grant needs a separate Identity policy." Conversely, putting a Deny in an SCP is a powerful block (because an explicit Deny wins).

## Secrets Manager vs Parameter Store: A Single Word, Rotation, Splits the Choice

For secret management in Domain 4, the choice between Secrets Manager and Parameter Store SecureString almost always comes down to the single word **automatic rotation**. Both store secrets encrypted with KMS, but their design purposes differ.

Parameter Store is originally a **configuration value store**: it manages values such as application settings, environment variables, and feature flags under hierarchical paths (`/app/prod/db-host`). With the SecureString type it can hold encrypted secrets too, but it has **no automatic rotation feature**. The standard tier is free, and it is simple.

Secrets Manager was designed **solely for secrets** from the start, and its key differentiator is automatic rotation. RDS, Redshift, and DocumentDB support built-in rotation, and for other secrets a Lambda rotation function periodically creates and swaps in new secrets. What matters in rotation is **zero downtime**: in four steps, create a new secret (create), apply it to the target system (set), verify it (test), and switch the active version (finish), so the application moves to the new secret without interruption. You can also replicate secrets to multiple Regions with Cross-Region Replication (for DR and multi-Region apps).

| | Parameter Store SecureString | Secrets Manager |
|---|------------------------------|-----------------|
| Main purpose | Configuration values (secrets possible) | Secrets only |
| Automatic rotation | None | Yes (RDS built-in / Lambda) |
| Cross-Region replication | None | Yes |
| Cost | Standard tier free | Per secret + API call charges |
| Selection criterion | Settings and secrets that need no rotation | DB passwords, API keys (rotation needed) |

The decision rule is simple: **if you need rotation, Secrets Manager; otherwise Parameter Store.** For true secrets that must change periodically, like DB passwords and API keys, use Secrets Manager; for configuration values that rarely change, Parameter Store is cost-efficient.

The reason secret rotation matters for security is that it **reduces the window of exposure.** Once a secret leaks, an attacker can use it for as long as it is valid. If the rotation period is 30 days, the validity of a leaked secret is also capped at 30 days at most: rotation confines the damage of a secret that may already have leaked by time. A more fundamental approach is to not use secrets at all. If EC2/ECS/Lambda receive temporary credentials (STS) through an IAM Role, those credentials are automatically rotated every short interval (usually 1 hour) and no secret is embedded in code. So when "DB password rotation vs IAM authentication" appears as options, in situations where RDS IAM authentication can be used, IAM authentication, which eliminates the secret itself, may be the deeper answer. Rotation is second best; removing the secret is best.

## Threat Detection Services: What They Look At Defines Each One

For the security services in Domain 4 (GuardDuty/Inspector/Macie/Security Hub/Detective), if you memorize only the names you will get confused in scenarios. The single question that separates each service is **"what (which data) does it look at?"**

- **GuardDuty**: **Looks at logs** (VPC Flow Logs, DNS query logs, CloudTrail). It finds threat patterns in the flow of behavior: abnormal API calls, communication with known malicious IPs, cryptocurrency mining traffic. It detects "attacks in progress."
- **Inspector**: **Looks at software** (packages in EC2, ECR images, and Lambda). It checks against known vulnerabilities (CVEs) to find "this system has an unpatched hole." It detects potential weaknesses.
- **Macie**: **Looks at the content of S3 data.** It scans objects with ML to find where PII (sensitive information such as national ID numbers and card numbers) is and whether it is publicly exposed. It detects data risk.
- **Security Hub**: **Looks at other services' findings.** It gathers the results of GuardDuty, Inspector, Macie, and Config in one place and scores them against standards (CIS, PCI, and so on). It is an integrated dashboard.
- **Detective**: **Looks at the context of findings.** When GuardDuty reports a threat, Detective weaves the related logs into a graph to help investigate "where this threat came from and what it is connected to."

A memorization tip: GuardDuty is **behavior** (the flow of logs), Inspector is **vulnerabilities** (holes in software), Macie is **data** (S3 contents), Security Hub is **integration** (aggregation of findings), and Detective is **investigation** (linking context). In a scenario, if you pin down "what do I want to look at," the answer splits cleanly.

GuardDuty's utility stands out in detecting theft of EC2 credentials. As in the Capital One incident above, if an attacker pulls an EC2 instance's temporary IAM credentials via SSRF and uses them **from outside EC2**, GuardDuty's `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration` finding fires: it catches, by correlating CloudTrail and VPC Flow Logs, that credentials issued to an instance were used from an external IP rather than from that instance. This is territory that Inspector (vulnerability scanning) or Macie (data scanning) can never catch, and only GuardDuty, which watches "the flow of behavior logs," can. It is a vivid example of the principle that the data each service looks at defines its detection scope.

## Wrap-Up

Domains 3 and 4 are two sides of one theme, "handle change safely": automation makes it fast and reversible, and security confines it to least privilege.

In summary, there are five points. (1) IaC is declarative (desired state), so it is idempotent and rolls back cleanly; Drift Detection exposes the diff between desired and actual. (2) The cost of zero-downtime deployment is ultimately spare capacity: Blue/Green does not delete the old environment, so rollback is instant, but the DB schema and DNS TTL are traps. (3) Session Manager builds a reverse channel from outbound 443 alone and opens a shell with zero inbound ports; it is an implementation of Zero Trust. (4) IAM evaluation is a decision tree: an explicit Deny beats everything, policies form an AND intersection, and an SCP is a ceiling, not a grant. (5) For secrets, Secrets Manager if you need rotation, otherwise Parameter Store; more deeply, the best answer is to remove the secret itself with IAM authentication. Security services are each defined by "what they look at" (GuardDuty = behavior, Inspector = vulnerabilities, Macie = data).

In the next post, we reread Domain 5 (Networking) and Domain 6 (Cost and Performance) at the same depth: the path a packet takes through a VPC, the cost structure of NAT and Endpoints, and the math of commitment discount models.

---

## Practice Problems

**Question 1.** During CloudFormation stack creation, one resource failed. An imperative shell script would have been left in a half-finished state, but CloudFormation cleaned up neatly. What is the fundamental reason?

A) Because CloudFormation is faster
B) Because it is a declarative model, there is a clear target, the "previous declared state," to converge (roll back) to. An imperative script must track how far it got and delete in reverse order
C) CloudFormation never fails
D) Because it creates all resources simultaneously

**Answer: B**

Explanation: Declarative IaC declares the "desired end state," so on failure it can converge (roll back) to a clear target, the "previous declared state." An imperative script writes a procedure, so on failure you must track "how far it progressed" one by one and clean up in reverse order, and if that process is missed, a half-finished state remains. This convergence property is the key that enables the idempotency and clean rollback of the declarative model, and Drift Detection is also a feature that exposes the same diff computation.

---

**Question 2.** A company requires zero downtime on deploying a new version, plus an immediate return to the previous version if a problem occurs. It configured blue/green with a DNS switch, but even after rollback, some users keep going to the new (problematic) version for a while. What is the cause and the improvement?

A) Blue/Green cannot be rolled back
B) Because of DNS TTL caching, some clients cache the old record. If immediate effect is needed, use an ALB Target Group swap instead of DNS
C) The green environment must be deleted
D) It must be changed to Rolling

**Answer: B**

Explanation: In a DNS-based blue/green switch, clients cache the old DNS response for the TTL, so the switch and rollback are not reflected immediately for all clients. When an immediate and consistent switch is needed, the standard is to use an ALB Target Group swap (routing changes instantly) rather than DNS. Blue/Green's instant rollback is possible because the old environment is left in place (A is wrong), but if the switching mechanism is DNS, TTL delay creeps in. Additionally, if blue/green shares a DB, schema changes are another pitfall.

---

**Question 3.** A security team wants to eliminate the key management, port exposure, and audit burden of EC2 SSH access. Instances in private subnets (with no internet gateway) are also in scope. What is the most suitable method and how does it work?

A) Apply a strong SG to a bastion host
B) Session Manager: the SSM Agent connects outbound over 443 to SSM, so a shell opens with zero inbound ports, access is authorized by IAM and audited by CloudTrail, and private subnets reach it via VPC Interface Endpoints
C) Set up a VPN
D) Rotate key pairs frequently

**Answer: B**

Explanation: With Session Manager, the SSM Agent inside the EC2 instance first establishes an outbound (443) connection to the SSM service, and shell traffic flows over that channel. So there is no need to open any inbound port, which eliminates port 22 exposure and key management; access is authorized by IAM policy and every session is recorded in CloudTrail. Even a private subnet with no internet gateway works if it reaches SSM through VPC Interface Endpoints (PrivateLink). This is an implementation of zero trust that replaces network-location trust (bastion) with identity-based authorization.

---

**Question 4.** An account's SCP explicitly has `s3:* Allow`, yet users in that account cannot access S3. Why?

A) The SCP has a bug
B) An SCP does not grant permissions; it only defines a ceiling (guardrail). Actual permissions must be granted separately by an IAM identity policy, and an SCP Allow is only a scope meaning "allowed up to here"
C) S3 does not exist in that Region
D) There is no KMS key

**Answer: B**

Explanation: An SCP Allow merely defines the "ceiling of permissions possible in this account" and does not grant permissions directly to users. IAM evaluation passes only if the SCP (ceiling), Permission Boundary (ceiling), and identity policy (grant) all intersect as an AND, so even if the SCP allows it, without an explicit Allow in the identity policy it is blocked by an implicit deny. In other words, the SCP is the guardrail and the actual grant is the identity policy's job. Conversely, putting a Deny in an SCP is a strong block because an explicit Deny beats every Allow.

---

**Question 5.** An RDS DB master password must be rotated automatically every 30 days without downtime. Which service is most suitable?

A) Parameter Store SecureString
B) Secrets Manager: provides zero-downtime rotation in four steps (create → set → test → finish) using built-in RDS rotation or Lambda rotation
C) KMS
D) IAM Role

**Answer: B**

Explanation: For real secrets that need automatic rotation (DB passwords), Secrets Manager is the answer. RDS, Redshift, and DocumentDB support built-in rotation, and rotation proceeds without application downtime in four steps: create a new secret → apply it to the target → verify → switch to active. Parameter Store SecureString (A) is for storing configuration and has no automatic rotation feature. More fundamentally, eliminating the secret itself with RDS IAM authentication (STS temporary credentials) may be best, but the service that directly fits the requirement to "rotate the password" is Secrets Manager.

---

**Question 6.** An attacker stole an EC2 instance's temporary IAM credentials via SSRF and used them from an external IP outside EC2 to access S3. Which service can detect this attack while it is in progress?

A) Inspector, because it scans for vulnerabilities
B) GuardDuty: correlates CloudTrail and VPC Flow Logs to detect "credentials issued to an instance being used outside that instance" (InstanceCredentialExfiltration)
C) Macie, because it scans S3 data
D) Config

**Answer: B**

Explanation: GuardDuty is a behavior-based service that detects threat patterns by looking at log streams (CloudTrail, VPC Flow Logs, DNS). If temporary credentials issued to EC2 are used from an external IP rather than from that instance, GuardDuty raises a credential exfiltration finding. Inspector (A) looks at software vulnerabilities and Macie (C) looks at the content of S3 data, so neither can catch this kind of "behavioral anomaly." For each security service, "what it looks at" defines its detection scope, and detecting in-progress credential misuse is GuardDuty's unique domain.

---

**Question 7.** In an Elastic Beanstalk deployment, a company wants "zero downtime + rollback safety" but wants to avoid the ongoing cost of a separate environment (blue/green). Which policy launches the entire new version in a new ASG within a single environment and then swaps?

A) All at once
B) Rolling
C) Immutable: launches the entire new version in a new ASG and swaps after verification, so zero downtime, the existing environment remains intact so rollback is clean, and capacity doubles only temporarily
D) Canary

**Answer: C**

Explanation: Immutable leaves the existing ASG as is, launches instances of the entire new version in a new ASG, and shifts traffic after confirming they are healthy. There is no downtime, and if a problem occurs you simply discard the new ASG, so rollback is clean. The cost is doubled only temporarily during the replacement (the old ASG is removed after the switch), and there is no ongoing cost of maintaining two environments at all times as with Blue/Green. Rolling (B) reduces capacity during replacement and rolls back slowly because it requires re-rolling, and All at once (A) has downtime.

---
