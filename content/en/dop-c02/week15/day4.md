# Day 4 - Serverless Large-Scale Incident Auto-Response: Recovery Without People, Safety Rails

24/7 large systems break at 3am when the most-tired person takes pager. 500M daily events, 99.95% SLA — if a known failure type each time wakes a human, remembers procedure, patches console: average pager delay alone is 6 minutes. SLA dies. Mature ops sets one goal: "80% of known failure types auto-recover before anyone wakes." Today: that goal's structure — EventBridge as signal-intake, Step Functions wrapping Runbook (retry, audit), Incident Manager pulling in humans when auto-recovery breaks. And: where auto-response fails dangerously. Reliability engineering, idempotency theory.

In DOP exams: "Lambda Throttle auto-fix", "GuardDuty key-leak → auto-disable+impact-analyze+incident-open", "DLQ infinite-loop prevention", "5min+ Runbook = Standard or Express?" Each hinges on EventBridge·Step Functions·idempotency guardrails.

## MTTR Reduction — Two Paths: Detection and Response Auto

Reliability engineering's central metric is **MTTR (Mean Time To Recovery).** Availability = MTBF / (MTBF + MTTR), so cutting recovery time equals upping availability. MTTR splits into four: **detect (spot problem) → diagnose (understand) → repair (fix) → verify (confirm).** People inject delays at each stage (6-min pager, thinking time).

Auto-response's essence: turn those four into code, erasing human latency. **Runbook Automation** — convert wiki-prose procedures into executable state machines.

> 💡 **Related theory**: Auto-response is SRE's **toil elimination** principle. Google SRE book: toil = "manual, repetitive, automatable, non-value-adding ops work." Classic: humans hand-shepherd known failures. SRE says push toil below 50% of ops time. Deeper: control theory's **feedback loop** — signal (anomaly) → control action (repair) → measure (verify convergence). Auto-response's "diagnose → fix → verify" is exactly that loop. Verify missing = risk ("we think we fixed it but didn't"). Good automation always closes with verify.

## EventBridge — Signal-Intake Hub

Auto-response's first question: "how do hundreds of signal sources converge to one flow?" Answer: **EventBridge** — ingest diverse events, pattern-filter, route to targets.

| Item | EventBridge | SNS |
|---|---|---|
| Filtering | Rich pattern-matching (content-based) | Message attribute filter |
| Schema | Strong (Registry) | Weak |
| Archive/replay | Yes (retain, replay events) | No |
| Pipes | Yes (Source→Filter→Enrich→Target) | No |
| Multi-target routing | Strong | Strong (fan-out) |

Auto-response's standard: EventBridge, for content-filtering and archive/replay. "severity ≥ 7 AND type prefix X GuardDuty Finding only to this Runbook." Post-incident, replay events to re-run automation, debug.

> 🔍 **Deeper**: **EventBridge Pipes** (2022) elevates auto-response. Traditionally "consume queue, transform, send downstream" lived in Lambda. Pipes is **Source → Filter → Enrichment → Target** declaratively, code-free. SQS/Kinesis/DynamoDB Stream source, filter it, Lambda/Step Functions enrich, final target. Shifts from **point-to-point** (each wire coded) to **declarative pipeline.** EventBridge's essence is **EDA (Event-Driven Architecture)** — decouple producer/consumer by time, location. Signal source doesn't know who consumes; EventBridge routes. Loose coupling = extend signal sources without touching response logic.

## Step Functions Wrapping Runbook — Why Lambda Alone Risks Disaster

Temptation: automate recovery in one Lambda. Mature pattern: **Step Functions wraps Runbook.** Why? Four guarantees Lambda lacks:

```
EventBridge Bus
      │
      ▼
Step Functions (Runbook State Machine)
   ├─ Diagnose Lambda          ← Measure current state
   ├─ Approval (optional)       ← If risky, wait human OK
   ├─ Repair (Lambda/SSM)
   └─ Verify Lambda             ← Remeasure post-repair; escalate if fail
      │
      ▼
Incident Manager (Response Plan)
   ├─ Chatbot → Slack/Teams auto-channel
   ├─ Contacts/Pager calls
   └─ Post-Incident Analysis auto-draft
```

Step Functions gives: (1) **retry + timeout declarative per-stage**, (2) **audit trail** (each step's in/out recorded), (3) **human approval gate** (big-impact work pauses for OK), (4) **error branching** (fail → escalation path). Lambda alone = procedural monolith; mid-failure, tracking where you are and rolling forward is hard. Partial-execution risk is high.

> ⚠️ **Gotcha**: **Standard vs Express** Step Functions choice is exam repeatedly. **Standard**: 1-year max runtime, exactly-once semantics, full audit history — Runbooks (long waits, approval, audit needed). **Express**: 5-min max, high throughput, limited history — short event churn. "5min+ Runbook, audit" → Standard. Pick Express, exceed 5min, workflow cuts off.

## Idempotency — Keep Auto-Recovery From Amplifying Disaster

Auto-response's scariest failure mode: **automation amplifies the incident.** EventBridge/SQS guarantee at-least-once delivery; same event can arrive twice. If recovery runs twice — "+50 concurrency" twice = "+100", DLQ reprocess loops forever, system worsens. **Idempotency (f(f(x)) = f(x))** blocks this.

DLQ reprocess standard guard: record **retry count on message attribute.** Exceed threshold (e.g., 3), auto-process stops, escalate to human. Stops poison-message infinite loops.

> 💡 **Related theory**: Idempotency is distributed system's fundamental constraint. Network loses or duplicates; **exactly-once delivery is theoretically impossible** (Two Generals Problem — sender can't distinguish "original lost" from "ACK lost", so retransmits). Reality: "at-least-once delivery + idempotent processing = effectively-once." Idempotent: "set concurrency to 200" is (multiple runs → same result); "add 50 concurrency" is not (double run = +100, cumulative). Auto-recovery safety: (1) idempotent operations (set state not increment), (2) deduplicate by event ID (skip-if-seen), (3) retry count guards (stop at threshold, escalate).

> 📚 **Case study**: 2017 **AWS S3 us-east-1 outage** started when engineer debugging ran wrong manual command, deleted more than intended. Cascade failures+chain. General lesson: **automation runaway** — badly-designed auto-recovery misjudges normal as broken, kills good resources or feedback loops spiral. Standard guards: (1) **circuit breaker** (same automation N+ times in short window → stop, call human), (2) **dry-run/canary stage**, (3) **human approval on risky steps.** "Fast automation breaks fast" is the teaching.

## Security Incident Auto-Response — Key Breach Cascade

Auto-response shines on security. Human reaction speed is too slow — credentials leak, damage spreads in minutes. GuardDuty spotting IAM credential exfiltration (`UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration`) triggers auto-cascade:

1. **Access Key disable immediately** — neutralize leaked creds (disable, not delete, for forensics).
2. **Affected user/Role ID + notify**.
3. **CloudTrail Lake impact query** — what did that cred do, SQL-side.
4. **Incident Manager auto-open** — human-automation handoff starts.

## Human-Automation Handoff — When Auto Fails (20%)

Goal was "80% auto-recover." Remaining 20% — auto-recovery failures, or too-risky to auto — human steps in via **Incident Manager.** Response Plan = Contacts + Escalation + Engagement. Incident fires pager, **AWS Chatbot auto-creates Slack/Teams channel.** Chatbot isn't just alerts; it runs **constrained IAM Role AWS CLI inside chat** — SRE diagnoses + acts without opening console. On incident close, **Post-Incident Analysis** template auto-drafts, enforcing blameless review.

> ⚠️ **Gotcha**: Auto-Role and Break-Glass Role must split. **Auto-Role** = pre-defined recovery actions only, least-privilege. **Break-Glass** = powerful emergency-human permissions, separate. If auto-automation touches Break-Glass, on auto-compromise that power becomes a weapon. All auto-repairs leave **CloudTrail trail**, SCP further gates auto-Role scope.

> 🎯 **Scenario**: "500M events daily, SLA 99.95%. ① Lambda Throttle auto-lift ② GuardDuty IAM key-leak auto-response ③ DLQ re-drive without infinite loop ④ SRE CLI from Slack." → ① CloudWatch Alarm (Throttles) → EventBridge → Step Functions (Standard): diagnose → set concurrency (idempotent absolute value) → verify 5min later → Slack. ② GuardDuty → EventBridge → Step Functions: disable key → CloudTrail Lake query → Incident Manager open. ③ DLQ Alarm → Redrive Lambda, message attribute retry count, threshold → human. ④ Incident Manager Response Plan + AWS Chatbot (constrained IAM Role). Auto-Role ≠ Break-Glass, all CloudTrail-tracked.

## Summary

Today covered five. First, **auto-response cuts MTTR's detect-diagnose-repair-verify chain, erasing human latency**, SRE toil-removal. Second, **EventBridge central hub** for multi-source signal routing, content-filter, archive/replay, EDA decouple. Third, **Step Functions wraps Runbook** (retry, audit, approval, error-branch); Standard for long Runbooks, Express for short. Fourth, **idempotency stops auto-amplification** — absolute-value ops, dedup, retry-count guardrails. Fifth, **Incident Manager + Chatbot handles auto-recovery's 20% fail**, auto/break-glass Role split, automation runaway guards.

Next: Week 15 recap all four domains (multi-account, hybrid, containers, serverless incident) in complex scenarios.

---

## 📝 연습 문제

**문제 1.** 자동 인시던트 대응이 단축하려는 핵심 지표와, 잘 설계된 자동 대응이 반드시 닫아야 하는 단계는?

A) MTBF — 탐지 단계만 있으면 된다

B) MTTR(평균 복구 시간)의 탐지→진단→복구→검증 사슬에서 사람의 인지 지연을 제거하며, 복구가 실제로 됐는지 재측정하는 검증(verify) 단계로 폐루프를 닫아야 한다

C) RPO — 복구 단계만 있으면 된다

D) RTO — 진단만 자동화하면 된다

**정답: B**

해설: 가용성 = MTBF/(MTBF+MTTR)이므로 MTTR 단축이 가용성을 끌어올린다. 자동 대응은 탐지→진단→복구→검증 사슬에서 사람의 인지 지연(핸드오프)을 제거하는 SRE의 toil 제거다. 핵심은 검증 단계 — 빠지면 "복구했다고 믿지만 실은 안 됐다"는 위험이 생기므로 폐루프는 검증으로 닫혀야 한다. MTBF만(A)·RPO(C)·RTO(D)는 이 사슬의 정의와 어긋난다.

---

**문제 2.** 이질적 신호원(CloudWatch Alarm·GuardDuty·Security Hub·Config·스케줄)을 한 흐름으로 모아 내용 기반으로 필터링하고 사고 후 replay까지 하려는 자동 대응의 진입점은?

A) SNS

B) EventBridge — 내용 기반 패턴 매칭, 아카이브/replay, Pipes(Source-Filter-Enrich-Target)를 제공해 신호원과 대응 로직을 느슨하게 결합(EDA)한다

C) SQS

D) Kinesis Data Streams

**정답: B**

해설: EventBridge는 이벤트 내용을 보고 정밀 필터링하고("severity≥7 AND type prefix X"), 이벤트를 아카이브해 replay로 자동화를 재현·디버깅하며, Pipes로 코드 없이 Source→Filter→Enrich→Target 파이프라인을 만든다. EDA 메시지 브로커로 생산자·소비자를 분리해 신호원을 늘려도 대응 로직을 안 건드린다. SNS(A)는 내용 기반 필터·replay가 약하고, SQS(C)·Kinesis(D)는 다신호원 라우팅 진입점이 아니다.

---

**문제 3.** 자동 복구를 Lambda 함수 하나가 아니라 Step Functions로 감싸는 이유로 가장 정확한 것은?

A) Lambda보다 무조건 싸기 때문

B) 상태별 재시도·타임아웃의 선언적 정의, 감사 가능한 실행 이력, 사람 승인 게이트, 명시적 에러 처리·Escalation 분기를 얻어 중간 실패 시 부분 실행 추적이 가능하기 때문

C) Lambda는 인시던트 대응에 쓸 수 없기 때문

D) Step Functions가 더 빠르기 때문

**정답: B**

해설: Step Functions는 상태별 재시도·타임아웃을 선언적으로 정의하고, 각 단계 입출력이 남는 감사 이력, 임팩트 큰 작업 전 사람 승인 게이트, 실패 시 Escalation 분기를 제공한다. Lambda 단독은 한 함수에 이 모두를 절차적으로 짜야 해 중간 실패 시 어디까지 됐는지 추적이 어렵고 부분 실행 위험이 크다. 비용(A)·Lambda 불가(C)·속도(D)는 이유가 아니다.

---

**문제 4.** 감사가 필요하고 5분 이상 걸리며 사람 승인 게이트를 포함하는 Runbook에는 Step Functions Standard와 Express 중 무엇이 맞는가?

A) Express — 5분 한도라 충분하다

B) Standard — 최대 1년 실행, exactly-once 워크플로, 완전한 실행 이력으로 감사·승인·긴 대기에 맞다

C) Lambda 단독

D) SSM Document만

**정답: B**

해설: Standard는 최대 1년 실행, 정확히 한 번 워크플로, 완전한 실행 이력을 제공해 감사·승인·긴 대기가 필요한 Runbook에 맞다. Express는 최대 5분·고빈도·이력 제한이라 짧고 빠른 이벤트 처리용이며, 5분 넘는 Runbook을 Express로 짜면 잘린다. "5분 이상 + 감사"는 항상 Standard다. Lambda 단독(C)·SSM Document만(D)은 승인·재시도·감사 보장이 부족하다.

---

**문제 5.** SQS DLQ 누적 시 자동 Re-drive를 하되 무한 루프(poison message)를 방지하려면? 그 밑의 이론은?

A) Lambda 타임아웃을 늘린다

B) 메시지 속성에 재처리 횟수(retry count)를 기록하고 임계 초과 시 자동 재처리를 멈추고 사람에게 넘긴다 — at-least-once 전달 + 멱등 처리 = effectively-once의 dedup 가드다

C) DLQ에 TTL을 설정한다

D) SQS Long Polling을 켠다

**정답: B**

해설: EventBridge·SQS는 at-least-once 전달이라 같은 메시지가 반복될 수 있고, exactly-once 전달은 이론적으로 불가능하다(Two Generals). 그래서 "적어도 한 번 전달 + 멱등 처리 = effectively-once"로 푼다. retry count를 메시지 속성에 기록해 임계 초과 시 멈추는 것은 dedup 가드로 poison message 무한 루프를 막는다. 타임아웃(A)·TTL(C)·Long Polling(D)은 무한 루프 자체를 막지 못한다.

---

**문제 6.** 자동 복구가 "동시성을 늘리는" 동작을 할 때, 중복 이벤트(at-least-once)로 인한 사고 증폭을 막는 멱등 설계는?

A) 증분으로 설정한다(add 50씩)

B) 절대값으로 설정한다(set concurrency to 200) — 몇 번 실행해도 같은 결과(f(f(x))=f(x))라 중복 실행에도 안전하다

C) 매번 무작위 값으로 설정한다

D) 동시성을 두 배로 늘린다

**정답: B**

해설: 멱등성은 "같은 연산을 몇 번 적용해도 한 번 적용한 것과 같음"(f(f(x))=f(x))이다. 증분(add 50)은 중복 실행 시 +100으로 누적돼 위험하지만, 절대값 설정(set to 200)은 몇 번 실행해도 결과가 200으로 같아 at-least-once 중복에 안전하다. 무작위(C)·두 배(D)는 멱등이 아니어서 사고를 키울 수 있다.

---

**문제 7.** 자동화 Role과 Break-glass(비상) Role의 관계로 옳은 것은? 그 이유는?

A) 동일한 Role을 공유한다

B) 분리한다 — 자동화 Role은 정의된 복구 동작만 하는 최소 권한이고 Break-glass Role(강력한 비상 권한)은 사람 전용이며 자동화에서 절대 쓰지 않는다. 자동화가 탈취·폭주할 때 강력한 권한이 무기가 되는 것을 막기 위해서다

C) Break-glass Role을 자동화에 쓰면 더 빠르다

D) Root 계정을 자동화에 쓴다

**정답: B**

해설: 자동화 Role은 미리 정의된 복구 동작만 할 수 있게 최소 권한으로 한정하고, Break-glass Role은 사람 비상용으로 별도로 둬 자동화에서 절대 쓰지 않는다. 자동화가 Break-glass를 쓸 수 있으면 automation runaway나 탈취 시 그 강력한 권한이 무기가 된다. 모든 자동 수정은 CloudTrail에 남기고 SCP로 자동화 Role 범위를 한 번 더 봉한다. 공유(A)·Break-glass 사용(C)·Root(D)는 모두 위험한 안티패턴이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 자동 대응은 MTTR의 탐지→진단→복구→검증 사슬에서 사람의 인지 지연을 제거하는 SRE toil 제거이며 검증으로 닫힌 폐루프여야 한다. 둘째, EventBridge가 모든 신호의 진입점으로 내용 기반 필터링·아카이브/replay·Pipes로 느슨한 결합(EDA)을 만든다. 셋째, Step Functions로 Runbook을 감싸 재시도·감사·승인 게이트·에러 분기를 얻으며 Standard(긴 Runbook·감사)와 Express(짧고 빠른)를 구분한다. 넷째, 멱등성(절대값 설정·dedup·retry count 가드)이 at-least-once 중복으로 인한 사고 증폭을 막는다(effectively-once). 다섯째, Incident Manager + Chatbot이 자동화 실패 20%에서 사람을 끌어들이고, 자동화 Role과 Break-glass Role을 분리하며 automation runaway에 circuit breaker·승인 게이트로 대비한다.
