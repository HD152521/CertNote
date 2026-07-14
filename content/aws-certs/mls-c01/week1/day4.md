# Day 4 - Data Labeling: SageMaker Ground Truth·Active Learning·Label Quality

The ceiling on supervised learning models isn't set by algorithms—it's set by **label quality**. If labels are wrong, even the best model learns the wrong answer ("garbage in, garbage out"). Yet manually labeling hundreds of thousands of images is prohibitively expensive. Specialty asks: "How do we label this cost-effectively and accurately?" and the answer centers on SageMaker Ground Truth.

Today we cover: ① Ground Truth workflow and workforce choices, ② cost reduction via automated labeling (active learning), and ③ label quality assurance through consensus mechanisms.

## SageMaker Ground Truth: Labeling Workflow

Ground Truth structures a labeling job as ① input data (S3), ② task type, ③ workforce (who labels?), and ④ labeling UI template. Output comes as standardized **augmented manifest** (JSON Lines) ready for training.

Supported task types: image classification, bounding box (object detection), semantic segmentation, text classification, named entity recognition, video, etc.

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
        "WorkteamArn": private_workteam_arn,        # Workforce choice (see table)
        "PreHumanTaskLambdaArn": prehuman_lambda,
        "TaskTitle": "Draw boxes around cats and dogs",
        "NumberOfHumanWorkersPerDataObject": 3,     # Each object labeled by 3 people → consensus
        "TaskTimeLimitInSeconds": 300,
    },
)
```

Choose workforce based on data sensitivity and cost.

| Workforce | Characteristics | Best For |
|-----------|---|-----|
| **Amazon Mechanical Turk** | Large-scale, low-cost public workers | Non-sensitive public data, fast bulk operations |
| **Private** | In-house staff or trusted group | Confidential/regulated data (healthcare, finance) |
| **Vendor** | AWS Marketplace specialists | Expert knowledge required (medical imaging interpretation) |

> 💡 **Related Theory**: Exposing sensitive data (patient images, PII) to public workforces like Mechanical Turk violates compliance. In such cases, use Private workforce (in-house) or a trusted Vendor. Specialty frequently asks "labeling workforce for sensitive data?" and the answer is almost always Private or Vendor. Choosing Mechanical Turk for cost and scale alone is a Specialty trap.

## Active Learning: Cost Reduction via Automated Labeling

The key cost-reduction feature of Ground Truth is **automated data labeling** (active learning). How it works:

1. Humans label some data (seed).
2. Train a model on those labels.
3. Model predicts on all data; adopt predictions with **high confidence as automatic labels**.
4. Route only **low-confidence (ambiguous) predictions** back to humans.
5. Humans label the new data; retrain the model and repeat.

Key insight: By concentrating human labor on boundary cases the model finds ambiguous, you achieve high quality while labeling only a fraction of the full dataset.

```python
# Add LabelingJobAlgorithmsConfig to create_labeling_job to enable active learning
labeling_algorithm = {
    "LabelingJobAlgorithmsConfig": {
        # Built-in algorithm ARN for task type (image classification example)
        "LabelingJobAlgorithmSpecificationArn":
            "arn:aws:sagemaker:us-east-1:027400017018:labeling-job-algorithm-specification/image-classification"
    }
}
# High-confidence objects auto-labeled by model, ambiguous routed to humans → cost ↓
```

> 💡 **Related Theory**: Active learning begins with "not all data is equally useful for learning." Samples the model already feels confident about have low information value for additional labels; the highest information value comes from ambiguous samples near the decision boundary (high uncertainty). Focusing only on those ambiguous samples is called **uncertainty sampling**. The larger the dataset and the tighter the labeling budget, the bigger the benefit.

## Ensuring Label Quality: Consensus and Validation

Humans make mistakes. One labeler can err from carelessness, bias, fatigue. Ground Truth uses several mechanisms to protect quality.

- **Consensus**: Set `NumberOfHumanWorkersPerDataObject` to 2–5; the same object is labeled by multiple people and results are consolidated (majority vote, weighted).
- **Annotation consolidation**: Logic to combine multiple answers. Built-in defaults exist; swap in custom Lambda if needed.
- **Quality review workflow**: A separate workforce reviews and corrects labeling results.

```python
# Consensus: 1 object labeled by 3 people → consolidation algo produces final label
"NumberOfHumanWorkersPerDataObject": 3,
# Consolidation logic (default majority vote) or custom Lambda
"AnnotationConsolidationConfig": {
    "AnnotationConsolidationLambdaArn": consolidation_lambda_arn
}
```

A metric for label quality is **inter-annotator agreement** (e.g., Cohen's kappa). Low agreement signals either vague instructions or an inherently difficult task.

> 💡 **Related Theory**: Label noise directly caps model performance. Consensus-based labeling reduces random errors via majority vote but can't catch **systematic bias** (e.g., vague instructions that make all labelers wrong the same way). Clear labeling guidelines and validation via golden set (samples with known answers) are essential. Cost trade-offs exist between accuracy, number of labelers, and active learning to reduce the amount of human labeling itself is the principled way to optimize both cost and quality.

## Labeling Alternatives: Do You Really Need All That Data?

Before labeling, ask: ① Can a pre-trained model + transfer learning work with fewer labels? ② Can data augmentation stretch existing labels further? ③ Can weak supervision (heuristic labels) be used? Specialty often asks "how to cut labeling costs?" and active learning + transfer learning are frequent correct answers.

## 📝 연습 문제

**문제 1.** 50만 장의 환자 X-ray를 레이블링해야 한다. 데이터는 PII를 포함한 의료 정보다. 워크포스 선택으로 가장 적절한 것은?

A) Private 워크포스(사내 신뢰 그룹) 또는 검증된 Vendor  
B) Amazon Mechanical Turk (저비용 대규모)  
C) 워크포스 없이 자동으로만 처리  
D) 공개 인터넷에 데이터를 올려 크라우드소싱  

**정답: A**  
해설: 의료 PII 같은 민감·규제 데이터는 컴플라이언스상 공개 워크포스(Mechanical Turk)나 공개 크라우드소싱에 노출할 수 없다. 사내 Private 워크포스 또는 NDA·전문성을 갖춘 Vendor를 써야 한다. 자동만으로는 초기 seed 레이블과 모호 사례 처리가 불가능하다.

---

**문제 2.** 100만 개 이미지에 대한 레이블링 예산이 빠듯하다. 사람의 라벨링 노동을 가장 정보 가치가 큰 샘플에 집중해 전체 비용을 줄이는 Ground Truth 기능은?

A) 모든 이미지를 사람이 라벨링  
B) 워크포스를 Mechanical Turk로 변경  
C) Automated data labeling(액티브 러닝) — 모호한 샘플만 사람에게 라우팅  
D) 데이터를 무작위로 절반만 라벨링  

**정답: C**  
해설: 액티브 러닝은 모델이 확신하는 샘플은 자동 레이블로 채택하고, 결정 경계 근처의 모호한(uncertainty 높은) 샘플만 사람에게 보내 라벨링 노동을 가장 정보 가치 큰 곳에 집중시켜 비용을 줄인다. 무작위 절반 라벨링은 정보 가치를 고려하지 않아 품질 손실이 크고, 워크포스 변경은 민감도·품질 문제를 야기할 수 있다.

---

**문제 3.** 라벨링 결과의 무작위 사람 오류를 줄이기 위해 동일 객체를 여러 명이 라벨링하고 종합하려 한다. Ground Truth에서 설정하는 항목은?

A) input.manifest의 파일 개수  
B) NumberOfHumanWorkersPerDataObject를 2~5로 설정하고 합의 통합 사용  
C) TaskTimeLimitInSeconds를 늘림  
D) S3OutputPath 변경  

**정답: B**  
해설: 한 객체당 라벨러 수를 늘리고(NumberOfHumanWorkersPerDataObject) annotation consolidation으로 결과를 종합하면 다수결 등으로 무작위 오류를 상쇄해 레이블 품질을 높인다. 파일 개수·작업 시간·출력 경로는 합의 기반 품질 향상과 직접 관련이 없다.

---

**문제 4.** 합의(consensus) 기반 레이블링으로도 줄이기 어려운 레이블 품질 문제는?

A) 모호한 가이드라인 때문에 모든 라벨러가 같은 방향으로 틀리는 체계적 편향  
B) 일부 라벨러의 무작위 실수  
C) 한 라벨러의 피로로 인한 오류  
D) 라벨러 간 사소한 의견 차이  

**정답: A**  
해설: 합의는 서로 독립적인 무작위 오류를 다수결로 상쇄하지만, 가이드라인이 모호해 모든 라벨러가 동일하게 틀리는 체계적 편향은 다수결로도 잡히지 않는다. 이 경우 명확한 지침과 golden set 검증이 필요하다. 나머지 보기는 모두 무작위 오류라 합의로 완화된다.

---

**문제 5.** 대량 이미지 분류 모델을 위한 레이블링 비용을 근본적으로 줄이는 접근으로 가장 부적절한 것은?

A) 사전학습 모델 + 전이학습으로 적은 레이블만 사용  
B) 액티브 러닝으로 사람 라벨링 양 자체를 축소  
C) 데이터 증강으로 기존 레이블을 늘림  
D) 민감 데이터를 무조건 Mechanical Turk에 올려 단가만 낮춤  

**정답: D**  
해설: 단가만 보고 민감 데이터를 공개 워크포스에 올리는 것은 컴플라이언스 위반이자 품질 위험으로, 비용 절감의 올바른 방법이 아니다. 전이학습·액티브 러닝·데이터 증강은 모두 필요한 레이블 양 자체를 줄이거나 효율을 높이는 정석적 비용 절감 전략이다.

---
