# Day 2 - CloudWatch Logs - 그룹/스트림, Subscription, Insights

📅 날짜: Week 10 (Day 2)
🎯 주제: 로그 수집·검색·라우팅의 표준
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Log Group과 Log Stream 구조 + Retention 정책
- Subscription Filter로 실시간 라우팅 (Lambda/Kinesis/Firehose)
- Logs Insights 쿼리 패턴
- Live Tail, Metric Filter, Cross-Account Logs

---

## 🧩 사전 지식 (CS 기초)

- **Log Aggregation**: 분산 로그를 중앙 수집.
- **Structured Logging**: JSON 등 구조화 로그. 검색·집계 용이.
- **Subscription Filter**: 실시간 매칭 + 라우팅.
- **Cold storage**: 오래된 로그를 저비용 저장소(S3 Glacier 등)로.

---

## 📖 이론 내용

### 1. Log Group / Log Stream

- **Log Group**: 일반적 어플리케이션/서비스 단위 (예: `/aws/lambda/MyFn`, `/ecs/checkout`)
- **Log Stream**: 단일 소스 (Lambda 함수 인스턴스, EC2 인스턴스 등)
- 로그 이벤트는 stream에 시간순 적재

### 2. Retention

```bash
aws logs put-retention-policy \
  --log-group-name /aws/lambda/MyFn \
  --retention-in-days 14
```

값: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653 (또는 무제한)

> ⚠️ **함정**: 기본 Retention은 **Never Expire** — 로그 비용이 누적. 명시적 retention 설정 필수.

### 3. Subscription Filter

실시간 매칭 + 라우팅:
```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name ErrorAlerts \
  --filter-pattern '?ERROR ?Exception' \
  --destination-arn arn:aws:lambda:...:function:ErrorRouter
```

대상:
- Lambda
- Kinesis Data Streams
- Kinesis Data Firehose (S3/Splunk/OpenSearch로 적재)

**Filter Pattern 구문:**
- 단순: `"ERROR"` — ERROR 문자열 포함
- 다중: `?ERROR ?WARN` — OR
- JSON: `{ $.statusCode = 500 }` — JSON 키-값 매칭
- 공간 구분 필드: `[user, , status_code = 500, ...]`

### 4. Metric Filter

로그에서 메트릭 추출:
```bash
aws logs put-metric-filter \
  --log-group-name /var/log/nginx/access.log \
  --filter-name 5xxCount \
  --filter-pattern '[ip, id, user, time, request, status_code=5*, ...]' \
  --metric-transformations 'metricName=5xxErrors,metricNamespace=NginxLogs,metricValue=1'
```

→ CloudWatch Metric → Alarm.

> 💡 EMF가 모던 답이지만, 외부 로그(NGINX, syslog) 처리에는 Metric Filter가 표준.

### 5. CloudWatch Logs Insights

```
fields @timestamp, @message
| filter @message like /ERROR/
| filter level = "error"
| stats count() by service
| sort count desc
| limit 20
```

**주요 명령:**
- `fields`: 표시할 필드
- `filter`: WHERE 조건
- `stats`: 집계 (count, sum, avg, percentile)
- `sort`: 정렬
- `limit`: 결과 수
- `parse`: 정규식으로 필드 추출

**시간 범위**: 지정해야 함 (5분 ~ 사용자 정의)
**최대 데이터**: 쿼리당 ~수십 GB

### 6. Live Tail

실시간 로그 스트림 (콘솔 또는 CLI):
```bash
aws logs start-live-tail \
  --log-group-identifiers arn:aws:logs:...:log-group:/aws/lambda/MyFn \
  --log-stream-name-prefixes "2026/05/22"
```

10분 / 시간 제한. 트러블슈팅에 유용.

### 7. Cross-Account Logs

**Subscription Destination (Recipient Account):**
```bash
aws logs put-destination \
  --destination-name CrossAcctDest \
  --target-arn arn:aws:kinesis:...:stream/CentralLogStream \
  --role-arn arn:aws:iam::...:role/CWLogsToKinesisRole

aws logs put-destination-policy \
  --destination-name CrossAcctDest \
  --access-policy '{...allow source account...}'
```

**Source Account:**
```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name CentralizeLogs \
  --filter-pattern '' \
  --destination-arn arn:aws:logs:...:destination:CrossAcctDest
```

**Cross-Account Observability (2023+, 더 단순):**
- Monitoring Account가 Sink ARN 등록 → Source Account가 신뢰
- 콘솔에서 통합 조회

### 8. 로그 S3 export

- Cold storage용 일회성 export: `aws logs create-export-task`
- 실시간은 Kinesis Firehose Subscription Filter

---

## 🧠 알아두면 좋은 심화 이론

### Log 형식 — 구조화

Lambda Powertools, Winston, Python logging의 JSON formatter로 구조화 로그:
```json
{"level":"error","ts":"2026-05-22T08:14:01Z","service":"checkout","msg":"order failed","order_id":"abc","status":500}
```

Logs Insights에서 JSON 자동 파싱 → 풍부한 필터/집계.

### Tail-based vs Insights Query

- Tail: 실시간 디버깅
- Insights: 사후 분석 + 통계
- 둘 다 같은 데이터, 다른 인터페이스

### Log Pricing

- Ingestion: GB당 약 $0.50 (리전 다름)
- Storage: GB-Month 약 $0.03 (S3 GLACIER 대비 비쌈)
- Insights 쿼리: 스캔 GB당 ~$0.005
- → 로그가 비쌈. Retention 짧게 + S3로 cold 이전이 표준.

### Lambda → CloudWatch Logs 자동

- Lambda Execution Role에 `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` 필요
- 첫 호출 시 자동 Log Group 생성
- `/aws/lambda/<function-name>` 명명 규칙

### 관련 서비스 Cross-Reference

- **OpenSearch** → Week 11 Day 4 (로그 분석 강력)
- **Kinesis Firehose** → Week 11
- **Cross-Account Sharing** → Week 10 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
CloudWatch Logs Pipeline
==================================================

  Sources
   ├─ Lambda (auto)
   ├─ ECS (awslogs driver)
   ├─ EC2 (CloudWatch Agent)
   ├─ API Gateway, VPC Flow Logs, CloudTrail
   └─ App-PutLogEvents API

         ▼
  Log Group (retention configured)
   └─ Log Streams (per source instance)

         ▼ Subscription Filter (real-time)
  ┌─ Lambda (custom processing)
  ├─ Kinesis Data Streams (high throughput fan-out)
  └─ Kinesis Firehose
       ├─ S3 (cold)
       ├─ OpenSearch (search)
       └─ Splunk/Datadog (external)

         ▼ Metric Filter
  CloudWatch Metric → Alarm

         ▼ Logs Insights / Live Tail
  Operator queries

  Cross-Account:
   Log Destination in central account
   Source accounts' subscription filters point to destination
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ 기본 Retention은 무제한 — 명시적 설정 필수
2. ⭐ Subscription Filter로 Lambda/Kinesis/Firehose 실시간 라우팅
3. ⭐ Metric Filter로 로그 → 메트릭 (외부 로그 형식에 유용)
4. ⭐ Logs Insights는 사후 분석, Live Tail은 실시간 디버깅
5. ⭐ 로그 비용 통제: 짧은 Retention + S3 cold + 구조화 로그

---

## 💻 실제 예시 - 전체 파이프라인

```bash
# 1) Log Group + Retention
aws logs put-retention-policy --log-group-name /aws/lambda/MyFn --retention-in-days 14

# 2) Subscription Filter → Firehose → S3
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name ToS3 \
  --filter-pattern '' \
  --destination-arn arn:aws:firehose:...:deliverystream/ToS3 \
  --role-arn arn:aws:iam::...:role/CWLogsToFirehose

# 3) Metric Filter
aws logs put-metric-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name OrderFailures \
  --filter-pattern '{ $.event = "order_failed" }' \
  --metric-transformations metricName=OrderFailures,metricNamespace=MyApp,metricValue=1

# 4) Insights 쿼리
aws logs start-query \
  --log-group-name /aws/lambda/MyFn \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    fields @timestamp, @message
    | filter level = "error"
    | stats count() by service
    | sort count desc
  '
```

---

## 📝 연습 문제

**문제 1.** CloudWatch Logs 기본 retention은?
A) 30일
B) 무제한 (Never Expire) — 명시적 설정 필요
C) 7일
D) 90일

**정답: B**

**문제 2.** 로그를 실시간으로 OpenSearch에 적재하려면?
A) Subscription Filter → Kinesis Firehose → OpenSearch
B) 매시간 export
C) Lambda 폴링
D) S3 동기화

**정답: A**

**문제 3.** Metric Filter의 용도는?
A) 로그 검색
B) 로그 라인에서 메트릭 추출 → CloudWatch Metric/Alarm
C) Retention 설정
D) Log Stream 생성

**정답: B**

**문제 4.** Logs Insights의 한계는?
A) 실시간 스트림
B) 쿼리당 데이터 스캔 한도 + 시간 범위 지정 필요
C) JSON 미지원
D) Subscription 미지원

**정답: B**

**문제 5.** 외부 NGINX 로그에서 5xx만 알람으로 만들려면?
A) Subscription Filter
B) Metric Filter `[..., status_code=5*, ...]` + CloudWatch Alarm
C) Lambda 매번 호출
D) Insights 정기 쿼리

**정답: B**

**문제 6.** Cross-Account 로그 중앙 집계의 모던 방법은?
A) Subscription Filter + Log Destination (Kinesis)
B) CloudWatch Cross-Account Observability (Sink ARN, 2023+)
C) S3 복사
D) A·B 둘 다

**정답: D**

**문제 7.** 로그 비용을 통제하는 가장 직접적 방법은?
A) Retention 짧게 + S3로 cold export + 구조화 로그로 양 감소
B) Region 변경
C) IAM 권한 축소
D) Lambda Layer

**정답: A**

---

## 📌 오늘의 요약

1. 기본 Retention 무제한 — 명시 설정 필수
2. Subscription Filter로 실시간 Lambda/Kinesis/Firehose 라우팅
3. Metric Filter로 외부 로그 형식 → 메트릭/알람
4. Logs Insights(사후 분석) + Live Tail(실시간)
5. 비용 통제: Retention + S3 cold + 구조화 로그
