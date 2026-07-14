# Day 5 - Week 12 Synthesis: The Five-Stage Pipeline and Decision Trees

This week, we built the complete **operational automation and incident response layer** of a mature cloud system. Monday was EventBridge and Pipes (the event bus and content-based routing). Tuesday was Automation Documents (procedures-as-code). Wednesday was auto-healing and MAPE-K (self-repair loops). Thursday was ChatOps and Incident Manager (human coordination when repair fails). Today we synthesize: *when does each tool apply, and what's the decision tree?*

The pattern that emerges is a **five-stage pipeline**: Detect → Route → Respond → Notify → Learn. Within each stage are choices, and poor choices lead to fragility (brittle automation), visibility chaos (alerts everywhere but no signal), or uncontrolled scaling (auto-healing spiral). Today we draw the decision tree and show real scenarios.

## The Five-Stage Pipeline

Every incident — from a cached CDN error to a database corruption — flows through this pipeline.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DETECT: Monitoring Emits Facts               │
│                   (CloudWatch, X-Ray, Logs)                     │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                   ROUTE: Content-Based Routing                  │
│              (EventBridge Rules, Event Patterns)                │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                    RESPOND: Automation Tiers                    │
│         (Tier 1-5: Restart → Scale → Circuit → Failover)       │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                  NOTIFY: ChatOps & Incident Mgr                 │
│              (Alert team, open war room if needed)              │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│            LEARN: Timeline, Post-Mortem, Improvement            │
│              (Reconstruct, analyze, iterate)                    │
└─────────────────────────────────────────────────────────────────┘
```

### Stage 1: DETECT — Monitoring Emits Facts

Observability is prerequisite. Facts come in three forms (Week 11's three pillars).

| Form | Tool | Latency | Example |
|------|------|---------|---------|
| **Metric** | CloudWatch | 1m | CPU 95%, request latency 500ms |
| **Log** | CloudWatch Logs, AWS Logs | 10-60s | "OOM killed process 1234" |
| **Trace** | X-Ray | 1-2s | Request took 30s, 15s in DynamoDB |

**Decision**: Which form best detects the failure class?

- **Traffic spike** → Metrics (request count, latency percentiles)
- **Code bug introduced** → Logs (exception stacks, error codes) + X-Ray (traces to function showing where time spent)
- **Resource exhaustion** → Metrics (CPU, memory, disk)
- **Cascading failure** → Traces (service map showing dead path)

Alerts should be specific and low-noise. A generic "high CPU" alert that fires 10 times per day and is noise 9 times is useless. Better: "CPU > 80% for 5 min *and* request queue length increasing" — two independent signals indicating real problem, not transient spike.

### Stage 2: ROUTE — Content-Based Routing

The alert is emitted. The question: who should react? If the alert is "DynamoDB replication lag > 10s", only the data platform team cares. If "us-east-1 network timeout on all services", everyone cares. **EventBridge Event Pattern** is the router.

```json
{
  "source": ["aws.cloudwatch"],
  "detail-type": ["CloudWatch Alarm State Change"],
  "detail": {
    "alarmName": ["DynamoDB-Replication-Lag"],
    "newState": ["ALARM"]
  }
}
```

**Decision tree**:

1. Is the problem **infrastructure** (region down, AZ failure) or **application** (service bug, runaway query)?
   - Infrastructure → Route to Platform team + Infrastructure Automation
   - Application → Route to Application team + application-specific Automation
2. Is the problem **reversible** (restart, scale out) or **irreversible** (data deletion, account suspension)?
   - Reversible → Can auto-heal Tier 1-3 without approval
   - Irreversible → Route to **aws:approve** gate in Automation
3. Is the problem **isolated** (one service) or **cascading** (multiple services)?
   - Isolated → Targeted Automation
   - Cascading → war room + Incident Manager

### Stage 3: RESPOND — Automation Tiers and Safety Nets

The alarm is routed. EventBridge Target is an Automation Document. Which tier do you attempt?

**Tier 1: Stateless Restart** → 90% safe, try first

```yaml
- name: RestartService
  action: 'aws:executeAwsApi'
  inputs:
    Service: ecs
    Api: UpdateService
    ForceNewDeployment: true
```

Safety net: Add a check step after. If issue persists, escalate to Tier 2.

**Tier 2: Horizontal Scale Out** → 85% safe, try if Tier 1 doesn't work

```yaml
- name: ScaleOut
  action: 'aws:executeAwsApi'
  inputs:
    Service: autoscaling
    Api: SetDesiredCapacity
    DesiredCapacity: '{{ CurrentCapacity + 2 }}'
```

Safety net: Bounded execution count. If we've scaled out 3 times in the last hour, stop and escalate to human.

**Tier 3: Circuit Breaker** → 80% safe if circuit threshold is tuned, harder to undo

```python
if call_downstream_service():
    # normal path
else:
    circuit_breaker.open()
    return fallback_response()
```

Safety net: Canary testing. Deploy circuit breaker logic to 1% of traffic first, measure error rate, then roll out.

**Tier 4: Failover (Stateful)** → 50% safe, requires human approval

```yaml
- name: RequestApproval
  action: 'aws:approve'
  inputs:
    Message: 'Failover primary DB?'
    MinRequiredApprovals: 1
```

**Tier 5: Blue-Green** → 40% safe, highest blast radius, rare

Don't attempt. Escalate to human.

### Stage 4: NOTIFY — ChatOps & Incident Manager

Automation is running, but humans need to know. **Chatbot** sends summary to Slack. If Automation succeeds quickly (Tier 1), alert disappears. If it fails or takes time (Tier 2-4), **Incident Manager** opens a war room.

**Decision tree**:

1. **Severity of impact** (MTTI, MTTR, customer visibility)
   - SEV-3 (low impact, customer-facing but non-critical) → Notify on-call in Slack
   - SEV-2 (high impact, many customers affected) → Page on-call + open Slack channel
   - SEV-1 (critical, revenue impact) → Page multiple on-calls + war room + notify leadership
2. **Predictability of resolution**
   - Known workaround (fast fix, <15min ETA) → Automated notification + ETA in Slack
   - Unknown cause → War room + IC assigns investigation parties
3. **Scope of coordination**
   - Single team → Slack thread + team lead
   - Multi-team → War room + Incident Manager + IC

### Stage 5: LEARN — Timeline, Post-Mortem, Improvement

Incident Manager auto-generated a timeline. Post-mortem meeting scheduled for next day. The RCA process (root cause analysis):

1. **Narrative reconstruction** — Exactly what happened and when? (from Timeline)
2. **Root cause** — Why did it happen? (what assumption was wrong, what was overlooked)
3. **Why it wasn't caught** — What gap in monitoring/testing missed it?
4. **Preventative actions** — How do we prevent recurrence?
5. **Detective actions** — If it recurs, how do we catch it faster?

```
Example: "ECS task crashed due to OOM. Root cause: new feature used 2x memory.
Why missed: No memory trend monitoring. Preventative: Add memory usage alert.
Detective: Add X-Ray trace showing memory growth per request."
```

**Decision tree**:

1. Is this a **class A** incident (novel, never happened before)?
   - Yes → Full post-mortem, assign preventative actions, update runbooks
2. Is this a **class B** incident (happened before, but we thought we fixed it)?
   - Yes → **Why did the preventative action fail?** Update that prevention
3. Is this a **class C** incident (known issue, recurring)?
   - Yes → Automate the response (move to Tier 1 Automation), add alert, reduce MTTR

## The Five-Column Decision Table

Synthesizing all decisions, here's the table that operations teams use to choose tools:

| Scenario | Severity | Detection | Response | Notification | Learning |
|----------|----------|-----------|----------|--------------|----------|
| **Single service restart** | SEV-3 | CloudWatch Alarm (CPU > 80%) | Tier 1: ECS restart | Slack notification | If recurring, add auto-restart Automation |
| **Database replication lag** | SEV-2 | X-Ray ServiceMap + CloudWatch Metric | Tier 2: Scale read replicas | Slack + incident Mgr | Tune query, add caching |
| **Application OOM cascade** | SEV-1 | Logs (OOM) + X-Ray (trace path) | Tier 2: Scale ASG + Tier 3: Circuit Breaker fallback | War room + IC | Add memory limits, quota alerts |
| **Data corruption** | SEV-1 | Logs (data anomaly detected) | Tier 5: No auto-fix, manual investigation | War room + IC + legal | Add data validation, audit logging |
| **Credential compromise** | SEV-1 | GuardDuty (suspicious activity) | Tier 4: Isolate instance + Tier 5: Rotate creds | War room + security team | Rotate all creds, tighten IAM |

## Real Scenario: Deployment Breaks API Latency

**12:00 UTC**: Deployment ships new API version.

**12:05 UTC**: CloudWatch alarm fires — **API latency p99 jumped 200ms → 800ms**.

```
[DETECT] Metric: LatencyHigh
    ↓
[ROUTE] EventBridge matches source=aws.cloudwatch, alarmName=APILatencyHigh
    → Target: Automation/api-latency-response
    ↓
[RESPOND] Automation starts Tier 1: Restart API tasks
    - name: RestartTasks
      action: aws:executeAwsApi (UpdateService, ForceNewDeployment=true)
    ↓
[CHECK] Wait 30s, sample new latency
    - Latency still 700ms? No improvement.
    ↓
[ESCALATE] Move to Tier 2: Add instances
    - name: ScaleOut
      action: aws:executeAwsApi (SetDesiredCapacity +3)
    ↓
[CHECK] Wait 1m, sample latency
    - Latency 600ms, trending down? Yes.
    - Latency < 400ms at 12:07? No, still 550ms.
    ↓
[ESCALATE] Move to Tier 3: Activate Circuit Breaker
    - Switch to fallback cache instead of calling new code path
    ↓
[CHECK] Latency drops to 200ms at 12:08.
    → Issue is the new code, not infrastructure
    ↓
[NOTIFY] Chatbot posts in #incidents
    Message: "API Latency resolved at 12:08 by Circuit Breaker.
    Root cause: new code path slow query. Rollback recommended."
    ↓
[IC DECISION] IC pages deployment team.
    "12:08: Automation activated circuit breaker.
     12:09: On-call API engineer joins war room.
     12:10: Engineer confirms: new index not created in DB.
     12:11: Rollback deployment.
     12:12: Latency back to normal.
    [Service restored]"
    ↓
[LEARN] Post-mortem: "Why wasn't index creation tested?"
    Action: Add database schema validation to CI/CD.
```

RTO: 8 minutes (12:00 → 12:08). MTTR: 12 minutes (12:00 → 12:12, including rollback).

## Anti-Patterns and Pitfalls

**Anti-Pattern 1: No MAPE-K Loop**

Alerts fire, on-call manually fixes, no learning. Same issue repeats monthly. Fix: Document every incident in Incident Manager, schedule post-mortems.

**Anti-Pattern 2: Automation Runaway**

Auto-healing loops endlessly, making things worse. Fix: Bounded execution count, circuit breaker for automation itself, Change Windows.

**Anti-Pattern 3: Alert Fatigue**

Generic high-CPU alerts fire constantly, team ignores them. Fix: Alerts must be specific (composite conditions) and actionable (clear remediation).

**Anti-Pattern 4: No Approval Gate**

Automation deletes production data without review. Fix: Tier 4-5 actions require aws:approve + guardrail policy.

**Anti-Pattern 5: Lost Context**

On-call fixes issue, posts "fixed" in Slack, nobody knows what was tried. Fix: All actions in war room must be timestamped (Incident Manager timeline).

## Wrapping Up

Week 12 synthesized the full **detection → response → notification → learning** cycle. EventBridge routes, Automation responds, ChatOps coordinates, Incident Manager records. The decision tree guides tool selection, and safety nets prevent cascades. When systems scale, this structure is the difference between "on-call exhausted, repeatedly fixing same bugs" and "system recovers within minutes, humans focus on improvement."

In two weeks (Week 13-14), we'll cover **cost optimization and governance** — how to operationalize auto-healing, monitoring, and incident response at enterprise scale without explosive cloud spend.

---

## 📝 연습 문제

**문제 1.** "API 지연 시간이 급증했다"는 알람이 났을 때 5단계 파이프라인을 구성하면?

A) Detect (CloudWatch latency metric) → Route (EventBridge, event pattern) → Respond (Tier 1 restart) → Notify (Slack alert) → Learn (post-mortem)

B) Detect (on-call이 손으로 콘솔 확인) → Route (이메일) → Respond (manual SSH login) → Notify (상태 페이지) → Learn (없음)

C) Respond만 자동화하고 나머지는 수동

D) 알람은 무시하고 고객 불만으로 판단

**정답: A**

해설: 5단계 파이프라인은 감지→라우팅→대응→알림→학습의 완전한 자동화된 흐름이다. B는 레거시 모델(느리고 휴먼 에러), C는 불완전(모니터링이나 학습 없음), D는 무책임.

---

**문제 2.** 다음 중 **Tier 1 (재시작)** 대신 **Tier 2 (스케일 아웃)**을 시도해야 하는 상황은?

A) ECS 태스크 프로세스 크래시 (한 번만 터짐)

B) API 평균 지연 500ms, CPU 92%, 요청 큐 계속 증가 (부하 문제)

C) 데이터베이스 인덱스 손상 (구조적 문제)

D) 인증 서비스 완전 다운 (의존성)

**정답: B**

해설: Tier 1(재시작)은 한 번의 크래시나 상태 문제 해결 (A). B는 "부하가 높아서" 문제이므로 용량 추가(Tier 2)가 맞다. C와 D는 재시작이나 스케일로 안 되므로 더 높은 tier 또는 수동 개입 필요.

---

**문제 3.** Automation이 같은 문제로 계속 반복 재시도하고 있다 (5회, 10회, 15회…). 어떤 안전망이 필요한가?

A) Exponential backoff — 재시도 대기 시간을 점차 증가 (30s → 60s → 120s…)

B) Bounded execution count — 같은 IssueId 하루에 5회 이상이면 인간에게 에스컬레이션

C) Circuit breaker for Automation — 조건 체크 (예: 헬스 체크 통과하면 탈출) 안 되면 인간 요청

D) A, B, C 모두 필요

**정답: D**

해설: 각각 다른 각도에서 폭주를 막는다. A는 transient 에러에 시간을 주고, B는 persistent 에러의 횟수 한계선, C는 상태 기반 탈출. 모두 적용해야 견고하다.

---

**문제 4.** "데이터 삭제 지명 — 잘못된 쿼리가 프로덕션 테이블을 지웠다"는 SEV-1 인시던트가 발생했다. 대응 단계는?

A) 자동 치유로 "테이블 복원" Automation 실행

B) 데이터 복구는 자동화 불가능 — 즉시 war room 개설, IC 할당, 백업에서 복구 수동 절차 시작, 동시에 법률팀/규제팀 통보

C) 알람만 울리고 조용히 해결

D) AWS 지원에만 연락

**정답: B**

해설: 데이터 삭제(Tier 5)는 자동화 불가능한 작업이다. 즉각 war room → IC → 전문가 동원 → 백업 복구 시작 → 영향도 평가 → 규제 보고. 이는 절차적, 법적 문제이므로 구조화된 대응이 필수.

---

**문제 5.** Post-mortem에서 "또 같은 문제다 — 2개월 전에도 있었다"는 지적이 나왔다. RCA 질문은?

A) 지난번 예방 액션이 완료되지 않았는가?

B) 예방 액션이 완료됐는데 효과가 없었는가?

C) 예방 액션이 완료됐지만 새로운 코드 경로에서 문제가 재발했는가?

D) A, B, C 중 하나 — 어느 것이든 개선 필요

**정답: D**

해설: 반복되는 문제(Class B)는 지난번 예방이 뭔가 잘못됐다는 신호다. 세 경우 모두 가능하고 모두 개선 필요. 그러나 "같은 문제 또 발생했다"고 해서 팀을 비난하는 건 문제 해결이 아니다 (blameless 원칙).

---

**문제 6.** 의사결정 테이블에서 "단일 서비스 재시작" 행의 모든 셀을 채우면?

| 셀 | 내용 |
|----|------|
| Severity | SEV-3 (고객에게 영향 없거나 미미) |
| Detection | CloudWatch Alarm (CPU/메모리/크래시) |
| Response | Tier 1: ECS UpdateService ForceNewDeployment |
| Notification | Slack 알림 (war room X) |
| Learning | 반복되면 자동 재시작 Automation 추가 |

A) 모두 맞다

B) Notification이 war room이어야 한다

C) Response는 승인 필요 (aws:approve)

D) Learning이 불필요 (Tier 1은 자명한 fix)

**정답: A**

해설: 단일 서비스 재시작은 낮은 위험 작업으로, SEV-3, CloudWatch, Tier 1 자동화, Slack 통지, 반복 시 자동화 추가의 경로가 표준이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 세 가지다. 첫째, **5단계 파이프라인**(Detect → Route → Respond → Notify → Learn)은 모든 인시던트의 구조를 제공하고, 각 단계에서 도구 선택이 성패를 결정한다. 둘째, **의사결정 트리**는 severity·detectability·scope에 따라 어떤 tier의 자동화와 어떤 level의 인간 개입이 필요한지 가이드한다. 셋째, **안전망**(bounded count, circuit breaker, approval gate, change window)은 자동화 폭주와 과도한 에스컬레이션 모두를 방지해 안정성 있는 자동화를 가능하게 한다. 이 구조가 확립되면, 운영팀은 반복되는 문제를 고치는 대신 시스템을 개선하는 데 집중할 수 있다.
