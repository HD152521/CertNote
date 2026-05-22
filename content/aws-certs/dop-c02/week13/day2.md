# Day 2 - Multi-Region - Route 53 페일오버, Global DB

📅 날짜: Week 13 (Day 2)
🎯 주제: 리전 장애에 대한 복원 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Route 53 라우팅 정책 7종
- Aurora Global / DynamoDB Global Tables
- S3 Cross-Region Replication
- KMS Multi-Region Key

---

## 🧩 사전 지식 (CS 기초)

- **Health Check**: 정기 헬스 체크. DNS 응답에 반영.
- **Active-Active vs Active-Passive**: 동시 사용 vs 대기.
- **Last Write Wins (LWW)**: 분산 충돌 해결의 기본.
- **TTL**: DNS 캐시 시간. 짧을수록 빠른 페일오버.

---

## 📖 이론 내용

### 1. Route 53 라우팅 정책

| 정책 | 용도 |
|------|------|
| **Simple** | 단일 레코드 |
| **Weighted** | 비율 분배 (Canary, A/B) |
| **Latency** | 사용자에 가장 빠른 리전 |
| **Failover** | Primary/Secondary + Health Check |
| **Geolocation** | 사용자 국가/대륙 |
| **Geoproximity** | Geo 기반 + bias (Traffic Flow 필요) |
| **Multi-Value Answer** | 여러 IP 반환 + 헬스 체크 |
| **IP-based (2023+)** | 사용자 IP 매핑 |

### 2. Health Check 종류

- Endpoint (HTTP/HTTPS/TCP)
- Calculated (다른 Health Check의 AND/OR)
- CloudWatch Alarm 기반

### 3. Aurora Global Database 페일오버

- 평상시: Primary write, Secondary read
- Primary region 장애: Secondary를 standalone로 promote (1분 내)
- 페일오버 후 다시 글로벌 구성으로 복귀하려면 새 Secondary 추가 필요

### 4. DynamoDB Global Tables

- 진정한 multi-master (모든 region이 write)
- LWW 충돌 해결
- 자동 양방향 replication
- 비용: 모든 region의 RCU/WCU + cross-region 데이터 전송

### 5. S3 Cross-Region Replication (CRR)

- 버전 관리 활성 필수
- 단방향 (Two-Way는 Bi-Directional Replication 또는 별도 구성)
- IAM Role: Source 버킷 read + Destination 버킷 write
- Replication metric 가능 (지연 시간)

### 6. KMS Multi-Region Key

- 동일 키 ID + 다른 region 복제
- Multi-Region Encryption: 한 region에서 암호화한 데이터를 다른 region에서 복호화
- Aurora Global / DDB Global Tables 등 cross-region 워크로드 필수

```bash
aws kms create-key --multi-region true --policy file://policy.json
aws kms replicate-key --key-id mrk-abc --replica-region us-east-1
```

### 7. Global Accelerator vs CloudFront

| 항목 | Global Accelerator | CloudFront |
|------|---------------------|------------|
| 프로토콜 | TCP/UDP | HTTP/HTTPS |
| 정적 IP | 2개 anycast | 동적 IP |
| 캐싱 | X | 강력 |
| 사용 사례 | 게임, IoT, 비-HTTP | 웹/콘텐츠 |
| Multi-region 페일오버 | 자동 (Health Check 기반) | Origin Failover |

---

## 🧠 알아두면 좋은 심화 이론

### Route 53 ARC (Application Recovery Controller)

- Routing Control + Readiness Check
- 수동 또는 자동 페일오버 트리거
- DR drill을 안전하게 (코드로 페일오버 검증)

### EventBridge Multi-Region

EventBridge가 cross-region 라우팅 지원. DR 알람을 다른 region으로.

### DynamoDB Streams + Lambda Cross-Region

자체 cross-region 복제 패턴 (Global Tables 대신 또는 추가).

### 데이터 일관성 vs 가용성 (CAP)

- DynamoDB Global Tables: AP (eventual)
- Aurora Global: AP (async, <1초)
- 진짜 동기 multi-region은 latency 때문에 일반적 X

### 관련 서비스 Cross-Reference

- **DR 전략 4종** → Week 13 Day 3
- **Resilience Hub** → Week 13 Day 4
- **CloudFront** → Week 6 Day 1 (이미지)

---

## 🏗️ 아키텍처 다이어그램

```
Multi-Region Active-Active
==================================================

  Users (Global)
       │
       ▼
  Route 53 Latency Routing
       │
       ├─► Region A (ap-northeast-2)
       │    ALB → ECS / Lambda
       │    Aurora Global writer/reader
       │    ElastiCache, S3 (CRR)
       │
       └─► Region B (us-east-1)
            ALB → ECS / Lambda
            Aurora Global secondary
            ElastiCache, S3 (CRR back)

  Cross-Region:
   ├─ Aurora Global: <1s replication
   ├─ DynamoDB Global Tables: multi-master
   ├─ S3 CRR (bi-directional)
   ├─ KMS Multi-Region Key
   └─ Route 53 Health Check + ARC for failover
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Route 53 정책 7종 + Health Check 통합
2. ⭐ DynamoDB Global Tables = multi-master LWW
3. ⭐ Aurora Global = async <1s + 1분 페일오버
4. ⭐ KMS Multi-Region Key가 cross-region 암호화 필수
5. ⭐ Route 53 ARC로 안전한 DR drill

---

## 💻 실제 예시

```bash
# Route 53 Failover
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch '{
  "Changes":[{
    "Action":"CREATE",
    "ResourceRecordSet":{
      "Name":"api.example.com","Type":"A","SetIdentifier":"Primary",
      "Failover":"PRIMARY",
      "AliasTarget":{"HostedZoneId":"Z35","DNSName":"alb-kr.ap-northeast-2.elb.amazonaws.com","EvaluateTargetHealth":true},
      "HealthCheckId":"hc-kr"
    }
  },{
    "Action":"CREATE",
    "ResourceRecordSet":{
      "Name":"api.example.com","Type":"A","SetIdentifier":"Secondary",
      "Failover":"SECONDARY",
      "AliasTarget":{"HostedZoneId":"Z35","DNSName":"alb-use1.us-east-1.elb.amazonaws.com","EvaluateTargetHealth":true}
    }
  }]
}'

# DynamoDB Global Tables
aws dynamodb create-table --table-name orders ...
aws dynamodb update-table --table-name orders \
  --replica-updates Create='{RegionName=us-east-1}'

# KMS Multi-Region Key
aws kms create-key --multi-region
aws kms replicate-key --key-id mrk-abc --replica-region us-east-1
```

---

## 📝 연습 문제

**1.** "Region 페일오버 자동 + Health Check 기반" Route 53 정책?  A) Failover  **정답: A**

**2.** "전 세계 사용자 가장 빠른 region"?  A) Latency Routing  **정답: A**

**3.** DynamoDB cross-region multi-master?  A) Global Tables (LWW)  **정답: A**

**4.** Aurora Global 페일오버 RTO?  A) <1분 (promote secondary)  **정답: A**

**5.** Cross-Region 암호화 데이터?  A) KMS Multi-Region Key 필수  **정답: A**

**6.** DR drill 안전 검증?  A) Route 53 ARC + Routing Control + Readiness Check  **정답: A**

**7.** Global Accelerator의 강점?  A) TCP/UDP + 2개 anycast IP + 빠른 페일오버 (vs CloudFront HTTP만)  **정답: A**

---

## 📌 오늘의 요약

1. Route 53 정책 7종 + Health Check
2. DynamoDB Global Tables multi-master LWW
3. Aurora Global async + 1분 페일오버
4. KMS Multi-Region Key cross-region 필수
5. Route 53 ARC로 안전 DR drill
