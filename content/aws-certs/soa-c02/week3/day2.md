# Day 2 - CloudWatch Dashboards & Cross-Account/Region 관측

📅 날짜: Week 3 (Day 2)
🎯 주제: 대시보드로 가시화하기 + 멀티 계정/멀티 리전 통합 모니터링
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch Dashboard의 위젯·자동 새로고침·공유 방식을 안다
- Cross-Account / Cross-Region Observability 구성을 이해한다
- 대시보드를 IaC로 관리하고 자동 생성하는 패턴을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Observability의 3 pillars**: Metrics / Logs / Traces. CloudWatch는 셋 다 다룸
- **Dashboard fatigue**: 너무 많은 위젯/대시보드로 정작 중요한 정보를 못 봄
- **Golden Signals (SRE)**: Latency, Traffic, Errors, Saturation. 대시보드 설계 기준
- **RED method**: Rate, Errors, Duration. 마이크로서비스용
- **USE method**: Utilization, Saturation, Errors. 리소스용

---

## 📖 이론 내용

### 1. CloudWatch Dashboard 기본

#### 위젯 종류

| 위젯 | 용도 |
|------|------|
| **Line / Stacked area** | 메트릭 시계열 |
| **Number** | 단일 값 강조 (예: 현재 RPS) |
| **Gauge** | 게이지형 (사용률) |
| **Bar / Pie** | 카테고리 비교 |
| **Logs Insights Query** | Logs 쿼리 결과 |
| **Alarm Status** | 알람 OK/ALARM 격자 |
| **Text** | Markdown 설명·링크 |
| **Custom (PNG/iframe)** | 외부 위젯 |

#### 자동 새로고침
- 10초, 1분, 5분, 15분 간격
- TV 디스플레이 모드 (자동 풀스크린)

#### 공유 옵션
- AWS IAM 사용자에게 공유 (계정 내)
- **Public Sharing**: URL로 외부 공유 (보안 주의, 자격 증명 없이 접근)
- SSO 사용자 공유

### 2. Dashboard Body (JSON 구조)

대시보드는 JSON으로 표현 → IaC로 관리 가능:

```json
{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "metrics": [
          ["AWS/EC2", "CPUUtilization", "InstanceId", "i-abc"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "ap-northeast-2",
        "title": "EC2 CPU"
      }
    }
  ]
}
```

- 그리드: 24열, 행은 무한
- 위젯 좌표: x, y / 크기: width, height

### 3. Cross-Account / Cross-Region Observability

#### 왜 필요한가
- 멀티 계정 환경에서 각 계정의 메트릭/로그를 한 곳에서 보기
- DR/멀티 리전 환경의 통합 가시성

#### 구성 방식

**Observability Account 설정 (Monitoring Account)**
1. 한 계정을 "모니터링 허브"로 지정
2. 다른 계정들이 이 허브로 데이터를 공유

**Source Account 설정**
- Sink ARN 지정 (어느 모니터링 계정에 공유할지)
- 공유할 데이터 종류: Metrics, Logs, X-Ray Traces 선택

#### IAM 역할
- 모니터링 계정에 자동 Role 생성됨 (`CloudWatch-CrossAccountSharingRole`)
- Source 계정의 데이터를 조회할 권한

#### 대시보드에서의 활용
```json
{
  "metrics": [
    ["AWS/EC2", "CPUUtilization", "InstanceId", "i-abc",
     { "accountId": "111122223333", "region": "us-east-1" }]
  ]
}
```

→ 한 대시보드에서 멀티 계정·멀티 리전 메트릭 모두 표시.

### 4. 대시보드 운영 모범 사례

#### Golden Signals 기반 대시보드 (서비스별)
1. **Latency**: p50/p95/p99 응답시간
2. **Traffic**: RPS, 동시 사용자
3. **Errors**: 4xx/5xx 비율, Lambda 에러율
4. **Saturation**: CPU/메모리 사용률, 큐 깊이

#### 계층 구조
- **Executive Dashboard**: 비즈니스 KPI (매출, 활성 사용자)
- **Service Dashboard**: 서비스별 골든 시그널
- **Operational Dashboard**: 디테일 - 특정 인스턴스/Lambda

#### 안티 패턴
- ❌ 한 대시보드에 50개 위젯 (정보 과부하)
- ❌ 같은 메트릭을 여러 곳에 중복 표시
- ❌ 단위 없는 숫자 (백분율? 절대값?)
- ❌ 시간 범위 통일 없이 위젯별 다름

### 5. CloudWatch Dashboard Variables (동적 대시보드)

#### 사용 사례
- 한 대시보드로 여러 인스턴스/환경 전환
- URL 파라미터로 변수 전달

#### 변수 타입
- **Property**: 위젯 속성 일부 (예: InstanceId)
- **Pattern**: 메트릭 검색 패턴
- **Values**: 사전 정의된 옵션 목록

```json
{
  "variables": [
    {
      "type": "property",
      "property": "InstanceId",
      "inputType": "select",
      "values": [{"label":"web-1","value":"i-abc"}, {"label":"web-2","value":"i-xyz"}]
    }
  ]
}
```

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Automatic Dashboards** | 서비스 사용 시 자동 생성되는 기본 대시보드 | EC2/Lambda/RDS |
| **Container Insights Dashboard** | ECS/EKS 통합 대시보드 | 클러스터 가시화 |
| **Service Lens** | X-Ray + Logs + Metrics 통합 뷰 | 마이크로서비스 트레이싱 |
| **Logs Live Tail** | 실시간 로그 스트림 (별도 위젯 가능) | 디버깅 |
| **Per-dashboard 비용** | 3개까지 무료, 이후 월 $3 | 대시보드 갯수 관리 |

> ⚠️ **함정 1**: 같은 리전·같은 계정 메트릭만 대시보드에 자동 표시. Cross-Account/Region은 Observability Account 설정 필요.
>
> ⚠️ **함정 2**: 대시보드 Public Sharing은 인증 없이 URL로 접근 가능 → 민감 정보 노출 위험.
>
> 💡 **암기 팁**: 대시보드는 "관리" 도구가 아니라 "관측" 도구. 액션은 알람과 자동화에 위임.

### 관련 서비스 Cross-Reference

- **Dashboard → Week 3 Day 4** (ServiceLens 통합 뷰)
- **Dashboard → Week 5 SSM Explorer** (운영 통합 뷰)
- **Dashboard → Week 6 CFn** (IaC로 대시보드 자동 생성)
- **Dashboard → Week 11 Cost Explorer** (비용도 대시보드 가능)

---

## 🏗️ 아키텍처 다이어그램

```
Cross-Account / Cross-Region Observability
==========================================================

  [Source Account A]      [Source Account B]      [Source Account C]
   - Sink ARN 지정         - Sink ARN 지정         - Sink ARN 지정
   - Share: Metrics, Logs  - Share: Metrics       - Share: Logs, X-Ray
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                ▼
                  ┌──────────────────────────────┐
                  │  Monitoring Account          │
                  │  - 통합 대시보드             │
                  │  - 통합 알람                 │
                  │  - Cross-Region 메트릭 조회  │
                  └──────────────────────────────┘

Account ID 명시:
  ["AWS/EC2", "CPUUtilization", "InstanceId", "i-abc",
   { "accountId": "111122223333", "region": "us-east-1" }]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **대시보드 3개까지 무료, 이후 월 $3** — 운영 효율 위해 관리
2. ⭐ **Cross-Account/Region은 Observability Account 설정 필요** — Source 계정이 Sink ARN으로 공유
3. ⭐ **대시보드는 JSON 본문** → CloudFormation/Terraform으로 관리 가능
4. ⭐ **Public Sharing 주의** — 인증 없이 URL 접근, 민감 정보 노출
5. ⭐ **Golden Signals/RED/USE** — 대시보드 설계 표준 패턴

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. 대시보드 생성 (JSON)
cat > dashboard.json <<'EOF'
{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "metrics": [
          ["AWS/EC2", "CPUUtilization", "InstanceId", "i-0123456789abcdef0"]
        ],
        "period": 60,
        "stat": "Average",
        "region": "ap-northeast-2",
        "title": "Web Server CPU",
        "yAxis": { "left": { "min": 0, "max": 100 } }
      }
    },
    {
      "type": "log",
      "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "query": "SOURCE '/aws/lambda/order-service' | fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20",
        "region": "ap-northeast-2",
        "title": "Recent Errors"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 6, "width": 24, "height": 6,
      "properties": {
        "metrics": [
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", "app/my-alb/abc"],
          [".", "RequestCount", ".", "."]
        ],
        "period": 60,
        "stat": "Sum",
        "view": "timeSeries",
        "stacked": false,
        "title": "ALB Traffic"
      }
    }
  ]
}
EOF

aws cloudwatch put-dashboard \
  --dashboard-name "WebService-Prod" \
  --dashboard-body file://dashboard.json

# 2. Cross-Account Observability - Monitoring Account에서 Sink 생성
aws oam create-sink \
  --name "central-observability-sink" \
  --tags "Purpose=CrossAccountMonitoring"
# Sink ARN을 메모

# 3. Sink에 Policy 설정 (어떤 계정이 share할 수 있는지)
aws oam put-sink-policy \
  --sink-identifier "arn:aws:oam:ap-northeast-2:111122223333:sink/abcd1234" \
  --policy '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"AWS":["arn:aws:iam::222233334444:root","arn:aws:iam::333344445555:root"]},
      "Action":["oam:CreateLink","oam:UpdateLink"],
      "Resource":"*"
    }]
  }'

# 4. Source Account에서 Link 생성 (이 계정 데이터를 공유)
aws oam create-link \
  --label-template '$AccountName' \
  --resource-types AWS::CloudWatch::Metric AWS::Logs::LogGroup AWS::XRay::Trace \
  --sink-identifier "arn:aws:oam:ap-northeast-2:111122223333:sink/abcd1234"

# 5. 모든 알람의 현재 상태 한눈에
aws cloudwatch describe-alarms \
  --state-value ALARM \
  --query 'MetricAlarms[*].[AlarmName,StateValue,StateUpdatedTimestamp]' \
  --output table
```

---

## 📝 연습 문제

**문제 1.** 회사가 3개 AWS 계정(Dev/Stage/Prod)을 운영하는데 운영팀이 한 대시보드에서 모든 EC2 CPU를 보고 싶다. 어떻게 구성하나?

A) 각 계정에서 별도 대시보드 생성
B) Monitoring Account를 정해 Sink 생성, Source 계정들이 Link로 공유 → 한 대시보드에서 multi-account 메트릭 표시
C) CloudTrail로 대체
D) 불가능

**정답: B**
해설: Cross-Account Observability 표준 패턴. CloudWatch Cross-Account Sink + Link 메커니즘. 위젯에 `accountId` 지정.

---

**문제 2.** Public Sharing으로 대시보드 URL을 외부에 공유했다. 가능한 위험은?

A) AWS 비용 청구 폭증
B) 인증 없이 메트릭/로그 데이터 노출 — 인스턴스 ID, 트래픽 패턴 등이 외부에 노출될 수 있음
C) IAM 권한 우회
D) Public Sharing은 불가

**정답: B**
해설: Public Sharing은 인증 없이 URL만으로 접근. 메트릭 자체가 민감 정보일 수 있음 (시스템 구성, 트래픽 패턴 노출). 가능하면 IAM 사용자에게 공유 또는 SSO 사용.

---

**문제 3.** 100개 EC2 인스턴스 각각의 CPU를 한 대시보드에 표시하려면?

A) 100개 위젯 수동 생성
B) Search Expression 사용: `SEARCH('{AWS/EC2,InstanceId} MetricName="CPUUtilization"', 'Average', 60)` 또는 Dashboard Variables
C) Logs Insights
D) 불가능

**정답: B**
해설: Search Expression은 와일드카드로 동적 메트릭 표시. 새 인스턴스 추가 시 자동 반영. 또는 Dashboard Variables로 인스턴스 선택형 대시보드.

---

**문제 4.** 대시보드 위젯의 시간 범위를 모두 같이 묶고 싶다. 어떻게?

A) 각 위젯에 동일 period 설정
B) 대시보드 자체의 Time Range Selector — 모든 위젯에 일괄 적용
C) URL 파라미터
D) 불가능

**정답: B**
해설: 대시보드 상단의 시간 선택기가 모든 위젯에 적용. 위젯별 다른 시간 범위는 안티 패턴 — 비교가 어려움.

---

**문제 5.** 대시보드를 CI/CD로 자동 배포하려 한다. 가장 적합한 방법은?

A) CloudFormation `AWS::CloudWatch::Dashboard` 리소스로 JSON 정의
B) 콘솔에서 수동 백업
C) DynamoDB에 저장
D) S3에 백업

**정답: A**
해설: 대시보드 본문은 JSON. CloudFormation/Terraform으로 IaC 관리하면 변경 이력·일관성·롤백 모두 확보. 운영 자동화 표준.

---

## 📌 오늘의 요약

1. Dashboard 위젯: Line/Number/Gauge/Logs Query/Alarm Status/Text 등 다양한 타입
2. 자동 새로고침 10초~15분, TV 모드 지원. 3개까지 무료, 이후 $3/월
3. Cross-Account/Region Observability: Monitoring Account에 Sink + Source 계정들에 Link
4. 대시보드 JSON 본문 → CloudFormation으로 IaC 관리 표준
5. Golden Signals (Latency/Traffic/Errors/Saturation) 또는 RED/USE 방식으로 설계
