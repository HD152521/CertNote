# Day 25 - Week 5 복습 + 시나리오 10문항

📅 날짜: Week 5 (Day 5)
🎯 주제: 글로벌 아키텍처 종합
⏱️ 학습 시간: 약 90분

---

## 📖 Week 5 핵심 7개

1. DR 4전략: B&R / Pilot / Warm / Active-Active (비용↔RTO)
2. Aurora Global = RPO<5s, DynamoDB Global = LWW 최종 일관성
3. Route 53 7정책: Weighted/LBR/Geolocation/Geoproximity/Failover/Multi-Value/Simple
4. apex 도메인 + AWS 리소스 = Alias 필수
5. CloudFront = L7 캐싱·OAC(권장)·Origin Failover·Shield
6. CFF=경량 1ms, Lambda@Edge=풍부 런타임
7. AGA = L4 + 정적 Anycast IP, UDP/게임/방화벽 화이트리스트

---

## 🔄 비교표

| A | B | 차이 |
|---|---|------|
| **Aurora Global** vs **DynamoDB Global** | RDB·1 Primary·5초 vs NoSQL·Multi-Master·LWW | 일관성 모델 |
| **LBR** vs **Geolocation** | 사용자 측 지연 vs 국가/대륙 | 데이터 주권 = Geo |
| **OAI** vs **OAC** | 레거시 vs 표준 | SSE-KMS·SigV4 |
| **CFF** vs **Lambda@Edge** | 경량 1ms vs 풍부 5s | 비용·복잡도 |
| **CloudFront** vs **AGA** | L7 캐싱 vs L4 정적 IP | UDP=AGA |
| **R53 ARC** vs **Failover** | 수동 안전 제어 vs DNS Health | 거버넌스 |

---

## 📝 시나리오 10문항

---

**문제 1.** RPO < 5초 글로벌 DB. Best?

A) RDS Cross-Region Read Replica
B) Aurora Global Database
C) DynamoDB Global Tables
D) DMS

**정답: B**
해설: Aurora Global = RPO<5s.

---

**문제 2.** UDP 게임 글로벌 + 정적 IP. Best?

A) CloudFront
B) Global Accelerator
C) Route 53 LBR
D) ALB

**정답: B**
해설: UDP + 정적 IP = AGA.

---

**문제 3.** EU 사용자에게 EU 리전, KR 사용자에게 서울. Best?

A) LBR
B) Geolocation
C) Failover
D) Weighted

**정답: B**
해설: 국가 기준 = Geolocation.

---

**문제 4.** 비용 최저 DR. Best?

A) Active-Active
B) Warm Standby
C) Pilot Light
D) Backup & Restore

**정답: D**
해설: B&R = 가장 저렴.

---

**문제 5.** CloudFront에서 S3 Private 버킷 접근, 최신 권장?

A) OAI
B) OAC
C) Bucket Public
D) Signed URL만

**정답: B**
해설: OAC가 현재 표준.

---

**문제 6.** apex 도메인 ALB 매핑. Best?

A) CNAME
B) Alias A
C) MX
D) NS

**정답: B**
해설: apex = Alias만.

---

**문제 7.** Primary Origin 장애 시 Secondary로 자동. Best?

A) Route 53 Failover
B) CloudFront Origin Group
C) Both 정답 가능
D) WAF

**정답: C**
해설: 둘 다 정답 패턴. CF Origin Group은 캐싱 흐름 내. R53 Failover는 도메인 전체.

---

**문제 8.** 5% 카나리. Best?

A) Weighted
B) LBR
C) Failover
D) Multi-Value

**정답: A**
해설: 비율 기반 = Weighted.

---

**문제 9.** 한 번에 안전한 리전 페일오버. Best?

A) Lambda 자동
B) R53 ARC Routing Control
C) CW Alarm
D) Manual DNS

**정답: B**
해설: R53 ARC가 안전한 페일오버 제어.

---

**문제 10.** 미디어 스트리밍 다수 파일 보호. Best?

A) Signed URL 파일마다
B) Signed Cookies
C) Bucket Public
D) IAM Role

**정답: B**
해설: 다수 파일 = Signed Cookies.

---

## 📌 다음 주 예고

**Week 6: 마이그레이션**
- 7R 전략 (Retire ~ Refactor)
- AWS MGN
- DMS + SCT
- App2Container, MAP, Migration Hub

---

## 📌 오늘의 요약

1. DR 4전략과 RTO/RPO·비용 매핑 외우기
2. Aurora Global / DynamoDB Global / Route 53 정책 정확히 구분
3. CloudFront(L7 캐싱) vs AGA(L4 정적 IP)
4. OAC·Origin Failover·Origin Shield 표준
5. R53 ARC가 운영자 안전 제어
