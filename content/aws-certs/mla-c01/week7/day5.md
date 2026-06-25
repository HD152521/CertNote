# Day 5 - Week 7 종합: MLOps 복습

이번 주는 "모델을 배포한다"에서 "모델 배포를 자동화하고 거버넌스한다"로 넘어왔다. SageMaker Pipelines로 워크플로를 코드화하고(Day 1), Model Registry로 버전과 승인을 관리하고(Day 2), CI/CD로 코드 커밋부터 배포까지 자동화하고(Day 3), IaC와 오케스트레이터들로 인프라와 워크플로를 표준화했다(Day 4). 오늘은 이 MLOps 조각들을 하나의 큰 그림으로 묶고, 시험에서 도구를 가르는 결정 기준을 정리한다.

## MLOps 전체 흐름 한눈에 보기

전형적인 SageMaker MLOps 파이프라인을 끝에서 끝까지 보면 이렇다.

```
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

> 💡 **관련 이론**: MLOps의 3대 원칙은 자동화(automation), 재현성(reproducibility), 거버넌스(governance)다. 자동화는 사람의 수동 개입을 트리거와 파이프라인으로 대체하고, 재현성은 코드·데이터·인프라를 버전 관리해 같은 결과를 보장하며, 거버넌스는 누가 무엇을 승인·배포했는지 추적·통제한다. 이번 주의 모든 서비스는 이 셋 중 하나 이상을 구현하는 도구다.

## Day별 핵심 복습

### Day 1 - SageMaker Pipelines
- ML 워크플로를 코드로 정의된 **DAG**로 오케스트레이션하는 SageMaker 네이티브 서비스.
- 단계 타입: ProcessingStep, TrainingStep, TuningStep, RegisterModel, **ConditionStep**, TransformStep 등.
- **파라미터**로 실행 시점 값 주입 → 같은 정의를 여러 환경에 재사용.
- **조건 단계**로 정확도 임계값 같은 품질 게이트를 만들어 형편없는 모델을 자동 차단.
- 한 단계 출력을 다음 단계 입력으로 참조하면 의존성이 자동으로 DAG 엣지가 됨.

### Day 2 - Model Registry & 거버넌스
- **Model Package Group**(목적별 묶음) 안에 등록하면 **버전이 자동 증가**.
- 각 버전은 아티팩트·추론 이미지·평가 메트릭·**승인 상태**를 담음.
- 승인 상태: **PendingManualApproval → Approved / Rejected**.
- 승인 상태 변경은 EventBridge 이벤트를 발생 → 배포 트리거로 연결.
- SageMaker Lineage와 연결해 데이터→학습→모델→배포 추적성(감사) 제공.

### Day 3 - CI/CD for ML
- **SageMaker Projects**: Service Catalog 템플릿으로 저장소·CodePipeline·CodeBuild·Registry·EventBridge를 한 번에 프로비저닝.
- **Build 파이프라인**(코드 푸시 트리거) vs **Deploy 파이프라인**(모델 승인 트리거).
- 서비스 역할: CodeCommit(소스), CodeBuild(빌드, `buildspec.yml`), CodePipeline(오케스트레이션), CloudFormation(배포), EventBridge(트리거).
- 스테이징 → **수동 승인 게이트** → 프로덕션 단계 배포로 영향 반경 최소화.

### Day 4 - IaC & 오케스트레이션
- **CloudFormation/CDK**: 인프라를 코드로(IaC) — 멱등성·재현성·환경 일관성.
- **Step Functions**: 여러 AWS 서비스를 잇는 상태 머신(분기·병렬·재시도·Catch).
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

```python
# 종합 개념 코드: 파이프라인 끝에서 조건 통과 시 등록 → 승인 시 배포 트리거
# 1) Pipelines: ConditionStep(if_steps=[RegisterModel])  → 품질 게이트
# 2) Registry: ModelApprovalStatus = "Approved"          → 거버넌스
# 3) EventBridge: ModelApprovalStatus=["Approved"] 패턴   → CD 트리거
# 4) CodePipeline + CloudFormation: 스테이징→승인→프로덕션 → 안전 배포
```

## 흔한 함정 정리

- **Pipelines vs Step Functions**: "SageMaker만"이면 Pipelines, "여러 서비스 전반"이면 Step Functions. 둘 다 DAG지만 통합 범위가 다르다.
- **EventBridge는 워크플로가 아니다**: 시작 신호(트리거)일 뿐, 워크플로 자체는 Pipelines/Step Functions/CodePipeline이 수행한다.
- **MWAA는 "이미 Airflow를 쓸 때"의 답**: 새 프로젝트를 SageMaker 안에서 시작한다면 Pipelines가 우선. MWAA는 기존 자산·하이브리드 키워드와 함께 나온다.
- **승인 상태 변경 = CD의 트리거**: "모델 승인 시 자동 배포"는 거의 항상 Registry 승인 → EventBridge → CodePipeline 사슬이다.
- **ConditionStep = 품질 게이트**: "정확도가 기준 이상일 때만 등록/배포"는 ConditionStep을 가리킨다.

## 정리

- 이번 주는 자동화·재현성·거버넌스라는 MLOps 3원칙을 SageMaker 생태계 도구로 구현하는 과정이었다.
- 코드 푸시 → Build → 품질 게이트 → 등록 → 승인 → EventBridge → Deploy → 스테이징 → 수동 승인 → 프로덕션이 전체 사슬이다.
- 도구 선택은 "묶는 범위 + 기존 자산 + 트리거 성격"으로 갈린다.
- 시험은 이 도구들을 시나리오로 구분해 묻는다 — 키워드를 도구에 매핑하는 연습이 핵심이다.

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
