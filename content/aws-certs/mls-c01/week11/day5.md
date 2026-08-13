# Day 5 - Week 11 Review: Monitoring, MLOps, Security, Operations

## 📌 핵심 정리

- Week 11은 "모델을 만든 다음의 세계"다. 모니터링·MLOps·보안·운영 네 축이 EventBridge와 Pipelines로 하나의 닫힌 루프를 이룬다.
- 모니터링 유형은 **레이블 유무**로 갈린다. 레이블 없음 → Data Quality, 레이블 있음 → Model Quality.
- 로깅은 **질문의 형태**로 갈린다. "왜 느린가·왜 실패했나" → CloudWatch, "누가 언제 무엇을 했나" → CloudTrail.
- 보안은 **실행 역할 + VPC 격리 + KMS 키 정책** 세 기둥. 운영 중 AccessDenied는 사용자 권한이 아니라 실행 역할부터 본다.
- 추론 비용은 트래픽 모양으로 갈린다. 간헐 → Serverless, 큰 페이로드 → Async, 모델 다수 → MME, 변동 → Auto Scaling.

## 한 장으로 보는 운영 루프

```text
[학습 데이터 S3]──(KMS 암호화, VPC 엔드포인트)──┐
                                               ▼
                 [SageMaker Pipeline] 처리→학습→평가
                                               │ ConditionStep (품질 게이트)
                                               ▼
                        [Model Registry] 버전·승인 (Approved)
                                               │ EventBridge
                                               ▼
                 [배포: Blue/Green·Canary] → [엔드포인트]
                          │                        │
                  CloudTrail (감사)          DataCapture (S3)
                          │                        ▼
                          │              [Model Monitor] 드리프트 탐지
                          │                        │ CloudWatch 경보
                          └────────────────────────┘ EventBridge → 재학습 (루프 시작)
```

- 이 루프 전체가 **IAM 실행 역할(최소 권한) · VPC 격리 · KMS 암호화** 위에서 돈다.
- 루프의 시작은 "드리프트 탐지", 종착은 "승인된 새 버전 배포"다. 문제를 읽으면 먼저 루프의 어느 지점을 묻는지 위치를 잡아라.

## Day 1~4 한 줄 요약

| Day | 주제 | 핵심 | 대표 서비스·기능 | 대표 함정 |
|---|---|---|---|---|
| 1 | 모니터링 | 레이블 없이 입력 분포 변화를 감시하는 1차 방어선. 위반 → 재학습 트리거 | Model Monitor(Data Quality / Model Quality / Bias Drift / Feature Attribution Drift), DataCapture | 재학습 후 베이스라인을 갱신하지 않아 오탐 폭증 |
| 2 | MLOps | 처리→학습→평가→등록→배포를 코드로 정의해 재현·추적·자동화 | Pipelines(DAG, ConditionStep), Model Registry(버전·승인), Projects(CI/CD) | ConditionStep 없이 성능 미달 모델이 자동 배포 |
| 3 | 보안 | 누가(실행 역할)·어디로(VPC)·무엇을 열 수 있나(KMS 키 정책) | Execution Role, VpcConfig, VPC 엔드포인트, CMK, Macie | AccessDenied를 사용자 권한으로만 조사 |
| 4 | 운영 | 비용·감사·복구. 학습과 추론은 비용 구조가 반대다 | Spot / Serverless / Async / MME, CloudWatch, CloudTrail, S3 CRR·Multi-AZ | 간헐 트래픽에 상시 GPU 엔드포인트 |

## 가장 자주 갈리는 판단 분기 5종

| # | 분기 | 지문 신호 | 정답 |
|---|---|---|---|
| 1 | 모니터링 유형 | 레이블 없음 / 레이블 있음 / 피처 기여도 변화 / 그룹 편향 변화 | Data Quality / Model Quality / Feature Attribution Drift / Bias Drift |
| 2 | 로깅 서비스 | 성능·실패 디버깅 / 누가 언제 무엇을(감사) | CloudWatch / CloudTrail |
| 3 | 추론 비용 | 간헐 트래픽 / 큰 페이로드·긴 처리 / 모델 다수 공유 / 변동 트래픽 | Serverless / Async / Multi-Model Endpoint / Auto Scaling |
| 4 | 권한 문제 | 학습·엔드포인트에서 AccessDenied | 실행 역할(Execution Role) 권한 |
| 5 | 인터넷 차단 요건 | 데이터가 인터넷을 거치면 안 됨 | 프라이빗 서브넷 + VPC 엔드포인트 + 네트워크 격리 |

> 💡 **관련 이론**: 스페셜티 시험의 운영 영역은 "기능을 아는가"가 아니라 "이 상황에서 무엇을 고를 것인가"를 묻는다. 위 다섯 분기가 운영 문제의 거의 전부를 덮는다. 키워드(레이블 없음, 누가, 간헐, AccessDenied, 인터넷 금지)를 보는 즉시 분기로 튀도록 훈련하는 것이 곧 점수다.

## 시험 단서 키워드 → 정답 번역표

| 지문 단서 | 정답 | 이유 |
|---|---|---|
| "정답 레이블을 즉시 얻을 수 없다" | Model Monitor **Data Quality** | 레이블 없이 입력 분포만으로 감지하는 1차 방어선 |
| "레이블이 며칠 뒤 도착한다, 정확도 하락 확인" | **Model Quality** | 예측과 나중에 온 레이블을 병합해 지표 계산 |
| "SHAP 기여도 순위·크기가 바뀌었다" | **Feature Attribution Drift** | Clarify 기여도를 베이스라인과 비교 |
| "그룹 간 공정성 지표가 흔들린다" | **Bias Drift** | Clarify 기반 편향 모니터링 |
| "재학습 후 매 실행마다 위반이 뜬다" | **베이스라인 재생성** | 의도적으로 가르친 새 분포를 정상으로 다시 등록 |
| "누가 언제 엔드포인트를 지웠나" | **CloudTrail** | API 호출 주체·시각·소스 IP 기록 |
| "학습이 왜 실패했나, 손실 곡선은" | **CloudWatch Logs / Metrics** | 애플리케이션 로그와 성능 지표 |
| "트래픽이 하루 중 잠깐만 몰린다" | **Serverless Inference** | 유휴 비용 0, 호출 단위 과금 |
| "페이로드가 크고 즉시 응답이 필요 없다" | **Asynchronous Inference** | 큐 기반, 0까지 스케일 축소 |
| "수천 개 모델을 한 엔드포인트로" | **Multi-Model Endpoint** | 모델 다수를 공유 호스팅 |
| "트래픽 변동은 크지만 실시간 응답 필요" | **실시간 엔드포인트 + Auto Scaling** | 급증 흡수, 유휴 시 축소 |
| "학습 비용을 대폭 줄여라" | **Managed Spot Training + `checkpoint_s3_uri`** | 중단 가능한 대신 저렴, 체크포인트로 재개 |
| "AccessDenied인데 사용자는 콘솔에서 잘 읽는다" | **실행 역할 권한 부족** | 작업은 사용자 자격이 아니라 실행 역할로 동작 |
| "데이터가 인터넷을 거치면 안 된다" | **프라이빗 서브넷 + S3 VPC 게이트웨이 엔드포인트** | 인터넷 경로 없이 사설 접근 |
| "컨테이너의 외부 호출 자체를 막아라" | **`enable_network_isolation=True`** | 컨테이너의 네트워크 호출 차단 |
| "분산 학습 노드 간 트래픽이 평문이면 안 된다" | **`encrypt_inter_container_traffic=True`** | 노드 간 통신 암호화 |
| "팀별로 복호화를 격리해야 한다" | **팀별 KMS CMK + 키 정책** | IAM이 허용해도 키 정책이 최종 차단 |
| "S3에 PII가 섞였는지 자동 탐지" | **Amazon Macie** | S3 민감정보 탐지·분류 |
| "같은 코드·데이터면 같은 결과(재현성)" | **SageMaker Pipelines 정의** | 워크플로를 코드로 고정 |
| "지표 미달 모델은 등록·배포 금지" | **ConditionStep + Model Registry 승인** | 자동 품질 게이트 + 사람 게이트 이중화 |
| "어떤 모델이 어떤 데이터로 학습됐나, 롤백" | **Model Registry** | 버전·승인 상태·계보(lineage) 관리 |
| "경보를 받아 재학습 파이프라인을 시작" | **EventBridge** | 이벤트 라우팅으로 Pipeline·Lambda 호출 |
| "소량 트래픽으로 먼저 검증 후 확대" | **Canary 배포** | 위험 최소화 |
| "빌드·배포 리포와 CI/CD를 자동 프로비저닝" | **SageMaker Projects** | MLOps 템플릿 |
| "단일 AZ 장애를 견뎌라" | **`instance_count` ≥ 2** | 여러 AZ에 자동 분산 |
| "리전 장애에도 데이터·모델 복원" | **S3 교차 리전 복제 + 버전 관리 + Model Registry** | 복제와 복원 대상 버전 추적 |
| "엔드포인트를 다른 리전·계정에 재생성" | **IaC(CloudFormation / Pipelines)** | 인프라를 코드로 재현 |
| "외부 DB 자격 증명을 코드 밖에서 관리" | **Secrets Manager** | 자격 증명 하드코딩 제거 |

## 헷갈리는 짝 대조표

### Data Quality vs Model Quality

| 항목 | Data Quality | Model Quality |
|---|---|---|
| 감시 대상 | 입력 피처 통계(결측·타입·분포) | 정확도·F1·RMSE 등 예측 품질 |
| 레이블 | 불필요 | 필요 |
| 탐지 시점 | 즉시 (1차 방어선) | 레이블이 도착한 뒤 (지연) |
| 잡아내는 것 | 데이터 드리프트 | 개념 드리프트까지 |

### CloudWatch vs CloudTrail

| 항목 | CloudWatch | CloudTrail |
|---|---|---|
| 기록하는 것 | 로그·지표(손실, 지연, CPU/GPU) | 모든 AWS API 호출 |
| 답하는 질문 | "왜 실패했나, 얼마나 느린가" | "누가 언제 어디서 무엇을 호출했나" |
| 주 용도 | 디버깅·경보 | 감사·규정 준수 |
| 보관 | 로그 그룹 / 지표 | S3에 영구 저장, 변조 방지 |

### 배포 전략: Blue/Green vs Canary vs Linear vs A/B

| 전략 | 동작 | 언제 |
|---|---|---|
| Blue/Green | 새 플릿을 띄우고 전환 | 기본 안전 배포 |
| Canary | 소량 트래픽 먼저 → 확인 후 확대 | 위험 최소화 |
| Linear | 정해진 비율씩 단계적으로 증가 | 점진적 관찰 |
| A/B (Production Variant) | 두 모델에 트래픽을 분할 | 성능 비교 |

### Serverless vs Async vs 실시간 vs MME

| 옵션 | 트래픽 모양 | 유휴 비용 | 특징 |
|---|---|---|---|
| Serverless Inference | 간헐·예측 불가 | 0 | 호출 단위 과금 |
| Asynchronous Inference | 큰 페이로드, 즉시성 불필요 | 0까지 축소 | 큐 기반 처리 |
| 실시간 + Auto Scaling | 상시 + 변동 | 최소 인스턴스만큼 | 급증 흡수, 유휴 축소 |
| Multi-Model Endpoint | 모델 수가 매우 많음 | 공유 | 하나의 엔드포인트에 다수 모델 |

### 실행 역할 vs 사용자 IAM 권한

| 항목 | 실행 역할(Execution Role) | 사용자 IAM 권한 |
|---|---|---|
| 적용 대상 | 학습 작업·엔드포인트·파이프라인이 실행 중 사용 | 콘솔·CLI를 쓰는 사람 |
| 신뢰 정책 | `sagemaker.amazonaws.com`이 `sts:AssumeRole` | 해당 없음 |
| 전형적 증상 | 작업 로그에 AccessDenied | 콘솔 화면에서 거부 |
| 시험 빈도 | 운영 중 AccessDenied는 대부분 이쪽 | 오답 유인으로 자주 등장 |

### Debugger vs Model Monitor vs Clarify

| 도구 | 시점 | 보는 것 |
|---|---|---|
| SageMaker Debugger | 학습 중 | 텐서·기울기 등 학습 과정 이상 |
| Model Monitor | 배포 후 | 입력 분포·예측 품질의 드리프트 |
| Clarify | 학습 전후 및 운영 | 데이터·모델 편향, SHAP 피처 기여도 |

## 통합 시나리오 체크포인트

의료 데이터로 학습한 분류 모델을 운영하는 상황이다. 요구사항은 네 가지다 — (1) 데이터가 인터넷에 노출되면 안 된다, (2) 입력 분포가 변하면 자동으로 재학습해야 한다, (3) 누가 엔드포인트를 변경했는지 감사해야 한다, (4) 트래픽이 간헐적이라 유휴 비용을 줄여야 한다.

| 요구사항 | 구성 | 근거 |
|---|---|---|
| (1) 인터넷 비노출 | 프라이빗 서브넷 + S3 VPC 엔드포인트 + KMS CMK + 실행 역할 최소 권한 | Day 3 |
| (2) 분포 변화 시 자동 재학습 | DataCapture → Model Monitor(Data Quality) → CloudWatch 경보 → EventBridge → Pipeline 재학습 → Model Registry 승인 → 재배포 | Day 1·2 |
| (3) 변경 감사 | CloudTrail로 API 호출 기록, 로그를 S3에 보관 | Day 4 |
| (4) 유휴 비용 절감 | Serverless Inference (유휴 비용 0) | Day 4 |

```text
(1) VPC 프라이빗 서브넷 + S3 VPC 엔드포인트 + KMS(CMK) + 실행 역할 최소 권한
(2) DataCapture → Model Monitor (Data Quality) → CloudWatch 경보
       → EventBridge → SageMaker Pipeline 재학습 → Model Registry 승인 → 재배포
(3) CloudTrail로 API 호출 감사, 로그는 S3에 보관
(4) Serverless Inference로 유휴 비용 0
```

- 한 상황처럼 보이지만 이번 주 4일치 지식이 한 조각씩 정확히 들어맞는다.
- 실제 시험은 이런 복합 지문에서 **하나만** 묻는다. 요구사항 문장을 분해해 어느 Day의 분기인지 라벨을 붙이는 연습이 곧 실전 훈련이다.

## 흔한 함정 정리표

| 함정 | 왜 틀리나 | 옳은 대응 | 출처 |
|---|---|---|---|
| 재학습 후 베이스라인을 그대로 둔다 | 의도적으로 가르친 새 분포를 위반으로 오탐 | 새 학습 데이터로 베이스라인 재생성 | Day 1 |
| Data Quality로 정확도 하락을 직접 확인하려 한다 | 입력 통계만 보므로 정확도를 알 수 없다 | 레이블 확보 후 Model Quality | Day 1 |
| ConditionStep 없이 자동 등록·배포 | 성능 미달 모델이 그대로 운영에 나간다 | ConditionStep + 승인 게이트 이중화 | Day 2 |
| 등록 즉시 Approved로 둔다 | 사람 검토 없이 배포 자동화가 이어진다 | `PendingManualApproval` 기본값 유지 | Day 2 |
| AccessDenied를 사용자 권한만 조사한다 | 작업은 실행 역할로 동작한다 | 실행 역할 정책·신뢰 정책 확인 | Day 3 |
| 암호화만 켜고 키 정책은 방치 | IAM이 허용해도 키 정책이 최종 결정 | CMK 키 정책으로 복호화 주체 분리 | Day 3 |
| NAT 게이트웨이로 "인터넷 차단"을 처리 | NAT는 오히려 아웃바운드 인터넷 경로다 | VPC 엔드포인트 + 네트워크 격리 | Day 3 |
| "누가 했나"를 CloudWatch에서 찾는다 | CloudWatch는 성능·로그 영역 | CloudTrail | Day 4 |
| 간헐 트래픽에 상시 GPU 엔드포인트 | 유휴 비용 낭비 | Serverless 또는 Auto Scaling | Day 4 |
| Spot 학습에 체크포인트를 설정하지 않는다 | 중단되면 처음부터 다시 | `checkpoint_s3_uri` 지정 | Day 4 |
| 추론 비용 절감에 Managed Spot Training | Spot은 학습 전용 절감 수단 | 추론은 Serverless / Async / MME | Day 4 |

## 운영 도메인 자가 점검

1. 레이블이 없는데 성능 저하가 의심되면 무엇부터 보나? → **Data Quality 모니터링**
2. 재학습 뒤 매 실행마다 위반이 발생한다면? → **베이스라인 재생성**
3. 지표 미달 모델의 자동 배포를 막는 조합은? → **ConditionStep + Model Registry 승인 게이트**
4. Model Registry에 새로 등록된 버전의 기본 승인 상태는? → **PendingManualApproval**
5. 사용자는 잘 읽는데 학습 작업만 S3에서 거부된다면? → **실행 역할의 S3 권한 부족**
6. 인터넷을 거치지 않고 S3에 접근하려면? → **S3용 VPC 게이트웨이 엔드포인트**
7. "누가 언제 무엇을 호출했나"를 증명하려면? → **CloudTrail**
8. 단일 AZ 장애를 견디는 가장 간단한 조치는? → **`instance_count`를 2 이상으로**

다음 주에는 도메인별 통합 복습과 시험 대비로 전 과정을 마무리한다.

## 📖 용어

- **드리프트(drift)** : 배포 후 입력 데이터나 데이터-정답 관계가 학습 시점과 달라지는 현상. 입력이 변하면 데이터 드리프트, 관계가 변하면 개념 드리프트다.
- **베이스라인(baseline)** : "정상은 이런 모습"을 기록해 둔 통계·제약 스냅샷(`statistics.json` / `constraints.json`). 모니터링은 이것과 비교해 위반을 판정한다.
- **DataCapture** : 엔드포인트가 실제 요청·응답을 S3에 자동 저장하는 기능. 모니터링의 원재료다.
- **ConditionStep** : 파이프라인에서 평가 지표를 임계값과 비교해 다음 단계 실행 여부를 가르는 품질 게이트.
- **Model Package Group** : 같은 목적의 모델 버전들을 모아 두는 Model Registry의 묶음. 그 안에서 v1·v2… 버전이 승인 상태를 갖는다.
- **실행 역할(Execution Role)** : 학습 작업·엔드포인트가 실행 중에 빌려 쓰는 IAM 역할. 사람 계정이 아니라 이 역할의 권한으로 S3·KMS에 접근한다.
- **VPC 엔드포인트** : 인터넷을 거치지 않고 AWS 서비스에 접근하는 사설 통로. S3·DynamoDB는 게이트웨이형, SageMaker API 등은 인터페이스형(PrivateLink)이다.
- **키 정책(key policy)** : KMS 키 자체에 붙는 정책으로 "누가 이 키로 복호화할 수 있는가"를 정한다. IAM이 허용해도 여기서 막히면 복호화가 실패한다.
- **Canary 배포** : 새 버전에 아주 적은 트래픽만 먼저 보내 이상이 없는지 확인한 뒤 비중을 늘리는 방식.
- **RTO / RPO** : 장애 후 "얼마나 빨리 복구하는가(RTO)"와 "얼마만큼의 데이터 손실을 허용하는가(RPO)". DR 전략 선택의 두 축이다.

---

## 📝 연습 문제

**문제 1.** 운영 모델이 시간이 지나며 정확도가 떨어진다고 의심되지만 정답 레이블은 즉시 얻을 수 없다. 또한 입력 피처 일부의 통계가 학습 시점과 달라 보인다. 가장 먼저 적용할 모니터링은?

A) Model Quality 모니터링  
B) Data Quality 모니터링  
C) CloudTrail 분석  
D) A/B 프로덕션 변형  

**정답: B**  
해설: 정답 없이 입력 분포 변화를 감지하는 Data Quality 모니터링이 1차 방어선이다. Model Quality(A)는 정답이 필요하고, CloudTrail(C)은 API 감사, A/B(D)는 배포 비교용이다.

---

**문제 2.** 자동화된 ML 파이프라인에서 평가 지표가 임계값 미달인 모델이 절대 운영에 배포되지 않도록 하려 한다. 필요한 조합으로 가장 적절한 것은?

A) ConditionStep + Model Registry 승인(Approved) 게이트  
B) Multi-Model Endpoint + Auto Scaling  
C) Serverless Inference + Async Inference  
D) KMS CMK + VPC 엔드포인트  

**정답: A**  
해설: ConditionStep으로 지표 미달 시 등록을 막고, Model Registry 승인 게이트로 사람이 최종 통제하면 나쁜 모델의 자동 배포를 이중으로 차단한다. B·C는 추론 비용/호스팅, D는 보안 구성으로 품질 게이트와 무관하다.

---

**문제 3.** 보안 사고 조사에서 "어떤 IAM 주체가 언제 SageMaker 엔드포인트 구성을 변경했는가"를 추적해야 한다. 올바른 서비스는?

A) CloudWatch Metrics  
B) SageMaker Debugger  
C) AWS CloudTrail  
D) Amazon Macie  

**정답: C**  
해설: CloudTrail은 API 호출 주체·시각·소스 IP를 기록해 변경 감사를 지원한다. CloudWatch Metrics(A)는 성능 지표, Debugger(B)는 학습 분석, Macie(D)는 PII 탐지로 API 감사 용도가 아니다.

---

**문제 4.** 학습 데이터가 절대 인터넷을 거치지 않아야 하고, 팀별로 모델 아티팩트 복호화를 격리해야 한다. 가장 적절한 구성은?

A) 퍼블릭 서브넷 + 공유 KMS 관리형 키  
B) 프라이빗 서브넷 + S3 VPC 엔드포인트 + 팀별 KMS CMK와 키 정책  
C) NAT 게이트웨이 + 평문 저장  
D) 인터넷 게이트웨이 + IAM 사용자 분리만  

**정답: B**  
해설: 프라이빗 서브넷과 S3 VPC 엔드포인트로 인터넷을 배제하고, 팀별 CMK·키 정책으로 복호화 주체를 격리한다. 퍼블릭/NAT/IGW(A·C·D)는 인터넷 경로를 만들고 공유 키·평문은 격리 요건을 못 지킨다.

---

**문제 5.** 트래픽이 하루 중 일부 시간에만 몰리고 나머지는 거의 없는 추론 워크로드의 유휴 비용을 줄이면서, 동시에 트래픽 급증 시에도 견디게 하려 한다. 가장 적절한 조합은?

A) 단일 대형 GPU 인스턴스를 항상 가동  
B) Serverless Inference 또는 Auto Scaling이 적용된 실시간 엔드포인트  
C) Managed Spot Training으로 추론  
D) 엔드포인트를 수동으로 매일 켜고 끄기  

**정답: B**  
해설: 간헐 트래픽은 Serverless로 유휴 비용을 없애거나, 변동이 크면 Auto Scaling으로 급증을 흡수하는 실시간 엔드포인트가 적합하다. 항상 가동(A)은 낭비, Spot Training(C)은 학습용, 수동 운영(D)은 신뢰성이 낮다.

---
