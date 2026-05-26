# Day 4 - Parameter Store, Session Manager, Automation Runbook: SSM 자동화 심화

2019년 7월, 보안 연구자 Paige Thompson이 Capital One에서 1억 6백만 명의 카드 신청 데이터를 탈취했다. 공격 경로는 이랬다. WAF의 SSRF 취약점으로 `http://169.254.169.254/latest/meta-data/iam/security-credentials/`에 접근해 EC2의 IAM 임시 자격증명을 탈취했다. 이 자격증명으로 S3 버킷 700개에서 30TB의 데이터를 빼냈다. 문제의 근원 중 하나는 **IMDSv1(인증 없이 메타데이터 접근)** 이었다. 오늘 다루는 Session Manager는 SSH 키나 IMDSv1 없이도 인스턴스에 안전하게 접근하는 방법을 제공하고, Parameter Store는 자격증명을 코드에 하드코딩하지 않는 방법을 제공한다.

오늘은 SSM의 "자동화 심화" 3종 세트를 다룬다. Parameter Store로 설정을 중앙화하고, Session Manager로 SSH/RDP를 대체하며, Automation Runbook으로 복잡한 운영 워크플로를 자동화한다.

## Parameter Store: 설정과 시크릿의 중앙 저장소

Parameter Store는 단순한 키-값 저장소처럼 보이지만, 운영 관점에서 매우 중요한 역할을 한다. "코드와 설정의 분리"(12-Factor App, Factor III)는 현대 애플리케이션의 기본 원칙이다. 환경변수나 설정 파일에 DB 패스워드나 API 키를 넣는 것은 버전 컨트롤에 비밀번호를 노출시키는 위험이 있다. Parameter Store는 이 문제를 해결한다.

**파라미터 계층 구조의 설계 원칙:**

```
/app-name/environment/component/key 패턴 권장

예시:
/myapp/prod/database/host
/myapp/prod/database/port
/myapp/prod/database/password     ← SecureString (KMS 암호화)
/myapp/prod/api/stripe-key        ← SecureString
/myapp/prod/feature/new-search    ← String (Feature Flag)
/shared/global/slack-webhook-url  ← String (공유 설정)
```

계층 구조를 사용하면 `GetParametersByPath`로 한 경로 아래 모든 파라미터를 한 번에 가져올 수 있다. Lambda 함수나 EC2 User Data에서 `/myapp/prod/` 하위 전체를 한 번의 API 호출로 로드하는 것이 가능해진다.

**Standard vs Advanced 비교:**

| 항목 | Standard | Advanced |
|------|----------|----------|
| 최대 파라미터 수 | 10,000개/계정/리전 | 100,000개 |
| 최대 값 크기 | 4KB | 8KB |
| Parameter Policies | 불가 | Expiration, 변경 알림, NoChange 알림 |
| 처리량(TPS) | 40 TPS (기본) | 1,000 TPS (추가 요금) |
| 비용 | 무료 | $0.05/파라미터/월 + API 요금 |

**Parameter Policies (Advanced 전용):**

```bash
# Advanced 파라미터 생성 + 만료 정책
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

- `Expiration`: 지정 날짜에 파라미터 자동 삭제 (임시 자격증명 관리에 유용)
- `ExpirationNotification`: 만료 N일 전 EventBridge → SNS → 담당자 알림
- `NoChangeNotification`: N일 동안 값이 변경되지 않으면 알림 (잊혀진 파라미터 감지)

> 💡 **관련 이론**: Parameter Store의 계층 구조와 Policy 개념은 Linux 파일 시스템의 inode 구조와 유사하다. 파일(파라미터)에 메타데이터(Policy)를 부착하고, 디렉토리(경로 계층)로 논리적 그룹화를 한다. POSIX 표준의 "모든 것은 파일이다" 철학처럼, AWS는 "모든 설정은 Parameter"라는 철학으로 운영 설정을 통일한다. 버전 관리(모든 변경 이력 자동 보존)는 Git의 commit 히스토리와 동일한 개념으로 롤백이 가능하다.

**여러 서비스와의 통합:**

```bash
# CloudFormation에서 동적 참조
# template.yaml
DBPassword:
  !Sub '{{resolve:secretsmanager:${SecretArn}:SecretString:password}}'
  
# 또는 Parameter Store에서
DBHost:
  !Sub '{{resolve:ssm:/myapp/prod/database/host}}'

# EC2 User Data에서 사용
#!/bin/bash
DB_HOST=$(aws ssm get-parameter \
  --name "/myapp/prod/database/host" \
  --query 'Parameter.Value' --output text)
echo "DB_HOST=$DB_HOST" >> /etc/environment

# Lambda 함수에서 사용 (환경변수보다 안전)
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
db_password = config['password']  # 코드에 하드코딩 없이
```

## Parameter Store vs Secrets Manager: 언제 무엇을?

이 두 서비스는 자주 혼동된다. 결정 기준은 명확하다.

| 기준 | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| **자동 회전(Rotation)** | X | O (RDS, Redshift, DocumentDB, Lambda 통합) |
| **크로스 리전 복제** | X | O |
| **크로스 계정 공유** | Advanced + Resource Policy | O (기본 지원) |
| **비용** | 무료/저렴 | $0.40/시크릿/월 + $0.05/10,000 API |
| **값 크기** | 4KB/8KB | 64KB |
| **주요 사용 사례** | 앱 설정, Feature Flag, 정적 비밀 | DB 패스워드 자동 회전, OAuth 토큰 |

**의사결정 흐름:**

```
자동 회전이 필요한가?
    ├── 예 → Secrets Manager
    └── 아니오
         │
         크로스 리전 복제가 필요한가?
         ├── 예 → Secrets Manager
         └── 아니오 → Parameter Store
                      │
                      값이 4KB 초과이거나 Policy가 필요한가?
                      ├── 예 → Parameter Store Advanced
                      └── 아니오 → Parameter Store Standard (무료)
```

> 📚 **사례**: 스타트업 D사가 초기에 Parameter Store SecureString에 RDS 패스워드를 저장했다. 3개월 후 보안 감사에서 "DB 패스워드 90일 회전" 요구사항이 나왔다. Parameter Store는 자동 회전 기능이 없어, 매 90일마다 수동으로 패스워드를 변경하고 Parameter를 업데이트해야 했다. 결국 Secrets Manager로 마이그레이션했고, 이후 RDS와 Lambda 통합으로 자동 회전이 구성됐다. 초기 아키텍처 선택이 중요한 이유다.

## Session Manager: 포트 22 없이 인스턴스 접속

Session Manager는 SSH와 RDP를 완전히 대체하는 AWS 관리형 접속 도구다. 내부적으로는 SSM Agent가 WebSocket 기반의 Session Channel을 생성해 운영자 CLI와 인스턴스 사이에 암호화된 터널을 형성한다.

**전통적 Bastion vs Session Manager 아키텍처:**

```
전통적 SSH/Bastion 방식:
운영자 → [인터넷] → Bastion(포트 22 오픈) → SSH 키 인증 → EC2(포트 22 오픈)
                                           ↑ 공격 표면 2곳

Session Manager 방식:
운영자 → AWS API(HTTPS) → SSM Service → SSM Agent(아웃바운드 443만) → EC2
                                      ↑ 인바운드 포트 0개
```

**Session Manager의 보안 계층:**

1. **IAM 인증**: `ssm:StartSession` 권한이 있는 IAM User/Role만 접속 가능
2. **리소스 조건**: IAM 정책에서 특정 인스턴스 태그로 접속 범위 제한
3. **MFA 강제**: IAM 조건에 `aws:MultiFactorAuthPresent: true` 추가
4. **자동 로깅**: 모든 세션 입출력을 S3/CloudWatch Logs에 자동 저장
5. **세션 시간 제한**: `idleSessionTimeout`, `maxSessionDuration`
6. **KMS 암호화**: 세션 로그 KMS 암호화

**세밀한 접속 제어 (IAM 정책):**

```json
// "dev 태그 인스턴스에는 접속 가능, prod는 불가" 정책
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

**Session Manager 실전 활용:**

```bash
# 기본 세션 시작
aws ssm start-session --target i-0123456789abcdef0

# 특정 명령 실행 (Interactive 없이)
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartInteractiveCommand \
  --parameters '{"command":["sudo journalctl -u nginx --no-pager -n 50"]}'

# 포트 포워딩: 로컬 포트로 RDS 직접 접근 (RDS에 SG 인바운드 없이!)
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{
    "host": ["mydb.cluster-abc.ap-northeast-2.rds.amazonaws.com"],
    "portNumber": ["5432"],
    "localPortNumber": ["5432"]
  }'
# 이후 로컬에서: psql -h localhost -p 5432 -U admin mydb

# 원격 호스트 포워딩 (EC2 중계 서버 활용)
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["80"],"localPortNumber":["8080"]}'
```

**Session Manager 감사 설정:**

```bash
# Session Preferences Document 업데이트 (계정 단위)
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

> 🔍 **더 깊이**: Session Manager의 `runAsEnabled`와 `runAsDefaultUser`는 중요한 보안 기능이다. 활성화하면 모든 세션이 `ssm-user`(또는 지정한 사용자)로 실행된다. IAM User와 Linux OS User를 매핑할 수 있는 `RunAsUser` 태그도 지원한다. IAM User가 `SessionManagerRunAs` 태그에 `ec2-user`를 설정하면, 그 사용자의 세션은 `ec2-user`로 실행된다. 이로써 누가(IAM User) 어떤 OS 사용자로 접속했는지 세션 로그에서 추적 가능해진다.

**사설 VPC에서 Session Manager:**

```bash
# 3개 Interface Endpoint 생성 (인터넷 없이 Session Manager)
for service in ssm ssmmessages ec2messages; do
  aws ec2 create-vpc-endpoint \
    --vpc-id vpc-0123456789abcdef0 \
    --vpc-endpoint-type Interface \
    --service-name com.amazonaws.ap-northeast-2.$service \
    --subnet-ids subnet-abc subnet-xyz \
    --security-group-ids sg-ssm-endpoints \
    --private-dns-enabled
done
# 이후 포트 22/3389 보안 그룹 규칙 완전 제거 가능
```

## Automation Runbook: 복잡한 운영 작업의 코드화

Automation Runbook(SSM Document Type: Automation)은 여러 단계의 작업을 순서·조건·반복으로 묶어 자동화하는 워크플로 엔진이다. "EC2 패치 후 재부팅, 재부팅 후 헬스체크, 헬스체크 실패 시 롤백"처럼 사람이 수동으로 해야 했던 복잡한 작업을 코드로 표현한다.

**Runbook Action 종류:**

| Action | 용도 |
|--------|------|
| `aws:runCommand` | Run Command 실행 |
| `aws:executeAwsApi` | 임의 AWS API 호출 |
| `aws:waitForAwsResourceProperty` | 리소스 상태 대기 (polling) |
| `aws:assertAwsResourceProperty` | 리소스 속성 검증 |
| `aws:createStack` | CloudFormation Stack 생성 |
| `aws:sleep` | 대기 |
| `aws:branch` | 조건 분기 |
| `aws:loop` | 반복 |
| `aws:approve` | 인간 승인 대기 |
| `aws:invokeLambdaFunction` | Lambda 호출 |
| `aws:changeInstanceState` | EC2 상태 변경 |

**실전 Runbook: 무중단 패치 시퀀스:**

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
  # Step 1: ELB에서 제거
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

  # Step 2: 드레이닝 완료 대기 (최대 300초)
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

  # Step 3: EBS 스냅샷 생성
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

  # Step 4: 패치 적용
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

  # Step 5: 재부팅 완료 대기
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

  # Step 6: 애플리케이션 헬스체크
  - name: ApplicationHealthCheck
    action: aws:runCommand
    inputs:
      DocumentName: AWS-RunShellScript
      InstanceIds:
        - '{{ InstanceId }}'
      Parameters:
        commands:
          - 'curl -sf http://localhost/health || exit 1'

  # Step 7: ELB에 재등록
  - name: RegisterToTargetGroup
    action: aws:executeAwsApi
    inputs:
      Service: elbv2
      Api: RegisterTargets
      TargetGroupArn: '{{ TargetGroupArn }}'
      Targets:
        - Id: '{{ InstanceId }}'
```

**Automation 트리거 패턴:**

| 트리거 | 사용 사례 |
|--------|-----------|
| **수동 (콘솔/CLI)** | 임시 운영, 테스트 |
| **EventBridge → Automation** | CloudTrail 이벤트 기반 자동 복구 |
| **Config Auto Remediation** | 비준수 리소스 자동 수정 |
| **CloudWatch Alarm Action** | 메트릭 이상 시 자동 조치 |
| **Change Manager** | 승인 워크플로 포함 변경 |

**EventBridge로 S3 버킷 Public 설정 자동 차단:**

```bash
# EventBridge Rule: S3 PutBucketAcl 이벤트 → Automation
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

## AppConfig: 런타임 설정의 안전한 배포

AppConfig는 Parameter Store의 "동적 배포" 버전이다. Parameter Store가 정적 설정 저장이라면, AppConfig는 설정 변경을 Canary/Linear 전략으로 점진 배포하고 알람 기반으로 자동 롤백한다.

**AppConfig vs Parameter Store 비교:**

| 항목 | AppConfig | Parameter Store |
|------|-----------|-----------------|
| 배포 전략 | Canary, Linear, AllAtOnce | 없음 (즉시 적용) |
| 자동 롤백 | CloudWatch Alarm 연결 | 없음 |
| 유효성 검사 | JSON Schema, Lambda | 없음 |
| 클라이언트 캐싱 | Lambda Extension으로 자동 캐시 | 직접 구현 |
| 사용 사례 | Feature Flag, 알고리즘 파라미터 | 앱 설정, 비밀 |

**Feature Flag 구현 예시:**

```python
# Lambda에서 AppConfig 사용 (Lambda Powertools 활용)
from aws_lambda_powertools.utilities.feature_flags import FeatureFlags, AppConfigStore

# AppConfig Lambda Extension이 로컬 HTTP로 캐싱된 설정 제공
store = AppConfigStore(
    environment="prod",
    application="OrderService",
    name="FeatureFlags",
    cache_seconds=30  # 30초 캐시 (실시간성과 성능 균형)
)
feature_flags = FeatureFlags(store=store)

def handler(event, context):
    # Feature Flag 확인
    if feature_flags.evaluate(name="new_checkout_flow", default=False):
        return new_checkout_handler(event)
    else:
        return legacy_checkout_handler(event)
```

> 💡 **관련 이론**: AppConfig의 점진 배포 전략은 Netflix가 2012년 설계한 "Simian Army"의 "Canary Analysis" 개념과 같다. 전체 배포 전에 일부 인스턴스/사용자에게 먼저 적용하고, 메트릭을 관찰한 뒤 확대하는 방식이다. 구글의 SRE 책(2016)에서도 같은 패턴을 "gradual rollout"이라 부르며 설정 변경의 표준 방식으로 권장한다. AppConfig가 이 산업 모범 사례를 관리형 서비스로 제공하는 것이다.

## Change Manager: 승인 워크플로 포함 변경 제어

Change Manager는 Automation Runbook에 RFC(Request for Change) 승인 워크플로를 추가한다. ITIL(IT Infrastructure Library) 변경 관리 프로세스의 AWS 구현이다.

```bash
# Change Manager로 변경 요청 생성
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

승인자는 슬랙이나 이메일(SNS → 외부 알림)로 변경 요청 알림을 받고, Change Manager 콘솔에서 승인/거부한다. 승인 후 예약된 시간에 자동으로 실행된다.

## 전체 통합 그림

```
SSM 심화 자동화 통합 구조
============================================================

[Parameter Store]
  /myapp/prod/db/password (SecureString, KMS)
  /myapp/prod/feature/new-search (String, Feature Flag)
       │
       ├── Lambda/EC2에서 실행 시 fetch (코드 분리)
       ├── CloudFormation: {{resolve:ssm:/path/to/param}}
       └── AppConfig: 동적 배포 + 자동 롤백

[Session Manager]
  운영자 (IAM 인증) → SSM → Agent → EC2
       │ 포트 22/3389 없이
       ├── 모든 세션 S3/CW Logs 자동 저장
       ├── 포트 포워딩으로 RDS/Redis 안전 접근
       └── 사설 VPC: VPC Endpoint 3개로 동작

[Automation Runbook]
  EventBridge → Config Auto Remediation
  CloudWatch Alarm → 
  Change Manager (승인) →
  수동 실행 →
       │
       └── Runbook 실행:
           Step 1: ELB Deregister
           Step 2: Snapshot
           Step 3: Patch
           Step 4: Health Check
           Step 5: ELB Register
           (실패 시 자동 롤백)
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
