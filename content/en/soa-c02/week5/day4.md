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

## 📝 연습 문제

**문제 1.** Lambda 함수가 RDS 데이터베이스에 연결하기 위한 비밀번호를 안전하게 관리해야 한다. 90일마다 자동으로 비밀번호가 교체되어야 하고, Lambda 코드 재배포 없이 새 비밀번호를 사용해야 한다. 가장 적합한 도구는?

A) Parameter Store Standard - 비밀번호를 SecureString으로 저장
B) Parameter Store Advanced - NoChangeNotification Policy로 변경 알림
C) Secrets Manager - RDS와의 자동 회전 통합으로 90일 회전 설정
D) 환경변수에 암호화된 비밀번호 저장

**정답: C**
해설: 자동 회전이 핵심 요구사항이다. Parameter Store는 자동 회전 기능이 없어 수동으로 변경해야 한다. Secrets Manager는 RDS와 통합되어 자동 회전 Lambda를 관리해주고, Lambda 함수는 SDK로 최신 값을 자동으로 가져온다. 코드 재배포 없이 새 비밀번호가 적용된다. 비용($0.40/시크릿/월)은 추가되지만 운영 안전성이 크게 향상된다.

---

**문제 2.** 회사 보안 정책상 모든 EC2 접속은 감사 로그로 남아야 하고, 포트 22는 보안 그룹에서 완전히 제거해야 한다. 개발자들은 EC2에 접속하여 로그를 확인하고 디버깅해야 한다. 가장 적합한 솔루션은?

A) Systems Manager Session Manager - IAM 인증, 포트 22 불필요, 자동 세션 로깅
B) AWS VPN + 프라이빗 서브넷의 Bastion Host
C) EC2 Instance Connect - 일시적 SSH 키 방식
D) AWS Direct Connect + SSH 터널

**정답: A**
해설: Session Manager가 세 가지 요구사항을 모두 충족한다. IAM 기반 접근 제어, 포트 22 불필요(아웃바운드 443만), 모든 세션을 S3/CloudWatch Logs에 자동 저장. EC2 Instance Connect(C)는 포트 22가 여전히 필요하다. Bastion Host(B)는 관리 부담이 높고 포트 22가 필요하다.

---

**문제 3.** SSM Automation Runbook에 "변경 전 운영팀 리더의 승인이 필요하다"는 요구사항이 있다. Runbook 실행 중 리더가 승인하기 전까지 다음 단계로 넘어가면 안 된다. 어떻게 구현하는가?

A) Automation을 일시 정지하는 별도 Lambda를 만든다
B) Runbook의 해당 지점에 `aws:approve` action을 추가하고 승인자 IAM ARN과 SNS 알림을 설정한다
C) Change Manager를 사용하되 자동 승인 설정을 한다
D) EventBridge를 통해 수동으로 다음 단계를 트리거한다

**정답: B**
해설: `aws:approve` action은 Automation에 내장된 인간 승인 대기 단계다. `Approvers`에 IAM 사용자 또는 역할 ARN을 지정하고, `NotificationArn`에 SNS 토픽을 설정하면 승인 요청 알림이 전송된다. 지정된 시간(`MinRequiredApprovals`, `Timeout`) 내에 승인하지 않으면 자동 거부된다. 더 정교한 ITSM 워크플로가 필요하면 Change Manager를 사용한다.

---

**문제 4.** 운영팀이 Parameter Store에 저장된 API 키가 3개월 동안 변경되지 않은 경우 알림을 받고 싶다. 또한 만료 예정일 2주 전에도 알림을 받아야 한다. 어떻게 구현하는가?

A) Lambda를 매일 실행해 파라미터 생성일과 현재 날짜를 비교한다
B) Parameter Store Standard에서 CloudWatch Alarm 설정
C) Parameter Store Advanced의 NoChangeNotification Policy(90일)와 ExpirationNotification Policy(14일)를 함께 설정한다
D) Config Rule로 파라미터 변경을 추적한다

**정답: C**
해설: Parameter Store Advanced의 Parameter Policies가 정확한 솔루션이다. `NoChangeNotification`은 지정 기간 동안 값이 변경되지 않으면 EventBridge를 통해 알림을 보낸다. `ExpirationNotification`은 만료 N일 전에 알림을 보낸다. 두 Policy를 함께 설정할 수 있다. Lambda(A)도 동작하지만 불필요한 복잡성이 추가된다. Standard Tier(B)는 Policy 기능이 없다.

---

**문제 5.** Config Rule이 "암호화되지 않은 EBS 볼륨"을 발견했을 때 자동으로 스냅샷을 생성하고 암호화된 볼륨으로 교체하는 작업을 자동화하려 한다. 가장 적합한 구성은?

A) CloudWatch 알람 → SNS → 이메일 알림
B) Config Auto Remediation → SSM Automation Runbook(스냅샷 생성 + 암호화 볼륨 생성 + 교체 + 기존 삭제)
C) GuardDuty → Lambda → 볼륨 암호화
D) Inspector → Run Command

**정답: B**
해설: Config Auto Remediation은 비준수 리소스를 발견하면 자동으로 SSM Automation Document를 실행한다. 다단계 작업(스냅샷 → 새 볼륨 생성 → 교체 → 원본 삭제)이 포함되므로 Run Command보다 Automation Runbook이 적합하다. AWS는 `AWSConfigRemediation-*` 네임스페이스의 표준 Runbook을 다수 제공한다.

---

**문제 6.** Session Manager를 통해 접속하려는데 사설 VPC에 인터넷 게이트웨이가 없다. 필요한 VPC Endpoint는?

A) `ssm`만 필요하다
B) `ssm`과 `ssmmessages`만 필요하다
C) `ssm`, `ssmmessages`, `ec2messages`가 모두 필요하다
D) `ssm`과 별도의 TLS 인증서가 필요하다

**정답: C**
해설: Session Manager는 세 개의 별도 채널을 사용한다. `ssm`은 제어 채널(인스턴스 등록, heartbeat), `ssmmessages`는 세션 채널(실제 세션 트래픽), `ec2messages`는 EC2 메타데이터 채널(Run Command 포함)이다. 세 개 모두 없으면 Session Manager가 동작하지 않는다. S3 Gateway Endpoint도 세션 로그를 S3에 저장하는 경우 추가로 필요하다.

---
