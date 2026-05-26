# Day 2 - Well-Architected Framework: DevOps의 6개 렌즈로 다시 읽기

Well-Architected Framework는 SAA에서 한 번 본 사람이 많지만, Professional DevOps의 눈으로 다시 보면 완전히 다른 도구가 된다. 6개 Pillar를 "외울 항목"이 아니라 "어떤 시나리오든 즉시 분류하는 사고 프레임"으로 쓰는 법이 오늘의 주제다.

DOP-C02 시나리오 문제가 어려운 이유는 답이 2~3개 다 동작하기 때문이다. 그 중 "**가장 적합한 것**"을 찾으려면 시나리오가 어느 Pillar를 묻고 있는지를 먼저 잡아야 한다. 이 분류 능력이 곧 합격선이다.

## W-AF의 역사 — 사내 문서에서 산업 표준까지

2012년 AWS 솔루션 아키텍트들이 "고객이 자주 묻는 똑같은 질문"을 정리하기 시작했다. "어떻게 설계해야 잘 한 건가요?"라는 질문에 매번 다른 답을 주는 게 비효율적이라, 사내 best practice 문서로 통합했다. 2015년 외부 공개, 2016년 5 Pillars 정립, 2021년 Sustainability 추가로 6 Pillars 완성. 이 진화 과정 자체가 클라우드 설계의 우선순위 변화를 반영한다 — 처음엔 안정성·성능만 중요했고, 비용 압박이 오면서 Cost Optimization이 강화됐고, ESG 시대가 오면서 Sustainability가 들어왔다.

DevOps 관점에서 W-AF가 특별한 이유는 **DevOps Guidance가 W-AF의 한 lens로 별도로 발행**됐다는 점이다(2023). 즉 AWS는 "DevOps는 W-AF의 모든 Pillar에 걸쳐 있는 cross-cutting concern"으로 본다. Operational Excellence 하나만의 문제가 아니다.

> 💡 **관련 이론**: W-AF는 ISO 9126(소프트웨어 품질 모델)의 클라우드 버전에 가깝다. ISO 9126은 기능성, 신뢰성, 사용성, 효율성, 유지보수성, 이식성 6축으로 SW 품질을 분류했는데, W-AF는 그 클라우드 버전이다. 또한 ITIL v4의 "Service Value System"과도 맞물린다 — ITIL의 Continual Improvement 원칙이 W-AF의 review 사이클에 반영되어 있다.

## 6 Pillars를 DevOps 관점에서 재해석

### 1. Operational Excellence — 운영 우수성, DevOps의 본가

"Run and monitor systems to deliver business value, and continually improve processes and procedures." 한국어로 번역하면 "운영을 통해 비즈니스 가치를 전달하고, 프로세스를 끊임없이 개선한다"인데, 이게 곧 DevOps의 정의와 거의 같다.

핵심 design principle:
- **Perform operations as code** (Pipeline-as-Code, IaC, Runbook as code)
- **Make frequent, small, reversible changes** (DORA의 Lead Time 감소)
- **Refine operations procedures frequently** (game day, chaos eng)
- **Anticipate failure** (Fault Injection Simulator, Chaos Monkey)
- **Learn from all operational failures** (Correction of Errors, blameless postmortem)

AWS 도구 매핑:
- **Prepare 단계**: CloudFormation, CDK, AWS Config (compliance baseline)
- **Operate 단계**: CloudWatch, X-Ray, ADOT, Systems Manager
- **Evolve 단계**: AWS DevOps Guru, Compute Optimizer

> 🔍 **더 깊이**: "Operations as code"는 단순히 IaC가 아니다. **Runbook as code**까지 포함한다. SSM Automation Document는 YAML/JSON으로 정의되어 git에 들어가고, 사람이 콘솔에서 클릭하는 절차가 코드로 표현된다. 그래서 같은 사고가 재발해도 자동으로 동일한 복구 절차가 실행된다. 이게 "MTTR 1시간 → 5분"의 결정적 메커니즘이다.

### 2. Security — 보안, DevSecOps의 출발점

전통적 보안은 "배포 후 보안팀이 점검"이었지만 DevSecOps는 "**shift left**" — 보안을 파이프라인 왼쪽(개발 단계)으로 당긴다. SAST(정적 분석)는 CodeBuild의 한 phase로 들어가고, DAST(동적 분석)는 staging 환경에서 자동 실행되며, 컨테이너 이미지 스캔(ECR Scan, Inspector)은 빌드 시점에 실행된다.

AWS 도구 매핑:
- **Identity & Access**: IAM, IAM Identity Center(구 SSO), Permissions Boundary
- **Detective controls**: GuardDuty, Security Hub, Macie, CloudTrail
- **Infrastructure protection**: VPC, WAF, Shield, Network Firewall
- **Data protection**: KMS, ACM, Secrets Manager
- **Incident response**: Detective, Security Lake, IR Runbook

> 📚 **사례**: 2019년 Capital One 사고(1억 600만 고객 데이터 유출)는 보안의 shift left 부재가 어떤 결과를 가져오는지 보여준다. SSRF 취약점이 있는 WAF + IMDSv1 + 과도한 IAM 권한이 결합되어 사고로 이어졌는데, 이 모든 요소가 CI/CD 단계에서 자동으로 검출 가능했던 것이다. AWS는 이 사고 직후 IMDSv2를 출시했고, Inspector v2(2021)에 자동 IMDSv1 검출 룰을 추가했다.

> 💡 **관련 이론**: NIST CSF(Cybersecurity Framework)의 5 함수(Identify, Protect, Detect, Respond, Recover)가 W-AF Security Pillar의 best practice와 거의 1:1로 매핑된다. DOP-C02는 NIST 용어를 직접 묻지는 않지만, "Detective control vs Preventive control" 같은 분류는 자주 나온다.

### 3. Reliability — 안정성, DR과 자동 복구

"Workload performs its intended function correctly and consistently when expected." 핵심은 두 가지 — **장애가 일어나지 않게**(prevention)와 **장애가 일어나도 자동 복구**(self-healing).

핵심 design principle:
- **Automatically recover from failure** (Auto Scaling, Lambda retry, Step Functions)
- **Test recovery procedures** (Resilience Hub, Fault Injection Simulator)
- **Scale horizontally** (단일 거대 인스턴스 X, 여러 작은 인스턴스 O)
- **Stop guessing capacity** (Auto Scaling + predictive scaling)
- **Manage change in automation** (IaC + CI/CD)

AWS 도구 매핑:
- **Foundations**: Service Quotas, Trusted Advisor
- **Workload architecture**: Multi-AZ, Multi-Region (Aurora Global DB, DynamoDB Global Tables)
- **Change management**: Code* 시리즈, CloudFormation drift
- **Failure management**: CloudWatch Alarms, SSM Automation, Route 53 health checks

> 🔍 **더 깊이**: AWS의 Reliability 철학은 "**Cell-based architecture**"로 진화하고 있다. 한 리전을 여러 독립적인 cell로 나누고, 한 cell의 장애가 다른 cell에 전파되지 않게 격리한다. 이게 2017년 S3 us-east-1 장애 이후 AWS 내부적으로 점진적으로 적용되어 왔다. 시험에서는 직접 안 나오지만, "blast radius 최소화"라는 키워드로 같은 개념이 등장한다.

### 4. Performance Efficiency — 성능 효율

"Use computing resources efficiently to meet system requirements." 단순히 "빠르게"가 아니라 "**필요한 만큼만 효율적으로**"가 핵심이다.

핵심 design principle:
- **Democratize advanced technologies** (관리형 서비스로 복잡성 위임)
- **Go global in minutes** (CloudFront, Global Accelerator)
- **Use serverless architectures** (Lambda, Fargate, S3로 운영 부담 제거)
- **Experiment more often** (AppConfig feature flag, Evidently A/B test)
- **Mechanical sympathy** (워크로드 특성에 맞는 도구 선택 — GPU, Graviton)

DevOps 관점에서 중요한 건 "**experimentation 인프라**"다. AWS Evidently로 A/B 테스트를 코드로 정의하고, AppConfig로 점진적 롤아웃을 하며, CloudWatch RUM으로 실사용자 성능을 측정한다.

> 💡 **관련 이론**: "Mechanical sympathy"는 Martin Thompson이 2011년 만든 용어로, "하드웨어 특성을 이해하고 그에 맞는 코드를 짠다"는 뜻이다. AWS에서는 워크로드별 인스턴스 family 선택(C5: 컴퓨트 집약, R5: 메모리, M5: 균형, X1: 인메모리 DB)이 정확히 이 개념이다. Graviton(ARM)이 등장하면서 가격-성능 trade-off가 다시 등장했다.

### 5. Cost Optimization — 비용 최적화

"Run systems to deliver business value at the lowest price point." DevOps와 직접 연관되는 부분은 "**자동화된 비용 거버넌스**"다.

핵심 design principle:
- **Implement cloud financial management** (FinOps, AWS Budgets)
- **Adopt a consumption model** (사용한 만큼만)
- **Measure overall efficiency** (Cost per transaction, not just total cost)
- **Stop spending money on undifferentiated heavy lifting** (관리형 서비스 우선)
- **Analyze and attribute expenditure** (Cost Allocation Tags, Cost Categories)

AWS 도구 매핑:
- **Awareness**: Cost Explorer, Budgets, AWS Cost Anomaly Detection
- **Optimization**: Compute Optimizer, Trusted Advisor, Savings Plans, Spot
- **Lifecycle**: S3 Intelligent-Tiering, Lifecycle Policy

> 🎯 **시나리오**: 한 회사가 "야간에만 사용하는 분석 워크로드"라는 시나리오를 제시하면, 답은 Cost Optimization 쪽이다. 패턴은 ① EC2 → Spot 인스턴스로 전환 ② Scheduled Scaling으로 야간만 켜기 ③ S3 → IA/Glacier로 콜드 데이터 이동 ④ Lambda나 Fargate로 idle cost 제거.

### 6. Sustainability — 지속 가능성 (2021 추가)

탄소 발자국 최소화. DevOps 관점에서는:
- 리전 선택 (재생에너지 비율 높은 리전 — 스톡홀름, 더블린, 오리건)
- 워크로드 효율화 (idle 인스턴스 제거, Spot/Graviton 사용)
- 데이터 lifecycle 관리 (불필요한 로그·백업 제거)

AWS는 2025년까지 100% 재생에너지, 2040년까지 net-zero carbon을 약속했다. 시험에서 직접 묻는 비중은 낮지만, "어느 리전이 가장 친환경적인가" 같은 보기가 종종 등장한다.

## 6 Pillars 간 trade-off — 시험의 진짜 깊이

W-AF의 진짜 어려운 점은 6 Pillar가 **서로 충돌**한다는 것이다. 어느 하나를 강화하면 다른 하나가 약해진다.

| 충돌 | 설명 | 예시 |
|------|------|------|
| Reliability ↔ Cost | Multi-AZ/Region은 안정성을 높이지만 비용 2-3배 | RDS Multi-AZ vs Single-AZ |
| Security ↔ Operational Excellence | 강한 보안은 자동화를 어렵게 함 | Cross-account 자동 배포 vs IAM 분리 |
| Performance ↔ Cost | 고성능 인스턴스는 비싸다 | C5n vs C5 |
| Reliability ↔ Performance | 동기 복제는 안정성 ↑, latency ↑ | RDS Multi-AZ sync replication |
| Sustainability ↔ Performance | 친환경 리전이 사용자와 멀 수 있음 | Stockholm 리전 vs Seoul 사용자 |

이 trade-off가 시험 시나리오의 본질이다. 예를 들어 "**RTO 5분, 비용 최소화**"가 동시에 요구되면 Pilot Light DR 패턴(평소엔 최소 자원만, 사고 시 빠르게 확장)이 정답이다. 둘 중 하나만 극단적으로 잡으면 모두 망친다.

> ⚠️ **함정**: 시험에서 "**모든 Pillar를 동시에 만족하는 솔루션**"이 보기에 있으면 거의 함정이다. 현실에서 그런 게 없다. 시나리오에서 명시된 우선순위(예: "비용보다 안정성 우선")를 잡아내고, 그 우선순위에 맞춰 답을 골라야 한다.

## DevOps Guidance — 2023 발표된 W-AF의 lens

2023년 AWS는 W-AF의 lens 중 하나로 **DevOps Guidance**를 별도 발행했다. 6 Pillar에 새로 추가된 게 아니라, 6 Pillar 전체에 걸쳐 DevOps 관점에서 추가된 가이드라인이다.

DevOps Guidance의 4개 영역:
1. **Organizational Adoption** — 팀 구조, 책임 분담, 문화 변화
2. **Development Lifecycle** — Source, Build, Test, Release, Deploy
3. **Quality Assurance** — Automated testing, observability, chaos eng
4. **Automated Governance** — Policy as Code, AWS Config, Service Control Policy

이 lens가 등장한 의미는 크다 — AWS가 공식적으로 "DevOps는 W-AF 안에서 별개의 lens가 필요할 만큼 중요한 cross-cutting concern"으로 인정한 셈이다. DOP-C02 시험은 이 lens의 내용을 직접 묻진 않지만, 시나리오의 배경 사고로 깔려 있다.

> 📚 **사례**: 한 글로벌 핀테크가 DevOps Guidance lens로 자체 진단을 했을 때 "Organizational Adoption" 영역에서 가장 낮은 점수가 나왔다. 도구는 다 있는데(CodePipeline, X-Ray, GuardDuty) 팀 책임이 명확하지 않아 사고 시마다 "누가 답할 차례냐"로 시간을 허비했다. 해결책은 SLO + Error Budget + Incident Manager runbook 일원화. 6개월 후 MTTR이 4시간 → 30분으로 단축됐다.

## Trusted Advisor — W-AF 자동 진단의 도구

콘솔에서 6 Pillar를 자동 진단해주는 도구가 **Trusted Advisor**다. 250+ 체크 항목이 5개 카테고리(Cost, Performance, Security, Fault Tolerance, Service Limits)로 분류된다.

| 카테고리 | W-AF Pillar 매핑 | 예시 체크 |
|----------|------------------|-----------|
| Cost Optimization | Cost Optimization | 미사용 EIP, 낮은 사용률 EC2 |
| Performance | Performance Efficiency | High CPU 인스턴스, EBS 사용률 |
| Security | Security | MFA 없는 root, 0.0.0.0/0 SG |
| Fault Tolerance | Reliability | Single AZ RDS, ASG 미설정 |
| Service Limits | Reliability + Cost | API rate limit 근접 |

Business/Enterprise Support 플랜에서 전체 체크가 활성화되고, Developer 플랜에서는 기본 7개만 제공된다. EventBridge 통합으로 체크 결과를 자동화 워크플로에 연결할 수 있다(예: 0.0.0.0/0 SG 발견 시 Slack 알림 + Lambda 자동 수정).

> 🔍 **더 깊이**: AWS Trusted Advisor와 AWS Config Rules는 비슷해 보이지만 다르다. Trusted Advisor는 AWS가 정의한 250+ best practice를 체크, Config Rules는 고객이 정의한 임의 규칙을 체크. 시험에서 "AWS-managed best practice check"가 키워드면 Trusted Advisor, "custom compliance rule"이면 Config다.

## W-AF Tool — 자동화된 review

콘솔의 AWS Well-Architected Tool은 워크로드를 등록하고 6 Pillar의 질문에 답하면 risk 점수를 산출해준다. CLI로도 가능:

```bash
# Workload 생성
aws wellarchitected create-workload \
  --workload-name "prod-payment-api" \
  --description "Payment processing API" \
  --environment PRODUCTION \
  --aws-regions ap-northeast-2 us-east-1 \
  --lenses wellarchitected serverless devops

# Review 진행
aws wellarchitected list-answers \
  --workload-id $WORKLOAD_ID \
  --lens-alias wellarchitected

# 자동화: improvement plan 추출
aws wellarchitected get-workload --workload-id $WORKLOAD_ID \
  | jq '.Workload.RiskCounts'
# 출력 예: {"UNANSWERED": 0, "HIGH": 3, "MEDIUM": 7, "NONE": 21, "NOT_APPLICABLE": 5}
```

여기서 HIGH risk 3개가 우선순위. AWS Console에서 각 HIGH를 클릭하면 구체적인 improvement plan(예: "Enable Multi-AZ for RDS")이 나온다.

## 정리하며 — 시나리오 풀이의 6 Pillar 매핑법

시험장에서 한 시나리오를 받으면 이렇게 분류한다:

1. **키워드 스캔**: "비용 최소화" → Cost / "RTO/RPO" → Reliability / "지연 시간" → Performance / "감사 추적" → Security / "자동화" → Operational Excellence / "탄소" → Sustainability
2. **trade-off 인식**: 두 Pillar가 동시에 언급되면 우선순위를 확인
3. **AWS 도구 후보 추리기**: Pillar별 도구 지도에서 후보 선택
4. **2-3개 보기 비교**: trade-off 관점에서 가장 적합한 것

이 4단계가 익숙해지면 시나리오 문제가 단순한 패턴 인식 작업이 된다.

다음 글에서는 AWS의 DevOps 도구 전체 지도 — Code* 시리즈, CDK, SSM, CloudWatch, X-Ray 등을 한눈에 정리해 어디서 어떤 도구를 쓰는지 감을 잡는다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 "사용자 응답 시간을 50ms 이하로 보장하면서, 동시에 비용도 최저화하라"는 요구를 제시했다. 이 시나리오에서 W-AF Pillar 간 trade-off로 가장 정확한 분석은?

A) Performance와 Security의 충돌
B) Performance와 Cost Optimization의 충돌 — 50ms 보장에는 CloudFront/Global Accelerator가 필요한데 추가 비용 발생
C) Reliability와 Performance의 충돌
D) Sustainability와 Cost의 충돌

**정답: B**
해설: "응답 시간 50ms"는 Performance Efficiency 요구, "비용 최저화"는 Cost Optimization 요구. 둘은 trade-off다. 글로벌 사용자를 50ms로 보장하려면 CloudFront(엣지 캐싱) 또는 Global Accelerator(Anycast)가 필요하고, 둘 다 추가 비용을 발생시킨다. 절충점은 보통 "주요 시장 사용자만 CloudFront, 비주류 지역은 직접 origin 접근". 시험에서 "동시에 만족하는 단일 솔루션"이 보기에 있으면 함정.

---

**문제 2.** Trusted Advisor와 AWS Config Rules의 차이로 가장 정확한 것은?

A) Trusted Advisor는 실시간, Config Rules는 주기적
B) Trusted Advisor는 AWS가 정의한 best practice 체크, Config Rules는 고객이 정의한 임의 compliance rule 체크
C) Trusted Advisor는 무료, Config Rules는 유료
D) 둘은 같은 도구의 다른 이름

**정답: B**
해설: 본질적 차이는 "**누가 룰을 정의하는가**"다. Trusted Advisor는 AWS 자체의 250+ best practice(MFA 없는 root, 0.0.0.0/0 SG 등)를 체크. Config Rules는 고객이 자기 환경에 맞춰 정의(예: "모든 EBS는 KMS 암호화", "모든 EC2는 회사 prefix 태그 보유"). 시험에서 "AWS-managed check"면 Trusted Advisor, "custom compliance"면 Config Rules. A는 잘못된 분류(둘 다 주기적), C도 사실이 아니다(Trusted Advisor 전체 체크는 Business/Enterprise Support 필요).

---

**문제 3.** W-AF의 6 Pillar 중 "Make frequent, small, reversible changes"를 design principle로 명시한 것은?

A) Reliability
B) Security
C) Operational Excellence
D) Performance Efficiency

**정답: C**
해설: 이 원칙은 Operational Excellence의 design principle이다. DORA의 "small batch size + 빠른 lead time"과 정확히 같은 발상으로, **변경 단위가 작을수록 디버깅·롤백이 쉽다**는 통찰. CodePipeline + CodeDeploy로 자동화하고, Feature flag로 배포-릴리스 분리하는 게 AWS에서의 구현. Reliability는 "Automatically recover from failure", Security는 "Implement security at all layers", Performance는 "Use serverless architectures"가 대표 원칙.

---

**문제 4.** 어떤 회사가 자체 환경에서 W-AF Tool을 실행한 결과 HIGH risk 5개, MEDIUM risk 12개가 나왔다. 우선순위 처리 순서로 가장 적절한 것은?

A) 모든 HIGH를 먼저 처리 후 MEDIUM 처리
B) HIGH 중에서도 Security 관련을 최우선, 그 다음 Reliability, 그 다음 나머지
C) 비용이 적게 드는 MEDIUM부터 처리
D) MEDIUM부터 시작해 점진적으로 HIGH

**정답: B**
해설: W-AF가 HIGH/MEDIUM/LOW 점수만 주지만 **실무 우선순위는 Pillar별로 다르다**. Security HIGH는 즉시 사고로 이어질 수 있고(IAM 노출, MFA 없음), Reliability HIGH는 곧 비즈니스 중단으로(Single-AZ RDS, ASG 미설정), Cost HIGH는 비용 낭비지만 즉각 사고는 아님. AWS Well-Architected best practice 가이드도 Security/Reliability 우선을 권장한다. C, D는 잘못된 우선순위, A는 일견 맞아 보이지만 "HIGH 내 우선순위"를 무시함.

---

**문제 5.** DevOps Guidance lens가 2023년 W-AF에 추가된 의미로 가장 정확한 것은?

A) DevOps가 Operational Excellence Pillar로 통합되었다
B) DevOps는 6 Pillar 전체에 걸친 cross-cutting concern으로 별도 lens가 필요할 만큼 중요해졌다
C) DevOps Pillar가 새로 추가되어 7 Pillar가 되었다
D) DevOps는 더 이상 별도 개념이 아니다

**정답: B**
해설: DevOps Guidance는 별도 Pillar가 아니라 **lens**다. lens는 W-AF의 6 Pillar를 특정 도메인(Serverless, ML, DevOps 등) 관점에서 재해석하는 추가 가이드. DevOps lens는 4개 영역(Organizational Adoption, Development Lifecycle, QA, Automated Governance)으로 6 Pillar 전체에 cross-cutting하게 적용된다. C는 잘못된 사실(여전히 6 Pillar), A도 부정확(Operational Excellence는 그대로 존재).

---

**문제 6.** 한 회사가 EU 사용자 대상 서비스를 운영하는데 GDPR 준수와 응답 시간 단축이 모두 중요하다. 다음 중 가장 적합한 설계는?

A) us-east-1에 단일 배포, CloudFront로 가속
B) eu-west-1(아일랜드)에 배포 + CloudFront EU edge, KMS 키도 EU 리전 생성
C) ap-northeast-2에 배포 후 Global Accelerator
D) sa-east-1에 배포

**정답: B**
해설: GDPR은 "EU 시민 데이터는 EU 또는 적정성 결정 받은 지역에 저장" 요구(Security Pillar). 응답 시간은 EU 리전에 origin 두고 CloudFront EU edge로 가속(Performance Pillar). KMS 키도 EU 리전에 두어야 데이터 주권 만족(Security). A는 데이터가 미국에 저장돼 GDPR 위반 가능, C는 비-EU 리전이라 GDPR 위반, D는 남미 리전. 또한 EU 리전 중 dublin(eu-west-1)이나 stockholm(eu-north-1, 재생에너지 100%)이 Sustainability까지 만족.

---

**문제 7.** Cost Optimization Pillar의 "Adopt a consumption model" 원칙에 가장 부합하는 AWS 도구 조합은?

A) Reserved Instance + Savings Plans
B) Lambda + Fargate Spot + S3 Intelligent-Tiering + Aurora Serverless v2
C) EC2 Dedicated Hosts + Provisioned IOPS EBS
D) Outposts + Snowball

**정답: B**
해설: "Consumption model"은 **사용한 만큼만 비용 발생**이라는 뜻이다. Lambda는 실행 시간당, Fargate Spot은 컨테이너 실행 시간당, S3 Intelligent-Tiering은 객체별 자동 tier 이동, Aurora Serverless v2는 ACU(Aurora Capacity Unit) 단위 자동 스케일. 전부 idle cost가 0에 가깝다. A는 약정 기반(consumption 아님), C는 dedicated 자원, D는 온프레미스 하드웨어 비용. 시험에서 "pay-only-for-what-you-use" 키워드가 핵심.
