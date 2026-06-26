# Day 1 - Amazon EMR: Spark·Hive와 클러스터 운영, 그리고 EMR Serverless

지난주까지 본 Glue는 "서버를 신경 쓰지 않는 ETL"이었다. 그런데 데이터 규모가 테라바이트를 넘어가고, 복잡한 머신러닝 전처리나 Hive·HBase·Presto 같은 빅데이터 생태계 도구를 함께 써야 하면, 더 큰 자유도와 제어권이 필요해진다. 그 영역을 책임지는 서비스가 **Amazon EMR(Elastic MapReduce)**다.

EMR은 한마디로 "관리형 하둡/스파크 클러스터"다. EC2 위에 Apache Spark, Hive, Presto, HBase, Flink 같은 오픈소스 빅데이터 프레임워크를 묶어 자동으로 프로비저닝하고 운영한다. Glue가 "추상화된 ETL 함수"라면, EMR은 "내가 직접 다루는 분산 컴퓨팅 클러스터"에 가깝다. 시험에서는 이 둘의 선택 기준이 단골 주제다.

## EMR 클러스터의 구조: 세 가지 노드 역할

EMR 클러스터는 노드(EC2 인스턴스)들의 집합이며, 각 노드는 역할을 가진다.

| 노드 타입 | 역할 | 개수 |
|-----------|------|------|
| Primary (마스터) | 클러스터 조정, 작업 분배, 메타데이터 관리 | 1개 (또는 HA 시 3개) |
| Core | 데이터 저장(HDFS) + 연산 동시 수행 | 1개 이상 |
| Task | 연산 전용, HDFS 저장 안 함 | 0개 이상 (선택) |

핵심 구분은 **Core 노드는 HDFS 데이터를 들고 있고, Task 노드는 연산만 한다**는 점이다. 이 차이가 비용 전략과 직결된다. Task 노드는 데이터를 저장하지 않으므로 갑자기 사라져도 데이터 손실이 없다. 따라서 **Task 노드에 스팟 인스턴스를 쓰는 것이 안전한 정석 패턴**이다. 반대로 Core 노드를 스팟으로 깔면 노드 회수 시 HDFS 블록이 사라져 재계산이 필요할 수 있다.

> 💡 **관련 이론**: EMR의 노드 구분은 하둡의 **MapReduce 아키텍처**에서 비롯됐다. 원래 하둡은 데이터가 저장된 노드에서 연산을 수행하는 **데이터 지역성(data locality)** 원칙을 따랐다 — "연산을 데이터에게 보내라(move compute to data)"는 것이다. 네트워크로 거대한 데이터를 옮기는 비용보다, 작은 코드를 데이터가 있는 노드로 보내는 비용이 훨씬 싸기 때문이다. Core 노드가 저장과 연산을 겸하는 것은 이 원칙의 흔적이다.

## Spark on EMR: 인메모리 분산 처리

EMR에서 가장 많이 쓰는 엔진은 **Apache Spark**다. Spark의 핵심은 중간 결과를 디스크가 아닌 메모리에 유지하는 것이다. 전통 MapReduce가 각 단계마다 HDFS에 중간 결과를 쓰고 읽는 것과 달리, Spark는 메모리에서 처리해 반복 연산(머신러닝, 그래프)에서 수십 배 빠르다.

```python
# EMR Spark: S3에서 읽어 변환 후 Parquet으로 저장
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("daily-etl").getOrCreate()

df = spark.read.json("s3://raw-bucket/events/2026/06/26/")
result = (df
    .filter(df.amount > 0)
    .groupBy("region", "product_id")
    .agg({"amount": "sum"})
    .withColumnRenamed("sum(amount)", "total_sales"))

result.write.mode("overwrite").parquet("s3://curated-bucket/sales/")
```

Spark가 빠른 또 하나의 이유는 **지연 평가(lazy evaluation)**다. `filter`, `groupBy` 같은 변환(transformation)은 즉시 실행되지 않고 실행 계획(DAG)으로만 쌓인다. `write`나 `count` 같은 액션(action)이 호출되는 순간에야 Spark가 전체 DAG를 최적화해 한 번에 실행한다. 덕분에 불필요한 중간 단계를 합치거나 건너뛸 수 있다.

> 🔍 **더 깊이**: Spark의 기반 자료구조는 **RDD(Resilient Distributed Dataset)**다. "Resilient(복원력 있는)"인 이유는 각 RDD가 자신이 어떻게 만들어졌는지 계보(lineage)를 기억하기 때문이다. 노드가 죽어 일부 파티션이 사라져도, 계보를 따라 그 파티션만 다시 계산하면 된다. 전체를 체크포인트하지 않고도 장애를 견디는 영리한 설계다. DataFrame과 SQL은 이 RDD 위에 얹힌 고수준 추상화다.

## EMR Storage: HDFS vs EMRFS

EMR은 두 가지 스토리지 계층을 쓸 수 있다.

| 스토리지 | 위치 | 특징 |
|----------|------|------|
| HDFS | Core 노드의 로컬 디스크 | 빠르지만 클러스터 종료 시 소멸(임시) |
| EMRFS | S3 | 영구 저장, 클러스터와 분리, 컴퓨트-스토리지 분리 |

현대 EMR의 정석은 **EMRFS(S3)를 영구 저장소로 쓰는 것**이다. 데이터를 S3에 두면 클러스터를 작업이 끝날 때마다 띄웠다 내릴 수 있다(transient cluster). 즉 컴퓨트와 스토리지가 분리되어, 24시간 클러스터를 켜둘 필요 없이 작업할 때만 비용을 낸다. HDFS는 셔플 중간 결과나 반복 연산의 임시 저장처럼 속도가 중요한 곳에만 쓴다.

> ⚠️ **함정**: "EMR = HDFS에 데이터 영구 저장"이라고 생각하면 시험에서 틀린다. Transient(임시) 클러스터를 종료하면 HDFS는 사라진다. 영구 데이터는 반드시 S3(EMRFS)에 둬야 하며, 이것이 비용 최적화의 핵심이다.

## 클러스터 구매 옵션: 온디맨드 vs 스팟 vs Instance Fleets

비용은 EMR 시험 문제의 절반이다. 노드를 어떤 가격 모델로 살지가 핵심이다.

- **온디맨드**: 정가, 회수되지 않음. 안정성이 필요한 Primary/Core에 적합.
- **스팟 인스턴스**: 최대 90% 저렴하지만 AWS가 용량 회수 시 2분 내 종료. **Task 노드**에 이상적.
- **예약/Savings Plans**: 장기 상시 클러스터에 비용 절감.

EMR은 노드 그룹을 정의하는 두 방식이 있다.

| 방식 | 설명 |
|------|------|
| Instance Groups | 노드 그룹당 단일 인스턴스 타입 지정(전통 방식) |
| Instance Fleets | 그룹당 여러 인스턴스 타입·구매옵션 혼합, 용량 확보 유연 |

**Instance Fleets**는 "m5.xlarge가 스팟으로 없으면 m5.2xlarge나 c5.xlarge로 대체"처럼 여러 타입을 후보로 두어 스팟 회수에 견디게 한다. 스팟 비중이 큰 클러스터에서 안정적으로 용량을 확보하는 현대적 권장 방식이다.

> 🎯 **시나리오**: 매일 새벽 2시간만 도는 대규모 배치 ETL이 있다. 비용 최적 구성은 (1) **Transient 클러스터**로 작업 시작 시 띄우고 끝나면 자동 종료, (2) 데이터는 **S3(EMRFS)**에 영구 저장, (3) Primary와 Core 노드는 **온디맨드**로 안정성 확보, (4) Task 노드는 **Instance Fleets + 스팟**으로 연산 용량을 싸게 확장. 작업 정의는 **EMR Steps**로 제출하고 마지막 Step 완료 시 `auto-terminate`로 클러스터를 내린다.

## EMR Serverless: 클러스터 자체를 없애다

클러스터 크기를 정하고, 노드 타입을 고르고, 스팟 전략을 짜는 일이 부담스럽다면 **EMR Serverless**가 답이다. 클러스터를 직접 프로비저닝하지 않고, Spark나 Hive 애플리케이션을 제출하면 EMR이 필요한 워커를 자동으로 띄우고 작업 후 회수한다. 사용한 vCPU·메모리·시간만큼만 과금된다.

```bash
# EMR Serverless 애플리케이션에 Spark 작업 제출
aws emr-serverless start-job-run \
  --application-id 00abc123 \
  --execution-role-arn arn:aws:iam::111122223333:role/emr-serverless-role \
  --job-driver '{
    "sparkSubmit": {
      "entryPoint": "s3://scripts/daily-etl.py"
    }
  }'
```

EMR Serverless는 워크로드가 간헐적이거나 예측하기 어려울 때, 그리고 클러스터 사이징·튜닝에 시간을 쓰고 싶지 않을 때 적합하다. 반대로 HBase처럼 상주 서비스가 필요하거나 클러스터를 24시간 켜두고 미세 튜닝해야 하는 경우는 전통 EMR on EC2가 맞다.

## 언제 Glue, 언제 EMR인가

시험의 최종 판단 포인트다.

| 상황 | 선택 |
|------|------|
| 서버리스 ETL, 빠른 개발, DPU 단위 과금 | **Glue** |
| 짧고 간헐적인 ETL, 운영 부담 최소화 | **Glue** 또는 **EMR Serverless** |
| 대규모(TB+) 복잡 처리, 세밀한 Spark 튜닝 필요 | **EMR** |
| Hive/HBase/Presto/Flink 등 다양한 생태계 도구 | **EMR** |
| 스팟으로 비용 극단 절감, 클러스터 완전 제어 | **EMR** |
| 머신러닝 대규모 전처리, 커스텀 라이브러리 | **EMR** |

요약하면 **Glue는 단순·빠른·서버리스 ETL**, **EMR은 규모·제어·생태계 다양성**이다. "운영 오버헤드 최소"가 강조되면 Glue, "비용 제어와 빅데이터 프레임워크 선택권"이 강조되면 EMR로 기운다.

## 정리

EMR은 관리형 빅데이터 클러스터로, Core 노드(저장+연산)와 Task 노드(연산 전용)의 구분이 스팟 비용 전략의 핵심이다. 데이터는 S3(EMRFS)에 영구 저장해 컴퓨트-스토리지를 분리하고, Transient 클러스터로 비용을 아낀다. 클러스터 운영조차 부담되면 EMR Serverless를 쓴다. Glue와 EMR의 선택은 "운영 단순함이냐, 제어와 규모냐"의 저울질이다. 내일은 더 가벼운 변환 도구인 Lambda를 다룬다.

---

## 📝 연습 문제

**문제 1.** EMR 클러스터에서 비용을 절감하기 위해 스팟 인스턴스를 적용하려 한다. 데이터 손실 위험 없이 스팟을 쓰기에 가장 적합한 노드는?

A) Primary(마스터) 노드  
B) Core 노드  
C) Task 노드  
D) 모든 노드에 동일하게  

**정답: C**  
해설: Task 노드는 HDFS 데이터를 저장하지 않고 연산만 수행하므로, 스팟 회수로 갑자기 사라져도 데이터 손실이 없다. Core 노드는 HDFS 블록을 보관하므로 스팟 회수 시 데이터 재계산이 필요할 수 있고, Primary는 클러스터 조정을 담당해 사라지면 전체가 멈춘다.

---

**문제 2.** 매일 새벽에 1~2시간만 도는 대규모 배치 ETL을 가장 비용 효율적으로 EMR에서 운영하려 한다. 적절하지 않은 설계는?

A) 작업이 끝나면 자동 종료되는 Transient 클러스터 사용  
B) 데이터를 S3(EMRFS)에 영구 저장  
C) 영구 데이터를 Core 노드의 HDFS에 보관하고 클러스터를 계속 켜둔다  
D) Task 노드를 Instance Fleets + 스팟으로 확장  

**정답: C**  
해설: HDFS는 클러스터 종료 시 소멸하는 임시 저장소이고, 클러스터를 계속 켜두면 간헐적 작업에 비해 비용이 크다. 영구 데이터는 S3(EMRFS)에 두고 Transient 클러스터로 작업 시에만 띄우는 것이 정석이다. 나머지는 모두 올바른 비용 최적화 패턴이다.

---

**문제 3.** Apache Spark가 전통 MapReduce보다 반복 연산(머신러닝 등)에서 훨씬 빠른 핵심 이유는?

A) 모든 데이터를 항상 HDFS에 저장하기 때문  
B) 중간 결과를 메모리에 유지하고 지연 평가로 DAG를 최적화하기 때문  
C) 단일 노드에서만 실행되기 때문  
D) 데이터를 압축하지 않기 때문  

**정답: B**  
해설: Spark는 단계마다 디스크에 쓰는 MapReduce와 달리 중간 결과를 인메모리로 유지하고, 변환을 지연 평가하여 액션 시점에 전체 실행 계획(DAG)을 최적화한다. 이 두 특성이 반복 연산 성능의 핵심이다. Spark는 분산 처리 엔진이며 HDFS·S3 등 다양한 스토리지를 쓴다.

---

**문제 4.** 운영팀이 클러스터 사이징과 스팟 전략을 관리할 인력이 없고, 워크로드는 간헐적이며 예측이 어렵다. 클러스터 프로비저닝 없이 Spark 작업을 제출하고 사용량만큼 과금받고 싶다. 가장 적합한 것은?

A) EMR Serverless  
B) EMR on EC2 (Instance Groups, 24시간 상시)  
C) Redshift  
D) DynamoDB  

**정답: A**  
해설: EMR Serverless는 클러스터를 직접 띄우지 않고 Spark/Hive 애플리케이션을 제출하면 필요한 워커를 자동 프로비저닝·회수하며 사용한 vCPU·메모리·시간만큼 과금한다. 간헐적·예측 불가 워크로드와 운영 최소화 요구에 부합한다. EMR on EC2 상시 클러스터는 운영 부담과 유휴 비용이 크다.

---

**문제 5.** 다음 중 Glue 대신 EMR을 선택할 가장 타당한 이유는?

A) 가장 빠르게 서버리스로 단순 ETL을 개발하고 싶다  
B) Hive, HBase, Presto 등 다양한 빅데이터 생태계 도구를 함께 쓰고 Spark를 세밀히 튜닝하며 스팟으로 비용을 극단적으로 제어해야 한다  
C) 운영 오버헤드를 최소화하고 인프라를 전혀 다루고 싶지 않다  
D) DPU 단위의 자동 과금만 원한다  

**정답: B**  
해설: EMR은 다양한 빅데이터 프레임워크 지원, 클러스터 완전 제어, 스팟 활용을 통한 비용 제어, 세밀한 Spark 튜닝이 강점이다. 서버리스·빠른 개발·운영 최소화·DPU 과금은 모두 Glue의 강점이므로 Glue를 택할 이유에 해당한다.

---
