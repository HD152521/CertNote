# Day 3 - 데이터 전송 비용은 왜 청구서의 숨은 30%가 되는가

클라우드 비용을 처음 분석하는 사람은 거의 항상 EC2와 S3 저장료에만 집중한다. 그러다 청구서의 "Data Transfer" 항목을 보고 충격을 받는다 — 어떤 워크로드에서는 데이터 전송이 전체 비용의 30% 이상을 차지한다. 더 당황스러운 건 이 비용이 **어디서 발생하는지 직관적으로 보이지 않는다**는 점이다. EC2 인스턴스 두 대가 데이터를 주고받았을 뿐인데, 그 둘이 다른 가용영역(AZ)에 있었다는 이유만으로 GB당 요금이 붙는다. 데이터 전송 비용은 AWS 네트워크의 물리적 구조 — 리전, AZ, 인터넷 경계 — 가 그대로 가격표에 반영된 결과이고, 이 지형을 머릿속에 그릴 수 있어야 비용을 줄인다.

근본 원리는 단순하다. **AWS로 들어오는 데이터(inbound/ingress)는 대체로 무료이고, 나가는 데이터(outbound/egress)는 유료다.** 이는 AWS만의 변덕이 아니라 클라우드 산업 전반의 관행으로, "데이터를 가져오는 건 쉽게 해주고 빼는 건 비싸게" 함으로써 워크로드를 자사 클라우드에 묶어두는 효과(lock-in)를 낳는다 — 이 egress 요금은 오랫동안 업계 비판의 대상이었고, 2024년 이후 AWS·Google·Azure가 "다른 클라우드로 완전히 이전할 때 egress 무료" 정책을 잇따라 내놓은 배경이기도 하다. 이 글은 전송 비용 표를 외우는 대신, "AZ 경계가 왜 돈이 되는지", "Gateway Endpoint가 어떻게 NAT 비용을 0으로 만드는지", "CloudFront가 어떻게 전송 단가를 역전시키는지"를 따라가며 SAA 비용 도메인의 네트워크 축을 짚는다.

## AZ 경계는 왜 돈이 되나

가장 헷갈리는 지점부터 보자. 같은 리전(예: ap-northeast-2) 안에서도, 같은 AZ에 있는 두 인스턴스의 통신은 무료이지만 **다른 AZ에 있으면 양방향 모두 GB당 요금**이 붙는다. "같은 리전인데 왜?"라는 의문은 AZ가 무엇인지 이해하면 풀린다.

가용영역(AZ)은 논리적 개념이 아니라 **물리적으로 분리된 데이터센터(또는 데이터센터 클러스터)**다. 같은 리전의 AZ들은 수 km씩 떨어져 있어 한 건물의 화재·정전이 다른 AZ에 영향을 주지 않는다 — 이게 Multi-AZ 고가용성의 물리적 근거다. 그런데 이 물리적 분리는 AZ 사이를 잇는 **전용 광케이블 네트워크**를 필요로 하고, 그 인프라 운영에는 실제 비용이 든다. AWS는 이 비용을 AZ 간 트래픽에 GB당 요금으로 전가한다. 즉 AZ 경계 요금은 "고가용성을 위한 물리적 분리"의 대가다. 고가용성과 비용은 같은 동전의 양면인 것이다.

> 💡 **관련 이론**: 이건 분산 시스템의 근본 트레이드오프를 비용으로 드러낸 것이다. 데이터를 여러 AZ에 복제하면 내구성·가용성이 오르지만(한 AZ가 죽어도 살아남음), 복제 트래픽과 AZ 간 동기화 비용이 따라온다. CAP 정리가 "분할 허용(Partition tolerance) 하에서 일관성과 가용성을 동시에 다 가질 수 없다"고 말하듯, 인프라 비용 관점에서도 "물리적 분리(가용성)와 통신 비용 절감"을 동시에 최대화할 수 없다. Multi-AZ로 가용성을 사면 AZ 간 전송료라는 청구서가 따라오고, 단일 AZ로 비용을 아끼면 그 AZ 장애에 통째로 노출된다.

> ⚠️ **함정**: ELB의 **Cross-Zone Load Balancing**은 이 비용과 직접 얽힌다. Cross-zone을 켜면 로드밸런서가 모든 AZ의 타겟에 트래픽을 고르게 분산하는데, 이 과정에서 AZ 간 트래픽이 발생한다. ALB는 cross-zone이 기본 활성이고 AZ 간 요금이 별도로 청구되지 않지만, **NLB는 cross-zone이 기본 비활성이고 켜면 AZ 간 데이터 전송료가 부과된다**. "NLB에서 트래픽이 한 AZ에 쏠린다"는 시나리오는 cross-zone 미활성이 원인일 수 있고, 이걸 켜면 균형은 좋아지지만 AZ 간 비용이 생긴다는 트레이드오프를 알아야 한다. 비용에 민감하면 같은 AZ 내에서 통신이 완결되도록 토폴로지를 설계하는 게 근본 해법이다.

## Gateway Endpoint가 NAT 비용을 0으로 만드는 원리

프라이빗 서브넷의 EC2가 S3에 접근하는 상황을 생각해보자. 프라이빗 서브넷은 인터넷 게이트웨이로 직접 나갈 수 없으므로, 보통 **NAT Gateway**를 거쳐 인터넷을 통해 S3에 도달한다. 그런데 이 경로엔 두 겹의 비용이 있다 — NAT Gateway의 시간당 요금 + NAT를 통과하는 데이터의 GB당 처리 요금. S3로 대량의 데이터를 읽고 쓰면 NAT 처리 비용이 폭증한다.

**S3 Gateway Endpoint**는 이 경로를 통째로 우회한다. Gateway Endpoint를 만들면 VPC의 **라우팅 테이블에 S3로 가는 특수 경로(prefix list)**가 추가돼, S3 트래픽이 NAT나 인터넷 게이트웨이를 거치지 않고 **AWS 내부 백본을 통해 S3로 직접** 흐른다. 인터넷을 타지 않으니 NAT 처리 비용이 0이 되고, 트래픽이 AWS 네트워크 밖으로 나가지 않으니 데이터 전송료도 발생하지 않는다. 결정적으로 **Gateway Endpoint 자체가 완전 무료**다 — 시간당 요금도, GB 요금도 없다. S3와 DynamoDB 두 서비스만 이 무료 Gateway Endpoint를 제공한다.

> 🔍 **더 깊이**: Gateway Endpoint와 Interface Endpoint는 작동 방식이 근본적으로 다르다. **Gateway Endpoint**(S3·DynamoDB 전용)는 라우팅 테이블에 경로를 추가하는 방식이라 ENI도, IP도 쓰지 않고 무료다. **Interface Endpoint**(PrivateLink, 나머지 대부분 서비스)는 서브넷에 실제 ENI(탄력적 네트워크 인터페이스)를 만들어 프라이빗 IP를 부여하는 방식이라, **시간당 ENI 요금 + GB당 처리 요금**이 든다. 그래서 "VPC Endpoint를 쓰면 항상 비용이 준다"는 명제는 틀렸다 — Interface Endpoint는 트래픽이 적으면 NAT보다 오히려 비쌀 수 있다. Interface Endpoint는 보안(트래픽을 인터넷에 노출하지 않음)이나 사용량이 큰 서비스(SSM·ECR 등 고볼륨)에 한해 비용 이득이 난다.

> ⚠️ **함정**: "VPC Endpoint = 비용 절감"이라는 단순 도식을 시험은 자주 비튼다. S3/DynamoDB로 가는 트래픽이면 무료 Gateway Endpoint가 명백한 정답이지만, 다른 서비스(예: 소량의 Secrets Manager 호출)에 Interface Endpoint를 깔면 ENI 시간당 요금이 NAT 절감액을 넘어설 수 있다. 핵심 판별 기준은 "① S3/DDB인가(무료 Gateway) ② 트래픽 양이 ENI 고정비를 정당화할 만큼 큰가"이다.

## CloudFront가 전송 단가를 역전시키는 방식

글로벌 사용자에게 정적 콘텐츠(이미지·동영상·JS)를 서빙할 때, S3에서 직접 다운로드하게 하면 데이터 전송 비용(DTO)이 사용자 수에 비례해 커진다. **CloudFront**를 앞에 두면 비용이 줄어드는데, 이는 두 가지 메커니즘이 겹친 결과다.

첫째, **캐싱**이다. CloudFront는 전 세계 엣지 로케이션에 콘텐츠를 캐싱하므로, 같은 파일에 대한 두 번째 이후 요청은 S3 원본까지 가지 않고 엣지에서 처리된다. S3로 가는 원본 요청(origin fetch)이 줄면 S3 요청 비용과 S3→인터넷 전송이 함께 줄어든다. 둘째, **전송 단가의 구조적 차이**다. S3에서 CloudFront로 가는 구간(origin→edge)의 데이터 전송은 **무료**이고, CloudFront에서 사용자로 나가는 단가는 S3가 인터넷으로 직접 나가는 단가보다 대체로 저렴하며 대량 사용 시 약정 할인까지 받을 수 있다. 결과적으로 "S3 직접"보다 "CloudFront 경유"가 더 싸지는 역전이 일어난다.

CloudFront의 **가격 클래스(Price Class)**도 비용 레버다. All(전 세계 모든 엣지) / 200(북미·유럽·아시아 일부 제외) / 100(북미·유럽만)으로 나뉘는데, 사용자가 특정 지역에 몰려 있으면 더 적은 엣지만 쓰는 낮은 클래스로 비용을 줄인다 — 대신 먼 지역 사용자의 지연은 늘어난다. **Origin Shield**는 엣지와 원본 사이에 중앙 캐시 계층을 하나 더 둬, 여러 엣지가 같은 콘텐츠를 각자 원본에서 가져오는 중복을 막아 캐시 히트율을 높이고 원본 요청을 더 줄인다.

> 📚 **사례**: 데이터 전송 비용이 비즈니스를 위협한 가장 유명한 사례가 **Dropbox의 탈클라우드(2016)**다. Dropbox는 초기에 AWS S3에 사용자 파일을 저장했는데, 수억 명 규모로 커지자 스토리지·전송 비용이 막대해졌다. 결국 자체 데이터센터(Magic Pocket)를 구축해 대부분의 데이터를 AWS에서 옮겼고, 2년에 걸쳐 약 7,500만 달러의 운영비를 절감했다고 공개했다. 교훈은 두 가지다 — ① 데이터 전송·저장 비용은 규모가 커지면 자체 인프라가 합리적일 만큼 거대해질 수 있고, ② 그럼에도 대다수 기업에게는 직접 데이터센터를 짓는 자본·운영 부담이 더 크므로, AWS 안에서 CloudFront·Endpoint·토폴로지로 줄이는 게 현실적 답이다. Dropbox조차 콜드 스토리지 일부는 AWS에 남겼다.

> 💡 **관련 이론**: CloudFront의 캐싱은 컴퓨터 과학의 보편 원리인 **참조 지역성(locality of reference)**과 **캐시 계층화**의 네트워크 버전이다. CPU가 자주 쓰는 데이터를 코어 가까운 L1 캐시에 두듯, CDN은 자주 요청되는 콘텐츠를 사용자 가까운 엣지에 둔다. Origin Shield는 여기에 한 계층(L2 격)을 더해 원본(메인 메모리 격) 접근을 더 줄이는 것이다. "비싼 원거리 접근을 가까운 캐시로 분할 상환한다"는 동일한 사고가 CPU·네트워크·스토리지 전반에 반복된다.

## 멀티 계정·멀티 VPC 연결의 비용

VPC 간, 계정 간 연결에도 각자의 비용 구조가 있다. **VPC Peering**은 두 VPC를 직접 잇고 같은 리전 내 동일 AZ 간 트래픽은 무료지만, 리전 간 피어링은 inter-region 전송료가 붙는다. **Transit Gateway(TGW)**는 수십~수백 개 VPC를 허브-스포크로 묶는 중앙 라우터인데, 편의성의 대가로 **TGW를 통과하는 트래픽에 데이터 처리 요금**이 GB당 붙는다 — 그래서 "두 VPC만 연결"이면 무료에 가까운 Peering이, "다수 VPC를 확장 가능하게 연결"이면 관리 편의성을 위해 TGW가 선택된다. **PrivateLink**는 특정 서비스 하나를 다른 VPC/계정에 안전하게 노출하는 데 쓰이며 Interface Endpoint처럼 ENI·GB 요금이 든다.

> 🔍 **더 깊이**: AWS는 2024년 말 **리전 내 AZ 간 데이터 전송을 일부 시나리오에서 무료화**하는 등 전송 요금 정책을 계속 조정해왔지만, 시험과 대다수 워크로드에서는 여전히 "AZ 간·리전 간·인터넷 egress는 비용 발생"을 기본 전제로 두는 게 안전하다. 정책 세부는 변하지만 **물리적 거리가 멀수록 비싸다**(같은 AZ < 다른 AZ < 다른 리전 < 인터넷)는 큰 그림은 변하지 않는다 — 이 위계만 머릿속에 있으면 어떤 토폴로지가 싼지 추론할 수 있다.

## 비용 절감 패턴 종합

데이터 전송 비용을 줄이는 표준 패턴을 한 줄로 정리하면 이렇다.

| 시나리오 | 해결책 | 핵심 이유 |
|----------|--------|-----------|
| NAT GW로 S3/DDB 트래픽 폭증 | S3/DDB **Gateway Endpoint**(무료) | NAT·인터넷 우회, AWS 백본 직통 |
| 글로벌 사용자 정적 콘텐츠 다운로드 | **CloudFront** | 캐시 + origin→edge 무료 + 낮은 egress 단가 |
| AZ 간 트래픽 과다 | 같은 AZ 내 통신 완결, NLB cross-zone 검토 | AZ 경계 요금 회피 |
| 소량 AWS 서비스 사설 접근 | 트래픽 크면 Interface Endpoint, 작으면 NAT 유지 | ENI 고정비 대비 절감액 비교 |
| 다수 VPC 확장 연결 | TGW(편의) vs Peering(저비용 소수 연결) | 처리 요금 vs 관리 편의 |
| 리전 간 복제 비용 | 정말 필요한 데이터만 CRR | inter-region 전송료 절감 |

> ⚠️ **함정**: "데이터 전송 비용 최소화"라는 키워드가 보이면 반사적으로 떠올릴 1순위는 **S3/DDB Gateway Endpoint(무료)**와 **CloudFront**다. 반대로 "트래픽을 인터넷에 노출하지 않고 사설로"라는 보안 키워드면 **Interface Endpoint/PrivateLink**다. 두 요구(비용 vs 사설)가 겹칠 때 S3/DDB면 Gateway Endpoint가 둘 다 만족시키지만, 다른 서비스면 Interface Endpoint의 ENI 비용을 감수해야 사설 접근이 된다.

## CLI로 직접 만져보기

```bash
# S3 Gateway Endpoint (무료) — 프라이빗 서브넷 라우팅 테이블에 연결
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private-a rtb-private-b \
  --vpc-endpoint-type Gateway

# DynamoDB Gateway Endpoint (무료)
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.dynamodb \
  --route-table-ids rtb-private-a rtb-private-b \
  --vpc-endpoint-type Gateway

# Interface Endpoint (PrivateLink) — ENI·GB 요금 발생, 사용량 클 때만
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.ssm \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-a subnet-b \
  --security-group-ids sg-endpoints

# CloudFront 배포 (가격 클래스 100 = 북미·유럽만, 비용 절감)
aws cloudfront create-distribution --distribution-config '{
  "CallerReference":"saa-2026","Comment":"static assets",
  "Enabled":true,"PriceClass":"PriceClass_100",
  "Origins":{"Quantity":1,"Items":[{"Id":"s3-origin",
    "DomainName":"my-saa-bucket-2026.s3.amazonaws.com",
    "S3OriginConfig":{"OriginAccessIdentity":""}}]},
  "DefaultCacheBehavior":{"TargetOriginId":"s3-origin",
    "ViewerProtocolPolicy":"redirect-to-https",
    "MinTTL":3600}}'

# NLB Cross-Zone 활성 (AZ 간 균형 ↑, AZ 간 전송료 발생 트레이드오프)
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn arn:aws:elasticloadbalancing:...:loadbalancer/net/my-nlb \
  --attributes Key=load_balancing.cross_zone.enabled,Value=true
```

## 정리하며

데이터 전송 비용은 AWS 네트워크의 물리적 지형이 가격표에 반영된 것이다. ① 기본 원리는 **inbound 무료, outbound 유료**이며 거리가 멀수록 비싸다(같은 AZ < 다른 AZ < 다른 리전 < 인터넷). ② **AZ 경계 요금**은 물리적으로 분리된 데이터센터를 잇는 인프라 비용으로, 고가용성의 대가다 — NLB cross-zone과 직접 얽힌다. ③ **S3/DDB Gateway Endpoint**는 라우팅 테이블에 경로를 추가해 NAT·인터넷을 우회하고 완전 무료라, "NAT 비용 폭증"의 정답이다. ④ **Interface Endpoint**는 ENI·GB 요금이 들어 "VPC Endpoint=항상 절감"이 아니며 사용량이 클 때만 이득이다. ⑤ **CloudFront**는 캐싱과 origin→edge 무료 전송, 낮은 egress 단가로 S3 직접 다운로드보다 싸지고, 가격 클래스·Origin Shield로 더 조절한다. 시험은 "데이터 전송 최소화"(Gateway Endpoint/CloudFront) vs "사설 접근"(Interface Endpoint)의 키워드 구분을 반복해서 묻는다.

다음 글에서는 이 모든 비용을 사후에 보고·예측·통제하는 거버넌스 계층 — Cost Explorer, Budgets, CUR, Cost Allocation Tags가 어떻게 FinOps의 가시화·책임·자동화를 구현하는지를 본다.

---

## 📝 연습 문제

**문제 1.** 프라이빗 서브넷의 EC2 인스턴스들이 S3에 대량의 데이터를 읽고 쓰는데, NAT Gateway의 데이터 처리 비용이 급증했다. 가장 효과적인 비용 절감책은?

A) Interface Endpoint(PrivateLink)를 S3용으로 생성
B) S3 Gateway Endpoint를 생성
C) NAT Gateway를 NAT Instance로 교체
D) Direct Connect를 구축

**정답: B**

해설: S3 Gateway Endpoint는 라우팅 테이블에 S3 경로를 추가해 트래픽을 NAT·인터넷 대신 AWS 백본으로 직접 보내고, 엔드포인트 자체가 완전 무료라 NAT 처리 비용을 0으로 만든다. Interface Endpoint(A)는 S3에도 쓸 수 있지만 ENI·GB 요금이 들어 무료 Gateway Endpoint보다 비싸다. NAT Instance(C)는 관리 부담만 늘고 트래픽 비용 구조는 그대로다. Direct Connect(D)는 온프레미스 연결용으로 과한 해법이다.

---

**문제 2.** 한 회사가 전 세계 사용자에게 S3에 저장된 정적 이미지·동영상을 제공하는데 데이터 전송(DTO) 비용이 사용자 증가에 비례해 폭증한다. 비용을 줄이는 가장 적합한 방법은?

A) S3 버킷을 여러 리전에 복제해 직접 서빙
B) CloudFront를 S3 앞에 배치
C) 가격 클래스를 All로 설정한 NAT Gateway 사용
D) S3 Transfer Acceleration 활성화

**정답: B**

해설: CloudFront는 엣지 캐싱으로 S3 원본 요청을 줄이고, S3→CloudFront 전송이 무료이며, CloudFront→사용자 egress 단가가 S3 직접보다 저렴해 "S3 직접"보다 싸진다. A는 복제 비용·전송료가 오히려 늘고, C는 NAT에 가격 클래스 개념이 없는 잘못된 보기이며, D는 업로드 가속(인바운드) 기능으로 다운로드 전송 비용 절감과 무관하다.

---

**문제 3.** 두 EC2 인스턴스가 같은 리전 안에서 통신하는데 예상치 못한 데이터 전송료가 청구되고 있다. 가장 가능성 높은 원인은?

A) 두 인스턴스가 서로 다른 AZ에 있다
B) 인바운드 트래픽에 요금이 부과되었다
C) 같은 AZ 통신은 항상 유료다
D) VPC Peering이 비활성화되었다

**정답: A**

해설: 같은 리전이라도 서로 다른 AZ에 있는 인스턴스 간 통신은 양방향 모두 GB당 요금이 부과된다 — AZ가 물리적으로 분리된 데이터센터라 그 사이를 잇는 인프라 비용이 전가되기 때문이다. B는 틀렸다(인바운드는 대체로 무료), C도 틀렸다(같은 AZ 내 통신은 무료), D는 단일 VPC 내 통신과 무관하다. 비용에 민감하면 같은 AZ 내에서 통신이 완결되도록 토폴로지를 설계해야 한다.

---

**문제 4.** 한 아키텍트가 "VPC Endpoint를 쓰면 항상 비용이 절감된다"고 가정하고 소량만 호출하는 Secrets Manager에 Interface Endpoint를 깔았는데 비용이 늘었다. 원인은?

A) Interface Endpoint는 시간당 ENI 요금 + GB 처리 요금이 있어 소량 트래픽에선 NAT보다 비쌀 수 있다
B) Interface Endpoint는 S3 전용이라 잘못 적용했다
C) Endpoint Policy가 누락되어 추가 요금이 발생했다
D) Secrets Manager는 Endpoint를 지원하지 않는다

**정답: A**

해설: Interface Endpoint(PrivateLink)는 서브넷에 ENI를 만들어 시간당 요금과 GB 처리 요금이 든다. 트래픽이 적으면 이 고정비가 NAT 절감액을 초과해 오히려 비싸진다. "VPC Endpoint=항상 절감"은 틀린 도식이고, 무료인 것은 S3/DDB Gateway Endpoint뿐이다. B는 틀렸고(Interface는 다양한 서비스 지원), C는 비용 원인이 아니며, D도 틀렸다(Secrets Manager는 Interface Endpoint 지원).

---

**문제 5.** 한 팀이 NLB를 운영하는데 트래픽이 특정 AZ의 타겟에 쏠리는 문제가 있다. cross-zone load balancing을 켜려는데 비용 측면에서 알아야 할 점은?

A) NLB cross-zone은 기본 활성이라 변화가 없다
B) NLB cross-zone을 켜면 AZ 간 데이터 전송료가 발생한다
C) cross-zone은 ALB에서만 가능하다
D) cross-zone을 켜면 가용성이 떨어진다

**정답: B**

해설: NLB는 cross-zone load balancing이 기본 비활성이고, 켜면 트래픽이 모든 AZ 타겟에 고르게 분산되어 균형은 좋아지지만 그 과정에서 AZ 간 데이터 전송료가 부과된다(ALB는 cross-zone 기본 활성이며 AZ 간 요금이 별도 청구되지 않는다는 차이가 있다). A는 NLB에 대해 틀렸고, C도 틀렸다(NLB도 cross-zone 지원), D는 반대로 균형이 좋아져 가용성에 유리하다.

---

**문제 6.** 한 회사가 50개 이상의 VPC를 확장 가능하게 중앙에서 연결·라우팅하려 한다. 비용보다 관리 편의성과 확장성이 우선일 때 적합한 것은?

A) 모든 VPC를 1:1 VPC Peering으로 풀메시 연결
B) Transit Gateway로 허브-스포크 연결
C) 각 VPC를 인터넷으로 우회 연결
D) 모든 VPC를 하나로 병합

**정답: B**

해설: Transit Gateway는 다수 VPC를 허브-스포크로 묶는 중앙 라우터로, GB당 데이터 처리 요금이 붙는 대신 풀메시 Peering의 관리 복잡도(N개 VPC면 N(N-1)/2개 연결)를 제거해 확장성과 관리 편의를 준다. A는 50개 VPC면 연결 수가 폭발해 관리 불가능에 가깝고, C는 보안·비용 모두 나쁘며, D는 격리·블라스트 반경 관점에서 부적절하다. "소수 VPC 저비용 연결"이면 Peering, "다수 VPC 확장 연결"이면 TGW다.

---

**문제 7.** 한 서비스가 사용자가 북미와 유럽에만 집중되어 있는데 CloudFront 비용을 더 줄이고 싶다. 적절한 조치는?

A) 가격 클래스를 PriceClass_All로 변경
B) 가격 클래스를 PriceClass_100(북미·유럽)으로 설정
C) CloudFront를 제거하고 S3 직접 서빙
D) Origin Shield를 비활성화

**정답: B**

해설: CloudFront 가격 클래스 100은 북미·유럽 엣지만 사용해 비용을 줄인다 — 사용자가 그 지역에 집중돼 있으므로 먼 지역 엣지를 쓰지 않아 지연 손해도 없다. PriceClass_All(A)은 전 세계 엣지를 써 비용이 가장 높고, C는 캐싱·무료 origin 전송 이점을 잃어 오히려 비싸질 수 있으며, D는 Origin Shield를 끄면 캐시 히트율이 떨어져 원본 요청과 비용이 늘 수 있다.

---

## 📌 핵심 요약

데이터 전송 비용은 네트워크의 물리적 지형(AZ·리전·인터넷 경계)이 가격표가 된 것이다. inbound 무료·outbound 유료가 기본이고 거리가 멀수록 비싸다. AZ 경계 요금은 물리적으로 분리된 데이터센터를 잇는 인프라 비용이자 고가용성의 대가로, NLB cross-zone과 얽힌다. S3/DDB Gateway Endpoint는 라우팅으로 NAT·인터넷을 우회하고 완전 무료라 "NAT 비용 폭증"의 정답이며, Interface Endpoint는 ENI·GB 요금 탓에 사용량이 클 때만 이득이다. CloudFront는 캐싱·무료 origin 전송·낮은 egress 단가로 S3 직접보다 싸지고 가격 클래스로 조절한다. 시험은 "전송 최소화"(Gateway EP/CloudFront)와 "사설 접근"(Interface EP/PrivateLink)의 키워드를 구분하는 능력을 묻는다.
