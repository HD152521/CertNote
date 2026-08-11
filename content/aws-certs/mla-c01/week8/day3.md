# Day 3 - 운영 모니터링: CloudWatch 지표·알람, 엔드포인트 지연·오류, 로깅

## 📌 핵심 정리

- Day 1~2가 "모델이 옳은가"였다면 오늘은 **"시스템이 건강한가"** — 중심은 **CloudWatch**다.
- 관측성의 세 기둥: **메트릭(CloudWatch Metrics) · 로그(CloudWatch Logs) · 트레이스(X-Ray)**.
- 전체 지연 ≈ **ModelLatency + OverheadLatency**. 둘 중 어느 쪽이 튀었는지로 원인이 갈린다.
- **4XX는 클라이언트, 5XX는 서버** 책임. 오류율 급증 조사의 첫 분기점이다.
- 트래픽 변동 대응은 알람 알림이 아니라 **Application Auto Scaling** 정책이 정석이다.

## 요청 한 건이 지나가는 길

지연을 진단하려면 요청이 어디를 거치는지부터 그려야 한다. CloudWatch 지표는 이 경로의 각 구간에 대응한다.

```text
 [클라이언트]
      │  ①  네트워크 · 앞단(API Gateway / Lambda)   ← CloudWatch로는 안 보임 → X-Ray
      ▼
 ┌───────────────────────────────────────────┐
 │  SageMaker 엔드포인트                        │
 │  ┌─────────────┐        ┌───────────────┐ │
 │  │ 요청 수신·라우팅 │  ──▶   │ 모델 컨테이너 추론 │ │
 │  └─────────────┘        └───────────────┘ │
 │      ② OverheadLatency      ③ ModelLatency │
 │  자원 상태: CPUUtilization / MemoryUtilization / GPUUtilization
 │  호출 결과: Invocations / Invocation4XXErrors / Invocation5XXErrors
 └───────────────────────────────────────────┘
      │
      ▼  CloudWatch Metrics ──▶ Alarm ──▶ SNS · Application Auto Scaling · Lambda
         CloudWatch Logs   ──▶ Logs Insights (원인 상세)
```

- 전체 응답이 느린데 ③이 정상이면 ①이나 ②를 의심한다 — 모델이 아니라 앞단·페이로드 문제다.
- ③만 튀면 모델·인스턴스 문제다 — 인스턴스 타입·배치 크기·인스턴스 수를 본다.

## SageMaker 엔드포인트가 내보내는 핵심 지표

SageMaker는 엔드포인트 호출과 인스턴스 상태를 자동으로 CloudWatch에 보낸다. 시험에 자주 나오는 지표들이다.

| 지표 | 의미 | 어디서(네임스페이스) |
|------|------|---------------------|
| `ModelLatency` | 모델이 추론하는 데 걸린 시간(마이크로초) | AWS/SageMaker |
| `OverheadLatency` | SageMaker 오버헤드(요청 처리 부가 시간) | AWS/SageMaker |
| `Invocations` | 엔드포인트 호출 수 | AWS/SageMaker |
| `Invocation4XXErrors` / `5XXErrors` | 클라이언트/서버 오류 호출 수 | AWS/SageMaker |
| `CPUUtilization` / `MemoryUtilization` / `GPUUtilization` | 인스턴스 자원 사용률 | /aws/sagemaker/Endpoints |

전체 응답 지연은 대략 **ModelLatency + OverheadLatency**다. 지연이 갑자기 늘면 ModelLatency(모델·인스턴스 부하 문제)인지 OverheadLatency(요청 처리·페이로드 문제)인지를 나눠 봐야 원인이 잡힌다.

같은 지표라도 "튀었을 때 무엇을 의심하고 무엇부터 손대는가"가 다르다.

| 지표 | 급증했을 때의 의미 | 1차 조치 |
|------|-------------------|----------|
| `ModelLatency` | 모델 연산이 오래 걸림 — 부하·모델 크기·배치 설정 | 인스턴스 타입 상향, 인스턴스 수 증설, 모델 경량화 |
| `OverheadLatency` | 요청 처리 부가 비용 — 큰 페이로드, 직렬화, 모델 로딩 | 페이로드 축소·압축, 요청 형식 단순화 |
| `Invocation4XXErrors` | 호출 측 잘못 — 형식·인증·크기 초과 | 클라이언트 페이로드 검증, 입력 스키마 점검 |
| `Invocation5XXErrors` | 서버 측 문제 — 컨테이너 충돌·타임아웃·자원 부족 | 컨테이너 로그 확인, 인스턴스 증설, 타임아웃 상향 |
| `CPUUtilization` | 연산 포화(멀티코어라 100%를 넘는 값으로 보고될 수 있음) | 인스턴스 증설·타입 변경 |
| `MemoryUtilization` | 메모리 압박 — OOM으로 5XX와 함께 나타나기 쉬움 | 메모리 큰 타입으로 교체, 배치 크기 축소 |
| `Invocations` | 트래픽 변화 자체 | 오토스케일링 타겟 재설정, 용량 계획 |

> 💡 **관련 이론**: 4XX와 5XX 오류는 책임 소재가 다르다. **4XX(클라이언트 오류)**는 호출 측의 잘못된 입력·잘못된 형식·인증 문제로, 페이로드 검증이나 클라이언트 수정으로 해결한다. **5XX(서버 오류)**는 모델 컨테이너 충돌·타임아웃·자원 부족 등 서버 측 문제다. 5XX가 급증하면 인스턴스 증설·헬스 체크·컨테이너 디버깅이 필요하다. 시험에서 "오류율 급증의 원인을 좁히려면"이라고 물으면 4XX/5XX 구분이 첫 단계다.

## CloudWatch 알람으로 자동 대응

지표를 보기만 해서는 의미가 없다. 임계치를 넘으면 자동으로 알리거나 행동해야 한다. **CloudWatch Alarm**은 지표가 조건을 만족하면 상태를 ALARM으로 바꾸고 **SNS 알림**, **오토스케일링**, **Lambda 트리거** 등을 실행한다.

```python
import boto3
cw = boto3.client("cloudwatch")

cw.put_metric_alarm(
    AlarmName="HighModelLatency",
    Namespace="AWS/SageMaker",
    MetricName="ModelLatency",
    Dimensions=[{"Name": "EndpointName", "Value": "my-endpoint"},
                {"Name": "VariantName", "Value": "AllTraffic"}],
    Statistic="Average",
    Period=60,                       # 60초 단위 평가
    EvaluationPeriods=3,             # 3번 연속 위반 시 ALARM
    Threshold=200000,                # 200,000 마이크로초 = 200ms
    ComparisonOperator="GreaterThanThreshold",
    AlarmActions=["arn:aws:sns:us-east-1:123456789012:ops-alerts"],
    TreatMissingData="notBreaching", # 데이터 없음(트래픽 0)을 위반으로 보지 않음
)
```

핵심 파라미터는 `Period`(평가 간격), `EvaluationPeriods`(몇 번 연속 위반해야 ALARM), `Threshold`(임계치), `ComparisonOperator`다. `EvaluationPeriods`를 늘리면 일시적 스파이크에 의한 오탐을 줄인다.

| 알람 파라미터 | 무엇을 조절하나 | 잘못 잡으면 |
|---------------|----------------|-------------|
| `Period` | 지표를 몇 초 단위로 묶어 평가 | 너무 짧으면 노이즈, 너무 길면 감지 지연 |
| `EvaluationPeriods` | 몇 주기 연속 위반해야 ALARM | 1이면 스파이크마다 오탐 |
| `Statistic` | Average / Sum / Maximum / p99 등 | 지연은 평균만 보면 꼬리 지연을 놓친다 |
| `TreatMissingData` | 데이터 없는 구간의 해석 | 트래픽 0인 야간에 헛알람이 뜰 수 있다 |
| `AlarmActions` | 울렸을 때 무엇을 할지 | 알림만 걸면 사람이 깰 때까지 방치된다 |

> 💡 **개념**: 지연은 **평균보다 꼬리(p90·p99)**가 사용자 체감에 가깝다. 평균 80ms인데 p99가 3초라면 100명 중 1명은 사실상 실패로 느낀다. 평균 알람 하나만 걸어두고 "지연은 정상"이라고 판단하는 것이 운영에서 가장 흔한 착시다.

> ⚠️ **함정**: 트래픽 급증으로 지연이 늘 때, "알람만 보내고 끝"이 아니라 **오토스케일링**으로 인스턴스를 자동 증설하는 것이 정석이다. SageMaker 엔드포인트의 오토스케일링은 보통 `SageMakerVariantInvocationsPerInstance`(인스턴스당 호출 수) 같은 지표를 타겟으로 정책을 건다. 시험에서 "트래픽 변동에 자동 대응"이면 단순 알람이 아니라 Application Auto Scaling 정책을 떠올려야 한다.

```python
aas = boto3.client("application-autoscaling")

# ① 스케일 대상 등록 — 배리언트의 인스턴스 수를 1~8 사이에서 조절
aas.register_scalable_target(
    ServiceNamespace="sagemaker",
    ResourceId="endpoint/my-endpoint/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    MinCapacity=1, MaxCapacity=8,
)

# ② 타겟 추적 정책 — 인스턴스당 호출 수를 목표치 근처로 유지
aas.put_scaling_policy(
    PolicyName="invocations-target-tracking",
    ServiceNamespace="sagemaker",
    ResourceId="endpoint/my-endpoint/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    PolicyType="TargetTrackingScaling",
    TargetTrackingScalingPolicyConfiguration={
        "TargetValue": 1000.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "SageMakerVariantInvocationsPerInstance"},
        "ScaleInCooldown": 300, "ScaleOutCooldown": 60,
    },
)
```

- **ScaleOut 쿨다운은 짧게, ScaleIn 쿨다운은 길게** — 늘릴 땐 빠르게, 줄일 땐 신중하게가 기본 감각이다.
- 인스턴스 추가에는 프로비저닝 시간이 걸린다. 스케일아웃이 즉발이 아니라는 점을 감안해 임계치를 여유 있게 잡는다.

## 로깅 — CloudWatch Logs

엔드포인트 컨테이너의 stdout/stderr는 자동으로 **CloudWatch Logs**로 흘러간다. 로그 그룹은 보통 `/aws/sagemaker/Endpoints/{endpoint-name}` 형태다. 모델 로딩 실패, 예외 스택트레이스, 추론 중 경고 등을 여기서 본다.

```python
logs = boto3.client("logs")
# 특정 로그 그룹에서 최근 에러를 필터링
response = logs.filter_log_events(
    logGroupName="/aws/sagemaker/Endpoints/my-endpoint",
    filterPattern="ERROR",          # ERROR 포함 로그만
    limit=50,
)
```

대량 로그를 SQL 비슷한 문법으로 조회·집계하려면 **CloudWatch Logs Insights**를 쓴다. "최근 1시간 5xx 오류 상위 원인" 같은 분석에 유용하다.

```text
fields @timestamp, @message
| filter @message like /ERROR|Exception|Timeout/
| stats count() as hits by bin(5m)
| sort @timestamp desc
```

| 무엇을 알고 싶나 | 도구 |
|-----------------|------|
| 지금 지연·오류율이 정상인가 | CloudWatch Metrics + Alarm |
| 그 오류의 구체적 예외와 스택트레이스 | CloudWatch Logs |
| 오류가 어느 시간대·어느 패턴으로 몰렸나 | Logs Insights 집계 쿼리 |
| 느린 구간이 모델인가 앞단인가 | X-Ray 트레이스 |

## X-Ray로 분산 추적

엔드포인트가 다른 서비스(전처리 Lambda, 외부 API, 데이터베이스)와 엮이면, 어느 구간에서 지연이 나는지 한눈에 보기 어렵다. **AWS X-Ray**는 요청이 거쳐가는 각 구간(segment)의 소요 시간을 추적해 병목을 시각화한다. "전체 응답은 느린데 ModelLatency는 정상이다 → 앞단 Lambda나 네트워크가 병목"을 X-Ray 트레이스로 확인할 수 있다.

> 🔍 **더 깊이**: 운영 모니터링은 "관측성(observability)의 세 기둥"으로 정리된다. **메트릭**(무엇이 얼마나 — 지연·오류율·사용률), **로그**(무슨 일이 — 이벤트·예외 상세), **트레이스**(어디서 — 요청 흐름과 구간별 지연). CloudWatch Metrics·Logs와 X-Ray가 이 세 기둥에 정확히 대응한다. 문제 해결 순서도 보통 "메트릭으로 이상 감지 → 로그로 원인 상세 확인 → 트레이스로 어느 구간인지 특정"으로 흐른다.

## 비용·사용량도 모니터링 대상

운영 모니터링에는 비용도 포함된다. 항상 켜진 실시간 엔드포인트는 유휴 시간에도 비용이 나가므로, `Invocations`가 장기간 0에 가깝다면 서버리스나 비동기로 전환을 검토한다. CloudWatch 대시보드로 지연·오류·사용률·호출량을 한 화면에 모아 운영 상태를 한눈에 본다.

## 운영이 꼬일 때: 증상 → 원인 → 조치

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 전체 지연은 늘었는데 `ModelLatency`는 정상 | 앞단(Lambda·API Gateway·네트워크)이 병목 | X-Ray 트레이스로 구간 특정 후 해당 구간 개선 |
| `ModelLatency`만 급증 | 인스턴스 부하, 모델이 무거움 | 인스턴스 타입 상향·증설, 모델 경량화 |
| `OverheadLatency`만 급증 | 페이로드가 큼, 직렬화 비용, 잦은 콜드 로딩 | 요청 크기 축소, 형식 단순화 |
| `Invocation5XXErrors` 급증 | 컨테이너 충돌·OOM·추론 타임아웃 | 컨테이너 로그 확인, 메모리 큰 타입, 타임아웃·인스턴스 수 상향 |
| `Invocation4XXErrors` 급증 | 잘못된 입력 형식·인증·페이로드 크기 초과 | 클라이언트 검증 강화, 입력 스키마 문서화 |
| 트래픽이 늘 때마다 지연이 튄다 | 오토스케일링 미설정 또는 타겟값 과대 | Application Auto Scaling 등록 + 타겟값 하향 |
| 야간에 헛알람이 계속 뜬다 | 트래픽 0 구간의 결측 데이터 처리 | `TreatMissingData="notBreaching"`, 평가 주기 조정 |
| 평균 지연은 정상인데 사용자 불만 | 꼬리 지연(p99)이 큼 | p99 기준 알람 추가, 인스턴스 여유 확보 |
| 로그가 안 보인다 | 실행 역할에 CloudWatch Logs 쓰기 권한 없음 | 엔드포인트 실행 IAM 역할에 로그 권한 부여 |
| 호출은 거의 없는데 비용이 계속 나간다 | 실시간 엔드포인트가 유휴 상태로 상시 가동 | 서버리스·비동기 추론 전환 검토, 미사용 엔드포인트 삭제 |

다음 글에서는 모니터링이 드리프트나 성능 저하를 감지했을 때 이어지는 대응 — 자동 재학습 파이프라인과 A/B·섀도 테스트를 본다.

## 📖 용어

- **관측성의 세 기둥** : 메트릭(수치 시계열)·로그(이벤트 상세)·트레이스(구간별 흐름). CloudWatch Metrics·Logs와 X-Ray가 각각 대응한다.
- **ModelLatency** : 모델 컨테이너가 추론에 쓴 시간. 여기가 튀면 모델·인스턴스 쪽 문제다.
- **OverheadLatency** : 요청 수신·라우팅 등 SageMaker 측 부가 시간. 페이로드가 크거나 형식이 무거우면 늘어난다.
- **Invocation4XXErrors / 5XXErrors** : 클라이언트 잘못으로 실패한 호출 수 / 서버 측 문제로 실패한 호출 수.
- **CloudWatch Alarm** : 지표가 조건을 만족하면 ALARM 상태로 전환해 SNS·오토스케일링·Lambda를 발동하는 감시 규칙.
- **EvaluationPeriods** : 몇 주기 연속 위반해야 알람을 울릴지. 늘리면 순간 스파이크 오탐이 줄어든다.
- **TreatMissingData** : 지표 데이터가 없는 구간을 위반으로 볼지 정하는 옵션. 트래픽 0 시간대 헛알람을 막는 데 쓴다.
- **Application Auto Scaling** : 엔드포인트 배리언트의 인스턴스 수를 지표 기준으로 자동 증감하는 서비스. 대표 타겟 지표는 인스턴스당 호출 수(`SageMakerVariantInvocationsPerInstance`)다.
- **CloudWatch Logs Insights** : 대량 로그를 쿼리 문법으로 필터·집계·정렬하는 분석 도구.
- **AWS X-Ray** : 요청이 거치는 각 구간의 소요 시간을 추적해 어디서 느려지는지 시각화하는 분산 추적 서비스.

---

## 📝 연습 문제

**문제 1.** 한 엔드포인트의 응답이 갑자기 느려졌다. `ModelLatency`는 평소와 같은데 전체 응답 시간만 급증했다. 다음 중 원인을 좁히는 데 가장 적절한 도구는?

A) Model Monitor 데이터 품질 베이스라인  
B) AWS X-Ray로 요청 구간별 지연 추적  
C) Clarify 편향 드리프트 모니터  
D) S3 버전 관리  

**정답: B**  
해설: ModelLatency는 정상인데 전체 지연만 늘었다면 모델 외부 구간(앞단 Lambda·네트워크·외부 API)이 병목이다. X-Ray는 요청이 거치는 각 구간의 소요 시간을 추적해 어디서 지연이 나는지 특정해준다. A·C는 모델/데이터 드리프트용이고, D는 모니터링과 무관하다.

---

**문제 2.** 엔드포인트에서 `Invocation5XXErrors`가 급증했다. 가장 가능성 높은 원인 영역은?

A) 클라이언트가 잘못된 형식의 페이로드를 보냄  
B) 모델 컨테이너 충돌·타임아웃·자원 부족 등 서버 측 문제  
C) IAM 자격 증명 만료  
D) S3 버킷 이름 오타  

**정답: B**  
해설: 5XX는 서버 측 오류로 모델 컨테이너 충돌, 추론 타임아웃, 메모리/자원 부족 등을 시사한다. 인스턴스 증설·헬스 체크·컨테이너 로그 디버깅이 필요하다. A는 4XX(클라이언트 오류)의 전형이고, C·D는 일반적으로 4XX나 다른 오류로 나타나며 5XX 급증의 주원인은 아니다.

---

**문제 3.** CloudWatch 알람에서 일시적 스파이크로 인한 오탐(false alarm)을 줄이려면 어떤 설정을 조정하는가?

A) Threshold를 0으로 낮춘다  
B) EvaluationPeriods를 늘려 여러 주기 연속 위반 시에만 ALARM  
C) Namespace를 변경한다  
D) Period를 1초로 줄인다  

**정답: B**  
해설: EvaluationPeriods를 늘리면 여러 평가 주기 동안 연속으로 임계치를 위반해야 ALARM 상태가 되므로 순간적 스파이크에 의한 오탐이 줄어든다. A는 오히려 거의 항상 알람이 울리게 만들고, C는 무관하며, D는 평가를 더 민감하게 만들어 오탐이 늘 수 있다.

---

**문제 4.** 실시간 엔드포인트의 트래픽이 시간대에 따라 크게 변동한다. 지연을 일정하게 유지하면서 비용도 아끼는 가장 적절한 자동 대응은?

A) 알람이 울리면 운영자가 수동으로 인스턴스를 추가한다  
B) Application Auto Scaling 정책으로 인스턴스당 호출 수 지표에 따라 자동 증감  
C) 엔드포인트를 항상 최대 인스턴스 수로 고정한다  
D) CloudWatch Logs Insights로 로그를 분석한다  

**정답: B**  
해설: 트래픽 변동에는 SageMakerVariantInvocationsPerInstance 같은 지표를 타겟으로 한 Application Auto Scaling 정책으로 인스턴스를 자동 증감하는 것이 정석이다. A는 수동이라 즉각성이 떨어지고, C는 유휴 시간에 비용 낭비가 크며, D는 로그 분석 도구일 뿐 자동 스케일링과 무관하다.

---

**문제 5.** "관측성의 세 기둥(three pillars of observability)"과 AWS 서비스의 대응으로 옳은 것은?

A) 메트릭=X-Ray, 로그=CloudWatch Metrics, 트레이스=S3  
B) 메트릭=CloudWatch Metrics, 로그=CloudWatch Logs, 트레이스=X-Ray  
C) 메트릭=SNS, 로그=Lambda, 트레이스=DynamoDB  
D) 세 가지 모두 CloudWatch Alarm 하나로 처리한다  

**정답: B**  
해설: 관측성의 세 기둥은 메트릭(수치 시계열, CloudWatch Metrics), 로그(이벤트 상세, CloudWatch Logs), 트레이스(요청 구간별 흐름, X-Ray)다. A는 매핑이 뒤섞였고, C는 무관한 서비스들이며, D는 알람만으로 로그·트레이스를 대체할 수 없다.

---
