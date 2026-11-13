# Day 2 - Change Set, Drift Detection, Rollback Trigger: The Three Pillars of Safe CFn Operations

In January 2021, a major Fastly CDN outage occurred. The cause was that during a software deployment, a configuration change interacted in an unexpected way and the CDN service stopped responding as a whole. Tens of thousands of sites, including GitHub, Twitch, Amazon, The Guardian, and the Financial Times, went down for about 49 minutes. In its post-incident report, Fastly's CEO said that "changes were not sufficiently validated before deployment."

CloudFormation has three tools to prevent incidents like this. **Change Set** checks changes before deployment as a dry-run, **Drift Detection** detects the gap between reality and code caused by manual changes, and **Rollback Trigger** automatically reverts to the previous state if a service anomaly is detected after deployment. The three tools each cover a time window: before deployment (Change Set), ongoing operations (Drift Detection), and after deployment (Rollback Trigger).

## Change Set: "Look First, Then Execute"

If you are an operator who has used Terraform, you are familiar with `terraform plan`. Change Set is CloudFormation's `terraform plan`. `update-stack` starts changes immediately, but a Change Set shows in advance "which resources will change and how."

**Internal behavior of a Change Set:**

1. Compare the current stack's template with the new template
2. Calculate the required Action (Add/Modify/Remove) for each resource
3. For Modify, analyze whether the change triggers a Replacement (recreation)
4. Return only the plan without touching actual resources

**Criteria for judging Replacement:**

AWS documents whether each resource property can be changed. If a property says "Update requires: Replacement," the resource is recreated when you change that property.

| Replacement value | Meaning | Operator response |
|----------------|------|-------------|
| `True` | Always recreated. The existing resource is deleted and a new one is created | Data loss risk, checking UpdateReplacePolicy is mandatory |
| `False` | In-place update. Only the property is changed on the existing resource | Safe. Can be executed immediately |
| `Conditional` | Decided at runtime depending on other property values | Additional checking needed, approach conservatively |
| `N/A` | Not applicable to Add/Remove operations | If adding, a new resource is created; if Remove, note that it will be deleted |

**Property changes that often trigger Replacement:**

| Resource type | Changed property | Replacement |
|-------------|-----------|-------------|
| `AWS::RDS::DBInstance` | `MultiAZ` false→true | True |
| `AWS::RDS::DBInstance` | `DBInstanceIdentifier` | True |
| `AWS::S3::Bucket` | `BucketName` | True |
| `AWS::EC2::Instance` | `ImageId` (AMI) | True |
| `AWS::DynamoDB::Table` | `TableName` | True |
| `AWS::ElastiCache::ReplicationGroup` | `ClusterMode` | True |
| `AWS::Lambda::Function` | `FunctionName` | True |
| `AWS::RDS::DBInstance` | `DBInstanceClass` (mostly) | False |
| `AWS::EC2::SecurityGroup` | Adding `SecurityGroupIngress` | False |
| `AWS::EC2::Instance` | `InstanceType` (when EBS optimization is the same) | Conditional |

**Practical Change Set workflow:**

```bash
# 1. Create the Change Set (no actual change)
aws cloudformation create-change-set \
  --stack-name my-prod-app \
  --template-body file://new-template.yaml \
  --change-set-name "release-2.1-$(date +%Y%m%d-%H%M)" \
  --parameters ParameterKey=AppVersion,ParameterValue=2.1 \
  --capabilities CAPABILITY_NAMED_IAM

# 2. Wait until the Change Set status becomes CREATE_COMPLETE
aws cloudformation wait change-set-create-complete \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"

# 3. Check the change details (key: the Replacement field)
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

# Example output:
# Action   | LogicalId          | Type                    | Replacement | Scope
# ---------|--------------------|-----------------------------|-------------|----------
# Modify   | WebServer          | AWS::EC2::Instance          | False       | [Properties]
# Modify   | DBInstance         | AWS::RDS::DBInstance        | Conditional | [Properties]
# Add      | NewSecurityGroup   | AWS::EC2::SecurityGroup     | N/A         | []
# Remove   | OldCacheCluster    | AWS::ElastiCache::...       | N/A         | []

# 4a. If there is no Replacement=True, execute
aws cloudformation execute-change-set \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"

# 4b. If there are risky changes, discard
aws cloudformation delete-change-set \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"
```

> 🔍 **Going Deeper**: When a Change Set shows "Replacement: Conditional," it means AWS cannot know before runtime whether the change will trigger a Replacement. For example, if you change RDS's `DBSubnetGroupName`, an in-place update is possible if the new subnet group is in the same VPC as the existing DB, but a Replacement is needed if it is in a different VPC. Changing an EC2 `InstanceType` is also False if the current instance supports EBS optimization, but can be Conditional if support differs. When you encounter Conditional, you must read that resource's AWS documentation directly to understand the runtime condition. In a production environment, when Conditional appears, you should always consider a safer strategy (such as creating a snapshot first).

**Automating Change Sets in a CI/CD pipeline:**

```bash
# Automation script: stop the pipeline if there is Replacement=True
STACK_NAME="my-prod-app"
CHANGE_SET_NAME="pipeline-$(date +%Y%m%d-%H%M%S)"

# Create the Change Set
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
  echo "⚠️  WARNING: The following resources may be replaced:"
  echo "$RISKY_RESOURCES"
  echo "Manual review and approval are required."
  # Delete the Change Set (not executed)
  aws cloudformation delete-change-set \
    --stack-name $STACK_NAME \
    --change-set-name $CHANGE_SET_NAME
  exit 1
fi

# If safe, execute automatically
aws cloudformation execute-change-set \
  --stack-name $STACK_NAME \
  --change-set-name $CHANGE_SET_NAME

aws cloudformation wait stack-update-complete --stack-name $STACK_NAME
echo "Deployment complete"
```

The design of Change Set applies the software engineering principle "Preview Before Commit" to infrastructure. Just as Git's `git diff --staged` shows the changes before a commit, Change Set shows a diff of the infrastructure change. Both are the same in that they "execute after giving a human a chance to review." In distributed systems theory, this can be seen as a "simplification of Two-Phase Commit": the change plan is established in Phase 1 (Prepare = creating the Change Set), and actually applied in Phase 2 (Commit = execute-change-set). CloudFormation's Change Set is a "Human-in-the-loop 2PC" with human review inserted in the middle.

## Drift Detection: "Find the Gap Between Code and Reality"

During operations, code and reality inevitably diverge. During an emergency incident response someone may have added a rule directly to a security group, someone may have changed an instance type in the console, or a tag may have been added outside CloudFormation. Drift Detection detects such gaps.

**How Drift Detection works:**

CloudFormation queries the current actual resource settings for each stack resource through AWS APIs and compares them with the desired state (Expected) defined in the template.

| Drift status | Meaning | Operator action |
|------------|------|-------------|
| `IN_SYNC` | Template and actual state match | Normal |
| `MODIFIED` | In the template but some properties were changed | Check the changed properties, then correct via CFn or update the template |
| `DELETED` | In the template but the actual resource was deleted | Redeploy the stack to restore the resource |
| `NOT_CHECKED` | Drift Detection does not support that resource type | Manual checking needed |

**Running Drift Detection:**

```bash
# Start Drift Detection (asynchronous)
DRIFT_ID=$(aws cloudformation detect-stack-drift \
  --stack-name my-prod-app \
  --query 'StackDriftDetectionId' \
  --output text)

echo "Drift Detection ID: $DRIFT_ID"

# Wait for completion (usually tens of seconds to a few minutes)
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

# List resources that have drift
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-prod-app \
  --stack-resource-drift-status-filters MODIFIED DELETED \
  --query 'StackResourceDrifts[*].[LogicalResourceId,ResourceType,StackResourceDriftStatus]' \
  --output table

# Detailed drift for a specific resource (which properties changed)
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-prod-app \
  --stack-resource-drift-status-filters MODIFIED \
  --query 'StackResourceDrifts[*].{Resource:LogicalResourceId,Diffs:PropertyDifferences}' \
  --output json
```

**Interpreting detailed Drift output:**

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
This output shows that an SSH (port 22, open to everyone) rule that is not in the template was added to the `WebServerSG` security group.

**Drift Detection limitations:**

1. It does not support all resource types (supported list: "Resources that support import and drift detection operations" in the AWS documentation)
2. It cannot detect resources **added outside** CloudFormation (resources the Stack doesn't know about)
3. It can only detect deletions and modifications (only external changes to Stack-managed resources)
4. It is an asynchronous operation, so you need to wait for completion
5. For large stacks (100+ resources), Drift Detection can take several minutes

As a hypothetical case, at a fintech company G in 2023, a developer added a `0.0.0.0/0:22` (SSH open to everyone) rule to a CFn-managed security group during an emergency incident response. The incident was resolved, but this rule remained for 3 months. By the time an external vulnerability scanner found it, there was already a possible violation of privacy law. If Drift Detection had been running automatically every day, it would have been detected the same day and fixed immediately. After this incident, they built an automation pipeline of EventBridge Scheduled Rule + Lambda + Drift Detection + SNS notification. This automation satisfies the requirements of NIST SP 800-53 CM-3 (Configuration Change Control) and CM-6 (Configuration Settings).

**Automated drift check pattern (EventBridge + Lambda):**

```python
# Lambda function: check drift daily and send an SNS alert
import boto3
import time

def handler(event, context):
    cfn = boto3.client('cloudformation')
    sns = boto3.client('sns')
    
    # List production Stacks (filter by prod tag)
    paginator = cfn.get_paginator('describe_stacks')
    drifted_stacks = []
    
    for page in paginator.paginate():
        for stack in page['Stacks']:
            if stack['StackStatus'] not in ['CREATE_COMPLETE', 'UPDATE_COMPLETE']:
                continue
            
            # Start Drift Detection
            resp = cfn.detect_stack_drift(StackName=stack['StackName'])
            detection_id = resp['StackDriftDetectionId']
            
            # Wait for completion (up to 60 seconds)
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
        message = "CloudFormation drift detected:\n\n"
        for item in drifted_stacks:
            message += f"- {item['stack']}: {item['drifted_count']} resources drifted\n"
        
        sns.publish(
            TopicArn='arn:aws:sns:ap-northeast-2:123456789012:ops-alerts',
            Message=message,
            Subject='[ALERT] CloudFormation drift detected'
        )
    
    return {'drifted_stacks': len(drifted_stacks)}
```

The fundamental problem of Drift Detection is that it requires reversing the direction from "code → reality" to "reality → code." When drift is detected, there are two strategies: (1) **Revert**: return the actual resource to the template state (redeploy). For when the emergency manual change was wrong, (2) **Adopt**: update the template to the actual state. For when the manual change was intentional and correct. Which strategy to choose requires a business judgment. Using AWS Config and Drift Detection together lets you understand both "who changed it and when (linked to CloudTrail)" and "what changed and how (Drift)."

## Rollback Trigger: "The Safety Standard Is 10 Minutes After Deployment"

Rollback Trigger is a feature that, after a stack update completes, monitors CloudWatch Alarms for a specified time and automatically rolls back to the previous state if an alarm fires.

**Design background:**

It is a pattern inspired by Netflix's "Fail Fast, Recover Faster" principle. It implements at the CloudFormation level the "Canary Release" concept that Martin Fowler defined in 2010, namely "if the new version causes problems, revert immediately." The difference from Blue/Green deployment is that it doesn't maintain two sets of infrastructure; instead it secures safety through a "post-change monitoring period."

**Configuring Rollback Trigger:**

```bash
# Create the CloudWatch Alarm first
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
  --treat-missing-data notBreaching  # Treat as normal if there is no data

# Update the Stack with Rollback Triggers
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

# Use together with a Change Set (recommended)
aws cloudformation execute-change-set \
  --stack-name my-prod-app \
  --change-set-name my-change-set \
  --disable-rollback false  # Default value, specified explicitly
```

**Rollback Trigger operating scenario:**

```
Time 0:00 → run update-stack (with RollbackTriggers configured)
Time 0:05 → UPDATE_COMPLETE (resource changes complete)
            │
            └── [MonitoringTimeInMinutes = 10-minute countdown starts]
                      │
                      │ CloudFormation polls the specified Alarm states for 10 minutes
                      │
Time 0:08 → HighErrorRate-ProdALB alarm switches to ALARM state!
            (5xx errors exceed 10/minute)
                      │
Time 0:08 → UPDATE_ROLLBACK_IN_PROGRESS starts automatically
                      │
Time 0:12 → UPDATE_ROLLBACK_COMPLETE (previous state restored)
            SNS notification to the operator (alarm action)

─────────────────────────────────────────

vs. normal deployment scenario:

Time 0:00 → run update-stack
Time 0:05 → UPDATE_COMPLETE
Time 0:15 → MonitoringTime 10 minutes complete, no alarm fired
            UPDATE_COMPLETE state is finalized (monitoring period ended)
            → No automatic rollback even if an alarm fires afterward (manual response needed)
```

**Principles for choosing Rollback alarms:**

| Alarm type | Why recommended | Configuration tip |
|-----------|-----------|---------|
| `HTTPCode_Target_5XX_Count` | Immediate reaction right after deployment, a direct failure indicator | threshold: 10-50/min, period: 60 seconds |
| `TargetResponseTime` P99 | Early detection of performance degradation | threshold: 2-5 seconds, evaluation: 3 times |
| `UnhealthyHostCount` | Directly detects instance problems | threshold: above 0, treat-missing-data: missing |
| `Lambda Errors` | Error detection for Lambda-based apps | threshold: 1-5%, period: 60 seconds |
| Custom Metric | Business KPIs (order success rate, etc.) | Advanced pattern, requires publishing a separate metric |

> ⚠️ **Pitfall**: The Rollback Trigger monitoring period applies only **after** the update completes. There is no alarm monitoring **during** the update. Also, once `MonitoringTimeInMinutes` passes, alarms that fire afterward do not trigger an automatic rollback. You can configure up to 5 triggers, and if even one goes into ALARM state, the rollback starts. If you set the alarm's `treat-missing-data` to `breaching`, a rollback can start even when there is no metric data right after deployment. Always set it to `notBreaching`.

Rollback Trigger's "finalize after monitoring" pattern is identical to the **Feedback Control Loop** of control theory. It measures the system output (service metrics), compares it with the desired state (normal error rate), and takes a corrective action (rollback) if it deviates. This pattern has its roots in Norbert Wiener's cybernetics theory of the 1940s. In modern software, the same pattern can be seen in the Kubernetes HPA (Horizontal Pod Autoscaler) and AWS Auto Scaling's Step Scaling Policy.

## Termination Protection: Preventing Accidental Deletion

```bash
# Enable Termination Protection (mandatory for prod Stacks)
aws cloudformation update-termination-protection \
  --stack-name my-prod-app \
  --enable-termination-protection

# Attempt deletion → error
aws cloudformation delete-stack --stack-name my-prod-app
# Error: "Stack [my-prod-app] cannot be deleted while TerminationProtection is enabled"

# To delete, first disable protection
aws cloudformation update-termination-protection \
  --stack-name my-prod-app \
  --no-enable-termination-protection

# Now it can be deleted
aws cloudformation delete-stack --stack-name my-prod-app
```

**Enable immediately at creation (recommended):**

```bash
# Enable Termination Protection at Stack creation time
aws cloudformation create-stack \
  --stack-name my-prod-app \
  --template-body file://template.yaml \
  --enable-termination-protection \
  --capabilities CAPABILITY_NAMED_IAM
```

## Comparing Stack Policy vs Termination Protection vs IAM Policy

| Protection mechanism | Protected target | Scope | Bypass method | Main purpose |
|---------------|-----------|-----------|-----------|----------------|
| **Termination Protection** | Deletion of the stack itself | Stack level | Disable protection, then delete | Prevent accidental deletion |
| **Stack Policy** | Modifying/deleting specific resources during updates | Resource level | Temporary override policy | Prevent accidental changes to critical resources |
| **IAM policy** | The CloudFormation API calls themselves | User/role level | Permission must be granted | Human-level access control |
| **Service Control Policy (SCP)** | API calls across the organization | Account level | Changeable only from the management account | Organization-wide governance |

Using the three together in layers gives stronger protection.

## Resource Import: Bringing Existing Resources Under IaC Management

This is a feature for bringing resources created manually in the console into a CloudFormation Stack without deleting them. It is used to "absorb Shadow IT into IaC."

```bash
# Prepare the Template for Import (DeletionPolicy: Retain is required!)
cat > import-template.yaml << 'EOF'
Resources:
  ExistingBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain     # Must be Retain - Import is rejected without it
    Properties:
      BucketName: my-existing-bucket  # Must exactly match the actual bucket name
  ExistingRDSInstance:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Retain
    Properties:
      DBInstanceIdentifier: my-existing-db
      # The other required properties of the actual RDS must also be stated exactly
EOF

# Create the Import Change Set
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

# Execute after review
aws cloudformation execute-change-set \
  --stack-name import-stack \
  --change-set-name "import-existing-resources"
```

**Resource Import cautions:**
- If the resource in the template lacks `DeletionPolicy: Retain`, Import is rejected
- Run Drift Detection right after Import to check whether the template matches the actual state
- If the imported resource's actual properties differ from the template properties, Drift Detection shows MODIFIED

As a hypothetical case, in 2024 a manufacturer H started a project to convert infrastructure it had configured manually in the console for 3 years (50 EC2 instances, 12 RDS databases, 3 VPCs) to IaC. For the conversion strategy, it chose Resource Import instead of "delete and recreate." It performed the Import in stages over a total of 7 weeks, and verified the template accuracy with Drift Detection after Import. After the conversion, EC2 replacement time dropped from several hours (manual) to 15 minutes (CFn automatic). The key lesson: before Import you must understand each resource's required properties with `cfn-schema validate`.

## CFn Guard: Template Policy Validation (Policy as Code)

CFn Guard (AWS CloudFormation Guard) is a DSL-based tool that validates before deployment whether templates comply with the organization's policies. It automatically validates policies such as "block public S3 buckets" and "block unencrypted EBS."

```bash
# Install Guard
brew install cloudformation-guard  # macOS
# or
cargo install cfn-guard

# Write the policy file
cat > security-rules.guard << 'EOF'
# S3 buckets must have encryption configured
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

# RDS must be MultiAZ (assuming the prod environment)
rule rds_multiaz when %env == "prod" {
  AWS::RDS::DBInstance {
    Properties.MultiAZ == true
  }
}

# S3 public block configuration is required
rule s3_block_public_access {
  AWS::S3::Bucket {
    Properties.PublicAccessBlockConfiguration.BlockPublicAcls == true
    Properties.PublicAccessBlockConfiguration.BlockPublicPolicy == true
    Properties.PublicAccessBlockConfiguration.IgnorePublicAcls == true
    Properties.PublicAccessBlockConfiguration.RestrictPublicBuckets == true
  }
}
EOF

# Validate the Template
cfn-guard validate \
  --data template.yaml \
  --rules security-rules.guard

# Integrate into the CI/CD pipeline
if ! cfn-guard validate --data template.yaml --rules security-rules.guard; then
  echo "Policy violation! Deployment aborted"
  exit 1
fi
```

CFn Guard is an implementation of the "Policy as Code" pattern. Open Policy Agent (OPA), HashiCorp Sentinel, and Kubernetes OPA Gatekeeper are tools of the same concept. The core of this pattern is to express policies not as human-readable documents or procedures but as code that machines can execute. If you express compliance requirements such as SOC2, PCI-DSS, and ISO 27001 as CFn Guard rules, they can be validated automatically in the deployment pipeline. AWS publishes official Guard rule sets for PCI-DSS, HIPAA, NIST SP 800-53, and others on GitHub.

## The Full Safe Deployment Pattern

```
CFn safe deployment pipeline (integrating the 3 pillars)
============================================================

Code repository
    │ PR merge
    ▼
[cfn-lint] ─────────────── Syntax/type check
    │ Pass
[cfn-guard] ──────────────── Policy check (encryption, public settings, etc.)
    │ Pass
[create-change-set] ─────── Check for Replacement
    │ Replacement=True? ──── Yes → stop the pipeline, manual review
    │ No
[execute-change-set] ────── Actual deployment
+ RollbackConfiguration
  MonitoringTimeInMinutes: 10
  Triggers: [5xx alarm, P99 latency alarm]
    │
    UPDATE_COMPLETE ─────── Monitoring period starts (10 minutes)
    │
    ├── Alarm fires ────────── Automatic rollback → SNS notification
    └── Normal ──────────────── Deployment finalized

─────────────────────────────────────────────────
Post-deployment check (automatic, daily):

[detect-stack-drift] ─────── Runs daily at 08:00 UTC
    │
    ├── MODIFIED/DELETED ─── SNS alert → operator review
    │                        (Revert or update Template)
    └── IN_SYNC ──────────── Record as normal
```

## 📝 Practice Questions

**Question 1.** An operator wants to update an RDS instance class in a CloudFormation Stack from `db.t3.medium` to `db.r5.large`. What is the best way to confirm it is safe without data loss?

A) Run `update-stack` and monitor the events
B) Change the instance class directly in the RDS console
C) Create a Change Set and check the `Replacement` field in `describe-change-set`. `False` means safe; `True` means recreation, with possible data loss
D) Create a snapshot first and then run `update-stack`

**Answer: C**
Explanation: This is exactly the core purpose of a Change Set. After `create-change-set`, check each resource's `Replacement` field with `describe-change-set`. Changing the RDS instance class is generally `Replacement: False` (in-place update), but it can become `True` when changed together with properties such as Multi-AZ, engine version, or DB Subnet Group. Running update-stack without a prior check (A) can cause unexpected data loss.

---

**Question 2.** Someone added a `0.0.0.0/0:22` rule in the console to a security group the operations team manages with CFn. Which tool can automatically detect this change?

A) Search logs with CloudWatch Logs Insights
B) Find the `AuthorizeSecurityGroupIngress` event in CloudTrail
C) Run Drift Detection and check whether the security group resource is shown as `MODIFIED`
D) Enable AWS Config's `restricted-ssh` Config Rule

**Answer: C**
Explanation: Drift Detection compares the resource state defined in the CFn Template with the actual state. If an SG rule that is not in the Template was added, it is detected as `MODIFIED`. CloudTrail (B) can tell you "who added it and when," but doesn't show drift in the current state. AWS Config's `restricted-ssh` Rule in D also detects SSH exposure, but detecting drift from CFn-managed resources is what Drift Detection does. In real operations, the two are used together.

---

**Question 3.** You want to configure it so that if the HTTP 5xx error rate surges after a Stack update, it automatically reverts to the previous state. What configuration is needed?

A) Monitor the CloudWatch Alarm with a Lambda function and call the `update-stack` API in reverse
B) Integrate CodeDeploy with CloudFormation
C) When running `update-stack` or `execute-change-set`, set the CloudWatch Alarm ARN and `MonitoringTimeInMinutes` in `--rollback-configuration`
D) Enable the "Auto Rollback" checkbox in the CloudFormation console

**Answer: C**
Explanation: Rollback Configuration is the exact feature. Specify CloudWatch Alarm ARNs in the `RollbackTriggers` array and set `MonitoringTimeInMinutes` (1-180 minutes). If any of the specified alarms goes into ALARM state during the monitoring period after the update completes, `UPDATE_ROLLBACK_IN_PROGRESS` starts automatically. You can specify up to 5 alarms as triggers.

---

**Question 4.** You want to put 3 S3 buckets created manually in the console under the management of an existing CloudFormation Stack without deleting them. What should you do?

A) Add the buckets with a Stack Policy
B) Add bucket resources to the Template and run `update-stack`
C) Create a Change Set with `change-set-type: IMPORT` and specify the `ResourceIdentifier` with each bucket's actual name. The corresponding resources in the Template need `DeletionPolicy: Retain`
D) It is impossible because the resources were created directly

**Answer: C**
Explanation: The Resource Import feature is exactly for this purpose. Create a Change Set with `ChangeSetType=IMPORT` and map each existing resource to a Logical ID in the Template. Important: the corresponding resource in the Template must have `DeletionPolicy: Retain` set (import is rejected otherwise). B creates new buckets rather than the existing ones.

---

**Question 5.** The Stack is in `UPDATE_ROLLBACK_FAILED` state. You determined that the cause of the rollback failure is a dependency problem with a specific resource (LogicalId: `LegacyDatabase`). How do you recover?

A) Run `delete-stack`
B) Try a new change with `create-change-set`
C) Run `continue-update-rollback` and add `LegacyDatabase` to `--resources-to-skip`
D) Contact AWS Support

**Answer: C**
Explanation: The `UPDATE_ROLLBACK_FAILED` state can be recovered with the `continue-update-rollback` command. The `--resources-to-skip` option lets you skip the problematic resource and complete the rest of the rollback. Skipped resources must be cleaned up manually after completion. `delete-stack` (A) has a high chance of failing, and a new Change Set (B) is impossible in this state.

---

**Question 6.** What value should the CloudWatch Alarm's `treat-missing-data` be set to in a Rollback Trigger, to prevent an unnecessary rollback when there is no metric data right after deployment?

A) `breaching` - treat as ALARM when there is no data
B) `notBreaching` - treat as OK when there is no data
C) `ignore` - keep the previous state when there is no data
D) `missing` - treat as INSUFFICIENT_DATA when there is no data

**Answer: B**
Explanation: Alarms used for Rollback Triggers should be set to `treat-missing-data: notBreaching`. Right after deployment, metric data may not have been collected yet, which can put the alarm in INSUFFICIENT_DATA state. If set to `breaching`, no data = ALARM, causing an unnecessary rollback even for a normal deployment. If set to `notBreaching`, no data = OK, so rollback occurs only when there is a real anomaly.
