# Day 2 - CodeDeploy (In-place vs Blue-Green, AppSpec, Hooks)

📅 날짜: Week 7 (Day 2)
🎯 주제: CodeDeploy로 EC2/Lambda/ECS 안전 배포
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CodeDeploy의 In-place vs Blue-Green 배포 차이를 이해한다
- AppSpec.yml 구조와 Lifecycle Event Hooks를 안다
- Deployment Configuration으로 점진 배포 + 자동 롤백을 구성한다

---

## 🧩 사전 지식 (CS 기초)

- **Lifecycle hooks**: 배포 각 단계에서 사용자 스크립트 실행. ApplicationStop, BeforeInstall 등
- **Health check**: 새 버전이 정상 동작하는지 확인. Failed → 롤백
- **Weighted routing**: 가중치 기반 트래픽 분배. Canary 구현에 사용
- **Versioned deployment**: Lambda Alias가 가리키는 Version 전환으로 배포

---

## 📖 이론 내용

### 1. CodeDeploy 개요

#### 특징
- EC2/온프레미스/Lambda/ECS 배포 지원
- AppSpec.yml로 배포 정의
- 자동 롤백 (실패/알람 시)
- Beanstalk과 달리 인프라는 별도 — 코드만 배포

#### Compute Platform별 차이

| Platform | 배포 단위 | 배포 방식 |
|----------|-----------|-----------|
| **EC2/On-Premises** | 파일 + 스크립트 | In-place 또는 Blue-Green |
| **Lambda** | 함수 버전 | Canary, Linear, AllAtOnce |
| **ECS** | Task Definition | Blue-Green via ALB |

### 2. EC2/On-Premises 배포

#### In-place 배포
- 기존 인스턴스에서 앱을 중지 → 새 버전 설치 → 시작
- 인프라 변경 없음 (EC2 그대로)
- 배포 중 일부 인스턴스 사용 불가 가능

#### Blue-Green 배포 (EC2)
- 새 EC2 그룹(Auto Scaling Group) 생성
- ALB Target Group을 새 그룹으로 전환
- 구 그룹은 일정 시간 후 종료
- 빠른 롤백 가능

#### CodeDeploy Agent
- EC2/온프레미스에 설치
- IAM Role에 `AmazonEC2RoleforAWSCodeDeploy` 또는 `AWSCodeDeployRole` 필요
- S3에서 배포 패키지 받아 실행

### 3. AppSpec.yml 구조 (EC2)

```yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /var/www/html
permissions:
  - object: /var/www/html
    pattern: "**"
    owner: ec2-user
    group: ec2-user
    mode: 644
    type:
      - file
hooks:
  ApplicationStop:
    - location: scripts/stop_server.sh
      timeout: 300
      runas: root
  BeforeInstall:
    - location: scripts/backup.sh
  AfterInstall:
    - location: scripts/install_dependencies.sh
  ApplicationStart:
    - location: scripts/start_server.sh
  ValidateService:
    - location: scripts/health_check.sh
      timeout: 60
```

### 4. Lifecycle Event Hooks (⭐ 시험 빈출 순서)

#### EC2/On-Premises

```
1. ApplicationStop          ← 현재 버전 중지
2. DownloadBundle           ← AWS가 자동 실행
3. BeforeInstall            ← 설치 전 (백업 등)
4. Install                  ← AWS가 자동 실행
5. AfterInstall             ← 설치 후 (권한 설정 등)
6. ApplicationStart         ← 새 버전 시작
7. ValidateService          ← 헬스 체크
[Blue-Green only]
8. BeforeBlockTraffic       ← 트래픽 차단 전 (구 인스턴스)
9. BlockTraffic             ← AWS 자동
10. AfterBlockTraffic
11. BeforeAllowTraffic      ← 트래픽 허용 전 (신 인스턴스)
12. AllowTraffic            ← AWS 자동
13. AfterAllowTraffic
```

#### Lambda

```
1. BeforeAllowTraffic       ← 사전 검증 Lambda (canary 시작 전)
2. AllowTraffic             ← AWS가 트래픽 점진 전환
3. AfterAllowTraffic        ← 사후 검증
```

#### ECS

```
1. BeforeInstall
2. AfterInstall
3. AfterAllowTestTraffic    ← 테스트 트래픽 후 검증
4. BeforeAllowTraffic       ← 본 트래픽 전 검증
5. AfterAllowTraffic
```

### 5. Deployment Configuration (배포 속도/안전)

#### EC2

| Config | 동작 |
|--------|------|
| **CodeDeployDefault.AllAtOnce** | 모두 동시 |
| **CodeDeployDefault.HalfAtATime** | 절반씩 |
| **CodeDeployDefault.OneAtATime** | 한 대씩 (안전 최고) |
| **Custom** | 비율/개수 직접 |

#### Lambda

| Config | 동작 |
|--------|------|
| **Canary10Percent5Minutes** | 10% → 5분 후 100% |
| **Canary10Percent30Minutes** | 10% → 30분 후 100% |
| **Linear10PercentEvery1Minute** | 1분마다 10%씩 |
| **Linear10PercentEvery10Minutes** | 10분마다 10%씩 |
| **AllAtOnce** | 즉시 100% |

### 6. 자동 롤백

#### 트리거
1. **배포 실패** (Lifecycle hook 실패, 타임아웃)
2. **CloudWatch Alarm** 알람 발생 (배포 중 또는 alarm-based)

#### 설정
```bash
aws deploy update-deployment-group \
  --application-name MyApp \
  --current-deployment-group-name prod \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM \
  --alarm-configuration enabled=true,alarms=[{name=HighErrorRate}]
```

### 7. Lambda 배포 (Alias + Version)

#### 동작
```
함수 Version 1 (안정)
       ↑
   Alias: prod (90% 트래픽)
   Alias: prod (10% 트래픽 → Version 2 신규)
       ↓
함수 Version 2 (신규)
```

- CodeDeploy가 Alias의 가중치(Weighted Routing)를 점진적으로 조정
- BeforeAllowTraffic Lambda Hook으로 사전 검증

### 8. CodeDeploy vs Beanstalk vs CloudFormation

| 항목 | CodeDeploy | Beanstalk | CloudFormation |
|------|------------|-----------|----------------|
| 인프라 | 별도 (Existing) | 자동 생성 | 자동 생성 |
| 배포 단위 | 앱 코드 | 앱 코드 + 환경 | 모든 리소스 |
| 사용 사례 | 기존 인프라 배포 | 단순 웹앱 PaaS | IaC 전체 |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Deployment Group** | 배포 대상 (태그/ASG/온프레미스) | 환경 분리 |
| **EC2 Tag Filter** | 태그 기반 동적 대상 | 신규 인스턴스 자동 포함 |
| **Triggers** | 배포 이벤트 → SNS 알림 | 운영 가시화 |
| **Lambda Hooks도 Lambda** | Hook 자체가 Lambda 함수 | 검증 로직 자유 |
| **ECS Blue-Green via ALB** | Target Group 2개 + Listener 전환 | 컨테이너 배포 표준 |

> ⚠️ **함정 1**: Lambda Canary는 alias의 가중치를 점진 변경. 모든 호출이 점진적이지만 개별 호출은 100% v1 or v2 — 트래픽 비율로 결정.
>
> ⚠️ **함정 2**: AppSpec hook의 root 권한과 runas 사용자 권한이 다름 — script 실행 권한 신중히.
>
> 💡 **암기 팁**: EC2(파일 + Hook 스크립트), Lambda(Alias 가중치), ECS(Target Group 전환).

### 관련 서비스 Cross-Reference

- **CodeDeploy → Week 7 Day 1** (Beanstalk과 비교)
- **CodeDeploy → Week 7 Day 4** (CodePipeline 통합 - 별도 학습)
- **CodeDeploy → Week 3 Day 1** (Alarm 기반 자동 롤백)
- **CodeDeploy → Week 1 Day 2** (IAM Role 필요)

---

## 🏗️ 아키텍처 다이어그램

```
EC2 Blue-Green 배포 (CodeDeploy)
==========================================================

   초기 상태
   ─────────────
   ALB Target Group → [EC2 v1][EC2 v1][EC2 v1]
                       (Blue ASG)

   배포 진행
   ─────────
   ALB Target Group:
       │ ├── [Blue ASG: v1][v1][v1]
       │ └── [Green ASG: v2][v2][v2]  ← 신규 생성
                  │
                  ↓ Hook: BeforeAllowTraffic (검증)
                  ↓
   ALB Target Group → Green ASG로 전환

   완료 후
   ───────
   ALB Target Group → [EC2 v2][EC2 v2][EC2 v2]
   구 Blue ASG는 일정 시간 후 종료
```

```
Lambda Canary 배포
==========================================================

   배포 시작 시점
   ──────────────
   Alias "prod"
      ├── Version 1 (가중치 100%)
      └── Version 2 (가중치   0%)

   Canary10Percent5Minutes:
   ───────────────────────
   t=0:    Alias prod
             ├── V1 (90%)
             └── V2 (10%)
   t=5min: Alias prod
             └── V2 (100%)

   알람 발생 시:
   ───────────
   자동 롤백 → Alias prod → V1 (100%)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **AppSpec hook 순서** (시험 빈출): ApplicationStop → BeforeInstall → AfterInstall → ApplicationStart → ValidateService
2. ⭐ **Blue-Green for EC2 = ALB Target Group 전환** + 새 ASG
3. ⭐ **Lambda Canary = Alias 가중치 점진 조정** (Version별 트래픽 분배)
4. ⭐ **Auto Rollback Triggers**: 배포 실패 또는 CloudWatch Alarm
5. ⭐ **ECS Blue-Green = Target Group 2개 + Listener 전환**

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. CodeDeploy Application 생성 (EC2)
aws deploy create-application \
  --application-name MyWebApp \
  --compute-platform Server

# 2. Deployment Group 생성 (Blue-Green via ASG)
aws deploy create-deployment-group \
  --application-name MyWebApp \
  --deployment-group-name prod-bg \
  --service-role-arn arn:aws:iam::123:role/CodeDeployRole \
  --deployment-style 'deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL' \
  --blue-green-deployment-configuration '{
    "terminateBlueInstancesOnDeploymentSuccess": {"action":"TERMINATE","terminationWaitTimeInMinutes":15},
    "deploymentReadyOption": {"actionOnTimeout":"CONTINUE_DEPLOYMENT"},
    "greenFleetProvisioningOption": {"action":"COPY_AUTO_SCALING_GROUP"}
  }' \
  --auto-scaling-groups MyWebASG \
  --load-balancer-info 'targetGroupInfoList=[{name=my-tg}]' \
  --auto-rollback-configuration 'enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM' \
  --alarm-configuration 'enabled=true,alarms=[{name=HighErrorRate}]'

# 3. 배포 실행
aws deploy create-deployment \
  --application-name MyWebApp \
  --deployment-group-name prod-bg \
  --revision '{"revisionType":"S3","s3Location":{"bucket":"my-deploy-bucket","key":"app-v2.zip","bundleType":"zip"}}' \
  --description "Deploy v2.0"

# 4. Lambda CodeDeploy 배포
aws deploy create-application \
  --application-name MyLambdaApp \
  --compute-platform Lambda

aws deploy create-deployment-group \
  --application-name MyLambdaApp \
  --deployment-group-name prod \
  --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes \
  --service-role-arn arn:aws:iam::123:role/CodeDeployRoleForLambda

# AppSpec for Lambda (YAML 또는 JSON inline)
cat > appspec-lambda.yml <<'EOF'
version: 0.0
Resources:
  - MyLambdaFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: order-service
        Alias: prod
        CurrentVersion: 1
        TargetVersion: 2
Hooks:
  - BeforeAllowTraffic: validate-pre-deploy
  - AfterAllowTraffic: validate-post-deploy
EOF

aws deploy create-deployment \
  --application-name MyLambdaApp \
  --deployment-group-name prod \
  --revision 'revisionType=AppSpecContent,appSpecContent={content="$(cat appspec-lambda.yml)"}'

# 5. 배포 상태 추적
aws deploy list-deployments \
  --application-name MyWebApp \
  --deployment-group-name prod-bg \
  --include-only-statuses InProgress

aws deploy get-deployment \
  --deployment-id d-XXXX

# 6. 수동 롤백 (이전 버전 재배포)
aws deploy create-deployment \
  --application-name MyWebApp \
  --deployment-group-name prod-bg \
  --revision '{"revisionType":"S3","s3Location":{"bucket":"my-deploy-bucket","key":"app-v1.zip","bundleType":"zip"}}' \
  --description "Rollback to v1.0"
```

---

## 📝 연습 문제

**문제 1.** AppSpec.yml의 hook 순서 중 새 버전 설치 직후 권한 설정·심볼릭 링크 만드는 단계는?

A) BeforeInstall
B) AfterInstall — 파일 복사 직후
C) ApplicationStart
D) ValidateService

**정답: B**
해설: hook 순서 ApplicationStop → BeforeInstall → AfterInstall → ApplicationStart → ValidateService. 파일이 복사된 직후가 AfterInstall — 권한 설정·심볼릭 링크·구성 파일 수정.

---

**문제 2.** Lambda 함수를 Canary 배포로 10% 5분간 검증 후 100%로 가려 한다. 어떤 설정?

A) Deployment Config: CodeDeployDefault.LambdaCanary10Percent5Minutes
B) Lambda 환경 변수
C) API Gateway Stage
D) ASG

**정답: A**
해설: AWS 사전 정의 Lambda Deployment Config 중 정확히 이 옵션. Alias 가중치를 V1:90%/V2:10% → 5분 후 V2:100%로 자동 조정.

---

**문제 3.** CodeDeploy 배포 중 CloudWatch Alarm(HighErrorRate)이 발생하면 자동 롤백되도록 하려면?

A) 별도 Lambda
B) Deployment Group의 auto-rollback-configuration에 DEPLOYMENT_STOP_ON_ALARM + alarm-configuration에 알람 등록
C) CloudWatch만
D) IAM 정책

**정답: B**
해설: CodeDeploy 자체 기능. AutoRollbackConfiguration의 events에 `DEPLOYMENT_STOP_ON_ALARM` + AlarmConfiguration에 모니터링할 알람 ARN 등록.

---

**문제 4.** EC2 Blue-Green 배포에서 새 ASG가 생성·검증된 후 트래픽을 전환하기 직전에 실행되는 hook은?

A) BeforeInstall
B) BeforeAllowTraffic (새 인스턴스에서 트래픽 받기 직전 검증)
C) ApplicationStart
D) DownloadBundle

**정답: B**
해설: Blue-Green 전용 hook. BeforeAllowTraffic은 trafffic 전환 직전 새 인스턴스에서 실행 — 최종 검증/warm-up. AfterAllowTraffic은 전환 후.

---

**문제 5.** EC2 CodeDeploy에서 가장 안전한 (한 번에 1대씩) Deployment Config는?

A) CodeDeployDefault.AllAtOnce
B) CodeDeployDefault.HalfAtATime
C) CodeDeployDefault.OneAtATime (한 대씩, 안전 최고)
D) Canary10Percent

**정답: C**
해설: OneAtATime은 1대씩 순차 배포 → 가장 안전, 가장 느림. 운영 환경에서 위험 최소화. Canary는 Lambda 용어.

---

## 📌 오늘의 요약

1. CodeDeploy: EC2/Lambda/ECS 배포. AppSpec.yml로 라이프사이클 정의
2. EC2 hook 순서: ApplicationStop → BeforeInstall → AfterInstall → ApplicationStart → ValidateService
3. Blue-Green for EC2 = 새 ASG + ALB Target Group 전환. 빠른 롤백
4. Lambda Canary = Alias 가중치 점진 조정. 사전 정의 Config 다수
5. Auto Rollback: 배포 실패 또는 CloudWatch Alarm 트리거
