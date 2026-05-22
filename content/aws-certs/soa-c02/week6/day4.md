# Day 4 - Service Catalog, AppConfig, AppRegistry

📅 날짜: Week 6 (Day 4)
🎯 주제: 자가 서비스 프로비저닝과 애플리케이션 메타데이터 관리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Service Catalog로 표준화된 IaC 제품을 사용자에게 제공한다
- AppConfig로 애플리케이션 설정을 안전하게 동적 배포한다
- AppRegistry로 애플리케이션 단위 자산을 그룹핑한다

---

## 🧩 사전 지식 (CS 기초)

- **Self-service portal**: 사용자가 IT 부서 거치지 않고 표준 자원을 직접 프로비저닝
- **Approved catalog**: 회사가 승인한 표준 구성만 제공
- **Feature flag**: 코드 배포와 무관하게 기능 on/off
- **Canary deployment**: 일부 사용자만 새 버전, 점진 확대
- **Application as code**: 애플리케이션을 추상화된 단위로 관리

---

## 📖 이론 내용

### 1. AWS Service Catalog

#### 개념
- IaC 템플릿(CFn)을 "제품(Product)"으로 카탈로그화
- 사용자는 카탈로그에서 클릭해 표준 인프라 프로비저닝
- 관리자는 표준·정책·권한을 강제

#### 구성 요소

| 요소 | 의미 |
|------|------|
| **Product** | CloudFormation 템플릿 (버전 관리됨) |
| **Portfolio** | Product 묶음 + 사용자/그룹 권한 |
| **Provisioned Product** | 사용자가 실제 만든 인스턴스 |
| **Constraints** | 사용자 제약 (Launch, Notification, Tag, Template) |
| **TagOptions** | 강제 태그 표준 |

#### Launch Constraint (중요)
- 사용자가 IAM 권한 없어도 Service Catalog가 대리 실행
- 사용자: "S3 버킷 만들 권한 X" → Service Catalog가 Role로 실제 생성
- 표준 제품만 만들 수 있게 강제 (다른 리소스 직접 만들 수 없음)

#### Permission Boundary 통합
- Service Catalog가 만드는 IAM 객체에 자동 Permission Boundary 적용
- 자가 서비스 IAM 위임의 가드레일

#### 사용 시나리오
- 개발자에게 "표준 VPC + RDS + ALB" 패키지 제공
- 데이터 사이언티스트에게 "SageMaker Notebook" 제공
- 권한 없는 사용자에게도 표준 자원 프로비저닝 허용

### 2. AWS AppConfig

#### 개념
- 애플리케이션 설정의 **안전한 동적 배포**
- 코드 재배포 없이 설정 변경
- Feature flag, 운영 토글, 알고리즘 파라미터 등

#### 핵심 요소

| 요소 | 의미 |
|------|------|
| **Application** | 최상위 컨테이너 |
| **Environment** | 배포 환경 (dev/stage/prod) |
| **Configuration Profile** | 설정의 출처 (S3, Parameter Store, Hosted) |
| **Hosted Configuration** | AppConfig 내장 저장소 |
| **Deployment Strategy** | 배포 방식 (Linear, Exponential, AllAtOnce) |
| **Validator** | 배포 전 검증 (JSON Schema, Lambda) |

#### Deployment Strategy 예시

| 전략 | 동작 |
|------|------|
| **AppConfig.Linear50PercentEvery30Seconds** | 30초마다 50%씩 |
| **AppConfig.Linear20PercentEvery6Minutes** | 6분마다 20%씩 |
| **AppConfig.AllAtOnce** | 즉시 전체 |
| **AppConfig.Canary10Percent20Minutes** | 10% 캐너리 20분 → 100% |

#### 자동 롤백
- CloudWatch Alarm 연결
- 배포 중 알람 발생 → 자동 이전 버전으로

#### 클라이언트 사용 (Lambda 예시)
```python
import boto3
from aws_lambda_powertools.utilities.feature_flags import FeatureFlags

# AppConfig에서 자동 fetch + 캐시
flags = FeatureFlags(store="appconfig", environment="prod", application="my-app", name="features")

if flags.evaluate(name="new_search_algorithm", default=False):
    use_new_algorithm()
else:
    use_legacy()
```

#### Lambda Extension
- AppConfig Agent가 Lambda Extension으로 실행
- 캐시 + 자동 polling → 성능 + 가용성 ↑

### 3. AppConfig + Feature Flag

#### Feature Flag 구조
```json
{
  "flags": {
    "new_search": {
      "name": "new_search",
      "_deprecation": {
        "status": "planned"
      }
    },
    "premium_features": {
      "name": "premium_features",
      "attributes": {
        "tier_limit": {
          "constraints": {
            "type": "number",
            "minimum": 0,
            "maximum": 1000
          }
        }
      }
    }
  },
  "values": {
    "new_search": { "enabled": true },
    "premium_features": { "enabled": true, "tier_limit": 100 }
  },
  "version": "1"
}
```

#### 점진 롤아웃
- "10% 사용자에게만 새 기능"
- 사용자 ID hash로 결정적 분배

### 4. AWS Service Catalog AppRegistry

#### 개념
- 애플리케이션 단위로 AWS 자산(Stack/Resource)을 그룹핑
- "Order Service" 애플리케이션에 어떤 Stack/리소스가 속하는지

#### 사용 사례
- 마이크로서비스 단위 운영 가시화
- Application Manager에서 통합 뷰
- 비용 분석 (애플리케이션별 청구)

#### Attribute Group
- 애플리케이션 메타데이터 (오너, SLA, 비용센터 등)

### 5. AWS Application Manager

#### 개념
- SSM 콘솔에서 애플리케이션 단위 통합 뷰
- AppRegistry + CloudFormation Stack + ECS/EKS 등 통합

#### 기능
- 애플리케이션별 알람·로그·메트릭
- OpsCenter 통합
- 비용 + 컴플라이언스 + 운영 데이터 한 화면

### 6. AWS Proton

#### 개념
- 플랫폼 엔지니어링용 IaC 표준 배포
- "환경 템플릿" + "서비스 템플릿" → 자가 서비스
- Service Catalog와 비슷하지만 CI/CD까지 통합

#### 사용 사례
- 사내 PaaS 구축
- 표준 마이크로서비스 스캐폴딩
- 인프라/CI/CD를 플랫폼팀이 표준화

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Service Catalog Sharing** | Portfolio를 다른 계정과 공유 | 멀티 계정 자가 서비스 |
| **AppConfig + Lambda Layer** | Extension으로 캐시 | 성능 |
| **AppConfig Validators** | JSON Schema/Lambda로 사전 검증 | 잘못된 설정 차단 |
| **AppRegistry + Tag-based** | 태그 기반 자동 그룹 매핑 | 자동화 |
| **Service Catalog + Terraform** | Terraform Open Source/Cloud 통합 | 비-CFn IaC |

> ⚠️ **함정 1**: Service Catalog Launch Constraint Role은 강력한 권한 필요 — 안전한 Boundary 설정 중요.
>
> ⚠️ **함정 2**: AppConfig의 `Linear50PercentEvery30Seconds`는 빠른 배포지만 자동 롤백 시간 짧음 — 알람 평가 시간 고려.
>
> 💡 **암기 팁**: Service Catalog(IaC 제품) ↔ AppConfig(런타임 설정) ↔ AppRegistry(애플리케이션 메타).

### 관련 서비스 Cross-Reference

- **Service Catalog → Week 1 Day 3** (Permission Boundary)
- **AppConfig → Week 7** (Lambda 운영)
- **AppRegistry → Week 12 운영 통합 뷰**
- **Service Catalog → Week 6 Day 3** (CFn 템플릿 활용)

---

## 🏗️ 아키텍처 다이어그램

```
Service Catalog 자가 서비스 흐름
==========================================================

   [관리자]
       │ Product 등록 (CFn Template)
       │ Portfolio 생성 + 권한 부여
       │ Launch Constraint Role 지정
       ▼
   ┌────────────────────────────┐
   │ Service Catalog Portfolio  │
   │  - 표준 VPC 제품           │
   │  - 표준 RDS 제품           │
   │  - 표준 EKS 제품           │
   └────────┬───────────────────┘
            │ "MyApp 개발자 그룹"에 권한
            ▼
   [개발자]
       │ 콘솔에서 "Provision" 클릭
       │ Parameter 입력
       ▼
   ┌────────────────────────────┐
   │ Launch Constraint Role     │ ← 개발자 권한 X에도 대리 실행
   └────────┬───────────────────┘
            │ CFn Stack 생성
            ▼
   [실제 AWS 리소스]
   (개발자는 표준 외 리소스 직접 못 만듦)
```

```
AppConfig 점진 배포
==========================================================

   [개발자]
       │ 새 Feature Flag 값 등록
       ▼
   ┌────────────────────────────┐
   │ Deployment Strategy:        │
   │ Canary10%-20m-Linear20%-6m  │
   └────────┬───────────────────┘
            │
            ▼
   [Application Instances]
   t=0: 10% 인스턴스만 새 설정
        │
        ↓ 20분 모니터링
        ↓ CloudWatch Alarm 정상
        │
   t=20m: 30%
   t=26m: 50%
   t=32m: 70%
   t=38m: 100%

   알람 발생 시 → 자동 롤백
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Service Catalog Launch Constraint** = 사용자 권한 없어도 표준 제품 프로비저닝
2. ⭐ **AppConfig = 코드 재배포 없이 설정 변경** + 점진 배포 + 자동 롤백
3. ⭐ **AppConfig Validator로 잘못된 설정 사전 차단** — JSON Schema 또는 Lambda
4. ⭐ **AppRegistry로 애플리케이션 단위 자산 그룹** — Application Manager 통합 뷰
5. ⭐ **Service Catalog는 다른 계정과 Portfolio 공유** — 멀티 계정 자가 서비스

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Service Catalog Portfolio 생성
PORTFOLIO_ID=$(aws servicecatalog create-portfolio \
  --display-name "Standard Web Apps" \
  --provider-name "Platform Team" \
  --description "Approved web application infrastructure templates" \
  --query 'PortfolioDetail.Id' --output text)

# 2. Product 생성 (CFn 템플릿)
PRODUCT_ID=$(aws servicecatalog create-product \
  --name "Standard Web Stack" \
  --owner "Platform Team" \
  --product-type "CLOUD_FORMATION_TEMPLATE" \
  --provisioning-artifact-parameters '{
    "Name":"v1.0",
    "Info":{"LoadTemplateFromURL":"https://s3.ap-northeast-2.amazonaws.com/templates/web-stack.yaml"},
    "Type":"CLOUD_FORMATION_TEMPLATE"
  }' \
  --query 'ProductViewDetail.ProductViewSummary.ProductId' --output text)

# 3. Portfolio에 Product 추가
aws servicecatalog associate-product-with-portfolio \
  --product-id $PRODUCT_ID \
  --portfolio-id $PORTFOLIO_ID

# 4. Launch Constraint 설정
aws servicecatalog create-constraint \
  --portfolio-id $PORTFOLIO_ID \
  --product-id $PRODUCT_ID \
  --type LAUNCH \
  --parameters '{"RoleArn":"arn:aws:iam::123:role/ServiceCatalogLaunchRole"}'

# 5. 사용자 그룹에 권한
aws servicecatalog associate-principal-with-portfolio \
  --portfolio-id $PORTFOLIO_ID \
  --principal-arn "arn:aws:iam::123:group/Developers" \
  --principal-type IAM

# 6. AppConfig - Application/Environment/Profile 생성
APP_ID=$(aws appconfig create-application \
  --name "OrderService" \
  --query 'Id' --output text)

ENV_ID=$(aws appconfig create-environment \
  --application-id $APP_ID \
  --name "prod" \
  --monitors '[{"AlarmArn":"arn:aws:cloudwatch:ap-northeast-2:123:alarm:OrderErrorHigh"}]' \
  --query 'Id' --output text)

PROFILE_ID=$(aws appconfig create-configuration-profile \
  --application-id $APP_ID \
  --name "FeatureFlags" \
  --location-uri "hosted" \
  --type "AWS.AppConfig.FeatureFlags" \
  --query 'Id' --output text)

# 7. 새 버전 등록 + 배포
aws appconfig create-hosted-configuration-version \
  --application-id $APP_ID \
  --configuration-profile-id $PROFILE_ID \
  --content '{"flags":{"new_search":{"name":"new_search"}},"values":{"new_search":{"enabled":true}},"version":"1"}' \
  --content-type "application/json" \
  --version-label "v1"

aws appconfig start-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-strategy-id "AppConfig.Canary10Percent20Minutes" \
  --configuration-profile-id $PROFILE_ID \
  --configuration-version 1

# 8. AppRegistry Application + Stack 연결
aws servicecatalog-appregistry create-application \
  --name "OrderService" \
  --description "Order processing microservice"

aws servicecatalog-appregistry associate-resource \
  --application "OrderService" \
  --resource-type CFN_STACK \
  --resource "arn:aws:cloudformation:ap-northeast-2:123:stack/order-service-prod/abc"
```

---

## 📝 연습 문제

**문제 1.** 회사가 개발자에게 표준 VPC + RDS 인프라를 자가 서비스로 제공하면서, 개발자가 다른 종류 리소스를 직접 만들 수 없게 강제하려 한다. 어떤 도구?

A) IAM 정책으로 모든 권한 부여
B) Service Catalog + Launch Constraint - 개발자는 권한 없지만 Service Catalog가 대리 실행
C) CloudFormation 직접 제공
D) Terraform Cloud

**정답: B**
해설: 자가 서비스 + 권한 통제의 표준. Launch Constraint Role이 강력한 권한 가지고, 개발자는 카탈로그 제품만 실행 가능. 다른 리소스는 IAM에서 차단.

---

**문제 2.** Lambda 함수의 Feature Flag를 코드 재배포 없이 토글하려 한다. 가장 적합한 도구는?

A) Parameter Store
B) AppConfig + Feature Flag 프로파일 - 점진 배포 + 자동 롤백
C) DynamoDB
D) Lambda 환경 변수

**정답: B**
해설: AppConfig는 정확히 Feature Flag용. 코드 재배포 없이 새 값 배포 + Canary/Linear 전략 + 알람 기반 자동 롤백. Parameter Store도 가능하지만 점진 배포·롤백 기능 없음.

---

**문제 3.** AppConfig 배포 중 잘못된 JSON이 푸시되어 앱이 죽을 가능성을 막으려면?

A) 수동 검토
B) Configuration Profile에 Validator(JSON Schema 또는 Lambda) 설정 - 배포 전 자동 검증
C) Parameter Store 사용
D) S3 buckets

**정답: B**
해설: AppConfig Validator는 배포 전 검증. JSON Schema로 구조 검증, Lambda로 비즈니스 로직 검증. 통과해야 배포 시작.

---

**문제 4.** AppConfig 배포 시 자동 롤백 트리거는?

A) Lambda Timeout
B) CloudWatch Alarm 연결 - 배포 중 알람 발생 시 자동 이전 버전
C) Exception
D) HTTP 5xx

**정답: B**
해설: Environment에 CloudWatch Alarm Monitor 등록. 배포 진행 중(`bake time` 포함) 알람 ALARM 상태 진입 시 자동 롤백.

---

**문제 5.** 회사가 마이크로서비스 50개를 운영한다. 각 서비스의 모든 AWS 자산(CFn Stack, ECS Service 등)을 한 단위로 관리하려면?

A) Tag만으로
B) AppRegistry로 Application 정의 + 자산 연결 → Application Manager 통합 뷰
C) Resource Groups
D) Cost Explorer

**정답: B**
해설: AppRegistry는 애플리케이션 단위 자산 그룹. Application Manager에서 통합 뷰(메트릭/로그/알람/비용). Resource Groups보다 풍부한 메타데이터.

---

## 📌 오늘의 요약

1. Service Catalog: IaC 제품 자가 서비스. Launch Constraint로 권한 없는 사용자도 표준 제품 프로비저닝
2. AppConfig: 애플리케이션 설정 동적 배포. 점진 롤아웃 + 자동 롤백 + Validator
3. Feature Flag는 AppConfig의 핵심 사용 사례. Powertools 라이브러리로 쉽게
4. AppRegistry: 애플리케이션 단위 자산 그룹. Application Manager 통합 뷰
5. AWS Proton: 사내 PaaS. Service Catalog보다 CI/CD까지 통합
