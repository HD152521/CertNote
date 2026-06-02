# Day 3 - Lambda 버전/별칭 + CodeDeploy Canary

📅 날짜: Week 7 (Day 3)
🎯 주제: Lambda의 무중단 배포 표준화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Version 게시 시점·내용·삭제 규칙
- Alias weighted routing의 정확한 동작
- Provisioned Concurrency와 SnapStart의 비교
- API Gateway/EventBridge가 Alias를 어떻게 가리키는가

---

## 🧩 사전 지식 (CS 기초)

- **Immutable Snapshot**: 한 번 만들면 변경 불가. Lambda Version의 본질.
- **Pointer (Symbolic Link)**: Alias = Version 포인터.
- **Pinning**: 특정 Version에 고정. 운영 안정.
- **Cold Start**: 함수 코드 다운로드 + 런타임 init + 함수 init.

---

## 📖 이론 내용

### 1. Version

- `$LATEST`: 변경 가능한 작업 사본 (코드/환경/메모리 등)
- `1`, `2`, ... : `$LATEST` 스냅샷의 불변 복사본
- 게시: `aws lambda publish-version`
- 삭제: `aws lambda delete-function --qualifier 5`

> ⚠️ `$LATEST`만 가리키는 Alias의 weighted routing은 불가 — Version은 숫자여야 함.

### 2. Alias

- `live`, `prod`, `staging` 같은 이름
- 단일 Version 가리키거나 + 추가 Version weighted
- API Gateway/Event Source Mapping이 Alias ARN을 참조하면 코드 변경에 자동 따라감

```bash
# 단일 Version
aws lambda create-alias --function-name MyFn --name live --function-version 5

# Weighted (Canary)
aws lambda update-alias --function-name MyFn --name live \
  --function-version 5 \
  --routing-config AdditionalVersionWeights={6=0.1}
```

> ⚠️ 한 Alias는 primary + 단 1개 secondary 만. CodeDeploy가 이 한계를 활용해 Canary 진행.

### 3. Lambda Provisioned Concurrency (PC)

```bash
aws lambda put-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier live \
  --provisioned-concurrent-executions 10
```

- Alias 또는 Version 수준 설정
- 미리 워밍업된 N개 환경 유지
- 호출은 PC가 다 차면 일반 환경으로 폴백 (cold start 발생 가능)
- 분 단위 과금 (시간이 아님)

**Auto Scaling Application으로 PC 자동 조정:**
```bash
aws application-autoscaling register-scalable-target \
  --service-namespace lambda \
  --resource-id function:MyFn:live \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --min-capacity 5 --max-capacity 100
```

### 4. SnapStart (Java/Python/.NET)

Java 등 큰 init 시간 함수의 cold start를 ~10배 단축:
- 첫 init 후 메모리/디스크 스냅샷 저장
- 이후 호출은 스냅샷 복원
- Snap-resilient 코드 작성 필요 (랜덤 시드, DB 연결 등 주의)
- Java: 무료, Python/.NET: $0.0000015625/GB-second (저장 비용)

> 시험 빈출: Java cold start 문제 → SnapStart 권장.

### 5. CodeDeploy Lambda 흐름 재정리

```
Pipeline의 Deploy Stage
   ↓
sam deploy 또는 lambda update-function-code
   ↓ AutoPublishAlias 활성 시
새 Version (예: 7) 자동 게시
   ↓
CodeDeploy가 Alias를 weighted routing 시작
   live → V6: 90%, V7: 10%   (Canary)
   ↓
대기 (예: 5분) + 알람 모니터
   ↓ 알람 OK
live → V7: 100%
   ↓ 알람 발생 시
즉시 live → V6: 100% (롤백)
```

### 6. API Gateway / EventBridge가 Alias 가리키기

**API Gateway Stage Variable:**
```
GET /orders/{id}
Integration URI: arn:aws:apigateway:.../arn:aws:lambda:.../MyFn:${stageVariables.alias}/invocations
```

배포 시 stage variable `alias=live` 설정 → Alias 트래픽 시프트가 즉시 반영.

**EventBridge Rule:**
```json
{"Arn": "arn:aws:lambda:...:MyFn:live"}
```

Alias ARN을 target으로 → Alias가 가리키는 Version으로 라우팅.

> ⚠️ Alias 권한: `aws lambda add-permission` 시 `--qualifier live` 필수. Function ARN만 권한 주면 Alias 호출 거부.

---

## 🧠 알아두면 좋은 심화 이론

### Version Pruning

CDK는 자동 prune 옵션:
```typescript
new lambda.Function(this, 'F', {
  ...
  currentVersionOptions: {
    removalPolicy: cdk.RemovalPolicy.RETAIN,  // 또는 DESTROY로 자동 정리
  },
});
```

또는 EventBridge Schedule + Lambda로 90일 이상 사용 안 된 Version 삭제 자동화.

### Lambda Layer 버전

- Layer도 Version 관리
- Function이 참조하는 Layer는 ARN의 Version으로 고정 (예: `arn:...:layer/PowertoolsLayer:5`)
- Layer 업데이트는 새 Version → Function이 명시적으로 참조 변경 필요 (자동 따라가지 않음)

### URLs와 Alias

```bash
aws lambda create-function-url-config \
  --function-name MyFn \
  --qualifier live \
  --auth-type AWS_IAM
```

Function URL이 Alias 단위 가능. Blue/Green에 자연스러움.

### Reserved vs Provisioned Concurrency

| 항목 | Reserved | Provisioned |
|------|----------|-------------|
| 목적 | 동시 실행 한도 설정 (다른 함수 보호) | 미리 워밍업 (cold start 제거) |
| 비용 | 무료 | 사용 시간 비례 과금 |
| Cold Start | 영향 없음 | 제거 |

### Lambda 동시성 모델

- 계정당 동시 실행 1000 (기본, 확장 가능)
- Reserved를 일부 함수에 두면 나머지 함수의 unreserved pool에서 차감
- Provisioned는 Reserved 안에 포함

### 관련 서비스 Cross-Reference

- **CodeDeploy Canary** → Week 4 Day 3
- **SAM AutoPublishAlias** → Week 7 Day 1
- **API Gateway** → Week 7 Day 4 (Step Functions와 함께)

---

## 🏗️ 아키텍처 다이어그램

```
Lambda Version/Alias + CodeDeploy
==================================================

  CodeBuild ─► sam deploy
                 │
                 │ AutoPublishAlias: live
                 │ DeploymentPreference: Canary10Percent5Minutes
                 │
                 ▼
        Lambda Function MyFn
          ├─ $LATEST  (dev work copy)
          ├─ Version 5  (PROD-CURRENT)
          ├─ Version 6  (NEW)
          └─ Alias "live"
               primary: V5
               weighted: V6=10%

  ┌── API Gateway prod stage (variable: alias=live)
  │       integration: arn:...:MyFn:${stageVariables.alias}
  │
  └── EventBridge Rule target: arn:...:MyFn:live

  CodeDeploy proceeds:
   T+0: V5:90, V6:10
   T+5m: monitor CloudWatch alarms
   T+5m (no alarm): V5:0, V6:100
   T+5m (alarm): V5:100, V6:0  (rollback)

  Provisioned Concurrency:
   PC on V5: 10 → must add PC on V6: 10 before traffic shift
   Total PC cost 2x during deploy
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Version은 불변 스냅샷, Alias는 가변 포인터
2. ⭐ Weighted routing은 primary + 단 1개 secondary
3. ⭐ Alias 권한은 `--qualifier` 명시 — Function ARN만으로 불가
4. ⭐ PC는 Alias/Version 수준, 배포 중 두 Version 모두 비용
5. ⭐ SnapStart는 Java cold start의 표준 해법 (Python/.NET도 지원)

---

## 💻 실제 예시 - 전체 자동화

```bash
# 1) SAM template에서 AutoPublishAlias + DeploymentPreference (Week 7 Day 1 참조)
# 2) PC를 Alias에 자동 조정
aws application-autoscaling register-scalable-target \
  --service-namespace lambda \
  --resource-id function:MyFn:live \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --min-capacity 5 --max-capacity 50

aws application-autoscaling put-scaling-policy \
  --service-namespace lambda \
  --resource-id function:MyFn:live \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --policy-name pc-target-utilization \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 0.7,
    "PredefinedMetricSpecification": {"PredefinedMetricType": "LambdaProvisionedConcurrencyUtilization"}
  }'

# 3) API Gateway가 Alias 가리키게 (stage variable)
aws apigateway create-stage \
  --rest-api-id abc \
  --stage-name prod \
  --variables alias=live

# 4) 새 Version 게시 + Alias 시프트는 CodeDeploy가 자동
```

---

## 📝 연습 문제

**문제 1.** Lambda Alias의 weighted routing이 동시에 가리킬 수 있는 Version 수는?

A) 1개
B) 2개 (primary + 1 secondary)
C) 3개
D) 무제한

**정답: B**
해설: 시험 빈출 함정.

---

**문제 2.** Java Lambda의 cold start가 1초 넘는다. 가장 효과적인 해결은?

A) Reserved Concurrency
B) SnapStart 활성화
C) Layer 사용
D) ARM으로 변경

**정답: B**
해설: Java cold start의 표준 답.

---

**문제 3.** API Gateway가 Lambda Alias를 가리키게 하려면?

A) Stage Variable로 alias 이름 지정 + Integration URI에 `${stageVariables.alias}` 사용
B) Lambda Trigger 추가
C) IAM Role 변경
D) X-Ray 활성

**정답: A**
해설: stageVariables 패턴이 표준.

---

**문제 4.** $LATEST에 weighted routing이 가능한가?

A) 가능
B) 불가능 — Version은 숫자여야 함
C) 일부 리전만
D) Layer로 우회 가능

**정답: B**
해설: $LATEST는 가변 — Alias의 weighted 대상 불가.

---

**문제 5.** Provisioned Concurrency와 Reserved Concurrency의 차이는?

A) 동일
B) PC는 워밍업 + 유료, Reserved는 동시 실행 한도 + 무료
C) PC는 무료
D) Reserved는 cold start 제거

**정답: B**
해설: 두 개념의 정확한 구분.

---

**문제 6.** Alias 권한을 부여하지 않고 Function ARN 권한만 줬다. 결과는?

A) 정상 작동
B) Alias 호출이 거부 — `add-permission --qualifier <alias>` 필요
C) 자동으로 Alias 권한 부여
D) Layer 권한 부여

**정답: B**
해설: 흔한 트러블슈팅 포인트.

---

**문제 7.** PC가 설정된 Lambda를 Canary 배포할 때 비용 영향은?

A) 변화 없음
B) 배포 중 두 Version에 PC 비용 모두 발생 (가중치 분배되지만 양쪽 워밍 필요)
C) PC 자동 해제
D) 비용 50% 감소

**정답: B**
해설: 배포 중 일시 비용 증가.

---

## 📌 오늘의 요약

1. Version은 불변 스냅샷, Alias는 가변 포인터
2. Alias weighted routing은 primary + 단 1개 secondary
3. Alias 권한은 `--qualifier` 명시 필수
4. PC(워밍업, 유료) vs Reserved(한도, 무료) 구분
5. Java/Python/.NET Cold Start은 SnapStart 표준 해법
