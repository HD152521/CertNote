# Day 4 - ChatOps와 Incident Manager: 자동화가 끝나고 사람 조직이 시작되는 경계

자동 복구가 아무리 정교해도 모든 인시던트를 처리하지는 못한다. 어떤 장애는 코드가 결정할 수 없는 판단을 요구하고("이 결제 불일치를 롤백할 것인가 수동 보정할 것인가"), 어떤 장애는 여러 팀이 동시에 모여야 풀리며, 어떤 장애는 고객·법무·경영진에게 보고가 필요하다. 이 지점에서 자동화는 끝나고 **사람 조직의 협응**(coordination)이 시작된다. 그리고 여기서 가장 비싼 자원은 컴퓨팅이 아니라 사람의 주의(attention)와 협응 대역폭이다. 새벽 3시에 페이지를 받은 엔지니어가 무슨 일인지 파악하고, 누구를 더 불러야 하는지 판단하고, 흩어진 도구(콘솔·로그·티켓·전화)를 오가며 컨텍스트를 재구성하는 데 드는 시간 — 이것이 자동 복구가 닿지 못한 영역의 MTTR을 지배한다.

오늘은 ChatOps와 Incident Manager를 "Slack 알림 붙이는 법"으로 보지 않고, 그 밑에 깔린 조직 사회학과 인시던트 커맨드 이론을 판다. ChatOps가 어떤 운영 철학에서 나왔는지(GitHub의 Hubot, 2013), 왜 "채팅 채널을 단일 진실의 공간으로 만드는 것"이 협응 비용을 줄이는지, AWS Incident Manager의 Response Plan·Escalation·Timeline이 어떤 비상 대응 표준(ICS)을 빌렸는지, 비난 없는 포스트모템(blameless postmortem)이 왜 안전 문화의 핵심인지를 본다. DOP 시험에서 이 영역은 운영 우수성 도메인의 핵심으로, "Pipeline 실패를 Slack에 어떻게 표준적으로 알리나", "Critical 인시던트에서 on-call을 어떻게 자동 호출·에스컬레이션하나", "ChatOps에서 위험 명령을 어떻게 차단하나"로 반복 출제된다.

## ChatOps는 어디서 왔나 — 운영의 단일 진실 공간

"채팅으로 운영한다"는 개념은 2013년경 GitHub가 **Hubot**(채팅봇 프레임워크)으로 배포·모니터링·인시던트 대응을 모두 채팅 채널에서 수행하면서 대중화됐다. 그전까지 운영 지식은 개인의 머릿속, 흩어진 위키, 누군가의 터미널 히스토리에 파편화돼 있었다. ChatOps의 통찰은 단순하면서 강력하다 — **명령·알림·논의·문서를 하나의 채널에 모으면, 그 채널 자체가 인시던트의 단일 진실 공간(single source of truth)이 된다.**

이것이 협응 비용을 줄이는 메커니즘은 분산 시스템의 그것과 닮았다. 여러 사람이 각자 다른 도구에서 행동하면 "지금 상태가 무엇인가"에 대한 **공유 인식**(shared mental model)이 갈라진다 — A는 콘솔을 보고, B는 로그를 보고, C는 전화로 들었다. 인시던트 대응에서 가장 위험한 순간은 두 엔지니어가 서로 모르고 같은 자원을 동시에 조작할 때다(2017 S3 사고도 결국 누가 무엇을 하는지에 대한 공유 인식의 문제였다). ChatOps는 모든 행동을 한 타임라인에 직렬화해, 누가 무엇을 언제 했는지가 자동으로 기록되고 모두에게 보인다. 이는 사실상 **감사 로그가 협업의 부산물로 공짜로 생기는** 구조다.

> 💡 **관련 이론**: ChatOps는 분산 시스템의 **공유 로그를 통한 합의**(consensus via shared log)와 같은 사상이다. Raft·Paxos 같은 합의 알고리즘이 모든 노드가 같은 순서의 로그를 보게 만들어 상태 일관성을 달성하듯, ChatOps는 모든 대응자가 같은 채널의 같은 순서 메시지를 보게 해 "지금 무슨 일이 벌어지고 누가 무엇을 하고 있는가"에 대한 공유 인식을 만든다. 인시던트 대응 연구(Google SRE Book의 "Managing Incidents" 장)는 효과적 대응의 핵심을 "명확한 역할(Incident Commander)·실시간 상태 문서·통제된 커뮤니케이션 채널"로 꼽는데, ChatOps 채널은 이 셋을 한 곳에 구현한다. 핵심은 **컨텍스트 스위칭 비용의 제거**다 — 도구를 오가며 정보를 재조립하는 인지 부하가 사라지면, 같은 사람이 같은 시간에 더 빠르게 판단한다.

## AWS Chatbot — SNS와 채널 사이의 번역기

AWS Chatbot은 SNS 토픽과 Slack/Teams 채널을 잇는 관리형 다리다. 구조는 단순하다.

```
SNS Topic → AWS Chatbot Channel Configuration → Slack/Teams channel
              │
              └─ IAM Role (Slack에서 @aws 명령 실행 시 사용하는 권한)
```

구성 요소가 셋이다. **(1) SNS 토픽 구독** — CloudWatch Alarm·EventBridge·CodeStar Notifications가 SNS로 던진 알림을 Chatbot이 받아 채널에 카드로 렌더링한다. **(2) Slack/Teams 워크스페이스 OAuth 인증** — Chatbot이 그 채널에 글을 쓸 권한. **(3) IAM Role** — 채널에서 `@aws ...` 명령을 실행할 때 Chatbot이 가정(assume)하는 역할로, 이 역할의 권한이 명령의 상한을 정한다.

```bash
aws chatbot create-slack-channel-configuration \
  --configuration-name OpsChannel \
  --iam-role-arn arn:aws:iam::...:role/AWSChatbotChannelRole \
  --slack-channel-id C12345 \
  --slack-workspace-id T12345 \
  --sns-topic-arns arn:aws:sns:...:OncallTopic arn:aws:sns:...:PipelineNotify
```

Slack에서 직접 AWS 명령을 실행할 수 있다는 점이 ChatOps의 양날의 검이다.

```
@aws s3 ls
@aws ec2 describe-instances --filters Name=tag:Environment,Values=prod
@aws cloudwatch describe-alarms --state-value ALARM
```

명령이 모든 채널 멤버에게 보이므로 **감사가 자동**으로 되고 동료 검토(peer review)가 즉석에서 일어나지만, 동시에 누군가 실수로 `@aws ec2 terminate-instances`를 칠 위험도 생긴다.

> ⚠️ **함정**: Chatbot 명령의 실제 권한은 **두 IAM 레이어의 교집합**으로 결정된다 — 채널 구성의 IAM Role과, 추가로 설정하는 **Guardrail Policy**(채널 가드레일)다. Guardrail은 명시적 Deny로 작동해, IAM Role이 아무리 넓어도 가드레일이 막은 것은 못 한다. 그래서 "Role은 운영 편의상 넓게, Guardrail로 위험 동작만 Deny"가 정석이다. 흔한 실수는 Role만 좁히려다 운영에 필요한 read 권한까지 막거나, 반대로 Guardrail 없이 Role만 믿어 위험 명령을 열어두는 것이다.

## Guardrail Policy — Slack에서 prod를 지우지 못하게

채팅창은 오타와 충동이 위험해지는 공간이다. **Guardrail Policy**는 Chatbot 채널에 거는 명시적 Deny 정책으로, IAM Role의 권한과 무관하게 위험 명령을 봉쇄한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": [
      "ec2:TerminateInstances", "ec2:Delete*",
      "rds:Delete*", "s3:DeleteBucket",
      "iam:*", "kms:ScheduleKeyDeletion"
    ],
    "Resource": "*"
  }]
}
```

설계 원칙은 **읽기는 자유, 쓰기는 파이프라인으로**다. Slack에서 직접 하는 명령은 진단(describe·list·get)에 한정하고, 실제 변경(배포·삭제·설정 변경)은 승인 게이트가 있는 CodePipeline이나 SSM Automation Runbook을 거치게 한다. 이는 인간이 직접 손대는 비가역 동작의 blast radius를 최소화하는, Day 3에서 본 "되돌릴 수 없는 동작은 게이트 뒤에" 원칙의 ChatOps 버전이다.

> 🔍 **더 깊이**: Guardrail Policy는 AWS IAM의 **명시적 Deny 우선**(explicit deny always wins) 평가 모델을 활용한 것이다. IAM 권한 평가는 "명시적 Deny가 하나라도 있으면 무조건 거부, 없으면 명시적 Allow를 찾고, 그것도 없으면 묵시적 거부"로 작동한다. 이 구조 덕에 Guardrail의 Deny는 그 위의 어떤 Allow보다도 우선한다 — Organizations의 **SCP**(Service Control Policy)가 계정 전체에 거는 가드레일과 정확히 같은 메커니즘이다. 두 경우 모두 "권한 부여(grant)가 아니라 권한 천장(ceiling)을 정의한다"는 것이 핵심이다. 즉 Guardrail은 무엇을 허용하는 게 아니라, 무엇은 절대 안 되는지를 정의하는 **최대 권한 경계**(permissions boundary)의 한 형태다.

## CodeStar Notifications — 파이프라인 알림의 표준 경로

CodePipeline·CodeBuild·CodeDeploy·CodeCommit의 상태 변화를 Slack에 알리는 표준 방법은 Lambda를 매번 짜는 게 아니라 **CodeStar Notifications**다.

```bash
aws codestar-notifications create-notification-rule \
  --name PipelineToSlack \
  --resource arn:aws:codepipeline:...:MyApp \
  --event-type-ids \
    codepipeline-pipeline-pipeline-execution-failed \
    codepipeline-pipeline-pipeline-execution-succeeded \
  --targets TargetType=AWSChatbotSlack,TargetAddress=arn:aws:chatbot:...:chat-configuration/slack-channel/ops
```

CodeStar Notifications는 내부적으로 EventBridge 이벤트를 받아 SNS를 거쳐 Chatbot으로 흐른다. 직접 EventBridge Rule을 짜는 것보다 추상화 수준이 높아, "어떤 이벤트 타입을 어느 채널로"만 선언하면 된다. 시험에서 "Pipeline 실패를 Slack에 가장 단순/표준적으로"의 답은 거의 항상 CodeStar Notifications + Chatbot이다(Lambda나 직접 EventBridge는 과도한 글루 코드).

## AWS Incident Manager — 비상 대응 체계를 코드로

단순 알림을 넘어, Critical 인시던트는 **누구를 부르고, 응답이 없으면 누구로 넘기고, 무엇을 자동 실행하고, 전 과정을 어떻게 기록하는가**의 체계가 필요하다. AWS Systems Manager **Incident Manager**가 이를 관리형으로 제공한다.

| 구성 요소 | 역할 | 비유 |
|----------|------|------|
| **Response Plan** | 인시던트 발생 시 자동 진행 절차 (impact·title·런북·채널·연락처를 묶음) | 비상 대응 매뉴얼 |
| **Contacts** | 사람과 그 연락 수단(Email/SMS/Voice) | 비상 연락망 |
| **Engagement** | Contact을 실제로 호출(SMS/전화/이메일 발송) | 호출 행위 |
| **Escalation Plan** | "N분 내 응답 없으면 다음 단계 그룹 호출" | 단계적 비상 소집 |
| **Timeline** | 모든 이벤트(engage·acknowledge·action)를 자동 타임스탬프 기록 | 사건 일지 |
| **Post-Incident Analysis (PIR)** | Timeline 기반 사후 분석 초안 자동 생성 | 사고 보고서 |

```bash
aws ssm-incidents create-response-plan \
  --name api-critical \
  --incident-template impact=1,title="API 5xx critical" \
  --chat-channel chatbotSns=[arn:aws:sns:...:OncallTopic] \
  --engagements arn:aws:ssm-contacts:...:contact/team-api \
  --actions ssmAutomation='{documentName=auto-remediate,roleArn=arn:...,parameters={...}}'
```

흐름은 이렇다. CloudWatch Alarm(Critical) → EventBridge → Incident Manager Response Plan이 발동 → 인시던트 오픈 → on-call 팀을 SMS/Voice/Email로 호출(engage) → Slack/Chime 인시던트 채널 자동 생성 → SSM Automation Runbook 첨부 → Timeline 자동 기록 시작. 응답이 없으면 Escalation Plan이 다음 그룹을 부른다.

> 💡 **관련 이론**: Incident Manager의 구조(명령 체계·역할·단계적 에스컬레이션·타임라인)는 1970년대 미국 산불 대응에서 정립된 **ICS**(Incident Command System, 사건 지휘 체계)를 소프트웨어 운영에 옮긴 것이다. ICS의 핵심은 (1) **단일 지휘관**(Incident Commander)이 조정을 책임지고, (2) 역할이 사전 정의돼 누가 무엇을 하는지 모호하지 않으며, (3) **통제 범위**(span of control, 한 사람이 직접 관리하는 인원 3~7명)를 넘으면 계층을 늘리고, (4) 모든 활동이 기록된다는 것이다. Google SRE의 인시던트 관리와 PagerDuty의 Incident Response 가이드 모두 ICS를 명시적으로 차용한다. Escalation Plan은 ICS의 "응답 없는 자원은 다음 자원으로 자동 승계"를, Timeline은 ICS의 활동 일지(activity log)를 구현한 것이다. 즉 Incident Manager는 50년간 검증된 비상 대응 조직론을 클라우드 API로 코드화한 셈이다.

## 외부 SaaS 통합 — PagerDuty, OpsGenie

많은 조직이 on-call 관리에 PagerDuty·OpsGenie 같은 전문 SaaS를 이미 쓴다. AWS는 두 경로로 통합한다.

- **인바운드(AWS → SaaS)**: SNS → PagerDuty/OpsGenie Webhook, 또는 EventBridge → **API Destination**(외부 HTTPS 엔드포인트로 이벤트 전송, 인증·레이트 리밋 관리형)
- **아웃바운드(SaaS → AWS)**: PagerDuty에서 인시던트가 acknowledge/resolve되면 webhook으로 EventBridge에 알려 양방향 동기화

```bash
# EventBridge API Destination으로 PagerDuty Events API 호출
aws events create-api-destination \
  --name pagerduty-events \
  --connection-arn arn:aws:events:...:connection/pd-conn \
  --invocation-endpoint https://events.pagerduty.com/v2/enqueue \
  --http-method POST
```

> 🔍 **더 깊이**: EventBridge **API Destination**은 단순 웹훅 호출 이상이다 — **Connection** 객체에 인증(API Key/OAuth/Basic)을 저장하고 Secrets Manager로 비밀을 관리하며, 호출 **레이트 리밋**을 걸어 외부 API를 과부하시키지 않고, 실패 시 EventBridge의 재시도·DLQ 안전망을 그대로 받는다. 직접 Lambda로 외부 API를 호출하면 이 모든 배관(인증 갱신·레이트 리밋·재시도·시크릿 로테이션)을 손으로 관리해야 한다. 이는 Day 1에서 본 "글루 코드를 관리형으로 흡수"하는 EventBridge 철학의 일관된 연장이다. 시험에서 "EventBridge에서 외부 SaaS(PagerDuty/Datadog/ServiceNow)로 인증을 포함해 안전하게 이벤트 전송"의 답은 API Destination이다.

## 비난 없는 포스트모템 — 안전 문화의 핵심

인시던트가 끝나면 **포스트모템**(사후 분석)을 쓴다. Incident Manager는 Timeline을 바탕으로 PIR 초안을 자동 생성해, 운영자가 원인·영향·교훈·후속 조치를 보강한다. 그런데 포스트모템의 진짜 가치는 문서 자체가 아니라 그것을 쓰는 **문화**에 있다.

> 💡 **관련 이론**: **비난 없는 포스트모템**(blameless postmortem)은 항공·의료 등 고위험 산업의 **안전 문화**(safety culture) 연구에서 왔다. 핵심 통찰은 시드니 데커(Sidney Dekker)의 "새로운 시각의 인적 오류"(New View of Human Error)와 닿아 있다 — 사고는 "나쁜 사람"이 아니라 "정상적인 사람이 그 순간 합리적으로 보였던 행동을 한 결과 시스템의 잠재 결함이 드러난 것"이다. 사람을 비난하면 다음부터 사람들이 사고를 숨기고, 정보가 막히고, 같은 결함이 반복된다. 비난 대신 "그 순간 그 정보로는 왜 그 행동이 합리적이었나"를 묻고 시스템을 고친다. James Reason의 **스위스 치즈 모델**(Swiss Cheese Model)도 같은 맥락이다 — 사고는 한 사람의 실수가 아니라 여러 방어층의 구멍이 우연히 정렬됐을 때 일어난다. 2017 AWS S3 사고의 포스트모템이 "엔지니어를 탓한다"가 아니라 "도구에 안전 상한이 없었다"로 끝난 것이 이 문화의 모범이다. DOP에서 운영 우수성(Operational Excellence) 기둥이 강조하는 "실패에서 배우기"가 바로 이것이다.

> 📚 **사례**: **Etsy**는 2012년 무렵 "Blameless PostMortems and a Just Culture"라는 엔지니어링 블로그로 비난 없는 문화를 업계에 전파한 선구자다. Etsy는 장애를 낸 엔지니어가 직접 포스트모템을 발표하게 하되, 처벌이 아니라 "그 결정이 그 순간 어떻게 합리적으로 보였는가"를 팀이 함께 재구성하게 했다. 결과적으로 엔지니어들이 사고를 숨기지 않고 적극 공유해, 조직 전체의 학습 속도가 빨라졌다. 이 사례가 보여주는 교훈: 인시던트 도구(Incident Manager·PagerDuty)는 협응을 돕지만, 그 도구로 모은 데이터를 학습으로 전환하는 것은 비난 없는 문화이며, 도구와 문화가 함께 가야 MTTR이 장기적으로 줄어든다.

## Slack 메시지 형식 — 풍부한 카드 렌더링

Chatbot은 SNS 메시지가 특정 스키마를 따르면 단순 텍스트가 아닌 풍부한 카드(제목·설명·다음 단계 버튼)로 렌더링한다.

```json
{
  "version": "1.0",
  "source": "custom",
  "content": {
    "textType": "client-markdown",
    "title": ":rotating_light: Deploy failed — MyApp prod",
    "description": "CodeDeploy rollback triggered. 5xx spike at 03:14 UTC.",
    "nextSteps": [
      "Check CloudWatch dashboard: <url>",
      "Run `@aws codedeploy get-deployment --deployment-id d-xxx`",
      "Page IC if not resolved in 10m"
    ]
  }
}
```

이는 알림을 "정보 전달"에서 "다음 행동 유도"로 격상시킨다 — 알림을 받은 사람이 바로 무엇을 해야 할지(next steps)가 같은 카드에 있어, 컨텍스트를 재조립하는 시간이 줄어든다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **ChatOps는 명령·알림·논의·문서를 한 채널에 모아 단일 진실 공간**을 만들어, 대응자 간 공유 인식을 직렬화하고 협응 비용·컨텍스트 스위칭을 줄인다(GitHub Hubot 시초, 분산 합의의 공유 로그 사상). 둘째, **AWS Chatbot은 SNS-채널 다리**이며, 명령 권한은 IAM Role과 Guardrail Policy(명시적 Deny 우선)의 교집합으로 결정돼 "읽기는 자유, 쓰기는 파이프라인으로"가 정석이다. 셋째, **CodeStar Notifications가 Pipeline/Build/Deploy 알림의 표준 경로**(과도한 글루 코드 불필요)다. 넷째, **Incident Manager는 ICS(사건 지휘 체계)를 코드화**해 Response Plan·Engagement·Escalation·Timeline·PIR로 비상 대응을 자동화하고, 외부 SaaS는 SNS/API Destination으로 통합한다. 다섯째, **비난 없는 포스트모템**은 안전 문화(스위스 치즈 모델·Just Culture)의 핵심으로, 도구가 모은 데이터를 학습으로 전환해 장기 MTTR을 줄인다.

다음 글에서는 Week 12 전체 — EventBridge·SSM Automation·Auto-healing·ChatOps·Incident Manager를 하나의 인시던트 자동화 파이프라인으로 엮어, 실전 시나리오로 통합 점검한다.

---

## 📝 연습 문제

**문제 1.** CodePipeline 실행 실패를 Slack 채널에 가장 단순하고 표준적인 방법으로 알리려 한다. 가장 적합한 것은?

A) Pipeline 실패마다 Lambda를 트리거해 Slack Webhook을 직접 호출

B) CodeStar Notifications 규칙 → AWS Chatbot(Slack 채널) 타겟

C) CloudWatch Logs를 폴링하는 cron Lambda로 실패를 감지해 Slack 전송

D) Pipeline에 수동 승인 단계를 추가해 실패를 사람이 확인

**정답: B**

해설: CodeStar Notifications는 CodePipeline/CodeBuild/CodeDeploy/CodeCommit 상태 변화를 알리는 표준 경로로, "어떤 이벤트 타입을 어느 채널로"만 선언하면 내부적으로 EventBridge→SNS→Chatbot으로 흐른다. Lambda로 Webhook 직접 호출(A)이나 로그 폴링(C)은 불필요한 글루 코드이며 재시도·인증·유지보수 부담이 생긴다. 수동 승인(D)은 알림이 아니라 게이트로, 목적이 다르다. 시험에서 "가장 단순/표준"이라는 표현은 CodeStar Notifications + Chatbot을 가리킨다.

---

**문제 2.** Slack에서 운영자가 Chatbot으로 AWS 명령을 실행할 수 있게 하되, 실수로라도 prod EC2 종료나 RDS 삭제 같은 위험 명령은 절대 차단하려 한다. IAM Role은 운영 편의상 넓게 유지하고 싶다. 올바른 구성은?

A) IAM Role 자체를 read-only로만 좁혀 모든 변경을 막는다

B) Chatbot 채널에 Guardrail Policy(명시적 Deny: ec2:TerminateInstances, rds:Delete* 등)를 추가 — IAM Role과 무관하게 위험 명령 봉쇄

C) Slack 채널을 비공개로 전환

D) 명령 실행 기능을 비활성화하고 알림만 받는다

**정답: B**

해설: Chatbot 명령의 실제 권한은 IAM Role과 Guardrail Policy의 교집합이다. Guardrail은 명시적 Deny로 작동해(IAM의 explicit-deny-always-wins 평가 모델), Role이 아무리 넓어도 가드레일이 막은 것은 못 한다. 그래서 "Role은 운영 편의상 넓게, Guardrail로 위험 동작만 Deny"가 정석이며, 이는 Organizations SCP와 같은 권한 천장(ceiling) 메커니즘이다. Role을 read-only로 좁히면(A) 운영에 필요한 권한까지 잃고, 명령 비활성화(D)는 ChatOps 이점을 버린다. 채널 비공개(C)는 권한과 무관하다.

---

**문제 3.** Critical 인시던트에서 on-call 1차 담당자가 30분 내 응답하지 않으면 자동으로 2차 그룹을, 그래도 없으면 매니저를 호출하도록 단계적 비상 소집을 구성하려 한다. AWS 네이티브 솔루션은?

A) Lambda가 30분마다 폴링하며 다음 사람에게 SMS를 보냄

B) AWS Incident Manager의 Escalation Plan(Contacts + 단계별 N분 응답 대기 후 다음 단계)

C) SNS 토픽에 모든 사람을 구독시켜 동시에 알림

D) CloudWatch Alarm을 여러 개 만들어 시차를 둠

**정답: B**

해설: Incident Manager의 Escalation Plan은 "N분 내 acknowledge 없으면 다음 단계 그룹 호출"을 선언적으로 구현한다. 이는 ICS(사건 지휘 체계)의 "응답 없는 자원은 다음 자원으로 자동 승계" 원칙의 구현으로, Contacts(연락 수단)·Engagement(호출)·Timeline(기록)과 통합된다. Lambda 폴링(A)이나 시차 Alarm(D)은 직접 구현 부담과 상태 관리 문제가 있고, 전원 동시 알림(C)은 단계적 에스컬레이션이 아니라 책임 분산(아무도 안 받는 bystander effect)을 부른다.

---

**문제 4.** EventBridge에서 외부 SaaS인 PagerDuty Events API로 인증을 포함해 인시던트를 안전하게 전송하되, 인증 갱신·레이트 리밋·재시도·시크릿 관리를 직접 코딩하지 않으려 한다. 가장 적합한 것은?

A) Lambda가 PagerDuty API를 직접 호출하고 API Key를 환경 변수에 저장

B) EventBridge API Destination + Connection(인증을 Secrets Manager로 관리, 레이트 리밋, EventBridge 재시도·DLQ 활용)

C) SNS Email 구독으로 PagerDuty 이메일 인테그레이션 주소에 전송

D) S3에 이벤트를 쓰고 PagerDuty가 폴링

**정답: B**

해설: EventBridge API Destination은 외부 HTTPS 엔드포인트 호출을 관리형으로 제공한다 — Connection에 인증(API Key/OAuth/Basic)을 저장하고 Secrets Manager로 비밀을 관리하며, 레이트 리밋을 걸어 외부 API를 보호하고, 실패 시 EventBridge 재시도·DLQ 안전망을 받는다. Lambda 직접 호출(A)은 인증 갱신·레이트 리밋·재시도·시크릿 로테이션을 손으로 관리해야 하고 API Key를 환경 변수에 두면 노출 위험이 있다. 이메일(C)·S3 폴링(D)은 신뢰성·지연 면에서 부적합하다. 이는 "글루 코드를 관리형으로 흡수"하는 EventBridge 철학의 연장이다.

---

**문제 5.** 인시던트 대응에서 여러 엔지니어가 각자 다른 도구(콘솔·로그·전화)에서 행동하다 서로 모르고 같은 자원을 조작해 상황을 악화시키는 일이 반복된다. 이를 구조적으로 줄이는 ChatOps의 핵심 가치는?

A) Slack이 콘솔보다 빠르기 때문

B) 명령·알림·논의·문서를 한 채널에 직렬화해 모든 대응자가 같은 순서의 정보를 보는 공유 인식(shared mental model)을 만들고, 모든 행동이 자동 감사 기록됨

C) Slack 알림이 이메일보다 눈에 잘 띄기 때문

D) 채팅봇이 명령을 자동 실행해 주기 때문

**정답: B**

해설: ChatOps의 핵심은 속도나 가시성이 아니라 공유 인식의 직렬화다. 여러 사람이 다른 도구에서 행동하면 "지금 상태가 무엇인가"의 공유 인식이 갈라져, 모르고 같은 자원을 동시 조작하는 위험한 순간이 생긴다(2017 S3 사고의 본질도 이것). ChatOps는 모든 행동을 한 타임라인에 직렬화해 누가 무엇을 언제 했는지가 자동 기록·공유되며, 이는 분산 합의의 공유 로그(Raft/Paxos)가 노드 간 상태 일관성을 만드는 것과 같은 사상이다. 감사 로그가 협업의 부산물로 공짜로 생긴다.

---

**문제 6.** 인시던트 종료 후 포스트모템을 작성하는데, 장애를 낸 엔지니어를 비난하는 분위기가 생기자 사람들이 점점 사고를 숨기기 시작했다. 안전 문화 관점에서 올바른 접근은?

A) 책임자를 명확히 징계해 재발을 억제한다

B) 비난 없는 포스트모템(blameless) — "그 순간 그 정보로 왜 그 행동이 합리적이었나"를 묻고 시스템 결함을 고침. 사람이 아니라 방어층(스위스 치즈 모델)을 보강

C) 포스트모템을 비공개로 전환해 외부 노출을 막는다

D) 자동화를 늘려 사람의 개입 자체를 없앤다

**정답: B**

해설: 비난 없는 포스트모템은 고위험 산업의 안전 문화 연구(Sidney Dekker의 New View, James Reason의 스위스 치즈 모델)에서 왔다. 사고는 "나쁜 사람"이 아니라 정상적인 사람이 그 순간 합리적으로 보인 행동을 한 결과 시스템의 잠재 결함이 드러난 것이다. 비난하면 사람들이 사고를 숨기고 정보가 막혀 같은 결함이 반복된다. 대신 시스템(방어층)을 고친다. Etsy의 "Just Culture", Google SRE, 2017 S3 사고 포스트모템("도구에 안전 상한이 없었다")이 모범이다. 징계(A)는 정보를 막고, 자동화 확대(D)는 이번 학습 기회를 버린다. DOP 운영 우수성의 "실패에서 배우기"가 이것이다.

---

**문제 7.** AWS Incident Manager의 구성 요소를 인시던트 대응 흐름에 올바르게 매핑한 것은?

A) Response Plan은 사람 연락처, Contacts는 자동 진행 절차

B) Response Plan(자동 진행 절차: 런북·채널·연락처 묶음) → Engagement(Contact을 SMS/Voice/Email로 호출) → Escalation Plan(무응답 시 다음 단계) → Timeline(전 과정 자동 기록) → PIR(사후 분석 초안)

C) Timeline은 사전 계획, PIR은 실시간 호출

D) Escalation Plan은 알림 카드 형식 정의

**정답: B**

해설: Incident Manager의 구성은 ICS(사건 지휘 체계)를 코드화한 것이다 — Response Plan은 인시던트 발생 시 자동 진행 절차(impact·title·SSM Automation 런북·채팅 채널·engagement를 묶음), Contacts는 사람과 연락 수단, Engagement는 실제 호출 행위, Escalation Plan은 N분 무응답 시 다음 그룹 승계(ICS의 자원 승계), Timeline은 모든 이벤트 자동 타임스탬프 기록(ICS 활동 일지), PIR은 Timeline 기반 사후 분석 초안 자동 생성이다. A·C·D는 역할을 뒤섞은 오답이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, ChatOps는 명령·알림·논의·문서를 한 채널에 직렬화해 단일 진실 공간과 공유 인식(shared mental model)을 만들고 협응 비용·컨텍스트 스위칭을 줄인다(GitHub Hubot 시초, 분산 합의의 공유 로그 사상, Google SRE 인시던트 관리). 둘째, AWS Chatbot은 SNS-Slack/Teams 다리이며 명령 권한은 IAM Role과 Guardrail Policy(IAM explicit-deny-always-wins, SCP와 같은 권한 천장)의 교집합으로 결정돼 "읽기는 자유, 쓰기는 파이프라인으로"가 정석이다. 셋째, CodeStar Notifications가 Pipeline/Build/Deploy 알림의 표준 경로다(과도한 글루 코드 불필요). 넷째, Incident Manager는 1970년대 산불 대응의 ICS(사건 지휘 체계)를 코드화해 Response Plan·Engagement·Escalation·Timeline·PIR로 비상 대응을 자동화하고, 외부 SaaS(PagerDuty/OpsGenie)는 SNS Webhook 또는 EventBridge API Destination(Connection·Secrets Manager·레이트 리밋·재시도)으로 통합한다. 다섯째, 비난 없는 포스트모템은 안전 문화(Dekker의 New View, Reason의 스위스 치즈 모델, Etsy의 Just Culture)의 핵심으로, 도구가 모은 데이터를 학습으로 전환해 장기 MTTR을 줄인다.
