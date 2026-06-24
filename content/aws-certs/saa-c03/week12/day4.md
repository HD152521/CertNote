# Day 4 - 비용 도메인은 왜 "운영이 아니라 설계 단계의 결정"으로 수렴하나

SAA 시험에서 비용 최적화(도메인 4)는 전체의 20%를 차지한다. 비중만 보면 보안(30%)보다 작지만, 이 도메인이 까다로운 이유는 따로 있다. 다른 도메인이 "무엇이 동작하는가"를 묻는다면 비용 도메인은 "동작하는 여러 방식 중 어느 것이 가장 싼가"를 묻는다. 즉 정답이 기능적으로 틀린 게 아니라 **돈이 더 드는** 보기를 골라내야 한다. 그래서 키워드 매핑만으로는 부족하고, 각 절감 수단이 **어느 비용 축(컴퓨팅·스토리지·네트워크·운영)에서, 어떤 트레이드오프를 대가로** 돈을 깎는지를 이해해야 한다.

이 글은 비용 도메인을 단순 암기표가 아니라 "한 워크로드가 청구서를 만들어 내는 네 개의 수도꼭지"라는 흐름으로 다시 엮는다. 컴퓨팅(가장 큰 항목), 스토리지(시간이 지날수록 누적), 네트워크(보이지 않게 새는 곳), 그리고 운영·거버넌스(낭비를 발견하고 막는 계층)까지를 하나의 절감 체인으로 따라간다. 시험의 함정 대부분은 이 네 축에서 "약정의 구속력", "최소 보관 기간", "데이터 전송 방향"이라는 숨은 비용을 빠뜨리게 만드는 데서 나온다.

> 💡 **관련 이론**: 비용 최적화의 사고 틀에는 **FinOps**(Financial Operations)라는 운영 문화가 깔려 있다. 2019년 FinOps Foundation(현재 Linux Foundation 산하)이 정립한 이 프레임워크는 클라우드 비용을 엔지니어·재무·경영이 함께 책임지는 세 단계 — Inform(가시화)·Optimize(최적화)·Operate(운영 정착) — 의 순환으로 본다. 핵심 통찰은 클라우드가 **자본 지출(CapEx)을 운영 지출(OpEx)로 바꿨다**는 것이다. 과거 서버를 한 번 사면 끝이던 비용이, 이제는 매 시간 켜져 있는 만큼 청구되는 가변 비용으로 변했다. 그래서 "쓴 만큼 낸다"는 종량제의 이점은 "안 쓰는데 켜 두면 그대로 샌다"는 위험과 동전의 양면이다. AWS Well-Architected Framework의 다섯 기둥 중 **Cost Optimization** 기둥이 "불필요한 자원 제거 → 적정 크기 → 약정 활용 → 지출 분석"의 순서를 강조하는 것도 같은 맥락이다.

## 컴퓨팅 비용은 "약정의 구속력과 워크로드의 중단 허용도"라는 두 축으로 갈린다

청구서에서 가장 큰 비중을 차지하는 건 거의 언제나 컴퓨팅(EC2/Lambda/컨테이너)이다. 그래서 컴퓨팅 절감의 선택지를 정확히 구분하는 게 도메인 4의 절반이다. 핵심 질문은 두 가지다 — **(1) 이 워크로드가 1년/3년을 꾸준히 돌 것인가(약정 가능?)**, 그리고 **(2) 갑자기 꺼져도 되는가(중단 허용?)**. 이 두 축의 조합이 정답을 결정한다.

꾸준히 도는 워크로드라면 **약정 할인**을 쓴다. **Savings Plans**는 "시간당 일정 금액($/h)을 1년 또는 3년간 쓰겠다"는 약정으로 최대 72%를 깎는다. 그중 **Compute Savings Plan**은 인스턴스 패밀리·리전·OS·테넌시를 가리지 않고(심지어 Fargate·Lambda까지) 유연하게 적용돼 할인율은 낮고, **EC2 Instance Savings Plan**은 특정 패밀리·리전에 묶이는 대신 할인율이 가장 높다. **Reserved Instance(RI)**는 더 오래된 약정 모델로, EC2뿐 아니라 **RDS·Redshift·ElastiCache·OpenSearch처럼 Savings Plans가 적용되지 않는 서비스**의 약정 할인 수단으로 여전히 핵심이다 — 이 점이 시험 단골이다.

중단을 허용하는 워크로드(stateless 배치, fault-tolerant 처리)라면 **Spot Instance**가 압도적이다. 남는 EC2 용량을 최대 90% 싸게 빌리되, AWS가 2분 경고 후 회수할 수 있다. 여기에 인스턴스 자체를 더 싸고 빠르게 만드는 축으로 **Graviton**(AWS 자체 설계 ARM 프로세서)이 있어 동급 x86 대비 약 20% 더 저렴하면서 전력 효율이 높고, **right-sizing**은 **Compute Optimizer**가 실측 사용률을 ML로 분석해 과대 프로비저닝된 인스턴스를 찾아 준다.

> 🔍 **더 깊이**: Spot Instance가 "남는 용량을 싸게"라는 단순 설명 뒤에는 **2차 가격 경매에서 고정 가격 모델로의 전환**이라는 역사가 있다. 2009년 출시 당시 Spot은 진짜 경매였다 — 사용자가 입찰가(bid)를 제시하고, 시장 Spot 가격이 입찰가를 넘으면 인스턴스가 회수되는 변동 가격 구조였다. 가격이 분 단위로 출렁여 예측이 어려웠다. 2017년 AWS는 이 모델을 폐기하고, 가격이 수요·공급에 따라 완만하게만 변하는 **예측 가능한 고정 가격**으로 바꿨다. 지금의 Spot은 "입찰"이 아니라 "현재 Spot 가격을 받아들이고, 용량이 부족해지면 2분 경고 후 회수"하는 방식이다. 이 변화 덕에 Spot은 더 다루기 쉬워졌고, EC2 Auto Scaling의 혼합 인스턴스 정책이나 EKS/ECS의 Spot 통합으로 "회수되면 다른 Spot/On-Demand로 자동 대체"하는 패턴이 표준이 됐다. 시험에서 Spot은 항상 "**상태를 잃어도 되고, 중단을 견디는**" 워크로드와만 짝지어야 한다.

> 📚 **사례**: Pinterest는 2010년대 중반 EC2 비용이 폭증하자 워크로드의 상당 부분을 Spot으로 옮겨 컴퓨팅 비용을 크게 줄인 대표적 사례로 자주 인용된다. 핵심은 단순히 Spot을 켠 게 아니라, **작업을 체크포인트 가능하게(중단 후 재개 가능하게) 재설계**하고 여러 인스턴스 타입에 걸쳐 분산해 한 타입의 Spot이 회수돼도 전체가 멈추지 않게 만든 것이다. 여기서 시험의 교훈이 나온다 — Spot의 90% 할인은 공짜가 아니라 "아키텍처가 중단을 견디도록 설계됐을 때만" 받을 수 있는 할인이다. 그래서 SAA는 Spot을 "fault-tolerant" "stateless" "체크포인트" 같은 신호어와 함께 출제하고, "DB 같은 stateful 워크로드에 Spot"은 항상 오답으로 둔다.

> ⚠️ **함정**: Savings Plans와 RI를 "그냥 할인"으로 뭉뚱그리면 두 가지에서 틀린다. 첫째, **Compute SP는 환불/취소가 불가능**한 약정이다("이미 약정했으니 무를 수 없다"). 둘째, **RDS·Redshift·ElastiCache는 Savings Plans가 적용되지 않아 반드시 RI**여야 한다 — "RDS를 24/7 돌리는데 가장 싸게"라는 문제에서 "Compute SP"를 고르면 함정에 빠진다. 정답은 RDS Reserved Instance다. 또 하나, Compute Optimizer는 켜야(opt-in) 권고가 나오는 서비스라, "right-sizing 권고를 받으려면?"의 답은 "Compute Optimizer 활성화"다.

## 스토리지 비용은 "접근 빈도와 최소 보관 기간"이라는 시간 축으로 계층화된다

스토리지는 한 번 넣으면 줄어들지 않고 누적되는 비용이라, 시간이 지날수록 청구서를 잠식한다. S3 스토리지 클래스는 본질적으로 **"이 데이터를 얼마나 자주 보느냐"와 "잃어도 되느냐"**를 가격으로 환산한 스펙트럼이다. 자주 보면 Standard, 가끔 보면 IA(Infrequent Access), 거의 안 보면 Glacier 계열로 내려가며, 내려갈수록 저장 단가는 싸지지만 **꺼낼 때 비용(retrieval)과 지연**이 붙는다.

핵심 클래스를 신호어로 정리하면 이렇다. **접근 패턴을 모르겠다**면 **S3 Intelligent-Tiering** — 접근을 모니터링해 자동으로 계층을 옮겨 주는, 시험의 압도적 단골 정답이다. **즉시 접근하지만 자주는 아니다**면 **Standard-IA**, 그 데이터가 **재생성 가능(잃어도 됨)**하면 단일 AZ에만 두는 더 싼 **One Zone-IA**다. 아카이브로 가면 **분기에 한 번이라도 밀리초 접근**이 필요하면 **Glacier Instant Retrieval**, 7년 이상 규제 보관처럼 **거의 안 꺼내고 가장 싸게**면 **Glacier Deep Archive**(꺼내는 데 시간 소요)다. EBS는 이제 **gp3가 기본**으로, gp2와 같은 가격에 더 나은 기본 성능을 주고 IOPS·처리량을 독립적으로 조절할 수 있다.

> 💡 **관련 이론**: 스토리지 계층화의 뿌리는 컴퓨터 구조의 **메모리 계층(memory hierarchy)** 원리와 정확히 같다. CPU 레지스터 → L1/L2 캐시 → RAM → SSD → HDD → 테이프로 내려갈수록 용량당 비용은 싸지지만 접근 지연은 커진다. S3의 Standard → IA → Glacier → Deep Archive는 이 계층 원리를 클라우드 객체 스토리지에 그대로 옮긴 것이다. 그리고 그 자동화 버전이 **계층적 스토리지 관리(HSM, Hierarchical Storage Management)** — 메인프레임 시대부터 "오래 안 쓴 데이터를 자동으로 더 싼 매체로 내리고, 다시 쓰면 끌어올리는" 기법이었다. S3 Intelligent-Tiering과 Lifecycle 정책이 바로 이 HSM의 클라우드 구현이다. 데이터의 "온도(hot/warm/cold)"에 따라 저장 위치를 바꾼다는 발상은 50년 된 보편 설계다.

> ⚠️ **함정**: 스토리지 클래스에는 **최소 보관 기간(minimum storage duration)**이라는 숨은 함정이 있다. Standard-IA·One Zone-IA는 **30일**, Glacier Instant/Flexible은 **90일**, Deep Archive는 **180일** 미만에 삭제하거나 다른 클래스로 옮기면 남은 기간만큼 요금을 문다. 그래서 "수명이 7일인 임시 데이터를 IA로 보내 절감하자"는 보기는 오히려 더 비싸지는 함정이다 — 30일치를 물기 때문이다. 또 하나, Glacier는 **꺼낼 때(retrieval) 비용과 시간**이 별도다. "거의 안 보지만 가끔 빨리 꺼내야 한다"면 단가만 보고 Deep Archive를 고르면 안 되고 Glacier Instant Retrieval이 맞다. "저장 단가가 가장 싼 것"과 "총비용이 가장 싼 것"은 다르다.

## 네트워크 비용은 "데이터 전송 방향과 경로"라는 보이지 않는 축에서 샌다

네트워크 비용은 청구서에서 가장 추적하기 어렵게 새는 항목이다. 핵심 규칙은 단순하다 — **인바운드(AWS로 들어오는 데이터)는 대체로 무료, 아웃바운드(인터넷으로 나가는 데이터)는 유료**, 그리고 **리전 간(Cross-Region)·AZ 간(Cross-AZ) 전송에도 돈이 붙는다**. 이 방향성을 모르면 "왜 청구서에 Data Transfer가 이렇게 크지?"라는 미스터리가 생긴다.

절감 패턴은 경로를 바꾸는 데서 나온다. 프라이빗 서브넷의 EC2가 **S3나 DynamoDB에 접근**할 때 NAT Gateway를 거치면 NAT 처리 비용 + 아웃바운드 비용이 드는데, **S3/DynamoDB용 Gateway Endpoint는 무료**라 NAT를 우회해 비용을 없앤다(이게 시험 단골). 다른 AWS 서비스용 **Interface Endpoint(PrivateLink)**는 시간당·GB당 요금이 있어 항상 절감은 아니다. 인터넷으로 콘텐츠를 자주 내보낸다면 **CloudFront**가 오리진 아웃바운드를 캐시 히트로 대체해 데이터 전송 비용을 줄이고(엣지에서 한 번 받아 여러 번 서빙), 같은 정보를 자주 주고받는 컴포넌트는 **같은 AZ에 배치**해 Cross-AZ 요금을 피한다.

> 🔍 **더 깊이**: "왜 같은 리전 안에서도 AZ가 다르면 데이터 전송에 돈이 붙는가?"의 답은 AWS 물리 인프라에 있다. 하나의 가용 영역(AZ)은 사실 하나 이상의 독립된 데이터센터 집합이고, 서로 다른 AZ는 **물리적으로 떨어진 별개의 시설**을 전용 광케이블로 연결한 것이다. 이 시설 간 링크는 무한한 공짜 대역폭이 아니라 AWS가 깔고 유지하는 실제 자원이라, Cross-AZ 트래픽에 GB당 소액(양방향 각 $0.01 수준)을 매긴다. 같은 발상이 NAT Gateway에도 적용된다 — NAT는 시간당 요금 + 처리 데이터 GB당 요금이라는 이중 과금 구조라, 대량 트래픽일수록 처리 요금이 커진다. 그래서 "S3로 가는 대량 트래픽을 NAT로 보내지 말고 Gateway Endpoint로"가 비용 면에서 결정적이다. 이 물리적 배경을 알면 "데이터를 어디에 두고 어느 경로로 보내느냐가 곧 비용"이라는 원리가 직관이 된다.

> 📚 **사례**: 스타트업들이 AWS 청구서를 처음 받고 가장 많이 놀라는 항목이 **NAT Gateway 데이터 처리 요금**이다. ECS/EKS 클러스터가 프라이빗 서브넷에서 S3로 대량의 로그·아티팩트를 주고받는데 그 트래픽이 전부 NAT를 통과하면, 처리 GB당 요금이 누적돼 월 수천 달러가 조용히 새는 경우가 흔하다. 여러 비용 컨설팅 사례에서 단일 조치로 가장 큰 절감을 낸 것이 "S3/DynamoDB Gateway Endpoint를 추가해 NAT를 우회"한 것이었다 — Gateway Endpoint 자체가 무료이기 때문에 즉시 NAT 처리 비용이 사라진다. 시험이 "프라이빗 EC2가 S3에 대량 접근, NAT 비용 절감"을 반복해서 묻는 이유다.

## 운영·거버넌스는 "낭비를 발견하고 사전에 막는" 가시성 계층이다

앞의 세 축이 "어떻게 싸게 쓰느냐"라면, 네 번째 축은 "어디서 새는지 보고, 새기 전에 막는" 통제 계층이다. 비용은 한 번 설계로 끝나지 않고 계속 변하므로, 가시성과 자동 차단이 없으면 절감 설계도 무너진다.

도구는 역할이 또렷이 갈린다. **Cost Explorer**는 과거 비용을 시각화하고 미래를 예측하며 **이상 탐지(Cost Anomaly Detection)**로 갑작스러운 급증을 잡는다. **AWS Budgets**는 예산 한도를 정하고 임계치 도달 시 알림을 보내며, **Budgets Actions**는 한도 초과 시 IAM 정책 적용·인스턴스 중지 같은 **자동 차단**까지 한다(따라서 "예산 100% 도달 시 자동으로 멈춰라"의 정답은 Budgets Actions다). 세분화된 라인 아이템 분석이 필요하면 **CUR(Cost and Usage Report)를 S3로 내보내 Athena로 쿼리**하는 게 정석이고, 부서·프로젝트별 비용 분리는 **Cost Allocation Tags**, 여러 계정의 청구를 묶어 볼륨 할인을 공유하는 건 **Consolidated Billing**(AWS Organizations)이다.

> 💡 **관련 이론**: Budgets Actions나 Cost Anomaly Detection이 작동하는 방식은 제어공학의 **피드백 제어 루프(feedback control loop)**와 같다. 목표값(예산 한도)을 정하고 → 실제값(현재 지출)을 측정해 → 둘의 오차를 감지하면 → 보정 동작(알림·차단)을 실행하는 닫힌 루프다. Cost Anomaly Detection은 여기에 ML 기반 **이상 탐지**를 얹어, 단순 임계치가 아니라 과거 패턴에서 벗어난 비정상 급증을 통계적으로 잡아낸다. 이는 가용성 도메인의 Auto Scaling(목표 사용률 대비 보정)과 동일한 제어 사상이다 — 측정 가능한 지표를 정해 두고, 벗어나면 자동으로 되돌린다. 비용을 "관리"한다는 건 결국 이 피드백 루프를 청구서에 거는 일이다.

> ⚠️ **함정**: 가시성 도구를 헷갈리면 시험에서 틀린다. **Cost Explorer는 분석·예측·이상 탐지**이지 자동 차단을 하지 않는다 — 자동으로 멈추려면 **Budgets Actions**다. **세분화된(태그·시간 단위) 분석**을 묻는데 "Cost Explorer"를 고르면 부족하다, 정답은 **CUR + Athena**다(가장 raw하고 세밀하기 때문). 그리고 멀티 계정에서 "비용을 한곳에서 보고 볼륨 할인을 공유"는 **Consolidated Billing**, 그 안에서 "계정 간 비용을 재배분·쇼백(showback)"하는 더 정교한 요구는 **Billing Conductor**다. "가시화 = Cost Explorer / 차단 = Budgets Actions / 세분화 = CUR+Athena"를 한 줄로 외워 두면 함정 대부분이 풀린다.

## 다른 클라우드의 비용 관리 모델 비교

AWS의 비용 도구를 상대화하면 키워드 매핑이 더 또렷해진다. 세 클라우드 모두 "약정 할인 + 가변 용량 할인 + 가시화 + 예산 통제"라는 같은 골격을 갖지만, 명칭과 약정 모델의 유연성이 다르다.

| 구분 | AWS | Azure | GCP |
|------|-----|-------|-----|
| 약정 할인 | Savings Plans / RI | Reserved Instances / Savings Plans | Committed Use Discounts(CUD) |
| 자동 할인(약정 불필요) | (없음) | (없음) | Sustained Use Discount(자동) |
| 스팟/저가 용량 | Spot Instances | Spot VMs | Spot VMs(구 Preemptible) |
| 비용 가시화 | Cost Explorer | Cost Management + Billing | Cloud Billing Reports |
| 예산·알림 | Budgets / Budgets Actions | Budgets + Action Groups | Budgets & Alerts |
| 세분화 분석 | CUR → Athena | Cost Management Exports | BigQuery Billing Export |

가장 눈에 띄는 차이는 **GCP의 Sustained Use Discount** — 한 달간 일정 비율 이상 켜져 있으면 약정 없이도 자동으로 할인이 붙는다. AWS는 이런 자동 할인이 없어 반드시 명시적으로 Savings Plans나 RI를 약정해야 한다. 이 차이 때문에 AWS 시험은 "꾸준한 워크로드 = 명시적 약정(SP/RI) 선택"을 반복해서 묻는다. 또 세분화 분석에서 AWS가 CUR을 S3로 내려 Athena로 SQL을 돌리는 반면, GCP는 청구 데이터를 BigQuery로 직접 내보내 분석한다는 점도 구조적으로 닮았다.

> 🔍 **더 깊이**: 모든 비용 결정의 배경에는 **공동 책임 모델(Shared Responsibility Model)**이 비용 관점에서도 작동한다. 관리형 서비스일수록 운영 비용이 요금에 녹아 들어가 "내가 직접 깎을 여지"가 줄어드는 대신, 운영 인건비·패치·가용성 관리 비용이 사라진다. 예컨대 EC2(IaaS)는 인스턴스 타입·약정·Spot으로 직접 비용을 통제할 여지가 크지만 OS·스케일링을 직접 책임져야 한다. 반면 Lambda·Fargate(서버리스)는 "요청/실행 시간만큼만" 자동 과금돼 유휴 비용이 0에 수렴하지만, 단가는 상대적으로 높을 수 있다. 그래서 "트래픽이 들쭉날쭉하고 유휴가 많다 = 서버리스가 총비용 우위", "꾸준히 풀로 돌린다 = 약정한 EC2가 우위"라는 판단이 갈린다. 비용 최적화는 결국 "이 워크로드의 사용 패턴에 어느 책임 경계가 맞는가"를 고르는 일이다.

## CLI로 직접 확인하기

```bash
# Cost Explorer로 지난달 서비스별 비용 조회
aws ce get-cost-and-usage \
  --time-period Start=2026-05-01,End=2026-06-01 \
  --granularity MONTHLY --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE

# 예산 생성 (월 $1000 한도)
aws budgets create-budget --account-id 111122223333 \
  --budget file://monthly-budget.json

# S3 Lifecycle 규칙으로 30일 후 Standard-IA, 90일 후 Glacier 전환
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-bucket --lifecycle-configuration file://lifecycle.json

# S3 Gateway Endpoint 생성 (NAT 우회, 무료)
aws ec2 create-vpc-endpoint --vpc-id vpc-0abc \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-0def

# Compute Optimizer 활성화 (right-sizing 권고 받기)
aws compute-optimizer update-enrollment-status --status Active
```

## 정리하며

비용 도메인은 키워드 매핑이 가장 단순해 보이지만, 실제로는 **"비용은 운영이 아니라 설계 단계에서 결정된다"**는 원리 위에 네 개의 수도꼭지가 놓인 구조다. ① **컴퓨팅**은 약정 가능성(SP/RI)과 중단 허용도(Spot)의 두 축으로 갈리고, RDS/Redshift/ElastiCache는 SP가 아닌 RI라는 예외를 기억해야 한다. ② **스토리지**는 접근 빈도와 최소 보관 기간(IA 30일·Glacier 90일·Deep Archive 180일)으로 계층화되며, "저장 단가"와 "총비용"은 다르다. ③ **네트워크**는 전송 방향(인바운드 무료·아웃바운드/Cross-AZ 유료)과 경로(Gateway Endpoint 무료 우회)에서 새고 막힌다. ④ **운영**은 가시화(Cost Explorer)·차단(Budgets Actions)·세분화(CUR+Athena)의 피드백 루프로 낭비를 통제한다. Pinterest의 Spot 재설계, 반복되는 NAT 비용 누수 사례는 "절감은 아키텍처가 그 트레이드오프를 견디도록 설계됐을 때만 받는 할인"임을 증명한다.

다음 글에서는 네 도메인을 가로지르는 최종 모의고사로 시험 직전 점검을 마무리한다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 RDS MySQL 인스턴스를 24시간 연중무휴로 운영하며 가장 큰 비용 절감을 원한다. 어떤 약정을 선택해야 하는가?

A) Compute Savings Plan

B) RDS Reserved Instance

C) EC2 Instance Savings Plan

D) Spot Instance

**정답: B**

해설: **Savings Plans는 RDS·Redshift·ElastiCache·OpenSearch에는 적용되지 않는다.** 이들 관리형 데이터 서비스의 약정 할인은 여전히 **Reserved Instance(RI)** 모델로만 받을 수 있다. A·C의 Savings Plan은 EC2/Fargate/Lambda 컴퓨팅에는 맞지만 RDS에는 적용 불가라 함정이다. D의 Spot은 stateful한 DB에 부적합하다(회수되면 데이터 손실 위험). "RDS/Redshift/ElastiCache를 꾸준히 = RI"가 핵심 신호다.

---

**문제 2.** 한 팀이 야간 배치 데이터 처리 작업을 실행한다. 작업은 stateless이고 중단 후 재시작이 가능하며, 비용을 최대한 줄이고 싶다. 적절한 컴퓨팅 옵션은?

A) On-Demand EC2

B) Reserved Instance

C) Spot Instance

D) Compute Savings Plan

**정답: C**

해설: **Spot Instance**는 남는 EC2 용량을 최대 90% 싸게 제공하지만 AWS가 2분 경고 후 회수할 수 있다. 따라서 **stateless·fault-tolerant·중단 재개 가능**한 워크로드(야간 배치, 빅데이터 처리)에 이상적이다. A는 비용이 가장 비싸고, B/D는 꾸준히 도는 워크로드의 약정 할인이라 "중단 OK한 배치"에는 과한 약정이다. Pinterest 사례처럼 Spot은 "체크포인트 가능하게 재설계됐을 때" 그 90% 할인을 안전하게 누린다. 신호어: "stateless / 중단 OK / 배치" = Spot.

---

**문제 3.** 프라이빗 서브넷의 EC2 인스턴스들이 S3에 대량의 데이터를 읽고 쓴다. 현재 모든 트래픽이 NAT Gateway를 거쳐 데이터 처리 비용이 크게 발생한다. 가장 효과적인 절감 방법은?

A) NAT Gateway를 NAT Instance로 교체

B) S3 Gateway Endpoint를 생성해 NAT를 우회

C) Interface Endpoint(PrivateLink)를 추가

D) CloudFront를 앞단에 배치

**정답: B**

해설: **S3/DynamoDB용 Gateway Endpoint는 자체 비용이 무료**이며, 프라이빗 서브넷 트래픽이 NAT를 거치지 않고 직접 S3로 가게 해 NAT 데이터 처리 요금을 즉시 없앤다. A의 NAT Instance 교체는 운영 부담만 늘고 근본 해결이 아니며, C의 Interface Endpoint는 시간당·GB당 요금이 있어 항상 절감은 아니다(S3는 Gateway Endpoint가 정답). D의 CloudFront는 인터넷 배포 캐싱용이지 내부 S3 접근 경로 비용과 무관하다. "프라이빗 EC2 → S3 대량, NAT 비용 ↓ = Gateway Endpoint"가 단골 정답이다.

---

**문제 4.** 한 회사가 수명이 7일인 임시 로그 데이터를 S3에 저장한다. 비용을 줄이려고 즉시 Standard-IA로 저장하자는 제안이 나왔다. 이 제안의 문제는?

A) IA는 즉시 접근이 불가능해 로그를 못 읽는다

B) Standard-IA는 최소 보관 기간 30일이라 7일 데이터는 오히려 더 비싸진다

C) IA는 내구성이 낮아 로그가 손실될 수 있다

D) 문제 없다, 가장 좋은 선택이다

**정답: B**

해설: **Standard-IA·One Zone-IA는 최소 보관 기간이 30일**이다. 30일 이전에 삭제하면 남은 기간만큼의 요금을 물어야 하므로, **수명 7일짜리 데이터를 IA에 넣으면 30일치를 청구**받아 오히려 비싸진다. A는 틀렸다(IA도 즉시 밀리초 접근 가능), C도 틀렸다(Standard-IA는 Standard와 동일한 11 9s 내구성). 단기 데이터는 Standard에 두고 Lifecycle로 만료시키는 게 맞다. "최소 보관 기간(IA 30일·Glacier 90일·Deep Archive 180일)" 함정은 비용 도메인 단골이다.

---

**문제 5.** 운영팀이 월 예산 한도에 도달하면 알림을 넘어 비프로덕션 EC2 인스턴스를 자동으로 중지하고 싶다. 적절한 도구는?

A) Cost Explorer

B) AWS Budgets + Budgets Actions

C) CUR + Athena

D) Cost Allocation Tags

**정답: B**

해설: 단순 가시화·예측은 Cost Explorer지만, **예산 임계치 도달 시 자동 동작(인스턴스 중지·IAM 정책 적용)**까지 하려면 **AWS Budgets의 Budgets Actions**가 필요하다. A의 Cost Explorer는 분석·이상 탐지만 하고 자동 차단을 못 한다. C의 CUR+Athena는 세분화된 사후 분석용이고, D의 Cost Allocation Tags는 비용 귀속(부서 분리)용이다. "예산 도달 → 자동 차단/중지 = Budgets Actions"가 핵심 신호다.

---

**문제 6.** 한 회사가 수백 개의 라인 아이템으로 구성된 청구서를 태그·시간 단위로 세밀하게 SQL 분석하고 싶다. 가장 적절한 방법은?

A) Cost Explorer의 그래프를 본다

B) Cost and Usage Report(CUR)를 S3로 내보내 Athena로 쿼리

C) Budgets에서 리포트를 받는다

D) CloudWatch 대시보드를 만든다

**정답: B**

해설: 가장 raw하고 세분화된 비용 데이터는 **CUR(Cost and Usage Report)**이며, 이를 S3로 내보내 **Athena로 SQL 쿼리**하면 태그·시간·리소스 단위의 임의 분석이 가능하다. A의 Cost Explorer는 시각화·예측에 좋지만 임의 SQL 수준의 세분화는 부족하다. C의 Budgets는 예산 통제용, D의 CloudWatch는 운영 메트릭용이라 청구 라인 아이템 분석에 맞지 않다. "세분화·태그 단위 분석 = CUR + Athena"가 단골 정답이다.

---

**문제 7.** 한 스타트업이 트래픽이 매우 불규칙하고 유휴 시간이 많은 API를 운영한다. 유휴 비용을 0에 가깝게 만들고 운영 부담도 줄이려 한다. 가장 적절한 컴퓨팅 선택은?

A) Reserved Instance로 약정한 EC2

B) Lambda(서버리스)

C) 24/7 켜 둔 On-Demand EC2

D) Spot Instance 풀

**정답: B**

해설: **트래픽이 불규칙하고 유휴가 많은 워크로드**는 요청/실행 시간만큼만 과금되는 **서버리스(Lambda)**가 유휴 비용을 0에 수렴시켜 총비용 우위다. A는 꾸준히 풀로 도는 워크로드에 맞는 약정이라 유휴가 많으면 낭비고, C는 유휴 시간에도 계속 과금돼 가장 비싸며, D의 Spot은 비용은 싸도 운영 부담(회수 처리)이 크고 불규칙 API 응답에 부적합하다. "들쭉날쭉 + 유휴 많음 = 서버리스가 총비용 우위"라는 공동 책임 모델 관점의 판단이 핵심이다.

---

## 📌 핵심 요약

비용 도메인(20%)은 "비용은 운영이 아니라 설계에서 결정된다"는 원리 위에 네 개의 수도꼭지가 놓인 구조다. ① 컴퓨팅은 약정 가능성(Savings Plans/RI)과 중단 허용도(Spot)로 갈리며, RDS·Redshift·ElastiCache는 SP가 아닌 RI라는 예외가 단골이다(Pinterest의 Spot 재설계 교훈). ② 스토리지는 접근 빈도와 최소 보관 기간(IA 30일·Glacier 90일·Deep Archive 180일)으로 계층화되고, "저장 단가"와 "총비용"은 다르다. ③ 네트워크는 전송 방향(인바운드 무료·아웃바운드/Cross-AZ 유료)과 경로(S3/DDB Gateway Endpoint 무료 우회)에서 새고 막히며, NAT 데이터 처리 요금 누수가 대표 사례다. ④ 운영은 가시화(Cost Explorer)·자동 차단(Budgets Actions)·세분화(CUR+Athena)의 피드백 루프로 통제한다. 모든 선택의 배경에는 "관리형·서버리스일수록 유휴 비용은 줄지만 직접 깎을 여지도 준다"는 공동 책임 모델의 비용 관점이 깔린다.
