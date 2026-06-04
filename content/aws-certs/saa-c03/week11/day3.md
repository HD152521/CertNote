# Day 53 - DNS는 어떻게 "이름 한 번 묻는 것"으로 글로벌 트래픽을 조종하나

페일오버를 아무리 정교하게 설계해도, 마지막 1km에서 사용자를 새 리전으로 실제로 보내는 건 결국 **DNS**다. 사용자의 브라우저가 `api.example.com`을 IP로 바꾸는 그 한 번의 질의가, 어느 리전·어느 인스턴스로 트래픽이 흐를지를 결정한다. Route 53이 단순한 이름-IP 변환기를 넘어 "글로벌 트래픽 컨트롤 플레인"이 된 건, DNS 응답을 **위치·지연·가중치·건강 상태**에 따라 동적으로 바꿀 수 있게 만들었기 때문이다. 이 글은 DNS의 작동 원리부터 Route 53의 7가지 라우팅 정책, Health Check의 내부 동작, 그리고 Alias·Private Hosted Zone·DNSSEC가 어떻게 안전하고 유연한 라우팅을 떠받치는지를 따라간다.

먼저 DNS의 본질을 짚어야 한다. DNS는 1983년 RFC 882/883(후에 RFC 1034/1035로 표준화)에서 정의된, 인터넷에서 가장 오래되고 가장 널리 쓰이는 분산 데이터베이스다. 핵심 설계는 **계층적 위임**이다 — 루트(.) → TLD(.com) → 권한 네임서버(example.com)로 책임이 단계적으로 위임되고, 각 단계는 자기 아래만 안다. 그리고 성능을 위해 모든 응답에 **TTL(Time To Live)**이 붙어 리졸버가 그 시간만큼 결과를 캐싱한다. 바로 이 TTL과 캐싱이 DNS 기반 페일오버의 속도를 좌우하는 핵심 변수다 — 앞서 RDS 페일오버에서 봤듯, 캐시가 오래 살아 있으면 죽은 곳을 계속 가리킨다.

## 라우팅 정책 7종은 "어떤 신호로 답을 고르는가"로 갈린다

Route 53의 7가지 라우팅 정책은 외울 목록이 아니라, **"DNS 응답을 무엇을 기준으로 결정하는가"**라는 한 질문의 일곱 답이다. 각 정책이 어떤 신호를 보는지 알면 시나리오 매핑이 자동으로 된다.

| 정책 | 결정 신호 | 대표 용도 |
|------|----------|----------|
| **Simple** | 없음(고정 응답) | 단일 리소스 |
| **Weighted** | 미리 정한 가중치 | 카나리/A·B 테스트 |
| **Latency** | 사용자→리전 네트워크 지연 | 글로벌 최저 지연 |
| **Failover** | Health Check 결과 | Active-Passive DR |
| **Geolocation** | 사용자의 지리적 위치 | 규제·언어별 콘텐츠 |
| **Geoproximity** | 위치 + bias 조절 | 리전 간 트래픽 비중 미세 조정 |
| **Multi-value Answer** | Health Check + 무작위 | 소규모 DNS 라운드로빈 |

핵심 구분이 몇 개 있다. **Latency vs Geolocation**이 가장 헷갈리는데, Latency는 "가장 빠른(지연 낮은) 리전"으로 보내고 Geolocation은 "사용자가 어느 나라·대륙에 있는가"로 보낸다. 둘은 종종 다른 결과를 낸다 — 국경 근처 사용자는 지리적으론 A국이지만 네트워크 경로상 B국 리전이 더 빠를 수 있다. "빠른 응답"이면 Latency, "이 나라 사용자에겐 이 콘텐츠(GDPR·언어·라이선스)"면 Geolocation이다. **Geoproximity**는 Geolocation의 정밀판으로, 단순 위치가 아니라 거리를 계산하고 **bias**로 "이 리전이 더 넓은 영역을 끌어가게" 조절한다 — Traffic Flow의 시각적 편집기에서 주로 쓴다.

> 💡 **관련 이론**: Weighted 라우팅은 분산 시스템의 **점진적 롤아웃(progressive delivery)**을 DNS 계층에서 구현한 것이다. 새 버전에 가중치 10을 주고 기존에 90을 주면, 질의의 약 10%가 새 버전으로 가는 카나리 배포가 된다. 이는 "한 번에 전부 바꾸지 말고 작게 노출해 문제를 조기에 잡는다"는 신뢰성 공학의 원리다. 다만 DNS 가중치는 **요청 단위가 아니라 질의(resolution) 단위 + TTL 캐싱**으로 동작해 정밀하지 않다 — 한 번 10%로 해석된 클라이언트는 TTL 동안 계속 새 버전을 본다. 그래서 진짜 세밀한 카나리(요청 1%, 헤더 기반)는 ALB 가중 타깃 그룹이나 App Mesh 같은 애플리케이션 계층에서 하고, DNS Weighted는 리전·스택 단위의 굵은 분배에 쓰는 게 실무 구분이다.

> ⚠️ **함정**: Geolocation에는 **기본(default) 위치 레코드**를 반드시 둬야 한다. 어떤 위치 규칙에도 매칭되지 않는 사용자(예: 위치를 알 수 없거나 규칙에 없는 지역)는 default 레코드로 가는데, 이게 없으면 그 사용자는 **응답을 못 받아 접속 자체가 실패**한다. 시험에서 "일부 지역 사용자만 사이트에 접속 못 한다"는 Geolocation 시나리오가 나오면 default 레코드 누락이 단골 정답이다.

## Health Check는 어떻게 죽은 곳을 응답에서 빼나

Failover와 Multi-value의 동작은 **Health Check** 위에 서 있다. Route 53은 전 세계 여러 위치의 헬스 체커들이 대상 엔드포인트를 주기적으로(기본 30초, fast는 10초) 찔러 보고, 정해진 비율 이상이 성공해야 "정상"으로 판정한다. 비정상으로 판정되면 그 레코드를 DNS 응답에서 자동으로 빼므로, 사용자는 죽은 엔드포인트를 받지 않는다.

Health Check에는 세 종류가 있다. **엔드포인트 모니터링**(HTTP/HTTPS/TCP로 직접 찌름), **CloudWatch Alarm 기반**(알람 상태를 헬스로 변환 — 외부에서 직접 찌를 수 없는 사설 리소스나 복합 지표에 유용), **Calculated**(여러 헬스 체크를 AND/OR로 조합 — "DB와 캐시가 둘 다 살아야 정상" 같은 논리). 이 조합 능력 덕에 단순 핑을 넘어 "애플리케이션이 진짜 서비스 가능한 상태인가"를 표현할 수 있다.

> 🔍 **더 깊이**: Health Check에서 **헬스 체커의 분산**이 오탐(false positive)을 막는 핵심이다. 전 세계 여러 위치에서 동시에 찌르고 다수결(기본 18% 이상 성공)로 판정하기 때문에, 한 네트워크 경로의 일시적 깜빡임이 곧장 페일오버로 이어지지 않는다. 또 **String Matching**을 켜면 단순 200 응답이 아니라 응답 본문에 특정 문자열(예: `"status":"healthy"`)이 있는지까지 확인해, "서버는 200을 주지만 실제로는 DB 연결이 끊긴" 좀비 상태를 잡아낸다. 한 발 더 나아간 패턴이 **딥 헬스 체크(deep health check)** — `/health` 엔드포인트가 DB·캐시·다운스트림 의존성까지 확인하게 만드는 것이다. 다만 너무 깊으면 다운스트림 하나의 깜빡임에 전체가 비정상 판정돼 **연쇄 페일오버**를 일으킬 수 있어, 의존성의 임계성에 따라 얕은/깊은 체크를 나누는 게 실무 균형이다.

> 📚 **사례**: 2016년 10월 21일 DNS 제공업체 **Dyn**이 대규모 DDoS 공격을 받아 Twitter·Netflix·Spotify·GitHub 등 수많은 서비스가 동시에 접속 불능이 됐다. 공격은 IoT 기기(보안 카메라·DVR)를 감염시킨 Mirai 봇넷이 Dyn의 권한 네임서버를 초당 수천만 질의로 마비시킨 것이었다. 핵심 교훈은 **DNS가 단일 장애점(SPOF)이 될 수 있다**는 점이다 — 애플리케이션 인프라가 멀티 리전으로 완벽해도, 이름을 풀어 줄 DNS가 죽으면 아무도 도달하지 못한다. 이후 많은 기업이 **DNS 다중화**(여러 DNS 제공업체에 같은 존을 두는 방식)를 도입했고, AWS Route 53은 100% 가용성 SLA를 내건 거의 유일한 AWS 서비스다 — 애니캐스트로 전 세계에 분산돼 단일 지점 공격에 견디도록 설계됐다. DNS는 아키텍처에서 가장 자주 잊히지만 가장 치명적인 의존성이다.

## Alias 레코드와 CNAME: 루트 도메인의 오랜 제약

DNS의 표준에는 한 가지 까다로운 제약이 있다. **CNAME 레코드는 도메인의 최상위(zone apex, 즉 `example.com` 자체)에 둘 수 없다**. RFC상 zone apex에는 SOA·NS 같은 필수 레코드가 있어야 하는데, CNAME은 "이 이름의 모든 레코드를 다른 이름으로 대체"하라는 의미라 그 필수 레코드들과 충돌하기 때문이다. 그래서 표준 DNS로는 `www.example.com`은 CNAME으로 ALB나 CloudFront를 가리킬 수 있어도, `example.com`(루트)은 불가능했다.

Route 53의 **Alias 레코드**가 이 제약을 우회한다. Alias는 AWS 전용 확장으로, A/AAAA 레코드처럼 동작하면서도 값으로 AWS 리소스(ALB·CloudFront·S3 웹사이트·API Gateway·VPC 엔드포인트 등)를 가리킨다 — Route 53이 질의 시점에 그 리소스의 실제 IP를 채워 응답한다. 덕분에 **루트 도메인도 ALB에 연결**할 수 있고, CNAME과 달리 **무료**이며(CNAME 질의는 추가 라운드트립이 들지만 Alias는 Route 53이 내부에서 해결), TTL도 AWS가 관리한다. 또 `EvaluateTargetHealth`를 켜면 Alias가 가리키는 리소스의 헬스까지 평가에 반영된다.

> ⚠️ **함정**: "루트 도메인(example.com)을 ALB/CloudFront에 연결하라"가 보이면 답은 **Alias**다. CNAME을 고르면 zone apex 제약 때문에 틀린다. 반대로 서브도메인(www·api)이라면 CNAME도 기술적으로 가능하지만, AWS 리소스를 가리킬 땐 무료이고 헬스 평가가 되는 Alias가 거의 항상 더 낫다. "루트 도메인 + AWS 리소스" = Alias라는 반사가 시험에서 점수를 지킨다.

## Private Hosted Zone, Resolver, DNSSEC: 경계와 신뢰

Route 53은 공개 인터넷뿐 아니라 **VPC 내부 전용 DNS**도 제공한다. **Private Hosted Zone(PHZ)**은 특정 VPC들 안에서만 해석되는 이름 공간으로, 내부 서비스에 `db.internal.example.com` 같은 사설 이름을 붙인다 — 같은 이름이 인터넷에는 노출되지 않는다. 여러 VPC를 한 PHZ에 연결할 수 있어 멀티 VPC 환경의 내부 서비스 디스커버리에 쓴다.

온프레미스와 AWS의 DNS를 잇는 건 **Route 53 Resolver Endpoint**다. **Inbound Endpoint**는 온프레미스가 AWS의 사설 이름을 해석하게 해 주고(온프레→AWS 방향 질의), **Outbound Endpoint**는 AWS의 리소스가 온프레미스 DNS 이름을 해석하게 해 준다(AWS→온프레 방향, 조건부 포워딩 규칙 사용). 이 두 엔드포인트가 하이브리드 환경의 양방향 이름 해석을 완성한다.

마지막으로 **DNSSEC**는 DNS 응답의 **무결성**을 지킨다. 본래 DNS는 응답이 진짜 권한 서버에서 왔는지 검증할 수단이 없어 **캐시 포이즈닝(DNS 스푸핑)** 공격 — 가짜 응답을 캐시에 심어 사용자를 악성 사이트로 보내는 — 에 취약했다. DNSSEC는 각 응답에 공개키 암호화 서명을 붙여 리졸버가 "이 응답이 변조되지 않았고 진짜 권한 서버 것"임을 검증하게 한다. Route 53에서 DNSSEC를 쓰려면 **Hosted Zone의 서명 활성화**와 **도메인 등록자(Registrar) 측 DS 레코드 등록**이 둘 다 필요하다 — 한쪽만 하면 신뢰 체인이 끊긴다.

> 💡 **관련 이론**: DNSSEC가 푸는 문제는 보안의 **CIA 삼각형(기밀성·무결성·가용성)** 중 **무결성(Integrity)**이다. 흔한 오해가 "DNSSEC가 DNS 질의를 암호화한다"인데, 그렇지 않다 — DNSSEC는 응답을 **서명**해 변조를 탐지할 뿐, 질의·응답 내용은 여전히 평문이라 누가 무엇을 묻는지는 노출된다(기밀성은 별개로 DoH/DoT가 담당). 이는 RFC 4033~4035에 정의된 표준이고, 신뢰의 출발점은 루트 존의 키(IANA가 관리하는 키 서명 의식, Root Zone KSK Ceremony)에서 시작해 TLD·도메인으로 내려오는 **신뢰 체인(chain of trust)**이다. Route 53에서 Hosted Zone 서명과 Registrar DS 등록을 둘 다 해야 하는 이유가 바로 이 체인을 끊김 없이 잇기 위해서다.

## 다른 클라우드의 DNS·트래픽 라우팅 비교

| 구분 | AWS | Azure | GCP |
|------|-----|-------|-----|
| 권한 DNS | Route 53 | Azure DNS | Cloud DNS |
| 글로벌 트래픽 라우팅 | Route 53 라우팅 정책 | Traffic Manager(DNS) + Front Door(L7) | Cloud Load Balancing(애니캐스트 IP) |
| 라우팅 방식 | DNS 응답 조작(클라이언트가 해석) | DNS 기반(Traffic Manager) | 단일 애니캐스트 IP(BGP) |
| Zone apex 처리 | Alias 레코드 | Alias 레코드 | (Cloud DNS는 apex A 지원) |

가장 근본적인 차이는 **라우팅을 DNS에서 하느냐, 네트워크에서 하느냐**다. AWS Route 53과 Azure Traffic Manager는 **DNS 응답을 바꿔** 클라이언트를 다른 엔드포인트로 보낸다 — 단순하지만 TTL 캐싱 때문에 전환이 즉각적이지 않다. 반면 GCP의 글로벌 로드밸런서는 **단일 애니캐스트 IP**를 쓰고 BGP로 가장 가까운 구글 엣지로 트래픽을 끌어, DNS 캐싱과 무관하게 네트워크 계층에서 라우팅한다 — AWS에서 이에 대응하는 게 Global Accelerator(애니캐스트 IP)다. "DNS 캐싱으로 페일오버가 느리다"가 문제라면 DNS 정책 대신 애니캐스트 기반(Global Accelerator)을 고려하라는 신호다.

## CLI로 직접 만져보기

```bash
# Alias 레코드: 루트 도메인을 CloudFront에 연결
aws route53 change-resource-record-sets --hosted-zone-id ZXYZ \
  --change-batch '{"Changes":[{
    "Action":"UPSERT",
    "ResourceRecordSet":{
      "Name":"example.com.","Type":"A",
      "AliasTarget":{"HostedZoneId":"Z2FDTNDATAQYW2",
        "DNSName":"d123.cloudfront.net.","EvaluateTargetHealth":true}
    }}]}'

# Health Check: HTTPS + 응답 본문 문자열 매칭
aws route53 create-health-check --caller-reference hc-1 \
  --health-check-config 'Type=HTTPS_STR_MATCH,FullyQualifiedDomainName=api.example.com,Port=443,ResourcePath=/health,SearchString=healthy'

# Failover 레코드(Primary): 헬스 체크 연동
aws route53 change-resource-record-sets --hosted-zone-id ZXYZ \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{
    "Name":"app.example.com.","Type":"A","SetIdentifier":"primary",
    "Failover":"PRIMARY","HealthCheckId":"hc-1",
    "AliasTarget":{"HostedZoneId":"Z35...","DNSName":"alb-a...","EvaluateTargetHealth":true}}}]}'

# Private Hosted Zone 생성 (VPC 내부 전용)
aws route53 create-hosted-zone --name internal.example.com \
  --caller-reference phz-1 \
  --vpc VPCRegion=ap-northeast-2,VPCId=vpc-0abc \
  --hosted-zone-config PrivateZone=true
```

## 정리하며

Route 53은 "이름 한 번 묻는 것"을 글로벌 트래픽 조종 장치로 바꾼다. ① **7가지 라우팅 정책**은 "응답을 무엇으로 결정하나"의 일곱 답이고, Latency(속도)·Geolocation(위치·규제)·Weighted(카나리)·Failover(DR)의 구분이 핵심이며 Geolocation은 default 레코드가 없으면 일부 사용자가 끊긴다. ② **Health Check**는 분산 헬스 체커의 다수결로 죽은 엔드포인트를 응답에서 빼고, String Matching·Calculated로 좀비 상태와 복합 의존성까지 표현하되 과도한 딥 체크는 연쇄 페일오버를 부른다. ③ **Alias**는 zone apex의 CNAME 제약을 우회해 루트 도메인을 AWS 리소스에 무료로 연결한다. ④ **Private Hosted Zone + Resolver Endpoint**가 하이브리드 DNS를, **DNSSEC**가 캐시 포이즈닝을 막는 무결성을 제공한다. Dyn 사고가 보여줬듯 DNS는 가장 자주 잊히는 SPOF이고, 시험은 키워드를 정책·레코드 타입에 매핑하는 능력을 묻는다.

다음 글에서는 이렇게 라우팅까지 갖춘 클라우드로 **데이터와 워크로드를 실제로 옮기는 마이그레이션 도구들** — DMS·SCT·Snow Family·DataSync·MGN을 본다.

---

## 📝 연습 문제

**문제 1.** 한 글로벌 SaaS가 전 세계 사용자에게 **네트워크 지연이 가장 낮은 리전**으로 트래픽을 보내려 한다. 가장 적절한 Route 53 라우팅 정책은?

A) Geolocation
B) Latency
C) Weighted
D) Simple

**정답: B**

해설: Latency 라우팅은 사용자에서 각 리전까지의 실제 네트워크 지연을 측정해 가장 빠른 리전으로 보낸다. Geolocation(A)은 사용자의 지리적 위치로 보내는데, 국경 근처에서는 지리적으로 가까운 리전이 네트워크상 더 느릴 수 있어 "최저 지연"을 보장하지 못한다. Weighted(C)는 가중치 분배(카나리·테스트)용이고, Simple(D)은 고정 응답이라 지연 최적화를 못 한다. "가장 빠른/지연 최저" = Latency, "어느 나라/대륙" = Geolocation의 구분이 핵심이다.

---

**문제 2.** 한 회사가 루트 도메인 `example.com`을 Application Load Balancer에 연결하려는데, CNAME 설정이 거부된다. 올바른 해결책은?

A) A 레코드에 ALB의 고정 IP 입력
B) Route 53 Alias 레코드 사용
C) zone apex에 CNAME을 강제로 추가
D) NS 레코드 변경

**정답: B**

해설: DNS 표준상 CNAME은 zone apex(루트 도메인)에 둘 수 없다 — SOA·NS 필수 레코드와 충돌하기 때문이다. Route 53 Alias 레코드는 A 레코드처럼 동작하면서 ALB 같은 AWS 리소스를 가리켜 이 제약을 우회하고, 무료이며 헬스 평가까지 된다. A는 ALB가 고정 IP가 아니라 동적이므로 불가능하고, C는 표준 위반으로 거부되며, D는 위임용 레코드로 무관하다. "루트 도메인 + AWS 리소스" = Alias.

---

**문제 3.** 새 애플리케이션 버전을 전체 사용자의 약 10%에게만 노출해 문제를 조기에 감지하는 카나리 배포를 DNS 계층에서 하려 한다. 적절한 정책은?

A) Failover
B) Weighted (새 버전 10, 기존 90)
C) Geolocation
D) Multi-value Answer

**정답: B**

해설: Weighted 라우팅은 가중치 비율로 질의를 분배하므로, 새 버전 10·기존 90으로 두면 약 10%가 새 버전으로 가는 카나리 배포가 된다. Failover(A)는 DR용 Active-Passive 전환이고, Geolocation(C)은 위치 기반, Multi-value(D)는 헬스 체크 기반 라운드로빈으로 비율 제어가 아니다. 다만 DNS Weighted는 질의 단위 + TTL 캐싱이라 정밀하지 않으니, 요청 단위 세밀 카나리는 ALB 가중 타깃 그룹이 더 적합하다는 점도 함께 기억하면 좋다.

---

**문제 4.** Geolocation 라우팅을 설정한 뒤 일부 지역 사용자가 사이트에 전혀 접속하지 못한다는 신고가 들어온다. 가장 가능성 높은 원인은?

A) Health Check가 비활성
B) 어떤 위치 규칙에도 매칭되지 않는 사용자를 위한 default 레코드가 없음
C) TTL이 너무 김
D) DNSSEC 미설정

**정답: B**

해설: Geolocation은 정의된 위치 규칙에 매칭되지 않는 사용자(미등록 지역·위치 불명)를 default 레코드로 보내는데, 이 default가 없으면 그들은 아예 응답을 못 받아 접속이 실패한다. Health Check 비활성(A)은 비정상 제외가 안 될 뿐 전면 접속 불능과 다르고, TTL(C)은 캐싱 시간일 뿐 접속 가능 여부를 막지 않으며, DNSSEC(D)는 무결성 검증이라 무관하다. Geolocation에는 반드시 default 레코드를 둬야 한다.

---

**문제 5.** 온프레미스 데이터센터의 서버들이 AWS VPC 내부의 사설 DNS 이름(`db.internal.example.com`)을 해석할 수 있어야 한다. 적절한 구성은?

A) Public Hosted Zone에 레코드 추가
B) Route 53 Resolver Inbound Endpoint + Private Hosted Zone
C) Route 53 Resolver Outbound Endpoint만
D) CloudFront 배포

**정답: B**

해설: AWS 내부 사설 이름은 Private Hosted Zone에 정의되고, 온프레미스가 그 이름을 해석하려면(온프레→AWS 방향 질의) Route 53 Resolver **Inbound** Endpoint가 필요하다 — 온프레 DNS가 이 엔드포인트로 질의를 보낸다. Outbound Endpoint(C)는 반대로 AWS가 온프레 이름을 해석할 때 쓰므로 방향이 틀렸다. Public Hosted Zone(A)은 사설 이름을 인터넷에 노출하므로 부적절하고, CloudFront(D)는 CDN으로 무관하다. 방향(Inbound=온프레→AWS)이 핵심이다.

---

**문제 6.** 한 보안팀이 DNS 응답이 변조돼 사용자가 악성 사이트로 유도되는 **캐시 포이즈닝**을 막으려 한다. 적절한 통제와 그 성격은?

A) DNSSEC 활성화 — 응답에 서명을 붙여 무결성 검증
B) DNSSEC 활성화 — DNS 질의를 암호화해 기밀성 확보
C) Private Hosted Zone으로 전환
D) TTL을 0으로 설정

**정답: A**

해설: DNSSEC는 각 DNS 응답에 공개키 서명을 붙여 리졸버가 응답의 무결성(변조되지 않았고 진짜 권한 서버 것)을 검증하게 해 캐시 포이즈닝을 막는다 — CIA 중 무결성을 푼다. B는 흔한 오해로, DNSSEC는 질의/응답을 **암호화하지 않으며**(기밀성은 DoH/DoT의 영역), 서명만 한다. Private Hosted Zone(C)은 내부 전용 이름 공간일 뿐 변조 방지가 아니고, TTL 0(D)은 캐싱만 없앨 뿐 위조 응답 자체를 막지 못한다. Route 53에서는 Hosted Zone 서명 + Registrar DS 등록을 둘 다 해야 신뢰 체인이 완성된다.

---

**문제 7.** 한 아키텍트가 멀티 리전 페일오버를 Route 53 Failover 정책으로 구성했는데, 페일오버가 발동해도 사용자들이 한동안 죽은 리전으로 계속 접속한다. 전환을 더 빠르게 만드는 조치로 가장 적절한 것은?

A) Health Check를 비활성화
B) 레코드의 TTL을 짧게(예: 60초) 설정하고, 더 빠른 전환이 필요하면 Global Accelerator(애니캐스트) 고려
C) Geolocation으로 정책 변경
D) Hosted Zone을 Private으로 전환

**정답: B**

해설: DNS 기반 페일오버의 전환 속도는 레코드 TTL과 클라이언트 캐싱이 좌우하므로, TTL을 짧게 두면 리졸버가 더 빨리 새 응답을 받는다. DNS 캐싱과 무관하게 즉각 전환이 필요하면 단일 애니캐스트 IP를 쓰는 Global Accelerator로 네트워크 계층 라우팅을 고려한다. Health Check 비활성(A)은 비정상 감지를 없애 오히려 페일오버를 막고, Geolocation(C)은 위치 기반이라 페일오버 속도와 무관하며, Private 전환(D)은 내부 DNS로 공개 페일오버와 무관하다. TTL이 DNS 페일오버 속도의 핵심 변수다.

---

## 📌 핵심 요약

Route 53은 DNS 응답을 위치·지연·가중치·건강 상태로 동적으로 바꿔 글로벌 트래픽을 조종한다. 7가지 정책은 "응답을 무엇으로 결정하나"의 답으로, Latency(속도)·Geolocation(위치·규제, default 레코드 필수)·Weighted(카나리)·Failover(DR)가 핵심이다. Health Check는 분산 체커 다수결로 죽은 엔드포인트를 빼고 String Matching·Calculated로 좀비·복합 의존성을 표현한다. Alias는 zone apex의 CNAME 제약을 우회해 루트 도메인을 AWS 리소스에 무료 연결한다. Private Hosted Zone + Resolver Endpoint(Inbound=온프레→AWS, Outbound=AWS→온프레)가 하이브리드 DNS를, DNSSEC가 RFC 4033 기반 신뢰 체인으로 캐시 포이즈닝 방지(무결성, 암호화 아님)를 제공한다. 2016 Dyn 사고가 보여줬듯 DNS는 가장 치명적 SPOF이며, DNS 캐싱으로 페일오버가 느리면 애니캐스트(Global Accelerator)가 대안이다.
