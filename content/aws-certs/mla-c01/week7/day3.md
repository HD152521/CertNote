# Day 3 - CI/CD for ML: SageMaker Projects, CodePipeline/CodeBuild 연계, 자동 배포

어제까지 파이프라인(Day 1)과 Model Registry(Day 2)를 만들었다. 그런데 코드를 한 줄 고칠 때마다 사람이 노트북에서 파이프라인을 다시 돌리고, 승인 버튼을 누르고, 엔드포인트를 손으로 갱신한다면 여전히 수동 운영이다. **CI/CD(지속적 통합/지속적 배포)**는 코드 커밋부터 모델 배포까지의 사슬을 자동화한다. 소프트웨어 엔지니어링의 CI/CD를 ML에 그대로 가져온 것이 MLOps의 마지막 퍼즐이다.

오늘은 AWS의 ML CI/CD 도구인 **SageMaker Projects**, 그리고 그 뒤를 받치는 **CodePipeline / CodeBuild / CodeCommit** 연계와 자동 배포 흐름을 다룬다. MLA-C01 시험은 "코드 변경이 자동으로 모델 재학습·배포로 이어지게 하라"는 시나리오에서 이 조합을 묻는다.

## CI/CD를 ML에 적용한다는 것

전통적 소프트웨어 CI/CD는 코드 푸시 → 빌드 → 테스트 → 배포다. ML에서는 여기에 **데이터와 모델**이라는 축이 더해진다.

- **CI (지속적 통합)**: 코드(전처리·학습 스크립트) 변경 시 자동으로 파이프라인을 실행해 모델을 학습·평가하고 Registry에 등록.
- **CD (지속적 배포)**: 모델이 승인되면 자동으로 스테이징·프로덕션 엔드포인트에 배포.

이를 직접 손으로 엮을 수도 있지만, AWS는 **SageMaker Projects**라는 템플릿으로 전체 골격을 한 번에 깔아준다.

> 💡 **관련 이론**: ML CI/CD의 핵심 사상은 "모델 배포를 소프트웨어 배포처럼 버전 관리·자동화·롤백 가능하게 만든다"이다. 코드, 데이터, 모델이 모두 추적되고, 변경이 자동 트리거로 이어지며, 문제가 생기면 이전 버전으로 되돌릴 수 있어야 한다. 시험에서 "Git 커밋 → 자동 재학습·배포"라는 흐름은 SageMaker Projects + Code* 서비스 조합을 가리킨다.

## SageMaker Projects — MLOps 템플릿

SageMaker Projects는 **MLOps에 필요한 CI/CD 인프라를 미리 구성된 템플릿(Service Catalog 기반)으로 프로비저닝**한다. 프로젝트를 생성하면 다음이 한꺼번에 생성된다.

| 생성되는 자원 | 역할 |
|--------------|------|
| 소스 코드 저장소 (CodeCommit 또는 Git) | 전처리·학습·배포 코드 |
| Build 파이프라인 (CodePipeline + CodeBuild) | 코드 변경 시 SageMaker Pipeline 실행 → 모델 등록 |
| Deploy 파이프라인 (CodePipeline) | 모델 승인 시 스테이징/프로덕션 엔드포인트 배포 |
| Model Registry 그룹 | 학습된 모델 버전 카탈로그 |
| EventBridge 규칙 | 코드 푸시·모델 승인 이벤트 감지 트리거 |

즉 어제·그제 수동으로 만든 것들이 표준 템플릿으로 통째로 묶여 나온다. 대표 템플릿은 "model building, training, and deployment"로, build 저장소와 deploy 저장소 두 개를 만든다.

## 두 개의 파이프라인: Build와 Deploy

SageMaker Projects의 표준 구조는 두 단계로 나뉜다.

**1) Build(모델 빌드) 파이프라인** — 코드 중심
- 개발자가 학습 코드를 저장소에 푸시
- CodePipeline이 변경을 감지해 CodeBuild 실행
- CodeBuild가 SageMaker Pipeline(전처리→학습→평가→등록)을 실행
- 결과 모델이 Model Registry에 `PendingManualApproval`로 등록

**2) Deploy(모델 배포) 파이프라인** — 모델 중심
- Model Registry에서 모델이 `Approved`로 변경됨
- EventBridge가 승인 이벤트를 감지해 Deploy 파이프라인 트리거
- CloudFormation으로 스테이징 엔드포인트 배포 → 자동 테스트
- 수동 승인 게이트 통과 시 프로덕션 엔드포인트 배포

이렇게 코드 변경(CI)과 모델 승인(CD)이 서로 다른 트리거로 분리돼 있다.

## CodeCommit / CodeBuild / CodePipeline의 역할

각 서비스가 맡는 부분을 명확히 구분하는 것이 시험 포인트다.

| 서비스 | 역할 |
|--------|------|
| CodeCommit | Git 소스 저장소 (코드 버전 관리) |
| CodeBuild | 빌드·테스트 실행 환경 (buildspec.yml로 명령 정의) |
| CodePipeline | 단계들을 잇는 오케스트레이터 (소스→빌드→배포 흐름) |
| CloudFormation | 엔드포인트 등 인프라를 코드로 배포 |
| EventBridge | 이벤트(코드 푸시, 모델 승인) 기반 트리거 |

CodeBuild의 작업은 `buildspec.yml`로 정의한다. 예를 들어 SageMaker Pipeline을 실행하는 빌드 단계는 이렇게 생긴다.

```yaml
# buildspec.yml — CodeBuild가 실행할 명령 정의
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.11
    commands:
      - pip install -r requirements.txt
  build:
    commands:
      # 코드 변경 시 SageMaker Pipeline을 생성/갱신하고 실행
      - python pipelines/run_pipeline.py --upsert
      - python pipelines/run_pipeline.py --start
```

## 자동 배포 트리거: 승인 → EventBridge → 배포

CD의 심장은 어제 배운 **모델 승인 이벤트**다. Model Registry에서 승인 상태가 바뀌면 EventBridge가 이를 잡아 Deploy 파이프라인을 시작한다.

```python
import boto3
events = boto3.client("events")

# 모델 승인 상태가 Approved로 바뀌면 Deploy 파이프라인을 트리거하는 규칙
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

이 규칙의 타깃을 Deploy용 CodePipeline으로 지정하면, 사람이 모델을 승인하는 순간 배포가 자동으로 굴러간다. 스테이징 검증 후 프로덕션 배포 전에 **수동 승인 단계(manual approval action)**를 한 번 더 두는 것이 안전 패턴이다.

```python
# CodePipeline 단계 예시(개념): 스테이징 → 수동 승인 → 프로덕션
# 1. DeployStaging   (CloudFormation으로 스테이징 엔드포인트 생성)
# 2. ApprovalGate    (사람이 스테이징 결과 확인 후 승인)
# 3. DeployProd      (프로덕션 엔드포인트 배포)
```

> 💡 **관련 이론**: CI/CD에서 스테이징 → 수동 승인 → 프로덕션의 단계적 배포는 "blast radius(영향 반경) 최소화" 원칙이다. 신모델을 곧장 프로덕션에 넣지 않고 스테이징에서 검증한 뒤 게이트를 통과시키면, 결함이 사용자에게 닿기 전에 걸러진다. 시험에서 "안전하게 자동 배포하되 프로덕션 직전 통제를 두려면"이라는 문장은 CodePipeline의 수동 승인 액션을 가리킨다.

## 직접 구성 vs SageMaker Projects

SageMaker Projects 없이 CodePipeline·CodeBuild·EventBridge를 직접 엮어도 동일한 결과를 만들 수 있다. 차이는 다음과 같다.

- **SageMaker Projects**: 표준 MLOps 템플릿을 빠르게 깔고 싶을 때. Service Catalog로 거버넌스·재사용까지 묶임. 시험에서 "MLOps를 빠르게 표준화"면 이쪽.
- **직접 구성**: 기존 CI/CD 파이프라인에 통합하거나 비표준 요구가 있을 때. 유연하지만 손이 많이 감.

## 정리

- ML CI/CD는 코드 변경 → 자동 재학습·등록(CI)과 모델 승인 → 자동 배포(CD)를 자동화한다.
- SageMaker Projects는 CodeCommit/CodePipeline/CodeBuild/Registry/EventBridge로 구성된 MLOps 템플릿을 한 번에 프로비저닝한다.
- Build 파이프라인은 코드 푸시로, Deploy 파이프라인은 모델 승인으로 트리거된다.
- 승인 → EventBridge → CodePipeline → CloudFormation 배포가 표준 CD 사슬이며, 프로덕션 직전 수동 승인 게이트로 안전성을 높인다.
- "Git 커밋부터 모델 배포까지 자동화·표준화"면 SageMaker Projects + Code* 조합이 정답이다.

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
