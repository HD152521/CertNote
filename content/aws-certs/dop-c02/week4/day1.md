# Day 1 - In-place vs Blue/Green, AppSpec 파일 구조

📅 날짜: Week 4 (Day 1)
🎯 주제: CodeDeploy의 배포 전략 두 축과 AppSpec 핵심
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- In-place와 Blue/Green 배포의 본질적 차이를 이해한다
- AppSpec 파일이 EC2/Lambda/ECS에서 어떻게 다른지 안다
- Deployment Configuration의 종류(AllAtOnce/HalfAtATime/OneAtATime/Custom)와 의미
- 자동 롤백 메커니즘과 알람 통합

---

## 🧩 사전 지식 (CS 기초)

- **Zero-Downtime Deployment**: 배포 중에도 서비스 중단 없음. ALB 디레지스터 + 새 버전 등록.
- **Connection Draining**: 기존 연결이 마무리될 때까지 트래픽 종료를 지연.
- **State Drift**: 배포 도중 일부 호스트만 새 버전, 일부는 구 버전.
- **Two-Phase Commit**: 검증 후 일괄 적용. Blue/Green의 본질.
- **Bake Time**: 배포 후 새 버전을 일정 시간 관찰. 메트릭으로 검증.

---

## 📖 이론 내용

### 1. In-place vs Blue/Green — 본질 비교

| 항목 | In-place | Blue/Green |
|------|----------|------------|
| 인스턴스 | 같은 인스턴스에 새 버전 덮어쓰기 | 새 인스턴스에 새 버전 배포 |
| 다운타임 | OneAtATime이면 거의 0 | 0 (트래픽 시프트만) |
| 롤백 속도 | 다시 배포 (느림) | 트래픽 시프트 되돌리기 (즉시) |
| 비용 | 인스턴스 그대로 | 일시적으로 2× 인스턴스 |
| 리소스 한도 | 기존 한도 내 | 추가 한도 필요 |
| Lambda | 지원 X | 지원 |
| ECS | 지원 X (rolling은 ECS 자체) | 지원 (CodeDeploy 트래픽 시프트) |
| EC2 On-prem | 지원 | EC2/ASG만 (On-prem 지원 X) |

> 💡 **시험 빈출**: Lambda/ECS Blue/Green = 트래픽 시프트 의미. EC2 Blue/Green = 새 ASG 띄움.

### 2. Deployment Configuration

**기본 제공 (EC2/On-Prem):**
- `CodeDeployDefault.AllAtOnce` — 모든 인스턴스 동시 배포 (다운타임 위험)
- `CodeDeployDefault.HalfAtATime` — 50%씩
- `CodeDeployDefault.OneAtATime` — 1대씩 (가장 안전, 느림)
- Custom — 비율/시간 직접 정의

**기본 제공 (Lambda):**
- `CodeDeployDefault.LambdaAllAtOnce`
- `CodeDeployDefault.LambdaCanary10Percent5Minutes` — 10% 5분 → 90%
- `CodeDeployDefault.LambdaCanary10Percent30Minutes` — 10% 30분 → 90%
- `CodeDeployDefault.LambdaLinear10PercentEvery1Minute` — 10%씩 매 1분
- `CodeDeployDefault.LambdaLinear10PercentEvery10Minutes`

**기본 제공 (ECS):**
- `CodeDeployDefault.ECSAllAtOnce`
- `CodeDeployDefault.ECSCanary10Percent5Minutes`
- `CodeDeployDefault.ECSLinear10PercentEvery1Minute`

> 💡 **Canary vs Linear 차이**: Canary는 두 단계(10% → 90%). Linear는 점진적 증가(10%씩 매 N분).

### 3. AppSpec 파일 — 3가지 형식

**EC2/On-Prem (YAML 또는 JSON):**
```yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /var/www/myapp
hooks:
  ApplicationStop:
    - location: scripts/stop.sh
      timeout: 60
  BeforeInstall:
    - location: scripts/before_install.sh
  AfterInstall:
    - location: scripts/after_install.sh
  ApplicationStart:
    - location: scripts/start.sh
  ValidateService:
    - location: scripts/health_check.sh
      timeout: 180
```

**Hook 실행 순서:** ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService

> ⚠️ 첫 배포에는 ApplicationStop이 실행 안 됨 (이전 버전이 없으므로).

**Lambda (YAML 또는 JSON):**
```yaml
version: 0.0
Resources:
  - myFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: MyLambda
        Alias: live
        CurrentVersion: 1
        TargetVersion: 2
Hooks:
  - BeforeAllowTraffic: PreTrafficHook
  - AfterAllowTraffic: PostTrafficHook
```

**ECS (YAML 또는 JSON):**
```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: arn:aws:ecs:...:task-definition/myapp:42
        LoadBalancerInfo:
          ContainerName: web
          ContainerPort: 80
        PlatformVersion: LATEST
Hooks:
  - BeforeInstall: PreInstallHook
  - AfterInstall: PostInstallHook
  - AfterAllowTestTraffic: TestTrafficHook
  - BeforeAllowTraffic: BeforeProductionHook
  - AfterAllowTraffic: AfterProductionHook
```

### 4. 자동 롤백

- **Alarm-based**: CloudWatch 알람 발생 시 자동 롤백
- **Deployment failure**: 배포 자체 실패 시 자동 롤백
- **Hook failure**: ValidateService 등 Hook이 0이 아닌 exit code

```bash
aws deploy update-deployment-group \
  --application-name MyApp --deployment-group-name prod \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM,DEPLOYMENT_STOP_ON_REQUEST \
  --alarm-configuration enabled=true,alarms=[{name=HighErrorRate},{name=High5xx}]
```

### 5. EC2 Blue/Green 흐름

1. 새 ASG 생성 (또는 Launch Template 기반 인스턴스 N개)
2. 새 인스턴스가 ELB Target Group에 등록
3. Health check 통과 대기
4. 트래픽 시프트 (Canary/Linear/AllAtOnce)
5. **Original instances termination 대기** (Wait time 설정 가능, 기본 1시간)
6. 그 동안 롤백 가능
7. 시간 경과 후 구 인스턴스 종료

---

## 🧠 알아두면 좋은 심화 이론

### Lambda Blue/Green = Alias 트래픽 시프트

```
Lambda Function MyFn
   ├─ Version 1 (PROD)
   ├─ Version 2 (PROD-NEXT)
   └─ Alias "live" → Version 1: 100%

   Deploy starts:
   Alias "live" → Version 1: 90%, Version 2: 10%   (Canary 10%)
   wait 5min, check alarm
   Alias "live" → Version 2: 100%
```

**중요:** Lambda는 항상 새 Version 생성. Alias가 가리키는 비중을 시프트.

### ECS Blue/Green = Target Group 2개

```
ALB Listener
   ├─ Rule: TargetGroup-Blue (PROD)
   └─ (테스트) TargetGroup-Green (NEXT)

   Deploy:
   1) Green TG에 새 Task Set 생성
   2) Green에 test traffic (선택) → AfterAllowTestTraffic Hook 실행
   3) Listener Rule 트래픽 시프트 → AfterAllowTraffic Hook
   4) Wait time 후 Blue Task Set 종료
```

### 자동 롤백 알람 — 어떤 알람을 걸까?

| 알람 | 메트릭 |
|------|--------|
| 5xx 비율 | ALB HTTPCode_Target_5XX_Count |
| Latency | TargetResponseTime p99 > 1s |
| Lambda 에러 | Errors > 0 |
| 비즈니스 지표 | 주문 성공률, 결제 실패율 등 (custom metric) |

> ⚠️ 알람이 너무 민감하면 정상 배포도 롤백. 무딘 알람은 장애 못 잡음. Balance 필요.

### CodeDeploy Agent (EC2/On-Prem)

- EC2에 설치 필수
- 자동 업데이트 (`Update notification`)
- 로그: `/var/log/aws/codedeploy-agent/`
- 호스트 정보: `/opt/codedeploy-agent/`

### Lambda Pre/Post Traffic Hook

- Pre: 트래픽 시프트 전 검증 (smoke test)
- Post: 시프트 완료 후 추가 검증
- 각각 Lambda 함수로 구현
- Hook이 SUCCEEDED 반환해야 진행

```python
import boto3
client = boto3.client('codedeploy')

def lambda_handler(event, context):
    # 검증 로직
    success = True  # ...

    client.put_lifecycle_event_hook_execution_status(
        deploymentId=event['DeploymentId'],
        lifecycleEventHookExecutionId=event['LifecycleEventHookExecutionId'],
        status='Succeeded' if success else 'Failed'
    )
```

### 관련 서비스 Cross-Reference

- **Lambda Alias** → Week 7 Day 3
- **ECS Service** → Week 6 Day 2
- **CloudWatch Alarm** → Week 10 Day 1
- **EventBridge → 알림** → Week 12 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
EC2 Blue/Green Deployment Flow
==================================================

  ASG-Blue (current)               ASG-Green (new)
  +---+ +---+ +---+               +---+ +---+ +---+
  |EC2| |EC2| |EC2|               |EC2| |EC2| |EC2|
  +-+-+ +-+-+ +-+-+               +-+-+ +-+-+ +-+-+
    |     |     |                   |     |     |
    └─────┼─────┘                   └─────┼─────┘
          |                               |
   TargetGroup-Blue              TargetGroup-Green
          \                              /
           \                            /
            +---  ALB Listener ---+
                   |
                   | Canary 10% → Linear → 100%
                   |
              [Auto Rollback]
                Alarm: 5xx>1%, p99>500ms

  Wait time (e.g., 60min) → Terminate Blue
  Within wait: rollback restores Blue traffic instantly

Lambda Blue/Green
================
  Function MyFn
   ├─ V1 (current)
   ├─ V2 (new)
   └─ Alias "live"
        Weighted routing:
          V1:100, V2:0  →  V1:90, V2:10  →  V2:100

ECS Blue/Green
==============
  ALB Listener
   ├─ Production rule  → TG-Blue (Task Set 1)
   └─ Test rule        → TG-Green (Task Set 2)
   Hooks: AfterAllowTestTraffic, BeforeAllowTraffic
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Lambda/ECS의 Blue/Green = Alias/Target Group 트래픽 시프트
2. ⭐ EC2 Blue/Green은 ASG를 새로 띄움 — 비용 일시 2배
3. ⭐ AppSpec 형식이 EC2/Lambda/ECS 다름 — EC2는 Hooks, Lambda/ECS는 Resources
4. ⭐ 자동 롤백 트리거: 배포 실패 + 알람 + Hook 실패
5. ⭐ Canary(2단계) vs Linear(점진) 구분

---

## 💻 실제 예시 - Lambda Canary 배포

```bash
# 1) Application + Deployment Group 생성
aws deploy create-application \
  --application-name MyLambda \
  --compute-platform Lambda

aws deploy create-deployment-group \
  --application-name MyLambda \
  --deployment-group-name MyLambda-DG \
  --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes \
  --service-role-arn arn:aws:iam::...:role/CodeDeployServiceRoleForLambda \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM \
  --alarm-configuration enabled=true,alarms=[{name=MyFn-ErrorRate}]

# 2) AppSpec.json 작성
cat <<EOF > appspec.json
{
  "version": 0.0,
  "Resources": [{
    "myFunction": {
      "Type": "AWS::Lambda::Function",
      "Properties": {
        "Name": "MyFn",
        "Alias": "live",
        "CurrentVersion": "$CURRENT_VERSION",
        "TargetVersion": "$TARGET_VERSION"
      }
    }
  }],
  "Hooks": [
    {"BeforeAllowTraffic": "PreTrafficHook"},
    {"AfterAllowTraffic": "PostTrafficHook"}
  ]
}
EOF

# 3) 배포 시작
aws deploy create-deployment \
  --application-name MyLambda \
  --deployment-group-name MyLambda-DG \
  --revision revisionType=AppSpecContent,appSpecContent="{content=$(cat appspec.json),sha256=...}"
```

---

## 📝 연습 문제

**문제 1.** EC2 Blue/Green과 In-place의 본질적 차이는?

A) 둘 다 같은 인스턴스에 배포
B) Blue/Green은 새 인스턴스 생성, In-place는 같은 인스턴스에 덮어쓰기
C) Blue/Green은 다운타임 길다
D) In-place는 Lambda만 지원

**정답: B**
해설: 새 인스턴스 생성 여부가 본질적 차이. Blue/Green은 즉시 롤백 가능.

---

**문제 2.** Lambda Blue/Green 배포에서 실제로 시프트되는 것은?

A) 새 Lambda 함수가 생성됨
B) Alias의 버전 가중치 — 단일 함수 안의 Version 사이 트래픽 비중
C) Lambda Layer
D) IAM Role

**정답: B**
해설: Lambda Blue/Green = Alias weighted routing.

---

**문제 3.** ECS Blue/Green에서 "AfterAllowTestTraffic" Hook의 역할은?

A) 프로덕션 트래픽 시프트 후
B) Test Listener에 트래픽 노출 후, 프로덕션 시프트 전 검증
C) 배포 시작 전
D) 배포 완료 후

**정답: B**
해설: ECS에는 별도 Test Listener를 두어 사전 검증 가능.

---

**문제 4.** AppSpec EC2의 Hook 실행 순서로 옳은 것은?

A) ApplicationStart → ApplicationStop → Install
B) ApplicationStop → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService
C) Install → ApplicationStart → BeforeInstall
D) ValidateService → ApplicationStart → AfterInstall

**정답: B**
해설: Stop → Before → Install → After → Start → Validate. 외워두기.

---

**문제 5.** "5xx가 1% 넘으면 자동 롤백"을 구현하려면?

A) CloudWatch Alarm 생성 + Deployment Group의 alarm-configuration 등록 + auto-rollback 활성
B) Lambda로 매번 수동 체크
C) X-Ray만 활성
D) ALB Listener 규칙 수동 변경

**정답: A**
해설: Alarm + Auto-rollback 통합이 표준.

---

**문제 6.** EC2 In-place 배포에서 OneAtATime을 선택하는 이유는?

A) 가장 빠름
B) 가장 안전 — 한 대씩 검증 가능, 다운타임 최소
C) 비용 절감
D) AWS 권장 기본값

**정답: B**
해설: OneAtATime이 가장 안전. 단점은 시간이 오래 걸림.

---

**문제 7.** EC2 Blue/Green 배포에서 "Wait time"이란?

A) 배포 시작 전 대기
B) 트래픽 100% 시프트 후 구 인스턴스 종료 전 대기 — 그 시간 동안 롤백 가능
C) Hook 실행 시간
D) ELB Health check 간격

**정답: B**
해설: 트래픽 시프트 완료 후 구 인스턴스를 보존하는 시간 — 롤백 안전망.

---

## 📌 오늘의 요약

1. In-place는 같은 인스턴스, Blue/Green은 새 인스턴스/Version/Task Set
2. Lambda/ECS의 Blue/Green은 트래픽 시프트 (Alias/Target Group)
3. AppSpec은 EC2(Hooks)/Lambda·ECS(Resources+Hooks) 형식 다름
4. Canary(2단계) vs Linear(점진) 구분
5. 자동 롤백 = 알람 + 배포 실패 + Hook 실패 트리거
