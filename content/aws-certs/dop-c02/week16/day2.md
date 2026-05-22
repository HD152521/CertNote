# Day 2 - 도메인 3·4 복습 (복원력 + 모니터링/로깅)

📅 날짜: Week 16 (Day 2)
🎯 주제: 시험 도메인 3(15%) + 4(15%) 총 30% 핵심 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 도메인 3(복원력) DR 전략 4종과 Multi-Region 패턴 정리
- 도메인 4(모니터링/로깅) CloudWatch/X-Ray/OpenSearch 핵심
- RTO/RPO 트레이드오프와 시나리오 단서 매핑

---

## 🧩 사전 지식 (CS 기초)

- **RTO**: Recovery Time Objective — 복구까지 허용 시간
- **RPO**: Recovery Point Objective — 데이터 손실 허용 시점
- **MTBF/MTTR**: 평균 무고장 시간 / 평균 복구 시간

---

## 📖 이론 내용

### 1. 도메인 3: DR 4종 전략

| 전략 | RTO | RPO | 비용 | 설명 |
|------|-----|-----|------|------|
| **Backup & Restore** | 시간~일 | 시간 | 최저 | 백업만 보관 |
| **Pilot Light** | 십 분 | 분 | 낮음 | 핵심만 켜둠 |
| **Warm Standby** | 분 | 초~분 | 중간 | 축소 환경 상시 |
| **Multi-Site Active-Active** | 0 | 0 | 최고 | 완전 동등 운영 |

### 2. Multi-Region 핵심 도구

- **Route 53**: Failover/Weighted/Latency/Geolocation 라우팅, Health Check
- **Aurora Global Database**: <1초 RPO, 1분 RTO, 5 리전까지
- **DynamoDB Global Tables**: Active-Active, 마지막 쓰기 승리
- **S3 Cross-Region Replication**: SRR/CRR, RTC(15분 SLA)
- **AWS Backup Cross-Region Copy**: 백업 복제
- **CloudFormation StackSets**: 멀티 리전 인프라 배포
- **Global Accelerator**: Anycast IP, 1초 페일오버

### 3. 도메인 4: CloudWatch 5가지 축

| 영역 | 핵심 |
|------|------|
| Metrics | 사용자 정의 지표, 고해상도 1초 |
| Logs | LogGroup/Stream, Insights 쿼리, Subscription Filter |
| Alarms | Composite, Anomaly Detection, M of N |
| Dashboards | 크로스 계정/리전 |
| Events(EventBridge) | 이벤트 라우팅 |

### 4. 관찰성 도구

- **CloudWatch Agent**: EC2/온프레 메트릭/로그
- **Container Insights**: ECS/EKS 자동
- **Lambda Insights**: 함수 단위 메모리/CPU
- **X-Ray**: 분산 트레이스, 샘플링 룰, Groups
- **ADOT**: OpenTelemetry 매니지드 배포판
- **Synthetics Canary**: API/UI 합성 테스트
- **RUM**: 실제 사용자 모니터링
- **Evidently**: 피처 플래그 + A/B 실험
- **Managed Prometheus / Managed Grafana**: 오픈소스 호환

### 5. EMF (Embedded Metric Format)

- 로그에 메트릭을 포함하면 CloudWatch가 자동 추출
- Lambda 등에서 PutMetricData 호출 비용 절감
- 고차원 메트릭 효율적

### 6. 로그 라우팅 패턴

```
서비스 로그
  ├─ CloudWatch Logs (보존/Insights)
  ├─ Subscription Filter → Kinesis Data Firehose
  │                          ├─ S3 (장기 보관)
  │                          ├─ OpenSearch (검색)
  │                          └─ Lambda (변환)
  └─ FireLens (컨테이너) → 다중 분기
```

---

## 🧠 자주 헷갈리는 함정

1. **Aurora Global vs RDS Cross-Region Read Replica**: Global이 더 빠른 RPO/RTO
2. **DynamoDB Global Tables는 Active-Active**, 마지막 쓰기 승리(LWW)
3. **Route 53 Health Check 비용**: HTTPS/Calculated/Endpoint별 다름
4. **CloudWatch Logs Insights는 쿼리당 과금** — Subscription Filter 무료가 아님
5. **X-Ray 샘플링 룰**은 기본 1req/s + 5% — Pro 환경에선 조정 필수

---

## 🏗️ 아키텍처 다이어그램

```
복원력 + 관찰성 통합
==================================================

  Region A (Primary)         Region B (DR)
  ┌────────────────┐         ┌────────────────┐
  │ ALB + ECS/EKS  │         │ ALB + ECS/EKS  │
  │ Aurora Global  │ ◄─────► │ Aurora Global  │
  │ S3 + CRR       │ ◄─────► │ S3 (replica)   │
  └────────┬───────┘         └────────┬───────┘
           │                          │
           └──── Route 53 / GA ───────┘
                       │
                       ▼
              사용자 페일오버

  관찰성:
  CloudWatch Metrics/Logs (Cross-Account/Region)
  X-Ray Service Map
  ADOT → Managed Prometheus
  Synthetics Canary (외부)
  Alarms → SNS/Chatbot/EventBridge
```

---

## ⭐ 핵심 포인트

1. ⭐ DR 4종: 단서 "RTO X, RPO Y" → 비용 vs 복구속도 트레이드오프
2. ⭐ Aurora Global = 가장 빠른 DB DR
3. ⭐ Route 53 Failover + Health Check = 기본 페일오버
4. ⭐ CloudWatch Cross-Account Observability로 멀티 계정 통합
5. ⭐ EMF로 Lambda 메트릭 비용/성능 최적

---

## 💻 빠른 CLI 점검

```bash
# Aurora Global Database
aws rds create-global-cluster --global-cluster-identifier prod-global \
  --source-db-cluster-identifier arn:aws:rds:ap-northeast-2:ACCT:cluster:prod

# Route 53 Failover
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://failover.json

# CloudWatch Cross-Account Source
aws oam create-link --label-template '$AccountName' --resource-types AWS::CloudWatch::Metric AWS::Logs::LogGroup AWS::XRay::Trace \
  --sink-identifier arn:aws:oam:...:sink/...

# X-Ray 샘플링 룰
aws xray create-sampling-rule --cli-input-json file://rule.json

# Logs Subscription Filter
aws logs put-subscription-filter --log-group-name app --filter-name ToFirehose \
  --filter-pattern '' --destination-arn arn:aws:firehose:...:deliverystream/logs
```

---

## 📝 연습 문제 (Pro 시나리오형 6문항)

**1.** RTO 1분, RPO 1초의 DB DR 요구?
A) RDS Cross-Region Read Replica B) **Aurora Global Database**
C) DynamoDB Streams D) S3 CRR
**정답: B**

**2.** Active-Active 두 리전, 마지막 쓰기 승리가 허용되는 키-값 저장?
A) Aurora Multi-Master B) **DynamoDB Global Tables**
C) ElastiCache Global Datastore D) RDS Multi-AZ
**정답: B**

**3.** 글로벌 사용자 1초 이내 페일오버, IP 고정 필요?
A) Route 53 Failover B) **AWS Global Accelerator**
C) CloudFront D) NLB
**정답: B**

**4.** 30개 계정 메트릭을 단일 대시보드로 통합?
A) Lambda 스크립트 B) **CloudWatch Cross-Account Observability(OAM)**
C) S3 + Athena D) Grafana만
**정답: B**

**5.** Lambda에서 고차원 사용자 정의 메트릭 비용 절감?
A) PutMetricData B) **Embedded Metric Format (EMF)**
C) Logs Insights D) X-Ray
**정답: B**

**6.** 컨테이너 로그를 CloudWatch + S3 + OpenSearch에 동시 분기?
A) CloudWatch Agent B) **FireLens(Fluent Bit) + Kinesis Firehose**
C) X-Ray D) Logstash 자체
**정답: B**

---

## 📌 오늘의 요약

1. DR 4종 트레이드오프(RTO/RPO/비용) 암기
2. Aurora Global이 DB DR 표준
3. CloudWatch OAM이 멀티 계정 가시화 표준
4. EMF가 Lambda 메트릭 비용/성능 최적
5. FireLens가 컨테이너 로그 다중 분기 표준
