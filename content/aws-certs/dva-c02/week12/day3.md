# Day 58 - SAM: 서버리스를 위해 CloudFormation을 압축하다

CloudFormation으로 람다 함수 하나를 제대로 배포하려면 생각보다 많은 게 필요하다. `AWS::Lambda::Function`만 있는 게 아니라, 그 함수를 호출할 권한(`AWS::Lambda::Permission`), 실행 역할(`AWS::IAM::Role`), API Gateway라면 RestApi·Resource·Method·Deployment·Stage가 줄줄이 따라붙는다. 함수 하나에 50~100줄의 보일러플레이트가 붙는 셈이다. 서버리스는 "작은 함수를 빠르게"가 핵심인데, 정작 그 함수를 선언하는 데 드는 수고가 너무 컸다. **AWS SAM(Serverless Application Model)** 은 이 문제를 정면으로 친다 — 서버리스에 특화된 짧은 문법을 제공하고, 배포 시 그것을 완전한 CloudFormation으로 "펼쳐(transform)" 준다.

DVA-C02에서 SAM은 배포 도메인의 단골이다. 단순 암기(Transform 선언 필수, Policy Templates 이름)도 나오지만, "SAM이 CloudFormation과 무슨 관계인가", "sam local은 무엇을 시뮬레이트하고 무엇은 못 하나", "Policy Templates가 왜 안전한가" 같은 동작 원리가 더 중요하다. 이번 글은 SAM이 매크로(macro)로서 어떻게 CloudFormation 위에 얹히는지, `sam local`이 Docker로 무엇을 흉내 내는지, Policy Templates가 최소 권한과 어떻게 연결되는지, 그리고 SAM의 배포 가속 기능들이 무엇을 트레이드오프하는지를 깊이 파고든다.

## SAM의 정체: CloudFormation 매크로

SAM을 "CloudFormation과 별개의 서비스"로 오해하기 쉽지만, **SAM은 CloudFormation의 확장(매크로)** 이다. 별도의 배포 엔진이 따로 있는 게 아니라, 결국 CloudFormation이 SAM 템플릿을 받아 일반 CloudFormation 리소스로 변환한 뒤 배포한다. 이 변환을 일으키는 한 줄이 템플릿 맨 위의 `Transform: AWS::Serverless-2016-10-31`이다. 이 선언이 있으면 CloudFormation은 "이 템플릿엔 SAM 단축 리소스가 들어 있으니 펼쳐서 처리하라"고 안다.

그래서 `AWS::Serverless::Function` 한 줄이 배포 시점에 Lambda 함수 + 실행 역할 + 이벤트 소스 + 호출 권한으로 **펼쳐진다(expand)**. SAM은 "자주 쓰는 서버리스 조합을 짧게 쓰게 해주는 속기(shorthand)"인 셈이다. 이 사실이 시험에서 중요한 이유는, "SAM으로 못 하는 건 CloudFormation으로 떨어진다"는 것이다 — SAM 템플릿 안에 일반 CloudFormation 리소스(`AWS::S3::Bucket` 등)를 그대로 섞어 쓸 수 있다. SAM은 CloudFormation을 대체하는 게 아니라 그 위에 얹힌 편의 레이어다.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31   # 이 한 줄이 SAM을 켠다

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    Environment:
      Variables:
        TABLE_NAME: !Ref OrdersTable

Resources:
  CreateOrderFunction:
    Type: AWS::Serverless::Function       # 배포 시 Lambda+Role+Permission으로 펼쳐짐
    Properties:
      Handler: src/handlers/create_order.handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref OrdersTable
      Events:
        CreateOrder:
          Type: Api
          Properties: { Path: /orders, Method: POST }

  OrdersTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      PrimaryKey: { Name: orderId, Type: String }
```

| SAM 리소스 | 펼쳐지는 CloudFormation |
|------------|--------------------------|
| `AWS::Serverless::Function` | Lambda Function + IAM Role + EventSource + Permissions |
| `AWS::Serverless::Api` | API Gateway RestApi + Deployment + Stage + Methods |
| `AWS::Serverless::HttpApi` | API Gateway V2 (HTTP API) |
| `AWS::Serverless::SimpleTable` | DynamoDB Table |
| `AWS::Serverless::StateMachine` | Step Functions |
| `AWS::Serverless::LayerVersion` | Lambda Layer |

> 💡 **관련 이론**: SAM은 CloudFormation의 **매크로(macro)** 메커니즘으로 구현된다. 매크로는 "템플릿을 배포 직전에 프로그램으로 변형(transform)하는" 후크다 — 컴파일러의 매크로 전개(macro expansion)와 같은 발상이다. C 언어의 `#define`이 컴파일 전에 텍스트를 펼치듯, SAM의 `Transform`은 배포 전에 짧은 서버리스 리소스를 완전한 CloudFormation으로 펼친다. 이 "전처리기로서의 매크로"라는 구조 덕분에 SAM은 새 배포 엔진을 만들지 않고도 CloudFormation의 모든 기능(롤백, 의존 그래프, Change Set)을 그대로 물려받는다. CloudFormation을 다시 발명하지 않고 그 위에 얹은 영리한 설계다.

> ⚠️ **함정**: `Transform: AWS::Serverless-2016-10-31` 선언이 없으면 CloudFormation은 `AWS::Serverless::Function`을 "알 수 없는 리소스 타입"으로 보고 실패한다. 시험에서 "SAM 템플릿이 배포되지 않는다 / 리소스 타입을 인식 못 한다"가 보이면 Transform 누락이 1순위 의심이다. 날짜(2016-10-31)는 고정 식별자라 바뀌지 않는다.

## Policy Templates: 최소 권한을 속기로

서버리스에서 IAM 역할을 손으로 쓰는 건 고통스럽고 위험하다. 귀찮다고 `AdministratorAccess`나 `dynamodb:*`를 붙이면 최소 권한 원칙이 깨진다. 정확히 쓰자니 액션 이름(`dynamodb:PutItem`, `GetItem`, `Query`...)과 리소스 ARN을 일일이 적어야 한다. SAM의 **Policy Templates**는 이 사이의 균형점이다 — "이 함수는 이 테이블에 CRUD가 필요하다"는 의도를 한 줄로 적으면, SAM이 그에 맞는 **정확한 최소 권한 IAM 정책으로 펼쳐**준다.

```yaml
Policies:
  - DynamoDBCrudPolicy:        # 그 테이블에만, CRUD 액션만
      TableName: !Ref OrdersTable
  - S3ReadPolicy:              # 그 버킷 읽기만
      BucketName: !Ref MyBucket
  - SQSPollerPolicy:           # 그 큐 폴링 권한만
      QueueName: !GetAtt MyQueue.QueueName
```

핵심은 Policy Template이 **리소스 범위를 좁힌다**는 것이다. `DynamoDBCrudPolicy`는 `dynamodb:*`가 아니라 CRUD에 필요한 액션만, 그것도 지정한 테이블 ARN에만 부여한다. 의도를 선언하면 최소 권한이 자동으로 따라오는 구조다.

> 💡 **관련 이론**: Policy Templates는 보안의 **"안전한 기본값(secure by default)"** 철학의 구현이다. 개발자가 가장 쉬운 길을 택해도 안전하도록 설계하는 것 — `dynamodb:*`를 손으로 쓰는 것보다 `DynamoDBCrudPolicy: { TableName: ... }`를 쓰는 게 더 짧으니, 개발자는 자연히 최소 권한 쪽으로 유도된다. 보안을 "추가로 노력해야 하는 일"이 아니라 "가장 편한 기본 경로"로 만드는 설계 원칙이다. 같은 철학이 SAM Connector(2023)에도 들어 있다 — 두 리소스를 연결하면 필요한 IAM 정책을 자동 생성해, 권한을 손으로 넓게 여는 유혹을 없앤다.

> 🔍 **더 깊이**: Policy Templates는 미리 정의된 목록(약 100여 종)에서만 고를 수 있다. 거기 없는 권한이 필요하면 인라인 정책(`Statement`)을 직접 쓰거나 관리형 정책 ARN을 참조해야 한다. 또 한 함수에 Policy Templates와 인라인 정책을 섞을 수 있다. SAM은 이것들을 모아 그 함수 전용 IAM 역할을 만들어 붙인다 — 즉 함수마다 자기 전용 역할이 생기는 게 SAM의 기본 동작이라, 함수 간 권한이 자연스럽게 격리된다.

## sam local: Docker로 무엇을 흉내 내는가

`sam local`은 "AWS에 배포하지 않고 내 노트북에서 Lambda를 돌려본다"는 강력한 개발 도구다. 그런데 정확히 무엇을, 어떻게 흉내 내는지를 알아야 시험 함정을 피한다. 핵심은 **`sam local`이 Docker 컨테이너로 Lambda 실행 환경을 재현**한다는 것이다 — Lambda가 실제로 도는 Amazon Linux 기반 런타임 이미지를 로컬 Docker로 띄워, 함수 코드를 그 안에서 실행한다. 그래서 **Docker가 반드시 설치돼 있어야** 한다.

```bash
sam build                                    # 의존성 설치 + 패키징
sam local invoke CreateOrderFunction \
    --event events/create_order.json         # 단일 함수를 이벤트로 1회 실행
sam local start-api --port 3000              # 로컬 API Gateway 흉내, http://localhost:3000
sam logs -n CreateOrderFunction --tail       # 실제 배포된 함수의 CloudWatch 로그 tail
```

중요한 한계: `sam local`은 **Lambda 실행 환경만 로컬로 흉내 낼 뿐, DynamoDB·S3·SQS 같은 다른 AWS 서비스는 진짜 AWS 리소스를 호출**한다(또는 로컬 에뮬레이터를 따로 띄워야 한다). 즉 로컬에서 함수를 실행해도 그 함수가 DynamoDB에 쓰면 실제 클라우드의 DynamoDB에 쓴다. "완전히 오프라인"이 아니라 "함수 실행만 로컬, 백엔드는 실제"라는 점이 핵심이다.

> ⚠️ **함정**: "sam local이 안 된다"의 가장 흔한 원인은 Docker 미설치/미실행이다. 또 "로컬에서는 되는데 배포하면 안 된다"는 보통 IAM 권한 차이다 — 로컬 실행은 내 개발자 자격 증명을 쓰지만, 배포된 함수는 자기 실행 역할(Policy Templates로 만든)을 쓴다. 로컬에서 넓은 권한으로 잘 되던 게 배포 후 좁은 역할에서 AccessDenied가 나는 식이다. "로컬 OK, 배포 실패 = 권한 차이"로 의심한다.

## Globals: 반복을 줄이는 공통 설정

서버리스 앱은 함수가 수십 개가 되기 쉽고, 그 함수들이 같은 런타임·타임아웃·환경 변수를 공유하는 경우가 많다. 매 함수에 같은 설정을 반복하면 DRY 원칙이 깨진다. **Globals** 섹션은 Function·Api·HttpApi·SimpleTable에 공통 적용할 기본값을 한 번에 선언한다.

```yaml
Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables: { LOG_LEVEL: INFO }
  Api:
    Cors: "'*'"
```

개별 리소스에서 같은 속성을 다시 적으면 그것이 Globals를 **재정의(override)** 한다 — 대부분의 함수는 기본 타임아웃 30초를 쓰되, 무거운 함수 하나만 개별적으로 300초로 올리는 식이다.

> 💡 **관련 이론**: Globals의 재정의 규칙은 CSS의 캐스케이딩이나 설정 파일의 계층적 병합(hierarchical merge)과 같은 패턴이다 — "넓은 범위의 기본값을 좁은 범위가 덮어쓴다." 다만 병합 방식에 미묘함이 있다. 단순 스칼라(Timeout)는 개별 값이 통째로 덮어쓰지만, 환경 변수 같은 맵은 키 단위로 병합된다(Globals의 `LOG_LEVEL`과 개별 함수의 새 변수가 합쳐짐). 이 "스칼라는 대체, 맵은 병합"이라는 규칙은 거의 모든 계층적 설정 시스템이 공유한다.

## 배포 가속: sam sync와 그 트레이드오프

SAM CLI는 배포를 빠르게 하는 기능들을 제공하는데, 각각이 무엇을 트레이드오프하는지 알면 시험에서 헷갈리지 않는다.

| 명령/기능 | 하는 일 | 트레이드오프 |
|-----------|---------|--------------|
| `sam deploy --guided` | 첫 배포 시 wizard로 설정, `samconfig.toml`에 저장 | 이후 `sam deploy`만으로 가능 |
| `sam deploy` | 전체 CloudFormation 스택 배포(안전) | 느림(CFN 변경 셋 처리) |
| `sam sync --watch` | 코드 변경 시 Lambda 코드만 즉시 업데이트 | 빠르지만 CFN 상태를 우회 → **개발 전용** |
| `sam pipeline init` | CI/CD 파이프라인 골격 생성(CodePipeline/GitHub Actions) | — |

핵심은 **`sam sync`가 빠른 대가로 무엇을 포기하는가**다. `sam sync`는 코드만 바뀌면 CloudFormation을 거치지 않고 Lambda의 코드를 직접 업데이트해 수 초 만에 반영한다. 빠르지만, 이렇게 하면 **CloudFormation이 보는 스택 상태와 실제 함수가 어긋날(drift) 수 있다**. 그래서 `sam sync`는 개발 중 빠른 반복용이고, 프로덕션 배포는 반드시 `sam deploy`(전체 CloudFormation 경로)로 해야 한다.

> 📚 **사례**: SAM의 안전 배포(safe deployment)는 CodeDeploy와 결합해 **Canary/Linear 배포**를 자동화한다. 새 Lambda 버전으로 트래픽을 한 번에 100% 보내지 않고, 예를 들어 `Canary10Percent5Minutes`로 10%만 5분간 보내 CloudWatch 알람을 지켜본 뒤 문제없으면 나머지를 넘긴다. 알람이 울리면 자동 롤백한다. 이는 "새 버전을 점진적으로 노출해 사고 반경을 줄인다"는 점진 배포(progressive delivery) 패턴의 구현으로, 한 번의 배포가 전체 트래픽을 망가뜨리는 사고를 막는다. SAM 템플릿의 `AutoPublishAlias` + `DeploymentPreference`로 선언한다.

## 정리하며

SAM을 관통하는 한 문장은 "CloudFormation 매크로로 서버리스 보일러플레이트를 압축하되, 배포·롤백·의존 그래프는 CloudFormation을 그대로 물려받는다"이다. `Transform` 한 줄이 `AWS::Serverless::Function`을 Lambda+Role+Permission으로 펼치고, Policy Templates는 최소 권한을 가장 편한 기본 경로로 만들며, `sam local`은 Docker로 함수 실행만 흉내 내되 백엔드는 실제 AWS를 쓴다. Globals는 계층적 병합으로 반복을 줄이고, `sam sync`는 속도를 위해 CFN 상태 일관성을 포기하므로 개발 전용이다. CodeDeploy와 결합한 Canary 배포는 점진 배포로 사고 반경을 줄인다. 시험 함정 대부분은 "SAM이 결국 CloudFormation"이라는 사실과, "로컬/배포의 권한 차이"에서 나온다.

다음 글에서는 YAML조차 벗어나 진짜 프로그래밍 언어로 인프라를 짜는 CDK와, 시험에 나오는 서버리스 아키텍처 패턴으로 넘어간다.

---

## 📝 연습 문제

**문제 1.** 작성한 SAM 템플릿을 배포하니 CloudFormation이 `AWS::Serverless::Function`을 알 수 없는 리소스 타입이라며 실패한다. 원인은?

A) Runtime이 잘못됐다

B) 템플릿에 `Transform: AWS::Serverless-2016-10-31` 선언이 빠졌다

C) Globals 섹션이 없다

D) Outputs가 없다

**정답: B**

해설: SAM 단축 리소스(`AWS::Serverless::*`)는 **`Transform: AWS::Serverless-2016-10-31`** 선언이 있어야 CloudFormation이 매크로로 펼친다. 이 선언이 없으면 CloudFormation은 SAM 리소스를 알 수 없는 타입으로 보고 실패한다. 날짜는 고정 식별자다. A) Runtime 오류는 다른 에러를 낸다. C) Globals와 D) Outputs는 선택 사항이라 없어도 배포된다.

---

**문제 2.** SAM과 CloudFormation의 관계로 가장 정확한 것은?

A) SAM은 CloudFormation과 완전히 별개의 독립 배포 엔진이다

B) SAM은 CloudFormation 매크로로, 배포 시 서버리스 리소스를 일반 CloudFormation으로 펼쳐 배포한다

C) SAM이 CloudFormation을 대체한다

D) CloudFormation이 SAM의 하위 기능이다

**정답: B**

해설: SAM은 **CloudFormation의 확장(매크로)** 이다. `Transform`이 배포 직전 SAM 리소스를 완전한 CloudFormation 리소스로 펼치며, 별도 배포 엔진이 없으므로 롤백·의존 그래프·Change Set 등 CloudFormation의 기능을 그대로 물려받는다. 그래서 SAM 템플릿에 일반 CloudFormation 리소스도 섞어 쓸 수 있다. A·C는 둘을 별개/대체로 보는 오해다. D는 관계가 거꾸로다.

---

**문제 3.** Lambda 함수에 특정 DynamoDB 테이블에 대한 CRUD 권한만 최소로 부여하려 한다. SAM에서 가장 적절한 방법은?

A) 함수에 dynamodb:* 인라인 정책을 붙인다

B) DynamoDBCrudPolicy 정책 템플릿에 TableName을 지정한다

C) AdministratorAccess 관리형 정책을 붙인다

D) 모든 함수에 같은 역할을 공유한다

**정답: B**

해설: **`DynamoDBCrudPolicy`** 정책 템플릿에 `TableName`을 주면, SAM이 그 테이블 ARN에 한정된 CRUD 액션만 가진 최소 권한 정책으로 펼쳐 함수 전용 역할에 붙인다. 의도를 한 줄로 선언하면 최소 권한이 자동으로 따라오는 "안전한 기본값" 설계다. A) `dynamodb:*`는 필요 이상으로 넓다. C) Administrator는 최소 권한 위반이다. D) 역할 공유는 권한 격리를 깨고 사고 반경을 키운다.

---

**문제 4.** `sam local start-api`로 로컬 테스트를 하려는데 실행되지 않는다. 가장 가능성 높은 원인은?

A) Outputs 섹션 누락

B) Docker가 설치/실행되어 있지 않음

C) 리전이 잘못 설정됨

D) Globals 섹션 누락

**정답: B**

해설: `sam local`은 **Docker 컨테이너로 Lambda 실행 환경을 재현**하므로 Docker가 설치되고 실행 중이어야 한다. Docker가 없으면 로컬 실행 자체가 불가능하다. A·D는 선택 섹션이라 로컬 실행을 막지 않는다. C) 리전은 실제 백엔드 호출에 영향을 줄 수 있으나 `start-api` 기동 실패의 1순위 원인은 Docker다.

---

**문제 5.** 개발 중 코드 변경을 가장 빠르게 Lambda에 반영하고 싶지만, 이 방식을 프로덕션에 쓰면 안 되는 이유까지 고려해야 한다. 적절한 명령과 주의점은?

A) sam deploy — 가장 빠르므로 프로덕션에도 그대로 사용

B) sam sync --watch — 코드만 즉시 업데이트해 빠르지만 CloudFormation 상태와 어긋날 수 있어 개발 전용

C) sam build — 코드를 자동 배포

D) sam logs — 코드를 업데이트

**정답: B**

해설: **`sam sync --watch`** 는 코드 변경 시 CloudFormation을 거치지 않고 Lambda 코드를 직접 업데이트해 수 초 만에 반영한다. 빠른 대가로 CloudFormation이 보는 스택 상태와 실제 함수가 어긋날(drift) 수 있어 **개발 전용**이며, 프로덕션은 전체 CloudFormation 경로인 `sam deploy`로 배포해야 한다. A) `sam deploy`는 안전하지만 빠른 반복용은 아니다. C) `sam build`는 패키징이다. D) `sam logs`는 로그 조회다.

---

**문제 6.** 20개 Lambda 함수가 모두 같은 런타임과 타임아웃을 쓴다. 반복 설정을 줄이되 일부 함수만 다른 타임아웃을 주고 싶다. SAM에서의 방법은?

A) 함수마다 모든 속성을 반복해서 적는다

B) Globals.Function에 공통값을 두고, 예외 함수에서 해당 속성만 재정의한다

C) Mappings를 사용한다

D) Outputs에 정의한다

**정답: B**

해설: **Globals** 섹션에 공통 기본값(Runtime, Timeout 등)을 선언하면 모든 Function에 적용되고, 개별 함수에서 같은 속성을 다시 적으면 그것이 Globals를 **재정의**한다. "넓은 기본값을 좁은 범위가 덮어쓴다"는 계층적 병합 패턴이다. A) 반복은 DRY 위반이다. C) Mappings는 조회 테이블로 공통 속성 적용 용도가 아니다. D) Outputs는 출력값이라 무관하다.

---

**문제 7.** 새 Lambda 버전 배포 시 트래픽을 한 번에 100% 보내지 않고 10%만 보내 모니터링한 뒤 문제없으면 점진적으로 늘리고, 알람 시 자동 롤백하려 한다. SAM에서의 메커니즘은?

A) Globals로 전체 트래픽 즉시 전환

B) AutoPublishAlias + DeploymentPreference(Canary)로 CodeDeploy 기반 점진 배포

C) sam local invoke

D) DeletionPolicy: Retain

**정답: B**

해설: SAM은 `AutoPublishAlias`로 함수 버전 별칭을 만들고 **`DeploymentPreference`**(예: `Canary10Percent5Minutes`)로 CodeDeploy 기반 **점진 배포(Canary/Linear)** 를 선언한다. 새 버전에 트래픽을 일부만 보내 CloudWatch 알람을 지켜보고, 정상이면 나머지를 넘기며, 알람이 울리면 자동 롤백한다. 사고 반경을 줄이는 점진 배포 패턴이다. A) 즉시 전환은 점진 배포가 아니다. C) 로컬 실행은 배포와 무관하다. D) DeletionPolicy는 삭제 보호로 무관하다.
