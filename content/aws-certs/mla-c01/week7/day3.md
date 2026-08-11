# Day 3 - CI/CD for ML: SageMaker Projects, CodePipeline/CodeBuild 연계, 자동 배포

## 📌 핵심 정리

- ML CI/CD는 **코드 변경 → 자동 재학습·등록(CI)** 과 **모델 승인 → 자동 배포(CD)** 를 서로 다른 트리거로 나눠 자동화한다.
- **SageMaker Projects**는 저장소·CodePipeline·CodeBuild·Model Registry·EventBridge를 **Service Catalog 템플릿으로 한 번에** 프로비저닝한다.
- 표준 구조는 **Build 파이프라인(코드 푸시 트리거)** 과 **Deploy 파이프라인(모델 승인 트리거)** 두 개다.
- 표준 CD 사슬: **Registry 승인 → EventBridge → CodePipeline → CloudFormation 배포**.
- 스테이징 배포 뒤 **수동 승인 게이트**를 두고 프로덕션에 나가는 것이 영향 반경을 줄이는 안전 패턴이다.

## CI/CD를 ML에 적용한다는 것

코드를 한 줄 고칠 때마다 사람이 노트북에서 파이프라인을 다시 돌리고, 승인 버튼을 누르고, 엔드포인트를 손으로 갱신한다면 여전히 수동 운영이다. 전통적 소프트웨어 CI/CD는 코드 푸시 → 빌드 → 테스트 → 배포인데, ML에서는 여기에 **데이터와 모델**이라는 축이 더해진다.

| 구분 | 전통 소프트웨어 CI/CD | ML CI/CD |
|------|----------------------|----------|
| 입력 | 코드 | 코드 **+ 데이터** |
| 빌드 산출물 | 바이너리·이미지 | **학습된 모델 아티팩트** |
| 테스트 | 단위·통합 테스트 | 테스트 + **모델 평가 지표 게이트** |
| 승인 대상 | 릴리스 후보 | **모델 버전(Registry)** |
| 재실행 계기 | 코드 변경 | 코드 변경 + **데이터 변경·드리프트·스케줄** |

- **CI (지속적 통합)**: 전처리·학습 스크립트 변경 시 자동으로 파이프라인을 실행해 학습·평가하고 Registry에 등록.
- **CD (지속적 배포)**: 모델이 승인되면 자동으로 스테이징·프로덕션 엔드포인트에 배포.
- 직접 손으로 엮을 수도 있지만, AWS는 **SageMaker Projects**라는 템플릿으로 전체 골격을 한 번에 깔아준다.

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

- 어제·그제 수동으로 만든 것들이 표준 템플릿으로 통째로 묶여 나온다.
- 대표 템플릿은 "model building, training, and deployment"로, **build 저장소와 deploy 저장소 두 개**를 만든다.

## 전체 CI/CD 사슬 한눈에

```text
 ┌──────────── CI (코드 축) ────────────┐
 개발자 git push
      │
      ▼
 CodeCommit / Git 저장소
      │  (푸시 이벤트)
      ▼
 CodePipeline(Build) ──▶ CodeBuild (buildspec.yml)
                              │
                              ▼
                    SageMaker Pipeline 실행
              전처리 → 학습 → 평가 → ConditionStep
                              │ 통과
                              ▼
                    RegisterModel → Model Registry
                    (PendingManualApproval)
 ─────────────────────────────────────────────────
 ┌──────────── CD (모델 축) ────────────┐
      검토자가 Approved 로 변경
                              │
                              ▼
              EventBridge "Model Package State Change"
                              │
                              ▼
                    CodePipeline(Deploy)
                              │
                ┌─────────────┴─────────────┐
                ▼                           │
      CloudFormation → 스테이징 엔드포인트     │
                ▼                           │
           자동 테스트 통과                    │
                ▼                           │
      ManualApproval 액션 (사람 확인) ────────┘
                ▼
      CloudFormation → 프로덕션 엔드포인트
```

핵심은 **점선 위아래의 트리거가 서로 다르다**는 점이다. 위는 코드 푸시, 아래는 모델 승인이다.

## 두 개의 파이프라인: Build와 Deploy

| 비교 축 | Build 파이프라인 | Deploy 파이프라인 |
|---------|-----------------|------------------|
| 무엇이 중심인가 | **코드** | **모델 버전** |
| 트리거 | 저장소 코드 푸시 | Registry 승인(Approved) 이벤트 |
| 하는 일 | SageMaker Pipeline 실행 → 학습·평가·등록 | 엔드포인트 생성/갱신 |
| 주 실행 도구 | CodeBuild(`buildspec.yml`) | CloudFormation 스택 배포 |
| 산출물 | Registry의 새 모델 버전 | 스테이징·프로덕션 엔드포인트 |
| 사람 개입 | 보통 없음 | 프로덕션 직전 수동 승인 게이트 |
| CI/CD 구분 | CI | CD |

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

## CodeCommit / CodeBuild / CodePipeline의 역할

각 서비스가 맡는 부분을 명확히 구분하는 것이 시험 포인트다.

| 서비스 | 역할 | 헷갈리기 쉬운 지점 |
|--------|------|-------------------|
| **CodeCommit** | Git 소스 저장소 (코드 버전 관리) | 저장만 한다. 실행하지 않는다 |
| **CodeBuild** | 빌드·테스트 실행 환경 (`buildspec.yml`로 명령 정의) | 실제로 명령을 돌리는 유일한 컴퓨트 |
| **CodePipeline** | 단계들을 잇는 오케스트레이터 (소스→빌드→배포 흐름) | 직접 빌드하지 않는다. 순서를 관리한다 |
| **CloudFormation** | 엔드포인트 등 인프라를 코드로 배포 | 배포의 실행자. 롤백 단위이기도 하다 |
| **EventBridge** | 이벤트(코드 푸시, 모델 승인) 기반 트리거 | 워크플로가 아니라 **시작 신호**다 |

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

> ⚠️ **함정**: "모델 승인 시 자동 배포"와 "프로덕션 직전 사람 확인"은 서로 모순이 아니다. 승인이 **두 번** 나온다 — 첫 번째는 Registry의 `Approved`(모델을 배포 흐름에 태우는 결정), 두 번째는 CodePipeline의 ManualApproval 액션(스테이징 검증 결과를 보고 프로덕션에 내보내는 결정)이다. 보기에서 이 둘을 하나로 뭉뚱그린 선택지는 오답인 경우가 많다.

## 직접 구성 vs SageMaker Projects

SageMaker Projects 없이 CodePipeline·CodeBuild·EventBridge를 직접 엮어도 동일한 결과를 만들 수 있다.

| 비교 축 | SageMaker Projects | 직접 구성 |
|---------|-------------------|-----------|
| 도입 속도 | 템플릿 프로비저닝으로 즉시 | 서비스를 하나씩 엮어야 함 |
| 표준화 | Service Catalog로 조직 전체 재사용·거버넌스 | 팀마다 제각각이 되기 쉬움 |
| 유연성 | 템플릿 범위 안에서 커스터마이즈 | 제약 없음 |
| 기존 CI/CD 통합 | 새 골격이 깔림 | 기존 파이프라인에 붙이기 쉬움 |
| 시험 키워드 | "MLOps를 빠르게 표준화·템플릿" | "기존 CI/CD에 통합·비표준 요구" |

어느 쪽이든 **재학습을 무엇이 촉발하는가**는 따로 설계해야 한다. 코드 푸시만으로는 데이터가 바뀌는 상황을 못 잡는다.

| 재학습 트리거 | 구현 | 맞는 상황 |
|---------------|------|-----------|
| 코드 변경 | 저장소 푸시 → Build 파이프라인 | 알고리즘·피처 로직을 고쳤을 때 |
| 정기 스케줄 | EventBridge cron 규칙 | 데이터가 꾸준히 쌓이는 서비스 |
| 새 데이터 도착 | S3 이벤트 → EventBridge | 배치가 비정기적으로 들어올 때 |
| 품질 저하 감지 | 모니터링 경보 → 파이프라인 실행 | 드리프트로 성능이 떨어졌을 때 |

## CI/CD가 꼬일 때: 증상 → 원인 → 조치

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 코드를 푸시했는데 아무 일도 안 일어난다 | 소스 스테이지 브랜치 불일치, 트리거 비활성 | 파이프라인 소스 브랜치·감지 설정 확인 |
| 승인했는데 Deploy 파이프라인이 안 돈다 | EventBridge 패턴 오타, 타깃 미연결, 규칙 비활성 | 이벤트 패턴·타깃·규칙 상태 점검 |
| CodeBuild가 시작하자마자 실패한다 | `buildspec.yml` 위치·문법 오류, 런타임 버전 불일치 | 저장소 루트의 buildspec 경로·phase 문법 확인 |
| 빌드가 SageMaker 작업 생성에서 거부된다 | CodeBuild 역할에 SageMaker 권한·`iam:PassRole` 없음 | 빌드 역할에 대상 실행 역할 PassRole 부여 |
| 스테이징은 되는데 프로덕션이 안 나간다 | 수동 승인 액션에서 대기 중 | 승인자·알림 대상 설정 후 승인 처리 |
| 배포 스택이 중간에 실패하고 롤백된다 | 엔드포인트 설정 오류·용량 부족·이름 충돌 | CloudFormation 이벤트 로그에서 실패 리소스 확인 |
| 잘못된 모델이 프로덕션에 나갔다 | 등록 시 상태를 곧장 `Approved`로 지정 | `PendingManualApproval` 등록 + 검토 게이트 복원 |
| 롤백이 오래 걸린다 | 이전 버전 정보를 따로 관리하지 않음 | Registry의 직전 승인 버전 ARN으로 재배포 |

> 💡 **개념**: CI/CD 장애는 대부분 **트리거**·**권한**·**정의** 셋 중 하나다. 아무 일도 안 일어나면 트리거, 시작은 했는데 중간에 거부되면 권한, 끝까지 갔는데 결과가 틀리면 정의(buildspec·템플릿) 문제다. 이 순서로 좁히면 로그를 다 뒤지지 않아도 된다.

내일은 이 배포를 떠받치는 인프라 자체를 코드로 관리하는 IaC와, SageMaker 밖까지 아우르는 오케스트레이터들을 비교한다.

## 📖 용어

- **CI (지속적 통합)** : 코드가 바뀌면 자동으로 학습·평가까지 돌려 결과 모델을 등록하는 단계.
- **CD (지속적 배포)** : 승인된 모델을 사람 손 없이 엔드포인트까지 밀어 넣는 단계.
- **SageMaker Projects** : MLOps용 저장소·파이프라인·Registry·트리거를 템플릿 하나로 통째로 깔아 주는 기능.
- **Service Catalog** : 조직이 승인한 인프라 템플릿을 모아 두고 표준대로만 만들게 하는 AWS 서비스. Projects의 바탕이다.
- **Build 파이프라인** : 코드 푸시로 시작해 모델을 학습·등록까지 하는 쪽 파이프라인.
- **Deploy 파이프라인** : 모델 승인으로 시작해 엔드포인트를 배포하는 쪽 파이프라인.
- **buildspec.yml** : CodeBuild가 어떤 명령을 어떤 순서로 실행할지 적어 둔 파일.
- **ManualApproval 액션** : CodePipeline 중간에 사람이 눌러야만 다음으로 넘어가는 정지 지점.
- **EventBridge 규칙** : "이런 이벤트가 오면 저기로 보내라"는 라우팅 규칙. 배포 자동화의 방아쇠.
- **blast radius (영향 반경)** : 문제가 터졌을 때 피해가 미치는 범위. 스테이징을 거치는 이유가 이걸 줄이기 위해서다.

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
