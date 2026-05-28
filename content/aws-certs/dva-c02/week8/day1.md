# Day 36 - CodeCommit과 CodeBuild: AWS가 그린 CI/CD의 첫 두 칸

CI/CD라는 단어를 처음 만난 개발자들은 보통 "Jenkins 한 번 깔아본 적 있어요" 정도로 시작한다. 그러다가 빌드 서버가 죽거나, 빌드 큐가 밀리거나, 빌드 스크립트가 한 사람의 노트북에서만 돌아가는 상황을 한 번 겪고 나면 "이걸 누군가 대신 해줬으면" 하는 마음이 자연스레 든다. AWS의 Code* 시리즈는 정확히 그 지점을 노린 서비스 묶음이다. CodeCommit이 Git 호스팅을, CodeBuild가 빌드 실행을, CodePipeline이 흐름 오케스트레이션을, CodeDeploy가 배포를 맡는다. 이번 글은 그 4단 파이프라인의 앞쪽 두 칸 — 소스 보관과 빌드 실행 — 을 깊이 들여다본다.

DVA-C02 시험에서 이 두 서비스가 차지하는 비중은 적지 않다. 시험은 더 이상 CodeCommit의 신규 가입을 받지 않는 2024년 7월 이후 정책을 알면서도, 여전히 동작 원리·인증 방식·buildspec.yml 문법을 지속적으로 묻는다. 이유는 단순하다 — AWS의 IAM 통합 Git 모델과 buildspec.yml 단계 구조는 시험 합격 이후 GitHub Actions·GitLab CI·Bitbucket Pipelines 등 어디로 가도 거의 같은 개념으로 재사용되는 표준 어휘이기 때문이다.

## CodeCommit이 풀려고 한 문제

2015년 7월 CodeCommit이 출시됐을 때, GitHub Enterprise는 self-hosted 라이선스 가격이 사용자당 연 $250에 육박했고 GitLab은 막 self-hosted 시장에 진입하던 시기였다. AWS가 보기에 "기업 내부 코드를 외부 SaaS에 두는 게 컴플라이언스상 곤란하다"는 금융·공공·헬스케어 고객이 분명히 존재했다. CodeCommit은 "AWS 계정 안에서, IAM으로 인증하고, KMS로 암호화하고, CloudTrail로 감사 로그가 남는 Git 저장소"를 약속하며 등장했다.

핵심 가치 제안은 세 가지였다. ① **무한 확장**: 저장소 크기·파일 수 제한이 (사실상) 없다. ② **IAM 통합**: 별도 사용자 시스템 없이 기존 IAM 정책으로 push/pull 권한 제어. ③ **자동 암호화**: 전송(HTTPS/SSH) + 저장(KMS) 양쪽 모두 기본 활성화.

> 💡 **관련 이론**: Git 프로토콜은 원래 SSH·HTTPS·git:// 세 가지 wire protocol을 지원한다. CodeCommit은 git:// (port 9418)을 의도적으로 막았다. 이유는 git:// 가 **인증과 암호화를 모두 제공하지 않는** 평문 프로토콜이기 때문이다. Linus Torvalds가 git을 만들 때 LAN 환경에서 빠른 read-only 미러링을 위해 설계한 이 프로토콜은 클라우드 환경에서는 보안 모델이 깨진다. CodeCommit이 SSH + HTTPS(SigV4) 두 가지만 지원하는 건 이런 위협 모델 분석의 결과다.

> 🔍 **더 깊이**: CodeCommit의 IAM 통합은 단순히 "사용자가 IAM에 있다"가 아니라 **각 git operation(push, pull, branch 생성)이 IAM action에 1:1로 매핑된다**는 의미다. 예를 들어 `git push origin main`은 내부적으로 `codecommit:GitPush` action을 호출하고, 여기에 `aws:ResourceTag/branch=main` 조건을 걸면 특정 사용자가 main 브랜치에 직접 push 못 하게 막을 수 있다. GitHub의 branch protection rule보다 한 단계 더 IAM 레이어에서 강제할 수 있다는 점이 차별점이었다.

```bash
# IAM 정책으로 main 브랜치 직접 push 차단
{
  "Effect": "Deny",
  "Action": "codecommit:GitPush",
  "Resource": "arn:aws:codecommit:ap-northeast-2:111122223333:my-repo",
  "Condition": {
    "StringEqualsIfExists": {
      "codecommit:References": ["refs/heads/main"]
    },
    "Null": {
      "codecommit:References": false
    }
  }
}
```

그러나 2024년 7월 25일, AWS는 CodeCommit의 **신규 고객 가입을 중단**했다. 기존 고객은 계속 쓸 수 있고 시험에도 여전히 출제되지만, AWS가 사실상 시장 경쟁에서 후퇴를 선언한 셈이다. GitHub(2018년 Microsoft 인수), GitLab의 SaaS 점유율 확대, 그리고 GitHub Actions가 CI까지 흡수하면서 "Git 호스팅만 따로 하는 서비스"의 수요가 줄어든 것이 배경이다.

> 📚 **사례**: AWS 공식 발표에서 명시적으로 언급되진 않았지만, AWS 내부 팀들도 GitHub Enterprise Cloud로 옮긴 것으로 알려져 있다. re:Invent 2023 keynote에서 CodeCatalyst라는 새 통합 DevOps 플랫폼을 발표했는데, 이 플랫폼이 사실상 CodeCommit + CodeBuild + CodePipeline + Cloud9의 후계자 역할을 노리고 있다. 시험에는 아직 CodeCatalyst가 본격 출제되지 않지만 곧 들어올 가능성이 높다.

## CodeCommit의 세 가지 인증 방식

CodeCommit으로 git을 쓰려면 인증을 통과해야 한다. 세 가지 방식이 있고, 시험에 매번 헷갈리게 나오므로 차이를 정리해두자.

| 방식 | 자격 증명 형태 | 갱신 주기 | 적합 사용처 |
|------|---------------|----------|-------------|
| **SSH 공개키** | IAM 사용자에 등록한 SSH public key | 영구 (개발자가 키 교체) | 개인 개발자 워크스테이션 |
| **Git Credentials** (HTTPS) | IAM 사용자별 생성한 username/password | 영구 (IAM에서 비활성화 시까지) | 사용자별 2쌍 한도, 간단한 GUI 클라이언트 |
| **AWS Credential Helper** (HTTPS) | IAM access key → 매 요청마다 SigV4 서명 | 매 git operation마다 갱신 | EC2/Lambda/CodeBuild 등 인스턴스 역할 사용 |

> ⚠️ **함정**: "CodeCommit에 사용자명/비밀번호로 직접 로그인할 수 있는가?"라는 질문에 답이 No인 이유가 여기 있다. HTTPS Git Credentials는 **IAM이 발급한** 별도의 username/password이지 IAM 콘솔 로그인용 비밀번호가 아니다. 즉 IAM 사용자에게 "콘솔 패스워드만 있고 Git Credentials 발급 안 함"이면 Git push 불가. 시험에서 D) "사용자명/비밀번호 직접 입력" 같은 보기는 거의 항상 오답이다.

```bash
# 1) SSH 방식
ssh-keygen -t ed25519 -C "dev@example.com"
# 생성된 public key를 IAM 사용자 → Security credentials → SSH keys for AWS CodeCommit 에 업로드
# 반환된 SSH Key ID(예: APKAEIBAERJR2EXAMPLE)를 SSH config에 매핑

# ~/.ssh/config
Host git-codecommit.*.amazonaws.com
  User APKAEIBAERJR2EXAMPLE
  IdentityFile ~/.ssh/codecommit_rsa

git clone ssh://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/my-repo

# 2) Credential Helper (EC2/CodeBuild에서 자주 씀)
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true
git clone https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/my-repo
# 내부적으로 aws-cli가 SigV4 서명을 만들어 매번 새로운 임시 비밀번호처럼 git에 전달
```

> 🔍 **더 깊이**: Credential Helper의 동작은 SigV4 서명 그 자체다. git이 HTTPS basic auth 헤더로 username/password를 보낼 때, helper는 username을 IAM access key ID로, password를 `AWS4-HMAC-SHA256` 알고리즘으로 만든 서명 문자열로 채워 넣는다. 서명에는 timestamp가 포함되므로 매 요청마다 다른 password가 만들어진다. 이게 EC2 인스턴스 프로파일이나 Lambda 실행 역할로 CodeCommit에 자동 접근 가능한 비결이다 — 임시 자격 증명이 회전돼도 helper가 매번 새로 서명한다.

## CodeBuild의 내부 구조: Docker 위에 빌드 환경 만들기

CodeBuild는 한 마디로 "buildspec.yml에 적힌 명령어를, AWS가 띄워주는 컨테이너 안에서, 빌드가 끝나면 사라지는 방식으로 실행"하는 서비스다. 그 한 마디 안에 몇 가지 설계 결정이 숨어 있다.

첫째, **각 빌드는 fresh container에서 실행**된다. 빌드 호스트를 재사용하면 의존성 캐시는 빠르지만 환경 오염(다른 빌드가 남긴 파일, 환경변수)이 발생한다. CodeBuild는 격리를 우선시해 매 빌드마다 새 컨테이너를 부팅한다. 그 대가가 startup latency(보통 10-30초)다. Jenkins agent의 "long-running worker" 모델과 정반대다.

둘째, **빌드 이미지는 AWS managed image 또는 custom ECR 이미지**다. AWS managed는 Amazon Linux 2 / Ubuntu 기반으로 주요 런타임(Node, Python, Java, Go, .NET, Docker 등)이 미리 깔려 있다. Custom 이미지를 쓰면 ECR에서 pull 받아 빌드 시작 — 이 pull 시간이 추가되므로 작은 base image 선택이 중요하다.

셋째, **컴퓨팅 옵션이 매우 다양하다**.

| Compute Type | vCPU | Memory | 디스크 | 시간당 가격(대략) |
|--------------|------|--------|--------|------------------|
| BUILD_GENERAL1_SMALL | 3 | 3GB | 64GB | $0.005 |
| BUILD_GENERAL1_MEDIUM | 4 | 7GB | 128GB | $0.01 |
| BUILD_GENERAL1_LARGE | 8 | 15GB | 128GB | $0.02 |
| BUILD_GENERAL1_2XLARGE | 72 | 145GB | 824GB | $0.20 |
| BUILD_LAMBDA_*** (2023~) | 1-10 | 1-10GB | 임시 | 매우 저렴 |

> 💡 **관련 이론**: CodeBuild가 2023년 말 발표한 **Lambda-based compute** 옵션은 빌드 startup을 1초 미만으로 단축한다. 내부적으로는 Lambda의 Firecracker microVM 위에서 빌드 컨테이너를 띄우는 방식이다. Firecracker는 AWS가 2018년 오픈소스화한 microVM 모니터로, KVM 위에서 가상머신을 100ms 안에 부팅하도록 만들어졌다(Lambda·Fargate 내부에서 사용). 빌드처럼 "짧고 자주 발생하는" 작업에 ideal한 격리 단위다. 단점은 메모리 상한과 디스크 제한이 있어 대형 모노레포 빌드에는 안 맞는다는 점.

> 🔍 **더 깊이**: CodeBuild는 빌드 컨테이너에서 Docker를 쓰려면 `privileged: true` 플래그를 켜야 한다. 이건 컨테이너 안에서 또 컨테이너를 띄우는 **Docker-in-Docker**(DinD) 패턴인데, 보안 격리가 한 단계 약해진다(컨테이너 안에서 호스트 디바이스 접근 가능). 빌드 후 Docker 이미지를 ECR에 push할 때 흔히 쓰는 패턴이지만, AWS는 대신 **kaniko**나 **buildah**처럼 daemon-less 빌더 사용을 권장한다.

## buildspec.yml: CI 파이프라인의 헌법

buildspec.yml은 CodeBuild의 모든 동작을 정의한다. 시험에서 가장 자주 묻는 부분이 phase 순서와 각 phase의 책임이다.

```yaml
version: 0.2   # 현재 유일한 안정 버전 (0.1은 deprecated)

env:
  variables:
    NODE_ENV: production
  parameter-store:
    GITHUB_TOKEN: /myapp/github/token    # SSM에서 평문/SecureString
  secrets-manager:
    DOCKER_REGISTRY_PW: prod/docker:password    # JSON 키 지정 가능
  exported-variables:
    - IMAGE_TAG    # 후속 CodePipeline 스테이지로 전달

phases:
  install:
    runtime-versions:
      nodejs: 20
      docker: 24
    commands:
      - npm ci

  pre_build:
    commands:
      - echo "Login to ECR"
      - aws ecr get-login-password | docker login --username AWS --password-stdin $REPO_URI
      - export IMAGE_TAG=$(git rev-parse --short HEAD)
      - npm test -- --reporters=default --reporters=jest-junit

  build:
    commands:
      - docker build -t $REPO_URI:$IMAGE_TAG .
      - docker push $REPO_URI:$IMAGE_TAG

  post_build:
    commands:
      - printf '[{"name":"app","imageUri":"%s"}]' $REPO_URI:$IMAGE_TAG > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yml
    - taskdef.json
  discard-paths: yes

reports:
  jest_reports:
    files:
      - 'junit.xml'
    file-format: JUNITXML

cache:
  paths:
    - 'node_modules/**/*'
    - '/root/.npm/**/*'
```

각 phase의 책임을 명확히 분리하는 게 좋은 패턴이다.

| Phase | 책임 | 실패 시 동작 |
|-------|------|-------------|
| `install` | 런타임 + OS 패키지 설치 | 빌드 실패, 후속 phase skip |
| `pre_build` | 인증, 변수 export, 정적 검증, 단위 테스트 | 빌드 실패, build/post_build skip |
| `build` | 실제 컴파일·번들링·이미지 빌드 | 빌드 실패, post_build는 **여전히 실행됨** |
| `post_build` | 푸시, 태그, 슬랙 알림, artifact 메타데이터 생성 | 빌드 실패로 마킹 |

> ⚠️ **함정**: `build` phase가 실패해도 `post_build`는 실행된다는 점은 시험에 한 번씩 나온다. 이 동작 덕분에 "빌드 실패 시 슬랙 알림"을 `post_build`에서 처리할 수 있지만, 반대로 "build 성공 가정"으로 짠 push 명령이 잘못 동작할 수 있다. `post_build`에서는 반드시 `CODEBUILD_BUILD_SUCCEEDING` 환경변수(0/1)를 체크해 분기하는 게 안전한 패턴이다.

```bash
# post_build에서 안전한 분기
- |
  if [ "$CODEBUILD_BUILD_SUCCEEDING" = "1" ]; then
    aws sns publish --topic-arn $TOPIC --message "Build OK: $CODEBUILD_BUILD_ID"
  else
    aws sns publish --topic-arn $TOPIC --message "Build FAILED: $CODEBUILD_BUILD_ID"
  fi
```

> 💡 **관련 이론**: buildspec.yml의 phase 모델은 GNU Make의 target 의존성 그래프나 Apache Maven의 빌드 라이프사이클(validate → compile → test → package → install → deploy)과 같은 계보다. "단계를 명시적으로 나눠 각 단계의 산출물과 책임을 분리"하는 사고방식은 1977년 Stuart Feldman이 Bell Labs에서 만든 make 이후 거의 변하지 않았다. GitHub Actions의 jobs/steps, CircleCI의 stages도 같은 모델이다.

## 환경변수와 비밀의 안전한 주입

buildspec.yml에 평문으로 적힌 모든 것은 빌드 로그에 노출될 위험이 있다. CodeBuild는 세 가지 변수 소스를 지원한다.

| 소스 | 안전성 | 회전 | 시험 키워드 |
|------|--------|------|-------------|
| `variables` (평문) | 낮음 | 수동 | 일반 설정값, 환경 구분 |
| `parameter-store` | SecureString 사용 시 안전 | 수동 또는 Lambda 자동화 | 비밀번호, API key |
| `secrets-manager` | 안전 | 자동 회전 지원 | DB 자격증명, OAuth token |

```yaml
env:
  parameter-store:
    DB_HOST: /myapp/db/host           # 평문 String 파라미터
    DB_PASSWORD: /myapp/db/password   # SecureString → KMS 복호화
  secrets-manager:
    OAUTH: prod/google-oauth:client_secret    # JSON에서 특정 필드만
```

> 🔍 **더 깊이**: `secrets-manager`에서 콜론 뒤에 키를 지정하면 JSON 시크릿의 특정 필드만 추출한다. 예를 들어 시크릿이 `{"username":"admin","password":"abc123"}`이면 `myapp:password`로 password만 가져온다. 추가 `:AWSCURRENT:1` 같은 stage·version 지정도 가능. 이 문법은 시험엔 안 나오지만 실무에서 흔히 쓰인다.

> ⚠️ **함정**: CodeBuild 빌드 로그에는 환경변수가 보통 마스킹되지만, `echo $SECRET` 같은 명령을 실수로 실행하면 그대로 찍힌다. 또 빌드 산출물(artifact zip) 안에 환경변수가 들어간 파일이 포함되면 S3에 그대로 올라간다. AWS는 빌드 종료 후 로그를 CloudWatch Logs에 영구 저장하므로, 한 번 노출된 비밀은 사실상 회전이 유일한 대응책이다.

## VPC 통합과 네트워크 격리

기본 CodeBuild 컨테이너는 AWS managed VPC에서 실행돼 인터넷 outbound는 자유롭지만 사용자 VPC의 사설 리소스(예: 사설 서브넷 RDS, 사내 NAS)에는 접근할 수 없다. 사설 리소스 접근이 필요하면 CodeBuild를 **VPC 모드**로 띄운다.

```bash
aws codebuild create-project \
  --name my-build \
  --vpc-config "vpcId=vpc-xxx,subnets=subnet-aaa,subnet-bbb,securityGroupIds=sg-xxx" \
  ...
```

VPC 모드의 trade-off: 인터넷 outbound가 사라지므로 NAT Gateway나 VPC Endpoint를 통한 명시적 라우팅이 필요하다. ECR pull, S3 artifact upload, CloudWatch Logs send, Secrets Manager fetch까지 모두 endpoint를 만들어야 한다. 빌드 startup도 ENI(Elastic Network Interface) 프로비저닝 때문에 30초~1분 더 걸린다.

> 📚 **사례**: 한 금융 고객 사례. 사내 정책상 빌드 호스트가 외부 npm 레지스트리에 직접 접근할 수 없어, CodeArtifact에 upstream으로 npmjs.org를 등록하고 VPC endpoint를 통해 CodeArtifact만 접근하도록 구성했다. 결과: 빌드 환경의 모든 npm install이 사내 감사 로그에 남고, 외부 패키지 무단 도입이 차단됐다. CodeBuild의 VPC 모드 + CodeArtifact 조합이 supply chain security의 한 패턴.

## 빌드 캐시: 시간을 사는 가장 빠른 방법

`npm ci`나 `pip install`이 빌드 시간의 70%를 차지하는 경우가 흔하다. CodeBuild는 세 가지 캐시 모드를 지원한다.

| 모드 | 저장 위치 | 공유 범위 | 적합성 |
|------|----------|----------|--------|
| **NO_CACHE** | - | - | 일회성 빌드, 보안 민감 |
| **LOCAL** | 빌드 호스트 디스크 | 같은 빌드 프로젝트의 후속 빌드 (호스트 재사용 시) | 가까운 시간 내 반복 빌드 |
| **S3** | 사용자 S3 버킷 | 모든 빌드 영구 공유 | 분기·시간 무관 빌드 가속 |

LOCAL 모드는 다시 세 가지 하위 옵션이 있다.

- `DOCKER_LAYER_CACHE`: Docker 이미지 빌드의 layer 캐시. `privileged: true` 필요.
- `SOURCE_CACHE`: git 메타데이터 캐시. shallow clone 효과.
- `CUSTOM_CACHE`: `cache.paths`에 지정한 경로.

> 🔍 **더 깊이**: LOCAL 캐시는 "같은 빌드 호스트가 재할당될 때만" 작동하는데, CodeBuild는 빌드 종료 후 호스트를 일정 시간 warm pool에 유지하다 재사용한다. 즉 빌드가 자주 발생하는 프로젝트는 LOCAL 캐시 hit율이 높고, 한가한 프로젝트는 거의 매번 miss다. 24/7 production CI/CD에는 LOCAL이 충분하지만, 야간/주말에만 도는 빌드라면 S3 캐시가 더 안정적이다.

## CodeCommit Triggers vs Notifications

CodeCommit에서 이벤트가 발생했을 때 알리는 방법은 두 가지다.

| 구분 | Triggers | Notifications |
|------|----------|---------------|
| 대상 | SNS, Lambda 직접 호출 | EventBridge → SNS, AWS Chatbot(Slack/Chime) |
| 필터링 | 브랜치·경로 매칭 | 이벤트 유형(PR 생성, 코멘트, push 등) |
| 한도 | 저장소당 10개 | 사실상 무제한 |
| 출시 시기 | 초기부터 존재 | 2019 (Notifications 통합 후) |
| 시험 키워드 | "특정 브랜치 push 시 Lambda 호출" | "PR 생성·코멘트·머지 Slack 알림" |

> ⚠️ **함정**: 시험에서 "PR이 생성됐을 때 슬랙 채널에 알림"이 나오면 Triggers가 아니라 **Notifications + AWS Chatbot**이 정답이다. Triggers는 SNS/Lambda만 지원하므로 Slack에 가려면 한 단계 Lambda를 거쳐 webhook을 호출해야 한다. Notifications는 Chatbot 통합으로 Slack/Chime을 네이티브로 지원한다.

## 다른 CI 서비스와의 비교

| 차원 | CodeBuild | GitHub Actions | GitLab CI | Jenkins |
|------|-----------|----------------|-----------|---------|
| 호스팅 모델 | 완전 관리형 | SaaS 또는 self-hosted runner | SaaS 또는 self-hosted runner | self-hosted (또는 CloudBees SaaS) |
| 가격 모델 | 빌드 분 단위 | 분 단위 (퍼블릭 무료) | 분 단위 (제한적 무료) | 라이선스 무료, 인프라 비용 |
| 빌드 정의 | buildspec.yml | .github/workflows/*.yml | .gitlab-ci.yml | Jenkinsfile |
| IAM 통합 | 네이티브 | OIDC로 AWS 임시 자격증명 | OIDC | 플러그인 |
| 마켓플레이스 | 제한적 | 매우 활발 (Actions Marketplace) | 활발 | Plugin 13,000+ |
| 빌드 격리 | 매 빌드 fresh container | 매 잡 fresh runner | 매 잡 fresh runner | 워커 재사용 가능 |

> 💡 **관련 이론**: GitHub Actions의 부상으로 CodeBuild의 시장 지분은 줄었지만, **AWS 리소스를 빌드 도중 광범위하게 만지는** 워크플로(ECR push, CodeDeploy 배포, CloudFormation 스택 변경)에서는 IAM 통합이 훨씬 매끄러운 CodeBuild가 여전히 우위다. 2022년부터 GitHub Actions가 OIDC로 IAM 임시 자격증명을 받을 수 있게 되면서 격차가 줄어들고 있는 중.

## CLI로 만져보기

```bash
# 1) CodeCommit 저장소 생성 (기존 고객만)
aws codecommit create-repository \
  --repository-name my-app \
  --repository-description "Sample app"

# 2) CodeBuild 프로젝트 생성
aws codebuild create-project \
  --name my-app-build \
  --source type=CODECOMMIT,location=https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/my-app \
  --artifacts type=S3,location=my-artifact-bucket \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL \
  --service-role arn:aws:iam::111122223333:role/CodeBuildServiceRole

# 3) 빌드 시작
aws codebuild start-build --project-name my-app-build

# 4) 빌드 로그 실시간 tail (CloudWatch Logs)
aws logs tail /aws/codebuild/my-app-build --follow
```

## 정리하며

CodeCommit이 풀려던 문제는 "엔터프라이즈 환경에 맞는 IAM 통합 Git"이었고, 그 가치는 여전히 유효하지만 시장의 흐름은 GitHub로 옮겨갔다. CodeBuild가 풀려던 문제는 "빌드 인프라를 직접 관리하지 않고 buildspec 한 장으로 끝내는 CI"였고, 이쪽은 AWS 리소스와 깊이 통합하는 워크로드에서는 지금도 합리적인 선택이다.

다음 글에서는 이 두 칸 뒤에 붙는 **CodeDeploy**와 **CodePipeline**을 본다. 빌드 결과물을 EC2·Lambda·ECS로 어떻게 안전하게 흘려보내는지, blue/green과 canary가 어떻게 다르게 구현되는지, 그리고 파이프라인 자체를 코드로 관리하는 패턴까지 짚는다.

---

## 📝 연습 문제

**문제 1.** CodeCommit의 인증에 사용할 수 없는 방법은?

A) SSH 키
B) HTTPS Git 자격 증명
C) AWS Credential Helper (SigV4)
D) IAM 콘솔 로그인 비밀번호 직접 입력

**정답: D**

해설: CodeCommit은 SSH 공개키, HTTPS Git Credentials(IAM이 별도 발급한 username/password), AWS Credential Helper(SigV4 매 요청 서명) 세 가지를 지원한다. IAM 콘솔 로그인용 비밀번호는 git 인증에 사용할 수 없다 — Git Credentials는 콘솔 비밀번호와 별개로 발급해야 한다. 이게 "사용자명/비밀번호 직접 입력"이 오답인 이유다. EC2/Lambda 등 인스턴스 환경에서는 C) Credential Helper가 가장 적합한데, 인스턴스 프로파일의 임시 자격증명으로 매 요청마다 SigV4 서명을 만든다.

---

**문제 2.** buildspec.yml의 phase 중 **build 단계가 실패한 후에도 실행되는** 단계는?

A) install
B) pre_build
C) build
D) post_build

**정답: D**

해설: CodeBuild는 install/pre_build/build 중 어느 단계가 실패하면 후속 단계를 건너뛰지만, `post_build`는 **build가 실패해도 반드시 실행**된다. 이 동작은 빌드 실패 알림이나 정리 작업을 post_build에 넣을 수 있게 의도된 설계다. 단 post_build에서 push/배포 명령을 "build 성공 가정"으로 짜면 잘못된 산출물을 배포할 수 있으므로 `CODEBUILD_BUILD_SUCCEEDING` 환경변수(0/1)로 분기하는 게 안전 패턴이다. 시험에 한 번씩 나오는 미세한 동작 차이.

---

**문제 3.** Lambda 함수가 burst 트래픽 시 CodeBuild를 트리거하는 워크로드가 있다. 빌드마다 컨테이너 부팅 10~30초가 누적돼 비용·시간 모두 부담된다. 가장 적합한 해결책은?

A) 더 큰 BUILD_GENERAL1_2XLARGE로 변경
B) BUILD_LAMBDA compute type으로 변경
C) Local cache를 활성화
D) 빌드 컨테이너에 privileged: true 설정

**정답: B**

해설: 2023년 말 도입된 BUILD_LAMBDA compute type은 Firecracker microVM 기반으로 빌드 startup을 1초 미만으로 단축한다. 짧고 자주 발생하는 빌드 워크로드(예: PR 검증, lint 체크)에 ideal. A) 큰 인스턴스는 startup이 더 느려질 수 있고 비용도 폭증. C) Local cache는 호스트 재사용 시 의존성 캐시만 도움이 되지 startup 자체를 줄이진 못함. D) privileged 모드는 Docker-in-Docker 위한 옵션으로 본 문제와 무관. 단 Lambda compute는 디스크·메모리 상한이 있어 대형 모노레포 빌드에는 부적합.

---

**문제 4.** CodeBuild 프로젝트에서 DB 접속 비밀번호를 빌드 중에 사용해야 한다. 가장 안전한 방법은?

A) buildspec.yml에 평문 변수로 적기
B) CodeBuild 프로젝트의 환경변수(Plaintext)로 설정
C) Secrets Manager에 저장하고 `secrets-manager:` 키로 참조
D) S3에 텍스트 파일로 두고 빌드 중 다운로드

**정답: C**

해설: Secrets Manager는 ① KMS 자동 암호화 ② 자동 회전(RDS, Redshift, DocumentDB 네이티브 지원) ③ CloudTrail 감사 ④ JSON 시크릿의 특정 필드만 추출(`mysecret:password` 문법)을 모두 제공한다. SSM Parameter Store SecureString도 비슷한 보호를 제공하지만 자동 회전은 Secrets Manager의 강점. A) 평문은 git 저장소에 비밀이 영구 기록되는 최악의 안티패턴. B) Plaintext 환경변수는 콘솔에서 노출. D) S3 파일은 bucket policy 누락 시 노출 위험 + 회전 자동화 없음.

---

**문제 5.** CodeBuild 프로젝트가 사설 서브넷의 RDS 인스턴스에 접속해 마이그레이션 스크립트를 실행해야 한다. 추가로 필요한 구성은?

A) 추가 구성 불필요 (CodeBuild는 기본적으로 모든 VPC 접근 가능)
B) CodeBuild 프로젝트를 VPC 모드로 전환하고 적절한 subnet + security group 지정
C) RDS를 public으로 변경
D) Lambda를 거쳐 RDS에 접근

**정답: B**

해설: 기본 CodeBuild는 AWS managed VPC에서 실행돼 사용자 VPC 사설 리소스에 접근 불가. VPC 모드로 전환하면 지정 subnet에 ENI가 만들어져 사설 리소스 접근 가능. 단 trade-off: ① ENI 프로비저닝으로 startup +30s~1m ② 인터넷 outbound 사라짐 → ECR/S3/CloudWatch Logs/Secrets Manager 각각 VPC endpoint 필요 ③ NAT Gateway 없으면 외부 패키지 다운로드 불가. C) RDS public 노출은 보안 안티패턴. D) Lambda 우회는 불필요한 복잡성. 시험에 "CodeBuild가 사설 리소스 접근"이 나오면 VPC 모드가 정답.

---

**문제 6.** CodeCommit에서 Pull Request가 생성될 때마다 Slack 채널에 알림을 보내려 한다. 가장 적합한 구성은?

A) CodeCommit Triggers → Slack Incoming Webhook
B) CodeCommit Notifications → AWS Chatbot → Slack
C) CodeCommit Triggers → SNS → Slack 이메일 구독
D) CloudWatch Events → Slack 직접 호출

**정답: B**

해설: CodeCommit Notifications는 EventBridge 기반으로 풍부한 이벤트 필터링(PR 생성, 코멘트, 머지, push 등)을 제공하고 AWS Chatbot이 Slack/Chime을 **네이티브 통합**한다. 별도 Lambda 없이 채널에 메시지가 보내진다. A) Triggers는 SNS/Lambda만 지원하므로 Slack에 가려면 추가 Lambda + webhook 코드가 필요해 비효율. C) SNS 이메일 구독은 Slack 채널이 아닌 개인 이메일로 가는 방식. D) CloudWatch Events에서 Slack 직접 호출은 불가능. 시험에서 "Slack 알림 + 최소 코드"가 보이면 Notifications + Chatbot이 정답.

---

**문제 7.** buildspec.yml v0.2에서 후속 CodePipeline 스테이지로 변수를 전달하려 한다. 어떤 항목을 사용해야 하는가?

A) `env.variables`
B) `env.exported-variables`
C) `artifacts.files`
D) `phases.post_build.commands`에서 SSM에 저장

**정답: B**

해설: `exported-variables`에 나열된 변수는 빌드 종료 시 CodePipeline의 다음 스테이지에서 `#{BuildVariables.VAR_NAME}` 문법으로 참조 가능하다. 빌드 중 동적으로 결정된 값(예: `IMAGE_TAG=$(git rev-parse --short HEAD)`)을 deploy 스테이지로 전달할 때 표준 패턴. A) variables는 단순 정적 변수 정의. C) artifacts는 파일 산출물 전달용이지 변수 전달용 아님. D) SSM 저장도 가능하지만 후속 스테이지에서 별도 권한과 fetch 로직이 필요해 비효율. 시험에서 "CodeBuild → CodeDeploy/CodePipeline 변수 전달"이 보이면 exported-variables.
