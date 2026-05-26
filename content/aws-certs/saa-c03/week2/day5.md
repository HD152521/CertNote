# Day 10 - Week 2 종합: 패킷이 흐르는 길을 한 번 더 그리기

VPC는 작은 박스 하나가 아니라 라우팅 테이블 + 게이트웨이 + 방화벽 + 엔드포인트의 합주다. 시험에서 "이 시나리오에 가장 적절한 네트워크 설계는?" 류 문제가 나오면, 머릿속에서 패킷이 어디서 출발해 어디서 막히고 어디로 빠지는지를 그릴 수 있어야 답이 보인다.

이 글은 Week 2의 모든 조각을 한 그림 위에 다시 얹는다.

## VPC 토폴로지 종합 다이어그램

```
                  [ Internet ]
                       ↑
                  [ IGW ]
                       │
  ┌────────────────────┼──────────────────────────┐
  │  VPC 10.0.0.0/16   │                          │
  │                                                │
  │  Public Subnet 10.0.0.0/24 (AZ-a)              │
  │   ├─ Bastion / ALB / NAT GW (EIP)              │
  │   └─ Route: 0.0.0.0/0 → IGW                    │
  │                                                │
  │  Private Subnet 10.0.10.0/24 (AZ-a)            │
  │   ├─ App EC2 / ECS Task                        │
  │   └─ Route: 0.0.0.0/0 → NAT GW                 │
  │                                                │
  │  DB Subnet 10.0.20.0/24 (AZ-a)                 │
  │   ├─ RDS (no public)                           │
  │   └─ Route: local only                         │
  │                                                │
  │  (AZ-b, AZ-c도 같은 구조)                       │
  │                                                │
  │  Gateway Endpoint → S3, DynamoDB               │
  │  Interface Endpoint → SSM, ECR, Secrets...     │
  │                                                │
  └────────────────────┬───────────────────────────┘
                       │
                  [ TGW ] ─── 다른 VPC, 온프레미스
```

## 시나리오 키워드 → 정답 매핑

| 키워드 | 정답 |
|--------|------|
| "Private 인스턴스가 외부 API 호출" | NAT Gateway (AZ별) |
| "운영자가 인스턴스에 안전하게 접근" | Session Manager |
| "TCP 22 포트를 열고 싶지 않다" | Session Manager / EIC Endpoint |
| "S3 비공개 접근 + 무료" | S3 Gateway Endpoint |
| "SaaS·다른 AWS 서비스 비공개 접근" | Interface Endpoint (PrivateLink) |
| "VPC 2개 직접 연결" | Peering |
| "다수 VPC + 온프레미스 Hub" | Transit Gateway |
| "온프레미스 빠르게 연결" | Site-to-Site VPN |
| "온프레미스 대용량·저지연" | Direct Connect |
| "사용자가 원격으로 VPC 접근" | ClientVPN |
| "특정 IP 대역 광역 차단" | NACL Deny 룰 |
| "응답 트래픽 자동 통과" | SG (stateful) |
| "사후 트래픽 감사" | VPC Flow Logs |
| "패킷 페이로드까지 검사" | Traffic Mirroring |
| "DNS 쿼리 감사" | Route 53 Resolver Query Logs |
| "다계정 VPC 공유" | AWS RAM |
| "IP 거버넌스 자동화" | IPAM |

## SG vs NACL 핵심 한 줄

| | SG | NACL |
|---|---|---|
| 적용 | ENI | Subnet |
| 상태 | Stateful (응답 자동) | Stateless (응답 별도) |
| 룰 | Allow만 | Allow + Deny |
| Source | IP, SG, prefix list | IP만 |
| 평가 | 모든 룰 합집합 | 번호 순 첫 매칭 |

## 자주 틀리는 함정 정리

1. **Public 서브넷 3조건**: IGW 경로 + Public IP + SG 허용. 한 가지라도 빠지면 안 된다.
2. **NACL은 ephemeral port range를 따로 열어야** outbound 응답이 들어온다.
3. **NAT GW는 AZ scoped**. AZ별로 만들고 같은 AZ Private 서브넷이 같은 AZ NAT 사용.
4. **Peering은 non-transitive**. VPC가 늘면 TGW로 전환.
5. **CIDR 겹치면 Peering·TGW 불가**. 회사 차원 IP 거버넌스 필요.
6. **Gateway Endpoint는 S3와 DynamoDB만**. 나머지는 Interface.
7. **Default NACL은 모두 허용, Custom NACL은 모두 거부가 기본**.
8. **Endpoint Policy로 exfiltration 방어**. IAM 정책만으로는 부족.

## 진짜 사고 사례 한 번 더

- **2017년 us-east-1 S3 장애**: 단일 리전 의존이 인터넷 절반을 흔든 사건.
- **2019년 Capital One**: SSRF + IMDSv1 + 과도한 IAM 권한. IMDSv2 + Endpoint Policy + Boundary 조합이 사후 표준이 됨.
- **2021년 단일 AZ NAT 다운**: per-AZ NAT 패턴의 결정적 계기.
- **2022년 Travis CI**: 장기 토큰 노출 → OIDC 페더레이션 표준화.

## 다음 주 예고

Week 3은 컴퓨팅(EC2, ASG, ELB)이다. 네트워크 위에 워크로드가 올라가는 과정이다.

---

## 📝 종합 연습 문제 (시나리오 10문항)

**문제 1.** 한 핀테크가 Private 서브넷의 ECS 태스크가 outbound API를 호출해야 한다. 전체 AZ 장애에도 outbound가 유지되도록 설계하려면?

A) 단일 NAT GW + 모든 Private 서브넷이 그것을 라우팅
B) AZ별 NAT GW + 같은 AZ Private 서브넷이 같은 AZ NAT 라우팅
C) NAT Instance를 ASG로
D) IGW를 Private 서브넷에 부착

**정답: B**
해설: NAT GW는 AZ scoped. AZ별로 두고 같은 AZ Private이 같은 AZ NAT를 쓰면 한 AZ가 죽어도 다른 AZ는 살아남는다.

---

**문제 2.** 운영자가 Production EC2에 SSH로 접근해야 한다. 가장 보안 우수한 방법은?

A) Public IP + SSH 키
B) Bastion + SSH 키
C) Session Manager
D) ClientVPN + SSH 키

**정답: C**
해설: 22 포트 자체를 닫고, IAM 정책으로 접근 제어, 모든 세션이 CloudWatch Logs 자동 저장. Zero Trust 모델.

---

**문제 3.** S3에 매일 수 TB가 Private 서브넷에서 흘러가는데 NAT GW 비용이 폭증한다. 가장 적합한 조치는?

A) NAT GW 추가
B) S3 Gateway Endpoint 추가 (무료)
C) Direct Connect
D) IGW로 직접 라우팅

**정답: B**
해설: Gateway Endpoint는 무료이고 데이터가 AWS 내부망으로 흘러 NAT 데이터 전송비도 절감. S3·DynamoDB 한정.

---

**문제 4.** 회사가 50개 AWS 계정의 VPC를 모두 연결하려 한다. 가장 적합한 솔루션은?

A) 풀 메시 Peering (1225개)
B) AWS RAM + Transit Gateway 공유
C) NAT Gateway 50개
D) Direct Connect 50개

**정답: B**
해설: TGW를 한 계정에서 만들고 RAM으로 다른 계정에 공유. 모든 계정이 같은 TGW에 attach. 다계정 + 다 VPC 표준 패턴.

---

**문제 5.** Custom NACL을 만들었는데 inbound 80은 허용했는데 외부 응답이 안 온다. 원인은?

A) SG가 거부
B) NACL stateless라 outbound ephemeral port range 미허용
C) IGW가 없음
D) Public IP 미부여

**정답: B**
해설: NACL stateless. 응답 트래픽이 outbound로 나가야 하므로 1024-65535 ephemeral port 허용 필요. SG였으면 outbound 자동 허용.

---

**문제 6.** 두 회사 합병 후 두 VPC 모두 10.0.0.0/16이다. 가장 현실적 접근은?

A) 그냥 Peering
B) 한 쪽 VPC를 새 CIDR로 마이그레이션
C) TGW만 추가
D) NAT GW로 IP 충돌 해결

**정답: B**
해설: 겹치는 CIDR는 Peering·TGW 모두 라우팅 불가. 한 쪽 마이그레이션 외 답이 없다. 사후 IPAM으로 회사 차원 IP 거버넌스 도입.

---

**문제 7.** 한 EC2에 SG 5개를 붙였다. SG A는 22 허용, SG B는 22 거부 룰이 있다(불가하지만 가정). 어떻게 평가될까?

A) 거부 우선
B) 처음 매칭
C) SG는 Deny 룰 자체가 불가능, 모두 Allow 룰 합집합
D) Alphabetical 순서

**정답: C**
해설: SG는 Allow only. Deny 룰이 문법적으로 안 만들어진다. 모든 SG 룰의 합집합으로 평가. 명시 거부는 NACL이 담당.

---

**문제 8.** 외부 SaaS Snowflake에 인터넷 안 거치고 비공개 접근하려면?

A) VPC Peering
B) Snowflake가 publish한 PrivateLink Interface Endpoint 사용
C) Direct Connect
D) NAT GW

**정답: B**
해설: SaaS와의 PrivateLink는 외부 ISV가 endpoint service를 publish하고 우리 VPC에 ENI 생성. Snowflake, Databricks, MongoDB Atlas 등 주요 SaaS가 지원.

---

**문제 9.** Flow Logs로 SQL injection 페이로드까지 보고 싶다. 가장 적합한 솔루션은?

A) Flow Logs version 5로 업그레이드
B) VPC Traffic Mirroring + IDS
C) CloudTrail
D) GuardDuty

**정답: B**
해설: Flow Logs는 헤더 메타데이터만. 페이로드 캡처는 Traffic Mirroring으로 ENI 트래픽을 복제 후 Suricata 등 IDS로 분석.

---

**문제 10.** 같은 리전 두 AZ 사이의 데이터 전송에는 비용이 부과될까?

A) 무료
B) GB당 양방향 과금
C) 한 방향만 과금
D) Peering 사용 시만 과금

**정답: B**
해설: cross-AZ 데이터 전송은 양방향 모두 GB당 과금($0.01/GB 양쪽). 비용 최적화의 핵심 함정. Multi-AZ HA의 숨은 비용. EFS·RDS Multi-AZ·ALB cross-zone도 모두 영향. Week 10 비용 최적화에서 자세히 다룬다.
