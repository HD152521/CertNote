# Day 5 - D-Day Wrap-Up: Exam Structure, Time Allocation, Requirement Translation Tables, Trap Roundup

This is the final day of the 12-week journey. Today we add no new knowledge. Instead, we build **an operating manual you can use as-is inside the exam room**. Exam structure and time allocation, what order to answer in, a "requirement sentence → technique/service" translation table, and the traps people most often stumble over — all gathered in one place. It is compressed enough that skimming this single document right before the exam is sufficient.

## Exam Structure at a Glance

| Item | Details |
|------|------|
| Exam name | AWS Certified Machine Learning – Specialty (MLS-C01) |
| Number of questions | 65 questions (50 scored + 15 unscored, not identified) |
| Time | 180 minutes |
| Passing score | 750 / 1000 (scaled score) |
| Question types | Multiple choice (pick 1) + multiple response (pick 2-3) |
| Pass determination | Based on the overall scaled score (no per-domain minimum) |

| Domain | Weight |
|------|------|
| 1. Data Engineering | 20% |
| 2. Exploratory Data Analysis | 24% |
| 3. Modeling | 36% |
| 4. Machine Learning Implementation and Operations | 20% |

> 💡 **Related theory**: You pass with an overall scaled score of 750 or higher — there is no per-domain minimum you can fail on. The 15 unscored questions are not marked, so treat every question with the same care. A scaled score is not a raw percentage correct; it is adjusted for question difficulty, so there is no fixed "get exactly N right and you pass." That means abandoning a specific domain is worse than raising your accuracy in Domain 3 (36%), the most heavily weighted one, which lifts your expected score the most.

## Time Allocation Strategy

| Phase | Recommendation |
|------|------|
| Pass 1 (all questions) | 65 questions × about 2 minutes = 130 minutes, start with the ones you're sure about |
| Flagging | If you're unsure, answer immediately and flag it — don't cling to it |
| Pass 2 (flagged) | Re-review with the time left (about 40 minutes) |
| Final review | Last 10 minutes, check for unanswered questions |

> 💡 **Related theory**: 180 minutes for 65 questions works out to about 2.8 minutes each, but the key is finishing easy questions in around a minute so you can pour the surplus into hard scenarios. The moment you spend more than 4 minutes on a single question, expected loss grows. "If you're at least 70% confident, answer, flag it, and move on without regret" is the rule that protects your pace. A blank is worth zero, so if you run short on time, always fill in a best guess.

## Requirement → Technique/Service Translation Table (Domains 1 and 2)

| Clue in the requirement sentence | Answer direction |
|------|------|
| "millisecond latency, multiple consumers, reprocessing" | Kinesis Data Streams |
| "load into S3 with minimal operational overhead" | Kinesis Data Firehose |
| "real-time SQL aggregation over a stream" | Kinesis Data Analytics |
| "query S3 with SQL, serverless" | Athena |
| "large-scale structured analytics warehouse" | Redshift |
| "serverless ETL + schema catalog" | Glue |
| "fine-grained control of a Hadoop/Spark cluster" | EMR |
| "categorical encoding with no inherent order" | One-Hot |
| "distance/gradient-based model, differing scales" | Standardization/normalization |
| "tree model (XGBoost) but scaling is mandatory" | Trap (not needed) |
| "correlation 0.9+, multicollinearity" | Drop features or PCA |
| "minority class underrepresented" | SMOTE / oversampling / class weights |

## Requirement → Technique/Service Translation Table (Domains 3 and 4)

| Clue in the requirement sentence | Answer direction |
|------|------|
| "structured tabular classification/regression" | XGBoost |
| "image classification/detection" | CNN (Image Classification/Object Detection) |
| "time-series demand forecasting" | DeepAR |
| "text classification/embeddings" | BlazingText |
| "anomaly detection" | Random Cut Forest |
| "multi-class output activation" | Softmax (binary = Sigmoid) |
| "only validation is low" | Overfitting → regularization, augmentation, early stopping |
| "efficient tuning on a small budget" | Bayesian (AMT) |
| "large-scale offline scoring, no endpoint needed" | Batch Transform |
| "intermittent traffic, cold start acceptable" | Serverless Inference |
| "large payload, long processing, queuing" | Asynchronous Inference |
| "validate with real traffic without affecting users" | Shadow testing |
| "gradual performance decay / input distribution shift after deployment" | Model Monitor |
| "group fairness, SHAP explanations" | Clarify |
| "lower training cost, interruptions acceptable" | Managed Spot Training |
| "workflow automation, reproducibility, CI/CD" | Pipelines + Model Registry |

> 💡 **Related theory**: Three meta-principles run through this translation table. (1) "Who carries the operational burden" splits serverless/managed (Firehose, Glue, Athena, Serverless) from hands-on control (Streams, EMR, Real-time). (2) "The shape of the data" determines the algorithm (tables = XGBoost, images = CNN, sequences = DeepAR/RNN, text = BlazingText). (3) "A metric is a translation of business cost," so whether FP or FN is more expensive decides precision vs. recall vs. F1. Even a question you don't know narrows down once you reduce it to these three axes.

## Collected Traps You Get Wrong Most Often

| Trap | Correct judgment |
|------|------|
| Accuracy on imbalanced data | Use F1 / PR-AUC (accuracy is off the table) |
| Standardization "required" for trees/XGBoost | Trees are scale-invariant, so it is effectively unnecessary |
| Sigmoid for multi-class output | Softmax is correct |
| Softmax for regression output | Linear (no activation) is correct |
| Confusing Streams with Firehose | Custom/low-latency = Streams, fully managed = Firehose |
| Confusing Canary with Shadow | Gradual shift = Canary, risk-free mirrored validation = Shadow |
| Model Monitor vs. CloudWatch | Drift = Monitor, infrastructure metrics = CloudWatch |
| Debugger vs. Clarify | Training process = Debugger, bias/explainability = Clarify |
| Real-time for large offline jobs | Batch Transform wins on cost |
| RMSE for classification, F1 for regression | Regression = RMSE/MAE/R², classification = precision/recall/F1/AUC |
| Direction of the AMT objective metric | Error = Minimize, performance = Maximize |
| Data leakage (preprocessing the whole set before the split) | fit on the training set, transform only on validation/test |

> 💡 **Related theory**: Half of the traps are "reversed direction" and half are "domain confusion." Direction traps (Sigmoid↔Softmax, Maximize↔Minimize, Streams↔Firehose) get filtered instantly if you memorize them as pairs. Data leakage is especially subtle: if you fit a scaler or encoder on training and validation combined, validation information leaks and your evaluation becomes optimistically biased. Always fit on the training set only and apply transform alone to validation and test — that single line shows up disguised as a plausible answer choice again and again.

## D-Day Checklist

- Two forms of ID; confirm the exam time and location (or your online proctoring setup) in advance.
- Restroom and water before you start; get your condition ready for 180 minutes of focus.
- Pass 1: start with what you're sure about; if unsure, answer immediately and flag.
- On multiple-response questions, read the "choose N" instruction exactly.
- No blanks — mark a best guess even when time is short.
- Use the last 10 minutes to recheck for unanswered questions and flagged items.

## Wrapping Up

Over 12 weeks you have worked through all four domains: data engineering, EDA, modeling, and implementation and operations. In the end, the exam measures — across 65 questions — your ability to "read a real-world requirement and translate it into the most appropriate technique or service." Use accuracy in Domain 3 (36%), the heaviest domain, as your lever; narrow down unfamiliar questions with the translation table's three axes (operational burden, data shape, business cost); and filter out direction and domain-confusion traps by memorizing them in pairs. Protect your pace, leave nothing blank, and spend the last 10 minutes reviewing. You have prepared enough — good luck on the exam.

---

## 📝 연습 문제

**문제 1.** MLS-C01 시험 구성에 대한 설명으로 옳은 것은?

A) 65문항 중 15문항은 채점되지 않으며 어느 것인지 표시되지 않는다  
B) 65문항을 90분 안에 풀어야 한다  
C) 도메인별 과락 기준이 있어 각 도메인에서 일정 점수를 넘어야 한다  
D) 합격 점수는 1000점 만점에 600점이다  

**정답: A**  
해설: 65문항 중 15문항은 비채점이며 표시되지 않으므로 모든 문항을 성실히 풀어야 한다. 시간은 180분(B 오답), 도메인별 과락은 없고 전체 스케일 점수로 판정하며(C 오답), 합격선은 750점이다(D 오답).

---

**문제 2.** 시험 시간 배분 전략으로 가장 권장되는 것은?

A) 어려운 문항 하나에 10분 이상 써서 반드시 맞힌다  
B) 확실한 문항을 빠르게 처리하고, 헷갈리면 즉답 후 플래그해 2패스에서 재검토한다  
C) 모르는 문항은 빈칸으로 두고 넘어간다  
D) 모든 문항에 정확히 같은 시간을 강제 배분한다  

**정답: B**  
해설: 쉬운 문항을 빠르게 끝내 어려운 시나리오에 시간을 몰아주고, 헷갈리면 즉답+플래그로 페이스를 지키는 것이 정석이다. 한 문항에 10분(A)은 기대 손실이 크고, 빈칸(C)은 0점이라 반드시 추정 답을 채워야 하며, 시간 균등 강제(D)는 비효율적이다.

---

**문제 3.** 다음 중 "요구사항 → 서비스" 번역이 잘못된 것은?

A) "운영을 최소화하며 스트림을 S3로 적재" → Kinesis Data Firehose  
B) "배포 후 입력 분포 변화 자동 감지" → Model Monitor  
C) "사용자에게 영향 없이 프로덕션 트래픽으로 신모델 검증" → Canary 배포  
D) "집단 공정성 측정과 SHAP 설명" → SageMaker Clarify  

**정답: C**  
해설: 사용자 영향 없이 트래픽을 복제해 검증하는 것은 Shadow 테스트이며, Canary는 실제 사용자에게 일부 신모델 응답이 가는 점진 전환이다. A·B·D는 모두 올바른 번역이다.

---

**문제 4.** 다음 중 시험에서 자주 등장하는 함정에 대한 올바른 판단은?

A) 클래스가 95:5로 불균형해도 정확도(Accuracy)만으로 충분히 평가할 수 있다  
B) XGBoost 학습 전에는 모든 수치 피처의 표준화가 반드시 필요하다  
C) 다중 클래스 분류의 출력 활성화 함수로 Sigmoid를 써야 한다  
D) 전처리 스케일러는 학습셋으로만 fit하고 검증·테스트에는 transform만 적용한다  

**정답: D**  
해설: 데이터 누수를 막으려면 스케일러·인코더를 학습셋으로만 fit하고 검증/테스트에는 transform만 적용해야 한다. 불균형에 정확도 단독(A)은 부적절하고, 트리 기반 XGBoost는 스케일 불변이라 표준화가 사실상 불필요하며(B), 다중 클래스 출력은 Softmax가 맞다(C).

---

**문제 5.** 점수 기대값을 가장 효과적으로 높이는 학습 우선순위로 옳은 것은?

A) 비중이 가장 작은 도메인 1·4만 집중한다  
B) 모든 도메인을 버리고 한 도메인만 100% 만든다  
C) 비중이 가장 큰 도메인 3(모델링, 36%)의 정확도를 끌어올린다  
D) 비채점 문항을 찾아내 그 문항만 건너뛴다  

**정답: C**  
해설: 합격은 전체 스케일 점수로 판정되므로, 비중이 가장 큰 도메인 3(36%)의 정확도를 높이는 것이 기대 점수를 가장 크게 끌어올린다. 작은 도메인만 집중(A)·단일 도메인 올인(B)은 비효율적이고, 비채점 문항은 표시되지 않아 식별·건너뛰기(D)가 불가능하다.

---
