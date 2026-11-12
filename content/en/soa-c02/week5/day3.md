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

**Question 1.** A company's security team established a policy that "Critical security patches must be applied to EC2 within 7 days of release." How is this policy implemented in a Patch Baseline?

A) In Approval Rules, set SEVERITY to Critical and ApproveAfterDays to 7
B) In Approval Rules, set CLASSIFICATION to Security, SEVERITY to Critical, and ApproveAfterDays to 7
C) Manually add all Critical patches to Approved Patches
D) The AWS default baseline handles this policy automatically

**Answer: B**

Explanation: CLASSIFICATION and SEVERITY must be specified together. CLASSIFICATION=Security targets only security-related patches, and SEVERITY=Critical selects only the Critical ones among them. ApproveAfterDays=7 automatically approves patches 7 days after release. The AWS default baseline (D) uses a different waiting period for each patch rather than 7 days, and it does not include Important.

---

**Question 2.** An EC2 instance has the tag `Patch Group=prod-web` and the baseline is also linked to this Patch Group, yet patches are not applied. The instance appears normally in the SSM Managed Instances list. What is the most likely cause?

A) Port 443 is blocked in the security group
B) The tag name is mistakenly set to "PatchGroup" (the exact name is "Patch Group", with a space)
C) A Maintenance Window has not been configured
D) Only the AWS default baseline can be used

**Answer: B**

Explanation: SSM Patch Manager recognizes the tag only if the tag key is exactly `Patch Group` (case-sensitive, including the space). `PatchGroup`, `patchgroup`, `patch-group`, and `Patch_Group` are all not recognized. Because the instance appears in the Managed Instances list, the network is not the problem (A). C can be worked around by running a Scan immediately. D is not true.

---

**Question 3.** An operations team wants to find out which patches are missing before applying patches, and to assess the impact without actually applying them. Which method should it use?

A) Run the AWS-RunPatchBaseline Document with Operation=Install and check the results
B) Run the AWS-RunPatchBaseline Document with Operation=Scan and query the Compliance data
C) Run Inspector to scan for vulnerabilities
D) Query the patch history in CloudTrail

**Answer: B**

Explanation: A Scan operation does not install any patches and determines the list of patches missing compared with the baseline. The results are stored as SSM Compliance data and can be queried with `describe-instance-patch-states` or `list-compliance-items`. The operational best practice is then to review the impact and decide whether to Install.

---

**Question 4.** A vulnerability similar to WannaCry has been announced. An emergency patch must be applied immediately to all of the organization's Windows servers. The company cannot wait for the Maintenance Window. What should it do?

A) Change the Maintenance Window schedule to the current time
B) Run AWS-RunPatchBaseline (Operation=Install) directly with Run Command, setting max-concurrency and max-errors to roll out gradually
C) Connect to each server over SSH and patch manually
D) Apply patches automatically through Inspector

**Answer: B**

Explanation: In an emergency, you do not wait for the Maintenance Window and can run immediately with Run Command. Applying gradually with `Operation=Install`, `max-concurrency 10%`, and `max-errors 5%` minimizes the service impact. If the Patch Group tag is present, the baseline is applied automatically. A Maintenance Window runs only at its scheduled time, so Run Command is more suitable in an emergency.

---

**Question 5.** In a Patch Compliance report, a specific instance shows `InstalledPendingRebootCount=3`. What does this mean?

A) 3 patches failed to install
B) 3 patches were installed but are fully applied only after a reboot is completed
C) 3 patches have not yet been approved in the baseline
D) 3 patches are in the Rejected list but were installed

**Answer: B**

Explanation: `InstalledPendingRebootCount` is the number of patches whose files have been installed but that take effect only after a reboot. Linux kernel patches and some Windows system updates fall into this category. It occurs when patching was done with RebootOption=NoReboot or when the reboot was delayed. You must either run an Install that includes a reboot in the next Maintenance Window or separately plan a reboot of the instance.

---

**Question 6.** A company wants the same security patch to be applied progressively and automatically in the order Dev → Stage → Prod. What is the way to implement this with no code or manual work?

A) Use a different Maintenance Window schedule for each environment
B) Create Patch Baselines with a different ApproveAfterDays for each environment and link them with Patch Groups (Dev=0 days, Stage=3 days, Prod=14 days)
C) Configure a different IAM Role for each environment
D) Use a Patch Policy to specify the order

**Answer: B**

Explanation: The difference in ApproveAfterDays is the key to automatic progressive rollout. When a patch is released, it is automatically approved immediately for Dev (0 days), after 3 days for Stage, and after 14 days for Prod. If the Maintenance Window runs periodically for each environment, only the patches approved by the baseline at that point are applied. If there are no problems in Dev and Stage during the 14 days, it is applied to Prod automatically, a fully automated flow.

---

**Question 7.** In an environment managing Amazon Linux 2, Ubuntu 22.04, and Windows Server 2022 together, how do you efficiently operate a Patch Baseline suited to each OS?

A) Manage all OSs with a single Baseline
B) Create a separate Baseline per OS and include OS information in each instance's `Patch Group` tag (for example, `prod-web-al2`, `prod-web-ubuntu`, `prod-web-win`)
C) Use a separate AWS account for each OS
D) Using only the AWS default baseline automatically distinguishes the OS

**Answer: B**

Explanation: Patch Baselines must be created per OS (one Baseline supports only one OS type). Create a Baseline suited to each OS type (AMAZON_LINUX_2, UBUNTU, WINDOWS) and link instances to the right Baseline with the Patch Group tag. The AWS default Baseline distinguishes the OS automatically but cannot reflect custom policies.

---
