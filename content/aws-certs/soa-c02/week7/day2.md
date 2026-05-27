# Day 2 - CodeDeploy, 코드만 배포한다는 결정과 AppSpec hook의 13단계

Beanstalk이 "환경까지 묶어준다"는 PaaS 철학으로 출발했다면, CodeDeploy는 정반대 결정에서 시작한다. **인프라는 네가 알아서 만들어라. 나는 코드만 안전하게 올리겠다.** 2014년 11월 출시된 이 서비스는 Amazon 내부에서 수년간 쓰던 Apollo deployment system(매년 5천만 회 배포)에서 잘라낸 외부 버전이다. EC2가 기존에 있든, 온프레미스든, Lambda든, ECS Task든 — "이미 돌고 있는 컴퓨트 위에 새 코드를 어떻게 안전하게 얹을 것인가"라는 한 가지 문제만 푼다.

이 글에서는 In-place와 Blue-Green이라는 두 배포 모델의 trade-off를 EC2·Lambda·ECS 각각에서 어떻게 해석하는지, AppSpec.yml의 13개 lifecycle hook이 왜 그 순서로 정해졌는지, 그리고 자동 롤백이 어떤 신호를 보고 동작하는지를 본다. 시험을 위한 hook 이름 암기가 아니라 "왜 BeforeInstall과 AfterInstall이 따로 있어야 하는가" 같은 설계 의도를 따라가는 게 목표다.

## CodeDeploy가 "코드만 배포"를 선택한 이유

2014년의 AWS는 이미 Beanstalk(2011), OpsWorks(2013), CloudFormation(2011)을 갖고 있었다. 세 도구 모두 "코드 배포"를 일부 다루지만, 어느 것도 다음 세 가지 시나리오를 깔끔하게 풀지 못했다.

첫째, **온프레미스 서버에 배포**. Beanstalk과 OpsWorks는 AWS 인프라에만 동작했다. 둘째, **기존에 운영 중인 EC2 함대에 점진 배포**. Beanstalk은 환경 단위로 묶어버려서 기존 EC2를 import할 수 없었다. 셋째, **인프라 변경 없이 코드만 빠르게 롤백**. CloudFormation은 전체 스택 업데이트라 5분 이상 걸리고, Beanstalk은 환경 단위 swap이라 무거웠다.

CodeDeploy는 이 세 시나리오를 풀기 위해 의도적으로 "코드 + 배포 로직"만 책임진다. EC2/ASG/ALB는 고객이 미리 만들어둔다는 가정이다. 그래서 CodeDeploy의 핵심 추상화는 **Application(논리적 묶음) + Deployment Group(어디에) + Revision(무엇을)** 셋으로 줄어든다.

> 💡 **관련 이론**: 이 분리는 12-factor app의 "Build, Release, Run" 단계 분리(Factor V)와 정확히 맞물린다. Build는 코드 → S3 zip(Revision), Release는 Revision + 설정 → Deployment, Run은 Deployment Group의 EC2/Lambda/ECS. 같은 Revision을 dev/staging/prod Deployment Group에 순차 배포하는 패턴이 가능한 이유가 이 분리에서 나온다. Heroku의 "release" 개념이나 Kubernetes의 "Deployment + ReplicaSet" 구조도 같은 추상화를 다른 이름으로 부른다.

> 🔍 **더 깊이**: CodeDeploy Agent는 Ruby로 작성된 데몬으로, EC2 인스턴스에서 1분마다 CodeDeploy 컨트롤 플레인을 polling한다. 새 배포가 있으면 S3/GitHub에서 revision을 받아 `/opt/codedeploy-agent/deployment-root/<deployment-group-id>/<deployment-id>/` 아래에 풀고 AppSpec hook을 실행한다. 이 polling 모델은 EC2가 인터넷 접근만 있으면(또는 VPC endpoint로 codedeploy-commands·codedeploy-commands-secure 에 접근 가능하면) 작동하므로, NAT Gateway 없이 private subnet에서도 동작 가능하다. Agent 로그는 `/var/log/aws/codedeploy-agent/codedeploy-agent.log`에 쌓인다 — 운영 디버깅 1차 소스다.

## In-place vs Blue-Green: 같은 단어, 다른 의미

CodeDeploy의 In-place와 Blue-Green은 Beanstalk의 Rolling/Immutable과 비슷해 보이지만 중요한 차이가 있다. **CodeDeploy의 Blue-Green은 새 ASG를 자동으로 복제해서 만든다.** Beanstalk Blue-Green이 "두 개의 별도 환경을 사람이 만들어서 운영"하는 모델이라면, CodeDeploy Blue-Green은 "기존 ASG의 Launch Template을 그대로 복사해 임시 Green ASG를 생성 → 트래픽 전환 → 구 ASG 종료"를 한 번의 배포 안에서 자동화한다.

| 항목 | In-place | Blue-Green (EC2/ASG) |
|------|----------|----------------------|
| **인스턴스 교체** | 없음 (같은 EC2에 새 코드) | 있음 (새 ASG 생성) |
| **배포 시간** | 빠름 (5-10분) | 느림 (15-30분) |
| **롤백 속도** | 재배포 필요 | 즉시 (Target Group 되돌림) |
| **비용** | 추가 없음 | 임시 2배 |
| **AMI 변경 대응** | 불가 | 가능 (새 ASG가 새 AMI 사용) |
| **stateful 워크로드** | 가능 | 데이터 마이그레이션 필요 |

흥미로운 점은 **Blue-Green이 항상 더 안전하지는 않다**는 것이다. 인스턴스에 로컬 디스크 캐시·세션 스토리지·로그 버퍼가 있는 stateful 워크로드는 Blue-Green으로 가면 그 상태가 사라진다. 반면 In-place는 같은 EC2에 새 코드만 얹으므로 디스크 상태가 유지된다. 그래서 운영 현실에서는 stateless 웹앱은 Blue-Green, stateful background worker는 In-place가 흔한 패턴이다.

> 📚 **사례**: Netflix는 자체 배포 도구 Spinnaker(Asgard의 후속)를 만들면서 정확히 이 trade-off를 고민했다. 결국 "Red/Black"이라 부르는 Blue-Green 방식을 표준으로 채택했지만, Cassandra·Memcached 같은 stateful 서비스는 별도 도구(Cassandra rolling restart automation)로 분리했다. 이게 의미하는 바는 — 같은 회사 안에서도 워크로드 특성에 따라 배포 전략을 분리하는 게 정상이라는 점이다. ["Global Continuous Delivery with Spinnaker"](https://netflixtechblog.com/global-continuous-delivery-with-spinnaker-2a6896c23ba7) 글에서 자세히 다룬다.

> ⚠️ **함정**: CodeDeploy Blue-Green의 `terminationWaitTimeInMinutes`를 0으로 두면 트래픽 전환 즉시 구 ASG가 종료된다. 트래픽 전환 후 5분 안에 문제가 발견돼도 구 인스턴스가 이미 사라져 즉시 롤백이 불가능해진다. 운영 권장은 최소 5-15분, 신중하면 60분까지. 단 비용은 그만큼 늘어난다.

## AppSpec hook 13단계가 왜 그 순서인가

EC2/On-Premises 배포의 lifecycle hook 13개는 단순 나열이 아니라 **상태 머신**이다. 각 단계가 끝나야 다음으로 넘어가고, 어느 단계에서 실패하든 그 즉시 배포가 중단되어 롤백 절차로 들어간다.

```
[1] ApplicationStop          ← 현재 버전 중지 (graceful shutdown)
[2] DownloadBundle           ← AWS 자동 (Agent가 S3에서 revision pull)
[3] BeforeInstall            ← 설치 전 (백업, DB 마이그레이션 dry-run 등)
[4] Install                  ← AWS 자동 (파일 복사)
[5] AfterInstall             ← 설치 후 (권한, 심볼릭 링크, 설정 파일 치환)
[6] ApplicationStart         ← 새 버전 시작 (systemctl start app)
[7] ValidateService          ← 새 인스턴스 자체 검증 (포트 listen 등)
─────── Blue-Green only ───────
[8]  BeforeBlockTraffic      ← 구 인스턴스 트래픽 차단 직전
[9]  BlockTraffic            ← AWS 자동 (Target Group deregister)
[10] AfterBlockTraffic       ← 구 인스턴스 트래픽 차단 직후 (drain 확인)
[11] BeforeAllowTraffic      ← 새 인스턴스 트래픽 허용 직전 (warm-up)
[12] AllowTraffic            ← AWS 자동 (Target Group register)
[13] AfterAllowTraffic       ← 새 인스턴스 트래픽 허용 직후 (smoke test)
```

순서가 흥미로운 이유는 **BeforeInstall과 AfterInstall이 분리된 까닭**에 있다. 한 단계로 합칠 수 있었지만 굳이 나눈 건 "파일 복사 전에 해야 하는 일"과 "파일 복사 후에 해야 하는 일"이 본질적으로 다르기 때문이다. BeforeInstall은 보통 `/var/www/html` 같은 기존 디렉터리를 백업하거나, 새 버전이 의존하는 시스템 패키지를 설치한다(`yum install nginx`). AfterInstall은 복사된 파일에 권한을 부여하고(`chown -R nginx:nginx`) 환경별 설정 파일을 치환한다(`sed -i 's/PLACEHOLDER/prod-value/'`).

ValidateService와 AfterAllowTraffic도 비슷한 분리다. **ValidateService는 자기 자신만 체크**한다 — 포트가 열렸는가, 헬스 엔드포인트가 200을 반환하는가. **AfterAllowTraffic은 실제 트래픽이 흐르기 시작한 후 시스템 전체를 체크**한다 — 실제 요청 응답 시간이 정상인가, 의존 서비스로의 호출이 성공하는가. 이 분리가 있어야 "내 노드는 healthy인데 downstream이 죽어 있는" 상황을 잡아낸다.

> 🔍 **더 깊이**: AppSpec hook은 root로 실행되는 게 기본이지만 `runas: ec2-user` 같은 옵션으로 다른 사용자로 변경할 수 있다. 그런데 함정이 있다 — `runas`는 `su -` 같은 환경 변수 초기화를 하지 않고 `setuid`만 한다. 그래서 ec2-user의 PATH나 HOME이 root의 것을 그대로 쓴다. 스크립트에서 `~/.bashrc`에 정의된 환경 변수를 기대하면 동작 안 한다. 안전한 패턴은 스크립트 첫 줄에서 명시적으로 `source /home/ec2-user/.bashrc` 또는 환경 변수를 절대값으로 지정.

## DownloadBundle과 Install이 "AWS 자동"인 이유

13개 hook 중 5개는 사용자가 못 건드린다 — DownloadBundle, Install, BlockTraffic, AllowTraffic, 그리고 hook 외부의 deployment lifecycle 전환 자체다. 왜 이들은 사용자에게 열어주지 않을까?

답은 **idempotency와 atomicity 보장**에 있다. DownloadBundle은 S3에서 zip을 풀어 staging directory에 놓는 동작인데, 사용자가 이 단계에 개입하면 "파일이 정확히 어디에 있는지"라는 invariant가 깨진다. 이후 단계의 모든 스크립트가 staging path를 가정하고 작성되어 있어서 이 가정이 깨지면 전체 배포 모델이 무너진다. Install은 staging → destination 파일 복사인데, 이 단계에서 권한·소유자·심볼릭 링크 처리를 AWS가 표준화해야 다양한 OS·파일 시스템에서 일관 동작한다.

BlockTraffic과 AllowTraffic은 ALB API 호출(`DeregisterTargets`, `RegisterTargets`)인데, 사용자가 이를 직접 하면 ALB와 CodeDeploy의 상태가 어긋날 수 있다. CodeDeploy는 자기가 호출한 API의 결과를 추적해야 다음 단계 진입 여부를 결정한다.

> 💡 **관련 이론**: 이 설계는 Kubernetes의 admission controller / mutating webhook 패턴과 정확히 같다. 사용자 hook은 "관찰 + 부수 효과"만 허용되고, 시스템 상태를 바꾸는 핵심 동작은 컨트롤 플레인이 독점한다. 분산 시스템에서 "control plane state ≠ data plane state" 문제를 줄이는 표준 패턴이다 — Raft/Paxos에서 leader만 commit log에 쓰는 것과 같은 원리.

## Lambda CodeDeploy: Alias 가중치라는 트릭

Lambda 배포는 EC2와 완전히 다른 메커니즘으로 같은 효과를 낸다. EC2가 "여러 서버 중 일부를 점진 교체"라면 Lambda는 "같은 함수의 여러 버전 사이에 트래픽을 가중치 분배"한다. Lambda는 그 자체로 무한 확장되는 단일 논리 엔티티라 EC2 같은 함대 교체 개념이 없다.

```
[기존 호출자] → Lambda Alias "prod"
                    ├─ Version 1 (가중치 90%)
                    └─ Version 2 (가중치 10%)  ← Canary 진행 중
```

이 구조의 핵심은 **호출자가 Alias만 알고 있다**는 점이다. API Gateway나 EventBridge, S3 트리거 등이 모두 ARN에 `:prod`라는 alias suffix만 붙여 호출한다. CodeDeploy는 그 Alias의 두 버전 사이 가중치만 점진적으로 조정한다.

Lambda Deployment Config가 어떻게 가중치를 변경하는지 보면:

| Config | 동작 패턴 | 총 소요 시간 |
|--------|----------|--------------|
| **Canary10Percent5Minutes** | V2 10% → 5분 후 V2 100% | 5분 |
| **Canary10Percent30Minutes** | V2 10% → 30분 후 V2 100% | 30분 |
| **Linear10PercentEvery1Minute** | 1분마다 10%씩 증가 (10/20/30/...) | 10분 |
| **Linear10PercentEvery10Minutes** | 10분마다 10%씩 증가 | 100분 |
| **AllAtOnce** | 즉시 V2 100% | 0분 |

Canary는 "한 번에 일정 비율 → 안정 확인 후 100%"의 두 단계 모델이고, Linear는 "일정 간격으로 점진 증가"의 다단계 모델이다. Linear가 더 안전해 보이지만 **장시간 두 버전이 동시에 도는 동안 데이터 마이그레이션 호환성 문제가 생길 수 있다**. V1과 V2가 서로 다른 스키마로 같은 테이블에 쓰면 양쪽이 모두 깨질 수 있다. 그래서 Linear 사용 시에는 backward-compatible 스키마 변경(추가 only, 삭제 X)이 전제다.

> 📚 **사례**: Lambda Canary가 가장 빛났던 사례는 Coca-Cola Freestyle 음료 디스펜서 백엔드다. 전 세계 5만 대 디스펜서가 Lambda 함수를 호출하는데, 실패 비용이 매출 직결이라 모든 배포에 Canary10Percent10Minutes를 적용했다. 한 번 배포 중 CloudWatch에서 4xx 에러율 spike가 감지돼 자동 롤백된 사건 후, 운영팀은 "수동 검증 시간이 0이 됐다"고 보고했다. AWS re:Invent 2018 SVS343 세션 사례.

> ⚠️ **함정**: Lambda 가중치는 호출 단위로 결정된다 — "사용자 A는 항상 V2"가 아니라 "이번 호출은 90% 확률로 V1, 10% 확률로 V2"다. 같은 사용자가 V1 → V2 → V1 사이를 오갈 수 있어 세션 상태나 캐시 일관성을 가정하면 깨진다. 사용자별 sticky routing이 필요하면 API Gateway에서 사용자 ID 기반으로 별도 alias를 라우팅해야 한다.

## ECS Blue-Green: Target Group 두 개와 Test Listener

ECS Blue-Green은 ALB의 **두 Target Group + 두 Listener** 구조를 활용한다. 트래픽 전환이 ALB 리스너 규칙 변경 한 번으로 끝나므로 DNS TTL 같은 외부 지연이 없다.

```
ALB
 ├─ Production Listener (port 80)
 │   └─ Forward to → TargetGroup-Blue (현재 운영)
 └─ Test Listener (port 8080)
     └─ Forward to → TargetGroup-Green (검증 중)

배포 진행:
  ① 새 ECS Task Set을 TargetGroup-Green에 등록
  ② AfterAllowTestTraffic hook: 8080 포트로 테스트 트래픽 검증
  ③ BeforeAllowTraffic hook: production listener 전환 직전 최종 검증
  ④ Production Listener를 TargetGroup-Green으로 전환 (트래픽 100% 즉시 전환)
  ⑤ AfterAllowTraffic hook: 운영 트래픽으로 검증
  ⑥ 일정 시간 후 TargetGroup-Blue의 Task Set 종료
```

ECS Blue-Green의 강력함은 **AfterAllowTestTraffic 단계**에 있다. Production 트래픽이 가기 전에 별도 포트로 합성 트래픽(synthetic test traffic)을 보낼 수 있다. 운영팀이 미리 만들어둔 smoke test suite를 이 단계에서 자동 실행하면 "사용자에게 노출되기 전에 회귀 발견" 가능하다. EC2 Blue-Green에도 BeforeAllowTraffic이 있지만, ECS는 별도 listener까지 분리해 더 명확하게 test traffic을 격리한다.

> 💡 **관련 이론**: 이 패턴은 Martin Fowler가 정의한 "QA in Production" 또는 Charity Majors가 강조하는 "Test in Production" 패턴의 구현이다. 핵심 아이디어는 "스테이징 환경은 운영을 충분히 재현하지 못한다"이고, 따라서 운영 환경에 안전하게 배포한 다음 점진적으로 노출해야 한다. ECS Blue-Green의 Test Listener는 이 철학의 인프라 레벨 구현이다.

## 자동 롤백: 두 가지 트리거의 미묘한 차이

CodeDeploy 자동 롤백은 두 가지 이벤트를 감시한다.

**DEPLOYMENT_FAILURE**는 hook 실패·타임아웃·인스턴스 헬스 체크 실패 시 발생한다. CodeDeploy가 자기 control plane에서 판단하는 신호다.

**DEPLOYMENT_STOP_ON_ALARM**은 배포 중 CloudWatch Alarm이 ALARM 상태로 전환되면 발생한다. 외부 신호다.

두 트리거의 차이는 **시간 해상도**에서 나온다. DEPLOYMENT_FAILURE는 hook 실패 즉시(수 초) 감지되지만, CloudWatch Alarm은 메트릭 평가 주기(보통 1분)와 평가 기간(예: 3 datapoints) 때문에 최소 3분 지연이 있다. 그래서 "Alarm 기반 자동 롤백"은 안전망이지 1차 방어선이 아니다.

운영 권장 패턴은 다음과 같다.

```bash
# AlarmConfiguration: 배포 중 모니터링할 알람들
aws deploy update-deployment-group \
  --application-name MyWebApp \
  --current-deployment-group-name prod \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM \
  --alarm-configuration enabled=true,ignorePollAlarmFailure=false,alarms='[
    {"name":"HighErrorRate-5xx"},
    {"name":"HighLatency-p99"},
    {"name":"DependencyFailure"}
  ]'
```

`ignorePollAlarmFailure=false`가 중요한 옵션이다. CloudWatch가 일시적으로 응답하지 않을 때 "알람 상태를 모르는 채로 배포 진행"할지(`true`), "안전하게 배포 중단"할지(`false`)를 결정한다. 운영 권장은 `false`(보수적).

> 🔍 **더 깊이**: CodeDeploy 자동 롤백은 사실 "이전 revision 재배포"다. 새 배포를 만들어 `revision`을 이전 성공 revision으로 지정한다. 그래서 롤백 자체에도 lifecycle hook이 모두 실행된다. 만약 이전 revision의 ApplicationStop 스크립트가 현재 상태에서 동작하지 않으면 롤백도 실패한다. 운영 사고 사례 중 "롤백이 실패해서 수동 개입이 필요했다"는 보통 이 케이스다. 대응책은 ApplicationStop을 idempotent하게 작성("이미 stop된 상태여도 0을 반환") + 타임아웃을 충분히 길게.

## Beanstalk vs CodeDeploy vs CloudFormation의 책임 경계

세 서비스가 모두 "배포"를 다루지만 책임 경계가 다르다.

| 책임 영역 | Beanstalk | CodeDeploy | CloudFormation |
|----------|-----------|------------|----------------|
| **인프라 생성** | ✅ 자동 (EC2/ALB/RDS) | ❌ 사용자 책임 | ✅ 자동 (모든 리소스) |
| **코드 배포** | ✅ 통합 | ✅ 핵심 기능 | ❌ (CFN custom resource 필요) |
| **롤백 단위** | 환경 전체 | Revision | 스택 전체 |
| **배포 hook** | .ebextensions, .platform | AppSpec hooks | UpdatePolicy + WaitCondition |
| **언어/런타임 인식** | ✅ (Node/Python/Java/...) | ❌ (불가지론) | ❌ (불가지론) |

CodeDeploy의 "런타임 불가지론"이 강점이자 약점이다. Beanstalk처럼 Python venv를 자동으로 만들어주지 않으므로 AppSpec script에서 `python -m venv` 같은 동작을 직접 작성해야 한다. 반면 어떤 언어든 동일한 추상화로 배포할 수 있다 — Go binary, Java jar, Python wheel, C++ executable 모두 같은 AppSpec 구조로 다룬다.

실무에서는 셋을 조합해 쓴다. CloudFormation으로 VPC/ALB/ASG 인프라를 만들고, CodeDeploy로 그 위에 코드를 배포한다. Beanstalk은 "인프라까지 함께 묶고 싶은" 작은 워크로드에만 쓴다. 이 조합 패턴이 AWS Well-Architected Framework Operational Excellence Pillar의 "Annotate documentation" 항목에서 권장하는 구조다.

## 정리하며

오늘 본 그림은 두 가지다. 첫째, CodeDeploy는 "코드만 배포한다"는 좁은 책임 덕분에 EC2·온프레미스·Lambda·ECS를 같은 추상화로 다룰 수 있다. 둘째, AppSpec hook의 13단계는 단순 나열이 아니라 idempotent + atomic을 보장하는 상태 머신이고, 그 순서는 "왜 이 단계가 그 자리에 있는가"라는 설계 이유로 외워야 한다.

다음 글에서는 CodeDeploy 위에 코드 빌드와 파이프라인 자동화를 얹는 CodeBuild, 그리고 그 모든 단계를 하나의 워크플로로 묶는 CodePipeline을 본다. "코드 push → 빌드 → 테스트 → 다단계 배포"라는 CI/CD 파이프라인의 AWS 네이티브 구현이 어떤 trade-off를 갖는지, 그리고 GitHub Actions나 Jenkins와 비교했을 때 강점·약점이 어디인지 따라가보자.

---

## 📝 연습 문제

**문제 1.** AppSpec.yml의 hook 순서 중 새 버전 파일이 destination 디렉터리에 복사된 직후, 권한 설정·심볼릭 링크 생성·환경별 config 파일 치환을 수행할 단계는?

A) BeforeInstall
B) AfterInstall
C) ApplicationStart
D) ValidateService

**정답: B**
해설: 13단계 순서 ApplicationStop → DownloadBundle(자동) → BeforeInstall → Install(자동) → AfterInstall → ApplicationStart → ValidateService. 파일이 복사된 직후가 정확히 AfterInstall이다. BeforeInstall은 "파일 복사 전"에 백업하거나 시스템 패키지 설치를 하는 단계. 두 hook이 분리된 이유는 "파일이 없는 상태에서 해야 할 일"과 "파일이 있어야 가능한 일"이 본질적으로 다르기 때문 — 권한 설정은 파일이 있어야 가능하므로 AfterInstall이다.

---

**문제 2.** Lambda 함수를 새 버전으로 배포하되, 처음 10%만 5분간 받아 안정성을 확인한 뒤 100%로 전환하려 한다. 어떤 Deployment Configuration이 정확한가?

A) CodeDeployDefault.LambdaCanary10Percent5Minutes
B) CodeDeployDefault.LambdaLinear10PercentEvery1Minute
C) CodeDeployDefault.LambdaAllAtOnce
D) CodeDeployDefault.HalfAtATime

**정답: A**
해설: Canary 모델은 "고정 비율로 일정 시간 → 100%"의 두 단계 구조다. Linear는 "일정 간격으로 점진 증가"하는 다단계 구조라 안정성 확인 시간이 명확하지 않다. AllAtOnce는 즉시 100%라 검증 시간 자체가 없다. HalfAtATime은 EC2용 옵션이지 Lambda 용어가 아니다. 함정 — Canary와 Linear가 비슷해 보이지만 "두 단계 vs 다단계"라는 본질적 차이를 잡아야 한다.

---

**문제 3.** EC2 Blue-Green 배포에서 새 ASG가 만들어지고 새 인스턴스에 코드가 설치된 후, ALB Target Group 등록 직전에 운영팀이 마지막 검증 스크립트를 돌리고 싶다. 어떤 hook을 써야 하는가?

A) ApplicationStart
B) ValidateService
C) BeforeAllowTraffic
D) AfterAllowTraffic

**정답: C**
해설: ValidateService는 새 인스턴스 자체 검증(포트 listen 등)이고 ALB 등록 이전 단계지만 "트래픽 전환 직전 최종 검증"이라는 의도와는 다르다. BeforeAllowTraffic은 Blue-Green 전용 hook으로 정확히 "Target Group 등록 직전" 시점이다. 여기서 워밍업(JIT compile 트리거, cache preload)이나 downstream 의존성 확인을 한다. AfterAllowTraffic은 등록 후 실제 트래픽이 흐른 뒤 smoke test 용도. 두 hook이 분리된 이유는 "트래픽 받기 전"과 "트래픽 받은 후"에 검증할 수 있는 것이 다르기 때문.

---

**문제 4.** 운영 환경에서 CodeDeploy 배포 중 5xx 에러율이 평소의 5배로 spike하면 자동으로 이전 버전으로 롤백되도록 구성하려 한다. 어떻게 설정하는가?

A) Lambda를 따로 만들어 CloudWatch Events에서 트리거
B) Deployment Group의 auto-rollback-configuration에 `DEPLOYMENT_STOP_ON_ALARM`을 추가하고 alarm-configuration에 해당 CloudWatch Alarm 등록
C) CloudWatch Synthetics만 활성화
D) IAM 정책으로 통제

**정답: B**
해설: CodeDeploy 자체 기능이다. AutoRollbackConfiguration의 events에는 `DEPLOYMENT_FAILURE`(hook 실패), `DEPLOYMENT_STOP_ON_ALARM`(외부 알람), `DEPLOYMENT_STOP_ON_REQUEST`(수동) 세 가지가 있다. AlarmConfiguration에는 모니터링할 CloudWatch Alarm ARN을 등록한다. 추가로 `ignorePollAlarmFailure=false`로 두면 CloudWatch가 일시적으로 응답 안 할 때 안전하게 배포를 중단한다. 함정 — Alarm 기반 롤백은 메트릭 평가 주기(보통 1분 × 3 datapoint) 때문에 최소 3분 지연이 있어 1차 방어선이 아니라 안전망이다.

---

**문제 5.** EC2 CodeDeploy에서 운영 환경에 가장 안전하게 배포하려 한다(한 번에 1대씩, 가장 느림). 어떤 Deployment Configuration이 적합한가?

A) CodeDeployDefault.AllAtOnce
B) CodeDeployDefault.HalfAtATime
C) CodeDeployDefault.OneAtATime
D) CodeDeployDefault.LambdaCanary10Percent5Minutes

**정답: C**
해설: OneAtATime은 한 번에 1대씩만 교체하므로 가장 안전하고 가장 느리다. HalfAtATime은 절반씩 교체라 시간은 짧지만 50% 용량 감소 위험이 있다. AllAtOnce는 다운타임 발생. LambdaCanary는 Lambda 전용이라 EC2에는 적용 불가. 시험에서 "가장 안전" + "EC2"가 키워드면 OneAtATime이 정답. 단 OneAtATime은 ASG가 100대면 100번의 hook 실행이라 1시간 이상 걸릴 수 있어 운영 환경 + 큰 fleet에서는 Custom Config(5-10% 단위)로 균형을 잡는 게 보통.

---

**문제 6.** ECS Blue-Green 배포에서 production 트래픽이 새 Task Set으로 전환되기 전에 별도 포트(8080)로 합성 테스트 트래픽을 보내 검증하고 싶다. 어떤 hook이 이 시점에 실행되는가?

A) BeforeInstall
B) AfterInstall
C) AfterAllowTestTraffic
D) AfterAllowTraffic

**정답: C**
해설: ECS Blue-Green은 ALB에 production listener(80)와 test listener(8080) 두 개를 둔다. 새 Task Set이 test listener에 등록된 직후가 AfterAllowTestTraffic 시점이다. 여기서 smoke test나 synthetic check를 돌려 production 트래픽 받기 전에 회귀를 잡는다. BeforeAllowTraffic은 production listener 전환 직전, AfterAllowTraffic은 production 전환 후. ECS만의 hook 구조(EC2/Lambda에 없음)라는 게 시험 포인트.

---

**문제 7.** Lambda Canary 배포 중 같은 사용자가 V1 응답을 받았다가 다음 호출에서 V2 응답을 받는 현상이 보고됐다. 원인은?

A) CodeDeploy 버그
B) Lambda 가중치는 호출 단위로 무작위 결정되므로 같은 사용자가 V1/V2를 오갈 수 있음
C) API Gateway 캐시 문제
D) IAM 권한 부족

**정답: B**
해설: Lambda alias 가중치는 호출(invocation) 단위로 확률적으로 결정된다. "사용자 A는 항상 V2"가 아니라 "이번 호출은 90% V1, 10% V2" 모델이다. 그래서 같은 사용자가 짧은 시간 내 여러 번 호출하면 V1 → V2 → V1 사이를 오갈 수 있다. 세션 상태나 캐시 일관성이 중요하면 API Gateway 레벨에서 사용자 ID 해시 기반으로 별도 alias를 라우팅하거나, 백엔드에서 상태 호환성을 보장해야 한다. Canary 사용 시 backward-compatible 변경만 해야 하는 이유.

---
