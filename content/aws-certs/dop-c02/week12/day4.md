# Day 4 - AWS Chatbot, Slack/Teams 통합, Incident Manager

📅 날짜: Week 12 (Day 4)
🎯 주제: 사람과 자동화의 접점 — ChatOps + 인시던트 관리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS Chatbot으로 Slack/Teams 통합
- Chatbot에서 직접 AWS 명령 실행
- AWS Incident Manager(SSM) Response Plan
- PagerDuty/OpsGenie와의 비교 + 통합

---

## 🧩 사전 지식 (CS 기초)

- **ChatOps**: 채팅 기반 운영. 명령·알림·문서가 같은 공간.
- **Response Plan**: 인시던트 시 자동 진행 절차.
- **On-call rotation**: 당직 순환표.
- **Postmortem**: 사후 분석 — 비난 없는 문화.

---

## 📖 이론 내용

### 1. AWS Chatbot 구성

```
SNS Topic → Chatbot Channel Configuration → Slack/Teams channel
```

설정:
1. Workspace 인증 (Slack OAuth)
2. Channel 선택
3. IAM Role (Chatbot이 AWS 명령 실행 시 사용)
4. SNS Topic 구독 (알림 수신)

### 2. Chatbot 명령 실행

```
@aws s3 ls
@aws ec2 describe-instances --filter Name=tag:Environment,Values=prod
@aws codedeploy create-deployment --application-name MyApp ...
```

- IAM Role의 권한 내에서만
- Read-only 권장 → 변경은 Approval Pipeline 통해
- 명령은 모든 채널 멤버에게 보임 — 감사 자동

### 3. CodeStar Notifications + Chatbot

```bash
aws codestar-notifications create-notification-rule \
  --name PipelineToSlack \
  --resource arn:aws:codepipeline:...:MyApp \
  --event-type-ids codepipeline-pipeline-pipeline-execution-failed \
  --targets TargetType=AWSChatbotSlack,TargetAddress=arn:aws:chatbot:...:chat-configuration/slack-channel/ops
```

CodePipeline, CodeBuild, CodeCommit, CodeDeploy 알림이 직접 Slack 채널로.

### 4. AWS Incident Manager (SSM)

대규모/Critical 인시던트 관리 도구:
- **Response Plan**: 인시던트 진행 절차 (Runbook + Contact + Chat channel)
- **Contacts**: 사람 + 연락처 (Email/SMS/Voice)
- **Escalation Plan**: 30분 응답 없으면 다음 그룹
- **Engagement**: Contact을 채널/SMS로 호출
- **Timeline**: 모든 이벤트 자동 기록
- **Post-incident analysis**: AWS 템플릿 기반 PIR

### 5. Response Plan 흐름

```
CloudWatch Alarm → EventBridge → Incident Manager Response Plan
  ├─ Open incident
  ├─ Engage on-call team (SMS/Email/Voice)
  ├─ Create Slack/Chime channel
  ├─ Attach SSM Automation Runbook
  └─ Timeline auto-fills
```

```bash
aws ssm-incidents create-response-plan \
  --name CriticalAPI \
  --incident-template impact=1,title="API critical" \
  --chat-channel chatbotSns=[arn:aws:sns:...:OncallTopic] \
  --engagements arn:aws:ssm-contacts:...:contact/team-api \
  --actions ssmAutomation='{...}'
```

### 6. PagerDuty/OpsGenie 통합

AWS 네이티브 외 SaaS와 통합:
- SNS → PagerDuty Webhook
- EventBridge → API Destination → PagerDuty
- 양방향: 인시던트 해결 시 PagerDuty가 EventBridge로 알림

### 7. Postmortem 자동화

- Incident Manager Timeline → PIR(Post-Incident Review) 자동 초안
- 운영자가 보강 → 문서화
- 향후 동일 패턴 자동 대응 추가

---

## 🧠 알아두면 좋은 심화 이론

### Chatbot Guardrail Policy

Chatbot Channel에 추가 정책으로 명령 범위 제한:
```json
{
  "Statement": [{
    "Effect": "Deny",
    "Action": ["ec2:Terminate*","rds:Delete*"],
    "Resource": "*"
  }]
}
```

Slack에서 실수로 prod 삭제 방지.

### Incident Manager vs Custom

| 항목 | Incident Manager | Custom (Lambda+SNS+Slack) |
|------|------------------|----------------------------|
| Timeline 자동화 | ✅ | 직접 작성 |
| Escalation | ✅ | 자체 구현 |
| 통합 PIR | ✅ | 외부 도구 |
| 비용 | 사용량 비례 | 작음 |
| 시험 빈도 | 중간 | 자주 |

### Slack 메시지 형식

Chatbot은 SNS 메시지가 특정 형식이면 풍부한 카드 렌더링:
```json
{
  "version": "1.0",
  "source": "custom",
  "content": {
    "textType": "client-markdown",
    "title": "Deploy failed",
    "description": "...",
    "nextSteps": ["Check CloudWatch", "Run /aws ..."]
  }
}
```

### 관련 서비스 Cross-Reference

- **EventBridge** → Week 12 Day 1
- **SSM Automation Runbook** → Week 12 Day 2
- **GuardDuty 자동 대응** → Week 14 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
Incident Response with ChatOps
==================================================

  CloudWatch Alarm (Critical)
        │
        ▼
   EventBridge Rule
        │
        ├─► Incident Manager Response Plan
        │      ├─ Engage on-call (SMS/Voice/Email)
        │      ├─ Create chat channel
        │      ├─ Attach Runbook
        │      └─ Timeline auto-fills
        │
        ├─► AWS Chatbot → Slack channel
        │      ├─ Alert card
        │      └─ Operators can run `@aws ec2 describe-instances` etc.
        │
        └─► PagerDuty (via SNS)
               └─ Phone call to on-call

  Operator
   ├─ Reads alert in Slack
   ├─ Runs read-only commands in Slack via Chatbot
   ├─ Acks PagerDuty → Incident Manager updates timeline
   └─ Closes incident → PIR auto-draft generated
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Chatbot은 SNS Topic + Slack/Teams 채널 + IAM Role
2. ⭐ Chatbot Guardrail Policy로 위험 명령 차단
3. ⭐ Incident Manager: Response Plan + Contacts + Escalation + Timeline + PIR
4. ⭐ CodeStar Notifications가 Pipeline/Build/Deploy 알림 표준
5. ⭐ PagerDuty/OpsGenie는 SNS/API Destination 통합

---

## 💻 실제 예시

```bash
# Chatbot 채널 (Console 권장, CLI 발췌)
aws chatbot create-slack-channel-configuration \
  --configuration-name OpsChannel \
  --iam-role-arn arn:aws:iam::...:role/AWSChatbotChannelRole \
  --slack-channel-id C12345 \
  --slack-workspace-id T12345 \
  --sns-topic-arns arn:aws:sns:...:OncallTopic arn:aws:sns:...:PipelineNotify

# Incident Manager
aws ssm-incidents create-response-plan \
  --name api-critical \
  --incident-template impact=1,title="API 5xx critical" \
  --chat-channel chatbotSns=[arn:...:OncallTopic] \
  --engagements arn:...:contact/team-api \
  --actions ssmAutomation='{documentName=auto-remediate,roleArn=arn:...,parameters={...}}'

# CW Alarm → Incident Manager
aws ssm-incidents create-replication-set ...
```

---

## 📝 연습 문제

**1.** Slack에 AWS 알림 표준 통합?  A) AWS Chatbot + SNS B) Lambda 매번  **정답: A**

**2.** Slack에서 직접 AWS 명령 실행?  A) Chatbot + IAM Role + 사용자 권한 매핑 + Guardrail Policy B) Personal Token  **정답: A**

**3.** "On-call 30분 응답 없으면 다음 그룹 호출"?  A) Incident Manager Escalation Plan B) Lambda  **정답: A**

**4.** CodePipeline 실패를 Slack에 가장 단순히?  A) CodeStar Notifications → Chatbot 채널 B) Lambda 매번  **정답: A**

**5.** Slack에서 운영자가 prod 삭제 명령 실행 차단?  A) Chatbot Guardrail Policy(Deny ec2:Terminate*)  **정답: A**

**6.** Incident Manager의 PIR?  A) Timeline 기반 사후 분석 초안 자동 생성  **정답: A**

**7.** PagerDuty + AWS?  A) SNS Webhook 또는 EventBridge API Destination B) 직접 DynamoDB  **정답: A**

---

## 📌 오늘의 요약

1. Chatbot = SNS + Slack/Teams + IAM Role + Guardrail
2. CodeStar Notifications가 Pipeline/Build/Deploy 알림 표준
3. Incident Manager: Response Plan + Escalation + Timeline + PIR
4. 외부 SaaS는 SNS/API Destination 통합
5. ChatOps = 알림·명령·문서가 같은 공간
