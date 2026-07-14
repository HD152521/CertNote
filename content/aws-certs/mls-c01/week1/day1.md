# Day 1 - ML Lifecycle (Specialty Perspective)

The AWS Certified Machine Learning – Specialty (MLS-C01) exam doesn't ask about SageMaker button locations. Instead, it presents scenarios asking: "To solve this business problem, what data do I need, how should I prepare it, which algorithm should I use, what metrics should I track, and how should I deploy and monitor?" That's why Day 1 reframes the entire lifecycle at Specialty depth. While Associate-level asks "what is each stage?", Specialty asks "what are the trade-offs between stages?"

Today's goals are to: ① learn how to translate business problems into ML problems, ② understand the circular structure of data → features → model → deployment → monitoring, and ③ develop the mindset to connect offline model metrics to business metrics.

## Problem Definition: Translating Business Questions into ML Problems

The most common failures happen not in modeling but in problem definition. "We want to reduce churn" is a business goal, not an ML problem. To translate it into an ML problem, you must fix three things.

1. **Prediction target**: What do you predict — binary classification of churn within the next 30 days?
2. **Input features**: What signals predict it — recent login frequency, payment history, support tickets?
3. **Success metric**: What defines a "good" model — maximize precision at recall ≥ 0.8?

Getting the problem type wrong throws everything after it off-track. The Specialty exam constantly presents this mapping in scenarios.

| Business Question | ML Problem Type | Typical Output |
|-----------|---|---|
| Is this transaction fraudulent? | Binary Classification | 0–1 probability |
| Which customer segment is this? | Multi-class Classification | Class label |
| What will next month's revenue be? | Regression | Continuous value |
| Which users form similar groups? | Clustering | Cluster ID |
| What product will this user buy next? | Recommendation | Ranked list |
| Is this sensor reading anomalous? | Anomaly Detection | Anomaly score |

> 💡 **Related Theory**: Supervised learning learns input→output mapping from labeled data, while unsupervised learning discovers structure without labels. Fraud detection is typically solved as supervised binary classification, but if labeled examples (past fraud cases) are extremely sparse, it might shift to unsupervised anomaly detection (like Random Cut Forest). The same business problem can change problem types based on **label availability** — this label-availability trap is a frequent Specialty curveball.

## Lifecycle is Circular, Not Linear

ML systems don't end after one build. When data changes during operation (drift), the cycle starts over.

```
1. Data        : Collect → Clean → Label → Store (data lake)
2. Features    : Feature engineering → Transform → Feature Store
3. Model       : Algorithm selection → Train → HPO tuning → Evaluate
4. Deploy      : Real-time endpoint / Batch transform / Serverless
5. Monitor     : Data/model quality drift → retrain trigger
                 └──────────(loop back to 1)──────────┘
```

This week (Week 1) focuses on stage 1 (data) and the stages just before it: collection, storage, and labeling. Specialty places heavy weight on data engineering (~20% of exam).

```python
# SageMaker SDK view of lifecycle — separation of concerns per stage
import sagemaker
from sagemaker.processing import ProcessingInput, ProcessingOutput

session = sagemaker.Session()
role = sagemaker.get_execution_role()

# Stages 1–2: Data cleaning + feature engineering via Processing Job
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

Separating each stage into its own job makes reproducibility and re-running easier. You can re-run cleaning alone or train different algorithms on the same features.

> 💡 **Related Theory**: Training-serving skew (train-serve disparity) occurs when the feature transformation logic used during training differs from the logic during inference, causing performance degradation. Pinning preprocessing to code (`preprocess.py`) and reusing it identically in training and inference—or managing features centrally via SageMaker Feature Store—reduces this skew. Features engineered ad-hoc in notebooks almost always create skew.

## Connecting Offline Model Metrics to Business Metrics

This is where Specialty digs deepest. A single metric like accuracy is misleading. If fraud is 0.1% of transactions, predicting "all normal" gives 99.9% accuracy. That's why you must consider both **class imbalance** and **error costs** together.

```python
# Core classification metrics (confusion matrix based)
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score

# precision = TP / (TP + FP)  → "Of those labeled fraud, what fraction truly are?" (false alarm cost)
# recall    = TP / (TP + FN)  → "Of actual fraud, what fraction did we catch?" (miss cost)
precision = precision_score(y_true, y_pred)
recall    = recall_score(y_true, y_pred)
f1        = f1_score(y_true, y_pred)          # harmonic mean of precision·recall
auc       = roc_auc_score(y_true, y_score)    # threshold-agnostic, ranking quality
```

Business context determines which metric to optimize.

- **Fraud detection / Cancer diagnosis**: Missing one is catastrophic → prioritize **recall**
- **Spam filter / Marketing targeting**: False alarm is expensive (blocking legitimate email) → prioritize **precision**
- **Class imbalance + threshold not yet set**: Use **AUC** or **PR-AUC** to compare the model's raw discrimination power

> 💡 **Related Theory**: ROC-AUC (TPR-FPR curve area) is relatively insensitive to class imbalance. But with extreme imbalance (positive class 0.1%), ROC-AUC can look overly optimistic, so **PR-AUC** (precision-recall curve area) gives a more honest signal. Specialty frequently asks "which metric for imbalanced data?" and the answer is usually PR-AUC or whichever of recall/precision has the higher cost.

## Online Validation via A/B Testing

Good offline metrics don't guarantee real user behavior improves (revenue, time on site). So deployment isn't one-time; traffic is split to validate. SageMaker lets you put multiple variants on one endpoint and distribute traffic via weights.

```python
from sagemaker.session import production_variant

variant_a = production_variant(model_name="model-v1", instance_type="ml.m5.large",
                               initial_instance_count=1, variant_name="A", initial_weight=90)
variant_b = production_variant(model_name="model-v2", instance_type="ml.m5.large",
                               initial_instance_count=1, variant_name="B", initial_weight=10)

session.endpoint_from_production_variants(
    name="fraud-endpoint", production_variants=[variant_a, variant_b]
)
# Send only 10% to new model (B), compare business metrics via CloudWatch, then adjust weights
```

Offline metrics are the **gate** (fail to pass and don't deploy), online metrics are the **final verdict**. This separation is the operational sensibility Specialty demands.

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
