# Day 1 - ML Lifecycle and the Role of ML Engineers

A data scientist builds a 0.94 accuracy model in a notebook and brags about it. Yet it usually takes months for that model to receive actual user traffic, and after it goes into production, half the time it silently fails. The person who bridges this gap is the ML engineer. MLA-C01 (AWS Certified Machine Learning Engineer – Associate) is exactly about this: "from notebook to production" on AWS.

Today, we'll sketch the complete ML lifecycle picture, see how ML engineers' roles differ from data scientists and DevOps engineers, and map the 4 domains tested in the exam to each stage of this lifecycle.

## ML Lifecycle: From Notebook to Production

Traditional software works like "write code → behavior is determined." ML is different. **Behavior is learned from data.** That's why the lifecycle adds two new axes: "data" and "retraining." The big picture has 5 stages:

```
1. Data (Data)            : Collection → Cleaning → Labeling → Feature Engineering
2. Training (Train)       : Algorithm Selection → Training → Hyperparameter Tuning
3. Evaluation (Evaluate)  : Offline Metrics → Business Metrics → Bias Checking
4. Deployment (Deploy)    : Endpoints/Batch → A/B → Canary
5. Monitoring (Monitor)   : Data Drift → Performance Degradation → Retraining Trigger
```

The key point is that this is **not linear but circular (loop)**. If drift is detected in step 5 (monitoring), you loop back to step 1. When "data" and "model" are added to the CI/CD pipeline that software engineers are familiar with, you get MLOps.

> 💡 **Related Theory**: This is the core thesis of Google's 2015 paper "Hidden Technical Debt in Machine Learning Systems." In real ML systems, ML code (model training) accounts for less than 5% of the entire codebase, while the remaining 95% is data collection, validation, serving, monitoring, and infrastructure. This is why MLA-C01 emphasizes data pipelines, deployment, and operations over SageMaker algorithm memorization.

## ML Engineer vs Data Scientist vs DevOps

The three roles overlap but have different centers of gravity. Since the exam tests the "ML engineer perspective," it's important to draw these boundaries clearly.

| Role | Center of Gravity | Representative Output |
|------|---------|------------|
| Data Scientist | Model Performance, Experimentation | Notebooks, Papers, Hypothesis Validation |
| ML Engineer | Reproducibility, Scalability, Operationalization | Training Pipelines, Inference Endpoints, Monitoring |
| DevOps/Platform | Infrastructure, CI/CD | IaC, Clusters, Networking |

If a data scientist proves "this model is good," an ML engineer makes sure "this model retrains automatically every week, safely handles traffic, and alerts when it breaks." Even with the same model, ML engineers write training reproducibly in code, fix data versions, and calculate inference costs.

```python
# Data Scientist Style: Ad-hoc in notebook
model.fit(X_train, y_train)        # No record of what data was used
preds = model.predict(X_test)      # Not reproducible

# ML Engineer Style: Reproducible pipeline
import sagemaker
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=training_image,
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    hyperparameters={"num_round": 100, "max_depth": 5},
    output_path="s3://my-bucket/models/",   # Fixed output location
)
estimator.fit({"train": "s3://my-bucket/data/v3/train/"})  # Fixed data version
```

The difference between these two code examples is the essence of ML engineering. The input data version (`v3`), hyperparameters, and instance type are explicit in the code, so anyone can reproduce the exact model 6 months later.

> 💡 **Related Theory**: Reproducibility is the #1 principle in ML engineering. To reproduce ML experiments, code version alone isn't enough — you need ① code, ② data version, ③ hyperparameters, and ④ environment (library versions, random seed) all fixed. This is why SageMaker provides features like Experiments, Model Registry, and lineage tracking.

## Offline Metrics and Business Metrics Are Different

A common pitfall ML engineers hit: a model that improves in offline evaluation can actually hurt real business metrics. A recommendation model's accuracy improves, but user engagement drops.

That's why **A/B testing** is essential in the deployment phase. SageMaker lets you place multiple model variants on a single endpoint and distribute traffic across them.

```python
from sagemaker.session import production_variant

variant_a = production_variant(
    model_name="model-v1", instance_type="ml.m5.large",
    initial_instance_count=1, variant_name="A", initial_weight=90,
)
variant_b = production_variant(
    model_name="model-v2", instance_type="ml.m5.large",
    initial_instance_count=1, variant_name="B", initial_weight=10,  # Only 10% to new model
)
```

Send only 10% of traffic to the new model, observe actual business metrics, and if safe, gradually increase the weight. This is the ML version of canary deployment.

> 🔍 **Deeper Dive**: Offline metrics (accuracy, AUC) measure model performance on historical data, while online metrics (click-through rate, conversion rate, revenue) measure actual user behavior outcomes. They diverge for two main reasons: ① distribution shift between training and production data, and ② feedback loops where model outputs change user behavior and thus the data distribution itself. ML engineers use offline metrics as a gate and online metrics as the final verdict.

## Monitoring: Models Start Aging the Moment They Ship

Software stays the same after deployment, but models silently break when the world changes. A demand forecasting model trained on pre-COVID data became useless in 2020 — a classic example. This is called **model drift** and comes in two types:

- **Data Drift**: The distribution of input features changes (e.g., user age demographics shift)
- **Concept Drift**: The input-output relationship itself changes (e.g., the same behavior has different meaning)

AWS uses **SageMaker Model Monitor** to capture inputs/outputs from running endpoints, compare them to a baseline from training time, and trigger CloudWatch alarms when drift exceeds thresholds. Alarms can trigger a retraining pipeline (EventBridge → Pipelines).

> 📚 **Case Study**: In early 2020, many companies' demand forecasting, recommendation, and fraud detection models collapsed simultaneously. Human behavior patterns shifted dramatically, causing the distribution of training data to diverge completely from production data — a textbook example of data drift. After this event, the industry-wide understanding shifted to "model deployment isn't the end; monitoring and retraining are the core."

## The 4 Domains of MLA-C01

The exam breaks this lifecycle into 4 domains and tests each. Mapping which lifecycle stage each domain corresponds to helps guide study.

| Domain | Weight | Lifecycle Stage | Key Keywords |
|--------|------|-------------|------------|
| 1. Data Preparation (Data Prep) | 28% | Data | S3, Glue, Feature Store, Data Labeling |
| 2. Model Development (Model Dev) | 26% | Training, Evaluation | Built-in Algorithms, Tuning, Evaluation Metrics, Bias |
| 3. Deployment & Orchestration (Deploy) | 22% | Deployment | Endpoints, Batch, Pipelines, CI/CD |
| 4. Monitoring, Maintenance & Security (Monitor) | 24% | Monitoring | Model Monitor, CloudWatch, IAM, KMS |

If SAA asks "how to design," and DVA asks "how to deploy with code," then MLA asks "**how to prepare, train, deploy, and operate ML workloads on AWS?**" The fact that data preparation and monitoring together comprise over half (52%) of the exam is crucial. Passing depends more on data pipelines and operations than on algorithm memorization.

## Summary

Two takeaways from today. First, the ML lifecycle is a **circular loop of data → training → evaluation → deployment → monitoring**, and ML code itself is only 5% of the whole system. Second, an ML engineer's role is to turn a data scientist's experiments into a system that is **reproducible, scalable, and operationalizable**.

Next, we'll enter the "training" stage of this lifecycle, distinguishing supervised, unsupervised, and reinforcement learning, and learning how to classify problems into classification, regression, and clustering, and what metrics evaluate each.

---

## 📝 연습 문제

**문제 1.** What is the core insight emphasized by Google's "Hidden Technical Debt in Machine Learning Systems" paper, which is also reflected in the structure of the MLA-C01 exam?

A) ML code accounts for 80% or more of ML systems  
B) ML code is less than 5% of ML systems, while data, serving, monitoring, and infrastructure comprise the majority  
C) ML systems are easier to maintain than regular software  
D) Once an ML model is deployed, retraining is unnecessary  

**정답: B**  
해설: The paper highlights that in real ML systems, model training code comprises less than 5% of the codebase, while the remaining 95% consists of data collection, validation, serving, monitoring, and infrastructure. MLA-C01 allocates over half of the exam to data preparation (28%) and monitoring (24%) for this reason. The claim that training code comprises 80% is the opposite, ML is harder to maintain due to data dependency, and models require retraining due to drift.

---

**문제 2.** When an ML engineer productionizes a 0.94 accuracy model created by a data scientist in a notebook, the first thing they must ensure is:

A) Higher accuracy  
B) Reproducibility of training — fixing data version, hyperparameters, and environment in code  
C) A larger instance type  
D) Making the model more complex  

**정답: B**  
해설: The #1 principle in ML engineering is reproducibility. Code alone cannot reproduce a model; you must fix data version, hyperparameters, and environment (libraries, seeds). Raising accuracy is the data scientist's job. Instance size and model complexity are operational and performance considerations that come after reproducibility is assured.

---

**문제 3.** After deploying a recommendation model with improved offline accuracy, user engagement time actually decreased. What is the most appropriate method for an ML engineer to detect this issue beforehand?

A) Simply increase offline accuracy further  
B) Conduct A/B testing by sending only a small amount of traffic to the new model to observe actual business metrics  
C) Deploy the new model to all traffic immediately  
D) Reduce training data  

**정답: B**  
해설: Since offline metrics (accuracy) can diverge from online business metrics (engagement time), an A/B test sending a portion of traffic to the new model should verify actual behavior metrics. Increasing only offline accuracy repeats the same trap; full deployment risks damage; reducing training data is unrelated to the problem.

---

**문제 4.** The phenomenon of many demand forecasting models failing in early 2020 is best described by which term?

A) Overfitting  
B) Data Drift — production data distribution significantly differs from training data  
C) Underfitting  
D) Data Leakage  

**정답: B**  
해설: This is a textbook example of data drift where the input data distribution at deployment time differs significantly from the training time distribution. Overfitting and underfitting are model complexity issues during training. Data leakage is a separate problem where future information leaks into training. Drift is detected by SageMaker Model Monitor comparing input distribution changes against baseline.

---

**문제 5.** Which two domains of MLA-C01, when combined, constitute over half (52%) of the exam's weight?

A) Model Development and Deployment  
B) Data Preparation and Monitoring, Maintenance & Security  
C) Deployment and Monitoring  
D) Data Preparation and Model Development  

**정답: B**  
해설: Data Preparation (28%) and Monitoring, Maintenance & Security (24%) together total 52%, exceeding half the exam. This aligns with the fact that data pipelines and operations form the true core of ML systems, not ML code itself. Other combinations miss one of these two areas and carry less weight.

---
