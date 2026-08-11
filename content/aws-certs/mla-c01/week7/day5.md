# Day 5 - Week 7 종합: MLOps 복습

## 📌 핵심 정리

- 이번 주는 **자동화·재현성·거버넌스**라는 MLOps 3원칙을 SageMaker 생태계 도구로 구현하는 과정이었다.
- 전체 사슬: **코드 푸시 → Build → 품질 게이트 → 등록 → 승인 → EventBridge → Deploy → 스테이징 → 수동 승인 → 프로덕션**.
- 오케스트레이터 선택 기준은 **묶는 범위 + 기존 자산 + 트리거 성격** 셋이다.
- 헷갈리는 축은 두 개 — **Pipelines vs Step Functions vs MWAA**(워크플로), **EventBridge**(트리거는 워크플로가 아니다).
- 시험은 도구 이름이 아니라 **시나리오 키워드 → 도구 매핑**을 묻는다. 키워드를 외워라.

## MLOps 전체 흐름 한눈에 보기

Pipelines로 워크플로를 코드화하고(Day 1), Registry로 버전과 승인을 관리하고(Day 2), CI/CD로 커밋부터 배포까지 자동화하고(Day 3), IaC와 오케스트레이터로 표준화했다(Day 4). 이제 하나로 잇는다.

```text
[코드 푸시] → CodePipeline(Build) → CodeBuild → SageMaker Pipeline
   (전처리 → 학습 → 평가 → ConditionStep[정확도 게이트] → RegisterModel)
        ↓ 모델이 PendingManualApproval로 Registry에 등록
[검토자 승인: Approved]
        ↓ EventBridge가 승인 이벤트 감지
   CodePipeline(Deploy) → CloudFormation으로 스테이징 배포 → 자동 테스트
        ↓ 수동 승인 게이트
   프로덕션 엔드포인트 배포
```

이 한 장이 이번 주 전체다. 각 화살표가 어떤 서비스로 구현되는지 떠올릴 수 있으면 시험 대비가 된 것이다.

| 사슬의 마디 | 담당 서비스 | 이 마디가 없으면 |
|-------------|-------------|------------------|
| 코드 변경 감지 | CodePipeline 소스 스테이지 | 사람이 매번 손으로 실행 |
| 명령 실행 | CodeBuild (`buildspec.yml`) | 파이프라인을 시작시킬 컴퓨트가 없음 |
| 학습·평가 순서 | SageMaker Pipelines(DAG) | 순서·의존성이 사람 머릿속에만 존재 |
| 품질 판정 | ConditionStep | 성능 미달 모델이 그대로 등록됨 |
| 버전·승인 | Model Registry | 무엇이 배포됐는지 증명 불가 |
| 승인 감지 | EventBridge | 승인해도 아무 일도 안 일어남 |
| 배포 실행 | CodePipeline + CloudFormation | 엔드포인트를 손으로 갱신 |
| 프로덕션 통제 | ManualApproval 액션 | 결함이 바로 사용자에게 도달 |

> 💡 **관련 이론**: MLOps의 3대 원칙은 자동화(automation), 재현성(reproducibility), 거버넌스(governance)다. 자동화는 사람의 수동 개입을 트리거와 파이프라인으로 대체하고, 재현성은 코드·데이터·인프라를 버전 관리해 같은 결과를 보장하며, 거버넌스는 누가 무엇을 승인·배포했는지 추적·통제한다. 이번 주의 모든 서비스는 이 셋 중 하나 이상을 구현하는 도구다.

| MLOps 원칙 | 구현 도구 | 이번 주 어디서 |
|------------|-----------|----------------|
| **자동화** | EventBridge, CodePipeline, CodeBuild, SageMaker Projects | Day 3·4 |
| **재현성** | SageMaker Pipelines(파라미터·DAG), CloudFormation/CDK | Day 1·4 |
| **거버넌스** | Model Registry(승인 상태·Lineage), ManualApproval 액션 | Day 2·3 |

## Day별 핵심 복습

### Day 1 - SageMaker Pipelines
- ML 워크플로를 코드로 정의된 **DAG**로 오케스트레이션하는 SageMaker 네이티브 서비스.
- 단계 타입: ProcessingStep, TrainingStep, TuningStep, RegisterModel, **ConditionStep**, TransformStep, LambdaStep, CallbackStep, FailStep 등.
- **파라미터**로 실행 시점 값 주입 → 같은 정의를 여러 환경에 재사용.
- **조건 단계**로 정확도 임계값 같은 품질 게이트를 만들어 형편없는 모델을 자동 차단.
- 한 단계 출력을 다음 단계 입력으로 참조하면 의존성이 자동으로 DAG 엣지가 됨. 참조가 없으면 병렬 실행.

### Day 2 - Model Registry & 거버넌스
- **Model Package Group**(목적별 묶음) 안에 등록하면 **버전이 자동 증가**.
- 각 버전은 아티팩트·추론 이미지·평가 메트릭·**승인 상태**를 담음.
- 승인 상태: **PendingManualApproval → Approved / Rejected**.
- 승인 상태 변경은 EventBridge 이벤트를 발생 → 배포 트리거로 연결.
- SageMaker Lineage와 연결해 데이터→학습→모델→배포 추적성(감사) 제공. 롤백은 이전 승인 버전 재배포.

### Day 3 - CI/CD for ML
- **SageMaker Projects**: Service Catalog 템플릿으로 저장소·CodePipeline·CodeBuild·Registry·EventBridge를 한 번에 프로비저닝.
- **Build 파이프라인**(코드 푸시 트리거) vs **Deploy 파이프라인**(모델 승인 트리거).
- 서비스 역할: CodeCommit(소스), CodeBuild(빌드, `buildspec.yml`), CodePipeline(오케스트레이션), CloudFormation(배포), EventBridge(트리거).
- 스테이징 → **수동 승인 게이트** → 프로덕션 단계 배포로 영향 반경 최소화.
- 승인은 두 번 — Registry의 `Approved`와 CodePipeline의 ManualApproval은 서로 다른 결정이다.

### Day 4 - IaC & 오케스트레이션
- **CloudFormation/CDK**: 인프라를 코드로(IaC) — 멱등성·재현성·환경 일관성. CDK는 합성하면 CloudFormation이 된다.
- **Step Functions**: 여러 AWS 서비스를 잇는 상태 머신(Choice·Parallel·Retry·Catch). SageMaker는 `.sync`로 완료 대기.
- **EventBridge**: 스케줄(cron)·이벤트 기반 트리거 — 워크플로 시작 신호.
- **MWAA**: 관리형 Airflow — 기존 Airflow 자산·하이브리드·복잡한 DAG.

## 시험에서 도구를 가르는 결정 기준

가장 자주 헷갈리는 비교를 표로 못박는다.

| 시나리오 키워드 | 정답 도구 |
|----------------|----------|
| SageMaker 작업 중심, 계보·Registry 통합 | SageMaker Pipelines |
| 여러 AWS 서비스(Lambda/Glue/SNS 등) 오케스트레이션 | Step Functions |
| 인프라를 코드로 재현·버전 관리 | CloudFormation / CDK |
| 정해진 시각/이벤트로 워크플로 시작 | EventBridge |
| 기존 Airflow 자산·하이브리드·멀티클라우드 | MWAA |
| MLOps CI/CD 인프라를 템플릿으로 빠르게 | SageMaker Projects |
| 모델 버전 추적·승인·감사 | Model Registry |
| 정확도 기준 통과 시에만 등록 | Pipelines의 ConditionStep |
| 모델 승인 시 자동 배포 | Registry 승인 → EventBridge → CodePipeline |
| 프로덕션 반영 직전 사람 통제 | CodePipeline ManualApproval 액션 |
| 기준 미달을 실패로 표시해 알리고 싶다 | ConditionStep의 `else_steps=[FailStep]` |
| 같은 정의로 dev/staging/prod를 다르게 실행 | Pipeline Parameter |

세 워크플로 도구는 특히 자주 붙어 나오므로 축을 나눠 외운다.

| 비교 축 | SageMaker Pipelines | Step Functions | MWAA (Airflow) |
|---------|--------------------|----------------|----------------|
| 묶는 범위 | SageMaker 작업 중심 | AWS 서비스 전반 | AWS + 온프레미스·외부까지 |
| 계보·Registry 통합 | 네이티브로 강함 | 약함(직접 연결) | 약함 |
| 운영 형태 | 관리형(작업 단위 과금) | 서버리스 | 상시 환경(유휴 비용) |
| 정의 방식 | SageMaker Python SDK | 상태 머신(JSON/ASL) | 파이썬 DAG + 연산자 |
| 고르는 결정타 | "SageMaker만으로 끝난다" | "SageMaker 밖 단계가 많다" | "이미 Airflow를 쓴다" |

```python
# 종합 개념 코드: 파이프라인 끝에서 조건 통과 시 등록 → 승인 시 배포 트리거
# 1) Pipelines: ConditionStep(if_steps=[RegisterModel])  → 품질 게이트
# 2) Registry: ModelApprovalStatus = "Approved"          → 거버넌스
# 3) EventBridge: ModelApprovalStatus=["Approved"] 패턴   → CD 트리거
# 4) CodePipeline + CloudFormation: 스테이징→승인→프로덕션 → 안전 배포
```

## 사슬을 거꾸로 추적하기

시험은 앞에서 뒤로만 묻지 않는다. "지금 프로덕션에 떠 있는 모델이 어디서 왔는지 증명하라"는 역방향 질문도 나온다.

```text
프로덕션 엔드포인트
     │  EndpointConfig → Model
     ▼
Model Package (버전 N)          ← Model Registry
     │  승인 상태 · 승인자 · ApprovalDescription
     │  ModelMetrics (평가 지표)
     ▼
Training Job                    ← 어떤 Estimator·하이퍼파라미터로
     │  ModelArtifacts.S3ModelArtifacts
     ▼
Processing Job (전처리)          ← 어떤 입력 데이터로
     ▼
S3 원본 데이터셋 · Git 커밋 해시
```

- 이 사슬이 끊기는 지점은 대개 **수동 개입**이다. 콘솔에서 손으로 만든 모델, 로컬에서 올린 아티팩트는 계보가 없다.
- 그래서 "감사 가능하게" 요구가 붙으면 답은 항상 **파이프라인 경유 등록 + Registry + Lineage**이지, 로그 검색이나 S3 버전 관리가 아니다.

| 감사 질문 | 답을 주는 곳 |
|-----------|-------------|
| 지금 배포된 게 어느 버전인가 | EndpointConfig → Model → Model Package ARN |
| 그 버전 성능은 얼마였나 | Model Package의 ModelMetrics |
| 누가 언제 승인했나 | 승인 상태 변경 이력·ApprovalDescription |
| 어떤 데이터로 학습했나 | Lineage → Training Job → 입력 채널 S3 경로 |
| 왜 이 모델이 통과했나 | 파이프라인 실행의 ConditionStep 결과 |

## 흔한 함정 정리

- **Pipelines vs Step Functions**: "SageMaker만"이면 Pipelines, "여러 서비스 전반"이면 Step Functions. 둘 다 DAG지만 통합 범위가 다르다.
- **EventBridge는 워크플로가 아니다**: 시작 신호(트리거)일 뿐, 워크플로 자체는 Pipelines/Step Functions/CodePipeline이 수행한다.
- **MWAA는 "이미 Airflow를 쓸 때"의 답**: 새 프로젝트를 SageMaker 안에서 시작한다면 Pipelines가 우선. MWAA는 기존 자산·하이브리드 키워드와 함께 나온다.
- **승인 상태 변경 = CD의 트리거**: "모델 승인 시 자동 배포"는 거의 항상 Registry 승인 → EventBridge → CodePipeline 사슬이다.
- **ConditionStep = 품질 게이트**: "정확도가 기준 이상일 때만 등록/배포"는 ConditionStep을 가리킨다.
- **CDK는 CloudFormation의 대체가 아니다**: 합성 결과가 CloudFormation 템플릿이다. "둘 중 무엇이 더 강력한가"를 묻는 게 아니라 작성 방식을 묻는 문제다.
- **파라미터는 객체 그대로**: `default_value`를 꺼내 쓰면 실행 시점 주입이 죽는다.
- **승인은 두 번 나온다**: Registry의 `Approved`(배포 흐름에 태우는 결정)와 CodePipeline의 ManualApproval(프로덕션에 내보내는 결정)은 다른 게이트다.
- **CodeBuild와 CodePipeline을 섞지 마라**: 실제로 명령을 돌리는 컴퓨트는 CodeBuild이고, CodePipeline은 순서를 관리할 뿐이다.

## 마지막 점검: 상황 → 무엇을 고르나

| 상황 | 답 |
|------|-----|
| 매일 새벽 재학습을 자동으로 돌려야 한다 | EventBridge 스케줄 규칙 → 파이프라인 실행 |
| 승인했는데 배포가 시작되지 않는다 | EventBridge 규칙 패턴·타깃 연결 확인 |
| 단계들이 순서 없이 동시에 실행된다 | 출력 참조 또는 `depends_on`으로 의존성 부여 |
| 배포된 모델의 출처를 감사에 제출해야 한다 | Model Registry + SageMaker Lineage |
| 새 모델이 문제라 즉시 되돌려야 한다 | 직전 승인 버전 ARN으로 재배포(롤백) |
| dev/prod 엔드포인트 설정이 서로 다르다 | CloudFormation/CDK 템플릿으로 통일 |
| Glue ETL과 Lambda 알림까지 한 흐름에 묶어야 한다 | Step Functions |
| 기준 미달인데 실행이 성공으로 끝나 아무도 몰랐다 | `else_steps=[FailStep]`으로 명시적 실패 |
| 매 실행마다 전처리를 다시 돌아 비용이 크다 | 변하지 않는 단계에 `CacheConfig` |
| 온프레미스 작업까지 한 DAG로 묶어야 한다 | MWAA |
| 저장소·파이프라인·Registry를 처음부터 다 만들어야 한다 | SageMaker Projects 템플릿 |
| 승인은 자동으로, 프로덕션 반영만 사람이 확인 | 자동 승인 + CodePipeline ManualApproval |

> 💡 **개념**: 이번 주 문제를 푸는 가장 빠른 방법은 **층을 먼저 정하는 것**이다. "무엇이 존재하는가(IaC) / 무엇을 어떤 순서로(워크플로) / 언제 시작하는가(트리거) / 누가 책임지는가(거버넌스)" 넷 중 어느 층을 묻는지 정하면, 보기 네 개 중 둘은 대개 다른 층 도구라 바로 지워진다.

다음 주에는 배포된 모델을 지켜보는 모니터링과 관측성으로 넘어간다.

## 📖 용어

- **MLOps** : 모델을 만들고 배포하고 지켜보는 과정을 사람 손이 아니라 자동화된 파이프라인으로 굴리는 방식.
- **자동화·재현성·거버넌스** : MLOps 3원칙. 사람 개입 줄이기 / 같은 결과 보장하기 / 누가 승인했는지 남기기.
- **품질 게이트** : 성능 기준을 통과한 모델만 다음 단계로 넘기는 자동 검문소. Pipelines에서는 ConditionStep이 맡는다.
- **CI/CD 사슬** : 코드 푸시부터 프로덕션 배포까지 이어지는 자동 처리 경로 전체.
- **Build 파이프라인 / Deploy 파이프라인** : 앞은 코드가 바뀌면 학습·등록까지, 뒤는 모델이 승인되면 배포까지 담당한다.
- **트리거(trigger)** : 워크플로를 시작시키는 신호. 스케줄이거나 이벤트다. 워크플로 자체와는 다르다.
- **오케스트레이터** : 여러 작업의 실행 순서·분기·재시도를 관리하는 도구. Pipelines·Step Functions·MWAA가 여기 속한다.
- **Lineage(계보)** : 이 모델이 어떤 데이터·코드·작업에서 나왔는지 거슬러 올라갈 수 있게 남긴 연결 기록.
- **ManualApproval 게이트** : 자동 배포 흐름 한가운데 두는 사람 확인 지점. 영향 반경을 줄이는 장치.
- **롤백** : 새 배포가 잘못됐을 때 직전 정상 버전으로 되돌리는 것. Registry에 버전이 남아 있어 가능하다.

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
