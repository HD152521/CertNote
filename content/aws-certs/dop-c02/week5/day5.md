# Day 5 - Week 5 복습: CodePipeline 통합 시나리오

Week 5는 CodePipeline의 구조적 설계(Stage/Action/Artifact)에서 출발해, Cross-Account IAM 체인, Lambda/Step Functions/Manual Approval 확장, V2의 동적 기능까지를 다뤘다. 오늘은 이 내용을 시험 시나리오 형식으로 통합한다. 각 문제는 단일 개념이 아니라 여러 개념의 교차점에서 출제된다—실제 DOP-C02가 묻는 방식이다.

> 💡 **관련 이론**: DOP-C02 시험의 CodePipeline 문제는 "어떤 기능이 있는가"보다 "어떤 상황에서 무엇을 선택하는가"를 묻는다. 선택 기준의 키워드를 외워두는 것이 효과적이다. "15분 초과" → Step Functions. "Slack 승인" → Manual Approval + Chatbot. "외부 시스템 자동 연동" → EventBridge. "모노레포 경로 필터" → V2 filePaths. "모든 commit 이력 보존" → QUEUED. "마지막 commit만 배포" → SUPERSEDED. "KMS Access Denied" → KMS Key Policy 누락. 이 키워드-답 쌍을 인식하는 훈련이 시험 시간을 줄인다.

## Week 5 핵심 개념 지도

CodePipeline의 모든 개념은 "어떤 문제를 어떻게 해결하는가"로 연결된다.

```
[파이프라인 구조]
Pipeline > Stage > Action > Artifact
  - DAG 기반 의존성 표현
  - runOrder로 병렬/직렬 제어 (동일 runOrder = 병렬)
  - Transition으로 Stage 간 게이트 (비활성화 가능)
  - Artifact: S3 + KMS CMK (암호화 필수)
  - V1 → V2: 파이프라인 타입, 변수 시스템, 트리거 필터, Execution Mode

[Cross-Account 4종 권한 체인]
1. Pipeline Service Role (Identity Policy: sts:AssumeRole → Spoke Role ARN)
  ↓
2. Spoke Trust Policy (Resource Policy: Tooling Pipeline Role 허용)
  ↓
3. Artifact S3 Bucket Policy (Spoke Role에 GetObject/PutObject 허용)
  ↓
4. KMS Key Policy (Spoke Role에 kms:Decrypt, kms:DescribeKey 허용)
    └── 가장 자주 빠지는 것. S3 접근 성공 후 암호화 해제 단계에서 실패

[Action Provider 선택]
Lambda (< 15분, 단순) → put_job_result 필수 → 비동기 패턴
Step Functions (15분+, 복잡) → Saga 패턴, WaitForTaskToken, Parallel
Manual Approval → SNS → Chatbot → Slack → PutApprovalResult
Custom Provider → Poll 기반 → 내부망 시스템 연동
EventBridge → 외부 시스템 (PagerDuty, Jira, Datadog)

[V2 동적 기능]
입력 변수 (Pipeline Variables) → 환경별 재사용, allowedPattern으로 검증
Action Output Variables → #{ActionNamespace.VAR_NAME} 형식
트리거 필터 (filePaths, branches, tags) → 모노레포 서비스 분리
Execution Mode:
  - SUPERSEDED: 새 실행이 이전 실행 취소 (기본)
  - QUEUED: 순차 실행, 모든 이력 보존
  - PARALLEL: 동시 실행, 독립 대상 필요
Stage 조건: beforeEntry (진입 전 게이트), onSuccess (완료 후 게이트)
CDK Pipelines → self-mutating, crossAccountKeys 자동화, Wave 병렬 배포
```

## 헷갈리기 쉬운 개념 비교

| 비교 A | 비교 B | 결정 기준 |
|--------|--------|-----------|
| runOrder 동일 | runOrder 다름 | Stage 내 병렬 vs 직렬 |
| Action roleArn | Configuration.RoleArn | Action 실행 주체 vs CFN 리소스 생성 주체 |
| SUPERSEDED | QUEUED | 최신만 배포 vs 모든 commit 이력 |
| QUEUED | PARALLEL | 순차 보존 vs 동시 독립 |
| Lambda Invoke | Step Functions Invoke | 15분 이하 단순 vs 복잡/장기 |
| Manual Approval | beforeEntry 조건 | 사람 판단 vs 자동화 게이트 |
| Branch Protection (GitHub) | Manual Approval | 코드 머지 게이트 vs 배포 게이트 |
| CodeStar Notifications | EventBridge | Slack/SNS 알림 vs 범용 이벤트 라우팅 |
| S3 Bucket Policy | KMS Key Policy | 객체 접근 허용 vs 암호화 해제 허용 |
| CAPABILITY_IAM | CAPABILITY_NAMED_IAM | 자동 명명 IAM 리소스 vs 명시적 명명 IAM 리소스 |
| SERVICE_MANAGED StackSet | SELF_MANAGED StackSet | Organizations 연동 자동화 vs 수동 Role 설정 |

> ⚠️ **함정**: 시험에서 자주 등장하는 "트랩" 선택지 패턴. (1) Cross-Account 배포 KMS 오류 → S3 버킷 정책을 수정하는 선택지가 있어도 KMS Key Policy가 정답인 경우. (2) "15분 초과 작업" → Lambda timeout 연장(불가능, 최대 15분)이 선택지로 등장. (3) "Slack 승인을 시니어 엔지니어만" → Chatbot IAM Role 수정이 선택지로 등장하지만 Chatbot은 사용자별 IAM 매핑 불가. (4) "모든 commit 빌드 + 마지막만 배포" → SUPERSEDED가 선택지로 등장하지만 SUPERSEDED는 이전 commit 빌드를 취소함. 이 트랩을 인식하는 훈련이 필요하다.

> 🔍 **더 깊이**: 4종 권한 체인 트러블슈팅 방법론. 순서대로 확인한다. (1) AssumeRole 성공 여부 → CloudTrail에서 "AssumeRole" 이벤트, errorCode 필드 확인. (2) S3 접근 성공 여부 → CloudTrail에서 "GetObject" 이벤트, accessDenied 여부. (3) KMS 복호화 성공 여부 → CloudTrail에서 "Decrypt" 이벤트, 에러 여부. (4) CloudFormation API 호출 성공 여부 → CloudTrail에서 "CreateStack/UpdateStack" 이벤트. 에러가 발생한 단계의 이전 단계까지는 권한이 있다. 이 방법론으로 KMS 문제를 3번에서 정확히 찾을 수 있다. CloudTrail의 `errorCode: AccessDenied`와 `errorMessage: User: ... is not authorized to perform: kms:Decrypt`가 명확한 증거다.

> 📚 **사례**: 주요 AWS 고객들의 CodePipeline 적용 패턴 요약. Netflix: StackSets + Organizations로 1,500개 계정에 Security Baseline 자동 배포. Goldman Sachs: Account Factory 파이프라인, 신규 계정 온보딩 30분 이내. Stripe: Stage 조건(beforeEntry + onSuccess) 4단계 자동 게이트로 배포 사고 70% 감소. Shopify: 서비스 유형별 Execution Mode 차별화(결제 QUEUED, 프론트엔드 SUPERSEDED, 테스트 환경 PARALLEL). Airbnb: Step Functions WaitForTaskToken으로 Slack 승인 시간 2시간 → 15분 단축. 이 사례들이 DOP-C02 시나리오의 실제 배경 맥락이다.

---

## 📝 시나리오 문제 12개

**문제 1.** Tooling 계정의 CodePipeline이 Prod 계정에 ECS 서비스를 배포한다. "배포 Action이 IAM Policy 에러 없이 시작됐는데, Artifact 다운로드 단계에서 다음 오류가 발생한다: `Client error: KMS key access denied when decrypting artifact`". 원인과 해결책은?

A) Pipeline Service Role에 sts:AssumeRole 권한이 없다 → Spoke Role ARN에 대한 AssumeRole을 허용하는 Identity Policy를 Pipeline Service Role에 추가  
B) Artifact S3 버킷 정책에 Prod 계정 CrossAccountDeployRole이 Principal로 없다 → 버킷 정책에 GetObject/PutObject 허용 Principal 추가  
C) Tooling 계정의 KMS Key Policy에 Prod 계정 CrossAccountDeployRole에 대한 kms:Decrypt 허용이 없다 → KMS Key Policy 수정  
D) ECS Task Execution Role과 배포 대상 클러스터의 Security Group이 같은 VPC/서브넷에 정렬되지 않았다 → 네트워킹 재구성  

**정답: C**  
해설: "배포 Action이 시작됐다"는 것은 AssumeRole(A)과 S3 버킷 정책(B)은 정상이라는 뜻이다. Action이 시작된 후 Artifact 복호화 단계에서 실패하는 것은 KMS Decrypt 권한 부재의 전형적 증상이다. S3 GetObject는 성공해도 KMS Decrypt 없으면 암호화된 내용을 열 수 없다. 해결: Tooling 계정 KMS Key Policy에 Prod 계정 CrossAccountDeployRole을 Principal로 추가하고 `kms:Decrypt`, `kms:DescribeKey` 권한 허용. VPC(D)는 이 에러와 무관하다.

---

**문제 2.** 한 회사가 100개의 마이크로서비스를 단일 Git 저장소(모노레포)에서 관리한다. 각 서비스는 독립적인 CodePipeline을 가지고 있다. `shared/auth/`의 변경이 모든 100개 파이프라인을 트리거해야 하고, `services/checkout/`의 변경은 checkout 파이프라인만 트리거해야 한다. 가장 적절한 V2 트리거 구성은?

A) 단일 파이프라인에서 Lambda로 변경 파일을 분석해 해당 서비스 파이프라인을 시작  
B) 각 서비스 파이프라인의 filePaths.includes에 해당 서비스 경로와 shared/auth/**를 함께 포함  
C) CodeBuild에서 변경 파일을 분석하고 해당 파이프라인을 start-pipeline-execution으로 시작  
D) Git branch를 서비스별로 분리  

**정답: B**  
해설: V2 filePaths 필터가 모노레포의 표준 해결책이다. checkout 파이프라인 설정 예: `filePaths.includes: ["services/checkout/**", "shared/auth/**"]`. `shared/auth/**`가 모든 서비스 파이프라인의 includes에 있으므로 shared 변경 시 100개 파이프라인이 동시에 시작된다. A와 C는 동작하지만 V2 네이티브 기능보다 복잡하고 유지보수가 어렵다. D는 모노레포의 장점을 포기하는 방식이다.

---

**문제 3.** 금융 서비스 회사가 "모든 prod 배포는 두 단계의 자동 게이트를 통과해야 한다: (1) 배포 전 error rate 알람이 OK 상태여야 함, (2) 배포 후 5분 동안 error rate 알람이 OK 상태를 유지해야 함. 어느 게이트라도 실패하면 자동 롤백"이라는 요구사항이 있다. 가장 적절한 구현은?

A) Manual Approval Action × 2로 사람이 양쪽 확인  
B) Deploy Stage의 beforeEntry에 CloudWatch Alarm Rule(배포 전), onSuccess에 CloudWatch Alarm Rule(배포 후) 설정, 둘 다 result: ROLLBACK  
C) Lambda Invoke Action × 2를 Deploy Action 앞뒤에 배치  
D) EventBridge Rule로 알람 상태를 모니터링하고 실패 시 수동 롤백  

**정답: B**  
해설: V2의 Stage 조건(beforeEntry, onSuccess)이 이 정확한 패턴을 지원한다. beforeEntry에 CloudWatch Alarm Rule → 배포 전 알람 OK 확인. onSuccess에 CloudWatch Alarm Rule(WaitTime: 300) → 배포 후 5분 알람 OK 유지 확인. result: ROLLBACK으로 설정하면 onSuccess 실패 시 자동 롤백이 트리거된다. Manual Approval(A)은 사람이 개입해야 하고 자동화가 아니다. Lambda Invoke(C)도 가능하지만 CloudWatch Alarm Rule Provider가 이 용도에 더 자연스러운 도구다.

---

**문제 4.** 한 팀이 "prod 배포를 승인할 수 있는 권한을 시니어 엔지니어에게만 부여하고, 승인은 Slack에서 진행"하는 패턴을 구현하려 한다. AWS Chatbot을 사용할 때 승인 권한을 사용자 수준에서 세밀하게 제어하는 방법은?

A) SNS Topic의 구독을 시니어 엔지니어 이메일만으로 제한  
B) Chatbot IAM Role에 codepipeline:PutApprovalResult 권한을 주되, Condition으로 특정 파이프라인 ARN만 허용  
C) AWS Chatbot이 Slack 사용자를 IAM과 직접 매핑하므로 시니어 엔지니어의 IAM User에 권한 부여  
D) 커스텀 Slack 봇 Lambda를 구현해 Slack 사용자 ID를 사내 인사 시스템과 대조한 후 시니어 엔지니어인 경우에만 PutApprovalResult 호출  

**정답: D**  
해설: AWS Chatbot은 Slack 사용자를 IAM 사용자/Role과 직접 1:1 매핑하지 않는다. Chatbot의 IAM Role이 권한을 갖고 있고, 채널에 접근 가능한 모든 사람이 Chatbot을 통해 이 Role로 동작한다. 즉 채널에 있는 주니어 엔지니어도 Chatbot 명령으로 승인할 수 있다. 세밀한 사용자 기반 권한 제어가 필요하면 D처럼 커스텀 Slack 봇을 만들어야 한다—Slack 사용자 ID → 사내 인사 시스템 조회 → 시니어 엔지니어 여부 확인 → PutApprovalResult. B는 파이프라인 수준 제어이고 사용자 수준 제어가 아니다.

---

**문제 5.** CodePipeline에서 Step Functions Action을 사용하는 State Machine이 실행 중 "외부 변경 관리 시스템(ServiceNow)의 Change Request가 승인될 때까지 배포를 일시 중단"해야 한다. State Machine이 이 대기를 구현하는 가장 적절한 방법은?

A) State Machine 안에 Task 상태에서 WaitSeconds를 설정해 1시간마다 재시도  
B) waitForTaskToken 패턴 — TaskToken을 ServiceNow에 전달하고 ServiceNow가 승인 시 SendTaskSuccess 호출  
C) Lambda Invoke Action과 Step Functions Action을 교대로 실행  
D) Manual Approval Action을 파이프라인에 추가  

**정답: B**  
해설: waitForTaskToken은 "외부 시스템의 비동기 이벤트를 기다리는" 패턴의 표준이다. State Machine이 ServiceNow에 TaskToken을 포함한 메시지를 보내고 대기 상태로 들어간다. ServiceNow 관리자가 Change Request를 승인하면 ServiceNow가 AWS Step Functions API의 SendTaskSuccess를 호출하고, State Machine이 다음 상태로 진행된다. A의 폴링 방식은 비효율적이고(불필요한 API 호출), 대기 시간이 가변적인 경우 구현이 복잡하다. D의 Manual Approval은 CodePipeline 콘솔/CLI를 통해야 하며 ServiceNow와 자동 연결이 어렵다.

---

**문제 6.** CDK Pipelines로 파이프라인을 관리하는 팀이 "프로덕션 배포 전 반드시 Manual Approval이 필요하다"는 요구사항과 "스테이징 배포는 완전 자동"이라는 요구사항을 동시에 만족시키려 한다. CDK Pipelines 코드에서 어떻게 구현하는가?

A) 두 개의 별도 CDK Pipelines 스택 생성 (스테이징용, 프로덕션용)  
B) pipeline.addStage(StagingStage) + pipeline.addStage(ProdStage, { pre: [new ManualApprovalStep('Approve')] })  
C) CloudFormation 조건으로 환경별 분기  
D) Lambda Invoke Action으로 환경을 확인하고 prod인 경우에만 Manual Approval 트리거  

**정답: B**  
해설: CDK Pipelines의 addStage() 두 번째 인자의 pre/post 옵션으로 각 Stage 앞뒤에 ManualApprovalStep을 추가할 수 있다. 스테이징은 pre 없이, 프로덕션에는 ManualApprovalStep을 pre로 추가한다. 이 코드는 self-mutating으로 git에 저장되어 코드 리뷰를 받을 수 있다. A는 두 파이프라인을 별도로 관리해야 하는 부담이 있고, D는 CodePipeline에 자체적인 조건 분기 개념이 없어서 구현이 어렵다.

---

**문제 7.** 현재 Pipeline이 SUPERSEDED 모드로 동작 중이다. 10개의 commit이 빠르게 push되면 어떤 현상이 발생하는가?

A) 10개 commit이 각각 별도 실행을 만들어 순서를 보장하며 10번 모두 빌드·배포된다 (QUEUED 모드의 동작)  
B) 마지막 push가 진행 중인 이전 실행을 ABANDONED 상태로 취소하고 자신이 실행된다. 결과적으로 마지막 commit만 실행 완료된다  
C) 10개가 큐에 순서대로 쌓여 하나씩 직렬로 실행되며 모든 commit 이력이 보존된다 (QUEUED 모드의 동작)  
D) 동시에 10개 실행이 병렬로 시작되어 독립적으로 완료된다 (PARALLEL 모드의 동작, 독립 대상 필요)  

**정답: B**  
해설: SUPERSEDED(기본)는 새 실행이 시작될 때 현재 진행 중인 실행을 ABANDONED 상태로 만들고 자신이 실행권을 가져간다. 10개의 commit이 빠르게 push되면 1번 실행 → 2번이 1번 취소 → 3번이 2번 취소 → ... → 10번이 9번 취소. 최종적으로 10번(마지막)만 완료된다. "가장 최근 상태만 중요하다"는 가정이 맞는 fast-moving 브랜치에 적합하다. 중간 commit들의 배포 이력이 필요한 경우(감사, 규정 준수)에는 QUEUED를 사용해야 한다.

---

**문제 8.** 한 팀이 멀티 리전 파이프라인을 구성했다. ap-northeast-2에서 빌드하고 us-east-1과 eu-west-1에 동시에 배포한다. 두 리전 배포 Action이 실패하는 경우 확인해야 할 사항은?

A) us-east-1과 eu-west-1에 각각 Artifact S3 버킷과 KMS 키가 ArtifactStores 배열에 구성되어 있는지 확인  
B) VPC Peering이 리전 간 구성되어 있는지 확인  
C) Route 53이 세 리전에 모두 있는지 확인  
D) Lambda 함수가 세 리전에 모두 배포되어 있는지 확인  

**정답: A**  
해설: 멀티 리전 파이프라인에서 배포 Action의 `region` 필드를 설정하면 해당 리전에서 Action이 실행된다. 이때 해당 리전의 Artifact S3 버킷과 KMS 키가 CloudFormation `ArtifactStores` 배열에 구성되어 있어야 한다. KMS는 리전 범위 서비스이므로 한국 KMS 키로 암호화된 Artifact를 버지니아에서 복호화하려면 버지니아에 별도 S3 버킷과 KMS 키가 필요하다. VPC Peering(B)은 불필요하고, Route 53(C)과 Lambda(D)는 이 문제와 무관하다.

---

**문제 9.** 한 파이프라인에서 Build Action이 여러 마이크로서비스 Docker 이미지를 빌드하고 각 이미지의 태그를 후속 Deploy Action에서 사용해야 한다. V2 Pipeline에서 가장 적절한 방법은?

A) 각 서비스별 별도 파이프라인 생성  
B) CodeBuild의 exported-variables에 SERVICE1_TAG, SERVICE2_TAG 등을 선언하고 Deploy Action에서 `#{BuildVariables.SERVICE1_TAG}` 형태로 각각 참조  
C) Artifact zip 파일 안에 tags.json을 포함시키고 Deploy Action이 읽음  
D) 환경 변수를 SSM Parameter Store에 저장하고 Deploy Action이 읽음  

**정답: B**  
해설: V2의 exported-variables + Action 출력 변수 참조가 이 용도의 가장 깔끔한 해결책이다. buildspec.yml의 exported-variables에 SERVICE1_TAG, SERVICE2_TAG 등을 선언하면, 각 변수가 V2 파이프라인의 변수로 노출되어 후속 Action에서 직접 참조 가능하다. C도 동작하지만 Artifact 안의 파일을 읽는 별도 로직이 필요해 복잡하다. D의 SSM 방식도 가능하지만 파이프라인 실행별 격리가 어렵다(동시 실행 시 값 충돌 가능).

---

**문제 10.** "GitHub Actions로 PR 빌드와 테스트를 실행하고, main 브랜치 머지 시에만 CodePipeline으로 prod 배포"하는 하이브리드 패턴에서 GitHub Actions에서 CodePipeline으로의 핸드오프를 구현하는 가장 보안적이고 단순한 방법은?

A) GitHub Actions에서 AWS CLI로 start-pipeline-execution 직접 호출 (IAM User 액세스 키 사용)  
B) GitHub Actions에서 OIDC Provider를 통해 IAM Role을 AssumeRole → start-pipeline-execution 호출 (임시 자격 증명)  
C) ECR에 이미지 push → CodePipeline의 Source Stage가 ECR 이벤트 감지 → 파이프라인 자동 시작  
D) GitHub Actions에서 SNS Topic에 메시지 publish → Lambda가 start-pipeline-execution 호출  

**정답: C**  
해설: ECR Push → CodePipeline Source 트리거 방식(C)이 가장 보안적이고 단순하다. GitHub Actions가 AWS 자격 증명을 전혀 가지지 않아도 된다—단지 ECR에 이미지를 push할 권한(OIDC로 임시 자격 증명 사용)만 있으면 된다. CodePipeline이 ECR의 새 이미지를 감지해서 자동으로 배포 파이프라인을 시작한다. 이미지 자체가 "배포 트리거"가 되는 명확한 분리다. B도 보안적이지만 GitHub Actions가 CodePipeline API 권한을 갖는 복잡성이 있다. A의 IAM User 액세스 키는 장기 자격 증명으로 보안 위험이 있다.

---

**문제 11.** StackSets의 SERVICE_MANAGED 모드로 50개 계정에 배포 중 다음 에러가 발생한다: "You must be an administrator of an Organization to use this operation." 원인은?

A) StackSet 템플릿에 IAM CAPABILITY_NAMED_IAM 미지정 등 검증 오류가 있어 Organizations 권한 검사 이전에 실패한다  
B) SERVICE_MANAGED StackSet은 Organizations 관리 계정(Management Account) 또는 Delegated Admin 계정에서만 실행할 수 있는데, 현재 실행 계정이 이 중 어느 쪽도 아니다  
C) 대상 계정이 Organizations에 속하지 않아 trusted access가 활성화되지 않았고, StackSets와 Organizations 간 연동이 끊겨 있다  
D) StackSet의 MaxConcurrentPercentage가 너무 높아 동시 배포 한도를 초과하며 권한 오류로 표면화된다  

**정답: B**  
해설: SERVICE_MANAGED StackSet은 AWS Organizations와 통합되어 동작한다. 이 모드는 Organizations 관리 계정(Management Account) 또는 Organizations이 지정한 Delegated Admin 계정에서만 사용 가능하다. 일반 멤버 계정에서 SERVICE_MANAGED StackSet을 생성하거나 작업하려 하면 이 오류가 발생한다. SELF_MANAGED 모드는 Organizations와 독립적이며 어느 계정에서도 사용 가능하지만 대상 계정마다 AWSCloudFormationStackSetExecutionRole을 수동 생성해야 한다.

---

**문제 12.** 한 팀이 "Lambda Invoke Action에서 외부 배포 시스템을 호출하고 완료까지 45분이 걸린다"는 문제에 직면했다. Lambda의 15분 한도를 우회하면서 파이프라인이 45분 완료를 기다리게 하는 방법으로 잘못된 것은?

A) Step Functions Action으로 전환 — State Machine 안에서 45분 작업을 처리  
B) Lambda timeout을 45분으로 설정 후 기존 방식 유지  
C) Lambda가 즉시 SQS에 작업을 디스패치하고 put_job_success_result를 호출 → 별도 Worker가 완료 후 파이프라인 외부 시스템을 통해 알림 (단방향, 파이프라인은 성공으로 처리)  
D) Lambda가 즉시 Step Functions WaitForTaskToken 실행을 시작하고 put_job_success_result 호출 → 45분 후 외부 시스템이 Step Functions의 SendTaskSuccess 호출  

**정답: B**  
해설: Lambda의 최대 실행 시간은 15분(900초)이다. 어떤 설정으로도 45분으로 연장할 수 없다. B가 잘못된 설명이다. 나머지는 모두 유효한 우회 방법이다. A(Step Functions)는 45분을 직접 처리할 수 있다. C(비동기 Fire and Forget)는 파이프라인이 완료를 기다리지 않고 성공으로 처리한다. D는 Lambda가 Step Functions를 시작하고, Step Functions WaitForTaskToken으로 45분을 기다리는 고급 패턴이다.

---

## Week 5 핵심 체크리스트

### CodePipeline 구조
- [ ] Stage > Action > Artifact 계층의 의미와 각 역할
- [ ] runOrder 동일 = 병렬, 다름 = 직렬
- [ ] Transition 비활성화로 Stage 간 게이트 구현
- [ ] Action 6 카테고리와 각 대표 Provider
- [ ] V1 vs V2 차이: 파이프라인 타입, 변수, 트리거 필터, Execution Mode

### Cross-Account IAM
- [ ] 필수 4종: Pipeline AssumeRole + Spoke Trust + S3 Policy + KMS Key Policy
- [ ] Action roleArn (Action 실행 주체) vs Configuration.RoleArn (CFN 리소스 생성 주체)
- [ ] KMS Key Policy가 가장 자주 빠지는 것 — Envelope Encryption 때문
- [ ] PrincipalTag / aws:SourceArn / ExternalId로 Confused Deputy 방지
- [ ] CAPABILITY_IAM vs CAPABILITY_NAMED_IAM

### Action Provider 선택
- [ ] Lambda: 15분 이하, 단순 로직, put_job_result 필수
- [ ] Step Functions: 15분 초과, 분기/병렬/재시도, Saga 패턴, WaitForTaskToken
- [ ] Manual Approval: SNS → Chatbot → Slack, 기본 타임아웃 7일
- [ ] EventBridge: 외부 시스템 연동 (PagerDuty, Jira, Datadog)
- [ ] Custom Provider: Poll 기반, 내부망 시스템 연동

### V2 동적 기능
- [ ] 입력 변수: 파이프라인을 환경별로 재사용, allowedPattern 검증
- [ ] 트리거 필터(filePaths, branches, tags, PR events): 모노레포 지원
- [ ] SUPERSEDED(기본, 최신 우선)/QUEUED(이력 보존)/PARALLEL(동시 독립): 상황별 선택 기준
- [ ] beforeEntry/onSuccess 조건: 자동 배포 게이트, CloudWatch Alarm Rule Provider
- [ ] CDK Pipelines: self-mutating, crossAccountKeys 자동화, Wave 병렬 배포

### StackSets
- [ ] SERVICE_MANAGED: Organizations 관리/Delegated Admin 계정 전용, Auto-Deployment 지원
- [ ] SELF_MANAGED: 수동 Role 설정, Organizations 없이도 사용
- [ ] MaxConcurrentPercentage(속도 제어) vs FailureTolerancePercentage(안전 제어)

---

## 다음 주 예고 (Week 6)

컨테이너 CI/CD로 넘어간다. ECR의 이미지 스캔과 수명 주기 관리, ECS의 Rolling/Blue-Green 배포 자동화, EKS의 GitOps(ArgoCD/Flux) 패턴, App Runner의 추상화된 컨테이너 서비스—이 네 가지가 Week 6의 축이다. Week 5에서 배운 CodePipeline이 이 모든 것의 오케스트레이터로 계속 등장한다.
