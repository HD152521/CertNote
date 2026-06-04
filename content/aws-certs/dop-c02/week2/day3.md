# Day 3 - CodeArtifact와 공급망 보안: 의존성이 공격 표면이 되는 시대의 패키지 관리

2020년 12월 SolarWinds 사건, 2021년 12월 Log4Shell, 2022년 ua-parser-js 멀웨어 주입, 2023년 PyTorch nightly에 발생한 dependency confusion 공격 — 지난 5년간 발생한 가장 큰 보안 사고들의 공통점이 무엇일까. 모두 **소프트웨어 공급망(supply chain)**을 통해 침투했다는 것이다. 직접 작성한 코드가 아니라 의존하는 패키지를 통해 들어왔다.

이 흐름이 바뀌면서 CI/CD 시스템에서 "어디서 패키지를 가져오는가"가 보안의 일급 시민이 됐다. CodeArtifact는 AWS의 답이다. 표면적으로는 "관리형 npm/Maven/PyPI 미러"지만, 실제 의미는 **공급망의 단일 진입점을 만들어 통제 가능한 신뢰 경계를 그리는 것**이다.

오늘 다룰 그림은 다음과 같다. ① CodeArtifact의 Domain/Repository 계층이 왜 그렇게 설계됐는지 ② Upstream 패턴이 어떻게 외부 레지스트리 장애와 패키지 unpublish를 흡수하는지 ③ Dependency Confusion 공격이 어떻게 동작하고 CodeArtifact 네임스페이스가 어떻게 막는지 ④ 권한 3계층(IAM + Repository Policy + Domain Policy)의 평가 순서 ⑤ SBOM/SLSA/Sigstore 같은 신흥 표준이 어디에 끼어드는지.

## 공급망 공격의 실제 사례 — 왜 외부 레지스트리를 직접 쓰면 안 되는가

CodeArtifact의 가치를 이해하려면 "외부 레지스트리를 직접 쓰는 게 왜 위험한가"부터 봐야 한다. 실제 사고를 정리해보자.

| 연도 | 사건 | 메커니즘 | 영향 |
|------|------|---------|------|
| **2016** | `left-pad` unpublish | 저자가 npm에서 패키지 삭제 → 의존하던 React/Babel 빌드 전면 중단 | 인터넷 빌드 시스템 절반 마비. 11줄짜리 함수가 만든 사고 |
| **2018** | `event-stream` 인수 후 멀웨어 | 인기 패키지 권한이 악의적 개발자에게 양도 → 비트코인 지갑 탈취 코드 주입 | 다운로드 200만 회/주 |
| **2020** | SolarWinds Orion | 빌드 시스템 침투 → 정식 서명된 업데이트에 백도어 삽입 | 미국 정부 18,000개 조직 영향 |
| **2021** | Log4Shell(Log4j 2.x JNDI) | Log4j의 lookup 기능을 통한 RCE | Apache 생태계 전반, 정부·기업 비상 |
| **2021** | Codecov bash uploader | 빌드 스크립트에 자격 증명 추출 코드 주입 | HashiCorp, Twilio 등 영향 |
| **2021** | `ua-parser-js` hijack | 정식 maintainer 계정 탈취 → 멀웨어 추가 | 한 주에 다운로드 700만 회 |
| **2022** | `colors.js` 사보타지 | 저자가 무한 루프 코드 자가 추가 | Node.js 생태계 일시 중단 |
| **2023** | PyTorch nightly dependency confusion | `torchtriton`이라는 dummy 패키지를 PyPI에 게시 → PyTorch 빌드가 내부 대신 PyPI 선택 | PyTorch nightly 사용자 환경 자격 증명 유출 |
| **2024** | `xz-utils` 백도어(CVE-2024-3094) | 2년에 걸친 social engineering으로 maintainer 권한 획득 후 SSH 백도어 삽입 | systemd 의존 → 거의 모든 Linux distro 영향 직전에 발견 |

이 목록은 단순한 사건 모음이 아니다. **외부 레지스트리에 직접 의존하는 빌드 시스템은 외부 사고를 즉시 흡수한다**는 사실의 누적 증거다. CodeArtifact 같은 중간 캐시 + 통제 계층이 없다면 위 사고들은 모두 빌드 시간에 그대로 들어왔다.

> 📚 **사례 디테일**: 2016년 left-pad 사건은 단 한 줄짜리 결정(저자가 `npm unpublish` 명령)으로 시작됐다. Kik Messenger와 패키지 이름 분쟁에서 npm이 저자 편을 들지 않자 저자는 자신의 모든 패키지를 unpublish 했다. left-pad는 React, Babel, Webpack 등이 transitive하게 의존하던 패키지였고, 결과적으로 전 세계 빌드가 동시에 망가졌다. 이 사건 이후 npm은 24시간 unpublish 윈도우를 도입했고, 많은 조직이 사내 미러를 도입하기 시작했다. CodeArtifact의 Upstream 캐시 원칙은 정확히 이 사고의 교훈이다.

## Domain과 Repository의 계층 — 왜 두 단계인가

CodeArtifact는 단일 평면이 아니라 **Domain → Repository** 두 계층 구조다. 이 분리는 의도적이고 시험 빈출 포인트다.

```
Domain (조직 단위, 보통 1-2개)
├── KMS Key (전체 Domain 자산 암호화)
├── Asset Storage (중복 제거)
├── Domain Policy (광역 권한)
│
├── Repository: production
│   ├── Repository Policy
│   ├── Upstream → shared-cache
│   └── Packages: app-frontend@1.2.3, app-backend@2.0.1, ...
│
├── Repository: development
│   ├── Repository Policy
│   ├── Upstream → shared-cache
│   └── Packages: ...
│
└── Repository: shared-cache
    ├── External Connection → public:npmjs, public:pypi
    └── Packages: lodash@4.17.21, requests@2.28.0, ...
```

| 단위 | 설계 의미 |
|------|----------|
| **Domain** | 자산 저장소 통합 + KMS 단일화. 같은 `lodash@4.17.21`이 여러 Repository에 존재해도 Domain 안에서 한 번만 저장. 비용 모델의 단위. |
| **Repository** | 권한·Upstream·외부 연결의 단위. 한 Domain에 수십~수백 Repository 가능. |

> 🔍 **더 깊이**: Domain이 KMS 키를 단일화한다는 점은 미묘하지만 중요하다. 같은 Domain 안에서 Repository를 늘려도 새 KMS 키가 필요하지 않다. 하지만 **Domain 간 데이터 이동은 KMS 키가 다르므로 별도 decrypt-encrypt 비용이 든다**. 그래서 한 조직에서 Domain은 보통 1-2개로 작게 유지하고, 환경 분리는 Repository 단위로 한다. 시험에서 "왜 Domain을 더 만들지 않는가" 같은 보기가 나오면 답은 거의 항상 자산 중복 제거 + KMS 단일성.

> 💡 **관련 이론**: 이 두 계층 모델은 **multi-tenancy in storage**(공유 저장소에서 격리된 view 제공) 패턴의 한 사례다. AWS S3가 같은 bucket 안에 여러 prefix를 두는 것, Kubernetes가 한 클러스터에 namespace를 두는 것과 같은 철학. 공유 인프라(저장소)는 하나로 두고, 논리적 격리(권한, view)는 상위 계층에서 처리한다.

## Upstream과 External Connection — 단일 진입점의 가치

CodeArtifact의 가장 강력한 기능은 **Upstream chaining**이다. 한 Repository에 Upstream을 연결하면, 그 Repository에 없는 패키지를 Upstream에서 자동으로 가져와 캐시한다.

```
Build tool (npm install lodash@4.17.21)
    |
    | npm config registry = https://...codeartifact.ap-northeast-2.amazonaws.com/npm/production/
    v
[CodeArtifact: production]
    | 없음 (cache miss)
    v
[CodeArtifact: shared-cache]
    | 없음 (cache miss)
    v
[External Connection: public:npmjs]
    v
npmjs.com
    | 다운로드
    v
shared-cache에 캐시 저장
production에서 view (자산은 Domain 한 곳에 저장)
    v
빌드에 전달
```

이 구조의 가치는 여러 층이다.

| 가치 | 메커니즘 |
|------|---------|
| **외부 장애 격리** | npmjs.com이 다운돼도 캐시된 패키지는 정상 제공 |
| **삭제 보호** | 외부에서 unpublish돼도 캐시본 유지(left-pad 사고 방지) |
| **공급망 통제** | 모든 외부 패키지가 shared-cache라는 단일 진입점을 거침 → 차단 정책, 감사, 스캐닝의 진입점 |
| **비용 절감** | 동일 패키지 반복 다운로드 방지 |
| **속도** | 한 리전 안에서 캐시 hit 시 ms 단위 응답 |

> ⚠️ **함정**: External Connection은 **shared-cache 같은 leaf Repository에만 연결**하는 게 표준이다. production Repository에 직접 External Connection을 두면 차단 정책이 무력화된다. 시험에서 "공급망 통제를 위한 표준 CodeArtifact 구조" 보기는 거의 항상 "production → shared → external" 3단 구조다.

> 🔍 **더 깊이**: External Connection으로 연결할 수 있는 공용 레지스트리는 `public:npmjs`, `public:maven-central`, `public:maven-googleandroid`, `public:maven-clojars`, `public:maven-commonsware`, `public:pypi`, `public:nuget-org`, `public:ruby-gems-org` 등이다. Repository당 1개만 연결 가능하고, 1개의 External Connection은 한 패키지 형식만 다룬다. 그래서 멀티 언어 빌드는 형식별 Repository를 따로 둔다.

> 📚 **사례**: 한 결제 회사가 2021년 12월 Log4Shell 사태 당시 4시간 안에 사내 모든 빌드를 Log4j 2.17.1로 업그레이드했다. 비결은 CodeArtifact의 shared-cache Repository에 차단 정책을 추가한 것이다 — "Log4j 2.0-2.16 패키지는 ReadFromRepository 거부". 빌드가 자동으로 새 버전을 요청하게 됐고, 모든 환경이 일관되게 업그레이드됐다. CodeArtifact 없이 외부 npm/Maven을 직접 썼다면 이 통제는 불가능했다.

## 권한 3계층 — IAM + Repository Policy + Domain Policy의 평가 순서

CodeArtifact는 세 가지 정책 계층으로 권한을 제어한다. 이게 시험에서 헷갈리는 영역이다.

| 계층 | 정의 위치 | 영향 범위 | 비유 |
|------|----------|----------|------|
| **IAM Identity Policy** | User/Role | 그 Principal이 어떤 액션 가능 | "내가 할 수 있는 일" |
| **Repository Policy** | Repository 자체 | 그 Repository에 누가 접근 가능 (cross-account 포함) | "이 Repository에 누가 들어올 수 있는가" |
| **Domain Policy** | Domain 자체 | Domain 안의 모든 자산/Repository에 광역 영향 | "이 Domain 전체에 적용되는 규칙" |

평가 순서는 다음과 같다.

```
1. Domain Policy 평가 (광역 deny 우선)
   └→ 명시적 Deny면 즉시 거부
2. Repository Policy 평가
   └→ 명시적 Deny면 즉시 거부
3. IAM Identity Policy 평가
   └→ 명시적 Allow 필요

cross-account인 경우 양쪽(Identity + Resource) 모두 Allow 필요
```

> ⚠️ **함정**: Repository Policy로 다른 계정의 Role에 read 허용했는데 Domain Policy에서 그 Org를 차단했다면 → 거부. Domain Policy가 광역 우선. 시험에서 "Repository Policy로 cross-account 허용했는데 안 됨" 시나리오의 답은 거의 항상 Domain Policy 또는 KMS 키 정책.

```json
// Domain Policy 예시 — 특정 Org만 허용
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["codeartifact:GetAuthorizationToken"],
    "Resource": "*",
    "Condition": {
      "StringEquals": {
        "aws:PrincipalOrgID": "o-abc123"
      }
    }
  }]
}
```

```json
// Repository Policy — 빌드 봇만 publish, 모든 worker는 read
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublishOnlyByCi",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111:role/CodeBuildRole"
      },
      "Action": ["codeartifact:PublishPackageVersion", "codeartifact:WriteFromRepository"],
      "Resource": "*"
    },
    {
      "Sid": "ReadByAllWorkers",
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": ["codeartifact:ReadFromRepository", "codeartifact:GetPackageVersionAsset"],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-abc123" }
      }
    }
  ]
}
```

> 💡 **관련 이론**: AWS의 정책 평가 모델은 **deny-by-default + explicit Allow + explicit Deny가 최우선**이라는 일관된 규칙을 따른다. Domain Policy + Repository Policy + IAM Identity Policy + KMS Key Policy + SCP가 모두 cross-cut하는 영역이라 디버깅이 어렵다. AWS IAM Policy Simulator 또는 CloudTrail의 `errorCode`를 보면 어느 계층이 거부했는지 식별 가능.

## Dependency Confusion — CodeArtifact가 정확히 막는 공격

Dependency Confusion은 2021년 Alex Birsan이 Microsoft, Apple, PayPal 등 35개 회사를 대상으로 실증한 공격이다. 메커니즘은 다음과 같다.

```
[공격 시나리오]
1. 회사가 사내 npm에 @company/internal-utils@1.0.0 게시
2. 공격자가 npmjs.com에 똑같은 이름 internal-utils@99.99.99 게시 (네임스페이스 없이)
3. 회사 빌드가 npm install internal-utils를 호출
4. npm은 둘 다 검색 → 더 높은 버전(99.99.99)을 선택
5. 공격자 코드가 회사 빌드에 들어감
```

이 공격을 막는 방법은 두 가지다.

| 방어 | 메커니즘 |
|------|---------|
| **Scoped namespace** | `@company/internal-utils`처럼 organization scope 사용. npmjs.com의 같은 scope에 게시 불가(npm이 차단) |
| **단일 진입점 + lock 파일** | CodeArtifact production을 유일한 npm registry로 강제. lock 파일(`package-lock.json`)을 git에 커밋해 정확한 hash 고정 |

> 🔍 **더 깊이**: lock 파일이 중요한 이유는 단순히 버전 고정이 아니라 **integrity hash**를 포함하기 때문이다. `package-lock.json`의 `integrity: "sha512-..."` 필드는 패키지의 정확한 콘텐츠 해시다. 중간에서 패키지가 바뀌면 hash 불일치로 npm이 거부한다. yarn의 `yarn.lock`, Python pip의 `--require-hashes` 옵션도 같은 원리.

> 📚 **사례**: Alex Birsan은 2021년 한 달 만에 35개 회사에서 dependency confusion으로 코드 실행에 성공해 130만 달러 bug bounty를 받았다. 가장 큰 회사들조차 lock 파일을 강제하지 않거나 scoped 이름을 안 썼다는 사실이 충격이었다. 시험에서 "Dependency Confusion 방어"가 나오면 항상 ① scoped namespace ② 단일 registry(CodeArtifact) ③ lock 파일 3종 조합이 정답.

## 인증 토큰 — 12시간 수명의 의미와 자동화 패턴

CodeArtifact는 STS와 비슷한 모델로 **12시간 짜리 인증 토큰**을 발급한다. 이 토큰을 `.npmrc`, `pip.conf`, `~/.m2/settings.xml`에 주입해 빌드 도구가 사용한다.

```bash
# 한 번에 처리하는 표준 패턴
aws codeartifact login --tool npm \
  --repository production \
  --domain my-org \
  --domain-owner 111111111111 \
  --region ap-northeast-2

# 내부적으로 일어나는 일:
# 1. get-authorization-token 호출 (12시간 유효)
# 2. ~/.npmrc 갱신
#    registry=https://my-org-111111111111.d.codeartifact.ap-northeast-2.amazonaws.com/npm/production/
#    //my-org-111111111111.d.codeartifact.ap-northeast-2.amazonaws.com/:_authToken=<token>
# 3. always-auth=true 설정
```

> 🔍 **더 깊이**: 12시간이라는 수명은 우연이 아니다. CI/CD 빌드의 99%는 1시간 안에 끝나지만, 야간 대규모 빌드나 multi-stage release pipeline은 4-8시간 갈 수 있다. 12시간은 그 모든 경우를 커버하면서 토큰 유출 시 영향을 제한한다. 시험에서 "토큰 수명"의 답은 항상 12시간.

> ⚠️ **함정**: 빌드 중간에 토큰이 만료되면 어떻게 되는가? 토큰은 발급 시점부터 12시간이지 빌드 시작 시점부터가 아니다. 따라서 **빌드 직전에 새 토큰을 발급**받는 게 표준. CodeBuild의 `pre_build` 단계, GitHub Actions의 첫 step에서 항상 새로 받는다.

## SBOM, SLSA, Sigstore — 공급망 보안의 신흥 표준

CodeArtifact는 패키지 저장만 해주고, "이 패키지가 정말 안전한가"는 별도 도구가 답한다.

| 표준 | 의미 | AWS 통합 |
|------|------|---------|
| **SBOM (Software Bill of Materials)** | 소프트웨어 구성요소 목록. SPDX, CycloneDX 형식 | Inspector가 EC2/ECR 자동 생성 가능 |
| **SLSA (Supply-chain Levels for Software Artifacts)** | Google이 주도하는 공급망 무결성 등급(Level 1-4) | CodeBuild + CodePipeline + Sigstore로 SLSA L3 구성 가능 |
| **Sigstore (cosign, fulcio, rekor)** | OIDC 기반 코드 서명. keyless signing | ECR + cosign으로 컨테이너 서명 |
| **in-toto** | 빌드 단계 무결성 attestation | SLSA framework의 기반 |

> 💡 **관련 이론**: SLSA Framework(2021)는 SolarWinds 사고의 직접적 응답이다. Google이 자사 빌드 시스템 Borg가 어떻게 빌드 무결성을 보장하는지를 표준화한 것. Level 1(빌드 스크립트 문서화) → Level 2(verified provenance) → Level 3(소스/빌드 격리, 비탬퍼) → Level 4(2명 검토 + 재현 가능 빌드). 시험에서 "공급망 무결성을 어떻게 보장"이라는 질문에 SLSA가 보기로 나오면 거의 정답.

> 📚 **사례**: 2023년 한 SaaS 회사가 SLSA L3 달성을 위해 ① 모든 컨테이너 이미지를 CodeBuild에서만 빌드 + ECR에 cosign으로 서명 ② SBOM을 빌드마다 자동 생성해 S3에 저장 ③ CodeDeploy 배포 직전 cosign verify로 서명 검증 실패 시 배포 차단. 6개월 후 한 npm 의존성이 hijack됐을 때 SBOM diff로 즉시 영향 범위를 파악했다.

## CodeArtifact vs S3 vs ECR — 무엇을 어디에 두는가

| 사용 사례 | 적합한 서비스 | 이유 |
|----------|--------------|------|
| npm/Maven/PyPI/NuGet/Gradle | **CodeArtifact** | 패키지 매니저 프로토콜 네이티브 |
| 컨테이너 이미지(Docker, OCI) | **ECR** | OCI 호환, 이미지 스캔 통합 |
| Helm Chart | **ECR (OCI)** 또는 S3 | Helm 3+ OCI 호환 |
| 일반 바이너리, zip 빌드 산출물 | CodeArtifact Generic 또는 **S3** | Generic은 검색/버저닝, S3는 단순 저장 |
| CodePipeline artifact 임시 저장 | **S3** | 수명주기 정책으로 자동 만료 |
| ML 모델 파일 | **S3** 또는 SageMaker Model Registry | 메타데이터 + 버저닝이 필요하면 후자 |
| Terraform Module | **CodeArtifact Generic** 또는 S3 | Terraform Cloud private registry 대체 |

> 🎯 **시나리오**: 한 회사가 "내부 Helm Chart 50개를 안전하게 배포"하려 한다. 정답은? CodeArtifact가 아니라 **ECR(OCI)**. Helm 3+는 OCI 호환이라 컨테이너 이미지와 같은 인프라(ECR + cosign 서명 + 스캔)를 활용할 수 있다. 시험에서 Helm Chart 보기는 함정 — CodeArtifact 같지만 ECR이 정답.

## ⭐ 핵심 포인트

1. ⭐ **Domain = 자산 중복 제거 + KMS 단일성**. 같은 패키지가 여러 Repository에 있어도 저장 한 번.
2. ⭐ **Upstream 3단 구조**(production → shared → external)가 표준. 차단/스캐닝/감사의 단일 진입점.
3. ⭐ 권한 3계층 평가: Domain Policy → Repository Policy → IAM Identity Policy. Domain Policy가 광역 우선.
4. ⭐ 인증 토큰 12시간. 빌드 시작 직전 `aws codeartifact login`으로 갱신.
5. ⭐ **Dependency Confusion 방어 = scoped namespace + 단일 registry + lock 파일**.
6. ⭐ Docker/OCI 이미지는 CodeArtifact 아닌 ECR. Helm Chart도 ECR(OCI) 권장.
7. ⭐ SLSA, SBOM, Sigstore가 신흥 표준. CodeBuild + ECR + cosign 조합으로 SLSA L3 달성 가능.

## 📝 연습 문제

**문제 1.** Dependency Confusion 공격을 방어하기 위한 가장 적절한 CodeArtifact 구성은?

A) 모든 패키지를 npmjs.com에서 직접 설치하되 설치 후 `npm audit`로 취약점을 사후 점검
B) 내부 패키지를 `@my-org` 같은 scoped namespace로 사설 CodeArtifact에 게시 + lock 파일 강제 + Upstream 경유로 외부 패키지 캐시
C) 빌드 환경의 인터넷 아웃바운드를 전면 차단해 외부 레지스트리 접근 자체를 봉쇄
D) 모든 빌드 산출물을 배포 전 보안팀이 의존성 트리까지 수동 검토해 승인

**정답: B**
해설: scoped namespace + 단일 registry + lock 파일이 표준 3종 방어. A는 정반대로 공격 표면 노출. C는 비현실적, D는 자동화 부재.

---

**문제 2.** Domain과 Repository의 가장 큰 차이는?

A) Domain은 npm/Maven 같은 패키지 형식별 분리, Repository는 dev/prod 환경별 분리 단위
B) Domain은 자산 중복 제거 + KMS 키 단일화, Repository는 권한·Upstream의 단위
C) Domain은 비용 청구만 분리하는 태그성 단위이고 실제 권한·저장은 Repository가 전담
D) 둘 다 동일한 컨테이너이며 이름만 다를 뿐 기능적 차이는 없음

**정답: B**
해설: Domain은 광역 컨테이너(KMS·중복 제거·청구), Repository는 운영 단위.

---

**문제 3.** CodeBuild에서 CodeArtifact 인증 토큰의 최대 수명은?

A) 1시간 — STS AssumeRole 기본 세션과 동일한 짧은 수명
B) 12시간
C) 24시간 — 야간 멀티스테이지 릴리스를 하루 한 번 토큰으로 커버
D) 무제한 — `login` 후 명시적 폐기 전까지 토큰이 유효

**정답: B**
해설: `get-authorization-token`의 기본·최대값 모두 12시간. 빌드 직전 갱신이 패턴.

---

**문제 4.** npmjs.com에 있던 의존성이 unpublish됐다. CodeArtifact를 통해 가져오던 빌드는?

A) Upstream이 외부와 동기화되며 unpublish가 전파돼 다음 빌드부터 즉시 실패
B) CodeArtifact의 Upstream 캐시본이 남아 있다면 계속 사용 가능(left-pad 사고 방지)
C) 캐시는 휘발성이라 사라지므로 AWS Support에 요청해 백업본을 복구해야 함
D) CodeArtifact가 자동으로 GitHub Packages 등 다른 레지스트리로 재라우팅해 받아옴

**정답: B**
해설: Upstream 캐시의 가장 큰 가치 — 외부 삭제에도 캐시본 보존. 2016 left-pad 사고가 이 기능의 동기.

---

**문제 5.** 빌드 봇만 패키지를 게시하고 개발자는 읽기만 가능하게 하려면?

A) Repository Policy에서 Publish 권한을 CI Role로 제한, Read는 모든 Developer Role에 허용
B) Publish용 Domain과 Read용 Domain 두 개로 분리해 권한 경계를 물리적으로 나눔
C) 패키지가 담긴 S3 버킷의 버킷 정책만으로 게시·읽기 권한을 분리해 제어
D) GitHub Branch Protection으로 게시 브랜치 머지를 CI만 가능하게 해 publish를 통제

**정답: A**
해설: Repository Policy + IAM Role 조합으로 액션별 분리. 표준 패턴.

---

**문제 6.** CodeArtifact가 지원하지 않는 패키지 형식은?

A) npm — Node.js 패키지 레지스트리 프로토콜 네이티브 지원
B) Maven — Java 빌드 의존성 저장소로 `~/.m2/settings.xml` 연동
C) Docker/OCI 이미지
D) PyPI — Python 패키지 인덱스 프로토콜 지원

**정답: C**
해설: Docker/OCI 이미지는 ECR. CodeArtifact는 라이브러리 패키지(npm/Maven/PyPI/NuGet/Generic/Ruby/Swift/Cargo) 저장소.

---

**문제 7.** 크로스 계정 CodeArtifact 사용 시 필수 인자는?

A) `--region`만 — 소비자 계정과 같은 리전을 지정하면 cross-account가 동작
B) `--domain-owner`(Domain 소유 계정 ID) + Repository Policy의 grant + KMS 키 정책
C) `--profile`만 — 소유자 계정 자격을 가진 named profile만 지정하면 충분
D) `--external` 플래그로 외부 계정 접근을 명시적으로 활성화

**정답: B**
해설: cross-account 시 Domain Policy + Repository Policy + KMS 키 정책이 모두 grant되어야 함. `--domain-owner`로 소유자 명시 필수.

---

**문제 8.** SolarWinds 같은 공급망 사고를 빌드 인프라 수준에서 대응하려 한다. 가장 적절한 조합은?

A) CodeArtifact + SBOM 자동 생성 + Sigstore/cosign 서명 + 배포 전 서명 검증
B) GitHub Actions 워크플로 권한과 브랜치 보호만 강화해 빌드 진입점을 좁힘
C) 빌드 Role의 IAM Policy를 최소 권한으로 조여 빌드 시스템 침해 영향을 축소
D) 아티팩트 S3 버킷에 SSE-KMS 암호화를 적용해 저장된 산출물을 보호

**정답: A**
해설: 공급망 무결성은 단일 도구로 해결 안 됨. 패키지 저장(CodeArtifact) + 구성요소 목록(SBOM) + 서명(cosign) + 검증(배포 전 verify) 4단계가 표준. SLSA L3 패턴.

---

**문제 9.** Repository Policy로 다른 계정에 read 허용했는데 cross-account 접근이 실패한다. 가장 먼저 의심할 것은?

A) 접근 주체가 IAM User인지 assumed-role인지 차이로 Principal 매칭이 안 됨
B) Domain Policy 또는 KMS 키 정책의 cross-account grant 누락
C) 소비자 계정 서브넷의 Network ACL이 CodeArtifact 엔드포인트 트래픽을 막음
D) Route 53 DNS 해석 실패로 CodeArtifact 엔드포인트에 도달하지 못함

**정답: B**
해설: Domain Policy가 광역 우선 평가. Repository Policy 허용해도 Domain에서 차단되면 실패. KMS 키 정책에 사용 권한 grant도 필수.

---

**문제 10.** Helm Chart 50개를 사내 안전 저장소에 두려 한다. 가장 적절한 서비스는?

A) CodeArtifact Generic 패키지 형식으로 chart tarball을 버저닝해 저장
B) ECR(OCI 호환)
C) S3에 chart를 올리고 ChartMuseum 같은 helm registry를 직접 구축·운영
D) DynamoDB에 chart 메타데이터와 base64 인코딩한 tarball을 저장

**정답: B**
해설: Helm 3+는 OCI 호환 → ECR이 네이티브 지원. 컨테이너 이미지와 같은 인프라(스캔, 서명, 권한) 활용 가능. CodeArtifact Generic도 가능하지만 권장은 ECR.

---

## 📌 오늘의 요약

CodeArtifact의 진짜 가치는 "AWS-native npm/Maven 미러"가 아니라 **소프트웨어 공급망의 단일 진입점을 만들어 통제 가능한 신뢰 경계를 그리는 것**이다. Domain은 자산 중복 제거와 KMS 단일성을 담당하고, Repository는 권한·Upstream·외부 연결의 단위다. 표준 구조는 production → shared → external 3단으로, 모든 외부 패키지가 shared를 거치도록 강제해 차단/감사/스캐닝의 단일 지점을 만든다. Dependency Confusion 방어는 scoped namespace + 단일 registry + lock 파일 3종이 정답이고, SLSA/SBOM/Sigstore는 신흥 공급망 무결성 표준이다. Docker/OCI는 CodeArtifact 아닌 ECR임을 잊지 말 것. 내일은 CodeBuild에서 이 패키지들을 실제 어떻게 빌드 환경에 주입하는지로 넘어간다.
