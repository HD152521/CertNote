# Day 1 - 데이터 변환과 ETL: AWS Glue, Spark, 그리고 EMR

지난 주에 우리는 데이터를 "어디서, 어떻게 가져오는가"(수집·저장)를 다뤘다. 이제 그 원시 데이터를 **모델이 먹을 수 있는 형태로 가공**하는 단계로 넘어간다. 이것이 변환(transformation)이며, 흔히 ETL(Extract-Transform-Load)이라 부른다. MLS-C01 시험에서 ETL은 "어떤 도구를, 어떤 규모에서, 어떤 비용·운영 부담으로 선택하는가"를 묻는 핵심 영역이다.

오늘은 AWS의 대표적인 변환 도구인 **AWS Glue**(서버리스 Spark)와 **Amazon EMR**(관리형 Hadoop/Spark 클러스터)을 비교하고, 대규모 전처리를 설계하는 안목을 기른다.

## ETL이란 무엇인가

ETL은 세 글자의 합성이다.

| 단계 | 의미 | ML에서의 예 |
|------|------|------------|
| Extract(추출) | 원천에서 데이터를 끌어온다 | S3, RDS, DynamoDB, 로그에서 읽기 |
| Transform(변환) | 정제·조인·집계·인코딩한다 | 결측치 처리, 범주형 인코딩, 피처 계산 |
| Load(적재) | 가공 결과를 목적지에 쓴다 | 학습용 S3 버킷, 피처 스토어에 저장 |

ML 파이프라인에서 ETL의 결과물은 곧 **학습 데이터셋**이다. 따라서 변환 로직의 정확성과 재현성이 모델 품질을 직접 좌우한다.

> 💡 **관련 이론**: 최근에는 ELT(Extract-Load-Transform)라는 변형도 쓰인다. 원시 데이터를 먼저 데이터 레이크(S3)에 적재해 두고, 필요할 때 변환하는 방식이다. 데이터 레이크 + Athena/Spark 조합은 사실상 ELT 패턴이며, 정형화가 덜 된 대규모 데이터를 유연하게 다룰 때 유리하다.

## AWS Glue — 서버리스 ETL의 중심

AWS Glue는 **서버를 직접 관리하지 않는(serverless) Apache Spark 기반 ETL 서비스**다. 클러스터를 띄우고 끄는 일을 AWS가 대신 해 주므로, 엔지니어는 변환 로직에만 집중할 수 있다. Glue의 핵심 구성 요소를 알아 두자.

- **Glue Data Catalog**: 데이터의 스키마·위치·파티션 정보를 담는 중앙 메타데이터 저장소. Athena, EMR, Redshift Spectrum이 공유한다.
- **Glue Crawler**: S3 등의 데이터를 스캔해 스키마를 자동 추론하고 Data Catalog에 테이블을 등록한다.
- **Glue ETL Job**: 실제 변환을 수행하는 Spark(또는 Python Shell) 작업. PySpark 또는 Scala로 작성한다.
- **DynamicFrame**: Glue가 제공하는 Spark DataFrame의 확장. 스키마가 불규칙한 데이터를 다루는 데 유리하다.

```python
# Glue PySpark ETL 작업의 골격
import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ['JOB_NAME'])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# 1) Data Catalog에서 원시 데이터 읽기 (Extract)
raw = glueContext.create_dynamic_frame.from_catalog(
    database="ml_raw", table_name="clicks"
)

# 2) 변환: 결측 행 제거 + 컬럼 매핑 (Transform)
mapped = ApplyMapping.apply(frame=raw, mappings=[
    ("user_id", "string", "user_id", "string"),
    ("ts", "string", "event_time", "timestamp"),
    ("amount", "string", "amount", "double"),
])
clean = DropNullFields.apply(frame=mapped)

# 3) 학습용 S3 버킷에 Parquet로 적재 (Load)
glueContext.write_dynamic_frame.from_options(
    frame=clean,
    connection_type="s3",
    connection_options={"path": "s3://ml-train/clicks/"},
    format="parquet"
)
job.commit()
```

> 💡 **관련 이론**: Glue 작업의 처리 용량은 **DPU(Data Processing Unit)** 단위로 측정된다. 1 DPU ≈ 4 vCPU + 16GB 메모리. 작업이 느리면 DPU 수(worker 수)를 늘려 수평 확장하거나, **Glue 3.0/4.0**의 최신 Spark 엔진을 사용해 성능을 끌어올린다. 비용은 사용한 DPU-시간만큼만 청구된다.

## Amazon EMR — 풀 컨트롤 빅데이터 클러스터

EMR(Elastic MapReduce)은 **Hadoop, Spark, Hive, Presto, HBase** 등 빅데이터 프레임워크를 EC2 클러스터 위에서 직접 운영하는 관리형 서비스다. Glue가 "Spark만, 서버리스로, 단순하게"라면, EMR은 "여러 엔진을, 세밀하게 튜닝하며, 직접 제어"하는 선택지다.

EMR이 유리한 상황:
- 페타바이트급 데이터를 장시간 처리하며 **세밀한 클러스터 튜닝**(인스턴스 타입, 메모리, executor 설정)이 필요할 때
- Spark 외에 Hive, Presto, HBase 등 **다양한 프레임워크**를 함께 써야 할 때
- 스팟 인스턴스로 **비용을 대폭 절감**하고 싶을 때(중단 허용 워크로드)

```bash
# EMR 클러스터 생성 (Spark 포함) — CLI 예시
aws emr create-cluster \
  --name "ml-preprocess" \
  --release-label emr-7.1.0 \
  --applications Name=Spark \
  --instance-groups \
    InstanceGroupType=MASTER,InstanceCount=1,InstanceType=m5.xlarge \
    InstanceGroupType=CORE,InstanceCount=4,InstanceType=m5.2xlarge \
  --use-default-roles \
  --auto-terminate
```

`--auto-terminate`는 작업이 끝나면 클러스터를 자동 종료해 비용을 막는다. 또한 **EMR Serverless**라는 옵션도 등장했는데, 이는 클러스터 관리 부담 없이 Spark/Hive 작업을 실행하는 방식으로 Glue와 EMR의 중간쯤에 위치한다.

> 💡 **관련 이론**: 시험에서 Glue vs EMR 선택은 단골 주제다. 판단 기준은 (1) **운영 부담**: 관리 최소화 → Glue, 세밀 제어 → EMR. (2) **워크로드 성격**: 짧고 산발적 → Glue, 길고 무거운 정기 배치 → EMR. (3) **프레임워크 다양성**: Spark만이면 Glue로 충분, 여러 엔진 필요하면 EMR.

## 대규모 전처리 설계 원칙

데이터가 수 테라바이트를 넘어가면 "어떻게 변환하느냐" 못지않게 "어떻게 효율적으로 저장·읽느냐"가 중요해진다.

1. **컬럼형 포맷 사용**: CSV/JSON 대신 **Parquet/ORC**를 쓰면 압축률과 스캔 효율이 크게 오른다. 필요한 컬럼만 읽어 I/O를 줄인다.
2. **파티셔닝**: `s3://bucket/year=2026/month=06/` 처럼 자주 필터링하는 키로 파티션을 나누면 Spark/Athena가 불필요한 데이터를 건너뛴다(partition pruning).
3. **파일 크기 최적화**: 너무 많은 작은 파일(small files problem)은 오버헤드를 키운다. 128MB~1GB 정도로 합치는 것이 일반적 권장이다.
4. **푸시다운(predicate pushdown)**: 필터 조건을 데이터 소스 단계에서 적용해 읽는 양 자체를 줄인다.

```python
# Spark에서 파티션 + 컬럼 프루닝을 활용한 효율적 읽기
df = (spark.read.parquet("s3://ml-train/clicks/")
      .filter("year = 2026 AND month = 6")   # 파티션 프루닝
      .select("user_id", "event_time", "amount"))  # 컬럼 프루닝
```

> ⚠️ **함정**: "데이터가 크니까 무조건 EMR로 큰 클러스터를 띄우자"는 흔한 오답 유도다. 작업이 산발적이고 운영 인력이 적다면, 큰 EMR 클러스터를 상시 운영하는 것은 비용·관리 측면에서 비효율적이다. 이럴 땐 Glue나 EMR Serverless가 더 적합하다.

## SageMaker와의 연결

전처리 결과는 결국 SageMaker 학습으로 흘러간다. AWS는 변환과 학습을 잇는 여러 경로를 제공한다.

- **SageMaker Processing**: scikit-learn/Spark 컨테이너로 전처리를 실행하는 SageMaker 네이티브 기능. 학습 전후 처리에 자주 쓰인다.
- **Glue → S3 → SageMaker Training**: Glue로 만든 Parquet를 S3에 두고 학습 작업이 읽는, 가장 보편적인 패턴.
- **SageMaker Data Wrangler**: GUI 기반으로 변환 흐름을 설계하고, 이를 Processing 작업이나 파이프라인으로 내보낸다.

> 💡 **관련 이론**: SageMaker Processing과 Glue는 역할이 겹쳐 보이지만 결이 다르다. Glue는 **데이터 레이크 전반의 ETL**(여러 소비자가 공유하는 정제 데이터 생산)에 강하고, SageMaker Processing은 **특정 ML 작업에 종속된 전처리**(이 모델만을 위한 피처 생성)에 자연스럽게 통합된다.

## 정리하며

오늘은 ETL의 개념과 AWS의 두 주력 도구를 비교했다. **Glue는 서버리스 Spark로 운영 부담이 적고 산발적·표준적 ETL에 적합**하며, **EMR은 세밀한 제어와 다양한 프레임워크가 필요한 무거운 워크로드에 적합**하다. 대규모 전처리에서는 Parquet, 파티셔닝, 파일 크기 최적화 같은 저장 전략이 처리 성능을 좌우한다. 그리고 이 모든 변환 결과는 SageMaker 학습으로 이어진다.

내일은 이 변환 작업들을 손으로 매번 돌리지 않고, **Step Functions와 SageMaker Pipelines로 자동화**하는 학습 데이터 파이프라인을 살펴본다.

---

## 📝 연습 문제

**문제 1.** 운영 인력이 적은 팀이 하루 몇 차례 산발적으로 발생하는 표준 Spark 변환 작업을 처리하려 한다. 클러스터를 직접 띄우고 관리하는 부담을 최소화하려면?

A) AWS Glue 서버리스 ETL 작업을 사용한다  
B) 대형 EMR 클러스터를 상시 운영한다  
C) EC2에 직접 Spark를 설치해 운영한다  
D) DynamoDB 스트림으로 변환한다  

**정답: A**  
해설: Glue는 서버리스 Spark로 클러스터 프로비저닝·관리 부담이 없고, 사용한 DPU-시간만 과금되므로 산발적·표준적 ETL에 가장 적합하다. 상시 EMR(B)이나 직접 운영 EC2(C)는 운영 부담과 유휴 비용이 크다. DynamoDB 스트림(D)은 대규모 Spark 변환 도구가 아니다.

---

**문제 2.** 페타바이트급 데이터를 장시간 처리하며 Spark뿐 아니라 Hive와 Presto를 함께 사용하고, 인스턴스 타입과 메모리를 세밀하게 튜닝해야 한다. 가장 적합한 서비스는?

A) AWS Glue  
B) Amazon Athena  
C) Amazon EMR  
D) AWS Lambda  

**정답: C**  
해설: EMR은 Spark·Hive·Presto 등 다양한 프레임워크를 EC2 클러스터에서 직접 운영하며 세밀한 튜닝과 스팟 인스턴스 비용 절감이 가능하다. Glue(A)는 주로 Spark 중심의 서버리스 ETL이고, Athena(B)는 SQL 질의 서비스, Lambda(D)는 짧은 함수 실행에 적합해 무거운 빅데이터 클러스터 워크로드에는 부적합하다.

---

**문제 3.** S3에 저장된 대규모 학습 데이터를 Spark로 읽을 때, 스캔 비용과 I/O를 가장 효과적으로 줄이는 저장 전략의 조합은?

A) CSV 포맷 + 단일 거대 파일  
B) JSON 포맷 + 무작위 파일 분할  
C) Parquet 컬럼형 포맷 + 자주 필터링하는 키로 파티셔닝  
D) 압축하지 않은 텍스트 + 컬럼 순서 무작위  

**정답: C**  
해설: Parquet 같은 컬럼형 포맷은 필요한 컬럼만 읽고 압축률이 높으며, 파티셔닝은 불필요한 데이터를 건너뛰는 partition pruning을 가능하게 해 스캔량을 크게 줄인다. CSV·JSON·비압축 텍스트는 행 기반이라 컬럼 프루닝이 약하고 I/O가 비효율적이다.

---

**문제 4.** AWS Glue에서 S3 데이터를 스캔해 스키마를 자동 추론하고 중앙 메타데이터 저장소에 테이블로 등록하는 구성 요소는?

A) Glue ETL Job  
B) Glue Crawler  
C) DynamicFrame  
D) DPU  

**정답: B**  
해설: Glue Crawler가 데이터를 스캔해 스키마를 추론하고 Glue Data Catalog에 테이블을 등록한다. ETL Job(A)은 실제 변환을 수행하고, DynamicFrame(C)은 변환에 쓰는 데이터 구조, DPU(D)는 처리 용량 단위로 스키마 등록과는 무관하다.

---

**문제 5.** ML 파이프라인에서 "데이터 레이크 전반의 공유 정제 데이터 생산"과 "특정 모델만을 위한 전처리"를 구분할 때 일반적으로 더 적합한 도구 짝으로 옳은 것은?

A) 둘 다 SageMaker Processing이 적합  
B) 둘 다 EMR이 유일한 정답  
C) 공유 정제는 Lambda, 모델 전용 전처리는 Athena  
D) 공유 정제는 Glue, 모델 전용 전처리는 SageMaker Processing  

**정답: D**  
해설: Glue는 여러 소비자가 공유하는 데이터 레이크 전반의 ETL에 강하고, SageMaker Processing은 특정 ML 작업에 종속된 전처리에 자연스럽게 통합된다. 둘은 역할이 겹쳐 보여도 결이 다르므로 상황에 맞게 나눠 쓰는 것이 정석이다. A·B·C는 이 역할 구분을 반영하지 못한다.

---
