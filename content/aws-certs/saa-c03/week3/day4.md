# Day 4 - Auto Scaling Group: 제어 이론, 예측 확장, 그리고 우아한 종료의 기술

자동 확장의 개념은 간단해 보인다. CPU가 높으면 서버를 더 추가하고, 낮으면 줄인다. 그런데 실제로 구현하다 보면 생각지 못한 문제들이 생긴다. 새 인스턴스가 뜨는 2분 동안 CPU가 100%로 치솟아 다시 스케일아웃이 트리거된다. 종료되는 인스턴스에서 처리 중이던 주문이 사라진다. 매일 오전 9시에 사용자가 몰리는데 Target Tracking은 이미 CPU가 높아진 후에야 반응한다.

이 글은 AWS Auto Scaling Group(ASG)이 이런 문제들을 어떻게 해결하는지, 그 내부 설계 원리와 제어 이론적 배경까지 다룬다. 스케일링 정책 4종의 수학적 차이, Lifecycle Hook의 활용 패턴, Warm Pool의 경제학, Predictive Scaling의 ML 모델까지 이해하면 시험 시나리오뿐 아니라 실제 프로덕션 설계에도 바로 쓸 수 있다.

## ASG의 역사적 배경: 왜 Auto Scaling이 필요했나

2008년 이전 웹 서비스는 피크 부하를 감당하기 위해 항상 최대 용량의 서버를 켜두어야 했다. Netflix가 DVD 대여 웹사이트였을 때, 금요일 저녁 트래픽을 위해 평일 낮에도 같은 수의 서버를 유지했다. 이것은 낭비였다.

2009년 AWS Auto Scaling 출시로 이 패러다임이 바뀌었다. 트래픽에 따라 인스턴스 수를 자동 조절할 수 있게 됐다. 그러나 초기 Auto Scaling은 단순했다: "CloudWatch 알람이 울리면 인스턴스를 추가하라." 이것이 Simple Scaling Policy의 시작이다.

시간이 지나면서 Simple Scaling의 한계가 드러났다. 알람이 울려서 인스턴스를 추가하고, 새 인스턴스가 뜨는 3분 동안 여전히 CPU가 높아서 또 알람이 울리고, 다시 인스턴스를 추가하는 과잉 반응이 발생했다. 이 문제를 해결하기 위해 Step Scaling, Target Tracking, Scheduled Scaling, Predictive Scaling이 차례로 추가됐다.

## ASG 구성요소: 청사진의 각 부분

ASG는 여러 구성요소가 조합된 시스템이다. 각각이 어떤 역할을 하는지 이해해야 한다.

**Launch Template**: 인스턴스를 어떻게 시작할지의 청사진이다. AMI ID, 인스턴스 타입, 키 페어, 보안 그룹, IAM 인스턴스 프로파일, User Data, EBS 볼륨 설정이 포함된다. Launch Configuration(deprecated)의 후계자로, 버전 관리가 가능해 `$Latest`나 `$Default` 외에 특정 버전을 지정할 수 있다. Instance Refresh로 새 Launch Template 버전을 점진적으로 배포할 수 있다.

**Min / Max / Desired**: Min은 항상 유지할 최소 인스턴스 수(장애에도 보장), Max는 절대 초과하지 않을 상한(비용 보호), Desired는 현재 목표 인스턴스 수다. 스케일링 정책은 Desired를 조정한다. Min과 Max 사이에서만 Desired가 움직인다.

**AZ 분산**: ASG는 지정한 서브넷들에 균등하게 인스턴스를 분산한다. 3개 AZ, 서브넷 각 1개를 지정하면 AZ당 Desired/3개를 유지하려 한다. 한 AZ가 죽으면 나머지 AZ로 인스턴스를 이동시킨다(Rebalancing).

**Health Check**: 인스턴스의 건강 상태를 판단하는 기준이다.

```
[ ASG Health Check 종류와 차이 ]

EC2 Health Check (기본):
- AWS가 물리 호스트 상태를 모니터링
- StatusCheckFailed_System 또는 StatusCheckFailed_Instance
- 인스턴스가 살아있지만 앱이 죽어도 Healthy로 판단

ELB Health Check:
- ALB/NLB 헬스 체크 결과를 ASG에 반영
- 앱 레벨 헬스 체크 (HTTP 200 등) 실패 시 Unhealthy
- "인스턴스는 켜져 있지만 앱이 500 에러 반환" 상황도 감지

권장: 둘 다 활성화 (EC2 + ELB)
Health Check Grace Period: 새 인스턴스가 ELB 헬스 체크를 받기 시작하기 전
  워밍업 시간 (기본 300초). 이 시간 동안 Unhealthy로 판단하지 않음.
```

**Cooldown**: 스케일링 액션 후 다음 액션까지 대기하는 시간이다. Simple Scaling에서만 적용된다(Target Tracking과 Step Scaling은 자체 워밍업 메커니즘이 있음). 기본 300초.

> 💡 **관련 이론**: ASG의 인스턴스 균형 분배(Rebalancing)는 분산 시스템의 **로드 밸런싱 이론**과 연관된다. ASG는 AZ 간 인스턴스 수 차이가 1 이상이면 리밸런싱을 시도한다. 리밸런싱 시 먼저 새 인스턴스를 시작하고, 그 다음 초과 AZ의 인스턴스를 종료한다(종료 전 시작). 이것은 가용성을 유지하면서 균형을 잡는 "start before stop" 전략이다.

## 스케일링 정책 4종: 제어 이론으로 이해하기

스케일링 정책은 "현재 상태"와 "목표 상태" 사이의 차이를 어떻게 조정하는지의 알고리즘이다. 제어 이론(Control Theory)의 관점에서 보면 각 정책의 특성이 명확해진다.

### Target Tracking Scaling: PID 제어의 구름

Target Tracking은 "CPU 평균 50%를 유지하라"처럼 목표값(Target)을 설정하면 ASG가 자동으로 인스턴스 수를 조절한다. 이것은 제어 이론의 **비례-적분 제어(PI Control)**와 유사한 개념이다. 현재 값이 목표에서 얼마나 벗어났는지(오차)와 오차가 얼마나 오래 지속됐는지(적분)를 보고 스케일링 강도를 결정한다.

Target Tracking은 스케일아웃보다 스케일인을 더 보수적으로 한다. 오차가 목표 이하로 떨어져도 최소 15분(기본 설정)은 기다린다. 갑작스러운 스파이크가 사라졌을 때 너무 빨리 인스턴스를 줄였다가 다시 트래픽이 오면 곤란하기 때문이다.

지원 메트릭:
- `ASGAverageCPUUtilization`: 평균 CPU 사용률
- `ASGAverageNetworkIn` / `ASGAverageNetworkOut`: 평균 네트워크 트래픽
- `ALBRequestCountPerTarget`: ALB에서 타겟당 요청 수

ALBRequestCountPerTarget이 Target Tracking의 가장 실용적인 메트릭이다. CPU보다 실제 요청 부하를 직접 측정하기 때문이다. CPU는 요청 수와 무관한 백그라운드 작업(GC, 인덱싱 등)에 의해 높아질 수 있지만, 요청 수는 순수하게 트래픽 부하를 나타낸다.

> 🔍 **더 깊이**: Target Tracking Scaling은 내부적으로 CloudWatch에 자동으로 두 개의 알람을 생성한다. 하나는 스케일아웃용(목표 초과), 하나는 스케일인용(목표 이하 × 0.9). 목표의 90% 아래로 충분히 떨어질 때만 스케일인하는 이유는 진동(oscillation)을 방지하기 위해서다. 이 자동 생성 알람을 직접 수정하면 안 된다.

### Step Scaling: 계단식 반응

Step Scaling은 알람의 심각도에 따라 다른 크기의 스케일링을 트리거한다.

```
CPU 60-70%: +1 인스턴스
CPU 70-80%: +3 인스턴스
CPU 80%+:   +5 인스턴스 (즉시, 워밍업 중에도 중첩 가능)
```

Step Scaling은 Target Tracking보다 세밀한 제어가 필요할 때 쓴다. 예를 들어 CPU보다 요청 큐 깊이가 중요한 워크로드에서, 큐가 100개 이상이면 대형 스케일아웃, 1000개 이상이면 긴급 대량 스케일아웃을 다르게 설정할 수 있다.

Step Scaling은 Cooldown 없이 여러 단계가 중첩 실행될 수 있다(aggregation). Target Tracking이 불필요할 때 두 번째 선택지다.

### Scheduled Scaling: 예측 가능한 패턴

패턴이 예측 가능한 트래픽에는 사전에 스케일링을 예약한다. cron 표현식으로 시간을 지정한다.

```bash
# 매일 월-금 오전 8:30에 10대로 스케일
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name app-asg \
  --scheduled-action-name morning-scale-out \
  --recurrence "30 8 * * 1-5" \
  --min-size 5 --desired-capacity 10 --max-size 20

# 매일 저녁 6시에 최소로 줄임
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name app-asg \
  --scheduled-action-name evening-scale-in \
  --recurrence "0 18 * * 1-5" \
  --min-size 2 --desired-capacity 2 --max-size 20
```

Scheduled Scaling은 Target Tracking과 결합해서 쓴다. 오전 8시에 최소값을 미리 높여놓고, Target Tracking이 나머지를 세밀하게 조정한다.

### Predictive Scaling: ML 기반 사전 확장

Predictive Scaling(2021년 GA)은 과거 2주 동안의 메트릭 패턴을 ML로 분석해 미래 부하를 예측하고, 부하가 오기 전에 미리 스케일아웃한다. "리액티브(reactive)"가 아니라 "프로액티브(proactive)"다.

주간 패턴이나 일간 패턴이 있는 워크로드에서 효과적이다. 월요일 오전 9시에 항상 트래픽이 2배로 뛰는 업무 앱이라면, Predictive Scaling이 8시 45분에 미리 인스턴스를 추가해둔다. Target Tracking은 트래픽이 실제로 뛴 후 CPU가 올라가야 반응하므로 2-3분의 반응 지연이 있다.

> 💡 **관련 이론**: Predictive Scaling의 내부 모델은 **시계열 예측(Time Series Forecasting)** 알고리즘이다. AWS는 공개하지 않지만, 일간/주간 계절성(seasonality)과 추세(trend)를 분해하는 분해 모델(Decomposition Model)이나 Prophet(Facebook 오픈소스) 유사 모델로 추정된다. 중요한 것은 학습에 최소 2주 데이터가 필요하며, 새로운 서비스는 처음 2주 동안 예측이 정확하지 않다.

> 📚 **사례**: AWS re:Invent 2020에서 Amazon.com의 Prime Day 준비 사례가 공개됐다. Predictive Scaling을 사용해 과거 Prime Day 패턴을 학습시키고, 당일 트래픽 폭증 전 수십 분 전부터 자동으로 수천 대의 인스턴스를 추가했다. 리액티브 스케일링만 사용했을 때보다 응답 시간이 15% 향상됐다.

## Lifecycle Hooks: 인스턴스의 시작과 끝을 제어하다

일반적으로 ASG는 인스턴스를 시작하면 즉시 트래픽을 받게 하고, 종료 결정이 나면 즉시 제거한다. Lifecycle Hook은 이 과정에 개입할 수 있는 포인트를 제공한다.

```
[ ASG 인스턴스 생명주기 ]

EC2:Pending
    ↓ [Pending:Wait] ← Lifecycle Hook 개입 가능
EC2:Pending:Wait
    ↓ (처리 완료 또는 타임아웃)
EC2:Pending:Proceed
    ↓
EC2:InService ← 트래픽 수신 시작

EC2:Terminating
    ↓ [Terminating:Wait] ← Lifecycle Hook 개입 가능
EC2:Terminating:Wait
    ↓ (처리 완료 또는 타임아웃)
EC2:Terminating:Proceed
    ↓
EC2:Terminated
```

**시작 시(Pending:Wait) 활용 패턴**:
1. SSM을 통해 추가 소프트웨어 설치
2. 애플리케이션 설정 파일을 Parameter Store에서 가져와 적용
3. 캐시 워밍업(Redis, 로컬 캐시)
4. 배포 도구 등록
5. 준비 완료 후 `complete-lifecycle-action SUCCESS` 신호

**종료 시(Terminating:Wait) 활용 패턴**:
1. 진행 중인 요청 완료 대기(ELB Deregistration Delay와 별개)
2. 메모리 상태 S3에 저장(체크포인트)
3. 로그 파일 CloudWatch Logs로 업로드
4. 디버깅 데이터 수집
5. 등록 해제 알림 전송

Lifecycle Hook의 알림은 EventBridge, SNS, SQS로 보낼 수 있다. Lambda와 연결해서 자동으로 처리하는 패턴이 일반적이다.

> 📚 **사례**: Discord는 실시간 메시지 처리 서버에서 Lifecycle Hook을 활용한다. 서버가 종료될 때 Terminating:Wait 훅으로 현재 처리 중인 WebSocket 연결을 다른 서버로 마이그레이션하고, 연결이 모두 이동된 후 종료 신호를 보낸다. 이를 통해 사용자가 갑작스러운 연결 끊김 없이 서버 교체가 이루어진다.

## Warm Pool: 스케일링 지연 시간의 혁명

새 EC2 인스턴스가 완전히 서비스 가능한 상태가 될 때까지 걸리는 시간을 생각해보자.

```
EC2 부팅 시간: 30-60초
AMI에서 OS 시작: 60-120초
User Data 실행(소프트웨어 설치, 설정): 2-5분
애플리케이션 시작(JVM, ML 모델 로드): 1-3분
ELB Health Check 통과: 30-90초
─────────────────────────────────────────
총 준비 시간: 5-10분
```

이 5-10분이 문제다. 갑작스러운 트래픽 폭증 시 이미 CPU가 100%인데 새 인스턴스가 뜰 때까지 5-10분을 버텨야 한다.

**Warm Pool**은 이 준비된 인스턴스를 미리 대기시킨다. 인스턴스가 완전히 초기화되었지만 트래픽은 받지 않는 상태(Stopped 또는 Running)로 풀에 넣어둔다. 스케일아웃 신호가 오면 Warm Pool에서 즉시 꺼내 InService로 전환한다. 준비 시간이 30-60초로 단축된다.

Warm Pool의 인스턴스 상태:
- `Stopped`: 시작 완료, 정지 상태. EC2 비용 없음(EBS 비용만). 다시 시작 시 30-60초.
- `Running`: 시작 완료, 실행 중(트래픽만 없음). EC2 비용 발생. 즉시 투입 가능.
- `Hibernated`: RAM 상태 보존. 더 빠른 재개 가능.

> 🔍 **더 깊이**: Warm Pool 인스턴스가 Stopped 상태일 때, ASG는 이 인스턴스들을 `Warmed:Stopped` 상태로 추적한다. 스케일아웃 신호 시 인스턴스를 Start하고, Lifecycle Hook이 있으면 `Pending:Wait`를 거쳐 InService가 된다. Warm Pool 없이 새 인스턴스를 시작하는 것보다 훨씬 빠르지만, Lifecycle Hook이 긴 작업을 수행하면 그만큼 지연이 생긴다. 최적 설계는 Warm Pool에서 무거운 초기화를 미리 완료하고, Lifecycle Hook은 짧은 작업(설정 파일 가져오기, 헬스 체크 등록 등)만 하는 것이다.

## Termination Policy: 어떤 인스턴스를 먼저 종료할까

스케일인 시 어떤 인스턴스를 종료할지 결정하는 것도 중요하다.

| 정책 | 동작 |
|------|------|
| Default | AZ 균형 → 가장 오래된 Launch Config/Template → 청구 시간 가까운 것 |
| OldestInstance | 가장 오래된 인스턴스 종료 (새 타입으로 자연 교체) |
| NewestInstance | 가장 새로운 인스턴스 종료 (새 구성 배포를 빠르게 취소할 때) |
| OldestLaunchConfiguration | 구버전 LC를 사용하는 인스턴스 우선 종료 |
| ClosestToNextInstanceHour | 청구 시간 단위가 가장 임박한 인스턴스 종료 (비용 최적화) |

**Default Policy의 로직**:
1. 가장 많은 인스턴스가 있는 AZ에서 종료 (AZ 균형)
2. 동일 AZ에서 가장 오래된 Launch Configuration/Template 사용 인스턴스
3. 동일한 경우 청구 시간 단위 갱신에 가장 임박한 인스턴스

EC2는 초당 과금이므로 ClosestToNextInstanceHour는 현재 큰 의미가 없다. 그러나 온디맨드 가격으로 청구되는 RI 사용률을 최적화할 때는 여전히 유효하다.

**Scale-in Protection**: 특정 인스턴스를 ASG의 스케일인 대상에서 제외한다. Stateful 처리(멀티 스텝 트랜잭션, 게임 세션 호스팅)를 하는 인스턴스에 임시로 적용한다.

## Mixed Instances Policy: Spot + On-Demand의 균형

Mixed Instances Policy는 하나의 ASG에서 여러 인스턴스 타입과 On-Demand/Spot을 섞어 사용한다.

```json
{
  "MixedInstancesPolicy": {
    "LaunchTemplate": {
      "LaunchTemplateSpecification": {
        "LaunchTemplateName": "app-lt",
        "Version": "$Latest"
      },
      "Overrides": [
        {"InstanceType": "c6i.xlarge"},
        {"InstanceType": "c6a.xlarge"},
        {"InstanceType": "c7g.xlarge"},
        {"InstanceType": "m6i.xlarge"}
      ]
    },
    "InstancesDistribution": {
      "OnDemandPercentageAboveBaseCapacity": 20,
      "SpotAllocationStrategy": "capacity-optimized",
      "OnDemandBaseCapacity": 2
    }
  }
}
```

이 설정의 의미: 최소 2대는 On-Demand(기반 안정성), 나머지의 20%는 On-Demand, 80%는 Spot. Spot은 4개 인스턴스 타입 중에서 `capacity-optimized`(인터럽션 빈도 최소화) 전략으로 선택.

**Capacity Rebalancing**: Spot 인터럽션 경고가 오면 ASG가 자동으로 새로운 Spot 인스턴스를 먼저 시작하고, 인터럽션 대상 인스턴스를 종료한다. 인스턴스 수를 유지하면서 가용성을 보호한다.

> 💡 **관련 이론**: Mixed Instances Policy에서 여러 인스턴스 타입을 허용하는 것은 포트폴리오 이론(Portfolio Theory)의 분산 투자와 유사하다. 단일 인스턴스 타입에만 의존하면 그 타입의 Spot 가용성이 낮을 때 인터럽션이 몰린다. 여러 타입을 분산하면 어느 하나의 타입에 Spot 압박이 와도 나머지 타입이 커버한다. AWS는 이를 "instance type diversification"이라 부른다.

## Instance Refresh: 무중단 AMI 업데이트

새 AMI나 새 Launch Template 버전으로 기존 인스턴스를 점진적으로 교체하는 기능이다. 배포 전략은 Rolling 방식을 따른다.

```bash
# Instance Refresh 시작
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name app-asg \
  --preferences '{
    "MinHealthyPercentage": 80,
    "InstanceWarmup": 120
  }'
```

`MinHealthyPercentage: 80`은 교체 중에도 80% 이상의 인스턴스는 항상 Healthy 상태를 유지한다는 의미다. 10대 중 2대씩 교체하면서 각 배치가 안정화될 때까지 기다린다. CI/CD 파이프라인에서 AMI를 빌드하고 Instance Refresh로 자동 배포하는 패턴이 EC2 기반 배포의 표준이 되었다.

> ⚠️ **함정**: Instance Refresh는 새 인스턴스가 Healthy가 된 후 이전 인스턴스를 종료한다. 그런데 Lifecycle Hook의 Terminating:Wait가 있으면 종료 전에 훅 처리를 기다린다. 훅 처리 시간이 길면 Instance Refresh 전체 시간이 매우 길어질 수 있다. Instance Refresh 중에는 Lifecycle Hook 타임아웃을 짧게 설정하거나, 훅 자체를 비활성화하는 것을 고려해야 한다.

## 다른 클라우드와의 Auto Scaling 비교

| 기능 | AWS ASG | GCP Managed Instance Groups | Azure VMSS |
|------|---------|----------------------------|------------|
| 정책 종류 | Target Tracking, Step, Scheduled, Predictive | Target Utilization, Scaling Policy | Metric-based, Schedule |
| Predictive Scaling | O (ML 기반) | O (Predictive Autoscaling) | 제한적 |
| Lifecycle Hook | O | 제한적 (startup/shutdown scripts) | O (Extension hooks) |
| Warm Pool | O | O (Warm Pool GCE) | X (직접 구현 필요) |
| Spot 통합 | Mixed Instances Policy | Preemptible VM 비율 설정 | Azure Spot VM 비율 |
| 인스턴스 타입 다양화 | O (Overrides) | O (Instance Templates) | O (VM Profiles) |

GCP의 Managed Instance Group은 AWS ASG와 매우 유사한 구조다. Azure VMSS(Virtual Machine Scale Sets)는 Warm Pool이 없어서 스케일아웃 지연 시간이 길 수 있다.

## 표준 아키텍처 패턴

```
[ 고가용성 3계층 웹 아키텍처 + ASG ]

인터넷 → ALB (HTTPS, Multi-AZ)
              ↓
         ASG (Web Tier)
         - LT: ami-xxx, c6i.large
         - Min=2, Max=20, Desired=4
         - AZ: ap-ne-2a, 2b, 2c
         - Health: EC2 + ELB
         - Policy: Target Tracking (ALBRequestCountPerTarget=1000)
         - Lifecycle: Pending:Wait (120s) → SSM 설정 로드
         - Warm Pool: 2 instances (Stopped)
              ↓
         Internal ALB
              ↓
         ASG (App Tier, Spot 80% + OD 20%)
         - Mixed Instances (c6i.xlarge, c6a.xlarge, m6i.xlarge)
         - Policy: Target Tracking (CPU 60%)
         - Capacity Rebalancing: enabled
              ↓
         RDS Multi-AZ (MySQL)
```

## CLI로 이해 굳히기

```bash
# Launch Template 생성 (IMDSv2 강제)
aws ec2 create-launch-template \
  --launch-template-name app-lt-v2 \
  --launch-template-data '{
    "ImageId": "ami-0c55b159cbfafe1f0",
    "InstanceType": "c6i.large",
    "IamInstanceProfile": {"Name": "app-instance-profile"},
    "MetadataOptions": {"HttpTokens": "required", "HttpEndpoint": "enabled"},
    "UserData": "base64-encoded-script"
  }'

# ASG 생성 (Multi-AZ, ELB Health Check)
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name prod-asg \
  --launch-template "LaunchTemplateName=app-lt-v2,Version=\$Latest" \
  --min-size 2 --max-size 20 --desired-capacity 4 \
  --vpc-zone-identifier "subnet-priv-a,subnet-priv-b,subnet-priv-c" \
  --target-group-arns arn:aws:elasticloadbalancing:...:targetgroup/app-tg/xxx \
  --health-check-type ELB \
  --health-check-grace-period 120

# Target Tracking (ALB 요청수 기반)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name prod-asg \
  --policy-name alb-request-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget",
      "ResourceLabel": "app/prod-alb/xxx/targetgroup/app-tg/yyy"
    },
    "TargetValue": 1000.0,
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'

# Lifecycle Hook (종료 시 로그 업로드)
aws autoscaling put-lifecycle-hook \
  --auto-scaling-group-name prod-asg \
  --lifecycle-hook-name graceful-terminate \
  --lifecycle-transition autoscaling:EC2_INSTANCE_TERMINATING \
  --heartbeat-timeout 120 \
  --default-result CONTINUE \
  --notification-target-arn arn:aws:sqs:...:lifecycle-queue \
  --role-arn arn:aws:iam::...:role/asg-lifecycle-role

# Warm Pool 설정 (최대 3개 Stopped 인스턴스 대기)
aws autoscaling put-warm-pool \
  --auto-scaling-group-name prod-asg \
  --pool-state Stopped \
  --min-size 1 \
  --max-group-prepared-capacity 3

# Predictive Scaling 활성화
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name prod-asg \
  --policy-name predictive-cpu \
  --policy-type PredictiveScaling \
  --predictive-scaling-configuration '{
    "MetricSpecifications": [{
      "TargetValue": 50.0,
      "PredefinedMetricPairSpecification": {
        "PredefinedMetricType": "ASGCPUUtilization"
      }
    }],
    "Mode": "ForecastAndScale",
    "SchedulingBufferTime": 300
  }'
```

## 정리하며

ASG는 단순한 "CPU 높으면 서버 추가"가 아니다. 제어 이론 기반의 Target Tracking, 계단식 반응의 Step Scaling, 예측 기반의 Predictive Scaling, 시간 기반의 Scheduled Scaling이 각각 다른 문제를 해결한다. 그리고 Lifecycle Hook은 시작과 종료 사이에 비즈니스 로직을 삽입해 graceful한 운영을 가능하게 한다.

실무에서는 대부분 Target Tracking을 기본으로 하고, 예측 가능한 패턴이 있으면 Predictive나 Scheduled를 추가하는 조합을 쓴다. Warm Pool로 스케일링 응답 시간을 단축하고, Mixed Instances Policy로 비용을 최적화하는 것이 현재의 베스트 프랙티스다.

---

## 📝 연습 문제

**문제 1.** 이커머스 플랫폼이 매일 오전 9시에 트래픽이 3배로 증가하고, 오후 9시에 원래로 돌아오는 패턴이 있다. 또한 갑작스러운 추가 트래픽 스파이크도 발생한다. 가장 적합한 스케일링 전략은?

A) Target Tracking만 사용
B) Scheduled Scaling만 사용
C) Scheduled Scaling + Target Tracking 조합
D) Simple Scaling + Cooldown 300초

**정답: C**
해설: Scheduled Scaling으로 오전 9시에 미리 Min/Desired를 높여 예측 가능한 트래픽에 대응하고, Target Tracking으로 예상치 못한 스파이크를 실시간 처리한다. Target Tracking만 사용하면 트래픽이 오른 후 CPU가 높아진 다음에야 스케일아웃이 시작되어 초반 수 분간 성능 저하가 발생한다. Scheduled만 사용하면 스파이크에 유연하게 대응하지 못한다. Simple Scaling은 Cooldown 때문에 반응이 느리다.

---

**문제 2.** ASG가 ALB 뒤에서 동작한다. 인스턴스에서 애플리케이션이 응답하지 않지만(앱 크래시), EC2 인스턴스 자체는 정상 실행 중이다. ASG가 이 인스턴스를 Unhealthy로 감지하고 교체하려면 어떤 설정이 필요한가?

A) EC2 Health Check 강화 (StatusCheck 간격 단축)
B) ASG에서 ELB Health Check 유형 활성화
C) CloudWatch Agent로 앱 메트릭 수집
D) Auto Recovery (aws:autorecover) 활성화

**정답: B**
해설: EC2 Health Check는 인스턴스의 물리/OS 상태만 확인한다. 앱이 크래시해도 EC2 인스턴스 자체는 Running 상태로 남아 Healthy로 판단된다. ELB Health Check는 ALB가 `/health` 같은 엔드포인트를 호출해 앱 레벨에서 정상 여부를 판단하고, 이 결과를 ASG에 전달한다. ASG에서 `health-check-type ELB`로 설정하면 ALB의 Unhealthy 판정을 받아 인스턴스를 종료하고 새 인스턴스를 시작한다.

---

**문제 3.** JVM 기반 애플리케이션 서버를 ASG로 운영한다. 새 인스턴스가 시작되면 JIT 컴파일 완료까지 5분간 성능이 낮다. 이 기간 동안 ALB가 해당 인스턴스에 많은 트래픽을 보내지 않도록 하려면?

A) Health Check Grace Period를 300초로 설정
B) ASG Health Check를 EC2 타입으로 설정
C) ALB Target Group에 Slow Start 300초 설정
D) Lifecycle Hook Pending:Wait으로 300초 대기

**정답: C**
해설: Slow Start는 ALB Target Group 레벨에서 새로 등록된 타겟에 보내는 트래픽을 점진적으로 늘리는 기능이다. 설정 시간 동안 새 인스턴스는 기존 인스턴스보다 적은 트래픽을 받는다. Health Check Grace Period는 ASG가 ELB 헬스 체크 결과를 무시하는 기간이지, 트래픽을 줄이는 게 아니다. Lifecycle Hook Pending:Wait으로 300초를 기다리면 그 시간 동안 인스턴스가 트래픽을 전혀 받지 못하므로 확장 의미가 없다.

---

**문제 4.** ML 학습 배치 잡을 위해 ASG에서 대규모 GPU 인스턴스를 사용한다. 비용 최적화를 위해 Spot 인스턴스 80%, On-Demand 20% 비율로 운영하고 싶다. Spot 인터럽션 시 가용성을 최대화하려면?

A) Mixed Instances Policy + `lowest-price` Spot 전략 + Capacity Rebalancing
B) Mixed Instances Policy + `capacity-optimized` Spot 전략 + Capacity Rebalancing
C) 두 개의 별도 ASG (Spot 전용 + On-Demand 전용)
D) EC2 Fleet으로 Spot만 사용하고 On-Demand는 별도 관리

**정답: B**
해설: Mixed Instances Policy로 On-Demand 기반(20%)과 Spot(80%)을 하나의 ASG에서 관리한다. `capacity-optimized` 전략은 현재 AWS에서 여유 용량이 가장 많은 Spot 풀을 선택해 인터럽션 빈도를 최소화한다(비용이 최저는 아니지만 가용성 우선). `lowest-price`는 가장 싼 풀로 몰려 인터럽션 위험이 높다. Capacity Rebalancing은 인터럽션 경고 수신 시 미리 대체 Spot을 시작해 연속성을 유지한다.

---

**문제 5.** ASG 인스턴스가 종료될 때 메모리 내 처리 중인 주문 데이터를 SQS에 다시 넣어 손실을 방지하고 싶다. 어떻게 구현하는가?

A) User Data에 종료 스크립트 작성
B) ASG Termination Policy를 OldestInstance로 설정
C) ASG Lifecycle Hook (Terminating:Wait) + EventBridge + Lambda
D) CloudWatch Events로 인스턴스 종료 감지 후 Lambda 호출

**정답: C**
해설: Lifecycle Hook의 `EC2_INSTANCE_TERMINATING` 이벤트는 인스턴스가 종료되기 전 `Terminating:Wait` 상태로 멈춰준다. 이 이벤트를 EventBridge로 받아 Lambda를 트리거하거나, SQS 큐로 알림을 보내 인스턴스 내 Agent가 처리한다. 인스턴스 내 Agent는 처리 중 주문을 SQS에 넣고 `complete-lifecycle-action SUCCESS`를 호출한다. 그러면 인스턴스가 종료된다. User Data의 종료 스크립트는 OS 종료 시 실행되지만 ASG 스케일인보다 늦게 실행될 수 있고 시간 제한이 있다.

---

**문제 6.** 스케일아웃 시 새 인스턴스가 완전히 Ready 상태가 되기까지 7분이 걸린다. 트래픽 폭증 시 이 7분간의 공백을 줄이기 위한 가장 효과적인 AWS 기능은?

A) Health Check Grace Period를 0으로 줄인다
B) 더 빠른 인스턴스 타입으로 업그레이드한다
C) ASG Warm Pool을 설정해 미리 초기화된 인스턴스를 대기시킨다
D) ALB Slow Start를 비활성화한다

**정답: C**
해설: Warm Pool은 완전히 초기화된 인스턴스를 Stopped(또는 Running) 상태로 미리 대기시킨다. 스케일아웃 신호 시 Start만 하면 되므로 7분이 30-60초로 단축된다. Health Check Grace Period를 0으로 줄이면 초기화 중인 인스턴스에 바로 트래픽이 가서 오히려 오류가 발생한다. 인스턴스 업그레이드는 일부 도움이 되지만 7분의 근본 원인(애플리케이션 초기화)을 해결하지 못한다.