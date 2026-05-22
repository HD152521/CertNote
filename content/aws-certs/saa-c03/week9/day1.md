# Day 41 - CloudWatch: 지표, 경보, Logs, Insights

📅 날짜: Week 9 (Day 1)
🎯 주제: AWS 표준 관찰성 도구
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch Metrics / Alarms / Logs / Insights / Dashboards를 안다
- 표준 메트릭과 사용자 정의 메트릭의 차이를 안다
- Logs Subscription / Cross-account / Container Insights를 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **메트릭 vs 로그 vs 트레이스 = 관찰성의 3개 기둥**.
- **샘플링 주기(Period)**: 1분/5분/표준 등. 비용·해상도 trade-off.
- **상관관계**: 한 사건을 메트릭·로그·트레이스로 교차 확인.

---

## 📖 이론 내용

### 1. Metrics

- **Namespace** (`AWS/EC2`) + **Dimension** + **Metric Name**.
- **표준 메트릭**: CPU, NetworkIn, DiskRead 등 (EC2는 메모리·디스크 안 보임 → CW Agent).
- **사용자 정의 메트릭**: PutMetricData.
- **고해상도(1초)**: 추가 비용.

### 2. Alarms

- **OK / ALARM / INSUFFICIENT_DATA**.
- 액션: **SNS / EC2 Auto Recovery / ASG Scaling / Systems Manager**.
- **Composite Alarm**: 다른 알람의 조합.
- **Anomaly Detection**: ML 기반 자동 임계값.

### 3. CloudWatch Logs

- **Log Group → Log Stream → Log Event**.
- 보존 기간 1일 ~ 영구.
- **Subscription Filter** → Lambda / Kinesis / Firehose로 실시간 전달.
- **Cross-account 구독** 가능.
- **CloudWatch Logs Insights**: SQL-like 쿼리.

### 4. Logs Agent / Unified Agent

- **CloudWatch Agent** (Unified): 메모리·디스크 + 사용자 로그.
- EC2 / 온프레미스 / Container 지원.

### 5. Container / Lambda 관찰성

- **Container Insights**: ECS/EKS 자동 메트릭/로그.
- **Lambda Insights**: 코어 메트릭·콜드스타트.
- **EMF (Embedded Metric Format)**: 로그에 메트릭 포함.

### 6. Dashboards & Synthetics

- **CloudWatch Dashboards**: 여러 리전·계정 합성.
- **Synthetics**: Headless 브라우저로 외부 모니터링.
- **RUM**: 실제 사용자 모니터링(브라우저 JS).

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Metric Streams** | 메트릭을 Kinesis로 거의 실시간 외부 export | 외부 모니터링 통합 |
| **Logs to S3 Archive** | 장기 보관 | 비용·컴플라이언스 |
| **Cross-region Dashboards** | 글로벌 가시성 | 운영 |
| **EventBridge vs CW Events** | EB가 신상 | 마이그레이션 |
| **Container/Lambda Insights** | 별도 활성화 + 비용 | 시험 가벼움 |

> ⚠️ **함정**: "EC2 메모리·디스크 사용률 지표" → 기본 안 보임. **CloudWatch Agent 설치 필요**.

> 💡 **암기 팁**: 메트릭 = CloudWatch / 로그 = Logs / 분산 트레이스 = X-Ray.

### 관련 서비스 Cross-Reference

- ASG Scaling Policy → Week 3
- X-Ray → Day 4
- OpenSearch 로그 분석 → Week 5

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 관찰성 ]

  EC2/ECS/Lambda → CW Metrics / Logs
                         │
                   Alarms → SNS → 운영자
                         │ Subscription
                   Filter → Lambda → 사용자 처리
                         │ Logs Insights
                         └── 쿼리 / 대시보드

  Container Insights / Lambda Insights / RUM / Synthetics
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **EC2 메모리/디스크는 기본 X**. CW Agent 필요.
2. ⭐ Alarm → ASG / EC2 Recovery / SNS 표준 액션.
3. ⭐ **Logs Insights**로 SQL-like 쿼리.
4. ⭐ Subscription Filter → Lambda/Kinesis/Firehose 실시간.
5. ⭐ Container Insights / Lambda Insights 별도 활성화.

---

## 💻 실제 예시 - AWS CLI

```bash
# Alarm 만들기 (CPU > 70% 5분 2회)
aws cloudwatch put-metric-alarm --alarm-name HighCPU \
  --metric-name CPUUtilization --namespace AWS/EC2 \
  --statistic Average --period 60 --threshold 70 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 --datapoints-to-alarm 2 \
  --alarm-actions arn:aws:sns:...:ops

# Logs Insights 쿼리
aws logs start-query --log-group-name /aws/lambda/saa-fn \
  --start-time $(date -d '-1 hour' +%s) --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20'
```

---

## 📝 연습 문제

**문제 1.** EC2 메모리 메트릭이 안 보임. 원인?

A) 표준 안 보임. CW Agent 설치 필요 B) IAM Role 누락만 C) 비용 D) 리전 문제

**정답: A**.

---

**문제 2.** CPU 70% 초과 시 ASG 스케일 + 운영자 이메일:

A) Alarm + ASG Action + SNS B) Lambda 폴링 C) X-Ray D) Config Rule

**정답: A**.

---

**문제 3.** 모든 ERROR 로그를 실시간으로 Lambda에 전달:

A) Logs Insights B) Subscription Filter → Lambda C) S3 Export D) Firehose만

**정답: B**.

---

**문제 4.** ECS Fargate 컨테이너 메트릭 빠르게:

A) X-Ray B) Container Insights C) CW Agent 직접 D) Lambda Layer

**정답: B**.

---

**문제 5.** 외부에서 사이트 가용성 모니터링:

A) CW Logs B) Synthetics Canary C) RUM D) Inspector

**정답: B**.

---

## 📌 오늘의 요약

1. Metrics·Alarms·Logs·Insights가 CW 핵심.
2. EC2 메모리/디스크는 CW Agent 필요.
3. Alarm 액션은 SNS·ASG·EC2 Recovery.
4. Subscription Filter로 실시간 처리.
5. Container/Lambda Insights + Synthetics/RUM로 확장.
