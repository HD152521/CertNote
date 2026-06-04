# Day 37 - CodeDeploy: 배포라는 가장 위험한 순간을 안전하게

운영 중인 서비스에서 가장 위험한 순간은 언제일까. 트래픽 폭증? DB 장애? 통계상 그렇지 않다. Google의 SRE 책과 Microsoft Azure DevOps 회고에 일관되게 등장하는 답은 **"배포 직후"**다. 새 버전이 production에 들어간 후 몇 분~몇 시간 사이가 장애의 70% 이상을 차지한다. 이유는 단순하다 — 배포가 끝났다는 사실 자체가 "지금까지 안 보이던 변경이 한꺼번에 사용자에게 노출됐다"는 뜻이기 때문이다.

CodeDeploy는 그 위험한 순간을 안전하게 만드는 도구다. "한 번에 다 바꾸지 말고 조금씩, 검증하면서, 문제 발생 시 즉시 되돌릴 수 있도록" 배포를 진행한다. DVA-C02 시험에서 CodeDeploy는 거의 모든 회차에 3-5문항이 나오는 핵심 영역이고, 그 안에서도 **배포 대상별 차이(EC2 vs Lambda vs ECS)**와 **블루/그린 vs Canary vs Linear의 구분**, **appspec.yml의 라이프사이클 훅 순서**가 단골 출제 포인트다.

## CodeDeploy의 설계 사상: 배포를 "오케스트레이션"으로 본다

CodeDeploy가 풀려는 문제는 "파일을 서버에 복사한다"가 아니라 "여러 노드에서 일어나는 상태 전환을 안전하게 조율한다"이다. 이 차이가 중요하다. 단순 파일 복사는 `rsync`나 `scp`로 끝나지만, production 배포는 ① 트래픽을 잠깐 빼고 ② 기존 프로세스를 종료하고 ③ 새 파일을 받고 ④ 의존성을 설치하고 ⑤ 프로세스를 시작하고 ⑥ 헬스 체크를 하고 ⑦ 트래픽을 다시 넣는, 7단계 이상의 순서가 있는 작업이다. 한 단계라도 실패하면 다음 단계로 넘어가면 안 되고, 여러 인스턴스에 걸쳐 일관된 순서로 진행돼야 한다.

> 💡 **관련 이론**: 이런 종류의 "여러 노드에 걸친 단계적 상태 전환"을 분산 시스템 이론에서는 **distributed state machine**이라고 부른다. CodeDeploy는 각 배포를 하나의 state machine으로 모델링한다 — 각 인스턴스는 `Pending → InProgress → Succeeded/Failed`의 상태를 가지고, 라이프사이클 훅이 각 상태 전환의 trigger가 된다. Google의 Borg/Kubernetes의 Deployment 컨트롤러, HashiCorp의 Nomad 모두 같은 패턴이다. CodeDeploy의 차별점은 "각 훅에서 사용자 정의 스크립트 실행"을 1급 시민으로 다룬다는 점이다.

> 🔍 **더 깊이**: CodeDeploy Agent는 EC2 인스턴스에서 1분마다 CodeDeploy 컨트롤 플레인에 polling한다("새 배포가 있나?"). HTTP long-polling이 아닌 짧은 폴링 모델인데, 이는 ① 에이전트 구현 단순성 ② AWS 서버 부하 분산 ③ 일시적 네트워크 단절에서의 회복성 때문이다. 단점은 "배포 시작 명령 후 실제 시작까지 평균 30초 지연"이다. 시험에서 "왜 CodeDeploy가 즉시 시작 안 하는가?"가 나오면 이 polling 모델이 답.

## 배포 대상 3종의 본질적 차이

CodeDeploy는 EC2/온프레미스, Lambda, ECS 세 가지 대상을 지원하는데, 내부 동작이 완전히 다르다. 같은 "CodeDeploy"라는 이름을 쓰지만 사실은 세 가지 별개 서비스에 가깝다.

| 차원 | EC2/온프레미스 | Lambda | ECS |
|------|---------------|--------|-----|
| Agent 필요 | ✅ CodeDeploy Agent | ❌ (Lambda 자체 별칭 사용) | ❌ (ECS 서비스가 처리) |
| 배포 단위 | 파일 + 스크립트 | 함수 버전 + 별칭 가중치 | Task definition revision |
| 배포 전략 | In-Place / Blue-Green | Canary / Linear / AllAtOnce | Blue-Green only |
| 트래픽 전환 메커니즘 | ALB Target Group swap (B/G) 또는 변경 없음 (In-Place) | Lambda alias의 routing-config | ALB Target Group swap |
| appspec 형식 | YAML (files + hooks 섹션) | YAML/JSON (Resources + Hooks 섹션) | JSON (TaskDefinition + LoadBalancerInfo) |
| 롤백 메커니즘 | 이전 revision 재배포 | alias 가중치 복원 | 이전 target group 재연결 |

> ⚠️ **함정**: "ECS에서 In-Place 배포를 사용하려면?"이라는 질문은 함정이다. **ECS는 CodeDeploy로 Blue-Green만 지원**한다. ECS 자체의 rolling update 기능은 CodeDeploy를 안 쓰고 ECS 서비스가 직접 하는 별개 메커니즘이다. 시험에서 "CodeDeploy로 ECS Blue-Green"이 나오면 정답이지만, "CodeDeploy로 ECS In-Place"는 존재하지 않는다.

## EC2 배포의 라이프사이클: 10단계가 정확히 어떻게 흐르는가

EC2 배포의 핵심은 라이프사이클 훅이다. CodeDeploy Agent가 각 단계를 순차적으로 실행하고, 각 단계에서 사용자가 정의한 스크립트가 실패하면 전체 배포가 실패 처리된다.

```
In-Place 배포 (7단계)
====================
1. ApplicationStop        [user script]   기존 앱 정지
2. DownloadBundle         [agent]         S3/GitHub에서 revision 다운로드
3. BeforeInstall          [user script]   설치 전 작업(백업 등)
4. Install                [agent]         appspec.yml의 files 섹션 복사
5. AfterInstall           [user script]   설치 후 작업(권한, 설정)
6. ApplicationStart       [user script]   앱 시작
7. ValidateService        [user script]   헬스 체크

Blue-Green 배포 (추가 단계)
==========================
Blue 인스턴스: 1~7 + BeforeBlockTraffic → BlockTraffic → AfterBlockTraffic
Green 인스턴스: 1~7 + BeforeAllowTraffic → AllowTraffic → AfterAllowTraffic
```

> 🔍 **더 깊이**: `DownloadBundle`과 `Install`은 사용자 정의가 불가능한 agent 내부 단계다. 이걸 모르고 "왜 BeforeInstall에서 파일을 미리 받으려 했는데 안 됐죠?"라는 질문이 자주 나온다. Bundle은 zip/tar로 패키징돼 있고 agent가 `/opt/codedeploy-agent/deployment-root/<deployment-group-id>/<deployment-id>/deployment-archive`에 푼다. BeforeInstall은 그 압축 풀린 디렉토리에는 접근 가능하지만 destination(예: `/var/www/html`)으로 복사되기 직전 상태다.

> 💡 **관련 이론**: 이 라이프사이클 모델은 systemd unit의 ExecStartPre/ExecStart/ExecStartPost 패턴이나 Docker의 entrypoint/healthcheck 패턴과 같은 계보다. Init system 시대(SysV init → systemd)부터 내려온 "서비스의 시작/중지/검증을 명시적 훅으로 분리한다"는 사고방식이 클라우드 배포 도구로 이어진 것이다. Kubernetes의 readiness/liveness probe도 ValidateService와 정확히 같은 역할을 한다.

```yaml
version: 0.0
os: linux

files:
  - source: build/         # 압축 해제된 디렉토리 내 경로
    destination: /var/www/myapp
  - source: nginx.conf
    destination: /etc/nginx/conf.d/myapp.conf

file_exists_behavior: OVERWRITE   # DISALLOW | OVERWRITE | RETAIN
                                  # DISALLOW: 기존 파일 있으면 실패 (안전)
                                  # OVERWRITE: 무조건 덮어쓰기
                                  # RETAIN: 기존 파일 유지, 신규만 복사

permissions:
  - object: /var/www/myapp
    pattern: "**"
    owner: nginx
    group: nginx
    mode: 644
    type:
      - file
  - object: /var/www/myapp/bin
    pattern: "**"
    mode: 755
    type:
      - file

hooks:
  ApplicationStop:
    - location: scripts/stop.sh
      timeout: 60
      runas: root
  BeforeInstall:
    - location: scripts/backup.sh
      timeout: 30
  AfterInstall:
    - location: scripts/configure.sh
      timeout: 120
  ApplicationStart:
    - location: scripts/start.sh
      timeout: 60
  ValidateService:
    - location: scripts/healthcheck.sh
      timeout: 30
```

> ⚠️ **함정**: `ApplicationStop` 훅은 **이전 revision의 스크립트**가 실행된다. 즉 v1 → v2 배포 시 ApplicationStop은 v1에 들어있던 스크립트가 돌아간다. 이걸 모르고 "ApplicationStop에서 새 기능을 추가했는데 안 돌더라"는 경우가 있는데, 이번 배포에서 추가한 스크립트는 **다음 배포 때** ApplicationStop으로 처음 실행된다. 시험에 한 번씩 나오는 미세한 동작.

## 배포 구성: AllAtOnce가 정말 위험한가

CodeDeploy의 "Deployment Configuration"은 한 번에 몇 개 인스턴스에 동시 배포할지 결정한다.

| 구성 | 동시 배포 | "성공" 기준 | 시험 키워드 |
|------|----------|-------------|-------------|
| `CodeDeployDefault.AllAtOnce` | 전체 인스턴스 | 1개 이상 성공 시 deployment success | "가장 빠른 배포" |
| `CodeDeployDefault.HalfAtATime` | 50% | 50% 이상 정상 | "균형" |
| `CodeDeployDefault.OneAtATime` | 1개 | 모든 인스턴스 성공 | "가장 안전한 점진적" |
| Custom: `Min Healthy Hosts = 75%` | 25%만 동시 배포 | 75% 이상 정상 | 큰 fleet의 점진적 |

> 🔍 **더 깊이**: AllAtOnce가 "1개만 성공해도 deployment 자체는 success"라는 정의는 직관과 어긋난다. 이유는 "deployment status"와 "service availability"가 별개라는 CodeDeploy의 철학 때문이다. 배포 자체는 끝났고 그 결과 fleet의 1개 인스턴스라도 새 버전을 받았다면 의도한 작업은 완료된 것 — 다만 그 결과로 서비스가 가용한지는 별개 문제이고 CloudWatch Alarm으로 판단해야 한다는 분리다. 시험에 직접 출제되지는 않지만 운영 시 함정.

> 📚 **사례**: Netflix는 자체 배포 도구 Spinnaker에서 "Rolling Red/Black" 패턴을 쓰는데, 이는 CodeDeploy의 OneAtATime + ValidateService를 매우 엄격하게 검증하는 패턴과 본질이 같다. 한 인스턴스에 새 버전 배포 → 1-5분 트래픽 받게 두고 메트릭 관찰 → 정상이면 다음 인스턴스, 비정상이면 즉시 롤백. CodeDeploy의 OneAtATime + CloudWatch Alarm + Auto Rollback 조합으로 거의 동일한 효과를 만들 수 있다.

## Blue-Green: 두 환경을 통째로 띄우는 사치

In-Place 배포는 같은 인스턴스의 파일을 교체한다. 빠르고 비용이 안 들지만 롤백이 어렵다 — 이전 파일이 이미 사라졌기 때문이다. Blue-Green은 **새 ASG를 통째로 띄워** 새 인스턴스에 v2를 배포하고, ALB Target Group을 새 ASG로 swap한다. 잘못되면 원래 ASG로 swap만 되돌리면 끝.

```
[ALB] ──── Production Listener (port 80)
   │           │
   │           ├── Target Group "blue"  ← ASG-blue (v1, 인스턴스 3개)
   │           │
   │           └── Target Group "green" ← ASG-green (v2, 인스턴스 3개) [신규]
   │
   └── [배포 진행 시 Listener Rule이 green으로 전환]
```

Blue-Green의 trade-off:

| 항목 | 값 |
|------|-----|
| 인프라 비용 | 검증 기간 동안 2배 |
| 롤백 시간 | 수 초 (Target Group swap만) |
| In-Place 대비 배포 시간 | 약간 더 김 (ASG 프로비저닝 + Warmup) |
| Stateful 워크로드 적합성 | 낮음 (인스턴스가 바뀌므로 EBS 데이터 손실) |

> ⚠️ **함정**: Blue-Green 배포 후 "원본(Blue) ASG는 어떻게 되는가?"가 시험에 나온다. 옵션은 두 가지. ① **즉시 종료**(Terminate original instances immediately) ② **지정 시간 후 종료**(Wait N minutes then terminate). 후자는 swap 후에도 잠깐 Blue를 살려두면 빠른 롤백이 가능한 안전망 역할이다. 보통 5분~1시간 사이로 설정한다.

> 💡 **관련 이론**: Blue-Green이라는 용어는 Jez Humble과 David Farley의 2010년 책 *Continuous Delivery*에서 정착됐다. 그 책 이전에도 같은 패턴이 다양한 이름으로 존재했지만(Red-Black, A-B switch), "Blue"와 "Green"이라는 중립적 색깔을 쓴 게 받아들여진 이유는 어느 한쪽이 "옛 것"이 아니라 단순히 라벨일 뿐이라는 의미였다. CodeDeploy를 비롯해 Spinnaker, Argo Rollouts, Flagger 모두 같은 용어를 쓴다.

## Lambda 배포: alias의 routing-config로 트래픽을 자른다

Lambda는 EC2와 완전히 다른 메커니즘이다. 파일을 어디 복사하는 게 아니라 **함수의 새 버전을 publish하고, alias의 routing-config로 트래픽 비율을 조정**한다.

```python
# Lambda alias 트래픽 분할 (Boto3)
import boto3
lambda_client = boto3.client('lambda')

# v1이 90%, v2가 10% 받도록 alias 'live' 설정
lambda_client.update_alias(
    FunctionName='my-function',
    Name='live',
    FunctionVersion='1',                # 기본 버전
    RoutingConfig={
        'AdditionalVersionWeights': {
            '2': 0.1                    # v2가 10%
        }
    }
)
```

CodeDeploy의 Lambda 배포는 이 update_alias 호출을 미리 정의된 schedule로 자동화한다. 시험에 매번 나오는 9가지 사전 정의 구성:

| Configuration | 첫 전환 비율 | 두 번째 전환까지 대기 | 완전 전환 시점 |
|---------------|-------------|---------------------|---------------|
| `LambdaAllAtOnce` | 100% | - | 즉시 |
| `LambdaCanary10Percent5Minutes` | 10% | 5분 | 5분 후 |
| `LambdaCanary10Percent10Minutes` | 10% | 10분 | 10분 후 |
| `LambdaCanary10Percent15Minutes` | 10% | 15분 | 15분 후 |
| `LambdaCanary10Percent30Minutes` | 10% | 30분 | 30분 후 |
| `LambdaLinear10PercentEvery1Minute` | 10% | 1분마다 +10% | 10분 후 |
| `LambdaLinear10PercentEvery2Minutes` | 10% | 2분마다 +10% | 20분 후 |
| `LambdaLinear10PercentEvery3Minutes` | 10% | 3분마다 +10% | 30분 후 |
| `LambdaLinear10PercentEvery10Minutes` | 10% | 10분마다 +10% | 100분 후 |

> 🔍 **더 깊이**: **Canary와 Linear의 차이**는 시험의 핵심이다. Canary는 "10%를 N분 두고 본 다음 한 번에 90%로 가는" 2단계 전환이다. 처음 10%에서 문제 발생을 모니터링한 다음, 큰 결정 한 번으로 전체로 간다. Linear는 "10%, 20%, 30%, ..."로 매 N분마다 균등 증가한다. Canary는 빠르고 한쪽에 모이는 위험이 있는 반면, Linear는 느리고 점진적이다. AB 테스트가 필요한 경우 Linear가, 빠른 검증 후 전체 배포가 필요한 경우 Canary가 적합.

> 💡 **관련 이론**: "Canary"라는 용어는 19-20세기 광부들이 갱도에 카나리아를 데려가 유독 가스 누출을 감지하던 관행에서 왔다. 카나리아는 인간보다 가스에 민감해 먼저 죽고, 그게 광부에게 대피 신호가 됐다. 소프트웨어에서 canary release는 "일부 사용자에게만 새 버전을 보내고 문제 발생을 먼저 감지한다"는 같은 사고방식이다. 2014년 Netflix가 *The Netflix Tech Blog*에서 자세히 문서화하면서 업계 표준 용어가 됐다.

```yaml
# Lambda appspec.yml
version: 0.0
Resources:
  - MyLambdaFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: my-function
        Alias: live
        CurrentVersion: 1
        TargetVersion: 2

Hooks:
  - BeforeAllowTraffic: pre-traffic-validation-fn      # 트래픽 받기 전 검증
  - AfterAllowTraffic: post-traffic-validation-fn      # 전환 완료 후 검증
```

훅에서 호출되는 Lambda 함수는 마지막에 반드시 `PutLifecycleEventHookExecutionStatus` API를 호출해 Succeeded/Failed를 보고해야 한다. 안 하면 timeout(기본 1시간)까지 배포가 멈춰 있는다.

```python
def lambda_handler(event, context):
    # event에 deploymentId와 lifecycleEventHookExecutionId가 들어있음
    deployment_id = event['DeploymentId']
    hook_execution_id = event['LifecycleEventHookExecutionId']

    # 검증 로직 (smoke test, contract test 등)
    success = run_smoke_test()

    codedeploy = boto3.client('codedeploy')
    codedeploy.put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=hook_execution_id,
        status='Succeeded' if success else 'Failed'
    )
```

> ⚠️ **함정**: BeforeAllowTraffic 훅이 실패하면 새 버전 트래픽 0%로 즉시 롤백된다. AfterAllowTraffic 훅이 실패하면 이미 전환이 끝난 상태에서 다시 이전 버전으로 자동 롤백된다 — 즉 두 훅 모두 자동 롤백 trigger가 된다. 시험에 "Lambda 배포 중 검증 실패 시 동작"이 나오면 이 두 훅과 자동 롤백을 같이 본다.

## CloudWatch Alarm 기반 자동 롤백

배포 중 또는 직후에 에러율이 폭증하면 자동으로 롤백하고 싶다. CodeDeploy는 CloudWatch Alarm과 통합돼 있다.

```yaml
# DeploymentGroup 설정 (CloudFormation 발췌)
DeploymentGroup:
  AutoRollbackConfiguration:
    Enabled: true
    Events:
      - DEPLOYMENT_FAILURE        # 배포 자체 실패
      - DEPLOYMENT_STOP_ON_ALARM  # 알람 발생으로 정지
      - DEPLOYMENT_STOP_ON_REQUEST # 사용자 수동 정지
  AlarmConfiguration:
    Enabled: true
    Alarms:
      - Name: lambda-error-rate-high
      - Name: lambda-duration-high
    IgnorePollAlarmFailure: false
```

> 🔍 **더 깊이**: `IgnorePollAlarmFailure`가 `false`이면 CloudWatch에서 알람 상태를 조회 못 할 때 배포가 fail-stop한다. 보안상 보수적이지만 CloudWatch 일시 장애 때 배포가 막힌다. `true`로 두면 알람 조회 실패 시 배포를 그냥 진행 — 가용성 우선. 둘 다 정답이 없고 운영 정책에 따라 다르다.

## ECS Blue-Green: Target Group을 통째로 swap

ECS는 CodeDeploy 사용 시 무조건 Blue-Green이다. 동작 원리는 EC2 Blue-Green과 비슷하지만, 인스턴스가 아니라 **Task definition revision**이 단위다.

```
[ALB Production Listener:80]
       │
       ├── Target Group "blue"  ← ECS Service의 Blue Tasks (revision N)
       │
       └── Target Group "green" ← ECS Service의 Green Tasks (revision N+1) [신규]

[ALB Test Listener:8080]    ← 배포 중 Green을 검증할 수 있는 별도 Listener
       │
       └── Target Group "green"
```

배포 흐름:

1. CodeDeploy가 ECS service에 새 task definition으로 task를 띄움 (Green)
2. Green task가 모두 healthy 상태가 되면 Production listener를 Green으로 전환
3. (선택) 지정 시간 동안 Blue task를 살려둠 (빠른 롤백을 위한 안전망)
4. 시간 경과 후 Blue task 종료

> ⚠️ **함정**: ECS Blue-Green을 쓰려면 ① ALB Target Group이 **2개** 필요 ② Production Listener와 (선택적) Test Listener 구성 ③ ECS service의 `deploymentController.type`을 `CODE_DEPLOY`로 설정 ④ appspec.json 파일이 task definition + load balancer info를 명시. 한 가지라도 빠지면 배포 시작 자체가 실패한다. 시험에서 "ECS Blue-Green 사전 조건"이 나오면 이 4가지가 모두 답.

```json
{
  "version": 0.0,
  "Resources": [
    {
      "TargetService": {
        "Type": "AWS::ECS::Service",
        "Properties": {
          "TaskDefinition": "arn:aws:ecs:...:task-definition/myapp:42",
          "LoadBalancerInfo": {
            "ContainerName": "app",
            "ContainerPort": 80
          },
          "PlatformVersion": "LATEST"
        }
      }
    }
  ],
  "Hooks": [
    { "BeforeInstall": "pre-validation-fn" },
    { "AfterInstall": "post-task-up-fn" },
    { "AfterAllowTestTraffic": "smoke-test-fn" },
    { "BeforeAllowTraffic": "final-check-fn" },
    { "AfterAllowTraffic": "post-deploy-fn" }
  ]
}
```

## 다른 배포 도구와의 비교

| 차원 | CodeDeploy | Spinnaker | Argo Rollouts | Octopus Deploy |
|------|-----------|-----------|---------------|----------------|
| 호스팅 | AWS managed | self-hosted | Kubernetes-native | self-hosted/SaaS |
| 대상 | EC2/Lambda/ECS | 멀티클라우드 + K8s | K8s only | 멀티 + .NET 강함 |
| Canary | Lambda만 native, EC2는 fleet 부분 배포 | 풍부 (자동 분석) | 풍부 (Prometheus 통합) | 제한적 |
| 학습 곡선 | 낮음 | 매우 높음 | 중간 | 낮음 |
| IAM 통합 | 네이티브 | OIDC 가능 | K8s ServiceAccount | 외부 통합 |

> 📚 **사례**: 2017년 GitLab은 데이터베이스 운영자가 production 백업을 잘못된 명령으로 삭제한 사건을 공개적으로 회고했다(*db1.cluster.gitlab.com incident*). 이후 GitLab은 모든 production 변경에 "5명 룰"(5명이 리뷰)을 도입했지만, 더 본질적으로는 배포 도구 자체에 안전 게이트를 추가했다. CodeDeploy의 ValidateService와 BeforeAllowTraffic 훅은 이 종류의 안전 게이트를 자동화한다 — 사람이 매번 검증하는 게 아니라 검증 스크립트가 자동으로 통과해야 다음 단계로 간다.

## CodeDeploy Agent 운영 팁

```bash
# Amazon Linux 2 설치
sudo yum install -y ruby wget
wget https://aws-codedeploy-${REGION}.s3.${REGION}.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# Systemd로 관리
sudo systemctl enable codedeploy-agent
sudo systemctl start codedeploy-agent
sudo systemctl status codedeploy-agent

# 로그 위치 (디버깅 필수)
tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log
tail -f /opt/codedeploy-agent/deployment-root/deployment-logs/codedeploy-agent-deployments.log

# 특정 배포의 모든 hook 로그
ls /opt/codedeploy-agent/deployment-root/<deployment-group-id>/<deployment-id>/logs/
```

> 🔍 **더 깊이**: Agent는 Ruby로 짜여 있다. 이유는 2014년 출시 당시 AWS 운영 도구 다수가 Ruby로 작성됐기 때문(OpsWorks의 Chef도 Ruby). 최근에는 Go나 Rust로 재작성 논의가 있었지만 호환성 때문에 유지 중이다. Ruby 의존성이 깔려있어야 동작한다는 점이 가끔 함정이 된다 — 최소 컨테이너 이미지에 Ruby가 없으면 agent 설치 실패.

## 정리하며

CodeDeploy의 본질은 "배포라는 위험한 순간을 여러 작은 단계로 쪼개고, 각 단계마다 검증과 롤백 메커니즘을 박아 놓는 것"이다. EC2에서는 라이프사이클 훅으로, Lambda에서는 alias 가중치로, ECS에서는 task definition swap으로 같은 사상을 다른 방식으로 구현한다.

다음 글에서는 이 모든 단계를 자동으로 흘려보내는 오케스트레이터 — **CodePipeline** — 을 본다. 소스 변경 감지부터 빌드, 테스트, 승인, 배포까지의 전체 흐름을 코드로 관리하는 방법, 그리고 멀티 리전·멀티 계정 파이프라인의 패턴까지 짚는다.

---

## 📝 연습 문제

**문제 1.** EC2에 CodeDeploy를 사용하기 위한 필수 전제 조건을 모두 고르면?

A) EC2에 CodeDeploy Agent 설치
B) EC2 인스턴스 프로파일에 S3 다운로드 권한 부여
C) ALB Target Group 2개 사전 생성
D) CodeDeploy 서비스 역할 생성

**정답: A, B, D**

해설: A) Agent는 EC2 배포의 전제. 없으면 polling 자체가 안 일어남. B) Bundle을 S3에서 다운로드하므로 인스턴스에 S3 read 권한 필요(IAM instance profile + `s3:GetObject`). D) CodeDeploy 서비스 역할은 CodeDeploy가 사용자 계정의 EC2/ASG/ALB를 조작하기 위해 필수. C) 2개 Target Group은 **Blue-Green**일 때만 필요하고 **In-Place**에는 1개만 있어도 됨. 시험에서 "EC2 배포 필수 조건"이면 보통 A+D, "Blue-Green 추가 조건"이면 C.

---

**문제 2.** Lambda 함수를 새 버전으로 전환하면서 **처음 10분간 10%만 트래픽을 보낸 후 한 번에 나머지를 전환**하려 한다. 적합한 배포 구성은?

A) `LambdaLinear10PercentEvery1Minute`
B) `LambdaCanary10Percent10Minutes`
C) `LambdaCanary10Percent5Minutes`
D) `LambdaAllAtOnce`

**정답: B**

해설: Canary 패턴이 "처음 N%를 M분 두고 본 후 한 번에 100%로 가는" 2단계 전환이다. 문제 조건은 "10%를 10분"이므로 `LambdaCanary10Percent10Minutes`. A) Linear는 1분마다 +10%로 균등 증가해 10분 후 100%가 되지만 "한 번에 나머지 전환"이 아니라 점진적 증가. C) 5분만 두므로 시간 조건 불일치. D) AllAtOnce는 즉시 100%로 점진 전환 없음. Canary vs Linear의 구분이 시험의 핵심.

---

**문제 3.** appspec.yml의 라이프사이클 훅 중 **새 버전이 실패해도 항상 실행되는 것**은? (EC2 In-Place 기준)

A) ApplicationStop
B) AfterInstall
C) ValidateService
D) ApplicationStart

**정답: A**

해설: ApplicationStop은 **이전 revision의 스크립트**가 실행된다는 점이 핵심이다. 새 revision의 어떤 단계가 실패해도 ApplicationStop은 그 전에 이미 실행된 상태(가장 첫 단계). 또한 ApplicationStop이 실패하면 그 인스턴스의 배포는 실패로 마킹되지만 다른 단계가 영향받지는 않는다. B/C/D는 모두 후속 단계로, 앞 단계 실패 시 skip된다. 시험에서 "ApplicationStop의 특수성"이 나오면 "이전 revision 스크립트 실행"이 답.

---

**문제 4.** ECS 서비스에 CodeDeploy로 Blue-Green 배포를 구성하려 한다. 필수 사전 조건이 아닌 것은?

A) ALB Target Group 2개
B) ECS service의 deploymentController.type을 CODE_DEPLOY로 설정
C) ECS 컨테이너에 CodeDeploy Agent 설치
D) appspec.json에 TaskDefinition과 LoadBalancerInfo 명시

**정답: C**

해설: ECS는 **CodeDeploy Agent가 필요 없다**. ECS service가 task definition 변경과 target group 전환을 처리하고, CodeDeploy는 그 오케스트레이션을 담당한다. Agent는 EC2/온프레미스 배포에서만 필요. A) Blue-Green은 정의상 두 환경(target group)이 필요. B) Deployment controller를 CODE_DEPLOY로 바꿔야 CodeDeploy가 ECS service를 조작 가능 (기본은 ECS rolling). D) appspec.json이 CodeDeploy가 ECS와 ALB를 연결하는 정보를 담음. "ECS에 Agent 설치"는 항상 오답.

---

**문제 5.** EC2 fleet 100대에 In-Place 배포를 진행 중 CloudWatch Alarm `ErrorRate > 5%`가 발생했다. 자동 롤백이 동작하려면 어떤 설정이 필요한가?

A) DeploymentGroup의 AutoRollbackConfiguration.Events에 DEPLOYMENT_STOP_ON_ALARM 포함
B) Lambda 함수를 만들어 알람 시 수동 정지
C) ASG의 termination policy 변경
D) S3 bucket policy에 알람 권한 추가

**정답: A**

해설: CodeDeploy는 AlarmConfiguration에 등록된 CloudWatch Alarm이 ALARM 상태가 되면 배포를 정지하고, AutoRollbackConfiguration.Events에 `DEPLOYMENT_STOP_ON_ALARM`이 있으면 자동으로 이전 revision으로 롤백한다. 두 설정이 모두 활성화돼야 진짜 자동 롤백이 된다. B) 수동 Lambda는 자동이 아님. C) ASG termination policy는 인스턴스 종료 우선순위로 본 문제와 무관. D) S3 권한은 무관. 시험에서 "배포 중 알람 → 자동 롤백"이 보이면 이 두 설정 조합이 정답.

---

**문제 6.** CodeDeploy의 Blue-Green 배포 후 원본 ASG를 **5분 후에 종료**하도록 설정했다. 그 5분 동안의 의미는?

A) 새 ASG가 워밍업하는 시간
B) 빠른 롤백을 위한 안전망 (원본 ASG가 살아 있어 swap만 되돌리면 즉시 복귀 가능)
C) DNS TTL이 만료되기를 기다리는 시간
D) 인스턴스 비용 최적화를 위한 cooldown

**정답: B**

해설: Blue-Green 배포에서 swap 완료 후에도 원본 ASG를 일정 시간 유지하는 옵션은 **빠른 롤백 안전망** 역할이다. 5분 안에 문제 발견 시 ALB listener rule을 다시 원본 target group으로 돌리기만 하면 인스턴스 재프로비저닝 없이 즉시 복귀 가능. 5분이 지나면 원본 인스턴스가 종료돼 그때부터는 롤백하려면 인스턴스 새로 띄워야 한다. A) 워밍업은 swap 전. C) DNS TTL은 ALB가 자체 처리. D) Cooldown은 ASG의 스케일링 정책 용어로 무관. 시험에서 "Blue-Green 종료 대기 시간"의 의미가 답.

---

**문제 7.** 다음 중 CodeDeploy의 배포 대상이 **아닌** 것은?

A) Amazon EC2 Auto Scaling Group
B) AWS Lambda 함수
C) Amazon ECS 서비스
D) Amazon RDS DB 인스턴스

**정답: D**

해설: CodeDeploy의 공식 배포 대상은 EC2/온프레미스(ASG 포함), Lambda, ECS 세 가지뿐이다. RDS는 데이터베이스 서비스로 배포 개념이 다르고, 스키마 마이그레이션은 Flyway/Liquibase 같은 별도 도구나 RDS 자체의 blue/green deployment(2022년 추가, CodeDeploy와 무관) 기능을 쓴다. A는 EC2의 한 형태. B/C는 명시적 지원. 시험에서 "CodeDeploy 대상이 아닌 것"이 나오면 거의 항상 RDS/DynamoDB/S3 같은 데이터 서비스가 오답으로 등장.
