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

### 왜 계층 구분이 답을 결정하는가

세 유형의 공격은 *공격자가 무엇을 고갈시키려 하는가*로 갈린다. 이 자원이 다르면 방어 수단도 반드시 달라진다.

- **체적 공격은 대역폭을 고갈시킨다.** 초당 수백 기가비트가 회선을 채우면 서버가 아무리 건강해도 정상 패킷이 들어올 자리가 없다. 방어는 "더 굵은 파이프와 더 많은 입구"뿐이며, 이는 개별 고객이 살 수 있는 물건이 아니라 클라우드 사업자의 글로벌 네트워크가 제공하는 성질이다.
- **상태 고갈 공격은 연결 테이블을 고갈시킨다.** SYN flood는 대역폭을 거의 쓰지 않는다. 서버가 half-open 연결마다 메모리를 잡아 두는 성질을 악용해, 적은 트래픽으로 연결 테이블을 채워 버린다. 방어는 대역폭이 아니라 **상태를 만들지 않고 검증하는 기법**(SYN cookie)이다.
- **애플리케이션 공격은 처리 능력을 고갈시킨다.** 검색 쿼리 하나가 DB를 3초 붙잡는다면, 초당 100건이면 충분히 서비스를 멈출 수 있다. 트래픽 그래프만 보면 평범해 보인다는 점이 가장 위험하다. 방어는 **요청의 의미를 읽는 필터**(WAF)다.

```
[ 공격이 고갈시키는 자원과 방어의 위치 ]

  L3 체적          L4 상태 고갈           L7 애플리케이션
  ─────────        ────────────           ───────────────
  대역폭 소진       연결 테이블 소진        CPU·DB·스레드 소진
      │                  │                      │
      ▼                  ▼                      ▼
 [엣지 흡수]        [SYN cookie /          [WAF rate-based,
 anycast 분산        연결 상태 완화]         CAPTCHA, Bot Control]
      │                  │                      │
 Shield Standard가 자동 처리 ─────┘        Shield Advanced는
 (모든 고객, 무료)                          WAF를 "조율"할 뿐
                                            차단은 WAF가 한다
```

이 그림의 오른쪽 끝이 시험에서 가장 자주 나오는 함정 지점이다. **Shield는 L7을 "직접 차단"하지 않는다.** Shield Advanced는 L7 공격을 *탐지*하고 WAF 규칙을 *자동 생성·적용*하도록 조율하지만, 실제 요청을 거르는 주체는 언제나 WAF다. 그래서 "Shield Advanced만 켜면 HTTP flood가 막힌다"는 서술은 틀렸고, 정확히는 "Shield Advanced가 WAF와 결합되어 있어야 L7 자동 완화가 성립한다"가 맞다.

> 📚 **사례**: DDoS의 역사에서 반복되는 교훈은 "공격 규모는 항상 예상보다 크고, 표적은 서비스가 아니라 그 서비스가 의존하는 인프라"라는 것이다. 2016년 10월 Mirai 봇넷이 DNS 사업자 Dyn을 공격했을 때, 정작 접속이 끊긴 것은 Dyn을 쓰던 수많은 유명 서비스들이었다 — 웹 서버는 멀쩡했지만 이름을 해석할 수 없으니 사용자에게는 장애와 구분되지 않았다. 2018년 2월에는 인터넷에 노출된 memcached 서버를 반사·증폭기로 삼은 공격이 GitHub을 겨냥해 당시 최대 규모를 기록했고, 방어는 트래픽을 완화 서비스로 우회시켜 흡수하는 방식으로 이뤄졌다. 두 사건이 공통으로 말하는 바가 AWS Shield 설계의 전제다. 첫째, **의존하는 계층(DNS·CDN)이 곧 자신의 가용성 경계**다 — 그래서 Route 53과 CloudFront가 Shield의 1급 보호 대상이다. 둘째, **증폭 공격은 남의 서버를 빌려 오므로 공격자의 대역폭과 무관하게 커진다** — 그래서 개별 서버의 방어로는 원리적으로 감당할 수 없고 엣지 흡수가 유일한 답이 된다.

## Shield Standard: 자동·무료 베이스라인

Shield Standard는 별도 활성화 없이 모든 AWS 리소스에 적용된다. CloudFront, Route 53, Global Accelerator 같은 엣지 서비스 뒤에 있을 때 가장 강력하다 — 이들이 AWS 백본·엣지 네트워크에 직접 자리해 L3/L4 공격을 엣지에서 흡수하기 때문이다.

Shield Standard가 막는 것:
- SYN/UDP flood, reflection 공격 등 흔한 L3/L4 공격
- 알려진 악성 시그니처에 기반한 인라인 완화

Shield Standard가 *하지 않는* 것: L7 애플리케이션 공격의 정밀 필터링(이건 WAF의 몫), 공격 가시성 대시보드, 비용 보호, DRT 지원.

> 🔍 **더 깊이**: Shield Standard가 "무료"라는 말은 조금 오해를 부른다. 정확히는 **AWS 네트워크의 구조적 성질을 고객이 별도 비용 없이 누리는 것**에 가깝다. 엣지 로케이션이 전 세계에 흩어져 anycast로 같은 주소를 광고하고 있으면, 특정 지역에서 몰려온 공격 트래픽은 그 지역 엣지에서 소진되고 다른 지역 사용자는 아무 영향을 받지 않는다. 여기에 흔한 반사·증폭 패턴을 인라인으로 걸러 내는 완화 로직이 상시 동작한다. 그래서 같은 Shield Standard라도 **엣지 서비스 뒤에 있는 워크로드와, EC2에 EIP를 붙여 인터넷에 직접 노출한 워크로드는 실제 방어력이 전혀 다르다.** 후자는 anycast 분산의 혜택이 없고 단일 리전·단일 AZ의 용량이 곧 한계가 된다. "Shield는 자동으로 켜져 있으니 안전하다"가 아니라 **"아키텍처가 엣지 뒤에 있어야 Shield가 제 성능을 낸다"**가 맞는 문장이다. 시험이 DDoS 문제에서 거의 항상 CloudFront·Route 53·Global Accelerator를 정답 조합에 포함시키는 이유가 이것이다.

## Shield Advanced: 무엇이 더해지는가

Shield Advanced는 구독(계정/Organization 단위) 후 보호 대상 리소스를 명시적으로 등록한다. 보호 가능 리소스: CloudFront, Route 53 hosted zone, Global Accelerator accelerator, ALB/CLB, EIP(Elastic IP, 즉 EC2/NLB 등).

추가되는 핵심 가치:
1. **향상된 탐지·완화**: 애플리케이션 계층(L7)을 포함한 더 정교한 공격 탐지, 더 큰 공격 대응.
2. **DDoS Response Team(DRT)/Shield Response Team(SRT)**: 공격 중 전문가 지원. 사전에 IAM 역할(`AWSSRTAccess`)을 부여하면 SRT가 WAF 규칙을 대신 조정할 수 있다.
3. **Cost Protection(DDoS 비용 보호)**: 공격으로 인한 스케일 아웃·데이터 전송 급증 요금에 대한 서비스 크레딧.
4. **WAF 통합·요금 포함**: 보호 리소스에 대해 WAF 사용 요금이 Shield Advanced에 포함되고, 자동 애플리케이션 계층 완화(automatic application-layer DDoS mitigation)로 WAF 규칙을 자동 생성·적용할 수 있다.
5. **Global threat dashboard / 실시간 메트릭·이벤트**: `DDoSDetected`, `DDoSAttackBitsPerSecond` 등.
6. **Proactive engagement / Health-based detection**: Route 53 health check를 연동하면 false positive를 줄이고, 임계 시 SRT가 선제 연락.

### Standard와 Advanced를 한 표로

| 항목 | Shield Standard | Shield Advanced |
|------|-----------------|-----------------|
| 활성화 | 자동, 모든 고객 | **구독 필요**(계정/조직 단위, 약정 있음) |
| 요금 | 무료 | 월 구독료 + 데이터 전송 요금 |
| 보호 대상 | 모든 AWS 리소스(암묵적) | **명시적으로 등록한 리소스**(CloudFront, Route 53 hosted zone, Global Accelerator, ALB/CLB, EIP) |
| L3/L4 완화 | 흔한 공격 자동 완화 | 향상된 탐지, 더 큰 공격, 리소스별 맞춤 완화 |
| L7 대응 | **없음** | WAF 요금 포함 + 자동 애플리케이션 계층 완화(WAF 규칙 자동 생성) |
| 가시성 | 없음(리소스 자체 메트릭만) | 공격 이벤트·`DDoSDetected` 등 CloudWatch 메트릭, 글로벌 위협 대시보드 |
| 전문가 지원 | 없음(일반 Support) | SRT(Shield Response Team) 지원, proactive engagement |
| 비용 보호 | 없음 | **DDoS Cost Protection**(스케일·전송 급증분 크레딧) |
| 오탐 억제 | 없음 | Route 53 health check 연동 health-based detection |
| 다계정 운영 | 해당 없음 | Firewall Manager Shield Advanced 정책으로 일괄 적용 |

> ⚠️ **함정**: Shield Advanced는 **구독만 하면 자동으로 모든 리소스가 보호되는 것이 아니다.** 리소스를 `create-protection`으로 등록해야 향상된 완화·비용 보호·SRT 지원이 적용된다. "Shield Advanced를 구독했는데 공격 비용 크레딧을 못 받았다"의 가장 흔한 원인이 미등록이며, 이를 사람이 놓치지 않게 만드는 장치가 **Firewall Manager의 Shield Advanced 정책**이다(신규 리소스를 자동으로 보호 대상에 편입). 시험에서 "다계정 환경에서 새로 만들어지는 ALB도 빠짐없이 Shield Advanced 보호를 받게 하라"가 나오면 답은 Firewall Manager다.

```bash
# 1) 구독 (되돌리기 어려운 약정이므로 실제 운영에서는 신중히)
aws shield create-subscription

# 2) 보호 대상 등록 — 등록해야 비로소 Advanced의 혜택이 적용된다
aws shield create-protection \
  --name "prod-cloudfront" \
  --resource-arn arn:aws:cloudfront::111122223333:distribution/E123ABC

aws shield create-protection \
  --name "prod-alb" \
  --resource-arn arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:loadbalancer/app/prod-alb/abc123

# 3) 무엇이 보호되고 있는지 감사 — 등록 누락 점검의 첫 명령
aws shield list-protections \
  --query 'Protections[].{Name:Name,Resource:ResourceArn,Id:Id}'

# 4) 연관된 리소스를 하나의 애플리케이션으로 묶어 탐지 정확도를 높인다
aws shield create-protection-group \
  --protection-group-id prod-web \
  --aggregation SUM \
  --pattern BY_RESOURCE_TYPE \
  --resource-type APPLICATION_LOAD_BALANCER

# 5) SRT에게 대응 권한 위임 (사전에 해두지 않으면 공격 중에 할 수 없다)
aws shield associate-drt-role \
  --role-arn arn:aws:iam::111122223333:role/AWSSRTAccessRole

# 6) 사후 분석: 공격 이벤트 목록과 상세 벡터 조회
aws shield list-attacks \
  --start-time FromInclusive=2026-07-01T00:00:00Z \
  --end-time ToExclusive=2026-07-08T00:00:00Z \
  --query 'AttackSummaries[].{Id:AttackId,Resource:ResourceArn,Start:StartTime,Vectors:AttackVectors[].VectorType}'

aws shield describe-attack --attack-id abcd-1234 \
  --query '{Vectors:AttackProperties,Counters:AttackCounters,Mitigations:Mitigations}'
```

**Protection Group**은 시험에서 자주 스쳐 지나가지만 실무 의미가 크다. 하나의 애플리케이션이 ALB 하나로만 이뤄지는 경우는 드물고, CloudFront + ALB + EIP 여러 개가 함께 서비스를 구성한다. 이들을 개별 리소스로만 보면 각각의 트래픽 변동이 작아 탐지 임계에 못 미칠 수 있지만, **묶어서 합산(SUM)하면 애플리케이션 전체에 가해지는 압력이 보인다.** 반대로 리소스가 갑자기 늘어나는 자동 확장 환경에서는 `BY_RESOURCE_TYPE` 패턴으로 "새로 생기는 ALB도 자동으로 이 그룹에 포함"시켜 관리 누락을 막는다.

SRT에게 권한을 위임하는 역할은 신뢰 정책이 Shield 서비스 주체를 향해야 한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "drt.shield.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

> ⚠️ **함정**: SRT 위임은 **공격이 시작된 뒤에 준비하면 늦다.** 역할 생성·신뢰 정책·비상 연락처 등록은 평시에 끝내 두어야 하며, 공격 한복판에서 IAM 역할을 만들고 있으면 그 시간만큼 서비스가 멈춘다. 같은 논리가 WAF에도 적용된다 — SRT가 대신 조정할 WAF Web ACL이 *이미 존재하고 로깅이 켜져 있어야* 분석과 조치가 가능하다. **사고 대응 능력은 사고 전에 만들어 두는 것이지 사고 중에 획득하는 것이 아니다.**

> 🎯 **시나리오**: "공격 중 발생한 Auto Scaling 비용·데이터 전송 폭증 요금을 환급받고 싶다"는 시험 빈출. 정답은 Shield Advanced의 **Cost Protection** — 보호 등록된 리소스가 DDoS로 인해 스케일하며 발생한 요금에 대해 크레딧을 신청할 수 있다. Shield Standard에는 이 보호가 없다.

## L7 방어는 결국 WAF의 일

Shield Advanced가 L7을 "다룬다"고 해서 WAF를 대체하는 것이 아니다. 정밀한 애플리케이션 계층 차단은 여전히 WAF 규칙(rate-based, managed group, CAPTCHA)이 수행하고, Shield Advanced는 이를 *조율·자동화·지원*한다.

- HTTP flood → WAF rate-based rule로 IP/키별 한도 초과 차단
- 의심 봇 → CAPTCHA/Challenge 또는 Bot Control
- 자동 application-layer 완화 활성화 시, Shield가 공격 패턴을 분석해 임시 WAF 규칙을 자동 적용(`Count` 먼저 → `Block`)

> ⚠️ **함정**: "L7 DDoS를 Shield Standard로 막는다"는 오답 보기로 자주 나온다. Shield Standard는 L3/L4가 주력이고, L7 애플리케이션 공격의 정밀 완화는 WAF(또는 Shield Advanced의 WAF 통합)가 담당한다. 시험에서 "HTTP flood / GET flood 완화"가 나오면 WAF rate-based rule을 먼저 떠올려야 한다.

L7 flood를 막는 실물 규칙은 이런 모양이다. 전역 한도와 소스별 한도를 **두 층으로 겹치는** 것이 요령이다.

```json
{
  "Rules": [
    {
      "Name": "PerIPBurst",
      "Priority": 5,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 1000,
          "EvaluationWindowSec": 60,
          "AggregateKeyType": "FORWARDED_IP",
          "ForwardedIPConfig": { "HeaderName": "X-Forwarded-For", "FallbackBehavior": "MATCH" }
        }
      },
      "Action": { "Block": { "CustomResponse": { "ResponseCode": 429 } } },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "PerIPBurst" }
    },
    {
      "Name": "GlobalSurgeChallenge",
      "Priority": 6,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 50000,
          "EvaluationWindowSec": 60,
          "AggregateKeyType": "CONSTANT",
          "ScopeDownStatement": {
            "NotStatement": {
              "Statement": {
                "ByteMatchStatement": {
                  "FieldToMatch": { "UriPath": {} },
                  "PositionalConstraint": "STARTS_WITH",
                  "SearchString": "/static/",
                  "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
                }
              }
            }
          }
        }
      },
      "Action": { "Challenge": {} },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "GlobalSurge" }
    }
  ]
}
```

두 규칙이 서로 다른 실패 모드를 덮는다. 첫 규칙은 **소수의 IP가 과하게 때리는 경우**를 소스별로 잘라 내지만, 수만 개의 IP가 각각 조금씩 보내는 분산 공격에는 아무도 한도를 넘지 않아 무력하다. 두 번째 규칙은 `CONSTANT` 키로 **엔드포인트 전체의 총 유입량**을 보므로 분산 공격에도 반응한다. 다만 전역 한도를 Block으로 걸면 정상 사용자까지 잘리므로 액션을 `Challenge`로 두어, 진짜 브라우저는 조용히 통과하고 자동화 도구만 걸러지게 한다. **"소스별 Block + 전역 Challenge"의 2단 구성**은 실무에서 반복해서 쓰이는 형태다.

> ⚠️ **함정**: CloudFront 뒤의 ALB에 붙은 WAF에서 `AggregateKeyType: IP`를 쓰면 **모든 요청이 CloudFront 엣지 IP로 집계**되어 속도 규칙이 사실상 전역 한도처럼 동작한다. 이때는 `FORWARDED_IP`와 `ForwardedIPConfig`를 지정해 `X-Forwarded-For`의 원 클라이언트 IP를 기준으로 삼아야 한다. 반대로 프록시 뒤가 아닌데 `FORWARDED_IP`를 쓰면 헤더를 공격자가 임의로 위조해 한도를 무한히 회피할 수 있다 — **XFF는 신뢰할 수 있는 프록시가 앞에 있을 때만 신뢰한다**는 원칙이 여기에도 그대로 적용된다.

## CloudFront·Route 53·Global Accelerator와의 결합: 방어선을 엣지로

DDoS 방어의 아키텍처 원칙은 *공격을 오리진에서 최대한 멀리, 엣지에서 흡수*하는 것이다.

- **CloudFront**: 정적·동적 콘텐츠를 엣지에서 서빙하면 L3/L4 공격이 엣지 네트워크에 분산 흡수된다. 오리진은 CloudFront 뒤에 숨고, 오리진 직접 접근을 차단(OAC + Security Group/prefix list)하면 공격 표면이 줄어든다.
- **Route 53**: 관리형 DNS는 anycast로 전 세계에 분산되어 DNS 계층 공격에 강하다. Shield로 보호되며 DNS flood를 흡수한다.
- **Global Accelerator**: AWS 글로벌 네트워크의 anycast IP로 진입점을 고정·분산. 정적 IP 2개 뒤로 트래픽을 흡수하고 가까운 엣지로 라우팅한다.

```
[ 계층별 방어 배치 — 공격은 왼쪽에서 오고, 방어선은 오른쪽으로 갈수록 좁아진다 ]

                L3/L4 체적·상태 고갈             L7 애플리케이션
                        │                              │
 인터넷 ──┬─→ [Route 53 anycast DNS] ─── Shield로 DNS flood 흡수
          │        (이름 해석 계층)
          │
          └─→ [Global Accelerator / CloudFront 엣지]
                   ├── Shield Standard: 흔한 L3/L4 자동 완화
                   ├── Shield Advanced: 향상된 탐지 + 비용 보호 + SRT
                   └── WAF(CLOUDFRONT scope): SQLi/XSS, rate-based, Bot/CAPTCHA  ← L7은 여기서
                          │
                          │  ※ 오리진 잠금이 없으면 이 아래로 우회 경로가 생긴다
                          ▼
              [ALB]  ── SG = CloudFront managed prefix list
                     ── X-Origin-Verify 비밀 헤더 검증
                          │
                          ▼
                    [EC2 / 컨테이너 / Lambda]
                          │
                          ▼
                    [RDS / DynamoDB]  ← 여기까지 도달한 공격은 이미 방어 실패

  핵심: 방어의 성패는 "가장 앞에서 얼마나 싸게 거르는가"와
        "앞을 건너뛸 경로가 없는가" 두 가지로 결정된다.
```

> 💡 **관련 이론**: 엣지 흡수 전략은 *anycast*의 성질을 활용한다. 동일한 IP를 전 세계 다수 엣지가 광고하면, BGP가 출발지에서 가장 가까운 엣지로 트래픽을 라우팅한다. 공격 트래픽도 자연히 여러 엣지로 분산되어 단일 지점에 집중되지 않는다. "공격을 막는다"기보다 "공격을 흩뿌려 희석한다"는 발상이다. 그래서 오리진을 엣지 뒤에 숨기는 것이 방어의 출발점이다.

## 오리진 노출이라는 약점

CloudFront로 콘텐츠를 서빙해도 공격자가 오리진의 실제 IP/도메인을 알아내면 엣지를 우회해 직접 공격할 수 있다. 방어:
- 오리진(ALB/EC2) Security Group을 **CloudFront managed prefix list**(`com.amazonaws.global.cloudfront.origin-facing`)로 제한해 CloudFront IP만 허용.
- 커스텀 헤더(`X-Origin-Verify`)를 CloudFront가 주입하고 오리진/ALB·WAF가 이를 검증해, 헤더 없는 직접 요청을 차단.
- 오리진 도메인을 추측 어려운 이름으로 두고 DNS에 노출하지 않음.

```bash
# CloudFront 오리진 전용 prefix list ID 조회 → SG 규칙에 사용
aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[].{Id:PrefixListId,Name:PrefixListName}'

# 오리진 ALB의 보안 그룹을 CloudFront 대역으로만 제한
aws ec2 authorize-security-group-ingress \
  --group-id sg-0abc123 \
  --ip-permissions 'IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=pl-3b927c52}]'

# CloudFront가 오리진에 비밀 헤더를 주입하도록 설정된 배포인지 확인
aws cloudfront get-distribution-config --id E123ABC \
  --query 'DistributionConfig.Origins.Items[].{Domain:DomainName,CustomHeaders:CustomHeaders.Items[].HeaderName}'
```

> 🔍 **더 깊이**: 오리진 은닉에서 가장 자주 간과되는 누출 경로는 **과거의 DNS 기록과 인증서 투명성(CT) 로그**다. CloudFront를 도입하기 전 `origin.example.com`이 공개 DNS에 있었다면 그 기록은 여러 수동 DNS 데이터베이스에 남아 있고, 오리진용으로 발급한 공개 인증서는 CT 로그에 도메인 이름이 영구히 기록된다. 즉 **오리진 도메인을 "추측하기 어렵게" 짓는 것은 이미 한 번 노출된 이름에는 소급 적용되지 않는다.** 그래서 은닉은 보조 수단일 뿐이고, 실제로 방어를 성립시키는 것은 **prefix list로 네트워크 경로를 좁히고 비밀 헤더로 요청을 인증하는 두 가지 강한 통제**다. 비밀 헤더 값도 Secrets Manager에 두고 주기적으로 교체하지 않으면 로그·설정 유출 시 그대로 재사용된다.

> 🎯 **시나리오**: "CloudFront와 WAF를 배치했는데도 애플리케이션이 계속 L7 flood로 다운된다. 조사해 보니 공격 트래픽이 CloudFront 로그에는 거의 나타나지 않는다"가 나오면, 원인은 규칙이 아니라 **경로**다. 공격자가 오리진 ALB의 DNS 이름이나 IP로 직접 때리고 있으므로 엣지 통제 전체가 무의미해진 상황이다. 정답은 규칙을 더 조이는 것이 아니라 **오리진을 CloudFront 전용 prefix list + 비밀 헤더 검증으로 잠그는 것**이다. "WAF 규칙을 강화한다"는 보기는 문제의 원인을 건드리지 못하므로 오답이다.

## 가시성·대응 메트릭

Shield Advanced는 CloudWatch에 공격 메트릭을 제공한다: `DDoSDetected`(0/1), `DDoSAttackBitsPerSecond`, `DDoSAttackPacketsPerSecond`, `DDoSAttackRequestsPerSecond`. 이를 알람으로 묶어 SNS·SRT proactive engagement와 연동한다. Shield는 또한 공격 이벤트의 시작/종료·완화 내역을 이벤트로 기록해 사후 분석을 돕는다.

> 🔍 **더 깊이**: Shield Advanced의 *Route 53 health check 기반 탐지*는 false positive를 줄이는 영리한 메커니즘이다. 단순히 트래픽 급증을 공격으로 보면 정상 캠페인 트래픽까지 완화 대상이 된다. 하지만 애플리케이션의 health check가 정상이면 "트래픽은 늘었지만 서비스는 건강하다"고 판단해 과잉 완화를 억제한다. 즉 *부하 자체*가 아니라 *서비스 건강도 저하*를 공격 신호로 본다.

### 자동 L7 완화도 Count부터 시작한다

Shield Advanced의 자동 애플리케이션 계층 완화를 켜면, Shield가 공격 패턴을 분석해 WAF 규칙을 자동으로 만들어 붙인다. 이때 모드를 두 가지 중에 고른다.

| 모드 | 동작 | 언제 쓰나 |
|------|------|-----------|
| `COUNT` | 자동 생성된 규칙이 **차단하지 않고 기록만** 한다 | 도입 초기. Shield가 무엇을 위험하다고 보는지 관측 |
| `BLOCK` | 자동 생성된 규칙이 즉시 차단한다 | 관측으로 신뢰가 쌓인 뒤. 야간·주말 무인 대응이 필요할 때 |

```bash
# 자동 L7 완화를 먼저 관측 모드로 켠다
aws shield enable-application-layer-automatic-response \
  --resource-arn arn:aws:cloudfront::111122223333:distribution/E123ABC \
  --action '{"Count":{}}'

# 신뢰가 쌓이면 차단으로 전환
aws shield update-application-layer-automatic-response \
  --resource-arn arn:aws:cloudfront::111122223333:distribution/E123ABC \
  --action '{"Block":{}}'
```

여기서 1일차와 똑같은 절차가 반복된다는 점을 놓치지 말자 — **관측(Count) → 데이터 확인 → 차단(Block) 전환.** 자동화가 사람을 대신하는 상황일수록 이 순서가 더 중요하다. 사람이 만든 규칙은 오탐이 나면 만든 사람이 알아채지만, 자동 생성된 규칙이 새벽에 정상 트래픽을 차단하면 아침이 되어서야 발견된다. 그래서 자동 완화를 Block으로 두는 조직은 반드시 `BlockedRequests` 급증 알람과 롤백 절차를 함께 갖춰야 한다.

> ⚠️ **함정**: 자동 애플리케이션 계층 완화는 **보호 리소스에 WAF Web ACL이 이미 연결되어 있어야** 활성화된다. Shield는 자기만의 별도 차단 엔진을 갖고 있지 않고 WAF의 규칙 슬롯을 빌려 쓰기 때문이다. "Shield Advanced를 켰는데 자동 L7 완화가 활성화되지 않는다"의 전형적 원인이며, 이 사실 하나가 **Shield와 WAF의 역할 분담**을 가장 명확하게 보여 준다.

## 정리하며

Shield를 이해하는 열쇠는 서비스 기능 목록이 아니라 **"공격이 무엇을 고갈시키는가"라는 질문**이다. 이 질문에 답하면 나머지는 따라온다.

대역폭과 연결 테이블을 노리는 L3/L4 공격은 개별 고객이 방어할 수 있는 종류의 문제가 아니다. 그래서 AWS는 이 방어를 네트워크의 성질로 만들어 모든 고객에게 자동 제공한다(Shield Standard). 다만 그 성질을 온전히 누리려면 워크로드가 **엣지 뒤에** 있어야 한다 — Route 53, CloudFront, Global Accelerator가 DDoS 문제의 정답에 거의 항상 등장하는 이유다.

처리 능력을 노리는 L7 공격은 트래픽 양으로 구분되지 않으므로 **요청의 의미를 읽어야** 한다. 이 일은 WAF의 몫이고 Shield는 그것을 조율할 뿐이다. "Shield Advanced가 L7을 막는다"가 아니라 "Shield Advanced가 WAF를 통해 L7을 막는다"가 정확한 문장이며, 이 한 글자 차이가 시험의 오답 보기를 만들어 낸다.

Shield Advanced가 유료 구독임에도 선택되는 이유는 완화 성능만이 아니다. **공격 중에 기댈 사람(SRT), 공격 후에 남는 청구서에 대한 보호(Cost Protection), 공격을 설명할 수 있는 데이터(공격 이벤트·메트릭)** — 이 셋은 기술적 차단만큼이나 실무에서 무겁다. 그리고 이 셋 모두 **평시에 등록·위임·연락처 설정을 마쳐 두어야** 작동한다.

마지막으로, 아무리 좋은 방어선도 **건너뛸 수 있으면 없는 것과 같다.** 오리진이 인터넷에 그대로 노출되어 있으면 엣지의 흡수도 WAF의 필터도 무의미해진다. 그래서 DDoS 방어의 마지막 항목은 언제나 "오리진을 잠갔는가"이며, 이것이 4일차 경계 아키텍처로 이어지는 다리다.

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
