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

### 세 도구의 비교: 비용·지연·용도

시험 지문은 대개 세 축 중 하나를 강조해 정답을 유도한다. **"비용을 최소화"**면 Athena, **"즉시"**면 Logs Insights, **"상시 대시보드"**면 OpenSearch — 이 반사가 먼저 나와야 한다. 다만 그 반사의 근거를 아래 표로 채워 두면 변형 문항에도 흔들리지 않는다.

| 축 | CloudWatch Logs Insights | Athena | OpenSearch Service |
|----|--------------------------|--------|--------------------|
| 데이터 위치 | CloudWatch Logs 로그 그룹 | S3(원본 그대로) | 자체 인덱스(Firehose 등으로 적재) |
| 스키마 시점 | 질의 시 자동 필드 추출 | **질의 시**(schema-on-read) | **적재 시**(schema-on-write) |
| 비용 구조 | 질의 시 스캔량 + 로그 수집·저장 | **질의 시 스캔량만**(적재 비용 0) | **상시 클러스터**(인덱싱·스토리지·컴퓨트) |
| 질의 지연 | 초 단위 | 초~수십 초(스캔량에 비례) | 밀리초~초 |
| 데이터 신선도 | 거의 즉시 | 로그가 S3에 도착한 뒤(전달 지연) | 적재 파이프라인 지연(수십 초~분) |
| 장기 보관 적합성 | 낮음(단가 높음) | **높음**(S3 수명주기·Glacier) | 낮음(핫 스토리지 비쌈) |
| 반복 질의 | 매번 스캔 비용 | 매번 스캔 비용 | **인덱스가 있어 저렴·빠름** |
| 상관 분석 | 로그 그룹 간 질의 가능(제한적) | SQL JOIN 가능 | 인덱스 패턴으로 다중 소스 상관 |
| 대시보드·경보 | 기본 위젯 수준 | 없음(QuickSight 등 별도) | **Dashboards + Alerting 내장** |
| 접근 제어 | IAM(로그 그룹 단위) | IAM + Lake Formation | **FGAC(인덱스·문서·필드 단위)** |
| 전형적 용도 | 사고 대응 중 즉시 조회 | 포렌식·헌팅·장기 추적 | SOC 상시 모니터링 |

마지막에서 두 번째 행이 보안 시험에서 자주 결정적이다. **"분석가마다 볼 수 있는 로그를 다르게 하라"**는 요구가 나오면 답은 OpenSearch의 세분화된 접근 제어(FGAC)다 — 문서·필드 단위 제어는 다른 두 도구에 없다. 반대로 CloudWatch Logs는 로그 그룹 단위 IAM이 한계라, 민감 로그를 다른 로그 그룹으로 *분리해 두는 설계*로 대응해야 한다.

> 🔍 **더 깊이**: 세 도구를 "택일"로 보는 것이 초심자의 실수다. 성숙한 조직은 **계층(tiering)**으로 운영한다. 최근 며칠은 CloudWatch Logs와 OpenSearch에 두어 즉시성과 대시보드를 확보하고, 그 이후는 S3로 내려 Athena로 조사하며, 아주 오래된 것은 Glacier 계열로 밀어 보관 비용을 줄인다. 이 계층화의 판단 기준은 데이터의 나이가 아니라 **질의 빈도**다 — 90일 지난 로그라도 매일 조회한다면 인덱스에 두는 것이 싸고, 어제 로그라도 1년에 한 번 볼 것이라면 S3가 싸다. 시험 지문의 "가끔 조사"·"상시 모니터링" 같은 표현이 바로 이 빈도를 가리키는 신호다.

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

### 실전 테이블: 파티션 프로젝션까지 넣은 DDL

위 DDL은 개념을 보여주지만 실무에서는 그대로 쓰지 않는다. 파티션이 없어 매 쿼리가 전체 버킷을 스캔하기 때문이다. 조직 트레일을 상대하는 실제 형태는 이렇다.

```sql
CREATE EXTERNAL TABLE cloudtrail (
  eventversion STRING,
  useridentity STRUCT<
    type:STRING, principalid:STRING, arn:STRING, accountid:STRING,
    accesskeyid:STRING, invokedby:STRING,
    sessioncontext:STRUCT<
      attributes:STRUCT<mfaauthenticated:STRING, creationdate:STRING>,
      sessionissuer:STRUCT<type:STRING, arn:STRING, username:STRING>>>,
  eventtime STRING, eventsource STRING, eventname STRING,
  awsregion STRING, sourceipaddress STRING, useragent STRING,
  errorcode STRING, errormessage STRING,
  requestparameters STRING, responseelements STRING, additionaleventdata STRING,
  eventid STRING, eventtype STRING, recipientaccountid STRING,
  readonly STRING, managementevent STRING, eventcategory STRING,
  resources ARRAY<STRUCT<arn:STRING, accountid:STRING, type:STRING>>
)
PARTITIONED BY (account STRING, region STRING, day STRING)
ROW FORMAT SERDE 'com.amazon.emr.hive.serde.CloudTrailSerde'
STORED AS INPUTFORMAT 'com.amazon.emr.cloudtrail.CloudTrailInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://org-cloudtrail-bucket/AWSLogs/'
TBLPROPERTIES (
  'projection.enabled'          = 'true',
  'projection.account.type'     = 'enum',
  'projection.account.values'   = '111122223333,444455556666,777788889999',
  'projection.region.type'      = 'enum',
  'projection.region.values'    = 'ap-northeast-2,us-east-1,eu-west-1',
  'projection.day.type'         = 'date',
  'projection.day.range'        = '2025/01/01,NOW',
  'projection.day.format'       = 'yyyy/MM/dd',
  'projection.day.interval'     = '1',
  'projection.day.interval.unit'= 'DAYS',
  'storage.location.template'   =
    's3://org-cloudtrail-bucket/AWSLogs/${account}/CloudTrail/${region}/${day}'
);
```

`storage.location.template`이 이 DDL의 심장이다. 파티션 값 조합을 실제 S3 경로로 *계산*해 주므로, 카탈로그에 파티션을 하나하나 등록(`ADD PARTITION`)하거나 `MSCK REPAIR TABLE`을 주기적으로 돌릴 필요가 없다. CloudTrail처럼 **매일 새 경로가 무한히 생기는 로그**에 파티션 프로젝션이 사실상 표준인 이유다.

> ⚠️ **함정**: 파티션 프로젝션을 걸어 놓고 `WHERE eventtime > '...'`처럼 **파티션 키가 아닌 컬럼으로 기간을 거르면 프루닝이 일어나지 않는다.** `eventtime`은 파일 *내용*이고 `day`는 파일 *경로*다. 경로를 좁혀야 읽을 파일이 줄어든다. 반드시 `WHERE day BETWEEN '2026/03/01' AND '2026/03/07'`처럼 **파티션 키를 먼저 건 다음** 내용 컬럼으로 다시 좁힌다. 이 한 줄의 유무가 스캔량을 수백 배 가른다.

### 보안 조사 쿼리: 무엇을 묻고, 결과를 어떻게 읽는가

쿼리 자체보다 **결과의 어떤 열을 보고 무엇을 판단하는가**가 실전 능력이다. 아래는 조사에서 실제로 순서대로 던지는 질문들이다.

```sql
-- ① 의심 역할의 활동 요약: "이 역할이 평소와 다르게 굴고 있나"
SELECT
  useridentity.sessioncontext.sessionissuer.username AS role_name,
  sourceipaddress,
  count(*)                                   AS calls,
  count(DISTINCT eventname)                  AS distinct_apis,
  count(DISTINCT awsregion)                  AS regions,
  sum(CASE WHEN errorcode <> '' THEN 1 ELSE 0 END) AS errors,
  min(eventtime) AS first_seen,
  max(eventtime) AS last_seen
FROM cloudtrail
WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  AND account = '111122223333'
  AND useridentity.type = 'AssumedRole'
  AND useridentity.sessioncontext.sessionissuer.username = 'app-server-role'
GROUP BY 1, 2
ORDER BY calls DESC;
```

**읽는 법.** 이 표에서 눈이 가야 할 곳은 `calls`가 아니다.

- **`sourceipaddress`가 여러 줄로 갈라지는가.** 인스턴스 프로파일 역할은 정상적으로 소수의 IP(그 인스턴스 또는 NAT)에서만 쓰인다. IP가 여럿, 특히 AWS 대역 밖의 IP가 섞이면 **자격증명이 인스턴스 밖으로 나갔다**는 강한 신호다.
- **`regions`가 1보다 큰가.** 서울에서만 도는 워크로드의 역할이 갑자기 다른 리전에서 호출되면 정찰이거나 채굴 자원 생성이다.
- **`errors` / `calls` 비율이 높은가.** 정상 자동화는 성공하도록 짜여 있어 오류율이 낮다. 오류율 급등은 **권한 열거**의 지문이다.
- **`distinct_apis`가 평소보다 큰가.** 애플리케이션 역할은 대개 손에 꼽는 API만 반복 호출한다. 갑자기 수십 종이 나타나면 사람이 붙었다는 뜻이다.

```sql
-- ② 세션의 출처 역추적: "이 세션을 누가 만들었나"
SELECT eventtime, useridentity.type, useridentity.arn, sourceipaddress, useragent,
       json_extract_scalar(requestparameters, '$.roleArn')          AS assumed_role,
       json_extract_scalar(requestparameters, '$.roleSessionName')  AS session_name
FROM cloudtrail
WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  AND eventname = 'AssumeRole'
  AND json_extract_scalar(requestparameters, '$.roleSessionName') = 'i-0abc123def4567890'
ORDER BY eventtime;
```

여기서 얻는 것은 **①에서 본 세션의 진짜 주인**이다. 그리고 비교해야 할 것이 하나 있다 — ②의 `sourceipaddress`와 ①의 `sourceipaddress`가 다르면, *발급된 곳과 사용된 곳이 다르다*는 뜻이다. 임시 자격증명 재생(replay)의 대표 지표다.

```sql
-- ③ 권한이 어떻게 늘어났나: 정책 변경·키 생성·신뢰 관계 수정
SELECT eventtime, useridentity.arn AS actor, eventname, errorcode,
       json_extract_scalar(requestparameters, '$.userName')   AS target_user,
       json_extract_scalar(requestparameters, '$.roleName')   AS target_role,
       json_extract_scalar(requestparameters, '$.policyArn')  AS policy_arn
FROM cloudtrail
WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  AND eventsource = 'iam.amazonaws.com'
  AND eventname IN (
    'CreateUser','CreateAccessKey','AttachUserPolicy','AttachRolePolicy',
    'PutUserPolicy','PutRolePolicy','CreatePolicyVersion',
    'UpdateAssumeRolePolicy','CreateLoginProfile','UpdateLoginProfile'
  )
ORDER BY eventtime;
```

이 목록은 임의로 고른 것이 아니라 **권한 상승 경로의 목록**이다. 특히 `UpdateAssumeRolePolicy`(신뢰 정책 수정)와 `CreatePolicyVersion`(기존 정책에 새 버전 추가)이 조용한 경로다 — 새 역할이나 새 사용자를 만들지 않고 *기존 것의 내용만* 바꾸기 때문에, 리소스 목록만 훑는 감사에서는 보이지 않는다.

```sql
-- ④ 액세스 키 생성 직후 사용: 지속성(persistence) 확보의 전형적 패턴
WITH created AS (
  SELECT eventtime AS created_at,
         useridentity.arn AS creator,
         json_extract_scalar(responseelements, '$.accessKey.accessKeyId') AS new_key,
         json_extract_scalar(responseelements, '$.accessKey.userName')    AS key_owner
  FROM cloudtrail
  WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
    AND eventname = 'CreateAccessKey'
),
used AS (
  SELECT useridentity.accesskeyid AS key_id,
         min(eventtime) AS first_use,
         count(DISTINCT sourceipaddress) AS ips
  FROM cloudtrail
  WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  GROUP BY 1
)
SELECT c.creator, c.key_owner, c.new_key, c.created_at, u.first_use, u.ips
FROM created c JOIN used u ON c.new_key = u.key_id
ORDER BY c.created_at;
```

**읽는 법.** `created_at`과 `first_use`의 간격이 짧을수록(수 분 이내) 자동화된 공격 스크립트일 가능성이 높다. 그리고 `creator`와 `key_owner`가 **다르면** 특히 주의해야 한다 — 누군가가 *다른 사용자* 앞으로 키를 만들어 두는 것은 백도어의 고전적 형태다.

```sql
-- ⑤ 데이터를 실제로 누가 가져갔나 (S3 데이터 이벤트가 켜져 있어야 한다)
SELECT useridentity.arn AS actor, sourceipaddress,
       count(*) AS gets,
       count(DISTINCT element_at(resources, 1).arn) AS distinct_objects
FROM cloudtrail
WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  AND eventsource = 's3.amazonaws.com'
  AND eventname = 'GetObject'
  AND element_at(resources, 1).arn LIKE 'arn:aws:s3:::sensitive-exports/%'
GROUP BY 1, 2
ORDER BY gets DESC
LIMIT 30;
```

> ⚠️ **함정**: ⑤가 빈 결과를 낸다고 해서 "아무도 가져가지 않았다"가 아니다. `GetObject`는 **데이터 이벤트**이고 기본적으로 기록되지 않는다. trail에 S3 데이터 이벤트 셀렉터가 없었다면 그 기간의 객체 읽기는 **영원히 알 수 없다.** 조사에서 "접근 가능했다"와 "접근했다"를 구분해야 하는데, 데이터 이벤트가 없으면 후자를 증명할 수도 반증할 수도 없다. 시험 지문에 "누가 객체를 다운로드했는지 확인하라"가 나오면 데이터 이벤트 활성화 여부가 항상 함께 검토 대상이다.

### 비용·성능의 결정 요소: 파티셔닝

Athena 비용은 *스캔한 바이트*에 비례하므로, 전체 버킷을 매번 스캔하면 비싸고 느리다. 해법은 **파티셔닝**이다.

- 수동 파티션: `PARTITIONED BY (region STRING, year STRING, month STRING, day STRING)` 후 `ALTER TABLE ... ADD PARTITION`.
- **Partition Projection**: 파티션 메타데이터를 카탈로그에 일일이 등록하지 않고, 테이블 속성으로 파티션 범위를 *계산*하게 한다. CloudTrail처럼 날짜 기반으로 무한 증가하는 로그에 최적.
- 컬럼형 포맷(**Parquet/ORC**)으로 변환하면 필요한 컬럼만 읽어 스캔량이 급감한다.

> 🎯 **시나리오**: "90일 전 특정 IAM 역할이 호출한 API를 조사하되 비용을 최소화"라는 요구가 나오면, 정답은 CloudTrail S3 로그에 대한 Athena + 날짜/리전 파티셔닝(또는 Partition Projection)으로 조사 기간만 스캔하는 것이다. 모든 로그를 OpenSearch로 인덱싱해 상시 보관하는 건 90일 일회성 조사에는 과한 비용이다. 시간성이 "일회성 사후"면 Athena가 거의 항상 비용 우위다.

> ⚠️ **함정**: Athena `WHERE` 절이 파티션 키가 아니라 일반 컬럼이면 파티션 프루닝이 안 되어 전체 스캔이 일어난다. 비용 폭탄의 단골 원인이다. 또 CloudTrail의 `requestParameters`/`responseElements`는 STRING(JSON 문자열)으로 들어오므로 내부 필드를 보려면 `json_extract`로 파싱해야 한다.

### 비용 가드레일: 사고를 조사하다 청구서 사고를 내지 않으려면

조사 중에는 급한 마음에 `WHERE` 없이 `SELECT *`를 던지는 일이 실제로 벌어진다. **작업 그룹(workgroup)에 스캔 상한을 걸어 두는 것**이 이 사고를 구조적으로 막는 유일한 방법이다.

```bash
aws athena create-work-group --name sec-forensics \
  --configuration '{
    "ResultConfiguration": {
      "OutputLocation": "s3://sec-athena-results/",
      "EncryptionConfiguration": {
        "EncryptionOption": "SSE_KMS",
        "KmsKey": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
      }
    },
    "EnforceWorkGroupConfiguration": true,
    "BytesScannedCutoffPerQuery": 10737418240,
    "PublishCloudWatchMetricsEnabled": true
  }'
```

네 가지가 각각 다른 문제를 막는다.

| 설정 | 무엇을 막나 |
|------|------------|
| `BytesScannedCutoffPerQuery` | **비용 폭탄.** 상한(예: 10GB)을 넘는 쿼리는 실패시킨다 |
| `EnforceWorkGroupConfiguration` | 사용자가 개별 쿼리에서 설정을 우회하는 것 |
| 결과 위치의 `SSE_KMS` | **조사 결과 자체의 유출.** 쿼리 결과에는 원본만큼 민감한 내용이 들어간다 |
| `PublishCloudWatchMetricsEnabled` | 스캔량 추세를 못 보는 것(비정상 사용 탐지) |

> ⚠️ **함정**: 세 번째 항목이 자주 간과된다. **Athena 쿼리 결과 버킷은 원본 로그 버킷만큼 민감하다** — "지난달 관리자 활동 전부" 같은 결과가 CSV로 남아 있고, 그 버킷의 권한은 종종 원본보다 느슨하다. 감사 로그를 엄격히 보호하면서 그 로그의 *쿼리 결과*를 공개 가능한 버킷에 두는 구성은 실질적으로 보호를 우회한 것이다. 결과 버킷에도 동일한 암호화·접근 제어·수명주기를 적용해야 한다.

### 반복 조사가 예상되면 Parquet으로 굳혀 둔다

같은 기간을 반복해서 캐물어야 하는 조사(장기 침해 분석 등)에서는 CTAS로 **필요한 컬럼만 뽑아 Parquet으로 한 번 변환**해 두면 이후 모든 쿼리의 스캔량이 급감한다.

```sql
CREATE TABLE incident_2026_03_curated
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['day'],
  external_location = 's3://sec-curated/incident-2026-03/'
) AS
SELECT
  eventtime, eventname, eventsource, awsregion, sourceipaddress, useragent,
  errorcode, useridentity.type AS identity_type, useridentity.arn AS identity_arn,
  useridentity.accesskeyid AS access_key,
  day
FROM cloudtrail
WHERE day BETWEEN '2026/03/01' AND '2026/03/31'
  AND account = '111122223333';
```

> 💡 **관련 이론**: 이 변환이 비용을 줄이는 원리는 두 겹이다. **컬럼형 저장**이라 `SELECT eventname` 하나만 읽을 때 다른 컬럼을 건드리지 않고, **압축**이 잘 들어 물리 바이트가 줄어든다. 여기에 파티션 프루닝까지 겹치면 스캔량은 (읽는 컬럼 비율) × (읽는 파티션 비율) × (압축률)로 곱해져 줄어든다. Athena 비용 최적화의 세 가지 손잡이 — **파티셔닝·컬럼형·압축** — 이 곱셈으로 작동한다는 점이 핵심이며, 시험에서 "가장 효과적인 절감"을 묻는 문항의 정답은 대개 이 셋의 조합이다.

## VPC Flow Logs 분석

VPC Flow Logs는 네트워크 흐름(소스/대상 IP·포트, 프로토콜, 바이트, ACCEPT/REJECT)을 기록한다. S3로 보내면 Athena로, CloudWatch Logs로 보내면 Logs Insights로 분석한다.

Flow Logs를 S3로 보낼 때는 **Parquet 형식 + Hive 호환 접두사** 옵션을 켜는 것이 사실상 기본이다. 전자는 스캔량을, 후자는 파티션 등록 수고를 줄인다.

```sql
CREATE EXTERNAL TABLE vpc_flow_logs (
  version INT, account_id STRING, interface_id STRING,
  srcaddr STRING, dstaddr STRING, srcport INT, dstport INT,
  protocol BIGINT, packets BIGINT, bytes BIGINT,
  start BIGINT, `end` BIGINT, action STRING, log_status STRING,
  vpc_id STRING, subnet_id STRING, instance_id STRING, tcp_flags INT,
  type STRING, pkt_srcaddr STRING, pkt_dstaddr STRING,
  az_id STRING, pkt_src_aws_service STRING, pkt_dst_aws_service STRING,
  flow_direction STRING, traffic_path INT
)
PARTITIONED BY (aws_account_id STRING, aws_region STRING,
                year STRING, month STRING, day STRING)
STORED AS PARQUET
LOCATION 's3://org-flow-logs/AWSLogs/'
TBLPROPERTIES ('EXTERNAL' = 'true');

-- Hive 호환 접두사를 쓰면 파티션 자동 인식
MSCK REPAIR TABLE vpc_flow_logs;
```

### 네트워크 조사 쿼리와 판독

```sql
-- ① 포트 스윕 탐지: 한 소스가 몇 개의 서로 다른 포트를 두드렸나
SELECT srcaddr,
       count(DISTINCT dstport) AS ports_probed,
       count(DISTINCT dstaddr) AS hosts_probed,
       count(*)                AS flows
FROM vpc_flow_logs
WHERE year='2026' AND month='03' AND day='14'
  AND action = 'REJECT'
GROUP BY srcaddr
HAVING count(DISTINCT dstport) > 20
ORDER BY ports_probed DESC;
```

**읽는 법.** `ports_probed`와 `hosts_probed`의 조합이 공격의 *모양*을 알려준다.

- **포트 多 / 호스트 少** → 한 대상을 깊게 훑는 **포트 스캔**. 특정 자산이 표적이 됐다.
- **포트 少 / 호스트 多** → 같은 포트를 넓게 두드리는 **스윕**. 취약 서비스(예: 특정 관리 포트)를 가진 호스트를 찾는 중.
- **둘 다 多** → 자동화 도구의 전면 스캔.
- **REJECT가 아니라 ACCEPT로 위 패턴이 나오면** 훨씬 심각하다. 방어가 막지 못하고 실제로 도달했다는 뜻이다.

```sql
-- ② 대량 반출 탐지: 내부 → 외부로 나간 바이트 상위
SELECT srcaddr, dstaddr, dstport,
       sum(bytes)   AS total_bytes,
       sum(packets) AS total_packets,
       count(*)     AS flows,
       sum(bytes) / NULLIF(sum(packets), 0) AS avg_packet_size
FROM vpc_flow_logs
WHERE year='2026' AND month='03' AND day='14'
  AND action = 'ACCEPT'
  AND flow_direction = 'egress'
  AND NOT (dstaddr LIKE '10.%' OR dstaddr LIKE '172.16.%' OR dstaddr LIKE '192.168.%')
GROUP BY srcaddr, dstaddr, dstport
ORDER BY total_bytes DESC
LIMIT 30;
```

**읽는 법.** 단순히 `total_bytes` 1위를 보는 것은 초보의 판독이다. 백업이나 CDN 오리진이 늘 1위를 차지하기 때문이다. 실제로 봐야 할 신호는 셋이다.

- **평소 목록에 없던 `dstaddr`가 상위에 새로 등장했는가.** 절대량보다 *새로움*이 신호다.
- **`dstport`가 비정상적인가.** 443/80이면 흔하지만, 대량 전송이 임의의 고포트나 22/53 같은 곳으로 나가면 터널링·우회 의심이다.
- **`avg_packet_size`가 작은데 `flows`가 매우 많은가.** 이는 대용량 전송이 아니라 **비컨(beacon)** 또는 DNS 터널링의 모양이다. 반출은 바이트가 크고, C2 통신은 **작고 규칙적**이다. 두 위협은 완전히 다른 지표로 잡힌다.

```sql
-- ③ 비컨 탐지: 일정한 간격으로 반복되는 소량 통신
SELECT srcaddr, dstaddr, dstport,
       count(*) AS flows,
       sum(bytes) AS total_bytes,
       count(DISTINCT date_trunc('hour', from_unixtime(start))) AS active_hours
FROM vpc_flow_logs
WHERE year='2026' AND month='03' AND day='14'
  AND action = 'ACCEPT'
GROUP BY srcaddr, dstaddr, dstport
HAVING count(*) > 200 AND sum(bytes) < 5000000
   AND count(DISTINCT date_trunc('hour', from_unixtime(start))) >= 20
ORDER BY flows DESC;
```

이 쿼리의 `HAVING` 절이 곧 비컨의 정의다 — **호출은 많고, 총량은 적고, 하루 종일 끊이지 않는다.** 사람이 쓰는 트래픽은 업무 시간에 몰리고 총량이 크다. 24시간 균일하게 소량을 주고받는 흐름은 기계이며, 그 기계가 우리가 모르는 기계라면 문제다.

```sql
-- ④ NAT 뒤의 진짜 출발지 식별
SELECT pkt_srcaddr AS real_source, srcaddr AS seen_as,
       dstaddr, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE year='2026' AND month='03' AND day='14'
  AND action = 'ACCEPT' AND flow_direction = 'egress'
GROUP BY pkt_srcaddr, srcaddr, dstaddr
ORDER BY total_bytes DESC LIMIT 20;
```

> ⚠️ **함정**: Flow Logs 쿼리에서 가장 흔한 판독 오류는 **`REJECT`가 없다고 안전하다고 결론짓는 것**이다. Flow Logs의 `action`은 *보안 그룹·NACL이 허용했는가*를 말할 뿐, 그 트래픽이 정당한지는 말하지 않는다. 정상적으로 열린 443 포트를 통한 데이터 반출은 전부 `ACCEPT`로 기록된다. 그리고 Flow Logs에는 **페이로드가 없다** — 무엇이 오갔는지는 알 수 없고 얼마나 오갔는지만 안다. 내용 검사가 필요하면 Traffic Mirroring + IDS, 이름 기반 단서가 필요하면 Route 53 Resolver 쿼리 로그가 별도로 필요하다.

> 🎯 **시나리오**: "EC2에서 외부로 대량 데이터가 나간 정황이 있다. 어떤 로그로 무엇을 확인하는가"라는 문항의 정답 조합은 층으로 나뉜다. **얼마나 나갔나** → VPC Flow Logs(바이트·목적지). **어디로 나갔나(도메인)** → Route 53 Resolver 쿼리 로그. **무엇이 나갔나(어떤 객체)** → CloudTrail S3 데이터 이벤트. **누가 시켰나** → CloudTrail 관리 이벤트 + 세션 역추적. 한 로그로 전부 답하려는 보기는 오답이다. 각 로그가 답할 수 있는 질문의 경계를 아는 것이 이 영역의 핵심 능력이다.

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

### 질의 언어의 실전 무기 네 가지

Logs Insights의 문법은 작지만, 조사에서 반복해 쓰는 도구는 몇 개로 정해져 있다.

**(1) `parse` — 구조화되지 않은 로그에서 필드를 뽑는다.** 애플리케이션 로그나 ALB 로그처럼 JSON이 아닌 텍스트에서 필요한 조각만 꺼낸다.

```
fields @timestamp, @message
| parse @message "user=* action=* result=*" as user, action, result
| filter result = "denied"
| stats count(*) as denials by user, action
| sort denials desc
```

**(2) `stats ... by bin()` — 시간의 모양을 본다.** 앞의 day1에서 본 것처럼 *숫자의 크기보다 곡선의 모양*이 판단을 준다.

**(3) `dedup` — 반복을 접어 고유한 것만 남긴다.** "어떤 종류의 오류가 있었나"를 훑을 때 유용하다.

```
fields @timestamp, errorCode, eventName, userIdentity.arn
| filter ispresent(errorCode)
| dedup errorCode, eventName
| sort @timestamp desc
```

**(4) 다중 로그 그룹 질의 — 애플리케이션과 인프라를 한 화면에서 본다.** 사고 시각을 중심으로 서로 다른 로그 그룹을 함께 조회하면 인과가 드러난다. 다만 한 번에 지정할 수 있는 로그 그룹 수에는 한도가 있으므로, 조사 대상 그룹을 미리 명명 규칙으로 묶어 두는 것이 실무 준비 작업이다.

```
# 마스킹된 민감 필드를 권한이 있는 조사자만 원문으로 확인
fields @timestamp, @message
| filter @message like /payment/
| unmask @message
| limit 50
```

마지막 예의 `unmask`는 day1에서 본 데이터 보호 정책과 짝을 이룬다. 평소에는 마스킹된 값을 보고, **`logs:Unmask` 권한을 가진 조사자만** 원문을 본다. 즉 "로그를 볼 권한"과 "민감정보를 볼 권한"이 분리된다 — 최소 권한 원칙을 로그 열람에도 적용하는 방법이다.

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

> ⚠️ **함정**: OpenSearch 도메인 자체가 **보호해야 할 자산**이라는 점을 놓치기 쉽다. 조직의 모든 로그가 모여 있으므로, 도메인이 인터넷에 노출되면 그것은 로그 유출이 아니라 *조직 전체의 내부 구조 유출*이다. 필수 통제는 넷이다 — (1) **VPC 내 배치**(퍼블릭 엔드포인트 금지), (2) **저장·전송 암호화**와 노드 간 암호화, (3) **세분화된 접근 제어(FGAC)**로 인덱스·필드 단위 권한 분리, (4) Dashboards 접근에 **Cognito 등 인증 연동**. "도메인 접근 정책에 `Principal: *`를 두고 IP 조건만으로 제한"하는 구성은 시험에서 반복되는 오답 패턴이다.

## 한 장으로 보는 질의 계층

```
[ 로그가 태어나서 질문에 답하기까지 ]

  원천                수집 경로                 저장 계층              질의 도구
┌──────────┐                              ┌────────────────┐
│CloudTrail│──┬─▶ CloudWatch Logs ────────│ 핫: 수 일~수십 일│──▶ Logs Insights
│VPC Flow  │  │   (알람 걸 로그만)         │ 단가 높음·즉시성 │    "지금 무슨 일?"
│Route 53  │  │        │                  └────────────────┘
│ALB/WAF   │  │        │ Subscription Filter
│앱 로그    │  │        ▼
└──────────┘  │   Firehose ──────────────┌────────────────┐
              │   (버퍼·변환)             │ 웜: 인덱스      │──▶ OpenSearch
              │        └──────────────────│ 상시 클러스터   │    Dashboards
              │                           └────────────────┘    "상시 감시"
              │                                   │ ISM으로 롤오버
              │                                   ▼
              └─▶ S3 (원본 아카이브) ─────┌────────────────┐
                       │                  │ 콜드: 장기 보관 │──▶ Athena
                       │  Parquet 변환     │ 단가 낮음       │    "그때 무슨 일이었나"
                       │  파티션 프로젝션   └────────────────┘
                       ▼
                  Security Lake (OCSF 정규화, day4) ──▶ 서드파티 SIEM

  ─────────────────────────────────────────────────────────────────
  질문의 시제로 도구가 정해진다:
    현재형("지금")  → Logs Insights / OpenSearch
    현재완료("계속") → OpenSearch 대시보드·경보
    과거형("그때")   → Athena
```

이 그림에서 가장 자주 잘못 그려지는 화살표는 **CloudWatch Logs에서 S3로 가는 경로**다. 실무에서 그 경로는 "CloudWatch Logs에 모든 것을 넣고 나중에 S3로 내보낸다"가 아니라, **처음부터 두 갈래로 나눠 보낸다**가 옳다. 알람이 필요한 로그만 CloudWatch Logs로, 전체 원본은 S3로 직행. 전자를 통해 후자를 만들려 하면 비용이 두 배가 되고 지연이 늘어난다.

## 도구 선택 요약

| 도구 | 데이터 위치 | 시간성 | 최적 용도 |
|------|------------|--------|-----------|
| **Athena** | S3 | 사후·일회성 | 대용량 CloudTrail/VPC Flow 포렌식, 저비용 장기 조사 |
| **Logs Insights** | CloudWatch Logs | 즉시·운영 | 사고 대응 중 빠른 로그 질의, 단기 운영 |
| **OpenSearch** | 인덱스(Firehose 적재) | 준실시간·상시 | SIEM 대시보드, 전문검색, 반복 상관 분석 |

> 📚 **사례**: 대형 클라우드 침해 사고의 사후 보고서에서 반복되는 문장이 있다 — **"관련 신호는 이미 로그에 있었다."** 침해가 성립하는 이유는 대개 로그가 없어서가 아니라, 있는 로그에 *아무도 그 질문을 던지지 않아서*다. 이 관찰이 위협 헌팅(threat hunting)이라는 분야를 만들었다. 헌팅의 전제는 "알람이 울리기를 기다리지 않고, 가설을 세워 로그에 먼저 물어본다"이며, 오늘 배운 쿼리들이 정확히 그 질문의 형태다. "이 역할이 평소와 다른 리전에서 호출된 적 있나", "생성 직후 사용된 액세스 키가 있나", "24시간 균일하게 소량 통신하는 흐름이 있나" — 이 질문들은 어떤 탐지기도 자동으로 던져 주지 않는다. **탐지기는 알려진 나쁜 것을 잡고, 헌팅은 아직 이름이 없는 것을 찾는다.** 로그 분석 도구를 아는 것이 시험 범위라면, 그 도구로 무엇을 물을지 아는 것이 실무 범위다.

## 정리하며

오늘의 세 도구는 경쟁 관계가 아니라 **데이터의 위치와 질문의 시제에 따른 분업**이다. 한 문장으로 줄이면 이렇다 — **"지금"은 Logs Insights, "계속"은 OpenSearch, "그때"는 Athena.**

그리고 이 분업 위에 오늘 반복해 나온 세 가지 원칙이 있다.

1. **스캔량이 곧 비용이다.** 파티션(경로) → 컬럼형(읽는 열) → 압축(물리 바이트)의 세 손잡이는 곱으로 작동한다. 파티션 키가 아닌 컬럼으로 기간을 거르는 순간 첫 손잡이가 무력화된다.
2. **결과를 읽는 법이 쿼리보다 중요하다.** `count(*)` 1위가 아니라 `distinct_apis`·`avg_packet_size`·`ips`처럼 *비율과 다양성*을 보는 열이 판단을 만든다. 대량이 아니라 **비정상적 형태**가 신호다.
3. **각 로그가 답할 수 있는 질문에는 경계가 있다.** Flow Logs는 얼마나, 데이터 이벤트는 무엇을, 관리 이벤트는 누가, Resolver 로그는 어디로. 한 로그로 전부 답하려는 설계는 조사 단계에서 반드시 막힌다.

day4에서는 이렇게 얻은 신호를 사람이 매번 쿼리하지 않아도 되도록 **EventBridge로 자동 라우팅**하고, 조직 전역의 로그를 하나의 스키마로 모으는 Security Lake를 다룬다.

## 한 줄 요약 체크리스트

- [ ] CloudTrail·Flow Logs 테이블에 파티션 프로젝션(또는 Hive 파티션)을 걸었는가
- [ ] 모든 조사 쿼리가 **파티션 키로 먼저** 기간을 좁히는가
- [ ] 작업 그룹에 스캔 상한과 결과 버킷 암호화를 강제했는가
- [ ] 쿼리 결과 버킷을 원본 로그 버킷과 같은 수준으로 보호하는가
- [ ] 반복 조사 대상은 Parquet으로 한 번 굳혀 두었는가
- [ ] 알람이 필요한 로그만 CloudWatch Logs로 보내고 원본은 S3로 직행시키는가
- [ ] OpenSearch 도메인을 VPC에 두고 FGAC·암호화·대시보드 인증을 구성했는가
- [ ] "얼마나·무엇을·누가·어디로"를 각각 어떤 로그로 답할지 정리되어 있는가

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
