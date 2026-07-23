# Day 4 - Validating Resilience: Chaos Engineering with Resilience Hub and FIS

No matter how well you design a DR strategy, "does it actually work?" is a separate matter. A 5-minute RTO on paper becomes 30 minutes when real failure hits, and a system you thought was "safe because Multi-AZ" collapses the moment one AZ dies. The uncomfortable truth of software reliability is "untested recovery doesn't work." That's where **Chaos Engineering** comes in — a methodology that intentionally injects failures into healthy systems to expose weaknesses before real disasters strike.

AWS has productized this into two services. **Resilience Hub** analyzes your workloads to measure "how much can you actually withstand versus your RTO/RPO goals," and **FIS (Fault Injection Service, formerly Fault Injection Simulator)** actually injects failures like EC2 terminations, network delays, and API throttling. The key is combining both to automate the "measure → experiment → improve" loop. Today we explore where chaos engineering came from (Netflix), what its scientific methodology is, what safety mechanisms (Stop Conditions) FIS uses to prevent operational disasters, and the patterns for periodic automation of all this.

In the DOP exam, this domain shows up as scenarios like "How do you validate and automate resilience?", "What safety mechanisms prevent chaos experiments from destroying operations?", "How do you periodically verify DR failovers?" and the like.

## Where Did Chaos Engineering Come From — Netflix and Chaos Monkey

The origin of chaos engineering is Netflix around 2010. As Netflix migrated from its own data centers to AWS cloud, it faced the reality that "instances can die anytime in the cloud (failure is normal)." The traditional approach was "prevent failures from happening," but Netflix flipped the script — **"Failures will happen anyway. So let's intentionally cause some failures in advance, forcing our system to tolerate them."** That's how **Chaos Monkey** (released 2011) was born — a program that randomly killed instances in production environments.

Chaos Monkey soon evolved into the **Simian Army** (the monkey army) — Latency Monkey (injecting delays), Conformity Monkey (terminating instances that violate rules), Chaos Gorilla (simulating entire AZ failures), Chaos Kong (simulating entire region failures). FIS is AWS's managed service implementation of the Simian Army's philosophy, with strengthened safety mechanisms.

> 💡 **Related Theory**: Chaos engineering isn't just "throwing failures at systems" but applying **scientific method** to system reliability. The 2015 *Principles of Chaos Engineering* articulated by Netflix and others makes this explicit — (1) define the normal state (steady state) with measurable metrics (e.g., 99.9% success rate), (2) form a **hypothesis** that "the system will maintain steady state even under X failure," (3) actually inject failures to validate the hypothesis, (4) if steady state breaks, that's a discovered weakness. This resembles Karl Popper's falsifiability — you attempt to disprove the belief that "the system tolerates this," and if it's not disproven, confidence builds; if it is disproven, you fix the weakness. The core shift is handling resilience not as "belief" but as "verified evidence." That's what changes everything.

## The 5 Principles of Chaos Engineering

Principles to follow when designing FIS experiments:

1. **Hypothesis**: Start with a verifiable claim like "this system maintains 99.9% success rate even if one AZ dies."
2. **Steady State Definition**: Fix metrics before and after the experiment that you'll compare (success rate, P99 latency, throughput) and make them measurable.
3. **Start with Small Blast Radius**: Begin small — one instance, 5% of traffic — and expand as trust builds.
4. **Environment Similar to Production**: Validate from staging, but ultimately in production (or production-like) — weaknesses only surface there.
5. **Stop Condition Always Required**: Always have a safety net to halt the experiment immediately if it gets dangerous.

> 🔍 **Deeper Dive**: "Blast radius" is the core concept of chaos engineering — the scope the experiment affects. Starting with a small blast radius isn't just caution; it's about **efficiency of risk versus learning** — big experiments risk big accidents but teach a lot at once, small experiments are safer but teach slowly. Mature organizations use **progressive exposure** — "start small and expand gradually as safety is confirmed." This mirrors the canary deployment strategy — just as canary "exposes new code to only 5% to contain risk," chaos "confines failure to a small scope" to manage risk. FIS's SelectionMode (PERCENT/COUNT) is precisely this blast radius control mechanism.

## AWS FIS — Managed Chaos Injection

FIS defines and executes **Experiment Templates** (experiment designs). Templates consist of three elements — **Targets** (where), **Actions** (what), **Stop Conditions** (when to stop).

Supported key faults:

| Category | Action Examples |
|----------|-----------------|
| **EC2** | Stop, Terminate, Reboot, CPU/Memory stress, API Throttle |
| **ECS/EKS** | Task/Pod kill, Container CPU/Memory stress |
| **RDS** | Failover, Reboot |
| **Network** | Packet loss, latency injection, DNS errors, connection blocking (SSM Agent-based) |
| **API** | Throttle/error injection to specific AWS APIs |
| **AZ Power** | AZ power failure simulation (disrupt-connectivity) |

```bash
aws fis create-experiment-template \
  --description "30% EC2 CPU stress for 5 min" \
  --role-arn arn:aws:iam::...:role/FISRole \
  --targets '{
    "myInstances": {
      "resourceType": "aws:ec2:instance",
      "resourceTags": {"Environment":"prod"},
      "selectionMode": "PERCENT(30)"
    }
  }' \
  --actions '{
    "cpuStress": {
      "actionId": "aws:ssm:send-command",
      "parameters": {
        "documentArn":"arn:aws:ssm:::document/AWSFIS-Run-CPU-Stress",
        "duration":"PT5M"
      },
      "targets": {"Instances":"myInstances"}
    }
  }' \
  --stop-conditions '[{
    "source":"aws:cloudwatch:alarm",
    "value":"arn:aws:cloudwatch:...:alarm:P99Latency"
  }]'
```

### Target Selection Mode — The Blast Radius Dial

- **ResourceArns**: Specify exact resources.
- **ResourceTags**: Match by tag (e.g., `Environment=prod`).
- **SelectionMode**: `ALL` (all), `COUNT(N)` (N count), `PERCENT(N%)` (N% random).

`PERCENT(30)` means "30% random from tag-matched instances." This dial quantitatively controls blast radius — start at `PERCENT(5)` and scale up to `PERCENT(50)`.

## Stop Condition — Chaos's Safety Belt

FIS's most critical safety mechanism. If a **CloudWatch Alarm fires during the experiment, FIS immediately halts and rolls back the injected failure**. For example, if "P99 latency exceeds threshold," the alarm fires and FIS instantly stops CPU stress — preventing chaos experiments from turning into real disasters.

> ⚠️ **Pitfall**: Chaos experiments without Stop Conditions aren't chaos engineering — they're just **intentional failure**. In exams, the answer to "how do you make chaos experiments safe to minimize operational impact" is almost always "Stop Condition (CloudWatch Alarm-based)." Another common pitfall: Stop Condition only **stops** the experiment, it doesn't undo already-caused damage — so starting with a small blast radius and having Stop Condition must go together (small blast radius means damage before stopping is also small). Safety is multi-layered: "small radius + fast stop," not a single device.

> 📚 **Case Study**: The 2017 AWS S3 us-east-1 massive outage started when engineers debugging accidentally terminated more servers than intended with a single command — essentially an uncontrolled chaos experiment happening by accident. One key lesson from the incident was "**large-scale operations must have blast radius limits and safety mechanisms built-in**." AWS subsequently strengthened safety guardrails on such commands. FIS's SelectionMode (blast radius limit) and Stop Condition (immediate halt) are precisely this incident's lessons productized. The lesson: whether chaos or operational work, "one large operation at once that can't be undone" is the most dangerous anti-pattern.

## AWS Resilience Hub — Measuring and Evaluating Resilience

If FIS is the "hand that injects failure," Resilience Hub is the "doctor who diagnoses resilience." Register a workload, and Resilience Hub analyzes its configuration (CloudFormation stacks, Resource Groups, etc.) to evaluate **whether it can actually achieve your configured RTO/RPO goals**.

```bash
# Resilience policy: RTO/RPO goals by fault type
aws resiliencehub create-resiliency-policy --policy-name Tier1 \
  --policy '{
    "Hardware":{"rtoInSecs":300,"rpoInSecs":60},
    "Software":{"rtoInSecs":300,"rpoInSecs":60},
    "AZ":{"rtoInSecs":600,"rpoInSecs":120},
    "Region":{"rtoInSecs":3600,"rpoInSecs":600}
  }' \
  --tier MissionCritical

aws resiliencehub start-app-assessment --app-arn ... --assessment-name weekly
```

Core value:

- **Measure vs Goal**: Reveals gaps like "RTO goal is 5 minutes but actual configuration needs 12 minutes" (by fault type — Hardware/Software/AZ/Region).
- **Recommendations + Cost Impact**: Offers concrete proposals like "enabling Multi-AZ reduces AZ RTO from 10→2 min, adds $X/month."
- **FIS Integration**: Automatically generates and runs FIS experiments to validate assessment results.
- **Regular Reports**: Tracks resilience score trends.

> 💡 **Related Theory**: Resilience Hub automates and quantifies the AWS **Well-Architected Framework's Reliability Pillar**. Well-Architected prescribes principles like "test recovery procedures," "automatically recover from failure," "scale horizontally for availability," but these are abstract. Resilience Hub translates this to quantified metrics like "your workload's actual AZ failure RTO is X seconds versus goal 600 seconds." This applies the software engineering principle "if you can't measure it, you can't improve it" (often attributed to Drucker, frequently cited by Tom DeMarco) — it handles resilience not as vague confidence but as scores and gaps, making improvement data-driven.

## Periodic Automation — The Measure-Experiment-Improve Loop

The real value of chaos engineering comes not from one-off runs but **periodic repetition**. As code changes and infrastructure evolves, yesterday's resilient system breaks today. Automate FIS experiments with **EventBridge Scheduler** for periodic runs, and collect results via Resilience Hub and CloudWatch.

```
Periodic Chaos Loop
   EventBridge Scheduler (weekly cron)
        ▼
   Lambda → fis:StartExperiment
        ▼
   FIS Experiment (Targets PERCENT(30) / CPU stress / Stop Conditions)
        ▼
   System under stress → Auto-healing (ASG/ECS) active + Alarms monitored
        ▼ (P99 > threshold triggers Stop Condition)
   Report → Resilience Hub updated + Slack notification + Runbook updated with lessons
```

### ARC + FIS — DR Failover Itself as Chaos Target

Trigger the Route 53 ARC Routing Control switch as a FIS Action, you can **periodically validate the DR failover procedure itself**. Automatically verify every month "does region failover actually finish within RTO?" — directly addressing the "untested DR doesn't work" risk emphasized in Day 3.

> 🔍 **Deeper Dive**: **Game Day** and **Chaos Engineering** are often confused but different. Game Day is a **one-time event** where teams gather to manually execute failure scenarios and validate people, processes, and runbooks (quarterly/annually, learning-focused). Chaos Engineering automates failure injection with tools like FIS into **periodic runs** (daily/weekly, validation-focused). They complement each other — Game Day validates "how do people respond to failure" (are runbooks clear, who does what), and Chaos validates "how does the system respond to failure" (does auto-recovery work). Mature organizations train people via quarterly Game Days and validate systems via weekly automated chaos. In exams: "one-time training for people/processes" = Game Day; "periodic automated system validation" = Chaos/FIS.

> ⚠️ **Pitfall**: When automating periodic chaos in production, if "you set Stop Condition thresholds too sensitively out of fear the experiment causes real damage," experiments halt immediately and you learn nothing. Conversely, if too insensitive, experiments become real disasters. So Stop Condition thresholds must be carefully set based on "steady state" metrics, and initially start with small blast radius + conservative thresholds and tune gradually. Safety and learning are a trade-off; balancing this is the art of chaos engineering operations.

## Summary

Today's picture is four-fold. First, **chaos engineering originated from Netflix Chaos Monkey — a methodology applying scientific method (hypothesis→experiment→validation) to system reliability**, the mental shift from "prevent failure" to "intentionally cause failure to force tolerance." Second, **FIS implements this as a managed service** composed of Targets (blast radius dial: PERCENT/COUNT), Actions (failure types), and Stop Conditions (safety belt). Third, **Resilience Hub quantifies the Well-Architected Reliability Pillar**, revealing RTO/RPO goal gaps by fault type, recommended improvements, and costs, with FIS integration for validated verification. Fourth, **EventBridge Scheduler + FIS automates periodic testing**, running the measure-experiment-improve loop, and ARC + FIS periodically validates DR failover itself, with Game Day (people/one-time) and Chaos (system/periodic) as complementary.

Next time we comprehensively review all of Week 13 — Multi-AZ, Multi-Region, DR 4 strategies, Resilience Hub/FIS — through scenario problems.

---

## 📝 연습 문제

**문제 1.** EC2 운영 인스턴스 중 무작위 30%에 5분간 CPU 부하를 주입하되, 실험 중 P99 지연이 임계를 넘으면 즉시 중단·롤백되게 하려 한다. FIS 구성으로 올바른 것은?

A) SelectionMode ALL + Stop Condition 없음

B) Target SelectionMode PERCENT(30) + Action AWSFIS-Run-CPU-Stress(PT5M) + Stop Condition(CloudWatch P99 Alarm)

C) 모든 인스턴스를 Terminate

D) 수동으로 콘솔에서 CPU를 올린다

**정답: B**

해설: 무작위 30%는 SelectionMode PERCENT(30)으로 폭발 반경을 정량 제어하고, CPU 부하는 AWSFIS-Run-CPU-Stress SSM 문서를 5분(PT5M) 동안 실행하며, P99 지연 임계 초과 시 즉시 중단은 CloudWatch Alarm 기반 Stop Condition으로 구현한다. SelectionMode ALL+Stop 없음(A)은 폭발 반경이 전체이고 안전망이 없어 위험하고, 전체 Terminate(C)는 의도(CPU 부하)와 다르며 너무 파괴적이고, 수동(D)은 재현·자동화가 안 된다. PERCENT(폭발 반경) + Stop Condition(안전벨트)의 결합이 안전한 카오스의 핵심이다.

---

**문제 2.** 카오스 엔지니어링이 단순한 "고의적 장애 던지기"와 구별되는 핵심은?

A) 더 많은 인스턴스를 죽인다

B) 정상 상태(steady state)를 측정 가능한 지표로 정의하고, "시스템이 X 장애에도 정상 상태를 유지한다"는 가설을 세워 실험으로 검증하는 과학적 방법을 따른다

C) 운영 환경에서만 한다

D) 안전장치를 두지 않는다

**정답: B**

해설: 카오스 엔지니어링은 과학적 방법의 적용이다 — 정상 상태를 측정 가능한 지표(성공률, P99 등)로 정의하고, "시스템이 특정 장애에도 정상 상태를 유지할 것"이라는 가설을 세운 뒤, 실제 장애를 주입해 그 가설을 검증·반증한다(Principles of Chaos Engineering). 반증되면 그것이 발견된 약점이다. 이는 포퍼의 반증주의처럼 "믿음"이 아니라 "검증된 증거"로 복원력을 다루는 것이다. 더 많이 죽이기(A)·운영 한정(C)·안전장치 제거(D)는 모두 카오스 엔지니어링의 본질이 아니며, 오히려 D는 위험한 안티패턴이다.

---

**문제 3.** 카오스 실험을 "작은 폭발 반경(예: 인스턴스 5%)에서 시작해 점진적으로 확대"하는 권장 방식의 근거는?

A) 작게 하면 비용이 싸서

B) 위험을 작은 범위에 가둬 통제하면서 점진적으로 신뢰를 쌓는 점증적 노출(progressive exposure) — 배포의 카나리와 같은 사상

C) AWS가 큰 실험을 금지해서

D) 작은 실험이 더 정확해서

**정답: B**

해설: 폭발 반경(blast radius)을 작게 시작하는 것은 위험을 작은 범위에 가둬 통제하면서 점진적으로 신뢰를 쌓는 점증적 노출(progressive exposure) 전략이다 — 새 코드를 5%에게만 노출하는 배포의 카나리와 같은 사상으로, "장애를 작은 범위에 가둬" 위험을 통제한다. FIS의 SelectionMode(PERCENT/COUNT)가 이 폭발 반경 다이얼이다. 비용(A)이나 정확성(D)이 핵심이 아니고, AWS가 큰 실험을 금지(C)하는 것도 아니다 — 안전이 확인되면 의도적으로 확대한다.

---

**문제 4.** FIS 카오스 실험이 진짜 운영 장애로 번지는 것을 막는 가장 중요한 안전장치는?

A) 실험 시간을 짧게 잡는다

B) Stop Condition(CloudWatch Alarm 기반) — 임계 초과 시 FIS가 즉시 실험을 중단·롤백, 작은 폭발 반경과 함께 다층 방어

C) 실험을 야간에만 한다

D) 실험 후 수동으로 점검한다

**정답: B**

해설: FIS의 Stop Condition은 실험 중 CloudWatch Alarm이 발동하면(예: P99 지연 임계 초과) FIS가 즉시 실험을 중단하고 주입한 장애를 롤백하는 핵심 안전장치다 — 카오스가 진짜 장애로 번지는 것을 막는다. 단 Stop Condition은 중단할 뿐 이미 난 피해를 되돌리진 못하므로, 작은 폭발 반경(PERCENT)과 함께 "작은 반경 + 빠른 중단"의 다층 방어로 가야 한다. 짧은 시간(A)·야간 실행(C)·사후 점검(D)은 보조일 뿐, 실시간 자동 중단인 Stop Condition이 가장 중요하다.

---

**문제 5.** 워크로드가 설정한 RTO/RPO 목표(예: AZ 장애 RTO 600초)를 실제 구성이 달성하는지 측정하고, 미달 시 개선안과 비용 영향을 받고 싶다. 가장 적합한 서비스는?

A) FIS만 사용

B) AWS Resilience Hub — 워크로드를 분석해 장애 유형별(Hardware/Software/AZ/Region) RTO/RPO 목표 대비 실측 갭과 권장 개선안·비용을 제시하고 FIS와 통합 검증

C) CloudWatch Dashboard

D) AWS Config

**정답: B**

해설: Resilience Hub는 워크로드 구성을 분석해 설정한 복원력 정책(Hardware/Software/AZ/Region별 RTO/RPO)을 실제로 달성하는지 평가하고, 미달 시 구체적 개선안과 비용 영향을 제시하며, 결과를 FIS 실험으로 검증한다 — Well-Architected Reliability Pillar의 계량화 도구다. FIS(A)는 장애를 주입하는 손이지 목표 대비 측정·권고를 하지 않고, CloudWatch Dashboard(C)는 지표 시각화이며, Config(D)는 구성 규정 준수 추적이라 RTO/RPO 평가가 아니다.

---

**문제 6.** DR 리전 페일오버 절차가 정말 RTO 안에 작동하는지 매달 자동으로 검증하려 한다. 가장 적합한 조합은?

A) 운영팀이 분기마다 수동으로 페일오버

B) Route 53 ARC Routing Control 전환을 FIS Action으로 트리거해 DR 페일오버 자체를 정기 카오스 실험으로 자동 검증

C) 문서로 절차만 기록

D) Backup을 더 자주 수행

**정답: B**

해설: Route 53 ARC의 Routing Control 전환을 FIS Action으로 트리거하면 DR 페일오버 절차 자체를 정기 자동 실험으로 검증할 수 있다 — "리전 페일오버가 정말 RTO 안에 끝나는가"를 매달 자동으로 확인해, "검증 안 된 DR은 작동 안 한다"는 위험을 정면으로 푼다. 수동 분기 페일오버(A)는 빈도가 낮고 실수 위험이 있으며, 문서 기록(C)은 실제 작동을 검증하지 못하고, 잦은 Backup(D)은 페일오버 절차 검증과 무관하다.

---

**문제 7.** Game Day와 Chaos Engineering의 관계로 가장 정확한 것은?

A) 같은 것의 다른 이름이다

B) Game Day는 사람·프로세스·런북을 검증하는 일회성 훈련(분기/연), Chaos Engineering은 시스템의 자동 복구를 검증하는 정기 자동화(일/주)로 서로 보완한다

C) Chaos Engineering이 Game Day를 대체했다

D) Game Day가 더 자주 실행된다

**정답: B**

해설: Game Day는 팀이 모여 의도적 장애 시나리오를 수동 실행하며 사람·프로세스·런북을 점검하는 일회성 훈련(분기/연, 학습 중심)이고, Chaos Engineering은 FIS 같은 도구로 장애 주입을 정기 자동화(일/주, 검증 중심)한 것이다. 둘은 보완 관계 — Game Day는 "사람이 장애에 어떻게 대응하는가", Chaos는 "시스템이 장애에 어떻게 반응하는가"를 검증한다. 성숙한 조직은 분기 Game Day로 사람을 훈련하고 주간 자동 카오스로 시스템을 검증한다. 같은 것(A)도, 대체 관계(C)도 아니며, 정기 자동인 Chaos가 더 자주 실행되므로 D도 틀리다.

---

## 📌 Today's Summary

Today's key points are four-fold. First, chaos engineering is a methodology originating from Netflix Chaos Monkey/Simian Army, applying scientific method (steady state definition→hypothesis→failure injection→validation) to system reliability—the shift from "prevent failure" to "intentionally cause and force tolerance." Second, FIS implements this as managed with Targets (blast radius: ALL/COUNT/PERCENT dial), Actions (EC2/network/RDS/API failures), and Stop Conditions (CloudWatch Alarm-based immediate halt/rollback, chaos's safety belt), with "small radius + fast stop" multi-layered defense as core. Third, Resilience Hub quantifies Well-Architected Reliability Pillar, presenting RTO/RPO goal gaps by fault type, recommended improvements, and costs, with FIS integration for validated verification. Fourth, EventBridge Scheduler + FIS automates periodic measure-experiment-improve loop, ARC + FIS periodically validates DR failover itself, and Game Day (people/one-time training) and Chaos (system/periodic automated) complement each other.
