# Day 3 - Lambda 배포: Linear/Canary/AllAtOnce와 Alias의 수학

Lambda 배포는 인스턴스가 없다. "새 서버를 띄운다"는 개념이 없고, 대신 함수 코드의 **버전**이 있고 그 버전을 가리키는 **Alias**가 있다. Blue/Green의 "트래픽 시프트"가 여기서는 Alias의 가중치(weighted routing) 변경으로 구현된다.

이 단순함이 강점이다. 롤백은 Alias의 가중치를 이전 버전으로 되돌리는 것뿐이다 — 수초면 완료된다. 새 서버를 종료하거나 로드밸런서를 재구성할 필요가 없다. 하지만 이 단순함 뒤에 "정확히 얼마나 트래픽이 어떤 버전으로 가는가"에 대한 수학적 이해가 필요하다. 그것이 Canary와 Linear의 차이이고, 시험에서 가장 자주 혼동되는 부분이다.

오늘은 Version/Alias 관계, Deployment Configuration 수학, Pre/Post Hook 설계, SAM 통합, Provisioned Concurrency 비용 모델까지 Lambda 배포의 전체 그림을 다룬다.

> 💡 **Day 3의 핵심 프레임**: Lambda 배포 전략 선택은 두 변수의 함수다 — (1) 실패를 감지하는 데 걸리는 시간, (2) 실패 시 영향 범위. 감지가 빠르면 Canary, 점진적 부하 확인이 필요하면 Linear. 이 판단 기준이 있으면 시험 보기 구분이 된다.

---

## Lambda 배포의 전체 구조

```
[sam deploy / aws lambda update-function-code]
        │
        ▼
[새 Lambda Version 게시 (publish-version)]
   → 불변 스냅샷 (코드 + 설정 + 환경변수 고정)
        │
        ▼
[Alias 업데이트 (update-alias)]
   → routing-config: Primary 90% + Secondary(new) 10%
        │
        ▼
[CodeDeploy Deployment Group 감시]
   → Canary/Linear 스케줄에 따라 자동 가중치 조정
   → Pre/Post Hook Lambda 실행
   → CloudWatch Alarm 모니터링
        │
   ┌────┴────┐
   │         │
성공       알람 발동
   │         │
100% 전환  즉시 롤백 (Alias → 구 버전 100%)
```

> 🔍 **더 깊이**: Lambda Version은 불변(immutable) 스냅샷이다. `publish-version` 후에는 코드, 런타임, 환경변수, 메모리, 타임아웃이 고정된다. 이 불변성이 "배포 중 다른 변경이 배포를 오염시키지 않는다"는 보장을 준다. 반면 `$LATEST`는 항상 최신 상태를 가리키는 가변 포인터라 배포 중 다른 사람이 코드를 바꾸면 배포 결과가 달라질 수 있다. Canary 배포는 반드시 Version으로만 수행해야 한다.

---

## Lambda Version과 Alias의 관계

```bash
# 1. 코드 변경 후 새 Version 게시
aws lambda publish-version \
  --function-name MyFn \
  --description "v2.1.0 - checkout 버그 수정"
# → Version 6 생성 (불변 스냅샷)

# 2. Alias 확인 (현재 Version 5: 100%)
aws lambda get-alias --function-name MyFn --name live

# 3. Canary 시작 (10%를 Version 6으로)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 5 \
  --routing-config AdditionalVersionWeights='{"6": 0.1}'
# Alias "live" → Version 5: 90%, Version 6: 10%

# 4. 완전 전환
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 6
  # routing-config 없음 → Version 6: 100%
```

**핵심 제약 사항:**
- 한 Alias에서 `routing-config`로 추가할 수 있는 Version은 **단 하나**
- Primary(function-version) + Secondary(routing-config) = 최대 2개 Version
- "세 버전 동시 A/B/C 테스트"는 단일 Alias로 불가능
- `$LATEST`는 routing-config에 사용 불가 (가변 포인터이므로)

**Alias ARN 구조:**
```
arn:aws:lambda:ap-northeast-2:123456789:function:MyFn:live
                                                        ^^^^
                                                        Alias 이름
```

호출자는 Alias ARN만 알면 된다. Version 전환은 호출자에게 투명하게 일어난다.

> 💡 **관련 이론**: Lambda Alias의 가중 라우팅은 **확률적(stochastic) 분기**다. 각 호출은 독립적으로 난수를 생성해 가중치에 따라 Version을 선택한다. 10% Canary라면 평균적으로 10%가 새 버전으로 가지만, 특정 1000번의 호출 중 정확히 100번이 보장되지는 않는다. 통계적 10%다. 이것이 "Canary 10% 기간 중 정확히 10%의 사용자만 영향받는가?"라는 질문에 "아니오, 통계적으로 10%"가 답인 이유다. 세션 고정(session stickiness)은 기본적으로 없다.

> ⚠️ **함정**: `$LATEST`는 Alias에서 routing-config로 사용할 수 없다. `$LATEST`는 항상 최신 코드를 가리키는 가변 포인터라 불변 스냅샷인 Version과 다르다. Canary 배포는 반드시 `publish-version`으로 불변 Version을 만든 후 진행해야 한다. 시험에서 "$LATEST로 Canary 배포"가 보기에 나오면 항상 틀린 답이다.

---

## Deployment Configuration 수학: Canary vs Linear

**시간대별 트래픽 분배표:**

| Config | 0분 | 1분 | 2분 | 5분 | 10분 | 20분 | 완전 전환 시점 |
|--------|-----|-----|-----|-----|------|------|--------------|
| `LambdaAllAtOnce` | **100%** | — | — | — | — | — | 0분 |
| `LambdaCanary10Percent5Minutes` | 10% | 10% | 10% | **100%** | — | — | 5분 후 |
| `LambdaCanary10Percent30Minutes` | 10% | 10% | 10% | 10% | 10% | 10% | **30분 후** |
| `LambdaLinear10PercentEvery1Minute` | 10% | 20% | 30% | 50% | **100%** | — | 10분 |
| `LambdaLinear10PercentEvery10Minutes` | 10% | 10% | 10% | 10% | 20% | 30% | **100분** |

**Canary의 논리**: 2단계만 있다. 소수(10%)를 지정한 시간 동안 관찰하고, 문제없으면 나머지 전부(90%)를 한 번에 전환한다. "빠른 go/no-go 판단"에 적합하다.

**Linear의 논리**: N단계가 있다. 균등하게 증분하여 100%에 도달한다. "점진적 부하 확인, 각 단계마다 검증"에 적합하다.

```
Canary10Percent5Minutes:          Linear10PercentEvery1Minute:
                                  
100% │         ████               100% │          █
     │         █                       │         ██
 10% │ ████████                    50% │        ███
     │                                 │    ██████
     └─────────────────────            └────────────────────
     0     5분                        0   5분  10분
     
     [2단계: 관찰 후 전환]             [10단계: 균등 증분]
```

**Custom Deployment Configuration:**
```bash
aws deploy create-deployment-config \
  --deployment-config-name MyCanary5Percent10Min \
  --compute-platform Lambda \
  --traffic-routing-config \
    "type=TimeBasedCanary,timeBasedCanary={canaryPercentage=5,canaryInterval=10}"

# Linear Custom:
aws deploy create-deployment-config \
  --deployment-config-name MyLinear20Percent5Min \
  --compute-platform Lambda \
  --traffic-routing-config \
    "type=TimeBasedLinear,timeBasedLinear={linearPercentage=20,linearInterval=5}"
```

> 🔍 **더 깊이**: Canary와 Linear의 선택은 **위험 감내(Risk Tolerance)**와 **검증 속도(Validation Speed)**의 트레이드오프다. 금융 거래 함수라면 Canary 10% 30분 동안 충분히 검증하고 싶다 — 작은 트래픽에서 오래 관찰. 정적 콘텐츠 변환 함수라면 Linear 10%/1분으로 10분에 전환 완료해도 충분하다. 워크로드의 "실패 감지에 얼마나 걸리는가"와 "실패 시 영향 범위"를 함께 고려한다. 실패가 즉각 드러나는 함수(동기 API)는 Canary, 실패가 누적되는 함수(배치 처리)는 Linear가 더 적합하다.

> 📚 **사례**: 2021년 Stripe 엔지니어링: 결제 처리 Lambda에 Canary10Percent30Minutes 배포를 도입했다. 30분 관찰 기간에 실제 결제 트랜잭션의 10%가 새 버전으로 처리된다. 이 기간 CloudWatch에서 `PaymentErrors` 커스텀 메트릭을 모니터링하고, 임계값 초과 시 자동 롤백. 출시 후 4번의 자동 롤백이 발생했고, 모두 30분 내에 자동 복원됐다. 결제 시스템의 실패 비용이 높은 만큼 30분의 긴 관찰 시간이 정당화됐다.

---

## Pre/Post Traffic Hook: 자동 검증 게이트

Hook의 위치:
```
[트래픽 시프트 시작 전]
    BeforeAllowTraffic (= PreTraffic Hook)
        → 새 Version에 직접 smoke test
        → 실패하면 트래픽 시프트 없이 롤백
[트래픽 시프트]
[트래픽 시프트 완료 후]
    AfterAllowTraffic (= PostTraffic Hook)
        → 실제 트래픽으로 검증
        → 실패하면 이전 Version으로 롤백
```

**Hook Lambda 구현 (BeforeAllowTraffic):**
```python
import boto3, json, os

deploy = boto3.client('codedeploy')
fn_client = boto3.client('lambda')

def handler(event, context):
    """BeforeAllowTraffic Hook: 트래픽 시프트 전 새 버전 smoke test"""
    deployment_id = event['DeploymentId']
    hook_id = event['LifecycleEventHookExecutionId']
    target_fn = event.get('FunctionName', os.environ.get('TARGET_FUNCTION'))
    target_ver = event.get('TargetVersion')

    try:
        # 새 Version 직접 호출 (Alias를 통하지 않고 Version ARN으로)
        resp = fn_client.invoke(
            FunctionName=f'{target_fn}:{target_ver}',
            InvocationType='RequestResponse',
            Payload=json.dumps({'action': 'smoke-test'})
        )
        payload = json.loads(resp['Payload'].read())
        
        ok = (resp['StatusCode'] == 200 and 
              'FunctionError' not in resp and
              payload.get('status') == 'ok')
        
        status = 'Succeeded' if ok else 'Failed'

    except Exception as e:
        print(f"Hook error: {e}")
        status = 'Failed'

    # 결과 보고 — 이 API 호출이 없으면 Timeout으로 배포 실패
    deploy.put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=hook_id,
        status=status
    )
    return {'status': status}
```

**Hook Lambda가 가져야 할 IAM 권한:**
```json
{
  "Effect": "Allow",
  "Action": [
    "codedeploy:PutLifecycleEventHookExecutionStatus",
    "lambda:InvokeFunction"
  ],
  "Resource": "*"
}
```

`PutLifecycleEventHookExecutionStatus`가 없으면 Hook 결과를 CodeDeploy에 보고할 수 없다. 이 경우 CodeDeploy는 Hook이 응답하지 않는 것으로 간주하고 Timeout(기본 3600초) 후 배포 실패 처리한다.

**AfterAllowTraffic Hook 패턴:**
```python
def handler(event, context):
    """AfterAllowTraffic: 실제 트래픽 처리 후 검증"""
    deployment_id = event['DeploymentId']
    hook_id = event['LifecycleEventHookExecutionId']
    
    # CloudWatch에서 실제 에러 메트릭 조회
    cw = boto3.client('cloudwatch')
    resp = cw.get_metric_statistics(
        Namespace='AWS/Lambda',
        MetricName='Errors',
        Dimensions=[
            {'Name': 'FunctionName', 'Value': os.environ['TARGET_FN']},
            {'Name': 'Resource', 'Value': f"{os.environ['TARGET_FN']}:live"}
        ],
        StartTime=datetime.utcnow() - timedelta(minutes=5),
        EndTime=datetime.utcnow(),
        Period=300,
        Statistics=['Sum']
    )
    
    error_count = sum(d['Sum'] for d in resp['Datapoints'])
    status = 'Succeeded' if error_count < 10 else 'Failed'
    
    boto3.client('codedeploy').put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=hook_id,
        status=status
    )
```

> ⚠️ **함정**: Hook Lambda의 실행 결과(Lambda invocation 성공/실패)와 `PutLifecycleEventHookExecutionStatus`로 보고하는 결과는 별개다. Hook Lambda가 정상 종료(exit 0)되어도, `PutLifecycleEventHookExecutionStatus`를 호출하지 않으면 CodeDeploy는 Hook 결과를 모른다. 반드시 API 호출로 `Succeeded` 또는 `Failed`를 보고해야 한다. Hook Lambda 실행 타임아웃(15분)이 CodeDeploy Hook Timeout(3600초)보다 짧으므로, Lambda 타임아웃 전에 보고를 완료해야 한다.

> 💡 **관련 이론**: Pre/Post Hook은 **Deployment Gate** 패턴이다. "자동화된 품질 게이트가 통과하지 않으면 다음 단계로 진행하지 않는다"는 원칙이다. CALMS의 Automation 축에서 "검증 자동화"가 여기에 해당한다. 사람이 배포 후 수동으로 확인하는 대신, Hook이 자동으로 검증하고 실패하면 자동 롤백한다. 이 패턴이 DORA의 Change Failure Rate를 줄이는 직접 수단이다.

---

## SAM/CDK 통합: AutoPublishAlias로 자동화

**SAM template.yaml:**
```yaml
Transform: AWS::Serverless-2016-10-31

Resources:
  CheckoutFn:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src/checkout/
      Handler: app.handler
      Runtime: python3.11
      Architectures: [arm64]
      Tracing: Active                    # X-Ray 자동 활성화
      AutoPublishAlias: live             # 배포마다 Version 자동 게시 + Alias 생성
      DeploymentPreference:
        Type: Canary10Percent5Minutes
        Hooks:
          PreTraffic: !Ref PreTrafficCheck
          PostTraffic: !Ref PostTrafficCheck
        Alarms:
          - !Ref ErrorRateAlarm
          - !Ref P99LatencyAlarm

  PreTrafficCheck:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src/hooks/
      Handler: pre.handler
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - codedeploy:PutLifecycleEventHookExecutionStatus
                - lambda:InvokeFunction
              Resource: '*'

  ErrorRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: CheckoutFn-ErrorRate
      Namespace: AWS/Lambda
      MetricName: Errors
      Dimensions:
        - Name: FunctionName
          Value: !Ref CheckoutFn
        - Name: Resource
          Value: !Sub '${CheckoutFn}:live'   # Alias 단위 메트릭
      Statistic: Sum
      Period: 60
      EvaluationPeriods: 2
      Threshold: 5
      ComparisonOperator: GreaterThanThreshold
      TreatMissingData: notBreaching
```

`AutoPublishAlias: live`가 하는 일 (순서대로):
1. `sam deploy` 실행 시 새 Lambda Version 자동 게시
2. Alias "live"를 새 Version으로 업데이트 (routing-config로 가중치 조정)
3. `DeploymentPreference`에 따라 CodeDeploy Application + Deployment Group 자동 생성
4. Canary/Linear 배포 자동 실행
5. Alarms가 트리거되면 자동 롤백

한 줄(`AutoPublishAlias`)이 Version 관리, Alias 관리, CodeDeploy 통합, 알람 기반 롤백을 모두 자동화한다.

**CDK 동등 구현:**
```python
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_codedeploy as codedeploy
from aws_cdk import aws_cloudwatch as cloudwatch

fn = lambda_.Function(self, 'CheckoutFn', ...)
alias = lambda_.Alias(self, 'LiveAlias',
    alias_name='live',
    version=fn.current_version
)
deployment_group = codedeploy.LambdaDeploymentGroup(self, 'DG',
    alias=alias,
    deployment_config=codedeploy.LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES,
    alarms=[error_rate_alarm],
    auto_rollback=codedeploy.AutoRollbackConfig(
        deployment_in_alarm=True,
        stopped_deployment=True
    )
)
```

> 📚 **사례**: 어떤 팀이 기존에 `$LATEST`를 직접 호출하는 방식으로 Lambda를 배포했다. 배포 중 오류가 발생해도 이미 100% 전환된 상태라 복구에 10분이 걸렸다. SAM `AutoPublishAlias` + Canary10Percent5Minutes로 전환 후, 동일한 오류가 발생했을 때 5분 후 자동 롤백이 일어나 10%의 트래픽만 영향받았다. 나머지 90%는 구 버전으로 정상 처리됐다.

---

## Provisioned Concurrency와 배포: 비용의 함정

Provisioned Concurrency(PC)는 콜드 스타트를 제거하기 위해 Lambda 실행 환경을 미리 워밍업해두는 기능이다.

**Canary 배포 중 PC 비용 구조:**
```bash
# 새 Version 6에 미리 PC 설정
aws lambda put-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier 6 \
  --provisioned-concurrent-executions 10

# PC 준비 완료 대기
aws lambda get-provisioned-concurrency-config \
  --function-name MyFn --qualifier 6
# Status: READY가 될 때까지 대기

# 그 다음 Alias Canary 시작
```

**배포 단계별 PC 비용:**

| 단계 | Version 5 (구) | Version 6 (신) | 비용 |
|------|----------------|----------------|------|
| Canary 시작 전 | PC 10개 | 없음 | 정상 |
| Canary 진행 중 | PC 10개 (90%) | PC 10개 워밍업 (10%) | **약 2배** |
| 100% 전환 후 | PC 해제 | PC 10개 유지 | 정상 |
| Version 5 PC 해제 필요 | 수동 해제 (`delete-provisioned-concurrency-config`) | — | — |

완전 전환 후 구 버전의 PC를 반드시 수동으로 해제해야 한다. 자동 해제되지 않는다.

```bash
# 전환 완료 후 구 버전 PC 해제
aws lambda delete-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier 5
```

> 💡 **관련 이론**: Provisioned Concurrency + Canary 배포의 비용 모델은 Blue/Green 배포의 "일시적 2배 인스턴스 비용"과 동일한 논리다. 두 버전이 동시에 활성화된 기간에 두 버전 모두 비용이 발생한다. 차이는 EC2는 인스턴스 단위이고, Lambda PC는 "워밍업된 실행 환경" 단위라는 것이다. Canary 기간이 길수록 이 추가 비용이 누적된다. Canary30Minutes면 30분치 PC 추가 비용, Canary5Minutes면 5분치만 추가다.

> ⚠️ **함정**: 구 버전의 Provisioned Concurrency는 배포 완료 후 자동으로 해제되지 않는다. 수동으로 `delete-provisioned-concurrency-config`를 실행하거나, Lambda Application Auto Scaling으로 PC를 관리하는 경우 스케줄을 업데이트해야 한다. 이를 잊으면 아무도 쓰지 않는 구 버전 PC가 계속 과금된다.

---

## CloudWatch Alarm 설계: Alias 단위 메트릭

Lambda 메트릭은 Function 전체, 특정 Version, 또는 Alias 단위로 집계된다.

```bash
# Alias 단위 Alarm (Canary 배포 모니터링에 적합)
aws cloudwatch put-metric-alarm \
  --alarm-name "MyFn-live-ErrorRate" \
  --namespace "AWS/Lambda" \
  --metric-name "Errors" \
  --dimensions "Name=FunctionName,Value=MyFn" "Name=Resource,Value=MyFn:live" \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching
```

`Resource=MyFn:live`는 Alias "live"로 들어오는 호출의 에러만 카운트한다. Canary 10% 기간에는 새 버전에서 발생하는 에러도 여기에 포함된다. 에러가 임계값을 넘으면 알람 → 자동 롤백.

**Composite Alarm으로 다중 조건 결합:**
```bash
# 에러율 알람 + P99 레이턴시 알람을 OR로 결합
aws cloudwatch put-composite-alarm \
  --alarm-name "MyFn-live-Composite" \
  --alarm-rule "ALARM(MyFn-live-ErrorRate) OR ALARM(MyFn-live-P99Latency)"
```

Composite Alarm을 Deployment Group에 연결하면 "에러율 또는 레이턴시 중 하나라도 기준 초과 시 롤백"이 가능하다.

> 🔍 **더 깊이**: Lambda 메트릭의 Dimension 설계가 Canary 배포 모니터링의 핵심이다. `FunctionName=MyFn`만 지정하면 Function 전체의 에러가 카운트되고, `FunctionName=MyFn, Resource=MyFn:live`로 지정하면 Alias를 통한 호출만 카운트된다. Canary 10% 상태에서 Alias 단위 에러가 5개 발생했다면, 실제 새 버전 관련 에러는 이 중 통계적으로 약 1개(10%)다. 이 점을 고려해 알람 임계값을 설계해야 한다 — Canary 비율이 낮을수록 새 버전 에러가 Alias 메트릭에서 희석된다.

---

## 마무리: Lambda 배포 판단 트리

```
Lambda 배포 전략 선택
=====================
실패 감지가 즉각적인가 (동기 API, 즉시 에러)?
    ├─ YES + 관찰 시간 짧아도 됨 → LambdaCanary10Percent5Minutes
    ├─ YES + 충분한 관찰 필요 → LambdaCanary10Percent30Minutes
    └─ NO (지연 실패, 배치) → LambdaLinear10PercentEvery1Minute
    
    AllAtOnce: 개발/테스트 환경만, 프로덕션은 금지

트래픽이 많지 않아 샘플 크기가 부족한가?
    └─ Hook + 직접 새 Version 호출로 smoke test 보완

콜드 스타트가 없어야 하는가 (PC 설정)?
    └─ 배포 전 새 Version에 PC 설정 → Canary → 전환 후 구 Version PC 해제 필수

CodePipeline에서 자동화하는가?
    └─ SAM AutoPublishAlias + DeploymentPreference가 최적 조합
```

---

## 📝 연습 문제

**문제 1.** Lambda Canary 배포에서 실제로 트래픽이 시프트되는 메커니즘은?

A) 새 Lambda 함수가 생성되어 Load Balancer가 두 함수로 분배
B) Alias의 weighted routing config — 하나의 Alias가 두 Version 사이 가중치 비율로 라우팅
C) Route 53 가중 레코드
D) API Gateway Stage Variable 전환

**정답: B**
해설: Lambda Blue/Green은 인프라 변경 없이 Alias의 `AdditionalVersionWeights`로 구현된다. 같은 Alias("live")가 Version 5(90%)와 Version 6(10%)으로 호출을 분배한다. 호출자는 Alias ARN만 알면 되고 버전 전환은 투명하게 일어난다. 새 함수 생성(A)이나 Route 53(C)은 Lambda 배포 메커니즘이 아니다.

---

**문제 2.** `LambdaCanary10Percent5Minutes` 배포에서 3분이 지난 시점의 트래픽 분배는?

A) 30% 새 버전, 70% 구 버전
B) 10% 새 버전, 90% 구 버전 (5분 관찰 기간 중)
C) 50% 새 버전
D) 100% 새 버전 (이미 완전 전환)

**정답: B**
해설: Canary는 2단계다. 처음 10%를 지정한 시간(5분) 동안 관찰한다. 3분은 5분 관찰 기간 중이므로 여전히 10%/90% 분배다. 5분이 지나고 알람이 없으면 그때 100%로 전환된다. Linear와 혼동하지 않는 것이 핵심이다. Linear10PercentEvery1Minute이었다면 3분 후 30%가 된다.

---

**문제 3.** PreTrafficHook이 `PutLifecycleEventHookExecutionStatus`를 호출하지 않고 함수가 정상 종료되면?

A) 배포가 성공으로 처리된다
B) CodeDeploy는 Hook 결과를 받지 못해 대기 상태를 유지하다 Timeout(기본 3600초) 후 배포 실패 처리
C) 자동으로 Succeeded로 처리된다
D) 배포가 즉시 롤백된다

**정답: B**
해설: CodeDeploy는 Hook 함수의 Lambda 실행 결과(성공/실패)가 아니라, Hook 함수가 `PutLifecycleEventHookExecutionStatus` API를 호출하여 보고하는 결과를 기다린다. 이 API 호출이 없으면 CodeDeploy는 Hook이 응답하지 않는 것으로 보고, 설정된 Timeout(기본 3600초)까지 기다린 후 배포 실패로 처리한다.

---

**문제 4.** SAM `AutoPublishAlias: live`가 자동으로 처리하는 것은?

A) IAM Role 생성만
B) Lambda Version 게시 + Alias 생성/업데이트 + CodeDeploy Application/Deployment Group 자동 생성 + 배포 실행
C) CloudWatch Alarm 생성만
D) ECR 이미지 push만

**정답: B**
해설: `AutoPublishAlias`는 SAM이 제공하는 강력한 추상화다. `sam deploy` 실행 시 자동으로: (1) 새 Lambda Version 게시, (2) 지정한 이름의 Alias 생성 또는 업데이트, (3) `DeploymentPreference`가 있으면 CodeDeploy Application + Deployment Group 자동 생성, (4) Canary/Linear 배포 자동 실행. 개발자가 CodeDeploy API를 직접 다루지 않아도 된다.

---

**문제 5.** Provisioned Concurrency가 설정된 Lambda를 Canary 10% 30분으로 배포하는 중 비용 영향은?

A) 배포 중 비용 변화 없음
B) 30분 동안 구 버전(90%)과 새 버전(10%) 양쪽 모두 PC 비용 발생 — 일시적으로 PC 비용이 약 2배
C) 새 버전 PC만 비용 발생
D) PC가 자동 비활성화되어 비용 없음

**정답: B**
해설: Canary 기간 동안 두 Version이 동시에 활성화되므로, 두 Version 모두 PC(워밍업된 실행 환경)를 유지해야 한다. 30분의 Canary 기간 동안 PC 비용이 약 2배 발생한다. 새 버전으로 100% 전환 완료 후 구 버전 PC를 수동으로 해제해야 정상 비용으로 돌아온다. 자동 해제되지 않는다.

---

**문제 6.** 한 Lambda Alias에서 동시에 트래픽을 받을 수 있는 최대 Version 수는?

A) 무제한
B) 2개 (Primary + Secondary 1개)
C) 5개
D) 10개

**정답: B**
해설: Lambda Alias의 `routing-config.AdditionalVersionWeights`에는 단 하나의 추가 Version만 지정할 수 있다. Primary(function-version)과 Secondary(routing-config) 합쳐 최대 2개다. A/B/C 세 버전 동시 테스트는 단일 Alias로 불가능하다. 시험에서 "세 버전 동시 테스트" 요구사항이 나오면 별도 Alias를 여러 개 만들거나 Application Load Balancer의 가중치 라우팅을 사용하는 대안을 검토해야 한다.

---

**문제 7.** Canary 배포 10분 경과 후 CloudWatch Alarm이 ALARM 상태가 됐다. CodeDeploy의 자동 동작은?

A) 10분을 더 기다린 후 판단
B) 배포를 즉시 중단하고 Alias 가중치를 구 Version 100%로 복원 (즉시 롤백)
C) 새 버전으로 100% 전환 후 알람 해제를 기다림
D) SNS로 알림만 발송

**정답: B**
해설: Deployment Group의 `auto-rollback-configuration`에 `DEPLOYMENT_STOP_ON_ALARM`이 설정되어 있고, 배포 중 연결된 CloudWatch Alarm이 ALARM 상태가 되면 CodeDeploy는 즉시 배포를 중단하고 Alias 가중치를 이전 Version(100%)으로 복원한다. 이것이 "자동 롤백"의 실제 동작이다. 롤백 완료까지 수초면 충분하다 — Alias 가중치 변경만으로 트래픽이 즉시 구 버전으로 전환된다.

---
