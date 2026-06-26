# Day 2 - Glue ETL Job: Spark 위에서 데이터를 변환하다

어제 만든 Data Catalog는 "데이터가 어디 있고 어떻게 생겼는지"만 안다. 하지만 데이터 엔지니어링의 본질은 그 데이터를 **변환(Transform)**하는 것이다. 더러운 CSV를 깔끔한 Parquet으로, 분산된 테이블을 조인된 팩트 테이블로, 원시 로그를 집계된 지표로 바꾸는 일. 이 변환을 서버리스로 실행하는 것이 **AWS Glue ETL Job**이다.

Glue ETL Job은 내부적으로 **Apache Spark**를 돌린다. 즉 Glue는 "관리형 Spark"인 셈이다. 클러스터를 직접 띄우고 끄는 EMR과 달리, Glue는 Job을 제출하면 AWS가 Spark 환경을 자동으로 프로비저닝하고 끝나면 회수한다. 과금 단위는 **DPU(Data Processing Unit)**이며, 1 DPU = 4 vCPU + 16GB 메모리다. 실행 시간(초 단위)에 비례해 과금된다.

## DynamicFrame: Spark DataFrame을 ETL에 맞게 확장하다

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

> 💡 **관련 이론**: DynamicFrame은 "스키마-온-리드"를 코드 레벨에서 구현한 것이다. 전통적 ETL 도구는 매핑을 사전에 엄격히 정의해야 하지만(스키마-온-라이트적), 데이터 레이크 시대의 ETL은 "일단 받아들이고, 변환 과정에서 정제한다"는 ELT/스키마-온-리드 철학을 따른다. DynamicFrame의 Choice 타입과 ResolveChoice는 이 철학을 Spark 위에서 실현한 장치다. 필요하면 `.toDF()`로 DataFrame으로, `.fromDF()`로 다시 DynamicFrame으로 자유롭게 오갈 수 있다.

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

> 🔍 **더 깊이**: Glue Job에는 두 가지 실행 타입이 있다. 표준 Spark Job(대용량 분산 처리)과 **Python Shell Job**(단일 노드에서 가벼운 파이썬 스크립트, 작은 데이터/오케스트레이션용)이다. 수 GB 이상 분산 변환이면 Spark Job, 수백 MB 이하의 가벼운 작업이나 API 호출·메타데이터 정리면 Python Shell이 훨씬 싸다. 또한 Glue 3.0/4.0은 Spark 버전이 다르므로, 라이브러리 호환성을 확인해야 한다.

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

> ⚠️ **함정**: 북마크는 만능이 아니다. 같은 파일이 **수정(덮어쓰기)**되면 북마크는 "이미 처리함"으로 보고 건너뛸 수 있다. 또 `job.commit()`을 빠뜨리거나 `transformation_ctx`를 지정하지 않으면 북마크가 전혀 동작하지 않는다. 과거 데이터를 다시 처리하려면 북마크를 **Reset**하거나 일시 Disable해야 한다. 시험에서 "Glue가 매번 전체를 재처리한다" 또는 "증분 처리"가 나오면 Job 북마크를 떠올려야 한다.

## 오케스트레이션: 트리거와 워크플로우

여러 Job과 크롤러를 순서대로 엮어야 할 때가 많다. Glue는 **트리거(Trigger)**와 **워크플로우(Workflow)**를 제공한다. 트리거는 스케줄(cron), 온디맨드, 이벤트(이전 Job 성공/실패) 기반으로 다음 단계를 시작한다. 워크플로우는 크롤러 → Job → 크롤러 같은 DAG를 시각적으로 구성한다. 더 복잡한 분기·재시도·외부 서비스 연동이 필요하면 **Step Functions**나 **MWAA(Airflow)**로 오케스트레이션을 끌어올린다.

> 🎯 **시나리오**: 매일 raw CSV가 S3에 적재되고, 이를 정제·타입변환해 Parquet으로 저장한 뒤 분석 가능하게 만들어야 한다. 구성은 (1) 크롤러가 raw 테이블 등록 → (2) Glue ETL Job이 `from_catalog`로 읽고 `ApplyMapping`·`ResolveChoice`로 정제 후 Parquet 싱크 → (3) **Job 북마크 Enable**로 어제 신규분만 증분 처리 → (4) 후속 크롤러가 정제 테이블 갱신 → (5) Workflow 트리거로 전체를 매일 새벽 자동 실행. Athena가 정제 테이블을 바로 조회한다.

## 정리: 관리형 Spark의 힘

Glue ETL Job은 서버 관리 없이 Spark 변환을 실행한다. DynamicFrame은 더티 데이터를 견디는 유연한 자료구조이고, Source/Transform/Sink가 모든 Job의 뼈대이며, Job 북마크가 증분 처리를 가능케 한다. 다만 코드를 직접 짜야 한다는 진입 장벽이 있다. 내일은 코드 없이 비주얼로 ETL을 만드는 **Glue Studio**와 데이터 정제 도구 **DataBrew**를 다룬다.

---

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
