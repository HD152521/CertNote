# Day 46 - SageMaker 심화: ML 라이프사이클, 추론 엔드포인트 4종, 학습 비용 수학

머신러닝 인프라를 처음 설계하는 엔지니어가 가장 자주 빠지는 함정은 "모델을 EC2에 띄우고 Flask로 서빙하면 되지 않나"라는 생각이다. 실제로 모델 하나를 띄우는 것 자체는 어렵지 않다. 문제는 그 다음이다. 데이터가 바뀌면 모델 성능이 조용히 무너지고(drift), 학습 때 쓴 피처와 추론 때 쓰는 피처가 미묘하게 달라져 정확도가 떨어지고(train-serve skew), 모델을 새로 배포할 때마다 다운타임이 생기고, GPU 인스턴스 비용이 month-end에 청구서로 돌아와 충격을 준다. SageMaker는 이 "모델 이후의 모든 것"을 관리형으로 묶은 플랫폼이다. SAP-C02 시험에서 SageMaker는 단일 기능이 아니라 **"어떤 추론 패턴을 고를 것인가", "학습 비용을 어떻게 90% 줄일 것인가", "재학습을 어떻게 자동화할 것인가"**라는 아키텍처 의사결정으로 출제된다.

오늘은 SageMaker의 컴포넌트를 나열하는 대신, ML 라이프사이클이 왜 그렇게 생겼는지, 추론 엔드포인트 4종이 각각 어떤 물리적 제약에서 갈라지는지, 그리고 Spot 학습의 비용 수학이 어떻게 성립하는지를 분해한다.

## ML 라이프사이클 — 왜 "배포"가 끝이 아닌가

전통적인 소프트웨어는 코드를 배포하면 그 동작이 고정된다. 입력 X에 대해 항상 같은 출력 Y를 낸다. 머신러닝 시스템은 다르다. 모델의 동작은 **학습 시점의 데이터 분포**에 묶여 있고, 세상이 변하면 그 분포가 변한다. 2019년에 학습한 신용 사기 탐지 모델은 2020년 팬데믹으로 소비 패턴이 급변하자 정확도가 폭락했다. 코드는 한 줄도 안 바뀌었는데 모델이 "틀리기" 시작한 것이다. 이게 ML 라이프사이클이 순환(loop)인 이유다: Data 수집 → Feature 엔지니어링 → Training → Evaluation → Deploy → **Monitor** → (drift 감지) → Retrain → 다시 처음으로.

SageMaker의 컴포넌트는 이 순환의 각 단계를 매핑한다. Data Wrangler/Processing Job(피처), Training Job(학습), Model Registry(버전·승인), Endpoint(서빙), Model Monitor(감시), Pipelines(전체 DAG 오케스트레이션). 시험에서 컴포넌트 이름을 외우는 것보다 중요한 건 "이 시나리오는 라이프사이클의 어느 단계 문제인가"를 짚는 것이다.

> 💡 **관련 이론**: ML 시스템의 이 순환은 Google이 2015년 NeurIPS에 발표한 "Hidden Technical Debt in Machine Learning Systems" 논문에서 정립됐다. 핵심 주장은 "ML 코드는 전체 시스템의 5%에 불과하고, 나머지 95%는 데이터 수집·검증·서빙·모니터링 같은 인프라"라는 것. SageMaker, Vertex AI, Azure ML 같은 관리형 ML 플랫폼은 모두 이 95%를 제품화하려는 시도다. SAP 관점에서 "ML 모델을 만들었는데 운영에서 자꾸 깨진다"는 문제의 답이 거의 항상 인프라(Feature Store, Model Monitor, Pipelines)인 이유가 이 논문이 지적한 구조 때문이다.

> 🔍 **더 깊이**: SageMaker는 2017년 re:Invent에서 출시됐다. 그 이전 AWS의 ML은 EMR 위에서 Spark MLlib을 돌리거나 EC2에 직접 프레임워크를 깔아야 했다. SageMaker의 핵심 설계 결정은 **학습과 추론을 컨테이너로 추상화**한 것이다. 모든 학습 작업과 추론 엔드포인트는 ECR의 Docker 이미지로 실행된다. AWS가 제공하는 빌트인 알고리즘 컨테이너(XGBoost, Linear Learner 등)를 쓰거나, TensorFlow/PyTorch 같은 프레임워크 컨테이너에 자기 코드를 넣거나(script mode), 완전히 커스텀 컨테이너를 BYOC(Bring Your Own Container)로 가져올 수 있다. 이 컨테이너 추상화 덕분에 "학습은 GPU 8개로 1시간, 추론은 CPU 1개로 상시"처럼 학습과 서빙의 자원을 완전히 분리해 비용을 최적화할 수 있다.

## 추론 엔드포인트 4종 — 물리적 제약이 선택을 가른다

SageMaker의 추론 옵션이 4종으로 갈라지는 건 마케팅이 아니라 **요청 크기·지연 요구·트래픽 패턴**이라는 세 축의 물리적 제약 때문이다.

**Real-Time Endpoint**는 항상 켜져 있는 인스턴스에 동기 요청을 보내 수십 ms 안에 응답받는다. 추천, 사기 탐지처럼 사용자가 기다리는 온라인 추론에 쓴다. 단점은 트래픽이 없어도 인스턴스 비용이 계속 나간다는 것.

**Serverless Inference**는 요청이 올 때만 컨테이너를 띄우고 끝나면 0으로 내린다. 트래픽이 간헐적이거나 예측 불가일 때 유휴 비용을 없앤다. 대가는 **콜드 스타트** — 한동안 요청이 없다가 들어오면 컨테이너를 띄우는 수백 ms~수 초의 지연. 그래서 "콜드 스타트를 견딜 수 있는 가변 트래픽"이 조건이다.

**Async Inference**는 요청을 큐에 넣고 처리한 뒤 결과를 S3에 쓰고 SNS로 알린다. **최대 1GB 페이로드, 최대 15분(현재는 최대 1시간)** 처리를 지원한다. 큰 이미지/비디오/문서를 추론하거나 추론 자체가 수 분 걸리는 무거운 모델에 쓴다. 동기 응답이 불가능한 워크로드의 답이다. 요청이 없으면 인스턴스를 0으로 내릴 수도 있다.

**Batch Transform**은 엔드포인트가 아니라 일회성 배치 작업이다. S3의 대량 데이터셋 전체에 추론을 돌리고 결과를 S3에 쓴다. 상시 서빙이 필요 없는 야간 일괄 스코어링(예: 전체 고객 이탈 예측 갱신)에 쓴다.

> 🎯 **시나리오**: "사용자가 500MB 위성 이미지를 업로드하면 모델이 분석하는데 추론에 약 3분이 걸린다. 동기 HTTP 응답으로는 타임아웃이 난다. 트래픽은 하루 수십 건으로 불규칙하다. 최적 구성은?" — 답은 **Async Inference**. 이유: (1) 500MB 페이로드 → Real-Time/Serverless의 6MB 페이로드 한계를 초과하지만 Async의 1GB 한계 내, (2) 3분 추론 → 동기 응답 불가, Async는 큐 기반이라 OK, (3) 불규칙 트래픽 → Async는 0으로 스케일 다운 가능. Batch Transform도 큰 페이로드를 처리하지만 "사용자가 업로드하면 그 건만 처리"하는 요청-응답형이 아니라 데이터셋 전체 일괄 처리형이라 이 시나리오엔 부적합. 함정: "큰 페이로드 + 긴 추론 + 요청별 처리"는 Async, "데이터셋 전체 일괄"은 Batch.

> ⚠️ **함정**: Real-Time과 Serverless의 페이로드 한계는 6MB, 응답 타임아웃은 60초다. "큰 파일을 실시간 엔드포인트로 보내면 되지 않나"라고 생각하면 시험에서 틀린다. 6MB를 넘는 입력이나 60초를 넘는 추론은 무조건 Async 또는 Batch로 가야 한다. 또 Serverless Inference는 GPU를 지원하지 않으므로(2024 기준 대부분 CPU/제한적), 무거운 딥러닝 추론에는 Real-Time GPU 엔드포인트가 필요하다.

## Multi-Model / Multi-Container — 한 엔드포인트에 여러 모델

수백~수천 개의 작은 모델(예: 고객사별 맞춤 모델)을 각각 별도 엔드포인트로 띄우면 인스턴스 비용이 폭발한다. **Multi-Model Endpoint(MME)**는 하나의 엔드포인트(인스턴스)에 여러 모델을 올려두고, 요청이 오면 해당 모델을 S3에서 메모리로 동적 로딩해 추론한다. 자주 안 쓰는 모델은 메모리에서 내려 LRU 캐시처럼 관리한다. 수천 개 모델을 소수 인스턴스로 서빙해 비용을 극적으로 줄인다.

**Multi-Container Endpoint**는 한 엔드포인트에 서로 다른 프레임워크/모델 컨테이너를 올려, 직접 호출(direct invocation)하거나 추론 파이프라인(serial)으로 엮는다.

> 🔍 **더 깊이**: MME가 효율적인 이유는 "긴 꼬리(long-tail) 트래픽" 분포 때문이다. 고객사별 모델 1000개가 있어도 동시에 활발히 쓰이는 건 소수다. 나머지는 가끔 호출된다. 모델마다 전용 인스턴스를 주면 99%의 인스턴스가 놀게 된다. MME는 활발한 모델만 메모리에 두고 나머지는 S3에 두었다가 호출 시 로드하므로, 인스턴스 메모리를 "캐시"처럼 공유한다. 대가는 캐시 미스(콜드 모델 첫 호출) 시 S3 로딩 지연이다. 이 트레이드오프는 CPU 캐시 계층(L1/L2/메모리/디스크)의 동작 원리와 정확히 같다 — 빠른 자원은 작고 비싸니, 자주 쓰는 것만 올려두고 나머지는 느린 계층에 둔다.

## 학습 비용 수학 — Managed Spot Training이 90%인 이유

ML 학습은 GPU 인스턴스(ml.p3, ml.p4, ml.g5)를 쓰는데, 이게 SageMaker 비용의 대부분을 차지한다. ml.p3.2xlarge는 시간당 약 $3.8, ml.p4d.24xlarge는 시간당 약 $37이다. 큰 모델을 며칠씩 학습하면 수천 달러가 나온다.

**Managed Spot Training**은 EC2 Spot 인스턴스(AWS의 여유 용량을 최대 90% 할인)를 학습에 쓴다. Spot의 문제는 AWS가 2분 통보 후 인스턴스를 회수할 수 있다는 것. 학습이 90% 진행된 시점에 회수되면 처음부터 다시 해야 하므로 치명적이다. SageMaker는 이를 **Checkpoint**로 푼다. 학습 중간 상태(가중치)를 주기적으로 S3에 저장하고(`checkpoint_s3_uri`), Spot이 회수되면 새 Spot에서 마지막 체크포인트부터 재개한다. 그래서 90% 할인을 받으면서도 작업이 완료된다.

비용 수학을 구체화하면: On-Demand로 10시간 학습 = ml.p3.2xlarge × $3.8 × 10 = $38. Spot으로 같은 학습 = $38 × (1 − 0.7~0.9) ≈ $4~11. 다만 Spot 회수로 재시작이 잦으면 실제 벽시계 시간이 늘어 `max_wait`(대기 포함 최대 시간)를 `max_run`(순수 학습 시간)보다 충분히 크게 잡아야 한다.

> 💡 **관련 이론**: Spot + Checkpoint 패턴은 분산 시스템의 **체크포인팅(checkpoint-restart)** 내고장성 기법이다. HPC(고성능 컴퓨팅)와 슈퍼컴퓨터에서 수십 시간 걸리는 시뮬레이션이 노드 장애로 날아가지 않도록 오래전부터 쓰던 기법이다. 핵심 트레이드오프는 체크포인트 빈도다 — 너무 자주 저장하면 I/O 오버헤드, 너무 드물면 회수 시 잃는 작업량이 커진다. 학습 작업에서는 보통 epoch마다 또는 N step마다 저장한다. 같은 원리가 Flink/Spark Streaming의 상태 체크포인트, 게임의 자동 저장에도 쓰인다.

> 📚 **사례**: 한 자율주행 스타트업이 매주 수십 개의 비전 모델을 ml.p3.16xlarge로 재학습하며 월 GPU 비용이 6만 달러를 넘었다. Managed Spot Training으로 전환하되 학습 코드에 epoch마다 S3 체크포인트를 저장하도록 수정하니, Spot 회수가 평균 학습당 1~2회 발생해도 마지막 체크포인트부터 재개되어 작업이 완료됐고 비용이 약 70% 줄었다(월 6만 → 1.8만). 교훈: Spot 학습의 성패는 체크포인트 구현에 달려 있다. 체크포인트 없이 Spot을 쓰면 긴 학습은 거의 완료되지 못한다. SAP 시험에서 "학습 비용 90% 절감 + 중단 복구"는 항상 Managed Spot + Checkpoint 조합이다.

## 분산 학습과 전용 칩 — 큰 모델을 빠르고 싸게

한 GPU에 안 들어가는 큰 모델이나 데이터는 **Distributed Training**으로 여러 GPU/인스턴스에 나눈다. 두 방식이 있다. **Data Parallel**은 같은 모델을 여러 GPU에 복제하고 데이터 배치를 나눠 처리한 뒤 그래디언트를 동기화한다(데이터가 크고 모델은 한 GPU에 들어갈 때). **Model Parallel**은 모델 자체를 여러 GPU에 쪼갠다(모델이 한 GPU 메모리를 초과하는 초거대 모델, 예: LLM).

추론·학습 비용은 **전용 칩**으로도 줄인다. **Inferentia(Inf1/Inf2)**는 추론 전용 ASIC으로, 같은 처리량을 GPU보다 싸게 낸다. **Trainium(Trn1)**은 학습 전용 칩이다. 둘 다 AWS가 직접 설계한 칩으로, 범용 GPU(NVIDIA)보다 특정 워크로드에서 가성비가 높다. **SageMaker Neo**는 모델을 특정 하드웨어(Inferentia, 엣지 디바이스)에 맞게 컴파일해 추론 속도를 높인다.

> 🔍 **더 깊이**: AWS가 Inferentia/Trainium 같은 자체 칩을 만든 건 NVIDIA GPU 의존도와 비용 때문이다. 생성형 AI 붐으로 GPU 수요가 폭증하며 공급이 부족하고 단가가 치솟았다. AWS는 Annapurna Labs(2015년 인수)를 통해 Graviton(범용 CPU), Inferentia(추론), Trainium(학습)을 자체 설계해 수직 통합했다. 이는 Google이 TPU를, Apple이 M 시리즈를 만든 것과 같은 전략 — 핵심 워크로드의 칩을 직접 설계해 비용과 성능을 통제하는 것이다. 시험에서 "추론 비용·성능 최적화 칩"은 Inferentia, "학습 전용 칩"은 Trainium, "범용 컴퓨팅 가성비"는 Graviton으로 구분한다.

## 배포 전략 — A/B, Canary, Shadow

새 모델을 프로덕션에 올릴 때 한 번에 100% 트래픽을 넘기면 위험하다. SageMaker는 여러 배포 전략을 지원한다. **A/B Test(Production Variants)**는 한 엔드포인트에 여러 모델 변형을 두고 트래픽을 가중치로 분할(예: 90:10)해 실제 성능을 비교한다. **Canary/Linear 배포**는 새 버전에 트래픽을 점진적으로 늘리며 문제 시 롤백한다. **Shadow Endpoint**는 실시간 운영 트래픽을 새 모델에 **복제(미러링)**해 실제로 응답에 반영하지 않으면서 새 모델이 어떻게 반응할지 비교한다.

> 🎯 **시나리오**: "프로덕션 추천 모델을 새 버전으로 교체하려는데, 새 모델이 실제 트래픽에서 어떻게 동작하는지 사용자 응답에 영향을 주지 않고 검증하고 싶다. 어떤 전략인가?" — 답은 **Shadow Endpoint(Shadow Testing)**. Shadow는 실제 트래픽을 새 모델에 복제하지만 그 출력을 사용자에게 반환하지 않으므로, 사용자 경험에 0 영향으로 새 모델의 지연·에러·예측을 기존 모델과 비교할 수 있다. A/B는 일부 사용자가 실제로 새 모델 응답을 받으므로 "사용자에게 영향 없이"라는 조건에 어긋난다. 함정: "영향 없이 미러링 비교"는 Shadow, "트래픽 분할 실제 비교"는 A/B.

## Feature Store와 노코드 도구

**Feature Store**는 학습과 추론이 같은 피처를 쓰도록 보장하는 중앙 저장소다. **Online Store**(DynamoDB 기반, 저지연)는 실시간 추론용, **Offline Store**(S3 + Glue)는 학습·배치용이다. 학습 때 쓴 피처 계산 로직과 추론 때 쓴 로직이 다르면 **train-serve skew**가 생겨 모델이 조용히 틀린다 — Feature Store가 이를 막는다. **Data Wrangler**는 노코드 데이터 준비, **Canvas**는 비즈니스 분석가용 노코드 ML, **JumpStart**는 사전 학습 모델 1-click 배포, **Ground Truth**는 데이터 레이블링 도구다.

## 정리하며

SageMaker는 "모델 그 자체"가 아니라 **모델을 둘러싼 라이프사이클 전체**를 관리형으로 묶은 플랫폼이다. 추론 엔드포인트 4종은 페이로드 크기·지연 요구·트래픽 패턴이라는 물리적 제약에서 갈라지고(Real-Time=저지연 동기, Serverless=가변+콜드OK, Async=큰 페이로드+긴 추론, Batch=일괄), 학습 비용은 Managed Spot+Checkpoint로 90%까지 줄이며, 전용 칩(Inferentia/Trainium)으로 추가 최적화한다.

SAP 시험 단골 매핑: (1) "큰 페이로드 + 긴 추론 + 요청별" → Async, (2) "데이터셋 전체 일괄" → Batch Transform, (3) "학습 90% 절감 + 중단 복구" → Managed Spot + Checkpoint, (4) "수천 모델 비용 절감" → Multi-Model Endpoint, (5) "추론 비용 칩" → Inferentia, (6) "사용자 영향 없이 신모델 검증" → Shadow, (7) "학습·추론 피처 일관성" → Feature Store. 다음 day는 Bedrock과 생성형 AI 아키텍처(RAG)를 본다.

---

## 📝 연습 문제

**문제 1.** 사용자가 800MB 의료 영상을 업로드하면 모델이 분석하는데 추론에 약 5분이 걸린다. 동기 HTTP 응답은 타임아웃이 나고, 트래픽은 하루 수십 건으로 불규칙하다. 가장 적합한 추론 옵션은?

A) Real-Time Endpoint
B) Serverless Inference
C) Async Inference
D) Multi-Model Endpoint

**정답: C**
해설: Async Inference는 큐 기반으로 요청을 받아 결과를 S3에 쓰고 SNS로 알리며, 최대 1GB 페이로드와 긴 처리 시간을 지원한다. 800MB(>6MB 한계)와 5분 추론(>60초 타임아웃)은 Real-Time(A)·Serverless(B)의 페이로드/타임아웃 한계를 모두 초과하므로 불가하다. Async는 불규칙 트래픽에서 0으로 스케일 다운도 가능. D(Multi-Model)는 여러 모델을 한 엔드포인트에 올리는 비용 최적화 기법이지 큰 페이로드/긴 추론 문제의 답이 아니다. 함정: "큰 페이로드 + 긴 추론 + 요청별 처리"는 무조건 Async.

---

**문제 2.** GPU 학습 비용을 최대 90% 절감하면서 Spot 인스턴스 회수 시에도 학습이 완료되도록 보장해야 한다. 어떻게 구성하는가?

A) Reserved Instance로 학습
B) Managed Spot Training + Checkpoint(checkpoint_s3_uri)
C) Compute Savings Plans 적용
D) On-Demand로 학습 후 결과 캐싱

**정답: B**
해설: Managed Spot Training은 Spot 인스턴스(최대 90% 할인)를 학습에 쓰고, Checkpoint(주기적 가중치를 S3에 저장)로 Spot 회수 시 마지막 체크포인트부터 재개해 작업을 완료시킨다. 이 둘은 항상 함께 쓴다 — 체크포인트 없는 Spot 학습은 긴 작업에서 거의 완료되지 못한다. A(Reserved)·C(Savings Plans)는 약정 할인이지 90%에 못 미치고 중단 복구와 무관. D는 비용 절감이 없다. 함정: "학습 90% 절감 + 중단 복구"는 항상 Spot + Checkpoint.

---

**문제 3.** 1000개 고객사별 맞춤 모델을 서빙해야 한다. 각 모델은 가끔만 호출되고, 모델마다 별도 엔드포인트를 띄우면 인스턴스 비용이 감당이 안 된다. 가장 적합한 구성은?

A) 모델마다 Serverless Inference 엔드포인트
B) Multi-Model Endpoint(MME)
C) 모델마다 Real-Time Endpoint
D) 모든 모델을 하나로 합쳐 단일 모델로 학습

**정답: B**
해설: Multi-Model Endpoint는 하나의 엔드포인트(소수 인스턴스)에 여러 모델을 올려두고, 요청 시 해당 모델을 S3에서 메모리로 동적 로딩해 추론하며 자주 안 쓰는 모델은 LRU로 내린다. 긴 꼬리 트래픽(대부분 모델이 가끔 호출)에서 인스턴스 메모리를 캐시처럼 공유해 비용을 극적으로 줄인다. A(모델당 Serverless)도 유휴 비용은 줄지만 1000개 엔드포인트 관리 부담이 크고 MME가 더 효율적. C는 비용 폭발. D는 고객사별 맞춤이 사라져 요구 위반. 함정: "다수의 가끔 쓰는 모델 비용 절감"은 MME.

---

**문제 4.** 새 추천 모델을 프로덕션에 올리기 전, 실제 운영 트래픽에서 새 모델의 지연·에러·예측을 검증하되 사용자 응답에는 전혀 영향을 주지 않아야 한다. 어떤 배포 전략인가?

A) A/B Test(Production Variants)
B) Canary 배포
C) Shadow Endpoint(Shadow Testing)
D) Blue/Green 배포

**정답: C**
해설: Shadow Endpoint는 실시간 운영 트래픽을 새 모델에 복제(미러링)하지만 그 출력을 사용자에게 반환하지 않으므로, 사용자 경험에 0 영향으로 새 모델을 기존 모델과 비교한다. A(A/B)·B(Canary)·D(Blue/Green)는 모두 일부 사용자가 실제로 새 모델의 응답을 받으므로 "사용자 응답에 영향 없이"라는 조건에 어긋난다. 함정: "영향 없이 트래픽 미러링 비교"는 Shadow, "실제 트래픽 분할 비교"는 A/B.

---

**문제 5.** 모델이 학습 때 쓴 피처와 실시간 추론 때 계산한 피처가 미묘하게 달라 정확도가 떨어지는 train-serve skew가 발생한다. 어떻게 방지하는가?

A) S3에 피처를 저장해 양쪽이 읽게 함
B) SageMaker Feature Store(Online/Offline)
C) DynamoDB에 피처를 직접 저장
D) 학습과 추론 코드를 같은 함수로 작성

**정답: B**
해설: SageMaker Feature Store는 학습용 Offline Store(S3+Glue)와 추론용 Online Store(DynamoDB 저지연)를 자동 동기화해, 양쪽이 동일하게 정의·계산된 피처를 쓰도록 보장한다. 이것이 train-serve skew를 막는 표준 해법이다. A(S3 공유)·C(DDB 직접)는 피처 정의·버전·동기화를 직접 관리해야 해 skew 위험이 남는다. D는 코드 일관성은 돕지만 피처 저장·서빙 인프라가 아니다. 함정: "학습·추론 피처 일관성"은 Feature Store.

---

**문제 6.** 매일 밤 전체 고객 5천만 명의 이탈 점수를 일괄로 다시 계산해 S3에 저장해야 한다. 상시 엔드포인트는 필요 없다. 가장 적합하고 경제적인 방법은?

A) Real-Time Endpoint를 밤에만 띄움
B) Batch Transform
C) Async Inference
D) Serverless Inference로 5천만 건 호출

**정답: B**
해설: Batch Transform은 엔드포인트가 아니라 일회성 배치 작업으로, S3의 대량 데이터셋 전체에 추론을 돌리고 결과를 S3에 쓴 뒤 인스턴스를 종료한다. 상시 서빙이 필요 없는 야간 일괄 스코어링의 정석이다. A는 엔드포인트 관리·기동 부담. C(Async)는 요청-응답형 개별 추론용이지 데이터셋 전체 일괄용이 아니다. D는 5천만 건을 개별 호출하면 비효율적이고 비싸다. 함정: "데이터셋 전체 일괄 추론"은 Batch Transform, "개별 요청 비동기"는 Async.

---

**문제 7.** 추론 비용과 성능을 최적화하기 위해 NVIDIA GPU 대신 AWS 자체 설계 추론 전용 칩을 쓰려 한다. 어떤 칩인가?

A) Trainium(Trn1)
B) Inferentia(Inf1/Inf2)
C) Graviton
D) F1 FPGA

**정답: B**
해설: Inferentia(Inf1/Inf2)는 AWS가 설계한 추론 전용 ASIC으로, 같은 처리량을 GPU보다 낮은 비용으로 낸다. A(Trainium)는 학습 전용 칩이고, C(Graviton)는 범용 ARM CPU(추론 전용이 아님), D(F1 FPGA)는 커스텀 하드웨어 가속용이지 ML 추론 전용 칩이 아니다. 함정: 추론=Inferentia, 학습=Trainium, 범용 CPU=Graviton.

---

## 📌 오늘의 요약

1. **ML 라이프사이클은 순환** — Deploy가 끝이 아니라 Monitor→drift→Retrain. "운영에서 깨지는" 문제는 인프라(Feature Store/Monitor/Pipelines)가 답
2. **추론 엔드포인트 4종** — Real-Time(저지연 동기), Serverless(가변+콜드OK), Async(큰 페이로드 1GB+긴 추론), Batch(데이터셋 일괄)
3. **페이로드/타임아웃 한계** — Real-Time/Serverless는 6MB·60초. 초과 시 Async/Batch
4. **Multi-Model Endpoint** — 다수의 가끔 쓰는 모델을 메모리 캐시처럼 공유해 비용 절감(긴 꼬리 트래픽)
5. **Managed Spot + Checkpoint** — 학습 90% 절감, 회수 시 마지막 체크포인트부터 재개. 체크포인트 없으면 무의미
6. **전용 칩** — Inferentia(추론), Trainium(학습), Graviton(범용 CPU). Neo로 컴파일 최적화
7. **배포 전략** — Shadow(영향 없는 미러링 비교), A/B(실제 트래픽 분할). Feature Store로 train-serve skew 방지
