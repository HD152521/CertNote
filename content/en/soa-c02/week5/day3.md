# Day 3 - Patch Manager: Applying Security Patches Safely and Compliantly

On May 12, 2017, the WannaCry ransomware infected 200,000 computers in 200 countries. 80 organizations of the UK's National Health Service (NHS) were paralyzed, and Spain's Telefónica, the German railway system, FedEx, and others were hit. Total damage is estimated at over 4 billion dollars. The shocking fact is that the patch for this vulnerability (MS17-010, EternalBlue) had already been released on Microsoft's Patch Tuesday of March 14, 2017, two months before the infection. It was damage that could have been prevented if the patch had been applied on time.

AWS Patch Manager is a tool that solves this "patch application delay" problem structurally. It manages everything in one consistent framework: which patches to approve (Patch Baseline), which servers to apply them to (Patch Group), when to apply (Maintenance Window), and how to verify the results (Compliance).

## The Technical History of Patch Management

The patch management problem is as old as IT history. When the Morris Worm exploited the fingerd buffer overflow vulnerability in 1988, operators had to distribute patches manually. In the 2000s, tools like Microsoft's WSUS (Windows Server Update Services), Red Hat's RHN (Red Hat Network), and Ubuntu's Landscape made central patch management possible. They all adopted a design that separates "which patches to approve" from "when to deploy." AWS Patch Manager inherits this philosophy.

Patch management is a core stage of the security field's "Vulnerability Management Lifecycle." NIST SP 800-40 Rev.4 "Guide to Enterprise Patch Management Planning" defines patch management in 4 stages: Identify (be aware of the CVE) → Evaluate (decide priority) → Remediate (apply the patch) → Verify (confirm the result). AWS Patch Manager's structure of Baseline (Evaluate) → Maintenance Window (Remediate) → Compliance (Verify) maps exactly onto this framework. The 0-10 scoring system of CVSS (Common Vulnerability Scoring System, version 3.1, 2019) is the de facto standard for deciding patch priority.

## Comparison With Other Clouds' Patch Management

| Feature | AWS Patch Manager | GCP VM Manager | Azure Update Management |
|------|-------------------|----------------|------------------------|
| Basis | SSM Agent | OSConfig Agent | Azure Arc / MMA |
| Patch criteria definition | Patch Baseline (per OS) | OS patch job | Update classification |
| Instance grouping | Patch Group (tag-based) | OS policy group | Computer group |
| Schedule | Maintenance Window | Immediate/scheduled | Update deployment schedule |
| Gradual rollout | max-concurrency% | — | Maximum concurrent machines |
| Compliance reporting | SSM Compliance | Compliance state | Update assessment |
| Multi-OS | Yes (12+ Linux types, Windows) | Yes | Yes |
| On-premises | Hybrid Activations | Anthos | Azure Arc |

What distinguishes AWS Patch Manager is the **gradual environment rollout implemented with the combination of Patch Group + ApproveAfterDays** (Dev→Stage→Prod automation). This pattern is not available in GCP/Azure.

Patch Manager's per-OS Patch Baselines parse each OS vendor's patch metadata. Amazon Linux uses `updateinfo.xml` (RPM Advisories), Ubuntu uses the `Origin:Ubuntu,Archive:security` APT label, and Windows uses the WSUS classifications of the Microsoft Update Catalog. This metadata includes the CVE number, CVSS score, and patch classification (Security/Critical/Important, etc.), and AWS syncs it periodically from each OS repository. If an operator understands this metadata structure when setting patch classifications, they can design Patch Filters accurately.

## Patch Baseline: "Which Patches to Approve"

A Patch Baseline expresses an organization's patch policy as code. If a company policy says "apply Critical patches within 7 days and Important within 30 days," you implement it as a Baseline.

**Limits of the AWS default baselines:**

AWS provides a default baseline for each OS (`AWS-DefaultPatchBaseline`, `AWS-AmazonLinux2DefaultPatchBaseline`, etc.). These default baselines automatically approve only `Critical` and `Important` patches of the `Security` classification 7 days after release. For environments requiring PCI-DSS or HIPAA compliance, this alone is not enough.

**Patch classification scheme:**

| Classification | Content | Auto-approval target |
|---------------------|------|---------------|
| `Security` | Security vulnerability fixes | Included in the default baseline |
| `Critical` | Critical bug fixes | Included in the default baseline |
| `Important` | Major feature improvements | Custom baseline required |
| `Moderate` | Medium priority | Custom baseline required |
| `Low` | Low priority | Generally excluded |
| `BugFix` | Bug fixes (non-security) | Optional |
| `Enhancement` | Feature improvements | Optional |

**Relationship between CVSS Score and Severity:**

| CVSS range | Severity |
|-----------|----------|
| 9.0 - 10.0 | Critical |
| 7.0 - 8.9 | High/Important |
| 4.0 - 6.9 | Medium/Moderate |
| 0.1 - 3.9 | Low |

As a hypothetical case, in 2023 a financial company C was asked for "evidence of its patching policy" in a PCI-DSS audit. The patch records the responsible team had been managing manually were an Excel file, and the patch history of some servers was missing. Afterward they introduced Patch Manager and Compliance and submitted the patch history automatically stored in S3 as audit evidence. In the next year's audit, they received a Good Practice rating on the item "establishing an automated patch management process." They directly satisfied PCI-DSS v4.0 requirement 6.3.3 (all system components are protected from security vulnerabilities) with Patch Manager + Compliance reports.

**Configuring a custom Patch Baseline:**

```bash
# 1. Conservative Linux baseline for the Prod environment
aws ssm create-patch-baseline \
  --name "Prod-AmazonLinux2-Baseline" \
  --operating-system "AMAZON_LINUX_2" \
  --description "Conservative baseline: Security+Critical only, 14-day wait" \
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
  --rejected-patches-action "BLOCK" \
  --tags '[{"Key":"Environment","Value":"prod"}]'

# 2. Aggressive baseline for the Dev environment (validate through fast application)
aws ssm create-patch-baseline \
  --name "Dev-AmazonLinux2-Baseline" \
  --operating-system "AMAZON_LINUX_2" \
  --description "Aggressive baseline: all patches, immediate approval" \
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

> ⚠️ **Pitfall**: `rejected-patches-action: "BLOCK"` also marks instances that already have that patch installed as NON_COMPLIANT. Some companies BLOCK kernel patches (`kernel*`) to run without kernel updates, and in this case `InstalledRejectedCount` rises, affecting the compliance score. On the other hand, `rejected-patches-action: "ALLOW_AS_DEPENDENCY"` allows the case where a patch is installed because of a dependency. The Rejected Patches list has lower priority than an explicit Approved Patches list, so a patch in the explicit Approved list is applied regardless of the Rejected list.

**The baseline's Approved/Rejected lists:**

Automatic approval is defined by Approval Rules, but you can also explicitly approve or reject specific patches. This explicit list takes precedence over the Rules.

```bash
# Explicitly approve a specific patch (applied even if it doesn't match the Rule)
aws ssm update-patch-baseline \
  --baseline-id pb-0123456789abcdef0 \
  --approved-patches "kernel-5.10.209-198.812.amzn2.x86_64"

# Explicitly reject a specific patch (a patch with known problems)
aws ssm update-patch-baseline \
  --baseline-id pb-0123456789abcdef0 \
  --rejected-patches "kernel-5.10.162-141.795.amzn2.x86_64" \
  --rejected-patches-action "BLOCK"
```

## Patch Group: "Which Policy for Which Server"

A Patch Group is a tag-based mapping that links instances to a specific Patch Baseline.

**Key rules (tested):**

1. The tag key must be **exactly `Patch Group`** (case-sensitive, including the space) — other names are not recognized
2. An instance can belong to exactly one Patch Group (only a single value)
3. Multiple Patch Groups can be linked to one Patch Baseline

```bash
# Add the Patch Group tag to instances (watch the space!)
aws ec2 create-tags \
  --resources i-0123456789abcdef0 i-0987654321fedcba0 \
  --tags 'Key=Patch Group,Value=prod-web'

# Link the Patch Group to the Baseline
aws ssm register-patch-baseline-for-patch-group \
  --baseline-id "pb-0123456789abcdef0" \
  --patch-group "prod-web"

# Other groups can also be linked to the same Baseline
aws ssm register-patch-baseline-for-patch-group \
  --baseline-id "pb-0123456789abcdef0" \
  --patch-group "prod-api"
```

**Standard per-environment Patch Group design:**

| Patch Group value | Baseline | ApproveAfterDays | Meaning |
|----------------|----------|------------------|------|
| `dev` | Dev-Baseline | 0 | New patches are validated in Dev immediately |
| `stage` | Stage-Baseline | 3 | Applied to Stage after 3 days of validation in Dev |
| `prod-web` | Prod-Baseline | 14 | Applied to Prod after 11 more days of validation in Stage |
| `prod-db` | Prod-DB-Baseline | 21 | More conservative for DBs |

With this design, the same patch is naturally rolled out in the order Dev → Stage → Prod.

Gradual patching based on ApproveAfterDays applies the "Canary Release" pattern of software deployment to patch management. Canary Release, defined by Martin Fowler in 2010, is the approach of "not deploying a change to all users at once, but deploying first to some environments/users and expanding if there are no problems." Giving ApproveAfterDays different values of 0 days (Dev), 3 days (Stage), and 14 days (Prod) in the patch baselines is the implementation of this pattern. It is designed so that kernel panics, service outages, and compatibility problems caused by patches are found first in Dev and don't affect Prod. In fact, in a case like the July 2024 CrowdStrike update incident, where a faulty software update caused large-scale outages, had there been gradual rollout, only a portion rather than all 8.5 million machines would have been affected.

## Patch Operations: The Difference Between Scan and Install

```bash
# Scan: check only (no actual patching)
aws ssm send-command \
  --document-name "AWS-RunPatchBaseline" \
  --parameters '{"Operation":["Scan"]}' \
  --targets '[{"Key":"tag:Patch Group","Values":["prod-web"]}]' \
  --max-concurrency "20%"

# Result: Compliance data is updated with which patches are missing
# Understand "what would happen if I Install right now" without actually patching

# Install: check + apply
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

**Reboot option comparison:**

| Option | Behavior | Risk |
|------|------|------|
| `RebootIfNeeded` (default) | Reboots immediately if a patch requires a reboot | Service interruption from a sudden reboot |
| `NoReboot` | Does not reboot | An `InstalledPendingReboot` state remains and may be reported as not applied at the next check |

The operational best practice is the combination of a Maintenance Window + ELB deregistration. Before patching, remove the instance from the ALB/NLB Target Group, and register it again after patching + rebooting. You can implement this pattern as an SSM Automation Runbook.

**Concept of a zero-downtime patching Automation Runbook:**

```yaml
# Zero-downtime patching Runbook structure (concept)
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
      Duration: PT3M  # wait for the reboot + service start

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

The ELB Deregister → patch → reboot → re-register pattern is an exact implementation of the distributed-systems "rolling update" pattern. It is the same as Kubernetes's RollingUpdate deployment strategy replacing Pods one at a time. The key is "Connection Draining": in AWS ELB, the Deregistration Delay (default 300 seconds) keeps traffic flowing until already-connected client sessions finish. The `WaitForDeregistration` step before patching waits for existing sessions to finish within this 300 seconds. If you patch immediately without Connection Draining, in-progress HTTP transactions are forcibly terminated.

## Patch Compliance: Results as Numbers

When Patch Manager runs a Scan or Install, each instance's patch state is updated in the SSM Compliance database.

**Compliance status metrics:**

| Metric | Meaning | Operational action |
|------|------|-----------|
| `InstalledCount` | Number of baseline-approved patches installed | — |
| `InstalledOtherCount` | Number of patches installed outside the baseline | Audit needed |
| `InstalledPendingRebootCount` | Installed but awaiting reboot | Reboot scheduling needed |
| `InstalledRejectedCount` | A patch on the Rejected list was installed | Consider removing immediately |
| `MissingCount` | Baseline-approved but not installed | NON_COMPLIANT |
| `FailedCount` | Installation attempt failed | Root cause analysis |
| `NotApplicableCount` | Patches not applicable to this OS | — |

```bash
# Summary of patch state across instances
aws ssm describe-instance-patch-states-for-patch-group \
  --patch-group "prod-web" \
  --query 'InstancePatchStates[*].[InstanceId,MissingCount,FailedCount,InstalledPendingRebootCount]' \
  --output table

# Filter only instances with MissingCount > 0
aws ssm describe-instance-patch-states \
  --instance-ids $(aws ssm describe-instance-information \
    --query 'InstanceInformationList[*].InstanceId' --output text) \
  --query 'InstancePatchStates[?MissingCount>`0`].[InstanceId,PatchGroup,MissingCount,FailedCount]' \
  --output table

# List of missing patches for a specific instance
aws ssm describe-instance-patches \
  --instance-id i-0123456789abcdef0 \
  --filters 'Key=State,Values=Missing'
```

Cases where `InstalledPendingRebootCount` rises are tested on the exam. This state occurs when patch files have been installed on disk but there are patches that must be loaded into the kernel/system after a reboot. On Linux, you can check whether a reboot is needed with the `needs-restarting -r` command. On Windows, you check with the registry key `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired`. This state persists if you patch with `NoReboot` instead of the `RebootIfNeeded` option, or if you avoided rebooting because there was no ELB deregistration.

## Patch Policy (Quick Setup): Multi-Account Patch Governance

Patch Policy, released in 2023, integrates with Organizations to deploy a patch policy to multiple accounts and multiple Regions at once.

```bash
# Quick Setup Patch Policy (console or CLI)
# Run from the Organizations management account
aws ssm create-resource-data-sync \
  --sync-name "OrgPatchCompliance" \
  --s3-destination '{
    "BucketName": "org-patch-compliance",
    "Region": "ap-northeast-2",
    "SyncFormat": "JsonSerDe"
  }'

# Aggregate each account's compliance into a central S3, then analyze with Athena
# SELECT account_id, instance_id, missing_count, patch_group
# FROM "org_patch_compliance"."aws_patchcompliancesummary"
# WHERE missing_count > 0
# ORDER BY missing_count DESC
```

As a hypothetical case, in 2024 a global manufacturer D introduced Patch Policy in a multi-account environment based on AWS Organizations (23 accounts, 3 Regions). Once they set up the Patch Policy in Quick Setup, StackSets automatically deployed the Patch Baselines, Patch Group settings, and Maintenance Windows to all accounts and Regions. They could now check the company-wide patch compliance rate in real time on a central S3 + Athena dashboard. Previously each account team managed patches on its own and it took 2 weeks to determine the company-wide compliance rate; after the introduction, real-time checking became possible. The auditor directly checked this dashboard as evidence satisfying the SI-2 (Flaw Remediation) requirement of NIST 800-171.

## Troubleshooting: When Patches Aren't Applied

**A systematic order of checks:**

```bash
# 1. Check the Managed Instance
aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=i-0123456789abcdef0" \
  --query 'InstanceInformationList[0].[PingStatus,PlatformName,PlatformVersion]'

# 2. Check the Patch Group tag (the exact name including the space!)
aws ec2 describe-tags \
  --filters "Name=resource-id,Values=i-0123456789abcdef0" "Name=key,Values=Patch Group"

# 3. Which Baseline is the Patch Group linked to
aws ssm get-patch-baseline-for-patch-group \
  --patch-group "prod-web"

# 4. Check the Baseline's approval rules
aws ssm get-patch-baseline \
  --baseline-id pb-0123456789abcdef0

# 5. Detailed patch compliance lookup (which patches are missing)
aws ssm list-compliance-items \
  --resource-ids i-0123456789abcdef0 \
  --resource-types ManagedInstance \
  --filters 'Key=ComplianceType,Values=Patch' \
           'Key=STATUS,Values=NON_COMPLIANT'

# 6. Check the SSM Agent logs (inside the instance)
# sudo tail -100 /var/log/amazon/ssm/amazon-ssm-agent.log
# sudo tail -100 /var/log/amazon/ssm/errors.log
```

> ⚠️ **Pitfall**: If patches aren't applied even though the Patch Group tag is set correctly, sometimes the link between the Patch Group and the Baseline (`register-patch-baseline-for-patch-group`) is missing. Tagging and linking the Baseline are separate operations. Always check the link state with the `get-patch-baseline-for-patch-group` command. Another pitfall: instances with no Patch Group specified automatically use the per-OS **AWS default baseline**. The default baseline gets applied unintentionally, causing the confusion "why were only some, not all, patches applied?"

## Integration With Inspector: CVE-Based Priority Patching

AWS Inspector (v2) scans EC2 instances for vulnerabilities by CVE and prioritizes them with the CVSS Score. Linking Inspector findings with Patch Manager lets you build a workflow that patches the most dangerous CVEs first.

```bash
# Query Inspector findings (CRITICAL CVEs that are patchable)
aws inspector2 list-findings \
  --filter-criteria '{
    "severity":[{"comparison":"EQUALS","value":"CRITICAL"}],
    "findingType":[{"comparison":"EQUALS","value":"PACKAGE_VULNERABILITY"}],
    "fixAvailable":[{"comparison":"EQUALS","value":"YES"}]
  }' \
  --query 'findings[*].[findingArn,packageVulnerabilityDetails.cvss[0].score,packageVulnerabilityDetails.vulnerabilityId,resources[0].id]'
```

The pattern of explicitly adding the package version information of CVEs found by Inspector to the Patch Baseline's Approved Patches, or receiving Inspector alarms via EventBridge to automatically trigger Patch Manager, is the future direction of security operations.

The Inspector + Patch Manager integration is AWS's implementation of "Risk-Based Patching." If traditional patch management is policy-based, "applying all patches by classification criteria," Risk-Based Patching decides priority dynamically by considering the CVSS Score plus actual environmental exposure (whether it is internet-facing, data sensitivity). Linking CISA's (the US cybersecurity agency) KEV (Known Exploited Vulnerabilities) list with Inspector lets you build a pipeline that patches "vulnerabilities used in real attacks" first. Commercial vulnerability scanners such as Tenable.io, Qualys, and Rapid7 implement the same principle.

## Overall Flow Summary

```
Patch Manager standard operating flow
============================================================

[Stage 1] Establish policy
  Create Patch Baselines
    ├── Dev: all patches, 0-day wait (fast validation)
    ├── Stage: Sec/Critical/Important, 3-day wait
    └── Prod: Sec/Critical, 14-day wait (safety first)

[Stage 2] Classify instances
  EC2 tag: Key="Patch Group", Value="prod-web"
  → link with register-patch-baseline-for-patch-group

[Stage 3] Pre-check (optional)
  AWS-RunPatchBaseline, Operation=Scan
  → find out which patches are missing (no application)

[Stage 4] Apply patches
  Maintenance Window
  ├── Task 1: EBS Snapshot (Priority 1)
  ├── Task 2: ELB Deregister (Priority 2)
  ├── Task 3: AWS-RunPatchBaseline Install (Priority 3)
  ├── Task 4: Health Check (Priority 4)
  └── Task 5: ELB Register (Priority 5)
  Concurrency: 10%, Error Tolerance: 5%

[Stage 5] Verify results
  Compliance dashboard
  ├── MissingCount > 0 → NON_COMPLIANT
  └── Priority patching of CVEs via Inspector integration
```

## 📝 Practice Questions

**Question 1.** A company's security team established the policy "Critical security patches must be applied to EC2 within 7 days of release." How do you implement this policy in a Patch Baseline?

A) Set SEVERITY to Critical and ApproveAfterDays to 7 in the Approval Rules
B) Set CLASSIFICATION to Security, SEVERITY to Critical, and ApproveAfterDays to 7 in the Approval Rules
C) Manually add every Critical patch to Approved Patches
D) The AWS default baseline handles this policy automatically

**Answer: B**
Explanation: You must specify CLASSIFICATION and SEVERITY together. CLASSIFICATION=Security targets only security-related patches, and SEVERITY=Critical selects only the Critical ones among them. ApproveAfterDays=7 automatically approves patches 7 days after release. The AWS default baseline (D) uses a different waiting period per patch rather than 7 days, and does not include Important.

---

**Question 2.** An EC2 instance has the tag `Patch Group=prod-web` and the baseline is also linked to this Patch Group, but patches aren't applied. It appears normally in the SSM Managed Instances list. What is the most likely cause?

A) Port 443 is blocked in the security group
B) The tag name is wrongly set as "PatchGroup" (the exact name is "Patch Group", including the space)
C) A Maintenance Window hasn't been configured
D) Only the AWS default baseline can be used

**Answer: B**
Explanation: SSM Patch Manager recognizes the tag only if the key is exactly `Patch Group` (case-sensitive, including the space). `PatchGroup`, `patchgroup`, `patch-group`, and `Patch_Group` are all unrecognized. Since the instance appears in the Managed Instance list, the network is not the problem (A). C can be worked around by running a Scan immediately. D is not true.

---

**Question 3.** The operations team wants to find out which patches are missing before applying patches, and assess impact without actually applying them. What method should they use?

A) Run the AWS-RunPatchBaseline Document with Operation=Install and check the results
B) Run the AWS-RunPatchBaseline Document with Operation=Scan and query the Compliance data
C) Run Inspector to scan for vulnerabilities
D) Query the patch history in CloudTrail

**Answer: B**
Explanation: A Scan operation identifies the list of patches missing against the baseline without installing any patches. The results are stored as SSM Compliance data and queried with `describe-instance-patch-states` or `list-compliance-items`. Reviewing the impact afterward and deciding whether to Install is the operational best practice.

---

**Question 4.** A vulnerability similar to WannaCry has been announced. An emergency patch must be applied immediately to all of the organization's Windows servers. You can't wait for the Maintenance Window. What do you do?

A) Change the Maintenance Window schedule to the current time
B) Run AWS-RunPatchBaseline (Operation=Install) directly with Run Command, and set max-concurrency and max-errors to deploy gradually
C) SSH into each server and patch manually
D) Apply patches automatically through Inspector

**Answer: B**
Explanation: In an emergency you can run immediately with Run Command without waiting for the Maintenance Window. Applying gradually with `Operation=Install`, `max-concurrency 10%`, and `max-errors 5%` minimizes service impact. If a Patch Group tag exists, the baseline is applied automatically. A Maintenance Window runs only at its scheduled time, so Run Command is more suitable in an emergency.

---

**Question 5.** In a Patch Compliance report, a specific instance shows `InstalledPendingRebootCount=3`. What does this mean?

A) 3 patches failed to install
B) 3 patches were installed but are fully applied only after a reboot completes
C) 3 patches have not yet been approved in the baseline
D) 3 patches are on the Rejected list but were installed

**Answer: B**
Explanation: `InstalledPendingRebootCount` is the number of patches whose files were installed but that actually take effect only after a reboot. Linux kernel patches and some Windows system updates fall under this. It occurs when you patched with RebootOption=NoReboot or when the reboot was delayed. You must run an Install that includes a reboot in the next Maintenance Window, or plan an instance reboot separately.

---

**Question 6.** A company wants the same security patch to be applied gradually and automatically in the order Dev → Stage → Prod. What is the way to implement this without code or manual work?

A) Use different Maintenance Window schedules for each environment
B) Create Patch Baselines with different ApproveAfterDays per environment and link them with Patch Groups (Dev=0 days, Stage=3 days, Prod=14 days)
C) Set a different IAM Role for each environment
D) Use Patch Policy to specify the order

**Answer: B**
Explanation: The difference in ApproveAfterDays is the key to automatic gradual deployment. When a patch is released, Dev approves it immediately (0 days), Stage after 3 days, and Prod after 14 days automatically. When the Maintenance Window runs periodically in each environment, only the patches the baseline has approved at that point are applied. If there are no problems in Dev and Stage during the 14 days, it is applied to Prod automatically — a fully automated flow.

---

**Question 7.** In an environment managing Amazon Linux 2, Ubuntu 22.04, and Windows Server 2022 all together, what is the way to efficiently operate a Patch Baseline appropriate for each OS, given per-OS Patch Baselines?

A) Manage all OSes with one Baseline
B) Create a separate Baseline per OS, and include the OS information in each instance's `Patch Group` tag (for example, `prod-web-al2`, `prod-web-ubuntu`, `prod-web-win`)
C) Use a separate AWS account for each OS
D) Just using the AWS default baselines automatically distinguishes the OS

**Answer: B**
Explanation: Patch Baselines must be created per OS (one Baseline supports only one OS type). Create a Baseline suited to each OS type (AMAZON_LINUX_2, UBUNTU, WINDOWS), and link instances to the correct Baseline with the Patch Group tag. The AWS default Baselines distinguish the OS automatically but cannot reflect custom policies.

---
