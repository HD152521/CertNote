# Day 1 - buildspec.yml 구조와 페이즈

📅 날짜: Week 3 (Day 1)
🎯 주제: CodeBuild의 빌드 정의 파일을 깊이 이해하기
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- buildspec.yml의 5개 페이즈(install/pre_build/build/post_build/reports)와 실행 순서를 정확히 안다
- 환경 변수, 시크릿, 파라미터의 주입 방식을 구분한다
- artifacts 블록과 secondary artifacts 활용
- 실패 시 동작(`on-failure`, exit code)을 제어한다

---

## 🧩 사전 지식 (CS 기초)

- **Shell exit code**: 0 = 성공, 그 외 = 실패. CI에서 다음 단계 진행 여부 결정.
- **Idempotent build**: 같은 입력 → 같은 출력. 캐시·재현성의 기본.
- **Multi-stage build**: Docker 멀티스테이지. 빌드 환경과 런타임 분리.
- **Artifact**: 빌드 산출물. Primary + Secondary로 여러 개 가능.
- **Cache restore/save**: 캐시는 빌드 시작 시 restore, 끝나면 save.

---

## 📖 이론 내용

### 1. buildspec.yml 전체 구조

```yaml
version: 0.2  # 반드시 0.2 (0.1은 deprecated)

env:
  variables:
    NODE_ENV: production
  parameter-store:
    DB_HOST: /myapp/prod/db-host
  secrets-manager:
    DB_PASS: prod/db:password
  exported-variables:
    - BUILD_ID
    - GIT_COMMIT

phases:
  install:
    runtime-versions:
      nodejs: 20
      python: 3.11
    commands:
      - npm ci
  pre_build:
    commands:
      - aws ecr get-login-password ...
  build:
    commands:
      - docker build -t myapp:$CODEBUILD_BUILD_NUMBER .
  post_build:
    commands:
      - docker push ...
    on-failure: ABORT  # or CONTINUE

reports:
  unit-tests:
    files:
      - 'reports/junit-*.xml'
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

### 2. 페이즈 실행 순서와 실패 처리

| 페이즈 | 실패 시 기본 동작 | 변경 가능? |
|--------|-------------------|------------|
| install | ABORT (이후 페이즈 안 함) | `on-failure: CONTINUE` 가능 |
| pre_build | ABORT | 동일 |
| build | post_build는 실행 (정리용) | 동일 |
| post_build | 빌드 결과 영향 | 동일 |
| reports/artifacts | 자체 단계 | - |
| finally (각 페이즈 내) | 항상 실행 | - |

> 💡 **`finally` 활용**: 페이즈 안의 `commands` 다음에 `finally: [cmd]`를 두면 성공/실패와 무관하게 실행. 자원 정리·로그 업로드에 유용.

### 3. 환경 변수 주입 3가지

| 방식 | 사용처 | 보안 |
|------|--------|------|
| `env.variables` | 일반 값 | 평문 노출 OK |
| `env.parameter-store` | SSM Parameter | 자동 fetch, IAM 권한 필요 |
| `env.secrets-manager` | Secrets Manager | 자동 fetch, IAM 권한 필요 |

```yaml
env:
  parameter-store:
    DB_HOST: /myapp/prod/db-host
  secrets-manager:
    DB_PASS: prod/db-secret:password::AWSCURRENT
    #             ^secret-id ^json-key ^version-stage
```

CodeBuild Service Role에 SSM `GetParameter` 또는 Secrets Manager `GetSecretValue` 권한 필수.

### 4. Reports — 테스트 결과 자동 시각화

- 지원 형식: JUnitXML, NUnitXML, CucumberJSON, TestNGXML, VisualStudioTRX
- 코드 커버리지: Clover, Cobertura, JaCoCoXML, SimpleCov
- 빌드 콘솔에서 Pass/Fail 시각화
- `aws codebuild batch-get-report-groups` API로 외부 시스템 연동

```yaml
reports:
  pytest_reports:
    files:
      - 'reports/pytest.xml'
    file-format: JUNITXML
  coverage:
    files:
      - 'coverage.xml'
    file-format: COBERTURAXML
```

### 5. Artifacts — Primary + Secondary

```yaml
artifacts:
  files:
    - 'dist/**/*'
  name: build-$(date +%Y%m%d-%H%M%S)
  base-directory: build
  discard-paths: no
  secondary-artifacts:
    sourcemap:
      files: '**/*.map'
      base-directory: build/source-maps
    sbom:
      files: 'sbom.json'
```

- Primary는 CodePipeline의 InputArtifact로 흐름
- Secondary는 별도 S3 위치에 업로드
- CodePipeline V2에서 모두 사용 가능

### 6. CODEBUILD_* 내장 환경 변수

| 변수 | 의미 |
|------|------|
| `CODEBUILD_BUILD_ID` | "project:uuid" 형식 |
| `CODEBUILD_BUILD_NUMBER` | 1부터 증가하는 정수 |
| `CODEBUILD_BUILD_ARN` | 빌드 ARN |
| `CODEBUILD_SOURCE_VERSION` | git SHA/태그/PR 번호 |
| `CODEBUILD_RESOLVED_SOURCE_VERSION` | 해석된 git SHA |
| `CODEBUILD_WEBHOOK_TRIGGER` | "branch/main" 등 |
| `CODEBUILD_INITIATOR` | "user/dev" 또는 "codepipeline/..." |

---

## 🧠 알아두면 좋은 심화 이론

### Build Batch — 한 빌드를 여러 환경에서 병렬 실행

```yaml
batch:
  fast-fail: true
  build-list:
    - identifier: build_arm
      env:
        compute-type: BUILD_GENERAL1_LARGE
        type: ARM_CONTAINER
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
    - identifier: build_x86
      env:
        type: LINUX_CONTAINER
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
  build-graph:
    - identifier: build1
    - identifier: test1
      depend-on: [build1]
```

- `build-list`: 병렬 실행
- `build-graph`: 의존 그래프
- `build-matrix`: 매트릭스 빌드 (변수 조합)

### Local Build (CodeBuild Agent)

- Docker로 동일 환경 로컬 실행
- 디버깅에 유용 (`codebuild_build.sh -i aws/codebuild/standard:7.0 -a /tmp/artifacts`)

### Session Manager로 빌드 컨테이너 접속

```bash
# debugSession=true로 빌드 시작
aws codebuild start-build --project-name myproj --debug-session-enabled

# SSM Session Manager로 접속
aws ssm start-session --target codebuild:<arn>
```

빌드 실패 디버깅에 매우 유용. 7시간 한도.

### exported-variables — 다음 Stage로 변수 전달

```yaml
phases:
  build:
    commands:
      - export VERSION=$(cat version.txt)
env:
  exported-variables:
    - VERSION
```

CodePipeline V2의 변수 시스템에서 `#{BuildAction.VERSION}`으로 참조 가능.

### 관련 서비스 Cross-Reference

- **Pipeline 변수** → Week 5 Day 4
- **Cache** → Week 3 Day 2
- **Secrets Manager** → Week 3 Day 3
- **VPC CodeBuild** → Week 3 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
buildspec.yml 실행 흐름
==================================================

  Start Build
       |
       v
  [Provision Container]
   (이미지 pull, 환경 변수 주입)
       |
       v
  [Restore Cache]   <-- cache.paths
       |
       v
  +---------+    +---------+    +---------+    +---------+
  | install |--->|pre_build|--->|  build  |--->|post_buil|
  |         |    |         |    |         |    |   d     |
  +---------+    +---------+    +---------+    +---------+
   on-failure?   on-failure?   on-failure?    on-failure?
                                                     |
                                                     v
                                              +-----------+
                                              |  reports  |
                                              +-----------+
                                                     |
                                                     v
                                              +-----------+
                                              | artifacts |
                                              +-----------+
                                                     |
                                                     v
                                              [Save Cache]
                                                     |
                                                     v
                                                  Complete

If build fails:
  - post_build still runs (cleanup)
  - artifacts may not be exported
  - reports always tried
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ buildspec `version: 0.2` 필수 (0.1은 이름이 달랐음)
2. ⭐ `env.parameter-store`·`env.secrets-manager`로 시크릿 자동 주입, 평문 X
3. ⭐ build 페이즈 실패해도 post_build는 실행 — 정리 코드를 거기 두기
4. ⭐ Reports 블록으로 JUnit/JaCoCo 결과를 콘솔에 시각화
5. ⭐ Build Batch + Matrix로 멀티 아키텍처/언어 버전 병렬 빌드

---

## 💻 실제 예시 - 풀 멀티 환경 buildspec

```yaml
version: 0.2

env:
  parameter-store:
    GIT_TOKEN: /myapp/github/pat
  secrets-manager:
    DB_PASS: prod/db:password
  exported-variables:
    - IMAGE_TAG

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
      - echo "Build $CODEBUILD_BUILD_NUMBER"
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY

  build:
    commands:
      - pnpm install --frozen-lockfile
      - pnpm test --reporter=junit --output-file=reports/junit.xml
      - pnpm build
      - docker build -t $ECR_REGISTRY/myapp:$IMAGE_TAG .

  post_build:
    commands:
      - docker push $ECR_REGISTRY/myapp:$IMAGE_TAG
      - aws ecs describe-task-definition --task-definition myapp \
          --query taskDefinition > taskdef.json
    finally:
      - echo "Logout"
      - docker logout $ECR_REGISTRY

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

cache:
  paths:
    - /root/.npm/**/*
    - /root/.docker/**/*
```

---

## 📝 연습 문제

**문제 1.** build 페이즈가 실패하면 post_build는 어떻게 되는가?

A) 즉시 중단되어 실행되지 않음
B) post_build는 실행됨 (정리·로그 업로드용)
C) 사용자에게 확인 후 실행
D) 다음 빌드에서만 실행

**정답: B**
해설: build 실패 후에도 post_build는 실행 — 자원 정리 코드를 여기 두는 패턴이 표준.

---

**문제 2.** 빌드에 DB 비밀번호가 필요하다. 가장 안전하고 표준적인 방법은?

A) `env.variables`에 평문
B) `env.secrets-manager`로 Secrets Manager 시크릿 참조
C) Source Repository에 .env 파일
D) Build Container 이미지에 굽기

**정답: B**
해설: Secrets Manager 통합 + IAM Role 권한이 표준.

---

**문제 3.** ARM(Graviton)과 x86 양쪽 이미지를 한 빌드에서 동시 생성하려면?

A) 빌드를 두 번 수동 실행
B) `batch.build-list`로 두 아키텍처 병렬 빌드 후 manifest로 묶기
C) 멀티스테이지 Dockerfile만 사용
D) Lambda로 호출

**정답: B**
해설: Build Batch가 매트릭스/병렬 빌드의 표준. manifest는 docker buildx로 묶음.

---

**문제 4.** JUnit 테스트 결과를 빌드 콘솔에서 시각적으로 보려면?

A) reports 블록에 `file-format: JUNITXML` 지정
B) S3에 수동 업로드
C) CloudWatch Logs에 텍스트로 출력
D) Secondary artifacts

**정답: A**
해설: reports 블록이 콘솔 시각화 + 이력 추적의 핵심.

---

**문제 5.** 빌드 중 컨테이너에 SSH로 들어가 디버깅하려면?

A) EC2 Bastion 사용
B) CodeBuild debugSession=true + SSM Session Manager로 접속
C) 빌드 종료까지 대기 후 새 EC2 생성
D) Lambda로 원격 디버깅

**정답: B**
해설: CodeBuild Debug Session이 표준. 7시간 한도, 디버그용.

---

**문제 6.** `exported-variables`의 용도는?

A) 다음 페이즈로 변수 전달
B) 다음 Pipeline Stage/Action에 변수 전달 (V2)
C) CloudWatch Logs로 전달
D) 다른 빌드 프로젝트로 전달

**정답: B**
해설: V2 파이프라인에서 `#{BuildAction.VAR}`로 다음 Stage가 참조.

---

**문제 7.** `version: 0.1`을 buildspec에 사용하면?

A) 정상 동작
B) 동작은 하나 권장 안 됨 — 0.2와 페이즈/구조가 다름
C) 자동으로 0.2로 변환
D) 빌드 시작 자체가 안 됨

**정답: B**
해설: 0.1은 deprecated. 시험은 0.2 가정.

---

## 📌 오늘의 요약

1. buildspec.yml v0.2 — install/pre_build/build/post_build + reports/artifacts/cache
2. 시크릿은 env.parameter-store / env.secrets-manager로 자동 주입
3. build 실패해도 post_build 실행 — 정리 코드 위치
4. Reports 블록으로 테스트/커버리지 자동 시각화
5. Build Batch로 멀티 아키텍처/매트릭스 병렬 빌드
