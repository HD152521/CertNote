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

## 네 서비스를 한 장에: 무엇을 보고, 어떻게 강제되는가

이번 주의 혼동은 대부분 "비슷한 이름의 방화벽이 넷"이라는 데서 온다. 아래 표의 **볼 수 있는 것**과 **강제 방식** 두 열만 정확히 붙잡으면 오답 보기가 스스로 걸러진다.

| | AWS WAF | AWS Shield | Network Firewall | Security Group |
|---|---|---|---|---|
| **계층** | L7(HTTP) | L3/L4(+Adv는 L7 조율) | L3~L7 | L3/L4 |
| **볼 수 있는 것** | 메서드·URI·쿼리·헤더·쿠키·바디 | 트래픽 볼륨·패킷 패턴 | 페이로드·TLS SNI·HTTP Host·IPS 시그니처 | IP·포트·프로토콜·SG 참조 |
| **막는 대상** | 인젝션·봇·L7 flood·인증 남용 | 체적/상태 고갈 DDoS | 아웃바운드 도메인·침입 시그니처 | 서비스 노출 자체 |
| **강제 방식** | 리소스에 **연결(associate)** | 자동(Std) / **보호 등록**(Adv) | **라우팅으로 통과 강제** | ENI에 부착(우회 불가) |
| **실패하는 방식** | 리소스를 우회하면 무력 | 미등록 시 Advanced 혜택 없음 | 라우팅 누락 시 검사 미발생 | (구조적으로 우회 불가) |
| **다계정 강제** | Firewall Manager | Firewall Manager | Firewall Manager | Firewall Manager |
| **못 하는 것** | 비HTTP 트래픽, 대역폭 흡수 | L7 정밀 차단(WAF가 함) | 암호화 본문(복호화 없이), ECH | 도메인·페이로드 검사 |

이 표에서 시험이 가장 자주 파고드는 행은 **"실패하는 방식"**이다. 세 서비스가 각기 다른 이유로 조용히 무력해진다는 사실 — 그리고 조용하다는 것이 가장 위험하다는 사실 — 이 이번 주 문제 대부분의 뼈대다.

| 세부 대비 | 왼쪽 | 오른쪽 | 판단 기준 |
|---|---|---|---|
| Shield **Standard** vs **Advanced** | 자동·무료, L3/L4 흡수 | 구독·등록 필요, L7 통합·SRT·비용 보호·가시성 | 비용 보전/전문가 지원/공격 메트릭이 언급되면 Advanced |
| **Network Firewall** vs **GWLB + 어플라이언스** | 관리형, Suricata, 운영 부담 없음 | 벤더 제품, GENEVE, 정책 이식 가능 | **벤더 지정 여부**와 운영 부담 수용 가능성 |
| **Network Firewall(SNI)** vs **DNS Firewall(질의)** | 연결 시도를 차단 | 이름 해석을 차단 | 직접 IP 접속도 막아야 하면 Network Firewall 필수 |
| **OAC** vs **OAI** | SigV4, SSE-KMS 지원, 현행 | SigV2, 제약 있음, 레거시 | 신규는 항상 OAC |
| **서명 URL** vs **서명 쿠키** | 단일 객체 | 경로 패턴 다수 객체 | 객체 수와 URL 변경 가능 여부 |
| **CloudFront 서명 URL** vs **S3 presigned URL** | 엣지 통제(WAF/Shield/OAC)를 거침 | 엣지를 **우회** | 엣지 통제 적용이 요구되면 CloudFront |
| **Viewer** vs **Origin Protocol Policy** | 뷰어↔엣지 구간 | 엣지↔오리진 구간 | "전 구간 암호화"는 **둘 다** |

## 위치 사고: 통제는 우회 불가능한 길목에 둔다

같은 WAF 규칙도 *어디에 붙이느냐*가 보안 효과를 좌우한다.

- **엣지(CloudFront)에 WAF**: 악성 트래픽을 오리진 도달 전 차단. 단, 오리진 직접 접근을 막아야(OAC/prefix list) 우회가 없다.
- **ALB에 WAF**: 리전 진입점에서 차단. CloudFront 없이 ALB가 경계일 때.
- **둘 다 공개면 통제가 분산**되어 우회 경로가 생긴다 → 경계를 한 줄로 정렬.

Network Firewall도 마찬가지다. 라우팅으로 트래픽을 firewall endpoint로 *강제 통과*시키지 않으면 규칙은 무의미하다(Day 3 함정). 중앙 inspection VPC는 모든 트래픽이 지나는 choke point를 만들어 우회를 차단한다.

```
[ 이번 주 전체를 한 장으로 — 위에서 아래로 갈수록 방어선이 좁아진다 ]

  ┌──────────────────────── 인터넷 ────────────────────────┐
  │  정상 사용자        L7 인젝션·봇       L3/4 flood      │
  └───────┬───────────────────┬────────────────┬───────────┘
          ▼                   ▼                ▼
  ┌───────────────────────────────────────────────────────┐
  │ Route 53 (anycast DNS)          ← Shield로 DNS flood   │  ① 이름 해석
  └───────────────────────┬───────────────────────────────┘
                          ▼
  ┌───────────────────────────────────────────────────────┐
  │ CloudFront 엣지                                        │  ② 엣지 경계
  │  ├ Shield Standard : 흔한 L3/L4 자동 흡수              │
  │  ├ Shield Advanced : 향상 탐지·비용 보호·SRT·자동 L7   │
  │  ├ WAF(CLOUDFRONT) : SQLi/XSS·rate-based·Bot·CAPTCHA   │
  │  ├ Geo Restriction / Response Headers Policy           │
  │  ├ 서명 URL·쿠키   : 콘텐츠 단위 자격 검사             │
  │  └ TLS 종단        : ACM @ us-east-1, TLS 하한 강제    │
  └───────────────────────┬───────────────────────────────┘
                          │  ※ 이 아래로 가는 다른 길이 없어야 한다
                          │     OAC / prefix list / X-Origin-Verify / BPA
                          ▼
  ┌───────────────────────────────────────────────────────┐
  │ S3(BPA ON) 또는 ALB → 앱                               │  ③ 오리진
  └───────────────────────┬───────────────────────────────┘
                          ▼
  ┌───────────────────────────────────────────────────────┐
  │ VPC 내부 · 아웃바운드                                  │  ④ 내부·유출 경로
  │  ├ Network Firewall : 도메인 허용 목록 + Suricata IPS  │
  │  ├ DNS Firewall     : 악성·C2 도메인 해석 차단         │
  │  └ (다계정) TGW 허브 + inspection VPC + appliance mode │
  └───────────────────────────────────────────────────────┘

  ①②는 "들어오는 것"을 막고, ④는 "나가는 것"을 막는다.
  침해 이후의 피해 크기를 결정하는 것은 대개 ④다.
```

이 그림에서 자주 놓치는 축이 **④의 방향**이다. 시험 문제도 실무 사고도 "어떻게 들어왔는가"에 관심이 쏠리지만, 실제 피해 규모를 결정하는 것은 **침입 이후 데이터가 어디로 나갈 수 있었는가**다. 아웃바운드 도메인 허용 목록과 DNS 통제가 이번 주의 절반을 차지하는 이유가 여기 있다.

> 🎯 **통합 시나리오 A**: "글로벌 웹앱이 L7 SQLi 시도 + 간헐적 대규모 SYN flood + 로그인 무차별 대입을 동시에 받는다. 오리진은 ALB+EC2." 답: (1) CloudFront 전면 배치 + ACM(us-east-1) TLS, (2) CLOUDFRONT scope WAF — SQLi managed rule(TextTransformation) + `/login` scope-down rate-based(CUSTOM_KEYS) + CAPTCHA, (3) Shield Advanced 등록(SYN flood 흡수 + 비용 보호 + DRT), (4) 오리진 ALB는 CloudFront prefix list + X-Origin-Verify로 직접 접근 차단. 한 시나리오에 이번 주 모든 서비스가 협력한다.

> 🎯 **통합 시나리오 B**: "100개 계정의 워크로드 VPC들이 인터넷·VPC 간 통신을 하는데, 모든 아웃바운드를 승인된 도메인으로만 제한하고 IPS를 적용하며 중앙에서 운영하고 싶다." 답: TGW 허브 + 중앙 inspection VPC에 Network Firewall(stateful: 도메인 allow-list + Suricata IPS) + TGW appliance mode + DNS Firewall로 악성 도메인 해석 차단 + Firewall Manager로 정책 중앙 배포. East-West/North-South 모두 단일 choke point 통과.

> 🎯 **통합 시나리오 C**: "미디어 서비스가 유료 구독자에게만 영상을 제공한다. 구독자가 링크를 공유해 무단 시청이 발생하고, 일부 사용자는 S3 버킷 URL을 알아내 원본을 직접 내려받는다. 또한 특정 국가에서는 저작권 계약상 서비스할 수 없다." 답의 구성 요소는 넷이다. (1) **서명 쿠키**로 `/premium/*` 경로에 시간 제한 접근을 부여하고 필요 시 서명 정책에 IP 조건을 더한다, (2) **OAC + `AWS:SourceArn` 버킷 정책 + Block Public Access**로 S3 직접 접근을 차단한다, (3) **CloudFront Geo Restriction**으로 계약상 제외 국가를 차단한다(법적 요구이므로 지역 차단이 적절한 통제다), (4) 오리진이 ALB라면 prefix list와 비밀 헤더로 잠근다. 여기서 "S3 presigned URL을 쓴다"는 보기는 엣지 통제를 통째로 우회하므로 오답이다.

> 🎯 **통합 시나리오 D**: "규제 감사에서 세 가지 지적을 받았다 — 전송 중 암호화가 전 구간에 적용되지 않음, 워크로드가 임의의 인터넷 목적지로 통신 가능함, 보안 통제 변경 이력을 증명할 수 없음." 지적마다 계층이 다르므로 답도 셋으로 나뉜다. (1) **Viewer/Origin Protocol Policy를 모두 HTTPS로 고정**하고 ALB→백엔드 구간도 HTTPS로 올린다(4일차), (2) **Network Firewall STRICT_ORDER + 기본 drop + 도메인 허용 목록**, 그리고 **DNS Firewall + 외부 DNS 직접 질의 차단**으로 아웃바운드를 봉인한다(3일차), (3) WAF 로그·NFW alert/flow log·Resolver query log를 중앙 계정으로 수집하고 규칙을 IaC로 관리해 **변경 이력과 차단 근거를 모두 증명 가능하게** 만든다. 세 번째 항목이 특히 중요하다 — 규제 대응에서 "막았다"는 주장은 로그가 없으면 성립하지 않는다.

## 운영의 공통 절차: 어느 통제든 순서는 같다

이번 주의 네 서비스는 서로 다르지만, **운영하는 방법은 하나의 절차로 수렴한다.** 이 절차를 외워 두면 처음 보는 통제에도 같은 판단을 적용할 수 있다.

```
[ 통제 도입·튜닝 표준 절차 — 서비스와 무관하게 동일 ]

  1) 관측 모드로 켠다 (차단하지 않는다)
       WAF                → OverrideAction/Action: Count
       Shield 자동 L7 완화 → action: Count
       Network Firewall   → Suricata alert 규칙
       DNS Firewall       → action: ALERT
                │
  2) 로그·메트릭으로 "무엇이 걸리는가"를 정량화한다
       WAF sampled requests / CloudWatch 메트릭 / Athena
       NFW alert log / Resolver query log
                │
  3) 걸린 것이 정상인지 판정한다
       정상 → 4)로     악성 → 바로 5)로
                │
  4) 예외는 가장 좁게 설계한다  ← 시험의 정답이 언제나 여기 있다
       WAF   : 라벨 매칭 + 경로/헤더 조건, RuleActionOverrides
       NFW   : 필요한 도메인만 허용 목록에 추가
       (그룹 전체 비활성화·IP 전면 허용은 최후 수단)
                │
  5) 차단으로 전환하고 회귀를 감시한다
       BlockedRequests/DroppedPackets 급증 알람 + 롤백 절차 준비
```

> ⚠️ **함정**: 이 절차에서 가장 자주 생략되는 단계가 **2번(정량화)**이다. 관측 모드로 켜 두기는 하는데 로그를 실제로 분석하지 않고 감으로 Block으로 넘기면, 관측 모드를 거친 의미가 없다. 반대로 관측 모드에 무기한 머무는 것도 실패다 — **Count 상태의 규칙은 아무것도 막지 않는다.** 시험에서도 "Count로 두었다"까지만 한 설계는 대개 미완성 답이며, "관측 후 Block으로 전환"이 완성형이다.

> 📚 **사례**: 경계 방어의 실패는 대개 "통제가 없어서"가 아니라 **"통제가 있는데 그 앞을 지나지 않아서"** 일어난다. 널리 알려진 클라우드 침해 사례들이 반복해서 보여 준 형태가 몇 가지 있다. 웹 방화벽이 있었지만 그 뒤의 자격증명이 과도한 권한을 갖고 있어 한 겹의 우회가 전면적 데이터 접근으로 이어진 경우, 스토리지 버킷이 CDN 뒤에 있었지만 버킷 자체가 공개로 남아 있어 누구나 직접 내려받을 수 있었던 경우, 그리고 침입 자체는 막지 못했지만 **아웃바운드 통제와 로그가 있어 유출 범위를 특정하고 조기에 차단할 수 있었던 경우**다. 앞의 둘은 "경계가 새는 다섯 가지 경로"의 실제 사례이고, 마지막 하나가 이번 주가 아웃바운드 통제(3일차)와 로깅에 절반을 쓴 이유다. **완벽한 차단은 없다는 전제 위에서, 우회 경로를 줄이고 사후에 설명할 수 있게 만드는 것**이 경계 방어의 현실적 목표다.

## 감사 체크: 열 줄로 경계를 훑는다

시험 준비를 넘어 실제로 이 주의 내용을 점검한다면, 아래 명령들이 첫 훑기가 된다. 각 명령이 앞서 배운 "실패하는 방식" 하나씩에 대응한다.

```bash
# ① WAF: Web ACL이 실제로 리소스에 붙어 있는가 (연결 누락 = 통제 없음)
aws wafv2 list-web-acls --scope CLOUDFRONT --query 'WebACLs[].{Name:Name,Id:Id}'
aws wafv2 list-resources-for-web-acl \
  --web-acl-arn arn:aws:wafv2:ap-northeast-2:111122223333:regional/webacl/app-acl/def-456

# ② WAF: 로깅이 켜져 있는가 (없으면 튜닝도 증명도 불가)
aws wafv2 get-logging-configuration \
  --resource-arn arn:aws:wafv2:us-east-1:111122223333:global/webacl/prod-edge-acl/abc-123

# ③ Shield: 보호 대상으로 등록된 리소스 목록 (미등록 = Advanced 혜택 없음)
aws shield list-protections --query 'Protections[].{Name:Name,Resource:ResourceArn}'

# ④ Network Firewall: 엔드포인트가 어느 서브넷에 있고 준비됐는가
aws network-firewall describe-firewall --firewall-name prod-inspection \
  --query 'FirewallStatus.SyncStates'

# ⑤ Network Firewall: 라우트가 실제로 엔드포인트를 가리키는가 (최대 함정)
aws ec2 describe-route-tables \
  --query 'RouteTables[].Routes[?VpcEndpointId!=null].{Dest:DestinationCidrBlock,Vpce:VpcEndpointId}'

# ⑥ DNS Firewall: 규칙 그룹이 VPC에 연결됐는가 (연결 누락 = 미적용)
aws route53resolver list-firewall-rule-group-associations \
  --query 'FirewallRuleGroupAssociations[].{Vpc:VpcId,Group:FirewallRuleGroupId,Status:Status}'

# ⑦ CloudFront: 배포별 WAF·지역제한·TLS 하한 한눈에
aws cloudfront list-distributions \
  --query 'DistributionList.Items[].{Id:Id,WebACL:WebACLId,MinTLS:ViewerCertificate.MinimumProtocolVersion,Geo:Restrictions.GeoRestriction.RestrictionType}'

# ⑧ S3: 오리진 버킷의 공개 차단 상태
aws s3api get-public-access-block --bucket my-origin-bucket

# ⑨ 오리진 노출: 인터넷에 면한 로드밸런서 목록
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?Scheme==`internet-facing`].{Name:LoadBalancerName,DNS:DNSName}'

# ⑩ 대체 진입점: 인증 없는 Lambda 함수 URL이 있는가
aws lambda list-functions --query 'Functions[].FunctionName' --output text
```

> 🔍 **더 깊이**: 이 열 개 명령을 관통하는 질문은 사실 두 개뿐이다 — **"통제가 경로 위에 있는가"**(①③④⑤⑥)와 **"경로 밖으로 나가는 문이 있는가"**(⑦⑧⑨⑩). 보안 아키텍처 리뷰를 처음 해 보는 사람이 가장 흔히 하는 실수가 규칙의 내용부터 들여다보는 것인데, 규칙의 정교함은 **트래픽이 그 규칙을 지난다는 전제** 위에서만 의미가 있다. 그래서 리뷰의 순서는 언제나 *경로 → 강제 → 규칙*이다. 이 순서를 몸에 익히면 처음 보는 아키텍처에서도 15분 안에 가장 큰 구멍을 찾을 수 있다.

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
- [ ] 관리형 규칙 그룹의 예외를 *가장 좁게*(라벨·조건) 설계했는가, 그룹을 통째로 끄지 않았는가
- [ ] 아웃바운드가 승인된 도메인으로만 나가는가, 외부 DNS 직접 질의를 막았는가
- [ ] Shield Advanced 보호 대상 등록과 SRT 역할·비상 연락처를 *평시에* 마쳤는가
- [ ] 인터넷에 면한 엔드포인트(ALB·함수 URL·API GW)를 전부 세어 보았는가

## 정리하며

이번 주를 관통하는 질문은 처음부터 끝까지 하나였다. **"이 통제는 어디에 있고, 트래픽이 그것을 반드시 지나는가."**

서비스별 지식은 그 질문에 답하기 위한 재료였다. WAF는 HTTP 요청의 의미를 읽되 자신이 *연결된* 리소스만 본다. Shield는 네트워크의 성질로 규모를 흡수하되 워크로드가 *엣지 뒤에* 있어야 제 성능을 내고, Advanced의 혜택은 *등록한* 리소스에만 적용된다. Network Firewall은 페이로드와 도메인까지 볼 수 있지만 *라우팅*이 트래픽을 보내 주지 않으면 존재하지 않는 것과 같다. DNS Firewall은 이름 해석 단계에서 막을 수 있지만 *VPC Resolver를 경유하는* 질의만 본다. 그리고 CloudFront와 오리진 잠금은, 이 모든 통제 앞을 지나지 않고 뒤로 돌아가는 길을 없애는 일을 한다.

두 번째로 반복된 것은 **운영 절차**다. 관측(Count/alert)으로 시작해 로그로 정량화하고, 예외는 가장 좁게 설계한 뒤, 차단으로 전환하고 회귀를 감시한다. WAF에서도 Shield 자동 완화에서도 Network Firewall에서도 절차가 같았다. 시험이 "가장 적절한 첫 단계"를 물을 때 정답이 대개 관측 모드인 이유, 그리고 "그룹을 제거한다·전면 허용한다"가 대개 오답인 이유가 이 절차에서 나온다.

세 번째는 **방향**이다. ①②는 들어오는 것을, ④는 나가는 것을 막는다. 침입을 완벽히 막을 수 있다는 전제는 성립하지 않으므로, 경계 방어의 실질적 가치는 *우회 경로를 줄이는 것*과 *나가는 길을 좁히고 기록하는 것*에 있다. 3일차의 아웃바운드 통제와 이번 주 내내 강조한 로깅이 그 축이다.

다음 주는 여기서 자연스럽게 이어진다. 이번 주가 "막는 법"이었다면, 5주차는 **막지 못한 것을 어떻게 알아채고 대응하는가** — GuardDuty·Security Hub·Detective·EventBridge로 이 모든 로그와 신호를 엮어 탐지와 자동 대응을 만드는 이야기다. 통제를 켜는 것은 시작이고, 데이터로 통제를 조율하는 것이 운영 보안의 본체라는 말을 이번 주 내내 반복했다. 그 데이터를 다루는 방법이 다음 주의 주제다.

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
