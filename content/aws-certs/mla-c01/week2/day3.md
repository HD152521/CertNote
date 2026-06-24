# Day 3 - 쿼리·탐색: Athena, Redshift, EDA 기초

Day 1에서 데이터를 수집하고 Day 2에서 Glue로 카탈로그화·변환했다. 이제 데이터를 **읽고 이해할** 차례다. 모델을 만들기 전, 데이터 사이언티스트는 반드시 데이터를 들여다본다. "이 피처의 분포는? 결측치는? 타깃과의 관계는?" — 이것이 **EDA(Exploratory Data Analysis, 탐색적 데이터 분석)**다.

오늘은 데이터 레이크를 직접 쿼리하는 **Athena**, 데이터웨어하우스 **Redshift**, 그리고 ML의 출발점인 EDA 기초를 본다.

## Amazon Athena: S3를 SQL로 쿼리

**Athena**는 S3에 저장된 데이터를 **서버리스 SQL**로 쿼리하는 서비스다. Presto/Trino 엔진 기반이고, 클러스터 프로비저닝이 전혀 없다. Glue Data Catalog의 테이블 정의를 그대로 사용한다.

핵심 특징:

- **서버리스**: 인프라 관리 없음. 쿼리할 때만 동작.
- **schema-on-read**: 데이터를 옮기지 않고 S3에 둔 채로 쿼리.
- **과금 = 스캔한 데이터량**: 쿼리가 스캔한 바이트당 과금($5/TB). 그래서 **스캔량 최소화가 곧 비용 절감**이다.

```sql
-- Glue Catalog에 등록된 테이블을 바로 쿼리
SELECT customer_id, AVG(amount) AS avg_amount
FROM ml_datalake.transactions
WHERE year = '2026' AND month = '06'   -- 파티션 필터로 스캔량 감소
GROUP BY customer_id
ORDER BY avg_amount DESC
LIMIT 100;
```

위 쿼리에서 `WHERE year='2026' AND month='06'`는 **파티션 프루닝**을 일으켜, 해당 파티션의 Parquet만 스캔한다. Parquet + 파티셔닝의 조합으로 스캔량을 수십 배 줄일 수 있다.

> 💡 **관련 이론**: Athena 비용이 "스캔한 데이터량"에 비례한다는 점은 ML 데이터 준비에 직접 영향을 준다. (1) **Parquet/ORC** 같은 열 기반 포맷 → 필요한 컬럼만 스캔, (2) **파티셔닝** → 필요한 파티션만 스캔, (3) **압축** → 물리 바이트 감소. 이 셋이 Athena의 3대 비용 절감 레버다. CSV로 풀스캔하면 비싸고 느리지만, 잘 파티셔닝된 Parquet은 같은 쿼리가 1/50 비용으로 돈다. ML 피처를 뽑는 쿼리를 자주 돌린다면 이 차이가 누적된다.

> 🔍 **더 깊이**: Athena는 ML 워크플로의 빠른 피처 탐색에 적합하다. SageMaker가 학습 데이터로 Parquet을 S3에서 읽기 전에, 분석가가 Athena로 "타깃 분포는? 클래스 불균형은?"을 SQL로 확인한다. 또 **Athena CTAS(CREATE TABLE AS SELECT)**로 쿼리 결과를 Parquet으로 S3에 저장해 학습 데이터셋을 직접 만들 수도 있다.

```sql
-- CTAS로 학습용 데이터셋을 Parquet으로 생성
CREATE TABLE ml_datalake.churn_training
WITH (format = 'PARQUET', external_location = 's3://ml-datalake/curated/churn/')
AS
SELECT customer_id, tenure, monthly_charges, churned
FROM ml_datalake.transactions
WHERE year = '2026';
```

## Amazon Redshift: 데이터웨어하우스

**Redshift**는 페타바이트급 **데이터웨어하우스(OLAP)**다. 데이터를 Redshift 내부 노드에 적재(또는 Redshift Serverless)하고, MPP(Massively Parallel Processing)로 복잡한 분석 쿼리를 고속 처리한다.

Athena와 Redshift의 핵심 차이:

| 구분 | Athena | Redshift |
|------|------|------|
| 모델 | 서버리스, S3 직접 쿼리 | 데이터웨어하우스(적재 필요) |
| 데이터 위치 | S3 (이동 없음) | 클러스터 내부(또는 Serverless) |
| 적합 | 임시·간헐적 쿼리, 탐색 | 반복적·고성능 분석, BI 대시보드 |
| 과금 | 스캔량 | 클러스터(노드 시간) 또는 RPU |

**Redshift Spectrum**은 둘의 다리다 — Redshift에서 **S3의 데이터를 외부 테이블로 직접 쿼리**할 수 있다. 자주 쓰는 데이터는 Redshift 내부에, 차가운 데이터는 S3에 두고 Spectrum으로 조인한다.

ML 통합 측면에서 **Redshift ML**도 알아두자. SQL `CREATE MODEL` 문으로 Redshift 안에서 SageMaker Autopilot을 호출해 모델을 학습·추론할 수 있다. 데이터를 옮기지 않고 SQL만으로 예측 컬럼을 만든다.

```sql
-- Redshift ML: SQL로 모델 학습 (내부적으로 SageMaker Autopilot 호출)
CREATE MODEL churn_predictor
FROM (SELECT tenure, monthly_charges, churned FROM transactions)
TARGET churned
FUNCTION predict_churn
IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftMLRole'
SETTINGS (S3_BUCKET 'ml-datalake-redshiftml');
```

> 🔍 **더 깊이**: 시험 단골 비교 — "임시 탐색/간헐적 쿼리 + 관리 부담 최소 + 데이터를 S3에 그대로"면 **Athena**. "반복적인 고성능 BI 쿼리 + 복잡한 조인 + 지속적 워크로드"면 **Redshift**. "Redshift에서 S3 차가운 데이터를 조인"이면 **Redshift Spectrum**. "데이터 이동 없이 SQL로 ML"이면 **Redshift ML**.

## EDA(탐색적 데이터 분석) 기초

데이터를 쿼리할 수 있게 됐으니 이제 **이해**할 차례다. EDA는 모델링 전에 데이터의 구조·품질·관계를 파악하는 과정이다. MLA-C01에서 EDA는 피처 엔지니어링·데이터 정제의 근거를 제공하는 필수 단계로 출제된다.

EDA의 핵심 점검 항목:

| 점검 | 질문 | 발견 시 대응 |
|------|------|------|
| 분포 | 각 피처가 어떻게 분포하나? | 왜도(skew) → log 변환 |
| 결측치 | 어느 컬럼에 결측이 많나? | 대치(imputation) 또는 제거 |
| 이상치 | 극단값이 있나? | 클리핑, 제거, robust 스케일링 |
| 상관관계 | 피처 간/타깃과 상관은? | 다중공선성 제거, 무의미 피처 드롭 |
| 클래스 불균형 | 타깃 분포가 치우쳤나? | 오버/언더샘플링, class weight |
| 카디널리티 | 범주형 컬럼의 고유값 수는? | 인코딩 전략 결정 |

```python
import pandas as pd

df = pd.read_parquet("s3://ml-datalake/curated/churn/train.parquet")

# 기초 통계
print(df.describe())          # 수치형 분포(평균/표준편차/사분위)
print(df.isnull().mean())     # 컬럼별 결측 비율
print(df["churned"].value_counts(normalize=True))  # 클래스 불균형 확인
print(df.corr(numeric_only=True))  # 피처 상관행렬
```

> 💡 **관련 이론**: EDA는 1977년 통계학자 **John Tukey**가 그의 저서 *Exploratory Data Analysis*에서 정립한 개념이다. 핵심 철학은 "가설을 세우고 검정하기 전에, 먼저 데이터가 스스로 말하게 하라"이다. 박스플롯·히스토그램·산점도 같은 시각화도 Tukey의 유산이다. ML에서 EDA를 건너뛰면 클래스 불균형이나 데이터 누수(data leakage)를 놓쳐 모델이 잘못된 패턴을 학습한다.

> ⚠️ **함정**: EDA 단계에서 가장 위험한 실수는 **데이터 누수(data leakage)**다. 예를 들어 "결제 완료일"이라는 컬럼이 "구매 여부" 타깃을 사실상 예측에 미리 포함하고 있으면, 검증 정확도는 99%인데 실제 배포에선 무용지물이다. EDA에서 타깃과 비현실적으로 높은 상관(예: 0.99)을 가진 피처가 보이면 누수를 의심해야 한다.

AWS에서 EDA를 수행하는 환경은 보통 **SageMaker Studio / 노트북**이다. 노트북에서 Athena로 SQL 쿼리하거나, S3의 Parquet을 pandas로 직접 읽어 분석한다. 대규모 데이터는 **SageMaker Data Wrangler**가 시각적 EDA와 변환을 묶어 제공한다(Week 3에서 깊게 다룸).

## 정리하며

준비된 데이터를 읽는 길은 두 갈래다. **Athena**(서버리스, S3 직접 쿼리, 스캔량 과금)는 임시 탐색에, **Redshift**(데이터웨어하우스, MPP)는 반복적 고성능 분석에 쓴다. 그리고 모델을 만들기 전 반드시 **EDA**로 분포·결측·이상치·상관·클래스 불균형·데이터 누수를 점검한다.

다음 글에서는 이 데이터를 ML 학습에 최적화하는 **저장 전략 — 파티셔닝, 포맷 최적화, 학습용 준비 고려사항**을 본다.

---

## 📝 연습 문제

**문제 1.** 데이터 사이언티스트가 S3의 Parquet 데이터를 인프라 관리 없이 간헐적으로 SQL로 탐색하려 한다. 비용은 스캔한 데이터량에만 비례하길 원한다. 가장 적합한 서비스는?

A) Amazon Redshift 프로비저닝 클러스터  
B) Amazon Athena  
C) Amazon EMR  
D) Amazon RDS  

**정답: B**  
해설: Athena는 서버리스로 S3 데이터를 SQL로 직접 쿼리하며 스캔한 데이터량(바이트)에만 과금해, 간헐적·임시 탐색에 이상적이다. Redshift 클러스터(A)는 노드 시간에 과금되고 데이터 적재가 필요해 간헐적 사용에 비효율적이다. EMR(C)은 클러스터 운영 부담이 크고, RDS(D)는 OLTP 데이터베이스다.

---

**문제 2.** Athena 쿼리 비용을 줄이려 한다. 다음 중 스캔량을 가장 효과적으로 줄이는 조합은?

A) CSV 포맷 + 단일 파일 저장  
B) Parquet 포맷 + 파티셔닝 + 압축  
C) JSON 포맷 + 압축  
D) 모든 데이터를 한 폴더에 평면 저장  

**정답: B**  
해설: Athena는 스캔량에 과금되므로 (1) 열 기반 Parquet으로 필요한 컬럼만 읽고, (2) 파티셔닝으로 필요한 파티션만 스캔하고, (3) 압축으로 물리 바이트를 줄이는 3대 레버가 효과적이다. CSV 단일 파일(A)이나 JSON(C)은 행 기반이라 비효율적이고, 평면 저장(D)은 파티션 프루닝을 막는다.

---

**문제 3.** 한 팀이 Redshift 클러스터에 자주 쓰는 데이터를 두고, S3에 보관된 차가운(cold) 과거 데이터를 데이터 이동 없이 조인해 쿼리하려 한다. 가장 적합한 기능은?

A) Redshift Spectrum  
B) Glue Crawler  
C) Kinesis Firehose  
D) DMS  

**정답: A**  
해설: Redshift Spectrum은 Redshift에서 S3의 데이터를 외부 테이블로 직접 쿼리하고 내부 테이블과 조인할 수 있게 해, 핫 데이터는 클러스터에 콜드 데이터는 S3에 두는 패턴을 지원한다. Glue Crawler(B)는 스키마 추론용, Firehose(C)는 스트림 적재용, DMS(D)는 DB 복제용이다.

---

**문제 4.** EDA 중 한 피처가 타깃과 0.99의 비정상적으로 높은 상관을 보인다. 가장 먼저 의심해야 할 것은?

A) 모델 성능이 매우 좋을 것이므로 그대로 사용  
B) 데이터 누수(data leakage) 가능성  
C) 해당 피처를 두 배 가중치로 사용  
D) 결측치 문제  

**정답: B**  
해설: 타깃과 비현실적으로 높은 상관을 가진 피처는 타깃 정보를 미리 포함한 데이터 누수일 가능성이 크다. 학습/검증에선 높은 정확도를 보이지만 배포 시 무용지물이 된다. 그대로 사용(A)하거나 가중치를 키우는 것(C)은 누수를 악화시킨다. 결측치(D)는 상관 수치 자체로 판단할 근거가 아니다.

---

**문제 5.** 데이터 이동 없이 Redshift 안에서 SQL 문만으로 모델을 학습하고 예측 컬럼을 만들고 싶다. 어떤 기능을 사용하는가?

A) Athena CTAS  
B) Redshift ML (CREATE MODEL)  
C) Glue DataBrew  
D) Redshift COPY  

**정답: B**  
해설: Redshift ML은 `CREATE MODEL` SQL 문으로 내부적으로 SageMaker Autopilot을 호출해 모델을 학습하고, 예측 함수를 만들어 SQL로 추론할 수 있게 한다. 데이터를 옮기지 않고 SQL만으로 ML을 수행한다. Athena CTAS(A)는 쿼리 결과를 테이블로 저장할 뿐 학습 기능은 없고, DataBrew(C)는 데이터 정제, COPY(D)는 데이터 적재 명령이다.

---
