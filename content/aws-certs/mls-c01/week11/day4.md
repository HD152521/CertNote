# Day 4 - 운영·비용: 비용 최적화, 로깅·감사, 재해 복구

ML 워크로드는 GPU 학습과 24시간 떠 있는 엔드포인트 때문에 비용이 쉽게 폭주한다. 동시에 규제 환경에서는 "누가 언제 무엇을 했는가"를 증명해야 하고, 장애가 나도 서비스를 복구할 수 있어야 한다. 오늘은 운영의 세 기둥 — 비용 최적화, 로깅·감사(CloudWatch/CloudTrail), 재해 복구를 다룬다.

## 비용 최적화: 학습과 추론을 나눠서 본다

ML 비용은 학습(간헐적·집중적)과 추론(지속적·항상)으로 성격이 다르므로 전략도 다르다.

```text
학습 비용 절감
- Managed Spot Training: 여유 용량을 최대 90% 저렴하게, 체크포인트로 중단 복구
- 적정 인스턴스(right-sizing): GPU가 필요 없으면 CPU, 분산이 필요 없으면 단일
- Automatic Model Tuning의 조기 종료(early stopping)

추론 비용 절감
- Serverless Inference: 트래픽이 간헐적이면 유휴 비용 0(요청 시에만 과금)
- Multi-Model Endpoint(MME): 수많은 모델을 한 엔드포인트에 적재해 공유
- Asynchronous Inference: 큰 페이로드/긴 처리, 트래픽 없으면 0으로 스케일
- Auto Scaling: 트래픽에 따라 인스턴스 수 조정
```

### Managed Spot Training

```python
estimator = Estimator(
    image_uri=image, role=role,
    instance_count=1, instance_type="ml.p3.2xlarge",
    use_spot_instances=True,
    max_run=3600,            # 최대 학습 시간
    max_wait=7200,           # Spot 대기 포함 최대 대기 시간(max_run 이상)
    checkpoint_s3_uri="s3://my-bucket/checkpoints",  # 중단 시 재개용
)
```

> 💡 **관련 이론**: 추론 인스턴스 선택은 "트래픽 패턴"이 결정한다. 항상 일정한 트래픽→프로비저닝된 실시간 엔드포인트, 간헐적·예측 불가→Serverless Inference, 트래픽 없는 시간이 길거나 큰 페이로드→Asynchronous Inference. 시험에서 "유휴 시간이 많은데 비용을 줄이려면"의 정답은 거의 Serverless 또는 Async다.

### 적정 인스턴스와 추론 가속

추론 비용을 더 줄이려면 SageMaker Neo로 모델을 컴파일해 더 작은 인스턴스에서 빠르게 돌리거나, AWS Inferentia 같은 전용 칩을 쓴다. CPU로 충분한 추론에 GPU를 켜 두는 것은 흔한 낭비다.

## 로깅·감사: CloudWatch vs CloudTrail

둘은 자주 헷갈리지만 보는 대상이 다르다.

| 서비스 | 무엇을 기록 | 질문 |
|--------|-------------|------|
| **CloudWatch Logs** | 애플리케이션/작업 로그, 지표 | "학습이 왜 실패했나? 손실은 얼마였나?" |
| **CloudWatch Metrics/Alarms** | CPU/GPU 사용률, 지연, 호출 수 | "엔드포인트 지연이 임계값을 넘었나?" |
| **CloudTrail** | 모든 AWS **API 호출** 감사 | "누가 이 엔드포인트를 삭제했나?" |

```text
- 학습 손실 곡선, 컨테이너 stdout → CloudWatch Logs
- 엔드포인트 ModelLatency, Invocations, OverheadLatency → CloudWatch Metrics
- "user X가 CreateEndpoint를 호출" → CloudTrail (S3로 영구 보관·감사)
```

CloudTrail은 누가·언제·어디서·무엇을 호출했는지를 기록하므로 규제 준수 감사의 핵심이다. 로그는 S3에 저장해 변조 방지(객체 잠금)·장기 보관한다.

```text
[CloudTrail 이벤트 예]
eventName: DeleteEndpoint
userIdentity.arn: arn:aws:iam::1111:user/alice
eventTime: 2026-06-29T03:14:00Z
sourceIPAddress: 203.0.113.10
```

> 💡 **관련 이론**: "성능/실패를 디버깅" = CloudWatch, "누가 무엇을 했는지 감사·규정 준수" = CloudTrail. 이 한 줄 구분이 시험에서 대부분의 로깅 문제를 가른다. 보안 사고 추적·컴플라이언스는 CloudTrail, 모델·인프라 상태 감시는 CloudWatch다.

## 재해 복구(DR): 복원력 설계

ML 시스템의 DR은 데이터·모델·엔드포인트 세 자산을 어떻게 복원하느냐다.

```text
- 데이터: S3 Cross-Region Replication으로 학습 데이터를 다른 리전에 복제
- 모델 아티팩트: S3 버전 관리 + 교차 리전 복제, Model Registry로 어떤 버전을 복원할지 추적
- 엔드포인트: IaC(CloudFormation/Pipelines)로 재현 가능 → 다른 리전/계정에 재배포
- 가용성: Multi-AZ 엔드포인트(instance_count ≥ 2)로 단일 AZ 장애 견딤
```

| DR 전략 | RTO/RPO | 비용 |
|---------|---------|------|
| Backup & Restore | 높음(느린 복구) | 낮음 |
| Pilot Light | 중간 | 중간 |
| Warm Standby | 낮음 | 높음 |
| Multi-Region Active-Active | 최저 | 최고 |

핵심은 "엔드포인트를 코드로 재현 가능하게" 두는 것이다. IaC와 Model Registry가 있으면 리전 장애 시에도 동일 모델을 다른 리전에 빠르게 다시 세울 수 있다.

## 가용성과 운영 자동화

```text
- Endpoint Auto Scaling: TargetTrackingScaling으로 SageMakerVariantInvocationsPerInstance 기준 스케일
- Multi-AZ: 인스턴스 ≥ 2면 SageMaker가 자동으로 여러 AZ에 분산
- EventBridge + Lambda: 장애/드리프트 이벤트에 자동 대응
```

## 정리하며

운영의 세 기둥은 비용·감사·복구다. 비용은 학습(Spot·right-sizing)과 추론(Serverless·Async·MME·Auto Scaling)을 트래픽 패턴에 맞춰 줄인다. 로깅은 성능/실패 디버깅의 CloudWatch와 API 호출 감사의 CloudTrail로 명확히 나뉜다. 재해 복구는 데이터·모델의 교차 리전 복제와 IaC 기반 엔드포인트 재현, Multi-AZ로 복원력을 확보한다.

내일은 Week 11 전체(모니터링·MLOps·보안·운영)를 종합 복습한다.

---

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
