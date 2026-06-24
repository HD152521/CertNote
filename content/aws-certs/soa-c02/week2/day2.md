# Day 2 - CloudWatch Logs: Log Group의 내부 구조와 Subscription 패턴

운영자가 장애 디버깅을 시작하는 곳은 결국 로그다. 메트릭이 "지표 하나가 비정상"을 알려준다면, 로그는 "정확히 어떤 요청에서 어떤 예외가 났는가"를 알려준다. 그래서 운영자의 일상 도구 No.1이 CloudWatch Logs다. 동시에 운영자의 청구서를 가장 많이 폭증시키는 서비스 중 하나도 CloudWatch Logs다. 보존 정책을 안 정하고 VPC Flow Logs를 그대로 흘려보내면, 한 달 뒤에 \$10,000 청구서가 도착한다.

오늘은 Logs의 내부 구조, 비용 구조, 보존·검색·구독 패턴, 그리고 VPC Flow Logs의 destination 선택까지 운영자 관점에서 깊이 본다.

## CloudWatch Logs의 데이터 모델

```
Log Group           ← 동일 애플리케이션의 로그 컨테이너 (정책·KMS·보존의 단위)
   │
   ├─ Log Stream    ← 단일 소스(EC2 인스턴스, Lambda 실행 환경 ID)의 로그 시퀀스
   │   │
   │   ├─ Log Event ← 실제 로그 레코드 (timestamp + message, 최대 256KB)
   │   ├─ Log Event
   │   └─ Log Event
   │
   ├─ Log Stream
   └─ Log Stream
```

- **Log Group**: 정책의 단위. 보존 기간·KMS 암호화·메트릭 필터·구독·IAM 권한이 모두 Log Group 레벨
- **Log Stream**: 단일 소스(인스턴스 ID, Lambda 실행 환경 ID, ECS Task ID)의 시간순 로그 시퀀스
- **Log Event**: 한 줄의 로그. timestamp(ms) + message(최대 256KB) + ingestionTime

Lambda는 함수당 1개 Log Group(`/aws/lambda/<funcName>`), 실행 환경(컨테이너) 인스턴스마다 1개 Stream. EC2의 CloudWatch Agent는 보통 인스턴스 ID로 Stream 분리. ECS Fargate는 task ID, EKS는 pod name으로 stream을 만드는 게 표준.

> 🔍 **더 깊이**: Log Stream은 **Sequence Token**이라는 단조 증가 토큰으로 동시성을 제어한다. 한 Stream에 동시에 `PutLogEvents`를 호출하면 한 쪽은 `InvalidSequenceTokenException`으로 실패하고 새 토큰으로 재시도해야 했다. 2023년부터 새 모드(`PutLogEvents` v2)에서는 sequence token이 옵션이 되어 동시 쓰기가 가능해졌다. 단 한 Stream에 여러 소스가 쓰면 timestamp ordering이 깨질 수 있어 "한 Stream = 한 소스" 원칙은 여전히 표준.

> ⚠️ **함정**: 로그 메시지 최대 크기 256KB. JSON 객체가 너무 크면 잘리거나 거부. 운영자가 큰 응답 본문을 통째로 로그에 찍으면 truncation으로 디버깅 정보를 잃는다. 큰 페이로드는 S3에 저장하고 로그에는 S3 key만 남기는 패턴이 표준.

## 보존 정책: 디폴트의 함정 (Never Expire)

**Log Group의 기본 보존 = "Never Expire"** (영구 보존). 운영자가 명시적으로 설정하지 않으면 비용이 무한 증가한다. SOA-C02에서 가장 자주 나오는 비용 시나리오 중 하나가 이것.

| 보존 기간 옵션 | 사용 시점 |
|----------------|-----------|
| 1일 | 디버그 로그·고볼륨 액세스 로그 |
| 3일 | 단명 디버깅 로그 |
| 7~30일 | 일반 애플리케이션 로그 |
| 60~90일 | 보안 감사 (CloudTrail은 보통 90일 권장) |
| 180일~1년 | PCI-DSS(1년), 일부 금융 규제 |
| 5~7년 | HIPAA(6년), SOX(7년) |
| 10년 | 일부 정부·의료 규제 |
| Never Expire | 거의 안 씀 (비용 폭증) |

```bash
# 보존 기간 일괄 설정 — 운영자 First-Day Action
aws logs put-retention-policy \
  --log-group-name /aws/lambda/my-function \
  --retention-in-days 14

# 모든 retention=None인 Log Group을 30일로 일괄 변경
aws logs describe-log-groups --query 'logGroups[?retentionInDays==`null`].logGroupName' --output text \
  | xargs -I {} aws logs put-retention-policy --log-group-name {} --retention-in-days 30
```

> 📚 **사례**: 한 회사가 Lambda 함수 500개를 1년간 운영하고 어느 날 청구서를 보니 CloudWatch Logs 비용만 월 \$4,000. 원인은 모든 함수의 Log Group이 기본 "Never Expire" 상태. 7일 보존으로 일괄 변경 후 비용이 90% 감소. 운영자 First Day Action 중 1순위가 Log Group 보존 정책 표준화다.

> 🔍 **더 깊이**: 운영자가 모든 신규 Log Group에 자동으로 보존 정책을 적용하는 표준 패턴 3가지.
>
> 1. **EventBridge 룰**: CloudTrail의 `CreateLogGroup` API 이벤트 감지 → Lambda 자동 호출 → `put-retention-policy` 실행. 신규 생성 시점에 즉시 적용.
> 2. **Config Rule**: 관리형 룰 `cloudwatch-log-group-retention-period-check`(파라미터 `MinRetentionTime`)로 비준수 탐지 + Remediation Action으로 자동 수정.
> 3. **CloudFormation / Terraform**: IaC에서 Log Group 정의 시 `RetentionInDays`를 필수로. 단 Lambda는 함수 첫 실행 시 자동 생성이라 IaC로 미리 만들어 두지 않으면 빠진다.

## 비용 구조: 운영자가 폭증하기 쉬운 4가지 항목

CloudWatch Logs 비용은 4가지로 구성(서울 ap-northeast-2 기준).

| 항목 | 가격 | 의미 | 비용 위협도 |
|------|------|------|-------------|
| **Ingestion** | GB당 \$0.76 | 로그를 받아 저장하는 비용 | ★★★★★ (가장 큼) |
| **Storage** | GB·월당 \$0.033 | 저장 비용 (S3보다 3~7배 비쌈) | ★★★ |
| **Insights Query** | 스캔된 GB당 \$0.0076 | 쿼리 실행 비용 | ★★ |
| **Data Transfer** | 표준 요율 | 다른 리전·인터넷으로 | ★ |

**Ingestion이 압도적으로 크다**. 즉 "로그 양을 줄이는 것"이 비용 절감의 1순위.

> ⚠️ **함정**: VPC Flow Logs를 CloudWatch Logs로 보내면 Ingestion 비용이 폭증한다. 큰 VPC는 일평균 수십 GB ~ 수 TB. 한 달 \$10,000~\$50,000은 흔하다. **VPC Flow Logs는 S3로** 보내는 게 비용·분석 양면의 정석. CloudWatch Logs는 실시간 알림이 필요한 일부 패턴만.

### VPC Flow Logs Destination 비교

| Destination | Ingestion 비용 | 저장 비용 | 분석 도구 | 사용 시점 |
|-------------|----------------|-----------|-----------|-----------|
| **CloudWatch Logs** | GB당 \$0.50 | GB·월 \$0.03 | Logs Insights | 실시간 알림 |
| **S3** | GB당 \$0.50 (수집) | GB·월 \$0.025 | Athena | 장기 보존·대량 분석 |
| **Kinesis Data Firehose** | Firehose 요율 | 목적지 따라 | Splunk·OpenSearch | 외부 SIEM |

표면 가격은 비슷해 보이지만 **분석 시 Logs Insights는 스캔 GB당 \$0.0076, Athena는 \$5/TB(즉 GB당 \$0.005)**. 대량 분석에서 Athena가 압도적으로 싸다.

## Log Subscription Filter: 실시간 로그 처리 파이프라인

Subscription은 Log Group의 신규 로그를 실시간으로 다른 서비스에 전달한다. 운영자가 자주 쓰는 4가지 대상.

| 대상 | 사용 시점 |
|------|-----------|
| **Lambda** | 로그 패턴 매치 → 자동 알림·자동 복구 |
| **Kinesis Data Streams** | 다른 시스템으로 실시간 fan-out, 여러 consumer |
| **Kinesis Data Firehose** | S3 / Redshift / OpenSearch로 배치 적재 |
| **OpenSearch Service** | 검색·대시보드 (구 ElasticSearch) |

```
[Log Group]
    │ (실시간 스트리밍)
    ▼
[Subscription Filter] ← "ERROR" 같은 패턴으로 필터
    │
    ├─→ Lambda     ← Slack/PagerDuty 알림, EC2 자동 재시작
    ├─→ Kinesis DS ← Splunk/Datadog 등 외부 SIEM
    ├─→ Firehose   ← S3 장기 보관
    └─→ OpenSearch ← Kibana 대시보드
```

### Subscription Filter 패턴 예

```
"ERROR"                              # 단어 매치
"[ip, user_id, status=5*, ...]"      # space-delimited 필드 매치 (5xx만)
{ $.statusCode = 5* }                # JSON 경로 매치
{ $.level = "ERROR" && $.latency > 1000 }  # AND 조건
{ ($.statusCode = 5*) || ($.statusCode = 4*) }  # OR 조건
```

> 🔍 **더 깊이**: Subscription Filter는 push 기반이라 latency가 수 초. 단 한 Log Group에 Subscription Filter는 **최대 2개**(2023년부터). 더 필요하면 Kinesis Data Streams로 한 번 보내고 그 위에서 여러 consumer가 읽는 fan-out 구조. 또 한 가지 함정: Subscription Filter는 **새로 도착하는 로그에만 적용**(forward-only). 과거 로그를 retroactive 처리하려면 별도 export task가 필요하다.

> 📚 **사례**: 한 회사가 EC2의 syslog에서 "Out of Memory: Kill process" 패턴을 감지하면 Lambda가 자동으로 인스턴스를 재시작하고 운영자에게 Slack 알림을 보내는 자동화를 구축했다. 평균 다운타임이 분 단위 → 초 단위로 단축. 추가로 같은 Lambda가 알람 발생 횟수를 메트릭으로 발행해, OOM이 반복되는 인스턴스 타입을 자동 식별 → 다음 deployment에서 메모리 큰 타입으로 교체하는 closed-loop 운영 자동화를 만들었다.

### Cross-Account Subscription

다른 계정의 Log Group을 자기 계정 Kinesis로 받으려면 **Log Destination** 리소스를 만들고 cross-account IAM Trust를 설정.

```
[Account A: 소스]                  [Account B: 분석 계정]
  Log Group                         Log Destination (Kinesis)
    │ Subscription Filter             │
    └──────────► Kinesis DS ◄─────────┘
                  │
                  ▼
                Lambda/OpenSearch
```

Account B에 `logs:PutSubscriptionFilter`를 허용하는 Resource Policy를 Destination에 붙여야 한다. 이 패턴이 시험에 자주 나오는 "여러 계정 로그를 중앙 보안 계정에서 실시간 분석" 시나리오의 답.

## CloudWatch Logs와 EventBridge의 차이

운영자가 자주 헷갈리는 두 도구.

| 도구 | 처리 대상 | 사용 시점 |
|------|-----------|-----------|
| **CloudWatch Logs Subscription Filter** | 로그 메시지(텍스트) 패턴 | 애플리케이션 로그의 ERROR 등 |
| **EventBridge (CloudWatch Events)** | AWS API 호출 이벤트(CloudTrail 기반) 또는 사용자 정의 이벤트 | "S3 객체 생성", "EC2 상태 변경" 등 구조화된 이벤트 |
| **CloudWatch Alarm** | 메트릭 임계값 초과 | "CPU 80% 초과" 같은 임계값 기반 |

"S3 객체가 생성됐을 때 Lambda 실행"은 S3 Event Notification 또는 EventBridge. "Lambda 로그에 ERROR가 떴을 때 알림"은 Logs Subscription Filter 또는 Metric Filter → Alarm. "EC2 CPU 80% 초과"는 CloudWatch Alarm. 셋의 경계가 명확해야 시험에서 헷갈리지 않는다.

## Log Insights: 운영자의 SQL

CloudWatch Logs Insights는 SQL과 유사한 쿼리 언어로 로그를 검색·집계한다. 운영자가 매일 쓰는 패턴 몇 개를 미리 본다.

```sql
-- 1) 최근 10분 ERROR 로그 상위 100건
fields @timestamp, @message, @logStream
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

-- 2) Lambda 함수별 평균/최대/p99 Duration
filter @type = "REPORT"
| stats avg(@duration), max(@duration), pct(@duration, 99) by bin(5m)

-- 3) ALB 액세스 로그에서 5xx 응답 상위 URL
parse @message "* * * * * * * * * * \"* * HTTP*\" * *"
  as time, elb, client, target, req_proc, target_proc, resp_proc,
     elbStatus, targetStatus, recvBytes, sentBytes, method, url, ver, ua, sslCipher
| filter elbStatus >= 500
| stats count() as errors by url
| sort errors desc
| limit 20

-- 4) Top user_id by request count (사용자별 분석)
fields @message
| filter @message like /user_id/
| parse @message "user_id=*" as userId
| stats count(*) as requests by userId
| sort requests desc
| limit 50

-- 5) VPC Flow Logs에서 REJECT 트래픽
fields @message
| parse @message "* * * * * * * * * * * * * *"
  as ver, accId, eni, src, dst, srcPort, dstPort,
     proto, packets, bytes, start, end, action, logStatus
| filter action = "REJECT"
| stats sum(bytes) as totalBytes by src, dst
| sort totalBytes desc
| limit 30
```

> 🔍 **더 깊이**: Logs Insights는 내부적으로 쿼리를 **여러 워커로 병렬 분산**한다. Log Group 크기에 따라 수십 ~ 수백 워커가 각자 일부 Log Stream을 스캔하고 결과를 머지(MapReduce 패턴). 그래서 한 쿼리가 TB 단위 로그도 10~30초 안에 끝난다. 단 비용은 **스캔한 GB로 청구(GB당 \$0.0076)**되므로 다음 3원칙이 핵심:
> 1. **`filter`를 가능한 한 앞에**: 스캔 후 필터링이 아닌 스캔 중 필터링
> 2. **시간 범위를 좁게 시작**: 1주일 → 1시간으로 줄이면 비용 168분의 1
> 3. **`fields` 명시**: 불필요한 필드 로딩 안 함

> 💡 **관련 이론**: MapReduce(Dean & Ghemawat, 2004 OSDI)의 분산 처리 패러다임과 같은 계열. 쿼리 = 여러 mapper가 부분 결과 산출 → reducer가 머지. Apache Spark, Presto, BigQuery도 같은 구조. Logs Insights의 한계는 로그가 행 지향(line) 저장이라 컬럼 프루닝이 안 된다는 점. 대량 분석은 Athena(Parquet 컬럼 저장)가 압도적으로 빠르고 싸다.

> ⚠️ **함정**: 시간 범위를 "1주일"로 잡으면 1주일치 모든 로그를 스캔한다. 비용·속도 양면에서 손해. 운영자는 항상 가능한 좁은 시간 범위부터 시작하고 점점 넓힌다. 1시간 → 6시간 → 24시간 순.

## VPC Flow Logs와 Logs 통합 패턴

VPC 트래픽 로그를 실시간 분석하려면 CloudWatch Logs 또는 S3 중 선택. 운영자의 의사결정 트리.

```
                  VPC Flow Logs
                       │
        ┌──────────────┴───────────────┐
        │                              │
   "실시간 알림 필요"            "장기 보존·대량 분석"
        │                              │
        ▼                              ▼
   CloudWatch Logs                    S3
        │                              │
        │ Logs Insights                │ Athena
        │ Subscription Filter         │ Glue Catalog
        │ Metric Filter → Alarm       │ Lake Formation
        ▼                              ▼
   실시간 디버깅                       Ad-hoc 대량 분석
```

S3 + Athena 패턴이 비용 효율적. Athena에서 자주 쓰는 쿼리:

```sql
-- S3 + Athena로 REJECT 트래픽 분석
SELECT srcaddr, dstaddr, dstport, SUM(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE action = 'REJECT'
  AND date_partition = '2025-05-26'
GROUP BY srcaddr, dstaddr, dstport
ORDER BY total_bytes DESC
LIMIT 30;
```

이 쿼리 하나로 "어떤 IP가 어떤 IP에게 차단당하고 있는가"를 즉시 확인. SG·NACL 디버깅의 표준.

## Logs를 S3로 export 하기: 두 가지 방법

장기 보관과 비용 절감을 위해 Logs를 S3로 보내는 두 가지 방법.

### 1. Manual Export (`CreateExportTask` API)

```bash
aws logs create-export-task \
  --log-group-name /aws/lambda/my-function \
  --from 1716700000000 --to 1716800000000 \
  --destination my-logs-archive \
  --destination-prefix exports/my-function/
```

일회성 배치. 5분 이상 소요. 운영자가 컴플라이언스 감사 대비로 분기·반기에 한 번 실행.

### 2. Subscription Filter → Kinesis Firehose → S3 (실시간 스트리밍)

```
[Log Group]
    │ (Subscription Filter)
    ▼
[Kinesis Data Firehose]
    │ (버퍼링 + 압축 + 파티셔닝)
    ▼
[S3 with lifecycle: Standard → IA → Glacier Deep Archive]
```

운영자 표준. Firehose가 버퍼링(보통 5분 또는 5MB), 압축(Gzip 또는 Parquet), 파티셔닝(`year=2025/month=05/day=26/`)을 자동 처리. S3로 보낸 후엔 Athena로 ad-hoc 쿼리.

비용 비교: CloudWatch Logs Storage(\$0.033/GB) → S3 Standard(\$0.025/GB) → S3 Glacier Deep Archive(\$0.00099/GB)로 비용을 1/33까지 절감.

> 📚 **사례**: 한 금융 회사가 7년 보존 의무가 있는 감사 로그를 CloudWatch Logs에 두고 있어 월 \$15,000를 내고 있었다. Subscription → Firehose → S3 Standard 1년 → Glacier Deep Archive 6년 lifecycle로 전환 후 월 비용 \$400. 38배 절감. 운영자가 보존 비용을 줄이는 가장 큰 단일 변경이다.

## Logs Anomaly Detection (2023 출시)

2023년 12월 출시된 **Log Anomaly Detection**은 Log 패턴 자체를 ML로 학습해 비정상 패턴을 자동 탐지. 메트릭의 Anomaly Detection이 "수치의 이상"을 본다면, 이건 "로그 패턴의 이상"을 본다.

```
[정상 학습된 패턴]
"INFO Started processing order=*"
"INFO Order * completed in *ms"
"WARN Retry attempt * for order *"

[이상 탐지]
"FATAL Database connection lost"             ← 처음 보는 패턴, 알람
"INFO Started processing order=*"            ← 동일 패턴이지만 빈도 평소의 10배, 알람
```

운영자가 수동 Metric Filter를 안 만들어도 ML이 자동으로 베이스라인을 학습한다. 단 학습에 최소 며칠~수 주가 필요해 신규 워크로드 즉시 적용은 안 된다.

## CloudWatch Logs Cross-Account Observability (2022 출시)

여러 계정의 로그·메트릭·X-Ray를 한 콘솔에서 보려면 **CloudWatch Observability Access Manager**.

```
[Monitoring Account] ← 운영팀이 보는 계정
   │ Sink 활성화
   │
   ├── Source Account A의 메트릭·로그·X-Ray 자동 동기화
   ├── Source Account B
   └── Source Account C
```

운영자 패턴: 별도 Monitoring Account를 만들고 모든 워크로드 계정에서 sink를 연결. 운영자는 한 콘솔에서 전 계정 메트릭·로그·X-Ray trace를 통합 조회. Organization 전체를 자동 enrollment하는 옵션도 있다.

## 정리하며

CloudWatch Logs의 운영자 체크리스트:

1. **모든 Log Group에 보존 정책 적용**: Never Expire 금지. First-Day Action 1순위
2. **VPC Flow Logs는 S3로**: CloudWatch 비용 폭증 방지. 실시간 알림 필요한 일부만 CloudWatch
3. **Subscription Filter로 실시간 자동화**: ERROR 패턴 → Lambda → Slack/자동 복구
4. **Logs Insights는 좁은 시간 범위·filter pushdown**: 비용·속도
5. **장기 보관은 S3 + Athena + Glacier lifecycle**: 비용 1/33
6. **Cross-Account는 Observability Access Manager**: 별도 Monitoring Account 패턴

내일은 Logs Insights 쿼리 언어를 더 깊이 — 운영자가 매일 쓰는 트러블슈팅 패턴 라이브러리를 만든다.

---

## 📝 연습 문제

**문제 1.** Lambda 함수 500개를 운영하는데 CloudWatch Logs 비용이 폭증했다. 가장 효과적인 첫 조치는?

A) 함수 코드에서 console.log 줄임
B) 모든 Log Group의 보존 기간을 7-30일로 설정 (`put-retention-policy`로 일괄). 신규 Log Group은 EventBridge 또는 Config Rule로 자동 적용
C) 로그를 모두 압축
D) 로그를 S3로 즉시 이동

**정답: B**
해설: Log Group 기본 보존은 "Never Expire"라 영구 누적. 보존 정책 일괄 적용이 가장 큰 단일 영향. 그 후 코드 레벨 로그 감소나 S3 export 같은 후속 조치를 한다. 신규 Log Group에는 EventBridge로 `CreateLogGroup` 이벤트 감지 후 자동 적용하는 패턴이 표준.

---

**문제 2.** VPC Flow Logs를 운영자가 실시간으로 보내야 하는데 트래픽이 일평균 100GB다. 어디로 보내는 게 비용·분석 양면에서 좋은가?

A) CloudWatch Logs (Ingestion + Storage + Insights)
B) S3 (장기 보존) + Athena (ad-hoc 쿼리)
C) Kinesis Data Streams + Lambda
D) DynamoDB

**정답: B**
해설: VPC Flow Logs는 볼륨이 크므로 CloudWatch Logs Ingestion(\$0.76/GB) + Storage + Insights 스캔 비용까지 폭증한다. S3(\$0.025/GB) + Athena(스캔 \$5/TB)가 정석. 실시간 알림이 꼭 필요한 일부 패턴(REJECT 급증 등)만 CloudWatch에 추가로 보내는 hybrid도 가능.

---

**문제 3.** Lambda 함수의 ERROR 로그를 실시간으로 감지해 운영자에게 Slack 알림을 보내려고 한다. 가장 효율적인 구조는?

A) Logs Insights를 1분마다 폴링
B) Subscription Filter ("ERROR" 패턴) → Lambda → Slack webhook (수 초 latency)
C) Metric Filter + Alarm → SNS → Slack (분 단위 latency, 임계값 기반)
D) B 또는 C 모두 가능 — 요구 latency와 알림 트리거 방식에 따라 선택

**정답: D**
해설: Subscription Filter는 수 초 latency로 실시간 텍스트 매치, Metric Filter는 메트릭 → 알람 → SNS로 분 단위 latency지만 임계값(예: "5분에 10건 이상")으로 noise 제거 용이. 둘 다 표준 패턴이며 시험에선 "즉각 반응"이면 Subscription, "임계값 기반"이면 Metric Filter + Alarm. 두 패턴을 동시에 쓰는 회사도 흔하다.

---

**문제 4.** Logs Insights 쿼리에서 시간 범위를 1주일로 설정했더니 비용·속도 문제가 발생. 운영자의 표준 대응은?

A) 쿼리에 더 많은 필드 추가
B) `filter`를 쿼리 앞쪽에 두고 시간 범위를 좁게 시작(1시간 → 6시간 → 24시간 단계적 확장)
C) Insights 대신 콘솔에서 manual 검색
D) S3로 export 후 Athena

**정답: B**
해설: Logs Insights는 스캔된 GB로 청구. 시간 범위를 좁히고 filter를 앞쪽에 두면 스캔량 최소화. 단계적 확장이 표준. D도 대량 분석에서 유효한 대안이지만 즉각적인 비용 문제 해결책으로는 B가 먼저.

---

**문제 5.** 운영자가 EC2의 syslog에서 "Out of Memory" 패턴을 감지하면 자동으로 인스턴스를 재시작하려고 한다. 가장 직접적인 구조는?

A) CloudWatch Logs Subscription Filter → Lambda → SSM Run Command 또는 EC2 Reboot API
B) Metric Filter → Alarm → SNS → 운영자 수동 조치
C) Logs Insights 쿼리를 1분마다 폴링 → Lambda
D) EventBridge → Step Functions

**정답: A**
해설: Subscription Filter로 "Out of Memory" 패턴 매치 시 Lambda 자동 호출 → Lambda가 SSM Run Command(reboot script) 또는 EC2 Reboot API. 즉각 자동 복구 패턴. B는 수동 개입이 들어가 즉각성 떨어짐. C는 폴링이라 비효율.

---

**문제 6.** Cross-Account로 50개 계정의 ERROR 로그를 중앙 보안 계정에서 실시간 분석하려고 한다. 가장 적절한 패턴은?

A) 각 계정에서 S3로 export 후 중앙 Athena 쿼리
B) 각 계정 Log Group에 Subscription Filter → 중앙 계정의 Log Destination(Kinesis Data Streams) → OpenSearch
C) 50개 계정에 IAM Role 만들고 중앙에서 매분 GetLogEvents 폴링
D) CloudTrail로 대체

**정답: B**
해설: 실시간 요구사항 → Subscription Filter + Cross-Account Kinesis. 소스 계정에서 Logs Destination 자원을 중앙 계정에 만들고, 중앙 계정의 Destination Policy로 소스 계정의 `logs:PutSubscriptionFilter`를 허용. 중앙 OpenSearch에서 Kibana로 통합 검색. CloudWatch Cross-Account Observability(2022)도 같은 결과를 더 간단하게 달성하는 대안.

---

**문제 7.** 7년 보존 의무가 있는 감사 로그의 비용을 최소화하려면?

A) CloudWatch Logs에 7년 보존 설정
B) Subscription Filter → Firehose → S3 Standard 1년 → S3 Glacier Deep Archive 6년 lifecycle
C) CloudTrail로 대체
D) Lambda로 매일 백업

**정답: B**
해설: CloudWatch Logs Storage(\$0.033/GB) vs Glacier Deep Archive(\$0.00099/GB). 33배 차이. S3 lifecycle로 자동 전환하면 운영 부담 없이 비용 대폭 절감. 7년 후 자동 만료 정책까지 lifecycle에 포함 가능.
