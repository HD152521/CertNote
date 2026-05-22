# Day 5 - Week 14 복습 + 시나리오 문제 10개

## 📖 Week 14 핵심 요약

1. GuardDuty 8 데이터 소스 + Severity 4단계 + 자동 격리 (EventBridge → SSM)
2. Security Hub = ASFF 통합 + Standards + Custom Action / Automation Rule
3. Config Rule 3종 + Conformance Pack + Aggregator + Auto-Remediation
4. Audit Manager 감사 증거 자동 수집
5. Macie / Inspector / Access Analyzer / Firewall Manager / CloudTrail Lake

## 🧠 시나리오 10개

**1.** "GuardDuty Critical 발견 → EC2 격리 + 포렌식 스냅샷 + 알림"  → A) EventBridge → SSM Automation Runbook (snapshot + SG 변경 + SNS)  **정답: A**

**2.** "S3 Public 차단 정책 위반 자동 수정"  → A) Config Rule + Remediation Configuration (SSM Automation) + Automatic=true  **정답: A**

**3.** "PCI DSS 컴플라이언스 묶음 배포"  → A) Conformance Pack PCI-DSS  **정답: A**

**4.** "SOC2 감사 시즌마다 증거 수집 자동화"  → A) Audit Manager Framework + Assessment Report  **정답: A**

**5.** "S3 데이터 lake에서 PII 자동 검색"  → A) Macie Discovery Job  **정답: A**

**6.** "ECR 푸시 시 npm/pip 의존성 CVE 자동 스캔"  → A) Inspector v2 + ECR Enhanced Scanning  **정답: A**

**7.** "외부 계정에 노출된 S3 버킷 자동 발견"  → A) IAM Access Analyzer  **정답: A**

**8.** "멀티 계정 WAF 규칙 중앙 관리"  → A) Firewall Manager  **정답: A**

**9.** "7년 전 보안 사고 조사 SQL"  → A) CloudTrail Lake  **정답: A**

**10.** "Security Hub Critical Finding 자동 라벨링/억제"  → A) Automation Rule (2023+, Lambda 없이)  **정답: A**

## 🔜 Week 15 예고

**종합 시나리오 - 엔터프라이즈 케이스**

> 💪 Week 14 완료!
