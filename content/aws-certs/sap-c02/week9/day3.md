# Day 3 - EMR, Glue, MWAA: 분산 처리 엔진의 내부와 빅데이터 오케스트레이션

빅데이터 처리를 처음 설계하는 엔지니어는 보통 "어떤 서비스를 쓸까"부터 고민한다. EMR? Glue? Athena? 하지만 이 셋은 경쟁 관계가 아니라 같은 엔진(Apache Spark)을 서로 다른 운영 모델로 감싼 것에 가깝다. EMR은 Spark를 클러스터로 직접 운영하게 해주고, Glue는 Spark를 서버리스로 추상화하며, Athena는 Spark/Presto 위에 SQL 인터페이스만 노출한다. 그래서 "무엇을 쓰느냐"의 진짜 질문은 "이 워크로드에서 클러스터를 얼마나 직접 통제해야 하는가, 운영 부담을 어디까지 AWS에 넘길 것인가"이다.

SAP-C02 시험에서 이 영역은 "수만 개 노드로 페타바이트를 처리하는 무거운 Spark 잡을 비용 최적으로 돌리는 법", "수백 개 단계가 의존성을 가진 파이프라인을 오케스트레이션하는 법", "Spot 중단·노드 장애에서 잡이 죽지 않게 하는 법" 같은 운영 아키텍처로 출제된다. 오늘은 EMR/Glue/MWAA가 내부적으로 어떻게 동작하는지, 왜 그렇게 설계됐는지를 분해해 이 시나리오들을 푸는 직관을 만든다.

## 왜 분산 처리인가 — MapReduce에서 Spark까지의 역사

빅데이터 처리의 출발점은 2004년 구글이 발표한 MapReduce 논문이다. 핵심 아이디어는 단순했다. 거대한 데이터를 작은 조각으로 쪼개 수천 대의 평범한 서버에 흩뿌리고(Map), 각 서버가 자기 조각을 독립적으로 처리한 뒤 결과를 합친다(Reduce). 한 대의 슈퍼컴퓨터 대신 값싼 서버 수천 대로 선형 확장을 얻는다는 발상이다. Doug Cutting이 이를 오픈소스로 구현한 것이 Hadoop이고, 분산 저장은 HDFS(구글 GFS의 오픈소스판), 자원 관리는 YARN이 맡았다.

문제는 MapReduce가 모든 중간 결과를 디스크에 쓴다는 것이었다. 반복(iterative) 알고리즘(머신러닝, 그래프 처리)은 같은 데이터를 수십 번 도는데, 매 단계마다 HDFS에 쓰고 다시 읽으니 디스크 I/O가 병목이 됐다. 2009년 버클리 AMPLab의 Matei Zaharia가 만든 **Spark**가 이를 뒤집었다. Spark는 중간 결과를 메모리에 유지(in-memory computing)하고, 연산을 **RDD(Resilient Distributed Dataset)**라는 불변(immutable) 추상화로 표현한다. RDD는 실제 데이터를 들고 있지 않고 "어떻게 만들어지는지의 계보(lineage)"만 기록한다. 노드가 죽어 일부 파티션이 사라지면, 계보를 따라 그 부분만 다시 계산해 복원한다. 체크포인트 없이도 장애 복구가 되는 이 설계가 Spark를 표준으로 만들었다.

> 💡 **관련 이론**: Spark의 핵심은 **lazy evaluation(지연 평가)**과 **DAG 실행**이다. `map`, `filter` 같은 변환(transformation)은 즉시 실행되지 않고 계보에만 기록된다. `count`, `collect`, `save` 같은 액션(action)이 호출되는 순간에야 Spark가 전체 변환 사슬을 보고 최적 실행 계획(DAG)을 세운 뒤 한 번에 실행한다. 덕분에 불필요한 중간 단계를 합치고(operator fusion) 셔플을 최소화할 수 있다. DataFrame API를 쓰면 여기에 **Catalyst 옵티마이저**와 **Tungsten 실행 엔진**이 더해져, SQL처럼 선언적으로 쓴 코드가 컬럼 프루닝·조건 푸시다운·코드 생성을 거쳐 RDD보다 훨씬 빠르게 돈다. 그래서 실무·시험 모두 "RDD보다 DataFrame/Spark SQL"이 정석이다.

> 🔍 **더 깊이**: **셔플(shuffle)**이 분산 처리의 가장 비싼 연산인 이유. `groupBy`, `join`, `reduceByKey` 같은 와이드 변환(wide transformation)은 같은 키를 같은 노드로 모아야 한다. 이때 모든 노드가 서로에게 데이터를 주고받는 all-to-all 네트워크 통신이 발생하고, 중간 결과를 디스크에 쓴 뒤(shuffle write) 다시 읽는다(shuffle read). 1억 행 조인이 느린 건 연산 자체가 아니라 셔플 때문인 경우가 대부분이다. 그래서 최적화의 핵심은 셔플을 줄이는 것 — 작은 테이블은 **broadcast join**(전 노드에 복제해 셔플 제거), 파티셔닝을 미리 맞춰 co-location 유도, `repartition` 남용 회피. Redshift의 분산 키(Day 42)가 노드 간 셔플을 줄이려는 것과 정확히 같은 원리다.

## EMR — Hadoop/Spark 클러스터를 매니지드로

EMR(Elastic MapReduce)은 Hadoop 생태계(Spark, Hive, Presto/Trino, HBase, Flink, Hudi)를 EC2 클러스터로 띄워주는 매니지드 서비스다. 직접 EC2에 Hadoop을 설치·튜닝·패치하던 고통을 없애고, 클릭 몇 번이나 API 한 줄로 수십~수천 노드 클러스터를 분 단위에 만든다. EMR의 구조를 이해하는 핵심은 **세 가지 노드 역할**이다.

- **Master(Primary) 노드**: 클러스터를 관리한다. YARN ResourceManager, HDFS NameNode, 잡 스케줄링이 여기 있다. 하나(또는 HA 구성 시 3개)만 존재하며, 죽으면 클러스터 전체가 영향을 받으므로 **Spot으로 돌리면 안 된다**.
- **Core 노드**: HDFS DataNode 역할(데이터 저장)을 하면서 작업도 실행한다. HDFS 데이터를 들고 있으므로 Spot으로 돌렸다가 중단되면 데이터 일부가 사라지고 복제·복구 부담이 생긴다. 그래서 보통 On-Demand나 신중한 Spot 비율로 운영한다.
- **Task 노드**: HDFS 없이 순수하게 작업만 실행한다. 데이터를 들고 있지 않으므로 중단돼도 잃을 게 없다 — **Spot의 완벽한 대상**이다. 비용 최적화의 핵심은 "Task 노드를 Spot으로 채우는 것"이다.

이 역할 분리가 EMR 비용 최적화의 출발점이다. Master/Core는 안정적인 On-Demand로 최소 구성하고, 무거운 연산 용량은 값싼 Spot Task 노드로 탄력 확장한다.

> 💡 **관련 이론**: EMR이 데이터를 어디에 두느냐가 아키텍처를 가른다. 전통 Hadoop은 데이터를 HDFS(Core 노드의 로컬 디스크)에 두고 "연산을 데이터가 있는 곳으로 보낸다"는 **data locality**를 추구했다. 그런데 클라우드에서는 **EMRFS**를 통해 데이터를 S3에 두는 패턴이 표준이 됐다. 이러면 컴퓨팅과 스토리지가 분리되어(Day 42의 RA3와 같은 철학), 잡이 끝나면 클러스터를 통째로 내려 비용을 0으로 만들 수 있고(transient cluster), 같은 S3 데이터에 여러 클러스터를 띄울 수 있다. 단점은 S3가 HDFS보다 지연이 크다는 것이지만, EMRFS의 S3 최적화 커미터와 Parquet 컬럼 프루닝이 이를 상당히 메운다. SAP 관점에서 "잡이 끝나면 클러스터를 없애 비용 절감"은 거의 항상 S3(EMRFS) 기반 transient cluster다.

> 🔍 **더 깊이**: **Instance Fleets vs Instance Groups**. EMR에서 노드를 구성하는 두 방식이다. Instance Groups는 노드 그룹마다 단일 인스턴스 타입을 지정한다 — 단순하지만 그 타입의 Spot 재고가 마르면 용량을 못 채운다. **Instance Fleets**는 한 그룹(예: Task)에 여러 인스턴스 타입(m5.xlarge, m5a.xlarge, m4.xlarge…)을 가중치와 함께 섞고, "총 32 vCPU만 채우면 됨" 식의 목표 용량(target capacity)을 지정한다. EMR이 가장 싸고 가용한 타입 조합으로 알아서 채우고, 어떤 타입의 Spot이 중단되면 다른 타입으로 자동 대체한다. 그래서 시험에서 "Spot 중단에 강건하면서 비용 최적"은 거의 **Instance Fleets + Spot 다중 타입**이 답이다.

> 📚 **사례**: Yelp는 일찍부터 EMR을 대규모로 운영한 회사로, 수백 개 EMR 클러스터를 매일 띄우고 내리며 페타바이트급 로그를 Spark/MapReduce로 처리했다. 핵심 패턴은 "잡별 transient cluster" — 데이터는 S3에 영구 보관하고, 처리할 때만 클러스터를 띄워 Task 노드를 Spot으로 채운 뒤 끝나면 즉시 종료해 컴퓨팅 비용을 최소화했다. 교훈은 두 가지다. (1) 장수(long-running) 클러스터보다 잡 단위 transient 클러스터가 비용·격리 면에서 유리하고, (2) S3를 진실의 원천(source of truth)으로 두면 클러스터는 언제든 죽여도 되는 일회용 자원이 된다. SAP 시험의 "비용 최적 배치 처리"는 이 패턴을 반복해서 묻는다.

## EMR 배포 모델 — EC2, EKS, Serverless

EMR은 같은 엔진을 세 가지 런타임으로 제공한다. 무엇을 고르느냐는 "운영 통제 vs 운영 부담"의 트레이드오프다.

- **EMR on EC2**(전통): 위에서 설명한 클러스터. 최대 통제력(커스텀 AMI, 부트스트랩 액션, 모든 Hadoop 컴포넌트). 클러스터 관리 책임이 가장 크다.
- **EMR on EKS**: Spark 잡을 기존 EKS(Kubernetes) 클러스터 위에서 Pod로 실행한다. 이미 EKS로 컨테이너 플랫폼을 표준화한 조직이 Spark 워크로드를 같은 인프라·같은 IAM·같은 관측 도구로 통합할 때 적합하다. 빅데이터 팀과 앱 팀이 같은 K8s 자원 풀을 공유해 활용률을 높인다.
- **EMR Serverless**(2022): 클러스터 사이징·노드 관리가 아예 없다. 잡을 제출하면 AWS가 필요한 만큼 워커를 띄워 실행하고 끝나면 회수한다. 워크로드가 가변적이거나 클러스터 운영을 하기 싫을 때 최적. 용량 산정 실수로 인한 과/부족 프로비저닝이 사라진다.

> ⚠️ **함정**: "EMR Serverless가 항상 더 싸고 좋다"는 오해. Serverless는 워커 실행 시간(vCPU·메모리·시간)으로 과금되며, 잡 시작 시 워커를 데우는 약간의 지연과 커스텀 네이티브 라이브러리·특정 Hadoop 컴포넌트 제약이 있다. 24시간 빽빽하게 도는 정상 워크로드라면 잘 튜닝한 EC2 클러스터(특히 Spot Fleet)가 더 저렴할 수 있고, HBase처럼 장수 클러스터가 필요한 컴포넌트는 Serverless로 못 돌린다. 시험에서 "간헐적·가변·운영 부담 회피"는 Serverless, "장수·풀 컨트롤·특수 컴포넌트"는 EC2.

## EMR vs Glue vs Athena — 같은 Spark, 다른 운영 모델

이 셋의 선택 기준을 한 표로 정리한다. 핵심 변수는 시작 시간, 운영 부담, 워크로드 무게다.

| 항목 | EMR (on EC2) | Glue | Athena |
|------|--------------|------|--------|
| 엔진 | 풀 Hadoop/Spark/Hive/Presto/HBase | 서버리스 Spark (+ Python Shell, Ray) | Presto/Trino (SQL), Spark(분석용) |
| 운영 모델 | 클러스터 직접 관리 | 서버리스 (DPU) | 완전 서버리스 |
| 시작 시간 | 5~10분(클러스터 부팅) | ~1분(웜풀 시 초 단위) | 즉시 |
| 과금 | 클러스터 가동 시간(EC2) | DPU-시간 | S3 스캔 데이터량 |
| 적합 | 무겁고 반복적인 처리, 커스텀 튜닝, 특수 컴포넌트 | 가벼운~중간 ETL, 카탈로그 통합 | 애드혹 SQL, BI |
| 통제력 | 최대 | 중간(추상화됨) | 최소(SQL만) |

판단 흐름은 이렇다. "SQL로 충분하고 애드혹 질의"면 **Athena**. "정형 ETL인데 클러스터 운영은 싫다"면 **Glue**. "무거운 반복 처리, 커스텀 Spark 튜닝, Hive/HBase/Flink 같은 풀 스택"이 필요하면 **EMR**. 셋이 Glue Data Catalog를 공통 메타스토어로 공유하므로, 같은 테이블 정의를 세 엔진이 모두 본다는 점이 중요하다.

> 🔍 **더 깊이**: **Glue Job Bookmark**가 증분 처리를 하는 원리. 매일 도는 ETL이 어제 처리한 파일을 또 처리하면 비용과 중복이 생긴다. Job Bookmark는 잡 실행마다 "어디까지 처리했는지"의 상태(S3 객체의 마지막 수정 시각·경로, JDBC 소스의 기준 컬럼 값 등)를 체크포인트로 저장한다. 다음 실행은 이 북마크 이후의 새 데이터만 골라 처리한다. 본질적으로 스트리밍의 오프셋(offset) 관리와 같은 발상을 배치에 적용한 것이다. 시험에서 "매일 도는 Glue 잡이 이미 처리한 데이터를 또 처리한다 / 증분만 처리하고 싶다"는 Job Bookmark 활성화가 답이다. (안티패턴: 북마크를 켜고도 잡 로직이 매번 전체를 다시 읽도록 짜면 무의미하다.)

## Glue의 나머지 구성요소 — Crawler, Catalog, DataBrew

Glue는 ETL 잡만이 아니라 데이터 통합 플랫폼이다. **Glue Data Catalog**는 Hive Metastore 호환 메타데이터 저장소로, 테이블 스키마·파티션·위치를 보관하며 Athena·EMR·Redshift Spectrum·Glue가 모두 공유한다(이 영역의 진짜 허브). **Glue Crawler**는 S3·JDBC 소스를 스캔해 스키마를 추론하고 카탈로그에 테이블·파티션을 자동 등록한다. **Glue DataBrew**는 코드 없이 시각적으로 데이터 정제·변환 레시피를 만드는 노코드 도구로, 데이터 분석가가 엔지니어 없이 클렌징을 한다.

> 💡 **관련 이론**: Glue Data Catalog가 **Hive Metastore 호환**이라는 점이 생태계 전체를 묶는 열쇠다. Hive Metastore는 2008년 Hadoop 생태계에서 "테이블이 어떤 컬럼을 갖고 어느 경로의 어떤 포맷 파일인지"를 표준화한 메타데이터 계층이다. AWS가 이 인터페이스를 그대로 구현했기 때문에, S3에 있는 같은 Parquet 파일을 Athena로 SQL 질의하고, EMR Spark로 변환하고, Redshift Spectrum으로 조인하는 것이 모두 "같은 테이블"로 가능하다. 메타데이터를 한 곳에 통합하고 엔진을 갈아끼우는 이 분리가 레이크하우스 아키텍처의 토대다.

## MWAA — Airflow로 파이프라인을 오케스트레이션하다

수집 → 저장 → 처리 → 적재 → 분석으로 이어지는 데이터 파이프라인은 수많은 단계가 **의존성**을 가진다. "Glue 잡이 끝나야 EMR 잡이 시작되고, 그게 끝나야 Athena CTAS가 돌고, 실패하면 재시도하고, 특정 시각에 트리거"한다. 이 의존성·스케줄·재시도·관측을 관리하는 것이 오케스트레이션이고, 그 사실상 표준이 Apache Airflow다. **MWAA(Managed Workflows for Apache Airflow)**는 Airflow의 웹서버·스케줄러·워커를 AWS가 운영해주는 매니지드 서비스다.

Airflow의 핵심 모델은 **DAG(Directed Acyclic Graph)**다. 워크플로우를 "순환 없는 방향 그래프"로 표현해 작업 간 의존성을 명시한다. 순환이 없다는 제약이 중요한데, A→B→A 같은 순환이 있으면 영원히 끝나지 않는 데드락이 생기기 때문이다. DAG는 Python 코드로 정의하므로, 조건 분기·동적 태스크 생성·외부 시스템 연동을 코드의 표현력으로 자유롭게 짤 수 있다. EMR·Glue·Athena·Step Functions 등을 호출하는 Operator가 풍부해, 한 DAG에서 멀티 서비스 파이프라인을 엮는다.

> 💡 **관련 이론**: DAG는 컴퓨터과학에서 의존성·스케줄링 문제의 보편적 추상화다. 빌드 시스템(Makefile, Bazel), 패키지 의존성 해결, Spark의 실행 계획, 심지어 Git 커밋 그래프가 모두 DAG다. 핵심 연산은 **위상 정렬(topological sort)** — "선행 작업이 끝난 것부터 순서대로" 실행 순서를 정하는 것이다. Airflow 스케줄러가 매 순간 하는 일이 바로 이 위상 정렬이다: 의존성이 모두 충족된(upstream이 성공한) 태스크를 찾아 실행 큐에 넣는다. 순환이 있으면 위상 정렬이 불가능하므로 DAG라는 이름에 "Acyclic"이 붙는다.

## MWAA vs Step Functions — 오케스트레이션의 두 철학

AWS에는 오케스트레이션 도구가 둘 있다. MWAA(Airflow)와 Step Functions이다. 둘은 철학이 다르다.

| 항목 | MWAA (Airflow) | Step Functions |
|------|----------------|----------------|
| 정의 방식 | Python DAG (코드) | ASL(Amazon States Language) JSON |
| 통합 | Operator 생태계(다양한 외부 시스템) | 200+ AWS 서비스 네이티브 통합 |
| 운영 | Airflow 환경 관리(매니지드지만 환경 비용·버전) | 완전 서버리스, 운영 0 |
| 이식성 | Airflow OSS — 온프렘·타클라우드 이전 가능 | AWS 종속 |
| 과금 | 환경 가동 시간(상시 비용) | 상태 전이(state transition)당 |
| 강점 | 복잡한 데이터 파이프라인, 풍부한 커뮤니티 | 이벤트 기반·서버리스 워크플로우, 세밀한 AWS 통합 |

선택 기준: **이미 Airflow를 쓰거나 멀티클라우드 이식성·복잡한 Python 로직·풍부한 데이터 Operator가 필요하면 MWAA**. **순수 AWS 환경에서 서버리스로 운영 부담 0, 이벤트 기반, 상시 비용 회피가 중요하면 Step Functions**. 시험에서 "Python DAG / Airflow 마이그레이션 / 이식성"은 MWAA, "서버리스 / AWS 깊은 통합 / 운영 0 / 상태 전이 과금"은 Step Functions로 갈린다.

> ⚠️ **함정**: MWAA는 "매니지드"지만 비용이 0이 아니다. Airflow 환경(웹서버·스케줄러·최소 워커)이 잡이 없어도 상시 떠 있어 시간당 비용이 계속 발생한다. 반면 Step Functions는 워크플로우가 안 돌면 비용도 0에 수렴한다. "간헐적으로만 도는 워크플로우인데 상시 비용을 줄이고 싶다"면 MWAA가 아니라 Step Functions(또는 EventBridge + Step Functions)가 맞다. "복잡한 데이터 DAG인데 이미 Airflow 자산이 있다"가 MWAA의 정당한 자리다.

## 다른 클라우드와의 비교 — 같은 엔진, 다른 이름

이 영역은 오픈소스 표준(Spark, Airflow, Kafka, Hive) 위에 세워졌기 때문에, 멀티클라우드 관점에서 대응 관계가 명확하다.

| 역할 | AWS | GCP | Azure |
|------|-----|-----|-------|
| 매니지드 Spark/Hadoop 클러스터 | EMR | Dataproc | HDInsight / Synapse Spark |
| 서버리스 ETL | Glue | Dataflow(Beam) / Dataproc Serverless | Data Factory / Synapse |
| 서버리스 SQL on 객체스토리지 | Athena | BigQuery(외부 테이블) | Synapse Serverless SQL |
| 매니지드 Airflow | MWAA | Cloud Composer | Data Factory Managed Airflow |
| 메타데이터 카탈로그 | Glue Catalog | Dataplex / Data Catalog | Purview |

핵심 통찰: 이 모든 서비스가 같은 오픈소스(Spark, Airflow, Hive Metastore)를 감싸므로, **카탈로그(메타데이터)를 표준 인터페이스로 유지하면 처리 엔진을 비교적 자유롭게 교체**할 수 있다. 멀티클라우드·하이브리드 전략에서 Airflow(MWAA/Composer)와 Iceberg/Hive Metastore 호환 카탈로그를 표준으로 삼는 이유다.

## 정리하며

EMR·Glue·Athena는 경쟁 서비스가 아니라 **같은 Spark/Presto 엔진을 통제력-운영부담 축에서 다르게 감싼 것**이다. EMR은 풀 컨트롤(클러스터), Glue는 서버리스 ETL(DPU), Athena는 SQL(스캔 과금)이다. EMR 비용 최적화의 핵심은 Task 노드를 Spot으로 채우고 Instance Fleets로 중단에 강건하게 만드는 것, 그리고 데이터를 S3(EMRFS)에 두어 transient cluster로 운영하는 것이다. MWAA(Airflow DAG)와 Step Functions(ASL)는 이 파이프라인을 오케스트레이션하는데, 전자는 이식성·복잡 로직·상시 자산, 후자는 서버리스·AWS 통합·운영 0으로 갈린다.

SAP 시험의 단골 매핑: (1) "EMR Task 비용 최적 + Spot 중단 강건" → Instance Fleets + Spot 다중 타입, (2) "잡 끝나면 클러스터 제거 비용 절감" → S3(EMRFS) transient cluster, (3) "클러스터 없이 가변 Spark" → EMR Serverless, (4) "가벼운 ETL + 클러스터 운영 회피" → Glue, (5) "증분만 처리" → Glue Job Bookmark, (6) "Python DAG·이식성" → MWAA, (7) "서버리스·AWS 통합·운영 0·상시 비용 회피" → Step Functions, (8) "SQL 애드혹" → Athena. 다음 day에서는 데이터 거버넌스(Lake Formation)와 실시간 스트림(MSK)을 본다.

---

## 📝 연습 문제

**문제 1.** 매일 페타바이트급 로그를 Spark로 배치 처리한다. 데이터는 S3에 영구 보관돼 있고, 처리는 하루 2~3시간만 한다. 비용을 최소화하면서 Spot 중단에도 잡이 죽지 않게 하려면?

A) 상시(long-running) EMR 클러스터를 On-Demand로 유지
B) 잡 단위 transient EMR 클러스터 + Task 노드를 Instance Fleets Spot 다중 타입으로 구성, 끝나면 종료
C) 모든 노드(Master·Core·Task)를 Spot으로 구성
D) Redshift에 적재 후 SQL로 처리

**정답: B**

해설: 데이터가 S3에 있으므로 처리할 때만 클러스터를 띄우고 끝나면 종료하는 transient cluster가 비용 최적이다. Task 노드는 HDFS 데이터를 들고 있지 않아 Spot 중단에 안전하고, Instance Fleets로 여러 인스턴스 타입을 섞으면 한 타입의 Spot이 마르거나 중단돼도 다른 타입으로 자동 대체되어 강건하다. A는 안 쓰는 시간에도 비용이 계속 나간다. C는 Master/Core를 Spot으로 돌리는 치명적 실수 — Master가 중단되면 클러스터 전체가 죽고 Core가 중단되면 HDFS 데이터가 사라진다. D는 배치 Spark 처리를 위해 굳이 DW에 적재할 이유가 없고 변환 유연성도 떨어진다.

---

**문제 2.** 하루에 몇 번, 불규칙하게 도는 Spark 잡이 있다. 클러스터 사이징과 노드 관리를 하고 싶지 않고, 안 돌 때 비용을 최소화하려면?

A) EMR on EC2 상시 클러스터
B) EMR Serverless
C) EMR on EKS 전용 노드 풀
D) Glue Crawler

**정답: B**

해설: EMR Serverless는 클러스터·노드 개념 없이 잡을 제출하면 필요한 워커를 자동으로 띄우고 끝나면 회수하며, 워커 실행 시간만 과금한다. 간헐적·가변 워크로드에서 용량 산정 실수와 유휴 비용을 없애준다. A는 안 쓰는 시간에 상시 비용이 발생하고 사이징 관리가 필요. C는 EKS 클러스터·노드 풀을 직접 관리해야 해 "관리하기 싫다"는 조건에 어긋남(이미 EKS 표준화된 조직의 통합용). D는 ETL 잡 실행이 아니라 스키마를 추론해 카탈로그에 등록하는 도구로 목적이 다르다.

---

**문제 3.** 매일 도는 Glue ETL 잡이 어제 이미 처리한 S3 파일을 또 처리해 비용이 늘고 결과가 중복된다. 새로 들어온 데이터만 처리하게 하려면?

A) Crawler를 매번 다시 실행
B) Glue Job Bookmark 활성화
C) Athena에서 WHERE로 필터
D) S3 라이프사이클로 오래된 파일 삭제

**정답: B**

해설: Job Bookmark는 잡 실행마다 "어디까지 처리했는지"의 상태를 체크포인트로 저장하고, 다음 실행은 그 이후의 새 데이터만 처리한다(스트리밍 오프셋과 같은 발상의 배치 버전). A(Crawler)는 스키마·파티션을 카탈로그에 등록하는 도구로 증분 처리와 무관. C는 처리 자체는 매번 전체를 읽으므로 비용 절감이 안 됨. D는 데이터 손실 위험이 있고 증분 처리 문제를 해결하지 못한다.

---

**문제 4.** 수십 개 단계가 의존성을 갖는 데이터 파이프라인을 오케스트레이션해야 한다. 팀은 이미 온프레미스에서 Apache Airflow를 쓰고 있고, 추후 다른 클라우드로 이전할 가능성도 고려해 이식성을 원한다. 가장 적합한 것은?

A) Step Functions (ASL)
B) MWAA
C) Glue Workflow
D) EventBridge 규칙 체인

**정답: B**

해설: MWAA는 Apache Airflow 매니지드 서비스로, 기존 Airflow DAG(Python)를 거의 그대로 옮길 수 있고 Airflow가 OSS이므로 다른 클라우드(GCP Composer 등)나 온프렘으로의 이식성이 좋다. A(Step Functions)는 ASL JSON 기반으로 AWS 종속이라 이식성 조건에 어긋남. C(Glue Workflow)는 Glue 잡 위주의 단순 오케스트레이션으로 복잡한 다중 서비스 DAG·이식성에 부족. D는 단순 이벤트 연결이지 복잡한 의존성 그래프 오케스트레이션 도구가 아니다.

---

**문제 5.** 순수 AWS 환경에서 이벤트 기반 워크플로우를 만든다. 간헐적으로만 실행되며, 워크플로우가 안 돌 때 상시 비용이 발생하지 않기를 원하고, 다수의 AWS 서비스를 세밀하게 통합해야 한다. 가장 적합한 것은?

A) MWAA
B) Step Functions
C) 상시 EC2에서 cron + 스크립트
D) Jenkins on EC2

**정답: B**

해설: Step Functions는 완전 서버리스로 상태 전이(state transition)당 과금되어 워크플로우가 안 돌면 비용이 0에 수렴하고, 200개 이상 AWS 서비스를 네이티브로 통합한다. 이벤트 기반·간헐적·AWS 종속 환경에 최적. A(MWAA)는 Airflow 환경(웹서버·스케줄러)이 잡이 없어도 상시 떠 있어 시간당 비용이 계속 발생하므로 "상시 비용 회피" 조건에 불리. C·D는 인프라를 직접 운영해야 하고 상시 비용·관리 부담이 크다. 함정: "간헐적 + 상시 비용 회피 + AWS 통합"은 Step Functions, "복잡 데이터 DAG + 기존 Airflow 자산 + 이식성"은 MWAA.

---

**문제 6.** 데이터 분석가들이 엔지니어의 도움 없이 시각적으로 데이터를 정제·변환하고 싶어 한다. 코드 작성 없이 클렌징 레시피를 만들고 적용할 수 있는 도구는?

A) EMR Notebooks
B) Glue DataBrew
C) Glue Job (PySpark)
D) Athena CTAS

**정답: B**

해설: Glue DataBrew는 코드 없이(노코드) 시각적 인터페이스로 데이터 프로파일링·정제·변환 레시피를 만드는 도구로, 데이터 분석가가 엔지니어 없이 클렌징을 수행하는 데 최적이다. A(EMR Notebooks)는 Jupyter 기반으로 코드 작성이 필요. C(Glue Job)는 PySpark/Scala 코드 작성이 필요. D(Athena CTAS)는 SQL 작성이 필요하다. "노코드·시각적·분석가 셀프서비스"는 DataBrew.

---

**문제 7.** 한 조직이 이미 EKS로 컨테이너 플랫폼을 표준화했고, 앱 워크로드와 빅데이터 Spark 워크로드를 같은 Kubernetes 자원 풀·IAM·관측 도구로 통합해 자원 활용률을 높이려 한다. 가장 적합한 EMR 배포 모델은?

A) EMR on EC2
B) EMR on EKS
C) EMR Serverless
D) 별도 Hadoop 클러스터를 직접 구축

**정답: B**

해설: EMR on EKS는 Spark 잡을 기존 EKS 클러스터 위에서 Pod로 실행해, 빅데이터 팀과 앱 팀이 같은 K8s 자원 풀·IAM·로깅/모니터링을 공유하고 자원 활용률을 높인다. 이미 EKS를 표준화한 조직의 통합 시나리오에 정확히 부합한다. A(on EC2)는 별도 EMR 전용 클러스터를 띄워 EKS 통합 이점이 없음. C(Serverless)는 K8s 자원 풀 공유·통합과 무관. D는 매니지드 이점을 버리는 선택이다.

---

## 📌 오늘의 요약

1. **분산 처리의 역사** — MapReduce(2004, 디스크 기반) → Spark(2009, 인메모리 + RDD lineage). DataFrame/Catalyst가 RDD보다 빠름
2. **셔플이 가장 비싼 연산** — wide transformation의 all-to-all 통신. broadcast join·co-location으로 줄임
3. **EMR 노드 역할** — Master(절대 Spot 금지)·Core(HDFS, 신중)·Task(Spot 최적). 비용은 Task=Spot + Instance Fleets
4. **EMR 배포 모델** — on EC2(풀 컨트롤)·on EKS(K8s 통합)·Serverless(가변·운영 회피). S3(EMRFS) transient cluster가 비용 정석
5. **EMR vs Glue vs Athena** — 같은 엔진, 통제력-운영부담 축. 풀/서버리스ETL/SQL
6. **Glue 구성** — Catalog(Hive Metastore 호환 허브)·Crawler(스키마 추론)·DataBrew(노코드)·Job Bookmark(증분)
7. **MWAA(Airflow DAG)** — 위상 정렬 기반 의존성 오케스트레이션. 이식성·복잡 로직·상시 자산
8. **MWAA vs Step Functions** — Python DAG/이식성/상시비용 vs ASL/AWS통합/서버리스/상태전이 과금
9. **멀티클라우드 대응** — EMR=Dataproc=HDInsight, MWAA=Composer. 카탈로그 표준화로 엔진 교체 가능
