# Day 4 - 엣지 보안: WAF·Shield·Firewall Manager와 DDoS 방어의 계층

웹 애플리케이션을 인터넷에 노출하는 순간, 두 종류의 적이 동시에 찾아온다. 하나는 **양(volume)으로 밀어붙이는 DDoS** — 트래픽을 폭증시켜 서버를 마비시킨다. 다른 하나는 **꾀(payload)로 파고드는 애플리케이션 공격** — SQL 인젝션, XSS처럼 정교한 요청으로 데이터를 탈취한다. 이 둘은 방어하는 계층이 다르다. DDoS는 주로 L3/L4(네트워크·전송)에서, 인젝션은 L7(애플리케이션)에서 막는다. 그래서 AWS의 엣지 보안은 **Shield(DDoS)**와 **WAF(L7 필터링)**를 분리하고, 이를 멀티 계정에 일괄 적용하는 **Firewall Manager**, VPC 내부를 지키는 **Network Firewall**, 악성 도메인을 막는 **DNS Firewall**로 확장한다.

SAP-C02 시험에서 엣지 보안은 "이 위협을 어느 계층에서 막나", "Shield Standard로 충분한가 Advanced가 필요한가", "수백 계정에 WAF 정책을 어떻게 일괄 적용하나"라는 의사결정으로 나온다. OSI 7계층을 머릿속에 두고 "이 공격은 몇 계층인가"를 먼저 묻는 게 정답의 출발점이다. 오늘은 각 서비스의 동작 원리와 DDoS의 종류별 방어를 계층으로 정리한다.

## OSI 계층으로 보는 위협과 방어

DDoS는 공격 계층에 따라 세 종류로 나뉜다(이 분류가 방어 선택을 결정한다).

| DDoS 유형 | 계층 | 예시 | 주 방어 |
|-----------|------|------|---------|
| **Volumetric** | L3/L4 | UDP flood, ICMP flood, 증폭 공격 | Shield(자동 흡수) |
| **Protocol** | L3/L4 | SYN flood, Ping of Death | Shield(자동 완화) |
| **Application** | L7 | HTTP flood, Slowloris | Shield Advanced + WAF Rate-Based |

핵심 — **L3/L4 DDoS는 Shield가, L7 공격은 WAF가** 주력이다. Shield Standard는 L3/L4를 무료로 자동 완화하지만 L7은 못 막는다. L7 DDoS(정상처럼 보이는 HTTP 요청을 대량 발생)는 Shield Advanced의 L7 보호 + WAF의 Rate-Based 룰이 함께 막는다.

> 💡 **관련 이론**: OSI 7계층 모델(ISO/IEC 7498-1)이 보안 설계의 지도 역할을 한다. 공격과 방어는 계층마다 다르다 — L3(IP)는 NACL·라우팅, L4(TCP/UDP)는 Security Group·Shield, L7(HTTP)은 WAF. 이 계층 구분이 중요한 이유는 "낮은 계층에서 막을 수 있는 걸 높은 계층까지 올리지 말라"는 효율 원칙 때문이다. Volumetric DDoS를 L7(애플리케이션)까지 끌고 오면 이미 서버 자원을 소모한 뒤다. Shield는 이를 AWS 엣지(네트워크 경계)에서 흡수해 애플리케이션에 도달하기 전에 차단한다. 시험에서 "어느 서비스로 막나"의 첫 질문은 항상 "이 공격은 몇 계층인가"다.

## WAF — L7 웹 요청을 룰로 거른다

WAF(Web Application Firewall)는 **L7(HTTP/HTTPS) 요청을 검사해 악성 패턴을 차단**한다. 적용 대상은 엣지·진입점 서비스에 한정된다 — **CloudFront, Application Load Balancer(ALB), API Gateway, AppSync, App Runner, Cognito User Pool**. (EC2에 직접은 못 붙인다 — 앞단의 CloudFront나 ALB에 붙인다.)

구조: **Web ACL** → 여러 **Rule(Statement)** → 각 Rule의 **Action**(Allow / Block / Count / CAPTCHA / Challenge).

- **Managed Rule Groups**: AWS가 관리하는 즉시 사용 가능한 룰 묶음 — **Core Rule Set(CRS, OWASP 기반)**, Known Bad Inputs, SQL injection, Linux/Windows OS, IP Reputation, **Bot Control**, Account Takeover Prevention. Marketplace에 F5·Imperva·Fortinet 룰도 있다.
- **Rate-Based Rule**: 5분 윈도우 동안 단일 IP의 요청 수가 임계값을 넘으면 차단 — L7 DDoS·brute force 완화.
- **세분 룰**: Geo Match(국가), IP Set, Regex, Size Constraint, SQLi/XSS 검사 등.

> 💡 **관련 이론**: WAF의 Managed Rule "Core Rule Set"은 **OWASP Top 10**(웹 애플리케이션 보안의 사실상 표준)을 기반으로 한다. OWASP는 2003년부터 가장 치명적인 웹 취약점 10가지를 주기적으로 발표하며(SQL Injection·XSS·Broken Access Control 등), 전 세계 보안 기준의 공통 언어가 됐다. WAF Managed Rule을 켜는 것의 가치는 "이 방대한 OWASP 방어 패턴을 직접 작성·유지보수하지 않아도 AWS가 신종 공격에 맞춰 룰을 갱신한다"는 데 있다. 시험에서 "OWASP Top 10 즉시 보호 + 운영 부담 최소"는 Custom 룰 작성이 아니라 **AWS Managed Rule Groups**가 정답이다.

> ⚠️ **함정**: WAF는 **DDoS 자동 완화 도구가 아니다**. WAF는 "룰에 매칭되는 요청을 차단"할 뿐, 트래픽 폭증을 자동으로 흡수하지 않는다. L7 DDoS 완화는 WAF의 Rate-Based 룰 + Shield Advanced가 함께 한다. 시험 선택지에서 "DDoS 방어"에 WAF만 단독으로 나오면 보통 불완전하다 — Shield(L3/4 자동) + WAF Rate-Based(L7)의 조합이 정답인 경우가 많다.

## Shield — DDoS 전용 방어의 두 등급

| Tier | 비용 | 보호 계층 | 주요 기능 |
|------|------|-----------|-----------|
| **Standard** | 무료(자동) | L3/L4 | SYN/UDP flood 등 자동 완화 |
| **Advanced** | $3,000/월~ | L3/L4 + L7 | Cost Protection, SRT 24/7, WAF 포함, 글로벌 위협 대시보드 |

**Shield Standard**는 모든 AWS 고객에게 무료로 자동 적용돼 L3/L4 DDoS(volumetric·protocol)를 AWS 엣지에서 완화한다. 별도 설정이 필요 없다.

**Shield Advanced**는 월 $3,000(Organization 단위 1구독, 1년 약정)에 다음을 추가한다:

- **L7 DDoS 보호**: 애플리케이션 계층 공격 완화
- **Cost Protection**: DDoS로 인해 스케일 아웃되어 발생한 추가 요금(EC2·ELB·CloudFront·Route 53 등)을 **환불/면제**
- **SRT(Shield Response Team)**: 공격 중 24/7 전문가 지원
- **WAF 포함**: Advanced 보호 리소스의 WAF 요금 포함
- 대상: CloudFront, ALB/NLB, Global Accelerator, Route 53, Elastic IP

> 🎯 **시나리오**: "전자상거래 사이트가 L7 HTTP flood DDoS를 받아 자동 스케일 아웃으로 트래픽을 버텼지만, 그달 청구서가 평소의 5배가 나왔다. 또 공격 중 대응할 전문 인력이 없었다. 어떻게 대비하나?" → **Shield Advanced**. (1) L7 DDoS 보호로 애플리케이션 계층 공격을 완화하고, (2) **Cost Protection**으로 DDoS 유발 스케일 아웃 요금을 면제받으며, (3) **SRT**가 공격 중 24/7 지원한다. Shield Standard는 L7 미보호 + Cost Protection 없음이라 이 시나리오를 못 막는다. WAF 단독은 DDoS 자동 완화·비용 보호가 없다. 함정: "L7 DDoS + 청구 비용 보호 + 24/7 전문가"의 세 키워드는 Shield Advanced 전용이다.

> 📚 **사례**: 2020년 AWS는 당시 역대 최대 규모의 DDoS 공격(약 2.3 Tbps의 CLDAP 반사 증폭 공격)을 Shield로 완화했다고 공개했다. CLDAP(Connectionless LDAP) 반사 공격은 스푸핑된 출발지 IP로 LDAP 서버에 작은 쿼리를 보내 큰 응답을 피해자에게 쏟아붓는 **증폭(amplification) 공격**이다. 이런 초대형 volumetric 공격은 단일 데이터센터로는 절대 흡수 못 하고, AWS의 글로벌 엣지 용량(수십 Tbps)으로 분산 흡수해야만 막힌다. 교훈: volumetric DDoS 방어의 본질은 "공격보다 큰 흡수 용량"이고, 이것이 개별 기업이 자체 구축하기 가장 어려운 영역이다 — Shield는 AWS 전체 엣지 용량을 방패로 빌려준다.

## Firewall Manager — 멀티 계정에 보안 정책을 일괄·자동 적용

계정이 하나면 WAF를 직접 붙이면 된다. 그런데 Organization에 500개 계정이 있고, "모든 ALB에 OWASP Managed Rule을 적용하고, 신규 계정·신규 리소스에도 자동 적용"하라면? 계정마다 수동 설정은 불가능하다. 이걸 푸는 게 **Firewall Manager**다.

- **Organization 단위 정책**: 단일 정책을 정의하면 전 계정·전 리전에 자동 배포
- **대상**: WAF Rule, Shield Advanced, Security Group, Network Firewall, Route 53 DNS Firewall
- **자동 적용**: 신규 계정·신규 리소스에도 정책이 자동 적용
- **드리프트 시정**: 정책 위반(누군가 WAF를 끄는 등)을 자동 탐지·시정·알림

> 📚 **사례**: 한 대기업이 인수합병으로 계정이 수백 개로 늘었는데, 각 사업부가 제각각 보안 설정을 해 어떤 ALB는 WAF가 없고 어떤 건 잘못된 룰을 썼다. Firewall Manager로 "모든 인터넷 향 ALB에 `AWSManagedRulesCommonRuleSet` 적용" 단일 정책을 정의하니, 전 계정에 자동 배포되고 신규 인수 계정도 Organization에 합류하는 즉시 정책이 적용됐다. 누군가 WAF를 끄면 드리프트로 탐지·알림됐다. 교훈: 멀티 계정 보안의 핵심 난제는 "일관성과 신규 자동 포함"이고, Firewall Manager가 이를 중앙에서 강제한다. 시험에서 "Org 전체 WAF/SG 정책 일괄 + 신규 계정 자동"은 항상 Firewall Manager다.

> ⚠️ **함정**: Firewall Manager vs SCP vs Config. **SCP**는 "할 수 없는 것을 금지"(가드레일, 거부 경계)하지 보안 룰을 배포하진 않는다. **Config**는 "비준수를 평가·탐지"하지 능동적으로 WAF 룰을 배포하진 않는다(시정은 가능하나 보안 정책 배포가 본업이 아님). **Firewall Manager**만이 WAF·Shield·SG·Network Firewall 같은 **보안 정책을 능동적으로 일괄 배포**한다. 시험에서 "보안 정책을 멀티 계정에 배포·강제"는 Firewall Manager, "행위 자체를 금지"는 SCP, "준수 평가"는 Config로 가른다.

## Network Firewall — VPC 내부 트래픽의 IDS/IPS

WAF가 엣지의 L7 웹 요청을 막는다면, **Network Firewall**은 **VPC 내부를 흐르는 모든 트래픽(L3~L7)**을 검사한다. 관리형 IDS/IPS로, 오픈소스 **Suricata** 룰 엔진을 기반으로 한다.

- **배치**: 가용 영역마다 방화벽 엔드포인트를 두고, Route Table로 트래픽을 강제로 통과시킨다(inline)
- **기능**: 스테이트풀 검사, IDS/IPS(침입 탐지·차단), 도메인 필터링, **TLS Inspection**(암호화 트래픽 복호화 후 검사)
- **vs WAF**: WAF = 엣지의 L7 웹(CF/ALB/APIGW), Network Firewall = VPC 전반의 모든 프로토콜 트래픽

> 🔍 **더 깊이**: Network Firewall이 Suricata 룰 형식을 쓰는 것은 영리한 설계다. Suricata는 업계 표준 오픈소스 IDS/IPS 엔진이고, 보안 커뮤니티가 작성한 방대한 위협 시그니처(Emerging Threats 등)가 Suricata 형식으로 존재한다. AWS가 독자 형식을 쓰지 않고 Suricata 호환을 택해, 기존 온프레미스 IDS 룰을 클라우드로 그대로 가져올 수 있게 했다. TLS Inspection은 양날의 검이다 — 암호화된 악성 트래픽(C2 통신 등)을 잡으려면 복호화가 필요하지만, 이는 중간자(MITM) 구조라 프라이버시·성능·인증서 관리 부담이 크다. 그래서 보통 특정 대상(아웃바운드 의심 트래픽)에만 선택적으로 적용한다.

> 📚 **사례**: 한 핀테크는 아웃바운드 데이터 유출(exfiltration)이 우려돼 VPC 트래픽 전수 검사를 도입했다. 처음엔 모든 트래픽에 TLS Inspection을 켰는데, 복호화·재암호화 오버헤드로 지연이 급증하고 인증서 관리가 복잡해졌으며 일부 인증서 핀닝(pinning) 앱이 깨졌다. 해법은 선택적 적용 — 신뢰된 내부 트래픽은 통과시키고, **아웃바운드 의심 대상(미분류 외부 도메인)에만** TLS Inspection을 적용했다. 교훈: TLS Inspection은 중간자(MITM) 구조라 강력하지만 비용·성능·호환성 부담이 크다. "전부 복호화"는 안티패턴이고, 위험 기반으로 범위를 좁히는 게 표준이다.

## DNS Firewall — 악성 도메인을 이름 단계에서 차단

**Route 53 Resolver DNS Firewall**은 **VPC에서 나가는 DNS 쿼리**를 검사해 악성 도메인 조회를 차단한다. 멀웨어가 C2 서버 도메인을 조회하거나, 데이터 유출용 DNS 터널링을 시도할 때 **이름 해석 단계에서** 막는다.

- **Managed 도메인 리스트**: AWS·서드파티가 관리하는 악성 도메인 목록
- **커스텀 리스트**: 자사 허용/차단 도메인 정의
- **왜 SG/NACL이 아닌가**: SG·NACL은 IP 기반인데, 악성 도메인의 IP는 자주 바뀐다. 도메인 이름으로 막는 게 견고하다.

> ⚠️ **함정**: "VPC 내 사용자가 악성 도메인에 접근하지 못하게"는 **DNS Firewall**이지 Network Firewall이 아니다(Network Firewall도 도메인 필터링이 가능하나, 관리형 악성 도메인 리스트 기반 차단은 DNS Firewall이 직접적). NACL·SG는 IP 기반이라 도메인 차단에 부적합하다(IP가 수시로 변함). 시험에서 "악성 도메인 차단"의 키워드는 Route 53 DNS Firewall이다.

> 💡 **관련 이론**: DNS Firewall이 IP가 아닌 **이름(name)** 단계에서 막는 게 견고한 이유는 멀웨어의 통신 구조에 있다. 현대 멀웨어는 **DGA(Domain Generation Algorithm)**로 매일 수천 개의 무작위 도메인을 생성하고, C2 서버는 그중 하나만 등록해 탐지를 회피한다. IP는 더 자주 바뀐다(빠른 fast-flux DNS). IP 기반 차단(SG/NACL)은 이 변화를 따라잡을 수 없다. 도메인 평판 리스트(이름 기반)는 IP가 바뀌어도 도메인 패턴·등록 정보로 추적하므로 더 안정적이다. 또 **DNS 터널링**(DNS 쿼리에 데이터를 숨겨 유출)도 DNS 단계에서만 잡힌다 — 이름 해석 계층이 아웃바운드 위협의 핵심 관문인 이유다.

## 엣지 보안 풀스택 아키텍처

```
[Internet]
    │
[Route 53]  ◀── DNS Firewall (악성 도메인 쿼리 차단)
    │
[CloudFront] ◀── WAF (L7: OWASP·Rate-Based) + Shield Advanced (L3-7 DDoS)
    │
[ALB]  ◀── WAF (Origin 보호)
    │
[VPC]  ◀── Network Firewall (L3-7 IDS/IPS, TLS Inspection)
    │
[EC2 / Container]

   전 계층 정책: Firewall Manager (Org 단위 일괄·자동 배포)
```

## 정리하며

엣지 보안은 OSI 계층의 지도 위에 선다 — **DDoS는 Shield**(L3/L4 자동, Advanced로 L7+Cost Protection+SRT), **L7 웹 공격은 WAF**(Managed Rule로 OWASP, Rate-Based로 L7 DDoS·brute force), **VPC 내부 트래픽은 Network Firewall**(L3-7 IDS/IPS·TLS Inspection), **악성 도메인은 DNS Firewall**(이름 단계 차단), 그리고 이 모두를 **Firewall Manager**가 Organization 전체에 일괄·자동 배포한다.

SAP 시험 단골 매핑: (1) "OWASP Top 10 즉시 보호 + 운영 부담 최소" → **WAF Managed Rule Groups**, (2) "L7 DDoS + Cost Protection + SRT 24/7" → **Shield Advanced**, (3) "L3/L4 DDoS 무료 자동" → **Shield Standard**, (4) "Org 전체 WAF·SG 정책 일괄 + 신규 계정 자동" → **Firewall Manager**, (5) "VPC 내 IDS/IPS + TLS Inspection" → **Network Firewall**, (6) "VPC 내 악성 도메인 차단" → **Route 53 DNS Firewall**, (7) "특정 국가 차단" → **WAF Geo Match**, (8) "단일 IP brute force/L7 flood 제한" → **WAF Rate-Based Rule**. 다음 day는 11주차 보안 전체를 한 시나리오로 종합한다.

---

## 📝 연습 문제

**문제 1.** 웹 애플리케이션을 OWASP Top 10(SQL 인젝션·XSS 등)으로부터 즉시 보호하되, 룰을 직접 작성·유지보수하는 운영 부담을 최소화하고 싶다. 가장 적합한 것은?

A) 모든 WAF 룰을 Custom으로 직접 작성

B) AWS Managed Rule Groups (Core Rule Set·Known Bad Inputs·SQLi)

C) Shield Standard

D) NACL로 포트 차단

**정답: B**
해설: AWS Managed Rule Groups는 OWASP Top 10 기반 Core Rule Set 등을 즉시 제공하고 AWS가 신종 공격에 맞춰 룰을 갱신해 운영 부담이 최소다. A(Custom 전부)는 작성·유지보수 부담이 크고 신종 공격 대응이 느리다. C(Shield Standard)는 L3/L4 DDoS 방어이지 L7 웹 취약점 필터가 아니다. D(NACL)는 L3/L4 IP·포트 제어이지 HTTP 페이로드 검사가 불가하다. 함정: "OWASP 즉시 보호 + 운영 최소"는 Custom이 아니라 Managed Rule Groups.

---

**문제 2.** L7 HTTP flood DDoS를 받았고, 그로 인한 자동 스케일 아웃 요금 폭증을 면제받고 싶으며, 공격 중 24/7 전문가 지원이 필요하다. 가장 적합한 것은?

A) Shield Standard

B) Shield Advanced

C) WAF Rate-Based Rule만

D) CloudFront만

**정답: B**
해설: Shield Advanced는 L7 DDoS 보호 + Cost Protection(DDoS 유발 추가 요금 면제) + SRT 24/7 지원을 모두 제공한다. A(Standard)는 무료지만 L3/L4만 자동 완화하고 L7 보호·Cost Protection·SRT가 없다. C(Rate-Based만)는 L7 완화에 도움되지만 비용 보호·전문가 지원이 없다. D(CloudFront)는 캐싱·배포이지 DDoS 비용 보호·SRT가 아니다. 함정: "L7 DDoS + Cost Protection + 24/7 SRT" 세 키워드는 Shield Advanced 전용.

---

**문제 3.** 500개 계정 Organization의 모든 인터넷 향 ALB에 동일한 WAF Managed Rule을 적용하고, 신규로 추가되는 계정·리소스에도 자동 적용하며, 누군가 WAF를 끄면 자동 탐지·시정하고 싶다. 가장 적합한 것은?

A) AWS Config Rule

B) Firewall Manager

C) SCP

D) Control Tower

**정답: B**
해설: Firewall Manager는 Organization 단위로 WAF·Shield·SG·Network Firewall 정책을 일괄 배포하고, 신규 계정·리소스에 자동 적용하며 드리프트(WAF 비활성화 등)를 자동 탐지·시정한다. A(Config)는 비준수 평가가 본업이지 WAF 정책 능동 배포가 아니다. C(SCP)는 행위 금지(거부 가드레일)이지 보안 룰 배포가 아니다. D(Control Tower)는 랜딩 존 거버넌스이지 WAF 정책 배포 엔진이 아니다. 함정: "보안 정책 멀티 계정 배포 + 신규 자동 + 드리프트 시정"은 Firewall Manager.

---

**문제 4.** VPC 내부를 흐르는 모든 트래픽에 IDS/IPS를 적용하고, 암호화된 트래픽도 복호화해 검사(TLS Inspection)해야 한다. 가장 적합한 것은?

A) WAF

B) Network Firewall

C) Shield Advanced

D) Security Group

**정답: B**
해설: Network Firewall은 Suricata 룰 기반 L3-7 IDS/IPS로, VPC 내부 트래픽을 inline으로 검사하고 TLS Inspection까지 지원한다. A(WAF)는 엣지(CF/ALB/APIGW)의 L7 웹 요청만 검사하고 VPC 전반 트래픽·TLS Inspection은 못 한다. C(Shield)는 DDoS 방어이지 IDS/IPS가 아니다. D(SG)는 스테이트풀 IP/포트 필터이지 페이로드 검사·IPS가 아니다. 함정: "VPC 내부 IDS/IPS + TLS Inspection"은 Network Firewall.

---

**문제 5.** VPC 내 EC2가 멀웨어 C2 서버나 알려진 악성 도메인에 접근하지 못하게 이름 해석 단계에서 차단하고 싶다. 가장 적합한 것은?

A) Security Group으로 악성 IP 차단

B) WAF

C) Route 53 Resolver DNS Firewall

D) NACL로 IP 차단

**정답: C**
해설: DNS Firewall은 VPC에서 나가는 DNS 쿼리를 관리형/커스텀 악성 도메인 리스트로 차단해, 이름 해석 단계에서 C2·악성 도메인 접근을 막는다. A·D(SG/NACL)는 IP 기반인데 악성 도메인 IP는 수시로 바뀌어 도메인 차단에 부적합하다. B(WAF)는 인바운드 L7 웹 요청 필터이지 아웃바운드 DNS 쿼리 차단이 아니다. 함정: "악성 도메인 차단(이름 기반)"은 DNS Firewall, IP 기반(SG/NACL)은 부적합.

---

**문제 6.** 특정 국가에서 오는 웹 요청만 차단하고 싶다(규제·라이선스 사유). 가장 적합한 것은?

A) NACL

B) WAF Geo Match Rule

C) Shield

D) Security Group

**정답: B**
해설: WAF Geo Match Rule은 요청의 출발지 국가를 식별해 특정 국가를 차단/허용한다. A(NACL)·D(SG)는 IP 기반이라 국가 단위 매핑·관리가 비현실적이다. C(Shield)는 DDoS 방어이지 지역 기반 필터가 아니다. 함정: "특정 국가 차단"은 WAF Geo Match.

---

**문제 7.** 단일 IP가 5분 동안 비정상적으로 많은 요청을 보내는 L7 flood·brute force를 자동으로 차단하고 싶다. 가장 적합한 것은?

A) Shield Standard

B) WAF Rate-Based Rule

C) NACL

D) Network Firewall

**정답: B**
해설: WAF Rate-Based Rule은 5분 윈도우 동안 단일 IP의 요청 수가 임계값을 넘으면 자동 차단해 L7 flood·brute force·credential stuffing을 완화한다. A(Shield Standard)는 L3/L4 DDoS 자동 완화이지 IP별 요청 빈도 제한이 아니다. C(NACL)는 빈도 기반 제한 기능이 없다. D(Network Firewall)는 VPC 내부 IDS/IPS이지 엣지 웹 요청의 IP별 rate limiting이 본업이 아니다. 함정: "단일 IP 요청 빈도 제한(L7)"은 WAF Rate-Based Rule.
