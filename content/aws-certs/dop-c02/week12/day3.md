# Day 3 - Auto-Healing: 자동 복구의 제어 이론과 폭주를 막는 안전 공학

운영을 오래 하면 한 가지 진실에 도달한다. 장애는 막을 수 없고, 다만 빨리 고칠 수 있을 뿐이다. SRE가 가용성을 말할 때 쓰는 두 숫자가 MTBF(Mean Time Between Failures, 평균 무고장 시간)와 MTTR(Mean Time To Restore, 평균 복구 시간)인데, 가용성 = MTBF / (MTBF + MTTR)이라는 식을 들여다보면 흥미로운 사실이 보인다. 고장을 더 드물게 만드는 것(MTBF↑)은 한계 비용이 가파르게 치솟지만, 복구를 더 빠르게 만드는 것(MTTR↓)은 비교적 싸게 큰 가용성 개선을 가져온다. 그래서 현대 운영의 무게중심은 "장애를 없애자"에서 "장애를 빠르게 자동 복구하자"로 옮겨갔다. 사람이 페이지를 받고, 잠에서 깨고, VPN에 붙고, 로그를 읽고, 명령을 입력하는 데까지 걸리는 시간이 MTTR의 대부분을 차지하기 때문이다. Auto-healing은 이 인간 루프를 잘라낸다.

오늘은 자동 복구를 "Lambda로 인스턴스 재시작하는 스크립트"로 보지 않고, 그 밑에 깔린 제어 이론(control theory)과 안전 공학(safety engineering)을 판다. 자동 복구가 왜 본질적으로 **닫힌 루프 제어기**(closed-loop controller)인지, 잘못 설계된 자동화가 어떻게 멀쩡한 시스템을 스스로 무너뜨리는지(2017년 한 대형 사고가 정확히 이것이었다), Circuit Breaker가 어떤 전기 공학 개념에서 왔는지, Cooldown과 Bounded Action이 왜 선택이 아니라 필수인지를 본다. DOP 시험에서 자동 복구는 인시던트 자동화 도메인의 핵심으로, "GuardDuty 탐지를 어떻게 자동 격리로 잇나", "ASG가 어떻게 스스로 인스턴스를 교체하나", "자동화가 폭주하지 않게 어떻게 막나" 같은 시나리오로 반복 출제된다.

## 자동 복구는 어디서 왔나 — 제어 이론과 자가 치유 시스템

"시스템이 스스로 상태를 감지해 교정한다"는 발상은 소프트웨어보다 훨씬 오래됐다. 1788년 제임스 와트의 **원심 조속기**(centrifugal governor)가 증기 기관의 속도를 자동으로 일정하게 유지한 것이 산업 시대 피드백 제어의 원형이고, 1948년 노버트 위너가 『Cybernetics』에서 "피드백을 통한 제어와 통신"을 학문으로 정립했다. 제어 이론의 핵심 도식은 늘 같다 — **측정(sense) → 비교(compare) → 작동(actuate)** 의 닫힌 루프다. 목표값(setpoint)과 현재값의 차이(error)를 줄이는 방향으로 작동기를 움직인다.

클라우드 자동 복구는 이 루프를 인프라에 그대로 옮긴 것이다. CloudWatch Alarm이 측정(sense), 임계값 비교가 compare, Lambda/SSM/ASG의 복구 동작이 actuate다. IBM이 2001년 발표한 **Autonomic Computing**(자율 컴퓨팅) 비전이 이를 IT에 명시적으로 적용했는데, 그 핵심 모델이 **MAPE-K 루프**다 — Monitor(감시) → Analyze(분석) → Plan(계획) → Execute(실행), 그리고 이 넷이 공유하는 Knowledge(지식). 오늘 다루는 모든 AWS 자동 복구는 사실상 MAPE-K의 구현이다.

> 💡 **관련 이론**: 자동 복구를 설계할 때 **개방 루프(open-loop)와 폐쇄 루프(closed-loop) 제어**의 차이를 의식해야 한다. 개방 루프는 "Alarm이 울리면 무조건 재시작"처럼 결과를 다시 측정하지 않고 동작만 한다 — 토스터가 시간만 보고 빵의 상태를 안 보는 것과 같다. 폐쇄 루프는 동작 후 결과를 재측정해 "정말 나아졌나"를 확인하고, 아니면 다시 행동한다(앞 다이어그램의 Verify 단계). 미성숙한 자동 복구는 개방 루프라 "재시작 → 여전히 실패 → 또 재시작"을 무한 반복하다 자원을 소진한다. 성숙한 자동 복구는 폐쇄 루프이며, 여기서 **이력현상(hysteresis)**이 중요해진다 — 임계값을 한 번 넘었다고 즉시 반대로 튀지 않게, 켜는 임계값과 끄는 임계값을 다르게 둬서(에어컨이 26도에 켜고 24도에 끄듯) 경계선에서의 떨림(flapping)을 막는다. CloudWatch Alarm의 `evaluation-periods`와 `datapoints-to-alarm`이 바로 이 이력현상을 구현한다.

> 🔍 **더 깊이**: AWS의 자동 복구는 계층이 셋이며, 각 계층은 다른 추상화 수준에서 같은 MAPE-K 루프를 돈다. **(1) 플랫폼 내장 복구** — ASG의 ELB health check, ECS task health check, EC2 `StatusCheckFailed_System → ec2:recover`처럼 AWS가 루프를 통째로 관리한다. 사용자는 임계값만 정한다. **(2) 선언적 복구** — SSM Automation Runbook으로 "이런 증상엔 이런 절차"를 코드로 선언하고 EventBridge가 트리거한다. **(3) 명령형 복구** — Lambda로 임의 로직을 짠다. 가장 유연하지만 안전망(Cooldown·Bounded·Idempotent)을 직접 구현할 책임이 생긴다. 설계 원칙은 "가능한 한 낮은 계층을 쓰라"다 — 플랫폼 내장으로 되는 일을 Lambda로 짜면, AWS가 이미 검증한 폐쇄 루프 제어를 버리고 직접 버그를 만들 위험을 떠안는다. 시험에서 "EC2 하드웨어 장애 자동 복구"의 답이 Lambda가 아니라 `ec2:recover`인 이유가 이것이다.

## 복구 패턴의 분류학 — 무엇을 되돌릴 것인가

복구 동작은 "무엇을 조작하는가"로 나뉜다. 이 분류를 머릿속에 가지고 있으면 시나리오에서 정답 패턴을 즉시 고를 수 있다.

| 패턴 | 조작 대상 | AWS 구현 | 회복 대상 장애 |
|------|----------|----------|----------------|
| **재시작 (Restart)** | 프로세스/인스턴스 상태 | EC2 Reboot, ECS Task 강제 교체, Lambda 재호출 | 일시적 메모리 누수, 데드락 |
| **자원 교체 (Replace)** | 인스턴스 자체 | ASG ReplaceUnhealthy, ECS ForceNewDeployment | 손상된 노드, 디스크 불량 |
| **격리 (Quarantine)** | 네트워크 경로 | SG 교체, ALB deregister, NACL | 보안 침해, 오염된 노드 |
| **스케일 (Scale)** | 용량 | ASG/App Auto Scaling desired count↑ | 부하 폭증 |
| **페일오버 (Failover)** | 트래픽 라우팅 | Route 53 health check, RDS Multi-AZ | AZ/리전 장애 |
| **회로 차단 (Circuit Break)** | 의존성 호출 | 외부 호출 일시 중단 | 다운스트림 연쇄 장애 |

재시작과 교체의 차이가 핵심 시험 포인트다. **재시작**은 같은 자원을 되살리는 것이고(상태가 일시적으로 망가진 경우), **교체**는 그 자원을 버리고 새것을 띄우는 것이다(자원 자체가 손상된 경우). 클라우드 네이티브의 철학은 "고치지 말고 교체하라"(cattle, not pets — 가축이지 애완동물이 아니다)에 가깝다. 인스턴스를 디버깅해 살려내려 애쓰는 대신, 죽이고 새로 띄우는 것이 더 빠르고 결정론적이다.

> 📚 **사례**: 2017년 2월 28일, **AWS S3 us-east-1 대규모 장애**(약 4시간)는 자동화가 사람보다 빠르고 광범위하게 잘못 작동하면 어떤 일이 벌어지는지를 보여준 정전(canon)급 사례다. 엔지니어가 청구 시스템 디버깅 중 플레이북의 명령을 실행했는데, 의도보다 많은 수의 서버를 제거했다. 제거된 서버에는 S3 인덱스 서브시스템과 배치 서브시스템의 핵심 용량이 포함돼 있었고, 이 서브시스템을 재시작하는 데 예상보다 오래 걸리면서 us-east-1의 S3가 멈췄다. S3에 의존하던 수많은 서비스(심지어 AWS 자신의 상태 대시보드까지)가 연쇄로 무너졌다. **교훈 세 가지**: 첫째, 한 명령이 영향을 줄 수 있는 자원의 양에 **상한(bounded action)**이 없었다 — 이후 AWS는 용량이 특정 안전선 아래로 내려가지 못하게 가드레일을 넣었다. 둘째, 핵심 서브시스템이 그렇게 오래 재시작이 안 될 줄 몰랐다 — 즉 **재시작 경로를 평소에 검증(Game Day)하지 않았다**. 셋째, 상태 대시보드가 S3에 의존한 것은 **장애 도메인 격리** 실패였다. 이 사고가 오늘 다루는 Bounded Action·FIS 검증·blast radius 최소화 원칙이 왜 필수인지를 증명한다.

## ASG와 EC2 — 플랫폼이 도는 폐쇄 루프

가장 견고한 자동 복구는 직접 짜지 않은 것이다. ASG의 health check는 AWS가 관리하는 완전한 폐쇄 루프다.

```bash
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name myapp \
  --health-check-type ELB \
  --health-check-grace-period 300
```

`health-check-type ELB`는 EC2의 기본 status check 대신 ELB가 보내는 애플리케이션 레벨 헬스체크(HTTP 200 등)를 신뢰하라는 뜻이다. EC2 status check는 "인스턴스가 켜져 있나"만 보지, "앱이 실제로 응답하나"는 모른다 — 그래서 OS는 살아 있는데 앱이 행(hang)된 좀비 인스턴스를 ELB 헬스체크라야 잡는다. `grace-period 300`은 새 인스턴스 부팅·앱 기동 동안 헬스체크를 무시하는 유예 시간이다. 이게 없으면 부팅 중인 멀쩡한 인스턴스를 "unhealthy"로 오판해 죽이고, 다시 띄우고, 또 죽이는 **재기동 루프**에 빠진다.

EC2 자체 인프라 장애(하부 하드웨어 고장)는 별도 메커니즘이다.

```bash
aws cloudwatch put-metric-alarm --alarm-name EC2Recover \
  --metric-name StatusCheckFailed_System \
  --namespace AWS/EC2 --statistic Maximum --period 60 \
  --evaluation-periods 2 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=InstanceId,Value=i-xxx \
  --alarm-actions arn:aws:automate:ap-northeast-2:ec2:recover
```

`StatusCheckFailed_System`은 AWS 측 인프라(호스트 하드웨어, 네트워크) 문제를 가리키고, `ec2:recover`는 인스턴스를 **같은 ID·같은 ENI·같은 IP·같은 EBS로** 건강한 하드웨어에 다시 띄운다. 인스턴스 스토어(ephemeral) 데이터는 잃지만 네트워크 정체성은 보존된다.

> ⚠️ **함정**: `StatusCheckFailed_System`(AWS 인프라 장애, `ec2:recover`로 해결)과 `StatusCheckFailed_Instance`(OS·앱·네트워크 설정 등 인스턴스 내부 문제, recover로 해결 안 됨)를 혼동하지 마라. 내부 문제는 recover가 아니라 reboot/replace가 답이다. 또한 `evaluation-periods 2`처럼 1회가 아닌 연속 다회 위반을 요구하는 것은 의도된 이력현상이다 — 단발성 측정 잡음(metric noise)에 반응해 멀쩡한 인스턴스를 건드리지 않게 한다. 시험에서 "왜 자동 복구가 너무 자주 트리거되나"의 답은 종종 "evaluation-periods가 너무 짧거나 1이다"이다.

## 안전망의 3대 기둥 — Idempotent, Cooldown, Bounded Action

자동 복구의 위험은 "복구가 안 되는 것"이 아니라 "복구가 폭주하는 것"이다. 제어 이론으로 말하면 **양성 피드백 루프**(positive feedback loop)에 빠지는 것 — 동작이 문제를 키우고, 커진 문제가 더 큰 동작을 부른다. 이를 막는 세 안전장치가 시험의 단골이다.

| 원칙 | 막는 실패 모드 | 구현 |
|------|---------------|------|
| **Idempotent (멱등)** | 같은 알람의 중복 전달로 동작 2회 실행 | 이벤트 ID/상태 기반 중복 차단 |
| **Cooldown (냉각)** | 같은 대상을 짧은 간격으로 반복 처리 | DynamoDB에 lastActionTime 기록 |
| **Bounded Action (상한)** | 한 번에 너무 많은 자원을 건드림 | "한 트리거당 최대 N개" 카운터 |

```python
import boto3, os, time
ec2 = boto3.client('ec2')
cooldown = boto3.resource('dynamodb').Table(os.environ['COOLDOWN_TABLE'])
COOLDOWN_SECONDS = 1800   # 30분 — magic number 금지, 상수로
MAX_QUARANTINE_PER_RUN = 3  # Bounded Action 상한

def handler(event, context):
    detail = event['detail']
    instance_id = detail['resource']['instanceDetails']['instanceId']
    now = int(time.time())

    # 1) Cooldown: 같은 인스턴스를 30분 내 재처리 금지
    last = cooldown.get_item(Key={'instanceId': instance_id}).get('Item')
    if last and now - int(last['lastAt']) < COOLDOWN_SECONDS:
        print(f'Cooldown active for {instance_id}, skip')
        return

    # 2) Idempotent: 조건부 쓰기로 동시 중복 실행 차단
    try:
        cooldown.put_item(
            Item={'instanceId': instance_id, 'lastAt': now},
            ConditionExpression='attribute_not_exists(instanceId) OR lastAt < :cutoff',
            ExpressionAttributeValues={':cutoff': now - COOLDOWN_SECONDS})
    except cooldown.meta.client.exceptions.ConditionalCheckFailedException:
        print('Concurrent run already handled this, skip')
        return

    # 3) 격리 동작 (Bounded Action은 호출자/Step Functions Map에서 N 제한)
    ec2.modify_instance_attribute(InstanceId=instance_id, Groups=['sg-quarantine'])

    boto3.client('sns').publish(
        TopicArn=os.environ['ONCALL_TOPIC'],
        Subject=f'Quarantined {instance_id}',
        Message=str(detail))   # Alert backup: 자동화가 무엇을 했는지 사람도 안다
```

> 💡 **관련 이론**: **멱등성(idempotency)**은 분산 시스템의 근본 개념으로, "같은 연산을 여러 번 적용해도 결과가 한 번 적용한 것과 같다"는 수학적 성질(f(f(x)) = f(x))이다. HTTP에서 GET·PUT·DELETE가 멱등으로 정의되고(RFC 9110, HTTP Semantics), POST는 비멱등이다. 자동 복구가 멱등해야 하는 이유는 EventBridge·CloudWatch가 모두 **at-least-once 전달**을 하기 때문이다 — 같은 알람이 두 번 전달될 수 있고, 멱등하지 않으면 격리를 두 번 하거나 스케일을 두 배로 하는 부작용이 터진다. 위 코드의 DynamoDB `ConditionExpression`은 멱등성을 **낙관적 동시성 제어**(optimistic concurrency control)로 강제하는 표준 패턴이며, AWS Lambda Powertools의 Idempotency 유틸리티가 이를 데코레이터로 추상화한 것이다.

> 🔍 **더 깊이**: Cooldown과 Bounded Action은 사실 **레이트 리미팅**(rate limiting)의 두 변종이다 — Cooldown은 "시간축" 제한(같은 키를 T초에 1회), Bounded Action은 "공간축" 제한(한 트리거가 건드릴 자원 수). 둘을 합치면 자동화의 처리량에 상한이 생겨, 오작동해도 피해(blast radius)가 유계(bounded)로 남는다. 더 정교한 형태가 **토큰 버킷**(token bucket) 알고리즘인데, 평상시엔 버스트를 허용하되 장기 평균 속도를 제한한다 — 진짜 대규모 장애(수백 노드 동시 unhealthy)에선 빠르게 대응하되, 오작동으로 인한 무한 루프는 버킷이 비면 멈춘다. 자동 복구 시스템에 "이번 1시간 동안 전체 ASG의 20% 이상은 절대 교체하지 않는다" 같은 글로벌 상한을 두는 것이 2017 S3 사고가 남긴 교훈의 직접적 구현이다.

## Circuit Breaker — 전기 차단기에서 빌린 연쇄 장애 방지

마이크로서비스에서 한 다운스트림이 느려지면, 그를 호출하던 모든 스레드가 응답을 기다리며 묶이고, 묶인 스레드가 소진되면 상위 서비스도 멈추고, 이것이 위로 번지며 전체가 무너진다 — **연쇄 장애**(cascading failure)다. **Circuit Breaker** 패턴은 전기 회로의 차단기에서 이름을 빌렸다. 과전류가 흐르면 차단기가 회로를 끊어 화재를 막듯, 다운스트림 실패율이 임계를 넘으면 호출 자체를 끊어 즉시 실패(fail fast)시킨다.

```
[Closed] ──실패율 임계 초과──▶ [Open] ──타임아웃 경과──▶ [Half-Open]
   ▲           정상 호출 통과         즉시 실패(빠른 실패)      시험 호출 1개
   │                                                              │
   └──────────────── 시험 호출 성공 ◀──────────────────────────────┘
                     (실패하면 다시 Open으로)
```

세 상태가 핵심이다. **Closed**는 정상 — 호출이 통과한다. 실패가 쌓여 임계를 넘으면 **Open**으로 전환, 일정 시간 모든 호출을 즉시 거부한다(다운스트림에 회복할 숨통을 준다). 타임아웃 후 **Half-Open**으로 가 시험 호출 하나만 보내보고, 성공하면 Closed로 복귀, 실패하면 다시 Open이다. AWS에서 **ECS Deployment Circuit Breaker**가 이 패턴을 배포에 적용한 것이다 — 새 태스크가 계속 헬스체크에 실패하면 배포를 자동 중단하고 직전 정상 버전으로 롤백한다.

> 📚 **사례**: Circuit Breaker를 대중화한 것은 **Netflix의 Hystrix**(2012년 오픈소스)다. Netflix는 수백 개 마이크로서비스가 서로 호출하는 구조라, 하나의 느린 의존성이 전체 스트리밍을 마비시킬 수 있었다. Hystrix는 각 의존성 호출을 별도 스레드 풀로 격리(bulkhead 패턴)하고 Circuit Breaker로 감싸, 한 서비스의 장애가 격벽 너머로 번지지 못하게 했다. 이 패턴은 Martin Fowler가 2014년 글로 정전화했고, 이후 resilience4j·Polly 등으로 확산됐다. 교훈: 자동 복구는 "고치는 것"만이 아니라 "더 번지지 못하게 끊는 것"도 포함한다 — 때로는 가장 빠른 복구가 의존성을 잠시 포기하고 graceful degradation(품질 저하 운영)으로 버티는 것이다.

## 복잡한 복구는 워크플로로 — Step Functions

단순 복구(격리, 재시작)는 Lambda 하나로 충분하지만, "RDS 페일오버 → 페일오버 완료 대기 → 캐시 무효화 → 헬스체크 확인 → Slack 보고 → 티켓 생성"처럼 **분기·대기·재시도·보상**이 얽힌 복구는 Lambda 한 함수에 욱여넣으면 안 된다. Lambda는 최대 15분 제한이 있고, 중간 상태를 잃으며, 재시도 로직을 직접 짜야 한다. **Step Functions**가 답이다.

```
[탐지] → [RDS Failover] → [Wait 60s] → [Verify Health]
                                            │
                          ┌─────건강함──────┴──────실패───────┐
                          ▼                                    ▼
                   [Invalidate Cache]                    [Escalate to Human]
                          ▼                                    │
                   [Notify Slack] ◀────────────────────────────┘
                          ▼
                   [Create Ticket]
```

Step Functions는 각 단계에 `Retry`(백오프 포함)와 `Catch`(실패 시 보상 트랜잭션)를 선언적으로 붙일 수 있고, 워크플로 상태를 서비스가 보존하며, 실행 이력이 시각화돼 사후 분석이 쉽다. 이는 **Saga 패턴**(분산 트랜잭션을 보상 가능한 단계들로 쪼갠 것)의 자연스러운 구현이기도 하다.

> 🎯 **시나리오**: "GuardDuty가 Critical 위협(예: 침해된 EC2가 암호화폐 채굴 C2 서버와 통신)을 탐지하면, 해당 인스턴스를 자동 격리하고, 포렌식용 스냅샷을 뜨고, Slack에 알린 뒤, **사람의 승인을 받아야** 인스턴스를 종료하는 흐름"을 만들라. → EventBridge가 GuardDuty Finding을 패턴 매칭(`severity ≥ 7`)해 **SSM Automation Runbook** 또는 Step Functions를 트리거한다. 격리(SG 교체)와 스냅샷은 자동(`aws:executeAwsApi`), 종료 전에는 사람 게이트(`aws:approve` 또는 Step Functions의 콜백 패턴)를 넣는다. 핵심 설계 판단: **되돌릴 수 있는 동작(격리)은 자동, 되돌릴 수 없는 동작(종료)은 사람 승인** 뒤에 둔다 — 자동화의 blast radius를 비가역 작업에서 제한하는 원칙이다.

## 자동화의 검증 — Game Day와 FIS

자동 복구 로직의 가장 큰 위험은 "쓸 일이 없어서 녹슨다"는 점이다. 평소엔 트리거되지 않다가, 진짜 장애 때 처음 작동하는데 그때 버그가 드러난다(2017 S3 사고의 재시작 경로가 정확히 이랬다). 그래서 **카오스 엔지니어링**(chaos engineering) — 일부러 장애를 주입해 자동화가 작동하는지 정기 검증 — 이 필수다.

AWS **FIS**(Fault Injection Service)가 이를 관리형으로 제공한다. EC2 종료, CPU/메모리 스트레스, 네트워크 지연·차단, API 에러 주입, AZ 장애 시뮬레이션을 안전하게(중단 조건 alarm 포함) 실행한다. **Game Day**는 팀이 모여 의도적 장애를 주입하고 자동 복구·알림·런북·사람 대응을 통째로 리허설하는 행사다.

> 💡 **관련 이론**: 카오스 엔지니어링은 **Netflix Chaos Monkey**(2011)에서 시작됐다. 핵심 철학은 "장애는 일어날 것이므로, 통제된 환경에서 미리 일으켜 시스템의 약점을 평시에 발견하자"다. 이는 소프트웨어 공학의 "테스트는 코드가 작동함을 증명하는 게 아니라 결함을 드러내는 것"이라는 Dijkstra의 통찰을 운영 영역으로 확장한 것이다. AWS Well-Architected Framework의 **신뢰성 기둥**(Reliability Pillar)도 "정기적으로 전체 워크로드 장애를 테스트하라(REL12)"를 명시한다. 자동 복구를 만들었다면 FIS로 그것이 정말 작동하는지 증명하기 전까지는, 그것은 작동하는 자동화가 아니라 작동할 것이라 믿는 코드일 뿐이다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **자동 복구는 제어 이론의 폐쇄 루프 제어기**(MAPE-K)이며, MTTR을 줄이는 것이 MTBF를 늘리는 것보다 비용 효율적이라 현대 운영의 무게중심이 됐다. 둘째, **복구 패턴은 재시작·교체·격리·스케일·페일오버·회로차단**으로 분류되고, "고치지 말고 교체하라"는 클라우드 네이티브 철학이 핵심이다. 셋째, **플랫폼 내장 복구(ASG·`ec2:recover`)를 우선**하고 Lambda 명령형 복구는 안전망을 직접 져야 하므로 최후의 수단이다. 넷째, **안전망 3대 기둥은 Idempotent·Cooldown·Bounded Action**으로, 양성 피드백 루프와 blast radius 폭주를 막으며 2017 S3 사고가 그 필요성을 증명했다. 다섯째, **복잡한 복구는 Step Functions(Saga)**, 연쇄 장애는 Circuit Breaker로 끊고, 모든 자동화는 **FIS Game Day로 정기 검증**해야 한다.

다음 글에서는 자동화가 사람과 만나는 접점 — **ChatOps와 Incident Manager**, 즉 자동 복구가 처리하지 못한 인시던트를 사람 조직으로 어떻게 넘기는지를 깊이 본다.

---

## 📝 연습 문제

**문제 1.** 가용성을 높이기 위한 투자를 결정해야 한다. 같은 비용이라면 MTBF(평균 무고장 시간)를 늘리는 것과 MTTR(평균 복구 시간)을 줄이는 것 중 일반적으로 더 효율적인 쪽과, 그 이유로 옳은 것은?

A) MTBF↑ — 장애를 아예 없애는 것이 근본 해결이라 언제나 우월하다

B) MTTR↓ — 가용성 = MTBF/(MTBF+MTTR)에서 복구 자동화는 비교적 낮은 한계 비용으로 큰 가용성 개선을 주며, 인간 대응 시간이 MTTR의 대부분이라 자동화 여지가 크다

C) 둘은 가용성 식에 동일하게 기여하므로 차이가 없다

D) MTBF↑ — MTTR은 사람 손에 달려 자동화가 불가능하다

**정답: B**

해설: 가용성 = MTBF/(MTBF+MTTR)이다. MTBF를 늘리는 것(고장을 더 드물게)은 하드웨어 이중화·정밀 테스트 등 한계 비용이 가파르게 치솟지만, MTTR을 줄이는 것은 자동 복구로 인간 루프(페이지 수신·각성·로그 분석·명령 입력)를 잘라내면 비교적 싸게 큰 개선을 준다. 그래서 현대 운영의 무게중심이 auto-healing으로 이동했다. MTTR은 자동화 불가(D)가 아니라 오히려 자동화의 1차 표적이며, 둘의 기여가 동일(C)하다는 것도 비용 곡선을 무시한 오해다.

---

**문제 2.** 자동 복구 Lambda가 같은 알람의 중복 전달로 인해 한 인스턴스를 두 번 격리하고, 짧은 간격으로 반복 트리거되며 자원을 소진한다. 폭주를 막는 3대 안전망의 조합으로 가장 올바른 것은?

A) RetryPolicy를 0으로 설정하고 DLQ를 제거

B) Idempotent(이벤트/상태 기반 중복 차단) + Cooldown(DynamoDB lastActionTime) + Bounded Action(트리거당 최대 N개 상한)

C) Lambda 동시성을 1로 고정

D) CloudWatch Alarm을 삭제하고 수동 대응으로 전환

**정답: B**

해설: 자동 복구의 진짜 위험은 양성 피드백 루프(동작이 문제를 키우는)와 blast radius 폭주다. 이를 막는 3대 기둥은 멱등성(at-least-once 전달로 같은 알람이 두 번 와도 결과가 1회와 동일 — DynamoDB ConditionExpression/Lambda Powertools Idempotency), Cooldown(같은 대상을 T초 내 재처리 금지 — 시간축 레이트 리밋), Bounded Action(한 트리거가 건드릴 자원 수 상한 — 공간축 제한)이다. 동시성 1 고정(C)은 처리량을 죽이고 멱등성·Cooldown을 대체하지 못하며, RetryPolicy 0(A)은 일시 실패 시 유실을 부른다. 이 설계가 2017 S3 사고의 직접 교훈이다.

---

**문제 3.** EC2 인스턴스가 하부 호스트 하드웨어 장애로 응답하지 않는다. 같은 IP·ENI·EBS를 유지하며 건강한 하드웨어로 자동 복구하려 한다. 올바른 구성은?

A) Lambda가 매번 인스턴스를 종료하고 새로 생성

B) `StatusCheckFailed_System` 메트릭 알람 + `ec2:recover` 알람 액션

C) `StatusCheckFailed_Instance` 알람 + `ec2:recover` 액션

D) ASG에 넣고 health-check-type을 EC2로 설정

**정답: B**

해설: `StatusCheckFailed_System`은 AWS 측 인프라(호스트 하드웨어·네트워크) 장애를 가리키고, `ec2:recover` 액션은 인스턴스를 같은 ID·ENI·IP·EBS로 건강한 하드웨어에 다시 띄운다(인스턴스 스토어 데이터만 손실). 이는 플랫폼 내장 폐쇄 루프라 Lambda 직접 구현(A)보다 검증되고 안전하다. `StatusCheckFailed_Instance`(C)는 OS·앱·네트워크 설정 등 인스턴스 내부 문제로, recover로 해결되지 않으며 reboot/replace가 답이다. 시스템 장애와 인스턴스 장애의 구분이 시험의 핵심 포인트다.

---

**문제 4.** "RDS 페일오버 → 완료 대기 → 캐시 무효화 → 헬스체크 확인 → 실패 시 사람 에스컬레이션, 성공 시 Slack 보고 + 티켓 생성"처럼 분기·대기·재시도·보상이 얽힌 복구를 구성하려 한다. 가장 적합한 것은?

A) 단일 Lambda 함수에 모든 단계를 if-else와 sleep으로 구현

B) Step Functions State Machine — 각 단계에 Retry/Catch, 상태 보존, Saga 보상

C) EventBridge Rule 여러 개를 체인으로 연결

D) cron으로 매 분 폴링하는 Lambda

**정답: B**

해설: 분기·대기·재시도·보상이 얽힌 워크플로는 Step Functions가 적합하다 — 각 단계에 Retry(백오프)와 Catch(보상 트랜잭션)를 선언적으로 붙이고, 워크플로 상태를 서비스가 보존하며, 실행 이력이 시각화돼 사후 분석이 쉽다. 이는 분산 트랜잭션을 보상 가능한 단계로 쪼갠 Saga 패턴의 구현이다. 단일 Lambda(A)는 15분 제한·상태 유실·수동 재시도 로직 문제가 있고, sleep으로 대기하면 비용·타임아웃이 터진다. EventBridge 체인(C)은 분기/대기/보상 표현이 빈약하다.

---

**문제 5.** 마이크로서비스에서 한 다운스트림 의존성이 느려지자 이를 호출하던 스레드가 모두 묶이고, 그 여파가 상위 서비스로 번져 전체가 멈췄다. 이 연쇄 장애를 끊는 표준 패턴은?

A) 모든 서비스의 타임아웃을 무한대로 늘려 대기

B) Circuit Breaker — 실패율 임계 초과 시 호출을 끊어 즉시 실패(fail fast), Half-Open으로 회복 시험

C) 의존성 호출을 재시도 횟수 무제한으로 설정

D) 모든 인스턴스를 동시에 재시작

**정답: B**

해설: 연쇄 장애(cascading failure)는 느린 의존성이 호출자의 스레드/리소스를 소진시키며 위로 번지는 현상이다. Circuit Breaker는 전기 차단기에서 빌린 패턴으로, 다운스트림 실패율이 임계를 넘으면 회로를 Open으로 전환해 호출을 즉시 거부(fail fast)하고 다운스트림에 회복 시간을 준다. 타임아웃 후 Half-Open으로 시험 호출 1개를 보내 성공하면 Closed로 복귀한다(Netflix Hystrix가 대중화). 타임아웃 무한대(A)·재시도 무제한(C)은 오히려 스레드 소진을 가속한다. 때로는 가장 빠른 복구가 의존성을 잠시 끊고 graceful degradation으로 버티는 것이다.

---

**문제 6.** 운영팀이 자동 복구 로직을 만들었지만, 진짜 장애가 처음 발생했을 때 그 로직에 버그가 있어 작동하지 않았다. 이런 "녹슨 자동화"를 평시에 발견하기 위한 표준 접근은?

A) 자동화 코드를 더 많이 작성해 모든 경우를 커버

B) AWS FIS(Fault Injection Service)로 정기적으로 장애를 주입하고 Game Day로 자동 복구·알림·런북을 리허설(카오스 엔지니어링)

C) 프로덕션에서 자동화를 비활성화하고 수동 대응만 유지

D) 로그 보존 기간을 늘림

**정답: B**

해설: 자동 복구의 큰 위험은 평소 트리거되지 않아 녹슬고, 진짜 장애 때 처음 작동하다 버그가 드러나는 것이다(2017 S3 사고의 재시작 경로가 그랬다). 카오스 엔지니어링은 "장애는 일어날 것이므로 통제된 환경에서 미리 일으켜 약점을 발견하자"는 철학(Netflix Chaos Monkey 시초)으로, AWS FIS가 EC2 종료·리소스 스트레스·네트워크 장애·AZ 장애를 안전하게(중단 조건 포함) 주입한다. Game Day는 팀이 모여 전체 대응을 리허설하는 행사다. Well-Architected 신뢰성 기둥(REL12)도 정기 장애 테스트를 명시한다.

---

**문제 7.** GuardDuty가 침해된 EC2를 탐지했다. 격리(SG 교체)와 포렌식 스냅샷은 자동으로, 인스턴스 종료는 사람 승인 후 실행하려 한다. 이런 설계 판단의 핵심 원칙은?

A) 모든 동작을 자동화해 MTTR을 0으로 만든다

B) 되돌릴 수 있는 동작(격리·스냅샷)은 자동, 되돌릴 수 없는 동작(종료)은 사람 승인 게이트 — 비가역 작업에서 blast radius를 제한

C) 모든 동작에 사람 승인을 요구해 안전성을 극대화

D) 종료를 먼저 자동 실행하고 사후에 보고

**정답: B**

해설: 자동화 설계의 핵심 판단은 동작의 가역성(reversibility)에 따라 자동/수동을 가르는 것이다. 격리(SG 교체)는 잘못돼도 원복 가능하므로 자동화해 빠르게 위협을 차단하고, 종료는 비가역(데이터·증거 소실)이므로 사람 승인 게이트(SSM `aws:approve` 또는 Step Functions 콜백)를 둔다. 이는 자동화의 blast radius를 비가역 작업에서 제한하는 원칙이다. 전부 자동(A)은 오탐 시 비가역 피해를 키우고, 전부 수동(C)은 자동화 이점을 버린다. 종료 선실행(D)은 최악의 비가역 오류다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 자동 복구는 제어 이론의 폐쇄 루프 제어기(IBM Autonomic Computing의 MAPE-K)이며, 가용성 식에서 MTTR↓가 MTBF↑보다 비용 효율적이라 현대 운영의 중심이 됐다. 둘째, 복구 패턴은 재시작·교체·격리·스케일·페일오버·회로차단으로 나뉘고, "고치지 말고 교체하라"(cattle not pets)가 클라우드 네이티브 철학이며, 플랫폼 내장 복구(ASG ELB health check, `StatusCheckFailed_System`→`ec2:recover`)를 명령형 Lambda보다 우선한다. 셋째, 안전망 3대 기둥은 멱등성(at-least-once 전달 대비)·Cooldown(시간축 레이트 리밋)·Bounded Action(공간축 상한)으로, 양성 피드백 루프와 blast radius 폭주를 막으며 2017 S3 us-east-1 사고가 그 필요성을 증명했다. 넷째, 연쇄 장애는 Circuit Breaker(Closed→Open→Half-Open, Netflix Hystrix)로 끊고, 복잡한 복구는 Step Functions(Saga 보상)로 오케스트레이션한다. 다섯째, 자동화는 FIS 카오스 엔지니어링과 Game Day로 정기 검증해야 진짜 작동하는 자동화이며, 비가역 동작(종료)은 사람 승인 게이트 뒤에 둔다(REL12).
