# Day 3 - VPC Flow Logs와 트래픽 가시성: 로그로 침해를 읽는다

보안 그룹과 NACL은 트래픽을 막는다. 하지만 "지금 무슨 트래픽이 흐르고 있는가", "누가 우리 DB에 접근을 시도했는가", "방금 막힌 연결이 정상인가 공격인가"라는 질문에는 답하지 못한다. 통제(control)는 막기만 할 뿐, 보지는 못한다. 본다는 것 — 가시성(visibility)은 별도의 능력이다.

VPC Flow Logs가 그 눈이다. VPC 안에서 흐른(혹은 막힌) IP 트래픽의 메타데이터를 기록한다. 페이로드는 아니고, "누가 누구에게, 어떤 포트로, 얼마나, 허용됐는지 거부됐는지"를 남긴다. 오늘은 Flow Logs의 구조를 정확히 읽고, 특히 **어제 배운 SG/NACL 진단을 로그 위에서 확인하는 법**에 무게를 둔다. SCS-C03 도메인 1(Threat Detection)과 도메인 3(Infrastructure Security)에 동시에 걸치는 핵심이다.

> 오늘 다루는 것은 "트래픽을 보는 능력의 기초"와 "SG/NACL 오구성 진단"이다. 여러 계정·여러 로그를 한곳에 모으고, 그 로그가 위변조되지 않았음을 보장하고, 몇 달 전 사고를 로그로 재구성하는 **감사·중앙화·무결성 영역은 Week 7에서** 따로 다룬다. 그래서 오늘은 "로그를 어떻게 읽는가"까지만 간다.

## 통제와 가시성은 다른 능력이다

보안 통제를 아무리 촘촘하게 걸어도 답하지 못하는 질문이 있다.

| 질문 | 통제(SG/NACL)가 답하나 | Flow Logs가 답하나 |
|------|----------------------|-------------------|
| "이 포트로 들어오는 걸 막았나?" | 예(규칙을 보면 안다) | — |
| "실제로 누가 시도했나?" | 아니오 | 예 |
| "막힌 게 공격인가 우리 헬스체크인가?" | 아니오 | 예 |
| "허용된 트래픽 중 이상한 건 없나?" | 아니오 | 예 |
| "지난주 이 인스턴스가 어디로 통신했나?" | 아니오 | 예(보관했다면) |

두 번째 줄부터가 전부 가시성의 영역이다. 규칙은 **미래의 트래픽에 대한 의도**를 적은 것이고, 로그는 **과거에 실제로 일어난 일**의 기록이다. 둘은 자주 어긋난다. 규칙상 막혀 있어야 할 트래픽이 통과했다면 어딘가에 우리가 모르는 경로가 있는 것이고, 규칙상 허용된 트래픽이 오지 않는다면 다른 계층이 막고 있는 것이다. **의도와 실제의 차이를 드러내는 것**이 로그의 본래 가치다.

> 💡 **관련 이론**: 이 구도는 보안 운영에서 말하는 **예방(prevent) / 탐지(detect) / 대응(respond)** 삼분법의 첫 두 축이다. 예방 통제는 완전하지 않다는 전제 위에서 탐지가 존재한다. 만약 예방이 완전하다면 탐지는 불필요하겠지만, 실제로는 오구성·제로데이·내부자·탈취된 정상 자격증명이 예방을 통과한다. 그래서 성숙도 모델들은 예외 없이 "차단 규칙을 늘리는 것"보다 "무엇이 지나갔는지 볼 수 있는가"를 더 높은 단계로 둔다. 눈이 없으면 자신이 뚫렸다는 사실조차 모르고, 모르는 침해의 평균 체류 시간은 언제나 길다.

## Flow Logs가 기록하는 것과 못 하는 것

| 기록함 | 기록 안 함 |
|--------|-----------|
| 출발지/목적지 IP·포트 | 패킷 페이로드(실제 데이터) |
| 프로토콜, 바이트/패킷 수 | DNS 쿼리 내용(별도 Resolver 로그) |
| ACCEPT / REJECT | DHCP, Amazon DNS(169.254.169.253) 트래픽 등 일부 |
| 시작/종료 시각 | Windows 라이선스 활성화 트래픽 등 |
| ENI ID, 계정·서브넷·VPC | 메타데이터 서비스(169.254.169.254) 일부 |

> 💡 **관련 이론**: Flow Logs는 네트워크 포렌식에서 말하는 **NetFlow/IPFIX**의 AWS판이다. 1990년대 Cisco가 만든 NetFlow는 "패킷을 다 저장하면 비싸니 흐름(flow)의 메타데이터만 요약 저장하자"는 발상이었다. 페이로드 없이도 "비정상적으로 큰 아웃바운드 전송", "포트 스캔 패턴", "C2(Command & Control) 서버와의 주기적 통신" 같은 공격 징후를 메타데이터만으로 탐지할 수 있다. 이게 Flow Logs로 침해를 읽는 이론적 근거다.

## 기본 로그 포맷: 14개 필드 읽기

```
version account-id interface-id srcaddr dstaddr srcport dstport
protocol packets bytes start end action log-status
```

실제 레코드 예시:

```
2 123456789012 eni-1235b8ca 172.31.16.139 203.0.113.12 49152 443 6 20 4249 1418530010 1418530070 ACCEPT OK
2 123456789012 eni-1235b8ca 203.0.113.50 172.31.16.21  6666 22  6 1  40   1418530010 1418530070 REJECT OK
```

- 첫 줄: 172.31.16.139가 외부 203.0.113.12의 443으로 보낸 정상 트래픽(ACCEPT).
- 둘째 줄: 외부 203.0.113.50이 내부 22(SSH)로 접근 시도했으나 거부(REJECT). protocol 6 = TCP.

> 🔍 **더 깊이**: `action` 필드의 ACCEPT/REJECT가 보안의 핵심이다. **REJECT는 SG/NACL이 막았다는 뜻**이지만, 동시에 "누군가 시도는 했다"는 정찰(reconnaissance) 신호다. 외부 IP에서 다수 포트로 짧은 시간에 REJECT가 쏟아지면 포트 스캔이다. 반대로 ACCEPT인데 의외의 목적지로 큰 바이트가 나가면 데이터 유출 의심. 보안 분석은 ACCEPT와 REJECT를 둘 다 봐야 한다 — 막힌 것만 보면 성공한 침해를 놓친다.

### 한 줄이 아니라 한 쌍으로 읽는다

Flow Log를 처음 보는 사람은 행을 하나씩 읽는다. 진단은 **왕복 한 쌍**을 찾아 맞춰 볼 때 시작된다. 정상적인 TCP 통신은 서로 거울처럼 뒤집힌 두 행으로 나타난다.

```
[ 정상 왕복: 두 행이 거울처럼 뒤집혀 있다 ]

  요청  ... 203.0.113.10  10.0.1.20   51000  443   6 ... ACCEPT OK
             └ src        └ dst       └sport └dport
  응답  ... 10.0.1.20     203.0.113.10  443  51000  6 ... ACCEPT OK
             └ src        └ dst       └sport └dport
             ↑ 출발지·목적지와 포트가 정확히 맞바뀐다

[ 비대칭 실패: 요청은 통과, 응답이 죽었다 ]

  요청  ... 203.0.113.10  10.0.1.20   51000  443   6 ... ACCEPT OK
  응답  ... 10.0.1.20     203.0.113.10  443  51000  6 ... REJECT OK
                                                          ↑ 여기

  → 이 형태를 만들 수 있는 것은 NACL뿐이다.
     SG는 요청을 기억하므로 응답을 거부할 수 없다.

[ 완전 차단: 요청부터 죽었다 ]

  요청  ... 203.0.113.10  10.0.1.20   51000  443   6 ... REJECT OK
  (응답 행 자체가 없다)

  → SG 인바운드 미허용, NACL 인바운드 Deny, 둘 다 가능.
     로그만으로는 구분되지 않는다 → 구성 확인이나 Reachability Analyzer로.
```

세 가지 형태를 눈에 익혀 두면 로그 두 줄로 진단의 절반이 끝난다. 특히 두 번째 형태가 결정적이다. **응답 방향에만 REJECT가 찍히는 비대칭 실패는 NACL의 지문**이며, 보안 그룹은 구조적으로 이 모양을 만들 수 없다. 어제 배운 "SG는 요청을 기억한다"는 성질이 로그의 형태로 그대로 드러나는 것이다.

## 누가 막았나: SG인가 NACL인가

`action` 필드는 "막혔다"만 알려 주고 "무엇이 막았는지"는 알려 주지 않는다. 그래도 **로그의 모양과 방향**을 조합하면 상당 부분 좁힐 수 있다. 아래가 실전에서 쓰는 판정표다.

| 로그에서 보이는 것 | 유력한 원인 | 확인할 것 |
|-------------------|------------|----------|
| 인바운드 REJECT만, 응답 행 없음 | SG 인바운드 미허용 **또는** NACL 인바운드 Deny | 두 계층 구성 확인 |
| 인바운드 ACCEPT + 아웃바운드 REJECT | **NACL 아웃바운드**(임시 포트 미허용) | NACL egress 1024-65535 |
| 아웃바운드 ACCEPT + 인바운드 응답 REJECT | **NACL 인바운드**(임시 포트 미허용) | NACL ingress 1024-65535 |
| 아웃바운드 REJECT (요청부터) | SG 아웃바운드를 좁혔거나 NACL egress Deny | SG egress는 기본이 전체 허용이므로 누가 좁혔는지부터 |
| 로그에 아무 행도 없음 | 라우팅 부재 또는 애초에 패킷이 오지 않음 | 라우팅 테이블, 출발지 쪽 로그 |
| 특정 IP만 일관되게 REJECT | NACL의 낮은 번호 Deny 규칙 | 규칙 번호 순서 |
| 간헐적으로만 REJECT | 규칙 변경 시점, 또는 NACL 규칙 수 한도 | 변경 이력(Config), 규칙 개수 |

마지막에서 두 번째 줄, **"로그에 아무 행도 없다"** 는 상태가 초심자에게 가장 헷갈린다. REJECT조차 없다는 것은 패킷이 그 ENI 근처까지 오지도 않았다는 뜻이다. 원인은 대개 라우팅이거나, 출발지가 애초에 다른 곳으로 패킷을 보냈거나, 이름 해석이 엉뚱한 IP로 풀린 경우다. **"막혔다"와 "오지 않았다"는 완전히 다른 사건**이고, 이 둘을 구분해 주는 것이 Flow Log의 값진 기능 중 하나다.

```
[ Flow Log 증거로 좁혀 가는 결정 트리 ]

  해당 ENI의 로그에 관련 행이 있는가?
   ├─ 없다 ──▶ 패킷이 도달하지 않음
   │            → 라우팅 / DNS 해석 / 출발지 구성 확인
   │              (SG·NACL을 아무리 열어도 소용없다)
   │
   └─ 있다 ──▶ 첫 행(요청 방향)의 action은?
                ├─ REJECT ──▶ 인바운드 차단
                │              → SG 인바운드 규칙 확인
                │              → NACL 인바운드 Deny·번호 순서 확인
                │
                └─ ACCEPT ──▶ 반대 방향 행이 있는가?
                               ├─ 없다   ──▶ 목적지가 응답을 안 함
                               │              → 프로세스 listen / 앱 오류
                               ├─ REJECT ──▶ ★ NACL 임시 포트 ★
                               └─ ACCEPT ──▶ 네트워크는 정상
                                              → 정책·인증 계층으로 이동
```

> 🎯 **시나리오**: "온프레미스에서 사내 VPC의 API 서버(443)로 호출하면 간헐적으로 타임아웃이 난다. Flow Log를 보니 인바운드는 전부 ACCEPT인데, 아웃바운드 행 중 일부가 REJECT다. 원인은?" — 비대칭 실패이므로 NACL이다. 그리고 "간헐적"이라는 단서가 임시 포트 범위 문제를 가리킨다. 클라이언트 OS가 고르는 임시 포트 범위가 NACL 아웃바운드 허용 범위와 **부분적으로만** 겹치면, 우연히 허용 범위 안의 포트를 고른 연결만 성공하고 나머지는 실패한다. 정확히 이 증상이 "열 번에 세 번 된다"는 형태로 나타난다. 해결은 NACL 아웃바운드를 1024-65535로 넓히는 것이다.

> ⚠️ **함정**: Flow Logs의 `action`은 **보안 그룹과 NACL의 종합 결과**다. 어느 쪽이 막았는지는 Flow Logs만으로 구분하기 어렵다. SG는 거부된 인바운드를 로그에 어떻게 남길까? SG는 stateful이라 허용되지 않은 인바운드는 REJECT로 기록된다. 단, SG에서 허용된 트래픽이 NACL에서 막히는 경우의 구분은 Reachability Analyzer가 필요하다. 또 하나 — Flow Logs는 **거의 실시간이 아니다**. 집계 간격(aggregation interval)이 기본 10분(최소 1분)이라 실시간 차단 용도로는 부적합. 탐지·분석용이다.

## 커스텀 포맷: 보안 분석에 필요한 추가 필드

기본 14개 필드로는 부족할 때가 많다. 커스텀 포맷으로 보안에 유용한 필드를 추가한다.

| 추가 필드 | 보안적 가치 |
|-----------|-------------|
| `tcp-flags` | SYN만 쏟아지면 SYN flood / 스캔 탐지 |
| `pkt-srcaddr` / `pkt-dstaddr` | NAT 뒤 **실제** 원본 IP (srcaddr는 NAT IP) |
| `flow-direction` | ingress/egress 명시 |
| `traffic-path` | 트래픽이 거친 경로(IGW, NAT, VPCE 등) |
| `az-id` | 가용영역 단위 이상 탐지 |

> 🔍 **더 깊이**: `pkt-srcaddr`와 `srcaddr`의 차이가 포렌식에서 결정적이다. NAT Gateway를 거친 트래픽은 `srcaddr`에 NAT의 IP가 찍힌다. 그러면 "어느 내부 인스턴스가 의심스러운 외부로 통신했나"를 알 수 없다. `pkt-srcaddr`를 커스텀 포맷에 추가하면 NAT 변환 **이전의 실제 원본**이 기록돼, 침해된 내부 호스트를 특정할 수 있다. 데이터 유출 조사에서 이 필드 없이는 추적이 막힌다.

## 어디로 보낼까: 목적지 3가지

```bash
# 1. CloudWatch Logs — 실시간 알람(Metric Filter)에 적합
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-xxxx --traffic-type REJECT \
  --log-destination-type cloud-watch-logs \
  --log-group-name /vpc/flowlogs --deliver-logs-permission-arn arn:aws:iam::...:role/flow-role

# 2. S3 — 장기 보관 + Athena 대량 쿼리에 적합
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-xxxx --traffic-type ALL \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::my-flowlogs-bucket/prefix/ \
  --log-format '${srcaddr} ${dstaddr} ${pkt-srcaddr} ${action} ${tcp-flags}'

# 3. Kinesis Data Firehose — 실시간 스트리밍 분석/SIEM 전송
```

| 목적지 | 강점 | 적합한 용도 |
|--------|------|-------------|
| CloudWatch Logs | Metric Filter + Alarm | 실시간 임계 알람(REJECT 폭증) |
| S3 | 저비용 장기 보관, Athena | 대량 포렌식, 규제 보존 |
| Kinesis Firehose | 스트리밍 | SIEM(Splunk, OpenSearch) 연동 |

> 💡 **관련 이론**: 이 3분기는 보안 운영의 두 시간축 — **실시간 탐지(real-time detection)**와 **사후 조사(retrospective forensics)** — 를 반영한다. CloudWatch는 짧은 시간축(알람), S3+Athena는 긴 시간축(몇 달 전 사고 재구성). 성숙한 SOC는 둘 다 운영한다. S3로는 비용 효율적으로 전부 보관하고, CloudWatch로는 위험 신호만 실시간 알람. 여러 계정의 로그를 한 계정으로 모으고 그 보관본이 위변조되지 않았음을 보장하는 **중앙화·무결성 설계는 Week 7에서** 별도로 다룬다.

### 켤 때 정하는 네 가지, 그중 되돌릴 수 없는 것

Flow Log를 만들 때 정하는 값 중 일부는 **나중에 수정할 수 없다.** 형식(log format), 집계 간격, 대상 리소스, 목적지가 그것이다. 바꾸려면 지우고 새로 만들어야 하며 그 사이 트래픽은 기록되지 않는다. 그래서 처음 켤 때의 결정이 오래 간다.

| 항목 | 선택지 | 보안 관점의 기본값 |
|------|--------|------------------|
| 대상 수준 | VPC / 서브넷 / ENI | **VPC 수준** — 새 서브넷·인스턴스가 자동 포함된다 |
| traffic-type | ALL / ACCEPT / REJECT | 보관용은 **ALL**. REJECT만 켜면 성공한 침해를 못 본다 |
| 집계 간격 | 10분(기본) / 1분 | 탐지 지연을 줄이려면 **1분** |
| 형식 | 기본 / 커스텀 | **커스텀** — 나중에 아쉬워질 필드를 미리 넣는다 |

대상 수준에서 VPC를 고르는 이유가 중요하다. 서브넷이나 ENI 단위로 켜면 **나중에 만들어진 리소스가 자동으로 포함되지 않는다.** 로깅 공백은 언제나 "새로 만든 것"에서 생기고, 새로 만든 것이 대체로 검증이 덜 된 것이라 위험도 크다. 상위 수준에서 켜 두고 하위가 상속받게 하는 것이 로깅 설계의 일반 원칙이다.

```bash
# 현재 이 VPC에 flow log가 켜져 있는지, 어떤 설정인지 확인
aws ec2 describe-flow-logs \
  --filter "Name=resource-id,Values=vpc-0abc1234" \
  --query 'FlowLogs[].{Id:FlowLogId,Type:TrafficType,Dest:LogDestinationType,
             Interval:MaxAggregationInterval,Status:FlowLogStatus,Format:LogFormat}' \
  --output json

# VPC 수준 · 전체 트래픽 · 1분 집계로 켜기 (진단에 필요한 필드 포함)
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-0abc1234 \
  --traffic-type ALL \
  --max-aggregation-interval 60 \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::corp-flow-logs/prod/ \
  --log-format '${version} ${vpc-id} ${subnet-id} ${instance-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${tcp-flags} ${packets} ${bytes} ${start} ${end} ${action} ${log-status} ${pkt-srcaddr} ${pkt-dstaddr} ${flow-direction}'

# 켜져 있는데 로그가 안 쌓인다면 status를 먼저 본다
#  ACTIVE          정상
#  FAILED          권한(IAM 역할/버킷 정책) 문제인 경우가 대부분
aws ec2 describe-flow-logs --query 'FlowLogs[?FlowLogStatus!=`ACTIVE`]'
```

> ⚠️ **함정**: `log-status` 필드의 값 세 가지를 구분해 두어야 한다. `OK`는 정상, `NODATA`는 그 구간에 해당 ENI로 트래픽이 아예 없었다는 뜻, `SKIPDATA`는 **용량 문제로 일부 레코드가 누락됐다**는 뜻이다. 조사 중에 `SKIPDATA`가 섞여 있으면 "이 구간의 로그는 불완전하다"는 사실을 결론에 반드시 반영해야 한다. 로그가 없다는 것이 사건이 없었다는 증거가 되지 못하는 대표적 상황이며, `NODATA`와 `SKIPDATA`를 같은 것으로 취급하면 정반대의 결론에 도달한다.

## Athena로 침해 패턴 쿼리하기

S3에 쌓인 Flow Logs는 Athena로 SQL 분석한다. 실전 쿼리 예:

```sql
-- 1. 거부된 SSH/RDP 접근 시도 상위 공격 IP (포트 스캔/브루트포스 정찰)
SELECT srcaddr, dstport, count(*) AS attempts
FROM vpc_flow_logs
WHERE action = 'REJECT' AND dstport IN (22, 3389)
GROUP BY srcaddr, dstport
ORDER BY attempts DESC LIMIT 20;

-- 2. 비정상적으로 큰 아웃바운드 전송 (데이터 유출 의심)
SELECT pkt_srcaddr, dstaddr, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE flow_direction = 'egress' AND action = 'ACCEPT'
GROUP BY pkt_srcaddr, dstaddr
HAVING sum(bytes) > 1000000000
ORDER BY total_bytes DESC;

-- 3. 한 내부 호스트가 다수 목적지로 통신 (C2 비콘 / 횡적 이동 의심)
SELECT pkt_srcaddr, count(DISTINCT dstaddr) AS distinct_dests
FROM vpc_flow_logs
GROUP BY pkt_srcaddr
HAVING count(DISTINCT dstaddr) > 100;
```

> 🔍 **더 깊이**: 위 세 쿼리는 "찾는 방법"의 예시일 뿐, 실제 조사에서는 임계값이 문제다. `sum(bytes) > 1000000000`의 10억이라는 숫자에는 근거가 없다 — 어떤 환경에서는 일상이고 어떤 환경에서는 대형 사고다. 그래서 실무의 첫 작업은 탐지 규칙을 쓰는 것이 아니라 **평상시(baseline)를 재는 것**이다. 이 인스턴스의 평소 하루 egress는 얼마인가, 평소 통신하는 목적지는 몇 개인가, 그 목록은 얼마나 안정적인가. 기준선이 없으면 모든 숫자가 그냥 숫자이고, 임계값은 오탐과 미탐 사이를 무작위로 오간다. 반대로 기준선이 있으면 "평소의 40배"라는 상대적 표현이 가능해지고, 이것이 절대 임계값보다 훨씬 잘 작동한다.

## 빠른 진단에는 CloudWatch Logs Insights

Athena는 S3에 쌓인 대량 로그를 뒤질 때 쓰고, **지금 막 발생한 연결 문제**를 좁힐 때는 CloudWatch Logs Insights가 빠르다. Flow Logs를 CloudWatch Logs로 보내면 필드가 자동으로 인식되므로 바로 질의할 수 있다.

```
# 특정 인스턴스로 향한 REJECT를 최근 순으로
fields @timestamp, srcAddr, dstAddr, srcPort, dstPort, protocol, action
| filter dstAddr = "10.0.1.20" and action = "REJECT"
| sort @timestamp desc
| limit 50

# 비대칭 실패 찾기: 같은 상대와의 통신에서 방향별 action 분포
fields srcAddr, dstAddr, dstPort, action
| filter srcAddr = "10.0.1.20" or dstAddr = "10.0.1.20"
| stats count(*) as cnt by srcAddr, dstAddr, dstPort, action
| sort cnt desc

# 어떤 포트가 가장 많이 거부되고 있나 (스캔·오구성 동시 탐지)
fields dstPort, action
| filter action = "REJECT"
| stats count(*) as rejects by dstPort
| sort rejects desc
| limit 20
```

두 번째 쿼리가 오늘의 진단과 직결된다. 같은 상대와의 통신을 방향별로 묶어 보면, 한쪽 방향만 REJECT인 **비대칭 패턴이 표로 드러난다.** 이 표에서 `dstPort`가 서비스 포트(443 등)인 행은 ACCEPT인데 `dstPort`가 임시 포트 범위인 행이 REJECT라면, 진단은 그 자리에서 끝난다.

> ⚠️ **함정**: Flow Logs를 CloudWatch Logs로 보내면 수집·저장·메트릭 필터 평가 비용이 트래픽 양에 비례해 빠르게 늘어난다. 그래서 전체 트래픽을 CloudWatch로 보내는 구성은 대개 오답이다. 실무 표준은 **알람에 필요한 좁은 범위만 CloudWatch로, 전체는 S3로** 이원화하는 것이고, 진단이 필요한 짧은 기간에만 한시적으로 범위를 넓혔다가 되돌린다. 다만 이 "한시적 확장"은 앞서 말한 대로 flow log를 지우고 다시 만드는 일이 되므로, 아예 처음부터 두 개의 flow log(S3 전체 + CloudWatch REJECT)를 병렬로 켜 두는 편이 실용적이다.

> 🎯 **시나리오**: "GuardDuty가 한 EC2에서 비트코인 채굴(CryptoCurrency) 위협을 탐지했다. Flow Logs로 무엇을 확인하나?" — (1) 해당 ENI의 egress ACCEPT 중 알려진 마이닝 풀 포트/IP로의 통신, (2) `pkt-srcaddr`로 실제 인스턴스 특정, (3) 주기적 비콘 패턴(일정 간격 소량 통신). GuardDuty가 "무엇을"이라면 Flow Logs는 "어떻게·얼마나"의 증거를 제공한다. 둘은 보완 관계다.

> 📚 **사례**: 데이터 유출 사고 조사에서 Flow Logs가 결정적 증거가 되는 패턴이 있다. 정상적인 워크로드는 통신 목적지가 안정적이다. 그런데 어느 날부터 한 인스턴스가 평소 안 쓰던 외부 IP로 GB 단위 데이터를 egress하기 시작하면 그게 유출 시점이다. Flow Logs를 몇 달치 S3에 보관해 두면, 사고를 인지한 시점에서 거꾸로 거슬러 "언제부터 비정상이 시작됐는지" 타임라인을 재구성할 수 있다. 로그가 없으면 이 타임라인 자체가 불가능하다.

## CloudWatch로 실시간 알람 만들기

```
# Metric Filter: REJECT가 임계 초과하면 알람
필터 패턴: [version, account, eni, src, dst, srcport, dstport="22", protocol, packets, bytes, start, end, action="REJECT", status]
→ 메트릭으로 변환 → CloudWatch Alarm → SNS → 보안팀 알림
```

> 🔍 **더 깊이**: Flow Logs를 CloudWatch에 보내면 비용이 빠르게 늘 수 있다(수집·저장·메트릭 필터 평가). 그래서 실무에서는 **traffic-type을 REJECT로 좁혀** CloudWatch에 보내고(알람용), 전체 ALL은 S3로(보관·Athena) 보내는 이원화가 표준이다. 또 GuardDuty는 내부적으로 Flow Logs를 소비하므로, GuardDuty를 켜두면 별도 Flow Logs 분석 없이도 상당수 네트워크 위협이 탐지된다. 단 GuardDuty는 Flow Logs를 사용자 계정에 적재하지 않으므로, 포렌식용 보관은 별도로 Flow Logs를 켜야 한다.

## 정리하며

오늘의 핵심은 넷이다. 첫째, Flow Logs는 페이로드 없이 트래픽 **메타데이터**(누가-누구에게-어떤 포트-허용/거부)를 기록하며, ACCEPT와 REJECT를 **둘 다** 봐야 침해를 본다. 둘째, 로그는 한 줄이 아니라 **왕복 한 쌍**으로 읽는다 — 출발지·목적지와 포트가 거울처럼 뒤집힌 두 행을 맞춰 보는 순간 진단의 절반이 끝난다. 셋째, NAT 뒤 실제 원본을 알려면 커스텀 포맷에 `pkt-srcaddr`를 추가해야 하고, 이것이 유출 호스트 특정의 열쇠다. 넷째, 목적지는 용도에 따라 CloudWatch(빠른 진단·알람), S3+Athena(대량 분석), Kinesis(SIEM)로 나누되 전체를 CloudWatch로 보내지 않는다.

진단에서 오늘 가져갈 문장은 하나로 압축된다. **비대칭 실패는 NACL만 만든다.** 인바운드 ACCEPT + 아웃바운드 REJECT라는 형태는 요청을 기억하는 SG로는 만들어질 수 없고, 원인은 거의 언제나 NACL의 임시 포트 규칙이다. 그리고 그보다 먼저 확인할 것이 있다 — **로그에 행이 아예 없는 경우**다. 이는 "막혔다"가 아니라 "오지 않았다"이며, SG와 NACL을 아무리 열어도 해결되지 않는다. 라우팅과 이름 해석을 봐야 한다.

켤 때의 결정 중 형식·집계 간격·대상·목적지는 나중에 바꿀 수 없다는 점, 그리고 `NODATA`(트래픽 없음)와 `SKIPDATA`(용량 문제로 누락)를 절대 같은 것으로 읽지 않아야 한다는 점도 함께 기억해 둔다. 후자를 전자로 착각하면 "아무 일도 없었다"는 정반대의 결론에 도달한다.

Flow Logs는 통제가 아니라 가시성이다 — 막지는 못하지만 본다. 이 로그를 여러 계정에서 한곳으로 모으고, 보관본의 무결성을 보장하고, 몇 달 전 사건을 시간축 위에 재구성하는 작업은 **Week 7의 감사·로깅 주제**로 넘긴다. 오늘은 눈을 뜨는 단계까지다. 다음 글에서는 데이터 유출 경로 자체를 봉쇄하는 **프라이빗 연결(VPC Endpoint, PrivateLink)**을 본다.

---

## 📝 연습 문제

**문제 1.** NAT Gateway 뒤에 있는 여러 인스턴스 중 어느 것이 의심스러운 외부 IP로 통신했는지 특정하려고 한다. Flow Logs에서 반드시 필요한 필드는?

A) 기본 포맷의 srcaddr 필드만으로 충분하다  
B) 커스텀 포맷의 pkt-srcaddr 필드  
C) tcp-flags 필드  
D) az-id 필드  

**정답: B**  
해설: NAT를 거친 트래픽은 기본 출발지 주소 필드에 NAT의 주소가 기록되어 실제 인스턴스를 구분할 수 없다. 패킷의 원본 출발지 주소 필드를 커스텀 포맷에 추가하면 NAT 변환 이전의 실제 송신 인스턴스를 식별할 수 있어, 침해된 내부 호스트를 특정하는 데 결정적이다.

---

**문제 2.** 외부 IP 한 곳에서 짧은 시간에 다수의 서로 다른 포트로 향하는 REJECT 레코드가 대량 발생했다. 가장 가능성 높은 활동은?

A) 정상적인 로드밸런서 헬스 체크  
B) 포트 스캔 등 정찰 활동  
C) 대규모 데이터 유출  
D) NAT Gateway의 임시 포트 재사용  

**정답: B**  
해설: 한 출발지가 다수 포트로 짧은 시간에 접근을 시도하고 모두 거부된 패턴은 열린 포트를 찾는 포트 스캔, 즉 정찰 활동의 전형이다. 데이터 유출은 허용된 연결로 큰 바이트가 나가는 패턴이며, 헬스 체크는 정해진 포트로 허용되는 통신이라 구분된다.

---

**문제 3.** Flow Logs를 보안 알람과 장기 포렌식 보관에 모두 활용하려고 한다. 비용 효율적인 구성은?

A) 모든 트래픽을 CloudWatch Logs로만 보낸다  
B) REJECT 트래픽은 CloudWatch Logs(알람용), 전체 트래픽은 S3(보관·Athena)로 이원화한다  
C) 전체 트래픽을 CloudWatch와 S3에 동시에 모두 보낸다  
D) 알람과 보관 모두 Kinesis Firehose 하나로 처리한다  

**정답: B**  
해설: CloudWatch Logs는 수집·저장·메트릭 평가 비용이 높으므로 알람에 필요한 거부 트래픽만 좁혀 보내고, 전체 트래픽은 저비용 장기 보관과 대량 쿼리에 적합한 S3로 보내 Athena로 분석하는 이원화가 표준이다. 전체를 CloudWatch로 보내면 비용이 급증한다.

---

**문제 4.** Flow Logs를 실시간 차단(blocking) 메커니즘으로 사용하려는 계획에 대한 평가로 옳은 것은?

A) 집계 간격이 최소 1분이라 실시간 차단에는 부적합하며 탐지·분석용이다  
B) 밀리초 단위로 기록되므로 실시간 차단에 적합하다  
C) ACCEPT만 기록되므로 차단에 활용할 수 없다  
D) S3로 보낼 때만 실시간 차단이 가능하다  

**정답: A**  
해설: Flow Logs는 집계 간격을 두고 기록되며 기본 10분, 최소 1분이라 즉각적인 인라인 차단에는 맞지 않는다. 트래픽을 막는 통제가 아니라 흐름을 사후에 보는 가시성 도구이므로, 탐지와 분석에 사용하고 차단은 보안 그룹·NACL·네트워크 방화벽으로 수행한다.

---

**문제 5.** GuardDuty와 VPC Flow Logs의 관계로 옳은 것은?

A) GuardDuty를 켜면 Flow Logs도 자동으로 사용자 S3 버킷에 적재된다  
B) GuardDuty는 내부적으로 Flow Logs를 소비하지만 사용자 계정에 적재하지 않으므로, 포렌식 보관은 별도로 Flow Logs를 켜야 한다  
C) 둘은 완전히 독립적이며 같은 데이터를 쓰지 않는다  
D) Flow Logs를 켜야만 GuardDuty가 동작한다  

**정답: B**  
해설: GuardDuty는 Flow Logs를 포함한 데이터 소스를 내부적으로 분석하지만 그 로그를 사용자 계정에 저장해 주지는 않는다. 따라서 사고 조사를 위한 트래픽 메타데이터 보관이 필요하면 별도로 Flow Logs를 활성화해 S3 등에 적재해야 한다. GuardDuty는 사용자가 Flow Logs를 켜지 않아도 자체적으로 동작한다.

---

**문제 6.** 한 내부 인스턴스의 egress ACCEPT 트래픽 중, 평소 통신하지 않던 외부 IP로 수 GB가 전송된 기록이 발견됐다. 보안 분석가가 우선 의심할 상황은?

A) 정상적인 소프트웨어 업데이트 다운로드  
B) 데이터 유출(exfiltration) 가능성  
C) NACL 임시 포트 부족으로 인한 재전송  
D) 보안 그룹의 stateful 추적 오류  

**정답: B**  
해설: 안정적이던 통신 목적지가 갑자기 낯선 외부 IP로 바뀌고 대용량 데이터가 아웃바운드로 나가는 패턴은 데이터 유출의 전형적 징후다. 업데이트 다운로드는 일반적으로 인바운드 수신이 크고 목적지가 알려진 배포 엔드포인트이며, 임시 포트나 stateful 추적 문제는 대용량 egress와 무관하다.

---
