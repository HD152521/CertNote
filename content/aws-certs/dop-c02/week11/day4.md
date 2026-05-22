# Day 4 - OpenSearch / Prometheus / Grafana 통합

📅 날짜: Week 11 (Day 4)
🎯 주제: 로그·메트릭 백엔드 — AWS 관리형 옵션
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Amazon OpenSearch Service vs OpenSearch Serverless
- AMP (Amazon Managed Service for Prometheus) 운영
- AMG (Amazon Managed Grafana) 통합
- 도구 조합 의사결정

---

## 🧩 사전 지식 (CS 기초)

- **Inverted Index**: 단어 → 문서 위치. 텍스트 검색의 핵심 (Elasticsearch).
- **TSDB (Time-Series DB)**: 시계열 특화. Prometheus, InfluxDB.
- **PromQL**: Prometheus 쿼리 언어.
- **Data Source**: Grafana가 연결하는 백엔드 (CloudWatch/Prometheus/AMP/OpenSearch).

---

## 📖 이론 내용

### 1. Amazon OpenSearch Service

ElasticSearch fork (2021+):
- Provisioned 클러스터 (UltraWarm/Cold storage 계층)
- KMS 암호화, VPC, FGAC(Fine-Grained Access Control)
- Kibana → OpenSearch Dashboards

**OpenSearch Serverless (2022+):**
- 인스턴스 관리 없음
- OCU(OpenSearch Compute Unit) 시간당 과금
- Collection 단위 (Indexing + Search 분리)
- 작은 검색/로그 워크로드 적합

### 2. AMP (Amazon Managed Service for Prometheus)

- Workspace 생성 → URL 받음
- ADOT/Prometheus Agent가 `remote_write`
- 30일 메트릭 보존
- AMG에서 Data Source로 연결

```bash
aws amp create-workspace --alias prod
# 결과: workspace ID + URL
```

### 3. AMG (Amazon Managed Grafana)

- 인증: IAM Identity Center, SAML
- Data Source: CloudWatch, AMP, OpenSearch, X-Ray, Athena, Redshift, RDS, Timestream, Site Wise, ...
- Plugin 자동 관리
- IAM permission 자동 매핑

### 4. 도구 조합 결정

| 워크로드 | 권장 조합 |
|----------|-----------|
| AWS 네이티브 단순 | CloudWatch + (X-Ray) |
| K8s 풍부 메트릭 | ADOT + AMP + AMG |
| 로그 분석 (BI) | OpenSearch + Kibana / AMG |
| 멀티 클라우드 | ADOT + Prometheus + Grafana OSS |
| 비용 최저 + 단순 | CloudWatch만 |

### 5. OpenSearch 로그 수집 경로

```
App logs → CloudWatch Logs
   │
   │ Subscription Filter → Lambda
   │   또는
   │ Firehose
   ▼
OpenSearch 인덱스
```

OpenSearch Ingest API 직접 호출도 가능 (Fluent Bit, Fluentd).

### 6. AMP + Grafana 사용 사례

EKS Cluster 모니터링:
- Pod 메트릭 → Prometheus scrape → ADOT Collector → AMP (remote_write)
- AMG가 AMP 쿼리 → 대시보드
- IAM Identity Center로 운영자 SSO

```promql
sum(rate(http_requests_total{job="api"}[5m])) by (status)
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

### 7. OpenSearch FGAC

```json
{
  "users": {"alice": {"hash":"..."}},
  "roles_mapping": {
    "read_only": {"users": ["alice"], "backend_roles": ["analyst"]}
  }
}
```

JSON-based RBAC. SAML/Cognito 통합 가능.

---

## 🧠 알아두면 좋은 심화 이론

### OpenSearch Index Pattern

`logs-app-*-2026.05.22` 같은 일별 인덱스 + Index State Management(ISM)로 자동 회전·삭제·UltraWarm 이전.

### Cross-cluster Replication

OpenSearch 클러스터 간 복제로 DR.

### AMP는 보존 30일

장기 보관 필요 시 S3 export 또는 외부 시스템 push.

### Grafana Alerts

Grafana 자체 알람도 가능. AWS에 의존 안 하는 멀티 클라우드 알람 단일화.

### 관련 서비스 Cross-Reference

- **CloudWatch Logs Subscription** → Week 10 Day 2
- **ADOT** → Week 11 Day 3
- **X-Ray** → Week 11 Day 1
- **EKS Observability** → Week 6 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
EKS Observability Stack
==================================================

  EKS Pods (instrumented)
   ├─ /metrics endpoint
   └─ OTLP traces
        │
        ▼
   ADOT Collector (DaemonSet)
   ├─ Prometheus scrape
   └─ OTLP receiver
        │
        ▼
   Exporters
   ├─ AMP (remote_write)
   ├─ X-Ray (traces)
   ├─ CloudWatch (EMF metrics)
   └─ OpenSearch (logs via Firehose)

   Visualization
   ├─ AMG Grafana
   │   ├─ Data source: AMP (PromQL)
   │   ├─ Data source: CloudWatch
   │   ├─ Data source: OpenSearch
   │   └─ Data source: X-Ray
   └─ CloudWatch console (alarms, logs)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ OpenSearch Provisioned vs Serverless
2. ⭐ AMP는 PromQL + remote_write + 30일 보존
3. ⭐ AMG가 멀티 데이터 소스 통합 대시보드 표준
4. ⭐ ADOT + AMP + AMG가 K8s 관찰성 표준
5. ⭐ OpenSearch는 로그 분석 + 전문 검색, AMP는 시계열 메트릭

---

## 💻 실제 예시

```bash
# AMP
aws amp create-workspace --alias prod
WORKSPACE_URL=https://aps-workspaces.../api/v1/remote_write

# ADOT Collector에 prometheusremotewrite exporter 설정
# (Day 3 예시 참조)

# AMG
aws grafana create-workspace --account-access-type CURRENT_ACCOUNT \
  --authentication-providers AWS_SSO \
  --permission-type SERVICE_MANAGED \
  --workspace-data-sources PROMETHEUS CLOUDWATCH XRAY OPENSEARCH

# OpenSearch via Firehose
aws firehose create-delivery-stream --delivery-stream-name LogsToOS \
  --delivery-stream-type DirectPut \
  --amazon-open-search-service-destination-configuration ...
```

---

## 📝 연습 문제

**1.** EKS Pod 메트릭의 표준 백엔드?  A) AMP (Prometheus 호환) + AMG B) DynamoDB C) S3 직접 D) Trusted Advisor  **정답: A**

**2.** OpenSearch Serverless vs Provisioned?  A) Provisioned는 인스턴스 관리, Serverless는 OCU 시간 과금 + 관리 없음 B) 동일 C) Serverless가 더 비싸다 D) Serverless는 VPC 불가  **정답: A**

**3.** AMG의 데이터 소스가 아닌 것은?  A) AMP B) CloudWatch C) OpenSearch D) DynamoDB Table  **정답: D**

**4.** AMP 메트릭 보존 기간?  A) 7일 B) 30일 C) 1년 D) 무제한  **정답: B**

**5.** "CloudWatch Logs → OpenSearch 실시간 적재"?  A) Subscription Filter → Firehose → OpenSearch B) Lambda 매번 폴링 C) S3 동기화 D) CloudTrail  **정답: A**

**6.** AMG 인증 표준?  A) IAM Identity Center / SAML B) IAM User C) API Key D) Cognito User Pool 전용  **정답: A**

**7.** "EKS + ADOT + AMP + AMG"의 의미는?  A) 표준 K8s 관찰성 스택 B) Pipeline 정의 C) DR 패턴 D) IAM 단순화  **정답: A**

---

## 📌 오늘의 요약

1. OpenSearch Provisioned/Serverless로 로그·검색
2. AMP = PromQL + remote_write + 30일
3. AMG가 멀티 데이터 소스 통합 대시보드
4. ADOT + AMP + AMG가 K8s 관찰성 표준
5. CloudWatch Logs → Firehose → OpenSearch가 표준 로그 적재
