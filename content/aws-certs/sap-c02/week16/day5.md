# Day 80 - 최종 모의고사 25문항 + D-Day 전략

📅 Week 16 (Day 5)
🎯 주제: 종합 모의고사·시험 당일
⏱️ 약 120분

---

## 🎯 D-Day 전략

### 시험 전 1주

- 80일 노트 핵심 키워드만 빠르게 (각 day 마지막 "요약" 부분)
- 약점 도메인 1개 골라 시나리오 30문항
- AWS 공식 샘플 문제 다시 풀기
- 영어 시험이면 +30분 연장 신청 (모국어 아닌 경우)

### 시험 전 1일

- 새 개념 학습 ✗ — 복습만
- 6시간 이상 수면
- 신분증 2개 (PSI·Pearson VUE 모두)

### 시험 당일 전략

1. **75문항 / 180분 = 평균 144초/문항**
2. **첫 통과**: 즉답 가능한 것만 답 + Mark for Review
3. **두 번째 통과**: Mark된 문항 차분히
4. **마지막 통과**: 답 변경 신중 (직감 우선)
5. **모든 질문에서 키워드 분해**: "운영 부담 최소", "비용 효율", "RTO/RPO", "Compliance"

### 함정 회피

- "가장 간단한 해법" → Managed·Serverless
- "가장 비용 효율" → SP·Spot·Lifecycle·서버리스
- "장애 격리" → AZ→Region→Account
- "운영 자동화" → SSM·EventBridge
- "거의 모두 정답처럼 보임" → 키워드 우선순위

---

## 📝 최종 모의고사 25문항

**1.** 멀티 계정 신규 계정 자동 베이스라인 + 가드레일.
A) Org만 B) Control Tower + Account Factory C) StackSets만 D) Config Conformance Pack
**정답: B**

**2.** 자회사 비인가 리전 차단.
A) IAM B) SCP `aws:RequestedRegion` Deny C) Config D) NACL
**정답: B**

**3.** 100여 VPC + 다중 DX.
A) Peering Mesh B) TGW + DX Gateway C) PrivateLink D) VPN Mesh
**정답: B**

**4.** Oracle → Aurora PostgreSQL 마이그.
A) MGN B) DMS + SCT C) Snowball D) DRS
**정답: B**

**5.** 다운타임 짧은 200대 서버 이전.
A) DataSync B) MGN C) DRS D) Snowmobile
**정답: B**

**6.** 글로벌 RDB·RPO < 1s.
A) Read Replica B) Aurora Global C) RDS Multi-AZ D) DMS
**정답: B**

**7.** 다중 리전 양쪽 쓰기 NoSQL.
A) DDB Streams 직접 B) DDB Global Tables C) DocumentDB D) Aurora Global
**정답: B**

**8.** 운영 트래픽 0일 때 비용 0 RDB.
A) RDS B) Aurora Serverless v2 C) Redshift D) DDB
**정답: B**

**9.** Private Lambda → S3 NAT 비용 0.
A) Interface Endpoint B) S3 Gateway Endpoint C) NAT GW D) IGW
**정답: B**

**10.** 7년 변경 불가 백업.
A) Vault Governance B) Vault Compliance Lock C) Glacier D) Versioning
**정답: B**

**11.** EC2 Right-size 권고.
A) TA B) Compute Optimizer C) Cost Explorer D) Config
**정답: B**

**12.** PCI DSS 통합 점검 + 대시보드.
A) Audit Manager만 B) Security Hub C) Detective D) Trusted Advisor
**정답: B**

**13.** Org WAF·SG 정책 자동 일괄.
A) Config B) Firewall Manager C) SCP D) Control Tower
**정답: B**

**14.** 의도적 장애 + 알람 자동 중단.
A) Lambda 수동 B) FIS + Stop Condition C) Resilience Hub D) Backup
**정답: B**

**15.** 100여 마이크로서비스 분산 추적.
A) CloudWatch만 B) X-Ray + ServiceLens C) Config D) CloudTrail
**정답: B**

**16.** SaaS 이벤트 → AWS.
A) SQS B) EventBridge Partner Source C) SNS D) Lambda Webhook
**정답: B**

**17.** Lambda·Fargate·EC2 통합 할인.
A) EC2 Instance SP B) Compute SP C) Standard RI D) Spot
**정답: B**

**18.** 글로벌 VOD 트랜스코딩.
A) MediaLive B) MediaConvert C) MediaTailor D) MediaConnect
**정답: B**

**19.** 라이브 인코딩.
A) MediaConvert B) MediaLive C) MediaPackage D) MediaConnect
**정답: B**

**20.** 모든 VPC 트래픽 IDS/IPS.
A) WAF B) Network Firewall + Inspection VPC C) SG D) GuardDuty
**정답: B**

**21.** 멀티 계정 보안 결과 한곳.
A) TA B) Security Hub Org C) Detective D) GuardDuty 단독
**정답: B**

**22.** SaaS RAG 챗봇·운영 부담 최소.
A) SageMaker LLM 호스팅 B) Bedrock + Knowledge Base C) 자체 벡터 DB D) Kendra만
**정답: B**

**23.** 사람 의사결정 Failover.
A) Health Check 자동 B) Route 53 ARC Routing Control C) Global Accelerator D) Lambda
**정답: B**

**24.** 워크로드 RTO 격차 자동 식별.
A) WA Tool B) Resilience Hub C) Trusted Advisor D) Config
**정답: B**

**25.** 카오스 분기 자동.
A) Backup B) FIS + EventBridge Schedule C) DRS D) Game Day 수동
**정답: B**

---

## 📌 80일 한 줄 정리

> **"SAP-C02는 '최적해' 시험. 항상 키워드(운영 부담·비용·RTO·격리·자동화)를 먼저 분리하고, 그 키워드에 직결된 Managed/Serverless 서비스를 먼저 떠올린다. 같은 정답처럼 보이면 더 운영 부담 낮은 쪽이 정답."**

---

## 🏆 80일 학습 완료!

- Week 1-4: SAA 복습·멀티 계정·네트워크·하이브리드
- Week 5-9: 글로벌·마이그·컨테이너·서버리스·데이터
- Week 10-12: ML/AI·보안·비용
- Week 13-14: WA·DR
- Week 15-16: 케이스·도메인·모의고사

**합격 화이팅! 💪**

> 시험 후: 다음 자격증 (Specialty - Security·Networking·DB·ML 등) 또는 실무 깊이 우선 결정.
