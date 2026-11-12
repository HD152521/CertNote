# Day 4 - Parameter Store, Session Manager, Automation Runbook: SSM Advanced Automation

In July 2019, security researcher Paige Thompson stole over 106 million credit card application records from Capital One. The attack path was this: via an SSRF vulnerability in WAF, she accessed `http://169.254.169.254/latest/meta-data/iam/security-credentials/` to steal EC2's temporary IAM credentials, then used those credentials to extract 30TB of data from 700+ S3 buckets. One of the root causes was **IMDSv1 (metadata access without authentication)**. Today's Session Manager provides a way to access instances securely without SSH keys or IMDSv1, and Parameter Store provides a way to keep credentials out of hardcoded code.

Today we cover the "advanced automation" triple of SSM. Centralize configuration with Parameter Store, replace SSH/RDP with Session Manager, and automate complex operational workflows with Automation Runbook.

## Parameter Store: Centralized Repository for Configuration and Secrets

Parameter Store appears as a simple key-value store, but from an operational perspective plays a crucial role. "Separation of code and configuration" (12-Factor App, Factor III) is a foundational principle of modern applications. Storing DB passwords or API keys in environment variables or config files risks exposing secrets in version control. Parameter Store solves this problem.

**Design Principles for Parameter Hierarchy:**

```
Recommended pattern: /app-name/environment/component/key

Example:
/myapp/prod/database/host
/myapp/prod/database/port
/myapp/prod/database/password     ← SecureString (KMS encrypted)
/myapp/prod/api/stripe-key        ← SecureString
/myapp/prod/feature/new-search    ← String (Feature Flag)
/shared/global/slack-webhook-url  ← String (shared config)
```

Using hierarchical structure enables `GetParametersByPath` to fetch all parameters under a path in one call. A Lambda function or EC2 User Data can load the entire `/myapp/prod/` subtree with a single API call.

**Standard vs Advanced Comparison:**

| Item | Standard | Advanced |
|------|----------|----------|
| Max parameters per account/region | 10,000 | 100,000 |
| Max value size | 4KB | 8KB |
| Parameter Policies | Not supported | Expiration, change notification, NoChange notification |
| Throughput (TPS) | 40 TPS (default) | 1,000 TPS (additional charge) |
| Cost | Free | $0.05/parameter/month + API charges |

**Parameter Policies (Advanced tier only):**

```bash
# Create Advanced parameter + expiration policy
aws ssm put-parameter \
  --name "/myapp/prod/temp-access-token" \
  --value "$(openssl rand -base64 32)" \
  --type SecureString \
  --key-id "alias/myapp-key" \
  --tier Advanced \
  --policies '[
    {
      "Type": "Expiration",
      "Version": "1.0",
      "Attributes": {
        "Timestamp": "2026-12-31T00:00:00Z"
      }
    },
    {
      "Type": "ExpirationNotification",
      "Version": "1.0",
      "Attributes": {
        "Before": "14",
        "Unit": "days"
      }
    },
    {
      "Type": "NoChangeNotification",
      "Version": "1.0",
      "Attributes": {
        "After": "30",
        "Unit": "days"
      }
    }
  ]'
```

- `Expiration`: Auto-delete parameter on specified date (useful for temporary credential management)
- `ExpirationNotification`: Send EventBridge → SNS → operator alert N days before expiration
- `NoChangeNotification`: Alert if value unchanged for N days (detect forgotten parameters)

> 💡 **Related Theory**: Parameter Store's hierarchical structure and Policy concept resemble Linux filesystem inode structure. Files (parameters) carry metadata (Policies), and directories (path hierarchies) provide logical grouping. Like POSIX's "everything is a file" philosophy, AWS unifies operational configuration as "everything is Parameter." Version management (all changes automatically preserved) follows Git's commit history model, enabling rollback.

**Integration with Multiple Services:**

```bash
# Dynamic reference in CloudFormation
# template.yaml
DBPassword:
  !Sub '{{resolve:secretsmanager:${SecretArn}:SecretString:password}}'
  
# Or from Parameter Store
DBHost:
  !Sub '{{resolve:ssm:/myapp/prod/database/host}}'

# Use in EC2 User Data
#!/bin/bash
DB_HOST=$(aws ssm get-parameter \
  --name "/myapp/prod/database/host" \
  --query 'Parameter.Value' --output text)
echo "DB_HOST=$DB_HOST" >> /etc/environment

# Use in Lambda (safer than environment variables)
import boto3
ssm = boto3.client('ssm')

def get_config(path):
    params = ssm.get_parameters_by_path(
        Path=path,
        Recursive=True,
        WithDecryption=True
    )
    return {p['Name'].split('/')[-1]: p['Value'] 
            for p in params['Parameters']}

config = get_config('/myapp/prod/')
db_password = config['password']  # No hardcoding in code
```

## Parameter Store vs Secrets Manager: When to Use What

These two services are frequently confused. The decision criteria are clear.

| Criterion | Parameter Store | Secrets Manager |
|-----------|-----------------|-----------------|
| **Automatic Rotation** | No | Yes (RDS, Redshift, DocumentDB, Lambda integration) |
| **Cross-Region Replication** | No | Yes |
| **Cross-Account Sharing** | Advanced + Resource Policy | Yes (native support) |
| **Cost** | Free/cheap | $0.40/secret/month + $0.05 per 10,000 API |
| **Value Size** | 4KB/8KB | 64KB |
| **Primary Use Cases** | App config, Feature Flags, static secrets | DB password auto-rotation, OAuth tokens |

**Decision Flow:**

```
Is automatic rotation needed?
    ├── Yes → Secrets Manager
    └── No
         │
         Is cross-region replication needed?
         ├── Yes → Secrets Manager
         └── No → Parameter Store
                  │
                  Is value > 4KB or do you need Policies?
                  ├── Yes → Parameter Store Advanced
                  └── No → Parameter Store Standard (free)
```

> 📚 **Case Study**: Startup D initially stored RDS password in Parameter Store SecureString. Three months later, security audit required "DB password rotation every 90 days." Parameter Store lacks auto-rotation, requiring manual password change and Parameter update every 90 days. Eventually migrated to Secrets Manager with RDS and Lambda integration for auto-rotation. Initial architecture choice matters.

## Session Manager: Access Instances Without Port 22

Session Manager is AWS managed access tool that completely replaces SSH and RDP. Internally, SSM Agent creates a WebSocket-based Session Channel, forming an encrypted tunnel between operator CLI and EC2 instance.

**Traditional Bastion vs Session Manager Architecture:**

```
Traditional SSH/Bastion approach:
Operator → [Internet] → Bastion(port 22 open) → SSH key auth → EC2(port 22 open)
                                              ↑ 2 attack surfaces

Session Manager approach:
Operator → AWS API(HTTPS) → SSM Service → SSM Agent(outbound 443 only) → EC2
                                       ↑ 0 inbound ports
```

**Session Manager Security Layers:**

1. **IAM Authentication**: Only users/roles with `ssm:StartSession` permission can connect
2. **Resource Conditions**: IAM policy restricts access to specific instances by tag
3. **MFA Enforcement**: Add `aws:MultiFactorAuthPresent: true` condition to IAM policy
4. **Auto Logging**: All session input/output automatically saved to S3/CloudWatch Logs
5. **Session Timeout**: `idleSessionTimeout`, `maxSessionDuration`
6. **KMS Encryption**: Session logs encrypted with KMS

**Granular Access Control (IAM Policy):**

```json
// "Allow access to dev tag instances, deny prod" policy
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/Environment": ["dev", "stage"]
        },
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "true"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:DescribeSessions",
        "ssm:GetConnectionStatus",
        "ssm:DescribeInstanceInformation"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "ssm:TerminateSession",
      "Resource": "arn:aws:ssm:*:*:session/${aws:username}-*"
    }
  ]
}
```

**Session Manager Practical Usage:**

```bash
# Start basic session
aws ssm start-session --target i-0123456789abcdef0

# Execute specific command (without Interactive)
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartInteractiveCommand \
  --parameters '{"command":["sudo journalctl -u nginx --no-pager -n 50"]}'

# Port forwarding: access RDS via local port (no inbound SG on RDS needed!)
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{
    "host": ["mydb.cluster-abc.ap-northeast-2.rds.amazonaws.com"],
    "portNumber": ["5432"],
    "localPortNumber": ["5432"]
  }'
# Then locally: psql -h localhost -p 5432 -U admin mydb

# Remote host forwarding (using EC2 as relay)
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["80"],"localPortNumber":["8080"]}'
```

**Session Manager Audit Configuration:**

```bash
# Update Session Preferences Document (account-wide)
aws ssm update-document \
  --name "SSM-SessionManagerRunShell" \
  --content '{
    "schemaVersion": "1.0",
    "description": "SSM Session Manager Preferences",
    "sessionType": "Standard_Stream",
    "inputs": {
      "s3BucketName": "session-audit-logs",
      "s3KeyPrefix": "sessions",
      "s3EncryptionEnabled": true,
      "cloudWatchLogGroupName": "/ssm/sessions",
      "cloudWatchEncryptionEnabled": true,
      "kmsKeyId": "alias/ssm-sessions",
      "idleSessionTimeout": "20",
      "maxSessionDuration": "60",
      "runAsEnabled": true,
      "runAsDefaultUser": "ssm-user"
    }
  }' \
  --document-version '$LATEST'
```

> 🔍 **Deeper Dive**: Session Manager's `runAsEnabled` and `runAsDefaultUser` are important security features. When enabled, all sessions run as `ssm-user` (or specified user). The `RunAsUser` tag also supports mapping IAM User to Linux OS User. If IAM User sets `SessionManagerRunAs` tag to `ec2-user`, that user's session executes as `ec2-user`. This makes it possible to track in session logs who (IAM User) connected as which OS user.

**Session Manager in Private VPC:**

```bash
# Create 3 Interface Endpoints (Session Manager without internet)
for service in ssm ssmmessages ec2messages; do
  aws ec2 create-vpc-endpoint \
    --vpc-id vpc-0123456789abcdef0 \
    --vpc-endpoint-type Interface \
    --service-name com.amazonaws.ap-northeast-2.$service \
    --subnet-ids subnet-abc subnet-xyz \
    --security-group-ids sg-ssm-endpoints \
    --private-dns-enabled
done
# After this, can completely remove port 22/3389 security group rules
```

## Automation Runbook: Codify Complex Operational Tasks

Automation Runbook (SSM Document Type: Automation) bundles multi-step tasks with sequencing, conditionals, and loops into a workflow engine. It transforms complex manual work like "patch EC2, reboot, health check post-reboot, rollback on failure" into code.

**Runbook Action Types:**

| Action | Purpose |
|--------|---------|
| `aws:runCommand` | Execute Run Command |
| `aws:executeAwsApi` | Call arbitrary AWS API |
| `aws:waitForAwsResourceProperty` | Wait for resource state (polling) |
| `aws:assertAwsResourceProperty` | Validate resource property |
| `aws:createStack` | Create CloudFormation Stack |
| `aws:sleep` | Wait |
| `aws:branch` | Conditional branch |
| `aws:loop` | Iteration |
| `aws:approve` | Wait for human approval |
| `aws:invokeLambdaFunction` | Invoke Lambda |
| `aws:changeInstanceState` | Change EC2 state |

**Practical Runbook: Zero-Downtime Patch Sequence:**

```yaml
schemaVersion: '0.3'
description: Zero-downtime patch sequence with ELB deregistration
assumeRole: '{{ AutomationAssumeRole }}'
parameters:
  InstanceId:
    type: String
    description: EC2 Instance ID to patch
  TargetGroupArn:
    type: String
    description: ALB Target Group ARN
  AutomationAssumeRole:
    type: String

mainSteps:
  # Step 1: Deregister from ELB
  - name: DeregisterFromTargetGroup
    action: aws:executeAwsApi
    inputs:
      Service: elbv2
      Api: DeregisterTargets
      TargetGroupArn: '{{ TargetGroupArn }}'
      Targets:
        - Id: '{{ InstanceId }}'
    outputs:
      - Name: DeregisterStatus
        Selector: $.ResponseMetadata.HTTPStatusCode

  # Step 2: Wait for draining to complete (max 300s)
  - name: WaitForDraining
    action: aws:waitForAwsResourceProperty
    timeoutSeconds: 300
    inputs:
      Service: elbv2
      Api: DescribeTargetHealth
      TargetGroupArn: '{{ TargetGroupArn }}'
      Targets:
        - Id: '{{ InstanceId }}'
      PropertySelector: '$.TargetHealthDescriptions[0].TargetHealth.State'
      DesiredValues:
        - unused
        - ''

  # Step 3: Create EBS snapshot
  - name: CreateSnapshot
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateSnapshot
      VolumeId: '{{ getVolumeId.VolumeId }}'
      Description: 'Pre-patch snapshot {{ InstanceId }}'
    outputs:
      - Name: SnapshotId
        Selector: $.SnapshotId

  # Step 4: Apply patches
  - name: ApplyPatches
    action: aws:runCommand
    inputs:
      DocumentName: AWS-RunPatchBaseline
      InstanceIds:
        - '{{ InstanceId }}'
      Parameters:
        Operation:
          - Install
        RebootOption:
          - RebootIfNeeded

  # Step 5: Wait for reboot to complete
  - name: WaitForReboot
    action: aws:waitForAwsResourceProperty
    timeoutSeconds: 600
    inputs:
      Service: ec2
      Api: DescribeInstanceStatus
      InstanceIds:
        - '{{ InstanceId }}'
      PropertySelector: '$.InstanceStatuses[0].InstanceStatus.Status'
      DesiredValues:
        - ok

  # Step 6: Application health check
  - name: ApplicationHealthCheck
    action: aws:runCommand
    inputs:
      DocumentName: AWS-RunShellScript
      InstanceIds:
        - '{{ InstanceId }}'
      Parameters:
        commands:
          - 'curl -sf http://localhost/health || exit 1'

  # Step 7: Re-register with ELB
  - name: RegisterToTargetGroup
    action: aws:executeAwsApi
    inputs:
      Service: elbv2
      Api: RegisterTargets
      TargetGroupArn: '{{ TargetGroupArn }}'
      Targets:
        - Id: '{{ InstanceId }}'
```

**Automation Trigger Patterns:**

| Trigger | Use Case |
|---------|----------|
| **Manual (console/CLI)** | Ad-hoc operations, testing |
| **EventBridge → Automation** | Auto-remediation based on CloudTrail events |
| **Config Auto Remediation** | Auto-fix non-compliant resources |
| **CloudWatch Alarm Action** | Auto-remediate on metric anomaly |
| **Change Manager** | Change with approval workflow |

**Auto-Block S3 Bucket Public Access via EventBridge:**

```bash
# EventBridge Rule: S3 PutBucketAcl event → Automation
aws events put-rule \
  --name "AutoBlockS3PublicAccess" \
  --event-pattern '{
    "source": ["aws.s3"],
    "detail-type": ["AWS API Call via CloudTrail"],
    "detail": {
      "eventName": ["PutBucketAcl", "PutBucketPolicy"],
      "requestParameters": {
        "AccessControlList": {
          "AccessControlPolicy": {
            "Owner": [{"anything-but": ""}]
          }
        }
      }
    }
  }' \
  --state ENABLED

# Target: SSM Automation
aws events put-targets \
  --rule "AutoBlockS3PublicAccess" \
  --targets '[{
    "Id": "BlockS3Public",
    "Arn": "arn:aws:ssm:ap-northeast-2:123456789012:automation-definition/AWS-DisableS3BucketPublicReadWrite",
    "RoleArn": "arn:aws:iam::123456789012:role/EventBridgeSSMRole",
    "Input": "{\"S3BucketName\":[\"detail.requestParameters.bucketName\"]}"
  }]'
```

## AppConfig: Safe Deployment of Runtime Configuration

AppConfig is the "dynamic deployment" version of Parameter Store. While Parameter Store stores static configuration, AppConfig deploys configuration changes using Canary/Linear strategies with automatic rollback on alarm.

**AppConfig vs Parameter Store Comparison:**

| Item | AppConfig | Parameter Store |
|------|-----------|-----------------|
| Deployment strategy | Canary, Linear, AllAtOnce | None (instant apply) |
| Auto-rollback | CloudWatch Alarm linked | None |
| Validation | JSON Schema, Lambda | None |
| Client caching | Auto cache via Lambda Extension | Manual implementation |
| Use case | Feature Flag, algorithm parameters | App config, secrets |

**Feature Flag Implementation Example:**

```python
# Use AppConfig in Lambda (with Lambda Powertools)
from aws_lambda_powertools.utilities.feature_flags import FeatureFlags, AppConfigStore

# AppConfig Lambda Extension provides locally cached config via HTTP
store = AppConfigStore(
    environment="prod",
    application="OrderService",
    name="FeatureFlags",
    cache_seconds=30  # 30s cache (balance real-time vs performance)
)
feature_flags = FeatureFlags(store=store)

def handler(event, context):
    # Check Feature Flag
    if feature_flags.evaluate(name="new_checkout_flow", default=False):
        return new_checkout_handler(event)
    else:
        return legacy_checkout_handler(event)
```

> 💡 **Related Theory**: AppConfig's gradual deployment strategy mirrors Netflix's 2012 "Simian Army" "Canary Analysis" concept. Deploy to subset of instances/users first, observe metrics, then expand. Google SRE Book (Beyer et al., 2016) calls this "gradual rollout" and recommends it as configuration change standard. AppConfig provides this industry best practice as managed service.

## Change Manager: Change Control with Approval Workflow

Change Manager adds RFC (Request for Change) approval workflow to Automation Runbook. It's AWS's implementation of ITIL (IT Infrastructure Library) change management process.

```bash
# Create change request via Change Manager
aws ssm start-change-request-execution \
  --change-request-name "patch-prod-db-2026-05-26" \
  --document-name "AWS-RunPatchBaseline" \
  --parameters '{"InstanceId":["i-0abc123"],"Operation":["Install"]}' \
  --scheduled-time "2026-05-26T02:00:00Z" \
  --runbooks '[{
    "DocumentName": "MyApp-SafePatchSequence",
    "DocumentVersion": "$LATEST",
    "Parameters": {"InstanceId":["i-0abc123"],"TargetGroupArn":["arn:aws:elasticloadbalancing:..."]}
  }]' \
  --tags '[{"Key":"ChangeType","Value":"Patch"},{"Key":"Environment","Value":"prod"}]'
```

Approvers receive change request notifications via Slack or email (SNS → external notifications) and approve/reject in Change Manager console. After approval, automatically executes at scheduled time.

## Complete Integration Picture

```
SSM Advanced Automation Integrated Architecture
============================================================

[Parameter Store]
  /myapp/prod/db/password (SecureString, KMS)
  /myapp/prod/feature/new-search (String, Feature Flag)
       │
       ├── Fetch at Lambda/EC2 runtime (code separation)
       ├── CloudFormation: {{resolve:ssm:/path/to/param}}
       └── AppConfig: dynamic deployment + auto-rollback

[Session Manager]
  Operator (IAM auth) → SSM → Agent → EC2
       │ without port 22
       ├── Auto-save all sessions to S3/CW Logs
       ├── Port forwarding for RDS/Redis access
       └── Private VPC: 3 VPC Endpoints

[Automation Runbook]
  EventBridge → Config Auto Remediation
  CloudWatch Alarm → 
  Change Manager (approval) →
  Manual execution →
       │
       └── Runbook execution:
           Step 1: ELB Deregister
           Step 2: Snapshot
           Step 3: Patch
           Step 4: Health Check
           Step 5: ELB Register
           (auto-rollback on failure)
```

## 📝 Practice Questions

**Question 1.** A Lambda function must securely manage the password used to connect to an RDS database. The password must be rotated automatically every 90 days, and the new password must be used without redeploying the Lambda code. What is the most appropriate tool?

A) Parameter Store Standard - store the password as a SecureString
B) Parameter Store Advanced - change notifications through a NoChangeNotification policy
C) Secrets Manager - set up 90-day rotation with the automatic rotation integration with RDS
D) Store the encrypted password in an environment variable

**Answer: C**
Explanation: Automatic rotation is the key requirement. Parameter Store has no automatic rotation feature, so changes must be made manually. Secrets Manager integrates with RDS and manages the rotation Lambda automatically, and the Lambda function automatically retrieves the latest value through the SDK. The new password takes effect without redeploying the code. It adds cost ($0.40/secret/month), but operational safety improves greatly.

---

**Question 2.** Under the company's security policy, all EC2 access must be kept as audit logs, and port 22 must be removed completely from security groups. Developers need to connect to EC2 to check logs and debug. What is the most appropriate solution?

A) Systems Manager Session Manager - IAM authentication, no port 22 needed, automatic session logging
B) AWS VPN + Bastion Host in a private subnet
C) EC2 Instance Connect - temporary SSH key approach
D) AWS Direct Connect + SSH tunnel

**Answer: A**
Explanation: Session Manager satisfies all three requirements: IAM-based access control, no port 22 needed (outbound 443 only), and all sessions automatically stored in S3/CloudWatch Logs. EC2 Instance Connect (C) still requires port 22. A Bastion Host (B) has a high management burden and requires port 22.

---

**Question 3.** An SSM Automation Runbook has the requirement "approval from the operations team leader is required before the change." During Runbook execution, it must not proceed to the next step until the leader approves. How is this implemented?

A) Create a separate Lambda function that pauses the Automation
B) Add an `aws:approve` action at the relevant point in the Runbook and configure the approver IAM ARNs and an SNS notification
C) Use Change Manager with auto-approval configured
D) Manually trigger the next step through EventBridge

**Answer: B**
Explanation: The `aws:approve` action is a built-in human approval wait step in Automation. If you specify IAM user or role ARNs in `Approvers` and set an SNS topic in `NotificationArn`, an approval request notification is sent. If not approved within the specified time (`MinRequiredApprovals`, `Timeout`), it is automatically rejected. If a more sophisticated ITSM workflow is needed, use Change Manager.

---

**Question 4.** The operations team wants to be notified when an API key stored in Parameter Store has not been changed for 3 months. They also need to be notified 2 weeks before the expiration date. How is this implemented?

A) Run a Lambda function daily to compare the parameter creation date with the current date
B) Set up a CloudWatch alarm on Parameter Store Standard
C) Configure both a NoChangeNotification policy (90 days) and an ExpirationNotification policy (14 days) on Parameter Store Advanced
D) Track parameter changes with a Config rule

**Answer: C**
Explanation: Parameter Policies in Parameter Store Advanced are the exact solution. `NoChangeNotification` sends a notification through EventBridge if the value is not changed for the specified period. `ExpirationNotification` sends a notification N days before expiration. Both policies can be configured together. A Lambda function (A) also works but adds unnecessary complexity. The Standard tier (B) has no Policy feature.

---

**Question 5.** You want to automate the task of creating a snapshot and replacing the volume with an encrypted one when a Config rule finds an "unencrypted EBS volume." What is the most appropriate configuration?

A) CloudWatch alarm → SNS → email notification
B) Config Auto Remediation → SSM Automation Runbook (create snapshot + create encrypted volume + replace + delete the original)
C) GuardDuty → Lambda → encrypt the volume
D) Inspector → Run Command

**Answer: B**
Explanation: Config Auto Remediation automatically runs an SSM Automation Document when it finds a non-compliant resource. Because the task involves multiple steps (snapshot → create new volume → replace → delete original), an Automation Runbook is more suitable than Run Command. AWS provides many standard Runbooks in the `AWSConfigRemediation-*` namespace.

---

**Question 6.** You want to connect through Session Manager, but the private VPC has no internet gateway. Which VPC Endpoints are required?

A) Only `ssm` is needed
B) Only `ssm` and `ssmmessages` are needed
C) `ssm`, `ssmmessages`, and `ec2messages` are all needed
D) `ssm` and a separate TLS certificate are needed

**Answer: C**
Explanation: Session Manager uses three separate channels. `ssm` is the control channel (instance registration, heartbeat), `ssmmessages` is the session channel (actual session traffic), and `ec2messages` is the EC2 metadata channel (including Run Command). Without all three, Session Manager does not work. An S3 Gateway Endpoint is also additionally required if session logs are stored in S3.

---
