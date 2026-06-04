# Day 10 - Week 2 통합 복습: CloudWatch 시나리오 12문제

Week 2의 그림을 한 장으로 다시 본다. 새벽 3시 알람을 받았을 때 무엇을 어떤 순서로 봐야 하는가, 청구서가 갑자기 \$10,000 늘었을 때 어디부터 파야 하는가, 사용자 일부가 "느리다"고 할 때 어떤 쿼리를 쳐야 하는가. CloudWatch의 모든 도구가 결국 이 세 질문에 답하기 위한 것이다.

Week 2가 "데이터 수집"이라면 Week 3는 "알림과 가시화", Week 4부터의 자동화·DR·비용 관리는 그 위에서 만들어진다. 복습 주차인 만큼 이번 글은 각 개념을 다시 설명하기보다, 개념들이 **왜 그렇게 설계됐는지**와 **현장에서 어떻게 무너지는지**를 사고 사례·표준·이론으로 묶어 깊이를 더한다.

## CloudWatch가 풀려던 문제: 모니터링의 역사적 맥락

CloudWatch는 2009년 EC2의 CPU·네트워크·디스크 I/O를 보여주는 단순한 메트릭 서비스로 출발했다. 알람(2010), 커스텀 메트릭(2011), 운영자에게 가장 중요한 **CloudWatch Logs(2014)**, 이어 Logs Insights(2018), EMF·Anomaly Detection(2019), Metric Stream(2021), Cross-Account Observability(2022)가 시간차로 쌓인 지층이다.

CloudWatch는 한 번에 설계된 일관된 시스템이 아니라 **서로 다른 데이터 모델 위에 붙은 도구들의 연합**이다. Metrics는 time-series DB, Logs는 append-only 저장소, Insights는 그 위의 분산 쿼리 엔진, EMF는 둘을 잇는 다리다. 시나리오 문제가 어려운 이유는 "이 데이터가 메트릭 평면이냐 로그 평면이냐"를 먼저 판단해야 답이 갈리기 때문이다.

> 💡 **관련 이론**: "Three Pillars of Observability" — **Metrics(집계 수치), Logs(이산 이벤트), Traces(분산 경로)**. Peter Bourgon이 2017년 정리한 이 프레임이 OpenTelemetry 표준(CNCF, 2019)의 근간이다. CloudWatch Metrics = 첫째, Logs = 둘째, X-Ray = 셋째 기둥. EMF는 한 줄 로그로 첫째·둘째를 동시에 채우는 다리라서, "비용 0으로 메트릭+로그 통합"이 EMF를 가리킨다.

> 🔍 **더 깊이**: "메트릭이냐 로그냐"의 본질은 **카디널리티**다. 메트릭은 사전 정의된 차원 조합을 집계해 카디널리티가 낮아야 싸고 빠르다. 로그는 모든 이벤트를 적재해 카디널리티가 무한해도 되지만 쿼리마다 스캔 비용을 낸다. 그래서 "고카디널리티(user_id, request_id, trace_id)는 로그로, 저카디널리티(service, env, region)는 메트릭으로"라는 규칙이 나온다. 이 한 줄이 Week 2의 절반을 관통한다 — Metric Filter dimension, EMF의 dimension vs 메타데이터, Custom Metric cardinality explosion이 모두 이 변주다.

## Week 2 핵심 개념 한 줄 요약

1. **Metrics 데이터 모델**: `(Namespace, MetricName, Dimensions, Timestamp, Value, Unit)`. Dimension 집합 하나가 한 메트릭. Cardinality explosion 주의.
2. **EC2 메모리·디스크는 CloudWatch Agent 필요** — 하이퍼바이저 레벨 측정의 한계. SSM Run Command + Parameter Store로 일괄 배포.
3. **Custom Metric은 메트릭당 월 \$0.30** — user_id 같은 고카디널리티 dimension은 금지(EMF 메타데이터 필드로).
4. **Detailed Monitoring = 1분 간격, 인스턴스당 월 \$2.10**. Basic은 5분 무료. High-Resolution(1초)은 별도 `StorageResolution=1`.
5. **메트릭 보존 15개월**, 자동 다운샘플링(1초→60초→5분→1시간). 그 후 영구 삭제. 장기 보존은 Metric Stream → Firehose → S3.
6. **Log Group 기본 Retention = Never Expire** — 운영자 1순위 점검 항목. EventBridge / Config Rule로 신규 자동 적용.
7. **Subscription Filter로 실시간 로그 처리** — Lambda / Kinesis DS / Firehose / OpenSearch. 한 Log Group당 최대 2개.
8. **Logs Insights**: SQL-like 분산 쿼리 엔진. 5대 명령(fields/filter/stats/sort/limit) + `parse`/`bin()`. 스캔 GB로 청구.
9. **Metric Filter는 forward-only** (새 로그만 적용). 과거는 Logs Insights로 별도 집계. `DefaultValue: 0` 필수.
10. **EMF**: 한 줄 JSON 로그로 메트릭+로그+trace 통합. API 비용 zero. PowerTools 라이브러리로 자동 생성.
11. **Anomaly Detection**: 2주 학습 후 ML 기반 정상 밴드 판정. 시간대 패턴 있는 메트릭에 적합. STL/ARIMA 계열.
12. **Cross-Account Observability** (2022): Monitoring Account의 Sink + Source 계정 자원 연결. Organization 전체 자동 enrollment 가능.

## 운영자의 3대 시나리오: 어떤 순서로 보는가

복습의 핵심은 개별 도구가 아니라 **사고 대응 순서**다. SOA-C02 시나리오는 거의 이 세 흐름 중 하나다.

**시나리오 A — 새벽 3시 알람 ("서비스가 죽고 있다")**: ① 메트릭 평면에서 알람이 어느 메트릭(CPU/Memory/5xx/Latency)에서 왔는지, Anomaly band냐 고정 임계값이냐로 false positive 여부 판단 → ② 같은 시각 Log Group을 Logs Insights로 `filter @message like /ERROR|Exception|timeout/ | stats count(*) by bin(1m)` 하여 에러 급증 시점 특정 → ③ X-Ray ServiceMap으로 어느 다운스트림(RDS/외부 API/락 경합)이 느린지.

**시나리오 B — 청구서 폭증**: Cost Explorer로 CloudWatch 하위 항목 분해 → Logs Ingestion 급증(VPC Flow Logs·debug, 가장 흔함) / Storage 급증(Never Expire 누적) / Metrics 급증(cardinality explosion) / API(요청마다 PutMetricData → EMF 전환) / Insights 스캔(filter 없는 광역 쿼리) 중 어디인지 식별.

**시나리오 C — "일부 사용자가 느리다"**: Average는 거짓말 → p99 Extended Statistic으로 long tail 확인 → 메트릭으로 p99 추이 → 로그로 `filter duration > 1000 | stats count() by uri, user_id` (user_id는 dimension 아닌 로그 필드 — 여기서 빛난다).

> 📚 **사례**: 2017년 2월 28일 AWS **S3 us-east-1 대장애**(약 4시간)는 모니터링 자체의 교훈을 남겼다. Service Health Dashboard가 같은 리전 S3에 호스팅돼 있어, 정작 장애가 나자 상태 페이지를 빨간불로 바꿀 수조차 없었다. 교훈: **모니터링 시스템은 감시 대상과 fault domain을 분리**해야 한다. 핵심 알람의 SNS·대시보드는 워크로드와 다른 계정/리전에 두는 게 정석이고, Cross-Region·Cross-Account Observability가 그래서 중요하다.

> ⚠️ **함정**: 시나리오 A에서 곧장 콘솔 그래프부터 뒤지는 것은 안티패턴이다. 메트릭은 *무엇이*(증상), 로그는 *왜*(원인), 트레이스는 *어디서*(위치)를 답한다. 순서를 건너뛰면 "그래프는 빨간데 원인을 모르는" 상태에 빠진다. 시험에서 "원인을 찾으려면 다음 무엇을 봐야 하나"는 거의 항상 한 평면 아래로 내려가라는 뜻이다.

## 헷갈리기 쉬운 비교표

### 메트릭 발행 4가지 방법

| 항목 | Metric Filter | EMF | PutMetricData | Anomaly Detection |
|------|---------------|-----|---------------|-------------------|
| 발행 시점 | 로그 매칭 시 자동 | 로그 출력 시 자동 | API 직접 호출 | 기존 메트릭에 추가 |
| Latency | ~30초~1분 | ~1~2분 | 거의 즉시 | 기존 메트릭과 동일 |
| API 호출 비용 | 무료 | 무료 | 1,000건당 \$0.01 | 무료 |
| 메트릭 저장 비용 | \$0.30/메트릭 | \$0.30/메트릭 | \$0.30/메트릭 | \$0.30 + 학습 추가 |
| 코드 수정 필요 | X (기존 로그 활용) | O (애플리케이션) | O | X |
| 과거 데이터 적용 | X (forward-only) | X | X | △ (학습용) |
| 사용 시점 | 레거시 앱·코드 수정 불가 | 신규 코드·통합 발행 | 즉각 알람·외부 시스템 | 시간대 패턴 메트릭 |

### CloudWatch Logs vs CloudTrail Logs

| 항목 | CloudWatch Logs | CloudTrail Logs |
|------|-----------------|-----------------|
| 목적 | 애플리케이션·시스템 로그 | AWS API 호출 감사 |
| 보존 | 1일~10년 또는 영구 | Management Event 90일 무료, S3는 영구 가능 |
| 비용 | Ingestion \$0.76/GB + Storage | Management Event 무료(첫 trail), Data Event 별도 |
| 분석 | Logs Insights / Subscription / Metric Filter | CloudTrail Lake / Athena |
| 실시간 | Subscription Filter (수 초) | EventBridge (수 분) |

### Basic Monitoring vs Detailed Monitoring vs CloudWatch Agent

| 항목 | Basic | Detailed | CloudWatch Agent |
|------|-------|----------|------------------|
| 간격 | 5분 | 1분 | 60초 또는 1초 |
| 비용 | 무료 | \$2.10/월/인스턴스 | 메트릭당 \$0.30/월 |
| CPU/Network/Disk I/O | ✅ | ✅ | (중복) |
| Memory / Disk Usage / Swap | ❌ | ❌ | ✅ |
| 로그 수집 | ❌ | ❌ | ✅ (syslog/journald) |
| 활성화 | 자동 | 수동(태그) | 수동(SSM 배포) |

### CloudWatch vs 다른 모니터링 시스템 (개념 매핑)

| 개념 | CloudWatch | Prometheus | Datadog |
|------|-----------|------------|---------|
| 메트릭 식별 | Namespace + Dimensions | metric + labels | metric + tags |
| 카디널리티 폭증 | dimension 폭증 → \$0.30×N | label 폭증 → TSDB OOM | tag 폭증 → 과금 |
| 다운샘플링 | 1초→60초→5분→1시간 | recording rules + Thanos | rollup interval |
| 동적 베이스라인 | Anomaly Detection (STL/ARIMA) | 외부 도구 | Watchdog (ML) |
| pull vs push | push(PutMetricData) | pull(scrape) | push(agent) |

> 🔍 **더 깊이**: Prometheus의 가장 악명 높은 사고 패턴이 CloudWatch cardinality explosion과 동일하다 — `user_id`나 `request_path`를 label로 넣으면 시계열이 메모리에서 폭증해 서버가 OOM으로 죽는다. CloudWatch는 메모리가 아니라 **청구서로** 폭발할 뿐 뿌리는 같다. 둘 다 "label/dimension은 유한한 enum이어야 한다"는 철칙을 어긴 것이다. "사용자별/요청별"이 보이면 메트릭 dimension은 오답 — AWS 특유가 아니라 시계열 모니터링의 보편 원리다.

## 비용 폭증의 해부: 어디서 새는가

청구서(B)는 SOA-C02 최빈출 유형이다. CloudWatch 비용은 다섯 갈래로 샌다: **Logs Ingestion(\$0.76/GB) + Logs Storage(\$0.033/GB·월) + Metrics(\$0.30/개) + API(\$0.01/천건) + Insights 스캔(\$0.005/GB)**. 핵심은 **각 갈래의 단위 비용이 30배~수백 배 차이**가 난다는 것이다.

| 데이터 행선지 | 단가 | 비고 |
|---------------|------|------|
| CW Logs Ingestion | \$0.76/GB | 가장 비쌈. 한 번 들어오면 무를 수 없음 |
| CW Logs Storage | \$0.033/GB·월 | Never Expire면 영구 누적 |
| S3 Standard | \$0.023/GB·월 | Storage의 1/1.4 |
| S3 Glacier Deep Archive | \$0.00099/GB·월 | Storage의 1/33 |
| Logs Insights / Athena 스캔 | \$0.005/GB | filter·파티셔닝으로 스캔량 축소 |

여기서 운영자의 두 표준 결정이 나온다.

1. **고볼륨 로그는 Ingestion 자체를 피한다.** VPC Flow Logs를 S3로 직접 보내면 \$0.76/GB Ingestion을 통째로 회피, 분석은 Athena.
2. **장기 보존은 Storage 계층을 내린다.** 감사 로그를 CloudWatch Logs(\$0.033/GB·월) 대신 Glacier Deep Archive(\$0.00099/GB·월)로 — 33배 차이.

> 📚 **사례**: 2020년대 초 여러 핀테크·게임사가 "VPC Flow Logs 전량 CloudWatch Logs 전송"으로 월 수만 달러 청구서를 받았다. Flow Log는 ENI당 수십~수백 GB/일을 생성하는데 대부분 알람도 안 걸고 적재만 하다가 \$0.76/GB Ingestion이 누적된다. 해법: (a) 행선지를 S3로, (b) REJECT 트래픽 등 실시간 보안 탐지가 필요한 일부만 CloudWatch로 샘플, (c) 나머지는 S3 + Athena. 70~90% 절감이 흔하다.

> ⚠️ **함정**: "보존 기간을 줄이면 비용이 준다"는 절반만 맞다. 보존 단축은 **Storage**만 줄이고 이미 발생한 **Ingestion**(\$0.76/GB)은 못 줄인다. 고볼륨 로그가 문제면 보존이 아니라 *들어오는 양*을 줄여야 한다(행선지 변경, 로그 레벨, 샘플링). "Ingestion 비용 폭증" 시나리오에 "보존 축소"가 선택지로 나오면 오답 유도다.

## 메모리·디스크는 왜 Agent가 필요한가 — IaaS의 본질적 경계

복습에서 가장 자주 틀리는 지점이 "EC2 메모리는 Detailed Monitoring을 켜면 나온다"는 오해다. Detailed Monitoring은 **간격을 5분→1분으로 줄일 뿐** 메트릭 종류를 늘리지 않는다.

근본 원인은 **측정 위치**다. EC2의 CPU·네트워크·디스크 I/O는 **하이퍼바이저(Nitro System) 레벨**에서 측정된다(`CPUUtilization`, `NetworkIn/Out`, `EBS Read/WriteOps`). 게스트 OS가 hang 돼도 하이퍼바이저는 vCPU 스케줄링과 블록 I/O를 보므로 측정이 계속된다. 그러나 **메모리 사용률·디스크 사용량(df)·swap은 게스트 OS 안의 페이지 테이블·파일시스템 메타데이터**라서 하이퍼바이저가 못 본다(`mem_used_percent`, `disk_used_percent`, `swap_used_percent` → Agent 필요). 본다면 가상화 격리 위반이다.

> 🔍 **더 깊이**: 이 경계는 IaaS와 PaaS/FaaS의 책임 분담선이다. **Lambda·Fargate는 메모리가 표준 메트릭에 포함**된다 — AWS가 게스트 OS까지 운영하므로 OS 내부 통계를 노출할 수 있기 때문. "메모리 메트릭이 표준이냐"는 *누가 OS를 소유하느냐*의 결과다. 그래서 "EC2 메모리"는 Agent, "Lambda/Fargate 메모리"는 표준 메트릭(또는 REPORT의 `maxMemoryUsed`)으로 갈린다.

> ⚠️ **함정**: "메모리 기반 Auto Scaling이 안 된다" 시나리오. ASG Target Tracking은 표준 메트릭(CPU, ALBRequestCountPerTarget)만 기본 지원하고 메모리는 표준이 아니다. 해결: Agent로 `mem_used_percent`를 custom metric으로 발행 후 그 메트릭에 **custom metric target tracking** 또는 **step scaling**. Agent 없이 메모리 스케일링은 불가능하다.

## p99의 진실: 평균은 SLO를 망친다

시나리오 C의 핵심은 통계 선택이다. *왜* 평균이 위험한지 이론으로 못박는다.

latency 분포는 정규분포가 아니라 **오른쪽으로 긴 꼬리(heavy-tail)**를 가진다. 대부분 빠르지만 GC pause, 락 경합, 콜드 캐시, 네트워크 재전송이 소수 요청을 수 배~수십 배 느리게 만든다. 이 분포에서 평균은 다수에 끌려가 long tail을 숨긴다.

> 💡 **관련 이론**: Gil Tene의 **"How NOT to Measure Latency"**(Strange Loop 2015) 필독. (1) **평균·표준편차는 latency에 의미 없다**(정규분포가 아니므로), (2) **Coordinated Omission**: 부하 테스트 도구가 느린 응답을 기다리느라 그 시간의 요청을 못 보내, 가장 나쁜 구간이 측정에서 빠지는 체계적 오류. "1000명 중 10명이 5초"는 p99로만 드러나고 평균(200ms)으론 절대 안 보인다.

> 💡 **관련 이론**: Dean & Barroso **"The Tail at Scale"**(CACM, 2013) — 한 요청이 100개 서비스를 fan-out하면 각 서비스 p99가 1%여도 *최소 하나*가 느릴 확률은 1-(0.99)^100 ≈ 63%. 규모가 커질수록 꼬리가 일반 경험이 되는 게 마이크로서비스에서 p99 모니터링이 필수인 수학적 이유다.

> ⚠️ **함정**: SLO를 "평균 < 300ms"로 정의하면 사실상 SLO가 없는 셈이다. 평균은 1%의 5초 응답을 완전히 가린다. 표준은 "p99 < N ms"이고 **알람 통계도 SLO와 같은 백분위수로 통일**해야 한다. 알람을 Average, SLO를 p99로 정의하면 알람은 조용한데 SLO는 위반되는 모순이 생긴다. CloudWatch는 ExtendedStatistic으로 p50~p99.9를 지원.

## forward-only의 함정: Metric Filter가 과거를 못 보는 이유

Metric Filter는 **새로 들어오는 로그에만** 패턴을 적용한다(forward-only). 어제의 에러는 오늘 만든 필터에 안 잡힌다. 버그가 아니라 아키텍처의 결과다.

> 🔍 **더 깊이**: Metric Filter는 로그가 ingest되는 **스트림 처리 시점**에 패턴을 평가해 발행한다. 반면 Logs Insights는 저장된 로그를 **사후 스캔**하는 배치 쿼리다. 이 차이가 forward-only vs 과거 조회의 본질이고, 과거는 Insights로 집계해야 한다. 스트림 vs 배치는 데이터 엔지니어링의 고전적 이분법(Lambda Architecture, Kleppmann *Designing Data-Intensive Applications*)이고 CloudWatch는 둘 다 제공할 뿐이다.

> ⚠️ **함정**: `DefaultValue`를 안 넣으면 패턴 미매칭 기간엔 **데이터 포인트가 아예 발행되지 않는다**(0이 아니라 결측). 그러면 알람이 INSUFFICIENT_DATA에 머물러 에러 0건일 때 평가 자체가 안 된다. `DefaultValue: 0`을 넣어야 "매치 없음 = 0건"으로 발행돼 정상 동작한다. "Metric Filter 알람이 안 울린다"의 절반은 이 함정이다.

## Anomaly Detection의 ML 내부와 콜드스타트

고정 임계값은 시간대 패턴 메트릭에서 false positive를 양산한다. Anomaly Detection은 그 패턴을 학습해 동적 밴드를 만든다.

> 💡 **관련 이론**: CloudWatch Anomaly Detection은 **STL(Seasonal-Trend decomposition using LOESS)**(Cleveland et al., 1990, *Journal of Official Statistics*)과 **ARIMA** 계열로 시계열을 추세·계절성·잔차로 분해한다. 같은 계열 OSS로 Facebook Prophet(2017), Twitter AnomalyDetection(S-H-ESD, 2015), LinkedIn Luminol, Netflix Surus. 핵심: "화요일 오후 2시 정상값은 얼마인가"를 요일·시간 주기로 학습해 기대값에서 표준편차 N배 벗어나면 anomaly로 표시.

> ⚠️ **함정**: Anomaly Detection은 **콜드스타트** 문제가 있다. 최소 2일, 안정적으로는 2주치 데이터가 누적돼야 밴드가 의미를 가진다. 신규 메트릭에 즉시 적용하면 밴드가 비정상적으로 넓거나 좁아져 알람이 무의미해진다. "새 서비스에 켰더니 알람 폭증 / 한 번도 안 울림"은 둘 다 데이터 미숙성이 원인이고 답은 "데이터 누적 후 활성화". ML 추천 시스템의 콜드스타트와 같은 문제다.

## Week 2 자기진단 체크리스트

- [ ] Namespace + MetricName + Dimensions 조합이 왜 별도 메트릭인지, cardinality explosion이 왜 비용 폭증을 부르는지 설명할 수 있는가?
- [ ] EC2 메모리 사용률을 어떻게 수집하는지(왜 Detailed Monitoring으론 안 되는지, 측정 위치가 어디인지) 설명할 수 있는가?
- [ ] 1초 / 60초 / 5분 / 1시간 메트릭이 각각 얼마 동안 보존되는지 외우고 있는가?
- [ ] Lambda Log Group의 기본 보존이 Never Expire라는 점과 운영자의 First-Day Action 1순위가 무엇인지 안다?
- [ ] VPC Flow Logs를 CloudWatch Logs vs S3 중 어디로 보내야 하는지 Ingestion vs Storage 비용 관점에서 설명할 수 있는가?
- [ ] Subscription Filter의 4대 대상(Lambda/Kinesis DS/Firehose/OpenSearch)을 사용 시점별로 구분할 수 있는가?
- [ ] Logs Insights 쿼리에서 `filter`를 앞에 두는 이유가 왜 비용·속도 양면 효과인지 설명할 수 있는가?
- [ ] EMF JSON에서 dimension vs 메타데이터 필드를 구분하는 기준이 카디널리티라는 점을 안다?
- [ ] Anomaly Detection이 STL/ARIMA 기반이고 2주 학습(콜드스타트)이 필요하다는 사실을 안다?
- [ ] Metric Filter가 forward-only(스트림 처리)이고 `DefaultValue`를 안 넣으면 알람이 안 울리는 함정을 안다?
- [ ] CloudWatch Cross-Account Observability의 Monitoring Account + Sink 패턴을 안다?
- [ ] 비용 폭증 시 Ingestion / Storage / Metrics / API / Insights 중 어디가 샜는지 분해할 수 있는가?

---

## 📝 시나리오 12문항

**문제 1.** EC2 Auto Scaling Group이 CPU 70% 초과 시 스케일 아웃하도록 설정했지만, 트래픽 급증 시 반응이 느려 5분간 응답 지연이 발생한다. 가장 큰 원인과 해결은?

A) EC2 인스턴스 타입이 작아 처리량이 부족 / 더 큰 인스턴스 타입으로 수직 확장해 단위 처리량 증대

B) 기본 Monitoring이 5분 간격이라 CPU 초과 감지가 늦음 / Detailed Monitoring(1분) 활성화 + Alarm Period 1분

C) Alarm Evaluation Period가 너무 짧아 노이즈로 조기 발화·취소됨 / Period와 평가 횟수를 늘려 안정화

D) ASG Cooldown이 너무 길어 연속 스케일 아웃이 막힘 / Cooldown을 줄여 빠른 추가 확장 허용

**정답: B**

해설: 기본 Basic Monitoring은 5분 간격이라 메트릭 데이터 포인트도 5분에 한 번 → 알람 평가도 5분 주기 → 트래픽 급증 감지가 지연된다. Detailed Monitoring(1분)으로 변경하면 1~2분 내 스케일 아웃 트리거. 더 빠른 반응이 필요하면 1초 해상도 custom metric(PutMetricData with StorageResolution=1) + Step Scaling. A는 수직 확장이라 ASG 설계 의도와 어긋나고, D의 Cooldown은 스케일 동작 *사이* 대기 시간이라 최초 감지 속도와는 무관하다.

---

**문제 2.** 회사의 CloudWatch Logs 비용이 3개월 만에 5배 증가했다. 운영자가 가장 먼저 점검해야 할 항목은?

A) CloudWatch 알람 개수 — 알람당 \$0.10 과금이 누적됐는지 점검하고 미사용 알람 정리

B) Log Group의 Retention 설정 — 영구 보존(Never Expire) 그룹을 식별하고 일괄 정책 적용

C) Subscription Filter 개수 — Lambda·Firehose 전송 처리 비용이 로그량과 함께 늘었는지 점검

D) CloudWatch Agent 설정 — 수집 메트릭·로그 항목이 과다하게 늘어 custom metric 비용을 키웠는지 점검

**정답: B**

해설: 기본 Retention = Never Expire라 운영 시간이 길수록 Storage 비용이 누적 폭증. `describe-log-groups`로 `retentionInDays`가 null인 그룹을 찾아 일괄 변경. 그 다음 Ingestion 측에서 VPC Flow Logs·debug 로그 같은 고볼륨 소스를 확인. 신규 Log Group에는 EventBridge 또는 Config Rule로 자동 적용. 단 주의: Retention 단축은 Storage만 줄이고 이미 발생한 Ingestion(\$0.76/GB)은 못 줄이므로, 고볼륨 소스가 진짜 원인이면 들어오는 양 자체를 줄여야 한다.

---

**문제 3.** Lambda 함수의 콜드 스타트 빈도를 추적하려 한다. Logs Insights 쿼리로 가장 적절한 것은?

A) `filter @message like /COLD/`로 콜드 스타트 로그 라인을 매칭해 `stats count(*) by bin(5m)`로 집계

B) `filter @type = "REPORT" | stats count(@initDuration) as cold, count(*) as total, (cold/total*100) as pct by bin(5m)`

C) `select cold_start_count from logs where event_type = 'cold_start' group by 5m`

D) Logs Insights로는 집계 불가하고, X-Ray ServiceMap의 Init segment 추적으로만 콜드 스타트율을 측정할 수 있다

**정답: B**

해설: Lambda REPORT 라인에 콜드 스타트 시 `@initDuration` 자동 필드 추가, 웜 스타트엔 없음. `count(@initDuration)` = 콜드 스타트 수. 시간 빈(`bin(5m)`)으로 추이 분석. A는 표준 REPORT에 "COLD" 문자열이 없어 매칭 실패, C는 SQL 문법이라 Insights 문법(파이프 기반)이 아님, D는 틀림(REPORT 로그로 충분).

---

**문제 4.** 사용자별 API 호출 횟수를 추적하려 한다. 가장 비용 효율적이고 확장 가능한 패턴은?

A) `UserId`를 Custom Metric Dimension으로 사용하고, PutMetricData로 사용자별 호출을 집계해 알람·대시보드에 직접 노출

B) 로그에 user_id 출력 → Logs Insights로 `stats count(*) by user_id` 분석 또는 EMF 메타데이터로

C) API Gateway 앞단에서 사용자별 호출을 DynamoDB 원자적 카운터(`UpdateItem ADD`)에 저장하고 TTL로 기간별 집계

D) CloudWatch Anomaly Detection으로 사용자별 호출 패턴을 학습해 이상 사용자만 자동 식별

**정답: B**

해설: 사용자 수가 많을수록 Dimension 카디널리티 폭발 → 메트릭당 \$0.30 × 사용자 수 = 비용 폭증. user_id는 메트릭 dimension이 아니라 로그 필드 또는 EMF 메타데이터로. 분석이 필요할 때만 Logs Insights로 ad-hoc 쿼리. 이는 AWS 특유 함정이 아니라 Prometheus label 폭증·Datadog tag 과금과 같은 시계열 DB의 보편 원리다.

---

**문제 5.** 회사가 API 5xx 에러를 ALB Access Logs에서 추출해 알람을 보내려 한다. 가장 적합한 흐름은?

A) ALB Access Log는 S3에만 저장 → 단, ALB는 CloudWatch에 `HTTPCode_Target_5XX_Count` 등 표준 메트릭을 자동 발행하므로 이걸로 알람. 상세 분석이 필요하면 S3 + Athena

B) ALB Access Log를 CloudWatch Logs로 보낸 뒤 Logs Insights `stats count(*) by elb_status_code` 쿼리로만 5xx를 추출해 알람

C) ALB 노드에 CloudWatch Agent를 설치해 access log 파일을 tail하여 5xx 라인을 metric filter로 발행

D) ALB Access Log Group에 Subscription Filter를 붙여 5xx 패턴을 Lambda로 실시간 추출 후 PutMetricData

**정답: A**

해설: ALB Access Logs는 S3에만 저장된다(CloudWatch Logs로 직접 보내는 옵션 없음). 다만 ALB는 CloudWatch에 표준 메트릭(`HTTPCode_Target_5XX_Count`, `HTTPCode_ELB_5XX_Count`, `TargetResponseTime` 등)을 자동 발행 → 이걸로 알람을 만드는 게 정석. 상세 path/UA/IP 분석이 필요하면 S3 + Athena. C는 ALB가 관리형이라 Agent를 설치할 호스트가 없어 불가.

---

**문제 6.** 회사가 새 마이크로서비스를 배포하면서 처음부터 EMF를 도입하려 한다. 다음 중 EMF의 올바른 사용은?

A) `_aws.CloudWatchMetrics` 필드에 메트릭 정의 + 같은 JSON에 service/env(저 카디널리티)는 dimension, user_id/trace_id(고 카디널리티)는 일반 필드로

B) `PutMetricData` API를 EMF 스키마 JSON을 페이로드로 호출해 메트릭과 로그를 한 번의 API로 동시 발행

C) EMF는 CloudWatch Agent가 파싱하는 형식이라 Agent가 도는 EC2에서만 동작하고 Lambda·Fargate에서는 사용 불가

D) 애플리케이션이 EMF JSON을 S3에 적재하면 CloudWatch가 버킷을 폴링해 메트릭을 자동 추출

**정답: A**

해설: EMF의 핵심 — `_aws.CloudWatchMetrics`로 메트릭 메타데이터, 저 카디널리티는 dimension, 고 카디널리티는 일반 필드(로그 검색은 되지만 메트릭 dim은 아님). AWS Lambda Powertools가 자동 생성. Lambda는 EMF의 가장 일반적 사용처. B는 EMF가 *로그 출력*이지 API 호출이 아니라는 점에서 틀림(EMF의 핵심 장점이 API 0). EMF는 "한 줄 로그로 메트릭+로그를 동시에 채우는 다리"라는 점이 시험 포인트.

---

**문제 7.** Anomaly Detection 알람을 설정한 직후 5일간 알람이 한 번도 안 울린다. 가능한 원인은?

A) 알람 IAM 역할에 `cloudwatch:DescribeAnomalyDetectors` 권한이 없어 밴드 평가가 조용히 실패

B) 최소 2주 학습 데이터가 필요하며, 학습 중에는 베이스라인이 불안정 — 데이터 누적 후 정확도 향상

C) 알람의 `ANOMALY_DETECTION_BAND` 임계 폭(표준편차 배수)이 너무 크게 설정돼 어떤 값도 밴드를 벗어나지 못함

D) 소스 메트릭이 5분마다 결측되어 데이터 포인트가 부족해 알람이 INSUFFICIENT_DATA에 머무름

**정답: B**

해설: `ANOMALY_DETECTION_BAND`는 최소 2일~2주 데이터로 학습한다(콜드스타트). 학습 데이터 누적 전에는 베이스라인이 매우 넓거나 부정확해 알람이 평가는 되지만 실용적인 발화는 어렵다. 운영자는 신규 메트릭에 즉시 Anomaly Detection을 적용하지 말고 데이터 누적 후 활성화. ML 추천 시스템의 콜드스타트와 같은 본질의 문제다.

---

**문제 8.** Cross-Account로 50개 계정의 ERROR 로그를 중앙에서 실시간 분석하려 한다. 가장 적합한 패턴은?

A) 각 계정에서 매일 `create-export-task`로 로그를 중앙 S3로 export하고 Athena 파티션 쿼리로 ERROR를 분석

B) 각 계정 Log Group에 Subscription Filter → Cross-Account Kinesis Data Streams (중앙 계정의 Log Destination) → 중앙 OpenSearch

C) Organization CloudTrail로 모든 계정 API 이벤트를 중앙 집계하면 애플리케이션 ERROR 로그까지 함께 분석된다

D) 각 계정 EventBridge 룰로 ERROR 패턴 이벤트를 중앙 이벤트 버스에 cross-account 전송 후 통합

**정답: B**

해설: 실시간 요구사항 → Subscription Filter + Cross-Account Kinesis가 표준. 소스 계정에서 Logs Destination 자원 생성(중앙 계정에 위치), Destination Policy로 소스 계정의 `logs:PutSubscriptionFilter` 허용, 중앙 OpenSearch에서 통합 검색. 또는 CloudWatch Cross-Account Observability(2022)로 더 간단히 구성 가능. A는 "매일 export"라 실시간 요구를 위반. 2017 S3 us-east-1 장애의 교훈대로 중앙 모니터링 계정은 워크로드와 fault domain을 분리하는 게 정석이다.

---

**문제 9.** 회사가 Lambda 함수 코드를 수정하지 않고 ERROR 카운트 메트릭을 만들어야 한다. 어떤 방법이 적합한가?

A) Lambda 핸들러에 Powertools를 추가하고 EMF로 ERROR 메트릭을 발행하도록 코드를 수정

B) Metric Filter로 `/aws/lambda/<함수명>` Log Group에 ERROR 패턴 적용. `DefaultValue: 0` 설정

C) Lambda 런타임 wrapper나 사이드카에서 `PutMetricData`를 호출해 ERROR 발생 시 메트릭을 직접 발행

D) Lambda Errors 표준 메트릭에 Anomaly Detection을 걸어 ERROR 급증을 동적으로 탐지

**정답: B**

해설: 코드 수정 불가 → Metric Filter가 정답. 기존 로그 패턴(`?ERROR ?Exception ?CRITICAL`)을 매칭해 자동 메트릭 발행. 단 forward-only(스트림 처리라 과거 로그 미적용), `DefaultValue: 0`을 설정해 매치 없을 때도 0을 발행해야 알람이 INSUFFICIENT_DATA에 빠지지 않는다. A·C는 코드(또는 wrapper) 수정이 필요해 제약 위반. D의 Anomaly Detection은 기존 Errors 메트릭에 거는 것이라 코드 수정은 없지만, "ERROR 카운트 메트릭을 새로 만든다"는 요구가 아니라 기존 메트릭에 동적 밴드를 얹는 것이라 요구와 어긋난다.

---

**문제 10.** 운영팀이 응답 시간 SLO를 p99 < 1초로 정의했다. 알람 설정 시 가장 적절한 통계는?

A) Average — 전체 요청의 평균 응답 시간으로 일관된 추세를 보여줘 SLO 평가에 안정적

B) Sum — 기간 내 총 응답 시간을 합산해 부하 규모와 SLO 위반을 함께 반영

C) p99 (Extended Statistic)

D) Maximum — 가장 느린 단일 요청을 기준으로 잡아 최악의 사용자 경험을 보수적으로 보장

**정답: C**

해설: SLO가 p99 기준이라면 알람도 p99로 평가해야 일관된다. CloudWatch는 알람의 ExtendedStatistic으로 `p50`, `p90`, `p95`, `p99`, `p99.9` 등 백분위를 지원. Average는 long tail을 숨기고(Gil Tene "How NOT to Measure Latency"), Maximum은 단일 outlier에 흔들린다. SLO와 alarm은 같은 통계로 통일해야 "알람은 조용한데 SLO는 위반" 모순이 안 생긴다.

---

**문제 11.** VPC가 큰 회사에서 VPC Flow Logs를 모두 CloudWatch Logs로 보냈더니 월 비용이 \$20,000을 넘었다. 가장 효과적인 비용 절감은?

A) Flow Logs Group의 보존 기간을 7일로 축소하고 만료 정책으로 누적 Storage를 줄임

B) VPC Flow Logs Destination을 CloudWatch Logs에서 S3로 변경. 분석은 Athena. 실시간 알림이 꼭 필요한 일부 패턴만 CloudWatch에 sample

C) Flow Logs Group에 Subscription Filter + Lambda를 추가해 ACCEPT 트래픽을 사전 필터링한 뒤 적재량을 줄임

D) Flow Logs를 생성하는 ENI들의 Detailed Monitoring을 끄고 메트릭 발행 빈도를 낮춤

**정답: B**

해설: CloudWatch Logs Ingestion(\$0.76/GB) → S3(\$0.023/GB)로 큰 차이. 분석은 Athena(\$5/TB = \$0.005/GB)로 처리. Hybrid 패턴(대량 S3 + 핵심만 CloudWatch)도 흔하다. A의 보존 축소는 Storage만 줄이고 Ingestion(이 문제의 진짜 원인)은 못 줄이므로 오답 유도. 핀테크·게임사에서 반복된 실제 청구 사고 유형이다.

---

**문제 12.** 한 회사의 운영자가 7년 보존 의무가 있는 감사 로그의 비용을 최소화하려고 한다. 표준 패턴은?

A) CloudWatch Logs Group에 7년(2557일) 보존을 설정하고, 그대로 Logs Storage에 보관하며 Insights로 검색

B) Subscription Filter → Kinesis Firehose → S3 Standard 1년 → S3 Glacier Deep Archive 6년 lifecycle. Athena로 ad-hoc 검색

C) 감사 로그를 DynamoDB 테이블로 이전하고, on-demand 용량 + TTL로 7년 후 자동 만료시켜 보관

D) Lambda가 매일 Log Group을 조회해 압축 후 별도 S3 버킷에 백업하고 버전 관리로 무결성 유지

**정답: B**

해설: CloudWatch Logs Storage(\$0.033/GB·월) vs Glacier Deep Archive(\$0.00099/GB·월). 33배 차이. S3 lifecycle 정책으로 자동 전환·만료. Athena Glacier integration으로 필요 시 restore 후 검색 가능. 운영자가 보존 비용을 줄이는 가장 큰 단일 변경. 7년 감사 보존은 SOX·금융 규제 맥락에서 흔한 요구다.

---

## 다음 주 예고 (Week 3)

Week 3는 모니터링 심화 — **Alarms, Dashboards, Agent, Synthetics·RUM·X-Ray** 입니다.

- Day 1: Alarms 심화 — Composite, Anomaly 알람, M of N 평가, Treat Missing Data, Action Suppressor
- Day 2: Dashboards & 자동 새로고침, Cross-Account / Cross-Region 위젯, Live View
- Day 3: CloudWatch Agent — 메모리/디스크 메트릭, statsd / collectd, journald / Windows Event Log
- Day 4: Synthetics Canary, RUM, ServiceLens, X-Ray trace, Application Signals
- Day 5: Week 3 복습 + 시나리오 10문제

Week 2가 "데이터 수집"이라면 Week 3는 "알림과 가시화". SOA-C02에서 시나리오가 가장 많이 나오는 영역입니다. 오늘 정리한 메트릭/로그 평면 구분, 비용 다섯 갈래, p99 우선 원칙이 그대로 Week 3 알람·대시보드 설계의 토대가 됩니다.
