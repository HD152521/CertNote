# Day 2 - Integrated Review Domains 3 & 4: Infrastructure Security ↔ Identity and Access Management

Domain 3 (Infrastructure Security, ~18%) and Domain 4 (IAM, ~20%) are the pair with the largest score weight on the exam. Domain 4 in particular is the heaviest single domain in SCS-C03. The relationship between the two is clear — **infrastructure security controls "where you can go (network path)," and IAM controls "what you can do (permissions)."** A Specialty answer almost always demands the dual control *"block at the network boundary, and block again with least-privilege IAM."* Today we bind these two dimensions into a single access control model.

## How the Two Domains Combine on the Exam

The two domains together are 38%. The combination forms converge on roughly six.

| Combination form | Shape of the passage | Where the answer sits |
|---|---|---|
| Path-blocking type | "Let only this traffic through" | SG / NACL / Endpoint policy / Network Firewall |
| Private-access type | "Without going through the internet" | Gateway vs Interface Endpoint |
| Exfiltration-prevention type | "So it cannot leave our VPC/organization" | Endpoint policy + `aws:SourceVpce` + SCP/RCP |
| Permission-judgment type | "Why AccessDenied / why does it pass?" | Policy evaluation order, 6-7 layers |
| Delegation type | "Who is granted permissions, and how?" | AssumeRole, External ID, Identity Center, Roles Anywhere |
| Credential-placement type | "Where do you put the keys?" | Roles (instance profile/IRSA/execution role) + Secrets Manager |

If the last sentence of the passage ends with *"how do you allow/block access?"*, it is the first three; if it ends with *"who is enabled to do what?"*, it is the last three. This identification alone cuts the candidates in half.

## Infrastructure Security: Layers of Network Path Control

| Control | Statefulness | Unit of application | Key characteristic |
|------|--------|-----------|-----------|
| Security Group | stateful | ENI/instance | Allow rules only. Responses allowed automatically. Can reference another SG as a source |
| NACL | stateless | Subnet | Allow + deny. Inbound/outbound separate. Evaluated in number order. Response ports must be explicit |
| VPC Endpoint (Gateway) | — | S3/DynamoDB **only** | Route table entry. Free. Endpoint policy |
| VPC Endpoint (Interface/PrivateLink) | — | Most services, your own SaaS | ENI + private IP. Controlled with SGs. Billed by hour and data |
| Network Firewall | stateful | inspection VPC | IPS, domain filtering, Suricata rules |
| Route 53 Resolver DNS Firewall | — | VPC | Domain allow/block lists |
| WAF | — | CloudFront, ALB, API GW, etc. | L7 rules (SQLi/XSS/rate-based/geo) |
| Shield Advanced | — | Edge and Regional resources | L3/4 DDoS mitigation, cost protection, response team support |

An SG is stateful, so if you allow inbound, the response goes out automatically. A NACL is stateless, so you must explicitly allow both inbound and the *outbound ephemeral ports (1024-65535)*. This asymmetry is an easily confusing point in NACL troubleshooting. Also, a NACL can do an *explicit deny*, so it is used for blocking specific IPs (blacklist), while an SG has no deny rules and can only whitelist. "Block a specific malicious IP across the entire subnet" → NACL deny. And when you need to cut off an in-progress session immediately, the NACL is also the answer — because an SG is stateful, already established connections may persist briefly.

### Confusing Pairs: Which Layer's Defense Is It?

| Threat | Correct control | Wrong choices |
|---|---|---|
| SQLi, XSS, bots, bulk requests to a specific URI | **WAF** (managed rule + rate-based) | Shield / NACL |
| L3/4 volumetric flood, cost spike protection | **Shield Advanced** | WAF alone |
| IPS and domain control for traffic inside the VPC / egress | **Network Firewall** | SG / WAF |
| Blocking malicious domain queries | **Route 53 Resolver DNS Firewall** | Network Firewall alone |
| Denying a specific IP range across the whole subnet | **NACL deny** | SG |
| Per-instance whitelist | **Security Group** | NACL |
| Inline insertion of a third-party appliance | **Gateway Load Balancer** | NLB |

One-line summary: **L7 content is WAF, L3/4 volume is Shield, flows inside the VPC are Network Firewall, domains are DNS Firewall, IP blacklists are NACL, per-instance whitelists are SG.**

> ⚠️ **Pitfall**: Network Firewall inspects only if **traffic is forced through it by routing** — if you deploy it but do not fix the route tables, it sees nothing. When doing stateful inspection with Transit Gateway, if you do not turn on **appliance mode**, the round-trip paths differ, producing asymmetric flows and inspection malfunctions. And **CloudFront-scope WAF and Shield Advanced policies must be created in us-east-1**.

### Traffic Path Decision Tree

```
"How do you allow/block this communication?"
   │
   ├─ Does it come in from the internet?
   │     ├─ HTTP(S) application layer ──► CloudFront + WAF (+ Shield Advanced)
   │     │        └─ Block origin bypass ──► prefix list / secret header / OAC
   │     └─ L3/4 volumetric attack ────────────► Shield (with Advanced: cost protection, response team)
   │
   ├─ Does it go from inside the VPC out to an AWS service?
   │     ├─ S3 · DynamoDB ─────────────► Gateway Endpoint (free) ★ answer to cost questions
   │     └─ Other services · your SaaS ────► Interface Endpoint (PrivateLink)
   │            └─ Restrict what can be accessed ─────►   endpoint policy + bucket policy aws:SourceVpce
   │
   ├─ VPC ↔ VPC / on-premises?
   │     ├─ Only two VPCs, no transitivity needed ─────► Peering (no transitive routing)
   │     ├─ Hub for many VPCs ─────────────► Transit Gateway (appliance mode when inspecting)
   │     ├─ On-premises encryption ─────────► Site-to-Site VPN (IPsec)
   │     └─ Dedicated bandwidth ───────────────► Direct Connect (+ VPN for encryption)
   │
   └─ Do you need to inspect/block flows inside the VPC?
         ├─ IP · port whitelist ──────► Security Group
         ├─ IP blacklist (subnet) ─────► NACL deny
         ├─ Protocol · domain · signature ──► Network Firewall (forced routing required)
         └─ DNS queries ──────────────────► Route 53 Resolver DNS Firewall
```

### Contrasting the Three Private-Access Options

| Axis | Gateway Endpoint | Interface Endpoint | NAT Gateway |
|---|---|---|---|
| Target | **S3 and DynamoDB only** | Most AWS services, PrivateLink SaaS | The entire internet |
| Implementation | Route table entry | ENI + private IP | Managed NAT |
| Cost | **Free** | Hours + data | Hours + data |
| Control means | Endpoint policy | Endpoint policy + **SG** | None (path only) |
| Goes via the internet | No | No | **Yes** |
| "MOST cost-effective + private" | ★ answer | Candidate | Wrong |

This table becomes a question as it is. When the three clues **"without going through the internet" + "minimum cost" + "S3"** appear at the same time, the answer is always Gateway Endpoint.

### The Standard for Private Connectivity

Patterns for accessing AWS services and other VPCs without going through the public internet:
- **S3/DynamoDB** → Gateway Endpoint (routing, free). Restrict accessible buckets with the endpoint policy.
- **Other AWS services, your own SaaS** → Interface Endpoint (PrivateLink). Exposed through a private IP.
- **On-premises ↔ VPC** → Site-to-Site VPN (IPsec) or Direct Connect (+ VPN for encryption).
- **VPC ↔ VPC** → Peering (not transitive) or Transit Gateway (hub, transitive).

Key pitfall: **even if you create a VPC Endpoint, communication happens only if IAM/endpoint policies allow it.** And with the `aws:SourceVpce` and `aws:SourceVpc` conditions in the endpoint policy, you can lock an S3 bucket so it is accessed *only from a specific VPC* — the core of preventing data exfiltration.

## IAM: The Logic of Permission Evaluation

IAM policy evaluation is the area the exam asks about most precisely. You must memorize the evaluation order:

1. **Explicit Deny** → if even one exists anywhere, **immediate denial** (top priority).
2. **SCP** (Organizations) → the *ceiling (guardrail)* of permissions. If the SCP does not allow, it is denied even if there is an IAM Allow.
3. **Resource-based / Identity-based Allow** → allowed if either allows (for cross-account, both sides are needed).
4. **Permission Boundary** → limits the *maximum permissions* of an individual user/role.
5. If there is no explicit Allow → **implicit deny** (the default).

The key mental model is *"permissions = (Identity ∪ Resource Allow) ∩ SCP ∩ Permission Boundary − all Denies"*. SCPs and Permission Boundaries do not *grant* permissions — they only *limit* the ceiling. The actual permissions must still be granted by identity/resource policies. Misunderstandings like "I attached an SCP, so why do the permissions not appear?" come from here.

### Precise Version: You Must Pass Through Seven Steps to Get ALLOW

We rebuild the evaluation engine we dug into in week 2 in exam-answer form.

```
Request = (Principal, Action, Resource, Condition Context)
   │
   ├─① Explicit Deny ── a single Deny in any policy type ▶ DENY (ends immediately)
   ├─② SCP ───────── if the principal account's effective SCP does not allow ▶ DENY
   ├─③ RCP ───────── if the resource-side organization ceiling does not allow ▶ DENY
   ├─④ Resource policy ── same account + an Allow that names the principal directly can pass (exception path)
   ├─⑤ Permissions boundary ──── if the boundary does not allow ▶ DENY
   ├─⑥ Session policy ──── if it does not allow ▶ DENY
   └─⑦ Identity policy ── no Allow means ▶ implicit DENY
                              ▼
                            ALLOW

Effective permission = (SCP ∩ RCP ∩ permissions boundary ∩ session policy) ∩ (IAM Allow ∪ resource policy Allow) − (all Denies)
```

| Policy type | Attached to | Grants permissions | Limits permissions | Applies to management account | Place on the exam |
|---|---|---|---|---|---|
| **SCP** | Root / OU / account | ✗ | ○ (principal ceiling) | **✗** | Region lock, protecting security services, blocking root |
| **RCP** | Root / OU / account | ✗ | ○ (resource access ceiling) | ✗ | Blocking exposure outside the organization |
| **Identity IAM** | Users, groups, roles | ○ | ○ | ○ | The main body of actual permission grants |
| **Resource policy** | S3, KMS, SQS, Lambda, etc. | ○ (cross-account) | ○ | ○ | Cross-account sharing, allowing service principals |
| **Permissions boundary** | IAM users and roles | ✗ | ○ (ceiling for an individual principal) | ○ | Safely granting IAM permissions to delegates |
| **Session policy** | AssumeRole sessions | ✗ | ○ (temporary ceiling) | ○ | Narrowing federation and temporary credentials |

You only need to get the three archetypes from which the exam builds variations into your hands.

**Case A - SCP Deny vs AdministratorAccess.** An account administrator holds `AdministratorAccess` and tries to launch EC2 in a prohibited Region in an OU with a Region-lock SCP attached. → **DENY.** It ends at ①. The strength of the IAM Allow is meaningless. "It passes because they are an administrator" is the archetype of the wrong answer.

**Case B - Cross-account S3.** A role in Account A reads a bucket in Account B. **Allows on both sides are needed** (A's IAM policy + B's bucket policy). A resource policy sole Allow holds only within the same account. If, on top of that, an RCP is attached to B's OU blocking principals outside the organization, it passes if A is in the same organization, and is blocked if A is outside the organization even when both Allows exist.

**Case C - Judging scope.** "So that roles created by a developer cannot have administrator permissions" → **permissions boundary** (the ceiling of one principal). "So that no one in this entire account can use a specific Region" → **SCP** (account/OU scope). One-line criterion: **if the scope is an account/OU, SCP; if it is a single principal, permissions boundary.** Choices that make you swap these two are easily used as wrong answers.

> ⚠️ **Pitfall**: **SCPs do not apply to principals in the management account.** That is why "do not put workloads in the management account" is not a matter of taste but a structural necessity. In the same vein, **calls that a service-linked role (SLR) makes with AWS service credentials are also exempt from SCP evaluation.** When a passage says "I attached an SCP but only a certain path keeps passing," suspect these two exceptions first. Also, because RCP has limited supported services, a statement like "RCP enforces the organization boundary for all services" is a wrong choice.

### The Order for Diagnosing AccessDenied

"Why does it not work" questions demand the diagnostic order itself as the answer.

```
AccessDenied occurs
   │
   ├─① Which principal is it?  ── if federation/AssumeRole, check session policy and role chaining
   ├─② Caught by an SCP/RCP? ── organization guardrails (Region, service, tag conditions)
   ├─③ Is there an explicit Deny? ── bucket policy, KMS key policy, permissions boundary — any one ends it
   ├─④ Is it cross-account? ── are both Allows present (one side only fails)
   ├─⑤ Is KMS involved? ── an S3 SSE-KMS object is readable only if the **key policy also allows** ★ perennial
   ├─⑥ Does a condition key not match? ── MFA, SourceIp, SourceVpce, tag conditions
   └─⑦ If still nothing ── implicit deny because there is no Allow at all

Tools: IAM Policy Simulator / last accessed information / errorCode in CloudTrail
```

⑤ is especially easy to get confused about. The answer to **"I attached AdministratorAccess but cannot read the S3 object"** is usually one of *an explicit deny in the bucket policy*, *an SCP block*, or *the KMS key policy not allowing it*. AdministratorAccess is only one layer, the identity policy, and cannot break through the other layers.

There are pitfalls in condition keys too. `aws:MultiFactorAuthPresent` **may not exist as a key at all in temporary credentials obtained through AssumeRole**, so a `Bool` comparison behaves differently from what was intended — a precise policy uses `BoolIfExists`. And `aws:SourceIp` does not work as expected for requests going through a VPC endpoint — in that case you must use `aws:SourceVpce`/`aws:SourceVpc`.

### Cross-Account Access and Temporary Credentials

- **AssumeRole**: Separates the role's trust policy (who can assume it) from its permission policy (what it can do once assumed). STS issues temporary keys.
- **External ID**: Prevents the *confused deputy* when a third party assumes my role.
- **Roles Anywhere**: On-premises workloads use IAM roles through X.509 certificates.
- **IAM Identity Center (SSO)**: The currently recommended approach for multi-account and SAML/OIDC federation. Manage multi-account access centrally with permission sets.
- **Cognito**: Authenticates app users (end users). Grants temporary AWS credentials through an Identity Pool.

**Commonly missed distinctions**
- **IAM roles = employees and workloads** (federation/AssumeRole). **Cognito = app users**. Do not confuse them.
- **Never put long-term access keys on an instance** → EC2 uses an *instance profile (role)*, EKS uses *IRSA/Pod Identity*, Lambda uses an *execution role*.
- **SCPs do not grant permissions** — they only limit the ceiling.

> 🎯 **Integrated Scenario A**: "An EC2 instance in a private subnet must access only a specific S3 bucket, without going through the internet. Hard-coded credentials are forbidden." Answer: (1) **Infrastructure level** — Gateway VPC Endpoint (S3) + an endpoint policy allowing only that bucket + a `aws:SourceVpce` condition in the bucket policy so access is only from that endpoint. (2) **IAM level** — grant only GetObject on that bucket to the EC2 instance profile (role). Communication happens only when the network path (endpoint) and the permissions (role) are satisfied *at the same time*. The two domains cooperate.

### Credential Mapping by Workload Type

This table becomes the choices *as it is* in questions. They change just one cell to create a wrong answer.

| Workload | Correct mechanism | What is used as the wrong answer |
|---|---|---|
| EC2 application | Instance profile (IAM role) + **IMDSv2** | Access keys in files or environment variables |
| EKS pod | IRSA / EKS Pod Identity | Broad permissions on the node role |
| ECS task | Task role (distinct from the execution role) | Keys embedded in the container image |
| Lambda | Execution role | Keys in environment variables |
| On-premises and other clouds | **IAM Roles Anywhere** (X.509) | Long-term IAM user keys |
| Employee (human) multi-account access | **IAM Identity Center** permission set | Per-account IAM users |
| App end user | **Cognito** (User Pool authentication / Identity Pool AWS credentials) | Embedding IAM user keys in the app |
| Third-party SaaS | Cross-account role + trust policy + **External ID** | Sharing access keys |
| CI/CD (GitHub Actions, etc.) | OIDC federation role | Long-term keys in repository secrets |

**Role chaining** has a constraint — when a role assumes another role, the maximum session length is limited to 1 hour, and the original role's `MaxSessionDuration` setting does not apply. This is the answer to the passage "why does the session keep being cut off at 1 hour?" And **IMDSv2** makes credential theft via SSRF harder with its session-oriented approach, and setting the **hop limit** to 1 reduces access from containers to host metadata — these are *preparation* items, not *response*.

## Secrets and Key Management (An Extension of IAM)

Handling credentials and secrets safely is also in the territory of Domain 4:
- **Secrets Manager**: Secrets that need *automatic rotation* such as DB credentials. Lambda rotator.
- **SSM Parameter Store**: Configuration values and secrets (SecureString). No rotation, free tier.
- **Do not embed keys in instances**: roles + temporary credentials are the answer.

| Axis | Secrets Manager | SSM Parameter Store (SecureString) |
|---|---|---|
| Automatic rotation | **Built in (Lambda rotator)** | None (implement it yourself) |
| Cross-account sharing | Supports resource policies | Limited |
| Regional replication | Supported | Handle it yourself |
| Cost | Charged per secret | Standard tier is cheap |
| When to choose | "**Automatic rotation**," "DB credentials" | "Configuration values," "no rotation needed," "**minimum cost**" |

One-line criterion: **if rotation is required, Secrets Manager; if it is a simple secret or configuration value and cost is emphasized, Parameter Store.** When an emphasis phrase (`MOST cost-effective`) is attached, it leans toward the latter.

> 🎯 **Integrated Scenario B**: "Give a third-party monitoring SaaS read access to my account, but make them assume my role only safely." Answer: Create a cross-account IAM role → in the trust policy, that SaaS account Principal + an **External ID** condition. The permission policy is read-only least privilege. Instead of sharing long-term keys, use temporary credentials through AssumeRole. The External ID prevents confused deputy attacks.

## The Mental Model Connecting the Two Domains

```
Can the request reach?  ──► [Infrastructure: SG/NACL/Endpoint/routing]  ── passes the network path
       │
       ▼ (path OK)
Does the request have permission?  ──► [IAM: Deny → SCP → Allow → Boundary]  ── passes permission evaluation
       │
       ▼ (both OK)
        Actual operation allowed
```

The reason the exam's "best" answer always applies both layers at the same time is *defense in depth*. If you block with an SG alone, you are defenseless when the SG is opened wrongly, and if you block with IAM alone, you permit network reconnaissance. The pinnacle of data exfiltration prevention is three layers — VPC Endpoint (path restriction) + endpoint/bucket policy (`aws:SourceVpce` condition) + IAM least privilege. Even if one layer is breached, the others block. The Specialty exam makes you choose "this combination," not "any one." When organization scale is added, a fourth layer comes in as an `aws:PrincipalOrgID`-based SCP/RCP — *the outgoing door is SCP, the incoming door is RCP*.

## Domains 3 & 4 Keyword → Service Translation Table

| When an expression like this appears in the passage | Service/pattern to recall |
|---|---|
| "S3/DynamoDB without going through the internet," "minimum cost" | Gateway VPC Endpoint (free) |
| "Other services or your own SaaS without going through the internet" | Interface Endpoint (PrivateLink) |
| "Make the bucket accessible only from this VPC" | Bucket policy `aws:SourceVpce` / `aws:SourceVpc` |
| "Block a specific IP range across the whole subnet" | NACL deny |
| "Per-instance allow list" | Security Group |
| "The response does not come back" (inbound was opened) | NACL outbound ephemeral ports |
| "SQLi/XSS/bots/rate limit on a specific path" | WAF (managed rule + rate-based) |
| "Large-scale L3/4 flood, DDoS cost protection, response team" | Shield Advanced |
| "IPS and domain control on VPC egress" | Network Firewall (+ forced routing, appliance mode if TGW) |
| "Block malicious domain queries" | Route 53 Resolver DNS Firewall |
| "Prevent connecting directly to the origin" | CloudFront + OAC / secret header / prefix list |
| "Many VPCs as a hub," "transitive routing" | Transit Gateway (Peering is not transitive) |
| "Dedicated bandwidth to on-premises" | Direct Connect (+ VPN for encryption) |
| "Third-party appliance inline" | Gateway Load Balancer |
| "Maximum boundary of permissions," "so it cannot be done across the entire organization" | SCP |
| "So the delegated person cannot exceed their own permissions" | Permissions boundary |
| "Safe cross-account delegation," "confused deputy" | AssumeRole + trust policy + External ID |
| "Multi-account SSO, SAML/OIDC federation" | IAM Identity Center |
| "On-premises server uses an IAM role" | IAM Roles Anywhere (X.509) |
| "App end-user login" | Cognito |
| "Automatic rotation of DB credentials" | Secrets Manager |
| "Configuration values and secrets, no rotation needed, low cost" | Parameter Store SecureString |
| "Prevent metadata theft via SSRF" | IMDSv2 + hop limit |
| "Who is not actually using which permissions" | IAM Access Analyzer (unused access) / last accessed information |
| "So resources cannot be shared outside the organization" | SCP and RCP + `aws:PrincipalOrgID` |

## Domains 3 & 4 Pitfall Summary

**Network pitfalls**
- **NACLs are stateless** → separately allow outbound ephemeral ports (1024-65535).
- SGs have **no deny rules** (whitelist only) — IP blocking is NACL.
- SGs are stateful, so **established sessions may persist briefly** — supplement with a NACL to cut off immediately.
- **Gateway Endpoint is only S3 and DynamoDB** — a choice that uses it for other services is wrong.
- Even if you create a VPC Endpoint, communication needs **the endpoint/IAM/resource policy to allow it**.
- Network Firewall inspects only when **forced through by routing**.
- Missing **appliance mode** for TGW stateful inspection causes asymmetric malfunctions.
- **CloudFront-scope WAF and Shield Advanced policies are us-east-1**.
- VPC Peering has **no transitive routing** — with 3 or more, use TGW.
- Even with WAF at the edge, if you do not block **direct origin access** it is bypassed.

**IAM pitfalls**
- **SCPs, permissions boundaries, RCPs, and session policies do not grant permissions** — they only limit the ceiling.
- **An explicit Deny is final wherever it is** — even AdministratorAccess cannot beat it.
- **SCPs do not apply to management account principals**, and **service-linked role calls are also excluded from evaluation**.
- **Cross-account access needs an Allow on both sides** — a resource policy sole Allow holds only within the same account.
- SSE-KMS object access requires both the **bucket policy + KMS key policy** to allow it.
- `aws:MultiFactorAuthPresent` may lack the key, so use **`BoolIfExists`**.
- For requests through a VPC endpoint, use **`aws:SourceVpce`**, not `aws:SourceIp`.
- **Role chaining is limited to a 1-hour** session at most.
- Do not put long-term access keys on workloads — roles + temporary credentials.
- IAM roles = employees and workloads, **Cognito = app users**.

The **Capital One (2019)** incident shows in one line how these two domains mesh. The attacker reached the instance metadata service through an SSRF vulnerability in a web application, and S3 data was exfiltrated with the **instance role's temporary credentials** obtained there. What crossed the network boundary (Domain 3) was a flaw at the application layer, but what determined the actual scale of damage was **the breadth of permissions that role had** (Domain 4). The lesson overlaps exactly with the form of the exam's correct answers — ① make metadata access harder with IMDSv2 and the hop limit, ② narrow the role's permissions to the needed buckets and needed actions, ③ restrict the access path itself with the bucket policy's `aws:SourceVpce`, and ④ detect abnormal access with GuardDuty and CloudTrail data events. **The point that an answer that blocks only one path or narrows only one permission would not have stopped this incident** is the reason the Specialty exam always makes you choose a combination.

## 📌 Key Takeaways

Domains 3 and 4 reduced to one sentence: **"The path must reach and the permissions must exist — and the exam always chooses the answer that locks both."**

Leaving only three reading tips. ① When the passage says *"without the internet,"* recall endpoints, and if *"minimum cost"* is added, recall Gateway. ② When the passage asks *"why does it not work,"* sweep in the order explicit Deny → SCP → cross-account Allow on both sides → KMS key policy → condition keys. ③ When the passage says *"the entire organization"* or *"created in the future,"* account-level tools are wrong and organization tools (SCP, RCP, Firewall Manager, Identity Center) are the answer.

Finally, the most expensive mistake in these two domains is not a lack of knowledge but **choosing an answer that locks only one layer**. If one of the four choices mentions "network + permissions + conditions" together, that is usually the correct answer.

### One-Line Summary Checklist

- [ ] Do you know the difference between SG = stateful/allow only and NACL = stateless/allow + deny, and the NACL ephemeral ports?
- [ ] Do you distinguish Gateway (S3/DDB) vs Interface (PrivateLink) Endpoints for private access?
- [ ] Do you know the pattern of preventing data exfiltration with the `aws:SourceVpce`/`aws:SourceVpc` conditions?
- [ ] Have you memorized the IAM evaluation order (Deny → SCP → Allow → Boundary)?
- [ ] Do you know that SCPs and Permission Boundaries only *limit* and do not grant permissions?
- [ ] Do you follow workload credentials = roles (instance profile/IRSA/execution role), with no hard-coded keys?
- [ ] Do you distinguish cross-account = AssumeRole + trust policy (+ External ID) from app users = Cognito?

---

## 📝 Practice Questions

**Question 1.** An EC2 instance in a private subnet must access only a specific S3 bucket without going through the internet, and hardcoding credentials is prohibited. What is the most appropriate design?

A) Go through the internet via a NAT Gateway and store an access key on the EC2 instance  
B) S3 Gateway VPC Endpoint (limited to that bucket only by the endpoint policy) + bucket policy `aws:SourceVpce` condition + least privilege on the EC2 instance profile (role)  
C) Move it to a public subnet and only lock down the security group  
D) Inject an IAM user access key as an environment variable  

**Answer: B**

---

**Question 2.** In Organizations, an SCP denies all services outside a specific Region, yet even when an administrator of one account attaches an IAM full-admin policy to themselves, they cannot operate in that Region. Why?

A) The IAM policy is corrupted  
B) An SCP is a permissions guardrail (upper limit), so if the SCP does not allow it, it is denied even if there is an IAM Allow  
C) A Permission Boundary was applied automatically  
D) The STS token expired  

**Answer: B**

---

**Question 3.** When granting cross-account access so that a third-party SaaS can read resources in a customer account, what is the recommended mechanism to prevent a confused deputy attack?

A) Issue an IAM user access key to the SaaS  
B) Add an External ID condition together with the SaaS account Principal in the cross-account role's trust policy  
C) Make the bucket public  
D) Allow the SaaS IP with a Security Group  

**Answer: B**

---

**Question 4.** A specific malicious IP range must be blocked across an entire subnet. Why was this not possible with a security group, and what is the correct control?

A) Security groups have no explicit deny rules and only allow lists are possible — use a NACL, which allows an explicit deny at the subnet level  
B) Because security groups are stateless  
C) NACLs are instance-level and so unsuitable, so keep the security group  
D) Block the IP in the route table  

**Answer: A**

---

**Question 5.** Which of the following pairings of a workload type and its recommended credential mechanism is incorrect?

A) EC2 application -> instance profile (IAM role)  
B) EKS pod -> IRSA / Pod Identity (service account <-> IAM role)  
C) Mobile app end user -> embed an IAM user access key in the app  
D) On-premises server -> IAM Roles Anywhere (X.509 certificate)  

**Answer: C**

---

**Question 6.** After newly configuring a NACL to allow inbound HTTPS (443), response traffic does not reach the client. What is the most likely cause?

A) The security group is wrong  
B) NACLs are stateless, so a separate outbound rule allowing ephemeral ports (1024-65535) must be added  
C) There is no internet gateway in the route table  
D) DNS resolution failed  

**Answer: B**

---
