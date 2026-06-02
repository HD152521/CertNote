# Day 5 - Week 8 복습 + 시나리오 10문제

📅 날짜: Week 8 (Day 5)
🎯 주제: VPC·네트워크 운영 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 8 핵심 개념 한 줄 요약

1. **SG = Stateful, NACL = Stateless** — NACL은 ephemeral ports 명시 필요
2. **각 서브넷 5개 예약 IP** (/28은 사용 가능 IP 11개)
3. **Flow Logs = 메타데이터** (실제 패킷 X). 169.254.x.x 미기록
4. **Reachability Analyzer = 시뮬레이션** (hop별 결정 근거). 연결성 트러블슈팅 1순위
5. **Traffic Mirroring = 실제 패킷 복사** (Nitro 인스턴스만)
6. **NAT GW는 AZ 종속** — Multi-AZ HA 위해 AZ당 1개
7. **Gateway Endpoint = S3/DDB 무료**, Interface Endpoint = PrivateLink 유료
8. **VPC Peering ≠ Transitive**, **TGW = Transitive**
9. **VPN = 즉시·저렴**, **DX = 일관·고대역폭**
10. **Route 53 정책 8종**: Simple/Weighted/Latency/Geolocation/Geoproximity/Failover/Multivalue/IP-based

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | Flow Logs | Traffic Mirroring | Reachability Analyzer |
|------|-----------|-------------------|------------------------|
| 데이터 | 메타데이터 5-tuple | 실제 패킷 복사 | 시뮬레이션 |
| 비용 | 저장량 | 트래픽 복제 | 분석당 |
| 대상 | ENI/Subnet/VPC | Nitro ENI만 | 두 리소스 간 |

| 항목 | VPC Peering | Transit Gateway |
|------|-------------|-----------------|
| 토폴로지 | N×N | Hub-Spoke |
| Transitive | X | O |
| 비용 | 데이터만 | Attachment + 데이터 |
| 관리 | 복잡 | 단순 |

| 항목 | Gateway Endpoint | Interface Endpoint |
|------|------------------|--------------------|
| 서비스 | S3, DynamoDB만 | 거의 모든 AWS |
| 비용 | 무료 | 시간 + GB |
| 라우팅 | Route Table | DNS |
| Cross-Account | X | O |

| 항목 | VPN | Direct Connect |
|------|-----|----------------|
| 매체 | 인터넷 + IPsec | 전용 회선 |
| 대역폭 | 1.25 Gbps/터널 | 1/10/100 Gbps |
| 지연 | 변동 | 일관·낮음 |
| 비용 | 저렴 | 비쌈 |
| 설치 | 즉시 | 수 주 |

---

## 📝 시나리오 10문제

**문제 1.** Custom NACL에 80번 인바운드만 허용했더니 HTTP 응답이 안 나간다. 원인은?

A) IGW
B) NACL은 Stateless라 ephemeral ports(1024-65535) 아웃바운드도 명시 필요
C) SG
D) Route Table

**정답: B**
해설: NACL의 핵심 함정. Stateless라 응답 트래픽도 별도 정의 필요. SG와 가장 큰 차이.

---

**문제 2.** Private 서브넷의 EC2가 S3에 트래픽이 많아 NAT GW 비용이 폭증한다. 해결책은?

A) NAT GW 증설
B) Gateway Endpoint(S3) 추가 - 무료, NAT 우회
C) Public 서브넷으로 이동
D) Interface Endpoint

**정답: B**
해설: S3/DynamoDB는 Gateway Endpoint(무료)로 NAT GW 우회. 비용 절감 + 보안 ↑(AWS 백본 내부).

---

**문제 3.** 사설 VPC에서 SSM Session Manager를 사용하려 한다. 필요한 것은?

A) NAT GW
B) Interface Endpoint 3개 (ssm, ssmmessages, ec2messages)
C) Gateway Endpoint
D) VPN

**정답: B**
해설: SSM은 Interface Endpoint. 3개 모두 필요. 인터넷 차단 환경의 표준 구성.

---

**문제 4.** Private EC2가 외부 API 호출 실패한다. 가장 먼저 점검할 도구는?

A) Wireshark
B) Reachability Analyzer로 EC2 → IGW/NAT 경로 시뮬레이션
C) Inspector
D) GuardDuty

**정답: B**
해설: 연결성 트러블슈팅의 첫 단계. hop별 결정 근거로 어디서 막혔는지 즉시 파악.

---

**문제 5.** 회사가 20개 VPC + 온프레미스 통합 네트워크를 운영하려 한다. 가장 효율적인 도구는?

A) VPC Peering 전수
B) Transit Gateway (Hub-Spoke) + VPN/DX
C) VPN만
D) Direct Connect만

**정답: B**
해설: 20×19/2=190 Peering = 관리 지옥. TGW가 Hub-Spoke + Transitive + 온프레미스 통합.

---

**문제 6.** Multi-Region 환경에서 사용자에게 가장 빠른 리전 라우팅하려면?

A) Weighted
B) Latency-based Routing - AWS 측정으로 지연 최소 리전 응답
C) Geolocation
D) Failover

**정답: B**
해설: Latency-based는 AWS의 네트워크 측정 기반. Geolocation은 국가/대륙 기준(지연과 무관).

---

**문제 7.** Multi-AZ Private 서브넷의 외부 통신을 HA로 구성하려면?

A) NAT GW 1개 공유
B) AZ당 NAT GW 1개 + 각 AZ Private 라우팅 테이블이 자기 AZ의 NAT로
C) NAT Instance
D) IGW

**정답: B**
해설: NAT GW는 AZ 종속. Multi-AZ HA 위해 AZ마다 별도 + 같은 AZ로 라우팅.

---

**문제 8.** 보안팀이 의심스러운 인스턴스의 실제 패킷을 캡처하려 한다. 어떤 도구?

A) Flow Logs
B) Traffic Mirroring (Mirror Source ENI → Target NLB → 분석 인스턴스)
C) Reachability Analyzer
D) GuardDuty

**정답: B**
해설: Flow Logs는 메타데이터만. 실제 패킷 캡처는 Traffic Mirroring. Suricata/Zeek로 전달.

---

**문제 9.** B2B SaaS가 고객 VPC에 서비스를 인터넷 거치지 않고 노출하려 한다. 어떤 기술?

A) VPC Peering
B) AWS PrivateLink (NLB + Endpoint Service + Consumer Endpoint)
C) Transit Gateway
D) VPN

**정답: B**
해설: PrivateLink의 정확한 사용 사례. CIDR 충돌 무관, 인터넷 노출 X, 멀티 고객 가능.

---

**문제 10.** Direct Connect만 사용 중이다. 회선 장애 시 가용성을 높이려면?

A) DX 회선 1개로 충분
B) 2번째 DX 회선(다른 위치) + VPN backup 조합이 표준 HA 패턴
C) 더 큰 DX 회선
D) Multi-Region

**정답: B**
해설: DX 1개는 SPOF. AWS 권장 HA 패턴: 2개 DX(다른 위치) + VPN backup. 비용 대비 가용성 최적.

---

## 🔮 다음 주 예고 (Week 9)

Week 9는 **보안 운영** — KMS / Secrets / GuardDuty / Security Hub.

- Day 1: KMS - Key Policy, Grant, 회전, CloudHSM
- Day 2: Secrets Manager 운영 - 자동 회전, Cross-Region Replication
- Day 3: IAM Access Analyzer, Trusted Advisor 보안 체크
- Day 4: GuardDuty, Security Hub, Inspector, Macie
- Day 5: Week 9 복습 + 시나리오 10문제

> 💡 보안·컴플라이언스(16%) + 위협 탐지 도구는 운영자가 매일 보는 영역.
