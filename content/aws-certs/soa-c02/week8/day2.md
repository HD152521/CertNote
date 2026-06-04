# Day 2 - VPC 트래픽을 들여다보는 세 가지 도구, 그리고 메타데이터의 한계

VPC를 만들고 인스턴스를 띄우면 트래픽이 흐르기 시작한다. 그런데 "지금 무엇이 흐르고 있는지"를 보려고 하면 갑자기 막막해진다. 운영자가 가장 자주 묻는 질문은 셋이다 — ① 누가 누구와 얼마나 통신하고 있나, ② 의심스러운 패킷의 실제 내용은 무엇인가, ③ 이 인스턴스가 저 RDS에 정말로 닿을 수 있나. AWS는 이 세 질문에 각각 다른 도구를 준다. Flow Logs, Traffic Mirroring, Reachability Analyzer. 이름만 보면 비슷해 보이지만 본질이 완전히 다르다.

이 글에선 세 도구가 왜 따로 만들어졌는지, 각자 어떤 데이터 추상화 레벨에서 작동하는지, 그리고 운영자가 "어느 도구를 먼저 켜야 하는지" 결정하는 기준을 따라간다. 시험 관점에선 Flow Logs의 미기록 트래픽(169.254.x.x 함정)이 가장 빈출이지만, 실무에선 세 도구를 언제 같이 쓰는지가 더 중요하다.

## 메타데이터 vs 패킷 vs 시뮬레이션 — 세 가지 추상화

세 도구를 한 줄로 정리하면 다음과 같다.

| 도구 | 데이터 | 비용 | 분석 대상 |
|------|--------|------|-----------|
| Flow Logs | 메타데이터 (5-tuple + bytes/action) | 저렴 (Logs/S3 저장) | 누가 누구와 얼마나 |
| Traffic Mirroring | 실제 패킷 (payload 포함) | 비쌈 (트래픽 복제) | 무엇이 흐르는가 |
| Reachability Analyzer | 시뮬레이션 (정책·라우팅 평가) | 분석당 과금 | 닿을 수 있는가 |

이 세 가지가 OSI 모델의 다른 레이어를 본다. Flow Logs는 L3/L4까지(IP, 포트, 프로토콜), Traffic Mirroring은 L7까지 다 본다(HTTP 헤더, 본문), Reachability Analyzer는 패킷 자체를 보지 않고 **정책 그래프**를 본다(SG, NACL, Route Table, IGW의 연결 관계). 도구를 고를 땐 "어느 추상화 레벨의 답이 필요한가"를 먼저 물어야 한다.

> 💡 **관련 이론**: 네트워크 관측의 세 추상화는 1990년대 NetFlow(Cisco, 1996)와 sFlow(InMon, 2001)의 등장에서 시작됐다. NetFlow는 flow-level 메타데이터(AWS Flow Logs의 직계 조상)를, sFlow는 패킷 샘플링을 표준화했다. 그 후 IETF가 IPFIX(RFC 7011, 2008)로 NetFlow를 정식 표준화했고, AWS Flow Logs는 IPFIX와 매우 유사한 필드 구조를 갖는다. Traffic Mirroring은 Cisco SPAN/RSPAN(원격 스위치 포트 미러링)과 같은 모델이고, Reachability Analyzer는 학술계의 "Network Verification"(NetKAT, Batfish 등) 흐름의 AWS 구현이다.

## Flow Logs — 5-tuple 시대의 표준

Flow Logs는 ENI를 통과하는 모든 트래픽 흐름의 **요약**을 기록한다. 한 줄의 형식은 다음과 같다.

```
2 123456789012 eni-abc 10.0.1.5 8.8.8.8 51234 53 17 1 76 1748000000 1748000060 ACCEPT OK
```

읽는 법: version=2, account, ENI, src IP, dst IP, src port, dst port, protocol(17=UDP), packets, bytes, start/end Unix time, action(ACCEPT/REJECT), log-status. 한 줄이 하나의 "flow"인데, 정확히는 **aggregation interval(기본 10분 또는 1분) 동안의 같은 5-tuple 흐름의 합계**다. 같은 시간 구간 안에서 같은 src/dst/port/proto 조합은 한 줄로 합쳐진다.

이 사실은 두 가지 함의를 준다. 첫째, **개별 패킷이 안 보인다** — 1만 개 패킷을 한 줄로 요약했으니 페이로드, 패킷 간 간격, TCP 옵션 같은 건 다 사라진다. 둘째, **실시간이 아니다** — 10분 aggregation을 기다린 뒤에야 S3나 CloudWatch Logs에 도착하므로 보통 5-15분 지연된다(1분 aggregation을 쓰면 그래도 1-3분 지연).

### 미기록 트래픽 함정

시험에서 가장 자주 나오는 함정이 "Flow Logs에 안 기록되는 트래픽". 정확히 다섯 종류다.

- AWS DNS resolver (`169.254.169.253`) — VPC가 제공하는 DNS 트래픽
- Instance Metadata Service (`169.254.169.254`) — IMDS v1/v2
- Time Sync Service (`169.254.169.123`) — NTP
- Windows 라이선스 활성화 (`169.254.169.250`, `.251`)
- Default VPC router로 가는 DHCP

이게 왜 빠져 있나? **AWS 인프라 내부 트래픽**이라 hypervisor가 ENI 큐로 보내지 않고 mapping service에서 직접 처리한다. ENI를 통과하지 않으니 ENI 단위로 캡처하는 Flow Logs도 못 본다. 운영자가 "왜 IMDS 호출이 안 보이지"를 디버깅하다가 한참 헤매는 케이스가 흔한데, 이건 버그가 아니라 설계다.

> ⚠️ **함정**: 169.254.x.x 트래픽이 안 보인다는 사실은 시험 단골이지만, **TCP RST와 SYN-only 패킷도 보이지 않는 경우가 있다**. 정확히는 ENI에서 hypervisor가 즉시 거부한 패킷(예: 매칭되는 listening socket이 없어서 OS가 RST를 보내기 전에 hypervisor가 차단한 경우)은 일부 누락된다. 이건 시험 범위는 아니지만 실무에서 디버깅 시 알아두면 시간 절약된다.

### 저장소 — CloudWatch Logs vs S3

Flow Logs를 어디 보낼지가 운영 비용과 분석 속도를 결정한다.

| 측면 | CloudWatch Logs | S3 (Parquet) | Firehose → OpenSearch |
|------|-----------------|--------------|----------------------|
| 저장 비용 | 약 $0.50/GB ingest + $0.03/GB월 | $0.023/GB월 | Firehose + ES 비용 |
| 쿼리 | Logs Insights | Athena | Kibana |
| 알람 | Metric Filter → CloudWatch Alarm | 별도 구축 | 별도 구축 |
| 지연 | 1-3분 | 5-15분 | 1-5분 |
| 적합한 사용 | 실시간 알람, 짧은 보관 | 장기 저장, 컴플라이언스 | 대시보드 |

규모 큰 환경에선 보통 **S3 Parquet + Athena**가 압도적으로 저렴하다. 1TB의 Flow Logs를 한 달 보관할 때 CloudWatch Logs는 약 $530, S3 Parquet은 약 $25. 게다가 Parquet은 컬럼형 압축이라 Athena 쿼리가 스캔하는 바이트가 row-based 텍스트보다 5-10배 작다 — 쿼리 비용도 그만큼 줄어든다.

> 🔍 **더 깊이**: Parquet 포맷이 Athena에 유리한 이유는 두 가지다. 첫째, **컬럼 단위 압축**(snappy/gzip/zstd)으로 압축률이 좋다. 둘째, **predicate pushdown** — `WHERE action='REJECT'` 쿼리를 실행하면 Athena는 Parquet 메타데이터를 보고 action 컬럼이 모두 ACCEPT인 파일은 아예 열지 않는다. 게다가 AWS Flow Logs의 Parquet 포맷은 **Hive-compatible partitioning**(year=YYYY/month=MM/day=DD/hour=HH)을 지원해서 `WHERE year=2026 AND month=05`로 시간 범위 쿼리 시 다른 날짜 파티션은 아예 스캔하지 않는다. 잘 설계된 쿼리는 1TB 데이터에서 1MB만 스캔하기도 한다.

### Logs Insights vs Athena — 어느 쪽?

같은 데이터를 두 도구로 쿼리할 수 있다. 차이가 무엇인가?

**Logs Insights**는 CloudWatch Logs 전용의 SQL-like 언어로, 자체 인덱싱 구조 위에서 동작한다. 쿼리당 최대 60분치 또는 10,000 결과까지로 제한되고, 쿼리 시간이 5-30초 정도다. **실시간 트러블슈팅**에 적합하다.

**Athena**는 Presto/Trino 기반의 표준 SQL로 S3의 모든 데이터를 스캔한다. 무제한 데이터 크기, 표준 SQL의 모든 기능(JOIN, 윈도우 함수, CTE), 다른 데이터셋과 JOIN 가능. 단점은 **첫 쿼리가 느림**(파티션 메타데이터 로딩에 5-10초) 및 **스캔 바이트 단위 과금**($5/TB). **장기 분석, 보고서, 대시보드**에 적합하다.

운영 패턴: Logs Insights로 실시간 알람·디버깅, Athena로 월간 보안 감사·트래픽 추세 분석.

```sql
-- Logs Insights: 지난 1시간 거부 트래픽 Top 20
fields @timestamp, srcAddr, dstAddr, dstPort, action
| filter action = "REJECT"
| stats count(*) as rejects by srcAddr, dstPort
| sort rejects desc
| limit 20

-- Athena: 지난 30일 가장 트래픽 많은 인스턴스
SELECT instance_id, sum(bytes) / 1e9 as gb
FROM vpc_flow_logs
WHERE year=2026 AND month=5
GROUP BY instance_id
ORDER BY gb DESC
LIMIT 10;
```

## Logs Insights 쿼리 패턴 — 운영자가 매일 쓰는 5개

운영 환경에서 반복적으로 쓰는 쿼리가 있다. 대부분 다음 다섯 패턴 안에 들어간다.

**① 거부 트래픽 Top — 공격 탐지**

```
fields @timestamp, srcAddr, dstAddr, dstPort
| filter action = "REJECT"
| stats count(*) as rejects by srcAddr, dstPort
| sort rejects desc | limit 20
```

같은 src에서 여러 dstPort로 REJECT가 쏟아지면 포트 스캔 시도. 같은 src에서 같은 dstPort로 수천 건이면 brute-force.

**② Top Talker — 비용 누수 추적**

```
fields bytes
| stats sum(bytes) / 1e9 as gb by srcAddr
| sort gb desc | limit 10
```

NAT GW 비용이 폭증할 때 누가 데이터를 가장 많이 보내는지. 종종 의도치 않은 S3 동기화 작업이나 백업 스크립트가 범인이다.

**③ 특정 인스턴스의 통신 상대**

```
filter interfaceId = "eni-abc"
| stats sum(bytes) as totalBytes by dstAddr, dstPort
| sort totalBytes desc
```

한 인스턴스가 "어디와 통신하는지" 한눈에. 보안 사고 조사 시 격리 대상의 통신 패턴 파악.

**④ 시간대별 트래픽 패턴**

```
stats sum(bytes) / 1e9 as gb by bin(5m)
| sort @timestamp asc
```

특정 시간대의 트래픽 spike. cron job이나 ETL 작업의 시간대 확인.

**⑤ pkt-srcaddr와 srcAddr 차이 — NAT 추적**

Custom format으로 `${pkt-srcaddr}`를 포함하면 NAT 적용 전 원본 IP를 볼 수 있다. NAT GW 뒤에 있는 인스턴스를 추적할 때 필수.

```
fields srcAddr, pktSrcAddr, dstAddr, dstPort
| filter srcAddr = "10.0.100.50"   # NAT GW IP
| stats count(*) by pktSrcAddr     # 실제 발신 인스턴스
```

> 📚 **사례**: 2019년 Capital One의 데이터 유출 사고에서 공격자가 WAF 우회로 IMDS 자격증명을 탈취해 S3 데이터를 외부로 빼냈다. 당시 Capital One은 Flow Logs가 켜져 있었지만 알람이 없어서 며칠간 발견을 못 했다. 사후에 Logs Insights로 분석하니 평소 대비 비정상적으로 큰 outbound 트래픽이 명확히 보였다. 이 사건 이후 AWS는 GuardDuty의 "Exfiltration" 검사 룰을 강화했고, Flow Logs + GuardDuty 결합이 표준 권장 사항이 됐다. Logs Insights + Metric Filter + CloudWatch Alarm으로 "한 ENI에서 outbound bytes가 baseline의 5배 이상" 같은 알람을 깔아두는 게 첫 단계다.

## Traffic Mirroring — Nitro 칩이 만든 새 가능성

Flow Logs로 부족할 때 — 즉 "패킷 자체를 봐야 할 때" — Traffic Mirroring을 쓴다. ENI를 통과하는 실제 패킷을 다른 ENI나 NLB로 복사한다. 받는 쪽에 Suricata나 Zeek 같은 IDS를 두면 HTTP 헤더부터 TLS handshake까지 깊이 분석할 수 있다.

핵심 제약은 **Nitro 기반 인스턴스만 지원**한다. 왜 그런지가 Day 1에서 이야기한 SDN 아키텍처와 연결된다 — Nitro Card가 패킷을 보고 있어야 복사도 가능하다. Xen hypervisor 시절(2017 이전)의 인스턴스 타입(c4, m4, r4 등 이전 세대)은 hypervisor가 패킷을 보지만 Traffic Mirroring API가 노출돼 있지 않았다. Nitro 이후엔 SDN 칩이 표준 API로 노출돼서 가능해졌다.

### 구성 요소 4개

| 컴포넌트 | 역할 |
|----------|------|
| Mirror Source | 패킷을 복사할 ENI (Nitro 인스턴스의 ENI) |
| Mirror Target | 복사본 받는 ENI 또는 NLB |
| Mirror Filter | 어떤 트래픽을 복사할지 (5-tuple 기반) |
| Mirror Session | Source + Target + Filter 묶음 |

Mirror Filter가 5-tuple 기반이라는 게 중요한데, Filter Rule도 NACL처럼 **번호 순으로 평가되고 첫 매칭이 적용된다**. 그래서 100, 110, 120 컨벤션을 또 만나게 된다(Day 1에서 본 BASIC 줄 번호 매기기 패턴이 여기서도 등장).

Mirror Target이 NLB일 수 있다는 점도 운영상 중요하다. 분석 인스턴스가 여러 대일 때 NLB가 부하 분산을 해주고, 분석 인스턴스 하나가 죽어도 다른 인스턴스가 받는다. 단일 ENI target은 SPOF다.

### 비용과 운영 함정

Traffic Mirroring은 **트래픽을 복제해서 보내는 비용**이 따로 청구된다. 즉, 100Mbps 흐름을 미러링하면 100Mbps 추가 트래픽이 생긴다. 게다가 mirror target이 다른 AZ나 다른 VPC에 있으면 cross-AZ/cross-VPC 데이터 전송 비용까지 발생한다. 운영자가 자주 빠지는 함정은 "특정 의심 인스턴스만 미러링하면 비용이 적을 줄 알았는데, 그 인스턴스가 일반 웹 서버라 트래픽이 어마어마"한 경우.

운영 권장 패턴: ① Mirror Filter로 의심스러운 프로토콜만(예: TCP/445 SMB) 좁히기, ② 단기간만 활성화 후 비활성화, ③ 분석 인스턴스에 처리 한계가 있으므로 source 트래픽 양 사전 측정.

> 🔍 **더 깊이**: Traffic Mirroring이 패킷을 복사할 때 **VXLAN 캡슐화**를 한다. 원본 패킷이 그대로 가는 게 아니라 VXLAN 헤더(8 bytes) + UDP 헤더(8 bytes) + IP 헤더(20 bytes) = 36 bytes 오버헤드가 추가된다. 그래서 MTU가 작은 환경에선 미러링된 패킷이 fragmentation을 겪을 수 있다. 분석 인스턴스의 OS가 VXLAN을 decap해야 원본 패킷을 볼 수 있는데, 보통 Suricata/Zeek는 이걸 자동으로 처리하지만, 직접 만든 캡처 도구는 명시적 구성이 필요하다.

## Reachability Analyzer — 패킷 없이 답을 얻는다

"왜 이 EC2가 RDS에 접근 못 하지"는 운영자가 매일 마주치는 질문이다. 점검 항목이 많다 — SG, NACL, Route Table, IGW/NAT 라우팅, Transit Gateway 라우팅, VPC Peering 활성 여부, DNS resolve, 인스턴스 OS 방화벽. 사람이 일일이 체크하면 30분, 잘못 짚으면 1시간. Reachability Analyzer는 이걸 **정책 그래프 분석으로 30초에 끝낸다**.

원리는 패킷을 실제로 보내지 않는다. AWS 내부적으로 source와 destination 사이의 모든 hop을 그래프로 모델링하고, 각 hop에서 정책이 통과/차단을 결정하는지 평가한다. 결과는 다음 형태로 나온다.

```
Path: i-source → SG-source → Subnet RT → IGW → ... → SG-dest → i-dest
Status: Not Reachable
Blocking component: SG-dest (인바운드 규칙에 80/tcp 없음)
```

이 한 줄이 30분의 디버깅을 대체한다. 시험 답안으로도 "연결성 문제 시 가장 먼저 무엇을 보는가"는 거의 항상 Reachability Analyzer다.

### 점 대 점 vs 광역 — Network Access Analyzer

Reachability Analyzer는 **두 리소스 간(point-to-point)** 분석이다. "이 EC2와 저 RDS"의 1:1 관계. 그런데 보안 감사 관점에선 "인터넷에서 직접 도달 가능한 모든 인스턴스"처럼 광역 질문이 더 중요하다. 이게 **Network Access Analyzer**의 역할이다.

NAA는 **Access Scope**라는 쿼리를 정의한다 — "Source = IGW, Destination = 모든 EC2 인스턴스, Protocol = TCP/22"같은 형태. 그러면 AWS가 모든 가능한 경로를 스캔해서 매칭되는 경우를 리스트로 돌려준다.

| 도구 | 질문 형태 | 사용 시나리오 |
|------|-----------|---------------|
| Reachability Analyzer | "A에서 B로 닿나?" | 트러블슈팅 (1:1) |
| Network Access Analyzer | "외부에서 들어올 수 있는 모든 경로는?" | 보안 감사 (광역) |

대형 환경에서 NAA를 정기 실행하면 "어제까지 안전했는데 오늘 새 SG 추가로 IGW 노출된 인스턴스"가 자동으로 탐지된다. Config Rule이나 Lambda 정기 실행과 결합하는 게 일반적이다.

> 💡 **관련 이론**: Reachability Analyzer의 알고리즘은 학술계의 **Network Verification** 분야에서 발전한 기법이다. 2010년대 초 Stanford의 Header Space Analysis(HSA)와 그 후속 NetKAT(Cornell), Batfish(Princeton/Intentionet)가 같은 문제를 풀었다 — "네트워크 정책을 SMT solver나 BDD로 모델링해서 도달성 결정". AWS는 이 학술 기법을 SDN 컨트롤 플레인에 통합해 상품화했다. 이 분야 논문 한 편을 추천한다면 "A General Approach to Network Configuration Analysis"(Fogel et al., NSDI 2015) — Batfish의 원조 논문이고 Reachability Analyzer가 비슷한 방향이다.

## IPAM — 멀티 계정의 IP 거버넌스

운영 환경이 커지면 **IP 주소 충돌**이 새로운 문제가 된다. 50개 계정에 100개 VPC를 만들다 보면 누군가 `10.5.0.0/16`을 두 군데서 쓰게 되고, 이 두 VPC를 Transit Gateway로 연결할 때 라우팅이 불가능해진다. CIDR 충돌은 한 번 생기면 한쪽 VPC를 재구성해야 풀린다 — 모든 인스턴스의 IP가 바뀌므로 다운타임 + 설정 변경 + 테스트가 따른다.

IPAM(IP Address Manager)이 이 문제를 푼다. 중앙에서 IP Pool을 정의하고("`10.0.0.0/8`을 prod에, `172.16.0.0/12`를 dev에"), 각 계정/리전이 그 pool에서 자동 할당받게 강제한다. AWS Organizations와 통합돼서 SCP로 "IPAM 외부에서 VPC 생성 금지" 같은 거버넌스도 가능하다.

```
IPAM Top Pool: 10.0.0.0/8
├── Regional Pool (us-east-1): 10.0.0.0/12
│   ├── Account A VPC: 10.0.0.0/16 (자동 할당)
│   └── Account B VPC: 10.1.0.0/16
└── Regional Pool (eu-west-1): 10.16.0.0/12
    └── Account C VPC: 10.16.0.0/16
```

IPAM은 **사용량 추적**도 한다 — "현재 pool의 70%가 사용 중, prod region의 다음 VPC는 자동 거부될 예정". 이건 IP 고갈을 사전에 알려준다. Slack의 2020년 NAT 사고처럼, IP 한계 문제는 보통 사고가 터진 후에 알게 되는데 IPAM은 사전 알람을 가능하게 한다.

## 정리하며

VPC 트래픽을 들여다보는 세 도구 — Flow Logs, Traffic Mirroring, Reachability Analyzer — 는 각각 **메타데이터, 패킷, 시뮬레이션**이라는 다른 추상화 레벨에서 작동한다. 운영자가 어떤 질문에 답하려는지 먼저 정하고, 그에 맞는 도구를 골라야 한다. "누가 누구와 통신하나"는 Flow Logs, "무엇이 흐르는가"는 Traffic Mirroring, "닿을 수 있나"는 Reachability Analyzer.

함정 두 개만 기억하자. ① Flow Logs는 169.254.x.x AWS 내부 트래픽을 안 본다 — 이건 ENI를 거치지 않는 hypervisor 직접 처리 때문. ② Traffic Mirroring은 Nitro 인스턴스만 지원한다 — SDN 칩이 패킷을 보고 있어야 복사도 가능하다는 아키텍처 결과.

다음 글에선 VPC가 외부와 통신하는 방법들 — NAT Gateway, VPC Endpoint, PrivateLink — 를 본다. Flow Logs로 NAT GW 비용 폭증을 발견했다면, 다음 단계는 "어떤 트래픽을 NAT 우회시킬지" 결정하는 것이다.

---

## 📝 연습 문제

**문제 1.** Private 서브넷의 EC2가 외부 API 호출에 실패한다. 가장 먼저 사용할 도구는?

A) Wireshark로 패킷 캡처
B) Reachability Analyzer로 EC2 → IGW(또는 NAT GW) 경로 시뮬레이션
C) Inspector 취약점 스캔
D) GuardDuty 위협 분석

**정답: B**

해설: 연결성 트러블슈팅의 1순위 도구. 패킷을 실제 보내지 않고 정책 그래프(SG, NACL, Route Table, IGW)를 분석해 hop별 결정 근거를 30초 안에 제시한다. "SG-dest 인바운드 80 누락"처럼 구체적인 차단 지점을 찍어준다. Wireshark는 실제 패킷이 흘러야 의미가 있고(흐르지 않으니 막힌 거다), Inspector/GuardDuty는 보안 도구지 연결성 진단 도구가 아니다.

---

**문제 2.** VPC Flow Logs를 켰는데 169.254.169.254 IMDS 호출 트래픽이 안 보인다. 원인은?

A) IAM 권한 부족
B) Flow Logs 한계 — 169.254.x.x AWS 내부 트래픽(DNS, IMDS, Time Sync)은 ENI를 거치지 않아 미기록
C) 트래픽 샘플링이 적용됨
D) CloudWatch Logs 전송 지연

**정답: B**

해설: Flow Logs는 ENI를 통과하는 트래픽을 캡처한다. 그런데 169.254.x.x로 시작하는 AWS 내부 서비스(DNS resolver .253, IMDS .254, Time Sync .123, Windows 라이선스 .250/.251)는 hypervisor의 mapping service가 직접 처리해서 ENI 큐를 거치지 않는다. 그래서 캡처 대상이 아니다. 이건 버그가 아니라 의도된 설계 — 시험 단골 함정. IMDS 호출 추적이 필요하다면 OS 레벨 로그(예: cloud-init log)나 CloudTrail의 IAM API 호출을 봐야 한다.

---

**문제 3.** 보안팀이 의심스러운 인스턴스에서 오가는 실제 HTTP 헤더와 본문을 캡처해서 IDS로 분석하려 한다. 어떤 도구?

A) Flow Logs로 5-tuple 필터링
B) Traffic Mirroring (Mirror Source = ENI, Target = NLB → Suricata/Zeek 분석 인스턴스)
C) Reachability Analyzer
D) GuardDuty

**정답: B**

해설: 핵심은 "실제 패킷 페이로드"가 필요하다는 점. Flow Logs는 메타데이터(5-tuple + bytes/action)만 기록하므로 HTTP 헤더나 본문이 안 보인다. Traffic Mirroring이 ENI 패킷을 그대로 복사해서 분석 대상으로 보낸다. 받는 쪽 NLB가 여러 분석 인스턴스로 부하 분산하면 단일 장애 지점도 피할 수 있다. 단점은 Nitro 인스턴스만 지원하고, 복사 트래픽 비용이 추가된다는 점 — 미러링 시 Mirror Filter로 의심 프로토콜만 좁히는 게 표준 운영.

---

**문제 4.** Flow Logs를 장기 보관하면서 비용 효율적으로 분석하려 한다. 어떤 조합이 가장 적합한가?

A) CloudWatch Logs + Logs Insights
B) S3 (Parquet 포맷, Hive partitioning) + Athena
C) DynamoDB + Lambda
D) ElastiCache + 자체 분석

**정답: B**

해설: 비용 차이가 압도적이다. 1TB Flow Logs를 한 달 보관할 때 CloudWatch Logs는 약 $530, S3 Parquet은 약 $25 — 20배 차이. Parquet은 컬럼형 압축으로 Athena 쿼리가 스캔하는 바이트가 5-10배 작아져 쿼리 비용($5/TB)도 줄어든다. Hive-compatible partitioning(year/month/day/hour)을 켜면 시간 범위 쿼리 시 다른 파티션은 아예 스캔하지 않는다. CloudWatch Logs + Insights는 실시간 알람·짧은 보관에 적합하고, 장기 분석은 S3 + Athena가 표준이다.

---

**문제 5.** 회사가 운영 VPC에서 "인터넷에서 직접 도달 가능한 모든 인스턴스"를 정기적으로 자동 점검하려 한다. 가장 적합한 도구는?

A) Reachability Analyzer (점 대 점 시뮬레이션)
B) Network Access Analyzer + Access Scope (광역 정책 스캔)
C) Inspector
D) Config Rule

**정답: B**

해설: Reachability Analyzer는 "A에서 B로 닿나"의 1:1 시뮬레이션이라 "모든 가능한 경로"엔 적합하지 않다. Network Access Analyzer는 Access Scope("Source=IGW, Destination=모든 EC2 인스턴스")를 정의하면 모든 매칭 경로를 자동 발견한다. 정기 실행하면 "새 SG 추가로 의도치 않게 IGW 노출된 인스턴스"가 즉시 검출된다. Lambda 스케줄로 자동화하는 게 일반적이고, 결과를 Security Hub로 보내면 컴플라이언스 보고에도 활용된다. Config Rule은 리소스 설정 일관성 검사지 네트워크 경로 분석이 아니다.

---

**문제 6.** 운영자가 Logs Insights로 "지난 1시간 동안 가장 거부된 dst port"를 보려 한다. 가장 적절한 쿼리는?

A) `fields @timestamp | filter action="ACCEPT" | stats count(*) by srcAddr`
B) `fields @timestamp, dstPort, action | filter action="REJECT" | stats count(*) as rejects by dstPort | sort rejects desc | limit 20`
C) `SELECT * FROM logs WHERE port > 1024`
D) `fields @message | parse @message`

**정답: B**

해설: Logs Insights 쿼리 표준 패턴. `filter`로 REJECT만 골라내고, `stats count(*) by dstPort`로 포트별 집계, `sort desc + limit`으로 상위 20개. 같은 src에서 여러 dst port로 REJECT가 분산돼 있으면 포트 스캔 시도, 단일 dst port로 집중돼 있으면 brute-force 시도일 가능성이 높다. A는 ACCEPT를 보고 있어서 거부 분석에 안 맞다. C는 SQL 문법(Athena용)이지 Logs Insights 문법이 아니다. D는 비정형 로그 파싱용으로 Flow Logs처럼 정형 데이터엔 불필요.

---

**문제 7.** IPAM의 가장 핵심적인 가치는?

A) IP 주소를 더 빠르게 할당
B) 멀티 계정 환경에서 CIDR 충돌 사전 방지 + 중앙 사용량 추적
C) 인스턴스 수 늘리기
D) 라우팅 자동화

**정답: B**

해설: IPAM은 IP 할당 속도와 무관하다. 핵심 가치는 거버넌스 — 50개 계정 100개 VPC 환경에서 누군가 `10.5.0.0/16`을 두 군데서 쓰는 사고를 사전에 막는다. CIDR 충돌은 한 번 발생하면 한쪽 VPC를 재구성해야 풀리고, 그건 다운타임 + 모든 인스턴스 IP 변경 + 설정 변경 + 테스트를 의미한다. IPAM은 중앙 Pool에서 자동 할당해 충돌 가능성을 차단하고, 사용량 70%/90% 알람으로 IP 고갈도 사전에 경고한다. Organizations와 통합돼 SCP로 "IPAM 외부 VPC 생성 금지" 강제도 가능.

---
