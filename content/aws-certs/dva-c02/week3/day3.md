# Day 13 - Lambda 버전·별칭·레이어: Immutable 배포와 의존성 분리의 원리

소프트웨어 배포에서 "지금 실행 중인 게 정확히 무엇인지"를 알 수 있는 능력은 생각보다 중요하다. EC2 서버라면 SSH로 접속해서 패키지 버전을 확인할 수 있다. Lambda 함수라면? 코드를 올릴 때마다 `$LATEST`가 바뀌고, "3주 전에 배포한 버전"이 무엇이었는지 추적하기 어렵다. 버전(Version)과 별칭(Alias) 시스템은 이 문제를 해결하기 위해 설계됐다. 동시에 레이어(Layer)는 "공통 라이브러리를 매번 함수 ZIP에 포함시켜야 하는가"라는 중복 문제를 해결한다.

이 세 가지를 합치면 Lambda에서도 GitOps와 유사한 워크플로우가 가능해진다 — 코드 변경이 버전으로 불변 기록되고, 별칭이 트래픽을 점진적으로 새 버전으로 이전하며, CodeDeploy가 이 과정을 자동화한다.

## $LATEST, 버전, 별칭: 세 레이어의 역할

**$LATEST**는 항상 수정 가능한 현재 작업 버전이다. 코드를 업로드하거나 환경 변수를 바꾸거나 메모리를 조정하면 `$LATEST`가 바뀐다. ARN은 `arn:aws:lambda:region:account:function:my-func`이다 — 버전 suffix가 없다. 개발과 테스트에 사용하고, 프로덕션 트래픽을 직접 받게 하면 안 된다.

**버전(Version)**은 `publish-version`을 호출하는 순간 `$LATEST`의 스냅샷이 찍혀 불변(immutable) 객체가 된다. 코드, 런타임, 메모리, 타임아웃, 환경 변수, 레이어 — 이 모든 구성이 번호와 함께 고정된다. ARN은 `arn:aws:lambda:region:account:function:my-func:3`이다. 발행 후에는 어떤 것도 변경할 수 없다.

**별칭(Alias)**은 특정 버전을 가리키는 포인터다. ARN은 `arn:aws:lambda:region:account:function:my-func:prod`이다. 별칭의 핵심 특성은 **언제든지 변경 가능**하다는 것이다 — 별칭이 가리키는 버전을 바꿀 수 있다. API Gateway나 EventBridge에서 별칭 ARN을 참조하면, 함수를 새 버전으로 업그레이드할 때 외부 설정을 건드릴 필요가 없다.

```
$LATEST (수정 가능)
    │ publish-version
    ▼
버전 1 ─── (불변)
버전 2 ─── (불변)
버전 3 ─── (불변)  ◄──── 별칭 "prod" (90% 트래픽)
버전 4 ─── (불변)  ◄──── 별칭 "prod" (10% 트래픽) ← 카나리
                   ◄──── 별칭 "dev"
```

```bash
# 버전 발행
aws lambda publish-version \
  --function-name payment-api \
  --description "2026-05-31: 결제 로직 개선, PCI-DSS 검토 완료"

# 출력
{
  "Version": "7",
  "FunctionArn": "arn:aws:lambda:ap-northeast-2:123:function:payment-api:7"
}

# 별칭 생성 (버전 7을 prod로 지정)
aws lambda create-alias \
  --function-name payment-api \
  --name prod \
  --function-version 7 \
  --description "프로덕션 엔드포인트"

# 별칭 ARN
# arn:aws:lambda:ap-northeast-2:123:function:payment-api:prod
```

> 💡 **관련 이론**: Lambda 버전의 불변성은 **함수형 프로그래밍**의 immutable value 철학과 정확히 같다. 한 번 생성된 값은 절대 변하지 않는다. 이 원칙이 분산 시스템에서 값지는 이유는 **재현 가능성(reproducibility)** 때문이다. "3주 전 버전 3으로 롤백"이 가능한 것은 그 버전이 불변으로 보존됐기 때문이다. Git의 커밋 해시가 불변인 것과 동일한 논리다.

## 카나리 배포: 별칭의 트래픽 분할

별칭의 가장 강력한 기능은 **두 버전 간 가중치 기반 트래픽 분할**이다. 새 버전을 전체 트래픽에 즉시 노출하는 대신, 10%만 먼저 보내보고 문제가 없으면 100%로 전환한다.

```bash
# 카나리 배포: prod 별칭이 버전 7(90%) + 버전 8(10%)을 가리킴
aws lambda update-alias \
  --function-name payment-api \
  --name prod \
  --function-version 7 \
  --routing-config 'AdditionalVersionWeights={"8": 0.1}'

# 문제 없으면 100% 전환
aws lambda update-alias \
  --function-name payment-api \
  --name prod \
  --function-version 8 \
  --routing-config 'AdditionalVersionWeights={}'

# 문제 발생 시 즉시 롤백
aws lambda update-alias \
  --function-name payment-api \
  --name prod \
  --function-version 7 \
  --routing-config 'AdditionalVersionWeights={}'
```

> ⚠️ **함정**: 별칭 트래픽 분할은 **정확히 2개 버전만** 지원한다. 3개 버전으로 삼분할은 불가능하다. 또한 `$LATEST`를 별칭에서 가중치 대상으로 지정할 수 없다 — 반드시 발행된 버전 번호가 필요하다.

## CodeDeploy를 통한 Lambda 자동 배포

별칭의 트래픽 시프트를 수동으로 하는 대신, CodeDeploy가 자동화한다. 배포 전략 이름을 외워두면 시험에서 그대로 나온다.

| 배포 전략 | 동작 방식 |
|-----------|----------|
| `Canary10Percent5Minutes` | 10% → 5분 관찰 → 이상 없으면 100% |
| `Canary10Percent30Minutes` | 10% → 30분 관찰 → 100% |
| `Linear10PercentEvery1Minute` | 매 1분마다 10%씩 증가 (10분 후 100%) |
| `Linear10PercentEvery10Minutes` | 매 10분마다 10%씩 증가 (100분 후 100%) |
| `AllAtOnce` | 즉시 100% 전환 (롤백 안전장치 없음) |

CodeDeploy는 배포 중 CloudWatch Alarms를 모니터링한다. 에러율이 임계값을 넘으면 자동으로 이전 버전으로 롤백된다.

CodeDeploy AppSpec 파일에서 Before/After 훅을 지정하면 배포 전/후 검증 Lambda를 실행할 수 있다.

```yaml
# appspec.yml (SAM/CodeDeploy)
version: 0.0
Resources:
  - PaymentApiFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: !Ref PaymentApiFunction
        Alias: !Ref PaymentApiAlias
        CurrentVersion: !Ref CurrentVersion
        TargetVersion: !Ref NewVersion
Hooks:
  - BeforeAllowTraffic: !Ref PreDeploymentCheck    # 새 버전 검증
  - AfterAllowTraffic: !Ref PostDeploymentCheck    # 배포 완료 후 검증
```

> 📚 **사례**: Netflix는 Lambda 함수 배포에 Canary 전략을 사전 요구 사항으로 정했다. 초당 수백만 건의 스트리밍 이벤트를 처리하는 Lambda에서 배포 실수가 발생했을 때, AllAtOnce 전략이었다면 전체 서비스가 다운됐을 것이다. Canary + CloudWatch Alarm 자동 롤백 조합으로 실수를 5분 내에 감지하고 롤백하는 체계를 갖췄다.

## Lambda Layer: 공유 코드의 불변 버전 관리

레이어는 여러 Lambda 함수가 공통으로 사용하는 라이브러리, ML 모델, 데이터 파일을 공유하는 메커니즘이다. 함수 코드(ZIP)와 분리된 별도 ZIP을 S3에 올리고, 함수가 이를 참조한다. 실행 시 `/opt` 디렉토리에 자동으로 마운트된다.

**레이어 제한:**
- 함수당 최대 5개 레이어
- 함수 코드 + 모든 레이어 합계: 250MB(압축 해제 기준)
- 컨테이너 이미지 함수는 레이어를 사용할 수 없음

**레이어 경로 구조 (런타임별):**

| 런타임 | 레이어 경로 |
|--------|------------|
| Python | `/opt/python` 또는 `/opt/python/lib/pythonX.Y/site-packages` |
| Node.js | `/opt/nodejs/node_modules` |
| Java | `/opt/java/lib` |
| 공유 라이브러리(.so) | `/opt/lib` |
| 실행 파일 | `/opt/bin` |

```bash
# Python pandas 레이어 생성
mkdir -p python/lib/python3.12/site-packages
pip install pandas numpy -t python/lib/python3.12/site-packages/
zip -r pandas-layer.zip python/

# 레이어 발행
aws lambda publish-layer-version \
  --layer-name pandas-numpy \
  --zip-file fileb://pandas-layer.zip \
  --compatible-runtimes python3.12 python3.11 \
  --description "pandas 2.0 + numpy 1.26"

# 출력
{
  "LayerVersionArn": "arn:aws:lambda:ap-northeast-2:123:layer:pandas-numpy:3",
  "Version": 3
}

# 함수에 레이어 연결
aws lambda update-function-configuration \
  --function-name data-processor \
  --layers \
    arn:aws:lambda:ap-northeast-2:123:layer:pandas-numpy:3 \
    arn:aws:lambda:ap-northeast-2:123:layer:common-utils:7
```

> 🔍 **더 깊이**: 레이어도 버전 번호가 있으며 불변이다. 삭제된 레이어 버전이라도 이미 그 버전을 참조하고 있는 함수에서는 계속 동작한다(함수 실행 환경에 캐시되어 있기 때문). 레이어를 다른 계정과 공유하려면 `lambda:GetLayerVersion` 권한을 해당 계정 또는 전체에 부여하는 리소스 기반 정책을 레이어에 설정한다.

## 환경 변수: 코드와 구성의 분리

환경 변수는 코드를 수정하지 않고 함수 동작을 바꾸는 가장 간단한 방법이다. Twelve-Factor App 원칙의 세 번째 요소 — "Config in the Environment" — 를 Lambda에서 구현한 것이다.

**Lambda 예약 환경 변수(읽기 전용, 덮어쓰기 불가):**

| 변수명 | 값 예시 |
|--------|--------|
| `AWS_REGION` | `ap-northeast-2` |
| `AWS_LAMBDA_FUNCTION_NAME` | `my-function` |
| `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` | `256` |
| `AWS_LAMBDA_FUNCTION_VERSION` | `$LATEST` 또는 `3` |
| `AWS_LAMBDA_LOG_GROUP_NAME` | `/aws/lambda/my-function` |
| `_HANDLER` | `lambda_function.lambda_handler` |
| `LAMBDA_TASK_ROOT` | `/var/task` |
| `LAMBDA_RUNTIME_DIR` | `/var/runtime` |

**환경 변수 암호화:**

기본값: AWS 관리 키 `aws/lambda`로 저장 시 암호화. 콘솔에서 값을 볼 수 있다.
고객 관리 KMS 키(CMK): 팀별/함수별 격리. 다른 팀이 같은 AWS 계정에서도 환경 변수를 볼 수 없다.

> ⚠️ **함정**: 환경 변수는 최대 4KB 전체 크기 제한이 있다. 100개의 짧은 변수거나 하나의 긴 JSON 문자열이거나 합계가 4KB를 넘으면 함수 업데이트가 실패한다. 이 한도를 넘는 구성이 필요하면 SSM Parameter Store나 S3를 사용해야 한다.

## 환경 변수 vs SSM Parameter Store vs Secrets Manager

이 세 가지를 언제 어떻게 쓸지 결정하는 것이 DVA 시험의 단골 시나리오다.

| 항목 | 환경 변수 | SSM Parameter Store | Secrets Manager |
|------|----------|---------------------|-----------------|
| 비용 | 무료 | Standard: 무료, Advanced: $0.05/파라미터/월 | $0.40/시크릿/월 |
| 자동 로테이션 | ❌ | ❌ | ✅ (Lambda 기반 로테이션) |
| 버전 관리 | ❌ | ✅ | ✅ |
| 최대 크기 | 4KB 전체 | Standard 4KB / Advanced 8KB | 64KB |
| 캐싱 | 자동 (글로벌 변수) | AWS Parameters and Secrets Extension | AWS Parameters and Secrets Extension |
| 감사 로그(CloudTrail) | ❌ | ✅ | ✅ |
| 교차 계정 공유 | ❌ | ❌ | ✅ (Resource Policy) |
| 적합한 사용 사례 | 비밀이 아닌 설정 | 설정 + 환경별 파라미터 | DB 자격증명, API 키 |

**시험 시나리오별 답변:**
- "DB 비밀번호를 90일마다 자동 교체" → **Secrets Manager**
- "여러 함수가 같은 설정 값을 공유, 비용 최소화" → **SSM Parameter Store**
- "함수 코드 변경 없이 환경별 설정 분기 (dev/prod)" → **환경 변수 + 별칭**
- "다른 AWS 계정의 Lambda도 같은 DB 자격증명 사용" → **Secrets Manager (교차 계정 리소스 정책)**

> 💡 **관련 이론**: Secrets Manager의 자동 로테이션은 **Lambda 함수 기반**이다. AWS가 RDS, Redshift, DocumentDB 등 주요 엔진용 로테이션 Lambda를 미리 제공한다. 로테이션 시 Secrets Manager는 두 단계로 비밀을 바꾼다 — 먼저 새 비밀을 만들고(`createSecret`), 검증한 후(`testSecret`) 기존 것을 교체한다(`finishSecret`). 이 패턴은 **Blue-Green 배포**의 비밀 관리 버전이다.

## AWS Parameters and Secrets Lambda Extension

매 호출마다 Secrets Manager를 직접 호출하면 두 가지 문제가 생긴다. 첫째, API 호출 레이턴시가 추가된다(수십 ms). 둘째, Secrets Manager API 호출 비용이 쌓인다(10,000회당 $0.05).

AWS Parameters and Secrets Lambda Extension은 로컬 HTTP 서버(localhost:2773)로 캐싱을 제공한다.

```python
import urllib.request
import json
import os

SECRET_NAME = "prod/myapp/db"
SECRETS_PORT = 2773

def get_secret():
    """Lambda Extension 캐시를 통해 시크릿 가져오기"""
    url = f"http://localhost:{SECRETS_PORT}/secretsmanager/get?secretId={SECRET_NAME}"
    req = urllib.request.Request(url)
    req.add_header('X-Aws-Parameters-Secrets-Token', os.environ['AWS_SESSION_TOKEN'])
    
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read())
        return json.loads(data['SecretString'])

# 글로벌 캐시 (Extension의 TTL과 별도로 함수 환경 수준 캐싱)
_secret = None

def lambda_handler(event, context):
    global _secret
    if _secret is None:
        _secret = get_secret()
    
    db_password = _secret['password']
    # 사용...
```

Extension의 기본 캐시 TTL은 300초(5분)다. 로테이션된 시크릿이 반영되는 데 최대 5분이 걸릴 수 있다. 즉시 반영이 필요하면 TTL을 줄이거나 캐시를 비활성화(`PARAMETERS_SECRETS_EXTENSION_CACHE_ENABLED=false`)한다.

## 레이어를 이용한 의존성 분리 전략

레이어의 실무 활용 패턴 중 가장 효과적인 것은 "공통 레이어 + 얇은 함수 코드" 구조다.

```
레이어 1: 비즈니스 공통 유틸리티 (인증, 로깅, 에러 처리)  → 월 1~2회 업데이트
레이어 2: 외부 라이브러리 (pandas, boto3 최신 버전)      → 분기 1회 업데이트
레이어 3: ML 모델 파일                                  → 수 GB, 모델 재훈련 시
────────────────────────────────────────────────────
함수 코드: 순수 비즈니스 로직                            → 매 PR마다 업데이트
```

이렇게 분리하면 함수 코드 ZIP이 수십 KB로 줄어 배포가 빨라지고, 레이어는 Lambda 서비스가 캐싱해서 매 함수 호출마다 다시 다운로드하지 않는다.

> ⚠️ **함정**: 레이어 총합 250MB 제한에 걸리면 **컨테이너 이미지(최대 10GB)**로 전환해야 한다. ML 모델이 수 GB인 경우가 대표적이다. 단, 컨테이너 이미지를 사용하면 레이어를 쓸 수 없고, SnapStart도 적용된다(Java 런타임 컨테이너 이미지 한정).

## 버전·별칭·레이어의 통합: SAM 템플릿 예시

AWS SAM(Serverless Application Model)에서 이 세 가지를 함께 선언하는 패턴이다.

```yaml
# template.yaml
Resources:
  # 레이어
  CommonLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: common-utils
      ContentUri: layers/common/
      CompatibleRuntimes: [python3.12]
      RetentionPolicy: Retain  # 삭제해도 기존 함수는 계속 사용 가능

  # 함수
  PaymentFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: payment-api
      CodeUri: src/payment/
      Handler: handler.lambda_handler
      Runtime: python3.12
      MemorySize: 512
      Timeout: 30
      Layers:
        - !Ref CommonLayer
      Environment:
        Variables:
          ENV: !Ref Stage
          TABLE_NAME: !Ref PaymentsTable
      AutoPublishAlias: prod  # 배포 시 자동으로 버전 발행 + prod 별칭 업데이트
      DeploymentPreference:
        Type: Canary10Percent5Minutes
        Alarms:
          - !Ref PaymentErrorAlarm
        Hooks:
          PreTraffic: !Ref PreTrafficCheck

  PaymentErrorAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      MetricName: Errors
      Namespace: AWS/Lambda
      Dimensions:
        - Name: FunctionName
          Value: !Ref PaymentFunction
      Threshold: 5
      Period: 60
      EvaluationPeriods: 1
      ComparisonOperator: GreaterThanThreshold
```

> 🔍 **더 깊이**: SAM의 `AutoPublishAlias`는 배포할 때마다 자동으로 버전을 발행하고 지정된 별칭이 새 버전을 가리키도록 업데이트한다. `DeploymentPreference`는 CodeDeploy를 자동으로 구성해 지정된 전략으로 트래픽을 이전한다. 내부적으로 SAM 변환기가 CodeDeploy 배포 그룹, 배포 설정, 트리거를 CloudFormation 리소스로 생성한다. 개발자는 몇 줄의 YAML로 엔터프라이즈급 배포 파이프라인을 얻는 셈이다.

## 마무리

버전은 Lambda 배포의 불변 기록이다. 별칭은 그 기록들을 유연하게 라우팅하는 포인터다. CodeDeploy는 포인터 이전을 자동화하고 안전망을 제공한다. 레이어는 여러 함수 간 의존성을 DRY(Don't Repeat Yourself) 원칙으로 관리한다. 그리고 환경 변수 → SSM → Secrets Manager라는 계층 구조는 비밀의 민감도와 요구 사항에 따라 적절한 저장소를 선택하는 가이드다.

다음 글에서는 Lambda의 동시성 제어 — Reserved, Provisioned 동시성의 계층 관계 — 와 에러 처리 전략, DLQ/Destinations의 실전 패턴을 다룬다.

---

## 📝 연습 문제

**문제 1.** Lambda 별칭(Alias)으로 카나리 배포를 할 때, 동시에 최대 몇 개의 버전으로 트래픽을 분산할 수 있는가?

A) 1개  
B) 2개  
C) 5개  
D) 제한 없음  

**정답: B**  
해설: Lambda 별칭의 가중치 기반 트래픽 분산은 정확히 2개 버전을 지원한다. 주 버전(AdditionalVersionWeights에 없는)과 보조 버전(AdditionalVersionWeights에 지정된) 하나다. 3개 이상으로 삼분할은 단일 별칭으로 불가능하며, 이 경우 Application Load Balancer의 가중치 라우팅이나 별도 구현이 필요하다.

---

**문제 2.** Lambda 레이어에 대한 설명 중 틀린 것은?

A) 하나의 함수에 최대 5개의 레이어를 연결할 수 있다  
B) 레이어는 /opt 디렉토리에 마운트된다  
C) 컨테이너 이미지로 배포된 함수에도 레이어를 사용할 수 있다  
D) 다른 AWS 계정과 레이어를 공유할 수 있다  

**정답: C**  
해설: 컨테이너 이미지로 배포된 Lambda 함수는 레이어를 사용할 수 없다. 레이어는 ZIP 파일로 배포된 함수에서만 동작한다. 컨테이너 이미지를 사용할 때는 Dockerfile에 의존성을 직접 포함시켜야 한다. A는 맞다. B는 맞다 — Python은 `/opt/python`, Node.js는 `/opt/nodejs/node_modules`. D는 맞다 — `lambda:GetLayerVersion` 권한을 다른 계정에 부여하면 된다.

---

**문제 3.** 다음 시나리오에서 가장 적합한 구성 관리 방법은? "여러 Lambda 함수가 같은 RDS 데이터베이스 비밀번호를 사용하며, 비밀번호는 90일마다 자동으로 교체되어야 한다."

A) 각 함수의 환경 변수에 비밀번호를 직접 저장한다  
B) AWS Secrets Manager에 저장하고 자동 로테이션을 활성화한다  
C) SSM Parameter Store Standard에 저장한다  
D) S3 버킷에 암호화된 파일로 저장한다  

**정답: B**  
해설: 자동 로테이션은 Secrets Manager의 핵심 기능이다. Secrets Manager는 RDS, Redshift 등 주요 DB용 내장 로테이션 Lambda를 제공하며, 교차 계정 공유도 지원한다. A는 자동 로테이션 불가, 환경 변수 변경 시 함수 재배포 필요. C는 SSM Parameter Store는 자동 로테이션을 기본 지원하지 않는다(Secrets Manager와 통합하면 가능하지만 복잡). D는 직접 구현이 필요하고 감사 추적이 어렵다.

---

**문제 4.** Lambda 함수의 환경 변수 전체 크기 제한은?

A) 1KB  
B) 4KB  
C) 16KB  
D) 64KB  

**정답: B**  
해설: Lambda 환경 변수의 전체 크기(키+값의 합산)는 4KB로 제한된다. 이 한도를 초과하는 구성이 필요하면 SSM Parameter Store(Standard 4KB, Advanced 8KB) 또는 Secrets Manager(64KB)를 사용한다. JSON 형식의 복잡한 구성을 통째로 환경 변수에 넣으려 할 때 이 한도에 걸리는 경우가 많다.

---

**문제 5.** CodeDeploy Lambda 배포 전략 중 "10분 간격으로 트래픽을 10%씩 늘려 100%에 도달"하는 것은?

A) Canary10Percent5Minutes  
B) Linear10PercentEvery1Minute  
C) Linear10PercentEvery10Minutes  
D) AllAtOnce  

**정답: C**  
해설: `Linear10PercentEvery10Minutes`는 10분마다 10%씩 트래픽을 새 버전으로 이전하여 100분 후 100% 전환을 완료한다. `Canary` 전략은 처음 일부를 보내고 관찰 기간 후 나머지를 한 번에 전환한다. `Linear` 전략은 선형으로 점진적 증가한다. `AllAtOnce`는 즉시 100% 전환이다. 중요한 결제 서비스처럼 안전이 최우선인 경우 Linear 전략이 적합하다.

---

**문제 6.** Lambda 함수에서 $LATEST 버전과 발행된 버전(예: 버전 3)의 차이는?

A) $LATEST는 더 빠르게 실행된다  
B) 버전 3은 코드, 메모리, 타임아웃, 환경 변수가 발행 시점에 고정되어 변경할 수 없다  
C) $LATEST에는 Provisioned Concurrency를 설정할 수 있다  
D) 버전 3은 시간이 지나면 자동으로 삭제된다  

**정답: B**  
해설: 발행된 버전은 코드, 런타임, 메모리, 타임아웃, 환경 변수, 레이어 등 모든 구성이 발행 시점에 고정(불변)된다. $LATEST는 언제든 변경 가능하다. C는 반대 — Provisioned Concurrency는 $LATEST에 설정할 수 없고, 발행된 버전이나 별칭에만 설정 가능하다. D는 틀렸다 — 버전은 명시적으로 삭제하지 않는 한 영구 보존된다(단, 버전당 최대 동시성에는 계정 한도가 있음).

