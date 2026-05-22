# Day 4 - 코드 서명, 보안 스캔 (CodeGuru Reviewer, Signer)

📅 날짜: Week 2 (Day 4)
🎯 주제: SDLC 보안 — 정적 분석, 의존성 스캔, 코드 서명
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CodeGuru Reviewer/Security/Profiler의 역할 차이를 안다
- AWS Signer로 Lambda·컨테이너·일반 코드를 서명하는 방법
- Inspector SBOM/CVE 스캔과 빌드 파이프라인 통합 패턴
- DevSecOps의 "Shift Left" 원칙을 시험 시나리오에 적용한다

---

## 🧩 사전 지식 (CS 기초)

- **SAST (Static Application Security Testing)**: 소스 코드 정적 분석. 빌드 전 단계.
- **DAST (Dynamic)**: 실행 중 분석. 보통 staging 환경에서.
- **SCA (Software Composition Analysis)**: 의존성 취약점 분석.
- **SBOM (Software Bill of Materials)**: 구성요소 목록. SPDX/CycloneDX 표준.
- **Code Signing**: 서명자만 알 수 있는 키로 코드에 서명 → 배포 시 검증.
- **Shift Left**: 보안 검사를 SDLC의 가능한 한 빠른 단계로 이동.

---

## 📖 이론 내용

### 1. CodeGuru 3 서비스 비교

| 서비스 | 시점 | 분석 대상 | 출력 |
|--------|------|-----------|------|
| **CodeGuru Reviewer** | PR/코드 변경 시 | Java, Python 소스 | PR 코멘트 (성능·보안·모범사례) |
| **CodeGuru Security** | PR/Build 시 | 다언어 보안 패턴 | Finding (CVE 형식) |
| **CodeGuru Profiler** | 런타임 | Java/Python/Node 프로세스 | Flame graph, 비용 최적화 권고 |

> 💡 Reviewer와 Security는 2024년부터 통합 강화. Security가 더 빠르게 발전. CodeGuru Security는 Bedrock 기반의 SAST.

**연결 방법:**
- CodeCommit/GitHub/GitLab/Bitbucket 저장소를 **Associate**
- PR 생성 시 자동 분석
- Findings는 Security Hub로 전송 가능

### 2. AWS Signer

코드 서명 관리형 서비스. 3가지 사용 사례:

| 사용 사례 | 서명 대상 | 검증 |
|-----------|-----------|------|
| **AWS Signer for Lambda** | Lambda 함수 코드(zip) | Lambda 배포 설정에서 검증 |
| **AWS Signer for Containers (Notary v2)** | OCI 컨테이너 이미지 | EKS/ECS Admission Controller |
| **IoT/SAM/Generic** | 임의 바이너리 | 사용자 정의 검증 |

**Signing Profile**: 서명 키·정책의 묶음.

```bash
aws signer put-signing-profile \
  --profile-name LambdaProdSigner \
  --platform-id AWSLambda-SHA384-ECDSA \
  --signature-validity-period value=12,type=MONTHS
```

**Lambda Code Signing Config:**
- `UntrustedArtifactOnDeployment`: Warn 또는 Enforce
- Enforce 시: 서명되지 않거나 신뢰하지 않은 Profile로 서명된 코드는 배포 거부

### 3. Inspector — 의존성·이미지 취약점 스캔

- **EC2 인스턴스**: SSM Agent 통해 OS·언어 패키지 스캔
- **컨테이너 이미지**: ECR 푸시 시 자동 스캔 (Enhanced scanning)
- **Lambda 함수**: 코드와 의존성 스캔 (2023+)
- CVE DB 기반, CVSS 점수
- Findings → Security Hub로 자동 전송

### 4. DevSecOps Shift-Left 파이프라인

```
Pre-commit (개발자 로컬)
   ├─ pre-commit hook
   └─ git-secrets (AWS 키 누출 차단)

Pull Request
   ├─ CodeGuru Reviewer/Security
   ├─ SAST (Snyk Code, Checkmarx)
   ├─ SCA (npm audit, Snyk Open Source)
   └─ Secret scan (TruffleHog, GitGuardian)

Build
   ├─ Inspector (image scan on ECR push)
   ├─ Trivy (컨테이너 OSS 스캔)
   └─ SBOM 생성 (Syft/CycloneDX)

Deploy
   ├─ Signer 검증
   ├─ Admission Controller (ECS/EKS)
   └─ Policy as Code (OPA Gatekeeper, Kyverno)

Runtime
   ├─ GuardDuty (런타임 위협)
   ├─ CodeGuru Profiler
   └─ Security Hub (집계)
```

### 5. 시크릿 누출 방지

- **git-secrets**: AWS 키 패턴 매칭, pre-commit hook
- **GitHub Secret Scanning**: GitHub Advanced Security 또는 무료 PSP(Public Secret Push Protection)
- **AWS Secrets Manager**: 빌드 시 환경 변수로 주입 (저장소에 키 두지 않음)
- **CodeBuild의 secrets-manager 통합**: env.secrets-manager 블록

---

## 🧠 알아두면 좋은 심화 이론

### Lambda Code Signing 전체 흐름

```
Developer → CodeBuild 빌드 → S3에 zip 업로드
                                |
                                v
                       aws signer start-signing-job
                                |
                                v
                          Signed S3 object
                                |
                                v
                    aws lambda update-function-code
                          --code-signing-config-arn ...
                                |
                                v
                  Lambda가 Signing Profile 검증
                  Untrusted → Deploy 거부
```

> ⚠️ **함정**: `UntrustedArtifactOnDeployment=Warn`은 경고만 — 실제 배포 차단은 `Enforce`.

### Multi-AZ/Multi-Region 서명 검증

- Signing Profile은 리전별
- 동일 코드를 여러 리전에 배포하려면 각 리전에 동일한 Profile 또는 Cross-Region 검증 패턴
- 또는 모든 빌드를 한 리전에서 서명 + 검증 시 신뢰 Profile ARN을 명시

### CodeGuru Reviewer 비용/효과

- 라인 수 기준 과금 (월별)
- Bedrock 기반 LLM 추가 인사이트 (2024+)
- 빌드 차단 안 함 — PR 코멘트만. 강제하려면 Approval Rule + 봇 검사 추가

### Inspector vs Trivy vs Snyk

| 도구 | 강점 | AWS 통합 |
|------|------|----------|
| **Inspector** | ECR/EC2/Lambda 네이티브 | Security Hub 자동 |
| **Trivy** | OSS, 멀티 형식 (이미지/IaC/SBOM) | CodeBuild에서 실행 |
| **Snyk** | 개발자 친화 UX, IDE 통합 | 외부 SaaS |
| **CodeGuru Security** | LLM 기반 코드 분석 | 네이티브 |

### Container Signing - cosign vs AWS Signer

| 도구 | 표준 | 키 관리 |
|------|------|---------|
| **AWS Signer for Containers** | Notary v2 | KMS 자동 |
| **cosign (Sigstore)** | OCI 1.1 | OIDC 기반 keyless |

EKS에서 Image Policy Admission (`policy-controller`)으로 강제 가능.

### 관련 서비스 Cross-Reference

- **Security Hub** → Week 14 Day 2
- **Inspector** → Week 14 Day 4
- **Secrets Manager** → Week 9 Day 4
- **ECR Image Scan** → Week 6 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
Shift-Left Security Pipeline
==================================================

  Developer Laptop
    +-- git-secrets (pre-commit)
    +-- IDE: Snyk / CodeGuru
            |
            v
  CodeCommit / GitHub
    +-- CodeGuru Reviewer (PR auto-comment)
    +-- CodeGuru Security (PR Finding)
    +-- GitHub Secret Scanning
            |
            v
  CodeBuild
    +-- SAST (Checkmarx / SonarQube)
    +-- SCA (Snyk / npm audit)
    +-- Container build → Trivy → ECR
    +-- SBOM generation (Syft)
            |
            v
  ECR (Push)
    +-- Inspector Enhanced Scanning
    +-- Image signing (AWS Signer)
            |
            v
  CodeDeploy / EKS Admission
    +-- Verify signature
    +-- OPA Gatekeeper / Kyverno policy
            |
            v
  Production
    +-- GuardDuty Runtime
    +-- Security Hub aggregation
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ CodeGuru **Reviewer**(코드 품질) vs **Security**(보안 패턴) vs **Profiler**(런타임) 구분
2. ⭐ Lambda Code Signing은 `UntrustedArtifactOnDeployment=Enforce` 일 때만 차단
3. ⭐ Inspector는 EC2/Container/Lambda 모두 스캔 → Security Hub 자동 집계
4. ⭐ "Shift Left" — 보안 검사는 가능한 한 PR 단계까지 앞당김
5. ⭐ Secrets Manager로 빌드 시 시크릿 주입, 저장소엔 절대 두지 않음

---

## 💻 실제 예시 - Signer + Lambda Code Signing

```bash
# 1) Signing Profile 생성
aws signer put-signing-profile \
  --profile-name LambdaProd \
  --platform-id AWSLambda-SHA384-ECDSA

# 2) Code Signing Config 생성
aws lambda create-code-signing-config \
  --description "Prod CodeSigning" \
  --allowed-publishers SigningProfileVersionArns=arn:aws:signer:...:profile/LambdaProd \
  --code-signing-policies UntrustedArtifactOnDeployment=Enforce

# 3) 빌드 zip을 S3에 업로드 후 서명
aws signer start-signing-job \
  --source 's3={bucketName=builds,key=app.zip,version=abc123}' \
  --destination 's3={bucketName=signed,prefix=signed/}' \
  --profile-name LambdaProd

# 4) Lambda 함수 업데이트 (Code Signing Config 연결)
aws lambda update-function-code \
  --function-name MyFn \
  --s3-bucket signed \
  --s3-key signed/abc123/app.zip

aws lambda put-function-code-signing-config \
  --function-name MyFn \
  --code-signing-config-arn arn:aws:lambda:...:code-signing-config:csc-xxx
```

**출력 예시 (Untrusted 시):**
```
An error occurred (CodeSigningConfigNotFoundException) when calling UpdateFunctionCode:
  Code signing config not found, or artifact is not signed by trusted publisher
```

---

## 📝 연습 문제

**문제 1.** 다음 중 PR 단계에서 자동 코드 리뷰를 위한 가장 적절한 AWS 서비스는?

A) CodeGuru Profiler
B) CodeGuru Reviewer + CodeGuru Security
C) Inspector
D) GuardDuty

**정답: B**
해설: Profiler는 런타임, Inspector는 의존성/이미지, GuardDuty는 런타임 위협. PR 단계 코드 분석은 Reviewer + Security.

---

**문제 2.** Lambda 배포에 서명 검증을 강제하려면 어떤 설정이 필요한가?

A) `UntrustedArtifactOnDeployment=Warn`
B) `UntrustedArtifactOnDeployment=Enforce`
C) Lambda Layer 추가
D) Provisioned Concurrency 활성화

**정답: B**
해설: Warn은 경고만, Enforce가 차단.

---

**문제 3.** ECR에 푸시되는 모든 이미지를 자동 스캔하려면?

A) ECR Enhanced Scanning (Inspector 통합) 활성화
B) Lambda로 매번 수동 스캔
C) S3 객체 알림
D) CloudTrail로 사후 분석

**정답: A**
해설: Inspector Enhanced Scanning이 ECR 푸시마다 자동 스캔. 결과는 Security Hub로 전송.

---

**문제 4.** "Shift Left" 원칙에 가장 부합하는 조치는?

A) 프로덕션 배포 후 사후 침투 테스트
B) IDE/PR 단계에서 SAST·SCA·시크릿 스캔 자동화
C) 보안 검사를 분기에 한 번 수동 실행
D) 사용자에게 취약점 보고 받기

**정답: B**
해설: Shift Left = 보안 검사를 SDLC 앞 단계로 이동. PR/IDE 단계가 가장 빠름.

---

**문제 5.** 빌드 시 DB 비밀번호가 필요하다. 가장 안전한 주입 방식은?

A) buildspec.yml에 하드코딩
B) GitHub Secrets에 평문 저장
C) Secrets Manager에 저장 후 CodeBuild env.secrets-manager로 참조
D) S3에 평문 텍스트로 저장

**정답: C**
해설: Secrets Manager + CodeBuild 통합이 표준. 자동 회전, 감사 로그, 단일 진실 출처.

---

**문제 6.** CodeGuru Reviewer를 PR 머지의 필수 게이트로 만들려면?

A) CodeGuru Reviewer가 자동 차단
B) Approval Rule + 봇이 CodeGuru Finding을 확인하고 승인 또는 거부
C) Branch Protection의 Required Status Check + CodeBuild가 Finding 0이 아니면 실패 status push
D) B와 C 모두 가능

**정답: D**
해설: CodeGuru 자체는 차단 안 함. 외부 강제 메커니즘이 필요. B(승인 게이트) 또는 C(상태 체크) 둘 다 패턴.

---

**문제 7.** SBOM(Software Bill of Materials) 생성·관리에 적합한 도구는?

A) Syft / CycloneDX / SPDX
B) CloudTrail
C) Config
D) Trusted Advisor

**정답: A**
해설: SBOM은 표준 형식. Syft가 OSS 도구. CodeArtifact는 패키지 저장소, SBOM 생성기는 아님.

---

## 📌 오늘의 요약

1. CodeGuru = Reviewer(품질) + Security(보안) + Profiler(런타임 비용/성능)
2. AWS Signer로 Lambda·컨테이너·일반 코드 서명, Enforce 모드에서만 검증 강제
3. Inspector Enhanced Scanning이 ECR/EC2/Lambda를 자동 스캔
4. Shift Left = 보안 검사를 PR/IDE 단계까지 앞당김
5. Secrets Manager + CodeBuild 통합으로 시크릿 노출 차단
