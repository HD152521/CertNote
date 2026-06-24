# Day 3 - VPC Flow Logs와 트래픽 가시성: 로그로 침해를 읽는다

보안 그룹과 NACL은 트래픽을 막는다. 하지만 "지금 무슨 트래픽이 흐르고 있는가", "누가 우리 DB에 접근을 시도했는가", "방금 막힌 연결이 정상인가 공격인가"라는 질문에는 답하지 못한다. 통제(control)는 막기만 할 뿐, 보지는 못한다. 본다는 것 — 가시성(visibility)은 별도의 능력이다.

VPC Flow Logs가 그 눈이다. VPC 안에서 흐른(혹은 막힌) IP 트래픽의 메타데이터를 기록한다. 페이로드는 아니고, "누가 누구에게, 어떤 포트로, 얼마나, 허용됐는지 거부됐는지"를 남긴다. 오늘은 Flow Logs의 구조를 정확히 읽고, 이 로그로 침해 징후와 오구성을 탐지하는 분석 기법을 본다. SCS-C03 도메인 1(Threat Detection)과 도메인 3(Infrastructure Security)에 동시에 걸치는 핵심이다.

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

> 💡 **관련 이론**: 이 3분기는 보안 운영의 두 시간축 — **실시간 탐지(real-time detection)**와 **사후 조사(retrospective forensics)** — 를 반영한다. CloudWatch는 짧은 시간축(알람), S3+Athena는 긴 시간축(몇 달 전 사고 재구성). 성숙한 SOC는 둘 다 운영한다. S3로는 비용 효율적으로 전부 보관하고, CloudWatch로는 위험 신호만 실시간 알람.

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

오늘의 핵심은 셋이다. 첫째, Flow Logs는 페이로드 없이 트래픽 **메타데이터**(누가-누구에게-어떤 포트-허용/거부)를 기록하며, ACCEPT와 REJECT를 **둘 다** 봐야 침해를 본다. 둘째, NAT 뒤 실제 원본을 알려면 커스텀 포맷에 `pkt-srcaddr`를 추가해야 하고, 이것이 유출 호스트 특정의 열쇠다. 셋째, 목적지는 용도에 따라 CloudWatch(실시간 알람), S3+Athena(포렌식·보관), Kinesis(SIEM)로 나눈다.

Flow Logs는 통제가 아니라 가시성이다 — 막지는 못하지만 본다. GuardDuty가 "위협이다"라고 알릴 때, Flow Logs는 "언제, 어디로, 얼마나"의 증거를 제공한다. 다음 글에서는 데이터 유출 경로 자체를 봉쇄하는 **프라이빗 연결(VPC Endpoint, PrivateLink)**을 본다.

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
