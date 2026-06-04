# Day 1 - AWS SAM: CloudFormation이 서버리스에게 던진 사과

CloudFormation으로 Lambda 하나를 띄워본 사람은 알 것이다. 함수 한 개를 만들려고 `AWS::Lambda::Function`, `AWS::IAM::Role`, `AWS::IAM::Policy`, `AWS::Lambda::Permission`, `AWS::Lambda::EventSourceMapping`, `AWS::ApiGateway::*` 6종 세트가 줄줄이 따라온다. 단순한 "주문 조회 API" 하나가 200줄짜리 YAML이 된다. 이 보일러플레이트의 무게가 2016년 AWS re:Invent에서 SAM(Serverless Application Model)이라는 이름으로 정식 발표된 배경이다. SAM은 새로운 IaC 도구가 아니다. **CloudFormation의 Transform(매크로) 위에 얹은 서버리스 친화 DSL**이고, 배포 시점에 평범한 CloudFormation으로 풀어진다.

오늘은 SAM이 왜 CloudFormation의 한 줄(`Transform:`) 위에 설계됐는지, sam local의 Docker 에뮬레이션이 실제로 어디까지 신뢰할 수 있는지, sam sync의 hotswap이 프로덕션에서 왜 위험한지를 본다. DOP 시험에서 SAM은 단독으로 묻기보다 "CodePipeline + CodeDeploy + Lambda Canary"의 한 가운데 끼어 출제되므로, 도구의 내부 동작을 알아두면 5~10문제가 한꺼번에 풀린다.

## SAM이 CloudFormation Macro로 설계된 이유

SAM Template의 첫 줄 `Transform: AWS::Serverless-2016-10-31`이 모든 마법의 시작이다. CloudFormation은 2016년에 **Transforms**라는 확장 메커니즘을 도입했는데, 이는 템플릿이 CFN 엔진에 도달하기 전에 별도 Lambda 함수가 템플릿을 다시 써주는(rewrite) 단계다. AWS SAM은 이 메커니즘 위에서 만들어진 **AWS 관리형 매크로**이고, `AWS::Serverless::Function` 같은 가짜 리소스 타입을 정의한 다음, 배포 시점에 진짜 CFN 리소스 6~8개로 풀어준다.

왜 새 IaC 도구를 만들지 않고 매크로로 했을까. 답은 **운영 자산 재활용**이다. CloudFormation은 이미 Drift Detection, StackSets, Change Set, Rollback 같은 13년 묵은 엔터프라이즈 기능을 갖추고 있다. SAM이 별도 엔진이었다면 이 모든 걸 처음부터 다시 만들어야 했을 것이다. 매크로 방식 덕분에 SAM 사용자는 자동으로 CloudFormation의 모든 거버넌스 도구(IAM, Service Catalog, Config Rule)와 호환된다.

> 🔍 **더 깊이**: Transform 매크로의 내부 동작은 `aws cloudformation create-change-set --change-set-type CREATE --include-nested-stacks` 시점에 트리거된다. 매크로 Lambda는 원본 템플릿(JSON)을 받아 새 템플릿을 return하고, CFN 서비스는 그 결과를 가지고 ChangeSet을 계산한다. 즉 **`sam deploy`는 결국 `aws cloudformation deploy`의 wrapper**다. 차이는 SAM CLI가 `sam build`로 코드를 빌드하고 S3에 업로드한 후 `CodeUri`를 S3 URI로 치환해주는 단계가 있다는 것뿐이다. CloudFormation 콘솔에서 SAM 스택을 열어보면 "Processed template" 탭에 풀려진 진짜 템플릿이 보인다.

> 💡 **관련 이론**: 매크로 패턴은 Lisp의 hygienic macro(Kohlbecker, 1986)나 Scheme의 syntax-rules와 동일한 메타프로그래밍 모델이다. 도메인 특화 언어(DSL)를 호스트 언어(CFN) 위에 얹는 전형적인 "embedded DSL" 접근. 같은 패턴이 Terraform의 모듈, Pulumi의 component resource, Kubernetes의 CRD + Operator에서도 보인다. 공통 원칙은 **사용자가 의도를 선언하면 기계가 저수준 리소스로 풀어준다**는 declarative programming 철학.

## SAM과 다른 IaC 도구의 위치

| 도구 | 출시 | 추상화 모델 | AWS만 | 시험 비중 (DOP) |
|------|------|-------------|-------|-----------------|
| **CloudFormation** | 2011 | 선언적 리소스 그래프 | ✅ | 매우 높음 |
| **SAM** | 2016 | CFN Transform 매크로 (서버리스 DSL) | ✅ | 높음 |
| **Serverless Framework** | 2015 | 플러그인 + CFN 생성 | ❌ (멀티 클라우드) | 낮음 (v4 상업화) |
| **CDK** | 2019 | 코드 → CFN 합성 (Construct 트리) | ✅ | 중간 (계속 상승) |
| **Terraform** | 2014 | HCL + Provider 그래프 | ❌ | 낮음 (직접 출제 거의 없음) |
| **Pulumi** | 2018 | 코드 → 자체 엔진 | ❌ | 거의 없음 |

GCP에는 **Deployment Manager → Config Connector → Terraform** 흐름이 있고, Azure는 **ARM Template → Bicep**이 SAM과 가장 닮은 매크로 기반 추상화다. 특히 **Bicep**(2020)은 ARM JSON 위에 얹은 friendlier DSL이라는 점에서 SAM과 설계 철학이 거의 동일하다. 차이는 Bicep이 모든 ARM 리소스를 추상화하는 범용 DSL인 반면, SAM은 서버리스 6종 리소스(Function/Api/HttpApi/SimpleTable/StateMachine/LayerVersion)만 단순화한다는 점.

> 🎯 **시나리오**: "한 회사가 Lambda + API Gateway + DynamoDB 50개를 운영 중이고, CloudFormation 템플릿이 2000줄을 넘었다. 운영 부담을 줄이면서 동일한 거버넌스(StackSets, Drift Detection)를 유지하려면?" — 답은 **SAM 마이그레이션**. CDK도 같은 효과를 내지만 TypeScript 학습 곡선이 추가되고, Terraform은 CloudFormation 거버넌스 도구(StackSets, Drift Detection의 동등물)를 잃는다.

## SAM Template의 본체: Globals와 Policy Templates

SAM이 보일러플레이트를 줄이는 두 가지 핵심 장치가 `Globals`와 `Policies`다.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: python3.12
    Architectures: [arm64]
    Timeout: 30
    MemorySize: 512
    Tracing: Active
    Environment:
      Variables:
        LOG_LEVEL: INFO
        POWERTOOLS_SERVICE_NAME: orders

Resources:
  GetOrderFn:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src/get_order/
      Handler: app.handler
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref OrdersApi
            Path: /orders/{id}
            Method: GET
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref OrdersTable
        - SSMParameterReadPolicy:
            ParameterName: !Sub '/${Env}/orders/*'

  OrdersApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName: prod
      Auth:
        Authorizers:
          CognitoAuth:
            JwtConfiguration:
              issuer: !Sub 'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPoolId}'
              audience: [!Ref AppClientId]
            IdentitySource: $request.header.Authorization
        DefaultAuthorizer: CognitoAuth

  OrdersTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      PrimaryKey: {Name: id, Type: String}
```

`Globals`는 함수가 50개라도 공통 속성을 한 곳에서 관리한다. 개별 함수에서 같은 속성을 덮으면 함수 값이 우선. `Policies`는 사전 정의된 IAM 정책 템플릿 60여 개로, 흔한 권한 패턴을 한 줄로 표현한다.

| Policy Template | 풀려진 IAM Action |
|-----------------|--------------------|
| `DynamoDBReadPolicy` | `dynamodb:GetItem/BatchGetItem/Query/Scan/DescribeTable` on table+index |
| `DynamoDBCrudPolicy` | + `PutItem/UpdateItem/DeleteItem/BatchWriteItem` |
| `S3ReadPolicy` | `s3:GetObject/GetObjectAcl/GetObjectVersion/...` on bucket/* |
| `SQSPollerPolicy` | `sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes/ChangeMessageVisibility` |
| `KMSDecryptPolicy` | `kms:Decrypt` on specific key |
| `LambdaInvokePolicy` | `lambda:InvokeFunction` on specific function |
| `SSMParameterReadPolicy` | `ssm:GetParameter*/DescribeParameters` |
| `VPCAccessPolicy` | ENI 생성·삭제 + DescribeNetworkInterfaces (VPC 함수용) |

> ⚠️ **함정**: Policy Template은 **least privilege**처럼 보이지만 실제로는 그렇지 않다. `DynamoDBReadPolicy: TableName`은 테이블 자원에 더해 **모든 GSI/LSI**까지 권한을 준다. PCI/HIPAA 환경에서는 직접 `Policies: - Statement:` 블록으로 정확한 ARN을 명시하는 게 안전하다. AWS는 [공식 GitHub](https://github.com/aws/serverless-application-model/blob/master/samtranslator/policy_templates_data/policy_templates.json)에 모든 템플릿의 실제 IAM JSON을 공개해두었으니 도입 전 한 번은 읽어보는 게 좋다.

## sam local: Docker 기반 에뮬레이션의 진실

`sam local invoke`와 `sam local start-api`는 개발자의 첫 인상을 만드는 기능이다. 내부적으로는 `public.ecr.aws/lambda/<runtime>:latest` 이미지를 풀(pull)해 컨테이너로 실행하고, 컨테이너 안에서 Lambda Runtime Interface Emulator(RIE)가 함수를 호출한다.

```bash
# 단일 호출
sam local invoke GetOrderFn -e events/get-order.json

# API Gateway 에뮬레이션 (포트 3000)
sam local start-api --port 3000 --warm-containers EAGER

# 다른 함수가 RIE 엔드포인트 호출 가능 (SDK URL endpoint 변경)
sam local start-lambda --port 3001
```

RIE는 실제 Lambda 서비스의 **Lambda Runtime API**(`/2018-06-01/runtime/invocation/next`)를 그대로 흉내 낸 HTTP 서버다. 그래서 같은 코드가 로컬과 클라우드에서 동일하게 동작하지만, **에뮬레이션에 본질적인 한계**가 있다.

| 에뮬레이션되지 않는 부분 | 영향 |
|---------------------------|------|
| **Cold start 시간** | 로컬은 Docker 컨테이너 재사용. 실제 Lambda의 init 비용 측정 불가 |
| **IAM 권한** | 로컬은 호스트의 AWS credential 사용 — IAM Role의 deny 정책 검증 불가 |
| **Network throttling** | 실제 Lambda의 ENI/VPC latency 재현 불가 |
| **CPU 비율** | Lambda는 MemorySize에 비례해 CPU/network 할당, 로컬은 호스트 CPU 풀로 |
| **Lambda Insights / X-Ray** | 일부 메타데이터 부재 |
| **Extension Layer** | 로컬에서도 동작하지만 lifecycle 이벤트 일부 차이 |

> 🔍 **더 깊이**: Lambda Runtime API는 long-poll 방식이다. 함수 런타임이 `GET /next`를 호출하고 무한 대기, 새 invocation이 들어오면 응답으로 payload + requestId가 내려온다. 함수가 처리 후 `POST /response`나 `POST /error`로 결과를 돌려주면 다음 long-poll 사이클로. 이 모델 덕분에 한 컨테이너가 여러 invocation을 순차 처리(reuse)할 수 있고, **execution context 재사용**(컨테이너 변수, DB 연결 풀)이 가능해진다. SAM Local은 이 정확한 API를 재현하므로 코드 호환성은 보장된다.

> 📚 **사례**: 2020년 한 핀테크가 `sam local invoke`로 모든 테스트를 통과시킨 후 프로덕션 배포했더니 Lambda가 즉시 throttle됐다. 원인은 함수가 **VPC 내부 RDS Proxy**에 연결하면서 ENI 생성에 8~10초가 걸렸고, API Gateway 30초 timeout이 발동한 것. 로컬에서는 호스트 네트워크를 그대로 쓰므로 이 latency가 없었다. 교훈: 로컬 테스트는 로직 검증, **integration test는 반드시 dev/staging 클라우드 환경**에서.

## sam sync와 hotswap: 개발 가속의 위험한 단축키

2021년 SAM CLI 1.31에 추가된 `sam sync --watch`는 개발 속도의 게임 체인저다.

```bash
sam sync --watch --stack-name myapp-dev
# 파일 변경 감시
# 코드 변경 → S3 직접 업로드 + lambda update-function-code (CFN 우회, 5~10초)
# 인프라 변경 → CloudFormation Change Set (정상 30~60초)
```

내부적으로 sam sync는 변경을 두 종류로 분류한다.

- **Code-only change**: Lambda 함수 코드, Layer 콘텐츠, Step Functions 정의, API Gateway OpenAPI 스펙 → `boto3.client('lambda').update_function_code()` 등으로 직접 패치
- **Infrastructure change**: 새 리소스, 환경 변수, IAM 정책 → 일반 CFN 경로

CDK도 똑같은 개념을 `cdk deploy --hotswap`으로 제공한다. 두 도구 모두 **CloudFormation의 트래킹이 사라지므로 프로덕션 비권장**이다.

> ⚠️ **함정**: hotswap된 리소스는 CloudFormation 입장에서 **drift 상태**가 된다. 즉 다음 `sam deploy` 또는 `cdk deploy`가 hotswap된 변경을 덮어쓴다. 게다가 IAM Role, API Gateway 라우팅 같은 핵심 인프라는 hotswap이 안 되므로 보안 정책 변경은 여전히 ChangeSet으로 진행해야 한다. 프로덕션 파이프라인에는 `sam deploy --no-disable-rollback` 같이 명시적 보호를 두는 게 안전하다.

## SAM Pipelines: CodePipeline 자동 생성기

```bash
sam pipeline bootstrap   # 환경별(dev/staging/prod) IAM Role, S3, ECR 생성
sam pipeline init         # 템플릿 선택 (CodePipeline / Jenkins / GitLab / GitHub Actions)
```

bootstrap이 만들어주는 자원은 4종 세트다.

1. **Pipeline execution role** (CodePipeline이 가정)
2. **Cloudformation execution role** (CFN이 리소스 생성 시 가정)
3. **Artifact S3 bucket** (CodeBuild 결과물 저장)
4. **ECR repo** (컨테이너 이미지 Lambda인 경우)

이 자원들이 **각 환경별 AWS 계정**에 따로 만들어진다(멀티 계정 권장). 그래서 prod 계정에는 prod-bootstrap 자원만 있고, dev 계정에는 dev-bootstrap만 있는 깔끔한 격리가 된다.

```toml
# samconfig.toml — 멀티 환경
version = 0.1

[staging.deploy.parameters]
stack_name = "myapp-staging"
s3_bucket = "myapp-staging-artifacts"
region = "ap-northeast-2"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Environment=staging UserPoolId=..."

[prod.deploy.parameters]
stack_name = "myapp-prod"
s3_bucket = "myapp-prod-artifacts"
region = "ap-northeast-2"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Environment=prod UserPoolId=..."
confirm_changeset = true
```

> 💡 **관련 이론**: 환경별 자원 격리는 NIST SP 800-204C(Cloud-Native Application 보안)의 "namespace isolation" 원칙과 연결된다. 권한이 한 환경에서 다른 환경으로 lateral movement 하지 못하도록 가드레일을 친다. AWS Well-Architected Framework의 Security Pillar 중 "Separate workloads using accounts"가 이 원칙의 권고다.

## DeploymentPreference: Canary/Linear/AllAtOnce

SAM이 CodeDeploy를 한 줄로 연결하는 마법.

```yaml
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
```

`AutoPublishAlias: live`가 켜지면 `sam deploy` 시 다음이 자동 발생한다.

1. 함수 코드 변경 감지 → 새 Version 게시(예: V7)
2. `live` Alias가 V6→V7로 시프트 (CodeDeploy가 단계적으로)
3. 각 단계에서 Alarm 모니터, 발동 시 즉시 롤백

| Type | 트래픽 진행 |
|------|-------------|
| `Canary10Percent5Minutes` | 10% → 5분 대기 → 100% |
| `Canary10Percent30Minutes` | 10% → 30분 → 100% |
| `Linear10PercentEvery1Minute` | 10%씩 1분 간격으로 증가 |
| `Linear10PercentEvery10Minutes` | 10%씩 10분 간격 |
| `AllAtOnce` | 100% 즉시 (테스트/dev용) |

> 🎯 **시나리오**: "신규 Lambda 버전을 배포할 때 1시간 동안 트래픽의 10%만 가게 한 후 자동으로 100%로 올리고, 5xx 에러가 1%를 넘으면 자동 롤백". 답은 `Canary10Percent30Minutes` + CloudWatch Alarm + Pre/Post Hook 조합. Linear는 점진적 증가, Canary는 두 단계, AllAtOnce는 즉시 — 시나리오 키워드의 "단계"를 캐치.

## CodePipeline에서 SAM을 실제로 굴리는 buildspec

```yaml
# buildspec.yml — CodeBuild 단계
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.12
    commands:
      - pip install aws-sam-cli
  build:
    commands:
      - sam build --use-container --cached
      - sam package --output-template-file packaged.yaml --s3-bucket $ARTIFACT_BUCKET
artifacts:
  files:
    - packaged.yaml
    - samconfig.toml
```

CodePipeline에서 packaged.yaml을 다음 Deploy Action(CloudFormation deploy)에 넘기면 끝. `sam build --use-container --cached`의 두 플래그가 중요한데, `--use-container`는 Lambda 런타임과 동일한 컨테이너에서 빌드해 native 의존성(C 확장, sharp 등) 호환성을 보장하고, `--cached`는 의존성이 안 바뀌면 재사용해 빌드 시간을 절반 이하로 줄인다.

> 📚 **사례**: 2022년 한 SaaS 팀이 macOS 로컬에서 `sam build`로 만든 Lambda zip을 그대로 prod에 올렸더니 함수가 `Runtime.ImportModuleError: pyodbc.so glibc version mismatch`로 죽었다. 원인은 macOS의 ODBC 라이브러리가 Linux glibc과 호환되지 않는 것. `--use-container` 한 줄이 한 시간짜리 인시던트를 막아준다.

## 정리하며

오늘 본 그림은 세 가지다. 첫째, SAM은 **CloudFormation Macro 위에 얹은 서버리스 DSL**이고, 배포 시점에 평범한 CFN으로 풀어진다. 그래서 CFN의 13년 묵은 거버넌스(StackSets, Drift, ChangeSet) 자산을 그대로 쓸 수 있다. 둘째, `sam local`은 Docker + RIE로 Lambda Runtime API를 정확히 재현하지만 **cold start, IAM, 네트워크 latency는 에뮬레이션되지 않는다**. 셋째, `sam sync --watch`와 `cdk deploy --hotswap`은 개발 가속에는 강력하지만 CloudFormation의 트래킹을 깨므로 프로덕션 금지.

다음 글에서는 SAM의 대안인 **Serverless Framework**와 **CDK Lambda**를 본다. 셋 중 어느 도구를 골라야 하는지의 기준은 워크로드 성격과 팀 언어, 그리고 거버넌스 요구가 결정한다.

---

## 📝 연습 문제

**문제 1.** SAM Template의 첫 줄 `Transform: AWS::Serverless-2016-10-31`의 실제 동작은?

A) CloudFormation Macro로 SAM 의사 리소스를 CFN 네이티브 리소스로 확장
B) Lambda 코드를 Python으로 변환
C) 배포 시 자동으로 IAM Role 생성
D) sam build를 트리거

**정답: A**
해설: Transform은 CloudFormation 매크로 메커니즘(2016)으로, 템플릿이 CFN 엔진에 도달하기 전에 별도 Lambda 매크로가 템플릿을 다시 쓴다. `AWS::Serverless::Function`은 매크로 처리 후 `AWS::Lambda::Function` + `AWS::IAM::Role` + `AWS::Lambda::Permission` 등 6~8개 진짜 리소스로 풀어진다. B는 코드 변환과 무관, C는 매크로 처리의 결과 중 하나일 뿐 매크로 자체의 역할이 아님, D는 sam CLI의 별도 단계. CFN 콘솔 "Processed template" 탭에서 풀려진 결과를 확인 가능.

---

**문제 2.** `sam local invoke`로 검증되지 않는 영역으로 가장 위험한 것은?

A) 함수 로직의 정상 입력 처리
B) IAM Role의 deny 정책 + 실제 VPC ENI 생성 latency
C) JSON 파싱 오류
D) 환경 변수 로딩

**정답: B**
해설: SAM Local은 호스트의 AWS credential을 그대로 사용하므로 IAM Role의 권한 경계 검증이 안 된다. 또 VPC ENI 생성(8~10초), RDS Proxy 연결, 보안 그룹의 egress 규칙 같은 네트워크 latency가 로컬엔 없다. 2020년 핀테크 사례처럼 로컬은 통과하고 prod에서 timeout으로 죽는 시나리오의 전형. A/C/D는 모두 로컬에서 검증 가능. 교훈: 로컬은 로직, integration은 dev 클라우드.

---

**문제 3.** Lambda 신규 버전 배포 시 30분 동안 트래픽 10%만 가게 하고, 5xx 알람 발생 시 즉시 롤백되도록 SAM에 설정하려면?

A) `DeploymentPreference: AllAtOnce` + Alarm
B) `DeploymentPreference: Linear10PercentEvery10Minutes` + Alarm
C) `DeploymentPreference: Canary10Percent30Minutes` + CloudWatch Alarm 연결
D) sam sync --watch

**정답: C**
해설: Canary 패턴은 "처음 N% → 일정 시간 대기 → 100%"의 2단계. Canary10Percent30Minutes는 10%로 30분 운영 후 100%로 점프. Linear(B)는 10%씩 1/10분 간격으로 계속 증가하는 다단계라 시나리오의 "10% 30분 후 100%"와 의미가 다름. AllAtOnce(A)는 즉시 100%. sam sync(D)는 개발 가속, 트래픽 시프트와 무관. Alarm 연결 시 CodeDeploy가 발동 즉시 이전 Version으로 자동 롤백.

---

**문제 4.** `sam build --use-container --cached`의 두 플래그가 함께 주는 이점은?

A) Lambda 런타임 컨테이너에서 빌드해 native 의존성 호환성 보장 + 의존성 미변경 시 재사용으로 빌드 시간 단축
B) 비용 절감
C) 자동 IAM 권한 부여
D) 자동 Canary 활성화

**정답: A**
해설: macOS/Windows에서 빌드한 Python `.so` 파일이 Lambda Linux glibc와 호환되지 않는 게 흔한 문제(2022 SaaS 사례). `--use-container`는 Lambda 런타임과 동일한 컨테이너 이미지에서 빌드해 이 문제 해결. `--cached`는 requirements 변경 없으면 의존성 레이어 재사용. 빌드 시간이 1/2~1/3로 단축. B/C/D는 무관.

---

**문제 5.** `sam sync --watch`를 프로덕션에 사용하면 안 되는 가장 큰 이유는?

A) 비용이 더 든다
B) CloudFormation의 트래킹을 우회해 drift 발생, 다음 sam deploy가 변경을 덮어씀
C) 한국 리전 미지원
D) Java 함수 미지원

**정답: B**
해설: sam sync는 코드 변경을 `update-function-code` API로 직접 패치하므로 CFN 스택의 상태와 실제가 어긋난다(drift). 다음 정규 sam deploy가 CFN 상태 기준으로 변경을 덮어쓰면서 hotswap 변경이 사라진다. 또 ChangeSet이 안 생성되므로 변경 이력·승인 워크플로가 무력화. 개발 가속용 도구로 명시되어 있고 프로덕션에는 일반 sam deploy + CodeDeploy 조합이 표준.

---

**문제 6.** SAM Policy Template의 한계로 가장 정확한 것은?

A) 비용이 추가된다
B) `DynamoDBReadPolicy: TableName`은 해당 테이블의 모든 GSI/LSI 권한까지 포함 — 진정한 least privilege가 아닐 수 있음
C) IAM 정책 평가가 느려진다
D) Lambda Layer와 충돌

**정답: B**
해설: Policy Template은 보일러플레이트를 줄여주지만 권한 범위가 직접 작성한 IAM JSON보다 넓을 수 있다. AWS는 공식 GitHub에 모든 템플릿의 풀려진 IAM JSON을 공개해두었으니 PCI/HIPAA 환경에서는 도입 전 검토 필요. 정확한 least privilege가 필요하면 `Policies: - Statement: - Effect: Allow, Action: [...], Resource: [...]` 블록으로 직접 작성. A/C/D는 모두 무관.

---

**문제 7.** SAM Pipelines의 `sam pipeline bootstrap`이 환경별 계정에 생성하는 자원은?

A) Lambda 함수 + DynamoDB 테이블
B) Pipeline execution role + CFN execution role + Artifact S3 + (옵션) ECR repo
C) VPC + Subnet + NAT Gateway
D) Cognito User Pool

**정답: B**
해설: bootstrap은 CI/CD 인프라(권한 + 아티팩트 저장소)만 만든다. 4종 세트가 각 환경 계정에 격리되어 prod 계정의 자원에 dev 파이프라인이 접근 못 함(NIST SP 800-204C의 namespace isolation 원칙). 애플리케이션 자원(Lambda, Dynamo)은 이후 sam deploy로 생성. A/C/D는 애플리케이션 영역이라 bootstrap과 무관.

---

## 📌 오늘의 요약

오늘 다룬 SAM의 핵심은 (1) CloudFormation Transform Macro로 동작해 CFN 거버넌스 자산을 재활용, (2) Globals와 Policy Templates로 보일러플레이트 제거, (3) sam local의 RIE 기반 에뮬레이션은 로직 검증용이지 integration test 대용은 아님, (4) sam sync hotswap은 개발 가속용이고 prod에서 drift 위험, (5) DeploymentPreference + AutoPublishAlias로 CodeDeploy Canary를 한 줄로 활성화 — 다섯 가지다.
