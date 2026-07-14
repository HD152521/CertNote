# Day 4 - Resilience Verification: Chaos Engineering via Resilience Hub and FIS

Even with the best-designed DR strategy, "does it actually work?" is separate. The 5-minute RTO on paper can become 30 minutes when real disaster strikes, and systems touted as "Multi-AZ, so we're fine" crumble when an AZ actually dies. The uncomfortable truth of software reliability: "untested recovery doesn't work." Enter **Chaos Engineering**—intentionally injecting failures into healthy systems to surface weaknesses before they strike for real.

AWS commercialized this via two services. **Resilience Hub** analyzes workloads to measure and evaluate "given your RTO/RPO targets, how much can you actually tolerate?" **FIS (Fault Injection Service, formerly Fault Injection Simulator)** actually injects failures—EC2 terminations, network latency, API throttles. The key is combining both to automate the "measure → experiment → improve" loop. Today we explore chaos engineering's origin (Netflix), its scientific methodology, how FIS's safety mechanisms (Stop Conditions) prevent operational catastrophes, and how to automate all this periodically.

In DOP exams, this area appears as "how to verify/automate resilience?", "what safety guards prevent chaos from destroying operations?", "periodically validate DR failover?" scenarios.

## Where Chaos Engineering Came From—Netflix and Chaos Monkey

Chaos engineering originated around 2010 at Netflix. As Netflix migrated from its own data centers to AWS, it faced the reality: "in the cloud, instances die anytime (failure is normal)." Traditional thinking was "prevent failures." Netflix flipped it: **"Failures will happen. So let's intentionally cause some normally, forcing our system to tolerate them."** That tool became **Chaos Monkey** (2011, publicly released)—a program randomly killing instances in production.

Chaos Monkey soon expanded into the **Simian Army**—Latency Monkey (inject latency), Conformity Monkey (terminate non-conforming instances), Chaos Gorilla (simulate whole AZ failure), Chaos Kong (simulate whole region failure). FIS commercializes this Simian Army philosophy as a managed AWS service, with reinforced safety guards.

> 💡 **Related Theory**: Chaos engineering isn't just "throw failures" but applies **scientific method** to system reliability. Netflix et al., codifying *Principles of Chaos Engineering* (2015), make this explicit: (1) define steady state as measurable metrics (e.g., 99.9% success rate), (2) form a **hypothesis**: "the system will maintain steady state even under X failure," (3) actually inject the failure to test the hypothesis, (4) if steady state breaks, that's a discovered weakness. This resembles Karl Popper's falsifiability—"we believe the system tolerates X," so we try to disprove it via experiment; if disproven, we fix; if not disproven, confidence grows. The key shift: "belief" becomes "validated evidence" for resilience.

## Five Principles of Chaos Engineering

Principles to follow when designing FIS experiments.

1. **Hypothesis**: Start with a testable claim like "this system maintains 99.9% success even if one AZ dies."
2. **Steady State Definition**: Metrics (success rate, P99 latency, throughput) measured pre/post-experiment, fixed quantitatively.
3. **Small Blast Radius to Start**: Begin small—1 instance, 5% traffic; expand gradually as confidence grows.
4. **Environment Like Operations**: Validate in Staging, but ultimately in production (or production-like)—production reveals unique weaknesses.
5. **Stop Condition Always**: Experiment must have a safety net to stop immediately if it gets dangerous.

> 🔍 **Deeper**: "Blast radius" (experiment's scope of impact) is chaos engineering's core concept. Starting small isn't just caution but **learning efficiency**—large experiments carry high accident risk but teach fast; small ones are safe but teach slow. Mature orgs use **progressive exposure**: start tiny, confirm safety, then expand. Like Canary deployments (expose new code to 5% to contain risk), Chaos also "confines failures to small ranges" for risk control. FIS's SelectionMode (PERCENT/COUNT) is precisely this blast radius control dial.

## AWS FIS—Managed Chaos Injection

FIS defines and runs **Experiment Templates**. A template has three components: **Targets** (where), **Actions** (what), **Stop Conditions** (when to stop).

Key faults supported:

| Category | Action Examples |
|----------|-----------|
| **EC2** | Stop, Terminate, Reboot, CPU/Memory stress, API Throttle |
| **ECS/EKS** | Task/Pod kill, Container CPU/Memory stress |
| **RDS** | Failover, Reboot |
| **Network** | Packet loss, latency injection, DNS errors, connection blocking (SSM Agent-based) |
| **API** | Throttle/error injection on specific AWS APIs |
| **AZ Power** | AZ power-failure simulation (disrupt-connectivity) |

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

### Target Selection Mode—The Blast Radius Dial

- **ResourceArns**: Specify exact resources.
- **ResourceTags**: Match by tags (e.g., `Environment=prod`).
- **SelectionMode**: `ALL` (all) / `COUNT(N)` (N) / `PERCENT(N%)` (random N%).

`PERCENT(30)` means "random 30% of tag-matched instances." This dial quantitatively controls blast radius—start with `PERCENT(5)`, extend to `PERCENT(50)`.

## Stop Condition—Chaos's Safety Belt

FIS's most critical safety mechanism. During experiment, if a **CloudWatch Alarm fires, FIS immediately stops the experiment and rolls back** the injected failure. Example: "if P99 latency exceeds threshold," the alarm triggers and FIS stops CPU stress—preventing chaos from becoming real disaster.

> ⚠️ **Pitfall**: Chaos without Stop Condition is not chaos engineering but **intentional sabotage**. Exam answer to "make chaos experiments safe for operations?" is almost always "Stop Condition (CloudWatch Alarm-based)." Another common pitfall: Stop Condition **stops** the experiment but doesn't undo already-caused impact—so small blast radius and Stop Condition must go together (small radius means damage before stopping is also small). Safety is not a single device but **multi-layer defense: small radius + fast stop**.

> 📚 **Case Study**: The 2017 AWS S3 us-east-1 major outage started when an engineer debugging accidentally terminated more servers than intended with one command—essentially an "uncontrolled chaos experiment" happening by accident. One lesson: "**large-scale operations must have blast-radius limits and safety guards built in**." AWS later reinforced safety guardrails. FIS's SelectionMode (blast radius limit) and Stop Condition (immediate stop) are exactly this lesson commercialized. Lesson: "large operations with no undo all at once"—is the most dangerous anti-pattern, whether chaos or operations.

## AWS Resilience Hub—Measure and Evaluate Resilience

If FIS is "the hand injecting failures," Resilience Hub is "the doctor diagnosing resilience." Register a workload (application), and Resilience Hub analyzes its configuration (CloudFormation stack, Resource Groups, etc.) to evaluate if it **actually achieves your set RTO/RPO targets**.

```bash
# Resilience policy: per-tier RTO/RPO targets
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
- **Measure vs. Target**: "RTO goal 5 min but actual config needs 12 min?" gaps revealed (by failure type—Hardware/Software/AZ/Region).
- **Recommended improvements + cost**: "Enable Multi-AZ, AZ RTO drops 10→2 min, +$X/month"—concrete proposals.
- **FIS integration**: Assessment result auto-generates and runs FIS experiments to verify.
- **Periodic reports**: Resilience score trends tracked.

> 💡 **Related Theory**: Resilience Hub automates and quantifies AWS **Well-Architected Framework's Reliability Pillar**. Well-Architected prescribes abstract principles: "test recovery procedures," "auto-recover from failure," "scale horizontally for availability." Resilience Hub converts this to quantitative metrics: "your workload's actual AZ-failure RTO = X seconds vs. 600-second goal." This applies software engineering's "you can't improve what you can't measure" (Drucker aphorism, often cited through Tom DeMarco)—resilience becomes scored gaps and improvements, data-driven improvement.

## Periodic Automation—Measure-Experiment-Improve Loop

Chaos engineering's real value emerges from **regular repetition**, not one-offs. Code changes, infrastructure evolves; yesterday's resilient system breaks today. Use **EventBridge Scheduler** to run FIS experiments periodically, collecting results in Resilience Hub and CloudWatch.

```
Periodic Chaos Loop
   EventBridge Scheduler (weekly cron)
        ▼
   Lambda → fis:StartExperiment
        ▼
   FIS Experiment (Targets PERCENT(30) / CPU stress / Stop Conditions)
        ▼
   System under stress → Auto-healing (ASG/ECS) activates + Alarm monitors
        ▼ (P99 > threshold triggers Stop Condition)
   Report → Resilience Hub update + Slack alert + Runbook learns
```

### ARC + FIS—DR Failover Itself as Chaos Target

Trigger Route 53 ARC Routing Control switch via FIS Action, and **periodically validate the DR failover procedure itself**. "Does region failover actually complete within RTO?" checked monthly via automated experiment—directly addressing Day 3's "untested DR doesn't work."

> 🔍 **Deeper**: **Game Day** and **Chaos Engineering** are often confused but differ. Game Day is a **one-time event** where a team gathers, manually runs intentional failure scenarios, checking humans/processes/runbooks (quarterly/annual, training-focused). Chaos Engineering **automates failure injection periodically** (daily/weekly, verification-focused) via tools like FIS. They're complementary—Game Day validates "how do people respond to failure?" (are runbooks clear, roles assigned?), while Chaos validates "how does the system respond?" (auto-recovery working?). Mature orgs train people quarterly via Game Day and verify systems weekly via automated Chaos. Exams: "one-time human-process training" = Game Day; "periodic system auto-verification" = Chaos/FIS.

> ⚠️ **Pitfall**: When automating periodic chaos in production, if Stop Condition thresholds are too sensitive, experiments stop immediately, learning nothing. Too loose, real incidents occur. So Stop Condition thresholds must be carefully grounded in steady-state metrics, starting conservative (small radius + conservative thresholds), then tuning gradually. Safety and learning trade off; balancing them is chaos engineering operations' skill.

## Closing Thoughts

Four pictures emerge today. First, **Chaos Engineering originated with Netflix Chaos Monkey, applying scientific method (hypothesis→experiment→verification) to system reliability**—not "prevent failures" but "force tolerance by injecting intentionally." Second, **FIS implements this as managed service** with Targets (blast radius: dial via PERCENT/COUNT), Actions (failure types), Stop Conditions (safety belt). Third, **Resilience Hub quantifies Well-Architected Reliability Pillar**, revealing RTO/RPO target-vs-actual gaps, improvements, and costs, integrating with FIS for joint validation. Fourth, **EventBridge Scheduler + FIS automates the measure-experiment-improve loop periodically**, with ARC + FIS validating DR failover itself, while Game Day (humans, one-time) and Chaos (systems, periodic) are complementary.

Next, Week 13 wrap-up: synthesize Multi-AZ, Multi-Region, four DR strategies, Resilience Hub/FIS via scenario questions.

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

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 카오스 엔지니어링은 Netflix Chaos Monkey/Simian Army에서 시작된, 과학적 방법(정상 상태 정의→가설→장애 주입→검증)을 시스템 신뢰성에 적용한 방법론으로 "장애를 막자"가 아니라 "일부러 일으켜 견디게 강제하자"는 전환이다. 둘째, FIS는 이를 관리형으로 구현하며 Targets(폭발 반경: ALL/COUNT/PERCENT 다이얼)·Actions(EC2/네트워크/RDS/API 장애)·Stop Conditions(CloudWatch Alarm 기반 즉시 중단·롤백, 카오스의 안전벨트)로 구성되고, "작은 반경 + 빠른 중단"의 다층 방어가 핵심이다. 셋째, Resilience Hub는 Well-Architected Reliability Pillar를 계량화해 장애 유형별 RTO/RPO 목표 대비 실측 갭·개선안·비용을 제시하고 FIS와 통합 검증한다. 넷째, EventBridge Scheduler + FIS로 측정·실험·개선 루프를 정기 자동화하고, ARC + FIS로 DR 페일오버 자체를 정기 검증하며, Game Day(사람·일회성 훈련)와 Chaos(시스템·정기 자동)는 보완 관계다.
