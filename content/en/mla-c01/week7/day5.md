# Day 5 - Week 7 Synthesis: MLOps Review

This week progressed from "deploy a model" to "automate model deployment and govern it". We code workflows with SageMaker Pipelines (Day 1), manage versions and approvals via Model Registry (Day 2), automate code-commit-to-deployment via CI/CD (Day 3), and standardize infrastructure and workflows via IaC and orchestrators (Day 4). Today we integrate these MLOps pieces into one big picture and organize decision criteria for tool selection on exams.

## End-to-End MLOps Flow at a Glance

Typical SageMaker MLOps pipeline from end to end:

```
[Code Push] → CodePipeline(Build) → CodeBuild → SageMaker Pipeline
   (preprocess → train → evaluate → ConditionStep[accuracy gate] → RegisterModel)
        ↓ Model registers to Registry as PendingManualApproval
[Reviewer Approves: Approved]
        ↓ EventBridge detects approval event
   CodePipeline(Deploy) → CloudFormation deploys staging → auto-test
        ↓ Manual approval gate
   Production endpoint deploy
```

This one diagram is this entire week. Recognizing which service implements each arrow means you're exam-ready.

> 💡 **Related Theory**: MLOps' three core principles are automation, reproducibility, and governance. Automation replaces manual intervention with triggers and pipelines; reproducibility ensures identical results by version-managing code, data, and infrastructure; governance tracks and controls who approved/deployed what. Every service this week implements at least one of these three.

## Daily Core Review

### Day 1 - SageMaker Pipelines
- Orchestrate ML workflow as code-defined **DAG**—SageMaker native service.
- Step types: ProcessingStep, TrainingStep, TuningStep, RegisterModel, **ConditionStep**, TransformStep, etc.
- **Parameters** inject values at execution → reuse same definition across environments.
- **Condition steps** create quality gates (like accuracy thresholds) auto-blocking poor models.
- Referencing one step's output as next step's input auto-creates DAG dependencies.

### Day 2 - Model Registry & Governance
- Registering to **Model Package Group** (purpose-grouped bundle) auto-increments **version**.
- Each version holds artifacts, inference image, evaluation metrics, **approval status**.
- Approval status: **PendingManualApproval → Approved / Rejected**.
- Status change emits EventBridge event → connects to deployment trigger.
- Links to SageMaker Lineage for data → training → model → deployment traceability (auditing).

### Day 3 - CI/CD for ML
- **SageMaker Projects**: Service Catalog template provisions repository, CodePipeline, CodeBuild, Registry, EventBridge all at once.
- **Build pipeline** (code-push trigger) vs **Deploy pipeline** (model-approval trigger).
- Service roles: CodeCommit (source), CodeBuild (build, `buildspec.yml`), CodePipeline (orchestration), CloudFormation (deploy), EventBridge (trigger).
- Staging → **manual approval gate** → production deploy minimizes blast radius.

### Day 4 - IaC & Orchestration
- **CloudFormation/CDK**: Define infrastructure as code (IaC) — idempotency, reproducibility, environment consistency.
- **Step Functions**: State machine orchestrating multiple AWS services (branching, parallel, retry, Catch).
- **EventBridge**: Schedule (cron) or event-based triggering — workflow start signal.
- **MWAA**: Managed Airflow — existing Airflow assets, hybrid, complex DAGs.

## Exam Tool-Selection Decision Criteria

Most-confused comparisons nailed down:

| Scenario Keywords | Answer Tool |
|---|---|
| SageMaker-centric, lineage/Registry integration | SageMaker Pipelines |
| Multiple AWS services (Lambda/Glue/SNS, etc.) orchestration | Step Functions |
| Infrastructure as reproducible, version-managed code | CloudFormation / CDK |
| Trigger workflow at set time/on event | EventBridge |
| Existing Airflow assets, hybrid, multi-cloud | MWAA |
| MLOps CI/CD infrastructure quickly via template | SageMaker Projects |
| Model version tracking, approval, auditing | Model Registry |
| Register only if accuracy passes threshold | Pipelines' ConditionStep |
| Auto-deploy on model approval | Registry approval → EventBridge → CodePipeline |

```python
# Synthesis code: pipeline end with condition passes → approval triggers deploy
# 1) Pipelines: ConditionStep(if_steps=[RegisterModel])  → quality gate
# 2) Registry: ModelApprovalStatus = "Approved"          → governance
# 3) EventBridge: ModelApprovalStatus=["Approved"] pattern   → CD trigger
# 4) CodePipeline + CloudFormation: staging→approval→production → safe deploy
```

## Common Pitfalls Summary

- **Pipelines vs Step Functions**: SageMaker-only → Pipelines; many services broadly → Step Functions. Both DAGs but different integration scope.
- **EventBridge is not workflow**: It's a start signal (trigger) only; workflow itself runs via Pipelines/Step Functions/CodePipeline.
- **MWAA is "when you already use Airflow"**: Starting new projects in SageMaker defaults to Pipelines. MWAA appears with existing-assets/hybrid keywords.
- **Approval status change = CD trigger**: "Auto-deploy on model approval" is almost always Registry approval → EventBridge → CodePipeline chain.
- **ConditionStep = quality gate**: "Register/deploy only if accuracy meets threshold" points to ConditionStep.

## Summary

- This week implemented MLOps' 3 principles (automation, reproducibility, governance) via SageMaker ecosystem tools.
- Complete chain: code push → Build → quality gate → register → approve → EventBridge → Deploy → staging → manual approval → production.
- Tool selection divides by "orchestration scope + existing assets + trigger type".
- Exams ask these tools separated by scenario — practicing keyword-to-tool mapping is key.

---

## 📝 연습 문제

**문제 1.** MLOps의 3대 원칙(자동화·재현성·거버넌스)과 이를 구현하는 도구의 연결로 가장 적절하지 않은 것은?

A) 재현성 → CloudFormation/CDK(IaC)  
B) 거버넌스 → Model Registry 승인 워크플로  
C) 자동화 → EventBridge 트리거 + CodePipeline  
D) 거버넌스 → CloudFront 캐싱  

**정답: D**  
해설: CloudFront는 콘텐츠 전송 CDN으로 모델 거버넌스와 무관하다. A는 인프라 재현성, B는 승인·감사 거버넌스, C는 트리거·파이프라인 자동화로 모두 올바른 연결이다.

---

**문제 2.** 한 ML 워크플로가 Glue ETL → SageMaker 학습 → Lambda 후처리 → SNS 알림으로 여러 서비스를 거치고, 또 다른 워크플로는 SageMaker 전처리→학습→평가→등록만으로 구성된다. 각각에 가장 적합한 오케스트레이터는?

A) 둘 다 SageMaker Pipelines  
B) 전자는 Step Functions, 후자는 SageMaker Pipelines  
C) 전자는 EventBridge, 후자는 CloudFormation  
D) 둘 다 MWAA  

**정답: B**  
해설: 여러 AWS 서비스에 걸친 워크플로는 Step Functions가, SageMaker 작업만으로 계보·Registry 통합이 필요한 워크플로는 Pipelines가 적합하다. A·D는 범위 구분을 못 하고, C는 EventBridge(트리거)·CloudFormation(IaC)을 오케스트레이터로 잘못 지정했다.

---

**문제 3.** 모델 평가 정확도가 기준 미만이면 등록을 막고, 승인된 후에는 자동으로 프로덕션까지 배포하려 한다. 올바른 구성 요소 연결은?

A) ConditionStep(품질 게이트) → Registry 승인 → EventBridge → CodePipeline 배포  
B) Batch Transform → QuickSight → Athena  
C) Data Wrangler → Ground Truth → Feature Store  
D) CloudFront → S3 → SNS  

**정답: A**  
해설: 정확도 게이트는 Pipelines의 ConditionStep, 승인은 Registry, 승인 이벤트 감지는 EventBridge, 배포는 CodePipeline이 담당하는 표준 MLOps 사슬이다. B는 분석, C는 데이터 준비/레이블링, D는 콘텐츠 전송으로 배포 자동화 흐름과 무관하다.

---

**문제 4.** 조직이 이미 온프레미스를 포함한 복잡한 의존성을 Apache Airflow DAG로 운영 중이다. 이를 관리형으로 AWS에서 이어가려 할 때와, 완전히 새 프로젝트를 SageMaker 안에서 시작할 때의 권장 도구를 옳게 짝지은 것은?

A) 기존 Airflow → MWAA, 새 SageMaker 프로젝트 → SageMaker Pipelines  
B) 기존 Airflow → SageMaker Pipelines, 새 프로젝트 → MWAA  
C) 둘 다 Step Functions  
D) 둘 다 EventBridge  

**정답: A**  
해설: 기존 Airflow 자산·하이브리드는 MWAA로 이어가고, SageMaker 네이티브 신규 워크플로는 Pipelines가 우선이다. B는 뒤바뀌었고, C·D는 두 상황의 차이를 반영하지 못한다.

---

**문제 5.** SageMaker Projects를 사용하는 표준 MLOps에서 "코드 푸시"와 "모델 Approved"가 각각 트리거하는 대상으로 옳은 것은?

A) 코드 푸시 → Deploy 파이프라인, 모델 승인 → Build 파이프라인  
B) 코드 푸시 → Build 파이프라인(학습·등록), 모델 승인 → Deploy 파이프라인(배포)  
C) 코드 푸시 → CloudFront 무효화, 모델 승인 → Athena 쿼리  
D) 둘 다 동일한 단일 파이프라인을 트리거  

**정답: B**  
해설: 코드 푸시는 모델을 학습·등록하는 Build 파이프라인(CI)을, 모델 승인은 엔드포인트를 배포하는 Deploy 파이프라인(CD)을 트리거하며 두 흐름은 분리되어 있다. A는 뒤바뀌었고, C는 무관한 서비스, D는 CI/CD 분리 구조와 맞지 않는다.

---
