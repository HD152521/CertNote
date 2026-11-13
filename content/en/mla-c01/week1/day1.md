# Day 1 - The ML Lifecycle and the Role of the ML Engineer

## 📌 Key Takeaways

- The ML lifecycle is a cyclical loop of **data → training → evaluation → deployment → monitoring**. It is not linear.
- In a real ML system, **model training code is less than 5%**; the other 95% is data, serving, monitoring, and infrastructure.
- The ML engineer's job = making a data scientist's experiments **reproducible, scalable, and operable**.
- **Offline metrics (accuracy) and online metrics (dwell time, revenue) can diverge** → validate with A/B tests and canaries.
- Of the 4 MLA-C01 domains, **Data Preparation (28%) + Monitoring (24%) = 52%**. Operations, not memorizing algorithms, decides whether you pass.

## The ML Lifecycle: From Notebook to Production

A model with 0.94 accuracy built by a data scientist in a notebook usually takes months to receive real traffic, and even after it goes into production, half of them quietly break. The person who bridges this gap is the ML engineer.

In traditional software, once you write the code, the behavior is determined. In ML, **behavior is learned from data**. That is why the lifecycle gains the axes of "data" and "retraining."

```
        ┌──────────────────────────────────────────────────────┐
        │                                                      │
        v                                                      │
  ┌───────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   │
  │ 1. Data   │──>│ 2. Train │──>│ 3. Eval  │──>│ 4. Deploy│   │
  └───────────┘   └──────────┘   └──────────┘   └──────────┘   │
   Collect/clean   Pick algorithm Offline metrics Endpoint      │
   Labeling        Hyperparameter Business metrics Batch/canary │
   Feature eng.    tuning         Bias checks          │        │
                                                        v        │
                                                ┌──────────────┐ │
                                                │ 5. Monitoring│─┘
                                                └──────────────┘
                                                 Drift detection
                                                 Degradation alarms
                                                 Retraining trigger
```

The key is that this is a **loop, not a line**. When drift is caught at step 5, you go back to step 1. As "data" and "models" were added to the CI/CD that software engineers are familiar with, the field called MLOps was born.

If you map in advance which AWS service corresponds to each stage, the following weeks go much faster.

| Stage | What it does | Representative AWS services |
|------|--------|----------------|
| 1. Data | Collect, store, transform, label | S3, Kinesis, Glue, Athena, Ground Truth |
| 2. Train | Pick algorithm, train, tune | SageMaker Training Job, Automatic Model Tuning |
| 3. Evaluate | Compute metrics, check bias | SageMaker Experiments, Clarify |
| 4. Deploy | Serving, traffic shifting | Real-time endpoint, batch transform, Model Registry |
| 5. Monitor | Watch drift and quality | Model Monitor, CloudWatch, EventBridge |

> 💡 **Related theory**: This is the central claim of the 2015 Google paper "Hidden Technical Debt in Machine Learning Systems." In a real ML system, ML code (model training) is less than 5% of the entire codebase, and the other 95% is data collection, validation, serving, monitoring, and infrastructure. This is why MLA-C01 gives heavy weight to data pipelines, deployment, and operations rather than memorizing SageMaker algorithms.

## ML Engineer vs Data Scientist vs DevOps

The three roles overlap but have different centers of gravity. Because the exam asks from the "ML engineer's perspective," it is important to make these boundaries clear.

| Role | Center of gravity | Typical deliverables | Definition of success | AWS mostly touched |
|------|---------|------------|------------|----------------|
| Data scientist | Model performance, experiments | Notebooks, hypothesis testing | Did the metric go up? | Studio notebooks, Experiments |
| ML engineer | Reproducibility, scalability, operationalization | Training pipelines, inference endpoints, monitoring | Does it run automatically every week? | Pipelines, endpoints, Model Monitor |
| DevOps/Platform | Infrastructure, CI/CD | IaC, clusters, networks | Does the infrastructure stay up? | CloudFormation, EKS, VPC |

Where a data scientist proves "this model is good," an ML engineer makes it so that "this model is retrained automatically every week, takes traffic safely, and sends an alarm when it breaks."

```python
# Data scientist style: improvised in a notebook
model.fit(X_train, y_train)        # no record of which data it was
preds = model.predict(X_test)      # not reproducible

# ML engineer style: as a reproducible pipeline
import sagemaker
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=training_image,
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    hyperparameters={"num_round": 100, "max_depth": 5},
    output_path="s3://my-bucket/models/",   # artifact location fixed
)
estimator.fit({"train": "s3://my-bucket/data/v3/train/"})  # data version fixed
```

The difference between the two code snippets above is the essence of ML engineering. The input data version (`v3`), hyperparameters, and instance type are stated explicitly in the code, so anyone can reproduce the same model six months later.

**The 4 elements needed for reproduction**: if even one is missing, you will not get the same model.

| Element | If not pinned | Mechanism in SageMaker |
|------|---------------|---------------------|
| Code | Preprocessing logic changes | Git integration, container image tags |
| Data version | The training target itself changes | Assign a version to the S3 prefix (`data/v3/`) |
| Hyperparameters | The convergence point changes | Estimator `hyperparameters`, Experiments records |
| Environment (libraries, seeds) | Tiny numerical differences accumulate | Pin the image URI, specify the random seed |

Reproducibility is the number one principle of ML engineering. To reproduce a machine learning experiment, the code version alone is not enough; you must pin all of (1) the code, (2) the data version, (3) the hyperparameters, and (4) the environment (library versions and random seed). This is why SageMaker provides features such as Experiments, Model Registry, and lineage tracking.

## Offline Metrics and Business Metrics Are Different

One trap ML engineers run into often: a model that improved in offline evaluation can lower the actual business metric. For example, a recommendation model's accuracy goes up but users' dwell time goes down.

| Aspect | Offline metrics | Online metrics |
|------|-------------|------------|
| What is measured | Model performance on past data | The outcome of real user behavior |
| Examples | accuracy, AUC, RMSE | Click-through rate, conversion rate, dwell time, revenue |
| When you look | A gate before deployment | The final verdict after deployment |
| Measurement cost | Low (can iterate immediately) | High (needs traffic and time) |
| Limitation | Does not guarantee real utility | Noisy and slow |

That is why an **A/B test** is essential at the deployment stage. SageMaker lets you put multiple model variants on one endpoint and split traffic among them.

```python
from sagemaker.session import production_variant

variant_a = production_variant(
    model_name="model-v1", instance_type="ml.m5.large",
    initial_instance_count=1, variant_name="A", initial_weight=90,
)
variant_b = production_variant(
    model_name="model-v2", instance_type="ml.m5.large",
    initial_instance_count=1, variant_name="B", initial_weight=10,  # only 10% to the new model
)
```

You send just 10% of traffic to the new model, observe the real business metrics, and if it is safe, gradually raise the weight. This is the ML version of a canary deployment.

The typical causes of offline and online metrics diverging are (1) the difference in distribution between training data and production data (distribution shift), and (2) a feedback loop where the model's output changes user behavior and thus changes the data distribution itself. An ML engineer uses offline metrics as a gate and online metrics as the final verdict.

> ⚠️ **Pitfall**: "The offline metric went up, so deploy to everyone" is a classic wrong-answer type. Even if the metric goes up, if you skip the step of validating with a small amount of traffic first, all users are affected when a problem occurs. In the exam, when you see the condition "verify real performance while minimizing the risk of the new model," traffic splitting (variant weight) is the right direction.

## Monitoring: A Model Starts Aging the Moment It Ships

Software stays the same once deployed, but a model quietly becomes wrong when the world changes. This is called **model drift**, and there are two kinds.

| Aspect | Data drift | Concept drift |
|------|----------------------------|------------------------------|
| What changes | The distribution of input features | The relationship between input and answer itself |
| Example | The age composition of users changes | The meaning of the same behavior changes |
| Detection method | Compare the input distribution with the training-time baseline | Compare performance after obtaining the actual ground-truth labels |
| Detection difficulty | Relatively easy (no labels needed) | Hard (the ground truth arrives late) |

AWS uses **SageMaker Model Monitor** to capture the inputs/outputs of a running endpoint, compare them with the training-time baseline, and raise a CloudWatch alarm when drift exceeds a threshold. The alarm can trigger a retraining pipeline (EventBridge → Pipelines).

```
[Endpoint] ──data capture──> [S3]
                               │
                               v
                    [Model Monitor schedule]
                     compare with baseline stats
                               │
                  over threshold│
                               v
                       [CloudWatch alarm]
                               │
                               v
                  [EventBridge] ──> [SageMaker Pipelines retraining]
```

In the early days of COVID in 2020, many companies' demand forecasting, recommendation, and fraud detection models collapsed at the same time. As human behavior patterns changed abruptly, the training data distribution and the production data distribution became completely different, a typical case of data drift. After this event, the recognition that "deployment is not the end for a model; monitoring and retraining are the main body" took hold across the industry.

## The 4 Domains of MLA-C01

The exam splits this lifecycle into 4 domains. If you map which stage of the lifecycle each domain corresponds to, your study direction becomes clear.

| Domain | Weight | Lifecycle mapping | Key keywords |
|--------|------|-------------|------------|
| 1. Data Preparation (Data Prep) | 28% | Data | S3, Glue, Feature Store, data labeling |
| 2. Model Development (Model Dev) | 26% | Train/Evaluate | Built-in algorithms, tuning, evaluation metrics, bias |
| 3. Deployment and Orchestration (Deploy) | 22% | Deploy | Endpoints, batch, Pipelines, CI/CD |
| 4. Monitoring, Maintenance, and Security (Monitor) | 24% | Monitor | Model Monitor, CloudWatch, IAM, KMS |

- SAA asks "how do you design it" and DVA asks "how do you deploy it with code."
- MLA asks "**how do you prepare, train, deploy, and operate an ML workload on AWS**."
- Data preparation + monitoring is half (52%). Data pipelines and operations, rather than memorizing model algorithms, decide whether you pass.

In the next post we enter the "training" stage of this lifecycle, looking at whether the problem you are solving is supervised, unsupervised, or reinforcement, how to tell classification, regression, and clustering apart, and which metrics to evaluate with.

## 📖 Glossary

- **ML lifecycle**: The whole flow of ML work that cycles from data preparation through training, evaluation, deployment, and monitoring.
- **MLOps**: The field of running ML systems automatically and reliably by adding "data" and "models" on top of software CI/CD.
- **Reproducibility**: The property that rerunning with the same code, data, settings, and environment produces the same model.
- **Data version pinning**: Fixing, by path or tag, which data was used for training. A form like `s3://.../data/v3/`.
- **Offline metrics**: Model performance computed on past data. Accuracy, AUC, and so on. Used as a pass criterion before deployment.
- **Online metrics**: Results produced by users in the real service. Click-through rate, dwell time, revenue, and so on.
- **A/B test**: A method of splitting traffic and running two models at the same time to actually confirm which is better.
- **Canary deployment**: A deployment approach that first sends only a tiny amount of traffic to the new version to check for problems, then raises the share.
- **Model drift**: The phenomenon of a model quietly becoming wrong over time. Divided into data drift and concept drift.
- **Model Monitor**: A SageMaker feature that captures the inputs and outputs of a production endpoint, compares them with the training-time baseline, and raises an alarm on anomalies.

## 📝 Practice Questions

**Question 1.** Which fact, emphasized by Google's "Hidden Technical Debt in ML Systems" paper, is also reflected in the MLA-C01 exam composition?

A) Model training code makes up more than 80% of an ML system  
B) Model training code is less than 5% of an ML system, and data, serving, monitoring, and infrastructure are most of it  
C) ML systems are easier to maintain than ordinary software  
D) Once an ML model is deployed, no retraining is needed  

**Answer: B**  
Explanation: The paper pointed out that in a real ML system, model training code is less than 5%, and the other 95% is data collection, validation, serving, monitoring, and infrastructure. This is why MLA-C01 assigns more than half to data preparation (28%) and monitoring (24%). A training code share of 80% is the opposite, ML is harder to maintain because of data dependencies, and models must be retrained because of drift.

---

**Question 2.** When an ML engineer productionizes a model with 0.94 accuracy built by a data scientist in a notebook, what must be secured first?

A) Higher accuracy  
B) Training reproducibility: pin the data version, hyperparameters, and environment in code  
C) A bigger instance type  
D) Making the model more complex  

**Answer: B**  
Explanation: The number one principle of ML engineering is reproducibility. Code alone cannot reproduce a model; you must also pin the data version, hyperparameters, and environment (libraries, seeds). Raising accuracy further is the data scientist's domain, and instance size and model complexity are operations and performance concerns to consider after reproducibility is secured.

---

**Question 3.** After deploying a recommendation model whose accuracy improved in offline evaluation, user dwell time actually decreased. What is the most appropriate way for an ML engineer to detect this in advance?

A) Just raise the offline accuracy further  
B) Observe the real business metrics with an A/B test that sends only a small amount of traffic to the new model  
C) Deploy the model immediately to all traffic  
D) Reduce the training data  

**Answer: B**  
Explanation: Offline metrics (accuracy) and online business metrics (dwell time) can diverge, so you must confirm the real behavior metrics with an A/B test that sends only part of the traffic to the new model. Raising only the offline accuracy repeats the same trap, deploying to everyone increases risk, and reducing the training data is unrelated to the problem.

---

**Question 4.** Which term most accurately describes the phenomenon in which many demand forecasting models collapsed in the early days of COVID?

A) Overfitting  
B) Data drift: the production data distribution differs greatly from the training data  
C) Underfitting  
D) Data leakage  

**Answer: B**  
Explanation: It is a typical data drift in which the data distribution at training time and the input distribution at production time diverged. Overfitting and underfitting are model-complexity problems at the training stage, and data leakage is a separate problem in which future information seeps into training. Drift is handled by detecting changes in the input distribution relative to the baseline with SageMaker Model Monitor.

---

**Question 5.** Among the 4 MLA-C01 domains (data preparation 28%, model development 26%, deployment 22%, monitoring, maintenance, and security 24%), which of the following pairs together carry more than half (50%) of the weight?

A) Model development and deployment  
B) Data preparation and monitoring, maintenance, and security  
C) Deployment and monitoring  
D) Model development and monitoring, maintenance, and security  

**Answer: B**  
Explanation: Data preparation (28%) and monitoring, maintenance, and security (24%) add up to 52%, more than half. This is consistent with the fact that data pipelines and operations, rather than the ML code itself, are the main body of a real ML system. The other options come to 48% (model development + deployment), 46% (deployment + monitoring), and 50% (model development + monitoring), none of which exceeds half.

---
