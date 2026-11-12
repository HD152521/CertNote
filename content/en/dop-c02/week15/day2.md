# Day 2 - Hybrid CI/CD: Bridging On-Premises and AWS into One Deployment Model

Cloud migration rarely happens "all at once, all together." Decades-old COBOL batches, legacy with licenses tied to hardware, workloads that regulation forbids to leave the datacenter — they stay on-prem. New services go to AWS. Immediately: operational pain. "Two environments = two deployment pipelines, two credential systems, two patch tools, two monitoring stacks. If the team runs both, they double their work and double their mistakes. How do we unify operations?" Today: a realistic org with 5,000 on-prem VMs and 200 EC2s, strict security with inbound internet completely blocked. SSM Hybrid Activation·CodeDeploy On-Prem·IAM Roles Anywhere·PrivateLink solve this. Underneath: network, identity, crypto theory.

In DOP exams, hybrid appears as: "how does a DC server call AWS APIs when internet is blocked?", "how do you give DC servers temp credentials without static keys?", "how do you deploy to EC2 and DC servers as one?", "does Direct Connect encrypt the line?" Each touches SSM·CodeDeploy·Roles Anywhere·PrivateLink·DX.

## Pull vs Push — Firewall Determines Deployment Architecture

All hybrid design starts from one constraint: **On-prem firewalls block inbound.** To have AWS "push" commands into DC servers requires opening inbound ports — security teams usually refuse. Result: hybrid operations almost always converge on **Pull model** — DC server agents reach out to AWS (outbound connection) to "pull" commands.

This is how SSM Agent and CodeDeploy Agent work. Both open outbound HTTPS (443) from DC to AWS, receiving commands and artifacts over that connection. No inbound ports needed — this same philosophy as **bastion-less** ops (SSM Session Manager kills bastion + port 22).

> 💡 **Related theory**: Pull model's advantage flows from distributed systems' **connection directionality** principle. Firewalls are asymmetric by nature — outbound allowed, inbound blocked is the default policy. To manage many nodes behind NAT, the pattern is: nodes connect to center (pull) not center to nodes (push). Message queue consumers pull from broker; IoT devices maintain outbound MQTT; GitOps agents poll Git. Core trade-off: Pull is firewall-friendly, scales well (center doesn't need every node address), but command propagation has polling latency. Push is immediate but needs inbound paths and node inventory. Hybrid almost always chooses Pull.

## Network Topology — Two Decisions to Reach AWS Without Internet

Reaching AWS from internet-blocked DC requires two separate calls. **(1) The line carrying traffic** (connectivity) and **(2) How to reach AWS APIs** (endpoints).

**Direct Connect (DX)** is canonical for the line — telecom line bonds DC and AWS privately. No internet means superior latency, bandwidth, consistency. High availability usually means DX pairs (10Gbps × 2), with **IPSec VPN as backup** if DX fails. For multiple VPCs and DC paths, **Transit Gateway (TGW)** acts as hub, concentrating routing.

Reaching AWS APIs is subtler. Internet's blocked, so `s3.amazonaws.com` public endpoints are unreachable. **VPC Endpoint (PrivateLink)** is the answer — S3·ECR·SSM·Secrets Manager·CodeBuild APIs exposed inside VPC on private IPs, DC reaches those private IPs via DX/TGW. Traffic never leaves the internet.

> ⚠️ **Gotcha**: **Direct Connect does not encrypt by itself.** Classic trap. DX is a "private dedicated line" so it feels safe, but data on the line is cleartext. If regulation mandates line encryption, use **MACsec (MAC Security, IEEE 802.1AE)** on the DX port (layer 2, supported on 10Gbps+ dedicated connections) or **IPSec over DX** (layer 3, VPN over DX). "DX = auto-encrypted" is wrong. VPN (IPSec) encrypts by default but hits internet, so latency/bandwidth vs DX.

> 🔍 **Deeper**: DNS is a hidden gotcha in hybrid. DC servers need private IPs for VPC Endpoint names. `secretsmanager.ap-northeast-2.amazonaws.com` should resolve to private IP, but DC's on-prem DNS doesn't know that. **Route 53 Resolver Inbound/Outbound Endpoints** bridge both directions — Inbound lets DC query AWS private zones, Outbound lets AWS query DC internal domains. When making VPC Endpoint, **"Private DNS enabled"** is key — this makes standard AWS endpoint names resolve to private IPs. Exam gotcha: "PrivateLink Endpoint made but DC still resolves to public IP" — usually Resolver Endpoint unconfigured or Private DNS disabled.

## SSM Hybrid Activation — Treat DC Servers Like EC2

5,000 DC servers need to patch like EC2s, exist in Systems Manager as managed inventory. **SSM Hybrid Activation** enables this.

Flow: (1) `create-activation` issues activation code (ActivationCode + ActivationId). (2) SSM Agent on DC server, register with that code (`-register`). (3) Server gets `mi-xxxx` managed instance ID, becomes **EC2-like** target for Run Command·Patch Manager·State Manager.

```bash
aws ssm create-activation \
  --description "OnPrem-DC-App" \
  --default-instance-name dc-app \
  --iam-role SSMServiceRole \
  --registration-limit 100

# Output code to DC server
sudo amazon-ssm-agent -register \
  -code "ACTIVATION_CODE" -id "ACTIVATION_ID" -region ap-northeast-2
```

> ⚠️ **Gotcha**: **Activation token** vs **managed instance ID** — easy to confuse. ActivationCode/ActivationId are **one-time registration tokens with expiry and count limit.** Used only when registering a server first; after registration they're meaningless. `mi-xxxx` is **permanently attached after registration.** Exam: "activation code expired, what happens to already-registered server?" Answer: "mi-xxxx servers unaffected — continue managed. Activation token only needed for new registration." Exceed registration-limit and can't register more servers; large deployments scope the limit generous or issue multiple tokens.

## CodeDeploy On-Prem — Single AppSpec for Both Sides

Deployment unification's core: "EC2 and DC servers use **identical AppSpec**." CodeDeploy supports On-Premises Instances.

(1) Register DC server with CodeDeploy (`aws deploy register`), credentials via IAM User or Roles Anywhere. (2) Tag it; bundle into Deployment Group. (3) AppSpec identical to EC2. (4) Single deployment hits EC2 ASG and DC servers simultaneously.

```bash
aws deploy register \
  --instance-name dc-server-01 \
  --iam-user-arn arn:aws:iam::ACCT:user/CodeDeployUser \
  --tags Key=Env,Value=Prod

aws deploy add-tags-to-on-premises-instances \
  --instance-names dc-server-01 --tags Key=App,Value=Billing
```

> 🔍 **Deeper**: CodeDeploy On-Prem's biggest architectural limit is **no Auto Scaling integration.** EC2 deployment, CodeDeploy auto-applies latest to new instances spinning up. On-Prem is static inventory — servers don't auto-grow/shrink, so registration and tagging are manual or separate automation. Blue/Green's "spin new instance set, shift traffic" is also constrained on-prem (can't clone physical servers on-the-fly). On-Prem uses primarily In-Place deployment (overwrite code in-place). Exam: "On-Prem + ASG auto-scale deployment" is a trap answer.

## IAM Roles Anywhere — Replace Static Keys with X.509 Certificates

DC servers need AWS API credentials. Classically: long-lived IAM User access keys on the DC server — security anti-pattern. Key leaked, valid until revoked; rotation is manual; tracking 5,000 spread keys is hard. **IAM Roles Anywhere** fundamentally changes this.

Core idea: DC's **on-prem PKI (Public Key Infrastructure) X.509 certificates** prove identity to AWS; in return, AWS issues **temporary credentials (STS tokens).** No static keys exist on the server. Server authenticates with cert, gets short-lived token.

```bash
# Register on-prem CA as trust anchor
aws rolesanywhere create-trust-anchor \
  --name CorpCA --source sourceType=CERTIFICATE_BUNDLE,...
# Downstream: credential helper gets temp creds
```

> 💡 **Related theory**: Roles Anywhere combines **identity federation** + **PKI**. PKI's essence: trust chain — root CA signs intermediate, intermediate signs server cert, verifier trusts root alone, verifies whole chain (RFC 5280, X.509 standard). Roles Anywhere's "Trust Anchor" registers that root/intermediate as AWS's trust anchor. Deeper: **ephemeral credentials** — "secrets live short, die safer." Static keys accumulate leak risk over time; short-lived tokens leak and expire. Instance Profile (EC2), IRSA/Pod Identity (EKS), OIDC federation (GitHub Actions) all follow this — "replace static secrets with short-lived tokens." Codecov (2021) showed CI environment compromise's scope when static keys there; industry shifted to OIDC, Roles Anywhere, IRSA.

> 📚 **Case study**: **Codecov** (2021) supply chain: Bash Uploader script was compromised, exfiltrated **static cloud access keys from CI environment variables** to attacker server. Lesson: "Static long credentials in CI = full infrastructure key bleed on CI compromise." Industry moved to OIDC, Roles Anywhere, IRSA — **ephemeral, cert-based credentials.**

## Secret, Config, Monitoring Unification — One Tool Both Sides

Integrated credentials and deployment; integrate the rest.

- **Secrets/Config**: Secrets Manager·Parameter Store via PrivateLink DC access. Rotated RDS creds cascade to DC servers via SSM Document. Blocked-internet build? CodeArtifact as on-prem npm/Maven mirror cuts external registry dependency.
- **Monitoring**: CloudWatch Agent on EC2 and DC identical config (Hybrid Activation Role) collects metrics/logs centrally. X-Ray daemon/ADOT on DC traces end-to-end requests spanning DC→AWS.

> 🎯 **Scenario**: "5,000 DC servers inbound-internet-blocked: (1) patch like EC2, (2) query Secrets Manager via private route, (3) call AWS API stateless keys, (4) single release with EC2." → (1) SSM Hybrid Activation + Patch Manager. (2) Interface VPC Endpoint (PrivateLink) + Route 53 Resolver private DNS. (3) Roles Anywhere + on-prem CA. (4) CodeDeploy On-Prem + EC2 ASG same AppSpec (In-Place). Encryption: if required, MACsec or IPSec over DX.

## Summary

Today covered five. First, **firewall inbound block forces Pull model** — SSM/CodeDeploy agents outbound-pull commands. Second, **internet-blocked AWS reach needs line (DX+TGW) and endpoints (PrivateLink)**, Route 53 Resolver bridges DNS. Third, **SSM Hybrid Activation makes DC servers EC2-like**, distinguish activation token (one-time, expires) from mi-xxxx (permanent). Fourth, **CodeDeploy On-Prem unifies with EC2**, but ASG integration off-limits, static inventory. Fifth, **Roles Anywhere replaces static keys with X.509 cert-based ephemeral creds** (Codecov lesson), and DX needs MACsec/IPSec if line encryption required.

Next: containers scale to 100+ microservices, **large-scale ECS/EKS ops** at depth.

---

## 📝 Practice Questions

**Question 1.** In an environment where the on-premises data center firewall blocks inbound traffic, how do the SSM/CodeDeploy agents work, and what is the underlying principle?

A) Central AWS pushes commands to the DC servers, and inbound ports 22/443 must be opened

B) The agents on the DC servers open outbound HTTPS (443) to AWS and pull commands and artifacts, exploiting the firewall's asymmetry (outbound allowed, inbound blocked) so that no inbound port is opened at all

C) The DC servers must be exposed to the internet

D) It is impossible without a VPN

**Answer: B**

Explanation: A firewall is inherently asymmetric (outbound allowed, inbound blocked), so to control many nodes behind NAT, the standard approach is a Pull model in which nodes connect to the center. The SSM/CodeDeploy agents open outbound 443 from the DC to AWS to pull commands, so no inbound port needs to be opened (the same philosophy as bastion-less). Push (A), internet exposure (C), and VPN required (D) contradict the premises of hybrid operations.

---

**Question 2.** You are using a 10 Gbps Direct Connect link, and regulations require link encryption. What satisfies this with the least change?

A) Direct Connect is a private dedicated line, so it is encrypted automatically

B) DX itself is not encrypted, so you must add MACsec (Layer 2) or IPSec over DX (Layer 3)

C) Enabling S3 SSE-KMS alone encrypts the link

D) Enforcing TLS alone is enough

**Answer: B**

Explanation: DX is merely a physically separate dedicated line, and the data on the link is plaintext — it is not encrypted automatically. If link encryption is required, apply MACsec (IEEE 802.1AE, Layer 2 encryption for dedicated connections) to the DX port, or use IPSec over DX (Layer 3 encryption with a VPN layered over DX). SSE-KMS (C) encrypts data stored in S3 and has nothing to do with the link, and TLS (D) is at the application layer, so it is hard to say it directly satisfies a regulatory requirement for "mandatory link encryption." Automatic encryption (A) is the most common wrong answer.

---

**Question 3.** Which statement MOST accurately describes the relationship between the ActivationCode/ActivationId (activation token) and mi-xxxx (managed instance ID) in SSM Hybrid Activation?

A) They are the same thing

B) The activation token is a one-time registration token with an expiration date and registration limit, and mi-xxxx is the managed instance ID permanently attached to the server after registration — even if the token expires, an already registered mi-xxxx continues to be managed without impact

C) mi-xxxx is newly issued for every command

D) The activation token is permanent and mi-xxxx is single-use

**Answer: B**

Explanation: The ActivationCode/ActivationId is a one-time token with an expiration and limit used only when first registering a server with SSM, and it has no meaning once registration is complete. mi-xxxx is permanently attached to the server after registration and becomes the target of Run Command, Patch Manager, and State Manager. Therefore, even if the activation token expires, already registered servers continue to be managed, and the token is needed only for new registrations. Identical (A), issued per command (C), and the reversed relationship (D) are wrong.

---

**Question 4.** What is the standard method for deploying the same release simultaneously to an AWS EC2 ASG and DC servers in a single deployment, and what is its limitation?

A) It is possible with Ansible alone and has no limitations

B) Register and tag On-Premises Instances in CodeDeploy and deploy together with the EC2 ASG using the same AppSpec, but On-Prem has the limitations of no Auto Scaling integration and a static inventory, so In-Place deployment is mainly used

C) Deploy to both with Lambda

D) It is possible with SSM State Manager alone

**Answer: B**

Explanation: CodeDeploy supports On-Premises Instances, so once DC servers are registered and tagged, they can be bundled into one deployment with EC2 using the same AppSpec. However, On-Prem is not integrated with the ASG and is a static inventory (servers do not scale automatically), and creating a new set of instances for Blue/Green is also limited, so In-Place deployment is mainly used. "ASG-based automatic scaling deployment to On-Prem" is a wrong answer. Ansible with no limits (A), Lambda (C), and State Manager (D) are not the standard for single-AppSpec integrated deployment.

---

**Question 5.** For 5,000 DC servers, how can you grant temporary credentials for AWS API calls using the corporate PKI, without embedding static access keys?

A) Distribute long-term IAM User access keys to each server

B) IAM Roles Anywhere — register the corporate CA as a Trust Anchor, authenticate with the server's X.509 certificate, and receive short-lived STS credentials

C) Cognito Identity Pool

D) Manually call STS GetSessionToken every time

**Answer: B**

Explanation: IAM Roles Anywhere proves identity to AWS with X.509 certificates from the corporate PKI and receives temporary credentials — no static keys exist on the servers. It registers the PKI's chain of trust (RFC 5280) as a Trust Anchor and implements the short-lived credential principle that "the shorter a secret lives, the safer it is" (the same family as IRSA and OIDC federation). Long-term keys (A) are an anti-pattern with Codecov-style leak risk, Cognito (C) is for app user identity, and manually calling GetSessionToken (D) is not certificate-based automation.

---

**Question 6.** A DC server with the internet blocked must query AWS Secrets Manager. How can you create a private path with the least change, and what additional setting is commonly missed?

A) Add a NAT Gateway and go out over the internet

B) Create an Interface VPC Endpoint (PrivateLink) for Secrets Manager to access it via a private IP over DX/TGW, and configure a Route 53 Resolver Endpoint and enable Private DNS on the Endpoint so that the standard endpoint name resolves to the private IP from the DC

C) Public Endpoint + IAM policy

D) Build a Lambda Proxy

**Answer: B**

Explanation: In an internet-blocked environment, an Interface VPC Endpoint (PrivateLink) exposes the Secrets Manager API on a private IP inside the VPC, and it is accessed through DX/TGW — traffic never goes out to the internet (DNS is resolved through Route 53 Resolver). What is commonly missed is DNS: without a Route 53 Resolver Endpoint and Private DNS enabled on the Endpoint, the DC still resolves to the public IP. NAT (A) and the Public Endpoint (C) require an internet path, and a Lambda Proxy (D) is an unnecessary detour.

---

**Question 7.** What is the key lesson that the Codecov (2021) supply chain breach left for hybrid/CI credential design?

A) Container images must be scanned frequently

B) If static long-term credentials are kept in CI/deployment environments, a compromise of that environment leaks the keys wholesale and they are hard to invalidate or trace, so you should move to short-lived, certificate-based credentials such as OIDC federation, IAM Roles Anywhere, and IRSA

C) All traffic must be encrypted

D) Multi-Region backup is mandatory

**Answer: B**

Explanation: The Codecov breach was an incident in which the CI uploader script was tampered with and the static keys and tokens embedded in customers' CI environment variables were leaked wholesale. The lesson is "do not keep static long-term credentials in CI/deployment environments," and the industry has since moved to short-lived credentials such as OIDC federation, IAM Roles Anywhere, and IRSA/Pod Identity. Image scanning (A), traffic encryption (C), and multi-Region (D) are different topics.

---

## 📌 Today's Summary

There are five key takeaways today. First, the firewall's inbound blocking forces the Pull model (the SSM/CodeDeploy agents that pull via outbound connections), which is the distributed-systems principle of connection directionality. Second, reaching AWS without the internet requires two decisions, the link (DX+TGW; DX is unencrypted → MACsec/IPSec) and the endpoint (PrivateLink), and Route 53 Resolver connects DNS in both directions. Third, SSM Hybrid Activation manages DC servers like EC2, distinguishing the activation token (one-time, expiring) from mi-xxxx (permanent). Fourth, CodeDeploy On-Prem deploys to both sides with a single AppSpec but is limited by no ASG integration, a static inventory, and mainly In-Place deployment. Fifth, IAM Roles Anywhere replaces static keys with short-lived credentials based on X.509 certificates (the lesson of the Codecov incident, the PKI chain of trust per RFC 5280).
