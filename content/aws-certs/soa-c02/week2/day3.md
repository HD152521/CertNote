# Day 3 - CloudWatch Logs Insights (쿼리 문법, 트러블슈팅 패턴)

📅 날짜: Week 2 (Day 3)
🎯 주제: Logs Insights로 로그를 빠르게 분석하는 실전 쿼리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Logs Insights 쿼리 문법 5대 명령(`fields`, `filter`, `stats`, `sort`, `limit`)을 익힌다
- JSON 로그에서 중첩 필드 추출, 시간 함수 활용법을 안다
- 운영자가 즉시 쓰는 트러블슈팅 쿼리 패턴 10가지를 외운다

---

## 🧩 사전 지식 (CS 기초)

- **SQL의 SELECT - FROM - WHERE - GROUP BY - ORDER BY - LIMIT 순서**: Logs Insights도 비슷
- **Schema-on-read**: 데이터 저장 시점이 아니라 조회 시점에 구조를 해석. JSON 로그에 유리
- **Aggregation functions**: count, sum, avg, min, max, percentile
- **Regex**: 정규식. Logs Insights는 일부 함수에서 regex 지원
- **Index**: 로그는 시간 기준으로 자동 정렬. Insights는 별도 인덱스 없음 → 전체 스캔

---

## 📖 이론 내용

### 1. Logs Insights 기본 구조

```
fields @timestamp, @message, @logStream
| filter level = "ERROR"
| sort @timestamp desc
| limit 20
```

#### 자동 제공 필드
- `@timestamp`: 이벤트 발생 시각
- `@message`: 원본 메시지 (JSON이면 자동 파싱)
- `@logStream`: 어느 Log Stream에서 왔는지
- `@log`: Log Group ARN
- `@ingestionTime`: CloudWatch에 도착한 시각

#### 5대 핵심 명령

| 명령 | 역할 | SQL 비유 |
|------|------|----------|
| `fields` | 추출할 필드 지정 + 계산 필드 생성 | SELECT |
| `filter` | 조건 필터링 | WHERE |
| `stats` | 집계 (count, sum, avg, ...) | GROUP BY + 집계 |
| `sort` | 정렬 | ORDER BY |
| `limit` | 결과 수 제한 | LIMIT |

### 2. JSON 로그 파싱

Lambda 등이 출력하는 JSON 로그는 자동으로 파싱되어 점 표기로 접근:

```json
{ "level": "ERROR", "user": { "id": "u123" }, "duration_ms": 234 }
```

```
fields level, user.id as uid, duration_ms
| filter level = "ERROR"
| stats count(*) by uid
```

#### `parse` 명령으로 비정형 로그 파싱

```
fields @timestamp, @message
| parse @message "[*] *: *" as level, component, msg
| filter level = "ERROR"
| stats count(*) by component
```

### 3. 시간 함수와 빈 구간 채우기

```
fields @timestamp, @message
| filter level = "ERROR"
| stats count(*) by bin(5m)
```
- `bin(5m)`: 5분 단위로 시간 버킷 묶음
- 단위: `s`, `m`, `h`, `d`

#### 시간 비교 / 차이

```
fields @timestamp, duration
| filter duration > 1000
| sort @timestamp desc
```

### 4. 통계·집계 함수

| 함수 | 설명 |
|------|------|
| `count(*)` | 행 수 |
| `count_distinct(f)` | 고유 값 수 |
| `sum(f)`, `avg(f)`, `min(f)`, `max(f)` | 기본 통계 |
| `pct(f, 95)` | 백분위수 (p95) |
| `stddev(f)` | 표준편차 |
| `earliest(f)`, `latest(f)` | 시간순 처음/마지막 값 |

### 5. 운영자가 매일 쓰는 쿼리 패턴 10가지

#### ① Lambda 에러 상위 함수 찾기
```
fields @timestamp, @message
| filter @message like /ERROR/
| stats count(*) as error_count by @log
| sort error_count desc
| limit 10
```

#### ② API Gateway 5xx 응답 추적
```
fields @timestamp, status, path, ip
| filter status >= 500
| stats count(*) by path
| sort count(*) desc
```

#### ③ Lambda 콜드 스타트 비율
```
fields @timestamp, @initDuration
| stats count(*) as total, count(@initDuration) as cold by bin(1h)
| display @timestamp, cold/total*100 as cold_pct
```

#### ④ 가장 느린 요청 Top 20
```
fields @timestamp, @duration, @requestId
| sort @duration desc
| limit 20
```

#### ⑤ 사용자별 에러 발생 횟수
```
filter level = "ERROR"
| stats count(*) as err_cnt by user_id
| sort err_cnt desc
| limit 20
```

#### ⑥ 시간대별 에러 추이 (5분 빈)
```
filter level = "ERROR"
| stats count(*) as errors by bin(5m)
```

#### ⑦ 메모리 사용률 p95 (Lambda)
```
filter @type = "REPORT"
| stats pct(@maxMemoryUsed, 95) / 1024 / 1024 as p95_mb by bin(5m)
```

#### ⑧ 특정 RequestId 풀 트레이스
```
filter @requestId = "abc-123-def"
| sort @timestamp asc
```

#### ⑨ 정규식으로 IP 추출
```
fields @message
| parse @message /(?<ip>\d+\.\d+\.\d+\.\d+)/
| stats count(*) by ip
| sort count(*) desc
```

#### ⑩ Throttle 발생 추적
```
filter @message like /Throttl|RateExceeded|TooManyRequests/
| stats count(*) by bin(1m)
```

### 6. 쿼리 비용·성능

- **비용**: 스캔한 데이터 GB당 $0.0076
- **시간 범위가 작을수록 빠르고 저렴**
- 자주 쓰는 쿼리는 **저장** 가능 (콘솔/CLI)
- 한 번에 **여러 Log Group 동시 쿼리** 가능 (최대 50개)

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Cross-Account Insights** | Logs Insights는 Cross-Account 쿼리 지원 | 멀티 계정 분석 |
| **Saved Queries** | 자주 쓰는 쿼리 저장 | 운영 효율 |
| **Insights → Dashboard** | 쿼리 결과를 대시보드에 위젯으로 | 시각화 |
| **불완전한 JSON** | 파싱 실패 시 `@message` raw 그대로 표시 | 디버깅 |
| **`display`** | `fields`를 후행 사용 (`stats` 다음에도 OK) | 출력 컬럼 재구성 |

> ⚠️ **함정 1**: Logs Insights는 **인덱스가 없어** 시간 범위가 길수록 비용·시간 증가. 항상 가능한 작은 범위로.
>
> ⚠️ **함정 2**: 한 쿼리에 최대 50 Log Group, 결과는 최대 10,000행.
>
> 💡 **암기 팁**: 운영자 무기는 "filter → parse → stats by bin(N) → sort". 이 순서를 기본 reflex로.

### 관련 서비스 Cross-Reference

- **Insights → Week 2 Day 4** (EMF로 메트릭 추출하면 Insights도 함께 활용)
- **Insights → Week 3** (대시보드 위젯)
- **Insights → Week 4** (CloudTrail Lake로 SQL 쿼리 — 별도 서비스지만 비슷)
- **Insights → Week 8** (VPC Flow Logs 분석)

---

## 🏗️ 아키텍처 다이어그램

```
Insights 쿼리 흐름
================================================

  Log Groups (다수 선택 가능, 최대 50개)
       │
       ▼
  ┌─────────────────────────────┐
  │  Logs Insights 쿼리 엔진     │
  │  - 시간 범위 필터            │
  │  - 자동 JSON 파싱            │
  │  - 명령 파이프라인 실행      │
  └────┬────────────────────────┘
       ▼
  결과 테이블 (최대 10,000행)
       │
       ├─→ 콘솔 시각화 (Bar, Line, Pie)
       ├─→ Dashboard 위젯 추가
       ├─→ CSV/JSON 다운로드
       └─→ 저장 (Saved Query)

비용 = 스캔 GB × $0.0076
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **JSON 로그는 자동 파싱** — `user.id` 같이 점 표기 접근 가능
2. ⭐ **`stats ... by bin(5m)`** — 시간 단위 집계의 핵심 패턴
3. ⭐ **`parse @message "패턴" as ...`** — 비정형 로그를 구조화
4. ⭐ **쿼리 비용 = 스캔 GB × $0.0076** — 시간 범위 좁히기가 가장 중요
5. ⭐ **최대 50 Log Group 동시 쿼리** — 멀티 서비스 트레이싱에 활용

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Insights 쿼리 실행 (시작)
QUERY_ID=$(aws logs start-query \
  --log-group-name /aws/lambda/order-service \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20' \
  --query 'queryId' --output text)

echo "Query ID: $QUERY_ID"

# 2. 결과 확인 (Complete까지 폴링)
aws logs get-query-results --query-id $QUERY_ID

# 3. 여러 Log Group 동시 쿼리
aws logs start-query \
  --log-group-names "/aws/lambda/order" "/aws/lambda/payment" "/aws/lambda/notification" \
  --start-time $(date -d '30 min ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    fields @log, @timestamp, @message
    | filter @message like /ERROR/
    | stats count(*) as err_cnt by @log
    | sort err_cnt desc
  '

# 4. p95 응답시간 시간대별 추이
aws logs start-query \
  --log-group-name /aws/apigateway/welcome \
  --start-time $(date -d '6 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    fields @timestamp, responseLatency
    | filter ispresent(responseLatency)
    | stats pct(responseLatency, 95) as p95 by bin(15m)
    | sort @timestamp asc
  '

# 5. RequestId로 풀 트레이스 (Lambda)
aws logs start-query \
  --log-group-name /aws/lambda/order-service \
  --start-time $(date -d '1 day ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    fields @timestamp, @message
    | filter @requestId = "abc-123-def"
    | sort @timestamp asc
  '
```

---

## 📝 연습 문제

**문제 1.** Lambda 함수의 JSON 로그에서 `level=ERROR`인 항목 수를 함수별로 집계하려면?

A) `filter level="ERROR" | stats count(*)`
B) `filter level="ERROR" | stats count(*) by @log`
C) `select count(*) from logs where level="ERROR"` (SQL 문법)
D) `count where level=ERROR`

**정답: B**
해설: `@log`는 Log Group 식별자(ARN). Lambda는 함수당 한 Log Group이라 `by @log`가 곧 함수별 집계.

---

**문제 2.** Logs Insights 쿼리의 비용 모델은?

A) 쿼리 횟수당 고정 요금
B) 결과 행 수당 요금
C) 스캔한 데이터 양(GB)당 $0.0076
D) 무료

**정답: C**
해설: 쿼리한 시간 범위 × Log Group 크기만큼 GB 스캔 비용 발생. 시간 범위를 좁히는 게 가장 큰 비용 절감.

---

**문제 3.** 5분 단위로 에러 발생 추이를 보고 싶다. 올바른 쿼리는?

A) `filter level="ERROR" | stats count(*) by 5m`
B) `filter level="ERROR" | stats count(*) by bin(5m)`
C) `filter level="ERROR" | group 5min`
D) `filter level="ERROR" | window 5m count(*)`

**정답: B**
해설: `bin(N)` 함수가 시간 버킷팅 표준. 단위는 `s`/`m`/`h`/`d`.

---

**문제 4.** 비정형 로그 `2026-05-22 10:00:00 [ERROR] OrderService: Connection failed`에서 컴포넌트별 에러 수를 집계하려면?

A) `filter @message like /ERROR/`만으로 충분
B) `parse @message "* [*] *: *" as ts, level, component, msg | filter level = "ERROR" | stats count(*) by component`
C) JSON 파싱
D) Logs Insights 불가, S3 export 후 Athena

**정답: B**
해설: `parse` 명령으로 와일드카드 패턴 추출 후 stats 집계. 정규식 버전 `parse @message /\[(?<level>\w+)\]/`도 가능.

---

**문제 5.** 운영자가 마이크로서비스 5개의 로그를 동시에 분석하려 한다. Logs Insights에서?

A) 5개 쿼리를 순차 실행
B) 한 쿼리에 최대 50개 Log Group 지정 가능
C) Cross-Region이라 불가
D) Athena로 변환 필요

**정답: B**
해설: `start-query --log-group-names ...`에 최대 50개 Log Group 지정 가능. 한 쿼리로 다중 서비스 트레이싱 표준 패턴.

---

## 📌 오늘의 요약

1. Logs Insights 5대 명령: `fields`, `filter`, `stats`, `sort`, `limit` (+ `parse`, `display`)
2. JSON 로그는 자동 파싱되어 점 표기로 접근. 비정형은 `parse`로 구조화
3. `stats ... by bin(N)`이 시간 단위 집계의 핵심 패턴
4. 쿼리 비용 = 스캔 GB × $0.0076. 시간 범위를 좁히는 게 가장 큰 절감 요소
5. 최대 50 Log Group, 10,000행 결과. 멀티 서비스 트레이싱에 활용
