# Day 3 - Lambda Version과 Alias: 불변 스냅샷 위에 얹은 가변 포인터

Lambda 함수를 운영해본 사람이라면 한 번쯤 이런 질문을 해봤을 것이다. "함수 코드를 새로 배포했는데, 진행 중이던 invocation은 어느 버전으로 끝나는 거지?" 또는 "API Gateway가 호출하는 함수 코드를 5초 안에 어떻게 바꾸지?" 또는 "Canary 배포 중에 갑자기 5xx가 치솟으면 어떻게 즉시 롤백되지?" 이 질문들의 답은 모두 한 곳을 가리킨다. **Lambda Version과 Alias**라는 두 개의 추상화.

이 모델의 설계 철학은 단순하다. **Version은 불변(immutable) 스냅샷**, **Alias는 그 스냅샷을 가리키는 가변 포인터**다. Git의 commit hash와 branch 관계, 또는 Docker image의 tag와 sha256 digest 관계와 본질적으로 동일하다. 코드가 한 번 게시되면(`publish-version`) 그 Version은 영구히 변하지 않는다. 배포는 "새 Version을 만들고 Alias가 가리키는 대상을 바꾸는" 작업으로 정의된다. 이 구조 덕분에 weighted routing, 즉각 롤백, 멀티 환경 운영이 자연스럽게 가능해진다.

오늘은 이 두 개념의 내부 동작과 시험에서 자주 함정으로 나오는 가장자리 케이스들을 본다. CodeDeploy Canary, Provisioned Concurrency, API Gateway의 Stage Variable, SnapStart까지 — 모두 Version/Alias 모델 위에 얹혀 있다.

## Version이 정말로 불변인 이유

```bash
# $LATEST에 새 코드 업로드
aws lambda update-function-code --function-name MyFn --zip-file fileb://app.zip

# Version 게시 (이 순간 $LATEST의 코드+설정 스냅샷이 V7로 동결)
aws lambda publish-version --function-name MyFn
# {"FunctionName": "MyFn", "Version": "7", "CodeSha256": "abc...", ...}

# V7의 환경 변수를 바꾸려고 시도
aws lambda update-function-configuration \
  --function-name MyFn:7 \
  --environment 'Variables={NEW=value}'
# ❌ An error occurred (InvalidParameterValueException): Lambda was unable to configure your environment variables. Reason: The role defined for the function cannot ...
# 정확히는 ResourceConflictException: Cannot modify a published version
```

Version이 게시되는 순간 코드(`CodeSha256`), 환경 변수, 메모리, 타임아웃, 런타임, Layer 참조 — 모든 구성이 동결된다. 이후 그 Version에 대해 변경 가능한 건 오직 **자원 정책(Resource Policy)**과 **Provisioned Concurrency 설정**뿐이다.

이 불변성이 왜 중요할까. **재현 가능성**과 **롤백 안전성** 때문이다. 어제 배포한 V6를 오늘 다시 호출해도 동일한 코드·환경에서 실행된다는 보장이 있어야, "어제 V6에선 잘 됐는데 오늘 V7에서 망가졌다"는 비교가 가능하다. 만약 Version이 가변이면 디버깅은 지옥이 된다.

> 💡 **관련 이론**: 불변 스냅샷 모델은 함수형 프로그래밍의 **persistent data structure**(Chris Okasaki 1996)와 같은 패턴이다. Git commit, Docker image digest, AWS AMI ID, S3 object version, Kubernetes ReplicaSet 모두 같은 발상. 핵심은 "한 번 만든 것은 절대 안 바꾸고, 변경은 새 객체를 만든다"는 원칙. 이게 깨지면 분산 시스템의 일관성과 디버깅이 무너진다. Lambda Version은 이 원칙을 강제하는 enforcement 메커니즘.

> 🔍 **더 깊이**: `$LATEST`는 unversioned mutable working copy다. Version 번호 1부터 양의 정수로 증가하며, 한 번 사용된 번호는 재활용되지 않는다(`delete-function --qualifier 5` 후에도 V5는 영구히 결번). 이게 Git의 commit hash가 한 번 만들어지면 가비지 컬렉션 후에도 재사용되지 않는 것과 동일한 보장. `CodeSha256` 필드는 zip 콘텐츠의 SHA-256으로, 동일 코드를 두 번 게시하면 같은 sha256을 가지지만 Version 번호는 다르다. 이는 CI 재실행 같은 멱등성 검증에 활용 가능.

## Alias: Symbolic Link의 클라우드 버전

```bash
# Alias 생성 — V5를 가리키는 'live' 포인터
aws lambda create-alias \
  --function-name MyFn \
  --name live \
  --function-version 5

# 호출 시 Alias 사용
aws lambda invoke \
  --function-name MyFn:live \
  --payload '{}' out.json
# 내부적으로 V5가 실행됨

# Alias가 가리키는 대상 변경 (즉시 트래픽 시프트)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 6
# 다음 invocation부터 V6 실행
```

Alias는 Unix의 symbolic link, Git의 branch, DNS의 CNAME과 같은 추상화다. 실제 대상은 다른 곳에 있고, Alias는 이름→대상의 mapping 한 줄. 변경 비용이 거의 0이라(메타데이터 한 줄 갱신) **수십 밀리초 안에 트래픽 시프트**가 가능하다.

가장 중요한 응용은 **Weighted Routing**.

```bash
# V5에 90%, V6에 10% (Canary)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 5 \
  --routing-config 'AdditionalVersionWeights={"6"=0.1}'
```

Lambda 서비스 내부의 invoker가 각 요청마다 random number를 생성하고, 가중치에 따라 V5 또는 V6로 라우팅한다. 이 과정은 **stateless**라 같은 사용자라도 매 요청마다 다른 Version에 도달할 수 있다(sticky routing 불가).

> ⚠️ **함정**: Alias의 weighted routing은 **primary 1개 + additional 1개**만 가능하다. 즉 한 Alias가 동시에 가리킬 수 있는 Version은 최대 2개. "V5 70%, V6 20%, V7 10%" 같은 3-way split은 불가능하다. 시험에서 "3개 Version에 동시 트래픽 분배" 같은 시나리오가 나오면 답은 (1) 두 단계 Canary로 분리(V5→V6 후 V6→V7), (2) Application Load Balancer로 weighted target group 사용, (3) Route 53 weighted routing 셋 중 하나다. 이 단일 제약이 CodeDeploy Canary가 "한 번에 한 단계"만 진행하는 구조적 이유.

> 🎯 **시나리오**: "한 Alias 'prod'가 V10을 가리키고 있다. V11을 배포하고 30분 동안 5% 트래픽으로 확인하려고 한다. 어떻게 설정?" — 답은 `update-alias --function-version 10 --routing-config 'AdditionalVersionWeights={"11"=0.05}'` 후 30분 후 `--function-version 11 --routing-config '{}'`. 이 두 단계를 CodeDeploy `Canary5Percent30Minutes`로 한 줄에 자동화 가능.

## CodeDeploy가 Alias를 어떻게 시프트하는가

`AutoPublishAlias` + `DeploymentPreference`를 설정한 SAM 함수가 배포되면 CodeDeploy는 다음 시퀀스를 수행한다.

```
1. CFN이 Lambda 함수 코드 업데이트 (→ $LATEST 갱신)
2. CFN이 publish-version 호출 → V7 생성
3. CFN이 CodeDeploy Deployment 생성
4. CodeDeploy가 PreTraffic Hook Lambda 실행
   ↓ 실패 시 → 배포 중단, V6 유지
5. CodeDeploy가 Alias weighted routing 설정
   live: V6=90%, V7=10%
6. CloudWatch Alarm 모니터링 (5/30분)
   ↓ Alarm 발동 → live: V6=100%, V7=0% (롤백)
7. 대기 시간 종료 → live: V6=0%, V7=100%
8. CodeDeploy가 PostTraffic Hook Lambda 실행
   ↓ 실패 시 → 롤백
9. 배포 완료, V6는 history로 보존
```

이 흐름의 모든 단계가 **Alias의 가변성** 위에서 동작한다. 각 트래픽 시프트는 단순한 `update-alias` API 호출 한 번이고, 롤백도 같은 API의 다른 매개변수 호출일 뿐이다.

```yaml
# SAM Template — Canary + Hook + Alarm 완전체
GetOrderFn:
  Type: AWS::Serverless::Function
  Properties:
    AutoPublishAlias: live
    DeploymentPreference:
      Type: Canary10Percent5Minutes
      PreTraffic: !Ref PreTrafficHook
      PostTraffic: !Ref PostTrafficHook
      Alarms:
        - !Ref ErrorRateAlarm
        - !Ref P99LatencyAlarm
      Role: !GetAtt CodeDeployServiceRole.Arn

ErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    MetricName: Errors
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: !Ref GetOrderFn
      - Name: Resource
        Value: !Sub '${GetOrderFn}:live'   # ← Alias 단위로 분리!
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 2
    Threshold: 1
    ComparisonOperator: GreaterThanThreshold
    TreatMissingData: notBreaching
```

> 🔍 **더 깊이**: Lambda CloudWatch Metric은 기본적으로 `FunctionName` 차원만 갖지만, `Resource` 차원을 추가하면 Alias/Version별 분리 메트릭이 나온다. `MyFn:live`, `MyFn:7` 같은 식. Canary 배포 중 신구 Version의 에러율을 따로 보려면 이 차원이 필수. 추가 비용은 메트릭당 standard rate(처음 10000개 무료, 이후 $0.30/metric). PostTraffic Hook은 종종 이 분리 메트릭을 조회해 신규 Version의 P99 latency가 기존 대비 1.5배 미만인지 확인하는 코드를 작성한다.

> 📚 **사례**: 2021년 한 e-commerce 회사가 Canary10Percent5Minutes로 배포 중 5분 안에 Error Alarm이 발동되지 않아 100% 시프트 후 다음 시간대에 메모리 leak이 폭발한 사건이 있었다. 원인은 (1) leak이 단계적이라 5분 안에 임계치 도달하지 못함, (2) Alarm이 1분 평균이라 spike만 잡고 누적 패턴 못 잡음. 이후 팀은 `Canary10Percent30Minutes`로 늘리고 PostTraffic Hook에서 메모리 사용량 trend를 추가 체크하도록 변경. 교훈: Canary 시간은 시나리오의 가장 느린 실패 패턴 기준으로 설정.

## API Gateway가 Alias를 가리키는 두 가지 방식

API Gateway → Lambda 통합에서 가장 흔히 묻는 시험 패턴이다.

**방식 1: Stage Variable 패턴 (REST API)**

```
Integration URI:
arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/
arn:aws:lambda:ap-northeast-2:111:function:MyFn:${stageVariables.lambdaAlias}/invocations
```

```bash
# 배포된 API Stage 'prod'에 변수 설정
aws apigateway update-stage \
  --rest-api-id abc123 \
  --stage-name prod \
  --patch-operations 'op=replace,path=/variables/lambdaAlias,value=live'
```

이 패턴은 **Stage별로 다른 Alias** 사용을 가능하게 한다. `dev` Stage는 `lambdaAlias=staging`, `prod` Stage는 `lambdaAlias=live`. 함수 코드 변경 시 API Gateway 재배포 불필요 — Alias 시프트가 즉시 반영.

**방식 2: 직접 Alias ARN 참조 (HTTP API 또는 정적 통합)**

```bash
aws apigatewayv2 create-integration \
  --api-id xyz \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:...:MyFn:live \
  --payload-format-version 2.0
```

이 경우 Integration의 URI 자체가 Alias ARN. 변경하려면 Integration 자체를 업데이트해야 한다.

> ⚠️ **함정**: API Gateway가 Lambda를 호출하려면 Lambda 측에 **자원 정책**(Resource-based Policy)이 필요하고, 이는 `add-permission` API로 추가한다. 핵심은 `--qualifier` 플래그.

```bash
# ❌ 잘못된 방식 — Function ARN에만 권한
aws lambda add-permission \
  --function-name MyFn \
  --statement-id api-gw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com

# ✅ 올바른 방식 — Alias에 권한
aws lambda add-permission \
  --function-name MyFn \
  --qualifier live \
  --statement-id api-gw-invoke-live \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn 'arn:aws:execute-api:ap-northeast-2:111:abc123/*/GET/orders/*'
```

Function ARN의 권한은 `$LATEST` 호출에만 적용된다. Alias 호출(MyFn:live)은 별도의 자원 정책이 필요. 이걸 모르고 콘솔에서 "Add trigger"로 추가하면 API Gateway가 정확한 qualifier로 권한을 부여해주지만, 수동 CLI/CFN에서는 명시해야 한다. 시험에서 "API Gateway 호출이 권한 거부됨" 시나리오의 답은 거의 항상 이 qualifier 누락.

## Provisioned Concurrency: 워밍업의 비용 vs 효과

PC는 "미리 N개의 컨테이너를 워밍 상태로 유지"하는 기능이다.

```bash
# Alias 'live'에 PC 10개 설정
aws lambda put-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier live \
  --provisioned-concurrent-executions 10
```

PC는 **Version 또는 Alias** 수준에서 설정 가능하지만, `$LATEST`에는 불가하다. 가변 대상에 PC를 두면 코드 변경마다 워밍업이 무효화되어 의미가 없기 때문.

| 항목 | Reserved Concurrency | Provisioned Concurrency |
|------|----------------------|--------------------------|
| 목적 | 동시 실행 한도 설정 (다른 함수 보호) | 사전 워밍업 (cold start 제거) |
| 비용 | 무료 | 활성 시간 비례 ($0.0000041667/GB-s) |
| Cold Start | 영향 없음 (한도 도달 시 throttle) | 제거 (PC 용량 내) |
| 적용 단위 | Function | Alias 또는 Version |
| 한도 도달 시 | 429 Throttle | 일반 cold start로 폴백 (요청은 처리됨) |
| Auto Scaling | 불가 | Application Auto Scaling 가능 |

```bash
# PC를 Target Tracking으로 자동 조정 (사용률 70% 목표)
aws application-autoscaling register-scalable-target \
  --service-namespace lambda \
  --resource-id function:MyFn:live \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --min-capacity 5 --max-capacity 100

aws application-autoscaling put-scaling-policy \
  --service-namespace lambda \
  --resource-id function:MyFn:live \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --policy-name pc-target-util \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 0.7,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "LambdaProvisionedConcurrencyUtilization"
    }
  }'
```

> 🔍 **더 깊이**: PC가 켜진 상태에서 Canary 배포가 일어나면 어떻게 될까. 답은 "**두 Version 모두 PC를 가져야 함**"이다. SAM `DeploymentPreference`가 자동으로 새 Version에 PC를 미리 할당한 뒤 시프트를 시작한다. 만약 자동 할당이 없으면 신규 Version은 트래픽을 받자마자 cold start를 다 겪게 되어 Canary의 의미가 깨진다. 결과는 배포 중 **PC 비용이 일시적으로 2배**가 된다(V5에 PC 10, V6에 PC 10 동시). 비용 민감 워크로드에서는 이 점이 PC를 망설이는 이유가 된다.

> ⚠️ **함정**: PC 사용량이 PC 용량을 초과하면 초과분은 일반 cold start로 처리되며 호출이 거부되지 않는다(이게 Reserved와 다른 점). 그래서 PC 5개를 설정한 함수에 100개 동시 호출이 들어와도 처음 5개는 cold start 없이, 나머지 95개는 일반 cold start로 처리된다. PC가 throttle이 아닌 "워밍 부스트"임을 정확히 이해할 것. 시험 함정으로 "PC가 한도 역할도 한다"는 보기가 자주 등장한다.

## SnapStart: Java의 Cold Start 혁명

2022년 re:Invent에서 발표된 SnapStart는 **JVM init 단계의 메모리 스냅샷**을 미리 만들어두는 기능이다.

```yaml
# SAM
Properties:
  SnapStart:
    ApplyOn: PublishedVersions
```

```bash
# CLI
aws lambda update-function-configuration \
  --function-name MyJavaFn \
  --snap-start ApplyOn=PublishedVersions
```

활성화 후 새 Version을 게시하면 Lambda가 백그라운드에서 다음을 수행한다.

1. 임시 microVM에 함수 init 단계 실행 (Spring Boot의 ApplicationContext 초기화 등)
2. 메모리·디스크 상태 스냅샷 캡처 → 암호화 후 분산 저장
3. 이후 invocation은 스냅샷 복원으로 시작 → init 단계 건너뜀

효과는 극적이다. Spring Boot Lambda의 cold start가 5~10초에서 **300~500ms**로 감소한다(약 90% 감축).

| 항목 | 값 |
|------|-----|
| 지원 런타임 | Java 11/17/21, Python 3.12+, .NET 8+ (2024년 말 추가) |
| 지원 패키지 | zip만 (Container Image 미지원) |
| Java 비용 | 무료 |
| Python/.NET 비용 | $0.0000015625/GB-s (스냅샷 cache) + 복원 시간 과금 |
| 호환 제약 | Provisioned Concurrency와 동시 사용 불가 |

> 💡 **관련 이론**: SnapStart는 1980년대 Self/Smalltalk의 **image-based persistence**와 동일한 발상이다. 프로그램 실행 상태(메모리 페이지, CPU 레지스터)를 통째로 저장한 뒤 복원해 시작 시간을 건너뛴다. 현대에서는 VMware의 vMotion, Google의 zigzag(스냅샷 기반 cold boot), CRIU(Linux의 Checkpoint/Restore in Userspace)가 같은 패턴. SnapStart는 Firecracker MicroVM의 스냅샷 기능을 Lambda에 노출한 것.

> ⚠️ **함정**: SnapStart로 인한 **uniqueness assumption violation** — 스냅샷 복원이므로 init 단계의 `random.seed()`, `UUID.randomUUID()`, `Instant.now()` 결과가 모든 invocation에서 동일하게 시작된다. 보안상 심각한 문제(예측 가능한 토큰 생성). 해결은 **Runtime Hook**.

```java
import com.amazonaws.services.lambda.runtime.events.snapstart.*;
import org.crac.Core;
import org.crac.Resource;

public class SnapAwareHandler implements Resource {
    public SnapAwareHandler() {
        Core.getGlobalContext().register(this);
    }

    @Override
    public void beforeCheckpoint(org.crac.Context<? extends Resource> context) {
        // 스냅샷 직전 — DB 연결 종료, 캐시 비우기
    }

    @Override
    public void afterRestore(org.crac.Context<? extends Resource> context) {
        // 스냅샷 복원 직후 — 랜덤 시드 재설정, 연결 재수립
        SecureRandom.getInstanceStrong();  // 새 엔트로피 풀
    }
}
```

이 hook을 잊으면 모든 호출에서 같은 UUID가 나오는 끔찍한 버그가 발생한다. 시험에서 "SnapStart 활성화 후 동일 토큰이 생성됨" 시나리오의 답은 Runtime Hook 추가.

## Version Pruning: 무한 증가하는 Version 관리

CodeDeploy Canary로 매일 5회 배포하면 1년 후 Version이 1800개가 된다. Lambda는 함수당 Version 75GB 한도가 있어 큰 함수에선 빠르게 한도에 도달한다.

```bash
# 90일 이상 사용 안 된 Version 식별 + 삭제
# (CloudWatch Logs의 마지막 invocation 시간 조회)
LATEST_USED_VERSION=$(aws logs filter-log-events ...)

aws lambda list-versions-by-function --function-name MyFn \
  --query 'Versions[?Version!=`$LATEST`].Version' \
  --output text | tr '\t' '\n' | \
  while read v; do
    if [ "$v" -lt "$LATEST_USED_VERSION" ]; then
      aws lambda delete-function --function-name MyFn --qualifier "$v"
    fi
  done
```

CDK는 `currentVersionOptions`로 자동 관리:

```typescript
new lambda.Function(this, 'F', {
  // ...
  currentVersionOptions: {
    removalPolicy: cdk.RemovalPolicy.RETAIN,   // 또는 DESTROY로 자동 정리
    description: 'Deployed by CDK',
    provisionedConcurrentExecutions: 5,
  },
});
```

`RemovalPolicy.DESTROY`로 두면 새 배포마다 이전 Version이 삭제된다. 다만 롤백 가능성을 위해 prod는 RETAIN + 별도 cleanup Lambda 권장.

> 📚 **사례**: 2020년 한 SaaS 팀이 함수 하나에 Version 1만 개를 누적시켜 신규 배포가 `CodeStorageExceededException`으로 실패한 사건이 있었다. 한도가 75GB(default)인데 각 Version이 평균 8MB라 9300개 정도에서 한도 도달. AWS Support에 한도 증액 요청 + 긴급 Version cleanup으로 복구. 교훈은 (1) Version 한도 모니터(`CloudWatch FunctionVersions` 메트릭), (2) 자동 prune 파이프라인 필수.

## Function URL과 Alias

2022년 출시된 Function URL은 API Gateway 없이 Lambda를 HTTP로 직접 노출한다.

```bash
aws lambda create-function-url-config \
  --function-name MyFn \
  --qualifier live \
  --auth-type AWS_IAM \
  --cors '{"AllowOrigins":["https://example.com"],"AllowMethods":["GET","POST"]}'
```

`--qualifier live`로 Alias 단위 URL을 만들 수 있다. 결과 URL은 `https://<unique-id>.lambda-url.ap-northeast-2.on.aws`. 여러 Alias마다 별도 URL을 가질 수 있어 자연스러운 Blue/Green 패턴이 된다.

> 🎯 **시나리오**: "API Gateway 없이 단일 Lambda를 HTTPS로 노출하고, prod와 canary를 별도 URL로 분리하려면?" — 답은 Function URL 두 개를 `prod` Alias, `canary` Alias 각각에 생성. 클라이언트는 두 URL을 weighted DNS(Route 53) 또는 CloudFront origin failover로 분배. API Gateway 대비 cost·latency 절감되지만 API Key, throttling, request validation 같은 기능은 없다.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **Version은 불변 스냅샷, Alias는 가변 포인터** — Git의 commit/branch와 동일한 발상으로 재현성과 롤백 안전성을 보장. 둘째, **Alias weighted routing은 primary + 1 secondary** 제약이 CodeDeploy Canary의 "한 번에 한 단계" 구조의 원인. 셋째, **API Gateway 통합에는 qualifier가 필수** — Function ARN 권한만으로는 Alias 호출 거부. 넷째, **Provisioned Concurrency와 SnapStart**는 cold start의 두 표준 해법이지만 서로 호환 안 되고 SnapStart는 uniqueness assumption 주의.

다음 글에서는 Step Functions와 EventBridge로 여러 Lambda를 오케스트레이션하는 패턴을 본다. 함수 하나에 모든 로직을 우겨넣던 monolithic Lambda 시대는 끝났고, 이제는 워크플로 엔진이 함수 간의 흐름을 관리하는 시대다.

---

## 📝 연습 문제

**문제 1.** Lambda Alias의 weighted routing이 동시에 가리킬 수 있는 Version 수는?

A) 1개 (primary만)
B) 2개 (primary + additional 1개)
C) 3개
D) 무제한 — 가중치 합이 1.0이면 가능

**정답: B**
해설: Alias는 `function-version`(primary) + `routing-config.AdditionalVersionWeights`에 최대 1개의 추가 Version만 가능. 즉 최대 2-way split. "V5 70%, V6 20%, V7 10%" 같은 3-way는 불가. 이게 CodeDeploy Canary가 "한 단계씩"만 진행하는 구조적 이유. 3-way split이 필요하면 ALB weighted target group 또는 Route 53 weighted routing을 사용. 시험 빈출 함정으로, "여러 Version 분배 가능"으로 답하면 오답.

---

**문제 2.** Java Spring Boot Lambda의 cold start가 8초로 P95 latency를 망친다. 가장 효과적인 해결책은?

A) Reserved Concurrency 증가
B) SnapStart를 활성화 + Runtime Hook으로 uniqueness 재설정
C) Lambda Layer 사용
D) Architecture를 ARM으로 변경 (20% 개선)

**정답: B**
해설: SnapStart는 JVM init 단계의 메모리 스냅샷을 만들어 cold start의 80~90%를 차지하는 init 시간을 건너뛴다. 8초 → 300~500ms로 단축. Spring Boot의 ApplicationContext 초기화가 init 단계에 일어나므로 가장 큰 효과. 단 random seed, UUID 같은 uniqueness 보장이 필요한 부분은 `afterRestore` Hook에서 재초기화 필수(안 하면 모든 호출에서 같은 UUID 생성). A는 한도 설정이지 cold start와 무관, C는 미미한 영향, D는 일부 개선이지만 1차 해법은 아님.

---

**문제 3.** API Gateway가 Lambda Alias `MyFn:live`를 호출하는데 403/Permission denied가 발생한다. 가장 가능성 높은 원인은?

A) Lambda 코드 버그
B) `aws lambda add-permission`을 `--qualifier live` 없이 실행 → Function ARN에만 권한, Alias 호출은 거부
C) IAM Role 부재
D) VPC 설정 누락

**정답: B**
해설: Lambda 자원 정책은 ARN 정확도 기준으로 평가된다. `arn:aws:lambda:...:MyFn`(unqualified) 권한은 `$LATEST`와 unqualified invoke만 허용, `arn:aws:lambda:...:MyFn:live`(qualified) 호출은 별도 권한 필요. 시험·실무에서 매우 흔한 트러블슈팅 포인트. 콘솔의 "Add trigger"는 자동으로 qualifier 포함 권한을 부여하지만 CLI/CFN 수동 작성 시 누락하기 쉽다. 해결은 `add-permission --qualifier live` 명시.

---

**문제 4.** `$LATEST`에 Alias weighted routing이 가능한가?

A) 가능
B) 불가능 — Version은 양의 정수만 (가변 대상은 weighted routing 의미 없음)
C) 일부 리전만 지원
D) Layer를 통해 우회 가능

**정답: B**
해설: `$LATEST`는 가변 working copy. 코드가 매번 바뀌므로 weighted routing의 "두 다른 코드를 비교"라는 목적과 본질적으로 충돌. Lambda API 자체가 `function-version`에 `$LATEST` 또는 비숫자 문자열을 거부한다(`ValidationException`). PC도 마찬가지로 `$LATEST`에 설정 불가 — 코드 변경이 워밍업을 무효화하기 때문. 해결은 항상 `publish-version`으로 숫자 Version을 만들어 사용.

---

**문제 5.** Provisioned Concurrency와 Reserved Concurrency의 차이로 가장 정확한 것은?

A) 동일한 기능 — 이름만 다름
B) PC는 미리 워밍업된 컨테이너 유지(유료, cold start 제거), Reserved는 동시 실행 한도 설정(무료, 다른 함수 보호)
C) PC는 무료, Reserved는 유료
D) Reserved는 cold start 제거, PC는 동시 한도 설정

**정답: B**
해설: 두 개념의 정확한 구분이 시험에 자주 등장. PC는 "cold start 0"이 목적, Reserved는 "이 함수가 다른 함수의 동시 실행을 잡아먹지 못하게 한도"가 목적. PC 한도 초과 호출은 일반 cold start로 처리되어 거부되지 않지만, Reserved 한도 초과는 429 throttle. PC는 사용 시간당 과금, Reserved는 무료. 또 PC는 Reserved의 부분집합이 될 수 있다(PC 10이면 Reserved는 최소 10).

---

**문제 6.** Canary 배포 중 PC가 켜진 함수의 비용 영향은?

A) 변화 없음
B) 신구 Version 모두에 PC가 일시적으로 활성화되어 PC 비용이 약 2배가 됨(CodeDeploy가 자동 할당)
C) PC가 자동 해제됨
D) 비용 50% 감소

**정답: B**
해설: Canary 시프트 중 신규 Version도 워밍 상태여야 cold start가 안 생기므로, SAM/CodeDeploy가 새 Version에도 동일 PC를 자동 할당한다. 결과는 배포 중 PC 비용이 일시적으로 2배(예: V5에 PC 10 + V6에 PC 10 = 20개). 시프트가 100%로 완료되면 V5의 PC가 자동 해제. 비용 민감 워크로드에서 PC 도입 시 이 점을 미리 계산해야 한다. A/C/D는 사실이 아님.

---

**문제 7.** SnapStart 활성화 후 모든 호출에서 같은 UUID가 생성되는 버그가 발생했다. 원인과 해결은?

A) Lambda 버그 — AWS Support 요청
B) 스냅샷 복원이라 init 단계의 random seed가 모든 invocation에서 동일 → `org.crac.Resource`의 `afterRestore` Hook에서 SecureRandom 재초기화
C) Java 버전을 17로 업그레이드
D) Layer를 추가

**정답: B**
해설: SnapStart는 image-based persistence라 init 단계의 모든 메모리 상태가 복제된다. `new SecureRandom()`이 init에서 한 번만 실행되면 같은 entropy로 시작. Runtime Hook(`org.crac.Core.getGlobalContext().register(this)`)으로 `afterRestore`에서 `SecureRandom.getInstanceStrong()` 같은 재초기화 필수. 같은 문제가 DB connection, HTTP client pool, file descriptor에도 적용되어 모두 hook으로 재수립해야 한다. uniqueness assumption violation은 SnapStart 도입 시 가장 흔한 보안 함정.

---

**문제 8.** Function URL을 Alias 단위로 만들어 Blue/Green을 구현하려면?

A) Function URL은 함수 전체 단위만 가능
B) `create-function-url-config --qualifier <alias>`로 Alias별 URL 생성 → 클라이언트는 Route 53 weighted 또는 CloudFront origin failover로 분배
C) API Gateway가 필수
D) Lambda Layer 추가

**정답: B**
해설: Function URL(2022 출시)은 `--qualifier`로 Version 또는 Alias 단위 URL 생성 가능. prod Alias와 canary Alias 각각에 URL을 만들면 두 다른 endpoint가 생긴다. 클라이언트 분배는 Route 53 weighted record나 CloudFront origin failover로. API Gateway 대비 latency·cost 절감, 단 API Key·throttling·request validation 같은 기능 부재. A는 사실이 아님, C는 Function URL이 API Gateway 없이 동작하는 게 핵심 기능, D는 무관.

---

## 📌 오늘의 요약

오늘 다룬 Version/Alias 모델의 핵심은 (1) Version은 불변 스냅샷이고 Alias는 가변 포인터로 재현성과 롤백 안전성을 보장, (2) Alias weighted routing은 primary + 1 secondary 제약이 CodeDeploy Canary의 단계적 진행의 구조적 원인, (3) API Gateway 통합에서 `--qualifier` 누락이 가장 흔한 권한 거부 원인, (4) Provisioned Concurrency는 워밍업 + 유료 + Auto Scaling 가능, Reserved Concurrency는 동시 한도 + 무료, (5) SnapStart는 Java cold start를 90% 단축하지만 uniqueness assumption violation은 Runtime Hook으로 반드시 보정 — 다섯 가지다.
