# Day 3 - AWS Network Firewall와 DNS Firewall: 상태 저장 검사, 도메인 필터링, 중앙 집중식 검사 VPC

Security Group과 NACL은 VPC 트래픽의 기본 통제지만 한계가 명확하다. Security Group은 상태 저장(stateful)이되 단순 허용/거부만 하고, NACL은 상태 비저장(stateless)이며 둘 다 IP·포트·프로토콜 수준이다. "특정 도메인으로의 아웃바운드만 허용", "패킷 페이로드 안의 서명(IPS)으로 침입을 탐지", "TLS SNI 기반 도메인 차단" 같은 요구는 이들로 풀 수 없다. **AWS Network Firewall**(관리형 stateful/stateless 검사 엔진)과 **Route 53 Resolver DNS Firewall**(DNS 질의 필터링)이 이 공백을 메운다.

## Network Firewall 구조: Firewall, Policy, Rule Group

AWS Network Firewall는 VPC 안에 **firewall endpoint**(가용영역별 ENI)를 배치하고, 라우팅으로 트래픽을 이 엔드포인트로 강제 통과시켜 검사한다. 구성 요소는 세 층이다.

1. **Firewall**: VPC와 서브넷(전용 firewall subnet)에 배치되는 리소스. AZ별 엔드포인트를 만든다.
2. **Firewall Policy**: stateless/stateful 규칙 그룹과 기본 액션을 묶는 정책.
3. **Rule Group**:
   - **Stateless rule group**: 패킷 단위, 5-tuple(소스/대상 IP·포트, 프로토콜)로 빠르게 pass/drop/forward. 연결 상태를 추적하지 않음.
   - **Stateful rule group**: 연결·세션을 추적. Suricata 호환 규칙으로 도메인(SNI/Host), 프로토콜 이상, 시그니처 기반 IPS/IDS를 검사.

```
패킷 → [Stateless 평가] --forward to stateful--> [Stateful 평가] → 액션
            │ pass/drop(즉시)                         │ pass/drop/alert
```

> 💡 **관련 이론**: stateless vs stateful은 방화벽 이론의 근간이다. stateless(NACL, Network Firewall stateless 그룹)는 각 패킷을 독립적으로 평가해 빠르지만, "이 패킷이 기존 연결의 응답인가"를 모른다. stateful(Security Group, Network Firewall stateful 그룹)은 연결 테이블을 유지해 응답 트래픽을 자동 허용하고, 세션 맥락(handshake 진행, 비정상 시퀀스)을 본다. Network Firewall은 둘을 한 엔진에 결합해, 빠른 1차 필터(stateless) → 정밀 검사(stateful)의 파이프라인을 구성한다.

### 네 가지 VPC 통제를 한 표로

VPC 안의 트래픽을 다루는 통제가 넷이나 되는 이유는, 각각이 **다른 것을 볼 수 있고 다른 방식으로 강제되기** 때문이다. 시험은 이 표의 마지막 두 열(볼 수 있는 것 / 강제 방식)에서 정답을 만든다.

| 통제 | 범위 | 상태 | 볼 수 있는 것 | 강제되는 방식 | 못 하는 것 |
|------|------|------|---------------|---------------|------------|
| **Security Group** | ENI | 상태 저장 | IP·포트·프로토콜, 다른 SG 참조 | ENI에 부착(우회 불가) | 도메인·페이로드 검사, 명시적 거부 규칙 |
| **NACL** | 서브넷 | 상태 비저장 | IP·포트·프로토콜 | 서브넷 경계(우회 불가) | 도메인·페이로드, 응답 자동 허용 |
| **Network Firewall** | VPC(전용 서브넷) | 둘 다 | 패킷 페이로드, TLS SNI, HTTP Host, IPS 시그니처 | **라우팅으로 통과 강제**(라우팅 실패 시 무력) | 암호화된 본문 내부(복호화 없이는), ECH로 가려진 SNI |
| **DNS Firewall** | VPC(Resolver) | 해당 없음 | **DNS 질의 이름** | VPC의 Resolver를 쓰는 질의에만 적용 | 자체 DNS·DoH를 쓰는 트래픽, 직접 IP 접속 |

여기서 반드시 붙잡아야 할 대비가 하나 있다. Security Group과 NACL은 **구조적으로 우회 불가능**하다 — 트래픽이 ENI나 서브넷 경계를 지나지 않을 방법이 없기 때문이다. 반면 Network Firewall과 DNS Firewall은 **설정에 의존해 경로에 놓인다.** 라우트 테이블이 틀리면 Network Firewall은 존재하지만 아무것도 검사하지 않고, 인스턴스가 VPC Resolver 대신 외부 DNS(8.8.8.8이나 DoH)를 직접 쓰면 DNS Firewall은 그 질의를 보지 못한다. **"규칙이 맞는가"보다 "트래픽이 이 통제를 반드시 지나는가"를 먼저 확인하라**는 원칙이 이 주 내내 반복되는 이유다.

> ⚠️ **함정**: 위 표의 마지막 행에서 파생되는 실무 함정이 있다. DNS Firewall을 배포한 뒤 반드시 **VPC 밖으로 나가는 53번 포트(UDP/TCP)와 DoH(443)를 통제**해야 우회를 막을 수 있다. 워크로드가 외부 공개 DNS를 직접 질의하면 Resolver를 거치지 않으므로 도메인 차단이 통째로 무력화된다. 그래서 "DNS Firewall로 악성 도메인 차단"이 정답인 문제의 완성형 답에는 대개 **"외부 DNS로의 직접 질의를 Security Group/Network Firewall로 차단"**이 함께 붙는다. 통제 하나를 켜는 것으로 끝나는 문제는 시험에도 실무에도 거의 없다.

## Stateful 규칙: Suricata와 두 가지 평가 순서

Stateful 규칙 그룹은 Suricata 규칙 문법을 직접 받거나(rules string), 도메인 리스트/표준 패턴으로 정의한다. 평가 순서 옵션이 중요하다:
- **Default order(action order)**: pass → drop → alert 우선순위로 평가(Suricata 기본과 다름).
- **Strict order**: 규칙을 정의된 순서대로 평가하고, 정책 레벨의 기본 stateful 액션(`aws:drop_established` 등)을 명시 — *화이트리스트(default-deny)* 구성에 적합.

```
# Suricata: example.com으로의 HTTP/TLS 아웃바운드만 허용(나머지 drop)
pass tls $HOME_NET any -> $EXTERNAL_NET any (tls.sni; content:"example.com"; nocase; sid:1001;)
pass http $HOME_NET any -> $EXTERNAL_NET any (http.host; content:"example.com"; sid:1002;)
drop tcp $HOME_NET any -> $EXTERNAL_NET any (msg:"deny other egress"; sid:1003;)
```

도메인 필터링은 평문 SNI(TLS ClientHello) 또는 HTTP Host 헤더를 본다. 그래서 **암호화되지 않은 SNI에 의존**한다 — ECH(Encrypted Client Hello)나 도메인 프론팅을 쓰면 SNI 기반 필터를 우회할 수 있다는 한계를 알아야 한다.

### 평가 순서를 고르는 일이 곧 보안 모델을 고르는 일

두 평가 순서의 차이는 단순한 설정 옵션이 아니라 **어떤 보안 모델을 채택하는가**의 선언이다.

| 항목 | Default order(action order) | Strict order |
|------|------------------------------|--------------|
| 평가 방식 | 액션 종류로 우선순위 결정(pass → drop → alert) | **작성한 순서 그대로** 위에서 아래로 |
| 규칙 순서의 의미 | 순서를 바꿔도 결과가 같음 | 순서가 결과를 바꿈 |
| 기본 stateful 액션 | 매칭 없으면 통과 | `aws:drop_established`·`aws:drop_strict` 등을 정책에 지정 가능 |
| 적합한 모델 | 블랙리스트(알려진 나쁜 것만 차단) | **화이트리스트(허용한 것 외 전부 차단)** |
| 전형적 용도 | 위협 시그니처 IPS | 아웃바운드 도메인 허용 목록 |

아웃바운드를 승인된 도메인으로만 제한하는 요구가 나오면 **Strict order + 기본 drop**이 정답의 뼈대다. Default order로 화이트리스트를 만들려고 하면, 마지막에 둔 "나머지 전부 drop" 규칙이 액션 우선순위 때문에 의도대로 동작하지 않는 상황을 만난다. 규칙을 아무리 정교하게 써도 *평가 모델이 틀리면 결과가 틀린다.*

```json
{
  "FirewallPolicyName": "egress-allowlist",
  "FirewallPolicy": {
    "StatelessDefaultActions": ["aws:forward_to_sfe"],
    "StatelessFragmentDefaultActions": ["aws:forward_to_sfe"],
    "StatefulEngineOptions": {
      "RuleOrder": "STRICT_ORDER",
      "StreamExceptionPolicy": "DROP"
    },
    "StatefulDefaultActions": [
      "aws:drop_established",
      "aws:alert_established"
    ],
    "StatefulRuleGroupReferences": [
      { "ResourceArn": "arn:aws:network-firewall:ap-northeast-2:111122223333:stateful-rulegroup/allowed-domains", "Priority": 100 },
      { "ResourceArn": "arn:aws:network-firewall:ap-northeast-2:111122223333:stateful-rulegroup/ips-signatures", "Priority": 200 }
    ]
  }
}
```

`StatelessDefaultActions`의 `aws:forward_to_sfe`가 핵심이다 — "stateless 단계에서 판정하지 말고 전부 stateful 엔진으로 넘겨라"는 뜻이다. 여기서 `aws:pass`를 쓰면 패킷이 stateless 단계에서 통과 확정되어 **stateful 규칙이 아예 실행되지 않는다.** 도메인 허용 목록을 정성껏 만들어 놓고도 차단이 안 되는 두 번째로 흔한 원인이 이것이다(첫 번째는 라우팅 누락).

> ⚠️ **함정**: `StreamExceptionPolicy`도 시험 관점에서 의미가 있다. 방화벽이 흐름의 일부만 보게 되는 예외 상황(엔드포인트 교체, 비대칭 라우팅으로 중간부터 보이는 흐름 등)에서 그 트래픽을 어떻게 처리할지 정한다. 보안을 우선하면 `DROP`, 가용성을 우선하면 통과시킨다. **"불확실할 때 어떻게 할 것인가"를 명시적으로 정해 두는 것**은 방화벽 설계의 기본 위생이며, 기본값에 맡겨 두면 사고 조사 때 "왜 이 트래픽이 통과했는지" 설명할 수 없게 된다.

> ⚠️ **함정**: Network Firewall의 도메인 필터링은 *방화벽 통과 트래픽*에만 적용된다. 라우팅으로 트래픽을 firewall endpoint로 보내지 않으면 검사 자체가 일어나지 않는다. "도메인 허용 리스트를 만들었는데 차단이 안 된다"의 흔한 원인은 라우트 테이블이 트래픽을 firewall subnet으로 향하게 하지 않은 것이다.

## 라우팅: 트래픽을 검사기로 강제 통과

검사가 일어나려면 *대칭(symmetric) 라우팅*으로 인바운드·아웃바운드 트래픽이 모두 firewall endpoint를 지나야 한다. 단일 VPC의 전형적 배치(distributed deployment):

```
[Workload subnet] --(0.0.0.0/0 → firewall endpoint)--> [Firewall subnet]
                                                              │
                                                       [IGW route table]
                                                  (subnet CIDR → firewall endpoint)
IGW의 edge association(ingress routing)으로
인바운드도 firewall을 거치게 함
```

핵심: workload subnet의 기본 라우트를 firewall endpoint로, IGW(또는 NAT)로 향하는 경로 사이에 firewall subnet을 끼워 넣는다. IGW 쪽에는 **ingress routing(edge association)**으로 반환·인바운드 트래픽도 검사기로 보낸다. 비대칭 라우팅이면 stateful 검사가 깨진다.

라우트 테이블을 실제 항목 단위로 펼치면 이렇게 된다. 세 개의 테이블이 서로를 가리키며 트래픽을 "ㄹ" 자로 접는 구조다.

```
[ 단일 VPC 분산 배치 — 라우트 테이블 3종 세트 ]

VPC 10.0.0.0/16
├─ Workload subnet 10.0.1.0/24 ── RT-Workload
│     0.0.0.0/0        → vpce-fw-az-a   (firewall endpoint)
│     10.0.0.0/16      → local
│
├─ Firewall subnet 10.0.2.0/24 ── RT-Firewall
│     0.0.0.0/0        → igw-xxxx
│     10.0.0.0/16      → local
│
└─ IGW edge association ──────── RT-Ingress   ※ IGW에 붙이는 라우트 테이블
      10.0.1.0/24      → vpce-fw-az-a   (돌아오는 트래픽도 검사기로)

[ 패킷의 여정 — 나갈 때와 들어올 때가 대칭이어야 한다 ]

  아웃바운드:  EC2 → RT-Workload → 방화벽 검사 → RT-Firewall → IGW → 인터넷
  인바운드:    인터넷 → IGW → RT-Ingress → 방화벽 검사 → EC2

  ※ RT-Ingress를 빼먹으면 나갈 때만 검사되고 돌아올 때는 검사기를 건너뛴다.
    stateful 엔진은 흐름의 절반만 보게 되어 연결 추적이 깨진다.
  ※ AZ마다 firewall endpoint가 따로 있다. AZ-a의 워크로드는 반드시
    AZ-a의 endpoint를 가리켜야 한다 — AZ를 교차하면 비대칭 + 교차 AZ 요금.
```

> ⚠️ **함정**: firewall subnet에는 **워크로드를 배치하면 안 된다.** 이 서브넷은 방화벽 엔드포인트 전용이며, 여기에 EC2를 두면 그 트래픽은 검사를 받지 않고 나간다(자기 서브넷의 라우트가 곧장 IGW를 향하므로). 또한 방화벽을 삭제할 때 **삭제 보호(delete protection)와 서브넷 변경 보호**가 켜져 있으면 실패한다 — 이는 실수로 방화벽을 지워 통제가 사라지는 사고를 막는 안전장치이므로, 운영 환경에서는 켜 두는 것이 정석이다.

## 중앙 집중식 검사 VPC: 허브 앤 스포크

계정·VPC가 많아지면 VPC마다 방화벽을 두는 분산 배치는 운영·비용이 비효율적이다. **Transit Gateway** 또는 **VPC Lattice**를 허브로 두고, 전용 **inspection VPC**(중앙 검사 VPC)에 Network Firewall를 배치해 모든 East-West(VPC 간)·North-South(인터넷) 트래픽을 한 곳에서 검사한다.

```
[ 중앙 검사 VPC — 트래픽이 실제로 흐르는 순서 ]

  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
  │  App VPC    │        │  Data VPC   │        │ Egress VPC  │
  │ 10.1.0.0/16 │        │ 10.2.0.0/16 │        │  (NAT/IGW)  │
  └──────┬──────┘        └──────┬──────┘        └──────┬──────┘
         │ attachment           │ attachment           │ attachment
         └───────────┬──────────┴──────────┬───────────┘
                     │                     │
              ┌──────▼─────────────────────▼──────┐
              │        Transit Gateway            │
              │  ┌─────────────────────────────┐  │
              │  │ Spoke RT: 0.0.0.0/0 →       │  │
              │  │           Inspection attach │  │  ← 스포크는 서로를 직접 못 봄
              │  ├─────────────────────────────┤  │
              │  │ Inspection RT: 각 VPC CIDR →│  │
              │  │           해당 VPC attach   │  │  ← 검사 후 원래 목적지로
              │  └─────────────────────────────┘  │
              └──────────────┬────────────────────┘
                             │ attachment (appliance mode = ON)
                    ┌────────▼─────────┐
                    │ Inspection VPC   │
                    │  ┌────────────┐  │
                    │  │ NFW AZ-a   │  │
                    │  │ NFW AZ-b   │  │  ← AZ별 엔드포인트로 이중화
                    │  └────────────┘  │
                    └──────────────────┘

[ East-West 흐름 예: App VPC → Data VPC ]
  1. App VPC → TGW (스포크 RT의 0.0.0.0/0)
  2. TGW → Inspection VPC attachment
  3. Network Firewall 검사 (stateful 규칙 평가)
  4. Inspection VPC → TGW
  5. TGW → Data VPC (inspection RT의 10.2.0.0/16 경로)
  ※ 응답은 정확히 역순으로 같은 AZ의 같은 엔드포인트를 통과해야 한다
    → 이를 보장하는 것이 appliance mode.

[ 두 개의 라우팅 도메인을 나누는 이유 ]
  스포크 RT와 인스펙션 RT를 분리하지 않으면
  TGW가 "검사 끝난 트래픽"을 다시 검사기로 보내 무한 루프가 생긴다.
```

TGW의 **appliance mode**를 활성화해야 한다 — 같은 흐름의 패킷이 항상 동일 firewall endpoint(같은 AZ)로 가도록 보장해 stateful 검사의 대칭성을 유지한다. appliance mode 없이는 흐름이 AZ를 가로질러 비대칭이 되며 stateful 규칙이 오작동한다.

> 🎯 **시나리오**: "50개 계정의 모든 VPC 간·인터넷 트래픽을 중앙에서 IPS로 검사"는 시험 빈출 아키텍처다. 정답 패턴: Transit Gateway 허브 + 전용 inspection VPC에 Network Firewall + TGW appliance mode 활성화 + Firewall Manager로 정책 중앙 배포. VPC마다 방화벽을 두는 분산 배치는 "운영 단순화·중앙 관리" 요구에 맞지 않는다.

> 💡 **관련 이론**: 중앙 검사 VPC는 네트워크 보안의 *choke point(병목 통제점)* 패턴이다. 모든 트래픽이 반드시 통과하는 단일 지점을 만들어 정책을 일관되게 적용하고 가시성을 확보한다. 트레이드오프는 명확하다 — 단일 통제점은 관리가 쉽지만 가용성·성능의 병목이자 단일 장애점이 될 수 있어, AZ별 다중 endpoint로 분산·이중화해야 한다.

### 배포와 감사에 쓰는 명령들

```bash
# 1) 도메인 허용 목록을 규칙 그룹으로 생성 (관리형 도메인 리스트 형식)
aws network-firewall create-rule-group \
  --rule-group-name allowed-domains \
  --type STATEFUL --capacity 100 \
  --rule-group '{
    "RulesSource": {
      "RulesSourceList": {
        "Targets": ["example.com", ".amazonaws.com", "repo.internal.example"],
        "TargetTypes": ["TLS_SNI", "HTTP_HOST"],
        "GeneratedRulesType": "ALLOWLIST"
      }
    }
  }'

# 2) Suricata 원문으로 IPS 규칙 그룹 생성 (파일에서 읽어 IaC로 관리)
aws network-firewall create-rule-group \
  --rule-group-name ips-signatures \
  --type STATEFUL --capacity 1000 \
  --rule-group file://ips-rulegroup.json

# 3) 정책에 규칙 그룹 연결 + STRICT_ORDER 적용
aws network-firewall update-firewall-policy \
  --firewall-policy-name egress-allowlist \
  --update-token <get-firewall-policy로 받은 토큰> \
  --firewall-policy file://policy.json

# 4) 방화벽이 어느 서브넷에 어떤 엔드포인트를 만들었는지 확인
#    ← 라우트 테이블에 넣을 vpce-id를 여기서 얻는다
aws network-firewall describe-firewall --firewall-name prod-inspection \
  --query 'FirewallStatus.SyncStates'

# 5) 운영 중 안전장치 확인·설정
aws network-firewall update-firewall-delete-protection \
  --firewall-name prod-inspection --delete-protection

# 6) 로깅 구성 — alert와 flow를 서로 다른 목적지로 보낼 수 있다
aws network-firewall update-logging-configuration \
  --firewall-name prod-inspection \
  --logging-configuration '{
    "LogDestinationConfigs": [
      {"LogType":"ALERT","LogDestinationType":"CloudWatchLogs","LogDestination":{"logGroup":"/aws/nfw/alert"}},
      {"LogType":"FLOW","LogDestinationType":"S3","LogDestination":{"bucketName":"nfw-flow-logs","prefix":"prod/"}}
    ]
  }'
```

`describe-firewall`의 `SyncStates`를 읽는 습관은 실무에서 특히 중요하다. 방화벽 생성은 비동기이며, AZ별 엔드포인트가 준비되기 전에 라우트를 걸면 트래픽이 블랙홀에 빠진다. **엔드포인트 ID를 확인한 뒤 라우팅을 바꾸는 순서**를 지켜야 한다.

### 규칙 튜닝: alert로 먼저 보고, drop으로 나중에 막는다

Network Firewall에서도 1일차 WAF와 같은 절차가 성립한다. Suricata 규칙의 액션을 처음부터 `drop`으로 두면, 몰랐던 정상 통신(패키지 저장소, 벤더 API, 텔레메트리)이 한꺼번에 끊겨 장애가 난다.

```
[ 아웃바운드 허용 목록을 안전하게 도입하는 순서 ]

1) 전면 alert 모드
   alert tls $HOME_NET any -> $EXTERNAL_NET any (tls.sni; content:"."; sid:9001;)
   → 차단 0건. 어떤 도메인으로 나가고 있는지 목록을 수집한다.
        │
2) alert 로그 집계 (CloudWatch Logs Insights / Athena)
   fields tls.sni | stats count() by tls.sni | sort count desc
   → "우리가 실제로 어디로 나가는가"의 실측 목록 확보
        │
3) 목록을 검토해 허용 대상 선별
   업무상 필요  → ALLOWLIST 규칙 그룹에 추가
   정체 불명    → 소유 팀에 확인. 확인 안 되면 허용하지 않는다.
        │
4) STRICT_ORDER + 기본 drop 으로 전환하되, 먼저 일부 서브넷/계정에만 적용
   → 폭발 반경을 줄인 상태로 실제 차단을 관찰
        │
5) 전체 확대 + 회귀 감시
   alert 로그에서 "새로 차단된 도메인"을 상시 감시해
   업무 영향과 신규 위협을 모두 조기에 포착
```

> 🎯 **시나리오**: "아웃바운드 도메인 허용 목록을 적용했더니 배포 파이프라인과 일부 애플리케이션이 동시에 실패했다. 서비스를 복구하면서도 보안 통제는 유지해야 한다"가 나오면, 정답의 형태는 **정책을 통째로 끄는 것이 아니라 alert 로그로 차단된 도메인을 식별해 필요한 것만 허용 목록에 추가하는 것**이다. "규칙 그룹을 정책에서 제거한다", "기본 액션을 pass로 바꾼다"는 보기는 통제를 통째로 잃으므로 오답이다. 여기서도 **가장 좁은 예외**가 정답의 원리다.

## Route 53 Resolver DNS Firewall: 질의 계층 통제

Network Firewall가 패킷·세션을 본다면, **DNS Firewall**는 VPC 내부에서 발생하는 *DNS 질의*를 Route 53 Resolver 단계에서 필터링한다. 도메인 이름 기준으로 질의를 ALLOW / BLOCK / ALERT 한다.

- **Domain list**: 차단·허용할 도메인 목록(직접 정의하거나 AWS 관리형 목록 사용).
- **AWS Managed Domain Lists**: `AWSManagedDomainsMalwareDomainList`, `AWSManagedDomainsBotnetCommandandControl`, `AWSManagedDomainsAggregateThreatList` 등 위협 인텔 기반 목록.
- **Block 응답 방식**: `NODATA`, `NXDOMAIN`, 또는 지정 IP로의 `OVERRIDE`.
- **Rule group**을 VPC에 연결하고 규칙 우선순위로 평가.

```bash
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-abc \
  --firewall-domain-list-id rslvr-fdl-malware \
  --priority 100 --action BLOCK --block-response NXDOMAIN \
  --name block-malware-domains
```

DNS Firewall의 강력한 용도는 **DNS exfiltration(DNS 터널링) 차단**이다. 멀웨어가 데이터를 DNS 질의의 서브도메인에 인코딩해 외부로 빼내는 공격을, 알려진 C2 도메인 차단과 비정상 질의 패턴 알림으로 방어한다.

```bash
# 규칙 그룹 생성 → 규칙 추가 → VPC에 연결, 세 단계로 배포한다
aws route53resolver create-firewall-rule-group --name corp-dns-guard

# 자체 도메인 목록(내부 정책상 금지 도메인 등)
aws route53resolver create-firewall-domain-list --name blocked-corp
aws route53resolver update-firewall-domains \
  --firewall-domain-list-id rslvr-fdl-abc \
  --operation ADD \
  --domains "*.example-file-share.com" "*.dyn-dns-example.net"

# AWS 관리형 위협 목록을 최우선 순위로
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-abc \
  --firewall-domain-list-id rslvr-fdl-aws-malware \
  --priority 10 --action BLOCK --block-response NXDOMAIN \
  --name block-known-malware

# 사내 정책 목록은 그 다음
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-abc \
  --firewall-domain-list-id rslvr-fdl-abc \
  --priority 20 --action BLOCK --block-response NODATA \
  --name block-corp-policy

# VPC에 연결해야 비로소 적용된다 (연결 누락이 가장 흔한 실수)
aws route53resolver associate-firewall-rule-group \
  --firewall-rule-group-id rslvr-frg-abc \
  --vpc-id vpc-0abc123 \
  --priority 101 --name prod-vpc-assoc
```

**Block 응답 방식의 선택**도 의미가 있다. `NXDOMAIN`은 "그런 도메인 없음"이라 클라이언트가 즉시 포기하지만, 공격자에게 "여기 필터가 있다"는 신호를 주지 않는 편은 아니다. `OVERRIDE`로 싱크홀 IP를 응답하면 **어느 인스턴스가 악성 도메인을 찾았는지 그 IP로의 연결 시도를 통해 역추적**할 수 있다 — 차단과 동시에 감염 호스트를 식별하는 고전적 기법이다. 탐지가 목적이면 `ALERT`로 두어 통과시키면서 기록만 남긴다.

| 응답 방식 | 클라이언트가 보는 것 | 장점 | 쓰는 상황 |
|-----------|---------------------|------|-----------|
| `NXDOMAIN` | 도메인 없음 | 즉시 실패, 재시도 감소 | 명확한 악성 도메인 |
| `NODATA` | 레코드 없음 | 도메인 존재는 인정 | 정책상 금지(업무 무관 서비스) |
| `OVERRIDE` | 지정 IP(싱크홀) | **감염 호스트 역추적 가능** | 침해 조사·격리 병행 |
| `ALERT`(액션) | 정상 응답 | 영향 없이 관측만 | 도입 초기 튜닝 |

> 📚 **사례**: 2020년 12월 공개된 SolarWinds Orion 공급망 침해는 DNS 계층 통제의 가치를 가장 선명하게 보여 준 사건이다. 침입자가 심어 둔 백도어는 곧바로 외부와 통신하지 않고, 감염 환경의 정보를 **DNS 질의의 서브도메인에 인코딩해** 특정 도메인으로 보내는 방식으로 1차 신호를 냈다. HTTP 트래픽만 감시하던 조직에서는 이 통신이 "정상적인 DNS 조회"로 보였다. 여기서 얻을 교훈이 셋이다. 첫째, **DNS는 거의 모든 환경에서 허용된 프로토콜이므로 공격자에게 가장 매력적인 은닉 통로**다. 둘째, 그래서 **DNS 질의 로그는 방화벽 로그만큼 중요한 탐지 자산**이며, Resolver query log를 켜 두지 않으면 사후에 조사할 근거 자체가 없다. 셋째, 이 유형의 통신은 시그니처가 아니라 **패턴**(비정상적으로 긴 서브도메인, 높은 고유 질의 비율, 한 도메인에 대한 대량의 서로 다른 하위 이름)으로 드러나므로, 차단 목록과 별개로 **행위 기반 탐지(GuardDuty의 DNS 관련 탐지 등)를 함께 두어야 한다.**

> ⚠️ **함정**: DNS Firewall 규칙 그룹은 **VPC에 연결(associate)해야 적용된다.** 규칙 그룹을 만들고 규칙까지 넣었는데 차단이 안 되는 경우, 열에 아홉은 VPC 연결 누락이다. 또한 한 VPC에 여러 규칙 그룹을 연결하면 **연결 시 지정한 priority 순서**로 평가되고, 그룹 *안*에서는 규칙의 priority로 평가된다 — WAF와 마찬가지로 두 층의 우선순위가 존재한다. 그리고 DNS Firewall은 **VPC Resolver를 경유하는 질의에만** 적용되므로, 인스턴스가 `/etc/resolv.conf`를 고쳐 외부 DNS를 직접 보게 되면 통째로 우회된다.

> 🔍 **더 깊이**: Network Firewall의 SNI/도메인 필터링과 DNS Firewall는 *계층이 다르다*. DNS Firewall는 "이름 해석" 단계에서 막아, 악성 도메인의 IP를 아예 못 받게 한다. Network Firewall는 "연결 시도" 단계에서 막아, IP를 알아도 그 연결을 차단한다. 둘은 보완적이다 — DNS를 우회해 직접 IP로 접속하는 멀웨어는 DNS Firewall를 통과하지만 Network Firewall stateful 규칙(IP/도메인)에 걸린다. 심층 방어(defense in depth)의 전형이다.

## Network Firewall vs Gateway Load Balancer 어플라이언스

서드파티 방화벽(Palo Alto, Fortinet 등)을 VPC에 끼우려면 **Gateway Load Balancer(GWLB)** + GENEVE 인캡슐레이션을 쓴다. AWS Network Firewall는 이런 어플라이언스를 직접 운영할 필요 없는 *관리형* 대안이다. "관리 부담 없이 IPS/도메인 필터링" 요구면 Network Firewall, "특정 벤더 어플라이언스를 투명하게 삽입" 요구면 GWLB가 정답이다.

| 항목 | AWS Network Firewall | Gateway Load Balancer + 어플라이언스 |
|------|----------------------|--------------------------------------|
| 검사 엔진 | AWS 관리형(Suricata 호환) | **벤더 제품**(NGFW, IDS/IPS, DPI 등) |
| 운영 부담 | 없음(패치·확장·HA를 AWS가) | AMI 수명주기·라이선스·확장·HA를 직접 |
| 규칙 자산 | Suricata 규칙, 관리형 위협 시그니처 | **기존 온프레미스 정책을 그대로 이식 가능** |
| 트래픽 전달 | 라우팅으로 엔드포인트 통과 | GWLB 엔드포인트 + **GENEVE 캡슐화** |
| TLS 복호화 | 지원(TLS inspection 구성 필요) | 벤더 기능에 의존(대개 지원) |
| 확장 | 자동 | 어플라이언스 Auto Scaling 그룹을 직접 설계 |
| 적합한 상황 | AWS 네이티브로 빠르게 IPS·도메인 통제 | **규제·감사 요구로 특정 벤더 제품이 지정된 경우**, 온프레미스와 정책 통일 |

> 🎯 **시나리오**: "규제 기관이 인증한 특정 벤더의 차세대 방화벽을 반드시 사용해야 하고, 온프레미스와 동일한 정책을 클라우드에도 적용해야 한다"가 나오면 정답은 **GWLB + 벤더 어플라이언스**다. 반대로 "운영 인력을 늘리지 않고 아웃바운드 도메인 통제와 IPS를 적용하고 싶다"면 Network Firewall이다. 두 선지가 함께 나오면 판단 기준은 기술 성능이 아니라 **"벤더가 지정되어 있는가, 운영 부담을 질 수 있는가"** 두 가지다.

> 🔍 **더 깊이**: 두 방식은 배타적이지 않고 실제로는 겹쳐 쓰는 조직이 많다. North-South(인터넷 경계)는 규제 때문에 벤더 어플라이언스로, East-West(VPC 간)는 비용과 운영 부담 때문에 Network Firewall로 나누는 식이다. 이때 반드시 확인해야 할 것이 **트래픽이 두 검사기를 거치는 순서와 대칭성**이다. 검사기를 두 겹 쌓으면 라우팅 복잡도가 곱으로 늘고, 어느 한쪽에서 비대칭이 발생하면 그쪽 stateful 엔진만 조용히 오작동한다. 통제를 더하는 것이 언제나 안전을 더하는 것은 아니며, **검증할 수 없는 복잡도는 그 자체가 위험**이다.

## 로깅

Network Firewall는 **flow log**(연결 메타데이터)와 **alert log**(stateful 규칙 매칭·IPS 경보)를 CloudWatch Logs/S3/Firehose로 보낸다. DNS Firewall는 Resolver query log로 차단·허용된 질의를 기록한다. 두 로그 모두 포렌식·튜닝의 1차 근거이며, GuardDuty와 함께 위협 탐지의 신호원이 된다.

| 로그 | 무엇이 담기나 | 주된 용도 | 흔한 실수 |
|------|---------------|-----------|-----------|
| NFW **flow log** | 5-tuple, 바이트·패킷 수, 시작·종료 | 통신 관계 파악, 용량 산정 | 전량 수집 시 비용 급증 |
| NFW **alert log** | 매칭된 sid·메시지·SNI·액션 | **규칙 튜닝, IPS 정확도 검증** | alert 규칙을 안 써서 로그가 비어 있음 |
| Resolver **query log** | 질의 이름·타입·응답, 소스 인스턴스 | DNS 터널링 탐지, 감염 호스트 추적 | 켜지 않아 사후 조사 불가 |
| VPC **flow log** | ENI 단위 허용/거부 메타데이터 | 서브넷·SG 수준 트러블슈팅 | NFW 로그와 혼동 |

이 네 가지를 구분하는 감각이 실무에서 시간을 크게 아낀다. "왜 차단됐는가"는 **alert log**가 답하고, "누가 누구와 통신했는가"는 flow log가 답하며, "어떤 이름을 찾았는가"는 query log가 답한다. 사고 조사에서 엉뚱한 로그를 뒤지느라 시간을 보내는 일이 흔한데, **질문의 종류가 로그의 종류를 결정한다**고 기억해 두면 된다.

## 정리하며

오늘의 두 서비스는 "VPC 안에서 나가는 트래픽을 어떻게 통제할 것인가"라는 하나의 질문에 서로 다른 계층에서 답한다.

**Network Firewall**은 연결 자체를 본다. Suricata 규칙으로 TLS SNI·HTTP Host를 읽어 도메인을 통제하고, 시그니처로 침입을 탐지한다. 그러나 이 모든 능력은 **트래픽이 firewall endpoint를 지날 때만** 발휘되므로, 이 서비스의 절반은 규칙이고 나머지 절반은 라우팅이다. 시험에서 "규칙은 맞는데 차단이 안 된다"는 상황이 나오면 답은 거의 항상 라우팅이거나 `aws:forward_to_sfe` 누락이다.

**DNS Firewall**은 이름 해석을 본다. 연결이 시작되기도 전에, 심지어 목적지 IP를 알기도 전에 막을 수 있다는 것이 강점이고, VPC Resolver를 우회하면 무력해진다는 것이 약점이다. 그래서 DNS Firewall은 언제나 "외부 DNS 직접 질의 차단"과 짝을 이뤄야 완성된다.

**중앙 검사 VPC**는 이 통제들을 조직 규모로 확장하는 형태다. TGW 허브 + 전용 inspection VPC + appliance mode + 라우팅 도메인 분리, 이 네 가지가 한 세트로 움직인다. 하나라도 빠지면 비대칭이나 라우팅 루프로 조용히 망가지며, 조용히 망가진다는 점이 가장 위험하다 — 방화벽은 살아 있는데 아무것도 검사하지 않는 상태가 될 수 있기 때문이다.

마지막으로 오늘 반복해서 나온 운영 원칙 하나를 다시 적어 둔다. **먼저 관측(alert/Count)하고, 데이터로 예외를 좁게 설계한 뒤, 차단으로 전환한다.** WAF에서도, Shield 자동 완화에서도, Network Firewall에서도 같은 절차가 정답이었다. 서비스는 달라도 통제를 운영하는 방법은 하나다.

---

## 📝 연습 문제

**문제 1.** AWS Network Firewall에서 stateless 규칙 그룹과 stateful 규칙 그룹의 차이로 옳은 것은?

A) stateless는 연결 상태를 추적하고, stateful은 패킷 단위로만 본다  
B) stateless는 5-tuple로 패킷을 독립 평가(연결 미추적)하고, stateful은 연결·세션을 추적하며 Suricata 규칙으로 도메인·시그니처 검사를 한다  
C) 둘 다 동일하며 성능 차이만 있다  
D) stateful은 인바운드만, stateless는 아웃바운드만 검사한다  

**정답: B**  
해설: stateless 규칙 그룹은 각 패킷을 5-tuple(소스/대상 IP·포트, 프로토콜)로 독립 평가해 빠른 pass/drop/forward를 수행하며 연결 상태를 추적하지 않는다. stateful 규칙 그룹은 연결 테이블을 유지하고 Suricata 호환 규칙으로 SNI/Host 도메인, 프로토콜 이상, IPS 시그니처를 검사한다. 상태 추적 주체가 반대로 서술되거나 방향을 한정한 보기는 틀렸다.

---

**문제 2.** 도메인 허용 리스트(`example.com`만 아웃바운드 허용)를 stateful 규칙으로 만들었는데 다른 도메인이 여전히 나간다. 가장 가능성 높은 원인은?

A) Suricata 문법 오류  
B) workload subnet의 라우트 테이블이 트래픽을 firewall endpoint로 보내지 않아 검사 자체가 일어나지 않음  
C) DNS Firewall이 비활성화됨  
D) WCU 부족  

**정답: B**  
해설: Network Firewall는 firewall endpoint를 통과하는 트래픽만 검사한다. 라우트 테이블이 workload subnet의 트래픽을 firewall subnet으로 향하게 하지 않으면 규칙이 아무리 정확해도 검사가 일어나지 않는다. 흔한 실수가 바로 라우팅 누락이다. 문법 오류라면 규칙 배포가 실패하고, DNS Firewall는 다른 계층이며, WCU는 WAF 개념이다.

---

**문제 3.** Transit Gateway 허브와 중앙 inspection VPC로 모든 VPC 간 트래픽을 Network Firewall로 검사하려 한다. stateful 검사가 깨지지 않게 하려면 반드시 필요한 TGW 설정은?

A) ECMP 비활성화  
B) appliance mode 활성화 — 같은 흐름의 패킷이 항상 동일 AZ의 firewall endpoint로 가도록 보장  
C) DNS 지원 비활성화  
D) MTU를 9001로 설정  

**정답: B**  
해설: TGW appliance mode는 한 연결 흐름의 양방향 패킷이 항상 동일 AZ의 어플라이언스(firewall endpoint)로 라우팅되도록 해 대칭성을 보장한다. 이게 없으면 흐름이 AZ를 가로질러 비대칭이 되고, 연결 상태를 추적하는 stateful 검사가 응답 패킷을 알아보지 못해 오작동한다. ECMP·DNS·MTU 설정은 stateful 대칭성과 직접 관련이 없다.

---

**문제 4.** 멀웨어가 데이터를 DNS 질의의 서브도메인에 인코딩해 외부로 유출(DNS exfiltration)하는 것을 막으려 한다. 가장 적절한 서비스·기능은?

A) Security Group으로 53번 포트 차단  
B) Route 53 Resolver DNS Firewall로 알려진 악성/C2 도메인을 BLOCK하고 비정상 질의를 ALERT  
C) CloudFront OAC  
D) NACL 인바운드 거부  

**정답: B**  
해설: DNS Firewall는 VPC 내부의 DNS 질의를 Resolver 단계에서 도메인 기준으로 필터링하며, AWS 관리형 악성·봇넷 C2 도메인 목록 차단과 알림으로 DNS 터널링/exfiltration을 완화한다. 53번 포트를 전면 차단하면 정상 DNS도 막혀 서비스가 깨지고, OAC·NACL은 DNS 질의 내용 기반 통제가 아니다.

---

**문제 5.** 관리 부담 없이 VPC 아웃바운드 트래픽에 IPS(침입 방지)와 도메인 필터링을 적용하려 한다. 서드파티 어플라이언스 운영은 피하고 싶다. 가장 적절한 선택은?

A) Gateway Load Balancer + 서드파티 방화벽 어플라이언스  
B) AWS Network Firewall(관리형 stateful 규칙으로 IPS·도메인 필터링)  
C) Security Group 규칙만 강화  
D) AWS WAF를 VPC에 직접 연결  

**정답: B**  
해설: AWS Network Firewall는 관리형 서비스로, Suricata 호환 stateful 규칙으로 IPS/IDS와 SNI/Host 도메인 필터링을 어플라이언스 운영 부담 없이 제공한다. GWLB(A)는 서드파티 어플라이언스를 삽입할 때 쓰는 방식으로 운영 부담이 따른다. Security Group은 IP/포트 수준이라 IPS·도메인 필터링을 못 하고, WAF는 HTTP(L7) 애플리케이션용이라 VPC 일반 트래픽 검사에 직접 붙이는 통제가 아니다.

---
