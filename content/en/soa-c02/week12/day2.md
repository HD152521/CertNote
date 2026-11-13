# Day 2 - Rereading Domains 3 and 4: Deploy Automatically, Lock Down with Least Privilege

Domain 3 (Deployment, Provisioning, and Automation, 18%) and Domain 4 (Security and Compliance, 16%) look like opposites at first glance: one is "change quickly," the other is "stop people from changing things carelessly." But the two domains are two sides of the same question: **how do you handle change safely?** Deployment automation makes change fast and reversible, and security confines the authority to make that change to the minimum. Security without fast deployment paralyzes operations, and fast deployment without security mass-produces incidents.

Instead of skimming the two domains by keyword, this article digs into why CloudFormation was designed to be "declarative and idempotent," what mathematical tradeoffs deployment policies make between availability and cost, the internal mechanism by which Session Manager replaces SSH, and what decision tree IAM policy evaluation follows.

## The Roots of IaC — Why Declarative Beat Imperative

When you "review" CloudFormation you memorize stacks, templates, and Change Sets, but the bigger story underneath is the **history of declarative beating imperative**. Once you grasp this difference, all of IaC falls into place at a glance.

Imperative provisioning writes the **procedure**: "create this, then connect that, then turn on this setting." Early automation scripts (bash, early tools) worked this way. There are two problems: (1) if the script fails midway, the system is left in a half-finished state (only partly built), and (2) if you run the same script twice, things get created in duplicate or conflict (no idempotency).

Declarative provisioning writes not the procedure but the **desired state**. If you declare "this VPC, this subnet, this EC2 instance must exist," the tool compares against the current state and creates or fixes only the difference. CloudFormation, Terraform, and CDK all work this way. The key benefit is **convergence**: no matter how many times you run it or what state you start from, it ultimately converges on the declared state. So declarative is inherently idempotent, and it is safe to rerun a failed deployment.

CloudFormation's automatic rollback is also possible thanks to this declarative model. If one resource fails during stack creation, CloudFormation reverts everything created so far and **converges to the previous state** (rollback). With an imperative script you would have to track "how far it got" one by one and delete in reverse order, but declarative has a clear target, "the previous declared state," so the rollback is clean.

> 💡 **Related theory**: Declarative vs imperative is a long-standing topic in programming paradigms (the same distinction as SQL being declarative and C being imperative). The decisive reason declarative won in infrastructure is the **state reconciliation loop**. Kubernetes controllers, Terraform's plan/apply, and CloudFormation's drift detection all use the same pattern: compute the difference (diff) between "desired state" and "actual state," and execute only the actions that bring that difference to zero. This reconciliation loop has the same structure as feedback control in control theory. Drift Detection is the feature that exposes this diff computation so people can see it: if someone changes things by hand in the console and actual deviates from desired (drift), it reports that difference.

## The Math of Deployment Policies — A Triangular Tradeoff of Availability, Speed, and Cost

Memorizing the deployment policy table (All at once / Rolling / Immutable / Blue-Green / Canary) is easy. The hard part is choosing "which one is right" in a scenario, and for that you must understand where each policy stands on the three axes of **availability, rollback speed, and cost**.

The key insight is this: **the cost of zero-downtime deployment is ultimately "spare capacity."** To reduce downtime you must set aside room to bring up the new version, and that room is the cost.

- **All at once**: Replaces existing instances with the new version simultaneously. Zero spare capacity (cheapest) but total downtime at the moment of replacement. If it fails, everything is affected.
- **Rolling**: Replaces a few at a time in sequence. Zero spare capacity, but available capacity temporarily drops by the number of instances being replaced (risk of capacity shortfall). Rollback requires rolling again.
- **Rolling with Additional Batch**: Brings up a spare batch before replacing to prevent the capacity drop. Maintains capacity for a small extra cost.
- **Immutable**: Brings up the entire new version in a completely new ASG and then swaps. Temporarily double the cost for the new ASG, but the existing environment remains intact so rollback is clean.
- **Blue/Green**: Runs two independent environments (blue = old, green = new) and switches DNS/Target Group. Double the environment cost, but rollback is **instant with one switch**.
- **Canary**: Gradually exposes the new version to traffic like 5% → 25% → 100%. Exposes problems to only a small number of users and expands after verifying with metrics.

| Policy | Downtime | Rollback speed | Extra cost | Key point |
|------|----------|-----------|-----------|------|
| All at once | Yes | Slow | 0 | Dev/non-critical |
| Rolling | None (capacity drops) | Slow (re-roll) | 0 | Cost first |
| Rolling + Batch | None | Slow | Small | Maintain capacity |
| Immutable | None | Fast (existing kept) | Temporarily 2x | Safe replacement |
| Blue/Green | None | Instant (switch) | 2x | Instant rollback required |
| Canary | None | Fast (reduce exposure) | Small to medium | Gradual verification |

The real reason Blue/Green's rollback is "instant" is that **it does not delete the old version and leaves it as is**. The switch only changes traffic routing (a DNS record or ALB Target Group), so if a problem occurs it ends with a single action of reverting the routing. However, if you use a DNS switch, **TTL caching** means some clients keep going to the old version for a while, so if you need a fast switch, use an ALB Target Group swap (reflected immediately) instead of DNS. Another trap is the **database schema**. If blue and green share the same DB, the moment you change the schema for green, blue can break. So the real difficulty of zero-downtime deployment lies not in the application but in the DB migration (backward-compatible schema changes, the expand-contract pattern).

The major AWS S3 us-east-1 outage in 2017 is a symbolic incident showing the risk of deployment and automation. An engineer, while debugging a slowdown in the billing system, tried to remove some servers with a playbook command, but **entered the command's input parameter incorrectly**, and far more servers than intended were removed. Those servers handled S3's index and placement subsystems, so they stopped in a chain, and recovery restarts took several hours (those subsystems had not been fully restarted in a long time, so booting took longer than expected). There were three lessons: (1) powerful manual commands need safeguards (a limit on the maximum that can be removed at once), (2) automation tools must validate wrong input, and (3) recovery procedures (including restarts) must also be rehearsed regularly to actually work. This is the background to SOA repeatedly emphasizing "minimize manual operations + automation + safeguards."

## How Session Manager Replaces SSH — Opening a Shell Without Opening a Port

In Domain 3 you memorize SSM's 7 components, but for Session Manager in particular you need to **know the internal operation** to see why it is so powerful. The core of Session Manager is that it brings up a shell on EC2 "without opening a single inbound port."

Traditional SSH access requires opening port 22 inbound: you allow 22 in the security group, manage key pairs, and usually set up a bastion host (jump server). The problems of this model are clear. An open port is an attack surface, keys carry loss and leak risk, and the bastion is one more thing to manage.

Session Manager flips this model. The **SSM Agent inside EC2 first establishes an outbound connection to the SSM service** (outbound 443, HTTPS). When an operator starts a session, traffic flows over this pre-established outbound channel, so the EC2 side can have zero inbound ports. Access is controlled by IAM rather than key pairs (who can open a session to which instance), every session is recorded in CloudTrail, and session logs can be sent to S3/CloudWatch Logs.

This pattern of "building a reverse channel using only outbound" is not new; it is the classic reverse tunnel technique for controlling a machine behind a firewall from outside. Session Manager provides it as a managed service with IAM authentication and auditing attached. It also works for instances in private subnets (no internet gateway) as long as they reach SSM through a VPC Interface Endpoint (PrivateLink), opening a shell without internet exposure.

Session Manager's security model is an implementation of the **Zero Trust** philosophy. Traditional network security was a perimeter model of "trust the internal network, block the outside," and the bastion host was the gate in that perimeter. Zero Trust is the principle of "don't trust by network location; authenticate, authorize, and record every access by identity." Session Manager changing IP/port-based access (SSH port 22 + bastion) into identity-based access (IAM policy + CloudTrail auditing) is exactly this shift. This is why, when the exam says "remove the burden of SSH key management and strengthen auditing," the answer is almost always Session Manager: it is not mere convenience but a shift in the security paradigm.

## IAM Policy Evaluation — A Decision Tree Where an Explicit Deny Beats Everything

In Domain 4 you memorize the evaluation order "SCP → Permission Boundary → Identity → Resource," but strictly speaking this is not an order but a **decision tree**. The algorithm by which AWS decides "should this request be allowed?" has two unwavering principles.

Principle 1: **The default is implicit deny.** If no policy explicitly allows it, it is denied. Permission is not "what works because it isn't blocked" but "what works only if explicitly allowed."

Principle 2: **An explicit deny beats everything.** If an explicit Deny is set in any policy, the result is denial even if 100 other policies Allow. A Deny is an absolute veto.

On top of these two principles, evaluation examines all the policy types. SCPs (organization guardrails), Permission Boundaries (the permission ceiling for an IAM entity), Identity policies (policies attached to users/roles), Resource policies (S3 bucket policies and so on), and Session policies all go in as inputs. They form an **intersection with AND**: the SCP must allow **and** the Boundary must allow **and** the Identity policy must allow for the request to finally pass. If any one is missing (or denies), it is blocked.

```
Request evaluation decision tree
─────────────────────────────────
1. Is there an explicit Deny anywhere? ── Yes ──► Deny (end)
                │ No
                ▼
2. Does the SCP allow this action? ── No ──► Deny
   (applies only to Org member accounts)
                │ Yes
                ▼
3. Does the Permission Boundary allow it? ── No ──► Deny
   (only for entities with a Boundary set)
                │ Yes
                ▼
4. Is there an explicit Allow in the
   Identity or Resource policy? ── No ──► Deny (implicit deny)
                │ Yes
                ▼
            Allow
```

> ⚠️ **Pitfall**: An SCP **does not grant permissions; it only restricts.** Even if you write "Allow S3FullAccess" in an SCP, users in that account do not automatically gain permissions. An SCP only defines "the ceiling (upper bound) of permissions possible in this account," and the actual permissions still have to be granted through IAM Identity policies. In other words, an SCP's Allow is a scope of permission meaning "it is fine to allow up to here," not a grant. If the exam says "I put an Allow in the SCP but there are still no permissions," the answer is "the SCP is only a guardrail (ceiling); actual granting needs to be done separately with Identity policies." Conversely, putting a Deny in an SCP is a strong block (because an explicit Deny wins).

## Secrets Manager vs Parameter Store — The Choice Split by the Single Word "Rotation"

In Domain 4's secret management, the choice between Secrets Manager and Parameter Store SecureString is almost always split by the single word **automatic rotation**. Both store secrets encrypted with KMS, but their design purposes differ.

Parameter Store is originally a **configuration value store**: it manages values like application settings, environment variables, and feature flags through hierarchical paths (`/app/prod/db-host`). You can also put secrets in encrypted with the SecureString type, but **there is no automatic rotation feature**. The standard tier is free and simple.

Secrets Manager was designed **for secrets only** from the start, and its key differentiator is automatic rotation. RDS, Redshift, and DocumentDB support built-in rotation, and for other secrets a Lambda rotation function periodically generates and replaces the new secret. What matters in rotation is **no downtime**: a 4-step process of creating the new secret (create), applying it to the target system (set), verifying (test), and switching the active version (finish) lets the application move to the new secret without interruption. You can also replicate secrets to multiple Regions with Cross-Region Replication (for DR and multi-Region apps).

| | Parameter Store SecureString | Secrets Manager |
|---|------------------------------|-----------------|
| Main purpose | Configuration values (secrets possible) | Secrets only |
| Automatic rotation | None | Yes (RDS built-in / Lambda) |
| Cross-Region replication | None | Yes |
| Cost | Standard tier free | Per secret + API call charges |
| Selection criterion | Config and secrets that need no rotation | DB passwords, API keys (rotation needed) |

The decision rule is simple: **if you need rotation, Secrets Manager; otherwise, Parameter Store.** Real secrets that must be changed periodically, like DB passwords and API keys, go in Secrets Manager, and rarely changing configuration values are cost-efficient in Parameter Store.

Secret rotation matters for security because it **reduces the window of exposure**. Once a secret leaks, an attacker can use it for as long as that secret is valid. With a 30-day rotation cycle, the validity period of a leaked secret is limited to 30 days at most; rotation confines the damage from "a secret that may already have leaked" by time. A more fundamental approach is not to use secrets at all: if EC2/ECS/Lambda receive and use temporary credentials (STS) through an IAM Role, those credentials rotate automatically on a short cycle (usually 1 hour) and no secret is embedded in the code. So when "DB password rotation vs IAM authentication" appears as options, in a situation where RDS IAM authentication can be used, IAM authentication that eliminates the secret itself may be the deeper answer. Rotation is second best, and removing the secret is best.

## Threat Detection Services — What They Look At Defines Each One

For Domain 4's security services (GuardDuty/Inspector/Macie/Security Hub/Detective), memorizing only the names leaves you confused in scenarios. The single question that separates the services is **"what (which data) does it look at?"**

- **GuardDuty**: **Looks at logs** (VPC Flow Logs, DNS query logs, CloudTrail). It finds threat patterns in the flow of behavior: abnormal API calls, communication with known malicious IPs, cryptocurrency mining traffic. It detects "an attack in progress."
- **Inspector**: **Looks at software** (packages on EC2, ECR images, Lambda). It compares against known vulnerabilities (CVEs) to find "this system has an unpatched hole." It detects potential weaknesses.
- **Macie**: **Looks at the content of S3 data**. It scans objects with ML to find where PII (sensitive information such as national ID numbers and card numbers) is and whether it is publicly exposed. It detects data risk.
- **Security Hub**: **Looks at other services' findings**. It gathers the results of GuardDuty, Inspector, Macie, and Config in one place and scores them against standards (CIS, PCI, and so on). It is a consolidated dashboard.
- **Detective**: **Looks at the context of findings**. When GuardDuty reports a threat, Detective weaves related logs into a graph to help investigate "where this threat came from and what it is connected to."

Memory aid: GuardDuty is **behavior** (the flow of logs), Inspector is **vulnerabilities** (software holes), Macie is **data** (S3 content), Security Hub is **aggregation** (collecting findings), and Detective is **investigation** (connecting context). Once you pin down "what do I want to see" in a scenario, the answer splits.

GuardDuty's usefulness stands out in detecting EC2 credential theft. As in the Capital One incident we saw earlier, if an attacker steals an EC2 instance's IAM temporary credentials via SSRF and uses those credentials **from outside EC2**, GuardDuty's `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration` finding fires: it catches, through correlation of CloudTrail and VPC Flow Logs, that credentials issued to an instance were used from an external IP rather than that instance. This is something Inspector (vulnerability scanning) or Macie (data scanning) can never catch, and it is the domain only GuardDuty, which looks at "the flow of behavior logs," can cover. It is a vivid example of the principle that the data each service looks at defines its detection scope.

## Wrapping Up

Domains 3 and 4 are two sides of one theme, "handle change safely": automation makes it fast and reversible, and security confines it with least privilege.

To summarize, there are five points. (1) IaC is declarative (desired state), so it is idempotent and rolls back cleanly; Drift Detection exposes the diff between desired and actual. (2) The cost of zero-downtime deployment is ultimately spare capacity; Blue/Green rolls back instantly by not deleting the old environment, but the DB schema and DNS TTL are traps. (3) Session Manager builds a reverse channel using only outbound 443 and opens a shell with zero inbound ports; it is an implementation of Zero Trust. (4) IAM evaluation is a decision tree: an explicit Deny beats everything, policies form an AND intersection, and an SCP is a ceiling, not a grant. (5) For secrets, Secrets Manager if rotation is needed, otherwise Parameter Store; going deeper, eliminating the secret itself with IAM authentication is best. For security services, what each looks at defines it (GuardDuty = behavior, Inspector = vulnerabilities, Macie = data).

In the next article we reread Domain 5 (Networking) and Domain 6 (Cost and Performance) at the same depth: the path a packet takes through a VPC, the cost structure of NAT and Endpoints, and the math of commitment discount models.

---

## 📝 Practice Questions

**Question 1.** One resource failed during CloudFormation stack creation. With an imperative shell script it would have been left in a half-finished state, but CloudFormation cleaned up neatly. What is the fundamental reason?

A) Because CloudFormation is faster

B) Because it is a declarative model, there is a clear target, "the previous declared state," so it can converge (roll back) to that state; imperative would have to track how far it got and delete in reverse order

C) Because CloudFormation never fails

D) Because it creates all resources simultaneously

**Answer: B**

Explanation: Declarative IaC declares the "desired final state," so on failure it can converge (roll back) to the clear target of "the previous declared state." Because an imperative script writes the procedure, on failure you must track "how far it got" one by one and clean up in reverse order, and if that process is missed, a half-finished state remains. This convergence property is the key that enables declarative idempotency and clean rollback, and Drift Detection is also a feature that exposes the same diff computation.

---

**Question 2.** A company requires zero downtime on new version deployments plus immediate return to the previous version if a problem occurs. They set up blue/green with a DNS switch, but even after rollback some users keep going to the new (problem) version for a while. What is the cause and the improvement?

A) Blue/Green cannot roll back

B) Because of DNS TTL caching, some clients cache the old record; if immediate reflection is needed, use an ALB Target Group swap instead of DNS

C) The green environment must be deleted

D) It must be changed to Rolling

**Answer: B**

Explanation: In a DNS-based blue/green switch, clients cache the previous DNS response for the TTL, so the switch and rollback are not reflected immediately for all clients. If an immediate and consistent switch is needed, the standard is to use an ALB Target Group swap (routing changes instantly) rather than DNS. Blue/Green's instant rollback is possible because the old environment is left in place rather than deleted (A is wrong), but if the switching mechanism is DNS, TTL delay creeps in. In addition, if blue/green shares a DB, schema changes are another trap.

---

**Question 3.** The security team wants to eliminate the key management, port exposure, and auditing burden of EC2 SSH access. Instances in private subnets (no internet gateway) are also in scope. What is the most suitable method and its operating principle?

A) Apply a strong SG to a bastion host

B) Session Manager — the SSM Agent connects to SSM over outbound 443, so a shell opens with zero inbound ports, authorization is by IAM and auditing by CloudTrail, and private subnets reach it through a VPC Interface Endpoint

C) Set up a VPN

D) Rotate key pairs frequently

**Answer: B**

Explanation: With Session Manager, the SSM Agent inside EC2 first establishes an outbound (443) connection to the SSM service and flows shell traffic over that channel. So there is no need to open a single inbound port, which eliminates port 22 exposure and key management; access is authorized by IAM policy and every session is recorded in CloudTrail. Even private subnets without an internet gateway work as long as they reach SSM through a VPC Interface Endpoint (PrivateLink). This is an implementation of Zero Trust that replaced network-location trust (bastion) with identity-based authorization.

---

**Question 4.** An SCP for an account explicitly specifies `s3:* Allow`, yet users in that account cannot access S3. Why?

A) The SCP has a bug

B) An SCP does not grant permissions and only defines a ceiling (guardrail); actual permissions must be granted separately through IAM Identity policies, and the SCP's Allow is only a scope meaning "allowed up to here"

C) S3 does not exist in that Region

D) There is no KMS key

**Answer: B**

Explanation: An SCP's Allow only defines "the ceiling of permissions possible in this account" and does not directly grant permissions to users. IAM evaluation passes only if SCP (ceiling), Permission Boundary (ceiling), and Identity policy (grant) all form an AND intersection, so even if the SCP allows it, without an explicit Allow in the Identity policy it is blocked by implicit deny. In other words, the SCP is a guardrail, and the actual grant is the Identity policy's job. Conversely, putting a Deny in an SCP is a strong block, since an explicit Deny beats every Allow.

---

**Question 5.** You must automatically replace an RDS DB master password every 30 days with no downtime. What is the most suitable service?

A) Parameter Store SecureString

B) Secrets Manager — provides no-downtime replacement in 4 steps (create → set → test → finish) through RDS built-in rotation or Lambda rotation

C) KMS

D) IAM Role

**Answer: B**

Explanation: For real secrets that need automatic rotation (DB passwords), Secrets Manager is the answer. RDS, Redshift, and DocumentDB support built-in rotation, and rotation proceeds in 4 steps of create new secret → apply to target → verify → switch active, without application downtime. Parameter Store SecureString (A) is for storing configuration and has no automatic rotation. More fundamentally, eliminating the secret itself with RDS IAM authentication (STS temporary credentials) may be best, but the service that directly fits the requirement to "rotate the password" is Secrets Manager.

---

**Question 6.** An attacker stole an EC2 instance's IAM temporary credentials via SSRF and used them to access S3 from an IP outside EC2. Which service can detect this attack while it is in progress?

A) Inspector — because it scans for vulnerabilities

B) GuardDuty — correlates CloudTrail and VPC Flow Logs to detect "credentials issued to an instance used outside that instance" (InstanceCredentialExfiltration)

C) Macie — because it scans S3 data

D) Config

**Answer: B**

Explanation: GuardDuty is a behavior-based service that looks at the flow of logs (CloudTrail, VPC Flow Logs, DNS) to detect threat patterns. If temporary credentials issued to EC2 are used from an external IP rather than that instance, GuardDuty fires a credential theft finding. Inspector (A) looks at software vulnerabilities and Macie (C) at S3 data content, so they cannot catch this kind of "behavioral anomaly." For each security service, what it looks at defines its detection scope, and detecting in-progress credential misuse is GuardDuty's unique domain.

---

**Question 7.** In an Elastic Beanstalk deployment, you want "zero downtime + rollback safety" but want to avoid the always-on cost of maintaining a separate environment (blue/green). Which policy brings up the entire new version in a new ASG within a single environment and then swaps?

A) All at once

B) Rolling

C) Immutable — brings up the entire new version in a new ASG and swaps after verification, so zero downtime, the existing environment remains so rollback is clean, and capacity doubles only temporarily

D) Canary

**Answer: C**

Explanation: Immutable leaves the existing ASG as is, brings up the entire new version's instances in a new ASG, and shifts traffic after confirming health. There is no downtime, and if a problem occurs you just discard the new ASG, so rollback is clean. The cost doubles only temporarily during the replacement (the old ASG is removed after the switch), and there is no ongoing cost of maintaining two environments at all times as with Blue/Green. Rolling (B) reduces capacity during replacement and rolls back slowly because it requires re-rolling, and All at once (A) has downtime.

---

## 📌 Today's Summary

1. IaC is declarative (desired state), so it is idempotent and convergent, rolling back cleanly to the previous state on failure. Drift Detection exposes the diff between desired and actual
2. The cost of zero-downtime deployment = spare capacity. Blue/Green rolls back instantly by keeping the old environment (but the DB schema and DNS TTL are traps), and Immutable replaces safely with a new ASG (temporarily 2x cost)
3. Session Manager builds a reverse channel using only outbound 443 and opens a shell with zero inbound ports: IAM authorization + CloudTrail auditing = a Zero Trust implementation
4. IAM evaluation is a decision tree: an explicit Deny beats everything, policies form an AND intersection, and an SCP is a ceiling (guardrail), not a grant
5. For secrets, Secrets Manager when rotation is needed (4-step no-downtime rotation), otherwise Parameter Store. Security services are distinguished by "what they look at" (GuardDuty = behavior / Inspector = vulnerabilities / Macie = data / Security Hub = aggregation / Detective = investigation)
