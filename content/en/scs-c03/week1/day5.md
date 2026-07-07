# Day 5 - Week 1 Synthesis: Integrated Scenario Review of IAM and Credentials

Week 1 laid the foundation for SCS-C03. We drew the big picture with the shared responsibility model and the six domains (Day 1), learned IAM's building blocks and the policy evaluation algorithm (Day 2), dug into identity/resource policies, Conditions, and least-privilege design (Day 3), and covered STS, federation, role chaining, and Confused Deputy prevention (Day 4). Viewed separately, each is its own topic — but the exam's scenario questions always throw two or three of them at you as a bundle.

A single "why is access denied" question intertwines implicit Deny, SCP guardrails, both-sides cross-account allowance, and Permissions Boundaries all at once. A "delegate safely to a third party" question asks about Role + trust policy + ExternalId + least privilege in one shot. Today we cement that bundled problem-solving through scenarios. The one sentence Week 1 wants to teach is — **"Every access decision in AWS reduces to the single IAM evaluation algorithm, and the security engineer's job is to feed that algorithm precise policies."**

## One-Page Compact — Week 1 Essentials

### Shared Responsibility + Control Types (Day 1)

| Axis | Key point |
|----|------|
| Responsibility line | IaaS (EC2) means large customer responsibility; SaaS (S3) means small. **Data and access control are always the customer's** |
| Control types | Preventive (IAM/SCP/SG/KMS) · Detective (CloudTrail/GuardDuty/Config) · Responsive (EventBridge→SSM) |
| 6 domains | Threat Detection 14 / Logging 18 / Infrastructure 20 / IAM 16 / Data 18 / Governance 14 |

### IAM Evaluation Algorithm (Days 2–3)

```
1. Explicit Deny anywhere? ──▶ If so, DENY (unconditional)
2. Does the SCP allow?     ──▶ If not, DENY
3. Does the Permissions Boundary allow? ──▶ If not, DENY
4. (Cross-account) Both sides allow? ──▶ If either side is missing, DENY
5. Explicit Allow present? ──▶ If not, implicit DENY
   All passed ──▶ ALLOW
```

- SCPs and Boundaries **grant nothing — they are filters that only trim the ceiling**
- Same account: either an Identity or a Resource policy suffices / cross-account: **both sides required**
- With KMS, **the key policy is the primary authority** — the key policy must open the gate before IAM policies take effect

### Policy Types and Tools (Day 3)

| Policy | Attached to | Principal | Cross-account |
|------|--------|-----------|---------------|
| Identity | User/Group/Role | None | Not sufficient alone |
| Resource | S3/KMS/SQS/Role trust | Required | Sufficient alone |
| SCP | OU/account | — | Organizational guardrail |
| Permissions Boundary | User/Role | — | Principal ceiling |

- Condition pitfalls: `BoolIfExists` (MFA), `aws:SourceArn`/`SourceAccount` (Confused Deputy), for VPCs use `aws:SourceVpc`
- ABAC: keep the policy count constant with `aws:PrincipalTag == aws:ResourceTag`

### STS and Credentials (Day 4)

- Temporary credentials = AccessKeyId + SecretAccessKey + **SessionToken** (expiring)
- AssumeRole: two policies — **trust (who) + permission (what)**
- Federation: SAML (AssumeRoleWithSAML) · OIDC (AssumeRoleWithWebIdentity) · Identity Center
- Confused Deputy: **ExternalId** for third parties (third-party issued), **aws:SourceArn** for AWS services
- Role chaining: session capped at **1 hour** / enforce IMDSv2 to defend against credential theft

## The 4-Step Scenario-Solving Flow

When you hit an IAM question in the exam room, consciously decompose it in this order.

1. **Decompose the request**: who (Principal) · what (Action) · where (Resource) · same account or cross-account?
2. **Check the filters**: explicit Deny? SCP? Boundary? If cross-account, both sides? If KMS, the key policy?
3. **Judge least privilege**: among the choices, the one that narrows wildcards, uses temporary credentials, enforces guardrails
4. **Eliminate traps**: long-term key use / root use / `Bool` vs `BoolIfExists` / missing ExternalId / relying on a single control

> 🎯 **Scenario**: A report that "a developer has admin but is denied access to a specific S3 bucket." Solving with the 4 steps — admin is an explicit Allow (step 5 passes). If denied anyway, the block is somewhere in filters 1–4. The most common causes are **an explicit Deny in an SCP or the bucket policy**, or the bucket is KMS-encrypted and **the key policy does not allow the developer**. "Has the permission yet denied" is almost always a block at a filter (a ceiling).

---

## 📝 종합 시나리오 10개

**문제 1.** A company wants to configure an application running on EC2 to access S3. Which approach best aligns with security best practices?

A) Create an IAM user, generate access keys, and store them in the EC2 instance's environment variables  
B) Attach an IAM role to EC2 via an instance profile and enforce IMDSv2  
C) Keep root credentials on the EC2 instance and use them when needed  
D) Open the S3 bucket as public-read so it can be accessed without authentication  

**정답: B**  
해설: The best practice for EC2 is to attach an instance profile (IAM role) so STS temporary credentials are issued automatically, and to enforce IMDSv2 to block credential theft via SSRF. Storing long-term access keys in environment variables carries high exposure risk, root use is absolutely forbidden, and public-read buckets are a classic cause of data leaks.

---

**문제 2.** CodePipeline in Account A deploys to an ECS service in Account B, and the artifacts are encrypted with a KMS key in Account A. Which combination of permission boundaries must be in place for the deployment to work?

A) Grant Account A's pipeline role all permissions and cross-account will work automatically  
B) A deployment role in Account B with trust set to A + Account A's KMS key policy allowing B's use + ECS permissions on B's role + the artifact bucket policy allowing B read access  
C) Store Account B's root credentials in Account A  
D) Setting up IAM Identity Center SSO alone automatically solves machine workflows  

**정답: B**  
해설: Cross-account CI/CD requires aligning all four boundaries: the trust relationship, cross-account allowance in the KMS key policy, service permissions on the target-account role, and read allowance in the artifact bucket policy. Piling permissions into one account does not automatically open the boundaries, storing root credentials is forbidden, and Identity Center is for human SSO, not machine workflows.

---

**문제 3.** A user has `PowerUserAccess` with no SCP or Boundary restrictions, yet a `dynamodb:Query` call is denied. What is the most likely cause?

A) DynamoDB is not governed by IAM  
B) Somewhere a policy explicitly denies `dynamodb:Query` (or a broader wildcard)  
C) PowerUserAccess may not cover it and, lacking an explicit Allow, it could be an implicit Deny  
D) Both B and C are possible causes  

**정답: D**  
해설: The denial can stem either from an existing explicit Deny or from an implicit Deny applied when no explicit Allow covers the Action — both are possible. PowerUserAccess allows most services, but a Deny in a separate inline/resource policy takes precedence, and anything outside the permission scope becomes an implicit Deny. It is not true that DynamoDB is outside IAM control.

---

**문제 4.** You want to safely delegate cross-account access to a specific company S3 bucket to a third-party backup vendor. What is the most appropriate configuration?

A) Issue IAM user access keys to the vendor and hand them over  
B) Create an IAM role, specify the vendor account and the vendor-issued ExternalId in the trust policy, and limit permissions to the bucket and required Actions  
C) Open the bucket to the public so the vendor can access it without authentication  
D) Share the company's root credentials with the vendor  

**정답: B**  
해설: The correct answer for cross-account third-party delegation is a Role with the vendor account and ExternalId specified in the trust policy and permissions narrowed to least privilege. The ExternalId blocks the Confused Deputy in which another customer of the same vendor accesses your resources. Issuing access keys, opening the bucket publicly, and sharing root all create serious exposure risks.

---

**문제 5.** The security team wants to ensure that no one (including admins and root) in any account of the organization can disable the existing CloudTrail, while simultaneously blocking use of regions outside the US. What is the most appropriate combination?

A) Add Deny statements one by one to each account's user policies  
B) Write an SCP with a Deny on `cloudtrail:StopLogging`/`DeleteTrail` and a region Deny based on `aws:RequestedRegion`, excluding global services via `NotAction`  
C) Detect CloudTrail interruption and other-region use with GuardDuty and only send alerts  
D) Apply an IAM Permissions Boundary uniformly across all accounts  

**정답: B**  
해설: Organization-wide enforcement is implemented with an explicit Deny in an SCP, and when restricting regions there is a trap: if you do not exclude global services like IAM, CloudFront, and Route 53 via `NotAction`, account operations themselves get blocked. Per-user policies carry high omission risk, GuardDuty detection is only an after-the-fact alert, and a Permissions Boundary is a per-principal ceiling — for account-wide governance, SCPs are the right fit.

---

**문제 6.** A policy tried to block sensitive operations without MFA using a Deny with `"Bool": {"aws:MultiFactorAuthPresent": "false"}`, but it caused the side effect of also blocking automated service-to-service calls. What is the correct fix?

A) Change the condition to `"BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}`  
B) Change the Deny to an Allow  
C) Remove the MFA condition and allow everything  
D) Only force all users to register MFA devices  

**정답: A**  
해설: Some calls carry no MFA context key at all, so evaluating with `Bool` matches and blocks even legitimate requests. `BoolIfExists` checks the value only when the key exists and passes otherwise, behaving as intended. Switching to Allow or removing the condition neuters the MFA enforcement, and device registration alone does not fix the policy-evaluation side effect.

---

**문제 7.** Dozens of teams each operate their own resources, and IAM policies balloon every time a team is added. What is the most scalable least-privilege approach?

A) Grant every team the same admin policy  
B) Unify under an ABAC policy conditioned on matching `aws:PrincipalTag/team` and `aws:ResourceTag/team`  
C) Keep adding a separate role and dedicated policy per team  
D) Give up on per-team permission management and operate on manual approvals  

**정답: B**  
해설: ABAC expresses the match between the principal's and resource's team tags as a condition, handling any number of teams with a single policy — as teams grow, you just assign tags. Federated users get the same treatment by mapping session tags to PrincipalTag. Blanket admin grants violate least privilege, per-team policy mass production keeps the explosion problem, and manual approvals do not scale.

---

**문제 8.** Thousands of corporate employees need access to multiple AWS accounts. What is the most appropriate way to avoid the anti-pattern of creating IAM users in every account?

A) Create one shared IAM user per account for teams to use together  
B) Define permission sets in IAM Identity Center, integrate with an external IdP, and issue temporary credentials via SSO  
C) Distribute root credentials to all employees  
D) Issue long-term access keys to each employee  

**정답: B**  
해설: IAM Identity Center integrates with an external IdP to provide multi-account SSO based on permission sets, and users access with temporary credentials after sign-in — eliminating the need to create IAM users per account. Shared users destroy both traceability and least privilege, and distributing root or issuing long-term keys are serious security risks.

---

**문제 9.** A role in Account A cannot read S3 objects encrypted with a KMS key in Account B. Both the S3 bucket policy and A's IAM policy correctly allow GetObject. What is the most likely missing piece?

A) Account B's KMS key policy does not allow `kms:Decrypt` for Account A's role  
B) S3 does not support cross-account reads  
C) The two accounts are in different regions, making it impossible  
D) With GetObject permission alone, KMS decryption is allowed automatically  

**정답: A**  
해설: Because the KMS key policy is the primary authority, reading an encrypted object requires the key-owning account (B)'s key policy to explicitly allow `kms:Decrypt` for the calling role (A). Even with S3 permissions, the object cannot be read without decryption permission. S3 cross-account reads are supported, different regions are fine, and GetObject does not automatically confer KMS decryption.

---

**문제 10.** An SNS topic policy allows S3 event publishing with `"Principal": {"Service": "s3.amazonaws.com"}`. How do you prevent someone else's S3 bucket from being abused to trigger this topic?

A) Change the Principal to `*` to allow all calls  
B) Add `aws:SourceArn` (the specific bucket ARN) and `aws:SourceAccount` to the Condition so only calls from your bucket are allowed  
C) Delete the topic and replace it with SQS  
D) Making the S3 bucket private automatically solves it  

**정답: B**  
해설: When trusting a service principal, you must constrain the call origin to a specific resource and account with `aws:SourceArn` and `aws:SourceAccount` conditions to block the Confused Deputy. Otherwise, someone else's bucket using the same S3 service principal could trigger your topic. A `*` Principal enlarges the risk, and swapping services or making the bucket private does not solve this origin-verification problem.

---

## Week 1 Wrap-Up — The Bridge to Next Week

This week's five topics — the shared responsibility model, the policy evaluation algorithm, identity/resource policies, Conditions and least privilege, and STS/federation — are **the core of SCS-C03 Domain 4 (IAM) and the prerequisite for the other five domains**. Next week we dive into data protection (KMS and encryption) in earnest, and the key policies, grants, and encryption contexts you will meet there all resolve on top of the two questions practiced this week.

1. "At **which step of the IAM evaluation algorithm** is this access decided?" (explicit Deny → filters → explicit Allow)
2. "Is this credential **temporary or long-term, and is the delegation boundary safe**?" (STS · trust policy · ExternalId)

Keep these two questions in mind, and next week's topics — KMS key policies, S3 encryption enforcement, Secrets Manager rotation — will start to look not like "separate tools to memorize" but like "the data-protection version of this week's IAM thinking framework."
