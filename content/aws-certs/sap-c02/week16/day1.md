# Day 76 - 도메인 1 종합: 복잡한 조직 설계 (29%) — 멀티 계정 거버넌스의 역사, 라우팅 이론, 하이브리드 암호화, 격리 경계의 CS 원리

SAP-C02 도메인 1 "Design Solutions for Organizational Complexity"는 비중 29%로 첫 도메인이자 가장 큰 비중을 차지한다(2023년 개정 시 26%→29%로 상향). Pro 시험의 본질은 "Account 1개 + VPC 1개 + Region 1개"의 SAA 수준을 벗어나, **수십~수백 계정 + 수십 VPC + 멀티 리전 + 온프레미스 연동**이라는 실제 엔터프라이즈 환경을 가정한 시나리오를 풀어내는 능력이다.

오늘은 도메인 1 전체를 4개 영역(거버넌스·네트워크·통합 보안·하이브리드)으로 정리하되, 각 도구의 **역사적 배경·내부 동작·CS 이론·실제 사고 사례**를 깊이 분해한다. 단순 키워드 매핑을 넘어 "왜 이 구조가 됐는가"를 이해하면 변형 시나리오도 풀린다.

## 영역 1: 거버넌스 — 계정은 가장 강한 격리 경계

### 멀티 계정의 역사와 원리

초기 AWS 사용자는 모든 것을 단일 계정에 담았다. 조직이 커지면 이 구조가 무너진다 — 폭발 반경(blast radius)을 격리 못 하고, 팀별 비용 분리가 어렵고, IAM 권한이 수백 개로 불어나며, 한 번의 침해가 전체를 노출한다. AWS는 2017년 **Organizations**, 2018년 **Control Tower**와 SCP로 답했다.

```
Org Root
  ├── Security OU (Log Archive · Audit 계정)
  ├── Production OU (Account A · B)
  ├── Development OU (Account C)
  └── Sandbox OU (Account D)
```

> 💡 **관련 이론**: 멀티 계정은 정보보안의 고전 원칙인 **최소 권한(Least Privilege)**과 **권한 분리(Separation of Duties)**를 인프라 계층에 물리화한 것이다. **NIST SP 800-53**의 AC-5(직무 분리)·AC-6(최소 권한) 통제가 요구하는 바를 "계정 = 신뢰 경계"로 구현한다. 계정 경계는 AWS가 제공하는 **가장 강력한 격리 경계**다 — IAM 권한이 잘못 설정돼도 다른 계정 리소스엔 닿지 못한다. Security·Logging 계정을 워크로드와 분리하는 이유가 이것 — 운영자가 자기 행위의 감사 로그를 못 지우게 해야 감사 무결성이 성립한다(SOX의 "기록은 생성자가 변경 불가"의 직접 구현).

> 🔍 **더 깊이**: SCP는 **권한을 부여하지 않는다 — 오직 상한선(permission ceiling)만 정한다.** SCP에서 `Allow`를 써도 사용자에게 권한이 생기지 않는다. 최종 유효 권한 = (IAM이 허용) ∩ (SCP가 허용)이다. 기본 정책 `FullAWSAccess`(모든 액션 Allow) 위에 `Deny` 정책을 추가해 특정 액션·리전·서비스를 막는 게 권장 패턴이다. 핵심: SCP는 **root 사용자에게도 적용**된다(관리 계정 자체만 예외) — `aws:RequestedRegion` 조건의 DenyRegions를 걸면 그 계정의 root조차 비EU 리전에 리소스를 못 만든다. "root도 막아야"가 보이면 IAM이 아니라 SCP다.

> ⚠️ **함정**: SCP는 **관리 계정(management account)에는 적용되지 않는다** — 그래서 모범 사례는 관리 계정에서 워크로드를 절대 운영하지 않고 Organizations 관리에만 쓰는 것이다. 또 SCP는 IAM 주체(principal)의 행위만 제한하지, 리소스 기반 정책으로 들어오는 크로스 계정 접근을 다 막지는 못하며, 서비스 연결 역할엔 예외가 있다. "SCP로 모든 것을 막을 수 있다"고 외우면 함정이다.

### Control Tower · IAM Identity Center

- **Control Tower**: Organizations + IAM Identity Center + Config + CloudTrail + Backup을 버튼 하나로 표준 Landing Zone 구축. **Account Factory**가 표준 베이스라인(VPC·IAM·CloudTrail) 계정을 찍어내고, **Guardrail**(Preventive=SCP, Detective=Config)을 강제한다. AFT(Account Factory for Terraform)로 IaC 자동화.
- **IAM Identity Center**(구 SSO): 외부 IdP(Okta·Azure AD·Ping) SAML 통합 + Permission Set으로 계정·OU별 권한 부여. IAM User를 안 만들고 SSO 사용자가 임시 자격증명으로 접근. **ABAC**(태그 기반 권한)도 지원.

> 📚 **사례**: 2019년 **Capital One 데이터 유출**(약 1억 600만 명)은 잘못 설정된 WAF + 과도한 권한의 IAM 역할이 결합해 발생했다 — 침입자가 SSRF로 EC2 인스턴스 메타데이터(IMDSv1)에서 자격증명을 탈취해 S3를 읽었다. 교훈은 **계정·권한 격리와 IMDSv2의 중요성**이다. 이후 AWS는 IMDSv2(토큰 기반)를 기본화하고, SCP로 IMDSv1 차단·Permission Boundary로 횡적 이동 제한이 모범 사례가 됐다. "탈취된 자격증명의 횡적 이동 차단"은 계정 격리 + Permission Boundary + SCP를 떠올린다.

> 🎯 **시나리오**: "한 회사가 Okta로 SSO하면서 AWS 권한을 부서별로 다르게 주고, IAM User는 금지하려 한다." → **IAM Identity Center + Okta SAML + Permission Set per OU/Account**. IAM User는 장기 자격증명 관리 부담 때문에 금지, Cognito는 애플리케이션 최종 사용자용이라 컨텍스트가 다르다. "직원 SSO + 부서별 AWS 권한"은 IAM Identity Center가 직답이다.

## 영역 2: 네트워크 — 라우팅 이론과 멀티 VPC

### VPC 연결 매트릭스

| 방식 | 적합 규모 | 전이 | 사용처 |
|------|-----------|------|--------|
| VPC Peering | 1:1·소수 | ✗(비전이) | 단순 연결, ~10 VPC |
| Transit Gateway | 수십~수천 | ✓ | Hub-Spoke |
| PrivateLink | 서비스 공유 | N/A | SaaS→고객 VPC |
| VPN(Site-to-Site) | 온프레→AWS | ✓(TGW 결합) | DX 백업·단독 |
| Direct Connect | 온프레→AWS 전용선 | ✓(DX Gateway) | 대역폭·안정성 |

> 💡 **관련 이론**: TGW가 Peering Mesh를 대체한 이유는 **그래프 복잡도** 때문이다. N개 VPC를 메시 Peering하면 N×(N−1)/2 개의 연결이 필요하다 — 200개 VPC면 19,900개로 관리 불가능하고, Peering은 **비전이적(non-transitive)**이라 A-B, B-C가 있어도 A-C는 안 된다(전이 라우팅 금지). TGW는 중앙 허브로 O(N) 복잡도로 단순화하고 전이 라우팅을 제공한다(최대 5000 VPC). 핵심: TGW는 **여러 라우트 테이블**을 지원해 어태치먼트별로 통신 범위를 격리할 수 있다 — 단일 라우트 테이블로는 모든 어태치먼트가 서로 보여 격리가 안 된다.

> 🔍 **더 깊이**: DX 이중화의 라우팅은 **BGP(Border Gateway Protocol, RFC 4271)**가 결정한다. 평소엔 DX 경로의 AS-PATH가 짧아 우선되고, DX가 죽으면 BGP가 VPN 경로로 수렴(convergence)한다. 더 빠른 장애 감지엔 **BFD(Bidirectional Forwarding Detection, RFC 5880)**를 켜면 기본 BGP 홀드타임(수십 초) 대신 1초 이내에 링크 단절을 감지해 페일오버를 가속한다. AWS DX는 BFD를 권장한다. 멀티 리전은 **DX Gateway**로 여러 리전 VPC/TGW를 하나의 DX에 연결하고, **TGW Peering**으로 리전 간 TGW를 잇는다. "DX 장애 시 1초 내 VPN 전환"은 BGP + BFD다.

> 🔍 **더 깊이**: **PrivateLink vs VPC Peering**의 본질 차이는 권한 모델이다. Peering은 양 VPC 전체 라우팅을 통합(L3)하고 양방향이며 IP 충돌 시 불가능하다. PrivateLink는 제공자 NLB → Endpoint Service → 소비자 Endpoint로 **특정 서비스만 단방향(소비자→제공자)** 노출하고(L7 단일 진입점), **IP 충돌과 무관**하다(겹쳐도 가능). 그래서 "SaaS 제공자가 다수 고객 VPC에 자사 서비스 노출 + IP 충돌 무관"은 항상 PrivateLink다.

> 🎯 **시나리오**: "글로벌 제조사가 미주·EU·APAC 3개 리전의 다수 VPC를 TGW로 연결하되, EU VPC와 미주 VPC 간 직접 통신은 차단해야 한다." → **리전별 TGW + TGW Peering + 다중 라우트 테이블 분리**. 각 리전 TGW를 DX Gateway로 온프레에 연결하고, TGW의 **여러 라우트 테이블**로 어태치먼트별 경로를 세분 제어한다(EU 라우트 테이블에서 미주 어태치먼트 경로를 빼면 격리). 단일 라우트 테이블로는 격리가 안 된다. "TGW 연결 + 일부 VPC 격리"는 다중 라우트 테이블.

### Direct Connect 세부

- **Dedicated**: 1G·10G·100G 단일 고객 전용. **Hosted**: 50Mbps~10G 파트너 회선 분할.
- **MACsec**: L2 암호화(Dedicated만). **SiteLink**: DX 거점 간을 AWS 백본으로 연결(글로벌 WAN처럼).

> 💡 **관련 이론**: DX의 기본은 **평문**이다 — 전용선이지만 암호화하지 않는다. 그래서 AWS는 **DX + IPsec VPN over DX**(암호화 + 안정성)를 권장하거나, 2021년 추가된 **MACsec(IEEE 802.1AE)**으로 L2 암호화한다(Dedicated 회선만 지원). "DX인데 암호화 요구"가 보이면 IPsec VPN over DX 또는 MACsec이 정답 신호다. DX 자체가 사설이라 암호화가 기본 제공된다고 착각하면 함정이다.

## 영역 3: 멀티 계정 통합 보안

| 서비스 | Org 통합 모델 | 용도 |
|--------|--------------|------|
| Security Hub | 위임 관리자 | Finding 통합 + CIS/PCI 표준 점검 |
| GuardDuty | 위임 관리자 | 위협 탐지(VPC Flow·DNS·CloudTrail 분석) |
| Macie | 위임 관리자 | S3 PII 탐지 |
| Inspector | 위임 관리자 | 취약점 스캔(EC2·ECR·Lambda) |
| Firewall Manager | 위임 관리자 | WAF·SG·Network Firewall·DNS Firewall 정책 일괄 |
| Config Aggregator | 집계 | 전 계정·리전 구성 단일 뷰 + Conformance Pack |

> 🔍 **더 깊이**: 멀티 계정 보안의 패턴은 **"보안 전담 계정을 위임 관리자(delegated administrator)로 지정"**이다 — 관리 계정에 보안 운영을 두지 않고(관리 계정 침해 시 전체 노출 위험), 별도 Security 계정에 GuardDuty·Security Hub·Macie의 위임 관리자 권한을 줘 전 계정 Finding을 통합한다. **신규 계정 자동 가입** 옵션으로 Account Factory가 만든 새 계정도 자동으로 보안 베이스라인에 편입된다. "Org 전체 보안 통합 대시보드 + 신규 계정 자동"은 위임 관리자 모델 + 자동 가입이다.

> 📚 **사례**: 2021년 **US-EAST-1 대장애**에서 IAM·일부 글로벌 서비스가 us-east-1에 의존하던 탓에 다른 리전 사용자까지 영향받았다. 멀티 계정·멀티 리전 설계의 교훈은 (1) **us-east-1 단일 의존을 줄이고**(STS 리전 엔드포인트 사용), (2) **로깅·보안 계정도 리전 복원력을 갖추며**, (3) **CloudTrail Org Trail은 모든 리전을 포괄**해야 한다는 것이다.

## 영역 4: 하이브리드 — 온프레미스 통합

| 서비스 | 동작 | 사용처 |
|--------|------|--------|
| Outposts | AWS 하드웨어를 고객 DC에 설치, 동일 EC2/EBS/S3/RDS API | 데이터 잔존·저지연(공장·병원) |
| Local Zones | 대도시 근처 소형 DC, 메인 리전 연결 | 저지연 도시 워크로드 |
| Wavelength | 5G 통신사 엣지 | 모바일 ms 지연 |
| Storage Gateway | File(NFS/SMB→S3)·Volume(iSCSI→EBS)·Tape(VTL→Glacier) | 온프레↔클라우드 스토리지 |
| DataSync | 온라인 동기화(NFS/SMB/HDFS→S3/EFS) | 회선 충분 |
| Snow Family | Snowcone 8TB·Snowball Edge 80TB·Snowmobile 100PB | 회선 부족·대량 운송 |

> 🎯 **시나리오**: "데이터 잔존 규제로 데이터를 데이터센터 외부로 반출할 수 없는데, AWS와 동일한 API로 EC2·S3를 운영하고 싶다." → **AWS Outposts**. Outposts는 AWS 하드웨어 랙을 고객 DC에 두고 동일 API를 제공해 데이터가 물리적으로 시설을 떠나지 않는다. Local Zones는 AWS 소유 시설이라 데이터가 외부로 나간다(반출됨). "데이터 잔존 + 동일 AWS API + 온프레 위치"는 Outposts다.

> ⚠️ **함정**: Snow vs DataSync는 **대역폭 수학**으로 갈린다. 50TB ÷ 100Mbps ≈ 50일(불가) → Snowball Edge. DataSync는 회선이 충분할 때만 정답이다. "수십 TB + 느린 회선 + 짧은 데드라인"을 DataSync로 답하면 함정 — 물리 운송(Snow)이 답이다.

## 시나리오 키워드 → 정답 매핑

| 키워드 | 정답 |
|--------|------|
| "비인가 리전 차단·root도" | SCP Deny `aws:RequestedRegion` |
| "신규 계정 자동 베이스라인·가드레일" | Control Tower + Account Factory |
| "100+ VPC + 온프레·멀티 리전" | TGW + DX Gateway |
| "10개 미만 VPC 단순 연결" | VPC Peering |
| "SaaS→고객 VPC·IP 충돌 무관" | PrivateLink(NLB Endpoint Service) |
| "DX 장애 1초 내 VPN 전환" | BGP + BFD |
| "DX인데 암호화 필요" | IPsec VPN over DX 또는 MACsec |
| "Okta SSO + 부서별 AWS 권한" | IAM Identity Center + SAML |
| "Org 단위 WAF·SG 정책" | Firewall Manager |
| "Org 보안 통합 대시보드·신규 자동" | Security Hub 위임 관리자 + 자동 가입 |
| "TGW 연결 + 일부 VPC 격리" | TGW 다중 라우트 테이블 |
| "데이터 잔존 + 동일 API 온프레" | Outposts |
| "5G 모바일 ms 지연" | Wavelength |
| "온프레 NFS→S3 자동 동기화" | DataSync 또는 File Gateway |
| "50TB 1주일 + 느린 회선" | Snowball Edge |

## 정리하며

도메인 1은 **엔터프라이즈 멀티 계정 + 멀티 VPC + 하이브리드의 통합 거버넌스**를 묻는다. 핵심 통찰: (1) 계정은 가장 강한 격리 경계(NIST 직무 분리의 물리화), SCP는 권한을 주지 않고 천장만 씌우며 root도 막는다, (2) 네트워크는 그래프 복잡도 — Peering은 N² 비전이, TGW는 O(N) 전이 + 다중 라우트 테이블 격리, DX 페일오버는 BGP+BFD, (3) 통합 보안은 위임 관리자 + 신규 계정 자동 가입, (4) 하이브리드는 데이터 잔존이면 Outposts, 대역폭 수학으로 Snow vs DataSync. 시나리오 키워드 → 직답 매핑을 머리에 박는 것이 가장 빠른 대비다.

내일(Day 77)은 도메인 2 신규 솔루션 설계를 CAP/PACELC와 이벤트 아키텍처 내부 동작으로 깊이 정리한다.

---

## 📝 연습 문제

**문제 1.** 한 글로벌 기업이 자회사 계정에서 비인가 리전(예: us-east-1) 사용을 차단하려 한다. 계정의 root 사용자조차 그 리전에 리소스를 만들 수 없어야 한다. 가장 적합한 통제는?

A) 각 IAM 사용자에 리전 제한 IAM Policy

B) SCP에 `aws:RequestedRegion` 조건의 Deny

C) Config Rule로 비인가 리전 리소스 탐지

D) VPC NACL로 비인가 트래픽 차단

**정답: B**

해설: SCP는 IAM 권한 위에 씌우는 권한 상한선으로, 해당 계정의 **root 사용자조차** 넘지 못하게 한다(관리 계정 자체만 예외). `aws:RequestedRegion` 조건으로 비인가 리전 API를 Deny하면 누구도 그 리전에 리소스를 못 만든다. A(IAM Policy)는 root에 적용되지 않아 우회 가능하다. C(Config)는 사후 탐지만 한다(예방 X). D(NACL)는 네트워크 트래픽 계층이라 리소스 생성을 못 막는다. 함정: "root도 막아야"는 IAM이 아니라 SCP.

---

**문제 2.** 신규 계정 생성 시 자동으로 표준 보안·로깅 베이스라인을 적용하고 지정 OU에 배치하며, 예방·탐지 가드레일을 강제하려 한다. 가장 적합한 도구는?

A) Organizations 단독

B) Control Tower + Account Factory

C) CloudFormation StackSets만

D) IAM Identity Center

**정답: B**

해설: Control Tower의 Account Factory는 새 계정 생성 시 표준 VPC·IAM·CloudTrail·Config를 자동 적용하고 지정 OU에 배치하며, Guardrail(Preventive=SCP, Detective=Config)을 강제한다. A(Organizations 단독)는 계정 그룹화는 되지만 자동 베이스라인·가드레일이 없다. C(StackSets)는 리소스 배포는 되지만 계정 팩토리·가드레일 오케스트레이션이 아니다. D는 SSO·권한 도구다. 함정: "신규 계정 자동 베이스라인 + 가드레일"은 Control Tower + Account Factory.

---

**문제 3.** 200개 VPC를 여러 리전에 두고 온프레 데이터센터 2곳과 모두 연결하되, 일부 VPC 그룹 간 직접 통신은 차단해야 한다. 가장 적합한 설계는?

A) VPC Peering을 전부 메시로 구성

B) 리전별 Transit Gateway + DX Gateway + 다중 라우트 테이블

C) 모든 VPC를 단일 TGW 라우트 테이블에 연결

D) 각 VPC에 NACL로 상대 CIDR 차단

**정답: B**

해설: 200개 VPC를 메시 Peering하면 N×(N−1)/2 = 19,900개 연결로 관리 불가능하고 Peering은 비전이적이다. **리전별 TGW**(전이 라우팅, O(N))로 허브-스포크를 만들고 **DX Gateway**로 온프레를, TGW Peering으로 리전 간을 잇는다. 일부 그룹 격리는 **다중 라우트 테이블**로 어태치먼트별 경로를 분리한다. A는 N² 폭발이다. C(단일 라우트 테이블)는 모든 어태치먼트가 서로 보여 격리가 안 된다. D(NACL)는 운영 부담이 크고 일관 적용이 어렵다. 함정: "대규모 VPC + 일부 격리"는 TGW + 다중 라우트 테이블.

---

**문제 4.** SaaS 제공자가 자사 서비스를 다수 고객 VPC에 노출하려 한다. 고객마다 IP 대역이 겹칠 수 있고, 고객 VPC에서 제공자 방향으로만 단방향 접근이어야 한다. 가장 적합한 방식은?

A) VPC Peering

B) PrivateLink(NLB + Endpoint Service)

C) Site-to-Site VPN

D) Public ALB

**정답: B**

해설: PrivateLink는 제공자 NLB → Endpoint Service → 소비자 Endpoint로 **특정 서비스만 단방향(소비자→제공자)** 노출하고 **IP 충돌과 무관**하다(L7 단일 진입점, 라우팅 통합 없음). SaaS가 다수 고객 VPC에 자사 API를 노출하는 표준이다. A(Peering)는 IP 충돌 시 불가능하고 양방향 L3 통합이다. C(VPN)는 네트워크 통합이라 IP 충돌·관리 부담이 있다. D(Public ALB)는 인터넷 노출이라 사설 요구에 반한다. 함정: "SaaS→다수 고객 VPC + IP 충돌 무관"은 PrivateLink.

---

**문제 5.** 온프레와 AWS를 Direct Connect로 연결했는데, 규제상 전송 구간이 암호화되어야 한다. 가장 적합한 구성은?

A) DX는 사설이므로 그대로 사용(암호화 불필요)

B) DX 위에 IPsec VPN(VPN over DX) 또는 MACsec 적용

C) S3 SSE만 활성화

D) TLS만 애플리케이션에서 사용

**정답: B**

해설: DX는 전용선이지만 **기본 평문**이라 전송 구간 암호화가 별도 필요하다. **IPsec VPN over DX**(범용, 모든 DX) 또는 **MACsec**(L2 암호화, Dedicated 회선만)으로 구간을 암호화한다. A는 "DX는 사설이라 안전"이라는 흔한 오해 함정이다. C(S3 SSE)는 저장 데이터 암호화이지 전송 구간이 아니다. D(앱 TLS)는 특정 트래픽만 보호해 "구간 전체 암호화" 요구에 미달할 수 있다. 함정: "DX인데 암호화"는 IPsec VPN over DX 또는 MACsec.

---

**문제 6.** 한 회사가 Okta로 직원 SSO를 하면서 AWS 권한을 부서별로 다르게 부여하려 한다. IAM User는 자격증명 관리 부담으로 금지한다. 가장 적합한 구성은?

A) IAM User + Access Key

B) IAM Identity Center + Okta SAML + Permission Set

C) Amazon Cognito User Pool

D) 계정별 Direct Federation 수동 구성

**정답: B**

해설: IAM Identity Center는 외부 IdP(Okta) SAML 통합 + Permission Set으로 계정·OU별 권한을 부여하고, 사용자는 임시 자격증명으로 접근해 IAM User가 필요 없다. A(IAM User)는 장기 자격증명 관리 부담으로 금지 대상이다. C(Cognito)는 애플리케이션 최종 사용자용이라 직원 SSO 컨텍스트가 아니다. D(계정별 수동 Federation)는 운영 부담이 크고 중앙 관리가 안 된다. 함정: "직원 SSO + 부서별 AWS 권한 + IAM User 금지"는 IAM Identity Center.

---

**문제 7.** 데이터 잔존 규제로 데이터를 데이터센터 외부로 반출할 수 없으면서, AWS와 동일한 EC2·S3 API로 저지연 처리를 하려 한다. 가장 적합한 서비스는?

A) Storage Gateway

B) AWS Outposts

C) Local Zones

D) Direct Connect

**정답: B**

해설: Outposts는 AWS 하드웨어 랙을 고객 데이터센터에 설치해 동일한 EC2/EBS/S3/RDS API를 제공하므로, 데이터가 물리적으로 시설을 떠나지 않아 데이터 잔존 규제를 충족하면서 저지연을 얻는다. A(Storage Gateway)는 스토리지 캐시·게이트웨이지 컴퓨트 API가 아니다. C(Local Zones)는 AWS 소유 외부 시설이라 데이터가 반출된다. D(DX)는 연결 회선일 뿐이다. 함정: "데이터 잔존 + 동일 API + 온프레 위치"는 Outposts.

---

**문제 8.** 온프레미스 50TB 데이터를 1주일 내 S3로 옮겨야 한다. 인터넷 회선은 100Mbps다. 가장 적합한 방법은?

A) DataSync로 온라인 전송

B) Snowball Edge로 물리 운송

C) S3 Multipart Upload 병렬화

D) Direct Connect 신청 후 전송

**정답: B**

해설: 대역폭 수학상 50TB ÷ 100Mbps ≈ 50일이라 회선 전송은 1주일 내 불가능하다. **Snowball Edge(80TB)**로 물리 운송하면 1주일 내 가능하다. A·C는 회선에 의존하므로 100Mbps로는 불가능하다. D(DX)도 회선 증설일 뿐이고 프로비저닝에 수 주가 걸린다. 함정: "수십 TB + 느린 회선 + 짧은 데드라인"은 회선이 아니라 Snow 물리 운송.

---
