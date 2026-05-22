# Day 5 - Week 2 복습 + 시나리오 10문제

📅 날짜: Week 2 (Day 5)
🎯 주제: CloudWatch Metrics·Logs·Insights 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 2 핵심 개념 한 줄 요약

1. **Metrics 모델**: Namespace + MetricName + Dimensions + Timestamp + Value. Dimension 카디널리티 폭발 주의
2. **EC2 메모리/디스크는 Agent 필요** — 표준 메트릭에 없음
3. **Custom Metric은 $0.30/메트릭/월** — user_id 같은 고카디널리티 Dimension 금지
4. **Detailed Monitoring = 1분 간격**, 인스턴스당 $2.10/월. Basic은 5분
5. **메트릭 보존 15개월** — 자동 집계 (1분→5분→1시간). 그 이후 삭제
6. **Log Group 기본 Retention = Never Expire** — 운영자 1순위 점검 항목
7. **Subscription Filter로 실시간 로그 처리** — Lambda/Kinesis/Firehose/OpenSearch
8. **Logs Insights**: SQL-like 쿼리. 5대 명령(fields/filter/stats/sort/limit) + `parse`/`bin()`
9. **Metric Filter는 사후 로그만 적용** (forward-only). EMF는 stdout 한 번에 로그+메트릭
10. **Anomaly Detection**: 2주 학습 후 ML 기반 정상 밴드 판정. 변동성 큰 메트릭에 적합

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | Metric Filter | EMF | PutMetricData | Anomaly Detection |
|------|---------------|-----|---------------|-------------------|
| 발행 시점 | 로그 매칭 시 자동 | 로그 출력 시 자동 | API 직접 호출 | 기존 메트릭에 추가 |
| 지연 | ~30초 | ~수초 | 실시간 | 학습 2주 후 적용 |
| 추가 비용 | 메트릭당 $0.30 | 메트릭당 $0.30 | API 호출 + 메트릭 | $0.30 + 학습 |
| 사용 사례 | 레거시 앱 | Lambda·신규 | 외부 시스템 | 변동성 큰 메트릭 |

| 항목 | CloudWatch Logs | CloudTrail Logs |
|------|-----------------|-----------------|
| 목적 | 애플리케이션·시스템 로그 | API 호출 감사 |
| 보존 | 1일~10년 또는 영구 | 90일 무료 + S3 영구 |
| 비용 | Ingestion + Storage | Management Event 무료 |
| 분석 | Logs Insights | CloudTrail Lake / Athena |

| 항목 | Basic Monitoring | Detailed Monitoring |
|------|------------------|---------------------|
| 간격 | 5분 | 1분 |
| 비용 | 무료 | $2.10/월/인스턴스 |
| 활성화 | 자동 | 수동 |
| 사용 사례 | 일반 | Auto Scaling 빠른 반응, 정밀 |

---

## 📝 시나리오 10문제

**문제 1.** EC2 Auto Scaling Group이 CPU 70% 초과 시 스케일 아웃하도록 설정했지만, 트래픽 급증 시 반응이 느려 5분간 응답 지연이 발생한다. 가장 큰 원인은?

A) EC2 인스턴스 유형이 작다
B) 기본 Monitoring이 5분 간격이라 CPU 초과 감지가 늦음 → Detailed Monitoring 활성화 필요
C) Alarm Period가 너무 길다
D) Auto Scaling Cooldown 문제

**정답: B**
해설: 5분 간격 메트릭은 알람 평가도 5분 주기 → 트래픽 급증 감지 지연. Detailed Monitoring(1분)으로 변경하면 1~2분 내 스케일 아웃 시작. Period도 1분으로 조정 필요.

---

**문제 2.** 회사의 CloudWatch Logs 비용이 3개월 만에 5배 증가했다. 가장 먼저 점검할 항목은?

A) 알람 개수
B) Log Group의 Retention 설정 + 영구 보존 그룹 식별
C) Subscription Filter
D) CloudWatch Agent 설정

**정답: B**
해설: 기본 Retention = Never Expire. 6개월 후 Storage 비용 누적 폭발. `describe-log-groups`로 `retentionInDays` None인 그룹 일괄 점검 후 적절한 retention 설정.

---

**문제 3.** Lambda 함수의 콜드 스타트 빈도를 운영자가 추적하려 한다. Logs Insights 쿼리로 가장 적절한 것은?

A) `filter @message like /COLD/`
B) `filter @type = "REPORT" | stats count(*) as total, count(@initDuration) as cold by bin(1h)`
C) `select cold_start_count from logs`
D) Logs Insights 불가

**정답: B**
해설: Lambda는 콜드 스타트 시 REPORT 라인에 `@initDuration` 필드가 있고, 웜 스타트엔 없음. `count(@initDuration)` = 콜드 스타트 수. 시간 단위 집계로 비율 추적.

---

**문제 4.** 사용자별 API 호출 횟수를 추적하려 한다. 가장 비용 효율적인 패턴은?

A) `UserId`를 Custom Metric Dimension으로 사용
B) 로그에 user_id 출력 → Logs Insights로 `stats count(*) by user_id` 분석
C) DynamoDB에 카운터 저장
D) CloudWatch Anomaly Detection

**정답: B**
해설: 사용자 수가 많을수록 Dimension 카디널리티 폭발 → 비용 폭증. user_id는 로그에 남기고 필요 시 Insights로 분석. 또는 EMF에서 user_id를 일반 필드로(메트릭 Dimension X).

---

**문제 5.** 회사가 API 5xx 에러를 ALB Access Logs에서 추출해 알람을 보내려 한다. 가장 적합한 흐름은?

A) ALB는 access log를 CloudWatch에 직접 전송 안 함 → S3에 보내고 Lambda로 처리 또는 ALB 표준 메트릭 `HTTPCode_Target_5XX_Count` 사용
B) Logs Insights로만 가능
C) CloudWatch Agent로 ALB 로그 수집
D) Subscription Filter

**정답: A**
해설: ALB Access Logs는 S3에만 저장. 단, ALB는 CloudWatch에 `HTTPCode_Target_5XX_Count` 등 표준 메트릭 자동 발행 → 이걸로 알람 만드는 게 정석. 상세 분석이 필요하면 S3 + Athena.

---

**문제 6.** 회사가 새 마이크로서비스를 배포하면서 처음부터 EMF를 도입하려 한다. 다음 중 EMF의 올바른 사용은?

A) `_aws.CloudWatchMetrics` 필드에 메트릭 정의 + 같은 JSON에 컨텍스트 필드 추가
B) PutMetricData를 EMF 형식으로 호출
C) Lambda는 EMF 사용 불가
D) S3에 JSON 저장

**정답: A**
해설: EMF의 핵심. `_aws.CloudWatchMetrics`로 메트릭 메타데이터, 일반 필드는 메트릭 값 + 로그 컨텍스트. AWS Lambda Powertools 라이브러리가 자동 생성해줌.

---

**문제 7.** Anomaly Detection 알람을 설정한 직후 5일간 알람이 한 번도 안 울린다. 가능한 원인은?

A) IAM 권한 부족
B) 최소 2주 학습 기간 필요 — 그 동안엔 알람 미발화
C) Anomaly Detection 비활성
D) 메트릭이 안 들어옴

**정답: B**
해설: ANOMALY_DETECTION_BAND는 최소 2주 데이터로 학습. 그 전엔 정상 밴드가 산출되지 않아 알람 평가 X. 학습 후 정확도 점점 향상.

---

**문제 8.** Cross-Account로 여러 계정의 ERROR 로그를 중앙에서 실시간 분석하려 한다. 가장 적합한 패턴은?

A) 각 계정에서 S3로 export → 중앙 Athena
B) 각 계정 Log Group에 Subscription Filter → Cross-Account Kinesis Data Streams → 중앙 OpenSearch
C) CloudTrail
D) EventBridge

**정답: B**
해설: 실시간 요구사항 → Subscription Filter + Cross-Account Kinesis. Source 계정에서 Logs Destination 자원 생성, Destination 계정의 Kinesis는 IAM Role로 수신. 중앙에서 OpenSearch나 Lambda로 분석.

---

**문제 9.** 회사가 Lambda 함수 코드를 수정하지 않고 ERROR 카운트 메트릭을 만들어야 한다. 어떤 방법이 적합한가?

A) Lambda 코드 수정 후 EMF
B) Metric Filter로 `/aws/lambda/<함수명>` Log Group에 ERROR 패턴 적용
C) PutMetricData
D) Anomaly Detection

**정답: B**
해설: 코드 수정 불가 → Metric Filter. 기존 로그 패턴(예: "ERROR")을 매칭해 자동으로 Custom Metric 발행. 단, 과거 로그는 변환 X.

---

**문제 10.** 운영팀이 응답 시간 SLO를 p99 < 1초로 정의했다. 알람 설정 시 가장 적절한 통계는?

A) Average
B) Sum
C) p99
D) Maximum

**정답: C**
해설: SLO가 p99 기준이라면 알람도 p99로 평가해야 일관. CloudWatch는 알람의 ExtendedStatistic으로 `p50`, `p90`, `p99` 등 백분위 지원. Maximum은 outlier 한 건에 흔들림.

---

## 🔮 다음 주 예고 (Week 3)

Week 3는 모니터링 심화 — **Alarms, Dashboards, Agent, Synthetics/RUM** 입니다.

- Day 1: CloudWatch Alarms - Composite, Anomaly Detection, M of N 평가
- Day 2: Dashboards & 자동 새로고침, Cross-Account/Cross-Region 위젯
- Day 3: CloudWatch Agent - 메모리/디스크 메트릭, 통합 로그 수집
- Day 4: Synthetics Canary, RUM, ServiceLens, X-Ray
- Day 5: Week 3 복습 + 시나리오 10문제

> 💡 Week 2가 "데이터 수집"이라면 Week 3는 "알림과 가시화". 실제 운영자가 매일 보는 화면들입니다.
