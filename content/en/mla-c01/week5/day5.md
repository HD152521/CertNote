# Day 5 - Week 5 Comprehensive: Model Development 2 Review

This week covered "train with my code, scale training, look inside training, evaluate results correctly"—the second half of model development. Moving beyond built-in algorithms into custom training expands choices; judgments of "how much freedom vs how much managed services" become critical. Today we re-weave four topics into one flow.

## Week 5 at a Glance

```
[Custom Training]      How far to bring my code
   Script mode → requirements extension → BYOC

[Distributed Training] What to split
   Data parallel (slow) ↔ Model parallel (doesn't fit)

[Debugging·Profiling]   Look inside training
   Debugger (model tensors) ↔ Profiler (resources)

[Model Evaluation]      Is result truly good
   Metric selection + overfitting diagnosis + cross-validation
```

Penetrating principle: **Go down only as much needed, pick tools and metrics for the problem**. Custom training defaults to "minimum effort" (script mode); distributed by symptom (slow vs OOM); observation by concern (model vs resources); evaluation by problem character (imbalance, outliers).

## Custom Training Review

Spectrum of "how far to bring my code":

| Method | Bring | Fits |
|---|---|---|
| Script mode | train.py | Standard PyTorch/TF code, minimum effort |
| requirements extension | train.py + Python packages | Only additional pip packages |
| BYOC | Entire Docker image | System packages, special runtime |

Remember conventions: data is `SM_CHANNEL_<channelname>`, model save is `SM_MODEL_DIR` (`/opt/ml/model`). BYOC: input at `/opt/ml/input/data/<channelname>/`, run convention `train`.

> 💡 **Related Theory**: This layer is separation of concerns. Split training logic from execution environment; standard environment swap only code (script mode), special environment build it (BYOC). Exam emphasizing "minimum effort" → pick upper, "system dependencies/unsupported framework" → pick lower.

## Distributed Training Review

Splits by "what to divide":

- **Data parallel**: Divide data per GPU, train with model replicas, all-reduce average gradients. Solves = **speed (throughput)**. SMDDP. Warning: effective batch increases → adjust learning rate.
- **Model parallel**: Divide model itself across GPUs, shard. Solves = **OOM (model doesn't fit)**. SMP.
- **Infrastructure**: Inter-node comms = EFA, data supply = FSx for Lustre.

> ⚠️ **Pitfall**: Answer trying to solve OOM with data parallel (add GPUs) is wrong. Data parallel keeps full replicas on each GPU—if model doesn't fit, adding GPUs doesn't help, same OOM. OOM solved by model parallel/sharding. Conversely "slow" is data parallel.

## Debugging·Profiling Review

View training internals from two angles:

| Tool | Observes | Typical Symptom |
|---|---|---|
| Debugger | Model tensors (gradient·loss·weight) | Gradient vanishing/exploding, loss stalled, overfitting |
| Profiler | System resources (GPU/CPU, I/O) | GPU underutil, data loading·CPU bottleneck |
| CloudWatch | Overall metrics·logs·alarms | Operations monitoring |

Remember: Debugger rules fundamentally detect·report only; to auto-stop, attach **action(StopTraining)**. GPU underutil solved via data pipeline (increase workers, FSx cache, prefetch).

> 💡 **Related Theory**: Debugger watches mathematical process (model)'s internal state, Profiler watches physical resources' usage pattern that process runs on. Viewing both layers solves "why training fails" and "why expensive" together.

## Model Evaluation Review

Measure "generalization" via "problem-fitting metrics":

- **Classification**: Confusion matrix → precision (suppress false alarm), recall (prevent miss), F1, AUC. **Imbalanced = no accuracy**, F1·recall·AUC-PR.
- **Regression**: RMSE (large error sensitive), MAE (outlier insensitive), R².
- **Overfitting**: Diagnose by train-validation gap → regularization·dropout·augment·early stop.
- **Cross-validation**: k-fold reduces eval variance. Imbalanced = stratified, time-series = time-split.

> 📚 **Case**: Team boasted "98% accuracy" fraud model but actually caught almost no fraud (imbalance). Recall was 12%. Switched eval metrics to F1·recall, validated with stratified k-fold, adjusted threshold and class weights, lifted recall. Lesson: don't trust one number (accuracy)—judge by metrics for problem character.

## Comprehensive Decision Flow

Whole week as one decision tree:

```
When Training
 ├─ Code type?        Standard framework → script mode
 │                    +Python package → requirements
 │                    +System package → BYOC
 ├─ Scale?            Slow → data parallel / OOM → model parallel
 └─ Problems?         Model anomaly → Debugger / resource waste → Profiler

When Evaluating
 ├─ Classification?  Imbalanced → F1·recall·AUC / Balanced → accuracy OK
 ├─ Regression?      Large error matters → RMSE / Outlier insensitive → MAE
 ├─ Generalization? Train-val gap big → overfitting → regularize·augment·early-stop
 └─ Limited data?    k-fold cross-validation (imbalanced=stratified, time-series=time-split)
```

## Summary

Week 5 was model development's second half. **Custom training** splits by code extent (script mode → BYOC), **distributed** by what divides (data parallel=speed, model parallel=OOM), **observation** by what seen (Debugger=model, Profiler=resource), **evaluation** by problem (imbalance→F1·recall, outlier→RMSE/MAE, overfitting→gap diagnosis). Exams repeatedly ask boundary judgments: "minimum effort", "OOM vs slow", "detection≠auto-stop", "accuracy trap". Mapping these four forks to keywords instantly means model development area is well covered.

Next week covers deploying trained models to production—inference.

---

## 📝 연습 문제

**문제 1.** PyTorch 학습 코드를 SageMaker에서 최소 노력으로 돌리려는데 추가로 transformers 파이썬 패키지만 필요하다. 시스템 패키지는 없다. 가장 적합한 방식은?

A) BYOC로 Docker 이미지를 직접 빌드  
B) 스크립트 모드 + source_dir의 requirements.txt에 transformers 추가  
C) 내장 알고리즘으로 전환  
D) 모델 병렬을 활성화  

**정답: B**  
해설: 표준 프레임워크에 파이썬 패키지만 추가하면 되므로 스크립트 모드에 requirements.txt로 충분하며 Docker가 필요 없다. A는 시스템 의존성이 없는데 과한 작업이고, C는 자체 코드를 못 쓰며, D는 분산 전략으로 패키지 추가와 무관하다.

---

**문제 2.** 수십억 파라미터 모델이 단일 GPU 메모리에 들어가지 않아 OOM이 난다. 데이터 병렬로 노드를 늘려도 같은 OOM이 반복된다. 올바른 해결책은?

A) 데이터 병렬 GPU 수를 더 늘린다  
B) SageMaker 모델 병렬(SMP)로 모델을 GPU 간에 분할·샤딩한다  
C) 배치 크기를 키운다  
D) Profiler를 활성화하면 OOM이 사라진다  

**정답: B**  
해설: OOM은 모델 복제본이 한 GPU에 안 들어가는 문제이므로 모델 병렬/샤딩으로 모델을 GPU 간에 나눠야 하며, 데이터 병렬은 전체 복제본을 각 GPU에 두므로 해결되지 않는다. A는 같은 OOM 반복, C는 메모리를 더 쓰고, D는 진단 도구일 뿐 메모리를 늘려주지 않는다.

---

**문제 3.** Debugger의 loss_not_decreasing 규칙이 손실 정체를 감지했지만 학습이 끝까지 돌며 비용만 발생했다. 자동 중단으로 비용을 막으려면?

A) 규칙만 더 추가한다  
B) 규칙에 StopTraining action을 연결한다  
C) Profiler로 전환한다  
D) instance_type을 더 큰 것으로 바꾼다  

**정답: B**  
해설: Debugger 규칙은 기본적으로 감지·보고만 하므로 자동 중단하려면 StopTraining 등의 action을 명시적으로 연결해야 한다. A는 규칙을 늘려도 여전히 보고만 하고, C는 자원 분석 도구라 학습 중단과 무관하며, D는 비용을 오히려 늘린다.

---

**문제 4.** 거래의 0.5%만 사기인 불균형 데이터에서 모델이 "정확도 99.5%"로 보고됐다. 평가에 대한 올바른 판단은?

A) 정확도 99.5%이므로 우수한 모델이다  
B) 불균형 때문에 정확도가 왜곡될 수 있으므로 F1·재현율·AUC-PR로 다시 평가한다  
C) 회귀 지표 RMSE로 평가한다  
D) 교차검증은 불필요하다  

**정답: B**  
해설: 0.5% 양성 불균형에서는 "전부 정상" 예측만으로도 99.5% 정확도가 나오므로 정확도는 신뢰할 수 없고 F1·재현율·AUC-PR로 희귀 양성 탐지력을 봐야 한다. A는 정확도 함정에 빠진 것이고, C는 분류에 회귀 지표를 쓴 오류이며, D는 안정적 평가를 포기하는 잘못된 판단이다.

---

**문제 5.** ml.p4d 인스턴스로 학습하는데 학습이 예상보다 느리고 GPU 활용률이 낮다. 원인 진단과 1차 개선 방향으로 가장 적절한 것은?

A) Debugger의 vanishing_gradient 규칙으로 그래디언트를 본다  
B) Profiler로 병목을 진단하고, 데이터 로딩 병목이면 DataLoader worker 증가·FSx 캐시·프리페치로 개선한다  
C) 모델 병렬을 무조건 활성화한다  
D) 학습률을 10배 올린다  

**정답: B**  
해설: GPU 저활용·느린 학습은 자원 효율 문제이므로 Profiler로 병목을 찾고, 데이터 로딩 병목이면 데이터 공급 파이프라인을 개선해 GPU 활용률을 높인다. A는 모델 텐서를 보는 도구로 활용률과 무관하고, C는 OOM이 아닌데 과한 조치이며, D는 수렴 동작만 바꿔 활용률 개선과 무관하다.

---
