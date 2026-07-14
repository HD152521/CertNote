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

## 📝 연습 문제

**문제 1.** GuardDuty가 EC2 인스턴스의 활성 C2 통신을 탐지했다. 휘발성 증거를 잃지 않으면서 즉시 봉쇄하려면 첫 조치로 가장 적절한 것은?

A) 인스턴스를 즉시 terminate한다  
B) 인스턴스를 stop한다  
C) 인스턴스를 실행 상태로 유지한 채 격리 전용 보안 그룹으로 교체해 네트워크를 차단한다  
D) 인스턴스의 IAM 사용자를 삭제한다  

**정답: C**  
해설: 종료나 중지는 RAM·네트워크 상태 등 휘발성 증거를 파괴하므로 첫 수단이 아니다. 실행 상태를 유지한 채 격리 보안 그룹으로 교체해 통신만 끊으면 봉쇄와 휘발성 증거 보존을 양립할 수 있다. EC2는 IAM 사용자가 아니라 인스턴스 역할로 권한을 받으므로 사용자 삭제는 핵심 조치가 아니다.

---

**문제 2.** 침해 EC2가 인스턴스 프로파일을 통해 STS 임시 자격증명을 발급받았고, 공격자가 IMDS에서 이를 탈취했을 가능성이 있다. 인스턴스를 격리한 것만으로 부족한 이유와 추가 조치는?

A) 격리하면 임시 키도 자동 만료되므로 추가 조치 불필요  
B) 탈취된 임시 키는 인스턴스와 분리되어 만료 전까지 외부에서도 유효하므로, 역할에 aws:TokenIssueTime 기반 Deny를 추가해 기존 세션을 폐기한다  
C) 인스턴스를 재부팅한다  
D) 보안 그룹을 하나 더 추가한다  

**정답: B**  
해설: STS 임시 자격증명은 발급 후 인스턴스와 독립적으로 존재하는 bearer token이라, 격리해도 이미 유출된 키는 만료 시점까지 외부에서 유효하다. 역할에 aws:TokenIssueTime DateLessThan Deny를 추가하면(콘솔의 Revoke active sessions) 지정 시점 이전 발급 토큰을 즉시 무효화한다. 재부팅·보안 그룹 추가는 유출된 토큰을 무력화하지 못한다.

---

**문제 3.** 포렌식 증거로 사용할 EBS 스냅샷의 무결성(chain of custody)을 보장하기 위한 모범은?

A) 스냅샷을 원본 계정에 두고 운영팀 누구나 접근 가능하게 둔다  
B) 스냅샷을 별도 포렌식 계정으로 공유하고, 증거 S3에 Object Lock(WORM)을 걸며 모든 접근을 CloudTrail로 기록한다  
C) 스냅샷을 즉시 삭제하고 메모만 남긴다  
D) 스냅샷을 공개 공유한다  

**정답: B**  
해설: 증거는 변경 불가·접근 추적이 가능해야 법적 효력이 있다. 별도 포렌식 계정 공유로 원본 침해 시에도 보존하고, Object Lock으로 변경·삭제를 막으며, CloudTrail로 접근을 기록하는 것이 chain of custody의 모범이다. 누구나 접근·삭제·공개 공유는 증거 능력을 파괴한다.

---

**문제 4.** 격리 보안 그룹으로 교체했는데도 진행 중이던 공격자 C2 세션이 한동안 끊기지 않았다. 원인과 보조 조치는?

A) 보안 그룹은 stateless라 즉시 끊겨야 하는데 버그다  
B) 보안 그룹은 stateful이라 이미 established된 연결이 유지될 수 있으므로, NACL(stateless 양방향 차단)이나 ENI 분리/재연결로 기존 세션을 강제 종료한다  
C) 인스턴스 타입이 작아서다  
D) NACL은 connection을 더 오래 유지하므로 NACL을 제거한다  

**정답: B**  
해설: 보안 그룹은 stateful이라 응답 트래픽을 자동 허용하고 기존 established 연결을 즉시 끊지 않을 수 있다. 진행 중 세션을 강제 종료하려면 stateless로 양방향을 명시 차단하는 NACL을 보조하거나 ENI를 분리/재연결한다. stateless인 것은 NACL이고, 인스턴스 타입과 무관하다.

---

**문제 5.** 침해 EC2 대응 런북의 단계 순서로 가장 적절한 것은?

A) 종료 → 스냅샷 → 격리 → 분석  
B) 식별/분류 → 증거 보존(스냅샷·메모리 덤프) → 격리(봉쇄) → 자격증명 세션 폐기 → 근절/복구  
C) 격리 → 종료 → IAM 사용자 삭제  
D) 분석 → 격리 → 식별  

**정답: B**  
해설: 정석은 식별·분류로 시작해, 인스턴스가 실행 중일 때 휘발성·디스크 증거를 보존하고, 네트워크 격리로 봉쇄한 뒤, 유출 가능한 임시 자격증명 세션을 폐기하고, 마지막에 근절·복구로 패치된 AMI 재배포 후 종료한다. 종료를 먼저 하면 휘발성 증거가 소실되고, 분석을 식별보다 앞세우는 순서는 성립하지 않는다.

---
