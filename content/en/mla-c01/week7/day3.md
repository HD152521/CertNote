# Day 3 - CI/CD for ML: SageMaker Projects, CodePipeline/CodeBuild Integration, Automated Deployment

Yesterday we built pipelines (Day 1) and Model Registry (Day 2). But if every code change requires manual pipeline re-run in a notebook, manual approval clicks, and manual endpoint updates, it is still manual operations. **CI/CD (Continuous Integration / Continuous Deployment)** automates the chain from code commit to model deployment. Bringing software engineering's CI/CD directly to ML is the final MLOps puzzle.

Today we cover AWS ML CI/CD tools: **SageMaker Projects** and the supporting **CodePipeline / CodeBuild / CodeCommit integration** plus automated deployment flow. MLA-C01 tests this combination in scenarios: "make code changes auto-trigger model retraining and deployment".

## Applying CI/CD to ML

Traditional software CI/CD is code push → build → test → deploy. ML adds **data and models** as new axes.

- **CI (Continuous Integration)**: On code (preprocessing, training scripts) change, auto-run pipeline to train/evaluate model and register to Registry.
- **CD (Continuous Deployment)**: On model approval, auto-deploy to staging/production endpoints.

You can hand-wire these, but AWS provides **SageMaker Projects**—a template setting up the entire skeleton at once.

> 💡 **Related Theory**: ML CI/CD's core philosophy is "make model deployment version-managed, automated, and rollback-capable like software deployment". Code, data, and models are all tracked; changes auto-trigger via events; problems allow rollback to previous versions. On exams, "Git commit → auto-retrain/deploy" flow hints at SageMaker Projects + Code* services combined.

## SageMaker Projects — MLOps Template

SageMaker Projects **provisions MLOps CI/CD infrastructure via pre-configured templates (Service Catalog-based)**. Creating a project auto-provisions:

| Created Resource | Role |
|------------------|------|
| Source code repo (CodeCommit or Git) | Preprocessing, training, deployment code |
| Build pipeline (CodePipeline + CodeBuild) | On code change, run SageMaker Pipeline → register model |
| Deploy pipeline (CodePipeline) | On model approval, deploy to staging/prod endpoints |
| Model Registry group | Trained model version catalog |
| EventBridge rules | Detect code push/model approval events, trigger |

Basically, what you manually built yesterday and day-before-yesterday ships as standard template all-in-one. A representative template is "model building, training, and deployment", creating two repos: build and deploy.

## Two Pipelines: Build and Deploy

SageMaker Projects' standard structure splits into two stages.

**1) Build (model build) Pipeline** — Code-centric
- Developer pushes training code to repo
- CodePipeline detects change, runs CodeBuild
- CodeBuild executes SageMaker Pipeline (preprocess → train → evaluate → register)
- Resulting model registers to Model Registry as `PendingManualApproval`

**2) Deploy (model deploy) Pipeline** — Model-centric
- Model in Model Registry changes to `Approved`
- EventBridge detects approval event, triggers Deploy pipeline
- CloudFormation deploys staging endpoint → auto-test
- Manual approval gate passes, production endpoint deploys

Thus code change (CI) and model approval (CD) trigger separate pipelines.

## CodeCommit / CodeBuild / CodePipeline Roles

Distinguishing each service's responsibility is key for exams.

| Service | Role |
|---------|------|
| CodeCommit | Git source repo (code version control) |
| CodeBuild | Build/test execution environment (define commands via buildspec.yml) |
| CodePipeline | Orchestrator linking stages (source → build → deploy flow) |
| CloudFormation | Deploy infrastructure (endpoints, etc.) as code |
| EventBridge | Event-based triggering (code push, model approval) |

CodeBuild work is defined in `buildspec.yml`. For example, running SageMaker Pipeline build phase looks like:

```yaml
# buildspec.yml — commands CodeBuild executes
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.11
    commands:
      - pip install -r requirements.txt
  build:
    commands:
      # On code change, create/update SageMaker Pipeline and run
      - python pipelines/run_pipeline.py --upsert
      - python pipelines/run_pipeline.py --start
```

## Auto-Deployment Trigger: Approval → EventBridge → Deploy

CD's heart is yesterday's **model approval event**. When Model Registry approval status changes, EventBridge catches it and starts Deploy pipeline.

```python
import boto3
events = boto3.client("events")

# Rule: on approval status → Approved, trigger Deploy pipeline
events.put_rule(
    Name="trigger-deploy-on-approval",
    EventPattern="""{
      "source": ["aws.sagemaker"],
      "detail-type": ["SageMaker Model Package State Change"],
      "detail": {
        "ModelApprovalStatus": ["Approved"]
      }
    }""",
)
```

Setting this rule's target to Deploy CodePipeline means the moment a person approves the model, deployment rolls automatically. The safe pattern places a **manual approval step** between staging validation and production deploy.

```python
# CodePipeline stages example (conceptual): staging → manual approval → production
# 1. DeployStaging   (CloudFormation creates staging endpoint)
# 2. ApprovalGate    (person reviews staging results, approves)
# 3. DeployProd      (production endpoint deploys)
```

> 💡 **Related Theory**: Staged deploy staging → manual approval → production follows the "minimize blast radius" principle. Validating new models in staging before production gates prevents defects from reaching users. On exams, "auto-deploy safely with production governance" hints at CodePipeline's manual approval action.

## Direct Setup vs SageMaker Projects

You can achieve the same result wiring CodePipeline, CodeBuild, and EventBridge directly without Projects. The differences:

- **SageMaker Projects**: When wanting to rapidly standard MLOps template. Service Catalog bundles governance/reuse. On exams, "quickly standardize MLOps" → this direction.
- **Direct setup**: Integrating with existing CI/CD pipelines or unusual requirements. Flexible but labor-intensive.

## Summary

- ML CI/CD automates code change → auto retrain/register (CI) and model approval → auto deploy (CD).
- SageMaker Projects provisions an MLOps template made of CodeCommit/CodePipeline/CodeBuild/Registry/EventBridge all at once.
- Build pipeline triggers on code push; Deploy pipeline triggers on model approval.
- Approval → EventBridge → CodePipeline → CloudFormation deploy is the standard CD chain, with manual approval gate before production raising safety.
- "Auto-deploy from Git commit to model deployment, standardized" → SageMaker Projects + Code* combination is the answer.

---

## 📝 연습 문제

**문제 1.** ML 팀이 MLOps에 필요한 소스 저장소, 빌드/배포 파이프라인, Model Registry를 미리 구성된 템플릿으로 한 번에 프로비저닝하려 한다. 가장 적합한 것은?

A) SageMaker Projects  
B) SageMaker Ground Truth  
C) SageMaker Data Wrangler  
D) SageMaker Feature Store  

**정답: A**  
해설: SageMaker Projects는 Service Catalog 기반 템플릿으로 CI/CD 인프라(저장소·CodePipeline·CodeBuild·Registry·EventBridge)를 한 번에 프로비저닝하는 MLOps 도구다. B는 레이블링, C는 데이터 준비, D는 피처 저장소로 CI/CD 템플릿과 무관하다.

---

**문제 2.** SageMaker Projects 표준 구조에서 "코드 푸시"와 "모델 승인"은 각각 어떤 파이프라인을 트리거하는가?

A) 코드 푸시 → Deploy 파이프라인, 모델 승인 → Build 파이프라인  
B) 코드 푸시 → Build 파이프라인, 모델 승인 → Deploy 파이프라인  
C) 둘 다 Build 파이프라인을 트리거  
D) 둘 다 트리거가 없고 수동 실행만 가능  

**정답: B**  
해설: 코드 푸시는 Build(모델 학습·등록) 파이프라인을, 모델 승인은 Deploy(엔드포인트 배포) 파이프라인을 트리거한다. CI와 CD가 서로 다른 이벤트로 분리된 구조다. A는 뒤바뀌었고, C·D는 분리된 트리거 구조와 맞지 않는다.

---

**문제 3.** CodeBuild가 실제로 실행할 명령(의존성 설치, 파이프라인 실행 등)을 정의하는 파일은?

A) template.yaml  
B) buildspec.yml  
C) requirements.txt  
D) pipeline.json  

**정답: B**  
해설: CodeBuild는 `buildspec.yml`에 정의된 phase별 명령을 실행한다. A는 CloudFormation 템플릿, C는 의존성 목록(설치 대상일 뿐 실행 정의가 아님), D는 파이프라인 정의 산출물이다.

---

**문제 4.** 모델이 Registry에서 Approved로 변경될 때 자동으로 배포 파이프라인을 시작하려 한다. 이벤트 감지와 트리거를 담당하는 서비스 조합은?

A) EventBridge 규칙 → CodePipeline  
B) CloudWatch Logs → Athena  
C) S3 이벤트 알림 → SNS만으로 배포  
D) Kinesis → Firehose  

**정답: A**  
해설: 모델 승인 상태 변경은 EventBridge 이벤트를 발생시키고, 규칙의 타깃으로 지정된 CodePipeline이 배포를 시작한다. B는 분석용, C는 알림일 뿐 배포 오케스트레이션이 아니며, D는 스트리밍 데이터 파이프라인으로 무관하다.

---

**문제 5.** 신모델을 프로덕션에 자동 배포하되, 스테이징 검증 후 프로덕션 반영 직전에 사람이 한 번 통제하도록 하려 한다. 가장 적절한 방법은?

A) CodePipeline에 수동 승인(manual approval) 액션을 스테이징과 프로덕션 단계 사이에 둔다  
B) 프로덕션에 곧장 배포하고 문제가 생기면 삭제한다  
C) EventBridge 규칙을 비활성화한다  
D) 모델을 PendingManualApproval로 영구 유지한다  

**정답: A**  
해설: CodePipeline의 수동 승인 액션을 스테이징→프로덕션 사이에 두면, 스테이징 검증 결과를 사람이 확인하고 승인해야 프로덕션 배포가 진행되어 영향 반경을 줄인다. B는 위험하고, C·D는 배포 자동화 자체를 막아 요구를 충족하지 못한다.

---
