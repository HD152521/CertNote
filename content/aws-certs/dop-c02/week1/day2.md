# Day 2 - Well-Architected Framework - DevOps 관점

📅 날짜: Week 1 (Day 2)
🎯 주제: AWS Well-Architected의 6개 기둥과 DevOps Lens 핵심 디자인 원칙
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Well-Architected Framework 6개 기둥을 외운다
- DevOps Lens가 운영 우수성 기둥을 어떻게 확장하는지 이해한다
- 시험에 등장하는 "어떤 기둥의 원칙에 부합하는가?" 유형을 푼다
- 트레이드오프(비용 vs 안정성, 속도 vs 보안)를 판단하는 사고 틀을 만든다

---

## 🧩 사전 지식 (CS 기초)

- **Pillar(기둥)**: 시스템 품질의 직교(orthogonal) 축. 한 축을 올리려면 다른 축이 손해를 보기 쉽다.
- **Trade-off**: 두 목표 간 균형. 예: 가용성을 99.99로 올리면 비용이 기하급수적으로 증가.
- **SLO/SLI/SLA**: Indicator(지표) → Objective(내부 목표) → Agreement(외부 계약).
- **Idempotent Operation**: 같은 입력에 같은 출력. 재시도 안전성 보장.
- **Immutable Infrastructure**: 한 번 만들면 수정 없이 교체. EC2 AMI/컨테이너 이미지의 핵심 철학.
- **Cell-based Architecture**: 작은 셀(독립 환경)을 여러 개 운영해 장애 폭발 반경(blast radius)을 좁힘.

---

## 📖 이론 내용

### 1. Well-Architected 6 Pillars

| 기둥 | 영문 | 핵심 질문 |
|------|------|-----------|
| 운영 우수성 | Operational Excellence | "운영을 코드로 어떻게 관리하나?" |
| 보안 | Security | "최소 권한, 데이터 보호, 감사를 어떻게 자동화하나?" |
| 안정성 | Reliability | "장애를 어떻게 견디고 복구하나?" |
| 성능 효율성 | Performance Efficiency | "워크로드에 맞는 리소스를 어떻게 선택·조정하나?" |
| 비용 최적화 | Cost Optimization | "필요한 만큼만 어떻게 쓰나?" |
| 지속가능성 | Sustainability | "리소스 사용의 환경 영향을 어떻게 줄이나?" (2021년 추가) |

> 💡 **암기 팁**: "운보안 성비지" — 운영/보안/안정성/성능/비용/지속가능성.

### 2. DevOps Lens — 운영 우수성의 확장

AWS DevOps Lens는 운영 우수성의 디자인 원칙을 16개로 세분화합니다. 핵심만 추려보면:

1. **운영을 코드로 (Operations as Code)** — IaC, Pipeline-as-Code, Runbook-as-Code
2. **자주, 작게, 되돌릴 수 있는 변경** — Canary, Blue/Green
3. **운영 절차를 자주 개선** — Postmortem 후 Runbook 자동화
4. **장애를 예상** — Chaos Engineering(FIS)
5. **운영 이벤트로부터 학습** — 모든 인시던트를 Lessons Learned로
6. **신뢰성 측정** — SLO/SLI를 정의하고 CloudWatch SLO로 추적
7. **자동 복구** — EventBridge + SSM Automation
8. **셀프서비스 플랫폼** — Service Catalog, Proton
9. **다양한 메트릭 수집** — Embedded Metric Format, X-Ray

### 3. 기둥 간 트레이드오프 시나리오

Professional 시험은 "두 기둥의 충돌 상황"에서 무엇을 우선할지 묻습니다.

| 시나리오 | 충돌하는 기둥 | 일반적 정답 방향 |
|----------|----------------|-------------------|
| 금융 거래 처리 | 비용 ↔ 안정성 | 안정성 우선(Multi-AZ + Multi-Region) |
| 분석 배치 잡 | 비용 ↔ 성능 | 비용 우선(Spot, Glacier) |
| 의료 PHI 데이터 | 비용 ↔ 보안 | 보안 우선(KMS, VPC Endpoint, 감사) |
| 글로벌 게임 | 비용 ↔ 성능 | 성능 우선(Global Accelerator, 로컬 캐시) |
| 사내 도구 | 비용 ↔ 가용성 | 비용 우선(Single AZ도 허용) |

### 4. 지속가능성 — 새로운 기둥, 시험 출제 증가 추세

- 가장 효율적인 리전 선택(저탄소 리전)
- Graviton(ARM) 인스턴스로 와트당 성능 향상
- 자동 종료 정책으로 미사용 리소스 제거
- S3 Intelligent-Tiering으로 저장 효율화
- 컨테이너 밀도 최적화(Fargate Spot, Karpenter)

---

## 🧠 알아두면 좋은 심화 이론

### Reliability Pillar — RTO/RPO 의사결정 매트릭스

| 워크로드 등급 | RTO | RPO | 권장 패턴 | 월 비용 인덱스 |
|---------------|-----|-----|-----------|----------------|
| Tier 0 (Mission Critical) | 0 | 0 | Multi-Region Active-Active | 100 |
| Tier 1 (Business Critical) | <5분 | <1분 | Warm Standby | 50 |
| Tier 2 (Important) | <1시간 | <15분 | Pilot Light | 20 |
| Tier 3 (Standard) | <24시간 | <24시간 | Backup & Restore | 5 |

> ⚠️ **함정**: 시험에서 RTO·RPO·비용 제약을 동시에 주고 묻습니다. "RPO 0, 비용 최저" 같은 모순 조건이면 "비용 제약 하에서 가장 가까운" 답이 정답입니다.

### Security Pillar — 5가지 디자인 원칙

1. **강력한 자격 증명 기반** — IAM Identity Center(SSO), 단기 자격 증명
2. **추적성 활성화** — CloudTrail, Config, GuardDuty
3. **모든 계층에 보안 적용** — VPC, SG, NACL, WAF
4. **데이터 보호** — 저장/전송 암호화, KMS
5. **사람의 데이터 접근 최소화** — Session Manager, JIT 권한

### Cost Optimization — DevOps 관점

- **태깅 자동화**: 모든 IaC에 환경/팀/CostCenter 태그 강제 (Config Rule로 검증)
- **Right-Sizing 자동화**: Compute Optimizer 권장 → Lambda로 자동 조정
- **유휴 리소스 청소**: EventBridge Scheduler + Lambda로 야간 EC2/RDS 정지
- **Spot 활용**: Karpenter, ECS Capacity Provider, CodeBuild Reserved/Spot

### Operational Excellence — Game Day & Chaos

- **Game Day**: 의도된 장애 시뮬레이션으로 Runbook 검증
- **Chaos Engineering**: AWS Fault Injection Simulator(FIS)로 자동화
- **Pre-mortem**: 출시 전 "어떻게 망할지" 토론

### 관련 서비스 Cross-Reference

- **Reliability** → Week 13 (DR 전략)
- **Operational Excellence** → Week 9 (SSM), Week 12 (인시던트)
- **Security** → Week 14 (보안 자동화)
- **Cost** → Week 9 (Parameter Store, Reserved Capacity)

---

## 🏗️ 아키텍처 다이어그램

```
Well-Architected 6 Pillars on a DevOps Pipeline
==================================================

         +-----------------------------------+
         |       Operational Excellence      |
         |  (Pipeline, IaC, Runbook, SLO)    |
         +-----------------------------------+
         |              Security             |
         |  (IAM, KMS, GuardDuty, Config)    |
         +-----------------------------------+
         |             Reliability           |
         |  (Multi-AZ, ASG, Retry, Backup)   |
         +-----------------------------------+
         |       Performance Efficiency      |
         |  (Right-size, Graviton, Caching)  |
         +-----------------------------------+
         |          Cost Optimization        |
         |  (Spot, Tagging, Tiering)         |
         +-----------------------------------+
         |          Sustainability           |
         |  (Region choice, ARM, Density)    |
         +-----------------------------------+
                          |
                          v
           +---------------------------+
           |  Well-Architected Tool    |
           |  (자동 진단 + 개선 권고) |
           +---------------------------+

Trade-off matrix:
  Tier 0:  Reliability >> Cost
  Tier 3:  Cost >> Reliability
  PHI:     Security >> Cost
  Analytics: Cost ~ Performance
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **운영 우수성**의 5가지 디자인 원칙은 DevOps의 척추
2. ⭐ **RTO/RPO와 비용**의 트레이드오프 — Tier에 맞는 DR 전략 선택
3. ⭐ **자동 복구**는 운영 우수성의 핵심 (EventBridge + SSM)
4. ⭐ **태깅 강제**는 비용 최적화 + 보안 + 운영의 공통 기반
5. ⭐ **Sustainability**는 신규 기둥이며 ARM/Graviton, Spot, 종료 정책으로 답한다

---

## 💻 실제 예시 - Well-Architected Tool로 워크로드 진단

```bash
# 워크로드 생성
aws wellarchitected create-workload \
  --workload-name "checkout-api-prod" \
  --description "주문 결제 API 프로덕션" \
  --environment PRODUCTION \
  --aws-regions ap-northeast-2 us-west-2 \
  --lenses arn:aws:wellarchitected:::lens/wellarchitected \
           arn:aws:wellarchitected:::lens/devops \
  --review-owner devops@example.com

# 진단 결과 요약
aws wellarchitected get-workload \
  --workload-id <ID> \
  --query 'Workload.RiskCounts'
```

**출력 예시:**
```json
{
  "HIGH": 3,
  "MEDIUM": 7,
  "NONE": 42,
  "NOT_APPLICABLE": 6,
  "UNANSWERED": 0
}
```

HIGH 리스크 3건은 즉시 개선 필요. 개선 계획은 Improvement Plan에서 자동 생성됩니다.

---

## 📝 연습 문제

**문제 1.** 한 게임 회사가 다음 요구사항을 갖고 있다. "전 세계 사용자, 99.999% 가용성, 비용은 가능한 절감." 이 워크로드의 기둥 우선순위는?

A) Cost > Reliability > Performance
B) Reliability > Performance > Cost (Multi-Region Active-Active + Edge)
C) Sustainability > Reliability > Cost
D) Security > Cost > Performance

**정답: B**
해설: 99.999%(5분/년 다운타임)는 Active-Active를 요구합니다. 글로벌 사용자 = Global Accelerator/CloudFront로 성능. Cost는 자동으로 후순위가 됩니다.

---

**문제 2.** 다음 중 운영 우수성의 "운영을 코드로" 원칙에 가장 부합하는 것은?

A) AWS Console에서 보안 그룹을 매번 수동 생성
B) Runbook을 Wiki에 텍스트로만 작성
C) 인시던트 대응 절차를 SSM Automation Runbook 문서로 정의해 EventBridge로 자동 실행
D) 매주 회의로 운영 변경 사항 결정

**정답: C**
해설: SSM Automation Runbook은 "절차의 코드화"입니다. A·B·D는 모두 수동/문서적.

---

**문제 3.** 의료 PHI(Personal Health Information) 데이터를 다루는 워크로드에서 Cost vs Security 트레이드오프 상황. 가장 적절한 답은?

A) 비용 절감을 위해 KMS 대신 평문 저장
B) 보안 우선 — KMS, VPC Endpoint, CloudTrail Lake로 감사 자동화 (비용은 두 번째)
C) S3 Public Access로 모든 데이터를 노출
D) IAM Root 사용자로 모든 작업 수행

**정답: B**
해설: 규제 산업에서 Security는 비용보다 항상 우선. A·C·D는 명백한 위반.

---

**문제 4.** 다음 중 Sustainability(지속가능성) 기둥에 직접 기여하는 조치가 아닌 것은?

A) ARM 기반 Graviton 인스턴스 사용
B) S3 Intelligent-Tiering 활성화
C) Multi-Region Active-Active 배포
D) 야간 비프로덕션 환경 자동 종료(EventBridge Scheduler + Lambda)

**정답: C**
해설: Multi-Region Active-Active는 가용성 향상에 기여하지만 리소스 사용을 증가시켜 지속가능성과 상충합니다. A·B·D는 리소스 효율을 높여 탄소 발자국을 줄입니다.

---

**문제 5.** 한 팀이 Well-Architected 진단 결과 HIGH 리스크 5건을 받았다. Professional 관점에서 가장 적절한 후속 조치는?

A) HIGH 리스크는 무시하고 다음 분기 검토에 미룬다
B) Improvement Plan에 따라 우선순위를 매기고, IaC로 변경을 자동화하며, 변경 후 Trusted Advisor와 Config Rule로 검증
C) HIGH 리스크를 외부 컨설팅으로 해결
D) 보안팀 1명에게 모두 위임

**정답: B**
해설: Pro 시험의 정공법 — 자동화된 검증 루프 구축. A는 위반, C는 셀프서비스 부재, D는 단일 책임자 안티패턴.

---

**문제 6.** 다음 중 "장애를 예상하고 학습"에 가장 부합하는 AWS 도구는?

A) AWS Cost Explorer
B) AWS Fault Injection Simulator(FIS) + CloudWatch Synthetics로 정기 카오스 테스트
C) AWS Compute Optimizer
D) AWS Budgets

**정답: B**
해설: FIS는 의도된 장애 주입으로 시스템 복원력을 검증합니다. C는 성능, A·D는 비용.

---

**문제 7.** 비용 최적화 관점에서 DevOps 팀이 우선 자동화해야 할 것은?

A) 모든 리소스에 환경/팀/CostCenter 태그 강제 + Config Rule로 미준수 알람 + Cost Explorer로 추적
B) 매월 청구서를 수동 분석
C) Reserved Instance를 일괄 구매
D) 비용은 재무팀이 관리하므로 신경 쓰지 않는다

**정답: A**
해설: 태깅 없이는 비용 귀속이 불가능합니다. 태깅 자동화 + 검증 + 추적이 시작점.

---

## 📌 오늘의 요약

1. Well-Architected 6 기둥: 운영/보안/안정성/성능/비용/지속가능성
2. DevOps Lens는 "운영 우수성" 기둥을 16개 원칙으로 확장
3. 트레이드오프는 워크로드 등급(Tier)별로 우선순위가 다르다
4. "운영을 코드로" — IaC, Pipeline, Runbook 모두 코드화
5. Sustainability 신규 기둥은 Graviton, Tiering, 종료 자동화로 답
