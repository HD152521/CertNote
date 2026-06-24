# Day 3 - AWS ML 스택 한눈에 보기

ML 문제를 판별했으니 이제 도구를 골라야 한다. AWS의 ML 관련 서비스는 수십 개라서 처음 보면 막막하다. 하지만 사실 **세 개의 층**으로 깔끔하게 정리된다. "직접 모델을 만들 거냐, 완성된 모델을 API로 호출할 거냐, 아니면 바닥 인프라부터 다룰 거냐"라는 질문에 답하면 어느 층을 써야 할지 정해진다.

오늘은 이 3층 스택 — AI 서비스, ML 플랫폼(SageMaker), 인프라 — 를 조감하고, ML 엔지니어가 각 층을 언제 선택하는지, 그리고 시험에서 "이 시나리오엔 무엇을 써야 하나"를 어떻게 판별하는지를 본다.

## AWS ML 스택의 3층 구조

```
┌─────────────────────────────────────────────────┐
│ 상위: AI 서비스 (사전 학습 모델, API 호출만)        │
│   Rekognition, Comprehend, Transcribe,           │
│   Translate, Polly, Textract, Forecast, Bedrock  │
├─────────────────────────────────────────────────┤
│ 중위: ML 플랫폼 (직접 학습·배포)                    │
│   Amazon SageMaker (AI)                          │
├─────────────────────────────────────────────────┤
│ 하위: ML 인프라 (직접 컴퓨팅 관리)                  │
│   EC2(GPU), Inferentia, Trainium, EKS, ECS, FSx  │
└─────────────────────────────────────────────────┘
```

판별 원칙은 **추상화 레벨과 통제권의 트레이드오프**다. 위로 갈수록 빠르고 쉽지만 통제권이 적고, 아래로 갈수록 자유롭지만 직접 다뤄야 할 게 많다. ML 엔지니어는 "ML 전문성이 없어도 되는 표준 작업이면 위, 커스텀 모델이 필요하면 중간, 극한의 성능·비용 최적화가 필요하면 아래"로 고른다.

> 💡 **관련 이론**: 이건 Day 1에서 본 공동 책임 모델의 ML 버전이다. AI 서비스는 모델 학습·인프라까지 AWS가 책임지고 고객은 API 호출과 데이터만, SageMaker는 모델 코드·데이터는 고객이지만 인프라 관리는 AWS가, EC2 자체 구축은 거의 모든 것을 고객이 책임진다. 추상화가 올라갈수록 책임 경계선이 위로 올라간다는 원칙이 그대로 적용된다.

## 상위: AI 서비스 — 모델 없이 ML 기능 쓰기

AI 서비스는 AWS가 미리 학습해둔 모델을 **API 호출 한 번**으로 쓰는 것이다. ML 지식이 거의 없어도 된다. 시험에 잘 나오는 매핑을 외워두면 시나리오 문제가 쉬워진다.

| 서비스 | 입력 → 출력 | 용도 |
|--------|-----------|------|
| Rekognition | 이미지/영상 → 객체·얼굴·텍스트 | 이미지 분석, 콘텐츠 검열 |
| Comprehend | 텍스트 → 감정·개체·키워드 | NLP, 감정 분석 |
| Transcribe | 음성 → 텍스트 | 음성 인식(STT) |
| Polly | 텍스트 → 음성 | 음성 합성(TTS) |
| Translate | 텍스트 → 번역 텍스트 | 기계 번역 |
| Textract | 문서 이미지 → 구조화 텍스트 | OCR, 양식 추출 |
| Forecast | 시계열 → 미래 예측 | 수요 예측 |
| Personalize | 사용자 행동 → 추천 | 추천 시스템 |
| Bedrock | 프롬프트 → 생성 결과 | 생성형 AI(LLM) |

```python
import boto3

# Comprehend로 감정 분석 — 모델 학습 0줄
comprehend = boto3.client("comprehend", region_name="ap-northeast-2")
resp = comprehend.detect_sentiment(
    Text="이 제품 정말 만족스럽고 배송도 빨랐어요!",
    LanguageCode="ko",
)
print(resp["Sentiment"])         # POSITIVE
print(resp["SentimentScore"])    # {'Positive': 0.98, ...}
```

위 코드에 학습 데이터도 모델도 없다. AWS의 사전 학습 모델을 호출만 한다. "고객 리뷰 감정을 분석하라"는 시나리오에 SageMaker로 모델을 만들겠다고 답하면 과한 선택이다 — Comprehend가 정답이다.

> 🔍 **더 깊이**: AI 서비스 중 일부는 커스터마이징이 가능하다. Comprehend는 **Custom Classification/Entity Recognition**으로 자체 라벨로 미세조정할 수 있고, Rekognition은 **Custom Labels**로 특정 도메인 객체를 학습시킬 수 있다. "표준 감정 분석이면 기본 Comprehend, 우리 회사 고유 분류 체계가 필요하면 Custom"으로 판별한다. 그래도 SageMaker 풀 커스텀보다는 훨씬 적은 노력으로 끝난다.

## 중위: SageMaker — 직접 모델을 만드는 곳

표준 AI 서비스로 안 되는 커스텀 모델이 필요하면 **Amazon SageMaker**다. 데이터 준비부터 학습·튜닝·배포·모니터링까지 ML 수명주기 전체를 담당하는 통합 플랫폼이다. MLA-C01의 사실상 주인공으로, 시험 문제 대부분이 SageMaker의 어떤 기능을 묻는다.

SageMaker가 제공하는 것을 수명주기 단계별로 보면:

- **데이터**: Data Wrangler(전처리), Feature Store(피처 저장), Ground Truth(라벨링)
- **학습**: 빌트인 알고리즘 17종, 커스텀 컨테이너, 분산 학습, Automatic Model Tuning
- **배포**: 실시간 엔드포인트, 배치 변환, 서버리스 추론, 멀티모델 엔드포인트
- **운영**: Model Monitor(드리프트), Model Registry, Pipelines(MLOps)

```python
# SageMaker는 "직접 학습"한다 — AI 서비스와 결정적 차이
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", region, "1.7-1"),
    role=role, instance_count=1, instance_type="ml.m5.xlarge",
    hyperparameters={"objective": "binary:logistic", "num_round": 100},
)
estimator.fit({"train": "s3://my-bucket/train/", "validation": "s3://my-bucket/val/"})
predictor = estimator.deploy(initial_instance_count=1, instance_type="ml.t2.medium")
```

내일(Day 4) SageMaker를 본격적으로 다룬다. 오늘은 "SageMaker는 커스텀 모델을 직접 학습·배포하는 중간 층"이라는 위치만 잡으면 된다.

## 하위: ML 인프라 — 성능과 비용을 직접 깎기

SageMaker가 추상화하는 그 아래에는 실제 컴퓨팅이 있다. 극한의 성능·비용 최적화가 필요하거나 기존 EKS/ECS 위에 ML을 얹어야 할 때 이 층을 직접 다룬다.

| 칩/리소스 | 용도 | 특징 |
|----------|------|------|
| EC2 GPU (P5/P4, G5) | 학습·추론 범용 | NVIDIA GPU, 가장 유연 |
| AWS Trainium (Trn1) | 대규모 모델 학습 | AWS 자체 칩, 학습 비용↓ |
| AWS Inferentia (Inf2) | 대규모 추론 | AWS 자체 칩, 추론 비용·전력↓ |
| Elastic Inference | 추론 가속 부분 부착 | GPU 일부만 빌려 비용 절감 |
| FSx for Lustre | 고속 학습 데이터 | S3 연동 고성능 파일시스템 |

핵심 구분은 **Trainium은 학습용, Inferentia는 추론용**이라는 점이다. 추론은 학습보다 훨씬 자주(매 요청마다) 일어나므로 추론 비용 절감이 총비용에 더 크게 기여한다. 그래서 AWS가 추론 전용 칩 Inferentia를 따로 만든 것이다.

> 📚 **사례**: 대규모 추론 트래픽을 가진 서비스는 추론 비용이 학습 비용을 압도하는 경우가 많다. 모델은 한 번 학습하지만 추론은 사용자 요청마다 무한히 반복되기 때문이다. AWS가 GPU 외에 Inferentia라는 추론 전용 칩을 별도로 설계한 배경이 이것이고, 같은 모델을 GPU 대비 더 낮은 단가·전력으로 서빙해 총소유비용을 낮추는 것이 목표다. ML 엔지니어가 "학습 칩과 추론 칩을 분리해서 고른다"는 감각을 가져야 하는 이유다.

> 💡 **관련 이론**: 학습과 추론은 연산 특성이 다르다. 학습은 순전파+역전파로 그래디언트를 계산하고 큰 배치를 한 번에 처리(throughput 중심)하지만, 추론은 순전파만 하고 낮은 지연으로 작은 배치를 자주 처리(latency 중심)한다. 이 차이 때문에 Trainium(고처리량 학습)과 Inferentia(저지연 추론)를 칩 레벨에서 분리하는 것이 합리적이다.

## 시나리오로 층 고르기

시험 문제는 거의 항상 시나리오다. 판별 흐름을 정리하면:

1. **표준 작업(이미지/음성/번역/OCR/감정)인가?** → AI 서비스 (Rekognition, Comprehend...)
2. **커스텀 모델이 필요한가?** → SageMaker
3. **극한 성능·비용, 또는 기존 컨테이너 통합인가?** → EC2/Inferentia/Trainium/EKS

예: "스캔한 청구서에서 항목을 추출" → Textract. "우리 고유 제품 결함 이미지를 분류" → Rekognition Custom Labels 또는 SageMaker. "수백만 추론을 최소 비용으로" → Inferentia.

## 정리하며

오늘의 두 가지 핵심. 첫째, AWS ML 스택은 **AI 서비스(API 호출) → SageMaker(직접 학습) → 인프라(직접 컴퓨팅)**의 3층이고, 추상화 레벨과 통제권의 트레이드오프로 고른다. 둘째, 인프라 층에서 **Trainium은 학습, Inferentia는 추론**으로 칩이 분리돼 있다.

다음 글에서는 이 스택의 중심인 SageMaker를 본격적으로 파고들어, Studio·학습·추론·빌트인 알고리즘·도메인과 사용자 프로필 구조를 본다.

---

## 📝 연습 문제

**문제 1.** "고객이 남긴 영어 리뷰 텍스트의 긍정/부정 감정을 분석하라"는 표준 요구사항에 가장 적절한 AWS 서비스는?

A) SageMaker에서 감정 분석 모델을 직접 학습  
B) Amazon Comprehend의 감정 분석 API 호출  
C) EC2 GPU 인스턴스에 직접 모델 구축  
D) Amazon Polly  

**정답: B**  
해설: 표준 감정 분석은 사전 학습 모델인 Comprehend의 API 호출로 즉시 해결된다. SageMaker로 직접 학습하거나 EC2에 구축하는 것은 표준 작업에 과한 선택으로 시간·비용 낭비다. Polly는 텍스트를 음성으로 변환하는(TTS) 서비스라 감정 분석과 무관하다.

---

**문제 2.** AWS ML 스택 3층 구조에서 위로 올라갈수록(AI 서비스 방향) 나타나는 특징으로 옳은 것은?

A) 통제권이 커지고 직접 관리할 것이 많아진다  
B) 추상화가 높아져 빠르고 쉽지만 통제권은 줄어든다  
C) 항상 비용이 더 비싸다  
D) ML 전문성이 더 많이 필요해진다  

**정답: B**  
해설: 상위(AI 서비스)로 갈수록 추상화가 높아 빠르고 쉽게 쓸 수 있지만 모델 커스터마이징 등 통제권은 줄어든다. 통제권이 커지는 것은 하위(인프라) 방향이고, 비용은 워크로드에 따라 달라지며, ML 전문성은 상위 서비스일수록 덜 필요하다.

---

**문제 3.** 대규모 추론 트래픽의 비용을 최소화해야 하는 ML 엔지니어가 고려할 AWS 전용 칩은?

A) AWS Trainium  
B) AWS Inferentia  
C) FSx for Lustre  
D) Elastic Block Store  

**정답: B**  
해설: Inferentia(Inf2)는 추론 전용으로 설계된 AWS 칩으로 추론 단가와 전력을 낮춘다. Trainium은 학습 전용 칩이고, FSx for Lustre는 고속 학습 데이터용 파일시스템, EBS는 블록 스토리지로 모두 추론 비용 절감 목적과 다르다.

---

**문제 4.** SageMaker가 AI 서비스(Rekognition, Comprehend 등)와 구별되는 결정적 차이는?

A) SageMaker는 API 호출만 가능하다  
B) SageMaker는 커스텀 데이터로 모델을 직접 학습·튜닝·배포한다  
C) SageMaker는 모델 학습을 지원하지 않는다  
D) AI 서비스가 SageMaker보다 항상 통제권이 더 크다  

**정답: B**  
해설: SageMaker는 데이터 준비·학습·튜닝·배포·모니터링 전체를 커스텀으로 다루는 ML 플랫폼이다. API 호출만 하는 것은 AI 서비스의 특징이고, SageMaker는 학습을 핵심으로 지원하며, 통제권은 AI 서비스보다 SageMaker 쪽이 더 크다.

---

**문제 5.** 학습용 칩과 추론용 칩을 별도로 설계하는 것이 합리적인 이유로 옳은 것은?

A) 학습과 추론의 연산 특성이 같기 때문  
B) 학습은 역전파를 포함한 고처리량 작업, 추론은 순전파만 하는 저지연 작업으로 특성이 다르기 때문  
C) 추론은 학습보다 훨씬 드물게 일어나기 때문  
D) 두 칩의 가격을 같게 맞추기 위해  

**정답: B**  
해설: 학습은 순전파와 역전파로 그래디언트를 계산하며 큰 배치를 처리(처리량 중심)하고, 추론은 순전파만 하며 낮은 지연으로 작은 배치를 자주 처리(지연 중심)한다. 이 연산 특성 차이 때문에 Trainium(학습)과 Inferentia(추론)를 분리한다. 추론은 사용자 요청마다 반복돼 오히려 더 빈번하며, 칩 분리 목적은 가격 통일이 아니라 작업별 최적화다.

---
