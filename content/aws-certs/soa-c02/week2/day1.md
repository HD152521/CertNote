# Day 1 - CloudWatch Metrics의 내부 구조: Namespace, Dimension, Resolution, Cardinality

CloudWatch 콘솔을 열면 끝없이 펼쳐지는 그래프 더미에 압도된다. EC2 CPU, ELB Request Count, Lambda Duration, RDS Connections, ECS CPU Reservation… 운영자는 이 더미 속에서 "지금 우리 서비스가 죽고 있는가"를 5초 안에 판단해야 한다. 그러려면 메트릭이 어떻게 저장되고 어떻게 인덱싱되며 어떻게 비용이 청구되는지를 알아야 한다. 콘솔 UI만 외우면 5분쯤 지나 다시 그래프를 못 찾고, 청구서를 받아 들고서야 cardinality 폭증을 만난다.

오늘은 CloudWatch Metrics의 **데이터 모델, 시간 해상도, 보존 정책, cardinality 함정, 그리고 비용 구조**를 운영자 관점에서 깊이 본다. 시험에서는 "이 시나리오에서 detailed monitoring을 켤까 1초 해상도까지 갈까", "사용자별 latency를 dimension으로 추적할까" 같은 의사결정 시나리오로 자주 등장한다.

## CloudWatch Metrics의 데이터 모델

한 메트릭 데이터 포인트는 다음 6개 요소의 튜플로 식별된다.

```
DataPoint = (Namespace, MetricName, Dimensions[], Timestamp, Value, Unit)
```

| 요소 | 예 | 의미 |
|------|-----|------|
| **Namespace** | `AWS/EC2`, `AWS/RDS`, `MyApp/Production` | 메트릭 컨테이너. AWS 서비스 또는 사용자 정의(`/` 포함 가능) |
| **MetricName** | `CPUUtilization`, `RequestCount` | 측정 대상 이름 |
| **Dimensions** | `InstanceId=i-abc`, `Env=Prod` | 메트릭을 식별하는 key=value 쌍 (한 메트릭당 최대 30개) |
| **Timestamp** | 2025-05-26T14:30:00Z | 측정 시각 (밀리초 정밀도) |
| **Value** | 75.0 | 단일 값 또는 통계 셋(`{Sum, Min, Max, SampleCount}`) |
| **Unit** | `Percent`, `Milliseconds`, `Bytes` | 단위. CloudWatch가 단위 변환 일부 지원 |

**핵심 사실**: `(Namespace, MetricName, Dimensions의 정확한 집합)`이 **유일한 메트릭**으로 취급된다. 즉 `CPUUtilization`이라는 이름 하나로도 EC2가 100대면 100개의 별도 메트릭(`InstanceId` dimension 값이 다름)이 존재한다. 100대 인스턴스 평균을 보려면 Math Expression의 `AVG(METRICS())`나 콘솔의 "Add math" 기능으로 따로 집계해야 한다.

> 🔍 **더 깊이**: CloudWatch는 내부적으로 OpenTSDB·Druid 비슷한 time-series DB 위에 구축돼 있다고 알려져 있다. 메트릭은 `(namespace, metric_name, dimension_set의 정규화된 해시)`로 인덱싱돼 빠른 조회가 가능. 단 dimension 조합이 폭증하면 같은 metric_name이 수십만 개의 서로 다른 메트릭을 만들어 비용과 조회 latency가 폭증. 이걸 **cardinality explosion**이라고 부르며, Prometheus·InfluxDB·Datadog 모두 같은 함정이 있다. CloudWatch는 메트릭당 월 \$0.30(첫 10,000개)이라 dimension 1개 잘못 추가하면 청구서가 즉시 4자리수 증가한다.

> ⚠️ **함정**: "Dimension에 `user_id`를 넣어 사용자별 latency를 추적하자"는 흔한 안티패턴. 사용자가 100만 명이면 100만 개 메트릭이 생성돼 한 달 비용이 \$30만(!). 사용자별 분석은 메트릭이 아니라 **로그(Logs Insights)** 또는 **OpenSearch**, 혹은 **EMF의 메타데이터 필드**(메트릭 dimension이 아닌 일반 로그 필드)에 넣어야 한다. 시험에서 "사용자별 / 요청별 분석" 키워드가 보이면 Custom Metric dimension은 거의 오답이다.

## 시간 해상도(Resolution): Standard vs High-Resolution

CloudWatch 메트릭은 두 해상도 중 하나로 저장된다.

| 해상도 | 데이터 포인트 간격 | 알람 평가 최소 주기 | 비용 | 사용 시점 |
|--------|-------------------|--------------------|------|-----------|
| **Standard (60초)** | 1분 | 10초 단위 평가 가능하지만 데이터는 1분 단위 | 표준 | 대부분의 워크로드 |
| **High-Resolution (1초)** | 1초 | 10초 또는 30초 알람 가능 | 표준 + 알람 1.5배 ($0.30/메트릭은 동일) | 빠른 자동 스케일링, 30초~1분 스파이크 |

AWS 표준 메트릭은 기본 60초 해상도(EC2는 detailed monitoring을 켜야 1분, 아니면 5분). 사용자 메트릭은 `PutMetricData` 호출 시 `StorageResolution=1`로 1초 해상도 활성화.

```bash
# 1초 해상도 메트릭 발행 — StorageResolution=1
aws cloudwatch put-metric-data \
  --namespace "MyApp/Realtime" \
  --metric-data \
    "MetricName=ActiveSessions,Value=4823,Unit=Count,StorageResolution=1"
```

> 📚 **사례**: 한 게임 회사가 매분 트래픽 스파이크가 30초만 유지되는 워크로드를 운영. 표준 60초 메트릭에서는 30초 스파이크가 1분 평균에 묻혀 ASG가 늦게 반응했다(스파이크 절반이 끝난 시점에야 임계값 초과 신호가 뜸). 1초 해상도 메트릭 + Step Scaling으로 전환하니 스파이크 감지 시간이 60초 → 10초로 단축. 비용은 메트릭 1개당 월 \$0.30이지만(고해상도라고 메트릭 단가가 더 비싸진 않음, 다만 알람 비용은 1.5배) 인스턴스 부족으로 인한 5xx 손실이 훨씬 컸기에 ROI는 즉시 정당화.

> 🔍 **더 깊이**: High-Resolution 메트릭은 보존 기간 자체는 같지만(15개월), **시간이 지나면 자동으로 더 낮은 해상도로 집계(roll-up)**된다. 1초 해상도는 3시간만 유지되고 그 후 60초 해상도로 집계, 다시 15일 후 5분, 63일 후 1시간 집계로 단계적으로 축소. 따라서 1년 전 1초 해상도 데이터는 조회 불가. 장기 보존이 필요하면 GetMetricData로 export하거나 CloudWatch Metric Stream으로 Kinesis Firehose → S3로 흘려야 한다.

## 메트릭 보존 정책: 자동 다운샘플링의 4단 계단

```
[해상도]      1초    →    60초    →    5분    →   1시간   →  (삭제)
[보존]      3시간       15일         63일        15개월
            ───────────────────────────────────────────►  
```

운영자가 반드시 외워야 할 사실:

- **3시간 후 1초 데이터는 사라진다** (60초로 집계됨)
- **15일 후 1분 데이터는 사라진다** (5분으로 집계됨)
- **63일 후 5분 데이터는 사라진다** (1시간으로 집계됨)
- **15개월(455일)이 지나면 데이터가 영구 삭제됨**

장기 보존이 필요하면 **CloudWatch Metric Stream → Kinesis Firehose → S3**(2021 GA), 또는 GetMetricData API로 주기적 export. SLO·SLI 리포트를 분기·연 단위로 작성한다면 S3에 묻어둬야 한다.

> 💡 **관련 이론**: 시계열 DB의 표준 패턴인 **roll-up / down-sampling**의 구현. Prometheus의 `recording rules` + remote write to Thanos, Graphite의 storage-aggregation, InfluxDB의 continuous query, RRDtool의 RRA(Round Robin Archive) 모두 같은 개념. 데이터 양이 시간이 지날수록 자동 감소하는 이유는 "최근 데이터는 정밀히, 오래된 데이터는 거시적으로"라는 운영 사실 반영. SLO 분석 표준 윈도우가 28~30일이라 이 정책 자체로 충분한 경우가 많다.

## EC2 Detailed Monitoring vs Basic Monitoring

EC2는 기본 5분 간격의 **Basic Monitoring**을 무료 제공. **Detailed Monitoring**(분당 메트릭)은 인스턴스당 월 약 \$2.10(메트릭 7개 × \$0.30).

| 메트릭 | Basic (5분) | Detailed (1분) | CloudWatch Agent (게스트 OS) |
|--------|-------------|----------------|------------------------------|
| CPUUtilization | ✅ | ✅ | (중복) |
| NetworkIn/Out, NetworkPacketsIn/Out | ✅ | ✅ | - |
| DiskReadOps/WriteOps, DiskReadBytes/WriteBytes | ✅ | ✅ | - |
| EBSReadOps/WriteOps (Nitro) | ✅ | ✅ | - |
| StatusCheckFailed, StatusCheckFailed_System/Instance | ✅ | ✅ | - |
| **MemoryUtilization (mem_used_percent)** | ❌ | ❌ | ✅ |
| **DiskSpaceUtilization (disk_used_percent)** | ❌ | ❌ | ✅ |
| **SwapUtilization** | ❌ | ❌ | ✅ |
| **TCPv4 EstablishedConn, NetStat** | ❌ | ❌ | ✅ |

> ⚠️ **함정**: 메모리·디스크 사용률은 EC2 detailed monitoring을 켜도 안 나온다. 이건 게스트 OS 안에서 측정해야 하므로 **CloudWatch Agent**가 필수. 시험에서 "EC2 메모리 사용률 알람" 또는 "디스크가 가득 차기 전에 알람" 시나리오가 나오면 답은 거의 항상 CloudWatch Agent. 또 자주 나오는 함정: "Auto Scaling이 메모리 기반으로 스케일 아웃 못 한다" → Agent로 발행한 custom metric에 ASG의 target tracking을 걸어야 한다.

> 🔍 **더 깊이**: EC2는 하이퍼바이저(현재는 Nitro System) 레벨에서 CPU·네트워크·디스크 I/O를 측정한다. 그래서 게스트 OS와 무관하게 수집 가능하고 게스트가 hang 돼도 보인다. 하지만 메모리는 OS 안의 페이지 테이블·캐시 통계가 필요해 하이퍼바이저에서 못 본다. 같은 이유로 디스크 "사용량"(파일시스템 레벨, df -h)도 못 본다 — EBS의 read/write IOPS(블록 디바이스 레벨)는 보임. 이 trade-off는 IaaS의 본질적 한계이며, ECS Fargate·Lambda 같은 서비스에선 AWS가 게스트 OS까지 운영하니 메모리도 표준 메트릭에 포함된다.

### CloudWatch Agent 핵심 설치 명령

```bash
# SSM으로 Agent 설치 (운영자 표준)
aws ssm send-command \
  --document-name "AWS-ConfigureAWSPackage" \
  --parameters action=Install,name=AmazonCloudWatchAgent \
  --targets "Key=tag:Env,Values=Prod"

# Parameter Store에 Agent 설정 저장 후 가져오기
aws ssm put-parameter \
  --name "/cloudwatch-agent/prod/config" \
  --value file://amazon-cloudwatch-agent.json \
  --type String

# Agent 시작
aws ssm send-command \
  --document-name "AmazonCloudWatch-ManageAgent" \
  --parameters action=configure,mode=ec2,\
optionalConfigurationSource=ssm,\
optionalConfigurationLocation=/cloudwatch-agent/prod/config,\
optionalRestart=yes \
  --targets "Key=tag:Env,Values=Prod"
```

이 패턴이 시험에 자주 나오는 "수백 대 EC2에 메모리 메트릭을 일괄 배포" 시나리오의 답이다. SSM Run Command + Parameter Store 조합.

## 사용자 정의 메트릭: PutMetricData의 비용 함정

애플리케이션이 직접 메트릭을 발행하려면 `PutMetricData` API. 운영자가 자주 만나는 패턴:

```bash
# CLI로 메트릭 발행 — 단일 데이터 포인트
aws cloudwatch put-metric-data \
  --namespace "MyApp/Production" \
  --metric-name "OrderProcessingLatency" \
  --value 234 \
  --unit Milliseconds \
  --dimensions "Service=Checkout,Env=Prod" \
  --storage-resolution 60

# 통계 집계 형태(StatisticValues)로 발행 — API 호출 비용 절감
aws cloudwatch put-metric-data \
  --namespace "MyApp/Production" \
  --metric-name "OrderProcessingLatency" \
  --statistic-values \
    "Sum=12450,Minimum=120,Maximum=890,SampleCount=53" \
  --unit Milliseconds \
  --dimensions "Service=Checkout,Env=Prod"
```

비용 구조:

- **PutMetricData API 호출**: 1,000건당 \$0.01 (호출당 \$0.00001)
- **메트릭 저장**: 메트릭당 월 \$0.30 (첫 10,000개), 그 이상은 단가 감소
- **GetMetricData**: 1,000개 metric-second당 \$0.01

> 📚 **사례**: 한 회사가 모든 HTTP 요청마다 `PutMetricData`를 호출해 응답 시간을 기록했다(메트릭 3개 × 호출 평균 100M/일). 한 달 후 청구서를 보니 CloudWatch Metrics API 비용만 \$8,000. **해결: Embedded Metric Format(EMF)으로 로그에 메트릭 임베드 → CloudWatch가 자동 추출**(EMF는 API 호출 0). 비용이 95% 감소. EMF의 깊이는 Week 2 Day 4에서.

> 🔍 **더 깊이**: `PutMetricData`는 호출당 최대 1,000개 데이터 포인트 + 1MB 페이로드. 운영자가 직접 메트릭을 발행할 때는 반드시 batch로 묶어 호출 횟수를 최소화. API 호출 비용이 메트릭 저장 비용보다 훨씬 큰 경우가 흔하다. 또 `StatisticValues`로 분당 집계 결과만 발행하면(개별 데이터 포인트 N개 대신 `Sum/Min/Max/SampleCount` 1셋) 호출 수가 60분의 1로 줄어든다. 단 백분위수는 raw value가 있어야 계산되므로 p99를 보고 싶으면 raw로 발행해야 한다.

## Statistic vs ExtendedStatistic: 평균의 거짓말

같은 메트릭에서 여러 통계를 추출할 수 있다.

| 통계 | 의미 | 운영자 사용 시점 |
|------|------|------------------|
| **Sum** | 합계 | 총 요청 수, 총 에러 수, 누적 전송량 |
| **Average** | 평균 | CPU·메모리 평균 (long tail 숨김 주의) |
| **Minimum/Maximum** | 최소/최대 | 극단값 알람, "한 인스턴스라도 100% 도달" |
| **SampleCount** | 데이터 포인트 수 | 데이터 누락 감지 |
| **p50, p90, p95, p99, p99.9** | 백분위수 (Extended Statistic) | latency 분포의 long tail |
| **TM(percent)** | Trimmed Mean | 양 극단을 잘라낸 평균. outlier 영향 제거 |
| **WM, PR, TC, TS** | Wins Mean, Percentile Rank, Trimmed Count, Trimmed Sum | 정교한 통계 |

> ⚠️ **함정**: "Lambda 평균 응답시간이 200ms이니 안정적"이라는 판단은 위험. 1%의 요청이 5초 걸리면 p99는 5,000ms — 사용자 1%가 매우 나쁜 경험을 한다. **운영자는 평균이 아니라 p95, p99를 본다**. 시험에서 "사용자 경험의 long tail 모니터링" 시나리오는 거의 항상 백분위수 통계가 답이다. SLO를 평균으로 정의하는 회사는 사실상 SLO가 없는 거나 같다.

> 💡 **관련 이론**: latency의 long tail은 "Power Law" 분포의 결과. Pareto가 19세기에 발견한 80/20 법칙이 latency 분포에도 적용된다. Gil Tene의 "How NOT to Measure Latency"(Strange Loop 2015) 강연은 운영자 필독 — Coordinated Omission이라는 함정과 함께 왜 평균이 거짓말하는지를 설명한다. AWS의 latency SLO도 "p99 < N ms"로 정의되며, 평균은 SLO에 거의 안 쓰인다.

## Math Expression: 메트릭의 조합과 파생

여러 메트릭을 한 그래프나 알람에서 조합 가능. CloudWatch의 **Math Expression**.

```
m1 = ALBRequestCount (Sum, 1분)
m2 = ALBTargetResponseTime (Average, 1분)
m3 = ALBHTTPCode_Target_5XX_Count (Sum, 1분)

e1 = m1 * m2                    # 총 응답 시간(합산 latency)
e2 = m1 / 60                    # 초당 요청 수 (RPS)
e3 = (m3 / m1) * 100            # 5xx 에러율 (%)
e4 = ANOMALY_DETECTION_BAND(e3, 2)  # ML 기반 동적 베이스라인
```

자주 쓰이는 패턴:

- **에러율** = `(5xxCount / RequestCount) * 100`
- **RPS** = `RequestCount / 60`
- **여러 인스턴스 평균** = `AVG(METRICS())`
- **여러 인스턴스 합산** = `SUM(METRICS())`
- **Anomaly band** = `ANOMALY_DETECTION_BAND(m1, 2)` (표준편차 ±2)
- **fill** = `FILL(m1, 0)` (데이터 없는 구간을 0으로)
- **rate of change** = `RATE(m1)` (단위 시간당 변화율, 누적 카운터를 RPS로)

> 🔍 **더 깊이**: Math Expression은 알람의 직접 입력으로도 쓰인다. "5xx 에러율이 5%를 넘을 때만 알람" 같은 룰은 단일 메트릭으론 표현 못 함(분자/분모가 다른 메트릭). Math Expression으로 비율을 계산하고 그 결과 expression에 임계값을 설정. 알람의 `Metrics` 필드에 `[m1, m2, e1]`처럼 식들을 나열하고 `ReturnData=true`인 식 하나가 알람의 입력이 된다. 콘솔에서 "Add math" 메뉴로 추가하고 expression의 ID가 알람 식별자가 된다.

## Anomaly Detection: ML 기반 동적 베이스라인

고정 임계값(예: CPU > 80%) 알람은 트래픽 패턴이 시간대마다 다른 워크로드에선 false positive가 폭증한다. **Anomaly Detection**은 메트릭의 일별·요일별·시간대별 패턴을 학습해 동적 베이스라인을 생성.

```
                            [Anomaly Detection Band]
  ┌──────── upper band ────────────────────
  │   ╭╮                ╭─╮       ╭╮       
  │  ╱  ╲    ╭╮       ╱   ╲     ╱  ╲      
  │ ╱    ╲╱╲╱  ╲────── ╱   ╲   ╱    ╲  ──── 학습된 평균
  │                      ╲   ╲ ╱      ╲
  └──────── lower band ────────────────────

  메트릭이 band 밖으로 나가면 알람
```

CloudWatch는 최근 2주(14일)의 데이터를 학습해 STL/ARIMA 계열 회귀 모델을 만든다. 모델 학습에 5분~15분 소요, **매시간 재학습**해 패턴 변화에 적응. 운영자는 표준편차 배수(보통 2 또는 3)만 지정하면 된다.

> 💡 **관련 이론**: 이는 **STL(Seasonal-Trend decomposition using LOESS)**(Cleveland et al., 1990, *Journal of Official Statistics*) 또는 **ARIMA(AutoRegressive Integrated Moving Average)** 모델의 클라우드 구현이다. Facebook Prophet(Taylor & Letham, 2017), Twitter AnomalyDetection(2015), Netflix Surus, LinkedIn Luminol 같은 OSS와 같은 계열. 사람 손으로 임계값을 시간대마다 조정하는 부담을 ML이 대체한다.

> 📚 **사례**: 한 e-commerce 회사가 매일 점심 12시·저녁 7시에 트래픽 피크가 오고 주말은 평일과 다른 패턴이었다. 고정 임계값으로 알람 만들면 매일 false positive 수십 건이 새벽 호출로 이어졌다. Anomaly Detection 도입 후 평소 패턴(점심·저녁 피크, 주말 패턴) 안에서는 알람이 안 울리고, 예상치 못한 트래픽 급변(블랙프라이데이, 장애, 봇 공격)만 정확히 탐지. 운영자 야간 호출이 80% 감소.

> ⚠️ **함정**: Anomaly Detection은 **최소 2일치, 안정적으로는 2주치 데이터가 누적된 후 적용**해야 한다. 신규 메트릭에 즉시 적용하면 학습 데이터 부족으로 거의 모든 데이터 포인트가 anomaly로 표시된다. 시험에서 "신규 서비스에 즉시 anomaly detection 적용했더니 잘못된 알람이 폭증한다" 시나리오의 답은 "데이터 누적 후 활성화".

## CloudWatch Metric Stream: 거의 실시간 외부 export

2021년 GA된 **Metric Stream**은 메트릭 변경 사항을 거의 실시간(< 2분)으로 Kinesis Firehose에 흘려준다. 운영자가 자주 만나는 패턴:

```
[CloudWatch Metric Stream]
    │ (OpenTelemetry 0.7 or JSON)
    ▼
[Kinesis Data Firehose]
    │
    ├─→ S3 (장기 보존 / Athena 분석)
    ├─→ Datadog (외부 모니터링 통합)
    ├─→ New Relic / Splunk
    └─→ Lambda (커스텀 처리)
```

장점:
- GetMetricData를 매분 폴링하는 것보다 비용 효율적
- 거의 실시간 전달 (push 기반)
- OpenTelemetry 표준 포맷 지원

> 🔍 **더 깊이**: GetMetricData로 모든 메트릭을 매분 폴링하면 API 호출 비용과 latency가 폭증. Metric Stream은 CloudWatch 내부의 메트릭 발행 이벤트를 그대로 Firehose로 push하므로 폴링 패턴이 사라진다. 운영자가 Datadog·New Relic 같은 외부 도구로 메트릭을 옮기는 표준 방법. 비용은 메트릭 업데이트 1,000건당 \$0.003 + Firehose 표준 요금.

## 정리하며

CloudWatch Metrics의 운영자 체크리스트:

1. **dimension 카디널리티 관리**: user_id·request_id 같은 고카디널리티 필드는 dimension에 안 넣음(EMF의 메타데이터로)
2. **High-Resolution은 정말 필요할 때만**: 30초~1분 스파이크 워크로드에 한정
3. **EC2 메모리·디스크는 CloudWatch Agent 필수**: SSM Run Command로 일괄 배포
4. **사용자 메트릭은 PutMetricData보단 EMF**: API 비용 zero
5. **알람은 평균이 아닌 p95/p99**: long tail 보호
6. **변동 패턴이 큰 메트릭은 Anomaly Detection**: 단 학습 데이터 누적 후
7. **장기 보존은 Metric Stream → Firehose → S3**: 15개월 자동 삭제 우회

내일은 메트릭과 짝을 이루는 **CloudWatch Logs**. 로그 그룹·스트림·보존 정책·Subscription Filter·VPC Flow Logs 비용 함정을 깊이 본다.

---

## 📝 연습 문제

**문제 1.** EC2 메모리 사용률 알람을 만들려고 한다. 어떻게 수집하는가?

A) EC2 Detailed Monitoring을 활성화하면 자동 발행
B) CloudWatch Agent를 EC2에 설치하고 mem_used_percent를 발행. SSM Run Command + Parameter Store 패턴으로 일괄 배포
C) Lambda로 SSH 접속해서 free -m을 매분 실행
D) CloudWatch가 하이퍼바이저 레벨에서 자동 수집

**정답: B**
해설: EC2 표준 메트릭은 Nitro 하이퍼바이저 레벨에서 측정하므로 게스트 OS 안의 메모리·디스크 사용률은 못 본다. CloudWatch Agent가 게스트 OS 안에서 측정해 CloudWatch에 push해야 한다. 운영자 표준 패턴은 SSM Run Command로 Agent 설치 + Parameter Store에 저장된 설정 파일을 적용. Detailed Monitoring은 수집 간격만 5분→1분으로 줄이고 메모리·디스크는 여전히 안 줌.

---

**문제 2.** 빠른 트래픽 스파이크 감지를 위해 ASG가 1분이 아닌 10초 단위로 반응하게 하려고 한다. 어떤 옵션이 필요한가?

A) ASG의 cooldown을 10초로 설정
B) High-Resolution metric(1초 해상도)을 PutMetricData로 발행 + 알람 평가 주기 10초 + Step Scaling
C) Detailed Monitoring 활성화
D) CloudWatch Logs Subscription으로 즉각 처리

**정답: B**
해설: High-Resolution 메트릭(StorageResolution=1)을 발행하면 1초 단위 데이터 포인트가 쌓이고 알람도 10초 단위 평가가 가능. Step Scaling으로 임계값 초과 폭에 따라 한 번에 여러 대 추가. Detailed Monitoring은 1분 해상도까지만 가능하고, cooldown은 스케일 동작 사이의 대기 시간이라 감지 속도와는 무관.

---

**문제 3.** Lambda 함수의 평균 응답시간이 200ms인데 일부 사용자가 매우 느린 경험을 한다고 보고했다. 운영자가 봐야 할 메트릭과 통계는?

A) Average Duration
B) Sum Duration
C) p95, p99 Duration (Extended Statistic)
D) SampleCount

**정답: C**
해설: 평균은 long tail을 숨긴다. 1%의 요청이 5초 걸려도 99%가 빠르면 평균은 200ms 이하로 보인다. p95(상위 5%), p99(상위 1%) 백분위수로 long tail을 측정해야 일부 사용자의 나쁜 경험이 드러난다. SLO는 평균이 아닌 백분위수로 정의하는 게 표준.

---

**문제 4.** 운영자가 ALB의 5xx 에러율(에러 수 / 총 요청 수)을 모니터링하려고 한다. 어떻게 만드는가?

A) `HTTPCode_Target_5XX_Count` 메트릭에 단순 임계값
B) `HTTPCode_Target_5XX_Count`와 `RequestCount` 두 메트릭을 Math Expression `(m1/m2)*100`으로 비율 계산 후 그 결과에 알람 설정
C) CloudWatch Logs Insights로 비율 계산
D) ALB가 제공하는 `5XXErrorRate` 표준 메트릭 사용

**정답: B**
해설: 분자/분모가 다른 메트릭의 비율은 Math Expression `(5xxCount / RequestCount) * 100`으로 계산해야 한다. 그 결과 expression에 알람 설정. ALB는 비율 메트릭을 직접 제공하지 않으며 절대값 임계값은 트래픽 변동에 false positive가 폭증한다.

---

**문제 5.** 운영자가 모든 HTTP 요청마다 `PutMetricData`를 호출하니 API 비용이 폭증했다. 가장 효율적인 대안은?

A) API 호출을 batch로 묶음
B) Embedded Metric Format(EMF)으로 로그에 메트릭 임베드 → CloudWatch가 자동 추출 (API 호출 0)
C) 메트릭 발행 빈도 감소
D) 메트릭을 S3에 직접 저장

**정답: B**
해설: EMF는 로그 메시지 안에 JSON으로 메트릭을 임베드하면 CloudWatch가 자동으로 메트릭으로 추출. API 호출 비용 zero. Lambda·ECS·Fargate에서 표준 패턴. AWS Lambda Powertools 라이브러리가 자동 생성.

---

**문제 6.** CloudWatch 메트릭의 1초 해상도 데이터는 몇 시간 후 60초 해상도로 집계되는가?

A) 1시간
B) 3시간
C) 15일
D) 63일

**정답: B**
해설: 1초 → 3시간 후 60초로 집계, 15일 후 5분, 63일 후 1시간, 15개월 후 영구 삭제. 1초 해상도 데이터를 장기 보존하려면 GetMetricData나 Metric Stream으로 S3에 export해야 한다.

---

**문제 7.** 매일 점심·저녁 트래픽 피크가 있고 주말 패턴이 평일과 다른 워크로드에서 false positive 없는 알람을 만들려면?

A) 고정 임계값을 평균보다 높게 설정
B) Anomaly Detection 기반 알람 (단 데이터 2주 누적 후 적용)
C) Composite Alarm으로 여러 알람 조합
D) Math Expression으로 추세 계산

**정답: B**
해설: Anomaly Detection은 시간대·요일별 패턴을 ML로 학습해 동적 베이스라인을 생성. 평소 패턴 내 변동은 알람 안 울리고 진짜 이상만 탐지. 단 신규 메트릭에 바로 적용하면 학습 부족으로 모든 데이터가 anomaly가 되므로 최소 2주 누적 후 활성화가 표준.

---

**문제 8.** 한 회사가 100만 명 사용자의 latency를 개별 추적하려고 `UserId`를 메트릭 Dimension으로 사용했다. 청구서가 폭증한 원인과 해결은?

A) Detailed Monitoring이 꺼져 있었다 / 켜야 한다
B) Dimension cardinality explosion으로 100만 개 메트릭이 생성됨 / EMF의 메타데이터 필드로 옮기고 사용자별 분석은 Logs Insights로
C) Resolution이 1초였다 / 60초로 변경
D) Region이 잘못됐다 / 같은 리전으로 통일

**정답: B**
해설: `(Namespace, MetricName, Dimensions)` 조합 하나가 별도 메트릭이고 메트릭당 월 \$0.30 청구. 100만 사용자 = 100만 메트릭 = 월 \$30만. 사용자별·요청별 분석은 메트릭이 아닌 로그(EMF 메타데이터 + Logs Insights)에 둬야 한다.
