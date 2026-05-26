# Day 2 - EC2/On-Prem 배포 + Auto Scaling 통합: 인스턴스 생애주기와 배포의 교차점

Auto Scaling은 트래픽에 따라 인스턴스를 자동으로 추가하고 제거한다. CodeDeploy는 코드를 인스턴스에 배포한다. 이 두 시스템이 동시에 작동할 때 생기는 복잡함이 바로 "배포 중 스케일 아웃"이라는 상황이다. 새 인스턴스가 뜨는 시점에 구 버전이 설치되면 클러스터가 혼재 상태가 된다. CodeDeploy는 이 문제를 자동 동기화로 해결한다.

On-Premises 배포는 또 다른 차원의 문제다. AWS가 제어하지 않는 서버에 코드를 배포하려면 에이전트가 필요하고, 그 에이전트가 AWS API에 접근하려면 자격 증명이 필요하다. 이 자격 증명을 얼마나 안전하게, 자동으로 관리하느냐가 설계 핵심이다.

오늘은 EC2 배포의 전체 생애주기 — Agent 설치부터 AppSpec Hook 설계, ASG 통합, Auto Scaling Rolling 업데이트, Circuit Breaker, On-Premises 등록까지 — 를 하나의 흐름으로 연결한다.

> 💡 **Day 2의 핵심 판단 기준**: CodeDeploy 문제에서 "자동 롤백"이 나오면 두 가지 레이어를 구분해야 한다. (1) EC2 Rolling Update의 Deployment Group Circuit Breaker — 배포 단계에서 실패 감지. (2) CloudWatch Alarm 기반 자동 롤백 — 배포 후 운영 중 문제 감지. 이 둘의 트리거 시점이 다르다.

---

## CodeDeploy 전체 아키텍처: 구성 요소 관계

```
[CodePipeline / AWS CLI / 콘솔]
        │
        ▼
[CodeDeploy Application]
  │
  ├─ [Deployment Group]
  │     ├─ EC2 인스턴스 (태그 기반 또는 ASG)
  │     ├─ On-Premises 인스턴스 (등록된 IAM 자격 증명)
  │     ├─ Deployment Configuration (배포 속도)
  │     ├─ Auto Rollback Configuration (알람 기반)
  │     └─ Load Balancer (트래픽 차단/복원)
  │
  └─ [Deployment]
        ├─ Revision (S3 또는 GitHub의 배포 번들)
        └─ AppSpec (배포 절차 + Hook 스크립트)
```

CodeDeploy Agent는 각 EC2/On-Prem 인스턴스에서 실행되며 CodeDeploy API를 폴링해 배포 명령을 기다린다. 새 배포 명령이 오면 S3에서 번들을 다운로드하고 AppSpec에 따라 Hook 스크립트를 순서대로 실행한다.

> 🔍 **더 깊이**: CodeDeploy Agent의 폴링 모델은 Push 방식이 아니라 Pull 방식이다. 인스턴스가 CodeDeploy 엔드포인트에 주기적으로 요청해 새 작업이 있는지 확인한다. 이 모델의 장점은 방화벽 안에 있는 인스턴스(On-Premises 포함)도 아웃바운드 연결만 있으면 동작한다는 것이다. VPC 안의 EC2는 VPC Endpoint(`com.amazonaws.region.codedeploy`) 또는 NAT Gateway로 엔드포인트에 접근한다.

---

## CodeDeploy Agent 설치와 관리

EC2에 CodeDeploy를 쓰려면 각 인스턴스에 Agent가 설치되어 있어야 한다. Agent는 CodeDeploy API를 폴링하며 새 배포 명령을 기다린다.

**방법 1: User Data (단순하나 업데이트 어려움)**
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

**방법 2: SSM Distributor + State Manager (권장)**
```bash
# State Manager Association으로 자동 설치 + 주기적 업데이트
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets "Key=tag:CodeDeploy,Values=enabled" \
  --parameters "action=Install,name=AWSCodeDeployAgent" \
  --schedule-expression "rate(30 days)"
```

SSM Distributor 방식의 장점:
- 새 인스턴스가 태그(`CodeDeploy=enabled`)를 달고 뜨면 자동 설치
- 30일마다 최신 버전으로 자동 업데이트
- 태그 기반 타깃팅으로 배포 대상 제어
- Agent 설치 상태를 SSM Compliance 뷰에서 모니터링 가능

**EC2 IAM Instance Profile 필수 권한:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:Get*", "s3:List*"],
    "Resource": [
      "arn:aws:s3:::aws-codedeploy-ap-northeast-2/*",
      "arn:aws:s3:::my-deploy-bucket/*"
    ]
  }]
}
```

Agent가 S3에서 배포 번들(zip)을 다운로드하는 권한이다. 이 권한이 없으면 각 인스턴스 로그에서 S3 AccessDenied가 나고 전체 배포가 실패한다.

> 💡 **관련 이론**: SSM Distributor + State Manager는 **Configuration Drift 방지** 패턴이다. 인스턴스가 desired state(Agent 설치됨)에서 벗어나면 State Manager가 자동으로 재적용한다. 이것은 Chef/Puppet의 converge 개념과 동일하고, Kubernetes의 컨트롤 루프 패턴과도 같다. "상태를 선언하고 시스템이 유지한다"는 선언적 관리 철학이다. EC2 Image Builder와 결합하면 AMI 빌드 시 Agent를 포함하고, State Manager로 버전만 유지하는 하이브리드 전략도 가능하다.

---

## AppSpec Hook 실행 순서: EC2/On-Premises

AppSpec Hook은 배포의 각 단계에서 사용자 스크립트를 실행한다. 순서가 고정되어 있고, 각 Hook의 목적이 다르다.

```
EC2/On-Premises AppSpec Hook 실행 순서
================================================

[Deployment Lifecycle Events]

ApplicationStop         ← 기존 앱 종료 (이전 revision의 스크립트)
    │
DownloadBundle          ← S3에서 번들 다운로드 (자동, Hook 없음)
    │
BeforeInstall           ← 설치 전 준비 (디렉토리 생성, 이전 백업)
    │
Install                 ← 파일 복사 (자동, Hook 없음)
    │
AfterInstall            ← 설치 후 설정 (설정 파일 생성, 권한 설정)
    │
ApplicationStart        ← 새 앱 시작 (systemctl start)
    │
ValidateService         ← 서비스 정상 작동 검증 (헬스체크 curl)
    │
    ▼
[배포 성공] 또는 [자동 롤백]
```

**AppSpec 파일 예시:**
```yaml
version: 0.0
os: linux
files:
  - source: /app
    destination: /opt/myapp
permissions:
  - object: /opt/myapp
    owner: appuser
    group: appgroup
    mode: "755"
hooks:
  ApplicationStop:
    - location: scripts/stop_app.sh
      timeout: 30
      runas: root
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 60
  AfterInstall:
    - location: scripts/after_install.sh
      timeout: 120
  ApplicationStart:
    - location: scripts/start_app.sh
      timeout: 60
  ValidateService:
    - location: scripts/validate.sh
      timeout: 120
```

> ⚠️ **함정**: `ApplicationStop`은 이전 revision의 appspec.yml에 정의된 스크립트를 실행한다. 처음 배포 시에는 이전 revision이 없으므로 `ApplicationStop`이 실행되지 않는다. 두 번째 배포부터 이전 revision의 stop 스크립트가 실행된다. "첫 배포에서 ApplicationStop이 실행되지 않는다"는 것이 시험에서 자주 나오는 함정이다.

> 📚 **사례**: 어떤 팀이 배포 시 기존 앱 종료 스크립트(`ApplicationStop`)를 새 revision에 추가했는데, 해당 배포에서는 stop 스크립트가 실행되지 않았다. 원인은 `ApplicationStop`이 현재 배포의 appspec이 아닌 이전 revision의 appspec을 참조하기 때문이다. 새 stop 스크립트는 다음 배포에서 실행된다. 이 동작을 이해하지 못하면 디버깅에서 시간을 낭비한다.

---

## AppSpec Hook 스크립트: 견고성 원칙

```bash
#!/bin/bash
set -euo pipefail   # e: 에러 즉시 종료, u: 미정의 변수 에러, o pipefail: 파이프 에러 전파

# 로그 표준화
exec > >(tee -a /var/log/codedeploy-hook.log) 2>&1
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ApplicationStop 시작"

# Idempotency 패턴: 이미 멈춰있어도 에러 없이 통과
if systemctl is-active --quiet myapp; then
    systemctl stop myapp
    echo "앱 정상 종료"
else
    echo "앱이 이미 중지 상태 — 건너뜀"
fi

# ValidateService 예: retry 로직
for i in $(seq 1 30); do
    if curl -fs http://localhost:8080/health; then
        echo "헬스체크 통과 (${i}번째 시도)"
        exit 0
    fi
    sleep 2
done
echo "헬스체크 60초 내 실패"
exit 1   # 비0 exit code = CodeDeploy에 실패 보고 → 자동 롤백
```

**스크립트 설계 원칙:**
1. **Idempotent**: 같은 스크립트를 여러 번 실행해도 결과 동일
2. **정확한 exit code**: 0은 성공, 비0은 실패 — CodeDeploy가 이것으로 자동 롤백 결정
3. **로그 기록**: `/var/log/codedeploy-hook.log`에 타임스탬프와 함께 기록
4. **타임아웃 준수**: AppSpec의 `timeout`보다 빨리 완료되거나 exit 1로 종료

> ⚠️ **함정**: "실패를 숨기기 위해 exit 0을 강제" 패턴은 최악의 안티패턴이다. 스크립트가 항상 성공 코드를 반환하면 CodeDeploy가 실패를 감지하지 못하고, 잘못된 버전이 배포된 채로 자동 롤백이 일어나지 않는다. 스크립트 실패는 반드시 비0 exit code로 보고해야 한다.

> 🔍 **더 깊이**: `set -euo pipefail`은 스크립트 안전성의 기본 설정이다. `-e`는 명령이 실패하면 즉시 스크립트를 종료하고, `-u`는 정의되지 않은 변수 참조를 에러로 처리하며, `pipefail`은 파이프라인의 중간 명령 실패도 전파한다. 이 없으면 `cmd1 | cmd2`에서 `cmd1`이 실패해도 `cmd2`가 성공하면 스크립트가 0을 반환할 수 있다. CodeDeploy Hook 스크립트에서 이 설정은 선택이 아니라 필수다.

---

## ASG와 CodeDeploy 통합: 자동 동기화 메커니즘

Deployment Group 생성 시 ASG를 타깃으로 지정하면, CodeDeploy는 그 ASG를 **지속적으로 모니터링**한다.

```bash
aws deploy create-deployment-group \
  --application-name MyApp \
  --deployment-group-name prod \
  --deployment-config-name CodeDeployDefault.OneAtATime \
  --service-role-arn arn:aws:iam::...:role/CodeDeployServiceRole \
  --auto-scaling-groups myapp-asg \
  --load-balancer-info "elbInfoList=[{name=myapp-tg}]" \
  --auto-rollback-configuration "enabled=true,events=DEPLOYMENT_FAILURE"
```

**배포 중 스케일 아웃 처리 흐름:**
```
배포 진행 중 (e.g. OneAtATime으로 6개 중 3개 완료)
    │
ASG Scale-out 이벤트 → 새 EC2 인스턴스 기동
    │
CodeDeploy Agent가 기동 후 Deployment Group에 등록
    │
CodeDeploy가 새 인스턴스 감지 → 진행 중인 배포의 동일 revision 자동 적용
    │
새 인스턴스 = 새 버전으로 InService
```

**Deployment Configuration 종류:**

| Configuration | 동작 | 특징 |
|--------------|------|------|
| `OneAtATime` | 1개씩 순서대로 교체 | 가장 안전, 가장 느림 |
| `HalfAtATime` | 절반씩 교체 | 균형 |
| `AllAtOnce` | 모두 동시에 교체 | 가장 빠름, 다운타임 위험 |
| Custom | 직접 비율 정의 | 예: 25%씩 4회 |

> ⚠️ **함정**: "배포 중 스케일 아웃하면 새 인스턴스는 구 버전이 설치됨" — 이것이 틀린 답이다. CodeDeploy는 ASG에 새 인스턴스가 추가될 때 자동으로 현재 진행 중인(또는 가장 최근에 성공한) 배포를 적용한다. 단, 이것은 **AutoScaling 배포**라는 별도 배포 이벤트로 처리된다. 콘솔에서 두 가지 배포(수동 배포 + AutoScaling 배포)가 동시에 보일 수 있다.

---

## ASG Rolling 업데이트와 배포 전략: MinHealthyPercent와 MaxBatchSize

**핵심 파라미터:**
- `MinHealthyPercent`: 배포 중 최소 유지해야 하는 건강한 인스턴스 비율
- `MaxBatchSize` (또는 `MaxUnavailable`): 한 번에 교체 가능한 최대 인스턴스 수

```
인스턴스 10개, MinHealthyPercent=70%, MaxBatchSize=30% 설정

1단계: 3개 (30%) 교체 → 7개 (70%) 정상 유지
2단계: 3개 교체 → 7개 유지
3단계: 나머지 4개 중 3개 교체 → 7개 유지
4단계: 마지막 1개 교체
```

**Surge 패턴 (다운타임 없는 교체):**
```bash
aws ecs update-service \
  --deployment-configuration \
    "minimumHealthyPercent=100,maximumPercent=200"
```

`maximumPercent=200` + `minimumHealthyPercent=100`은 새 Task를 모두 먼저 띄우고(총 200%), 검증 후 구 Task를 제거하는 전략이다. 일시적으로 인스턴스 수가 2배가 되지만 다운타임이 없다.

> 💡 **관련 이론**: MinHealthyPercent와 MaxBatchSize의 조합은 **Rolling Upgrade의 Trade-off**를 직접 제어한다. MinHealthyPercent를 높이면 배포 중에도 높은 가용성을 유지하지만 교체 속도가 느려진다(배치 크기가 제한됨). 낮추면 빠르지만 용량이 줄어든다. 이 설정은 서비스의 SLO와 연결된다 — 트래픽이 예측 불가능하면 MinHealthyPercent=100이 안전하다.

---

## Circuit Breaker: 자동 롤백의 두 레이어

CodeDeploy의 자동 롤백은 두 가지 시점에서 발동할 수 있다.

**레이어 1: Deployment 단계 실패 (즉각)**
```bash
--auto-rollback-configuration "enabled=true,events=DEPLOYMENT_FAILURE"
```
Hook 스크립트가 비0 exit code를 반환하거나, 배포 시간이 초과되면 즉시 롤백.

**레이어 2: CloudWatch Alarm 기반 (배포 후)**
```bash
--auto-rollback-configuration \
  "enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM" \
--alarm-configuration \
  "enabled=true,alarms=[{name=Prod5xx},{name=HighLatencyAlarm}]"
```
배포는 성공했지만 운영 중 알람이 울리면 이전 revision으로 자동 롤백.

```
배포 흐름과 Circuit Breaker 발동 시점
=============================================

[배포 시작]
    │
[Hook 실행] ──실패(exit≠0)──▶ [레이어 1 롤백] (즉시)
    │ 성공
[배포 완료] ──────────────────▶ [배포 성공]
    │
[운영 모니터링 기간]
    │
[CloudWatch Alarm 발동] ──────▶ [레이어 2 롤백] (alarmRollback)
    │ 알람 없음
[완전 안정]
```

> 📚 **사례**: 2020년 한 전자상거래 팀이 배포 후 1시간 만에 장바구니 API 오류율이 2%→15%로 증가했다. 원인은 배포된 코드의 메모리 누수였다. `ValidateService` Hook에서는 정상이었지만 트래픽이 몰리자 증상이 나타났다. 이후 그 팀은 `5xx 오류율 > 5%` CloudWatch Alarm을 Deployment Group에 연결해, 배포 후 30분 모니터링 기간 동안 자동 롤백이 가능하도록 구성했다. 레이어 2 Circuit Breaker의 필요성을 실감한 사례다.

> 🎯 **시나리오**: 한 팀이 "배포는 성공하는데 그 후 30분 내에 장애가 자주 발생한다"고 보고했다. `ValidateService` Hook을 강화해야 할까, CloudWatch Alarm 기반 자동 롤백을 추가해야 할까? 정답은 **둘 다이지만 순서가 있다**. 먼저 `ValidateService`를 강화해 배포 시점에 잡을 수 있는 문제를 잡는다. 배포 후 시간이 지나야 나타나는 문제(메모리 누수, 동시성 이슈 등)는 CloudWatch Alarm 기반 롤백으로 잡는다. 두 메커니즘은 서로 다른 시점의 실패를 잡는다.

---

## On-Premises 인스턴스 등록: IAM User vs STS Session

**IAM User 방식 (단순하나 보안 약함):**
```bash
aws deploy register-on-premises-instance \
  --instance-name my-onprem-server-01 \
  --iam-user-arn arn:aws:iam::123456789:user/codedeploy-onprem-01 \
  --tags Key=Environment,Value=prod

# 결과: /etc/codedeploy-agent/conf/codedeploy.onpremises.yml에
# 장기 IAM 자격 증명이 저장됨
```

이 방식의 문제: 장기 자격 증명이 서버 디스크에 평문으로 저장된다. 서버가 침해되면 자격 증명도 유출된다.

**IAM Role + STS AssumeRole 방식 (권장):**
```bash
# 1. On-Prem용 IAM Role 생성 (Trust Policy: 온프레미스 서버가 assume)
# 2. 서버에서 주기적으로 STS AssumeRole 실행 → 임시 자격 증명 발급
# 3. Agent 설정 업데이트 (만료 전 갱신)

aws sts assume-role \
  --role-arn arn:aws:iam::123456789:role/CodeDeployOnPremRole \
  --role-session-name onprem-deploy-session \
  --duration-seconds 3600
# → AccessKeyId, SecretAccessKey, SessionToken (1시간 유효)
```

**On-Premises 제약 사항:**
- Blue/Green 배포 **지원 안 함** — In-place만
- 새 인스턴스를 AWS가 생성할 수 없기 때문
- 롤백은 이전 revision 재배포 방식

> 🔍 **더 깊이**: On-Premises 인스턴스 등록은 **하이브리드 클라우드** 패턴이다. AWS 바깥의 장치/서버가 AWS API에 접근하기 위해 자격 증명을 갖는 구조다. 보안 모범 사례는 장기 자격 증명(IAM User Access Key) 대신 단기 자격 증명(STS)을 사용하는 것이다. AWS Systems Manager Hybrid Activations도 같은 문제를 해결하는데, SSM Agent를 On-Premises에 설치하면 SSM의 모든 기능(Session Manager, Patch Manager, State Manager)을 온프레미스에서도 쓸 수 있다. 결합하면 CodeDeploy는 배포만, SSM은 나머지 운영을 담당하는 역할 분리가 가능하다.

---

## ASG Lifecycle Hook: 배포 완료 전 트래픽 차단

ASG Lifecycle Hook은 인스턴스가 InService 상태가 되기 전에 사용자 정의 작업을 삽입할 수 있게 한다.

```
EC2_INSTANCE_LAUNCHING 이벤트
    │
[Wait: Lifecycle Hook이 인스턴스를 "대기" 상태로 붙잡음]
    │ (CodeDeploy가 배포 완료)
CompleteLifecycleAction(CONTINUE) 호출
    │
인스턴스가 InService → ELB에 등록 → 트래픽 수신 시작
```

배포 완료 전 인스턴스가 ELB에 등록되어 구 버전(또는 미설치 상태)으로 트래픽을 받는 것을 방지한다. CodeDeploy는 자체적으로 이 Lifecycle Hook 패턴을 지원하며, Deployment Group에서 ELB/ALB를 설정하면 자동으로 배포 중 인스턴스를 ELB에서 제거하고 완료 후 재등록한다.

---

## Deployment Group Tag 매칭: 정교한 타깃 제어

| 설정 | 동작 | 예시 |
|------|------|------|
| AND (단일 그룹 내 다중 태그) | 모든 태그가 일치하는 인스턴스만 | `Env=prod AND Tier=web` |
| OR (다중 태그 그룹) | 어느 태그라도 일치하면 포함 | `Env=prod OR Env=staging` |

```bash
# AND 예: prod 환경의 web tier만
aws deploy create-deployment-group \
  --ec2-tag-filters \
    "Key=Environment,Value=prod,Type=KEY_AND_VALUE" \
    "Key=Tier,Value=web,Type=KEY_AND_VALUE"

# OR 예: prod 또는 staging 중 하나라도 일치하면
aws deploy create-deployment-group \
  --ec2-tag-set-list \
    "[{Key=Environment,Value=prod,Type=KEY_AND_VALUE}]" \
    "[{Key=Environment,Value=staging,Type=KEY_AND_VALUE}]"
```

> 💡 **관련 이론**: Tag 기반 Deployment Group은 **Infrastructure as Code(IaC)의 선언적 타깃팅**이다. "어느 인스턴스를 배포 대상으로 할 것인가"를 태그로 선언하면, 새 인스턴스가 생기든 기존 인스턴스가 사라지든 Group이 동적으로 관리된다. 반면 IP나 인스턴스 ID로 고정하면 인스턴스가 교체될 때마다 설정을 수동으로 업데이트해야 한다. 태그 기반 타깃팅이 IaC 원칙에 부합한다.

---

## GreenFleetProvisioningOption: Blue/Green 인스턴스 출처

EC2 Blue/Green에서 Green 인스턴스를 어떻게 만들 것인가:

| 옵션 | 동작 | 사용 시점 |
|------|------|---------|
| `COPY_AUTO_SCALING_GROUP` | 기존 ASG를 복사해 새 ASG 자동 생성 | 표준 패턴 (거의 항상) |
| `DISCOVER_EXISTING` | 이미 존재하는 인스턴스를 Green으로 사용 | 특수한 사전 프로비저닝 시나리오 |

`COPY_AUTO_SCALING_GROUP`이 거의 모든 경우의 표준이다. 현재 ASG의 Launch Template/Configuration을 복사해 동일한 인스턴스 타입, 네트워크, 태그로 새 ASG를 생성한다.

**Termination Wait Time (종료 대기 시간):**
트래픽 시프트 완료 후 Blue 인스턴스를 즉시 종료하지 않고 대기하는 시간.
- 기본값: 1시간
- 대기 중: Blue + Green 모두 실행 → EC2 비용 2배
- 목적: 문제 발견 시 즉시 롤백 가능 (Blue가 살아있으므로)
- 트레이드오프: 안전망 ↔ 비용

> ⚠️ **함정**: Termination Wait Time을 너무 길게 설정하면 비용이 크게 증가한다. 2일로 설정하면 Blue 인스턴스가 2일 동안 유지되어 EC2 비용이 2일치 추가 발생한다. 대부분의 팀에서 30분~1시간이 균형점이다. 시험에서 "Termination Wait Time을 7일로 설정한다"가 보기에 나오면 비용 문제를 묻는 것이다.

---

## 마무리: EC2 배포 판단 흐름

```
배포 대상이 EC2인가?
    ├─ Agent 설치 여부 → SSM State Manager 자동 관리
    ├─ 타깃 방식 → 태그 기반 (IaC 원칙) 또는 ASG
    ├─ 배포 속도 → OneAtATime / HalfAtATime / Custom
    ├─ 자동 롤백 → 레이어 1 (Hook 실패) + 레이어 2 (CW Alarm)
    └─ ASG 통합 → 배포 중 스케일 아웃 = 자동 동기화

On-Premises인가?
    ├─ Blue/Green 불가 → In-place only
    ├─ 자격 증명 → STS 단기 자격 증명 권장
    └─ EC2 배포와 동일한 AppSpec Hook 구조
```

---

## 📝 연습 문제

**문제 1.** CodeDeploy 배포가 진행 중일 때 ASG가 스케일 아웃하면, 새로 추가된 EC2 인스턴스의 코드 버전은?

A) 구 버전으로 시작하고 다음 배포까지 유지
B) CodeDeploy가 자동으로 진행 중인 배포의 동일 revision을 새 인스턴스에 적용
C) 배포가 즉시 실패 처리됨
D) 새 인스턴스는 Deployment Group에서 제외됨

**정답: B**
해설: CodeDeploy와 ASG가 통합되면, ASG에 새 인스턴스가 추가될 때 CodeDeploy가 이를 감지해 현재 진행 중인 배포의 동일 revision을 자동 적용한다. 이 자동 동기화 덕분에 배포 중 스케일 아웃이 발생해도 클러스터 전체가 일관된 버전을 유지한다. 이것은 별도의 AutoScaling 배포 이벤트로 처리되어 콘솔에서 볼 수 있다.

---

**문제 2.** CodeDeploy Agent를 모든 EC2에 자동 설치하고 최신 버전으로 유지하는 가장 좋은 방법은?

A) 모든 AMI에 Agent를 미리 설치 (AMI Pipeline으로 주기 업데이트)
B) SSM State Manager Association: `AWS-ConfigureAWSPackage` + `AWSCodeDeployAgent` + 30일 주기 schedule
C) User Data 스크립트로 설치 (AMI 변경 없이 업데이트 불가)
D) Lambda로 매일 SSM Run Command 실행

**정답: B**
해설: SSM State Manager는 "desired state"를 정의하면 지속적으로 그 상태를 유지한다. 새 인스턴스에 자동 설치되고, 주기(30일)마다 최신 버전으로 업데이트된다. AMI 굽기(A)는 Agent 업데이트마다 새 AMI를 만들어야 해서 유지보수 부담이 크다. User Data(C)는 업데이트가 어렵다.

---

**문제 3.** EC2/On-Premises AppSpec Hook의 실행 순서로 올바른 것은?

A) BeforeInstall → Install → AfterInstall → ApplicationStop → ApplicationStart → ValidateService
B) ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService
C) ApplicationStart → BeforeInstall → Install → AfterInstall → ValidateService
D) Install → BeforeInstall → AfterInstall → ApplicationStop → ApplicationStart

**정답: B**
해설: EC2/On-Premises AppSpec Hook의 고정 순서는 ApplicationStop(기존 앱 종료) → DownloadBundle(자동) → BeforeInstall(설치 전 준비) → Install(자동 파일 복사) → AfterInstall(설치 후 설정) → ApplicationStart(새 앱 시작) → ValidateService(검증)이다. `ApplicationStop`은 이전 revision의 스크립트가 실행된다는 점이 중요하다.

---

**문제 4.** AppSpec Hook 스크립트의 `exit 0` 강제(항상 성공 반환)가 위험한 이유는?

A) 스크립트가 더 느려진다
B) CodeDeploy가 실패를 감지하지 못해 잘못된 버전이 배포된 상태로 자동 롤백이 일어나지 않는다
C) IAM 권한 오류를 숨긴다
D) S3 업로드 실패를 유발한다

**정답: B**
해설: CodeDeploy는 Hook 스크립트의 exit code로 성공/실패를 판단한다. 항상 0을 반환하면 헬스체크가 실패해도, 앱이 제대로 시작 안 해도 CodeDeploy는 배포가 성공했다고 처리한다. 자동 롤백 트리거(DEPLOYMENT_FAILURE)가 동작하지 않는다. 실패는 반드시 비0 exit code로 정직하게 보고해야 한다.

---

**문제 5.** On-Premises 서버에 CodeDeploy로 배포할 때 Blue/Green을 사용할 수 없는 이유는?

A) On-Premises Agent 버전이 낮아서
B) AWS가 On-Premises 인프라를 직접 제어해 새 인스턴스를 생성할 수 없기 때문
C) 네트워크 속도 제한 때문
D) IAM 권한 부족 때문

**정답: B**
해설: Blue/Green의 핵심은 "새 환경을 AWS가 자동 생성"하는 것이다. EC2/ASG는 AWS가 생성/종료를 제어할 수 있지만, 온프레미스 서버는 AWS의 제어 범위 밖이다. 따라서 In-place만 가능하다. 온프레미스에서 Blue/Green과 유사한 효과를 내려면 별도의 인프라 자동화(Terraform + 자체 로드밸런서)를 구축해야 한다.

---

**문제 6.** ASG의 `Launch` 프로세스가 Suspend된 상태에서 EC2 Blue/Green 배포를 시작하면 어떻게 되는가?

A) 배포가 더 빠르게 완료된다
B) 새 Green 인스턴스를 생성할 수 없어 Blue/Green 배포 자체가 진행되지 않는다
C) In-place로 자동 전환된다
D) CodeDeploy가 Suspend를 자동 해제한다

**정답: B**
해설: EC2 Blue/Green은 새 ASG(또는 인스턴스)를 생성하는 것이 핵심이다. ASG의 `Launch` 프로세스가 Suspend(일시 정지)되면 새 인스턴스 생성이 안 된다. 배포 트러블슈팅 시 ASG의 Suspended Processes 확인이 1순위 체크 항목이다. `Resume` 후 배포를 재시도해야 한다.

---

**문제 7.** Termination Wait Time(종료 대기 시간)을 2일로 설정했다. 이것이 의미하는 비용 영향은?

A) 배포 비용이 2배가 된다
B) 트래픽 시프트 완료 후 2일 동안 구 Blue 인스턴스가 그대로 실행되며 EC2 비용이 2일치 추가 발생한다
C) 비용 영향 없음
D) 새 Green 인스턴스 비용만 발생한다

**정답: B**
해설: Termination Wait Time 동안 Blue(구) 인스턴스와 Green(새) 인스턴스가 동시에 실행된다. 트래픽은 Green만 받지만 Blue EC2도 계속 과금된다. 2일이면 Blue 인스턴스 비용이 2일치 더 발생한다. 안전망과 비용의 트레이드오프 — 대부분 30분~1시간이 표준적인 균형점이다.

---
