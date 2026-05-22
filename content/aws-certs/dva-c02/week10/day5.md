# Day 50 - Week 10 복습 + 연습문제 (모니터링)

📅 날짜: 2026년 7월 23일 (목요일)  
🎯 주제: 모니터링 및 로깅 종합 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch, X-Ray, CloudTrail, EventBridge의 핵심을 종합 정리한다
- 실전 시험 유형의 모니터링 문제를 풀어 실력을 점검한다

---

## 📖 Week 10 핵심 정리

### 모니터링 서비스 역할 요약
```
CloudWatch: 지표, 로그, 알람, 대시보드
X-Ray: 분산 추적, 마이크로서비스 디버깅
CloudTrail: AWS API 감사 로그, 보안 감사
EventBridge: 이벤트 기반 아키텍처, 이벤트 라우팅
```

### 핵심 암기
```
EC2 메모리/디스크: CloudWatch Agent 필요
X-Ray Annotation: 필터링 가능, Metadata: 불가
CloudTrail: 기본 90일 보존
CloudTrail Data Events: 기본 비활성화
X-Ray 기본 샘플링: 처음 1개 + 초당 5%
Container Insights: ECS/EKS 컨테이너 지표
```

---

## 아키텍처 다이어그램

```
완전한 모니터링 아키텍처
================================

[애플리케이션]
     |
     +-- API 호출 → [CloudTrail] (감사)
     |
     +-- HTTP 요청 → [X-Ray] (분산 추적)
     |
     +-- 지표 → [CloudWatch Metrics]
     |              |
     |              +-- 임계값 초과 → [알람] → [SNS]
     |
     +-- 로그 → [CloudWatch Logs]
                    |
                    +-- 패턴 감지 → [Metric Filter] → [알람]
                    |
                    +-- Logs Insights (분석)

이벤트 감지:
[CloudTrail] → [EventBridge] → [Lambda] → [보안 대응]
```

---

## 🧠 Week 10 시험 함정 & 약어

### 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| Basic Monitoring | Detailed Monitoring | 5분 vs 1분 |
| 기본 해상도 | 고해상도 지표 | 1분 vs 1초·유료 |
| Management Events | Data Events | 기본·90일 vs 옵션·과금 |
| CloudTrail Console 조회 | Trail (S3) | 90일 vs 무제한 |
| CloudWatch Events | EventBridge | 동일 (리브랜딩) |
| EventBridge Default Bus | Custom Bus | AWS 이벤트 vs 사용자 정의 |
| EventBridge Rule | EventBridge Pipes | 라우팅 vs 변환·필터링 통합 |
| Cron | Rate | 특정 시각 vs 주기 |
| EventBridge Scheduler | Rule (schedule) | 백만 스케줄 vs 단일 규칙 |
| X-Ray Annotation | Metadata | 인덱싱·필터 vs 미인덱싱 |
| Active Tracing (Lambda) | X-Ray Daemon (EC2) | 토글만 vs 별도 설치 |
| ServiceLens | X-Ray | 통합 뷰 vs 추적만 |
| Container Insights | Prometheus | CloudWatch vs 표준 |
| Anomaly Detection | Static Threshold | ML 자동 vs 사람 설정 |
| Synthetics | Health Check (R53) | 스크립트 vs 단순 ping |
| EMF | PutMetricData | 로그로 자동 추출 vs API |
| Metric Stream | Logs Subscription | 지표 → 외부 vs 로그 → 외부 |

### Week 10 시험 함정 15가지

1. **EC2 기본 모니터링 = 5분**, Detailed Monitoring = 1분
2. **EC2 메모리·디스크는 기본 지표 X** → CloudWatch Agent 필요
3. **CloudWatch Logs 기본 보존 무기한** → 비용 절감하려면 수동 설정
4. **CloudTrail Management Events 기본 90일** (콘솔 조회)
5. **CloudTrail Data Events 기본 비활성** + 과금
6. **CloudTrail Insights 비활성·추가 비용**
7. **EventBridge Default Bus는 AWS 서비스 이벤트만**
8. **CloudWatch Events = EventBridge** (리브랜딩)
9. **X-Ray Annotation 50개 한도**
10. **X-Ray 샘플링: 처음 1개 + 초당 5%**
11. **Lambda는 X-Ray Active Tracing 토글**, EC2/ECS는 데몬 필요
12. **ALB는 X-Ray 미지원**
13. **CloudWatch Logs 단일 PutLogEvents 1MB**
14. **EMF로 PutMetricData 없이 지표 생성** (Lambda 비용 절감)
15. **Synthetics는 Lambda 기반** (Node.js / Python)

### Week 10 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **CW** | CloudWatch |
| **CWL** | CloudWatch Logs |
| **CWA** | CloudWatch Agent |
| **CT** | CloudTrail |
| **EB** | EventBridge (구 CloudWatch Events) |
| **EMF** | Embedded Metric Format |
| **ADOT** | AWS Distro for OpenTelemetry |
| **AMP** | Amazon Managed Service for Prometheus |
| **AMG** | Amazon Managed Grafana |
| **SLO / SLI / SLA** | Service Level Objective/Indicator/Agreement |
| **PII** | Personally Identifiable Information |
| **JMESPath** | (쿼리 언어 - CLI/X-Ray) |
| **APM** | Application Performance Monitoring |
| **RUM** | Real User Monitoring (CloudWatch RUM) |

---

## 📝 Week 10 종합 연습문제

**문제 1.** Lambda 함수에서 타임아웃이 자주 발생하는 원인을 파악하려면?

A) CloudTrail  
B) X-Ray 분산 추적  
C) CloudWatch 기본 지표  
D) VPC Flow Logs  

**정답: B** - X-Ray의 서비스 맵과 트레이스를 통해 어떤 단계(DB 조회, 외부 API 등)에서 지연이 발생하는지 파악할 수 있습니다.

---

**문제 2.** EC2 디스크 사용량을 CloudWatch로 모니터링하려면?

A) EC2 기본 지표 사용  
B) CloudWatch Agent 설치 후 사용자 정의 지표 수집  
C) CloudTrail 활성화  
D) EBS 메트릭 사용  

**정답: B** - EC2 디스크 사용량은 기본 지표에 포함되지 않아 CloudWatch Agent를 설치해야 합니다.

---

**문제 3.** S3 버킷에서 특정 파일이 언제, 누가 다운로드했는지 확인하려면?

A) S3 이벤트 알림  
B) CloudTrail Data Events 활성화  
C) CloudWatch Logs  
D) X-Ray  

**정답: B** - S3 Data Events(GetObject 등)를 CloudTrail에서 활성화해야 파일 다운로드 기록을 조회할 수 있습니다.

---

**문제 4.** 마이크로서비스에서 특정 요청의 전체 처리 경로를 추적하려면?

A) CloudWatch 로그 분석  
B) X-Ray 분산 추적  
C) CloudTrail 이벤트  
D) VPC Flow Logs  

**정답: B** - X-Ray는 Trace ID를 통해 마이크로서비스 전체의 요청 처리 경로를 시각화하여 추적합니다.

---

**문제 5.** 비용 절감을 위해 CloudWatch 로그를 90일 후 자동으로 만료하려면?

A) S3 수명 주기로 설정  
B) 로그 그룹에 보존 기간 설정  
C) CloudWatch 콘솔에서 자동 설정  
D) 불가능  

**정답: B** - 로그 그룹의 보존 기간(Retention Policy)을 설정하면 지정된 일수 이후 로그가 자동으로 삭제됩니다.

---

**문제 6.** EventBridge와 CloudWatch Events의 관계는?

A) 완전히 다른 서비스  
B) CloudWatch Events가 EventBridge로 업그레이드/통합됨  
C) 동일한 서비스  
D) EventBridge가 더 기본적인 서비스  

**정답: B** - Amazon EventBridge는 CloudWatch Events의 업그레이드 버전으로, 더 많은 이벤트 소스와 대상을 지원합니다.

---

**문제 7.** CloudWatch 알람이 INSUFFICIENT_DATA 상태인 이유는?

A) 알람 임계값 초과  
B) 알람이 정상 상태  
C) 지표 데이터가 수집되지 않아 평가 불가  
D) 알람이 비활성화  

**정답: C** - 지표 데이터가 없거나 수집이 시작되지 않으면 INSUFFICIENT_DATA 상태가 됩니다.

---

**문제 8.** X-Ray에서 커스텀 데이터를 추가할 때 검색/필터링을 위해 사용하는 것은?

A) Metadata  
B) Annotation  
C) Tag  
D) Comment  

**정답: B** - Annotation은 인덱싱되어 X-Ray 콘솔에서 필터링 및 검색에 사용할 수 있습니다.

---

## 📌 오늘의 요약

1. CloudWatch: 지표 수집/알람, EC2 메모리/디스크는 Agent 필요
2. X-Ray: 분산 추적, Annotation(필터가능)/Metadata, 샘플링 설정
3. CloudTrail: API 감사 로그, 기본 90일, Data Events 기본 비활성화
4. EventBridge: 이벤트 라우팅, CloudWatch Events 업그레이드 버전
5. 통합: CloudTrail → EventBridge → Lambda → 자동 보안 대응
