# Day 3 - Drift Detection, Change Set, Custom Resource

📅 날짜: Week 8 (Day 3)
🎯 주제: IaC 운영의 디테일 — 변경 추적·미리보기·확장
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Drift Detection의 동작과 한계
- Change Set의 검증 흐름 + 자동화 패턴
- Custom Resource로 CFN 한계 우회
- CFN Hooks (Proactive Guardrail)

---

## 🧩 사전 지식 (CS 기초)

- **State drift**: IaC와 실제 상태의 불일치.
- **Reconciliation Loop**: 선언 상태를 실제로 강제 (K8s controller 패턴).
- **Webhook validation**: 변경 시도를 사전 평가.
- **Extension Pattern**: 기본 기능 부족 시 사용자 정의로 확장.

---

## 📖 이론 내용

### 1. Drift Detection 세부

- 지원 리소스: 대부분이나 일부 미지원 (예: 일부 IAM 서비스 역할)
- 탐지 가능 항목: Property 값 차이, 누락된 리소스, 새로 추가된 리소스(추가 탐지)
- **자동 수정 X** — 차이 보고만, 사람이 결정

```bash
# Stack 수준
aws cloudformation detect-stack-drift --stack-name my-stack
aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id ...

# 리소스 수준 차이 조회
aws cloudformation describe-stack-resource-drifts --stack-name my-stack
```

**Drift 결과 분류:**
- `IN_SYNC`: 일치
- `MODIFIED`: 일부 속성 변경
- `DELETED`: 외부에서 삭제됨
- `NOT_CHECKED`: 지원 안 됨

**Drift 자동화 패턴:**
- EventBridge Schedule (`rate(24 hours)`) → Lambda → DetectStackDrift → SNS 알림

### 2. Change Set 운영

```bash
# Change Set 생성
aws cloudformation create-change-set \
  --stack-name my-stack \
  --change-set-name v2-changes \
  --template-body file://template-v2.yaml \
  --capabilities CAPABILITY_NAMED_IAM

# 검토
aws cloudformation describe-change-set --change-set-name v2-changes --stack-name my-stack

# 실행
aws cloudformation execute-change-set --change-set-name v2-changes --stack-name my-stack

# 거부
aws cloudformation delete-change-set --change-set-name v2-changes --stack-name my-stack
```

**Change Set이 보여주는 정보:**
- Add / Modify / Remove 리소스
- Modify 시 Replacement 여부 (`True` = 교체 = 다운타임/데이터 손실 위험)
- 변경 원인 (Direct modification / Properties change / ParameterValue)

**CI/CD에 통합:**
- Pipeline Stage 1: Create Change Set
- Stage 2: Manual Approval (사람이 Change Set 검토)
- Stage 3: Execute Change Set

### 3. Custom Resource

CFN이 기본 지원하지 않는 리소스 또는 외부 시스템 통합:

```yaml
SlackChannel:
  Type: Custom::SlackChannel
  Properties:
    ServiceToken: !GetAtt SlackProvisionerFn.Arn
    ChannelName: !Sub 'alerts-${Environment}'
    TopicArn: !Ref AlertTopic
```

**Lambda Provider 구현:**
- CFN이 Lambda에 이벤트 전송 (Create/Update/Delete)
- Lambda가 작업 수행 후 **응답 URL에 결과 전송**
- CFN이 결과 기반 Stack 진행

```python
import urllib.request, json

def handler(event, context):
    request_type = event['RequestType']  # Create / Update / Delete
    response_url = event['ResponseURL']
    physical_id = event.get('PhysicalResourceId', 'slack-channel-xyz')

    try:
        if request_type == 'Create':
            # Slack API 호출해 채널 생성
            data = {'Status': 'SUCCESS', 'PhysicalResourceId': physical_id, ...}
        elif request_type == 'Update':
            # 변경 적용
            data = {...}
        elif request_type == 'Delete':
            # 정리
            data = {...}
    except Exception as e:
        data = {'Status': 'FAILED', 'Reason': str(e), ...}

    data.update({
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId']
    })
    urllib.request.urlopen(urllib.request.Request(
        response_url, data=json.dumps(data).encode(), method='PUT'
    ))
```

> ⚠️ **함정**: Lambda가 응답을 보내지 않으면 CFN이 1시간 대기 후 timeout. 모든 분기에 응답 보장 필수.

### 4. CDK Custom Resource Provider

```typescript
import { CustomResource } from 'aws-cdk-lib';
import { Provider } from 'aws-cdk-lib/custom-resources';

const onEvent = new lambda.Function(this, 'OnEvent', { ... });
const isComplete = new lambda.Function(this, 'IsComplete', { ... });

const provider = new Provider(this, 'Provider', {
  onEventHandler: onEvent,
  isCompleteHandler: isComplete,  // 비동기 대기 (예: ECR repl 완료)
  queryInterval: cdk.Duration.minutes(1),
  totalTimeout: cdk.Duration.hours(2),
});

new CustomResource(this, 'MyResource', {
  serviceToken: provider.serviceToken,
  properties: { ... },
});
```

`isComplete`로 장시간 작업 폴링.

### 5. CFN Registry & Resource Type

3rd-party 리소스를 CFN에 등록:
- Datadog, MongoDB Atlas, Snowflake 등이 Public Registry에 게시
- 자체 Resource Type 등록 가능 (`AWS::CloudFormation::ResourceVersion`)
- L1 CFN Construct처럼 사용

### 6. CFN Hooks (Proactive Guardrail)

배포 전 검증:
```bash
aws cloudformation activate-type \
  --type HOOK \
  --type-name AWS::CloudFormation::ResourceHook \
  --execution-role-arn ...
```

- Hook이 리소스 생성 전 평가 → 위반 시 차단
- Control Tower Proactive Guardrails가 내부적으로 사용
- 예: "암호화되지 않은 S3 버킷 차단"

---

## 🧠 알아두면 좋은 심화 이론

### Drift에 대한 잘못된 기대

- 자동 수정 X
- 일부 리소스 미지원 (특히 신규 서비스)
- "drift가 없다" ≠ "모든 변경이 IaC를 통했다" (CloudTrail 별도 필요)

### Change Set + Pipeline 패턴

```yaml
# Pipeline에 CloudFormation Action을 두 단계로
- name: CreateChangeSet
  configuration:
    ActionMode: CHANGE_SET_REPLACE
    StackName: my-stack
    ChangeSetName: pr-changes
    TemplatePath: BuildArtifact::template.yaml
- name: ExecuteChangeSet
  configuration:
    ActionMode: CHANGE_SET_EXECUTE
    StackName: my-stack
    ChangeSetName: pr-changes
```

중간에 Manual Approval Stage 삽입 가능.

### Custom Resource 사용 사례

| 사용 사례 | 이유 |
|----------|------|
| Slack 채널 자동 생성 | AWS 서비스 외 |
| GitHub Repo Webhook 등록 | 외부 시스템 |
| 비-CFN 지원 신규 AWS 기능 | CFN 미지원 시점 우회 |
| 복잡 검증 (정책 평가) | Lambda 로직 필요 |

### Idempotency in Custom Resource

- Create 후 Update → PhysicalResourceId 동일 유지하면 진짜 Update
- Update에서 PhysicalResourceId가 바뀌면 → CFN이 이전 ID로 Delete 호출 (재생성)

### 관련 서비스 Cross-Reference

- **AWS Config Rules** → Week 14 Day 3
- **Control Tower Proactive** → Week 1 Day 4
- **CDK Custom Resources** → Week 8 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
CFN Lifecycle Operations
==================================================

  Drift Detection
   EventBridge Schedule (daily)
        ▼
   Lambda → DetectStackDrift (per stack)
        ▼
   Wait for status
        ▼
   DescribeStackResourceDrifts
        ▼
   If MODIFIED/DELETED → SNS alert + Jira ticket

  Change Set Flow
   ┌────────────┐
   │ Template   │
   └─────┬──────┘
         ▼
   CreateChangeSet
         ▼
   DescribeChangeSet
   (review what changes)
         ▼
   Manual Approval
         ▼
   ExecuteChangeSet

  Custom Resource
   ┌─────────────────────┐
   │ Stack creates       │
   │ Custom::X resource  │
   └──────┬──────────────┘
          ▼
   CFN → Lambda (event with RequestType=Create)
          ▼
   Lambda performs action (e.g., Slack API)
          ▼
   Lambda PUTs response to ResponseURL
          ▼
   CFN proceeds (or fails)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Drift는 탐지만, 자동 수정 X — 정기 탐지 + 알림 자동화
2. ⭐ Change Set + Manual Approval이 안전 업데이트 표준
3. ⭐ Custom Resource Lambda는 **반드시 응답을 ResponseURL에 PUT**
4. ⭐ PhysicalResourceId가 바뀌면 자동 재생성
5. ⭐ CFN Hooks가 Proactive Guardrail의 핵심 메커니즘

---

## 💻 실제 예시 - Drift 정기 점검 자동화

```python
# Lambda (daily EventBridge schedule)
import boto3, json
cfn = boto3.client('cloudformation')
sns = boto3.client('sns')

def handler(event, context):
    stacks = cfn.list_stacks(StackStatusFilter=['CREATE_COMPLETE','UPDATE_COMPLETE'])
    drifted = []
    for s in stacks['StackSummaries']:
        name = s['StackName']
        det = cfn.detect_stack_drift(StackName=name)
        # 폴링
        while True:
            st = cfn.describe_stack_drift_detection_status(
                StackDriftDetectionId=det['StackDriftDetectionId'])
            if st['DetectionStatus'] in ['DETECTION_COMPLETE', 'DETECTION_FAILED']:
                break
            time.sleep(5)
        if st.get('StackDriftStatus') == 'DRIFTED':
            drifted.append(name)
    if drifted:
        sns.publish(
            TopicArn=os.environ['ALERT_TOPIC'],
            Subject='[Drift] CFN stacks drifted',
            Message=json.dumps(drifted, indent=2)
        )
```

```yaml
# Custom Resource 예: Slack 채널
SlackChannel:
  Type: Custom::SlackChannel
  Properties:
    ServiceToken: !GetAtt SlackProvisionerFn.Arn
    ChannelName: !Sub 'alerts-${Environment}'
    SlackToken: '{{resolve:secretsmanager:slack/token:SecretString:bot}}'
```

---

## 📝 연습 문제

**문제 1.** Drift Detection의 결과로 가능한 것은?

A) 자동 수정
B) IaC와 실제 상태 차이 보고 (수정은 사람 결정)
C) Rollback
D) 새 Stack 생성

**정답: B**
해설: 탐지만, 수정은 별개.

---

**문제 2.** Change Set의 가장 큰 가치는?

A) 변경 미리보기 + Replacement 여부 사전 확인 (다운타임/데이터 손실 위험 검토)
B) 비용 절감
C) Region 분산
D) IAM 자동화

**정답: A**
해설: Replacement 확인이 중요.

---

**문제 3.** Custom Resource Lambda가 응답을 보내지 않으면?

A) 자동 성공
B) CFN이 timeout(기본 1시간) 후 Stack 실패
C) 자동 재시도
D) Layer로 우회

**정답: B**
해설: 모든 분기에 응답 보장 필수.

---

**문제 4.** Custom Resource의 PhysicalResourceId가 Update 시 변경되면?

A) 일반 Update
B) CFN이 이전 ID로 Delete 호출 + 새 ID로 Create (재생성)
C) 동작 변화 없음
D) Stack 실패

**정답: B**
해설: PhysicalResourceId 변경 = 재생성.

---

**문제 5.** 모든 Stack에 매일 Drift 점검을 자동화하려면?

A) EventBridge Schedule → Lambda → DetectStackDrift + 알림
B) Trusted Advisor
C) Config
D) IAM Access Analyzer

**정답: A**
해설: 표준 자동화 패턴.

---

**문제 6.** Slack 채널을 CFN으로 자동 생성하려면?

A) AWS::Slack::Channel
B) Custom::SlackChannel + Lambda Provider
C) S3 객체
D) Lambda Layer

**정답: B**
해설: AWS 서비스 외 = Custom Resource.

---

**문제 7.** CFN Hooks의 역할은?

A) 사후 알림
B) 리소스 생성/업데이트 전 평가 — 위반 차단 (Proactive)
C) Drift 탐지
D) IAM 회전

**정답: B**
해설: Hooks = Proactive Guardrail.

---

## 📌 오늘의 요약

1. Drift는 탐지만, EventBridge 정기 점검 + SNS 알림 패턴
2. Change Set + Manual Approval로 안전 변경
3. Custom Resource Lambda는 ResponseURL에 응답 PUT 필수
4. PhysicalResourceId 변경 = 재생성
5. CFN Hooks가 Proactive Guardrail의 메커니즘
