# Day 4 - Operations & Cost: Cost Optimization, Logging/Audit, Disaster Recovery

ML workflows cost continuously (data pipelines, training GPUs, always-on endpoints). Regulation demands "who did what when." Infrastructure fails. Today's three pillars: **cost**, **audit**, **resilience**.

## Cost Optimization: Training vs Inference Split

Learning and serving have opposite economics.

### Training Cost Cuts
- **Managed Spot Training**: 90% cheaper, checkpoint on interruption
- **Right-sizing**: No GPU if CPU suffices, distributed only if needed
- **Early stopping in AMT**: Discard hopeless trials early

### Inference Cost Cuts
- **Serverless**: Sparse traffic → pay-per-call, zero idle
- **Multi-Model Endpoint**: 1000s models on single endpoint
- **Asynchronous**: Big payload, no urgency → queue, 0-scale
- **Auto Scaling**: Busy → add instances, idle → shrink

## Logging & Audit: CloudWatch vs CloudTrail

| Service | Records | Question |
|------|------|------|
| **CloudWatch Logs** | App/job logs, metrics | "Why did training fail? What was loss?" |
| **CloudWatch Metrics** | CPU, GPU, latency | "Was endpoint healthy? Spike?" |
| **CloudTrail** | **All AWS API calls** | "Who deleted this? When?" |

```text
Training loss curves, container stdout → CloudWatch Logs
Endpoint latency, errors → CloudWatch Metrics
"User alice called DeleteEndpoint at 3:14 UTC" → CloudTrail
```

CloudTrail to S3 (permanent, tamper-proof, audit).

> 💡 **Related Theory**: "Debug performance" = CloudWatch. "Prove compliance" = CloudTrail. CloudTrail is who-what-when-where of every API — regulatory bedrock.

## Disaster Recovery: Data → Model → Endpoint

Three assets need recovery plans.

### Data
- S3 Cross-Region Replication: train data redundant
- Versioning + immutable locks

### Models
- S3 versions + cross-region copy
- Model Registry: which version to restore

### Endpoints
- IaC (CloudFormation/Pipelines): recreate in alt region/account
- Multi-AZ (instance_count ≥ 2): survive single-AZ failure

| Strategy | RTO/RPO | Cost |
|------|------|------|
| Backup & Restore | Slow | Low |
| Pilot Light | Medium | Medium |
| Warm Standby | Fast | High |
| Multi-Region Active | Instant | Highest |

**Key**: Endpoint recreatable from code + Model Registry.

### Availability & Automation
- Endpoint Auto Scaling: handle traffic spikes
- Multi-AZ: instance_count ≥ 2
- EventBridge + Lambda: auto-respond to failures

## Summary

Operations three pillars: (1) Cost = training (Spot, early-stop), inference (Serverless, Async, MME, scaling). (2) Audit = CloudWatch (debug), CloudTrail (compliance). (3) Resilience = data/model/endpoint replication, IaC, multi-AZ, auto-scale.

Tomorrow: Week 11 wrap — monitoring, operations, governance integrated.

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
