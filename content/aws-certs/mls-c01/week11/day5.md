# Day 5 - Week 11 Review: Monitoring, MLOps, Security, Operations

This week was "the world after building models." We covered monitoring deployed models, automating retraining and deployment (MLOps), protecting data/models/permissions (security), and managing cost/audit/recovery (operations) in one full loop. Today we integrate these pieces into a single operating system and organize the judgment points most frequently split on the exam.

## Full Picture: Operations Loop on One Page

```text
[Training Data S3]──(KMS encryption, VPC Endpoint)──┐
                                               ▼
                 [SageMaker Pipeline] process→train→eval
                                               │ ConditionStep (quality gate)
                                               ▼
                        [Model Registry] versions & approval (Approved)
                                               │ EventBridge
                                               ▼
                 [Deploy: Blue/Green·Canary] → [Endpoint]
                          │                        │
                  CloudTrail (audit)          DataCapture (S3)
                          │                        ▼
                          │              [Model Monitor] drift detection
                          │                        │ CloudWatch Alarm
                          └────────────────────────┘ EventBridge → retrain (loop start)
```

This entire loop runs on IAM execution roles (least privilege), VPC isolation, KMS encryption.

## One-Line Summary per Day

| Day | Topic | One-Liner |
|-----|------|-----------|
| 1 | Monitoring | Data Quality watches input distribution shifts (no labels), 1st defense, violation→trigger retrain |
| 2 | MLOps | Pipelines (DAG, ConditionStep) + Model Registry (versions, approval) + CI/CD (Projects) |
| 3 | Security | IAM execution roles (least privilege) + VPC isolation + KMS (key policy controls decryption) |
| 4 | Operations | Cost (Spot/Serverless/Async) + logging (CloudWatch vs CloudTrail) + DR (cross-region, Multi-AZ) |

## Most Frequently Split Judgment Points

```text
1) Monitoring type
   No labels → Data Quality / Has labels → Model Quality
   Feature contribution shift → Feature Attribution / Bias shift → Bias Drift

2) Logging service
   Perf/failure debugging → CloudWatch / Who did what (audit) → CloudTrail

3) Inference cost
   Sparse traffic → Serverless / Large payload, long processing → Async
   Many models shared → Multi-Model Endpoint / Variable traffic → Auto Scaling

4) Permission issues
   Training/endpoint AccessDenied → Execution Role permissions

5) Internet-blocking requirement
   Private subnets + VPC Endpoints + network isolation
```

> 💡 **Related Theory**: Specialty exam operations test "what to pick in situation," not "know the feature." The five splits above cover nearly all operations problems. Train yourself to spot keywords (no labels, who, sparse, AccessDenied, internet ban) and snap to the branch instantly — that makes the score.

## Integrated Scenario Checkpoint

Scenario: Operating a classification model trained on medical data. (1) Data cannot expose to internet, (2) must auto-retrain on input distribution shift, (3) must audit who changed endpoint, (4) sparse traffic, want to cut idle cost.

```text
(1) VPC private subnets + S3 VPC Endpoint + KMS (CMK) + execution role least privilege
(2) DataCapture → Model Monitor (Data Quality) → CloudWatch Alarm
       → EventBridge → SageMaker Pipeline retrain → Model Registry approval → redeploy
(3) CloudTrail audit API calls, store logs in S3
(4) Serverless Inference zero idle cost
```

Looks like one problem but fits week's 4 days of knowledge exactly, one piece each.

## Common Traps Summary

```text
- Baseline not refreshed after retraining, false positives surge (Day1)
- Poor-performance model auto-deploys without ConditionStep (Day2)
- Permission debug sees only user perms, misses execution role (Day3)
- Try CloudWatch to find "who did it" → CloudTrail is answer (Day4)
- Always-on GPU endpoint handles sparse traffic, wasteful (Day4)
```

## Summary

Week 11 treats ML as "living system," not "finished model." Monitoring catches drift; MLOps automates retraining and deployment; security wraps everything; operations handle cost/audit/recovery. These four connect via EventBridge and Pipelines into one closed loop. On exams, memorizing five splits that translate keywords to branches lets you answer most operations questions correctly.

Next week: comprehensive wrap-up and exam prep to finish the full course.

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
