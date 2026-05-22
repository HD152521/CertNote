# Day 1 - CloudWatch Metrics 기초 (Namespace, Dimension, 표준/사용자 지정)

📅 날짜: Week 2 (Day 1)
🎯 주제: CloudWatch Metrics의 데이터 모델과 수집 메커니즘
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch Metrics의 Namespace, Dimension, Resolution 개념을 이해한다
- 표준 메트릭 vs 사용자 지정 메트릭의 차이를 안다
- 메트릭의 수명, 통계 집계 방식, PutMetricData API 사용법을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Time-series data**: 시간을 인덱스로 갖는 데이터. (timestamp, value) 쌍의 연속
- **Tag / Label / Dimension**: 시계열에 붙는 메타데이터. 카디널리티(고유 조합 수)가 비용·성능 좌우
- **Pull vs Push 모니터링**: Prometheus(Pull) vs CloudWatch(Push). CW는 클라이언트가 데이터 전송
- **Aggregation**: 다수의 raw 데이터 포인트를 통계(Sum, Avg, Max 등)로 압축
- **Cardinality Explosion**: 고유 차원 조합이 폭발해 비용 폭증. 사용자 ID를 Dimension에 넣지 말 것

---

## 📖 이론 내용

### 1. CloudWatch Metrics 데이터 모델

#### 핵심 4요소
- **Namespace**: 메트릭의 컨테이너 (예: `AWS/EC2`, `AWS/RDS`, `MyApp/Web`)
- **Metric Name**: 지표 이름 (예: `CPUUtilization`, `OrderCount`)
- **Dimension**: 메트릭을 슬라이스하는 키-값 쌍 (예: `InstanceId=i-abc123`, `Environment=prod`)
- **Timestamp + Value**: 실제 데이터 포인트

```
AWS/EC2 / CPUUtilization / {InstanceId=i-abc} / 2026-05-22T10:00:00Z / 75.3
└── Namespace ┘ └── Name ┘ └── Dimension ┘   └── Timestamp ┘     └ Value
```

#### Dimension 주의사항 (⭐ 비용 함정)
- 한 메트릭은 최대 **30개 Dimension** 가능
- 각 Dimension 조합이 **별개 메트릭**으로 청구됨
- `InstanceId=i-abc`와 `InstanceId=i-xyz`는 다른 메트릭
- **사용자 ID, Request ID 같은 고카디널리티 값을 Dimension에 넣으면 비용 폭발**

### 2. 표준(Standard) vs 사용자 지정(Custom) 메트릭

| 구분 | 표준 메트릭 | 사용자 지정 메트릭 |
|------|-------------|-------------------|
| **출처** | AWS 서비스가 자동 발행 | 고객이 PutMetricData로 푸시 |
| **예시** | EC2 CPUUtilization, S3 BucketSize | OrderCount, QueueDepth |
| **비용** | 대부분 무료 (일부 상세 모니터링 유료) | 메트릭당 월 $0.30 |
| **Resolution** | 1분 또는 5분 | 1분(Standard) 또는 1초(High Resolution) |
| **저장 기간** | 15개월 | 15개월 |

#### EC2 모니터링 모드
- **Basic Monitoring (기본)**: 5분 간격, 무료
- **Detailed Monitoring**: 1분 간격, 인스턴스당 $2.10/월
- **EC2가 자동 제공하지 않는 메트릭**: 메모리, 디스크 사용량 → **CloudWatch Agent 설치 필수**

### 3. Resolution (해상도)

#### Standard Resolution (1분)
- 기본값. 데이터 포인트 간격 60초
- 알람 평가 주기와 자연스럽게 맞음

#### High Resolution (1초)
- 사용자 지정 메트릭만 가능
- **PutMetricData**에 `StorageResolution: 1` 지정
- 비용 ↑, 5초 알람 가능 (HR 알람은 분당 $0.30)
- 사용 사례: 게임 서버, 트레이딩, 실시간 모니터링

### 4. 메트릭 저장 기간 (자동 집계)

CloudWatch는 데이터 보존 기간에 따라 자동으로 집계 해상도를 낮춥니다:

| 데이터 나이 | 보존 해상도 |
|-------------|-------------|
| 0 ~ 3시간 (High Resolution만) | 1초 |
| 0 ~ 15일 | 1분 |
| 0 ~ 63일 | 5분 |
| 0 ~ 455일 (15개월) | 1시간 |
| 455일 이후 | **삭제** |

> ⚠️ 시험 함정: "1분 해상도로 1년 전 데이터 조회"는 불가. 15일 후엔 5분, 63일 후엔 1시간 해상도만 조회 가능.

### 5. 통계(Statistic) 옵션

PutMetricData는 raw 값을 푸시하지만, GetMetricData/GetMetricStatistics는 통계로 조회:

| 통계 | 의미 |
|------|------|
| **SampleCount** | 데이터 포인트 개수 |
| **Sum** | 합계 |
| **Average** | 평균 |
| **Minimum / Maximum** | 최소/최대 |
| **p50, p90, p95, p99** | 백분위수 (Percentile) |
| **IQM** | Interquartile Mean (25~75% 사이 평균) |
| **TM, TC, TS, TT** | Trimmed Mean/Count/Sum/Total |

#### Percentile 활용 (⭐ 운영자 필수)
- **Average만 보면 함정**: 평균 200ms지만 p99는 5000ms일 수 있음
- 운영 SLO는 보통 p95 또는 p99 기준
- 알람도 percentile 기반으로: "p99 응답 시간 > 1초"

### 6. 사용자 지정 메트릭 푸시

#### 방법 1: AWS CLI
```bash
aws cloudwatch put-metric-data \
  --namespace "MyApp/Web" \
  --metric-name "OrderCount" \
  --value 1 \
  --unit Count \
  --dimensions Environment=prod,Service=checkout
```

#### 방법 2: 단일 호출에 여러 데이터
```bash
aws cloudwatch put-metric-data \
  --namespace "MyApp/Web" \
  --metric-data file://metrics.json
```

```json
[
  {
    "MetricName": "ResponseTime",
    "Timestamp": "2026-05-22T10:00:00Z",
    "Value": 234.5,
    "Unit": "Milliseconds",
    "StorageResolution": 1,
    "Dimensions": [
      { "Name": "Service", "Value": "checkout" },
      { "Name": "Region", "Value": "ap-northeast-2" }
    ]
  }
]
```

#### 방법 3: Embedded Metric Format (EMF)
Lambda에서 stdout에 특정 JSON 형식으로 로그 출력 → 자동 메트릭 추출 (Week 2 Day 4에서 자세히)

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Metric Math** | 여러 메트릭을 수식으로 결합 (예: `m1/m2*100`) | 알람·대시보드에 활용 |
| **Search Expression** | 와일드카드로 메트릭 검색 (예: `SEARCH(' {AWS/EC2,InstanceId} MetricName="CPUUtilization" ')`) | 동적 대시보드 |
| **Anomaly Detection** | ML로 정상 범위 학습, 이탈 감지 | 임계값 수동 설정 불필요 |
| **Cross-Account Metrics** | 다른 계정 메트릭 조회 | 멀티 계정 대시보드 |
| **Streams** | 메트릭을 Firehose로 실시간 외부 전송 | 데이터레이크 통합 |

> ⚠️ **함정 1**: EC2 메모리·디스크 메트릭은 표준 제공 X. CloudWatch Agent 필요.
>
> ⚠️ **함정 2**: 15개월 후 메트릭은 삭제됨 — 장기 보관은 S3로 export 필요.
>
> 💡 **암기 팁**: "Namespace는 폴더, Metric은 파일, Dimension은 태그". 메트릭 검색 멘탈 모델.

### 관련 서비스 Cross-Reference

- **Metrics → Week 2 Day 4** (Metric Filter로 로그에서 메트릭 추출)
- **Metrics → Week 3 Day 1** (Alarms - 메트릭 기반 경보)
- **Metrics → Week 3 Day 3** (CloudWatch Agent로 메모리/디스크 수집)
- **Metrics → Week 11** (Compute Optimizer가 CloudWatch 메트릭 사용)

---

## 🏗️ 아키텍처 다이어그램

```
CloudWatch Metrics 데이터 흐름
==========================================================

  [EC2/RDS/Lambda/...]       [내 앱]
       │ 자동 발행            │ PutMetricData
       │ (Standard)          │ (Custom)
       ▼                     ▼
  ┌─────────────────────────────────────┐
  │     CloudWatch Metrics 저장소        │
  │  Namespace / Metric / Dimensions     │
  └────┬────────────┬─────────────┬─────┘
       ▼            ▼             ▼
  [Alarms]    [Dashboards]   [Metric Math]
       │
       ▼
  [SNS/Lambda/SSM Automation]
       │
       ▼
  [자동 복구·알림]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **EC2 메모리·디스크 메트릭은 자동 X** — CloudWatch Agent 필요
2. ⭐ **Detailed Monitoring = 1분 간격** (Basic은 5분). 인스턴스당 $2.10/월
3. ⭐ **Custom Metric은 메트릭당 $0.30/월** — Dimension 카디널리티 폭발 주의
4. ⭐ **High Resolution은 1초까지** — `StorageResolution: 1` 옵션 필요
5. ⭐ **메트릭 보존 15개월** — 그 이후 삭제. 장기 보관은 S3 export

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. EC2 표준 메트릭 조회 (지난 1시간 CPU)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average Maximum

# 2. 사용자 지정 메트릭 푸시 (1분 해상도)
aws cloudwatch put-metric-data \
  --namespace "MyApp/Orders" \
  --metric-name "OrderCount" \
  --value 42 \
  --unit Count \
  --dimensions Environment=prod,Region=ap-northeast-2

# 3. High Resolution (1초) 메트릭
aws cloudwatch put-metric-data \
  --namespace "MyApp/Trading" \
  --metric-name "OrderLatency" \
  --value 12.5 \
  --unit Milliseconds \
  --storage-resolution 1

# 4. Detailed Monitoring 활성화
aws ec2 monitor-instances --instance-ids i-0123456789abcdef0

# 5. Metric Math로 에러율 계산 후 알람
aws cloudwatch put-metric-alarm \
  --alarm-name "HighErrorRate" \
  --metrics '[
    {
      "Id": "errors",
      "MetricStat": {
        "Metric": {
          "Namespace": "AWS/ApplicationELB",
          "MetricName": "HTTPCode_Target_5XX_Count"
        },
        "Period": 300,
        "Stat": "Sum"
      }
    },
    {
      "Id": "requests",
      "MetricStat": {
        "Metric": {
          "Namespace": "AWS/ApplicationELB",
          "MetricName": "RequestCount"
        },
        "Period": 300,
        "Stat": "Sum"
      }
    },
    {
      "Id": "errorRate",
      "Expression": "errors/requests*100",
      "Label": "Error Rate (%)",
      "ReturnData": true
    }
  ]' \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

---

## 📝 연습 문제

**문제 1.** 한 회사가 EC2 인스턴스의 메모리 사용률을 모니터링하고 싶다. 기본적으로 CloudWatch가 메모리 메트릭을 제공하나?

A) 예, 자동 제공
B) 아니오, CloudWatch Agent 설치 필요
C) Detailed Monitoring 켜면 됨
D) IMDS에서 직접 조회

**정답: B**
해설: EC2 표준 메트릭은 CPU, 네트워크, 디스크 I/O까지만. 메모리·디스크 사용률(여유 공간 등)은 게스트 OS 내부 정보라 CloudWatch Agent를 설치해야 함.

---

**문제 2.** 한 개발자가 사용자별 요청 수를 Custom Metric으로 추적하려고 `UserId`를 Dimension에 넣었다. 1만 명 사용자 기준 발생할 문제는?

A) 정상 동작
B) 메트릭 조회 속도가 느려짐
C) 카디널리티 폭발 — 메트릭이 1만 개 생성되어 월 $3,000 이상 비용 발생
D) Dimension 한도 초과

**정답: C**
해설: Custom Metric은 메트릭당 월 $0.30. UserId처럼 고유 값은 Dimension에 넣지 말고 로그로 남긴 뒤 Logs Insights로 분석하는 게 정석.

---

**문제 3.** "최근 1년치 EC2 CPU 데이터를 1분 해상도로 보고 싶다"는 요구. 가능한가?

A) 가능, CloudWatch는 1분 해상도를 영구 보존
B) 불가능. 1분 해상도는 15일까지만, 그 이후엔 자동 집계됨
C) Detailed Monitoring 켜면 가능
D) S3에 자동 보관

**정답: B**
해설: CloudWatch 자동 집계: 1분(15일) → 5분(63일) → 1시간(15개월) → 삭제. 장기 1분 데이터가 필요하면 별도 S3 export 또는 메트릭 스트림 사용.

---

**문제 4.** Custom Metric의 평균 응답시간은 200ms인데 사용자들이 느리다고 불평한다. 운영자가 봐야 할 통계는?

A) Average만 더 자주 본다
B) p95, p99 percentile 확인 — 일부 사용자는 5초 이상 걸릴 수 있음
C) Sum 사용
D) SampleCount만

**정답: B**
해설: 평균은 outlier를 가린다. p95/p99로 "최악 5% 사용자가 얼마나 느린지" 확인. SLO는 보통 percentile 기반.

---

**문제 5.** High Resolution 메트릭의 특징이 아닌 것은?

A) 1초 해상도 가능
B) 5초 알람 가능
C) 표준 메트릭에서도 사용 가능
D) PutMetricData에 `StorageResolution: 1` 필요

**정답: C**
해설: High Resolution은 **사용자 지정 메트릭만** 가능. AWS 표준 메트릭은 1분 또는 5분.

---

## 📌 오늘의 요약

1. CloudWatch Metrics 모델: Namespace + MetricName + Dimensions + Timestamp + Value
2. EC2 표준 메트릭은 CPU/네트워크만 — 메모리·디스크는 CloudWatch Agent 필요
3. Detailed Monitoring(1분)은 인스턴스당 $2.10/월 — Basic은 5분 무료
4. Custom Metric은 월 $0.30/메트릭. UserId 등 고카디널리티 Dimension 금지
5. 메트릭은 15개월까지 자동 집계 보존 → 장기 보관은 S3 export
