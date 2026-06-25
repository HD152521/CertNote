# Day 3 - 운영 모니터링: CloudWatch 지표·알람, 엔드포인트 지연·오류, 로깅

Day 1~2가 "모델이 옳은가(드리프트)"를 봤다면, 오늘은 "시스템이 건강한가"를 본다. 아무리 모델이 정확해도 엔드포인트 응답이 느리거나, 인스턴스가 과부하로 죽거나, 호출이 5xx 오류로 실패하면 사용자에게는 망가진 서비스다. 이 **운영(operational) 모니터링**의 중심에는 **Amazon CloudWatch**가 있다. MLA-C01은 "이 운영 문제를 어떤 지표로 잡고, 어떻게 알람·자동 대응하는가"를 묻는다.

CloudWatch는 세 가지를 제공한다. **메트릭(Metrics, 시계열 수치)**, **로그(Logs, 텍스트 기록)**, **알람(Alarms, 임계치 기반 자동 대응)**이다. 여기에 분산 추적용 **AWS X-Ray**까지 더해 전체 그림을 본다.

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
)
```

핵심 파라미터는 `Period`(평가 간격), `EvaluationPeriods`(몇 번 연속 위반해야 ALARM), `Threshold`(임계치), `ComparisonOperator`다. `EvaluationPeriods`를 늘리면 일시적 스파이크에 의한 오탐을 줄인다.

> ⚠️ **함정**: 트래픽 급증으로 지연이 늘 때, "알람만 보내고 끝"이 아니라 **오토스케일링**으로 인스턴스를 자동 증설하는 것이 정석이다. SageMaker 엔드포인트의 오토스케일링은 보통 `SageMakerVariantInvocationsPerInstance`(인스턴스당 호출 수) 같은 지표를 타겟으로 정책을 건다. 시험에서 "트래픽 변동에 자동 대응"이면 단순 알람이 아니라 Application Auto Scaling 정책을 떠올려야 한다.

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

## X-Ray로 분산 추적

엔드포인트가 다른 서비스(전처리 Lambda, 외부 API, 데이터베이스)와 엮이면, 어느 구간에서 지연이 나는지 한눈에 보기 어렵다. **AWS X-Ray**는 요청이 거쳐가는 각 구간(segment)의 소요 시간을 추적해 병목을 시각화한다. "전체 응답은 느린데 ModelLatency는 정상이다 → 앞단 Lambda나 네트워크가 병목"을 X-Ray 트레이스로 확인할 수 있다.

> 🔍 **더 깊이**: 운영 모니터링은 "관측성(observability)의 세 기둥"으로 정리된다. **메트릭**(무엇이 얼마나 — 지연·오류율·사용률), **로그**(무슨 일이 — 이벤트·예외 상세), **트레이스**(어디서 — 요청 흐름과 구간별 지연). CloudWatch Metrics·Logs와 X-Ray가 이 세 기둥에 정확히 대응한다. 문제 해결 순서도 보통 "메트릭으로 이상 감지 → 로그로 원인 상세 확인 → 트레이스로 어느 구간인지 특정"으로 흐른다.

## 비용·사용량도 모니터링 대상

운영 모니터링에는 비용도 포함된다. 항상 켜진 실시간 엔드포인트는 유휴 시간에도 비용이 나가므로, `Invocations`가 장기간 0에 가깝다면 서버리스나 비동기로 전환을 검토한다. CloudWatch 대시보드로 지연·오류·사용률·호출량을 한 화면에 모아 운영 상태를 한눈에 본다.

## 정리하며

운영 모니터링의 중심은 **CloudWatch**이고, 세 기둥은 **메트릭·로그·트레이스(X-Ray)**다. SageMaker 엔드포인트는 `ModelLatency`·`OverheadLatency`(지연), `Invocations`(호출량), `4XX/5XX Errors`(오류), `CPU/Memory/GPUUtilization`(자원)을 자동으로 내보낸다. **4XX는 클라이언트, 5XX는 서버** 책임이라는 구분이 원인 추적의 출발점이다. **CloudWatch Alarm**은 임계치 위반 시 SNS·오토스케일링·Lambda로 자동 대응하며, `EvaluationPeriods`로 오탐을 줄인다. 트래픽 변동에는 단순 알람이 아니라 **Application Auto Scaling**으로 인스턴스를 증감하는 것이 정석이다. 로그는 CloudWatch Logs(분석은 Logs Insights), 구간별 지연 병목은 X-Ray로 잡는다.

다음 글에서는 모니터링이 드리프트나 성능 저하를 감지했을 때 이어지는 대응 — 자동 재학습 파이프라인과 A/B·섀도 테스트를 본다.

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
