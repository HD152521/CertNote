# Day 5 - Week 4 종합: 엣지·경계 방어 시나리오 통합 복습

이번 주는 인프라 보안의 두 번째 축인 *엣지와 경계 방어*를 다뤘다. WAF(L7 필터), Shield(DDoS 흡수), Network/DNS Firewall(VPC 검사·도메인 통제), CloudFront/ACM/OAC(엣지 통합·오리진 잠금). 오늘은 이들을 하나의 결정 체계로 묶는다. 시험은 개별 서비스 지식보다 *"이 상황에서 어떤 통제를 어느 지점에 배치하는가"*를 묻는다. 핵심은 **계층(어떤 위협인가) × 위치(어디서 막는가)**의 2차원 사고다.

## 통합 결정 매트릭스: 위협 → 통제

| 위협/요구 | 1차 통제 | 배치 위치 |
|-----------|----------|-----------|
| SQLi/XSS 등 L7 인젝션 | WAF managed/match rule + TextTransformation | CloudFront 또는 ALB |
| HTTP/GET flood (L7 DDoS) | WAF rate-based rule (+ScopeDown) | CloudFront/ALB |
| SYN/UDP flood (L3/4 DDoS) | Shield (Standard 자동, Advanced 향상) | 엣지(CloudFront/R53/GA) |
| 대규모 공격 비용 보전·DRT 지원 | Shield Advanced | 보호 등록 리소스 |
| 로그인 브루트포스 | WAF rate-based(CUSTOM_KEYS) + CAPTCHA | 엣지 |
| VPC 아웃바운드 도메인 통제 | Network Firewall stateful(SNI/Host) | inspection subnet/VPC |
| 침입 시그니처(IPS) | Network Firewall stateful(Suricata) | inspection VPC |
| DNS 기반 멀웨어/exfiltration | Route 53 DNS Firewall | VPC Resolver |
| 다계정 트래픽 중앙 검사 | Network Firewall + TGW(appliance mode) | 중앙 inspection VPC |
| S3/오리진 직접 접근 차단 | OAC + 버킷 정책(SourceArn) | CloudFront ↔ S3 |
| 콘텐츠 단위/한시 접근 | 서명 URL(단일) / 서명 쿠키(경로) | CloudFront |
| TLS 강제·자동 갱신 | ACM(us-east-1 for CF) + Viewer Protocol Policy | CloudFront/ALB |
| 다계정 WAF 정책 강제 | Firewall Manager | Organizations |

> 💡 **관련 이론**: 이 매트릭스의 바탕은 *defense in depth(심층 방어)*다. 단일 통제에 의존하지 않고 DNS(이름 해석) → 엣지(L7 필터·흡수) → 네트워크(IPS·도메인) → 오리진(잠금) 여러 겹으로 방어선을 쌓는다. 한 겹이 우회돼도 다음 겹이 막는다. 시험의 "best" 답은 보통 *공격에 가장 가까운 적절한 계층에서, 우회 불가능하게* 막는 통제다.

## 위치 사고: 통제는 우회 불가능한 길목에 둔다

같은 WAF 규칙도 *어디에 붙이느냐*가 보안 효과를 좌우한다.

- **엣지(CloudFront)에 WAF**: 악성 트래픽을 오리진 도달 전 차단. 단, 오리진 직접 접근을 막아야(OAC/prefix list) 우회가 없다.
- **ALB에 WAF**: 리전 진입점에서 차단. CloudFront 없이 ALB가 경계일 때.
- **둘 다 공개면 통제가 분산**되어 우회 경로가 생긴다 → 경계를 한 줄로 정렬.

Network Firewall도 마찬가지다. 라우팅으로 트래픽을 firewall endpoint로 *강제 통과*시키지 않으면 규칙은 무의미하다(Day 3 함정). 중앙 inspection VPC는 모든 트래픽이 지나는 choke point를 만들어 우회를 차단한다.

> 🎯 **통합 시나리오 A**: "글로벌 웹앱이 L7 SQLi 시도 + 간헐적 대규모 SYN flood + 로그인 무차별 대입을 동시에 받는다. 오리진은 ALB+EC2." 답: (1) CloudFront 전면 배치 + ACM(us-east-1) TLS, (2) CLOUDFRONT scope WAF — SQLi managed rule(TextTransformation) + `/login` scope-down rate-based(CUSTOM_KEYS) + CAPTCHA, (3) Shield Advanced 등록(SYN flood 흡수 + 비용 보호 + DRT), (4) 오리진 ALB는 CloudFront prefix list + X-Origin-Verify로 직접 접근 차단. 한 시나리오에 이번 주 모든 서비스가 협력한다.

> 🎯 **통합 시나리오 B**: "100개 계정의 워크로드 VPC들이 인터넷·VPC 간 통신을 하는데, 모든 아웃바운드를 승인된 도메인으로만 제한하고 IPS를 적용하며 중앙에서 운영하고 싶다." 답: TGW 허브 + 중앙 inspection VPC에 Network Firewall(stateful: 도메인 allow-list + Suricata IPS) + TGW appliance mode + DNS Firewall로 악성 도메인 해석 차단 + Firewall Manager로 정책 중앙 배포. East-West/North-South 모두 단일 choke point 통과.

## 자주 틀리는 구분들

**WAF vs Shield vs Network Firewall** — 계층과 트래픽 종류가 다르다:
- WAF: HTTP(L7) 애플리케이션 요청. CloudFront/ALB/API GW 등에 *연결*.
- Shield: DDoS(L3/4 흡수 + L7 통합). 엣지 서비스 뒤에서 강력.
- Network Firewall: VPC의 일반 네트워크 트래픽(L3-L7) 검사·IPS·도메인. 라우팅으로 통과.

**OAC vs OAI** — OAC가 현행 권장(SigV4, SSE-KMS, 동적 요청, 모든 리전). 신규는 OAC.

**서명 URL vs 서명 쿠키** — 단일 객체 vs 경로 패턴 다수 객체.

**CloudFront 서명 URL vs S3 presigned URL** — 전자는 엣지(WAF/Shield/OAC) 통제를 거치고, 후자는 우회한다.

**Network Firewall(SNI/도메인) vs DNS Firewall(질의)** — 전자는 연결 시도를, 후자는 이름 해석을 막는다. 보완적.

**ACM 리전 규칙** — CloudFront용은 us-east-1, 리전 리소스용은 해당 리전.

> ⚠️ **함정 모음**:
> - WAF Web ACL 스코프(CLOUDFRONT vs REGIONAL)를 잘못 골라 대상에 안 붙음.
> - OAC 설정 후 버킷 정책·KMS 키 정책 미갱신으로 403.
> - Network Firewall 라우팅 미구성으로 검사 자체가 안 일어남.
> - TGW appliance mode 누락으로 stateful 검사 비대칭 오작동.
> - L7 HTTP flood를 Shield Standard로 막으려 함(→ WAF rate-based가 정답).
> - CloudFront용 ACM을 us-east-1 아닌 리전에 발급.

## 가시성·운영: 막은 것을 증명하라

방어는 로그로 증명된다. 이번 주 서비스의 로그·메트릭:
- **WAF**: 로그(`aws-waf-logs-` 접두사) → CloudWatch/S3/Firehose. terminatingRuleId·라벨·sampled requests. RedactedFields로 민감 헤더 마스킹.
- **Shield Advanced**: `DDoSDetected`, `DDoSAttackBitsPerSecond` 등 CloudWatch 메트릭 + 공격 이벤트.
- **Network Firewall**: flow log + alert log(IPS 경보).
- **DNS Firewall**: Resolver query log(차단/허용 질의).

이 신호들은 GuardDuty·Security Hub로 모아 상관 분석하고, 알람을 SNS·SRT proactive engagement로 연결한다. 5주차(탐지·대응) 주제로 이어진다.

> 🔍 **더 깊이**: 경계 방어의 성숙도는 "차단했는가"가 아니라 "차단을 *관측·튜닝·증명*할 수 있는가"로 갈린다. WAF를 Count 모드로 먼저 운영해 false positive를 측정하고(Day 1), Shield health-based detection으로 정상 급증을 공격과 구분하며(Day 2), Network Firewall alert log로 IPS 정확도를 검증한다(Day 3). 통제를 켜는 것은 시작이고, 데이터로 통제를 조율하는 것이 운영 보안의 본체다.

## 한 줄 요약 체크리스트

- [ ] 모든 진입을 엣지(CloudFront)로 강제했는가 — 오리진 직접 접근 차단(OAC/prefix list/비밀 헤더)
- [ ] WAF 스코프를 대상(CloudFront=CLOUDFRONT)에 맞췄는가, TextTransformation을 넣었는가
- [ ] rate-based rule로 L7 flood·브루트포스를 키 단위로 막는가
- [ ] Shield 등급이 위협 규모·비용 보호 요구에 맞는가
- [ ] VPC 트래픽을 firewall endpoint로 라우팅 강제했는가(+ TGW appliance mode)
- [ ] DNS 계층 위협을 DNS Firewall로 보완하는가
- [ ] ACM 인증서 리전(CloudFront=us-east-1)과 자동 갱신(DNS 검증)을 맞췄는가
- [ ] 모든 통제의 로그·메트릭을 중앙 수집·알람화했는가

---

## 📝 연습 문제

**문제 1.** 글로벌 웹앱이 SQLi 시도, 대규모 SYN flood, 로그인 무차별 대입을 동시에 받는다. 오리진은 ALB+EC2다. 가장 적절한 통합 설계는?

A) ALB에만 WAF를 붙이고 EC2 인스턴스를 키운다  
B) CloudFront 전면 배치 + CLOUDFRONT scope WAF(SQLi managed + `/login` rate-based) + Shield Advanced + 오리진 직접 접근 차단(prefix list/비밀 헤더)  
C) NACL로 모든 의심 IP를 수동 차단  
D) Route 53 가중치 라우팅으로 트래픽 분산만 한다  

**정답: B**  
해설: 세 위협이 서로 다른 계층이므로 계층별 통제를 엣지에 결합해야 한다. CloudFront 전면 배치로 진입을 엣지로 모으고, WAF로 SQLi(L7 필터)와 로그인 브루트포스(rate-based)를, Shield Advanced로 SYN flood(L3/4 흡수)와 비용 보호를 처리하며, 오리진 직접 접근을 차단해 우회를 막는다. ALB만 보호하면 엣지 흡수가 없고, NACL 수동 차단·단순 트래픽 분산은 이 복합 위협을 막지 못한다.

---

**문제 2.** 100개 계정의 워크로드 VPC 아웃바운드를 승인 도메인으로만 제한하고 IPS를 적용하며 중앙 운영하려 한다. 가장 적절한 아키텍처는?

A) VPC마다 Network Firewall를 개별 배치  
B) Transit Gateway 허브 + 중앙 inspection VPC의 Network Firewall(도메인 allow-list + Suricata IPS) + TGW appliance mode + Firewall Manager 중앙 배포  
C) Security Group으로 도메인을 화이트리스트  
D) 각 VPC에서 NACL로 IP 차단  

**정답: B**  
해설: 다계정 중앙 검사는 TGW 허브 + 전용 inspection VPC에 Network Firewall를 두고, appliance mode로 stateful 대칭성을 보장하며 Firewall Manager로 정책을 중앙 배포하는 choke point 패턴이 정답이다. VPC별 개별 배치는 운영·비용이 비효율적이고, Security Group/NACL은 도메인(SNI/Host) 기반 통제나 IPS를 못 한다.

---

**문제 3.** L7 HTTP GET flood를 받는 상황에서 Shield Standard만으로 충분하다고 본 설계가 실패했다. 올바른 보완은?

A) Shield Standard를 재활성화  
B) WAF rate-based rule로 IP/커스텀 키별 요청률을 제한(필요 시 Shield Advanced 자동 L7 완화 결합)  
C) 인스턴스 타입을 키운다  
D) Route 53 TTL을 낮춘다  

**정답: B**  
해설: Shield Standard는 L3/L4 흡수가 주력이라 L7 HTTP flood를 정밀 차단하지 못한다. L7 flood는 WAF rate-based rule이 IP/커스텀 키별 요청률을 측정해 차단하는 것이 직접 통제이며, Shield Advanced의 자동 애플리케이션 계층 완화와 결합할 수 있다. 인스턴스 확장·TTL 변경은 근본 완화가 아니다.

---

**문제 4.** CloudFront 서명 URL과 S3 presigned URL 중, 엣지의 WAF·Shield·OAC 보호를 모두 거치게 하려면 어느 것을 써야 하며 그 이유는?

A) S3 presigned URL — 더 간단하므로  
B) CloudFront 서명 URL — 엣지에서 검증되어 WAF·Shield·캐싱·OAC 보호를 거치고, S3 presigned URL은 이 통제를 우회한다  
C) 둘 다 동일하다  
D) 어느 쪽도 WAF를 거치지 않는다  

**정답: B**  
해설: CloudFront 서명 URL은 엣지에서 검증되므로 WAF·Shield·엣지 캐싱·OAC 잠금을 모두 통과하는 경로에 놓인다. 반면 S3 presigned URL은 S3가 직접 서명·검증해 CloudFront 엣지 통제를 우회한다. 따라서 엣지 보호를 일관 적용하려면 CloudFront 서명 URL + OAC 구성이 정답이다.

---

**문제 5.** 다음 중 이번 주 통제 배치에서 "함정"으로 자주 지적되는 항목이 아닌 것은?

A) WAF Web ACL 스코프(CLOUDFRONT/REGIONAL)를 대상과 어긋나게 생성  
B) OAC 설정 후 버킷 정책·KMS 키 정책을 갱신하지 않아 403  
C) Network Firewall로 트래픽 라우팅을 firewall endpoint로 강제하지 않아 검사 미발생  
D) ACM DNS 검증을 사용해 인증서를 자동 갱신 가능하게 구성  

**정답: D**  
해설: ACM의 DNS 검증은 함정이 아니라 *권장 모범*이다 — 도메인 소유를 지속 확인할 수 있어 완전 자동 갱신이 가능하다. 나머지는 모두 실제 빈출 함정이다: 스코프 불일치로 ACL 미연결, OAC 후 정책 미갱신 403, 라우팅 미구성으로 Network Firewall 검사 자체가 안 일어남. 함정이 *아닌* 것을 고르는 문제이므로 정답은 자동 갱신 구성이다.

---
