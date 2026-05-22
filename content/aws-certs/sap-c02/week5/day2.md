# Day 22 - Route 53 라우팅 정책 7종

📅 날짜: Week 5 (Day 2)
🎯 주제: Route 53의 라우팅 정책과 Health Check
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Route 53 라우팅 정책 7종을 시나리오로 구분한다
- Health Check 4종을 안다
- Alias vs CNAME 차이를 안다
- Route 53 Resolver, DNS Firewall, Private Hosted Zone 응용을 안다

---

## 🧩 사전 지식 (CS 기초)

- **DNS Recursive vs Authoritative**: 사용자 측 vs 도메인 측.
- **A·AAAA·CNAME·ALIAS·NS·MX**: 레코드 종류.
- **TTL (Time To Live)**: 캐싱 시간. 페일오버 속도와 트레이드오프.

---

## 📖 이론 내용

### 1. 라우팅 정책 7종

| 정책 | 기준 | 사용처 |
|------|------|--------|
| **Simple** | 단일 응답 | 기본 |
| **Weighted** | 비율 분배 | A/B 테스트, 카나리 |
| **Latency-Based (LBR)** | 사용자 측 가까운 리전 | 글로벌 성능 |
| **Failover** | 헬스 체크 기반 Primary/Secondary | DR Active-Passive |
| **Geolocation** | 사용자 국가/대륙 | 데이터 주권·언어 |
| **Geoproximity** | 지리 거리 + bias 조정 | 미세 조정 (Traffic Flow) |
| **Multi-Value** | 최대 8개 IP 랜덤 + Health Check | 간단 분산 |

### 2. 시나리오별 정답

| 시나리오 | 정책 |
|----------|------|
| 새 버전 5%만 배포 (카나리) | Weighted |
| 가장 가까운 리전으로 자동 | Latency-Based |
| EU 사용자는 EU 리전, US는 US 리전 | Geolocation |
| 한국 사용자 90%는 서울, 10%는 도쿄 | Geoproximity (bias) |
| DR Active-Passive | Failover |
| IP 여러 개 랜덤 + 헬스 체크 | Multi-Value |

### 3. Alias vs CNAME

| | Alias (AWS 고유) | CNAME |
|---|------------------|-------|
| Root 도메인 | ✅ 가능 | ❌ 불가 |
| AWS 리소스 | ALB·CloudFront·S3 Website·API GW·Global Accelerator | 임의 도메인 |
| 비용 | 무료 | 무료 |

> ⚠️ **함정**: `example.com` (apex)에 ALB는 **Alias만**. CNAME 불가.

### 4. Health Check 종류

| 종류 | 설명 |
|------|------|
| **Endpoint** | HTTP/HTTPS/TCP 직접 체크 |
| **Calculated** | 다수 헬스 체크 조합 (AND/OR) |
| **CloudWatch Alarm** | CW 알람 기반 |
| **Recovery Control** (ARC) | 수동 제어 |

기능:
- Interval: 10초/30초
- Failure Threshold
- String Match (응답 내용 검증)
- Latency Graph

### 5. Route 53 Resolver

- **VPC 내부 DNS 해석기**
- **Inbound Endpoint**: 온프레미스 → AWS VPC 사설 도메인 해결
- **Outbound Endpoint**: AWS → 온프레미스 도메인 해결
- **Resolver Rule**: 특정 도메인을 특정 DNS로 포워딩

### 6. Private Hosted Zone

- VPC 내부 전용 도메인 (예: `internal.example.com`)
- VPC 연결로 다중 VPC 공유 가능
- 외부에서 해석 불가

### 7. Route 53 DNS Firewall

- 악성 도메인 차단 (피싱·C2 서버)
- DNS Query 단계 필터
- 매니지드 도메인 리스트 또는 사용자 정의

---

## 🧠 알아두면 좋은 심화 이론

### Traffic Flow

- 정책을 시각적으로 조합한 정책 트리
- 복잡한 라우팅 (LBR → Geoproximity → Failover) 구성

### Cross-Reference

- **Day 21**: Multi-Region DR
- **Day 23**: CloudFront Origin Failover
- **Day 24**: Global Accelerator

---

## 🏗️ 아키텍처 다이어그램 — 글로벌 페일오버

```
사용자
   │  DNS Query: app.example.com
   ▼
Route 53
   ├── LBR Policy
   │     ├── ap-northeast-2 (Health OK) ──► ALB
   │     ├── us-east-1 (Health OK) ──► ALB
   │     └── eu-west-1 (Health FAIL) ── 제외
   │
   └── Failover (백업): Static S3 Website
```

---

## ⭐ 핵심 포인트

1. ⭐ **카나리=Weighted, 가까운 리전=LBR, 국가별=Geolocation**
2. ⭐ **DR Active-Passive=Failover**, IP 여러개 분산=**Multi-Value**
3. ⭐ apex 도메인 + AWS 리소스 = **Alias만**
4. ⭐ Health Check Calculated로 다중 조건 조합
5. ⭐ 온프레 ↔ AWS DNS는 **Resolver Inbound/Outbound Endpoint**

---

## 💻 실제 예시 - Failover 레코드

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id ZXXX \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "app.example.com",
        "Type": "A",
        "SetIdentifier": "Primary",
        "Failover": "PRIMARY",
        "AliasTarget": {"HostedZoneId":"Z...","DNSName":"alb-primary","EvaluateTargetHealth":true},
        "HealthCheckId":"abc-123"
      }
    }]
  }'
```

---

## 📝 연습 문제

**문제 1.** 카나리 배포 5% 트래픽. Best?

A) Weighted
B) LBR
C) Failover
D) Multi-Value

**정답: A**
해설: 비율 기반 = Weighted.

---

**문제 2.** 사용자에게 가장 가까운 AWS 리전 자동 라우팅. Best?

A) Geolocation
B) Latency-Based Routing
C) Geoproximity
D) Multi-Value

**정답: B**
해설: 사용자 측 측정 = LBR.

---

**문제 3.** EU 사용자는 EU 리전, 한국 사용자는 서울. Best?

A) LBR
B) Geolocation
C) Failover
D) Weighted

**정답: B**
해설: 국가/대륙 기준 = Geolocation.

---

**문제 4.** `example.com` 루트에 ALB 매핑. Best?

A) CNAME → ALB
B) Alias A → ALB
C) Static IP
D) MX

**정답: B**
해설: apex는 Alias만.

---

**문제 5.** 온프레미스에서 AWS Private Hosted Zone 해석. Best?

A) Resolver Inbound Endpoint
B) Resolver Outbound Endpoint
C) Public Hosted Zone
D) DNS Firewall

**정답: A**
해설: 온프레→AWS 해석은 Inbound Endpoint.

---

**문제 6.** 다수 헬스 체크 조합(AND)으로 복합 가용성 판정. Best?

A) Endpoint Check
B) Calculated Health Check
C) CW Alarm
D) ARC

**정답: B**
해설: Calculated가 조합.

---

## 📌 오늘의 요약

1. 7종 정책 시나리오: Weighted/LBR/Failover/Geolocation/Geoproximity/Multi-Value/Simple
2. apex + AWS = Alias 필수
3. Health Check 4종, Calculated로 조합
4. Resolver Endpoint로 온프레-AWS DNS 통합
5. DNS Firewall로 악성 도메인 차단
