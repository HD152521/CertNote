# Day 2 - Integrated Review Domains 3 & 4: Infrastructure Security ↔ Identity and Access Management

Domains 3 (Infrastructure Security, ~18%) and 4 (IAM, ~20%) are the highest-scoring bundle in exams, and Domain 4 alone is the heaviest single domain in SCS-C03. Their relationship is clear: **Domain 3 controls "where can you reach (network path)" while Domain 4 controls "what can you do (permission)"**. Specialty answers almost always demand *"block at network boundary, then block again at IAM with least privilege"* — dual control. Today we bind these two dimensions into one access control model.

## Infrastructure Security: Network Path Control Layers

| Control | Stateful | Unit | Key Features |
|---|---|---|---|
| Security Group | stateful | ENI/instance | Allow rules only. Auto-allow responses |
| NACL | stateless | Subnet | Allow+deny. Separate in/out. Explicit response ports |
| VPC Endpoint (Gateway) | — | S3/DynamoDB | Routing-based. Free |
| VPC Endpoint (Interface/PrivateLink) | — | Most services | ENI+private IP. SG-controlled |
| Network Firewall | stateful | inspection VPC | IPS, domains, Suricata |

SG is stateful so inbound allow auto-allows response. NACL is stateless so must explicitly allow *ephemeral ports (1024-65535)* outbound. This asymmetry is a common exam trap.

### Private Connectivity Pattern

Access AWS services without Internet:
- **S3/DynamoDB** → Gateway Endpoint (routing, free). Restrict by endpoint policy.
- **Other services, internal SaaS** → Interface Endpoint (PrivateLink). Private IP.
- **On-premises ↔ VPC** → Site-to-Site VPN (IPsec) or Direct Connect (+VPN for encryption).
- **VPC ↔ VPC** → Peering (non-transitive) or Transit Gateway (hub, transitive).

Critical trap: **VPC Endpoint creation alone doesn't grant access.** IAM/endpoint policy must allow, AND bucket policy with `aws:SourceVpce`/`aws:SourceVpc` conditions locks S3 bucket to *specific VPC only* — exfiltration prevention.

## IAM: Permission Evaluation Logic

IAM policy evaluation is the exam's most precise area. Master the order:

1. **Explicit Deny** → anywhere → **immediate denial** (highest priority).
2. **SCP** (Organizations) → *ceiling* (permission upper bound). If SCP doesn't allow, IAM Allow is denied.
3. **Identity/Resource Allow** → one of either (cross-account both needed) → allow.
4. **Permission Boundary** → individual user/role *max permission* limit.
5. No explicit Allow → **implicit denial** (default).

> 💡 **Core**: Permission = (Identity ∪ Resource Allow) ∩ SCP ∩ Permission Boundary − all Deny. SCP and Permission Boundary don't *grant* — only *limit ceilings*. This prevents "I added SCP, why no permission?" confusion.

### Cross-Account and Temporary Credentials

- **AssumeRole**: trust policy (who can assume) + permission policy (permissions upon assume) separation. STS issues temporary keys.
- **External ID**: third-party assumes your role safely → *confused deputy* prevention.
- **Roles Anywhere**: on-premises workload uses X.509 cert for IAM role.
- **IAM Identity Center (SSO)**: multi-account SAML/OIDC federation. permission sets centrally manage.
- **Cognito**: app end-users (not AWS staff). Identity Pool grants temporary AWS credentials.

> ⚠️ **Confusion**: 
> - **IAM role = employees/workloads** (federation/AssumeRole). **Cognito = app users**. Never mix.
> - **Never hardcode long-term access keys in instances** → EC2 instance profile (role), EKS IRSA/Pod Identity, Lambda execution role.
> - **SCP doesn't grant permissions** — only ceiling.

## Dual-Domain Mental Model

```
Request reachable? ──► [Infrastructure: SG/NACL/Endpoint/routing] ── Network path passes
      │
      ▼ (path OK)
Request authorized? ──► [IAM: Deny→SCP→Allow→Boundary] ── Permission passes
      │
      ▼ (both OK)
     Action allowed
```

Defense in depth: block at network (SG), then at IAM (least privilege), then at endpoint/bucket policy (SourceVpce condition). One layer breached, next catches.

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
