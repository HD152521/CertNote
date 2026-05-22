# Day 76 - 도메인 1 종합: 복잡한 조직 설계 (26%)

📅 Week 16 (Day 1)
🎯 주제: 도메인 1 완전 정복
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 도메인 1 핵심 서비스를 한 페이지로
- 시나리오 패턴 6가지 즉답

---

## 📌 도메인 1 핵심 (한 페이지)

### Organizations·Control Tower

- Org Root → OU → Account
- **SCP**: Allow/Deny (Deny가 강함, 루트 OU 영향)
- **Control Tower**: 자동화된 Landing Zone (Account Factory·Guardrail)
- **AFT (Account Factory for Terraform)**

### IAM Identity Center

- SSO + Permission Set
- ABAC (태그 기반) 권장
- 외부 IdP 통합 (Okta·AAD·Ping)

### 네트워크

- **TGW**: Hub-Spoke (수십~수백 VPC)
- **Peering**: 소수 VPC 직접 (전이 ✗)
- **PrivateLink**: 서비스 공유 (NLB 백엔드)
- **DX**: 1G/10G/100G·DX Gateway·MACsec·SiteLink
- **VPN**: S2S(IPsec)·Client(OpenVPN)·Accelerated VPN

### 멀티 계정 보안

- **Security Hub Org 위임 관리자**
- **GuardDuty / Macie / Inspector Org 통합**
- **Firewall Manager**: WAF·SG·NWF·DNS Firewall 통합
- **Config Aggregator** + Conformance Pack

### Hybrid

- **Outposts** (랙·서버, 온프레)
- **Local Zones**·**Wavelength**·**Storage Gateway**
- **DataSync·Snow Family**

---

## 🧠 시나리오 패턴

| 패턴 | 정답 |
|------|------|
| 비인가 리전 차단 | SCP Deny |
| 신규 계정 자동 보안 정책 | Control Tower + Account Factory |
| 다중 VPC 연결 | TGW |
| 1:1 또는 1:N 작은 규모 | VPC Peering |
| 다른 계정 서비스 공유 | PrivateLink (NLB) |
| 온프레 → AWS 전용회선 | DX + DX Gateway |
| 외부 IdP 통합 | IAM Identity Center + SAML/OIDC |
| Org 차원 WAF·SG 정책 | Firewall Manager |
| Org 단위 백업 정책 | Backup Policy |
| 사고 한곳 통합 | Security Hub 위임 관리자 |

---

## 📝 연습 문제

**문제 1.** 자회사 계정에서도 비인가 리전 사용 차단.

A) IAM
B) SCP `Deny` with `aws:RequestedRegion`
C) Config Rule
D) NACL

**정답: B**

---

**문제 2.** 신규 계정 자동 베이스라인.

A) Org만
B) Control Tower + Account Factory
C) CFN StackSets만
D) IAM

**정답: B**

---

**문제 3.** 100여 VPC + 온프레 통합.

A) Peering Mesh
B) TGW + DX Gateway
C) VPN Mesh
D) PrivateLink

**정답: B**

---

**문제 4.** SaaS 회사가 외부 고객 VPC에 서비스 제공.

A) Peering
B) PrivateLink (NLB Endpoint Service)
C) VPN
D) Public ELB

**정답: B**

---

**문제 5.** Okta로 SSO + AWS Permission.

A) IAM User
B) IAM Identity Center + SAML
C) Cognito
D) Direct Federation

**정답: B**

---

**문제 6.** 멀티 계정 신규 리소스 WAF 자동 적용.

A) Config Rule + Lambda
B) Firewall Manager (Org)
C) 콘솔 수동
D) SCP

**정답: B**

---

## 📌 오늘의 요약

1. Org·CT·SCP·IAM IC = 거버넌스
2. TGW·DX·PrivateLink·VPN = 네트워크
3. Security Hub·FMS·Config Aggregator = 통합 보안
4. Outposts·Storage Gateway·DataSync = 하이브리드
