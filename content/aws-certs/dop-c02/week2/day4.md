# Day 4 - DevSecOps의 Shift Left: 코드 서명·CodeGuru·Inspector로 만드는 자동 보안 게이트

2019년 Capital One 사고가 1억 600만 명의 고객 데이터를 흘려보낸 직접 원인은 WAF의 SSRF 취약점이었지만, 그게 그렇게 큰 사고로 번진 진짜 이유는 **빌드 파이프라인 어디에도 SSRF를 잡을 자동화된 보안 게이트가 없었다**는 점이다. SAST 한 줄, 코드 리뷰 한 단계, IMDS hop limit 검증 한 가지만 PR 단계에 박혀 있었어도 사고는 발생 전에 멈췄을 것이다. DevSecOps의 "Shift Left"는 그 게이트를 **운영(right)이 아니라 PR/IDE(left)**로 옮기는 일이다.

오늘은 그 게이트들의 AWS 도구 매핑을 본다. CodeGuru 3종, AWS Signer로 만드는 신뢰 체인, Inspector의 CVE 자동 스캔, 그리고 이 모두를 SLSA·SBOM·OCI 같은 산업 표준과 어떻게 엮어 한 파이프라인을 완성하는지. 시험은 도구 이름을 묻지 않는다 — "이 시나리오에서 어느 단계에서 어떤 검증이 들어가야 하느냐"를 묻는다.

---

## 🎯 학습 목표

- CodeGuru Reviewer/Security/Profiler의 시점·대상 차이를 명확히 안다
- AWS Signer로 Lambda·컨테이너·일반 코드를 서명하는 전체 흐름을 그릴 수 있다
- Inspector의 EC2/ECR/Lambda 스캔이 Security Hub와 어떻게 통합되는지 안다
- SLSA, SBOM, in-toto 같은 supply chain 표준이 AWS 도구와 어떻게 매핑되는지 안다
- "Shift Left" 원칙을 시험 시나리오에서 우선순위 결정에 적용한다

---

## 🧩 사전 지식 (CS 기초)

- **SAST (Static Application Security Testing)**: 소스 코드 정적 분석. 빌드 전 단계. Taint analysis, data flow.
- **DAST (Dynamic)**: 실행 중 분석. 보통 staging 환경에서 OWASP ZAP, Burp 같은 도구.
- **IAST (Interactive)**: 런타임에 instrumentation 삽입해 분석. SAST + DAST 중간.
- **SCA (Software Composition Analysis)**: 의존성 취약점 분석. CVE DB 매칭.
- **SBOM (Software Bill of Materials)**: 구성요소 목록. SPDX / CycloneDX / SWID 표준. US EO 14028(2021)로 연방 정부 납품 사실상 의무화.
- **Code Signing**: 서명자만 알 수 있는 개인키로 코드 hash에 서명 → 검증자가 공개키로 검증.
- **Supply Chain Attack**: 빌드·배포 경로 자체를 공격. SolarWinds(2020), Codecov(2021), 3CX(2023).
- **SLSA**: Supply-chain Levels for Software Artifacts (Google, 2021). L1-L4 4단계 보증 모델.
- **in-toto**: NYU의 attestation 프레임워크. 파이프라인 각 단계가 무엇을 어떻게 했는지 서명된 메타데이터.
- **Shift Left**: 보안 검사를 SDLC의 가능한 한 빠른 단계로 이동.

---

## 📖 이론 내용

### 1. CodeGuru 3 서비스 — 시점과 대상의 차이

| 서비스 | 시점 | 분석 대상 | 출력 | 차단 가능 |
|--------|------|-----------|------|-----------|
| **CodeGuru Reviewer** | PR/코드 변경 시 | Java, Python 소스 (정적) | PR 코멘트 (성능·보안·모범사례) | ❌ (코멘트만) |
| **CodeGuru Security** | PR/Build 시 | 다언어 보안 패턴 | Finding (CWE/CVSS 매핑) | ❌ (외부 게이트 필요) |
| **CodeGuru Profiler** | 런타임 | Java/Python/Node 프로세스 | Flame graph, 비용 최적화 권고 | ❌ (관찰성) |

> 💡 Reviewer와 Security는 2024년부터 통합 강화. Security가 Bedrock LLM 기반으로 더 빠르게 발전. CodeGuru Reviewer Java/Python 분석은 2025년 6월 종료 예정 → CodeGuru Security와 Amazon Q Developer가 후속.

**저장소 연결 방법:**
- CodeCommit / GitHub / GitLab / Bitbucket / S3 저장소를 **Associate** API로 등록
- PR 생성 시 자동 분석, Webhook 기반
- Findings는 **Security Hub로 자동 전송** (ASFF 포맷)

> 🔍 **더 깊이**: CodeGuru Reviewer의 분석 엔진은 두 단계로 동작한다. ① **Program analysis**: AST(Abstract Syntax Tree) 기반 데이터 흐름 분석. 예를 들어 SQL Injection 패턴(`request.getParameter()` → `Statement.executeQuery()`)을 taint propagation으로 추적. ② **ML 보강**: Amazon의 내부 코드 베이스 수십억 라인에서 학습한 모델로 "이 코드 형태가 보통 사고로 이어진다"는 패턴 매칭. 단순 grep과 달리 false positive가 낮은 이유다. 하지만 **그래도 LLM 기반이라 100%가 아니다** — 시험에서 "CodeGuru가 모든 보안 문제를 잡는다"는 보기는 항상 함정이다.

> 💡 **관련 이론**: SAST 도구의 정밀도-재현율(Precision-Recall) trade-off. False Positive(잘못된 경보)가 많으면 개발자가 무시하기 시작해(alert fatigue) 진짜 finding도 묻힌다. SonarQube, Checkmarx, Snyk Code, CodeGuru Security 같은 도구들이 다 이 trade-off에서 자기 위치를 정한다. OWASP Benchmark Project(연간 SAST 도구 평가)에서 도구별 Youden Index(TPR - FPR)를 비교한 데이터를 보면 "완벽한 도구는 없다"는 결론이 나온다.

### 2. AWS Signer — 신뢰 체인의 시작점

코드 서명 관리형 서비스. KMS-backed 서명 키를 AWS가 관리하고 고객은 Signing Profile만 만든다.

| 사용 사례 | 서명 대상 | 검증 지점 | Profile platform_id |
|-----------|-----------|-----------|---------------------|
| **Lambda** | Lambda 함수 코드 zip | Lambda 배포 시 | `AWSLambda-SHA384-ECDSA` |
| **Containers (Notary v2)** | OCI 컨테이너 이미지 | EKS Admission / ECS task launch | `Notation-OCI-SHA384-ECDSA` |
| **IoT** | IoT 디바이스 OTA 펌웨어 | 디바이스 부팅 | `AmazonFreeRTOS-*` |
| **SAM/Generic** | 임의 바이너리 | 사용자 정의 검증 | `AWSIoTDeviceManagement-SHA256-ECDSA` |

**Signing Profile**: 서명 키·정책의 묶음. Profile version이 바뀌면 새 ARN 발급(`/profile/v123`).

```bash
aws signer put-signing-profile \
  --profile-name LambdaProdSigner \
  --platform-id AWSLambda-SHA384-ECDSA \
  --signature-validity-period value=12,type=MONTHS \
  --tags Env=Production,Team=SRE
```

**Lambda Code Signing Config:**
- `UntrustedArtifactOnDeployment`: `Warn` 또는 `Enforce`
- `Enforce`: 서명되지 않거나 신뢰하지 않은 Profile로 서명된 코드는 배포 거부 (CodeSigningConfigNotFoundException)
- `Warn`: 경고만 CloudWatch Logs에 기록, 배포는 진행

> ⚠️ **함정**: `Warn` 모드를 "테스트용"으로 켜놓고 prod에 그대로 두는 사고가 흔하다. Capital One 사후 분석에서도 "보안 도구는 있었지만 차단 모드가 아니었다"는 패턴이 반복적으로 등장. 시험에서 "서명 검증 강제"가 키워드면 반드시 Enforce.

> 🔍 **더 깊이**: AWS Signer의 검증 단계는 두 가지를 본다. ① **서명의 유효성**: Profile의 공개키로 서명을 검증할 수 있는가. ② **Profile의 신뢰**: 이 Profile이 `allowed-publishers` 목록에 있는가. 두 조건 모두 통과해야 통과. Profile version도 함께 확인되므로, 키 회전 후에는 새 Profile version ARN을 `allowed-publishers`에 추가해야 한다(기존 버전은 expire 시점까지 공존).

### 3. Inspector — 의존성·이미지·OS 취약점의 자동 스캔

Inspector v2는 세 가지 자원 타입을 자동 스캔한다.

| 자원 | 트리거 | 분석 대상 |
|------|--------|-----------|
| **EC2 인스턴스** | SSM Agent 통한 인벤토리 변화 | OS 패키지 + 언어 라이브러리(Java, Python, .NET 등) |
| **컨테이너 이미지 (ECR)** | ECR 푸시 시 자동 + 24h 주기 재스캔 | OS layer + 언어 의존성 |
| **Lambda 함수** | 함수 업데이트 시 (Code & Layer) | 코드 + 의존성 |

**핵심 메커니즘:**
- CVE DB(NVD + 벤더별 advisory) 기반
- **CVSS 점수 + Inspector score**(공격 가능성 보정) 둘 다 제공
- Findings는 ASFF 포맷으로 Security Hub에 자동 전송
- EventBridge로 finding 발생 시 Lambda·SNS 트리거 가능

**Standard vs Enhanced (ECR):**
- Standard(무료): Clair 기반, 푸시 시 1회 스캔, OS layer만
- Enhanced(Inspector v2): Snyk 기반, 지속 스캔, OS + 언어 의존성, 24h 주기 재스캔

> 🔍 **더 깊이**: ECR Enhanced Scanning이 "24h 주기 재스캔"을 하는 이유는 **CVE는 코드가 변하지 않아도 새로 발견되기 때문**이다. 예를 들어 한 번 빌드해 둔 이미지가 어제는 깨끗했는데, 오늘 새벽 log4j 같은 신규 CVE가 공개되면 같은 이미지가 갑자기 취약해진다. Inspector는 매일 CVE DB와 이미지 manifest를 다시 매칭해 "now-known vulnerability"를 발견한다. 이게 prod에 떠 있는 컨테이너 보안의 핵심 — 빌드 시점 스캔만으로는 부족하다.

> 💡 **관련 이론**: 2021년 12월 9일 공개된 Log4Shell(CVE-2021-44228, CVSS 10.0)이 보여준 가장 큰 교훈은 "이미 prod에 떠 있는 워크로드의 의존성을 실시간 추적해야 한다"는 점이다. AWS는 그 다음 달인 2022년 1월에 Lambda 함수 코드 스캔을 Inspector에 추가했고, 이는 우연이 아니다. SBOM이 미국 행정명령 EO 14028(2021)로 사실상 의무화된 것도 같은 흐름.

### 4. DevSecOps Shift-Left 파이프라인 — 전체 그림

```
Pre-commit (개발자 로컬)
   ├─ pre-commit hook (git-secrets, lint)
   ├─ IDE 통합: CodeWhisperer + Amazon Q Developer security review
   └─ git-secrets로 AWS 키 누출 차단

Pull Request
   ├─ CodeGuru Reviewer/Security (자동 코멘트)
   ├─ SAST: Snyk Code, Checkmarx, SonarQube
   ├─ SCA: npm audit, pip-audit, Snyk Open Source
   ├─ Secret scan: GitHub Secret Scanning + Push Protection
   ├─ Branch Protection: Required Status Check
   └─ Approval Rule Template (CodeCommit) / Required Reviewers (GitHub)

Build (CodeBuild)
   ├─ Inspector (image scan on ECR push)
   ├─ Trivy / Grype (컨테이너 OSS 스캔, IaC 스캔)
   ├─ SBOM 생성 (Syft → CycloneDX / SPDX)
   ├─ SLSA Provenance 생성 (in-toto attestation)
   └─ AWS Signer로 서명 (Lambda zip 또는 OCI 이미지)

Deploy (CodeDeploy / EKS Admission)
   ├─ Signer 검증
   ├─ Admission Controller (ECS/EKS): Kyverno, Gatekeeper, ratify
   ├─ Policy as Code (OPA)
   └─ Pre-deploy hook (smoke test)

Runtime
   ├─ GuardDuty (런타임 위협 + Malware Protection)
   ├─ CodeGuru Profiler
   ├─ Macie (S3 PII 탐지)
   ├─ Security Hub (집계 + 자동 remediation)
   └─ AWS Config (drift 탐지)
```

### 5. SLSA 등급과 AWS 도구 매핑

SLSA(Supply-chain Levels for Software Artifacts)는 Google이 2021년 SolarWinds 사고 후 만든 4단계 모델이다.

| Level | 요구사항 | AWS 매핑 |
|-------|---------|----------|
| **L1** | 빌드 프로세스 문서화, provenance 생성 | CodeBuild + buildspec 체크인 |
| **L2** | Version control + hosted build service + signed provenance | CodeCommit/GitHub + CodeBuild + Signer |
| **L3** | Source/build platform 격리, isolated build, non-falsifiable provenance | VPC CodeBuild + 격리 IAM Role + in-toto attestation |
| **L4** | 2-person review + hermetic/reproducible build | + Approval Rule Template + 빌드 결정성 보장 |

> 📚 **사례**: 2020년 12월 SolarWinds Orion 사고는 빌드 시스템 자체가 침투당해 정상 코드에 SUNBURST 백도어가 주입된 사건이다. 18,000개 조직이 영향받았고 그중 미국 재무부·국토안보부·Microsoft·FireEye가 포함됐다. 사후 분석 결과: ① 빌드 서버에 직접 접근 가능한 권한이 너무 광범위 ② provenance가 없어 정상 빌드와 침투 빌드 구분 불가 ③ 서명은 있었지만 서명 키 자체가 빌드 서버에 있어서 같이 탈취됨. SLSA L3가 정확히 이 세 가지를 막기 위한 표준이다.

> 🔍 **더 깊이**: SLSA L3의 "non-falsifiable provenance"는 **빌드 서비스 외부의 서명 키**로 provenance를 서명한다는 뜻이다. AWS에서는 CodeBuild가 끝난 후 별도 Lambda가 KMS로 서명한 in-toto attestation을 만들어 ECR OCI artifact의 별도 layer로 push 하는 패턴. AWS Signer for Containers(Notation 기반)가 이를 표준화한다. cosign/Sigstore의 keyless 모드와 비교하면, AWS는 KMS-backed라 키 회전·접근 제어가 더 명확하지만 OIDC keyless의 "키 자체가 없는" 단순함은 없다.

### 6. 시크릿 누출 방지 — 다층 방어

```
[ 시크릿 누출 방지 4층 방어 ]

  Layer 1: IDE/Local
    git-secrets (pre-commit hook)
    IDE plugin (CodeWhisperer security review)
            ↓
  Layer 2: Push
    GitHub Secret Scanning + Push Protection
    (push 자체를 거부)
            ↓
  Layer 3: 저장소
    GitHub Advanced Security
    TruffleHog / GitGuardian webhook
            ↓
  Layer 4: 빌드/런타임
    Secrets Manager 자동 회전
    CodeBuild env.secrets-manager 통합
    절대 .env 파일을 저장소에 두지 않음
```

- **git-secrets**: AWS 키 패턴(`AKIA[A-Z0-9]{16}`) 매칭, pre-commit hook
- **GitHub Push Protection**: 30+ provider 키를 push 시점에 거부 (2023년 GA)
- **AWS Secrets Manager**: Lambda 기반 자동 회전 (RDS, Redshift, DocumentDB 네이티브)
- **CodeBuild의 `env.secrets-manager`**: buildspec에서 secrets-manager ARN으로 직접 참조

---

## 🧠 알아두면 좋은 심화 이론

### Lambda Code Signing 전체 흐름

```
Developer → CodeBuild 빌드 → S3에 zip 업로드
                                |
                                v
                       aws signer start-signing-job
                       (source S3 → destination S3)
                                |
                                v
                          Signed S3 object
                       (zip + signed metadata)
                                |
                                v
                    aws lambda update-function-code
                          --code-signing-config-arn ...
                                |
                                v
                  Lambda가 Signing Profile 검증
                  Untrusted → CodeSigningConfigNotFoundException
                  Trusted   → 정상 배포
```

> ⚠️ **함정**: `UntrustedArtifactOnDeployment=Warn`은 CloudWatch Logs에 경고만 남기고 배포는 진행한다. 실제 배포 차단은 `Enforce`다. 시험에서 "강제(strict)"가 키워드면 Enforce.

### Multi-Region 서명 검증

- Signing Profile은 **리전별**(global 아님)
- 동일 코드를 여러 리전에 배포하려면:
  - 옵션 1: 각 리전에 동일 이름·platform의 Profile 생성 (Profile ARN은 리전별로 다름)
  - 옵션 2: 한 리전에서 서명 후 다른 리전 Lambda의 `allowed-publishers`에 그 ARN 등록 (cross-region 신뢰)
- 운영 부담은 옵션 1이 적지만 키 분산 위험. 옵션 2가 키 일원화에는 유리.

### Container Signing - AWS Signer vs cosign

| 도구 | 표준 | 키 관리 | 검증 도구 |
|------|------|---------|---------|
| **AWS Signer for Containers** | Notary v2 (Notation) | KMS-backed | `ratify` (CNCF, AWS 후원) |
| **cosign (Sigstore)** | OCI 1.1 + Fulcio CA | OIDC 기반 keyless (단명 X.509) | `cosign verify`, `policy-controller` |
| **Notary v1** | Docker Content Trust | TUF + local | 폐지 추세 |

EKS에서 이미지 정책 강제는 **`ratify` admission webhook**(AWS Signer) 또는 **Sigstore `policy-controller`**(cosign). 둘 다 OPA Gatekeeper / Kyverno로 정책 표현 가능.

> 🔍 **더 깊이**: Sigstore의 keyless 서명은 **단명 X.509 인증서 + 투명성 로그(Rekor)**의 조합이다. 개발자가 GitHub OIDC 토큰을 Fulcio CA에 제출하면 10분짜리 X.509 인증서가 발급되고, 그 인증서로 서명한 뒤 Rekor 투명성 로그에 기록한다. 키 관리가 없어 분실 위험이 없지만, 검증 시점에 Fulcio + Rekor에 의존하는 게 단점. AWS Signer는 키가 KMS에 영구 보관되어 운영 모델이 다르다 — **enterprise 환경 + IAM 일원화**에는 AWS Signer가, **오픈소스 프로젝트 + 분산 신뢰**에는 cosign이 적합.

### CodeGuru Reviewer 비용/효과 + 한계

- 라인 수 기준 과금 (월별, 100K LOC 기준 $30 + 추가 라인당)
- Bedrock 기반 LLM 추가 인사이트 (2024+)
- 빌드 차단 안 함 — PR 코멘트만. 강제하려면 ① Approval Rule + 봇 검사 ② CodeBuild status check
- **한계**: Java/Python 외 언어는 CodeGuru Security로 (TypeScript, JavaScript, C#, Go, Ruby 지원)

### Inspector vs Trivy vs Snyk

| 도구 | 강점 | AWS 통합 | 가격 모델 |
|------|------|----------|-----------|
| **Inspector** | ECR/EC2/Lambda 네이티브, Security Hub 자동, 24h 재스캔 | 가장 강함 | 자원 단위 |
| **Trivy** | OSS 무료, IaC/SBOM/이미지 다목적, 빠름 | CodeBuild 실행 | 무료 |
| **Snyk** | 개발자 친화 UX, IDE 통합, 자동 fix PR | 외부 SaaS, AWS Marketplace | 라이선스 |
| **CodeGuru Security** | LLM 기반 코드 분석, 다언어 | 네이티브 | 라인 단위 |

조합 패턴: PR 단계 CodeGuru Security(SAST) + Build 단계 Trivy(이미지) + ECR push Inspector + Runtime GuardDuty.

### 관련 서비스 Cross-Reference

- **Security Hub** → Week 14 Day 2 (집계 허브, ASFF 포맷)
- **Inspector** → Week 14 Day 4
- **Secrets Manager** → Week 9 Day 4
- **ECR Image Scan** → Week 6 Day 1
- **GuardDuty Malware Protection** → Week 14 Day 3 (EBS·Lambda·S3 스캔)

---

## 🏗️ 아키텍처 다이어그램

```
Shift-Left Security Pipeline (Full)
==================================================

  Developer Laptop
    ├─ git-secrets (pre-commit)
    ├─ IDE: Amazon Q Developer / CodeWhisperer security
    └─ pre-commit framework (lint + sast)
            |
            v
  CodeCommit / GitHub
    ├─ CodeGuru Reviewer (PR auto-comment)
    ├─ CodeGuru Security (PR Finding → Security Hub)
    ├─ GitHub Secret Scanning + Push Protection
    └─ Approval Rule Template
            |
            v
  CodeBuild
    ├─ SAST (CodeGuru Security or Snyk Code)
    ├─ SCA (Snyk Open Source / npm audit / pip-audit)
    ├─ Container build → Trivy → ECR
    ├─ SBOM generation (Syft → CycloneDX)
    └─ SLSA L3 provenance (in-toto attestation)
            |
            v
  ECR (Push)
    ├─ Inspector Enhanced Scanning (24h 재스캔)
    ├─ Image signing (AWS Signer Notary v2)
    └─ Attestation push (OCI artifact)
            |
            v
  CodeDeploy / EKS Admission Controller
    ├─ Verify signature (ratify)
    ├─ OPA Gatekeeper / Kyverno policy
    ├─ Verify SBOM attestation
    └─ Pre-deploy smoke test
            |
            v
  Production
    ├─ GuardDuty Runtime + Malware Protection
    ├─ Macie (S3 PII)
    ├─ Security Hub aggregation (ASFF)
    └─ EventBridge → SSM Automation auto-remediation
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ CodeGuru **Reviewer**(코드 품질) vs **Security**(보안 패턴, 다언어) vs **Profiler**(런타임)
2. ⭐ Lambda Code Signing은 `UntrustedArtifactOnDeployment=Enforce` 일 때만 차단
3. ⭐ Inspector는 EC2/Container/Lambda 모두 스캔 → Security Hub로 자동 집계
4. ⭐ "Shift Left" — 보안 검사는 가능한 한 PR 단계까지 앞당김
5. ⭐ Secrets Manager + CodeBuild `env.secrets-manager`로 빌드 시 시크릿 주입, 저장소엔 절대 두지 않음
6. ⭐ SBOM은 빌드 단계에서 생성(Syft/Trivy), 배포 전 검증
7. ⭐ Container 서명: AWS Signer(Notary v2) 또는 cosign 둘 다 가능, 검증은 admission webhook

---

## 💻 실제 예시 - Signer + Lambda Code Signing 풀 흐름

```bash
# 1) Signing Profile 생성
aws signer put-signing-profile \
  --profile-name LambdaProd \
  --platform-id AWSLambda-SHA384-ECDSA \
  --signature-validity-period value=12,type=MONTHS

# 2) Code Signing Config 생성
aws lambda create-code-signing-config \
  --description "Prod CodeSigning" \
  --allowed-publishers SigningProfileVersionArns=arn:aws:signer:ap-northeast-2:123456789012:/signing-profiles/LambdaProd/abc123 \
  --code-signing-policies UntrustedArtifactOnDeployment=Enforce

# 3) 빌드 zip을 S3에 업로드 후 서명
aws signer start-signing-job \
  --source 's3={bucketName=builds,key=app.zip,version=abc123}' \
  --destination 's3={bucketName=signed,prefix=signed/}' \
  --profile-name LambdaProd \
  --client-request-token unique-request-id-12345

# 4) Lambda 함수 업데이트 (Code Signing Config 연결)
aws lambda update-function-code \
  --function-name MyFn \
  --s3-bucket signed \
  --s3-key signed/abc123/app.zip

# 5) Code Signing Config을 Lambda에 연결
aws lambda put-function-code-signing-config \
  --function-name MyFn \
  --code-signing-config-arn arn:aws:lambda:ap-northeast-2:123456789012:code-signing-config:csc-xxx
```

**서명되지 않은 코드 배포 시도 시 (Enforce 모드):**
```
An error occurred (CodeSigningConfigNotFoundException) when calling UpdateFunctionCode:
  Code signing config not found, or artifact is not signed by trusted publisher
```

### CodeBuild에서 Trivy + SBOM 통합 예시

```yaml
# buildspec.yml
version: 0.2
phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
  build:
    commands:
      - docker build -t $ECR_URI:$IMAGE_TAG .
      - trivy image --severity CRITICAL,HIGH --exit-code 1 $ECR_URI:$IMAGE_TAG
      - syft $ECR_URI:$IMAGE_TAG -o cyclonedx-json > sbom.json
      - aws s3 cp sbom.json s3://my-sbom-bucket/$IMAGE_TAG.json
  post_build:
    commands:
      - docker push $ECR_URI:$IMAGE_TAG
      # Inspector Enhanced Scanning이 push와 동시에 자동 스캔
artifacts:
  files:
    - sbom.json
```

---

## 📝 연습 문제

**문제 1.** 다음 중 PR 단계에서 자동 코드 리뷰를 위한 가장 적절한 AWS 서비스는?

A) CodeGuru Profiler
B) CodeGuru Reviewer + CodeGuru Security
C) Inspector
D) GuardDuty

**정답: B**
해설: Profiler는 런타임 성능, Inspector는 의존성·이미지·OS, GuardDuty는 런타임 위협. PR 단계 코드 분석은 Reviewer(품질) + Security(보안). 둘 다 같은 Associate API로 저장소를 등록하고 PR 시 자동 분석.

---

**문제 2.** Lambda 배포에 서명 검증을 강제하려면 어떤 설정이 필요한가?

A) `UntrustedArtifactOnDeployment=Warn`
B) `UntrustedArtifactOnDeployment=Enforce`
C) Lambda Layer 추가
D) Provisioned Concurrency 활성화

**정답: B**
해설: Warn은 경고만 CloudWatch Logs에 남기고 배포는 진행, Enforce가 실제 차단(CodeSigningConfigNotFoundException). 시험에서 "강제"·"strict"·"reject untrusted code" 키워드는 Enforce.

---

**문제 3.** ECR에 푸시되는 모든 이미지를 OS + 언어 의존성까지 자동 스캔하려면?

A) ECR Enhanced Scanning (Inspector v2 통합) 활성화
B) Lambda로 매번 수동 스캔
C) S3 객체 알림
D) CloudTrail로 사후 분석

**정답: A**
해설: Inspector Enhanced Scanning이 ECR 푸시마다 자동 스캔 + 24시간 주기 재스캔. Standard scanning은 OS layer만, Enhanced가 언어 의존성까지 포함. 결과는 Security Hub로 자동 전송.

---

**문제 4.** "Shift Left" 원칙에 가장 부합하는 조치는?

A) 프로덕션 배포 후 사후 침투 테스트
B) IDE/PR 단계에서 SAST·SCA·시크릿 스캔 자동화
C) 보안 검사를 분기에 한 번 수동 실행
D) 사용자에게 취약점 보고 받기

**정답: B**
해설: Shift Left = 보안 검사를 SDLC 앞 단계로 이동. PR/IDE 단계가 가장 빠르고, 사고 비용도 그 단계에서 가장 낮다(IBM Cost of a Data Breach Report: 코드 작성 단계 수정 비용은 prod 사고의 1/100). A는 right shift, C는 시간 간격이 너무 김, D는 reactive.

---

**문제 5.** 빌드 시 DB 비밀번호가 필요하다. 가장 안전한 주입 방식은?

A) buildspec.yml에 하드코딩
B) GitHub Secrets에 평문 저장
C) Secrets Manager에 저장 후 CodeBuild env.secrets-manager로 참조
D) S3에 평문 텍스트로 저장

**정답: C**
해설: Secrets Manager + CodeBuild env.secrets-manager 통합이 표준. 자동 회전, 감사 로그, 단일 진실 출처. GitHub Secrets는 GitHub Actions에서는 표준이지만 AWS 컨텍스트(CodeBuild)에서는 Secrets Manager가 정답.

```yaml
env:
  secrets-manager:
    DB_PASSWORD: "prod/db:password"
```

---

**문제 6.** CodeGuru Reviewer를 PR 머지의 필수 게이트로 만들려면?

A) CodeGuru Reviewer가 자동 차단
B) Approval Rule + 봇이 CodeGuru Finding을 확인하고 승인 또는 거부
C) Branch Protection의 Required Status Check + CodeBuild가 Finding 0이 아니면 실패 status push
D) B와 C 모두 가능

**정답: D**
해설: CodeGuru 자체는 코멘트만 달고 차단하지 않는다. 외부 강제 메커니즘이 필요. B(Approval Rule + Lambda 봇이 CodeGuru API로 finding 조회) 또는 C(Branch Protection + CodeBuild가 GitHub Status API로 fail 보고) 둘 다 산업 표준 패턴. 시험에서 "CodeGuru가 직접 차단"은 항상 함정.

---

**문제 7.** SBOM(Software Bill of Materials) 생성·관리에 적합한 도구는?

A) Syft / CycloneDX / SPDX
B) CloudTrail
C) Config
D) Trusted Advisor

**정답: A**
해설: SBOM은 표준 형식(CycloneDX, SPDX, SWID). Syft가 OSS 생성 도구. Trivy도 SBOM 생성 지원. CodeArtifact는 패키지 저장소지 SBOM 생성기는 아님. US EO 14028(2021)로 연방 정부 납품 시 SBOM이 사실상 의무화됨.

---

**문제 8.** SLSA L3 등급에 도달하려면 빌드 파이프라인에 필요한 것은?

A) 단순히 CodeBuild로 빌드
B) 격리된 빌드 환경(VPC + 최소 IAM Role) + non-falsifiable provenance(빌드 외부 키로 서명된 in-toto attestation) + version control
C) Trivy 스캔만
D) Lambda로 빌드

**정답: B**
해설: SLSA L3 요구사항은 ① source/build platform 격리 ② isolated build(다른 빌드의 영향 받지 않음) ③ non-falsifiable provenance(서명 키가 빌드 환경 밖에 있어서 빌드가 침투당해도 가짜 provenance 못 만듦). AWS에서는 VPC CodeBuild + KMS 서명 + in-toto attestation 조합으로 구현. SolarWinds 같은 사고를 막기 위한 표준.

---

**문제 9.** 한 회사가 Production EKS에서 "서명되지 않은 컨테이너 이미지는 절대 실행 금지"를 강제하려 한다. 가장 적절한 메커니즘은?

A) IAM Policy로 ECR Pull 차단
B) AWS Signer로 이미지 서명 + EKS에 ratify(또는 Sigstore policy-controller) admission webhook 배포 + Kyverno/OPA로 정책 표현
C) NetworkPolicy로 차단
D) Pod SecurityContext

**정답: B**
해설: 컨테이너 서명 검증의 표준 패턴. ① AWS Signer for Containers(Notary v2)로 이미지 서명 또는 cosign keyless 서명 ② EKS에 ratify(AWS) 또는 policy-controller(Sigstore) admission webhook 배포 ③ Kyverno 또는 OPA Gatekeeper로 "서명 없는 이미지 거부" 정책 작성. IAM, NetworkPolicy, SecurityContext는 다른 차원의 통제(접근, 네트워크, 권한)지 서명 검증이 아니다.

---

**문제 10.** Lambda 함수의 의존성에 신규 CVE가 발견되었는데, 함수 코드는 변하지 않았다. 가장 빨리 알 수 있는 방법은?

A) 다음 배포 시까지 기다림
B) Inspector Lambda 스캔(2023+) — Inspector가 CVE DB 변경을 감지하고 기존 함수에 다시 매칭, EventBridge로 알림
C) CloudTrail로 감지
D) Lambda를 매일 재배포

**정답: B**
해설: Log4Shell(2021)의 교훈 — "이미 배포된 함수도 신규 CVE 공개 시 취약해진다". Inspector v2가 Lambda 스캔을 지원(2023년 GA)하며, 함수 업데이트 시 + 24h 주기로 의존성 재평가. 새 CVE 발견 시 EventBridge 이벤트 발생 → Lambda·SNS 통보 → SSM Automation으로 자동 패치. CloudTrail은 API 호출 추적이지 CVE 탐지가 아님.

---

**문제 11.** 한 회사가 "공급망 공격(supply chain attack)"을 우려해 빌드 산출물의 신뢰성을 강화하려 한다. 다음 중 SLSA L3 수준에 도달하기 위한 가장 적합한 조합은?

A) Trivy 스캔만 추가
B) CodeBuild를 VPC 안에 격리 + KMS 키로 in-toto attestation 서명(빌드 환경 외부에 키 보관) + ECR Enhanced Scanning + AWS Signer로 최종 이미지 서명
C) GitHub Actions만 사용
D) 모든 빌드를 수동으로 검토

**정답: B**
해설: SLSA L3의 세 가지 핵심을 모두 충족하는 조합. ① **격리**: VPC CodeBuild + 빌드 전용 IAM Role(최소 권한) ② **non-falsifiable provenance**: KMS 키가 빌드 환경 외부에 있어서 빌드가 침투당해도 가짜 attestation 못 만듦 ③ **검증 가능한 산출물**: AWS Signer 서명 + Inspector 스캔. SolarWinds 사고가 정확히 이 세 가지의 결손이었다.

---

**문제 12.** 한 보안팀이 "PR 단계에서 보안 게이트가 너무 많아 개발자들이 우회한다"는 보고를 받았다. 가장 적절한 대응은?

A) 게이트를 다 제거
B) Risk-based gating — Critical/High만 PR 차단, Medium/Low는 알림만 + 주간 추적 + 자동 fix PR(Dependabot/Snyk) 도입
C) 모든 게이트를 사람이 수동 검토
D) Production에서만 검사

**정답: B**
해설: **Alert fatigue + 우회**는 보안 자동화의 가장 흔한 실패 패턴이다. 정답은 "더 많은 게이트"가 아니라 "더 똑똑한 게이트"다. Risk-based gating은 ① CVSS 점수 기반 분류(Critical 9.0+, High 7.0+만 차단) ② 자동 fix PR로 개발자 부담 최소화 ③ Medium/Low는 dashboard로 추적하되 머지는 허용. CodeGuru Security + Snyk + Dependabot 조합이 표준. A·D는 보안 후퇴, C는 자동화 본질 부정.

> 🎯 **시나리오**: 한 핀테크가 모든 finding을 PR 차단으로 설정했더니 개발자들이 "보안 게이트 우회용" 별도 브랜치 전략을 만들었다. 사후 분석에서 발견한 것은 ① alert의 80%가 false positive ② 우선순위가 없어 critical과 low가 같은 무게 ③ 개발자가 fix 방법을 모름. 해결책은 CodeGuru Security의 CVSS 기반 자동 분류 + Snyk의 auto-PR + Critical만 차단하는 risk-based 정책으로 전환. PR 통과율이 12%에서 89%로, 평균 finding 해결 시간이 14일에서 1.2일로 개선됐다.

---

## 📌 오늘의 요약

1. **CodeGuru 3종**: Reviewer(품질) + Security(보안 다언어) + Profiler(런타임 비용·성능) — 시점과 대상이 다름
2. **AWS Signer**: Lambda·컨테이너·일반 코드 서명. Lambda는 `UntrustedArtifactOnDeployment=Enforce`일 때만 실제 차단
3. **Inspector v2**: ECR/EC2/Lambda 자동 스캔 + 24h 재스캔, Security Hub로 자동 집계
4. **Shift Left**: IDE → PR → Build → Deploy → Runtime, 가능한 한 왼쪽으로 검사 이동
5. **SLSA L3**: 격리 빌드 + non-falsifiable provenance + 검증 가능한 산출물. SolarWinds 교훈
6. **SBOM**: Syft/Trivy로 빌드 단계 생성, CycloneDX/SPDX 표준, EO 14028로 사실상 의무
7. **시크릿 4층 방어**: IDE git-secrets → push GitHub Secret Scanning → 저장소 stream scanning → 빌드 Secrets Manager
