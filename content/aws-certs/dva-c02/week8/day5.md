# Day 40 - Week 8 복습 + 연습문제 (CI/CD)

📅 날짜: 2026년 7월 9일 (목요일)  
🎯 주제: CI/CD 종합 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CI/CD 파이프라인의 각 단계를 종합 정리한다
- 실전 시험 유형의 CI/CD 문제를 풀어 실력을 점검한다

---

## 📖 Week 8 핵심 정리

### CI/CD 서비스 역할
```
CodeCommit: 소스 코드 버전 관리 (Git)
CodeBuild: 빌드, 테스트, 아티팩트 생성
CodeDeploy: EC2/Lambda/ECS 배포 자동화
CodePipeline: 전체 파이프라인 오케스트레이션
Elastic Beanstalk: PaaS, 인프라 자동 관리
```

### CodeDeploy 배포 전략
```
EC2:
  AllAtOnce: 동시 배포, 다운타임 있음
  Rolling: 순차 배포, 용량 감소
  OneAtATime: 하나씩, 가장 안전
  
Lambda:
  Canary: 10% 테스트 후 100% 전환
  Linear: 점진적 증가
  AllAtOnce: 즉시 전환

Beanstalk:
  Immutable: 새 ASG 생성, 가장 안전
  Blue/Green: 새 환경 생성, URL 스왑
```

---

## 아키텍처 다이어그램

```
완전한 AWS CI/CD 파이프라인
================================

[개발자] git push
     |
     v
[CodeCommit] → EventBridge 트리거
     |
     v
[CodePipeline]
  Stage 1: Source (CodeCommit)
  Stage 2: Build (CodeBuild)
     - buildspec.yml 실행
     - 단위 테스트
     - 아티팩트 → S3
  Stage 3: Staging Deploy (CodeDeploy)
     - 스테이징 환경 배포
  Stage 4: Manual Approval
     - 관리자 검토/승인
  Stage 5: Prod Deploy (CodeDeploy)
     - 프로덕션 환경 배포
     - Canary 배포 전략
```

---

## 🧠 Week 8 시험 함정 & 약어

### 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| CodeCommit | GitHub | 프라이빗·IAM vs 공개 가능·OAuth |
| buildspec.yml | appspec.yml | CodeBuild vs CodeDeploy |
| install | pre_build | 의존성 vs 빌드 전 작업 |
| In-Place | Blue/Green | EC2 같은 인스턴스 vs 새 환경 |
| AllAtOnce | OneAtATime | 빠름·위험 vs 느림·안전 |
| Canary | Linear | 한 번에 일부+5분 후 100% vs 점진적 |
| Lambda Canary | Lambda AllAtOnce | 두 버전 분할 vs 즉시 |
| ECS In-Place | ECS Blue/Green | 미지원 vs 유일 옵션 |
| Beanstalk Rolling | Immutable | 같은 ASG vs 새 ASG |
| Beanstalk Web | Worker | ALB·요청 vs SQS·백그라운드 |
| Manual Approval | EventBridge | 사람 승인 vs 자동 알림 |
| CodePipeline V1 | V2 | 단순 vs 변수·필터·실행 모드 |
| CodeArtifact | CodeCommit | 패키지 저장소 vs 소스 코드 |
| Trigger | Notification | SNS·Lambda vs Chatbot·Slack |
| .ebextensions | .platform | AL1 vs AL2/AL2023 |

### Week 8 시험 함정 15가지

1. **EC2는 CodeDeploy Agent 필수**
2. **ECS는 Blue/Green만**
3. **Lambda 배포 전략 5종 이름 정확히** (Canary10Percent + 시간)
4. **CodeBuild buildspec.yml 순서**: install → pre_build → build → post_build
5. **CodeBuild 환경 변수**: variables / parameter-store / secrets-manager
6. **CodeBuild Docker 빌드** → privileged mode 활성화 필수
7. **CodePipeline 단계 간 데이터 = S3 아티팩트**
8. **Beanstalk Immutable = 새 ASG**
9. **Beanstalk Worker = SQS + 에이전트**
10. **Beanstalk 환경 안 RDS는 환경 삭제 시 함께 삭제 위험**
11. **CodeCommit 2024년 7월 이후 신규 가입 불가** (시험에는 여전히)
12. **CodeDeploy Lambda 자동 롤백 = CloudWatch Alarm 위반**
13. **appspec.yml 라이프사이클 훅** EC2: 10단계, Lambda: 2단계
14. **Manual Approval 7일 응답 없으면 자동 거부**
15. **Cross-Account 배포 = 대상 계정 IAM 역할 + PassRole**

### Week 8 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **CI / CD** | Continuous Integration / Delivery / Deployment |
| **IaC** | Infrastructure as Code |
| **PaaS** | Platform as a Service (Beanstalk) |
| **SaaS / IaaS** | Software / Infrastructure as a Service |
| **CFN** | CloudFormation |
| **EB** | Elastic Beanstalk |
| **SDLC** | Software Development Life Cycle |
| **MTTR / MTBF** | Mean Time To Recovery / Between Failures |
| **DORA** | DevOps Research and Assessment (4 metrics) |
| **CodeBuild** | aws/codebuild/* 이미지 |
| **AMI** | Amazon Machine Image (Beanstalk가 사용) |
| **ASG** | Auto Scaling Group |
| **JIT** | Just-In-Time (배포) |

---

## 📝 Week 8 종합 연습문제

**문제 1.** buildspec.yml의 단계 순서는?

A) pre_build → install → build → post_build  
B) install → pre_build → build → post_build  
C) build → install → pre_build → post_build  
D) install → build → pre_build → post_build  

**정답: B** - buildspec.yml의 phases 순서는 install → pre_build → build → post_build입니다.

---

**문제 2.** Lambda 배포에서 점진적으로 트래픽을 전환하는 전략은?

A) AllAtOnce  
B) Blue/Green  
C) Canary 또는 Linear  
D) Rolling  

**정답: C** - Lambda Canary나 Linear 배포 전략은 점진적으로 새 버전으로 트래픽을 전환합니다.

---

**문제 3.** CodeDeploy에서 EC2 배포에 필요한 것은?

A) IAM 역할만  
B) CodeDeploy Agent 설치  
C) VPC 구성  
D) S3 버킷  

**정답: B** - EC2에 CodeDeploy를 사용하려면 각 인스턴스에 CodeDeploy Agent를 설치해야 합니다.

---

**문제 4.** Beanstalk에서 환경 설정 커스터마이징에 사용하는 파일은?

A) Dockerfile  
B) buildspec.yml  
C) appspec.yml  
D) .ebextensions/*.config  

**정답: D** - Elastic Beanstalk는 .ebextensions 폴더의 .config 파일로 환경을 커스터마이징합니다.

---

**문제 5.** CodePipeline에서 단계 간 데이터 전달 방법은?

A) 메모리 공유  
B) S3 아티팩트  
C) DynamoDB  
D) SQS 메시지  

**정답: B** - CodePipeline은 단계 간에 S3 아티팩트를 통해 데이터를 전달합니다.

---

**문제 6.** appspec.yml의 ValidateService 훅은 언제 실행되는가?

A) 배포 시작 전  
B) 파일 설치 중  
C) 애플리케이션 시작 후 검증  
D) 배포 취소 시  

**정답: C** - ValidateService는 애플리케이션이 시작된 후 서비스가 정상 동작하는지 검증하는 단계입니다.

---

**문제 7.** Beanstalk의 가장 안전한 배포 전략은?

A) All at once  
B) Rolling  
C) Rolling with Additional Batch  
D) Immutable  

**정답: D** - Immutable 배포는 새 ASG에 새 버전을 배포하고 검증 후 전환하므로 가장 안전합니다.

---

**문제 8.** CI/CD에서 "지속적 전달(Continuous Delivery)"의 의미는?

A) 매 커밋마다 자동으로 프로덕션 배포  
B) 자동으로 스테이징 배포, 프로덕션은 수동 승인  
C) 수동 빌드, 자동 배포  
D) 자동 빌드, 수동 배포  

**정답: B** - 지속적 전달은 자동으로 스테이징까지 배포하고, 프로덕션 배포는 수동 승인(Manual Approval) 후 진행합니다.

---

## 📌 오늘의 요약

1. CodeCommit: Git 소스 저장, IAM/SSH/HTTPS 인증
2. CodeBuild: buildspec.yml로 빌드/테스트/아티팩트 생성
3. CodeDeploy: appspec.yml로 EC2/Lambda/ECS 배포, 다양한 배포 전략
4. CodePipeline: 전체 파이프라인 오케스트레이션, S3로 아티팩트 전달
5. Beanstalk: PaaS, .ebextensions 커스터마이징, Immutable이 가장 안전
