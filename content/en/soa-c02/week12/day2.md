# Day 2 - Control Tower, Compliance as Code, Governance

AWS Control Tower orchestrates Organizations + CloudFormation + Config. Preventive controls (SCPs), detective controls (Config rules). Landing Zones establish baseline secure accounts. Enroll existing accounts automatically.

Compliance automation: Config Rules evaluate configuration continuously. Config Remediation runs Lambda/SSM on violations. EventBridge workflows automate responses. Template libraries (stacksets).

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
