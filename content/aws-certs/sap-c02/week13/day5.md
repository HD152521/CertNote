# Day 65 - Week 13 복습 + 시나리오 10문항

📅 Week 13 (Day 5)
🎯 주제: Well-Architected 종합
⏱️ 약 90분

---

## 📌 한 페이지 요약

### 6 기둥
1. Operational Excellence — IaC·CI/CD·관측성·자동화
2. Security — ID·추적성·암호화·사고 대응
3. Reliability — 자동 복구·Multi-AZ→Region·FIS 테스트
4. Performance Efficiency — Managed·Serverless·캐싱
5. Cost Optimization — 소비 모델·Right-size·SP/RI/Spot
6. Sustainability — 유휴 0·Graviton·재생에너지 리전·CCFT

### WA Tool
- 워크로드 등록 → 질문 → HRI 도출 → Milestone
- Lens: Serverless, SaaS, ML, Data Analytics, HPC, FS, Healthcare

### 키워드 매핑
- "운영 부담 최소" → Ops (Managed)
- "장애 견딤" → Reliability
- "지연·캐시" → Performance
- "비용 ↓" → Cost
- "탄소·환경" → Sustainability
- "감사·최소 권한·암호화" → Security

---

## 📝 시나리오 10문항

**문제 1.** "운영 부담 최소" + "EC2 → Fargate".

A) Reliability
B) Operational Excellence
C) Cost
D) Sustainability

**정답: B** — 관리형 전환은 Ops 우선

---

**문제 2.** "RTO 5분 + Multi-Region".

A) Performance
B) Reliability
C) Cost
D) Security

**정답: B**

---

**문제 3.** "DB 비밀번호 30일 자동 변경".

A) Reliability
B) Security (Secrets Manager 로테이션)
C) Ops
D) Cost

**정답: B**

---

**문제 4.** "Graviton 전환으로 비용·전력↓".

A) Cost만
B) Cost + Sustainability
C) Performance만
D) Reliability

**정답: B**

---

**문제 5.** "복구 절차 정기 검증".

A) Backup
B) FIS
C) Trusted Advisor
D) Config

**정답: B**

---

**문제 6.** "사람 SSH 없이 EC2 접속".

A) Bastion
B) SSM Session Manager
C) VPN
D) Direct Connect

**정답: B**

---

**문제 7.** "탄소 배출량 콘솔 확인".

A) Trusted Advisor
B) Customer Carbon Footprint Tool
C) Compute Optimizer
D) Sustainability Lens

**정답: B**

---

**문제 8.** "API 누가 호출했는지 추적".

A) Config
B) CloudTrail
C) CloudWatch
D) Detective

**정답: B**

---

**문제 9.** "다른 팀이 임의 인프라 생성 금지·승인된 템플릿만".

A) IAM 일일이
B) Service Catalog
C) Config Rule
D) SCP

**정답: B** — Pro 정답 (또는 SCP + SC 조합)

---

**문제 10.** "HPC 클러스터 노드 통신 저지연".

A) Spread PG
B) Partition PG
C) Cluster PG + EFA
D) Cross-AZ

**정답: C**

---

## 📌 Week 13 한 줄 정리

> "6 기둥은 시나리오 키워드 → 기둥 → 도구로 직답. WA Tool/Lens로 HRI 식별, 주기적 Milestone."

---

## 🎯 다음 주 (Week 14) 예고

복원력·DR — 4가지 전략, Backup, Resilience Hub, FIS, Aurora Global·DDB Global.
