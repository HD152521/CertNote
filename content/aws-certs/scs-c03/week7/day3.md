# Day 3 - VPC Flow Logs와 네트워크 로깅: 트래픽으로 침해·오구성 탐지, Route 53 Resolver 쿼리 로그

CloudTrail은 제어 평면(API)을, Config는 구성 상태를 본다. 하지만 "실제로 어떤 패킷이 어디로 흘렀는가"는 둘 다 보지 못한다. **VPC Flow Logs**가 이 빈틈을 메운다. Flow Logs는 ENI(Elastic Network Interface)를 드나든 IP 트래픽의 *메타데이터*(5-tuple, 바이트 수, 허용/거부 등)를 기록한다. 패킷 *내용(payload)*은 캡처하지 않는다 — 그건 Traffic Mirroring의 영역이다.

보안 시험에서 Flow Logs는 "비정상 트래픽 탐지", "보안 그룹·NACL 오구성 진단", "데이터 유출 탐지", "거부된 연결 추적"의 1차 증거다.

> 📚 **사례**: 2019년 Capital One 침해가 클라우드 보안 교육에서 반복 인용되는 이유 중 하나는, **침해의 각 단계가 서로 다른 로그에만 흔적을 남겼다**는 점 때문이다. 애플리케이션 계층의 SSRF 취약점 악용은 애플리케이션·WAF 로그에, 인스턴스 메타데이터에서 얻은 역할 자격증명의 사용은 CloudTrail에, 그리고 데이터가 실제로 밖으로 나간 사실은 네트워크 계층에 남았다. 어느 한 로그만 보고 있었다면 "정상 권한을 가진 역할이 정상 API를 호출했다"는 그림밖에 보이지 않는다. 네트워크 로깅이 이 사건에서 갖는 의미는 탐지의 *마지막 방어선*이라는 것이다 — 자격증명이 정상이고 API 호출도 정상일 때, 이상함이 드러나는 유일한 지점은 "평소 나가지 않던 곳으로, 평소와 다른 양이" 나갔다는 트래픽의 형태다.

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

### 한 줄을 끝까지 읽어 보기

위 두 번째 줄을 필드별로 완전히 분해하면 이렇게 된다. 시험에서 로그 행을 던져 주고 해석을 묻는 유형이 나오므로, 순서를 외워 두는 편이 빠르다.

```
2 111122223333 eni-0abc 10.0.1.20 198.51.100.5 443 49321 6 5000 7340032 1719216000 1719216060 ACCEPT OK
│ │            │        │         │            │   │     │ │    │       │          │          │      │
│ │            │        │         │            │   │     │ │    │       │          │          │      └ log-status
│ │            │        │         │            │   │     │ │    │       │          └ end (Unix 시각)
│ │            │        │         │            │   │     │ │    │       └ start (Unix 시각)
│ │            │        │         │            │   │     │ │    └ bytes  = 7,340,032 (약 7MB)
│ │            │        │         │            │   │     │ └ packets = 5,000
│ │            │        │         │            │   │     └ protocol = 6 (TCP)
│ │            │        │         │            │   └ dstport = 49321
│ │            │        │         │            └ srcport = 443
│ │            │        │         └ dstaddr (목적지)
│ │            │        └ srcaddr (출발지)
│ │            └ interface-id (어느 ENI를 지났나)
│ └ account-id
└ version
```

이 한 줄이 말하는 것은 "내부 10.0.1.20의 443 포트에서 외부 198.51.100.5의 임시 포트로 60초 동안 약 7MB가 나갔고 허용되었다"이다. **`srcport`가 443이라는 점**이 중요한 단서다 — 443이 출발지 포트라는 것은 이 흐름이 *서버가 클라이언트에게 응답하는 방향*이라는 뜻이므로, "우리 웹서버가 외부 클라이언트에게 7MB를 내려 주었다"로 읽힌다. 반대로 `dstport`가 443이었다면 "내부에서 외부 HTTPS 서비스로 나가는 요청"이 된다. 유출 조사에서 방향을 거꾸로 읽는 실수가 놀랄 만큼 잦다.

| protocol 번호 | 프로토콜 | 보안 관점에서의 의미 |
|--------------|---------|---------------------|
| 1 | ICMP | 대량 발생 시 스캔·터널링 의심 |
| 6 | TCP | 대부분의 애플리케이션 트래픽 |
| 17 | UDP | DNS(53), VPN, 그리고 DNS 터널링 |
| 47 / 50 / 51 | GRE / ESP / AH | 예상 못한 VPN·터널이 서 있다는 신호 |

`tcp-flags`(커스텀 형식 필드)는 비트마스크로 들어온다. 값 자체가 탐지 규칙이 된다.

| 값 | 플래그 | 무엇을 뜻하나 |
|----|-------|--------------|
| 2 | SYN | 연결 시도. **SYN만 잔뜩 = 포트 스캔** |
| 18 | SYN-ACK | 연결 수락. 스캔이 *성공*했다는 뜻이라 더 심각하다 |
| 1 | FIN | 정상 종료 |
| 4 | RST | 거부·비정상 종료. RST 폭증은 스캔의 반대편 지문 |

> ⚠️ **함정**: `bytes`는 그 집계 구간에서 관찰된 **누적 바이트**이지 단일 요청의 크기가 아니다. 그리고 Flow Logs는 **집계 윈도(기본 약 10분, 설정 시 1분)** 단위로 흐름을 모아서 떨구므로, 하나의 긴 연결은 여러 행에 쪼개져 나타난다. 유출량을 추정할 때 한 행의 `bytes`만 보고 판단하면 실제 규모를 크게 과소평가한다. 반드시 `srcaddr`·`dstaddr`·포트로 묶어 **구간 합계**를 내야 한다. 같은 이유로 Flow Logs는 "지금 이 패킷을 막아라"에 쓸 수 없다 — 로그가 도착할 때쯤 그 연결은 이미 끝나 있다.

### 기록되지 않는 트래픽: 사각지대를 미리 알아 두기

Flow Logs가 *모든* 트래픽을 남긴다고 믿으면 조사에서 잘못된 결론에 도달한다. 설계상 제외되는 것들이 있다.

| 기록되지 않는 것 | 왜 중요한가 |
|-----------------|------------|
| 인스턴스 메타데이터 서비스(169.254.169.254) 통신 | **SSRF로 자격증명을 훔쳐 간 흔적이 Flow Log에 없다** |
| Amazon 제공 DNS 서버와의 쿼리 | DNS 가시성은 Resolver 쿼리 로그가 맡아야 한다 |
| DHCP 트래픽 | — |
| Amazon Time Sync 서비스 통신 | — |
| Windows 라이선스 정품 인증 트래픽 | — |
| VPC 라우터 예약 IP로의 트래픽 | — |

첫 줄이 보안 시험에서 결정적이다. 메타데이터 서비스 호출은 인스턴스 내부에서 링크 로컬 주소로 일어나므로 ENI를 통과하는 흐름으로 기록되지 않는다. 즉 **"인스턴스가 메타데이터에서 자격증명을 꺼내 갔다"는 사실을 Flow Logs로는 볼 수 없다.** 이 사각지대를 메우는 것은 IMDSv2 강제(예방)와 CloudTrail에서 그 역할 자격증명이 *어디서* 쓰였는지 확인하는 것(탐지)이다. 두 번째 줄도 같은 맥락이다 — Amazon 제공 DNS로 가는 쿼리가 Flow Log에 남지 않기 때문에 DNS 가시성은 오늘 뒤에서 다룰 Resolver 쿼리 로그가 따로 담당한다.

> ⚠️ **함정**: 한 번 만든 flow log의 **형식·필드·집계 간격은 나중에 수정할 수 없다.** 바꾸려면 삭제하고 새로 만들어야 하며, 그 사이의 트래픽은 기록되지 않는다. 그래서 처음 만들 때 커스텀 형식으로 필요한 필드를 넉넉히 넣어 두는 편이 낫다 — 특히 `pkt-srcaddr`, `pkt-dstaddr`, `flow-direction`, `traffic-path`, `tcp-flags`, `instance-id`는 나중에 반드시 아쉬워지는 필드들이다. 로그 설계에서 "일단 기본값으로 켜 두고 나중에 늘리자"는 거의 항상 손해다.

> ⚠️ **함정**: Flow Logs는 **메타데이터만** 기록한다. "패킷 내용을 검사해 멀웨어 시그니처를 찾으라"가 나오면 Flow Logs가 아니라 **VPC Traffic Mirroring**(전체 패킷 복제 후 IDS/IPS로 분석)이 정답이다. 또 Flow Logs는 *실시간 캡처가 아니라* 집계 윈도(기본 약 10분, 또는 1분)로 모아 떨군다 — 즉 즉각적 패킷 단위 차단 도구가 아니다.

## 커스텀 형식과 깊은 가시성 필드

기본 형식 외에 **custom format**으로 추가 필드를 넣을 수 있고, 이들이 시험·실무의 핵심이다:
- `vpc-id`, `subnet-id`, `instance-id`: 어느 리소스인지.
- `tcp-flags`: SYN/ACK/FIN/RST 플래그 — 포트 스캔(SYN만 잔뜩) 탐지에 유용.
- `pkt-srcaddr` / `pkt-dstaddr`: NAT·로드밸런서 뒤의 *원래* 주소(`srcaddr`/`dstaddr`는 ENI 기준).
- `flow-direction`: `ingress`/`egress`.
- `traffic-path`: egress 트래픽이 어떤 경로(IGW, NAT, VPC peering, TGW 등)로 나갔는지.

> 💡 **관련 이론**: `pkt-srcaddr`와 `srcaddr`의 구분은 보안 분석의 핵심 개념인 *주소 변환 투명성*과 닿는다. NAT 게이트웨이 뒤에서 여러 인스턴스가 같은 공인 IP로 나가면, `srcaddr`만으로는 어느 인스턴스가 외부와 통신했는지 모른다. `pkt-srcaddr`(NAT 이전 원본 사설 IP)가 있어야 데이터 유출의 진짜 출처를 특정할 수 있다. 침해 조사에서 "어느 EC2가 C2 서버와 통신했나"를 답하려면 이 필드가 결정적이다.

```
[ 같은 통신이 NAT 앞뒤에서 어떻게 다르게 기록되는가 ]

  10.0.1.20 ─┐
  10.0.1.21 ─┼─▶ NAT GW (203.0.113.9) ─▶ 인터넷 (198.51.100.5)
  10.0.1.22 ─┘

  NAT의 ENI에서 본 흐름 :  srcaddr=203.0.113.9   pkt-srcaddr=10.0.1.21
                            └ 셋을 구분 못 함        └ 진짜 출처가 여기 있다

  인스턴스 ENI에서 본 흐름:  srcaddr=10.0.1.21    pkt-srcaddr=10.0.1.21
                            └ 여기서는 둘이 같다
```

VPC 수준으로 flow log를 켜면 NAT의 ENI와 인스턴스의 ENI **양쪽 모두**에서 같은 통신이 두 번 기록된다. 조사에서 "왜 트래픽이 두 배로 보이지?"의 답이 대개 이것이고, 동시에 이것이 유출 추적을 가능하게 하는 장치이기도 하다.

### 커스텀 형식으로 켜 두면 좋은 조합

```bash
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-0abc1234 \
  --traffic-type ALL \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::central-network-logs/vpc-flow/ \
  --max-aggregation-interval 60 \
  --log-format '${version} ${account-id} ${vpc-id} ${subnet-id} ${instance-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${tcp-flags} ${packets} ${bytes} ${start} ${end} ${action} ${log-status} ${pkt-srcaddr} ${pkt-dstaddr} ${flow-direction} ${traffic-path}'
```

`traffic-path`는 egress 트래픽이 *어떤 경로로* 나갔는지를 숫자로 알려 준다 — 인터넷 게이트웨이를 통해 직접인지, NAT를 거쳤는지, VPC 피어링인지, Transit Gateway인지, VPN인지, Direct Connect인지. 데이터 유출 조사에서 이 필드가 중요한 이유는, **"승인된 경로로 나갔는가"** 를 묻게 해 주기 때문이다. 사설 연결만 허용된 계정의 트래픽이 인터넷 게이트웨이 경로로 나갔다면 그 자체로 정책 위반이며, 경로를 모르면 목적지 IP만 보고는 알 수 없는 사실이다.

> 🔍 **더 깊이**: `flow-direction`이 추가되기 전에는 분석가가 포트 번호와 주소로 방향을 *추론*해야 했고, 그 추론이 자주 틀렸다. 방향을 명시적으로 기록한다는 것은 단순한 편의 이상의 의미가 있다 — 탐지 규칙을 **"내부에서 밖으로 나가는 흐름 중"** 같은 조건으로 정확히 한정할 수 있게 되기 때문이다. 데이터 유출 탐지 규칙의 대부분은 방향에 의존한다. 같은 "10GB 전송"이라도 ingress면 정상 업로드일 수 있고 egress면 사고일 수 있다. 로그 스키마 설계에서 *추론해야 하는 것을 기록해 주는 필드*는 언제나 탐지 정확도를 한 단계 올린다.

## Flow Logs로 침해·오구성 탐지하기

**오구성 진단** — "연결이 안 되는데 SG 문제인가 NACL 문제인가?":
- Flow Log에 `REJECT`가 보이면 SG 또는 NACL이 막은 것이다. SG는 *stateful*이라 인바운드 허용 시 응답이 자동 허용되지만, NACL은 *stateless*라 인바운드·아웃바운드(임시 포트 포함)를 따로 열어야 한다. `REJECT`가 한 방향만 보이면 NACL의 비대칭 규칙을 의심한다.
- `ACCEPT`로 들어왔는데 응답이 안 나가면 NACL outbound 임시 포트(1024-65535) 미허용이 흔한 원인이다.

```
[ 패킷이 지나는 관문과 Flow Log에 남는 모습 ]

  외부 클라이언트
       │  ① 요청 (dst 443)
       ▼
  ┌─────────────┐
  │ NACL 인바운드│  stateless — 규칙에 없으면 거부
  └──────┬──────┘         거부 시 → REJECT 기록
         ▼
  ┌─────────────┐
  │  SG 인바운드 │  stateful — 허용되면 응답은 자동 통과
  └──────┬──────┘         거부 시 → REJECT 기록
         ▼
     인스턴스 (처리)
         │  ② 응답 (src 443 → dst 임시포트)
         ▼
  ┌─────────────┐
  │ SG 아웃바운드│  ← 평가하지 않음(stateful, 응답은 자동 허용)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │NACL 아웃바운드│ stateless — 임시 포트(1024-65535)를
  └──────┬──────┘   허용하지 않으면 여기서 REJECT
         ▼
     밖으로

  → 진단 규칙: 인바운드는 ACCEPT인데 아웃바운드가 REJECT면
    범인은 거의 항상 NACL의 임시 포트 규칙이다. SG는 이 증상을 만들 수 없다.
```

이 그림을 외워 두면 "연결이 안 된다" 유형 문제를 로그 두 줄만 보고 가른다. **SG는 비대칭 실패를 만들 수 없고, NACL만 만들 수 있다** — 이 한 문장이 진단의 전부다.

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

```sql
-- 유출 후보: egress 방향으로 대량 전송한 내부 IP를 목적지별로 합산
SELECT pkt_srcaddr        AS internal_source,
       dstaddr            AS external_destination,
       dstport,
       sum(bytes)         AS total_bytes,
       count(*)           AS flow_records,
       min(from_unixtime(start)) AS first_seen,
       max(from_unixtime("end")) AS last_seen
FROM vpc_flow_logs
WHERE flow_direction = 'egress'
  AND action = 'ACCEPT'
  AND date >= '2026-06-20'
GROUP BY pkt_srcaddr, dstaddr, dstport
HAVING sum(bytes) > 1073741824      -- 1GB 이상
ORDER BY total_bytes DESC;

-- 포트 스캔: 한 출발지가 짧은 시간에 다수의 목적지 포트로 SYN만 던진 경우
SELECT srcaddr,
       count(DISTINCT dstport) AS ports_touched,
       count(DISTINCT dstaddr) AS hosts_touched,
       sum(packets)            AS pkts
FROM vpc_flow_logs
WHERE tcp_flags = 2                  -- SYN만 (SYN-ACK=18이 아님)
  AND date = '2026-06-24'
GROUP BY srcaddr
HAVING count(DISTINCT dstport) > 50
ORDER BY ports_touched DESC;

-- 스캔이 '성공'한 조합만 — 실제로 응답한 서비스가 무엇이었나
SELECT srcaddr, dstaddr, dstport, count(*) AS handshakes
FROM vpc_flow_logs
WHERE tcp_flags = 18                 -- SYN-ACK
  AND date = '2026-06-24'
GROUP BY srcaddr, dstaddr, dstport
ORDER BY handshakes DESC;

-- 승인되지 않은 경로로 나간 트래픽 (사설 연결만 허용된 계정에서)
SELECT pkt_srcaddr, dstaddr, traffic_path, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE flow_direction = 'egress'
  AND action = 'ACCEPT'
  AND traffic_path IN (1, 2)         -- IGW 경유 / VPC 내 다른 리소스 경유
GROUP BY pkt_srcaddr, dstaddr, traffic_path
ORDER BY total_bytes DESC;
```

두 번째와 세 번째 쿼리를 **한 쌍으로** 돌리는 것이 실무의 요령이다. SYN만 잔뜩인 것(스캔 시도)은 흔하고 대부분 인터넷 배경 소음이지만, 같은 출발지에서 SYN-ACK가 나온 조합(스캔 *성공*)은 훨씬 적고 훨씬 중요하다. 탐지의 우선순위는 "시도"가 아니라 "성공"에 둔다.

> 🎯 **시나리오**: "EC2가 평소와 달리 외부 미상 IP로 대량 데이터를 보낸다. 어떤 로그로 진단하나?" 정답: VPC Flow Logs(custom format에 `pkt-srcaddr`, `bytes`, `flow-direction=egress` 포함)로 egress 볼륨과 원본 인스턴스를 특정. 더 자동화하려면 GuardDuty가 Flow Logs·DNS·CloudTrail을 분석해 이런 패턴을 자동 탐지한다(7~8주 후반 주제와 연결).

> ⚠️ **함정**: GuardDuty에 대해 자주 나오는 오해가 있다. GuardDuty는 VPC Flow Logs·DNS 로그·CloudTrail을 기반 데이터로 삼지만, **그 로그들을 사용자가 켜 두어야만 동작하는 것은 아니다.** GuardDuty는 이 데이터를 독립적으로 확보해 분석하며, 사용자가 flow log를 끄더라도 GuardDuty의 탐지는 계속된다. 그렇다면 왜 flow log를 따로 켜는가? **GuardDuty는 "이상하다"고 알려 주지만 원본 증거를 손에 쥐여 주지는 않기 때문**이다. 조사에서 "정확히 몇 바이트가, 어느 포트로, 몇 시 몇 분에" 나갔는지를 세려면 내가 보관한 flow log가 있어야 한다. 탐지(GuardDuty)와 증거(flow log)는 서로를 대체하지 않는다 — 시험이 "탐지 자동화"를 물으면 GuardDuty, "포렌식 증거·상세 분석"을 물으면 flow log다.

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

### 기록에서 차단으로: Resolver DNS Firewall

쿼리 로그가 *본다*면, DNS Firewall은 *막는다*. 도메인 목록(AWS 관리형 위협 목록 또는 직접 만든 목록)을 규칙 그룹으로 묶어 VPC에 연결하고, 각 규칙에 동작을 지정한다.

| 동작 | 결과 | 언제 쓰나 |
|------|------|----------|
| `ALLOW` | 통과 | 명시적 허용(허용목록 앞단) |
| `ALERT` | 통과시키되 로그에 표시 | **차단 전 영향도 관찰 단계** |
| `BLOCK` | 차단 | 실제 차단 |

`BLOCK`일 때 클라이언트에게 무엇을 돌려줄지도 고를 수 있다 — `NODATA`(응답은 있으나 레코드 없음), `NXDOMAIN`(그런 도메인 없음), 또는 `OVERRIDE`(지정한 다른 이름으로 돌려보내기). 세 번째가 흥미롭다. 악성 도메인 조회를 조직 내부의 싱크홀(sinkhole) 서버로 돌리면, **차단하는 동시에 어떤 호스트가 계속 그 도메인을 부르는지 관찰**할 수 있다. 감염 인스턴스를 찾아내는 고전적인 기법이다.

```bash
# 1) 차단할 도메인 목록
aws route53resolver create-firewall-domain-list --name corp-blocklist
aws route53resolver update-firewall-domains \
  --firewall-domain-list-id rslvr-fdl-0abc \
  --operation ADD \
  --domains "malicious-c2.example." "*.dyndns-suspicious.example."

# 2) 규칙 그룹에 규칙 추가 — 먼저 ALERT로 시작하는 것이 안전하다
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-0def \
  --firewall-domain-list-id rslvr-fdl-0abc \
  --priority 100 \
  --action ALERT \
  --name observe-before-blocking

# 3) 관찰 후 차단으로 전환 + 싱크홀로 유도
aws route53resolver update-firewall-rule \
  --firewall-rule-group-id rslvr-frg-0def \
  --firewall-domain-list-id rslvr-fdl-0abc \
  --action BLOCK \
  --block-response OVERRIDE \
  --block-override-domain sinkhole.corp.internal. \
  --block-override-dns-type CNAME \
  --block-override-ttl 60

# 4) VPC에 연결 — 연결하지 않으면 규칙은 아무 일도 하지 않는다
aws route53resolver associate-firewall-rule-group \
  --firewall-rule-group-id rslvr-frg-0def \
  --vpc-id vpc-0abc1234 \
  --priority 101 --name prod-vpc-dns-guard
```

> ⚠️ **함정**: DNS Firewall에는 **실패 모드(fail-open / fail-close)** 설정이 있다. 방화벽이 응답하지 못하는 상황에서 쿼리를 그냥 통과시킬 것인지(`FAIL_OPEN`), 아니면 막을 것인지(`FAIL_CLOSE`)를 정하는 값이다. 보안만 보면 `FAIL_CLOSE`가 맞지만, 이것은 곧 **"DNS 방화벽이 흔들리면 모든 이름 해석이 멈춘다"** 는 뜻이며 실질적으로 서비스 전면 장애다. 반대로 `FAIL_OPEN`은 가용성을 지키는 대신 장애 구간이 보안 공백이 된다. 정답이 하나로 정해져 있지 않은, 가용성과 보안의 전형적 교환이다. 시험에서 "규제상 어떤 경우에도 악성 도메인 해석이 허용돼서는 안 된다"는 문구가 있으면 `FAIL_CLOSE`, "가용성이 최우선"이면 `FAIL_OPEN`으로 갈린다.

> 💡 **관련 이론**: `ALERT`로 시작해 `BLOCK`으로 넘어가는 순서는 2일차의 Config 자동 교정 도입 순서(관찰 → 수동 → 자동)와 정확히 같은 형태다. 이것은 우연이 아니라 **모든 차단형 통제의 공통 패턴**이다. 차단 규칙의 진짜 위험은 악성 트래픽을 놓치는 것이 아니라 *정상 트래픽을 막아 장애를 내는 것*이고, 그 위험은 규칙을 만드는 시점에는 알 수 없으며 오직 실제 트래픽에 비춰 봐야만 드러난다. 그래서 성숙한 조직의 방화벽·WAF·DNS 차단 규칙은 예외 없이 "탐지 전용 기간"을 거친 뒤 차단으로 승격된다. 규칙을 만드는 능력보다 **규칙을 안전하게 켜는 절차를 갖는 능력**이 실무 역량이다.

## 네트워크 로깅 도구의 계층 정리

| 도구 | 보는 것 | 깊이 | 능동 차단 |
|------|--------|------|----------|
| VPC Flow Logs | IP 트래픽 메타데이터(5-tuple, 바이트, ACCEPT/REJECT) | L3/L4 헤더 | 아니오(기록만) |
| Traffic Mirroring | 전체 패킷 복제(payload 포함) | L2~L7 페이로드 | 아니오(분석용) |
| Resolver Query Log | DNS 쿼리/응답 | DNS 계층 | 아니오(기록만) |
| Resolver DNS Firewall | 도메인 기반 허용/차단 | DNS 계층 | 예 |
| Network Firewall | 상태기반 검사·IPS·도메인 필터링 | L3~L7 | 예 |

이 표에서 시험이 가장 자주 쓰는 갈림길은 **두 번째 열(무엇을 보는가)과 마지막 열(막을 수 있는가)** 이다. "탐지·조사"를 물으면 Flow Logs와 Resolver 쿼리 로그, "패킷 내용"을 물으면 Traffic Mirroring, "차단"을 물으면 DNS Firewall이나 Network Firewall이다. 로깅 도구를 차단 도구로, 차단 도구를 조사 도구로 답하는 것이 대표적 오답 패턴이다.

> 🔍 **더 깊이**: 성숙한 탐지 아키텍처는 이 로그들을 *상호 보강*으로 쓴다. Flow Log가 "10.0.1.20이 198.51.100.66:443으로 대량 egress"를 보여주고, 같은 시각 Resolver log가 "10.0.1.20이 `malicious-c2.example`을 조회해 198.51.100.66을 받았다"를 보여주면, IP만으로는 모호했던 통신의 *의도와 도메인 맥락*이 완성된다. 여기에 CloudTrail이 "그 인스턴스의 역할이 직전에 의심스러운 권한을 assume했다"를 더하면 침해 타임라인이 완성된다. 이 다층 상관(correlation)이 4일차의 로그 중앙화·보존, 5일차의 종합 시나리오로 이어진다. 모든 로그는 중앙 집계되어야 이런 교차 분석이 가능하다.

```
[ 세 로그를 시간축에 겹쳐 놓으면 서사가 만들어진다 ]

  08:14:22  CloudTrail    AssumeRole → AppRole (sourceIP 203.0.113.10)
                          ↑ 평소 이 역할을 맡던 IP가 아니다
  08:29:55  Resolver log  10.0.1.20 → malicious-c2.example (A)
                          응답 198.51.100.66
                          ↑ 이 도메인은 오늘 처음 조회됐다
  08:30:04  Flow Log      pkt-srcaddr 10.0.1.20 → 198.51.100.66:443
                          flow-direction egress, traffic-path IGW
                          bytes 7,340,032 (이후 구간 누적 4.2GB)
                          ↑ 이 인스턴스의 평소 egress는 수십 MB였다
  08:31:10  CloudTrail    GetObject × 다수 (데이터 이벤트)
                          resources: arn:aws:s3:::corp-sensitive/*

  ── 어느 한 줄도 단독으로는 "침해"라고 말하지 못한다.
     네 줄이 9분 안에 같은 인스턴스를 가리킬 때 비로소 결론이 선다.
```

이 그림이 이번 주 전체의 논지다. 로그의 가치는 개별 이벤트의 정밀도가 아니라 **여러 로그가 같은 대상을 가리킬 때 생기는 수렴**에서 나온다. 그리고 그 수렴은 로그들이 같은 곳에 모여 있고, 시각이 신뢰할 수 있으며, 아무도 그것을 지우지 않았을 때만 가능하다 — 그것이 내일(4일차)의 주제다.

## 한 줄 요약

네트워크 로그는 "정상 권한으로 정상 API를 호출한" 침해가 유일하게 이상해 보이는 지점이다. **VPC Flow Logs는 메타데이터만 남기고**(패킷 내용은 Traffic Mirroring), **집계 윈도 단위로 지연되어 도착하며**(실시간 차단 도구가 아니다), **메타데이터 서비스와 Amazon DNS 통신은 애초에 기록하지 않는다**(사각지대를 미리 알고 다른 통제로 메워야 한다). 한 줄을 읽을 때는 `srcport`/`dstport`로 방향을 먼저 확정하고, NAT 뒤를 추적할 때는 `srcaddr`이 아니라 `pkt-srcaddr`를 보며, 스캔은 `tcp-flags`가 2(SYN)인 것보다 18(SYN-ACK)인 것이 급하다. 연결 실패 진단의 황금률은 하나다 — **비대칭 실패는 SG가 만들 수 없고 NACL만 만든다.** DNS 쪽에서는 Resolver 쿼리 로그가 C2 비컨과 DNS 터널링을 드러내는 거의 유일한 증거이되 외부 DNS를 직접 지정한 인스턴스는 우회하므로, 로깅과 함께 DNS Firewall로 경로를 강제해야 완성된다. 그리고 그 방화벽은 언제나 `ALERT`로 먼저 켠다.

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
