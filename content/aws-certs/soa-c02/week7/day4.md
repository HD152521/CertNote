# Day 4 - OpsWorks의 EOL과 Launch Template, 그리고 Mixed Instances Policy의 진짜 가치

운영 자동화 도구의 역사는 진자 운동이다. 처음엔 모두가 SSH 스크립트를 짰고, Chef·Puppet이 그 자리를 받았으며, Docker가 mutable config 자체를 거부했고, Kubernetes가 다시 declarative config를 가져왔다. AWS도 이 진자 위를 따라 움직였다. OpsWorks for Chef Automate(2017)와 OpsWorks for Puppet Enterprise는 한때 "AWS 위에서 Chef/Puppet을 매니지드로 받는" 유일한 합법 경로였지만, 2024년 5월 26일 **OpsWorks Stacks는 공식 EOL**됐고, AWS는 Systems Manager로의 마이그레이션을 권장한다.

이 글에서는 왜 OpsWorks가 시간이 흐르며 SSM에 자리를 내줬는지, Launch Configuration이 Launch Template으로 대체된 이유와 두 도구의 본질적 차이가 무엇인지, 그리고 Mixed Instances Policy + Spot이라는 비용 절감 패턴이 실제로 어떻게 작동하는지 본다. AWS Proton과 Service Catalog의 위치 차이까지 정리한다. 도구 이름 암기보다 "왜 이 진자가 SSM 쪽으로 움직였는가"라는 트렌드 인식이 목표다.

## OpsWorks가 SSM에 자리를 내준 이유

2013년 OpsWorks가 출시될 때 AWS의 인프라 자동화 도구는 CloudFormation 하나뿐이었다. CloudFormation은 인프라 프로비저닝(VPC·EC2·RDS 생성)에 강했지만 "EC2 안에서 무엇을 설치하고 어떻게 설정할 것인가"에는 약했다. OpsWorks가 그 자리를 채웠다 — Chef recipe로 OS·앱·미들웨어 설정을 코드화하는 매니지드 서비스였다.

문제는 2014년 이후 AWS가 같은 책임 영역에 여러 도구를 출시했다는 점이다. Systems Manager Run Command(2015), State Manager(2017), Patch Manager(2017), Session Manager(2018)가 차례로 나왔고 모두 SSM Agent 위에서 동작했다. SSM은 **언어 불가지론(language-agnostic)** + **AWS 네이티브** + **agent 한 개로 모든 기능**이라는 장점을 가졌다. OpsWorks가 Chef DSL을 강제하고 별도 Chef Server·Puppet Server 노드를 운영해야 했던 반면, SSM은 SSM Agent만 있으면 추가 인프라 없이 동작한다.

| 항목 | OpsWorks Stacks | SSM (Run + State + Patch) |
|------|-----------------|---------------------------|
| **언어** | Chef DSL (Ruby) | Bash/PowerShell/Python |
| **에이전트** | Chef Client | SSM Agent (모든 AL2+ 기본 설치) |
| **추가 인프라** | Chef Server 노드 | 없음 |
| **AWS 통합** | 별도 작업 | native (IAM, CloudWatch Logs, S3) |
| **Stateful 적용** | Chef Solo 주기 실행 | State Manager의 association |
| **온프레미스 지원** | 가능 (별도 라이선스) | Hybrid Activation으로 가능 |
| **현재 상태** | 2024.5.26 EOL | 메인 도구 |

핵심 트렌드는 "도구 통합"이다. 같은 EC2에 Chef 에이전트 + SSM 에이전트 + CloudWatch 에이전트가 함께 도는 운영 환경은 복잡도가 높다. 에이전트가 줄어들고 SSM 하나로 수렴하면 디버깅·보안·업데이트 모두 단순해진다.

> 💡 **관련 이론**: 이 통합 트렌드는 분산 시스템의 "sidecar proliferation" 문제와 정확히 같은 맥락이다. Service Mesh 초기에는 Envoy + Istio + Prometheus + Jaeger + ... 사이드카가 너무 많아 운영 부담이 폭증했다. 그 답이 eBPF 기반 통합 데이터 플레인(Cilium, Pixie)이다. AWS도 같은 답을 SSM Agent로 냈다 — 하나의 에이전트로 명령 실행·상태 관리·패치·세션 접속·인벤토리·취약점 보고를 모두 처리한다.

> 🔍 **더 깊이**: SSM State Manager는 OpsWorks Stacks의 "Chef Solo 주기 실행" 모델과 정확히 같은 일을 한다. SSM Document(JSON/YAML)를 "association"이라는 형태로 EC2 group에 연결하면, SSM이 cron 주기(예: 30분)마다 그 인스턴스에서 document를 실행해 desired state를 유지한다. Document 안에는 `aws:runShellScript`, `aws:applyAnsiblePlaybooks`, `aws:applyChefRecipes` 액션이 모두 있어 **기존 Chef cookbook도 SSM Document 안에서 그대로 실행 가능**하다. OpsWorks → SSM 마이그레이션이 점진적일 수 있는 이유.

## OpsWorks Stacks EOL이 시사하는 것

OpsWorks Stacks의 EOL은 단순한 서비스 종료가 아니라 **mutable infrastructure 패러다임의 후퇴**를 상징한다. Chef/Puppet의 핵심 가치는 "기존 서버를 desired state로 수렴시킨다"는 것이었다. 새 패키지가 필요하면 cookbook을 수정하고 Chef Client가 그 변경을 인스턴스에 적용한다. 인스턴스는 살아 있는 상태로 변화한다.

Immutable infrastructure(Day 3에서 본 Image Builder)는 정반대다. 인스턴스를 절대 수정하지 않고, 변경이 필요하면 새 AMI를 만들어 인스턴스를 통째로 교체한다. Configuration drift 자체가 발생할 여지가 없다.

AWS의 권장 마이그레이션 경로는 이 패러다임 차이를 그대로 반영한다. OpsWorks Stacks 사용자에게 두 가지 path를 제시한다.

1. **Run Command + State Manager + Patch Manager**: mutable infrastructure를 유지하면서 도구만 SSM으로 갈아탐. 기존 Chef cookbook 자산이 많은 팀이 선택.
2. **EC2 Image Builder + Launch Template + ASG Instance Refresh**: immutable infrastructure로 전환. 새 인스턴스 교체로 변경 적용. 장기적으로 권장되는 path.

> 📚 **사례**: Slack은 2014년부터 Chef로 수만 대 EC2를 관리했지만, 2020년경 Spotify가 만든 Backstage(Internal Developer Platform)와 EC2 Image Builder 기반 immutable infrastructure로 전환했다. 사후 보고에 따르면 "configuration drift 사고가 90% 감소"했고, 보안 패치 적용 시간이 평균 7일에서 1일로 단축됐다. 같은 패턴을 Lyft, Pinterest, Airbnb 모두 따라갔다.

## Launch Configuration vs Launch Template: 왜 LC는 죽었는가

Launch Configuration(LC)은 2009년 ASG와 함께 출시됐고, Launch Template(LT)은 2017년 11월에 나왔다. 두 개가 비슷한 일을 하지만 LT가 LC의 거의 모든 단점을 해결했다.

| 항목 | Launch Configuration | Launch Template |
|------|----------------------|-----------------|
| **버전 관리** | ❌ (수정 = 새 LC 생성) | ✅ (v1, v2, v3, ... + $Latest, $Default) |
| **부분 수정** | ❌ | ✅ (필드만 바꿔 새 버전 생성) |
| **ASG 외 사용** | ❌ (ASG only) | ✅ (EC2 Fleet, Spot Fleet, run-instances) |
| **Mixed Instances** | ❌ | ✅ |
| **T2/T3 Unlimited** | ❌ | ✅ |
| **Placement Group 변경** | ❌ | ✅ |
| **Tag specification** | 제한적 | ✅ (인스턴스·볼륨 모두) |
| **IMDS v2 강제** | ❌ | ✅ |
| **신규 EC2 기능 지원** | ❌ (동결) | ✅ |
| **2022년 이후 AWS 권장** | 사용 중단 | 표준 |

LC가 죽은 결정적 이유는 **버전 관리의 부재**다. LC를 수정하려면 새 LC를 만들어 ASG에 연결해야 했는데, 이 과정에서 "이전 버전으로 되돌리기" 같은 기본 동작이 어려웠다. LT는 같은 LT 안에 여러 버전을 보관하고 `$Latest`나 `$Default` 같은 alias로 가리킬 수 있어 롤백이 자연스럽다.

또 하나는 **신규 EC2 기능 지원 중단**이다. AWS는 LC의 새 기능 개발을 사실상 중단했고, 모든 신규 기능(IMDS v2 강제, capacity reservation 우선 사용, hibernation 등)은 LT에만 추가된다. LC를 계속 쓰면 신기능을 못 쓰는 상태가 누적된다.

> ⚠️ **함정**: 2022년 12월 이후 AWS Console에서 새 LC 생성이 불가능해졌고, 2024년부터는 기존 LC도 일부 리전에서 점진 deprecation이 진행 중이다. 시험에서 "기존 LC 기반 ASG를 어떻게 현대화할까"라는 시나리오가 나오면 답은 "LT로 마이그레이션"이다. AWS CLI `create-launch-template` + `update-auto-scaling-group --launch-template`로 전환 가능.

## Mixed Instances Policy: 비용 절감과 가용성의 동시 달성

Mixed Instances Policy는 같은 ASG 안에서 **여러 인스턴스 타입 + On-demand/Spot 혼합**을 허용한다. 핵심 가치는 두 가지다.

**비용 절감**: Spot은 On-demand 대비 최대 90% 할인. 일부 워크로드를 Spot으로 옮기면 월 수천만 원 절감 가능.

**가용성 강화**: 단일 인스턴스 타입에 의존하면 그 타입이 부족할 때 ASG가 scale-out에 실패한다. 여러 타입을 후보로 두면 AWS가 가용한 것으로 채워준다.

```yaml
MixedInstancesPolicy:
  LaunchTemplate:
    LaunchTemplateSpecification:
      LaunchTemplateName: web-lt
      Version: $Latest
    Overrides:
      - InstanceType: m5.large
      - InstanceType: m5a.large
      - InstanceType: m6i.large
      - InstanceType: m6a.large
  InstancesDistribution:
    OnDemandBaseCapacity: 2              # 항상 On-demand 최소 2대 보장
    OnDemandPercentageAboveBaseCapacity: 30   # 그 위로는 30% On-demand, 70% Spot
    SpotAllocationStrategy: capacity-optimized
    SpotInstancePools: 4
```

`SpotAllocationStrategy`가 의외로 중요한 옵션이다.

| Strategy | 동작 | 권장 사용 |
|----------|------|----------|
| **capacity-optimized** | 현재 capacity가 가장 많은 풀에서 launch — 회수 가능성 최소화 | 대부분의 워크로드 |
| **capacity-optimized-prioritized** | 위 + Overrides 순서대로 우선순위 | 특정 타입 선호 시 |
| **price-capacity-optimized** | 가격 + capacity 균형 (2022년 추가) | 비용 최적화 강조 |
| **lowest-price** (legacy) | 가장 싼 풀 N개 — 회수 위험 높음 | 단순 비용 최적 (권장 X) |

`capacity-optimized` 또는 `price-capacity-optimized`가 거의 항상 정답이다. `lowest-price`는 가장 싼 풀에 몰리면 그 풀의 capacity가 빨리 소진되어 Spot 회수율이 폭증한다.

> 📚 **사례**: Pinterest가 2021년 ML 학습 워크로드를 lowest-price → capacity-optimized로 전환한 후 Spot 회수율이 12%에서 1.4%로 줄었다는 보고가 있다. 같은 비용 절감을 유지하면서 학습 작업의 평균 완료 시간이 4시간에서 1.5시간으로 단축됐다. 회수가 줄어드니 재시작 비용이 사라진 효과다. ["Capacity-Optimized Allocation Strategy"](https://aws.amazon.com/blogs/compute/introducing-the-capacity-optimized-allocation-strategy-for-amazon-ec2-spot-instances/) AWS 공식 블로그.

> 🔍 **더 깊이**: Spot 회수 2분 알림은 EC2 메타데이터 서비스(IMDS)에 `/latest/meta-data/spot/instance-action` 경로로도 노출된다. 인스턴스 내부에서 `curl http://169.254.169.254/latest/meta-data/spot/instance-action`를 1초 polling하면 회수 예정을 가장 빨리 감지할 수 있다. EventBridge는 약 10초 지연이 있어 시간이 critical한 경우 IMDS polling이 더 빠르다. 실제로 Netflix는 컨테이너 스케줄러가 IMDS polling으로 회수를 감지해 다른 노드로 Pod를 사전 마이그레이션한다.

## Auto Scaling 알고리즘: 4가지 정책의 내부 동작

Auto Scaling 정책 4종은 표면적으로 비슷해 보이지만 내부 알고리즘이 다르다.

**Target Tracking**은 PID controller(industrial control system의 표준 알고리즘) 기반이다. 목표값과 현재값의 차이(error)를 보고 비례·적분·미분 항을 계산해 capacity를 조정한다. AWS가 두 개의 CloudWatch Alarm(scale-out, scale-in)을 자동 생성한다. 단순하고 직관적이라 90% 케이스에서 정답이다.

**Step Scaling**은 임계값 단계별 capacity 변경량을 정의한다. 예: CPU 60% → +1, CPU 80% → +3, CPU 90% → +10. trafic spike가 급격한 워크로드에서 Target Tracking보다 빠르게 반응한다.

**Simple Scaling**은 Step Scaling의 단순화 버전(임계값 하나). cooldown 동안 다음 스케일링을 막는다. 새 워크로드에는 권장되지 않으며 Target Tracking 또는 Step Scaling이 대체.

**Predictive Scaling**은 ML 모델(2018년 출시, AWS 자체 forecasting 모델)이 과거 14일 메트릭을 학습해 미래 48시간 capacity를 예측한다. 매일 02:00 UTC에 forecast를 재계산한다. 일정한 daily/weekly 패턴이 있는 워크로드(예: 평일 09:00 트래픽 spike)에 강력하다.

```bash
# Target Tracking (가장 흔함)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name cpu-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},
    "TargetValue":50.0,
    "DisableScaleIn":false
  }'

# Predictive Scaling (일정 패턴 워크로드)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name predictive-cpu \
  --policy-type PredictiveScaling \
  --predictive-scaling-configuration '{
    "MetricSpecifications":[{
      "TargetValue":50,
      "PredefinedMetricPairSpecification":{"PredefinedMetricType":"ASGCPUUtilization"}
    }],
    "Mode":"ForecastAndScale",
    "SchedulingBufferTime":300
  }'
```

> 💡 **관련 이론**: Target Tracking의 PID controller는 1890년대부터 industrial control system에서 쓰던 알고리즘이다. 자동차 cruise control, HVAC 온도 조절, 비행기 autopilot 모두 PID 기반이다. AWS는 이를 클라우드 capacity 관리에 그대로 적용했고, 같은 패러다임을 Kubernetes Horizontal Pod Autoscaler가 채택했다. control theory의 안정성 정리(stability theorem)가 cooldown period의 수학적 정당화다 — 너무 짧으면 oscillation, 너무 길면 response delay.

> ⚠️ **함정**: Predictive Scaling은 최소 24시간(권장 14일) 메트릭이 누적돼야 forecast가 의미 있다. 새 ASG에서 즉시 활성화하면 첫 며칠은 Target Tracking과 똑같이 reactive하게 동작한다. 또 `Mode=ForecastOnly`로 두면 예측만 하고 capacity는 안 바꾼다 — 실제 변경 전 예측 품질을 검증하는 단계로 권장된다.

## Warm Pool: 콜드 스타트의 대안

Warm Pool은 2021년 출시된 기능으로, ASG가 stopped 상태의 인스턴스를 미리 만들어두고 scale-out 시 빠르게 booting only로 활성화한다. 콜드 스타트(AMI fetch + cloud-init + 앱 시작)가 3-5분 걸리는 워크로드에서 30-60초로 단축 가능하다.

```bash
aws autoscaling put-warm-pool \
  --auto-scaling-group-name web-asg \
  --min-size 5 \
  --max-group-prepared-capacity 20 \
  --pool-state Stopped \
  --instance-reuse-policy 'ReuseOnScaleIn=true'
```

stopped 상태의 EC2는 compute 시간 청구는 없고 EBS 비용만 발생하므로(GB·월 단위) 비용 효과가 크다. `pool-state`를 `Running`으로 두면 더 빠른 부팅이 가능하지만 compute 시간도 청구된다. 흔한 절충은 `Stopped` + Lifecycle Hook으로 미리 워밍업한 후 stop하는 방식.

`instance-reuse-policy.ReuseOnScaleIn=true`는 흥미로운 옵션이다. ASG가 scale-in할 때 인스턴스를 종료하지 않고 Warm Pool에 반납한다. 다음 scale-out 시 그 인스턴스를 재사용해 더 빠르다. 단 디스크 상태가 그대로 남으므로 application이 idempotent해야 안전하다.

## Lifecycle Hook: 종료 전 graceful shutdown의 표준

ASG Lifecycle Hook은 인스턴스 시작·종료 시점에 외부 시스템이 개입할 시간을 준다. Hook이 활성화되면 인스턴스가 `Pending:Wait` 또는 `Terminating:Wait` 상태로 멈춰 있다가 `complete-lifecycle-action` API 호출 또는 timeout 후 다음 단계로 진행한다.

```bash
aws autoscaling put-lifecycle-hook \
  --auto-scaling-group-name web-asg \
  --lifecycle-hook-name terminate-graceful \
  --lifecycle-transition autoscaling:EC2_INSTANCE_TERMINATING \
  --heartbeat-timeout 300 \
  --default-result CONTINUE \
  --notification-target-arn arn:aws:sns:ap-northeast-2:123:terminate-topic \
  --role-arn arn:aws:iam::123:role/ASGNotificationRole
```

흔한 사용 패턴은 다음 순서다.

1. ASG가 인스턴스 종료 결정
2. Lifecycle Hook이 SNS에 알림 → Lambda 트리거
3. Lambda가 ALB Target Group에서 deregister → 새 요청 차단
4. Lambda가 인스턴스에 SSM Run Command로 graceful shutdown 신호 전송
5. 앱이 진행 중인 요청 완료 + 로그/메트릭 flush + 로컬 캐시 cloud sync
6. Lambda가 `complete-lifecycle-action`을 호출해 종료 진행
7. 또는 heartbeat-timeout(예: 5분)이 지나면 자동 진행

`default-result`가 `CONTINUE`인지 `ABANDON`인지가 운영상 중요하다. `CONTINUE`는 timeout 시 종료 진행, `ABANDON`은 timeout 시 인스턴스를 다시 운영 상태로 되돌린다. graceful shutdown이 timeout 안에 못 끝나는 경우 어느 쪽이 안전한지에 따라 선택.

> 📚 **사례**: Datadog Agent는 ASG Lifecycle Hook을 적극 활용한다. 종료 hook에서 Datadog Agent가 인스턴스 내 누적된 메트릭을 강제 flush한 후 종료 신호를 보낸다. Hook 없이 SIGTERM만 받으면 최근 1분 메트릭이 손실되는 문제가 있었다. AWS Well-Architected Framework의 Operational Excellence Pillar에서 "Graceful instance termination"이 명시되어 있는 이유.

## Proton vs Service Catalog: 두 자가 서비스 도구의 위치

AWS는 사내 자가 서비스(self-service provisioning)를 위해 두 도구를 제공한다.

| 항목 | Service Catalog | AWS Proton |
|------|-----------------|------------|
| **출시** | 2014 | 2020 |
| **주 대상** | IT 사용자 (개발자 포함) | 개발자 전용 |
| **IaC 엔진** | CloudFormation | CloudFormation, Terraform |
| **CI/CD 통합** | 없음 (별도) | 내장 (CodePipeline) |
| **추상화 단위** | Product (단일 stack) | Environment + Service |
| **사용 흐름** | "VPC 만들어주세요" 같은 일반 인프라 요청 | "내 마이크로서비스 컴파일 + 빌드 + 배포 파이프라인 받고 싶다" |
| **롤백** | Stack rollback | 버전 + 자동 rollout 관리 |

Service Catalog는 **인프라 요청** 도구다. "표준 VPC 한 개 만들어주세요"라는 요청을 자가 서비스로 처리한다. Proton은 **풀스택 워크플로** 도구다. 개발자가 Git push만 하면 인프라 + 빌드 + 배포 + 모니터링이 모두 자동 구성된다.

Proton의 추상화 핵심은 **Environment Template**과 **Service Template**의 분리다.

- **Environment Template** (Platform Team이 작성): "표준 VPC + EKS Cluster + Aurora + 모니터링" 같은 공유 인프라. 개발팀별로 한 번 만들고 여러 서비스가 공유.
- **Service Template** (Platform Team이 작성): "Fargate Task + ALB Target Group + CodePipeline" 같은 서비스 단위 인프라. 개발자가 Git repo만 연결하면 인스턴스화.

이 분리가 의미하는 바는 "**개발자는 Service만 인스턴스화, Environment는 안 만진다**"이다. 표준 환경에서 벗어난 별난 인프라를 못 만들게 강제해 standardization을 보장한다.

> 💡 **관련 이론**: Proton의 모델은 Spotify의 Backstage가 만든 "Internal Developer Platform(IDP)" 카테고리의 AWS 네이티브 구현이다. CNCF의 platform working group이 정의한 reference architecture와 거의 동일하다 — Platform Engineer가 golden path를 제공하고, Developer는 그 path 안에서 자가 서비스로 일한다. Humanitec, Backstage, Crossplane이 같은 카테고리의 경쟁 도구.

## 정리하며

오늘 본 그림은 세 가지다. 첫째, OpsWorks Stacks의 EOL은 단순 서비스 종료가 아니라 mutable infrastructure에서 immutable + SSM 통합으로 가는 패러다임 전환의 마지막 신호다. 둘째, Launch Configuration → Launch Template으로의 전환은 버전 관리·Mixed Instances·신규 기능 지원이라는 명확한 가치 차이가 만든 자연스러운 마이그레이션이다. 셋째, Mixed Instances Policy + capacity-optimized Spot은 비용 절감과 가용성 보장을 동시에 달성하는 거의 표준 패턴이 됐다.

다음 글에서는 SOA-C02 시험 시나리오 자체에 집중한다. 이번 주 다룬 Beanstalk·CodeDeploy·Image Builder·Launch Template·ASG가 실제 시험에서 어떤 trade-off 시나리오로 출제되는지 — "어느 도구가 맞는가" "왜 그 도구가 다른 것보다 나은가"를 결정하는 감각을 다시 한 번 다진다.

---

## 📝 연습 문제

**문제 1.** 회사가 OpsWorks Stacks로 수년간 Chef 기반 운영해왔는데 AWS가 2024년 5월 26일 EOL을 공지했다. AWS 권장 마이그레이션 경로는?

A) 계속 OpsWorks 사용
B) AWS Systems Manager로 마이그레이션 (Run Command 일회성 명령, State Manager 지속 상태 관리, Patch Manager 패치, 필요 시 SSM Document 안에서 `aws:applyChefRecipes` 액션으로 기존 cookbook 재사용)
C) Elastic Beanstalk으로 이전
D) ECS로 컨테이너화만

**정답: B**
해설: AWS 공식 마이그레이션 가이드. SSM은 OpsWorks Stacks의 모든 기능(주기적 desired state 적용, 패치, 명령 실행)을 대체하면서 추가 인프라(Chef Server 노드) 없이 SSM Agent 하나로 동작. 함정 — 기존 Chef cookbook 자산을 즉시 버릴 필요는 없음. SSM Document의 `aws:applyChefRecipes` 액션으로 기존 recipe를 그대로 실행하면서 점진적으로 SSM 네이티브로 전환 가능. 장기적으로는 Image Builder 기반 immutable infrastructure가 더 권장됨.

---

**문제 2.** Auto Scaling Group에서 항상 On-demand 2대를 보장하면서 그 위로는 30% On-demand + 70% Spot으로 비용 절감하려 한다. 어떤 설정?

A) Spot Instance만 사용
B) Mixed Instances Policy + InstancesDistribution.OnDemandBaseCapacity=2 + OnDemandPercentageAboveBaseCapacity=30 + SpotAllocationStrategy=capacity-optimized
C) 별도 ASG 2개 운영 (On-demand 전용, Spot 전용)
D) EC2 Fleet만으로 직접 관리

**정답: B**
해설: Mixed Instances Policy의 InstancesDistribution이 정확히 이 trade-off를 위한 설정. OnDemandBaseCapacity로 최소 보장(2대) + OnDemandPercentageAboveBaseCapacity로 그 위 추가 비율(30%). SpotAllocationStrategy는 capacity-optimized 또는 price-capacity-optimized 권장(lowest-price는 회수 위험 높음). 함정 — 별도 ASG 2개는 가능하지만 운영 복잡도가 높고 ALB Target Group 관리가 번거롭다. Mixed Instances가 같은 효과를 단일 ASG로 달성.

---

**문제 3.** 기존 Launch Configuration 기반 ASG가 있다. 새 AMI(Golden AMI)로 인스턴스를 점진 교체하려는데 향후에도 빈번한 AMI 업데이트가 예상된다. 가장 권장되는 접근은?

A) LC를 수정해서 새 AMI 적용
B) 새 LC 생성 후 ASG 교체
C) Launch Template(LT)로 마이그레이션 → LT는 버전 관리 가능 + SSM Parameter 참조 가능 + Mixed Instances 지원 → 이후 Instance Refresh로 점진 교체
D) ASG 자체를 새로 만들어 모든 인스턴스를 처음부터 재생성

**정답: C**
해설: LC는 수정 불가(immutable in name only — 수정하려면 새로 만들어 교체)이고 신규 기능 미지원이며 2022년 12월 이후 콘솔에서 신규 생성도 막혔다. LT는 버전 관리, SSM Parameter 참조(`{{resolve:ssm:...}}`), Mixed Instances, IMDS v2 강제 등 모든 신기능 지원. 빈번한 AMI 업데이트가 예상되면 LT의 버전 관리가 결정적 가치를 제공. 마이그레이션 후 Instance Refresh로 점진 교체 + CheckpointPercentages로 안전한 롤아웃.

---

**문제 4.** Spot 인스턴스가 회수되기 2분 전에 ALB Target Group에서 deregister하고, 진행 중인 요청을 완료한 뒤 로그를 백업하는 graceful shutdown을 자동화하려 한다. 가장 표준적인 패턴은?

A) Cron job이 5초마다 Spot 상태 체크
B) EventBridge Rule(source=aws.ec2, detail-type="EC2 Spot Instance Interruption Warning")을 만들어 Lambda 트리거 → Lambda가 ALB deregister + SSM Run Command로 graceful shutdown 신호 전송. 또는 ASG Lifecycle Hook으로 종료 전 시간 확보.
C) CloudWatch Alarm만
D) IMDS polling만으로 충분

**정답: B**
해설: 표준 패턴은 EventBridge + Lambda 조합 또는 ASG Lifecycle Hook이다. EventBridge는 2분 알림을 약 10초 지연 후 전달하므로 대부분 케이스에서 충분. 시간이 critical하면 인스턴스 내부에서 IMDS `/latest/meta-data/spot/instance-action` polling으로 더 빠르게 감지 가능. ASG와 Mixed Instances를 같이 쓰면 Lifecycle Hook이 더 일관된 처리를 제공. 함정 — Cron job 5초 polling은 IMDS rate limit 위험과 비용 낭비.

---

**문제 5.** 회사가 사내 Platform Engineering 팀을 만들어 개발자가 Git push만으로 인프라 + CI/CD가 자동 프로비저닝되는 IDP를 구축하려 한다. AWS 네이티브 도구 중 가장 적합한 것은?

A) Service Catalog만 — 일반 인프라 프로비저닝에 적합하지만 CI/CD 통합 없음
B) AWS Proton — Environment Template(공유 인프라) + Service Template(서비스 단위, CodePipeline 통합) + CFN/Terraform 지원
C) Elastic Beanstalk — 단일 앱 PaaS, IDP 아님
D) OpsWorks — Chef 매니지드, 현대 IDP 아님

**정답: B**
해설: Proton의 정확한 사용 사례는 Internal Developer Platform(IDP)이다. Platform 팀이 Environment Template과 Service Template을 작성하면 개발자는 Service를 인스턴스화만 하면 끝이다. CodePipeline 통합이 핵심 차별점 — Service Catalog는 인프라 프로비저닝만, CI/CD는 별도 구성 필요. Spotify Backstage의 AWS 네이티브 버전이라고 이해하면 된다. 2020년 출시.

---

**문제 6.** ASG의 scale-out 시 콜드 스타트가 3-5분 걸려 트래픽 spike에 늦게 대응한다. 비용을 크게 늘리지 않으면서 부팅을 30-60초로 단축하려면?

A) On-demand 인스턴스를 항상 많이 띄움 (비용 폭증)
B) ASG Warm Pool 활성화 — 미리 만든 인스턴스를 Stopped 상태로 보관, scale-out 시 boot만 진행. Stopped는 compute 비용 없음(EBS만 청구)
C) Lambda로 변환
D) Predictive Scaling만

**정답: B**
해설: Warm Pool(2021년 출시)이 정확히 이 시나리오를 위한 기능. AMI fetch + cloud-init 단계를 미리 끝낸 인스턴스를 stopped로 보관하므로 부팅이 30-60초로 단축. stopped는 compute 청구 없고 EBS만(GB·월) 청구되어 비용 효율. Predictive Scaling은 일정한 패턴에는 강력하지만 unexpected spike에는 한계. 두 도구를 함께 쓰는 게 이상적 — Predictive로 capacity 예측 + Warm Pool로 부팅 단축.

---

**문제 7.** Auto Scaling 정책 중 일정한 daily/weekly 트래픽 패턴(예: 평일 09:00 spike)이 있는 워크로드에 가장 적합한 것은?

A) Simple Scaling
B) Step Scaling
C) Target Tracking
D) Predictive Scaling

**정답: D**
해설: Predictive Scaling은 ML 모델이 과거 14일 메트릭을 학습해 미래 48시간 capacity를 예측한다. 일정한 패턴이 있는 워크로드에서 reactive scaling보다 먼저 capacity를 늘려둘 수 있어 콜드 스타트 영향 없이 spike에 대응. Target Tracking은 일반적인 워크로드에 권장되지만 reactive하므로 spike 시작 후 따라잡는 데 시간이 걸림. 두 정책을 함께 쓰는 게 표준 — Predictive로 baseline capacity 예측 + Target Tracking으로 예측 외 변동 대응.

---
