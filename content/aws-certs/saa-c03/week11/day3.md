# Day 53 - Route 53 라우팅 정책, Failover

📅 날짜: Week 11 (Day 3)
🎯 주제: 글로벌 DNS와 트래픽 라우팅
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Route 53의 7가지 라우팅 정책을 안다
- Health Check와 Failover 동작을 안다
- Alias 레코드 / Private Hosted Zone / DNSSEC를 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **DNS**: 이름 → IP. TTL이 있다.
- **A vs CNAME vs Alias**: A는 IP, CNAME은 다른 도메인, Alias는 AWS 전용(루트 도메인에 가능).
- **Health Check**: HTTP/TCP/Calculated. DNS 응답에 영향.

---

## 📖 이론 내용

### 1. 라우팅 정책 7종

| 정책 | 동작 |
|------|------|
| **Simple** | 단일 응답 |
| **Weighted** | 가중치 비율 분배 |
| **Latency** | 가장 빠른 리전으로 |
| **Failover** | Primary 죽으면 Secondary |
| **Geolocation** | 사용자 위치 (대륙/국가) |
| **Geoproximity** (Traffic Flow) | 거리 + bias 조절 |
| **Multi-value Answer** | 여러 IP + Health Check |

### 2. Health Check

- HTTP/HTTPS/TCP.
- **Calculated** (다른 헬스체크 조합).
- CloudWatch Alarm 기반.
- DNS 응답 자동 제외.

### 3. Alias 레코드

- AWS 리소스(ALB / CloudFront / S3 / API GW / VPC EP) 가리킬 때.
- **루트 도메인 (example.com)도 가능**.
- 무료. TTL은 AWS가 관리.

### 4. Private Hosted Zone

- VPC 내부에서만 도는 이름.
- VPC 여러 개 연결 가능.
- 온프레미스 DNS와 통합은 **Route 53 Resolver Endpoint**.

### 5. DNSSEC

- DNS 응답 서명 검증. 변조 방지.
- 도메인 등록자(Registrar) + Hosted Zone 모두 활성 필요.

### 6. Route 53 ARC (Application Recovery Controller)

- 멀티 리전 페일오버를 **명시적 컨트롤 패널**로 관리.
- "이 리전 트래픽 100%·0%" 같은 강력한 페일오버.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Traffic Flow** | 시각적 정책 설계 | 복합 정책 |
| **CNAME은 루트 도메인 불가** | Alias 사용 | 함정 |
| **Geo vs Latency** | 위치 vs 속도 | 정확한 시나리오 |
| **Multi-value vs ELB** | 간단 DNS 라운드로빈+헬스 | 작은 시스템 |
| **Route 53 Resolver** | 하이브리드 DNS | 온프레↔AWS |

> ⚠️ **함정**: "루트 도메인을 ALB에 연결" → CNAME 불가, **Alias** 사용.

> 💡 **암기 팁**: 빠르기 = Latency / 위치 = Geo / 가중치 = Weighted / DR = Failover.

### 관련 서비스 Cross-Reference

- ALB / CloudFront / Global Accelerator → Week 3/4
- Multi-Region DR → Day 1·2
- Direct Connect 하이브리드 DNS → 보조

---

## 🏗️ 아키텍처 다이어그램

```
[ Latency + Failover ]

  Route 53
    ├─ Latency Routing
    │     ├─ Region A (Primary, Health Check)
    │     └─ Region B (Secondary)
    └─ Failover Policy 백업

  Alias example.com → CloudFront → ALB → ECS
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ 7가지 라우팅 정책 키워드 매핑.
2. ⭐ Alias가 루트 도메인을 AWS 리소스에 연결.
3. ⭐ Health Check로 비정상 응답 자동 제외.
4. ⭐ Private Hosted Zone + Resolver Endpoint = 하이브리드 DNS.
5. ⭐ DNSSEC로 변조 방지.

---

## 💻 실제 예시 - AWS CLI

```bash
# Alias 레코드
aws route53 change-resource-record-sets --hosted-zone-id ZXYZ \
  --change-batch '{"Changes":[{
    "Action":"UPSERT",
    "ResourceRecordSet":{
      "Name":"example.com.","Type":"A",
      "AliasTarget":{
        "HostedZoneId":"Z2FDTNDATAQYW2",
        "DNSName":"d123.cloudfront.net.",
        "EvaluateTargetHealth":false
      }
    }
  }]}'

# Health Check
aws route53 create-health-check --caller-reference 1 \
  --health-check-config 'Type=HTTPS,FullyQualifiedDomainName=api.example.com,Port=443,ResourcePath=/health'
```

---

## 📝 연습 문제

**문제 1.** 사용자에게 가장 빠른 리전:

A) Geo B) Latency C) Weighted D) Failover

**정답: B**.

---

**문제 2.** 루트 도메인(example.com)을 ALB로:

A) CNAME B) Alias C) A → ALB IP D) NS

**정답: B**.

---

**문제 3.** 카나리 배포 10% 새 버전:

A) Weighted B) Failover C) Simple D) Geo

**정답: A**.

---

**문제 4.** 사용자 국가별 다른 콘텐츠:

A) Geolocation B) Latency C) Weighted D) Multi-value

**정답: A**.

---

**문제 5.** 강력한 명시적 리전 페일오버 제어:

A) Route 53 Failover Policy 단독 B) Route 53 ARC C) ALB Health D) NLB

**정답: B**.

---

## 📌 오늘의 요약

1. 7가지 라우팅 정책 매핑.
2. Alias로 루트 도메인 + AWS 리소스.
3. Health Check + Failover로 자동 페일오버.
4. ARC로 강력한 명시 제어.
5. Private Hosted Zone + Resolver로 하이브리드 DNS.
