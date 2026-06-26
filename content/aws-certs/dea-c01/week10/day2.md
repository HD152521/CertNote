# Day 2 - 도메인 3·4 통합 복습: 운영·지원 + 보안·거버넌스

어제는 데이터가 흐르는 파이프라인을 복습했습니다. 오늘은 그 파이프라인을 **안정적으로 운영(도메인 3, 약 22%)**하고 **안전하게 보호(도메인 4, 약 18%)**하는 영역을 묶어 봅니다. 이 두 영역은 "장애가 나면 어떻게 알고 복구하는가", "데이터는 누가 접근하고 어떻게 암호화되는가"라는 운영 현실의 질문으로 자주 출제됩니다.

## 도메인 3: 오케스트레이션

여러 작업을 순서·의존성에 맞게 묶는 것이 오케스트레이션입니다.

| 요구사항 | 서비스 | 특징 |
|---------|--------|------|
| 데이터 워크플로 스케줄·의존성(Airflow) | Amazon MWAA | 관리형 Apache Airflow, DAG 기반 |
| 서버리스 상태 기계, 시각적 분기·재시도 | AWS Step Functions | Lambda/Glue/EMR 등 단계 조율 |
| Glue 잡·크롤러 전용 흐름 | Glue Workflows | Glue 내장 트리거·워크플로 |
| 단순 cron 스케줄 트리거 | EventBridge Scheduler | 시간 기반 이벤트 |

> 💡 **관련 이론**: "기존 Airflow DAG을 그대로 쓰고 싶다"면 MWAA, "이기종 AWS 서비스(Lambda·ECS·Glue)를 분기·재시도·병렬로 조율"하려면 Step Functions가 정답입니다. Glue 잡만 엮는다면 Glue Workflows로 충분합니다.

## 도메인 3: 모니터링과 로깅

- **CloudWatch Metrics/Alarms**: 잡 실패율, 지연, 리소스 사용량 임계치 알람.
- **CloudWatch Logs**: Glue·Lambda·EMR 실행 로그 집계와 Logs Insights 쿼리.
- **CloudTrail**: API 호출 감사 로그(누가 무엇을 언제). 보안·거버넌스와도 연결.
- **EventBridge**: 잡 상태 변화 이벤트로 알림·후속 트리거.

```text
파이프라인 관측 3종:
- 지표(Metric)  → CloudWatch Alarm으로 "임계치 초과 시 알림"
- 로그(Log)     → CloudWatch Logs Insights로 "원인 추적"
- 감사(Audit)   → CloudTrail로 "누가 이 작업을 했는가"
```

> 💡 **관련 이론**: "왜 실패했는지 원인 추적"은 CloudWatch Logs, "임계치 기반 알림"은 CloudWatch Alarm, "누가 이 API를 호출했는지 추적"은 CloudTrail로 구분합니다. 이 셋을 헷갈리지 않는 것이 도메인 3 득점 포인트입니다.

## 도메인 3: 데이터 품질

- **Glue Data Quality**: 데이터셋에 규칙(DQDL)을 정의해 완전성·유효성·중복을 검증. 규칙 위반 시 잡 중단 또는 격리.
- **DataBrew**: 프로파일링으로 결측·이상치·분포를 시각적으로 파악.
- **멱등성·재시도**: 실패 시 안전한 재처리를 위해 잡을 멱등(idempotent)하게 설계.

```python
# Glue Data Quality 규칙(DQDL) 예시
ruleset = """
Rules = [
   IsComplete "order_id",
   ColumnValues "amount" >= 0,
   Uniqueness "order_id" > 0.99
]
"""
# 규칙 통과 시 적재, 실패 시 격리 버킷으로 라우팅
```

## 도메인 4: 인증·인가(IAM)

- **IAM 역할(Role)**: 서비스(Glue/EMR/Lambda)에 최소 권한을 부여. 사람 자격증명을 코드에 두지 않음.
- **최소 권한 원칙**: 필요한 액션·리소스만 허용. `*` 남발 금지.
- **리소스 기반 정책**: S3 버킷 정책, KMS 키 정책 등 리소스 쪽에서 접근 허용.
- **Lake Formation 권한**과 IAM의 관계: 데이터레이크 데이터 접근은 LF가, 서비스 운영 권한은 IAM이 담당.

> 💡 **관련 이론**: "Glue 잡이 S3와 KMS에 접근해야 한다"면 잡 실행 역할(IAM Role)에 해당 권한을 부여합니다. 액세스 키를 잡 스크립트에 하드코딩하는 보기는 항상 오답입니다.

## 도메인 4: 암호화(KMS)

- **저장 시 암호화(at rest)**: S3(SSE-KMS/SSE-S3), Redshift, RDS, EBS 모두 KMS 키로 암호화.
- **전송 중 암호화(in transit)**: TLS/HTTPS.
- **SSE-KMS vs SSE-S3**: 키를 직접 관리·감사·회전하고 키별 접근 통제가 필요하면 SSE-KMS, 단순 관리형이면 SSE-S3.
- **고객 관리 키(CMK)**: 키 정책으로 누가 암복호화할 수 있는지 세밀 제어, CloudTrail로 키 사용 감사.

| 키워드 | 정답 |
|--------|------|
| 키 회전·키별 접근 통제·감사 필요 | SSE-KMS (고객 관리 키) |
| 가장 단순한 관리형 암호화 | SSE-S3 |
| 클라이언트가 직접 암호화 후 업로드 | 클라이언트 측 암호화 |

## 도메인 4: 민감정보 탐지와 데이터 보호

- **Amazon Macie**: 머신러닝으로 S3 내 **PII(개인식별정보)**·신용카드 번호 등 민감 데이터를 자동 발견·분류. "어디에 민감정보가 있는지 모름"을 해결.
- **마스킹/토큰화**: Glue·Athena·Redshift Dynamic Data Masking으로 출력 시 민감 컬럼을 가림.
- **데이터 분류**: 발견(Macie) → 분류 → 권한(Lake Formation) → 암호화(KMS)로 이어지는 보호 사슬.

> 💡 **관련 이론**: "S3 버킷 곳곳에 민감정보(PII)가 흩어져 있는데 위치를 자동으로 찾아 분류하고 싶다"는 시나리오의 정답은 Amazon Macie입니다. Macie는 "탐지/분류"이고, 접근 통제는 Lake Formation/IAM, 보호는 KMS·마스킹이 담당하는 역할 분담을 기억하세요.

## 두 도메인을 잇는 운영·보안 그림

1. **운영**: MWAA/Step Functions가 파이프라인 조율 → CloudWatch로 지표·로그 감시 → 실패 시 알람·재시도
2. **품질**: Glue Data Quality 규칙으로 적재 전 검증, 위반 데이터 격리
3. **보안**: IAM 역할 최소 권한 → KMS로 저장·전송 암호화
4. **거버넌스**: Macie로 민감정보 탐지 → Lake Formation으로 세분화 접근 → CloudTrail로 감사

## 핵심 정리

- 오케스트레이션은 Airflow=MWAA, 이기종 조율=Step Functions, Glue 전용=Glue Workflows.
- 모니터링 3종: 지표(Alarm)·로그(Logs Insights)·감사(CloudTrail)를 역할별로 구분.
- 데이터 품질은 Glue Data Quality(DQDL) 규칙으로 검증·격리.
- 권한은 IAM 역할 최소 권한, 데이터 접근 세분화는 Lake Formation.
- 암호화는 KMS(키 통제·감사 필요 시 SSE-KMS), 민감정보 자동 탐지는 Macie.

## 📝 연습 문제

**문제 1.** 한 팀이 기존에 사용하던 Apache Airflow DAG을 거의 수정 없이 AWS에서 관리형으로 운영하고자 한다. 가장 적합한 서비스는?

A) AWS Step Functions  
B) Amazon EventBridge Scheduler  
C) AWS Batch  
D) Amazon MWAA  

**정답: D**  
해설: Amazon MWAA(Managed Workflows for Apache Airflow)는 관리형 Airflow로 기존 DAG을 거의 그대로 운영할 수 있습니다. Step Functions는 상태 기계 기반으로 DAG 문법이 다르고, EventBridge·Batch는 Airflow 호환 워크플로 엔진이 아닙니다.

---

**문제 2.** 보안 감사 결과 "특정 IAM 사용자가 언제 어떤 Glue API를 호출했는지" 추적할 수 있어야 한다는 요구가 나왔다. 가장 적합한 서비스는?

A) Amazon CloudWatch Alarm  
B) AWS CloudTrail  
C) AWS X-Ray  
D) Amazon Macie  

**정답: B**  
해설: CloudTrail은 계정 내 API 호출(누가·언제·무엇을)을 기록하는 감사 로그 서비스입니다. CloudWatch Alarm은 지표 임계치 알림, X-Ray는 분산 추적, Macie는 민감정보 탐지로 목적이 다릅니다.

---

**문제 3.** S3에 저장하는 데이터를 암호화하되 키 회전, 키별 접근 통제, 키 사용 내역 감사가 모두 필요하다. 가장 적합한 방식은?

A) 암호화하지 않고 버킷을 프라이빗으로만 둔다  
B) SSE-S3(S3 관리형 키)  
C) SSE-KMS(고객 관리 KMS 키)  
D) 클라이언트가 평문으로 업로드 후 IAM으로만 보호  

**정답: C**  
해설: SSE-KMS의 고객 관리 키(CMK)는 키 정책으로 접근을 통제하고 자동 회전을 지원하며 CloudTrail로 키 사용을 감사할 수 있습니다. SSE-S3는 키 통제·감사가 제한적이고, 나머지는 암호화 요구를 충족하지 못합니다.

---

**문제 4.** 여러 S3 버킷에 고객 PII가 어디에 얼마나 있는지 파악되지 않아 컴플라이언스 위험이 있다. 민감 데이터를 자동으로 발견·분류하려 한다. 가장 적합한 서비스는?

A) Amazon Macie  
B) AWS Config  
C) Amazon GuardDuty  
D) AWS Trusted Advisor  

**정답: A**  
해설: Amazon Macie는 머신러닝으로 S3 내 PII·금융정보 등 민감 데이터를 자동 발견·분류합니다. Config는 리소스 구성 추적, GuardDuty는 위협 탐지, Trusted Advisor는 모범 사례 점검으로 민감정보 분류 기능이 없습니다.

---

**문제 5.** Glue ETL 잡이 적재 전에 "order_id가 비어 있지 않고 amount가 0 이상이며 order_id가 거의 고유한지"를 자동 검증하고, 규칙 위반 데이터는 격리하려 한다. 가장 적합한 기능은?

A) CloudWatch Logs Insights  
B) S3 수명주기 정책  
C) Redshift VACUUM  
D) Glue Data Quality 규칙(DQDL)  

**정답: D**  
해설: Glue Data Quality는 DQDL로 완전성(IsComplete)·유효성(ColumnValues)·고유성(Uniqueness) 등 규칙을 정의해 검증하고 위반 데이터를 격리할 수 있습니다. 나머지는 로그 조회·스토리지 관리·테이블 정리 용도로 품질 검증 기능이 아닙니다.

---
