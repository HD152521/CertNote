# Day 4 - 비용·지속 가능성 기둥 심화 — 단위 경제학, 탄소 회계의 규제 뿌리, 두 기둥의 trade-off

클라우드 비용을 줄이는 가장 흔한 실수는 "총액"만 보는 것이다. 월 청구서가 10만 달러에서 9만 달러로 줄면 성공처럼 보이지만, 같은 기간 트래픽이 절반으로 줄었다면 사실은 **단위 비용이 악화**된 것이다. Cost Optimization(비용 최적화)의 진짜 지표는 총액이 아니라 **단위 경제학(unit economics) — 요청당·사용자당·거래당 비용**이다. Sustainability(지속 가능성)도 같은 사고를 탄소로 옮긴 것이다 — 절대 배출량이 아니라 "유용한 작업당 탄소"를 줄이는 것이 핵심이다.

SAP-C02에서 두 기둥은 "Graviton 전환으로 비용·전력 동시 절감", "idle 비용 0", "콜드 데이터 자동 계층화", "탄소 배출 측정" 같은 키워드로 출제된다. 흥미롭게도 두 기둥은 대개 같은 방향(유휴 자원 제거)이지만 항상 일치하지는 않는다. 오늘은 단위 경제학, 탄소 회계의 규제 뿌리, 두 기둥의 trade-off까지 파고든다.

## Cost Optimization — 소비 모델과 단위 경제학

Cost의 5대 원칙은 "소비 모델 채택, 전체 효율 측정, 데이터센터 운영 비용 중단, 비용 분석, 관리형 서비스 활용"이다. 첫 번째 "소비 모델(consumption model)"이 클라우드 경제학의 핵심이다 — 쓴 만큼만 내고, 안 쓰면 0이다. 온프레미스는 피크 용량에 맞춰 미리 사야 하지만(고정비), 클라우드는 변동비로 전환된다.

| 카드 | 도구 | 효과 |
|------|------|------|
| 약정 할인 | Savings Plans·RI | 안정적 베이스라인 최대 72% 절감 |
| 스팟 | Spot Instance·Fargate Spot | 중단 허용 워크로드 최대 90% |
| 유휴 제거 | Auto Scaling·서버리스 | 안 쓰는 시간 비용 0 |
| 스토리지 계층화 | S3 Lifecycle·Intelligent-Tiering | 콜드 데이터 저비용 클래스로 |
| Right-sizing | Compute Optimizer | 과대 프로비저닝 축소 |
| 데이터 전송 절감 | VPC Endpoint·CloudFront | NAT·egress 비용 우회 |
| 비용 가시성 | Cost Allocation Tag·Budgets·Cost Anomaly Detection | 귀속·예산·이상 탐지 |
| 멀티 계정 공유 | Organizations 통합 결제 | SP/RI 공유·볼륨 티어 |

> 💡 **관련 이론**: "전체 효율 측정"은 재무의 **단위 경제학(unit economics)** 개념이다. SaaS 기업이 "고객 한 명을 서비스하는 데 드는 클라우드 비용(cost to serve)"을 추적하듯, 클라우드 비용은 절대액이 아니라 **비즈니스 산출물 대비 비용**으로 봐야 한다. 요청 100만 건당 비용, 활성 사용자당 비용이 진짜 지표다. 이 지표가 개선되면 트래픽이 늘어 총액이 올라도 건강한 성장이고, 악화되면 총액이 줄어도 비효율이 숨어 있다. AWS Cost Allocation Tag로 워크로드·팀·기능별 비용을 귀속시키는 것이 단위 경제학 측정의 출발점이다. 시험에서 "팀·기능별 비용 귀속·쇼백/차지백"이 보이면 Cost Allocation Tag + Cost Categories가 정답 신호다.

> 📚 **사례**: 2018년 Pinterest는 AWS 비용이 급증하자 원인을 추적하다 **데이터 전송(특히 AZ 간·인터넷 egress)**이 컴퓨팅 못지않은 큰 비중임을 발견했다. 같은 AZ 안에서 통신하도록 서비스를 재배치하고, S3 접근을 Gateway Endpoint로 돌리고, 외부 전송을 CloudFront로 옮겨 전송 비용을 크게 줄였다. 교훈: 비용 최적화는 컴퓨팅·스토리지만이 아니라 **보이지 않는 데이터 전송**까지 봐야 하며, Cost and Usage Report(CUR)로 리소스·시간 단위 청구를 분해해야 숨은 비용이 드러난다.

> 🔍 **더 깊이**: **데이터 전송 비용**은 시험의 숨은 단골이다. AWS는 인바운드(들어오는)는 대개 무료지만 아웃바운드(나가는)·리전 간·AZ 간 전송에 과금한다. 가장 흔한 절감 패턴 두 가지: (1) **VPC Endpoint** — 프라이빗 서브넷의 인스턴스가 S3·DynamoDB에 접근할 때 NAT Gateway를 거치면 NAT 처리 비용 + egress가 들지만, Gateway Endpoint(S3·DynamoDB 전용, 무료)를 쓰면 AWS 백본으로 직행해 NAT 비용이 사라진다. (2) **CloudFront** — 오리진(S3·ALB)에서 인터넷으로 직접 나가는 egress보다 CloudFront 경유 전송이 단가가 싸고 캐시로 오리진 요청도 준다. 시험에서 "NAT Gateway 데이터 처리 비용 절감"은 VPC Endpoint, "인터넷 egress 비용 절감"은 CloudFront다.

## 비용 가시성 도구 — 측정 없이는 최적화 없다

| 도구 | 역할 |
|------|------|
| **Cost Explorer** | 비용 추세 시각화·예측·SP/RI 추천 |
| **Cost and Usage Report(CUR)** | 가장 상세한 청구 데이터(시간·리소스 단위) |
| **Budgets** | 예산 임계치 알림·자동 액션 |
| **Cost Anomaly Detection** | ML 기반 비정상 지출 급증 탐지 |
| **Cost Allocation Tag·Cost Categories** | 팀·환경·기능별 비용 귀속 |
| **Compute Optimizer** | 메트릭 기반 right-sizing 권고 |
| **Trusted Advisor** | 유휴 리소스·미사용 RI 등 자동 체크 |

> ⚠️ **함정**: "비정상적 비용 급증을 자동 탐지·알림"은 **Cost Anomaly Detection**(ML 기반)이지 Budgets가 아니다. Budgets는 "사전에 정한 임계치(예: 월 1만 달러)를 넘으면 알림"하는 정적 임계 기반이고, Cost Anomaly Detection은 과거 패턴을 학습해 "평소와 다른 갑작스러운 급증"을 동적으로 잡는다. 둘은 보완 관계 — 예측 가능한 한도는 Budgets, 예측 불가능한 이상은 Anomaly Detection이다. 시험에서 "예상치 못한 갑작스러운 비용 급증 탐지"는 Cost Anomaly Detection이다.

## Sustainability — 탄소 회계의 규제 뿌리

Sustainability(2021년 추가)의 6대 원칙은 "영향 이해, 목표 설정, 사용률 최대화(유휴 0), 새 기술 적용, 관리형 서비스, 다운스트림 영향 감소"다. 핵심은 **"유용한 작업당 자원·탄소를 최소화"**다 — Cost와 거의 같은 사고를 전력·탄소로 옮긴 것이다.

| 실천 | 도구·기술 | 비용과의 관계 |
|------|-----------|--------------|
| 유휴 0 | Auto Scaling·서버리스·Fargate Spot | Cost와 일치(둘 다 ↓) |
| 동급 성능 저전력 | Graviton·Inferentia·Trainium | Cost와 일치 |
| 콜드 데이터 저전력 | S3 Storage Class·Lifecycle | Cost와 일치 |
| 재생에너지 리전 | 리전 선택(AWS 공식 데이터) | 비용과 무관(리전별 단가 차이만) |
| 컴퓨팅 밀집 | EKS Bin Packing·Fargate | Cost와 일치 |
| 탄소 측정 | Customer Carbon Footprint Tool(CCFT) | 가시화 도구 |

> 💡 **관련 이론**: AWS의 2025년 100% 재생에너지·2040 Net-Zero 목표(원래 2030 → 5년 앞당김)는 PR이 아니라 **규제 대응**이다. EU의 **CSRD(Corporate Sustainability Reporting Directive)**는 2024년부터 대기업의 **Scope 3(공급망 포함 간접 배출)** 보고를 의무화했다. 온실가스 회계의 GHG Protocol은 배출을 Scope 1(직접), Scope 2(구매 전력), Scope 3(공급망·간접)로 나누는데, 기업이 클라우드를 쓰면 그 탄소는 기업의 Scope 3에 들어간다. 이 수치는 AWS가 제공한 데이터(CCFT)를 그대로 신고하므로, **CCFT의 정확도가 곧 고객 ESG 보고의 정확도**가 된다. 시험에서 "ESG 보고·Scope 3·탄소 측정"이 보이면 CCFT가 정답 신호다.

> 🔍 **더 깊이**: **Embodied Carbon(내재 탄소)**은 Sustainability의 미묘한 개념이다. 서버의 탄소 발자국은 운영 중 전력(operational carbon)만이 아니라 **제조·운반·폐기에 들어간 탄소(embodied carbon)**도 포함한다. 그래서 "사용률 최대화"가 Sustainability 원칙인 이유가 명확해진다 — 이미 만들어진 하드웨어(embodied carbon은 이미 발생)를 놀리면 그 내재 탄소가 낭비된다. 100대를 30%씩 쓰는 것보다 30대를 100%씩 쓰는 게 내재 탄소·전력 모두에서 낫다. 이것이 EKS Bin Packing(인스턴스에 파드를 빽빽이 채워 노드 수 최소화), Fargate, 서버리스가 Sustainability 점수를 올리는 근거다.

> 📚 **사례**: 2019년 한 글로벌 미디어 기업이 비용 절감을 위해 야간·주말에 트래픽이 거의 없는 개발·스테이징 환경을 24시간 켜두던 관행을 바꿔, **Instance Scheduler(Lambda + EventBridge)**로 업무 시간 외 자동 종료를 도입했다. 결과적으로 비개발 환경 비용이 약 60% 줄었고, 같은 양의 컴퓨팅을 켜두지 않으니 탄소 배출도 비례해 감소했다. 교훈은 "유휴 자원은 비용과 탄소를 동시에 낭비한다"는 Sustainability·Cost 일치 원칙의 전형이다. 반대로, 이 회사가 production DR 환경까지 야간 종료했다면 RTO를 망쳐 Reliability를 희생했을 것이다 — 어느 환경에 적용할지가 trade-off 판단의 핵심이었다.

> ⚠️ **함정**: "재생에너지 리전으로 이전"이 보이면 Sustainability는 개선되지만 **Cost와 무관하거나 오히려 악화**될 수 있다. 리전마다 서비스 단가가 다르고, 사용자에서 먼 리전으로 옮기면 지연(Performance)과 데이터 전송 비용이 늘 수 있다. 시험에서 "탄소만 줄이면 됨"이면 재생에너지 리전이 정답이지만, "비용도 동시에"라면 Graviton·유휴 제거처럼 두 기둥이 함께 개선되는 액션을 골라야 한다. 리전 이전은 탄소 전용 카드다.

## 두 기둥의 trade-off — 항상 일치하지는 않는다

Cost와 Sustainability는 대개 같은 방향이지만, Pro 시험은 일치하지 않는 경우를 함정으로 낸다.

| 액션 | Cost | Sustainability | 비고 |
|------|------|----------------|------|
| Graviton 전환 | ↓ | ↓ | 둘 다 개선(전형적 정답) |
| 유휴 인스턴스 종료 | ↓ | ↓ | 둘 다 개선 |
| FSx Lustre(HPC) | ↑ | 성능↑ | 비용 오르지만 처리량 위해 수용 |
| 재생에너지 리전 이전 | 변동 | ↓ | 탄소↓이나 비용은 리전 단가·지연에 따라 |
| 과도한 Multi-Region | ↑ | ↑(자원↑) | 안정성 위해 비용·탄소 증가 감수 |

> 🎯 **시나리오**: "한 회사가 비용과 탄소 배출을 동시에 줄이라는 경영진 지시를 받았다. 현재 x86 EC2에서 웹·앱 워크로드를 운영 중이다. 가장 효과적인 단일 액션은?" — 답: **Graviton(ARM) 전환**. Graviton은 ARM Neoverse 기반으로 동급 x86 대비 가격·전력 모두 우위(가격 성능비 최대 40% 개선, 전력 대폭 절감)다. 한 번의 전환으로 Cost·Sustainability 두 기둥을 동시에 만족하는 것이 Pro 정답의 전형이다. 다만 ARM 호환 빌드가 필요하므로 컴파일 언어·컨테이너 워크로드에 우선 적용한다. "비용·환경 동시 개선"은 거의 항상 Graviton이 정답 신호다.

> 🔍 **더 깊이**: Graviton의 전력 우위는 **명령어 집합 아키텍처(ISA)**의 차이에서 온다. x86은 CISC(복잡 명령어)로 한 명령이 많은 일을 하지만 디코딩·실행 회로가 복잡해 전력을 더 먹는다. ARM은 RISC(축소 명령어)로 단순 명령을 빠르게 처리해 와트당 성능(performance per watt)이 높다 — 원래 모바일·임베디드용으로 전력 효율이 설계 목표였다. AWS는 이 ARM 코어(Neoverse)를 직접 칩으로 만들어(Graviton2/3/4) 데이터센터에 넣었다. 같은 사상의 특화 칩이 ML용 **Inferentia**(추론)·**Trainium**(학습)으로, GPU 대비 와트당 성능·비용을 개선한다. 시험에서 "추론 비용·전력 절감"은 Inferentia, "대규모 학습 비용 절감"은 Trainium이 정답 신호다.

> 💡 **관련 이론**: Spot Instance의 경제학은 **2차 시장(secondary market)**과 같다. AWS는 약정·온디맨드로 안 팔린 여유 용량을 경매로 풀어 가동률을 높이고(공급자 이익), 고객은 회수 위험을 떠안는 대가로 최대 90% 할인을 받는다(수요자 이익). 핵심 제약은 **2분 전 회수 통보**이므로, stateless·체크포인트 가능·재실행 가능 워크로드(배치·CI/CD·렌더링·분산 학습)에만 적합하다. Sustainability 관점에서도 Spot은 유휴 용량을 활용하므로 "이미 켜진 자원의 사용률 최대화"라는 원칙과 일치한다. 시험에서 "중단 허용 + 최대 비용 절감"은 Spot/Fargate Spot이 직답이다.

## 멀티 계정 비용 — 통합 결제와 BillingConductor

Organization 통합 결제는 비용 측면에서 두 가지를 준다: **(1) SP/RI 공유**(한 계정에서 산 약정이 전 계정에 적용), **(2) 볼륨 티어 할인**(사용량을 합산해 더 높은 할인 구간 진입). 계정을 비용 분리 목적으로 나누되 할인은 공유하는 것이 멀티 계정 비용 설계의 핵심이다. 부서별로 마진·할인을 다르게 재배분(쇼백/차지백)하려면 **AWS BillingConductor**로 커스텀 청구 그룹·요율을 설정한다.

## 정리하며

Cost Optimization은 총액이 아니라 단위 경제학(요청당·사용자당 비용)으로 측정하며, 소비 모델·약정 할인·Spot·유휴 제거·스토리지 계층화·데이터 전송 절감(VPC Endpoint·CloudFront)으로 구현한다. Sustainability는 같은 사고를 탄소로 옮겨 "유용한 작업당 탄소"를 줄이며, 유휴 0·Graviton·재생에너지 리전·CCFT로 측정·개선한다. 두 기둥은 대개 일치하지만(Graviton·유휴 제거), HPC Lustre처럼 trade-off가 생기는 경우를 구분해야 한다. CCFT는 EU CSRD의 Scope 3 보고와 직결돼 규제 가치를 가진다.

SAP 시험 단골 매핑: (1) "비용·전력·탄소 동시 절감, 동급 성능" → **Graviton 전환**, (2) "탄소 배출 측정·ESG/Scope 3 보고" → **CCFT**, (3) "콜드 데이터 자동 저비용·저탄소" → **S3 Lifecycle/Intelligent-Tiering**, (4) "예측 못 한 갑작스러운 비용 급증 탐지" → **Cost Anomaly Detection**(Budgets 아님), (5) "팀·기능별 비용 귀속" → **Cost Allocation Tag/Cost Categories**, (6) "NAT 데이터 처리 비용 절감" → **VPC Endpoint**, (7) "멀티 계정 SP/RI 공유 + 볼륨 할인" → **Organizations 통합 결제**, (8) "부서별 커스텀 청구·차지백" → **BillingConductor**, (9) "유휴 0 + 중단 허용 컴퓨팅" → **Fargate Spot/서버리스**. 다음 day는 6 기둥을 한 시나리오로 통합하는 종합 복습이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 x86 EC2에서 웹·앱 워크로드를 운영 중이며, 경영진이 비용과 탄소 배출을 동시에 줄이라고 지시했다. 동급 성능을 유지하면서 가장 효과적인 단일 액션은?

A) Intel x86 최신 세대로 업그레이드

B) Graviton(ARM) 기반 인스턴스로 전환

C) GPU 인스턴스(F1)로 전환

D) 더 큰 인스턴스 타입으로 통합

**정답: B**
해설: Graviton은 ARM Neoverse 기반으로 동급 x86 대비 가격 성능비(최대 40% 개선)와 전력 효율이 모두 우위라, 한 번의 전환으로 Cost·Sustainability 두 기둥을 동시에 만족한다 — Pro 정답의 전형. A는 비용·탄소 대폭 개선이 어렵고, C(F1/GPU)는 특수 워크로드용으로 비용이 오르며, D는 right-sizing 역행이다. 함정: "비용·환경 동시 개선 + 동급 성능"은 거의 항상 Graviton이다.

---

**문제 2.** 한 대기업이 EU CSRD에 따라 클라우드 사용으로 인한 Scope 3 탄소 배출을 ESG 보고서에 포함해야 한다. AWS 사용분의 월별 탄소 배출 데이터를 얻으려면 무엇을 사용하나?

A) Trusted Advisor

B) Customer Carbon Footprint Tool(CCFT)

C) Cost Explorer

D) Sustainability Lens

**정답: B**
해설: CCFT는 AWS 사용으로 인한 Scope 1·2·3 탄소 배출을 월별로 보고하며, 이 데이터가 그대로 고객 ESG 보고(Scope 3)에 들어간다. A(Trusted Advisor)는 비용·보안 체크지 탄소 측정이 아니다. C(Cost Explorer)는 비용 데이터다. D(Sustainability Lens)는 아키텍처 가이드일 뿐 측정 도구가 아니다. 함정: "탄소 측정·ESG·Scope 3"은 CCFT, Sustainability Lens는 설계 가이드로 구분한다.

---

**문제 3.** 한 회사의 클라우드 비용이 평소와 다르게 갑자기 급증했는데, 어떤 워크로드나 서비스가 원인인지 모른다. 사전에 정한 예산 임계치와 무관하게 비정상적 지출 패턴을 자동으로 탐지·알림받고 싶다. 가장 적합한 도구는?

A) AWS Budgets

B) Cost Anomaly Detection

C) Cost and Usage Report

D) Compute Optimizer

**정답: B**
해설: Cost Anomaly Detection은 과거 지출 패턴을 ML로 학습해 "평소와 다른 갑작스러운 급증"을 동적으로 탐지·알림한다. A(Budgets)는 사전에 정한 정적 임계치 초과 시 알림하는 것으로 "예측 못 한 이상"은 못 잡는다. C(CUR)는 상세 청구 데이터지 자동 이상 탐지가 아니다. D는 right-sizing 권고다. 함정: "예측 못 한 비정상 급증 탐지"는 Cost Anomaly Detection, "사전 임계치 알림"은 Budgets다.

---

**문제 4.** 프라이빗 서브넷의 EC2 인스턴스들이 S3에 대량의 데이터를 읽고 쓰는데, 현재 NAT Gateway를 경유해 NAT 데이터 처리 비용이 크다. 이 비용을 제거하는 가장 적합한 방법은?

A) NAT Gateway를 더 큰 크기로 변경

B) S3용 Gateway VPC Endpoint를 추가해 NAT 없이 AWS 백본으로 직행

C) S3 버킷을 퍼블릭으로 전환

D) CloudFront를 S3 앞에 배치

**정답: B**
해설: S3·DynamoDB용 Gateway VPC Endpoint는 무료이며, 프라이빗 서브넷에서 NAT Gateway를 거치지 않고 AWS 백본으로 직행해 NAT 데이터 처리 비용과 egress를 없앤다. A는 비용을 줄이지 못하고, C는 보안 위반이며, D(CloudFront)는 인터넷 egress·캐싱용이지 VPC 내부 S3 접근의 NAT 비용 제거가 아니다. 함정: "NAT 데이터 처리 비용 제거"는 VPC(Gateway) Endpoint다.

---

**문제 5.** 한 Organization이 비용 분리를 위해 부서별로 계정을 나눴지만, 약정 할인(SP/RI)과 볼륨 할인은 전체에서 공유하고 싶다. 가장 적합한 구성은?

A) 각 계정이 독립 결제로 분리

B) Organizations 통합 결제를 사용해 SP/RI 공유와 볼륨 티어 할인을 전 계정에 적용

C) 모든 워크로드를 단일 계정으로 통합

D) On-Demand만 사용

**정답: B**
해설: Organizations 통합 결제는 SP/RI를 전 계정에 공유하고, 사용량을 합산해 더 높은 볼륨 티어 할인을 적용한다. 계정을 비용 분리 목적으로 나누되 할인은 공유하는 것이 멀티 계정 비용 설계의 핵심이다. A는 할인 공유·볼륨 합산을 잃고, C는 비용 분리를 포기하며, D는 약정 할인을 포기한다. 함정: "계정 분리 + 할인 공유"는 통합 결제다.

---

**문제 6.** 다음 중 Cost와 Sustainability 두 기둥이 **항상 같은 방향으로 개선되지는 않는** 경우의 예로 가장 적절한 것은?

A) 유휴 인스턴스를 종료한다 (둘 다 ↓)

B) Graviton으로 전환한다 (둘 다 ↓)

C) HPC 처리량을 위해 FSx for Lustre를 도입한다 (비용 ↑, 성능 ↑)

D) Auto Scaling으로 유휴 시간을 줄인다 (둘 다 ↓)

**정답: C**
해설: FSx for Lustre는 처리량·성능을 위해 비용이 오르는 경우로, "비용↓"라는 Cost 목표와 반드시 일치하지 않는다. Sustainability 관점에서도 고성능 스토리지가 항상 저탄소는 아니다. A·B·D는 모두 Cost와 Sustainability가 동시에 개선되는 전형적 일치 사례다. 함정: 두 기둥은 대개 일치하지만(유휴 제거·Graviton), 고성능을 위해 비용을 감수하는 경우처럼 trade-off가 존재함을 Pro는 구분해야 한다.

---
