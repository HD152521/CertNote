# Day 5 - Week 4 종합: AWS AI/ML 서비스 전체 지도

Week 4 동안 우리는 AIF-C01 시험에서 가장 비중이 큰 영역 — AWS의 AI/ML 서비스 전체 — 를 훑었다. Bedrock과 SageMaker라는 두 축을 잡고, 그 아래 즉시 쓰는 관리형 AI 서비스들, 그리고 완성형 비서 Amazon Q까지 봤다.

오늘은 이 모든 걸 **한 장의 지도**로 묶는다. 시험장에서 "이 시나리오엔 무엇?"이라는 질문에 즉시 답할 수 있도록, 용도 매핑과 헷갈리기 쉬운 쌍들을 정리한다. 이번 글은 새 개념이 아니라 **복습과 통합**이다.

## 큰 그림: 3개 계층으로 보기

AWS AI/ML 서비스는 "추상화 수준"에 따라 3계층으로 나눠 보면 명확하다.

| 계층 | 성격 | 대표 서비스 | 사용자 |
|------|------|-------------|--------|
| AI 서비스(완성형 API) | 모델 신경 안 씀, 기능만 호출 | Rekognition, Textract, Comprehend, Transcribe, Polly, Translate, Lex, Kendra, Personalize, Forecast | 일반 개발자 |
| ML 플랫폼 | 직접 모델 구축·학습·배포 | SageMaker | 데이터 과학자/ML 엔지니어 |
| 생성형 AI / 비서 | FM 빌딩 블록 또는 완제품 비서 | Bedrock, Amazon Q | 양쪽 모두 |

핵심 직관: **위로 갈수록 쉽고 통제는 적고, 아래로 갈수록 어렵고 통제는 크다.** 시험은 "통제가 얼마나 필요한가 / 전문성이 얼마나 있는가 / 기존 모델로 충분한가"로 계층을 가른다.

> 💡 **관련 이론**: AWS의 설계 철학은 "고객이 원하는 추상화 수준을 고른다"이다. 빠르게 기능만 붙이고 싶으면 완성형 AI 서비스, 생성형 앱을 조립하려면 Bedrock, 커스텀 모델을 통제하려면 SageMaker. 시험 문제의 단서(전문성, 통제, 인프라 관리 의향)가 어느 계층을 가리키는지 읽는 게 핵심이다.

## 핵심 용도 매핑표 (반드시 암기)

| 작업/시나리오 | 정답 서비스 |
|---------------|-------------|
| 이미지/영상에서 객체·얼굴·부적절 콘텐츠 탐지 | Rekognition |
| 문서(청구서·양식)에서 표·키값 추출 | Textract |
| 텍스트 감정·개체·언어 분석(NLP) | Comprehend |
| 음성 → 텍스트(받아쓰기, 자막) | Transcribe |
| 텍스트 → 음성(음성 안내, 오디오북) | Polly |
| 언어 간 번역 | Translate |
| 인텐트/슬롯 기반 대화형 챗봇 | Lex |
| 사내 문서 자연어 검색 | Kendra |
| 개인화 상품·콘텐츠 추천 | Personalize |
| 시계열 수요·매출 예측 | Forecast |
| 여러 FM을 관리 없이 API로 | Bedrock |
| 사내 데이터 기반 RAG 챗봇 구축 | Bedrock + Knowledge Bases |
| 생성형 AI 입출력 안전 필터링 | Bedrock Guardrails |
| 모델이 다단계로 실제 작업 수행 | Bedrock Agents |
| 자체 데이터로 커스텀 모델 학습·배포 | SageMaker |
| 사전학습 모델로 빠른 시작·파인튜닝 | SageMaker JumpStart |
| 업무용 완성형 생성형 비서 | Amazon Q Business |
| 개발자용 코딩 비서 | Amazon Q Developer |

이 표 한 장이 Week 4의 핵심 자산이다. 시험 직전 이것만 다시 봐도 큰 도움이 된다.

## 헷갈리기 쉬운 서비스 쌍 비교

시험은 비슷해 보이는 서비스 사이의 미세한 차이를 노린다.

| 비교 쌍 | 차이의 핵심 |
|---------|-------------|
| Bedrock vs SageMaker | FM을 **빌려 씀** vs 모델을 **직접 만듦** |
| Bedrock vs Amazon Q | 빌딩 블록(API) vs 완성형 비서(제품) |
| Rekognition vs Textract | 이미지/영상 **분석** vs 문서 **데이터 추출** |
| Comprehend vs Kendra | 텍스트 **의미 분석** vs 문서 **검색** |
| Transcribe vs Polly | 음성→텍스트(STT) vs 텍스트→음성(TTS) |
| Lex vs Bedrock Agents | 정형 인텐트/슬롯 봇 vs FM 추론 기반 유연한 다단계 작업 |
| Personalize vs Forecast | 개인화 **추천** vs 시계열 **예측** |
| RAG vs 파인튜닝 | 외부 지식 **검색해 붙임** vs 모델 자체 **추가 학습** |

> 🔍 **더 깊이**: 가장 자주 틀리는 쌍이 **Bedrock vs SageMaker**, 그리고 **Rekognition vs Textract**다. 전자는 "통제·전문성·인프라 관리 의향"으로, 후자는 "범용 이미지 분석이냐 / 구조화된 문서 추출이냐"로 가른다. 또 하나, **RAG vs 파인튜닝**: 자주 바뀌는 사실·최신 정보는 RAG, 말투나 특정 도메인 능력 자체를 바꾸려면 파인튜닝이다.

## 서비스 결합(파이프라인) 패턴

실무와 시험 모두에서 서비스는 **단독이 아니라 연결**해 쓴다. 자주 나오는 패턴:

- **콜센터 분석**: Transcribe(음성→텍스트) → Comprehend(감정·개체 분석).
- **간이 통역**: Transcribe → Translate → Polly(텍스트로 변환 후 번역, 다시 음성).
- **생성형 Q&A**: Kendra/Knowledge Bases(검색) → Bedrock(FM이 답변 생성) = RAG.
- **이미지 검수**: Rekognition(부적절 콘텐츠 탐지) → 사람 검토(애매한 경우만).
- **문서 자동화**: Textract(추출) → Comprehend(개체·PII 분석) → 후속 처리.

> 📚 **사례**: 한 보험사는 청구서 처리에 Textract로 양식을 추출하고, Comprehend로 민감정보(PII)를 식별해 마스킹한 뒤, 자동 입력 시스템에 넘기는 파이프라인을 구축했다. 단일 서비스가 아니라 여러 AI 서비스를 **레고처럼 조립**한 것이 핵심이다. 시험에서 "여러 단계를 거치는 처리"가 나오면 이런 결합을 떠올리자.

## 시험 대비 마무리 체크

Week 4를 마치며 스스로 점검할 질문들:

1. Bedrock과 SageMaker를 한 문장으로 구분할 수 있는가? (빌려 씀 vs 직접 만듦)
2. RAG, Guardrails, Agents가 각각 무엇을 해결하는가?
3. 6개 AI 서비스(Rekognition/Textract/Comprehend/Transcribe/Polly/Translate)의 용도를 즉시 말할 수 있는가?
4. Lex/Kendra/Personalize/Forecast의 용도는?
5. Amazon Q Business와 Developer의 차이는?
6. RAG와 파인튜닝은 언제 각각 쓰는가?

이 6가지에 막힘없이 답할 수 있다면 Week 4의 목표는 달성된 것이다.

## 정리하며

Week 4의 결론은 명확하다. AWS AI/ML 서비스는 **추상화 3계층**(완성형 AI 서비스 / SageMaker / 생성형·비서)으로 이해하고, **용도 매핑표**로 "단서 → 서비스"를 즉시 연결하며, 헷갈리는 **서비스 쌍의 차이**를 잡고, 여러 서비스를 **파이프라인으로 결합**하는 감각을 갖추는 것이다.

이로써 시험에서 가장 비중 큰 영역을 정복했다. 다음 Week부터는 책임 있는 AI, 보안·거버넌스, 그리고 비용·평가 같은 나머지 도메인을 다루며 합격에 필요한 그림을 완성해 나간다.

---

## 📝 연습 문제

**문제 1.** AWS AI/ML 서비스를 추상화 수준으로 나눌 때, "모델을 신경 쓰지 않고 완성된 기능만 API로 호출"하는 계층에 속하지 않는 것은?

A) Amazon Rekognition  
B) Amazon Comprehend  
C) Amazon SageMaker  
D) Amazon Translate  

**정답: C**  
해설: SageMaker는 직접 모델을 학습·배포·통제하는 ML 플랫폼 계층으로, 완성형 API 계층이 아니다. A·B·D는 모두 모델을 신경 쓸 필요 없이 기능만 호출하는 완성형 AI 서비스다.

---

**문제 2.** 자주 바뀌는 사내 최신 정보로 챗봇이 답하게 하려 한다. 모델 자체를 추가 학습시키기보다 적절한 접근은?

A) 파인튜닝으로 매번 모델 재학습  
B) RAG로 외부 지식을 검색해 프롬프트에 붙임  
C) Guardrails 설정  
D) Polly로 음성 출력  

**정답: B**  
해설: 자주 바뀌는 사실·최신 정보는 RAG로 외부에서 검색해 붙이는 것이 적합하며 재학습 비용이 없다. A는 비용이 크고 빈번한 변경에 비효율적이다. C는 안전 필터, D는 음성 합성으로 최신 지식 반영과 무관하다.

---

**문제 3.** 다음 중 Rekognition과 Textract의 차이를 가장 정확히 설명한 것은?

A) Rekognition은 음성을 처리하고 Textract는 번역한다  
B) Rekognition은 이미지/영상을 분석하고, Textract는 문서에서 구조화된 데이터를 추출한다  
C) 둘은 완전히 동일한 서비스다  
D) Textract는 추천을, Rekognition은 예측을 한다  

**정답: B**  
해설: Rekognition은 이미지·영상의 객체·얼굴·콘텐츠를 분석하고, Textract는 문서의 표·키값 등 구조화 데이터를 추출하는 문서 처리에 특화되어 있다. A는 둘 다 해당 없는 기능이고, C는 다른 서비스라 틀렸으며, D는 Personalize/Forecast의 역할로 무관하다.

---

**문제 4.** 콜센터 통화를 분석해 고객 감정을 파악하는 파이프라인으로 가장 적절한 순서는?

A) Polly → Comprehend  
B) Transcribe → Comprehend  
C) Rekognition → Polly  
D) Translate → Forecast  

**정답: B**  
해설: 음성을 Transcribe로 텍스트화한 뒤 Comprehend로 감정을 분석하는 흐름이 적절하다. A는 텍스트를 음성으로 만든 뒤 분석하는 비논리적 순서다. C는 이미지·음성 합성 조합, D는 번역·예측 조합으로 통화 감정 분석과 맞지 않는다.

---

**문제 5.** 한 팀이 데이터 과학 전문성을 갖추고, 자사 고유 데이터로 도메인 특화 예측 모델을 직접 학습·배포·모니터링하려 한다. 가장 적합한 계층/서비스는?

A) 완성형 AI 서비스(예: Comprehend)  
B) Amazon Q Business  
C) Amazon SageMaker  
D) Amazon Bedrock 단독  

**정답: C**  
해설: 자체 데이터로 커스텀 모델을 직접 통제하며 학습·배포·모니터링하려면 ML 플랫폼인 SageMaker가 적합하다. A는 모델을 통제할 수 없는 완성형 API이고, B는 업무용 비서 제품, D는 FM을 빌려 쓰는 데 초점이 있어 커스텀 모델 직접 구축과는 다르다.

---
