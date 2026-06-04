# Day 1 - Systems Manager: Run Command·Session Manager·Patch Manager의 깊은 이야기

EC2 한 대를 관리하는 일은 쉽다. SSH로 들어가서 명령을 치면 된다. 그런데 그 한 대가 열 대가 되고, 백 대가 되고, 수천 대가 되는 순간 모든 게 무너진다. 키를 어떻게 배포하고 회전할 것인가, 누가 언제 어떤 명령을 쳤는지 어떻게 감사할 것인가, 22번 포트를 인터넷에 열어두는 게 맞는가, 패치를 어떻게 동시에 안전하게 적용할 것인가. AWS Systems Manager(SSM)는 이 "fleet 규모 운영"이라는 문제를 정면으로 다루기 위해 만들어진 도구 묶음이다. 이름이 하나지만 실제로는 Run Command, Session Manager, Patch Manager, State Manager, Inventory, Automation 같은 십여 개의 독립 기능이 한 우산 아래 모여 있다.

오늘은 이 우산 밑에서 가장 자주 쓰이는 세 가지 — 원격 명령 실행(Run Command), 셸 접속(Session Manager), 패치 자동화(Patch Manager) — 를 본다. 단순히 "이런 기능이 있다"가 아니라, 왜 SSH를 버리고 SSM Agent라는 풀(pull) 모델로 갔는지, Session Manager가 어떻게 포트 하나 열지 않고 셸을 띄우는지, Patch Baseline의 승인 지연(approve-after-days)이라는 숫자 하나에 어떤 운영 철학이 담겨 있는지를 파고든다. DOP 시험에서 SSM은 단일 서비스로는 가장 출제 빈도가 높은 영역 중 하나이고, "Bastion 없이 접속", "수천 대 동시 패치", "온프레미스 통합" 같은 시나리오는 거의 매 회 나온다.

## SSM Agent — 왜 push가 아니라 pull인가

SSM의 모든 기능은 인스턴스 안에서 도는 **SSM Agent**라는 작은 데몬 위에 서 있다. 이 에이전트의 동작 방식이 SSM 전체 설계 철학을 압축하고 있다. 핵심은 **AWS가 인스턴스로 명령을 밀어넣는(push) 게 아니라, 인스턴스가 AWS로 나가서 할 일을 받아오는(pull) 모델**이라는 점이다.

전통적인 원격 관리 도구 — SSH, WinRM, 옛날 방식의 구성 관리 — 는 대부분 push다. 관리 서버가 대상 머신의 열린 포트(22, 5985)로 접속해 명령을 던진다. 이 모델은 대상 머신이 인바운드 포트를 열어둬야 하고, 관리 서버가 모든 대상의 IP를 알아야 하며, 네트워크 경로가 관리 서버 → 대상으로 뚫려 있어야 한다. fleet이 수천 대로 커지면 이 인바운드 노출이 거대한 공격 표면이 된다.

SSM Agent는 정반대로 간다. 에이전트가 주기적으로 SSM 서비스 엔드포인트(`ssm`, `ssmmessages`, `ec2messages`)로 **아웃바운드 HTTPS 롱폴링**을 건다. "나한테 시킬 일 있어?"라고 물으면 SSM 서비스가 큐에 쌓인 명령을 응답으로 돌려준다. 인스턴스는 인바운드 포트를 단 하나도 열 필요가 없다. 보안 그룹의 인바운드 규칙이 완전히 비어 있어도 SSM은 동작한다. 이게 Session Manager가 22번 포트 없이 셸을 띄울 수 있는 근본 이유다.

> 💡 **관련 이론**: push vs pull은 분산 시스템에서 오래된 주제다. 모니터링에서 Prometheus(pull)와 StatsD/푸시게이트웨이(push)의 대립, 구성 관리에서 Puppet/Chef의 에이전트가 마스터로 체크인하는 pull 모델이 같은 축이다. pull 모델의 핵심 장점은 **방화벽 친화성(아웃바운드만 필요)**과 **자기 등록(self-registration)** — 새 노드가 알아서 중앙에 연결하므로 중앙이 모든 노드 IP를 사전에 알 필요가 없다. SSM은 이 pull 모델을 선택해 "인바운드 0개"라는 강력한 보안 자세를 얻었다.

> 🔍 **더 깊이**: SSM Agent가 통신하려면 세 가지가 모두 갖춰져야 한다. (1) **에이전트 자체** — Amazon Linux 2/2023, 최신 Ubuntu, Windows Server 공식 AMI에는 2017년 이후 기본 포함. (2) **IAM Instance Profile** — `AmazonSSMManagedInstanceCore` 관리형 정책이 붙은 역할. 이게 없으면 에이전트가 SSM API를 호출할 권한이 없어 "managed instance"로 등록조차 안 된다. (3) **네트워크 경로** — 퍼블릭 서브넷이면 인터넷 게이트웨이로, 프라이빗이면 NAT 게이트웨이로, 완전 격리 환경이면 `ssm`/`ssmmessages`/`ec2messages` 세 개의 VPC 인터페이스 엔드포인트로 SSM 엔드포인트에 닿아야 한다. 셋 중 하나라도 빠지면 인스턴스가 "관리 대상" 목록에 안 뜬다. 디버깅의 첫 단계는 항상 이 세 가지 체크다.

> ⚠️ **함정**: 프라이빗 서브넷에서 NAT도 VPC 엔드포인트도 없으면 SSM이 동작하지 않는다. 그런데 더 미묘한 함정은 **VPC 엔드포인트를 만들 때 `ssmmessages`를 빼먹는 경우**다. `ssm` 엔드포인트만 만들면 Run Command의 명령 폴링까지는 되지만 Session Manager가 안 된다. Session Manager는 양방향 메시지 채널인 `ssmmessages`를 별도로 쓰기 때문이다. 마찬가지로 `ec2messages`는 구형 Run Command 채널이라 함께 만들어주는 게 안전하다. "Run Command는 되는데 Session Manager만 안 된다"는 증상은 거의 항상 `ssmmessages` 엔드포인트 누락이다.

## Run Command — fleet 규모 명령 실행의 안전장치

Run Command는 "여러 인스턴스에 동시에 같은 명령을 친다"는 단순한 일을 한다. 하지만 단순한 일을 수천 대 규모로 하면 단순하지 않다. nginx를 재시작하는 명령 하나를 3000대에 동시에 던졌는데, 새 설정에 오타가 있어서 nginx가 안 뜬다면? 동시에 3000대가 다 죽는다. Run Command의 진짜 가치는 명령 실행이 아니라 이 폭발 반경을 통제하는 **동시성·오류 제어**에 있다.

```bash
aws ssm send-command \
  --document-name AWS-RunShellScript \
  --targets Key=tag:Environment,Values=prod \
  --parameters 'commands=["sudo systemctl restart nginx && systemctl is-active nginx"]' \
  --max-concurrency 10% \
  --max-errors 5 \
  --comment "Restart nginx on prod fleet"
```

`--max-concurrency 10%`는 한 번에 전체 대상의 10%만 실행하라는 뜻이다. 3000대면 300대씩 물결처럼 퍼진다. `--max-errors 5`는 누적 실패가 5개를 넘으면 **즉시 전체 롤아웃을 중단**하라는 뜻이다. 새 설정에 오타가 있어 처음 300대 중 5대가 실패하면, Run Command가 더 이상 다음 배치를 시작하지 않는다. 2995대가 멀쩡히 살아남는다. 이 두 숫자가 없으면 Run Command는 그냥 "동시에 다 죽이는 빠른 방법"일 뿐이다.

`--targets`는 인스턴스를 고르는 방식인데, 가장 강력한 게 태그 기반(`Key=tag:Environment,Values=prod`)이다. 인스턴스 ID를 일일이 나열하지 않아도 되고, 새로 뜬 인스턴스도 태그만 맞으면 자동으로 포함된다. 이게 fleet이 동적으로 변하는 환경(ASG)에서 결정적이다.

> 💡 **관련 이론**: `max-concurrency` + `max-errors`의 조합은 분산 배포의 **순차적 카나리(progressive rollout)** 그 자체다. Kubernetes의 RollingUpdate `maxSurge`/`maxUnavailable`, CodeDeploy의 배포 구성, 심지어 Erlang/OTP의 supervisor 재시작 강도(restart intensity)까지 같은 아이디어다. "한 번에 일부만 바꾸고, 실패가 임계치를 넘으면 멈춘다." 핵심은 **실패를 빨리 감지하고 전파를 끊는(fail-fast + circuit break)** 것이다. Run Command는 이 패턴을 명령 실행 레벨에 내장했다.

> 📚 **사례**: 운영 현장에서 Run Command를 SSH 루프로 착각해 `--max-concurrency`를 100%로 두는 실수가 흔하다. 한 회사가 긴급 보안 패치를 위해 `sed`로 설정 파일을 일괄 수정하는 명령을 전 fleet에 100% 동시 실행했는데, sed 표현식 한 줄이 설정 파일을 망가뜨려 수백 대 서비스가 동시에 내려간 사례가 있다. 같은 명령을 `--max-concurrency 1 --max-errors 1`로 던졌다면 첫 한 대에서 막혔을 일이다. fleet 명령에는 항상 "처음 한 대로 검증"하는 카나리 습관이 필요하다.

## Session Manager — 포트 없는 셸과 Bastion의 종말

Session Manager는 SSM에서 가장 운영을 바꿔놓은 기능이다. SSH 키도, 22번 포트도, Bastion 호스트도 없이 인스턴스 셸에 접속한다.

```bash
aws ssm start-session --target i-1234567890abcdef0
```

이 한 줄이 어떻게 동작하는가. 위에서 본 pull 모델 그대로다. SSM Agent가 `ssmmessages` 엔드포인트로 양방향 WebSocket 같은 채널을 열어두고 있고, `start-session`을 치면 SSM 서비스가 그 채널을 통해 셸 세션을 중계한다. 내 터미널 ↔ SSM 서비스 ↔ (아웃바운드 채널) ↔ 인스턴스 안의 셸. 인스턴스 입장에서는 인바운드 연결이 전혀 없다. 보안 그룹 인바운드가 텅 비어 있어도, 인스턴스가 프라이빗 서브넷 깊숙이 있어도 접속된다.

이것이 의미하는 바는 크다. **Bastion 호스트가 통째로 사라진다.** 전통적으로 프라이빗 인스턴스에 접속하려면 퍼블릭 서브넷에 Bastion(점프 박스)을 두고, 거기로 SSH한 뒤 다시 내부로 SSH하는 2단 점프가 표준이었다. Bastion은 항상 켜져 있어야 하고, 인터넷에 22번 포트를 노출하고, 패치 대상이고, 가장 탐나는 공격 표적이었다. Session Manager는 이 Bastion을 완전히 제거한다.

접근 통제는 IAM으로 한다. 누가 어느 인스턴스에 `ssm:StartSession`을 할 수 있는지를 IAM 정책으로 태그 조건까지 걸어 제어한다. 그리고 모든 세션은 CloudTrail에 기록되고, 세션 중 입력·출력 전체를 CloudWatch Logs와 S3로 흘려보낼 수 있다.

```bash
# 세션 로깅 설정 (모든 키 입력/출력을 S3 + CloudWatch Logs로)
aws ssm update-document \
  --name SSM-SessionManagerRunShell \
  --content file://session-config.json \
  --document-version '$LATEST'
# session-config.json에 CloudWatch Logs 그룹 + S3 버킷 + KMS 키 지정
```

기존 SSH 도구 체인(scp, rsync, ansible의 ssh transport)을 버리기 아쉬울 때를 위해, SSH를 Session Manager 위에 얹는 길도 있다.

```
# ~/.ssh/config
Host i-* mi-*
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
```

이러면 `ssh ec2-user@i-1234...`가 내부적으로 SSM 채널을 ProxyCommand로 타고 들어간다. 22번 포트는 여전히 인터넷에 닫혀 있고, SSH의 표준 도구는 그대로 쓴다.

> 💡 **관련 이론**: Session Manager의 모델은 제로 트러스트 네트워크 접근(ZTNA)의 한 형태다. "네트워크 경계(perimeter)를 신뢰하지 않고, 모든 접근을 신원(identity) 기반으로 인증·인가·감사한다"는 원칙. 전통 Bastion은 "내부 네트워크에 들어오면 신뢰" 모델인 반면, Session Manager는 매 세션을 IAM 신원으로 인증하고 CloudTrail로 감사한다. Google의 BeyondCorp, HashiCorp Boundary, Teleport가 같은 철학의 도구들이다. AWS는 이 ZTNA를 자체 서비스에 내장해버린 셈이다.

> 🔍 **더 깊이**: Session Manager는 포트 포워딩도 한다. `aws ssm start-session --document-name AWS-StartPortForwardingSession --parameters '{"portNumber":["3306"],"localPortNumber":["13306"]}'`로 프라이빗 RDS의 3306 포트를 내 로컬 13306으로 터널링할 수 있다. 더 나아가 `AWS-StartPortForwardingSessionToRemoteHost`를 쓰면 인스턴스를 점프 호스트 삼아 그 너머의 RDS 엔드포인트까지 포워딩한다. 즉 Session Manager 하나로 SSH 접속 + 파일 전송(ProxyCommand) + DB 터널링까지 Bastion이 하던 모든 일을 대체한다. 시험에서 "프라이빗 RDS에 로컬 DB 클라이언트로 접속, Bastion 없이"가 나오면 답은 Session Manager 포트 포워딩이다.

> 🎯 **시나리오**: "감사팀이 '운영자가 prod 서버에서 무슨 명령을 쳤는지 전부 기록되어야 한다'고 요구한다. 현재 SSH 키 + Bastion 구조다. 어떻게?" — 답은 Bastion 제거 후 Session Manager로 전환하고 세션 로깅(CloudWatch Logs + S3 + KMS)을 켠다. SSH 환경에서는 셸 히스토리를 사용자가 지울 수 있어 신뢰할 수 없지만, Session Manager는 세션 입출력을 AWS 측에서 변조 불가능하게 기록한다. IAM으로 누가 접속 가능한지, CloudTrail로 누가 언제 세션을 열었는지, 세션 로그로 무엇을 쳤는지 — 3단 감사가 완성된다.

## Patch Manager — 승인 지연이라는 운영 철학

Patch Manager는 OS·애플리케이션 패치를 자동화한다. 그런데 패치 자동화에서 가장 어려운 건 "어떤 패치를 적용할 것인가"가 아니라 "**언제** 적용할 것인가"다. 마이크로소프트가 화요일에 새 보안 패치를 내놓았다고 그날 바로 prod에 깔면, 그 패치 자체가 버그를 품고 있어 서버를 죽일 수도 있다. 반대로 너무 오래 미루면 알려진 취약점에 노출된 채로 방치된다. 이 긴장을 다루는 핵심 장치가 **Patch Baseline의 승인 지연(approve-after-days)**이다.

```bash
aws ssm create-patch-baseline \
  --name "Prod-Linux-Baseline" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules '{
    "PatchRules": [{
      "PatchFilterGroup": {
        "PatchFilters": [
          {"Key":"CLASSIFICATION","Values":["Security","Bugfix"]},
          {"Key":"SEVERITY","Values":["Critical","Important"]}
        ]
      },
      "ApproveAfterDays": 7,
      "ComplianceLevel": "CRITICAL"
    }]
  }'
```

`ApproveAfterDays: 7`이 핵심이다. "보안·중요 등급의 패치는 출시 후 7일이 지나면 자동 승인한다"는 규칙이다. 이 7일이라는 완충 구간 동안 전 세계 다른 사용자들이 그 패치를 먼저 깔아보고 문제가 있으면 떠들어준다. 일종의 군중 검증(crowd-sourced validation)을 공짜로 얻는 셈이다. dev 환경은 `ApproveAfterDays: 0`(즉시)으로 두고, staging은 3일, prod는 7일로 단계를 두는 게 표준 패턴이다. 같은 패치가 dev에서 먼저 터지면 prod에 닿기 전에 거른다.

Patch Manager의 전체 그림은 세 가지가 맞물린다.

- **Patch Baseline**: 어떤 패치를 승인할지의 정책(CVE 분류, 심각도, 승인 지연).
- **Patch Group**: 어느 인스턴스에 어느 baseline을 적용할지. 인스턴스에 `Patch Group=Prod-Linux` 태그를 붙이면 그 baseline이 걸린다.
- **Maintenance Window**: 언제 적용할지. cron 스케줄로 "토요일 새벽 3시" 같은 시간을 정한다.

```bash
# 토요일 새벽 3시 시작, 4시간 윈도우, cutoff 1시간
aws ssm create-maintenance-window \
  --name "Prod-Patching" \
  --schedule "cron(0 3 ? * SAT *)" \
  --duration 4 --cutoff 1 \
  --allow-unassociated-targets

aws ssm register-task-with-maintenance-window \
  --window-id mw-abc \
  --task-arn AWS-RunPatchBaseline \
  --task-type RUN_COMMAND \
  --task-invocation-parameters '{"RunCommand":{"Parameters":{"Operation":["Install"]}}}' \
  --max-concurrency 10% --max-errors 5
```

여기서 `cutoff 1`이 자주 헷갈린다. 4시간 윈도우에서 cutoff가 1시간이면, **윈도우 종료 1시간 전부터는 새 작업을 시작하지 않는다**(이미 시작된 작업은 끝까지 진행). 즉 새벽 3시~7시 윈도우에서 6시 이후로는 새 인스턴스 패치를 시작하지 않는다. 한 인스턴스 패치가 평균 30분 걸린다면, 6시에 시작한 작업은 6시 30분에 끝나 윈도우 안에서 마무리된다. cutoff는 "작업이 윈도우를 넘겨 폭주하는 것"을 막는 안전 마진이다.

그리고 위 task에서도 `--max-concurrency 10% --max-errors 5`가 다시 등장한다. Patch Manager가 내부적으로 Run Command(`AWS-RunPatchBaseline`)를 호출하기 때문이다. 패치도 점진적으로 퍼지고, 실패가 누적되면 멈춘다. 패치 도중 재부팅이 필요하면 인스턴스가 재부팅된다(`Operation: Install`).

| 작업 | 동작 | 용도 |
|------|------|------|
| **Scan** | 패치 필요 여부만 확인, 설치 안 함 | 컴플라이언스 리포팅, 사전 점검 |
| **Install** | 실제 패치 적용, 필요 시 재부팅 | 실제 패치 윈도우 |

> 💡 **관련 이론**: 승인 지연(approve-after-days)은 신뢰성 공학의 **bake time**(숙성 시간) 개념과 같다. 새 변경을 전면 적용하기 전에 일정 기간 관찰하며 회귀(regression)를 발견할 시간을 둔다. 카나리 배포의 bake, AppConfig의 final-bake-time, CodeDeploy의 트래픽 시프트 후 관찰 구간이 모두 같은 원리다. "변경의 위험은 시간이 지나면서 드러난다"는 경험칙을 정책으로 못 박은 것. dev→staging→prod로 승인 지연을 늘리는 건 환경별로 bake time을 차등화하는 것이다.

> 🔍 **더 깊이**: Patch Baseline에는 승인 규칙(approval rules) 외에 **명시적 승인/거부 목록**(approved patches / rejected patches)도 있다. 특정 KB 번호나 패키지를 무조건 거부하거나, 승인 규칙에 안 걸려도 강제로 승인할 수 있다. 예를 들어 "이 커널 패치는 우리 드라이버와 충돌하니 영구 거부"를 rejected patches에 박아두면, 승인 규칙이 아무리 7일 지나도 그 패치는 절대 안 깔린다. 반대로 긴급 제로데이가 터지면 `ApproveAfterDays`를 기다리지 않고 approved patches에 직접 넣어 즉시 적용한다. 승인 규칙은 평시 자동화, 명시적 목록은 예외 처리라는 역할 분담이다.

> ⚠️ **함정**: Patch Group 태그의 키는 정확히 `Patch Group`(공백 포함, 대소문자 정확히)이어야 한다. `PatchGroup`(공백 없음)이나 `patch group`(소문자)으로 붙이면 Patch Manager가 인식하지 못하고, 인스턴스가 default baseline으로 패치되거나 아예 패치 대상에서 빠진다. AWS 문서에 박혀 있는 예약 태그 키라 자유롭게 바꿀 수 없다. "패치가 의도한 baseline 대신 default로 적용된다"는 증상은 거의 항상 이 태그 키 오타다.

## State Manager와 Hybrid Activation — 패치 자동화의 주변부

오늘 주제의 곁가지지만 시험에 함께 묶여 나오는 두 가지가 있다. 하나는 State Manager, 하나는 Hybrid Activation이다.

**State Manager**는 "원하는 상태를 정기적으로 강제"한다. Run Command가 일회성 명령이라면, State Manager Association은 cron처럼 주기적으로 실행되며 결과를 컴플라이언스로 보고한다. 예를 들어 "모든 prod 인스턴스에 CloudWatch Agent가 항상 설치되어 있어야 한다"를 7일마다 강제할 수 있다.

```bash
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{"action":["Install"],"name":["AmazonCloudWatchAgent"]}' \
  --schedule-expression "rate(7 days)" \
  --apply-only-at-cron-interval
```

cron과 다른 점은 **중앙 관리 + 컴플라이언스 리포팅 + 새 인스턴스 자동 적용**이다. 새로 뜬 인스턴스도 태그만 맞으면 자동으로 association이 걸려 첫 부팅 후 표준 상태가 보장된다. 이건 내일(Day 2) 깊이 다룬다.

**Hybrid Activation**은 SSM을 EC2 밖으로 확장한다. 온프레미스 서버, 다른 클라우드의 VM도 SSM Agent를 설치하고 활성화 코드로 등록하면 SSM의 관리 대상이 된다. 이때 인스턴스 ID가 `i-`가 아니라 `mi-`(managed instance) 접두사로 붙는다.

```bash
aws ssm create-activation \
  --default-instance-name onprem-1 \
  --iam-role SSMOnPremRole \
  --registration-limit 100 \
  --expiration-date "2026-12-31T00:00:00Z"
# 온프레미스 머신: amazon-ssm-agent -register -code ... -id ... -region ap-northeast-2
```

이걸로 온프레미스 서버에도 Run Command, Session Manager, Patch Manager, Inventory를 똑같이 쓴다. 하이브리드 환경에서 "온프레미스와 클라우드를 한 콘솔로 패치"가 가능해진다. ECS Anywhere/EKS Anywhere가 컨테이너 워크로드에서 같은 일을 하는 것과 짝을 이룬다.

> 🎯 **시나리오**: "데이터센터에 남은 200대의 물리 서버와 AWS의 EC2 fleet을 하나의 패치 정책으로 통합 관리하고 싶다. 별도 패치 도구를 두 개 운영하기 싫다." — 답은 온프레미스 서버에 SSM Agent를 설치하고 Hybrid Activation으로 등록한 뒤, EC2와 동일한 Patch Baseline·Patch Group·Maintenance Window를 적용한다. `mi-` 인스턴스도 태그 기반 타겟팅과 컴플라이언스 리포팅에 그대로 포함된다. 단일 콘솔에서 하이브리드 fleet의 패치 컴플라이언스를 한눈에 본다.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **SSM Agent는 pull 모델**이라 인바운드 포트가 필요 없고, 이 때문에 Session Manager가 22번 포트 없이 동작한다 — 동작하려면 에이전트·IAM·네트워크 경로 세 가지가 다 맞아야 한다. 둘째, **Run Command의 진짜 가치는 `max-concurrency`/`max-errors`**라는 폭발 반경 통제 장치에 있다. 셋째, **Session Manager는 Bastion을 통째로 제거**하는 ZTNA 도구이고, 포트 포워딩으로 DB 터널링까지 대체하며 세션 전체를 변조 불가능하게 감사한다. 넷째, **Patch Manager의 approve-after-days는 bake time**의 정책화이고, Baseline + Patch Group + Maintenance Window 3종이 맞물려 "무엇을·어디에·언제" 패치할지를 나눠 책임진다.

다음 글에서는 State Manager와 Inventory를 깊이 본다. "원하는 상태를 정기적으로 강제"한다는 추상화가 Kubernetes·Puppet과 어떻게 같은 뿌리를 갖는지, 그리고 수집한 인벤토리를 S3로 흘려 Athena로 SQL 질의하는 데이터 파이프라인까지 이어진다.

---

## 📝 연습 문제

**문제 1.** 프라이빗 서브넷의 EC2에서 Run Command는 정상 동작하는데 Session Manager만 "연결 실패"가 난다. 가장 가능성 높은 원인은?

A) IAM Instance Profile에 AmazonSSMManagedInstanceCore가 없다
B) VPC 인터페이스 엔드포인트 중 `ssmmessages`가 없다
C) SSM Agent가 설치되지 않았다
D) 인스턴스 타입이 너무 작다

**정답: B**

해설: Run Command가 동작한다는 건 IAM(A), 에이전트(C), 기본 `ssm` 엔드포인트 경로가 모두 정상이라는 뜻이다. Session Manager는 양방향 메시지 채널인 `ssmmessages` 엔드포인트를 추가로 쓰는데, 이것만 누락되면 Run Command는 되고 Session Manager만 실패하는 정확히 이 증상이 나온다. 프라이빗 서브넷에서 SSM 전체를 쓰려면 `ssm`, `ssmmessages`, `ec2messages` 세 엔드포인트를 모두 만들어야 한다. 인스턴스 타입(D)은 SSM 동작과 무관하다.

---

**문제 2.** 3000대 prod fleet에 설정 변경 명령을 Run Command로 배포한다. 잘못된 설정이 들어가도 전체 장애를 막으려면?

A) `--max-concurrency 100% --max-errors 100%`
B) `--max-concurrency 10% --max-errors 5`로 점진 배포 + 실패 임계치 도달 시 자동 중단
C) 모든 인스턴스에 동시에 실행 후 모니터링
D) SSH로 한 대씩 접속해 수동 실행

**정답: B**

해설: `max-concurrency`로 한 번에 10%(300대)씩만 퍼뜨리고, `max-errors 5`로 누적 실패 5개에서 즉시 전체 롤아웃을 중단한다. 잘못된 설정이 들어가면 처음 배치에서 실패가 누적되어 멈추므로 대다수 인스턴스가 보호된다. fail-fast + circuit break 패턴. A는 동시에 다 죽이는 방법, C는 통제 장치 없음, D는 3000대 규모에서 비현실적이고 감사도 어렵다.

---

**문제 3.** 감사 요구사항: "운영자가 prod 서버에서 실행한 모든 명령이 변조 불가능하게 기록되어야 한다." 현재 SSH 키 + Bastion 구조다. 가장 적절한 전환은?

A) Bastion에 sudo 로깅 강화
B) Session Manager로 전환 + 세션 로깅(CloudWatch Logs + S3 + KMS) 활성화, IAM으로 접근 통제, CloudTrail로 세션 시작 감사
C) SSH 키를 자주 회전
D) VPN 도입

**정답: B**

해설: SSH 환경의 셸 히스토리는 사용자가 지울 수 있어 감사 증거로 신뢰할 수 없다. Session Manager는 세션 입출력을 AWS 측에서 기록하므로 운영자가 변조할 수 없고, IAM(누가 접속 가능)·CloudTrail(언제 세션 시작)·세션 로그(무엇을 실행)의 3단 감사가 완성된다. 동시에 Bastion이 제거되어 22번 포트 노출도 사라진다. A/C는 SSH 모델의 근본 한계를 남기고, D는 감사와 무관하다.

---

**문제 4.** Patch Baseline의 `ApproveAfterDays: 7`이 prod 환경에서 갖는 의미로 가장 정확한 것은?

A) 패치를 7일 동안 설치하지 않고 나중에 한 번에 설치
B) 보안·중요 패치를 출시 후 7일이 지나면 자동 승인 — 다른 사용자들이 먼저 검증할 bake time 확보
C) 7일마다 패치 검사
D) 7일 후 인스턴스 재부팅

**정답: B**

해설: approve-after-days는 패치 출시 후 자동 승인까지의 완충 구간이다. 이 7일 동안 전 세계 다른 사용자들이 패치를 먼저 적용해 문제를 드러내주는 군중 검증 효과를 얻는다. 신뢰성 공학의 bake time을 정책화한 것. dev는 0일(즉시), staging 3일, prod 7일로 환경별 차등을 두는 게 표준이다. 검사 주기(C)나 재부팅(D)과는 무관하다.

---

**문제 5.** Maintenance Window가 `--duration 4 --cutoff 1`이고 새벽 3시에 시작한다. cutoff의 효과는?

A) 패치를 1시간만 실행
B) 윈도우 종료 1시간 전(6시)부터 새 작업을 시작하지 않음 — 이미 시작된 작업은 완료까지 진행
C) 1시간마다 반복 실행
D) 작업 시작 후 1시간 timeout

**정답: B**

해설: cutoff는 윈도우 종료 전 새 작업 시작을 막는 안전 마진이다. 3시~7시 윈도우에서 cutoff 1이면 6시 이후로는 새 인스턴스 패치를 시작하지 않는다. 한 작업이 윈도우 경계를 한참 넘겨 폭주하는 것을 방지한다. 이미 6시 이전에 시작된 작업은 끝까지 진행된다.

---

**문제 6.** 데이터센터의 물리 서버 200대와 EC2 fleet을 단일 패치 정책으로 통합 관리하려면?

A) 물리 서버용 별도 패치 도구 운영
B) 물리 서버에 SSM Agent 설치 + Hybrid Activation 등록(`mi-` ID) 후 동일 Patch Baseline·Group·Maintenance Window 적용
C) 물리 서버를 모두 EC2로 마이그레이션
D) 물리 서버는 수동 패치

**정답: B**

해설: Hybrid Activation으로 온프레미스 서버를 SSM 관리 대상(`mi-` 접두사)으로 등록하면 EC2와 동일하게 Run Command·Patch Manager·Inventory를 쓸 수 있다. 같은 태그 기반 타겟팅과 컴플라이언스 리포팅에 포함되어 단일 콘솔에서 하이브리드 fleet을 관리한다. 별도 도구(A)는 운영 부담이 두 배, 마이그레이션(C)은 과도한 비용, 수동(D)은 규모에서 비현실적이다.

---

**문제 7.** SSM Agent가 인바운드 포트 없이 동작하는 근본 이유는?

A) AWS가 인스턴스로 명령을 push하기 때문
B) 에이전트가 SSM 엔드포인트로 아웃바운드 롱폴링하는 pull 모델이라 인바운드 연결이 필요 없음
C) 보안 그룹이 SSM 트래픽을 자동 허용하기 때문
D) SSM이 UDP를 쓰기 때문

**정답: B**

해설: SSM Agent는 인스턴스가 SSM 서비스로 나가서(아웃바운드 HTTPS) 할 일을 받아오는 pull 모델이다. 인스턴스는 인바운드 포트를 하나도 열 필요가 없어 공격 표면이 최소화된다. 이 pull 모델이 Session Manager가 22번 포트 없이 셸을 띄우는 근본 원리다. push 모델(A)은 전통 SSH의 방식이고 인바운드 노출이 필요하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, SSM Agent는 인스턴스가 SSM 엔드포인트로 아웃바운드 폴링하는 pull 모델이라 인바운드 포트가 필요 없으며, 동작하려면 에이전트·IAM(AmazonSSMManagedInstanceCore)·네트워크 경로(`ssm`/`ssmmessages`/`ec2messages`) 세 가지가 모두 맞아야 한다. 둘째, Run Command의 핵심 가치는 `max-concurrency`/`max-errors`라는 폭발 반경 통제(fail-fast + circuit break)에 있다. 셋째, Session Manager는 Bastion과 22번 포트를 제거하는 ZTNA 도구이며, 포트 포워딩으로 DB 터널링까지 대체하고 세션 전체를 변조 불가능하게 감사한다. 넷째, Patch Manager의 approve-after-days는 bake time의 정책화이고, Patch Baseline(무엇)·Patch Group(어디)·Maintenance Window(언제) 3종이 맞물려 동작하며 내부적으로 Run Command를 호출해 점진 배포한다.
