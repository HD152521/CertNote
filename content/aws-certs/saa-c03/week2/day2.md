# Day 7 - IGW, NAT Gateway, Bastion: 인터넷과 사설망 사이의 다리들

VPC를 만들고 EC2를 띄우면 곧 마주치는 두 가지 욕구가 있다. "외부에서 SSH로 들어와 작업하고 싶다", "내 Private 인스턴스가 외부 API를 호출하고 싶다." 이 둘은 비슷해 보이지만 정반대 방향의 트래픽이고, AWS는 각각에 다른 솔루션을 준비해두었다. IGW와 NAT Gateway가 패킷의 흐름을, Bastion과 Session Manager가 운영자의 접근을 다룬다.

오늘의 주제는 "Private 인스턴스는 어떻게 외부와 안전하게 통신하는가", 그리고 "운영자는 어떻게 그 Private 인스턴스에 접근하는가" — 두 가지다. 두 질문은 패킷 방향이 정반대지만, 둘 다 "최소 노출 + 명시적 경로"라는 원칙을 공유한다.

## Internet Gateway: VPC의 외부 출입구

IGW(Internet Gateway)는 VPC에 부착되는 **수평 확장된, 가용성 높은, 무료** 게이트웨이다. 한 VPC에 하나만 붙일 수 있고, IGW가 있어야 비로소 VPC가 인터넷과 통신 가능해진다.

IGW가 하는 일은 두 가지다.

1. **NAT 변환**: Public IP를 가진 인스턴스의 패킷이 IGW를 지날 때, IGW가 인스턴스 Private IP ↔ Public IP 매핑을 해준다. 사용자가 손댈 필요 없는 1:1 NAT다.
2. **인바운드 허용**: IGW로 가는 라우팅이 있고 Public IP가 있는 인스턴스는 외부에서도 들어올 수 있다.

여기서 자주 헷갈리는 점: **IGW 자체가 패킷을 막거나 허용하지 않는다.** 보안은 SG/NACL이 담당. IGW는 그저 길을 열어주는 라우터다.

```
Public Subnet 인스턴스의 인터넷 통신:

10.0.0.5 (priv)   54.180.x.x (pub)
   ↓ outbound       ↑ inbound
[ Instance ]
   ↓
[ Subnet Route Table: 0.0.0.0/0 → igw-xxx ]
   ↓
[ IGW: 1:1 NAT (10.0.0.5 ↔ 54.180.x.x) ]
   ↓
Internet
```

> 🔍 **더 깊이**: IGW는 사실상 분산 SDN 컴포넌트로 구현된다. 물리적인 단일 장비가 아니라 AZ별 hyperplane 위에 분산되어 있어서 자동으로 HA를 가진다. AWS Hyperplane은 NAT Gateway, NLB, EFS, Lambda 등 다수의 AWS 네트워크 서비스의 기반이 되는 내부 SDN 플랫폼이다. 2017년 re:Invent에서 처음 공개되었고, 단일 흐름이 초당 수백만 패킷을 처리할 수 있다. AWS의 자체 Nitro 카드(특수 ASIC)가 호스트 노드에서 패킷 매핑·라우팅을 하드웨어 가속으로 처리하기 때문에, 일반 KVM/Xen 기반 가상화보다 네트워크 latency가 훨씬 낮다.

> 💡 **관련 이론**: SDN(Software Defined Networking)은 2008년 Stanford의 "Ethane" 프로젝트, OpenFlow 표준으로 시작된 패러다임으로, 컨트롤 플레인(라우팅 결정)과 데이터 플레인(패킷 전달)을 분리한다. AWS VPC는 SDN의 가장 큰 상용 구현체 중 하나다. 같은 기조로 Google의 Andromeda, Microsoft의 Azure Virtual Filtering Platform이 동작한다. SDN의 장점은 "라우팅을 코드로 표현"할 수 있다는 점이고, AWS Reachability Analyzer 같은 정형 검증 도구가 이 위에서만 가능해진다.

## NAT Gateway: 사설망의 아웃바운드 게이트

IGW는 양방향이지만, Private 인스턴스는 **outbound만** 원한다(예: yum update, npm install, API 호출). 이때 쓰는 게 NAT Gateway.

```
[ Private Subnet: 10.0.10.5 ]
       ↓
[ Subnet Route Table: 0.0.0.0/0 → nat-xxx ]
       ↓
[ NAT GW (Public Subnet, EIP 10.0.0.10 / 3.34.x.x) ]
       ↓
[ Public Subnet Route Table: 0.0.0.0/0 → igw-xxx ]
       ↓
Internet
```

핵심 포인트:

1. **NAT GW는 Public 서브넷에 위치**한다(자기 자신이 IGW 경로가 필요).
2. **EIP가 붙는다**(외부에서 보는 source IP).
3. **AZ 단위**다 — 한 NAT GW는 한 AZ에만 있다. HA를 원하면 AZ마다 만들어야 한다.
4. **stateful**이라 inbound 응답은 자동 통과, 새 inbound 요청은 차단.

### NAT Gateway vs NAT Instance

| 항목 | NAT Gateway | NAT Instance |
|------|------------|-------------|
| 관리 | AWS 관리, 무중단 | 자체 EC2 (패치/HA 책임) |
| 대역폭 | 5 Gbps → 100 Gbps 자동 | EC2 인스턴스 타입에 종속 |
| HA | AZ 내 자동 | ASG로 직접 구현 |
| 비용 | 시간당 + GB당 | EC2 비용 + 데이터 |
| 보안 그룹 | 사용 불가 | 사용 가능 |
| 포트 포워딩 | 불가 | 가능 |
| Bastion 역할 겸용 | 불가 | 가능 |

시험에서는 거의 항상 **NAT Gateway가 정답**이다. NAT Instance는 레거시. 2024년 기준 AWS도 NAT Instance를 더 이상 권장하지 않는다.

> ⚠️ **함정**: NAT GW는 **AZ 단위**다. AZ 한 곳에만 NAT GW를 두고 다른 AZ Private 서브넷의 라우팅을 거기로 보내면, 그 AZ가 죽을 때 다른 AZ까지 outbound가 막힌다. 게다가 cross-AZ traffic에 GB당 비용이 더 든다. 표준 패턴: **AZ마다 NAT GW 1개, 각 AZ Private 서브넷은 같은 AZ NAT GW로 라우팅**. 시험 단골 함정 그래서 "Multi-AZ NAT GW"가 답인 시나리오를 잘 보면 비용보다 가용성을 묻는 경우다.

> 📚 **사례**: 2021년 한 SaaS 회사가 단일 AZ NAT GW에 모든 Private 트래픽을 보내다 그 AZ에 장애가 나서 전체 outbound가 30분간 죽었다. 후속 조치로 AZ별 NAT GW + per-AZ 라우팅 테이블로 분리했다. 비용은 약 2배 늘었지만 RTO가 0이 됐다. 일반적으로 단일 AZ 절약은 사고 한 번이면 다 무너진다. 다른 사례로 2022년 한 게임 회사가 "Spot Instance + NAT GW 한 개" 조합으로 비용을 극단 절감하다가 Spot interruption + AZ 일시 throttling이 겹쳐 outbound 폭주가 발생한 일도 있다.

> 🔍 **더 깊이**: NAT Gateway는 **포트 변환(PAT, Port Address Translation)** 을 한다. 한 EIP가 최대 65,535개의 포트로 다수 인스턴스의 outbound 연결을 다중화한다. 그러나 같은 destination IP·port로 너무 많은 연결이 몰리면 **port allocation failure**가 발생한다. 한 destination에 최대 약 55,000 동시 연결이 한계. 해결책은 NAT GW를 여러 개 만들어 EIP를 늘리거나, destination별로 다른 NAT GW를 쓰는 것. 2021년부터 NAT GW에 secondary EIP를 여러 개 붙여 동일 NAT GW로도 포트 수를 늘릴 수 있게 됐다(EIP당 65k 포트).

> 💡 **관련 이론**: NAT의 stateful 특성은 RFC 5382(TCP NAT 동작), RFC 4787(UDP NAT 동작)으로 표준화되어 있다. NAT는 connection table을 유지하므로 inbound 응답 패킷을 자동으로 적절한 internal IP로 라우팅할 수 있다. 단 connection table에 항목이 추가될 때 OS resource를 쓰므로, DDoS connection 폭주 같은 상황에 약하다. 그래서 NAT GW 앞단에 AWS Shield Advanced나 Network Firewall을 둬야 진짜 방어가 된다.

## Bastion Host: 안전한 SSH 관문

Private 인스턴스에 SSH로 들어가려면? Public 서브넷에 한 대의 **Bastion(Jump Server)** 을 두고, 거기서 다시 Private 인스턴스로 점프한다. 전통적 패턴.

```
[ 운영자 PC ] → SSH → [ Bastion (Public) ] → SSH → [ Private EC2 ]
```

SG 설계의 핵심:

- **Bastion SG**: 인바운드 SSH(22) — 회사 IP 화이트리스트만.
- **Private EC2 SG**: 인바운드 SSH(22) — Bastion SG만 source로.

Bastion SG를 다른 SG의 source로 참조하는 게 베스트 프랙티스. IP 대역으로 묶으면 IP가 바뀔 때마다 다 고쳐야 하지만 SG 참조는 자동 추적된다.

> ⚠️ **함정**: Bastion에 너무 많은 권한을 두지 말 것. 운영자가 들어가서 다 할 수 있게 하면 Bastion 자체가 single point of compromise가 된다. 실무는 **명령어를 제한하는 SSH ProxyCommand + 세션 녹화 + 단명 Key**.

## Session Manager: Bastion 없는 시대

Systems Manager의 **Session Manager**는 Bastion 패턴을 거의 사용 안 해도 되게 만들었다. SSH 키도, 22 포트도 필요 없다. 인스턴스에 SSM Agent만 깔려 있고 IAM Role이 적절히 부여되면, AWS 콘솔이나 CLI로 즉시 shell을 띄울 수 있다.

```
운영자 → AWS API → SSM → SSM Agent → 인스턴스 shell
```

내부적으로는 인스턴스의 SSM Agent가 SSM 엔드포인트에 **outbound HTTPS**로 long-polling 한다. 운영자가 세션을 요청하면 그 connection 위로 양방향 채널이 열린다. 즉 **인바운드 22를 전혀 안 열어도 된다**.

| 항목 | Bastion + SSH | Session Manager |
|------|--------------|-----------------|
| 인바운드 포트 | 22 열려야 | 불필요 |
| SSH 키 관리 | 운영자 부담 | 불필요 |
| 감사 | sshd 로그 + 별도 도구 | CloudTrail + CloudWatch Logs 자동 |
| MFA 강제 | 별도 PAM 설정 | IAM 정책에서 강제 |
| 비용 | Bastion EC2 + 키 관리 | 추가 비용 없음 |
| Private 서브넷 접근 | Bastion 경유 | 직접 가능 |

시험에서 "보안적으로 가장 우수한 EC2 접근 방법"이 보이면 답은 거의 Session Manager.

> 💡 **관련 이론**: Session Manager의 outbound-only 모델은 **Zero Trust Network Access(ZTNA)** 의 한 사례다. BeyondCorp(Google, 2014)이 "내부 네트워크라고 안전한 게 아니다, 모든 접근은 인증·인가받아라"라는 모델을 제시했고, AWS Session Manager가 정확히 이를 구현한다. CISA Zero Trust Maturity Model(2021)에서도 인바운드 포트 제거를 권장한다. NIST SP 800-207(Zero Trust Architecture, 2020)도 같은 원칙을 명문화했다.

> 📚 **사례**: 2019년 한 핀테크가 Bastion 호스트에 SSH 22 포트를 회사 IP 대역만 허용했지만, 한 임직원의 노트북이 멀웨어 감염되면서 그 노트북을 경유한 공격자가 Bastion에 접근, 결국 Production DB에 도달했다. 사후 분석에서 Session Manager로 마이그레이션하면 이 경로가 처음부터 존재하지 않았을 거라는 결론. 현재 그 회사는 SSH 22 포트를 전 인프라에서 차단했다. 비슷한 사례로 2020년 SolarWinds 침해도 본질적으로는 "신뢰된 내부 경로"가 침해된 사례 — Zero Trust가 산업 전반의 표준 권장이 된 결정적 트리거다.

> 🔍 **더 깊이**: Session Manager는 KMS 암호화·VPC Endpoint·Run As(특정 OS 사용자로 실행)·세션 기록 등 기능이 풍부하다. 특히 VPC Endpoint를 통해 SSM에 접속하면 인스턴스가 IGW나 NAT GW 없이도 SSM 세션을 받을 수 있다 — 완전 격리된 Private 서브넷에서도 운영자 접근이 가능해진다. 이 패턴이 SAA에 자주 등장하는 "외부 인터넷 없이 EC2 접근" 시나리오의 답이다.

## EC2 Instance Connect

EC2 Instance Connect는 Session Manager와 또 다른 방식이다. SSH 공개키를 임시로(60초) 인스턴스에 푸시하고 그 시간 안에 SSH 연결하는 방식. SSH 자체는 22 포트가 열려 있어야 한다. 콘솔에서 "EC2 Instance Connect로 연결" 버튼이 그것.

| 비교 | SSH Key | EC2 Instance Connect | Session Manager |
|------|---------|---------------------|-----------------|
| 22 포트 필요 | 예 | 예 | 아니오 |
| 키 관리 | 영구 | 단명 (60초) | 불필요 |
| IAM 통합 | 없음 | 있음 | 강함 |
| Private 인스턴스 | Bastion 필요 | Bastion 또는 EIC Endpoint | 직접 가능 |

2023년 출시된 **EC2 Instance Connect Endpoint**는 EIC를 Bastion 없이 Private 인스턴스에 쓸 수 있게 해주는 PrivateLink 기반 솔루션이다. IAM 권한으로 접근 제어하고 트래픽은 모두 AWS 사설 네트워크를 거치므로, 인바운드 포트가 필요 없으면서 SSH 도구의 친숙함은 유지된다.

## VPC Reachability Analyzer

네트워크 디버깅이 잘 안 될 때 쓰는 도구. "Instance A에서 Instance B로 22 포트가 도달 가능한가?"를 물으면 라우팅, SG, NACL, IGW, NAT를 다 따라가며 어디서 막혔는지 알려준다. 운영 환경에서 SG·NACL이 누적되면 사람 머리로 따라가기 어려운데 이게 한 번에 해결한다.

> 🔍 **더 깊이**: Reachability Analyzer는 내부적으로 정형 검증 엔진 위에서 동작한다. 라우팅·SG·NACL·게이트웨이 같은 모든 네트워크 설정을 SMT(Satisfiability Modulo Theories) 제약으로 변환하고, "도달 가능한 경로가 존재하는가"를 명제 충족 문제로 푼다. 이 엔진(Tiros라고 부른다)은 AWS Inspector·Access Analyzer·Network Firewall에도 같은 기반이 쓰인다. 2018년 USENIX Security에서 발표된 논문 "Reachability Analysis for AWS-based Networks"가 그 기반이다.

## 정리하며

IGW는 양방향 외부 출입구, NAT GW는 Private 서브넷의 outbound-only 게이트, Bastion은 운영자 SSH의 점프 호스트. 그리고 Session Manager가 그 모든 걸 outbound-only로 뒤집어버린 게 현대 표준이다. 시험에서는 "가장 보안적인 EC2 접근"이면 Session Manager, "Private 서브넷 outbound"면 NAT GW, "Public IP 부여 인스턴스의 외부 통신"이면 IGW로 매핑이 즉시 떠올라야 한다. 다음 글은 SG와 NACL의 깊은 차이, VPC Flow Logs를 다룬다.

---

## 📝 연습 문제

**문제 1.** Private 서브넷의 EC2가 외부 API를 호출해야 한다. 가장 적합한 솔루션은?

A) IGW만 부착
B) NAT Gateway를 같은 AZ Public 서브넷에 두고 라우팅
C) ALB
D) PrivateLink

**정답: B**
해설: outbound-only면 NAT GW가 정답. IGW만 부착해도 Private 인스턴스는 Public IP가 없어 외부로 못 나간다. PrivateLink는 특정 AWS 서비스나 ISV 서비스에 비공개 접근일 뿐 일반 인터넷 outbound가 아님. AWS 서비스(예: S3, DynamoDB) 한정이면 Gateway Endpoint를 NAT 대신 쓸 수 있어 비용을 크게 줄인다.

---

**문제 2.** NAT Gateway의 HA를 위해?

A) NAT GW를 모든 AZ에 1개씩, 각 AZ Private 서브넷이 같은 AZ NAT를 사용
B) NAT GW 1개를 1 AZ에 두고 다른 AZ가 그것을 공유
C) NAT Instance를 ASG로 운영
D) EIP를 여러 개 부여

**정답: A**
해설: NAT GW는 AZ scoped. 한 AZ 죽으면 그 NAT 죽음. AZ별 NAT + per-AZ 라우팅이 표준. 비용은 늘지만 사고 한 번보다 싸다. 또 cross-AZ 트래픽 비용도 줄어든다 — 같은 AZ NAT 라우팅이 비용·가용성 둘 다 잡는다.

---

**문제 3.** 가장 보안 우수한 EC2 운영자 접근 방법은?

A) Bastion + SSH 키
B) EC2 Instance Connect
C) Session Manager + IAM 정책 + CloudWatch Logs
D) 인스턴스 Public IP에 22 포트 개방

**정답: C**
해설: 22 포트 자체가 닫혀 있고, IAM으로 누가 접근 가능한지 제어, 모든 세션이 CloudWatch에 자동 로깅. Zero Trust 원칙의 구현. 시험 단골 정답. NIST SP 800-207 Zero Trust Architecture 권장도 같은 방향.

---

**문제 4.** NAT GW를 통해 같은 destination에 너무 많은 연결을 만들면?

A) NAT GW가 자동 확장
B) Port allocation failure 발생 가능
C) IGW가 보완
D) EIP가 자동 추가

**정답: B**
해설: 한 EIP의 65,535 포트로 다중화하므로 한 destination IP·port 조합에 약 55,000 동시 연결이 한계. 해결책은 NAT GW를 여러 개로 분할하거나 destination 분산. 2021년부터 NAT GW에 secondary EIP를 붙여 포트 수 확장이 가능해졌다.

---

**문제 5.** IGW의 역할로 옳은 것은?

A) 인스턴스 Private IP를 Public IP로 NAT 변환
B) 보안 그룹 강제
C) NACL 강제
D) DDoS 방어

**정답: A**
해설: IGW는 1:1 NAT + 라우팅. 보안은 SG/NACL이 담당, DDoS는 Shield. IGW 자체엔 룰셋이 없다. IGW가 무료라는 점도 자주 묻는다 — IGW를 지나는 트래픽 자체는 비용이 없고, 외부로 나가는 outbound 데이터 비용만 발생.

---

**문제 6.** Bastion 패턴의 SG 설계로 가장 안전한 것은?

A) Bastion SG 인바운드 SSH 0.0.0.0/0
B) Private EC2 SG가 Bastion SG를 source로 참조
C) Private EC2가 직접 Public IP를 가짐
D) Bastion에 IAM AdministratorAccess

**정답: B**
해설: SG 참조 패턴이 표준. IP가 바뀌어도 자동 추적. Bastion SG의 source는 회사 IP 화이트리스트만 허용해야 진정 안전. 더 좋은 답은 Bastion을 아예 안 쓰는 것 — Session Manager로 전환.

---

**문제 7.** Session Manager가 인바운드 22 포트 없이 작동하는 원리는?

A) AWS가 인스턴스에 외부 접근
B) SSM Agent가 outbound HTTPS로 SSM 엔드포인트에 long-polling, 그 위로 양방향 채널
C) NAT GW가 inbound를 변환
D) EIP 자동 부여

**정답: B**
해설: Outbound-only Zero Trust 모델. 인스턴스에서 SSM으로 나가는 HTTPS 연결만 있고, 그 connection 위로 운영자 세션이 흐른다. 인바운드 포트가 전혀 필요 없는 게 핵심 이점. 더 완벽한 격리를 원하면 SSM VPC Endpoint를 같이 써서 outbound 자체도 사설 망 안에서 끝낼 수 있다.
