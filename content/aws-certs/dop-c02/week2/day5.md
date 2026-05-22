# Day 5 - Week 2 복습 + 시나리오 문제 10개

📅 날짜: Week 2 (Day 5)
🎯 주제: 소스 제어·OIDC·CodeArtifact·코드 서명 통합 시나리오

---

## 🎯 학습 목표

- Week 2 주요 4개 도메인을 통합 시나리오로 풀어본다
- 보안 강화 우선순위 결정 시 사고 틀을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- OIDC `sub` 클레임 활용
- Upstream 캐시 패턴
- Lambda Code Signing Enforce
- Shift Left

---

## 📖 Week 2 핵심 요약

### 1줄 요약

1. CodeCommit은 신규 가입 중단됐지만 기존 고객은 신규 리포지토리 생성 가능, EventBridge 트리거 + Approval Rule이 핵심
2. GitHub Actions + OIDC가 모던 표준 — 장기 자격 증명 제거
3. CodeArtifact의 Upstream으로 외부 레지스트리 캐시 + Dependency Confusion 방어
4. CodeGuru Reviewer/Security/Profiler는 시점·대상이 다른 세 도구
5. AWS Signer Lambda Enforce 모드만 서명 미검증 코드를 차단

### 헷갈리기 쉬운 비교표

| A | B | 시험 포인트 |
|---|---|-------------|
| CodeCommit Approval Rule | GitHub Required Reviewers | 양쪽 모두 PR 머지 게이트 |
| CodeCommit Trigger | EventBridge Rule | EventBridge가 모던 표준 |
| OIDC sub `repo:org/*:...` | `repo:org/specific-repo:...` | 와일드카드는 권한 확대 위험 |
| Domain | Repository | Domain은 자산 중복 제거, Repository는 권한 단위 |
| CodeGuru Reviewer | CodeGuru Security | 품질 vs 보안 (둘 다 PR 시점) |
| Inspector | Trivy | 네이티브 vs OSS |
| Lambda Signer Warn | Enforce | Enforce만 실제 차단 |

---

## 🧠 실전 시나리오 문제 10개

### 시나리오 1
PR 머지 시 main 브랜치에는 최소 2명 시니어 승인 + 보안 분석 통과를 요구한다. 가장 적절한 구성은?

A) Approval Rule Template + CodeGuru Reviewer 저장소 연결 + EventBridge로 CodeBuild 트리거(보안 SAST) + 상태 결과를 PR 코멘트
B) Lambda로 매번 수동 체크
C) Slack으로 알림만
D) 운영팀이 매일 수동 머지

**정답: A**
해설: 모든 게이트를 자동화 — Approval Rule(승인 정책) + CodeGuru(자동 코드 리뷰) + CodeBuild(보안 검사).

---

### 시나리오 2
GitHub Actions에서 prod와 staging 환경에 다른 권한이 필요하다. 가장 깔끔한 구성은?

A) 동일 IAM Role을 두 환경이 공유
B) GitHub Environments 두 개 정의 + 각각의 OIDC sub 조건으로 Trust Policy 분리한 두 IAM Role
C) 매 워크플로마다 새 IAM Role 생성
D) IAM User 액세스 키 분리

**정답: B**
해설: Environment별 sub 조건으로 IAM Role 분리가 표준. Required Reviewers도 환경 단위로 다르게 적용 가능.

---

### 시나리오 3
"CodeArtifact의 인증 토큰이 빌드 중간에 만료되어 빌드가 실패한다." 가장 적절한 해결은?

A) 토큰 수명을 1년으로 변경
B) `aws codeartifact login`을 빌드의 pre_build 단계에 두고 토큰 수명(최대 12h) 내에 빌드 완료, 장시간 빌드라면 단계마다 재발급
C) 빌드를 수동으로 분할
D) 외부 npmjs.com 직접 사용

**정답: B**
해설: 토큰 최대 12시간. 빌드 시작 시점에 갱신. 장시간 빌드면 단계별 갱신 또는 빌드 자체를 분할/병렬화.

---

### 시나리오 4
회사가 "외부 npm 패키지가 삭제·변경되어도 빌드 재현 가능"을 원한다. 가장 적절한 구성은?

A) `package-lock.json` 체크인 + CodeArtifact Upstream으로 npmjs 캐시 + 정기적으로 캐시 검증
B) 매번 최신 패키지 다운로드
C) S3에 수동으로 백업
D) Snyk로 모니터링만

**정답: A**
해설: Lock 파일(재현성) + Upstream 캐시(삭제 보호) + 검증의 조합.

---

### 시나리오 5
Lambda 함수의 코드 변조 위협이 우려된다. 가장 적절한 방어는?

A) Lambda Code Signing Config + Signer Profile + UntrustedArtifactOnDeployment=Enforce
B) Layer만 사용
C) S3 버전 관리만 활성화
D) Reserved Concurrency 설정

**정답: A**
해설: 서명 + Enforce가 변조 방어 패턴. C(버전 관리)는 변경 추적이지 검증 강제는 아님.

---

### 시나리오 6
"우리는 GitHub Enterprise 사용자다. AWS와 통합하는 가장 보안성 높은 인증 방식은?"

A) PAT(Personal Access Token)를 AWS Secrets Manager에 저장
B) AWS CodeStar Connections + OAuth (사람 인증)
C) AWS IAM OIDC Provider 등록 + GitHub Actions의 OIDC 페더레이션
D) IAM User 키 발급

**정답: C**
해설: OIDC가 장기 자격 증명 제거의 표준. CodeStar Connections는 CodePipeline의 source 인증에 적합하지만 워크플로 자체의 자격 증명은 OIDC.

---

### 시나리오 7
"PR 단계에서 시크릿 누출을 사전 차단하려면?"

A) GitHub Secret Scanning + Push Protection + git-secrets pre-commit hook
B) 매주 사람이 수동 검토
C) Public 저장소만 검사
D) 누출 후 Secrets Manager로 회전

**정답: A**
해설: 다중 레이어 — IDE 단계, push 단계, 저장소 단계.

---

### 시나리오 8
"내부 패키지 `@my-org/payments`가 공용 npmjs에 동일 이름의 더 높은 버전으로 게시되어 빌드가 가짜 패키지를 가져왔다." 향후 방어는?

A) CodeArtifact 사설 네임스페이스 + 단일 Upstream 경유 + Lock 파일 + 게시 권한 분리(빌드 봇만 게시)
B) 외부 npmjs 차단
C) 인터넷 차단
D) 빌드를 매번 수동 검증

**정답: A**
해설: Dependency Confusion 방어의 정공법.

---

### 시나리오 9
ECR 푸시 시 컨테이너 이미지의 OS·언어 패키지 CVE를 자동 검출하려면?

A) Trivy를 CodeBuild에서 수동 실행
B) Inspector Enhanced Scanning을 ECR에 활성화 → Security Hub로 자동 집계
C) CodeGuru Reviewer
D) AWS Backup

**정답: B**
해설: Enhanced Scanning이 ECR 푸시마다 자동. A도 가능하지만 네이티브 답이 B.

---

### 시나리오 10
회사가 Pro 시험에서 "DevSecOps 파이프라인 첫 도입 시 우선순위"를 묻는다. 가장 적절한 순서는?

A) Runtime → Build → PR → IDE (역순)
B) IDE 시크릿 스캔 → PR SAST/SCA → Build 이미지 스캔 → Deploy 서명 검증 → Runtime GuardDuty (Shift Left 순)
C) 한 번에 모두 도입
D) Runtime만 도입

**정답: B**
해설: Shift Left 순서. 빠른 피드백 + 누적 보안 강화.

---

## 📌 Week 2 요약

1. CodeCommit 트리거는 EventBridge가 표준 진입점, Approval Rule은 PR 게이트
2. GitHub Actions + OIDC는 단기 자격 증명 + sub 조건으로 권한 분리
3. CodeArtifact = Domain(자산 중복 제거) + Repository(권한·Upstream)
4. CodeGuru는 Reviewer/Security/Profiler 세 가지 다른 시점·대상
5. Lambda Code Signing은 Enforce 모드일 때만 실제 차단

---

## 🔜 다음 주 예고 (Week 3)

**CodeBuild 심화 — buildspec, 캐시, VPC, ARM**

- Day 1: buildspec 페이즈 깊이 파기
- Day 2: 빌드 캐시(S3/Local) + 병렬 빌드
- Day 3: 시크릿 주입 - Secrets Manager / Parameter Store
- Day 4: VPC CodeBuild, Custom Image, ARM/Graviton
- Day 5: 시나리오 문제 10개

---

> 💪 Week 2 완료! 소스 제어 보안 사고 틀이 갖춰졌습니다.
