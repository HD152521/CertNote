# Day 10 - Week 2 통합 복습: CloudWatch 시나리오 12문제

Week 2의 그림을 한 장으로 다시 본다. 운영자가 새벽 3시 알람을 받았을 때 무엇을 어떤 순서로 봐야 하는가, 청구서가 갑자기 \$10,000 늘었을 때 어디부터 파야 하는가, 사용자 일부가 "느리다"고 보고했을 때 어떤 쿼리를 쳐야 하는가. CloudWatch의 모든 도구가 결국 이 세 질문에 답하기 위한 것이다.

이 주의 내용이 머릿속에 깔려 있어야 다음 주의 CloudWatch Alarms·Dashboards·Agent·Synthetics가 자연스럽게 위에 얹힌다. Week 2가 "데이터 수집"이라면 Week 3는 "알림과 가시화", Week 4부터의 자동화·DR·비용 관리는 그 위에서 만들어진다.

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

## Week 2 자기진단 체크리스트

- [ ] Namespace + MetricName + Dimensions 조합이 왜 별도 메트릭인지, cardinality explosion이 왜 비용 폭증을 부르는지 설명할 수 있는가?
- [ ] EC2 메모리 사용률을 어떻게 수집하는지(왜 Detailed Monitoring으론 안 되는지) 설명할 수 있는가?
- [ ] 1초 / 60초 / 5분 / 1시간 메트릭이 각각 얼마 동안 보존되는지 외우고 있는가?
- [ ] Lambda Log Group의 기본 보존이 Never Expire라는 점과 운영자의 First-Day Action 1순위가 무엇인지 안다?
- [ ] VPC Flow Logs를 CloudWatch Logs vs S3 중 어디로 보내야 하는지 비용·분석 관점에서 설명할 수 있는가?
- [ ] Subscription Filter의 4대 대상(Lambda/Kinesis DS/Firehose/OpenSearch)을 사용 시점별로 구분할 수 있는가?
- [ ] Logs Insights 쿼리에서 `filter`를 앞에 두는 이유가 왜 비용·속도 양면 효과인지 설명할 수 있는가?
- [ ] EMF JSON에서 dimension vs 메타데이터 필드를 구분하는 기준이 카디널리티라는 점을 안다?
- [ ] Anomaly Detection이 STL/ARIMA 기반이고 2주 학습이 필요하다는 사실을 안다?
- [ ] Metric Filter가 forward-only이고 `DefaultValue`를 안 넣으면 알람이 안 울리는 함정을 안다?
- [ ] CloudWatch Cross-Account Observability의 Monitoring Account + Sink 패턴을 안다?

---

## 📝 시나리오 12문항

**문제 1.** EC2 Auto Scaling Group이 CPU 70% 초과 시 스케일 아웃하도록 설정했지만, 트래픽 급증 시 반응이 느려 5분간 응답 지연이 발생한다. 가장 큰 원인과 해결은?

A) EC2 인스턴스 타입이 작다 / 더 큰 타입
B) 기본 Monitoring이 5분 간격이라 CPU 초과 감지가 늦음 / Detailed Monitoring(1분) 활성화 + Alarm Period 1분
C) Alarm Period가 너무 짧다 / Period 늘림
D) ASG Cooldown 문제 / Cooldown 줄임

**정답: B**
해설: 기본 Basic Monitoring은 5분 간격이라 메트릭 데이터 포인트도 5분에 한 번 → 알람 평가도 5분 주기 → 트래픽 급증 감지가 지연된다. Detailed Monitoring(1분)으로 변경하면 1~2분 내 스케일 아웃 트리거. 더 빠른 반응이 필요하면 1초 해상도 custom metric(PutMetricData with StorageResolution=1) + Step Scaling.

---

**문제 2.** 회사의 CloudWatch Logs 비용이 3개월 만에 5배 증가했다. 운영자가 가장 먼저 점검해야 할 항목은?

A) 알람 개수
B) Log Group의 Retention 설정 — 영구 보존(Never Expire) 그룹을 식별하고 일괄 정책 적용
C) Subscription Filter 개수
D) CloudWatch Agent 설정

**정답: B**
해설: 기본 Retention = Never Expire라 운영 시간이 길수록 Storage 비용이 누적 폭증. `describe-log-groups`로 `retentionInDays`가 null인 그룹을 찾아 일괄 변경. 그 다음 Ingestion 측에서 VPC Flow Logs·debug 로그 같은 고볼륨 소스를 확인. 신규 Log Group에는 EventBridge 또는 Config Rule로 자동 적용.

---

**문제 3.** Lambda 함수의 콜드 스타트 빈도를 추적하려 한다. Logs Insights 쿼리로 가장 적절한 것은?

A) `filter @message like /COLD/`
B) `filter @type = "REPORT" | stats count(@initDuration) as cold, count(*) as total, (cold/total*100) as pct by bin(5m)`
C) `select cold_start_count from logs`
D) Logs Insights로는 불가, X-Ray만 가능

**정답: B**
해설: Lambda REPORT 라인에 콜드 스타트 시 `@initDuration` 자동 필드 추가, 웜 스타트엔 없음. `count(@initDuration)` = 콜드 스타트 수. 시간 빈(`bin(5m)`)으로 추이 분석. C 같은 SQL syntax는 Insights 문법이 아님.

---

**문제 4.** 사용자별 API 호출 횟수를 추적하려 한다. 가장 비용 효율적이고 확장 가능한 패턴은?

A) `UserId`를 Custom Metric Dimension으로 사용
B) 로그에 user_id 출력 → Logs Insights로 `stats count(*) by user_id` 분석 또는 EMF 메타데이터로
C) DynamoDB에 카운터 저장
D) CloudWatch Anomaly Detection

**정답: B**
해설: 사용자 수가 많을수록 Dimension 카디널리티 폭발 → 메트릭당 \$0.30 × 사용자 수 = 비용 폭증. user_id는 메트릭 dimension이 아니라 로그 필드 또는 EMF 메타데이터로. 분석이 필요할 때만 Logs Insights로 ad-hoc 쿼리.

---

**문제 5.** 회사가 API 5xx 에러를 ALB Access Logs에서 추출해 알람을 보내려 한다. 가장 적합한 흐름은?

A) ALB Access Log는 S3에만 저장 → 단, ALB는 CloudWatch에 `HTTPCode_Target_5XX_Count` 등 표준 메트릭을 자동 발행하므로 이걸로 알람. 상세 분석이 필요하면 S3 + Athena
B) Logs Insights로만 가능
C) CloudWatch Agent로 ALB 로그 수집
D) Subscription Filter

**정답: A**
해설: ALB Access Logs는 S3에만 저장된다(CloudWatch Logs로 직접 보내는 옵션 없음). 다만 ALB는 CloudWatch에 표준 메트릭(`HTTPCode_Target_5XX_Count`, `HTTPCode_ELB_5XX_Count`, `TargetResponseTime` 등)을 자동 발행 → 이걸로 알람을 만드는 게 정석. 상세 path/UA/IP 분석이 필요하면 S3 + Athena.

---

**문제 6.** 회사가 새 마이크로서비스를 배포하면서 처음부터 EMF를 도입하려 한다. 다음 중 EMF의 올바른 사용은?

A) `_aws.CloudWatchMetrics` 필드에 메트릭 정의 + 같은 JSON에 service/env(저 카디널리티)는 dimension, user_id/trace_id(고 카디널리티)는 일반 필드로
B) PutMetricData를 EMF 형식 JSON으로 호출
C) Lambda는 EMF 사용 불가, EC2만 가능
D) S3에 EMF JSON 저장

**정답: A**
해설: EMF의 핵심 — `_aws.CloudWatchMetrics`로 메트릭 메타데이터, 저 카디널리티는 dimension, 고 카디널리티는 일반 필드(로그 검색은 되지만 메트릭 dim은 아님). AWS Lambda Powertools가 자동 생성. Lambda는 EMF의 가장 일반적 사용처.

---

**문제 7.** Anomaly Detection 알람을 설정한 직후 5일간 알람이 한 번도 안 울린다. 가능한 원인은?

A) IAM 권한 부족
B) 최소 2주 학습 데이터가 필요하며, 학습 중에는 베이스라인이 불안정 — 데이터 누적 후 정확도 향상
C) Anomaly Detection 비활성
D) 메트릭이 안 들어옴

**정답: B**
해설: `ANOMALY_DETECTION_BAND`는 최소 2일~2주 데이터로 학습. 학습 데이터 누적 전에는 베이스라인이 매우 넓거나 부정확해 알람이 평가는 되지만 실용적인 알람 발화는 어렵다. 운영자는 신규 메트릭에 즉시 Anomaly Detection 적용하지 말고 데이터 누적 후 활성화.

---

**문제 8.** Cross-Account로 50개 계정의 ERROR 로그를 중앙에서 실시간 분석하려 한다. 가장 적합한 패턴은?

A) 각 계정에서 매일 S3로 export → 중앙 Athena
B) 각 계정 Log Group에 Subscription Filter → Cross-Account Kinesis Data Streams (중앙 계정의 Log Destination) → 중앙 OpenSearch
C) CloudTrail만으로 충분
D) EventBridge로 모두 통합

**정답: B**
해설: 실시간 요구사항 → Subscription Filter + Cross-Account Kinesis가 표준. 소스 계정에서 Logs Destination 자원 생성(중앙 계정에 위치), Destination Policy로 소스 계정의 `logs:PutSubscriptionFilter` 허용, 중앙 OpenSearch에서 Kibana로 통합 검색. 또는 CloudWatch Cross-Account Observability(2022)로 더 간단히 구성 가능.

---

**문제 9.** 회사가 Lambda 함수 코드를 수정하지 않고 ERROR 카운트 메트릭을 만들어야 한다. 어떤 방법이 적합한가?

A) Lambda 코드 수정 후 EMF
B) Metric Filter로 `/aws/lambda/<함수명>` Log Group에 ERROR 패턴 적용. `DefaultValue: 0` 설정
C) PutMetricData
D) Anomaly Detection

**정답: B**
해설: 코드 수정 불가 → Metric Filter가 정답. 기존 로그 패턴(`?ERROR ?Exception ?CRITICAL`)을 매칭해 자동 메트릭 발행. 단 forward-only(과거 로그 미적용), `DefaultValue: 0` 설정해 매치 없을 때도 0을 발행.

---

**문제 10.** 운영팀이 응답 시간 SLO를 p99 < 1초로 정의했다. 알람 설정 시 가장 적절한 통계는?

A) Average
B) Sum
C) p99 (Extended Statistic)
D) Maximum

**정답: C**
해설: SLO가 p99 기준이라면 알람도 p99로 평가해야 일관. CloudWatch는 알람의 ExtendedStatistic으로 `p50`, `p90`, `p95`, `p99`, `p99.9` 등 백분위 지원. Average는 long tail 숨김, Maximum은 단일 outlier에 흔들림. SLO와 alarm은 같은 통계로 통일.

---

**문제 11.** VPC가 큰 회사에서 VPC Flow Logs를 모두 CloudWatch Logs로 보냈더니 월 비용이 \$20,000을 넘었다. 가장 효과적인 비용 절감은?

A) Log Group 보존 기간 축소
B) VPC Flow Logs Destination을 CloudWatch Logs에서 S3로 변경. 분석은 Athena. 실시간 알림이 꼭 필요한 일부 패턴만 CloudWatch에 sample
C) Subscription Filter 추가
D) Detailed Monitoring 끄기

**정답: B**
해설: CloudWatch Logs Ingestion(\$0.76/GB) → S3(\$0.025/GB)로 30배 차이. 분석은 Athena(\$5/TB)로 Insights보다 저렴. Hybrid 패턴(대량 S3 + 핵심만 CloudWatch)도 흔하다. Log Group 보존 축소만으론 Ingestion 비용을 못 줄인다.

---

**문제 12.** 한 회사의 운영자가 7년 보존 의무가 있는 감사 로그의 비용을 최소화하려고 한다. 표준 패턴은?

A) CloudWatch Logs에 7년 보존 설정
B) Subscription Filter → Kinesis Firehose → S3 Standard 1년 → S3 Glacier Deep Archive 6년 lifecycle. Athena로 ad-hoc 검색
C) DynamoDB로 이전
D) Lambda로 매일 백업

**정답: B**
해설: CloudWatch Logs Storage(\$0.033/GB) vs Glacier Deep Archive(\$0.00099/GB). 33배 차이. S3 lifecycle 정책으로 자동 전환·만료. Athena Glacier integration으로 필요 시 restore 후 검색 가능. 운영자가 보존 비용을 줄이는 가장 큰 단일 변경.

---

## 다음 주 예고 (Week 3)

Week 3는 모니터링 심화 — **Alarms, Dashboards, Agent, Synthetics·RUM·X-Ray** 입니다.

- Day 1: CloudWatch Alarms 심화 — Composite, Anomaly Detection 알람, M of N 평가, Treat Missing Data, Action Suppressor
- Day 2: Dashboards & 자동 새로고침, Cross-Account / Cross-Region 위젯, Live View
- Day 3: CloudWatch Agent — 메모리/디스크 메트릭, statsd / collectd 통합, journald / Windows Event Log
- Day 4: Synthetics Canary, RUM, ServiceLens, X-Ray trace 분석, Application Signals
- Day 5: Week 3 복습 + 시나리오 10문제

Week 2가 "데이터 수집"이라면 Week 3는 "알림과 가시화". 운영자가 매일 보는 화면들이고, SOA-C02에서 시나리오가 가장 많이 나오는 영역입니다.
