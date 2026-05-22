# Day 3 - Action Providers - Lambda, Step Functions, Manual Approval

📅 날짜: Week 5 (Day 3)
🎯 주제: 커스텀 로직과 승인 게이트로 파이프라인 확장
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lambda Invoke Action으로 임의 로직 실행
- Step Functions Action으로 복잡 워크플로 오케스트레이션
- Manual Approval Action 구성과 알림 패턴
- CodeStar Notifications와 EventBridge 통합

---

## 🧩 사전 지식 (CS 기초)

- **Webhook**: 외부 시스템이 HTTP로 이벤트 알림.
- **Idempotency Token**: 중복 호출 방지용 키.
- **Long-running task**: 분/시간 단위 작업. Step Functions의 영역.
- **Approval gate**: 사람의 명시적 결재.
- **EventBridge Bus**: 이벤트 라우팅. 멀티 계정 가능.

---

## 📖 이론 내용

### 1. Lambda Invoke Action

```json
{
  "name": "RunSmokeTest",
  "actionTypeId": {
    "category": "Invoke",
    "owner": "AWS",
    "provider": "Lambda",
    "version": "1"
  },
  "configuration": {
    "FunctionName": "SmokeTestFn",
    "UserParameters": "{\"env\":\"staging\"}"
  },
  "inputArtifacts": [{"name": "BuildArtifact"}]
}
```

**Lambda 함수가 받는 이벤트:**
```json
{
  "CodePipeline.job": {
    "id": "...",
    "data": {
      "actionConfiguration": {
        "configuration": {
          "UserParameters": "{\"env\":\"staging\"}"
        }
      },
      "inputArtifacts": [...]
    }
  }
}
```

**필수**: 함수는 `codepipeline.put_job_success_result` 또는 `put_job_failure_result`를 호출해야 함.

```python
import boto3
import json

cp = boto3.client('codepipeline')

def handler(event, context):
    job_id = event['CodePipeline.job']['id']
    try:
        # 비즈니스 로직
        params = json.loads(event['CodePipeline.job']['data']['actionConfiguration']['configuration']['UserParameters'])
        # ... do work ...
        cp.put_job_success_result(
            jobId=job_id,
            outputVariables={'VERSION': '1.2.3'}  # V2 파이프라인에서 다음 Stage가 참조
        )
    except Exception as e:
        cp.put_job_failure_result(
            jobId=job_id,
            failureDetails={'type': 'JobFailed', 'message': str(e)}
        )
```

**비동기 처리**: 즉시 success 보고 후 별도 시스템에서 작업, 완료 시 다시 PutJobResult 호출.

> ⚠️ **타임아웃**: Lambda 자체는 최대 15분. 그 이상은 Step Functions 사용.

### 2. Step Functions Action

복잡 워크플로(병렬, 분기, 재시도, 대기, 사람 개입)를 State Machine으로 정의.

```json
{
  "name": "MultiRegionDeploy",
  "actionTypeId": {
    "category": "Invoke",
    "owner": "AWS",
    "provider": "StepFunctions",
    "version": "1"
  },
  "configuration": {
    "StateMachineArn": "arn:aws:states:...:stateMachine:DeployFlow",
    "Input": "{\"version\":\"#{BuildVariables.VERSION}\"}",
    "ExecutionNamePrefix": "deploy-"
  }
}
```

**유스케이스:**
- 멀티 리전 순차 배포 (us-east-1 → eu-west-1 → ap-northeast-2)
- 카나리 + 검증 + 자동 롤백 (CodeDeploy 보다 복잡한 로직)
- DB 마이그레이션 + 백업 검증 + 배포 + 검증

### 3. Manual Approval Action

```json
{
  "name": "ApproveProd",
  "actionTypeId": {
    "category": "Approval",
    "owner": "AWS",
    "provider": "Manual",
    "version": "1"
  },
  "configuration": {
    "NotificationArn": "arn:aws:sns:...:DeployApprovals",
    "CustomData": "Approve deployment of version #{BuildVariables.VERSION} to prod",
    "ExternalEntityLink": "https://wiki.example.com/release-notes"
  }
}
```

- SNS로 이메일/SMS/Lambda 알림
- 사람이 콘솔 또는 CLI(`approve-action`)로 승인/거부
- 7일 후 자동 timeout(기본)

### 4. CodeStar Notifications

Pipeline 이벤트(시작/성공/실패/단계 진입 등)를 다양한 대상으로:

```bash
aws codestar-notifications create-notification-rule \
  --name MyPipelineNotify \
  --resource arn:aws:codepipeline:...:MyApp-Prod \
  --event-type-ids codepipeline-pipeline-pipeline-execution-failed \
                   codepipeline-pipeline-stage-execution-succeeded \
  --targets TargetType=AWSChatbotSlack,TargetAddress=arn:aws:chatbot:...:chat-configuration/slack-channel/...
```

지원 대상: SNS, AWS Chatbot (Slack/Teams), CloudWatch Events.

### 5. EventBridge 패턴

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"],
    "pipeline": ["MyApp-Prod"]
  }
}
```

Lambda → PagerDuty / Jira 자동 인시던트.

### 6. Custom Action Provider

3rd-party CI/CD 통합용:
- Action Provider 등록 (`aws codepipeline create-custom-action-type`)
- Worker 프로세스가 `poll-for-jobs` 호출
- 작업 수행 후 `put-job-success/failure-result`

대부분 Lambda Invoke로 충분 — Custom Action은 외부 EC2/SaaS와 통합 시.

---

## 🧠 알아두면 좋은 심화 이론

### Lambda Action의 outputVariables (V2)

```python
cp.put_job_success_result(
    jobId=job_id,
    outputVariables={
        'VERSION': '1.2.3',
        'IMAGE_TAG': 'abc1234'
    }
)
```

V2 파이프라인의 다음 Action에서 `#{ActionName.VERSION}` 참조.

### Step Functions + CodePipeline 패턴 — Token-based Callback

Step Functions의 `.waitForTaskToken`으로 Pipeline Action을 일시 정지:
- State에서 `aws.sdk:codePipeline.putJobSuccessResult` 호출 시 토큰 전달
- 외부 시스템이 완료 시 SendTaskSuccess로 콜백

장시간 대기 + 외부 이벤트 통합에 유용.

### Slack 승인 통합

AWS Chatbot으로 Slack 채널에 Pipeline 알림:
- Manual Approval → SNS → Chatbot → Slack 메시지
- Slack에서 직접 명령 (`@aws codepipeline approve ...`)
- IAM 권한이 Slack 사용자에 매핑

### Pipeline 변수 시스템 (V2)

| Variable | 출처 |
|----------|------|
| `#{SourceVariables.CommitId}` | Source action |
| `#{SourceVariables.BranchName}` | Source action |
| `#{BuildVariables.VAR}` | Build (exported-variables) |
| `#{ActionName.OUTPUT}` | Lambda/StepFn output |
| `#{PipelineMetaData.PipelineName}` | 메타 |
| `#{PipelineMetaData.PipelineExecutionId}` | 메타 |

### Stop / Resume Pipeline

```bash
aws codepipeline stop-pipeline-execution \
  --pipeline-name MyApp \
  --pipeline-execution-id ... \
  --abandon \
  --reason "Bad release"
```

실행 중 중단. retry는 별도 API.

### 관련 서비스 Cross-Reference

- **AWS Chatbot** → Week 12 Day 4
- **EventBridge** → Week 12 Day 1
- **Step Functions** → Week 7 Day 4
- **CodeStar Notifications** → Week 12 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
Lambda + Step Functions + Manual Approval
==================================================

  Source → Build → Test → [Lambda: smoke test]
                              |
                              v
                       [Step Functions: multi-region deploy]
                              |
                              ├─ Deploy us-east-1
                              ├─ Wait 30min + check alarm
                              ├─ Deploy eu-west-1
                              ├─ Wait
                              └─ Deploy ap-northeast-2
                              |
                              v
                       [Manual Approval → SNS → Slack/Chatbot]
                              |
                              v
                       [CodeDeploy: final prod cutover]

  Pipeline V2 Variables:
   - #{SourceVariables.CommitId}
   - #{BuildVariables.IMAGE_TAG}
   - #{LambdaSmoke.SMOKE_REPORT_URL}
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Lambda Invoke Action은 `put_job_success_result` / `put_job_failure_result` 필수
2. ⭐ 15분 초과 작업 또는 복잡 워크플로 → Step Functions Action
3. ⭐ Manual Approval → SNS → 이메일/Slack(Chatbot)
4. ⭐ V2 Pipeline 변수로 단계 간 데이터 전달
5. ⭐ CodeStar Notifications + Chatbot 조합으로 Slack 알림 표준화

---

## 💻 실제 예시 - Manual Approval + Slack

```bash
# 1) SNS Topic 생성
aws sns create-topic --name DeployApprovals

# 2) Chatbot 설정 (콘솔 권장)
# Slack workspace 인증, channel 선택, SNS topic 구독

# 3) Pipeline Stage 추가
cat <<EOF
{
  "name": "ApproveProd",
  "actions": [{
    "name": "ManualApproval",
    "actionTypeId": {
      "category": "Approval", "owner": "AWS",
      "provider": "Manual", "version": "1"
    },
    "configuration": {
      "NotificationArn": "arn:aws:sns:ap-northeast-2:111:DeployApprovals",
      "CustomData": "Approve v#{BuildVariables.VERSION} to prod",
      "ExternalEntityLink": "https://github.com/my-org/my-app/releases/tag/v#{BuildVariables.VERSION}"
    },
    "timeoutInMinutes": 1440
  }]
}
EOF
```

```python
# Lambda Invoke Action 핸들러 예
import boto3
cp = boto3.client('codepipeline')

def handler(event, context):
    job_id = event['CodePipeline.job']['id']
    try:
        params = event['CodePipeline.job']['data']['actionConfiguration']['configuration']
        user_params = params.get('UserParameters', '{}')

        # 스모크 테스트 호출
        import urllib.request
        with urllib.request.urlopen('https://staging.example.com/health') as r:
            assert r.status == 200

        cp.put_job_success_result(
            jobId=job_id,
            outputVariables={'SMOKE_REPORT_URL': 'https://logs.example.com/smoke/abc'}
        )
    except Exception as e:
        cp.put_job_failure_result(
            jobId=job_id,
            failureDetails={'type': 'JobFailed', 'message': str(e)}
        )
```

---

## 📝 연습 문제

**문제 1.** Lambda Invoke Action에서 Lambda가 결과를 보고하지 않으면?

A) 자동 성공 처리
B) Pipeline이 무한 대기 → 결국 timeout 실패
C) 자동 재시도
D) Skip

**정답: B**
해설: PutJobResult 호출 필수. 함수가 정상 종료해도 결과 미보고면 실패.

---

**문제 2.** Lambda Action에서 15분 이상 걸리는 작업은?

A) Lambda 자체에서 처리
B) Step Functions Action으로 변경, 또는 Lambda는 비동기로 시작만 + 외부 시스템 완료 후 다시 PutJobResult
C) Pipeline timeout 늘리기
D) 불가능

**정답: B**
해설: Lambda 15분 한도 우회 패턴. Step Functions이 정공법.

---

**문제 3.** Manual Approval 알림을 Slack 채널로 보내려면?

A) Pipeline → SNS → AWS Chatbot → Slack
B) Pipeline → 직접 Slack API
C) Lambda로 매번 호출
D) EventBridge만으로 가능

**정답: A**
해설: Chatbot이 표준 통합 경로.

---

**문제 4.** V2 Pipeline에서 다음 Stage가 이전 Lambda Action의 출력 값을 참조하려면?

A) `#{LambdaActionName.VAR}` (Lambda가 outputVariables로 보낸 값)
B) Pipeline 변수 정의
C) S3에 저장 후 다음 단계가 읽음
D) 환경 변수 export

**정답: A**
해설: outputVariables → 다음 단계 참조 표준.

---

**문제 5.** Manual Approval의 기본 타임아웃은?

A) 1시간
B) 7일 (10080분)
C) 무제한
D) 24시간

**정답: B**
해설: 7일 기본. timeoutInMinutes로 단축 가능.

---

**문제 6.** Step Functions Action을 사용하는 이유로 가장 적절한 것은?

A) 비용 절감
B) 복잡한 분기·재시도·대기·멀티 리전 워크플로 표현
C) Lambda 호출 단순화
D) IAM 단순화

**정답: B**
해설: 복잡 워크플로 표현이 Step Functions의 강점.

---

**문제 7.** Pipeline 실패 이벤트를 PagerDuty에 자동 보내려면?

A) EventBridge Rule (CodePipeline State Change → FAILED) → Lambda → PagerDuty API
B) Pipeline에 추가 Stage
C) CloudTrail로 사후 분석
D) Trusted Advisor

**정답: A**
해설: EventBridge가 표준 이벤트 라우터.

---

## 📌 오늘의 요약

1. Lambda Invoke Action — put_job_success/failure_result 필수
2. Step Functions Action으로 복잡 워크플로
3. Manual Approval + SNS + Chatbot = Slack 승인 패턴
4. V2 변수 시스템으로 단계 간 데이터 전달
5. EventBridge로 Pipeline 이벤트를 외부 시스템(PagerDuty/Jira)에 연결
