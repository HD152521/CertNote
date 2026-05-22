# Day 1 - CloudWatch Metrics - 사용자 정의 지표, 차원

📅 날짜: Week 10 (Day 1)
🎯 주제: 메트릭의 표준 + 사용자 정의 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch Metric 구조 (Namespace, Name, Dimensions, Statistic)
- 사용자 정의 지표 게시 방법 3종
- High-Resolution Metric의 사용 사례
- Alarm 평가 모델 (Period × Threshold × Datapoints to alarm)
- Composite Alarm, Anomaly Detection

---

## 🧩 사전 지식 (CS 기초)

- **Metric / Measure**: 수치형 시계열.
- **Dimension**: 메트릭을 구분하는 키-값 (예: InstanceId, ServiceName).
- **Aggregation**: 시간 단위 집계 (Sum, Average, Min, Max, p99).
- **Anomaly Detection**: 머신러닝으로 정상 패턴 학습 후 이상치 탐지.

---

## 📖 이론 내용

### 1. Metric 구조

- Namespace: `AWS/EC2`, `AWS/Lambda`, `MyApp/Orders`
- Metric Name: `CPUUtilization`, `Errors`, `OrderCount`
- Dimensions: `[{Name: 'InstanceId', Value: 'i-xxx'}, ...]`
- Timestamp + Value + Unit

같은 Name이라도 Dimensions 조합마다 별도 메트릭.

### 2. 사용자 정의 지표 3가지 게시 방법

**1) PutMetricData API:**
```bash
aws cloudwatch put-metric-data \
  --namespace MyApp/Orders \
  --metric-name OrderCount \
  --value 5 \
  --dimensions Service=checkout,Environment=prod \
  --unit Count
```

**2) Embedded Metric Format (EMF):**
Lambda/ECS 로그에 JSON 형식 출력 → CloudWatch가 자동 메트릭 추출:
```json
{
  "_aws": {
    "Timestamp": 1716368400000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp/Orders",
      "Dimensions": [["Service"]],
      "Metrics": [{"Name": "OrderCount", "Unit": "Count"}]
    }]
  },
  "Service": "checkout",
  "OrderCount": 5
}
```

API 비용 절감 + 로그 + 메트릭 통합.

**3) CloudWatch Agent (EC2/On-Prem):**
- 시스템 메트릭(CPU, Memory, Disk) + 로그 수집
- StatsD/collectd 호환
- IAM Role의 `CloudWatchAgentServerPolicy` 권한

### 3. High-Resolution Metric

- 표준: 60초 단위
- High-Resolution: 1초 단위
- `--storage-resolution 1` 옵션
- 비용 ↑ — 저장량 60배
- 알람 평가도 10초/30초 가능 (표준은 60초)
- 사용 사례: 즉각 대응 필요한 트래픽 폭증, 실시간 대시보드

### 4. Alarm 평가 모델

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name High5xxRate \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --dimensions Name=LoadBalancer,Value=app/MyApp/abc \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:...:AlertTopic
```

**평가 규칙:** 최근 `evaluation-periods` 중 `datapoints-to-alarm`개가 임계값 초과 시 ALARM.

**Treat Missing Data:**
- `notBreaching` (기본): 정상으로 간주
- `breaching`: 위반으로 간주
- `missing`: 평가 안 함
- `ignore`: 무시

### 5. Composite Alarm

여러 알람의 논리 조합:
```bash
aws cloudwatch put-composite-alarm \
  --alarm-name AppDegraded \
  --alarm-rule "ALARM('High5xx') AND (ALARM('HighLatency') OR ALARM('LowThroughput'))" \
  --alarm-actions arn:aws:sns:...:AppOncall
```

- 알람 노이즈 감소
- 더 정밀한 인시던트 정의
- 자식 알람은 트리거 안 보고 Composite만 통보

### 6. Anomaly Detection

```bash
aws cloudwatch put-anomaly-detector \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=app/MyApp/abc \
  --stat p99

aws cloudwatch put-metric-alarm \
  --alarm-name LatencyAnomaly \
  --comparison-operator LessThanLowerOrGreaterThanUpperThreshold \
  --evaluation-periods 3 \
  --threshold-metric-id ad1 \
  --metrics ...
```

ML 모델이 시계열 패턴 학습 → 비정상 탐지. 임계값 수동 설정 어려운 비즈니스 지표에 유용.

### 7. Metric Math

여러 메트릭의 수식:
```
e1: SUM(Errors) / SUM(Invocations) * 100  # 에러율
```

알람을 수식 결과에 적용 가능 — "에러율 > 1%" 같은 비율 알람.

---

## 🧠 알아두면 좋은 심화 이론

### Cross-Account / Cross-Region Metric Sharing

CloudWatch Cross-Account Observability:
- Monitoring Account가 여러 Source Account의 메트릭/로그 통합 조회
- Source Account가 Sink ARN 등록
- 단방향 — Source는 Monitoring 데이터 못 봄

### Metric Streams

지표를 Kinesis Firehose로 실시간 스트리밍 → S3/Datadog/Splunk.

### Sparse Metric 처리

가끔만 발생하는 이벤트(예: 결제 실패):
- 이벤트마다 `Count: 1` 보내기보다 EMF로 일괄
- `treat-missing-data: notBreaching` 활용
- 0 값을 명시적으로 보내는 패턴

### CloudWatch Synthetics

URL/API의 정기 헬스 체크 — 시뮬레이션 트랜잭션 (Week 10 Day 4 참조).

### 관련 서비스 Cross-Reference

- **EMF + Container Insights** → Week 10 Day 3
- **Anomaly Detection** → Week 11 Day 2 (X-Ray와 비교)
- **Composite Alarm** → Week 12 Day 1 (인시던트)

---

## 🏗️ 아키텍처 다이어그램

```
CloudWatch Metrics Architecture
==================================================

  Sources
   ├─ AWS Services (auto AWS/* namespace)
   ├─ Lambda → EMF in log → auto-extract
   ├─ EC2 → CloudWatch Agent
   ├─ App PutMetricData API
   └─ Metric Streams (Firehose to external)

         ▼
  CloudWatch Metrics
   ├─ Namespace/Name/Dimensions
   ├─ Storage: 1s/60s resolution
   └─ Retention: 1s for 3h, 60s for 15d, 5min for 63d, 1h for 15 months

         ▼
  Alarms
   ├─ Threshold (static)
   ├─ Anomaly Detection (ML)
   ├─ Metric Math (e.g., error rate)
   └─ Composite (AND/OR of alarms)

         ▼
  Actions
   ├─ SNS / Chatbot / Slack
   ├─ Auto Scaling (Target Tracking)
   ├─ EC2 actions (Stop, Terminate, Reboot)
   └─ EventBridge → Lambda → custom remediation
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ EMF로 Lambda/ECS 로그에서 메트릭 자동 추출 + API 비용 절감
2. ⭐ Alarm 평가 = evaluation-periods 중 datapoints-to-alarm 위반
3. ⭐ treat-missing-data 4종 (notBreaching/breaching/missing/ignore)
4. ⭐ Composite Alarm으로 알람 노이즈 감소
5. ⭐ Anomaly Detection으로 임계값 자동 학습

---

## 💻 실제 예시 - EMF + Composite Alarm

```python
# Lambda (Powertools)
from aws_lambda_powertools.metrics import Metrics, MetricUnit
metrics = Metrics(namespace="MyApp/Orders", service="checkout")

@metrics.log_metrics
def handler(event, context):
    metrics.add_metric(name="OrderCount", unit=MetricUnit.Count, value=1)
    metrics.add_dimension(name="Region", value="ap-northeast-2")
    ...
```

```bash
# 알람 두 개 + Composite
aws cloudwatch put-metric-alarm --alarm-name High5xx \
  --metric-name HTTPCode_Target_5XX_Count --namespace AWS/ApplicationELB \
  --statistic Sum --period 60 --threshold 10 \
  --evaluation-periods 3 --datapoints-to-alarm 2 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching

aws cloudwatch put-metric-alarm --alarm-name HighLatency \
  --metric-name TargetResponseTime --extended-statistic p99 \
  --period 60 --threshold 0.5 \
  --evaluation-periods 3 --datapoints-to-alarm 2 \
  --comparison-operator GreaterThanThreshold

aws cloudwatch put-composite-alarm --alarm-name AppDegraded \
  --alarm-rule "ALARM('High5xx') AND ALARM('HighLatency')" \
  --alarm-actions arn:aws:sns:...:OncallTopic
```

---

## 📝 연습 문제

**문제 1.** Lambda에서 사용자 정의 메트릭을 비용 효율적으로 게시하려면?
A) PutMetricData 매 호출
B) EMF로 로그 출력 → CloudWatch가 자동 추출
C) CloudWatch Agent
D) X-Ray

**정답: B**

### 2
**문제 2.** Alarm `evaluation-periods 5 datapoints-to-alarm 3`의 의미는?
A) 5분간 평가
B) 최근 5번 평가 중 3번 임계값 위반 시 ALARM
C) 3번 평가 후 5번 알림
D) 3분 timeout

**정답: B**

### 3
**문제 3.** Sparse metric (가끔만 발생)의 알람 설정에서 가장 적절한 treat-missing-data는?
A) breaching
B) notBreaching (기본) — 데이터 없으면 정상으로 간주
C) ignore
D) missing

**정답: B**

### 4
**문제 4.** Composite Alarm의 이점은?
A) 비용 절감
B) 여러 알람을 AND/OR로 결합 → 노이즈 감소 + 정밀 인시던트 정의
C) Region 확장
D) Cross-Account 자동

**정답: B**

### 5
**문제 5.** Anomaly Detection 알람의 사용 사례는?
A) 정적 임계값이 충분
B) 시간대별 정상 패턴이 변하는 비즈니스 지표 (요일/시간 변동)
C) 단일 이벤트
D) Backup

**정답: B**

### 6
**문제 6.** High-Resolution Metric의 사용 사례는?
A) 비용 최저
B) 1초 단위 측정 + 10초 알람 — 즉각 대응 필요한 트래픽 폭증
C) 장기 보관
D) DR

**정답: B**

### 7
**문제 7.** Metric Math의 용도는?
A) 단일 메트릭 표시
B) 여러 메트릭 수식 (에러율 = Errors/Invocations) → 비율/파생 알람
C) 알람 자동 삭제
D) Region 분산

**정답: B**

---

## 📌 오늘의 요약

1. EMF로 Lambda/ECS 로그에서 메트릭 자동 추출
2. Alarm 평가 = N periods 중 M datapoints 위반
3. treat-missing-data 4종으로 sparse metric 처리
4. Composite Alarm으로 노이즈 감소
5. Anomaly Detection / Metric Math로 정밀 알람
