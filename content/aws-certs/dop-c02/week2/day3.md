# Day 3 - CodeArtifact + 외부 레지스트리 프록시

📅 날짜: Week 2 (Day 3)
🎯 주제: 관리형 패키지 저장소와 공급망(Supply Chain) 보안
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CodeArtifact의 Domain/Repository 계층 구조를 이해한다
- npm/Maven/PyPI/NuGet/Generic 5개 패키지 형식 지원의 의미를 안다
- Upstream 저장소로 공용 레지스트리를 프록시·캐시하는 패턴을 익힌다
- 권한 모델(Domain Policy, Repository Policy, IAM)을 구분한다
- 공급망 공격(typosquatting, dependency confusion) 대응 전략을 안다

---

## 🧩 사전 지식 (CS 기초)

- **Package Registry**: 라이브러리·의존성을 저장·배포하는 서비스 (npmjs.com, Maven Central, PyPI 등).
- **Supply Chain Attack**: 의존 패키지를 통해 침투하는 공격 (SolarWinds, Codecov, log4shell).
- **Typosquatting**: `requests` → `requets` 같은 오타 패키지로 사용자 속이기.
- **Dependency Confusion**: 내부 패키지 이름을 공용 레지스트리에 더 높은 버전으로 게시 → 빌드가 공용을 선택.
- **Semantic Versioning (SemVer)**: MAJOR.MINOR.PATCH 규칙.
- **Lock file**: `package-lock.json`, `requirements.txt`, `Gemfile.lock` — 재현 가능 빌드의 핵심.
- **SBOM (Software Bill of Materials)**: 소프트웨어 구성요소 목록. 공급망 감사용.

---

## 📖 이론 내용

### 1. CodeArtifact 구조

```
Domain (조직 단위)
├── Repository A (예: production)
│   ├── Package 1 (npm)
│   ├── Package 2 (maven)
│   └── ...
├── Repository B (예: development)
└── Repository C (예: shared)
```

- **Domain**: 여러 Repository의 부모. 단일 KMS 키, 단일 청구. **자산 중복 제거**의 단위 (같은 패키지가 여러 Repo에 있어도 한 번만 저장).
- **Repository**: 패키지 그룹. 권한·Upstream 설정의 단위.
- **Package Format**: npm, Maven, PyPI(Python), NuGet(.NET), Generic(any binary), Ruby, Swift, Cargo(Rust), Docker(별도, ECR 사용)

### 2. Upstream 저장소 패턴

Repository에 Upstream을 연결하면, 요청된 패키지가 없을 때 Upstream에서 가져와 자동 캐시.

```
Build Tool (npm install lodash)
    ↓
[CodeArtifact: my-repo]
    ↓ (없으면)
[CodeArtifact: npm-public-cache (외부 연결)]
    ↓
[npmjs.com]
```

- 처음 한 번 외부에서 가져오면 이후엔 캐시 사용
- 외부 레지스트리 장애 시에도 빌드 가능
- 패키지가 외부에서 삭제돼도 캐시본 유지 (left-pad 사고 방지)
- **External Connection**: `public:npmjs`, `public:maven-central`, `public:pypi`, `public:nuget-org`, `public:ruby-gems-org`

### 3. 권한 모델 — 3계층

| 계층 | 정의 위치 | 영향 |
|------|-----------|------|
| **IAM Identity Policy** | 사용자/Role | 누가 어떤 액션 가능한지 |
| **Repository Policy** | Repository | Repo 수준 접근 제어 (Cross-Account 허용) |
| **Domain Policy** | Domain | Domain 수준 광역 제어 |

> ⚠️ **함정**: Repository Policy로 다른 계정에 read 허용했는데 Domain Policy에서 그 계정을 차단하면 거부됨. Domain Policy가 더 광역.

### 4. 빌드 도구 인증

CodeArtifact는 **수명 12시간의 인증 토큰**을 발급:

```bash
# 토큰 발급
export CODEARTIFACT_AUTH_TOKEN=$(aws codeartifact get-authorization-token \
  --domain my-domain --domain-owner 111111111111 \
  --query authorizationToken --output text)

# npm 사용 시
aws codeartifact login --tool npm --repository my-repo --domain my-domain

# Maven (settings.xml에 토큰 주입)
# pip
aws codeartifact login --tool pip --repository my-repo --domain my-domain

# twine (Python 게시)
aws codeartifact login --tool twine --repository my-repo --domain my-domain
```

`aws codeartifact login`이 자동으로 `.npmrc`, `pip.conf`, `~/.m2/settings.xml`을 갱신.

### 5. 공급망 보안 패턴

| 위협 | 대응 |
|------|------|
| **Typosquatting** | 사내 표준 패키지 화이트리스트 + Code 검토 |
| **Dependency Confusion** | 내부 패키지를 CodeArtifact의 사설 namespace로 게시 + Lock 파일 강제 |
| **삭제된 의존성** | Upstream 캐시로 자동 보존 |
| **취약점 (CVE)** | Inspector + CodeGuru Security + Snyk/Dependabot 통합 |
| **변조** | 코드 서명 (Maven GPG, npm signing) |

### 6. 멀티 계정 CodeArtifact

- 중앙 Tooling Account에 Domain + Repository 두기
- Repository Policy로 다른 계정의 IAM Role에 read 권한
- Domain 수준 KMS 키 grant
- 빌드 계정에서 `--domain-owner` 옵션으로 cross-account 접근

```bash
aws codeartifact get-authorization-token \
  --domain shared-domain \
  --domain-owner 111111111111  # Tooling Account ID
```

---

## 🧠 알아두면 좋은 심화 이론

### CodeArtifact vs S3 vs ECR

| 사용 사례 | 적합한 서비스 |
|----------|----------------|
| npm/Maven/PyPI 패키지 | **CodeArtifact** |
| 컨테이너 이미지 | **ECR** |
| Helm Chart | **ECR (OCI)** 또는 S3 |
| 일반 바이너리/zip | CodeArtifact Generic 또는 **S3** |
| 빌드 아티팩트 (임시) | **S3** (수명주기 정책으로 자동 삭제) |
| 모델 파일 | S3 또는 SageMaker Model Registry |

### Repository Composition 패턴

```
production
   └─ upstream → shared
                  └─ upstream → npm-cache
                                  └─ external → npmjs.com
```

- production은 직접 외부 레지스트리에 연결 안 함 → 모든 외부 패키지가 npm-cache를 거쳐야 함
- npm-cache에서 차단 정책으로 typosquatting 패키지 거부 가능

### 패키지 게시 권한 분리

| Action | 빌드 봇 권한 | 개발자 권한 |
|--------|--------------|-------------|
| `codeartifact:ReadFromRepository` | ✅ | ✅ |
| `codeartifact:PublishPackageVersion` | ✅ (CI만) | ❌ (사람 직접 게시 차단) |
| `codeartifact:DeletePackageVersions` | ❌ | ❌ (긴급 시 별도 Role) |

### 시험 함정 — 비용 모델

- CodeArtifact 비용 = 저장 GB + 요청 횟수 + 데이터 전송
- 같은 패키지가 여러 Repository에 있어도 **Domain 수준에서 한 번만 저장**
- 빌드에서 동일 패키지 반복 다운로드는 요청 비용 증가 → CodeBuild Local Cache로 완화

### 관련 서비스 Cross-Reference

- **ECR** → Week 6 Day 1 (컨테이너 이미지)
- **Inspector** → Week 14 Day 4 (취약점 스캔)
- **CodeGuru Security** → Week 2 Day 4
- **S3 아티팩트** → Week 5 Day 1 (Pipeline 아티팩트)

---

## 🏗️ 아키텍처 다이어그램

```
CodeArtifact Multi-tier Repository
==================================================

  Build (CodeBuild / GH Actions)
        |
        |  npm install
        v
  +-----------------+
  | production-repo |   <- 검증된 패키지만
  +--------+--------+
           | upstream
           v
  +-----------------+
  | staging-repo    |   <- 평가 중
  +--------+--------+
           | upstream
           v
  +-----------------+
  | shared-cache    |   <- 캐시 + 차단 정책
  +--------+--------+
           | external connection
           v
  +-----------------+
  | npmjs.com /     |
  | maven-central / |
  | pypi.org        |
  +-----------------+

Domain Policy:
  - Cross-account read for Workloads OU
  - KMS encryption with key in Tooling Account

Repository Policy (production):
  - PublishPackageVersion: only CI/CD role
  - ReadFromRepository: all worker accounts
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Domain은 자산 중복 제거** — 여러 Repo에 같은 패키지 있어도 저장 한 번
2. ⭐ **Upstream 패턴**: 외부 레지스트리 캐시 + 장애 격리 + 패키지 삭제 보호
3. ⭐ **권한 3계층**: IAM + Repository Policy + Domain Policy (Domain이 광역)
4. ⭐ **인증 토큰 12시간**: `aws codeartifact get-authorization-token` 자동 갱신
5. ⭐ **Dependency Confusion 방어**: 내부 패키지 namespace + Lock 파일 + Upstream 단일 경로

---

## 💻 실제 예시 - 빌드 파이프라인에서 CodeArtifact 사용

```bash
# 1) Domain + Repository 생성
aws codeartifact create-domain --domain my-org \
  --encryption-key arn:aws:kms:ap-northeast-2:111:key/abc...

aws codeartifact create-repository \
  --domain my-org \
  --repository production \
  --upstreams repositoryName=shared-cache

aws codeartifact create-repository \
  --domain my-org \
  --repository shared-cache

aws codeartifact associate-external-connection \
  --domain my-org \
  --repository shared-cache \
  --external-connection public:npmjs

# 2) buildspec.yml에서 인증 + 빌드
cat <<EOF > buildspec.yml
version: 0.2
phases:
  pre_build:
    commands:
      - aws codeartifact login --tool npm \
          --repository production \
          --domain my-org \
          --domain-owner 111111111111
  build:
    commands:
      - npm ci
      - npm test
      - npm run build
  post_build:
    commands:
      - aws codeartifact login --tool npm \
          --repository production \
          --domain my-org \
          --domain-owner 111111111111 \
          --namespace @my-org
      - npm publish
EOF
```

**출력 예시 (login):**
```
Successfully configured npm to use AWS CodeArtifact repository
  https://my-org-111111111111.d.codeartifact.ap-northeast-2.amazonaws.com/npm/production/
Login expires in 12 hours at 2026-05-22 21:14:55
```

---

## 📝 연습 문제

**문제 1.** Dependency Confusion 공격을 방어하기 위해 가장 적절한 CodeArtifact 구성은?

A) 모든 패키지를 npmjs.com에서 직접 설치
B) 내부 패키지를 `@my-org` 같은 네임스페이스로 사설 CodeArtifact에 게시 + Lock 파일 강제 + Upstream 경유로 외부 패키지 캐시
C) 인터넷 전체 차단
D) 모든 빌드 후 수동 검토

**정답: B**
해설: 네임스페이스 + Lock + 단일 진입점(Upstream)이 표준 방어. A는 정반대.

---

**문제 2.** Domain과 Repository의 가장 큰 차이는?

A) Domain은 형식별 분리, Repository는 환경별 분리
B) Domain은 자산 중복 제거 + KMS 키 단일화, Repository는 권한·Upstream의 단위
C) Domain은 비용 청구만 분리
D) 둘 다 동일

**정답: B**
해설: Domain은 광역 컨테이너(KMS·중복 제거), Repository는 운영 단위.

---

**문제 3.** CodeBuild에서 CodeArtifact 인증 토큰의 수명은?

A) 1시간
B) 12시간
C) 24시간
D) 무제한

**정답: B**
해설: `get-authorization-token`의 기본 + 최대값 모두 12시간.

---

**문제 4.** npmjs.com에 있던 의존성이 갑자기 unpublish되었다. CodeArtifact를 통해 가져오던 빌드는 어떻게 되는가?

A) 즉시 빌드 실패
B) CodeArtifact의 Upstream 캐시본이 남아 있다면 계속 사용 가능
C) AWS Support에 요청해야 복구
D) 자동으로 maven-central로 재라우팅

**정답: B**
해설: Upstream 캐시의 핵심 가치 — 외부 삭제에도 캐시본 보존.

---

**문제 5.** 빌드 봇만 패키지를 게시할 수 있고, 개발자는 읽기만 가능하게 하려면?

A) Repository Policy에서 Publish 권한을 CI Role로 제한, Read는 모든 Developer Role에 허용
B) Domain을 두 개로 분리
C) S3 버킷 정책만으로 가능
D) GitHub Branch Protection으로 제어

**정답: A**
해설: Repository Policy + IAM Role 조합으로 액션별 분리.

---

**문제 6.** 다음 중 CodeArtifact가 지원하지 않는 패키지 형식은?

A) npm
B) Maven
C) Docker 이미지
D) PyPI

**정답: C**
해설: Docker/OCI 이미지는 **ECR**이 담당. CodeArtifact는 라이브러리 패키지 저장소.

---

**문제 7.** 크로스 계정 CodeArtifact 사용 시 필수 인자는?

A) `--region`만
B) `--domain-owner` (Domain 소유 계정 ID)
C) `--profile assume-role`만
D) `--external`

**정답: B**
해설: 다른 계정 Domain 접근 시 `--domain-owner`로 소유자 명시. Repository Policy의 grant도 필요.

---

## 📌 오늘의 요약

1. CodeArtifact = npm/Maven/PyPI/NuGet/Generic 등 라이브러리 패키지의 관리형 저장소
2. Domain은 자산 중복 제거·KMS·청구의 단위, Repository는 권한·Upstream 단위
3. Upstream으로 외부 레지스트리 캐시 → 장애·삭제·typosquatting 방어
4. 인증 토큰 수명 12시간, `aws codeartifact login`이 빌드 도구 설정 자동화
5. 컨테이너 이미지는 CodeArtifact가 아니라 ECR 사용
