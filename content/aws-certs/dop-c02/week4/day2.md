# Day 2 - EC2/On-Prem 배포 + Auto Scaling 통합

📅 날짜: Week 4 (Day 2)
🎯 주제: ASG와 결합된 CodeDeploy 운영 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ASG Launch Template/Configuration에서 CodeDeploy Agent 부트스트랩
- ASG 스케일 아웃 중 진행 중인 배포 처리 방식
- On-Premises 서버 등록(Registration)과 IAM Session
- AppSpec Hook 스크립트의 idempotency 패턴

---

## 🧩 사전 지식 (CS 기초)

- **User Data**: EC2 부팅 시 1회 실행되는 스크립트.
- **Cloud-Init**: 부팅 시 메타데이터 처리 표준. AMI에 포함.
- **Lifecycle Hook**: ASG가 인스턴스 시작/종료 시 호출하는 훅. 대기 상태 유지 가능.
- **Idempotent script**: 같은 명령을 여러 번 실행해도 결과 동일. 배포 스크립트 필수 속성.
- **Termination Protection**: 인스턴스 종료 보호. ASG의 인스턴스 보호와는 다름.

---

## 📖 이론 내용

### 1. EC2에 CodeDeploy Agent 배포

**User Data로 설치:**
```bash
#!/bin/bash
yum update -y
yum install -y ruby wget
cd /tmp
wget https://aws-codedeploy-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/install
chmod +x ./install
./install auto
systemctl enable codedeploy-agent
systemctl start codedeploy-agent
```

**Systems Manager Distributor로 배포 (권장):**
- 패키지 `AWSCodeDeployAgent`
- State Manager로 모든 EC2에 자동 적용
- 자동 업데이트

```bash
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets Key=tag:Environment,Values=prod \
  --parameters action=Install,name=AWSCodeDeployAgent \
  --schedule-expression "rate(30 days)"
```

### 2. EC2 IAM Instance Profile

CodeDeploy Agent가 S3에서 배포 번들을 가져오려면:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:Get*",
      "s3:List*"
    ],
    "Resource": [
      "arn:aws:s3:::aws-codedeploy-ap-northeast-2/*",
      "arn:aws:s3:::my-deploy-bucket/*"
    ]
  }]
}
```

AmazonEC2RoleforAWSCodeDeploy 관리형 정책도 가능.

### 3. ASG + CodeDeploy 통합

**Deployment Group 설정:**
- Target: Auto Scaling Group(s) + Tag 필터(Inclusive/Exclusive)
- ASG에 새 인스턴스가 추가되면 CodeDeploy가 자동으로 가장 최근 성공한 배포를 적용

**Scale-out 중인 배포 처리:**
- 배포가 진행 중일 때 ASG가 새 인스턴스를 띄우면:
  - 새 인스턴스에 **진행 중인 배포가 자동 적용**됨
  - 단, 배포가 시작된 후 도착한 인스턴스는 별도 "AutoScaling" 배포로 처리
- 시험에서 자주 등장: "배포 도중 스케일 아웃되면?" → 자동 동기화

### 4. ASG Lifecycle Hook + CodeDeploy

```
ASG launches instance
   ↓ (Lifecycle Hook: launching)
EC2_INSTANCE_LAUNCHING → InService 대기
   ↓
CodeDeploy auto-detects new instance
   ↓
Deploys latest successful revision
   ↓
Health check OK → CompleteLifecycleAction
   ↓
ASG marks instance InService
```

> 💡 Lifecycle Hook으로 배포 완료 전 트래픽 받지 않게 조절 가능.

### 5. On-Premises 인스턴스 등록

```bash
# IAM User 생성 (또는 IAM Session Manager 방식)
aws deploy register --instance-name my-onprem-1 \
  --iam-user-arn arn:aws:iam::...:user/codedeploy-onprem \
  --tags Key=Environment,Value=prod \
  --region ap-northeast-2

# 결과로 /etc/codedeploy-agent/conf/codedeploy.onpremises.yml에
# IAM 자격 증명이 저장됨
```

**더 안전한 방법 — IAM Session Token:**
- IAM Role + AssumeRole로 단기 자격 증명 발급
- 자격 증명을 주기적으로 갱신

> ⚠️ On-Prem은 CodeDeploy Blue/Green 미지원 (In-place만).

### 6. AppSpec Hook 스크립트 설계 원칙

```bash
#!/bin/bash
set -e   # 오류 시 즉시 종료
set -u   # 미정의 변수 사용 금지

# Idempotency
if systemctl is-active --quiet myapp; then
  systemctl stop myapp
fi

# 로그 표준화
exec > >(tee -a /var/log/codedeploy-hook.log) 2>&1
echo "[$(date)] Stopping app"

# Health check with retry
for i in {1..30}; do
  if curl -fs http://localhost/health; then
    echo "Healthy"
    exit 0
  fi
  sleep 2
done
echo "Unhealthy after 60s"
exit 1
```

**스크립트 위치**: AppSpec의 `location` 필드. 보통 `scripts/` 디렉토리.

---

## 🧠 알아두면 좋은 심화 이론

### Deployment Group Tag 매칭 모드

| 모드 | 의미 |
|------|------|
| **AND** | 모든 태그 일치해야 포함 |
| **OR** | 어느 한 태그라도 일치하면 포함 |
| **Multiple groups (ON1) AND (OR2)** | 그룹별 OR, 그룹 간 AND |

Production 환경 분리에 유용.

### Deployment Failure Strategy

- **DeploymentReadyOption**: Blue/Green에서 새 인스턴스 준비 완료 후 트래픽 시프트 시작 시점
  - `CONTINUE_DEPLOYMENT`: 즉시
  - `STOP_DEPLOYMENT`: 수동 승인 대기 (Lambda + EventBridge로 자동화 가능)
- **GreenFleetProvisioningOption**: Blue/Green 인스턴스 프로비저닝 방식
  - `DISCOVER_EXISTING`: 이미 있는 ASG 사용 (드물게)
  - `COPY_AUTO_SCALING_GROUP`: 새 ASG 자동 생성 (표준)

### Termination Wait Time vs Bake Time

- **Termination Wait Time** (Blue/Green): 트래픽 시프트 완료 후 구 인스턴스 종료 전 대기 (최대 2일)
- **Bake Time**: 명시적 용어는 아니나 알람 모니터링 기간으로 해석

### ASG Suspend Processes — 배포 중 함정

ASG 프로세스(`Launch`, `Terminate`, `HealthCheck` 등)가 일시 정지되면 CodeDeploy가 영향받음:
- 배포 도중 `Launch` 정지 → 새 인스턴스 생성 안 됨
- `HealthCheck` 정지 → Health check 실패 미감지

배포 트러블슈팅 시 확인 항목.

### 관련 서비스 Cross-Reference

- **SSM Distributor** → Week 9 Day 1
- **ASG Lifecycle Hook** → Week 6 Day 2 (ECS와 비교)
- **CloudWatch Alarm** → Week 10 Day 1
- **EventBridge → Lambda 자동 승인** → Week 12 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
ASG + CodeDeploy Integration
==================================================

  Developer
     |
     v
   git push
     |
     v
  CodePipeline → CodeBuild → S3 bundle
                              |
                              v
                          CodeDeploy Deployment
                              |
   +--------------------------+--------------------------+
   |                          |                          |
   v                          v                          v
  ASG-prod (3 instances)
  +---+ +---+ +---+
  |EC2| |EC2| |EC2|
  +---+ +---+ +---+
   (each has agent + IAM role)
        |
        | Deployment in progress
        v
   ASG scale-out event
        |
        v
   New EC2 launched
        |
        v
   Agent reports → CodeDeploy detects new host
        |
        v
   Same revision auto-applied
        |
        v
   Lifecycle hook completes → InService

On-Prem:
   register-on-premises-instance + IAM user/session creds
   Agent pulls from S3 cross-account
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ EC2 Instance Profile에 S3 Read + CodeDeploy 관리형 정책 필요
2. ⭐ SSM Distributor + State Manager로 Agent 자동 설치·업데이트
3. ⭐ 배포 도중 ASG scale-out 시 새 인스턴스에 자동 동일 revision 적용
4. ⭐ On-Prem은 In-place만 지원 (Blue/Green X)
5. ⭐ AppSpec Hook은 idempotent + set -eu + 로그 표준화

---

## 💻 실제 예시 - ASG와 CodeDeploy 연동

```bash
# 1) ASG 생성
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name myapp-asg \
  --launch-template LaunchTemplateName=myapp-lt,Version='$Latest' \
  --min-size 2 --max-size 6 --desired-capacity 3 \
  --vpc-zone-identifier "subnet-a,subnet-b" \
  --target-group-arns "arn:aws:elasticloadbalancing:..." \
  --tags Key=Environment,Value=prod,PropagateAtLaunch=true

# 2) CodeDeploy Application + DG
aws deploy create-application \
  --application-name MyApp --compute-platform Server

aws deploy create-deployment-group \
  --application-name MyApp \
  --deployment-group-name prod \
  --deployment-config-name CodeDeployDefault.OneAtATime \
  --service-role-arn arn:aws:iam::...:role/CodeDeployServiceRole \
  --auto-scaling-groups myapp-asg \
  --load-balancer-info elbInfoList=[{name=myapp-tg}] \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM \
  --alarm-configuration enabled=true,alarms=[{name=High5xx}]

# 3) 배포 시작 (S3 번들)
aws deploy create-deployment \
  --application-name MyApp \
  --deployment-group-name prod \
  --revision revisionType=S3,s3Location="{bucket=my-deploy,key=app-v1.zip,bundleType=zip}"
```

---

## 📝 연습 문제

**문제 1.** ASG에 새 인스턴스가 추가되었다. 진행 중인 CodeDeploy 배포의 동작은?

A) 새 인스턴스는 다음 배포까지 구 버전 유지
B) 배포가 자동으로 새 인스턴스에 동일 revision 적용
C) 즉시 배포 실패
D) ASG가 인스턴스 종료

**정답: B**
해설: ASG와 통합되면 자동 동기화. 가장 자주 출제.

---

**문제 2.** CodeDeploy Agent를 모든 EC2에 자동 배포·업데이트하는 모범 방법은?

A) User Data로 매번 설치
B) SSM Distributor 패키지 + State Manager로 자동 적용
C) AMI에 굽기
D) Lambda로 매일 호출

**정답: B**
해설: Distributor + State Manager가 표준. AMI에 구워도 되지만 업데이트 어려움.

---

**문제 3.** On-Premises 서버에서 Blue/Green 배포가 안 되는 이유는?

A) On-Prem은 In-place만 지원
B) Agent가 다름
C) IAM 권한 부족
D) 네트워크 한계

**정답: A**
해설: 시험 빈출 — On-Prem Blue/Green 미지원.

---

**문제 4.** AppSpec Hook 스크립트의 모범 사례가 아닌 것은?

A) `set -e`로 오류 시 즉시 종료
B) Idempotent (여러 번 실행 안전)
C) 로그를 표준 위치에 기록
D) 종료 코드를 항상 0으로 강제 (실패 무시)

**정답: D**
해설: 실패를 0으로 위장하면 CodeDeploy가 실패 감지 못 함. 자동 롤백 무력화.

---

**문제 5.** EC2 IAM Instance Profile에 S3 권한이 없다. 어떤 일이 발생하는가?

A) 자동 권한 부여
B) Agent가 배포 번들을 S3에서 가져오지 못해 배포 실패
C) AWS가 자동 해결
D) HTTPS로 우회

**정답: B**
해설: 가장 흔한 실패 원인.

---

**문제 6.** EC2 Blue/Green의 Termination Wait Time을 길게 설정하는 이유는?

A) 비용 절감
B) 트래픽 시프트 후에도 구 인스턴스를 보존 → 문제 발생 시 즉시 롤백 가능
C) 배포 속도 향상
D) ELB 워밍업

**정답: B**
해설: Wait time은 롤백 안전망. 보통 30분~1시간.

---

**문제 7.** ASG의 Launch 프로세스가 정지된 상태에서 배포를 시작했다. 어떤 문제가 발생할 수 있는가?

A) Blue/Green이 새 인스턴스를 생성 못 함 → 배포 진행 불가
B) 자동 해결
C) 더 빠른 배포
D) 비용 절감

**정답: A**
해설: Suspend 상태 확인은 트러블슈팅 1순위.

---

## 📌 오늘의 요약

1. CodeDeploy Agent는 SSM Distributor + State Manager로 관리하는 게 표준
2. EC2 Instance Profile에 S3 + CodeDeploy 권한 필수
3. 배포 중 ASG 스케일아웃되면 새 인스턴스에 동일 revision 자동 적용
4. On-Prem은 In-place만 지원
5. AppSpec Hook은 idempotent + 정확한 exit code + 로그 기록 필수
