# Day 3 - VPC Flow Logs와 네트워크 로깅: 트래픽으로 침해·오구성 탐지, Route 53 Resolver 쿼리 로그

CloudTrail은 제어 평면(API)을, Config는 구성 상태를 본다. 하지만 "실제로 어떤 패킷이 어디로 흘렀는가"는 둘 다 보지 못한다. **VPC Flow Logs**가 이 빈틈을 메운다. Flow Logs는 ENI(Elastic Network Interface)를 드나든 IP 트래픽의 *메타데이터*(5-tuple, 바이트 수, 허용/거부 등)를 기록한다. 패킷 *내용(payload)*은 캡처하지 않는다 — 그건 Traffic Mirroring의 영역이다.

보안 시험에서 Flow Logs는 "비정상 트래픽 탐지", "보안 그룹·NACL 오구성 진단", "데이터 유출 탐지", "거부된 연결 추적"의 1차 증거다.

## Flow Log의 캡처 범위와 대상

Flow Logs는 세 수준에서 켤 수 있고, 하위 리소스는 상위를 상속한다:
- **VPC 수준**: 그 VPC의 모든 ENI.
- **서브넷 수준**: 그 서브넷의 모든 ENI.
- **ENI 수준**: 개별 인터페이스.

전송 대상은 **CloudWatch Logs, S3, Kinesis Data Firehose**다. 대량·장기 보관과 Athena 분석에는 S3가, 실시간 메트릭·경보에는 CloudWatch Logs가 적합하다.

```
# 기본 형식 필드 순서
version account-id interface-id srcaddr dstaddr srcport dstport
protocol packets bytes start end action log-status
```

```
2 111122223333 eni-0abc 203.0.113.10 10.0.1.20 49152 22 6 20 4800 1719216000 1719216060 REJECT OK
2 111122223333 eni-0abc 10.0.1.20 198.51.100.5 443 49321 6 5000 7340032 1719216000 1719216060 ACCEPT OK
```

- `action`: `ACCEPT`(보안 그룹·NACL이 허용) 또는 `REJECT`(거부).
- `log-status`: `OK`(정상), `NODATA`(트래픽 없음), `SKIPDATA`(용량 초과로 일부 누락).

> ⚠️ **함정**: Flow Logs는 **메타데이터만** 기록한다. "패킷 내용을 검사해 멀웨어 시그니처를 찾으라"가 나오면 Flow Logs가 아니라 **VPC Traffic Mirroring**(전체 패킷 복제 후 IDS/IPS로 분석)이 정답이다. 또 Flow Logs는 *실시간 캡처가 아니라* 집계 윈도(기본 약 10분, 또는 1분)로 모아 떨군다 — 즉 즉각적 패킷 단위 차단 도구가 아니다.

## 커스텀 형식과 깊은 가시성 필드

기본 형식 외에 **custom format**으로 추가 필드를 넣을 수 있고, 이들이 시험·실무의 핵심이다:
- `vpc-id`, `subnet-id`, `instance-id`: 어느 리소스인지.
- `tcp-flags`: SYN/ACK/FIN/RST 플래그 — 포트 스캔(SYN만 잔뜩) 탐지에 유용.
- `pkt-srcaddr` / `pkt-dstaddr`: NAT·로드밸런서 뒤의 *원래* 주소(`srcaddr`/`dstaddr`는 ENI 기준).
- `flow-direction`: `ingress`/`egress`.
- `traffic-path`: egress 트래픽이 어떤 경로(IGW, NAT, VPC peering, TGW 등)로 나갔는지.

> 💡 **관련 이론**: `pkt-srcaddr`와 `srcaddr`의 구분은 보안 분석의 핵심 개념인 *주소 변환 투명성*과 닿는다. NAT 게이트웨이 뒤에서 여러 인스턴스가 같은 공인 IP로 나가면, `srcaddr`만으로는 어느 인스턴스가 외부와 통신했는지 모른다. `pkt-srcaddr`(NAT 이전 원본 사설 IP)가 있어야 데이터 유출의 진짜 출처를 특정할 수 있다. 침해 조사에서 "어느 EC2가 C2 서버와 통신했나"를 답하려면 이 필드가 결정적이다.

## Flow Logs로 침해·오구성 탐지하기

**오구성 진단** — "연결이 안 되는데 SG 문제인가 NACL 문제인가?":
- Flow Log에 `REJECT`가 보이면 SG 또는 NACL이 막은 것이다. SG는 *stateful*이라 인바운드 허용 시 응답이 자동 허용되지만, NACL은 *stateless*라 인바운드·아웃바운드(임시 포트 포함)를 따로 열어야 한다. `REJECT`가 한 방향만 보이면 NACL의 비대칭 규칙을 의심한다.
- `ACCEPT`로 들어왔는데 응답이 안 나가면 NACL outbound 임시 포트(1024-65535) 미허용이 흔한 원인이다.

```sql
-- Athena: 거부된 SSH 인바운드 시도 상위 출처 IP
SELECT srcaddr, count(*) AS attempts
FROM vpc_flow_logs
WHERE dstport = 22 AND action = 'REJECT'
  AND date >= '2026-06-20'
GROUP BY srcaddr
ORDER BY attempts DESC
LIMIT 20;
```

**침해·유출 탐지**:
- 평소 외부로 나가지 않던 인스턴스가 대량 `bytes`를 미상 IP로 egress → 데이터 유출 의심.
- 한 소스가 다수 `dstport`에 SYN 플래그만 → 포트 스캔.
- 내부 인스턴스가 알려진 악성 IP/암호화폐 채굴 풀과 통신 → C2/크립토재킹.

> 🎯 **시나리오**: "EC2가 평소와 달리 외부 미상 IP로 대량 데이터를 보낸다. 어떤 로그로 진단하나?" 정답: VPC Flow Logs(custom format에 `pkt-srcaddr`, `bytes`, `flow-direction=egress` 포함)로 egress 볼륨과 원본 인스턴스를 특정. 더 자동화하려면 GuardDuty가 Flow Logs·DNS·CloudTrail을 분석해 이런 패턴을 자동 탐지한다(7~8주 후반 주제와 연결).

## Route 53 Resolver Query Logging: DNS 차원의 가시성

네트워크 침해의 상당수가 **DNS**에 흔적을 남긴다. 멀웨어는 C2 도메인을 조회하고, DNS 터널링으로 데이터를 빼낸다. **Route 53 Resolver Query Logging**은 VPC 안에서 발생한 DNS 쿼리(어느 인스턴스가 어떤 도메인을 어떤 레코드 타입으로 조회했고 응답이 무엇이었는지)를 기록한다.

전송 대상은 **CloudWatch Logs, S3, Kinesis Data Firehose**다.

```json
{
  "version": "1.100000",
  "account_id": "111122223333",
  "vpc_id": "vpc-0abc",
  "query_timestamp": "2026-06-24T08:30:00Z",
  "query_name": "malicious-c2.example.",
  "query_type": "A",
  "query_class": "IN",
  "rcode": "NOERROR",
  "answers": [{ "Rdata": "198.51.100.66", "Type": "A" }],
  "srcaddr": "10.0.1.20",
  "srcids": { "instance": "i-0def456" }
}
```

탐지 사례:
- 비정상적으로 긴/무작위 서브도메인을 가진 다량의 TXT 쿼리 → **DNS 터널링**(데이터 유출).
- 알려진 악성 도메인 조회 → 감염 인스턴스 식별.
- 평소 없던 동적 DNS·신생 도메인 다발 조회 → C2 비컨.

> 💡 **관련 이론**: DNS는 거의 모든 환경에서 *암묵적으로 허용*되는 프로토콜이라 공격자가 좋아하는 은닉 채널이다. 방화벽이 53 포트를 막는 경우는 드물다. DNS 터널링은 도메인 이름 자체에 데이터를 인코딩해 빼낸다(`<base32-encoded-data>.attacker.com`). Resolver query log는 이 패턴(엔트로피 높은 긴 서브도메인, 비정상적 쿼리 빈도)을 사후·실시간 탐지하는 거의 유일한 네트워크 차원 증거다. 이를 능동 차단하려면 **Route 53 Resolver DNS Firewall**로 악성 도메인 목록을 차단한다.

> ⚠️ **함정**: Resolver query logging은 VPC 안에서 **Route 53 Resolver를 거치는** DNS 쿼리만 기록한다. 인스턴스가 외부 DNS 서버(예: 8.8.8.8)를 직접 지정해 쓰면 그 쿼리는 Resolver를 우회하므로 로그에 안 남는다. 그래서 보안 베이스라인은 "VPC DNS를 강제로 Resolver로 향하게" 하고(가능하면 외부 DNS egress 차단), DNS Firewall로 악성 도메인을 막는다.

## 네트워크 로깅 도구의 계층 정리

| 도구 | 보는 것 | 깊이 | 능동 차단 |
|------|--------|------|----------|
| VPC Flow Logs | IP 트래픽 메타데이터(5-tuple, 바이트, ACCEPT/REJECT) | L3/L4 헤더 | 아니오(기록만) |
| Traffic Mirroring | 전체 패킷 복제(payload 포함) | L2~L7 페이로드 | 아니오(분석용) |
| Resolver Query Log | DNS 쿼리/응답 | DNS 계층 | 아니오(기록만) |
| Resolver DNS Firewall | 도메인 기반 허용/차단 | DNS 계층 | 예 |
| Network Firewall | 상태기반 검사·IPS·도메인 필터링 | L3~L7 | 예 |

> 🔍 **더 깊이**: 성숙한 탐지 아키텍처는 이 로그들을 *상호 보강*으로 쓴다. Flow Log가 "10.0.1.20이 198.51.100.66:443으로 대량 egress"를 보여주고, 같은 시각 Resolver log가 "10.0.1.20이 `malicious-c2.example`을 조회해 198.51.100.66을 받았다"를 보여주면, IP만으로는 모호했던 통신의 *의도와 도메인 맥락*이 완성된다. 여기에 CloudTrail이 "그 인스턴스의 역할이 직전에 의심스러운 권한을 assume했다"를 더하면 침해 타임라인이 완성된다. 이 다층 상관(correlation)이 4일차의 로그 중앙화·보존, 5일차의 종합 시나리오로 이어진다. 모든 로그는 중앙 집계되어야 이런 교차 분석이 가능하다.

---

## 📝 연습 문제

**문제 1.** "네트워크를 통해 들어온 패킷의 내용을 검사해 멀웨어 시그니처를 탐지하라"는 요구에 가장 적합한 것은?

A) VPC Flow Logs 기본 형식  
B) VPC Traffic Mirroring으로 전체 패킷을 복제해 IDS/IPS로 분석  
C) Route 53 Resolver 쿼리 로그  
D) Config 규칙  

**정답: B**  
해설: VPC Flow Logs는 5-tuple·바이트 수 같은 *메타데이터*만 기록하고 패킷 페이로드는 캡처하지 않는다. 패킷 내용 검사가 필요하면 Traffic Mirroring으로 전체 패킷을 복제해 IDS/IPS 어플라이언스로 보내야 한다. Resolver 로그는 DNS 쿼리, Config는 구성 상태로 패킷 페이로드 분석과 무관하다.

---

**문제 2.** NAT 게이트웨이 뒤의 여러 인스턴스가 같은 공인 IP로 외부와 통신한다. 데이터 유출을 일으킨 *원본 인스턴스*를 특정하려면 Flow Log에서 어떤 필드가 결정적인가?

A) `srcaddr`  
B) `pkt-srcaddr`(NAT 변환 이전의 원본 사설 IP)  
C) `interface-id`만으로 충분  
D) `log-status`  

**정답: B**  
해설: `srcaddr`는 ENI(NAT 게이트웨이) 기준 주소라 NAT 뒤 인스턴스들이 동일하게 보일 수 있다. custom format의 `pkt-srcaddr`는 NAT 변환 이전 원본 사설 IP를 담아 실제 출처 인스턴스를 특정하게 해준다. `log-status`는 캡처 상태이고, `interface-id`만으로는 공유 NAT 인터페이스 뒤를 구분하지 못한다.

---

**문제 3.** 인스턴스로의 인바운드는 `ACCEPT`로 들어오는데 응답 트래픽이 나가지 못해 연결이 실패한다. Flow Log에 outbound `REJECT`가 보인다. 가장 가능성 높은 원인은?

A) 보안 그룹이 stateful이라 자동으로 막혔다  
B) NACL이 stateless라 outbound 임시 포트(1024-65535) 범위를 허용하지 않았다  
C) Flow Logs가 SKIPDATA 상태다  
D) Resolver query logging이 꺼져 있다  

**정답: B**  
해설: 보안 그룹은 stateful이라 인바운드를 허용하면 응답이 자동 허용되지만, NACL은 stateless라 인바운드·아웃바운드를 별도로 평가한다. 응답은 임시 포트(ephemeral, 1024-65535)로 나가므로 NACL outbound에서 이 범위를 허용하지 않으면 `REJECT`된다. SG가 stateful이라는 점은 오히려 SG가 원인이 아님을 시사하고, SKIPDATA·Resolver 로깅은 무관하다.

---

**문제 4.** 내부 인스턴스가 비정상적으로 길고 무작위한 서브도메인에 대한 다량의 DNS TXT 쿼리를 보낸다. 어떤 위협이며 어떤 로그가 이를 드러내는가?

A) 포트 스캔 — VPC Flow Logs  
B) DNS 터널링을 통한 데이터 유출 — Route 53 Resolver 쿼리 로그  
C) SQL 인젝션 — WAF 로그  
D) 브루트포스 — CloudTrail  

**정답: B**  
해설: 엔트로피 높은 긴 서브도메인에 대한 다량 TXT 쿼리는 도메인 이름에 데이터를 인코딩해 빼내는 DNS 터널링의 전형적 패턴이다. Route 53 Resolver 쿼리 로그가 어느 인스턴스가 어떤 도메인을 조회했는지 기록해 이를 드러낸다. 능동 차단은 Resolver DNS Firewall로 한다. 포트 스캔·SQLi·브루트포스는 다른 계층의 위협이다.

---

**문제 5.** Route 53 Resolver 쿼리 로깅을 켰는데 일부 인스턴스의 DNS 조회가 로그에 나타나지 않는다. 가장 가능성 높은 원인은?

A) Flow Logs가 우선순위를 가져간다  
B) 해당 인스턴스가 외부 DNS 서버(예: 8.8.8.8)를 직접 지정해 Route 53 Resolver를 우회한다  
C) 쿼리 로그는 S3에만 저장된다  
D) Resolver는 A 레코드만 기록한다  

**정답: B**  
해설: Resolver 쿼리 로깅은 VPC의 Route 53 Resolver를 *거치는* 쿼리만 기록한다. 인스턴스가 외부 공용 DNS를 직접 지정하면 Resolver를 우회해 로그에 남지 않는다. 그래서 베이스라인은 DNS를 Resolver로 강제하고 외부 DNS egress를 제한하는 것이다. 쿼리 로그는 CloudWatch/S3/Firehose로 보낼 수 있고 특정 레코드 타입만 기록하지 않으며, Flow Logs와 우선순위 경쟁 관계도 아니다.

---
