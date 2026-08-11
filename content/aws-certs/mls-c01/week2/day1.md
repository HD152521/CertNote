# Day 1 - 데이터 변환과 ETL: AWS Glue, Spark, 그리고 EMR

## 📌 핵심 정리

- ETL = **Extract → Transform → Load**. ML에서 이 결과물이 곧 학습 데이터셋이라 변환 로직의 정확성·재현성이 모델 품질을 좌우한다.
- **Glue** = 서버리스 Spark. 운영 부담이 적고 산발적·표준적 ETL에 적합. 과금은 DPU-시간.
- **EMR** = EC2 클러스터 위 Hadoop/Spark/Hive/Presto. 세밀한 튜닝·다중 프레임워크·스팟 절감이 필요할 때.
- 대규모 전처리의 4대 저장 전략: **컬럼형 포맷 · 파티셔닝 · 파일 크기 최적화 · 푸시다운**.
- 역할 분담: **데이터레이크 전반의 공유 정제 = Glue**, **특정 모델 전용 전처리 = SageMaker Processing**.

## ETL이란 무엇인가

지난 주에 데이터를 "어디서, 어떻게 가져오는가"(수집·저장)를 다뤘다. 이제 그 원시 데이터를 **모델이 먹을 수 있는 형태로 가공**하는 단계다. MLS-C01에서 ETL은 "어떤 도구를, 어떤 규모에서, 어떤 비용·운영 부담으로 선택하는가"를 묻는 핵심 영역이다.

| 단계 | 의미 | ML에서의 예 |
|---|---|---|
| Extract(추출) | 원천에서 데이터를 끌어온다 | S3, RDS, DynamoDB, 로그에서 읽기 |
| Transform(변환) | 정제·조인·집계·인코딩한다 | 결측치 처리, 범주형 인코딩, 피처 계산 |
| Load(적재) | 가공 결과를 목적지에 쓴다 | 학습용 S3 버킷, 피처 스토어에 저장 |

> 💡 **개념**: 최근에는 ELT(Extract-Load-Transform)라는 변형도 쓰인다. 원시 데이터를 먼저 데이터 레이크(S3)에 적재해 두고, 필요할 때 변환하는 방식이다. 데이터 레이크 + Athena/Spark 조합은 사실상 ELT 패턴이며, 정형화가 덜 된 대규모 데이터를 유연하게 다룰 때 유리하다.

### ML 전처리에서 실제로 하는 변환

| 변환 종류 | 예 | 주의 |
|---|---|---|
| 정제 | 결측 행 제거, 타입 캐스팅, 로직 오류 필터 | 통계량은 학습셋에서만 산출 |
| 조인 | 거래 테이블 + 고객 프로필 | 조인 폭발(중복 키)로 행 수가 튀는지 확인 |
| 집계 | 사용자별 최근 30일 구매 합계 | 집계 시점 기준을 명확히(미래 정보 누수) |
| 인코딩·스케일링 | 범주형 → 숫자, 표준화 | 학습·추론에서 동일한 로직 사용 |
| 파티션 재배치 | 날짜별 디렉터리로 재저장 | 파티션 과다는 작은 파일 문제를 부른다 |

## AWS Glue — 서버리스 ETL의 중심

AWS Glue는 **서버를 직접 관리하지 않는(serverless) Apache Spark 기반 ETL 서비스**다. 클러스터를 띄우고 끄는 일을 AWS가 대신 하므로 엔지니어는 변환 로직에만 집중한다.

- **Glue Data Catalog** — 데이터의 스키마·위치·파티션 정보를 담는 중앙 메타데이터 저장소. Athena, EMR, Redshift Spectrum이 공유한다.
- **Glue Crawler** — S3 등의 데이터를 스캔해 스키마를 자동 추론하고 Data Catalog에 테이블을 등록한다.
- **Glue ETL Job** — 실제 변환을 수행하는 Spark(또는 Python Shell) 작업. PySpark 또는 Scala로 작성한다.
- **DynamicFrame** — Glue가 제공하는 Spark DataFrame의 확장. 스키마가 불규칙한 데이터를 다루는 데 유리하다.
- **Glue DataBrew** — 코드 없이 시각적으로 정제 레시피를 만드는 별도 도구. 데이터 준비의 노코드 옵션이다.

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

> 💡 **개념**: Glue 작업의 처리 용량은 **DPU(Data Processing Unit)** 단위로 측정된다. 1 DPU ≈ 4 vCPU + 16GB 메모리. 작업이 느리면 DPU 수(worker 수)를 늘려 수평 확장하거나, 최신 Glue 버전의 Spark 엔진을 사용해 성능을 끌어올린다. 비용은 사용한 DPU-시간만큼만 청구된다.

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

- `--auto-terminate`는 작업이 끝나면 클러스터를 자동 종료해 비용을 막는다.
- **EMR Serverless**는 클러스터 관리 부담 없이 Spark/Hive 작업을 실행하는 방식으로, Glue와 EMR의 중간쯤에 위치한다.
- EMR 노드는 세 종류다. **마스터**(클러스터 조정), **코어**(HDFS 저장 + 연산), **태스크**(연산만). 스팟은 보통 태스크 노드에 붙인다.

### Glue vs EMR 선택표

| 판단 축 | Glue로 기운다 | EMR로 기운다 |
|---|---|---|
| 운영 부담 | 관리 최소화, 전담 인력 없음 | 세밀 제어, 튜닝 인력 있음 |
| 워크로드 성격 | 짧고 산발적, 표준 변환 | 길고 무거운 정기 배치 |
| 프레임워크 | Spark만으로 충분 | Hive·Presto·HBase 등 병행 |
| 비용 구조 | 사용한 DPU-시간만 | 스팟으로 대폭 절감 가능 |
| 시작 지연 | 잡 단위로 빠르게 | 클러스터 기동 시간 필요 |
| 카탈로그 | 네이티브 통합 | Glue Catalog를 메타스토어로 연결 |

> 💡 **개념**: 시험에서 Glue vs EMR 선택은 단골 주제다. 판단 기준은 (1) **운영 부담**: 관리 최소화 → Glue, 세밀 제어 → EMR. (2) **워크로드 성격**: 짧고 산발적 → Glue, 길고 무거운 정기 배치 → EMR. (3) **프레임워크 다양성**: Spark만이면 Glue로 충분, 여러 엔진 필요하면 EMR.

## 대규모 전처리 설계 원칙

데이터가 수 테라바이트를 넘어가면 "어떻게 변환하느냐" 못지않게 "어떻게 효율적으로 저장·읽느냐"가 중요해진다.

1. **컬럼형 포맷 사용** — CSV/JSON 대신 **Parquet/ORC**를 쓰면 압축률과 스캔 효율이 크게 오른다. 필요한 컬럼만 읽어 I/O를 줄인다.
2. **파티셔닝** — `s3://bucket/year=2026/month=06/` 처럼 자주 필터링하는 키로 파티션을 나누면 Spark/Athena가 불필요한 데이터를 건너뛴다(partition pruning).
3. **파일 크기 최적화** — 너무 많은 작은 파일(small files problem)은 오버헤드를 키운다. 128MB~1GB 정도로 합치는 것이 일반적 권장이다.
4. **푸시다운(predicate pushdown)** — 필터 조건을 데이터 소스 단계에서 적용해 읽는 양 자체를 줄인다.

```python
# Spark에서 파티션 + 컬럼 프루닝을 활용한 효율적 읽기
df = (spark.read.parquet("s3://ml-train/clicks/")
      .filter("year = 2026 AND month = 6")   # 파티션 프루닝
      .select("user_id", "event_time", "amount"))  # 컬럼 프루닝
```

```
[비효율]  CSV · 파티션 없음 · 작은 파일 100만 개
          → 전체 스캔 + 파일당 오버헤드 → 잡 시간·비용 폭증

[효율]    Parquet · dt/region 파티션 · 파일당 256MB
          → 필요한 파티션·컬럼만 읽음 → 스캔량 수십분의 1
```

> ⚠️ **함정**: "데이터가 크니까 무조건 EMR로 큰 클러스터를 띄우자"는 흔한 오답 유도다. 작업이 산발적이고 운영 인력이 적다면 큰 EMR 클러스터를 상시 운영하는 것은 비용·관리 측면에서 비효율적이다. 이럴 땐 Glue나 EMR Serverless가 더 적합하다.

> ⚠️ **함정**: 파티션을 잘게 나눌수록 좋다고 생각하기 쉽지만, 파티션마다 작은 파일이 생기면 오히려 느려진다. **파티션 수와 파일 크기는 함께 설계**해야 한다.

## Spark 실행 모델 최소 지식

Glue든 EMR이든 안에서 도는 것은 Spark다. 성능 문제 시나리오를 읽으려면 최소한의 그림이 필요하다.

```
드라이버(Driver)  ──작업 분할──▶  익스큐터(Executor) × N
   · 잡 계획 수립                    · 파티션 단위로 실제 연산
   · 결과 수집                       · 메모리에 중간 결과 캐시
        ▲                                   │
        └──────── 셔플(shuffle): 노드 간 데이터 재분배 ────┘
```

- **파티션(partition)**: Spark가 병렬 처리하는 데이터 조각. 파티션 수가 곧 병렬도다.
- **셔플(shuffle)**: `groupBy`·`join`처럼 키 기준 재분배가 필요할 때 노드 간에 데이터가 오간다. **가장 비싼 연산**이다.
- **데이터 스큐(skew)**: 특정 키에 데이터가 몰리면 그 파티션을 맡은 익스큐터만 오래 돌아 전체가 느려진다.
- **지연 평가(lazy evaluation)**: 변환은 바로 실행되지 않고 액션(`write`, `count`)이 호출될 때 한꺼번에 최적화되어 실행된다.

> ⚠️ **함정**: "잡이 느리다 → 인스턴스를 키운다"가 항상 답은 아니다. 셔플이 병목이면 조인 전략을 바꾸거나(작은 테이블 브로드캐스트), 스큐 키를 분산시키는 쪽이 효과가 크다.

### Glue 잡 운영에서 알아 둘 것

- **잡 북마크(job bookmark)**: 이미 처리한 데이터를 기억해 다음 실행에서 **새로 들어온 것만** 처리한다. 증분 ETL의 기본 장치다.
- **워커 타입**: 표준 워커와 메모리 최적화 워커 중 고른다. 셔플·조인이 무거우면 메모리가 큰 쪽이 안전하다.
- **재시도와 타임아웃**: 잡 정의에 재시도 횟수와 최대 실행 시간을 두어 무한 실행과 비용 폭주를 막는다.
- **Python Shell 잡**: Spark가 필요 없는 가벼운 스크립트는 Python Shell 잡으로 돌리면 훨씬 저렴하다.

## SageMaker와의 연결

전처리 결과는 결국 SageMaker 학습으로 흘러간다. AWS는 변환과 학습을 잇는 여러 경로를 제공한다.

- **SageMaker Processing** — scikit-learn/Spark 컨테이너로 전처리를 실행하는 SageMaker 네이티브 기능. 학습 전후 처리에 자주 쓰인다.
- **Glue → S3 → SageMaker Training** — Glue로 만든 Parquet를 S3에 두고 학습 작업이 읽는, 가장 보편적인 패턴.
- **SageMaker Data Wrangler** — GUI 기반으로 변환 흐름을 설계하고, 이를 Processing 작업이나 파이프라인으로 내보낸다.

> 💡 **개념**: SageMaker Processing과 Glue는 역할이 겹쳐 보이지만 결이 다르다. Glue는 **데이터 레이크 전반의 ETL**(여러 소비자가 공유하는 정제 데이터 생산)에 강하고, SageMaker Processing은 **특정 ML 작업에 종속된 전처리**(이 모델만을 위한 피처 생성)에 자연스럽게 통합된다.

내일은 이 변환 작업들을 손으로 매번 돌리지 않고, **Step Functions와 SageMaker Pipelines로 자동화**하는 학습 데이터 파이프라인을 살펴본다.

## 📖 용어

- **ETL / ELT** : 추출-변환-적재 / 추출-적재-변환. 뒤가 데이터레이크 시대의 유연한 변형이다.
- **DPU(Data Processing Unit)** : Glue의 처리 용량 단위. 약 4 vCPU + 16GB 메모리에 해당한다.
- **DynamicFrame** : 스키마가 들쭉날쭉해도 행을 버리지 않고 다루는 Glue의 데이터 구조.
- **Glue Data Catalog** : 스키마·위치·파티션을 담은 중앙 메타데이터 저장소. Athena·EMR·Redshift Spectrum이 공유한다.
- **EMR** : EC2 위에서 Hadoop·Spark·Hive·Presto를 직접 운영하는 관리형 빅데이터 클러스터.
- **EMR Serverless** : 클러스터를 띄우지 않고 Spark/Hive 잡만 실행하는 EMR 옵션.
- **스팟 인스턴스** : 중단될 수 있는 대신 크게 저렴한 EC2. 중단 허용 배치 연산에 쓴다.
- **파티셔닝** : 자주 필터링하는 키로 데이터 경로를 나눠 두는 것. 스캔량을 줄인다.
- **셔플(shuffle)** : 키 기준으로 데이터를 노드 간에 재분배하는 Spark 연산. 가장 비싸고 병목이 되기 쉽다.
- **잡 북마크(job bookmark)** : 이미 처리한 지점을 기억해 다음 실행에서 새 데이터만 처리하게 하는 Glue 기능.

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
