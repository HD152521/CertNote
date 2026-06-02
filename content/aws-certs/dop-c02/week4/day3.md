# Day 3 - Lambda 배포 (Linear/Canary/AllAtOnce) + Alias

📅 날짜: Week 4 (Day 3)
🎯 주제: Lambda 무중단 배포의 표준 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lambda Version/Alias 개념과 weighted routing
- CodeDeploy Lambda 배포 구성 종류와 선택 기준
- Pre/Post Traffic Hook으로 검증 자동화
- Provisioned Concurrency를 배포에 통합하는 패턴

---

## 🧩 사전 지식 (CS 기초)

- **Lambda Version**: 함수 코드/설정의 불변 스냅샷. 숫자(1, 2, 3...) 또는 `$LATEST`.
- **Lambda Alias**: Version에 대한 포인터(라벨). `live`, `prod`, `staging` 등.
- **Weighted Routing**: Alias가 두 Version 사이 트래픽 비율 분배.
- **Provisioned Concurrency**: 미리 워밍업된 실행 환경. 콜드 스타트 제거.
- **Function URL**: Lambda 함수 직접 HTTP 엔드포인트.

---

## 📖 이론 내용

### 1. Lambda Version & Alias

```bash
# Publish version
aws lambda publish-version \
  --function-name MyFn \
  --description "v1.2.3"
# 결과: Version 5

# Alias 생성/업데이트
aws lambda create-alias \
  --function-name MyFn \
  --name live \
  --function-version 5

# Weighted routing
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 5 \
  --routing-config AdditionalVersionWeights={6=0.1}
# live → Version 5: 90%, Version 6: 10%
```

> ⚠️ **함정**: Alias의 `function-version`이 메인(primary), `routing-config`가 추가(secondary). 한 Alias에 두 Version만 가능.

### 2. CodeDeploy Lambda 배포 구성

| Deployment Config | 동작 |
|-------------------|------|
| `LambdaAllAtOnce` | 즉시 100% 시프트 (개발/낮은 위험) |
| `LambdaCanary10Percent5Minutes` | 10% 5분 → 90% (가장 자주 사용) |
| `LambdaCanary10Percent10Minutes` | 10% 10분 → 90% |
| `LambdaCanary10Percent15Minutes` | 10% 15분 → 90% |
| `LambdaCanary10Percent30Minutes` | 10% 30분 → 90% |
| `LambdaLinear10PercentEvery1Minute` | 10%씩 매 1분 (10분 총) |
| `LambdaLinear10PercentEvery2Minutes` | 매 2분 (20분 총) |
| `LambdaLinear10PercentEvery3Minutes` | 매 3분 (30분 총) |
| `LambdaLinear10PercentEvery10Minutes` | 매 10분 (100분 총) |
| Custom | 직접 정의 |

### 3. Pre/Post Traffic Hook

**언제 호출되나:**
- **BeforeAllowTraffic** (PreTrafficHook): Alias 가중치 변경 직전
- **AfterAllowTraffic** (PostTrafficHook): 가중치 100% 시프트 완료 후

```python
# PreTrafficHook 예
import boto3
import os

deploy = boto3.client('codedeploy')
lambda_client = boto3.client('lambda')

def handler(event, context):
    deployment_id = event['DeploymentId']
    lifecycle_id = event['LifecycleEventHookExecutionId']

    try:
        # 새 Version을 직접 invoke해서 검증
        target_version = os.environ['TARGET_VERSION']
        result = lambda_client.invoke(
            FunctionName=f'MyFn:{target_version}',
            Payload=b'{"action":"healthcheck"}'
        )
        body = result['Payload'].read().decode()
        ok = '"status":"ok"' in body

        deploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deployment_id,
            lifecycleEventHookExecutionId=lifecycle_id,
            status='Succeeded' if ok else 'Failed'
        )
    except Exception:
        deploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deployment_id,
            lifecycleEventHookExecutionId=lifecycle_id,
            status='Failed'
        )
```

**중요**: Hook Lambda는 별도 함수. 배포 대상 함수와 다름. IAM Role에 `codedeploy:PutLifecycleEventHookExecutionStatus` 권한 필요.

### 4. SAM/CDK 통합

**SAM template.yaml:**
```yaml
Resources:
  MyFn:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src
      Handler: app.handler
      Runtime: nodejs20.x
      AutoPublishAlias: live
      DeploymentPreference:
        Type: Canary10Percent10Minutes
        Hooks:
          PreTraffic: !Ref PreTrafficHook
          PostTraffic: !Ref PostTrafficHook
        Alarms:
          - !Ref ErrorRateAlarm
```

`AutoPublishAlias`가 자동으로 Version + Alias + CodeDeploy 배포 설정 생성.

### 5. Provisioned Concurrency와 배포

- PC는 Alias 또는 Version에 설정 가능
- Alias에 설정 시: 가중치 시프트 동안 두 Version 모두에 PC 필요
- 비용 ↑ (가중치 따라 분배)

**Pattern**: 새 Version 게시 → 새 PC 워밍업 대기 → Alias 시프트 시작

```bash
# 새 Version에 PC 미리 할당
aws lambda put-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier 6 \
  --provisioned-concurrent-executions 10
```

### 6. CloudWatch Alarm 통합

배포 그룹의 alarm-configuration에 등록:
- 에러 비율 (`Errors / Invocations > 1%`)
- Duration p99
- Throttles
- 비즈니스 지표 (custom metric)

자동 롤백 = Alias가 이전 Version으로 즉시 복귀.

---

## 🧠 알아두면 좋은 심화 이론

### Lambda 동시성과 가중 라우팅

- Alias 가중 라우팅 시 각 호출은 독립적 결정 — 100% Canary 시점에도 일부 호출이 구 Version에 갈 수 있음 (직전 in-flight)
- 비동기 이벤트는 가중치 적용 시점에 따라 다름 (SQS/EventBridge 등 큐에 대기 중인 이벤트)
- **시험 함정**: "Canary 10% 동안 새 Version에 가는 호출은 정확히 10%?" → 통계적으로 10%, 정확히는 아님.

### Lambda Version Pruning

- Version 게시는 무제한
- 오래된 Version도 코드 저장 비용 발생
- `aws lambda list-versions-by-function` + 오래된 Version 삭제 자동화 권장
- CDK는 자동 pruning 옵션 (`removalPolicy`)

### Function URL vs API Gateway 배포 시

- Function URL: Alias 단위 라우팅 가능 (`?Qualifier=live`)
- API Gateway: Stage Variable로 Alias 참조
- Blue/Green 시 둘 다 Alias 가중치로 자동 처리

### Lambda Layer + 배포

- Layer 변경도 Function 코드 변경 → 새 Version
- Layer를 ARN 버전으로 고정해야 재현성 확보
- 큰 Layer는 cold start 증가

### 관련 서비스 Cross-Reference

- **SAM/CDK** → Week 7 Day 1, 2
- **Lambda Insights** → Week 10 Day 3
- **Provisioned Concurrency** → Week 7 Day 4
- **X-Ray Lambda 통합** → Week 11 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
Lambda Canary Deployment with Hooks
==================================================

  CodeDeploy starts deployment
        |
        v
   PreTrafficHook (Lambda function)
        |  validates target version
        |  invoke target Version 6 → check response
        |
        v  status=Succeeded
   Alias "live" → V5: 90%, V6: 10%
        |
        v  wait 5 min, monitor CloudWatch alarms
   No alarm triggered
        |
        v
   Alias "live" → V6: 100%
        |
        v
   PostTrafficHook
        |  smoke test
        |
        v  status=Succeeded
   Deployment Succeeded

  If alarm triggers during wait:
        |
        v
   Auto-rollback: Alias "live" → V5: 100% (instant)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Lambda Blue/Green = Alias의 weighted routing (한 Alias에 두 Version)
2. ⭐ Canary(2단계 큰 시프트) vs Linear(점진적 N%씩)
3. ⭐ Pre/Post Traffic Hook은 별도 Lambda — `PutLifecycleEventHookExecutionStatus` 필수
4. ⭐ SAM의 `AutoPublishAlias` + `DeploymentPreference`로 자동화
5. ⭐ Provisioned Concurrency는 Alias/Version 단위, 배포 중 두 Version 모두 비용

---

## 💻 실제 예시 - SAM으로 Canary 배포 전체

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: python3.11
    Architectures: [arm64]
    Tracing: Active

Resources:
  CheckoutApi:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./checkout/
      Handler: app.handler
      AutoPublishAlias: live
      DeploymentPreference:
        Type: Canary10Percent5Minutes
        Hooks:
          PreTraffic: !Ref PreTrafficCheck
          PostTraffic: !Ref PostTrafficCheck
        Alarms:
          - !Ref ErrorRateAlarm
          - !Ref P99LatencyAlarm
      Events:
        ApiEvent:
          Type: Api
          Properties:
            Path: /checkout
            Method: post

  PreTrafficCheck:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./hooks/
      Handler: pre.handler
      Policies:
        - Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action: codedeploy:PutLifecycleEventHookExecutionStatus
              Resource: '*'
            - Effect: Allow
              Action: lambda:InvokeFunction
              Resource: !Sub '${CheckoutApi.Arn}:*'

  PostTrafficCheck:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./hooks/
      Handler: post.handler

  ErrorRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      MetricName: Errors
      Namespace: AWS/Lambda
      Dimensions:
        - Name: FunctionName
          Value: !Ref CheckoutApi
        - Name: Resource
          Value: !Sub '${CheckoutApi}:live'
      Statistic: Sum
      Period: 60
      EvaluationPeriods: 2
      Threshold: 5
      ComparisonOperator: GreaterThanThreshold
```

배포 명령:
```bash
sam build && sam deploy --guided
# 이후 변경 후
sam deploy   # 자동으로 Version publish + Alias canary
```

---

## 📝 연습 문제

**문제 1.** Lambda Blue/Green 배포의 본질은?

A) 새 Lambda 함수 생성
B) 동일 함수 내 Alias가 두 Version 사이 트래픽 가중치 분배
C) Lambda Layer 교체
D) IAM Role 변경

**정답: B**
해설: Alias weighted routing이 핵심.

---

**문제 2.** PreTrafficHook이 Failed를 반환하면?

A) 배포 진행
B) Canary 가중치가 0으로 — 트래픽 시프트 시작 안 함, 배포 실패
C) Alias가 즉시 새 Version으로
D) Hook 무시

**정답: B**
해설: Pre Hook 실패 시 시프트 자체가 안 일어남.

---

**문제 3.** `Canary10Percent10Minutes`와 `Linear10PercentEvery10Minutes`의 차이는?

A) Canary는 10% 10분 → 100%, Linear는 10%씩 매 10분 (총 100분)
B) 동일
C) Linear가 더 빠름
D) Canary는 EC2용

**정답: A**
해설: Canary 2단계, Linear 점진. 시험 빈출.

---

**문제 4.** SAM의 `AutoPublishAlias`가 자동으로 하는 일은?

A) Version 게시 + Alias 생성·업데이트 + CodeDeploy 배포 설정
B) IAM Role 생성만
C) CloudWatch Alarm만
D) ECR push만

**정답: A**
해설: 한 줄로 Lambda Blue/Green 표준 패턴 자동화.

---

**문제 5.** Provisioned Concurrency가 설정된 Lambda를 Canary 배포하면 비용은?

A) 변화 없음
B) 배포 동안 두 Version 모두 PC 비용 발생 (가중치에 비례 분배되지만 양쪽 모두 워밍업 필요)
C) 비용 50% 절감
D) PC 자동 해제

**정답: B**
해설: PC는 배포 중 양쪽 모두 필요 — 비용 일시 증가.

---

**문제 6.** Alias의 weighted routing에서 한 Alias가 동시에 가리킬 수 있는 Version 수는?

A) 1개
B) 2개 (primary + secondary)
C) 무제한
D) 10개

**정답: B**
해설: AdditionalVersionWeights는 단일 Version만 추가 가능.

---

**문제 7.** "배포 중 5xx > 1%면 즉시 롤백"을 구현하려면?

A) CloudWatch Alarm + Deployment Group의 alarm-configuration + auto-rollback
B) PreTrafficHook에서 매번 검증
C) X-Ray만 활성
D) Lambda Destinations

**정답: A**
해설: 알람 + 자동 롤백이 표준.

---

## 📌 오늘의 요약

1. Lambda Blue/Green = Alias weighted routing (한 Alias에 두 Version)
2. Canary는 2단계, Linear는 점진 — 워크로드 특성에 맞게 선택
3. Pre/Post Traffic Hook은 별도 Lambda + PutLifecycleEventHookExecutionStatus
4. SAM `AutoPublishAlias` + `DeploymentPreference`로 패턴 자동화
5. Provisioned Concurrency는 배포 동안 두 Version 모두 비용
