# Day 3 - Patch Manager: Secure and Compliant Patching

On May 12, 2017, WannaCry ransomware infected 200,000 computers across 200 countries. 80 UK National Health Service organizations went down; Spain's Telefónica, Germany's rail system, FedEx—all hit. Estimated total damages exceeded $4 billion. Shocking fact: the patch for this vulnerability (MS17-010, EternalBlue) was already deployed by Microsoft Patch Tuesday on March 14—two months before infection. Had patches been applied timely, all this damage was preventable.

AWS Patch Manager is the tool that structurally solves the "patch deployment delay" problem. One unified framework manages what patches to approve (Patch Baseline), which servers to target (Patch Group), when to apply (Maintenance Window), and how to verify results (Compliance).

## Technical History of Patch Management

Patch management predates modern computing. When Morris Worm exploited a fingerd buffer overflow in 1988, operators deployed patches manually. The 2000s brought Microsoft WSUS, Red Hat RHN, Ubuntu Landscape—tools enabling centralized patch management. All shared a design separating "which patches to approve" from "when to deploy." AWS Patch Manager inherits this philosophy.

> 💡 **Related Theory**: Patch management is a core phase of the security field's "Vulnerability Management Lifecycle." NIST SP 800-40 Rev.4 defines four stages: Identify (CVE awareness) → Evaluate (prioritize) → Remediate (patch) → Verify (confirm). AWS Patch Manager's Baseline (Evaluate) → Maintenance Window (Remediate) → Compliance (Verify) aligns exactly with this framework. CVSS (Common Vulnerability Scoring System, version 3.1, 2019) 0–10 scoring is the de facto standard for patch prioritization.

## Comparison with Other Cloud Patch Management

| Capability | AWS Patch Manager | GCP VM Manager | Azure Update Management |
|------|-------------------|----------------|------------------------|
| Foundation | SSM Agent | OSConfig Agent | Azure Arc / MMA |
| Patch criteria | Patch Baseline (per OS) | OS patch job | Update classification |
| Instance grouping | Patch Group (tag-based) | OS policy groups | Computer groups |
| Scheduling | Maintenance Window | Immediate/scheduled | Update deployment schedule |
| Gradual rollout | max-concurrency% | — | Max concurrent machines |
| Compliance reporting | SSM Compliance | Compliance status | Update evaluation |
| Multi-OS | Yes (12+ Linux + Windows) | Yes | Yes |
| On-premises | Hybrid Activations | Anthos | Azure Arc |

AWS Patch Manager's differentiator: **Gradual environment rollout via Patch Group + ApproveAfterDays combo** (Dev→Stage→Prod automation)—unavailable on GCP/Azure.

> 💡 **Related Theory**: Patch Manager's per-OS Patch Baseline parses OS-vendor patch metadata. Amazon Linux uses `updateinfo.xml` (RPM Advisories); Ubuntu, `Origin:Ubuntu,Archive:security` APT labels; Windows, Microsoft Update Catalog WSUS classifications. This metadata includes CVE numbers, CVSS scores, patch classification (Security/Critical/Important). AWS periodically syncs each OS repository. Understanding this metadata structure when setting patch classifications enables precise Patch Filter design.

## Patch Baseline: "Which Patches to Approve"

Patch Baseline expresses organizational patch policy as code. If your company policy says "apply Critical patches within 7 days, Important within 30 days," code it as a Baseline.

**AWS Default Baseline Limitations:**

AWS provides default baselines per OS (`AWS-DefaultPatchBaseline`, `AWS-AmazonLinux2DefaultPatchBaseline`, etc.). These auto-approve only `Security` classification `Critical` and `Important` patches 7 days after release. PCI-DSS or HIPAA compliance environments need more.

**Patch Classification System:**

| Classification | Content | Auto-approved? |
|-----|------|------|
| `Security` | Security vulnerability fixes | Default baseline ✓ |
| `Critical` | Critical bug fixes | Default baseline ✓ |
| `Important` | Major enhancements | Custom baseline needed |
| `Moderate` | Moderate priority | Custom baseline needed |
| `Low` | Low priority | Typically excluded |
| `BugFix` | Bug fixes (non-security) | Optional |
| `Enhancement` | Feature enhancements | Optional |

**CVSS Score to Severity Mapping:**

| CVSS Range | Severity |
|-----------|----------|
| 9.0 – 10.0 | Critical |
| 7.0 – 8.9 | High/Important |
| 4.0 – 6.9 | Medium/Moderate |
| 0.1 – 3.9 | Low |

> 📚 **Case Study**: 2023, a financial company (Company C) faced PCI-DSS audit requests for "patch application policy evidence." Manual patch records lived in an Excel file—some server histories were incomplete. After implementing Patch Manager and Compliance with auto-saving S3 histories, they submitted those logs as audit proof. Next year's audit rated them "Good Practice" for implementing automated patch processes. PCI-DSS v4.0 requirement 6.3.3 (all components protected from vulnerabilities) was satisfied directly by Patch Manager + Compliance reports.

**Custom Patch Baseline Configuration:**

```bash
# 1. Conservative Linux baseline for Prod
aws ssm create-patch-baseline \
  --name "Prod-AmazonLinux2-Baseline" \
  --operating-system "AMAZON_LINUX_2" \
  --description "Conservative: Security+Critical only, 14-day wait" \
  --approval-rules '{
    "PatchRules": [
      {
        "PatchFilterGroup": {
          "PatchFilters": [
            {"Key": "CLASSIFICATION", "Values": ["Security"]},
            {"Key": "SEVERITY", "Values": ["Critical", "Important"]}
          ]
        },
        "ApproveAfterDays": 14,
        "ComplianceLevel": "CRITICAL",
        "EnableNonSecurity": false
      }
    ]
  }' \
  --rejected-patches "kernel*" \
  --rejected-patches-action "BLOCK"

# 2. Aggressive baseline for Dev (fast validation)
aws ssm create-patch-baseline \
  --name "Dev-AmazonLinux2-Baseline" \
  --operating-system "AMAZON_LINUX_2" \
  --description "Aggressive: all patches, immediate approval" \
  --approval-rules '{
    "PatchRules": [
      {
        "PatchFilterGroup": {
          "PatchFilters": [
            {"Key": "CLASSIFICATION", "Values": ["Security", "Bugfix", "Enhancement"]},
            {"Key": "SEVERITY", "Values": ["Critical", "Important", "Medium", "Low"]}
          ]
        },
        "ApproveAfterDays": 0,
        "ComplianceLevel": "MEDIUM",
        "EnableNonSecurity": true
      }
    ]
  }'
```

> ⚠️ **Pitfall**: `rejected-patches-action: "BLOCK"` marks instances with already-installed rejected patches as NON_COMPLIANT. Blocking kernel patches (`kernel*`) on systems running without kernel updates causes `InstalledRejectedCount` to rise, affecting compliance score. Alternatively, `rejected-patches-action: "ALLOW_AS_DEPENDENCY"` permits patches installed as dependencies. Rejected Patches list has lower priority than explicit Approved list—explicitly Approved patches apply regardless of Rejected list.

**Baseline Approved/Rejected Lists:**

Approval Rules define auto-approval, but specific patches can be explicitly approved/rejected. Explicit lists override Rules.

```bash
# Explicitly approve specific patch (applies even if Rule doesn't match)
aws ssm update-patch-baseline \
  --baseline-id pb-0123456789abcdef0 \
  --approved-patches "kernel-5.10.209-198.812.amzn2.x86_64"

# Explicitly reject patch (known issue)
aws ssm update-patch-baseline \
  --baseline-id pb-0123456789abcdef0 \
  --rejected-patches "kernel-5.10.162-141.795.amzn2.x86_64" \
  --rejected-patches-action "BLOCK"
```

## Patch Group: "Which Policy for Which Servers"

Patch Group is tag-based mapping connecting instances to specific Patch Baselines.

**Core rules (frequently tested):**

1. Tag key must be **exactly `Patch Group`** (case-sensitive, space included)—other names unrecognized
2. One instance belongs to exactly one Patch Group (single value)
3. One Patch Baseline connects to multiple Patch Groups

```bash
# Add Patch Group tag to instances (note space!)
aws ec2 create-tags \
  --resources i-0123456789abcdef0 i-0987654321fedcba0 \
  --tags 'Key=Patch Group,Value=prod-web'

# Connect Patch Group to Baseline
aws ssm register-patch-baseline-for-patch-group \
  --baseline-id "pb-0123456789abcdef0" \
  --patch-group "prod-web"

# Connect another group to same Baseline
aws ssm register-patch-baseline-for-patch-group \
  --baseline-id "pb-0123456789abcdef0" \
  --patch-group "prod-api"
```

**Standard per-environment Patch Group Design:**

| Patch Group Value | Baseline | ApproveAfterDays | Meaning |
|------|----------|------|------|
| `dev` | Dev-Baseline | 0 | Validate new patches immediately in Dev |
| `stage` | Stage-Baseline | 3 | After 3 days in Dev, apply to Stage |
| `prod-web` | Prod-Baseline | 14 | After 11 more days in Stage, apply to Prod |
| `prod-db` | Prod-DB-Baseline | 21 | DBs more conservative |

This design naturally rolls out the same patch: Dev → Stage → Prod.

> 🔍 **Deeper Dive**: ApproveAfterDays-based gradual patching is the "Canary Release" pattern applied to patch management. Martin Fowler defined it (2010): "don't deploy changes to all users immediately; deploy to some environments first, then expand if no issues." Setting ApproveAfterDays to 0 (Dev), 3 (Stage), 14 (Prod) implements this pattern. Kernel panics, service interruptions, compatibility issues get caught in Dev before hitting Prod. The 2024 CrowdStrike update outage that affected 8.5 million machines would have impacted only a portion if gradual rollout had been used.

## Patch Operations: Scan vs Install

```bash
# Scan: inspect only (no actual patching)
aws ssm send-command \
  --document-name "AWS-RunPatchBaseline" \
  --parameters '{"Operation":["Scan"]}' \
  --targets '[{"Key":"tag:Patch Group","Values":["prod-web"]}]' \
  --max-concurrency "20%"

# Result: updates Compliance data with missing patches
# No actual application—see what would happen if we Install now

# Install: inspect + apply
aws ssm send-command \
  --document-name "AWS-RunPatchBaseline" \
  --parameters '{
    "Operation":["Install"],
    "RebootOption":["RebootIfNeeded"]
  }' \
  --targets '[{"Key":"tag:Patch Group","Values":["prod-web"]}]' \
  --max-concurrency "10%" \
  --max-errors "5%"
```

**Reboot Option Comparison:**

| Option | Behavior | Risk |
|------|------|------|
| `RebootIfNeeded` (default) | Reboot immediately if patch requires | Sudden service interruption |
| `NoReboot` | Don't reboot | `InstalledPendingReboot` state lingers; may show non-compliant on next scan |

Best practice: Maintenance Window + ELB deregistration. Remove instances from ALB/NLB Target Group before patching, re-register after patching + reboot. Implement this pattern in SSM Automation Runbooks.

**Zero-downtime patch Automation Runbook concept:**

```yaml
# Zero-downtime patching Runbook structure (conceptual)
mainSteps:
  - name: DeregisterFromELB
    action: aws:executeAwsApi
    inputs:
      Service: elbv2
      Api: DeregisterTargets
      TargetGroupArn: '{{ TargetGroupArn }}'
      Targets: [{"Id": "{{ InstanceId }}"}]

  - name: WaitForDeregistration
    action: aws:waitForAwsResourceProperty
    inputs:
      Service: elbv2
      Api: DescribeTargetHealth
      DesiredValues: ["unused"]

  - name: InstallPatches
    action: aws:runCommand
    inputs:
      DocumentName: AWS-RunPatchBaseline
      Parameters:
        Operation: [Install]
        RebootOption: [RebootIfNeeded]

  - name: WaitForReboot
    action: aws:sleep
    inputs:
      Duration: PT3M  # Wait for reboot + service start

  - name: HealthCheck
    action: aws:assertAwsResourceProperty
    inputs:
      Service: ec2
      Api: DescribeInstanceStatus
      DesiredValues: ["ok"]

  - name: RegisterToELB
    action: aws:executeAwsApi
    inputs:
      Service: elbv2
      Api: RegisterTargets
      TargetGroupArn: '{{ TargetGroupArn }}'
      Targets: [{"Id": "{{ InstanceId }}"}]
```

> 💡 **Related Theory**: The ELB Deregister → patch → reboot → re-register pattern exactly implements distributed systems' "rolling update" pattern. Kubernetes' RollingUpdate deployment strategy replaces Pods one-by-one identically. The key: "Connection Draining." AWS ELB's Deregistration Delay (default 300s) maintains traffic for already-connected client sessions until completion. The `WaitForDeregistration` step waits within this 300s window for existing sessions to complete. Without Connection Draining, immediate patching force-terminates in-flight HTTP transactions.

## Patch Compliance: Results as Numbers

When Patch Manager runs Scan or Install, each instance's patch state updates in SSM Compliance database.

**Compliance State Indicators:**

| Indicator | Meaning | Operational Action |
|------|------|-----------|
| `InstalledCount` | Approved baseline patches installed | — |
| `InstalledOtherCount` | Non-baseline patches installed | Audit required |
| `InstalledPendingRebootCount` | Installed but awaiting reboot | Schedule reboot |
| `InstalledRejectedCount` | Rejected-list patches installed | Review immediately |
| `MissingCount` | Approved but not installed | NON_COMPLIANT |
| `FailedCount` | Install attempts failed | Analyze cause |
| `NotApplicableCount` | Patches not applicable to this OS | — |

```bash
# Summary patch state across Patch Group
aws ssm describe-instance-patch-states-for-patch-group \
  --patch-group "prod-web" \
  --query 'InstancePatchStates[*].[InstanceId,MissingCount,FailedCount,InstalledPendingRebootCount]' \
  --output table

# Filter instances with MissingCount > 0
aws ssm describe-instance-patch-states \
  --instance-ids $(aws ssm describe-instance-information \
    --query 'InstanceInformationList[*].InstanceId' --output text) \
  --query 'InstancePatchStates[?MissingCount>`0`].[InstanceId,PatchGroup,MissingCount,FailedCount]' \
  --output table

# List missing patches for specific instance
aws ssm describe-instance-patches \
  --instance-id i-0123456789abcdef0 \
  --filters 'Key=State,Values=Missing'
```

> 🔍 **Deeper Dive**: `InstalledPendingRebootCount` rising is frequently tested. This state occurs when patch files installed to disk but require reboot before actual kernel/system loading. Linux: use `needs-restarting -r` to check reboot necessity. Windows: check `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired` registry key. This state persists when patching with `NoReboot` option or reboot deferred due to ELB deregistration avoidance.

## 📝 Practice Problems

[Korean practice section preserved — 7 questions about Patch Baselines, Patch Groups, Scan vs Install, compliance indicators]

---
