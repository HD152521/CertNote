# Day 1 - ML 수명주기 (Specialty 관점)

MLS-C01(AWS Certified Machine Learning – Specialty)은 SageMaker 버튼 위치를 묻지 않는다. "이 비즈니스 문제를 풀려면 어떤 데이터를, 어떻게 가공해서, 어떤 알고리즘으로, 어떤 지표로 평가하고, 어떻게 배포·모니터링할 것인가"를 시나리오로 묻는다. 그래서 첫날은 전체 수명주기를 Specialty 깊이로 다시 그린다. Associate가 "각 단계가 뭔지"를 묻는다면, Specialty는 "단계 사이의 트레이드오프"를 묻는다.

오늘 목표는 ① 문제를 ML 문제로 번역하는 법, ② 데이터→특성→모델→배포→모니터링의 순환 구조, ③ 오프라인 모델 지표를 비즈니스 지표에 연결하는 사고를 잡는 것이다.

## 문제 정의: 비즈니스 질문을 ML 문제로 번역하기

가장 흔한 실패는 모델링이 아니라 문제 정의에서 일어난다. "이탈을 줄이고 싶다"는 비즈니스 목표지 ML 문제가 아니다. ML 문제로 번역하려면 세 가지를 고정해야 한다.

1. **예측 대상(target)**: 무엇을 예측하는가 — 다음 30일 내 이탈 여부(이진 분류)
2. **입력(features)**: 어떤 신호로 예측하는가 — 최근 로그인 빈도, 결제 이력, 지원 티켓 수
3. **성공 기준(metric)**: 무엇이 "좋은" 모델인가 — recall 0.8 이상에서 precision 최대화

문제 유형을 잘못 잡으면 그 뒤 모든 게 어긋난다. Specialty 시험은 다음 매핑을 시나리오로 끊임없이 묻는다.

| 비즈니스 질문 | ML 문제 유형 | 대표 출력 |
|--------------|-------------|----------|
| 이 거래가 사기인가? | 이진 분류 | 0~1 확률 |
| 이 고객은 어느 등급인가? | 다중 분류 | 클래스 레이블 |
| 다음 달 매출은 얼마? | 회귀 | 연속값 |
| 이 사용자와 비슷한 그룹은? | 군집화 | 클러스터 ID |
| 다음에 살 상품은? | 추천 | 순위 리스트 |
| 이 센서값이 비정상인가? | 이상 탐지 | 이상 점수 |

> 💡 **관련 이론**: 지도학습(supervised)은 레이블이 있는 데이터로 입력→출력 매핑을 배우고, 비지도학습(unsupervised)은 레이블 없이 구조를 발견한다. "사기 탐지"는 보통 지도학습 이진 분류로 풀지만, 레이블(과거 사기 사례)이 극히 적으면 이상 탐지(Random Cut Forest 같은 비지도 기법)로 접근한다. 같은 비즈니스 문제도 **레이블 가용성**에 따라 문제 유형이 바뀐다는 점이 Specialty의 단골 함정이다.

## 수명주기는 선형이 아니라 순환이다

ML 시스템은 한 번 만들고 끝나지 않는다. 운영 중 데이터가 변하면(드리프트) 다시 처음으로 돌아간다.

```
1. 데이터 (Data)        : 수집 → 정제 → 레이블링 → 저장(데이터레이크)
2. 특성 (Feature)       : 피처 엔지니어링 → 변환 → Feature Store
3. 모델 (Model)         : 알고리즘 선택 → 학습 → HPO 튜닝 → 평가
4. 배포 (Deploy)        : 실시간 엔드포인트 / 배치 변환 / 서버리스
5. 모니터링 (Monitor)   : 데이터·모델 품질 드리프트 → 재학습 트리거
                         └──────────────(loop back to 1)──────────────┘
```

이번 주(Week 1)는 1단계 데이터와 그 직전 단계인 수집·저장·레이블링에 집중한다. Specialty 시험에서 데이터 엔지니어링 도메인의 비중이 크기 때문이다(전체의 약 20%).

```python
# SageMaker SDK로 본 수명주기 — 단계별 책임 분리
import sagemaker
from sagemaker.processing import ProcessingInput, ProcessingOutput

session = sagemaker.Session()
role = sagemaker.get_execution_role()

# 1~2단계: 데이터 정제 + 피처 엔지니어링을 Processing Job으로
from sagemaker.sklearn.processing import SKLearnProcessor

processor = SKLearnProcessor(
    framework_version="1.2-1",
    role=role,
    instance_type="ml.m5.xlarge",
    instance_count=1,
)
processor.run(
    code="preprocess.py",
    inputs=[ProcessingInput(source="s3://my-lake/raw/", destination="/opt/ml/processing/input")],
    outputs=[ProcessingOutput(source="/opt/ml/processing/train", destination="s3://my-lake/features/train")],
)
```

각 단계를 별도 잡으로 분리하면 재현성과 재실행이 쉬워진다. 정제만 다시 돌리거나, 같은 피처로 다른 알고리즘을 학습하는 식이다.

> 💡 **관련 이론**: training-serving skew(학습-서빙 괴리)는 학습 때 쓴 피처 변환 로직과 추론 때 쓰는 로직이 달라서 생기는 성능 저하다. 위처럼 전처리를 코드(`preprocess.py`)로 고정하고 학습·추론에서 동일하게 재사용하거나, SageMaker Feature Store로 피처를 중앙에서 관리하면 이 괴리를 줄인다. 노트북에서 즉흥적으로 가공한 피처는 거의 항상 skew를 만든다.

## 오프라인 모델 지표를 비즈니스 지표에 연결하기

Specialty가 가장 깊게 파고드는 부분이다. accuracy 같은 단일 지표는 비즈니스를 호도한다. 사기 거래가 0.1%인 데이터에서 "전부 정상"이라고 찍어도 accuracy는 99.9%다. 그래서 **클래스 불균형**과 **오류 비용**을 함께 봐야 한다.

```python
# 분류 문제의 핵심 지표 계산 (혼동행렬 기반)
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score

# precision = TP / (TP + FP)  → "사기라고 한 것 중 진짜 사기 비율" (오탐 비용)
# recall    = TP / (TP + FN)  → "실제 사기 중 잡아낸 비율"      (미탐 비용)
precision = precision_score(y_true, y_pred)
recall    = recall_score(y_true, y_pred)
f1        = f1_score(y_true, y_pred)          # precision·recall 조화평균
auc       = roc_auc_score(y_true, y_score)    # 임계값 무관, 순위 품질
```

비즈니스 맥락이 지표 선택을 결정한다.

- **사기 탐지/암 진단**: 놓치면 치명적 → **recall** 우선
- **스팸 필터/마케팅 타겟팅**: 오탐이 비싸다(정상 메일 차단) → **precision** 우선
- **클래스 불균형 + 임계값을 아직 못 정함**: **AUC** 또는 **PR-AUC**로 모델 자체의 분별력 비교

> 💡 **관련 이론**: ROC-AUC는 다양한 임계값에서의 TPR-FPR 곡선 아래 면적이라 클래스 불균형에 비교적 둔감하다. 하지만 **극단적 불균형**(양성 0.1%)에서는 ROC-AUC가 낙관적으로 보이므로, precision-recall 곡선 아래 면적인 **PR-AUC**가 더 정직한 신호다. Specialty는 "불균형 데이터에서 어떤 지표?"를 자주 묻고, 답은 대개 PR-AUC 또는 recall/precision 중 비용이 큰 쪽이다.

## A/B 테스트로 온라인 검증하기

오프라인 지표가 좋아도 실제 사용자 행동(매출, 체류시간)은 떨어질 수 있다. 그래서 배포는 한 번에 전환하지 않고 트래픽을 나눠 검증한다. SageMaker는 한 엔드포인트에 여러 variant를 두고 가중치로 분배한다.

```python
from sagemaker.session import production_variant

variant_a = production_variant(model_name="model-v1", instance_type="ml.m5.large",
                               initial_instance_count=1, variant_name="A", initial_weight=90)
variant_b = production_variant(model_name="model-v2", instance_type="ml.m5.large",
                               initial_instance_count=1, variant_name="B", initial_weight=10)

session.endpoint_from_production_variants(
    name="fraud-endpoint", production_variants=[variant_a, variant_b]
)
# 신모델(B)에 10%만 보내 CloudWatch로 비즈니스 지표 비교 후 가중치 조정
```

오프라인 지표는 **게이트**(통과 못 하면 배포 안 함), 온라인 지표는 **최종 판정**으로 쓴다. 이 분리가 Specialty가 요구하는 운영 감각이다.

## 📝 연습 문제

**문제 1.** 한 핀테크가 거래의 0.2%만이 사기인 데이터로 사기 탐지 모델을 만든다. 미탐(실제 사기를 놓침)의 비용이 오탐보다 훨씬 크다. 가장 적절한 평가 지표 조합은?

A) accuracy 단독  
B) recall을 우선하고, 임계값 비교에는 PR-AUC를 사용  
C) precision 단독  
D) 학습 손실(loss)값  

**정답: B**  
해설: 극단적 클래스 불균형에서 accuracy는 "전부 정상" 예측으로도 99.8%가 나와 무의미하다. 미탐 비용이 크므로 실제 사기를 얼마나 잡는지인 recall이 우선이고, 임계값 전반의 분별력은 불균형에 정직한 PR-AUC로 본다. precision 단독은 미탐을 놓치는 방향이고, 학습 손실은 비즈니스 비용을 반영하지 못한다.

---

**문제 2.** "고객 이탈을 줄이고 싶다"는 요청을 ML 문제로 번역할 때 가장 먼저 고정해야 하는 것은?

A) 예측 대상(target), 입력 특성, 성공 지표의 세 가지 정의  
B) 사용할 SageMaker 인스턴스 타입  
C) 모델 배포 리전  
D) 학습 데이터의 저장 포맷  

**정답: A**  
해설: 비즈니스 목표를 ML 문제로 번역하려면 무엇을 예측하는지(예: 30일 내 이탈 여부), 어떤 신호로 예측하는지, 무엇이 좋은 모델인지(지표)를 먼저 고정해야 한다. 인스턴스 타입·리전·저장 포맷은 문제 정의가 끝난 뒤의 구현 세부사항이다.

---

**문제 3.** 과거 사기 사례 레이블이 거의 없는 신규 결제 서비스에서 사기 탐지를 시작하려 한다. 가장 현실적인 접근은?

A) 레이블이 없으므로 모델링이 불가능하다  
B) Random Cut Forest 같은 비지도 이상 탐지로 시작한다  
C) 무조건 다중 분류로 푼다  
D) 회귀로 매출을 예측한다  

**정답: B**  
해설: 레이블(양성 사례)이 부족하면 지도학습 이진 분류가 어렵다. 이때는 정상 패턴에서 벗어난 정도를 점수화하는 비지도 이상 탐지(예: Random Cut Forest)로 출발하고, 레이블이 쌓이면 지도학습으로 전환한다. 같은 문제도 레이블 가용성에 따라 문제 유형이 바뀐다.

---

**문제 4.** 오프라인 평가에서 AUC가 크게 오른 추천 모델을 전체 트래픽에 즉시 배포했더니 매출이 떨어졌다. 이를 사전에 막는 가장 적절한 방법은?

A) 오프라인 AUC를 더 높인다  
B) 학습 데이터를 늘린다  
C) 인스턴스를 더 큰 것으로 바꾼다  
D) 트래픽 일부만 신모델로 보내는 A/B 테스트로 실제 비즈니스 지표를 관찰한다  

**정답: D**  
해설: 오프라인 지표(AUC)와 온라인 비즈니스 지표(매출)는 어긋날 수 있으므로, production variant 가중치로 신모델에 소량 트래픽만 보내 실제 행동 지표를 비교한 뒤 점진 확대해야 한다. AUC를 더 올리거나 데이터를 늘리는 것은 같은 함정을 반복하고, 인스턴스 크기는 무관하다.

---

**문제 5.** ML 수명주기를 "선형 파이프라인"이 아니라 "순환 루프"로 봐야 하는 가장 핵심적인 이유는?

A) SageMaker가 그렇게 강제하기 때문  
B) 모델 학습이 항상 한 번에 끝나지 않기 때문  
C) 운영 중 데이터 분포가 변하면(드리프트) 모니터링이 재학습을 트리거해 데이터 단계로 돌아가기 때문  
D) 비용 절감을 위해서  

**정답: C**  
해설: ML 시스템은 동작이 데이터에서 학습되므로, 운영 중 입력 분포가 변하면 성능이 저하된다. 모니터링 단계가 드리프트를 감지해 데이터·재학습 단계로 되돌리는 피드백이 핵심이라 순환 구조다. SDK 강제나 학습 횟수, 비용은 부차적 이유다.

---
