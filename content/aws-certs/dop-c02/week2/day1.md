# Day 1 - CodeCommit 심화: Git 호스팅을 IAM으로 통합하면 무엇이 달라지는가

CodeCommit은 표면적으로는 "AWS가 만든 Git 서버"다. 그러나 이 한 줄의 묘사에 속으면 시험 문제도, 실무 운영도 다 어긋난다. CodeCommit의 진짜 정체는 **Git protocol을 IAM/STS 인증 체계 위에 얹은 관리형 저장소**이고, 이 한 가지 설계 결정이 보안 모델·자동화 패턴·크로스 계정 운영을 전부 GitHub과 다르게 만든다.

오늘 다룰 그림은 다음과 같다. ① IAM 위에 Git이 어떻게 올라가는지 (인증 4종 비교) ② Git 이벤트가 어떻게 EventBridge로 흘러나오는지 (자동화의 진입점) ③ Approval Rule이 어떻게 GitHub의 Required Reviewers를 흉내내는지 (브랜치 보호) ④ 멀티 계정 환경에서 어떻게 cross-account 소스가 동작하는지 ⑤ 2024년 7월 신규 가입 중단 이후 마이그레이션 시나리오는 어떻게 출제되는지.

이 그림을 한 번 그려두면, GitHub Enterprise · GitLab · Bitbucket과 비교했을 때 CodeCommit이 어떤 trade-off 위에 서 있는지 자연스럽게 보인다.

## CodeCommit이 IAM과 결합되는 방식 — 4종 인증의 내부 동작

GitHub은 OAuth 토큰 또는 SSH 키로 인증한다. GitLab도 비슷하다. 그런데 CodeCommit은 그 어떤 방식으로 인증하든 마지막에는 **STS가 발급한 임시 자격 증명으로 IAM Policy 평가**를 거친다. 이게 무슨 뜻인지부터 보자.

Git protocol(HTTPS 또는 SSH)은 본래 username/password 또는 SSH 키 기반이다. CodeCommit은 이 protocol을 그대로 두면서, 그 안에서 흘러가는 인증 정보를 IAM 평가 엔진으로 우회시킨다. 그래서 같은 `git clone` 명령어를 써도 뒷단에서는 다음 4가지 중 하나가 일어난다.

| 방식 | 동작 흐름 | 적합한 환경 |
|------|----------|-------------|
| **HTTPS Git Credentials** | IAM Console에서 발급한 username/password를 git이 평문 또는 OS keychain에 저장 → CodeCommit이 그 username을 IAM User로 매핑 후 권한 평가 | 개발자 개인 워크스테이션. MFA 미사용 환경. |
| **SSH Keys** | IAM User에 SSH 공개키 업로드 → git이 `ssh://APKAxxx@git-codecommit.region.amazonaws.com`로 접속 → IAM이 SSH key ID로 User 식별 후 권한 평가 | 개발자 또는 CI 봇. MFA 별도 적용 어려움. |
| **HTTPS + AWS CLI Credential Helper** | git이 자격 증명을 요청할 때마다 AWS CLI가 STS GetSessionToken을 호출 → 임시 자격 증명을 SigV4 서명으로 변환해 git에 주입 | EC2/CodeBuild/Lambda. IAM Role 기반. |
| **HTTPS + git-remote-codecommit (GRC)** | Python 패키지로 설치, `codecommit::region://profile@repo` URL 사용. SigV4로 매 요청 서명. SSO/MFA/페더레이션 환경에서 동작 | 페더레이션 사용자, MFA 강제 조직, AWS SSO 환경 |

> 🔍 **더 깊이**: Git Credentials(첫 번째 방식)는 **IAM User**에만 발급 가능하다. IAM Role에는 발급 불가. 왜냐하면 Role의 자격 증명은 임시(STS)고, Git Credentials는 영구 username/password 형태여야 하기 때문이다. 그래서 EC2/Lambda 같은 Role 기반 환경에서는 Credential Helper나 GRC가 강제된다. 이건 시험에서 "EC2에서 git push 하려면?" 같은 보기에서 정답을 가르는 결정적 단서다.

> 💡 **관련 이론**: 이 4종 인증 방식은 본질적으로 "Git이 알고 있는 자격 증명 종류"와 "IAM이 요구하는 자격 증명 종류"의 격차를 메우는 어댑터 패턴(Gamma et al., Design Patterns 1994)이다. Git protocol은 1990년대 말 Linus Torvalds가 BitKeeper 대안으로 설계할 때 username/password 또는 SSH 키만 가정했다. 반면 IAM은 SigV4 서명 + 임시 자격 증명을 표준으로 본다. CodeCommit이 4가지 인증 경로를 모두 지원하는 건, 이 두 모델 사이의 임피던스 불일치(impedance mismatch)를 우회하려는 설계 타협이다.

> ⚠️ **함정**: 시험 단골 보기로 "IAM User의 access key를 ~/.aws/credentials에 저장하면 git push 가능"이 나온다. 틀렸다. 그건 AWS CLI를 위한 자격 증명이지 Git protocol이 인식하는 자격 증명이 아니다. Git이 그 자격 증명을 SigV4 서명으로 변환해 보내야 하는데, 그 변환을 해주는 게 바로 **Credential Helper**(`!aws codecommit credential-helper $@`)다. 이 헬퍼를 git config에 등록하지 않으면 IAM 자격 증명만으로는 git이 동작하지 않는다.

```bash
# Credential Helper 등록 (EC2/Cloud9/CodeBuild에서 표준)
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true
# 이후 git clone https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/MyApp
```

> 📚 **사례**: 2020년대 초 한 핀테크 회사가 GitHub Enterprise에서 CodeCommit으로 마이그레이션할 때 "MFA 강제" 정책이 발목을 잡았다. 페더레이션 SSO로 콘솔에 로그인하는 개발자들이 git push에서 막혔다. 이유: HTTPS Git Credentials는 IAM User 전용이라 페더레이션 사용자가 발급받을 수 없었다. 해결: **git-remote-codecommit(GRC)**으로 전환. GRC는 매 git 요청마다 현재 AWS profile의 자격 증명(SSO 토큰 포함)으로 SigV4 서명을 만들어 보내므로 MFA·SSO와 자연스럽게 결합된다. 이 사례는 시험에서 "MFA가 강제된 조직의 CodeCommit 접근" 보기로 자주 변형돼 나온다.

## Git 이벤트가 EventBridge로 흘러나오는 구조 — 자동화의 진입점

CodeCommit이 GitHub과 결정적으로 다른 또 하나의 지점은 **모든 저장소 이벤트가 EventBridge에 기본 발행**된다는 것이다. GitHub은 webhook을 별도로 설정해야 하고, webhook 수신 endpoint를 운영해야 하며, 재시도·서명 검증·중복 방지를 각자 구현해야 한다. CodeCommit은 그 일을 EventBridge가 떠맡는다.

발행되는 이벤트 종류는 다음과 같다.

| Event Type | 발생 시점 | 주요 detail 필드 |
|-----------|----------|----------------|
| `CodeCommit Repository State Change` | push, branch create/delete, tag 변경 | `event` (referenceCreated/Updated/Deleted), `referenceFullName`, `commitId` |
| `CodeCommit Pull Request State Change` | PR created/closed/merged, source 브랜치 업데이트, approval 추가/취소 | `event` (pullRequestCreated 등), `pullRequestId`, `destinationReference`, `sourceCommit` |
| `CodeCommit Comment on Pull Request` | PR 코멘트 추가 | `commentId`, `pullRequestId` |
| `CodeCommit Comment on Commit` | 커밋 코멘트 추가 | `commentId`, `commitId` |
| `CodeCommit Approval Rule Override` | Approval Rule을 override할 때 | `pullRequestId`, `overrideStatus` |

이 이벤트들이 EventBridge로 흘러간 뒤의 활용 패턴은 거의 무한하다. 표준 패턴 몇 가지만 보자.

```json
// PR 생성 시 자동 빌드 트리거
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Pull Request State Change"],
  "detail": {
    "event": ["pullRequestCreated", "pullRequestSourceBranchUpdated"],
    "repositoryNames": ["MyApp"]
  }
}
```

```json
// main 브랜치 머지 → prod 파이프라인 시작
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Repository State Change"],
  "detail": {
    "event": ["referenceUpdated"],
    "referenceType": ["branch"],
    "referenceName": ["main"]
  }
}
```

> 🔍 **더 깊이**: EventBridge 이벤트의 **at-least-once delivery** 특성을 잊으면 안 된다. 같은 PR 생성 이벤트가 드물게 두 번 전달될 수 있다. PR마다 빌드를 1회만 실행해야 한다면 Lambda에서 `pullRequestId + sourceCommit` 조합으로 idempotency key를 만들고 DynamoDB conditional write로 중복을 막아야 한다. CodePipeline은 자체적으로 같은 source revision에 대해 새 execution을 만들지 않는 동작이 있지만(소스 변경 감지가 비활성/활성 모드에 따라 다름), Lambda 직접 호출 경로는 직접 dedup을 책임져야 한다.

> 💡 **관련 이론**: EventBridge의 PutEvents는 분산 시스템에서 "exactly-once는 불가능하다"는 Two Generals Problem(1975, Akkoyunlu·Ekanadham·Huber)의 현실적 귀결이다. AWS의 모든 이벤트 버스(SQS, SNS, EventBridge, Kinesis)는 at-least-once를 선택하고 consumer에게 idempotency 책임을 떠넘긴다. 이는 Kafka의 exactly-once semantics(EOS)가 producer-consumer 양쪽에 transactional ID와 시퀀스를 강제하는 무거운 메커니즘을 도입하는 것과 대조적이다.

> 📚 **사례**: 한 게임 회사가 CodeCommit + Lambda로 "PR 생성 시 자동 슬랙 알림" 시스템을 만들었다. 한 달 후 슬랙에 같은 PR 알림이 두 번씩 오는 경우가 가끔 발생했다. 원인: EventBridge의 at-least-once 전달이 한 달에 한두 번 발생. 해결: Lambda에서 `pullRequestId + eventVersion`을 키로 DynamoDB TTL 5분 conditional put을 추가하고, 이미 존재하면 함수를 즉시 종료. 이 경험으로 팀은 "이벤트 기반 자동화에서 dedup은 옵션이 아니라 필수"라는 원칙을 세웠다.

레거시 트리거 메뉴(저장소 자체의 Triggers 탭)는 SNS와 Lambda만 직접 연결 가능하고, 이벤트 필터링이 제한적이다. **현대적 권장은 EventBridge 단일 경로**이고, AWS 공식 가이드도 신규 자동화는 EventBridge로 통일하라고 명시한다. 시험에서 "최신 권장 패턴"이라는 표현이 나오면 EventBridge가 정답이다.

## Approval Rule Template — GitHub Required Reviewers의 IAM 버전

GitHub의 Required Reviewers는 GitHub user/team을 기준으로 동작한다. CodeCommit은 같은 일을 **IAM Principal 기준**으로 수행한다. 이 차이가 곧 멀티 계정·페더레이션 환경에서의 강력함이 된다.

Approval Rule Template은 다음과 같이 구성된다.

```json
{
  "Version": "2018-11-08",
  "DestinationReferences": ["refs/heads/main", "refs/heads/release/*"],
  "Statements": [
    {
      "Type": "Approvers",
      "NumberOfApprovalsNeeded": 2,
      "ApprovalPoolMembers": [
        "arn:aws:sts::123456789012:assumed-role/SeniorDeveloperRole/*",
        "arn:aws:sts::123456789012:assumed-role/SecurityReviewerRole/*"
      ]
    }
  ]
}
```

핵심 트릭은 `ApprovalPoolMembers`에 **assumed-role ARN 패턴**을 쓴다는 것이다. `arn:aws:sts::ACCOUNT:assumed-role/RoleName/*`는 "그 Role을 assume한 어떤 세션이든 승인자 자격이 있음"을 의미한다. 이게 페더레이션 사용자가 콘솔에서 SSO로 들어와 PR을 승인할 때도 자연스럽게 동작하는 이유다.

> ⚠️ **함정**: "IAM User ARN을 ApprovalPoolMembers에 넣어도 되나?" 가능하다. 다만 페더레이션/SSO 환경에서는 사용자가 IAM User가 아니라 assumed-role이므로 User ARN은 매칭되지 않는다. 시험 보기에서 "User ARN으로 Approval Pool 구성"이 정답으로 나오는 경우는 거의 없다. 답은 거의 항상 **assumed-role ARN 패턴**.

> 🔍 **더 깊이**: Approval Rule Template은 **저장소가 아닌 계정 수준**에 만들어진다. 만든 후 `AssociateApprovalRuleTemplateWithRepository` API로 저장소에 연결한다. 이 분리는 의도적이다 — 한 계정에 50개 저장소가 있을 때 "main 브랜치는 2명 승인" 같은 표준을 한 템플릿으로 정의하고 모든 저장소에 일괄 적용할 수 있다. 시험에서 "전사적으로 동일한 PR 승인 규칙을 강제하라"는 시나리오의 정답은 **Approval Rule Template + 일괄 association**이지, 저장소별 개별 룰이 아니다.

> 💡 **관련 이론**: 이 패턴은 정책의 **선언적 분리**(declarative separation)다. Kubernetes의 ClusterRole + ClusterRoleBinding, OPA의 policy/data 분리와 같은 철학. 정책 정의는 한 곳에 모으고, 적용은 별도 메커니즘으로 한다. 이 분리가 없으면 50개 저장소에 50번 같은 정책을 복붙해야 하고, 정책 변경 시 drift가 생긴다.

```bash
# 계정 수준에 템플릿 정의
aws codecommit create-approval-rule-template \
  --approval-rule-template-name "Standard-Main-2Reviews" \
  --approval-rule-template-content file://template.json

# 여러 저장소에 일괄 적용 (bash 루프 또는 IaC)
for REPO in app-frontend app-backend app-worker; do
  aws codecommit associate-approval-rule-template-with-repository \
    --approval-rule-template-name "Standard-Main-2Reviews" \
    --repository-name $REPO
done
```

## CodeCommit vs GitHub Actions/GitLab CI/Bitbucket — Pro 시험이 묻는 차이

Pro 시험은 도구 비교를 좋아한다. CodeCommit이 다른 Git 호스팅과 어떻게 다른지, trade-off가 무엇인지를 정확히 알아야 한다.

| 차원 | CodeCommit | GitHub.com / Enterprise | GitLab | Bitbucket |
|------|------------|--------------------------|--------|-----------|
| **인증** | IAM/STS, GRC, Git Credentials | OAuth, PAT, SSH, GitHub Apps + **OIDC to AWS** | OAuth, PAT, SSH, OIDC | OAuth, PAT, SSH |
| **PR 승인** | Approval Rule Template (IAM 기반) | Required Reviewers + CODEOWNERS | Merge Request Approvals + CODEOWNERS | Default Reviewers + Branch Permissions |
| **CI 내장** | 없음 — CodeBuild/CodePipeline 별도 | GitHub Actions 내장 | GitLab CI 내장 | Bitbucket Pipelines 내장 |
| **시크릿** | Secrets Manager / SSM Parameter Store | Repo Secrets / Org Secrets / Environments | CI/CD Variables | Repository/Workspace Variables |
| **이벤트** | EventBridge 네이티브 | Webhook | Webhook / System Hook | Webhook |
| **DR/복제** | 수동 미러링 (Lambda) | Geo-replication (Enterprise) | Geo (Premium) | Smart Mirroring |
| **신규 가입** | 2024-07-25 중단 | 일반 가입 가능 | 일반 가입 가능 | 일반 가입 가능 |
| **AWS 통합** | 네이티브 | OIDC + IAM Role (`AssumeRoleWithWebIdentity`) | OIDC | OIDC |

> 🔍 **더 깊이**: 최근 시험 트렌드는 "**GitHub Actions에서 AWS로 OIDC 페더레이션**"을 묻는 보기가 늘었다. 패턴은 정해져 있다. ① AWS IAM Identity Provider에 GitHub OIDC provider(`https://token.actions.githubusercontent.com`) 등록 ② IAM Role 생성, trust policy에 `aud=sts.amazonaws.com` + `sub=repo:org/repo:ref:refs/heads/main` 조건 ③ GitHub Actions workflow에서 `aws-actions/configure-aws-credentials@v4`로 AssumeRoleWithWebIdentity. 이게 정적 access key 저장보다 안전한 이유는 키 자체가 없기 때문이다. 시험에서 "GitHub Actions가 AWS에 안전하게 접근하려면?"의 정답은 거의 항상 OIDC + Role assumption.

> 💡 **관련 이론**: OIDC(OpenID Connect, OpenID Foundation 2014)는 OAuth 2.0 위에 인증(authentication) 계층을 추가한 표준이다. 핵심은 ID Token이라는 JWT 안에 claims(iss, sub, aud, exp)를 넣어 신뢰할 수 있는 IdP가 발급했음을 검증한다. AWS의 OIDC federation은 이 JWT를 `AssumeRoleWithWebIdentity`로 변환한다. 정적 access key 대비 **단기성, 비공유성, audit 가능성** 세 측면에서 우월하다.

> 📚 **사례**: 2023년 초 한 SaaS 회사가 GitHub Actions에서 AWS access key를 정적으로 저장해 쓰다가 PR에 키가 출력 로그로 누출되는 사고를 겪었다. 누군가 fork repo에서 PR을 보냈고, 그 PR의 GitHub Actions가 secrets에 접근하면서 환경 변수가 stdout으로 나왔다(원인: 누군가 디버그용 `echo`를 PR에 넣음). 키 회수 + 회전 + 영향 분석에 36시간이 걸렸다. 이후 회사는 OIDC + IAM Role 패턴으로 전환했고, key 자체가 존재하지 않으니 누출이 불가능해졌다. 시험에서 "fork PR의 secrets 접근 위험"이라는 표현이 나오면 거의 OIDC를 묻는 신호다.

## 크로스 계정 CodeCommit — Hub/Spoke 파이프라인의 표준 구성

멀티 계정 환경에서는 CodeCommit이 Account A에, CodePipeline이 Shared Services Account B에 있는 패턴이 표준이다. 이 구성이 작동하려면 **3개의 IAM 표면**을 모두 정확히 맞춰야 한다.

1. **Account A의 CodeCommit Resource Policy**: 누가 이 저장소를 읽을 수 있는지 선언
2. **Account B의 Pipeline Role의 Identity Policy**: 그 Role이 CodeCommit을 호출할 권한 보유
3. **Pipeline의 Source Action의 `roleArn`**: 파이프라인 실행 시 어느 Role로 CodeCommit에 접근할지

이 3개가 모두 맞아떨어져야 cross-account가 동작한다. 한 개라도 누락되면 에러 메시지는 모호하다(보통 "access denied"). 그래서 디버깅이 어렵다.

```json
// Account A: CodeCommit Repository Resource Policy
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "CrossAccountReadFromB",
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::B-ACCOUNT-ID:role/CodePipeline-SourceAccess-Role"
    },
    "Action": [
      "codecommit:GitPull",
      "codecommit:GetBranch",
      "codecommit:GetCommit",
      "codecommit:GetCommitHistory",
      "codecommit:UploadArchive",
      "codecommit:GetUploadArchiveStatus",
      "codecommit:CancelUploadArchive"
    ],
    "Resource": "arn:aws:codecommit:ap-northeast-2:A-ACCOUNT-ID:MyApp"
  }]
}
```

```json
// Account B: CodePipeline Source Action 구성
{
  "name": "Source",
  "actionTypeId": {
    "category": "Source",
    "owner": "AWS",
    "provider": "CodeCommit",
    "version": "1"
  },
  "roleArn": "arn:aws:iam::B-ACCOUNT-ID:role/CodePipeline-SourceAccess-Role",
  "configuration": {
    "RepositoryName": "MyApp",
    "BranchName": "main",
    "PollForSourceChanges": "false"
  }
}
```

> ⚠️ **함정**: 위 구성에서 **KMS 키**가 빠지면 artifact 암호화 단계에서 실패한다. CodePipeline의 artifact bucket은 보통 customer-managed KMS 키로 암호화되는데, cross-account 시나리오에서는 이 키의 **key policy에 Account A의 Role(또는 그 Role을 assume할 Principal)에게 Decrypt/GenerateDataKey 권한**을 줘야 한다. 시험에서 "cross-account 파이프라인이 권한은 다 줬는데 artifact에서 실패한다"는 시나리오의 정답은 거의 항상 KMS 키 정책 누락.

> 🔍 **더 깊이**: CodeCommit의 cross-account 패턴은 **데이터 평면(Git protocol)과 제어 평면(IAM)을 분리**한다는 AWS 설계 철학을 잘 보여준다. Git protocol 자체는 HTTPS endpoint를 그대로 쓰지만(public internet), 인증은 IAM이 처리하므로 네트워크적으로 VPC peering이나 Direct Connect가 필요 없다. 이게 시험에 단골 함정으로 나온다 — "cross-account CodeCommit 접근을 위해 VPC Peering 필요"는 항상 오답.

> 💡 **관련 이론**: Resource Policy + Identity Policy의 **이중 평가**는 IAM의 핵심 원칙이다. Cross-account에서는 두 정책 모두 Allow여야 접근이 허용된다 — "Both policies must allow" 원칙. 같은 계정 내에서는 둘 중 하나만 Allow면 충분(특정 서비스 예외 제외)하지만, cross-account는 항상 양쪽 다 필요하다. 이 비대칭이 헷갈리면 SCP + Permission Boundary + Resource Policy + Identity Policy의 평가 순서를 다시 한 번 점검할 가치가 있다.

> 📚 **사례**: 한 미디어 회사가 멀티 계정에서 CodePipeline을 운영하는데, "어떤 PR도 prod 계정의 CodeCommit에 접근 못 하게" 추가 가드레일을 SCP로 만들었다. 그런데 SCP에 `codecommit:GitPull`을 Deny로 박아두고 `NotPrincipal`을 잘못 작성해서 정작 Shared Services의 Pipeline Role까지 차단됐다. 30분간 prod 배포가 막혔다. 교훈: SCP의 Deny + NotPrincipal 조합은 화이트리스트가 까다롭다 — `aws:PrincipalArn` 조건이나 `aws:PrincipalOrgID`로 양성 리스트를 명시하는 게 안전하다.

## CodeCommit Sunset — 2024년 7월 25일 이후의 시험 출제 패턴

2024년 7월 25일 AWS는 CodeCommit의 **신규 고객 가입을 중단**했다. 이 결정은 시험에 미묘한 그림자를 드리운다.

| 사실 | 시험 출제 형태 |
|------|--------------|
| 기존 고객은 신규 리포지토리 생성 포함 정상 사용 가능 | "우리 회사는 CodeCommit을 이미 쓰고 있는데 새 마이크로서비스 리포지토리가 필요하다" → "신규 생성 가능"이 정답 |
| 신규 고객은 가입 불가 | "신규 스타트업이 AWS-native 소스 제어를 원한다" → CodeCommit이 아닌 GitHub + OIDC가 정답 |
| Pro 시험은 여전히 CodeCommit을 빈출로 다룸 | CodeCommit이 보기에 등장하면 "이미 못 쓴다"고 단정하지 말 것 |
| 마이그레이션 시나리오가 점차 늘어남 | CodeCommit → GitHub 미러링, 점진적 전환 패턴이 새로 출제됨 |

> 🔍 **더 깊이**: CodeCommit이 sunset된 이유는 명시되지 않았지만, 업계 추측은 두 가지다. ① GitHub(Microsoft)/GitLab의 시장 점유율 우세로 신규 채택이 정체 ② AWS 내부의 Amazon Q Developer/CodeWhisperer가 GitHub 통합에 우선순위를 두고 있음. 시험은 정치적 배경을 묻지 않지만, **마이그레이션 패턴**(CodeCommit → GitHub Enterprise → OIDC)은 점점 더 자주 출제된다.

> 📚 **사례**: 2024년 하반기 한 대형 금융사가 CodeCommit에서 GitHub Enterprise Cloud로 단계적 마이그레이션을 진행했다. 패턴: ① GitHub repo를 mirror destination으로 추가, EventBridge → Lambda로 모든 push를 양방향 동기화 ② CodePipeline 소스 액션을 단계적으로 GitHub으로 전환 ③ 개발자 도구 체인(Git Credentials → SSH/OIDC) 전환 ④ 마지막에 CodeCommit 저장소를 read-only로 archive. 이 시퀀스가 **dual-write/dual-read 마이그레이션 패턴**의 교과서적 예시다.

## 자동 미러링과 DR — CodeCommit이 native cross-region replication을 안 하는 이유

CodeCommit은 다른 리전으로 자동 복제하지 않는다. 이는 의도된 설계다. Git 자체가 분산 VCS이기 때문에 "복제"는 개발자 클론으로 이미 일어나고 있고, 추가 미러는 운영 영역의 책임이라는 입장이다. 그러나 DR 관점에서는 부족하다 — region 전체 장애 시 CI/CD가 멈춘다.

표준 미러링 패턴은 다음과 같다.

```
[Source Region: ap-northeast-2]
    CodeCommit MyApp
        |
        | EventBridge: referenceUpdated
        v
    Lambda Mirror Function
        |
        | git clone --bare + git push --mirror
        v
[DR Region: us-east-1]
    CodeCommit MyApp-mirror
```

> ⚠️ **함정**: `git push --mirror`는 **모든 refs를 강제 푸시**한다(`refs/heads/*`, `refs/tags/*`, `refs/notes/*` 포함). 만약 mirror destination에 사람이 직접 푸시를 했다면 그 변경이 덮어써질 수 있다. 그래서 미러 destination은 반드시 read-only(Resource Policy로 GitPush 차단)로 설정해야 한다.

> 💡 **관련 이론**: Git의 "분산"이라는 표현은 오해를 부르기 쉽다. Git은 데이터 모델이 분산(merkle DAG)이지만, **워크플로우는 거의 항상 중앙집중**이다(GitHub, GitLab, CodeCommit 등). 진짜 분산 워크플로우(p2p, mesh)는 Linux 커널 같은 극소수만 쓴다. 따라서 "분산이니까 복제 자동" 가정은 깨진다 — 중앙 호스트가 죽으면 개발자 로컬 클론은 살아있어도 CI/CD는 멈춘다.

> 📚 **사례**: 한 글로벌 게임사가 us-east-1에 CodeCommit, 같은 리전에 CodePipeline을 두고 운영하다가 2021년 us-east-1 IAM/STS 장애 시간에 모든 배포가 막혔다. 사후 분석으로 ① CodeCommit을 us-west-2에 미러 ② CodePipeline도 us-west-2에 동일 구성, EventBridge cross-region target으로 둘을 연결 ③ Route 53 health check로 active/passive 페일오버 결정. 이 구조 도입 후 다음 us-east-1 장애에서 평균 8분 RTO로 us-west-2 배포 라인이 자동 active 전환됐다.

## CodeCommit + CodeGuru Reviewer — 코드 리뷰의 자동화 계층

CodeGuru Reviewer는 ML 기반으로 PR을 분석해 자동 코멘트를 다는 서비스다. CodeCommit 저장소를 Associate하면 PR 생성 시점에 자동 분석이 시작된다.

| Reviewer 기능 | 대상 | 시험 포인트 |
|--------------|------|------------|
| **Code Quality** | 함수 길이, 복잡도, race condition, resource leak | OWASP/CWE 일부 커버 |
| **Security Detector** | hardcoded secret, SQL injection 패턴, weak crypto | Java/Python/JavaScript |
| **CodeGuru Profiler 연계** | 런타임 데이터로 hotspot 식별 | 별도 통합 필요 |

> 🔍 **더 깊이**: 2024년부터 CodeGuru Reviewer는 사실상 Amazon Q Developer Code Review로 통합되는 흐름이다. Pro 시험은 여전히 "CodeGuru Reviewer 연결" 보기를 묻지만, 실무에서는 Amazon Q가 점차 표준이 되고 있다. 시험에서는 "PR 자동 분석" 시 CodeGuru Reviewer를 정답으로 고르되, **2025년 이후 자료에서 Amazon Q Developer가 동일 역할로 등장**할 수 있다는 점을 알아두면 좋다.

## 시험에서 자주 묻는 함정과 시나리오 패턴

> 🎯 **시나리오**: 한 회사가 "Production 브랜치(`main`)에 직접 push를 금지하고 PR + 2명 승인만 허용"하려 한다. 답으로 가장 적합한 것은? (a) IAM Policy로 `codecommit:GitPush` Deny + Resource ARN을 main 브랜치로 (b) Approval Rule Template 만들어 main 대상 2명 승인 강제 + Resource Policy로 push 차단 (c) Approval Rule Template + IAM Policy에 `codecommit:GitPush` Deny + Condition `codecommit:References` = `refs/heads/main`. 정답은 **c**. CodeCommit은 IAM Policy의 condition key `codecommit:References`로 특정 브랜치 push를 제어할 수 있고, 이걸 Approval Rule과 조합해야 GitHub의 Branch Protection과 동등한 효과가 나온다.

> 🎯 **시나리오**: 한 회사가 "PR을 만들 때마다 자동으로 빌드 + 코드 커버리지를 PR 코멘트로 단다"는 시스템을 만들고 싶다. EventBridge → CodeBuild → 빌드 종료 후 Lambda → CodeCommit `PostCommentForPullRequest` API. 이 패턴에서 EventBridge 규칙이 트리거해야 할 이벤트는? (a) `pullRequestCreated`만 (b) `pullRequestCreated`와 `pullRequestSourceBranchUpdated` 둘 다 (c) `referenceUpdated`. 정답은 **b**. PR이 처음 생성될 때(`Created`)와 PR 안의 소스 브랜치가 업데이트될 때(`SourceBranchUpdated`) 둘 다 빌드가 재실행돼야 PR이 항상 최신 상태로 검증된다.

> ⚠️ **함정 정리**:
> - **함정 1**: IAM User access key를 git에 직접 사용 가능 → 불가능. Git Credentials 또는 GRC/Credential Helper 필요.
> - **함정 2**: Cross-account에 VPC Peering 필요 → 불필요. IAM/Resource Policy + Pipeline의 roleArn으로 충분.
> - **함정 3**: CodeCommit이 자동으로 cross-region 복제 → 안 함. Lambda 미러링이 표준.
> - **함정 4**: Approval Rule Template은 저장소 단위 → 아님. 계정 단위 정의 + 저장소에 association.
> - **함정 5**: 신규 가입 중단됐으니 기존 고객도 신규 repo 못 만듦 → 만들 수 있음.
> - **함정 6**: CodeGuru Reviewer는 별도 IAM Role 필요 없음 → service-linked role 자동 생성되지만 Associate 후 분석 트리거는 PR 이벤트 기반.

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ CodeCommit 인증 4종 — Git Credentials(User 전용), SSH(User 전용), Credential Helper(Role 가능), GRC(SSO/MFA). 시나리오의 사용자 유형이 IAM User인지 Role/페더레이션인지에 따라 답이 갈린다.
2. ⭐ 모든 git 이벤트가 EventBridge에 자동 발행 — 자동화 시작점. Webhook 별도 운영 불필요.
3. ⭐ Approval Rule Template은 계정 단위, association으로 저장소 적용. `ApprovalPoolMembers`는 assumed-role ARN 패턴.
4. ⭐ Cross-account = Resource Policy(A) + Identity Policy(B) + Pipeline Source Action의 roleArn + KMS Key Policy. 4개 중 하나라도 빠지면 실패.
5. ⭐ 2024-07-25 신규 가입 중단, 기존 고객은 신규 repo 생성 포함 정상 사용. 마이그레이션 시나리오 빈출.
6. ⭐ Native cross-region 복제 없음. EventBridge → Lambda → `git push --mirror` 패턴.
7. ⭐ GitHub Actions → AWS는 OIDC + `AssumeRoleWithWebIdentity`가 정답 패턴.

## 📝 연습 문제

**문제 1.** AWS SSO/페더레이션을 쓰는 회사에서 모든 개발자가 MFA를 강제받는다. CodeCommit에 git push를 가능하게 하는 가장 표준적인 방법은?

A) 개발자마다 IAM User를 만들어 HTTPS Git Credentials를 발급하고 OS keychain에 저장해 사용
B) Personal SSH 공개키를 각 개발자 IAM User에 등록하고 `ssh://APKAxxx@` 엔드포인트로 접속
C) git-remote-codecommit(GRC)를 설치하고 `codecommit::region://profile@repo` URL 사용
D) SSO로 받은 임시 Access Key를 환경 변수로 export하고 git이 그대로 사용하게 설정

**정답: C**
해설: 페더레이션/SSO 환경에서는 IAM User가 없거나 사용하지 않으므로 A/B는 부적합. GRC는 매 git 요청을 현재 AWS profile의 자격 증명(SSO 세션 토큰 포함)으로 SigV4 서명하므로 MFA·SSO와 자연스럽게 결합된다. D는 보안 안티패턴이고 SigV4 서명 변환이 별도 필요해 직접 동작 안 함.

---

**문제 2.** EC2 인스턴스에서 CodeCommit으로 git push 하려 한다. 가장 안전하고 표준적인 인증 방식은?

A) IAM User 액세스 키를 ~/.aws/credentials에 저장하고 CLI가 그 자격으로 git을 인증
B) IAM Console에서 발급한 HTTPS Git Credential(username/password)을 인스턴스에 저장해 사용
C) EC2 IAM Role + AWS CLI Credential Helper(HTTPS)
D) Root 사용자의 장기 자격 증명을 환경 변수로 주입해 모든 권한으로 push

**정답: C**
해설: EC2에는 Instance Profile/IAM Role이 표준. Credential Helper가 IMDS에서 임시 자격 증명을 가져와 SigV4 서명으로 git에 주입한다. 정적 키 보관 불필요. B는 IAM Role에 발급 불가하므로 EC2 환경에 어울리지 않음.

---

**문제 3.** Account A의 CodeCommit을 Account B의 CodePipeline이 소스로 쓰려 한다. 다음 중 필수가 아닌 것은?

A) Account A의 CodeCommit Resource Policy에서 Account B의 Pipeline Role을 Principal로 허용
B) Account B의 CodePipeline Source Action에 cross-account 접근용 `roleArn` 지정
C) Account B Pipeline Role의 Identity Policy에 `codecommit:GitPull` 등 CodeCommit 권한 부여
D) 두 계정 VPC 간 Direct Connect 또는 VPC Peering으로 사설 네트워크 경로 구성

**정답: D**
해설: CodeCommit cross-account는 IAM/Resource Policy + roleArn만으로 동작. 네트워크 측면에서 추가 연결 불필요(공용 endpoint + SigV4). KMS 키 정책도 추가로 필요하지만 D는 절대 불필요.

---

**문제 4.** PR이 main 브랜치로 머지되면 자동으로 prod 파이프라인이 시작되어야 한다. 가장 적합한 구성은?

A) EventBridge Rule이 `CodeCommit Repository State Change`의 `event=referenceUpdated`, `referenceName=main`을 캐치 → CodePipeline StartExecution
B) CodeCommit이 머지 시 아티팩트를 S3에 올리고 그 S3 PutObject 이벤트로 파이프라인을 트리거
C) CodeCommit Trigger를 SNS 토픽에 연결하고 파이프라인이 그 토픽을 주기적으로 polling
D) Lambda가 매분 `git log`를 polling해 main의 새 커밋을 감지하면 StartPipelineExecution 호출

**정답: A**
해설: EventBridge가 표준. `pullRequestMergedStatusUpdated`도 사용 가능하지만 main 브랜치 ref 업데이트가 더 일반적이고 squash/rebase 머지에도 일관되게 트리거된다. D는 polling 안티패턴.

---

**문제 5.** "Production main 브랜치에 PR 없이 직접 push를 막아라"는 정책을 IAM/CodeCommit으로 구현하려 한다. 가장 적합한 것은?

A) IAM Policy로 `codecommit:GitPush` Deny + `Condition: codecommit:References = refs/heads/main`을 모든 개발자 Role에 적용
B) Approval Rule Template만 만들어 main 대상 2명 승인을 강제하고 직접 push도 그 룰이 막게 함
C) 저장소 전체를 Resource Policy로 read-only 전환하고 머지는 관리자만 수행하게 함
D) Lambda가 main push 이벤트를 받아 PR 없이 올라온 커밋을 자동으로 사후 revert

**정답: A**
해설: CodeCommit의 IAM condition key `codecommit:References`로 특정 ref(브랜치) 단위 push 차단이 가능. Approval Rule은 PR 머지 시점 승인 강제용이지 직접 push 차단 기능이 아님. 실무에서는 A + Approval Rule Template을 조합한다.

---

**문제 6.** CodeCommit + EventBridge로 PR 생성 시 자동 빌드 시스템을 구축했다. 같은 PR 알림이 가끔 두 번씩 발생한다. 가장 적합한 해결책은?

A) EventBridge 규칙을 삭제 후 재생성해 중복 전달을 유발하던 규칙 상태를 초기화
B) Lambda에서 `pullRequestId + sourceCommit`을 키로 DynamoDB conditional put으로 dedup
C) EventBridge 대신 SNS로 대체해 FIFO 토픽의 중복 제거 기능으로 단일 전달 보장
D) EventBridge 타깃의 retry 정책을 0으로 설정하고 최대 이벤트 수명을 짧게 줄임

**정답: B**
해설: EventBridge는 at-least-once delivery로 중복 가능. 표준 패턴은 consumer 측 idempotency 처리. DynamoDB conditional write가 가장 안전. D는 EventBridge에서 직접 설정 불가능한 옵션.

---

**문제 7.** CodeCommit 저장소를 us-east-1에서 us-west-2로 DR 복제하려 한다. 가장 적합한 패턴은?

A) CodeCommit이 리전 장애에 대비해 자동 cross-region 복제를 제공하므로 추가 작업 불필요
B) EventBridge `referenceUpdated` → Lambda → `git push --mirror`로 타 리전 CodeCommit에 미러
C) 저장소 데이터가 담긴 S3에 Cross-Region Replication을 켜서 us-west-2로 객체를 복제
D) RDS Cross-Region Read Replica로 저장소 메타데이터를 복제해 DR 리전에서 읽기 제공

**정답: B**
해설: CodeCommit native cross-region 미지원. Lambda 미러링이 표준. Mirror destination은 Resource Policy로 push 차단(read-only)해야 데이터 덮어쓰기 방지.

---

**문제 8.** GitHub Actions에서 AWS 리소스에 접근해야 한다. 가장 안전한 인증 방식은?

A) 전용 IAM User를 만들어 장기 Access Key를 GitHub Secrets에 저장하고 90일 주기로 회전
B) 루트 계정의 자격 증명을 GitHub Secrets에 넣어 모든 AWS 리소스에 폭넓게 접근
C) AWS IAM Identity Provider에 GitHub OIDC 등록 + IAM Role trust policy에 `sub=repo:org/repo:ref:refs/heads/main` 조건 → `aws-actions/configure-aws-credentials@v4`로 AssumeRoleWithWebIdentity
D) EC2 인스턴스 한 대를 self-hosted GitHub runner로 등록하고 Instance Profile 권한으로 접근

**정답: C**
해설: OIDC + Role assumption이 표준. 정적 키 없음 → 누출 위험 0. trust policy의 `sub` 조건으로 특정 repo/branch만 허용 가능. A는 키 노출 위험.

---

**문제 9.** Approval Rule Template를 만들어 30개 저장소에 일괄 적용하려 한다. 어떻게 해야 가장 효율적인가?

A) 30개 저장소 각각의 콘솔에서 동일한 승인 룰을 수동 생성하고 변경 시마다 모두 갱신
B) 계정 수준에 Approval Rule Template 1개 생성 → `AssociateApprovalRuleTemplateWithRepository` API를 모든 저장소에 호출(루프 또는 IaC)
C) 승인 정책 파일을 S3에 올려두고 각 저장소가 머지 시 그 파일을 polling해 규칙 평가
D) Step Functions 워크플로로 PR마다 승인 조건을 매번 동적 평가해 머지 허용 여부 결정

**정답: B**
해설: Approval Rule Template은 의도적으로 계정 수준에 정의 + 저장소 association으로 분리됐다. 정확히 이 시나리오를 위한 설계.

---

**문제 10.** CodeCommit이 sunset됐다고 알려져 있다. 우리 회사는 5년 전부터 CodeCommit을 사용 중이고 새 마이크로서비스 repo가 필요하다. 가장 정확한 사실은?

A) 신규 가입 중단으로 기존 사용자도 추가 repo 생성이 막히고 GitHub 마이그레이션이 강제됨
B) 기존 사용자는 신규 repo 생성을 포함해 정상 사용 가능
C) 기존 고객도 신규 repo는 AWS Support 티켓으로 예외 승인을 받아야 생성 가능
D) sunset 정책에 따라 기존 repo가 일정 유예 후 read-only로 자동 전환됨

**정답: B**
해설: 2024-07-25 이후 신규 고객 가입만 중단. 기존 고객은 신규 repo 생성 포함 모든 기능 정상. 시험에서 자주 묻는 미묘한 경계.

---

## 📌 오늘의 요약

CodeCommit의 가치는 "AWS가 만든 Git 호스팅"이라는 외피가 아니라 **Git protocol과 IAM/STS의 결합**이다. 이 결합이 ① 4종의 인증 방식 ② EventBridge 네이티브 이벤트 ③ Approval Rule Template ④ 멀티 계정 Resource Policy 패턴을 모두 가능하게 한다. 2024년 신규 가입 중단 이후 마이그레이션 시나리오가 늘었지만 시험에서는 여전히 빈출 영역이고, GitHub OIDC 페더레이션 패턴이 새로 등장하는 점도 함께 익혀두면 좋다. 내일은 Git 워크플로우 자체(trunk-based vs GitFlow)와 CodeCommit 위에서의 brunch 전략을 더 깊이 본다.
