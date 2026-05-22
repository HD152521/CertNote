# Day 4 - OpsWorks, AWS Proton, Launch Templates 운영

📅 날짜: Week 7 (Day 4)
🎯 주제: 다양한 배포 자동화 도구의 위치와 사용 시점
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- OpsWorks(Chef/Puppet) 매니지드 서비스의 역할을 안다
- AWS Proton의 플랫폼 엔지니어링 모델을 이해한다
- Launch Template 운영 패턴과 모범 사례를 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Configuration management**: Chef, Puppet, Ansible 등 OS 설정 자동화
- **Platform engineering**: 개발자에게 자가 서비스 인프라 제공
- **Internal Developer Platform (IDP)**: 사내 표준 플랫폼
- **Launch Configuration vs Launch Template**: 구식 vs 신식. LT가 권장
- **Capacity providers**: ECS의 Fargate/EC2 용량 추상화

---

## 📖 이론 내용

### 1. AWS OpsWorks

#### 개념
- Chef/Puppet 매니지드 서비스
- Chef Automate, Puppet Enterprise를 AWS가 운영
- 또는 OpsWorks Stacks (구식, deprecated 권장)

#### 변종

| 서비스 | 도구 | 상태 |
|--------|------|------|
| **OpsWorks for Chef Automate** | Chef | 운영 중 |
| **OpsWorks for Puppet Enterprise** | Puppet | 운영 중 |
| **OpsWorks Stacks** | Chef Solo | **2024.5.26 EOL** — Systems Manager로 마이그레이션 권장 |

#### 시험 출제 관점
- 이름은 알아두기 (Chef/Puppet 매니지드)
- "기존 Chef cookbook 자산 활용" 시나리오에 등장
- 실제 모범 사례는 SSM/Image Builder

### 2. AWS Proton

#### 개념
- 플랫폼 엔지니어링용 IaC 표준화 도구
- "환경 템플릿(Environment)" + "서비스 템플릿(Service)" → 자가 서비스
- CI/CD까지 통합

#### 차별점 (Service Catalog와 비교)

| 항목 | Service Catalog | Proton |
|------|-----------------|--------|
| 대상 | 일반 사용자 | 개발자 |
| IaC | CloudFormation | CFn/Terraform |
| CI/CD | 별도 | 통합 (CodePipeline) |
| 환경/서비스 분리 | X | O |

#### Proton 구조
```
Environment Template (Platform Team)
   └── 예: 표준 VPC + EKS Cluster

Service Template (Platform Team)
   └── 예: Fargate Service + ALB + RDS + CodePipeline

개발자:
   └── Environment 선택 (또는 새로 만들기)
   └── Service 인스턴스 생성 (Git Repo 연결)
   └── 자동으로 인프라 + CI/CD 프로비저닝
```

### 3. Launch Template (LT)

#### 왜 사용하나
- EC2 생성 옵션을 재사용 가능한 템플릿으로
- Auto Scaling Group, EC2 Fleet, Spot Fleet에서 참조
- Launch Configuration(LC)의 후계 — 모든 신규 기능은 LT만 지원

#### Launch Template vs Launch Configuration

| 항목 | LC (구식) | LT (권장) |
|------|-----------|-----------|
| 버전 관리 | X | O (1, 2, 3, ...) |
| 부분 수정 | X (재생성) | O |
| ASG 외 사용 | X | EC2 Fleet, Spot Fleet 등 |
| 신규 기능 지원 | X | O |
| 권장 | ❌ | ✅ |

#### LT 필드 (자주 쓰는 것)
- ImageId (또는 SSM Parameter 참조)
- InstanceType, InstanceMarketOptions (Spot/On-demand)
- KeyName, SecurityGroupIds, IamInstanceProfile
- UserData (Base64)
- BlockDeviceMappings (EBS)
- TagSpecifications (자동 태그)
- NetworkInterfaces (다중 ENI)

#### Mixed Instances Policy (ASG + LT)
- 한 ASG에서 여러 인스턴스 타입 + Spot/On-demand 혼합
- 비용 절감 + 가용성 ↑

```yaml
MixedInstancesPolicy:
  LaunchTemplate:
    LaunchTemplateSpecification:
      LaunchTemplateId: !Ref MyLT
      Version: $Latest
    Overrides:
      - InstanceType: t3.medium
      - InstanceType: t3a.medium
      - InstanceType: m5.large
  InstancesDistribution:
    OnDemandPercentageAboveBaseCapacity: 30
    SpotAllocationStrategy: capacity-optimized
```

### 4. Auto Scaling Group 운영

#### Scaling Policy 종류

| 정책 | 설명 |
|------|------|
| **Target Tracking** | 메트릭 목표값(예: CPU 50%) 유지 |
| **Step Scaling** | 임계값 단계별로 +N대 |
| **Simple Scaling** | 단일 임계값 (Cooldown 필요) |
| **Predictive Scaling** | ML로 트래픽 예측 |
| **Scheduled Scaling** | cron 기반 |

#### Lifecycle Hooks
- 인스턴스 시작·종료 시 작업 삽입
- 예: 시작 시 워밍업 + 종료 전 로그 백업

```yaml
LifecycleHooks:
  - LifecycleHookName: terminate-hook
    LifecycleTransition: autoscaling:EC2_INSTANCE_TERMINATING
    HeartbeatTimeout: 300
    DefaultResult: CONTINUE
    NotificationTargetARN: !Ref MyLambda
```

### 5. EC2 Fleet & Spot Fleet

#### EC2 Fleet
- 단일 API 호출로 다수 인스턴스 + 다양한 타입
- On-demand + Spot 혼합
- 비용 최적화·가용성 강화에 활용

#### Spot Fleet (레거시 권장 X)
- EC2 Fleet으로 통합되는 추세

#### Spot Instance 운영
- 최대 90% 할인
- AWS가 2분 전 알림 후 회수 가능
- 회수 알림: `aws ec2 describe-spot-instance-requests` 또는 IMDS

#### Spot 알림 처리
```
1. AWS가 Spot 회수 결정
2. 2분 전 EventBridge `EC2 Spot Instance Interruption Warning` 발행
3. Lambda 또는 ASG Lifecycle Hook이 그래스풀 종료
4. ALB에서 deregister + 로그 백업 + 종료
```

### 6. EC2 Auto Scaling 운영 함정

#### 인스턴스 Refresh
- ASG 인스턴스를 새 LT 버전으로 점진 교체
- AMI 변경 시 Rolling 업데이트에 사용

```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name my-asg \
  --strategy Rolling \
  --preferences MinHealthyPercentage=90,InstanceWarmup=120
```

#### Warm Pools
- 미리 만들어두고 stopped 상태로 대기 → spike 시 빠른 부팅
- 비용 ↓ (stopped는 compute 청구 X)

#### Termination Policy
- 어떤 인스턴스를 먼저 종료할지
- 옵션: OldestInstance, NewestInstance, OldestLaunchConfiguration, OldestLaunchTemplate, ClosestToNextInstanceHour, AllocationStrategy

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Capacity Reservation** | 특정 AZ에 인스턴스 미리 예약 (요금 RI와 별도) | 가용성 보장 |
| **Dedicated Host / Instance** | 물리 격리 | BYOL, 규제 |
| **EC2 Instance Connect** | SSH 키 없이 IAM 접속 (콘솔/CLI) | Session Manager 대안 |
| **Placement Groups** | Cluster/Spread/Partition | 성능·가용성 |
| **EC2 Recover** | StatusCheck_System 실패 시 자동 복구 | Week 3 복습 |

> ⚠️ **함정 1**: Launch Configuration은 더 이상 신규 기능 미지원. 무조건 Launch Template 권장.
>
> ⚠️ **함정 2**: Spot 회수 2분 알림은 짧음 — Graceful shutdown 자동화 필수.
>
> 💡 **암기 팁**: OpsWorks(Chef/Puppet 레거시) ↔ Proton(현대 IDP) ↔ Service Catalog(자가 서비스).

### 관련 서비스 Cross-Reference

- **Launch Template → Week 7 Day 3** (Golden AMI와 결합)
- **Auto Scaling → Week 3 Day 1** (Alarm 기반 트리거)
- **Proton → Week 6 Day 4** (Service Catalog와 비교)
- **EC2 Fleet → Week 11** (Spot 비용 최적화)

---

## 🏗️ 아키텍처 다이어그램

```
Launch Template + ASG + Mixed Instances
==========================================================

   [Launch Template v3]
   - ImageId: {{resolve:ssm:/golden-ami/latest}}
   - InstanceType: m5.large
   - SecurityGroups: [sg-abc]
   - IamInstanceProfile: WebRole
   - UserData: bootstrap script
         │
         ▼ (참조)
   ┌────────────────────────────┐
   │  Auto Scaling Group        │
   │  Mixed Instances:          │
   │   - m5.large (50% on-demand)│
   │   - m5a.large (50% spot)   │
   │   - t3.large (fallback)    │
   │  Min=2 / Desired=4 / Max=20│
   │  Lifecycle Hooks:           │
   │   - on terminate: Lambda    │
   └────┬───────────────────────┘
        │
        ▼ Scaling Policy
   [Target Tracking: CPU 50%]
   [Step Scaling: ALB RequestCount]
```

```
Proton vs Service Catalog 사용 사례
==========================================================

  [Platform Team]
       │ 표준 인프라 + CI/CD 패키지 작성
       ▼
  ┌────────────────────────────┐
  │  Proton                    │
  │  - Environment Template    │
  │  - Service Template        │
  │  + CodePipeline 통합       │
  └────────┬───────────────────┘
           │
           ▼
  [개발자 = Git push만]
       │ 인프라 + 파이프라인 자동
       ▼
  [실제 Fargate Service + ALB + RDS]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **OpsWorks Stacks는 2024.5.26 EOL** — SSM으로 마이그레이션 권장
2. ⭐ **Launch Template이 표준** — Launch Configuration은 deprecated
3. ⭐ **Mixed Instances Policy로 On-demand + Spot 혼합** — 비용·가용성 최적
4. ⭐ **Spot 회수 2분 알림** → Lambda/Lifecycle Hook으로 graceful shutdown
5. ⭐ **Instance Refresh로 새 LT 버전 점진 교체** — AMI 갱신에 활용

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Launch Template 생성 (Golden AMI from SSM)
aws ec2 create-launch-template \
  --launch-template-name web-app-lt \
  --launch-template-data '{
    "ImageId":"{{resolve:ssm:/golden-ami/amazon-linux-2/latest}}",
    "InstanceType":"m5.large",
    "IamInstanceProfile":{"Name":"WebInstanceProfile"},
    "SecurityGroupIds":["sg-abc"],
    "UserData":"'$(base64 -w0 < user-data.sh)'",
    "TagSpecifications":[{"ResourceType":"instance","Tags":[{"Key":"Environment","Value":"prod"}]}],
    "MetadataOptions":{"HttpTokens":"required","HttpEndpoint":"enabled"}
  }'

# 2. ASG 생성 (Mixed Instances)
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name web-asg \
  --min-size 2 --max-size 20 --desired-capacity 4 \
  --vpc-zone-identifier "subnet-abc,subnet-xyz" \
  --target-group-arns "arn:aws:elasticloadbalancing:...:targetgroup/web-tg/abc" \
  --mixed-instances-policy '{
    "LaunchTemplate":{
      "LaunchTemplateSpecification":{"LaunchTemplateName":"web-app-lt","Version":"$Latest"},
      "Overrides":[
        {"InstanceType":"m5.large"},
        {"InstanceType":"m5a.large"},
        {"InstanceType":"m6i.large"}
      ]
    },
    "InstancesDistribution":{
      "OnDemandBaseCapacity":2,
      "OnDemandPercentageAboveBaseCapacity":30,
      "SpotAllocationStrategy":"capacity-optimized"
    }
  }' \
  --health-check-type ELB --health-check-grace-period 300

# 3. Target Tracking Policy
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name cpu-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},
    "TargetValue":50.0
  }'

# 4. Lifecycle Hook (종료 전 작업)
aws autoscaling put-lifecycle-hook \
  --auto-scaling-group-name web-asg \
  --lifecycle-hook-name terminate-hook \
  --lifecycle-transition autoscaling:EC2_INSTANCE_TERMINATING \
  --heartbeat-timeout 300 \
  --default-result CONTINUE \
  --notification-target-arn arn:aws:sqs:ap-northeast-2:123:terminate-queue \
  --role-arn arn:aws:iam::123:role/AutoScalingNotificationRole

# 5. Instance Refresh (AMI 변경 후 점진 교체)
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name web-asg \
  --strategy Rolling \
  --preferences 'MinHealthyPercentage=90,InstanceWarmup=120,SkipMatching=false'

# 6. Warm Pool 활성화
aws autoscaling put-warm-pool \
  --auto-scaling-group-name web-asg \
  --min-size 2 \
  --max-group-prepared-capacity 10 \
  --pool-state Stopped

# 7. Spot 회수 알림 처리 (EventBridge Rule)
aws events put-rule \
  --name spot-interruption \
  --event-pattern '{"source":["aws.ec2"],"detail-type":["EC2 Spot Instance Interruption Warning"]}'

aws events put-targets \
  --rule spot-interruption \
  --targets "Id=1,Arn=arn:aws:lambda:ap-northeast-2:123:function:GracefulShutdown"
```

---

## 📝 연습 문제

**문제 1.** 회사가 OpsWorks Stacks로 Chef 운영 중이다. AWS가 EOL 발표했다면?

A) 계속 사용
B) Systems Manager로 마이그레이션 (Run Command, State Manager, Patch Manager 등으로 대체)
C) Beanstalk으로 이전
D) ECS로 이전

**정답: B**
해설: AWS 공식 마이그레이션 가이드. OpsWorks Stacks의 cookbook 패턴을 SSM Document로 변환. State Manager가 지속 적용, Run Command가 일회성.

---

**문제 2.** Auto Scaling Group에서 On-demand 2대 보장 + 나머지는 Spot으로 비용 절감하려 한다. 어떤 설정?

A) Spot Instance만 사용
B) Mixed Instances Policy + OnDemandBaseCapacity=2 + 나머지는 Spot
C) 별도 ASG 2개
D) EC2 Fleet

**정답: B**
해설: Mixed Instances Policy의 InstancesDistribution이 핵심. OnDemandBaseCapacity로 최소 보장 + OnDemandPercentageAboveBaseCapacity로 추가 비율. capacity-optimized 전략으로 Spot 안정성 ↑.

---

**문제 3.** Launch Configuration을 사용 중인 ASG가 새 AMI를 사용하게 하려 한다. 가장 적절한 방법은?

A) LC 수정
B) 새 LC 생성 후 ASG 변경 — 단, LC는 deprecated이므로 LT로 전환 권장
C) ASG 삭제 후 재생성
D) Manual

**정답: B**
해설: LC는 수정 불가, 새로 만들어 교체. 하지만 LC 자체가 deprecated이므로 LT로 전환이 더 좋은 선택. LT는 버전 관리 + 부분 수정 가능.

---

**문제 4.** Spot 인스턴스가 회수되기 전 graceful shutdown(ALB deregister, 로그 백업)을 자동화하려면?

A) Cron job
B) EventBridge Rule (EC2 Spot Instance Interruption Warning) + Lambda 또는 ASG Lifecycle Hook
C) CloudWatch Alarm
D) IMDS 폴링만

**정답: B**
해설: 2분 알림을 EventBridge로 수신 → Lambda가 ELB deregister, 로그 백업, 정리. ASG에선 Lifecycle Hook으로 종료 전 시간 확보.

---

**문제 5.** 회사가 사내 PaaS를 만들어 개발자가 Git push만으로 인프라 + CI/CD를 자동 프로비저닝하길 원한다. 가장 적합한 도구는?

A) Service Catalog만
B) AWS Proton (Environment + Service Template + CodePipeline 통합)
C) Elastic Beanstalk
D) OpsWorks

**정답: B**
해설: Proton의 정확한 사용 사례 — Platform Engineering / IDP. Service Catalog는 자가 서비스 프로비저닝만, CI/CD 통합 없음.

---

## 📌 오늘의 요약

1. OpsWorks Stacks는 EOL — SSM으로 마이그레이션 권장. Chef/Puppet 매니지드는 별도 운영 중
2. Launch Template이 표준 — 버전 관리·부분 수정·Mixed Instances 지원
3. Mixed Instances Policy = On-demand + Spot 혼합. OnDemandBaseCapacity로 최소 보장
4. Spot 회수 2분 알림 → EventBridge → Graceful shutdown 자동화
5. Proton = 사내 PaaS / IDP. Service Catalog와 달리 CI/CD까지 통합
