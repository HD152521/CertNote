# Day 5 - Week 1 복습 + 시나리오 문제 10개

📅 날짜: Week 1 (Day 5)
🎯 주제: DevOps 철학·도구·멀티 계정 통합 시나리오
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Week 1의 핵심 5개 개념을 한 줄로 설명할 수 있다
- 헷갈리는 서비스 비교표를 외운다
- Professional 시험식 시나리오 10문제를 풀고 약점을 식별한다

---

## 🧩 사전 지식 (CS 기초)

이번 주의 누적 개념 점검:
- **CALMS / DORA**: DevOps 측정 프레임
- **WAF 6 Pillars**: 운영/보안/안정성/성능/비용/지속가능성
- **SCP**: 거부 가드레일
- **Push vs Pull deployment**: CodeDeploy vs ArgoCD
- **OIDC**: 단기 자격 증명 페더레이션

---

## 📖 Week 1 핵심 요약

### 1줄 요약

1. **DevOps = 문화·관행·도구의 결합** — 도구만 도입은 함정
2. **DORA 4 metrics**: 배포 빈도 / 리드 타임 / MTTR / 변경 실패율
3. **Well-Architected 6 Pillars** + DevOps Lens가 시나리오 사고 틀
4. **Code* 5종**: Source/Artifact/Build/Deploy/Orchestrate 분담
5. **멀티 계정 + Hub-Spoke + Identity Center**가 엔터프라이즈 기본

### 헷갈리기 쉬운 비교표

| 비교 | A | B | 시험 포인트 |
|------|---|---|-------------|
| CodePipeline vs CodeBuild | 오케스트레이터 | 빌드 실행기 | Pipeline은 빌드 안 함 |
| Push vs Pull 배포 | CodeDeploy | ArgoCD | 클러스터 자격 노출 여부 |
| SCP vs IAM | 거부 가드레일 | 권한 부여 | SCP는 허용 안 줌 |
| Org Management vs Member | SCP 미적용 | SCP 적용 | Management 계정 함정 |
| Control Tower Guardrail | Preventive(SCP) | Detective(Config) | Proactive(CFN Hook) |
| IAM User vs Identity Center | 안티패턴 | 표준 | 인적 사용자는 SSO |
| CodeStar/Cloud9 | 신규 가입 중단 | 기존만 유지 | 시험엔 여전히 등장 |
| CodeCommit | 관리형 Git | 신규 가입 중단 | GitHub + OIDC가 모던 답 |

---

## 🧠 실전 시나리오 문제 10개

### 시나리오 1

한 글로벌 핀테크 회사가 단일 AWS 계정에 dev/staging/prod 환경을 모두 운영 중이다. 최근 prod 환경의 IAM 정책 변경 실수로 dev 데이터가 노출되는 사고가 발생했다. 가장 적절한 1차 조치는?

A) prod 환경에 더 엄격한 SCP 적용
B) Control Tower Landing Zone으로 dev/staging/prod를 별도 계정으로 분리하고 OU별 SCP 적용
C) Lambda로 IAM 변경을 모니터링
D) IAM 정책 변경을 모두 수동 승인 워크플로로 전환

**정답: B**
해설: 환경 분리는 폭발 반경 축소의 가장 직접적인 방법. 단일 계정에서 추가 SCP는 한계가 있고, C·D는 미봉책.

---

### 시나리오 2

매일 배포 5회, 평균 MTTR 2시간, 변경 실패율 8%. DORA Elite 기준에서 가장 부족한 영역은?

A) Deployment Frequency
B) Lead Time
C) MTTR (2시간 → 1시간 이하 필요)
D) Change Failure Rate

**정답: C**
해설: Elite 기준 — 배포 빈도(여러 번/일 ✓), 변경 실패율(0-15% ✓), MTTR(<1h ✗). 자동 복구 자동화가 1차 개선 영역.

---

### 시나리오 3

기존 GitHub 사용 팀이 AWS에 처음 배포를 시작한다. 시크릿 관리와 권한 최소화를 모두 만족하는 구성은?

A) AWS 액세스 키를 GitHub Secrets에 저장
B) CodeCommit으로 모든 코드 이전 후 CodePipeline 사용
C) GitHub Actions의 AWS OIDC + 단기 IAM Role 사용, 시크릿은 Secrets Manager에서 런타임 조회
D) Jenkins EC2에 IAM Role 부여하고 Webhook 받기

**정답: C**
해설: 장기 자격 증명을 GitHub에 저장하지 않는다 + 시크릿은 Secrets Manager. CodeCommit 강제 이전은 함정.

---

### 시나리오 4

새 계정이 OU에 추가될 때마다 동일한 CloudTrail/Config/IAM Role/VPC를 배포해야 한다. 가장 효율적인 방법은?

A) 각 계정에서 매번 CloudFormation 수동 실행
B) CloudFormation StackSets (Service-managed permissions + Auto-deployment) 한 번 설정
C) Lambda를 EventBridge로 트리거해 각 리소스를 SDK로 생성
D) Terraform을 각 계정에 매번 실행

**정답: B**
해설: Auto-deployment가 새 계정 추가 이벤트에 자동 반응. A·C·D는 수동·복잡.

---

### 시나리오 5

EKS 클러스터에 배포하는데, "CI 시스템에 클러스터 자격 증명을 보관하고 싶지 않다"는 요구. 가장 적절한 답은?

A) CodeBuild에 EKS admin 자격 증명 환경 변수로 저장
B) Helm CLI를 매번 로컬에서 실행
C) ArgoCD/Flux로 GitOps 모델 적용 — 클러스터가 Git 상태를 pull
D) kubectl을 CodePipeline Lambda Action에 호출

**정답: C**
해설: Pull-based GitOps는 클러스터→CI 방향의 자격 노출이 없음.

---

### 시나리오 6

운영팀이 매주 금요일 야간에 prod 배포, 평균 변경 30개를 한 번에. 인시던트가 매주 1회씩 발생한다. CALMS 관점에서 가장 부족한 축은?

A) Culture
B) Automation
C) Lean (큰 배치 안티패턴, 작은 배치로 분해 + Canary)
D) Sharing

**정답: C**
해설: 한 번에 30개 변경 = Big Bang. 작은 배치 + Canary가 정답. Lean의 핵심.

---

### 시나리오 7

회사가 PHI 데이터를 다루는 워크로드를 AWS에 마이그레이션 중이다. 워크로드를 별도 계정으로 분리한 이유로 가장 적절한 것은?

A) 비용 절감
B) 규제 준수 + 보안 격리 + 감사 단순화
C) 빠른 배포
D) Spot Instance 사용

**정답: B**
해설: 규제 산업의 계정 분리 = 표준 패턴. 비용은 부차적.

---

### 시나리오 8

다음 중 SCP만으로 강제할 수 없는 것은?

A) 특정 리전 외 EC2 인스턴스 생성 금지
B) Root 사용자의 모든 작업 금지 (조건부)
C) Management Account의 사용자에게 동일한 제약 적용
D) CloudTrail 비활성화 금지

**정답: C**
해설: Management Account는 SCP 무영향. 가장 자주 출제되는 함정.

---

### 시나리오 9

회사가 Tooling Account에서 dev/staging/prod 3개 Spoke 계정에 배포한다. prod 배포만 수동 승인이 필요하다. 가장 깔끔한 구성은?

A) 각 환경별로 별도 파이프라인 3개
B) 단일 CodePipeline에 Stage를 dev→staging→**수동 승인**→prod로 구성, prod 단계에서 Cross-Account Deploy Action
C) prod만 별도 사람이 Console에서 매번 수동 배포
D) Slack으로 수동 공지 후 SSH 접속해 배포

**정답: B**
해설: V2 파이프라인 + Manual Approval Action + Cross-Account Deploy가 표준. A는 중복, C·D는 자동화 반대.

---

### 시나리오 10

새 계정 프로비저닝 절차가 평균 2주 걸리는 회사. DevOps 팀이 셀프서비스로 줄이려 한다. 가장 적절한 솔루션은?

A) IT 부서에 인력 충원
B) AWS Control Tower Account Factory (또는 AFT — Account Factory for Terraform)로 셀프서비스 자동화 + Service Catalog 카탈로그 노출
C) Bash 스크립트를 사내 위키에 게시
D) Excel로 신청서 양식 만들기

**정답: B**
해설: Account Factory는 셀프서비스 계정 프로비저닝의 정공법. Service Catalog는 사용자 경험 단순화.

---

## 📌 Week 1 요약

1. DevOps는 문화·관행·도구가 모두 갖춰져야 작동한다
2. CALMS와 DORA 4 metrics는 시험 시나리오 해석의 사고 틀이다
3. Well-Architected 6 Pillars + DevOps Lens로 트레이드오프 판단
4. Code* 5종의 책임 분담을 명확히 — 빌드는 CodeBuild
5. 멀티 계정 + Hub-Spoke + Identity Center는 엔터프라이즈 거버넌스의 토대

---

## 🔜 다음 주 예고 (Week 2)

**소스 제어 심화 - CodeCommit, GitHub, CodeArtifact**

- Day 1: CodeCommit 트리거, 브랜치 보호, 크로스 계정
- Day 2: GitHub Actions ↔ AWS OIDC 통합 심화
- Day 3: CodeArtifact + 외부 레지스트리 프록시
- Day 4: 코드 서명, 보안 스캔 (CodeGuru Reviewer)
- Day 5: 시나리오 문제 10개

---

> 💪 Week 1 끝! 시나리오 사고에 익숙해지는 게 첫 관문입니다.
