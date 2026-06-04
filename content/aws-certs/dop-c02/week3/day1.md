# Day 1 - buildspec.yml의 진짜 의미: 파이프라인 명세가 코드가 되는 순간

2011년 AWS re:Invent에서 CodeBuild의 전신 격인 CI 인프라 아이디어가 처음 언급되기 전까지, AWS 사용자들은 Jenkins를 EC2에 직접 올리거나 외부 SaaS CI 서비스를 쓰는 것이 일반적이었다. 문제는 Jenkins가 "설치해야 하는 서버"였다는 점이다. 서버를 관리해야 하고, 플러그인이 충돌하고, 빌드 큐가 쌓이면 더 큰 인스턴스로 업그레이드해야 했다. 2016년 CodeBuild가 정식 출시되면서 AWS는 다른 접근을 택했다 — 빌드 환경 자체를 컨테이너로 띄우고, 빌드가 끝나면 버린다. 그리고 "어떻게 빌드할 것인가"는 `buildspec.yml`이라는 파일 하나에 담기로 했다.

이것이 Pipeline-as-Code의 CodeBuild 버전이다. buildspec.yml을 이해하는 것은 단순히 YAML 문법을 외우는 것이 아니다. "빌드 절차가 코드가 된다"는 철학을 이해하는 것이고, 그 위에서 보안·캐시·아티팩트·테스트 시각화가 어떻게 맞물리는지를 파악하는 일이다.

## buildspec.yml 전체 구조: 파일 하나로 읽는 빌드 계약

```yaml
version: 0.2  # 0.1은 2017년 deprecated. 반드시 0.2.

env:
  variables:
    NODE_ENV: production          # 평문 환경 변수
  parameter-store:
    DB_HOST: /myapp/prod/db-host  # SSM Parameter Store fetch
  secrets-manager:
    DB_PASS: prod/db:password::AWSCURRENT
    #         secretId:jsonKey:versionStage:versionId
  exported-variables:
    - BUILD_ID                    # 다음 Pipeline Stage로 전달

phases:
  install:
    runtime-versions:
      nodejs: 20
      python: 3.11
    commands:
      - npm ci
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
  build:
    commands:
      - docker build -t myapp:$CODEBUILD_BUILD_NUMBER .
  post_build:
    commands:
      - docker push $ECR/myapp:$CODEBUILD_BUILD_NUMBER
    on-failure: ABORT

reports:
  unit-tests:
    files: ['reports/junit-*.xml']
    file-format: JUNITXML

artifacts:
  files:
    - dist/**/*
    - appspec.yml
  base-directory: build
  secondary-artifacts:
    docs:
      files: docs/**/*

cache:
  paths:
    - node_modules/**/*
    - /root/.m2/**/*
```

`version: 0.2`가 단순해 보이지만 실은 중요하다. 0.1과 0.2는 환경 변수 명명 규칙과 일부 페이즈 동작이 다르다. 2017년 이후 AWS 공식 문서는 0.2만 설명하고, 시험도 0.2를 전제로 한다.

> 💡 **관련 이론**: buildspec.yml은 **선언적(declarative) 빌드 정의**다. Makefile이 "명령을 순서대로 실행하라"는 imperative 스타일이라면, buildspec은 "이 페이즈에서는 이런 명령들이 실행되어야 한다"는 계약 형태다. 이 철학은 Kubernetes의 Pod spec, Docker Compose와 같은 계보에 있다. 모두 "원하는 상태를 기술하면 시스템이 달성한다"는 패러다임이다.

> 🔍 **더 깊이**: buildspec.yml은 버전 관리가 된다. 코드 저장소 루트에 두면 git blame으로 "언제 누가 빌드 절차를 바꿨는지"가 추적된다. 2015년 이전 Jenkins GUI 파이프라인의 최대 문제는 설정이 Jenkins DB에 저장되어 버전 관리가 안 된다는 것이었다. buildspec.yml은 그 문제를 해결한다 — 빌드 절차가 PR 리뷰 대상이 된다.

## 페이즈 실행 순서와 실패 처리: 컨테이너 라이프사이클의 논리

CodeBuild는 빌드 하나를 위해 새 컨테이너를 띄우고, 다음 순서로 실행하며, 끝나면 컨테이너를 삭제한다.

```
[Container Provision] → [Source Download] → [Restore Cache]
  → install → pre_build → build → post_build
  → [reports] → [artifacts] → [Save Cache]
  → [Container Terminate]
```

| 페이즈 | 실패 시 기본 동작 | 변경 방법 | 실무 용도 |
|--------|-------------------|-----------|-----------|
| install | ABORT (이후 페이즈 안 함) | `on-failure: CONTINUE` | runtime 설치 실패 = 빌드 의미 없음 |
| pre_build | ABORT | 동일 | ECR 로그인, 환경 검증 |
| build | **post_build는 실행됨** | `on-failure: ABORT/CONTINUE` | 실제 빌드, 테스트 |
| post_build | 빌드 결과에 영향 | 동일 | push, 아티팩트 정리 |

`build` 페이즈가 실패해도 `post_build`가 실행되는 이유는 "정리 코드"를 위해서다. Docker 로그아웃, 임시 파일 정리, 실패 알림 발송 같은 작업은 빌드 성공 여부와 무관하게 항상 해야 한다.

```yaml
post_build:
  commands:
    - docker push $ECR/myapp:$IMAGE_TAG
  finally:                          # 성공/실패 무관하게 항상 실행
    - docker logout $ECR
    - echo "Build complete: $CODEBUILD_BUILD_ID"
```

`finally` 블록은 각 페이즈 내에 둘 수 있다. 이것은 Java의 `try-finally`와 정확히 같은 의미 — 예외 발생 여부와 무관하게 실행이 보장된다.

> ⚠️ **함정**: `build` 페이즈에서 `on-failure: CONTINUE`를 설정하면, 빌드가 실패해도 파이프라인이 계속 진행될 수 있다. 테스트 실패를 무시하고 배포까지 가는 사고가 이 설정에서 발생한다. `on-failure`는 "리소스 정리를 위한 CONTINUE"에만 써야 하고, 핵심 빌드 단계에는 기본값(ABORT)이 맞다.

> 💡 **관련 이론**: 페이즈 순서는 소프트웨어 빌드의 전통적 단계와 정확히 맞는다. **Configure → Compile → Test → Package**가 install → build → post_build로 매핑된다. pre_build는 "사전 조건 검증"이라는 CI/CD 모범 사례에서 온다 — 환경이 올바른지 먼저 확인하고, 그 다음에 실제 작업을 시작한다.

## 환경 변수 3단계: 보안의 계층 구조

| 방식 | 저장소 | 노출 범위 | IAM 권한 |
|------|--------|-----------|----------|
| `env.variables` | buildspec 평문 | 로그에 노출 가능 | 없음 |
| `env.parameter-store` | SSM Parameter Store | 로그에 노출 안 됨 | `ssm:GetParameter` |
| `env.secrets-manager` | Secrets Manager | 로그에 절대 노출 안 됨 | `secretsmanager:GetSecretValue` + `kms:Decrypt` |

```yaml
env:
  parameter-store:
    DB_HOST: /myapp/prod/db-host          # String 또는 SecureString
  secrets-manager:
    DB_PASS: prod/db-secret:password::AWSCURRENT
    #         ^secret-id  ^json-key ^version-stage
    API_KEY: prod/api-key
```

Secrets Manager 참조 형식 `secret-id:json-key:version-stage:version-id`에서 `json-key`는 시크릿이 JSON 형식일 때 특정 필드를 추출한다. `{"username":"admin","password":"secret123"}`이라는 시크릿에서 `prod/db:password`는 `secret123`만 추출한다.

CodeBuild Service Role에는 두 가지 권한이 필요하다:
1. `secretsmanager:GetSecretValue` — 시크릿 값 조회
2. `kms:Decrypt` — CMK(Customer Managed Key)로 암호화된 시크릿 복호화

CMK를 쓰지 않고 AWS 관리형 키(`aws/secretsmanager`)를 쓰면 `kms:Decrypt`가 암묵적으로 허용되지만, 보안 정책상 CMK를 강제하는 조직에서는 이 권한 누락이 가장 흔한 실패 원인이다.

> 🔍 **더 깊이**: AWS Secrets Manager의 환경 변수 주입은 빌드 시작 시점에 단 1회 일어난다. 빌드가 30분 돌아가는 동안 시크릿이 회전되어도 이미 메모리에 올라간 값은 바뀌지 않는다. 단, 빌드 중에 코드가 SDK로 `GetSecretValue`를 다시 호출하면 새 값을 받는다. 시크릿 회전 주기와 빌드 주기가 겹치는 환경에서는 이 차이가 중요하다.

> 📚 **사례**: 2019년 Capital One 데이터 유출 사고는 EC2 메타데이터 서비스를 통한 자격 증명 탈취가 원인이었다. 이 사고 이후 AWS는 IMDSv2를 의무화하고, Secrets Manager를 "코드에 자격 증명을 절대 두지 않는" 표준으로 더 강하게 밀게 됐다. buildspec의 `env.secrets-manager`는 바로 이 교훈의 실천 도구다 — 개발자가 비밀번호를 직접 buildspec에 쓸 수 없게 만드는 구조적 강제.

## Reports 블록: 테스트 결과를 코드와 함께 관리하기

```yaml
reports:
  pytest_reports:
    files: ['reports/pytest.xml']
    file-format: JUNITXML         # JUNITXML, NUNITXML, CUCUMBERJSON, TESTNGXML, VISUALSTUDIOTRX
  coverage:
    files: ['coverage.xml']
    file-format: COBERTURAXML     # COBERTURAXML, JACOCOXML, CLOVERXML, SIMPLECOV
```

지원 포맷:
- 테스트 결과: JUnitXML, NUnitXML, CucumberJSON, TestNG XML, VisualStudio TRX
- 코드 커버리지: Clover, Cobertura, JaCoCo XML, SimpleCov

Reports 블록이 있으면 CodeBuild 콘솔에서 빌드별 Pass/Fail 시각화가 생기고, 이력 추적이 된다. CI 파이프라인에서 테스트 결과를 "로그에 텍스트로 찍는 것"과 "구조화된 리포트로 추적하는 것"의 차이가 바로 이 블록이다.

> 💡 **관련 이론**: 구조화된 테스트 리포트는 **소프트웨어 공학의 테스트 가시성(Test Visibility)** 원칙을 구현한다. Jez Humble의 "Continuous Delivery"(2010)는 "테스트 결과는 모든 팀원이 즉시 볼 수 있어야 한다"고 강조한다. 텍스트 로그는 사람이 파싱해야 하지만, JUnit XML은 도구가 자동으로 집계한다. DORA 4 metrics의 "Change Failure Rate" 측정도 이런 구조화 데이터가 있어야 자동화된다.

## Artifacts 블록: 빌드 산출물의 흐름

```yaml
artifacts:
  files:
    - 'dist/**/*'
    - appspec.yml
    - taskdef.json
  name: build-$(date +%Y%m%d-%H%M%S)   # S3 오브젝트 키 커스텀
  base-directory: build                  # 이 디렉토리 기준으로 상대 경로
  discard-paths: no                      # yes면 디렉토리 구조 무시
  secondary-artifacts:
    sourcemap:
      files: '**/*.map'
      base-directory: build/source-maps
    sbom:
      files: 'sbom.json'
```

Primary artifact는 CodePipeline의 다음 Stage로 흐른다 (`InputArtifact`). Secondary artifact는 별도 S3 위치에 저장되며, 분석·감사·문서화 용도로 쓰인다.

SBOM(Software Bill of Materials)을 Secondary artifact로 내보내는 패턴이 최근 SLSA(Supply chain Levels for Software Artifacts) 컴플라이언스 때문에 중요해지고 있다. 2021년 미국 행정명령(EO 14028)에서 연방정부 조달 소프트웨어에 SBOM을 요구한 이후, 많은 기업이 빌드에서 SBOM을 자동 생성하는 것을 표준으로 채택하기 시작했다.

> 💡 **관련 이론**: SLSA(Supply chain Levels for Software Artifacts) 프레임워크는 구글이 2021년 제안한 소프트웨어 공급망 보안 모델이다. Level 1은 "빌드 스크립트가 존재하고 버전 관리됨", Level 2는 "빌드가 재현 가능하고 서명됨", Level 3는 "빌드 환경이 격리됨", Level 4는 "완전 재현 가능하고 감사 가능"이다. CodeBuild는 기본적으로 SLSA Level 2를 만족한다 — 격리된 컨테이너에서 실행되고, 빌드 로그가 CloudWatch에 보존되며, buildspec이 Git에 있다.

## CODEBUILD_* 내장 환경 변수: 빌드 컨텍스트 접근

| 변수 | 의미 | 활용 |
|------|------|------|
| `CODEBUILD_BUILD_ID` | "project:uuid" 형식 | 빌드 추적 ID |
| `CODEBUILD_BUILD_NUMBER` | 1부터 증가하는 정수 | 이미지 태그 |
| `CODEBUILD_BUILD_ARN` | 빌드 ARN | 감사 로그 |
| `CODEBUILD_SOURCE_VERSION` | git SHA/태그/PR 번호 | 코드 추적 |
| `CODEBUILD_RESOLVED_SOURCE_VERSION` | 실제 해석된 git SHA | 재현성 보장 |
| `CODEBUILD_WEBHOOK_TRIGGER` | "branch/main", "pr/42" 등 | 조건부 빌드 |
| `CODEBUILD_INITIATOR` | "user/dev" 또는 "codepipeline/..." | 기원 추적 |

```yaml
pre_build:
  commands:
    - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
    # git SHA 첫 8자리를 이미지 태그로 — 재현성과 추적성 동시 확보
```

`CODEBUILD_SOURCE_VERSION`과 `CODEBUILD_RESOLVED_SOURCE_VERSION`의 차이: 전자는 "main" 같은 브랜치 이름일 수 있고, 후자는 항상 실제 commit SHA다. 이미지 태그나 아티팩트 이름에는 Resolved 버전을 쓰는 것이 재현성 면에서 낫다.

## Build Batch: 한 빌드를 여러 차원으로 확장하기

빌드를 병렬로, 또는 의존 그래프로 실행하는 것이 Build Batch다.

```yaml
batch:
  fast-fail: true          # 하나 실패하면 나머지도 중단
  build-list:              # 단순 병렬 (의존 없음)
    - identifier: build_arm
      env:
        compute-type: BUILD_GENERAL1_LARGE
        type: ARM_CONTAINER
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
    - identifier: build_x86
      env:
        type: LINUX_CONTAINER
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
  build-graph:             # 의존 DAG (순서 있음)
    - identifier: lint
    - identifier: unit_test
    - identifier: integration_test
      depend-on: [unit_test]
    - identifier: package
      depend-on: [lint, integration_test]
  build-matrix:            # 변수 조합 자동 생성
    static:
      ignore-failure: false
    dynamic:
      buildspec:
        - build/node18.yml
        - build/node20.yml
      env:
        variables:
          ARCH: [amd64, arm64]
```

`build-list`는 단순 병렬, `build-graph`는 DAG(Directed Acyclic Graph)로 의존 관계를 정의하며, `build-matrix`는 변수 조합의 카르테시안 곱으로 빌드를 자동 생성한다.

> 🔍 **더 깊이**: Build Batch의 의존 그래프는 컴파일러 이론의 **위상 정렬(Topological Sort)** 위에 구현된다. 각 빌드 노드가 의존 노드의 완료를 기다리는 방식은 GNU Make의 의존 관계 처리와 동일한 알고리즘이다. 차이는 CodeBuild가 각 노드를 별도 컨테이너로 실행한다는 것 — 노드 간 공유 파일시스템이 없다. 그래서 노드 간 아티팩트 전달은 S3를 경유해야 하고, 이것이 S3 캐시가 Batch 빌드에서 특히 중요한 이유다.

> 📚 **사례**: Netflix는 2022년 기준 하루 수천 건의 빌드를 실행한다. 멀티 아키텍처 이미지(ARM/x86)를 표준화하면서 Build Batch 패턴을 적극 도입했다. Netflix의 "Metaflow" ML 플랫폼 팀이 공개한 블로그(2023)에 따르면, ARM 빌드 도입 이후 빌드 비용이 약 18% 절감됐고, ARM 기반 EKS 노드에서 추론 성능이 올라갔다. 빌드와 런타임 아키텍처의 일치가 성능 측정의 정확도를 높인다는 교훈이었다.

## Debug Session과 Local Build: 빌드 실패를 파헤치는 두 가지 방법

**Debug Session (원격):**
```bash
# Debug 모드로 빌드 시작
aws codebuild start-build \
  --project-name myproj \
  --debug-session-enabled

# 빌드 컨테이너에 SSM Session Manager로 접속
aws ssm start-session --target codebuild:<build-id>
```
빌드가 실패한 페이즈에서 잠시 멈추고 컨테이너에 접속할 수 있다. 최대 7시간.

**Local Build (로컬):**
```bash
# CodeBuild Agent로 동일 환경 로컬 실행
./codebuild_build.sh \
  -i aws/codebuild/standard:7.0 \
  -a /tmp/artifacts \
  -e .env.local
```
GitHub Actions의 `act` 도구와 같은 발상 — 로컬에서 동일 환경을 재현해 CI 실패를 디버깅한다.

> 🎯 **시나리오**: 팀의 빌드가 "CodeBuild에서만" 실패하고 로컬에서는 성공한다. 원인 파악 순서는 (1) CloudWatch Logs에서 실패 페이즈 확인 → (2) Debug Session으로 컨테이너에 접속해 동일 명령 수동 실행 → (3) 환경 변수 차이 확인(`env | sort`) → (4) 로컬 Local Build로 buildspec.yml 재현. 이 순서가 표준 트러블슈팅 플로우다.

## GCP Cloud Build와의 비교: 설계 철학의 차이

| 항목 | AWS CodeBuild | GCP Cloud Build |
|------|--------------|-----------------|
| 설정 파일 | buildspec.yml | cloudbuild.yaml |
| 실행 단위 | Phase (install/build/...) | Step (독립 컨테이너) |
| 캐시 | S3 / Local Docker | GCS / Docker Layer |
| 시크릿 | Secrets Manager / Parameter Store | Secret Manager |
| 병렬 빌드 | Build Batch (graph/list/matrix) | parallelism (step 레벨) |
| ARM 지원 | aarch64 표준 이미지 | arm 머신 타입 |
| VPC 통합 | Native (ENI 생성) | Private Pool |
| 가격 모델 | 분당 과금 (compute type별) | 분당 과금 (machine type별) |

가장 큰 철학적 차이: CodeBuild는 "페이즈"라는 순서 있는 단계를 하나의 컨테이너 안에서 실행한다. Cloud Build는 각 "Step"이 독립 컨테이너다 — 매우 유연하지만 Step 간 파일 공유를 `/workspace` 볼륨으로 해야 한다. CodeBuild의 페이즈 모델은 단순하지만 "Step 간 상태를 볼륨으로 관리해야 한다"는 복잡성이 없다.

> 💡 **관련 이론**: CodeBuild의 페이즈 기반 모델과 Cloud Build의 Step 기반 모델은 소프트웨어 공학의 **절차적(procedural) vs 컴포넌트 기반(component-based)** 아키텍처 차이의 반영이다. 절차적 모델은 이해하기 쉽지만 재사용성이 낮고, 컴포넌트 기반은 재사용성이 높지만 조합 복잡성이 있다. GitHub Actions는 "Action" 단위의 재사용 컴포넌트 생태계로 세 번째 길을 택했다.

## exported-variables: 페이즈를 넘어 Stage로

```yaml
phases:
  build:
    commands:
      - export VERSION=$(cat version.txt)
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
env:
  exported-variables:
    - VERSION
    - IMAGE_TAG
```

CodePipeline V2에서 다음 Stage가 `#{BuildAction.IMAGE_TAG}`로 이 값을 참조한다. 예를 들어 Deploy Stage의 ECS Action에서 이미지 URI를 동적으로 받을 수 있다. V1 파이프라인에서는 지원되지 않는다.

이것이 중요한 이유: 파이프라인 전체가 "빌드 시점에 결정된 불변의 아티팩트 식별자"를 공유할 수 있게 된다. 빌드가 만든 이미지 태그가 테스트 Stage, 승인 Stage, 배포 Stage까지 일관되게 흐른다.

## 풀 buildspec 예시: 실무 수준의 통합

```yaml
version: 0.2

env:
  parameter-store:
    GIT_TOKEN: /myapp/github/pat
  secrets-manager:
    DB_PASS: prod/db:password
    ECR_REGISTRY: prod/ecr:registry
  exported-variables:
    - IMAGE_TAG
    - BUILD_VERSION

phases:
  install:
    runtime-versions:
      nodejs: 20
      docker: 20
    commands:
      - npm install -g pnpm
      - aws codeartifact login --tool npm --repository prod --domain my-org

  pre_build:
    commands:
      - echo "Build $CODEBUILD_BUILD_NUMBER from $CODEBUILD_RESOLVED_SOURCE_VERSION"
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
      - export BUILD_VERSION=$(cat package.json | jq -r '.version')-$IMAGE_TAG
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
      - docker buildx create --use --name builder

  build:
    commands:
      - pnpm install --frozen-lockfile
      - pnpm test --reporter=junit --output-file=reports/junit.xml
      - pnpm build
      - docker buildx build \
          --platform linux/amd64,linux/arm64 \
          --cache-from type=registry,ref=$ECR_REGISTRY/myapp:cache \
          --cache-to type=registry,ref=$ECR_REGISTRY/myapp:cache,mode=max \
          --push \
          -t $ECR_REGISTRY/myapp:$IMAGE_TAG \
          -t $ECR_REGISTRY/myapp:latest .

  post_build:
    commands:
      - aws ecs describe-task-definition --task-definition myapp --query taskDefinition > taskdef.json
      - sed -i "s|<IMAGE>|$ECR_REGISTRY/myapp:$IMAGE_TAG|g" appspec.yml
    finally:
      - docker logout $ECR_REGISTRY
      - echo "Build complete: $BUILD_VERSION"

reports:
  unit:
    files: ['reports/junit.xml']
    file-format: JUNITXML
  coverage:
    files: ['coverage/cobertura.xml']
    file-format: COBERTURAXML

artifacts:
  files:
    - taskdef.json
    - appspec.yml
  secondary-artifacts:
    sbom:
      files: 'sbom.json'
    sourcemap:
      files: '**/*.map'
      base-directory: build

cache:
  paths:
    - /root/.npm/**/*
    - /root/.docker/**/*
```

마무리하며: buildspec.yml은 빌드 절차를 코드로 만든다는 것 이상으로, 팀 전체가 "어떻게 빌드되는가"를 공유하는 단일 문서이기도 하다. CI 환경에서만 재현되는 버그, 비밀번호가 로그에 찍히는 사고, 이미지 태그가 뒤섞이는 혼란 — 이 세 가지가 buildspec의 올바른 설계로 막을 수 있는 가장 흔한 문제들이다. 내일은 이 파이프라인을 빠르게 만드는 캐시 전략으로 들어간다.

---

## 📝 연습 문제

**문제 1.** `build` 페이즈가 실패했을 때 `post_build`의 동작으로 옳은 것은?

A) `post_build`는 실행되지 않는다
B) `post_build`는 실행되지만 빌드 결과는 FAILED로 표시된다
C) `post_build`도 `on-failure: ABORT` 설정을 상속해 중단된다
D) AWS Support에 알림이 간다

**정답: B**
해설: `build` 페이즈 실패 후에도 `post_build`는 실행된다. 이것이 정리 코드(Docker 로그아웃, 임시 파일 삭제, 알림 발송)를 `post_build`에 두는 이유다. 단, 빌드 결과는 FAILED로 남는다. `install`이나 `pre_build`가 실패하면 이후 페이즈가 전혀 실행되지 않는 것과 다르다.

---

**문제 2.** buildspec에서 `env.secrets-manager`로 시크릿을 참조했는데 빌드가 "AccessDenied: decryption"으로 실패한다. 가장 가능성 높은 원인은?

A) Secrets Manager 서비스 한도 초과
B) CodeBuild Service Role에 `kms:Decrypt` 권한 누락 (CMK로 암호화된 시크릿)
C) buildspec 버전이 0.1이라서
D) 시크릿 이름에 슬래시가 있어서

**정답: B**
해설: Secrets Manager 시크릿이 Customer Managed Key(CMK)로 암호화된 경우, `secretsmanager:GetSecretValue`만으로는 부족하다. 복호화를 위해 `kms:Decrypt` 권한이 Service Role에 있어야 한다. AWS 관리형 키(`aws/secretsmanager`)는 암묵적 허용이지만, CMK는 명시적 권한이 필요하다. 가장 흔한 실수이며 시험 단골 문제다.

---

**문제 3.** Build Batch의 `build-graph`와 `build-list`의 차이를 가장 정확하게 설명한 것은?

A) `build-graph`는 병렬, `build-list`는 순차 실행
B) `build-list`는 단순 병렬 (의존 관계 없음), `build-graph`는 `depend-on`으로 의존 DAG 정의
C) 동일하다, 별칭이다
D) `build-graph`는 Lambda 전용이다

**정답: B**
해설: `build-list`는 모든 빌드가 동시에 시작되는 단순 병렬이다. `build-graph`는 `depend-on` 필드로 선행 빌드가 완료되어야 시작하는 의존 관계를 정의한다. 예를 들어 `package` 빌드가 `lint`와 `unit_test` 완료를 기다리는 패턴이 `build-graph`다. 위상 정렬(topological sort) 알고리즘으로 실행 순서를 결정한다.

---

**문제 4.** ARM(Graviton)과 x86 이미지를 하나의 buildspec에서 동시에 만들려면?

A) buildspec에 두 개의 `build` 페이즈를 정의한다
B) `batch.build-list`에 ARM_CONTAINER와 LINUX_CONTAINER 두 항목을 정의하고, 각각 빌드 후 `docker manifest`로 묶는다
C) QEMU emulation으로 단일 컨테이너에서 양쪽 빌드
D) Lambda를 트리거로 두 번 연속 실행

**정답: B**
해설: Build Batch의 `build-list`로 두 아키텍처를 병렬 빌드하고, 각각 ECR에 push한 뒤 `docker manifest create`로 multi-arch manifest를 만드는 것이 표준 패턴이다. QEMU는 emulation이라 느리고, 하나의 buildspec 내 두 build 페이즈는 지원되지 않는다. `docker buildx build --platform linux/amd64,linux/arm64`로 단일 명령으로 처리하는 것도 가능하지만 Build Batch가 더 빠르다.

---

**문제 5.** CodePipeline V2에서 빌드 단계의 `IMAGE_TAG` 변수를 배포 단계에서 사용하려면?

A) S3 아티팩트에 파일로 저장하고 배포 단계에서 파일을 읽는다
B) `env.exported-variables`에 `IMAGE_TAG`를 선언하고, 배포 Stage에서 `#{BuildAction.IMAGE_TAG}`로 참조한다
C) CloudWatch에 메트릭으로 전송한다
D) Lambda 함수가 DynamoDB에 저장한다

**정답: B**
해설: CodePipeline V2의 변수 시스템은 `exported-variables`로 선언된 환경 변수를 다음 Stage/Action에서 `#{ActionName.VariableName}` 형식으로 참조할 수 있게 한다. 이를 통해 빌드에서 결정된 이미지 태그가 ECS 배포 Action까지 흐를 수 있다. V1 파이프라인에서는 지원되지 않는다.

---

**문제 6.** SLSA(Supply chain Levels for Software Artifacts) 관점에서 buildspec.yml을 Git 저장소에 두는 것이 제공하는 보안 이점은?

A) 빌드 속도가 빨라진다
B) 빌드 절차가 버전 관리되어 감사 가능하고, PR 리뷰를 통해 악의적 수정을 차단할 수 있다
C) Docker 이미지가 자동 서명된다
D) IAM 권한이 자동 최소화된다

**정답: B**
해설: SLSA Level 2의 핵심 요건 중 하나는 "빌드 정의가 버전 관리 시스템에 있어야 한다"는 것이다. buildspec.yml이 Git에 있으면 변경 이력이 보존되고, PR 리뷰 프로세스를 통해 빌드 명세의 무단 수정을 막을 수 있다. "SolarWinds 공급망 공격"(2020) 이후 빌드 절차 자체의 무결성이 보안의 중요한 축이 됐다.

---

**문제 7.** CodeBuild 빌드가 "컨테이너 안에서만" 재현되는 오류를 디버깅하는 가장 직접적인 방법은?

A) CloudWatch Logs에서 에러 메시지를 검색한다
B) `--debug-session-enabled` 옵션으로 빌드를 시작하고 SSM Session Manager로 컨테이너에 접속한다
C) 빌드 프로젝트를 삭제하고 재생성한다
D) IAM Role을 AdministratorAccess로 바꾼다

**정답: B**
해설: Debug Session은 빌드 컨테이너가 특정 페이즈에서 멈추고 7시간 동안 SSM Session Manager로 접속할 수 있게 한다. 컨테이너 내부에서 직접 명령을 실행하고 환경 변수, 파일 시스템 상태, 네트워크 연결을 확인할 수 있다. 로컬 Local Build는 개발자 머신에서 동일 buildspec을 실행하는 방법으로, 두 가지 모두 표준 디버깅 도구다.

---
