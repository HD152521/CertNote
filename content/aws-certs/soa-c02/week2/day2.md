# Day 2 - CloudWatch Logs (Log Group, Stream, Retention, Subscription)

📅 날짜: Week 2 (Day 2)
🎯 주제: CloudWatch Logs의 구조, 보존 정책, 실시간 처리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Log Group / Log Stream의 계층 구조와 권한 모델을 이해한다
- 로그 보존 정책과 저장 비용 최적화 방법을 안다
- Subscription Filter로 로그를 실시간 처리하는 패턴을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Structured logging**: JSON 등 구조화된 로그. 검색·분석에 유리
- **Log shipping**: 로그를 중앙 저장소로 전송하는 행위. Push vs Pull
- **Append-only log**: 추가만 가능한 로그. 변조 방지에 유리
- **Cold vs Hot storage**: 자주 조회 vs 드물게 조회. 비용·성능 trade-off
- **Backpressure**: 다운스트림이 느릴 때 업스트림을 늦추는 메커니즘. Subscription Filter도 throttling 발생 가능

---

## 📖 이론 내용

### 1. CloudWatch Logs 구조

```
Log Group  /aws/lambda/order-service
    │
    ├── Log Stream  2026/05/22/[$LATEST]abc123  (Lambda 실행 1)
    ├── Log Stream  2026/05/22/[$LATEST]def456  (Lambda 실행 2)
    └── Log Stream  2026/05/22/[$LATEST]ghi789  (Lambda 실행 3)
        │
        ├── 2026-05-22T10:00:00Z  "START RequestId..."
        ├── 2026-05-22T10:00:01Z  "Processing order #1234"
        └── 2026-05-22T10:00:02Z  "END RequestId..."
```

- **Log Group**: 같은 retention/권한/메트릭 필터를 공유하는 컨테이너
- **Log Stream**: 단일 소스(예: 한 EC2 인스턴스, 한 Lambda 실행)의 시계열 로그
- **Log Event**: timestamp + message 쌍

### 2. Log Group 핵심 설정

#### Retention (보존 기간)
- 1일 ~ 10년 또는 영구 (Never expire)
- **기본값: Never expire** → 비용 폭증 주요 원인!
- 시험 단골: "비용 최적화" 키워드 → 적절한 retention 설정

```bash
aws logs put-retention-policy \
  --log-group-name /aws/lambda/order-service \
  --retention-in-days 30
```

#### KMS 암호화
- Log Group 생성 시 또는 사후 KMS Key 연결
- 같은 KMS Key를 여러 Log Group에 재사용 가능
- 사후 disassociate 가능하지만 기존 로그는 여전히 암호화 상태

#### Metric Filter
- 로그 패턴 매칭 → Custom Metric 생성 (Week 2 Day 4에서 자세히)

#### Subscription Filter
- 로그를 실시간으로 다른 서비스에 전송 (아래 자세히)

### 3. 로그 수집 방법

#### EC2: CloudWatch Agent
- 통합 에이전트가 메트릭 + 로그 동시 수집 (Week 3 Day 3 자세히)
- 설정 파일에 수집할 로그 파일 경로 지정

#### Lambda: 자동 수집
- 함수 실행 시 stdout/stderr가 자동으로 `/aws/lambda/<함수명>` Log Group으로
- IAM Role에 `logs:CreateLogStream`, `logs:PutLogEvents` 필요

#### ECS / EKS: awslogs driver / FireLens
- ECS Task Definition에 `logDriver: awslogs` 지정
- 또는 FireLens(Fluent Bit/Fluentd)로 더 유연하게 라우팅

#### VPC / API Gateway / ELB
- 각 서비스 설정에서 CloudWatch Logs 대상 지정
- VPC Flow Logs (Week 8), CloudTrail (Week 4)

### 4. Subscription Filter (실시간 처리)

#### 구조
```
Log Group → Subscription Filter (패턴 매칭) → Destination
                                                ├── Kinesis Data Streams
                                                ├── Kinesis Data Firehose
                                                ├── Lambda
                                                └── OpenSearch (Logs 자체 기능)
```

#### 한도 (시험 주의)
- **Log Group당 최대 2개 Subscription Filter** (단일 destination → 1개 권장)
- Cross-Account 시: Destination 계정에 IAM Role 필요

#### 예시: ERROR 로그를 Lambda로 실시간 전송
```bash
# 1. Lambda 함수에 Logs 호출 권한
aws lambda add-permission \
  --function-name log-error-handler \
  --statement-id "logs-invoke" \
  --action "lambda:InvokeFunction" \
  --principal logs.amazonaws.com \
  --source-arn "arn:aws:logs:ap-northeast-2:123456789012:log-group:/aws/lambda/order-service:*"

# 2. Subscription Filter 생성
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/order-service \
  --filter-name "error-pattern" \
  --filter-pattern "ERROR" \
  --destination-arn "arn:aws:lambda:ap-northeast-2:123456789012:function:log-error-handler"
```

### 5. Log Group 비용 모델

CloudWatch Logs는 3가지로 과금:

| 항목 | 단가 (서울 리전 기준) |
|------|-----------------------|
| **Ingestion** | $0.76 / GB |
| **Storage** | $0.033 / GB-월 |
| **Logs Insights 쿼리** | $0.0076 / GB 스캔 |

**비용 절감 패턴:**
1. **Retention 적절히 설정** (영구 보존은 안티 패턴)
2. **자주 조회 안 하는 로그는 S3로 export** (S3 IA / Glacier 사용)
3. **EMF로 메트릭 추출** → 메트릭만 알람에 사용하고 로그 retention 단축
4. **Log Filter Pattern**: ingestion 줄이기 (Lambda 콘솔 출력 최소화)

### 6. Cross-Account / Cross-Region 로그 집계

#### Subscription Filter Cross-Account
- Source 계정의 Log Group → Destination 계정의 Kinesis로
- Destination은 Cross-Account IAM Role + Logs Destination 자원 필요

#### Logs Export to S3
- One-time 또는 Lambda 스케줄로 정기 export
- 압축된 JSON 형식으로 S3에 저장
- 시험 함정: Export는 **최대 12시간**, 그 이상은 청크로 나눠야

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Log Insights** | SQL-like 쿼리 (Day 3에서 자세히) | 빠른 ad-hoc 분석 |
| **Live Tail** | 실시간 로그 스트리밍 (콘솔/CLI) | 디버깅용 |
| **Anomaly Detection in Logs** | ML 기반 비정상 패턴 자동 탐지 | 신규 기능 |
| **Data Protection Policy** | 민감 정보(PII) 자동 마스킹 | 컴플라이언스 |
| **Log Class - Standard vs Infrequent Access** | IA 클래스는 ingestion 50% 저렴, 일부 기능 제약 | 비용 최적화 |

> ⚠️ **함정 1**: Log Group의 기본 Retention은 **Never Expire** → 비용 폭증 주범. 항상 retention 설정.
>
> ⚠️ **함정 2**: Subscription Filter는 Log Group당 최대 2개 (이전엔 1개였으나 확장됨).
>
> 💡 **암기 팁**: Log 비용 3종 = Ingestion / Storage / Insights Scan. 가장 큰 건 Ingestion. 로그 양을 줄이는 게 1순위.

### 관련 서비스 Cross-Reference

- **Logs → Week 2 Day 3** (Logs Insights 쿼리)
- **Logs → Week 2 Day 4** (Metric Filter, EMF)
- **Logs → Week 4** (CloudTrail이 Logs로 전송)
- **Logs → Week 8** (VPC Flow Logs)

---

## 🏗️ 아키텍처 다이어그램

```
로그 수집·처리·집계 패턴
==========================================================

  [Lambda]    [EC2 + Agent]    [ECS]     [API Gateway]
      │           │              │            │
      └───────────┴──────┬───────┴────────────┘
                         ▼
              ┌─────────────────────┐
              │  CloudWatch Logs    │
              │  Log Group / Stream │
              └─────┬───────────────┘
                    │
        ┌───────────┼───────────┬────────────┐
        ▼           ▼           ▼            ▼
   [Metric Filter] [Subscription] [Insights] [S3 Export]
        │           Filter          │
        ▼              │            ▼
   [Custom Metric] ┌───┴─────┐  [Ad-hoc 쿼리]
        │          ▼         ▼
        ▼      [Lambda]  [Kinesis/Firehose]
   [Alarm]                  │
                            ▼
                       [OpenSearch/S3]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Log Group 기본 Retention = Never Expire** — 비용 폭증 1순위 원인
2. ⭐ **Subscription Filter로 실시간 처리** — Lambda/Kinesis/Firehose/OpenSearch
3. ⭐ **Lambda 로그는 자동 수집** (IAM Role에 logs 권한만 있으면)
4. ⭐ **EC2 로그는 CloudWatch Agent 필요** — 게스트 OS 파일을 수집
5. ⭐ **장기 보관은 S3 export + Glacier** — Logs에 영구 저장은 비싸다

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Log Group 생성 + Retention 30일 + KMS 암호화
aws logs create-log-group \
  --log-group-name /myapp/web-prod \
  --kms-key-id arn:aws:kms:ap-northeast-2:123456789012:key/abc-123

aws logs put-retention-policy \
  --log-group-name /myapp/web-prod \
  --retention-in-days 30

# 2. 로그 이벤트 직접 푸시 (sequence token 필요)
aws logs create-log-stream \
  --log-group-name /myapp/web-prod \
  --log-stream-name "instance-i-abc123"

aws logs put-log-events \
  --log-group-name /myapp/web-prod \
  --log-stream-name "instance-i-abc123" \
  --log-events 'timestamp=1748000000000,message="Application started"'

# 3. 모든 Log Group의 Retention 일괄 점검 (운영 점검)
aws logs describe-log-groups \
  --query 'logGroups[?!retentionInDays].logGroupName' \
  --output table
# → retention이 None(영구)인 Log Group 목록 확인

# 4. 미사용 Log Group 정리 (마지막 이벤트 30일 이전)
aws logs describe-log-groups \
  --query 'logGroups[?storedBytes==`0`].logGroupName' \
  --output text

# 5. Log Group → S3 export 작업
aws logs create-export-task \
  --log-group-name /myapp/web-prod \
  --from $(date -d '90 days ago' +%s)000 \
  --to $(date -d '30 days ago' +%s)000 \
  --destination "my-log-archive-bucket" \
  --destination-prefix "myapp-web-prod"

# 6. Subscription Filter - 에러를 Firehose로
aws logs put-subscription-filter \
  --log-group-name /myapp/web-prod \
  --filter-name "ship-errors-to-firehose" \
  --filter-pattern "[time, requestid, level=ERROR, ...]" \
  --destination-arn arn:aws:firehose:ap-northeast-2:123456789012:deliverystream/error-stream \
  --role-arn arn:aws:iam::123456789012:role/CWLtoFirehoseRole
```

---

## 📝 연습 문제

**문제 1.** 회사의 CloudWatch Logs 비용이 지난 6개월간 3배 증가했다. 가장 먼저 점검할 것은?

A) 알람 개수
B) Log Group의 Retention 설정 — 기본 "Never Expire"가 적용된 그룹이 있는지
C) Subscription Filter 개수
D) Log Stream 개수

**정답: B**
해설: 가장 흔한 원인. 기본 Retention이 "Never Expire"여서 Storage 비용이 계속 누적. `describe-log-groups`로 `retentionInDays`가 None인 그룹 찾아 일괄 설정.

---

**문제 2.** Lambda 함수 실행 시 로그가 CloudWatch에 안 보인다. 가능한 원인은?

A) Lambda 콘솔 버그
B) 함수의 Execution Role에 `logs:CreateLogStream`, `logs:PutLogEvents` 권한 누락
C) Log Group이 자동 생성되지 않음
D) B와 C 모두 가능

**정답: D**
해설: Lambda는 자동으로 Log Group을 만들지만, IAM 권한이 없으면 못 만듦. 또한 함수 첫 실행 전엔 Log Group 자체가 존재하지 않을 수 있음. 표준 `AWSLambdaBasicExecutionRole` 정책에 두 권한 포함.

---

**문제 3.** ERROR 로그가 발생하면 즉시 Slack 알림이 가도록 하고 싶다. 가장 효율적인 방법은?

A) Lambda를 1분마다 실행해 로그 폴링
B) Subscription Filter로 ERROR 패턴 매칭 → Lambda 호출 → Slack Webhook
C) Logs Insights 쿼리를 주기적 실행
D) S3 export 후 분석

**정답: B**
해설: Subscription Filter는 실시간 처리에 최적. Filter Pattern으로 ERROR만 매칭해 Lambda 호출, Lambda가 Slack으로 전송. 폴링 방식은 지연·비용 낭비.

---

**문제 4.** 회사가 컴플라이언스 요건으로 모든 애플리케이션 로그를 7년간 보관해야 한다. 비용 효율적인 방법은?

A) Log Group의 Retention을 7년으로 설정
B) Log Group은 30~90일 retention, 그 후 S3로 export하고 S3 라이프사이클로 Glacier 이동
C) 별도 DB에 보관
D) DynamoDB에 저장

**정답: B**
해설: CloudWatch Logs는 Storage 비용이 비싸다 ($0.033/GB-월). S3 IA는 절반, Glacier는 1/10 가격. 단기 hot 데이터만 Logs에 두고 장기는 Glacier가 표준.

---

**문제 5.** 회사가 Cross-Account에서 모든 계정의 ERROR 로그를 중앙 집계하려 한다. 가장 적합한 패턴은?

A) 각 계정마다 별도 Log Group, 수동 복사
B) Subscription Filter → Cross-Account Kinesis Data Streams → 중앙 계정에서 처리
C) S3 export 후 중앙 분석
D) EventBridge

**정답: B**
해설: Subscription Filter는 Cross-Account Kinesis로 실시간 전송 지원. Source 계정에서 Logs Destination 자원 생성 + Destination 계정의 Kinesis가 IAM Role로 수신. S3 export는 배치, EventBridge는 메트릭/이벤트 기반.

---

## 📌 오늘의 요약

1. Log Group → Log Stream → Log Event 계층. 같은 Log Group은 retention/권한/필터 공유
2. **기본 Retention = Never Expire** — 운영자가 반드시 설정해야 할 1순위
3. Subscription Filter로 로그를 실시간 Lambda/Kinesis/Firehose/OpenSearch로 전송
4. CloudWatch Logs 비용 3종: Ingestion(가장 큼) / Storage / Insights Scan
5. 장기 보관은 S3 export + Glacier — Logs 자체 장기 보관은 비효율
