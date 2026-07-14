# Day 3 - AppConfig: Feature Flags and Progressive Deployment

Before AppConfig existed, feature roll-out meant: code changes to production, all at once, for all users. "New checkout flow ready" → deploy → 100% traffic sees it immediately. One bug hits 100% loss. AppConfig separates **configuration from code** and **gradual roll-out from immediate release**.

AppConfig's core: "apply configuration change to percentage of users dynamically." Lambda feature flag. ALB traffic shift. Database query behavior. All **without redeploying code**. Change a number, run a Validator Lambda, preview effects in staging, then **gradually roll out** to prod in 5%, 10%, 50%, 100% steps, abort anytime.

## AppConfig Architecture

```
AppConfig Profile:
  - Feature Name: "new-checkout-flow"
  - Validators: Lambda checking for data consistency
  - Deployment Strategy: Linear 10% every 5 minutes
  
App Code:
  GetLatestConfiguration() polls AppConfig → cache locally
  if feature["new-checkout-flow"] enabled → use new logic
```

AppConfig has **three abstractions**:

1. **Environment**: Logical grouping (dev, staging, prod)
2. **Profile**: Versioned configuration (new-checkout-flow v1, v2...)
3. **Deployment Strategy**: How to roll out (immediate, canary, linear, exponential)

| Strategy | Description | Use Case |
|----------|---|---|
| Immediate | All targets at once | Low-risk, well-tested changes |
| Linear | Percentage every N minutes | Gradual validation, observability |
| Exponential | Double percentage every N minutes | Risk-averse, infrastructure changes |
| All At Once | Concurrent to all | Emergency fix |

```bash
aws appconfig create-deployment-strategy \
  --name LinearTenPercent \
  --deployment-type LINEAR \
  --growth-factor 10 \
  --growth-type LINEAR \
  --replicate-to SSM_DOCUMENT
```

`growth-factor 10` = 10% per interval. `replicate-to SSM_DOCUMENT` mirrors change to SSM Parameter Store, enabling dynamic references in CloudFormation.

## Validators — Pre-Flight Checks

Deploying a feature flag that breaks database queries is prod disaster. Validators are **Lambda functions that execute during deployment**, checking configuration validity before it reaches apps.

```python
# Validator Lambda
import json

def handler(event, context):
    configuration = json.loads(event['configuration'])
    
    # Reject if checkout timeout < 5s (known problem)
    if configuration.get('checkout_timeout_seconds', 0) < 5:
        raise Exception('Checkout timeout must be >= 5 seconds')
    
    return {
        'deployment_state': 'SUCCEEDED'
    }
```

AppConfig invokes this validator **before each deployment stage**. If it raises, rollout stops. Linear 10% deployment with validator means: "deploy to 10%, validate with Lambda, if OK continue else abort." Risk moves from "hope the config is right" to "validate mathematically before shipping."

## Applications Polling

Applications call `GetLatestConfiguration()` periodically, with client-side caching.

```javascript
const appConfig = require('@aws-sdk/client-appconfig');

const client = new appConfig.AppConfigClient({ region: 'us-east-1' });

let configuration = {};
let configurationVersion = 0;

async function updateConfig() {
  const response = await client.send(
    new appConfig.GetLatestConfigurationCommand({
      Application: 'MyApp',
      Environment: 'prod',
      Configuration: 'FeatureFlags',
      ClientId: 'web-client-1'
    })
  );
  
  if (response.Configuration) {
    configuration = JSON.parse(response.Configuration);
    configurationVersion = response.ConfigurationVersion;
  }
}

// Poll every 60 seconds
setInterval(updateConfig, 60000);

// Application checks flags
if (configuration.newCheckoutFlow) {
  // use new checkout
}
```

`ClientId` matters: AppConfig tracks config version **per client**, so when you deploy a new version, not all clients flip at once. Clients get new config at next poll, rolling adoption. 1000 app servers, poll interval 60s = takes ~1-2 min for all to get new config. This **natural rate-limiting** prevents thundering herd of code changes hitting database simultaneously.

## Immediate Applications

**Feature flags**: "should we show New UI?" is configuration, not code. Toggle in AppConfig, clients see it within polling interval. **A/B tests**: Feature value is percentage (0-50-100 = 0% A, 50% B, 100% B). Clients hash their `ClientId` against percentage, deterministically choose branch. Same client always sees same version. **Database switching**: "Use new read replica for reports" is configuration. Change AppConfig, apps' next read picks new endpoint.

> 📚 **Case**: A SaaS deploys new database query logic to staging first. AppConfig Validator Lambda runs schema compatibility test + performance benchmark (< 500ms p99). If fails, deployment blocked before prod. Passes, deploy to prod with Linear 5% strategy. Observability shows query latency stable, scale to 50%, then 100% over 1 hour. Old logic served 95% of traffic for that hour; any issue is caught on 5% slice. One hour later, old code entirely gone. Compare: traditional deploy, all queries change at once, p99 latency jumps from 50ms to 2000ms, pages timeout. Catch 10 minutes later when alerts fire. Lost revenue during that window. AppConfig prevents this.

## Related Pattern: Safely Deploying Config Changes

AppConfig isn't just about rolling out features; it's **infrastructure automation with gradual validation**. Same pattern as Patch Manager's `ApproveAfterDays` (bake time before prod) and CodeDeploy's traffic shift (percentage rollout). Each is asking: "How to change everything gradually, stopping if problems appear?"

---

## 📝 연습 문제

**문제 1.** 신규 결제 로직이 준비됐고 기존 사용자 중 5%에게만 먼저 보여주고 싶다. 코드 배포 없이 이 기능을 구현하려면?

A) Lambda 함수 버전을 5%/95% 트래픽 분할
B) ALB 리스너 룰로 5% 라우팅
C) AppConfig Feature Flag + ClientId 기반 백분율 대조 → 결정적 진짜/거짓 할당
D) EC2 인스턴스 새로 5% 스핀업해 다른 코드 배포

**정답: C**

해설: AppConfig의 feature 값이 "enableNewCheckout: 50" (50%)이면, 클라이언트는 ClientId를 해시한 후 0-100 범위에서 결정적으로 50 이하면 true, 초과면 false를 얻는다. 같은 클라이언트는 항상 같은 결과(일관성), 전체 클라이언트 중 50%가 true(통계성). 코드 배포 불필요. 값만 5로 바꾸면 5%에만 새 로직 적용. ALB/Lambda 버전(A, B)은 코드 수준 분할이라 배포 필요, D는 전적으로 별도 관리.

---

**문제 2.** AppConfig Deployment Strategy에서 "매 5분마다 10%씩 늘려서 5단계로 50%까지만 배포, 그 이후 수동 승인"을 구현하려면?

A) Linear 10%, 5 minutes interval
B) Linear 20%, 5 minutes — 25분에 100% 도달하므로 50% 제약 불가
C) Custom Deployment Strategy 생성 후 단계별 수동 승인
D) AppConfig로 불가능, Lambda로 직접 구현

**정답: C**

해설: AppConfig 기본 전략(Immediate/Linear/Exponential)은 완전 자동 또는 비율만 설정한다. 상한선(50%)에서 멈추고 수동 승인 요청은 기본 전략 안에서 불가능하다. AWS Managed 그룹과 사람의 판단을 섞으려면 Custom Deployment Strategy를 만들어서 final-bake-percentage, manual-approval-gate, growth-factor를 조합해야 한다. 시험 문제에서 "until X% then manual" 보이면 Custom Strategy가 정답.

---

**문제 3.** 결제 데이터 스키마가 바뀌었고 AppConfig로 새 설정을 배포하기 전에 반드시 검증해야 한다. 가장 권장되는 방법은?

A) 설정을 수동으로 검토 후 배포
B) Validator Lambda를 지정해 배포 시 자동 검증 — 데이터베이스 마이그레이션 체크, 스키마 호환성 확인, P99 성능 벤치마크
C) CloudFormation Change Set으로 미리 보기
D) 배포 후 CloudWatch로 모니터링

**정답: B**

해설: Validator는 배포 직전 Lambda를 실행해 구성을 검증한다. 스키마 호환성, 성능 기준(P99 < X ms) 같은 자동화 가능한 검사를 코드화하면 위험을 극적으로 줄인다. 수동 검토(A)는 사람 실수 가능, CloudFormation Change Set(C)은 인프라 코드 검증이지 런타임 설정 검증 아님, 배포 후 모니터링(D)은 이미 나간 후 수습하는 것.

---

**문제 4.** 전 세계 100개 리전의 앱이 같은 기능 플래그를 써야 한다. 한 곳에서 수정하면 모든 리전이 자동으로 동기화되도록 구현하려면?

A) 각 리전마다 별도의 AppConfig Profile 설정
B) 중앙 리전 AppConfig + SDK로 직접 요청 → 지연 문제, 중앙 리전 장애 시 전체 다운
C) AppConfig에서 replicate-to SSM_DOCUMENT로 SSM Parameter Store 동기화 → CloudFormation 동적 참조 또는 앱 폴링
D) 수동으로 각 리전 업데이트

**정답: C**

해설: AppConfig 배포 전략에서 replicate-to 옵션을 활성화하면 배포 시 같은 설정을 SSM Parameter Store로 자동 복제한다. SSM은 리전 서비스로 리전별로 존재하지만 같은 값을 유지한다. 앱은 각자 로컬 SSM/AppConfig를 폴링해 자동 동기화. 중앙 집중(B)은 지연·단일 장애점, 수동(D)은 규모 불가능.

---

**문제 5.** 엘라스틱캐시 Redis 엔드포인트가 변경되고 1000개 마이크로서비스가 이를 알아야 한다. 서비스 코드를 수정하지 않고 구현하려면?

A) 모든 서비스에 수동으로 설정 변경 통보 후 재배포
B) AppConfig 또는 SSM Parameter Store에 엔드포인트 저장 → 서비스는 GetLatestConfiguration/GetParameter 호출 → 재배포 불필요
C) DNS CNAME 변경 — TTL 만료 대기, 일관성 보장 어려움
D) 환경 변수로 ECS 작업 모두 업데이트

**정답: B**

해설: Configuration-as-data 패턴. 엔드포인트 같은 운영 값을 AppConfig/Parameter Store에서 관리하고 애플리케이션은 API 호출로 최신 값을 가져온다. 서비스 코드 변경 불필요, 배포 불필요. 1000개 재배포의 관리 부담이 사라진다. DNS(C)는 TTL 때문에 동기화 보장 없고, 환경 변수(D)는 컨테이너/작업 모두 재시작 필요.

---

**문제 6.** 현재 AppConfig로 관리 중인 설정을 CloudFormation의 리소스 정의에서 동적으로 참조하려면?

A) CloudFormation 템플릿에 AppConfig 설정 값을 하드코딩
B) AppConfig replicate-to SSM_DOCUMENT 활성화 후 CloudFormation에서 `{{resolve:ssm:/path:1}}` 동적 참조 사용
C) CloudFormation Macro로 AppConfig 호출
D) 별도 Lambda Custom Resource로 AppConfig 조회

**정답: B**

해설: AppConfig에서 replicate-to SSM_DOCUMENT 옵션으로 Parameter Store에 값을 동기화하면, CloudFormation의 동적 참조 문법 `{{resolve:ssm:/path:version}}`으로 정의 시점이 아닌 배포 시점에 값을 해석한다. 설정이 바뀌면 SSM이 자동 업데이트되고 다음 스택 업데이트는 새 값을 본다. 하드코딩(A)은 변경 시마다 템플릿 수정, 정적 연결, Macro(C)/Custom Resource(D)는 불필요하게 복잡.

---

**문제 7.** 새 기능을 Linear 10%, 5분 간격으로 배포하되, 각 단계 후 수동으로 검증 메트릭을 확인하고 진행할지 결정하려면?

A) Linear Deployment Strategy를 AppConfig에 설정 후 자동 진행
B) EventBridge + SNS로 각 단계 후 사람에게 알림 → 수동 APPROVE/ROLLBACK API 호출
C) AppConfig에서 각 단계마다 수동 승인 설정
D) 배포 후 CloudWatch 확인 후 필요시 이전 버전으로 롤백

**정답: B**

해설: AppConfig의 Deployment Strategy는 자동 진행한다 (중단 조건이 validator 실패뿐). 사람의 판단을 개입시키려면 EventBridge로 배포 상태 변경 이벤트를 잡아 SNS 알림을 보내고, 운영자가 메트릭을 확인 후 StartDeployment/StopDeployment API를 호출한다. 각 단계 후 자동 멈추지는 않지만 API를 통해 조작 가능. C 같은 기본 설정은 없으므로 EventBridge 수동 오케스트레이션이 표준.

---

## 📌 오늘의 요약

AppConfig의 핵심은 세 가지다. 첫째, 설정과 코드를 분리해 배포 없이 기능을 제어한다. 둘째, Deployment Strategy(Linear/Exponential)와 Validator Lambda가 함께 **점진 배포 + 사전 검증**을 코드화한다. 셋째, ClientId 기반 해시 결정으로 **결정적이고 공정한 무작위 할당**을 보장한다. replicate-to SSM_DOCUMENT로 CloudFormation 동적 참조와도 연결되어, IaC와 configuration management가 한 시스템에서 순환한다.
