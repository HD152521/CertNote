# Day 2 - Run Command, State Manager, Maintenance Window: The Operations Automation Trio

"We need to add a new environment variable to all the prod servers. Right now." That is a message from the dev team lead. There are 150 EC2 instances, all tagged `Environment=prod`. SSH into them one by one? An impossible schedule. This is when the operator reaches for Run Command. You define the command, specify the targets by tag, set the concurrency and error limits, and press run, and it is deployed to all 150 at the same time. The results are automatically stored in S3 and CloudWatch Logs, and failed instances are automatically created as OpsItems in OpsCenter.

Run Command, State Manager, and Maintenance Window, which we cover today, are the "SSM operations automation trio." These three tools handle "once, right now (Run Command)," "always in this state (State Manager)," and "this task at this time (Maintenance Window)," respectively. Clearly distinguishing the roles of the three is one of the key points of the SOA-C02 exam.

## How Run Command Works Internally

Run Command looks simple, but internally it is a sophisticated distributed system. What happens when an operator calls `send-command`?

1. **SSM API receipt**: The command is registered with the SSM service and a Command ID is issued
2. **Target selection**: The target list is computed based on Tags/Resource Groups/Instance IDs
3. **Concurrency control**: The first batch is selected according to the concurrency limit (for example, 10% means 15 of 150)
4. **Agent poll**: The Agents on the selected instances fetch the command at their next heartbeat (pull model)
5. **Execution and result return**: The Agent runs the command and returns stdout/stderr to SSM over the `ec2messages` channel
6. **Output storage**: Results are stored in an S3 bucket and CloudWatch Logs depending on the configuration
7. **Error evaluation**: If the error rate so far exceeds the Error Threshold, the remaining batches are stopped
8. **Next batch**: If errors are below the threshold, the next 15 are run

Run Command's concurrency control is a design that combines the "circuit breaker pattern" and the "bulkhead pattern" of distributed systems. In Michael Nygard's "Release It!" (2007), the circuit breaker is a pattern that prevents failure propagation, and stopping the remaining execution when the Error Threshold is exceeded is exactly that implementation. A bulkhead limits the number of concurrent executions to isolate failures so they do not spread to everything. When an operator sets `--max-concurrency 10%`, they apply both patterns at once. Chapter 13, "Emergency Response," of the Google SRE Book (Beyer et al., 2016) expresses the same principle as "rate limiting."

## The Math of Rate Control: When to Use Percent and When Absolute Values?

Run Command's `--max-concurrency` and `--max-errors` can be either a percentage or an absolute value. When should you use which?

| Situation | max-concurrency | max-errors | Reason |
|------|----------------|------------|------|
| ASG with fluid scale | 10% | 5% | The ratio is maintained even as the instance count changes |
| Fixed instance count (100) | 10 or 10% | 5 or 5% | Same effect |
| Very small group (5) | 2 (absolute recommended) | 1 | 5% is 0.25 instances → rounded up to 1 |
| Emergency patch (speed first) | 50% | 20% | Fast deployment, high tolerance |
| Critical DB servers (stability first) | 1 | 0 | One at a time, stop if even one fails |

**Percent calculation examples:**
- 150 instances, max-concurrency=10%: ceil(150 × 0.10) = 15 run in parallel at a time
- 150 instances, max-errors=5%: stops if 7 (ceil(150 × 0.05)) or more fail
- If 7 failures occur in the first batch (15), the remaining 135 are not run

Setting `--max-errors "0"` allows not even a single failure, so it stops immediately. This is a "zero-tolerance rollout," suitable for testing on one or two instances first when you do not know whether a new critical patch has a compatibility problem with a specific OS version. On the other hand, `--max-errors "100%"` ignores all failures and force-runs on all targets, and is used when you must update everything even if some known non-compliant instances exist.

## SSM Document: The Definition of a Command

The actual content that Run Command executes is contained in an SSM Document (JSON or YAML). The Document is the foundation of all SSM automation features.

**Usage by Document Type:**

| Type | Use | Example |
|------|------|------|
| `Command` | Run Command, State Manager | AWS-RunShellScript, AWS-RunPatchBaseline |
| `Automation` | SSM Automation Runbook | AWS-RestartEC2Instance, user-defined |
| `Session` | Session Manager session | SSM-SessionManagerRunShell |
| `Policy` | State Manager policy application | AWS-GatherSoftwareInventory |
| `Package` | Distributor package | User-defined package |

**Key Command Documents provided by AWS:**

```
AWS-RunShellScript          - Run Linux shell commands
AWS-RunPowerShellScript     - Run Windows PowerShell commands
AWS-RunPatchBaseline        - Apply patches (the Patch Manager standard)
AWS-ConfigureAWSPackage     - Install/uninstall Distributor packages
AWS-UpdateSSMAgent          - Automatically update SSM Agent
AmazonCloudWatch-ManageAgent - Manage the CloudWatch Agent
```

SSM Documents support versioning. You can specify a particular Document version as `$LATEST`, `$DEFAULT`, or a number (1, 2, 3...). `$LATEST` is always the newest version, and `$DEFAULT` is the one the operator designated as the stable version. In production you should always specify `$DEFAULT` or a specific version number to prevent behavior changes from unexpected Document updates. AWS-managed Documents (`AWS-*`) are updated by AWS, so pinning the version is important. For custom Documents, apply meaningful version management like Git, and the standard pattern is to deploy Blue/Green in a CI/CD pipeline through `create-document` → test → `update-document-default-version`.

## Run Command in Practice

**Basic execution (tag-based targets):**

```bash
# Add an environment variable to 150 prod servers
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

# Save the Command ID
COMMAND_ID=$(aws ssm send-command ... --query 'Command.CommandId' --output text)

# Query the results
aws ssm list-command-invocations \
  --command-id "$COMMAND_ID" \
  --details \
  --query 'CommandInvocations[*].[InstanceId,Status,CommandPlugins[0].ResponseCode,CommandPlugins[0].Output]' \
  --output table
```

**Re-run only on failed instances:**

```bash
# Extract the list of failed instance IDs
FAILED_INSTANCES=$(aws ssm list-command-invocations \
  --command-id "$COMMAND_ID" \
  --filter "key=Status,value=Failed" \
  --query 'CommandInvocations[*].InstanceId' \
  --output text | tr '\t' ',')

# Re-run only on the failed instances
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --parameters '...' \
  --instance-ids $FAILED_INSTANCES \
  --max-concurrency "1" \
  --max-errors "0"
```

> ⚠️ **Trap**: When you specify targets directly with `--instance-ids`, the limit is 50. Beyond 50 you must use Tags or Resource Groups. Also, Run Command matches tags at execution time, so even if tags change after execution, commands already sent are unaffected. And when the stdout/stderr of the command results is stored in S3, it is stored at a separate path for each instance (`<prefix>/<CommandId>/<InstanceId>/awsrunshellscript/0.awsrunshellscript/stdout`).

## State Manager: Continuously Guaranteeing the Desired State

If Run Command is "once, right now," State Manager is "always this state." The unit of configuration called an Association is the core.

**Components of an Association:**

| Component | Description | Example |
|-----------|------|------|
| `Document` | The SSM Document to apply | AmazonCloudWatch-ManageAgent |
| `Targets` | Targets (Tags, IDs, Resource Groups) | `Key=tag:MonitoringEnabled,Values=true` |
| `Parameters` | Parameters to pass to the Document | CW Agent config path |
| `Schedule` | Execution cycle | `rate(1 day)`, `cron(0 2 ? * MON *)` |
| `MaxConcurrency` | Number of concurrent executions | `20%` |
| `MaxErrors` | Allowed number of errors | `5%` |
| `ComplianceLevel` | Compliance severity on failure | `CRITICAL`, `HIGH` |

**State Manager's convergence behavior:**

```
Association registered
      │
      ▼
[A new instance registers as a Managed Instance]
      │ (if the tag matches, the Association runs immediately)
      ▼
[Re-run at every schedule interval]
      │ (if drift occurred, it is corrected automatically)
      ▼
[Compliance result is recorded]
```

**A practical Association example - synchronizing the CloudWatch Agent configuration:**

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

What happens after this Association is registered:
1. A new EC2 starts with the `MonitoringEnabled=true` tag → the Association runs immediately when it registers as a Managed Instance → the CW Agent configuration is applied automatically
2. Someone changes the CW Agent configuration directly on the instance (drift) → it is corrected automatically at the next scheduled run (up to 1 day later)
3. The CW Agent exits because of a crash → at the scheduled run it is restarted automatically with `optionalRestart: yes`

As a hypothetical case, in 2023 a large e-commerce platform, Company B, implemented CloudWatch Agent configuration standardization with State Manager. Previously, every time a new instance scaled out, the dev team configured the CW Agent manually, and metric collection was often missed. In the 6 months after adopting State Manager Associations, there were 0 incidents of "missed metric collection." They also confirmed that when someone accidentally changed the Agent configuration, it was automatically restored within 24 hours. Operational visibility also improved because the compliance dashboard shows the instances whose Association failed in real time.

**Immediate execution of an Association (controlling ApplyOnlyAtCronInterval):**

```bash
# By default, an Association runs once immediately upon creation
# Run only on the schedule and prevent immediate execution on creation:
aws ssm create-association \
  --association-name "WeeklyKernelUpdate" \
  --name "AWS-RunShellScript" \
  --schedule-expression "cron(0 3 ? * SUN *)" \
  --apply-only-at-cron-interval \
  --targets '[{"Key":"tag:PatchGroup","Values":["prod"]}]'

# Force an Association to run immediately (regardless of schedule)
aws ssm start-associations-once \
  --association-ids "asc-0123456789abcdef0"
```

State Manager's "desired state convergence" concept is identical to the "feedback control loop" of control theory. It detects the difference (error) between the target state (setpoint) and the current state (process variable) and applies a corrective action (control action). Kubernetes's Reconciler pattern, Puppet's Catalog application, and AWS Config's automatic remediation all share the same principle. State Manager uses the schedule as the "sampling interval" to implement a discrete-time control loop that regularly detects and corrects drift.

**A dynamic Document with Pseudo Parameters:**

```yaml
# Use dynamic variables like {{InstanceId}} in an SSM Document
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

## Maintenance Window: Running Complex Tasks in a Safe Time Slot

Maintenance Window is a tool that turns the operational policy "we decided to do patching at 2 AM on Sunday" into code. It is not a simple cron scheduler but a complete workflow engine that safely runs a bundle of complex tasks.

**Relationship among the 3 components:**

```
Maintenance Window (defines the time slot)
    │
    ├── Targets (target group)
    │      tag:PatchGroup=prod-web
    │
    └── Tasks (tasks to run, in priority order)
           1. Create snapshot (Automation)  - Priority 1
           2. ELB deregister (Automation)   - Priority 2
           3. Apply patch (Run Command)     - Priority 3
           4. Health check (Automation)     - Priority 4
           5. ELB register (Automation)     - Priority 5
```

**Window time parameters:**

| Parameter | Meaning | Recommended value |
|----------|------|--------|
| `Schedule` | cron or rate expression | `cron(0 2 ? * SUN *)` (every Sunday 02:00) |
| `Duration` | Total duration of the Window (hours) | 4 (minimum 1, maximum 24) |
| `Cutoff` | Deadline for starting new Tasks (hours) | 1 (blocked 1 hour before the Window ends) |

**The importance of Cutoff:** With a Duration of 4 hours and a Cutoff of 1 hour, the time in which new work can actually be started is 3 hours. A job that already started at 03:00 continues to run even when it reaches 04:00. Cutoff prevents the situation where "a new job starts just before the Window ends and is cut off unfinished."

The Cutoff concept of Maintenance Window is identical to the "graceful shutdown" pattern in operational systems. Like the FIN/ACK process of a TCP connection, it first blocks acceptance of new work and waits for in-progress work to complete. Kubernetes's `terminationGracePeriodSeconds` follows the same principle. In distributed systems, the principle "let in-progress work finish but accept no new work" is basic to data integrity. The POSIX SIGTERM → SIGKILL sequence also implements the same graceful shutdown philosophy.

## Mastering CRON Expressions

The Schedule of a Maintenance Window uses AWS cron expressions. AWS cron differs somewhat from standard Linux cron.

```
AWS cron format: cron(minute hour day month weekday year)
                 cron(Minutes Hours Day-of-month Month Day-of-week Year)

Special characters:
  * : every value
  ? : no specific value (use for only one of Day-of-month and Day-of-week)
  - : range (e.g., 1-5)
  , : list (e.g., MON,WED,FRI)
  / : increment (e.g., 0/15 = 0, 15, 30, 45)
  L : last (e.g., in Day-of-month, L = the last day of the month)
  W : nearest weekday
  # : Nth weekday (e.g., 2#1 = the first Tuesday of the month)

Examples:
  cron(0 2 ? * SUN *)     = every Sunday 02:00 UTC
  cron(0 14 ? * MON-FRI *) = weekdays 14:00 UTC
  cron(0 1 1 * ? *)        = the 1st of every month 01:00 UTC
  cron(0 9 ? * 2#1 *)      = the first Monday of every month 09:00 UTC
  cron(15 12 L * ? *)       = the last day of every month 12:15 UTC
```

> ⚠️ **Trap**: AWS cron is **UTC-based**. To run at 2 AM in Seoul (KST = UTC+9), you must set `cron(0 17 ? * SAT *)` (Saturday 17:00 UTC = Sunday 02:00 KST). Also, you cannot specify Day-of-month and Day-of-week at the same time, so one of them must use `?`. `cron(0 2 15 * MON *)` is not valid, and you must choose either `cron(0 2 15 * ? *)` (the 15th of every month) or `cron(0 2 ? * MON *)` (every Monday).

**A complete patch Window configuration example:**

```bash
# 1. Create the Maintenance Window
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

# 2. Register targets (based on the Patch Group tag)
TARGET_ID=$(aws ssm register-target-with-maintenance-window \
  --window-id "$WINDOW_ID" \
  --resource-type INSTANCE \
  --targets 'Key=tag:PatchGroup,Values=prod-web' \
  --owner-information "Production Web Tier Servers" \
  --query 'WindowTargetId' --output text)

# 3. Task 1: Create an EBS snapshot (Automation, Priority 1)
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

# 5. Query previous Window execution history
aws ssm describe-maintenance-window-executions \
  --window-id "$WINDOW_ID" \
  --query 'WindowExecutions[*].[WindowExecutionId,Status,StartTime,EndTime]' \
  --output table
```

As a hypothetical case, in 2022 a healthcare SaaS company, Company C, implemented patch automation for HIPAA compliance. It set the Maintenance Window to twice a month (the 1st and 15th, 2 AM KST) and organized the Task order as EBS snapshot (Priority 1) → ELB Deregister (Priority 2) → patch (Priority 3) → Health Check (Priority 4) → ELB Register (Priority 5). It set max-concurrency=10% and max-errors=5% so that patch failures would not cascade. Before adoption, the patch owner came in at dawn every Saturday, but after adoption it switched to fully unattended automation. It met the HIPAA 164.312(c)(2) requirement (patch verification procedure) with the patch logs stored in S3.

## Compliance: An Integrated Dashboard for Patches and Associations

Compliance combines the execution results of Patch Manager and State Manager to produce a per-instance compliance score.

**Compliance data types:**

| Type | Source | Key metrics |
|------|------|-----------|
| `Patch` | Patch Manager | MissingCount, FailedCount, InstalledPendingRebootCount |
| `Association` | State Manager | Whether execution succeeded or failed |
| `Custom` | Reported directly via Lambda/CLI | User-defined items |

```bash
# Compliance summary (whole account)
aws ssm list-compliance-summaries \
  --query 'ComplianceSummaryItems[*].[ComplianceType,CompliantSummary.CompliantCount,NonCompliantSummary.NonCompliantCount]' \
  --output table

# Non-compliant items of a specific instance
aws ssm list-compliance-items \
  --resource-ids i-0123456789abcdef0 \
  --resource-types ManagedInstance \
  --filters 'Key=STATUS,Values=NON_COMPLIANT,Type=EQUAL'

# Report a custom compliance item (from Lambda, etc.)
aws ssm put-compliance-items \
  --resource-id i-0123456789abcdef0 \
  --resource-type ManagedInstance \
  --compliance-type "Custom:AppSecurity" \
  --execution-summary '{"ExecutionTime":"2026-05-26T02:00:00Z"}' \
  --items '[{"Id":"SSL_CERT_EXPIRY","Title":"SSL cert valid","Severity":"CRITICAL","Status":"COMPLIANT","Details":{"expiry":"2027-01-01"}}]'
```

By using Compliance's `Custom:*` type, you can also integrate security check results from outside SSM into the central dashboard. For example, if you report CIS Benchmark scan results, SSL certificate expiry status, and custom application configuration validation results from Lambda with `put-compliance-items`, they are integrated into the Compliance dashboard. This data can also be aggregated into Security Hub or Audit Manager. AWS calls this pattern "operational data aggregation," and in a multi-account environment the standard structure is to aggregate the compliance data of all accounts into a central account with Organizations + Resource Data Sync.

## Run Command vs State Manager vs Maintenance Window: When to Use Which?

Clearly understanding the differences among these three tools is repeatedly required on SOA-C02.

| Characteristic | Run Command | State Manager | Maintenance Window |
|------|-------------|---------------|---------------------|
| **Execution frequency** | One-shot | Continuous | Scheduled |
| **Drift correction** | No (must be sent again) | Yes (re-runs automatically) | No (schedule only) |
| **Automatic inclusion of new instances** | No (explicit re-run needed) | Yes (immediately if the tag matches) | Yes if tag-based |
| **Parallel task support** | Single Document | Single Document | Multiple Tasks, priority |
| **Typical use cases** | Urgent bulk commands, ad-hoc checks | Enforcing standard configuration, CW Agent sync | Patching, backup, maintenance |
| **Output storage** | S3, CW Logs | S3, CW Logs | Depends on the Task configuration |

**Decision flow chart:**

```
Do you need to run a command?
    │
    ├─ Just once, right now? → Run Command
    │
    ├─ Must this state be maintained at all times? → State Manager
    │
    └─ Regularly at a specific time slot? → Maintenance Window
          │
          └─ Does the work have multiple steps? → Maintenance Window + Automation Runbook
```

## 📝 Practice Questions

**Question 1.** An operator must immediately run an urgent security patch script on 200 prod EC2 instances. Running too many at once raises concern about service load, and they want to stop propagation if 10% or more fail. What is the most suitable configuration?

A) Set a rate(1 hour) schedule with a State Manager Association
B) Run Command: `--max-concurrency "10%"`, `--max-errors "10%"`, target `Key=tag:Environment,Values=prod`
C) Manually trigger a Maintenance Window to run right now
D) Make sequential API calls to each instance with Lambda

**Answer: B**
Explanation: A situation that is urgent (immediate), one-shot, and needs concurrency control is the classic use case for Run Command. `--max-concurrency 10%` runs 20 of the 200 at a time, and `--max-errors 10%` automatically stops if 20 or more fail. State Manager is better suited to continuous management than immediate one-shot execution. A does not fit the urgency.

---

**Question 2.** A company wants to keep the CW Agent configuration identical on all prod EC2 instances. Even when new instances are added by Auto Scaling, the CW Agent configuration must be applied automatically. No separate operator intervention should be needed. What is the most suitable tool?

A) Trigger Run Command with EventBridge (EC2 launch event)
B) State Manager Association - tag-based targets, daily schedule, CW Agent configuration Document
C) Maintenance Window - apply to everything once a week
D) Include the CW Agent configuration in the User Data script

**Answer: B**
Explanation: The core value of a State Manager Association is that "the Association runs automatically the moment a new instance registers." If an instance added by Auto Scaling has the `MonitoringEnabled=true` tag, the Association runs as soon as it registers as a Managed Instance. A also works, but it needs an EventBridge rule setup in addition and does not correct drift. D makes configuration changes hard without an AMI update.

---

**Question 3.** A Maintenance Window is set with a Duration of 4 hours and a Cutoff of 1 hour. You try to start a new Task execution at 03:45. What happens? (Window start: 02:00, end: 06:00)

A) It runs normally
B) It can run because it is before the Cutoff time (05:00), but in-progress Tasks continue even after the Window ends (06:00)
C) The new Task start is rejected because the Cutoff time (05:00) has passed
D) All Tasks are stopped because the Duration was exceeded

**Answer: B**
Explanation: With a Duration of 4 hours and a Cutoff of 1 hour, the Window starts at 02:00 and ends at 06:00. Cutoff blocks starting new Tasks from 05:00, 1 hour before the end. 03:45 is before the Cutoff, so a new Task can be started. A Task that has already started continues to run until it completes even past the Window end time (06:00). The intent of Cutoff is that when the Window ends, "in-progress work completes and new work is blocked."

---

**Question 4.** Which of the following correctly describes the difference between a State Manager Association and Run Command?

A) State Manager works only on Windows instances and Run Command only on Linux
B) A State Manager Association is automatically applied to new instances whose tags match, but Run Command must be explicitly re-run
C) Run Command supports more Document Types
D) State Manager cannot be used on on-premises servers

**Answer: B**
Explanation: This is the most essential difference. A State Manager Association runs immediately when a new Managed Instance registers if the tags match. Run Command works once as a snapshot at execution time and does not react to later changes. Both tools support Linux, Windows, and on-premises.

---

**Question 5.** An operations team wants to automate prod server patching between 2 and 6 AM every Sunday. The order must be guaranteed: first create an EBS snapshot before patching, then apply the patch. What is the most suitable configuration?

A) State Manager Association - cron schedule, AWS-RunPatchBaseline Document
B) EventBridge cron → Lambda → sequential Run Command calls
C) Maintenance Window - Duration/Cutoff settings, with Task priority (Priority) guaranteeing the order snapshot (1) → patch (2)
D) Manually run Run Command at dawn on Sunday

**Answer: C**
Explanation: A Maintenance Window's Task Priority guarantees the execution order. After Priority 1 completes, Priority 2 runs. Tasks with the same Priority number run in parallel. The standard pattern is to create the snapshot with an Automation Task and apply the patch with a Run Command Task. State Manager (A) supports schedules but has no feature to guarantee the order of multiple Tasks.

---

**Question 6.** A company wants to retain data collected through SSM Inventory for a long time and analyze it with SQL. What setup is needed?

A) Inventory data can be viewed only in the SSM console, so it cannot be exported
B) Set up Resource Data Sync to sync Inventory data to an S3 bucket, then run SQL queries with Amazon Athena
C) Send Inventory data to CloudWatch Logs and analyze with Insights
D) Sync to DynamoDB and use PartiQL

**Answer: B**
Explanation: SSM Resource Data Sync syncs Inventory data to an S3 bucket in JsonSerDe format. After that, if you define a table with an AWS Glue crawler or directly with Athena DDL, you can use SQL to analyze "which software is on which server." In large environments it is used for responding to security vulnerabilities, license management, and verifying software standard compliance.

---

**Question 7.** You ran Run Command on 150 instances and it failed on 3. It was set with `--max-errors "5%"`. What happened to the remaining 147?

A) The entire execution was stopped immediately by the 3 failures
B) Since it is below the 5% threshold (7), the remaining batches continued to run
C) It was automatically re-run on the 3 failed instances
D) All instances were rolled back

**Answer: B**
Explanation: 5% of 150 is 7.5, and rounded up the tolerance is 7. 3 failures is fewer than 7, so the circuit breaker is not triggered. The remaining batches (the next 15 at a time) continue to run. There is no automatic re-run or rollback feature, so the 3 failed instances must be re-run separately. This is the biggest difference between State Manager (automatic drift correction) and Run Command.

---

