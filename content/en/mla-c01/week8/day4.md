# Day 4 - Continuous Learning & Retraining: Automated Drift Detection and Retraining Triggers

When monitoring detects drift or performance degradation, models don't self-heal. Someone must retrain. **Continuous learning** automates the "detect degradation → retrain → validate → redeploy" loop. This closes the MLOps circle: yesterday's CI/CD deploys models, today's operations monitor them, and today's continuous learning retrains them. MLA-C01 tests "when and how to trigger automated retraining".

Core concept: **Drift trigger** (data/model performance falls below threshold) → **Retrain pipeline auto-starts** → **New model registers** → **Quality gate evaluation** → **If approved, auto-deploy**. Same CI/CD infra (SageMaker Pipelines, Model Registry, CodePipeline) from earlier weeks powers the loop.

## When to Trigger Retraining?

Data changes over time—customer behavior shifts, new patterns appear, old patterns vanish. **Concept drift** (label/target distribution changes), **data drift** (feature distribution changes), or **prediction drift** (model predictions diverge from reality). Monitoring detects these via:

- **Model performance degradation**: Accuracy/AUC falls below baseline.
- **Data drift alerts**: Feature distributions deviate from training data.
- **Prediction drift**: Model outputs systematically wrong on recent data.

Retraining triggers include:
- **Scheduled**: Monthly retrain regardless (ensures freshness).
- **Drift-triggered**: Auto-retrain on detected drift (responds to change).
- **Performance-triggered**: Auto-retrain on accuracy drop below threshold.

## Automated Retraining Pipeline Architecture

Retraining loops typically:
1. **Monitoring detects issue** (drift/degradation).
2. **Event triggers pipeline** (via EventBridge or Step Functions).
3. **Pipeline fetches fresh data**, retrains, evaluates.
4. **Quality gate**: if performance meets threshold, register new model.
5. **Approval**: registry triggers deploy if approved.

The pipeline is the same SageMaker Pipelines/CodePipeline from Day 7 (week 1), now triggered by drift events instead of code commits.

## Feature Store & Data Freshness

Continuous learning benefits from **SageMaker Feature Store** to version features. Historical feature values (at training time vs. current time) let you detect drift and fetch consistent data for retraining.

## Summary

Continuous learning closes the loop: deploy → monitor → detect drift → auto-retrain → validate → redeploy. **EventBridge** detects drift/performance events; **SageMaker Pipelines** executes retraining; **Model Registry** gates quality; **CodePipeline** deploys. Combining monitoring (week 8 days 1-2), CI/CD (week 7 days 1-3), and automation (this week) creates truly autonomous ML systems.

---

## 📝 연습 문제

**문제 1.** 모델 정확도가 기준선 0.85 아래로 떨어졌을 때 자동으로 재학습 파이프라인을 시작시키려 한다. 가장 적절한 트리거는?

A) EventBridge 정시 규칙(cron)  
B) CloudWatch Alarm이 정확도 메트릭 임계치 위반 감지 → EventBridge 또는 Lambda 트리거  
C) S3 버전 관리  
D) IAM 정책 변경  

**정답: B**  
해설: 정확도 저하는 CloudWatch Alarm으로 감지되고, ALARM 상태 변경이 EventBridge나 Lambda로 전달되어 재학습 파이프라인을 트리거한다. A는 정시 트리거일 뿐 성능 저하 감지가 아니고, C·D는 모니터링·트리거와 무관하다.

---

**문제 2.** 지속적 학습 루프에서 재학습된 모델이 이전 모델보다 성능이 낮으면 어떻게 되어야 하는가?

A) 자동으로 배포한다  
B) 품질 게이트(ConditionStep)가 등록을 막는다  
C) 이전 모델을 삭제한다  
D) 사람에게만 알리고 아무것도 하지 않는다  

**정답: B**  
해설: 파이프라인 끝의 ConditionStep(품질 게이트)이 성능 임계치를 확인해 기준 미만이면 등록을 막는다. A는 위험하고, C는 버전 히스토리 손실, D는 자동화 부족이다.

---
