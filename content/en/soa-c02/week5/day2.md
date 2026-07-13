# Day 2 - Run Command, State Manager, Maintenance Window: The SSM Automation Trio

"We need to add a new environment variable to all prod servers. Right now." A message from the development team lead. 150 EC2 instances, all tagged with `Environment=prod`. SSH into each one individually? Impossible schedule. This is when an operator reaches for Run Command. Define the command, specify targets by tag, set concurrency and error limits, press execute—and it's deployed to all 150 simultaneously. Results automatically save to S3 and CloudWatch Logs; failed instances auto-generate as OpsItems in OpsCenter.

Today's Run Command, State Manager, and Maintenance Window are the "SSM automation trio." Each tool owns one responsibility: "execute once now" (Run Command), "stay in this state always" (State Manager), "run this task at this time" (Maintenance Window). Distinguishing their roles is a core SOA-C02 point.

## Run Command's Internal Operating Principles

Run Command looks simple but operates as a sophisticated distributed system. When an operator calls `send-command`, here's what happens.

1. **SSM API receives**: The command registers in SSM service, a Command ID is issued
2. **Target selection**: Target list computed by Tags/Resource Groups/Instance IDs
3. **Concurrency control**: First batch selected per concurrency limit (e.g., 10% of 150 = 15 instances)
4. **Agent polling**: Selected instances' Agents fetch command on next heartbeat (pull model)
5. **Execution and result return**: Agent executes command, returns stdout/stderr to SSM via `ec2messages` channel
6. **Output storage**: Results saved to S3 bucket and CloudWatch Logs per configuration
7. **Error evaluation**: If error rate exceeds Error Threshold, remaining batch execution stops
8. **Next batch**: If errors stay below threshold, next 15 execute

> 💡 **Related Theory**: Run Command's concurrency control combines the "circuit breaker pattern" and "bulkhead pattern" from distributed systems. In Michael Nygard's *Release It!* (2007), circuit breaker prevents failure propagation by stopping remaining execution when Error Threshold is exceeded. Bulkhead (watertight compartment) limits concurrent execution so failure doesn't spread. Setting `--max-concurrency 10%` applies both patterns simultaneously. Google SRE Book (Beyer et al., 2016) Chapter 13, "Emergency Response," calls the same principle "rate limiting."

## Rate Control Mathematics: When Percentage, When Absolute Value?

Run Command's `--max-concurrency` and `--max-errors` can be percent (%) or absolute values. When use which?

| Situation | max-concurrency | max-errors | Reason |
|------|----------------|------------|------|
| Dynamic ASG scale | 10% | 5% | Ratio maintained across instance count changes |
| Fixed instance count (100) | 10 or 10% | 5 or 5% | Same effect |
| Very small group (5) | 2 (absolute recommended) | 1 | 5% rounds 0.25 → imprecise |
| Emergency patch (speed priority) | 50% | 20% | Fast rollout, high error tolerance |
| Critical DB servers (stability priority) | 1 | 0 | One at a time, stop at any failure |

**Percent calculation examples:**
- 150 instances, max-concurrency=10%: ceil(150 × 0.10) = 15 parallel
- 150 instances, max-errors=5%: ceil(150 × 0.05) = 7 failures triggers stop
- If 7 failures occur in first batch (15), remaining 135 don't execute

> 🔍 **Deeper Dive**: Setting `--max-errors "0"` tolerates no failures—stops immediately at first error. This "zero-tolerance rollout" suits testing new patches on 1–2 instances before broad rollout. Conversely, `--max-errors "100%"` ignores all failures, force-executing the entire target despite known non-compliant instances.

## SSM Document: Command Definitions

The actual execution content of Run Command lives in SSM Documents (JSON or YAML). Documents are the foundation for all SSM automation capabilities.

**Document Types and uses:**

| Type | Purpose | Examples |
|------|------|------|
| `Command` | Run Command, State Manager | AWS-RunShellScript, AWS-RunPatchBaseline |
| `Automation` | SSM Automation Runbook | AWS-RestartEC2Instance, custom |
| `Session` | Session Manager sessions | SSM-SessionManagerRunShell |
| `Policy` | State Manager policy application | AWS-GatherSoftwareInventory |
| `Package` | Distributor packages | Custom packages |

**Key AWS-provided Command Documents:**

```
AWS-RunShellScript          - Execute Linux shell commands
AWS-RunPowerShellScript     - Execute Windows PowerShell commands
AWS-RunPatchBaseline        - Apply patches (Patch Manager standard)
AWS-ConfigureAWSPackage     - Distributor package install/uninstall
AWS-UpdateSSMAgent          - SSM Agent auto-update
AmazonCloudWatch-ManageAgent - CloudWatch Agent management
```

> 🔍 **Deeper Dive**: SSM Documents support version management. Versions can be specified as `$LATEST`, `$DEFAULT`, or numeric (1, 2, 3...). `$LATEST` always retrieves the newest version; `$DEFAULT` is operator-designated stable version. In production, always use `$DEFAULT` or pinned version numbers to prevent unexpected Document updates from changing behavior. AWS-managed Documents (`AWS-*`) update by AWS; version pinning is critical. Custom Documents apply Git-like semantic versioning, with standard patterns: create-document → test → update-document-default-version in CI/CD (Blue-Green deployment for Documents).

## Run Command Practical Patterns

**Basic execution (tag-based targets):**

```bash
# Add environment variable to 150 prod servers
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --parameters '{
    "commands":[
      "echo '"'"'NEW_FEATURE_FLAG=true'"'"' >> /etc/environment",
      "source /etc/environment",
      "echo \"Applied on $(hostname) at $(date)\""
    ]
  }' \
  --targets '[{"Key":"tag:Environment","Values":["prod"]}]' \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --output-s3-bucket-name "ssm-command-output" \
  --output-s3-key-prefix "env-var-deploy/$(date +%Y/%m/%d)" \
  --cloud-watch-output-config '{
    "CloudWatchLogGroupName":"/ssm/run-command",
    "CloudWatchOutputEnabled":true
  }' \
  --timeout-seconds 300

# Save Command ID
COMMAND_ID=$(aws ssm send-command ... --query 'Command.CommandId' --output text)

# Query results
aws ssm list-command-invocations \
  --command-id "$COMMAND_ID" \
  --details \
  --query 'CommandInvocations[*].[InstanceId,Status,CommandPlugins[0].ResponseCode,CommandPlugins[0].Output]' \
  --output table
```

**Re-execute failed instances only:**

```bash
# Extract failed instance IDs
FAILED_INSTANCES=$(aws ssm list-command-invocations \
  --command-id "$COMMAND_ID" \
  --filter "key=Status,value=Failed" \
  --query 'CommandInvocations[*].InstanceId' \
  --output text | tr '\t' ',')

# Re-execute failed instances only
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --parameters '...' \
  --instance-ids $FAILED_INSTANCES \
  --max-concurrency "1" \
  --max-errors "0"
```

> ⚠️ **Pitfall**: Direct `--instance-ids` specification maxes at 50. For >50, use Tags or Resource Groups. Also, Run Command matches tags at execution time; tag changes after execution don't affect already-sent commands. Command execution results save to S3 per-instance at separate paths (`<prefix>/<CommandId>/<InstanceId>/awsrunshellscript/0.awsrunshellscript/stdout`).

## State Manager: Continuous Assurance of Desired State

If Run Command is "execute once now," State Manager is "always stay in this state." The core is a configuration unit called Association.

**Association components:**

| Component | Description | Example |
|-----------|------|------|
| `Document` | SSM Document to apply | AmazonCloudWatch-ManageAgent |
| `Targets` | Targets (Tags, IDs, Resource Groups) | `Key=tag:MonitoringEnabled,Values=true` |
| `Parameters` | Parameters passed to Document | CW Agent config path |
| `Schedule` | Execution frequency | `rate(1 day)`, `cron(0 2 ? * MON *)` |
| `MaxConcurrency` | Concurrent execution limit | `20%` |
| `MaxErrors` | Error tolerance | `5%` |
| `ComplianceLevel` | Failure severity level | `CRITICAL`, `HIGH` |

**State Manager's Convergence Behavior:**

```
Association registered
      │
      ▼
[New instance becomes Managed Instance]
      │ (if tags match, auto-execute immediately)
      ▼
[Re-execute per schedule]
      │ (auto-correct any drift detected)
      ▼
[Record compliance results]
```

**Practical example - CloudWatch Agent config synchronization:**

```bash
aws ssm create-association \
  --association-name "EnforceCWAgentConfig" \
  --name "AmazonCloudWatch-ManageAgent" \
  --targets '[{"Key":"tag:MonitoringEnabled","Values":["true"]}]' \
  --parameters '{
    "action":["configure"],
    "mode":["ec2"],
    "optionalConfigurationSource":["ssm"],
    "optionalConfigurationLocation":["/cloudwatch/agent/prod-config"],
    "optionalRestart":["yes"]
  }' \
  --schedule-expression "rate(1 day)" \
  --max-concurrency "20%" \
  --max-errors "5%" \
  --compliance-severity "HIGH"
```

After Association registration, here's what happens:
1. New EC2 starts with `MonitoringEnabled=true` tag → registers as Managed Instance → Association auto-executes → CW Agent config auto-applied
2. Someone manually changes CW Agent config (drift) → next schedule execution (max 1 day later) auto-corrects
3. CW Agent crashes → schedule execution restarts via `optionalRestart: yes`

> 📚 **Case Study**: 2023, large e-commerce platform (Company B) implemented State Manager for CloudWatch Agent standardization. Previously, new instances scaling-out often missed metric collection. After State Manager adoption, 6 months showed zero "metric collection missing" incidents. Accidental config changes auto-corrected within 24 hours. Compliance dashboard provided real-time failed-instance visibility.

**Association immediate execution (ApplyOnlyAtCronInterval control):**

```bash
# By default, Association executes once on creation
# Execute only per schedule, skip creation run:
aws ssm create-association \
  --association-name "WeeklyKernelUpdate" \
  --name "AWS-RunShellScript" \
  --schedule-expression "cron(0 3 ? * SUN *)" \
  --apply-only-at-cron-interval \
  --targets '[{"Key":"tag:PatchGroup","Values":["prod"]}]'

# Force immediate execution (ignoring schedule)
aws ssm start-associations-once \
  --association-ids "asc-0123456789abcdef0"
```

> 💡 **Related Theory**: State Manager's "desired state convergence" exactly parallels control theory's "feedback control loop." Goal state (setpoint) versus current state (process variable) mismatch (error) triggers correction (control action). Kubernetes Reconciler pattern, Puppet Catalog application, AWS Config auto-remediation all use the same principle. State Manager uses the schedule as a "sampling interval," detecting and correcting drift as a discrete-time control loop.

**Pseudo Parameters for dynamic Documents:**

```yaml
# Use dynamic variables like {{InstanceId}} in SSM Document
{
  "schemaVersion": "2.2",
  "mainSteps": [
    {
      "action": "aws:runShellScript",
      "name": "labelInstance",
      "inputs": {
        "runCommand": [
          "echo 'InstanceId: {{ssm:instanceId}}' > /etc/instance-label",
          "echo 'Region: {{global:REGION}}' >> /etc/instance-label"
        ]
      }
    }
  ]
}
```

## Maintenance Window: Safely Execute Complex Tasks During Scheduled Times

Maintenance Window turns "we patched every Sunday at 2 AM" operational policy into code. It's not just a cron scheduler—a complete workflow engine for safely executing complex task bundles.

**Relationship of three components:**

```
Maintenance Window (time window definition)
    │
    ├── Targets (target groups)
    │      tag:PatchGroup=prod-web
    │
    └── Tasks (jobs to execute, ordered by priority)
           1. Create snapshot (Automation) - Priority 1
           2. Deregister from ELB (Automation)  - Priority 2
           3. Apply patches (Run Command)     - Priority 3
           4. Health check (Automation)   - Priority 4
           5. Register with ELB (Automation)   - Priority 5
```

**Window time parameters:**

| Parameter | Meaning | Recommended |
|----------|------|--------|
| `Schedule` | cron or rate expression | `cron(0 2 ? * SUN *)` (every Sunday 02:00) |
| `Duration` | Total window hours | 4 (min 1, max 24) |
| `Cutoff` | New task start deadline (hours) | 1 (block new tasks 1 hour before end) |

**Cutoff importance:** Duration 4 hours, Cutoff 1 hour means actual new-work window is 3 hours. A task started at 03:00 continues running past 04:00. Cutoff prevents new tasks starting just before window end (causing incomplete execution when window closes).

> 💡 **Related Theory**: Maintenance Window's Cutoff concept mirrors "graceful shutdown" in operating systems. Like TCP FIN/ACK, block new work acceptance first, then wait for in-progress work to complete. Kubernetes `terminationGracePeriodSeconds` follows the same principle. Distributed systems universally honor "complete in-progress work but don't accept new work"—essential for data integrity. POSIX SIGTERM → SIGKILL sequencing implements graceful shutdown philosophy.

## Complete CRON Expression Mastery

Maintenance Window Schedule uses AWS cron expressions. AWS cron differs slightly from standard Linux cron.

```
AWS cron format: cron(Minutes Hours Day-of-month Month Day-of-week Year)

Special characters:
  * : all values
  ? : no specific value (use one of Day-of-month or Day-of-week)
  - : range (e.g., 1-5)
  , : list (e.g., MON,WED,FRI)
  / : increment (e.g., 0/15 = 0, 15, 30, 45)
  L : last (e.g., L in Day-of-month = last day of month)
  W : nearest weekday
  # : Nth weekday (e.g., 2#1 = first Tuesday of month)

Examples:
  cron(0 2 ? * SUN *)     = every Sunday 02:00 UTC
  cron(0 14 ? * MON-FRI *) = weekdays 14:00 UTC
  cron(0 1 1 * ? *)        = monthly 1st at 01:00 UTC
  cron(0 9 ? * 2#1 *)      = first Monday of month 09:00 UTC
  cron(15 12 L * ? *)       = last day of month 12:15 UTC
```

> ⚠️ **Pitfall**: AWS cron is **UTC-based**. To run at Seoul 2 AM (KST = UTC+9) on Sunday, set `cron(0 17 ? * SAT *)` (Saturday 17:00 UTC = Sunday 02:00 KST). Also, Day-of-month and Day-of-week can't be specified simultaneously; one must always be `?`. `cron(0 2 15 * MON *)` is invalid; choose either `cron(0 2 15 * ? *)` (monthly 15th) or `cron(0 2 ? * MON *)` (every Monday).

**Complete patch window configuration example:**

```bash
# 1. Create Maintenance Window
WINDOW_ID=$(aws ssm create-maintenance-window \
  --name "ProdWebWeeklyPatch" \
  --schedule "cron(0 17 ? * SAT *)" \
  --schedule-timezone "Asia/Seoul" \
  --duration 4 \
  --cutoff 1 \
  --allow-unassociated-targets \
  --description "Weekly patch window for prod web tier (Sun 02:00 KST)" \
  --query 'WindowId' --output text)

echo "Window ID: $WINDOW_ID"

# 2. Register targets (Patch Group tag-based)
TARGET_ID=$(aws ssm register-target-with-maintenance-window \
  --window-id "$WINDOW_ID" \
  --resource-type INSTANCE \
  --targets 'Key=tag:PatchGroup,Values=prod-web' \
  --owner-information "Production Web Tier Servers" \
  --query 'WindowTargetId' --output text)

# 3. Task 1: Create EBS snapshot (Automation, Priority 1)
aws ssm register-task-with-maintenance-window \
  --window-id "$WINDOW_ID" \
  --task-arn "AWS-CreateSnapshot" \
  --task-type AUTOMATION \
  --targets "Key=WindowTargetIds,Values=$TARGET_ID" \
  --priority 1 \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --service-role-arn "arn:aws:iam::123456789012:role/SSMMaintenanceWindowRole"

# 4. Task 2: Apply patches (Run Command, Priority 2)
aws ssm register-task-with-maintenance-window \
  --window-id "$WINDOW_ID" \
  --task-arn "AWS-RunPatchBaseline" \
  --task-type RUN_COMMAND \
  --targets "Key=WindowTargetIds,Values=$TARGET_ID" \
  --priority 2 \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --service-role-arn "arn:aws:iam::123456789012:role/SSMMaintenanceWindowRole" \
  --task-invocation-parameters '{
    "RunCommand": {
      "Parameters": {
        "Operation": ["Install"],
        "RebootOption": ["RebootIfNeeded"]
      },
      "OutputS3BucketName": "patch-output-bucket",
      "OutputS3KeyPrefix": "prod-web",
      "CloudWatchOutputConfig": {
        "CloudWatchLogGroupName": "/ssm/patch/prod-web",
        "CloudWatchOutputEnabled": true
      }
    }
  }'

# 5. Query window previous executions
aws ssm describe-maintenance-window-executions \
  --window-id "$WINDOW_ID" \
  --query 'WindowExecutions[*].[WindowExecutionId,Status,StartTime,EndTime]' \
  --output table
```

> 📚 **Case Study**: 2022, healthcare SaaS company (Company C) implemented automated patching for HIPAA compliance. Set Maintenance Windows bimonthly (1st, 15th, KST 2 AM), Tasks ordered: EBS snapshot (Priority 1) → ELB deregister (Priority 2) → patch (Priority 3) → health check (Priority 4) → ELB register (Priority 5). Set max-concurrency=10%, max-errors=5% to prevent patch failure cascade. Before: patch manager worked Saturday mornings. After: completely automated, human-free. HIPAA 164.312(c)(2) (patch validation procedure) satisfied by S3-stored patch logs.

## Compliance: Unified Dashboard for Patches and Associations

Compliance aggregates Patch Manager and State Manager execution results, calculating per-instance compliance score.

**Compliance data types:**

| Type | Source | Key Metrics |
|------|------|-----------|
| `Patch` | Patch Manager | MissingCount, FailedCount, InstalledPendingRebootCount |
| `Association` | State Manager | Success/failure status |
| `Custom` | Lambda/CLI direct report | User-defined items |

```bash
# Compliance summary (entire account)
aws ssm list-compliance-summaries \
  --query 'ComplianceSummaryItems[*].[ComplianceType,CompliantSummary.CompliantCount,NonCompliantSummary.NonCompliantCount]' \
  --output table

# Non-compliant items for specific instance
aws ssm list-compliance-items \
  --resource-ids i-0123456789abcdef0 \
  --resource-types ManagedInstance \
  --filters 'Key=STATUS,Values=NON_COMPLIANT,Type=EQUAL'

# Report custom compliance item (Lambda, etc.)
aws ssm put-compliance-items \
  --resource-id i-0123456789abcdef0 \
  --resource-type ManagedInstance \
  --compliance-type "Custom:AppSecurity" \
  --execution-summary '{"ExecutionTime":"2026-05-26T02:00:00Z"}' \
  --items '[{"Id":"SSL_CERT_EXPIRY","Title":"SSL cert valid","Severity":"CRITICAL","Status":"COMPLIANT","Details":{"expiry":"2027-01-01"}}]'
```

> 🔍 **Deeper Dive**: Using Compliance's `Custom:*` type integrates security scan results beyond SSM into a central dashboard. For example, CIS Benchmark results, SSL certificate expiration, custom app config validation can be reported via Lambda's `put-compliance-items` into the Compliance dashboard. This data also aggregates into Security Hub or Audit Manager. AWS calls this pattern "operational data aggregation"; in multi-account environments, Organizations + Resource Data Sync aggregates all accounts' compliance data into central account—the standard structure.

## Run Command vs State Manager vs Maintenance Window: When to Use Which?

Distinguishing these three tools is repeatedly tested on SOA-C02.

| Characteristic | Run Command | State Manager | Maintenance Window |
|------|-------------|---------------|---------------------|
| **Execution frequency** | One-shot (one time only) | Continuous (ongoing) | Scheduled time |
| **Drift correction** | X (must resend) | O (auto re-execute) | X (schedule only) |
| **New instance auto-inclusion** | X (explicit re-run needed) | O (auto if tag matches) | Tag-based, then yes |
| **Multi-task support** | Single Document | Single Document | Multiple Tasks, priorities |
| **Typical use case** | Emergency batch command, ad-hoc inspection | Standard config enforcement, CW Agent sync | Patches, backups, maintenance |
| **Output storage** | S3, CW Logs | S3, CW Logs | Per Task config |

**Decision flow:**

```
Need to execute a command?
    │
    ├─ Just once right now? → Run Command
    │
    ├─ Maintain this state always? → State Manager
    │
    └─ Regularly at specific times? → Maintenance Window
          │
          └─ Multiple sequential steps? → Maintenance Window + Automation Runbook
```

## 📝 练習 問題

**Question 1.** Operator must immediately execute emergency security patch script on 200 prod EC2s. Too much concurrent execution risks service load; want to stop propagation if >10% fail. Best configuration?

A) State Manager Association — rate(1 hour) schedule
B) Run Command: `--max-concurrency "10%"`, `--max-errors "10%"`, target `Key=tag:Environment,Values=prod`
C) Manually trigger Maintenance Window to run now
D) Lambda sequential API call per instance

**Answer: B**
Explanation: Urgent (immediate), one-time, concurrency control = Run Command's core use case. `--max-concurrency 10%` runs 20 of 200 at a time, `--max-errors 10%` stops if 20+ fail. State Manager suits sustained management, not urgent one-off. A doesn't suit emergency timing.

---

**Question 2.** Company wants uniform CW Agent config across all prod EC2s. New instances added via Auto Scaling must auto-apply CW Agent config. No operator intervention needed. Best tool?

A) Run Command via EventBridge trigger (EC2 launch events)
B) State Manager Association — tag-based targets, daily schedule, CW Agent Document
C) Maintenance Window — weekly blanket application
D) User Data script with CW Agent config

**Answer: B**
Explanation: State Manager Association's core value: "Association auto-executes when new Managed Instance registers." Auto-Scaled instance with `MonitoringEnabled=true` tag registers as Managed Instance, Association auto-runs immediately. A works but needs extra EventBridge setup, no drift correction. D requires AMI updates for config changes.

---

**Question 3.** Maintenance Window: Duration 4h, Cutoff 1h. Attempting new Task at 03:45. Window: 02:00–06:00. What happens?

A) Executes normally
B) Before Cutoff (05:00) so executable; in-progress tasks continue past 06:00
C) Cutoff (05:00) passed, so new Task start rejected
D) Duration exceeded, all Tasks stop

**Answer: B**
Explanation: Duration 4h, Cutoff 1h means Window 02:00–06:00, new task cutoff 05:00. At 03:45, Cutoff hasn't hit yet, new Task starts. Already-started Tasks continue even after 06:00 ends—Cutoff prevents mid-launch tasks from hanging incomplete. This is graceful shutdown.

---

**Question 4.** Which best distinguishes State Manager Association from Run Command?

A) State Manager only Windows, Run Command only Linux
B) State Manager auto-applies to new instances with matching tags; Run Command requires explicit re-run
C) Run Command supports more Document Types
D) State Manager unsupported on on-premises

**Answer: B**
Explanation: Core differentiator. State Manager Association auto-executes when new Managed Instance registers with matching tags. Run Command captures state at execution time, doesn't react to later changes. Both support Linux/Windows/on-premises.

---

**Question 5.** Company wants automated prod server patching every Sunday 2–6 AM. Create EBS snapshot first, then patch—order must be guaranteed. Best configuration?

A) State Manager Association — cron schedule, AWS-RunPatchBaseline Document
B) EventBridge cron → Lambda → sequential Run Command calls
C) Maintenance Window — Duration/Cutoff set, Task Priority (snapshot=1 → patch=2) guarantees order
D) Manual Run Command Sunday morning

**Answer: C**
Explanation: Maintenance Window Task Priority guarantees execution order. Priority 1 completes before Priority 2 starts. Standard pattern: Automation Task (snapshot) + Run Command Task (patch). State Manager (A) lacks multi-task ordering.

---

**Question 6.** Company collected Inventory data, wants long-term storage and SQL analysis. Required configuration?

A) Inventory data queryable only in SSM console, no external export
B) Resource Data Sync to S3 in JsonSerDe, analyze via Athena SQL
C) CloudWatch Logs sync, analyze with Insights
D) DynamoDB sync, use PartiQL

**Answer: B**
Explanation: SSM Resource Data Sync exports Inventory to S3 as JsonSerDe. Athena DDL queries "which servers have which software." Large-scale security response, license compliance, software standard checks all use this. Default for Inventory analytics.

---

**Question 7.** Run Command on 150 instances: 3 failed. Set `--max-errors "5%"`. What happened to remaining 147?

A) Entire execution stopped immediately
B) 5% threshold (7 instances) exceeds 3 failures, remaining batches continue
C) Auto re-executed failed 3
D) All instances rolled back

**Answer: B**
Explanation: 150 × 5% = 7 allowed failures. 3 < 7, circuit breaker doesn't trigger. Remaining batches (15 at a time) execute. No auto-retry or rollback—failed 3 need separate re-run. Key Run Command vs State Manager difference: no auto-remediation.

---

## 📝 연습 문제

(Korean practice problems section — preserved in original)

**문제 1.** ...
