# Day 2 - SageMaker Data Wrangler: 코드 없이 끝내는 데이터 준비

어제 본 스케일링·인코딩·결측치 처리를 매번 pandas로 손코딩하면 시간이 오래 걸리고, 적용한 변환 순서를 재현하기도 어렵다. SageMaker Data Wrangler는 이 전체 흐름을 시각적 인터페이스로 묶어주는 도구다. 데이터를 불러오고, 분포를 눈으로 보고, 변환을 클릭으로 쌓고, 그 결과를 학습 파이프라인으로 내보내는 작업을 한 화면에서 한다.

MLA-C01 시험에서 Data Wrangler는 "탐색적 분석과 변환을 빠르게 시각적으로" 해야 하는 시나리오의 정답으로 자주 등장한다. 오늘은 데이터 소스 연결, 변환, 분석, 내보내기라는 4단계를 본다.

## Data Wrangler란 무엇인가

Data Wrangler는 SageMaker Studio 안에서 동작하는 데이터 준비 도구다. 핵심은 **flow**라는 개념이다. flow는 데이터 소스 → 변환 단계들 → 출력으로 이어지는 방향성 그래프(DAG)이며, 각 노드가 하나의 데이터 처리 단계다. 사용자가 GUI에서 변환을 추가하면 Data Wrangler가 내부적으로 그에 해당하는 코드(pandas/PySpark)를 생성한다.

```
[S3 데이터 소스]
      |
      v
[결측치 대치: median]
      |
      v
[One-Hot 인코딩: category]
      |
      v
[StandardScaler: numeric]
      |
      v
[출력: Feature Store / S3 / Pipeline]
```

300개 이상의 내장 변환을 제공하므로, 흔한 전처리는 대부분 코드 없이 해결된다. 커스텀 로직이 필요하면 Python(pandas), PySpark, SQL 코드 블록을 직접 넣을 수도 있다.

> 💡 **관련 이론**: Data Wrangler의 flow는 데이터 엔지니어링의 ETL/ELT 파이프라인을 시각화한 것이다. 각 변환이 멱등적(idempotent)이고 순서가 명확한 DAG로 표현되므로, 같은 입력에 같은 변환을 적용하면 항상 같은 출력이 나온다. 이 재현성(reproducibility)이 ML 파이프라인의 핵심 가치다. 손코딩한 노트북은 셀 실행 순서에 따라 결과가 달라지지만, flow는 순서가 그래프에 고정된다.

## 다양한 데이터 소스 연결

Data Wrangler는 여러 소스에서 직접 데이터를 가져온다. 시험에서 "어디서 데이터를 불러올 수 있는가"가 자주 나온다.

| 데이터 소스 | 용도 |
|-----------|------|
| **Amazon S3** | 가장 일반적. CSV, Parquet, JSON 등 |
| **Amazon Athena** | S3 위 데이터를 SQL로 쿼리해 불러옴 |
| **Amazon Redshift** | 데이터 웨어하우스에서 직접 |
| **Snowflake / Databricks** | 외부 데이터 플랫폼 |
| **SageMaker Feature Store** | 이미 만든 특성 재사용 |

Athena 연동이 특히 유용하다. 거대한 S3 데이터셋 전체를 다운로드하지 않고, SQL `WHERE` 절로 필요한 부분만 샘플링해 불러올 수 있다. 대용량 데이터를 다룰 때 Data Wrangler는 전체가 아닌 샘플로 작업하고, 최종 처리(processing job)에서 전체에 적용하는 방식을 쓴다.

> ⚠️ **함정**: Data Wrangler에서 보는 데이터는 기본적으로 **샘플**(예: 상위 N행 또는 무작위 샘플)이다. 화면에서 변환을 미리보기로 확인하더라도, 실제 전체 데이터에 적용하려면 export하여 SageMaker Processing Job으로 돌려야 한다. 샘플에서 잘 돼 보여도 전체 데이터의 분포가 다르면 결과가 달라질 수 있으니, 샘플 크기와 방식을 인지해야 한다.

## 변환(Transform)

Data Wrangler의 변환은 어제 배운 특성 공학을 GUI로 옮긴 것이다. 주요 카테고리:

- **결측치 처리**: drop, impute(mean/median/most frequent), 결측 플래그 추가
- **인코딩**: One-Hot, Ordinal, 범주형 처리
- **스케일링**: standardize, normalize, robust scaler
- **수치 변환**: 로그/제곱근, 구간화(binning)
- **텍스트/날짜**: 문자열 파싱, 날짜에서 연/월/일 추출
- **차원 축소**: PCA

```python
# Data Wrangler가 내보낸 변환 단계는 이런 코드로 변환된다 (개념)
# 실제로는 GUI에서 클릭으로 구성하고, export 시 노트북/스크립트로 생성됨

from sagemaker.wrangler.processing import DataWranglerProcessor

# .flow 파일이 변환 정의를 담고, Processing Job이 전체 데이터에 적용
```

도메인별 변환도 있다. 시계열 데이터 리샘플링, 이미지 증강(augmentation), 텍스트 토큰화 등이다.

> 🔍 **더 깊이**: Data Wrangler에는 **Quick Model**이라는 기능이 있어, 현재까지의 변환 결과로 즉석에서 XGBoost 모델을 학습시켜 예상 성능과 특성 중요도(feature importance)를 미리 보여준다. 이로써 "이 변환이 실제로 모델 성능에 도움이 되는가"를 본격 학습 전에 빠르게 검증할 수 있다. 또 **Target Leakage** 분석으로 타깃 정보가 새는 특성을 자동 탐지해준다.

## 분석(Analyze)

변환만큼 중요한 게 데이터 이해다. Data Wrangler는 클릭 한 번으로 여러 분석 시각화를 제공한다.

- **Data Quality and Insights Report**: 결측치, 중복, 타깃 누수, 클래스 불균형, 특성 중요도를 자동 리포트로 생성
- **히스토그램/산점도**: 분포와 상관관계
- **Quick Model**: 즉석 성능 추정
- **Bias Report**: SageMaker Clarify 연동으로 편향 탐지(Day 4에서 상세히)
- **Multicollinearity**: 변수 간 다중공선성 점검

이 리포트들은 어제 배운 "데이터 사전 확인, 결측 메커니즘 파악, 이상치 탐지"를 자동화해준다. 특히 Data Quality 리포트는 데이터 준비 첫 단계에서 전체 그림을 잡는 데 좋다.

> 📚 **사례**: 한 팀이 이탈 예측 모델을 만들며 "마지막 로그인일" 특성을 넣었는데, 알고 보니 이탈한 고객만 이 값이 채워져 있었다(이탈 시점에 기록). Data Wrangler의 Target Leakage 분석이 이 특성의 비정상적으로 높은 예측력을 잡아내 누수를 사전에 발견했다. 누수 특성을 그대로 뒀다면 오프라인 검증 정확도는 99%였겠지만 실서비스에선 무용지물이었을 것이다.

## 내보내기(Export)

flow를 완성하면 여러 대상으로 내보낼 수 있다. 시험에서 export 옵션을 구분하는 문제가 나온다.

| Export 대상 | 의미 |
|------------|------|
| **SageMaker Processing Job** | 전체 데이터에 변환을 적용하는 배치 작업 실행 |
| **SageMaker Feature Store** | 처리된 특성을 Feature Store에 적재(Day 3) |
| **SageMaker Pipelines** | 변환을 ML 파이프라인 단계로 통합 |
| **Python 코드 / Jupyter Notebook** | 변환 로직을 코드로 추출해 재사용 |
| **S3** | 처리 결과를 S3에 저장 |

핵심은 **Data Wrangler 자체는 미리보기/설계 도구**이고, 실제 대규모 처리는 export된 Processing Job이 수행한다는 점이다. flow(`.flow` 파일)는 변환 정의를 담은 청사진이고, 이를 재실행하면 새 데이터에도 같은 변환을 적용할 수 있어 재현성이 보장된다.

> 💡 **관련 이론**: Data Wrangler → Feature Store → Pipelines로 이어지는 흐름은 MLOps의 "feature pipeline"을 구현한 것이다. 데이터 준비를 일회성 노트북 작업이 아니라 버전 관리되고 재실행 가능한 파이프라인 단계로 만들면, 학습 시점과 추론 시점에 동일한 변환이 적용된다(training/serving skew 방지). 이는 Day 3의 Feature Store 일관성과 직결된다.

## Data Wrangler vs 다른 도구

언제 Data Wrangler를 고를지가 시험 포인트다. **빠른 시각적 탐색과 변환 프로토타이핑**이 필요하면 Data Wrangler다. 반면 **대규모 분산 ETL**이 핵심이면 AWS Glue(Spark 기반)나 EMR가 더 적합하고, **순수 SQL 변환**이면 Athena, **이미 코드로 잘 된 파이프라인**이면 SageMaker Processing Job을 직접 쓴다. Data Wrangler의 강점은 GUI·시각화·즉석 모델 검증이라는 "탐색과 설계" 단계에 있다.

## 정리하며

Data Wrangler는 4단계로 외운다. ① **소스 연결**(S3, Athena, Redshift, Snowflake, Feature Store), ② **변환**(300+ 내장 변환, 커스텀 코드 가능), ③ **분석**(Data Quality 리포트, Quick Model, Target Leakage, Bias), ④ **내보내기**(Processing Job, Feature Store, Pipelines, 코드). 화면의 데이터는 샘플이고 전체 적용은 Processing Job이 한다는 점, 그리고 flow가 재현성을 보장한다는 점이 핵심이다.

다음 글에서는 처리한 특성을 저장하고 재사용·일관성 있게 제공하는 SageMaker Feature Store를 본다.

---

## 📝 연습 문제

**문제 1.** 데이터 과학자가 GUI에서 클릭만으로 결측치 대치, One-Hot 인코딩, 스케일링을 적용하고 분포를 시각적으로 확인하면서 빠르게 전처리를 설계하려 한다. 가장 적합한 도구는?

A) SageMaker Data Wrangler  
B) Amazon Redshift  
C) AWS Lambda  
D) Amazon Kinesis  

**정답: A**  
해설: Data Wrangler는 300개 이상의 내장 변환을 GUI에서 클릭으로 적용하고 분포를 시각화하는 데이터 준비 도구로, 코드 없는 빠른 전처리 설계에 최적이다. B는 데이터 웨어하우스, C는 서버리스 컴퓨팅, D는 실시간 스트리밍 서비스로 시각적 데이터 준비 용도가 아니다.

---

**문제 2.** Data Wrangler에서 화면에 보이는 데이터로 변환을 미리보기했고 잘 동작한다. 이 변환을 수백 GB의 전체 데이터셋에 실제로 적용하려면?

A) 화면에서 본 결과가 이미 전체에 적용된 것이므로 추가 작업 불필요  
B) flow를 SageMaker Processing Job으로 export하여 전체 데이터에 실행한다  
C) 데이터를 다시 업로드한다  
D) 변환을 하나씩 수동으로 재입력한다  

**정답: B**  
해설: Data Wrangler 화면의 데이터는 샘플이며, 전체 데이터에 변환을 적용하려면 flow를 Processing Job으로 export해 배치 실행해야 한다. A는 샘플이 전체라는 잘못된 가정이고, C·D는 export 메커니즘을 활용하지 못하는 비효율적 방법이다.

---

**문제 3.** Data Wrangler에서 "마지막 결제일" 특성이 타깃을 비정상적으로 잘 예측한다는 경고를 받았다. 어떤 분석 기능이 이를 잡아낸 것이며 무엇을 의심해야 하는가?

A) Quick Model — 데이터 부족  
B) Target Leakage 분석 — 타깃 정보가 특성에 새어 들어가는 데이터 누수  
C) 히스토그램 — 분포 왜곡  
D) PCA — 차원 과다  

**정답: B**  
해설: Data Wrangler의 Target Leakage 분석은 타깃 정보가 새어 들어간 특성을 비정상적으로 높은 예측력으로 탐지한다. 오프라인 성능은 높지만 실서비스에서는 그 정보를 추론 시점에 알 수 없어 무용지물이 된다. A는 성능 추정 도구, C는 분포 시각화, D는 차원 축소 기법으로 누수 탐지가 주목적이 아니다.

---

**문제 4.** Data Wrangler에서 거대한 S3 데이터셋의 일부만 조건에 맞게 SQL로 불러와 작업하고 싶다. 가장 적합한 데이터 소스 연결은?

A) Amazon Athena로 S3 데이터를 SQL 쿼리해 불러온다  
B) 전체 S3 파일을 로컬에 다운로드한다  
C) Lambda로 한 행씩 읽는다  
D) CloudFront로 캐싱한다  

**정답: A**  
해설: Athena는 S3 위 데이터를 SQL로 쿼리하므로 WHERE 절로 필요한 부분만 효율적으로 불러올 수 있어 대용량 데이터 샘플링에 적합하다. B는 비효율적이고 비용·시간이 크며, C는 ML 데이터 로딩에 부적합, D는 콘텐츠 전송 캐시로 데이터 쿼리 용도가 아니다.

---

**문제 5.** Data Wrangler로 만든 전처리 flow를 학습/추론 시 동일하게 재사용해 training/serving skew를 방지하려 한다. 가장 적절한 export 전략은?

A) flow를 매번 손으로 노트북에 복사한다  
B) flow를 SageMaker Pipelines 단계 또는 Feature Store로 export해 재현 가능한 파이프라인으로 통합한다  
C) 변환 결과만 캡처해 이미지로 저장한다  
D) 변환을 적용하지 않고 raw 데이터를 그대로 쓴다  

**정답: B**  
해설: flow를 SageMaker Pipelines 단계나 Feature Store로 export하면 동일한 변환이 버전 관리되고 학습·추론 양쪽에 재현 가능하게 적용되어 training/serving skew를 방지한다. A는 수작업으로 재현성이 깨지고, C는 변환 로직이 아닌 결과 이미지일 뿐이며, D는 전처리를 포기하는 것이다.

---
