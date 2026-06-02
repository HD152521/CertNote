# Day 2 - VPC Flow Logs, Traffic Mirroring, Reachability Analyzer

📅 날짜: Week 8 (Day 2)
🎯 주제: VPC 트래픽 가시화·분석·연결성 검증
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- VPC Flow Logs로 네트워크 트래픽을 감사·분석한다
- Traffic Mirroring으로 패킷 캡처를 수행한다
- Reachability Analyzer/Network Access Analyzer로 연결성을 검증한다

---

## 🧩 사전 지식 (CS 기초)

- **NetFlow / sFlow**: 네트워크 트래픽 메타데이터 표준 포맷
- **Packet capture (pcap)**: 실제 패킷을 그대로 수집. 깊은 분석에 사용
- **Connectivity verification**: 경로 + 정책 모두 점검해 도달 가능성 판단
- **Layer 4 정보**: src/dst IP, port, protocol, packets, bytes
- **5-tuple**: (src_ip, dst_ip, src_port, dst_port, protocol). 흐름 식별 표준

---

## 📖 이론 내용

### 1. VPC Flow Logs

#### 개념
- VPC 내의 ENI를 통과한 트래픽을 메타데이터로 기록
- 실제 패킷이 아닌 **흐름 요약** (5-tuple + bytes/packets + action)
- 디버깅·감사·보안 분석에 활용

#### 적용 단위
- **VPC 전체**: 모든 ENI
- **서브넷**: 그 서브넷의 모든 ENI
- **개별 ENI**: 특정 인스턴스만

#### 저장 대상
- **CloudWatch Logs**: 실시간 알람·필터에 유리
- **S3**: 장기 저장·Athena 분석에 유리 (저렴)
- **Firehose → OpenSearch**: 실시간 시각화

#### 기본 필드
```
${version} ${account-id} ${interface-id} ${srcaddr} ${dstaddr}
${srcport} ${dstport} ${protocol} ${packets} ${bytes}
${start} ${end} ${action} ${log-status}
```

예: `2 123456789012 eni-abc 10.0.1.5 8.8.8.8 51234 53 17 1 76 1748000000 1748000060 ACCEPT OK`
- protocol 17 = UDP (TCP=6, ICMP=1)
- action: `ACCEPT` 또는 `REJECT`

#### Custom Format (필드 선택)
- `${pkt-srcaddr}`, `${pkt-dstaddr}`: NAT 적용 전 원본 IP
- `${region}`, `${az-id}`, `${sublocation-type}`: 지리 정보
- `${tcp-flags}`: SYN/ACK 등
- `${type}`: IPv4/IPv6/EFA
- `${vpc-id}`, `${subnet-id}`, `${instance-id}`

#### 한계
- 다음 트래픽은 기록 안 됨 (시험 함정):
  - **AWS DNS (169.254.169.253)** 트래픽
  - **Windows 라이선스 활성화** 트래픽
  - **Instance Metadata (169.254.169.254)**
  - **Time Sync Service (169.254.169.123)**
  - **DHCP**
- 실시간 X (수 분 지연)
- Layer 7 (HTTP path 등) 안 보임

### 2. Flow Logs 분석 패턴

#### Logs Insights 쿼리 (자주 쓰는 것)

**상위 거부 트래픽**
```
fields @timestamp, srcAddr, dstAddr, dstPort, action
| filter action = "REJECT"
| stats count(*) as rejects by srcAddr, dstPort
| sort rejects desc
| limit 20
```

**Top Talker (전송량 많은 IP)**
```
fields @timestamp, srcAddr, bytes
| stats sum(bytes) as totalBytes by srcAddr
| sort totalBytes desc
| limit 10
```

**특정 인스턴스의 통신 상대**
```
filter interfaceId = "eni-abc"
| stats count(*) as connections, sum(bytes) as totalBytes by dstAddr, dstPort
| sort totalBytes desc
```

#### Athena로 S3 Flow Logs 분석
- S3에 저장된 Flow Logs를 SQL로 분석
- 비용 효율적, 대규모 데이터

### 3. Traffic Mirroring

#### 개념
- ENI를 통과하는 **실제 패킷을 복사**해 다른 ENI/대상으로 전송
- 보안 분석 (IDS), 패킷 깊이 분석
- 원본 인스턴스의 네트워크에 영향 없음

#### 구성 요소
- **Mirror Source**: 복사 대상 ENI
- **Mirror Target**: 복사본 받는 ENI 또는 NLB
- **Mirror Filter**: 어떤 트래픽 복사할지 (5-tuple 기반)
- **Mirror Session**: Source + Target + Filter 묶음

#### 제약
- **Nitro 기반 인스턴스만** 지원
- 비용 발생 (트래픽 복제 + Target 비용)

#### 사용 시나리오
- 보안 어플라이언스(Suricata, Zeek)에 트래픽 전달
- 의심스러운 인스턴스의 패킷 분석
- 컴플라이언스 패킷 보관

### 4. Reachability Analyzer

#### 개념
- 두 리소스(EC2, ENI, IGW, TGW 등) 간 **연결성 시뮬레이션**
- 실제 패킷 보내지 않고 정책·라우팅·SG·NACL을 분석해 도달 가능 여부 판단

#### 분석 결과
- **Reachable**: 도달 가능
- **Not Reachable**: 도달 불가 (어느 단계에서 막혔는지 표시)
- **Path 시각화**: 각 hop과 결정 근거

#### 사용 시나리오
- "왜 이 EC2가 RDS에 접근 못 하지?" — 어느 hop에서 거부됐는지 즉시 확인
- 변경 전 영향 분석
- 운영 트러블슈팅의 첫 단계

### 5. Network Access Analyzer

#### 개념
- 네트워크 정책 전체를 분석해 **의도치 않은 접근 경로 발견**
- Reachability Analyzer가 점 대 점이라면, NAA는 광범위 스캔

#### 자주 쓰는 Findings
- "인터넷에서 직접 도달 가능한 인스턴스"
- "온프레미스에서 prod RDS에 도달 가능"
- "Cross-VPC 트래픽이 잘못된 SG 통과"

#### 컴플라이언스 활용
- 정기 스캔으로 보안 정책 검증
- PCI/HIPAA 등 네트워크 격리 입증

### 6. VPC IP Address Manager (IPAM)

#### 개념
- 멀티 계정·멀티 리전의 IP 주소를 중앙 관리
- CIDR 충돌 방지, 자동 할당

#### 기능
- IP Pool 정의
- 계정/리전/OU별 자동 할당
- 사용량 추적
- 컴플라이언스 (예: "10.0.0.0/8만 사용")

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Flow Logs 형식** | text(Default) 또는 parquet | parquet은 Athena 친화적 |
| **Aggregation Interval** | 1분 또는 10분 | 짧을수록 비용 ↑ |
| **VPC Lattice Logs** | 서비스 메시 로그 (별도) | 신기능 |
| **Mirror Filter Priority** | 낮은 번호 우선 | NACL과 같은 패턴 |
| **NACL 평가는 Reachability Analyzer 결과에 반영** | | |

> ⚠️ **함정 1**: Flow Logs는 실제 페이로드 X — HTTP path/header는 안 보임. 그건 ALB Access Log나 WAF.
>
> ⚠️ **함정 2**: 169.254.x.x 트래픽(DNS, Metadata, Time Sync)은 Flow Logs에 안 기록됨.
>
> 💡 **암기 팁**: Flow Logs(메타데이터) ↔ Traffic Mirroring(실제 패킷) ↔ Reachability Analyzer(시뮬레이션).

### 관련 서비스 Cross-Reference

- **Flow Logs → Week 2 Logs Insights** (분석 쿼리)
- **Flow Logs → Week 9 GuardDuty** (위협 탐지 소스)
- **Reachability Analyzer → Week 8 Day 4** (TGW 트러블슈팅)
- **IPAM → Week 1 Day 4** (Organizations와 멀티 계정)

---

## 🏗️ 아키텍처 다이어그램

```
VPC 가시화 도구 비교
==========================================================

   [Flow Logs]
   ───────────
   ENI 트래픽 메타데이터 (5-tuple + bytes + action)
        │
        ├─→ CloudWatch Logs (실시간 알람)
        ├─→ S3 + Athena (장기 분석)
        └─→ Firehose → OpenSearch (시각화)

   [Traffic Mirroring]
   ───────────────────
   ENI 실제 패킷 복사
        │
        └─→ Target ENI / NLB
                 ↓
            Suricata / Zeek / Wireshark
            (Deep Packet Inspection)

   [Reachability Analyzer]
   ───────────────────────
   src ──── 시뮬레이션 ────→ dst
   "왜 막혔나?" → hop별 결정 근거 표시
   (실제 패킷 X)
```

```
Flow Logs 분석 파이프라인
==========================================================

   [VPC Flow Logs]
       │
       ├─→ CloudWatch Logs
       │       │
       │       └─→ Logs Insights 쿼리
       │       └─→ Metric Filter → Alarm
       │
       └─→ S3 (Parquet)
               │
               └─→ Athena SQL
               └─→ QuickSight 시각화
               └─→ Glue + Lambda 분석
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Flow Logs = 메타데이터만** (실제 패킷 X). 169.254.x.x 트래픽 미기록
2. ⭐ **Traffic Mirroring = Nitro 기반 인스턴스만** + 실제 패킷 복사
3. ⭐ **Reachability Analyzer = 시뮬레이션** (패킷 안 보냄). hop별 결정 근거
4. ⭐ **Flow Logs → CloudWatch Logs(실시간) 또는 S3(장기·저렴)**
5. ⭐ **Network Access Analyzer로 의도치 않은 외부 접근 경로 검출**

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. VPC Flow Logs 활성화 (S3 + Parquet)
aws ec2 create-flow-logs \
  --resource-type VPC \
  --resource-ids vpc-abc \
  --traffic-type ALL \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::my-flow-logs/prod-vpc/ \
  --max-aggregation-interval 60 \
  --destination-options 'FileFormat=parquet,HiveCompatiblePartitions=true,PerHourPartition=true' \
  --tag-specifications 'ResourceType=vpc-flow-log,Tags=[{Key=Environment,Value=prod}]'

# 2. Custom Format Flow Logs (CloudWatch Logs)
aws ec2 create-flow-logs \
  --resource-type ENI \
  --resource-ids eni-abc \
  --traffic-type REJECT \
  --log-destination-type cloud-watch-logs \
  --log-group-name /vpc/flowlogs/rejected \
  --deliver-logs-permission-arn arn:aws:iam::123:role/FlowLogsRole \
  --log-format '${version} ${vpc-id} ${subnet-id} ${instance-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${tcp-flags} ${action} ${pkt-srcaddr} ${pkt-dstaddr}'

# 3. Logs Insights 쿼리 - Top Rejected Source
aws logs start-query \
  --log-group-name "/vpc/flowlogs/rejected" \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    fields @timestamp, srcAddr, dstAddr, dstPort, action
    | filter action = "REJECT"
    | stats count(*) as rejects by srcAddr, dstPort
    | sort rejects desc
    | limit 20
  '

# 4. Reachability Analyzer 경로 생성
aws ec2 create-network-insights-path \
  --source i-source \
  --destination i-target \
  --destination-port 443 \
  --protocol tcp

# 분석 시작
ANALYSIS_ID=$(aws ec2 start-network-insights-analysis \
  --network-insights-path-id nip-abc \
  --query 'NetworkInsightsAnalysis.NetworkInsightsAnalysisId' --output text)

# 결과 (Reachable/Not Reachable + hop별 정보)
aws ec2 describe-network-insights-analyses \
  --network-insights-analysis-ids $ANALYSIS_ID

# 5. Traffic Mirroring
aws ec2 create-traffic-mirror-target \
  --network-interface-id eni-analyzer \
  --description "Suricata IDS"

aws ec2 create-traffic-mirror-filter \
  --description "All TCP"

aws ec2 create-traffic-mirror-filter-rule \
  --traffic-mirror-filter-id tmf-abc \
  --traffic-direction ingress \
  --rule-number 100 \
  --rule-action accept \
  --protocol 6 \
  --source-cidr-block 0.0.0.0/0 \
  --destination-cidr-block 0.0.0.0/0

aws ec2 create-traffic-mirror-session \
  --network-interface-id eni-target-instance \
  --traffic-mirror-target-id tmt-abc \
  --traffic-mirror-filter-id tmf-abc \
  --session-number 1

# 6. Network Access Analyzer (Scope 정의)
aws ec2 create-network-insights-access-scope \
  --match-paths '[{"Source":{"ResourceStatement":{"ResourceTypes":["AWS::EC2::Instance"]}},"Destination":{"ResourceStatement":{"ResourceTypes":["AWS::EC2::InternetGateway"]}}}]' \
  --tag-specifications 'ResourceType=network-insights-access-scope,Tags=[{Key=Name,Value=AllInternetExposed}]'

aws ec2 start-network-insights-access-scope-analysis \
  --network-insights-access-scope-id nis-abc
```

---

## 📝 연습 문제

**문제 1.** Private 서브넷의 EC2가 외부 API 호출에 실패한다. 가장 먼저 점검할 도구는?

A) Wireshark
B) Reachability Analyzer로 EC2 → IGW(또는 NAT) 경로 시뮬레이션
C) Inspector
D) GuardDuty

**정답: B**
해설: 연결성 트러블슈팅의 첫 단계. Reachability Analyzer가 hop별 결정 근거 표시 → SG/NACL/Route Table 어디서 막혔는지 즉시 파악.

---

**문제 2.** VPC Flow Logs에 169.254.169.254 IMDS 트래픽이 안 보인다. 원인은?

A) 권한 부족
B) Flow Logs 한계 — 169.254.x.x AWS 내부 트래픽은 기록 안 됨
C) Sampling
D) CloudWatch 지연

**정답: B**
해설: Flow Logs 함정. AWS Internal 트래픽(DNS 169.254.169.253, Metadata 169.254.169.254, Time Sync 169.254.169.123) 미기록.

---

**문제 3.** 보안팀이 의심스러운 인스턴스의 실제 패킷을 캡처해 분석하려 한다. 어떤 도구?

A) Flow Logs
B) Traffic Mirroring (Mirror Source = ENI, Target = NLB → 분석 인스턴스)
C) Reachability Analyzer
D) GuardDuty

**정답: B**
해설: Flow Logs는 메타데이터만. 실제 패킷 캡처는 Traffic Mirroring. Suricata/Zeek 같은 IDS로 전달해 깊이 분석.

---

**문제 4.** Flow Logs를 장기 보관 + 비용 효율적으로 분석하려 한다. 어떤 조합?

A) CloudWatch Logs + Insights
B) S3 (Parquet 포맷) + Athena + QuickSight
C) DynamoDB
D) ElastiCache

**정답: B**
해설: S3는 Logs보다 훨씬 저렴. Parquet은 컬럼형 압축으로 Athena 쿼리 효율 ↑. 장기 보관·대규모 분석에 최적.

---

**문제 5.** 회사가 운영 VPC에서 인터넷에 직접 노출된 모든 인스턴스를 일괄 점검하려 한다. 가장 적합한 도구는?

A) Reachability Analyzer (점 대 점)
B) Network Access Analyzer (광범위 스캔, Scope 정의)
C) Inspector
D) Config

**정답: B**
해설: Network Access Analyzer가 광범위 정책 분석 도구. Source/Destination Scope 정의 후 모든 경로 자동 발견. Reachability는 1:1 시뮬레이션.

---

## 📌 오늘의 요약

1. VPC Flow Logs = 메타데이터(5-tuple). 169.254.x.x AWS 내부 트래픽 미기록
2. Flow Logs 저장: CloudWatch Logs(실시간) / S3 Parquet(장기·저렴)
3. Traffic Mirroring = 실제 패킷 복사 (Nitro 인스턴스만). 보안 IDS로 전달
4. Reachability Analyzer = 시뮬레이션. hop별 결정 근거. 연결성 트러블슈팅 1순위
5. Network Access Analyzer = 광범위 경로 스캔. 의도치 않은 외부 노출 검출
