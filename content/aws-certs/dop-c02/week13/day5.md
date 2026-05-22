# Day 5 - Week 13 복습 + 시나리오 문제 10개

## 📖 Week 13 핵심 요약

1. Multi-AZ: RDS 동기/Standby read 불가, Aurora 6-way 스토리지 + 30초 페일오버
2. Multi-Region: Route 53 정책 7종, Aurora Global / DDB Global Tables, KMS Multi-Region Key
3. DR 4 전략: Backup&Restore / Pilot Light / Warm Standby / Active-Active
4. AWS Backup 통합 + Vault Lock
5. Resilience Hub + FIS = 측정 + 검증

## 🧠 시나리오 10개

**1.** RTO 5분 + RPO 초~분 + 비용 중간 → Warm Standby  **정답: A**

**2.** RTO 0 + 비용 무제한 → Multi-Site Active-Active (Aurora Global + DDB GT)  **정답: A**

**3.** Region 페일오버 자동 + Health Check → Route 53 Failover Routing  **정답: A**

**4.** Cross-Region 암호화 데이터 복호화 → KMS Multi-Region Key  **정답: A**

**5.** DR drill 정기 검증 + 안전망 → FIS + Stop Condition + Route 53 ARC  **정답: A**

**6.** "백업이 변조 불가" 컴플라이언스 → AWS Backup Vault Lock (Immutable)  **정답: A**

**7.** 글로벌 사용자 latency 최저 + region 페일오버 → Route 53 Latency + Health Check + Aurora Global  **정답: A**

**8.** Pilot Light DR 시 자동화 → Lambda: Promote Read Replica + ASG desired 증가 + Route 53 페일오버  **정답: A**

**9.** Aurora 페일오버 RTO → <30초 (단일 region)  **정답: A**

**10.** "EC2 30%에 5분 CPU 부하 + 알람 발동 시 중단" → FIS Template + Stop Condition  **정답: A**

## 🔜 Week 14 예고

**보안 자동화 - GuardDuty, Security Hub, Config, Audit Manager**

> 💪 Week 13 완료!
