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

## 중앙 집중식 검사 VPC: 허브 앤 스포크

계정·VPC가 많아지면 VPC마다 방화벽을 두는 분산 배치는 운영·비용이 비효율적이다. **Transit Gateway** 또는 **VPC Lattice**를 허브로 두고, 전용 **inspection VPC**(중앙 검사 VPC)에 Network Firewall를 배치해 모든 East-West(VPC 간)·North-South(인터넷) 트래픽을 한 곳에서 검사한다.

```
        [Transit Gateway]  ── 허브
        /        |        \
 [App VPC]  [Inspection VPC]  [Data VPC]
                  │
          [Network Firewall]
          (모든 교차 트래픽 검사)
```

TGW의 **appliance mode**를 활성화해야 한다 — 같은 흐름의 패킷이 항상 동일 firewall endpoint(같은 AZ)로 가도록 보장해 stateful 검사의 대칭성을 유지한다. appliance mode 없이는 흐름이 AZ를 가로질러 비대칭이 되며 stateful 규칙이 오작동한다.

> 🎯 **시나리오**: "50개 계정의 모든 VPC 간·인터넷 트래픽을 중앙에서 IPS로 검사"는 시험 빈출 아키텍처다. 정답 패턴: Transit Gateway 허브 + 전용 inspection VPC에 Network Firewall + TGW appliance mode 활성화 + Firewall Manager로 정책 중앙 배포. VPC마다 방화벽을 두는 분산 배치는 "운영 단순화·중앙 관리" 요구에 맞지 않는다.

> 💡 **관련 이론**: 중앙 검사 VPC는 네트워크 보안의 *choke point(병목 통제점)* 패턴이다. 모든 트래픽이 반드시 통과하는 단일 지점을 만들어 정책을 일관되게 적용하고 가시성을 확보한다. 트레이드오프는 명확하다 — 단일 통제점은 관리가 쉽지만 가용성·성능의 병목이자 단일 장애점이 될 수 있어, AZ별 다중 endpoint로 분산·이중화해야 한다.

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

> 🔍 **더 깊이**: Network Firewall의 SNI/도메인 필터링과 DNS Firewall는 *계층이 다르다*. DNS Firewall는 "이름 해석" 단계에서 막아, 악성 도메인의 IP를 아예 못 받게 한다. Network Firewall는 "연결 시도" 단계에서 막아, IP를 알아도 그 연결을 차단한다. 둘은 보완적이다 — DNS를 우회해 직접 IP로 접속하는 멀웨어는 DNS Firewall를 통과하지만 Network Firewall stateful 규칙(IP/도메인)에 걸린다. 심층 방어(defense in depth)의 전형이다.

## Network Firewall vs Gateway Load Balancer 어플라이언스

서드파티 방화벽(Palo Alto, Fortinet 등)을 VPC에 끼우려면 **Gateway Load Balancer(GWLB)** + GENEVE 인캡슐레이션을 쓴다. AWS Network Firewall는 이런 어플라이언스를 직접 운영할 필요 없는 *관리형* 대안이다. "관리 부담 없이 IPS/도메인 필터링" 요구면 Network Firewall, "특정 벤더 어플라이언스를 투명하게 삽입" 요구면 GWLB가 정답이다.

## 로깅

Network Firewall는 **flow log**(연결 메타데이터)와 **alert log**(stateful 규칙 매칭·IPS 경보)를 CloudWatch Logs/S3/Firehose로 보낸다. DNS Firewall는 Resolver query log로 차단·허용된 질의를 기록한다. 두 로그 모두 포렌식·튜닝의 1차 근거이며, GuardDuty와 함께 위협 탐지의 신호원이 된다.

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
