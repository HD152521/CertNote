# Day 4 - Service Catalog, AppConfig, AppRegistry: 거버넌스와 동적 설정의 기술

2017년 Netflix는 소프트웨어 팀에 급진적인 자유를 주기로 결정했다. 수백 개 마이크로서비스 팀이 각자 독립적으로 배포한다. 그런데 "어떤 팀이 어떤 AWS 리소스를 소유하는가?"라는 질문에 아무도 답하지 못하는 상황이 됐다. 동시에 수천 개 EC2, RDS, Lambda가 있는데 어느 것이 어느 서비스에 속하는지 태그만으로는 불충분했다.

AWS Service Catalog, AppConfig, AppRegistry는 이 문제들의 대답이다. Service Catalog는 "권한 없는 개발자도 표준 인프라를 자가 서비스로 프로비저닝한다". AppConfig는 "코드 배포 없이 런타임 설정을 안전하게 변경한다". AppRegistry는 "흩어진 AWS 자산을 애플리케이션 단위로 묶는다". SOA-C02에서 이 세 서비스는 운영자가 조직 전체의 거버넌스와 일관성을 유지하는 도구로 다뤄진다.

## Service Catalog: 자가 서비스와 거버넌스의 교차점

Service Catalog의 핵심 문제 의식은 두 가지 상충하는 목표를 동시에 달성하는 것이다. "개발자에게 신속한 자가 서비스를 제공한다" + "조직의 보안 표준과 비용 정책을 반드시 준수한다". 이 두 목표는 보통 대립한다. 자유를 주면 표준이 흔들리고, 표준을 강제하면 병목이 생긴다.

Service Catalog의 해법은 **Launch Constraint Role**이다. 개발자는 카탈로그에서 제품을 클릭한다. 실제 CloudFormation 스택 생성은 Launch Constraint Role이 수행한다. 개발자는 S3 버킷을 만들 권한이 전혀 없어도, Service Catalog를 통해 표준 패키지를 프로비저닝할 수 있다. 그리고 그 표준 패키지 밖의 것은 절대 만들 수 없다.

> 💡 **관련 이론**: Service Catalog의 Launch Constraint는 소프트웨어 보안의 **최소 권한 원칙(Principle of Least Privilege)**의 정교한 구현이다. 단순히 권한을 제한하는 것이 아니라, "필요한 작업을 수행하는 대리인(Role)을 정의하고, 사용자는 그 대리인을 통해서만 작업"하는 위임(Delegation) 패턴이다. 이는 Unix의 setuid 비트(프로그램 실행 시 파일 소유자 권한으로 실행)와 동일한 원리다. 개발자 = 일반 유저, Launch Role = setuid 실행 파일, Service Catalog 제품 = 그 실행 파일이 수행하는 정해진 작업.

**Service Catalog 구성 요소:**

| 요소 | 역할 | 운영자 관점 |
|------|------|-------------|
| **Product** | CloudFormation Template(버전 관리됨) | 플랫폼팀이 승인한 인프라 패턴 |
| **Portfolio** | Product 묶음 + 사용자/그룹 권한 | 팀 또는 역할별 접근 제어 |
| **Provisioned Product** | 사용자가 실제 만든 Stack 인스턴스 | 각 팀이 소유한 운영 리소스 |
| **Launch Constraint** | 프로비저닝 시 사용할 IAM Role | 사용자 권한 우회, 표준 강제 |
| **Notification Constraint** | SNS로 프로비저닝 이벤트 알림 | 감사, 변경 추적 |
| **Tag Constraint** | 강제 태그 + 허용 태그 목록 | 비용 할당, 자원 분류 강제 |
| **Template Constraint** | Parameter 허용 값 제한 | 인스턴스 크기 등 제약 |
| **TagOptions** | 계정 전체 표준 태그 라이브러리 | 조직 태깅 표준 적용 |

**Service Catalog 실전 CLI 워크플로:**

```bash
# 1. Portfolio 생성 (플랫폼팀)
PORTFOLIO_ID=$(aws servicecatalog create-portfolio \
  --display-name "Standard Web Applications" \
  --provider-name "Platform Engineering Team" \
  --description "Security-approved web infrastructure templates" \
  --query 'PortfolioDetail.Id' --output text)

# 2. Product 생성 (CFn Template → S3에 업로드 후 URL 지정)
PRODUCT_ID=$(aws servicecatalog create-product \
  --name "Standard Web Stack v2" \
  --owner "Platform Team" \
  --product-type CLOUD_FORMATION_TEMPLATE \
  --provisioning-artifact-parameters '{
    "Name": "v2.0",
    "Description": "ALB + ECS Fargate + RDS Aurora + 표준 보안 그룹",
    "Info": {
      "LoadTemplateFromURL": "https://s3.ap-northeast-2.amazonaws.com/my-sc-templates/web-stack-v2.yaml"
    },
    "Type": "CLOUD_FORMATION_TEMPLATE"
  }' \
  --query 'ProductViewDetail.ProductViewSummary.ProductId' --output text)

# 3. Portfolio에 Product 연결
aws servicecatalog associate-product-with-portfolio \
  --product-id $PRODUCT_ID \
  --portfolio-id $PORTFOLIO_ID

# 4. Launch Constraint 설정 (핵심)
aws servicecatalog create-constraint \
  --portfolio-id $PORTFOLIO_ID \
  --product-id $PRODUCT_ID \
  --type LAUNCH \
  --parameters "{\"RoleArn\":\"arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ServiceCatalogLaunchRole\"}"

# 5. 개발자 그룹에 Portfolio 접근 권한
aws servicecatalog associate-principal-with-portfolio \
  --portfolio-id $PORTFOLIO_ID \
  --principal-arn "arn:aws:iam::123456789012:group/AppDevelopers" \
  --principal-type IAM

# 6. Template Constraint: t2.micro, t3.micro만 허용
aws servicecatalog create-constraint \
  --portfolio-id $PORTFOLIO_ID \
  --product-id $PRODUCT_ID \
  --type TEMPLATE \
  --parameters '{
    "Rules": {
      "InstanceTypeRule": {
        "Assertions": [{
          "Assert": {"Fn::Contains": [["t2.micro","t3.micro","t3.small"], {"Ref":"InstanceType"}]},
          "AssertDescription": "개발 환경은 소형 인스턴스만 허용"
        }]
      }
    }
  }'
```

**Launch Constraint Role 구성:**

```yaml
# Launch Role에 필요한 최소 권한 (Service Catalog가 이 Role로 CFn 실행)
LaunchRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: ServiceCatalogLaunchRole
    AssumeRolePolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal:
            Service: servicecatalog.amazonaws.com
          Action: sts:AssumeRole
    # Permission Boundary 적용 (Launch Role이 더 강력한 권한 갖지 못하도록)
    PermissionsBoundary: arn:aws:iam::123456789012:policy/ServiceCatalogBoundary
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/CloudFormationFullAccess
    Policies:
      - PolicyName: WebStackProvisioning
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - ec2:*
                - ecs:*
                - rds:*
                - elasticloadbalancing:*
                - autoscaling:*
              Resource: '*'
```

> 🔍 **더 깊이**: Service Catalog + Permission Boundary의 조합은 AWS에서 가장 정교한 권한 위임 패턴 중 하나다. 구조는 이렇다: (1) 개발자(IAM User/Role)는 Service Catalog API를 호출할 권한만 갖는다. (2) Service Catalog가 Launch Role을 Assume한다. (3) Launch Role의 실제 권한 = (Launch Role의 IAM Policy) ∩ (Permission Boundary). Permission Boundary가 없으면 Launch Role이 무제한 권한을 가질 수 있어, 개발자가 Service Catalog를 통해 Admin 권한으로 임의 리소스를 만들 수 있다. 이를 "권한 에스컬레이션(Privilege Escalation)"이라 부르며, Permission Boundary가 이를 차단하는 가드레일이다.

**멀티 계정 Portfolio 공유:**

```bash
# 다른 AWS 계정과 Portfolio 공유
aws servicecatalog create-portfolio-share \
  --portfolio-id $PORTFOLIO_ID \
  --account-id 111122223333  # 자회사 계정

# Organizations OU 전체와 공유 (Organizations 통합)
aws servicecatalog create-portfolio-share \
  --portfolio-id $PORTFOLIO_ID \
  --organization-node '{
    "Type": "ORGANIZATIONAL_UNIT",
    "Value": "ou-root-abc123"
  }' \
  --share-tag-options  # TagOptions도 함께 공유

# 공유받은 계정에서 Portfolio 가져오기
aws servicecatalog accept-portfolio-share \
  --portfolio-id $PORTFOLIO_ID
aws servicecatalog associate-principal-with-portfolio \
  --portfolio-id $PORTFOLIO_ID \
  --principal-arn arn:aws:iam::111122223333:group/Developers \
  --principal-type IAM
```

> 📚 **사례**: 2023년 대형 제조업체 J사는 15개 사업부가 각각 AWS 계정을 운영하고 있었다. 각 사업부 개발팀이 독립적으로 EC2, RDS 등을 프로비저닝하다 보니 보안 그룹 설정이 제각각이었고, 일부 팀은 0.0.0.0/0으로 RDS를 열어두는 사태가 발생했다. 해결책으로 중앙 Platform Engineering 계정에서 "승인된 데이터베이스 패키지" 제품을 만들어 15개 사업부 계정에 Portfolio를 공유했다. 이후 어떤 사업부도 표준 패키지 밖의 RDS를 만들 수 없게 됐다. 6개월 후 보안 감사에서 "모든 RDS가 표준 구성을 준수함"을 확인했다.

## AppConfig: 코드 재배포 없는 설정 변경의 과학

2003년 Google의 Jeff Dean과 Sanjay Ghemawat이 발표한 MapReduce 논문에는 "시스템의 많은 파라미터가 런타임에 조정 가능해야 한다"는 원칙이 있다. 현대 분산 시스템에서 이 원칙은 "Feature Flag"로 구체화됐다. 코드를 재배포하지 않고도 기능을 켜고 끌 수 있어야 한다.

AWS AppConfig는 이 Feature Flag와 동적 설정 배포를 위한 관리형 서비스다. 단순히 설정값을 저장하는 것이 아니라, **점진적 배포(Progressive Delivery)**, **사전 검증(Validation)**, **자동 롤백(Auto Rollback)**을 제공한다.

**AppConfig 핵심 구성 요소:**

| 요소 | 역할 | 예시 |
|------|------|------|
| **Application** | 최상위 컨테이너 | `OrderService`, `UserService` |
| **Environment** | 배포 환경 | `dev`, `staging`, `prod` |
| **Configuration Profile** | 설정 출처와 타입 | Hosted / S3 / Parameter Store |
| **Hosted Configuration** | AppConfig 내장 저장소 | Feature Flags 전용 타입 지원 |
| **Deployment Strategy** | 배포 방식과 속도 | Linear, Exponential, AllAtOnce, Canary |
| **Validator** | 배포 전 검증 | JSON Schema, Lambda |
| **Extension** | 이벤트 후크 | 배포 시작/완료/롤백 시 Lambda 호출 |

**Deployment Strategy 전체:**

| 전략 이름 | 동작 | 적합 상황 |
|-----------|------|-----------|
| `AppConfig.AllAtOnce` | 즉시 100% 전환 | dev 환경, 긴급 패치 |
| `AppConfig.Linear50PercentEvery30Seconds` | 30초마다 50%씩 (총 60초) | 빠른 배포, 낮은 위험 |
| `AppConfig.Linear20PercentEvery6Minutes` | 6분마다 20%씩 (총 30분) | 표준 프로덕션 배포 |
| `AppConfig.Canary10Percent20Minutes` | 10% → 20분 대기 → 100% | 새 기능 조심스럽게 |
| Custom | 완전 커스텀 (GrowthFactor, BakeTime, GrowthType) | 특수 요구사항 |

**Custom Deployment Strategy 생성:**

```bash
# 점진 배포: 5%에서 시작해 30% 성장, 10분 Bake Time
aws appconfig create-deployment-strategy \
  --name "Cautious5Percent" \
  --description "5%에서 시작, 10분 간격, 10분 bake time" \
  --deployment-duration-in-minutes 50 \
  --final-bake-time-in-minutes 10 \
  --growth-factor 30 \
  --growth-type EXPONENTIAL \
  --replicate-to NONE

# 배포 완료 후 10분 Bake Time 동안 알람 감시
# Bake Time 중 알람 발생 시 자동 롤백
```

**AppConfig 전체 셋업 워크플로:**

```bash
# 1. Application 생성
APP_ID=$(aws appconfig create-application \
  --name "OrderService" \
  --description "주문 처리 마이크로서비스" \
  --query 'Id' --output text)

# 2. Environment 생성 (CloudWatch Alarm 모니터 연결)
ENV_ID=$(aws appconfig create-environment \
  --application-id $APP_ID \
  --name "prod" \
  --description "프로덕션 환경" \
  --monitors '[
    {
      "AlarmArn": "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:OrderService-ErrorRate-High",
      "AlarmRoleArn": "arn:aws:iam::123456789012:role/AppConfigMonitorRole"
    }
  ]' \
  --query 'Id' --output text)

# 3. Configuration Profile 생성 (Feature Flags 타입)
PROFILE_ID=$(aws appconfig create-configuration-profile \
  --application-id $APP_ID \
  --name "FeatureFlags" \
  --location-uri "hosted" \
  --type "AWS.AppConfig.FeatureFlags" \
  --validators '[
    {
      "Type": "JSON_SCHEMA",
      "Content": "{\"type\":\"object\",\"required\":[\"flags\",\"values\"]}"
    },
    {
      "Type": "LAMBDA",
      "Content": "arn:aws:lambda:ap-northeast-2:123456789012:function:ValidateFeatureFlags"
    }
  ]' \
  --query 'Id' --output text)

# 4. 설정 버전 생성
VERSION=$(aws appconfig create-hosted-configuration-version \
  --application-id $APP_ID \
  --configuration-profile-id $PROFILE_ID \
  --content-type "application/json" \
  --content '{
    "flags": {
      "new_checkout_flow": {
        "name": "new_checkout_flow",
        "description": "새 결제 플로우"
      },
      "recommendation_engine_v2": {
        "name": "recommendation_engine_v2"
      }
    },
    "values": {
      "new_checkout_flow": {"enabled": false},
      "recommendation_engine_v2": {"enabled": true}
    },
    "version": "1"
  }' \
  --query 'VersionNumber' --output text)

# 5. 배포 시작 (Canary 전략)
aws appconfig start-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-strategy-id "AppConfig.Canary10Percent20Minutes" \
  --configuration-profile-id $PROFILE_ID \
  --configuration-version $VERSION \
  --description "new_checkout_flow 비활성화, recommendation v2 활성화"

# 6. 배포 상태 모니터링
aws appconfig get-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-number 1 \
  --query '[State,PercentageComplete,StartedAt,CompletedAt]'

# 7. 즉시 롤백 (필요 시)
aws appconfig stop-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-number 1
```

> ⚠️ **함정**: AppConfig Deployment Strategy의 `FinalBakeTimeInMinutes`는 배포가 100%에 도달한 후 추가로 대기하는 시간이다. 이 시간 동안에도 CloudWatch Alarm을 감시한다. 알람이 발생하면 자동 롤백이 시작된다. 많은 운영자가 "100% 배포 완료 = 배포 종료"로 착각하지만, `FinalBakeTimeInMinutes`가 있으면 그 시간이 지나야 배포가 `COMPLETE` 상태가 된다. `AllAtOnce` 전략에 `FinalBakeTimeInMinutes=10`을 추가하면, 즉시 100%에 도달하지만 10분 후에 배포가 완전히 확정된다.

**AppConfig Lambda 클라이언트 통합:**

```python
# Lambda에서 AppConfig를 효율적으로 사용하는 패턴
# Lambda Extension(AWS AppConfig Agent)이 로컬 HTTP 서버로 설정 캐시
import urllib.request
import json

def get_config():
    """
    AppConfig Lambda Extension이 로컬 2772 포트에서 설정 제공.
    Extension이 자동으로 캐시 + 폴링 처리.
    직접 AppConfig API를 호출하는 것보다 훨씬 효율적.
    """
    url = (
        "http://localhost:2772/applications/OrderService"
        "/environments/prod/configurations/FeatureFlags"
    )
    req = urllib.request.Request(url)
    response = urllib.request.urlopen(req)
    config = json.loads(response.read())
    return config

def handler(event, context):
    config = get_config()
    flags = config.get('values', {})
    
    if flags.get('new_checkout_flow', {}).get('enabled', False):
        return process_new_checkout(event)
    else:
        return process_legacy_checkout(event)
```

> 💡 **관련 이론**: AppConfig의 점진적 배포(Progressive Delivery)는 Martin Fowler가 2010년 정의한 "Feature Toggle" 패턴의 AWS 관리형 구현이다. Fowler는 Feature Toggle을 4가지 타입으로 분류했다: (1) Release Toggles(배포 중 임시), (2) Experiment Toggles(A/B 테스트), (3) Ops Toggles(운영 스위치), (4) Permission Toggles(계층별 접근). AppConfig는 주로 Release Toggles와 Ops Toggles를 지원한다. 자동 롤백은 제어 이론의 피드백 제어 루프다: CloudWatch Alarm이 에러율 임계값을 감지하면 AppConfig가 교정 액션(롤백)을 실행한다.

**AppConfig Validator 심화:**

```python
# Lambda Validator: 비즈니스 규칙 검증
def validate_handler(event, context):
    """
    AppConfig가 배포 전 이 Lambda를 호출.
    유효하지 않으면 예외를 raise하여 배포 차단.
    """
    import json, base64
    
    # 설정 내용 디코딩
    config = json.loads(base64.b64decode(event['content']))
    
    # 검증 1: feature flag가 100개를 초과하면 거부
    flags = config.get('flags', {})
    if len(flags) > 100:
        raise Exception(f"Feature flag 수가 100개를 초과합니다: {len(flags)}개")
    
    # 검증 2: 알 수 없는 flag 이름이 있으면 거부
    allowed_flags = {'new_checkout_flow', 'recommendation_engine_v2', 'dark_mode'}
    unknown = set(flags.keys()) - allowed_flags
    if unknown:
        raise Exception(f"알 수 없는 feature flag: {unknown}")
    
    # 검증 3: flag가 활성화될 때 필수 속성 확인
    for flag_name, flag_value in config.get('values', {}).items():
        if flag_value.get('enabled') and flag_name == 'new_checkout_flow':
            # 새 결제 플로우 활성화 시 payment_provider 필수
            if 'payment_provider' not in flag_value:
                raise Exception("new_checkout_flow 활성화 시 payment_provider 필수")
    
    print("Validation passed")
    # 예외 없이 반환하면 검증 통과
```

## AppRegistry: 흩어진 AWS 자산을 애플리케이션 단위로

대규모 마이크로서비스 환경에서 "Order Service는 어떤 CloudFormation Stack, ECS Service, RDS, Lambda, S3 버킷으로 구성되는가?"라는 질문에 답하기 어렵다. 태그만으로는 계층 구조와 맥락을 표현하기 힘들다.

AWS Service Catalog AppRegistry는 이 문제를 해결한다. "Application"이라는 개념을 도입해 관련 AWS 리소스를 하나의 논리적 단위로 묶는다.

**AppRegistry 핵심 개념:**

| 개념 | 설명 |
|------|------|
| **Application** | 논리적 애플리케이션 단위 (e.g. OrderService) |
| **Associated Resources** | Application에 연결된 CloudFormation Stack, 개별 리소스 |
| **Attribute Group** | 애플리케이션 메타데이터 (오너, SLA, 비용센터, 환경) |
| **Application Manager** | SSM 콘솔에서 Application 단위 통합 뷰 |

**AppRegistry 실전 설정:**

```bash
# 1. Application 생성
aws servicecatalog-appregistry create-application \
  --name "OrderService" \
  --description "주문 처리 마이크로서비스"

# 2. CFn Stack 연결
aws servicecatalog-appregistry associate-resource \
  --application "OrderService" \
  --resource-type CFN_STACK \
  --resource "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/order-service-prod/abc123"

aws servicecatalog-appregistry associate-resource \
  --application "OrderService" \
  --resource-type CFN_STACK \
  --resource "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/order-db-prod/def456"

# 3. Attribute Group 생성 (메타데이터)
aws servicecatalog-appregistry create-attribute-group \
  --name "OrderServiceMeta" \
  --attributes '{
    "owner": "order-team@company.com",
    "sla": "99.9%",
    "cost_center": "CC-ORDER-001",
    "tier": "mission-critical",
    "pci_in_scope": "true",
    "last_security_review": "2026-03-15"
  }' \
  --description "Order Service 메타데이터"

# 4. Application에 Attribute Group 연결
aws servicecatalog-appregistry associate-attribute-group \
  --application "OrderService" \
  --attribute-group "OrderServiceMeta"

# 5. 애플리케이션 목록 및 연결 리소스 조회
aws servicecatalog-appregistry list-applications

aws servicecatalog-appregistry list-associated-resources \
  --application "OrderService"
```

**Application Manager 통합 뷰에서 볼 수 있는 것:**

- 애플리케이션에 속한 모든 CloudFormation Stack 상태
- Stack 내 각 리소스의 운영 상태
- CloudWatch Alarms (애플리케이션 레벨 집계)
- CloudWatch Logs (관련 로그 그룹)
- OpsCenter OpsItems (운영 이슈)
- Cost Explorer (애플리케이션별 비용)
- Config 규정 준수 상태

> 🔍 **더 깊이**: AppRegistry의 "Application as a First-Class Citizen" 접근은 DORA(DevOps Research and Assessment) 지표의 "Deployment Frequency"와 "Change Failure Rate"를 측정하는 단위가 개별 리소스가 아니라 "서비스(Application)"이어야 한다는 통찰에서 나왔다. 운영 관점에서 "EC2 i-abc123이 CPU 90%"는 정보가 적지만, "OrderService의 CPU가 90%"는 즉각적인 비즈니스 영향도를 알 수 있다. AppRegistry는 이 추상화를 AWS 레벨에서 공식적으로 지원한다.

## 세 서비스의 통합 패턴

Service Catalog, AppConfig, AppRegistry는 각각 독립적으로 사용할 수 있지만, 함께 사용하면 더 강력해진다.

```
조직 수준 거버넌스 플랫폼 아키텍처
============================================================

[플랫폼팀]
    │
    ├── Service Catalog에 표준 제품 등록
    │   (웹 스택, ML 스택, 데이터 스택)
    │
    ├── AppConfig로 환경별 설정 관리
    │   (Feature Flags, 알고리즘 파라미터)
    │
    └── AppRegistry로 애플리케이션 자산 등록
        (메타데이터, 비용센터, SLA)

[개발팀]
    │
    ├── Service Catalog 카탈로그에서 표준 인프라 선택
    │   → Launch Constraint Role로 프로비저닝
    │   → Provisioned Product = Stack
    │
    ├── Stack을 AppRegistry Application에 연결
    │   → Application Manager에서 통합 뷰
    │
    └── AppConfig로 런타임 설정 변경
        → 코드 재배포 없이 Feature Flag 토글
        → Canary 배포로 안전하게 적용
        → 알람 연동으로 자동 롤백

[운영팀]
    │
    ├── Application Manager에서 애플리케이션 단위 상태 확인
    ├── AppConfig 배포 상태 및 자동 롤백 모니터링
    └── Service Catalog Provisioned Products로 표준 준수 감사
```

> 📚 **사례**: 2024년 전자상거래 K사는 50개 마이크로서비스를 운영하며 두 가지 문제가 있었다. 첫째, 각 팀이 다른 방식으로 인프라를 구성해 보안 감사 시 "표준 미준수" 항목이 항상 나왔다. 둘째, 새 기능을 배포할 때마다 전체 서비스를 다운시켰다. 해결책: (1) Service Catalog로 5가지 표준 인프라 패턴(웹, 데이터, 배치, 실시간, 분석)을 제품화하고 모든 팀이 이 중에서만 선택하도록 했다. (2) AppConfig Feature Flags로 새 기능을 코드에 포함시키되 비활성화 상태로 배포, 이후 점진적으로 활성화했다. (3) AppRegistry로 50개 서비스의 자산을 Application 단위로 정리해 OpsCenter에서 서비스별 운영 이슈를 추적했다. 결과: 보안 감사 "표준 미준수" 0건, 배포 관련 장애 67% 감소.

## SOA-C02 시험 관점 핵심 정리

**Service Catalog 시험 포인트:**
- Launch Constraint = 사용자 IAM 권한 없어도 표준 제품 프로비저닝
- Portfolio Sharing = 멀티 계정 자가 서비스 표준화
- Permission Boundary + Launch Role = 권한 에스컬레이션 방지

**AppConfig 시험 포인트:**
- 코드 재배포 없이 런타임 설정 변경 (Parameter Store도 가능하지만 점진 배포/롤백 없음)
- Validator(JSON Schema, Lambda)로 배포 전 검증
- CloudWatch Alarm 연결로 자동 롤백
- FinalBakeTimeInMinutes = 100% 도달 후 추가 감시 시간
- Lambda Extension = 로컬 포트 2772에서 캐시된 설정 제공

**AppRegistry 시험 포인트:**
- CFn Stack → Application 연결 → Application Manager 통합 뷰
- Attribute Group = 애플리케이션 메타데이터
- Resource Groups와 차이: AppRegistry는 Application이라는 상위 개념 존재

## 📝 연습 문제

**문제 1.** 회사가 개발자에게 표준 VPC + RDS 인프라를 자가 서비스로 제공하면서, 개발자가 다른 종류 리소스를 직접 만들 수 없게 강제하려 한다. 어떤 도구를 사용해야 하는가?

A) IAM 정책으로 필요한 모든 권한을 부여한다
B) Service Catalog Portfolio에 표준 제품을 등록하고, Launch Constraint로 프로비저닝 Role을 지정한다. 개발자는 카탈로그 외 리소스를 직접 만들 권한이 없다
C) CloudFormation Template를 직접 개발자에게 배포한다
D) AWS Marketplace에서 제품을 구매한다

**정답: B**
해설: 자가 서비스 + 표준 강제의 표준 패턴이다. Launch Constraint Role이 실제 CloudFormation 실행 권한을 갖고, 개발자는 Service Catalog API 호출 권한만 갖는다. 개발자는 카탈로그에 있는 제품만 프로비저닝할 수 있고, 직접 EC2나 RDS를 만들 수 없다. C는 개발자가 Template를 수정하거나 다른 Template를 사용할 수 있어 표준 강제가 불가능하다.

---

**문제 2.** Lambda 함수의 Feature Flag를 코드 재배포 없이 토글하고 싶다. 새 설정이 배포되는 동안 에러율이 급증하면 자동으로 이전 설정으로 돌아가야 한다. 가장 적합한 도구는?

A) Parameter Store - 설정을 저장하고 Lambda에서 읽는다
B) AppConfig - Feature Flag 타입 프로파일 + CloudWatch Alarm 모니터로 자동 롤백 구성
C) DynamoDB - 설정 테이블을 만들고 Lambda에서 읽는다
D) Lambda 환경 변수 - 콘솔에서 수동으로 변경한다

**정답: B**
해설: AppConfig는 Feature Flag를 위한 전용 타입(`AWS.AppConfig.FeatureFlags`)을 제공하고, Environment에 CloudWatch Alarm Monitor를 연결하면 배포 중 알람 발생 시 자동 롤백이 된다. Parameter Store(A)도 값 저장은 가능하지만 점진적 배포와 자동 롤백 기능이 없다. Lambda 환경 변수(D)는 변경 시 함수 재시작이 필요하다.

---

**문제 3.** AppConfig 배포 전 설정값의 JSON 구조가 올바른지 자동으로 검증하려 한다. 어떤 기능을 사용해야 하는가?

A) CloudWatch Logs에서 에러 패턴을 모니터링한다
B) Configuration Profile에 JSON Schema Validator를 추가한다. 스키마 불일치 시 배포가 시작되지 않는다
C) Lambda 함수가 설정 변경을 감지하고 검증 로직을 실행한다
D) S3 버킷 정책으로 잘못된 파일 업로드를 차단한다

**정답: B**
해설: AppConfig Configuration Profile의 Validator 기능이다. `JSON_SCHEMA` 타입 Validator를 추가하면, 배포 전 설정 내용이 스키마와 일치하는지 자동으로 검증한다. 불일치 시 배포가 시작되지 않는다. 비즈니스 로직 검증이 필요하면 `LAMBDA` 타입 Validator를 추가로 사용할 수 있다. 두 종류를 동시에 적용할 수 있다.

---

**문제 4.** AppConfig 배포에서 `FinalBakeTimeInMinutes: 10`을 설정했다. `AllAtOnce` 전략으로 배포했을 때 동작은?

A) 10분 동안 0%에서 시작해 100%까지 점진적으로 적용된다
B) 즉시 100%에 설정이 적용되고, 이후 10분 동안 CloudWatch Alarm을 모니터링한다. 알람 발생 시 자동 롤백된다
C) 10분 후에 배포가 시작된다
D) 10분마다 배포 상태를 체크한다

**정답: B**
해설: `FinalBakeTimeInMinutes`는 배포가 100%에 도달한 후 추가로 모니터링하는 시간이다. `AllAtOnce` 전략은 즉시 100%에 설정을 적용하지만, FinalBakeTime이 있으면 그 시간 동안 Alarm Monitor를 감시한다. FinalBakeTime 중 알람 발생 → 자동 롤백, 정상 → `COMPLETE` 상태 확정. 따라서 `AllAtOnce` + `FinalBakeTimeInMinutes: 10`은 "즉시 배포 + 10분 감시"이다.

---

**문제 5.** 개발팀이 Service Catalog에서 "Standard Web Stack" 제품을 프로비저닝하려 한다. 개발자의 IAM 권한에는 EC2, RDS 생성 권한이 없다. 어떻게 프로비저닝이 가능한가?

A) 개발자에게 임시로 EC2, RDS 권한을 부여한다
B) Service Catalog가 Launch Constraint에 지정된 IAM Role을 Assume해 CloudFormation을 실행한다. 개발자 권한이 아닌 Launch Role 권한으로 실제 리소스가 생성된다
C) Service Catalog가 관리자 계정으로 자동 전환한다
D) CloudFormation이 개발자를 대신해 권한을 자동으로 확장한다

**정답: B**
해설: Launch Constraint의 핵심 동작이다. 개발자가 Service Catalog에서 "Provision Product"를 클릭하면, Service Catalog는 개발자 IAM Role이 아니라 Launch Constraint에 지정된 Launch Role을 Assume해 CloudFormation을 실행한다. CloudFormation이 생성하는 리소스는 Launch Role의 권한으로 만들어진다. 개발자는 EC2, RDS 권한이 없어도 표준 패키지를 프로비저닝할 수 있고, 표준 패키지 이외의 리소스는 만들 수 없다.

---

**문제 6.** 50개 마이크로서비스를 운영하는 회사가 각 서비스별 AWS 비용, 알람, 운영 이슈를 한 화면에서 확인하고 싶다. 어떤 도구 조합이 가장 적합한가?

A) CloudWatch Dashboards를 50개 만들어 각 서비스별로 구성한다
B) AWS AppRegistry로 각 서비스를 Application으로 정의하고, 관련 CloudFormation Stack을 연결한다. AWS Systems Manager Application Manager에서 서비스별 통합 뷰를 제공한다
C) Resource Groups와 Tag Editor로 서비스별 리소스를 그룹화한다
D) Cost Explorer에서 태그별 필터링으로 서비스별 비용을 확인한다

**정답: B**
해설: AppRegistry + Application Manager 조합이 정확한 답이다. AppRegistry에서 Application을 정의하고 CFn Stack을 연결하면, Application Manager가 해당 Application에 속한 리소스의 CloudWatch Alarms, OpsCenter Items, Config 준수 상태, 비용 정보를 하나의 뷰로 제공한다. Resource Groups(C)는 태그 기반 그룹화이며 Application이라는 상위 개념 없이 리소스만 묶는다. AppRegistry는 Attribute Group을 통한 메타데이터, Application 계층 구조 등 더 풍부한 컨텍스트를 제공한다.
