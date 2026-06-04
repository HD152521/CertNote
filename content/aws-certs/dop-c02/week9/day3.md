# Day 3 - AppConfig: 코드 배포 없이 동작을 바꾸는 기술

배포는 위험하다. 새 코드를 prod에 올리는 순간 무슨 일이 벌어질지 완전히는 알 수 없고, 문제가 생기면 롤백이라는 또 다른 배포를 해야 한다. 그런데 가만히 들여다보면, 우리가 prod에서 바꾸고 싶은 것의 상당수는 코드 자체가 아니다. "이 신기능을 켤까 끌까", "재시도 횟수를 3으로 할까 5로 할까", "이 프로모션을 사용자의 10%에게만 보여줄까". 이런 것들은 동작(behavior)의 변경이지 로직(logic)의 변경이 아니다. 그런데 전통적으로는 이 작은 동작 변경 하나를 위해서도 전체 코드 재배포를 거쳐야 했다.

AppConfig는 이 매듭을 푼다. **구성을 코드에서 분리해 외부 데이터로 만들고(configuration as data)**, 그 데이터를 코드 재배포 없이 점진적으로 바꾼다. 피처 플래그를 켜고, 임계값을 조정하고, 프로모션을 일부 사용자에게만 노출하는 일이 git push나 Lambda 재배포 없이 일어난다. 오늘은 이 configuration-as-data가 왜 강력한지, AppConfig의 5요소 구조가 왜 그렇게 나뉘었는지, 배포 전 검증(Validator)과 배포 중 자동 롤백(Monitor)이 어떻게 "구성 변경"을 "코드 배포만큼 안전하게" 만드는지, 그리고 Lambda Extension이 localhost:2772라는 작은 트릭으로 비용과 지연을 어떻게 줄이는지를 본다. DOP 시험에서 "코드 배포 없이 기능 on/off", "10%→100% 점진 활성 + 알람 시 자동 롤백"은 거의 항상 AppConfig가 정답이다.

## Configuration as Data — 코드와 구성의 분리

소프트웨어에서 "무엇을 코드에 넣고 무엇을 구성으로 뺄 것인가"는 오래된 질문이다. 자주 바뀌고, 배포 없이 바꾸고 싶고, 환경마다 다른 값은 구성으로 빼는 게 원칙이다. 12-Factor App 방법론이 "구성을 환경에 저장하라(store config in the environment)"고 못 박은 것도 같은 맥락이다.

그런데 환경 변수는 한계가 있다. 환경 변수를 바꾸려면 프로세스를 재시작해야 하고(=재배포), 점진적 적용이 안 되며(전부 한꺼번에 바뀜), 잘못된 값을 넣어도 막아주는 검증이 없다. AppConfig는 구성을 "환경 변수"가 아니라 "런타임에 동적으로 가져오는 외부 데이터"로 끌어올린다. 애플리케이션은 시작 시점이 아니라 실행 중에 주기적으로 구성을 polling해 최신 값을 반영한다. 재시작 없이 동작이 바뀐다.

이게 **피처 플래그(feature flag/toggle)**의 토대다. 코드에는 분기만 심어두고(`if flag.enabled`), 그 분기의 켜짐/꺼짐을 외부 구성으로 통제한다. 새 기능 코드를 미리 prod에 배포해두되 플래그로 꺼둔 채로 두고(dark launch), 준비가 되면 플래그만 켜서 활성화한다. 배포와 출시(release)가 분리된다 — 이것이 현대 지속적 배포의 핵심 기법이다.

> 💡 **관련 이론**: 배포(deploy)와 출시(release)의 분리는 트렁크 기반 개발과 지속적 배포의 핵심 원리다. Martin Fowler의 글에서 정립된 개념으로, 코드를 prod에 올리는 것(deploy)과 사용자에게 기능을 노출하는 것(release)을 별개의 행위로 본다. 피처 플래그가 이 분리를 가능하게 한다. 미완성 기능도 플래그로 끈 채 trunk에 머지하고 배포할 수 있어 long-lived 브랜치의 머지 지옥을 피한다. AppConfig는 이 피처 플래그를 관리형 서비스로 제공하면서, 단순 on/off를 넘어 점진적 롤아웃과 자동 롤백까지 얹었다.

> ⚠️ **함정**: 피처 플래그는 강력하지만 관리하지 않으면 기술 부채가 된다. 출시가 끝난 기능의 플래그를 제거하지 않고 방치하면, 코드에 `if oldFlag ... else if newFlag ...` 같은 분기가 누적되어 모든 경로의 조합을 테스트하기가 불가능해진다. 플래그 하나당 코드 경로가 2배로 늘어나므로 N개 플래그는 최대 2^N 조합을 만든다. AppConfig의 피처 플래그 형식에 `_deprecation` 메타데이터가 있는 이유가 이것 — 수명이 다한 플래그를 추적해 제거하라는 신호다. "임시 플래그"가 "영구 플래그"가 되는 순간 부채가 시작된다.

## AppConfig 5요소 — 왜 이렇게 나뉘었나

AppConfig를 처음 보면 구조가 복잡하게 느껴진다. 배포 한 번을 위해 Application, Environment, ConfigurationProfile, ConfigurationVersion, DeploymentStrategy라는 다섯 개념이 다 필요하다. 왜 이렇게 잘게 쪼갰을까. 각각이 서로 다른 축의 변동성을 분리하기 위해서다.

```
Application (예: checkout-api)         ← 어떤 앱의 구성인가
  ├─ Environment (dev / staging / prod) ← 어느 환경에 배포하는가 (알람 모니터가 여기 붙음)
  └─ ConfigurationProfile (featureflags / app-settings) ← 무엇을 구성하는가 (Validator가 여기 붙음)
       └─ Hosted / SSM Parameter / S3 / Secrets Manager  ← 어디에 저장되나
```

- **Application**: 구성의 소유자(어느 서비스). 논리적 그룹.
- **Environment**: 배포 대상 환경. **CloudWatch 알람 모니터가 여기에 붙는다** — 환경마다 다른 알람으로 자동 롤백을 건다.
- **ConfigurationProfile**: 구성의 종류와 저장 위치, 그리고 **Validator가 여기에 붙는다**. Feature Flag 타입(구조화된 플래그)이나 Freeform 타입(임의 JSON/YAML)을 고른다.
- **ConfigurationVersion**: 구성의 특정 버전. 새 값을 만들 때마다 버전이 올라간다 — 롤백은 이전 버전으로 되돌리는 것이다.
- **DeploymentStrategy**: 어떻게 퍼뜨릴지(즉시/점진/카나리).

이 분리의 핵심은 **알람은 환경에, 검증은 구성 프로필에** 붙는다는 점이다. 같은 구성 프로필(featureflags)을 dev와 prod에 배포하더라도, prod 환경에만 엄격한 5xx 알람을 걸어 자동 롤백을 작동시킬 수 있다. 검증 로직(Validator)은 어느 환경이든 동일하게 적용된다 — 잘못된 형식은 dev든 prod든 막아야 하니까. 변동성의 축이 다른 것을 다른 개념에 분리해 담은 설계다.

> 🔍 **더 깊이**: ConfigurationProfile의 저장 백엔드(Hosted/SSM/S3/Secrets Manager)는 구성의 크기와 성격에 따라 고른다. **Hosted Configuration**은 AppConfig가 직접 버전 관리하는 가장 단순한 선택이고, 작은 피처 플래그/설정에 적합하다. **SSM Parameter**는 이미 Parameter Store를 쓰고 있을 때, **S3**는 10MB 가까운 큰 구성일 때, **Secrets Manager**는 비밀을 포함할 때 쓴다. 중요한 건 어느 백엔드든 AppConfig의 배포 전략·검증·롤백 메커니즘은 동일하게 적용된다는 점이다. AppConfig는 저장소가 아니라 "배포 오케스트레이터"다 — 값을 어디에 두든 그 값을 안전하게 점진 배포하는 게 본업이다.

## Deployment Strategy — 카나리의 수학

AppConfig가 단순 키-값 저장소와 결정적으로 다른 점이 Deployment Strategy다. 구성 변경을 한꺼번에 100% 적용하는 게 아니라, 시간을 두고 점진적으로 퍼뜨린다.

```bash
aws appconfig create-deployment-strategy \
  --name Canary10Percent20Minutes \
  --deployment-duration-in-minutes 20 \
  --growth-factor 10 --growth-type LINEAR \
  --final-bake-time-in-minutes 10 \
  --replicate-to NONE
```

이 숫자들의 의미를 정확히 보자. `growth-type LINEAR` + `growth-factor 10` + `duration 20`은 "20분에 걸쳐 매 단계 10%씩 선형 증가"를 뜻한다. polling하는 클라이언트 중 어느 비율이 새 구성을 받느냐가 시간에 따라 이렇게 움직인다.

```
LINEAR, growth-factor 10, duration 20분:
T+0분:  10% 클라이언트가 새 구성
T+2분:  20%
T+4분:  30%
...
T+18분: 100%
T+20분: 배포 완료 → final bake 시작
T+30분: bake 완료 (이 10분간 알람 감시, 발생 시 자동 롤백)
```

`growth-type EXPONENTIAL`로 바꾸면 증가가 지수적이다(2%→4%→8%→16%...). 초반엔 아주 적은 비율에만 노출해 위험을 최소화하고 뒤로 갈수록 빠르게 퍼진다. 카나리에 더 가까운 곡선이다. `final-bake-time-in-minutes 10`은 100% 도달 후에도 10분간 알람을 감시하는 숙성 시간이다 — 이 동안 문제 신호가 잡히면 자동 롤백된다.

| 사전 정의 전략 | 곡선 | 용도 |
|---------------|------|------|
| `AppConfig.AllAtOnce` | 즉시 100% | 비위험 변경, 빠른 적용 |
| `AppConfig.Linear50PercentEvery30Seconds` | 빠른 2단계 | dev/staging 빠른 검증 |
| `AppConfig.Canary10Percent20Minutes` | 보수적 점진 | prod 위험 변경 |

> 💡 **관련 이론**: 카나리 배포라는 이름은 탄광의 카나리(canary in a coal mine)에서 왔다. 광부들이 유독가스에 민감한 카나리를 데려가 새가 먼저 쓰러지면 위험을 감지했듯, 일부 트래픽(카나리)에 먼저 새 버전을 노출해 문제를 조기 감지한다. growth-factor와 duration은 "얼마나 천천히 노출 비율을 올릴 것인가"를 수치화한다. 노출 비율을 천천히 올릴수록 문제를 적은 영향으로 발견하지만 배포가 길어진다. 이건 통계적 검정력(statistical power)과도 연결된다 — 더 많은 트래픽이 새 버전을 거쳐야 5xx 같은 드문 이상이 통계적으로 유의하게 드러난다. 카나리 비율과 bake time은 "검출 신뢰도 vs 배포 속도"의 트레이드오프다.

> 🔍 **더 깊이**: AppConfig의 점진 롤아웃은 polling 기반이라 CodeDeploy의 트래픽 시프트와 메커니즘이 다르다. CodeDeploy는 로드밸런서 가중치를 조절해 "트래픽의 X%를 새 버전으로" 보낸다. AppConfig는 클라이언트가 polling할 때 "당신은 새 구성 그룹에 속하는가"를 AppConfig 서비스가 결정해 응답한다. 즉 트래픽 분배가 아니라 polling 클라이언트 집합의 분할이다. 그래서 AppConfig 점진 롤아웃은 같은 코드가 도는 여러 인스턴스/Lambda가 서로 다른 구성 값을 받는 상황을 만든다. 애플리케이션이 구성 값의 일시적 불일치(일부는 새 값, 일부는 옛 값)를 견딜 수 있어야 한다는 게 중요한 전제다.

## Validator와 Monitor — 구성 변경을 코드 배포만큼 안전하게

구성을 코드 배포 없이 바꾼다는 건 양날의 검이다. 빠르고 편하지만, CI/CD의 테스트·리뷰 게이트를 우회한다는 뜻이기도 하다. 누군가 `timeoutSec`에 실수로 `"thirty"`(문자열)를 넣거나 음수를 넣으면 어떻게 막을까. AppConfig는 두 겹의 안전장치로 이 우회의 위험을 메운다 — 배포 **전** 검증(Validator)과 배포 **중** 감시(Monitor).

**Validator**는 배포 시작 전에 구성을 자동 검증한다. 두 종류가 있다.

```json
// JSON Schema Validator — 형식·범위 검증
{
  "type": "object",
  "required": ["maxRetry", "timeoutSec"],
  "properties": {
    "maxRetry":   {"type": "integer", "minimum": 1, "maximum": 10},
    "timeoutSec": {"type": "integer", "minimum": 1, "maximum": 300}
  }
}
```

JSON Schema는 구성의 형식·필수 필드·값 범위를 선언적으로 검증한다. `timeoutSec`이 정수가 아니거나 300을 넘으면 배포가 시작조차 안 된다. 더 복잡한 비즈니스 규칙(예: "A 플래그가 켜지면 B는 반드시 꺼져야 한다")은 **Lambda Validator**가 구성 내용을 받아 SUCCESS/FAILURE를 반환하는 방식으로 검증한다.

**Monitor**는 배포 중·후에 CloudWatch 알람을 감시한다. Environment에 알람을 등록하면, 점진 배포 중이나 final bake 동안 그 알람이 ALARM 상태가 되는 순간 AppConfig가 **자동으로 이전 버전으로 롤백**한다.

```bash
aws appconfig update-environment \
  --application-id $APP_ID --environment-id $ENV_ID \
  --monitors '[
    {"AlarmArn":"arn:aws:cloudwatch:...:alarm:5xxErrorRate"},
    {"AlarmArn":"arn:aws:cloudwatch:...:alarm:LatencyHigh"}
  ]'
```

이 두 겹이 핵심이다. **Validator는 "잘못된 값이 들어가는 것"을 사전에 막고, Monitor는 "값은 맞지만 운영 지표를 악화시키는 것"을 사후에 잡는다.** 형식은 통과했지만 비즈니스적으로 나쁜 변경 — 예를 들어 `rolloutPercent: 100`으로 갑자기 전체에 노출했더니 5xx가 폭증하는 — 은 Monitor가 알람을 보고 자동으로 되돌린다. 코드 배포의 "테스트(사전) + 카나리 모니터링(사후)"과 정확히 같은 2단 방어를 구성 변경에도 적용한 것이다.

> 🎯 **시나리오**: "마케팅팀이 프로모션 배너를 코드 배포 없이 켜고 끄고 싶어 한다. 단, 잘못된 설정으로 결제 페이지 5xx가 늘면 자동으로 되돌아가야 한다." — 답은 AppConfig Feature Flag 프로필 + JSON Schema Validator(설정 형식 검증) + prod Environment에 5xx 알람 Monitor 등록 + Canary 점진 배포 전략. 마케팅팀은 새 hosted configuration version을 만들고 배포를 시작하면 된다. 형식 오류는 Validator가 사전에, 운영 악화는 Monitor가 사후에 막는다. 코드 배포 권한 없이도 안전하게 동작을 바꾼다.

> 📚 **사례**: 피처 플래그의 위험을 보여준 사건이 2012년 Knight Capital이다(AppConfig 이전 시대지만 교훈은 동일). 재사용된 플래그 비트가 비활성화돼야 할 옛 거래 로직을 깨우면서 45분 만에 4억 4천만 달러를 날렸다. 플래그 변경에 검증·점진 적용·자동 롤백이 없으면 코드 배포보다 더 위험할 수 있다는 교훈이다. AppConfig의 Validator + 점진 배포 + Monitor 자동 롤백은 바로 이런 "플래그 변경이 즉시 전체에 적용되어 폭발하는" 시나리오를 구조적으로 막기 위한 장치다.

## Lambda Extension — localhost:2772의 비용 최적화

애플리케이션이 AppConfig 구성을 어떻게 가져올까. 가장 단순한 방법은 매번 AppConfig SDK로 `GetLatestConfiguration`을 호출하는 것이다. 그런데 이건 두 가지 문제가 있다. 첫째, Lambda처럼 호출이 폭증하는 환경에서는 수많은 함수 인스턴스가 동시에 AppConfig API를 두드려 비용과 throttle 위험이 커진다. 둘째, 매 호출마다 API 왕복 지연이 더해진다.

**AppConfig Lambda Extension**이 이 문제를 우아하게 푼다. Extension을 Lambda 레이어로 붙이면, 함수 옆에 작은 사이드카 프로세스가 떠서 **백그라운드로 주기적으로 AppConfig를 polling하고 최신 값을 캐싱**한다. 함수 코드는 외부 AppConfig가 아니라 같은 실행 환경 안의 `http://localhost:2772`에서 캐시된 값을 가져온다.

```yaml
Resources:
  MyFn:
    Type: AWS::Serverless::Function
    Properties:
      Layers:
        - !Sub 'arn:aws:lambda:${AWS::Region}:027255383542:layer:AWS-AppConfig-Extension:67'
      Environment:
        Variables:
          AWS_APPCONFIG_EXTENSION_POLL_INTERVAL_SECONDS: 45
```

```python
import json, urllib.request
CONFIG_URL = ('http://localhost:2772/applications/checkout-api'
              '/environments/prod/configurations/featureflags')

def get_config():
    with urllib.request.urlopen(CONFIG_URL) as r:
        return json.loads(r.read())
```

`POLL_INTERVAL_SECONDS: 45`는 Extension이 45초마다 AppConfig에서 새 값을 받아온다는 뜻이다. 함수가 초당 수천 번 호출돼도 AppConfig API 호출은 45초에 한 번뿐이다. 캐시 적중이 localhost 호출이라 지연도 거의 없다. EC2·ECS·EKS에서는 같은 Extension을 데몬이나 사이드카로 띄워 동일한 localhost:2772 인터페이스를 쓴다.

폴링 간격은 트레이드오프다. 짧으면 구성 변경이 빨리 반영되지만 AppConfig API 호출(=Configuration Session 비용)과 부하가 늘고, 길면 비용은 줄지만 새 구성 반영이 느려진다. 점진 배포 중에는 폴링 간격이 곧 "각 클라이언트가 새 구성을 받는 해상도"가 되므로, duration보다 충분히 짧게 둬야 점진 곡선이 의도대로 그려진다.

> 🔍 **더 깊이**: AppConfig는 Configuration Session 기준으로 과금한다. Extension의 polling이 곧 session 호출이므로, "폴링 간격 × 동시 실행 환경 수"가 비용을 좌우한다. Lambda는 동시 실행마다 별도 실행 환경(=별도 Extension)을 갖지만, 각 환경 안에서는 Extension이 캐시를 공유해 함수의 매 호출이 API를 두드리지 않는다. 그래서 "함수 호출 1억 번"이 아니라 "동시 실행 환경 수 × (duration / poll-interval)"가 실제 비용에 가깝다. 폴링 간격을 너무 짧게 두면 동시성이 높은 함수에서 비용이 급증한다는 게 시험에도 나오는 함정이다.

## Evidently와의 경계 — 운영 플래그 vs 실험

AppConfig와 자주 비교되는 게 CloudWatch Evidently다. 둘 다 점진적 노출과 피처 플래그를 하지만 목적이 다르다.

| 항목 | AppConfig | CloudWatch Evidently |
|------|-----------|----------------------|
| 목적 | 운영 구성 + 피처 플래그 + 안전한 배포 | A/B 실험 + 통계적 유의성 분석 |
| 분석 | 외부(CloudWatch/X-Ray)에 위임 | 내장 통계(전환율, 신뢰구간) |
| 사용자 세그먼트 | 코드에서 처리 | 내장 세그먼트/타겟팅 |
| 자동 롤백 | ✅ (알람 Monitor) | 실험 중단 |

AppConfig는 "이 기능을 안전하게 켜고 운영 지표가 나빠지면 되돌린다"는 **운영** 도구다. Evidently는 "버전 A와 B 중 전환율이 통계적으로 유의하게 높은 게 무엇이냐"를 측정하는 **실험** 도구다. 다만 2024년 이후 Evidently는 신규 사용이 권장되지 않는 방향으로 가고 있어, 실험까지 AppConfig + 외부 분석으로 통합하는 흐름이다. 시험에서는 "안전한 점진 배포·자동 롤백 = AppConfig", "통계적 A/B 실험 = Evidently"로 구분하면 된다.

> 💡 **관련 이론**: A/B 테스트는 통계적 가설 검정(hypothesis testing)이다. 두 변형(A/B)의 지표 차이가 우연인지 진짜인지를 p-value와 신뢰구간으로 판단한다. Evidently가 이 통계를 내장한 건 "실험"에는 충분한 표본과 유의성 판정이 본질이기 때문이다. 반면 AppConfig의 점진 배포는 가설 검정이 아니라 위험 관리 — "문제가 생기면 적은 영향으로 발견하고 되돌린다"가 목적이다. 같은 "점진적 노출"이라도 하나는 통계적 학습이, 하나는 안전한 운영이 목표라는 점이 두 서비스를 가르는 본질이다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **AppConfig는 configuration as data**로 구성을 코드에서 분리해 배포(deploy)와 출시(release)를 분리하는 피처 플래그의 토대다 — 다만 수명 다한 플래그는 부채가 되니 정리해야 한다. 둘째, **5요소 구조는 변동성의 축을 분리**한 설계로, 알람 Monitor는 Environment에, Validator는 ConfigurationProfile에 붙는다. 셋째, **Deployment Strategy의 growth-factor·duration·bake-time은 카나리의 수학**이고, polling 클라이언트 집합을 분할하는 방식이라 일시적 구성 불일치를 견딜 수 있어야 한다. 넷째, **Validator(사전 형식 검증) + Monitor(사후 알람 자동 롤백)** 두 겹이 구성 변경을 코드 배포만큼 안전하게 만든다. 다섯째, **Lambda Extension은 localhost:2772에서 캐시**를 제공해 폴링 간격으로 비용·신선도를 조절한다.

다음 글에서는 구성의 또 다른 축인 시크릿으로 넘어간다. Parameter Store와 Secrets Manager의 경계, 그리고 zero-downtime 회전이라는 까다로운 문제를 어떻게 alternating users로 푸는지를 본다.

---

## 📝 연습 문제

**문제 1.** "마케팅팀이 코드 배포 없이 기능을 10%→100%로 점진 활성하고, 결제 5xx가 늘면 자동 롤백되어야 한다." 가장 적절한 서비스는?

A) Parameter Store에 플래그 저장
B) AppConfig + 점진 Deployment Strategy + Environment에 5xx 알람 Monitor 등록
C) S3 객체 + Lambda 폴링
D) 매번 파이프라인 재배포

**정답: B**

해설: AppConfig가 정공법이다. Deployment Strategy로 점진 노출(10%→100%), Environment Monitor로 5xx 알람을 걸어 배포 중·bake 중 알람 발생 시 자동 롤백한다. Parameter Store(A)는 점진 적용·자동 롤백·검증이 없는 단순 키-값이다. S3+Lambda(C)는 AppConfig가 제공하는 것을 직접 재구현하는 비효율이고, 재배포(D)는 "코드 배포 없이"라는 요구를 정면으로 위반한다.

---

**문제 2.** AppConfig에서 CloudWatch 알람 기반 자동 롤백 Monitor는 어느 구성요소에 붙는가?

A) Application
B) Environment
C) ConfigurationProfile
D) DeploymentStrategy

**정답: B**

해설: Monitor(알람)는 Environment에 붙는다. 같은 ConfigurationProfile을 dev와 prod에 배포해도 prod 환경에만 엄격한 알람을 걸어 자동 롤백을 작동시킬 수 있다. 검증(Validator)은 ConfigurationProfile에 붙어 어느 환경이든 동일하게 형식을 막는다. 알람은 환경별로 다르고 검증은 구성 형식 공통이라는, 변동성 축 분리가 핵심이다.

---

**문제 3.** Lambda에서 AppConfig 구성을 가장 효율적으로 사용하려면?

A) 매 함수 호출마다 GetLatestConfiguration SDK 호출
B) AppConfig Lambda Extension 레이어 → http://localhost:2772 캐시, 폴링 간격 환경 변수로 조절
C) DynamoDB에 구성 복사
D) 구성을 Lambda 코드에 하드코딩

**정답: B**

해설: Extension이 백그라운드로 주기 폴링 + 캐싱하고 함수는 localhost:2772에서 캐시 값을 가져온다. 함수가 초당 수천 번 호출돼도 AppConfig API는 폴링 간격당 한 번만 호출되어 비용·throttle·지연을 모두 줄인다. 매 호출 SDK(A)는 API 호출 폭증, DynamoDB 복사(C)는 동기화 부담, 하드코딩(D)은 동적 구성의 목적 자체를 상실한다.

---

**문제 4.** Deployment Strategy의 `final-bake-time-in-minutes 10`의 의미는?

A) 처음 10분만 점진 적용
B) 100% 도달 후 10분간 알람을 추가 감시 — 발생 시 자동 롤백
C) 10분 후 배포 강제 종료
D) 폴링을 10분마다 수행

**정답: B**

해설: bake time은 100% 도달 이후의 숙성·감시 구간이다. 모든 클라이언트가 새 구성을 받은 뒤에도 10분간 알람을 지켜보다가 문제 신호가 잡히면 자동 롤백한다. 신뢰성 공학의 bake time(변경의 위험은 시간이 지나며 드러난다)을 구성 배포에 적용한 것이다. Patch Manager의 approve-after-days와 같은 사상이다.

---

**문제 5.** AppConfig의 Validator 두 종류는?

A) IAM Policy + Resource Policy
B) JSON Schema(형식·범위 검증) + Lambda(임의 비즈니스 로직 검증)
C) CloudWatch Alarm + EventBridge
D) Config Rule + Trusted Advisor

**정답: B**

해설: JSON Schema Validator는 형식·필수 필드·값 범위를 선언적으로 검증하고, Lambda Validator는 구성 내용을 받아 복잡한 비즈니스 규칙을 코드로 검증해 SUCCESS/FAILURE를 반환한다. 둘 다 배포 시작 "전"에 작동해 잘못된 값이 들어가는 것을 막는다. 배포 "중·후"의 알람 자동 롤백(Monitor)과 짝을 이뤄 2단 방어를 만든다.

---

**문제 6.** AppConfig 점진 배포 중 애플리케이션이 반드시 견뎌야 하는 상황은?

A) 모든 인스턴스가 항상 동일한 구성 값
B) 일부 클라이언트는 새 구성, 일부는 옛 구성을 받는 일시적 불일치
C) 구성이 전혀 변하지 않음
D) 모든 구성이 메모리에서 사라짐

**정답: B**

해설: AppConfig 점진 배포는 polling 클라이언트 집합을 분할하는 방식이라, 롤아웃 진행 중에는 같은 코드가 도는 여러 인스턴스/Lambda가 서로 다른 구성 값을 받는다. 애플리케이션이 이 일시적 불일치(일부 새 값, 일부 옛 값)를 안전하게 처리할 수 있어야 한다. 이는 트래픽 가중치를 조절하는 CodeDeploy와 메커니즘이 다른 점이다.

---

**문제 7.** "버전 A와 B 중 전환율이 통계적으로 유의하게 높은 것"을 측정하려면 AppConfig보다 적합한 것은?

A) AppConfig Feature Flag
B) CloudWatch Evidently (내장 A/B 통계 분석)
C) Parameter Store
D) Secrets Manager

**정답: B**

해설: 통계적 유의성을 갖는 A/B 실험은 Evidently의 영역이다 — 전환율·신뢰구간 같은 통계를 내장해 가설 검정을 한다. AppConfig는 "안전하게 켜고 지표가 나빠지면 롤백"하는 운영 도구이지 통계적 실험 도구가 아니다. 같은 점진적 노출이라도 하나는 통계적 학습, 하나는 안전한 운영이 목적이다. (단, Evidently는 2024+ 신규 권장이 줄어드는 추세다.)

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, AppConfig는 configuration as data로 구성을 코드에서 분리해 배포(deploy)와 출시(release)를 분리하는 피처 플래그의 토대이며, 수명 다한 플래그는 2^N 조합 부채가 되니 정리해야 한다. 둘째, 5요소(Application/Environment/ConfigurationProfile/Version/Strategy)는 변동성 축을 분리한 설계로 알람 Monitor는 Environment에, Validator는 ConfigurationProfile에 붙는다. 셋째, Deployment Strategy의 growth-factor·duration·bake-time은 카나리의 수학이며, polling 클라이언트 집합을 분할하므로 일시적 구성 불일치를 견뎌야 한다. 넷째, Validator(사전 형식 검증)와 Monitor(사후 알람 자동 롤백)의 2단 방어가 구성 변경을 코드 배포만큼 안전하게 만든다. 다섯째, Lambda Extension은 localhost:2772 캐시로 폴링 간격에 따라 비용·신선도를 조절하며, AppConfig(운영 안전)와 Evidently(통계 실험)는 목적이 다르다.
