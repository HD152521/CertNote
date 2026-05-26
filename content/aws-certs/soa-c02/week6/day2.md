# Day 2 - Change Set, Drift Detection, Rollback Trigger: 안전한 CFn 운영의 3대 기둥

2021년 1월, Fastly CDN의 대규모 장애가 발생했다. 원인은 소프트웨어 배포 중 설정 변경이 예상치 못한 방식으로 상호작용해 CDN 서비스가 전체적으로 응답을 멈췄기 때문이다. GitHub, Twitch, Amazon, The Guardian, Financial Times 등 수만 개의 사이트가 약 49분간 다운됐다. Fastly의 CEO는 사후 보고서에서 "배포 전 변경 사항을 충분히 검증하지 않았다"고 밝혔다.

CloudFormation에서 이런 사고를 방지하는 3가지 도구가 있다. **Change Set**은 배포 전 변경 사항을 dry-run으로 확인하고, **Drift Detection**은 수동 변경으로 생긴 현실과 코드의 괴리를 감지하며, **Rollback Trigger**는 배포 후 서비스 이상이 감지되면 자동으로 이전 상태로 되돌린다. 세 도구는 각각 배포 전(Change Set), 상시 운영(Drift Detection), 배포 후(Rollback Trigger)라는 시간대를 담당한다.

## Change Set: "먼저 보고 실행한다"

Terraform을 써본 운영자라면 `terraform plan`에 익숙할 것이다. Change Set은 CloudFormation의 `terraform plan`이다. `update-stack`은 즉시 변경을 시작하지만, Change Set은 "어떤 리소스가 어떻게 바뀔지"를 미리 보여준다.

**Change Set의 내부 동작:**

1. 현재 Stack의 Template와 새 Template를 비교
2. 각 리소스에 대해 필요한 Action(Add/Modify/Remove)을 계산
3. Modify인 경우 해당 변경이 Replacement(재생성)를 유발하는지 분석
4. 실제 리소스는 건드리지 않고 계획만 반환

**Replacement 판단 기준:**

AWS는 각 리소스 속성마다 변경 가능 여부를 문서화한다. 속성이 "Update requires: Replacement"이면 해당 속성을 변경할 때 리소스가 재생성된다.

| Replacement 값 | 의미 | 운영자 대응 |
|----------------|------|-------------|
| `True` | 반드시 재생성. 기존 리소스 삭제 후 신규 생성 | 데이터 손실 위험, UpdateReplacePolicy 확인 필수 |
| `False` | 인플레이스 업데이트. 기존 리소스에 속성만 변경 | 안전. 즉시 실행 가능 |
| `Conditional` | 다른 속성 값에 따라 런타임에 결정 | 추가 확인 필요, 보수적으로 접근 |
| `N/A` | Add/Remove 작업에는 적용 없음 | 추가 리소스면 새로 생성, Remove면 삭제됨 주의 |

**자주 Replacement를 유발하는 속성 변경:**

| 리소스 타입 | 변경 속성 | Replacement |
|-------------|-----------|-------------|
| `AWS::RDS::DBInstance` | `MultiAZ` false→true | True |
| `AWS::RDS::DBInstance` | `DBInstanceIdentifier` | True |
| `AWS::S3::Bucket` | `BucketName` | True |
| `AWS::EC2::Instance` | `ImageId` (AMI) | True |
| `AWS::DynamoDB::Table` | `TableName` | True |
| `AWS::ElastiCache::ReplicationGroup` | `ClusterMode` | True |
| `AWS::Lambda::Function` | `FunctionName` | True |
| `AWS::RDS::DBInstance` | `DBInstanceClass` (대부분) | False |
| `AWS::EC2::SecurityGroup` | `SecurityGroupIngress` 추가 | False |
| `AWS::EC2::Instance` | `InstanceType` (EBS 최적화 동일한 경우) | Conditional |

**실전 Change Set 워크플로:**

```bash
# 1. Change Set 생성 (실제 변경 없음)
aws cloudformation create-change-set \
  --stack-name my-prod-app \
  --template-body file://new-template.yaml \
  --change-set-name "release-2.1-$(date +%Y%m%d-%H%M)" \
  --parameters ParameterKey=AppVersion,ParameterValue=2.1 \
  --capabilities CAPABILITY_NAMED_IAM

# 2. Change Set 상태가 CREATE_COMPLETE가 될 때까지 대기
aws cloudformation wait change-set-create-complete \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"

# 3. 변경 사항 상세 확인 (핵심: Replacement 필드)
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

# 출력 예시:
# Action   | LogicalId          | Type                    | Replacement | Scope
# ---------|--------------------|-----------------------------|-------------|----------
# Modify   | WebServer          | AWS::EC2::Instance          | False       | [Properties]
# Modify   | DBInstance         | AWS::RDS::DBInstance        | Conditional | [Properties]
# Add      | NewSecurityGroup   | AWS::EC2::SecurityGroup     | N/A         | []
# Remove   | OldCacheCluster    | AWS::ElastiCache::...       | N/A         | []

# 4a. Replacement=True가 없으면 실행
aws cloudformation execute-change-set \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"

# 4b. 위험한 변경이 있으면 폐기
aws cloudformation delete-change-set \
  --stack-name my-prod-app \
  --change-set-name "release-2.1-20260527-1430"
```

> 🔍 **더 깊이**: Change Set이 "Replacement: Conditional"이라고 표시하는 경우, AWS는 런타임 이전에 해당 변경이 Replacement를 유발할지 확실히 알 수 없다는 의미다. 예를 들어 RDS의 `DBSubnetGroupName`을 변경하면, 새 서브넷 그룹이 기존 DB와 같은 VPC에 있으면 인플레이스 업데이트가 가능하지만 다른 VPC이면 Replacement가 필요하다. EC2 `InstanceType` 변경도 현재 인스턴스가 EBS 최적화를 지원하면 False, 지원 여부가 달라지면 Conditional이 될 수 있다. Conditional을 만나면 해당 리소스의 AWS 문서를 직접 확인해 런타임 조건을 이해해야 한다. 상용 환경에서 Conditional이 나오면 항상 더 안전한 전략(스냅샷 선행 생성 등)을 고려해야 한다.

**CI/CD 파이프라인에서 Change Set 자동화:**

```bash
# 자동화 스크립트: Replacement=True가 있으면 파이프라인 중단
STACK_NAME="my-prod-app"
CHANGE_SET_NAME="pipeline-$(date +%Y%m%d-%H%M%S)"

# Change Set 생성
aws cloudformation create-change-set \
  --stack-name $STACK_NAME \
  --template-body file://new-template.yaml \
  --change-set-name $CHANGE_SET_NAME \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation wait change-set-create-complete \
  --stack-name $STACK_NAME \
  --change-set-name $CHANGE_SET_NAME

# Replacement=True 또는 Conditional 리소스 확인
RISKY_RESOURCES=$(aws cloudformation describe-change-set \
  --stack-name $STACK_NAME \
  --change-set-name $CHANGE_SET_NAME \
  --query 'Changes[?ResourceChange.Replacement==`True` || ResourceChange.Replacement==`Conditional`].[ResourceChange.LogicalResourceId, ResourceChange.Replacement]' \
  --output text)

if [ -n "$RISKY_RESOURCES" ]; then
  echo "⚠️  WARNING: 다음 리소스가 교체될 수 있습니다:"
  echo "$RISKY_RESOURCES"
  echo "수동 검토 및 승인이 필요합니다."
  # Change Set 삭제 (미실행)
  aws cloudformation delete-change-set \
    --stack-name $STACK_NAME \
    --change-set-name $CHANGE_SET_NAME
  exit 1
fi

# 안전하면 자동 실행
aws cloudformation execute-change-set \
  --stack-name $STACK_NAME \
  --change-set-name $CHANGE_SET_NAME

aws cloudformation wait stack-update-complete --stack-name $STACK_NAME
echo "배포 완료"
```

> 💡 **관련 이론**: Change Set의 설계는 소프트웨어 공학의 "Preview Before Commit" 원칙을 인프라에 적용한 것이다. Git의 `git diff --staged`가 commit 전 변경 내용을 보여주는 것처럼, Change Set은 인프라 변경의 diff를 보여준다. 두 방식 모두 "인간이 검토할 기회를 제공한 후 실행"한다는 점에서 동일하다. 분산 시스템 이론에서는 이를 "Two-Phase Commit의 단순화"로 볼 수 있다: Phase 1(Prepare = Change Set 생성)에서 변경 계획을 수립하고, Phase 2(Commit = execute-change-set)에서 실제 반영한다. CloudFormation의 Change Set은 중간에 인간 검토를 삽입한 "Human-in-the-loop 2PC"이다.

## Drift Detection: "코드와 현실의 괴리를 찾아라"

운영 중에는 반드시 코드와 현실이 벗어나는 경우가 생긴다. 긴급 장애 대응으로 보안 그룹에 직접 규칙을 추가했거나, 누군가 콘솔에서 인스턴스 타입을 바꿨거나, CloudFormation 외부에서 태그를 추가했을 수 있다. Drift Detection은 이런 괴리를 감지한다.

**Drift Detection 동작 원리:**

CloudFormation이 각 Stack 리소스에 대해 현재 실제 리소스 설정을 AWS API로 조회하고, Template에 정의된 원하는 상태(Expected)와 비교한다.

| Drift 상태 | 의미 | 운영자 조치 |
|------------|------|-------------|
| `IN_SYNC` | Template과 실제 상태 일치 | 정상 |
| `MODIFIED` | Template에는 있지만 일부 속성이 변경됨 | 변경된 속성 확인 후 CFn으로 교정 또는 Template 업데이트 |
| `DELETED` | Template에는 있지만 실제 리소스가 삭제됨 | Stack 재배포로 리소스 복원 |
| `NOT_CHECKED` | Drift Detection이 해당 리소스 타입을 지원하지 않음 | 수동 확인 필요 |

**Drift Detection 실행:**

```bash
# Drift Detection 시작 (비동기)
DRIFT_ID=$(aws cloudformation detect-stack-drift \
  --stack-name my-prod-app \
  --query 'StackDriftDetectionId' \
  --output text)

echo "Drift Detection ID: $DRIFT_ID"

# 완료 대기 (보통 수십 초 ~ 수 분)
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

# Drift가 있는 리소스 조회
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-prod-app \
  --stack-resource-drift-status-filters MODIFIED DELETED \
  --query 'StackResourceDrifts[*].[LogicalResourceId,ResourceType,StackResourceDriftStatus]' \
  --output table

# 특정 리소스의 상세 Drift 내용 (어떤 속성이 변경됐는지)
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-prod-app \
  --stack-resource-drift-status-filters MODIFIED \
  --query 'StackResourceDrifts[*].{Resource:LogicalResourceId,Diffs:PropertyDifferences}' \
  --output json
```

**상세 Drift 출력 해석:**

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
이 출력은 `WebServerSG` 보안 그룹에 Template에 없는 SSH(22번 포트, 전체 개방) 규칙이 추가됐음을 보여준다.

**Drift Detection 제한 사항:**

1. 모든 리소스 타입을 지원하지 않는다 (지원 목록: AWS 문서의 "Resources that support import and drift detection operations")
2. CloudFormation **외부에서 추가된** 리소스는 감지하지 못한다 (Stack이 모르는 리소스)
3. 삭제·수정된 것만 감지 가능 (Stack 관리 리소스의 외부 변경만 감지)
4. 비동기 작업이므로 완료 대기가 필요하다
5. 대규모 Stack(100+ 리소스)은 Drift Detection에 수 분이 걸릴 수 있다

> 📚 **사례**: 2023년 핀테크 G사에서 개발자가 긴급 장애 대응 중 CFn으로 관리되는 보안 그룹에 `0.0.0.0/0:22`(전체 SSH 개방) 규칙을 추가했다. 장애는 복구됐지만 이 규칙이 3개월 동안 남아 있었다. 외부 취약점 스캐너가 발견했을 때 이미 개인정보보호법 위반 가능성이 있었다. 만약 매일 Drift Detection이 자동으로 실행되고 있었다면 당일 감지해 즉시 수정됐을 것이다. 이 사건 이후 EventBridge Scheduled Rule + Lambda + Drift Detection + SNS 알림의 자동화 파이프라인을 구축했다. NIST SP 800-53 CM-3(Configuration Change Control)와 CM-6(Configuration Settings) 요구사항을 이 자동화로 충족한다.

**자동화 Drift 점검 패턴 (EventBridge + Lambda):**

```python
# Lambda 함수: 매일 Drift 점검 후 SNS 알림
import boto3
import time

def handler(event, context):
    cfn = boto3.client('cloudformation')
    sns = boto3.client('sns')
    
    # 운영 Stack 목록 조회 (prod 태그 필터링)
    paginator = cfn.get_paginator('describe_stacks')
    drifted_stacks = []
    
    for page in paginator.paginate():
        for stack in page['Stacks']:
            if stack['StackStatus'] not in ['CREATE_COMPLETE', 'UPDATE_COMPLETE']:
                continue
            
            # Drift Detection 시작
            resp = cfn.detect_stack_drift(StackName=stack['StackName'])
            detection_id = resp['StackDriftDetectionId']
            
            # 완료 대기 (최대 60초)
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
        message = "CloudFormation Drift 감지:\n\n"
        for item in drifted_stacks:
            message += f"- {item['stack']}: {item['drifted_count']}개 리소스 drift\n"
        
        sns.publish(
            TopicArn='arn:aws:sns:ap-northeast-2:123456789012:ops-alerts',
            Message=message,
            Subject='[경보] CloudFormation Drift 감지'
        )
    
    return {'drifted_stacks': len(drifted_stacks)}
```

> 🔍 **더 깊이**: Drift Detection의 근본 문제는 "코드 → 현실"이 아니라 "현실 → 코드"로의 방향 역전이 필요하다는 것이다. Drift가 감지됐을 때 두 가지 전략이 있다: (1) **Revert**: 실제 리소스를 Template 상태로 되돌린다(재배포). 긴급 수동 변경이 잘못된 경우, (2) **Adopt**: Template를 실제 상태로 업데이트한다. 수동 변경이 의도적이고 옳은 경우. 어떤 전략을 선택할지는 비즈니스 판단이 필요하다. AWS Config와 Drift Detection을 함께 사용하면 "누가 언제 바꿨는가(CloudTrail 연계)"와 "무엇이 어떻게 바뀌었는가(Drift)"를 모두 파악할 수 있다.

## Rollback Trigger: "배포 후 10분이 안전 기준"

Rollback Trigger는 Stack 업데이트가 완료된 후 지정된 시간 동안 CloudWatch Alarm을 모니터링하다가 알람이 발생하면 자동으로 이전 상태로 롤백하는 기능이다.

**설계 배경:**

Netflix의 "Fail Fast, Recover Faster" 원칙에서 영감을 받은 패턴이다. Martin Fowler가 2010년 정의한 "Canary Release"에서 "새 버전이 문제를 일으키면 즉시 되돌린다"는 개념을 CloudFormation 레벨에서 구현한 것이다. Blue-Green 배포와 다른 점은 인프라를 두 벌 유지하지 않는다는 것이고, 대신 "변경 후 모니터링 기간"으로 안전을 확보한다.

**Rollback Trigger 설정:**

```bash
# CloudWatch Alarm 먼저 생성
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
  --treat-missing-data notBreaching  # 데이터 없으면 정상으로 처리

# Rollback Trigger 포함 Stack 업데이트
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

# Change Set과 함께 사용 (권장)
aws cloudformation execute-change-set \
  --stack-name my-prod-app \
  --change-set-name my-change-set \
  --disable-rollback false  # 기본값, 명시적으로 지정
```

**Rollback Trigger 동작 시나리오:**

```
Time 0:00 → update-stack 실행 (RollbackTriggers 설정 포함)
Time 0:05 → UPDATE_COMPLETE (리소스 변경 완료)
            │
            └── [MonitoringTimeInMinutes = 10분 카운트다운 시작]
                      │
                      │ CloudFormation이 10분 동안 지정된 Alarm 상태 폴링
                      │
Time 0:08 → HighErrorRate-ProdALB 알람이 ALARM 상태 전환!
            (5xx 에러 10개/분 초과)
                      │
Time 0:08 → UPDATE_ROLLBACK_IN_PROGRESS 자동 시작
                      │
Time 0:12 → UPDATE_ROLLBACK_COMPLETE (이전 상태 복원)
            운영자에게 SNS 알림 (알람 액션)

─────────────────────────────────────────

vs. 정상 배포 시나리오:

Time 0:00 → update-stack 실행
Time 0:05 → UPDATE_COMPLETE
Time 0:15 → MonitoringTime 10분 완료, 알람 발생 없음
            UPDATE_COMPLETE 상태 확정 (모니터링 기간 종료)
            → 이후 알람 발생해도 자동 롤백 없음 (수동 대응 필요)
```

**Rollback 알람 선택 원칙:**

| 알람 유형 | 추천 이유 | 설정 팁 |
|-----------|-----------|---------|
| `HTTPCode_Target_5XX_Count` | 배포 직후 즉각 반응, 직접적인 장애 지표 | threshold: 10-50/분, period: 60초 |
| `TargetResponseTime` P99 | 성능 저하 조기 감지 | threshold: 2-5초, evaluation: 3회 |
| `UnhealthyHostCount` | 인스턴스 이상 직접 감지 | threshold: 0 초과, treat-missing-data: missing |
| `Lambda Errors` | Lambda 기반 앱의 에러 감지 | threshold: 1-5%, period: 60초 |
| Custom Metric | 비즈니스 KPI (주문 성공률 등) | 고급 패턴, 별도 메트릭 퍼블리시 필요 |

> ⚠️ **함정**: Rollback Trigger의 모니터링 기간은 업데이트 **완료 후**에만 적용된다. 업데이트 **진행 중**에는 알람 모니터링이 없다. 또한 `MonitoringTimeInMinutes`가 지나면 그 이후의 알람 발생은 자동 롤백을 트리거하지 않는다. 최대 5개 트리거를 설정할 수 있으며, 하나라도 ALARM 상태가 되면 롤백이 시작된다. 알람의 `treat-missing-data`를 `breaching`으로 설정하면 배포 직후 메트릭 데이터가 없을 때도 롤백이 시작될 수 있다. 반드시 `notBreaching`으로 설정한다.

> 💡 **관련 이론**: Rollback Trigger의 "모니터링 후 확정" 패턴은 제어 이론의 **피드백 제어 루프(Feedback Control Loop)**와 동일하다. 시스템 출력(서비스 지표)을 측정하고, 원하는 상태(정상 에러율)와 비교해, 벗어나면 교정 액션(롤백)을 취한다. 이 패턴은 1940년대 Norbert Wiener의 사이버네틱스(Cybernetics) 이론에 뿌리를 둔다. 현대 소프트웨어에서 동일한 패턴을 Kubernetes HPA(Horizontal Pod Autoscaler), AWS Auto Scaling의 Step Scaling Policy에서도 볼 수 있다.

## Termination Protection: 실수 삭제 방지

```bash
# Termination Protection 활성화 (prod Stack 필수)
aws cloudformation update-termination-protection \
  --stack-name my-prod-app \
  --enable-termination-protection

# 삭제 시도 → 오류
aws cloudformation delete-stack --stack-name my-prod-app
# Error: "Stack [my-prod-app] cannot be deleted while TerminationProtection is enabled"

# 삭제하려면 먼저 보호 해제
aws cloudformation update-termination-protection \
  --stack-name my-prod-app \
  --no-enable-termination-protection

# 이제 삭제 가능
aws cloudformation delete-stack --stack-name my-prod-app
```

**생성 시 즉시 활성화 (권장):**

```bash
# Stack 생성 시점에 Termination Protection 활성화
aws cloudformation create-stack \
  --stack-name my-prod-app \
  --template-body file://template.yaml \
  --enable-termination-protection \
  --capabilities CAPABILITY_NAMED_IAM
```

## Stack Policy vs Termination Protection vs IAM 정책 비교

| 보호 메커니즘 | 보호 대상 | 보호 범위 | 우회 방법 | 주요 사용 목적 |
|---------------|-----------|-----------|-----------|----------------|
| **Termination Protection** | Stack 자체 삭제 | Stack 레벨 | 보호 해제 후 삭제 | 실수 삭제 방지 |
| **Stack Policy** | 업데이트 시 특정 리소스 수정/삭제 | 리소스 레벨 | 임시 override 정책 | 핵심 리소스 실수 변경 방지 |
| **IAM 정책** | CloudFormation API 호출 자체 | 사용자/역할 레벨 | 권한 부여 필요 | 사람 레벨의 접근 제어 |
| **Service Control Policy (SCP)** | 조직 전체 API 호출 | 계정 레벨 | 관리자 계정에서만 변경 | 조직 전체 거버넌스 |

세 가지를 계층적으로 함께 사용하면 더 강력한 보호가 된다.

## Resource Import: 기존 리소스를 IaC 관리하에

콘솔에서 수동으로 만든 리소스를 삭제하지 않고 CloudFormation Stack에 가져오는 기능이다. "Shadow IT를 IaC로 흡수"하는 데 사용한다.

```bash
# Import용 Template 준비 (DeletionPolicy: Retain 필수!)
cat > import-template.yaml << 'EOF'
Resources:
  ExistingBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain     # 반드시 Retain - 없으면 Import 거부
    Properties:
      BucketName: my-existing-bucket  # 실제 버킷 이름과 정확히 동일해야 함
  ExistingRDSInstance:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Retain
    Properties:
      DBInstanceIdentifier: my-existing-db
      # 실제 RDS의 다른 필수 속성들도 정확히 기재해야 함
EOF

# Import Change Set 생성
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

# 검토 후 실행
aws cloudformation execute-change-set \
  --stack-name import-stack \
  --change-set-name "import-existing-resources"
```

**Resource Import 주의사항:**
- Template의 해당 리소스에 `DeletionPolicy: Retain`이 없으면 Import 거부
- Import 후 Drift Detection을 바로 실행해 Template와 실제 상태 일치 여부 확인
- Import된 리소스의 실제 속성과 Template 속성이 다르면 Drift Detection에서 MODIFIED로 표시

> 📚 **사례**: 2024년 제조업체 H사는 3년간 콘솔에서 수동으로 구성한 인프라(EC2 50대, RDS 12개, VPC 3개)를 IaC로 전환하는 프로젝트를 시작했다. 전환 전략으로 "삭제 후 재생성" 대신 Resource Import를 선택했다. 총 7주에 걸쳐 단계적으로 Import를 수행했고, Import 후 Drift Detection으로 Template 정확도를 검증했다. 전환 후 EC2 교체 시간이 수 시간(수동)에서 15분(CFn 자동)으로 단축됐다. 핵심 교훈: Import 전 반드시 `cfn-schema validate`로 각 리소스의 필수 속성을 파악해야 한다.

## CFn Guard: Template 정책 검증 (Policy as Code)

CFn Guard(AWS CloudFormation Guard)는 Template가 조직의 정책을 준수하는지 배포 전에 검증하는 DSL 기반 도구다. "퍼블릭 S3 버킷 차단", "암호화되지 않은 EBS 차단" 같은 정책을 자동으로 검증한다.

```bash
# Guard 설치
brew install cloudformation-guard  # macOS
# 또는
cargo install cfn-guard

# 정책 파일 작성
cat > security-rules.guard << 'EOF'
# S3 버킷은 반드시 암호화 설정 필요
rule s3_bucket_encryption {
  AWS::S3::Bucket {
    Properties.BucketEncryption exists
    Properties.BucketEncryption.ServerSideEncryptionConfiguration[*].ServerSideEncryptionByDefault.SSEAlgorithm in ["aws:kms", "AES256"]
  }
}

# EBS 볼륨은 반드시 암호화
rule ebs_encrypted {
  AWS::EC2::Volume {
    Properties.Encrypted == true
  }
}

# RDS는 MultiAZ (prod 환경 가정)
rule rds_multiaz when %env == "prod" {
  AWS::RDS::DBInstance {
    Properties.MultiAZ == true
  }
}

# S3 퍼블릭 블록 설정 필수
rule s3_block_public_access {
  AWS::S3::Bucket {
    Properties.PublicAccessBlockConfiguration.BlockPublicAcls == true
    Properties.PublicAccessBlockConfiguration.BlockPublicPolicy == true
    Properties.PublicAccessBlockConfiguration.IgnorePublicAcls == true
    Properties.PublicAccessBlockConfiguration.RestrictPublicBuckets == true
  }
}
EOF

# Template 검증
cfn-guard validate \
  --data template.yaml \
  --rules security-rules.guard

# CI/CD 파이프라인에 통합
if ! cfn-guard validate --data template.yaml --rules security-rules.guard; then
  echo "정책 위반! 배포 중단"
  exit 1
fi
```

> 💡 **관련 이론**: CFn Guard는 "Policy as Code" 패턴의 구현이다. Open Policy Agent(OPA), HashiCorp Sentinel, Kubernetes OPA Gatekeeper가 같은 개념의 도구들이다. 이 패턴의 핵심은 정책을 사람이 읽는 문서나 절차가 아니라 기계가 실행할 수 있는 코드로 표현하는 것이다. SOC2, PCI-DSS, ISO 27001 같은 컴플라이언스 요구사항을 CFn Guard 규칙으로 표현하면 배포 파이프라인에서 자동으로 검증할 수 있다. AWS는 PCI-DSS, HIPAA, NIST SP 800-53 등에 대한 공식 Guard 규칙 세트를 GitHub에 공개하고 있다.

## 전체 안전 배포 패턴

```
CFn 안전 배포 파이프라인 (3대 기둥 통합)
============================================================

코드 리포지토리
    │ PR 병합
    ▼
[cfn-lint] ─────────────── 문법/타입 검사
    │ Pass
[cfn-guard] ──────────────── 정책 검사 (암호화, public 설정 등)
    │ Pass
[create-change-set] ─────── Replacement 여부 확인
    │ Replacement=True? ──── Yes → 파이프라인 중단, 수동 검토
    │ No
[execute-change-set] ────── 실제 배포
+ RollbackConfiguration
  MonitoringTimeInMinutes: 10
  Triggers: [5xx 알람, P99 지연 알람]
    │
    UPDATE_COMPLETE ─────── 모니터링 기간 시작 (10분)
    │
    ├── 알람 발생 ────────── 자동 롤백 → SNS 알림
    └── 정상 ──────────────── 배포 확정

─────────────────────────────────────────────────
사후 점검 (매일 자동):

[detect-stack-drift] ─────── 매일 08:00 UTC 실행
    │
    ├── MODIFIED/DELETED ─── SNS 알림 → 운영자 검토
    │                        (Revert 또는 Template 업데이트)
    └── IN_SYNC ──────────── 정상 기록
```

## 📝 연습 문제

**문제 1.** 운영자가 CloudFormation Stack에서 RDS 인스턴스 클래스를 `db.t3.medium`에서 `db.r5.large`로 업데이트하려 한다. 데이터 손실 없이 안전한지 확인하는 가장 좋은 방법은?

A) `update-stack`을 실행하고 이벤트를 모니터링한다
B) RDS 콘솔에서 직접 인스턴스 클래스를 변경한다
C) Change Set을 생성하고 `describe-change-set`에서 `Replacement` 필드를 확인한다. `False`이면 안전, `True`면 재생성으로 데이터 손실 가능
D) 먼저 스냅샷을 만들고 `update-stack`을 실행한다

**정답: C**
해설: Change Set의 핵심 용도가 바로 이것이다. `create-change-set` 후 `describe-change-set`으로 각 리소스의 `Replacement` 필드를 확인한다. RDS 인스턴스 클래스 변경은 일반적으로 `Replacement: False`(인플레이스 업데이트)이지만, Multi-AZ, 엔진 버전, DB Subnet Group 같은 속성과 함께 변경 시 `True`가 될 수 있다. 사전 확인 없이 update-stack을 실행하면(A) 예상치 못한 데이터 손실이 발생할 수 있다.

---

**문제 2.** 운영팀이 CFn으로 관리 중인 보안 그룹에 누군가 콘솔에서 `0.0.0.0/0:22` 규칙을 추가했다. 어떤 도구로 이 변경을 자동으로 감지할 수 있는가?

A) CloudWatch Logs Insights로 로그를 검색한다
B) CloudTrail에서 `AuthorizeSecurityGroupIngress` 이벤트를 찾는다
C) Drift Detection을 실행하고 보안 그룹 리소스가 `MODIFIED`로 표시되는지 확인한다
D) AWS Config의 `restricted-ssh` Config Rule을 활성화한다

**정답: C**
해설: Drift Detection은 CFn Template에 정의된 리소스 상태와 실제 상태를 비교한다. Template에 없는 SG 규칙이 추가됐다면 `MODIFIED` 상태로 감지된다. CloudTrail(B)은 "누가 언제 추가했는가"는 알 수 있지만 현재 상태의 drift를 표시하지 않는다. D의 AWS Config `restricted-ssh` Rule도 SSH 개방을 감지하지만, CFn 관리 리소스와의 drift를 감지하는 것은 Drift Detection이다. 실제 운영에서는 두 가지를 함께 사용한다.

---

**문제 3.** Stack 업데이트 후 HTTP 5xx 에러율이 급증하면 자동으로 이전 상태로 되돌아가도록 설정하려 한다. 어떤 구성이 필요한가?

A) Lambda 함수로 CloudWatch Alarm을 모니터링하고 `update-stack` API를 역방향으로 호출한다
B) CodeDeploy와 CloudFormation을 연동한다
C) `update-stack` 또는 `execute-change-set` 실행 시 `--rollback-configuration`에 CloudWatch Alarm ARN과 `MonitoringTimeInMinutes`를 설정한다
D) CloudFormation 콘솔에서 "Auto Rollback" 체크박스를 활성화한다

**정답: C**
해설: Rollback Configuration이 정확한 기능이다. `RollbackTriggers` 배열에 CloudWatch Alarm ARN을 지정하고 `MonitoringTimeInMinutes`(1~180분)를 설정한다. 업데이트 완료 후 모니터링 기간 동안 지정된 알람 중 하나라도 ALARM 상태가 되면 자동으로 `UPDATE_ROLLBACK_IN_PROGRESS`가 시작된다. 최대 5개 알람을 트리거로 지정할 수 있다.

---

**문제 4.** 콘솔에서 수동으로 만든 S3 버킷 3개를 삭제하지 않고 기존 CloudFormation Stack의 관리하에 두고 싶다. 어떻게 해야 하는가?

A) Stack Policy로 버킷을 추가한다
B) Template에 버킷 리소스를 추가하고 `update-stack`을 실행한다
C) `change-set-type: IMPORT`와 함께 Change Set을 생성하고, 각 버킷의 실제 이름으로 `ResourceIdentifier`를 지정한다. Template의 해당 리소스에는 `DeletionPolicy: Retain`이 필요하다
D) 직접 리소스를 만든 것이므로 불가능하다

**정답: C**
해설: Resource Import 기능이 정확히 이 용도다. `ChangeSetType=IMPORT`로 Change Set을 만들고, 각 기존 리소스를 Template의 Logical ID에 매핑한다. 중요: Template에서 해당 리소스에 `DeletionPolicy: Retain`이 설정되어야 한다(없으면 import 거부). B는 기존 버킷이 아니라 새 버킷을 만드는 것이다.

---

**문제 5.** Stack `UPDATE_ROLLBACK_FAILED` 상태다. 롤백 실패의 원인이 특정 리소스(LogicalId: `LegacyDatabase`)의 의존성 문제임을 파악했다. 어떻게 복구하는가?

A) `delete-stack`을 실행한다
B) `create-change-set`으로 새 변경을 시도한다
C) `continue-update-rollback`을 실행하고 `LegacyDatabase`를 `--resources-to-skip`에 추가한다
D) AWS Support에 문의한다

**정답: C**
해설: `UPDATE_ROLLBACK_FAILED` 상태는 `continue-update-rollback` 명령으로 복구 가능하다. `--resources-to-skip` 옵션으로 문제가 있는 리소스를 건너뛰고 나머지 롤백을 완료할 수 있다. Skip된 리소스는 완료 후 수동으로 정리해야 한다. `delete-stack`(A)은 실패 가능성이 높고, 새 Change Set(B)은 이 상태에서 불가능하다.

---

**문제 6.** Rollback Trigger에서 CloudWatch Alarm의 `treat-missing-data`를 어떤 값으로 설정해야 하는가? 배포 직후 메트릭 데이터가 없을 때 불필요한 롤백을 방지하려면?

A) `breaching` - 데이터 없으면 ALARM으로 처리
B) `notBreaching` - 데이터 없으면 OK로 처리
C) `ignore` - 데이터 없으면 이전 상태 유지
D) `missing` - 데이터 없으면 INSUFFICIENT_DATA로 처리

**정답: B**
해설: Rollback Trigger용 알람은 `treat-missing-data: notBreaching`으로 설정해야 한다. 배포 직후에는 메트릭 데이터가 아직 수집되지 않을 수 있어 INSUFFICIENT_DATA 상태가 될 수 있다. `breaching`으로 설정하면 데이터 없음 = ALARM으로 처리되어 정상 배포인데도 불필요한 롤백이 발생한다. `notBreaching`으로 설정하면 데이터 없음 = OK로 처리되어 실제 이상이 있을 때만 롤백된다.
