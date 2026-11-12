# Day 2 - Incident Response for Compromised EC2: Isolation, Snapshots, Forensics, Credential Revocation

When you receive a signal that an EC2 instance has been compromised (GuardDuty's C2 communication, cryptocurrency mining, or backdoor detection), two conflicting instincts work in the responder's mind at once: *"I want to shut it down fast (containment)"* and *"I don't want to lose the evidence (preservation)."* The essence of responding to a compromised instance is to *reconcile the two with the right order and methods*. Terminating blindly destroys volatile evidence such as memory and connection state, and leaving it alone lets lateral movement and data exfiltration proceed. The exam asks "in what order, and by what mechanisms, do you isolate, preserve, and revoke?"

The standard procedure maps NIST IR's *Containment → Eradication → Recovery* phases (details in Day 4) onto EC2. Today we cover the concrete mechanisms of containment, evidence preservation, and credential revocation.

## Containment: Cut the Connection but Keep the Instance Alive

The goal of containment is to *stop the compromised instance from communicating any further* while *keeping the instance itself running so evidence can be collected*. Terminating or stopping destroys volatile evidence such as memory, so it is not the first means of containment.

Three containment mechanisms:

1. **Swap to a dedicated isolation security group**: the cleanest. Create an empty security group that blocks all inbound and outbound traffic (or allows only communication to forensic tools) and assign it to the instance. Applies immediately with `ModifyInstanceAttribute`.
2. **Block at the subnet level with a NACL**: if the instance is not alone in the isolation subnet, healthy instances in the same subnet are affected too. For instance-level isolation, a security group is the better fit.
3. **Move the ENI to an isolation subnet**: to a subnet with no routing. Complicated but powerful.

```bash
# 1) Create the isolation security group (no rules = blocks all traffic)
ISO_SG=$(aws ec2 create-security-group \
  --group-name forensic-isolation \
  --description "IR isolation - no traffic" \
  --vpc-id vpc-0abc123 --query GroupId --output text)

# 2) Swap the instance's security group to the isolation SG (the instance keeps running)
aws ec2 modify-instance-attribute \
  --instance-id i-0deadbeef \
  --groups $ISO_SG

# 3) Tag it with the forensic status (for automation and tracking)
aws ec2 create-tags --resources i-0deadbeef \
  --tags Key=IR-Status,Value=QUARANTINE Key=IR-Case,Value=INC-2026-0042
```

### Comparing Containment Methods: What to Use When

The three containment means are not substitutes but tools that differ in *scope of application and immediacy*. The exam varies the conditions, "isolate only one instance" vs "cut already-established sessions immediately" vs "without affecting other workloads," and asks which to choose.

| Axis | Swap isolation SG | NACL block | Move to isolation subnet/ENI | Remove routing |
|---|---|---|---|---|
| Unit of application | **Instance (strictly, the ENI)** | Entire subnet | Instance | Entire subnet |
| Statefulness | stateful: existing connections may persist briefly | **stateless: blocked immediately in both directions** | The path itself disappears | The path itself disappears |
| Collateral damage | None (target only) | **Healthy instances in the same subnet are affected too** | None | Entire subnet |
| Speed of application | Seconds, one API call | Seconds | Relatively slow and complex | Seconds |
| Keeping the SSM path | Can be selectively allowed with rules | Can be selectively allowed with rules | Depends on endpoint placement | Difficult |
| Reverting | Just assign the original SG again | Delete the rule | Move back | Restore the route |
| Typical situation | **The standard first means** | When an in-progress C2 session must be forcibly cut | Long-term isolation, detailed analysis | Suspected subnet-wide contamination |

**The default is always swapping the isolation SG.** It has no collateral damage, takes one API call, and is easy to revert (= it is a reversible action, so it is safe to automate). A NACL is an *auxiliary means*, a card to pull out only in the situation "I changed the security group but the session isn't cut." A choice that reverses this priority, locking the subnet with a NACL from the start, usually is wrong because it cuts healthy workloads too.

> ⚠️ **Trap: an "empty" security group is not empty**: A security group newly created with `aws ec2 create-security-group` **comes with a rule allowing all outbound traffic by default.** Only the inbound side is empty. If you attach it to the compromised instance in this state, inbound is blocked but **outbound C2 communication and data exfiltration continue as before**: the most dangerous misunderstanding in this unit, since exfiltration proceeds while you believe you've isolated it. You must explicitly remove the default outbound rule.

```bash
# 1) Create the isolation SG
ISO_SG=$(aws ec2 create-security-group \
  --group-name forensic-isolation \
  --description "IR isolation - deny all" \
  --vpc-id vpc-0abc123 --query GroupId --output text)

# 2) ★ You must remove the default allow-all outbound rule (without this line it is not isolation)
aws ec2 revoke-security-group-egress \
  --group-id $ISO_SG \
  --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]'

# 3) (Optional) Revive only the investigation path: allow only 443 to the SSM VPC endpoints
aws ec2 authorize-security-group-egress --group-id $ISO_SG --ip-permissions \
  'IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=pl-ssm-endpoints}]'

# 4) Swap the instance's security group to the isolation SG (the instance keeps running)
aws ec2 modify-instance-attribute --instance-id i-0deadbeef --groups $ISO_SG

# 5) If there are multiple ENIs, you must swap per ENI too: a remaining secondary ENI leaves a channel open
aws ec2 describe-instances --instance-ids i-0deadbeef \
  --query 'Reservations[].Instances[].NetworkInterfaces[].NetworkInterfaceId'
aws ec2 modify-network-interface-attribute \
  --network-interface-id eni-0secondary --groups $ISO_SG
```

Step 5 is the one most often skipped in practice. `modify-instance-attribute --groups` applies to the instance's **primary ENI**. For an instance with a secondary ENI attached (multi-homed appliances, container hosts, etc.), a hole remains in the isolation unless you swap each ENI separately.

If you must be certain existing sessions are cut, layer a NACL on top. The key points are that NACLs are evaluated in number order with the lower number winning, and that **inbound and outbound must each be specified**.

```bash
# NACL dedicated to the isolation subnet: explicit Deny of a specific IP only (both directions)
aws ec2 create-network-acl-entry --network-acl-id acl-0iso \
  --rule-number 10 --protocol -1 --rule-action deny --egress \
  --cidr-block 203.0.113.0/24
aws ec2 create-network-acl-entry --network-acl-id acl-0iso \
  --rule-number 10 --protocol -1 --rule-action deny --ingress \
  --cidr-block 203.0.113.0/24
```

> ⚠️ **Trap: when the instance belongs to an Auto Scaling group or a load balancer**: Swapping to the isolation SG makes the health check fail. Then **the ASG judges the instance unhealthy, terminates it on its own, and launches a new one**, so the evidence is gone before the responder has touched anything. That is why the real step zero of compromised-instance response is *detaching the instance from the ASG and target groups*. Detach it from the group with `detach-instances`, and if you pass `--no-should-decrement-desired-capacity`, the ASG immediately launches a replacement and service capacity is maintained as well. So **evidence preservation and service continuity are solved at once in this one line.**

```bash
# Step 0: take the investigation target out of the ASG's automatic termination, and keep capacity
aws autoscaling detach-instances \
  --instance-ids i-0deadbeef \
  --auto-scaling-group-name app-asg \
  --no-should-decrement-desired-capacity

# Also deregister from the load balancer target group (block incoming user traffic)
aws elbv2 deregister-targets \
  --target-group-arn arn:aws:elasticloadbalancing:...:targetgroup/app-tg/abc \
  --targets Id=i-0deadbeef
```

If a choice asks about the difference between `--no-should-decrement-desired-capacity` and `--should-decrement-desired-capacity`, **the side that does not decrement** is correct if you want to maintain service capacity during the investigation.

### Leave an Investigation Channel Even After Isolation

A complete block is clean, but from that moment neither memory dumps nor command execution are possible. The Systems Manager Agent works only if **outbound 443** is open to the `ssm`, `ssmmessages`, and `ec2messages` endpoints, and if the isolation SG blocks all outbound, Session Manager and Run Command are cut together.

The solution is to **cut the internet path and leave only the investigation path through VPC interface endpoints (PrivateLink).**

```
         ┌──────────────── Isolated instance (i-0deadbeef) ────────────────┐
         │  Isolation SG: no inbound / outbound = only 443 to SSM endpoints │
         └───────────────┬───────────────────────────────┬──────────────┘
                         │ Blocked                       │ Allowed
                         ▼                               ▼
                  Internet / NAT GW             VPC interface endpoints
                  (C2, exfiltration path)        com.amazonaws.<region>.ssm
                        ✗                          ...ssmmessages
                                                   ...ec2messages
                                                          │
                                                          ▼
                                          SSM Run Command → memory dump → S3 (Object Lock)
```

This structure is **the standard answer to the dilemma "if you isolate, you can't investigate,"** and it is infrastructure you must build in advance in the Preparation phase. If you create the endpoints after an incident, the time in between becomes exfiltration time as is.

Security groups are stateful, so *established connections* may persist for a while even after you swap the security group. To cut an in-progress C2 session immediately, use a NACL (stateless, explicit block in both directions) as a supplement, or detach and reattach the instance's ENI. "Just changing the security group immediately cuts all connections" is a wrong answer.

Containment must be designed not to conflict with digital forensics' *order of volatility* principle. RFC 3227 recommends collecting evidence *starting from the most volatile* (CPU registers and cache → RAM → network state → disk → backups). Terminating the instance immediately loses RAM and network state, so *isolating only the network while keeping the instance running* is the key that reconciles preservation of volatile evidence with containment.

## IMDS and Credential Revocation: Neutralize the Permissions the Instance Holds

The most dangerous aspect of an EC2 instance compromise is the temporary credentials issued through the *instance profile*. If an attacker steals STS temporary keys from the IMDS (Instance Metadata Service), they can exercise the role's permissions with those keys *even outside the instance*. So isolation alone is not enough: you must *revoke the issued credentials themselves*.

There is no separate revoke API for temporary credentials. Instead, you neutralize them by adding a *date-based deny (deny by date)* to the role's trust policy or permission policy.

```json
// Add an inline policy to the role: deny every token issued before a specific point in time
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "DateLessThan": { "aws:TokenIssueTime": "2026-06-24T10:00:00Z" }
    }
  }]
}
```

This is what the IAM console's "Revoke active sessions" button does: it immediately invalidates every temporary credential whose `aws:TokenIssueTime` is before the specified time. New credentials are no longer issued once the instance is isolated or replaced.

STS temporary credentials are bearer tokens that *exist independently after issuance*. Even if you isolate the instance, a key that has already left the IMDS remains valid anywhere on the internet until it expires. This property, "a stolen token lives separately from the instance," is the reason IMDSv2 (session-oriented, hop limit, PUT token) makes credential theft through SSRF harder, and the reason *session revocation* is absolutely needed separately from isolation in a compromise.

It is important that the session revocation policy is an *inline policy attached to the role*. It is a permission policy, not a trust policy, and it denies every call for which the condition is true.

```bash
# Revoke all existing sessions of the instance role (same as the console's "Revoke active sessions")
aws iam put-role-policy \
  --role-name app-instance-role \
  --policy-name AWSRevokeOlderSessions \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Deny", "Action": "*", "Resource": "*",
      "Condition": { "DateLessThan": { "aws:TokenIssueTime": "2026-06-24T10:00:00Z" } }
    }]
  }'

# If you need to block issuing new sessions at all, narrow the trust policy (the role stays)
aws iam update-assume-role-policy --role-name app-instance-role \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Deny", "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

# Or detach the profile from the instance to cut the supply of IMDS credentials itself
aws ec2 describe-iam-instance-profile-associations \
  --filters Name=instance-id,Values=i-0deadbeef
aws ec2 disassociate-iam-instance-profile --association-id iip-assoc-0abc123
```

The exam point is that the three actions each have a different effect.

| Action | Already-leaked tokens | Issuing new tokens | Side effects |
|---|---|---|---|
| `aws:TokenIssueTime` Deny | **Invalidated immediately** | Still issued (new tokens don't match the condition) | Existing sessions of other instances using the same role are cut too |
| Narrow or empty the trust policy | Still valid | **Blocked** | All workloads using the same role cannot receive credentials |
| Detach the instance profile | Still valid | **Blocked for that instance only** | Limited to the target instance: minimal collateral damage |

**Complete revocation is the combination of "invalidate existing + block new."** Doing only one is half the job. And the third row is the most useful in practice: when several instances share a role, detaching the profile cuts exactly the one compromised machine. If a choice carries the clue "while minimizing impact on other healthy workloads," this axis is the criterion.

GuardDuty has a family of findings that fire when instance role credentials are *used somewhere other than that instance* (the `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration` family). The reason this is powerful lies in the detection principle: GuardDuty compares the network identity of the instance to which the STS credentials were issued against the origin of the actual API calls. In other words, it takes **the very fact that the credentials left the instance** as the signal. The practical meaning is twofold. First, when this finding appears, it is a definitive signal that "isolating the instance alone is absolutely not enough," so session revocation must follow immediately. Second, enforcing IMDSv2 with `http-tokens required` and setting `http-put-response-hop-limit 1` makes theft via SSRF through containers and proxies much harder. This setting is an item of the *Preparation* phase, not response, and enforcing it across the organization with Config rules and SCPs is the standard.

```bash
# A setting to apply during compromise response, and also as a baseline in normal times
aws ec2 modify-instance-metadata-options --instance-id i-0deadbeef \
  --http-tokens required --http-put-response-hop-limit 1 --http-endpoint enabled
```

## Evidence Preservation: Snapshots and Memory

Preserve evidence *in parallel with* containment and credential revocation. Two kinds:

- **Disk evidence: EBS snapshots**: preserve all EBS volumes of the compromised instance with `CreateSnapshot` (or the multi-volume crash-consistent `CreateSnapshots`). Tag the snapshots with the case number. Snapshots are *immutable evidence*, so share or copy them to a separate forensic account so they are preserved even if the original account is compromised.
- **Memory evidence: volatile dump**: use SSM Run Command to run a memory capture tool (LiME, AVML, etc.) and upload the RAM dump to S3. This is possible only while the instance is running, which is why isolation must be a *network block*, not termination.

```bash
# Multi-volume crash-consistent snapshots + evidence tagging
aws ec2 create-snapshots \
  --instance-specification InstanceId=i-0deadbeef,ExcludeBootVolume=false \
  --description "Forensic image INC-2026-0042" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=IR-Case,Value=INC-2026-0042},{Key=Evidence,Value=true}]'

# Memory dump via SSM Run Command (if the SSM path is kept after isolating the instance)
aws ssm send-command \
  --instance-ids i-0deadbeef \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["avml /tmp/mem.lime","aws s3 cp /tmp/mem.lime s3://forensic-bucket/INC-2026-0042/"]'
```

Evidence snapshots and dumps have legal weight only if handled as *read-only and unchangeable*. Share the snapshots with a separate forensic account, apply Object Lock (WORM) on the S3 bucket, and record all access in CloudTrail. If the snapshots are left only in the original account and "anyone can delete them," their evidentiary value is broken.

### The Actual Procedure for Moving Evidence to the Forensic Account

The principle "preserve it in a separate account" is easy, but once encryption is involved one more step is added. **A snapshot encrypted with the AWS managed key (`aws/ebs`) cannot be shared with another account.** You must create a copy re-encrypted with a customer managed KMS key, and allow that key to be used by the forensic account through the key policy. If you don't know this constraint, you get stuck in the middle of a response.

```bash
# 1) (If needed) create a copy re-encrypted with a customer managed key
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 --source-snapshot-id snap-0original \
  --encrypted --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/forensic-cmk \
  --description "Forensic copy INC-2026-0042"

# 2) Grant the forensic account permission to use the snapshot
aws ec2 modify-snapshot-attribute \
  --snapshot-id snap-0forensiccopy \
  --attribute createVolumePermission --operation-type add \
  --user-ids 444455556666

# 3) Object Lock on the evidence bucket (versioning must come first)
aws s3api put-object-lock-configuration --bucket forensic-evidence-bucket \
  --object-lock-configuration '{
    "ObjectLockEnabled":"Enabled",
    "Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Years":7}}}'
```

```json
// Key policy of the forensic CMK: give the forensic account only the "permission to decrypt and view"
{
  "Sid": "AllowForensicAccountUse",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::444455556666:role/ForensicAnalystRole" },
  "Action": ["kms:Decrypt", "kms:DescribeKey", "kms:CreateGrant", "kms:ReEncryptFrom"],
  "Resource": "*",
  "Condition": {
    "StringEquals": { "kms:ViaService": "ec2.ap-northeast-2.amazonaws.com" }
  }
}
```

Object Lock's `COMPLIANCE` mode is the final line of defense for evidence retention in that **even the root user cannot delete within the retention period**. `GOVERNANCE` mode is convenient because a principal with special permission can lift it, but it leaves room for the rebuttal in court that "someone could have deleted it." When the exam mentions *legal evidentiary value* or *regulatory requirements*, the COMPLIANCE side is correct.

```
              [ Workload account 111122223333 ]
                        │
         Compromised instance i-0deadbeef (isolation SG, kept running)
                        │
        ┌───────────────┼────────────────────────┐
        ▼               ▼                        ▼
  EBS multi-volume   Memory dump              CloudTrail · VPC Flow Logs
  snapshots          (SSM Run Command)        (already forwarded to the central log account)
        │               │
        │ copy-snapshot │ s3 cp
        │ (forensic CMK) │
        ▼               ▼
   ═══════════ Account boundary ═══════════════════════════════
        ▼               ▼
              [ Forensic account 444455556666 ]
        │                         │
  Snapshot → new EBS volume     Evidence S3 bucket
        │  (read-only mount)      (Object Lock COMPLIANCE)
        ▼                         │
  Analysis EC2 (AMI with tools preinstalled)  │
   · Isolated VPC with no internet  │
   · External sharing forbidden by a separate SCP  ▼
   · All access recorded in CloudTrail ─┘

Even if the original account is completely compromised, the evidence remains beyond the account boundary ← this is the only reason for separation
```

The last line of this picture is the essence of forensic account separation. If the attacker holds administrative permissions in the workload account, the snapshots and logs inside that account are *things that can be erased at any time*. This is exactly why Code Spaces lost even its backups. **The integrity of evidence is created by the ownership boundary, not by encryption.**

There are two ways to attach a disk image to analysis, and their evidentiary strength differs. ① *Snapshot → new volume → read-only mount*: it is an AWS-managed replica, so the original is not altered, and several analysts can each work on their own copy. This is the standard path. ② *Detach the compromised instance's volume and attach it directly to an analysis instance*: detaching a root volume requires stopping the instance, so it **destroys volatile evidence**; in running-state response it is effectively forbidden. There is also a trap at mount time. On Linux, if you simply mount a journaling file system, the kernel replays the journal and **writes occur to the file system**, changing the hash. That is why practical forensics uses options such as `ro,noload` or a separate write blocker, and computes and records the image hash *before mounting*. In AWS, "snapshot ID + creation time + CloudTrail record" effectively plays this role, but in a regulated industry you put a procedure for recording the hash separately into the runbook.

## Forensic Analysis Environment: Examine It in an Isolated Place

Connect the preserved snapshot as a volume to an *analysis forensic EC2* and investigate. Principles of the analysis environment:

- **Separate isolated VPC/account**: so the analysis instance is not compromised again and the analysis activity does not affect production.
- **Snapshot → new volume → read-only mount**: prevents alteration of the original.
- **AMI with analysis tools preinstalled**: so no time is wasted installing tools after a compromise.

```
Compromised instance (i-0deadbeef, isolation SG)
   ├─ [parallel] EBS multi-volume snapshots ──► shared to the forensic account
   ├─ [parallel] Memory dump (SSM) ──► S3 (Object Lock)
   ├─ [parallel] Revoke instance role sessions (aws:TokenIssueTime deny)
   ▼
Forensic account / isolated VPC
   └─ Snapshot → new volume → read-only mount on the forensic AMI → analysis
```

## The Complete Runbook Order

The standard order for compromised EC2 response as one flow:

```
1. Identify and triage : Check the GuardDuty finding, judge scope and severity, create a case
2. Preserve evidence   : EBS multi-volume snapshots + memory dump (instance running)
3. Contain (isolate)   : Swap to the isolation SG (block established connections with NACL/ENI if needed)
4. Revoke credentials  : Revoke instance role sessions (TokenIssueTime deny), rotate keys if exposed
5. Eradicate and recover: Remove the compromise vector, redeploy from a patched golden AMI, terminate the instance
6. Post-incident       : Root cause analysis from snapshots and logs, improve runbooks and controls
```

The key: **evidence preservation (2) comes before containment (3), or at least before termination.** Isolation is not termination, so it is compatible with preservation. If you fix this order in an SSM runbook with automation, the responder does not get the order wrong even under pressure (linked to the Day 1 automated pipeline).

Mature organizations implement compromised EC2 response as a *fully automated runbook*, so that GuardDuty finding → EventBridge → SSM Automation performs snapshots, isolation, session revocation, tagging, and even launching a forensic instance within seconds. Humans review the results and judge eradication and recovery. However, for *instances with large production impact*, automatic isolation can cause a service outage, so graduated automation, which differentiates automatic vs approval gate by finding confidence and tags (e.g., `Environment=prod`), is recommended.

### An Execution Playbook with the Order Broken Down, and Its Rationale

The exam repeatedly asks "what do you do first?" Below, the six steps above are split into actual operation units, with **why each step sits where it does**. If you memorize the rationale, you no longer need to memorize the order.

```
① Detach from the ASG and target groups   → If you don't, the health check fails and the ASG terminates the instance.
                                    The only path by which evidence disappears before the responder touches anything.
② Termination protection and tagging      → IR-Case tag on i-xxx, termination protection (disable-api-termination).
                                    The reference point for all later automation and queries, and a guard against mistakes.
③ Memory dump                      → RAM is the most volatile. Before isolation disturbs the SSM path,
                                    and possible only while the instance is alive.
④ EBS multi-volume snapshots       → Disk is less volatile than memory, so it comes later. Still, placing it before containment
                                    is safer: after isolation the attacker may run a remote wipe.
⑤ Swap to the isolation SG (confirm outbound removed) → Only here is communication finally cut. Check that secondary ENIs were swapped too.
⑥ Supplement with NACL if needed   → SGs are stateful, so existing C2 sessions may remain. Add only after checking.
⑦ Detach the instance profile      → So that no new credentials come out of the IMDS.
⑧ Revoke role sessions (TokenIssueTime) → Invalidate tokens that have already left. ⑦ and ⑧ are a pair.
⑨ Determine scope (CloudTrail, Flow Logs) → Investigate everything that credential and that IP did. The actual size of the incident
                                    is decided here. Do not start recovery before this step.
⑩ Eradicate and recover            → Redeploy the patched golden AMI. Terminate the compromised instance only after confirming
                                    that evidence collection is finished, and through an approval gate.
⑪ Post-incident                    → Reconstruct the timeline, improve runbooks, add controls.
```

Remember just three boundary lines and any variant question can be solved. **㉠ Evidence comes before containment** (though since isolation is not termination, the two can mostly run in parallel). **㉡ Credential revocation must be done separately from network isolation.** **㉢ Irreversible actions such as termination and deletion come after scope is determined, and last.**

```bash
# ② Termination protection: structurally block someone's mistake or an automation malfunction during the response
aws ec2 modify-instance-attribute --instance-id i-0deadbeef --disable-api-termination
aws ec2 create-tags --resources i-0deadbeef \
  --tags Key=IR-Status,Value=QUARANTINE Key=IR-Case,Value=INC-2026-0042

# ⑨ Determine scope: what the instance role's sessions did, in chronological order
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=app-instance-role \
  --start-time 2026-06-20T00:00:00Z --max-results 50
```

The **Capital One breach** disclosed in 2019 is an incident in which every concept in this unit threads into one line. The attacker established **SSRF** through a misconfigured web firewall, and by that path reached the EC2 **instance metadata service (IMDS)** and obtained the instance role's temporary credentials. With those credentials they queried and exfiltrated S3 data in bulk. What made the company aware was not its own detection but **a tip from an outsider**, and there was a considerable time gap between the actual exfiltration and awareness. Four lessons to draw here. ① The substance of the breach was not taking over the server but **credential theft**: even if the instance had been isolated, the tokens that had already left would have remained valid (which is why session revocation is a separate step). ② Enforcing IMDSv2 and reducing the hop limit are controls aimed directly at this path. ③ The data access itself looked like *normal API calls made with normal permissions*; this is the practical basis of least privilege: excessive permissions make detection hard. ④ The fact that detection came from outside is exactly why Day 1's automated detection and response loop is needed. Because the description of detailed figures and internal response procedures varies by public sources, for exam preparation it is enough to remember accurately just the chain **SSRF → IMDS → role credentials → data exfiltration**.

> 🎯 **Scenario**: At 2 a.m., GuardDuty raises a `CryptoCurrency:EC2/BitcoinTool.B!DNS` family finding on one production web-tier instance. That instance belongs to an Auto Scaling group and is registered in an ALB target group, and the instance role has S3 read permission. What should the responder who logs into the console press first? → **Neither terminating the instance nor swapping the isolation SG.** The first action is to detach the instance from the ASG (`detach-instances --no-should-decrement-desired-capacity`) and deregister it from the target group. The reason is simple: if you attach the isolation SG first, the health check fails from that moment, and the ASG judges it an "unhealthy instance" and **terminates it on its own**. The action meant to protect the evidence becomes the trigger that destroys it. Only after detaching do you proceed in the order ② termination protection and tagging → ③ memory dump → ④ snapshots → ⑤ isolation SG → ⑦⑧ profile detachment and session revocation. And for a mining finding, you must confirm with CloudTrail **what the role did to S3**: mining is conspicuous noise, and data access done quietly with the same credentials is often the real damage.

Three self-inflicted mistakes easy to make during a response. ① **Stopping the instance**: stopping looks safer than terminating, but RAM disappears just the same, and if there are instance store volumes, that data disappears with it. ② **Deleting the key pair or changing the password to "block access"**: the attacker has already planted their own channels (backdoors, cron jobs, services), and this action blocks nothing while giving only *a signal that the response has begun*. If the attacker receives that signal, they erase evidence or hide deeper. ③ **Immediately launching a new instance from the snapshot after isolation to restore service**: reusing the image without knowing the root cause restores the backdoor along with it. Recovery must always start from a *patched golden image* and never from the compromised image.

## Trap Summary

- A newly created security group **comes with an allow-all outbound rule by default**; unless you remove it, it is not isolation.
- An instance with a secondary ENI needs the SG swapped on each ENI; `modify-instance-attribute` changes only the primary ENI.
- If you don't detach it from the ASG and target groups first, the health check fails, the ASG terminates the instance, and the evidence disappears.
- Security groups are stateful, so existing C2 sessions may persist briefly; supplement with NACL/ENI if needed.
- Using a subnet-level NACL block as the first means cuts healthy instances in the same subnet too.
- Blocking all outbound also cuts the SSM Agent path, making a memory dump impossible; leave an investigation path with VPC endpoints.
- Instance isolation and credential revocation are **separate actions**; a leaked STS token stays valid outside the instance until it expires.
- A `TokenIssueTime` Deny cuts only *existing sessions*; blocking new issuance requires profile detachment or narrowing the trust policy.
- A snapshot encrypted with an AWS managed key **cannot be shared with another account**; it must be copied with a customer managed CMK.
- If evidence is kept only in the original account, it disappears with it when the account is fully compromised.
- Object Lock can be set only when versioning is on, and COMPLIANCE mode is the stronger for legal evidentiary value.
- Analyzing by detaching the root volume requires stopping the instance, destroying volatile evidence; use the snapshot path.
- Recovering from the compromised image restores the backdoor too; recovery starts from a patched golden AMI.
- Actions like deleting the key pair or changing the password only signal the start of the response to the attacker and have no real effect.

## Summary

- [ ] Did you contain by isolation (network block), not termination, preserving volatile evidence?
- [ ] Before isolating, did you detach from the ASG and target groups to prevent evidence loss through automatic termination?
- [ ] Did you **remove the isolation SG's default outbound allow rule** and swap the secondary ENIs too?
- [ ] Did you leave an investigation path (SSM VPC endpoints) so memory dumps are possible even after isolation?
- [ ] Did you perform instance profile detachment (block new) and session revocation (invalidate existing) **as a pair**?
- [ ] Did you copy encrypted snapshots with a customer managed CMK before sharing them with the forensic account?
- [ ] Did you enable versioning first and apply Object Lock on the evidence bucket?
- [ ] Did you swap to a dedicated isolation security group, and supplement with NACL/ENI if blocking established connections is needed?
- [ ] Did you preserve EBS multi-volume snapshots and the memory dump in parallel with containment?
- [ ] Did you protect integrity (chain of custody) of evidence with a separate forensic account, Object Lock, and CloudTrail?
- [ ] Did you revoke the instance role's temporary credentials with an aws:TokenIssueTime deny?
- [ ] Do you perform forensic analysis with a read-only mount in a separate isolated VPC/account?
- [ ] After eradication, did you redeploy from a patched golden AMI and terminate the compromised instance?
- [ ] Did you fix this order in an SSM runbook to prevent mistakes under pressure?

---

## 📝 Practice Questions

**Question 1.** GuardDuty detected active C2 communication on an EC2 instance. Which first action is most appropriate to contain it immediately without losing volatile evidence?

A) Terminate the instance immediately  
B) Stop the instance  
C) Keep the instance running and replace its security group with an isolation-only security group to block the network  
D) Delete the instance's IAM user  

**Answer: C**  
Explanation: Terminating or stopping destroys volatile evidence such as RAM and network state, so it is not the first step. Keeping the instance running and replacing it with an isolation security group to cut only the communication achieves both containment and preservation of volatile evidence. EC2 receives permissions through an instance role, not an IAM user, so deleting a user is not a key action.

---

**Question 2.** A compromised EC2 instance was issued STS temporary credentials through its instance profile, and the attacker may have stolen them from IMDS. Why is isolating the instance alone not enough, and what additional action is needed?

A) Isolation also expires the temporary keys automatically, so no additional action is needed  
B) The stolen temporary keys are separate from the instance and remain valid externally until they expire, so add an aws:TokenIssueTime-based Deny to the role to revoke existing sessions  
C) Reboot the instance  
D) Add one more security group  

**Answer: B**  
Explanation: STS temporary credentials are bearer tokens that exist independently of the instance after issuance, so even after isolation, keys that have already leaked remain valid externally until they expire. Adding an aws:TokenIssueTime DateLessThan Deny to the role (Revoke active sessions in the console) immediately invalidates tokens issued before the specified time. Rebooting or adding a security group does not neutralize the leaked tokens.

---

**Question 3.** What is the best practice for guaranteeing the integrity (chain of custody) of an EBS snapshot used as forensic evidence?

A) Leave the snapshot in the original account, accessible to anyone on the operations team  
B) Share the snapshot to a separate forensic account, apply Object Lock (WORM) to the evidence S3 bucket, and log all access with CloudTrail  
C) Delete the snapshot immediately and keep only notes  
D) Share the snapshot publicly  

**Answer: B**  
Explanation: Evidence must be immutable and have traceable access to have legal validity. Sharing to a separate forensic account preserves it even if the original is compromised, Object Lock prevents modification and deletion, and logging access with CloudTrail is the chain of custody best practice. Access by anyone, deletion, or public sharing destroys evidentiary value.

---

**Question 4.** Even after the security group was replaced with an isolation security group, the attacker's in-progress C2 session was not cut for a while. What are the cause and the supplementary action?

A) Security groups are stateless, so it should have been cut immediately; this is a bug  
B) Security groups are stateful, so already established connections may persist; forcibly terminate the existing session with a NACL (stateless bidirectional block) or by detaching and reattaching the ENI  
C) The instance type is too small  
D) A NACL keeps connections open longer, so remove the NACL  

**Answer: B**  
Explanation: Security groups are stateful, so they automatically allow response traffic and may not cut existing established connections immediately. To forcibly terminate an in-progress session, add a NACL that explicitly blocks both directions statelessly, or detach and reattach the ENI. It is the NACL that is stateless, and the cause is unrelated to the instance type.

---

**Question 5.** Which is the most appropriate step order for a compromised EC2 response runbook?

A) Terminate -> snapshot -> isolate -> analyze  
B) Identify/triage -> preserve evidence (snapshot, memory dump) -> isolate (contain) -> revoke credential sessions -> eradicate/recover  
C) Isolate -> terminate -> delete the IAM user  
D) Analyze -> isolate -> identify  

**Answer: B**  
Explanation: The standard approach starts with identification and triage, preserves volatile and disk evidence while the instance is running, contains by network isolation, revokes the potentially leaked temporary credential sessions, and finally eradicates and recovers by redeploying a patched AMI and then terminating. Terminating first loses volatile evidence, and putting analysis before identification is not a valid order.

---
