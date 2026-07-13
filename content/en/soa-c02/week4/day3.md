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

## 📝 연습 문제

**문제 1.** "S3 버킷이 퍼블릭으로 설정되면 자동으로 차단하고, 보안팀에 알림을 보내라"는 요구사항의 가장 완전한 구성은?

A) Config Rule `s3-bucket-public-read-prohibited` + Auto Remediation (Automatic: true) + SNS 알림
B) CloudTrail 단독
C) Lambda가 주기적으로 S3 버킷 상태를 스캔
D) GuardDuty S3 Protection만

**정답: A**
해설: Config Rule(Configuration Change 트리거, 버킷 변경 즉시 평가) → NON_COMPLIANT 감지 → Auto Remediation(SSM `AWS-DisableS3BucketPublicReadWrite`) → 자동 차단. 알림은 Config가 SNS에 직접 전달하거나, EventBridge Rule(Config Compliance 상태 변경 이벤트)에서 SNS로 보낸다. C는 주기 사이 노출 시간이 있다. B는 행위만 기록하고 상태를 추적·교정하지 않는다. D는 위협 감지 도구이지 컴플라이언스 교정 도구가 아니다.

---

**문제 2.** Root 계정 MFA 활성화 여부를 Config Rule로 확인하려 한다. 어떤 평가 트리거를 선택해야 하는가?

A) Configuration Change — Root 계정 MFA 변경 시 즉시 평가
B) Periodic — 정기적으로 상태를 확인 (Root MFA 상태 변경이 Config 변경 이벤트로 발생하지 않음)
C) 두 트리거를 모두 사용
D) EventBridge 트리거 (별도 설정)

**정답: B**
해설: Root 계정의 MFA 디바이스 추가/삭제는 Config가 리소스 변경 이벤트로 인식하지 못한다. CI가 새로 생성되지 않으므로 Configuration Change 트리거가 발동할 조건이 없다. 따라서 `root-account-mfa-enabled` Managed Rule은 기본적으로 Periodic 트리거(24시간 주기)로 동작한다. 반면 S3 버킷 ACL 변경이나 SG 규칙 변경은 CI 생성 이벤트가 있어 Configuration Change 트리거가 작동한다.

---

**문제 3.** 회사가 PCI-DSS 컴플라이언스를 위해 관련 Config Rule 40개를 배포해야 한다. 가장 효율적인 방법은?

A) AWS 콘솔에서 Rule을 하나씩 수동 생성 (40회)
B) Conformance Pack `Operational-Best-Practices-for-PCI-DSS` 단일 배포
C) CloudFormation으로 40개 Rule 템플릿 작성
D) Terraform으로 Rule을 하나씩 배포

**정답: B**
해설: Conformance Pack은 컴플라이언스 프레임워크별로 관련 Rule·Remediation을 묶어 단 한 번의 배포로 적용한다. PCI-DSS Conformance Pack에는 관련 Rule이 이미 포함돼 있다. `put-conformance-pack` 한 번으로 배포 완료. A는 40회 수동 작업으로 누락 위험. C와 D는 Rule을 직접 나열해야 해 Conformance Pack보다 작업량이 많고 유지보수가 복잡하다.

---

**문제 4.** Config Aggregator를 어느 계정에 배치하는 것이 Landing Zone 표준인가?

A) 워크로드가 가장 많은 Production 계정
B) Audit Account — 워크로드와 분리된 전용 감사 계정
C) Management Account (조직 루트 계정)
D) 각 계정에 개별 Aggregator 배치

**정답: B**
해설: Landing Zone(Control Tower, AWS Well-Architected 권고) 설계에서 Aggregator는 Audit Account에 위치한다. Management Account는 SCP 적용 불가 + 조직 관리 전용이며 워크로드나 감사 도구를 두지 않는다. Audit Account는 로그 아카이브와 컴플라이언스 집약 전용이다. 이 분리가 핵심 보안 원칙이다 — 워크로드 계정이 침해되더라도 감사 데이터는 Audit Account의 별도 보안 통제 하에 안전하게 보호된다.

---

**문제 5.** Auto Remediation이 설정됐는데 NON_COMPLIANT 리소스가 자동 교정되지 않는다. 트러블슈팅 순서로 가장 적합한 것은?

A) Config Rule을 삭제하고 다시 생성
B) Config 콘솔 → Rule → Remediation Execution Status 확인 → AutomationAssumeRole IAM 권한 검토 → SSM Automation 실행 로그 확인
C) S3 Delivery Channel 재설정
D) Configuration Recorder 재시작

**정답: B**
해설: Auto Remediation 실패의 가장 흔한 원인은 IAM 권한 부족이다. 트러블슈팅 순서: (1) Config 콘솔에서 해당 Rule의 Remediation Execution Status를 확인해 실패/성공 여부와 오류 메시지 파악. (2) 오류가 AccessDenied라면 `AutomationAssumeRole`의 IAM 정책에서 필요한 권한(예: `s3:PutBucketPublicAccessBlock`) 추가. (3) 수동으로 "Remediate" 버튼을 눌러 재실행하고 SSM Automation 콘솔에서 상세 실행 로그 확인. Rule 재생성(A)은 근본 원인을 해결하지 않는다.

---

**문제 6.** 운영자가 "어제 누가 이 SG 규칙을 추가했고, 현재 이 SG의 전체 상태는?"을 조사하려 한다. 어떤 도구를 어떤 순서로 사용하는가?

A) Config만으로 두 질문 모두 답할 수 있다
B) CloudTrail에서 `AuthorizeSecurityGroupIngress` 이벤트로 누가 추가했는지 확인 → Config Resource Timeline에서 현재 SG 상태 확인
C) CloudTrail만으로 두 질문 모두 답할 수 있다
D) GuardDuty로 두 질문을 동시에 확인한다

**정답: B**
해설: "누가 추가했나(행위)" = CloudTrail. `AuthorizeSecurityGroupIngress` 이벤트의 `userIdentity.arn`, `requestParameters`(FromPort, ToPort, IpProtocol, IpRanges), `sourceIPAddress`로 확인한다. "현재 SG 상태(상태)" = Config. Resource Timeline에서 `AWS::EC2::SecurityGroup` CI의 최신 스냅샷에서 현재 모든 인바운드·아웃바운드 규칙을 확인한다. CloudTrail은 행위 로그이지 현재 상태를 보여주지 않는다. Config는 현재 상태를 보여주지만 "누가 바꿨는지"의 행위자 정보가 없다. 두 도구를 조합해야 완전한 그림이 나온다.
