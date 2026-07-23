# Day 4 - SageMaker 도구: Data Wrangler, Processing Job, Feature Store

지난 사흘간 데이터 정제와 특성 공학을 개념·코드 수준에서 다뤘다. 오늘은 같은 작업을 AWS에서 **규모 있게, 재현 가능하게, 재사용 가능하게** 수행하는 SageMaker 서비스 세 가지를 본다.

- **Data Wrangler**: 시각적(노코드) 데이터 준비
- **Processing Job**: 코드 기반 분산 전처리
- **Feature Store**: 특성을 저장·공유·재사용하는 중앙 저장소

MLS-C01 시험은 "어떤 도구가 어떤 상황에 맞는가"와 "Feature Store가 왜 필요한가"를 자주 묻는다.

## SageMaker Data Wrangler

Data Wrangler는 SageMaker Studio 안의 **시각적 데이터 준비 도구**다. 코드를 거의 쓰지 않고 결측치 대치, 인코딩, 스케일링, 이상치 처리 등 300개 이상의 내장 변환을 클릭으로 적용한다.

핵심 기능:

- **다양한 소스 연결**: S3, Athena, Redshift, Snowflake 등에서 직접 임포트.
- **데이터 품질·인사이트 리포트**: 결측·이상·타깃 누수·중복을 자동 진단.
- **내장 변환 + 커스텀 변환**: 내장 변환과 PySpark/Pandas 커스텀 코드 혼용.
- **빠른 모델(Quick Model)**: 준비한 피처로 즉석 모델을 돌려 피처 중요도 미리보기.
- **내보내기**: 정의한 흐름(flow)을 Processing Job, Pipeline, Feature Store, 또는 Python 코드로 익스포트.

```text
[Data Wrangler 흐름 예시]
S3 import → 결측치 중앙값 대치 → 범주형 One-Hot
          → 수치형 표준화 → 데이터 품질 리포트
          → Export to: Processing Job / Feature Store / Pipeline
```

> 💡 **관련 이론**: Data Wrangler의 가치는 "탐색과 프로덕션의 간극 해소"다. 데이터 과학자가 노트북에서 임시로 만든 전처리는 재현·자동화가 어렵다. Data Wrangler는 시각적으로 정의한 변환을 **선언적 흐름(flow) 정의로 저장**하고, 이를 그대로 Processing Job이나 Pipeline 단계로 내보내 운영 파이프라인에 편입한다. 즉 "탐색에서 만든 변환 = 운영에서 돌릴 변환"을 보장해 학습/추론 간 전처리 불일치를 줄인다. 노코드라고 무시할 게 아니라, 재현성·일관성을 위한 도구로 이해하는 게 핵심이다.

> ⚠️ **함정**: Data Wrangler는 **탐색·준비 단계**에 강하지만, 페타바이트급 초대규모 분산 처리나 완전 커스텀 로직이 필요하면 EMR/Glue나 직접 작성한 Processing Job이 더 적합하다. 시험에서 "노코드/시각적/빠른 EDA"면 Data Wrangler, "대규모 커스텀 코드 배치 처리"면 Processing Job 쪽으로 기운다.

## SageMaker Processing Job

Processing Job은 전처리·후처리·모델 평가를 위한 **관리형 분산 컴퓨트** 작업이다. 컨테이너에 코드를 담아 클러스터에서 실행하고, 끝나면 인프라를 자동 종료한다.

| 구성 | 설명 |
|------|------|
| **입력** | S3(또는 다른 소스) → 컨테이너 로컬 경로로 다운로드 |
| **처리 코드** | scikit-learn, Spark, 또는 커스텀 컨테이너 |
| **출력** | 결과를 컨테이너 경로 → S3로 업로드 |
| **인스턴스** | 지정한 타입·개수로 분산, 작업 후 자동 종료 |

대표 프로세서: `SKLearnProcessor`(scikit-learn), `PySparkProcessor`(대규모 Spark), 커스텀 컨테이너.

```python
from sagemaker.sklearn.processing import SKLearnProcessor
from sagemaker.processing import ProcessingInput, ProcessingOutput

processor = SKLearnProcessor(
    framework_version="1.2-1",
    role=role,
    instance_type="ml.m5.xlarge",
    instance_count=2,          # 분산 처리
)

processor.run(
    code="preprocess.py",
    inputs=[ProcessingInput(source="s3://bucket/raw/", destination="/opt/ml/processing/input")],
    outputs=[ProcessingOutput(source="/opt/ml/processing/output", destination="s3://bucket/processed/")],
)
```

> 💡 **관련 이론**: Processing Job은 "컴퓨트와 스토리지 분리" 철학의 ML 전처리 구현이다. 데이터는 S3에 두고, 잡 실행 시점에만 인스턴스를 띄워 S3→로컬→처리→S3 패턴으로 돌린 뒤 종료한다. 따라서 사용한 만큼만 과금되고, 학습 잡과 동일한 SageMaker 추적·로깅(CloudWatch, Experiments) 체계에 들어간다. EMR/Glue와 겹치는 면이 있지만, Processing Job은 SageMaker 워크플로(특히 Pipelines)와의 통합과 ML 친화적 컨테이너 생태계가 강점이다.

## SageMaker Feature Store

Feature Store는 머신러닝 **특성을 저장·검색·공유·재사용**하는 중앙 저장소(repository)다. 여러 팀·모델이 같은 피처를 일관되게 쓰도록 한다.

해결하는 문제:

1. **중복 작업**: 팀마다 "고객 30일 평균 구매액"을 제각각 재계산.
2. **학습/추론 불일치(training-serving skew)**: 학습 때 쓴 피처 계산 로직과 추론 때 로직이 달라 성능 저하.
3. **시점 정확성(point-in-time)**: 과거 시점의 피처값을 재현해 누수 없는 학습셋 구성.

두 가지 저장소:

| 저장소 | 용도 | 특성 |
|------|------|------|
| **Online Store** | 실시간 추론 시 저지연 조회 | 단일 레코드 ms급 조회 |
| **Offline Store** | 학습용 대량 조회 | S3 기반, 과거 이력 보관 |

```python
from sagemaker.feature_store.feature_group import FeatureGroup

fg = FeatureGroup(name="customer-features", sagemaker_session=session)
fg.load_feature_definitions(data_frame=features_df)
fg.create(
    s3_uri="s3://bucket/feature-store/",
    record_identifier_name="customer_id",
    event_time_feature_name="event_time",   # 시점 정확성의 핵심
    enable_online_store=True,                # 온라인+오프라인 동시
)

# 추론 시 온라인 스토어에서 최신 피처 조회
fg.get_record(record_identifier_value_as_string="C12345")
```

> 💡 **관련 이론**: Feature Store의 핵심 가치는 **학습/추론 불일치(training-serving skew) 제거**다. 흔한 사고는 학습 때 배치로 계산한 피처와 추론 때 실시간으로 계산한 피처의 정의가 미묘하게 달라 모델 성능이 운영에서 떨어지는 것이다. 같은 피처 정의를 Offline(학습)과 Online(추론) 양쪽에서 공유하면 이 불일치가 사라진다. 또 `event_time`을 기록해 **point-in-time(시점 기준) 조회**를 지원하는데, 이는 "예측 시점에 실제로 알 수 있었던 값"만으로 학습셋을 만들어 미래 정보 누수를 막는 장치다.

> ⚠️ **함정**: Feature Store의 두 스토어 용도를 혼동하지 말 것. 실시간 저지연 단건 조회는 **Online Store**, 대량 과거 데이터로 학습셋을 만드는 것은 **Offline Store**다. "ms급 단건 추론 조회"가 키워드면 Online이 답이다.

## 세 도구의 관계

```text
[전형적 파이프라인]
Data Wrangler (시각적 EDA·변환 정의)
      │  export
      ▼
Processing Job (대규모 변환 실행)
      │  ingest
      ▼
Feature Store (피처 저장·공유)
      ├─ Offline → 학습 잡
      └─ Online  → 실시간 추론
```

## 정리하며

SageMaker 데이터 준비 도구는 역할이 다르다. **Data Wrangler**는 시각적·노코드 EDA와 변환 정의, **Processing Job**은 코드 기반 대규모 분산 전처리, **Feature Store**는 피처 재사용과 학습/추론 일관성·시점 정확성 보장이다. 셋은 흔히 한 파이프라인에서 이어진다.

다음 글에서는 Week 3 전체(정제·특성 공학·도구)를 종합 복습한다.

---

## 📝 연습 문제

**문제 1.** 코드를 거의 작성하지 않고 시각적으로 결측치 대치·인코딩·스케일링을 적용하고 데이터 품질을 자동 진단하려 한다. 가장 적합한 SageMaker 도구는?

A) SageMaker Processing Job  
B) SageMaker Data Wrangler  
C) SageMaker Feature Store  
D) SageMaker Model Monitor  

**정답: B**  
해설: Data Wrangler는 SageMaker Studio의 시각적(노코드) 데이터 준비 도구로 300여 개 내장 변환과 데이터 품질·인사이트 리포트를 제공한다. Processing Job(A)은 코드 기반 분산 처리, Feature Store(C)는 피처 저장소, Model Monitor(D)는 운영 모델 모니터링 도구다.

---

**문제 2.** 학습 때 계산한 피처와 추론 때 계산한 피처의 정의가 달라 운영 성능이 떨어지는 training-serving skew를 방지하려 한다. 가장 적절한 서비스는?

A) SageMaker Feature Store  
B) SageMaker Data Wrangler  
C) Amazon Athena  
D) AWS Glue Crawler  

**정답: A**  
해설: Feature Store는 동일한 피처 정의를 Offline(학습)과 Online(추론)에서 공유해 학습/추론 불일치를 제거한다. Data Wrangler(B)는 변환 정의 도구이고, Athena(C)는 쿼리 엔진, Glue Crawler(D)는 스키마 카탈로그화 도구라 skew 방지가 주목적이 아니다.

---

**문제 3.** 수 테라바이트 데이터를 커스텀 PySpark 코드로 분산 전처리한 뒤 결과를 S3에 저장하고, 작업이 끝나면 인프라가 자동 종료되길 원한다. 가장 적합한 것은?

A) Data Wrangler 단독 사용  
B) Feature Store Online Store  
C) SageMaker Processing Job (PySparkProcessor)  
D) SageMaker 엔드포인트  

**정답: C**  
해설: Processing Job은 컨테이너에 커스텀 코드(PySparkProcessor 등)를 담아 지정한 인스턴스 클러스터에서 분산 처리하고, 작업 후 인프라를 자동 종료한다. Data Wrangler(A)는 초대규모 커스텀 분산 처리에 부적합하고, Online Store(B)는 추론 조회용, 엔드포인트(D)는 실시간 추론 서빙용이다.

---

**문제 4.** Feature Store에서 실시간 추론 시 단일 레코드를 밀리초 단위로 조회해야 한다. 어떤 저장소를 사용해야 하는가?

A) Offline Store  
B) Online Store  
C) S3 Glacier  
D) Redshift  

**정답: B**  
해설: Online Store는 단일 레코드의 저지연(ms급) 조회에 최적화되어 실시간 추론에 사용된다. Offline Store(A)는 S3 기반으로 대량 과거 데이터를 학습용으로 조회하는 용도다. Glacier(C)는 콜드 아카이브, Redshift(D)는 데이터 웨어하우스라 실시간 단건 추론 조회에 부적합하다.

---

**문제 5.** "예측 시점에 실제로 알 수 있었던 값만으로 학습셋을 구성"해 미래 정보 누수를 막는 Feature Store 기능은?

A) point-in-time(시점 기준) 조회  
B) 자동 스케일링  
C) 데이터 암호화  
D) A/B 테스트 라우팅  

**정답: A**  
해설: Feature Store는 `event_time`을 기록해 특정 과거 시점에 유효했던 피처값을 재현하는 point-in-time 조회를 지원하며, 이는 미래 정보가 학습에 새어 들어가는 누수를 방지한다. 자동 스케일링(B)·암호화(C)·A/B 라우팅(D)은 시점 정확성과 무관한 기능이다.

---
