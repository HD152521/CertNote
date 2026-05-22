# Day 1 - SAP 시험 전략과 질문 분해 기법

📅 날짜: Week 1 (Day 1)
🎯 주제: Pro 시험의 함정·키워드·시간 배분·오답 소거법
⏱️ 학습 시간: 약 90분 (출퇴근 20분으로 핵심만 훑기 가능)

---

## 🎯 학습 목표

- SAP-C02 시험 구조와 SAA와의 차이를 명확히 이해한다
- 긴 시나리오 문제를 5단계로 분해하는 기법을 익힌다
- 도메인 4개의 핵심 키워드와 오답 함정 패턴을 파악한다
- 180분 / 75문항 시간 전략을 세운다

---

## 🧩 사전 지식 (CS 기초)

> 출퇴근 중 처음 보는 사람을 위해 — Pro 시험 시나리오를 읽으려면 알아두면 좋은 개념.

- **NFR (Non-Functional Requirements)**: 가용성, 성능, 보안, 비용, 운영성 같은 "어떻게"의 요구. 시험은 거의 항상 NFR로 정답이 갈림.
- **트레이드오프(Trade-off)**: 한쪽을 얻으면 다른 쪽을 잃는 관계. 예: 강한 일관성 ↔ 가용성(CAP), 비용 ↔ 성능, 보안 ↔ 사용성.
- **Blast Radius(폭발 반경)**: 장애·보안 사고가 영향을 미치는 범위. 멀티 계정·멀티 리전 설계의 핵심 동기.
- **MTBF / MTTR**: 평균 고장 간격 / 평균 복구 시간. 가용성 = MTBF / (MTBF + MTTR). Pro에서는 MTTR을 줄이는 자동화가 자주 정답.
- **Eventual Consistency vs Strong Consistency**: DynamoDB, S3 등에서 결정. 글로벌 분산 시 거의 항상 트레이드오프.
- **이상치(Outlier) 응답**: 평균이 아닌 p99·p99.9 지연. Pro 시험 시나리오에 "99% 사용자에게 200ms 이내" 같은 표현이 나오면 캐싱·CDN·DAX·ElastiCache로 풀어야 함.

---

## 📖 이론 내용

### 1. SAP-C02 시험 구조 정리

- **75문항 / 180분** = 문항당 평균 2분 24초.
- **객관식(단일 답) + 복수응답(2~3개 정답)** 혼합.
- **합격선 750/1000**. Scaled Score 방식이라 도메인 가중치는 비공개.
- **표시(Review for Later)** 기능으로 어려운 문제는 일단 표시 후 패스, 마지막에 검토.

| 도메인 | 비중 | 학습 무게 중심 |
|--------|------|----------------|
| 1. 복잡한 조직 설계 | 26% | Organizations, SCP, Identity Center, 네트워크 통합 |
| 2. 신규 솔루션 설계 | 29% | 가용성·확장성·보안·비용을 동시에 만족 |
| 3. 마이그레이션·현대화 | 20% | 7R, MGN, DMS, 컨테이너화·서버리스화 |
| 4. 지속적 개선 | 25% | Well-Architected, FinOps, 자동화 |

### 2. SAA vs SAP — 본질적 차이

SAA는 "이 서비스의 기능을 아는가"를 묻고, SAP는 **"여러 제약 조건 아래 무엇이 최적해인가"** 를 묻는다.

**SAA 스타일**
> 가용성이 높은 웹 서비스를 위해 무엇을 써야 하는가?
> A) Single AZ EC2  B) Multi-AZ ELB+EC2  C) ...
> → 답: 명확

**SAP 스타일**
> 글로벌 사용자 5000만 명, 미국·EU·아시아 데이터 격리 규제, 5분 RPO·15분 RTO, 운영팀 5명, 연간 예산 $2M 이내, 6개 자회사 각자 AWS 계정 보유 ─ 가장 적절한 아키텍처는?
> A) 4개 그럴듯한 옵션 (각각 다른 트레이드오프)

→ 정답은 **"문제 조건 전체를 만족하면서 운영 부담·비용이 최저"** 인 옵션.

### 3. 시나리오 분해 5단계 기법 (⭐ 가장 중요)

긴 지문을 만나면 다음 5단계로 메모하며 읽는다 (시험장에선 머릿속 또는 화이트보드).

1. **Actor**: 누가? (스타트업·대기업·금융사·정부)
2. **Workload**: 무엇? (웹·배치·ML·실시간·DB)
3. **Constraints**: 제약 (규제·예산·기존 자산·인력)
4. **NFR**: 정량 요구 (RTO/RPO, 지연, 처리량, 가용성 %)
5. **Keyword**: 정답 힌트 단어 ("운영 오버헤드 최소", "비용 효율", "장애 격리")

예시:
> "한국 핀테크 스타트업이 KISA 규제 준수, 99.99% 가용성, 10ms 이내 응답, 6명 DevOps 팀, 연간 $500K 예산, 기존 온프레미스 Oracle DB 마이그레이션 …"

→ Actor: 핀테크 / Workload: 거래 / Constraints: KISA + Oracle + 인력 적음 / NFR: 99.99%+10ms / Keyword: **"운영 부담 최소"** ⇒ Aurora(PostgreSQL)+RDS Proxy+DMS, Fargate 우선.

### 4. 오답 소거의 정석 — 4가지 함정 패턴

Pro의 4개 선택지는 **모두 동작**한다. 정답은 "조건을 가장 잘 만족하는 것". 다음 함정을 외워두자.

| 함정 | 설명 | 대처법 |
|------|------|--------|
| ① 과잉 설계 | 사실은 불필요한 멀티 리전·서버리스·KMS 키 추가 | "최소 요구"를 다시 읽기 |
| ② 운영 부담 | EC2+직접 관리 솔루션을 추천 | 키워드 "운영 오버헤드 최소"면 Managed/Serverless |
| ③ 시대착오 | EC2 Classic, sg-link, NAT Instance 같은 옛 패턴 | 최신 서비스 우선 (TGW, NAT GW, IAM Identity Center) |
| ④ 부분 정답 | 문제는 만족하지만 부수 요건 누락 (예: 비용 무시) | 모든 NFR을 다 만족하는지 체크 |

### 5. 시간 배분 전략

| 단계 | 시간 | 목표 |
|------|------|------|
| 1차 패스 (Easy/Medium) | 100분 | 75문항 중 60문항 답 + 어려운 건 표시 |
| 2차 패스 (표시 문제) | 60분 | 어려운 15문항 집중 |
| 최종 검토 | 15분 | 표시 해제 못한 답·복수응답 개수 확인 |
| Buffer | 5분 | 화장실·휴식·심호흡 |

> ⚠️ **함정**: 한 문제에 5분 이상 잡혀 있으면 그 문제 때문에 뒷 10문항을 못 봄. 무조건 표시 후 패스.

---

## 🧠 알아두면 좋은 심화 이론

### Pro 시험에 자주 등장하는 "정답 키워드" 사전

| 지문 키워드 | 의도 | 우선 서비스 |
|-------------|------|-------------|
| "운영 부담 최소" "Managed solution" | Serverless·Managed 선호 | Lambda, Fargate, Aurora, EventBridge |
| "Highly available" + "낮은 RTO" | Multi-AZ 기본, 짧으면 Active-Active | ALB+Multi-AZ, Aurora Global, R53 Failover |
| "Cost-effective" + "변동성 워크로드" | 사용량 기반 | Lambda, Spot, S3 IA/Glacier, Serverless DB |
| "전 세계 사용자" + "낮은 지연" | 엣지에서 처리 | CloudFront, Global Accelerator, Lambda@Edge |
| "데이터 격리" "규제" | 멀티 계정·KMS·VPC 격리 | Organizations, SCP, KMS, Macie |
| "감사 / 거버넌스" | 변경 추적·정책 강제 | Config, CloudTrail, Control Tower, Audit Manager |
| "기존 X 활용" | 재사용·migrate 우선 | DMS, MGN, App2Container, Outposts |

### Cross-Reference

- **Week 2**: 도메인 1 (조직 설계) 본격 진입
- **Week 5**: 도메인 2의 멀티 리전 패턴
- **Week 6**: 도메인 3 마이그레이션 전체
- **Week 13**: 도메인 4 Well-Architected

---

## 🏗️ 아키텍처 다이어그램 — 시나리오 분해 워크플로우

```
긴 지문 (Pro 시험 문제)
       |
       v
+----------------------+
| 1. Actor (누가)      |
| 2. Workload (무엇)   |
| 3. Constraints (제약)|
| 4. NFR (정량 요구)   |
| 5. Keyword (힌트)    |
+----------------------+
       |
       v
선택지 4개 비교
   |
   v
함정 4종 검사
- 과잉 설계?
- 운영 부담?
- 시대착오?
- 부분 정답?
   |
   v
NFR 전부 만족하는 옵션 1개 선택
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **모든 옵션이 동작한다** — 정답은 "최적해"
2. ⭐ **시나리오 분해 5단계** (Actor/Workload/Constraints/NFR/Keyword)
3. ⭐ **"운영 오버헤드 최소"** 는 거의 항상 Managed/Serverless 선택
4. ⭐ **"비용 효율"** + "변동성"이면 Spot/Lambda/On-Demand
5. ⭐ **시간 배분** — 한 문제 5분 넘기지 말 것

---

## 💻 실제 예시 - 분해 연습

**문제(요약)**:
> 글로벌 SaaS, 5000만 MAU, AP/EU/US 데이터 분리, RTO 5분, 5명 SRE, 비용 우선. ─ 최적은?
> A) 3개 리전 Active-Active Aurora Global + Route53 Latency + CloudFront
> B) us-east-1 단일 리전 + Multi-AZ + CloudFront
> C) 3개 리전 Active-Passive + 매뉴얼 페일오버
> D) 각 리전 별도 계정 + DynamoDB Global Tables + Lambda + R53 Latency

**분해**:
- Actor: 글로벌 SaaS
- Workload: 사용자 트래픽 + 데이터
- Constraints: 데이터 격리 + SRE 5명(적음)
- NFR: RTO 5분, 비용 우선
- Keyword: "비용", "운영 부담"

**소거**:
- B: RTO 충족 의문 + 데이터 격리 X → 탈락
- C: 매뉴얼 페일오버 = RTO 5분 못 맞춤 → 탈락
- A: 동작하지만 Aurora Global Cross-Region = 비싸고 운영 복잡 → 후순위
- D: DynamoDB Global + Lambda = Serverless·운영 최소·비용 변동·데이터 격리 가능 → **정답**

---

## 📝 연습 문제

**문제 1.** Pro 시험에서 "operational overhead를 최소화"라는 키워드가 나오면 가장 먼저 고려해야 할 것은?

A) EC2 Auto Scaling Group
B) AWS Managed/Serverless 서비스
C) 멀티 리전 Active-Active
D) 온프레미스 통합

**정답: B**
해설: "운영 오버헤드 최소" = 관리 부담 최소 = Managed/Serverless 우선.

---

**문제 2.** 다음 중 SAA와 SAP의 가장 큰 차이는?

A) 시험 시간
B) 합격 점수
C) 시나리오 길이와 트레이드오프 깊이
D) 응시료

**정답: C**
해설: SAA는 단일 서비스 지식, SAP는 다중 제약 조건 하의 최적해 선택.

---

**문제 3.** 시나리오 분해 5단계 중 "RTO 15분, 99.99%" 같은 정량 요구는 어디에 해당하는가?

A) Actor
B) Workload
C) Constraints
D) NFR

**정답: D**
해설: NFR(Non-Functional Requirement) = 정량적 비기능 요구사항.

---

**문제 4.** 한 문제에 5분 이상 걸릴 때 가장 좋은 전략은?

A) 끝까지 풀고 다음 문제
B) 표시(Mark for Review)하고 넘어감
C) 직감으로 즉시 답 선택
D) 시험 시간을 연장 요청

**정답: B**
해설: 시간 부족이 시험에서 가장 큰 적. 표시 후 2차 패스에서 풀이.

---

**문제 5.** 다음 함정 중 "EC2 Classic을 추천하는 옛 패턴 선택지"는 어떤 함정인가?

A) 과잉 설계
B) 운영 부담
C) 시대착오
D) 부분 정답

**정답: C**
해설: 시대착오 함정 — 현재 시점 기준 최신 서비스가 정답.

---

**문제 6.** "비용 효율적" + "변동성 큰 트래픽" 조합에서 가장 부적절한 선택지는?

A) Lambda
B) Fargate Spot
C) Reserved Instance (3년 약정)
D) S3 Intelligent-Tiering

**정답: C**
해설: 변동성 큰 워크로드에 3년 RI는 낭비. Lambda·Spot이 적합.

---

## 📌 오늘의 요약

1. SAP-C02는 75문항/180분, 75% (750/1000) 합격 — "최적해" 시험
2. 시나리오를 Actor/Workload/Constraints/NFR/Keyword 5단계로 분해
3. 4가지 함정 — 과잉 설계, 운영 부담, 시대착오, 부분 정답 — 항상 의심
4. "운영 오버헤드 최소" = Managed/Serverless, "비용 효율" = Spot/Serverless/Tier
5. 한 문제 5분 이상 잡혔으면 무조건 표시 후 패스, 시간 관리가 합격의 절반
