# Day 4 - JumpStart·Pre-trained Models·Transfer Learning + Training Cost Optimization

So far we've covered training models from scratch with data. But training an image classifier or text generation model from the ground up every time requires massive data, time, and cost. Often it's far more sensible to use an already well-trained model and adjust it slightly for your problem. SageMaker **JumpStart** opens this path. Today we cover JumpStart and transfer learning, plus comprehensive training cost optimization.

In the MLA-C01 exam, this topic appears as keywords: "fast deploy of pre-trained models", "transfer learning to build models with little data and cost", "multiple ways to reduce training cost".

## JumpStart: Pre-trained Model Hub

**JumpStart** is a hub of hundreds of pre-trained models and solution templates. For image classification, object detection, text classification, summarization, text generation (including LLMs), and more, you can deploy verified models in a few lines or fine-tune them on your data.

```python
from sagemaker.jumpstart.model import JumpStartModel

# Deploy pre-trained model as-is
model = JumpStartModel(model_id='huggingface-text2text-flan-t5-base')
predictor = model.deploy()

response = predictor.predict({'inputs': 'Summarize this sentence: ...'})
```

```python
from sagemaker.jumpstart.estimator import JumpStartEstimator

# Fine-tune pre-trained model on your data
estimator = JumpStartEstimator(model_id='huggingface-text2text-flan-t5-base')
estimator.fit({'training': 's3://my-bucket/my-data/'})
fine_tuned = estimator.deploy()
```

Distinguish two JumpStart usage patterns: ① **Deploy as-is**: Use model for inference without additional training. ② **Fine-tune then deploy**: Train additional on your domain data for specialization. In exams, think JumpStart for "deploy verified model quickly with minimal code".

> 💡 **Related Theory**: JumpStart's value lies in "reusing learned representations". Models trained on massive data already know general features—image edges and textures, language grammar and semantics. This knowledge is commonly useful across most downstream tasks. So fetching an already-knowing model instead of learning from scratch achieves high performance with little data and cost.

## Transfer Learning

**Transfer learning** is a technique to apply knowledge learned in one task to a related task. JumpStart fine-tuning is exactly transfer learning's implementation. Typically the pre-trained model's early layers (general feature extractors) stay frozen, and only later layers (task-specific classifiers) retrain on your data.

Three key benefits:

- **Sufficient with little data**: From-scratch learning needs tens of thousands of samples; transfer learning needs hundreds to thousands.
- **Reduced training time and cost**: Since only some layers train, it's faster and cheaper.
- **High performance**: Inheriting large-scale pre-training knowledge, performs well even on small datasets.

> ⚠️ **Pitfall**: "Labeled training data scarce (e.g., hundreds per class) but accurate image classifier needed" → answer is **transfer learning (pre-trained model fine-tuning)**. Training a CNN from scratch lacks data entirely. Conversely, if "data extremely abundant and domain completely different from existing models", consider from-scratch or deeper fine-tuning. Data quantity and domain similarity are decision factors.

## Training Cost Optimization Comprehensive

Gathering cost-reduction measures scattered through this week in one place. Exams comprehensively ask "ways to reduce training cost".

| Measure | Effect | Key Condition |
|---|---|---|
| **Managed Spot Training** | Up to 90% savings | Can interrupt → checkpoint mandatory |
| **Transfer Learning / JumpStart** | Reduce training volume itself | Leverage pre-trained models |
| **Early Stopping (tuning)** | Stop hopeless training | early_stopping in AMT |
| **Appropriate Instance Selection** | Prevent over-provisioning | CPU/GPU matching algorithm |
| **Distributed Training Efficiency** | Reduce time | FSx for I/O bottleneck |
| **Input Mode Optimization** | Startup latency, disk savings | Pipe/Fast File for large data |
| **Data Format (RecordIO)** | I/O efficiency | Large-scale streaming |

The two most powerful measures are **Spot training** (infrastructure unit-cost reduction) and **transfer learning/JumpStart** (reducing training volume itself). These work on different axes, usable together—fine-tuning a pre-trained model on Spot instances compounds both reductions.

```python
# Cost optimization example combining transfer learning + Spot
estimator = JumpStartEstimator(
    model_id='huggingface-text2text-flan-t5-base',
    use_spot_instances=True,
    max_run=3600,
    max_wait=7200,
    checkpoint_s3_uri='s3://my-bucket/checkpoints/',
)
```

> 💡 **Related Theory**: Cost optimization divides into two streams clearly: ① **Lower unit cost**: Same work with cheaper resources—Spot, right instance size, input modes. ② **Reduce work volume**: Do less computing upfront—transfer learning (don't learn from scratch), early stopping (stop hopeless attempts). Distinguishing whether exam questions ask "cost" or "work volume" reveals answers quickly.

## Additional Cost Perspective: Monitoring and Auto-Termination

Unexpected training cost waste often comes from "resources that finished but didn't shut down" and "badly-configured training running forever". A few safeguards exist:

- **Set `max_run`**: Forcibly terminate training exceeding time limit, preventing runaway costs.
- **Notebook auto-termination**: SageMaker Studio/notebook instances' idle auto-shutdown (lifecycle config) prevents forgotten notebook charges.
- **Training job auto-instance termination**: Training Jobs auto-terminate instances when complete (as covered yesterday), so unlike endpoints, abandonment cost risk is small.

> 📚 **Case Study**: A team ran a GPU notebook instance for experiments, forgot to shut it Friday evening, and left it running through the weekend. Training jobs auto-terminate when done but notebook instances bill until someone shuts them, costing tens of thousands in one oversight. Later they applied idle auto-shutdown lifecycle config so the notebook auto-shuts after period of inactivity, preventing recurrence.

## Summary

Remember by three axes: ① **JumpStart**: Pre-trained model hub, deploy as-is or fine-tune on your data (fit→deploy). Deploy verified models quickly with minimal code. ② **Transfer learning**: Move pre-trained knowledge for high performance with little data, cost, time. "Scarce label data but accurate classifier needed" → transfer learning. ③ **Cost optimization**: Distinguish "lower unit cost" (Spot+checkpoints, right instances, input modes/RecordIO) from "reduce work volume" (transfer learning, early stopping), preventing abandonment charges with max_run and notebook auto-termination. Exams: Spot and transfer learning are the strongest reductions; combining them is key.

Next we comprehensively review this week (Model Development 1 — SageMaker Training) entirely.

---

## 📝 연습 문제

**문제 1.** 검증된 텍스트 요약 모델을 거의 코드 작성 없이 빠르게 추론 엔드포인트로 배포하고 싶다. 가장 적합한 SageMaker 기능은?

A) 빌트인 K-Means를 처음부터 학습한다  
B) JumpStart에서 사전학습 모델을 선택해 배포한다  
C) Feature Store에 모델을 적재한다  
D) Data Wrangler로 데이터를 변환한다  

**정답: B**  
해설: JumpStart는 수백 개의 사전학습 모델을 제공해 추가 학습 없이 몇 줄로 배포하거나 미세조정할 수 있어 검증된 모델을 빠르게 시작하기에 적합하다. A는 무관한 군집화 알고리즘을 밑바닥 학습하는 것이고, C는 특성 저장소, D는 데이터 전처리 도구로 모델 배포와 거리가 멀다.

---

**문제 2.** 클래스당 수백 장 수준의 적은 라벨 이미지로 정확한 이미지 분류기를 만들어야 한다. 가장 적합한 접근은?

A) 처음부터 깊은 CNN을 무작위 초기화로 학습한다  
B) 사전학습 모델을 가져와 내 데이터로 미세조정하는 전이학습을 한다  
C) 데이터를 모두 버리고 규칙 기반으로 분류한다  
D) 학습 없이 K-Means로 군집화한다  

**정답: B**  
해설: 전이학습은 대규모로 학습된 모델의 일반 특징을 물려받아 적은 데이터로도 높은 성능을 내므로, 라벨 데이터가 적은 이미지 분류에 적합하다. A는 데이터가 부족해 과적합되기 쉽고, C는 분류 정확도를 보장하기 어려우며, D는 라벨을 활용하지 못하는 비지도 방식이다.

---

**문제 3.** 사전학습 LLM을 내 도메인 데이터로 미세조정하면서 학습 비용을 최대한 줄이고 싶다. 학습이 중단되어도 재개 가능하다. 가장 효과적인 조합은?

A) 온디맨드 인스턴스 + 더 큰 GPU  
B) JumpStart 미세조정 + Managed Spot Training + 체크포인트  
C) 처음부터 LLM 사전학습  
D) 추론 엔드포인트를 여러 개 띄운다  

**정답: B**  
해설: 전이학습(JumpStart 미세조정)은 학습량 자체를 줄이고 Spot+체크포인트는 인프라 단가를 최대 90% 낮추며 중단 시 재개가 가능하므로, 두 절감 축을 함께 적용해 비용을 크게 줄인다. A는 비용을 키우고, C는 막대한 비용이 들며, D는 학습이 아닌 추론 비용을 늘린다.

---

**문제 4.** 학습 비용 최적화 수단을 "단가를 낮추는 것"과 "작업량 자체를 줄이는 것"으로 나눌 때, 작업량을 줄이는 쪽에 해당하는 것은?

A) Managed Spot Training  
B) 적절한 인스턴스 타입 선택  
C) 전이학습(사전학습 모델 활용)  
D) Pipe 입력 모드  

**정답: C**  
해설: 전이학습은 처음부터 배우지 않고 사전학습 지식을 재사용해 필요한 계산량 자체를 줄이는 접근이다. A·B·D는 같은 작업을 더 싼 자원이나 효율적 I/O로 수행해 단가를 낮추는 수단이다.

---

**문제 5.** 실험용으로 띄운 GPU 노트북 인스턴스를 끄는 것을 잊어 사용하지 않는 동안에도 과금이 계속되는 문제를 막으려 한다. 가장 적합한 조치는?

A) 학습 작업의 max_run을 0으로 설정한다  
B) 노트북 인스턴스에 유휴 자동 종료 lifecycle config를 적용한다  
C) Spot 인스턴스로 노트북을 띄운다  
D) Feature Store를 비활성화한다  

**정답: B**  
해설: 유휴 자동 종료 lifecycle config는 일정 시간 활동이 없으면 노트북 인스턴스를 스스로 종료해 켜두고 잊은 자원의 방치 과금을 막는다. A는 학습이 즉시 중단되는 잘못된 설정이고, C는 노트북 중단 위험을 키우며, D는 비용 문제와 무관하다.

---
