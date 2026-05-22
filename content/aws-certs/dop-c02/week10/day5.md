# Day 5 - Week 10 복습 + 시나리오 문제 10개

📅 날짜: Week 10 (Day 5)

---

## 📖 Week 10 핵심 요약

1. CloudWatch Metric은 Namespace+Name+Dimensions+Statistic
2. EMF로 로그+메트릭 통합, API 비용 0
3. CWL Subscription Filter로 실시간 라우팅
4. Container/Lambda Insights는 워크로드별 자동 메트릭
5. Synthetics/RUM/Evidently로 UX 측정

---

## 🧠 시나리오 10개

### 1
"Lambda 호출당 메트릭을 비용 효율적으로." → A) EMF B) PutMetricData C) X-Ray D) Layer  **정답: A**

### 2
"외부 API 5xx > 1% + 지연 p99 > 500ms 동시 만족 시 알람." → A) 두 알람 + Composite Alarm B) Lambda 폴링 C) Synthetics D) X-Ray  **정답: A**

### 3
"CWL 로그를 OpenSearch에 실시간." → A) Subscription Filter → Kinesis Firehose → OpenSearch B) Lambda 매번 폴링 C) S3 export D) EventBridge  **정답: A**

### 4
"외부에서 API 5분 단위 가용성." → A) Synthetics Canary B) RUM C) Evidently D) Trusted Advisor  **정답: A**

### 5
"사용자 LCP 측정." → A) RUM + Web Vitals B) Synthetics C) Lambda Insights D) Container Insights  **정답: A**

### 6
"NGINX 5xx 로그에서 메트릭 추출 + 알람." → A) Metric Filter + Alarm B) EMF (NGINX는 직접 X) C) X-Ray D) Logs Insights  **정답: A**

### 7
"비즈니스 지표 정상 패턴이 시간대별 다름. 임계값 수동 어려움." → A) Anomaly Detection 알람 B) Static threshold C) Synthetics D) Composite  **정답: A**

### 8
"로그 비용이 폭증. 가장 직접적 통제." → A) Retention 단축 + S3 cold export + 구조화 로그로 양 감소 B) Region 변경 C) IAM 축소 D) Layer  **정답: A**

### 9
"EKS 클러스터 Pod별 자동 메트릭." → A) Container Insights (또는 ADOT) B) Lambda Insights C) Synthetics D) Custom CW Agent만  **정답: A**

### 10
"신기능 A/B 비교 + 자동 통계." → A) Evidently (또는 AppConfig + 자체 분석) B) Synthetics C) RUM만 D) Lambda Insights  **정답: A**

---

## 🔜 Week 11 예고

**관찰성 - X-Ray, ADOT, OpenSearch/Prometheus**

> 💪 Week 10 완료!
