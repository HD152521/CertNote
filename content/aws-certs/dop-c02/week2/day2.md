# Day 2 - GitHub Actions ↔ AWS OIDC 통합

📅 날짜: Week 2 (Day 2)
🎯 주제: 단기 자격 증명 페더레이션 + 멀티 환경 배포 자동화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- OIDC(OpenID Connect) 페더레이션의 원리를 이해한다
- GitHub Actions에서 AWS IAM Role을 단기 자격 증명으로 사용하는 패턴을 안다
- Trust Policy의 `sub` 조건으로 브랜치/환경/리포지토리 단위 권한 분리
- GitHub Environments + AWS의 다중 환경 승인 게이트 구성
- AWS Code* 서비스와 GitHub Actions가 공존하는 하이브리드 패턴을 설계한다

---

## 🧩 사전 지식 (CS 기초)

- **OIDC vs SAML**: 둘 다 페더레이션. OIDC는 JSON Web Token 기반, 모던 웹/API 친화. SAML은 XML.
- **JWT (JSON Web Token)**: 3 파트(header.payload.signature) Base64 인코딩. 자체 검증 가능.
- **STS AssumeRoleWithWebIdentity**: OIDC 토큰으로 IAM Role을 가정해 임시 자격 증명 발급.
- **Trust Policy vs Permission Policy**: Trust = 누가 가정 가능한가, Permission = 무엇을 할 수 있는가.
- **OIDC Provider**: IAM에 등록되는 신뢰할 외부 IdP. GitHub Actions는 `token.actions.githubusercontent.com`.
- **`sub` (Subject) Claim**: 누가 토큰을 발행받았는지. GitHub의 경우 `repo:org/repo:ref:refs/heads/main` 형태.

---

## 📖 이론 내용

### 1. 왜 OIDC인가?

기존 방식의 문제:
- GitHub Secrets에 AWS 액세스 키 저장 → 키 노출 위험, 회전 부담
- 로그/스크린샷에 키 누출 가능
- 자격 증명 폐기/회전 어려움

OIDC 방식의 장점:
- **장기 자격 증명 없음** — 매 워크플로 실행마다 GitHub이 짧은 JWT 발행
- AWS STS가 JWT 검증 후 1시간(기본) 자격 증명 발급
- 키 회전 불필요
- 리포지토리/브랜치/PR 단위로 권한 분리 가능

### 2. 구성 순서

1. **AWS IAM에 OIDC Provider 등록**
   - URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
   - Thumbprint: GitHub의 SSL 인증서 thumbprint (AWS가 자동 검증, 직접 입력 불필요해진 경우 있음)

2. **IAM Role 생성 (Trust Policy)**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:environment:production"
      }
    }
  }]
}
```

3. **GitHub Actions 워크플로**

```yaml
name: Deploy
on:
  push:
    branches: [main]

permissions:
  id-token: write   # OIDC JWT 발급
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Environment 보호 적용
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GHActionsProdRole
          aws-region: ap-northeast-2
          role-session-name: github-actions-${{ github.run_id }}
      - run: aws sts get-caller-identity
      - run: aws s3 sync dist s3://my-app-prod
```

### 3. `sub` Claim 패턴 — 권한 분리

GitHub이 발행하는 JWT의 `sub` 필드 예시:

| 시나리오 | sub 값 |
|----------|--------|
| main 브랜치 | `repo:my-org/my-repo:ref:refs/heads/main` |
| feature 브랜치 | `repo:my-org/my-repo:ref:refs/heads/feature/*` |
| Pull Request | `repo:my-org/my-repo:pull_request` |
| Tag 푸시 | `repo:my-org/my-repo:ref:refs/tags/*` |
| Environment | `repo:my-org/my-repo:environment:production` |

> 💡 **베스트 프랙티스**: `environment:production`을 조건으로 사용 + GitHub Environments에서 Required Reviewers 설정 → AWS 측 권한 + GitHub 측 승인 게이트 이중 방어.

### 4. 환경별 IAM Role 분리 패턴

```
GH 워크플로 → environment: production
   ↓ OIDC sub: repo:org/app:environment:production
   ↓ AssumeRole
   GHActionsProdRole (prod 권한)

GH 워크플로 → environment: staging
   ↓ OIDC sub: repo:org/app:environment:staging
   ↓ AssumeRole
   GHActionsStagingRole (staging 권한)
```

각 Role의 Permission Policy는 환경의 리소스 ARN으로 제한.

### 5. AWS Code* 서비스와의 하이브리드 패턴

| 사용 사례 | GitHub Actions | AWS Code* | 트레이드오프 |
|----------|----------------|-----------|--------------|
| 빌드 | GH Actions 무료 분량 활용 | CodeBuild로 분 단위 과금 | GH 분량 초과 시 CodeBuild로 |
| ECS 배포 | aws ecs update-service | CodeDeploy Blue/Green | Blue/Green 트래픽 시프트는 CodeDeploy가 강함 |
| Lambda 배포 | aws lambda update-function-code | CodeDeploy + Canary | Canary는 CodeDeploy가 정공법 |
| CloudFormation | aws cloudformation deploy | CodePipeline CFN Action | 단순 배포는 GH, 멀티 단계는 CodePipeline |
| 멀티 계정 승인 | GH Environments | CodePipeline Manual Approval | 둘 다 사용 가능 |

---

## 🧠 알아두면 좋은 심화 이론

### Self-Hosted Runner vs GitHub-Hosted Runner

- GitHub-Hosted: GitHub 인프라 사용, 무료 분량 + 분당 과금
- Self-Hosted: 자체 EC2/EKS/Fargate, VPC 안에서 실행
- AWS 환경에서 Self-hosted Runner는 **ec2-image-builder + ASG + GitHub Actions Runner Controller**로 자동 확장
- 시험 시나리오: "프라이빗 VPC 리소스에 접근하는 빌드" → Self-hosted Runner 또는 CodeBuild VPC 모드

### Reusable Workflows / Composite Actions

- **Reusable Workflow**: 다른 워크플로를 호출 (`workflow_call`)
- **Composite Action**: 여러 step을 한 액션으로 묶음
- 멀티 리포지토리에 동일 배포 로직 공유에 유용 (CALMS의 Sharing)

### Branch Protection + Required Status Checks

- GitHub에서 main 브랜치 보호
- "AWS CodeBuild PR Build" 같은 외부 체크를 Required로 설정
- CodeBuild가 GitHub 상태 API를 통해 PR에 status를 푸시
- AWS CodeBuild는 GitHub App 인증으로 직접 PR 상태 보고 가능

### OIDC Audience 조건 — 보안 강화

기본 `aud`는 `sts.amazonaws.com`이지만, 다중 클라우드/공유 OIDC Provider 환경에서는 조직별로 분리해야 함:

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ...
    audience: my-org-specific-audience
```

이렇게 하면 Trust Policy의 `aud` 조건도 일치해야 함 → 다른 조직이 토큰을 훔쳐 사용 불가.

### CodeBuild + GitHub 통합

- CodeBuild Source Provider: GitHub / GitHub Enterprise
- Webhook으로 push/PR 트리거
- Webhook Filter Group: 파일 경로/이벤트 타입/브랜치 매칭
- CodeStar Connections로 GitHub App 인증 (PAT 대신)

### 관련 서비스 Cross-Reference

- **CodeStar Connections** → GitHub/Bitbucket 통합 표준
- **GitHub Environments** → Week 5 Day 3 (Manual Approval)
- **Self-hosted Runner** → Week 3 Day 4 (CodeBuild VPC)

---

## 🏗️ 아키텍처 다이어그램

```
GitHub Actions OIDC Flow
==================================================

  +---------------------+
  | GitHub Repo         |
  | (push to main)      |
  +---------+-----------+
            |
            v
  +---------------------+
  | GitHub Actions      |
  | workflow run        |
  |  environment: prod  |
  +---------+-----------+
            |
            | 1) request OIDC token
            v
  +---------------------+
  | token.actions.      |
  | githubusercontent   |
  | .com                |
  +---------+-----------+
            |
            | 2) signed JWT
            |    sub: repo:org/app:env:production
            v
  +---------------------+
  | aws-actions/config- |
  | ure-aws-credentials |
  +---------+-----------+
            |
            | 3) AssumeRoleWithWebIdentity
            v
  +---------------------+
  | AWS STS             |
  | - verifies sig      |
  | - checks aud, sub   |
  | - returns temp creds|
  +---------+-----------+
            |
            | 4) temp credentials (1h)
            v
  +---------------------+
  | aws s3 sync ...     |
  | aws ecs update ...  |
  +---------------------+

GitHub Environments adds:
  - Required Reviewers gate
  - Wait timer
  - Environment-specific secrets
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **OIDC = 장기 자격 증명 제거**. GitHub Secrets에 AWS 키 저장은 안티패턴
2. ⭐ Trust Policy의 `sub` 조건으로 리포지토리/브랜치/환경 단위 권한 분리
3. ⭐ GitHub Environments의 Required Reviewers + AWS 측 IAM 제한 = 이중 방어
4. ⭐ Self-hosted Runner를 VPC에 배치하면 프라이빗 리소스 빌드 가능
5. ⭐ `permissions: id-token: write`를 워크플로에 명시하지 않으면 OIDC 토큰 안 받음 (가장 흔한 실수)

---

## 💻 실제 예시 - 환경별 분리 워크플로

```yaml
name: Multi-env Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      target:
        type: choice
        options: [staging, production]

permissions:
  id-token: write
  contents: read

jobs:
  deploy-staging:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::111:role/GHA-Staging
          aws-region: ap-northeast-2
      - run: ./deploy.sh staging

  deploy-prod:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production   # Required Reviewers + wait
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::222:role/GHA-Production
          aws-region: ap-northeast-2
      - run: ./deploy.sh production
```

Trust Policy 예시 (prod):
```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:sub":
      "repo:my-org/my-app:environment:production"
  }
}
```

---

## 📝 연습 문제

**문제 1.** GitHub Actions에서 AWS에 배포할 때 가장 안전한 자격 증명 관리 방법은?

A) IAM User 액세스 키를 GitHub Secrets에 저장
B) OIDC 페더레이션으로 IAM Role의 단기 자격 증명 사용
C) EC2 Instance Profile을 GitHub에 공유
D) Personal Access Token으로 AWS 호출

**정답: B**
해설: 장기 자격 증명 제거 + 자동 키 회전 불필요 = OIDC.

---

**문제 2.** OIDC Trust Policy에 `sub`을 `repo:my-org/*:ref:refs/heads/main`으로 설정하면 어떤 위험이 있는가?

A) 위험 없음
B) 조직 내 어떤 리포지토리든 main 브랜치라면 권한 가정 가능 — 조직 침해 시 영향 확대
C) PR에서 자격 증명 사용 가능
D) Tag 푸시에서 자격 증명 사용 가능

**정답: B**
해설: 리포지토리를 와일드카드로 두면 조직 내 침해된 리포지토리가 본 권한을 훔쳐 사용 가능. `repo:org/specific-repo:...`로 구체화 필요.

---

**문제 3.** GitHub Actions 워크플로에서 OIDC 토큰을 받지 못한다. 가장 먼저 확인할 것은?

A) IAM Role 이름 오타
B) `permissions: id-token: write` 명시 여부
C) AWS Region 설정
D) GitHub Actions 사용량 한도

**정답: B**
해설: `permissions` 블록의 `id-token: write`가 없으면 워크플로가 OIDC 토큰을 발급받지 못합니다. 가장 흔한 실수.

---

**문제 4.** "프라이빗 RDS에 마이그레이션 스크립트를 실행하는 빌드"가 필요하다. 가장 적절한 구성은?

A) GitHub-hosted Runner에서 RDS 공인 엔드포인트 활성화
B) Self-hosted Runner를 VPC에 배치 또는 CodeBuild VPC 모드 사용
C) Lambda에서 모든 마이그레이션 실행
D) Bastion EC2에 SSH 후 수동 실행

**정답: B**
해설: 프라이빗 리소스 접근 = VPC 내부 빌드 환경. Self-hosted 또는 CodeBuild VPC 모드.

---

**문제 5.** GitHub Environments의 Required Reviewers 기능은 어떤 단계의 보호인가?

A) 코드 머지 단계 (PR)
B) 워크플로 실행 단계 (deploy job 시작 전 승인)
C) AWS IAM 단계
D) CloudFormation Stack 생성 단계

**정답: B**
해설: GitHub Environments는 deploy 직전 단계에 게이트를 둠. PR 머지 보호는 별도(Branch Protection).

---

**문제 6.** AWS 측 IAM Role의 Trust Policy `aud` 조건 기본값과 변경 이유는?

A) 기본 `sts.amazonaws.com`. 변경 이유 없음
B) 기본 `sts.amazonaws.com`. 다중 조직 공유 환경에서 audience 분리로 토큰 도용 방지
C) 기본 `github.com`. 변경 불가
D) 기본 OIDC Provider 자체

**정답: B**
해설: `aud`를 조직별로 분리하면 다른 조직의 GitHub Actions가 우리 Role을 훔쳐 사용 못 함.

---

**문제 7.** GitHub Actions와 AWS CodePipeline 중 어떤 것을 선택할지 결정 기준이 아닌 것은?

A) 멀티 클라우드 필요 여부
B) AWS 네이티브 통합 깊이
C) 비용 모델
D) Lambda Runtime 버전

**정답: D**
해설: Lambda Runtime은 두 도구 선택과 무관. A·B·C는 모두 합리적 결정 기준.

---

## 📌 오늘의 요약

1. OIDC로 GitHub Actions ↔ AWS 단기 자격 증명 페더레이션 — 표준 패턴
2. Trust Policy의 `sub`/`aud` 조건으로 리포지토리/브랜치/환경/조직 단위 권한 제어
3. GitHub Environments의 Required Reviewers + AWS IAM 제한 = 이중 방어
4. `permissions: id-token: write`가 OIDC 동작의 필수 조건
5. Self-hosted Runner 또는 CodeBuild VPC 모드로 프라이빗 리소스 빌드 가능
