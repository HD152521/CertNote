# Day 4 - 서버리스 대규모 인시던트 자동 대응 케이스

📅 날짜: Week 15 (Day 4)
🎯 주제: Lambda/EventBridge/Step Functions 기반 자동 인시던트 대응 운영
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 서버리스 대규모 이벤트 처리에서 일어나는 전형 장애 패턴 학습
- EventBridge + Lambda + Step Functions로 자동 복구 파이프라인 구성
- Incident Manager + Chatbot까지 통합한 사람-자동화 협력 모델 이해

---

## 🧩 사전 지식 (CS 기초)

- **MTTR**: Mean Time To Recovery — 짧을수록 좋다.
- **Runbook Automation**: 사람이 하던 수습 절차를 코드/문서로 자동화.
- **Idempotency**: 같은 입력에 같은 결과 — 자동 복구의 안전성 보장.

---

## 📖 시나리오

**회사 프로필:**
- 일일 5억 이벤트 처리 (IoT + 결제)
- Lambda 200+ 함수, EventBridge Bus 4개, Step Functions 30개
- 24/7 운영, SLA 99.95%, 페이저 핸드오프 시간 평균 6분
- 목표: 알려진 인시던트 80%는 사람 없이 자동 복구

### 1. 사고 유형과 자동 대응 매핑

| 사고 유형 | 신호 | 자동 대응 |
|-----------|------|-----------|
| Lambda Throttle | Throttles 메트릭 급증 | Reserved Concurrency 증액 |
| DLQ 누적 | DLQ ApproxMsgs > 임계 | Re-drive + 알람 |
| Step Functions 실패율 ↑ | ExecutionsFailed | Canary 롤백 |
| API Gateway 5xx 폭증 | 5xxError | WAF Rate Rule 추가 |
| RDS CPU 95% | CPUUtilization | Aurora 읽기 복제 추가 |
| 비정상 IAM 사용 | CloudTrail + GuardDuty | Role 잠금 |

### 2. 표준 이벤트 흐름

```
신호원(CloudWatch Alarm/EventBridge Rule/GuardDuty/Security Hub)
      │
      ▼
EventBridge Bus
      │
      ▼
Step Functions (Runbook State Machine)
   ├─ 진단 Lambda
   ├─ Approval (선택적, SNS+ Email/Slack)
   ├─ 자동 수정 Lambda 또는 SSM Automation
   └─ 검증 Lambda
      │
      ▼
Incident Manager (Response Plan)
   ├─ 채팅 채널 자동 생성 (Chatbot)
   ├─ 페이저 호출 (PagerDuty)
   └─ Post-Incident Analysis 자동 생성
```

### 3. Lambda Throttle 자동 복구 예시

1. CloudWatch Alarm: `Throttles > 100 for 1 min`
2. EventBridge → Step Functions
3. Lambda가 `get_function_concurrency` 조회 → 현재값 + 50 증액
4. 검증 Lambda 5분 후 Throttle 메트릭 재확인
5. 안정되면 Slack 통지, 아니면 Escalation

### 4. DLQ Re-drive 자동화

- SQS DLQ "ApproximateNumberOfMessagesVisible" 알람
- SQS Redrive API 호출 Lambda
- 단, 재처리 횟수 카운트 메시지 속성에 기록 → 무한 루프 방지

### 5. 보안 인시던트 자동화

- GuardDuty Finding → EventBridge → Step Functions
- 키 유출(IAM credential exfiltration):
  1. AccessKey 즉시 비활성화
  2. 영향받는 사용자/Role 알림
  3. CloudTrail Lake에서 영향 분석 쿼리
  4. Incident Manager 인시던트 자동 오픈

### 6. 사람-자동화 협력

- 자동화가 실패하거나 임팩트 큰 케이스: **Incident Manager Response Plan**으로 페이저
- AWS Chatbot으로 Slack/Teams 채널 자동 생성, 권한 제한된 CLI 실행 가능
- Post-Incident Analysis 템플릿이 자동 생성되어 Timeline/Impact 기록

### 7. 가드레일

- 자동 수정은 항상 **Step Functions**로 감싸기 (재시도/타임아웃/감사)
- 모든 자동 수정은 CloudTrail에 흔적
- SCP로 자동화 Role의 범위 제한
- "Break-glass" Role은 별도, 자동화에서 사용 금지

---

## 🧠 알아두면 좋은 심화 이론

### EventBridge vs SNS

| 항목 | EventBridge | SNS |
|------|-------------|-----|
| 필터링 | 패턴 매칭 | 메시지 필터 정책 |
| 다대다 | 강함 | 강함 |
| 스키마 | 강(Registry) | 약 |
| 아카이브/재처리 | 가능 | 불가 |
| Pipes | 가능 (Source-Filter-Enrich-Target) | 불가 |

자동 대응 라우팅은 **EventBridge가 표준**.

### Step Functions Express vs Standard

- Standard: 1년, 워크플로 감사, Runbook 자동화에 적합
- Express: 5분 이하, 고빈도, 자동 대응 일부 즉시 처리에 적합

### Incident Manager

- Response Plan = Contact + Escalation + Engagement
- Runbook으로 Step Functions/SSM Automation 호출 가능
- 종료 시 Post-Incident Analysis 강제

---

## 🏗️ 아키텍처 다이어그램

```
Serverless Auto-Remediation
==================================================

  Signals
  ├─ CloudWatch Alarm
  ├─ EventBridge Schedule
  ├─ GuardDuty Finding
  ├─ Security Hub Finding
  └─ Config Non-Compliant
              │
              ▼
       EventBridge Bus
              │
              ▼
       Step Functions (Runbook)
       ├─ Diagnose Lambda
       ├─ Approval (optional)
       ├─ Remediation
       │    ├─ Lambda
       │    └─ SSM Automation
       └─ Verify Lambda
              │
              ▼
       Incident Manager
       ├─ Chatbot → Slack
       ├─ Contacts/Pager
       └─ Post-Incident Analysis
              │
              ▼
       Audit: CloudTrail + Security Hub
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ 자동 대응 라우팅 = EventBridge 표준
2. ⭐ Runbook은 Step Functions로 감싸 재시도/감사 보장
3. ⭐ Incident Manager Response Plan + Chatbot이 사람-자동화 협력
4. ⭐ DLQ Re-drive는 카운트 기록으로 무한 루프 방지
5. ⭐ 자동화 Role과 Break-glass Role 분리

---

## 💻 AWS CLI 예시

```bash
# 1) EventBridge Rule → Step Functions
aws events put-rule --name HighLambdaThrottle \
  --event-pattern '{"source":["aws.cloudwatch"],"detail-type":["CloudWatch Alarm State Change"],"detail":{"state":{"value":["ALARM"]}}}'

aws events put-targets --rule HighLambdaThrottle \
  --targets "Id=1,Arn=arn:aws:states:ap-northeast-2:ACCT:stateMachine:ThrottleRecovery,RoleArn=arn:aws:iam::ACCT:role/EventBridgeInvokeSFN"

# 2) Step Functions Standard
aws stepfunctions create-state-machine \
  --name ThrottleRecovery --type STANDARD \
  --role-arn arn:aws:iam::ACCT:role/SfnExec \
  --definition file://throttle-recovery.json

# 3) SQS Re-drive
aws sqs start-message-move-task \
  --source-arn arn:aws:sqs:ap-northeast-2:ACCT:my-dlq

# 4) Incident Manager Response Plan
aws ssm-incidents create-response-plan \
  --name CriticalP1 --incident-template '{"impact":1,"title":"P1"}' \
  --engagements arn:aws:ssm-contacts:...:contact/oncall \
  --chat-channel '{"chatbotSns":["arn:aws:sns:...:incident-channel"]}'

# 5) AWS Chatbot Slack Channel
aws chatbot create-slack-channel-configuration \
  --configuration-name SREChannel \
  --slack-team-id ... --slack-channel-id ... \
  --iam-role-arn arn:aws:iam::ACCT:role/ChatbotRole
```

---

## 📝 연습 문제 (Pro 시나리오형 6문항)

**1.** Lambda Throttles 알람에서 사람 개입 없이 동시성 증액?
A) Lambda 수동 콘솔 B) **EventBridge → Step Functions → Lambda(UpdateFunctionConfiguration)**
C) Auto Scaling Group D) SNS only
**정답: B**

**2.** GuardDuty가 IAM Key 유출 탐지. 즉시 비활성화 + 영향 분석 + 인시던트 오픈?
A) Lambda 단독 B) **EventBridge → Step Functions(Runbook) → Incident Manager**
C) Config Auto-remediation D) CloudTrail trigger only
**정답: B**

**3.** DLQ 자동 Re-drive에서 무한 루프 방지?
A) Lambda 타임아웃 B) **메시지 속성에 재처리 카운트 기록 + 임계 시 사람 개입**
C) DLQ TTL D) SQS Long Polling
**정답: B**

**4.** 5분 이상 걸리는 Runbook? Standard vs Express?
A) Express B) **Standard (1년 한도, 감사 적합)**
C) Lambda 단독 D) SSM Document만
**정답: B**

**5.** SRE 채팅 채널에서 제한된 CLI를 자동 실행?
A) Slack Webhook B) **AWS Chatbot (IAM Role 제한)**
C) Lambda only D) EventBridge
**정답: B**

**6.** 자동화 Role과 사람 비상 Role 관계?
A) 동일 사용 B) **분리 (자동화는 한정, Break-glass는 비상용)**
C) Service-linked Role 사용 D) Root 사용
**정답: B**

---

## 📌 오늘의 요약

1. EventBridge가 모든 자동 대응의 진입점
2. Step Functions로 Runbook 감싸기 — 재시도/감사 보장
3. Incident Manager + Chatbot이 사람과 자동화의 접점
4. 자동 Re-drive는 카운트 기록 필수
5. 자동화 Role ≠ Break-glass Role
