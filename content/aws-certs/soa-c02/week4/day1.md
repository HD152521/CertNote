# Day 1 - CloudTrail (Management/Data Event, Organization Trail)

📅 날짜: Week 4 (Day 1)
🎯 주제: AWS API 호출 감사 로깅의 표준 도구
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudTrail의 이벤트 종류(Management/Data/Insights)와 차이를 안다
- Organization Trail로 멀티 계정 감사 로그를 통합한다
- 로그 무결성 검증, S3 저장 구조, 비용 모델을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **Audit log**: 누가·언제·무엇을 했는지 기록. 변조 방지 + 장기 보관 필수
- **Non-repudiation (부인 방지)**: 행위자가 "나는 그러지 않았다"고 부인하지 못하게 함
- **Append-only**: 추가만 가능, 수정·삭제 불가. CloudTrail S3에 Object Lock 사용
- **Hashing for integrity**: 로그 파일의 해시값을 별도 서명으로 보관. 변조 즉시 탐지
- **Compliance frameworks**: SOC 2, PCI-DSS, HIPAA, ISO 27001 등 거의 모두 감사 로그 필수

---

## 📖 이론 내용

### 1. CloudTrail 개요

#### 무엇을 기록하나
- AWS API 호출 전부 (콘솔/CLI/SDK/AWS 서비스 간 호출 포함)
- 누가(IAM Principal), 언제(timestamp), 어디서(IP), 무엇을(API), 결과를(성공/실패)
- 90일까지 콘솔에서 무료 조회 (Event History)
- 영구 보관·고급 분석은 Trail 또는 CloudTrail Lake 필요

#### 자동 활성화
- AWS 계정 생성 시 자동으로 90일 Event History 활성
- 별도 Trail 만들지 않아도 콘솔에서 최근 이벤트 조회 가능

### 2. Trail 종류

#### Single Region vs Multi-Region
- **Single Region Trail**: 한 리전의 이벤트만
- **Multi-Region Trail (권장)**: 모든 리전 + 글로벌 서비스(IAM, STS, CloudFront)
- 신규 리전은 자동 포함 (Multi-Region이면)

#### Organization Trail
- AWS Organizations 관리 계정에서 생성
- 조직 내 **모든 멤버 계정**의 이벤트를 자동 수집 (현재 + 미래)
- 멤버 계정의 사용자는 이 Trail을 보거나 수정할 수 없음
- Log Archive Account의 중앙 S3 버킷으로 저장이 표준

### 3. 이벤트 종류

#### Management Events (관리 이벤트) - 기본 ON, 무료
- 인프라/리소스 변경 작업
- 예: `RunInstances`, `CreateBucket`, `AttachRolePolicy`
- 두 종류:
  - **Read** (조회): `Describe`, `List`, `Get`
  - **Write** (변경): `Create`, `Delete`, `Update`, `Put`

#### Data Events (데이터 이벤트) - 기본 OFF, 유료
- 리소스 내부 데이터 접근
- 예: S3 `GetObject`/`PutObject`, Lambda `Invoke`, DynamoDB Item 접근
- **양이 많아서 별도 활성화 + 비용** ($0.10/100K events)
- 시험 빈출: "S3 객체 접근 감사" → Data Events 활성화

#### Insights Events (인사이트) - 별도 활성화 유료
- API 호출 비정상 패턴을 ML로 감지
- 예: "평소보다 RunInstances 100배 → DDoS 봇 가능성?"
- 이벤트당 별도 비용

### 4. Trail 저장과 통합

#### 저장소 옵션
- **S3 (필수)**: JSON.gz 파일로 저장. 5분 단위 누적
- **CloudWatch Logs (선택)**: 실시간 분석/알람 위해
- **EventBridge**: 특정 API 호출 시 즉시 트리거 가능

#### S3 저장 구조
```
s3://my-cloudtrail/
  AWSLogs/
    111122223333/                    ← Account ID
      CloudTrail/
        ap-northeast-2/
          2026/05/22/
            111122223333_CloudTrail_ap-northeast-2_20260522T1000Z_abc.json.gz
```

#### 로그 무결성 검증 (Log File Validation)
- 활성화 시 1시간 단위로 다이제스트 파일 생성
- 다이제스트엔 그 시간의 로그 파일 해시값
- `aws cloudtrail validate-logs` 명령으로 변조 감지
- 컴플라이언스 필수 기능

### 5. EventBridge 연동 (실시간 대응)

#### 사용 사례
- "Root 사용자 로그인" → 즉시 SNS 알림
- "IAM Role 삭제" → Slack 알림
- "보안 그룹 0.0.0.0/0 추가" → SSM Automation으로 자동 차단

#### EventBridge Rule 예시
```json
{
  "source": ["aws.signin"],
  "detail-type": ["AWS Console Sign In via CloudTrail"],
  "detail": {
    "userIdentity": {
      "type": ["Root"]
    }
  }
}
```

### 6. CloudTrail Lake (Day 2에서 자세히)

- CloudTrail 이벤트를 SQL로 쿼리할 수 있는 데이터 레이크
- 7년까지 영구 보관
- S3 export 없이 직접 분석
- 별도 비용 모델 (이벤트 ingest + 쿼리 스캔)

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **CloudTrail vs Config** | CloudTrail = "누가 했나(API)", Config = "지금 상태가 어떤가(리소스)" | 둘 다 감사 도구 |
| **Read-Only Trail** | Read 이벤트만 또는 Write 이벤트만 별도 가능 | 비용 절감 |
| **AWS Service Account** | 다른 서비스가 호출하면 `userIdentity.type = AWSService` | 자동화 작업 식별 |
| **Cross-Account Trail** | 다른 계정의 S3에 저장 가능 (적절한 버킷 정책 필요) | Log Archive Account 패턴 |
| **Encryption** | SSE-S3 기본, SSE-KMS 권장 | 컴플라이언스 |
| **MFA Delete** | S3 버킷에 적용해 로그 변조 방지 강화 | 변조 방어 |

> ⚠️ **함정 1**: Management Events는 기본 ON & 무료이지만 Data Events는 OFF & 유료 — "S3 객체 접근 감사" 묻는 문제는 Data Events.
>
> ⚠️ **함정 2**: 90일 Event History는 자동이지만, **장기 보관은 Trail이 필요** — 90일 후엔 사라짐.
>
> 💡 **암기 팁**: CloudTrail = WHO did WHAT, Config = WHAT looks like NOW, GuardDuty = THREATS detected.

### 관련 서비스 Cross-Reference

- **CloudTrail → Week 4 Day 2** (Lake, Insights, EventBridge 심화)
- **CloudTrail → Week 4 Day 3** (Config와 조합)
- **CloudTrail → Week 9 GuardDuty/Security Hub** (보안 분석 소스)
- **CloudTrail → Week 1 Day 4** (Organization Trail = Landing Zone)

---

## 🏗️ 아키텍처 다이어그램

```
멀티 계정 CloudTrail 표준 패턴
==========================================================

  [Member Account 1]   [Member Account 2]   [Member Account 3]
       │                    │                    │
       │  API 호출           │  API 호출           │  API 호출
       └────────────────────┴────────────────────┘
                            │
                            ▼ (Organization Trail이 자동 수집)
                  ┌──────────────────────┐
                  │  CloudTrail Service  │
                  └─────────┬────────────┘
                            │
                            ▼
                  ┌──────────────────────┐
                  │  Log Archive Account │
                  │  중앙 S3 버킷         │
                  │  - 변조 방지 Object Lock │
                  │  - SSE-KMS 암호화    │
                  │  - Log Validation   │
                  └────┬─────────────┬───┘
                       ▼             ▼
              [CloudWatch Logs]   [Athena 쿼리]
              실시간 알람          심층 분석
                       ▼
              [EventBridge]
              Root 로그인 등
              즉시 대응
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Management Events = 기본 ON 무료**, **Data Events = 기본 OFF 유료**
2. ⭐ **90일 Event History 무료** — 그 이상은 Trail로 S3 저장 필요
3. ⭐ **Organization Trail로 멀티 계정 통합** — 멤버 계정 사용자는 변경 불가
4. ⭐ **Log File Validation으로 무결성 검증** — 컴플라이언스 필수
5. ⭐ **Root 로그인/IAM 변경 등은 EventBridge로 즉시 알림** — 보안 운영 표준

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Multi-Region Trail 생성
aws cloudtrail create-trail \
  --name org-master-trail \
  --s3-bucket-name org-cloudtrail-bucket \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation \
  --kms-key-id arn:aws:kms:ap-northeast-2:123:key/abc

# 2. Trail 시작
aws cloudtrail start-logging --name org-master-trail

# 3. Organization Trail 생성 (관리 계정에서)
aws cloudtrail create-trail \
  --name organization-trail \
  --s3-bucket-name org-cloudtrail-archive \
  --is-organization-trail \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation

# 4. S3 Data Events 활성화 (특정 버킷)
aws cloudtrail put-event-selectors \
  --trail-name org-master-trail \
  --event-selectors '[
    {
      "ReadWriteType": "All",
      "IncludeManagementEvents": true,
      "DataResources": [
        {
          "Type": "AWS::S3::Object",
          "Values": ["arn:aws:s3:::sensitive-bucket/", "arn:aws:s3:::sensitive-bucket/*"]
        },
        {
          "Type": "AWS::Lambda::Function",
          "Values": ["arn:aws:lambda"]
        }
      ]
    }
  ]'

# 5. CloudWatch Logs 통합
aws cloudtrail update-trail \
  --name org-master-trail \
  --cloud-watch-logs-log-group-arn arn:aws:logs:ap-northeast-2:123:log-group:CloudTrail/orgtrail:* \
  --cloud-watch-logs-role-arn arn:aws:iam::123:role/CloudTrail_CloudWatchLogs_Role

# 6. 로그 무결성 검증
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:123:trail/org-master-trail \
  --start-time 2026-05-22T00:00:00Z \
  --end-time 2026-05-22T23:59:59Z

# 7. EventBridge Rule: Root 로그인 알람
aws events put-rule \
  --name "RootUserLogin" \
  --event-pattern '{
    "source": ["aws.signin"],
    "detail-type": ["AWS Console Sign In via CloudTrail"],
    "detail": { "userIdentity": { "type": ["Root"] } }
  }'

aws events put-targets \
  --rule RootUserLogin \
  --targets "Id=1,Arn=arn:aws:sns:ap-northeast-2:123:security-alerts"

# 8. 최근 90일 이벤트 조회
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --max-items 20
```

---

## 📝 연습 문제

**문제 1.** 회사가 S3 버킷 객체 접근 이력을 감사 추적해야 한다. 어떤 CloudTrail 설정이 필요한가?

A) Management Events만으로 충분
B) Data Events 활성화 — S3 Object 리소스 지정
C) Insights Events
D) CloudWatch Logs

**정답: B**
해설: S3 객체 GetObject/PutObject는 Data Event. 기본 OFF이며 별도 활성화 + 비용 발생. 시험 빈출: "S3 접근 감사" = Data Events.

---

**문제 2.** 회사가 멀티 계정 환경에서 모든 계정의 API 호출을 중앙 S3에 저장하려 한다. 가장 적합한 구성은?

A) 계정마다 별도 Trail
B) Organizations 관리 계정에서 Organization Trail 생성 → Log Archive Account의 중앙 S3
C) CloudWatch Logs로
D) DynamoDB

**정답: B**
해설: Organization Trail은 조직 내 모든 계정(현재 + 미래)의 이벤트를 자동 수집. 멤버 계정은 변경 불가. Landing Zone 표준.

---

**문제 3.** Trail의 로그 파일이 변조됐는지 확인하려 한다. 어떤 기능?

A) S3 버전 관리
B) Log File Validation — Trail 생성 시 활성화, 1시간 단위 다이제스트 파일로 해시 검증
C) MFA Delete
D) CloudTrail Insights

**정답: B**
해설: Log File Validation 활성화 시 SHA-256 해시 다이제스트 생성. `aws cloudtrail validate-logs`로 변조 감지. 컴플라이언스 필수.

---

**문제 4.** Root 사용자가 콘솔에 로그인하면 즉시 SNS 알림을 받고 싶다. 어떻게?

A) CloudTrail Insights
B) EventBridge Rule + CloudTrail 이벤트 패턴 (`userIdentity.type = Root`) + SNS 타겟
C) CloudWatch Alarm
D) Config Rule

**정답: B**
해설: CloudTrail 이벤트는 EventBridge로 실시간 전달 가능. Root 로그인 같은 핵심 이벤트는 EventBridge Rule로 즉시 트리거. Boundary Practice.

---

**문제 5.** Event History를 콘솔에서 봤더니 6개월 전 이벤트가 안 보인다. 이유는?

A) 권한 문제
B) Event History는 90일까지만 무료 — 장기 보관은 Trail이 필요
C) 리전 변경
D) Filter 잘못

**정답: B**
해설: Event History는 90일 자동 보관. 90일+는 Trail 생성 후 S3 저장 필요. Trail 미생성이었으면 영구 손실.

---

## 📌 오늘의 요약

1. CloudTrail = AWS API 호출 감사. Event History 90일 무료, 그 이상은 Trail
2. Management Events(기본 ON 무료) vs Data Events(OFF 유료, S3/Lambda/DDB 접근)
3. Organization Trail로 멀티 계정 통합. Log Archive Account 패턴이 표준
4. Log File Validation으로 변조 감지 — 컴플라이언스 필수
5. EventBridge로 Root 로그인 등 핵심 이벤트 실시간 대응
