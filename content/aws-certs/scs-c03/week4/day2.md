# Day 2 - AWS Shield(Standard/Advanced)와 DDoS 방어: 계층별 방어, CloudFront/Route 53 결합

DDoS(Distributed Denial of Service)는 "트래픽을 많이 보내 서비스를 마비시키는 공격"으로 요약되지만, 보안 관점의 핵심은 *공격이 어느 계층을 노리는가*에 따라 방어 메커니즘이 완전히 다르다는 점이다. SYN flood(L3/4 자원 고갈)와 HTTP flood(L7 애플리케이션 고갈)는 같은 "flood"라도 같은 도구로 막을 수 없다. AWS Shield는 이 계층 구분 위에 설계된 서비스다.

Shield는 두 등급으로 나뉜다. **Shield Standard**는 모든 AWS 고객에게 자동·무료로 적용되어 흔한 L3/L4 공격을 흡수한다. **Shield Advanced**는 유료 구독으로, 더 큰 공격에 대한 탐지·완화·비용 보호·DRT(DDoS Response Team) 지원·L7 통합을 제공한다.

## DDoS 공격의 계층 분류

| 공격 유형 | 계층 | 예시 | 1차 방어 |
|-----------|------|------|----------|
| Volumetric(체적) | L3 | UDP reflection, NTP/DNS amplification | 대역폭 흡수(엣지 분산) |
| State-exhaustion(상태 고갈) | L4 | SYN flood, ACK flood | SYN cookie, 연결 상태 완화 |
| Application(애플리케이션) | L7 | HTTP flood, Slowloris, GET/POST flood | WAF, rate-based rule, CAPTCHA |

> 💡 **관련 이론**: DDoS 방어의 근본 전략은 두 갈래다. *흡수(absorption)* — AWS의 글로벌 엣지 네트워크가 가진 막대한 대역폭으로 체적 공격을 분산 흡수한다. *필터링(filtering)* — 악성 패턴을 식별해 거른다. L3/L4 체적 공격은 흡수가 주력이고(개별 서버가 막을 수 없는 규모), L7 공격은 트래픽 양이 작아도 애플리케이션 자원을 고갈시키므로 필터링(WAF)이 주력이다. "더 큰 파이프 vs 더 똑똑한 필터"의 분업이다.

## Shield Standard: 자동·무료 베이스라인

Shield Standard는 별도 활성화 없이 모든 AWS 리소스에 적용된다. CloudFront, Route 53, Global Accelerator 같은 엣지 서비스 뒤에 있을 때 가장 강력하다 — 이들이 AWS 백본·엣지 네트워크에 직접 자리해 L3/L4 공격을 엣지에서 흡수하기 때문이다.

Shield Standard가 막는 것:
- SYN/UDP flood, reflection 공격 등 흔한 L3/L4 공격
- 알려진 악성 시그니처에 기반한 인라인 완화

Shield Standard가 *하지 않는* 것: L7 애플리케이션 공격의 정밀 필터링(이건 WAF의 몫), 공격 가시성 대시보드, 비용 보호, DRT 지원.

## Shield Advanced: 무엇이 더해지는가

Shield Advanced는 구독(계정/Organization 단위) 후 보호 대상 리소스를 명시적으로 등록한다. 보호 가능 리소스: CloudFront, Route 53 hosted zone, Global Accelerator accelerator, ALB/CLB, EIP(Elastic IP, 즉 EC2/NLB 등).

추가되는 핵심 가치:
1. **향상된 탐지·완화**: 애플리케이션 계층(L7)을 포함한 더 정교한 공격 탐지, 더 큰 공격 대응.
2. **DDoS Response Team(DRT)/Shield Response Team(SRT)**: 공격 중 전문가 지원. 사전에 IAM 역할(`AWSSRTAccess`)을 부여하면 SRT가 WAF 규칙을 대신 조정할 수 있다.
3. **Cost Protection(DDoS 비용 보호)**: 공격으로 인한 스케일 아웃·데이터 전송 급증 요금에 대한 서비스 크레딧.
4. **WAF 통합·요금 포함**: 보호 리소스에 대해 WAF 사용 요금이 Shield Advanced에 포함되고, 자동 애플리케이션 계층 완화(automatic application-layer DDoS mitigation)로 WAF 규칙을 자동 생성·적용할 수 있다.
5. **Global threat dashboard / 실시간 메트릭·이벤트**: `DDoSDetected`, `DDoSAttackBitsPerSecond` 등.
6. **Proactive engagement / Health-based detection**: Route 53 health check를 연동하면 false positive를 줄이고, 임계 시 SRT가 선제 연락.

```bash
# Shield Advanced 구독(계정 단위, 사전)
aws shield subscribe-to-proactive-engagement \
  --proactive-engagement-status ENABLED \
  --emergency-contact-list '[{"emailAddress":"soc@example.com","phoneNumber":"+10000000000"}]'

# 보호 대상 등록
aws shield create-protection \
  --name "prod-cloudfront" \
  --resource-arn arn:aws:cloudfront::111122223333:distribution/E123ABC
```

> 🎯 **시나리오**: "공격 중 발생한 Auto Scaling 비용·데이터 전송 폭증 요금을 환급받고 싶다"는 시험 빈출. 정답은 Shield Advanced의 **Cost Protection** — 보호 등록된 리소스가 DDoS로 인해 스케일하며 발생한 요금에 대해 크레딧을 신청할 수 있다. Shield Standard에는 이 보호가 없다.

## L7 방어는 결국 WAF의 일

Shield Advanced가 L7을 "다룬다"고 해서 WAF를 대체하는 것이 아니다. 정밀한 애플리케이션 계층 차단은 여전히 WAF 규칙(rate-based, managed group, CAPTCHA)이 수행하고, Shield Advanced는 이를 *조율·자동화·지원*한다.

- HTTP flood → WAF rate-based rule로 IP/키별 한도 초과 차단
- 의심 봇 → CAPTCHA/Challenge 또는 Bot Control
- 자동 application-layer 완화 활성화 시, Shield가 공격 패턴을 분석해 임시 WAF 규칙을 자동 적용(`Count` 먼저 → `Block`)

> ⚠️ **함정**: "L7 DDoS를 Shield Standard로 막는다"는 오답 보기로 자주 나온다. Shield Standard는 L3/L4가 주력이고, L7 애플리케이션 공격의 정밀 완화는 WAF(또는 Shield Advanced의 WAF 통합)가 담당한다. 시험에서 "HTTP flood / GET flood 완화"가 나오면 WAF rate-based rule을 먼저 떠올려야 한다.

## CloudFront·Route 53·Global Accelerator와의 결합: 방어선을 엣지로

DDoS 방어의 아키텍처 원칙은 *공격을 오리진에서 최대한 멀리, 엣지에서 흡수*하는 것이다.

- **CloudFront**: 정적·동적 콘텐츠를 엣지에서 서빙하면 L3/L4 공격이 엣지 네트워크에 분산 흡수된다. 오리진은 CloudFront 뒤에 숨고, 오리진 직접 접근을 차단(OAC + Security Group/prefix list)하면 공격 표면이 줄어든다.
- **Route 53**: 관리형 DNS는 anycast로 전 세계에 분산되어 DNS 계층 공격에 강하다. Shield로 보호되며 DNS flood를 흡수한다.
- **Global Accelerator**: AWS 글로벌 네트워크의 anycast IP로 진입점을 고정·분산. 정적 IP 2개 뒤로 트래픽을 흡수하고 가까운 엣지로 라우팅한다.

```
인터넷 공격 ──> [Route 53 anycast DNS]
                       │
              [CloudFront 엣지(WAF 평가 + 흡수)]
                       │  (OAC, 오리진 보호)
                  [ALB / 오리진]  ← 직접 접근 차단
```

> 💡 **관련 이론**: 엣지 흡수 전략은 *anycast*의 성질을 활용한다. 동일한 IP를 전 세계 다수 엣지가 광고하면, BGP가 출발지에서 가장 가까운 엣지로 트래픽을 라우팅한다. 공격 트래픽도 자연히 여러 엣지로 분산되어 단일 지점에 집중되지 않는다. "공격을 막는다"기보다 "공격을 흩뿌려 희석한다"는 발상이다. 그래서 오리진을 엣지 뒤에 숨기는 것이 방어의 출발점이다.

## 오리진 노출이라는 약점

CloudFront로 콘텐츠를 서빙해도 공격자가 오리진의 실제 IP/도메인을 알아내면 엣지를 우회해 직접 공격할 수 있다. 방어:
- 오리진(ALB/EC2) Security Group을 **CloudFront managed prefix list**(`com.amazonaws.global.cloudfront.origin-facing`)로 제한해 CloudFront IP만 허용.
- 커스텀 헤더(`X-Origin-Verify`)를 CloudFront가 주입하고 오리진/ALB·WAF가 이를 검증해, 헤더 없는 직접 요청을 차단.
- 오리진 도메인을 추측 어려운 이름으로 두고 DNS에 노출하지 않음.

## 가시성·대응 메트릭

Shield Advanced는 CloudWatch에 공격 메트릭을 제공한다: `DDoSDetected`(0/1), `DDoSAttackBitsPerSecond`, `DDoSAttackPacketsPerSecond`, `DDoSAttackRequestsPerSecond`. 이를 알람으로 묶어 SNS·SRT proactive engagement와 연동한다. Shield는 또한 공격 이벤트의 시작/종료·완화 내역을 이벤트로 기록해 사후 분석을 돕는다.

> 🔍 **더 깊이**: Shield Advanced의 *Route 53 health check 기반 탐지*는 false positive를 줄이는 영리한 메커니즘이다. 단순히 트래픽 급증을 공격으로 보면 정상 캠페인 트래픽까지 완화 대상이 된다. 하지만 애플리케이션의 health check가 정상이면 "트래픽은 늘었지만 서비스는 건강하다"고 판단해 과잉 완화를 억제한다. 즉 *부하 자체*가 아니라 *서비스 건강도 저하*를 공격 신호로 본다.

---

## 📝 연습 문제

**문제 1.** Shield Standard와 Shield Advanced의 차이로 옳은 것은?

A) Standard는 L7 공격을, Advanced는 L3/L4 공격만 막는다  
B) Standard는 모든 고객에게 자동·무료로 L3/L4를 흡수하고, Advanced는 유료로 향상된 탐지·DRT 지원·비용 보호·WAF 통합을 추가한다  
C) Standard는 CloudFront에만, Advanced는 EC2에만 적용된다  
D) 둘 다 동일하며 이름만 다르다  

**정답: B**  
해설: Shield Standard는 모든 AWS 고객에게 자동·무료로 적용되어 흔한 L3/L4 공격을 엣지에서 흡수한다. Shield Advanced는 유료 구독으로 더 큰 공격 대응, 애플리케이션 계층 통합, SRT(DRT) 지원, DDoS 비용 보호, 공격 가시성 메트릭을 더한다. 계층 분담이 반대로 서술된 보기나, 적용 리소스를 한정한 보기는 틀렸다.

---

**문제 2.** 애플리케이션이 HTTP GET flood(L7)를 받고 있다. 가장 직접적인 완화 수단은?

A) Shield Standard에 의존  
B) NACL로 포트 차단  
C) WAF rate-based rule로 IP/키별 요청 한도를 초과하는 소스를 차단  
D) EC2 인스턴스 타입을 키운다  

**정답: C**  
해설: L7 HTTP flood는 트래픽 양이 작아도 애플리케이션 자원을 고갈시키므로 정밀 필터링이 필요하고, WAF rate-based rule이 IP/커스텀 키별 요청률을 측정해 한도 초과 소스를 동적으로 차단한다. Shield Standard는 L3/L4가 주력이라 L7을 정밀 차단하지 못하고, NACL은 7계층 요청률을 모르며, 인스턴스 확장은 비용만 키우고 근본 완화가 아니다.

---

**문제 3.** DDoS 공격 중 Auto Scaling과 데이터 전송 급증으로 발생한 요금을 보전받고 싶다. 어떤 기능인가?

A) Shield Advanced의 Cost Protection(DDoS 비용 보호)  
B) AWS Budgets 알림  
C) Savings Plans  
D) Reserved Instances  

**정답: A**  
해설: Shield Advanced는 보호 등록된 리소스가 검증된 DDoS 공격으로 인해 스케일 아웃·데이터 전송이 급증해 발생한 요금에 대해 서비스 크레딧(Cost Protection)을 제공한다. Budgets는 알림일 뿐 환급이 아니고, Savings Plans·Reserved Instances는 일반 사용 요금 할인 약정으로 공격 비용 보전과 무관하다.

---

**문제 4.** CloudFront로 콘텐츠를 서빙 중인데 공격자가 오리진 ALB의 실제 IP로 직접 공격해 엣지 방어를 우회한다. 가장 적절한 대응 조합은?

A) Default Action을 Block으로 변경  
B) 오리진 Security Group을 CloudFront managed prefix list로 제한하고, CloudFront가 주입한 비밀 커스텀 헤더를 오리진/WAF가 검증해 직접 요청을 차단  
C) CloudFront를 제거하고 ALB만 사용  
D) Route 53 TTL을 0으로 설정  

**정답: B**  
해설: 엣지 우회의 근본 원인은 오리진이 직접 접근 가능하다는 것이다. 오리진 Security Group을 `com.amazonaws.global.cloudfront.origin-facing` prefix list로 제한해 CloudFront IP만 허용하고, CloudFront가 추가하는 비밀 헤더(예: X-Origin-Verify)를 오리진/WAF에서 검증하면 엣지를 우회한 직접 요청을 거른다. CloudFront 제거(C)는 흡수 방어를 버리는 것이고, Default Block·TTL 변경은 오리진 노출 문제를 해결하지 못한다.

---

**문제 5.** Shield Advanced에서 정상 트래픽 급증(예: 마케팅 캠페인)을 공격으로 오인해 과잉 완화하는 false positive를 줄이려 한다. 가장 효과적인 설정은?

A) 모든 알람 임계값을 최대로 올린다  
B) 보호 리소스에 Route 53 health check를 연동해 서비스 건강도 기반 탐지를 활성화한다  
C) WAF를 비활성화한다  
D) CloudFront를 끈다  

**정답: B**  
해설: Shield Advanced의 health-based detection은 Route 53 health check로 애플리케이션 건강도를 함께 판단한다. 트래픽이 늘어도 서비스가 건강하면 공격으로 단정하지 않아 정상 트래픽 급증에 대한 과잉 완화를 억제한다. 임계값을 무작정 올리면 진짜 공격을 놓치고, WAF·CloudFront 비활성화는 방어를 약화시키는 잘못된 방향이다.

---
