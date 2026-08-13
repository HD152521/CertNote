# Day 4 - Operations & Cost: Cost Optimization, Logging/Audit, Disaster Recovery

## 📌 핵심 정리

- 운영은 **비용**·**감사**·**복원력** 세 기둥이다. ML 워크플로는 데이터 파이프라인·학습 GPU·상시 엔드포인트에서 계속 돈이 나간다.
- 학습과 추론의 경제학은 정반대다. 학습은 **중단 감내(Spot)**로 깎고, 추론은 **유휴 비용 제거**로 깎는다.
- Managed Spot Training은 최대 **90%** 절감이지만 **체크포인트 저장이 사실상 필수**다.
- "왜 실패했나·얼마나 느린가"는 **CloudWatch**, "누가 언제 무엇을 했나"는 **CloudTrail**이다.
- DR은 **데이터 → 모델 → 엔드포인트** 세 자산을 각각 계획한다. 엔드포인트는 코드(IaC) + Model Registry로 재생성 가능해야 한다.

## 비용 최적화: 학습과 추론은 경제학이 다르다

| 관점 | 학습(Training) | 추론(Inference) |
|---|---|---|
| 작업 성격 | 배치, 한 번 돌고 끝남 | 상시 대기, 요청을 받아야 함 |
| 중단 감내 | 가능(체크포인트로 재개) | 어려움(요청이 즉시 실패) |
| 주된 낭비 | 과대 인스턴스, 가망 없는 시도를 끝까지 돌림 | **아무도 안 부르는데 켜져 있는 시간** |
| 대표 절감 수단 | Managed Spot, 조기 종료, 라이트사이징 | Serverless, Async, Batch Transform, Auto Scaling |
| 비용 단위 | 인스턴스 시간 × 작업 횟수 | 인스턴스 시간 × 24시간 × 365일 |

- 학습 비용은 **총량**이 문제고, 추론 비용은 **유휴 시간**이 문제다. 이 차이가 선택지를 가른다.
- 장기적으로 사용량이 안정적이면 SageMaker Savings Plans처럼 1년·3년 약정 할인도 후보가 된다.

### 학습 비용 절감

- **Managed Spot Training**: 여유 용량을 쓰는 대신 중단될 수 있다. 최대 **90%** 절감.
- **라이트사이징(Right-sizing)**: CPU로 충분하면 GPU를 쓰지 않고, 필요할 때만 분산 학습을 켠다.
- **AMT 조기 종료(early stopping)**: 하이퍼파라미터 튜닝에서 가망 없는 시도를 일찍 버린다.
- **최대 실행 시간 제한**: 무한 루프나 발산한 학습이 밤새 도는 것을 `max_run`으로 끊는다.
- **웜 스타트 튜닝**: 이전 튜닝 작업 결과를 이어받아 탐색 횟수를 줄인다.

#### Managed Spot Training 상세

```python
estimator = Estimator(
    ...,
    use_spot_instances=True,
    max_run=3600,        # 실제 학습에 허용하는 최대 시간
    max_wait=7200,       # 대기 + 학습을 합친 총 허용 시간 (max_run 이상이어야 함)
    checkpoint_s3_uri="s3://ml-train-bucket/checkpoints/job-01/",
)
```

| 파라미터 | 의미 | 빠뜨리면 |
|---|---|---|
| `use_spot_instances` | 스팟 용량 사용 여부 | 온디맨드 요금 그대로 |
| `max_run` | 학습 자체의 최대 실행 시간 | 폭주한 작업이 계속 과금 |
| `max_wait` | 스팟 용량 대기까지 포함한 총 허용 시간 | 스팟 사용 시 설정 필요, `max_run`보다 작게 두면 안 됨 |
| `checkpoint_s3_uri` | 체크포인트를 S3에 저장 | 중단 시 **처음부터 다시** 학습 |

```text
[Spot 학습 타임라인]
  용량 대기 ──▶ 학습 시작 ──▶ 체크포인트 저장 ──▶ ✗ 중단(Interruption)
                                     │
                                     └─▶ 용량 회복 ──▶ 체크포인트에서 재개 ──▶ 완료
  ◀────────────────── max_wait (대기 + 학습 전체) ──────────────────▶
                      ◀──────── max_run (학습 시간) ────────▶
```

> ⚠️ **함정**: "Spot으로 비용을 줄이되 진행 상황을 잃지 않으려면?"의 답은 언제나 **체크포인트**다. 네트워크 격리·KMS·샘플링 옵션은 중단 복구와 아무 관계가 없다.

### 추론 비용 절감: 4가지 배포 옵션

| 옵션 | 과금 방식 | 유휴 비용 | 0으로 축소 | 적합한 트래픽 |
|---|---|---|---|---|
| **Real-time Endpoint** | 인스턴스 시간(상시) | 있음 | 불가(기본) | 꾸준하고 지연에 민감한 트래픽 |
| **Serverless Inference** | 호출·실행 시간 기준 | 없음 | 가능 | 간헐적·예측 불가, 콜드 스타트 감내 가능 |
| **Asynchronous Inference** | 처리 중 인스턴스 시간 | 요청 없으면 0까지 | 가능 | 대용량 페이로드·긴 처리, 즉답 불필요 |
| **Batch Transform** | 작업 실행 시간만 | 없음(엔드포인트 자체가 없음) | 해당 없음 | 전체 데이터셋을 주기적으로 일괄 채점 |

| 보조 수단 | 하는 일 | 언제 |
|---|---|---|
| **Multi-Model Endpoint(MME)** | 한 엔드포인트에 수천 개 모델을 올려두고 요청 시 S3에서 로드 | 비슷한 구조의 모델이 많고 각각은 드물게 호출됨 |
| **Auto Scaling** | 트래픽에 따라 인스턴스 수를 늘리고 줄임 | 낮/밤 편차가 큰 실시간 트래픽 |
| **Inference Recommender** | 부하 테스트로 적합한 인스턴스 타입·수를 추천 | 어떤 인스턴스를 써야 할지 모를 때 |

- **Serverless**: 유휴 시 과금이 없는 대신 오랫동안 호출이 없으면 **콜드 스타트** 지연이 생긴다.
- **Async**: 요청을 큐에 넣고 결과를 S3에 쓴다. 큐가 비면 인스턴스를 0까지 줄일 수 있다.
- **Batch Transform**: 엔드포인트를 아예 만들지 않으므로 상시 비용이 0이다. 실시간 응답이 필요 없으면 가장 싸다.
- **MME**: 첫 호출 때 모델을 메모리에 올리므로 그 요청만 느려진다. 지연에 극도로 민감하면 부적합하다.

### 비용 선택 의사결정 트리

```text
추론 비용을 줄여야 한다
├─ 실시간 응답이 필요한가?
│    ├─ 아니오 ↓
│    │    ├─ 전체 데이터셋을 주기적으로 채점 → Batch Transform (상시 비용 0)
│    │    └─ 요청 단위지만 즉답 불필요·페이로드 큼 → Asynchronous Inference
│    └─ 예 ↓
├─ 트래픽이 간헐적이고 예측이 어려운가?
│    ├─ 예 → Serverless Inference (유휴 비용 0, 콜드 스타트 감내)
│    └─ 아니오 ↓
├─ 모델이 아주 많고 각각은 드물게 호출되는가?
│    ├─ 예 → Multi-Model Endpoint (엔드포인트 1개 공유)
│    └─ 아니오 ↓
└─ 꾸준하지만 시간대 편차가 큰가?
     ├─ 예 → Real-time + Auto Scaling
     └─ 아니오 → Real-time (라이트사이징 + 약정 할인 검토)
```

## 로깅·감사: CloudWatch vs CloudTrail

| 서비스 | 기록하는 것 | 답하는 질문 |
|------|------|------|
| **CloudWatch Logs** | 애플리케이션·작업 로그, 컨테이너 stdout/stderr | "학습이 왜 실패했나? 손실은 얼마였나?" |
| **CloudWatch Metrics** | CPU·GPU·메모리, 호출 수, 지연 시간 | "엔드포인트가 정상이었나? 스파이크가 있었나?" |
| **CloudTrail** | **모든 AWS API 호출** | "누가 이걸 삭제했나? 언제?" |

```text
학습 손실 곡선, 컨테이너 stdout   → CloudWatch Logs
엔드포인트 지연 시간, 오류율      → CloudWatch Metrics
"사용자 alice가 3:14 UTC에 DeleteEndpoint 호출" → CloudTrail
```

### 로그·지표가 어디로 가는가

| 신호 | 목적지 | 대표 항목 |
|---|---|---|
| 학습 컨테이너 stdout/stderr | CloudWatch Logs (`/aws/sagemaker/TrainingJobs`) | 스택 트레이스, 에폭 진행 상황 |
| 학습 손실·정확도 | CloudWatch Metrics (정규식으로 로그에서 추출) | `train:loss`, `validation:accuracy` 등 사용자 지정 지표 |
| 엔드포인트 컨테이너 로그 | CloudWatch Logs (`/aws/sagemaker/Endpoints/...`) | 추론 예외, 모델 로딩 실패 |
| 엔드포인트 호출·지연 | CloudWatch Metrics | `Invocations`, `ModelLatency`, `OverheadLatency`, `Invocation4XXErrors` |
| 인스턴스 리소스 | CloudWatch Metrics | `CPUUtilization`, `MemoryUtilization`, `GPUUtilization` |
| 관리 API 호출 | CloudTrail | `CreateTrainingJob`, `DeleteEndpoint`, `UpdateEndpoint` |
| 추론 입출력 원본 | S3 (Data Capture) | Model Monitor의 기준선·드리프트 분석 입력 |

- CloudTrail은 최근 이벤트를 콘솔에서 바로 볼 수 있지만, **장기 보관·감사에는 S3로 내보내는 추적(Trail)**이 필요하다.
- S3에 쌓인 CloudTrail 로그는 버킷 정책·객체 잠금으로 변조를 막고, Athena 등으로 질의해 감사 근거로 쓴다.
- 오래된 감사 로그는 S3 수명 주기로 저비용 스토리지 클래스로 옮겨 보관 비용을 줄인다.

> 💡 **관련 이론**: "성능을 디버깅한다" = CloudWatch. "규정 준수를 증명한다" = CloudTrail. CloudTrail은 모든 API의 누가·무엇을·언제·어디서를 남기는 규제 대응의 토대다.

> ⚠️ **함정**: CloudTrail은 관리(control plane) API를 남긴다. 초당 수천 건씩 들어오는 `InvokeEndpoint` 같은 고빈도 데이터 플레인 호출까지 감사 로그로 세려 하면 안 된다. 호출량·지연은 **CloudWatch 지표**로 본다.

## 재해 복구: 데이터 → 모델 → 엔드포인트

복구 계획이 필요한 자산은 세 가지다.

| 자산 | 잃으면 | 복구 전략 | 핵심 도구 |
|---|---|---|---|
| **데이터** | 재학습 자체가 불가능 | S3 교차 리전 복제, 버전 관리, 불변 잠금 | S3 CRR / Versioning / Object Lock |
| **모델 아티팩트** | 재학습에 시간·비용 소요 | S3 버전 + 다른 리전 복사, 승인된 버전 추적 | S3 / SageMaker Model Registry |
| **엔드포인트** | 서비스 중단 | 코드로 재생성, 다중 AZ, 다른 리전·계정 재배포 | CloudFormation·CDK·Pipelines |

### 데이터
- S3 교차 리전 복제(CRR)로 학습 데이터를 다중화한다. **복제하려면 원본·대상 버킷 모두 버전 관리가 켜져 있어야 한다.**
- 버전 관리와 객체 잠금으로 실수 삭제·랜섬웨어성 덮어쓰기를 막는다.

### 모델
- S3 버전 관리 + 리전 간 복사로 아티팩트를 이중화한다.
- Model Registry로 **어떤 버전을 복원해야 하는지**(승인 상태 포함) 추적한다.

### 엔드포인트
- IaC(CloudFormation·SageMaker Pipelines)로 다른 리전·계정에 그대로 재생성한다.
- 다중 AZ(`instance_count` ≥ 2)로 단일 AZ 장애를 견딘다.

| 전략 | RTO/RPO | 비용 | 상시 실행 자원 |
|------|------|------|------|
| Backup & Restore | 느림 (시간 단위) | 낮음 | 없음 (백업만 보관) |
| Pilot Light | 중간 (수십 분) | 중간 | 데이터 복제 + 최소 코어 구성 |
| Warm Standby | 빠름 (분 단위) | 높음 | 축소 규모로 항상 가동 |
| Multi-Region Active | 즉시 (초 단위) | 최고 | 양쪽 모두 전체 규모 가동 |

- **RTO**는 "복구까지 걸리는 시간", **RPO**는 "잃어도 되는 데이터의 시간 범위"다. 둘을 먼저 정해야 전략이 정해진다.
- **핵심**: 엔드포인트는 코드 + Model Registry에서 재생성 가능해야 한다. 손으로 만든 엔드포인트는 복구 대상이 아니라 사고 원인이다.

### 가용성과 자동화

| 수단 | 막는 장애 | 비고 |
|---|---|---|
| 엔드포인트 Auto Scaling | 트래픽 급증으로 인한 지연·오류 | 목표 추적 정책으로 인스턴스당 호출 수를 유지 |
| 다중 AZ (`instance_count` ≥ 2) | 단일 AZ 장애 | 인스턴스 2개 이상이면 여러 AZ에 자동 분산 |
| EventBridge + Lambda | 장애 감지 후 수동 대응 지연 | 학습 작업 실패·엔드포인트 상태 변화에 자동 대응 |
| CloudWatch 경보 | 조용한 성능 저하 | 지연·오류율 임계치 초과 시 알림·자동 조치 |
| 배포 가드레일(카나리/선형) | 나쁜 모델의 전면 배포 | 경보 발생 시 자동 롤백 |
| S3 CRR + Model Registry | 리전 전체 장애 | 다른 리전에서 즉시 복원 |

## 지문 단서 → 정답 매핑

| 지문 단서 | 고를 답 | 이유 |
|---|---|---|
| "하루 중 잠깐만 호출되고 나머지는 트래픽 0" | Serverless Inference | 유휴 비용이 없고 요청 시에만 과금 |
| "Spot으로 학습하되 진행 상황을 잃지 않기" | `checkpoint_s3_uri` 설정 | 중단 후 체크포인트에서 재개 |
| "학습 비용을 최대 90% 줄여라" | Managed Spot Training | 중단 감내 가능한 배치 작업에 최적 |
| "페이로드가 크고 처리 시간이 길다, 즉답 불필요" | Asynchronous Inference | 큐 기반, 유휴 시 0까지 축소 |
| "매일 밤 전체 데이터셋을 채점" | Batch Transform | 엔드포인트가 없어 상시 비용 0 |
| "모델 수천 개인데 각각은 드물게 호출" | Multi-Model Endpoint | 엔드포인트 하나를 공유해 비용 절감 |
| "누가 언제 엔드포인트를 지웠는지 증명" | CloudTrail | 모든 API 호출의 주체·시각 기록 |
| "학습이 왜 실패했는지 스택 트레이스를 보고 싶다" | CloudWatch Logs | 컨테이너 stdout/stderr가 쌓임 |
| "엔드포인트 지연이 튀는지 감시" | CloudWatch Metrics + 경보 | `ModelLatency` 등 지표 기반 |
| "감사 로그를 몇 년간 변조 없이 보관" | CloudTrail → S3(버전 관리·객체 잠금) | 장기 보관·불변성 확보 |
| "단일 AZ 장애에도 추론이 계속돼야 한다" | `instance_count` ≥ 2 | 여러 AZ에 자동 분산 |
| "리전 장애에도 데이터·모델을 즉시 복원" | S3 CRR + 버전 관리 + Model Registry | 자산 복제 + 복원할 버전 추적 |
| "복구까지 몇 시간 걸려도 되고 비용은 최소" | Backup & Restore | 상시 자원이 없어 가장 저렴 |
| "장애 시 수초 내 전환" | Multi-Region Active | 양쪽 모두 가동, 비용 최고 |

다음 글에서는 Week 11을 마무리하며 모니터링·운영·거버넌스를 하나로 묶는다.

## 📖 용어

- **Managed Spot Training** : 남는 용량을 싸게 쓰는 학습 방식. 중단될 수 있어 체크포인트가 사실상 필수다.
- **체크포인트(checkpoint)** : 학습 도중 상태를 S3에 저장해 둔 스냅샷. 중단돼도 여기서부터 이어서 학습한다.
- **max_run / max_wait** : 각각 "학습에 허용하는 최대 시간"과 "용량 대기까지 포함한 총 허용 시간".
- **콜드 스타트(cold start)** : 오래 호출이 없다가 다시 부를 때 준비 시간이 붙어 첫 응답이 느려지는 현상.
- **Multi-Model Endpoint** : 한 엔드포인트가 여러 모델을 S3에서 필요할 때 올려 쓰는 방식. 모델이 많을수록 유리하다.
- **Batch Transform** : 엔드포인트 없이 데이터셋 전체를 한 번에 채점하는 배치 추론 작업.
- **CloudTrail 추적(Trail)** : API 호출 기록을 S3에 지속 저장하도록 만든 설정. 장기 감사의 근거가 된다.
- **RTO / RPO** : 복구까지 허용되는 시간 / 잃어도 되는 데이터의 시간 범위. DR 전략을 고르는 두 기준.
- **S3 교차 리전 복제(CRR)** : 객체를 다른 리전 버킷으로 자동 복제하는 기능. 양쪽 버킷 모두 버전 관리가 필요하다.
- **Model Registry** : 모델 버전과 승인 상태를 관리하는 카탈로그. 장애 시 "무엇을 되돌릴지"를 알려준다.

## 📝 연습 문제

**문제 1.** 추론 엔드포인트가 하루 중 짧은 시간에만 간헐적으로 호출되고 나머지 시간은 트래픽이 없다. 유휴 비용을 없애려는 가장 적합한 옵션은?

A) 항상 켜진 대형 GPU 실시간 엔드포인트  
B) Serverless Inference  
C) instance_count를 10으로 고정  
D) Managed Spot Training  

**정답: B**  
해설: Serverless Inference는 요청이 있을 때만 과금하고 유휴 시 비용이 0이라 간헐적 트래픽에 최적이다. 항상 켜진 엔드포인트(A·C)는 유휴 비용 발생, Spot Training(D)은 추론이 아닌 학습 비용 절감이다.

---

**문제 2.** 비용을 줄이기 위해 GPU 학습 작업을 Spot으로 돌리되, 중단되어도 진행 상황을 잃지 않게 하려 한다. 반드시 설정해야 하는 것은?

A) checkpoint_s3_uri로 체크포인트 저장  
B) enable_network_isolation=True  
C) output_kms_key  
D) sampling_percentage=100  

**정답: A**  
해설: Spot은 중단될 수 있으므로 checkpoint_s3_uri로 체크포인트를 저장해야 재개 시 진행 상황을 복원한다. 네트워크 격리(B)·KMS(C)는 보안, 샘플링(D)은 모니터링 옵션으로 중단 복구와 무관하다.

---

**문제 3.** 보안 감사에서 "지난주 누가 프로덕션 엔드포인트를 삭제했는지" 증명해야 한다. 확인해야 할 서비스는?

A) CloudWatch Logs  
B) CloudWatch Metrics  
C) AWS CloudTrail  
D) SageMaker Debugger  

**정답: C**  
해설: CloudTrail은 모든 AWS API 호출(누가·언제·어디서 DeleteEndpoint 호출)을 기록해 감사·규정 준수를 지원한다. CloudWatch Logs/Metrics(A·B)는 성능·실패 디버깅, Debugger(D)는 학습 텐서 분석 도구다.

---

**문제 4.** 단일 가용 영역(AZ) 장애가 발생해도 실시간 추론 엔드포인트가 계속 동작하게 하려면 가장 간단한 조치는?

A) instance_count를 2 이상으로 두어 Multi-AZ 분산  
B) instance_count를 1로 유지하고 인스턴스를 키움  
C) Asynchronous Inference로 전환  
D) S3 버전 관리 활성화  

**정답: A**  
해설: 인스턴스 수가 2 이상이면 SageMaker가 여러 AZ에 자동 분산해 단일 AZ 장애를 견딘다. 단일 인스턴스(B)는 AZ 장애에 취약, Async(C)는 비동기 처리용, S3 버전 관리(D)는 데이터 보호로 엔드포인트 가용성과 무관하다.

---

**문제 5.** 리전 전체 장애에 대비해 학습 데이터와 모델 아티팩트를 다른 리전에서도 즉시 복원할 수 있게 하려 한다. 가장 적절한 조합은?

A) 데이터를 로컬 디스크에만 보관  
B) S3 Cross-Region Replication + 버전 관리 + Model Registry로 버전 추적  
C) 엔드포인트를 더 큰 인스턴스로 교체  
D) CloudWatch 경보만 추가  

**정답: B**  
해설: S3 교차 리전 복제와 버전 관리로 데이터·모델을 다른 리전에 복제하고, Model Registry로 복원할 버전을 추적하면 리전 장애에서도 복구가 가능하다. 로컬 보관(A)은 복원 불가, 인스턴스 교체(C)·경보(D)는 DR 자체를 해결하지 못한다.

---
