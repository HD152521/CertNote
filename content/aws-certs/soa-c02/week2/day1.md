# Day 6 - CloudWatch Metrics의 내부 구조: Namespace, Dimension, Resolution

CloudWatch 콘솔을 열면 끝없이 펼쳐지는 그래프 더미에 압도된다. EC2 CPU, ELB Request Count, Lambda Duration, RDS Connections... 운영자는 이 더미 속에서 "지금 우리 서비스가 죽고 있는가"를 5초 안에 판단해야 한다. 그러려면 메트릭이 어떻게 저장되고 어떻게 인덱싱되는지를 알아야 한다.

오늘은 CloudWatch Metrics의 **데이터 모델, 시간 해상도, 보존 정책, 그리고 비용 구조**를 운영자 관점에서 깊이 본다.

## CloudWatch Metrics의 데이터 모델

한 메트릭 데이터 포인트는 다음 5개 차원으로 식별된다.

```
Metric = (Namespace, MetricName, Dimensions[], Timestamp, Value, Unit)
```

| 차원 | 예 | 의미 |
|------|-----|------|
| **Namespace** | `AWS/EC2`, `AWS/RDS`, `MyApp/Production` | 메트릭 컨테이너. AWS 서비스 또는 사용자 정의 |
| **MetricName** | `CPUUtilization`, `RequestCount` | 측정 대상 이름 |
| **Dimensions** | `InstanceId=i-abc`, `Env=Prod` | 메트릭을 식별하는 key=value (최대 30개) |
| **Timestamp** | 2025-05-26T14:30:00Z | 측정 시각 (ms 정밀도) |
| **Value + Unit** | 75.0 + Percent | 측정 값과 단위 |

**핵심 사실**: Namespace + MetricName + Dimensions의 모든 조합이 **유일한 메트릭**으로 취급된다. 즉 `CPUUtilization` 이름 하나로도 EC2가 100대면 100개의 별도 메트릭(`InstanceId` dimension이 다름)이 존재.

> 🔍 **더 깊이**: CloudWatch는 내부적으로 OpenTSDB 비슷한 time-series DB 위에 구축됐다고 알려져 있다. 메트릭은 (namespace, metric_name, dimension_set)의 해시로 인덱싱돼 빠른 조회가 가능. 단 dimension 조합이 폭증하면 같은 metric_name이 수십만 개의 서로 다른 메트릭을 만들어 비용과 조회 latency가 폭증. 이걸 **cardinality explosion**이라 한다.

> ⚠️ **함정**: "Dimension에 user_id를 넣어 사용자별 latency를 추적하자"는 흔한 안티패턴. 사용자가 100만 명이면 100만 개 메트릭이 생성돼 한 달 비용이 수천 달러 폭증. 사용자별 분석은 메트릭이 아니라 **로그(Logs Insights)** 또는 **OpenSearch**를 써야 한다.

## 시간 해상도(Resolution): 1초 vs 60초

CloudWatch 메트릭은 두 해상도 중 하나다.

| 해상도 | 의미 | 비용 | 사용 시점 |
|--------|------|------|-----------|
| **Standard (60초)** | 1분 단위 데이터 포인트 | 표준 비용 | 대부분 |
| **High-Resolution (1초)** | 1초 단위 데이터 포인트 | 표준 × 약 4배 | 빠른 자동 스케일링, 짧은 트래픽 스파이크 |

AWS 표준 메트릭은 보통 60초 해상도(EC2 detailed monitoring 켜야 1분, 아니면 5분). 사용자 메트릭은 `PutMetricData` 호출 시 `StorageResolution=1`로 1초 해상도 활성화.

> 📚 **사례**: 한 게임 회사가 매분 트래픽 스파이크가 30초만 유지되는 워크로드를 운영. 표준 60초 메트릭으로는 스파이크가 평균에 묻혀 ASG가 늦게 반응했다. 1초 해상도 메트릭 + Step Scaling으로 전환하니 스파이크 감지 시간이 60초 → 10초로 단축. 비용은 메트릭 1개당 월 $0.30 → $1.20이지만 인스턴스 부족으로 인한 5xx 손실이 훨씬 컸기에 ROI 명확.

> 🔍 **더 깊이**: High-Resolution 메트릭은 보존 기간 자체는 같지만(15개월), **시간이 지나면 자동으로 더 낮은 해상도로 집계**된다. 1초 해상도는 3시간만 유지, 그 후 60초 해상도로 집계, 다시 15일 후 5분, 63일 후 1시간 집계. 따라서 1년 전 1초 해상도 데이터는 조회 불가.

## 메트릭 보존 정책: 자동 다운샘플링

```
[해상도] →   1초    →    60초    →   5분    →   1시간
[보존]       3시간       15일        63일       15개월
```

운영자가 알아야 할 사실:
- **3시간 후 1초 데이터는 사라진다** (60초로 집계됨)
- **15일 후 1분 데이터는 사라진다** (5분으로 집계됨)
- **15개월이 지나면 데이터가 영구 삭제됨**

장기 보존이 필요하면 **CloudWatch Metrics → S3 Export** 또는 자체 데이터 파이프라인 구축.

> 💡 **관련 이론**: 시계열 DB의 표준 패턴인 **roll-up / down-sampling**의 구현. Prometheus, Graphite, InfluxDB 모두 같은 개념을 가진다. 데이터 양이 시간이 지날수록 자동 감소하는 이유는 "최근 데이터는 정밀히, 오래된 데이터는 거시적으로"라는 운영 패턴 반영. SLO 분석은 보통 30일 윈도우라 이 정책으로 충분.

## EC2 Detailed Monitoring vs Basic Monitoring

EC2는 기본 5분 간격의 **Basic Monitoring**을 무료 제공. **Detailed Monitoring**(분당 메트릭)은 인스턴스당 월 약 $2.10.

| 메트릭 | Basic (5분) | Detailed (1분) |
|--------|-------------|----------------|
| CPUUtilization | ✅ | ✅ (1분) |
| NetworkIn/Out | ✅ | ✅ (1분) |
| DiskRead/WriteOps | ✅ | ✅ (1분) |
| **MemoryUtilization** | ❌ | ❌ (CloudWatch Agent 필요) |
| **DiskUsage** | ❌ | ❌ (CloudWatch Agent 필요) |

> ⚠️ **함정**: 메모리/디스크 사용률은 EC2 detailed monitoring을 켜도 안 나온다. 이건 게스트 OS 안에서 측정해야 하므로 **CloudWatch Agent**가 필수. 시험에서 "EC2 메모리 사용률 알람"이 나오면 답은 거의 항상 CloudWatch Agent.

> 🔍 **더 깊이**: EC2는 하이퍼바이저 레벨에서 CPU·네트워크·디스크 I/O를 측정하므로 게스트 OS와 무관하게 수집 가능. 하지만 메모리는 OS 안의 페이지 테이블·캐시 통계가 필요해 하이퍼바이저에서 못 본다. 같은 이유로 디스크 "사용량"(파일시스템 레벨)도 못 본다. EBS의 read/write IOPS(블록 디바이스 레벨)는 보임.

## 사용자 정의 메트릭: PutMetricData

애플리케이션이 직접 메트릭을 발행하려면 `PutMetricData` API. 운영자가 자주 만나는 패턴:

```bash
# CLI로 메트릭 발행
aws cloudwatch put-metric-data \
  --namespace "MyApp/Production" \
  --metric-name "OrderProcessingLatency" \
  --value 234 \
  --unit Milliseconds \
  --dimensions "Service=Checkout,Env=Prod" \
  --storage-resolution 60
```

비용:
- **PutMetricData API 호출**: 1,000건당 $0.01
- **메트릭 저장**: 메트릭당 월 $0.30 (첫 10,000개), 그 위로 단가 감소
- **API GetMetricData**: 1,000개 metric-second당 $0.01

> 📚 **사례**: 한 회사가 모든 HTTP 요청마다 `PutMetricData`를 호출해 응답 시간을 기록했다. 한 달 후 청구서를 보니 CloudWatch Metrics API 비용만 $8,000. **해결: Embedded Metric Format(EMF)으로 로그에 메트릭 임베드 → CloudWatch가 자동 추출**. 비용이 95% 감소. 자세한 패턴은 Week 2 Day 4에서.

> 🔍 **더 깊이**: `PutMetricData`는 호출당 최대 1,000개 데이터 포인트 + 1MB 페이로드. 운영자가 직접 메트릭을 발행하려면 반드시 batch로 묶어 호출 횟수 최소화. API 호출 비용이 메트릭 저장 비용보다 훨씬 큼.

## Statistic vs ExtendedStatistic

같은 메트릭에서 여러 통계를 추출 가능.

| 통계 | 의미 | 운영자 사용 |
|------|------|-------------|
| **Sum** | 합계 | 총 요청 수, 총 에러 수 |
| **Average** | 평균 | CPU·메모리 평균 (오해 소지 있음) |
| **Minimum/Maximum** | 최소/최대 | 극단값 알람 |
| **SampleCount** | 데이터 포인트 수 | 데이터 누락 감지 |
| **p50, p90, p95, p99** | 백분위수 | latency 분포 (Extended Statistic) |

> ⚠️ **함정**: "Lambda 평균 응답시간이 200ms이니 안정적"이라는 판단은 위험. 1%의 요청이 5초 걸리면 p99는 5000ms. 사용자 1%가 매우 나쁜 경험을 한다. **운영자는 p95, p99를 봐야 한다**. 시험에서 "사용자 경험의 long tail 모니터링" 시나리오는 거의 항상 백분위수 통계.

> 💡 **관련 이론**: long tail은 "Power Law"분포의 결과. Vilfredo Pareto가 19세기에 발견한 80/20 법칙이 latency 분포에도 적용된다. Gil Tene의 "How NOT to Measure Latency" 강연(2015)은 운영자 필독.

## Math Expression: 메트릭 조합

여러 메트릭을 한 그래프나 알람에서 조합 가능. CloudWatch의 **Math Expression**.

```
m1 = ALBRequestCount (Sum, 1분)
m2 = ALBTargetResponseTime (Average, 1분)
e1 = m1 * m2   # 총 응답 시간
e2 = (m1 / 60)  # 초당 요청 수 (RPS)
```

자주 쓰이는 패턴:
- **에러율 = 5xxCount / RequestCount × 100**
- **RPS = RequestCount / 60**
- **여러 인스턴스 평균 = AVG(METRICS())**
- **Anomaly Detection band = ANOMALY_DETECTION_BAND(m1, 2)**

> 🔍 **더 깊이**: Math Expression은 알람의 한 입력으로도 쓰인다. "5xx 에러율이 5%를 넘을 때만 알람" 같은 룰은 단일 메트릭으론 표현 못 함(분자/분모가 다른 메트릭). Math Expression으로 비율 계산 후 그 결과에 임계값 설정.

## Anomaly Detection: 머신러닝 기반 베이스라인

고정 임계값(예: CPU > 80%) 알람은 트래픽 패턴이 시간대마다 다른 워크로드에선 false positive가 많다. **Anomaly Detection**은 메트릭의 일별·요일별 패턴을 학습해 동적 베이스라인 생성.

```
[Anomaly Detection Band]
  ─── 학습된 평균 ───
  ╌╌╌ 표준편차 ±2 ╌╌╌
  
  (메트릭이 band 밖으로 나가면 알람)
```

CloudWatch는 최근 2주의 데이터를 학습해 14일 단위 회귀 모델을 만든다. 모델 학습에 5분-15분 소요, 매시간 재학습. 운영자는 표준편차 배수(보통 2)만 지정.

> 💡 **관련 이론**: 이는 STL(Seasonal-Trend decomposition using LOESS) 또는 ARIMA 모델의 클라우드 구현. Facebook Prophet, Twitter AnomalyDetection 같은 OSS와 같은 계열. Cleveland et al.(1990, Journal of Official Statistics)에서 STL 발표. 사람 손으로 임계값 조정하는 부담을 ML이 대체.

> 📚 **사례**: 한 e-commerce 회사가 매일 점심·저녁에 트래픽 피크가 오는 워크로드를 운영. 고정 임계값으로 알람 만들면 매일 false positive 수십 건. Anomaly Detection 도입 후 평소 패턴은 알람 없고, 예상치 못한 트래픽 급변(블랙프라이데이, 장애 등)만 정확히 탐지. 운영자 야간 호출이 80% 감소.

## 정리하며

CloudWatch Metrics의 핵심: **시계열 데이터의 cardinality 폭증을 피하면서 의미 있는 차원으로 측정, 백분위수와 Math Expression으로 의사결정 가능한 신호 만들기**. 메모리·디스크 사용률은 CloudWatch Agent 필요. 사용자 메트릭은 PutMetricData보단 EMF로 비용 절감.

내일은 메트릭과 짝을 이루는 **CloudWatch Logs**. 로그 그룹·스트림·보존 정책·Subscription Filter를 깊이 본다.

---

## 📝 연습 문제

**문제 1.** EC2 메모리 사용률 알람을 만들려고 한다. 어떻게 수집하는가?

A) EC2 Detailed Monitoring 활성화
B) CloudWatch Agent를 EC2에 설치하고 mem_used_percent를 push
C) Lambda로 SSH 접속해서 메모리 측정
D) CloudWatch가 자동으로 수집

**정답: B**
해설: EC2 표준 메트릭은 하이퍼바이저 레벨이라 메모리·디스크 사용률을 못 본다. CloudWatch Agent가 게스트 OS 안에서 측정해 CloudWatch로 push해야 한다.

---

**문제 2.** 빠른 트래픽 스파이크 감지를 위해 ASG를 1분이 아닌 10초 단위로 반응하게 하려고 한다. 어떤 옵션이 필요한가?

A) ASG의 cooldown을 10초로 설정
B) High-Resolution metric(1초) + Step Scaling
C) Detailed Monitoring 활성화
D) CloudWatch Logs Subscription

**정답: B**
해설: High-Resolution 메트릭(1초)을 PutMetricData로 발행하면 알람도 10초 단위 평가 가능. Detailed Monitoring은 1분 해상도까지만.

---

**문제 3.** Lambda 함수의 평균 응답시간이 200ms인데 일부 사용자가 매우 느린 경험을 한다고 보고했다. 운영자가 봐야 할 메트릭은?

A) Average Duration
B) Sum Duration
C) p95, p99 Duration
D) SampleCount

**정답: C**
해설: 평균은 long tail을 숨긴다. p95/p99 백분위수로 상위 5%/1%의 latency를 확인해야 일부 사용자의 느린 경험을 측정.

---

**문제 4.** 운영자가 ALB의 5xx 에러율(에러 수 / 총 요청 수)을 모니터링하려고 한다. 어떻게 만드는가?

A) 5xx Count 메트릭에 임계값
B) 두 메트릭을 Math Expression으로 비율 계산 후 알람
C) CloudWatch Logs Insights 쿼리
D) Custom metric으로 비율을 직접 발행

**정답: B**
해설: Math Expression `(5xxCount / RequestCount) * 100`으로 비율 계산. 그 결과 메트릭에 알람 설정. 분자/분모가 다른 메트릭일 때 표준 패턴.

---

**문제 5.** 운영자가 모든 HTTP 요청마다 `PutMetricData`를 호출하니 API 비용이 폭증했다. 가장 효율적인 대안은?

A) API 호출을 batch로 묶음
B) Embedded Metric Format(EMF)으로 로그에 메트릭 임베드, CloudWatch가 자동 추출
C) 메트릭 발행 빈도 감소
D) 메트릭을 S3에 저장

**정답: B**
해설: EMF는 로그 메시지 안에 JSON으로 메트릭을 임베드하면 CloudWatch가 자동으로 메트릭으로 추출. API 호출 비용 zero. Lambda·ECS에서 표준 패턴.

---

**문제 6.** CloudWatch 메트릭의 1초 해상도 데이터는 몇 시간 후 60초 해상도로 집계되는가?

A) 1시간
B) 3시간
C) 15일
D) 63일

**정답: B**
해설: 1초 → 3시간 후 60초로 집계, 15일 후 5분, 63일 후 1시간, 15개월 후 삭제.

---

**문제 7.** 매일 점심·저녁 트래픽 피크가 있는 워크로드에서 false positive 없는 알람을 만들려면?

A) 고정 임계값을 평균보다 높게
B) Anomaly Detection 기반 알람
C) Composite Alarm
D) Math Expression

**정답: B**
해설: Anomaly Detection은 시간대·요일별 패턴을 ML로 학습해 동적 베이스라인 생성. 평소 패턴 내 변동은 알람 안 울리고 진짜 이상만 탐지.
