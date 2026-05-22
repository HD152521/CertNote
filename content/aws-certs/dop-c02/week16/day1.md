# Day 1 - 도메인 1·2 복습 (SDLC 자동화 + IaC)

📅 날짜: Week 16 (Day 1)
🎯 주제: 시험 도메인 1(22%) + 2(17%) 총 39% 핵심 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 도메인 1(SDLC 자동화) 핵심 서비스/패턴 한 번에 정리
- 도메인 2(IaC + 구성 관리) 핵심 서비스/패턴 한 번에 정리
- 자주 헷갈리는 비교/트레이드오프 표로 정리

---

## 🧩 사전 지식 (CS 기초)

- **도메인 1 (22%)**: 빌드/테스트/배포 자동화, 파이프라인, 아티팩트 관리
- **도메인 2 (17%)**: CloudFormation/CDK, SSM, AppConfig, Secrets/Parameter
- 두 도메인 합계 39% → 가장 비중 큼, 정확도 최우선

---

## 📖 이론 내용

### 1. 도메인 1: SDLC 자동화 핵심 서비스

| 서비스 | 역할 | Pro 출제 포인트 |
|--------|------|------------------|
| CodeCommit | Git 리포 | 트리거, 크로스 계정, 종료 임박(2024 신규 가입 불가) |
| CodeBuild | 빌드 | VPC 모드, 캐시(S3/Local), Graviton, Secrets 주입 |
| CodeDeploy | 배포 | In-place/B-G, Lambda Canary/Linear, ECS B-G, Hook |
| CodePipeline | 오케스트레이션 | V2 변수/트리거, Cross-Account, Manual Approval |
| CodeArtifact | 패키지 저장소 | 외부 프록시, 도메인, KMS, Org 공유 |
| Code Signing | 서명 | Lambda/AMI/컨테이너 서명 검증 |
| CodeGuru Reviewer | 코드 리뷰 | PR 자동 코멘트 |
| CodeCatalyst | 통합 개발 환경 | Blueprint, 환경 정의 |

### 2. 배포 전략 비교

| 전략 | 다운타임 | 비용 | 롤백 |
|------|---------|------|------|
| In-place | 있음 | 낮음 | 느림 |
| Blue/Green | 없음 | 2배 | 즉시 |
| Canary | 없음 | 약간 | 자동 |
| Linear | 없음 | 약간 | 자동 |
| All-at-once | 있음 | 낮음 | 느림 |

Lambda는 Canary(2단계) / Linear(N% 증분) / AllAtOnce, ECS는 Blue/Green이 표준.

### 3. 도메인 2: IaC + 구성 관리

| 서비스 | 핵심 |
|--------|------|
| CloudFormation | 표준, Drift Detection, Change Set, StackSets |
| CDK | 코드로 인프라, Pipelines(CDK Pipelines) |
| Terraform | 멀티 클라우드, AFT의 기반 |
| SSM Parameter Store | 무료 / SecureString / 버전 / 정책 |
| Secrets Manager | 회전, 비용 ↑, 자동 회전 Lambda |
| AppConfig | 피처 플래그, 점진 롤아웃, Validator |
| SSM Run Command/State Manager | 명령/상태 강제 |
| Patch Manager | 패치 베이스라인 + 유지보수 윈도 |

### 4. CloudFormation 고급 패턴

- **Nested Stack**: 모듈화, AWS::CloudFormation::Stack
- **Cross-Stack**: Export/Fn::ImportValue (강결합)
- **StackSets**: 멀티 계정/리전, Service-Managed(Org) / Self-Managed
- **Change Set**: 변경 미리보기
- **Drift Detection**: 콘솔/CLI/이벤트 기반
- **Custom Resource**: Lambda로 임의 동작
- **Modules / Hooks(Guard)**: 검증/모듈화

### 5. Parameter Store vs Secrets Manager

| 항목 | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| 비용 | 표준 무료 | 시크릿당 월 $0.40 |
| 자동 회전 | 직접 구현 | 내장 |
| 크기 | 표준 4KB / 고급 8KB | 64KB |
| 정책 | IAM | IAM + Resource Policy |
| 권장 | 비밀이 아닌 설정 | DB/외부 API 자격 |

---

## 🧠 자주 헷갈리는 함정

1. **CodePipeline Artifact Store는 KMS 키 필수** (Cross-Account 시 Customer Managed Key)
2. **CodeBuild VPC 모드**는 NAT/PrivateLink 필요 (인터넷 차단 시)
3. **CodeDeploy Lambda Canary는 Alias 필수**
4. **StackSets Service-Managed = Org 신뢰 관계 필수**
5. **AppConfig는 클라이언트 라이브러리(Lambda Extension)로 폴링** — 푸시 아님

---

## 🏗️ 아키텍처 다이어그램

```
도메인 1+2 통합 표준 파이프라인
==================================================

  Developer
    │
    ▼
  CodeCommit/GitHub ──► CodePipeline ──► CodeBuild
                                            │
                          ┌─────────────────┤
                          ▼                 ▼
                  CodeArtifact         ECR + Inspector
                                            │
                                            ▼
                              CodeDeploy (Lambda/ECS/EC2)
                                            │
                                            ▼
                              CloudFormation/CDK Deploy
                                            │
                                            ▼
                              SSM Parameter / Secrets / AppConfig
```

---

## ⭐ 핵심 포인트

1. ⭐ CodePipeline V2 변수/트리거 + Cross-Account KMS는 단골
2. ⭐ Lambda Canary/Linear, ECS Blue/Green이 가장 자주 출제
3. ⭐ StackSets Service-Managed = Org 자동 배포
4. ⭐ Parameter Store(설정) vs Secrets Manager(자격) 구분
5. ⭐ AppConfig는 피처 플래그 + Validator(JSON Schema/Lambda)

---

## 💻 빠른 CLI 점검

```bash
# CodePipeline V2 변수
aws codepipeline create-pipeline --cli-input-json file://pipeline-v2.json

# CodeDeploy Lambda Canary
aws deploy create-deployment-config \
  --deployment-config-name Canary50-5min \
  --compute-platform Lambda \
  --traffic-routing-config type=TimeBasedCanary,timeBasedCanary={canaryPercentage=50,canaryInterval=5}

# StackSets Service-Managed
aws cloudformation create-stack-set --stack-set-name Baseline \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --template-body file://baseline.yaml

# Secrets Manager 회전
aws secretsmanager rotate-secret --secret-id prod/db --rotation-lambda-arn arn:...:RotateRDS --rotation-rules AutomaticallyAfterDays=30
```

---

## 📝 연습 문제 (Pro 시나리오형 6문항)

**1.** Tooling Account의 CodePipeline이 Spoke 계정에 배포할 때 빠뜨리면 안 되는 것?
A) IAM User 키 B) **Cross-Account KMS Key on Artifact S3 + Cross-Account Role**
C) VPC Peering D) Route 53
**정답: B**

**2.** Lambda 함수를 5분마다 50%씩 두 단계 배포?
A) Linear10Every1Minute B) **Canary50Percent5Minutes**
C) AllAtOnce D) Rolling
**정답: B**

**3.** 60개 계정에 동일 Config Rule 자동 적용 + 신규 계정 자동 포함?
A) Aggregator만 B) **StackSets Service-Managed + Auto-Deployment**
C) Lambda 스크립트 D) Control Tower 수동
**정답: B**

**4.** RDS 자격을 90일마다 자동 회전하고 애플리케이션은 코드 변경 없어야 한다?
A) Parameter Store SecureString B) **Secrets Manager + Rotation Lambda**
C) S3 + KMS D) ENV 변수
**정답: B**

**5.** 피처 플래그를 점진 롤아웃하고 잘못된 값은 사전 검증 차단?
A) Parameter Store B) **AppConfig + Validator(JSON Schema/Lambda) + Deployment Strategy**
C) Secrets Manager D) CodeDeploy
**정답: B**

**6.** CloudFormation 변경 사항을 적용 전에 영향 미리보기?
A) Drift Detection B) **Change Set**
C) Stack Policy D) Rollback Configuration
**정답: B**

---

## 📌 오늘의 요약

1. 도메인 1+2 합계 39% — 정확도 최우선
2. Cross-Account Pipeline = KMS Customer Managed Key 필수
3. Lambda Canary/Linear, ECS B/G가 단골 출제
4. StackSets Service-Managed = Org 통합 표준
5. AppConfig + Validator로 안전한 피처 플래그
