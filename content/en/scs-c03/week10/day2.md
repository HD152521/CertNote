# Day 2 - Incident Response for Compromised EC2: Isolation, Snapshots, Forensics, Credential Revocation

When an EC2 instance shows signs of compromise (C2 communication detected by GuardDuty, cryptomining, backdoor detection), two conflicting instincts work simultaneously in responders' minds: *"I want to shut it down fast (containment)"* and *"I don't want to lose evidence (preservation)"*. The essence of compromised EC2 incident response is *reconciling both in the correct order and method*. Carelessly terminating destroys volatile evidence like memory and connection states, while leaving it running allows lateral movement and data exfiltration. The exam tests "in what order and by what mechanism do you isolate, preserve, and revoke?"

The standard procedure maps NIST IR's *Containment → Eradication → Recovery* phases (Day 4 details) onto EC2. Today we cover the concrete mechanisms of isolation, evidence preservation, and credential revocation.

## Containment (Isolation): Disconnect without terminating the instance

The goal of isolation is *to prevent the compromised instance from communicating further* while *keeping the instance running for evidence collection*. Terminating or stopping destroys volatile evidence like memory, so it's not the first containment measure.

Three isolation mechanisms:

1. **Replace with isolation-only security group** — Cleanest approach. Create an empty security group that blocks all inbound/outbound (or permits only forensic tool communication), then apply it to the instance. Takes effect immediately via `ModifyInstanceAttribute`.
2. **Block at subnet level with NACL** — If the instance isn't alone in its subnet, affects normal instances too. Security groups are better for per-instance isolation.
3. **Move ENI to isolation subnet** — To a subnet with no routing. Complex but powerful.

```bash
# 1) Create isolation security group (no rules = all traffic blocked)
ISO_SG=$(aws ec2 create-security-group \
  --group-name forensic-isolation \
  --description "IR isolation - no traffic" \
  --vpc-id vpc-0abc123 --query GroupId --output text)

# 2) Replace instance's security group with isolation SG (instance continues running)
aws ec2 modify-instance-attribute \
  --instance-id i-0deadbeef \
  --groups $ISO_SG

# 3) Tag for forensics status (automation, tracking)
aws ec2 create-tags --resources i-0deadbeef \
  --tags Key=IR-Status,Value=QUARANTINE Key=IR-Case,Value=INC-2026-0042
```

> ⚠️ **Pitfall — Security group stateful nature**: Security groups are stateful, so *already-established (established) connections* may persist even after security group replacement. To immediately terminate an active C2 session, use NACL (stateless, explicit bidirectional block) as a supplement or detach/reattach the instance's ENI. "Changing the security group alone terminates all connections immediately" is an incorrect answer.

> 💡 **Related theory**: Isolation must align with digital forensics' *order of volatility* principle. RFC 3227 mandates collecting evidence *from most to least volatile*(CPU registers/cache → RAM → network state → disk → backups). Terminating an instance immediately loses RAM and network state, so *maintaining running state while isolating network only* is key to reconciling volatility preservation with containment.

## IMDS and Credential Revocation: Neutralize instance permissions

The most dangerous aspect of EC2 compromise is *temporary credentials issued via instance profile*. If an attacker exfiltrates STS temporary keys from IMDS (Instance Metadata Service), they can exercise the role's permissions *outside the instance* until expiration. Isolation alone is insufficient — *the issued credentials themselves must be revoked*.

Temporary credentials lack a revoke API. Instead, *add time-based denial (deny by date)* to the role's trust or permission policy to neutralize them.

```json
// Add inline policy to role: deny all tokens issued before a specific time
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

This is what IAM console's "Revoke active sessions" button does — it immediately invalidates all temporary credentials with `aws:TokenIssueTime` before the specified time. New credentials won't be issued once the instance is isolated and replaced.

> 💡 **Related theory**: STS temporary credentials are *bearer tokens that exist independently* after issuance. Isolating the instance doesn't invalidate keys already leaked from IMDS — they remain valid until expiration anywhere on the internet. This property — "exfiltrated tokens live independently of the instance" — is why IMDSv2 (session-oriented, hop limit, PUT token) complicates credential theft via SSRF, and why credential session revocation (*revoke*) is mandatory alongside isolation.

## Evidence Preservation: Snapshots and Memory

Concurrently with containment and credential revocation, preserve evidence. Two types:

- **Disk evidence — EBS Snapshots**: Preserve all EBS volumes from the compromised instance via `CreateSnapshot` (or multi-volume consistent `CreateSnapshots`). Tag snapshots with case number. Snapshots are *immutable evidence*, so share to a separate forensics account and copy to ensure preservation even if the original account is compromised.
- **Memory evidence — Volatile dump**: Run memory capture tools (LiME, AVML, etc.) via SSM Run Command to capture RAM dump to S3. Only possible while the instance runs — that's why isolation must be *network blocking*, not termination.

```bash
# Multi-volume consistent snapshot + evidence tagging
aws ec2 create-snapshots \
  --instance-specification InstanceId=i-0deadbeef,ExcludeBootVolume=false \
  --description "Forensic image INC-2026-0042" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=IR-Case,Value=INC-2026-0042},{Key=Evidence,Value=true}]'

# Memory dump via SSM Run Command (maintaining SSM path after instance isolation)
aws ssm send-command \
  --instance-ids i-0deadbeef \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["avml /tmp/mem.lime","aws s3 cp /tmp/mem.lime s3://forensic-bucket/INC-2026-0042/"]'
```

> ⚠️ **Pitfall — Evidence integrity (chain of custody)**: Evidence snapshots and dumps must be handled as *read-only, immutable* for legal standing. Share snapshots to a separate forensics account, apply Object Lock (WORM) to evidence buckets, and record all access via CloudTrail. Keeping snapshots in the original account and allowing anyone to delete them breaks evidence integrity.

## Forensics Analysis Environment: Examine in isolation

Mount preserved snapshots as volumes on *forensics EC2* in a separate environment for investigation. Analysis environment principles:

- **Separate isolated VPC/account**: Prevent re-compromise of analysis instance and keep analysis activity from impacting production.
- **Snapshot → new volume → read-only mount**: Prevent modifying originals.
- **Analysis tools pre-loaded AMI**: Don't waste time installing tools after compromise.

```
Compromised instance (i-0deadbeef, isolation SG)
   ├─ [concurrent] EBS multi-volume snapshots ──► shared to forensics account
   ├─ [concurrent] Memory dump (SSM) ──► S3 (Object Lock)
   ├─ [concurrent] Instance role session revocation (aws:TokenIssueTime deny)
   ▼
Forensics account / isolated VPC
   └─ Snapshot → new volume → forensics AMI read-only mount → analyze
```

## Complete runbook sequence

Standard sequence for compromised EC2 response in one flow:

```
1. Identification & classification    : Verify GuardDuty finding, assess impact scope/severity, create case
2. Evidence preservation             : EBS multi-volume snapshots + memory dump (instance running)
3. Containment (isolation)           : Replace with isolation SG (NACL/ENI if needed for established connections)
4. Credential revocation             : Revoke instance role session (TokenIssueTime deny), rotate if key exposure
5. Eradication & recovery            : Remove attack vector, redeploy from patched golden AMI, terminate instance
6. Post-incident                     : Analyze snapshots/logs for root cause, improve runbooks/controls
```

Key: **Evidence preservation (2) comes before containment (3), or at least before termination.** Isolation is not termination, so preservation is compatible. Automate this sequence in an SSM runbook so responders maintain order even under pressure (connects to Day 1 automation pipeline).

> 🔍 **Deep dive**: Mature organizations implement compromised EC2 response as *fully automated runbooks* where GuardDuty finding → EventBridge → SSM Automation executes snapshots, isolation, session revocation, tagging, and forensics instance launch in seconds. Humans review results and decide on eradication/recovery. However, *high-impact production instances* risk service disruption from automatic isolation, so graduated automation based on finding confidence and tags (e.g., `Environment=prod`) is recommended — automatic for low-risk instances, approval gate for production.

## One-line summary checklist

- [ ] Preserve volatile evidence through isolation (network blocking, not termination) while containing
- [ ] Replace with isolation-only security group, add NACL/ENI if needed for established connection termination
- [ ] Preserve EBS multi-volume snapshots and memory dump concurrently with containment
- [ ] Maintain evidence integrity (separate forensics account, Object Lock, CloudTrail)
- [ ] Revoke instance role temporary credentials via aws:TokenIssueTime deny
- [ ] Perform forensics analysis in separate isolated VPC/account with read-only mount
- [ ] After eradication, redeploy from patched golden AMI and terminate compromised instance
- [ ] Lock this sequence in SSM runbook to prevent mistakes under pressure

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
