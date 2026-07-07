# Day 1 - The ML Lifecycle and the Role of the ML Engineer

A data scientist proudly shows off a model with 0.94 accuracy built in a notebook. Yet it usually takes months before that model receives real user traffic, and even after it reaches production, half of such models quietly break down. The person who bridges this gap is the ML engineer. MLA-C01 (AWS Certified Machine Learning Engineer – Associate) is precisely the certification that asks how you handle this "notebook to production" journey on AWS.

Today we draw the full picture of the ML lifecycle, look at how the ML engineer's role splits from that of the data scientist and the DevOps engineer within it, and map the four exam domains to the stages of this lifecycle.

## The ML Lifecycle: From Notebook to Production

With traditional software, "you write the code, and the behavior is determined." ML is different. **The behavior is learned from data.** That is why the lifecycle gains two additional axes: "data" and "retraining." The big picture consists of the following five stages.

```
1. Data                 : Collection → Cleaning → Labeling → Feature engineering
2. Train                : Algorithm selection → Training → Hyperparameter tuning
3. Evaluate             : Offline metrics → Business metrics → Bias checks
4. Deploy               : Endpoint/Batch → A/B → Canary
5. Monitor              : Data drift → Performance degradation → Retraining trigger
```

The key point is that this is **not linear but a loop**. When drift is detected in stage 5 (monitoring), you go back to stage 1. MLOps emerged as a discipline when "data" and "models" were added on top of the CI/CD that software engineers already know.

> 💡 **Related theory**: This is the core argument of Google's 2015 paper "Hidden Technical Debt in Machine Learning Systems." In real ML systems, ML code (model training) accounts for less than 5% of the entire codebase; the remaining 95% is data collection, validation, serving, monitoring, and infrastructure. This is why MLA-C01 emphasizes data pipelines, deployment, and operations rather than memorizing SageMaker algorithms.

## ML Engineer vs. Data Scientist vs. DevOps

The three roles overlap but have different centers of gravity. Because the exam asks questions from the "ML engineer's perspective," it is important to draw these boundaries clearly.

| Role | Center of gravity | Typical deliverables |
|------|---------|------------|
| Data scientist | Model performance, experimentation | Notebooks, papers, hypothesis validation |
| ML engineer | Reproducibility, scalability, operationalization | Training pipelines, inference endpoints, monitoring |
| DevOps/Platform | Infrastructure, CI/CD | IaC, clusters, networking |

If the data scientist proves "this model is good," the ML engineer makes sure "this model gets retrained automatically every week, receives traffic safely, and triggers an alarm when it breaks." Even for the same model, the ML engineer bakes the training into reproducible code, pins the data version, and accounts for inference cost.

```python
# Data scientist style: improvised in a notebook
model.fit(X_train, y_train)        # No record of which data was used
preds = model.predict(X_test)      # Not reproducible

# ML engineer style: a reproducible pipeline
import sagemaker
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=training_image,
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    hyperparameters={"num_round": 100, "max_depth": 5},
    output_path="s3://my-bucket/models/",   # Artifact location pinned
)
estimator.fit({"train": "s3://my-bucket/data/v3/train/"})  # Data version pinned
```

The difference between these two code snippets is the essence of ML engineering. The input data version (`v3`), hyperparameters, and instance type are explicit in the code, so anyone can reproduce the same model six months later.

> 💡 **Related theory**: Reproducibility is the number-one principle of ML engineering. To reproduce a machine learning experiment, code versioning alone is not enough — you must pin ① code, ② data version, ③ hyperparameters, and ④ environment (library versions, random seeds). This is why SageMaker provides features like Experiments, Model Registry, and lineage tracking.

## Offline Metrics and Business Metrics Are Not the Same

Here is a trap ML engineers frequently run into. A model that improved in offline evaluation can actually hurt real business metrics. For example, a recommendation model's accuracy goes up while user dwell time goes down.

That is why **A/B testing** is essential at the deployment stage. SageMaker lets you place multiple model variants behind a single endpoint and split traffic between them.

```python
from sagemaker.session import production_variant

variant_a = production_variant(
    model_name="model-v1", instance_type="ml.m5.large",
    initial_instance_count=1, variant_name="A", initial_weight=90,
)
variant_b = production_variant(
    model_name="model-v2", instance_type="ml.m5.large",
    initial_instance_count=1, variant_name="B", initial_weight=10,  # Only 10% to the new model
)
```

You send only 10% of traffic to the new model, observe the real business metrics, and gradually increase the weight if it is safe. This is the ML version of a canary deployment.

> 🔍 **Going deeper**: Offline metrics (accuracy, AUC) measure model performance on historical data, while online metrics (click-through rate, conversion rate, revenue) are the outcome of real user behavior. The two typical causes of divergence are ① distribution shift between training data and production data, and ② feedback loops where the model's output changes user behavior and thereby changes the data distribution itself. The ML engineer uses offline metrics as a gate and online metrics as the final verdict.

## Monitoring: A Model Starts Aging the Moment It Ships

Software stays the same after deployment, but a model quietly becomes wrong as the world changes. The classic example is a demand forecasting model trained on pre-COVID data becoming useless in 2020. This is called **model drift**, and it comes in two kinds.

- **Data drift**: The distribution of input features changes (e.g., the user age demographics shift)
- **Concept drift**: The input-output relationship itself changes (e.g., the same behavior takes on a different meaning)

AWS uses **SageMaker Model Monitor** to capture the inputs/outputs of a production endpoint, compare them against the training-time baseline, and raise a CloudWatch alarm when drift crosses a threshold. The alarm can trigger a retraining pipeline (EventBridge → Pipelines).

> 📚 **Case study**: In early 2020, at the onset of COVID, many companies' demand forecasting, recommendation, and fraud detection models collapsed simultaneously. As human behavior patterns changed abruptly, the distribution of production data diverged completely from the training data — a textbook case of data drift. After this event, the industry-wide realization took hold that "deployment is not the end of a model; monitoring and retraining are the real substance."

## The Four Domains of MLA-C01

The exam splits this lifecycle into four domains. Mapping each domain to its lifecycle stage gives you a clear study direction.

| Domain | Weight | Lifecycle stage | Key keywords |
|--------|------|-------------|------------|
| 1. Data Preparation (Data Prep) | 28% | Data | S3, Glue, Feature Store, data labeling |
| 2. Model Development (Model Dev) | 26% | Train & Evaluate | Built-in algorithms, tuning, evaluation metrics, bias |
| 3. Deployment & Orchestration (Deploy) | 22% | Deploy | Endpoints, batch, Pipelines, CI/CD |
| 4. Monitoring, Maintenance & Security (Monitor) | 24% | Monitor | Model Monitor, CloudWatch, IAM, KMS |

If SAA asks "how do you design it" and DVA asks "how do you deploy it as code," MLA asks "**how do you prepare, train, deploy, and operate ML workloads on AWS**." It is important that Data Preparation and Monitoring together account for half of the exam (52%). What separates pass from fail is data pipelines and operations, not memorizing model algorithms.

## Wrapping Up

We drew two pictures today. First, the ML lifecycle is a circular loop of **data → train → evaluate → deploy → monitor**, and the ML code itself is only 5% of the whole. Second, the ML engineer's role is to turn the data scientist's experiments into systems that are **reproducible, scalable, and operable**.

In the next article we enter the "training" stage of this lifecycle and look at whether the problem you are trying to solve is supervised, unsupervised, or reinforcement learning; how to distinguish classification, regression, and clustering; and which metrics to evaluate them with.

---

## 📝 연습 문제

**문제 1.** What is the key point emphasized by Google's "Hidden Technical Debt in ML Systems" paper, which is also reflected in the structure of the MLA-C01 exam?

A) In an ML system, model training code accounts for more than 80% of the total  
B) In an ML system, model training code is less than 5%, and data, serving, monitoring, and infrastructure make up most of it  
C) ML systems are easier to maintain than regular software  
D) Once deployed, an ML model never needs retraining  

**정답: B**  
해설: The paper pointed out that in real ML systems, model training code is less than 5%, and the remaining 95% is data collection, validation, serving, monitoring, and infrastructure. This is why MLA-C01 allocates more than half of the exam to Data Preparation (28%) and Monitoring (24%). Saying the training code accounts for 80% is the exact opposite; ML is harder to maintain due to data dependencies; and models require retraining because of drift.

---

**문제 2.** When an ML engineer productionizes a 0.94-accuracy model that a data scientist built in a notebook, what must be secured first?

A) Higher accuracy  
B) Reproducibility of training — pinning the data version, hyperparameters, and environment in code  
C) A larger instance type  
D) Making the model more complex  

**정답: B**  
해설: The number-one principle of ML engineering is reproducibility. Code alone cannot reproduce a model — you must also pin the data version, hyperparameters, and environment (libraries, seeds). Pushing accuracy higher is the data scientist's domain, and instance size or model complexity are operational/performance concerns to consider after reproducibility is secured.

---

**문제 3.** After deploying a recommendation model whose accuracy improved in offline evaluation, user dwell time actually decreased. What is the most appropriate way for an ML engineer to detect this in advance?

A) Just push offline accuracy even higher  
B) Run an A/B test that sends only a small portion of traffic to the new model and observe real business metrics  
C) Deploy the model to all traffic immediately  
D) Reduce the training data  

**정답: B**  
해설: Offline metrics (accuracy) and online business metrics (dwell time) can diverge, so you must run an A/B test that routes only part of the traffic to the new model and check the real behavioral metrics. Only raising offline accuracy repeats the same trap, full deployment amplifies the risk, and shrinking the training data is unrelated to the problem.

---

**문제 4.** Which term most accurately describes the phenomenon in which many demand forecasting models collapsed in the early days of COVID?

A) Overfitting  
B) Data drift — the distribution of production data diverged significantly from the training data  
C) Underfitting  
D) Data leakage  

**정답: B**  
해설: This is a textbook case of data drift, where the input distribution at serving time diverged from the data distribution at training time. Overfitting/underfitting are model complexity issues at the training stage, and data leakage is a separate problem where future information leaks into training. Drift is handled by detecting changes in the input distribution relative to a baseline with SageMaker Model Monitor.

---

**문제 5.** Which two of the four MLA-C01 domains together account for the largest share (more than half) of the exam?

A) Model Development and Deployment  
B) Data Preparation and Monitoring, Maintenance & Security  
C) Deployment and Monitoring  
D) Data Preparation and Model Development  

**정답: B**  
해설: Data Preparation (28%) plus Monitoring, Maintenance & Security (24%) totals 52%, more than half. This is consistent with the fact that data pipelines and operations — rather than the ML code itself — are the real substance of production ML systems. All the other combinations omit one of these two domains, so their combined weight is smaller.

---
