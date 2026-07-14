# Day 4 - ChatOps and Incident Manager: The Coordination Layer

Auto-healing answers the question "fix it fast." But not all failures can auto-heal. When multiple services are down, when customer data is at risk, when business impact is severe — human judgment is irreplaceable. The question becomes: *when a human must act, how do we coordinate them?*

This is the domain of **incident management** — detecting who needs to act, assembling the right people, giving them shared context, tracking remediation steps, and learning post-incident. In 2010s, this lived in PagerDuty or VictorOps, integrated via webhooks. Today, AWS **Incident Manager** is a native service, and **ChatOps** is the pattern: incident response happens in a shared chat channel where all context is visible and all actions are auditable.

Today we explore five things. First, **ChatOps philosophy** — why chat is the collaboration hub for operations. Second, **AWS Chatbot** and CodeStar Notifications, integrating AWS into Slack/Teams. Third, **Guardrail Policies** binding permissions to chat commands, preventing accidental outages. Fourth, **AWS Incident Manager** — the incident lifecycle from detection to post-mortem. Fifth, the **Major Incident Response (MIR)** pattern: War Room → Incident Commander → Timeline reconstruction.

## ChatOps Philosophy — Why Chat?

Since the 2010s, operations teams moved conversations from email to Slack. The insight: **context becomes shared and searchable**. When escalation email arrives, the recipient must context-switch, lose understanding. Chat channels stay open; everyone sees the alert in real-time, reacts without delay. Commands (`/restart-service`, `/rollback-deployment`) are typed in channel, output appears in-thread, so approval and action are visible to all. This transparency reduces rework — "didn't you already try that?" — and surfaces institutional knowledge.

```
# Traditional: Alert Email → Page on-call → on-call reads runbook in wiki → types commands in terminal → emails result

# ChatOps: Alert → #incidents channel → team sees it → team types /run-remediation in channel → bot runs it → result in thread
```

ChatOps isn't "let's chat about incidents." It's "chat *is* the operation control plane." Queries are commands, decision-making is visible, and every action is logged in the chat history forever.

> 💡 **Related theory**: ChatOps is an instance of **transparent operations**. The inverse is **opaque operations** — on-call runs fixes privately, posts "fixed" to status page, nobody knows what was tried or learned. Slack/Teams history is the incident record, searchable by keyword; when similar issues happen months later, team can search `#incidents "out of memory"` and replay what worked before. This transforms incident response from *individual skill* (one genius knows all fixes) to *organizational skill* (knowledge is collective and codified).

## AWS Chatbot and CodeStar Notifications

**AWS Chatbot** is the bridge between AWS notifications and Slack/Teams. When a CloudWatch alarm fires, EventBridge emits an event, or CodePipeline fails, Chatbot sends a message to the configured channel, formatted nicely with action buttons.

```bash
aws chatbot create-slack-channel-configuration \
  --slack-channel-id C01234ABCD \
  --slack-workspace-id T00000000 \
  --iam-role-arn arn:aws:iam::123456789012:role/ChatbotRole \
  --configuration-name production-incidents
```

Once configured, Chatbot acts as a passthrough: SNS topic → Chatbot → Slack channel. Message includes buttons like "Acknowledge" or "Run Remediation" that invoke Lambda or Automation behind the scenes.

```json
{
  "AlarmName": "HighCPUProd",
  "NewStateValue": "ALARM",
  "NewStateReason": "Threshold Crossed: 1 datapoint [25.5 (26/07/13 14:35:00 UTC)] was greater than the threshold (20.0).",
  "Trigger": {...}
}
```

**CodeStar Notifications** is a service-agnostic notification aggregator — sends events from CodeCommit, CodeBuild, CodePipeline, CodeDeploy to Slack in a uniform format.

```bash
aws codestar-notifications create-notification-rule \
  --resource arn:aws:codepipeline:us-east-1:123456789012:DeployPipeline \
  --event-type-ids codepipeline-pipeline-execution-failure \
  --targets TargetType=Slack,TargetAddress=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

> 🔍 **Going deeper**: Chatbot's architecture is **webhook-based fan-out**. Each AWS service (CloudWatch, EventBridge, CodeStar) has built-in or partner-provided webhook targets; Chatbot is one such target, formatting and relaying to Slack API. This is the **event-driven** pattern again — services emit events (not polls), Chatbot listens and reacts. Contrast with older pattern: on-call manually checks AWS console every 5 minutes.

## Guardrail Policy — When Chat Commands Are Operational Actions

The power of ChatOps — chat commands trigger AWS actions — is also the danger. If anyone in #incidents can type `/terminate-instance i-123456789`, chaos ensues. **Guardrail Policies** bind permissions to chat commands; Chatbot can assume an IAM role with explicit, minimal permissions.

```yaml
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "autoscaling:SetDesiredCapacity",
        "autoscaling:DescribeAutoScalingGroups"
      ],
      "Resource": [
        "arn:aws:autoscaling:*:123456789012:autoScalingGroup:*:autoScalingGroupName/prod-api-*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": [
        "arn:aws:lambda:*:123456789012:function:remediation-*"
      ]
    },
    {
      "Effect": "Deny",
      "Action": [
        "rds:DeleteDBInstance",
        "dynamodb:DeleteTable"
      ],
      "Resource": "*"
    }
  ]
}
```

This role allows scaling ASGs matching the pattern and invoking remediation Lambdas, but explicitly denies destructive operations (delete DB, delete table). On-call types `/scale-out prod-api 10` in #incidents → Chatbot assumes this role → calls `autoscaling:SetDesiredCapacity` → succeeds only if the role permits. Denied actions fail with a clear message in thread — no silent rejection, full audit trail.

> ⚠️ **Pitfall**: Guardrail policies are **least privilege on steroids**. If you're running Automation via Chatbot, that Chatbot role needs `ssm:StartAutomationExecution` on only the safe Automations, not all. Over-permissive Chatbot roles negate the safety benefit. In exams: "Chatbot role allowed `ec2:*` on all instances" is a CRITICAL finding.

## AWS Incident Manager — Lifecycle and ICS

**AWS Incident Manager** automates the incident lifecycle. When triggered (manually or via EventBridge), it creates an incident record, assigns an Incident Commander (IC), opens a chat channel, and tracks remediation.

| Stage | Action | Owner |
|-------|--------|-------|
| **Detection** | Alert fires or manual report | Monitoring or on-call |
| **Response** | Incident created, IC assigned | Incident Manager |
| **Analysis** | Slack channel #incident-XXX opens, team gathers, Root Cause Analysis (RCA) step begins | IC + team |
| **Remediation** | Automation or manual steps applied | IC + SMEs (Subject Matter Experts) |
| **Recovery** | Service restored, incident marked as Recovering | On-call |
| **Post-Incident** | Timeline reconstruction, post-mortem meeting scheduled | IC + leadership |

Incident Manager can pull incident data from multiple sources:

- **CloudWatch Alarms**: Trigger → Incident
- **EventBridge rules**: Pattern match → Incident
- **Manual creation**: ChatBot command → Incident

```bash
aws ssm-incidents create-incident \
  --title 'Production Database Failover' \
  --impact 5 \
  --incident-type 'SEV-1' \
  --response-plan-arn 'arn:aws:ssm-incidents:us-east-1:123456789012:response-plan/database-incident'
```

The **response plan** is a template pre-configuring the response:

```yaml
ResponsePlanName: database-incident
Title: Database Incident Response
Impact: 5
IncidentType: SEV-1
ChatChannelArn: arn:aws:chatbot:us-east-1:123456789012:slack-channel:incidents
IncidentCommanderRole: arn:aws:iam::123456789012:role/IncidentCommander
Engagements:
  - ContactTargetAccountId: '123456789012'
    ContactId: 'on-call-db-team'
Actions:
  - ActionType: SSM_AUTOMATION
    Document: 'arn:aws:ssm:us-east-1:123456789012:document/DBFailoverAutomation'
    RoleArn: 'arn:aws:iam::123456789012:role/AutomationExecution'
TimelineEventSources:
  - EventBridgeEventBusName: default
```

When an incident matching this response plan is created, Incident Manager automatically:
1. Opens the Slack channel for #incident-db
2. Assigns the IC (from role)
3. Engages on-call (calls/SMSes them)
4. Starts CloudWatch tracking

**Timeline** is a key feature. Every action in the incident (alert fired, team joined, remediation started, service restored) is timestamped and logged. Post-incident, the timeline is reconstructed chronologically — a **shared narrative** of what happened and when, invaluable for learning.

> 💡 **Related theory**: The **Incident Command System (ICS)** originated in wildfire firefighting (California 1960s) and was adopted by FEMA for emergency management. ICS is a hierarchical model: Incident Commander (IC) owns the whole incident, delegates to Operations Chief (logistics), Planning Chief (timeline/RCA), Finance Chief (cost tracking). AWS Incident Manager brings ICS to cloud operations — the IC is assigned, the response plan is the playbook, the Slack channel is the command post, and the timeline is the official record.

## Major Incident Response (MIR) — War Room Pattern

When a severity-1 incident hits (major customer impact, extended outage, multi-service degradation), a **war room** is established — all available experts join one Slack channel or video call, working in real-time.

```
[Detection] Anomaly alert → Incident created → SEV-1 → War Room opens
        ↓
[Assessment] IC asks for situation report (SITREP)
        ↓
[Response] Leads (DBA, Platform, Security) propose actions
        ↓
[Coordination] IC approves/rejects, delegates to actionable owners
        ↓
[Feedback] Every 5-10 minutes, status update + revised ETA
        ↓
[Resolution] Service restored
        ↓
[Post-Mortem] Timeline reconstructed, RCA performed, action items assigned
```

War rooms follow a **strict communication discipline**:

- **IC speaks last** — everyone else voices ideas, then IC decides
- **Roles are clear** — "You're the Database Expert, you own recovery"
- **One voice over comms** — only IC communicates outbound to stakeholders/press
- **Timeline scribe** — one person records every action/decision with timestamp

This discipline prevents chaos. In the absence of structure, 20 people in an outage call all talking = paralysis.

> 🔍 **Going deeper**: MIR is drawn from **incident command systems in military and emergency management**. When a fire starts, you don't have time for consensus — the IC *decides*. This speed, under structure, is what separates organized response from panic. However, **post-mortem blameless culture** (introduced in Chapter 2 of "The Site Reliability Engineering Book") requires that during post-mortems, IC decisions are re-examined without blame — was there better info at the time? What can we improve next incident?

## Integration: From Alert to Action to Learning

A complete incident response flow weaves today's topics together:

```
1. [CloudWatch Alarm fires] 
   → Metric crosses threshold (high error rate)

2. [EventBridge rule matches]
   → Sends to Incident Manager via rule

3. [Incident Manager creates incident]
   → Opens #incident-prod channel via Chatbot
   → Engages on-call DB team

4. [Slack channel opens]
   → All relevant staff join #incident-prod
   → IC assigned automatically

5. [IC requests diagnostics]
   → Team runs queries: `/run-diagnostics`
   → Lambda executes under Chatbot's Guardrail-Policy-constrained role
   → Results posted in thread

6. [IC initiates Automation]
   → Types `/execute-failover` in channel
   → Automation (Systems Manager) checks approval requirement
   → If Tier 4 (failover), requires IC approval (built into Automation)
   → Automation runs

7. [Recovery confirmed]
   → Error rate returns to normal
   → IC marks incident as Resolved
   → Incident Manager ends the chat channel, stores timeline

8. [Post-Mortem]
   → Incident Manager auto-generates timeline
   → Team reviews "what happened and why"
   → Action items assigned (improve monitoring, fix root cause, etc.)
   → Meeting notes auto-linked to incident record
```

## Wrapping Up

Today we covered five things. First, **ChatOps** uses chat (Slack/Teams) as the operational control plane, making decisions visible and auditable. Second, **AWS Chatbot and CodeStar Notifications** bridge AWS and chat, feeding alerts into a shared channel. Third, **Guardrail Policies** bind IAM permissions to chat commands, allowing safe operational actions without opening full AWS access. Fourth, **AWS Incident Manager** automates lifecycle from detection to post-mortem, assigning IC, opening channels, tracking timeline. Fifth, **MIR war room** pattern imposes command discipline, clear roles, and single voice — structure that prevents paralysis under pressure.

The foundation has been built. Monitoring detects (Week 11), Automation responds (yesterday), auto-healing scales (today), ChatOps coordinates humans (today). The final piece is synthesis.

The next article ties all of Week 12 together: **the five-stage pipeline and the five-column table** — decision trees for selecting the right tool in each scenario.

---

## 📝 연습 문제

**문제 1.** ChatOps의 핵심 가치는?

A) 채팅이 더 빠르다

B) 컨텍스트가 공유되고 검색 가능하며, 모든 액션이 감시·감사되고, 조직 지식이 기록된다

C) 이모지를 쓸 수 있다

D) 이메일보다 덜 공식적이다

**정답: B**

해설: ChatOps는 단순히 "채팅으로 말하자"가 아니라 **투명한 운영**이다. 모든 사람이 alert를 같은 채널에서 보고(context 공유), 명령어가 thread에 기록되고(감시·감사), Slack 히스토리가 검색 가능한 사건 기록이 된다(조직 학습). 이전 "on-call이 몰래 문제를 고치고 '해결됨'만 공고"와 다르다.

---

**문제 2.** AWS Chatbot이 Slack 채널의 명령어 `/scale-out-prod-api-10`을 실행할 때, 안전하게 하려면?

A) Chatbot 자신이 root 권한으로 실행

B) Chatbot이 맡은 IAM 역할(guardrail policy)에 autoscaling:SetDesiredCapacity를 prod-api-* ASG로만 허용하고, 삭제 작업은 명시적 거부

C) 모든 AWS 권한을 Chatbot role에 주되, Slack 채널 멤버만 명령 가능

D) Chatbot을 사용하지 말고 on-call이 AWS 콘솔에서 직접 작업

**정답: B**

해설: Guardrail Policy는 **최소 권한 원칙**을 chat 명령어 실행에 적용한 것. Chatbot role이 명시적으로 allowed(scale out) 또는 denied(delete DB)를 지정해야 의도 이상의 작업이 실행되지 않는다. 모든 권한(C)은 "누군가 /delete-database 치면?"을 열어둔다.

---

**문제 3.** AWS Incident Manager의 "응답 계획(Response Plan)"에 미리 설정할 수 있는 것은?

A) Slack 채널 ARN (자동 오픈)

B) IC 역할 (자동 할당)

C) on-call engagement (자동 호출/SMS)

D) SSM Automation 시작 (자동 실행)

E) 모두 다

**정답: E**

해설: Response Plan은 템플릿으로, incident 타입별로 어떤 채널을 오픈하고 누가 IC인지, 누구에게 연락하고, 어떤 Automation을 시작할지 모두 미리 지정한다. Incident Manager는 이 계획에 따라 자동으로 인시던트 생명주기를 구성한다.

---

**문제 4.** 타임라인(Timeline)의 용도는?

A) 인시던트 중 뭐가 일어났는지 시간순 기록 — 포스트모템의 기초

B) 각 팀이 뭘 했는지 추적 — 책임 추적

C) 다음 유사 인시던트 시 "이전엔 이렇게 했다"로 재사용

D) A, C 맞음 (B는 타임라인 목적이 아님 — 블레임 추적은 blameless culture 위배)

**정답: D**

해설: Timeline은 "무엇이·언제·누가·왜"를 기록하는 사건 로그다. 포스트모템(RCA)의 필수 입력이고, 조직 학습을 위해 재사용된다. 그러나 "누가 실수했나"를 추적하는 용도는 아니다 — blameless post-mortems는 사람이 아니라 **시스템과 프로세스**를 개선하는 데 집중한다.

---

**문제 5.** 인시던트 커맨더(IC)의 역할로 틀린 것은?

A) 최종 결정권자

B) 모든 진단 작업을 직접 실행

C) 역할 배분 (DBA는 복구, Platform은 모니터링)

D) 외부(고객, 언론, CEO)로 하나의 음성 (다른 팀이 각각 말하면 일관성 깨짐)

**정답: B**

해설: IC는 war room의 사령관인데, 직접 모든 일을 하는 게 아니라 **위임**한다. DBA 리드에게 "복구 작업 지휘", Platform 리드에게 "모니터링" 등을 시킨다. IC는 정보 수집 → 의사결정 → 위임 → 상황 업데이트에 집중한다. 모든 작업을 직접 하면 한 사람이 병목이 되어 응답이 느려진다.

---

**문제 6.** "Major Incident Response (MIR) war room에서 모두가 얘기하다 보니 혼란스러웠다. 어떤 원칙으로 구조화할까?"

A) 더 많이 말하는 사람이 리더

B) IC가 맨 마지막에 말한다 — 다른 사람들 의견 다 들은 후 결정

C) 모두가 동시에 말한다 (진짜 생각이 나온다)

D) 의사 결정이 느려지니 IC가 모든 권한을 쥔다

**정답: B**

해설: **command discipline**의 핵심은 IC가 speak last다. 모두가 의견을 내놓은 후, IC가 정보를 종합해 결정한다. 이렇게 하면 IC는 모든 perspective를 들었고 best decision이 나올 확률이 높다. speak first하면 IC 의견에 모두가 따라가는 바이어스(anchor)가 생긴다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, **ChatOps**는 chat을 운영 제어 평면으로 삼아 컨텍스트 공유·투명성·감시성을 이룬다. 둘째, **AWS Chatbot과 CodeStar Notifications**은 AWS alert를 Slack에 중계하는 다리다. 셋째, **Guardrail Policy**는 chat 명령어에 IAM 권한을 최소로 바인딩해 안전한 자동화를 가능하게 한다. 넷째, **AWS Incident Manager**는 detection부터 post-mortem까지 lifecycle을 자동화하고, timeline 재구성으로 학습을 기반화한다. 다섯째, **MIR 전쟁 지휘소 패턴**은 명확한 역할·IC speak-last 원칙·single voice로 대규모 인시던트 압박 속에서도 구조를 유지한다. 모니터링 → 자동 치유 → 인간 조정 → 학습의 완전한 루프가 완성된다.
