# Day 1 - Amazon GuardDuty: Threat Detection Principles, Finding Types, Threat Intelligence, Multi-Account Delegated Administrator

Detection presupposes that prevention has been breached. No matter how much you block with firewalls, IAM, and encryption, credential theft, insiders, and zero-days get through. So the second pillar of security operations is "noticing, *based on evidence*, malicious activity that has already happened (or is happening)." Amazon GuardDuty is the primary entry point of this detection layer: **agentless**, it continuously analyzes account-wide telemetry and emits threats as findings.

The essence of GuardDuty is that it is "not a service that *collects* logs but an analysis engine that *reads logs and gives them meaning*." It is not that GuardDuty sees something only because you turned on CloudTrail; GuardDuty *directly subscribes* to the CloudTrail/VPC Flow/DNS streams and analyzes them. You do not need to configure anything to store or forward logs, and data sources are connected the moment you enable it — this "just turn it on and you're done" is the point the exam asks about.

## What Does It Analyze: The Three Foundational Data Sources

The three *foundational* sources GuardDuty always consumes with no additional cost or configuration:

```
CloudTrail management events        → API call behavior (who did what)
CloudTrail S3 data events (optional) → S3 object-level access
VPC Flow Logs                       → Network flows (where did it connect)
DNS query logs                      → Domain resolution (what did it look up)
```

An important subtlety: GuardDuty **does not replicate** these logs. Even if you have not turned on VPC Flow Logs in the account, GuardDuty internally receives and analyzes the flow data (without storing it separately). DNS analysis is possible **only when you use the VPC default DNS resolver (Route 53 Resolver)** — if you use a custom DNS or an external resolver, GuardDuty's DNS-based findings (for example, DNS exfiltration) become a blind spot.

This is a classic case of *behavioral detection*. Rather than relying only on signature matching (known malicious IPs, hashes), it catches *anomalies* relative to a baseline using statistics and ML. GuardDuty learns a "normal" profile per account (the APIs normally called, the geographies and ports normally communicated with) and scores behavior that differs from the norm as a threat. This corresponds to "Anomalies and Events (DE.AE)" within the "Detect" function of the NIST CSF.

### Different Data Sources Can Answer Different Questions

Exam questions on choosing a detection service ultimately reduce to "who holds the data that can answer this question." If you organize each service along the axis of *what it consumes*, there is no room for confusion.

| Service | Data consumed | Questions it answers | Questions it cannot answer |
|---------|---------------|----------------------|----------------------------|
| **GuardDuty** | CloudTrail management events, VPC Flow, DNS queries, (+optional) S3 data events, EKS audit logs, runtime telemetry, EBS snapshots | "Who is performing malicious activity right now?" | "Which CVEs are on this server?", "Does this file contain national ID numbers?" |
| **Inspector** | Package inventory (SSM/snapshot), ECR image layers, Lambda dependencies, network reachability | "Where are the weaknesses that can be exploited?" | "Am I being attacked right now?" |
| **Macie** | The *content* of S3 objects | "Where is sensitive data and how much?" | "Who stole it?" |
| **Detective** | VPC Flow, CloudTrail, GuardDuty findings, EKS audit logs **linked as a graph** | "Why did it happen and how far did it spread?" | "Detect new threats" (it does not produce findings) |
| **Security Hub** | The *findings* (ASFF) of the services above | "What is the riskiest thing across the entire organization right now?" | In-depth queries on the source data |

> ⚠️ **Pitfall**: The pair most often mixed up in this table is **GuardDuty and Inspector**. "The EC2 instance seems to have been compromised" is GuardDuty; "can the EC2 instance be compromised?" is Inspector. The tense of the sentence is the hint — past or present progressive means threat detection; future or hypothetical means vulnerability management. Another easy mistake is the misconception that **"you must turn on VPC Flow Logs first to use GuardDuty."** GuardDuty receives flow data directly through an internal service path, so the user does not need to enable Flow Logs or store them in S3 at all. Conversely, *turning off Flow Logs does not stop GuardDuty's network detection either.*

The 2019 Capital One breach is a textbook incident for understanding what GuardDuty looks at. The attacker used SSRF to manipulate an EC2 workload behind a misconfigured web firewall, **pulled the IAM role's temporary credentials from the instance metadata service (IMDS)**, and used those credentials to read data from S3 buckets in bulk. Breaking this attack path down from GuardDuty's perspective, each stage leaves traces in a different data source — the fact that the credentials were used from an IP outside AWS is left in **CloudTrail management events**, the bulk object reads in **S3 data events**, and the anomalous outbound traffic in **VPC Flow**. The representative finding GuardDuty offers for this family of incidents is `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS` (EC2 role credentials used from outside AWS). There are two lessons. First, **role credentials are just strings the moment they leave the instance**, so the assumption "the instance is safe, so the role is safe" does not hold. Second, preventive controls (enforcing IMDSv2, SSRF defense, least privilege) and detective controls (GuardDuty) cannot substitute for one another — prevention lowers the probability, and detection shortens the *time* after prevention has failed.

## Protection Plans: Extended Detection Layered on the Foundation

Beyond the foundational sources, there are *protection plans* that turn on additional data sources. Each is billed separately and generates its own finding types:

- **S3 Protection**: Analyzes CloudTrail S3 data events → suspicious S3 access patterns
- **EKS Protection**: Analyzes EKS audit logs → Kubernetes API-level threats
- **Runtime Monitoring**: A lightweight agent (EKS/ECS/EC2) provides visibility into **in-host** behavior (processes, files, network) → container and instance runtime threats
- **Malware Protection (EBS)**: Takes a snapshot of a suspicious EC2 instance's EBS volume and runs a malware scan (no agent needed)
- **Malware Protection for S3**: Scans uploaded objects
- **RDS Protection**: Analyzes Aurora login activity → DB credential attacks
- **Lambda Protection**: Analyzes Lambda network activity

> ⚠️ **Pitfall**: The answer to the scenario "I turned on GuardDuty but can't see an in-host compromise (a malicious process)" is usually **enable Runtime Monitoring**. Foundational GuardDuty only sees the network/API perspective. And "EC2 seems infected with malware → scan it" is **Malware Protection (EBS)**.

The decision criteria for choosing protection plans, in one table, are as follows. The exam asks in the form "this visibility is missing → what do you turn on?"

| What you cannot see | What to turn on | How data is obtained |
|---------------------|-----------------|----------------------|
| Processes run and file changes inside an instance | **Runtime Monitoring** | Lightweight agent (EKS/ECS Fargate/EC2) |
| Malicious files on an EC2 disk | **Malware Protection for EC2** | **Takes an EBS snapshot** and scans on the service side (no agent needed) |
| Malicious files uploaded to S3 | **Malware Protection for S3** | Scans the object at upload time |
| Kubernetes API-level abuse (privileged pods, anonymous access) | **EKS Protection** (audit logs) | EKS control plane audit logs |
| Anomalous patterns of S3 object access | **S3 Protection** | CloudTrail S3 data events |
| Aurora login brute force and anomalous logins | **RDS Protection** | Aurora login activity |
| Anomalous outbound communication from a Lambda function | **Lambda Protection** | Lambda network activity |

The way Malware Protection for EC2 works "without an agent" has implications more important in practice than on the exam. GuardDuty **copies the EBS volume snapshot of the suspicious instance to the service account side and scans it**. This means three things. (1) There is effectively no performance impact on the workload — the scan happens outside the instance. (2) An infected host cannot interfere with the scan or tamper with the results — it sidesteps the fundamental trust problem that antivirus running on a compromised host has. (3) In exchange, **if the volume is encrypted with a customer managed KMS key, the GuardDuty service role must be able to use that key.** A common cause of "I turned on Malware Protection but only certain instances fail to scan" is the KMS key policy. You can also choose whether to retain the snapshot, but if you retain it for forensics, that snapshot itself becomes a sensitive asset, so you must apply access controls to it separately.

## Anatomy of a Finding

A finding is the output of GuardDuty detection. Finding types follow a consistent naming convention:

```
ThreatPurpose:ResourceTypeAffected/ThreatFamilyName.DetectionMechanism!Artifact

e.g.) UnauthorizedAccess:EC2/SSHBruteForce
      Backdoor:EC2/C&CActivity.B!DNS
      CryptoCurrency:EC2/BitcoinTool.B!DNS
      Recon:IAMUser/UserPermissions
      Exfiltration:S3/AnomalousBehavior
      Trojan:EC2/DNSDataExfiltration
      PenTest:IAMUser/KaliLinux
      Policy:S3/BucketBlockPublicAccessDisabled
```

- **ThreatPurpose**: Backdoor, Behavior, CryptoCurrency, Exfiltration, Impact, PenTest, Persistence, Policy, PrivilegeEscalation, Recon, Stealth, Trojan, UnauthorizedAccess, and so on — indicates the attack's *stage/intent*.
- **ResourceTypeAffected**: EC2, IAMUser, S3, EKSCluster, RDS, Lambda, and so on.
- **DetectionMechanism**: How it was detected, as in `.B!DNS` (DNS-based, etc.).

Each finding has a **severity** score of 1.0–10.0: Low (1.0–3.9), Medium (4.0–6.9), High (7.0–8.9), Critical (9.0–10.0). On the exam, *which finding means which threat* matters more than the score itself.

The ThreatPurpose classification is effectively a mapping to **MITRE ATT&CK** Tactics — Recon, PrivilegeEscalation, Persistence, Exfiltration, Impact, and so on correspond to ATT&CK kill-chain stages. Reading findings from the ATT&CK perspective lets you judge "how far the attack has progressed" and set response priorities.

### Reading Real Findings Line by Line (1) — Credential Exfiltration

The real skill of this week is not memorizing a list of findings but **receiving one finding and reconstructing what happened**. Let us check the skeleton of a GuardDuty finding JSON with a real one.

```json
{
  "SchemaVersion": "2.0",
  "AccountId": "111122223333",
  "Region": "ap-northeast-2",
  "Id": "ac1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d",
  "Type": "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS",
  "Severity": 8,
  "Title": "Credentials created exclusively for an EC2 instance have been used from an external IP address.",
  "Resource": {
    "ResourceType": "AccessKey",
    "AccessKeyDetails": {
      "AccessKeyId": "ASIAEXAMPLEKEYID",
      "PrincipalId": "AROAEXAMPLE:i-0abc123def4567890",
      "UserType": "AssumedRole",
      "UserName": "app-server-role"
    }
  },
  "Service": {
    "ServiceName": "guardduty",
    "DetectorId": "12abc34d567e8fa901bc2d34e56789f0",
    "ResourceRole": "TARGET",
    "Action": {
      "ActionType": "AWS_API_CALL",
      "AwsApiCallAction": {
        "Api": "ListBuckets",
        "ServiceName": "s3.amazonaws.com",
        "CallerType": "Remote IP",
        "RemoteIpDetails": {
          "IpAddressV4": "198.51.100.24",
          "Country": { "CountryName": "Netherlands" },
          "Organization": { "Asn": "64500", "AsnOrg": "EXAMPLE-HOSTING" }
        }
      }
    },
    "Count": 14,
    "EventFirstSeen": "2026-03-14T02:11:07Z",
    "EventLastSeen": "2026-03-14T02:29:52Z"
  }
}
```

Unpacking what each line means:

| Field | What the value says |
|-------|---------------------|
| `Type` | The threat purpose is **unauthorized access**, the target is **IAMUser (credentials)**, the threat family is **InstanceCredentialExfiltration**, and `.OutsideAWS` — it was used from an IP *outside* AWS. This suffix is decisive. If it were `.InsideAWS`, it would mean it was used from another AWS account or instance, and there is a slight chance it is a legitimate cross-account architecture. With `OutsideAWS` that chance is nearly nil. |
| `Severity: 8` | The High band (7.0–8.9). A candidate for immediate response. |
| `Resource.ResourceType: "AccessKey"` | What was affected is not the EC2 *instance* but the **credentials**. That is why terminating the instance does not end the problem. |
| `AccessKeyDetails.UserType: "AssumedRole"` + `:i-0abc...` in `PrincipalId` | This temporary credential is a **role session issued to EC2 through an instance profile**. The instance ID attached after `PrincipalId` tells you exactly "which instance it leaked from." |
| `Service.ResourceRole: "TARGET"` | Means this resource was the *target* of the activity (the opposite is `ACTOR`). Indicates the credentials were the side being exploited in the attack. |
| `Action.ActionType: "AWS_API_CALL"` | The basis for detection is an **API call recorded in CloudTrail**, not a network connection or DNS. |
| `AwsApiCallAction.Api: "ListBuckets"` | The attacker's first move was **S3 bucket enumeration** — classic reconnaissance. The next step is almost always `GetObject`. |
| `RemoteIpDetails` | The calling IP, country, and ASN. A call from a hosting provider's ASN is a strong signal that it is not the office or CI. |
| `Count: 14`, `EventFirstSeen/LastSeen` | **14 times within 18 minutes**. It means a script ran rather than a human by hand, and the response clock has already started. |

The response order derived from this single case is clear. (1) **Invalidate** that role session — not deleting the access key, but attaching a time-based deny policy to the role (an `aws:TokenIssueTime` condition) or immediately narrowing the role's trust/permissions. (2) **Isolate** the source instance (move it to an isolation SG, do not terminate — memory evidence disappears). (3) Check whether **IMDSv2 is enforced** — this type of exfiltration usually comes from SSRF + IMDSv1. (4) **Scope** what that session actually read from CloudTrail. (5) Use Detective to trace other entities touched by the same IP and same role (day2).

For a finding whose `Resource.ResourceType` is `AccessKey`, you must not choose "terminate the instance" as the answer. The temporary credentials are already outside the instance and valid until they expire, so even if you eliminate the instance, **the credentials remain alive**. Moreover, termination destroys forensic evidence (memory and disk state). The form of the correct answer is always "invalidate the session + isolate the instance (not terminate) + snapshot."

### Reading Real Findings Line by Line (2) — DNS-Based Mining Detection

```json
{
  "Type": "CryptoCurrency:EC2/BitcoinTool.B!DNS",
  "Severity": 8,
  "Resource": {
    "ResourceType": "Instance",
    "InstanceDetails": {
      "InstanceId": "i-0abc123def4567890",
      "InstanceType": "c6i.8xlarge",
      "NetworkInterfaces": [
        { "PublicIp": "203.0.113.77", "VpcId": "vpc-0a1b2c3d", "SubnetId": "subnet-0e5f6a7b" }
      ],
      "Tags": [{ "Key": "Env", "Value": "prod" }]
    }
  },
  "Service": {
    "ResourceRole": "ACTOR",
    "Action": {
      "ActionType": "DNS_REQUEST",
      "DnsRequestAction": { "Domain": "pool.example-mining.net", "Protocol": "UDP", "Blocked": false }
    },
    "Count": 431
  }
}
```

What matters is how the way of reading differs from the previous finding.

- The `!DNS` suffix and `ActionType: "DNS_REQUEST"` — the basis for detection is a **domain query**. It did not see actual mining traffic; it caught the fact that the instance *asked about* a domain known to be a mining pool. That is why **if you do not use the VPC default Route 53 Resolver, this finding is never generated at all.**
- `ResourceRole: "ACTOR"` — this time the instance is the **acting party**. It is the exact opposite of the previous finding (`TARGET`), and this one field splits "the side being attacked or the side attacking."
- `Blocked: false` — means the query succeeded without being blocked by a control such as Route 53 Resolver DNS Firewall. If it had been blocked, the risk assessment would differ.
- `InstanceType: "c6i.8xlarge"` + `Env: prod` — a large compute instance is being used for mining. Cost damage is also occurring immediately.
- `Count: 431` — not a one-off false positive but sustained activity.

The 2018 cryptocurrency mining incident on Tesla's AWS account, which became public, shows what this finding type looks like in reality. A Kubernetes management console with no authentication was exposed to the internet, and the attacker obtained credentials within it and loaded mining software onto cloud resources. What stands out is that the attacker, **to evade detection**, kept the mining pool on their own server rather than a public pool, used a non-standard port, and kept CPU utilization low. That is, the operational instinct "we'll notice when we see 100% CPU" no longer works. This is why detection that looks at **DNS/network reputation and behavioral anomalies** together, like GuardDuty, is needed, and it also explains why DNS-based findings becoming a blind spot in environments using custom DNS resolvers is a real risk.

### Finding Type → Meaning → First Response Mapping

The most efficient way to memorize findings that recur on the exam is to group them by "what they suggest" and "what to do first."

| Finding type | Situation it suggests | What to do first |
|--------------|-----------------------|------------------|
| `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS` | Instance role credentials used from outside AWS — close to a confirmed compromise | Invalidate session → isolate instance → check IMDSv2 → scope the impact |
| `UnauthorizedAccess:EC2/SSHBruteForce` / `RDPBruteForce` | A management port is open to the internet and under brute force | Close the management port in the SG, switch to SSM Session Manager |
| `UnauthorizedAccess:EC2/MetadataDNSRebind` | **Attempt to reach IMDS (169.254.169.254)** via DNS rebinding — SSRF family | Enforce IMDSv2 (`HttpTokens=required`), reduce hop limit, inspect the app for SSRF |
| `CryptoCurrency:EC2/BitcoinTool.B!DNS` | Instance queried a mining pool domain — usually already compromised | Isolate → snapshot → trace the initial intrusion path (cost damage is also ongoing) |
| `Backdoor:EC2/C&CActivity.B!DNS` | Attempted communication with a command-and-control (C2) server | Isolate immediately, block network outbound, forensics |
| `Trojan:EC2/DNSDataExfiltration` | An exfiltration technique that carries data in DNS queries | Isolate, apply DNS Firewall, scope the exfiltration |
| `Recon:IAMUser/UserPermissions` (and `ResourcePermissions`, `NetworkPermissions`) | Credentials sweeping the permission structure — the **post-intrusion reconnaissance** stage | Full investigation of that principal's recent activity, review sessions |
| `PrivilegeEscalation:IAMUser/AdministrativePermissions` | A principal trying to attach administrator-level permissions to itself | Immediately revert the permission change, block the principal, trace the change history |
| `Persistence:IAMUser/*` | Planting **re-entry paths** such as new users, keys, and roles | Review all newly created credentials and roles, then remove them |
| `Stealth:IAMUser/CloudTrailLoggingDisabled` | **Attempt to turn off the audit log** — covering tracks | Restore logging immediately, block recurrence with an organization SCP, top-priority investigation |
| `Policy:IAMUser/RootCredentialUsage` | Root credentials were used | Confirm the reason for use, check root MFA and the prohibition policy |
| `Exfiltration:S3/AnomalousBehavior` / `ObjectRead.Unusual` | S3 reads of an unusual volume or by an unusual principal | Check the principal and bucket, judge the data sensitivity (tie in Macie) |
| `Discovery:S3/BucketEnumeration.Unusual` | Reconnaissance sweeping the bucket list | Check where the credentials came from, reduce permissions |
| `PenTest:IAMUser/KaliLinux` | API calls using the user agent of a penetration-testing distribution | Confirm whether it is an approved pen test — if not, it is a compromise |
| `Impact:EC2/PortSweep` | The instance is port-sweeping outward — **our asset has become an attack foothold** | Isolate, block outbound, investigate the compromise |

> 🎯 **Scenario**: If the situation is "GuardDuty emitted `Recon:IAMUser/UserPermissions`, followed by `PrivilegeEscalation:IAMUser/AdministrativePermissions`, and then `Persistence:IAMUser/*` in order," it means not three individual alerts but **a single compromise progressing along the kill chain** — reconnaissance → privilege escalation → persistence. Here "handle each finding as an individual ticket" is the wrong answer, and the correct answer is to **group them by the same principal/IP and escalate to a single incident** (Detective finding groups, Security Hub correlation), while also invalidating the credentials and removing the newly created persistence artifacts. The training in reading ThreatPurpose as ATT&CK stages pays off here.

## Threat Intelligence: Known Malicious + User-Defined

GuardDuty has built-in threat intelligence feeds curated by AWS and third parties (CrowdStrike, Proofpoint, and others). Communication with known malicious IPs and domains immediately becomes a finding.

In addition, users can register two lists themselves:
- **Trusted IP list**: Activity from these IPs does not generate findings (whitelist). Your own office, VPN IPs, and so on.
- **Threat IP list**: Communication with these IPs generates findings (custom blacklist). Integrates your own threat intelligence.

```
GuardDuty threat assessment
  ├─ AWS-curated intel (automatic)
  ├─ Trusted IP list  → suppress finding on match
  └─ Threat IP list   → generate finding on match
```

Trusted IP / Threat IP lists are managed at the **delegated administrator (or individual account)** level, and member accounts cannot add their own lists (in organization mode the administrator manages them centrally). Also, GuardDuty is not a *prevention* tool — putting an IP in Trusted IP does not *allow that IP's access*; it merely *stops generating findings*. Access control is the job of SG/NACL/WAF.

## Multi-Account: Delegated Administrator

Enterprises use dozens to hundreds of accounts. Turning on GuardDuty separately in each account and viewing separately is impractical. The **AWS Organizations + delegated administrator** pattern is the correct answer:

```
Management account ──designates──▶ Delegated administrator account (usually the Security Tooling account)
                                      │
                                      ├─ Enable GuardDuty across the organization
                                      ├─ Set "Auto-enable for new accounts"
                                      └─ Centrally aggregate and manage all member findings
```

- The management account designates one account (recommended: a separate *Security Tooling* account) as the **GuardDuty delegated administrator**.
- The delegated administrator enables GuardDuty in all accounts in the organization, and **auto-enable** automatically includes new accounts too.
- Member account findings are *aggregated* in the delegated administrator console and viewed in a single pane.

This is an AWS *multi-account security baseline* best practice. Security tools (GuardDuty, Security Hub, Detective, Macie, and so on) are delegated to a dedicated *Security Tooling* account separate from workload accounts, so that workload account administrators cannot turn off detection or hide findings (separation of privilege). The delegated administrator pattern gives organization-wide visibility without loading the security operations burden onto the management account (where root-level privilege is concentrated).

Member accounts cannot disable GuardDuty *in their own account* (when the delegated administrator enforces it in organization mode). The answer to the problem "new accounts are a detection blind spot" is **enabling auto-enable**. Also, only the **management account** can designate the delegated administrator.

### Real CLI: From Turning It On to Organization Deployment

Console clicks do not appear on the exam, but the CLI helps understanding because it reveals *the unit in which each concept exists*. In particular, the CLI makes clear that everything in GuardDuty hangs off **one detector per Region**.

```bash
# 1) Create a detector = turn on GuardDuty in this Region.
#    There is only one detector per Region, and all subsequent commands require the detector-id.
aws guardduty create-detector \
  --enable \
  --finding-publishing-frequency FIFTEEN_MINUTES \
  --data-sources '{"S3Logs":{"Enable":true}}'

# 2) Filter to only currently open High severity findings (severity 7 or higher, not yet archived)
DETECTOR=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)

aws guardduty list-findings \
  --detector-id "$DETECTOR" \
  --finding-criteria '{
    "Criterion": {
      "severity": { "GreaterThanOrEqual": 7 },
      "service.archived": { "Eq": ["false"] }
    }
  }' \
  --sort-criteria '{"AttributeName":"severity","OrderBy":"DESC"}'

# 3) Retrieve the finding body — the JSON seen above comes from here
aws guardduty get-findings \
  --detector-id "$DETECTOR" \
  --finding-ids "ac1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d" \
  --query 'Findings[].{Type:Type,Sev:Severity,Actor:Service.ResourceRole,
                        Api:Service.Action.AwsApiCallAction.Api,
                        Ip:Service.Action.AwsApiCallAction.RemoteIpDetails.IpAddressV4,
                        Count:Service.Count}'
```

Trusted/threat IP lists work by pointing to a text file uploaded to S3 — the list itself becomes a version-controllable artifact.

```bash
aws guardduty create-ip-set \
  --detector-id "$DETECTOR" \
  --name corp-egress-ips --format TXT \
  --location s3://sec-intel-111122223333/trusted/corp-egress.txt \
  --activate

aws guardduty create-threat-intel-set \
  --detector-id "$DETECTOR" \
  --name internal-blocklist --format TXT \
  --location s3://sec-intel-111122223333/threat/blocklist.txt \
  --activate
```

Organization deployment has two steps. **Delegate from the management account**, and **apply the auto-enable policy from the delegated administrator account**.

```bash
# (Run in the management account) Designate the security account as the GuardDuty delegated administrator
aws guardduty enable-organization-admin-account --admin-account-id 999988887777

# (Run in the delegated administrator account) Include all accounts in the organization + new accounts automatically
aws guardduty update-organization-configuration \
  --detector-id "$DETECTOR" \
  --auto-enable-organization-members ALL \
  --features '[{"Name":"RUNTIME_MONITORING","AutoEnable":"ALL"},
               {"Name":"EBS_MALWARE_PROTECTION","AutoEnable":"ALL"}]'
```

Here `--auto-enable-organization-members ALL` means "existing + new, all," `NEW` means "new only," and `NONE` means "no auto-enable." On the exam, the symptom "new accounts are a blind spot" corresponds to this value being `NONE` rather than `NEW`, or not being configured at all. And **you must specify auto-enable separately for each protection plan (feature)** — a half deployment where only foundational GuardDuty is turned on automatically but Runtime Monitoring is not is a common mistake.

```
[ Multi-account GuardDuty wiring ]

 Organizations management account
   │  enable-organization-admin-account (only this command is management-account-only)
   ▼
 Security Tooling account = GuardDuty delegated administrator
   │  update-organization-configuration --auto-enable-organization-members ALL
   │  + per-feature AutoEnable (Runtime / Malware / EKS / RDS / Lambda)
   │
   ├── Member account A (workload)  ─── findings ──┐
   ├── Member account B (workload)  ─── findings ──┤
   └── New account N (auto-enrolled) ── findings ──┤
                                                   ▼
                        Delegated administrator console = single findings view for all accounts
                                                   │
                                                   └─▶ Security Hub / EventBridge

 * A member account cannot turn off its own detector = workload teams cannot neutralize detection.
 * Each Region has its own detector = delegation and auto-enable must also be applied per Region.
```

The last line of the diagram above is a blind spot easily missed in both practice and on the exam. **GuardDuty is a Regional service**, so no matter how well you deploy to the Seoul Region, you cannot see activity happening in Regions you do not use. An attacker launching instances to mine in a Region you normally do not use is a classic technique, and so "turn on GuardDuty even in Regions you do not use" is the baseline recommendation (inactive Regions have almost no data to analyze, so the cost is also negligible). If you want to block the Regions themselves, that is the job of an SCP (the `aws:RequestedRegion` condition), and detection and prevention must each be applied separately.

### Operations: Detection Fails If You Do Not Reduce Noise

When findings pile up by the hundreds a day, no one looks at them, and at that moment GuardDuty becomes the same as not existing even though it is turned on. There are three means of noise management, and it is important that **they differ in nature**.

| Means | What it does | Appropriate use | Risk |
|-------|--------------|-----------------|------|
| **Trusted IP list** | **Does not generate** findings related to that IP at all | Your own office, VPN, and monitoring scanner sources | If that IP is compromised, total silence — the riskiest choice |
| **Suppression rule (filter + auto-archive)** | Findings are *generated* but automatically archived | `Recon:EC2/Portscan` and the like from an approved vulnerability scanner | If the condition is broad, even real threats get buried |
| **archive-findings** | Closes individual findings after the fact | Cleaning up cases where the investigation is finished | Being an after-the-fact action, it reappears on recurrence |

```bash
# Auto-archive only port-scan detection findings created by the approved internal vulnerability scanner
aws guardduty create-filter \
  --detector-id "$DETECTOR" \
  --name suppress-approved-scanner \
  --action ARCHIVE \
  --finding-criteria '{
    "Criterion": {
      "type": { "Eq": ["Recon:EC2/Portscan"] },
      "resource.instanceDetails.tags.value": { "Eq": ["security-scanner"] }
    }
  }'
```

Whether to use the Trusted IP list or a suppression rule is decided by "will I want to know that fact later?" Trusted IP **leaves no evidence at all** — when that IP is later compromised and you investigate, you cannot trace back "what happened from this IP" through GuardDuty findings. A suppression rule generates the finding and only archives it, so if you remove the filter, past findings are visible as they were. So the practical recommendation is to **use suppression rules wherever possible and minimize Trusted IPs**. This is the same as the general principle of logging — *deciding not to look* and *deciding not to record* carry completely different weight. The former is reversible and the latter is irreversible.

The finding publishing frequency (`finding-publishing-frequency`) applies **only to subsequent occurrences of existing findings**. The default is 6 hours and it can be reduced to 15 minutes or 1 hour, but **completely new findings are published to EventBridge immediately, regardless of the frequency.** The symptom "automated response runs 6 hours late" appears when you use a *repeat finding* rather than a new finding as the trigger. If you do not know this difference when designing responses that need immediacy, such as automatic isolation, the pipeline quietly slows down.

## After a Finding Appears: Automation Integration

A finding must not end at being viewed. GuardDuty publishes findings to **Amazon EventBridge** (near real time). Using this as a trigger:

```
GuardDuty Finding ──▶ EventBridge Rule ──▶ Lambda (isolate/snapshot/tag)
                                        ├─▶ SNS (notification)
                                        ├─▶ Step Functions (response workflow)
                                        └─▶ Security Hub (aggregation, automatic integration)
```

Example: an `UnauthorizedAccess:EC2/SSHBruteForce` finding → EventBridge → Lambda moves that EC2 instance to an isolation SG + forensic snapshot + ticket creation. New findings go to EventBridge immediately, and subsequent occurrences of existing findings are aggregated and published at a default 6-hour interval (configurable from 15 minutes).

The value of GuardDuty detection findings is completed through *correlation* and *response*. A single detection finding may be noise, but it produces operational value when you investigate with Detective (Day 2), correlate with other detection findings in Security Hub (Day 4), and attach automated response with EventBridge. If you see GuardDuty only as an "alarm generator," you are using half of it — it should be designed as the entry point of a detect → investigate → respond pipeline.

## Distinctions Often Gotten Wrong

- **GuardDuty vs CloudTrail**: CloudTrail *records logs*, GuardDuty *analyzes logs to judge threats*. CloudTrail is the source, GuardDuty the interpreter.
- **GuardDuty vs Inspector**: GuardDuty covers *runtime threats* (malicious activity happening now), Inspector covers *vulnerabilities* (exploitable weaknesses). The point in time of detection differs (Day 3).
- **GuardDuty vs Macie**: Macie does *sensitive data (PII) classification* in S3, GuardDuty handles threat behavior. The purposes differ.
- **GuardDuty vs WAF/SG**: GuardDuty only detects, and does not prevent (block). Blocking is for other controls and automation.
- **GuardDuty vs Security Lake/CloudTrail Lake**: The latter are data layers that *gather, retain, and query* logs, whereas GuardDuty is the analysis layer that *judges*. GuardDuty does not hand the original logs back to the user.

## Summary

Summarized in one sentence, GuardDuty is **"managed threat detection that works when you turn it on,"** but the real capability lies behind that. Turning it on is the start, and what the exam usually asks are the following four judgments.

1. **The boundary of visibility** — With the foundational sources (CloudTrail, Flow, DNS) alone, you cannot see inside the host, malware on disk, or the Kubernetes API. From "what can't I see" you decide which protection plan to turn on. And blind spots that arise *because of configuration*, such as a custom DNS resolver or unused Regions, do not go away just by turning on the service.
2. **Reading findings** — From the name `ThreatPurpose:Resource/Family.Mechanism!Artifact` and just a few fields such as `Severity`, `ResourceRole`, `Action`, and `Count`, you can read "which side is it, the attacked or the attacking," "what was the basis of detection," and "is it a one-off or ongoing." This reading is the first-response decision.
3. **The limits of its role** — GuardDuty only detects. Blocking is SG/NACL/WAF/DNS Firewall, investigation is Detective, aggregation is Security Hub, and remediation is the automation behind EventBridge. The distinction that Trusted IP is *finding suppression*, not *access permission*, is in the same vein.
4. **Organization-scale deployment** — Delegated administrator (Security Tooling account) + auto-enable + per-protection-plan auto-enable + all Regions. Only when all four are in place can you say "the whole organization is being detected."

Both Capital One's credential exfiltration and the mining in Tesla's account had their damage determined by *how long it took to notice*. The value of detection lies not in stopping the attack but in **shortening the time the attack is in progress** — this perspective runs through all of week9.

### One-Line Summary Checklist

- [ ] Did you turn on GuardDuty from the organization delegated administrator (Security Tooling account) and enable auto-enable?
- [ ] Are you using the VPC default Route 53 Resolver for DNS-based detection?
- [ ] Did you turn on Runtime Monitoring if you need in-host threats, and Malware Protection for malware?
- [ ] Did you receive findings through EventBridge and connect them to notification and automated response?
- [ ] Are you managing Trusted/Threat IP lists in line with your threat intelligence?

---

## 📝 Practice Questions

**Question 1.** The security team wants to operate GuardDuty in a 50-account organization. How can newly created accounts be automatically included in detection, and workload account administrators be prevented from turning GuardDuty off?

A) Turn on GuardDuty only in the management account and manually invite other accounts  
B) Designate a separate Security Tooling account as the GuardDuty delegated administrator and turn on auto-enable in organization mode  
C) Email each account administrator and ask them to turn on GuardDuty  
D) Turning on only an organization trail for CloudTrail automatically enables GuardDuty  

**Answer: B**  
Explanation: The answer for a multi-account baseline is to designate a dedicated Security Tooling account as the delegated administrator and use organization mode + auto-enable so that even new accounts are automatically included. In organization mode, the delegated administrator centrally manages GuardDuty for member accounts, so workload administrators cannot turn it off arbitrarily. Manual invitations and email requests create omissions and blind spots, and enabling CloudTrail does not automatically enable GuardDuty.

---

**Question 2.** You want to use GuardDuty to detect malicious processes and file changes running inside an EC2 instance. Basic GuardDuty alone did not show them. What should you do?

A) Store VPC Flow Logs separately in S3  
B) Enable GuardDuty Runtime Monitoring  
C) Turn on CloudTrail data events  
D) Enable Inspector  

**Answer: B**  
Explanation: Basic GuardDuty analyzes only the network flow, DNS, and API perspectives, so it cannot see process and file behavior *inside* the host. Host runtime visibility is provided by Runtime Monitoring, which deploys a lightweight agent. Storing Flow Logs is unrelated to how GuardDuty works, CloudTrail data events are an API/S3 perspective, and Inspector is a vulnerability scanning tool, not a runtime threat tool.

---

**Question 3.** GuardDuty generates no DNS-based data exfiltration (DNS exfiltration) findings at all. Investigation shows that the VPC uses a custom external DNS resolver. What is the cause?

A) GuardDuty does not analyze DNS  
B) DNS-based detection works only when the default VPC Route 53 Resolver is used, so using an external resolver creates a blind spot  
C) DNS exfiltration findings exist only in the paid plan  
D) All IPs are registered in the Trusted IP list  

**Answer: B**  
Explanation: GuardDuty's DNS query analysis applies only to queries that pass through the VPC default DNS (Route 53 Resolver). If you use a custom/external DNS resolver, GuardDuty cannot see the DNS queries, so DNS-based findings are missing. GuardDuty analyzes DNS as a foundational source, so A is wrong; DNS exfiltration is a foundational finding; and the abnormal configuration of putting every IP in the trusted list is unrelated to the scenario.

---

**Question 4.** A `CryptoCurrency:EC2/BitcoinTool.B!DNS` finding was generated. What does this finding tell you, and what is the most appropriate first response?

A) The EC2 instance shows Bitcoin mining/communication activity, so trigger automation to isolate the instance and snapshot it via EventBridge  
B) It is merely an informational finding, so ignore it  
C) It means an S3 bucket was made public  
D) It means an IAM user's permissions are excessive  

**Answer: A**  
Explanation: By the finding naming convention, the ThreatPurpose is CryptoCurrency, the target is EC2, and it is DNS-based detection (`.B!DNS`), so it means the instance is communicating with cryptocurrency mining or related domains - often a strong sign of compromise. The appropriate response is to receive the finding through EventBridge and automate instance isolation, forensic snapshot, and ticketing. Ignoring it is dangerous, and S3 exposure or excessive IAM permissions are other finding types (Policy:S3, Recon:IAMUser, etc.).

---

**Question 5.** Which statement about GuardDuty's Trusted IP list is correct?

A) It allows access from the registered IPs at the network level  
B) It suppresses GuardDuty from generating findings for the registered IPs' activity, but it is not a control that permits access itself  
C) It unconditionally blocks communication with the registered IPs  
D) Each member account can freely add to it  

**Answer: B**  
Explanation: The Trusted IP list is only a detection-side setting that suppresses finding generation for that IP's activity; it is not a network preventive control such as allowing or blocking access. Access control is the role of SG/NACL/WAF. Blocking communication is also a different concept from the Threat IP list's finding generation, and in organization mode this list is centrally managed by the delegated administrator, so members cannot add to it arbitrarily.

---

