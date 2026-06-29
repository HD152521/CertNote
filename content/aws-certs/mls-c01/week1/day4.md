# Day 4 - 데이터 레이블링: SageMaker Ground Truth·액티브 러닝·레이블 품질

지도학습 모델의 천장은 알고리즘이 아니라 **레이블 품질**이 정한다. 레이블이 틀리면 아무리 좋은 모델도 틀린 답을 학습한다("garbage in, garbage out"). 그런데 수십만 장의 이미지를 사람이 일일이 라벨링하는 비용은 막대하다. Specialty는 "이 레이블링 요구를 어떻게 싸고 정확하게?"를 묻고, 답의 중심에 SageMaker Ground Truth가 있다.

오늘은 ① Ground Truth의 구조와 워크포스 선택, ② 비용을 줄이는 자동 레이블링(액티브 러닝), ③ 레이블 품질을 보장하는 합의(consensus) 기법을 다룬다.

## SageMaker Ground Truth: 레이블링 워크플로우

Ground Truth는 레이블링 작업(job)을 ① 입력 데이터(S3), ② 레이블링 태스크 유형, ③ 워크포스(누가 라벨링하나), ④ 라벨링 UI 템플릿으로 구성한다. 결과는 표준화된 **augmented manifest**(JSON Lines) 형식으로 나와 바로 학습에 쓸 수 있다.

지원 태스크 유형: 이미지 분류·바운딩 박스(객체 탐지)·시맨틱 세그멘테이션·텍스트 분류·개체명 인식·비디오 등.

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
        "WorkteamArn": private_workteam_arn,        # 워크포스 선택 (아래 표)
        "PreHumanTaskLambdaArn": prehuman_lambda,
        "TaskTitle": "Draw boxes around cats and dogs",
        "NumberOfHumanWorkersPerDataObject": 3,     # 한 객체를 3명이 라벨링 → 합의
        "TaskTimeLimitInSeconds": 300,
    },
)
```

워크포스(누가 라벨링하나)는 데이터 민감도와 비용으로 선택한다.

| 워크포스 | 특징 | 적합한 데이터 |
|---------|------|--------------|
| **Amazon Mechanical Turk** | 대규모·저비용 공개 작업자 | 민감하지 않은 공개 데이터, 빠른 대량 |
| **Private** | 사내 직원 등 신뢰 그룹 | 기밀·규제 데이터(의료·금융) |
| **Vendor** | AWS Marketplace의 전문 벤더 | 전문 지식 필요(의료 영상 판독 등) |

> 💡 **관련 이론**: 민감 데이터(환자 영상, PII)를 Mechanical Turk 같은 공개 워크포스에 노출하면 컴플라이언스 위반이다. 이런 경우 반드시 Private 워크포스(사내) 또는 신뢰할 수 있는 Vendor를 쓴다. Specialty는 "의료/금융 등 민감 데이터의 레이블링 워크포스?"를 자주 묻고 답은 거의 항상 Private 또는 Vendor다. 비용과 규모만 보고 Mechanical Turk를 고르면 함정에 빠진다.

## 액티브 러닝: 자동 레이블링으로 비용 절감

Ground Truth의 핵심 비용 절감 기능이 **automated data labeling(액티브 러닝)**이다. 동작 원리:

1. 사람이 일부 데이터를 라벨링한다(seed).
2. 그 레이블로 모델을 학습한다.
3. 모델이 전체 데이터에 예측을 매기고, **확신도가 높은 것은 자동 레이블**로 채택한다.
4. **확신도가 낮은(모호한) 것만** 다시 사람에게 보낸다.
5. 사람이 라벨링한 새 데이터로 모델을 다시 학습하며 반복한다.

핵심 통찰: 모델이 헷갈려 하는 경계 사례에 사람의 노동을 집중하면, 전체 데이터의 일부만 사람이 라벨링해도 높은 품질을 얻는다.

```python
# create_labeling_job에 LabelingJobAlgorithmsConfig를 추가하면 액티브 러닝 활성화
labeling_algorithm = {
    "LabelingJobAlgorithmsConfig": {
        # 태스크 유형에 맞는 내장 알고리즘 ARN (이미지 분류 예)
        "LabelingJobAlgorithmSpecificationArn":
            "arn:aws:sagemaker:us-east-1:027400017018:labeling-job-algorithm-specification/image-classification"
    }
}
# 확신도 높은 객체는 모델이 자동 레이블, 모호한 객체만 사람에게 라우팅 → 비용↓
```

> 💡 **관련 이론**: 액티브 러닝(active learning)은 "모든 데이터가 똑같이 학습에 유용하진 않다"는 전제에서 출발한다. 모델이 이미 확신하는 샘플은 추가 레이블의 정보 가치가 낮고, 결정 경계 근처의 모호한 샘플(uncertainty가 높은 샘플)이 가장 정보량이 크다. 이 모호한 샘플만 골라 사람에게 묻는 전략을 **uncertainty sampling**이라 한다. 데이터가 많고 라벨링 예산이 빠듯할수록 효과가 크다.

## 레이블 품질 보장: 합의와 검증

사람도 틀린다. 한 명의 라벨러는 실수·편향·피로로 오류를 낸다. Ground Truth는 품질을 위해 여러 장치를 둔다.

- **합의(consensus)**: `NumberOfHumanWorkersPerDataObject`를 2~5로 두면 같은 객체를 여러 명이 라벨링하고, 결과를 종합(다수결·가중)해 최종 레이블을 정한다.
- **레이블 통합(annotation consolidation)**: 여러 답을 통합하는 로직. 기본 제공되며 커스텀 Lambda로 교체 가능.
- **품질 검증 워크플로우**: 레이블링 결과를 별도 워크포스가 검토·수정.

```python
# 합의: 1개 객체를 3명이 라벨링 → 통합 알고리즘이 최종 레이블 산출
"NumberOfHumanWorkersPerDataObject": 3,
# 통합 로직(기본 다수결) 또는 커스텀 consolidation Lambda 지정 가능
"AnnotationConsolidationConfig": {
    "AnnotationConsolidationLambdaArn": consolidation_lambda_arn
}
```

레이블 품질을 측정하는 지표로 **inter-annotator agreement**(라벨러 간 일치도, 예: Cohen's kappa)가 있다. 일치도가 낮으면 작업 지침(guideline)이 모호하거나 태스크가 본질적으로 어렵다는 신호다.

> 💡 **관련 이론**: 레이블 노이즈는 모델 성능의 상한을 직접 깎는다. 합의 기반 레이블링은 무작위 오류를 다수결로 상쇄해 노이즈를 줄이지만, 모든 라벨러가 같은 방향으로 틀리는 **체계적 편향**(예: 모호한 지침)은 합의로도 못 잡는다. 그래서 명확한 라벨링 가이드라인과 golden set(정답이 알려진 샘플)으로 라벨러를 검증하는 절차가 함께 필요하다. 비용은 정확도·라벨러 수와 트레이드오프이며, 액티브 러닝으로 사람 라벨링 양 자체를 줄이는 것이 비용·품질을 동시에 잡는 정석이다.

## 레이블링 대안: 데이터가 정말 다 필요한가

레이블링 전에 물어야 할 질문도 있다. ① 사전학습 모델 + 전이학습으로 적은 레이블만 필요한가? ② 데이터 증강(augmentation)으로 기존 레이블을 늘릴 수 있나? ③ 약지도학습(weak supervision)으로 휴리스틱 레이블을 쓸 수 있나? Specialty는 "레이블링 비용을 줄이는 방법"을 종종 묻고, 액티브 러닝·전이학습이 정답으로 나온다.

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
