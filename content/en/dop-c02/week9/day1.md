# Day 1 - Systems Manager: Run Command·Session Manager·Patch Manager's Deep Story

Managing one EC2 is easy. SSH in, run commands, done. That one becomes ten, becomes hundreds, becomes thousands, everything collapses. How to distribute keys and rotate them, who did what when for audit, should port 22 be internet-exposed, how to safely apply patches simultaneously across thousands. AWS Systems Manager (SSM) exists to address "fleet-scale operations" directly. One name, actually ten independent features: Run Command, Session Manager, Patch Manager, State Manager, Inventory, Automation, under one umbrella.

Today we cover the three most-used — remote command execution (Run Command), shell access (Session Manager), automatic patching (Patch Manager) — not just "this feature exists" but **why SSM Agent chose pull over push**, how Session Manager enables shells without port 22 opening, and what operational philosophy backs Patch Baseline's approve-after-days number. DOP tests frequent SSM: "access without Bastion," "patch thousands simultaneously," "hybrid on-premise integration" are near-universal scenarios each test.

## SSM Agent — Why Pull Not Push

**All SSM features sit on SSM Agent**, a small daemon running in instances. Its design philosophy compresses all SSM thinking: **AWS doesn't push commands into instances; instances pull from AWS with an outbound request**.

Traditional remote management — SSH, WinRM, old configuration management — mostly uses push. Management server connects to target machine's open port (22, 5985) and sends commands. Targets must expose inbound ports, management must know all target IPs, network path must route management → target. At thousands of instances, this inbound exposure becomes a massive attack surface.

SSM Agent goes opposite. **Agent periodically polls SSM service endpoints** (`ssm`, `ssmmessages`, `ec2messages`) **with outbound HTTPS long-polling**. "Any work for me?" SSM responds with queued commands. Instances need zero inbound ports. Security group inbound can be completely empty. SSM works anyway. Session Manager gets shellless access *because* of this pull model.

> 💡 **Related Theory**: Push vs pull is an old distributed systems theme. Monitoring: Prometheus (pull) vs StatsD/Pushgateway (push). Configuration management: Puppet/Chef agents phone home (pull) vs centralized push. Pull's core advantage: **firewall-friendliness (outbound only)** and **self-registration** — new nodes reach central without central pre-knowing all node IPs. SSM chose pull, achieving "zero inbound" — strong security posture.

> 🔍 **Deeper**: For SSM Agent communication, three things all needed: (1) **Agent itself** — default in Amazon Linux 2/2023, recent Ubuntu, Windows Server AMIs post-2017. (2) **IAM Instance Profile** — `AmazonSSMManagedInstanceCore` policy needed. Without it, agent lacks permission to call SSM APIs, instance won't register as "managed". (3) **Network path** — public subnet needs internet gateway, private needs NAT, complete isolation needs `ssm`/`ssmmessages`/`ec2messages` VPC endpoints. Missing any, instance isn't "managed instance." First debug step: always check these three.

> ⚠️ **Pitfall**: Private subnet without NAT nor VPC endpoints = no SSM. Subtler: **building VPC endpoints but forgetting `ssmmessages`**. `ssm` endpoint alone makes Run Command work but Session Manager fails. Session Manager uses `ssmmessages` for bidirectional channels. Missing `ec2messages` (old Run Command channel) also causes issues. "Run Command works but only Session Manager fails" symptom is almost always `ssmmessages` endpoint omission. Three endpoints all required for full feature set.

## Run Command — Safety Mechanisms for Fleet-Scale Execution

Run Command "run same command on multiple instances simultaneously." Simple work becomes complex at fleet scale. nginx restart command on 3000 instances at once — if new config has typos, nginx won't start, 3000 instances die together. Run Command's real value isn't execution, it's **blast radius control with concurrency and error limits**.

```bash
aws ssm send-command \
  --document-name AWS-RunShellScript \
  --targets Key=tag:Environment,Values=prod \
  --parameters 'commands=["sudo systemctl restart nginx && systemctl is-active nginx"]' \
  --max-concurrency 10% \
  --max-errors 5 \
  --comment "Restart nginx on prod fleet"
```

`--max-concurrency 10%` = 10% of targets at once. 3000 instances = 300 waves. `--max-errors 5` = cumulative failures reach 5, **immediately stop entire rollout**. New config broken on first 300, 5 fail → stop. 2995 survive untouched. Without these numbers, Run Command is "kill everything fast method."

`--targets` selects instances; most powerful is tag-based (`Key=tag:Environment,Values=prod`). New instances with matching tags auto-included. Critical in dynamic environments (ASG).

> 💡 **Related Theory**: `max-concurrency` + `max-errors` = **progressive rollout** (canary deployment). Kubernetes RollingUpdate `maxSurge`/`maxUnavailable`, CodeDeploy deployment configs, Erlang supervisor restart intensity — all same: "change some gradually, stop if failures exceed threshold." Core: **fail-fast + circuit break** — detect problems in small blast, stop propagation. Run Command bakes this into command execution.

> 📚 **Case**: Teams often mistake Run Command for SSH loop, setting `--max-concurrency` to 100%. Company patched 200 servers with broken sed expression, parallel execution mangled configs → hundreds down instantly. Same command with `--max-concurrency 1 --max-errors 1` would stop at first server. Fleet commands need "validate on first instance" habit.

## Session Manager — Shellless Access and Bastion's End

Session Manager most changes operations. SSH keys, port 22, Bastion host — none needed. Shell access to instance without any.

```bash
aws ssm start-session --target i-1234567890abcdef0
```

How? Pull model again. SSM Agent holds bidirectional WebSocket-like channel on `ssmmessages`. When `start-session` runs, SSM service uses that channel for shell session relay. Your terminal ↔ SSM service ↔ (outbound channel) ↔ instance shell. No inbound connection. Empty security group inbound works, private subnet deep inside works.

This transforms everything. **Bastion disappears entirely.** Traditionally, private instance access meant Bastion in public subnet, SSH there, then SSH inside. Bastion always running, port 22 internet-exposed, patch target, most-desired attack target. Session Manager removes all three.

Access control via IAM. Who can `ssm:StartSession` to which instance, tag-conditional. All sessions in CloudTrail, inputs/outputs stream to CloudWatch Logs and S3, unalterable.

```bash
# Session logging (all keyboard input/output to S3 + CloudWatch + KMS)
aws ssm update-document \
  --name SSM-SessionManagerRunShell \
  --content file://session-config.json
```

For SSH tool integration:

```
# ~/.ssh/config
Host i-* mi-*
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
```

`ssh ec2-user@i-1234...` tunnels through SSM internally. Port 22 still internet-closed, SSH tooling unchanged.

> 💡 **Related Theory**: Session Manager is Zero Trust Network Access (ZTNA) applied. "Don't trust network perimeter, authenticate all access by identity + audit." Traditional Bastion = "inside network = trust." Session Manager authenticates each session via IAM, audits via CloudTrail. Google BeyondCorp, HashiCorp Boundary, Teleport are same philosophy. AWS embedded this into its own services.

> 🔍 **Deeper**: Session Manager port-forwards too. `aws ssm start-session --document-name AWS-StartPortForwardingSession --parameters '{"portNumber":["3306"],"localPortNumber":["13306"]}'` tunnels private RDS port 3306 to local 13306. Further, `AWS-StartPortForwardingSessionToRemoteHost` makes instance jump host — tunneling past to RDS. Session Manager replaces all Bastion jobs: shell access, file transfer (ProxyCommand), DB tunneling. Test pattern: "access private RDS with local DB client, no Bastion" → Session Manager port-forwarding.

> 🎯 **Scenario**: "Audit team: all prod server commands must log. Current SSH+Bastion setup." → Answer is remove Bastion, switch to Session Manager with logging (CloudWatch Logs + S3 + KMS). SSH in traditional setup lets users clear shell history; Session Manager logs from AWS side, operator can't alter. Three-layer audit complete: IAM (who), CloudTrail (when), session log (what).

## Patch Manager — The Philosophy of Approve-After-Days

Patch Manager automates OS/application patching. Hardest part isn't "which patch," it's **"when."** Microsoft releases Tuesday patches; applying prod that day risks that patch's bugs. Too long waiting leaves known vulnerabilities exposed. Core tension managed by **Patch Baseline's approve-after-days**.

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

`ApproveAfterDays: 7` is core: "Security/important patches auto-approve 7 days after release." This 7-day buffer lets worldwide users test first, surface problems if any, free validation. Development uses 0 (immediate), staging 3, prod 7 — staged testing before prod.

Patch Manager three components mesh:

- **Patch Baseline**: Policy (CVE class, severity, approval delay)
- **Patch Group**: Tag assigns baseline to instances (`Patch Group=Prod-Linux` tag)
- **Maintenance Window**: Cron schedule ("Saturday 3am")

```bash
# Saturday 3am start, 4hr window, 1hr cutoff
aws ssm create-maintenance-window \
  --name "Prod-Patching" \
  --schedule "cron(0 3 ? * SAT *)" \
  --duration 4 --cutoff 1

aws ssm register-task-with-maintenance-window \
  --window-id mw-abc \
  --task-arn AWS-RunPatchBaseline \
  --task-type RUN_COMMAND \
  --task-invocation-parameters '{"RunCommand":{"Parameters":{"Operation":["Install"]}}}' \
  --max-concurrency 10% --max-errors 5
```

`cutoff 1` often confuses: 4hr window, 1hr cutoff = **don't start new work 1hr before window end** (already-running work completes). 3am-7am window, cutoff 1hr, so 6am onwards no new instance patching starts. 30-min per-instance patch means 6am start → 6:30am done, before 7am. Cutoff is "work doesn't overflow window."

Again `--max-concurrency 10% --max-errors 5` — Patch Manager internally calls Run Command (`AWS-RunPatchBaseline`). Patches roll progressively, failures halt.

| Task | Action | Purpose |
|------|--------|---------|
| **Scan** | Check need, don't install | Compliance reporting, preview |
| **Install** | Apply patches, reboot if needed | Actual patch window |

> 💡 **Related Theory**: Approve-after-days = **bake time** in reliability engineering. Let changes "cook" a period, see regression. Canary deploy bake, AppConfig final-bake-time, CodeDeploy traffic shift+observe all same: "problems show over time." Patch Manager brings this discipline to security patching — dev→staging→prod with increasing bake enforces quality.

> 🔍 **Deeper**: Baselines have approval rules plus **explicit approved/denied patch lists** (approved patches / rejected patches). Certain KB numbers can be forever-denied (conflict with driver). Zero-day hits, add to approved patches, bypass approve-after-days. Approval rules = automated peacetime, explicit lists = exception handling.

> ⚠️ **Pitfall**: Patch Group tag key exact: `Patch Group` (space, capital P/G). `PatchGroup` or `patch group` unrecognized, instance gets default baseline or none. "Patch applied to wrong baseline" symptom = almost always this tag typo.

## Summary

Today four parts. First, **SSM Agent pull model needs zero inbound**, Session Manager's foundation. Three things all required: agent, IAM, network path. Second, **Run Command's true value is `max-concurrency`/`max-errors`** blast radius control. Third, **Session Manager replaces Bastion entirely**, ZTNA enforcement, triple-layer audit. Fourth, **Patch Baseline's approve-after-days is bake time discipline**, Baseline(what)·Group(where)·Window(when) split responsibility.

Next we cover State Manager and Inventory. "Desired state enforcement" principle extends this pattern to ongoing infrastructure compliance.

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
