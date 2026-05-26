# Day 60 - 비용 최적화 종합 복습: SP·RI·Spot의 수학과 숨은 비용

비용 최적화는 단순 "Reserved Instance를 사세요"가 아니다. Pro 시험은 **워크로드 패턴 + 약정 모델 + 즉시 할인 + 숨은 비용**의 4차원 매트릭스에서 최적 답을 찾는 trade-off 문제다. 같은 EC2라도 24시간 가동 / 야간 배치 / spike 트래픽 각각 정답이 다르고, NAT Gateway 같은 "보이지 않는" 비용이 종종 전체 청구의 30% 이상을 차지한다. 오늘은 12주차 비용 최적화 전체를 정리하고 Pro 시험의 함정을 짚는다.

## 약정 할인 모델 5종: 유연성 vs 할인율

| 모델 | 할인 | 유연성 | 약정 | 적합 워크로드 |
|------|------|--------|------|----------------|
| Compute Savings Plans | ~66% | ★★★★★ (EC2·Fargate·Lambda 통합) | 1년/3년 | 다양한 컴퓨팅 워크로드 |
| EC2 Instance Savings Plans | ~72% | ★★★ (family·region 고정) | 1년/3년 | 특정 family 지속 사용 |
| Standard RI | ~72% | ★★ (family·OS 고정) | 1년/3년 | family 변경 없는 24시간 가동 |
| Convertible RI | ~54% | ★★★★ (family·OS 변경) | 1년/3년 | family 변경 예상 |
| Zonal RI | ~72% | ★ (특정 AZ) | 1년/3년 | 용량 보장 필요 |

### Compute SP vs EC2 Instance SP

Compute SP가 가장 유연하지만 할인율은 EC2 Instance SP가 더 높다. **"flexibility premium"**이라 부르는 차이.

> 🎯 **시나리오**: "한 회사가 EC2 m5 family를 24시간 가동하고 향후 3년간 family 변경 계획 없음. 최대 할인은?" — 답: **EC2 Instance Savings Plans (3년 All Upfront)**. Standard RI도 비슷한 할인이지만 SP가 약간 유연(같은 family 내 다른 size 가능).

> 🔍 **더 깊이**: 적용 순서는 RI → Savings Plans → On-Demand. RI가 가장 먼저 사용 시간을 흡수하고, 남는 시간이 SP에 매칭되며, 나머지가 On-Demand로 청구. 따라서 RI를 너무 많이 사면 SP와 충돌해 활용률 ↓. AWS는 이 충돌을 피하기 위해 **Cost Explorer의 SP/RI Recommendation**을 제공.

> 💡 **관련 이론**: AWS 약정 할인의 본질은 **AWS의 capacity planning 위험을 고객이 분담**하는 것. AWS는 미리 capacity를 확보해야 하므로 고객이 약정해주면 비용·재고 위험이 줄어든다. 그 대가로 할인을 준다. Spot은 정반대 — AWS의 남는 capacity를 90% 할인된 가격에 제공, 단 회수 위험은 고객이 부담.

## Spot Instance: 최대 90% 할인 + 회수 위험

- 정상 가격의 10-30% 수준
- 2분 사전 알림 후 회수
- 적합: stateless · fault-tolerant · 배치 · CI · 분산 학습 · 렌더링

### Spot Fleet 전략

| 전략 | 동작 |
|------|------|
| lowest-price | 가장 싼 인스턴스 우선 (회수 위험 ↑) |
| diversified | 여러 풀에 분산 (회수 위험 ↓) |
| capacity-optimized | 회수 위험 가장 낮은 풀 (권장) |
| capacity-optimized-prioritized | 위 + 우선순위 명시 |

> 📚 **사례**: 한 영상 렌더링 회사가 c5·c5n·c5a·m5·m5n 등 10+ 인스턴스 패밀리를 capacity-optimized 전략으로 묶어 사용. 한 패밀리 capacity 부족 시 자동 다른 패밀리로 대체. 회수율 5% 이하 유지. 비용 80% 절감.

## 권고·분석 도구

### Compute Optimizer

- EC2 / EBS / Lambda / ASG / ECS / RDS의 14일치 사용량 ML 분석
- "이 인스턴스는 m5.xlarge → m5.large로 다운사이즈하면 40% 절감, 성능 영향 거의 없음" 같은 구체적 권고
- Right-sizing의 가장 강력한 도구

### Trusted Advisor

- 5 카테고리: Cost, Performance, Security, Fault Tolerance, Service Limits
- Business Support 이상에서 모든 체크 활성화
- 단순 룰 기반(ML 아님)

### Cost Explorer

- 시각화 + 12개월 Forecast + Rightsizing Recommendation
- API로 자동화 가능

### CUR (Cost and Usage Report)

- 가장 상세한 시간 단위 청구 데이터
- S3에 Parquet으로 출력 → Athena·QuickSight로 분석
- 대규모 환경의 단가 분석 표준

> 💡 **관련 이론**: CUR은 약 200개 컬럼의 매우 상세한 데이터다. **lineItem/UsageType** 컬럼이 "이 비용이 정확히 어떤 서비스의 어떤 사용분인지" 알려준다. 예: USE2-DataTransfer-Out-Bytes는 us-east-2에서 인터넷으로의 egress. NAT Gateway 비용은 NatGateway-Bytes 같은 별도 UsageType. 단가 분석은 CUR 없이는 불가능.

### Budgets vs Cost Anomaly Detection

| 도구 | 동작 |
|------|------|
| Budgets | 사전 정한 임계치(예: 월 $1000) 초과 시 알림 |
| Budgets Action | 임계치 초과 시 자동 액션(IAM Deny, EC2 정지, SCP 적용) |
| Cost Anomaly Detection | ML로 평소 패턴 학습 → 이상 시 자동 알림 |

> 🎯 **시나리오**: "월 예산을 초과하면 더 이상 새 EC2 시작을 거부". → **Budgets Action**으로 IAM Policy 자동 적용. Cost Anomaly는 탐지만 가능.

## 숨은 비용 (Pro 시험 단골)

### NAT Gateway: 시간 + 처리량 이중 과금

- $0.045/h × 24h × 30d = 약 $32/월 (시간 요금)
- 처리량 $0.045/GB (한국 리전)
- VPC 안의 1TB 인터넷 트래픽 = $45/TB

> 🔍 **더 깊이**: NAT Gateway는 RDS 비용보다 더 큰 항목이 될 수 있다. 특히 Lambda·ECS Task가 private subnet에서 외부 API 호출 시 모든 트래픽이 NAT를 거치므로 비용 폭증. **S3·DynamoDB는 Gateway Endpoint(무료)**, 그 외 AWS 서비스(SQS·SNS·KMS·...)는 **Interface Endpoint(시간당 ~$0.01/AZ)**로 우회 가능. 보통 trip-line은 "한 달 NAT 비용이 $50을 넘으면 Interface Endpoint를 검토".

> 📚 **사례**: 한 SaaS가 ECS Task에서 매일 100GB의 데이터를 S3에 업로드. NAT Gateway 경유 시 $4500/월. S3 Gateway Endpoint로 전환 후 $0. 단순 트래픽 우회만으로 연 $54,000 절감.

### AZ 간 트래픽: 양방향 과금

- 같은 리전 다른 AZ 통신: $0.01/GB × 2 (양쪽 모두 청구)
- Cross-AZ DB replication, ALB→인스턴스 통신 등 의외로 큰 비용

### Internet Egress vs CloudFront

| 경로 | 비용 (한국 리전) |
|------|------------------|
| EC2 → 인터넷 (직접) | $0.126/GB (첫 10TB) |
| EC2 → CloudFront → 사용자 | EC2→CF $0 + CF→사용자 $0.085/GB |

> 🎯 **시나리오**: "글로벌 사용자에게 S3 정적 콘텐츠 제공 + 비용 최소화". → **CloudFront + S3 (Origin Shield 옵션)**. S3 직접 공개는 egress 비용 ↑ + 캐싱 없어 느림.

### S3 Storage Class 자동 전환

| Class | 사용처 | 비용 (GB·월) |
|-------|--------|---------------|
| Standard | 자주 접근 | $0.025 |
| Intelligent-Tiering | 패턴 불명 | $0.025 + 자동 전환 |
| Standard-IA | 월 1회 미만 | $0.0138 + retrieval |
| Glacier Instant Retrieval | 분기 1회 | $0.005 |
| Glacier Flexible Retrieval | 연 1회 | $0.0045 |
| Glacier Deep Archive | 10년 보관 | $0.0018 |

> ⚠️ **함정**: Intelligent-Tiering은 단순 "자동 전환"이 아니라 **모니터링 비용($0.0025 per 1000 객체)**이 별도. 객체가 매우 작거나 매우 많으면 모니터링 비용이 절감 효과를 상쇄할 수 있다. 128KB 이하 객체는 IA로 자동 전환 안 됨.

### Incomplete Multipart Upload 정리

- S3 멀티파트 업로드가 중간에 실패하면 partial chunk가 계속 저장
- Lifecycle rule로 7일 후 자동 삭제 권장
- 큰 환경에서는 수십 TB까지 누적될 수 있음

## 시나리오 키워드 → 정답 매핑 표

| 키워드 | 정답 |
|--------|------|
| "EC2 + Fargate + Lambda 통합 할인" | Compute Savings Plans |
| "m6i family 3년 최대 할인" | EC2 Instance SP (또는 Standard RI) |
| "family 변경 예상" | Convertible RI |
| "용량 보장 + 할인" | Zonal RI |
| "stateless 배치 90% 할인" | Spot Fleet (capacity-optimized) |
| "Private Lambda → S3 비용 0" | S3 Gateway Endpoint |
| "S3 접근 패턴 모름" | Intelligent-Tiering |
| "월 예산 초과 시 EC2 정지" | Budgets Action |
| "EBS gp2 → gp3 권고" | Compute Optimizer |
| "시간 단위 청구 SQL 분석" | CUR + Athena |
| "Lambda 메모리 권고" | Compute Optimizer |
| "글로벌 정적 콘텐츠 + 비용 ↓" | CloudFront + S3 |
| "비정상 비용 ML 탐지" | Cost Anomaly Detection |

## 정리하며

비용 최적화는 **(약정 + 즉시 할인 + 숨은 비용)**의 3축이다. SP/RI 적용 순서, Spot 회수 전략, NAT/AZ/Egress의 hidden cost — 이 셋의 trade-off를 한꺼번에 떠올려야 시험 시나리오를 풀 수 있다. 도구는 Compute Optimizer(권고), CUR(분석), Budgets(통제), Anomaly Detection(탐지)의 4단계 워크플로로 작동.

다음 주(Week 13)는 **Well-Architected 6 기둥** 종합 정리.

---

## 📝 연습 문제

**문제 1.** EC2 + Fargate + Lambda 통합 할인 + 인스턴스 family 자유로운 워크로드.

A) Standard RI
B) EC2 Instance SP
C) Compute Savings Plans
D) Spot Fleet

**정답: C**
해설: Compute SP는 EC2·Fargate·Lambda 통합 + family·region·OS 모두 자유. EC2 Instance SP는 family 고정, Standard RI는 더 엄격, Spot은 중단 위험.

---

**문제 2.** 24시간 가동되는 m6i family · 특정 리전 · 3년 약정 · 최대 할인.

A) Compute SP
B) EC2 Instance SP (또는 Standard RI)
C) Convertible RI
D) On-Demand

**정답: B**
해설: family·region 고정이면 EC2 Instance SP 또는 Standard RI가 가장 큰 할인. 둘 다 ~72%. Compute SP는 유연성 대가로 할인 ↓.

---

**문제 3.** 5분 단위 데이터 처리 + 중단 허용 + 비용 최대 절감.

A) On-Demand
B) Reserved Instance
C) Spot Instance
D) Savings Plans

**정답: C**
해설: "중단 허용" + "최대 절감"은 Spot의 시그널. RI/SP는 약정 부담, On-Demand는 정가.

---

**문제 4.** Private Subnet의 Lambda가 S3에 접근. NAT 비용 0 달성.

A) Interface Endpoint
B) S3 Gateway Endpoint
C) NAT Gateway 유지
D) Internet Gateway

**정답: B**
해설: S3와 DynamoDB는 Gateway Endpoint(무료). Interface Endpoint는 다른 AWS 서비스용 + 시간당 비용 발생.

---

**문제 5.** S3 객체 액세스 패턴이 불명 + 자동 최적화.

A) Standard
B) Intelligent-Tiering
C) Glacier Deep Archive
D) Standard-IA

**정답: B**
해설: Intelligent-Tiering은 액세스 패턴을 모니터링하며 자동으로 적합한 Tier로 전환. 단 128KB 이하 객체는 전환 안 됨.

---

**문제 6.** 월 예산 초과 시 EC2 새 시작 자동 거부.

A) Lambda 스케줄로 매월 체크
B) Budgets Action으로 IAM Deny Policy 자동 적용
C) Config Remediation
D) SCP만으로

**정답: B**
해설: Budgets Action은 임계치 초과 시 IAM Policy / SCP / EC2 정지 등 자동 액션. Lambda 스케줄은 사후 대응.

---

**문제 7.** EBS gp2 → gp3 전환 권고 + IOPS 추천.

A) Trusted Advisor
B) Compute Optimizer
C) Storage Lens
D) Cost Explorer

**정답: B**
해설: Compute Optimizer는 EBS 사용 패턴을 분석해 type·size·IOPS 권고. Trusted Advisor는 단순 룰(미사용 볼륨 등) 식별만.

---

**문제 8.** 시간 단위 모든 청구 항목을 SQL로 상세 분석.

A) Cost Explorer
B) CUR + Athena
C) Budgets
D) Trusted Advisor

**정답: B**
해설: CUR은 약 200개 컬럼의 시간 단위 데이터를 S3 Parquet으로 출력. Athena로 SQL 쿼리. Cost Explorer는 시각화만 가능하고 컬럼 단위 분석 한계.

---

**문제 9.** Lambda 함수 메모리 권고.

A) Compute Optimizer
B) X-Ray
C) CloudWatch Insights
D) Trusted Advisor

**정답: A**
해설: Compute Optimizer는 Lambda invocation 패턴을 분석해 메모리 권고 + 비용·실행 시간 변화 시뮬레이션 제공.

---

**문제 10.** 글로벌 사용자에게 S3 정적 콘텐츠 제공 + 비용 최소화.

A) S3 공개 + Internet Gateway
B) CloudFront + S3 + Origin Shield
C) S3 Transfer Acceleration
D) Global Accelerator

**정답: B**
해설: CloudFront로 캐싱 + S3 egress 비용 0 + 글로벌 latency 감소. Origin Shield는 추가 캐싱 레이어로 S3 hit 더 감소. Transfer Acceleration은 업로드용, GA는 정적 IP 용도.
