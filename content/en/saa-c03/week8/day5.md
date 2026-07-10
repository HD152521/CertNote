# Day 5 - Week 8 Wrap-Up: 12 Security Domain Scenarios

The KMS, Secrets Manager, Cognito, WAF, Shield, GuardDuty, Inspector, Macie, Detective, and Security Hub we covered this week are each independent services, but in real SAA exam questions and in production, two or more almost always collaborate inside a single architecture. Take a requirement that looks simple — "a mobile app user uploads an image to S3." Behind it, a Cognito User Pool (user authentication) + Identity Pool (STS Role) + S3 SSE-KMS (encryption at rest) + Macie (post-upload PII scan) + WAF (blocking malicious traffic) + GuardDuty (detecting abnormal access) all run at once.

In this article we'll work through every tool from this week by combining them at the scenario level. We'll cover 12 scenarios that come up often in the SAA security domain (30% weight — the largest area on the exam), and for each we'll explain "why this answer, and why not the others." Training yourself to recall scenario → combination, rather than memorizing single services, helps directly with both the exam and real-world security design.

## The Week's Core Summary: Division of Labor and Combination

If we re-sort this week's tools along the 4 axes of "block / detect / analyze / integrate" and the 3 axes of "encryption / secrets / users," we get the following.

| Axis | Tool | Core Role |
|------|------|-----------|
| Key management | KMS | Envelope encryption; CMK / AWS Managed / CloudHSM classification |
| Secrets & config | Secrets Manager / Parameter Store / CloudHSM | Auto rotation / free config / FIPS L3 dedicated |
| User authentication | Cognito User Pool | Directory, JWT, social, SAML SSO |
| User authorization | Cognito Identity Pool | Temporary STS Role delegation |
| Block (L7) | WAF | OWASP, Rate Limit, Bot Control |
| Block (L3/L4) | Shield Standard / Advanced | DDoS, Cost Protection |
| Detect (behavior) | GuardDuty | CloudTrail / VPC Flow / DNS ML analysis |
| Detect (vulnerability) | Inspector | EC2 / ECR / Lambda CVE scan |
| Detect (PII) | Macie | S3 object content classification |
| Analyze | Detective | Graph-based root cause |
| Integrate | Security Hub | Multi-service + compliance score |
| Org guardrail | Firewall Manager | Org-wide WAF / Shield / SG in bulk |

Pulling out the pairs from this table that get confused most often:

| Confusing Pair | Distinguishing Key |
|----------------|--------------------|
| KMS vs CloudHSM | multi-tenant vs single-tenant; AWS-attested vs customer-attested |
| Secrets Manager vs Parameter Store | auto rotation / paid vs free / no rotation |
| User Pool vs Identity Pool | JWT issuance (for your own API) vs STS credentials (for AWS APIs) |
| Cognito vs IAM Identity Center | external app users vs employee AWS console SSO |
| WAF vs Shield | L7 application attacks vs L3/L4 DDoS |
| GuardDuty vs Inspector | behavior-based detection vs static vulnerability scan |
| GuardDuty vs Macie | threat detection (VPC/CloudTrail) vs PII detection (S3 content) |
| Security Hub vs Detective | integrated score & dashboard vs root-cause graph |
| Firewall Manager vs WAF | org-wide policy enforcement vs individual Web ACL |

```
[ Full-Stack Security Architecture ]

  Internet
     │ Shield Standard (automatic, L3/L4)
     │ + Shield Advanced (Cost Protection)
  CloudFront ── WAF (Managed Rules + Rate Limit + Geo Block)
     │
  ALB ── (optional) WAF, Cognito integrated auth
     │
  ECS Fargate (Task Role / IRSA, Secrets Manager env var injection)
     │
  RDS Aurora (KMS SSE, Secrets Manager auto rotation 30 days, RDS Proxy)
     │
  S3 (SSE-KMS + Bucket Keys, BPA, OAC, Macie PII scan)

  User authentication:
    Mobile/Web → Cognito User Pool (or SAML SSO)
              → Identity Pool → STS Role → some direct AWS API calls

  Monitoring:
    GuardDuty (threats) + Inspector (CVE) + Macie (PII) + Config (configuration)
              → Security Hub (CIS/AFSBP score)
              → EventBridge → Lambda/SNS automated response
              → Detective (post-incident analysis)

  Org guardrail:
    Firewall Manager enforces WAF/Shield/SG across all accounts in bulk
```

> 💡 **Related theory**: This kind of layered structure is called **defense in depth**, or the **swiss cheese model** (James Reason, 1990). No single security layer is perfect (like holes in the cheese), but stack several layers and the odds of the holes lining up in a straight line become vanishingly small. Even if CloudFront's WAF misses an SQLi, the ALB's WAF catches it; if both miss it, RDS IAM DB Auth + Secrets Manager rotation limits the impact of a leaked password; and if data leaks anyway, SSE-KMS blocks disk exfiltration. Cloud security is not "one strong tool" but "a combination of several lightweight tools."

> 🔍 **Going deeper**: The security domain carries the largest weight on the SAA-C03 exam at 30%, but scenario questions usually reduce to a simple "this keyword → this service" mapping. There are just two traps — ① "the exact one among similar services" (e.g., GuardDuty vs Inspector vs Macie), and ② "picking a single-service answer when a combination is required" (e.g., mobile S3 upload = User Pool alone is wrong, Identity Pool is needed). To avoid both, memorize clearly "which service's definition this keyword maps to," and check every requirement in the scenario without missing one.

## Anti-Patterns You'll Meet Often

Before working the scenario questions, let's flag the five security anti-patterns you see most often in both production and on the exam.

| Anti-Pattern | Problem | Correct Pattern |
|--------------|---------|-----------------|
| Hardcoding secrets in code / env vars in plaintext | git exposure, log leakage | Secrets Manager + IAM permissions |
| S3 bucket Public Read/Write | the #1 cause of data-leak incidents | BPA (Block Public Access) + OAC + CloudFront |
| Baking an IAM User key into EC2 | unlimited permissions if the key leaks | IAM Instance Profile |
| SSE-KMS with an AWS Managed Key + no permission separation | every IAM principal can decrypt | CMK + key policy + kms:ViaService |
| Assuming a single-region DR | can't decrypt during a region outage | Multi-Region Keys + Secrets Manager Replication |

> ⚠️ **Pitfall**: Even when a scenario says "minimize cost," you must not downgrade security. For example, when the wording is "I want to reduce S3 SSE-KMS cost," "switch to SSE-S3" is almost never the answer. The correct answer is usually "enable S3 Bucket Keys," which keeps the security level intact while cutting KMS call costs by 99%.

## 📝 시나리오 연습 문제 12

**문제 1.** A mobile game went global and then got hit by a DDoS attack. CloudFront traffic spiked to 200x normal, and the AWS bill came in $80,000 higher than expected. The company wants a refund for the extra cost in future incidents like this. What is the most suitable solution?

A) Leave the already-free Shield Standard as is and just watch for cost spikes with a CloudWatch billing alarm
B) Subscribe to Shield Advanced ($3,000/month + Cost Protection)
C) Disable the CloudFront distribution during the attack to block traffic and reduce origin costs
D) Use Route 53 health checks + failover to divert traffic to a standby region and spread the load

**정답: B**

해설: One of Shield Advanced's biggest values is **Cost Protection**. AWS refunds the ELB/CloudFront/Route 53/EC2 scale-out costs caused by a DDoS attack, so it prevents bill shock. Standard (A) has no cost protection, and C and D aren't protection solutions at all. Shield Advanced is subscribed at the account level (not per workload) and comes with a 24/7 DDoS Response Team and automatic L7 mitigation.

---

**문제 2.** A fintech company, pursuing PCI DSS compliance, was required to have "key material that not even AWS employees can access, with FIPS 140-2 Level 3 certification under the company's own name." What is the most suitable key store?

A) KMS Customer Managed Key — uses a FIPS 140-2 Level 3 module on top of a multi-tenant HSM, but AWS-attested, with access control via key policy
B) Store the key material in Secrets Manager and protect it with auto rotation + KMS envelope encryption
C) CloudHSM (single-tenant FIPS 140-2 Level 3, customer-attested)
D) Encrypt with Parameter Store SecureString + a KMS CMK to block AWS employee access

**정답: C**

해설: CloudHSM is single-tenant, key material is inaccessible even to AWS employees, and its FIPS 140-2 Level 3 certification is issued under the customer's own name. KMS CMK (A) also runs on a FIPS L3 HSM, but it's multi-tenant and AWS-attested, so it doesn't meet this requirement. When the compliance requirement explicitly says "no AWS employee access + under the customer's name," CloudHSM is the only answer. In general a KMS CMK is enough, but in some heavily regulated environments CloudHSM is mandatory.

---

**문제 3.** A company wants to auto-rotate the admin password of an RDS Aurora PostgreSQL database every 90 days, with zero downtime during rotation. What is the most suitable solution?

A) Store the password in Parameter Store SecureString + a Lambda triggered by a 90-day cron that changes the RDS password directly
B) Secrets Manager + the AWS-provided RDS rotation Lambda + a 90-day schedule
C) Store the password as an object in CloudHSM + KMS envelope encryption + a documented manual rotation procedure every 90 days
D) Inject the password into an EC2 instance's env vars + run an Ansible playbook via cron to refresh it every 90 days

**정답: B**

해설: For RDS / Aurora / Redshift / DocumentDB, Secrets Manager lets you use the AWS-provided rotation Lambda template as-is. Across the 4-step lifecycle (createSecret → setSecret → testSecret → finishSecret), AWSCURRENT is only promoted after testSecret succeeds, guaranteeing zero-downtime rotation. AWSPREVIOUS also stays alive for a period, so active connections aren't dropped. A and D require you to implement the dual-credential pattern yourself, which is risky. C isn't rotation-automated.

---

**문제 4.** A company's SPA web app needs to temporarily grant authenticated users permission to upload images directly to S3. What is the most suitable authentication/authorization flow?

A) User Pool alone + call S3 with the JWT
B) Log in via Cognito User Pool → JWT → Identity Pool → STS AssumeRoleWithWebIdentity → S3 PUT with temporary credentials
C) Bake an IAM user key into the SPA
D) Public Write via an S3 bucket policy

**정답: B**

해설: For a mobile app or SPA to call the S3 API directly, it needs IAM credentials capable of SigV4 signing, and Cognito Identity Pool issues these via STS AssumeRoleWithWebIdentity. Handling user authentication with the User Pool and passing the JWT to the Identity Pool is the standard flow. A can't call AWS APIs with a JWT alone. C is the worst for security. D leads straight to a data breach.

---

**문제 5.** A company wants to allow sign-up only with a corporate-domain email (`@mycompany.com`), and after sign-up, automatically sync user info to its own DynamoDB. What is the most suitable solution?

A) PreSignUp Lambda Trigger (domain validation) + PostConfirmation Lambda Trigger (DDB replication)
B) Validate the email domain with a regex in the API backend's sign-up handler, and write to DynamoDB directly after a successful sign-up
C) Attach an IAM policy to a User Pool group to allow only the `@mycompany.com` domain and grant DDB access
D) Check the domain in the Identity Pool's authentication rules and invoke a DDB-sync Lambda via an STS Role

**정답: A**

해설: Cognito User Pool Lambda Triggers are the standard mechanism for inserting custom code at each stage of the login flow. PreSignUp is called right before sign-up, so it can validate the domain and block it by throwing an exception; PostConfirmation is called after email/SMS verification completes, used for DDB replication or sending a welcome email. B is possible but hard to integrate into the sign-up flow. C and D are unrelated to the scenario.

---

**문제 6.** A company wants to automatically detect which objects in an S3 bucket contain PII such as credit card numbers or national ID numbers, and when found, immediately quarantine them and alert SecOps. What is the most suitable solution?

A) Turn on GuardDuty's S3 Protection, receive findings via EventBridge, quarantine the object with Lambda, and alert via SNS
B) Macie + EventBridge → Lambda (move the object to a quarantine bucket) + SNS (SecOps)
C) Scan bucket objects with Inspector v2 to find PII, receive findings via Lambda, and quarantine
D) Evaluate whether objects contain PII with a Config Rule, and alert SecOps via SNS on non-compliance

**정답: B**

해설: Macie is the only service that analyzes S3 object content with ML and automatically classifies over 100 PII patterns. Findings are published to EventBridge, so automated quarantine via Lambda + SNS alerting is possible. GuardDuty (A) is behavior-based threat detection, not content classification. Inspector (C) is vulnerability scanning, and Config (D) is configuration evaluation.

---

**문제 7.** A company wants to automatically assess whether a newly disclosed Log4Shell-class CVE affects the OS/packages on 500 EC2 instances, and integrate the results into a compliance dashboard. What is the most suitable combination?

A) Inspector v2 (automatic/continuous scan) + Security Hub (integrated dashboard + score)
B) Detect abnormal instance behavior with GuardDuty and scan disks for sensitive data with Macie to assess CVE exposure
C) Evaluate patch-level compliance with a Config Rule and audit patch API-call history with CloudTrail to identify vulnerable instances
D) Build a custom scanner where Lambda collects the package list from each instance, loads it into S3, and cross-references a CVE DB

**정답: A**

해설: Inspector v2 collects a package inventory via the SSM Agent and automatically cross-references a CVE DB, and when a new CVE is disclosed it immediately re-evaluates all affected instances. Findings are automatically integrated into Security Hub and reflected in standard scores like CIS, AFSBP, and PCI DSS. GuardDuty is behavior-based, so it's not a static CVE-scanning tool.

---

**문제 8.** A SaaS company wants employees to log into its SaaS with the company's internal Okta SSO. It wants to keep the user directory in Cognito itself, but password management should be handled by Okta. What is the most suitable configuration?

A) Integrate with IAM Identity Center
B) Cognito User Pool + register Okta as an external SAML IdP + attribute mapping
C) Cognito Identity Pool alone
D) AD Connector

**정답: B**

해설: The enterprise SSO scenario for B2B SaaS almost always answers to "User Pool + external SAML IdP." You delegate authentication with an Okta SAML AuthnRequest, and map the attributes in the SAML Assertion that Okta returns to Cognito user attributes. IAM Identity Center (A) is for employees SSO-ing into the AWS console/CLI, not for authenticating external app users. C can't stand alone because it has no user directory.

---

**문제 9.** A company runs active-active across us-east-1 and ap-northeast-2. An S3 object encrypted with SSE-KMS in one region must be immediately decryptable after being replicated (CRR) to the other region, and the RDS password must stay identical across both regions. What is the most suitable combination?

A) A separate CMK + separate secret in each region + manual sync
B) KMS Multi-Region Keys + Secrets Manager Replication
C) CloudHSM multi-region
D) Parameter Store + Lambda sync

**정답: B**

해설: KMS Multi-Region Keys (launched June 2021) synchronously replicate the same key material across multiple regions while exposing it under the same keyId (prefix `mrk-`). A CRR replica is immediately decryptable. Secrets Manager Replication also automatically propagates source rotations to replicas, so the secret stays in sync across both regions at all times. A and D carry the burden and failure risk of manual sync, and C — multi-region CloudHSM — is very complex and expensive.

---

**문제 10.** A company wants to, in front of a global web service, automatically block OWASP Top 10 attacks, classify bot traffic, block anything over 2,000 requests per IP in 5 minutes, and block all countries except South Korea, the US, and Japan. What is the most suitable configuration?

A) Shield Standard only
B) CloudFront + WAF Web ACL (AWS Managed Rules CommonRuleSet + Bot Control + Rate-based Rule + Geo Match Rule)
C) Network Firewall
D) Security Group + NACL

**정답: B**

해설: A WAFv2 Web ACL evaluates multiple rules in priority order — you can bundle AWS Managed Rules (OWASP), Bot Control (bot classification), a Rate-based Rule (per-IP rate limiting), and a Geo Match Statement (country blocking) all into one Web ACL. Attach it to CloudFront and inspection happens at the edge, greatly reducing origin load. Shield (A) is L3/L4 DDoS, and Network Firewall (C) and SG/NACL (D) aren't tools for blocking L7 application attacks.

---

**문제 11.** A company wants that when GuardDuty raises an "EC2 communicating with a known crypto-mining pool" finding, it automatically moves the instance to a quarantine SG within 5 minutes, traces the IAM Role's activity in a graph for post-incident analysis, and integrates the results into a SecOps dashboard. What is the most suitable combination?

A) GuardDuty → EventBridge (severity≥7) → Lambda (swap in quarantine SG) + SNS (SecOps) + Detective (graph analysis) + Security Hub (integrated dashboard)
B) Detect abnormal API calls with CloudTrail Insights and use those events to trigger a Lambda that quarantines the instance and traces IAM Role activity
C) Detect an instance's outbound SG rule violation with a Config Rule, apply a quarantine SG via SSM Automation, then aggregate the results into a dashboard
D) Block the mining-pool communication with a WAF Rate-based Rule and analyze logs to trace IAM Role activity

**정답: A**

해설: GuardDuty findings are published to EventBridge immediately, which can trigger an automated-response Lambda. Swapping the ENI to a quarantine SG cuts the instance off from the outside. For post-incident analysis, Detective integrates GuardDuty + VPC Flow + CloudTrail into a graph DB and visualizes it. Security Hub shows all findings in an integrated dashboard and assigns a compliance score. This 4-service combination is the standard security operations pipeline.

---

**문제 12.** An enterprise runs 80 accounts with AWS Organizations and needs ① the same WAF Managed Rule enforced on every ALB/CloudFront across all accounts, ② Shield Advanced auto-applied to all accounts, ③ auto-applied to new accounts too, and ④ integrated monitoring of CIS/AFSBP standard scores. What is the most suitable combination?

A) Firewall Manager (org-wide WAF/Shield bulk application + auto for new) + Security Hub (integrated CIS/AFSBP score)
B) Each account's admin manually configures the same WAF Managed Rule and Shield Advanced in the console, repeating for every new account
C) A Lambda in the management account iterates over all accounts daily to check whether WAF/Shield is applied, and applies it via SDK where missing
D) Deploy a Config Rule to each account to evaluate whether WAF/Shield is applied, and check the CIS/AFSBP standards with a Config Conformance Pack

**정답: A**

해설: Firewall Manager is a dedicated service that applies WAF Web ACLs, Shield Advanced, Security Groups, Network Firewall, and Route 53 Resolver DNS Firewall policies in bulk across an entire AWS Organization, and it auto-applies to new accounts and resources too. Security Hub integrates security findings from all accounts and automatically evaluates scores for the CIS AWS Foundations Benchmark, PCI DSS, and AWS Foundational Security Best Practices. These two services are the standard combination for multi-account security.

---

## Next Week Preview: The Operations & Monitoring Domain

Next week is Week 9 — monitoring and operations. If this week's security services produce "the findings that alert you when an incident happens," next week's CloudWatch, CloudTrail, Config, SSM, and X-Ray cover "how the system behaves day to day" and "how you trace and recover when an incident happens."

| Day | Topic |
|-----|-------|
| Day 41 | CloudWatch Metrics / Logs / Alarms / Dashboards — the fundamental axes of observability |
| Day 42 | CloudTrail / Config — auditing and configuration compliance |
| Day 43 | Systems Manager (Session Manager / Patch Manager / Automation) — operations automation |
| Day 44 | X-Ray / OpenTelemetry — distributed tracing |
| Day 45 | Week 9 wrap-up scenarios |

In particular, since the GuardDuty, Inspector, and Macie findings we saw this week all flow into CloudWatch Events (EventBridge), and GuardDuty analyzes CloudTrail logs, security and operations effectively share the same data pipeline. Before starting next week's material, it helps to work through this week's 12 scenarios one more time.

---

해설 보강: The security domain of SAA-C03 (30%) is the largest area on the exam, but 90% of scenarios are solved by keyword → service mapping. ① "auto rotation" = Secrets Manager, ② "PII detection" = Macie, ③ "behavior-based threat" = GuardDuty, ④ "CVE scan" = Inspector, ⑤ "L7 attack" = WAF, ⑥ "L3/L4 DDoS + Cost Protection" = Shield Advanced, ⑦ "direct mobile S3 upload" = Cognito Identity Pool, ⑧ "enterprise SAML SSO" = User Pool + SAML, ⑨ "Multi-Region encryption" = Multi-Region Keys, ⑩ "org-wide security in bulk" = Firewall Manager, ⑪ "integrated compliance score" = Security Hub, ⑫ "root-cause graph" = Detective. Memorize these 12 mappings and you can answer nearly every security-domain scenario quickly. And remember just two additional traps — ① "minimize cost" does not mean downgrading security (a cost-optimization option like S3 Bucket Keys is the answer), and ② in scenarios that require a combination of two services (like User Pool + Identity Pool), don't pick a single-service answer.
