# Day 4 - Data Labeling: SageMaker Ground Truth, Active Learning, Label Quality

The ceiling of a supervised model is set not by the algorithm but by **label quality**. If the labels are wrong, even the best model learns wrong answers ("garbage in, garbage out"). Yet the cost of having humans hand-label hundreds of thousands of images is enormous. The Specialty exam asks "how do you meet this labeling requirement cheaply and accurately?", and SageMaker Ground Truth sits at the center of the answer.

Today we cover (1) the structure of Ground Truth and workforce selection, (2) automated labeling (active learning) that cuts costs, and (3) consensus techniques that guarantee label quality.

## SageMaker Ground Truth: The Labeling Workflow

Ground Truth composes a labeling job from (1) input data (S3), (2) a labeling task type, (3) a workforce (who does the labeling), and (4) a labeling UI template. The output comes in the standardized **augmented manifest** (JSON Lines) format, ready to use directly for training.

Supported task types: image classification, bounding box (object detection), semantic segmentation, text classification, named entity recognition, video, and more.

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
        "NumberOfHumanWorkersPerDataObject": 3,     # 3 workers label each object → consensus
        "TaskTimeLimitInSeconds": 300,
    },
)
```

The workforce (who does the labeling) is chosen based on data sensitivity and cost.

| Workforce | Characteristics | Suitable data |
|---------|------|--------------|
| **Amazon Mechanical Turk** | Large-scale, low-cost public workers | Non-sensitive public data, fast high volume |
| **Private** | Trusted groups such as internal employees | Confidential or regulated data (medical, financial) |
| **Vendor** | Professional vendors from AWS Marketplace | Tasks requiring expertise (e.g., medical image reading) |

> 💡 **Related theory**: Exposing sensitive data (patient imaging, PII) to a public workforce like Mechanical Turk is a compliance violation. In such cases you must use a Private workforce (internal) or a trusted Vendor. The Specialty exam frequently asks "which labeling workforce for sensitive medical/financial data?", and the answer is almost always Private or Vendor. Choosing Mechanical Turk based on cost and scale alone is walking into the trap.

## Active Learning: Cutting Costs with Automated Labeling

Ground Truth's core cost-saving feature is **automated data labeling (active learning)**. How it works:

1. Humans label a portion of the data (the seed).
2. A model is trained on those labels.
3. The model scores predictions over the full dataset, and **high-confidence predictions are adopted as automatic labels**.
4. Only the **low-confidence (ambiguous) items** are sent back to humans.
5. The model is retrained on the newly human-labeled data, and the cycle repeats.

The key insight: by concentrating human effort on the borderline cases the model is unsure about, you achieve high quality even though humans label only a fraction of the full dataset.

```python
# Adding LabelingJobAlgorithmsConfig to create_labeling_job enables active learning
labeling_algorithm = {
    "LabelingJobAlgorithmsConfig": {
        # Built-in algorithm ARN matching the task type (image classification example)
        "LabelingJobAlgorithmSpecificationArn":
            "arn:aws:sagemaker:us-east-1:027400017018:labeling-job-algorithm-specification/image-classification"
    }
}
# High-confidence objects get auto-labeled by the model; only ambiguous objects route to humans → lower cost
```

> 💡 **Related theory**: Active learning starts from the premise that "not all data is equally useful for training." Samples the model is already confident about carry low information value for additional labels, while ambiguous samples near the decision boundary (high-uncertainty samples) carry the most information. The strategy of selecting only these ambiguous samples to ask humans about is called **uncertainty sampling**. The more data you have and the tighter the labeling budget, the greater the payoff.

## Guaranteeing Label Quality: Consensus and Verification

Humans err too. A single labeler makes mistakes from slips, bias, and fatigue. Ground Truth provides several mechanisms for quality.

- **Consensus**: Setting `NumberOfHumanWorkersPerDataObject` to 2-5 has multiple workers label the same object, and the results are aggregated (majority vote or weighted) into the final label.
- **Annotation consolidation**: The logic that merges multiple answers. Provided by default and replaceable with a custom Lambda.
- **Quality verification workflows**: A separate workforce reviews and corrects the labeling output.

```python
# Consensus: 3 workers label each object → the consolidation algorithm produces the final label
"NumberOfHumanWorkersPerDataObject": 3,
# Consolidation logic (majority vote by default), or specify a custom consolidation Lambda
"AnnotationConsolidationConfig": {
    "AnnotationConsolidationLambdaArn": consolidation_lambda_arn
}
```

A metric for measuring label quality is **inter-annotator agreement** (agreement between labelers, e.g., Cohen's kappa). Low agreement is a signal that the task guidelines are ambiguous or the task is inherently hard.

> 💡 **Related theory**: Label noise directly cuts into the upper bound of model performance. Consensus-based labeling cancels random errors through majority voting, reducing noise, but **systematic bias** — where all labelers err in the same direction (e.g., due to ambiguous guidelines) — cannot be caught by consensus. That is why you also need clear labeling guidelines and a procedure that validates labelers against a golden set (samples with known ground truth). Cost trades off against accuracy and labeler count, and reducing the amount of human labeling itself via active learning is the standard play that wins on both cost and quality.

## Labeling Alternatives: Do You Really Need All That Data?

There are questions to ask before labeling. (1) Can a pretrained model + transfer learning get by with fewer labels? (2) Can data augmentation multiply the existing labels? (3) Can weak supervision provide heuristic labels? The Specialty exam often asks "ways to reduce labeling cost," and active learning and transfer learning show up as correct answers.

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
