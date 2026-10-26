# Day 4 - 복원력 검증: Resilience Hub와 FIS로 하는 카오스 엔지니어링

아무리 잘 설계한 DR 전략이라도 "실제로 동작하는가"는 별개의 문제다. 문서상 5분이던 RTO가 진짜 재해가 닥치면 30분이 될 수 있고, "Multi-AZ니까 괜찮다"고 자랑하던 시스템도 AZ 하나가 실제로 죽으면 무너진다. 소프트웨어 신뢰성의 불편한 진실은 "테스트하지 않은 복구는 동작하지 않는다"는 것이다. 여기서 **카오스 엔지니어링(Chaos Engineering)**이 등장한다. 멀쩡한 시스템에 의도적으로 장애를 주입해, 진짜 장애가 터지기 전에 약점을 드러내는 방법이다.

AWS는 이를 두 서비스로 상용화했다. **Resilience Hub**는 워크로드를 분석해 "설정한 RTO/RPO 목표 대비 실제로 얼마나 견딜 수 있는가"를 측정하고 평가한다. **FIS(Fault Injection Service, 이전 이름 Fault Injection Simulator)**는 EC2 종료, 네트워크 지연, API 스로틀 같은 장애를 실제로 주입한다. 핵심은 둘을 결합해 "측정 → 실험 → 개선" 루프를 자동화하는 것이다. 오늘은 카오스 엔지니어링의 기원(Netflix)과 과학적 방법론, FIS의 안전장치(Stop Condition)가 운영 참사를 막는 방식, 그리고 이 모두를 주기적으로 자동화하는 방법을 본다.

DOP 시험에서 이 영역은 "복원력을 어떻게 검증/자동화하는가", "카오스가 운영을 망치지 않게 하는 안전장치는 무엇인가", "DR 페일오버를 주기적으로 검증하려면" 같은 시나리오로 나온다.

## 카오스 엔지니어링은 어디서 왔나 — Netflix와 Chaos Monkey

카오스 엔지니어링은 2010년 무렵 Netflix에서 시작되었다. Netflix는 자체 데이터센터에서 AWS로 옮겨 가며 "클라우드에서는 인스턴스가 언제든 죽는다(장애는 정상이다)"라는 현실에 직면했다. 전통적 사고는 "장애를 막자"였다. Netflix는 이를 뒤집었다. **"장애는 일어난다. 그러니 일부러 평소에 일으켜서 시스템이 견디도록 강제하자."** 그 도구가 **Chaos Monkey**(2011년 공개)로, 운영 환경에서 인스턴스를 무작위로 죽이는 프로그램이다.

Chaos Monkey는 곧 **Simian Army**로 확장되었다. Latency Monkey(지연 주입), Conformity Monkey(규격에 맞지 않는 인스턴스 종료), Chaos Gorilla(AZ 전체 장애 시뮬레이션), Chaos Kong(리전 전체 장애 시뮬레이션)이다. FIS는 이 Simian Army의 철학을 안전장치를 강화한 AWS 관리형 서비스로 상용화한 것이다.

> 카오스 엔지니어링은 단순히 "장애를 던지는 것"이 아니라 시스템 신뢰성에 **과학적 방법**을 적용하는 것이다. Netflix 등이 정리한 *Principles of Chaos Engineering*(2015)이 이를 분명히 한다. (1) 정상 상태(steady state)를 측정 가능한 지표로 정의한다(예: 성공률 99.9%). (2) "X 장애가 나도 시스템은 정상 상태를 유지한다"는 **가설**을 세운다. (3) 가설을 검증하려고 실제로 장애를 주입한다. (4) 정상 상태가 깨지면 그것이 발견된 약점이다. 이는 Karl Popper의 반증 가능성과 닮았다. "시스템이 X를 견딘다고 믿는다"면 실험으로 반증을 시도하고, 반증되면 고치고, 반증되지 않으면 확신이 커진다. 핵심 전환은 복원력에 대한 "믿음"이 "검증된 증거"가 된다는 것이다.

## 카오스 엔지니어링의 5대 원칙

FIS 실험을 설계할 때 따를 원칙이다.

1. **가설(Hypothesis)**: "AZ 하나가 죽어도 이 시스템은 99.9% 성공률을 유지한다"처럼 검증 가능한 주장으로 시작한다.
2. **정상 상태 정의(Steady State Definition)**: 실험 전후에 측정하는 지표(성공률, P99 지연, 처리량)를 정량적으로 고정한다.
3. **작은 폭발 반경(Blast Radius)으로 시작**: 작게 시작한다. 인스턴스 1개, 트래픽 5%에서 출발해 확신이 쌓이면 점진적으로 넓힌다.
4. **운영과 같은 환경**: Staging에서 검증하되 최종적으로는 운영(또는 운영과 유사한 환경)에서 한다. 운영 환경에만 있는 약점이 있다.
5. **항상 Stop Condition**: 실험이 위험해지면 즉시 멈추는 안전망을 반드시 둔다.

> "폭발 반경(blast radius)"(실험이 미치는 영향 범위)은 카오스 엔지니어링의 핵심 개념이다. 작게 시작하는 것은 단순한 조심이 아니라 **학습 효율**의 문제다. 큰 실험은 사고 위험이 높지만 빨리 배우고, 작은 실험은 안전하지만 느리게 배운다. 성숙한 조직은 **점진적 노출(progressive exposure)**을 쓴다. 아주 작게 시작해 안전을 확인한 뒤 넓힌다. 새 코드를 5%에만 노출해 위험을 가두는 Canary 배포처럼, 카오스도 "장애를 좁은 범위에 가둬서" 위험을 통제한다. FIS의 SelectionMode(PERCENT/COUNT)가 바로 이 폭발 반경 조절 다이얼이다.

## AWS FIS — 관리형 카오스 주입

FIS는 **Experiment Template**을 정의하고 실행한다. 템플릿은 세 요소로 이루어진다. **Targets**(어디에), **Actions**(무엇을), **Stop Conditions**(언제 멈출지)다.

지원하는 주요 장애는 다음과 같다.

| 분류 | Action 예시 |
|----------|-----------|
| **EC2** | Stop, Terminate, Reboot, CPU/Memory 부하, API Throttle |
| **ECS/EKS** | Task/Pod 종료, 컨테이너 CPU/Memory 부하 |
| **RDS** | Failover, Reboot |
| **Network** | 패킷 손실, 지연 주입, DNS 오류, 연결 차단 (SSM Agent 기반) |
| **API** | 특정 AWS API에 대한 Throttle/오류 주입 |
| **AZ Power** | AZ 전원 장애 시뮬레이션 (disrupt-connectivity) |

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

### 대상 선택 모드 — 폭발 반경 다이얼

- **ResourceArns**: 정확한 리소스를 지정한다.
- **ResourceTags**: 태그로 매칭한다(예: `Environment=prod`).
- **SelectionMode**: `ALL`(전체) / `COUNT(N)`(N개) / `PERCENT(N%)`(무작위 N%).

`PERCENT(30)`은 "태그가 일치하는 인스턴스 중 무작위 30%"라는 뜻이다. 이 다이얼이 폭발 반경을 정량적으로 조절한다. `PERCENT(5)`로 시작해 `PERCENT(50)`까지 넓힌다.

## Stop Condition — 카오스의 안전벨트

FIS에서 가장 중요한 안전장치다. 실험 중에 **CloudWatch Alarm이 울리면 FIS가 즉시 실험을 중단하고** 주입한 장애를 **롤백**한다. 예를 들어 "P99 지연이 임계값을 넘으면" 경보가 울려 FIS가 CPU 부하를 멈추므로, 카오스가 실제 재해로 번지지 않는다.

> ⚠️ **함정**: Stop Condition이 없는 카오스는 카오스 엔지니어링이 아니라 **의도적인 사보타주**다. "카오스 실험이 운영에 안전하도록 하려면"의 시험 정답은 거의 항상 "Stop Condition(CloudWatch Alarm 기반)"이다. 또 하나 흔한 함정은, Stop Condition이 실험을 **멈출 뿐** 이미 발생한 영향을 되돌리지는 않는다는 점이다. 그래서 작은 폭발 반경과 Stop Condition은 함께 가야 한다(반경이 작으면 멈추기 전의 피해도 작다). 안전은 단일 장치가 아니라 **작은 반경 + 빠른 중단이라는 다층 방어**다.

> 2017년 AWS S3 us-east-1 대규모 장애는 한 엔지니어가 디버깅 중 명령 하나로 의도보다 많은 서버를 실수로 종료하면서 시작되었다. 사실상 우연히 벌어진 "통제 없는 카오스 실험"이었다. 교훈 하나는 "**대규모 작업에는 폭발 반경 제한과 안전장치가 내장되어야 한다**"는 것이다. AWS는 이후 안전 가드레일을 강화했다. FIS의 SelectionMode(폭발 반경 제한)와 Stop Condition(즉시 중단)이 바로 이 교훈을 상용화한 것이다. 되돌릴 수단 없이 한 번에 크게 벌이는 작업은 카오스든 운영이든 가장 위험한 안티패턴이다.

## AWS Resilience Hub — 복원력을 측정하고 평가하다

FIS가 "장애를 주입하는 손"이라면 Resilience Hub는 "복원력을 진단하는 의사"다. 워크로드(애플리케이션)를 등록하면 Resilience Hub가 그 구성(CloudFormation 스택, Resource Groups 등)을 분석해 설정한 RTO/RPO 목표를 **실제로 달성하는지** 평가한다.

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

핵심 가치는 다음과 같다.
- **목표 대비 측정**: "RTO 목표는 5분인데 실제 구성은 12분이 필요하다"는 차이를 장애 유형별(Hardware/Software/AZ/Region)로 드러낸다.
- **개선 권고 + 비용**: "Multi-AZ를 켜면 AZ RTO가 10분에서 2분으로 줄고 월 $X가 추가된다"처럼 구체적으로 제안한다.
- **FIS 연동**: 평가 결과로 FIS 실험을 자동 생성하고 실행해 검증한다.
- **주기적 리포트**: 복원력 점수의 추이를 추적한다.

> Resilience Hub는 AWS **Well-Architected Framework의 신뢰성 기둥(Reliability Pillar)**을 자동화하고 정량화한다. Well-Architected는 "복구 절차를 테스트하라", "장애에서 자동으로 복구하라", "가용성을 위해 수평 확장하라" 같은 추상적 원칙을 제시한다. Resilience Hub는 이를 "이 워크로드의 실제 AZ 장애 RTO는 X초이고 목표는 600초다"라는 정량 지표로 바꾼다. 측정할 수 없으면 개선할 수 없다는 소프트웨어 공학의 격언(Drucker의 경구로, 흔히 Tom DeMarco를 통해 인용된다)을 적용한 것이다. 복원력이 점수화된 격차와 개선안이 되어, 데이터에 기반한 개선이 가능해진다.

## 주기적 자동화 — 측정·실험·개선 루프

카오스 엔지니어링의 진짜 가치는 일회성이 아니라 **정기적인 반복**에서 나온다. 코드가 바뀌고 인프라가 진화하므로 어제는 복원력이 있던 시스템이 오늘은 깨질 수 있다. **EventBridge Scheduler**로 FIS 실험을 주기적으로 실행하고, 결과를 Resilience Hub와 CloudWatch에 모은다.

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

### ARC + FIS — DR 페일오버 자체를 카오스 대상으로

FIS Action으로 Route 53 ARC Routing Control 전환을 일으켜 **DR 페일오버 절차 자체를 주기적으로 검증**한다. "리전 페일오버가 RTO 안에 실제로 완료되는가"를 매달 자동 실험으로 확인한다. Day 3의 "테스트하지 않은 DR은 동작하지 않는다"를 직접 해결한다.

> **Game Day**와 **카오스 엔지니어링**은 자주 혼동되지만 다르다. Game Day는 팀이 모여 의도적인 장애 시나리오를 수동으로 실행하며 사람/프로세스/런북을 점검하는 **일회성 행사**다(분기/연 단위, 훈련 중심). 카오스 엔지니어링은 FIS 같은 도구로 **장애 주입을 주기적으로 자동화**한다(일/주 단위, 검증 중심). 둘은 상호 보완적이다. Game Day는 "사람이 장애에 어떻게 대응하는가"(런북이 명확한가, 역할이 지정되었는가)를 검증하고, 카오스는 "시스템이 장애에 어떻게 반응하는가"(자동 복구가 동작하는가)를 검증한다. 성숙한 조직은 Game Day로 분기마다 사람을 훈련하고, 자동화된 카오스로 매주 시스템을 검증한다. 시험에서 "일회성 사람/프로세스 훈련"은 Game Day, "주기적 시스템 자동 검증"은 Chaos/FIS다.

> ⚠️ **함정**: 운영 환경에서 주기적 카오스를 자동화할 때 Stop Condition 임계값이 너무 민감하면 실험이 즉시 멈춰 아무것도 배우지 못한다. 너무 느슨하면 실제 사고가 난다. 그래서 Stop Condition 임계값은 정상 상태 지표에 근거해 신중하게 정해야 하며, 보수적으로(작은 반경 + 보수적 임계값) 시작해 점차 조정한다. 안전과 학습은 맞바꾸는 관계이고, 둘의 균형을 잡는 것이 카오스 엔지니어링 운영의 기술이다.

## 정리

오늘은 네 장의 그림이 나왔다. 첫째, **카오스 엔지니어링은 Netflix Chaos Monkey에서 시작되었고 시스템 신뢰성에 과학적 방법(가설 → 실험 → 검증)을 적용**한다. "장애를 막자"가 아니라 "의도적으로 주입해 견디도록 강제하자"다. 둘째, **FIS가 이를 관리형 서비스로 구현**한다. Targets(폭발 반경: PERCENT/COUNT 다이얼), Actions(장애 유형), Stop Conditions(안전벨트)로 이루어진다. 셋째, **Resilience Hub는 Well-Architected 신뢰성 기둥을 정량화**하여 RTO/RPO 목표 대비 실제의 차이, 개선안, 비용을 드러내고 FIS와 연동해 함께 검증한다. 넷째, **EventBridge Scheduler + FIS가 측정·실험·개선 루프를 주기적으로 자동화**하고, ARC + FIS가 DR 페일오버 자체를 검증하며, Game Day(사람, 일회성)와 카오스(시스템, 주기적)는 상호 보완이다.

다음에는 Week 13을 마무리한다. Multi-AZ, 멀티 리전, DR 4종 전략, Resilience Hub/FIS를 시나리오 문제로 종합한다.

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
