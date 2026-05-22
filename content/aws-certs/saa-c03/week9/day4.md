# Day 44 - X-Ray, Trusted Advisor, Health Dashboard

📅 날짜: Week 9 (Day 4)
🎯 주제: 분산 트레이싱과 권고·상태 모니터링
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- X-Ray 분산 트레이싱의 개념과 적용 방식을 안다
- Trusted Advisor의 5대 카테고리와 무료/Business 차이를 안다
- Health Dashboard로 인프라/계정 헬스를 본다

---

## 🧩 사전 지식 (CS 기초)

- **분산 트레이싱**: 한 요청이 여러 서비스(MS)를 지나갈 때 그 흐름을 한 ID로 추적.
- **샘플링(Sampling)**: 모든 요청 추적은 비싸므로 일부만 캡처.
- **OpenTelemetry**: 트레이싱 표준. ADOT(AWS Distro for OpenTelemetry).

---

## 📖 이론 내용

### 1. X-Ray

- **Trace = Segment + Subsegment** 트리.
- SDK 또는 OpenTelemetry → 데몬/ADOT → X-Ray API.
- **Service Map** 자동 생성: 서비스 간 호출 그래프 + 지연·에러율.
- 통합: **Lambda 자동(Active Tracing), API GW, ALB, ECS, EKS, EC2 Agent**.
- 샘플링 규칙: 초당 1 + 5% 같은 규칙.

### 2. Trusted Advisor

5대 카테고리:
1. **Cost Optimization**
2. **Performance**
3. **Security**
4. **Fault Tolerance**
5. **Service Limits**

- **무료(Core)** 점검: 일부 보안·서비스 한도 점검.
- **Business/Enterprise Support**: 전체 점검, API 사용 가능.
- EventBridge 통합으로 알림.

### 3. AWS Health Dashboard

- **Personal Health Dashboard (PHD)**: 내 계정 영향 받는 이벤트(점검·장애).
- **Service Health Dashboard**: 전체 AWS 서비스 상태.
- **AWS Health API** + EventBridge로 자동 대응.

### 4. CloudWatch와의 관계

- CW = 자체 인프라 메트릭/로그/알람.
- X-Ray = 분산 트레이싱.
- TA = 모범 사례 권고.
- Health = AWS 측 이벤트.

### 5. Compute Optimizer

- ML 기반 EC2/EBS/Lambda/ASG/ECS 권장 크기.
- 비용·성능 추천.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **CloudWatch ServiceLens** | CW + X-Ray 통합 뷰 | 단일 화면 |
| **CloudWatch RUM** | 클라이언트 사이드 모니터링 | 실제 사용자 |
| **DevOps Guru** | ML 기반 운영 이상 탐지 | 비용 |
| **Application Signals** | SLO/SLI 자동 트래킹 | 신규 |
| **ADOT (OpenTelemetry)** | 표준 트레이싱 | 권장 |

> ⚠️ **함정**: "Lambda 함수 호출 지연 원인 파악(다운스트림 API 호출 포함)" → **X-Ray Active Tracing**.

> 💡 **암기 팁**: 내 코드 = X-Ray / 환경 권고 = Trusted Advisor / AWS 측 사고 = Health.

### 관련 서비스 Cross-Reference

- CloudWatch → Day 1
- Compute Optimizer → Week 10 비용
- Synthetics / RUM → Day 1

---

## 🏗️ 아키텍처 다이어그램

```
[ X-Ray 분산 트레이싱 ]

  Client → API GW → Lambda → DynamoDB
                ↓
              Lambda → SNS → Lambda → S3

   각 호출에 Trace ID 전파
        ▼
   X-Ray Service Map: 노드 = 서비스, 엣지 = 호출, 지연·에러율 시각화
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ X-Ray = 분산 트레이싱. Service Map.
2. ⭐ Lambda Active Tracing 켜면 자동.
3. ⭐ Trusted Advisor 5대 카테고리, Business+에서 풀 제공.
4. ⭐ Health Dashboard = AWS 측 이벤트.
5. ⭐ Compute Optimizer로 right-sizing.

---

## 💻 실제 예시 - AWS CLI

```bash
# Lambda Active Tracing 켜기
aws lambda update-function-configuration --function-name saa-fn \
  --tracing-config Mode=Active

# X-Ray 샘플링 규칙
aws xray create-sampling-rule --sampling-rule '{
  "RuleName":"default","Priority":1000,"FixedRate":0.05,
  "ReservoirSize":1,"ServiceName":"*","ServiceType":"*",
  "Host":"*","HTTPMethod":"*","URLPath":"*","Version":1
}'

# Compute Optimizer 권장 (계정 활성화 후)
aws compute-optimizer get-ec2-instance-recommendations
```

---

## 📝 연습 문제

**문제 1.** Lambda → DDB → 외부 API 호출의 지연 원인 진단:

A) CW Metrics만 B) X-Ray (Active Tracing) C) Trusted Advisor D) Logs Insights

**정답: B**.

---

**문제 2.** AWS 측 점검·장애 영향 알람:

A) GuardDuty B) Trusted Advisor C) AWS Health + EventBridge D) Config

**정답: C**.

---

**문제 3.** 사용 안 하는 EIP, 보안 그룹 0.0.0.0/0 같은 점검:

A) Trusted Advisor B) Config 모두 만들기 C) Macie D) Inspector

**정답: A** (Trusted Advisor가 가장 일반).

---

**문제 4.** EC2 right-sizing:

A) Trusted Advisor 일부 + Compute Optimizer B) Macie C) X-Ray D) Config

**정답: A**.

---

**문제 5.** Service Quota 임박 자동 알림:

A) Trusted Advisor + EventBridge B) IAM 정책 C) Config Aggregator D) Health Dashboard 전용

**정답: A**.

---

## 📌 오늘의 요약

1. X-Ray로 분산 트레이싱과 Service Map.
2. Trusted Advisor 5대 카테고리·Business+ 풀 사용.
3. Health Dashboard로 AWS 측 사고.
4. Compute Optimizer로 right-sizing.
5. ADOT + Application Signals로 SLO 추적.
