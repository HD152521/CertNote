# Day 8 - 보안 그룹 vs NACL, 그리고 Flow Logs가 말해주는 것

VPC 안의 패킷에는 두 개의 방화벽이 차례로 작용한다. 서브넷 경계에 있는 NACL(Network ACL)과 인스턴스(정확히는 ENI) 경계에 있는 Security Group이다. 이 둘은 비슷해 보이지만 작동 방식이 근본적으로 다르고, 그 차이가 시험에 가장 자주 등장하는 포인트다. 두 방화벽의 차이는 결국 *stateful vs stateless*, *role-based vs network-based*, *whitelist-only vs blacklist-capable*이라는 세 축에서 정리된다 — 그리고 이 세 축은 모든 방화벽 설계의 기본 분류 체계이기도 하다.

오늘은 SG vs NACL의 진짜 차이, 그리고 그 위에서 일어난 일을 사후 분석하게 해주는 VPC Flow Logs를 다룬다. 그리고 한 가지 더, *Defense in Depth*(심층 방어)의 관점에서 두 방화벽이 어떻게 보완재로 동작하는지를 본다.

## 두 방화벽이 작동하는 순서

```
[ Outside Internet / Other Instance ]
            ↓
   Subnet 경계 NACL (Stateless)
            ↓
   ENI 경계 Security Group (Stateful)
            ↓
   [ EC2 Instance ]
```

들어오는 패킷은 NACL → SG 순으로 통과해야 도달한다. 나가는 패킷은 그 역순. 두 방화벽이 모두 허용해야 통신이 성립한다. 이는 *AND* 조건이고, 어느 하나라도 거부하면 패킷이 떨어진다. 두 방화벽이 *OR*가 아닌 *AND*로 결합된다는 점이 Defense in Depth의 본질이다.

> 💡 **관련 이론**: 두 방화벽의 직렬 배치는 NIST SP 800-41(Guidelines on Firewalls)에서 권장하는 *layered firewall architecture*의 직접 구현이다. 외부 perimeter firewall(NACL과 유사한 stateless)과 host-based firewall(SG와 유사한 stateful)이 결합되어 단일 방어선이 뚫리더라도 다음 층에서 막는다. 같은 모델이 온프레미스 데이터센터의 *DMZ + 내부 방화벽* 패턴으로 수십 년간 운영되어 왔다. AWS는 이를 VPC 추상화 안에 자동으로 내장했다.

## Security Group: Stateful Allow-List

SG는 **ENI에 부착되는** stateful 방화벽이다. "Stateful"이라는 게 핵심: 한 번 허용된 outbound 연결의 응답은 inbound 룰을 안 봐도 자동으로 통과한다.

| 속성 | SG |
|------|-----|
| 적용 | ENI |
| 상태성 | Stateful |
| 룰 | Allow만 (Deny 불가) |
| 평가 | 모든 룰을 한 번에 평가 (순서 무관) |
| 기본값 | inbound 모두 거부 / outbound 모두 허용 |
| 한도 | 인스턴스당 5개 SG, SG당 60 in + 60 out 룰 |
| Source | IP CIDR, 다른 SG, prefix list |

> 🔍 **더 깊이**: Stateful이라는 의미는 SG가 **connection tracking table**을 유지한다는 뜻이다. 한 TCP 흐름(src IP:port + dst IP:port + protocol)이 허용되면 그 흐름의 응답 패킷은 자동 통과. 이건 Linux netfilter의 `conntrack` 모듈과 정확히 같은 모델이다. AWS는 ENI마다 별도의 conntrack을 유지하며, 트래픽 폭증 시 conntrack 테이블 크기가 한계에 다다르면 신규 연결이 떨어진다. EC2 인스턴스 타입마다 supported connection 개수가 다르고, Nitro 인스턴스는 수백만 개까지 가능하다. 이 한계는 *DDoS 공격 시 connection 폭주*의 직접적 영향 요인이고, AWS Shield Advanced가 자동으로 conntrack 한도를 늘리는 보호를 제공한다.

> 💡 **관련 이론**: Stateful 방화벽은 1990년대 Check Point의 FireWall-1이 처음 상업화했고, 그 전까지 모든 방화벽은 stateless(packet-by-packet) 였다. Stateless 방화벽은 응답 트래픽을 위한 ephemeral port range를 명시 허용해야 하는 운영 부담이 있다. AWS NACL이 stateless라서 같은 이슈가 있고, 이게 시험에 자주 나오는 함정이다. Stateful 방화벽의 발명은 보안 산업에 결정적이었는데, 이전까지의 *packet filter*가 모든 패킷을 독립적으로 보는 것에 비해 *connection*이라는 의미 단위를 도입했기 때문이다. RFC 2979(1999)가 이를 공식 정의한다.

### SG를 source로 참조하기

SG의 가장 강력한 기능: **다른 SG를 source/destination으로 참조** 가능. IP가 아니라 "SG에 속한 모든 ENI"가 자동으로 매칭된다.

```
ALB SG:  inbound 443 from 0.0.0.0/0
App SG:  inbound 8080 from ALB SG       ← SG 참조
DB SG:   inbound 5432 from App SG       ← SG 참조
```

이렇게 묶어두면 인스턴스가 추가되어도 SG에 attach만 하면 자동으로 매칭 범위에 들어온다. IP 화이트리스트 대비 운영 부담이 압도적으로 줄어든다. 이 SG 참조 패턴은 *role-based access control*의 네트워크 계층 구현이고, IP 기반의 *attribute-based*보다 운영 안정성이 훨씬 높다.

> 🔍 **더 깊이**: SG 참조는 내부적으로 *Mapping Service*(Day 6에서 다룬 VPC SDN의 일부)가 ENI 메타데이터를 통해 동적으로 해석한다. SG ID에 속한 ENI의 Private IP들이 매핑 테이블에 자동 업데이트되고, 모든 호스트의 Nitro 카드가 이를 참조해 패킷을 필터링한다. 이 자동 동기화 덕분에 ASG로 인스턴스가 동적으로 추가·제거되어도 SG 참조가 즉시 반영된다. 같은 모델이 Kubernetes NetworkPolicy의 *labelSelector*와 거의 동일하다.

> 📚 **사례**: 2017년 Amazon S3 us-east-1 장애 당시 영향을 받은 다수 회사 중 일부는 SG 참조를 잘못 설계해 *S3 인터페이스 엔드포인트가 다운된 후 백업 S3 endpoint로 재시도가 안 되는* 카스케이드를 겪었다. 사후 복구에서 SG 참조 + prefix list 조합으로 "여러 endpoint에 동시 허용"이 표준이 됐다.

## NACL: Stateless Allow + Deny

NACL은 **서브넷에 부착되는** stateless 방화벽이다.

| 속성 | NACL |
|------|------|
| 적용 | Subnet |
| 상태성 | Stateless |
| 룰 | Allow + Deny 둘 다 |
| 평가 | 룰 번호 오름차순, 처음 매칭에서 결정 |
| 기본값 (Default NACL) | 모두 허용 |
| 기본값 (Custom NACL) | 모두 거부 |
| 한도 | NACL당 in 20 + out 20 (증가 가능) |
| Source | IP CIDR만 (SG 참조 불가) |

Stateless이므로 응답 트래픽도 명시 허용해야 한다. 그래서 NACL에는 거의 항상 **ephemeral port range 허용 룰**이 들어간다.

```
[ Outbound NACL Rules ]
 100 ALLOW TCP 443 to 0.0.0.0/0
 110 ALLOW TCP 80  to 0.0.0.0/0
 *   DENY

[ Inbound NACL Rules — 응답을 받기 위함 ]
 100 ALLOW TCP 1024-65535 from 0.0.0.0/0   ← ephemeral port
 *   DENY
```

> ⚠️ **함정**: NACL에서 inbound 443만 허용하고 outbound ephemeral을 안 열면 응답이 못 나간다. 이게 SG와 다른 점이고, "왜 통신이 안 되지?"의 흔한 원인이다. 디버깅 시 패킷이 outbound로 나가는 *방향*까지 NACL을 봐야 한다. 또 ephemeral port를 너무 좁게 잡으면 동시 연결 수가 OS 한도에 묶여 throughput이 떨어질 수 있다.

> 🔍 **더 깊이**: Ephemeral port range는 OS마다 다르다. Linux 4.x+는 32768-60999, Windows 2008+는 49152-65535, 옛 Linux/Windows는 1024-65535. 안전하게는 **1024-65535를 다 허용**하는 게 표준. NACL의 stateless 특성이 운영을 어렵게 만드는 가장 큰 이유다. RFC 6056(2011)은 ephemeral port allocation의 보안 권장사항을 정의하는데, 예측 가능한 포트 할당이 *idle scan* 같은 공격에 취약하다는 이유로 randomization을 권장한다. 현대 OS는 모두 이를 준수한다.

> 💡 **관련 이론**: NACL의 "번호 순 첫 매칭" 평가는 *first-match firewall* 모델이고, Cisco ACL, iptables, BSD pf 등 거의 모든 전통 방화벽이 이 모델을 쓴다. 룰 번호 사이에 간격(예: 100, 110, 120)을 두는 관행은 나중에 룰을 삽입할 여지를 두기 위함. *Best-match firewall*(가장 구체적인 룰 우선) 모델은 더 직관적이지만 운영자가 의도하지 않은 매칭이 일어나기 쉬워, 명시적 first-match가 산업 표준이 됐다.

## SG vs NACL: 진짜 차이의 한 줄 요약

| 항목 | SG | NACL |
|------|-----|------|
| 적용 단위 | ENI | Subnet |
| 상태 | Stateful | Stateless |
| 룰 종류 | Allow만 | Allow + Deny |
| 평가 | 전체 룰 합집합 | 번호 순서대로 첫 매칭 |
| Source | IP, SG, prefix list | IP만 |
| 응답 자동 허용 | 예 | 아니오 (ephemeral 별도) |
| 변경 영향 | ENI 단위 | 서브넷 전체 |
| 일반 용도 | 일반 보안 | 광범위 IP 차단 (예: DDoS 의심 IP) |

실무 패턴: **SG가 주, NACL은 보조**. 90%의 보안 룰은 SG로 표현하고, NACL은 "특정 IP/대역 전체 차단" 같은 광역 정책에만 쓴다.

> 📚 **사례**: 2018년 한 회사가 SG를 너무 복잡하게 설정해서 디버깅이 불가능해진 사례가 보고됐다. 한 EC2에 SG 5개가 붙어 있고, 각 SG에 60개씩 룰이 있어 총 300개 룰이 한 ENI에 작용했다. 새 룰을 추가할 때마다 다른 룰과의 상호작용을 추적할 수 없었다. 사후에는 SG를 "역할 기반"으로 단순화하고(SG 1개 = 1개의 역할), 같은 역할의 인스턴스는 같은 SG를 공유하도록 했다. **SG는 IP 화이트리스트가 아니라 역할 그룹**으로 설계하는 게 표준. 2021년 한 핀테크는 같은 교훈을 IaC(Terraform)로 강제했다 — SG 이름이 `[role]-[env]` 형식이 아니면 lint가 실패하게 만들어 역할 단위 SG를 자동 강제.

> ⚠️ **함정**: NACL은 *서브넷 전체*에 적용되므로 변경 시 영향 범위가 크다. 한 서브넷에 100개 ENI가 있다면 NACL 룰 한 줄 잘못 추가가 100개 인스턴스의 트래픽을 동시에 막을 수 있다. SG는 ENI 단위라 변경의 *blast radius*가 작다. 운영 환경에서 NACL을 건드릴 때는 항상 *change window*와 *rollback plan*을 미리 준비해야 한다.

> 🔍 **더 깊이**: SG와 NACL의 *복잡도 폭발*은 클라우드 네트워크 보안의 고전적 문제다. 한 조직이 수십 개 VPC × 수백 개 SG × 수천 개 룰을 운영하면 사람이 추적 불가능해진다. 해결책은 ① IaC로 룰을 코드화(Terraform, CloudFormation), ② AWS Firewall Manager로 SG를 중앙 정책 강제, ③ Access Analyzer로 외부 노출 자동 감지. 2023년 출시된 *AWS Network Firewall*은 NACL/SG 위에 더 상위 L7 방화벽을 두는 옵션을 제공한다.

## VPC Flow Logs: 누가 누구와 통신했는가

Flow Logs는 VPC 안의 모든 ENI를 통과한 트래픽 메타데이터를 기록한다. 패킷 본문은 안 보고 헤더만 본다. 기본 필드:

```
version account-id interface-id srcaddr dstaddr srcport dstport
protocol packets bytes start end action log-status
```

- **action**: `ACCEPT` 또는 `REJECT` — SG/NACL이 어떻게 판단했는지.
- **start/end**: 트래픽 흐름의 시작·끝 시각.
- **packets/bytes**: 양.

저장 위치는 3곳 중 선택: **CloudWatch Logs, S3, Kinesis Data Firehose**. 분석은 보통 **Athena** 또는 **CloudWatch Logs Insights**.

```sql
-- Athena: 거부된 트래픽 top 10 source IP
SELECT srcaddr, COUNT(*) as cnt
FROM vpc_flow_logs
WHERE action = 'REJECT' AND start_time > current_date - interval '1' day
GROUP BY srcaddr
ORDER BY cnt DESC LIMIT 10;
```

> 💡 **관련 이론**: Flow Logs는 **NetFlow**(Cisco, 1996)의 클라우드 버전이다. NetFlow가 라우터에서 흐름 메타데이터를 collector로 보내는 모델이라면, Flow Logs는 같은 개념을 SDN 위에서 구현했다. IPFIX(RFC 7011)가 NetFlow의 IETF 표준화 버전이고, AWS Flow Logs는 IPFIX와 호환되는 데이터 모델을 따른다. NetFlow는 1990년대 후반부터 통신 사업자가 *traffic engineering*과 *billing*에 사용했고, 그 데이터를 *Argus, SiLK, nfdump* 같은 분석 도구로 처리했다. AWS Flow Logs도 같은 도구 체인에 연결 가능하다.

> 📚 **사례**: 2020년 한 핀테크가 Flow Logs로 GuardDuty가 잡지 못한 데이터 유출을 사후 발견했다. 한 EC2에서 외부 미지의 IP로 매일 자정에 ~500MB가 빠져나가는 패턴이 Athena 쿼리에서 잡혔다. 알고 보니 마이닝 멀웨어가 아니라 잘못 설정된 백업 스크립트가 잘못된 S3 endpoint로 데이터를 보내고 있었던 것. Flow Logs가 없었으면 발견이 몇 달 더 걸렸을 거다. 비슷한 사례로 2022년 한 게임 회사가 Flow Logs를 통해 *crypto-mining* 멀웨어 감염 EC2를 발견했는데, CPU 사용률은 normal이었지만 Flow Logs의 outbound 트래픽 패턴(미지의 mining pool 도메인)이 알람을 띄웠다.

> 🔍 **더 깊이**: Flow Logs는 v5(2021년)에서 *traffic-type*, *pkt-srcaddr*, *pkt-dstaddr* 같은 새 필드를 추가했다. *pkt-srcaddr*는 NAT 변환 *전*의 원래 IP를 보여줘서, NAT GW를 통과한 트래픽도 원본 source를 추적 가능하게 만든다. 이건 보안 사고 조사에서 결정적이다 — NAT 너머의 진짜 공격자 IP를 알 수 있게 됐다. 또 v5에서 ENI마다 다른 필드 집합을 선택할 수 있어서 로그 비용을 세밀하게 조정할 수 있다.

## Flow Logs의 한계와 보완

Flow Logs는 **샘플링이 아닌 모든 패킷의 메타데이터**를 잡지만, **패킷 페이로드는 안 본다**. DNS 쿼리 내용, HTTP 헤더, SQL 쿼리는 잡지 못한다. 페이로드까지 보려면 **VPC Traffic Mirroring**(2019년 출시)을 써야 한다. ENI 트래픽을 다른 ENI 또는 NLB로 복제해서 깊은 패킷 검사(DPI) 도구로 분석한다.

| 도구 | 보는 것 | 용도 |
|------|---------|------|
| VPC Flow Logs | 헤더 메타데이터 | 일반 감사·트러블슈팅 |
| Traffic Mirroring | 패킷 페이로드 전체 | DPI, IDS, 포렌식 |
| Route 53 Resolver Query Logs | DNS 쿼리 | 도메인 단위 활동 추적 |
| CloudTrail | API 호출 | 관리·감사 |
| GuardDuty | 모든 위 + IOC 매칭 | 자동 위협 탐지 |

> 🔍 **더 깊이**: Traffic Mirroring은 *port mirroring* 또는 *SPAN(Switched Port Analyzer)*의 클라우드 버전이다. 온프레미스 데이터센터에서 IDS(Suricata, Zeek/Bro, Snort)에 트래픽을 미러링 보내던 패턴 그대로다. AWS는 이를 SDN 레벨에서 무손실로 구현했고, 대상 ENI의 인스턴스 타입에 따라 미러링 트래픽 throughput이 제한된다. *Selective mirroring*도 가능해서 특정 SG/CIDR/포트만 미러링 가능 — 모든 트래픽을 미러링하면 비용·성능 부담이 커지기 때문.

> 💡 **관련 이론**: 페이로드까지 보는 *Deep Packet Inspection*(DPI)은 1990년대 후반 ISP가 P2P 트래픽 식별·차단에 도입하면서 등장했다. 보안 측면에서는 IDS/IPS(침입 탐지·차단 시스템)가 DPI의 주된 사용처. 다만 TLS 1.3 보편화 이후 페이로드 자체가 암호화되어 DPI의 효용이 떨어지고 있고, *encrypted traffic analysis*(헤더와 흐름 패턴만 보고 위협 탐지)가 새로운 표준이 되고 있다. GuardDuty의 *VPC Flow Logs 기반 위협 탐지*가 정확히 이 모델이다.

> 📚 **사례**: 2017년 한 보안 회사가 Suricata + Traffic Mirroring 조합으로 클라우드 IDS를 구축한 사례를 공개했다. ENI 트래픽을 NLB로 미러링하고, NLB 뒤에 Suricata 인스턴스 군집을 두어 분산 분석. 이 패턴은 *VPC IDS*의 표준 reference architecture가 됐고, AWS Network Firewall도 비슷한 모델을 매니지드 서비스로 제공한다.

## 정리하며

SG는 stateful · ENI · Allow만, NACL은 stateless · subnet · Allow+Deny. 둘은 보완재고 표준은 SG 중심. Flow Logs는 사후 감사의 기본 도구이고, 페이로드까지 보려면 Traffic Mirroring. 다음 글은 VPC 간 연결 — Peering, TGW, Endpoint — 를 본다. 마지막으로 강조: *방화벽은 절대 단독으로 보안을 책임지지 않는다*. SG/NACL은 네트워크 계층의 한 layer이고, IAM(identity), 암호화(in-transit/at-rest), 감사(CloudTrail/Config), 침입 탐지(GuardDuty/Inspector)가 함께 작동해야 진정한 Defense in Depth가 된다.

---

## 📝 연습 문제

**문제 1.** 인스턴스에서 80 포트로 외부 HTTP를 호출했는데 응답이 안 온다. SG는 outbound 80을 허용한다. NACL을 어떻게 설정해야 하는가?

A) Outbound 80만 허용
B) Outbound 80 + Inbound ephemeral port range 허용
C) Inbound 80만 허용
D) Inbound 443 허용

**정답: B**
해설: NACL stateless라 응답 트래픽도 명시 허용 필요. Outbound 80 + Inbound 1024-65535(ephemeral). SG였으면 outbound 한 줄로 끝. 이 함정이 SAA에 가장 자주 나오는 NACL 함정이다.

---

**문제 2.** 시험에 자주 나오는 SG와 NACL의 결정적 차이는?

A) SG는 stateful, NACL은 stateless
B) SG는 subnet에 부착, NACL은 ENI에 부착
C) NACL은 Allow만, SG는 Allow + Deny
D) SG는 IP만, NACL은 SG 참조 가능

**정답: A**
해설: SG=stateful(응답 자동 허용), NACL=stateless(응답 별도 허용). 적용 단위는 SG=ENI, NACL=서브넷. Allow/Deny는 NACL이 둘 다, SG는 Allow만. SG는 IP/SG/prefix list 모두 source 가능, NACL은 IP만.

---

**문제 3.** 특정 IP 대역을 차단해야 한다. SG와 NACL 중 어디서?

A) SG에서 Deny 룰 추가
B) NACL에서 Deny 룰 추가
C) IAM 정책
D) IGW에서 차단

**정답: B**
해설: SG는 Allow만 가능, Deny 룰이 없다. 명시적 차단은 NACL의 영역. 광역 IP 블랙리스트가 NACL의 대표 용도. 더 적극적인 차단은 AWS WAF(L7)나 AWS Network Firewall로 갈 수 있고, 글로벌 차단이면 Shield Advanced와 결합.

---

**문제 4.** Flow Logs에서 페이로드를 못 보면 대안은?

A) CloudTrail
B) VPC Traffic Mirroring
C) GuardDuty
D) CloudWatch Logs

**정답: B**
해설: 페이로드 전체 복제는 Traffic Mirroring. DPI, IDS, 포렌식에 사용. CloudTrail은 API 감사라 무관. GuardDuty는 Flow Logs/CloudTrail/DNS Logs를 자동 분석하지만 페이로드는 안 본다.

---

**문제 5.** 한 ENI에 SG 5개가 붙어 있고 각각 다른 룰을 가진다. 평가 방식은?

A) 위에서 아래로 첫 매칭
B) 모든 SG의 모든 룰을 합집합으로 평가, 어느 하나라도 허용이면 통과
C) 가장 처음 부착된 SG가 우선
D) 알파벳 순서

**정답: B**
해설: SG는 합집합. 5개 SG에 총 300개 룰이면 그 합집합이 효과. 그래서 SG를 역할별로 단순화하는 게 운영 안정성의 핵심. 합집합 평가는 *Deny 우선* 모델(IAM)과 다르게 *Allow 누적* 모델이다.

---

**문제 6.** Custom NACL을 만들었는데 통신이 안 된다. 가장 가능성 높은 원인은?

A) SG가 모두 거부
B) Custom NACL은 기본이 모두 거부라 명시 허용 필요
C) Default NACL이 우선
D) IGW가 없다

**정답: B**
해설: Default NACL은 모두 허용, Custom NACL은 모두 거부가 기본. 새 Custom NACL을 만들면 명시 Allow 룰을 다 추가해야 한다. 이게 *fail-secure* 설계 — 새로 만든 NACL은 안전한 상태(거부)에서 시작.

---

**문제 7.** VPC Flow Logs로 잡히지 않는 것은?

A) AWS DNS 서버(169.254.169.253)로의 쿼리
B) ARP 같은 L2 트래픽
C) DHCP 서버와의 통신
D) 모두 잡힌다

**정답: B**
해설: Flow Logs는 L3+(IP 이상)만 캡처. ARP, L2 멀티캐스트, 169.254.169.254 메타데이터 일부 패킷은 안 잡힌다. DNS 쿼리는 별도 Route 53 Resolver Query Logs로 캡처. DHCP는 UDP 67/68이라 잡히긴 하지만 EC2는 부팅 시에만 발생하므로 거의 보이지 않는다.

---

**문제 8.** 한 ENI 트래픽의 전체 페이로드를 IDS(Suricata)에 보내고 싶다. 가장 적합한 솔루션은?

A) VPC Flow Logs v5
B) VPC Traffic Mirroring을 NLB로, 그 뒤에 Suricata
C) GuardDuty
D) Network ACL Logging

**정답: B**
해설: Traffic Mirroring은 ENI 트래픽을 NLB나 다른 ENI로 복제. NLB 뒤에 Suricata/Zeek IDS 군집을 두는 게 *VPC IDS* 표준 패턴. Flow Logs는 메타데이터만, GuardDuty는 자동 위협 탐지지만 페이로드 안 본다.
