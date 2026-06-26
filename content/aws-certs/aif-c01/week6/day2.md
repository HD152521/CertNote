# Day 2 - 도메인 복습 2: 파운데이션 모델 응용(AWS AI 서비스) 핵심 총정리

오늘은 시험에서 "표면적으로 가장 자주 등장하는" 영역을 정리한다. 바로 **AWS의 AI/ML 서비스들**이다. AIF-C01은 "이 상황에 가장 적합한 AWS 서비스는?"을 끝없이 묻는다. 그래서 서비스 이름과 "한 줄 용도"를 짝지어 빠르게 떠올리는 능력이 곧 점수다.

서비스는 크게 세 층으로 나눠 기억하면 헷갈리지 않는다. ① 곧바로 쓰는 **AI 서비스(API)**, ② 모델을 직접 만드는 **SageMaker**, ③ 생성형 AI 기반인 **Bedrock과 Amazon Q**다. 오늘은 이 세 층을 한 번에 압축한다.

## 층 1: 바로 쓰는 AI 서비스(사전학습 API)

ML 지식 없이 API 호출만으로 쓰는 관리형 서비스들이다. 각각 "한 가지 일"을 잘한다. 이 매핑이 시험의 절반이다.

| 서비스 | 한 줄 용도 | 키워드 |
|--------|-----------|--------|
| **Amazon Rekognition** | 이미지·영상 분석 | 얼굴/객체/부적절 콘텐츠 인식 |
| **Amazon Textract** | 문서에서 텍스트·표·양식 추출 | 스캔 문서, OCR |
| **Amazon Comprehend** | 텍스트의 감정·엔터티·언어 분석 | 자연어 이해, 감정 분석 |
| **Amazon Transcribe** | 음성 → 텍스트(STT) | 회의록, 자막 |
| **Amazon Polly** | 텍스트 → 음성(TTS) | 음성 안내, 오디오북 |
| **Amazon Translate** | 언어 번역 | 다국어 |
| **Amazon Lex** | 대화형 챗봇/음성봇 | 인텐트, 음성 비서 |
| **Amazon Personalize** | 개인화 추천 | 추천 엔진 |
| **Amazon Forecast** | 시계열 수요 예측 | 재고/매출 예측 |
| **Amazon Kendra** | 지능형 기업 검색 | 사내 문서 검색 |

> 💡 **관련 이론**: 이 서비스들의 공통점은 "AWS가 이미 학습시켜 둔 모델을 빌려 쓴다"는 것이다. 사용자는 데이터·인프라·학습 과정을 신경 쓸 필요 없이 API만 호출한다. 그래서 "ML 전문 인력이 없는 팀이 빠르게 기능을 붙이고 싶다"가 나오면 거의 항상 이 층의 서비스가 답이다. 반대로 "우리 데이터에 꼭 맞는 모델을 직접 만들어야 한다"면 다음 층(SageMaker)으로 넘어간다.

## 층 2: 모델을 직접 만드는 SageMaker

**Amazon SageMaker**는 ML 모델을 **직접 구축·학습·배포**하는 완전 관리형 플랫폼이다. 위의 API 서비스가 "기성품"이라면 SageMaker는 "맞춤 제작 공방"이다. 데이터 준비부터 학습, 튜닝, 배포, 모니터링까지 ML 전체 수명주기를 다룬다.

대표 기능 몇 가지만 시험용으로 기억하자.

| 기능 | 용도 |
|------|------|
| **SageMaker Studio** | 통합 개발 환경(노트북·실험) |
| **SageMaker JumpStart** | 사전학습 모델·솔루션 빠른 시작 |
| **SageMaker Data Wrangler** | 데이터 준비·전처리 |
| **SageMaker Clarify** | 편향 탐지·모델 설명가능성 |
| **SageMaker Model Monitor** | 배포 후 데이터 드리프트 감시 |

핵심 구분: "API만 호출 = AI 서비스 층 / 모델을 직접 만들고 통제 = SageMaker"다.

> 💡 **관련 이론**: SageMaker가 책임지는 것은 "ML 수명주기의 반복 작업 자동화"다. 모델 학습에는 데이터 정제, 알고리즘 선택, 하이퍼파라미터 튜닝, GPU 인프라 관리, 배포·모니터링이 끝없이 따라온다. SageMaker는 이 단계들을 관리형으로 묶어 데이터 과학자가 모델 자체에 집중하게 해준다. 그래서 "커스텀 모델", "직접 학습", "MLOps"라는 단어가 보이면 SageMaker를 떠올리면 된다.

## 층 3: 생성형 AI — Bedrock과 Amazon Q

생성형 AI 시대의 핵심 두 서비스다.

**Amazon Bedrock**은 여러 회사의 **파운데이션 모델을 API 하나로 호출**하는 완전 관리형 서비스다. Anthropic, Meta, Amazon(Titan) 등 다양한 FM을 인프라 관리 없이 쓰고, 자체 데이터로 커스터마이즈하거나 RAG·에이전트를 구성할 수 있다. "FM을 호스팅·서빙"하거나 "여러 모델 중 골라 쓰고 싶다"면 Bedrock이다.

**Amazon Q**는 AWS의 생성형 AI 비서다. 두 갈래가 있다.

| 서비스 | 용도 |
|--------|------|
| **Amazon Q Business** | 사내 데이터 기반 업무용 AI 비서(검색·요약·질의응답) |
| **Amazon Q Developer** | 코딩 보조(코드 생성·설명·AWS 운영 지원) |

Bedrock 위에서 RAG를 직접 구성할 때 자주 함께 보이는 것이 **Knowledge Bases for Bedrock**(문서를 임베딩해 검색 근거로 제공)과 **Agents for Bedrock**(여러 단계 작업 자동 수행)이다.

> 💡 **관련 이론**: Bedrock과 Amazon Q의 관계는 "엔진과 완제품"에 가깝다. Bedrock은 FM을 가져다 직접 앱을 만드는 빌딩 블록이고, Amazon Q는 그 위에 이미 비서 형태로 완성된 제품이다. 그래서 "개발자가 생성형 AI 앱을 직접 만든다"면 Bedrock, "바로 쓰는 사내 AI 비서가 필요하다"면 Amazon Q가 답이 된다. 둘 다 모델을 새로 학습시키지 않고 기성 FM을 활용한다는 점이 SageMaker와의 결정적 차이다.

## 빠른 선택 가이드: 상황 → 서비스

시험은 결국 "상황 → 서비스" 매핑이다. 자주 나오는 패턴을 압축한다.

- 스캔한 영수증/계약서에서 글자·표 추출 → **Textract**
- 사진 속 객체·얼굴·부적절 콘텐츠 식별 → **Rekognition**
- 고객 리뷰의 긍·부정 감정 분석 → **Comprehend**
- 콜센터 통화 녹음을 텍스트로 → **Transcribe**, 그 반대 → **Polly**
- 고객 응대 챗봇 구축 → **Lex**(또는 Q Business)
- 쇼핑몰 상품 추천 → **Personalize**
- 다국어 FM을 골라 앱에 통합 → **Bedrock**
- 커스텀 모델 직접 학습·배포 → **SageMaker**

> 💡 **관련 이론**: 같은 "텍스트"라도 작업이 다르면 서비스가 다르다. 글자를 "꺼내는" 것은 Textract(문서 OCR), 글자의 "뜻을 분석"하는 것은 Comprehend(NLU), 글자를 "만들어내는" 것은 Bedrock/LLM이다. 시험 함정은 이 미묘한 동사 차이("추출 vs 분석 vs 생성")에 숨어 있으므로, 문제 속 동사를 먼저 잡는 습관이 정답률을 크게 올린다.

## 정리하며

오늘은 AWS AI 서비스를 세 층으로 정리했다. 첫째, **바로 쓰는 API 서비스**(Rekognition·Textract·Comprehend·Transcribe·Polly·Translate·Lex·Personalize·Forecast·Kendra)는 ML 지식 없이 한 가지 일을 잘한다. 둘째, **SageMaker**는 커스텀 모델을 직접 만드는 플랫폼이다. 셋째, **Bedrock**은 여러 FM을 빌려 쓰는 생성형 AI 엔진, **Amazon Q**는 완성형 AI 비서다. "상황 속 동사 → 서비스" 매핑이 점수의 핵심이다.

다음 글에서는 도메인 3·4에 해당하는 **책임 있는 AI와 보안·거버넌스**를 본문 위주로 정리한다. 기술만큼 "안전하게·책임 있게"가 시험에서 비중 있게 나온다.

---

## 📝 연습 문제

**문제 1.** 스캔된 종이 계약서에서 텍스트와 표, 입력 양식 필드를 자동으로 추출하려고 한다. 가장 적합한 서비스는?

A) Amazon Comprehend  
B) Amazon Textract  
C) Amazon Polly  
D) Amazon Translate  

**정답: B**  
해설: 문서(스캔·이미지)에서 텍스트·표·양식 필드를 추출하는 전용 서비스는 Textract다. Comprehend는 이미 텍스트인 자료의 의미·감정을 분석하고, Polly는 텍스트를 음성으로, Translate는 언어 번역을 하므로 추출 작업과 맞지 않는다.

---

**문제 2.** ML 전문 인력 없이, 여러 회사의 파운데이션 모델을 단일 API로 호출해 생성형 AI 앱을 만들고 싶다. 가장 적합한 서비스는?

A) Amazon SageMaker  
B) Amazon Rekognition  
C) Amazon Bedrock  
D) Amazon Forecast  

**정답: C**  
해설: Bedrock은 여러 제공사의 FM을 인프라 관리 없이 단일 API로 호출하고 커스터마이즈·RAG·에이전트를 구성할 수 있는 완전 관리형 생성형 AI 서비스다. SageMaker는 커스텀 모델을 직접 학습·배포하는 플랫폼, Rekognition은 이미지 분석, Forecast는 시계열 예측이라 맞지 않는다.

---

**문제 3.** 데이터 과학팀이 자사 고유 데이터로 커스텀 ML 모델을 직접 학습·튜닝·배포하고 운영 후 드리프트까지 모니터링하려고 한다. 가장 적합한 것은?

A) Amazon SageMaker  
B) Amazon Q Business  
C) Amazon Lex  
D) Amazon Kendra  

**정답: A**  
해설: 데이터 준비부터 학습·튜닝·배포·모니터링까지 ML 전체 수명주기를 다루는 관리형 플랫폼은 SageMaker다. Q Business는 사내 데이터 기반 AI 비서, Lex는 챗봇, Kendra는 기업 검색으로 모두 커스텀 모델을 직접 만드는 용도가 아니다.

---

**문제 4.** 고객 응대 음성봇/챗봇을 구축하려 한다. 인텐트(의도) 인식과 대화 흐름 관리에 특화된 서비스는?

A) Amazon Polly  
B) Amazon Transcribe  
C) Amazon Lex  
D) Amazon Personalize  

**정답: C**  
해설: Lex는 인텐트·슬롯 기반의 대화형 챗봇/음성봇을 만드는 서비스다. Polly는 텍스트를 음성으로, Transcribe는 음성을 텍스트로 변환하는 단일 기능 서비스이며, Personalize는 추천 엔진이라 대화 흐름 관리와 무관하다.

---

**문제 5.** Amazon Bedrock과 Amazon SageMaker의 핵심 차이로 가장 정확한 것은?

A) Bedrock은 기성 파운데이션 모델을 활용하고, SageMaker는 커스텀 모델을 직접 구축·학습한다  
B) 둘 다 동일하며 이름만 다르다  
C) Bedrock은 이미지 전용, SageMaker는 텍스트 전용이다  
D) SageMaker는 모델 학습이 불가능하다  

**정답: A**  
해설: Bedrock은 여러 제공사의 사전학습 FM을 빌려 쓰는 생성형 AI 서비스이고, SageMaker는 자체 데이터로 모델을 처음부터 또는 맞춤으로 학습·배포하는 플랫폼이다. 둘은 분명히 다른 목적이며(B 오답), 특정 데이터 타입 전용도 아니고(C 오답), SageMaker의 핵심이 바로 모델 학습이므로 D도 틀렸다.

---
