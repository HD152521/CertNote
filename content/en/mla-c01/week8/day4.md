# Day 4 - Retraining and Model Maintenance: Automated Retraining Pipelines and A/B and Shadow Testing

## 📌 Key Takeaways

- Mature ML operations link **drift detection → automatic retraining → safe redeployment** into a single closed loop.
- For retraining triggers, **event triggers based on drift or performance** are more cost-efficient than schedule-based ones.
- The automation chain is **Model Monitor violation → CloudWatch Alarm → EventBridge/Lambda → SageMaker Pipelines**.
- Use a **ConditionStep** to register to the Model Registry only when the evaluation criteria pass, preventing performance regressions.
- Redeploy in order of risk: **shadow** (zero user impact) → **A/B and canary** (a small share exposed) → **Blue/Green** (guardrails and automatic rollback).

## The Closed Loop of Maintenance

If monitoring has detected drift or performance degradation, what comes next? Having a person retrain and deploy the model by hand every time is slow and error-prone. The whole picture goes around one full cycle like this.

```text
        ┌────────────────── Endpoint in operation ─────────────────┐
        │                                                        │
        ▼                                                        │
  Model Monitor violation                                         │
  (data/model quality, bias, attribution)                          │
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
   └ ConditionStep ──fail──▶ Don't register (keep existing model) ─┤
              │                                                   │
            pass                                                  │
              ▼                                                   │
   Model Registry registration (Approved / PendingManualApproval)  │
              │                                                   │
              ▼                                                   │
   Redeploy: shadow → A/B and canary → blue/green ────────────────┘
```

From an MLOps perspective, MLA-C01 asks "how do you respond automatically when drift is detected?" and "which deployment strategy do you use to validate a new model version without risk?"

## Signals That Retraining Is Needed

When should a model be retrained? There are three main triggers.
- **Drift-based**: When Model Monitor reports a data/model quality violation.
- **Performance-based**: When the accuracy or F1 of the model quality monitor falls below a threshold.
- **Schedule-based**: Periodically (for example, weekly) in domains where data changes quickly.

| Trigger | Strength | Weakness | Suited situation |
|--------|------|------|--------------|
| Drift-based | Runs only when there is change, so cost-efficient | Needs threshold tuning, false positives possible | Most domains where change is sporadic |
| Performance-based | Reacts directly to actual damage | Late because it must wait for ground truth | Domains where labels are confirmed quickly |
| Schedule-based | Simple and predictable, easy to operate | Incurs cost even in periods with no change | Domains where data changes steadily |
| Data-volume-based | Trains once enough new data has accumulated | May run regardless of quality degradation | When the inflow of new data is the training bottleneck |

> 💡 **Related theory**: Retraining as often as possible is not the right answer. Retraining comes with compute cost, validation time, and the risk that the new model turns out worse. That is why an **event-driven trigger** like "retrain when drift is detected" is cost-efficient. Schedule-based is simple, but it can retrain even in periods with no change and waste resources. When the exam says "to reduce unnecessary retraining cost," choose a drift-based trigger over a schedule-based one.

## Composition of an Automated Retraining Pipeline

On AWS, the center of retraining automation is **SageMaker Pipelines**. You define the steps data processing → training → evaluation → (conditional) model registration, and trigger it with an external event.

A typical event-driven flow:
1. Model Monitor sends the drift violation as a **CloudWatch metric**.
2. The **CloudWatch Alarm** goes into the ALARM state and fires an **EventBridge** rule (or SNS → Lambda).
3. **Lambda** (or an EventBridge target) starts a **SageMaker Pipeline execution**.
4. The pipeline retrains on the latest data, and if performance passes the criteria in the evaluation step, it registers the new version in the **Model Registry**.

```python
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo

# A condition step that registers the model only when evaluation accuracy meets the threshold
cond = ConditionGreaterThanOrEqualTo(
    left=eval_accuracy, right=0.85,        # Don't register if accuracy is below 0.85
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

The side that starts the pipeline from Lambda is this simple.

```python
import boto3
sm = boto3.client("sagemaker")

def lambda_handler(event, context):
    # Receive the event passed by CloudWatch Alarm → SNS/EventBridge and start retraining
    sm.start_pipeline_execution(
        PipelineName="retrain-pipeline",
        PipelineParameters=[
            {"Name": "InputDataUrl", "Value": "s3://my-bucket/latest/"},
            {"Name": "AccuracyThreshold", "Value": "0.85"},
        ],
    )
```

The Model Registry manages model versions as a catalog and gives each version an approval status (Approved/Rejected). If the retraining pipeline registers the new version as "PendingManualApproval," you can make the deployment pipeline (for example, CodePipeline) trigger only when a person approves after review. You choose between fully automatic (deploy immediately when the condition passes) and human approval (human-in-the-loop) according to the level of risk.

## Redeployment Strategies at a Glance

Even if a new model did well on the evaluation data, there is no guarantee it will be better on real traffic. So you choose a deployment strategy by "how much risk you are willing to take."

| Strategy | Does the response reach users? | What can be compared | Cost | Rollback |
|------|----------------------|---------------------|------|------|
| **Shadow** | No (recorded only) | Technical metrics such as latency, errors, and prediction distribution | Two sets of inference cost | Just stop the shadow |
| **A/B (production variants)** | Yes (by weight) | Technical metrics + business outcomes such as clicks and conversions | Sum of variant instances | Set the weight back to 0 |
| **Canary / linear** | Yes (small share → increasing) | Anomalies during the shift | Double capacity during the shift period | Automatic alarm-based rollback |
| **Blue/Green** | Yes (everything after the shift) | Overall metrics after the shift | Double capacity during the shift period | Automatic alarm-based rollback |

Shadow and A/B have different purposes. Shadow is a **technical validation** that checks "does the new model **not blow up** on production traffic?", and A/B is an **outcome validation** that checks "does the new model actually **produce better results**?" Shadow has no user response, so business metrics like click-through rate and conversion rate can't be measured at all. So the practical order is shadow → A/B.

## Safe Redeployment 1: A/B Testing

**A/B testing** puts several **production variants** on one endpoint and splits traffic to compare them. For example, you start with 90% on the existing model and 10% on the new model, and raise the share gradually if the new model performs well.

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

The weights (`initial_weight`) control the traffic split, and since you can change the share in real time, it is used for gradual rollout (canary).

```python
# Raise the new model's share to 50% by adjusting only the weights, without redeployment
sm.update_endpoint_weights_and_capacities(
    EndpointName="ab-endpoint",
    DesiredWeightsAndCapacities=[
        {"VariantName": "ModelV1", "DesiredWeight": 5},
        {"VariantName": "ModelV2", "DesiredWeight": 5},
    ],
)
```

- Latency and error metrics appear in CloudWatch split by the `VariantName` dimension, so you can compare per variant.
- To compare business metrics (such as conversion rate) too, you need to link prediction results to subsequent user behavior.

## Safe Redeployment 2: Shadow Testing

In A/B testing, the new model **actually responds** to some real users. If that response is bad, those users are affected. **Shadow testing** removes this risk. It also sends a copy of production traffic to the new (shadow) model, but **the shadow model's response is not returned to the user and is only recorded**. The user always receives the existing model's response.

```text
             ┌──▶ Production model v1 ──▶ Response ──▶ [User]
  Request ───┤
             └──▶ Shadow model v2 ─────▶ Store only logs and metrics (does not go to the user)
```

```python
# SageMaker Shadow Test: deploy a production variant and a shadow variant together
# The shadow model receives the same input and runs inference, but the result is only logged and not sent to the user
shadow_config = {
    "ShadowModelVariants": [
        {"ShadowModelVariantName": "model-v2-shadow", "SamplingPercentage": 100},
    ],
}
```

Shadow testing is the right answer when you want to "validate how the new model behaves on real production traffic without risk." After comparing latency, errors, and prediction distribution without user impact, if you are satisfied you move on to A/B or a full replacement. Lowering `SamplingPercentage` reduces the shadow inference cost.

> ⚠️ **Trap**: It is easy to confuse A/B testing and shadow testing. **In A/B, the new model's response actually goes out to real users** (some risk exists, and outcomes can be compared with business metrics). **In shadow, the new model's response does not go out to users and is only recorded** (zero user impact, purely technical validation). If it is "validate the new model with production data without affecting users at all," it is shadow, and if it is "split traffic and shift gradually," it is A/B.

## Deployment Guardrails

For a full replacement, you shift safely with **deployment guardrails**. You bring up a new environment with **Blue/Green**, then shift all at once or gradually with **canary** or **linear**, and if a CloudWatch alarm fires, it automatically **rolls back**.

| Traffic shifting method | How it moves | When to choose it |
|-----------------|--------------|-------------|
| All at once | The entire load immediately to the new environment | When risk is low and you want to finish quickly |
| Canary | A small amount first → after observing, all the rest | When you want to catch early anomalies with minimal damage |
| Linear | Move in several steps of a fixed percentage | When you want to take load changes gently |

- Automatic rollback works only when tied to a **CloudWatch alarm**. If you don't set an alarm, you end up in a state of "a guardrail deployment that can't roll back."
- During the shift, the old and new environments are up at the same time, so **capacity cost temporarily doubles**.

## When Retraining and Redeployment Go Wrong: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| Drift is detected but retraining doesn't run | An alarm exists but the EventBridge/Lambda connection is missing | Connect the chain alarm → EventBridge rule → `start_pipeline_execution` |
| Retraining cost keeps increasing | A schedule-based trigger trains every time even without change | Switch to drift/performance event-based triggers |
| Performance got worse after retraining | Automatic registration and deployment with no condition (no regression guard) | Register only when criteria pass, using `ConditionStep` |
| The pipeline fails with a permissions error | The execution role lacks S3, ECR, or SageMaker permissions | Fix the pipeline execution role's permissions |
| A/B results can't be interpreted | Too little traffic, so the difference isn't statistically detectable | Extend the observation period or raise the new model's weight |
| It's a shadow test but the cost is higher than expected | Shadow sampling at 100% runs two sets of inference | Lower `SamplingPercentage`, end the shadow after validation |
| A problem occurred after a Blue/Green shift but rollback didn't happen | No CloudWatch alarm set for automatic rollback | Attach the alarm to the shift policy and validate the threshold beforehand |
| The new model went out without approval | The Registry registration status is auto-approved | Register as `PendingManualApproval` to insert a human review step |

In the next post we do a comprehensive review of all of Week 8: data/model quality drift, bias and explainability drift (Clarify), operational monitoring (CloudWatch/X-Ray), and retraining and redeployment.

## 📖 Glossary

- **Closed loop**: An operations structure that goes around by itself: detect → trigger → retrain → redeploy → detect again.
- **Event-based trigger**: A method that starts retraining only when an event such as a drift or performance violation occurs, not at a fixed time.
- **SageMaker Pipelines**: An ML workflow service that runs preprocessing, training, evaluation, and registration steps together. The center of retraining automation.
- **ConditionStep**: A conditional branching step that runs the next step only when the evaluation metric exceeds the criteria. A safeguard against performance regressions.
- **Model Registry**: A repository that manages model versions as a catalog and assigns an approval status (Approved/PendingManualApproval, etc.).
- **Production variant**: A model slot that coexists within one endpoint. Weights divide the traffic share.
- **A/B testing**: A method that divides traffic with variant weights to compare the new model's actual outcomes. The new response goes to users.
- **Shadow testing**: A method that sends a copy of production traffic to the new model but only records the response. Zero user impact.
- **Canary / linear shift**: Gradual shift methods that move traffic to the new version a small amount first / in steps of a fixed percentage.
- **Deployment guardrails**: A safe deployment mechanism that attaches CloudWatch alarm-based automatic rollback to a Blue/Green or canary shift.

---

## 📝 Practice Questions

**Question 1.** In a domain where data changes quickly but there are also many periods with no change, which retraining trigger is most appropriate to respond to performance degradation while minimizing retraining cost?

A) Unconditionally retrain every hour  
B) Event-based retraining triggered by Model Monitor drift/performance violations  
C) Never retrain the model  
D) Retrain once a year  

**Answer: B**  
Explanation: Retraining only when a drift/performance violation event occurs avoids unnecessary retraining cost in periods with no change while responding immediately to degradation. A wastes resources in periods with no change, C leaves drift unaddressed, and D responds too slowly to rapid change.

---

**Question 2.** You want to validate a new model version with real production traffic without affecting users in any way. To only record the new model's responses and not return them to users, what should you use?

A) A/B testing (50:50 traffic split)  
B) Shadow testing  
C) Full Blue/Green cutover  
D) Deploy the new model directly to 100% of traffic  

**Answer: B**  
Explanation: Shadow testing sends a copy of production traffic to the new model to run inference and record, but does not return the response to users, so user impact is zero. In A the new model's response actually goes out to some users, and in C and D the new model serves users directly, which carries risk.

---

**Question 3.** In a SageMaker Pipelines retraining pipeline, how do you block automatic deployment when the newly trained model's evaluation accuracy is below the threshold?

A) Skip the evaluation step  
B) Use a ConditionStep to register in the Model Registry only when accuracy meets the threshold  
C) Always register the new model  
D) Delete the endpoint  

**Answer: B**  
Explanation: Using a ConditionStep to register the model only when the evaluation metric passes the criteria (if_steps) and not register it otherwise automatically prevents performance regressions. A removes validation and is risky, in C even a bad model gets deployed, and D is an unrelated action that interrupts the service.

---

**Question 4.** In A/B testing, what is SageMaker's mechanism for splitting traffic between the existing model and the new model?

A) Two separate endpoints, with the client branching directly  
B) Put multiple production variants on one endpoint and distribute traffic by weight  
C) S3 bucket policy  
D) IAM role separation  

**Answer: B**  
Explanation: SageMaker performs A/B testing by putting multiple production variants on one endpoint and splitting the traffic share with `initial_weight`, and since the weights can be adjusted in real time, gradual rollout is possible. A increases complexity on the client side, and C and D are unrelated to traffic distribution.

---

**Question 5.** What is the most appropriate order for the automation chain from drift detection to the start of retraining?

A) Model Monitor violation → CloudWatch Alarm → EventBridge/Lambda → SageMaker Pipeline execution  
B) S3 upload → DynamoDB → manual retraining  
C) X-Ray trace → Clarify → delete the endpoint  
D) CloudWatch Logs → retraining completes with SNS alone  

**Answer: A**  
Explanation: The standard automation chain is: Model Monitor sends the violation as a CloudWatch metric, the alarm goes into ALARM, and an EventBridge rule or Lambda triggers the SageMaker Pipeline retraining run. B is manual, C is an unrelated combination of services, and in D retraining is not completed by an SNS notification alone.

---
