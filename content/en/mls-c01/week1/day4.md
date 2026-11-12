# Day 4 - Data Labeling: SageMaker Ground Truth, Active Learning, Label Quality

## 📌 Key Takeaways

- The ceiling of a supervised model is set not by the algorithm but by **label quality**. "Garbage in, garbage out."
- A Ground Truth labeling job consists of four things: **input data, task type, workforce, and UI template**.
- For the workforce: **Private or Vendor for sensitive data**; Mechanical Turk for public, high-volume, low-cost work. Mechanical Turk is unsuitable for sensitive data.
- **Active learning (automated data labeling)** — the model auto-labels what it is confident about, and only the ambiguous items go to humans. This is the standard play for cutting cost.
- **Consensus** reduces random errors but cannot catch **systematic bias**. You need clear guidelines and a golden set.

## SageMaker Ground Truth: The Labeling Workflow

The cost of having humans hand-label hundreds of thousands of images is hard to bear. The Specialty exam asks "how do you attach labels cheaply and accurately?", and Ground Truth sits at the center of the answer.

Ground Truth composes a labeling job from four pieces.

| Component | Description |
|---|---|
| Input data | Specified by a manifest (JSON Lines) in S3 |
| Task type | Image classification, bounding box, semantic segmentation, text classification, named entity recognition, video, etc. |
| Workforce | Who will do the labeling (table below) |
| Labeling UI | A built-in template or a custom HTML template |

The output comes in the standard **augmented manifest** (JSON Lines) format, ready to use directly for training.

```python
import boto3
sm = boto3.client("sagemaker")

sm.create_labeling_job(
    LabelingJobName="cat-dog-bbox",
    LabelAttributeName="annotations",
    InputConfig={"DataSource": {"S3DataSource": {
        "ManifestS3Uri": "s3://my-lake/labeling/input.manifest"}}},
    OutputConfig={"S3OutputPath": "s3://my-lake/labeling/output/"},
    RoleArn=role_arn,
    LabelCategoryConfigS3Uri="s3://my-lake/labeling/labels.json",
    HumanTaskConfig={
        "WorkteamArn": private_workteam_arn,        # workforce selection (table below)
        "PreHumanTaskLambdaArn": prehuman_lambda,
        "TaskTitle": "Draw boxes around cats and dogs",
        "NumberOfHumanWorkersPerDataObject": 3,     # 3 workers per object → consensus
        "TaskTimeLimitInSeconds": 300,
    },
)
```

### Label Shape by Task Type

What humans do, and the shape of the result, differ by task type. Reading "what must be attached" in the passage determines the type.

| Task type | What humans do | Resulting label | Typical use |
|---|---|---|---|
| Image classification | Pick one category for a photo | Class label | Defective/normal judgment |
| Bounding box | Draw a rectangle around each object | Coordinates + class | Object detection |
| Semantic segmentation | Paint regions pixel by pixel | Pixel mask | Medical imaging, autonomous driving |
| Text classification | Assign a category to a document | Class label | Sentiment analysis, inquiry classification |
| Named entity recognition (NER) | Mark spans in a sentence | Offsets + entity type | Document information extraction |
| Video frame / tracking | Mark and track objects frame by frame | Time axis + coordinates | Action recognition |

- The higher up the table, the shorter the time per task; the further down, the more expensive. **Segmentation is overwhelmingly more expensive than classification.**
- To cut cost, first ask "do we really need segmentation, or are bounding boxes enough?"

### Workforce Selection Table

Choose by looking at data sensitivity and cost together.

| Workforce | Characteristics | Suitable when | Prohibited when |
|---|---|---|---|
| **Amazon Mechanical Turk** | Large public worker pool, low cost | Non-sensitive public data, fast high-volume processing | Regulated data such as PII, medical, or financial |
| **Private** | Internal staff or a trusted group | Confidential or regulated data (medical, financial) | When you lack the staff and cannot process high volume |
| **Vendor** | Specialist companies on AWS Marketplace | Expert knowledge required (reading medical images) | When the budget is extremely limited |

Exposing sensitive data such as patient imaging or PII to a public workforce like Mechanical Turk is a compliance violation. In that case you must use a Private workforce (internal) or a Vendor with NDAs and expertise. When the Specialty exam asks "which labeling workforce for sensitive data?", the answer is almost always Private or Vendor.

> ⚠️ **Pitfall**: Choosing Mechanical Turk by looking only at cost and scale is the classic trap in this area. If the passage contains even one of the words "patient," "PII," "regulated," or "confidential," immediately eliminate the public-workforce options.

## Active Learning: Cutting Costs with Automated Labeling

Ground Truth's core cost-saving feature is **automated data labeling** (active learning). The sequence is as follows.

```
1. Humans label a portion (the seed)
        ▼
2. Train a model on those labels
        ▼
3. The model predicts over the full dataset
        ├─ High confidence → adopted as an automatic label (no human involvement)
        └─ Low confidence  → routed to humans
                          ▼
4. Humans label only the ambiguous items → return to step 2 and repeat
```

- Key insight: by concentrating human labor on the **samples near the decision boundary** that the model finds ambiguous, you get high quality while labeling only a fraction of the whole.
- The larger the dataset and the tighter the labeling budget, the greater the payoff.

```python
# Adding LabelingJobAlgorithmsConfig to create_labeling_job turns on active learning
labeling_algorithm = {
    "LabelingJobAlgorithmsConfig": {
        # Built-in algorithm ARN for the task type (image classification example)
        "LabelingJobAlgorithmSpecificationArn":
            "arn:aws:sagemaker:us-east-1:027400017018:labeling-job-algorithm-specification/image-classification"
    }
}
# High-confidence objects are auto-labeled by the model; only ambiguous ones go to humans → lower cost
```

Active learning starts from the premise that "not all data is equally useful for training." For samples the model is already confident about, an additional label has low information value, while ambiguous samples near the decision boundary (high-uncertainty samples) have the highest information value. The approach of focusing only on those ambiguous samples is called **uncertainty sampling**.

## Guaranteeing Label Quality: Consensus and Verification

Humans make mistakes. A single labeler can be wrong because of carelessness, bias, or fatigue. Ground Truth protects quality with several mechanisms.

- **Consensus**: Set `NumberOfHumanWorkersPerDataObject` to 2-5 so that several workers label the same object, and combine the results (majority vote or weighted).
- **Annotation consolidation**: The logic that merges multiple answers into one. A built-in default exists, and you can replace it with a custom Lambda if needed.
- **Quality review workflow**: A separate workforce reviews and corrects the results.

```python
# Consensus: 3 workers label each object → the consolidation algorithm produces the final label
"NumberOfHumanWorkersPerDataObject": 3,
# Consolidation logic (majority vote by default) or a custom Lambda
"AnnotationConsolidationConfig": {
    "AnnotationConsolidationLambdaArn": consolidation_lambda_arn
}
```

One metric for measuring label quality is **inter-annotator agreement (e.g., Cohen's kappa)**. Low agreement is a signal that the guidelines are ambiguous or the task itself is inherently difficult.

### Response Table by Error Type

| Error type | Example | Caught by consensus? | Correct response |
|---|---|---|---|
| Random slip | One worker draws a box wrongly from fatigue | Caught | Consensus (majority vote) |
| Individual bias | One labeler is unusually lenient | Mostly caught | Consensus + per-labeler quality tracking |
| **Systematic bias** | Guidelines are ambiguous, so everyone errs in the same direction | **Not caught** | Clarify guidelines + golden set validation |
| Task difficulty | Edge cases are inherently ambiguous | Partially | Add edge-case examples to the guidelines, use a specialist Vendor |

Label noise directly lowers the ceiling of model performance. Consensus-based labeling reduces random errors through majority vote but cannot catch **systematic bias** (all labelers erring in the same direction because of ambiguous guidelines). A procedure that validates against clear labeling guidelines and a **golden set** (samples whose correct answers are already known) is essential. There is a cost trade-off among accuracy, number of labelers, and active learning, and reducing the amount of human labeling itself is the standard approach that improves cost and quality together.

> ⚠️ **Pitfall**: If you memorize only "more labelers means better quality," you will get questions about systematic bias wrong. If the options include "clarify the guidelines" or "golden set," those are the likely answers.

## Labeling Alternatives: Do You Really Need All That Data?

Before starting labeling, check three things first.

1. Can **a pretrained model + transfer learning** do the job with only a few labels?
2. Can **data augmentation** stretch the existing labels further?
3. **Weak supervision** — can heuristic rules produce rough labels?

When the Specialty exam asks "how do you reduce labeling cost?", **active learning + transfer learning** is the candidate answer.

### Comparison of Cost-Reduction Measures

| Measure | What it reduces | Price paid |
|---|---|---|
| Active learning | Number of samples humans must see | Initial seed labels are still needed |
| Transfer learning | Total number of labels needed | Less effective if the domain is too different |
| Data augmentation | Amount of new label collection needed | Avoid transformations that break the label |
| Weak supervision | Cost of obtaining initial labels | Noise created by the rules gets mixed in |
| Lowering workforce unit price | Labor cost | Not applicable to sensitive data |

## Human Review in Production: Amazon A2I

Labeling is needed not only before training. There is also a flow in which predictions the model is unsure of in production are handed to humans for review.

```
Inference request ─▶ Model prediction ─▶ Confidence threshold check
                              ├─ At or above threshold → respond as is
                              └─ Below threshold → human review queue (A2I)
                                                    ▼
                                          Store review result → accumulate as retraining data
```

- **Amazon Augmented AI (A2I)** is the service that builds this "human review loop." It shares the workforce concept with Ground Truth.
- The value is twofold. (1) Humans correct the quality of low-confidence predictions, and (2) those review results become high-quality labels for the next retraining.
- The idea is the same as active learning. The principle of sending **only the ambiguous items to humans** applies at both the training stage (Ground Truth) and the production stage (A2I).

Choosing Ground Truth for a passage saying "humans review low-confidence predictions in production" feels off. Ground Truth is a tool for attaching labels to a training dataset, and inserting human review into inference results is the place for A2I.

Tomorrow we synthesize all of Week 1 (lifecycle, storage, ingestion, labeling) into a single data pipeline.

## 📖 Glossary

- **Labeling job**: The Ground Truth execution unit that defines the task of attaching ground truth to data.
- **Manifest**: A JSON Lines file listing the targets to label. One line is one object.
- **Augmented manifest**: An output file in which the label results are appended to the original information. It can be used directly as training input.
- **Workforce**: The group of people who actually perform the labeling. Three kinds: Mechanical Turk, Private, and Vendor.
- **Active learning**: A labeling strategy that auto-processes what the model is confident about and sends only the ambiguous items to humans.
- **Uncertainty sampling**: Selecting for labeling the samples the model is most confused about first.
- **Consensus**: The procedure of having several people label the same object and producing a single answer by majority vote or similar.
- **Annotation consolidation**: The consolidation logic that merges the answers of multiple labelers into one.
- **Golden set**: A validation sample whose correct answers are already known. Used to check the quality of labelers and guidelines.
- **Systematic bias**: An error where everyone is wrong in the same direction. Majority vote does not filter it out.

## 📝 Practice Questions

**Question 1.** You must label 500,000 patient X-rays. The data is medical information containing PII. What is the most appropriate workforce choice?

A) A Private workforce (trusted internal group) or a vetted Vendor  
B) Amazon Mechanical Turk (low cost, large scale)  
C) Fully automated processing with no workforce  
D) Post the data on the public internet and crowdsource it  

**Answer: A**  
Explanation: Sensitive, regulated data such as medical PII cannot be exposed to a public workforce (Mechanical Turk) or public crowdsourcing for compliance reasons. You must use an internal Private workforce or a Vendor with NDAs and expertise. Automation alone cannot handle the initial seed labels or ambiguous cases.

---

**Question 2.** The labeling budget for 1 million images is tight. Which Ground Truth feature concentrates human labeling effort on the highest-information samples to reduce total cost?

A) Have humans label every image  
B) Switch the workforce to Mechanical Turk  
C) Automated data labeling (active learning) — route only ambiguous samples to humans  
D) Randomly label only half of the data  

**Answer: C**  
Explanation: Active learning adopts automatic labels for samples the model is confident about and sends only the ambiguous (high-uncertainty) samples near the decision boundary to humans, concentrating labeling effort where information value is highest and cutting cost. Randomly labeling half ignores information value and loses significant quality, and switching workforces can raise sensitivity and quality problems.

---

**Question 3.** To reduce random human error in labeling output, you want multiple workers to label the same object and have the results aggregated. What do you configure in Ground Truth?

A) The number of files in input.manifest  
B) Set NumberOfHumanWorkersPerDataObject to 2-5 and use consensus consolidation  
C) Increase TaskTimeLimitInSeconds  
D) Change the S3OutputPath  

**Answer: B**  
Explanation: Increasing the number of labelers per object (NumberOfHumanWorkersPerDataObject) and aggregating results via annotation consolidation cancels random errors through majority voting and improves label quality. File count, task time limit, and output path have no direct bearing on consensus-based quality improvement.

---

**Question 4.** Which label quality problem is hard to reduce even with consensus-based labeling?

A) Systematic bias where all labelers err in the same direction because of ambiguous guidelines  
B) Random mistakes by some labelers  
C) Errors caused by one labeler's fatigue  
D) Minor differences of opinion between labelers  

**Answer: A**  
Explanation: Consensus cancels mutually independent random errors through majority voting, but systematic bias — where ambiguous guidelines make all labelers err identically — is not caught even by majority vote. That case requires clear guidelines and golden-set validation. The other options are all random errors, which consensus mitigates.

---

**Question 5.** Which of the following is the LEAST appropriate approach to fundamentally reducing labeling costs for a large-scale image classification model?

A) Use a pretrained model + transfer learning to need fewer labels  
B) Use active learning to shrink the amount of human labeling itself  
C) Use data augmentation to multiply existing labels  
D) Dump sensitive data onto Mechanical Turk unconditionally just to lower the unit price  

**Answer: D**  
Explanation: Putting sensitive data on a public workforce purely for unit cost is a compliance violation and a quality risk — not a legitimate cost-reduction method. Transfer learning, active learning, and data augmentation are all standard cost-saving strategies that reduce the amount of labels needed or raise efficiency.

---
