# Day 3 - 로그 분석: Athena로 CloudTrail/VPC Flow 쿼리, OpenSearch, CloudWatch Logs Insights

알림은 "지금 이상하다"를 알려주지만, 사고 조사·포렌식·헌팅(threat hunting)은 "지난 90일 동안 이 IP가 어떤 API를 호출했나", "누가 이 버킷 정책을 바꿨나"처럼 *과거 로그를 자유 형식으로 캐묻는* 능력을 요구한다. 보안 시험에서 이 영역은 세 도구의 *적합한 쓰임새 구분*으로 귀결된다 — **Athena**(S3에 쌓인 대용량 로그를 SQL로, 서버리스·종량), **OpenSearch**(준실시간 인덱싱·대시보드·전문검색), **CloudWatch Logs Insights**(CloudWatch Logs에 이미 있는 로그를 즉시 질의). 셋은 경쟁이 아니라 데이터의 위치와 분석의 시간성에 따라 갈라진다.

## 큰 그림: 로그는 어디에 있고, 어떻게 묻는가

```
                  ┌─ S3(아카이브) ──────── Athena (SQL, 서버리스, 저비용 장기)
CloudTrail ───────┤
VPC Flow Logs ────┼─ CloudWatch Logs ───── Logs Insights (즉시 질의, 단기 운영)
ELB/Route53 ──────┤
앱 로그 ───────────└─ Firehose ─── OpenSearch (인덱싱, 대시보드, 준실시간)
```

선택의 핵심 질문은 둘이다: **(1) 로그가 어디에 있나(S3 vs CloudWatch Logs vs 인덱스)? (2) 분석이 일회성 임의 쿼리인가, 반복적 대시보드·검색인가?**

> 💡 **관련 이론**: 이 분기는 데이터 분석의 고전적 트레이드오프 — *schema-on-read vs schema-on-write* — 와 닿아 있다. Athena는 S3의 원본을 그대로 두고 쿼리 시점에 스키마를 입힌다(schema-on-read): 적재 비용 0, 쿼리당 스캔 비용. OpenSearch는 적재 시 인덱싱한다(schema-on-write): 인덱싱·스토리지 상시 비용, 검색은 빠르고 반복적. 보안 운영의 시간성(사후 조사 vs 상시 모니터링)이 이 트레이드오프와 정확히 매핑된다.

## Athena: S3 로그를 SQL로 캐묻기

Athena는 S3의 데이터를 Presto/Trino 기반 SQL로 질의하는 서버리스 서비스다. 인프라를 띄울 필요 없이 *스캔한 데이터량*에 비례해 과금된다. CloudTrail·VPC Flow·ELB·WAF 로그가 모두 S3에 쌓이므로 사후 보안 분석의 1순위 도구다.

### CloudTrail 테이블 만들기

CloudTrail 콘솔의 "Create Athena table"이 DDL을 자동 생성해주지만, 핵심은 CloudTrail JSON 구조를 매핑하는 SerDe다.

```sql
-- CloudTrail 로그 테이블 (콘솔에서 자동 생성 가능)
CREATE EXTERNAL TABLE cloudtrail_logs (
  eventVersion STRING,
  eventName STRING,
  eventSource STRING,
  awsRegion STRING,
  sourceIPAddress STRING,
  userIdentity STRUCT<type:STRING, arn:STRING, userName:STRING, accountId:STRING>,
  errorCode STRING,
  errorMessage STRING,
  requestParameters STRING
)
ROW FORMAT SERDE 'com.amazon.emr.hive.serde.CloudTrailSerde'
STORED AS INPUTFORMAT 'com.amazon.emr.cloudtrail.CloudTrailInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://org-cloudtrail-bucket/AWSLogs/111122223333/CloudTrail/';
```

### 보안 조사 쿼리 예시

```sql
-- 특정 IP가 호출한 모든 API와 결과 (자격증명 탈취 의심 IP 추적)
SELECT eventtime, eventname, eventsource, errorcode
FROM cloudtrail_logs
WHERE sourceipaddress = '203.0.113.45'
ORDER BY eventtime;

-- 콘솔 로그인 실패 상위 소스 IP (브루트포스 헌팅)
SELECT sourceipaddress, count(*) AS fails
FROM cloudtrail_logs
WHERE eventname = 'ConsoleLogin' AND errormessage = 'Failed authentication'
GROUP BY sourceipaddress
ORDER BY fails DESC LIMIT 20;

-- 누가 보안 그룹/버킷 정책을 변경했나
SELECT eventtime, useridentity.arn, eventname, requestparameters
FROM cloudtrail_logs
WHERE eventname IN ('AuthorizeSecurityGroupIngress','PutBucketPolicy','PutBucketAcl');
```

### 비용·성능의 결정 요소: 파티셔닝

Athena 비용은 *스캔한 바이트*에 비례하므로, 전체 버킷을 매번 스캔하면 비싸고 느리다. 해법은 **파티셔닝**이다.

- 수동 파티션: `PARTITIONED BY (region STRING, year STRING, month STRING, day STRING)` 후 `ALTER TABLE ... ADD PARTITION`.
- **Partition Projection**: 파티션 메타데이터를 카탈로그에 일일이 등록하지 않고, 테이블 속성으로 파티션 범위를 *계산*하게 한다. CloudTrail처럼 날짜 기반으로 무한 증가하는 로그에 최적.
- 컬럼형 포맷(**Parquet/ORC**)으로 변환하면 필요한 컬럼만 읽어 스캔량이 급감한다.

> 🎯 **시나리오**: "90일 전 특정 IAM 역할이 호출한 API를 조사하되 비용을 최소화"라는 요구가 나오면, 정답은 CloudTrail S3 로그에 대한 Athena + 날짜/리전 파티셔닝(또는 Partition Projection)으로 조사 기간만 스캔하는 것이다. 모든 로그를 OpenSearch로 인덱싱해 상시 보관하는 건 90일 일회성 조사에는 과한 비용이다. 시간성이 "일회성 사후"면 Athena가 거의 항상 비용 우위다.

> ⚠️ **함정**: Athena `WHERE` 절이 파티션 키가 아니라 일반 컬럼이면 파티션 프루닝이 안 되어 전체 스캔이 일어난다. 비용 폭탄의 단골 원인이다. 또 CloudTrail의 `requestParameters`/`responseElements`는 STRING(JSON 문자열)으로 들어오므로 내부 필드를 보려면 `json_extract`로 파싱해야 한다.

## VPC Flow Logs 분석

VPC Flow Logs는 네트워크 흐름(소스/대상 IP·포트, 프로토콜, 바이트, ACCEPT/REJECT)을 기록한다. S3로 보내면 Athena로, CloudWatch Logs로 보내면 Logs Insights로 분석한다.

```sql
-- 특정 인스턴스로 향한 거부된(REJECT) 인바운드 흐름 — 스캔/공격 시도 탐지
SELECT srcaddr, dstport, count(*) AS attempts
FROM vpc_flow_logs
WHERE dstaddr = '10.0.1.50' AND action = 'REJECT'
GROUP BY srcaddr, dstport
ORDER BY attempts DESC LIMIT 50;

-- 대량 아웃바운드 전송 상위 (데이터 유출 의심)
SELECT srcaddr, dstaddr, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE action = 'ACCEPT'
GROUP BY srcaddr, dstaddr
ORDER BY total_bytes DESC LIMIT 20;
```

> 🔍 **더 깊이**: VPC Flow Logs는 *기본* 필드 외에 커스텀 포맷으로 `tcp-flags`, `pkt-srcaddr`/`pkt-dstaddr`(NAT 이전 실제 주소), `flow-direction`, `traffic-path` 등을 추가할 수 있다. 보안 조사에서 `pkt-srcaddr`는 결정적이다 — NAT Gateway/로드밸런서 뒤의 흐름은 `srcaddr`가 중간 노드로 보이지만 `pkt-srcaddr`는 원본을 드러내기 때문이다. 또 Flow Logs는 *메타데이터*만 담고 *페이로드*는 없다는 한계를 기억해야 한다(페이로드 검사는 VPC Traffic Mirroring + IDS).

## CloudWatch Logs Insights: 즉시, 운영 중심

Logs Insights는 CloudWatch Logs에 *이미 있는* 로그를 별도 적재 없이 즉시 질의하는 도구다. 자체 쿼리 언어(파이프 기반)를 쓴다. 운영자가 사고 대응 중 "지금 이 로그 그룹에서 무슨 일이 벌어지나"를 빠르게 보는 데 적합하다.

```
fields @timestamp, @message
| filter eventName = "ConsoleLogin" and errorMessage = "Failed authentication"
| stats count(*) as fails by sourceIPAddress
| sort fails desc
| limit 20
```

```
# Lambda 로그에서 AccessDenied 추세
fields @timestamp, @message
| filter @message like /AccessDenied/
| stats count(*) by bin(5m)
```

특징과 한계:
- 쿼리 시간 범위 내 스캔한 데이터량에 과금(Athena와 유사한 종량).
- 한 번에 다수 로그 그룹을 가로질러 질의 가능(cross-log-group).
- CloudWatch Logs에 있는 것만 대상 — S3 아카이브는 못 본다(그건 Athena 영역).
- 장기·대용량 임의 분석에는 Athena가 비용·유연성에서 우위.

> ⚠️ **함정**: Logs Insights와 Athena를 "둘 다 쿼리 도구"라고 뭉뚱그리면 시험에서 틀린다. 기준은 *데이터 위치*다. 로그가 CloudWatch Logs에 있으면 Logs Insights, S3에 있으면 Athena. CloudTrail을 S3에만 보내고 CloudWatch Logs로 안 보냈다면 Logs Insights로는 못 본다.

## Amazon OpenSearch Service: 인덱싱·대시보드·검색

OpenSearch는 로그를 *인덱싱*해 빠른 전문검색·집계·대시보드(OpenSearch Dashboards)를 제공한다. SIEM 스타일의 상시 모니터링, 복잡한 상관 분석, 시각화가 필요할 때 쓴다.

전형적 파이프라인: **로그 소스 → Kinesis Data Firehose → OpenSearch**(또는 CloudWatch Logs Subscription Filter → Firehose → OpenSearch). Firehose가 버퍼링·변환·인덱싱 전달을 담당한다.

OpenSearch의 보안 운영 강점:
- 거의 실시간 인덱싱 → 준실시간 대시보드/경보.
- 강력한 전문검색·집계(여러 로그 소스를 한 인덱스 패턴으로 상관).
- **OpenSearch 보안 통제**: Fine-Grained Access Control(역할 기반 인덱스/문서/필드 레벨 권한), 도메인 암호화(저장/전송), VPC 내 배치, Cognito 연동 대시보드 인증.

비용·운영 트레이드오프:
- 도메인은 *상시 가동* 클러스터라 인덱싱·스토리지 비용이 지속 발생한다(서버리스 옵션도 있으나 모델이 다름).
- 장기 보관은 비싸므로, 핫 데이터는 OpenSearch, 콜드 아카이브는 S3+Athena로 계층화하는 것이 흔한 설계.

> 💡 **관련 이론**: Athena vs OpenSearch는 "탐색적 사후 분석(ad-hoc)" vs "운영적 상시 관찰(operational)"의 대립이다. 보안 성숙도가 올라갈수록 둘을 *함께* 쓴다: 실시간 헌팅·대시보드는 OpenSearch, 깊은 포렌식·장기 추적·저비용 보관은 S3+Athena. 그리고 이 모든 원본을 정규화해 한곳에 모으는 상위 개념이 Day 4에서 다룰 **Security Lake**(OCSF 포맷, S3 기반)다 — Athena/OpenSearch 둘 다 Security Lake를 질의 대상으로 삼을 수 있다.

## 도구 선택 요약

| 도구 | 데이터 위치 | 시간성 | 최적 용도 |
|------|------------|--------|-----------|
| **Athena** | S3 | 사후·일회성 | 대용량 CloudTrail/VPC Flow 포렌식, 저비용 장기 조사 |
| **Logs Insights** | CloudWatch Logs | 즉시·운영 | 사고 대응 중 빠른 로그 질의, 단기 운영 |
| **OpenSearch** | 인덱스(Firehose 적재) | 준실시간·상시 | SIEM 대시보드, 전문검색, 반복 상관 분석 |

---

## 📝 연습 문제

**문제 1.** S3에 90일치 CloudTrail 로그가 쌓여 있다. 특정 IAM 역할이 지난 7일간 호출한 API를 비용을 최소화하며 조사하려 한다. 가장 적절한 도구와 기법은?

A) 모든 로그를 OpenSearch로 인덱싱한 뒤 대시보드 검색  
B) Athena로 쿼리하되 날짜 파티셔닝(또는 Partition Projection)으로 조사 기간만 스캔  
C) CloudWatch Logs Insights로 S3 로그를 직접 질의  
D) S3 객체를 모두 다운로드해 로컬에서 grep  

**정답: B**  
해설: S3에 있는 대용량 로그의 일회성 사후 조사는 Athena가 최적이며, 파티셔닝으로 조사 기간(7일)만 스캔하면 비용·시간이 급감한다. OpenSearch 전체 인덱싱은 일회성 조사에 과한 상시 비용이고, Logs Insights는 CloudWatch Logs만 대상이라 S3를 못 보며, 로컬 grep은 비현실적이다.

---

**문제 2.** Athena CloudTrail 쿼리의 비용이 예상보다 크게 나온다. 가장 효과적인 절감 방법은?

A) WHERE 절을 제거한다  
B) 파티션 키로 필터링해 파티션 프루닝을 활성화하고, 로그를 Parquet 같은 컬럼형으로 변환  
C) 쿼리 결과를 캐시 비활성화  
D) 리전을 us-east-1로 변경  

**정답: B**  
해설: Athena는 스캔한 바이트에 과금하므로, 파티션 키 기반 필터로 프루닝을 유도하고 컬럼형 포맷(Parquet/ORC)으로 변환해 필요한 컬럼·파티션만 읽게 하면 비용이 크게 준다. WHERE 제거는 오히려 전체 스캔을 유발하고, 캐시·리전 변경은 스캔량과 무관하다.

---

**문제 3.** 사고 대응 중 운영자가 CloudWatch Logs에 들어오는 Lambda 로그에서 AccessDenied 발생 추세를 *즉시* 보려 한다. 별도 적재 없이 가장 빠른 도구는?

A) Athena  
B) CloudWatch Logs Insights  
C) OpenSearch 도메인 신규 생성  
D) S3 Select  

**정답: B**  
해설: 로그가 이미 CloudWatch Logs에 있고 즉시 질의가 필요하면 Logs Insights가 적합하다. 별도 적재 없이 시간 범위 내에서 바로 질의·집계할 수 있다. Athena/S3 Select는 S3 데이터 대상이고, 사고 대응 중 OpenSearch 도메인을 새로 만들어 적재하는 것은 즉시성이 없다.

---

**문제 4.** NAT Gateway 뒤에 있는 인스턴스들의 실제 출발지를 VPC Flow Logs로 식별하려 한다. 어떤 필드가 필요한가?

A) 기본 필드의 srcaddr만으로 충분하다  
B) 커스텀 포맷에 pkt-srcaddr(NAT 이전 원본 주소)를 추가  
C) action 필드  
D) tcp-flags 필드  

**정답: B**  
해설: NAT/로드밸런서 뒤의 흐름은 기본 srcaddr가 중간 노드 주소로 보이므로, 커스텀 포맷에 pkt-srcaddr를 추가해야 NAT 이전 실제 출발지를 식별할 수 있다. srcaddr 단독은 원본을 가리지 못하고, action은 허용/거부, tcp-flags는 연결 상태 정보로 출발지 식별과 무관하다.

---

**문제 5.** 여러 로그 소스를 준실시간으로 인덱싱해 SIEM 스타일 대시보드와 전문검색·상관 분석을 상시 제공하려 한다. 가장 적합한 서비스는?

A) Athena  
B) CloudWatch Logs Insights  
C) Amazon OpenSearch Service(Firehose로 적재)  
D) Amazon Macie  

**정답: C**  
해설: 준실시간 인덱싱·대시보드·전문검색·반복 상관 분석은 OpenSearch의 영역이며, Firehose로 로그를 적재하는 파이프라인이 표준이다. Athena는 사후 일회성 SQL, Logs Insights는 단기 운영 질의, Macie는 S3 민감데이터 발견 도구로 상시 SIEM 대시보드 용도가 아니다.

---
