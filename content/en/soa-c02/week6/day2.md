# Day 2 - Change Set, Drift Detection, Rollback Trigger: Three Pillars of Safe CFn Operations

January 2021, Fastly CDN major outage. Root cause: configuration change during software deployment interacted unexpectedly, causing CDN to stop responding entirely. Thousands of sites—GitHub, Twitch, Amazon, The Guardian, Financial Times—went down for ~49 minutes. Fastly's CEO stated in postmortem: "didn't sufficiently validate changes before deployment."

Three CloudFormation tools prevent such incidents. **Change Set** dry-runs changes before deployment, **Drift Detection** catches reality-code gaps from manual changes, and **Rollback Trigger** auto-reverts to previous state if service anomalies appear post-deployment. All three guard different time windows: pre-deployment (Change Set), ongoing operations (Drift Detection), post-deployment (Rollback Trigger).

## Change Set: "See First, Execute Later"

Operators familiar with Terraform know `terraform plan`. Change Set is CloudFormation's `terraform plan`. `update-stack` immediately starts changes; Change Set shows "which resources will change and how" beforehand.

**Change Set Internal Operation:**

1. Compare current Stack Template with new Template
2. Calculate required Action (Add/Modify/Remove) for each resource
3. If Modify, analyze whether change triggers Replacement (recreation)
4. Don't touch actual resources; return plan only

**Replacement Determination:**

AWS documents whether each property is changeable. If "Update requires: Replacement," changing that property recreates resource.

| Replacement Value | Meaning | Operator Action |
|----------------|------|-------------|
| `True` | Must recreate. Delete existing, create new | Data loss risk, check UpdateReplacePolicy |
| `False` | In-place update. Modify properties only | Safe, can execute immediately |
| `Conditional` | Runtime-determined by other attributes | Needs review, conservative approach |
| `N/A` | Doesn't apply to Add/Remove | New resource created, existing deleted—be careful |

**Common Replacement-Triggering Changes:**

| Resource Type | Changed Property | Replacement |
|-------------|-----------|-------------|
| `AWS::RDS::DBInstance` | `MultiAZ` false→true | True |
| `AWS::RDS::DBInstance` | `DBInstanceIdentifier` | True |
| `AWS::S3::Bucket` | `BucketName` | True |
| `AWS::EC2::Instance` | `ImageId` (AMI) | True |
| `AWS::DynamoDB::Table` | `TableName` | True |
| `AWS::ElastiCache::ReplicationGroup` | `ClusterMode` | True |
| `AWS::Lambda::Function` | `FunctionName` | True |
| `AWS::RDS::DBInstance` | `DBInstanceClass` (mostly) | False |
| `AWS::EC2::SecurityGroup` | `SecurityGroupIngress` add | False |
| `AWS::EC2::Instance` | `InstanceType` (same EBS optimization) | Conditional |

**Practical Change Set Workflow:**

```bash
# 1. Create Change Set (no actual changes)
aws cloudformation create-change-set \
  --stack-name my-prod-app \
  --template-body file://new-template.yaml \
  --change-set-name "release-2.1-$(date +%Y%m%d-%H%M)" \
  --parameters ParameterKey=AppVersion,ParameterValue=2.1 \
  --capabilities CAPABILITY_NAMED_IAM

# 2. Wait for Change Set CREATE_COMPLETE
aws cloudformation wait change-set-create-complete \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"

# 3. Review changes in detail (key: Replacement field)
aws cloudformation describe-change-set \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430" \
  --query 'Changes[*].[
    ResourceChange.Action,
    ResourceChange.LogicalResourceId,
    ResourceChange.ResourceType,
    ResourceChange.Replacement,
    ResourceChange.Scope
  ]' \
  --output table

# Sample output:
# Action   | LogicalId          | Type                    | Replacement | Scope
# ---------|--------------------|-----------------------------|-------------|----------
# Modify   | WebServer          | AWS::EC2::Instance          | False       | [Properties]
# Modify   | DBInstance         | AWS::RDS::DBInstance        | Conditional | [Properties]
# Add      | NewSecurityGroup   | AWS::EC2::SecurityGroup     | N/A         | []
# Remove   | OldCacheCluster    | AWS::ElastiCache::...       | N/A         | []

# 4a. If no Replacement=True, execute
aws cloudformation execute-change-set \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"

# 4b. If risky changes exist, discard
aws cloudformation delete-change-set \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"
```

> 🔍 **Deeper Dive**: When Change Set shows "Replacement: Conditional," AWS can't determine pre-runtime whether change causes Replacement. E.g., RDS `DBSubnetGroupName` change: in-place if new group in same VPC, Replacement if different VPC. EC2 `InstanceType` change: False if current supports EBS optimization consistently, Conditional if EBS support differs. Conditional → check AWS docs directly to understand runtime conditions. Production Conditional → always consider safer strategies (pre-snapshot etc).

**CI/CD Pipeline Change Set Automation:**

```bash
# Auto-script: stop pipeline if Replacement=True found
STACK_NAME="my-prod-app"
CHANGE_SET_NAME="pipeline-$(date +%Y%m%d-%H%M%S)"

# Create Change Set
aws cloudformation create-change-set \
  --stack-name $STACK_NAME \
  --template-body file://new-template.yaml \
  --change-set-name $CHANGE_SET_NAME \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation wait change-set-create-complete \
  --stack-name $STACK_NAME \
  --change-set-name $CHANGE_SET_NAME

# Check for Replacement=True or Conditional resources
RISKY_RESOURCES=$(aws cloudformation describe-change-set \
  --stack-name $STACK_NAME \
  --change-set-name $CHANGE_SET_NAME \
  --query 'Changes[?ResourceChange.Replacement==`True` || ResourceChange.Replacement==`Conditional`].[ResourceChange.LogicalResourceId, ResourceChange.Replacement]' \
  --output text)

if [ -n "$RISKY_RESOURCES" ]; then
  echo "WARNING: Following resources may be replaced:"
  echo "$RISKY_RESOURCES"
  echo "Requires manual review and approval"
  aws cloudformation delete-change-set \
    --stack-name $STACK_NAME \
    --change-set-name $CHANGE_SET_NAME
  exit 1
fi

# Safe—execute automatically
aws cloudformation execute-change-set \
  --stack-name $STACK_NAME \
  --change-set-name $CHANGE_SET_NAME

aws cloudformation wait stack-update-complete --stack-name $STACK_NAME
echo "Deployment complete"
```

> 💡 **Related Theory**: Change Set design applies software engineering's "Preview Before Commit" principle to infrastructure. Like Git's `git diff --staged` showing changes before commit, Change Set shows infrastructure change diff. Both offer "human review opportunity before execution." Distributed systems theory calls this "Two-Phase Commit simplified": Phase 1 (Prepare = Change Set creation) establishes plan, Phase 2 (Commit = execute-change-set) implements. CloudFormation inserts human review: "Human-in-the-loop 2PC."

## Drift Detection: "Find the Gap Between Code and Reality"

Operations inevitably diverge code from reality. Emergency patches might add security group rules manually, someone changed instance type via console, tags added outside CloudFormation. Drift Detection catches these gaps.

**Drift Detection Mechanism:**

CloudFormation queries each Stack resource's actual AWS config via API, compares with Template's desired state (Expected).

| Drift Status | Meaning | Operator Action |
|------------|------|-------------|
| `IN_SYNC` | Template matches reality | Normal |
| `MODIFIED` | Exists in Template but properties changed | Review changes, correct via CFn or update Template |
| `DELETED` | In Template but actual resource deleted | Redeploy stack to restore |
| `NOT_CHECKED` | Drift Detection unsupported for this resource type | Manual verification needed |

**Run Drift Detection:**

```bash
# Start Drift Detection (async)
DRIFT_ID=$(aws cloudformation detect-stack-drift \
  --stack-name my-prod-app \
  --query 'StackDriftDetectionId' \
  --output text)

echo "Drift Detection ID: $DRIFT_ID"

# Wait for completion (typically tens seconds to minutes)
while true; do
  STATUS=$(aws cloudformation describe-stack-drift-detection-status \
    --stack-drift-detection-id $DRIFT_ID \
    --query 'DetectionStatus' --output text)
  STACK_DRIFT=$(aws cloudformation describe-stack-drift-detection-status \
    --stack-drift-detection-id $DRIFT_ID \
    --query 'StackDriftStatus' --output text)
  echo "Detection: $STATUS | Stack: $STACK_DRIFT"
  if [ "$STATUS" = "DETECTION_COMPLETE" ] || [ "$STATUS" = "DETECTION_FAILED" ]; then
    break
  fi
  sleep 5
done

# Query drifted resources
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-prod-app \
  --stack-resource-drift-status-filters MODIFIED DELETED \
  --query 'StackResourceDrifts[*].[LogicalResourceId,ResourceType,StackResourceDriftStatus]' \
  --output table

# Detailed drift info (which properties changed)
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-prod-app \
  --stack-resource-drift-status-filters MODIFIED \
  --query 'StackResourceDrifts[*].{Resource:LogicalResourceId,Diffs:PropertyDifferences}' \
  --output json
```

**Parse Detailed Drift Output:**

```json
[
  {
    "Resource": "WebServerSG",
    "Diffs": [
      {
        "PropertyPath": "/SecurityGroupIngress/2",
        "ExpectedValue": null,
        "ActualValue": "{\"CidrIp\":\"0.0.0.0/0\",\"FromPort\":22,\"IpProtocol\":\"tcp\",\"ToPort\":22}",
        "DifferenceType": "ADD"
      }
    ]
  }
]
```
Shows `WebServerSG` has SSH rule (port 22, fully open) not in Template.

**Drift Detection Limitations:**

1. Not all resource types supported (check AWS docs for "Resources supporting import and drift detection")
2. Can't detect resources added **outside** CloudFormation (Stack doesn't know them)
3. Only detects deletions/modifications (external changes to Stack-managed resources)
4. Async operation; must wait for completion
5. Large Stacks (100+ resources) may take minutes

> 📚 **Case Study**: 2023, fintech company G: developer added `0.0.0.0/0:22` to CFn-managed security group during emergency. Outage fixed but rule remained 3 months. External scanner found it; data privacy law violation possible. Daily automated Drift Detection would've caught same-day, immediate fix. Later built EventBridge Scheduled Rule + Lambda + Drift Detection + SNS automation. Satisfies NIST SP 800-53 CM-3 (Configuration Change Control) and CM-6 (Configuration Settings).

**Automated Drift Check Pattern (EventBridge + Lambda):**

```python
# Lambda: daily drift check + SNS notification
import boto3, time

def handler(event, context):
    cfn = boto3.client('cloudformation')
    sns = boto3.client('sns')
    drifted_stacks = []
    
    paginator = cfn.get_paginator('describe_stacks')
    
    for page in paginator.paginate():
        for stack in page['Stacks']:
            if stack['StackStatus'] not in ['CREATE_COMPLETE', 'UPDATE_COMPLETE']:
                continue
            
            resp = cfn.detect_stack_drift(StackName=stack['StackName'])
            detection_id = resp['StackDriftDetectionId']
            
            for _ in range(12):
                status_resp = cfn.describe_stack_drift_detection_status(
                    StackDriftDetectionId=detection_id
                )
                if status_resp['DetectionStatus'] == 'DETECTION_COMPLETE':
                    if status_resp['StackDriftStatus'] == 'DRIFTED':
                        drifted_stacks.append({
                            'stack': stack['StackName'],
                            'drifted_count': status_resp.get('DriftedStackResourceCount', 0)
                        })
                    break
                time.sleep(5)
    
    if drifted_stacks:
        message = "CloudFormation Drift Detected:\n\n"
        for item in drifted_stacks:
            message += f"- {item['stack']}: {item['drifted_count']} drifted resources\n"
        
        sns.publish(
            TopicArn='arn:aws:sns:ap-northeast-2:123456789012:ops-alerts',
            Message=message,
            Subject='[Alert] CloudFormation Drift Detected'
        )
    
    return {'drifted_stacks': len(drifted_stacks)}
```

> 🔍 **Deeper Dive**: Drift Detection's fundamental issue: need direction reversal from "code → reality" to "reality → code." Detected drift has two strategies: (1) **Revert**: restore actual resources to Template state (redeploy). Manual changes were mistakes. (2) **Adopt**: update Template to actual state. Manual changes were intentional, correct. Choose based on business judgment. Combined with AWS Config and CloudTrail, both "who changed when" and "what changed how" visible.

## Rollback Trigger: "10-Minute Safety Window Post-Deployment"

Rollback Trigger monitors specified CloudWatch Alarms for duration after Stack update completes; if alarm fires, auto-reverts to previous state.

**Design Rationale:**

Netflix's "Fail Fast, Recover Faster" principle inspired this. Martin Fowler's 2010 "Canary Release": "if new version causes problems, revert immediately." Implemented at CloudFormation level. Differs from Blue-Green: doesn't maintain dual infrastructure; instead ensures "post-change monitoring window" for safety.

**Configure Rollback Trigger:**

```bash
# Create CloudWatch Alarm first
aws cloudwatch put-metric-alarm \
  --alarm-name "HighErrorRate-ProdALB" \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --period 60 \
  --statistic Sum \
  --threshold 10 \
  --dimensions Name=LoadBalancer,Value=app/my-alb/abc123 \
  --alarm-actions arn:aws:sns:ap-northeast-2:123456789012:ops-alerts \
  --treat-missing-data notBreaching  # No data → normal

# Update Stack with Rollback Trigger
aws cloudformation update-stack \
  --stack-name my-prod-app \
  --template-body file://new-template.yaml \
  --rollback-configuration '{
    "MonitoringTimeInMinutes": 10,
    "RollbackTriggers": [
      {
        "Arn": "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:HighErrorRate-ProdALB",
        "Type": "AWS::CloudWatch::Alarm"
      },
      {
        "Arn": "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:HighLatencyP99",
        "Type": "AWS::CloudWatch::Alarm"
      }
    ]
  }'

# Use with Change Set (recommended)
aws cloudformation execute-change-set \
  --stack-name my-prod-app \
  --change-set-name my-change-set \
  --disable-rollback false  # Default, explicit
```

**Rollback Trigger Scenario:**

```
Time 0:00 → update-stack (with RollbackTriggers)
Time 0:05 → UPDATE_COMPLETE (resources changed)
            │
            └── [MonitoringTimeInMinutes = 10 min countdown]
                      │
                      CloudFormation polls alarms for 10 min
                      │
Time 0:08 → HighErrorRate-ProdALB transitions to ALARM!
            (5xx errors 10+/min)
                      │
Time 0:08 → UPDATE_ROLLBACK_IN_PROGRESS auto-starts
                      │
Time 0:12 → UPDATE_ROLLBACK_COMPLETE (prior state restored)
            SNS notified

─────────────────────────────────────────

vs. normal deployment:

Time 0:00 → update-stack
Time 0:05 → UPDATE_COMPLETE
Time 0:15 → MonitoringTime 10 min complete, no alarm
            UPDATE_COMPLETE confirmed (monitoring ends)
            → Later alarms don't auto-rollback (manual action needed)
```

**Alarm Selection Principles:**

| Alarm Type | Why Recommended | Config Tips |
|----------|----------|---------|
| `HTTPCode_Target_5XX_Count` | Immediate response, direct outage indicator | threshold: 10-50/min, period: 60s |
| `TargetResponseTime` P99 | Early performance degradation detection | threshold: 2-5s, evaluation: 3x |
| `UnhealthyHostCount` | Direct instance anomaly | threshold: >0, treat-missing-data: missing |
| `Lambda Errors` | Lambda-based app error detection | threshold: 1-5%, period: 60s |
| Custom Metric | Business KPI (order success rate etc) | Advanced pattern, separate metric publish |

> ⚠️ **Pitfall**: Rollback Trigger monitors **after** update complete only. No alarm monitoring **during** update. After `MonitoringTimeInMinutes` passes, later alarms don't trigger rollback. Max 5 triggers; any one ALARM state starts rollback. Alarm `treat-missing-data: breaching` can trigger rollback on missing data post-deployment. **Must** use `notBreaching`.

> 💡 **Related Theory**: Rollback Trigger's "monitor then confirm" pattern mirrors control theory's **feedback control loop**. Measure system output (service metrics), compare desired state (normal error rate), act on deviation (rollback). Traces to 1940s Norbert Wiener's Cybernetics. Modern software sees same pattern: Kubernetes HPA (Horizontal Pod Autoscaler), AWS Auto Scaling Step Scaling Policy.

## Termination Protection: Prevent Accidental Deletion

```bash
# Enable (prod Stacks mandatory)
aws cloudformation update-termination-protection \
  --stack-name my-prod-app \
  --enable-termination-protection

# Attempt delete → error
aws cloudformation delete-stack --stack-name my-prod-app
# Error: "Stack [my-prod-app] cannot be deleted while TerminationProtection is enabled"

# Disable first to delete
aws cloudformation update-termination-protection \
  --stack-name my-prod-app \
  --no-enable-termination-protection

# Now deletable
aws cloudformation delete-stack --stack-name my-prod-app
```

**Enable at Creation (recommended):**

```bash
aws cloudformation create-stack \
  --stack-name my-prod-app \
  --template-body file://template.yaml \
  --enable-termination-protection \
  --capabilities CAPABILITY_NAMED_IAM
```

## Termination Protection vs Stack Policy vs IAM Policy Comparison

| Protection | Target | Scope | Bypass | Primary Use |
|----------|--------|-------|--------|-------------|
| **Termination Protection** | Stack deletion | Stack level | Disable then delete | Prevent accidental deletion |
| **Stack Policy** | Update-time resource modify/delete | Resource level | Temp override policy | Prevent critical resource changes |
| **IAM Policy** | CloudFormation API calls | User/role level | Grant permission | User-level access control |
| **SCP** | Org-wide API calls | Account level | Admin-only change | Org-wide governance |

Combined hierarchically: stronger protection.

## Resource Import: Bring Existing Resources Under IaC

Bring manually-created resources into CloudFormation Stack without deletion. "Absorb Shadow IT into IaC."

```bash
# Prep Import Template (DeletionPolicy: Retain required!)
cat > import-template.yaml << 'EOF'
Resources:
  ExistingBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain     # Must Retain - import fails without
    Properties:
      BucketName: my-existing-bucket  # Must match actual name exactly
  ExistingRDSInstance:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Retain
    Properties:
      DBInstanceIdentifier: my-existing-db
      # Include other required attributes matching actual resource
EOF

# Create Import Change Set
aws cloudformation create-change-set \
  --stack-name import-stack \
  --change-set-name "import-existing-resources" \
  --change-set-type IMPORT \
  --resources-to-import '[
    {
      "ResourceType": "AWS::S3::Bucket",
      "LogicalResourceId": "ExistingBucket",
      "ResourceIdentifier": {"BucketName": "my-existing-bucket"}
    },
    {
      "ResourceType": "AWS::RDS::DBInstance",
      "LogicalResourceId": "ExistingRDSInstance",
      "ResourceIdentifier": {"DBInstanceIdentifier": "my-existing-db"}
    }
  ]' \
  --template-body file://import-template.yaml

# Review then execute
aws cloudformation execute-change-set \
  --stack-name import-stack \
  --change-set-name "import-existing-resources"
```

**Resource Import Caveats:**
- Template resource must have `DeletionPolicy: Retain` or import fails
- Run Drift Detection immediately post-import to verify Template matches reality
- Template properties must match actual resource or appear MODIFIED in Drift Detection

> 📚 **Case Study**: 2024, manufacturing company H converted 3-year manually-built infrastructure (50 EC2s, 12 RDS, 3 VPCs) to IaC. Chose Resource Import instead of "delete and recreate." 7-week phased import; Drift Detection verified Template accuracy post-import. EC2 replacement time reduced hours (manual) to 15 min (CFn auto). Lesson: pre-import run `cfn-schema validate` on each resource's required attributes.

## CloudFormation Guard: Template Policy Validation (Policy as Code)

CFn Guard validates Templates comply with org policies pre-deployment. Auto-check "public S3 bucket blocked," "unencrypted EBS blocked."

```bash
# Install Guard
brew install cloudformation-guard  # macOS
# Or
cargo install cfn-guard

# Write policy file
cat > security-rules.guard << 'EOF'
# S3 buckets must have encryption
rule s3_bucket_encryption {
  AWS::S3::Bucket {
    Properties.BucketEncryption exists
    Properties.BucketEncryption.ServerSideEncryptionConfiguration[*].ServerSideEncryptionByDefault.SSEAlgorithm in ["aws:kms", "AES256"]
  }
}

# EBS volumes must be encrypted
rule ebs_encrypted {
  AWS::EC2::Volume {
    Properties.Encrypted == true
  }
}

# RDS MultiAZ (prod assumption)
rule rds_multiaz when %env == "prod" {
  AWS::RDS::DBInstance {
    Properties.MultiAZ == true
  }
}

# S3 public block required
rule s3_block_public_access {
  AWS::S3::Bucket {
    Properties.PublicAccessBlockConfiguration.BlockPublicAcls == true
    Properties.PublicAccessBlockConfiguration.BlockPublicPolicy == true
    Properties.PublicAccessBlockConfiguration.IgnorePublicAcls == true
    Properties.PublicAccessBlockConfiguration.RestrictPublicBuckets == true
  }
}
EOF

# Validate Template
cfn-guard validate \
  --data template.yaml \
  --rules security-rules.guard

# CI/CD integration
if ! cfn-guard validate --data template.yaml --rules security-rules.guard; then
  echo "Policy violation! Deployment stopped"
  exit 1
fi
```

> 💡 **Related Theory**: CFn Guard implements "Policy as Code" pattern. Open Policy Agent (OPA), HashiCorp Sentinel, Kubernetes OPA Gatekeeper are similar tools. Core: express policy as executable code, not human docs/procedures. SOC2, PCI-DSS, ISO 27001 requirements become CFn Guard rules; pipeline auto-validates compliance. AWS publishes official Guard rule sets (PCI-DSS, HIPAA, NIST SP 800-53) on GitHub.

## Complete Safe Deployment Pattern

```
CFn Safe Deployment Pipeline (3 Pillars Integrated)
============================================================

Code Repository
    │ PR merge
    ▼
[cfn-lint] ─────────────── Syntax/type validation
    │ Pass
[cfn-guard] ──────────────── Policy validation (encryption, public settings)
    │ Pass
[create-change-set] ─────── Check for Replacement
    │ Replacement=True? ──── Yes → Pipeline stop, manual review
    │ No
[execute-change-set] ────── Actual deployment
+ RollbackConfiguration
  MonitoringTimeInMinutes: 10
  Triggers: [5xx alarm, P99 latency alarm]
    │
    UPDATE_COMPLETE ─────── Monitoring window starts (10 min)
    │
    ├── Alarm fires ───────── Auto-rollback → SNS notified
    └── Normal ───────────── Deployment confirmed

─────────────────────────────────────────────────

Post-Deployment Check (daily auto):

[detect-stack-drift] ─────── Runs daily 08:00 UTC
    │
    ├── MODIFIED/DELETED ─── SNS → operator review
    │                        (Revert or update Template)
    └── IN_SYNC ──────────── Normal, logged
```

## 📝 Practice Questions

**Question 1.** An operator wants to update the RDS instance class in a CloudFormation Stack from `db.t3.medium` to `db.r5.large`. What is the best way to verify that this is safe with no data loss?

A) Run `update-stack` and monitor the events
B) Change the instance class directly in the RDS console
C) Create a Change Set and check the `Replacement` field in `describe-change-set`. `False` means safe; `True` means the resource will be recreated and data may be lost
D) Take a snapshot first, then run `update-stack`

**Answer: C**
Explanation: This is exactly the core purpose of a Change Set. After `create-change-set`, check each resource's `Replacement` field with `describe-change-set`. Changing the RDS instance class is normally `Replacement: False` (an in-place update), but it can become `True` when changed together with properties such as Multi-AZ, engine version, or DB Subnet Group. Running update-stack without checking in advance (A) can cause unexpected data loss.

---

**Question 2.** Someone added a `0.0.0.0/0:22` rule in the console to a security group managed by CFn. Which tool can automatically detect this change?

A) Search the logs with CloudWatch Logs Insights
B) Look for the `AuthorizeSecurityGroupIngress` event in CloudTrail
C) Run Drift Detection and check whether the security group resource is shown as `MODIFIED`
D) Enable the AWS Config `restricted-ssh` Config Rule

**Answer: C**
Explanation: Drift Detection compares the resource state defined in the CFn Template with the actual state. If an SG rule that is not in the Template was added, it is detected as `MODIFIED`. CloudTrail (B) can tell you who added it and when, but it does not show drift in the current state. The AWS Config `restricted-ssh` Rule in D also detects open SSH, but it is Drift Detection that detects drift against CFn-managed resources. In real operations, the two are used together.

---

**Question 3.** You want the Stack to automatically revert to its previous state if the HTTP 5xx error rate spikes after a Stack update. What configuration is needed?

A) Monitor a CloudWatch Alarm with a Lambda function and call the `update-stack` API in reverse
B) Integrate CodeDeploy with CloudFormation
C) When running `update-stack` or `execute-change-set`, set the CloudWatch Alarm ARN and `MonitoringTimeInMinutes` in `--rollback-configuration`
D) Enable the "Auto Rollback" checkbox in the CloudFormation console

**Answer: C**
Explanation: Rollback Configuration is the exact feature. Specify the CloudWatch Alarm ARNs in the `RollbackTriggers` array and set `MonitoringTimeInMinutes` (1 to 180 minutes). If any of the specified alarms enters the ALARM state during the monitoring period after the update completes, `UPDATE_ROLLBACK_IN_PROGRESS` starts automatically. You can specify up to 5 alarms as triggers.

---

**Question 4.** You want to keep 3 S3 buckets that were created manually in the console under the management of an existing CloudFormation Stack without deleting them. What should you do?

A) Add the buckets with a Stack Policy
B) Add the bucket resources to the Template and run `update-stack`
C) Create a Change Set with `change-set-type: IMPORT` and specify a `ResourceIdentifier` with the actual name of each bucket. The corresponding resources in the Template require `DeletionPolicy: Retain`
D) It is not possible because the resources were created directly

**Answer: C**
Explanation: The Resource Import feature is exactly for this purpose. Create a Change Set with `ChangeSetType=IMPORT` and map each existing resource to a Logical ID in the Template. Important: the corresponding resources in the Template must have `DeletionPolicy: Retain` set (the import is rejected without it). B creates new buckets rather than using the existing ones.

---

**Question 5.** The Stack is in the `UPDATE_ROLLBACK_FAILED` state. You determined that the cause of the rollback failure is a dependency problem with a specific resource (LogicalId: `LegacyDatabase`). How do you recover?

A) Run `delete-stack`
B) Try a new change with `create-change-set`
C) Run `continue-update-rollback` and add `LegacyDatabase` to `--resources-to-skip`
D) Contact AWS Support

**Answer: C**
Explanation: The `UPDATE_ROLLBACK_FAILED` state can be recovered with the `continue-update-rollback` command. The `--resources-to-skip` option lets you skip the problematic resource and complete the rest of the rollback. Skipped resources must be cleaned up manually afterward. `delete-stack` (A) is likely to fail, and a new Change Set (B) is not possible in this state.

---

**Question 6.** What value should `treat-missing-data` be set to for a CloudWatch Alarm used as a Rollback Trigger, to avoid unnecessary rollbacks when there is no metric data right after deployment?

A) `breaching` - treat missing data as ALARM
B) `notBreaching` - treat missing data as OK
C) `ignore` - keep the previous state when data is missing
D) `missing` - treat missing data as INSUFFICIENT_DATA

**Answer: B**
Explanation: An alarm used for a Rollback Trigger should be set to `treat-missing-data: notBreaching`. Right after deployment, metric data may not have been collected yet, so the alarm can be in the INSUFFICIENT_DATA state. If set to `breaching`, missing data is treated as ALARM, causing an unnecessary rollback even though the deployment is healthy. If set to `notBreaching`, missing data is treated as OK, so a rollback occurs only when there is a real problem.

---
