# Day 76 - 도메인 1 종합: 복잡한 조직 설계 (26%)

SAP-C02 시험 도메인 1 "Design for New Solutions"는 비중 29%로 첫 도메인이고, 이 중 **복잡한 조직(멀티 계정·하이브리드·글로벌)**의 비중이 가장 크다. Pro 시험의 본질은 "Account 한 개 + VPC 한 개 + Region 한 개"의 SAA 수준을 벗어나, **수십~수백 계정 + 수십 VPC + 멀티 리전 + 온프레미스 연동**이라는 실제 엔터프라이즈 환경을 가정한 시나리오를 풀어내는 능력이다.

오늘은 도메인 1 전체를 4개 영역(거버넌스·네트워크·통합 보안·하이브리드)으로 정리하고 시나리오 패턴 매핑을 끝낸다.

## 영역 1: 거버넌스 — Organizations · Control Tower · IAM Identity Center

### AWS Organizations 계층 구조

```
Org Root
  ├── OU (Organizational Unit) — Production
  │     ├── Account A
  │     └── Account B
  ├── OU — Development
  │     └── Account C
  └── OU — Sandbox
        └── Account D
```

### SCP (Service Control Policy)

SCP는 OU 또는 계정에 적용되는 **권한 가드레일**이다. IAM Policy처럼 보이지만 본질적으로 다르다:

- **Allow vs Deny**: Deny가 강함. SCP에서 Deny된 액션은 IAM이 Allow해도 불가
- **Root user에게도 적용**: 계정 root user조차 SCP의 제약을 받음
- **상속**: 상위 OU의 SCP가 하위 OU·계정에 모두 상속

> 🔍 **더 깊이**: SCP의 기본 정책은 `FullAWSAccess`(모든 액션 Allow). 이를 비활성화하면 모든 액션이 Deny된다. 일반적으로 `Deny` 정책을 추가해 특정 액션·리전·서비스를 차단하는 패턴이 권장된다. 예: `aws:RequestedRegion`이 ap-northeast-2가 아니면 Deny.

> 💡 **관련 이론**: SCP는 **PoLP(Principle of Least Privilege)**의 거버넌스 버전이다. 개별 IAM Policy로는 수백 계정을 일관되게 통제하기 어렵지만, SCP는 Org root에 한 번 정의하면 전체에 자동 적용. 단 SCP는 권한을 "주는" 도구가 아니라 "한계를 정하는" 도구. 실제 권한은 IAM이 부여.

### Control Tower: 관리형 Landing Zone

- Organizations + IAM Identity Center + Config + CloudTrail + AWS Backup을 한 번에 설정
- **Account Factory**: 표준 베이스라인(VPC·IAM·CloudTrail)이 적용된 새 계정 자동 생성
- **Guardrail**: Preventive(SCP) + Detective(Config Rule) 룰 세트
- **AFT (Account Factory for Terraform)**: Terraform 기반 계정 자동화

### IAM Identity Center (SSO 후속)

- SSO + Permission Set + 외부 IdP(Okta·Azure AD·Ping) 통합
- **ABAC(Attribute-Based Access Control)**: 사용자·리소스의 태그로 권한 부여
- IAM User를 만들지 않고 SSO 사용자가 임시 자격증명으로 접근

> 🎯 **시나리오**: "한 회사가 Okta로 SSO하면서 AWS 권한을 부서별로 다르게 부여". → **IAM Identity Center + Okta SAML + Permission Set per OU/Account**. IAM User는 사용 금지(자격증명 관리 부담), Cognito는 애플리케이션 사용자용으로 다른 컨텍스트.

## 영역 2: 네트워크 — 멀티 VPC · 하이브리드

### VPC 연결 방식 매트릭스

| 방식 | 적합 규모 | 전이 가능 | 사용처 |
|------|-----------|----------|--------|
| VPC Peering | 1:1, 1:N (적은 수) | ✗ | 단순 연결, ~10 VPC |
| Transit Gateway | 수십~수천 VPC | ✓ | Hub-Spoke |
| PrivateLink | 서비스 공유 | N/A | SaaS 제공자 → 고객 VPC |
| VPN (Site-to-Site) | 온프레 → AWS | ✓ (TGW 결합 시) | DX 백업 또는 단독 |
| Direct Connect | 온프레 → AWS 전용선 | ✓ (DX Gateway) | 대역폭·안정성 |

### Transit Gateway: Hub-Spoke의 정공

- 최대 5000개 VPC + 온프레 연결
- Route Table 분리로 격리 가능(production OU만 보는 VPC, 개발 OU만 보는 VPC)
- TGW는 리전별, **TGW Peering**으로 멀티 리전 연결

> 📚 **사례**: 한 대기업이 200개 VPC를 mesh peering으로 연결하려다 관리 한계(N×(N-1)/2 = 19,900개 peering)에 봉착. TGW로 전환 후 단일 hub로 통합 → 라우팅 룰도 중앙 관리. 비용은 TGW Attachment·Data Processing이지만 운영 부담 절감이 압도적.

### PrivateLink: 서비스 공유의 표준

- 제공자 NLB → VPC Endpoint Service → 소비자 VPC Endpoint
- 사설 IP로 다른 VPC·다른 계정 서비스 접근, IP 충돌 무관(겹쳐도 가능)
- SaaS 제공자가 고객 VPC에 자사 서비스 노출하는 표준

> 🔍 **더 깊이**: PrivateLink와 VPC Peering의 차이는 **권한 모델**이다. Peering은 양 VPC 전체 라우팅 통합(L3 통합), PrivateLink는 특정 서비스 endpoint만 노출(L7 단일 진입점). Peering은 보안 그룹·NACL로 통제하지만 양방향 인터페이스, PrivateLink는 단방향(소비자→제공자). 또한 Peering은 IP 충돌 시 불가능하지만 PrivateLink는 IP 충돌과 무관.

### Direct Connect

- **Dedicated**: 1G·10G·100G 단일 고객 전용 회선
- **Hosted**: 50Mbps~10G, 파트너 회선 일부 빌림
- **DX Gateway**: 단일 DX로 여러 리전 VPC 연결
- **MACsec**: L2 암호화 (DX 단독은 비암호 평문)
- **SiteLink**: DX 거점 간 연결 (AWS backbone을 글로벌 WAN처럼 사용)

> 💡 **관련 이론**: DX의 기본은 평문이다. AWS는 그 이유로 "private connection이지만 IPsec VPN over DX"를 권장한다. MACsec(2021)은 L2 암호화를 추가했지만 Dedicated 회선만 지원. 일반적으로 **DX + IPsec VPN**을 결합해 암호화 + 안정성을 동시 확보.

## 영역 3: 멀티 계정 통합 보안

### Security Hub Org 위임 관리자

- 보안 담당 계정(예: SecurityAccount)을 위임 관리자로 지정
- 모든 멤버 계정의 Finding을 자동 통합
- 표준(CIS, PCI, AWS Foundational)을 Org 전체에 일괄 적용

### GuardDuty · Macie · Inspector Org 통합

- 각각 위임 관리자 모델 지원
- 신규 계정 자동 가입 옵션

### Firewall Manager

- WAF · Shield · Security Group · Network Firewall · Route 53 DNS Firewall 정책을 Org 전체 배포
- 신규 계정 자동 적용
- 정책 위반 자동 시정

### Config Aggregator + Conformance Pack

- Aggregator: 모든 계정·리전 Config 데이터 단일 뷰
- Conformance Pack: 표준 룰 묶음(CIS Benchmark, PCI DSS, HIPAA 등) Org 전체 배포

## 영역 4: 하이브리드 — 온프레미스 통합

### AWS Outposts

- AWS 하드웨어(랙·서버)를 고객 데이터센터에 설치
- EC2·EBS·S3·RDS·EKS 등을 온프레에서 동일 API로 운영
- 데이터 잔존(data residency) 규제 대응, 저지연 처리(공장·병원)

### Local Zones · Wavelength

- **Local Zones**: 대도시 근처 작은 데이터센터(LA, 보스턴 등), 메인 리전과 연결
- **Wavelength**: 5G 통신사 엣지(Verizon, KDDI), 모바일 사용자 ms 단위 지연

### Storage Gateway 3종

| 종류 | 동작 |
|------|------|
| File Gateway | NFS/SMB → S3 |
| Volume Gateway | iSCSI 블록 → EBS Snapshot |
| Tape Gateway | iSCSI VTL → S3 Glacier |

### DataSync · Snow Family

| 도구 | 용도 |
|------|------|
| DataSync | 온라인 동기화(NFS/SMB/HDFS → S3/EFS) |
| Snowcone | 8TB 휴대형 |
| Snowball Edge | 80TB, 컴퓨팅도 포함 |
| Snowmobile | 100PB 트럭 |

> 🎯 **시나리오**: "온프레 50TB 데이터를 1주일 내 S3로 옮김 + 네트워크 회선 100Mbps". → **DataSync 또는 Snowball Edge**. 50TB at 100Mbps = 약 50일(불가). Snowball Edge가 정답. DataSync는 회선이 충분할 때.

## 시나리오 키워드 → 정답 매핑 표

| 키워드 | 정답 |
|--------|------|
| "비인가 리전 차단" | SCP Deny with `aws:RequestedRegion` |
| "신규 계정 자동 베이스라인" | Control Tower + Account Factory |
| "100+ VPC + 온프레" | TGW + DX Gateway |
| "10개 미만 VPC 단순 연결" | VPC Peering |
| "SaaS 회사 → 고객 VPC 서비스" | PrivateLink (NLB Endpoint Service) |
| "온프레 → AWS 전용선 + 멀티 리전" | DX + DX Gateway |
| "Okta SSO + AWS 권한" | IAM Identity Center + SAML |
| "Org 단위 WAF·SG 정책" | Firewall Manager |
| "Org 단위 백업 정책" | AWS Backup Org Policy |
| "Org 보안 통합 대시보드" | Security Hub 위임 관리자 |
| "데이터 잔존 + 저지연 온프레" | Outposts |
| "5G 모바일 ms 지연" | Wavelength |
| "온프레 NFS → S3 자동 동기화" | DataSync 또는 File Gateway |
| "50TB 데이터 1주일 이전" | Snowball Edge |

## 정리하며

도메인 1은 본질적으로 **"엔터프라이즈 멀티 계정 + 멀티 VPC + 하이브리드 환경의 통합 거버넌스"**를 묻는다. 도구는 4영역으로 분류: (1) 거버넌스(Org·CT·SCP·IAM IC), (2) 네트워크(TGW·DX·PrivateLink·VPN), (3) 통합 보안(Security Hub·FMS·Config Aggregator), (4) 하이브리드(Outposts·Storage Gateway·DataSync·Snow). 시나리오 키워드 → 직답 매핑을 머리에 박는 것이 시험 대비의 가장 빠른 길.

내일(Day 77)은 **도메인 2: 기존 솔루션의 새 솔루션 통합** 종합 정리.

---

## 📝 연습 문제

**문제 1.** 자회사 계정에서도 비인가 리전(예: us-east-1) 사용을 차단.

A) IAM Policy
B) SCP Deny with `aws:RequestedRegion`
C) Config Rule
D) NACL

**정답: B**
해설: SCP는 root user에게도 적용되는 거버넌스 가드레일. `aws:RequestedRegion` 컨디션으로 비허용 리전 모든 액션 차단. IAM은 사용자 단위, Config는 사후 탐지.

---

**문제 2.** 신규 계정 자동 보안·로깅 베이스라인 + 표준 OU 배치.

A) Organizations만
B) Control Tower + Account Factory
C) CFN StackSets만
D) IAM Identity Center

**정답: B**
해설: Control Tower의 Account Factory는 새 계정 생성 시 자동으로 표준 VPC·IAM·CloudTrail·Config 설정 + 지정 OU 배치. Organizations 단독은 자동화 없음.

---

**문제 3.** 100여 VPC + 온프레 데이터센터를 통합 연결.

A) Peering Mesh
B) Transit Gateway + DX Gateway
C) VPN Mesh
D) PrivateLink

**정답: B**
해설: TGW로 hub-spoke + DX Gateway로 온프레 연결. Peering Mesh는 100개 VPC = 4950개 peering으로 관리 불가능.

---

**문제 4.** SaaS 회사가 외부 고객 VPC에 자사 서비스 노출 + IP 충돌 무관.

A) VPC Peering
B) PrivateLink (NLB + Endpoint Service)
C) Site-to-Site VPN
D) Public ALB

**정답: B**
해설: PrivateLink는 IP 충돌과 무관(단일 endpoint 진입), L7 단일 서비스 노출, 양방향 라우팅 없음. SaaS 제공자가 고객 VPC에 자사 API 노출하는 표준.

---

**문제 5.** Okta로 SSO + AWS Permission Set로 부서별 권한.

A) IAM User + Access Key
B) IAM Identity Center + Okta SAML
C) Amazon Cognito
D) Direct Federation per 계정

**정답: B**
해설: IAM Identity Center는 외부 IdP SAML 통합 + Permission Set으로 권한 부여 + 모든 계정에서 사용 가능. IAM User는 자격증명 관리 부담, Cognito는 애플리케이션 사용자용.

---

**문제 6.** Org 전체 계정의 신규 ALB에 자동 WAF 적용.

A) Config Rule + Lambda 자동 시정
B) Firewall Manager (Org)
C) 콘솔 수동
D) SCP Deny

**정답: B**
해설: Firewall Manager는 Org 단위 WAF·Shield·SG·Network Firewall 정책 자동 배포 + 신규 리소스도 자동 적용 + 정책 위반 자동 시정. Config + Lambda는 가능하지만 운영 부담 ↑.

---

**문제 7.** 온프레미스 50TB 데이터를 1주일 내 S3로 옮김, 회선은 100Mbps.

A) DataSync
B) Snowball Edge
C) Internet Upload
D) Direct Connect 신청 후 이전

**정답: B**
해설: 50TB at 100Mbps = 약 50일 → 불가. Snowball Edge로 물리 이전이 정답. DataSync는 회선이 충분할 때, DX는 신청에 수 주 소요.

---

**문제 8.** 데이터 잔존 규제로 데이터센터 외부 반출 불가 + 동일 AWS API 사용.

A) Storage Gateway
B) AWS Outposts
C) Local Zones
D) Direct Connect

**정답: B**
해설: Outposts는 AWS 하드웨어를 고객 데이터센터에 설치 + 동일 EC2/EBS/S3 API. Local Zones는 AWS 소유 작은 데이터센터(외부 반출됨).
