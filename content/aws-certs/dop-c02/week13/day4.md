# Day 4 - 복원력의 검증: Resilience Hub와 FIS로 하는 카오스 엔지니어링

DR 전략을 아무리 잘 설계해도, "정말 작동하는가"는 별개의 문제다. 종이 위의 RTO 5분은 실제 장애가 닥쳤을 때 30분이 될 수 있고, "Multi-AZ라 괜찮다"던 시스템이 막상 한 AZ가 죽자 무너지기도 한다. 소프트웨어 신뢰성의 불편한 진실은 "테스트하지 않은 복구는 작동하지 않는다"는 것이다. 그래서 등장한 것이 **카오스 엔지니어링(Chaos Engineering)** — 멀쩡한 시스템에 의도적으로 장애를 주입해, 장애가 진짜로 닥치기 전에 약점을 미리 드러내는 방법론이다.

AWS는 이를 두 서비스로 제품화했다. **Resilience Hub**는 워크로드를 분석해 "당신의 RTO/RPO 목표 대비 실제로 얼마나 견딜 수 있는가"를 측정·평가하고, **FIS(Fault Injection Service, 옛 Fault Injection Simulator)**는 EC2 종료·네트워크 지연·API 스로틀 같은 장애를 실제로 주입한다. 핵심은 둘을 결합해 "측정 → 실험 → 개선"의 루프를 자동화하는 것이다. 오늘은 카오스 엔지니어링이 어디서 왔는지(Netflix), 그 과학적 방법론이 무엇인지, FIS가 어떤 안전장치(Stop Condition)로 운영 사고를 막는지, 그리고 이 모든 것을 정기 자동화하는 패턴을 깊이 본다.

DOP 시험에서 이 영역은 "복원력을 어떻게 검증·자동화하나", "카오스 실험이 운영을 망가뜨리지 않게 하는 안전장치는", "DR 페일오버를 정기적으로 검증하려면" 같은 시나리오로 나온다.

## 카오스 엔지니어링은 어디서 왔나 — Netflix와 Chaos Monkey

카오스 엔지니어링의 기원은 2010년경 Netflix다. Netflix가 자체 데이터센터에서 AWS 클라우드로 이전하면서, "클라우드에서는 인스턴스가 언제든 죽을 수 있다(failure is normal)"는 현실을 마주했다. 전통적 접근은 "장애가 안 나게 막자"였지만, Netflix는 발상을 뒤집었다 — **"어차피 장애는 난다. 그렇다면 평소에 일부러 장애를 일으켜, 우리 시스템이 장애에 견디도록 강제하자."** 그렇게 만든 도구가 **Chaos Monkey**(2011 공개)다 — 운영 환경에서 무작위로 인스턴스를 죽이는 프로그램이다.

Chaos Monkey는 곧 **Simian Army**(원숭이 군단)로 확장됐다 — Latency Monkey(지연 주입), Conformity Monkey(규칙 위반 인스턴스 종료), Chaos Gorilla(AZ 전체 장애 시뮬레이션), Chaos Kong(리전 전체 장애). FIS는 이 Simian Army의 발상을 AWS 관리형 서비스로, 안전장치를 강화해 옮긴 것이다.

> 💡 **관련 이론**: 카오스 엔지니어링은 단순한 "장애 던지기"가 아니라 **과학적 방법(scientific method)**을 시스템 신뢰성에 적용한 것이다. 2015년 Netflix 등이 정리한 *Principles of Chaos Engineering*은 이를 명시한다 — (1) 정상 상태(steady state)를 측정 가능한 지표로 정의하고(예: 성공률 99.9%), (2) "시스템이 X 장애에도 정상 상태를 유지할 것"이라는 **가설(hypothesis)**을 세우고, (3) 실제 장애를 주입해 가설을 검증하고, (4) 정상 상태가 깨지면 그것이 곧 발견된 약점이다. 이는 칼 포퍼의 반증주의(falsifiability)와 닮았다 — "시스템이 견딜 것"이라는 믿음을 실험으로 반증하려 시도해, 반증되지 않으면 신뢰가 쌓이고 반증되면 약점을 고친다. "믿음"이 아니라 "검증된 증거"로 복원력을 다룬다는 게 핵심 전환이다.

## 카오스 엔지니어링의 5원칙

FIS 실험을 설계할 때 따라야 할 원칙들이다.

1. **가설(Hypothesis)**: "이 시스템은 한 AZ가 죽어도 99.9% 성공률을 유지한다" 같은 검증 가능한 명제로 시작.
2. **정상 상태(Steady State) 정의**: 실험 전후 비교할 지표(성공률, P99 지연, 처리량)를 측정 가능하게 고정.
3. **작은 폭발 반경(Small Blast Radius)에서 시작**: 처음엔 인스턴스 1개·트래픽 5%처럼 작게, 신뢰가 쌓이면 확대.
4. **운영과 유사한 환경**: Staging부터 검증하되, 궁극적으론 운영(또는 운영 유사)에서 — 운영에서만 드러나는 약점이 있기 때문.
5. **Stop Condition은 항상**: 실험이 위험해지면 즉시 중단할 안전망을 반드시 둠.

> 🔍 **더 깊이**: "폭발 반경(blast radius)"은 카오스 엔지니어링의 핵심 개념으로, 실험이 영향을 미치는 범위다. 폭발 반경을 작게 시작하는 건 단순한 신중함이 아니라 **위험 대비 학습의 효율** 때문이다 — 큰 실험은 큰 사고 위험을 지지만 한 번에 많이 배우고, 작은 실험은 안전하지만 천천히 배운다. 성숙한 조직은 "작게 시작해 안전이 확인되면 점진적으로 확대"하는 **점증적 노출(progressive exposure)**을 쓴다. 이는 배포 전략의 카나리(canary)와 같은 사상이다 — 카나리가 "새 코드를 5%에게만 노출해 위험을 가두는" 것처럼, 카오스도 "장애를 작은 범위에 가둬" 위험을 통제한다. FIS의 SelectionMode(PERCENT/COUNT)가 바로 이 폭발 반경 제어 장치다.

## AWS FIS — 관리형 카오스 주입

FIS는 **Experiment Template**(실험 설계도)을 정의하고 실행한다. 템플릿은 세 요소로 구성된다 — **Targets**(어디에), **Actions**(무엇을), **Stop Conditions**(언제 멈출지).

지원하는 주요 fault:

| 카테고리 | Action 예 |
|----------|-----------|
| **EC2** | Stop, Terminate, Reboot, CPU/Memory stress, API Throttle |
| **ECS/EKS** | Task/Pod kill, Container CPU/Memory stress |
| **RDS** | Failover, Reboot |
| **Network** | 패킷 손실, 지연(latency) 주입, DNS 오류, 연결 차단(SSM Agent 기반) |
| **API** | 특정 AWS API에 스로틀/오류 주입 |
| **AZ Power** | AZ 전원 장애 시뮬레이션(disrupt-connectivity) |

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

### Target 선택 모드 — 폭발 반경의 다이얼

- **ResourceArns**: 특정 리소스를 명시.
- **ResourceTags**: 태그로 매칭(예: `Environment=prod`).
- **SelectionMode**: `ALL`(전부) / `COUNT(N)`(N개) / `PERCENT(N%)`(N% 무작위).

`PERCENT(30)`은 "태그 매칭된 인스턴스 중 무작위 30%"를 친다. 이 다이얼이 폭발 반경을 정량적으로 조절한다 — 처음엔 `PERCENT(5)`로 시작해 `PERCENT(50)`까지 키운다.

## Stop Condition — 카오스의 안전벨트

FIS의 가장 중요한 안전장치다. 실험 중 **CloudWatch Alarm이 발동하면 FIS가 즉시 실험을 중단**하고, 주입한 장애를 롤백한다. 예를 들어 "P99 지연이 임계값을 넘으면" 알람이 켜지고, FIS는 그 즉시 CPU stress를 멈춘다 — 카오스 실험이 진짜 장애로 번지는 것을 막는다.

> ⚠️ **함정**: Stop Condition 없는 카오스 실험은 카오스 엔지니어링이 아니라 그냥 **고의적 장애**다. 시험에서 "카오스 실험이 운영 영향을 최소화하도록 안전하게 만들려면"의 답은 거의 항상 "Stop Condition(CloudWatch Alarm 기반)"이다. 또 흔한 함정: Stop Condition은 실험을 **중단**할 뿐, 이미 일어난 영향을 되돌리는 마법이 아니다 — 그래서 작은 폭발 반경에서 시작하는 것과 Stop Condition은 함께 가야 한다(폭발 반경이 작으면 Stop 전까지의 피해도 작다). 안전은 단일 장치가 아니라 "작은 반경 + 빠른 중단"의 다층 방어다.

> 📚 **사례**: 2017년 AWS S3 us-east-1 대규모 장애는 엔지니어가 디버깅 중 의도한 것보다 많은 수의 서버를 명령 하나로 종료시키면서 시작됐다 — 사실상 "통제되지 않은 카오스 실험"이 우연히 일어난 셈이다. 이 사건의 교훈 중 하나가 "**대규모 작업에는 폭발 반경 제한과 안전장치가 내장돼야 한다**"였고, 이후 AWS는 이런 명령에 안전 가드레일을 강화했다. FIS의 SelectionMode(폭발 반경 제한)와 Stop Condition(즉시 중단)은 정확히 이 교훈의 제품화다. 교훈: 카오스든 운영 작업이든, "되돌릴 수 없는 큰 작업을 한 번에"는 가장 위험한 안티패턴이다.

## AWS Resilience Hub — 복원력을 측정·평가하다

FIS가 "장애를 주입하는 손"이라면, Resilience Hub는 "복원력을 진단하는 의사"다. 워크로드(애플리케이션)를 등록하면, Resilience Hub가 그 구성(CloudFormation 스택, Resource Groups 등)을 분석해 **설정한 RTO/RPO 목표를 실제로 달성할 수 있는지** 평가한다.

```bash
# 복원력 정책: 계층별 RTO/RPO 목표
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

핵심 가치:
- **목표 대비 측정**: "RTO 5분 목표인데 실제 구성은 12분 걸린다"는 식의 갭을 드러냄(장애 유형별 — Hardware/Software/AZ/Region).
- **권장 개선안 + 비용 영향**: "Multi-AZ를 켜면 AZ RTO가 10분→2분, 월 $X 추가" 같은 구체적 제안.
- **FIS 통합**: 평가 결과를 검증하는 FIS 실험을 자동 생성·실행.
- **정기 보고서**: 복원력 점수 추세를 추적.

> 💡 **관련 이론**: Resilience Hub는 AWS **Well-Architected Framework의 Reliability Pillar**를 자동화·계량화한 도구다. Well-Architected는 "복구 절차를 테스트하라", "장애로부터 자동 복구하라", "수평 확장으로 가용성을 높여라" 같은 원칙을 제시하지만 추상적이다. Resilience Hub는 이를 "당신의 워크로드는 AZ 장애 RTO 목표 600초 대비 실측 X초"처럼 정량 지표로 바꾼다. 이는 소프트웨어 공학의 "측정할 수 없으면 개선할 수 없다(드러커의 격언, 톰 드마르코로 종종 인용)"는 원칙의 적용이다 — 복원력을 막연한 자신감이 아니라 점수와 갭으로 다뤄, 개선을 데이터 기반으로 만든다.

## 정기 자동화 — 측정·실험·개선의 루프

카오스 엔지니어링의 진짜 가치는 일회성이 아니라 **정기 반복**에서 나온다. 코드가 바뀌고 인프라가 진화하면 어제 견디던 시스템이 오늘 깨질 수 있다. **EventBridge Scheduler**로 FIS 실험을 주기 실행하고, 결과를 Resilience Hub와 CloudWatch로 모은다.

```
정기 카오스 루프
   EventBridge Scheduler (weekly cron)
        ▼
   Lambda → fis:StartExperiment
        ▼
   FIS Experiment (Targets PERCENT(30) / CPU stress / Stop Conditions)
        ▼
   System under stress → Auto-healing(ASG/ECS) 작동 + Alarm 감시
        ▼ (P99 > 임계 시 Stop Condition 발동)
   Report → Resilience Hub 갱신 + Slack 알림 + Runbook에 교훈 추가
```

### ARC + FIS — DR 페일오버 자체를 카오스 대상으로

Day 2의 Route 53 ARC Routing Control 전환을 FIS Action으로 트리거하면, **DR 페일오버 절차 자체를 정기 검증**할 수 있다. "리전 페일오버가 정말 RTO 안에 끝나는가"를 매달 자동 실험으로 확인 — Day 3에서 강조한 "검증 안 된 DR은 작동 안 한다"를 정면으로 푸는 패턴이다.

> 🔍 **더 깊이**: **Game Day**와 **Chaos Engineering**은 자주 혼동되지만 다르다. Game Day는 팀이 모여 의도적 장애 시나리오를 수동으로 실행하며 사람·프로세스·런북을 점검하는 **일회성 이벤트**(분기/연 단위, 학습·훈련 중심)다. Chaos Engineering은 FIS 같은 도구로 장애 주입을 **정기 자동화**(일/주 단위, 검증 중심)한 것이다. 둘은 보완 관계다 — Game Day는 "사람이 장애에 어떻게 대응하는가"(런북이 명확한가, 누가 무엇을 하는가)를 검증하고, Chaos Engineering은 "시스템이 장애에 어떻게 반응하는가"(자동 복구가 작동하는가)를 검증한다. 성숙한 조직은 분기별 Game Day로 사람을 훈련하고, 주간 자동 카오스로 시스템을 검증한다. 시험에서 "사람·프로세스 검증의 일회성 훈련"은 Game Day, "시스템 자동 검증의 정기 실행"은 Chaos/FIS다.

> ⚠️ **함정**: 정기 카오스 자동화를 운영에 돌릴 때, "실험이 진짜 사고를 칠까 봐 Stop Condition을 너무 민감하게 잡으면" 실험이 매번 즉시 중단돼 아무것도 못 배운다. 반대로 너무 둔감하면 진짜 사고로 번진다. 그래서 Stop Condition 임계값은 "정상 상태(steady state) 지표"에 근거해 신중히 잡아야 하고, 초기엔 작은 폭발 반경 + 보수적 임계로 시작해 점진 조정한다. 안전과 학습은 트레이드오프이며, 이 균형을 잡는 게 카오스 엔지니어링 운영의 기술이다.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **카오스 엔지니어링은 Netflix Chaos Monkey에서 시작된, 과학적 방법(가설→실험→검증)을 시스템 신뢰성에 적용한 방법론**으로 "장애를 막자"가 아니라 "장애를 일부러 일으켜 견디게 강제하자"는 발상 전환이다. 둘째, **FIS는 이를 관리형으로 구현**하며 Targets(폭발 반경: PERCENT/COUNT로 다이얼)·Actions(장애 종류)·Stop Conditions(안전벨트)로 구성된다. 셋째, **Resilience Hub는 Well-Architected Reliability Pillar를 계량화**해 RTO/RPO 목표 대비 실측 갭과 개선안·비용을 드러내고 FIS와 통합 검증한다. 넷째, **EventBridge Scheduler + FIS로 정기 자동화**해 측정·실험·개선 루프를 돌리고, ARC + FIS로 DR 페일오버 자체를 정기 검증하며, Game Day(사람·일회성)와 Chaos(시스템·정기)는 보완 관계다.

다음 글에서는 Week 13 전체 — Multi-AZ, Multi-Region, DR 4 전략, Resilience Hub/FIS — 를 시나리오 문제로 종합 복습한다.

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
