# Day 4 - 숨은 비용의 해부학 — S3 스토리지 계층, 데이터 전송 요금 구조, NAT Gateway의 함정

엔지니어가 클라우드 비용을 추정할 때 거의 항상 틀리는 부분이 있다. EC2·RDS 같은 "컴퓨팅" 비용은 잘 예측하지만, 그 사이를 흐르는 **데이터 전송**과 **스토리지 계층**의 비용은 보이지 않아 누락한다. 그런데 실제 청구서를 열어보면 NAT Gateway 하나가 RDS보다 비싸거나, Cross-AZ 트래픽이 전체의 20%를 차지하는 일이 흔하다. 이 "보이지 않는 비용(hidden cost)"이야말로 SAP-C02가 집요하게 묻는 영역이다 — 컴퓨팅 최적화는 누구나 하지만, 데이터 흐름의 비용을 설계하는 건 아키텍트의 일이기 때문이다.

오늘은 비용이 새는 세 갈래 — S3 스토리지 계층의 경제학, AWS 네트워크 요금의 방향성 구조, NAT Gateway의 이중 과금 — 을 내부 원리까지 분해하고, 각각의 절감 패턴과 안티패턴을 정리한다.

## S3 스토리지 계층 — 접근 빈도와 비용의 거래

S3 비용의 핵심은 "얼마나 자주, 얼마나 빨리 꺼내느냐"에 따라 저장 단가와 검색(retrieval) 비용을 교환하는 구조다. 자주 안 쓰는 데이터를 Standard에 두는 건 낭비고, 자주 쓰는 데이터를 Glacier에 두면 검색 비용이 저장 절감을 잡아먹는다.

| 클래스 | 최소 보관 | 검색 비용 | 가용성 모델 | 적합 |
|--------|----------|-----------|-------------|------|
| Standard | - | 없음 | 다중 AZ | 빈번 접근 |
| **Intelligent-Tiering** | - | 없음(모니터링 fee) | 다중 AZ | 패턴 불명 |
| Standard-IA | 30일 | GB당 | 다중 AZ | 월 몇 회 |
| One Zone-IA | 30일 | GB당 | **단일 AZ** | 재생성 가능 데이터 |
| Glacier Instant Retrieval | 90일 | GB당(즉시) | 다중 AZ | 분기 1회, 즉시 필요 |
| Glacier Flexible Retrieval | 90일 | GB당(분~시간) | 다중 AZ | 연 1회, 대기 OK |
| Glacier Deep Archive | 180일 | GB당(12시간+) | 다중 AZ | 장기 규제 보관 |

가장 중요한 함정은 **최소 보관 기간(minimum storage duration)**이다. Standard-IA에 넣고 10일 만에 지우면, 30일치 저장료를 내야 한다(조기 삭제 요금). 그래서 수명이 짧고 자주 바뀌는 데이터를 IA로 옮기는 건 오히려 손해다.

> 💡 **관련 이론**: 이 구조는 컴퓨터 아키텍처의 **메모리 계층(memory hierarchy)**과 정확히 같은 원리다. CPU 캐시(빠르고 비쌈) → RAM → SSD → 테이프(느리고 쌈)처럼, S3도 Standard(빠르고 비쌈) → IA → Glacier(느리고 쌈)의 계층을 이룬다. 두 경우 모두 "접근 지역성(locality of reference)"이 핵심이다 — 곧 다시 쓸 데이터는 빠른 계층에, 거의 안 쓸 데이터는 느린 계층에. 메모리 계층의 캐시 미스 페널티가 S3에서는 retrieval 비용과 지연으로 나타난다. Intelligent-Tiering은 이 계층 이동을 자동화한 "하드웨어 캐시 컨트롤러"의 소프트웨어 버전인 셈이다.

> 🔍 **더 깊이**: **Intelligent-Tiering의 경제학**에는 미묘한 손익분기점이 있다. 객체당 월 모니터링 fee(1,000 객체당 약 $0.0025)가 붙고, **128KB 미만 객체는 자동 계층 이동 대상이 아니다**(모니터링 fee도 면제되지만 IA 절감도 못 받음). 따라서 수억 개의 작은 객체(예: 썸네일, 로그 조각)에 Intelligent-Tiering을 걸면 모니터링 fee가 저장 절감을 상쇄할 수 있다. 반대로 크고 접근 패턴이 들쭉날쭉한 객체(미디어 파일 등)에는 거의 항상 이득이다. 시험에서 "패턴 불명 + 큰 객체"는 Intelligent-Tiering이 정답이지만, "수많은 작은 객체"라면 함정일 수 있다.

> ⚠️ **함정**: One Zone-IA는 단일 AZ 저장이라 그 AZ가 소실되면 데이터가 사라진다. "비용을 줄이려고 모든 백업을 One Zone-IA로"는 안티패턴이다 — 재생성 불가능한 원본을 One Zone에 두면 안 된다. One Zone-IA는 "원본이 다른 곳에 있어 재생성 가능한 사본"(예: 다른 리전 복제본의 캐시, 트랜스코딩 중간 산출물)에만 쓴다.

## Lifecycle·Storage Lens — 계층 이동의 자동화와 가시성

수동으로 객체를 옮길 수는 없다. **Lifecycle 정책**이 "생성 후 N일 → IA, M일 → Glacier, K일 → 만료"를 자동 실행한다. 여기에 자주 잊는 항목 하나 — **Incomplete Multipart Upload Cleanup**이다. 멀티파트 업로드가 중간에 실패하면 partial chunk가 계속 저장돼 보이지 않게 비용이 쌓인다. Lifecycle에 "7일 후 미완료 멀티파트 정리" 규칙을 넣는 게 표준이다.

**S3 Storage Lens**는 조직 차원에서 버킷·prefix 단위 저장 패턴을 분석해 "미사용·중복·작은 객체·비최적 클래스"를 식별한다. CUR이 비용을, Storage Lens가 스토리지 효율을 본다.

## 데이터 전송 요금 — 방향과 경계가 가격을 정한다

AWS 네트워크 요금의 첫 번째 원칙: **들어오는 것(ingress)은 대체로 공짜, 나가는 것(egress)은 과금**이다. 두 번째 원칙: **경계를 넘을수록 비싸다** — 같은 AZ 안(무료) < 같은 리전 다른 AZ < Cross-Region < 인터넷.

| 경로 | 요금 |
|------|------|
| 같은 AZ 내부(사설 IP) | 무료 |
| 같은 리전, 다른 AZ | 양방향 과금(GB당, 보내고 받는 쪽 모두) |
| VPC ↔ S3/DynamoDB (Gateway Endpoint) | **무료** |
| VPC Peering (같은 AZ) | 무료 |
| VPC Peering (다른 AZ) | Cross-AZ 요금 |
| 인터넷으로 egress | 과금(가장 비쌈, 첫 구간 후 체감) |
| Cross-Region | 과금 |

> 💡 **관련 이론**: "egress는 과금, ingress는 무료"라는 비대칭은 단순 가격 정책이 아니라 **클라우드 종속(lock-in)의 경제학**과 맞물린다. 데이터를 클라우드로 넣는 건 공짜지만 빼내는 건 비싸게 만들면, 데이터가 클라우드 안에 머물수록 유리해진다(중력처럼 데이터가 클라우드로 끌려 들어가 머문다 — "data gravity"). 규제 당국이 이 egress 비용을 종속 수단으로 보고 문제 삼자, 2024년 AWS는 "AWS를 완전히 떠나는 경우 egress 무료"(free data transfer out to internet when leaving AWS) 정책을 도입했다. 시험 맥락에서는 "정상 운영 중 egress는 과금"이 여전히 핵심이다.

> 🔍 **더 깊이**: **Cross-AZ 트래픽이 양방향 과금**이라는 점이 가장 자주 누락된다. 같은 리전 다른 AZ로 1GB를 보내면 보내는 쪽과 받는 쪽 양쪽에 GB당 요금이 붙는다(통상 합산 $0.02/GB 수준). 멀티 AZ RDS의 동기 복제, ALB에서 다른 AZ의 타겟으로 가는 트래픽, 분산 캐시(예: Cross-AZ Redis replication)가 의외로 큰 비용을 만든다. 이를 줄이려면 가능한 한 같은 AZ 안에서 통신하도록 배치하되(예: ALB의 Cross-Zone Load Balancing 트레이드오프 고려), 가용성과 비용을 저울질해야 한다 — 무조건 같은 AZ에 몰면 AZ 장애에 취약해지므로 정답은 워크로드의 가용성 요구에 달려 있다.

## NAT Gateway — 가장 흔한 숨은 비용의 챔피언

NAT Gateway는 사설 서브넷의 리소스가 인터넷으로 outbound 통신할 때 쓰인다. 문제는 **이중 과금** — 시간당 요금(가동만 해도 부과) + 처리량 요금(GB당)이 함께 붙는다는 점이다.

- 시간당: 약 $0.045/시간 → 한 달 약 $32 (AZ마다 1개면 ×AZ 수)
- 처리량: 약 $0.045/GB

핵심 통찰은 **"AWS 서비스로 가는 트래픽까지 NAT를 거치면 순수 낭비"**라는 것이다. 사설 서브넷의 Lambda가 S3에 100GB를 업로드하는데 NAT를 거치면 처리량 요금이 붙는다 — 그런데 S3는 AWS 내부 서비스라 NAT를 거칠 이유가 없다.

```
[사설 서브넷]
   ├─▶ [S3 Gateway Endpoint]      무료    ← S3·DynamoDB 전용
   ├─▶ [DynamoDB Gateway Endpoint] 무료
   ├─▶ [Interface Endpoint: KMS·SQS·SNS·ECR·Logs...] 시간당+데이터(NAT보다 보통 저렴)
   └─▶ [NAT Gateway] → 인터넷       이중 과금   ← 진짜 외부 통신만
```

> 🔍 **더 깊이**: **Gateway Endpoint vs Interface Endpoint**의 차이는 내부 동작이 다르다. Gateway Endpoint(S3·DynamoDB 전용)는 **라우팅 테이블에 prefix list를 추가**하는 방식 — 패킷이 NAT/IGW 대신 AWS 백본으로 직접 라우팅된다. 추가 인프라가 없어 **완전 무료**다. Interface Endpoint(나머지 대부분의 서비스)는 **서브넷에 ENI(PrivateLink)를 심는** 방식 — ENI마다 시간당 요금 + 처리 데이터 요금이 붙지만, 대량 트래픽에선 NAT 처리량 요금보다 보통 싸다. 시험에서 "S3/DynamoDB"면 Gateway(무료), "그 외 AWS 서비스"면 Interface가 정답이다.

> 📚 **사례**: 한 SaaS 기업은 ECS Task가 매일 100GB의 데이터를 S3로 업로드하는데 모든 트래픽이 NAT Gateway를 경유했다. NAT 처리량 요금만 월 약 $4,500이 나왔다. 원인을 추적해 **S3 Gateway Endpoint**를 추가하자, S3 트래픽이 NAT를 우회해 AWS 백본으로 직접 가면서 그 비용이 **$0**으로 떨어졌다 — 라우팅 한 줄 추가로 연 약 $54,000 절감. 교훈: 사설 서브넷에서 AWS 서비스(특히 S3·DynamoDB) 호출량이 크면, NAT를 의심하기 전에 먼저 Gateway Endpoint가 있는지 확인하는 게 FinOps의 1번 점검 항목이다.

## 전송 비용 절감 패턴 — CloudFront·Direct Connect

인터넷으로 대량 콘텐츠를 내보낼 때는 **CloudFront**가 핵심이다. S3에서 CloudFront로 가는 트래픽(origin fetch)은 무료이고, CloudFront에서 사용자로 가는 egress는 S3 직접 egress보다 단가가 낮으며 캐싱으로 origin 호출 자체가 줄어든다. 온프레미스와의 대규모·지속 전송에는 **Direct Connect**가 인터넷 egress보다 저렴하고 안정적이다.

> 🎯 **시나리오**: "전 세계 사용자에게 S3의 정적 자산을 제공하면서 전송 비용을 최소화하라." → **CloudFront + S3**. S3 → CloudFront origin fetch는 무료, CloudFront 캐시 히트는 S3 호출과 egress를 모두 줄이고, 사용자에게 가까운 엣지에서 응답해 지연도 준다. S3를 직접 공개하면 egress 단가가 높고 캐싱이 없어 비용·지연 모두 불리하다. Global Accelerator는 정적 IP·TCP/UDP 가속용이지 정적 콘텐츠 캐싱·비용 절감 도구가 아니다.

## 트레이드오프 비교표: 사설 서브넷의 outbound 경로 6가지

"사설 서브넷에서 밖으로 나가야 한다"는 하나의 요구에 경로가 여섯이다. 각각의 요금 구조와 제약이 달라서, 한정어가 바뀌면 정답도 바뀐다.

| 경로 | 고정 요금 | 트래픽 요금 | 가용성 | 온프레미스에서 사용 | 제약 |
|------|-----------|-------------|--------|---------------------|------|
| **NAT Gateway** | 시간당(AZ마다) | GB당 처리 | AZ 내 관리형 이중화 | — | 이중 과금, AZ마다 배치 필요 |
| **NAT Instance(EC2)** | 인스턴스 비용 | **처리 요금 없음** | 직접 구성해야 함 | — | 대역폭이 인스턴스 타입에 종속, 자체 운영 |
| **Gateway Endpoint** (S3·DynamoDB) | **없음** | **없음** | 라우팅 기반, 관리 불필요 | **불가** | S3·DynamoDB 전용, VPC 내부에서만 |
| **Interface Endpoint** (PrivateLink) | 시간당(ENI/AZ마다) | GB당 처리 | AZ마다 ENI 배치 | **가능**(DX·VPN 경유) | 서비스마다 별도 엔드포인트 |
| **Egress-only IGW** (IPv6 전용) | **없음** | 데이터 전송 요금만 | 관리형 | — | IPv6 아웃바운드 전용 |
| **중앙 집중 egress**(TGW + NAT) | TGW 어태치먼트 + NAT 시간당 | TGW 처리 + NAT 처리 (**중첩**) | 높음 | 가능 | 요금이 두 번 붙는다 |

> ⚠️ **함정**: 표에서 가장 시험에 잘 나오는 칸은 **"Gateway Endpoint는 온프레미스에서 사용 불가"**다. Gateway Endpoint는 VPC 라우팅 테이블에 prefix list를 넣는 방식이라, Direct Connect나 VPN을 타고 들어온 온프레미스 트래픽은 그 라우팅을 쓸 수 없다. 그래서 "온프레미스에서 사설 경로로 S3에 접근하라"는 요구가 나오면 무료인 Gateway Endpoint가 아니라 **S3용 Interface Endpoint**가 정답이다. "S3면 무조건 Gateway"라고 외운 사람이 정확히 여기서 틀린다.

> 🔍 **더 깊이**: NAT Instance는 "처리 요금이 없다"는 이유로 소규모 환경에서 여전히 검토된다. 그러나 트레이드오프가 명확하다. (1) 인스턴스 타입이 대역폭 상한을 결정하므로 트래픽이 늘면 수직 확장이 필요하고, (2) 소스/대상 확인(source/destination check)을 꺼야 하며, (3) 장애 시 자동 대체가 없어 Auto Scaling·라우팅 전환 스크립트를 직접 만들어야 한다. 즉 **처리 요금을 절약하는 대가로 운영 부담을 산다**. 시험에서 "LEAST operational overhead"가 붙으면 NAT Instance는 언제나 오답이고, "MOST cost-effective + 트래픽이 매우 큼 + 운영 인력 있음"이라는 조건이 겹칠 때만 후보가 된다.

## 아키텍처 다이어그램: 멀티 계정 환경에서 egress를 모으는 구조

계정이 수십 개가 되면 "VPC마다 NAT Gateway를 AZ마다"라는 구조가 비용의 주범이 된다. VPC 20개 × AZ 3개 = NAT 60개의 시간당 요금이 트래픽과 무관하게 고정으로 나간다. 그래서 중앙 집중 egress 패턴이 등장한다.

```
 ┌──────────────────────────────────────────────────────────────┐
 │  Network 계정 (Infrastructure OU)                             │
 │                                                              │
 │   ┌────────────────── Egress VPC ────────────────────┐       │
 │   │  AZ-a: NAT GW ──┐                                │       │
 │   │  AZ-b: NAT GW ──┼──► Internet Gateway ──► 인터넷  │       │
 │   │  AZ-c: NAT GW ──┘                                │       │
 │   │                                                  │       │
 │   │  ┌── 중앙 Interface Endpoint (PrivateLink) ──┐    │       │
 │   │  │   KMS · SQS · SNS · ECR · Logs · SSM      │    │       │
 │   │  │   + Route 53 Private Hosted Zone 공유      │    │       │
 │   │  └───────────────────────────────────────────┘    │       │
 │   └──────────────────────┬───────────────────────────┘       │
 │                          │                                   │
 │                  ┌───────▼────────┐                          │
 │                  │ Transit Gateway│  (RAM으로 타 계정 공유)    │
 │                  └───┬────────┬───┘                          │
 └──────────────────────┼────────┼──────────────────────────────┘
                        │        │
      ┌─────────────────▼──┐  ┌──▼──────────────────┐
      │ Workload 계정 A     │  │ Workload 계정 B      │
      │  Spoke VPC          │  │  Spoke VPC           │
      │  ┌───────────────┐  │  │  ┌───────────────┐  │
      │  │ S3 Gateway EP │  │  │  │ S3 Gateway EP │  │  ◄── 무료, VPC마다
      │  │ (무료·필수)    │  │  │  │ (무료·필수)    │  │      반드시 각자 둔다
      │  └───────────────┘  │  │  └───────────────┘  │
      │  기본 라우트 → TGW   │  │  기본 라우트 → TGW   │
      └─────────────────────┘  └─────────────────────┘

  ▼ 요금이 붙는 지점 (중첩에 주의)
  Spoke → TGW            : TGW 어태치먼트 시간당 + 처리 GB당
  TGW → Egress VPC       : (같은 TGW 내부)
  Egress VPC NAT → 인터넷 : NAT 시간당 + NAT 처리 GB당 + 인터넷 egress
  ※ S3·DynamoDB 트래픽은 이 경로에 절대 태우지 않는다.
     각 Spoke VPC에 무료 Gateway Endpoint를 두어 TGW·NAT를 모두 우회시킨다.
```

> 🔍 **더 깊이**: 중앙 집중 egress는 **무조건 싸지 않다**. TGW를 통과하는 모든 트래픽에 GB당 처리 요금이 붙고, 그 위에 NAT 처리 요금이 또 붙는다. 즉 트래픽 단가는 오히려 올라간다. 이 패턴이 이득인 지점은 **고정 요금 쪽**이다 — VPC 20개 × AZ 3개 = NAT 60개의 시간당 요금이 NAT 3개로 줄어든다. 따라서 판단 기준은 명확하다. **VPC 수가 많고 각 VPC의 트래픽은 적으면 중앙 집중이 유리하고, VPC 수가 적고 트래픽이 매우 크면 분산 NAT가 유리하다.** 여기에 "중앙 집중은 보안 검사(방화벽·IDS)를 한 곳에서 할 수 있다"는 비용 외 이점이 더해져 규제 환경에서는 트래픽 요금을 감수하고도 채택한다.

> ⚠️ **함정**: 중앙 집중 구조를 만들면서 **각 Spoke VPC의 S3 Gateway Endpoint를 빼먹는 것**이 가장 비싼 실수다. Gateway Endpoint는 VPC 단위 리소스라 계정·VPC마다 각자 만들어야 하고 공유가 안 된다. 이걸 빠뜨리면 S3 트래픽이 TGW를 타고(처리 요금) NAT를 거쳐(처리 요금) 나가면서, 원래 0원이어야 할 트래픽에 요금이 두 번 붙는다.

## NAT·전송 비용을 단계적으로 줄이는 순서

비용 절감은 "무엇을 끄자"가 아니라 "무엇부터 보자"의 순서 문제다. 효과 대비 위험이 낮은 것부터 간다.

```
1단계  측정 — 어디로 새는지부터 확정
   ├── CUR을 Athena로 쿼리해 NAT 처리량·데이터 전송 항목만 분리
   ├── VPC Flow Logs로 NAT ENI를 지나는 목적지 상위 IP·포트 집계
   └── 근거: NAT 요금 청구서는 "얼마"만 알려주고 "어디로"는 알려주지 않는다.
             Flow Logs 없이는 절감 대상을 특정할 수 없다.

2단계  Gateway Endpoint 추가 (위험 0, 효과 즉시)
   ├── 모든 VPC에 S3·DynamoDB Gateway Endpoint 존재 여부 점검
   ├── 라우팅 테이블 추가만으로 적용, 애플리케이션 변경 없음
   └── 근거: 무료이고 되돌리기 쉬우며 효과가 가장 크다. 언제나 1순위.

3단계  Interface Endpoint 선별 도입 (트래픽 큰 서비스만)
   ├── 1단계 집계에서 상위를 차지한 AWS 서비스부터
   ├── ECR·CloudWatch Logs·SSM·KMS가 흔한 상위 항목
   └── 근거: Interface Endpoint는 ENI 시간당 요금이 있다. 트래픽이 적은
             서비스까지 전부 만들면 오히려 손해다. 손익분기를 계산하고 넣는다.

4단계  아키텍처 배치 조정 (Cross-AZ 최소화)
   ├── 같은 AZ 안에서 통신하도록 배치하되 가용성 요구와 저울질
   ├── NLB의 cross-zone 설정처럼 요금이 걸린 옵션을 개별 검토
   └── 근거: 여기서부터는 가용성과의 트레이드오프가 생긴다.
             비용만 보고 한 AZ에 몰면 AZ 장애에 그대로 노출된다.

5단계  대규모 구조 변경 (중앙 집중 egress·CloudFront 도입)
   ├── VPC·계정 수가 많으면 TGW 기반 중앙 egress 검토
   ├── 인터넷으로 나가는 대용량 콘텐츠는 CloudFront 뒤로
   └── 근거: 효과는 크지만 네트워크 구조를 바꾸는 작업이라 위험이 크다.
             앞의 1~4단계로 얻을 수 있는 절감을 다 얻은 뒤에 착수한다.
```

> 💡 **암기 팁**: **"측정 → 무료(Gateway EP) → 선별 유료(Interface EP) → 배치 → 구조."** 순서가 곧 위험 대비 효과의 순서다. 시험에서 "즉시·최소 변경으로 비용을 줄여라"는 요구가 나오면 2단계에 해당하는 Gateway Endpoint가 거의 항상 정답이다.

## 실물: Lifecycle 정책과 엔드포인트 정책

### S3 Lifecycle — 계층 이동과 미완료 멀티파트 정리를 한 정책에

```json
{
  "Rules": [
    {
      "ID": "logs-tiering-and-expiry",
      "Filter": { "Prefix": "logs/" },
      "Status": "Enabled",
      "Transitions": [
        { "Days": 30,  "StorageClass": "STANDARD_IA" },
        { "Days": 90,  "StorageClass": "GLACIER_IR" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    },
    {
      "ID": "cleanup-old-versions",
      "Filter": { "Prefix": "" },
      "Status": "Enabled",
      "NoncurrentVersionTransitions": [
        { "NoncurrentDays": 30, "StorageClass": "GLACIER_IR" }
      ],
      "NoncurrentVersionExpiration": { "NoncurrentDays": 180 }
    }
  ]
}
```

> ⚠️ **함정**: 두 번째 규칙의 **비현행 버전(noncurrent version) 정리**가 빠져 있는 버킷이 대단히 흔하다. Versioning을 켜두면 덮어쓰기·삭제된 객체의 옛 버전이 그대로 남아 계속 과금된다. 콘솔의 객체 목록에는 보이지 않으므로 "객체 수는 그대로인데 저장 비용만 계속 오르는" 현상으로 나타난다. Versioning을 켰다면 비현행 버전 만료 규칙은 세트로 넣어야 한다.

> 🔍 **더 깊이**: Lifecycle **전환 자체에 요청 요금이 붙는다**(전환 1,000건당 과금). 그래서 수억 개의 작은 객체를 IA로 옮기면 전환 요청 요금이 저장 절감액을 넘어설 수 있다. 여기에 Standard-IA·One Zone-IA의 **최소 청구 객체 크기 128KB** 규칙까지 겹친다 — 10KB짜리 객체를 IA에 넣어도 128KB로 청구된다. 결론은 하나다. **작은 객체는 계층을 내리는 게 아니라 합쳐야 한다.** 로그 조각은 압축·병합해 큰 객체로 만든 뒤 계층을 내리는 게 정석이고, 이 판단 근거는 S3 Storage Lens의 평균 객체 크기 지표에서 나온다.

### VPC Endpoint 생성과 엔드포인트 정책

```bash
# S3 Gateway Endpoint 생성 — 라우팅 테이블에 붙인다 (무료)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc123 \
  --vpc-endpoint-type Gateway \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private-a rtb-private-b rtb-private-c \
  --policy-document file://s3-endpoint-policy.json

# ECR용 Interface Endpoint 생성 — 서브넷에 ENI를 심는다 (시간당 + GB당)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc123 \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.ap-northeast-2.ecr.dkr \
  --subnet-ids subnet-a subnet-b subnet-c \
  --security-group-ids sg-endpoint \
  --private-dns-enabled

# 현재 VPC에 어떤 엔드포인트가 있는지 (절감 점검 1번 항목)
aws ec2 describe-vpc-endpoints \
  --filters Name=vpc-id,Values=vpc-0abc123 \
  --query 'VpcEndpoints[].{Type:VpcEndpointType,Service:ServiceName}' \
  --output table
```

```json
// s3-endpoint-policy.json — 이 엔드포인트로는 우리 조직의 버킷만 접근 가능
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowOwnOrgBucketsOnly",
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
    "Resource": "*",
    "Condition": {
      "StringEquals": { "aws:ResourceOrgID": "o-exampleorgid" }
    }
  }]
}
```

> 📚 **사례**: 엔드포인트 정책은 비용이 아니라 **데이터 반출 차단**에서 진가를 발휘한다. Gateway Endpoint에 위와 같은 정책을 걸어두면, 침해된 인스턴스가 사내 데이터를 공격자 소유의 외부 S3 버킷으로 복사하려 해도 그 요청이 엔드포인트에서 거부된다. NAT를 막아 인터넷 경로를 닫고, 남은 유일한 S3 경로인 엔드포인트에 조직 조건을 걸면 반출 경로가 구조적으로 사라진다. 비용 최적화로 도입한 Gateway Endpoint가 보안 통제 지점으로도 쓰이는, 드물게 양쪽이 다 이득인 설계다.

## 한정어가 바뀌면 답이 달라진다

"사설 서브넷 워크로드가 S3에 접근한다"는 하나의 상황에, 한정어와 조건만 바꿔 보자.

| 조건·한정어 | 정답 방향 | 왜 |
|--------------|-----------|-----|
| **MOST cost-effective, VPC 내부에서만** | **S3 Gateway Endpoint** | 완전 무료. 시간당도 GB당도 없다 |
| **온프레미스에서 DX 경유로 사설 접근** | **S3 Interface Endpoint** | Gateway Endpoint는 온프레미스 트래픽에 적용되지 않는다 |
| **LEAST operational overhead** | Gateway Endpoint | 라우팅 항목 하나. 관리할 ENI·SG가 없다 |
| **데이터 반출까지 막아야 함** | Gateway Endpoint + **엔드포인트 정책** | 경로를 좁힌 뒤 그 경로에 조건을 건다 |
| **글로벌 사용자에게 대량 배포 + 비용↓** | **CloudFront + S3** | origin fetch 무료 + 캐시로 origin 호출·egress 동시 감소 |
| **다른 리전의 워크로드가 자주 읽음** | CRR 또는 **CloudFront** 검토 | Cross-Region 반복 전송보다 한 번 복제·캐시가 싸질 수 있다 |
| **대용량 데이터셋을 외부에 공개 공유** | **Requester Pays** | 다운로드 egress 비용을 요청자가 부담하게 전환 |

> 💡 **암기 팁**: **"VPC 안이면 Gateway, 온프레미스면 Interface, 인터넷이면 CloudFront."** 출발지가 어디인지만 지문에서 찾으면 세 갈래가 즉시 갈린다.

> 🎯 **시나리오**: "여러 계정의 워크로드가 각자 CloudWatch Logs와 ECR을 대량으로 호출한다. NAT 처리 요금이 급증했다. MOST cost-effective한 개선은?" — 답: **호출량 상위 서비스에 대해서만 Interface Endpoint를 도입**하고, 계정·VPC가 많다면 Network 계정에 중앙 Interface Endpoint를 두고 Private Hosted Zone으로 공유한다. 여기서 "모든 AWS 서비스에 Interface Endpoint를 만든다"는 보기가 함정이다 — ENI 시간당 요금이 AZ 수만큼 곱해져 트래픽이 적은 서비스에서는 NAT보다 비싸진다. 비용 한정어가 붙은 문항에서 **"전부 다"는 거의 항상 오답**이다.

## 정리하며

숨은 비용의 3대 축은 **S3 스토리지 계층(접근 빈도 vs 검색 비용), 데이터 전송(방향·경계), NAT Gateway(이중 과금)**이다. S3는 메모리 계층처럼 자주 쓰는 건 빠른 계층에·드문 건 느린 계층에 두되 최소 보관 기간을 지키고, 패턴 불명·큰 객체는 Intelligent-Tiering으로 자동화한다. 데이터 전송은 같은 AZ 무료·Cross-AZ 양방향 과금·인터넷 egress가 가장 비싸며, NAT Gateway는 S3/DynamoDB Gateway Endpoint(무료)와 Interface Endpoint로 우회하고, 인터넷 배포는 CloudFront로 절감한다.

SAP 시험 단골 매핑: (1) "패턴 불명 + 자동 최적화 + 큰 객체" → **Intelligent-Tiering**, (2) "사설 Lambda → S3 비용 0" → **S3 Gateway Endpoint**, (3) "그 외 AWS 서비스 사설 접근" → **Interface Endpoint(PrivateLink)**, (4) "글로벌 정적 콘텐츠 + 비용↓" → **CloudFront + S3**, (5) "재생성 가능 사본 저비용 저장" → **One Zone-IA**, (6) "미완료 멀티파트 누적 비용" → **Lifecycle Cleanup 규칙**, (7) "재생성 불가 백업을 One Zone에" → 안티패턴(오답). 다음 day는 Week 12 비용 최적화 전체를 종합 복습한다.

---

## 📝 연습 문제

**문제 1.** 액세스 패턴을 전혀 예측할 수 없는 대용량 미디어 객체들을 저장하면서 비용을 자동으로 최적화하려 한다. 가장 적합한 스토리지 클래스는?

A) Standard-IA

B) S3 Intelligent-Tiering

C) Glacier Deep Archive

D) One Zone-IA

**정답: B**
해설: Intelligent-Tiering은 객체별 접근 패턴을 모니터링해 자동으로 적합한 계층(Frequent→Infrequent→Archive)으로 이동시키며 검색 비용이 없다(모니터링 fee만). 패턴 불명 + 큰 객체에 정확히 맞는다. A는 패턴이 명확히 "월 몇 회"일 때 적합하며 잘못 맞으면 retrieval 비용이 든다. C는 거의 안 꺼내는 장기 보관용으로 즉시 접근에 부적합하다. D는 단일 AZ라 가용성이 낮다. 함정: "패턴 불명 + 자동"은 Intelligent-Tiering이지만 수많은 작은(128KB 미만) 객체라면 모니터링 fee가 손해일 수 있다.

---

**문제 2.** 사설 서브넷의 Lambda가 매일 대량의 데이터를 S3에 업로드하는데 NAT Gateway 처리량 요금이 과도하게 나온다. 비용을 0에 가깝게 줄이려면?

A) NAT Gateway를 AZ마다 추가

B) S3 Gateway Endpoint를 VPC에 추가해 S3 트래픽이 NAT를 우회하게 함

C) Internet Gateway로 직접 연결

D) S3 Interface Endpoint 추가

**정답: B**
해설: S3 Gateway Endpoint는 라우팅 테이블에 prefix list를 추가해 S3 트래픽을 NAT/IGW 대신 AWS 백본으로 직접 라우팅하며 완전 무료다. NAT 처리량 요금이 사라진다. A는 비용을 더 늘린다. C는 사설 서브넷 보안 모델을 깨고 비용 문제를 해결하지 못한다. D는 가능하나 S3·DynamoDB는 무료인 Gateway Endpoint가 더 적합하다(Interface는 시간당+데이터 요금). 함정: S3/DynamoDB는 무료 Gateway Endpoint, 그 외 서비스가 Interface Endpoint다.

---

**문제 3.** 트랜스코딩 과정에서 생성되는 중간 산출물(원본에서 언제든 재생성 가능)을 가능한 한 저렴하게 저장하려 한다. 가장 적합한 클래스는?

A) S3 Standard

B) One Zone-IA

C) Glacier Deep Archive

D) Standard-IA(다중 AZ)

**정답: B**
해설: One Zone-IA는 단일 AZ 저장으로 다중 AZ IA보다 약 20% 저렴하며, AZ 소실로 데이터가 사라져도 원본에서 재생성 가능한 데이터라면 그 위험이 수용 가능하다. A는 빈번 접근용으로 비싸다. C는 즉시 접근이 어렵다(중간 산출물은 곧 다시 쓸 수 있음). D는 다중 AZ라 더 비싸며 재생성 가능 데이터에는 과한 내구성이다. 함정: 재생성 불가능한 원본을 One Zone-IA에 두는 것은 안티패턴이며, 재생성 가능 사본에만 적합하다.

---

**문제 4.** 전 세계 사용자에게 S3에 저장된 정적 웹 자산을 제공하면서 데이터 전송 비용과 지연을 모두 최소화하려 한다. 가장 적합한 것은?

A) S3 버킷을 퍼블릭으로 공개하고 직접 제공

B) CloudFront를 S3 origin 앞에 배치

C) S3 Transfer Acceleration

D) Global Accelerator + S3

**정답: B**
해설: CloudFront는 S3 origin fetch가 무료이고, 엣지 캐시 히트로 origin 호출과 egress를 모두 줄이며, 사용자에게 가까운 엣지에서 응답해 지연도 낮춘다. A는 egress 단가가 높고 캐싱이 없어 비용·지연 모두 불리하다. C는 업로드 가속용이다. D(Global Accelerator)는 정적 IP·TCP/UDP 가속용으로 정적 콘텐츠 캐싱·비용 절감 도구가 아니다. 함정: 글로벌 정적 콘텐츠 + 비용↓은 CloudFront다.

---

**문제 5.** 멀티 AZ RDS와 분산 캐시를 운영하는데 데이터 전송 비용이 예상보다 크다. CUR로 분석하니 Cross-AZ 트래픽이 원인이다. 이 비용의 특징으로 옳은 것은?

A) 받는 쪽만 과금된다

B) 같은 리전 다른 AZ 통신은 보내고 받는 양쪽 모두 GB당 과금된다

C) 같은 리전 내 통신은 항상 무료다

D) Cross-AZ는 인터넷 egress보다 비싸다

**정답: B**
해설: 같은 리전 다른 AZ 간 통신은 양방향 과금으로, 보내는 쪽과 받는 쪽 양쪽에 GB당 요금이 붙는다. 멀티 AZ 동기 복제·Cross-AZ 캐시 복제가 의외로 큰 비용을 만든다. A는 틀림(양방향). C는 틀림(같은 AZ 내부만 무료, Cross-AZ는 과금). D는 틀림(인터넷 egress가 일반적으로 더 비쌈). 함정: Cross-AZ는 양방향 과금이라는 점이 자주 누락된다.

---

**문제 6.** S3 버킷의 비용이 설명되지 않게 계속 증가한다. 조사하니 멀티파트 업로드가 중간에 실패하며 남긴 partial chunk가 누적되고 있었다. 가장 적합한 해결책은?

A) 매일 CLI 스크립트로 수동 삭제

B) Lifecycle 규칙에 Incomplete Multipart Upload Cleanup(예: 7일 후 정리) 추가

C) 버킷을 새로 만들어 데이터 이전

D) Storage Lens로 알림만 설정

**정답: B**
해설: Lifecycle의 Incomplete Multipart Upload Cleanup 규칙은 지정 일수 후 미완료 멀티파트 업로드를 자동 삭제해 누적 비용을 막는다. A는 수동·반복 작업으로 누락 위험이 크다. C는 근본 원인을 해결하지 못한다. D는 가시성만 줄 뿐 정리하지 않는다. 함정: 미완료 멀티파트 누적은 Lifecycle Cleanup 규칙으로 자동화한다.

---

**문제 7.** 사설 서브넷의 워크로드가 KMS·SQS·CloudWatch Logs 등 여러 AWS 서비스를 호출하는데, 모든 트래픽이 NAT Gateway를 거쳐 처리량 요금이 크다. S3·DynamoDB가 아닌 이들 서비스의 NAT 비용을 줄이려면?

A) S3 Gateway Endpoint 추가

B) 각 서비스에 대해 Interface Endpoint(PrivateLink) 추가

C) NAT Gateway를 더 추가

D) 인터넷 Gateway로 직접 연결

**정답: B**
해설: S3·DynamoDB 외의 대부분 AWS 서비스(KMS·SQS·SNS·ECR·Logs 등)는 Interface Endpoint(PrivateLink)로 사설 접근하며, ENI를 통해 NAT를 우회한다. 시간당+데이터 요금이 있지만 대량 트래픽에선 NAT 처리량 요금보다 보통 저렴하다. A(Gateway Endpoint)는 S3·DynamoDB 전용이라 이들 서비스에 쓸 수 없다. C는 비용을 늘린다. D는 사설 모델을 깬다. 함정: S3/DynamoDB=Gateway(무료), 그 외=Interface다.
