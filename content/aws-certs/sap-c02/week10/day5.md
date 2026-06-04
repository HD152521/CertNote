# Day 50 - Week 10 종합 복습: ML/AI 아키텍처 의사결정 + 시나리오 12문항

한 주 동안 SageMaker(ML 플랫폼), Bedrock(생성형 AI), Managed AI(사전 학습형 서비스), MLOps(운영 자동화)를 다뤘다. 오늘은 이 네 영역을 따로 외우는 대신, SAP-C02 시험이 실제로 묻는 방식 — **"이 비즈니스 시나리오에 어떤 ML/AI 구성이 정답인가"** — 의 의사결정 흐름으로 통합한다. ML/AI 영역의 시험 함정은 거의 항상 "직접 만들 것인가 vs 관리형을 쓸 것인가", "비슷한 서비스 중 무엇인가(Macie vs Comprehend, Async vs Batch, RAG vs fine-tuning)"의 경계에서 나온다.

종합 복습일이라 새 서비스를 더하기보다, 한 주 동안 흩어져 본 개념들이 **왜 그렇게 설계됐는지** — 역사적 배경, 내부 동작, 다른 클라우드와의 차이, 실제 기업이 어떻게 실패하고 고쳤는지 — 를 한 호흡으로 꿰는 데 무게를 둔다. 시험은 단순 암기가 아니라 "이 조건에서 무엇이 운영 부담·비용·제약을 동시에 만족하는가"를 묻기 때문에, 서비스 이름이 아니라 그 뒤의 원리를 잡아야 보기 4개 중 그럴듯한 오답을 걸러낼 수 있다.

## ML/AI 서비스 스택은 어떻게 이 모양이 됐나 — 역사적 배경

AWS의 ML 서비스 계층은 한 번에 설계된 게 아니라 시장의 필요를 따라 아래에서 위로 쌓였다. 2016년 re:Invent에서 AWS는 **Rekognition·Polly·Lex** 세 개의 "AI 서비스"를 공개했다. 당시 메시지는 분명했다 — "이미지 인식·음성 합성·대화 봇 같은 이미 풀린 문제는 직접 모델을 만들지 말고 API로 호출하라". 이듬해 2017년 **SageMaker**가 나왔다. 커스텀 모델을 학습·서빙하려는 조직은 EC2에 노트북·학습 클러스터·추론 서버를 직접 짜야 했는데, 이 반복 작업을 관리형으로 묶은 것이다. 그리고 2023년 ChatGPT 충격 이후 **Bedrock**이 생성형 FM을 API로 추상화하며 가장 높은 추상화 계층을 완성했다.

이 연대기가 곧 오늘의 의사결정 트리다. 아래로 갈수록 통제력이 커지고 운영 부담도 커진다.

| 계층 | 대표 서비스 | 등장 | 추상화 수준 | 운영 부담 |
|------|------------|------|-------------|-----------|
| **AI Services(이미 풀린 문제)** | Rekognition·Textract·Comprehend·Transcribe | 2016~ | 결과 API | 거의 0 |
| **생성형 FM API** | Bedrock(Claude·Titan·Llama) | 2023~ | 모델 API | 0(호출만) |
| **ML 플랫폼** | SageMaker(학습·추론·MLOps) | 2017~ | 모델·인프라 통제 | 높음 |
| **자체 구축** | EC2 + 오픈소스 프레임워크 | — | 전체 통제 | 매우 높음 |

> 💡 **관련 이론**: 이 계층 구조는 컴퓨팅의 보편 진화 패턴을 ML에 그대로 옮긴 것이다. 컴퓨팅은 물리 서버(IaaS) → 가상화 → 컨테이너 → 함수(FaaS) → 완전 관리형 SaaS로, "내가 관리하는 표면"을 줄이는 방향으로 진화했다. ML도 똑같이 (모델 가중치+인프라 직접 운영) → (관리형 학습·서빙) → (모델 API) → (결과 API)로 추상화가 올라갔다. SAP 시험이 ML 시나리오에서 "직접 만드는 답"을 거의 오답으로 두는 근본 이유가 이것 — AWS Well-Architected의 운영 우수성(Operational Excellence) 기둥은 항상 "차별화되지 않는 무거운 작업(undifferentiated heavy lifting)을 AWS에 맡기라"고 말한다. 모델 학습 인프라 운영은 대부분 기업에게 차별화 요소가 아니다.

## 의사결정 흐름 — 문제를 받으면 무엇부터 묻는가

ML/AI 시나리오를 풀 때 머릿속에서 거치는 순서:

1. **이미 풀린 문제인가?** (OCR·음성·감정·번역·추천) → Managed AI 서비스(직접 만들지 마라)
2. **생성형/대화/사내 지식인가?** → Bedrock. 사내 문서 기반이면 RAG(Knowledge Bases), fine-tuning은 거의 오답
3. **커스텀 모델을 학습·서빙해야 하나?** → SageMaker. 추론 패턴(4종)과 학습 비용(Spot+Checkpoint)을 결정
4. **운영 후 품질·재학습이 문제인가?** → MLOps(Model Monitor·Feature Store·Pipelines·Registry)

이 4단계가 Week 10 전체를 하나의 결정 트리로 묶는다.

> 💡 **관련 이론**: 이 결정 트리는 본질적으로 "추상화 수준의 선택"이다. 가장 높은 추상화(Managed AI: 결과 API)에서 가장 낮은 추상화(SageMaker: 모델·인프라 직접 통제)로 내려가며, 통제력과 운영 부담이 반비례한다. 클라우드 아키텍처의 보편 원칙 — "관리형으로 풀리면 관리형으로, 안 풀릴 때만 직접" — 의 ML 버전이다. SAP 시험이 ML 시나리오에서 "직접 만드는 답"을 거의 오답으로 두는 이유가 이것이다. AWS는 항상 "더 적은 운영 부담"을 선호하는 답을 정답으로 설계한다(Well-Architected의 운영 우수성 기둥).

> 🔍 **더 깊이**: 시험에서 여러 보기가 모두 "기술적으로 가능"할 때 정답을 가르는 기준은 세 가지다 — (1) **운영 부담**(관리형 > 자체 구축), (2) **비용**(유휴 0 > 상시 과금), (3) **제약 조건 충족**(페이로드·지연·실시간성·인터넷 미경유 등 문장 속 명시 조건). 특히 (3)의 "조건 키워드"를 놓치면 그럴듯한 오답을 고르게 된다. "인터넷 미경유"→PrivateLink, "운영 부담 최소"→관리형, "라벨 늦음"→Data Quality, "사용자 영향 없이"→Shadow처럼 한 단어가 답을 확정한다.

> 🔍 **더 깊이**: 결정 트리를 "위에서 아래로(top-down)" 타는 게 중요하다. 많은 수험생이 SageMaker를 먼저 떠올리는데(가장 유명하니까), 올바른 순서는 항상 "이미 풀린 문제인가?"를 맨 먼저 묻는 것이다. 예를 들어 "차량 번호판 인식"은 SageMaker로 비전 모델을 학습할 수도 있지만, Rekognition으로 즉시 풀린다. "고객 리뷰 감정 분석"도 SageMaker 분류 모델이 아니라 Comprehend로 끝난다. 시험은 거의 항상 더 높은 추상화 계층을 정답으로 두므로, 보기 중 "더 관리형인 것"이 있으면 그것을 의심하는 습관이 점수를 만든다.

## 다른 클라우드와의 비교 — AWS만 외우면 안 되는 이유

SAP 시험은 AWS 전용이지만, 같은 문제를 GCP·Azure가 어떻게 푸는지 알면 "이 서비스의 본질이 무엇인가"가 선명해진다. 본질을 알면 이름이 바뀌어도 정답을 찾는다.

| 기능 영역 | AWS | Google Cloud | Microsoft Azure |
|-----------|-----|--------------|-----------------|
| **ML 플랫폼** | SageMaker | Vertex AI | Azure ML |
| **생성형 FM API** | Bedrock | Vertex AI(Gemini) | Azure OpenAI Service |
| **관리형 RAG** | Bedrock Knowledge Bases | Vertex AI Search | Azure AI Search |
| **OCR/문서** | Textract | Document AI | Document Intelligence |
| **비전** | Rekognition | Vision AI | Computer Vision |
| **음성→텍스트** | Transcribe | Speech-to-Text | Speech Service |
| **추론 전용 칩** | Inferentia | TPU(추론·학습 겸용) | (Maia 100, 2024~) |

> 🔍 **더 깊이**: 세 클라우드의 공통점은 "AI 서비스(결과 API) → FM API → ML 플랫폼"의 3계층이 거의 동일하다는 것이다. 차이는 디테일에 있다. AWS는 Bedrock에서 **멀티 벤더**(Anthropic·Meta·Mistral·Cohere·Amazon)를 한 API로 묶어 벤더 종속을 줄이는 것을 차별점으로 내세운다. 반면 Azure OpenAI는 OpenAI 모델에 집중하고, GCP는 자사 Gemini에 무게를 둔다. 또 AWS는 학습 칩(Trainium)과 추론 칩(Inferentia)을 분리 설계했는데, Google TPU는 하나로 둘 다 한다. 시험에서 "추론 비용 절감 전용 칩"이 Inferentia인 이유 — AWS가 의도적으로 추론에 특화한 ASIC을 따로 만들었기 때문이다.

## 추론 엔드포인트 4종 — 왜 네 개로 갈렸나 (내부 동작)

SageMaker 추론이 한 종류가 아니라 네 종류로 나뉜 건 우연이 아니다. 추론 워크로드는 (1) 페이로드 크기, (2) 지연 요구, (3) 트래픽 패턴, (4) 동기/비동기라는 네 축에서 천차만별이라 하나의 엔드포인트로는 비용·성능을 동시에 잡을 수 없다.

| 종류 | 특징 | 한계/조건 | 내부 동작 |
|------|------|-----------|-----------|
| **Real-Time** | 동기·저지연(수십 ms) | 페이로드 6MB·60초, 상시 비용 | 인스턴스 상주, 요청→즉시 응답 |
| **Serverless** | 가변·콜드 OK, 유휴 비용 0 | 콜드 스타트, 6MB·60초 | 요청 시 컨테이너 기동, 유휴 시 0 스케일 |
| **Async** | 큰 페이로드(1GB)·긴 추론 | 큐 기반, 0 스케일다운 가능 | SQS 큐에 적재→처리→S3에 결과 |
| **Batch Transform** | 데이터셋 전체 일괄 | 상시 서빙 아님 | 작업 단위로 인스턴스 기동→종료 |

내부적으로 Real-Time과 Serverless는 동기 요청-응답이라 API Gateway/Lambda의 6MB·30~60초 한계와 같은 물리적 제약을 받는다. Async는 그 제약을 큐로 우회한다 — 요청을 받으면 즉시 "접수했다"고 응답하고(202), 실제 추론은 백그라운드에서 돌려 결과를 S3에 쓴다. 그래서 800MB 페이로드와 5분 추론이 가능하다. Batch Transform은 아예 "상시 서빙"이 아니라 "일회성 작업"이다 — 데이터셋 전체를 한 번에 밀어 넣고 끝나면 인스턴스를 내린다.

> 🔍 **더 깊이**: Serverless Inference의 콜드 스타트는 Lambda의 콜드 스타트와 같은 메커니즘이다. 유휴 시 컨테이너를 0으로 내려 비용을 없애는 대신, 첫 요청이 오면 모델 가중치를 메모리에 로드하는 시간(모델 크기에 비례, 수백 ms~수 초)이 든다. 그래서 "지연에 민감한 상시 트래픽"은 Real-Time(상주), "간헐적·콜드 허용"은 Serverless가 맞다. 이건 EC2(상주) vs Lambda(요청 시 기동)의 트레이드오프와 정확히 같은 구조다 — ML 추론도 결국 컴퓨팅이고, 컴퓨팅의 비용·지연 트레이드오프 법칙을 그대로 따른다.

> ⚠️ **함정**: Async와 Batch를 헷갈리면 한 문제를 통째로 틀린다. 핵심 구분은 "요청 단위인가, 데이터셋 단위인가"다. 사용자가 파일 하나를 올리고 그 결과를 기다리는(요청-응답이되 오래 걸리는) 패턴은 **Async**. 매일 밤 100만 건을 한꺼번에 점수 매기는(상시 서빙 불필요) 패턴은 **Batch Transform**. "사용자 업로드 건별 + 큰 파일 + 긴 추론"이면 무조건 Async, "야간 배치/전체 데이터셋 일괄"이면 Batch. 문장에서 "건별/요청별"과 "전체/일괄"이 답을 가른다.

## 학습 비용 — Spot은 왜 Checkpoint와 항상 붙어 다니나

GPU 학습은 ML 비용의 가장 큰 덩어리다. ml.p4d 같은 인스턴스는 시간당 수십 달러고, 며칠짜리 학습이면 비용이 폭발한다. 그래서 **Managed Spot Training**으로 최대 90% 할인된 Spot 용량을 쓴다. 하지만 Spot은 AWS가 용량이 필요하면 2분 통보 후 회수한다. 며칠짜리 학습이 중간에 회수되면 처음부터 다시? 그래서 **Checkpoint**가 필수다 — 학습 진행 상태(가중치·옵티마이저 상태)를 주기적으로 S3에 저장(`checkpoint_s3_uri`)해, 회수 후 재개될 때 마지막 저장 지점부터 이어간다.

- **Managed Spot Training + Checkpoint** = 최대 90% 절감 + 중단 복구(체크포인트 필수)
- **Inferentia**(추론 칩) / **Trainium**(학습 칩) / **Graviton**(범용 CPU)
- Multi-Model Endpoint = 다수의 가끔 쓰는 모델 비용 절감

> 💡 **관련 이론**: Spot + Checkpoint는 분산 시스템의 보편 패턴인 "checkpoint-restart"의 ML 버전이다. 슈퍼컴퓨터의 대규모 시뮬레이션, HPC 배치 작업도 똑같이 한다 — 긴 연산을 작은 구간으로 나눠 주기적으로 상태를 디스크에 박제(snapshot)하고, 노드가 죽으면 마지막 스냅샷에서 재개한다. 이는 "신뢰할 수 없는 자원 위에서 신뢰할 수 있는 장기 작업을 돌리는" 일반 해법이다. 체크포인트 없는 Spot 장기 학습은 회수 한 번에 전부 날아가므로, 시험에서 "Spot 학습 + 긴 작업 완료 보장"이 나오면 Checkpoint가 빠진 보기는 자동 오답이다.

> 📚 **사례**: OpenAI가 GPT-3(2020)·GPT-4를 학습할 때 수천 장의 GPU를 수 주~수 개월 돌렸는데, 이 규모에서는 하드웨어 장애가 "예외"가 아니라 "통계적 확정"이다(수천 GPU × 수 주면 그 중 일부는 반드시 죽는다). 그래서 대규모 학습은 체크포인트 없이는 애초에 불가능하다 — 한 노드 장애로 전체가 날아가면 학습이 영원히 끝나지 않는다. Meta는 Llama 3 학습(2024) 회고에서 16,000 GPU 클러스터에서 평균 3시간에 한 번꼴로 장애가 발생했고, 잦은 체크포인트와 자동 복구가 학습 완수의 핵심이었다고 밝혔다. SageMaker Managed Spot + Checkpoint는 이 산업 표준 패턴을 관리형으로 묶은 것이다.

## Bedrock / 생성형 AI 핵심 (Day 2 요약)

- **서버리스 FM API**, 멀티 벤더, 데이터 미학습, PrivateLink
- **RAG**(임베딩+벡터 검색+LLM) ↔ **Knowledge Bases**(관리형 RAG)
- **Agents**(Tool Use), **Guardrails**(PII·유해 = LLM용 WAF)
- **Provisioned Throughput** = 처리량 SLA + 장기 할인
- RAG = 지식 주입, fine-tuning = 행동·형식 조정

> ⚠️ **함정**: "사내 문서 기반 챗봇"에 fine-tuning을 고르면 거의 항상 오답이다. (1) 문서가 자주 바뀌는데 재학습은 느리고 비싸다, (2) fine-tuning은 지식 주입에 비효율적이고 환각·과적합 위험이 있다, (3) 출처 인용이 안 된다. 정답은 거의 RAG(Knowledge Bases). fine-tuning이 답인 경우는 "특정 말투/형식/도메인 행동을 학습"하라는 명시 조건이 있을 때뿐이다. OWASP는 2023년 "Top 10 for LLM Applications"에서 프롬프트 인젝션을 LLM01(최상위 위험)로 분류했는데, Guardrails가 일부를 막지만 만능은 아니며 최소 권한·출력 검증의 다층 방어가 필요하다.

## Managed AI 매핑 (Day 3 요약) — 비슷한 서비스 구분이 시험의 핵심

| 시나리오 | 답 |
|----------|-----|
| OCR 청구서·양식·ID | Textract (AnalyzeExpense/Document/ID) |
| 이미지·영상 객체·콘텐츠 검수 | Rekognition |
| 음성 → 텍스트 | Transcribe |
| 텍스트 → 음성 | Polly |
| 감정·엔티티·텍스트 PII | Comprehend |
| S3 저장 데이터 PII | **Macie** |
| 자연어 사내 검색 | Kendra |
| 추천 | Personalize / 사기 | Fraud Detector |
| 운영 이상 탐지 | DevOps Guru / 코드 | CodeGuru |

> ⚠️ **함정**: PII 탐지에서 **Macie vs Comprehend**가 단골 함정이다. 둘 다 PII를 찾지만 대상이 다르다 — **Macie**는 "S3 버킷에 **저장된** 데이터"를 스캔해 민감정보 위치를 발견·분류한다(데이터 거버넌스·규정 준수용). **Comprehend**의 DetectPiiEntities는 "흐르는 **임의 텍스트**"에서 실시간으로 PII를 탐지·마스킹한다(파이프라인 처리용). "S3에 쌓인 데이터의 PII 현황 파악"이면 Macie, "추출/입력 텍스트에서 PII 마스킹"이면 Comprehend. 한편 LLM 응답의 PII는 또 다른 답 — **Guardrails**다. 같은 "PII"라도 데이터가 어디 있느냐가 답을 가른다.

> 🔍 **더 깊이**: Textract는 단순 OCR(글자 읽기)이 아니라 "문서 구조 이해"다. AnalyzeExpense는 영수증·청구서의 품목·금액·세금을 **의미적으로** 추출하고, AnalyzeDocument는 표(table)·양식(form)의 키-값 관계를 파악하며, AnalyzeID는 신분증의 이름·생년월일·번호를 필드로 뽑는다. 그래서 "직접 Tesseract + 정규식"으로 짜는 보기는 거의 오답 — 정규식은 양식이 조금만 바뀌어도 깨지고, 표·중첩 구조를 못 읽으며, 운영 부담이 크다. 시험에서 "청구서/양식/ID에서 구조화된 데이터 추출 + 운영 부담 최소"는 Textract 전용 API가 정답이다.

## MLOps (Day 4 요약) — 모델은 배포가 끝이 아니다

- **Pipelines**(ML 전용 DAG·Lineage) / **Registry**(버전·승인) / **Feature Store**(Online DDB·Offline S3)
- **Model Monitor**: Data Quality(라벨X) / Model Quality(라벨O) / Bias / Feature Attribution Drift
- 재학습 루프: Monitor 드리프트 → EventBridge → Pipeline 재실행

> 💡 **관련 이론**: ML 시스템의 핵심 난제는 "모델은 배포 후 조용히 썩는다(model decay)"는 것이다. 전통 소프트웨어는 코드가 변하지 않으면 동작이 같지만, ML 모델은 코드가 그대로여도 **세상이 바뀌면** 정확도가 떨어진다. 이걸 **드리프트(drift)**라 한다. 두 종류가 있다 — (1) **데이터 드리프트**: 입력 분포 자체가 변함(예: 코로나 이후 소비 패턴 급변), (2) **컨셉 드리프트**: 입력-출력 관계가 변함(같은 입력인데 정답이 달라짐, 예: 사기 수법 진화). 이론적으로 ML 모델은 "학습 데이터와 운영 데이터가 같은 분포(IID)"라는 가정 위에 서는데, 현실 세계는 이 가정을 끊임없이 깬다. MLOps는 이 깨짐을 감지하고 자동으로 모델을 갱신하는 인프라다.

> 🔍 **더 깊이**: Data Quality와 Model Quality 모니터의 본질적 차이는 "라벨(정답)이 필요한가"다. **Data Quality**는 입력 데이터의 통계 분포만 기준선과 비교하므로 라벨이 필요 없다 — 빠르게 데이터 드리프트의 "조기 경보"를 준다. **Model Quality**는 모델의 예측과 **실제 정답**을 비교해 정확도·정밀도·재현율 하락(컨셉 드리프트)을 잡으므로 라벨이 있어야 하고, 라벨이 늦게 오면 감지도 늦다. 실무에서는 둘을 함께 쓴다 — Data Quality로 즉시 경보를 받고, 라벨이 도착하면 Model Quality로 진짜 정확도 하락을 확인한다. 시험에서 "라벨이 늦게 온다 + 자동 재학습"이면 Data Quality가 답인 이유가 이것이다.

> 💡 **관련 이론**: Feature Store가 푸는 문제는 **train-serve skew(학습-서빙 불일치)**다. ML 시스템의 악명 높은 버그 유형으로, 학습 때 쓴 피처 계산 로직과 추론 때 쓴 로직이 미묘하게 달라 정확도가 조용히 무너지는 현상이다(예: 학습은 배치로 "지난 7일 평균"을 계산했는데, 추론은 실시간으로 다르게 계산). Feature Store는 Online(DynamoDB 저지연 추론용)과 Offline(S3 학습·분석용)을 **단일 정의에서 자동 동기화**해, 학습과 추론이 같은 피처를 쓰도록 보장한다. 이는 분산 시스템의 "single source of truth(단일 진실 공급원)" 원칙의 ML 적용이다.

---

> 📚 **사례**: 한 보험사가 ML/AI를 도입하며 네 영역을 한꺼번에 잘못 설계했다가 재구성한 적이 있다. (1) 사고 사진 분석에 자체 비전 모델을 6개월간 만들다가 Rekognition Custom Labels로 2주 만에 대체(Managed AI), (2) 약관 챗봇을 GPT fine-tuning으로 시도했다가 약관 개정 때마다 재학습 비용이 들어 Bedrock Knowledge Bases(RAG)로 전환(생성형), (3) 보험료 예측 모델을 EC2에 직접 서빙하다가 train-serve skew로 정확도가 흔들려 SageMaker Feature Store 도입(MLOps), (4) 모델이 조용히 노후화되는 걸 못 잡다가 Model Monitor + EventBridge 재학습 루프로 자동화. 교훈: ML/AI 시스템의 실패는 모델 자체보다 "어느 추상화 수준을 골랐는가"와 "운영 인프라를 갖췄는가"에서 갈린다. 시험 시나리오도 정확히 이 네 갈래를 묻는다.

> 📚 **사례**: Zillow의 "Zillow Offers"(주택 매입 사업)는 2021년 ML 모델 실패로 사업 자체를 접고 약 25%의 인력(2,000여 명)을 감원한 유명한 사고다. 자체 가격 예측 모델(Zestimate 기반)로 주택을 사들였는데, 2021년 부동산 시장이 급변하면서 모델이 학습한 과거 패턴과 현실의 괴리(데이터/컨셉 드리프트)가 커져 시세보다 비싸게 매입하는 일이 누적됐고, 7,000여 채를 손해 보며 떠안았다. 핵심 교훈은 "모델은 만든 순간이 아니라 운영하는 내내 검증돼야 한다"는 것 — Model Monitor 같은 드리프트 감지와 빠른 재학습/중단 메커니즘이 없으면, 정확하던 모델도 세상이 바뀌면 조용히 회사를 망가뜨린다. SAP가 MLOps(드리프트 감지 + 자동 재학습)를 ML 시나리오의 한 축으로 두는 실전적 이유가 이런 사고에 있다.

> 🎯 **시나리오**: "프로덕션 사기 탐지 모델이 시간이 지나며 정확도가 떨어진다고 의심된다. 사기 수법이 계속 진화하기 때문이다. 실제 사기 여부(라벨)는 며칠 뒤 조사로 확정된다. 모델 노후화를 자동 감지하고, 임계치 초과 시 사람 개입 없이 재학습하려면?" — 라벨이 늦으므로 즉시 감지는 **Data Quality**(입력 분포 드리프트, 라벨 불필요)로 하고, EventBridge가 임계치 초과를 잡아 **SageMaker Pipeline 재실행**을 트리거해 재학습 루프를 자동으로 닫는다. 라벨이 도착하면 **Model Quality**로 실제 정확도 하락을 사후 확인한다. "사기 수법 진화"는 전형적 컨셉 드리프트이고, "라벨이 늦다"가 Data Quality를 답으로 확정하는 키워드다.

## 핵심 경계 요약 — 시험 직전 한 페이지

한 주의 모든 함정을 "A vs B" 형태로 압축하면 이렇다. 시험장에서 이 표만 떠올려도 절반은 잡는다.

| 헷갈리는 쌍 | A | B | 가르는 키워드 |
|-------------|---|---|---------------|
| **추론 큰 페이로드** | Async(요청별) | Batch(데이터셋 일괄) | "건별/업로드" vs "전체/야간" |
| **생성형 데이터 주입** | RAG(지식·최신·출처) | Fine-tuning(행동·형식·말투) | "사내 문서/최신" vs "말투/JSON 형식" |
| **PII 탐지** | Macie(S3 저장 데이터) | Comprehend(임의 텍스트) | "S3에 쌓인" vs "흐르는 텍스트" |
| **LLM 응답 PII·유해** | Guardrails | (WAF/Macie는 오답) | "LLM 입출력" |
| **사내 검색** | Kendra(자연어·권한) | OpenSearch(키워드·로그) | "질의응답/권한" vs "로그/키워드" |
| **드리프트 감지** | Data Quality(라벨X·조기) | Model Quality(라벨O·정확도) | "라벨 늦음" vs "라벨 있음" |
| **배포 검증** | Shadow(영향 0·미러링) | A/B(실제 트래픽 분할) | "영향 없이" vs "일부 사용자에게" |
| **자체 설계 칩** | Inferentia(추론) | Trainium(학습) | "추론 비용" vs "학습 비용" |
| **ML 오케스트레이터** | SageMaker Pipelines(ML 전용) | Step Functions(범용) | "Lineage/실험/캐싱" vs "범용 워크플로우" |

---

## 📝 시나리오 12문항

**문제 1.** 사내 위키 기반 질의응답 챗봇을 만든다. 운영 부담을 최소화하고, 데이터가 인터넷을 경유하지 않아야 하며, 답변에 고객 PII가 노출되면 안 된다. 문서는 자주 갱신된다. 가장 적합한 구성은?

A) SageMaker Endpoint에 오픈소스 LLM을 직접 호스팅하고 위키로 fine-tuning

B) Bedrock Knowledge Bases + Guardrails + VPC Interface Endpoint(PrivateLink)

C) Amazon Kendra만으로 검색 결과 반환

D) OpenSearch + Lambda로 자체 RAG 구축

**정답: B**
해설: Knowledge Bases가 관리형 RAG로 운영 부담을 최소화하고 문서 갱신을 즉시 반영하며, Guardrails가 PII를 마스킹하고, PrivateLink가 인터넷 미경유 호출을 보장한다. 세 가지 조건(운영 부담 최소·인터넷 미경유·PII 차단)이 각각 Knowledge Bases·PrivateLink·Guardrails로 정확히 매핑된다. A(fine-tuning)는 자주 갱신되는 문서에 재학습이 느리고 비싸며 출처·환각 문제로 사내 챗봇에 거의 오답. C(Kendra)는 검색 결과만 주고 생성형 대화 답변이 아니다. D는 RAG를 직접 구축해 운영 부담이 크다. 함정: "사내 문서 챗봇 + 운영 부담 최소"는 Knowledge Bases, fine-tuning은 오답.

---

**문제 2.** GPU 학습 비용을 최대한 줄이되 Spot 인스턴스가 회수돼도 며칠짜리 학습이 완료되어야 한다. 어떻게 구성하는가?

A) Reserved Instance로 학습 클러스터를 1년 약정해 시간당 단가를 낮추고 중단 없이 완주

B) Managed Spot Training + Checkpoint(checkpoint_s3_uri)

C) Compute Savings Plans로 약정 할인을 받고 회수 시 On-Demand로 자동 폴백하도록 구성

D) On-Demand로 학습하되 에폭마다 결과를 캐싱해 재시작 시간을 단축

**정답: B**
해설: Managed Spot Training은 최대 90% 할인된 Spot을 쓰고, Checkpoint로 회수 시 마지막 저장 지점부터 재개해 긴 학습을 완료시킨다. 체크포인트 없는 Spot 학습은 긴 작업에서 회수 한 번에 전부 날아가 거의 완료되지 못하므로 둘은 항상 함께 쓴다(분산 시스템의 checkpoint-restart 패턴). A·C는 약정 할인이지 90%에 못 미치고 중단 복구와 무관. D는 비용 절감이 없다. 함정: "학습 90% 절감 + 중단 복구"는 Spot + Checkpoint.

---

**문제 3.** 사용자가 업로드하는 800MB 위성 이미지를 모델이 분석하는데 추론에 약 5분이 걸린다. 동기 응답은 타임아웃이 나고 트래픽은 불규칙하다. 가장 적합한 추론 옵션은?

A) Real-Time Endpoint

B) Serverless Inference

C) Async Inference

D) Batch Transform

**정답: C**
해설: Async Inference는 큐 기반으로 최대 1GB 페이로드와 긴 처리 시간을 지원하고 결과를 S3에 쓴다. 내부적으로 요청을 큐에 적재하고 즉시 접수 응답을 준 뒤 백그라운드로 추론하므로 동기 타임아웃을 우회한다. 800MB(>6MB)와 5분(>60초)은 Real-Time/Serverless의 페이로드·타임아웃 한계를 초과한다. D(Batch Transform)는 데이터셋 전체 일괄 처리형이지 사용자 업로드 건별 요청-응답형이 아니다. 함정: "큰 페이로드 + 긴 추론 + 요청별"은 Async, "데이터셋 일괄"은 Batch.

---

**문제 4.** 프로덕션 추천 모델을 새 버전으로 교체하기 전, 실제 운영 트래픽에서 새 모델의 동작을 검증하되 사용자 응답에는 전혀 영향을 주지 않아야 한다. 어떤 전략인가?

A) Canary 배포

B) A/B Test(Production Variants)

C) Shadow Endpoint(Shadow Testing)

D) Multi-Model Endpoint

**정답: C**
해설: Shadow Endpoint는 운영 트래픽을 새 모델에 복제(미러링)하지만 출력을 사용자에게 반환하지 않으므로 0 영향으로 새 모델을 검증한다. A(Canary)·B(A/B)는 일부 사용자가 실제로 새 모델 응답을 받아 "영향 없이"라는 조건에 어긋난다. D는 비용 최적화용 다중 모델 서빙이지 배포 검증 전략이 아니다. 함정: "영향 없이 미러링 비교"는 Shadow, "실제 트래픽 분할"은 A/B.

---

**문제 5.** 운영 중 모델의 실제 예측 정확도가 서서히 떨어지는 것을 자동 감지하려 한다. 실제 정답(라벨)은 확보 가능하다. 어떤 모니터링인가?

A) Model Monitor Data Quality로 입력 피처 분포를 기준선과 비교해 정확도 하락을 감지

B) Model Monitor Model Quality

C) SageMaker Clarify의 Bias Drift 모니터로 그룹별 편향 변화만 추적

D) 예측값을 CloudWatch Custom Metric으로만 내보내 임계치 알람 설정

**정답: B**
해설: Model Quality는 실제 라벨과 예측을 비교해 정확도·정밀도·재현율 하락(컨셉 드리프트)을 감지하며, 라벨이 확보 가능할 때 쓴다. A(Data Quality)는 입력 분포만 보고 실제 정확도는 모른다(라벨 불필요한 조기 경보용). C는 편향용, D는 ML 드리프트 자동 감지가 아니다. 함정: "실제 정확도 하락 + 라벨 있음"은 Model Quality, "라벨 없이 조기 감지"는 Data Quality.

---

**문제 6.** 월 수만 건의 공급사 PDF 청구서에서 품목·금액·세금을 자동 추출하고, 추출 텍스트의 담당자 PII를 마스킹한 뒤 DynamoDB에 저장하는 파이프라인을 만든다. 어떤 조합인가?

A) Rekognition + Macie

B) Textract AnalyzeExpense + Comprehend DetectPiiEntities

C) Comprehend + Kendra

D) Lambda Tesseract + 정규식

**정답: B**
해설: AnalyzeExpense는 청구서·영수증 전용으로 품목·금액·세금을 의미적으로 정확히 추출하고, 추출된 임의 텍스트의 PII는 Comprehend로 탐지·마스킹한다. A(Rekognition)는 이미지 객체용이고 Macie는 S3 저장 데이터 스캔용이라 흐르는 텍스트 PII에 부적합. C(Kendra)는 검색용. D는 직접 구축 부담·정확도 열위(정규식은 양식이 바뀌면 깨짐). 함정: 청구서=AnalyzeExpense(전용), 텍스트 PII=Comprehend(S3 저장이면 Macie).

---

**문제 7.** LLM 챗봇 응답에서 주민번호·카드번호를 마스킹하고 폭력·증오 표현을 차단해야 한다. 가장 적합한 것은?

A) AWS WAF

B) Bedrock Guardrails

C) Amazon Macie

D) Comprehend + Lambda 후처리

**정답: B**
해설: Bedrock Guardrails는 LLM 입출력에 특화된 안전 필터로 PII 마스킹·유해 콘텐츠·금지 주제·프롬프트 인젝션 방어를 관리형으로 제공한다("LLM용 WAF"). A(WAF)는 HTTP 웹 공격 방어, C(Macie)는 S3 PII, D는 직접 구현 부담이 크고 유해 탐지가 빈약. 같은 "PII"라도 LLM 응답이면 Guardrails, S3 저장이면 Macie, 흐르는 텍스트면 Comprehend로 답이 갈린다. 함정: "LLM 응답 PII·유해 차단"은 Guardrails.

---

**문제 8.** SageMaker Feature Store의 Online Store와 Offline Store 차이를 가장 정확히 설명한 것은?

A) Online = S3 학습용, Offline = DynamoDB 추론용

B) Online = DynamoDB 기반 저지연 실시간 추론용, Offline = S3 기반 학습·분석용

C) 둘은 동일하며 이름만 다르다

D) Offline = 실시간 추론, Online = 배치 분석

**정답: B**
해설: Online Store는 DynamoDB 기반으로 밀리초 단건 조회를 제공해 실시간 추론에 쓰고, Offline Store는 S3+Glue 기반으로 대량 과거 이력을 담아 학습·배치·분석에 쓴다. 둘은 단일 피처 정의에서 자동 동기화되어 학습·추론 피처 일관성(train-serve skew 방지)을 보장한다. A는 용도가 뒤바뀌었고, C·D는 틀린 설명. 함정: Online=DDB 저지연 추론, Offline=S3 학습.

---

**문제 9.** 자동 학습된 모델이 정확도 기준(>0.9)을 통과하면 레지스트리에 등록하고, 데이터 과학자가 승인하면 사람 개입 없이 엔드포인트에 자동 배포되어야 한다. 어떤 구성인가?

A) 모든 단계를 수동 운영

B) Model Registry 승인 상태 + EventBridge(Approved) → Lambda 배포

C) CodeDeploy 수동 승인

D) CloudFormation 수동 배포

**정답: B**
해설: Model Registry가 승인 게이트(Pending/Approved/Rejected)를 제공하고, Approved 이벤트를 EventBridge로 잡아 Lambda 배포를 자동 트리거한다. "사람 승인 + 승인 후 자동 배포"의 하이브리드 거버넌스가 ML 배포 표준이다. A·C·D는 자동화가 없거나 모델 버전·lineage 거버넌스가 빠졌다. 함정: "검토 승인 + 자동 배포"는 Model Registry + EventBridge.

---

**문제 10.** 추론 처리량은 크지만 비용을 줄이기 위해 NVIDIA GPU 대신 AWS 자체 설계 추론 전용 칩을 쓰려 한다. 어떤 칩인가?

A) Trainium(Trn1)

B) Inferentia(Inf1/Inf2)

C) Graviton

D) F1 FPGA

**정답: B**
해설: Inferentia는 AWS가 설계한 추론 전용 ASIC으로 같은 처리량을 GPU보다 낮은 비용에 낸다. AWS가 학습 칩(Trainium)과 추론 칩(Inferentia)을 의도적으로 분리 설계한 점이 정답의 근거다. A(Trainium)는 학습 전용, C(Graviton)는 범용 ARM CPU(추론 전용 아님), D(F1 FPGA)는 커스텀 하드웨어 가속용이지 ML 추론 전용 칩이 아니다. 함정: 추론=Inferentia, 학습=Trainium, 범용 CPU=Graviton.

---

**문제 11.** 운영 중 모델의 입력 분포가 학습 기준선에서 임계치 이상 벗어나면 사람 개입 없이 재학습 파이프라인을 자동 실행하려 한다. 라벨은 늦게 온다. 전체 연결은?

A) Model Quality 모니터 → 수동 재학습

B) Model Monitor Data Quality(드리프트) → EventBridge → SageMaker Pipeline 재실행

C) Lambda 크론으로 매일 무조건 재학습

D) Config 규칙 → SNS 알림만

**정답: B**
해설: 라벨이 늦으므로 라벨 불필요한 Data Quality로 입력 분포 드리프트를 감지하고, 임계치 초과 시 EventBridge가 SageMaker Pipeline 재실행을 트리거해 재학습 루프를 자동으로 닫는다. A(Model Quality)는 라벨이 필요해 늦고 수동. C는 드리프트와 무관한 무조건 재학습으로 비용 낭비. D는 알림만으로 재학습이 없다. 함정: "라벨 늦음 + 드리프트 자동 재학습"은 Data Quality + EventBridge + Pipelines.

---

**문제 12.** 전처리·학습·튜닝·평가·등록·배포로 이어지는 ML 워크플로우를 DAG로 표현하고, 스텝별 lineage·실험 추적과 변경 없는 스텝 캐싱이 필요하다. 가장 적합한 오케스트레이터는?

A) AWS Step Functions

B) SageMaker Pipelines

C) Amazon MWAA(Airflow)

D) AWS Glue Workflow

**정답: B**
해설: SageMaker Pipelines는 ML 전용 DAG로 학습/튜닝/평가/등록 스텝, Model Registry 연동, Lineage 자동 추적, 스텝 캐싱을 기본 제공한다. A(Step Functions)는 범용 워크플로우라 ML lineage·실험 추적이 약하고, C(MWAA)는 복잡 스케줄링·Airflow 마이그레이션용, D(Glue Workflow)는 ETL용으로 ML lineage·실험 추적이 없다. 함정: "ML 워크플로우 + Lineage/실험/캐싱"은 SageMaker Pipelines.

---

## 📌 Week 10 한 줄 정리

> "SageMaker = 커스텀 ML 플랫폼(추론 4종·Spot 학습·전용 칩), Bedrock = 생성형 AI 서버리스(RAG·Guardrails), Managed AI = 이미 풀린 문제는 API로, MLOps = Pipelines·Registry·Feature Store·Monitor로 드리프트와 재학습을 자동화."

## 🎯 핵심 경계 (시험 직전 점검)

- **Async vs Batch**: 요청별 큰 페이로드 = Async / 데이터셋 일괄 = Batch
- **RAG vs Fine-tuning**: 지식·최신·출처 = RAG / 행동·형식·말투 = fine-tuning
- **Macie vs Comprehend PII**: S3 저장 데이터 = Macie / 임의 텍스트 = Comprehend
- **Kendra vs OpenSearch**: 자연어·권한 = Kendra / 키워드·로그 = OpenSearch
- **Data Quality vs Model Quality**: 라벨 없이 입력 드리프트 = Data / 라벨로 정확도 = Model
- **Shadow vs A/B**: 영향 없는 미러링 = Shadow / 실제 트래픽 분할 = A/B
- **Inferentia vs Trainium**: 추론 칩 = Inferentia / 학습 칩 = Trainium

---

## 🎯 다음 주 (Week 11) 예고

보안 심화 — KMS(암호화·키 관리)·Macie·GuardDuty·Inspector·Security Hub·WAF·Shield. ML/AI에서 다룬 데이터 보호·PII가 보안 도메인으로 확장된다.
