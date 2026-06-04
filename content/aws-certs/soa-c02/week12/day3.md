# Day 3 - 도메인 5·6 다시 읽기, 패킷의 길과 청구서의 길

도메인 5(네트워킹·콘텐츠 전송 18%)와 도메인 6(비용·성능 12%)을 묶는 건 시험 비중(합 30%) 때문만은 아니다. 둘은 같은 질문을 다른 단위로 묻는다 — **트래픽이 어디로 흐르는가(네트워킹), 그 흐름이 얼마의 돈으로 환산되는가(비용).** AWS에서 데이터 전송 비용은 항상 "어느 경로로 갔는가"에서 나온다. NAT를 거쳤는지, AZ를 건넜는지, 리전을 넘었는지, CloudFront로 캐시됐는지. 그래서 네트워크 토폴로지를 모르면 청구서를 못 읽고, 청구서를 모르면 토폴로지를 잘못 그린다.

이 글은 SG/NACL 표를 다시 외우는 대신, 패킷이 VPC를 통과하며 어떤 검문소를 지나는지, stateful과 stateless가 메모리 구조에서 무엇을 뜻하는지, NAT와 Endpoint의 비용이 왜 그렇게 나뉘는지, 그리고 약정 할인 모델이 어떤 게임 이론 위에 서 있는지를 파고든다.

## 패킷이 VPC를 통과하는 길 — 검문소의 순서가 곧 트러블슈팅의 순서다

VPC 트러블슈팅이 어려운 이유는 패킷이 출발지에서 목적지까지 가며 **여러 검문소를 순서대로** 통과하기 때문이다. 어느 한 곳이라도 막으면 통신이 안 되는데, 막힌 곳을 모르면 엉뚱한 데를 고친다. 검문소의 순서를 알면 트러블슈팅이 체계가 된다.

외부에서 EC2로 들어오는 인바운드 패킷은 대략 이 순서를 지난다:

```
인터넷
  │
  ▼
[IGW] ── 인터넷 게이트웨이 (퍼블릭 IP 필요)
  │
  ▼
[Route Table] ── 목적지로 가는 경로가 있나?
  │
  ▼
[NACL inbound] ── 서브넷 경계, stateless, 번호 순 평가
  │
  ▼
[Security Group inbound] ── 인스턴스 경계, stateful, allow만
  │
  ▼
[EC2 인스턴스] ── OS 방화벽(iptables 등)은 또 별개
```

이 순서가 중요한 이유는 트러블슈팅의 결정 트리가 되기 때문이다. "EC2에 접속이 안 된다"면 위에서부터 물어야 한다 — 퍼블릭 IP가 있나? 라우트 테이블에 경로가 있나? NACL이 그 포트를 막나? SG가 허용하나? 응답이 안 돌아온다면 NACL의 **아웃바운드**(ephemeral port)를 의심한다. 검문소를 순서대로 짚으면 막힌 곳이 좁혀진다.

> 💡 **관련 이론**: 이 다층 검문 구조는 네트워크 보안의 **심층 방어(Defense in Depth)** 원칙의 구현이다. 군사 전략에서 온 이 개념은 "단일 방어선에 의존하지 말고 여러 겹의 독립적 방어를 두라"는 것이다. NACL(서브넷)과 SG(인스턴스)는 의도적으로 **서로 다른 계층, 서로 다른 모델**로 동작한다 — 하나가 잘못 설정돼도 다른 하나가 막을 수 있도록. NACL은 서브넷 전체에 거친 그물을 치고(예: 특정 악성 IP 대역 차단), SG는 인스턴스별로 정밀한 허용을 한다. 둘이 같은 모델이면 심층 방어의 의미가 없다 — 차이(stateless vs stateful, deny 가능 vs allow만)가 곧 두 겹을 독립적으로 만든다.

## Stateful vs Stateless — 연결 추적 테이블이라는 메모리

SG=stateful, NACL=stateless는 시험 단골이지만, "stateful이 무슨 뜻인가"를 메모리 수준에서 이해하면 ephemeral port 함정이 저절로 풀린다.

Stateful의 "state(상태)"는 **연결 추적 테이블(connection tracking table)**을 가리킨다. Security Group은 나가는 연결을 기억한다 — EC2가 외부로 요청을 보내면, SG는 "이 연결이 나갔다"를 테이블에 기록하고, 그 응답이 돌아올 때 테이블을 조회해 **자동으로 허용**한다. 그래서 SG에는 인바운드 허용 규칙만 적으면 되고, 그 응답을 위한 아웃바운드 규칙을 따로 적을 필요가 없다. 연결 상태를 추적하니까.

Stateless의 NACL은 이 테이블이 없다. NACL은 **각 패킷을 독립적으로** 판단한다 — 이전에 무슨 연결이 있었는지 기억하지 못한다. 그래서 인바운드로 들어온 요청에 대한 응답(아웃바운드)을 **명시적으로 허용**해야 한다. 그리고 그 응답이 나가는 포트가 바로 **ephemeral port(임시 포트, 보통 1024–65535)**다. 클라이언트가 서버에 연결할 때 출발지 포트로 이 범위의 임의 포트를 쓰므로, 서버의 응답은 그 ephemeral port로 돌아간다. NACL이 stateless라 이 아웃바운드 ephemeral 범위를 명시 허용하지 않으면, 요청은 들어오는데 응답이 못 나가는 "반쪽 통신" 장애가 난다.

| | Security Group | NACL |
|---|---------------|------|
| 상태 | Stateful (연결 추적) | Stateless (패킷 독립) |
| 응답 처리 | 자동 허용 | 명시 허용 필요(ephemeral) |
| 규칙 | Allow만 | Allow + Deny |
| 평가 | 모든 규칙 종합 | 번호 낮은 순, 첫 매치 적용 |
| 적용 단위 | 인스턴스(ENI) | 서브넷 |

> ⚠️ **함정**: NACL의 stateless 특성에서 오는 ephemeral port 함정은 시험과 실무 양쪽의 단골이다. 예를 들어 NACL 인바운드에 80(HTTP)을 허용하고 아웃바운드에 80만 허용했다면, 들어오는 요청은 통과하지만 서버의 응답(클라이언트의 ephemeral port 1024–65535로 나가는)은 막힌다 — 통신이 안 된다. 반대 방향도 마찬가지다. 그래서 NACL을 쓸 때는 항상 아웃바운드(또는 인바운드)에 ephemeral port 범위를 함께 허용해야 한다. SG는 stateful이라 이 문제가 없다. 시험에서 "SG는 맞게 설정했는데 NACL을 건드린 뒤 통신이 안 된다"가 나오면 십중팔구 ephemeral port 누락이다.

## NAT Gateway와 VPC Endpoint — 같은 "프라이빗 인터넷"인데 비용이 갈린다

프라이빗 서브넷의 인스턴스가 AWS 서비스(S3 등)에 접근하는 방법은 여러 갈래이고, 그 선택이 곧 비용이다. 이 비용 구조를 모르면 매달 새는 NAT 요금을 못 본다.

**NAT Gateway**는 프라이빗 서브넷이 인터넷(또는 인터넷 경로의 AWS 서비스)으로 **아웃바운드**할 수 있게 해준다. 비용은 두 갈래다 — 시간당 고정 요금 + **처리 데이터 GB당 요금**. 이 GB당 요금이 함정이다. 프라이빗 인스턴스가 S3에서 대용량을 내려받으면 그 트래픽이 모두 NAT를 거쳐 GB당 과금되고, S3 전송량이 많을수록 NAT 요금이 눈덩이처럼 불어난다.

**VPC Gateway Endpoint**는 S3와 DynamoDB **전용**이다. 라우트 테이블에 엔드포인트 경로를 추가해, S3/DDB로 가는 트래픽이 NAT를 거치지 않고 AWS 내부 네트워크로 직접 흐르게 한다. 결정적으로 **무료**다 — 시간당 요금도, 데이터 처리 요금도 없다. 그래서 "프라이빗 인스턴스가 S3를 많이 쓰는데 NAT 비용이 부담"이면 Gateway Endpoint가 거의 항상 답이다.

**VPC Interface Endpoint(PrivateLink)**는 거의 모든 AWS 서비스를 지원한다. 서브넷에 ENI(탄력적 네트워크 인터페이스)를 만들어 그 서비스의 프라이빗 진입점을 제공한다. 시간당 요금 + GB당 요금이 있지만(Gateway보다 비쌈), S3/DDB 외의 서비스(SSM, Secrets Manager, ECR 등)를 인터넷 노출 없이 쓰려면 이게 유일한 길이다.

| | NAT Gateway | Gateway Endpoint | Interface Endpoint |
|---|------------|------------------|--------------------|
| 대상 | 인터넷 전반(아웃바운드) | S3, DynamoDB만 | 대부분의 AWS 서비스 |
| 비용 | 시간당 + GB당(비쌈) | **무료** | 시간당 + GB당 |
| 구현 | NAT 디바이스 | 라우트 테이블 경로 | 서브넷 ENI |
| 핵심 용도 | 일반 인터넷 아웃바운드 | S3/DDB 비용 절감 | 기타 서비스 프라이빗 액세스 |

> 🔍 **더 깊이**: AWS의 데이터 전송 비용은 "경계를 몇 번 넘는가"로 결정된다. 같은 AZ 안은 보통 무료, AZ를 건너면(cross-AZ) GB당 소액, 리전을 넘으면 더 비싸고, 인터넷으로 나가면(egress) 가장 비싸다. NAT Gateway가 비싼 본질도 여기 있다 — NAT는 트래픽을 인터넷 egress 경로에 올리고 처리 요금까지 더한다. 그래서 비용 최적화 아키텍처의 큰 원칙은 "트래픽을 경계 안에 가두라"이다 — S3는 Gateway Endpoint로 VPC 안에서, 서비스 간 통신은 같은 AZ 안에서, 글로벌 배포는 CloudFront 캐시로 오리진 egress를 줄여서. 시험에서 "데이터 전송 비용 절감"이 나오면 거의 항상 "경계를 덜 넘게 하는" 선택(Gateway Endpoint, CloudFront, 같은 AZ 배치)이 답이다.

## CloudFront와 Global Accelerator — 둘 다 "엣지"인데 푸는 문제가 다르다

CloudFront와 Global Accelerator는 둘 다 AWS의 엣지 네트워크(전 세계 PoP)를 쓰지만, **무엇을 가속하는가**가 정반대다. 이 차이를 잡으면 시나리오가 갈린다.

**CloudFront**는 **콘텐츠를 캐싱**한다. HTTP/HTTPS 콘텐츠(이미지·동영상·정적 파일·API 응답)를 사용자와 가까운 엣지 PoP에 복사해 둔다. 사용자는 먼 오리진까지 안 가고 가까운 캐시에서 받으므로 빠르고, 오리진은 부하가 줄어든다. CloudFront의 본질은 **캐시**이고, 따라서 캐시 가능한(주로 정적) 콘텐츠일수록 효과가 크다.

**Global Accelerator**는 **캐싱하지 않는다.** 대신 **네트워크 경로를 최적화**한다. 사용자의 트래픽을 가장 가까운 엣지에서 받아, AWS의 사설 백본 네트워크를 통해 목적지 리전까지 보낸다. 인터넷의 혼잡한 공용 경로 대신 AWS 전용 고속도로를 타는 것이다. 핵심 차이는 두 가지 — ① **TCP/UDP 모두** 지원(CloudFront는 HTTP/S만), ② **고정 Anycast IP** 제공으로 빠른 failover. 그래서 게임 서버(UDP), IoT, 실시간 통신처럼 캐시할 수 없고 지연·안정성이 중요한 트래픽은 Global Accelerator다.

| | CloudFront | Global Accelerator |
|---|-----------|--------------------|
| 핵심 메커니즘 | 콘텐츠 캐싱 | 네트워크 경로 최적화 |
| 프로토콜 | HTTP/HTTPS만 | TCP/UDP 모두 |
| IP | 도메인 기반 | 고정 Anycast IP 2개 |
| 적합 워크로드 | 정적/캐시 가능 콘텐츠 | 게임·실시간·non-HTTP |
| failover | 오리진 장애 대응 | 리전 간 빠른 전환 |

> 📚 **사례**: 정적 사이트 보안에서 CloudFront + OAC(Origin Access Control)는 거의 표준 패턴이 됐다. 과거 OAI(Origin Access Identity)는 CloudFront만 S3 오리진에 접근하게 강제했지만, SSE-KMS 암호화나 일부 리전·기능 지원에 한계가 있었다. 2022년 AWS는 OAC를 발표하며 SigV4 서명 기반으로 이를 대체했고, KMS 암호화 객체와 모든 S3 기능을 지원한다. 패턴은 동일하다 — S3 버킷을 완전히 비공개로 두고, CloudFront만 OAC로 서명된 요청을 보내 접근하게 한다. 사용자는 S3 URL을 직접 못 열고 오직 CloudFront를 통해서만 콘텐츠를 받는다. SOA 시험에서 "S3 정적 사이트인데 S3 직접 접근을 막고 CloudFront로만 서비스"가 나오면 OAC + 버킷 정책이 정답이고, OAI는 "구식(레거시)"으로 분류된다.

## 약정 할인의 게임 이론 — AWS가 미래 사용을 사는 이유

도메인 6의 약정 할인(Savings Plans, Reserved Instances)은 표로 외우면 헷갈리지만, **왜 할인을 주는가**를 알면 선택이 명확해진다. 핵심은 이게 일종의 **거래**라는 것이다 — 사용자는 미래 사용을 약속하고, AWS는 그 예측가능성의 대가로 할인을 준다.

AWS의 입장에서 가장 비싼 건 **불확실성**이다. 누가 언제 얼마나 쓸지 모르면 그만큼의 여유 용량을 항상 비워둬야 한다(놀리는 하드웨어 = 비용). 사용자가 "1년/3년간 시간당 $X어치를 꼭 쓰겠다"고 약속하면, AWS는 그만큼의 용량을 미리 계획할 수 있고, 그 예측가능성을 할인으로 되돌려준다. **약속이 강할수록(기간 길수록, 유연성 적을수록) 할인도 크다** — 이게 모든 약정 모델을 관통하는 원리다.

| 모델 | 유연성 | 할인 | 약속 대상 |
|------|--------|------|-----------|
| **Compute Savings Plans** | 가장 높음 | 중 | 시간당 $ 금액(EC2/Fargate/Lambda 어디든) |
| **EC2 Instance Savings Plans** | 중 | 큼 | 특정 패밀리·리전 내 시간당 $ |
| **Standard RI** | 낮음 | 가장 큼 | 특정 인스턴스 속성 고정 |
| **Convertible RI** | 중 | 중 | 패밀리 교환 가능 |

유연성과 할인은 **반비례**한다. Compute SP는 "EC2든 Fargate든 Lambda든, 어떤 리전·패밀리든" 자유롭게 쓰면서 시간당 금액만 약속하므로 가장 유연하지만 할인은 중간이다. Standard RI는 특정 인스턴스 타입에 묶여 유연성이 낮은 대신 할인이 가장 크다. 선택의 기준은 "내 워크로드가 얼마나 안정적으로 예측 가능한가"다 — 1년 내내 같은 c5.xlarge를 돌릴 게 확실하면 Standard RI로 최대 할인을, 워크로드가 자주 바뀌면 Compute SP로 유연성을 산다.

> 💡 **관련 이론**: 약정 할인은 금융의 **선도 계약(forward contract)**과 같은 구조다 — 미래의 사용량을 지금 고정 가격에 산다. 그리고 Spot Instance는 정반대 끝에 있는 **현물 시장(spot market)**이다. Spot은 AWS의 남는 용량을 실시간 수요·공급에 따라 변동 가격으로 판다 — 그래서 최대 90% 싸지만, 용량이 필요해지면 2분 통보 후 회수된다. 약정(forward)과 Spot(spot)은 리스크를 정반대로 배분한다 — 약정은 사용자가 사용량 리스크를 지고 가격 안정을 얻고, Spot은 사용자가 회수 리스크를 지고 가격 할인을 얻는다. 실무 최적화는 이 둘을 섞는다 — 안정적인 baseline 부하는 Savings Plans로 덮고, 탄력적이고 회수를 견딜 수 있는(stateless, 체크포인트 있는) 부하는 Spot으로 처리한다. Capacity Reservation은 또 다른 축이다 — 할인이 아니라 "용량 자체를 보장"하는 보험으로, 가격은 온디맨드지만 필요할 때 반드시 용량이 있음을 산다.

## 정리하며

도메인 5·6은 "트래픽이 어디로 흐르고 그게 얼마인가"라는 한 질문이다. 네트워크 토폴로지가 곧 비용 구조다.

다섯 가지를 기억하자. ① 패킷은 IGW→Route Table→NACL→SG 순서로 검문소를 지난다 — 트러블슈팅은 이 순서대로 좁힌다. NACL과 SG는 심층 방어로 의도적으로 다른 계층·모델이다. ② Stateful(SG)은 연결 추적 테이블로 응답을 자동 허용, Stateless(NACL)는 패킷 독립 판단이라 ephemeral port 응답을 명시 허용해야 한다. ③ NAT는 시간당+GB당으로 비싸고, S3/DDB는 무료 Gateway Endpoint로 빼는 게 정석 — 비용 최적화의 원칙은 "경계를 덜 넘게". ④ CloudFront는 콘텐츠 캐싱(HTTP/S), Global Accelerator는 경로 최적화(TCP/UDP+Anycast IP) — 푸는 문제가 다르다. ⑤ 약정 할인은 "예측가능성을 할인으로 바꾸는 거래" — 약속이 강할수록 할인 크고 유연성 작다. Savings Plans(forward)와 Spot(현물)은 리스크를 정반대로 배분하므로 섞어 쓴다.

다음 글은 6개 도메인 50문항 모의고사로, 지금까지 다진 깊이를 시험 형식에 부딪혀 본다.

---

## 📝 연습 문제

**문제 1.** 외부에서 EC2(퍼블릭 서브넷)로 HTTP 접속이 안 된다. SG 인바운드에 80을 허용했고 라우트 테이블도 정상인데 막힌다. 다음으로 의심할 검문소와 그 이유는?

A) IAM 정책

B) NACL — SG보다 앞단(서브넷 경계)에서 평가되며 stateless라, 인바운드 80을 막거나 응답이 나가는 아웃바운드 ephemeral port(1024–65535)를 허용하지 않으면 통신이 안 된다

C) KMS 키

D) Route 53

**정답: B**

해설: 인바운드 패킷은 IGW→Route Table→NACL→SG 순서로 검문을 거친다. SG와 라우트가 정상이면 그 앞단인 NACL을 의심해야 한다. NACL은 stateless라 인바운드 허용뿐 아니라 응답이 나가는 아웃바운드 ephemeral port 범위(1024–65535)까지 명시 허용해야 한다. 이를 누락하면 요청은 들어오는데 응답이 못 나가는 반쪽 통신 장애가 난다. SG는 stateful이라 이 문제가 없으므로, "SG는 맞는데 막힌다"는 NACL ephemeral port 누락의 전형이다.

---

**문제 2.** 프라이빗 서브넷 인스턴스들이 S3에서 매일 수 TB를 내려받는데, NAT Gateway의 데이터 처리 요금이 급증했다. 가장 효과적인 해결은?

A) NAT Gateway를 더 큰 것으로 교체

B) S3 VPC Gateway Endpoint 추가 — S3/DDB 전용 무료 엔드포인트로, 트래픽이 NAT를 거치지 않고 AWS 내부로 직접 흘러 GB당 요금이 사라진다

C) 인스턴스를 퍼블릭 서브넷으로 이동

D) Interface Endpoint(PrivateLink) 추가

**정답: B**

해설: NAT Gateway는 시간당 + 처리 데이터 GB당 과금이라, S3 대용량 전송이 모두 NAT를 거치면 요금이 눈덩이처럼 분다. S3와 DynamoDB는 Gateway Endpoint를 지원하며 이는 무료다 — 라우트 테이블에 경로를 추가해 S3 트래픽이 NAT 없이 AWS 내부 네트워크로 직행하게 한다. Interface Endpoint(D)는 S3도 지원하지만 시간당+GB당 과금이 있어 단순 비용 절감엔 Gateway가 우월하다. 비용 최적화의 원칙은 "트래픽이 경계(인터넷 egress)를 덜 넘게" 하는 것이고, Gateway Endpoint가 정확히 그 일을 한다.

---

**문제 3.** 회사가 UDP 기반 멀티플레이어 게임 서버를 전 세계에 서비스하며, 낮은 지연 + 리전 장애 시 빠른 failover + 고정 IP(클라이언트 설정용)가 필요하다. 적합한 서비스는?

A) CloudFront — 엣지 캐싱으로

B) Global Accelerator — TCP/UDP를 AWS 사설 백본으로 가속하고, 고정 Anycast IP 2개로 클라이언트 설정을 단순화하며, 리전 간 빠른 failover를 제공한다

C) Route 53 Latency Routing

D) ALB Cross-Region

**정답: B**

해설: CloudFront는 HTTP/HTTPS 콘텐츠 캐싱 전용이라 UDP 게임 트래픽을 처리할 수 없다. Global Accelerator는 캐싱하지 않고 네트워크 경로를 최적화하는 서비스로, TCP·UDP를 모두 지원하고 트래픽을 AWS 사설 백본으로 보내 지연을 줄인다. 고정 Anycast IP 2개를 제공해 클라이언트가 IP를 하드코딩할 수 있고, 백엔드 리전 장애 시 헬스체크 기반으로 빠르게 다른 리전으로 전환한다. 게임·실시간·non-HTTP 워크로드의 글로벌 가속은 Global Accelerator가 정답이다.

---

**문제 4.** 1년 내내 변동 없이 같은 c5.xlarge 인스턴스 20대를 한 리전에서 돌릴 것이 확실하다. 최대 할인을 원한다. 가장 적합한 약정은?

A) Compute Savings Plans

B) Standard Reserved Instances — 특정 인스턴스 속성에 고정되어 유연성은 낮지만 할인이 가장 크다

C) Spot Instances

D) Capacity Reservation

**정답: B**

해설: 약정 할인은 "유연성과 할인이 반비례"한다. 워크로드가 완전히 예측 가능(같은 타입·리전·수량 고정)하면 유연성을 포기하고 최대 할인을 주는 Standard RI가 최적이다. Compute SP(A)는 어떤 패밀리·리전·서비스든 자유롭지만 그만큼 할인이 중간이라, 변동 없는 워크로드엔 굳이 유연성에 돈을 더 낼 이유가 없다. Spot(C)은 회수 위험이 있어 안정 운영엔 부적합하고, Capacity Reservation(D)은 할인이 아니라 용량 보장(가격은 온디맨드)이다. 예측 가능성이 높을수록 강한 약정으로 큰 할인을 사는 것이 정석이다.

---

**문제 5.** stateless 무상태 배치 워크로드가 있고, 중단되어도 체크포인트에서 재개할 수 있다. 비용을 최대한 아끼고 싶다. 더불어 항상 돌아가는 안정적 baseline 서비스도 따로 있다. 비용 최적 조합은?

A) 모두 Standard RI

B) baseline은 Savings Plans로 덮고, 중단 견디는 배치는 Spot으로 처리 — 약정(가격 안정)과 Spot(최대 90% 할인, 회수 위험)을 워크로드 특성에 맞게 섞는다

C) 모두 Spot

D) 모두 온디맨드

**정답: B**

해설: 약정(forward 계약)과 Spot(현물 시장)은 리스크를 정반대로 배분한다 — 약정은 사용량을 약속하고 가격 안정을 얻고, Spot은 회수 위험을 지고 최대 90% 할인을 얻는다. 따라서 안정적이고 항상 도는 baseline 부하는 Savings Plans로 덮어 예측가능한 할인을 확보하고, 중단을 견딜 수 있는(stateless, 체크포인트 있는) 탄력적 부하는 Spot으로 돌려 극단적 할인을 받는 것이 최적이다. 모두 Spot(C)은 baseline이 회수당하면 서비스가 끊기고, 모두 RI(A)는 탄력 부하에 약정을 거는 낭비다. 워크로드 특성별로 다른 가격 모델을 섞는 것이 핵심이다.

---

**문제 6.** S3 정적 웹사이트를 CloudFront로 서비스하면서, 사용자가 S3 URL로 직접 접근하는 것은 완전히 막고 CloudFront를 통해서만 받게 하려 한다. 현재 권장되는 표준은?

A) OAI (Origin Access Identity)

B) OAC (Origin Access Control) + S3 버킷 정책 — SigV4 서명 기반으로 CloudFront만 S3에 접근하게 강제하며, KMS 암호화 객체와 모든 S3 기능을 지원한다

C) Signed URL만

D) S3 Block Public Access만

**정답: B**

해설: OAC는 2022년 OAI를 대체한 현재 표준으로, SigV4 서명 기반이라 SSE-KMS 암호화 객체와 모든 리전·기능을 지원한다. S3 버킷을 완전 비공개로 두고 버킷 정책으로 "OAC를 통한 CloudFront 요청만 허용"하면, 사용자는 S3 URL을 직접 못 열고 오직 CloudFront 경유로만 콘텐츠를 받는다. OAI(A)는 구식(레거시)으로 분류되며 KMS 등에 제약이 있다. Block Public Access(D)만으로는 CloudFront 접근 경로 설정이 빠져 불완전하다. "S3 직접 접근 차단 + CloudFront 전용"의 현재 정답은 OAC다.

---

**문제 7.** 두 EC2 사이 통신이 안 되는데, SG/NACL/라우트 중 어디가 막는지 실제 트래픽을 발생시키지 않고 빠르게 식별하려 한다. 가장 적합한 도구는?

A) VPC Flow Logs — 실제 트래픽 로그를 분석

B) Reachability Analyzer — 두 리소스 간 경로를 SG/NACL/라우트 설정 기반으로 정적 분석해 어느 구성요소가 막는지 보고한다

C) Traffic Mirroring

D) ping

**정답: B**

해설: Reachability Analyzer는 실제 패킷을 보내지 않고 SG·NACL·라우트 테이블·엔드포인트 등의 구성을 정적으로 분석해 출발지에서 목적지까지 도달 가능한지, 막힌다면 어느 구성요소(어느 SG 규칙, 어느 NACL 등)가 차단하는지 정확히 짚어준다. VPC Flow Logs(A)는 실제 트래픽이 발생한 뒤의 허용/거부 메타데이터라 "트래픽을 안 내고 미리 진단"이라는 요구에 안 맞고, Traffic Mirroring(C)은 패킷 페이로드 미러링이라 과하다. 설정 기반 정적 경로 진단은 Reachability Analyzer의 고유 역할이다.

---

## 📌 오늘의 요약

1. 패킷은 IGW→Route Table→NACL→SG 순서로 검문 — 트러블슈팅은 이 순서로 좁힌다. NACL/SG는 심층 방어로 의도적으로 다른 계층·모델
2. Stateful(SG)=연결 추적 테이블로 응답 자동 허용, Stateless(NACL)=패킷 독립 판단이라 ephemeral port(1024–65535) 응답을 명시 허용해야 함
3. NAT는 시간당+GB당으로 비싸고, S3/DDB는 무료 Gateway Endpoint로 분리 — 비용 최적화 원칙은 "경계를 덜 넘게(인터넷 egress·cross-AZ 최소화)"
4. CloudFront=콘텐츠 캐싱(HTTP/S), Global Accelerator=경로 최적화(TCP/UDP+고정 Anycast IP). S3 보호는 OAC가 현재 표준(OAI는 레거시)
5. 약정 할인=예측가능성을 할인으로 바꾸는 거래(강한 약속=큰 할인=낮은 유연성). Savings Plans(forward)와 Spot(현물)은 리스크 정반대 — 섞어 쓴다
