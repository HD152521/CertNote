# Day 3 - 도메인 4 + 전체 종합: ML 구현·운영 복습 + 4도메인 교차

오늘은 마지막 도메인인 **도메인 4 ML 구현 및 운영(20%)**을 복습하고, 동시에 네 도메인을 가로지르는 "엔드투엔드 파이프라인" 관점으로 시야를 넓힌다. 도메인 4는 학습이 끝난 모델을 실제로 배포하고, 안전하게 운영하고, 모니터링하며, 비용·성능을 최적화하는 단계다. 시험 후반부 문제는 단일 도메인이 아니라 "데이터 수집부터 배포·모니터링까지" 여러 도메인이 한 시나리오에 섞여 나오므로, 오늘은 그 교차 지점을 정리한다.

## 한 장 요약: 학습된 모델에서 운영까지

```text
[학습된 모델 아티팩트 (S3)]
   │
   ├─ 1) 배포 형태 선택
   │     실시간 낮은 지연  → Real-time Endpoint
   │     간헐적/콜드 OK    → Serverless Inference
   │     대용량 오프라인   → Batch Transform
   │     초대형/긴 처리    → Asynchronous Inference
   │
   ├─ 2) 안전한 출시
   │     Blue/Green, Canary, Shadow 트래픽 전환
   │
   ├─ 3) 모니터링
   │     데이터/모델 드리프트 → Model Monitor
   │     편향·설명 지속 감시   → Clarify
   │     인프라 지표·로그      → CloudWatch
   │
   ├─ 4) 비용·성능 최적화
   │     오토스케일링, Multi-Model Endpoint, Spot 학습
   │
   └─ 5) 자동화/거버넌스
         Pipelines(MLOps), Model Registry, IAM/KMS
```

## 도메인 4: 추론(배포) 형태 4종

| 형태 | 단서 단어 | 특징 |
|------|------|------|
| Real-time Endpoint | 낮은 지연, 상시 온라인, 초당 요청 | 항상 켜진 엔드포인트, 비용 상시 |
| Serverless Inference | 간헐적 트래픽, 콜드스타트 허용, 운영 최소 | 사용량 기반 과금, 스케일 투 제로 |
| Batch Transform | 대용량 한 번에, 오프라인, 엔드포인트 불필요 | S3 입력→S3 출력, 상시 비용 없음 |
| Asynchronous Inference | 큰 페이로드, 긴 처리시간, 큐잉 | 요청 큐, 0까지 축소 가능 |

> 💡 **관련 이론**: 배포 형태 선택은 "지연 요구 × 트래픽 패턴 × 페이로드 크기"의 3차원 판단이다. 실시간 낮은 지연이면 Real-time, 트래픽이 띄엄띄엄하고 콜드스타트를 견디면 Serverless(비용 절감), 정해진 데이터셋을 한 번에 처리하면 엔드포인트가 필요 없는 Batch Transform, 페이로드가 크고(GB) 처리가 길면 Async가 정답이다. "엔드포인트를 상시 켤 필요 없다"가 보이면 Real-time은 오답으로 기운다.

## 도메인 4: 안전한 배포 전략

| 전략 | 내용 |
|------|------|
| Blue/Green | 신/구 환경 병행, 전환 후 롤백 용이 |
| Canary | 소수 트래픽부터 점진 전환 |
| Linear | 일정 비율씩 단계적 전환 |
| Shadow/A-B Testing | 신모델에 트래픽 복제(섀도)하거나 분기(A/B)해 비교 |

> 💡 **관련 이론**: Canary와 Shadow는 자주 혼동된다. Canary는 실제 트래픽의 일부를 신모델로 보내 사용자가 새 결과를 받는다(점진 전환). Shadow는 트래픽을 복제해 신모델에도 흘리지만 그 응답은 사용자에게 반환하지 않고 비교·검증에만 쓴다(무위험 평가). "사용자 영향 없이 프로덕션 트래픽으로 신모델을 검증"이면 Shadow다.

## 도메인 4: 모니터링과 운영

| 요구사항 | 서비스 |
|------|------|
| 입력 데이터 분포 변화(데이터 드리프트) 감지 | Model Monitor |
| 모델 품질/편향이 시간에 따라 악화되는지 감시 | Model Monitor + Clarify |
| 엔드포인트 지연·호출·에러율, 로그 | CloudWatch (+ Logs) |
| API 호출 감사 추적 | CloudTrail |
| 종단간 ML 워크플로 자동화(CI/CD) | SageMaker Pipelines |
| 모델 버전 관리·승인 | Model Registry |

> 💡 **관련 이론**: 드리프트는 두 종류다. 데이터 드리프트(입력 분포가 변함)와 컨셉 드리프트(입력-출력 관계가 변함)다. Model Monitor는 베이스라인(학습 시 분포)과 운영 데이터를 비교해 드리프트를 탐지하고, 임계 초과 시 CloudWatch 알람으로 재학습 트리거를 건다. "모델이 배포 후 점점 나빠진다"는 시나리오의 정답은 거의 항상 Model Monitor(+ 재학습 자동화)다.

## 도메인 4: 비용·성능·보안 최적화

| 목표 | 기법 |
|------|------|
| 트래픽 변동 대응 | 엔드포인트 오토스케일링 |
| 여러 모델을 적은 비용으로 호스팅 | Multi-Model Endpoint |
| 학습 비용 절감 | Managed Spot Training (최대 90%↓) |
| 추론 가속·저비용 | Inferentia/Elastic Inference, 모델 컴파일(Neo) |
| 저장·전송 데이터 보호 | KMS 암호화, S3 SSE, VPC 엔드포인트 |
| 최소 권한 접근 | IAM 역할, 리소스 정책 |

> 💡 **관련 이론**: Managed Spot Training은 중단 가능한 스팟 인스턴스를 써서 학습 비용을 크게 줄이되, 체크포인팅으로 중단 시 이어서 재개한다. 학습은 재시도가 가능하므로 스팟에 적합하지만, 낮은 지연이 필요한 실시간 추론은 스팟에 부적합하다. "비용 절감 + 학습 + 중단 허용"이면 Spot, "실시간 추론 비용 절감"이면 Serverless/오토스케일링/Inferentia로 분기한다.

## 4도메인 교차: 엔드투엔드 시나리오 매핑

| 단계 | 도메인 | 대표 선택 |
|------|------|------|
| 스트리밍 수집 | 1 | Kinesis Streams/Firehose |
| 레이크 저장·ETL | 1 | S3 + Glue, Athena |
| 정제·인코딩·EDA | 2 | 결측 처리, One-Hot, 표준화, QuickSight |
| 알고리즘·튜닝·평가 | 3 | XGBoost/CNN/DeepAR, AMT, F1/AUC/RMSE |
| 배포·모니터링·최적화 | 4 | Endpoint/Batch, Model Monitor, Spot |

> 💡 **관련 이론**: SageMaker Pipelines는 이 다섯 단계를 하나의 DAG로 엮어 자동화하는 MLOps 핵심이다. 데이터 처리(Processing) → 학습(Training) → 평가(Evaluation) → 조건부 등록(RegisterModel) → 배포까지를 코드로 정의해 재현 가능·버전 관리·자동 재학습이 가능해진다. "수동 단계를 자동화/표준화/CI-CD"라는 단서가 보이면 Pipelines + Model Registry 조합이 정답으로 향한다.

## 도메인 4 핵심 비교

| 비교 | 핵심 차이 |
|------|------|
| Real-time vs Batch Transform | 상시 온라인 저지연 vs 오프라인 대량(엔드포인트 불필요) |
| Serverless vs Real-time | 간헐 트래픽 스케일투제로 vs 상시 |
| Async vs Real-time | 큰 페이로드·긴 처리 큐잉 vs 즉시 응답 |
| Canary vs Shadow | 점진 전환(사용자 영향) vs 복제 검증(영향 없음) |
| Model Monitor vs CloudWatch | 데이터/모델 드리프트 vs 인프라 지표 |
| Multi-Model Endpoint vs 다중 엔드포인트 | 한 엔드포인트에 여러 모델 vs 모델당 엔드포인트 |
| Spot 학습 vs On-Demand | 비용↓·중단가능 vs 안정 |

## 자가 점검 질문

1. 큰 데이터셋을 한 번에 오프라인 채점, 엔드포인트 불필요면? → **Batch Transform**
2. 트래픽이 띄엄띄엄하고 콜드스타트를 견디면? → **Serverless Inference**
3. 사용자에게 영향 없이 프로덕션 트래픽으로 신모델 검증은? → **Shadow 테스트**
4. 배포 후 입력 분포가 학습 때와 달라지는지 감지는? → **Model Monitor**
5. 엔드포인트 지연·에러율·호출수 지표는 어디서? → **CloudWatch**
6. 학습 비용을 최대 90% 줄이되 중단을 견디는 방법은? → **Managed Spot Training**
7. 한 엔드포인트에 수백 개 모델을 저비용 호스팅은? → **Multi-Model Endpoint**
8. ML 워크플로를 DAG로 자동화·재현하는 서비스는? → **SageMaker Pipelines**

## 정리하며

도메인 4는 모델을 "쓸 수 있게" 만드는 마지막 단계다. 배포 형태는 지연·트래픽·페이로드의 3차원으로 고르고(실시간/서버리스/배치/비동기), 출시는 Canary·Shadow로 안전하게, 운영은 Model Monitor(드리프트)와 CloudWatch(인프라)로 감시하며, 비용은 Spot·Multi-Model·오토스케일링으로 줄인다. 그리고 네 도메인은 Pipelines로 엮인 하나의 엔드투엔드 흐름이다. 시험 후반의 종합 시나리오는 이 흐름의 어느 단계를 묻는지부터 짚어야 한다.

---

## 📝 연습 문제

**문제 1.** 매일 밤 수백만 건의 거래 기록을 한 번에 점수화해 S3에 저장하면 되고, 실시간 응답은 필요 없다. 가장 비용 효율적인 추론 방식은?

A) Real-time Endpoint를 24시간 가동  
B) Asynchronous Inference 엔드포인트 상시 가동  
C) Batch Transform  
D) Multi-Model Endpoint  

**정답: C**  
해설: 정해진 대량 데이터를 오프라인으로 한 번에 처리하고 상시 엔드포인트가 필요 없으면 Batch Transform이 가장 비용 효율적이다. 상시 Real-time(A)·상시 Async(B)는 불필요한 상시 비용이 들고, Multi-Model(D)은 여러 모델 호스팅용이다.

---

**문제 2.** 새 모델을 프로덕션에 올리기 전, 실제 트래픽으로 성능을 검증하되 사용자에게는 기존 모델 응답만 반환하고 싶다. 가장 적합한 전략은?

A) Canary 배포  
B) 즉시 전체 전환  
C) Blue/Green 후 즉시 100% 전환  
D) Shadow(섀도) 테스트  

**정답: D**  
해설: Shadow 테스트는 프로덕션 트래픽을 신모델에 복제해 흘리되 응답은 사용자에게 반환하지 않아 무위험으로 검증한다. Canary(A)는 실제 사용자에게 일부 신모델 응답이 가고, 즉시 전환(B)·즉시 100%(C)는 검증 없이 위험을 키운다.

---

**문제 3.** 배포된 모델의 예측 품질이 몇 주에 걸쳐 서서히 저하되고 있다. 입력 데이터 분포가 학습 시점과 달라졌는지 자동으로 감지하려면 무엇을 사용해야 하는가?

A) CloudTrail  
B) SageMaker Model Monitor  
C) AWS Config  
D) Elastic Inference  

**정답: B**  
해설: Model Monitor는 학습 시 베이스라인과 운영 입력을 비교해 데이터/모델 드리프트를 감지하고 임계 초과 시 알람을 보낸다. CloudTrail(A)은 API 감사, Config(C)는 리소스 구성 추적, Elastic Inference(D)는 추론 가속으로 드리프트 감지와 무관하다.

---

**문제 4.** 학습 잡의 비용을 크게 줄이고 싶고, 잡이 중간에 중단되어도 체크포인트에서 재개할 수 있도록 설계했다. 가장 적합한 옵션은?

A) Managed Spot Training  
B) On-Demand 인스턴스만 사용  
C) Serverless Inference  
D) Multi-Model Endpoint  

**정답: A**  
해설: Managed Spot Training은 중단 가능한 스팟 인스턴스로 학습 비용을 최대 90%까지 줄이며 체크포인팅으로 중단 시 재개한다. On-Demand(B)는 비용 절감이 없고, Serverless Inference(C)·Multi-Model(D)은 추론 측 기능이라 학습 비용과 무관하다.

---

**문제 5.** 데이터 처리 → 학습 → 평가 → 조건부 모델 등록 → 배포로 이어지는 ML 워크플로를 코드로 정의해 재현 가능하게 자동화하려 한다. 핵심 서비스 조합으로 가장 적절한 것은?

A) Lambda 단독으로 모든 단계 호출  
B) EC2 인스턴스에 cron 스크립트  
C) SageMaker Pipelines + Model Registry  
D) Glue 크롤러만 사용  

**정답: C**  
해설: SageMaker Pipelines는 ML 단계를 DAG로 정의해 재현·버전 관리·CI/CD를 제공하고, Model Registry로 모델 버전·승인을 관리한다. Lambda 단독(A)·cron 스크립트(B)는 표준화·재현성이 약하고, Glue 크롤러(D)는 메타데이터 카탈로깅 용도다.

---
