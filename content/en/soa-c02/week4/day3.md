# Day 3 - AWS Config Advanced: Rule Evaluation Triggers, Custom Rule Lambda, Conformance Pack, Auto Remediation

If CloudTrail records "who did what (action)," AWS Config continuously tracks "what state is it in (state)." They don't compete; they complement. CloudTrail tells you "who changed S3 bucket policy," Config tells you "is that bucket public now, is encryption on." Today from the SOA operator's perspective, we cover Configuration Item structure, Rule evaluation trigger differences, Custom Rule Lambda implementation, Conformance Pack, Auto Remediation, and using Aggregator to assess company-wide compliance.

## Configuration Item (CI): State Snapshot Unit

Config's basic data unit is **Configuration Item**. A new CI is created every time resource change is detected. CI is a complete state snapshot at that moment.

```json
{
  "configurationItemCaptureTime": "2026-05-27T10:30:00.000Z",
  "configurationItemStatus": "OK",
  "resourceType": "AWS::EC2::SecurityGroup",
  "resourceId": "sg-0abc12345",
  "resourceName": "web-server-sg",
  "arn": "arn:aws:ec2:ap-northeast-2:111122223333:security-group/sg-0abc12345",
  "awsRegion": "ap-northeast-2",
  "configuration": {
    "groupName": "web-server-sg",
    "description": "Web server security group",
    "ipPermissions": [
      {
        "fromPort": 80,
        "toPort": 80,
        "ipProtocol": "tcp",
        "ipRanges": [{"cidrIp": "0.0.0.0/0"}]
      },
      {
        "fromPort": 22,
        "toPort": 22,
        "ipProtocol": "tcp",
        "ipRanges": [{"cidrIp": "0.0.0.0/0"}]
      }
    ]
  },
  "relationships": [
    {"resourceType": "AWS::EC2::VPC", "resourceId": "vpc-0def67890"},
    {"resourceType": "AWS::EC2::Instance", "resourceId": "i-0ghi23456"}
  ],
  "tags": {"Environment": "Production", "Team": "WebOps"}
}
```

This CI causes `restricted-ssh` Config Rule to immediately evaluate as NON_COMPLIANT—port 22 open to 0.0.0.0/0.

**CI status values**:
- `OK`: Normal capture
- `ResourceDiscovered`: First CI of newly found resource
- `ResourceNotRecorded`: Resource type not recorded
- `ResourceDeleted`: Resource deleted
- `ResourceDeletedNotRecorded`: Deleted resource, not recorded

> 💡 **Related Theory**: CI design combines **Event Sourcing** and **Snapshot-based State Tracking**. Martin Fowler (2005) defined Event Sourcing as storing state-change events instead of current state. Config stores complete state (Snapshot) at each change point, so not pure Event Sourcing, but timeline-based change tracking serves the same purpose. CI timeline lets you "recreate this resource's exact configuration 3 months ago"—audit evidence for PCI-DSS or SOC 2.

## Configuration Recorder and Cost Structure

**Configuration Recorder** handles event collection. One per account+region exists.

```bash
# Setup to record all resource types + global resources (IAM)
aws configservice put-configuration-recorder \
  --configuration-recorder '{
    "name": "default",
    "roleARN": "arn:aws:iam::111122223333:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig",
    "recordingGroup": {
      "allSupported": true,
      "includeGlobalResourceTypes": true
    }
  }'

# Delivery Channel: CI to S3, change notifications to SNS
aws configservice put-delivery-channel \
  --delivery-channel '{
    "name": "default",
    "s3BucketName": "my-config-logs",
    "s3KeyPrefix": "config/",
    "snsTopicARN": "arn:aws:sns:ap-northeast-2:111122223333:config-notifications",
    "configSnapshotDeliveryProperties": {
      "deliveryFrequency": "Six_Hours"
    }
  }'

aws configservice start-configuration-recorder --configuration-recorder-name default
```

**Config cost structure**:
| Item | Cost |
|------|------|
| CI recording | $0.003/CI (generated on AWS resource change) |
| Config Rule evaluation | $0.001/1000 evaluations |
| Conformance Pack evaluation | Same as Rule evaluation |
| Config Rules Data | $0.003/CI (Rule evaluation results) |

**Cost calculation example**:
```
Environment: 100 EC2, 20 RDS, 50 SG, 50 Rules

Estimated monthly CI creation (change frequency):
  EC2 state changes avg 10/month × 100 = 1,000 CI
  RDS maintenance·parameter changes 5/month × 20 = 100 CI
  SG rule changes 2/month × 50 = 100 CI
  Total: ~1,200 CI/month → $3.60/month

Rule evaluation (Configuration Change trigger):
  1,200 CI × 50 Rules = 60,000 evaluations → $0.06/month

Periodic Rule (24h frequency, 10 Rules):
  10 Rules × 1/day × 30 days = 300 evaluations → $0.0003/month

Total: ~$3.66/month (small environment)
```

> ⚠️ **Pitfall**: `includeGlobalResourceTypes: true` records global resources (IAM users, roles, policies). IAM is security-critical, must include, but **multi-region setup causes each region to duplicate-record the same IAM resources**. 10 regions = 1 IAM change creates 10 CIs. Cost solution: set `includeGlobalResourceTypes: true` only in one region (e.g., ap-northeast-2), false elsewhere.

## Config Rule Evaluation Triggers: Two Types Fully Understood

Config evaluates resources at two times. Mastering this difference is essential for correct Rule design.

### Configuration Change Trigger

Rule evaluates immediately when resource CI is newly created (= resource changed).

```
Resource change detected
    │
    ▼
New CI created (within minutes)
    │
    ▼
Configuration Change Rule evaluation triggered
    │
    ▼
Rule evaluation: COMPLIANT or NON_COMPLIANT
```

**Response speed**: Within minutes of change (includes CI creation delay).

**Suitable Rule types**: Rules needing immediate detection when resource attributes change.
- `s3-bucket-public-read-prohibited`: When bucket ACL/policy changes
- `restricted-ssh`: When SG inbound rule changes
- `encrypted-volumes`: When EBS encryption property changes
- `ec2-imdsv2-check`: When EC2 metadata setting changes

### Periodic Trigger

Automatically evaluate per schedule (1hr, 3hr, 6hr, 12hr, 24hr). Runs even without resource change.

**Suitable Rule types**: Rules checking state Config can't detect via change events.
- `root-account-mfa-enabled`: Root MFA state change doesn't generate CI event
- `iam-password-policy`: Account-level setting, no resource change event
- `cloudtrail-enabled`: Trail activation, no external change event
- `vpc-flow-logs-enabled`: VPC-level setting

```
[Why is root-account-mfa-enabled Periodic?]

Config detects change via CloudTrail API recording.
Root MFA device add/remove happens in console,
and this operation's CloudTrail event isn't recognized
as resource change by Config.
→ Config doesn't auto-generate MFA status CI.
→ Periodic: directly call IAM API to check MFA status
```

> 🔍 **Deeper Dive**: Config Rule evaluation trigger and Scope setting. For Configuration Change trigger with `scope` specified, Rule runs only when those resource types change. Example: `restricted-ssh` Rule scoped to `AWS::EC2::SecurityGroup` skips running when other resources (EC2 instances) change. No Scope specified = Rule runs on all resource changes, increasing evaluation cost unnecessarily.

## Custom Rule: Implement Evaluation Logic with Lambda

Business-specific compliance not covered by AWS Managed Rules uses Custom Rule—Lambda function as evaluation engine.

### Custom Rule Lambda Input Structure

Config calls Lambda with `invokingEvent` and `ruleParameters`.

```python
import json
import boto3

config_client = boto3.client('config')

def lambda_handler(event, context):
    """
    Custom Config Rule: EC2 instances must have Owner and CostCenter tags
    """
    invoking_event = json.loads(event['invokingEvent'])
    rule_parameters = json.loads(event.get('ruleParameters', '{}'))
    
    # Distinguish Periodic vs Configuration Change trigger
    if invoking_event.get('messageType') == 'ScheduledNotification':
        # Periodic: evaluate all EC2 instances
        evaluate_all_ec2_instances(event, rule_parameters)
        return
    
    # Configuration Change: evaluate only changed resource
    configuration_item = invoking_event.get('configurationItem')
    
    if configuration_item is None:
        return
    
    # Deleted resources = COMPLIANT (already gone)
    if configuration_item['configurationItemStatus'] in ('ResourceDeleted', 'ResourceDeletedNotRecorded'):
        put_evaluation(
            event['resultToken'],
            configuration_item,
            'NOT_APPLICABLE'
        )
        return
    
    # Skip if not EC2 instance
    if configuration_item['resourceType'] != 'AWS::EC2::Instance':
        return
    
    # Evaluation logic
    compliance = evaluate_compliance(configuration_item, rule_parameters)
    
    put_evaluation(event['resultToken'], configuration_item, compliance)


def evaluate_compliance(configuration_item, rule_parameters):
    """Evaluate tag presence"""
    required_tags = rule_parameters.get('requiredTags', 'Owner,CostCenter').split(',')
    tags = configuration_item.get('tags', {})
    
    missing_tags = [tag for tag in required_tags if tag.strip() not in tags]
    
    if missing_tags:
        return 'NON_COMPLIANT'
    return 'COMPLIANT'


def put_evaluation(result_token, configuration_item, compliance):
    """Send evaluation result to Config"""
    config_client.put_evaluations(
        Evaluations=[
            {
                'ComplianceResourceType': configuration_item['resourceType'],
                'ComplianceResourceId': configuration_item['resourceId'],
                'ComplianceType': compliance,
                'Annotation': f'Evaluated at: {configuration_item["configurationItemCaptureTime"]}',
                'OrderingTimestamp': configuration_item['configurationItemCaptureTime']
            }
        ],
        ResultToken=result_token
    )
```

### Register Custom Rule

```bash
# After creating Lambda, register as Config Rule
aws configservice put-config-rule \
  --config-rule '{
    "ConfigRuleName": "ec2-required-tags",
    "Description": "EC2 instances must have Owner and CostCenter tags",
    "Scope": {
      "ComplianceResourceTypes": ["AWS::EC2::Instance"]
    },
    "Source": {
      "Owner": "CUSTOM_LAMBDA",
      "SourceIdentifier": "arn:aws:lambda:ap-northeast-2:111122223333:function:config-ec2-tag-check",
      "SourceDetails": [
        {
          "EventSource": "aws.config",
          "MessageType": "ConfigurationItemChangeNotification"
        },
        {
          "EventSource": "aws.config",
          "MessageType": "ScheduledNotification",
          "MaximumExecutionFrequency": "TwentyFour_Hours"
        }
      ]
    },
    "InputParameters": "{\"requiredTags\": \"Owner,CostCenter,Environment\"}",
    "MaximumExecutionFrequency": "TwentyFour_Hours"
  }'
```

> 📚 **Case Study**: Large IT services company tag policy automation. Company required all EC2, RDS, Lambda to have `Team`, `Project`, `CostCenter` tags for cost allocation. No managed Rule exists; implemented Custom Rule Lambda. Configuration Change trigger evaluated immediately on new resource creation; NON_COMPLIANT instances auto-remediated to Stop state. In 3 months, untagged resources dropped from 23% to 1.2%.

### configurationItem Parsing Patterns

```python
# Common CI extraction patterns
def parse_ci(configuration_item):
    """Extract key info from CI"""
    
    # Resource identification
    resource_type = configuration_item['resourceType']  # AWS::EC2::Instance
    resource_id = configuration_item['resourceId']      # i-0abc12345
    
    # Resource configuration (sometimes needs JSON parsing)
    configuration = configuration_item.get('configuration', {})
    if isinstance(configuration, str):
        configuration = json.loads(configuration)
    
    # Tags
    tags = configuration_item.get('tags', {})
    
    # Related resources (e.g., EC2 → VPC, Subnet)
    relationships = configuration_item.get('relationships', [])
    
    # Resource status
    status = configuration_item['configurationItemStatus']  # OK, ResourceDeleted
    
    return {
        'type': resource_type,
        'id': resource_id,
        'config': configuration,
        'tags': tags,
        'relationships': relationships,
        'status': status
    }
```

## Conformance Pack: Bundle Compliance Rules for Deployment

Conformance Pack bundles related Config Rules and Remediation into one CloudFormation template.

### Pre-provided Conformance Pack List

| Pack Name | Target |
|-----------|------|
| `Operational-Best-Practices-for-PCI-DSS` | Payment Card Industry |
| `Operational-Best-Practices-for-HIPAA-Security` | Healthcare Info Security |
| `Operational-Best-Practices-for-NIST-800-53-rev-5` | US Government |
| `Operational-Best-Practices-for-CIS-AWS-Foundations-Benchmark` | CIS v1.4 |
| `Operational-Best-Practices-for-AWS-Well-Architected-Security` | WA Security Pillar |
| `Operational-Best-Practices-for-K-ISMS` | Korean Info Protection Management System |
| `Operational-Best-Practices-for-ISO-27001` | ISO 27001 |
| `Operational-Best-Practices-for-SOC2` | SOC 2 Type II |

### Conformance Pack YAML Structure

```yaml
# Custom Conformance Pack example (partial)
Parameters:
  MaximumExecutionFrequency:
    Type: String
    Default: TwentyFour_Hours
    AllowedValues:
      - One_Hour
      - Three_Hours
      - Six_Hours
      - Twelve_Hours
      - TwentyFour_Hours

Resources:
  # Rule 1: Block S3 public access
  S3PublicReadProhibited:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      Scope:
        ComplianceResourceTypes:
          - AWS::S3::Bucket

  # Rule 2: Root MFA enabled
  RootAccountMFAEnabled:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: root-account-mfa-enabled
      Source:
        Owner: AWS
        SourceIdentifier: ROOT_ACCOUNT_MFA_ENABLED
      MaximumExecutionFrequency: !Ref MaximumExecutionFrequency

  # Auto Remediation: Auto-block S3 public
  S3PublicReadRemediation:
    Type: AWS::Config::RemediationConfiguration
    Properties:
      ConfigRuleName: !Ref S3PublicReadProhibited
      TargetType: SSM_DOCUMENT
      TargetId: AWS-DisableS3BucketPublicReadWrite
      Automatic: true
      MaximumAutomaticAttempts: 3
      RetryAttemptSeconds: 60
      Parameters:
        AutomationAssumeRole:
          StaticValue:
            Values:
              - arn:aws:iam::111122223333:role/ConfigRemediationRole
        S3BucketName:
          ResourceValue:
            Value: RESOURCE_ID
```

```bash
# Deploy Conformance Pack
aws configservice put-conformance-pack \
  --conformance-pack-name "security-baseline-v1" \
  --template-body file://conformance-pack.yaml

# Organization-wide deployment (auto-apply to new accounts)
aws configservice put-organization-conformance-pack \
  --organization-conformance-pack-name "org-security-baseline" \
  --template-s3-uri s3://my-config-templates/conformance-pack.yaml \
  --delivery-s3-bucket org-config-delivery-bucket \
  --excluded-accounts 999988887777  # Exclude sandbox account
```

> 💡 **Related Theory**: Conformance Pack is **Policy as Code** implementation. Defining compliance requirements in code (YAML) enables version control, testing, deployment pipelines—the modern cloud governance standard. HashiCorp Sentinel, OPA (Open Policy Agent) follow the same paradigm. AWS Config Conformance Pack's advantage: AWS service native integration, no separate agent/sidecar, applies to all AWS resources.

## Auto Remediation: Automatic Correction via SSM Automation

When Config Rule detects NON_COMPLIANT, SSM Automation Runbook executes automatically to remediate.

### Auto Remediation Complete Flow

```
Resource change occurs
    │
    ▼
Config Rule evaluation (within minutes)
    │
    ▼ NON_COMPLIANT verdict
Config → SSM Automation Runbook auto-triggers
    │
    ▼
SSM Runbook executes (gains permissions via AutomationAssumeRole)
    │
    ├── Success: Resource state corrected → next evaluation = COMPLIANT
    └── Failure: Error logged to CloudWatch Logs → retry (MaximumAutomaticAttempts)
    │
    ▼
SNS notification (optional): "Rule X auto-remediated resource Y"
```

### Common Auto Remediation Mappings

| Config Rule | SSM Automation Runbook | Remediation |
|-------------|----------------------|----------|
| `s3-bucket-public-read-prohibited` | `AWS-DisableS3BucketPublicReadWrite` | Block S3 public access |
| `restricted-ssh` | `AWS-DisablePublicAccessForSecurityGroup` | Remove 0.0.0.0/0:22 rule |
| `encrypted-volumes` | `AWSConfigRemediation-EnableEbsEncryptionByDefault` | Enable EBS default encryption |
| `iam-access-keys-rotated` (90d+ old) | `AWSConfigRemediation-DisableIamAccessKey` | Disable old Access Key |
| `ec2-instance-no-public-ip` | `AWSConfigRemediation-ReleaseElasticIpAddress` | Release EIP |
| `cloudtrail-enabled` | `AWSConfigRemediation-CreateCloudTrailMultiRegionTrail` | Create Trail auto |

### Auto Remediation Detailed Setup

```bash
aws configservice put-remediation-configurations \
  --remediation-configurations '[
    {
      "ConfigRuleName": "restricted-ssh",
      "TargetType": "SSM_DOCUMENT",
      "TargetId": "AWS-DisablePublicAccessForSecurityGroup",
      "TargetVersion": "1",
      "Parameters": {
        "AutomationAssumeRole": {
          "StaticValue": {
            "Values": ["arn:aws:iam::111122223333:role/ConfigRemediationRole"]
          }
        },
        "GroupId": {
          "ResourceValue": {"Value": "RESOURCE_ID"}
        }
      },
      "Automatic": true,
      "MaximumAutomaticAttempts": 5,
      "RetryAttemptSeconds": 60,
      "ExecutionControls": {
        "SsmControls": {
          "ConcurrentExecutionRatePercentage": 25,
          "ErrorPercentage": 20
        }
      }
    }
  ]'
```

**Key parameter explanations**:

| Parameter | Value | Meaning |
|---------|---|------|
| `Automatic` | true/false | true = auto-execute, false = manual trigger only |
| `MaximumAutomaticAttempts` | 1~25 | Max retries on remediation failure |
| `RetryAttemptSeconds` | 10~2592000 | Retry interval (seconds) |
| `ConcurrentExecutionRatePercentage` | 1~100 | On many NON_COMPLIANT, concurrent remediation rate |
| `ErrorPercentage` | 1~100 | Stop remaining remediations if failure rate exceeds this |

> ⚠️ **Pitfall**: Two most common Auto Remediation failures.
> 1. **IAM Permission Insufficient**: `AutomationAssumeRole` lacks permissions Runbook needs. S3 public-block Runbook needs `s3:PutBucketPublicAccessBlock` permission. Check Config console > Rule > Remediation Execution Status for errors.
> 2. **Resource Lock**: Already-deleted or service-managed resources fail remediation. Example: Control Tower-managed bucket can't change public settings.

### AutomationAssumeRole Least Privilege Setup

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutBucketPublicAccessBlock",
        "s3:GetBucketPublicAccessBlock"
      ],
      "Resource": "arn:aws:s3:::*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:RevokeSecurityGroupIngress",
        "ec2:DescribeSecurityGroups"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "ssm:StartAutomationExecution",
      "Resource": "arn:aws:ssm:*:*:automation-definition/AWS-*"
    }
  ]
}
```

## Multi-Account Aggregator: Enterprise Compliance Status

Aggregator consolidates Config data across multiple accounts and regions into one view. **Placing Aggregator in Audit Account** is Landing Zone standard.

### Organization Aggregator Setup

```bash
# Create in Audit Account - Organization Aggregator
aws configservice put-configuration-aggregator \
  --configuration-aggregator-name "org-config-aggregator" \
  --organization-aggregation-source '{
    "RoleArn": "arn:aws:iam::111122223333:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig",
    "AllAwsRegions": true
  }' \
  --region ap-northeast-2  # Aggregator deployed to single region

# Manual account Aggregator (non-Organization)
aws configservice put-configuration-aggregator \
  --configuration-aggregator-name "manual-aggregator" \
  --account-aggregation-sources '[
    {
      "AccountIds": ["111111111111", "222222222222", "333333333333"],
      "AllAwsRegions": true
    }
  ]'
```

### Aggregator Query: Enterprise Non-Compliance Status

```bash
# All accounts - list NON_COMPLIANT Rules
aws configservice describe-aggregate-compliance-by-config-rules \
  --configuration-aggregator-name "org-config-aggregator" \
  --filters "ComplianceType=NON_COMPLIANT" \
  --query 'AggregateComplianceByConfigRules[*].[ConfigRuleName, Compliance.ComplianceType, AccountId, AwsRegion]' \
  --output table

# Most-violated Rule aggregation
aws configservice get-aggregate-compliance-details-by-config-rule \
  --configuration-aggregator-name "org-config-aggregator" \
  --config-rule-name "restricted-ssh" \
  --compliance-type NON_COMPLIANT
```

### Config + Security Hub Integration

Config Rule evaluation results auto-flow to Security Hub Finding.

```
Config Rule evaluation → NON_COMPLIANT
    │
    ▼ (automatic, no setup needed)
Security Hub Finding created
    type: "Software and Configuration Checks/AWS Security Best Practices"
    severity: CRITICAL, HIGH, MEDIUM, LOW (Rule-configurable)
    │
    ▼
Security Hub console → GuardDuty threats + Config non-compliance + Inspector vulnerabilities unified view
```

> 📚 **Case Study**: 2022 Korean financial company "Continuous Compliance" adoption. This company replaced quarterly manual compliance checks with Config + Auto Remediation. Before: S3 public exposure average detection-to-remediation = 4 hours. After: within 3 minutes. Simultaneously, 6 months = zero S3 public exposure incidents. SOC 2 audit submission: Config Resource Timeline proves "this resource was in this state at this minute"—minute-level compliance proof.

## CloudTrail vs Config: Precise Complementary Relationship

| Question | Tool |
|------|------|
| "Who changed this S3 bucket policy yesterday?" | CloudTrail |
| "Is this S3 bucket public now?" | Config |
| "Since when has this bucket been public?" | Config (Resource Timeline) |
| "Source IP, UserAgent of public-setting change?" | CloudTrail |
| "How many public buckets across all accounts?" | Config Aggregator |
| "Auto-close a public bucket?" | Config Rule + Auto Remediation |
| "Alert + auto-rollback on public setting change?" | CloudTrail(EventBridge) + Config(Auto Remediation) |

Using only one tool leaves incomplete audit capability. "CloudTrail alone is enough" or vice versa is the most common exam and operational mistake.

---

## 📝 Practice Questions

**Question 1.** What is the most complete configuration for the requirement "automatically block an S3 bucket when it is made public, and send a notification to the security team"?

A) Config Rule `s3-bucket-public-read-prohibited` + Auto Remediation (Automatic: true) + SNS notification
B) CloudTrail alone
C) A Lambda that periodically scans S3 bucket status
D) GuardDuty S3 Protection only

**Answer: A**
Explanation: Config Rule (Configuration Change trigger, evaluated immediately when the bucket changes) → NON_COMPLIANT detected → Auto Remediation (SSM `AWS-DisableS3BucketPublicReadWrite`) → automatic blocking. For notification, Config delivers directly to SNS, or an EventBridge Rule (Config Compliance status change event) sends to SNS. C leaves an exposure window between scan intervals. B only records actions and does not track or remediate state. D is a threat detection tool, not a compliance remediation tool.

---

**Question 2.** You want to check whether Root account MFA is enabled using a Config Rule. Which evaluation trigger should you choose?

A) Configuration Change — evaluate immediately when Root account MFA changes
B) Periodic — check the state at regular intervals (Root MFA state changes do not occur as Config change events)
C) Use both triggers
D) EventBridge trigger (separate setup)

**Answer: B**
Explanation: Config does not recognize adding/removing a Root account MFA device as a resource change event. Because no new configuration item (CI) is created, there is no condition to fire the Configuration Change trigger. Therefore, the `root-account-mfa-enabled` Managed Rule works with a Periodic trigger (24-hour interval) by default. By contrast, S3 bucket ACL changes or SG rule changes produce CI creation events, so the Configuration Change trigger works.

---

**Question 3.** A company must deploy 40 related Config Rules for PCI-DSS compliance. What is the most efficient way?

A) Create the Rules one by one manually in the AWS console (40 times)
B) Deploy the Conformance Pack `Operational-Best-Practices-for-PCI-DSS` in one deployment
C) Write a CloudFormation template for the 40 Rules
D) Deploy the Rules one by one with Terraform

**Answer: B**
Explanation: A Conformance Pack bundles the related Rules and Remediations for each compliance framework and applies them in a single deployment. The PCI-DSS Conformance Pack already includes the related Rules. Deployment is complete with a single `put-conformance-pack`. A means 40 manual operations with a risk of omissions. C and D require listing the Rules directly, so there is more work than a Conformance Pack and maintenance is more complex.

---

**Question 4.** In which account is the Config Aggregator placed as the Landing Zone standard?

A) The Production account with the most workloads
B) The Audit Account — a dedicated audit account separated from workloads
C) The Management Account (organization root account)
D) A separate Aggregator in each account

**Answer: B**
Explanation: In a Landing Zone design (recommended by Control Tower and the AWS Well-Architected Framework), the Aggregator is located in the Audit Account. The Management Account cannot have SCPs applied and is dedicated to organization management, so no workloads or audit tools are placed there. The Audit Account is dedicated to log archiving and compliance aggregation. This separation is a key security principle — even if a workload account is compromised, the audit data stays safely protected under the separate security controls of the Audit Account.

---

**Question 5.** Auto Remediation is configured, but NON_COMPLIANT resources are not being remediated automatically. What is the most appropriate troubleshooting sequence?

A) Delete the Config rule and create it again
B) Config console → Rule → check Remediation Execution Status → review the IAM permissions of the AutomationAssumeRole → check the SSM Automation execution logs
C) Reconfigure the S3 Delivery Channel
D) Restart the Configuration Recorder

**Answer: B**
Explanation: The most common cause of Auto Remediation failure is insufficient IAM permissions. Troubleshooting sequence: (1) In the Config console, check the rule's Remediation Execution Status to see whether it failed or succeeded and to read the error message. (2) If the error is AccessDenied, add the required permissions (for example, `s3:PutBucketPublicAccessBlock`) to the IAM policy of the `AutomationAssumeRole`. (3) Click the "Remediate" button to rerun manually and check the detailed execution logs in the SSM Automation console. Recreating the rule (A) does not address the root cause.

---

**Question 6.** An operator wants to investigate "who added this SG rule yesterday, and what is the full current state of this SG?" Which tools should be used, and in what order?

A) Config alone can answer both questions
B) Check in CloudTrail who added it via the `AuthorizeSecurityGroupIngress` event → check the current SG state in the Config Resource Timeline
C) CloudTrail alone can answer both questions
D) Use GuardDuty to check both questions at once

**Answer: B**
Explanation: "Who added it (action)" = CloudTrail. Check the `userIdentity.arn`, `requestParameters` (FromPort, ToPort, IpProtocol, IpRanges), and `sourceIPAddress` of the `AuthorizeSecurityGroupIngress` event. "Current SG state (state)" = Config. In the Resource Timeline, check all current inbound and outbound rules in the latest snapshot of the `AWS::EC2::SecurityGroup` CI. CloudTrail is an action log and does not show the current state. Config shows the current state but has no actor information about "who changed it". Both tools must be combined for the complete picture.
