# Day 1 - CodeCommit 심화 - 트리거, 브랜치 보호, 크로스 계정

📅 날짜: Week 2 (Day 1)
🎯 주제: 관리형 Git 저장소의 자동화·보안·멀티 계정 활용
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CodeCommit의 인증 방식 3종(HTTPS-Git, SSH, AWS CLI Credential Helper)을 구분한다
- 푸시·PR·브랜치 이벤트를 EventBridge/SNS/Lambda로 자동화한다
- approval rule template으로 PR 정책을 강제한다
- 크로스 계정 접근(IAM Role + Resource Policy) 구성을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Trunk-based Development**: main 브랜치 중심, 단명 feature 브랜치. DORA Elite 팀이 선호.
- **GitFlow**: develop/release/hotfix 브랜치 체계. 복잡하지만 릴리스 주기 길 때 유용.
- **PR(Pull Request)**: 변경 사항 머지 요청. 코드 리뷰의 단위.
- **Merge vs Rebase vs Squash**: 머지 방식 3종. 히스토리 가독성과 트레이드오프.
- **Branch Protection**: 보호된 브랜치 직접 푸시 금지, PR + 승인 강제.
- **CODEOWNERS**: 디렉토리별 자동 리뷰어 지정.

---

## 📖 이론 내용

### 1. CodeCommit 인증 방식

| 방식 | 사용 사례 | 자격 증명 |
|------|-----------|-----------|
| **HTTPS Git Credentials** | 개발자 개인 로컬 | IAM에서 발급한 username/password |
| **SSH Keys** | 개인 또는 자동화 | IAM 사용자에 SSH 공개키 업로드 |
| **HTTPS + AWS CLI Credential Helper** | EC2/CodeBuild/Lambda | IAM Role을 통한 STS 자격 증명 |
| **HTTPS + git-remote-codecommit (GRC)** | 페더레이션/MFA | `codecommit::region://profile@repo` |

> ⚠️ **함정**: IAM User 액세스 키를 git에 직접 사용 못 함. CodeCommit은 별도 Git 자격 증명 발급 또는 GRC 헬퍼 필요.

### 2. 푸시·PR 트리거 자동화

CodeCommit은 다음 이벤트를 EventBridge에 자동 발행:

- `CodeCommit Repository State Change` (push/branch create/delete)
- `CodeCommit Pull Request State Change` (created/closed/merged)
- `CodeCommit Comment on Pull Request`
- `CodeCommit Comment on Commit`

**전통적 트리거 메뉴(legacy)**: 저장소 자체의 Triggers 탭에서 SNS/Lambda 직접 연결 (제한적).

**모던 권장**: EventBridge Rule → Lambda/Step Functions/CodePipeline.

```json
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Pull Request State Change"],
  "detail": {
    "event": ["pullRequestCreated", "pullRequestSourceBranchUpdated"]
  }
}
```

### 3. Approval Rule Template (브랜치 보호)

GitHub의 "Required Reviewers"에 해당.

- Account 수준에서 템플릿 생성
- 저장소에 연결
- 룰: 최소 N명 승인 / 특정 IAM Principal 승인 필수 / 특정 브랜치만 적용

```bash
aws codecommit create-approval-rule-template \
  --approval-rule-template-name "RequireTwoApprovals-main" \
  --approval-rule-template-content '{
    "Version": "2018-11-08",
    "DestinationReferences": ["refs/heads/main"],
    "Statements": [{
      "Type": "Approvers",
      "NumberOfApprovalsNeeded": 2,
      "ApprovalPoolMembers": [
        "arn:aws:sts::123456789012:assumed-role/SeniorDeveloperRole/*"
      ]
    }]
  }'

aws codecommit associate-approval-rule-template-with-repository \
  --approval-rule-template-name "RequireTwoApprovals-main" \
  --repository-name MyApp
```

### 4. 크로스 계정 접근 패턴

**시나리오**: Account A에 CodeCommit, Account B의 CodePipeline이 소스로 사용.

**필수 구성:**
1. Account A에서 CodeCommit Resource Policy로 Account B의 Role을 허용
2. Account B의 CodePipeline 역할에 CodeCommit Read 권한 추가
3. (V2 파이프라인) Cross-Account Source Action 사용
4. CodeCommit Source Action에 `roleArn` 명시 (Account A의 역할)

```json
// Account A: CodeCommit repository resource policy
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::B-ACCOUNT:role/CrossAccountSourceRole"
    },
    "Action": [
      "codecommit:GitPull",
      "codecommit:GetBranch",
      "codecommit:GetCommit",
      "codecommit:UploadArchive",
      "codecommit:GetUploadArchiveStatus"
    ],
    "Resource": "arn:aws:codecommit:ap-northeast-2:A-ACCOUNT:MyApp"
  }]
}
```

### 5. CodeCommit Sunset 관련 시험 주의

- 2024년 7월 25일 이후 신규 고객 가입 중단
- 기존 고객은 신규 리포지토리 생성 포함 계속 사용 가능
- Pro 시험엔 여전히 빈출 — 시험 답에서 "GitHub로 강제 이전"이 항상 정답은 아님
- 마이그레이션 시나리오가 점차 늘어남 (CodeCommit → GitHub Enterprise → 동기화)

---

## 🧠 알아두면 좋은 심화 이론

### CodeCommit Replication 패턴

CodeCommit은 네이티브 cross-region 복제 미지원. 대안:

- EventBridge → Lambda → 다른 리전 CodeCommit으로 `git push --mirror`
- 또는 외부 GitHub로 미러링 (DR 목적)

### Branch Protection 실무 패턴 (Trunk-based)

| 룰 | 적용 |
|----|------|
| 직접 push 금지 | IAM 정책으로 `codecommit:GitPush` + 조건 `aws:RequestedRegion` 등으로 제한 어려움 → Approval Rule + 코드 리뷰 강제 |
| 최소 2명 승인 | Approval Rule Template |
| 자동화 봇 승인 차단 | ApprovalPool에서 봇 IAM 제외 |
| 머지 후 자동 배포 | EventBridge `pullRequestMergedStatusUpdated` → CodePipeline |

### CodeCommit + CodeGuru Reviewer 통합

PR 생성 시 자동 코드 리뷰:

1. CodeCommit 저장소를 CodeGuru Reviewer에 연결
2. PR 생성 → CodeGuru가 코멘트 자동 작성
3. 보안/성능 이슈를 Approval Rule과 결합 (CodeGuru 승인 후 머지)

### GitHub vs CodeCommit — 빈출 비교

| 항목 | CodeCommit | GitHub.com / Enterprise |
|------|------------|--------------------------|
| 인증 | IAM | GitHub User + OIDC |
| PR | 기본 + Approval Rule | 기본 + Required Reviewers + CODEOWNERS |
| Actions | 없음 (외부 트리거) | GitHub Actions 내장 |
| 시크릿 저장 | Secrets Manager 별도 | GitHub Secrets / Org Secrets |
| 신규 가입 | 중단 | 일반 가입 |
| AWS 통합 | 네이티브 | OIDC로 가능 |

### 관련 서비스 Cross-Reference

- **EventBridge** → Week 12 Day 1
- **Approval Rule Template** → Week 5 Day 3 (Manual Approval Action과 다름)
- **CodeGuru Reviewer** → Week 2 Day 4
- **Cross-Account** → Week 1 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
CodeCommit Trigger Flow
==================================================

  Developer
     |
     v git push refs/heads/feat/*
  +-------------+
  | CodeCommit  |
  |  MyApp.git  |
  +------+------+
         |
         +---> Event: pullRequestCreated
         |       |
         |       v
         |  +---------------+
         |  | EventBridge   |
         |  | Rule          |
         |  +-------+-------+
         |          |
         |    +-----+------+--------+
         |    v            v        v
         |  CodeBuild    Lambda    Slack
         |  (lint/      (CODEOWN  (Chatbot
         |   tests)     -ERS bot) notify)
         |
         +---> Event: pullRequestMergedStatusUpdated
                |
                v
           CodePipeline
           (deploy main)

Approval Rule:
  - 2 senior approvals required for main
  - CodeGuru Reviewer comment required to be addressed
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ CodeCommit은 IAM 자격 증명을 직접 git에 못 씀 — Git Credential 또는 GRC 사용
2. ⭐ Approval Rule Template로 머지 정책 강제 (코드 리뷰 2인)
3. ⭐ EventBridge에 푸시/PR 이벤트가 자동 발행 → 모든 자동화의 시작점
4. ⭐ Cross-Account: Resource Policy + IAM Role + 파이프라인의 `roleArn`
5. ⭐ CodeCommit은 신규 가입 중단됐지만 기존 고객은 신규 리포지토리 생성 가능

---

## 💻 실제 예시 - PR 자동 빌드 및 코멘트 봇

```bash
# 1) EventBridge Rule 생성
aws events put-rule \
  --name "PR-Created-Trigger" \
  --event-pattern '{
    "source": ["aws.codecommit"],
    "detail-type": ["CodeCommit Pull Request State Change"],
    "detail": {
      "event": ["pullRequestCreated", "pullRequestSourceBranchUpdated"],
      "repositoryNames": ["MyApp"]
    }
  }'

# 2) CodeBuild를 Target으로 추가
aws events put-targets \
  --rule "PR-Created-Trigger" \
  --targets 'Id=1,Arn=arn:aws:codebuild:ap-northeast-2:111:project/MyApp-PR-Lint,RoleArn=arn:aws:iam::111:role/EventsInvokeCodeBuildRole,Input=...'

# 3) CodeBuild가 완료되면 Lambda를 통해 PR에 코멘트
# Lambda code (Python boto3):
# codecommit.post_comment_for_pull_request(
#     pullRequestId="...", repositoryName="MyApp", beforeCommitId="...", afterCommitId="...",
#     content="Build status: PASSED\nCoverage: 87%\n")
```

**출력 예시 (PR에 코멘트):**
```
Build status: PASSED
Lint: 0 errors, 2 warnings
Unit tests: 142/142 passed
Coverage: 87%
CodeGuru Reviewer: 1 suggestion (line 42: prefer ImmutableList)
```

---

## 📝 연습 문제

**문제 1.** CodeCommit에 EC2 인스턴스에서 git push 하려 한다. 가장 안전하고 표준적인 인증 방식은?

A) IAM User 액세스 키를 ~/.aws/credentials에 저장
B) Git Credential (IAM에서 발급한 HTTPS Git 자격 증명)
C) EC2 IAM Role + AWS CLI Credential Helper (HTTPS)
D) Root 사용자 자격 증명을 환경 변수로

**정답: C**
해설: EC2에는 IAM Role이 표준 — Credential Helper가 자동으로 STS 자격을 git에 주입. 정적 키 보관 불필요.

---

**문제 2.** Approval Rule Template로 강제할 수 있는 것이 아닌 것은?

A) main 브랜치 PR에 최소 2명 승인
B) 특정 IAM Role의 승인 필수
C) PR 생성자의 자동 승인 차단
D) PR 생성 시 자동 빌드 실행

**정답: D**
해설: 빌드 자동 실행은 EventBridge Rule + CodeBuild로 별도 구성. Approval Rule은 승인 규칙만 정의.

---

**문제 3.** 크로스 계정 CodeCommit 소스 접근에 필수가 아닌 것은?

A) CodeCommit Resource Policy (source 계정)
B) CodePipeline 역할의 CodeCommit Read 권한 (consumer 계정)
C) Cross-Account Action에 `roleArn` 지정
D) Direct Connect 또는 VPC Peering

**정답: D**
해설: CodeCommit은 공용 엔드포인트로 접근 — 네트워크 연결 불필요. IAM/Resource Policy만으로 충분.

---

**문제 4.** PR 머지 후 자동으로 prod 파이프라인을 시작하려면?

A) EventBridge: `pullRequestMergedStatusUpdated` 또는 `referenceUpdated` (main) → CodePipeline StartExecution
B) S3 이벤트
C) SNS 토픽 구독
D) Step Functions Polling

**정답: A**
해설: EventBridge가 표준. PR 머지 이벤트 또는 main 브랜치 ref 업데이트 이벤트 둘 다 사용 가능.

---

**문제 5.** "CodeCommit이 신규 가입 중단됐다. 우리는 기존 사용자이고 새 마이크로서비스용 리포지토리가 필요하다." 사실 관계로 옳은 것은?

A) 기존 사용자도 신규 리포지토리 생성 불가
B) 기존 사용자는 신규 리포지토리 생성을 포함해 계속 사용 가능
C) 기존 리포지토리만 읽기 전용으로 유지
D) AWS Support에 요청해야 신규 생성 가능

**정답: B**
해설: AWS 공식 입장은 "신규 고객 가입 중단", 기존 고객은 정상 사용. 시험에서 자주 묻는 미묘한 경계.

---

**문제 6.** PR마다 CodeGuru Reviewer가 자동으로 코드 분석하게 하려면?

A) CodeCommit 저장소를 CodeGuru Reviewer에 연결(Associate) — 이후 PR 자동 분석
B) Lambda로 매번 CodeGuru API를 수동 호출
C) CodeBuild 단계에서 CodeGuru CLI 실행
D) Trusted Advisor 활성화

**정답: A**
해설: CodeGuru Reviewer는 저장소 연결 후 PR 자동 트리거. 추가 코드 불필요.

---

**문제 7.** CodeCommit 저장소의 DR을 위해 다른 리전으로 복제하려 한다. 가장 적절한 패턴은?

A) AWS가 자동 복제하므로 추가 작업 불필요
B) EventBridge → Lambda → `git push --mirror`로 타 리전 CodeCommit에 복제
C) S3 Cross-Region Replication만 활성화
D) Route 53 Health Check만 추가

**정답: B**
해설: CodeCommit은 네이티브 cross-region 복제 미지원. Lambda 미러링이 일반적 패턴. 외부 GitHub 미러도 가능.

---

## 📌 오늘의 요약

1. CodeCommit 인증은 IAM 자격 증명 직접 사용 불가 — Git Credential 또는 Credential Helper 사용
2. Approval Rule Template로 PR 승인 정책을 코드로 강제
3. EventBridge가 푸시/PR 이벤트를 자동 발행 — 모든 자동화의 진입점
4. 크로스 계정은 Resource Policy + Cross-Account Role
5. 신규 가입 중단 사실은 알되, 기존 고객은 신규 리포지토리 생성 가능
