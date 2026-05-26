# Day 5 - Week 2 종합: 소스 제어부터 코드 서명까지, DevSecOps 사고 프레임을 시나리오로 굳히기

Week 2를 통과하면서 본 그림 — CodeCommit과 EventBridge의 트리거 모델, GitHub Actions + OIDC 페더레이션, CodeArtifact의 사설 레지스트리, CodeGuru와 Inspector의 보안 자동화, 그리고 AWS Signer로 만드는 신뢰 체인 — 은 결국 한 줄로 요약된다: **"코드가 개발자의 키보드를 떠난 순간부터 production에 닿을 때까지, 모든 경로에 자동 게이트를 박는 일."**

이 사고 프레임이 머리에 박혀 있으면, 시험장에서 만나는 시나리오가 "어느 게이트가 빠졌고 어느 게이트가 잘못 설정됐는가"의 패턴 매칭 작업이 된다. 오늘은 그 패턴 매칭을 12개의 종합 시나리오로 훈련한다. 단순 키워드 매칭이 아니라 **"왜 이게 정답이고 다른 보기는 왜 함정인가"**를 함께 본다.

---

## 🎯 학습 목표

- Week 2의 5개 주제(CodeCommit / GitHub OIDC / CodeArtifact / CodeGuru / Signer)를 통합 시나리오로 풀어본다
- DevSecOps 우선순위 결정 시 사고 틀(Shift Left + 신뢰 체인)을 적용한다
- 헷갈리기 쉬운 도구 쌍을 trade-off로 구분한다

---

## 🧩 사전 지식 정리

- **OIDC `sub` 클레임**: 토큰의 주체. GitHub Actions는 `repo:org/repo:ref:refs/heads/main` 같은 형태
- **Upstream 캐시 패턴**: 외부 레지스트리(npmjs, PyPI, Maven Central)를 한 번 가져와 사설 저장소에 캐싱
- **Lambda Code Signing Enforce**: 서명되지 않은 코드 배포 거부 (예외 던짐)
- **Shift Left**: SDLC 앞 단계로 보안·품질 검증 이동
- **Dependency Confusion**: 사설 패키지 이름과 같은 패키지를 public에 더 높은 버전으로 올려 빌드를 가로채는 공격 (Alex Birsan, 2021)
- **Confused Deputy**: 권한 위임 시 의도된 사용자 외 다른 사용자가 같은 자격을 사용하는 공격
- **SBOM**: Software Bill of Materials, 구성요소 목록

---

## 📖 Week 2 한 페이지 컴팩트

### 1줄 요약

1. **CodeCommit**: 신규 가입 중단(2024년 7월), 기존 고객은 신규 리포 생성 가능. EventBridge 트리거 + Approval Rule Template이 핵심. 마이그레이션은 GitHub/GitLab으로
2. **GitHub Actions + OIDC**: 모던 표준. 장기 IAM User access key 제거, sub 조건으로 권한 분리
3. **CodeArtifact**: Domain(자산 중복 제거 + KMS 일원화) + Repository(권한 단위 + Upstream 캐시) + Dependency Confusion 방어
4. **CodeGuru Reviewer/Security/Profiler**: 시점·대상이 다른 세 도구. Reviewer/Security는 PR, Profiler는 런타임
5. **AWS Signer**: Lambda Enforce 모드만 서명 미검증 코드를 실제 차단. 컨테이너는 Notary v2

### 헷갈리기 쉬운 비교표

| A | B | 시험 포인트 |
|---|---|-------------|
| CodeCommit Approval Rule | GitHub Required Reviewers | 양쪽 모두 PR 머지 게이트, 산출 방식이 다름(IAM vs Branch Protection) |
| CodeCommit Trigger | EventBridge Rule | EventBridge가 모던 표준, 모든 AWS 이벤트의 허브 |
| OIDC sub `repo:org/*:...` | `repo:org/specific-repo:...` | 와일드카드는 권한 확대 위험 — confused deputy 가능 |
| OIDC `environment:prod` | branch only | Environment 조건이 prod 보호에 강력 (Required Reviewers와 결합) |
| Domain | Repository | Domain은 자산 중복 제거 + KMS, Repository는 권한 단위 + Upstream |
| CodeArtifact Internal | External Connection | Internal은 자체 publish, External은 npmjs/PyPI 캐싱 |
| CodeGuru Reviewer | CodeGuru Security | 품질 vs 보안 (둘 다 PR 시점, 둘 다 차단은 안 함) |
| Inspector Standard | Inspector Enhanced (ECR) | Standard는 OS만, Enhanced는 OS + 언어 의존성 + 24h 재스캔 |
| AWS Signer | cosign (Sigstore) | KMS-backed vs OIDC keyless, enterprise vs OSS |
| Lambda Signer Warn | Lambda Signer Enforce | Enforce만 실제 차단(CodeSigningConfigNotFoundException) |
| AWS Signer for Lambda | for Containers (Notary v2) | platform_id가 다름, 검증 지점도 다름 |
| SAST | SCA | 코드 자체 vs 의존성 |
| SBOM CycloneDX | SPDX | OWASP vs Linux Foundation, 둘 다 표준 |

### Week 2 시나리오 풀이 4단계

1. **단계 식별**: IDE / PR / Build / Deploy / Runtime 중 어느 단계의 문제인가
2. **공격 모델 분류**: 코드 변조 / 의존성 / 시크릿 누출 / 권한 탈취 / 공급망 중 어느 것
3. **AWS 도구 후보**: 단계 × 공격 모델로 도구 매핑
4. **우선순위 선택**: Shift Left + 자동화 + 최소 권한 원칙으로 단일 정답

---

## 🧠 실전 시나리오 12개

### 시나리오 1
PR 머지 시 main 브랜치에는 최소 2명 시니어 승인 + 보안 분석 통과 + 단위 테스트 통과를 요구한다. CodeCommit 환경에서 가장 적절한 구성은?

A) Approval Rule Template으로 시니어 그룹 2명 명시 + CodeGuru Reviewer 저장소 연결 + EventBridge로 CodeBuild 트리거(보안 SAST + 단위 테스트) + 상태 결과를 PR 코멘트
B) Lambda로 매번 수동 체크
C) Slack으로 알림만
D) 운영팀이 매일 수동 머지

**정답: A**
해설: 모든 게이트를 자동화하는 정공법. ① **Approval Rule Template**으로 IAM 그룹 ARN을 명시(특정 사람이 아니라 그룹) ② **CodeGuru Reviewer**가 자동 코드 리뷰 코멘트 ③ **EventBridge**가 PR 생성 시 CodeBuild 트리거 ④ CodeBuild가 SAST(CodeGuru Security)와 단위 테스트 실행 ⑤ 결과를 PR 코멘트로 push.

> 🔍 **더 깊이**: CodeCommit Approval Rule Template의 핵심은 "**rule이 IAM에 묶이지만 사람이 아니라 그룹/role 단위**"라는 점이다. 특정 user 이름을 박으면 그 사람이 퇴사할 때 다시 만들어야 하지만, 그룹 ARN(`arn:aws:iam::123:group/SeniorEngineers`)을 박으면 멤버 변경이 자동 반영된다. GitHub Required Reviewers의 CODEOWNERS도 같은 발상.

---

### 시나리오 2
GitHub Actions에서 prod와 staging 환경에 다른 권한이 필요하다. 가장 깔끔한 구성은?

A) 동일 IAM Role을 두 환경이 공유 + workflow 안에서 if 분기
B) GitHub Environments 두 개 정의 + 각각의 OIDC `sub` 조건으로 Trust Policy 분리한 두 IAM Role + prod environment에 Required Reviewers 적용
C) 매 워크플로마다 새 IAM Role 생성
D) IAM User 액세스 키 두 개 발급

**정답: B**
해설: GitHub Environments + OIDC의 정답 패턴. ① `sub`에 `environment:prod`가 포함되도록 trust policy 작성 ② prod role은 prod 자원에만, staging role은 staging 자원에만 접근 가능 ③ prod environment에 Required Reviewers(GitHub Settings)를 걸면 workflow 실행 자체에 사람 승인 게이트.

```json
// Prod role의 Trust Policy
{
  "Effect": "Allow",
  "Principal": {"Federated": "arn:aws:iam::123:oidc-provider/token.actions.githubusercontent.com"},
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:environment:prod"
    }
  }
}
```

A는 권한 분리 안 됨(if 분기는 workflow 코드 수정으로 우회 가능), C는 운영 부담, D는 IAM User access key 자체가 보안 안티패턴.

> ⚠️ **함정**: `sub: repo:my-org/my-repo:ref:refs/heads/*` 같은 와일드카드는 **모든 브랜치**에서 같은 role을 assume할 수 있어서, PR 브랜치에서도 prod 권한 획득이 가능하다. 시험에서 와일드카드가 보이면 거의 함정.

---

### 시나리오 3
"CodeArtifact의 인증 토큰이 빌드 중간에 만료되어 빌드가 실패한다." 가장 적절한 해결은?

A) 토큰 수명을 1년으로 변경
B) `aws codeartifact login`을 빌드의 pre_build 단계에 두고 토큰 수명(최대 12h) 내에 빌드 완료. 장시간 빌드라면 단계마다 재발급, 또는 빌드 자체를 분할·병렬화
C) 빌드를 수동으로 분할
D) 외부 npmjs.com 직접 사용

**정답: B**
해설: CodeArtifact 인증 토큰의 최대 수명은 **12시간**(기본 12시간, 단축 가능하지만 연장 불가). 빌드 시작 시점에 갱신하고, 장시간 빌드면 단계별 갱신. A는 12시간 한계를 무시한 잘못된 보기, C는 자동화 부재, D는 CodeArtifact를 도입한 의도(보안·재현성) 자체를 부정.

> 🔍 **더 깊이**: CodeArtifact 토큰이 짧은 이유는 **노출 시 피해 최소화** 원칙이다. 빌드 로그에 토큰이 실수로 찍히거나, 빌드 컨테이너 메모리가 dump 되어도 12시간 후엔 무력화된다. 같은 사상으로 STS AssumeRole 토큰도 기본 1시간이고, AWS Signer 서명 만료도 12개월 기본값. 시험에서 "토큰 수명 늘리기"는 거의 항상 함정.

---

### 시나리오 4
회사가 "외부 npm 패키지가 삭제·변경되어도 빌드 재현 가능"을 원한다. 가장 적절한 구성은?

A) `package-lock.json` 체크인 + CodeArtifact Upstream으로 npmjs 캐시 + 정기적으로 캐시 검증 + S3로 빌드 산출물 보관
B) 매번 최신 패키지 다운로드
C) S3에 수동으로 백업
D) Snyk로 모니터링만

**정답: A**
해설: 빌드 재현성의 3축 — ① **Lock 파일**(정확한 버전 고정) ② **Upstream 캐시**(외부 삭제 보호) ③ **검증**(주기적 hash 비교). 2016년 `left-pad` 사건(11줄짜리 npm 패키지가 unpublish되어 React, Babel 등 수천 개 프로젝트 빌드 실패)이 이 패턴의 결정적 사례. 그 사건 이후 npm은 unpublish 정책을 강화했지만(72시간 내·25 다운로드 이하만 가능), 그래도 외부 의존을 100% 신뢰할 수 없다.

> 📚 **사례**: 2022년 3월 `node-ipc` 패키지의 메인테이너가 러시아·벨라루스 IP에 대해 파일 삭제 코드를 심은 사고(protestware). 같은 lock 파일이라도 새 minor 버전이 자동 설치되어 영향받았다. 교훈 — **lock 파일도 정기적으로 의존성 스캔(Snyk/Dependabot)을 통과해야 안전**하다.

---

### 시나리오 5
Lambda 함수의 코드 변조 위협이 우려된다. 가장 적절한 방어는?

A) Lambda Code Signing Config + Signer Profile + UntrustedArtifactOnDeployment=Enforce + KMS 키 정책으로 Profile 사용 권한 분리
B) Layer만 사용
C) S3 버전 관리만 활성화
D) Reserved Concurrency 설정

**정답: A**
해설: 서명 + Enforce가 변조 방어의 정공법. 추가로 ① **Signer Profile 자체의 권한**을 KMS 키 정책으로 분리(빌드 봇만 서명 가능, 개발자는 못 함) ② **Profile version**을 명시적으로 `allowed-publishers`에 등록 ③ 만료 갱신 시 신규 version ARN 추가. C(S3 버전 관리)는 변경 추적이지 변조 검증이 아님(공격자가 S3 write 권한을 얻으면 새 버전도 변조 가능). D는 동시성 제어로 보안과 무관.

> 🔍 **더 깊이**: Lambda 서명 검증은 **배포 시점**에 일어난다. 한 번 검증된 코드는 함수가 실행될 때마다 다시 검증하지 않는다. 따라서 ① 배포 후 함수 환경의 메모리에 직접 코드를 주입하는 공격(RCE 후 monkey patch)은 서명으로 막을 수 없다. 그건 GuardDuty Lambda Protection + Lambda execution environment의 read-only `/var/task`로 막는다. 서명은 "**누가 배포했는가**"를 검증하는 게이트지 "**런타임에 무엇이 실행되는가**"를 검증하는 게이트가 아니다.

---

### 시나리오 6
"우리는 GitHub Enterprise 사용자다. AWS와 통합하는 가장 보안성 높은 인증 방식은?"

A) PAT(Personal Access Token)를 AWS Secrets Manager에 저장
B) AWS CodeStar Connections + OAuth (사람 인증)
C) AWS IAM OIDC Provider 등록 + GitHub Actions의 OIDC 페더레이션
D) IAM User 키 발급

**정답: C**
해설: OIDC가 **장기 자격 증명 제거의 표준**이다. ① PAT는 사람이 들고 있는 키 → 노출 위험 ② CodeStar Connections는 CodePipeline의 source 인증에는 적합하지만 workflow 자체의 자격 증명은 OIDC ③ IAM User access key는 정적 자격증명. OIDC는 ① 단명 토큰(1시간) ② sub 조건으로 세분화 ③ 키 관리 없음.

> 💡 **관련 이론**: OIDC(OpenID Connect)는 OAuth 2.0 위에 만들어진 ID 토큰 표준이다. GitHub Actions는 매 workflow run마다 `actions/runner` 안에서 OIDC ID 토큰을 발급받고, AWS STS의 `AssumeRoleWithWebIdentity` API에 전달한다. STS는 토큰의 서명을 GitHub의 JWKS(`https://token.actions.githubusercontent.com/.well-known/jwks`)로 검증하고, claim 조건이 trust policy와 일치하면 임시 자격증명 발급. GitLab, Bitbucket Pipelines, CircleCI, Jenkins도 OIDC 토큰 발급을 지원하면 같은 패턴으로 통합 가능하다.

---

### 시나리오 7
"PR 단계에서 시크릿 누출을 사전 차단하려면?"

A) GitHub Secret Scanning + Push Protection + git-secrets pre-commit hook + Secrets Manager로 시크릿 일원화
B) 매주 사람이 수동 검토
C) Public 저장소만 검사
D) 누출 후 Secrets Manager로 회전

**정답: A**
해설: 다층 방어가 답. ① **IDE/Local**: git-secrets가 AWS 키 패턴(`AKIA[A-Z0-9]{16}`)을 commit 전에 차단 ② **Push**: GitHub Push Protection이 30+ provider 키를 push 시점에 거부 ③ **저장소**: Secret Scanning이 기존 commit도 스캔 ④ **빌드/런타임**: Secrets Manager에 저장, buildspec에서 `env.secrets-manager`로 참조 → 코드에 시크릿 자체가 없어지는 구조. D는 reactive — 누출 후 회전은 필수지만 사전 차단이 먼저.

> 🎯 **시나리오**: 한 회사가 PR 단계 시크릿 스캔을 켜고 1개월 동안 모은 데이터를 보니, push protection이 차단한 키 중 47%가 **테스트용 더미 키였지만 형식상 AWS 키 패턴과 일치**해서 차단됐다. 이때 해결책은 두 가지 — ① regex 패턴을 조정해 더미 prefix 제외 ② 더미 키도 실수로 진짜 키와 섞일 수 있으니 차라리 모든 키를 Secrets Manager로 통일. **현실 운영에서는 정답이 후자**다. 시험에서도 "shift left + 일원화"가 동시에 필요한 경우 답이 갈린다.

---

### 시나리오 8
"내부 패키지 `@my-org/payments`가 공용 npmjs에 동일 이름의 더 높은 버전으로 게시되어 빌드가 가짜 패키지를 가져왔다." 향후 방어는?

A) CodeArtifact 사설 네임스페이스 + 단일 Upstream 경유 + Lock 파일 + 게시 권한 분리(빌드 봇만 게시) + 의존성 차단 정책(`allow-publish: my-org-only`)
B) 외부 npmjs 차단
C) 인터넷 차단
D) 빌드를 매번 수동 검증

**정답: A**
해설: **Dependency Confusion** 공격(Alex Birsan, 2021)의 정답 방어. Birsan은 Apple, Microsoft, Tesla, PayPal 등 35개 회사를 같은 기법으로 침투해서 \$130,000 bug bounty를 받았다. 핵심 메커니즘은 "사설 패키지 이름이 public에 동일 이름·더 높은 버전으로 존재하면 패키지 매니저가 public을 우선"한다는 점.

방어 다층화:
1. **CodeArtifact 사설 네임스페이스**: `@my-org/*`는 사설 저장소에만 존재
2. **단일 Upstream 경유**: 외부 패키지는 반드시 CodeArtifact를 통해서만 → 우선순위 정렬 가능
3. **Lock 파일**: 정확한 버전 + integrity hash 검증
4. **게시 권한 분리**: 빌드 봇 외에는 사설 저장소에 publish 불가
5. **scope 보호**: npm enterprise는 scope 자체를 보호(같은 scope의 public publish 차단)

---

### 시나리오 9
ECR 푸시 시 컨테이너 이미지의 OS·언어 패키지 CVE를 자동 검출하려면?

A) Trivy를 CodeBuild에서 수동 실행
B) Inspector Enhanced Scanning을 ECR에 활성화 → Security Hub로 자동 집계 + EventBridge로 high severity 시 Slack 알림
C) CodeGuru Reviewer
D) AWS Backup

**정답: B**
해설: Enhanced Scanning이 ECR 푸시마다 자동 + 24h 재스캔. A(Trivy)도 가능하고 실무에서는 **둘 다 같이 쓰는 경우가 많지만** 시험 단일 정답은 네이티브인 B. Enhanced는 ① OS layer + 언어 의존성 ② Snyk DB 기반 ③ Security Hub 자동 통합 ④ CVE 신규 공개 시 자동 재평가. C(CodeGuru Reviewer)는 코드 정적 분석이지 이미지 스캔이 아님.

> 🔍 **더 깊이**: 실무 조합 패턴은 **"빌드 단계 Trivy(빠른 차단) + 푸시 단계 Inspector(공식 기록)"**다. Trivy는 빌드 컨테이너 안에서 즉시 결과를 받아 CodeBuild를 fail 시킬 수 있고, Inspector는 푸시 후 비동기라 빌드 차단 용도로는 늦다. 그래서 "PR에서 차단"이 필요하면 Trivy, "운영 상태 추적"이 필요하면 Inspector. 시험에서 "네이티브 + 자동 집계"가 키워드면 Inspector가 정답.

---

### 시나리오 10
회사가 Pro 시험에서 "DevSecOps 파이프라인 첫 도입 시 우선순위"를 묻는다. 가장 적절한 순서는?

A) Runtime → Build → PR → IDE (역순)
B) IDE 시크릿 스캔 → PR SAST/SCA → Build 이미지 스캔 → Deploy 서명 검증 → Runtime GuardDuty (Shift Left 순)
C) 한 번에 모두 도입
D) Runtime만 도입

**정답: B**
해설: **Shift Left 순서**의 정공법. 빠른 피드백 + 누적 보안 강화. ① **IDE**: git-secrets, IDE plugin — 비용 거의 0 ② **PR**: CodeGuru Security, Snyk — 자동화 ③ **Build**: Trivy, Inspector — 차단 게이트 ④ **Deploy**: Signer 검증 — 신뢰 체인 마무리 ⑤ **Runtime**: GuardDuty — 사후 탐지. 이 순서가 ① 가장 저렴한 곳부터 ② 가장 빠른 피드백 ③ 누적 강화의 3가지를 동시 충족.

A(역순)는 가장 비싼 사고 비용 단계부터, C는 한 번에 도입 시 alert fatigue로 우회 발생, D는 사후 대응만으로는 사고 자체를 못 막음.

> 📚 **사례**: IBM Cost of a Data Breach Report 2024에 따르면, 평균 사고 비용 \$4.88M 중 코드 작성 단계 결함 수정 비용은 \$80, prod 사고 후 수정 비용은 \$7,600 — **약 95배 차이**. Shift Left가 단순한 이론이 아니라 직접적인 비용 절감인 이유다.

---

### 시나리오 11
한 회사가 EKS에 컨테이너 이미지 서명 검증을 도입하려 한다. AWS Signer for Containers와 cosign(Sigstore) 중 enterprise 환경에서 더 유리한 선택과 그 이유는?

A) cosign — 무료
B) AWS Signer — KMS-backed 키 관리, IAM 일원화, Notation/ratify 통한 EKS admission webhook 네이티브, AWS Organizations 거버넌스 통합
C) cosign — OIDC keyless가 더 강력
D) AWS Signer — 더 빠름

**정답: B**
해설: enterprise 환경에서 핵심 요구는 ① **키 관리 일원화** (KMS) ② **거버넌스 통합** (Organizations, SCP) ③ **감사 추적** (CloudTrail) ④ **IAM 권한 일관성**. AWS Signer가 모두 충족한다. cosign keyless는 OSS 프로젝트에서 강력하지만, enterprise에서는 ① Fulcio/Rekor 외부 의존 ② OIDC provider 신뢰 체인 관리 부담 ③ AWS 거버넌스와 분리되는 게 단점.

```bash
# AWS Signer for Containers 서명 흐름
notation sign 123.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:v1.0 \
  --plugin com.amazonaws.signer.notation.plugin \
  --id arn:aws:signer:ap-northeast-2:123:/signing-profiles/MyProfile

# EKS ratify admission webhook이 검증
```

> 🔍 **더 깊이**: cosign keyless가 발급하는 X.509 인증서는 **10분 수명**이지만, 서명 자체는 OCI artifact에 영구 부착된다. 검증 시 Rekor 투명성 로그에서 "당시에 그 OIDC identity가 그 시점에 서명했다"는 사실을 확인한다. AWS Signer는 KMS 키가 영구라 같은 키로 여러 번 서명 가능. 두 모델의 보안 trade-off는 ① **키 분실 위험**(AWS Signer가 있음, cosign keyless는 없음) ② **공격자의 임시 침투 시 서명 가능 시간**(AWS Signer는 KMS 권한 가진 동안, cosign keyless는 10분).

---

### 시나리오 12
한 회사가 "OIDC 페더레이션이 너무 복잡하다"는 이유로 GitHub Actions에 IAM User access key를 다시 박으려 한다. 보안 컨설턴트로서 가장 적절한 대응은?

A) IAM User로 돌아간다
B) OIDC trust policy 와일드카드 함정과 sub 클레임 표준 패턴을 문서화 + `aws-actions/configure-aws-credentials` v4 예제 + Required Reviewers + role-session-name 명시로 CloudTrail 추적성 강화. IAM User로 회귀는 절대 불가
C) 외부 컨설팅
D) 아무것도 안 함

**정답: B**
해설: IAM User access key 회귀는 **명확한 보안 후퇴**다. 보안 사고의 가장 흔한 원인이 GitHub 저장소에 실수로 push 된 access key. OIDC가 복잡해 보이는 이유는 보통 ① trust policy의 sub 조건 작성법 ② Role chaining ③ AssumeRole vs AssumeRoleWithWebIdentity 구분 — 모두 문서화로 해결 가능. 표준 예제:

```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write   # OIDC 토큰 발급 권한
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Required Reviewers 적용
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsDeployRole
          role-session-name: gh-actions-${{ github.run_id }}
          aws-region: ap-northeast-2
      - run: aws s3 sync ./dist s3://my-bucket/
```

`role-session-name`을 명시하면 CloudTrail에 `userIdentity.arn`이 `assumed-role/GitHubActionsDeployRole/gh-actions-12345` 형태로 찍혀 어느 workflow run이 어떤 작업을 했는지 추적 가능하다. IAM User access key는 이 추적성도 없다.

> 🎯 **시나리오**: 2024년 한 스타트업이 GitHub Actions의 IAM User access key를 실수로 public 저장소에 push했다. 14분 만에 봇이 키를 수집했고, 30분 안에 us-east-1에 `p5.48xlarge` 8대가 켜졌다. 8시간 후 발견 시 청구액 \$76,000. AWS Support와 협상으로 일부 환불받았지만, 이후 정책이 **"모든 CI/CD는 OIDC 의무, IAM User access key 사용 금지"**로 바뀌었다. 같은 시기 다른 회사가 OIDC로 운영하다 비슷한 실수(workflow yaml에 secret 출력)를 했을 때는, 토큰이 이미 만료되어 피해 0. 사고 후 인터뷰에서 CISO가 한 말 — "OIDC를 진작 했어야 했다."

---

## 📌 Week 2 핵심 요약 (재확인)

1. **CodeCommit**: 트리거는 **EventBridge**가 표준 진입점, **Approval Rule Template**은 PR 게이트. 신규 가입 중단(2024년 7월) — 마이그레이션 검토
2. **GitHub Actions + OIDC**: 단기 자격 증명 + sub 조건으로 권한 분리. `environment:prod` 조건 + Required Reviewers 조합이 prod 보호의 정공법
3. **CodeArtifact**: Domain(자산 중복 제거 + KMS) + Repository(권한·Upstream). Dependency Confusion 방어의 핵심
4. **CodeGuru**: Reviewer(품질) + Security(보안) + Profiler(런타임). 셋 다 자체로는 차단 안 함 — Approval Rule + 봇으로 강제
5. **AWS Signer**: Lambda는 **Enforce 모드**일 때만 실제 차단. 컨테이너는 Notary v2(ratify), 비교 대상은 cosign(Sigstore keyless)
6. **DevSecOps Shift Left 우선순위**: IDE → PR → Build → Deploy → Runtime, 비용 95배 차이가 정당화

---

## 🔜 다음 주 예고 (Week 3)

**CodeBuild 심화 — buildspec, 캐시, VPC, ARM/Graviton**

Week 1-2가 "DevOps 사고 프레임 + 소스 단계 보안"이었다면, Week 3은 본격적인 **빌드 단계의 깊이**로 들어간다.

- **Day 1**: buildspec 페이즈 깊이 파기 (install/pre_build/build/post_build의 격리, 환경 변수 전파, artifact 정의)
- **Day 2**: 빌드 캐시(S3/Local Custom) + 병렬 빌드 + Batch Build로 monorepo 처리
- **Day 3**: 시크릿 주입 — Secrets Manager / Parameter Store / Session Manager 패턴
- **Day 4**: VPC CodeBuild(private resources 접근 + Internet 우회), Custom Image(ECR + privileged), ARM/Graviton 비용 절감
- **Day 5**: Week 3 시나리오 종합

핵심 질문 — "**같은 코드인데 빌드만 다르게 해서 비용과 속도를 어떻게 바꾸나, 그리고 그게 보안과 어떻게 부딪치나**"가 다음 주의 화두다.

---

> 💪 Week 2 완료. **소스 제어부터 코드 서명까지 DevSecOps 사고 틀**이 갖춰졌다. 다음 주부터는 그 코드가 실제로 빌드되는 단계에서 발생하는 trade-off — 캐시 hit rate, VPC endpoint, ARM 컴파일, 시크릿 주입 안정성 — 를 본격적으로 다룬다. Week 2가 "**무엇을 입력으로 받는가**"였다면, Week 3은 "**그것을 어떻게 가공하는가**"의 주간이다.
