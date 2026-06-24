# Day 1 - CloudWatch: 로그 그룹·지표 필터·알람, 비정상 탐지, 보안 이벤트 알림

로그를 "쌓는 것"과 "감지하는 것"은 전혀 다른 문제다. CloudTrail이 무슨 일이 일어났는지 기록한다면, Amazon CloudWatch는 그 기록을 **수치화하고, 임계를 정의하고, 임계를 넘는 순간 사람을 깨우는** 운영 평면이다. 보안 시험의 관점에서 CloudWatch는 단순 모니터링 도구가 아니라 "텍스트 로그 → 메트릭 → 알람 → 자동 대응"으로 이어지는 탐지 파이프라인의 첫 변환기다. 이 변환의 메커니즘 — 로그가 어떻게 숫자가 되고, 숫자가 어떻게 경보가 되는지 — 을 정확히 아는 것이 핵심이다.

## CloudWatch의 두 평면: Logs와 Metrics

CloudWatch는 성격이 다른 두 데이터 모델을 한 이름 아래 묶고 있다.

- **CloudWatch Logs**: 비정형/반정형 *텍스트* 로그 이벤트의 저장·검색. 로그 그룹(log group) → 로그 스트림(log stream) → 로그 이벤트(log event)의 3단 계층.
- **CloudWatch Metrics**: 시간에 따른 *숫자* 시계열. 네임스페이스(namespace) → 메트릭(metric) + 디멘션(dimension) → 데이터포인트.

이 둘을 잇는 다리가 **Metric Filter**다. 로그 텍스트에서 패턴을 추출해 숫자 메트릭을 만든다. 보안 탐지의 거의 모든 시나리오가 이 다리를 건넌다.

```
로그 이벤트(텍스트) ──[Metric Filter]──▶ 커스텀 메트릭(숫자) ──[Alarm]──▶ SNS/액션
```

> 💡 **관련 이론**: 이 구조는 SIEM(Security Information and Event Management)의 고전적 파이프라인 — collect → normalize → correlate → alert — 의 AWS 네이티브 최소 구현이다. CloudWatch는 단일 로그 그룹 내 패턴 매칭까지를 담당하고(상관분석은 약함), 다중 소스 상관·정규화는 Security Hub/OpenSearch가 맡는다. 즉 CloudWatch 알람은 "단일 신호 임계 탐지"에 강하고 "다중 신호 상관 탐지"에는 약하다는 경계를 기억해야 한다.

## 로그 그룹: 보존, 암호화, 접근

로그 그룹은 보존·암호화·권한의 단위다. 보안에서 놓치기 쉬운 세 가지 속성이 있다.

- **Retention(보존 기간)**: 기본값은 "Never expire"(무기한). 명시적으로 설정하지 않으면 비용이 무한 증가한다. 1일~10년 또는 무기한.
- **KMS 암호화**: 로그 그룹은 KMS CMK로 암호화할 수 있다. 단, CloudWatch Logs 서비스 주체가 해당 키를 사용할 수 있도록 **키 정책**에 권한을 부여해야 한다(IAM 정책만으로는 부족 — 키 정책이 게이트다).
- **Resource Policy**: 다른 서비스(예: Route 53, VPC, CloudTrail)가 로그를 *쓸* 수 있게 하려면 로그 그룹의 리소스 정책에 해당 서비스 주체를 허용해야 한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "logs.ap-northeast-2.amazonaws.com" },
    "Action": ["kms:Encrypt*","kms:Decrypt*","kms:ReEncrypt*","kms:GenerateDataKey*","kms:Describe*"],
    "Resource": "*",
    "Condition": {
      "ArnLike": { "kms:EncryptionContext:aws:logs:arn": "arn:aws:logs:ap-northeast-2:111122223333:log-group:*" }
    }
  }]
}
```

> ⚠️ **함정**: 로그 그룹에 KMS 키를 붙였는데 로그가 들어오지 않거나 `associate-kms-key` 호출이 실패한다면, 거의 항상 *키 정책*에 `logs.<region>.amazonaws.com` 서비스 주체 권한이 빠진 경우다. IAM 사용자/역할 권한과 KMS 키 정책은 별개의 게이트이며, KMS는 두 게이트를 *모두* 통과해야 접근을 허용한다.

## Metric Filter: 텍스트를 숫자로

Metric Filter는 로그 그룹에 들어오는 *새* 이벤트에 필터 패턴을 적용해, 매칭될 때마다 지정한 메트릭에 값을 기록한다. 두 가지 패턴 문법이 있다.

- **공백 구분(space-delimited) / 텍스트 패턴**: `?ERROR ?WARN`처럼 단어를 찾는다.
- **JSON 패턴**: 구조화된 JSON 로그(예: CloudTrail)에서 `{ $.eventName = "ConsoleLogin" }`처럼 필드를 평가한다.

보안 탐지의 핵심은 CloudTrail 로그를 CloudWatch Logs로 보낸 뒤(CloudTrail → CloudWatch Logs 통합), JSON 패턴으로 위험 API 호출을 잡는 것이다.

```
# 루트 계정 사용 탐지 (CIS 권장 알람)
{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }

# 콘솔 로그인 실패 탐지
{ ($.eventName = "ConsoleLogin") && ($.errorMessage = "Failed authentication") }

# 권한 없는 API 호출(AccessDenied) 탐지
{ ($.errorCode = "*UnauthorizedOperation") || ($.errorCode = "AccessDenied*") }

# IAM 정책 변경 탐지
{ ($.eventName = "DeleteGroupPolicy") || ($.eventName = "DeleteRolePolicy") ||
  ($.eventName = "PutGroupPolicy") || ($.eventName = "AttachRolePolicy") ||
  ($.eventName = "DetachRolePolicy") || ($.eventName = "CreatePolicyVersion") }
```

Metric Filter에는 두 가지 중요한 설정이 있다.

- **metricValue**: 매칭 시 기록할 값. 단순 카운트면 `1`. 로그 필드 값을 그대로 쓰려면 `$.bytes`처럼 참조.
- **defaultValue**: 매칭이 없는 기간에 기록할 값. 이걸 `0`으로 설정하지 않으면 매칭이 없는 구간은 데이터포인트 자체가 *비어버려*, 알람이 `INSUFFICIENT_DATA`로 빠지거나 평가가 흔들린다.

```bash
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-trail \
  --filter-name RootAccountUsage \
  --filter-pattern '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' \
  --metric-transformations \
    metricName=RootAccountUsageCount,metricNamespace=CISBenchmark,metricValue=1,defaultValue=0
```

> 🎯 **시나리오**: "루트 계정이 사용될 때 즉시 알림"은 시험 빈출이며 CIS AWS Foundations Benchmark 통제 항목이다. 정답 경로는 (1) CloudTrail을 *모든 리전*에서 활성화하고 CloudWatch Logs로 전송 → (2) Metric Filter로 루트 사용 패턴 매칭 → (3) 1 이상이면 발동하는 Alarm → (4) SNS 토픽으로 알림. EventBridge 규칙으로도 가능하지만, CIS 벤치마크와 Security Hub의 컨트롤은 Metric Filter+Alarm 경로를 기대한다.

## Alarm: 임계, 평가 기간, 결측 데이터 처리

CloudWatch Alarm은 메트릭을 주기적으로 평가해 세 상태(`OK`, `ALARM`, `INSUFFICIENT_DATA`) 중 하나로 둔다. 보안 알람에서 결정적인 파라미터들:

- **Period**: 데이터포인트 집계 주기(예: 300초).
- **Evaluation Periods (M)** / **Datapoints to Alarm (N)**: 최근 M개 기간 중 N개가 임계를 넘으면 ALARM("N of M" 평가). 노이즈를 줄이려 N<M을 쓴다.
- **Statistic**: `Sum`, `Average`, `Maximum` 등. 보안 카운트 탐지는 보통 `Sum`을 쓴다(특정 기간 동안 몇 번 발생했나).
- **Treat Missing Data**: `notBreaching`(정상 취급), `breaching`(위반 취급), `ignore`, `missing`(기본). 보안 탐지에서는 "데이터가 없으면 정상"이 맞는 경우(`notBreaching`)와 "데이터가 끊긴 것 자체가 이상"인 경우(`breaching`)를 구분해야 한다.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name RootAccountUsageAlarm \
  --namespace CISBenchmark --metric-name RootAccountUsageCount \
  --statistic Sum --period 300 \
  --evaluation-periods 1 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:security-alerts
```

> ⚠️ **함정**: `Statistic`을 잘못 고르면 탐지가 무력화된다. 로그인 실패 5회 같은 카운트를 `Average`로 평가하면(예: 5분 동안 평균 0.x) 임계 5를 절대 넘지 못한다. 카운트 기반 보안 탐지는 반드시 `Sum`이어야 한다. 또한 `defaultValue=0`을 metric filter에 설정하지 않으면 결측 구간이 생겨 알람이 흔들린다 — 두 설정은 짝으로 움직인다.

## CloudWatch 비정상 탐지(Anomaly Detection)

정적 임계가 어려운 메트릭(트래픽 패턴이 시간대·요일에 따라 변하는 경우)에는 **CloudWatch Anomaly Detection**을 쓴다. 머신러닝 모델이 메트릭의 과거 패턴을 학습해 예상 *밴드(band)*를 만들고, 밴드를 벗어나면 발동한다.

```
정적 임계:   ─────── 5 ───────  (고정선)
밴드 임계:   ╱╲  ╱╲  예상 범위  ╱╲   (시간에 따라 출렁이는 밴드)
            실제 값이 밴드 위/아래로 튀면 ALARM
```

보안에서의 쓸모: 평소와 다른 데이터 유출량(NetworkOut 급증), 비정상적 API 호출 빈도, 로그인 시도 패턴의 이탈 등 — "절대값"보다 "평소와 다름"이 신호인 경우. 다만 학습 기간이 필요하고, 명확한 임계가 있는 통제(루트 사용 = 1회만 발생해도 위반)에는 정적 임계가 더 정확하다.

> 💡 **관련 이론**: Anomaly Detection은 통계적 이상치 탐지(시계열 분해 + 신뢰구간)를 관리형으로 제공한다. 이는 GuardDuty가 행위 기반 이상 탐지를 하는 것과 철학이 같지만, GuardDuty는 위협 인텔·ML을 결합한 *완성형 탐지기*이고 CloudWatch Anomaly Detection은 *임의 메트릭에 대한 범용 밴드*다. 시험에서 "특정 위협(크립토마이닝, 자격증명 유출)"을 물으면 GuardDuty, "임의 커스텀 메트릭의 이상"을 물으면 CloudWatch Anomaly Detection이 정답에 가깝다.

## CloudWatch Logs Subscription Filter: 실시간 스트리밍

Metric Filter가 "패턴 → 숫자"라면, **Subscription Filter**는 "패턴에 매칭되는 로그 이벤트 자체를 실시간으로 다른 곳으로 흘려보내는" 장치다. 대상은 Kinesis Data Streams, Kinesis Data Firehose, Lambda, 또는 다른 계정의 로그(cross-account)다.

보안 아키텍처에서의 역할: 여러 계정의 로그를 **중앙 로깅 계정**으로 실시간 집계할 때 핵심이다. 각 계정 로그 그룹의 Subscription Filter → 중앙 계정 Kinesis/Firehose → S3 데이터 레이크 또는 OpenSearch.

```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/payment-service \
  --filter-name ErrorsToFirehose \
  --filter-pattern "?ERROR ?Exception ?AccessDenied" \
  --destination-arn arn:aws:firehose:ap-northeast-2:444455556666:deliverystream/central-logs \
  --role-arn arn:aws:iam::111122223333:role/CWLtoFirehoseRole
```

> 🔍 **더 깊이**: 로그 그룹당 활성 Subscription Filter는 (기본) 최대 2개로 제한된다. 한 로그 그룹의 데이터를 동시에 Firehose(아카이브)와 Lambda(실시간 대응) 양쪽으로 보내려면 이 한도를 의식해야 한다. 또한 cross-account subscription을 쓰려면 *대상* 계정에 destination(논리 엔드포인트)을 만들고 access policy로 *소스* 계정을 허용해야 한다 — 로그 그룹의 리소스 정책이 아니라 destination의 정책이 게이트라는 점이 헷갈리는 부분이다.

## SNS 알림: 사람과 기계로 갈라지는 분기점

Alarm의 액션은 SNS 토픽으로 가는 경우가 가장 흔하다. SNS에서 다시 이메일/SMS(사람)와 Lambda/SQS(기계 대응)로 팬아웃한다. 보안 알림 토픽 설계의 위생:

- SNS 토픽도 **KMS 암호화**(SSE)와 **토픽 정책**으로 보호한다. 누가 publish/subscribe할 수 있는지 명시한다.
- 알람 → SNS → Lambda로 자동 대응(예: 노출된 보안 그룹 규칙 회수)을 붙이면 탐지-대응 루프가 닫힌다. 단, 자동 대응의 권한 범위를 최소화해야 한다(과잉 권한 Lambda는 그 자체가 위협).

## 정리: CloudWatch의 보안 탐지 위치

CloudWatch는 "단일 로그 그룹 내 패턴을 숫자로 만들어 임계로 경보"하는 1차 탐지기다. 강점은 단순·즉시·저비용. 한계는 다중 소스 상관·정규화·장기 분석이며, 그 영역은 Day 2(Security Hub), Day 3(Athena/OpenSearch), Day 4(EventBridge)에서 메운다. 오늘의 핵심 등식을 기억하라: **CloudTrail → CloudWatch Logs → Metric Filter → Alarm → SNS**.

---

## 📝 연습 문제

**문제 1.** CloudTrail 로그에서 루트 계정 사용을 탐지해 즉시 알림을 보내려 한다. 올바른 구성 순서는?

A) CloudTrail → S3 → Athena 쿼리 스케줄링 → 이메일  
B) CloudTrail을 CloudWatch Logs로 전송 → Metric Filter로 루트 사용 패턴 매칭 → Alarm(임계 1) → SNS  
C) GuardDuty를 활성화하면 자동으로 처리된다  
D) VPC Flow Logs에 Metric Filter를 적용  

**정답: B**  
해설: 루트 사용 탐지의 표준 경로는 CloudTrail 로그를 CloudWatch Logs로 보내고, JSON 패턴 Metric Filter로 루트 주체 호출을 카운트한 뒤, 임계 1 이상이면 발동하는 Alarm을 SNS에 연결하는 것이다. S3+Athena는 사후 배치 분석이라 "즉시"가 아니고, GuardDuty는 루트 사용 자체를 핵심 탐지로 다루지 않으며, VPC Flow Logs에는 API 호출 정보가 없다.

---

**문제 2.** 5분 동안 콘솔 로그인 실패가 5회 이상이면 경보하도록 알람을 만들었는데 한 번도 발동하지 않는다. 메트릭 필터와 알람을 점검했을 때 가장 가능성 높은 원인은?

A) 알람의 Statistic을 Average로 설정해 카운트 합이 임계를 넘지 못한다  
B) SNS 토픽이 암호화되어 있다  
C) 로그 그룹 보존 기간이 너무 길다  
D) CloudFront 스코프가 잘못되었다  

**정답: A**  
해설: 카운트 기반 보안 탐지는 지정 기간 동안 발생 횟수의 합이 중요하므로 `Sum` 통계를 써야 한다. `Average`로 평가하면 5분 평균이 임계 5에 도달하지 못해 영원히 발동하지 않는다. SNS 암호화·보존 기간은 발동 여부와 무관하고, CloudFront 스코프는 WAF 개념으로 이 문맥과 관계없다.

---

**문제 3.** 트래픽이 시간대와 요일에 따라 크게 변동하는 애플리케이션의 NetworkOut 급증(데이터 유출 의심)을 정적 임계 없이 탐지하려 한다. 가장 적절한 것은?

A) 고정 임계 알람을 보수적으로 낮게 설정  
B) CloudWatch Anomaly Detection으로 학습된 밴드를 벗어나는 값을 탐지  
C) Subscription Filter로 모든 로그를 Lambda로 전송  
D) 로그 그룹 보존 기간을 무기한으로 설정  

**정답: B**  
해설: 패턴이 시간에 따라 변동해 정적 임계를 정하기 어려운 메트릭에는 Anomaly Detection이 적합하다. ML 모델이 과거 패턴으로 예상 밴드를 만들고 이를 벗어나면 발동한다. 고정 임계를 낮게 잡으면 정상 피크에서 오탐이 폭증하고, Subscription Filter는 탐지가 아니라 스트리밍 전달이며, 보존 기간은 탐지와 무관하다.

---

**문제 4.** 여러 멤버 계정의 로그를 중앙 로깅 계정으로 실시간 집계하려 한다. 핵심 구성 요소는?

A) 각 계정에서 S3 버킷 복제(replication)만 설정  
B) 각 로그 그룹의 Subscription Filter를 중앙 계정의 Kinesis Data Firehose destination으로 연결하고, destination access policy로 소스 계정을 허용  
C) 각 계정에서 Metric Filter를 만들면 자동으로 중앙 집계된다  
D) CloudWatch Alarm을 cross-account로 공유  

**정답: B**  
해설: 실시간 로그 집계는 Subscription Filter가 핵심이며, cross-account 시 *대상* 계정에 destination(Kinesis/Firehose)을 만들고 그 access policy로 소스 계정을 허용해야 한다. S3 복제는 실시간 이벤트 스트리밍이 아니고, Metric Filter는 같은 계정 내 숫자 변환일 뿐 cross-account 집계를 하지 않으며, 알람 공유로는 원본 로그가 모이지 않는다.

---

**문제 5.** 로그 그룹에 KMS CMK 암호화를 설정했더니 로그가 더 이상 수집되지 않는다. 가장 먼저 확인할 것은?

A) IAM 사용자에게 CloudWatch 읽기 권한이 있는지  
B) KMS 키 정책에 `logs.<region>.amazonaws.com` 서비스 주체의 키 사용 권한이 있는지  
C) 로그 그룹 보존 기간 설정  
D) SNS 토픽 구독 상태  

**정답: B**  
해설: CloudWatch Logs가 KMS로 암호화하려면 *키 정책*에 CloudWatch Logs 서비스 주체의 Encrypt/Decrypt/GenerateDataKey 권한이 명시돼야 한다. KMS는 IAM 권한과 키 정책 두 게이트를 모두 통과해야 하며, 서비스 주체 권한이 없으면 수집이 실패한다. IAM 읽기 권한, 보존 기간, SNS 구독은 수집 실패 원인과 무관하다.

---
