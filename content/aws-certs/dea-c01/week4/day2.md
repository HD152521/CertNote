# Day 2 - Glue ETL Job: Spark 위에서 데이터를 변환하다

## 📌 핵심 정리

- Glue ETL Job은 서버리스 Spark다. 과금은 **DPU × 실행 시간**이고, 워커 유형·워커 수·타임아웃이 곧 비용 설정이다.
- **DynamicFrame**은 타입이 충돌하는 컬럼을 Choice 타입으로 보존하고, `ResolveChoice`로 어떻게 정리할지 나중에 정한다.
- 모든 Job은 Source → Transform → Sink 구조이며, 출력은 파티션을 나눈 Parquet/ORC가 정석이다.
- **Job 북마크**는 Enable + `transformation_ctx` + `job.commit()`이 모두 있어야 동작한다. 기본값은 Disable이다.
- 작은 작업은 Python Shell, 급하지 않은 배치는 Flex, 단계마다 부하가 다른 Job은 Auto Scaling으로 비용을 낮춘다.

## DynamicFrame: Spark DataFrame을 ETL에 맞게 확장하다

어제 만든 Data Catalog는 "데이터가 어디 있고 어떻게 생겼는지"만 안다. 하지만 데이터 엔지니어링의 본질은 그 데이터를 **변환(Transform)**하는 것이다. 더러운 CSV를 깔끔한 Parquet으로, 분산된 테이블을 조인된 팩트 테이블로, 원시 로그를 집계된 지표로 바꾸는 일. 이 변환을 서버리스로 실행하는 것이 **AWS Glue ETL Job**이다.

Glue ETL Job은 내부적으로 **Apache Spark**를 돌린다. 즉 Glue는 "관리형 Spark"인 셈이다. 클러스터를 직접 띄우고 끄는 EMR과 달리, Glue는 Job을 제출하면 AWS가 Spark 환경을 자동으로 프로비저닝하고 끝나면 회수한다. 과금 단위는 **DPU(Data Processing Unit)**이며, 1 DPU = 4 vCPU + 16GB 메모리다. 실행 시간(초 단위)에 비례해 과금된다.

Spark를 써 봤다면 **DataFrame**이 익숙할 것이다. Glue는 여기에 한 겹을 더 씌운 **DynamicFrame**이라는 자료구조를 도입했다. 왜 또 다른 추상화가 필요했을까?

| 항목 | Spark DataFrame | Glue DynamicFrame |
|------|-----------------|-------------------|
| 스키마 | 사전 고정 필요 | 스키마 추론, 자기 기술적(self-describing) |
| 타입 충돌 | 오류 또는 강제 캐스팅 | Choice 타입으로 양쪽 보존 |
| 더티 데이터 | 처리 어려움 | ETL 변환(ResolveChoice 등) 내장 |
| Catalog 연동 | 별도 작업 | 네이티브 통합 |

핵심 차이는 **스키마 유연성**이다. 실제 데이터는 더럽다. 같은 컬럼이 어떤 행에서는 정수, 다른 행에서는 문자열일 수 있다. DataFrame은 이런 충돌에서 깨지지만, DynamicFrame은 **Choice 타입**으로 두 타입을 모두 보존한 뒤, 나중에 `ResolveChoice` 변환으로 어떻게 정리할지 결정하게 해 준다. ETL은 "예상치 못한 데이터"를 다루는 일이므로 이 유연성이 가치가 있다.

```python
import sys
from awsglue.context import GlueContext
from awsglue.transforms import ResolveChoice, ApplyMapping
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# 소스: Catalog 테이블에서 DynamicFrame 생성
orders = glueContext.create_dynamic_frame.from_catalog(
    database="sales_db",
    table_name="orders"
)

# 타입 충돌(Choice) 해소: 모두 문자열로 캐스팅
resolved = ResolveChoice.apply(
    frame=orders,
    choice="cast:string"
)
```

DynamicFrame은 "스키마-온-리드"를 코드 레벨에서 구현한 것이다. 전통적 ETL 도구는 매핑을 사전에 엄격히 정의해야 하지만(스키마-온-라이트적), 데이터 레이크 시대의 ETL은 "일단 받아들이고, 변환 과정에서 정제한다"는 ELT/스키마-온-리드 철학을 따른다. DynamicFrame의 Choice 타입과 ResolveChoice는 이 철학을 Spark 위에서 실현한 장치다. 필요하면 `.toDF()`로 DataFrame으로, `.fromDF()`로 다시 DynamicFrame으로 자유롭게 오갈 수 있다.

## ETL의 3단계: Source → Transform → Sink

모든 Glue Job은 결국 세 단계의 조합이다.

```
[Source]  Catalog/S3/JDBC에서 데이터를 읽어 DynamicFrame 생성
   ↓
[Transform]  매핑, 필터, 조인, 집계, 타입 해소
   ↓
[Sink]  S3/Catalog/Redshift/JDBC로 결과를 기록
```

```python
# Transform: 컬럼 매핑/이름변경/타입변환
mapped = ApplyMapping.apply(
    frame=resolved,
    mappings=[
        ("order_id", "string", "id", "long"),
        ("amount",   "string", "amount", "double"),
        ("status",   "string", "status", "string"),
    ]
)

# Sink: 파티션을 나눠 Parquet으로 S3 기록
glueContext.write_dynamic_frame.from_options(
    frame=mapped,
    connection_type="s3",
    connection_options={
        "path": "s3://my-lake/orders-clean/",
        "partitionKeys": ["status"]
    },
    format="parquet"
)
```

`ApplyMapping`은 ETL에서 가장 자주 쓰는 변환이다. 컬럼 이름을 바꾸고, 타입을 변환하고, 불필요한 컬럼을 떨어뜨린다. `write_dynamic_frame`의 `partitionKeys`로 출력 데이터를 파티션 폴더로 자동 분할하면, 다운스트림 쿼리가 프루닝의 이점을 누린다. 출력 형식은 분석에 유리한 **Parquet/ORC(컬럼형 + 압축)**가 정석이다.

Glue Job에는 두 가지 실행 타입이 있다. 표준 Spark Job(대용량 분산 처리)과 **Python Shell Job**(단일 노드에서 가벼운 파이썬 스크립트, 작은 데이터/오케스트레이션용)이다. 수 GB 이상 분산 변환이면 Spark Job, 수백 MB 이하의 가벼운 작업이나 API 호출·메타데이터 정리면 Python Shell이 훨씬 싸다. 또한 Glue 3.0/4.0은 Spark 버전이 다르므로, 라이브러리 호환성을 확인해야 한다.

## Job 북마크: 증분 처리의 핵심

매일 새 데이터가 들어오는 파이프라인에서, Job을 돌릴 때마다 전체 데이터를 다시 처리하면 비용과 시간이 폭증한다. **Job 북마크(Job Bookmark)**는 "이전 실행에서 어디까지 처리했는지"를 Glue가 기억해, 다음 실행에서는 **새로 추가된 데이터만** 처리하게 해 준다.

```python
from awsglue.job import Job
from awsglue.utils import getResolvedOptions

args = getResolvedOptions(sys.argv, ['JOB_NAME'])
job = Job(glueContext)
job.init(args['JOB_NAME'], args)   # 북마크 컨텍스트 초기화

# ... 소스 읽기 시 transformation_ctx 지정이 핵심 ...
orders = glueContext.create_dynamic_frame.from_catalog(
    database="sales_db",
    table_name="orders",
    transformation_ctx="orders_src"   # 북마크가 이 식별자로 진행 상태 추적
)

# ... 변환과 싱크 ...

job.commit()   # 여기서 북마크 상태가 갱신됨
```

북마크가 동작하려면 세 가지가 필요하다. (1) Job 속성에서 북마크를 **Enable**, (2) 소스/싱크에 `transformation_ctx` 지정, (3) 마지막에 `job.commit()` 호출. 북마크는 S3 객체의 타임스탬프나 JDBC의 기본키/타임스탬프 컬럼을 기준으로 신규 데이터를 식별한다.

> ⚠️ **함정**: 북마크는 만능이 아니다. S3 소스는 객체의 최종 수정 시각으로 신규 여부를 가리므로, 이미 처리한 파일이 **수정(덮어쓰기)**되면 다음 실행에서 다시 읽혀 타깃에 중복이 생길 수 있다. 또 `job.commit()`을 빠뜨리거나 `transformation_ctx`를 지정하지 않으면 북마크가 전혀 동작하지 않는다. 과거 데이터를 다시 처리하려면 북마크를 **Reset**하거나 일시 Disable해야 한다. 시험에서 "Glue가 매번 전체를 재처리한다" 또는 "증분 처리"가 나오면 Job 북마크를 떠올려야 한다.

## 오케스트레이션: 트리거와 워크플로우

여러 Job과 크롤러를 순서대로 엮어야 할 때가 많다. Glue는 **트리거(Trigger)**와 **워크플로우(Workflow)**를 제공한다. 트리거는 스케줄(cron), 온디맨드, 이벤트(이전 Job 성공/실패) 기반으로 다음 단계를 시작한다. 워크플로우는 크롤러 → Job → 크롤러 같은 DAG를 시각적으로 구성한다. 더 복잡한 분기·재시도·외부 서비스 연동이 필요하면 **Step Functions**나 **MWAA(Airflow)**로 오케스트레이션을 끌어올린다.

> 🎯 **시나리오**: 매일 raw CSV가 S3에 적재되고, 이를 정제·타입변환해 Parquet으로 저장한 뒤 분석 가능하게 만들어야 한다. 구성은 (1) 크롤러가 raw 테이블 등록 → (2) Glue ETL Job이 `from_catalog`로 읽고 `ApplyMapping`·`ResolveChoice`로 정제 후 Parquet 싱크 → (3) **Job 북마크 Enable**로 어제 신규분만 증분 처리 → (4) 후속 크롤러가 정제 테이블 갱신 → (5) Workflow 트리거로 전체를 매일 새벽 자동 실행. Athena가 정제 테이블을 바로 조회한다.

## 워커 유형과 실행 옵션: 비용이 결정되는 곳

"1 DPU = 4 vCPU + 16GB"는 단위일 뿐이고, 실제로는 **워커 유형 × 워커 수 × 실행 시간**이 청구액을 만든다.

| 워커 유형 | 워커당 DPU | vCPU / 메모리 | 쓰임 |
|-----------|------------|---------------|------|
| G.1X | 1 | 4 / 16GB | 대부분의 변환·조인에 쓰는 기본 선택 |
| G.2X | 2 | 8 / 32GB | 같은 용도, 워커 하나가 더 큰 파티션을 감당 |
| G.4X / G.8X | 4 / 8 | 16·32 / 64·128GB | 무거운 집계·조인 |
| G.025X | 0.25 | 2 / 4GB | 저용량 스트리밍 Job 전용 |
| R 계열 | 1~8 | 메모리 최적화 구성 | 메모리 부족 오류가 잦은 작업 |

- **유형을 키우는 것과 수를 늘리는 것은 다른 처방이다.** 전체 데이터가 많아 느리면 워커 수를 늘린다. 반면 데이터 스큐나 큰 셔플 때문에 한 파티션이 익스큐터 메모리에 못 들어가 죽는 경우는 수를 늘려도 풀리지 않고 워커 유형을 키워야 한다.
- **Flex 실행 클래스**: 테스트, 일회성 적재, 급하지 않은 야간 배치처럼 시작이 좀 늦어도 되는 Job을 더 낮은 단가로 돌린다. Glue 3.0 이상, G.1X·G.2X에서만 쓸 수 있다. 빠른 시작과 전용 자원이 필요한 시간 민감 작업에는 표준 클래스를 쓴다.
- **Auto Scaling**: Glue 3.0 이상에서 `--enable-auto-scaling true`로 켠다. 이때 지정한 워커 수는 "최대치"가 되고, Glue가 단계별 병렬도에 맞춰 워커를 붙였다 뗀다. 일부 단계만 바쁜 Job의 과다 프로비저닝을 줄인다.
- **타임아웃**: 최대 7일까지 설정할 수 있고, 비워 두면 버전에 따라 기본값(4.0 이하 2,880분, 5.0 이상 480분)이 들어간다. Job은 실행 시간만큼 과금되므로 멈춘 Job이 오래 돌지 않게 예상 시간에 맞춰 명시한다. 타임아웃으로 끝난 Job은 자동 재시도되지 않는다.
- **최대 동시 실행 수**: 기본값은 1이다. 이전 실행이 끝나기 전에 다음 스케줄이 오면 오류로 막는다. 북마크를 쓰는 Job에서 같은 입력을 두 실행이 동시에 읽는 사고를 막는 안전장치다.
- **Python Shell Job**: 0.0625 DPU(기본) 또는 1 DPU 중에서 고른다. Spark가 없는 단일 노드이며 **Job 북마크를 쓸 수 없다**.
- **Glue 버전**은 Spark·Python 버전을 함께 결정한다(예: 4.0은 Spark 3.3 / Python 3.10, 5.0은 Spark 3.5 / Python 3.11). 새 버전이 계속 추가되므로 라이브러리 호환성은 Job마다 확인한다.

## Job 북마크의 내부 동작

북마크가 "왜 안 되는지", "왜 중복이 생기는지"는 상태가 어디에 어떻게 저장되는지를 알면 풀린다.

- 상태는 **Job 이름**별로 저장되고, 그 안에서 `transformation_ctx`가 소스·변환·싱크 각각의 키가 된다. `job.init()`이 상태를 읽고, `job.commit()`이 한꺼번에(원자적으로) 저장한다.
- 그래서 `transformation_ctx`가 없는 소스는 추적할 방법이 없고, `job.commit()` 전에 Job이 실패하면 상태가 그대로라 다음 실행이 같은 입력을 다시 읽는다. 싱크에 이미 일부가 쓰였다면 중복이 된다 — 북마크도 본질은 at-least-once다.

| 소스 | 신규 데이터 판별 기준 | 한계 |
|------|------------------------|------|
| S3 | 객체의 최종 수정 시각 | 이전 실행 뒤에 수정된 파일은 다시 처리된다 |
| JDBC | 북마크 키(기본은 기본키. 빈틈 없이 순차 증가·감소해야 한다) | 키가 그대로인 기존 행의 UPDATE·DELETE는 잡지 못한다 |

- S3 소스에서 북마크가 지원되는 형식은 JSON, CSV, Avro, XML, Parquet, ORC다.
- 옵션은 셋이다. **Enable**(상태 갱신), **Disable**(기본값, 항상 전체 처리), **Pause**(마지막 성공 실행 이후의 증분만 읽되 상태는 갱신하지 않음 — 같은 구간을 다시 돌려 검증할 때 쓴다).
- **Reset·되감기(rewind)는 소스 상태만 되돌린다.** 타깃은 북마크가 추적하지 않으므로 지워 주지 않는다. 같은 출력 경로에 다시 쓰면 중복이 되니, 재처리할 때는 출력 경로를 따로 두거나 덮어쓰도록 설계한다.
- `transformation_ctx`는 그대로 둔 채 입력 경로만 바꾸면, 옛 경로의 상태가 그대로 적용되어 새 경로의 파일을 "이미 처리했다"고 보고 건너뛸 수 있다.
- 한 파티션 아래 파일이 지나치게 많으면 북마크가 목록을 만들다 드라이버 메모리가 부족해질 수 있다.

```bash
# 북마크 옵션은 Job 파라미터로 전달된다
aws glue start-job-run --job-name daily-orders \
  --arguments '{"--job-bookmark-option":"job-bookmark-enable"}'

# 전체 재처리가 필요할 때: 북마크 초기화 (타깃 데이터는 지워지지 않는다)
aws glue reset-job-bookmark --job-name daily-orders
```

> ⚠️ **함정**: 북마크는 CDC가 아니다. JDBC 소스에서 북마크는 "키 값이 지난번보다 큰 새 행"을 가져올 뿐, 이미 가져온 행이 운영 DB에서 수정·삭제된 사실은 모른다. "운영 DB의 변경(UPDATE/DELETE 포함)을 계속 반영"이 요구사항이면 Week 3의 DMS CDC가 답이고, "추가만 되는 테이블에서 신규분만"이면 북마크로 충분하다.

## 읽는 양을 줄이는 세 가지 장치

| 장치 | 줄이는 것 | 동작 |
|------|-----------|------|
| `push_down_predicate` | 읽을 파티션 | Catalog에서 받은 파티션 목록에 조건을 먼저 적용하고, 남은 파티션의 파일만 나열·읽기 |
| `catalogPartitionPredicate` | 파티션 목록 조회 자체 | Catalog의 파티션 인덱스로 서버 쪽에서 걸러 받는다. 파티션이 수백만 개일 때 쓴다 |
| `groupFiles` / `groupSize` | 태스크 수 | 작은 파일 여러 개를 한 인메모리 파티션으로 묶어 읽는다 |

```python
orders = glueContext.create_dynamic_frame.from_catalog(
    database="sales_db",
    table_name="orders",
    transformation_ctx="orders_src",
    push_down_predicate="year == '2026' and month == '06'",  # 이 파티션만 나열·읽기
)
```

- 전부 읽은 뒤 `Filter` 변환으로 거르는 것과는 비용이 다르다. 푸시다운 프레디킷은 **파일을 나열하기도 전에** 파티션을 버린다.
- 파일 그루핑은 입력 파일이 50,000개를 넘으면 자동으로 켜진다. 지원 형식은 CSV·JSON·XML·Ion·Grok 로그이고 **Avro·Parquet·ORC에는 적용되지 않는다.** 작은 Parquet 파일 수만 개는 그루핑이 아니라 컴팩션으로 풀어야 한다.

## ResolveChoice의 네 가지 전략

본문 예제는 `cast:string` 하나만 썼지만, Choice 타입을 푸는 방법은 넷이고 결과가 다르다.

| 전략 | 결과 | 쓸 때 |
|------|------|-------|
| `cast:타입` | 지정한 타입으로 캐스팅 | 정답 타입이 분명할 때 |
| `make_cols` | `amount_int`, `amount_string`처럼 타입별 컬럼으로 분리 | 두 값을 모두 살려 따로 다룰 때 |
| `make_struct` | 한 컬럼을 두 타입을 모두 담은 구조체로 | 원본을 잃지 않고 판단을 뒤 단계로 미룰 때 |
| `project:타입` | 지정한 타입의 값만 남기고 나머지는 버림 | 다른 타입을 오염 데이터로 볼 때 |

컬럼마다 다른 전략을 쓰려면 `specs=[("amount", "cast:double"), ("code", "project:string")]`처럼 지정한다. `choice="MATCH_CATALOG"`는 Catalog 테이블에 정의된 타입에 맞춰 캐스팅한다.

## Glue ETL이 답이 아닐 때

| 단서 | 선택 | 이유 |
|------|------|------|
| 서버리스 Spark 변환, Catalog 연동, 신규분만 처리 | Glue ETL Job | 북마크와 DynamicFrame이 그대로 맞는다 |
| 수백 MB 이하, API 호출·메타데이터 정리 | Python Shell Job | 분산 처리가 필요 없다 |
| 파일이 도착하는 즉시 건당 작은 변환 | Lambda | Job을 건마다 띄우는 것은 느리고 비싸다 |
| 스트림의 JSON을 Parquet으로 적재만 | Firehose 형식 변환 | 상태 없는 변환에 Spark는 과하다 |
| Hive·HBase·Presto, 스팟과 클러스터 세부 튜닝 | EMR | Glue는 클러스터를 드러내지 않는다 |
| 운영 DB의 UPDATE·DELETE까지 지속 복제 | DMS CDC | 북마크는 신규 키만 본다 |

오늘 본 Glue ETL Job은 코드를 직접 짜야 한다는 진입 장벽이 있다. 내일은 코드 없이 비주얼로 ETL을 만드는 **Glue Studio**와 데이터 정제 도구 **DataBrew**를 다룬다.

## 📖 용어

- **DPU(Data Processing Unit)** : Glue의 처리 용량 단위. 1 DPU는 4 vCPU와 16GB 메모리에 해당하고, 사용한 DPU와 시간만큼 과금된다.
- **DynamicFrame** : Glue가 Spark DataFrame 위에 얹은 자료구조. 스키마를 미리 고정하지 않아 지저분한 데이터도 깨지지 않고 읽는다.
- **Choice 타입** : 한 컬럼에 여러 타입이 섞여 있을 때 DynamicFrame이 그 타입들을 모두 보존해 두는 표현.
- **ResolveChoice** : Choice 타입을 캐스팅·분리·구조체화·선택 중 하나로 정리하는 변환.
- **ApplyMapping** : 컬럼 이름 변경, 타입 변환, 불필요한 컬럼 제거를 한 번에 하는 변환.
- **Job 북마크** : 이전 실행이 어디까지 처리했는지 기억해 다음 실행에서 새 데이터만 읽게 하는 기능.
- **transformation_ctx** : 북마크가 소스·변환·싱크 각각의 진행 상태를 구분하는 데 쓰는 식별자 문자열.
- **푸시다운 프레디킷** : 파일을 읽기 전에 파티션 조건을 먼저 적용해 필요 없는 파티션을 아예 읽지 않게 하는 옵션.
- **Flex** : 급하지 않은 Job을 더 낮은 단가로 실행하는 Glue 실행 클래스. 시작이 늦어질 수 있다.
- **Python Shell Job** : Spark 없이 단일 노드에서 파이썬 스크립트를 돌리는 가벼운 Glue Job 유형.

## 📝 연습 문제

**문제 1.** Glue ETL Job에서 같은 컬럼이 어떤 행은 정수, 어떤 행은 문자열로 들어오는 타입 충돌을 깨지지 않고 다룰 수 있게 해 주는 Glue 고유 자료구조는?

A) Spark RDD  
B) Pandas DataFrame  
C) DynamicFrame  
D) Glue Catalog Table  

**정답: C**  
해설: DynamicFrame은 Choice 타입으로 충돌하는 타입을 모두 보존했다가 ResolveChoice로 정리할 수 있는 Glue 고유 구조다. Spark DataFrame은 타입이 사전 고정이라 충돌에 취약하고, RDD는 저수준 구조, Catalog Table은 메타데이터일 뿐 변환 자료구조가 아니다.

---

**문제 2.** 매일 새 데이터가 추가되는 S3 소스를 Glue Job이 매 실행마다 전체 재처리하지 않고 신규분만 처리하게 하려면 무엇이 필요한가?

A) Job 북마크를 Enable하고 소스에 transformation_ctx 지정 후 job.commit() 호출  
B) 크롤러를 매번 재생성한다  
C) DPU를 최대로 늘린다  
D) Python Shell Job으로 전환한다  

**정답: A**  
해설: 증분 처리는 Job 북마크로 구현한다. 북마크 Enable, 소스/싱크의 transformation_ctx 지정, 마지막 job.commit() 세 가지가 모두 갖춰져야 진행 상태가 추적된다. DPU 증설이나 Python Shell 전환은 증분 처리와 무관하다.

---

**문제 3.** Glue ETL Job의 과금 단위와 관련해 옳은 설명은?

A) 처리한 데이터 GB당 고정 요금만 부과된다  
B) Job 개수당 월 고정 요금이다  
C) 무료이며 Athena 쿼리에만 과금된다  
D) DPU(1 DPU = 4 vCPU + 16GB) 사용량과 실행 시간에 비례해 과금된다  

**정답: D**  
해설: Glue ETL은 DPU 기반으로 실행 시간에 비례해 과금된다. 1 DPU는 4 vCPU + 16GB 메모리에 해당한다. 데이터 GB 고정요금이나 Job 개수당 고정요금이 아니며, 실행 자체에 비용이 발생한다.

---

**문제 4.** 수백 MB 이하의 가벼운 데이터 정리나 API 호출 같은 단순 작업을, 분산 Spark의 오버헤드 없이 더 저렴하게 실행하려면 어떤 Glue Job 타입이 적합한가?

A) 표준 Spark Job에 DPU를 늘려 실행  
B) EMR 전용 클러스터 상시 가동  
C) Python Shell Job  
D) Managed Flink 애플리케이션  

**정답: C**  
해설: Python Shell Job은 단일 노드에서 가벼운 파이썬 스크립트를 실행하는 타입으로, 작은 데이터나 오케스트레이션·메타데이터 정리에 적합하고 분산 Spark보다 저렴하다. 큰 분산 변환이 아니면 표준 Spark Job은 과한 비용이다.

---

**문제 5.** Glue ETL Job의 일반적인 데이터 흐름을 가장 정확히 나타낸 것은?

A) Sink → Transform → Source  
B) Source(읽기) → Transform(변환) → Sink(기록)  
C) Transform만 반복 실행  
D) Catalog가 데이터를 직접 변환  

**정답: B**  
해설: 모든 Glue ETL Job은 소스에서 DynamicFrame을 읽고, 매핑·필터·조인·타입해소 등으로 변환한 뒤, S3/Catalog/Redshift 등 싱크로 기록하는 Source→Transform→Sink 흐름을 따른다. Catalog는 메타데이터 제공자일 뿐 직접 변환하지 않는다.

---
