# Day 5 - Week 8 Summary: ML Solution Monitoring and Maintenance Review

Week 8 addressed "life after deployment." The model begins creating value the moment it ships, but simultaneously begins to drift from the world. Data changes, bias emerges, systems slow down, performance degrades. This week you learned the entire process of **detecting (monitor)** and **responding to (maintain)** these changes. Today we consolidate the four days into one unified picture before the exam.

The big picture is a closed loop: **drift/performance/system detection → alarm → retraining → safe redeployment → monitoring again.** This loop is the heart of "operational ML (MLOps)."

## 1. Four Model Monitor Monitors (Day 1~2)

All monitoring begins with **Data Capture** (storing requests and responses to S3), establishes a **baseline** (definition of normal), then launches Processing Jobs on **cron schedule** to compare.

| Monitor | What It Watches | Tool | Label Required |
|---------|-----------------|------|-----------------|
| Data Quality | Input feature distribution statistics (data drift) | Model Monitor (Deequ) | No |
| Model Quality | Predicted performance metrics (accuracy, F1) | Model Monitor | **Yes (ground truth)** |
| Bias Drift | Predicted bias across groups (fairness) | Clarify | Partially not required |
| Feature Attribution Drift | Feature importance changes (SHAP) | Clarify | No |

> 💡 **Related Theory**: The critical drift distinction — **data drift (covariate shift)** is the distribution change in input X (caught by Data Quality Monitor), **concept drift** is the relationship change between X and Y (caught by Model Quality Monitor via performance degradation). When labels don't arrive immediately, Model Quality is impossible, so we work around with Data Quality or Feature Attribution drift for early warning. This "label presence → monitor selection" logic is a Week 8 exam staple.

## 2. Operational Monitoring: CloudWatch and X-Ray (Day 3)

Beyond whether the model is correct, **is the system healthy?** The three pillars of observability: **metrics (CloudWatch Metrics), logs (CloudWatch Logs), traces (X-Ray)**.

- Key metrics: `ModelLatency`, `OverheadLatency` (latency), `Invocations` (call volume), `4XX/5XXErrors` (errors), `CPU/Memory/GPUUtilization` (resources).
- **4XX = client errors** (invalid input), **5XX = server errors** (container crash, resource shortage). First step in error triage.
- **CloudWatch Alarm**: triggers SNS, autoscaling, Lambda on threshold violation. Use `EvaluationPeriods` to reduce false alarms.
- Traffic variability response isn't simple alarms but rather **Application Auto Scaling**.

```python
# Best practice: aggregating operational metrics + model monitor metrics on one dashboard
# ModelLatency spike → instance load, OverheadLatency spike → request processing/payload issue
# Overall latency increases, ModelLatency normal → use X-Ray to trace upstream bottleneck (Lambda/network)
```

> ⚠️ **Trap**: "Performance degradation" is ambiguous. **Model performance degradation** (accuracy drop) is caught by Model Quality Monitor, **system performance degradation** (latency, errors) is caught by CloudWatch operational metrics. When problem wording mentions "accuracy/prediction quality" vs "latency/errors/resources," select your tool accordingly.

## 3. Retraining and Redeployment Loop (Day 4)

Detection is not the end. Response must be automated for mature operations.

Automation chain:
1. Model Monitor violation → **CloudWatch Alarm**
2. → **EventBridge/Lambda** triggers **SageMaker Pipeline**
3. → retrains with latest data → evaluates
4. → **ConditionStep** registers only if baseline passed to **Model Registry** (prevents regression)
5. → safe redeployment

Redeployment strategy comparison:

| Strategy | User Impact | Use Case |
|----------|------------|----------|
| Shadow | Zero (predictions recorded, users never see) | Risk-free validation with live traffic |
| A/B (variant weights) | Partial (new model responses actually returned) | Gradual rollout, business metric comparison |
| Blue/Green, Canary | Gradual switch + auto-rollback | Safe full replacement |

> 🔍 **Deeper**: Remember the risk ladder. **Safest = Shadow** (zero user impact) → **Middle = A/B/Canary** (minority exposure with gradual rollout) → **Full = Blue/Green** (full switch with guardrails and auto-rollback). Retraining triggers also prefer **drift-based event triggers** over schedule-based from a cost perspective.

## 4. Key Decision Points for the Exam

Fast-moving branches in Week 8 problems.

1. **Do you have labels immediately?** Yes → Model Quality. No → Data Quality/Feature Attribution.
2. **Fairness/group bias?** → Clarify Bias Drift. **Feature importance?** → Clarify Feature Attribution.
3. **Accuracy problem vs latency/error problem?** → Former is Model Quality Monitor, latter is CloudWatch operational metrics.
4. **Error rate spike cause?** → Distinguish 4XX (client) vs 5XX (server) first.
5. **New model validation without user impact?** → Shadow. **Gradual transition and metric comparison?** → A/B.
6. **Reduce retraining cost?** → Event-based drift trigger instead of schedule-based.

## Summary

Week 8 in one sentence: **Models live and move after deployment; you must detect drift, bias, and explanation changes with Model Monitor and Clarify; monitor system health with CloudWatch and X-Ray; automate retraining with SageMaker Pipelines; and safely redeployment with shadow, A/B, and guardrails in a closed loop.** The decision factors remain constant: **label presence** (monitor type), **model vs system** (quality monitor vs CloudWatch), **acceptable user impact** (shadow vs A/B vs blue/green). This three-axis framework solves most monitoring and maintenance scenarios.

Next week: ML solution monitoring and maintenance depth — security and governance, cost optimization, advanced MLOps pipeline.

---

## 📝 연습 문제

**문제 1.** 운영 중 모델의 실제 정답 레이블을 수집할 방법이 전혀 없는 상황에서 모델 성능 저하를 조기에 감지하려 한다. 가장 적절한 조합은?

A) 모델 품질 모니터만 사용  
B) 데이터 품질 드리프트 + 피처 기여도 드리프트 모니터  
C) CloudWatch 4XX 알람만 사용  
D) 아무것도 할 수 없다  

**정답: B**  
해설: 라벨이 없으면 모델 품질 모니터는 쓸 수 없으므로, 라벨이 필요 없는 데이터 품질(입력 분포 변화)과 피처 기여도(SHAP 중요도 변화) 드리프트로 조기 경보를 얻는다. A는 ground truth가 필요해 불가능하고, C는 시스템 오류 지표일 뿐 모델 성능과 무관하며, D는 라벨 없이도 우회 감지가 가능하므로 틀리다.

---

**문제 2.** 어떤 엔드포인트에서 `Invocation5XXErrors`가 급증하고 `ModelLatency`도 함께 치솟았다. 가장 먼저 의심할 영역은?

A) 클라이언트의 잘못된 페이로드 형식  
B) 모델 컨테이너의 자원 부족/충돌 등 서버 측 문제  
C) Clarify 편향 지표  
D) S3 버전 관리 설정  

**정답: B**  
해설: 5XX(서버 오류)와 ModelLatency 동반 급증은 모델 컨테이너가 부하·자원 부족·타임아웃으로 고전하는 서버 측 신호다. 인스턴스 증설·헬스 체크가 필요하다. A는 4XX의 전형이고, C는 공정성 지표로 시스템 오류와 무관하며, D는 관련 없는 설정이다.

---

**문제 3.** 새 모델 버전을 운영 트래픽으로 검증하되 사용자에게는 절대 영향을 주지 않으면서, 충분히 검증되면 일부 사용자에게 점진적으로 노출하고 싶다. 단계적 전략으로 옳은 것은?

A) 처음부터 블루/그린으로 100% 전환  
B) 먼저 섀도 테스트로 무위험 검증 후, A/B(배리언트 가중치)로 점진 롤아웃  
C) A/B로 50:50 분할 후 섀도로 전환  
D) 재학습을 생략하고 바로 배포  

**정답: B**  
해설: 위험 사다리에 따라 사용자 영향 0인 섀도 테스트로 먼저 검증하고, 만족하면 A/B 가중치로 소수 사용자에 점진 노출하는 것이 안전한 단계적 전략이다. A는 검증 없이 전면 전환해 위험하고, C는 순서가 뒤바뀌어(이미 영향을 준 뒤 섀도) 비논리적이며, D는 검증을 모두 건너뛴다.

---

**문제 4.** Model Monitor가 드리프트를 감지한 뒤 자동으로 재학습을 시작하게 하려면, 빈칸의 서비스 조합으로 가장 적절한 것은? "Model Monitor 위반 → CloudWatch Alarm → ___ → SageMaker Pipeline 실행"

A) S3 → Glue  
B) EventBridge(또는 SNS→Lambda)  
C) DynamoDB Streams  
D) QuickSight  

**정답: B**  
해설: CloudWatch Alarm이 ALARM 상태가 되면 EventBridge 규칙이나 SNS→Lambda가 SageMaker Pipeline 재학습 실행을 트리거하는 것이 표준 자동화 체인이다. A는 ETL용, C는 DB 변경 스트림, D는 BI 대시보드로 파이프라인 트리거 역할이 아니다.

---

**문제 5.** 재학습 파이프라인에서 새로 학습한 모델이 평가 기준에 미달했을 때 성능 회귀를 막는 표준 메커니즘은?

A) 모든 새 모델을 무조건 배포  
B) SageMaker Pipelines의 ConditionStep으로 기준 통과 시에만 Model Registry에 등록  
C) 엔드포인트를 매번 삭제  
D) CloudWatch Logs에 경고만 남기고 그대로 배포  

**정답: B**  
해설: ConditionStep으로 평가 지표가 기준을 통과할 때만 모델을 등록(이후 배포)하고, 미달이면 기존 모델을 유지해 회귀를 막는다. A·D는 나쁜 모델도 배포되어 회귀를 허용하고, C는 서비스를 중단시키는 무관한 동작이다.

---
