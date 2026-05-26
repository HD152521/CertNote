# Day 2 - GitHub Actions ↔ AWS OIDC: 정적 키를 영구히 없애는 페더레이션

CI/CD 시스템에서 AWS 자격 증명을 안전하게 다루는 일은 지난 10년간 거의 모든 DevOps 팀의 만성 두통이었다. IAM User access key를 GitHub Secrets에 박아두는 패턴은 익숙하지만, 그 익숙함이 곧 사고의 근원이다. Snyk가 2022년에 발표한 보고서에 따르면 GitHub 공개 저장소에서 발견된 AWS access key는 한 해 동안 1만 건이 넘었다. Capital One의 2019년 사고도, 2023년 Twitter의 내부 키 유출도, 그 근본 원인은 같다 — **"한 번 발급되어 누가 어디에 복사했는지 모르는 정적 자격 증명"**.

OIDC 페더레이션은 이 문제를 근본적으로 다른 방향에서 해결한다. **자격 증명을 발급하지 않는다.** 대신 GitHub이 매 워크플로 실행마다 자기 정체를 증명하는 단기 JWT를 만들어주고, AWS STS가 그걸 검증해 1시간짜리 임시 자격 증명을 발급한다. 정적 키 자체가 존재하지 않으니 누출될 키도 없다.

오늘은 이 메커니즘이 어떻게 동작하는지, IAM Trust Policy의 어떤 조건이 보안을 결정하는지, GitHub Environments와 어떻게 결합해 이중 방어를 만드는지, 그리고 Self-hosted Runner / CodeBuild와 어떤 trade-off가 있는지를 정리한다.

## OIDC 페더레이션이 동작하는 정확한 순서 — JWT가 STS 자격 증명으로 바뀌는 6단계

GitHub Actions가 AWS API를 호출하는 한 번의 흐름을 슬로우 모션으로 보자.

```
1. GitHub Actions runner가 워크플로 시작
   permissions: id-token: write 가 있어야 함
        |
        v
2. runner가 GitHub OIDC provider에게 토큰 요청
   POST https://token.actions.githubusercontent.com/...
   Body: { audience: "sts.amazonaws.com" }
        |
        v
3. GitHub이 JWT 발급
   header: { alg: "RS256", kid: "..." }
   payload: {
     iss: "https://token.actions.githubusercontent.com",
     aud: "sts.amazonaws.com",
     sub: "repo:my-org/my-app:environment:production",
     ref: "refs/heads/main",
     repository: "my-org/my-app",
     workflow: "Deploy",
     ...
   }
   signature: RSA 서명 (JWKS endpoint로 검증 가능)
        |
        v
4. aws-actions/configure-aws-credentials@v4가 STS 호출
   AssumeRoleWithWebIdentity {
     RoleArn: "arn:aws:iam::ACCOUNT:role/GHActionsProdRole",
     WebIdentityToken: <위 JWT>,
     RoleSessionName: "github-actions-<run-id>"
   }
        |
        v
5. STS가 검증
   - JWT signature 검증 (GitHub JWKS endpoint)
   - iss == OIDC Provider URL
   - aud matches trust policy condition
   - sub matches trust policy condition (StringEquals/StringLike)
   - Role의 trust policy가 "Allow"
        |
        v
6. 임시 자격 증명 반환 (default 1h, max 12h)
   AccessKeyId: "ASIA..."
   SecretAccessKey: "..."
   SessionToken: "..."
   Expiration: "..."
```

각 단계의 디테일을 짚어보자.

> 🔍 **더 깊이**: 2단계에서 발급되는 JWT는 **RS256**(RSA 서명)으로 서명되고, AWS STS는 GitHub의 JWKS endpoint(`https://token.actions.githubusercontent.com/.well-known/jwks`)에서 공개 키를 가져와 검증한다. AWS IAM Identity Provider 등록 시 thumbprint를 입력하라는 항목이 있었던 이유가 이것이다 — TLS 인증서 thumbprint로 GitHub의 신원을 미리 신뢰해두는 절차. 2023년 7월부터 AWS가 잘 알려진 IdP(GitHub, GitLab 등)의 thumbprint를 자동 검증하기 시작해 사용자가 직접 입력할 필요가 점차 줄어들었다. 이는 thumbprint rotation 시 사고를 미연에 방지하기 위한 변경이다.

> 💡 **관련 이론**: OIDC(OpenID Foundation 2014)는 OAuth 2.0(RFC 6749, 2012) 위에 인증 계층을 추가한 표준이다. OAuth 2.0이 "권한 위임"을 다룬다면 OIDC는 "사용자 신원 증명"을 다룬다. 핵심은 **ID Token이라는 JWT(RFC 7519)** 안에 표준 claims(iss, sub, aud, exp, iat, nbf)를 담아 IdP가 발급했음을 자체 검증 가능하게 만든다는 것이다. SAML 2.0(OASIS 2005)도 같은 역할을 하지만 XML 기반이라 모바일/API 환경에는 무겁다. AWS는 양쪽 모두 지원하지만 GitHub Actions 통합은 OIDC만 사용한다.

> 📚 **사례**: 2022년 한 핀테크가 IAM User access key 사용 정책을 폐기하며 GitHub Actions OIDC로 전환했다. 전환 직후 한 워크플로가 갑자기 동작하지 않았다. 원인: 워크플로 YAML에서 `permissions:` 블록을 깜빡 빠뜨렸고, GitHub은 기본적으로 `id-token: none`이라 OIDC 토큰을 발급하지 않았다. 에러 메시지는 모호했다(`Could not assume role`). 30분간 디버깅 후 발견. 이후 팀은 모든 workflow template에 `permissions: id-token: write, contents: read`를 기본 포함했다. 시험에서 "OIDC가 동작하지 않는다 → 가장 먼저 확인할 것"의 정답은 거의 항상 이 한 줄이다.

## Trust Policy의 `sub` 조건 — 보안의 핵심이 여기 있다

OIDC 통합의 보안은 거의 전적으로 **Trust Policy의 `sub` 조건이 얼마나 정확한가**에 달려 있다. `sub`을 와일드카드로 두면 침해 시 영향이 폭발한다.

GitHub이 발급하는 JWT의 `sub` 값은 컨텍스트에 따라 달라진다.

| 워크플로 컨텍스트 | sub 값 |
|------------------|--------|
| `push` to main | `repo:my-org/my-repo:ref:refs/heads/main` |
| `push` to feature/x | `repo:my-org/my-repo:ref:refs/heads/feature/x` |
| `pull_request` | `repo:my-org/my-repo:pull_request` |
| Tag push | `repo:my-org/my-repo:ref:refs/tags/v1.0` |
| Environment 사용 | `repo:my-org/my-repo:environment:production` |
| Reusable workflow | `repo:my-org/my-repo:job_workflow_ref:org/shared/.github/workflows/deploy.yml@refs/heads/main` |

Trust Policy 조건을 어떻게 쓰느냐가 보안 수준을 결정한다.

```json
// 1) 너무 헐겁다 — 같은 org의 어떤 repo든 main 브랜치면 Role assume 가능
"StringLike": {
  "token.actions.githubusercontent.com:sub": "repo:my-org/*:ref:refs/heads/main"
}

// 2) 적당 — 특정 repo의 main 브랜치만
"StringEquals": {
  "token.actions.githubusercontent.com:sub": "repo:my-org/my-app:ref:refs/heads/main"
}

// 3) 안전 — 특정 repo + 특정 환경 + Required Reviewers를 통과한 워크플로만
"StringEquals": {
  "token.actions.githubusercontent.com:sub": "repo:my-org/my-app:environment:production"
}
```

> ⚠️ **함정**: 패턴 1의 위험은 시험과 실무 양쪽에서 단골이다. 같은 org에 100개 repo가 있고 한 개라도 침해되면 그 repo의 main 브랜치에서 prod Role을 assume할 수 있다. 시험에서 "와일드카드 `repo:org/*` sub 조건의 위험은?"의 정답은 항상 "조직 내 다른 repo가 침해되면 prod 권한을 훔쳐 사용 가능".

> 🔍 **더 깊이**: 패턴 3의 `environment:production`이 가장 안전한 이유는 GitHub Environment에 **Required Reviewers** 또는 **wait timer**를 설정할 수 있기 때문이다. 워크플로가 `environment: production`을 사용하려면 GitHub이 먼저 그 게이트를 통과시켜야 하고, 그제서야 `sub`이 `environment:production`인 JWT가 발급된다. 즉 AWS Role assumption 자체가 사람 승인 없이는 일어나지 않는다. **AWS IAM 제한 + GitHub Environment 게이트**의 이중 방어가 이렇게 완성된다.

> 💡 **관련 이론**: 이 패턴은 **defense in depth**(다층 방어, NIST SP 800-160)의 교과서적 적용이다. 한 계층(GitHub Environment)이 뚫려도 다음 계층(IAM trust policy sub 조건)이 막는다. 동시에 **최소 권한 원칙(principle of least privilege, Saltzer & Schroeder 1975)**의 OIDC 페더레이션 구현이기도 하다 — Role의 Permission Policy는 prod 리소스에만 닿고, 그 Role을 assume할 수 있는 워크플로 컨텍스트도 좁힌다.

> 📚 **사례**: 2023년 한 SaaS 회사에서 fork된 PR이 workflow를 트리거하면서 secrets에 접근하는 사고가 발생할 뻔했다. fork PR에서는 secrets가 노출되지 않는 게 GitHub의 기본 동작이지만, 한 개발자가 `pull_request_target` 이벤트를 잘못 사용해 base repo의 secrets에 fork의 코드가 접근할 수 있는 상태로 만들었다. 다행히 OIDC 토큰의 `sub`은 `pull_request`였고, prod IAM Role의 trust policy는 `sub: ref:refs/heads/main`만 허용했기 때문에 fork PR이 Role을 assume하지 못했다. 사고가 차단된 결정적 이유. 이 사례 후 회사는 `pull_request_target` 사용을 조직 차원에서 금지했다.

## GitHub Environments — 워크플로 실행 직전의 사람 게이트

GitHub Environments는 단순한 이름표가 아니라 **워크플로 실행 직전에 끼어드는 보호 계층**이다. 설정할 수 있는 게이트는 다음과 같다.

| 게이트 | 동작 |
|-------|------|
| **Required Reviewers** | 지정한 사람 또는 팀의 승인이 있어야 deploy job 시작 (최대 6명, 일부는 필수) |
| **Wait Timer** | 승인 후에도 N분(최대 30일)을 대기. 비상 롤백 창 확보 |
| **Deployment Branches** | 어떤 브랜치/태그에서만 이 environment에 배포할 수 있는지 제한 |
| **Environment Secrets** | 다른 환경과 분리된 secrets 저장소 |
| **Custom Protection Rules** | (GitHub Apps) 외부 도구가 게이트 평가 |

```yaml
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.example.com  # 배포 후 확인용 링크
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::222:role/GHA-Production
          aws-region: ap-northeast-2
      - run: ./deploy.sh production
```

> 🔍 **더 깊이**: Wait Timer는 흔히 무시되는 기능이지만 실무에서 매우 유용하다. "승인 후 5분 대기"를 두면 그 5분 안에 누군가 "잠깐 멈춰"라고 외칠 수 있다. CodeDeploy의 `BlockTraffic` 같은 자동 hook과 결합하면, 사람 승인 → wait → 자동 검증 → 트래픽 시프트의 4단계 보호가 만들어진다.

> 💡 **관련 이론**: GitHub Environments + Required Reviewers는 본질적으로 **manual gating**(Google SRE Book, Chapter 16) 패턴이다. 완전 자동화는 빠르지만 실수의 폭이 크고, 완전 수동은 안전하지만 느리다. Gating은 그 사이에서 "사람이 결정할 가치가 있는 지점만 사람에게 묻는다"는 절충이다. AWS CodePipeline의 Manual Approval Action도 같은 철학이다.

## AWS Code* vs GitHub Actions — 무엇이 어떤 시나리오에 강한가

Pro 시험은 두 도구의 선택 기준을 자주 묻는다. 핵심은 "AWS 네이티브 깊이 vs 다중 클라우드 + 개발자 친화성".

| 차원 | GitHub Actions | AWS CodePipeline/CodeBuild |
|------|----------------|---------------------------|
| **AWS 네이티브 통합** | OIDC + AWS Action 사용. 일반적 깊이 | 네이티브. 한 콘솔 안에서 모든 단계 |
| **다중 클라우드** | 우수. GCP/Azure 동일하게 동작 | AWS 전용 |
| **빌드 환경** | GH-hosted runner(분당 과금) + Self-hosted | CodeBuild(빌드 시간 과금, VPC 모드 지원) |
| **PR 통합** | 네이티브. PR 코멘트, status check | CodeStar Connections + Notifications |
| **승인 게이트** | Environments + Required Reviewers | Manual Approval Action |
| **시크릿** | Repo/Org/Environment Secrets | Secrets Manager / SSM Parameter Store |
| **멀티 계정** | OIDC + 환경별 IAM Role | Cross-account Role + Pipeline roleArn |
| **무료 분량** | 일정 분량 무료 | 매월 100분 무료(CodeBuild) |
| **장점** | 개발자 친화성, 마켓플레이스 액션 풍부 | AWS 정밀 제어, IAM/KMS 일관성, VPC 네이티브 |

> 🎯 **시나리오**: 한 회사가 "메인 빌드는 GitHub Actions에서, 멀티 계정 prod 배포는 AWS CodePipeline에서" 분리 운영한다. 이유는? GitHub Actions는 빌드/테스트의 개발자 경험이 우월하고, prod 배포는 CodePipeline의 Cross-account Role + Manual Approval + KMS 통합이 더 정밀하기 때문. 시험에서 "둘 중 어느 것?"이라는 보기가 나오면, 시나리오의 **"무엇이 가장 중요한가"**를 보고 결정한다. PR 자동 빌드/테스트 = GH Actions, 멀티 계정 정밀 배포 = CodePipeline.

## Self-hosted Runner vs CodeBuild VPC 모드 — 프라이빗 리소스 빌드의 두 길

기본 GitHub-hosted runner는 GitHub의 공용 인프라에서 동작하므로 VPC 내부 리소스(프라이빗 RDS, 내부 ELB, EFS)에 접근할 수 없다. 두 가지 해결책이 있다.

```
[Option A: Self-hosted Runner on AWS]
  ASG of EC2 (또는 ECS Fargate)
    |
    | GitHub Actions Runner Controller (ARC) on EKS
    | 또는 actions-runner installation script
    v
  VPC private subnet
    |
    v
  Private RDS / 내부 ALB / EFS 접근

[Option B: CodeBuild VPC mode]
  GitHub webhook → CodeBuild project
    |
    | vpcConfig: { vpcId, subnets, securityGroupIds }
    v
  VPC private subnet에서 빌드 실행
```

| 차원 | Self-hosted Runner | CodeBuild VPC 모드 |
|------|-------------------|---------------------|
| **유지보수** | runner 패치, OS 업데이트 본인 책임 | AWS 완전 관리 |
| **확장** | ASG 또는 ARC가 GitHub queue 길이 따라 스케일 | CodeBuild가 자동 |
| **비용** | EC2/Fargate + 운영 시간 | 빌드 분 단위 |
| **VPC 통합** | 인스턴스가 VPC 안에 있음 | ENI 부착 방식 |
| **GitHub 통합 깊이** | 100% (네이티브 GH Actions) | GH webhook + status API |
| **시작 지연** | runner 항시 가동 시 즉시 | cold start 수십 초 |

> ⚠️ **함정**: Self-hosted Runner를 **public repo**에 연결하면 외부 PR이 runner에서 임의 코드를 실행할 수 있는 위험이 있다. GitHub은 명시적으로 "private repo에만 self-hosted runner를 쓰라"고 경고한다. 시험에서 "public repo + self-hosted runner"의 위험을 묻는 보기는 거의 항상 정답이다.

> 🔍 **더 깊이**: GitHub Actions Runner Controller(ARC)는 Kubernetes operator로 runner를 동적으로 띄운다. PR 큐가 길어지면 EKS pod로 runner를 늘리고, 끝나면 회수한다. AWS에서는 Karpenter와 결합해 node를 spot으로 즉시 띄우는 패턴이 일반적이다. 이게 self-hosted runner의 운영 비용을 크게 낮춘다.

## Reusable Workflows와 Composite Actions — 100개 repo에 정책을 일관되게 배포

조직이 커지면 같은 deploy 로직을 100개 repo에 복붙하는 일이 생긴다. 그 순간이 reusable workflow를 도입할 시점이다.

```yaml
# .github/workflows/shared-deploy.yml in org/shared-workflows
on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      role-arn:
        required: true
        type: string

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ inputs.role-arn }}
          aws-region: ap-northeast-2
      - run: ./deploy.sh
```

```yaml
# 100개 service repo가 모두 이걸 호출
jobs:
  prod-deploy:
    uses: my-org/shared-workflows/.github/workflows/shared-deploy.yml@v1
    with:
      environment: production
      role-arn: arn:aws:iam::222:role/GHA-Production
```

> 🔍 **더 깊이**: Reusable workflow의 OIDC `sub` 값이 평소와 다르다는 점이 중요하다. 호출하는 워크플로가 아니라 **호출되는 reusable workflow가 정의된 repo + ref**가 sub에 들어간다. 패턴: `repo:my-org/shared-workflows:job_workflow_ref:my-org/shared-workflows/.github/workflows/shared-deploy.yml@refs/heads/main`. 따라서 Trust Policy 조건도 이걸 기준으로 작성해야 한다. 시험에서 reusable workflow + OIDC 보기가 나오면 거의 이 디테일을 묻는다.

> 💡 **관련 이론**: Reusable workflow는 본질적으로 **DRY(Don't Repeat Yourself, Hunt & Thomas 1999)**의 CI/CD 적용이다. 100개 repo에 같은 로직을 두면 한 가지 보안 패치(예: AssumeRole region 변경)를 100번 적용해야 한다. Shared workflow는 한 번만 바꾸면 다음 호출에서 자동 적용된다. 이게 CALMS의 Sharing 축이 코드로 표현되는 모습.

## OIDC 통합의 실무 함정 모음

> ⚠️ **함정 1**: `permissions: id-token: write` 누락 — 가장 흔한 실수. 워크플로 또는 job 수준에 명시 필수.

> ⚠️ **함정 2**: `sub` 조건을 `repo:org/*`로 와일드카드 — 조직 내 어떤 repo가 침해돼도 prod 권한 도달 가능.

> ⚠️ **함정 3**: `aud` 변경 시 trust policy 미반영 — `aws-actions/configure-aws-credentials@v4`에서 `audience` 옵션을 바꾸면 trust policy의 `aud` 조건도 같이 바꿔야 함.

> ⚠️ **함정 4**: Session duration 12시간 초과 시도 — 기본 1시간, 최대 12시간. Role의 `MaxSessionDuration` 속성을 늘리고 호출 시 `RoleSessionDuration`도 명시.

> ⚠️ **함정 5**: 같은 workflow_run을 두 번 실행하면 두 번째에서 OIDC가 캐싱된 토큰을 쓴다고 생각하기 — 실제로는 매번 새 토큰. 시험에서 "OIDC 토큰이 캐시되는가" → 아니오.

> ⚠️ **함정 6**: `pull_request` 이벤트에서 secrets 접근 가능 → fork PR이면 secrets 비공개. 그러나 `pull_request_target`은 base repo 컨텍스트로 동작하므로 secrets 접근 가능 → fork에서 악성 코드 실행 위험. 시험 빈출.

## ⭐ 핵심 포인트

1. ⭐ **OIDC = 장기 자격 증명 제거**. GitHub Secrets에 AWS Access Key 저장은 안티패턴.
2. ⭐ Trust Policy의 `sub` 조건이 보안의 핵심. `environment:production`이 가장 안전, `repo:org/*`는 위험.
3. ⭐ GitHub Environments의 Required Reviewers + AWS IAM 제한 = 이중 방어.
4. ⭐ `permissions: id-token: write`가 OIDC 동작의 절대 조건. 누락 시 가장 흔한 실패.
5. ⭐ Self-hosted Runner는 private repo에만. Public repo + self-hosted runner는 임의 코드 실행 위험.
6. ⭐ Reusable workflow의 OIDC `sub`은 호출 repo가 아니라 정의 repo 기준. Trust policy 조건 작성 시 주의.
7. ⭐ 기본 자격 증명 유효기간 1시간, 최대 12시간(Role MaxSessionDuration 설정 필요).

## 📝 연습 문제

**문제 1.** GitHub Actions에서 AWS에 배포할 때 가장 안전한 자격 증명 관리 방법은?

A) IAM User 액세스 키를 GitHub Secrets에 저장
B) OIDC 페더레이션으로 IAM Role의 단기 자격 증명 사용
C) EC2 Instance Profile을 GitHub에 공유
D) Personal Access Token으로 AWS 호출

**정답: B**
해설: 정적 키 자체가 없는 OIDC가 표준. A는 키 노출 시 영향 광범위. C/D는 기술적 의미 부정확.

---

**문제 2.** OIDC Trust Policy에 `sub`을 `repo:my-org/*:ref:refs/heads/main`으로 설정하면 어떤 위험이 있는가?

A) 위험 없음
B) 조직 내 어떤 리포지토리든 main 브랜치라면 권한 가정 가능 — 한 repo 침해 시 prod 권한 도달
C) PR에서 자격 증명 사용 가능
D) Tag 푸시에서 자격 증명 사용 가능

**정답: B**
해설: 와일드카드 repo는 횡적 침해 경로를 만든다. 항상 specific repo로 명시. 가장 안전한 패턴은 `environment:production` 기반.

---

**문제 3.** GitHub Actions 워크플로에서 OIDC 토큰이 발급되지 않는다. 가장 먼저 확인할 것은?

A) IAM Role 이름 오타
B) 워크플로 YAML에 `permissions: id-token: write` 명시 여부
C) AWS Region 설정
D) GitHub Actions 사용량 한도

**정답: B**
해설: `id-token: write` 누락이 압도적 1위 원인. 기본값이 `none`이므로 명시 안 하면 토큰 발급 자체가 안 됨.

---

**문제 4.** "프라이빗 RDS에 마이그레이션 스크립트를 실행하는 빌드"가 필요하다. 가장 적절한 구성은?

A) GitHub-hosted Runner에서 RDS 공인 엔드포인트 활성화
B) Self-hosted Runner를 VPC에 배치 또는 CodeBuild VPC 모드 사용
C) Lambda에서 모든 마이그레이션 실행
D) Bastion EC2에 SSH 후 수동 실행

**정답: B**
해설: 프라이빗 리소스 접근 = VPC 내부 실행 환경. A는 보안 안티패턴(RDS public 노출). D는 자동화 부재.

---

**문제 5.** GitHub Environments의 Required Reviewers 기능은 어떤 단계의 보호인가?

A) 코드 머지 단계 (PR 머지)
B) 워크플로 실행 단계 (deploy job 시작 전 승인)
C) AWS IAM 단계
D) CloudFormation Stack 생성 단계

**정답: B**
해설: GitHub Environments는 deploy job 직전 게이트. PR 머지 보호는 Branch Protection이 담당하는 별도 계층.

---

**문제 6.** Trust Policy의 `aud` 조건 기본값과 변경 이유는?

A) 기본 `sts.amazonaws.com`. 변경 이유 없음
B) 기본 `sts.amazonaws.com`. 다중 조직 공유 환경에서 audience 분리로 토큰 도용 방지
C) 기본 `github.com`. 변경 불가
D) 기본은 OIDC Provider 자체

**정답: B**
해설: `aud`를 조직별로 다르게 두면 다른 조직의 GitHub Actions가 우리 Role을 훔쳐 사용 불가. 다중 IdP 환경에서 필수 강화.

---

**문제 7.** Reusable workflow를 통해 100개 repo가 공통 deploy 로직을 사용한다. Trust Policy `sub` 조건을 어떻게 작성해야 하는가?

A) 100개 repo 각각의 ref를 OR로 나열
B) `job_workflow_ref:my-org/shared-workflows/.github/workflows/deploy.yml@refs/heads/main`로 정의 repo + ref 기준
C) 와일드카드 `repo:my-org/*`
D) 100개 IAM Role을 만든다

**정답: B**
해설: Reusable workflow의 OIDC sub은 호출 repo가 아닌 정의 repo + ref가 기준. `job_workflow_ref` claim을 trust policy에 사용. 한 trust 조건으로 100개 repo 호출 커버.

---

**문제 8.** Fork된 PR이 base repo의 secrets에 접근하는 시나리오의 위험은?

A) `pull_request` 이벤트는 fork에서 secrets 비공개라 위험 없음
B) `pull_request_target` 이벤트는 base 컨텍스트로 실행되어 fork PR이 secrets/OIDC 권한 접근 가능 → fork에서 임의 코드 실행 시 prod 권한 탈취 위험
C) GitHub Actions는 fork PR에서 무조건 차단
D) 위험 없음

**정답: B**
해설: `pull_request`는 fork 안전, `pull_request_target`은 base 컨텍스트라 secrets 접근 가능. 조직 차원에서 `pull_request_target` 사용 금지가 일반적.

---

**문제 9.** OIDC로 발급받은 임시 자격 증명의 기본 유효 시간과 최대치는?

A) 기본 15분, 최대 1시간
B) 기본 1시간, 최대 12시간(Role MaxSessionDuration 설정)
C) 기본 12시간, 최대 24시간
D) 무제한

**정답: B**
해설: AssumeRoleWithWebIdentity 기본 1시간. Role 속성 `MaxSessionDuration`을 늘리면 최대 12시간까지 가능. 빌드가 12시간 이상이면 워크플로 분할 필요.

---

**문제 10.** OIDC + GitHub Environments + Trust Policy `sub: environment:production` 조합을 만들었다. 누군가 main 브랜치에서 직접 prod deploy job을 실행하려 한다. 어떻게 차단되는가?

A) GitHub Environment의 Required Reviewers가 사람 승인 대기 → 미승인 시 job 시작 안 함 → JWT 발급 안 함 → AWS Role assume 시도조차 발생 안 함
B) AWS IAM이 자동 거부
C) GitHub이 main 브랜치를 자동 격리
D) 차단 안 됨

**정답: A**
해설: GitHub Environments의 게이트는 job 시작 전에 적용된다. 승인이 없으면 JWT 자체가 발급되지 않으므로 AWS는 호출조차 받지 않는다. 이게 이중 방어의 핵심 — AWS IAM에 도달하기 전에 GitHub이 막는다.

---

## 📌 오늘의 요약

OIDC 페더레이션은 단순한 "키 없는 인증"이 아니라 **정적 자격 증명 자체를 시스템에서 제거하는 패러다임 전환**이다. JWT의 `sub` claim에 컨텍스트(repo, ref, environment, reusable workflow ref)가 모두 담겨 있어, Trust Policy 조건만 정확히 쓰면 매우 정밀한 권한 제어가 가능하다. GitHub Environments + Required Reviewers와 결합하면 GitHub 게이트와 AWS IAM 게이트의 이중 방어가 완성된다. 실무 함정은 `permissions: id-token: write` 누락, `sub` 와일드카드, `pull_request_target` 오용 세 가지가 단연 많다. 내일은 이걸 CodeBuild의 빌드 시스템 관점에서 다시 본다.
