# Day 3 - CodeArtifact and Supply Chain Security: When Dependencies Become Attack Surface

December 2020: SolarWinds, December 2021: Log4Shell, 2022: ua-parser-js malware injection, 2023: PyTorch nightly dependency confusion attack—what do the largest security incidents of the past five years have in common? All **penetrated through the software supply chain**. Not direct code exploitation but through dependent packages.

As this landscape shifts, "where you get packages from" becomes a first-class security concern in CI/CD systems. CodeArtifact is AWS's answer. On the surface it's a "managed npm/Maven/PyPI mirror", but in reality it means **creating a single entry point for supply chain that enables a controllable trust boundary**.

Today covers: ① why CodeArtifact's Domain/Repository layering is designed that way ② how Upstream chaining absorbs external registry failures and package unpublishes ③ how Dependency Confusion attacks work and how CodeArtifact's namespace prevents them ④ the three-layer permission evaluation (IAM + Repository Policy + Domain Policy) ⑤ where emerging standards like SBOM/SLSA/Sigstore fit in.

## Real-World Supply Chain Attacks — Why Using External Registries Directly Is Dangerous

To understand CodeArtifact's value, you must first see "why is using external registries directly risky?" Let me review actual incidents.

| Year | Incident | Mechanism | Impact |
|------|----------|-----------|--------|
| **2016** | `left-pad` unpublish | Author deletes package from npm → React/Babel builds halt entirely | Half the internet's build systems paralyzed. An 11-line function caused havoc |
| **2018** | `event-stream` hijack after takeover | Popular package permissions transferred to malicious developer → Bitcoin wallet theft code injected | 2 million downloads/week |
| **2020** | SolarWinds Orion | Build system infiltrated → backdoor inserted into officially signed updates | 18,000 US government organizations affected |
| **2021** | Log4Shell (Log4j 2.x JNDI) | RCE through Log4j lookup function | Apache ecosystem system-wide, government/enterprise emergency |
| **2021** | Codecov bash uploader | Credential extraction code injected into build script | HashiCorp, Twilio and others affected |
| **2021** | `ua-parser-js` account hijack | Official maintainer account compromised → malware added | 7 million downloads/week at time of discovery |
| **2022** | `colors.js` sabotage | Author added infinite loop code to his own package | Node.js ecosystem disrupted |
| **2023** | PyTorch nightly dependency confusion | Dummy package `torchtriton` published to PyPI → PyTorch build chose PyPI over internal | PyTorch nightly users' credentials leaked |
| **2024** | `xz-utils` backdoor (CVE-2024-3094) | 2-year social engineering gained maintainer access, SSH backdoor inserted | systemd dependency → nearly all Linux distros at risk before discovery |

This list isn't random incidents. **Build systems directly depending on external registries immediately absorb external incidents**—cumulative evidence. Without an intermediate cache and control layer like CodeArtifact, all the incidents above would have entered builds at build time.

> 📚 **Case Detail**: The 2016 left-pad incident started with a single line decision (author ran `npm unpublish`). When npm sided against him in a Kik Messenger package naming dispute, he unpublished all his packages. left-pad was transitively depended on by React, Babel, Webpack, and others; consequently, builds worldwide broke simultaneously. After this incident, npm introduced a 24-hour unpublish window, and many organizations began implementing internal mirrors. CodeArtifact's Upstream cache principle exactly embodies the lesson from this incident.

## Domain and Repository Layers — Why Two Levels?

CodeArtifact isn't a single plane but a **Domain → Repository** two-tier hierarchy. This separation is intentional and frequent on exams.

```
Domain (organizational unit, usually 1-2)
├── KMS Key (encrypt all Domain assets)
├── Asset Storage (deduplication)
├── Domain Policy (broad permissions)
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

| Unit | Design Meaning |
|------|----------------|
| **Domain** | Unified asset storage + single KMS key. Even if same `lodash@4.17.21` exists in multiple Repositories, Domain stores it once. Unit for billing. |
| **Repository** | Unit for permissions, Upstream, external connections. One Domain can have dozens to hundreds of Repositories. |

> 🔍 **Deep Dive**: Domain's KMS key unification is subtle but important. Adding more Repositories within the same Domain needs no new KMS key. However, **moving data between Domains involves different KMS keys**, requiring separate decrypt-encrypt cost. So organizations typically keep Domains small (1-2) and separate environments by Repository. In exams, when "why not create more Domains?", the answer is almost always asset deduplication + KMS unity.

> 💡 **Related Theory**: This two-tier model is an instance of **multi-tenancy in storage** pattern—providing isolated views on shared storage. AWS S3 with multiple prefixes in one bucket, Kubernetes with namespaces in one cluster follow the same philosophy. Shared infrastructure (storage) stays singular; logical isolation (permissions, views) handled at higher layers.

## Upstream and External Connection — The Value of a Single Entry Point

CodeArtifact's most powerful feature is **Upstream chaining**. Connecting Upstream to a Repository automatically fetches and caches packages not found locally.

```
Build tool (npm install lodash@4.17.21)
    |
    | npm config registry = https://...codeartifact.ap-northeast-2.amazonaws.com/npm/production/
    v
[CodeArtifact: production]
    | cache miss
    v
[CodeArtifact: shared-cache]
    | cache miss
    v
[External Connection: public:npmjs]
    v
npmjs.com
    | download
    v
store in shared-cache
view from production (assets stored once in Domain)
    v
deliver to build
```

This structure's value has multiple layers:

| Value | Mechanism |
|-------|-----------|
| **External Outage Isolation** | npmjs.com down? Cached packages still serve normally |
| **Deletion Protection** | Even if unpublished externally, cache copy remains (prevents left-pad incident) |
| **Supply Chain Control** | All external packages pass through shared-cache single entry point → blocking policy, audit, scanning entry |
| **Cost Reduction** | Prevent repeated downloads of identical packages |
| **Speed** | Within-region cache hit = millisecond response |

> ⚠️ **Trap**: External Connection should **only connect to leaf Repositories like shared-cache**, not directly to production Repository. Direct External Connection to production bypasses blocking policy. In exams, "standard CodeArtifact for supply chain control" almost always shows "production → shared → external" 3-tier.

> 🔍 **Deep Dive**: External Connections can attach to `public:npmjs`, `public:maven-central`, `public:maven-googleandroid`, `public:maven-clojars`, `public:maven-commonsware`, `public:pypi`, `public:nuget-org`, `public:ruby-gems-org`, etc. One per Repository, one External Connection handles one package format. Multi-language builds split format by Repository.

> 📚 **Case Study**: A payments company updated all internal builds to Log4j 2.17.1 within 4 hours during December 2021's Log4Shell crisis. The secret: adding a blocking policy to CodeArtifact's shared-cache Repository—"Log4j 2.0-2.16 packages deny ReadFromRepository". Builds automatically requested new versions; all environments upgraded consistently. Without CodeArtifact, this control was impossible with external npm/Maven directly.

## Three Permission Layers — IAM + Repository Policy + Domain Policy Evaluation Order

CodeArtifact controls permissions with three policy layers. This is where exams confuse students.

| Layer | Defined At | Scope | Analogy |
|-------|-----------|-------|---------|
| **IAM Identity Policy** | User/Role | What actions that Principal can take | "What I can do" |
| **Repository Policy** | Repository itself | Who can access that Repository (cross-account included) | "Who can enter this Repository" |
| **Domain Policy** | Domain itself | Broad impact on all assets/Repositories within Domain | "Rules applying to entire Domain" |

Evaluation order:

```
1. Domain Policy evaluation (broad deny first)
   └→ explicit Deny → immediate rejection
2. Repository Policy evaluation
   └→ explicit Deny → immediate rejection
3. IAM Identity Policy evaluation
   └→ explicit Allow required

cross-account requires Allow on both sides (Identity + Resource)
```

> ⚠️ **Trap**: If Repository Policy grants read to another account's Role but Domain Policy blocks that Org, the result is denial. Domain Policy evaluates first at broad level. In exams, "Repository Policy allows cross-account but fails" scenario's answer is almost always Domain Policy or KMS key policy.

```json
// Domain Policy example — only specific Org allowed
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
// Repository Policy — only CI bot publishes, all workers read
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

> 💡 **Related Theory**: AWS's policy evaluation model follows **deny-by-default + explicit Allow + explicit Deny is highest priority**—a consistent rule. When Domain Policy + Repository Policy + IAM Identity Policy + KMS Key Policy + SCP all cross-cut, debugging is hard. AWS IAM Policy Simulator or CloudTrail's `errorCode` reveals which layer denied.

## Dependency Confusion — The Attack CodeArtifact Specifically Prevents

Dependency Confusion is an attack documented in 2021 by Alex Birsan, demonstrated against Microsoft, Apple, PayPal and 34 other companies. Mechanism:

```
[Attack scenario]
1. Company publishes @company/internal-utils@1.0.0 to internal npm
2. Attacker publishes identical-name internal-utils@99.99.99 to npmjs.com (no namespace)
3. Company build calls npm install internal-utils
4. npm searches both → chooses higher version (99.99.99)
5. Attacker code enters company build
```

Two defenses exist:

| Defense | Mechanism |
|---------|-----------|
| **Scoped namespace** | Use `@company/internal-utils` organization scope. npmjs.com can't publish same scope (npm blocks) |
| **Single entry point + lock file** | Force CodeArtifact production as unique npm registry. Commit lock file (`package-lock.json`) to git for exact hash pinning |

> 🔍 **Deep Dive**: Lock files matter not just for version pinning but because they include **integrity hash**. The `integrity: "sha512-..."` field in `package-lock.json` is the package's exact content hash. If package changes in transit, hash mismatch rejects it. yarn's `yarn.lock`, pip's `--require-hashes` work on same principle.

> 📚 **Case Study**: Alex Birsan demonstrated successful code execution on 35 companies via dependency confusion within one month, receiving $1.3M bug bounty. Shocking that even largest firms didn't enforce lock files or use scoped names. In exams, when "Dependency Confusion defense" appears, the answer is always ① scoped namespace ② single registry (CodeArtifact) ③ lock file—all three.

## Authentication Token — 12-Hour Lifetime Meaning and Automation Pattern

CodeArtifact issues **12-hour authentication tokens** in a model similar to STS. You inject this token into `.npmrc`, `pip.conf`, `~/.m2/settings.xml` for build tools to use.

```bash
# Standard all-in-one pattern
aws codeartifact login --tool npm \
  --repository production \
  --domain my-org \
  --domain-owner 111111111111 \
  --region ap-northeast-2

# Internally:
# 1. get-authorization-token called (valid 12 hours)
# 2. ~/.npmrc updated
#    registry=https://my-org-111111111111.d.codeartifact.ap-northeast-2.amazonaws.com/npm/production/
#    //my-org-111111111111.d.codeartifact.ap-northeast-2.amazonaws.com/:_authToken=<token>
# 3. always-auth=true set
```

> 🔍 **Deep Dive**: 12 hours is no accident. 99% of CI/CD builds finish within 1 hour, but overnight large builds or multi-stage release pipelines run 4-8 hours. 12 hours covers all cases while limiting token leak impact. In exams, "token lifetime" answer is always 12 hours.

> ⚠️ **Trap**: What if token expires mid-build? Token is valid from issue time, not build start. So **refresh token right before build** is standard. CodeBuild's `pre_build` phase, GitHub Actions' first step always retrieves fresh.

## SBOM, SLSA, Sigstore — Emerging Standards for Supply Chain Security

CodeArtifact stores packages; determining "are these packages really safe?" is separate tools' job.

| Standard | Meaning | AWS Integration |
|----------|---------|-----------------|
| **SBOM (Software Bill of Materials)** | Software component list. SPDX, CycloneDX formats | Inspector can auto-generate for EC2/ECR |
| **SLSA (Supply-chain Levels for Software Artifacts)** | Google-led supply chain integrity grading (Levels 1-4) | CodeBuild + CodePipeline + Sigstore achieves SLSA L3 |
| **Sigstore (cosign, fulcio, rekor)** | OIDC-based code signing, keyless signing | ECR + cosign for container signing |
| **in-toto** | Build-phase integrity attestation | Foundation of SLSA framework |

> 💡 **Related Theory**: SLSA Framework (2021) is a direct response to SolarWinds incident. Google standardized how its Borg build system guarantees build integrity. Level 1 (build script documentation) → Level 2 (verified provenance) → Level 3 (source/build isolation, tamper-resistant) → Level 4 (2-reviewer + reproducible build). When exam asks "how ensure supply chain integrity", SLSA appearing as choice is almost the answer.

> 📚 **Case Study**: 2023, a SaaS company achieving SLSA L3 by ① building all container images only in CodeBuild + signing with cosign in ECR ② auto-generating SBOM per build stored to S3 ③ verifying signature with cosign before CodeDeploy, blocking on failure. Six months later when npm dependency was hijacked, SBOM diff immediately revealed impact scope.

## CodeArtifact vs S3 vs ECR — What Goes Where

| Use Case | Appropriate Service | Why |
|----------|--------------------|----|
| npm/Maven/PyPI/NuGet/Gradle | **CodeArtifact** | Native package manager protocol |
| Container images (Docker, OCI) | **ECR** | OCI-compliant, integrated image scanning |
| Helm Chart | **ECR (OCI)** or S3 | Helm 3+ OCI-compatible |
| General binary, zip build artifacts | CodeArtifact Generic or **S3** | Generic for search/versioning, S3 for simple storage |
| CodePipeline artifact temp storage | **S3** | Auto-expire via lifecycle policy |
| ML model files | **S3** or SageMaker Model Registry | Latter for metadata + versioning |
| Terraform Module | **CodeArtifact Generic** or S3 | Replaces Terraform Cloud private registry |

> 🎯 **Scenario**: A company wants "50 internal Helm Charts deployed safely". Answer? Not CodeArtifact but **ECR (OCI)**. Helm 3+ is OCI-compatible, so it uses container infrastructure (ECR + cosign signing + scanning). In exams, Helm Chart choice is a trap—looks CodeArtifact but answer is ECR.

## ⭐ Key Points

1. ⭐ **Domain = asset deduplication + KMS unity**. Same package across multiple Repositories stores once.
2. ⭐ **3-tier Upstream structure** (production → shared → external) is standard. Single entry for blocking/audit/scanning.
3. ⭐ Three-layer permission evaluation: Domain Policy → Repository Policy → IAM Identity Policy. Domain Policy evaluates first.
4. ⭐ Auth token 12 hours. Refresh via `aws codeartifact login` right before build.
5. ⭐ **Dependency Confusion defense = scoped namespace + single registry + lock file**.
6. ⭐ Docker/OCI images use ECR, not CodeArtifact. Helm Charts also ECR (OCI) preferred.
7. ⭐ SLSA, SBOM, Sigstore are emerging standards. CodeBuild + ECR + cosign = SLSA L3 achievable.

---

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
