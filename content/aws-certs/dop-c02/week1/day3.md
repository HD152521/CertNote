# Day 3 - AWS DevOps 도구 지도 - Code* 시리즈 개관

📅 날짜: Week 1 (Day 3)
🎯 주제: CodeCommit/Artifact/Build/Deploy/Pipeline + Star 전체 그림과 선택 기준
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 5개 Code* 서비스의 역할과 경계를 구분할 수 있다
- 각 서비스가 다른 AWS/3rd-party 도구로 대체될 수 있는 지점을 안다
- CodeStar/CodeGuru/Cloud9 같은 주변 도구의 시험 함정을 식별한다
- 실무에서 GitHub + AWS 조합과 순수 AWS 조합의 트레이드오프를 비교한다

---

## 🧩 사전 지식 (CS 기초)

- **VCS(Version Control System)**: Git/Mercurial. 분산형(Git)이 대세.
- **Artifact**: 빌드 결과물(jar, zip, 컨테이너 이미지 등).
- **Pipeline orchestrator vs runner**: 오케스트레이터는 단계를 정의, 러너는 실제 실행. CodePipeline = 오케스트레이터, CodeBuild = 러너.
- **Webhook vs Polling**: 변경 감지의 두 방식. Webhook이 즉각적이고 비용 효율적.
- **Push-based vs Pull-based deployment**: CodeDeploy(Push) vs ArgoCD(Pull, GitOps).
- **Mutable vs Immutable**: SSM Run Command로 인플레이스 업데이트(Mutable) vs AMI 교체(Immutable).

---

## 📖 이론 내용

### 1. 5개 Code* 서비스 한눈에 보기

| 서비스 | 역할 | 대체재 |
|--------|------|--------|
| **CodeCommit** | 관리형 Git | GitHub, GitLab, Bitbucket |
| **CodeArtifact** | 패키지 저장소 (npm/Maven/PyPI/NuGet) | Nexus, Artifactory, GitHub Packages |
| **CodeBuild** | 관리형 빌드 러너 | Jenkins, GitHub Actions, GitLab Runner |
| **CodeDeploy** | 배포 오케스트레이션 | Spinnaker, ArgoCD, Octopus |
| **CodePipeline** | CI/CD 오케스트레이터 | Jenkins, GitHub Actions, GitLab CI |

> ⚠️ **함정**: CodePipeline은 빌드 자체를 안 함 — 빌드는 항상 CodeBuild(또는 외부 빌더)에 위임. 시험에서 "CodePipeline이 빌드를 수행"이라는 보기는 함정.

### 2. CodeCommit (Source) 핵심

- 관리형 Git 저장소
- IAM/Identity Center로 접근 제어 (HTTPS Git 자격 증명 or SSH 키)
- **트리거**: CloudWatch Events(EventBridge), SNS로 푸시·PR 이벤트 알림
- 크로스 계정 지원 (Resource Policy)
- **AWS의 Sunset 경고**: 2024년 7월 이후 신규 고객은 사용 불가. **기존 고객만 유지**. 시험에는 여전히 출제되지만 실무 권장도는 낮음.

### 3. CodeArtifact

- npm/Maven/PyPI/NuGet/Cargo/Generic 지원
- **Upstream 저장소**: 공용 레지스트리(npmjs.com, Maven Central) 캐시·프록시
- **Domain & Repository**: Domain은 여러 Repo의 부모. Domain 수준에서 KMS 키 적용
- 외부 빌드(GitHub Actions, Jenkins)도 사용 가능

### 4. CodeBuild

- 관리형 빌드 환경 (Docker 컨테이너)
- **buildspec.yml**: install / pre_build / build / post_build / reports / artifacts
- 환경: Amazon Linux 2, Ubuntu, Windows Server, custom image
- VPC 안에서 빌드 가능 (프라이빗 리소스 접근 시 필수)
- **Compute types**: BUILD_GENERAL1_SMALL/MEDIUM/LARGE/2XLARGE, ARM Graviton 지원

### 5. CodeDeploy

- 3가지 배포 대상: **EC2/On-Prem, Lambda, ECS**
- 배포 구성: In-place / Blue-Green / All-At-Once / Canary / Linear
- **AppSpec.yml** (또는 .json): hooks로 배포 단계마다 스크립트/Lambda 실행
- 자동 롤백: 알람 트리거, 실패 시, 배포 그룹 설정

### 6. CodePipeline

- Stage → Action → Artifact 구조
- Action 타입: Source / Build / Test / Deploy / Approval / Invoke (Lambda) / Step Functions
- **V2 Pipeline**: 변수, 트리거 필터, 매개변수화 지원 (2023+)
- 크로스 계정/리전 배포 지원

### 7. 주변 도구 — 시험 함정 주의

| 도구 | 역할 | 함정 포인트 |
|------|------|--------------|
| **AWS CodeStar** | 통합 프로젝트 템플릿 | 2024년 7월 신규 가입 중단. 시험에는 가끔 등장 |
| **AWS Cloud9** | 클라우드 IDE | 2024년 7월 신규 가입 중단 |
| **CodeGuru Reviewer** | 코드 리뷰 자동화 (보안/성능) | CodeBuild 단계에 통합 가능 |
| **CodeGuru Profiler** | 런타임 프로파일링 | 운영 단계, 빌드 아님 |
| **CodeGuru Security** | 보안 취약점 탐지 | Reviewer가 흡수 통합 |
| **CodeWhisperer** → **Amazon Q Developer** | AI 코드 어시스턴트 | 시험 범위 아님 |

> 💡 시험은 deprecate된 서비스도 일정 기간 출제됩니다. CodeStar/Cloud9도 "기존 사용자"용으로 정답이 될 수 있음.

---

## 🧠 알아두면 좋은 심화 이론

### 선택 기준 — AWS 순정 vs GitHub Actions

| 기준 | AWS Code* | GitHub Actions + AWS OIDC |
|------|-----------|---------------------------|
| 멀티 클라우드 지원 | 약함 | 강함 |
| AWS 서비스 통합 깊이 | 깊음 (네이티브) | 충분 (OIDC + AWS SDK) |
| 비용 | 사용량 비례 | 무료 분량 + 분당 과금 |
| 자체 관리 부담 | 낮음 (관리형) | 낮음 (호스팅 러너) |
| 시크릿 관리 | Secrets Manager 네이티브 | OIDC로 단기 자격 증명 권장 |
| 정책 강제 | CFN/Config로 강제 가능 | 외부 정책 필요 |

> 시험에서 "기존 GitHub 사용자, AWS에 배포만 하고 싶다" → 보통 **GitHub Actions + OIDC**가 정답. CodeCommit 강제 이전은 함정.

### Pull vs Push 배포

| 모델 | 예 | 장점 | 단점 |
|------|-----|------|------|
| Push | CodeDeploy | 단순, 즉각 | 클러스터 자격 증명 필요 |
| Pull (GitOps) | ArgoCD, Flux | 보안(클러스터가 외부에 자격 노출 안 함), 감사 | 도구 도입 비용 |

EKS 환경에서 GitOps는 시험에 자주 나옵니다.

### Star Schema — 통합 CI/CD 아키텍처

```
                +-----------------+
                |   Developer     |
                | (push/PR)       |
                +--------+--------+
                         |
              +----------+----------+
              | CodeCommit/GitHub   |
              +----------+----------+
                         |
                    EventBridge
                         |
              +----------+----------+
              |   CodePipeline      |
              | (Orchestrator)      |
              +----------+----------+
                /        |         \
               v         v          v
       CodeBuild    CodeBuild    Lambda
       (Test)       (Build)      (Notify)
                         |
                         v
                  CodeArtifact
                  ECR
                  S3 (Artifacts)
                         |
                         v
              +----------+----------+
              |   CodeDeploy        |
              | (EC2/Lambda/ECS)    |
              +----------+----------+
                         |
                         v
                    Production
                         |
                         v
                   CloudWatch +
                   X-Ray (Observe)
                         |
                         v
                EventBridge → Lambda
                (Auto-rollback if SLO violated)
```

### 관련 서비스 Cross-Reference

- **CodeCommit/GitHub** → Week 2 전체
- **CodeBuild** → Week 3 전체
- **CodeDeploy** → Week 4 전체
- **CodePipeline** → Week 5 전체
- **CodeArtifact** → Week 2 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
Code* 서비스 책임 분담
==================================================

  [Source]      [Package]      [Build]     [Deploy]   [Orchestrate]
  +--------+    +----------+   +--------+  +--------+ +-------------+
  |Code    |    |Code      |   |Code    |  |Code    | |Code         |
  |Commit  |--->|Artifact  |-->|Build   |->|Deploy  |  |Pipeline    |
  |        |    |          |   |        |  |        | |(orchestrator|
  +--------+    +----------+   +--------+  +--------+ +-------------+
   git push      mvn/npm        buildspec   AppSpec     stage/action
                 release        .yml        .yml

  External alternatives:
   GitHub/      Nexus/         Jenkins/    ArgoCD/    GitHub Actions/
   GitLab       Artifactory    CircleCI    Spinnaker  Jenkins
                JFrog
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ CodePipeline은 오케스트레이터, 빌드는 항상 CodeBuild(또는 외부)
2. ⭐ CodeCommit/Cloud9/CodeStar는 신규 가입 중단 — 기존 고객 시나리오에만 등장
3. ⭐ CodeArtifact의 Upstream 기능으로 npmjs.com 같은 외부 레지스트리 캐시·프록시 가능
4. ⭐ CodeDeploy는 EC2/On-Prem/Lambda/ECS 모두 지원, AppSpec 구조가 대상별 다름
5. ⭐ GitHub Actions + OIDC는 시험에서 자주 정답으로 나오는 멀티 클라우드 친화 패턴

---

## 💻 실제 예시 - GitHub Actions에서 AWS OIDC로 권한 받기

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS
on:
  push:
    branches: [main]

permissions:
  id-token: write   # OIDC 토큰 발급
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GHActionsDeployRole
          aws-region: ap-northeast-2

      - run: |
          aws s3 sync ./dist s3://my-app-bucket --delete
          aws cloudfront create-invalidation \
            --distribution-id E1ABCDEF12345 \
            --paths "/*"
```

```bash
# AWS 측 IAM Role의 Trust Policy 핵심
aws iam create-role \
  --role-name GHActionsDeployRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main",
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        }
      }
    }]
  }'
```

이 패턴은 **장기 자격 증명을 GitHub Secrets에 저장하지 않음** — Pro 시험의 보안 모범사례.

---

## 📝 연습 문제

**문제 1.** 한 회사가 GitHub에서 모든 코드를 관리 중이고, AWS에 배포한다. 가장 권장되는 통합 방식은?

A) CodeCommit으로 미러링 후 CodePipeline 사용
B) GitHub Actions + AWS OIDC로 단기 자격 증명 + 필요 시 AWS Code* 서비스 호출
C) Jenkins 서버를 EC2에 구축해 모든 빌드/배포 수행
D) GitHub에서 AWS 액세스 키를 Secrets에 저장

**정답: B**
해설: OIDC로 자격 증명 노출 최소화가 정답. D는 보안 위반, A는 불필요한 중복, C는 자체 관리 부담.

---

**문제 2.** CodePipeline에 대한 설명으로 옳지 않은 것은?

A) Stage는 순차 실행, Action은 같은 Stage 내에서 병렬 가능
B) CodePipeline은 직접 컴파일/빌드를 수행한다
C) Lambda Invoke Action으로 사용자 정의 로직 실행 가능
D) 크로스 계정/리전 배포 지원

**정답: B**
해설: CodePipeline은 오케스트레이터 — 빌드는 CodeBuild나 외부 빌더에 위임합니다.

---

**문제 3.** CodeArtifact의 Upstream 기능을 활용해야 하는 시나리오는?

A) 외부 npm 패키지를 캐시해 빌드 안정성/속도/감사를 확보
B) 코드 변경을 자동 트리거
C) ECS 배포 자동화
D) 시크릿 관리

**정답: A**
해설: Upstream은 외부 레지스트리를 프록시·캐시하는 기능. 빌드 시 npmjs.com 직접 호출을 줄이고, 패키지 폐기 사고에 대비합니다.

---

**문제 4.** EC2 인스턴스에 CodeDeploy로 배포하려면 필수가 아닌 것은?

A) CodeDeploy Agent 설치
B) 인스턴스에 적절한 태그
C) IAM Role 부여
D) Elastic IP 할당

**정답: D**
해설: Elastic IP는 배포와 무관. Agent + 태그 + IAM Role + 신뢰관계가 필수.

---

**문제 5.** 한 EKS 운영 팀이 "클러스터 자격 증명을 CI 측에 노출하고 싶지 않다"고 한다. 적절한 답은?

A) CodeDeploy로 Push 배포 + IAM 자격 증명 공유
B) ArgoCD/Flux 기반 GitOps Pull 배포
C) kubectl apply를 CodeBuild에서 직접 수행
D) Helm을 로컬에서 수동 실행

**정답: B**
해설: GitOps는 클러스터가 Git에서 상태를 가져오므로 클러스터→CI 방향의 자격 노출이 없습니다.

---

**문제 6.** "CodePipeline 트리거를 GitHub Push 이벤트로 즉시 시작하고 싶다." 가장 적절한 방법은?

A) CodePipeline의 폴링 옵션 사용
B) GitHub Webhook → CodePipeline (V2 트리거)
C) 매 5분 EventBridge Schedule
D) Lambda를 매 분 호출해 GitHub API 폴링

**정답: B**
해설: Webhook이 즉각적이고 무료. 폴링은 API 한도/지연/비용 모두 손해.

---

**문제 7.** 시험 시나리오: "CodeCommit을 사용 중인 기존 팀이 신규 마이크로서비스를 추가하려 한다. 신규 가입 중단 사실 때문에 어떻게?"

A) 즉시 모든 코드를 GitHub로 강제 이전
B) 기존 CodeCommit은 계속 사용 가능 — 신규 리포지토리 추가도 기존 계정에서 가능
C) CodeCommit은 폐쇄되므로 사용 불가
D) Bitbucket으로만 이전 가능

**정답: B**
해설: AWS 공지(2024.7)는 "신규 고객 가입 중단"이며 기존 고객은 신규 리포지토리 생성 포함 계속 사용 가능. 시험에 이 미묘한 경계를 묻는 문제가 나옵니다.

---

## 📌 오늘의 요약

1. Code* 5종은 Source/Artifact/Build/Deploy/Orchestrate 단계로 분담
2. CodePipeline은 오케스트레이터, 빌드는 CodeBuild가 수행
3. CodeCommit/Cloud9/CodeStar는 신규 가입 중단 — 기존 사용자만 유지
4. GitHub Actions + OIDC가 시험에서 자주 정답으로 나오는 멀티 클라우드 패턴
5. EKS Pull-based GitOps(ArgoCD/Flux) vs Push-based CodeDeploy의 보안 트레이드오프 이해
