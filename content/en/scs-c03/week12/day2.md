# Day 2 - Integrated Review Domains 3 & 4: Infrastructure Security ↔ Identity and Access Management

Domains 3 (Infrastructure Security, ~20%) and 4 (IAM, ~16%) are the highest-scoring bundle in exams. Their relationship is clear: **Domain 3 controls "where can you reach (network path)" while Domain 4 controls "what can you do (permission)"**. Specialty answers almost always demand *"block at network boundary, then block again at IAM with least privilege"* — dual control. Today we bind these two dimensions into one access control model.

## Infrastructure Security: Network Path Control Layers

| Control | Stateful | Unit | Key Features |
|---|---|---|---|
| Security Group | stateful | ENI/instance | Allow rules only. Auto-allow responses |
| NACL | stateless | Subnet | Allow+deny. Separate in/out. Explicit response ports |
| VPC Endpoint (Gateway) | — | S3/DynamoDB | Routing-based. Free |
| VPC Endpoint (Interface/PrivateLink) | — | Most services | ENI+private IP. SG-controlled |
| Network Firewall | stateful | inspection VPC | IPS, domains, Suricata |

SG is stateful so inbound allow auto-allows response. NACL is stateless so must explicitly allow *ephemeral ports (1024-65535)* outbound. This asymmetry is a common exam trap.

### Private Connectivity Pattern

Access AWS services without Internet:
- **S3/DynamoDB** → Gateway Endpoint (routing, free). Restrict by endpoint policy.
- **Other services, internal SaaS** → Interface Endpoint (PrivateLink). Private IP.
- **On-premises ↔ VPC** → Site-to-Site VPN (IPsec) or Direct Connect (+VPN for encryption).
- **VPC ↔ VPC** → Peering (non-transitive) or Transit Gateway (hub, transitive).

Critical trap: **VPC Endpoint creation alone doesn't grant access.** IAM/endpoint policy must allow, AND bucket policy with `aws:SourceVpce`/`aws:SourceVpc` conditions locks S3 bucket to *specific VPC only* — exfiltration prevention.

## IAM: Permission Evaluation Logic

IAM policy evaluation is the exam's most precise area. Master the order:

1. **Explicit Deny** → anywhere → **immediate denial** (highest priority).
2. **SCP** (Organizations) → *ceiling* (permission upper bound). If SCP doesn't allow, IAM Allow is denied.
3. **Identity/Resource Allow** → one of either (cross-account both needed) → allow.
4. **Permission Boundary** → individual user/role *max permission* limit.
5. No explicit Allow → **implicit denial** (default).

> 💡 **Core**: Permission = (Identity ∪ Resource Allow) ∩ SCP ∩ Permission Boundary − all Deny. SCP and Permission Boundary don't *grant* — only *limit ceilings*. This prevents "I added SCP, why no permission?" confusion.

### Cross-Account and Temporary Credentials

- **AssumeRole**: trust policy (who can assume) + permission policy (permissions upon assume) separation. STS issues temporary keys.
- **External ID**: third-party assumes your role safely → *confused deputy* prevention.
- **Roles Anywhere**: on-premises workload uses X.509 cert for IAM role.
- **IAM Identity Center (SSO)**: multi-account SAML/OIDC federation. permission sets centrally manage.
- **Cognito**: app end-users (not AWS staff). Identity Pool grants temporary AWS credentials.

> ⚠️ **Confusion**: 
> - **IAM role = employees/workloads** (federation/AssumeRole). **Cognito = app users**. Never mix.
> - **Never hardcode long-term access keys in instances** → EC2 instance profile (role), EKS IRSA/Pod Identity, Lambda execution role.
> - **SCP doesn't grant permissions** — only ceiling.

## Dual-Domain Mental Model

```
Request reachable? ──► [Infrastructure: SG/NACL/Endpoint/routing] ── Network path passes
      │
      ▼ (path OK)
Request authorized? ──► [IAM: Deny→SCP→Allow→Boundary] ── Permission passes
      │
      ▼ (both OK)
     Action allowed
```

Defense in depth: block at network (SG), then at IAM (least privilege), then at endpoint/bucket policy (SourceVpce condition). One layer breached, next catches.

## 📝 연습 문제

**문제 1.** 프라이빗 서브넷의 EC2가 인터넷을 경유하지 않고 특정 S3 버킷에만 접근해야 하며, 자격증명 하드코딩은 금지다. 가장 적절한 설계는?

A) NAT Gateway로 인터넷 경유 후 액세스 키를 EC2에 저장  
B) S3 Gateway VPC Endpoint(엔드포인트 정책으로 해당 버킷만) + 버킷 정책 `aws:SourceVpce` 조건 + EC2 인스턴스 프로파일(역할)에 최소 권한  
C) 퍼블릭 서브넷으로 옮기고 보안 그룹만 잠근다  
D) IAM 사용자 액세스 키를 환경 변수로 주입  

**정답: B**

---

**문제 2.** Organizations에서 SCP로 특정 리전 외 모든 서비스를 거부했는데, 한 계정의 관리자가 자신에게 IAM full-admin 정책을 붙여도 그 리전에서 동작하지 못한다. 이유는?

A) IAM 정책이 손상됐다  
B) SCP는 권한 상한선(guardrail)이므로, SCP가 허용하지 않으면 IAM Allow가 있어도 거부된다  
C) Permission Boundary가 자동 적용됐다  
D) STS 토큰이 만료됐다  

**정답: B**

---

**문제 3.** 서드파티 SaaS가 고객 계정의 리소스를 읽도록 교차 계정 접근을 부여할 때, confused deputy 공격을 방지하는 권장 메커니즘은?

A) SaaS에 IAM 사용자 액세스 키를 발급  
B) 교차 계정 역할의 trust policy에 SaaS 계정 Principal과 함께 External ID 조건을 추가  
C) 버킷을 퍼블릭으로 공개  
D) Security Group으로 SaaS IP를 허용  

**정답: B**

---

**문제 4.** 특정 악성 IP 대역을 서브넷 전체에서 차단해야 한다. 보안 그룹으로는 불가능했던 이유와 올바른 통제는?

A) 보안 그룹에는 명시적 거부 규칙이 없어 화이트리스트만 가능 — 서브넷 단위 명시적 deny가 가능한 NACL을 사용  
B) 보안 그룹이 stateless여서  
C) NACL은 인스턴스 단위라 부적합하므로 보안 그룹 유지  
D) 라우팅 테이블에서 IP를 차단  

**정답: A**

---

**문제 5.** 다음 워크로드 유형과 권장 자격증명 메커니즘의 연결 중 잘못된 것은?

A) EC2 애플리케이션 → 인스턴스 프로파일(IAM 역할)  
B) EKS 파드 → IRSA / Pod Identity(서비스 계정 ↔ IAM 역할)  
C) 모바일 앱 최종 사용자 → IAM 사용자 액세스 키를 앱에 내장  
D) 온프레미스 서버 → IAM Roles Anywhere(X.509 인증서)  

**정답: C**

---

**문제 6.** NACL을 새로 구성해 인바운드 HTTPS(443)를 허용했는데, 응답 트래픽이 클라이언트에 도달하지 못한다. 가장 가능성 높은 원인은?

A) 보안 그룹이 잘못됐다  
B) NACL은 stateless이므로 아웃바운드 임시 포트(1024-65535) 허용 규칙을 별도로 추가해야 한다  
C) 라우팅 테이블에 인터넷 게이트웨이가 없다  
D) DNS 해석이 실패했다  

**정답: B**

---
