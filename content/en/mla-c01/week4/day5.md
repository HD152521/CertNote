# Day 5 - Week 4 Comprehensive Review: Model Development 1 — SageMaker Training

This week covered the entire training stage: "transforming data to models". From Training Job structure, through built-in algorithms that run inside them, automatic hyperparameter tuning via AMT, to not training from scratch but using pre-trained models via JumpStart·transfer learning and cost optimization. Today we weave these four pieces into one flow for quick review right before the exam.

## This Week at a Glance

```
[Data (S3/FSx)]
      │ Input Channel (File / Pipe / Fast File)
      ▼
[Training Job]  ← Estimator (container·role·instance·hyperparameters)
      │           ├─ Built-in Algorithms (XGBoost, Linear Learner, ...)
      │           ├─ Framework Estimator (entry_point=my script)
      │           └─ JumpStart (pre-trained model fine-tune)
      │ Instance: CPU (traditional ML) / GPU (deep learning) / Distributed (instance_count↑)
      │ Cost savings: Managed Spot + Checkpoints
      ▼
[Model Artifact (model.tar.gz, S3)]
      ▲
[AMT Tuning] ── Auto-run multiple Training Jobs (Bayesian / Early Stop / Warm Start)
```

This diagram contains all of this week. Data enters via input channels, trains in Training Job (defined by Estimator), model saves to S3, and AMT above runs multiple jobs to find optimal hyperparameters.

## Daily Essentials at a Glance

**Day 1 — Training Job**: Basic training unit. Spin up instances, train in container, save model to S3, auto-terminate instances. **Estimator** is the blueprint (for your script, use Framework Estimator's `entry_point`). Pass input channels to `fit()`, input modes are File (download all)·Pipe (stream)·Fast File. Multi-TB repeated reads → **FSx for Lustre**. Instances: traditional ML=CPU, deep learning=GPU, insufficient capacity→distributed. **Managed Spot Training**: up to 90% savings but can interrupt → **checkpoints** required, `max_wait >= max_run`.

**Day 2 — Built-in Algorithms**: Use AWS-optimized algorithms without code. Problem-type mapping is key: tabular classification/regression=**XGBoost**, large-scale linear/sparse=**Linear Learner**, anomaly=**RCF**, time series=**DeepAR**, sparse recommendation=**Factorization Machines**, fast text=**BlazingText**, image has 3 types: classification/detection/segmentation. Input formats: large streaming=**RecordIO-protobuf**, small=CSV, XGBoost CSV=**first column is label, no header**.

**Day 3 — AMT (Hyperparameter Tuning)**: Objective metric + ranges + strategy auto-run multiple jobs. Strategies: base **Bayesian** (smart from prior results, sequential), independent parallel=Random, exhaustive=Grid (categorical only), long deep learning early-stop=**Hyperband**. **Early stopping** (`early_stopping_type='Auto'`) stops hopeless jobs, **Warm Start** reuses prior tuning results (identical=IDENTICAL_DATA_AND_ALGORITHM, data changed=TRANSFER_LEARNING).

**Day 4 — JumpStart·Transfer Learning·Cost**: **JumpStart** is pre-trained model hub (deploy as-is or fit→deploy). **Transfer learning** achieves high performance with little data, cost, time → answer for "accurate classifier with scarce labels". Cost optimization splits into **lower unit cost** (Spot, right instances, input modes/RecordIO) and **reduce work volume** (transfer learning, early stopping). Spot + transfer learning combinable.

> 💡 **Related Theory**: This week's through-line is "compute only as much as needed, as efficiently as possible". Training uses expensive GPU time, so ① compute less initially (transfer learning), ② search smartly (Bayesian+early stopping), ③ use cheap resources (Spot), ④ auto-shut when done. ML knowledge and cloud cost-efficiency thinking converge at the training stage.

## Frequently Confused Distinctions

Exam-tricky boundaries organized:

| Situation | Answer | Confusing Wrong Choice |
|---|---|---|
| Large data repeated I/O bottleneck | FSx for Lustre | S3 File mode |
| Large streaming input format | RecordIO-protobuf | CSV |
| Cost cut + restart after interruption | Spot + checkpoint | Spot alone |
| Efficient hyperparameter search | Bayesian | Grid (exhaustive) |
| Long deep learning tuning early stop | Hyperband | Random |
| Reuse prior tuning results | Warm Start | New tuning |
| Classifier with scarce labels | Transfer learning | Train from scratch |
| Fast deploy verified model | JumpStart | Custom container |
| Train my PyTorch script | Framework Estimator | Built-in container |
| Tabular classification | XGBoost | BlazingText |

Concentrating on how "answer" keywords appear in problem statements (data size/form, interruption tolerable, budget, training time) solves most.

> ⚠️ **Pitfall**: Most common mistakes: seeing only "cost cut" and picking Spot while forgetting checkpoints, and thinking "tuning" = Grid Search. Spot pairs with checkpoints due to interruption risk; efficient tuning's foundation isn't Grid's exhaustive search but Bayesian. Also common: choosing built-in containers for custom scripts—custom code uses Framework Estimator's `entry_point`.

## Next Week Preview

This week was "building" models. Next week (Model Development 2) continues to **evaluate and analyze** created models. Learning curves and overfitting/underfitting diagnosis, evaluation metrics (accuracy, precision, recall, F1, AUC), and SageMaker Debugger and Experiments for inspecting and comparing training. Today's "how to train models" becomes next week's "was that model trained well" foundation.

## Summary

Week 4 compresses SageMaker training into four axes: ① **Training Job**: spin up instances, train, save to S3, auto-terminate; Estimator is blueprint; input channels and modes; Spot+checkpoints save cost. ② **Built-in Algorithms**: problem-type algorithm mapping, input formats (RecordIO vs CSV). ③ **AMT**: Bayesian default, early stop and warm start for efficiency and reuse. ④ **JumpStart·Transfer Learning·Cost**: pre-trained models achieve high performance with little data and cost; cost splits into unit-cost and work-volume axes. Reviewing the boundary table above once more before exam handles most multiple-choice in this week's scope reliably.

---

## 📝 연습 문제

**문제 1.** 다음 중 SageMaker Training Job과 빌트인 알고리즘에 대한 설명으로 옳은 것은?

A) Training Job은 학습이 끝나도 인스턴스를 계속 유지한다  
B) Training Job은 학습 후 model.tar.gz를 S3에 저장하고 인스턴스를 자동 종료하며, 내 스크립트는 프레임워크 Estimator의 entry_point로 학습한다  
C) 빌트인 알고리즘은 항상 커스텀 컨테이너를 직접 빌드해야 한다  
D) XGBoost는 이미지 분할 전용 알고리즘이다  

**정답: B**  
해설: Training Job은 학습 완료 후 모델을 S3에 저장하고 인스턴스를 자동으로 내리며, 사용자 스크립트는 프레임워크 Estimator의 entry_point로 실행한다. A는 인스턴스를 유지한다는 점에서 틀리고, C는 빌트인이 미리 만들어진 컨테이너라는 사실과 반대이며, D는 XGBoost가 정형 데이터 분류/회귀용이라는 점과 어긋난다.

---

**문제 2.** 학습 비용을 줄이려는 여러 시나리오에서 가장 적절하게 짝지어진 것은?

A) 중단 후 재개 필요 → Spot만 켜기  
B) 라벨 데이터가 적은 분류기 → 처음부터 학습  
C) 중단 후 재개 필요 → Spot + 체크포인트, 라벨 적은 분류기 → 전이학습  
D) 효율적 하이퍼파라미터 탐색 → Grid Search  

**정답: C**  
해설: Spot은 중단 가능성 때문에 체크포인트와 함께 써야 재개가 보장되고, 라벨 데이터가 적을 때는 전이학습이 적합하다. A는 체크포인트 누락으로 진행분이 날아갈 수 있고, B는 데이터 부족으로 과적합되기 쉬우며, D는 효율적 탐색의 기본이 전수 조사가 아닌 베이지안이라는 점과 어긋난다.

---

**문제 3.** 수 TB 데이터를 여러 epoch 반복해 읽는 분산 학습에서 I/O가 병목이고, 입력 데이터는 대용량 스트리밍으로 효율적으로 넣고 싶다. 가장 적절한 조합은?

A) FSx for Lustre + RecordIO-protobuf  
B) S3 File 모드 + CSV  
C) 로컬 디스크 + JSON  
D) DynamoDB + XML  

**정답: A**  
해설: FSx for Lustre는 대용량 데이터의 반복 읽기 I/O 병목을 해소하고, RecordIO-protobuf는 대용량 스트리밍 입력에 가장 효율적인 포맷이다. B는 매 시작 전체 다운로드와 텍스트 파싱으로 비효율적이고, C는 대규모 분산 학습 규모에 맞지 않으며, D는 학습 데이터 소스/포맷으로 부적합하다.

---

**문제 4.** AMT(하이퍼파라미터 튜닝)에 대한 설명으로 옳은 것은?

A) Bayesian은 이전 시도 결과를 활용해 다음 시도를 선택하며, 조기 종료로 가망 없는 학습을 중단해 비용을 줄일 수 있다  
B) Grid Search가 가장 적은 횟수로 최적값을 찾는 전략이다  
C) 워밍 스타트는 항상 데이터가 동일할 때만 사용 가능하다  
D) max_parallel_jobs를 높이면 Bayesian의 순차 학습 이점이 커진다  

**정답: A**  
해설: Bayesian은 이전 결과로 다음 시도를 똑똑하게 고르고, early stopping은 진행 중 가망 없는 학습을 끊어 비용을 절감한다. B는 Grid가 전수 조사라 비효율적이고, C는 데이터가 변경돼도 TRANSFER_LEARNING 타입으로 워밍 스타트가 가능하며, D는 병렬을 높이면 순차 의존 이점이 오히려 줄어든다는 점과 반대다.

---

**문제 5.** 검증된 사전학습 텍스트 모델을 내 도메인 데이터로 미세조정해 빠르고 저렴하게 배포하려 한다. 가장 적합한 접근은?

A) 빌트인 K-Means를 처음부터 학습한다  
B) JumpStart 사전학습 모델을 fit으로 미세조정한 뒤 deploy한다  
C) Feature Store에 모델을 적재해 배포한다  
D) AMT로 하이퍼파라미터만 튜닝한다  

**정답: B**  
해설: JumpStart는 사전학습 모델을 제공하며 fit으로 내 데이터에 미세조정(전이학습)한 뒤 deploy로 배포할 수 있어 빠르고 저렴하다. A는 무관한 군집화의 밑바닥 학습이고, C는 특성 저장소로 모델 배포 수단이 아니며, D는 사전학습 모델 활용 없이 튜닝만 하는 것이라 요구를 충족하지 못한다.

---
