# Day 8 - 보안 그룹 vs NACL, VPC Flow Logs

📅 날짜: Week 2 (Day 3)
🎯 주제: VPC 트래픽 제어 — L4 방화벽
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 보안 그룹(SG)과 네트워크 ACL(NACL) 차이를 stateful/stateless로 설명한다
- VPC Flow Logs로 트래픽 디버깅을 한다
- 함정 시나리오(Allow는 SG, Deny는 NACL)에 정답을 고른다

---

## 🧩 사전 지식 (CS 기초)

- **Stateful 방화벽**: 한 번 허용한 연결의 응답 패킷은 자동 허용. SG가 stateful.
- **Stateless 방화벽**: 각 패킷 단독 평가. inbound + outbound 둘 다 규칙 필요. NACL이 stateless.
- **에페메럴 포트(Ephemeral)**: 클라이언트가 임시로 쓰는 1024-65535 포트 범위. NACL에서 이걸 빠뜨리면 응답 못 받음.
- **TCP 핸드셰이크**: SYN → SYN-ACK → ACK. stateful이 이 흐름을 추적.

---

## 📖 이론 내용

### 1. Security Group (SG)

- **ENI(Elastic Network Interface) 단위** 적용 (= 인스턴스에).
- **Stateful**: 인바운드 Allow 시 응답 outbound 자동.
- **Allow 규칙만** 존재. Deny 없음. (없는 것은 Deny)
- 다른 SG를 source/destination으로 참조 가능 (=동적 그룹).
- 인스턴스당 최대 5개 SG, 각 SG 최대 60 규칙.

### 2. Network ACL (NACL)

- **서브넷 단위** 적용.
- **Stateless**: inbound, outbound 별도 규칙. 응답 트래픽도 명시 필요.
- **Allow + Deny** 모두 가능.
- **번호 순서**로 평가. 작은 번호가 먼저. 매치되면 즉시 결정.
- 기본 NACL: 모두 허용. 신규 NACL: 모두 거부.

### 3. SG vs NACL 비교표 (시험 최빈출)

| 항목 | Security Group | NACL |
|------|-----------------|-------|
| 단위 | ENI / 인스턴스 | 서브넷 |
| State | Stateful | Stateless |
| 규칙 | Allow only | Allow + Deny |
| 평가 | 모든 규칙 평가 | 번호 순 매치 |
| 사용 사례 | 인스턴스 보호 | 서브넷 광역 차단 (예: IP 블랙리스트) |

> 💡 **암기 팁**: "차단(Deny)이 필요하면 NACL". SG는 화이트리스트만 가능.

### 4. VPC Flow Logs

- ENI / 서브넷 / VPC 단위로 IP 트래픽 로깅.
- 대상: **CloudWatch Logs / S3 / Kinesis Data Firehose**.
- 메타데이터(소스/대상 IP/포트/패킷·바이트/액션)만 — 페이로드 없음.
- Accept / Reject / All 선택 가능.
- 시나리오: "SG 차단 원인 파악", "이상 트래픽 탐지(EC2 → 모르는 IP)".

### 5. 디버깅 흐름 — 트래픽이 안 갈 때

1. 라우팅 테이블에 경로 있나?
2. NACL inbound + outbound 모두 통과?
3. SG inbound (수신 측) + outbound (송신 측) 통과?
4. OS 방화벽?
5. Flow Logs로 Reject 확인.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **SG는 Deny IP 못함** | 특정 IP 차단 → NACL 사용 | "특정 IP 차단" 시나리오 |
| **NACL Ephemeral 함정** | outbound 응답 안 열면 인바운드 응답 못감 | 1024-65535 outbound 필요 |
| **Reachability Analyzer** | 두 ENI 사이 가상 패킷 시뮬레이션 | 디버깅 도구 |
| **AWS Network Firewall** | VPC 단위 L3-L7 IPS/IDS | 고급 보안 |
| **Flow Logs는 0초도 아님** | 약 1분 윈도우로 집계 | 실시간 차단엔 부적합 |

> ⚠️ **함정**: "SG에서 거부 규칙을 추가" → 불가능. SG는 Allow만.

### 관련 서비스 Cross-Reference

- WAF는 L7 → **Week 8**
- GuardDuty 위협 탐지 → **Week 8**
- Reachability Analyzer → 본 주 디버깅
- Network Firewall → 고급 (시험 가벼움)

---

## 🏗️ 아키텍처 다이어그램

```
[ 패킷이 EC2까지 도달하는 길 ]

  Internet → IGW
              ↓
         (Public Subnet)
              ↓
         NACL Inbound 평가  ← Stateless (응답도 outbound 규칙 필요)
              ↓
         Route Table
              ↓
              SG Inbound 평가  ← Stateful (응답 자동 허용)
              ↓
              EC2 (ENI)
              ↓
         SG Outbound (응답)   ← 자동
              ↓
         NACL Outbound        ← 명시 필요 (Ephemeral!)
              ↓
            IGW → Internet


[ Flow Logs 흐름 ]

  ENI/Subnet/VPC 트래픽
        ↓
  Flow Log 메타데이터
        ↓
  CloudWatch Logs / S3 / Firehose
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **SG는 stateful, NACL은 stateless**.
2. ⭐ **SG는 Allow only**, NACL은 **Allow + Deny**.
3. ⭐ **특정 IP 블랙리스트는 NACL**, IP 화이트리스트는 SG.
4. ⭐ NACL outbound에 **Ephemeral 1024-65535** 안 열면 응답 못 옴.
5. ⭐ Flow Logs는 페이로드 미포함, 메타데이터만.

---

## 💻 실제 예시 - AWS CLI

```bash
# SG 생성 + HTTP/HTTPS 허용
aws ec2 create-security-group --group-name web-sg \
  --description "ALB Web SG" --vpc-id vpc-aaa

aws ec2 authorize-security-group-ingress \
  --group-id sg-bbb \
  --ip-permissions IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges='[{CidrIp=0.0.0.0/0}]'

# NACL 생성 + 특정 IP 블랙리스트
aws ec2 create-network-acl --vpc-id vpc-aaa
aws ec2 create-network-acl-entry --network-acl-id acl-ccc \
  --rule-number 100 --protocol -1 \
  --cidr-block 198.51.100.0/24 --rule-action deny --ingress

# Flow Logs 활성화 (VPC 전체)
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-aaa \
  --traffic-type ALL --log-destination-type cloud-watch-logs \
  --log-group-name /aws/vpc/flow --deliver-logs-permission-arn arn:aws:iam::...
```

---

## 📝 연습 문제

**문제 1.** 한 IP에서 오는 트래픽을 **차단**하려고 한다. 가장 적합한 곳은?

A) Security Group inbound rule B) Network ACL inbound rule C) IAM 정책 D) Route Table

**정답: B** — SG는 Allow only. Deny는 NACL.

---

**문제 2.** Stateful 방화벽의 특징은?

A) 모든 패킷을 독립 평가 B) 응답 패킷은 자동 허용 C) 번호 순서로 평가 D) 서브넷 단위

**정답: B** — SG.

---

**문제 3.** EC2가 외부 API 응답을 못 받는다. NACL을 확인했더니 outbound 1024-65535이 없다. 원인은?

A) SG 막힘 B) NACL outbound Ephemeral 포트 부재 C) IGW 부재 D) RT 부재

**정답: B**.

---

**문제 4.** VPC Flow Logs가 캡처하는 것은?

A) 패킷 페이로드 B) 패킷 헤더만 C) IP 트래픽 메타데이터(IP/포트/액션) D) HTTP 본문

**정답: C**.

---

**문제 5.** SG에 대한 설명 중 옳지 않은 것은?

A) ENI 단위 적용 B) Deny 규칙 작성 가능 C) 다른 SG를 source로 참조 가능 D) Stateful

**정답: B**.

---

## 📌 오늘의 요약

1. SG = ENI 단위 / Stateful / Allow only.
2. NACL = 서브넷 단위 / Stateless / Allow+Deny / 번호 순 평가.
3. IP 차단(Deny)은 항상 NACL.
4. Ephemeral 포트(1024-65535) NACL outbound 필수.
5. Flow Logs는 메타데이터만 — 트러블슈팅/위협 탐지에 사용.
