# Day 14 - PrivateLink, VPC Endpoint, Service Endpoint

📅 날짜: Week 3 (Day 4)
🎯 주제: 사설 서비스 노출·구독 — Pro 단골 주제
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- PrivateLink의 본질을 안다 (Producer↔Consumer 모델)
- VPC Endpoint 3종(Gateway/Interface/Gateway Load Balancer)을 구분한다
- 서드파티 SaaS·내부 서비스 노출 패턴을 안다
- 비용·DNS 동작을 안다

---

## 🧩 사전 지식 (CS 기초)

- **Service-Oriented Network**: 서비스를 IP/라우팅 대신 "서비스 이름"으로 추상화.
- **Overlapping CIDR**: PrivateLink는 양쪽 VPC의 CIDR이 겹쳐도 동작 (Peering·TGW와 큰 차이).
- **Unidirectional Connection**: Consumer → Producer 단방향.

---

## 📖 이론 내용

### 1. PrivateLink의 본질

- 서비스를 **VPC 내부 ENI 사설 IP**로 노출
- Consumer VPC가 Producer VPC의 서비스를 인터넷 미경유로 사용
- **단방향**: Consumer만 Producer 호출 (반대 X)
- **CIDR 겹침 OK** — Peering/TGW와 큰 차이
- Producer는 NLB 또는 GLB 뒤에 서비스 배치

### 2. VPC Endpoint 3종

| 종류 | 대상 | 비용 |
|------|------|------|
| **Gateway Endpoint** | S3, DynamoDB만 | 무료 |
| **Interface Endpoint (PrivateLink)** | 대부분 AWS 서비스 + 서드파티 + 자체 서비스 | 시간당 + 데이터 |
| **Gateway Load Balancer Endpoint (GWLBe)** | 보안 어플라이언스 체인 | 시간당 + 데이터 |

### 3. Interface Endpoint 동작

```
Consumer VPC
   ├── 서브넷 A (AZ-a)
   │     └── ENI (사설 IP 10.0.1.50) ← Interface Endpoint
   ├── 서브넷 B (AZ-b)
   │     └── ENI (사설 IP 10.0.2.50)
   │
   │  com.amazonaws.ap-northeast-2.s3 같은 서비스 이름으로 호출
   │  Private DNS 활성화 시 표준 endpoint(s3.amazonaws.com)도 사설 IP로 해결
   │
   ▼
Producer (AWS 서비스 또는 SaaS NLB)
```

### 4. SaaS·내부 서비스 노출 패턴

#### 패턴 A: 회사 내부 서비스를 다른 VPC에 노출
```
App VPC (Producer)            Client VPC (Consumer)
   App + NLB                       Interface Endpoint
   PrivateLink Service             ─→ NLB → App
```

#### 패턴 B: SaaS 벤더가 PrivateLink로 고객 제공
- Datadog, Snowflake, MongoDB Atlas 등
- 고객은 인터넷 노출 없이 사설 접속
- 데이터 전송 비용 절감 + 보안

### 5. DNS 동작

- **Private DNS 활성화**: 표준 endpoint(예: `secretsmanager.ap-northeast-2.amazonaws.com`)가 사설 IP로 해결
- **비활성화**: 명시적 endpoint DNS (e.g. `vpce-xxx.secretsmanager.ap-northeast-2.vpce.amazonaws.com`)
- 사설 DNS는 VPC의 `enableDnsSupport` 와 `enableDnsHostnames` 둘 다 켜야 함

### 6. GLB Endpoint (보안 어플라이언스 체인)

- GENEVE 프로토콜로 트래픽을 어플라이언스(방화벽·IDS)에 우회
- "Bump in the wire" 패턴
- 어플라이언스가 다른 VPC에서 중앙 운영
- VPC ingress·egress 검사 일원화

### 7. Endpoint Policy

- VPCe별로 어떤 액션·리소스만 허용할지 제한
- 예: 이 S3 Gateway Endpoint로는 특정 버킷만 접근 허용

### 8. PrivateLink vs Peering vs TGW

| 항목 | PrivateLink | Peering | TGW |
|------|-------------|---------|-----|
| 모델 | 서비스 단위 | 네트워크 단위 | 네트워크 단위 |
| 방향 | 단방향 (Producer←Consumer) | 양방향 | 양방향 |
| CIDR 겹침 | OK | NG | NG |
| 확장성 | 서비스 수만큼 | 1:1 | 허브 |
| 비용 | 시간 + 데이터 | 무료(통신비만) | TGW + 데이터 |

> 💡 **Pro 정답**: "외부 SaaS 사설 접속", "고객 VPC에 서비스만 노출", "CIDR 겹침" → **PrivateLink**.

---

## 🧠 알아두면 좋은 심화 이론

### Cross-Region PrivateLink

- 2024년부터 지원
- Producer 리전과 Consumer 리전 다를 때

### Cross-Reference

- **Week 7**: ECS/EKS PrivateLink로 ECR 접근
- **Week 11**: 보안 — 인터넷 노출 없이 KMS·Secrets Manager 사용

---

## 🏗️ 아키텍처 다이어그램 — 서드파티 SaaS PrivateLink

```
Consumer Account (귀사)
   VPC 10.0/16
   └── Interface Endpoint (Snowflake)
         ENI 10.0.5.20 (AZ-a)
         ENI 10.0.6.20 (AZ-b)
            │
            │  Snowflake URL → 사설 IP 해석 (Private DNS)
            ▼
Producer Account (Snowflake)
   PrivateLink Service
   NLB ─── Snowflake Cluster
```

---

## ⭐ 핵심 포인트

1. ⭐ **PrivateLink = 서비스 단위 단방향**, CIDR 겹쳐도 OK
2. ⭐ **S3/DynamoDB는 Gateway(무료)**, 나머지는 **Interface(유료)**
3. ⭐ Private DNS 활성화하면 표준 endpoint가 사설 IP로 해결
4. ⭐ **GLB Endpoint**로 보안 어플라이언스 트래픽 우회
5. ⭐ Endpoint Policy로 endpoint별 액션·리소스 제한

---

## 💻 실제 예시 - Interface Endpoint 생성

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxx \
  --service-name com.amazonaws.ap-northeast-2.secretsmanager \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-aaa subnet-bbb \
  --security-group-ids sg-xxx \
  --private-dns-enabled
```

---

## 📝 연습 문제

**문제 1.** Snowflake에 인터넷 미경유로 사설 접속. Best?

A) NAT GW
B) PrivateLink (Interface Endpoint)
C) VPC Peering
D) Direct Connect

**정답: B**
해설: SaaS PrivateLink가 표준.

---

**문제 2.** EC2(Private Subnet)에서 S3 접근, 데이터 전송 비용 최소. Best?

A) NAT GW + 인터넷
B) S3 Gateway Endpoint
C) S3 Interface Endpoint
D) Direct Connect

**정답: B**
해설: Gateway Endpoint 무료. Interface는 유료.

---

**문제 3.** Consumer VPC와 Producer VPC CIDR 겹침. 사설 통신 필요. Best?

A) Peering
B) TGW
C) PrivateLink
D) DX

**정답: C**
해설: PrivateLink만 CIDR 겹쳐도 동작.

---

**문제 4.** 모든 VPC 송수신 트래픽을 방화벽 어플라이언스로 검사하는 중앙 패턴. Best?

A) NACL
B) GLB Endpoint (GWLBe)
C) PrivateLink
D) WAF

**정답: B**
해설: GLB Endpoint가 어플라이언스 체인 표준.

---

**문제 5.** Interface Endpoint 사용 시 `s3.amazonaws.com` 같은 표준 endpoint가 사설 IP로 해결되게 하려면?

A) Route 53 Resolver
B) Private DNS 활성화
C) NAT GW
D) Endpoint Policy

**정답: B**
해설: Private DNS 활성화 옵션.

---

**문제 6.** S3 Gateway Endpoint로 특정 버킷만 접근하게 제한. Best?

A) IAM Policy만
B) NACL
C) Endpoint Policy
D) SCP

**정답: C**
해설: Endpoint Policy로 endpoint별 접근 제한.

---

## 📌 오늘의 요약

1. PrivateLink = 서비스 단위 단방향, CIDR 겹침 OK
2. S3/DynamoDB = Gateway(무료), 나머지 = Interface
3. GLBe로 보안 어플라이언스 트래픽 중앙 검사
4. Private DNS 활성화로 표준 endpoint도 사설 해결
5. Endpoint Policy로 endpoint별 제한
