# Day 7 - CloudWatch Logs: Log Group의 내부 구조와 Subscription 패턴

운영자가 장애 디버깅을 시작하는 곳은 결국 로그다. 메트릭이 "지표 하나가 비정상"을 알려준다면, 로그는 "정확히 어떤 요청에서 어떤 예외가 났는가"를 알려준다. 그래서 운영자의 일상 도구 No.1이 CloudWatch Logs다. 오늘은 Logs의 내부 구조와 비용·보존·검색·구독 패턴을 깊이 본다.

## CloudWatch Logs의 데이터 모델

```
Log Group           ← 동일 애플리케이션의 로그 컨테이너
   │
   ├─ Log Stream    ← 단일 소스(EC2 인스턴스, Lambda 실행 환경)의 로그 시퀀스
   │   │
   │   ├─ Log Event ← 실제 로그 레코드 (timestamp + message)
   │   └─ Log Event
   │
   └─ Log Stream
```

- **Log Group**: 정책의 단위. 보존 기간·KMS 암호화·메트릭 필터·구독은 Log Group 레벨
- **Log Stream**: 단일 소스(인스턴스 ID, Lambda 실행 환경 ID)의 시간순 로그 시퀀스
- **Log Event**: 한 줄의 로그. timestamp(ms) + message(최대 256KB)

Lambda는 함수당 1개 Log Group, 실행 환경(콘테이너)마다 1개 Stream. EC2의 CloudWatch Agent는 보통 인스턴스 ID로 Stream 분리.

> 🔍 **더 깊이**: Log Stream은 Sequence Token이라는 단조 증가 토큰으로 동시성을 제어한다. 한 Stream에 동시에 PutLogEvents를 호출하면 한 쪽은 InvalidSequenceTokenException으로 실패. 그래서 한 Stream에 여러 소스가 쓰지 않는 게 원칙. (참고: 2023년부터 Sequence Token 없이 PutLogEvents 가능한 모드 추가)

## 보존 정책: 디폴트의 함정

**Log Group의 기본 보존은 "Never Expire"** (영구). 운영자가 명시적으로 설정하지 않으면 비용이 무한 증가한다.

| 보존 기간 옵션 | 사용 시점 |
|----------------|-----------|
| 1일 | 디버그 로그·고볼륨 액세스 로그 |
| 7-30일 | 일반 애플리케이션 로그 |
| 90-180일 | 보안 감사 (CloudTrail은 보통 90일) |
| 1-7년 | 컴플라이언스 요구 (PCI-DSS는 1년, HIPAA는 6년) |
| Never Expire | 거의 안 씀 (비용 폭증) |

```bash
# 보존 기간 일괄 설정
aws logs put-retention-policy \
  --log-group-name /aws/lambda/my-function \
  --retention-in-days 14
```

> 📚 **사례**: 한 회사가 Lambda 함수 500개를 1년간 운영하고 어느 날 청구서를 봤더니 CloudWatch Logs 비용만 월 $4,000. 원인은 모든 함수의 Log Group이 기본 "Never Expire". 7일 보존으로 일괄 변경 후 비용이 90% 감소. 운영자 First Day Action 중 1순위가 Log Group 보존 정책 표준화.

> 🔍 **더 깊이**: 운영자가 모든 신규 Log Group에 자동으로 보존 정책을 적용하려면:
> 1. **EventBridge 룰**: `CreateLogGroup` API 이벤트 감지 → Lambda 자동 호출 → put-retention-policy 실행
> 2. **Config Rule**: `cloudwatch-log-group-retention-period-check`로 비준수 탐지 + 자동 수정
> 3. **CloudFormation Custom Resource**: Log Group을 IaC로 만들 때 보존 강제

## 비용 구조: 운영자가 폭증하기 쉬운 항목

CloudWatch Logs 비용은 4가지로 구성:

| 항목 | 가격(서울 기준) | 의미 |
|------|-----------------|------|
| **Ingestion** | GB당 $0.76 | 로그를 받아 저장하는 비용 |
| **Storage** | GB·월당 $0.033 | 저장 비용 (S3보다 비쌈) |
| **Insights Query** | 스캔된 GB당 $0.0076 | 쿼리 실행 비용 |
| **Data Transfer** | 표준 요율 | 다른 리전 또는 인터넷으로 |

**Ingestion 비용이 압도적으로 크다**. 즉 "로그를 줄이는 게 곧 비용 절감".

> ⚠️ **함정**: VPC Flow Logs를 CloudWatch Logs로 보내면 Ingestion 비용 폭증(VPC가 큰 회사는 월 수십 TB). VPC Flow Logs는 S3로 보내는 게 비용·분석 양면에서 정석. CloudWatch Logs는 실시간 분석이 필요한 경우만.

## Log Subscription: 실시간 로그 처리 파이프라인

Subscription은 Log Group의 신규 로그를 실시간으로 다른 서비스에 전달한다. 운영자가 자주 쓰는 4가지 대상:

| 대상 | 사용 시점 |
|------|-----------|
| **Lambda** | 로그 패턴 매치 → 자동 알림·복구 |
| **Kinesis Data Streams** | 다른 시스템으로 실시간 전달 |
| **Kinesis Firehose** | S3/Redshift/OpenSearch로 배치 적재 |
| **OpenSearch** | 검색·대시보드 |

```
[Log Group]
    │ (실시간 스트리밍)
    ▼
[Subscription Filter] ← "ERROR" 같은 패턴으로 필터
    │
    ├─→ Lambda     ← 알림 발송, 자동 복구
    ├─→ Kinesis    ← Splunk, Datadog 같은 외부 시스템
    └─→ Firehose   ← S3 장기 보관
```

Subscription Filter 패턴 예:
- `"ERROR"` — 단어 매치
- `"[ip, user_id, status, latency > 1000]"` — JSON 필드 매치
- `{ $.statusCode = 5* }` — JSON 경로 매치

> 🔍 **더 깊이**: Subscription은 push 기반이라 latency가 수 초. 단 한 Log Group에 Subscription Filter는 **최대 2개**(2023년 기준). 더 필요하면 Kinesis Data Streams로 한 번 보내고 그 위에서 여러 consumer가 읽는 구조.

> 📚 **사례**: 한 회사가 운영하는 EC2의 syslog에서 "Out of Memory" 패턴을 감지하면 Lambda가 자동으로 인스턴스를 재시작하고 운영자에게 알림을 보내는 자동화. 평균 다운타임이 분 → 초 단위로 단축.

## CloudWatch Logs와 EventBridge의 차이

운영자가 자주 헷갈리는 두 도구.

| 도구 | 사용 |
|------|------|
| **CloudWatch Logs Subscription** | 로그 메시지(텍스트) 처리 |
| **EventBridge** | AWS API 호출 이벤트(CloudTrail 기반) 또는 사용자 이벤트 처리 |

"S3 객체가 생성됐을 때 Lambda 실행"은 S3 Event Notification 또는 EventBridge. "Lambda 로그에 ERROR가 떴을 때 알림"은 Logs Subscription 또는 Metric Filter + Alarm.

## Log Insights: 운영자의 SQL

CloudWatch Logs Insights는 SQL과 유사한 쿼리 언어로 로그를 검색·집계한다. 운영자가 매일 쓰는 패턴 몇 개:

```sql
-- 1) 최근 10분 ERROR 로그
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

-- 2) Lambda 함수별 평균/최대 Duration
fields @duration
| stats avg(@duration), max(@duration), pct(@duration, 99) by bin(5m)

-- 3) ALB 액세스 로그에서 5xx 상위 path
parse @message "* * * * * * * * * * \"* * HTTP*\" *" 
  as time, elb, client, target, req, target_resp, response,
     elbStatusCode, targetStatusCode, requestSize, method, url, ver, ua
| filter elbStatusCode >= 500
| stats count() as errors by url
| sort errors desc
| limit 20

-- 4) Top user_id by request count
fields @message
| filter @message like /user_id/
| parse @message "user_id=*" as userId
| stats count(*) as requests by userId
| sort requests desc
| limit 50
```

> 🔍 **더 깊이**: Logs Insights는 내부적으로 쿼리를 **여러 워커로 병렬 분산**한다. Log Group 크기에 따라 수십 ~ 수백 워커가 각자 일부 Log Stream을 스캔하고 결과를 머지. 그래서 한 쿼리가 TB 단위 로그도 10-30초 안에 끝난다. 단 비용은 스캔한 GB로 청구되므로 **`filter`를 가능한 한 앞에 두고 시간 범위를 좁히는 게 비용·속도 핵심**.

> 💡 **관련 이론**: MapReduce(Dean & Ghemawat, 2004 OSDI)의 분산 처리 패러다임과 같은 계열. 쿼리 = 여러 mapper가 부분 결과 산출 → reducer가 머지. Apache Spark, Presto, BigQuery도 같은 구조.

> ⚠️ **함정**: 시간 범위를 "1주일"로 잡으면 1주일치 모든 로그를 스캔한다. 비용·속도 양면에서 손해. 운영자는 항상 가능한 좁은 시간 범위부터 시작하고 점점 넓힌다.

## VPC Flow Logs와 Logs 통합

VPC 트래픽 로그를 CloudWatch Logs로 보내면 운영자가 실시간 SG/NACL 디버깅 가능.

```
[VPC]
   │ Flow Logs 활성화
   ▼
[CloudWatch Logs Group: vpc-flow-logs]
   │
   └─→ Logs Insights 쿼리
       fields @message
       | parse @message "* * * * * * * * * * * *"
         as version, accountId, eni, src, dst, srcPort, dstPort,
            protocol, packets, bytes, start, end, action
       | filter action = "REJECT"
       | stats sum(bytes) by src, dst
       | sort sum(bytes) desc
```

이 쿼리 하나로 "어떤 IP가 어떤 IP에게 차단당하고 있는가"를 즉시 확인. SG 디버깅의 표준.

## Logs를 S3로 export하기

장기 보관과 비용 절감을 위해 Logs를 S3로 보내는 두 방법:

1. **Manual Export**: `CreateExportTask` API. 일회성 배치.
2. **Subscription → Kinesis Firehose → S3**: 실시간 스트리밍. 운영자 표준.

```
[Log Group]
    │ (Subscription Filter)
    ▼
[Kinesis Firehose]
    │ (버퍼링 + 압축)
    ▼
[S3 with lifecycle: Standard → Glacier]
```

S3로 보낸 후엔 Athena로 ad-hoc 쿼리. CloudWatch Logs Storage($0.033/GB) → S3 Standard($0.025/GB) → Glacier($0.004/GB)로 비용 대폭 절감.

## 정리하며

CloudWatch Logs의 운영자 체크리스트:
1. **모든 Log Group에 보존 정책 적용** (Never Expire 금지)
2. **Subscription으로 실시간 자동화** (ERROR 패턴 → Lambda)
3. **Logs Insights는 좁은 시간 범위부터** (비용·속도)
4. **VPC Flow Logs는 S3로** (CloudWatch 비용 폭증 방지)
5. **장기 보관은 S3 + Athena** (비용 1/10)

내일은 Logs Insights 쿼리 언어를 더 깊이 — 운영자가 매일 쓰는 트러블슈팅 패턴 라이브러리를 만든다.

---

## 📝 연습 문제

**문제 1.** Lambda 함수 500개를 운영하는데 CloudWatch Logs 비용이 폭증했다. 가장 효과적인 첫 조치는?

A) 함수 코드에서 console.log 줄임
B) 모든 Log Group의 보존 기간을 7-30일로 설정
C) 로그 압축
D) 로그를 S3로 즉시 이동

**정답: B**
해설: Log Group 기본 보존은 "Never Expire"라 영구 누적. 보존 정책 일괄 적용이 가장 큰 영향. 그 후 코드 레벨 로그 감소나 S3 export 같은 후속 조치.

---

**문제 2.** VPC Flow Logs를 운영자가 실시간으로 보내야 하는데 트래픽이 일평균 100GB. 어디로 보내는 게 비용·분석 양면에서 좋은가?

A) CloudWatch Logs
B) S3 + Athena
C) Kinesis Data Streams
D) DynamoDB

**정답: B**
해설: VPC Flow Logs는 볼륨이 크므로 CloudWatch Logs Ingestion($0.76/GB)으로 보내면 비용 폭증. S3($0.025/GB)로 보내고 Athena로 ad-hoc 쿼리가 정석. 실시간성 요구가 있으면 CloudWatch에 일부만 샘플링.

---

**문제 3.** Lambda 함수의 ERROR 로그를 실시간으로 감지해서 운영자에게 Slack 알림을 보내려고 한다. 가장 효율적인 구조는?

A) Logs Insights를 1분마다 폴링
B) Subscription Filter ("ERROR" 패턴) → Lambda → Slack webhook
C) Metric Filter + Alarm → SNS → Slack
D) B 또는 C 모두 가능 (실시간성 차이만)

**정답: D**
해설: Subscription Filter는 수 초 latency로 실시간, Metric Filter는 메트릭 → 알람 → SNS로 분 단위 latency. 둘 다 표준 패턴이고 요구 latency에 따라 선택. 시험에선 "즉각 반응"이면 Subscription, "임계값 기반"이면 Metric Filter + Alarm.

---

**문제 4.** Logs Insights 쿼리에서 시간 범위를 1주일로 설정했더니 비용·속도 문제가 발생. 운영자의 표준 사고는?

A) 쿼리에 더 많은 필드 추가
B) `filter`를 쿼리 앞쪽에 두고 시간 범위를 좁게 시작
C) Insights 대신 콘솔에서 manual 검색
D) S3로 export 후 Athena

**정답: B**
해설: Logs Insights는 스캔된 GB로 청구. 시간 범위를 좁히고 filter를 앞쪽에 두면 스캔량 최소화. 필요 시에만 범위 확장.

---

**문제 5.** 운영자가 EC2의 syslog에서 "Out of Memory" 패턴을 감지하면 자동으로 인스턴스를 재시작하려고 한다. 구조는?

A) CloudWatch Logs Subscription → Lambda → EC2 Reboot API
B) Metric Filter → Alarm → SNS → Operator manual
C) Logs Insights 쿼리 → Lambda
D) EventBridge → Step Functions

**정답: A**
해설: Subscription Filter로 "Out of Memory" 패턴 매치 시 Lambda 자동 호출 → Lambda가 SSM Run Command 또는 EC2 Reboot. 즉각 자동 복구 패턴.
