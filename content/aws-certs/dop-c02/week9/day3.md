# Day 3 - AppConfig - 피처 플래그, 점진적 롤아웃

📅 날짜: Week 9 (Day 3)
🎯 주제: 코드 배포 없이 동작 변경 — 피처 플래그·동적 구성
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AppConfig의 3계층(Application/Environment/ConfigurationProfile) 구조
- Deployment Strategy로 점진적 롤아웃
- 검증(Validator) — JSON Schema + Lambda
- AppConfig Agent (Lambda Extension) 활용
- Feature Flag 형식

---

## 🧩 사전 지식 (CS 기초)

- **Feature Flag (Feature Toggle)**: 코드에 분기를 두고 외부에서 on/off — 무중단 배포·실험.
- **Dark Launch**: 새 기능을 일부 사용자에만 노출.
- **Configuration as Data**: 구성을 코드 외부로 — 변경 시 재배포 불필요.
- **Polling + caching**: 클라이언트가 주기적으로 새 값 가져옴 + 캐시.

---

## 📖 이론 내용

### 1. AppConfig 계층 구조

```
Application (예: checkout-api)
  ├─ Environment (dev / staging / prod)
  └─ ConfigurationProfile (예: featureflags / app-settings)
       └─ Hosted Configuration / SSM Parameter / S3 / Secrets Manager
```

**Deployment:**
- Application + Environment + ConfigurationProfile + ConfigurationVersion + DeploymentStrategy

### 2. ConfigurationProfile 종류

- **Feature flag**: 구조화된 플래그 (AppConfig가 권장 형식 지원, 2022+)
- **Freeform**: 임의 JSON/YAML/Text

### 3. Deployment Strategy

```bash
aws appconfig create-deployment-strategy \
  --name Canary10Percent20Minutes \
  --deployment-duration-in-minutes 20 \
  --growth-factor 10 --growth-type LINEAR \
  --final-bake-time-in-minutes 10 \
  --replicate-to NONE
```

- `growth-type`: LINEAR / EXPONENTIAL
- `growth-factor`: 단계별 증가 비율 (예: 10% 씩)
- `final-bake-time`: 100% 도달 후 관찰 시간 (이 동안 알람 트리거 시 자동 롤백)

**사전 정의 전략:**
- `AppConfig.AllAtOnce` (즉시)
- `AppConfig.Linear50PercentEvery30Seconds`
- `AppConfig.Canary10Percent20Minutes`

### 4. Validator

배포 전 자동 검증:
- **JSON Schema**: 구성 형식 검증
- **Lambda**: 임의 검증 로직

```json
// JSON Schema
{
  "type": "object",
  "required": ["maxRetry","timeoutSec"],
  "properties": {
    "maxRetry": {"type":"integer","minimum":1,"maximum":10},
    "timeoutSec": {"type":"integer","minimum":1,"maximum":300}
  }
}
```

Lambda Validator는 구성 내용을 받아 SUCCESS/FAILURE 반환.

### 5. CloudWatch Alarm 자동 롤백

```bash
aws appconfig start-deployment \
  --application-id ... \
  --environment-id ... \
  --deployment-strategy-id ... \
  --configuration-profile-id ... \
  --configuration-version 5
```

Environment에 알람 등록 → 배포 중 알람 발생 시 자동 롤백.

```bash
aws appconfig update-environment \
  --application-id ... \
  --environment-id ... \
  --monitors '[
    {"AlarmArn":"arn:aws:cloudwatch:...:alarm:5xxErrorRate"},
    {"AlarmArn":"arn:aws:cloudwatch:...:alarm:LatencyHigh"}
  ]'
```

### 6. 애플리케이션 사용 — Lambda Extension / SDK

**Lambda Extension (권장):**
```yaml
# template.yaml
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

코드:
```python
import urllib.request

config_url = (
  'http://localhost:2772/applications/checkout-api'
  '/environments/prod/configurations/featureflags'
)

def get_config():
    with urllib.request.urlopen(config_url) as r:
        return json.loads(r.read())
```

Extension이 백그라운드 폴링 + 캐시 → SDK 직접 호출 대비 비용·지연 절감.

**EC2/ECS/EKS Agent:**
- AWS AppConfig Agent를 컨테이너에 사이드카로 또는 EC2 데몬으로
- 동일 localhost:2772 인터페이스

### 7. Feature Flag 형식 (2022+)

```json
{
  "version": "1",
  "flags": {
    "checkoutV2": {
      "name": "checkoutV2",
      "_deprecation": {"status": "active"}
    },
    "darkLaunchPromo": {
      "name": "darkLaunchPromo",
      "attributes": {
        "rolloutPercent": {"constraints": {"type":"number","required":true}}
      }
    }
  },
  "values": {
    "checkoutV2": {"enabled": true},
    "darkLaunchPromo": {"enabled": true, "rolloutPercent": 25}
  }
}
```

코드에서:
```python
flags = get_config()
if flags['checkoutV2']['enabled']:
    new_checkout_flow()
```

---

## 🧠 알아두면 좋은 심화 이론

### CloudWatch Evidently vs AppConfig Feature Flag

| 항목 | AppConfig | CloudWatch Evidently |
|------|-----------|----------------------|
| 목적 | 구성 + 피처 플래그 | A/B 실험 + 통계 |
| 분석 | 외부 (CloudWatch/X-Ray) | 내장 통계 |
| 점진적 롤아웃 | ✅ | ✅ |
| 사용자 세그먼트 | 코드에서 처리 | 내장 |
| 시험 빈도 | 높음 | 중간 |

> AppConfig는 운영 측면, Evidently는 실험·실측. 2024+ Evidently가 deprecation 경고 — AppConfig가 통합 방향.

### Cost Model

- Configuration Sessions: 시간당 과금 (수많은 Lambda 인스턴스가 동시 fetch 시 비용 ↑)
- Lambda Extension의 폴링 간격(`AWS_APPCONFIG_EXTENSION_POLL_INTERVAL_SECONDS`) 튜닝
- 캐시 활용 권장

### Hosted Configuration vs SSM / S3

| 백엔드 | 장점 | 단점 |
|--------|------|------|
| Hosted | AppConfig 자체 관리, 버전, 단순 | 별도 시스템 학습 |
| SSM Parameter | 기존 SSM 표준 | 크기 제한 |
| S3 | 큰 구성 (10MB+) | 버킷 관리 |
| Secrets Manager | 비밀 포함 | 비용 |

### 시험 빈출 — AppConfig가 적합한 시나리오

- "코드 배포 없이 기능 on/off"
- "10% 사용자에만 기능 노출 + 모니터링 후 100%"
- "구성 변경 시 자동 검증 + 알람 발생 시 자동 롤백"

### 관련 서비스 Cross-Reference

- **CodeDeploy Lambda Canary** → Week 4 Day 3 (유사 점진 패턴)
- **CloudWatch Alarms** → Week 10 Day 1
- **Parameter Store** → Week 9 Day 4
- **Secrets Manager** → Week 9 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
AppConfig Feature Flag Flow
==================================================

  Developer commits new flag value
   └─ aws appconfig create-hosted-configuration-version
            │
            ▼
   Validator runs (JSON Schema + Lambda)
            │
            │ pass
            ▼
   aws appconfig start-deployment
   (Strategy: Canary10Percent20Minutes)
            │
            ▼
   AppConfig service rolls out:
      T+0: 10% of polling clients see new value
      T+5min: 30% (LINEAR growth)
      ...
      T+20min: 100%
      T+30min: bake completes (alarm watch)

  Lambda Extension on each function:
   ├─ Polls AppConfig every 45s
   ├─ Caches latest value
   └─ Serves via http://localhost:2772

  If CloudWatch Alarm fires during bake:
   └─ Auto-rollback to previous version
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Application + Environment + ConfigurationProfile + Strategy + Version
2. ⭐ Validator (JSON Schema + Lambda)로 배포 전 자동 검증
3. ⭐ Environment의 Monitors(알람) 발생 시 자동 롤백
4. ⭐ Lambda Extension (localhost:2772)로 폴링 + 캐시
5. ⭐ "코드 배포 없이 기능 on/off"는 거의 항상 AppConfig

---

## 💻 실제 예시 - 전체 흐름

```bash
# 1) Application + Environment 생성
aws appconfig create-application --name checkout-api
APP_ID=...
aws appconfig create-environment --application-id $APP_ID --name prod \
  --monitors '[{"AlarmArn":"arn:aws:cloudwatch:...:alarm:5xxRate"}]'
ENV_ID=...

# 2) ConfigurationProfile (Feature Flag)
aws appconfig create-configuration-profile \
  --application-id $APP_ID \
  --name featureflags \
  --location-uri hosted \
  --type AWS.AppConfig.FeatureFlags \
  --validators 'Type=JSON_SCHEMA,Content=...'
PROFILE_ID=...

# 3) Hosted Configuration Version (v1)
aws appconfig create-hosted-configuration-version \
  --application-id $APP_ID \
  --configuration-profile-id $PROFILE_ID \
  --content-type application/json \
  --content fileb://flags.json

# 4) Deployment Strategy (Canary)
aws appconfig create-deployment-strategy \
  --name canary-20m \
  --deployment-duration-in-minutes 20 \
  --growth-factor 10 --growth-type LINEAR \
  --final-bake-time-in-minutes 10

# 5) Start Deployment
aws appconfig start-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-strategy-id $STRATEGY_ID \
  --configuration-profile-id $PROFILE_ID \
  --configuration-version 1
```

---

## 📝 연습 문제

**문제 1.** "코드 배포 없이 기능 10% → 100% 점진적 활성, 5xx 발생 시 자동 롤백" 가장 적절한 서비스는?

A) Parameter Store
B) AppConfig + Deployment Strategy + Environment Monitor
C) Lambda Layer
D) S3 객체

**정답: B**
해설: AppConfig가 정공법.

---

**문제 2.** AppConfig Validator의 종류는?

A) IAM Policy
B) JSON Schema + Lambda
C) CloudWatch Alarm
D) Config Rule

**정답: B**
해설: 두 종류 검증.

---

**문제 3.** Lambda에서 AppConfig를 가장 효율적으로 사용하려면?

A) 매 호출마다 GetConfiguration SDK
B) AppConfig Lambda Extension Layer → http://localhost:2772 + 캐시
C) DynamoDB 캐시
D) Layer 압축

**정답: B**
해설: Extension이 표준.

---

**문제 4.** Deployment Strategy `final-bake-time-in-minutes 10`의 의미는?

A) 처음 10분 동안만 모니터
B) 100% 도달 후 10분간 알람 관찰 — 발생 시 자동 롤백
C) 10분 후 종료
D) 10분 timeout

**정답: B**
해설: Bake time = 최종 관찰 시간.

---

**문제 5.** Feature Flag 변경의 정상 흐름은?

A) 직접 콘솔 변경
B) 새 hosted configuration version → start-deployment → 점진적 적용 + 알람 모니터 + 필요 시 자동 롤백
C) Pipeline 재배포
D) IAM 변경

**정답: B**
해설: AppConfig 표준 흐름.

---

**문제 6.** AppConfig + Secrets Manager 차이는?

A) 동일
B) AppConfig는 일반 구성 + 피처 플래그, Secrets Manager는 자동 회전 비밀
C) Secrets Manager는 IAM 자동
D) AppConfig는 무료

**정답: B**
해설: 사용 목적 차이.

---

**문제 7.** Lambda Extension 폴링 간격이 너무 짧으면?

A) AppConfig API 비용 증가 + Lambda 추가 부하
B) 항상 좋음
C) 캐시 누수
D) IAM 부담

**정답: A**
해설: 폴링 간격은 트레이드오프 — 신선도 vs 비용.

---

## 📌 오늘의 요약

1. AppConfig = Application + Environment + Profile + Strategy + Version 5요소
2. Validator (JSON Schema + Lambda)로 배포 전 검증
3. Environment Monitor(알람)로 자동 롤백
4. Lambda Extension이 폴링 + 캐시 표준
5. 코드 배포 없는 점진적 기능 출시의 표준 도구
