# Day 3 - ADOT (AWS Distro for OpenTelemetry)

📅 날짜: Week 11 (Day 3)
🎯 주제: OpenTelemetry 기반 통합 텔레메트리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- OpenTelemetry 표준의 의의
- ADOT Collector / SDK / Lambda Layer
- ADOT vs X-Ray SDK 비교
- Multi-backend export (CloudWatch + Prometheus + Jaeger)

---

## 🧩 사전 지식 (CS 기초)

- **OpenTelemetry (OTel)**: CNCF 표준 텔레메트리. logs/metrics/traces 통합.
- **Vendor Lock-in**: 특정 벤더에 묶이는 위험. OTel은 이를 줄임.
- **Collector**: 수집 → 처리 → export 파이프라인.
- **Auto-instrumentation**: 코드 변경 없이 OTel 자동 적용 (Java/Python agent).

---

## 📖 이론 내용

### 1. OpenTelemetry 구성

- **SDK**: 애플리케이션 instrumentation API
- **Auto-instrumentation Agent**: 코드 변경 없이 부착 (Java/Python/.NET/JS/Go)
- **Collector**: 수집 → batch → export
- **Exporters**: CloudWatch, X-Ray, Prometheus, Jaeger, OTLP, OpenSearch

### 2. AWS Distro for OpenTelemetry (ADOT)

AWS가 OTel을 fork + 지원하는 배포판:
- Lambda Layer (Python/Node/Java/...)
- ECS Sidecar / EKS DaemonSet (Collector)
- EC2 systemd 서비스
- AWS 서비스 통합 보장 (CloudWatch, X-Ray, AMP)

### 3. ADOT Collector 구성

```yaml
# collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
      http:
  prometheus:
    config:
      scrape_configs:
        - job_name: app
          static_configs:
            - targets: ['localhost:8080']

processors:
  batch:
  resource:
    attributes:
      - key: service.environment
        value: prod
        action: insert

exporters:
  awsxray:
    region: ap-northeast-2
  awsemf:
    namespace: MyApp/OTel
    region: ap-northeast-2
  awsprometheusremotewrite:
    endpoint: https://aps-workspaces.../api/v1/remote_write
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [awsxray, otlp/jaeger]
    metrics:
      receivers: [otlp, prometheus]
      processors: [batch]
      exporters: [awsemf, awsprometheusremotewrite]
```

### 4. Lambda ADOT Layer

```yaml
# SAM
Globals:
  Function:
    Tracing: Active
    Layers:
      - !Sub 'arn:aws:lambda:${AWS::Region}:901920570463:layer:aws-otel-python-amd64-ver-1-25-0:1'
    Environment:
      Variables:
        AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-instrument
```

자동:
- HTTP/SDK 호출에 OTel span 생성
- X-Ray export 또는 다른 백엔드
- 추가 코드 거의 없음

### 5. ADOT vs X-Ray SDK

| 항목 | X-Ray SDK | ADOT |
|------|-----------|------|
| 표준 | AWS 전용 | OpenTelemetry (벤더 중립) |
| Backend | X-Ray | X-Ray + Prometheus + Jaeger + ... |
| Lambda Layer | (Powertools) | aws-otel-* |
| 멀티 클라우드 | 어려움 | 가능 |
| 시험 출제 | 높음 | 증가 추세 |

### 6. AMP (Amazon Managed Prometheus) 통합

```yaml
exporters:
  prometheusremotewrite:
    endpoint: ${WORKSPACE_URL}/api/v1/remote_write
    auth:
      authenticator: sigv4auth
```

EKS Cluster + ADOT + AMP + AMG(Grafana) = Kubernetes 관찰성 표준 스택.

---

## 🧠 알아두면 좋은 심화 이론

### Auto-instrumentation Java

```bash
java -javaagent:aws-opentelemetry-agent.jar \
  -Dotel.exporter=otlp \
  -Dotel.exporter.otlp.endpoint=http://localhost:4317 \
  -jar myapp.jar
```

코드 한 줄 변경 없이 HTTP/JDBC/AWS SDK span 자동.

### EKS Add-on

```bash
aws eks create-addon --cluster-name prod --addon-name adot
```

ADOT Operator 자동 설치 + CRD `OpenTelemetryCollector`로 선언적 운영.

### Trace ID 호환

X-Ray Trace ID는 128bit + 타임스탬프. OTel은 random 128bit. ADOT가 양쪽 호환 모드 제공.

### 비용

- Collector는 Self-hosted (Lambda Layer는 무료)
- X-Ray ingestion 비용 그대로
- AMP는 별도 과금 (sample-based)

### 관련 서비스 Cross-Reference

- **X-Ray** → Week 11 Day 1, 2
- **Prometheus / Grafana** → Week 11 Day 4
- **Container Insights** → Week 10 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
ADOT Collector Pipeline
==================================================

  App (instrumented via OTel SDK or auto-agent)
        │ OTLP (gRPC/HTTP)
        ▼
  ADOT Collector (sidecar/daemon)
   ├─ Receivers: OTLP, Prometheus, ...
   ├─ Processors: batch, resource, filter
   └─ Exporters:
        ├─ AWS X-Ray (traces)
        ├─ AWS EMF / CloudWatch (metrics)
        ├─ AMP (metrics)
        ├─ Jaeger/Zipkin (traces, multi-cloud)
        └─ OpenSearch (logs/traces)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ ADOT = AWS의 OpenTelemetry 배포판 + 지원
2. ⭐ Lambda Layer로 코드 변경 없이 자동 instrumentation
3. ⭐ Collector는 receivers/processors/exporters 파이프라인
4. ⭐ 멀티 백엔드 export로 벤더 중립성
5. ⭐ EKS + ADOT + AMP + AMG가 K8s 관찰성 표준

---

## 💻 실제 예시

```bash
# Lambda
sam deploy --parameter-overrides AdotLayer=arn:aws:lambda:...:aws-otel-python-amd64-ver-1-25-0:1

# EKS Add-on
aws eks create-addon --cluster-name prod --addon-name adot

# CRD로 Collector 정의
kubectl apply -f - <<EOF
apiVersion: opentelemetry.io/v1alpha1
kind: OpenTelemetryCollector
metadata:
  name: otel
spec:
  mode: deployment
  config: |
    receivers: {otlp: {protocols: {grpc: {}, http: {}}}}
    exporters: {awsxray: {region: ap-northeast-2}}
    service:
      pipelines:
        traces: {receivers: [otlp], exporters: [awsxray]}
EOF
```

---

## 📝 연습 문제

**1.** ADOT의 본질은?  A) AWS 전용 trace 도구 B) OpenTelemetry의 AWS 지원 배포판 C) Logs Insights D) Lambda Layer만  **정답: B**

**2.** Lambda에 ADOT 적용 가장 단순한 방법?  A) aws-otel-* Lambda Layer + `AWS_LAMBDA_EXEC_WRAPPER` 환경 변수 B) 코드 전체 재작성 C) X-Ray Daemon D) ECS sidecar  **정답: A**

**3.** ADOT Collector 파이프라인?  A) Receivers → Processors → Exporters B) Lambda → S3 C) Source → Build → Deploy D) Single layer  **정답: A**

**4.** EKS + Prometheus + Grafana 통합?  A) ADOT + AMP + AMG B) X-Ray만 C) CloudTrail D) Synthetics  **정답: A**

**5.** ADOT가 X-Ray SDK 대비 강점은?  A) 벤더 중립 (멀티 백엔드) B) 비용 절감 C) IAM 단순화 D) Region 자동  **정답: A**

**6.** Java 자동 instrumentation 방법?  A) `-javaagent:aws-opentelemetry-agent.jar` B) Lambda Layer만 C) EC2 reboot D) CodeBuild  **정답: A**

**7.** ADOT EKS Add-on의 효과?  A) Operator + CRD 자동 설치로 선언적 Collector 관리 B) Region 자동 C) IAM 회전 D) Pipeline 자동  **정답: A**

---

## 📌 오늘의 요약

1. ADOT = OpenTelemetry의 AWS 배포 + 지원
2. Lambda Layer로 자동 instrumentation
3. Collector = receivers/processors/exporters
4. 멀티 백엔드 export로 벤더 중립
5. EKS + ADOT + AMP + AMG가 K8s 관찰성 표준
