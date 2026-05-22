# Day 5 - Week 11 복습 + 시나리오 문제 10개

## 📖 Week 11 핵심 요약

1. Trace > Segment > Subsegment, Active Tracing 자동 ID 부여
2. Sampling Rule(Reservoir + FixedRate + Priority)로 비용/가시성 균형
3. ADOT = OpenTelemetry AWS 배포 — 멀티 백엔드 export
4. AMP(PromQL) + AMG(Grafana) + OpenSearch가 K8s 관찰성 핵심
5. Annotation 인덱싱 vs Metadata 인덱싱 안 됨

## 🧠 시나리오 10개

**1.** 결제 100% trace + 헬스 0% + 일반 5% → Sampling Rule + Priority 분리  **정답: A**

**2.** "EKS Pod 메트릭 + 통합 대시보드" → ADOT + AMP + AMG  **정답: A**

**3.** "특정 OrderId trace 찾기" → Annotation 기반 검색  **정답: A**

**4.** EC2/ECS X-Ray 전송 → X-Ray Daemon UDP  **정답: A**

**5.** "벤더 중립 + 멀티 백엔드" → ADOT  **정답: A**

**6.** "EKS Pod 자동 instrumentation" → Java javaagent / ADOT Layer  **정답: A**

**7.** "Service Map 슬라이스 by team" → X-Ray Group  **정답: A**

**8.** AMP 보존 30일 — 장기 → S3 export 또는 외부  **정답: A**

**9.** OpenSearch Logs 실시간 → Subscription → Firehose → OpenSearch  **정답: A**

**10.** Lambda OTel 표준화 → aws-otel-* Layer + AWS_LAMBDA_EXEC_WRAPPER  **정답: A**

## 🔜 Week 12 예고

**인시던트 대응 자동화 - EventBridge, SSM Automation, Chatbot, Incident Manager**

> 💪 Week 11 완료!
