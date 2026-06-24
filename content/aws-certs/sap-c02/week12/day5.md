# Day 5 - 비용 최적화 종합 복습: 약정·Spot의 수학과 숨은 비용의 trade-off

비용 최적화는 단순 "Reserved Instance를 사세요"가 아니다. Pro 시험은 **워크로드 패턴 + 약정 모델 + 즉시 할인 + 숨은 비용**의 4차원 매트릭스에서 최적 답을 찾는 trade-off 문제다. 같은 EC2라도 24시간 가동 / 야간 배치 / spike 트래픽 각각 정답이 다르고, NAT Gateway 같은 "보이지 않는" 비용이 종종 전체 청구의 30% 이상을 차지한다. 그리고 이 모든 결정은 Well-Architected Framework의 **Cost Optimization 기둥** 5개 설계 원칙(소비 모델 채택, 효율 측정, 데이터센터 운영 비용 제거, 지출 분석·귀속, 관리형 서비스로 TCO 절감) 위에 놓인다. 오늘은 12주차 비용 최적화 전체를 정리하고 Pro 시험의 함정을 짚는다.

## 약정 할인 모델 5종: 유연성 vs 할인율의 위험 스펙트럼

약정 할인의 본질은 **위험의 이전(risk transfer)**이다. AWS는 데이터센터에 물리 서버를 미리 사다 놓아야 하고(자본 지출 + 재고 위험), 고객이 "1년/3년간 시간당 $X는 반드시 쓰겠다"고 약속하면 그 capacity planning 위험이 줄어든다. 그 대가가 할인이다. 그래서 **약정이 구체적일수록(= AWS의 불확실성을 더 제거할수록) 할인이 크다.** 이것이 금융의 **선도 계약(forward contract)**과 정확히 같은 경제학이다.

| 모델 | 할인 | 유연성 | 약정 단위 | 적합 워크로드 |
|------|------|--------|------|----------------|
| Compute Savings Plans | ~66% | ★★★★★ (EC2·Fargate·Lambda 통합) | $/시간 | 다양한 컴퓨팅 워크로드 |
| EC2 Instance Savings Plans | ~72% | ★★★ (family·region 고정) | $/시간 | 특정 family 지속 사용 |
| Standard RI | ~72% | ★★ (family·OS 고정) | 인스턴스 | family 변경 없는 24시간 가동 |
| Convertible RI | ~54% | ★★★★ (family·OS 변경 교환) | 인스턴스 | family 변경 예상 |
| Zonal RI | ~72% | ★ (특정 AZ) | 인스턴스 | 용량 보장 필요 |

위험 스펙트럼으로 보면: **On-Demand**(AWS가 위험 전부, 0% 할인) → **Convertible RI** → **Compute SP** → **EC2 Instance SP / Standard RI**(고객이 약정 위험 크게 부담, ~72%) → **Spot**(고객이 회수 위험까지 부담, ~90%). 모든 시험 시나리오의 "유연성 vs 할인" 트레이드오프는 워크로드를 이 스펙트럼 어디에 놓을지의 문제다.

> 🎯 **시나리오**: "한 회사가 EC2 m5 family를 24시간 가동하고 향후 3년간 family 변경 계획 없음. 현금 여유 있음. 최대 할인은?" — 답: **EC2 Instance Savings Plans 또는 Standard RI (3년 All Upfront)**. family·region 고정이면 유연성을 살 이유가 없으므로 가장 구체적인 약정이 정답. EC2 Instance SP는 같은 family 내 size·OS·AZ까지 자유라 Standard RI보다 한 단계 유연하면서 동일 ~72%.

> 💡 **관련 이론**: 약정 단위의 차이가 SP의 유연성을 만든다. RI는 "인스턴스"를 약정하지만 SP는 "$/시간"을 약정한다 — 이는 CS의 **추상화 계층(abstraction layer)** 사고다. SP는 물리 자원 위에 "정규화된 시간당 비용"이라는 추상 계층을 올려, 그 아래 인스턴스가 m5든 m6i든 약정이 매칭되게 한다. 추상화가 결합도(coupling)를 낮춰 워크로드 현대화 시에도 약정이 깨지지 않는 전형적 패턴이다.

> 🔍 **더 깊이**: 결제 옵션(All/Partial/No Upfront)도 같은 위험 논리다. All Upfront는 AWS가 현금을 미리 받아(신용 위험 제거 + 화폐의 시간 가치) 가장 큰 할인을 준다. "현금 여유 + 최대 할인"이면 All Upfront, "초기 현금 최소화 + 약정 할인"이면 No Upfront가 정답 신호. 적용 순서는 **Zonal RI → Regional RI → Savings Plans → On-Demand**로, 가장 구체적인 약정부터 사용량을 흡수한다. 그래서 RI를 과도하게 사면 RI가 사용량을 선점해 SP utilization이 떨어진다 — "SP 활용률 저하"의 단골 원인이다.

## Spot Instance: 최대 90% 할인 + 회수 위험

- 정상 가격의 10-30% 수준, 시장 수급으로 가격 변동
- **2분 사전 알림**(EC2 instance rebalance recommendation은 더 일찍) 후 회수
- 적합: stateless · fault-tolerant · 배치 · CI/CD · 분산 학습 · 렌더링 · 컨테이너 워커

### Spot Fleet / EC2 Fleet 할당 전략

| 전략 | 동작 | 회수 위험 |
|------|------|----------|
| lowest-price | 가장 싼 풀 우선 | 높음 |
| diversified | 여러 풀에 균등 분산 | 낮음 |
| **capacity-optimized** | 회수 위험 가장 낮은 풀 선택 (권장) | 가장 낮음 |
| capacity-optimized-prioritized | 위 + 우선순위 명시 | 낮음 |
| price-capacity-optimized | 가격·용량 균형 (최신 권장) | 낮음 |

> 📚 **사례**: 한 영상 렌더링 회사가 c5·c5n·c5a·m5·m5n 등 10개 이상 인스턴스 풀을 capacity-optimized로 묶어 사용. 한 풀의 capacity가 부족해지면 자동으로 다른 풀로 대체해 회수율을 5% 이하로 유지하며 비용 약 80% 절감. 교훈: Spot 안정성의 핵심은 "낮은 가격"이 아니라 **풀 다양화(diversification)**다 — 하나의 가장 싼 풀에 몰면 그 풀이 회수될 때 전체가 무너진다.

> 💡 **관련 이론**: Spot의 풀 다양화는 금융 포트폴리오 이론의 **분산 투자(diversification)**와 같다. 상관관계가 낮은 여러 풀에 분산하면 한 풀의 회수(개별 위험)가 전체에 미치는 영향이 줄어든다. capacity-optimized는 "수익 극대화(최저가)"보다 "분산 최소화(안정)"를 택한 전략이고, 그래서 미션이 중단에 민감할수록 lowest-price 대신 capacity-optimized/price-capacity-optimized가 정답이다.

> 🎯 **시나리오**: "Kubernetes(EKS) 데이터 처리 워커를 비용 최소화하되 중단에 견디게." → **Karpenter 또는 Managed Node Group + Spot(capacity-optimized) + On-Demand 혼합 + 다양한 인스턴스 타입**. Pod Disruption Budget과 graceful drain으로 2분 알림에 대응. 순수 Spot 단일 타입은 회수 시 전체 중단 위험.

## 권고·분석 도구 4종 — 목적별 경계

| 도구 | 분석 방식 | 핵심 용도 |
|------|----------|----------|
| **Compute Optimizer** | ML / 시계열 | EC2·EBS·Lambda·ASG·ECS·RDS 정밀 rightsizing 권고 |
| **Trusted Advisor** | 룰(임계값) | 5개 카테고리(Cost·Perf·Security·FaultTol·Limits) 광범위 점검 |
| **Cost Explorer** | 집계 시각화 | 시각화 + 12개월 Forecast + Coverage/Utilization |
| **CUR** | 원본 사실 테이블 | 시간 단위 ~200컬럼, Athena SQL 단가 분석 |

> 🔍 **더 깊이**: 메모리 권고는 가상화의 **시맨틱 갭**(하이퍼바이저가 게스트 메모리를 못 봄) 때문에 **CloudWatch Agent**가 설치돼야만 나온다. "메모리 권고가 왜 안 나오나"의 정답은 거의 항상 CW Agent 미설치. Compute Optimizer enhanced infrastructure metrics를 켜면 lookback이 14일에서 최대 93일로 늘어 계절성을 반영한다(유료).

> 💡 **관련 이론**: Trusted Advisor(룰)와 Compute Optimizer(ML)의 분업은 분류기의 **정밀도-재현율(precision-recall)** 트레이드오프다. 룰은 빠르고 해석 가능하지만 거짓 양성이 많고(배치 spike를 잘못 잡음), ML은 거짓 양성을 줄이지만 학습 데이터·시간이 필요하다. 운영은 TA로 넓게 스크리닝 후 CO로 정밀 분석하는 계층 구조를 쓴다. 다른 클라우드도 동형이다 — Azure Advisor, GCP Recommender가 각각 대응.

## Budgets vs Cost Anomaly Detection — 통제 vs 탐지

| 도구 | 동작 |
|------|------|
| Budgets | 사전 정한 임계치(예: 월 $1000) 초과 시 알림 |
| **Budgets Action** | 임계치 초과 시 자동 액션(IAM Deny, EC2/RDS 정지, SCP 적용) |
| Cost Anomaly Detection | ML로 평소 패턴 학습 → 이상 시 자동 알림(탐지만) |

> 🎯 **시나리오**: "월 예산을 초과하면 더 이상 새 EC2 시작을 거부." → **Budgets Action으로 IAM Deny Policy 자동 적용**. CloudWatch Alarm은 알림만, Lambda 스케줄은 사후 배치, Cost Anomaly는 탐지만. 단 청구 데이터 갱신 지연 때문에 "절대 못 넘게"가 강조되면 예방형 **SCP/Service Quotas**를 병행 의심.

> ⚠️ **함정**: Budgets Action은 "신규 생성 차단(IAM/SCP Deny)"과 "현재 가동분 정지(EC2/RDS stop)"를 구분해 설계해야 한다. 시나리오 동사가 "막아라"면 Deny, "멈춰라"면 stop이다.

## 숨은 비용 (Pro 시험 단골)

### NAT Gateway: 시간 + 처리량 이중 과금

- 시간 요금 약 $0.045/h × 24h × 30d ≈ $32/월 (AZ마다 하나면 ×AZ수)
- 처리량 약 $0.045/GB (리전마다 다름)
- VPC 안 1TB 인터넷 트래픽 ≈ 처리량만 $45

> 🔍 **더 깊이**: NAT Gateway는 종종 RDS보다 큰 비용 항목이 된다. 특히 Lambda·ECS Task가 private subnet에서 외부·AWS API를 호출하면 모든 트래픽이 NAT를 거쳐 비용이 폭증한다. **S3·DynamoDB는 Gateway Endpoint(무료)**, 그 외 AWS 서비스(SQS·SNS·KMS·ECR·Secrets Manager 등)는 **Interface Endpoint(PrivateLink, 시간당 ~$0.01/AZ + 처리량)**로 NAT를 우회한다. trip-line 경험칙: "한 달 NAT 비용이 Interface Endpoint 시간 요금을 넘으면 Endpoint로 전환." ECR pull, S3 접근이 잦은 컨테이너 환경이 1순위 후보다.

> 📚 **사례**: 한 SaaS가 ECS Task에서 매일 100GB를 S3에 업로드. NAT Gateway 경유 시 처리량 비용만 월 약 $4,500. **S3 Gateway Endpoint**로 전환 후 해당 트래픽 비용 $0. 단순 라우팅 우회만으로 연 약 $54,000 절감. 교훈: private subnet의 S3·DynamoDB 트래픽이 NAT를 타고 있는지는 가장 먼저 확인할 안티패턴이다.

### AZ 간 트래픽: 양방향 과금

- 같은 리전 다른 AZ 통신: 약 $0.01/GB가 **양쪽 모두** 청구(왕복 ≈ $0.02/GB)
- Cross-AZ DB replication, ALB→타 AZ 인스턴스, 분산 캐시 동기화 등이 의외로 큰 비용

> 💡 **관련 이론**: 이것은 가용성과 비용의 근본 trade-off다. Multi-AZ는 내결함성(WA Reliability 기둥)을 위해 AZ를 분산하지만 그 대가로 Cross-AZ 트래픽 비용이 발생한다. **읽기 지연 허용 가능**하면 read replica를 같은 AZ에 두거나 토폴로지 인식 라우팅(예: ALB의 cross-zone 설정, 클라이언트의 AZ-affinity)으로 줄인다 — 가용성을 약간 포기하고 비용을 아끼는 의도적 선택이다. "고가용성 유지 + Cross-AZ 비용 최소화"는 본질적으로 양립이 어렵다는 게 Pro 수준의 인식이다.

### Internet Egress vs CloudFront

| 경로 | 특징 |
|------|------|
| EC2/S3 → 인터넷 (직접) | egress 단가 높음, 캐싱 없음 |
| EC2/S3 → CloudFront → 사용자 | **오리진→CloudFront 구간 무료** + CloudFront egress가 더 저렴 + 캐싱 |

> 🎯 **시나리오**: "글로벌 사용자에게 S3 정적 콘텐츠 제공 + 비용·지연 최소화." → **CloudFront + S3 (+ Origin Shield)**. S3→CloudFront 전송은 무료라 egress가 줄고, 엣지 캐싱으로 오리진 부하·지연도 감소. S3 직접 공개는 egress 비용↑·캐싱 없음. Transfer Acceleration은 업로드 가속용, Global Accelerator는 정적 IP·TCP/UDP 가속용으로 정적 콘텐츠 배포와 목적이 다르다.

### S3 Storage Class 자동 전환

| Class | 사용처 | 특징 |
|-------|--------|------|
| Standard | 자주 접근 | 기본 |
| **Intelligent-Tiering** | 패턴 불명 | 자동 계층 전환 + 객체당 모니터링 비용 |
| Standard-IA | 월 1회 미만 | 저렴 + retrieval 비용 + 최소 30일·128KB |
| Glacier Instant Retrieval | 분기 1회, 즉시 조회 | 더 저렴 |
| Glacier Flexible Retrieval | 연 1회, 분~시간 조회 | 더더 저렴 |
| Glacier Deep Archive | 장기 보관, 12h 조회 | 최저가 |

> ⚠️ **함정**: Intelligent-Tiering은 단순 "무료 자동 전환"이 아니라 **객체당 모니터링 비용**(1,000객체당 소액)이 별도다. 객체가 매우 작거나(128KB 미만은 IA로 전환 안 됨) 매우 많으면 모니터링 비용이 절감을 상쇄할 수 있다. "접근 패턴 모름 + 큰 객체"는 Intelligent-Tiering이 정답이지만, "수억 개의 작은 객체"는 모니터링 비용 함정을 의심한다.

### Incomplete Multipart Upload 정리

- 멀티파트 업로드가 중간에 실패하면 partial chunk가 계속 저장돼 보이지 않게 과금
- **Lifecycle rule로 7일 후 자동 삭제** 권장(S3 Storage Lens로 누적량 탐지)
- 대규모 환경에서 수십 TB까지 누적되기도 한다

> 📚 **사례**: 한 기업이 S3 비용이 설명 안 되게 늘어 조사하니, 실패한 멀티파트 업로드 조각이 수년간 쌓여 수십 TB를 차지하고 있었다. 콘솔·일반 리스트에는 안 보여 발견이 늦었다. Storage Lens로 incomplete multipart 누적을 확인하고 lifecycle rule(7일 abort)을 걸어 즉시 정리. 교훈: "보이지 않는 저장 비용"의 1순위 용의자는 incomplete multipart upload와 오래된 버전(versioning)이다.

## 멀티 계정·Organization 비용 거버넌스

SAP 시험의 비용 시나리오는 거의 항상 멀티 계정 전제다. 핵심 원리: **약정 할인은 통합 결제(Consolidated Billing)로 Org 전체에 공유**되므로 중앙(관리 계정·전용 결제 계정)에서 일괄 구매하는 게 활용률·관리 양면에서 우월하다. "멤버 계정마다 SP 구매"는 전형적 오답이다.

> 💡 **관련 이론**: Org 차원 약정 풀링은 분산 시스템의 **자원 풀링(resource pooling)** + 통계의 **대수의 법칙**이다. 여러 워크로드를 한 풀로 합치면 개별 spike가 상쇄돼 변동성이 줄고, 사용량 하한(baseline)에 더 타이트하게 약정해도 안전하다. 그래서 풀이 클수록 over-commit 위험 없이 Coverage를 높일 수 있다. 통합 결제는 볼륨 티어 할인도 합산 적용하므로, 비용 분리를 위해 계정을 쪼개되 할인은 공유하는 것이 멀티 계정 비용 설계의 정수다.

## 시나리오 키워드 → 정답 매핑 표

| 키워드 | 정답 |
|--------|------|
| "EC2 + Fargate + Lambda 통합 할인" | Compute Savings Plans |
| "m6i family 3년 최대 할인·변경 없음" | EC2 Instance SP (또는 Standard RI) |
| "family 변경 예상 + 약정 유지" | Convertible RI(또는 더 단순한 Compute SP) |
| "용량 보장 + 할인" | Zonal RI 또는 ODCR + SP |
| "stateless 배치 90% 할인" | Spot Fleet (capacity-optimized) |
| "Private Lambda/ECS → S3 비용 0" | S3 Gateway Endpoint |
| "private subnet → SQS/KMS NAT 우회" | Interface Endpoint(PrivateLink) |
| "S3 접근 패턴 모름 + 큰 객체" | Intelligent-Tiering |
| "월 예산 초과 시 신규 EC2 차단" | Budgets Action(IAM/SCP Deny) |
| "예산 절대 초과 불가(하드 캡)" | 예방형 SCP/Service Quotas |
| "EBS gp2 → gp3 / IOPS 권고" | Compute Optimizer |
| "시간 단위 청구 SQL 분석" | CUR + Athena |
| "여러 클라우드 비용 단일 스키마" | FOCUS Data Export |
| "Lambda 메모리 권고" | Compute Optimizer |
| "메모리 권고가 안 나옴" | CW Agent 미설치 |
| "글로벌 정적 콘텐츠 + 비용↓" | CloudFront + S3 |
| "비정상 비용 ML 탐지" | Cost Anomaly Detection |
| "공유 인프라 비용 팀별 배분" | Cost Categories split charge |
| "SP utilization 저하" | RI 과약정이 사용량 선점 |
| "멤버 계정마다 SP 구매" | 오답(중앙 통합 구매·공유) |

## 정리하며

비용 최적화는 **(약정 + 즉시 할인 + 숨은 비용)**의 3축이며, 그 위에 Well-Architected Cost Optimization 기둥과 FinOps Inform→Optimize→Operate 사이클이 놓인다. SP/RI 적용 순서, Spot 회수·풀 다양화 전략, NAT/AZ/Egress의 hidden cost — 이 셋의 trade-off를 한꺼번에 떠올려야 시험 시나리오를 푼다. 도구는 Compute Optimizer(권고)·CUR(분석)·Budgets(통제)·Anomaly Detection(탐지)의 4단계 워크플로이며, 멀티 계정에서는 통합 결제로 약정을 공유하고 중앙에서 일괄 거버넌스한다.

다음 주(Week 13)는 **Well-Architected 6 기둥** 종합 정리.

---

## 📝 연습 문제

**문제 1.** 한 회사가 EC2·Fargate·Lambda를 모두 쓰고 인스턴스 family를 워크로드에 따라 자주 바꾼다. 1년 약정으로 최대한 넓게 할인을 적용하려 한다. 가장 적합한 것은?

A) Standard RI (m5 family 3년 All Upfront)

B) EC2 Instance Savings Plans (특정 리전·family 고정)

C) Compute Savings Plans

D) Spot Fleet (capacity-optimized, 다양한 풀)

**정답: C**
해설: Compute SP는 EC2·Fargate·Lambda를 모두 포괄하고 리전·OS·family·tenancy 무관하게 시간당 약정 금액 내 사용에 자동으로 할인을 적용한다. family를 자주 바꾸고 세 컴퓨팅을 통합 할인해야 하는 요건에 정확히 맞는다. A는 family에 묶이고 Fargate·Lambda를 못 덮는다. B는 특정 리전·family 고정이라 "family를 자주 바꾼다"와 충돌한다. D는 중단 위험이 있어 "약정 기반 안정 할인"과 다르다. 함정: Fargate·Lambda 포함은 오직 Compute SP만 가능하다.

---

**문제 2.** 비용팀이 RI와 SP를 동시에 대량 구매한 뒤 SP 활용률(utilization)이 100%에 못 미친다. 가장 가능성 높은 원인과 조치는?

A) SP는 원래 100% 활용 불가 — 그대로 둔다

B) RI가 사용량을 먼저 흡수해 SP 매칭분이 부족 — RI를 줄이거나 신규 약정을 SP로 통일

C) Compute SP가 Fargate를 못 덮어서 — EC2 Instance SP로 교체

D) SP는 통합 결제에서 공유 안 됨 — 계정별로 재구매

**정답: B**
해설: Billing 엔진은 가장 구체적인 약정(Zonal RI→Regional RI)부터 차감하고 유연한 SP를 나중에 적용한다. RI를 과도하게 사면 RI가 매시간 사용량을 선점해 SP가 매칭할 잔여가 줄어 SP utilization이 떨어진다. 조치는 RI를 줄이거나 신규 약정을 SP로 통일하는 것이다. A는 틀림(적정 약정이면 100% 가능). C는 틀림(Compute SP는 Fargate 포함). D는 틀림(SP는 통합 결제에서 공유). 함정: SP 활용률 저하는 "사용량 부족"이 아니라 "RI 과약정 선점"을 먼저 의심한다.

---

**문제 3.** 야간에만 도는 분산 데이터 처리 잡으로, 중단되어도 재시작 가능하고 비용을 최대로 줄이려 한다. 여러 인스턴스 타입을 쓸 수 있다. 가장 적합한 것은?

A) On-Demand 단일 타입으로 야간에만 기동

B) Standard RI 3년 약정으로 시간당 단가 최소화

C) Spot Fleet, capacity-optimized 전략 + 다양한 인스턴스 풀

D) Compute Savings Plans 1년 약정으로 안정 할인 적용

**정답: C**
해설: 중단 허용 + 최대 절감은 Spot의 시그널이며, 안정성의 핵심은 풀 다양화다. capacity-optimized로 회수 위험이 가장 낮은 풀을 고르고 여러 타입을 묶으면 한 풀이 회수돼도 다른 풀로 대체돼 회수율이 낮아진다(분산 투자 원리). A는 정가다. B는 야간만 도는 워크로드에 24h 약정은 낭비다. D는 할인이 Spot보다 작고 약정 부담이 있다. 함정: Spot 안정성은 "최저가(lowest-price)"가 아니라 capacity-optimized + 풀 다양화다.

---

**문제 4.** Private subnet의 Lambda·ECS Task가 S3와 DynamoDB에 접근하는데 NAT Gateway 처리량 비용이 매우 크다. 비용을 0에 가깝게 만들려면?

A) S3·DynamoDB용 Interface Endpoint(PrivateLink)를 AZ마다 배치

B) S3·DynamoDB Gateway Endpoint

C) NAT Gateway를 AZ별로 증설해 처리량을 분산

D) Private subnet을 Internet Gateway에 직접 라우팅

**정답: B**
해설: S3와 DynamoDB는 **Gateway Endpoint**로 라우팅하면 NAT를 우회하고 추가 시간 요금도 없어 해당 트래픽 비용이 사실상 0이 된다. A(Interface Endpoint)는 SQS·KMS 등 다른 서비스용이고 시간당 요금이 든다. C는 비용을 오히려 늘린다. D는 private subnet 격리를 깨고 보안에 위배된다. 함정: S3·DynamoDB는 Gateway Endpoint(무료), 그 외 AWS 서비스는 Interface Endpoint(유료)로 구분한다.

---

**문제 5.** 데이터 전송 비용이 전체의 25%로 크지만 Cost Explorer로는 어떤 트래픽인지 분해되지 않는다. 근본 원인을 특정하려면?

A) Budgets로 데이터 전송 항목에 예산·알림을 설정

B) CUR을 Athena로 쿼리해 UsageType별로 분해

C) Trusted Advisor를 실행해 비용 카테고리 점검

D) Cost Explorer 필터를 서비스·UsageType으로 더 좁힘

**정답: B**
해설: Cost Explorer는 "데이터 전송"을 뭉뚱그려 Cross-AZ·인터넷 egress·Cross-Region을 구분 못 한다. CUR의 lineItem/UsageType 컬럼을 Athena로 쿼리하면 DataTransfer-Regional-Bytes(Cross-AZ), DataTransfer-Out-Bytes(egress), NatGateway-Bytes 등으로 분해해 원인을 특정한다. A는 통제, C는 룰 점검, D는 세밀도 한계로 컬럼 단위 분해 불가. 함정: 비용 근본 원인 분석은 CUR 레벨에서만 가능하다.

---

**문제 6.** 글로벌 사용자에게 S3에 저장된 정적 웹 콘텐츠를 제공하면서 egress 비용과 지연을 최소화하려 한다. 가장 적합한 것은?

A) S3 버킷을 퍼블릭으로 공개하고 Internet Gateway로 직접 egress

B) CloudFront + S3 (+ Origin Shield)

C) S3 Transfer Acceleration으로 엣지 경유 전송 가속

D) Global Accelerator로 정적 IP·Anycast 경로 제공

**정답: B**
해설: CloudFront를 S3 앞에 두면 S3→CloudFront 전송이 무료라 egress가 줄고, 엣지 캐싱으로 오리진 부하와 글로벌 지연이 감소한다. Origin Shield는 추가 캐싱 레이어로 오리진 hit을 더 줄인다. A는 egress 비용↑·캐싱 없음. C(Transfer Acceleration)는 업로드 가속용. D(Global Accelerator)는 정적 IP·비HTTP 가속용으로 정적 콘텐츠 캐싱 배포와 목적이 다르다. 함정: "글로벌 정적 콘텐츠 + 비용·지연↓"은 CloudFront+S3다.

---

**문제 7.** 개발 계정의 월 비용이 임계를 넘으면 신규 EC2 생성을 즉시 자동 차단하고 싶다. 다만 청구 지연과 무관하게 절대로 임계를 못 넘게(하드 캡) 보장도 필요하다. 가장 적합한 조합은?

A) CloudWatch Billing Alarm으로 임계 초과 시 SNS 알림만 발송

B) Budgets Action(IAM/SCP Deny)로 사후 차단 + 예방형 SCP/Service Quotas로 리소스 한도 자체를 사전 제한

C) Lambda 일일 스케줄로 비용을 확인 후 초과 시 인스턴스 종료

D) Cost Anomaly Detection으로 ML 기반 이상 비용을 탐지·알림

**정답: B**
해설: Budgets Action은 임계 초과 시 IAM/SCP Deny를 자동 적용해 신규 생성을 차단한다. 그러나 청구 데이터 갱신 지연(최종 일관성) 때문에 Budgets만으로는 하드 캡을 보장 못 하므로, 예방형 SCP(특정 인스턴스 타입·리전·서비스 금지)나 Service Quotas로 사전에 상한을 둬 보완한다. A는 알림만, C는 사후 배치라 실시간 아님, D는 탐지만. 함정: "자동 차단"은 Budgets Action이지만 "절대 초과 불가"가 강조되면 예방형 통제를 병행한다.

---

**문제 8.** Auto Scaling Group으로 운영되는 인스턴스를 Compute Optimizer 권고에 따라 더 작고 최신 세대 타입으로 교체하려 한다. 올바른 방법은?

A) 각 인스턴스를 stop → ModifyInstanceAttribute로 타입 변경 → start

B) Launch Template 새 버전에 권장 타입을 넣고 Instance Refresh로 롤링 교체

C) ASG를 삭제 후 권장 타입으로 새 ASG를 생성하고 트래픽 전환

D) 인스턴스를 직접 종료하면 ASG가 새 타입으로 자동 재기동한다

**정답: B**
해설: ASG에서 인스턴스를 직접 stop/modify하면 헬스 체크 실패로 종료·재생성되며 옛 Launch Template의 기존 타입으로 다시 뜬다. 올바른 방법은 Launch Template 새 버전에 권장 타입을 넣고 Instance Refresh로 MinHealthyPercentage를 지키며 무중단에 가깝게 롤링 교체하는 것이다. A는 ASG가 간섭해 실패, C는 과도하게 파괴적, D는 옛 타입으로 재생성. 함정: ASG rightsizing은 직접 modify가 아니라 Launch Template + Instance Refresh다.

---

**문제 9.** Compute Optimizer가 EC2에 대해 CPU·네트워크 권고는 주는데 메모리 권고만 전혀 없다. 원인은?

A) Compute Optimizer는 메모리 권고 자체를 지원하지 않는다

B) 게스트 OS에 CloudWatch Agent가 없어 메모리 메트릭이 수집되지 않는다

C) IAM 권한 부족으로 Compute Optimizer의 모든 권고가 차단됐다

D) lookback 기간 14일이 아직 지나지 않아 권고가 보류 중이다

**정답: B**
해설: 하이퍼바이저는 게스트 OS 내부 메모리를 볼 수 없으므로(가상화 시맨틱 갭) 메모리 메트릭은 CW Agent를 설치해야만 수집된다. Agent가 없으면 Nitro가 자동 계측하는 CPU·네트워크·디스크 권고는 나오지만 메모리 권고만 빠진다. A는 틀림(CO는 메모리 권고 제공). C라면 권고 자체가 안 나온다. D도 그렇다면 CPU 권고도 없어야 한다. 함정: "메모리 권고만 부재"는 거의 항상 CW Agent 미설치다.

---

**문제 10.** 50개 멤버 계정의 Organization에서 전체 컴퓨팅 비용을 최소화하면서 약정 활용률을 극대화하려 한다. 가장 적합한 약정 구매 전략은?

A) 각 멤버 계정이 자기 사용량에 맞춰 개별적으로 SP를 구매·관리

B) 관리 계정(또는 전용 결제 계정)에서 Org 전체 baseline에 맞춰 SP를 중앙 구매하고 공유 활성화

C) 멤버 계정마다 자기 family에 맞춰 Standard RI를 개별 구매

D) 약정 없이 On-Demand만 사용하고 Cost Explorer로 사후 분석

**정답: B**
해설: 통합 결제에서 SP·RI 할인은 공유가 켜지면 Org 전체에 적용된다. 여러 워크로드를 한 풀로 합치면 변동성이 상쇄돼(대수의 법칙) 사용량 하한에 타이트하게 약정해도 안전하고, 한 계정이 한가할 때 남는 약정을 바쁜 계정이 흡수해 활용률이 오른다. A·C는 계정별 과약정으로 빈 약정이 생긴다. D는 할인을 포기한다. 함정: "멤버 계정마다 개별 구매"는 Pro 시험의 전형적 오답이며, 중앙 통합 구매·공유가 정답이다.

---

**문제 11.** 한 미디어 기업이 m4 Standard RI를 대량 보유한 채 워크로드를 m6i로 현대화하려다, 옛 RI는 놀고 새 인스턴스는 On-Demand로 청구되는 상황에 빠졌다. 향후 같은 문제를 막으려면 신규 약정을 무엇으로 해야 하나?

A) 추가 m4/m5 Standard RI를 구매해 기존 약정에 맞춤

B) Compute Savings Plans(또는 Convertible RI)

C) Zonal RI로 특정 AZ에 용량을 예약

D) 약정을 모두 해지하고 On-Demand로 전환

**정답: B**
해설: family 변경(m4→m6i)이 예상되면 family에 결합되지 않는 약정이 필요하다. Compute SP는 family·리전·OS 무관하게 자동 매칭돼 현대화 후에도 약정이 유효하다(Convertible RI도 교환으로 가능하나 절차가 번거로워 Compute SP가 운영상 우월). A는 같은 함정을 반복한다. C는 AZ 고정 용량 목적이지 family 유연성과 무관하다. D는 할인을 포기한다. 함정: 현대화·기술 변화가 예상되는 워크로드에 family 결합 약정(Standard RI)을 거는 것은 안티패턴이다.

---

**문제 12.** S3 비용이 설명 없이 계속 증가한다. 콘솔의 객체 목록으로는 원인이 안 보인다. 가장 의심해야 할 숨은 비용과 조치는?

A) Glacier 검색·복원 요금 누적 — 객체를 S3 Standard로 전환

B) 실패한 Incomplete Multipart Upload 조각 누적 — Storage Lens로 확인 후 Lifecycle rule(예: 7일 abort)로 정리

C) CloudFront 엣지 캐시 저장 비용 — 캐시를 비활성화

D) Cost Explorer 집계 버그 — 지원 티켓으로 정정 요청

**정답: B**
해설: 멀티파트 업로드가 중간에 실패하면 partial chunk가 계속 저장돼 일반 목록에는 안 보이게 과금된다. 대규모 환경에서 수십 TB까지 누적될 수 있다. S3 Storage Lens로 incomplete multipart 누적량을 확인하고 Lifecycle rule로 일정 기간 후 자동 abort·삭제하는 것이 표준 조치다(오래된 버전도 함께 점검). A·C·D는 원인이 아니다. 함정: "보이지 않는 S3 저장 비용"의 1순위는 incomplete multipart upload와 미정리 버전이다.
