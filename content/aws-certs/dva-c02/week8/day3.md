# Day 38 - CodePipeline: CI/CD 파이프라인 오케스트레이션

📅 날짜: 2026년 7월 7일 (화요일)  
🎯 주제: AWS CodePipeline  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CodePipeline의 전체 구조와 단계를 이해한다
- Source → Build → Test → Deploy 파이프라인을 구성한다
- 파이프라인 트리거 및 승인 프로세스를 구현한다

---

## 📖 이론 내용

### 1. AWS CodePipeline이란?

여러 CI/CD 서비스를 오케스트레이션하는 완전 관리형 지속적 전달 서비스입니다.

**파이프라인 단계:**
```
Source → Build → Test → Deploy → (Manual Approval) → Deploy(Prod)
```

**지원 통합:**
- 소스: CodeCommit, S3, GitHub, BitBucket
- 빌드: CodeBuild, Jenkins
- 테스트: CodeBuild, AWS Device Farm, 서드파티
- 배포: CodeDeploy, CloudFormation, Elastic Beanstalk, ECS

### 2. 파이프라인 구성 예시

```json
{
  "pipeline": {
    "name": "MyAppPipeline",
    "stages": [
      {
        "name": "Source",
        "actions": [{
          "name": "SourceAction",
          "actionTypeId": {
            "category": "Source",
            "owner": "AWS",
            "provider": "CodeCommit"
          },
          "configuration": {
            "RepositoryName": "my-app",
            "BranchName": "main"
          }
        }]
      },
      {
        "name": "Build",
        "actions": [{
          "name": "BuildAction",
          "actionTypeId": {
            "category": "Build",
            "owner": "AWS",
            "provider": "CodeBuild"
          },
          "configuration": {
            "ProjectName": "my-build-project"
          }
        }]
      },
      {
        "name": "Approve",
        "actions": [{
          "name": "ManualApproval",
          "actionTypeId": {
            "category": "Approval",
            "owner": "AWS",
            "provider": "Manual"
          }
        }]
      },
      {
        "name": "Deploy",
        "actions": [{
          "name": "DeployAction",
          "actionTypeId": {
            "category": "Deploy",
            "owner": "AWS",
            "provider": "CodeDeploy"
          }
        }]
      }
    ]
  }
}
```

### 3. 아티팩트 전달

```
[Source Stage]
  CodeCommit → 소스 코드 (artifact: SourceOutput)
        |
        v
[Build Stage]
  CodeBuild ← SourceOutput
  CodeBuild → 빌드 결과 (artifact: BuildOutput)
        |
        v
[Deploy Stage]
  CodeDeploy ← BuildOutput
```

### 4. CloudFormation 배포

```yaml
# CodePipeline에서 CloudFormation 배포 액션
- name: DeployCloudFormation
  actionTypeId:
    category: Deploy
    owner: AWS
    provider: CloudFormation
  configuration:
    ActionMode: CREATE_UPDATE
    StackName: my-app-stack
    TemplatePath: BuildOutput::template.yaml
    Capabilities: CAPABILITY_IAM
```

### 5. 파이프라인 알림

```python
# EventBridge에서 파이프라인 실패 감지
{
    "source": ["aws.codepipeline"],
    "detail-type": ["CodePipeline Pipeline Execution State Change"],
    "detail": {
        "state": ["FAILED"]
    }
}
# → SNS → 이메일 알림
```

---

## 🧠 알아두면 좋은 심화 이론

### 액션 카테고리 5종 (시험에 가끔)

| 카테고리 | 예시 |
|----------|------|
| **Source** | CodeCommit, GitHub, S3, BitBucket, ECR, Service Catalog |
| **Build** | CodeBuild, Jenkins |
| **Test** | CodeBuild, Device Farm, ServiceNow Change |
| **Approval** | Manual, ServiceNow |
| **Deploy** | CodeDeploy, ECS, CloudFormation, Elastic Beanstalk, S3, AppConfig, Service Catalog |
| **Invoke** | Lambda, Step Functions |

### 파이프라인 트리거 방식

| 방식 | 동작 |
|------|------|
| **EventBridge** (기본) | CodeCommit/ECR/S3 변경 즉시 |
| **Webhook** (GitHub) | GitHub push 시 |
| **Polling** | 1분마다 S3·GitHub 확인 (비권장) |
| **수동** | 콘솔/CLI |

### CodePipeline V2 (2023~) - 시험 신규

- **변수 (Variables)**: 단계 간 값 전달 (`#{SourceVariables.CommitId}`)
- **트리거 필터링**: 브랜치/파일 패턴 기반
- **파이프라인 실행 모드**: SUPERSEDED / QUEUED / PARALLEL

### Manual Approval 디테일

- IAM `codepipeline:PutApprovalResult` 권한 필요
- SNS 알림으로 URL 발송
- 7일 내 응답 안 하면 자동 거부
- 시험에 "프로덕션 배포 전 사람 승인" → Manual Approval

### 단계 간 데이터 (Artifact) 전달

```
Source Output (CodeCommit) → SourceArtifact
                              ↓
Build Action input = SourceArtifact
Build Action output = BuildArtifact
                              ↓
Deploy Action input = BuildArtifact
```

- 아티팩트는 **S3 버킷에 저장** (계정·리전당 1개 default)
- 암호화 옵션: AWS 관리 KMS 또는 고객 관리 키
- 보존: 30일 (자동 정리)

### Cross-Region & Cross-Account 배포

- 단계의 액션을 다른 리전에서 실행 가능
- Cross-Account: 대상 계정에 IAM 역할 생성 후 신뢰 정책 + Source 계정 PassRole

### 파이프라인 실패 시 동작

| 동작 | 설명 |
|------|------|
| **Fail** | 해당 단계만 실패 표시 |
| **재실행 (Retry)** | 콘솔/CLI로 실패 단계만 재시도 |
| **롤백 (자동)** | V2부터 단계 수준 자동 롤백 옵션 |
| **EventBridge → Lambda → 알림** | Slack/이메일 |

### Pipeline 알림 통합

| 도구 | 용도 |
|------|------|
| **EventBridge** | 모든 이벤트, Lambda·SQS·SNS로 |
| **CodeStar Notifications** | 사전 정의된 채널 (SNS, AWS Chatbot) |
| **CloudWatch** | 파이프라인 메트릭 (성공률, 지속 시간) |

### Pipeline + CloudFormation 패턴

```
[CodePipeline]
  Source: CFN 템플릿 + 앱 코드
  Build: 검증 (cfn-lint, taskcat)
  Deploy CFN to Staging
  Test 단계: 통합 테스트
  Deploy CFN to Prod
```

### Step Functions 액션 (시험 신규)

CodePipeline에 Step Functions State Machine을 액션으로 등록 → 복잡한 배포 워크플로 가능 (병렬·조건·승인 등).

### 관련 서비스 Cross-Reference

- **CodeArtifact** → 패키지 저장소 (CodeBuild가 풀)
- **AppConfig** → 런타임 설정 점진 배포 (Lambda·EC2·ECS)
- **Service Catalog** → IaC 카탈로그
- **EventBridge** → [Week 11 Day 3]

---

## 아키텍처 다이어그램

```
완전한 CI/CD 파이프라인
================================

[개발자] git push
     |
     v
[CodeCommit - Source]
     |
     | 트리거 (자동)
     v
[CodeBuild - Build/Test]
  - 단위 테스트
  - 코드 빌드
  - 아티팩트 생성 → S3
     |
     | 빌드 성공 시 자동 진행
     v
[Manual Approval] ← 관리자 승인
     |
     | 승인 시 진행
     v
[CodeDeploy - Deploy]
  - 스테이징 배포
  - 검증
  - 프로덕션 배포

각 단계 실패 시 → EventBridge → SNS → 이메일 알림
```

---

## ⭐ 핵심 포인트

1. ⭐ **CodePipeline**: 여러 서비스 오케스트레이션, 완전 자동화
2. ⭐ **Manual Approval**: 프로덕션 배포 전 인간 승인 단계
3. ⭐ **아티팩트**: 단계 간 S3를 통해 데이터 전달
4. ⭐ **트리거**: CodeCommit push 시 자동 파이프라인 시작
5. ⭐ **EventBridge**: 파이프라인 상태 변경 감지, 알림 전송

---

## 📝 연습 문제

**문제 1.** CodePipeline에서 수동 승인이 필요한 이유는?

A) 빌드 성능 향상  
B) 프로덕션 배포 전 사람의 검토/승인  
C) 비용 절감  
D) 보안 스캔  

**정답: B** - Manual Approval 단계는 프로덕션 환경 배포 전 관리자의 검토와 승인을 받기 위해 사용합니다.

---

**문제 2.** CodePipeline의 단계(Stage) 간 데이터 전달 방식은?

A) 직접 메모리 전달  
B) S3 아티팩트 버킷을 통해 전달  
C) DynamoDB를 통해 전달  
D) 직접 API 호출  

**정답: B** - CodePipeline은 단계 간에 S3 아티팩트 버킷을 통해 데이터를 전달합니다.

---

**문제 3.** CodePipeline이 지원하지 않는 소스는?

A) CodeCommit  
B) GitHub  
C) S3  
D) CodeBuild  

**정답: D** - CodeBuild는 빌드 서비스이지 소스가 아닙니다. 소스는 CodeCommit, GitHub, S3, BitBucket 등입니다.

---

**문제 4.** 파이프라인 실패 알림을 받으려면?

A) CloudTrail 사용  
B) EventBridge로 파이프라인 이벤트 감지 → SNS  
C) CloudWatch 로그 모니터링  
D) CodePipeline 콘솔에서 직접 확인  

**정답: B** - EventBridge에서 CodePipeline 실패 이벤트를 감지하고 SNS를 통해 이메일로 알림을 보낼 수 있습니다.

---

**문제 5.** CodePipeline과 Jenkins의 차이점은?

A) 지원 언어 차이  
B) CodePipeline은 완전 관리형, Jenkins는 직접 서버 관리 필요  
C) 성능 차이  
D) 비용 차이만 있음  

**정답: B** - CodePipeline은 AWS 완전 관리형 서비스이고, Jenkins는 EC2 등에 직접 설치하고 관리해야 합니다.

---

## 📌 오늘의 요약

1. CodePipeline: CI/CD 단계 오케스트레이션, Source→Build→Test→Deploy
2. 아티팩트: S3 버킷을 통해 단계 간 데이터 전달
3. Manual Approval: 프로덕션 배포 전 사람의 승인 단계 추가 가능
4. CloudFormation 통합: 인프라와 애플리케이션 코드를 함께 배포
5. EventBridge: 파이프라인 상태 변경 감지 → SNS 알림 가능
