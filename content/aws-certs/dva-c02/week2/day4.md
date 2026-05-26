# Day 9 - 트래픽을 분산하는 layer: ALB·NLB·GWLB, 그리고 Auto Scaling Group

처음 ALB를 만들고 EC2를 두 대 붙여보면 신기하다. 같은 URL로 요청을 보내는데 절반은 A 서버, 절반은 B 서버에 도착한다. CPU가 튀면 ASG가 알아서 인스턴스를 늘리고, 하나가 죽으면 새로 띄운다. 이 마법 뒤에는 health check 알고리즘, target group의 internal state machine, ASG의 reconciliation loop가 정밀하게 동작하고 있다.

오늘은 ALB와 NLB가 정확히 어느 OSI layer에서 어떤 routing 결정을 하는지, ASG가 새 인스턴스를 어떻게 "InService"로 만드는지, Blue/Green 배포가 ALB target group weighted routing으로 어떻게 구현되는지를 본다. 같은 "로드 밸런서"라는 단어 안에 latency·throughput·sticky·SSL termination·cross-zone billing이 모두 다른 trade-off로 들어 있고, 그 차이가 시험에서 정답을 가른다.

## ALB는 L7이고 NLB는 L4 — 그 의미를 끝까지 보기

가장 흔한 답이 "ALB는 7계층, NLB는 4계층"인데 그 차이가 실무·시험에서 정확히 어떻게 갈리는지를 보자.

**ALB(Application Load Balancer)** 는 HTTP/HTTPS의 의미를 안다. URL path, host header, query string, HTTP header, cookie를 읽어 routing 결정을 할 수 있다. SSL termination을 ALB에서 하면 backend는 plain HTTP로 받는다. WebSocket upgrade도 지원. ALB는 X-Forwarded-For, X-Forwarded-Proto 헤더를 추가해 backend에 client 정보를 전달한다.

**NLB(Network Load Balancer)** 는 TCP/UDP/TLS 패킷을 본다. HTTP 의미를 모르므로 path나 header 기반 routing이 안 된다. 대신 **client의 source IP가 그대로 backend에 전달**(connection passthrough)되므로, backend가 client IP를 직접 본다(ALB는 X-Forwarded-For 헤더를 봐야 함). TLS termination도 가능하지만 더 흔한 패턴은 TLS passthrough(backend가 자체 인증서). 초당 수백만 connection, microsecond-level latency.

**GWLB(Gateway Load Balancer)**, 2020년 출시. **L3 GENEVE 프로토콜** 기반으로 보안 어플라이언스(방화벽, IDS, DPI)를 투명하게 traffic path에 삽입한다. VPC traffic을 third-party Palo Alto/Fortinet 어플라이언스로 inspection한 뒤 원래 경로로 돌려보낸다. 시험에 가끔 출제되는데 키워드는 "투명한 보안 어플라이언스 inserting".

| 차원 | ALB | NLB | GWLB |
|------|-----|-----|------|
| OSI layer | L7 | L4 | L3 (GENEVE) |
| 프로토콜 | HTTP, HTTPS, gRPC, WebSocket | TCP, UDP, TLS | IP (모든 프로토콜) |
| Latency | ~수 ms | < 1 ms | 어플라이언스 의존 |
| 동시 연결 | 매우 높음 | 초당 수백만 | 어플라이언스 의존 |
| 고정 IP | ❌ (DNS만) | ✅ AZ당 1개 EIP | ❌ |
| Target type | EC2, IP, Lambda, ALB | EC2, IP, ALB | EC2 (보안 어플라이언스) |
| Routing 결정 | URL/Host/Header/Cookie | port + flow 해시 | 6-tuple flow hash |
| SSL termination | ✅ ACM 통합 | ✅ ACM 통합 | ❌ (passthrough) |
| Sticky session | Duration/Application cookie | Source IP affinity | 항상 같은 어플라이언스 |
| Client IP preservation | X-Forwarded-For 헤더 | 자동 (TCP passthrough) | 자동 |
| 비용 모델 | 시간당 + LCU | 시간당 + NLCU | 시간당 + GLCU |
| Cross-zone | 기본 ON, 무료 | 기본 OFF, 활성화 시 data transfer 과금 | 기본 OFF |

> 🔍 **더 깊이**: ALB의 LCU(Load Balancer Capacity Unit) 과금은 4가지 차원 중 가장 큰 값으로 청구된다. ① 새 연결 25개/초, ② 활성 연결 3000개, ③ 1 GB 처리 데이터, ④ 1000 rule evaluations/초. 그래서 단순 트래픽 양만 보지 말고 connection churn(짧은 connection이 많은지)을 같이 봐야 비용 예측이 정확하다. NLB의 NLCU는 ① 새 flow 800개/초, ② 활성 flow 100K, ③ 1 GB 처리 데이터의 max로 청구되고, ALB보다 connection 한도가 훨씬 크다.

> 💡 **관련 이론**: ALB가 backend로 보낼 때 client IP를 X-Forwarded-For 헤더로 전달하는 것은 RFC 7239(Forwarded HTTP Extension)의 비표준 선구자다. RFC 7239는 `Forwarded: for=192.0.2.43; proto=https`라는 표준 헤더를 정의했지만 실무에선 여전히 X-Forwarded-For가 우세하다. NLB의 client IP preservation은 TCP three-way handshake의 source IP가 그대로 backend로 전달되는 메커니즘이다. NLB는 자기를 IP layer에서 거의 투명하게 만든다.

## ALB의 routing rule: rule evaluation의 내부

ALB의 listener는 rule list를 priority 순으로 평가한다. 한 rule이 matching되면 그 action이 적용되고 나머지는 평가하지 않는다(short-circuit). 최대 100개 rule 가능(soft limit 1000까지 증액).

```python
import boto3
elbv2 = boto3.client('elbv2', region_name='ap-northeast-2')

# Rule 1: path /api/* → api-tg
elbv2.create_rule(
    ListenerArn='arn:aws:elasticloadbalancing:...:listener/app/.../443/abc',
    Priority=10,
    Conditions=[{
        'Field': 'path-pattern',
        'PathPatternConfig': {'Values': ['/api/*']}
    }],
    Actions=[{
        'Type': 'forward',
        'TargetGroupArn': 'arn:aws:...:targetgroup/api-tg/...'
    }]
)

# Rule 2: host admin.* → admin-tg
elbv2.create_rule(
    Priority=20,
    Conditions=[{
        'Field': 'host-header',
        'HostHeaderConfig': {'Values': ['admin.example.com']}
    }],
    Actions=[{'Type': 'forward', 'TargetGroupArn': 'arn:...:targetgroup/admin-tg/...'}]
)

# Rule 3: Blue/Green canary — 90% Blue, 10% Green
elbv2.create_rule(
    Priority=30,
    Conditions=[{'Field': 'path-pattern', 'PathPatternConfig': {'Values': ['/*']}}],
    Actions=[{
        'Type': 'forward',
        'ForwardConfig': {
            'TargetGroups': [
                {'TargetGroupArn': 'arn:...:blue-tg', 'Weight': 90},
                {'TargetGroupArn': 'arn:...:green-tg', 'Weight': 10}
            ]
        }
    }]
)
```

이 weighted forward가 ALB-native Canary/Blue-Green 배포의 핵심이다. CodeDeploy도 내부적으로 이 weighted target group을 시간에 따라 조정하는 방식으로 동작한다. 시험에 "ALB로 Blue/Green 배포"라는 시나리오가 나오면 답은 "두 target group + weighted forward".

> 🔍 **더 깊이**: ALB가 지원하는 condition 종류는 host-header, path-pattern, http-request-method, source-ip, http-header, query-string의 6가지. 그 중 http-header 조건은 client가 보낸 임의의 HTTP header(예: `X-Tenant-Id`)로 routing 가능해서 multi-tenant SaaS의 tenant 분기에 자주 쓰인다. 또 source-ip 조건은 ALB의 LCU 계산에 영향을 주는 무거운 condition이라 너무 많이 쓰면 비용이 튄다.

> ⚠️ **함정**: ALB의 path-pattern은 글로브 패턴이지 regex가 아니다. `/api/*`는 매치되지만 `/api/v[1-2]/*` 같은 regex는 안 된다. 또 case-sensitive다(`/API/*`는 매치 안 됨). 시험에 "ALB rule로 정규식 매칭"이라는 보기가 나오면 오답.

## Target Group과 health check: stateful한 상태 머신

Target group은 단순한 backend 목록이 아니라 각 target에 대한 health state machine을 가진다.

```
[Target lifecycle]

  initial ──▶  registering ──▶  initial(health check 시작)
                                       │
                                       ▼
                               (interval마다 헬스체크)
                                       │
                                       ├──▶ healthy threshold 통과 ──▶  healthy
                                       └──▶ unhealthy threshold 도달 ──▶ unhealthy
                                                                          │
                                                                          ▼
                                                              deregistering(draining)
                                                                          │
                                                                          ▼
                                                                       unused
```

| 파라미터 | 기본값 | 의미 |
|---------|--------|------|
| `HealthCheckProtocol` | HTTP | HTTP/HTTPS/TCP |
| `HealthCheckPath` | `/` | HTTP일 때만 |
| `HealthCheckIntervalSeconds` | 30 | 체크 주기 |
| `HealthCheckTimeoutSeconds` | 5 | 응답 대기 |
| `HealthyThresholdCount` | 5 | 연속 성공 → healthy |
| `UnhealthyThresholdCount` | 2 | 연속 실패 → unhealthy |
| `Matcher` | 200 | 성공으로 간주할 HTTP 상태 코드 |
| `DeregistrationDelay` | 300초 | unregister 시 in-flight 요청 완료 대기 |

이 파라미터들의 의미가 시험에 자주 나온다. 예를 들어 `HealthyThresholdCount=5, IntervalSeconds=30`이면 새 인스턴스가 healthy로 인정받는 데 최소 150초가 걸린다. 그래서 ASG의 `HealthCheckGracePeriod`는 이 값보다 커야 한다(보통 300초).

**Deregistration delay (connection draining)**: target이 unhealthy로 판단되거나 ASG가 scale-in할 때, ALB는 즉시 그 target에 새 요청을 안 보내지만 **in-flight 요청이 끝날 때까지** 300초(기본) 동안 기다린다. 0으로 설정하면 502 발생 위험, 너무 길면 scale-in이 지연된다. ASG의 lifecycle hook과 결합하면 정확한 graceful shutdown 가능.

> 🔍 **더 깊이**: Health check의 종류는 두 가지다. ① **ELB-based** (기본): target group 자체의 health check가 직접 결정. ② **ASG-driven**: ASG가 `HealthCheckType=ELB`일 때 ELB의 health 결과를 사용. 후자가 켜져 있으면 ELB가 unhealthy로 판단한 인스턴스를 ASG가 자동으로 종료하고 새 인스턴스를 생성한다. 이게 "self-healing" 동작의 핵심. 켜져 있지 않으면 ELB는 traffic을 안 보내지만 인스턴스 자체는 계속 살아 있어 비용이 낭비된다.

> 💡 **관련 이론**: Health check 알고리즘은 분산 시스템의 failure detector 모델(Chandra & Toueg 1996)과 같은 발상이다. 여러 번 연속 fail해야 unhealthy로 판단하는 것은 false positive(일시적 network glitch)를 줄이고 unhealthy threshold를 명시적으로 정함으로써 detection time과 accuracy를 명시적으로 trade-off한다. φ Accrual Failure Detector(Hayashibara 2004) 같은 더 정교한 알고리즘도 있지만, AWS는 단순한 threshold counter로 표현해 운영자가 직관적으로 다룰 수 있게 했다.

## Auto Scaling Group: reconciliation loop의 내부

ASG는 단순히 "인스턴스 수를 늘리고 줄인다"가 아니라 **desired capacity를 현재 상태와 일치시키는 reconciliation loop**를 돈다. 이 모델은 Kubernetes의 controller pattern과 같은 발상이다.

```
[ASG reconciliation loop, 매 분]

  현재 InService 인스턴스 수 = N
       │
       ▼
  Desired capacity = D
       │
       ├──▶ N < D : 새 인스턴스 생성 (launch template 사용)
       │         │
       │         ▼
       │     Pending → Pending:Wait (lifecycle hook이 있으면)
       │         │
       │         ▼
       │     사용자 작업 (S/W 설치, warming up)
       │         │
       │         ▼
       │     CompleteLifecycleAction
       │         │
       │         ▼
       │     InService (target group에 등록)
       │
       └──▶ N > D : 인스턴스 종료
                 │
                 ▼
             Terminating:Wait (lifecycle hook이 있으면)
                 │
                 ▼
             사용자 작업 (로그 수집, graceful shutdown)
                 │
                 ▼
             Terminated
```

**Lifecycle Hook의 진짜 가치**: 새 인스턴스가 부팅되고 user-data가 끝나도, 애플리케이션이 실제로 traffic을 받을 준비가 안 됐을 수 있다(JVM warm-up, cache pre-fill, model loading). lifecycle hook으로 "Pending:Wait" 상태에 일정 시간(또는 명시적 CompleteLifecycleAction까지) 머물게 한 뒤 InService로 보내면, target group에 등록되는 시점에 이미 fully warmed up 상태.

```python
import boto3
asg = boto3.client('autoscaling', region_name='ap-northeast-2')

# Lifecycle hook 등록
asg.put_lifecycle_hook(
    LifecycleHookName='warmup-hook',
    AutoScalingGroupName='my-asg',
    LifecycleTransition='autoscaling:EC2_INSTANCE_LAUNCHING',
    DefaultResult='ABANDON',  # 시간 초과 시 인스턴스 폐기
    HeartbeatTimeout=600,  # 10분까지 대기
    NotificationTargetARN='arn:aws:sqs:...:warmup-queue',
    RoleARN='arn:aws:iam:...:role/asg-hook-role'
)

# 인스턴스 안에서 warmup 완료 후 호출
asg.complete_lifecycle_action(
    LifecycleHookName='warmup-hook',
    AutoScalingGroupName='my-asg',
    InstanceId='i-0abc',
    LifecycleActionResult='CONTINUE'
)
```

## Scaling Policy의 5가지: 어떤 걸 언제 쓰는가

| 정책 | 결정 메커니즘 | 사용 예시 |
|------|------|------|
| **Target Tracking** | 지표를 목표값으로 자동 조정 (PID-controller-like) | CPU 50% 유지, ALB RequestCountPerTarget 1000 유지 |
| **Step Scaling** | 임계값 구간별 명시적 step | CPU 70-80%면 +1, 80-90%면 +3, 90%+면 +5 |
| **Simple Scaling** | 단일 임계값 + 쿨다운 | 거의 안 씀 (Target Tracking으로 대체) |
| **Scheduled** | 시간 기반 | 매일 9시 desired=10, 18시 desired=2 |
| **Predictive** | ML 기반 사전 예측 | 일주일 단위 패턴 학습 후 prewarming |

**Target Tracking의 내부**: AWS가 운영하는 PID controller 비슷한 알고리즘이 지표를 모니터링하면서 자동으로 desired capacity를 조정한다. 사용자는 "CPU 50%"만 명시하면 끝. 가장 권장되는 정책이고 새 워크로드의 default. 다만 **여러 metric에 대해 Target Tracking이 동시에 켜져 있으면 가장 보수적인(=더 많이 키우는) 결정이 채택**되므로, "CPU 50%"와 "RequestCount 1000"이 동시에 켜져 있으면 둘 다 만족할 때까지 인스턴스를 늘린다.

**Step Scaling이 필요한 경우**: 부하 급증 시 단순 +1로는 안 따라잡을 때. 예를 들어 e-commerce sale 시작 시 RPS가 5초 만에 10배가 되면 Target Tracking이 1대씩 추가하다 못 따라잡는다. Step Scaling으로 "임계값 90% 이상이면 +5"처럼 공격적으로 늘리는 게 필요.

> ⚠️ **함정**: Scaling policy의 **cooldown period**는 다음 scaling action까지 대기 시간이다. Simple Scaling에만 적용되고, Target Tracking/Step Scaling에는 적용 안 된다. 시험에서 "Cooldown이 너무 짧아서 thrashing"이라는 시나리오가 나오면 Simple Scaling을 의심. 또 ASG의 `HealthCheckGracePeriod`는 cooldown과 다른 개념이다. 새 인스턴스가 unhealthy로 표시되더라도 grace period 안에는 종료되지 않는다(boot 중인 인스턴스를 죽이지 않기 위해).

> 🔍 **더 깊이**: Predictive Scaling은 2018년 출시. 일주일 분량의 CloudWatch 지표를 보고 같은 요일·시간대의 패턴을 학습한다. 그래서 매일 9시에 traffic이 spike한다는 패턴이 있으면 8:30에 미리 인스턴스를 띄워 traffic이 도착할 때 이미 warmed up 상태. Target Tracking과 결합 가능(Predictive로 미리 띄우고, 예측 못 한 부분은 Target Tracking이 따라잡음). 단 충분한 학습 데이터(최소 24시간)가 필요하고, traffic 패턴이 random하면 효과가 떨어진다.

## Mixed Instance Policy: Spot + 온디맨드의 혼합

production에서 Spot 90% 절감을 살리려면 ASG의 Mixed Instance Policy가 필요하다. Base capacity는 안정성을 위해 On-Demand, 그 위 capacity는 Spot으로 채운다.

```python
asg.create_auto_scaling_group(
    AutoScalingGroupName='mixed-asg',
    MinSize=4, MaxSize=20, DesiredCapacity=10,
    MixedInstancesPolicy={
        'LaunchTemplate': {
            'LaunchTemplateSpecification': {
                'LaunchTemplateName': 'web-template',
                'Version': '$Latest'
            },
            'Overrides': [
                {'InstanceType': 'c5.large'},
                {'InstanceType': 'c5a.large'},
                {'InstanceType': 'c5n.large'},
                {'InstanceType': 'm5.large'}
            ]
        },
        'InstancesDistribution': {
            'OnDemandBaseCapacity': 2,           # 최소 2개는 항상 On-Demand
            'OnDemandPercentageAboveBaseCapacity': 30,  # 위에서는 30% On-Demand
            'SpotAllocationStrategy': 'capacity-optimized',  # 가장 안정적인 풀
            'SpotInstancePools': 4  # lowest-price 전략일 때만 의미
        }
    },
    VPCZoneIdentifier='subnet-aaa,subnet-bbb,subnet-ccc'
)
```

**SpotAllocationStrategy의 4가지**:
- `lowest-price`: 가장 싼 풀에서 가져옴. 회수 위험 높음
- `capacity-optimized`: 가장 capacity가 많은 풀(=회수 가능성 낮은 풀) 선호. **새 워크로드 기본 권장**
- `capacity-optimized-prioritized`: 우선순위 명시 + capacity 우선
- `price-capacity-optimized`: 2022년 추가. 가격 + capacity 균형. 가장 추천되는 모던 default

> 📚 **사례**: 2020년 Netflix는 자기네 batch workload의 90%를 Spot으로 운영하며 EC2 비용 50% 절감했다고 발표했다. 핵심은 ① capacity-optimized 전략으로 회수 빈도를 1% 미만으로 줄이고, ② lifecycle hook으로 spot interruption notice를 받자마자 graceful checkpoint, ③ 같은 region 안 여러 인스턴스 패밀리(m5, m5a, m5n, c5)를 Override로 등록해 한 패밀리의 capacity가 빠져도 다른 곳으로 채워지게 했다는 점.

## SSL/TLS termination과 SNI

ALB의 HTTPS listener는 SSL/TLS termination을 한다. ACM(AWS Certificate Manager)에서 무료 발급한 인증서를 attach하면 자동 갱신까지 된다. **SNI(Server Name Indication)** 지원으로 한 ALB listener에 여러 도메인의 인증서를 동시 등록 가능 — `api.example.com`과 `app.example.com`이 다른 인증서를 쓰지만 같은 ALB로 처리된다.

| 동작 | ALB | NLB |
|------|-----|-----|
| TLS termination | ✅ (ACM 자동) | ✅ (ACM 자동) |
| TLS passthrough | ❌ | ✅ (TCP listener) |
| SNI 멀티 인증서 | ✅ | ✅ |
| mTLS (client cert) | ✅ 2023년 추가 | ❌ |
| Backend to ALB TLS | ✅ (re-encrypt) | ✅ |

> 🔍 **더 깊이**: ALB의 SSL Policy는 TLS 버전과 cipher suite 조합을 결정한다. `ELBSecurityPolicy-TLS13-1-2-2021-06`은 TLS 1.3 + 1.2를 지원하며 forward secrecy 보장. PCI-DSS·HIPAA 같은 규제 환경에선 명시적으로 TLS 1.2+ 정책 선택해야 한다. ALB는 2023년부터 mTLS(mutual TLS, client certificate validation) 지원. 이전엔 NLB + 자체 TLS termination이 필요했지만 이제 ALB가 직접 client 인증서를 ACM Private CA로 검증.

## Cross-Zone Load Balancing: 비용에 직결되는 함정

ALB는 cross-zone load balancing이 **기본 ON·무료**. NLB는 **기본 OFF·활성화 시 cross-AZ data transfer 비용**(GB당 $0.01).

```
[Cross-zone OFF, NLB 기본]
  AZ-a NLB node ── AZ-a target만
  AZ-b NLB node ── AZ-b target만
  → AZ별 target 수가 다르면 불균등 부하

[Cross-zone ON]
  AZ-a NLB node ── AZ-a, AZ-b, AZ-c target 모두
  → 균등 부하, 단 cross-AZ traffic 발생
```

NLB의 cross-zone OFF 기본값은 latency·비용을 우선하는 선택이지만, AZ별 target 수가 다르면 부하 불균등이 생긴다. ALB는 이미 cross-zone이 무료라 항상 켜져 있다.

## Sticky Session: 언제 켜고 언제 끄는가

stateless application이라면 sticky session은 불필요하다. 그러나 session을 backend memory에 저장하는 legacy app, WebSocket connection이 특정 backend에 묶여야 하는 chat·gaming, 큰 model을 lazy load하는 ML inference 같은 경우 sticky가 필요하다.

| 종류 | LB | 메커니즘 |
|------|----|---------|
| **Duration-based** | ALB | `AWSALB` 쿠키, TTL 설정 (1초~7일) |
| **Application-based** | ALB | 앱이 발급한 임의 쿠키 기반, 앱이 TTL 결정 |
| **Source IP affinity** | NLB | 같은 source IP는 항상 같은 target |

Application-based는 2019년 추가된 기능으로 ALB가 자기 쿠키를 만들지 않고 백엔드가 보낸 쿠키를 그대로 본다. ALB는 그 쿠키를 hash해 target 결정. 그래서 ALB의 행동을 백엔드 코드에서 통제 가능.

> ⚠️ **함정**: NLB의 source IP affinity는 NAT 뒤의 사용자에게 부정확. 한 회사 사무실의 모든 사용자가 같은 NAT IP로 보이면 한 backend에 부하 쏠림. 또 모바일 사용자는 IP가 자주 바뀌므로 affinity가 깨진다. 이런 경우 sticky 자체를 application layer(JWT, session store)로 옮기는 게 정석.

## ALB → Lambda 직접 호출

ALB의 target type으로 Lambda 함수를 등록 가능(2018년 11월 추가). API Gateway 없이 ALB → Lambda로 HTTP API를 노출할 수 있다.

| 차원 | ALB → Lambda | API Gateway → Lambda |
|------|------|------|
| 비용 | ALB LCU + Lambda | API Gateway 호출당 + Lambda |
| Throttling | ALB가 안 함 (Lambda 자체 한도) | API Gateway throttling 가능 |
| API key, usage plan | ❌ | ✅ |
| Cognito 인증 통합 | ALB 직접 통합 | API Gateway authorizer |
| WebSocket | ALB가 직접 안 함 | API Gateway WebSocket |
| OpenAPI/Swagger import | ❌ | ✅ |
| 사용 예 | 단순 HTTP → Lambda, 내부 API | 외부 공개 API |

비용은 ALB가 더 저렴한 게 일반적이지만, 외부 공개 API라면 API Gateway의 throttling/key/swagger가 큰 가치를 준다.

> 💡 **관련 이론**: ALB → Lambda 통합은 ALB가 HTTP 요청을 Lambda invocation event로 변환해 Lambda를 동기 호출하는 구조다. Lambda는 ALB의 target group에 등록되고, ALB는 Lambda의 `RequestResponse` mode로 호출한다. Lambda response가 HTTP response로 변환돼 client에 반환된다. 같은 함수를 API Gateway에서도 호출할 수 있고 두 호출의 event 형식이 다르다는 점이 시험에 자주 나온다.

## CLI 종합

```bash
# ALB 생성 + listener + target group
aws elbv2 create-load-balancer \
  --name web-alb \
  --subnets subnet-aaa subnet-bbb subnet-ccc \
  --security-groups sg-12345 \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4

aws elbv2 create-target-group \
  --name web-tg \
  --protocol HTTP --port 80 \
  --vpc-id vpc-12345 \
  --health-check-protocol HTTP \
  --health-check-path /healthz \
  --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --target-type instance

aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=$ACM_ARN \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Auto Scaling Group with Mixed Instance Policy
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name web-asg \
  --mixed-instances-policy file://mixed-policy.json \
  --min-size 2 --max-size 20 --desired-capacity 4 \
  --vpc-zone-identifier "subnet-aaa,subnet-bbb,subnet-ccc" \
  --target-group-arns $TG_ARN \
  --health-check-type ELB \
  --health-check-grace-period 300

# Target Tracking scaling policy
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name cpu-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ASGAverageCPUUtilization"
    },
    "TargetValue": 50.0,
    "DisableScaleIn": false
  }'

# 또는 ALB request count 기준 (더 정확한 traffic-driven scaling)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name request-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget",
      "ResourceLabel": "app/web-alb/abc/targetgroup/web-tg/xyz"
    },
    "TargetValue": 1000.0
  }'
```

## 정리하며

오늘 본 그림은 세 가지다. 첫째, ALB는 L7 HTTP의미를 알고 URL·host·header·cookie 기반 routing을 한다. NLB는 L4로 TCP/UDP를 microsecond latency로 passthrough하며 고정 IP를 제공한다. GWLB는 보안 어플라이언스를 투명하게 inserting할 때 쓴다. 둘째, ASG는 desired capacity를 향한 reconciliation loop를 돌고, lifecycle hook으로 warmup·graceful shutdown을 정확히 통제한다. Target Tracking이 새 워크로드의 default scaling policy. 셋째, Mixed Instance Policy + capacity-optimized Spot이 production-grade 비용 최적화의 표준 패턴이다.

다음 글에서는 Week 2 전체를 종합 정리하고, EC2 layer의 진짜 통합 시나리오 — 즉 SG·EBS·ELB·ASG가 한 아키텍처 안에서 어떻게 맞물리는지를 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 ALB로 Blue/Green canary 배포를 하려고 한다. 정확한 구성은?

A) 두 ALB를 만들고 DNS로 분기
B) 한 listener rule에 두 target group을 weighted forward로 등록, weight를 시간에 따라 조정
C) NLB로 옮긴다
D) ALB는 canary를 지원하지 않는다

**정답: B**
해설: ALB는 한 rule의 forward action에 여러 target group을 weight로 분배할 수 있다(2019년 11월 추가). Blue target group 100, Green 0으로 시작 → Green을 10, 25, 50, 100으로 점진 증가. CodeDeploy의 ALB integration이 정확히 이 메커니즘을 사용한다. weight 합이 100이 아니라도 됨(상대 비율). A는 DNS TTL 때문에 즉각 전환 불가. C는 NLB가 weighted forward는 가능하지만 ALB만큼 정교한 canary 도구가 부족.

---

**문제 2.** 한 ASG에서 새 인스턴스가 ALB에 등록되긴 하지만 application이 fully ready 되기 전에 traffic을 받아 5xx 에러가 발생한다. 가장 적절한 대응은?

A) ALB의 health check interval을 줄인다
B) ASG에 `EC2_INSTANCE_LAUNCHING` lifecycle hook을 추가하고, 인스턴스가 warmup 완료 시 `CompleteLifecycleAction`을 호출하게 한다
C) ASG의 max size를 늘린다
D) target group의 deregistration delay를 늘린다

**정답: B**
해설: Lifecycle hook은 새 인스턴스를 "Pending:Wait" 상태에 머물게 해 ASG의 InService 전환을 지연시킨다. 인스턴스 안의 warmup 스크립트(JVM warmup, cache preload, model load)가 끝나면 `complete-lifecycle-action --lifecycle-action-result CONTINUE`로 진행. 이때 비로소 ALB target group에 등록되어 traffic을 받음. A는 health check 빈도를 늘리는 것이지 ready 여부를 통제하지 못함. D는 종료 시의 in-flight 처리지 시작 시점 무관. 대안으로 health check path를 `/healthz`에 두고 warmup 완료 시점에만 200을 반환하게 하는 패턴도 자주 쓰임.

---

**문제 3.** NLB에서 cross-zone load balancing을 켰을 때 발생하는 비용은?

A) NLB 시간당 추가 비용
B) Cross-AZ data transfer (GB당 $0.01, 양방향 합치면 $0.02)
C) NLCU 사용량 증가
D) 비용 변동 없음

**정답: B**
해설: NLB는 cross-zone이 기본 OFF이고 켜면 AZ를 넘는 트래픽에 대해 양방향 data transfer 비용이 발생한다. 같은 AZ 안 트래픽은 무료지만, AZ-a NLB node가 AZ-b target에 보내면 outbound + inbound 양방향 $0.01씩이 든다. 그래서 NLB cross-zone은 비용 증가 가능성을 인지하고 켜야 한다. ALB는 cross-zone이 기본 ON에 무료라는 점과 대비. D는 오답.

---

**문제 4.** 한 게임 서버가 UDP 17800 포트로 globally 통신해야 한다. 가장 적절한 LB는?

A) ALB
B) NLB (TCP/UDP 지원, 고정 EIP)
C) CLB
D) GWLB

**정답: B**
해설: ALB는 HTTP/HTTPS·WebSocket 한정으로 UDP를 처리 못 함. CLB는 레거시. GWLB는 보안 어플라이언스용. NLB는 TCP/UDP/TLS를 처리하고 AZ당 고정 EIP를 제공해 게임 클라이언트에 IP를 박아둘 수 있음. 추가로 Global Accelerator + NLB 조합으로 BGP Anycast 기반 글로벌 라우팅까지 가능. 게임/금융/IoT/VoIP 같은 비-HTTP 트래픽은 거의 항상 NLB.

---

**문제 5.** ASG의 scaling policy 중 ML로 미래 트래픽을 예측해 사전에 인스턴스를 띄우는 정책은?

A) Target Tracking
B) Step Scaling
C) Scheduled Scaling
D) Predictive Scaling

**정답: D**
해설: Predictive Scaling은 2018년 추가. CloudWatch 지표의 일주일 분량을 학습해 같은 요일·시간대 패턴을 예측, 트래픽이 올 시점 전에 미리 인스턴스를 spin up. Target Tracking과 결합 가능. 학습에 최소 24시간 데이터가 필요. C의 Scheduled는 사용자가 명시적 시각·수치를 지정하는 것이지 ML 예측이 아님. A의 Target Tracking은 현재 지표를 보고 반응형으로 조정.

---

**문제 6.** ALB → Lambda 통합과 API Gateway → Lambda 통합의 가장 큰 차이는?

A) ALB는 Lambda를 지원하지 않는다
B) ALB는 외부 API에 적합, API Gateway는 내부 API에 적합
C) API Gateway는 throttling, API key, usage plan, OpenAPI import 같은 API 관리 기능을 추가 제공
D) Lambda response 형식이 동일

**정답: C**
해설: ALB → Lambda는 단순 HTTP → Lambda passthrough로 비용은 저렴하지만 API 관리 기능이 없다. API Gateway는 throttling(per-key, per-stage, per-method), API key 발급·검증, Usage Plan, OpenAPI Spec import, request/response transformation, Lambda Proxy vs Lambda Integration 같은 풍부한 API 관리 layer를 제공. 단 비용이 ALB보다 비싸므로 외부 공개 API에는 API Gateway, 내부 API에는 ALB가 일반적. D는 틀림 — event 형식이 다르고 같은 함수를 두 곳에서 호출하려면 event 변환이 필요.

---

**문제 7.** Spot Instance 회수율을 최소화하면서 비용 절감을 극대화하려면 ASG의 어떤 설정이 가장 적절한가?

A) `lowest-price` allocation strategy
B) `capacity-optimized` 또는 `price-capacity-optimized` allocation strategy + 여러 인스턴스 패밀리 Override
C) Spot만 100% 사용
D) On-Demand만 사용

**정답: B**
해설: `capacity-optimized`는 가장 capacity가 많은(=회수 가능성 낮은) Spot pool 선호. 2022년 추가된 `price-capacity-optimized`는 가격 + capacity 균형으로 더 모던. 여러 instance type을 Override에 등록하면 한 풀이 빠져도 다른 풀로 채워져 회수율 더 감소. A의 `lowest-price`는 가장 싼 풀만 보므로 회수율 높음(production 부적합). C는 critical workload에 위험. D는 Spot 비용 절감 포기.

---

**문제 8.** ALB와 NLB 모두 health check가 통과한 인스턴스에만 traffic을 보낸다. 두 LB의 health check 동작 차이는?

A) ALB는 HTTP/HTTPS 응답 코드를 본다(Matcher), NLB는 TCP connection 성공 또는 HTTP/HTTPS 응답을 본다
B) NLB는 health check를 지원하지 않는다
C) ALB는 매 30초마다, NLB는 매 60초마다 체크한다
D) 두 LB의 health check는 동일

**정답: A**
해설: ALB는 HTTP/HTTPS health check가 표준이고 응답 코드(`Matcher`, 기본 200)를 검사. NLB는 TCP/HTTP/HTTPS 셋 다 가능하고, TCP health check는 단순 SYN-ACK 응답만 봄(application layer 무관). 그래서 NLB의 TCP health check는 application이 죽어 있어도 OS만 살아 있으면 통과할 수 있어, 정확한 readiness 판단을 위해 HTTP health check가 더 권장됨. C는 둘 다 기본 30초로 동일. D는 틀림.

---

## 📌 오늘의 요약

1. ALB는 L7(HTTP path/host/header/cookie routing, ACM 통합, Lambda 타겟), NLB는 L4(TCP/UDP/TLS, 고정 EIP, microsecond latency), GWLB는 보안 어플라이언스 inserting.
2. Target Group은 health check 기반 stateful 상태머신. ASG와 `HealthCheckType=ELB`로 결합하면 self-healing.
3. ASG는 desired capacity를 향한 reconciliation loop. Lifecycle hook으로 warmup·graceful shutdown 정확 통제.
4. Target Tracking이 새 워크로드의 default scaling policy. Predictive는 패턴이 명확한 워크로드의 보조.
5. Mixed Instance Policy + `capacity-optimized`/`price-capacity-optimized` allocation이 Spot production-grade 표준.
6. ALB cross-zone은 기본 ON·무료, NLB는 기본 OFF·켜면 cross-AZ data transfer 비용. Sticky는 ALB는 쿠키 기반(Duration/Application), NLB는 Source IP affinity.
