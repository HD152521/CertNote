# Day 4 - Retraining and Model Maintenance: Automated Retraining Pipelines and A/B and Shadow Testing

## 📌 Key Takeaways

- Mature ML operations connect **drift detection → automated retraining → safe redeployment** into a single closed loop.
- For retraining triggers, **drift- and performance-based event triggers** are more cost-efficient than schedule-based ones.
- The automation chain is **Model Monitor violation → CloudWatch Alarm → EventBridge/Lambda → SageMaker Pipelines**.
- A **ConditionStep** registers a model in the Model Registry only when it passes the evaluation criteria, preventing performance regressions.
- Redeploy in order of risk - **shadow** (zero user impact) → **A/B and canary** (a small group exposed) → **Blue/Green** (guardrails and automatic rollback).

## The Closed Loop of Maintenance

Once monitoring has detected drift or performance degradation, what comes next? Having a person retrain and deploy the model by hand every time is slow and error-prone. The whole picture makes one full turn, as below.

```text
        ┌────────────────── Endpoint in production ───────────────┐
        │                                                        │
        ▼                                                        │
  Model Monitor violation                                         │
  (data/model quality, bias, attribution)                         │
        │                                                        │
        ▼                                                        │
  CloudWatch metric → Alarm                                       │
        │                                                        │
        ▼                                                        │
  EventBridge rule (or SNS → Lambda)                              │
        │                                                        │
        ▼                                                        │
  SageMaker Pipelines execution                                   │
   ├ Preprocessing (Processing)                                   │
   ├ Training                                                     │
   ├ Evaluation                                                   │
   └ ConditionStep ──fail──▶ Do not register (keep existing model) ┤
              │                                                   │
            pass                                                  │
              ▼                                                   │
   Register in Model Registry (Approved / PendingManualApproval)  │
              │                                                   │
              ▼                                                   │
   Redeploy: shadow → A/B·canary → blue/green ─────────────────────┘
```

From an MLOps perspective, MLA-C01 asks "how do you respond automatically when drift is detected?" and "which deployment strategy do you use to validate a new model version without risk?"

## Signals That Retraining Is Needed

When should a model be retrained? There are three main triggers.
- **Drift-based**: When Model Monitor reports a data or model quality violation.
- **Performance-based**: When the accuracy or F1 from the model quality monitor falls below a threshold.
- **Schedule-based**: Periodically (e.g., weekly) in domains where data changes quickly.

| Trigger | Strength | Weakness | Suitable situation |
|--------|------|------|--------------|
| Drift-based | Runs only when something changes, so cost-efficient | Threshold tuning needed, false alarms possible | Most domains where change is sporadic |
| Performance-based | Reacts directly to real harm | Must wait for ground truth, so it is late | Domains where labels are confirmed quickly |
| Schedule-based | Simple and predictable, easy to operate | Incurs cost even during periods without change | Domains where data changes steadily |
| Data-volume-based | Trains once enough new data has accumulated | May run regardless of quality degradation | When the inflow of new data is the training bottleneck |

> 💡 **Related Theory**: Retraining as often as possible is not the right answer. Retraining brings compute cost, validation time, and the risk that the new model is actually worse. That is why an **event-driven trigger** such as "retrain when drift is detected" is cost-efficient. Schedule-based is simple, but it can waste resources by retraining even during periods with no change. When the exam says "to reduce unnecessary retraining cost," choose the drift-based trigger over the schedule-based one.

## Composition of an Automated Retraining Pipeline

On AWS, the center of retraining automation is **SageMaker Pipelines**. You define the steps data processing → training → evaluation → (conditional) model registration, and trigger it with an external event.

A typical event-driven flow:
1. Model Monitor sends the drift violation as a **CloudWatch metric**.
2. A **CloudWatch Alarm** goes into the ALARM state and fires an **EventBridge** rule (or SNS → Lambda).
3. **Lambda** (or the EventBridge target) starts a **SageMaker Pipeline execution**.
4. The pipeline retrains on the latest data, and if the performance passes the criteria in the evaluation step, it registers the new version in the **Model Registry**.

```python
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo

# Condition step that registers the model only when evaluation accuracy meets the criterion
cond = ConditionGreaterThanOrEqualTo(
    left=eval_accuracy, right=0.85,        # Do not register if accuracy is below 0.85
)
condition_step = ConditionStep(
    name="CheckAccuracy",
    conditions=[cond],
    if_steps=[register_model_step],         # On pass, register in the Model Registry
    else_steps=[],                          # On fail, do nothing (keep the existing model)
)
pipeline = Pipeline(name="retrain-pipeline", steps=[process_step, train_step,
                                                    eval_step, condition_step])
```

Conditional registration is important. If the retrained model falls short of the criteria, it is not deployed automatically and the existing model is kept, preventing a **regression**.

Starting the pipeline from Lambda is this simple.

```python
import boto3
sm = boto3.client("sagemaker")

def lambda_handler(event, context):
    # Receive the event passed by the CloudWatch Alarm → SNS/EventBridge and start retraining
    sm.start_pipeline_execution(
        PipelineName="retrain-pipeline",
        PipelineParameters=[
            {"Name": "InputDataUrl", "Value": "s3://my-bucket/latest/"},
            {"Name": "AccuracyThreshold", "Value": "0.85"},
        ],
    )
```

The Model Registry manages model versions as a catalog and gives each version an approval status (Approved/Rejected). If the retraining pipeline registers the new version as "PendingManualApproval," you can make the deployment pipeline (e.g., CodePipeline) trigger only when a person reviews and approves it. You choose between fully automatic (deploy as soon as the condition passes) and human approval (human-in-the-loop) according to the risk.

## Redeployment Strategies at a Glance

Even if a new model did well on the evaluation data, there is no guarantee it will do better on real traffic. So you choose a deployment strategy by "how much risk you are willing to take."

| Strategy | Do users get the response? | What can be compared | Cost | Rollback |
|------|----------------------|---------------------|------|------|
| **Shadow** | No (record only) | Technical metrics such as latency, errors, prediction distribution | Two sets of inference cost | Just stop the shadow |
| **A/B (production variants)** | Yes (by weight) | Technical metrics + business outcomes such as clicks and conversions | Sum of variant instances | Set the weight back to 0 |
| **Canary / linear** | Yes (small group → increasing) | Anomalies during the transition | Double capacity during the transition | Alarm-based automatic rollback |
| **Blue/Green** | Yes (everyone after the switch) | Overall metrics after the switch | Double capacity during the transition | Alarm-based automatic rollback |

Shadow and A/B have different purposes. Shadow is a **technical validation** that checks "does the new model **not blow up** on production traffic?", and A/B is an **outcome validation** that checks "does the new model actually **produce better results**?" Since shadow returns no response to users, it cannot measure business metrics like click-through or conversion rates in the first place. That is why the practical order is shadow → A/B.

## Safe Redeployment 1 - A/B Testing

**A/B testing** puts several **production variants** on one endpoint and splits traffic among them for comparison. For example, you start with 90% for the existing model and 10% for the new one, and if the new model performs well, you raise its share gradually.

```python
from sagemaker.session import production_variant

variant_a = production_variant(model_name="model-v1", instance_type="ml.m5.xlarge",
                               initial_instance_count=1, variant_name="ModelV1",
                               initial_weight=9)        # 90% of traffic
variant_b = production_variant(model_name="model-v2", instance_type="ml.m5.xlarge",
                               initial_instance_count=1, variant_name="ModelV2",
                               initial_weight=1)        # 10% of traffic
# Deploy both variants on one endpoint
session.endpoint_from_production_variants(name="ab-endpoint",
                                          production_variants=[variant_a, variant_b])
```

You adjust the traffic split with the weight (`initial_weight`), and since you can change the shares in real time, it is used for gradual rollouts (canary).

```python
# Raise the new model's share to 50% by adjusting only the weights, without redeploying
sm.update_endpoint_weights_and_capacities(
    EndpointName="ab-endpoint",
    DesiredWeightsAndCapacities=[
        {"VariantName": "ModelV1", "DesiredWeight": 5},
        {"VariantName": "ModelV2", "DesiredWeight": 5},
    ],
)
```

- Latency and error metrics appear in CloudWatch split by the `VariantName` dimension, so you can compare per variant.
- To compare business metrics too (conversion rate, etc.), you must link the prediction results to the subsequent user behavior.

## Safe Redeployment 2 - Shadow Testing

In an A/B test, the new model **actually responds** to some real users. If that response is bad, those users are affected. **Shadow testing** removes this risk. It sends a copy of production traffic to the new (shadow) model as well, but **the shadow model's response is not returned to the user and is only recorded**. Users always receive the existing model's response.

```text
             ┌──▶ Production model v1 ──▶ Response ──▶ [User]
  Request ───┤
             └──▶ Shadow model v2 ─────▶ Only logs and metrics saved (not sent to the user)
```

```python
# SageMaker Shadow Test: deploy a production variant and a shadow variant together
# The shadow model receives the same input and runs inference, but the result is only logged and never reaches the user
shadow_config = {
    "ShadowModelVariants": [
        {"ShadowModelVariantName": "model-v2-shadow", "SamplingPercentage": 100},
    ],
}
```

Shadow testing is the right answer when you want to "validate how the new model behaves on real production traffic without risk." After comparing latency, errors, and the prediction distribution with no user impact, you move on to A/B or a full replacement if satisfied. Lowering `SamplingPercentage` reduces the shadow inference cost.

> ⚠️ **Trap**: It is easy to confuse A/B testing with shadow testing. **In A/B, the new model's response actually goes out to real users** (some risk exists, and outcomes can be compared with business metrics). **In shadow, the new model's response does not go out to users and is only recorded** (zero user impact, purely technical validation). "Validate the new model with production data without affecting users at all" means shadow, and "split traffic and transition gradually" means A/B.

## Deployment Guardrails

For a full replacement, you transition safely with **deployment guardrails**. You bring up a new environment with **Blue/Green**, switch over either all at once or gradually with **canary** or **linear**, and automatically **roll back** if a CloudWatch alarm fires.

| Traffic shifting method | How it moves | When to choose it |
|-----------------|--------------|-------------|
| All at once | The entire traffic immediately to the new environment | When the risk is low and you want to finish quickly |
| Canary | A small amount first → after observation, the rest all at once | When you want to catch early anomalies with minimal damage |
| Linear | Moved in several steps of a fixed percentage | When you want to bring in load changes gently |

- Automatic rollback works only when tied to a **CloudWatch alarm**. If you do not set an alarm, you end up in a state of "a guardrail deployment that cannot roll back."
- During the transition, the old and new environments run at the same time, so **capacity cost temporarily doubles**.

## When Retraining and Redeployment Go Wrong: Symptom → Cause → Fix

| Symptom | Common cause | Fix |
|------|-----------|------|
| Drift is detected but retraining does not run | An alarm exists but the EventBridge/Lambda connection is missing | Connect the chain: alarm → EventBridge rule → `start_pipeline_execution` |
| Retraining cost keeps rising | A schedule-based trigger trains every time even without change | Switch to drift- and performance-event-based triggers |
| Performance got worse after retraining | Registered and deployed automatically with no condition (no regression guard) | Use `ConditionStep` to register only when the criteria pass |
| The pipeline fails with a permission error | The execution role lacks S3, ECR, or SageMaker permissions | Fix the pipeline execution role's permissions |
| A/B results cannot be interpreted | Traffic is so low that the difference is not statistically detectable | Extend the observation period or raise the new model's weight |
| Shadow test costs more than expected | Shadow sampling at 100% runs two sets of inference | Lower `SamplingPercentage` and end the shadow after validation |
| A problem occurred after a Blue/Green switch but no rollback happened | The CloudWatch alarm for automatic rollback was not set | Attach the alarm to the transition policy and validate the threshold beforehand |
| The new model went out directly without approval | The Registry registration status is auto-approve | Register as `PendingManualApproval` to insert a human review step |

In the next article, we review all of Week 8 together - data/model quality drift, bias and explainability drift (Clarify), operational monitoring (CloudWatch/X-Ray), and retraining and redeployment.

## 📖 Glossary

- **Closed loop** : An operating structure that turns on its own: detect → trigger → retrain → redeploy → detect again.
- **Event-driven trigger** : A method that starts retraining only when an event such as a drift or performance violation occurs, rather than at set times.
- **SageMaker Pipelines** : An ML workflow service that runs preprocessing, training, evaluation, and registration steps together. The center of retraining automation.
- **ConditionStep** : A conditional branch step that runs the next step only when the evaluation metric exceeds the criterion. A safeguard against performance regressions.
- **Model Registry** : A repository that manages model versions as a catalog and assigns approval statuses (Approved/PendingManualApproval, etc.).
- **Production variant** : A model slot that coexists within one endpoint. Weights split the traffic share.
- **A/B testing** : A method that splits traffic by variant weights to compare the new model's actual outcomes. The new responses go out to users.
- **Shadow testing** : A method that sends a copy of production traffic to the new model but only records its responses. User impact is zero.
- **Canary / linear shifting** : Gradual transition methods that move traffic to the new version in a small amount first / in steps of a fixed percentage.
- **Deployment guardrails** : A safe deployment mechanism that adds CloudWatch alarm-based automatic rollback to Blue/Green and canary transitions.

---

## 📝 Practice Questions

**Question 1.** You want to automatically start a retraining pipeline when model accuracy drops below the baseline of 0.85. What is the most appropriate trigger?

A) EventBridge scheduled rule (cron)  
B) A CloudWatch Alarm detects the accuracy metric breaching the threshold → EventBridge or Lambda trigger  
C) S3 versioning  
D) IAM policy change  

**Answer: B**  
Explanation: An accuracy drop is detected by a CloudWatch Alarm, and the ALARM state change is delivered to EventBridge or Lambda to trigger the retraining pipeline. A is only a scheduled trigger and not detection of performance degradation, and C and D are unrelated to monitoring or triggering.

---

**Question 2.** In a continuous training loop, what should happen if the retrained model performs worse than the previous model?

A) Deploy it automatically  
B) The quality gate (ConditionStep) blocks registration  
C) Delete the previous model  
D) Only notify a person and do nothing else  

**Answer: B**  
Explanation: A ConditionStep (quality gate) at the end of the pipeline checks the performance threshold and blocks registration if it is below the standard. A is risky, C loses version history, and D lacks automation.

---

**Question 3.** In a domain where data changes quickly but there are also many periods with no change, which retraining trigger is the most appropriate for minimizing retraining cost while still responding to performance degradation?

A) Unconditionally retrain every hour  
B) Event-driven retraining triggered by Model Monitor drift/performance violations  
C) Never retrain the model  
D) Retrain once a year  

**Answer: B**  
Explanation: Retraining only when a drift/performance violation event occurs avoids unnecessary retraining cost during periods with no change while responding immediately to degradation. A wastes resources during periods with no change, C leaves drift unaddressed, and D responds too slowly to rapid change.

---

**Question 4.** You want to validate a new model version with real production traffic without affecting users in any way. How can you record the new model's responses without returning them to users?

A) A/B test (50:50 traffic split)  
B) Shadow testing  
C) Full blue/green cutover  
D) Deploy the new model directly to 100% of traffic  

**Answer: B**  
Explanation: Shadow testing sends a copy of production traffic to the new model to run inference and record results without returning the responses to users, so user impact is zero. In A, the new model's responses actually reach some users, and in C and D the new model serves users directly, which is risky.

---

**Question 5.** In a SageMaker Pipelines retraining pipeline, how can you prevent automatic deployment when the newly trained model's evaluation accuracy is below the threshold?

A) Skip the evaluation step  
B) Use a ConditionStep to register the model in Model Registry only when accuracy is at or above the threshold  
C) Always register the new model  
D) Delete the endpoint  

**Answer: B**  
Explanation: Using a ConditionStep to register the model only when the evaluation metric passes the threshold (if_steps) and not registering it otherwise automatically prevents performance regression. A removes validation and is risky, C deploys bad models too, and D is an unrelated action that interrupts the service.

---

**Question 6.** In an A/B test, which SageMaker mechanism splits traffic between the existing model and the new model?

A) Two separate endpoints, with the client branching directly  
B) Multiple production variants on one endpoint, with traffic distributed by weight  
C) An S3 bucket policy  
D) IAM role separation  

**Answer: B**  
Explanation: SageMaker runs A/B tests by placing multiple production variants on one endpoint and splitting the traffic share with `initial_weight`, and the weights can be adjusted in real time to allow gradual rollout. A increases client-side complexity, and C and D are unrelated to traffic distribution.

---

**Question 7.** Which is the most appropriate order of the automation chain from drift detection to the start of retraining?

A) Model Monitor violation → CloudWatch Alarm → EventBridge/Lambda → SageMaker Pipeline execution  
B) S3 upload → DynamoDB → manual retraining  
C) X-Ray trace → Clarify → delete endpoint  
D) CloudWatch Logs → retraining completes with SNS alone  

**Answer: A**  
Explanation: When Model Monitor sends a violation as a CloudWatch metric, the alarm goes to ALARM, and an EventBridge rule or Lambda triggers a SageMaker Pipeline retraining run; this is the standard automation chain. B is manual, C is an unrelated combination of services, and D cannot complete retraining with SNS notifications alone.

---
