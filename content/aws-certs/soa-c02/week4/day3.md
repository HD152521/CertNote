# Day 24 - AWS Config 심화: Rule 평가 트리거, Custom Rule Lambda, Conformance Pack, Auto Remediation

CloudTrail이 "누가 무엇을 했나(행위)"를 기록한다면, AWS Config는 "지금 어떤 상태인가(상태)"를 지속적으로 추적한다. 이 둘은 경쟁하지 않고 보완한다. CloudTrail이 "누가 S3 버킷 정책을 바꿨는가"를 알려주고, Config가 "그 버킷이 지금 퍼블릭인가, 암호화가 켜져 있는가"를 알려준다. 오늘은 SOA 운영자 관점에서 Config의 Configuration Item 구조, Rule 평가 트리거의 차이, Custom Rule Lambda의 실제 구현, Conformance Pack, Auto Remediation, 그리고 Aggregator로 전사 컴플라이언스 현황을 파악하는 방법까지 깊이 다룬다.

## Configuration Item(CI): 상태 스냅샷의 단위

Config의 기본 데이터 단위는 **Configuration Item(CI)**다. 리소스 변경이 감지될 때마다 새 CI가 생성된다. CI는 그 시점 리소스의 완전한 상태 스냅샷이다.

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

이 CI를 보면 `restricted-ssh` Config Rule이 즉시 NON_COMPLIANT로 판정한다 — 22번 포트가 0.0.0.0/0으로 열려있기 때문이다.

**CI의 status 값**:
- `OK`: 정상 캡처
- `ResourceDiscovered`: 새로 발견된 리소스의 첫 CI
- `ResourceNotRecorded`: 기록 대상이 아닌 리소스 타입
- `ResourceDeleted`: 리소스 삭제됨
- `ResourceDeletedNotRecorded`: 기록 안 되는 리소스 삭제

> 💡 **관련 이론**: CI의 설계는 **Event Sourcing** 패턴과 **Snapshot-based State Tracking**이 결합된 구조다. Martin Fowler(2005)가 정리한 Event Sourcing은 현재 상태 대신 상태 변경 이벤트 시퀀스를 저장한다. Config는 각 변경 시점의 전체 상태(Snapshot)를 저장하므로 엄밀히 Event Sourcing이 아니지만, 타임라인 기반 변경 추적이라는 목적은 동일하다. CI 타임라인은 "3개월 전 이 리소스의 정확한 설정"을 재현하는 감사 증거로 사용된다. 이것이 PCI-DSS나 SOC 2 감사에서 Config가 필수 도구가 된 이유다.

## Configuration Recorder와 비용 구조

Config의 이벤트 수집은 **Configuration Recorder**가 담당한다. 계정+리전당 1개 존재한다.

```bash
# 모든 리소스 유형 + 글로벌 리소스(IAM) 포함 설정
aws configservice put-configuration-recorder \
  --configuration-recorder '{
    "name": "default",
    "roleARN": "arn:aws:iam::111122223333:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig",
    "recordingGroup": {
      "allSupported": true,
      "includeGlobalResourceTypes": true
    }
  }'

# Delivery Channel: CI를 S3로, 변경 알림을 SNS로
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

**Config 비용 구조**:
| 항목 | 비용 |
|------|------|
| CI 기록 | $0.003/CI (AWS 리소스 변경 시마다 생성) |
| Config Rule 평가 | $0.001/1000회 평가 |
| Conformance Pack 평가 | Rule 평가와 동일 |
| Config Rules Data | $0.003/CI (Rule 평가 결과) |

**비용 예시 계산**:
```
환경: EC2 100대, RDS 20개, SG 50개, Rule 50개

월 CI 생성 추정 (변경 빈도):
  EC2 상태 변경 평균 10회/월 × 100 = 1,000 CI
  RDS 유지보수·파라미터 변경 5회/월 × 20 = 100 CI
  SG 규칙 변경 2회/월 × 50 = 100 CI
  합계: ~1,200 CI/월 → $3.60/월

Rule 평가 (Configuration Change 트리거):
  1,200 CI × 50 Rule = 60,000 평가 → $0.06/월

Periodic Rule (24h 주기, 10개 Rule):
  10 Rule × 1회/일 × 30일 = 300 평가 → $0.0003/월

합계: ~$3.66/월 (소규모 환경)
```

> ⚠️ **함정**: `includeGlobalResourceTypes: true`는 IAM 사용자, IAM 역할, IAM 정책 등 글로벌 리소스를 기록한다. IAM은 보안의 핵심이므로 반드시 포함해야 하지만, **멀티 리전 설정에서 각 리전이 동일한 IAM 리소스를 중복 기록**한다. 예를 들어 10개 리전에 Config를 켜면 IAM 변경 하나에 CI가 10개 생성된다. 비용을 줄이려면 특정 리전(예: ap-northeast-2)에서만 `includeGlobalResourceTypes: true`로 설정하고 나머지는 false로 한다.

## Config Rule 평가 트리거: 두 가지 유형의 완전한 이해

Config Rule이 리소스를 평가하는 시점은 두 가지다. 이 차이를 명확히 이해해야 Rule을 올바르게 설계할 수 있다.

### Configuration Change 트리거

리소스의 CI가 새로 생성될 때(= 리소스가 변경됐을 때) 즉시 Rule을 평가한다.

```
리소스 변경 감지
    │
    ▼
새 CI 생성 (수 분 이내)
    │
    ▼
Configuration Change Rule 평가 트리거
    │
    ▼
Rule 평가: COMPLIANT 또는 NON_COMPLIANT 판정
```

**응답 속도**: 변경 후 수 분 이내 (CI 생성 지연 포함).

**적합한 Rule 유형**: 리소스 속성이 변경될 때 즉시 감지해야 하는 보안 Rule.
- `s3-bucket-public-read-prohibited`: 버킷 ACL/정책 변경 시
- `restricted-ssh`: SG 인바운드 룰 변경 시
- `encrypted-volumes`: EBS 볼륨 암호화 속성 변경 시
- `ec2-imdsv2-check`: EC2 메타데이터 설정 변경 시

### Periodic 트리거

지정된 주기마다(1시간, 3시간, 6시간, 12시간, 24시간) 자동으로 Rule을 평가한다. 리소스 변경이 없어도 실행된다.

**적합한 Rule 유형**: Config가 변경 이벤트를 감지하지 못하는 상태를 주기적으로 확인해야 하는 Rule.
- `root-account-mfa-enabled`: Root MFA 상태 변경이 CI 이벤트로 발생하지 않음
- `iam-password-policy`: 계정 레벨 설정, 리소스 변경 이벤트 없음
- `cloudtrail-enabled`: Trail 활성화 여부, 외부 변경 이벤트 없음
- `vpc-flow-logs-enabled`: VPC 레벨 설정

```
[왜 root-account-mfa-enabled는 Periodic인가?]

Config가 이벤트를 감지하려면 CloudTrail이 해당 API 호출을 기록해야 한다.
Root 계정의 MFA 디바이스 등록/해제는 콘솔에서 이루어지고,
이 작업의 CloudTrail 이벤트가 Config가 리소스 변경으로 인식하는 구조가 아니다.
따라서 Config가 "MFA 켜짐" CI를 자동으로 생성하지 않는다.
→ 주기적으로 IAM API를 직접 호출해 MFA 상태를 확인 = Periodic 트리거
```

> 🔍 **더 깊이**: Config Rule 평가 트리거와 범위(Scope) 설정. Configuration Change 트리거에서 `scope`를 지정하면 특정 리소스 유형 변경 시에만 Rule이 실행된다. 예를 들어 `restricted-ssh` Rule의 scope를 `AWS::EC2::SecurityGroup`으로 지정하면, 다른 리소스(EC2 인스턴스 등) 변경 시에는 Rule이 불필요하게 실행되지 않는다. Scope 미지정 시 모든 리소스 변경에 Rule이 실행돼 평가 비용이 증가할 수 있다.

## Custom Rule: Lambda로 맞춤 평가 로직 구현

AWS Managed Rule이 커버하지 않는 비즈니스 특화 컴플라이언스는 Custom Rule로 구현한다. Custom Rule은 Lambda 함수를 평가 엔진으로 사용한다.

### Custom Rule Lambda의 입력 구조

Config가 Lambda를 호출할 때 `invokingEvent`와 `ruleParameters`를 전달한다.

```python
import json
import boto3

config_client = boto3.client('config')

def lambda_handler(event, context):
    """
    Custom Config Rule: EC2 인스턴스에 특정 태그(Owner, CostCenter)가 있어야 한다
    """
    invoking_event = json.loads(event['invokingEvent'])
    rule_parameters = json.loads(event.get('ruleParameters', '{}'))
    
    # Periodic 트리거 vs Configuration Change 트리거 구분
    if invoking_event.get('messageType') == 'ScheduledNotification':
        # Periodic: 모든 EC2 인스턴스를 평가
        evaluate_all_ec2_instances(event, rule_parameters)
        return
    
    # Configuration Change: 변경된 리소스만 평가
    configuration_item = invoking_event.get('configurationItem')
    
    if configuration_item is None:
        return
    
    # 삭제된 리소스는 COMPLIANT로 처리 (이미 없으므로)
    if configuration_item['configurationItemStatus'] in ('ResourceDeleted', 'ResourceDeletedNotRecorded'):
        put_evaluation(
            event['resultToken'],
            configuration_item,
            'NOT_APPLICABLE'
        )
        return
    
    # EC2 인스턴스가 아니면 스킵
    if configuration_item['resourceType'] != 'AWS::EC2::Instance':
        return
    
    # 평가 로직
    compliance = evaluate_compliance(configuration_item, rule_parameters)
    
    put_evaluation(event['resultToken'], configuration_item, compliance)


def evaluate_compliance(configuration_item, rule_parameters):
    """태그 존재 여부 평가"""
    required_tags = rule_parameters.get('requiredTags', 'Owner,CostCenter').split(',')
    tags = configuration_item.get('tags', {})
    
    missing_tags = [tag for tag in required_tags if tag.strip() not in tags]
    
    if missing_tags:
        return 'NON_COMPLIANT'
    return 'COMPLIANT'


def put_evaluation(result_token, configuration_item, compliance):
    """Config에 평가 결과 전달"""
    config_client.put_evaluations(
        Evaluations=[
            {
                'ComplianceResourceType': configuration_item['resourceType'],
                'ComplianceResourceId': configuration_item['resourceId'],
                'ComplianceType': compliance,
                'Annotation': f'평가 시각: {configuration_item["configurationItemCaptureTime"]}',
                'OrderingTimestamp': configuration_item['configurationItemCaptureTime']
            }
        ],
        ResultToken=result_token
    )
```

### Custom Rule 등록

```bash
# Lambda 함수 생성 후 Config Rule로 등록
aws configservice put-config-rule \
  --config-rule '{
    "ConfigRuleName": "ec2-required-tags",
    "Description": "EC2 인스턴스에 Owner와 CostCenter 태그 필수",
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

> 📚 **사례**: 대형 IT 서비스 기업의 태그 정책 자동화. 이 기업은 비용 배분을 위해 모든 EC2, RDS, Lambda에 `Team`, `Project`, `CostCenter` 태그를 필수로 지정했다. Managed Rule에는 태그 Rule이 없어 Custom Rule Lambda를 구현했다. Configuration Change 트리거로 새 리소스 생성 시 즉시 평가하고, NON_COMPLIANT 시 Auto Remediation으로 태그 없는 인스턴스를 Stop 상태로 만드는 규칙을 적용했다. 3개월 만에 무태그 리소스가 23%에서 1.2%로 줄었다.

### configurationItem 파싱 패턴

```python
# CI에서 자주 사용하는 데이터 추출 패턴
def parse_ci(configuration_item):
    """CI에서 주요 정보 파싱"""
    
    # 리소스 식별
    resource_type = configuration_item['resourceType']  # AWS::EC2::Instance
    resource_id = configuration_item['resourceId']      # i-0abc12345
    
    # 리소스 설정 (JSON 문자열 파싱 필요한 경우도 있음)
    configuration = configuration_item.get('configuration', {})
    if isinstance(configuration, str):
        configuration = json.loads(configuration)
    
    # 태그
    tags = configuration_item.get('tags', {})
    
    # 관련 리소스 (예: EC2 → VPC, Subnet)
    relationships = configuration_item.get('relationships', [])
    
    # 리소스 상태
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

## Conformance Pack: 산업 컴플라이언스 번들 배포

Conformance Pack은 관련 Config Rule과 Remediation을 묶어 하나의 CloudFormation 템플릿으로 배포한다.

### 사전 제공 Conformance Pack 목록

| Pack 이름 | 대상 |
|-----------|------|
| `Operational-Best-Practices-for-PCI-DSS` | 결제 카드 산업 |
| `Operational-Best-Practices-for-HIPAA-Security` | 의료 정보 보안 |
| `Operational-Best-Practices-for-NIST-800-53-rev-5` | 미국 정부 |
| `Operational-Best-Practices-for-CIS-AWS-Foundations-Benchmark` | CIS v1.4 |
| `Operational-Best-Practices-for-AWS-Well-Architected-Security` | WA 보안 기둥 |
| `Operational-Best-Practices-for-K-ISMS` | 한국 정보보호 관리체계 |
| `Operational-Best-Practices-for-ISO-27001` | ISO 27001 |
| `Operational-Best-Practices-for-SOC2` | SOC 2 Type II |

### Conformance Pack YAML 구조

```yaml
# 커스텀 Conformance Pack 예시 (일부)
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
  # Rule 1: S3 퍼블릭 접근 차단
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

  # Rule 2: Root MFA 활성화 확인
  RootAccountMFAEnabled:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: root-account-mfa-enabled
      Source:
        Owner: AWS
        SourceIdentifier: ROOT_ACCOUNT_MFA_ENABLED
      MaximumExecutionFrequency: !Ref MaximumExecutionFrequency

  # Auto Remediation: S3 퍼블릭이면 자동 차단
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
# Conformance Pack 배포
aws configservice put-conformance-pack \
  --conformance-pack-name "security-baseline-v1" \
  --template-body file://conformance-pack.yaml

# Organization 전체 배포 (신규 계정 자동 적용)
aws configservice put-organization-conformance-pack \
  --organization-conformance-pack-name "org-security-baseline" \
  --template-s3-uri s3://my-config-templates/conformance-pack.yaml \
  --delivery-s3-bucket org-config-delivery-bucket \
  --excluded-accounts 999988887777  # 특정 계정 제외 (예: Sandbox)
```

> 💡 **관련 이론**: Conformance Pack은 **Policy as Code**의 구현이다. 컴플라이언스 요구사항을 코드(YAML)로 정의하고 버전 관리(Git), 테스트, 배포 파이프라인을 적용하는 것이 현대 클라우드 거버넌스의 표준이다. HashiCorp의 Sentinel, OPA(Open Policy Agent)도 같은 패러다임이다. AWS Config Conformance Pack이 다른 점은 AWS 서비스와 네이티브 통합돼 별도 에이전트나 사이드카 없이 모든 AWS 리소스에 적용된다는 것이다.

## Auto Remediation: SSM Automation으로 자동 교정

Config Rule이 NON_COMPLIANT를 감지하면 SSM Automation Runbook을 자동 실행해 리소스를 교정한다.

### Auto Remediation 전체 흐름

```
리소스 변경 발생
    │
    ▼
Config Rule 평가 (수 분 이내)
    │
    ▼ NON_COMPLIANT 판정
Config → SSM Automation Runbook 자동 트리거
    │
    ▼
SSM Runbook 실행 (AutomationAssumeRole로 권한 획득)
    │
    ├── 성공: 리소스 상태 수정 → 다음 평가 시 COMPLIANT
    └── 실패: CloudWatch Logs에 오류 기록 → 재시도 (MaximumAutomaticAttempts)
    │
    ▼
SNS 알림 (선택적): "Rule X에서 리소스 Y가 자동 교정됨"
```

### 자주 사용하는 Auto Remediation 매핑

| Config Rule | SSM Automation Runbook | 교정 내용 |
|-------------|----------------------|----------|
| `s3-bucket-public-read-prohibited` | `AWS-DisableS3BucketPublicReadWrite` | S3 퍼블릭 액세스 차단 |
| `restricted-ssh` | `AWS-DisablePublicAccessForSecurityGroup` | 0.0.0.0/0:22 규칙 삭제 |
| `encrypted-volumes` | `AWSConfigRemediation-EnableEbsEncryptionByDefault` | EBS 기본 암호화 활성화 |
| `iam-access-keys-rotated` (90일 초과) | `AWSConfigRemediation-DisableIamAccessKey` | 오래된 Access Key 비활성화 |
| `ec2-instance-no-public-ip` | `AWSConfigRemediation-ReleaseElasticIpAddress` | EIP 해제 |
| `cloudtrail-enabled` | `AWSConfigRemediation-CreateCloudTrailMultiRegionTrail` | Trail 자동 생성 |

### Auto Remediation 상세 설정

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

**핵심 파라미터 설명**:

| 파라미터 | 값 | 의미 |
|---------|---|------|
| `Automatic` | true/false | true: 자동 실행, false: 수동 트리거만 |
| `MaximumAutomaticAttempts` | 1~25 | 교정 실패 시 최대 재시도 횟수 |
| `RetryAttemptSeconds` | 10~2592000 | 재시도 간격(초) |
| `ConcurrentExecutionRatePercentage` | 1~100 | 대량 NON_COMPLIANT 시 동시 교정 비율 |
| `ErrorPercentage` | 1~100 | 이 비율 초과 실패 시 나머지 교정 중단 |

> ⚠️ **함정**: Auto Remediation 실패의 가장 흔한 원인 두 가지.
> 1. **IAM 권한 부족**: `AutomationAssumeRole`에 Runbook이 필요한 권한이 없으면 AccessDenied. S3 퍼블릭 차단 Runbook이라면 `s3:PutBucketPublicAccessBlock` 권한 필요. Config 콘솔 > Rule > Remediation Execution Status에서 오류 확인.
> 2. **Resource Lock**: 이미 삭제됐거나 특정 서비스에 의해 관리되는 리소스는 교정이 실패한다. 예: AWS Control Tower가 관리하는 특정 버킷은 퍼블릭 설정 변경 자체가 차단된다.

### AutomationAssumeRole 최소 권한 설정

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

## Multi-Account Aggregator: 전사 컴플라이언스 현황

Aggregator는 여러 계정과 리전의 Config 데이터를 하나의 뷰로 집약한다. **Audit Account에 Aggregator를 배치하는 것**이 Landing Zone 표준이다.

### Organization Aggregator 구성

```bash
# Audit Account에서 Organization Aggregator 생성
aws configservice put-configuration-aggregator \
  --configuration-aggregator-name "org-config-aggregator" \
  --organization-aggregation-source '{
    "RoleArn": "arn:aws:iam::111122223333:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig",
    "AllAwsRegions": true
  }' \
  --region ap-northeast-2  # Aggregator는 한 리전에만 배포

# 수동 계정 Aggregator (Organization이 아닌 경우)
aws configservice put-configuration-aggregator \
  --configuration-aggregator-name "manual-aggregator" \
  --account-aggregation-sources '[
    {
      "AccountIds": ["111111111111", "222222222222", "333333333333"],
      "AllAwsRegions": true
    }
  ]'
```

### Aggregator 쿼리: 전사 비준수 현황 파악

```bash
# 전체 계정에서 NON_COMPLIANT Rule 목록
aws configservice describe-aggregate-compliance-by-config-rules \
  --configuration-aggregator-name "org-config-aggregator" \
  --filters "ComplianceType=NON_COMPLIANT" \
  --query 'AggregateComplianceByConfigRules[*].[ConfigRuleName, Compliance.ComplianceType, AccountId, AwsRegion]' \
  --output table

# 가장 많이 NON_COMPLIANT인 Rule 집계
aws configservice get-aggregate-compliance-details-by-config-rule \
  --configuration-aggregator-name "org-config-aggregator" \
  --config-rule-name "restricted-ssh" \
  --compliance-type NON_COMPLIANT
```

### Config + Security Hub 통합

Config Rule 평가 결과가 Security Hub Finding으로 자동 전달된다.

```
Config Rule 평가 → NON_COMPLIANT
    │
    ▼ (자동, 설정 불필요)
Security Hub Finding 생성
    type: "Software and Configuration Checks/AWS Security Best Practices"
    severity: CRITICAL, HIGH, MEDIUM, LOW (Rule별 설정)
    │
    ▼
Security Hub 콘솔 → GuardDuty 위협 + Config 비준수 + Inspector 취약점 통합 뷰
```

> 📚 **사례**: 2022년 국내 한 금융 기업의 "Continuous Compliance" 도입 사례. 이 기업은 분기 1회 수동 컴플라이언스 점검을 Config + Auto Remediation으로 대체했다. 도입 전: S3 퍼블릭 노출 평균 탐지-교정 시간 4시간. 도입 후: 3분 이내로 단축. 동시에 6개월간 S3 퍼블릭 노출 사고 0건. SOC 2 감사 시 Config Resource Timeline을 감사 증거로 제출해 "어느 시점에 어느 리소스가 어떤 상태였는가"를 분 단위로 증명했다.

## CloudTrail vs Config: 정확한 상호 보완 관계

| 질문 | 도구 |
|------|------|
| "어제 이 S3 버킷 정책을 누가 바꿨나?" | CloudTrail |
| "이 S3 버킷이 현재 퍼블릭인가?" | Config |
| "이 버킷이 언제부터 퍼블릭이었나?" | Config (Resource Timeline) |
| "퍼블릭으로 바꾼 API 호출의 소스 IP, UserAgent?" | CloudTrail |
| "전체 계정에서 퍼블릭 버킷이 몇 개인가?" | Config Aggregator |
| "퍼블릭 버킷을 자동으로 닫을 수 있나?" | Config Rule + Auto Remediation |
| "퍼블릭 설정 변경 시 즉각 알림 + 자동 롤백?" | CloudTrail(EventBridge) + Config(Auto Remediation) |

둘 중 하나만 활성화하면 완전한 감사 능력을 갖출 수 없다. "CloudTrail이 있으면 Config가 필요 없다"거나 반대로 생각하는 것이 시험과 실무에서 가장 자주 나오는 오류다.

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
