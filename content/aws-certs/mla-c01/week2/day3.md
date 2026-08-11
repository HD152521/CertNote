# Day 3 - 쿼리·탐색: Athena, Redshift, EDA 기초

## 📌 핵심 정리

- **Athena**는 서버리스 SQL로 S3를 직접 쿼리한다. 과금은 **스캔한 데이터량**($5/TB) — 스캔량 절감이 곧 비용 절감.
- Athena 3대 비용 레버: **열 기반 포맷(Parquet) + 파티셔닝 + 압축**.
- **Redshift**는 적재형 데이터웨어하우스(MPP). 반복적 고성능 BI에 강하다. **Spectrum**이 S3와의 다리.
- **Redshift ML**은 `CREATE MODEL` SQL로 데이터를 옮기지 않고 모델을 학습·추론한다.
- 모델링 전 **EDA**로 분포·결측·이상치·상관·클래스 불균형·**데이터 누수**를 반드시 점검한다.

## Amazon Athena: S3를 SQL로 쿼리

데이터를 수집·카탈로그화했다면 이제 **읽고 이해할** 차례다. 모델을 만들기 전 데이터 사이언티스트는 반드시 데이터를 들여다본다 — 이것이 **EDA(Exploratory Data Analysis)**다.

**Athena**는 S3에 저장된 데이터를 **서버리스 SQL**로 쿼리하는 서비스다. Presto/Trino 엔진 기반이고 클러스터 프로비저닝이 전혀 없다. Glue Data Catalog의 테이블 정의를 그대로 사용한다.

- **서버리스**: 인프라 관리 없음. 쿼리할 때만 동작.
- **schema-on-read**: 데이터를 옮기지 않고 S3에 둔 채로 쿼리.
- **과금 = 스캔한 데이터량**: 쿼리가 스캔한 바이트당 과금($5/TB). **스캔량 최소화가 곧 비용 절감**이다.

```sql
-- Glue Catalog에 등록된 테이블을 바로 쿼리
SELECT customer_id, AVG(amount) AS avg_amount
FROM ml_datalake.transactions
WHERE year = '2026' AND month = '06'   -- 파티션 필터로 스캔량 감소
GROUP BY customer_id
ORDER BY avg_amount DESC
LIMIT 100;
```

위 쿼리에서 `WHERE year='2026' AND month='06'`는 **파티션 프루닝**을 일으켜 해당 파티션의 Parquet만 스캔한다.

**스캔량을 줄이는 3대 레버**

| 레버 | 원리 | 효과 |
|------|------|------|
| 열 기반 포맷(Parquet/ORC) | 필요한 컬럼 블록만 읽음 | 컬럼 수 비율만큼 감소 |
| 파티셔닝 | 조건에 맞는 폴더만 읽음 | 파티션 수 비율만큼 감소 |
| 압축(Snappy/GZIP) | 물리 바이트 자체가 작아짐 | 2~10배 감소 |

세 레버는 곱해진다. CSV 풀스캔 대비 잘 설계된 Parquet 쿼리가 수십 배 저렴해지는 이유다.

> 💡 **관련 이론**: Athena 비용이 "스캔한 데이터량"에 비례한다는 점은 ML 데이터 준비에 직접 영향을 준다. CSV로 풀스캔하면 비싸고 느리지만, 잘 파티셔닝된 Parquet은 같은 쿼리가 훨씬 낮은 비용으로 돈다. ML 피처를 뽑는 쿼리를 자주 돌린다면 이 차이가 누적된다.

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

| 구분 | Athena | Redshift |
|------|------|------|
| 모델 | 서버리스, S3 직접 쿼리 | 데이터웨어하우스(적재 필요) |
| 데이터 위치 | S3 (이동 없음) | 클러스터 내부(또는 Serverless) |
| 적합 | 임시·간헐적 쿼리, 탐색 | 반복적·고성능 분석, BI 대시보드 |
| 과금 | 스캔량 | 클러스터(노드 시간) 또는 RPU |
| 준비 작업 | 없음(카탈로그만) | 적재(COPY), 분산키·정렬키 설계 |
| 정답 키워드 | "간헐적", "관리 부담 최소", "S3 그대로" | "반복적 BI", "복잡한 조인", "지속 워크로드" |

**Redshift Spectrum**은 둘의 다리다 — Redshift에서 **S3의 데이터를 외부 테이블로 직접 쿼리**할 수 있다. 자주 쓰는 데이터(핫)는 Redshift 내부에, 차가운 데이터는 S3에 두고 Spectrum으로 조인한다.

```
   [Redshift 클러스터]              [S3 데이터 레이크]
   ┌──────────────────┐            ┌──────────────────┐
   │ 최근 3개월 (핫)  │ ──조인──▶ │ 과거 5년 (콜드)  │
   │ 내부 테이블      │  Spectrum  │ 외부 테이블      │
   └──────────────────┘            └──────────────────┘
```

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

데이터를 쿼리할 수 있게 됐으니 이제 **이해**할 차례다. EDA는 모델링 전에 데이터의 구조·품질·관계를 파악하는 과정이며, 피처 엔지니어링·데이터 정제의 근거를 제공한다.

| 점검 | 질문 | 발견 시 대응 |
|------|------|------|
| 분포 | 각 피처가 어떻게 분포하나? | 왜도(skew) → log 변환 |
| 결측치 | 어느 컬럼에 결측이 많나? | 대치(imputation) 또는 제거 |
| 이상치 | 극단값이 있나? | 클리핑, 제거, robust 스케일링 |
| 상관관계 | 피처 간/타깃과 상관은? | 다중공선성 제거, 무의미 피처 드롭 |
| 클래스 불균형 | 타깃 분포가 치우쳤나? | 오버/언더샘플링, class weight |
| 카디널리티 | 범주형 컬럼의 고유값 수는? | 인코딩 전략 결정 |
| 데이터 누수 | 타깃과 비현실적으로 높은 상관이 있나? | 해당 피처 제거 |

```python
import pandas as pd

df = pd.read_parquet("s3://ml-datalake/curated/churn/train.parquet")

# 기초 통계
print(df.describe())          # 수치형 분포(평균/표준편차/사분위)
print(df.isnull().mean())     # 컬럼별 결측 비율
print(df["churned"].value_counts(normalize=True))  # 클래스 불균형 확인
print(df.corr(numeric_only=True))  # 피처 상관행렬
```

**상관계수를 어떻게 읽는가** — EDA에서 바로 판단으로 이어지는 표다.

| 관측 | 무엇을 뜻하나 | 조치 |
|------|-------------|------|
| 피처-타깃 상관 ≈ 0 | 예측에 기여하지 않음 | 드롭 후보 |
| 피처-타깃 상관 0.99 | 데이터 누수 의심 | 원인 추적 후 제거 |
| 피처-피처 상관 0.95 | 다중공선성 | 하나만 남기거나 차원 축소 |
| 결측률 > 50% | 정보가 거의 없음 | 컬럼 제거 또는 "결측 여부" 플래그화 |
| 소수 클래스 < 1% | 극단 불균형 | 층화 분할 + 리샘플링 + PR-AUC |

> 💡 **관련 이론**: EDA는 1977년 통계학자 **John Tukey**가 그의 저서 *Exploratory Data Analysis*에서 정립한 개념이다. 핵심 철학은 "가설을 세우고 검정하기 전에, 먼저 데이터가 스스로 말하게 하라"이다. 박스플롯·히스토그램·산점도 같은 시각화도 Tukey의 유산이다. ML에서 EDA를 건너뛰면 클래스 불균형이나 데이터 누수(data leakage)를 놓쳐 모델이 잘못된 패턴을 학습한다.

> ⚠️ **함정**: EDA 단계에서 가장 위험한 실수는 **데이터 누수(data leakage)**다. 예를 들어 "결제 완료일"이라는 컬럼이 "구매 여부" 타깃을 사실상 미리 담고 있으면, 검증 정확도는 99%인데 실제 배포에선 무용지물이다. EDA에서 타깃과 비현실적으로 높은 상관(예: 0.99)을 가진 피처가 보이면 누수를 의심해야 한다.

AWS에서 EDA를 수행하는 환경은 보통 **SageMaker Studio / 노트북**이다. 노트북에서 Athena로 SQL 쿼리하거나, S3의 Parquet을 pandas로 직접 읽어 분석한다. 대규모 데이터는 **SageMaker Data Wrangler**가 시각적 EDA와 변환을 묶어 제공한다(Week 3에서 깊게 다룸).

```
[S3 Parquet] ──┬──> Athena SQL (대용량 집계·샘플링)
               ├──> pandas 노트북 (세밀한 분석·시각화)
               └──> Data Wrangler (시각적 EDA + 변환 + 품질 리포트)
```

## 도구 선택 요약

| 요구사항 | 정답 |
|---------|------|
| S3 데이터를 간헐적으로 SQL 탐색, 관리 부담 최소 | Athena |
| Athena 비용이 크다 | Parquet + 파티셔닝 + 압축, `SELECT *` 금지 |
| 반복적 고성능 BI, 복잡한 조인 | Redshift |
| 핫은 클러스터, 콜드는 S3에 두고 조인 | Redshift Spectrum |
| 데이터 이동 없이 SQL만으로 ML | Redshift ML |
| 쿼리 결과를 학습 데이터셋(Parquet)으로 저장 | Athena CTAS |

## Athena 쿼리를 빠르고 싸게 만드는 습관

스캔량 과금이라는 제약은 쿼리 작성 습관까지 바꾼다.

| 습관 | 나쁜 예 | 좋은 예 |
|------|--------|--------|
| 컬럼 선택 | `SELECT *` | 필요한 컬럼만 명시 |
| 파티션 필터 | 조건 없이 전체 조회 | `WHERE year='2026' AND month='06'` |
| 미리보기 | 전체를 정렬 후 확인 | `LIMIT`과 파티션 필터를 함께 |
| 반복 집계 | 같은 무거운 쿼리를 매번 | CTAS로 중간 테이블 생성 후 재사용 |
| 조인 | 큰 테이블끼리 무작정 조인 | 먼저 필터·집계로 줄인 뒤 조인 |

- `LIMIT`만으로는 스캔량이 줄지 않을 수 있다. 파티션 프루닝이 함께 걸려야 실제로 적게 읽는다.
- CTAS로 만든 Parquet 중간 테이블은 이후 반복 쿼리와 학습 데이터셋 생성 양쪽에 쓰인다.

## Redshift를 고르면 따라오는 설계 결정

Athena와 달리 Redshift는 "적재형"이라 데이터 배치 설계가 성능을 좌우한다.

| 결정 | 무엇을 정하나 | 잘못하면 |
|------|-------------|---------|
| 분산 방식(DISTKEY) | 행을 노드에 어떻게 흩뿌릴지 | 조인마다 노드 간 데이터 이동이 발생 |
| 정렬 키(SORTKEY) | 블록 내 정렬 순서 | 범위 조회에서 불필요한 블록까지 읽음 |
| 압축 인코딩 | 컬럼별 저장 방식 | 저장 용량과 I/O가 커짐 |
| 적재 방식 | COPY로 병렬 적재 | 한 줄씩 INSERT하면 매우 느림 |

이 설계 부담이 곧 "간헐적 탐색이면 Athena, 반복적 고성능 분석이면 Redshift"라는 판별의 실질적 근거다.

## EDA에서 무엇을 그려 보나

| 시각화 | 무엇을 확인 | 이어지는 조치 |
|--------|-----------|-------------|
| 히스토그램 | 분포 모양, 왜도 | 로그 변환 여부 |
| 박스플롯 | 사분위와 이상치 | IQR 기준 이상치 처리 |
| 산점도 | 두 변수의 관계 | 비선형 관계면 파생 특성 |
| 상관행렬 히트맵 | 다중공선성, 타깃 상관 | 중복 특성 제거, 누수 의심 |
| 클래스 막대그래프 | 타깃 불균형 정도 | 층화 분할·리샘플링 계획 |
| 결측 패턴 표 | 어느 컬럼이 함께 비는가 | 결측 메커니즘 추정 |

> ⚠️ **함정**: EDA를 전체 데이터로 한 뒤 그 결과를 근거로 특성을 고르고, 그다음에 train/test를 나누면 이미 누수가 시작된 것이다. 특성 선택·변환 기준은 **분할 이후 train에서만** 도출해야 한다. 탐색 목적의 눈으로 보는 것과, 그 통계를 학습에 쓰는 것은 구분해야 한다.

## 쿼리 도구를 고르는 한 줄 판별

| 지문 단서 | 정답 |
|----------|------|
| "인프라 관리 없이", "가끔 쓴다", "S3에 그대로" | Athena |
| "스캔 비용을 줄여라" | Parquet + 파티셔닝 + 컬럼 선택 |
| "매일 수백 명이 BI 대시보드를 본다" | Redshift |
| "핫 데이터는 클러스터, 콜드는 S3" | Redshift Spectrum |
| "데이터를 옮기지 않고 SQL로 예측" | Redshift ML |
| "쿼리 결과를 학습용 Parquet으로" | Athena CTAS |
| "모델 만들기 전 데이터를 이해해야" | EDA (분포·결측·불균형·누수) |

다음 글에서는 이 데이터를 ML 학습에 최적화하는 **저장 전략 — 파티셔닝, 포맷 최적화, 학습용 준비 고려사항**을 본다.

## 📖 용어

- **Athena** : S3의 파일을 옮기지 않고 SQL로 바로 조회하는 서버리스 쿼리 서비스. 스캔한 양만큼 돈을 낸다.
- **스캔량 과금** : 쿼리가 실제로 읽은 바이트 수에 비례해 요금이 매겨지는 방식. Athena 비용 설계의 전부.
- **파티션 프루닝** : `WHERE` 조건에 맞는 폴더만 읽고 나머지는 아예 건드리지 않는 최적화.
- **CTAS** : `CREATE TABLE AS SELECT`. 쿼리 결과를 새 테이블(파일)로 저장하는 구문. 학습셋 생성에 쓴다.
- **MPP(대규모 병렬 처리)** : 여러 노드가 데이터를 나눠 동시에 계산하는 구조. Redshift의 속도 비결.
- **Redshift Spectrum** : Redshift에서 S3 데이터를 외부 테이블로 읽어 내부 테이블과 조인하게 해주는 기능.
- **Redshift ML** : `CREATE MODEL` SQL로 Autopilot을 호출해 데이터 이동 없이 학습·추론하는 기능.
- **EDA(탐색적 데이터 분석)** : 모델을 만들기 전 데이터의 분포·결측·이상치·관계를 눈으로 확인하는 단계.
- **왜도(skew)** : 분포가 한쪽으로 길게 치우친 정도. 심하면 로그 변환 등으로 펴준다.
- **다중공선성** : 서로 거의 같은 정보를 담은 피처들이 함께 들어가 모델 해석과 안정성을 해치는 현상.

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
