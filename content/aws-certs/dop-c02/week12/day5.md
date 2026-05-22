# Day 5 - Week 12 복습 + 시나리오 문제 10개

## 📖 Week 12 핵심 요약

1. EventBridge가 자동화의 중심 — Bus / Pipes / Scheduler / Archive
2. SSM Automation Runbook으로 절차 코드화 + aws:approve 사람 게이트
3. Lambda 자동 복구는 Cooldown + Idempotent + Bounded action
4. Chatbot으로 ChatOps, Guardrail Policy로 위험 명령 차단
5. Incident Manager = Response Plan + Escalation + Timeline + PIR

## 🧠 시나리오 10개

**1.** "GuardDuty Critical → EC2 자동 격리 + Slack 알림 + 사람 승인 후 종료" → A) EventBridge → SSM Automation (aws:executeAwsApi + aws:invokeLambdaFunction + aws:approve)  **정답: A**

**2.** "SQS → Filter → 데이터 보강 → DDB" → A) EventBridge Pipes  **정답: A**

**3.** "자동 복구 폭주 방지" → A) Cooldown(DynamoDB) + Idempotent + Bounded  **정답: A**

**4.** "Slack에서 운영자가 명령 실행" → A) Chatbot + IAM Role + Guardrail Policy  **정답: A**

**5.** "On-call 30분 무응답 시 다음 그룹" → A) Incident Manager Escalation  **정답: A**

**6.** EC2 하드웨어 장애 자동 복구 → A) StatusCheckFailed_System Alarm + ec2:recover action  **정답: A**

**7.** 백만 단위 cron 스케줄 → A) EventBridge Scheduler  **정답: A**

**8.** 자동화 정기 검증 → A) FIS Game Day  **정답: A**

**9.** Pipeline 실패 Slack 알림 표준 → A) CodeStar Notifications + Chatbot  **정답: A**

**10.** "ASG의 자동 인스턴스 교체" → A) Health Check Type=ELB + Grace Period  **정답: A**

## 🔜 Week 13 예고

**복원력 - DR, Multi-Region**

> 💪 Week 12 완료!
