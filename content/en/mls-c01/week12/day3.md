# Day 3 - Domain 4 Integration: ML Implementation & Operations

Domain 4: **deploy, monitor, operate**. Model leaves lab → lives in prod.

## End-to-End Deployment & Operations

```text
[Trained model]
   │
   ├─ 1) INFER: CHOOSE DEPLOYMENT
   │     Online? Offline?
   │     Real-time(low-latency) / Serverless / Async / Batch
   │
   ├─ 2) DEPLOY SAFELY
   │     Shadow (zero-risk), Canary (gradual), Blue/Green (flip)
   │
   ├─ 3) MONITOR
   │     Data drift (no labels) vs Model Quality (labels delayed)
   │     CloudWatch (metrics), Model Monitor (distribution)
   │
   ├─ 4) OPTIMIZE
   │     Cost: Spot(learn), Serverless(inference), MME
   │     Speed: Neo, Inferentia, Elastic Inference
   │
   ├─ 5) INCIDENT RESPONSE
   │     Degradation → alarm → retrain (auto or manual)
   │     Rollback → instant (Blue/Green)
   │
   └─ 6) GOVERNANCE
         CloudTrail (audit), Model Registry (versions), Pipelines (CI/CD)
```

## Inference Choice Tree

```
Online needed?
├─ No → Batch Transform (large bulk offline)
└─ Yes
   ├─ Payload >6MB or timeout >60s? → Asynchronous
   ├─ Traffic sparse, cold OK? → Serverless
   └─ Traffic steady, <6MB, <60s? → Real-time
```

## Cost Levers

| Phase | Cost Cut |
|------|------|
| Training | Spot instances (90%↓), early-stop (AMT) |
| Inference | Serverless (idle=0), Batch (job-only), MME (shared) |
| Both | Auto-scale (pay for peaks), right-sizing |

## Monitoring Strategy

- **Data Quality**: Baseline vs runtime, no labels
- **Model Quality**: Once labels arrive
- **Bias Drift**: Clarify SHAP shifts
- **Auto-Response**: Alarm → retrain pipeline

## Summary

Domain 4: infer choice (online/offline), deploy safe (shadow/canary), monitor (drift), optimize (cost/speed), respond (retrain/rollback), govern (audit/registry/CI/CD). End-to-end pipeline: collect → clean → model → deploy → monitor → retrain.

Tomorrow: All four domains, synthesis.

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
