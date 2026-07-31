# Day 4 - ACM과 Macie: 인증서 수명주기·통합, Macie 민감정보(PII) 탐지·분류

전송 중 암호화(encryption in transit)는 TLS 인증서가 떠받친다. 그리고 저장된 데이터 어디에 민감정보가 숨어 있는지 아는 것은 데이터 보호의 출발점이다. 오늘은 두 서비스를 다룬다 — **AWS Certificate Manager(ACM)**는 TLS 인증서의 발급·갱신·배포를 자동화하고, **Amazon Macie**는 S3에 저장된 데이터에서 PII 같은 민감정보를 머신러닝으로 탐지·분류한다. 전자는 *암호화 채널의 신뢰*를, 후자는 *데이터의 가시성*을 책임진다.

## ACM: 인증서 수명주기 자동화

TLS 인증서 운영의 고전적 사고는 "갱신을 잊어 인증서가 만료되고 서비스가 중단되는" 것이다. ACM의 핵심 가치는 **자동 갱신(managed renewal)**으로 이 위험을 제거하는 것이다.

> 📚 **사례**: 인증서 만료는 "설마 그것 때문에"라고 생각하기 쉽지만 대규모 장애의 단골 원인이다. 2018년 12월 영국 O2를 포함한 여러 통신사의 데이터 서비스가 광범위하게 중단된 원인은 네트워크 장비 소프트웨어의 인증서 만료였고, 2020년 2월에는 Microsoft Teams가 인증서 갱신 누락으로 몇 시간 동안 접속 불가 상태가 됐다. 공격도 취약점도 아니고 그저 날짜가 지났을 뿐인데 서비스 전체가 멈춘다. 여기서 얻을 교훈은 두 가지다. 첫째, 인증서는 *운영해야 하는 자산*이지 한 번 설치하고 잊는 설정이 아니다. 둘째, 그래서 갱신은 사람의 캘린더가 아니라 **자동화**에 맡겨야 하고, 자동화가 조용히 실패할 가능성까지 **모니터링**해야 한다. ACM의 존재 이유가 정확히 이 두 문장이다.

ACM 인증서는 세 종류로 나눠 보는 것이 정확하다.

| 종류 | 발급 | 자동 갱신 | 개인키 export | 전형적 용도 |
|------|------|-----------|---------------|-------------|
| **퍼블릭 인증서** | ACM이 무료 발급, 공개 신뢰 CA 체인 | **가능**(DNS 검증 시 무인) | **불가** | 인터넷에 면한 ALB/CloudFront/API GW |
| **프라이빗 인증서** | AWS Private CA(유료), 내부 신뢰 체인 | 가능 | **가능**(export 지원) | 내부 서비스 간 TLS·mTLS, EC2 직접 설치 |
| **가져온(imported) 인증서** | 외부 CA에서 발급받아 ACM에 업로드 | **불가** | 해당 없음(원본은 보유 중) | 기존 CA 계약을 유지해야 하는 경우 |

> ⚠️ **함정**: **가져온 인증서는 ACM이 갱신해 주지 않는다.** ACM은 그것이 언제 만료되는지 알려 줄 뿐(만료 임박 이벤트·`DaysToExpiry` 메트릭), 갱신은 전적으로 사용자 책임이다. "ACM에 올렸으니 자동 갱신된다"는 오해가 실제 장애로 이어지는 지점이며, 시험도 "외부 CA 인증서를 ACM에 가져왔는데 만료됐다"는 형태로 자주 묻는다. 자동 갱신이 필요하면 ACM 발급 퍼블릭 인증서 또는 Private CA 인증서로 옮겨야 한다.

### 도메인 검증: DNS vs Email

퍼블릭 인증서 발급 시 도메인 소유를 증명해야 한다:
- **DNS 검증(권장)**: ACM이 준 CNAME 레코드를 도메인 DNS에 추가하면, ACM이 이를 확인하고 **자동 갱신까지 무인으로** 처리한다. Route 53이면 버튼 한 번으로 레코드를 꽂아준다.
- **Email 검증**: 도메인 등록 연락처로 온 메일의 링크를 클릭. 갱신 시마다 사람이 개입해야 해 자동화가 깨진다.

> 💡 **관련 이론**: DNS 검증이 갱신 자동화의 열쇠인 이유는, CNAME 레코드가 *지속적으로 존재*하기 때문이다. ACM은 갱신 시점에 그 레코드의 존재를 다시 확인해 도메인 통제가 유지됨을 증명한다. Email 검증은 일회성 증명이라 갱신 때마다 재증명이 필요하다. 즉 "지속 가능한 소유 증명"이 무인 갱신을 가능케 한다. PKI의 신뢰는 키 소유뿐 아니라 *도메인 통제의 지속성*에 기댄다.

> 🔍 **더 깊이**: TLS 인증서가 실제로 하는 일은 "이 공개키가 이 도메인의 것"임을 CA가 서명으로 보증하는 것뿐이다. 브라우저는 서버가 제시한 인증서 체인(리프 → 중간 CA → 루트 CA)을 따라 올라가며 서명을 검증하고, 루트가 자기 신뢰 저장소에 있으면 통과시킨다. 여기서 자주 놓치는 실무 함정이 **중간 인증서 누락**이다. 리프만 보내고 중간 CA 인증서를 함께 보내지 않으면, 그 중간 인증서를 캐시하고 있는 브라우저에서는 잘 되고 그렇지 않은 클라이언트(일부 모바일 앱, `curl`, 오래된 자바 런타임)에서는 실패한다. "브라우저는 되는데 앱에서만 TLS 오류가 난다"는 증상의 고전적 원인이다. ACM이 관리형 서비스로 체인을 통째로 배포하는 것은 이 실수를 구조적으로 없앤다. 또한 공개 신뢰 인증서는 발급 사실이 **Certificate Transparency 로그**에 공개 기록되므로, 자기 도메인에 대해 예상치 못한 인증서가 발급되면 이를 탐지할 수 있다(내부 도메인 이름을 감추고 싶다면 ACM 요청 시 CT 로깅을 끌 수 있으나, 그러면 주요 브라우저가 그 인증서를 신뢰하지 않는다는 대가가 따른다).

### Private CA: 내부 신뢰를 직접 만드는 일

내부 서비스 간 TLS나 mTLS(양방향 인증)에는 공개 신뢰가 필요 없다. 오히려 내부 호스트명이 CT 로그에 공개되는 것이 달갑지 않다. 이때 AWS Private CA로 조직 전용 신뢰 체인을 세운다.

```
[ 계층형 Private CA 구성 ]

  Root CA (오프라인에 가깝게 보관, 사용 빈도 최소)
     └─ Subordinate CA (실제 발급 담당, 필요 시 폐기·교체 가능)
           ├─ svc-a.internal   (서버 인증서)
           ├─ svc-b.internal
           └─ device-0001      (IoT 디바이스 클라이언트 인증서)
```

Root를 직접 쓰지 않고 하위 CA를 두는 이유는 **폐기 반경**을 줄이기 위해서다. 하위 CA 키가 유출되면 그 하위 CA만 폐기하고 새로 세우면 되지만, Root가 유출되면 모든 신뢰가 무너지고 전 디바이스의 신뢰 저장소를 갈아야 한다. 폐기 관리는 CRL(폐기 목록 파일)이나 OCSP(실시간 조회)로 배포하며, 대규모·오프라인 디바이스가 많으면 CRL, 즉시성이 중요하면 OCSP를 택한다.

| 항목 | ACM 퍼블릭 | Private CA |
|------|------------|------------|
| 신뢰 주체 | 공개 신뢰 저장소(브라우저·OS) | 조직이 배포한 신뢰 앵커 |
| 비용 | 인증서 무료 | CA 운영비 + 발급 건별 과금 |
| CT 로그 공개 | 기본 공개 | 해당 없음(내부 이름 노출 안 됨) |
| 개인키 export | 불가 | 가능 → EC2·온프레미스에 설치 |
| mTLS 클라이언트 인증서 | 부적합 | **적합**(전형적 용도) |
| 폐기 | CA가 관리 | CRL/OCSP를 직접 구성 |

> 🎯 **시나리오**: "IoT 디바이스 수만 대가 백엔드에 접속할 때 디바이스마다 고유 클라이언트 인증서로 상호 인증(mTLS)하고, 도난 디바이스는 즉시 차단해야 한다"가 나오면 답은 **Private CA로 클라이언트 인증서 발급 + 폐기(CRL/OCSP) 구성**이다. ACM 퍼블릭 인증서는 클라이언트 인증서 용도가 아니고, 개인키를 디바이스에 넣을 수도 없다. "즉시 차단"이라는 문구가 있으면 폐기 메커니즘까지 답에 포함되어야 한다.

### ACM 인증서를 쓸 수 있는 곳과 없는 곳

ACM 퍼블릭 인증서는 **AWS 통합 서비스에 직접 배포**될 때만 쓸 수 있다 — 개인키를 추출할 수 없기 때문이다:

| 사용 가능 | 사용 불가(직접 설치 불가) |
|-----------|--------------------------|
| Elastic Load Balancer(ALB/NLB) | EC2 인스턴스에 직접 |
| CloudFront | 온프레미스 서버 |
| API Gateway | 컨테이너 내부 직접 설치 |
| App Runner, Cognito 등 | (키 추출 불가) |

> ⚠️ **함정**: "EC2에서 직접 TLS를 종단하려는데 ACM 퍼블릭 인증서를 설치하라"는 *틀린* 답이다. ACM 퍼블릭 인증서는 개인키를 내보낼 수 없어 EC2에 직접 설치할 수 없다. EC2에서 종단하려면 (1) ALB를 앞에 두고 ACM 인증서로 TLS 종단하거나, (2) **Private CA에서 발급한 인증서를 export**해 EC2에 설치한다. CloudFront에 쓰는 인증서는 반드시 **us-east-1(버지니아 북부)**에서 발급해야 한다는 점도 빈출이다.

### 리전 특성과 갱신 실패 모니터링

ACM 인증서는 **리전 리소스**다(CloudFront용만 us-east-1 글로벌 예외). 자동 갱신이 실패할 수 있는 경우(DNS 검증 레코드가 삭제됨, 도메인 통제 상실)에 대비해 **EventBridge로 ACM 만료 임박 이벤트**를 받거나 **CloudWatch `DaysToExpiry` 메트릭**으로 경보를 건다.

```bash
aws acm request-certificate \
  --domain-name example.com \
  --subject-alternative-names "*.example.com" \
  --validation-method DNS \
  --key-algorithm RSA_2048

# 검증 상태와 갱신 자격을 함께 확인한다
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:ap-northeast-2:111122223333:certificate/abcd-1234 \
  --query 'Certificate.{Status:Status,InUse:InUseBy,NotAfter:NotAfter,Renewal:RenewalEligibility,Validation:DomainValidationOptions[].ValidationStatus}'

# 만료 임박 인증서 훑기 (감사 시 첫 명령)
aws acm list-certificates \
  --includes keyTypes=RSA_2048,EC_prime256v1 \
  --query 'CertificateSummaryList[].{Domain:DomainName,Arn:CertificateArn}'
```

```
[ TLS 종단이 어디서 일어나는가 — 배치별 신뢰 경계 ]

(A) 엣지 종단
 Client ──HTTPS(ACM, us-east-1)──→ CloudFront ──HTTPS──→ ALB ──HTTP──→ EC2
                                                                  ↑ VPC 내부는 평문

(B) 리전 종단 + 재암호화
 Client ──HTTPS(ACM)──→ ALB ──HTTPS(사설 인증서)──→ EC2
                                    ↑ Private CA 인증서를 EC2에 설치

(C) 패스스루 (종단을 백엔드가 직접)
 Client ──TLS──→ NLB(TCP 패스스루) ──TLS──→ EC2
                    ↑ LB는 내용을 못 봄 = WAF·경로 라우팅 불가

 규제가 "전 구간 암호화"를 요구하면 (A)의 마지막 HTTP 구간이 문제가 된다 → (B)로.
```

> ⚠️ **함정**: ACM 퍼블릭 인증서의 자동 갱신에는 조건이 하나 더 있다. **인증서가 실제로 AWS 통합 서비스에 연결(in use)되어 있어야** ACM이 관리형 갱신을 수행한다. 발급만 해 두고 아무 데도 붙이지 않은 인증서는 갱신 대상이 아니며, 이 경우 `RenewalEligibility`가 갱신 불가로 표시된다. "인증서는 ACM에 있는데 왜 만료됐나"의 두 가지 원인이 바로 (1) 가져온 인증서라서, (2) 어디에도 연결되지 않아서다.

> 🎯 **시나리오**: "인증서 자동 갱신이 조용히 실패해 만료로 인한 장애가 재발하지 않게 하라"가 나오면, DNS 검증을 쓰고(자동 갱신 가능) + EventBridge/CloudWatch로 만료 임박을 경보한다. Email 검증을 권하는 답은 자동화에 역행한다.

## Amazon Macie: S3 민감정보 발견·분류

Macie는 **S3 버킷에 저장된 데이터**를 스캔해 PII(개인식별정보), 금융정보(신용카드 번호, 은행 계좌), 자격증명(AWS 키, 개인키), 의료정보 등 민감 데이터를 머신러닝과 패턴 매칭으로 탐지·분류한다. "우리 S3 어딘가에 평문 주민번호/카드번호가 있는가?"라는 질문에 답하는 서비스다.

Macie는 두 가지 작업을 한다:

1. **버킷 인벤토리·보안 자세 평가**: 모든 S3 버킷의 암호화 상태, 공개 여부, 공유 여부를 *상시* 평가한다. "공개이면서 암호화 안 된 버킷"을 자동으로 띄운다.
2. **민감 데이터 탐지 작업(discovery job)**: 객체 내용을 실제로 스캔해 민감 데이터 유형과 위치를 식별하고 **findings**를 생성한다.

```bash
aws macie2 create-classification-job \
  --job-type ONE_TIME \
  --name "pii-scan-prod-buckets" \
  --s3-job-definition '{"bucketDefinitions":[{"accountId":"111122223333","buckets":["prod-uploads"]}]}'
```

> 💡 **관련 이론**: Macie는 *데이터 분류(data classification)*를 자동화한다. 전통적 데이터 거버넌스는 사람이 데이터를 "공개/내부/기밀/극비"로 라벨링하지만, 클라우드 규모(수십억 객체)에서는 불가능하다. Macie는 관리형 데이터 식별자(managed data identifiers)와 정규식·키워드 기반 **커스텀 식별자**로 이 라벨링을 기계화한다. 분류가 선행되어야 "기밀 데이터에는 SSE-KMS+Object Lock, 공개 데이터는 완화된 통제" 같은 *차등 보호(risk-based protection)*가 가능해진다. 보이지 않는 것은 보호할 수 없다.

### 관리형 식별자 vs 커스텀 식별자

- **관리형 데이터 식별자**: AWS가 유지하는 내장 탐지기 — 신용카드, 미국 SSN, 여권번호, AWS 비밀 키 등 글로벌 PII 유형.
- **커스텀 데이터 식별자**: 조직 고유 형식(사번, 한국 주민등록번호 형식, 내부 계정 번호 등)을 정규식 + 키워드 근접 + 무시할 단어로 정의.

```bash
aws macie2 create-custom-data-identifier \
  --name "employee-id" \
  --regex "EMP-[0-9]{6}" \
  --keywords "employee" "사번" \
  --maximum-match-distance 50
```

커스텀 식별자에서 정규식만큼 중요한 것이 **키워드 근접(proximity)**과 **무시 단어(ignore words)**다. `[0-9]{6}-[0-9]{7}` 같은 패턴만으로는 주문번호나 임의의 숫자열까지 걸려 오탐이 쏟아진다. "주민등록번호", "생년월일" 같은 키워드가 지정 거리 안에 함께 나타날 때만 매칭시키고, 테스트 데이터에 쓰이는 더미 값은 무시 단어로 빼면 신호 대 잡음비가 크게 올라간다. **오탐이 많은 탐지기는 결국 아무도 보지 않게 되므로 없는 것과 같다** — 정확도 관리가 곧 운영 가능성이다.

### Finding을 읽는 법

Macie가 만들어 내는 finding은 유형 이름만 봐도 성격이 갈린다.

| finding 유형 | 무엇을 말하는가 | 대응 |
|--------------|-----------------|------|
| `Policy:IAMUser/S3BucketPublic` | 버킷이 공개 상태가 됨 | 즉시 BPA 적용·정책 교정 |
| `Policy:IAMUser/S3BlockPublicAccessDisabled` | BPA가 꺼짐 | 가드레일 복구, 누가 껐는지 CloudTrail 추적 |
| `Policy:IAMUser/S3BucketEncryptionDisabled` | 기본 암호화가 꺼짐 | 기본 암호화 재설정 |
| `Policy:IAMUser/S3BucketSharedExternally` | 외부 계정과 공유됨 | 의도된 공유인지 확인 |
| `SensitiveData:S3Object/Personal` | 객체에서 개인정보 발견 | 저장 위치·보존 기간 재검토 |
| `SensitiveData:S3Object/Financial` | 카드번호·계좌 등 금융정보 발견 | 결제 데이터 격리, 토큰화 검토 |
| `SensitiveData:S3Object/Credentials` | 액세스 키·개인키 발견 | **즉시 해당 자격증명 회전** |

```json
{
  "type": "SensitiveData:S3Object/Credentials",
  "severity": { "description": "High" },
  "resourcesAffected": {
    "s3Bucket": { "name": "prod-uploads", "publicAccess": { "effectivePermission": "NOT_PUBLIC" } },
    "s3Object": { "key": "backups/config-dump.json", "size": 20480 }
  },
  "classificationDetails": {
    "result": {
      "sensitiveData": [
        { "category": "CREDENTIALS", "totalCount": 3,
          "detections": [{ "type": "AWS_CREDENTIALS", "count": 3 }] }
      ]
    }
  }
}
```

이 finding 하나가 말하는 것은 명확하다. 버킷은 공개가 아니지만(`NOT_PUBLIC`), 백업 덤프 파일 안에 AWS 자격증명 3건이 평문으로 들어 있다. **버킷이 비공개라는 사실이 위험을 없애 주지 않는다** — 그 파일에 접근할 수 있는 모든 주체가 곧 그 자격증명의 보유자가 되기 때문이다. 대응 순서는 (1) 노출된 자격증명 즉시 회전·무효화, (2) 해당 객체 제거 또는 격리, (3) 덤프를 생성한 파이프라인이 왜 시크릿을 포함했는지 추적, (4) 같은 패턴이 다른 버킷에도 있는지 탐지 범위 확대다.

> 📚 **사례**: 백업 덤프·설정 파일·컨테이너 이미지 레이어에 자격증명이 남아 S3로 흘러드는 패턴은 실무에서 놀랍도록 흔하다. 개발자가 시크릿을 코드에서 걷어내 Secrets Manager로 옮긴 뒤에도, 애플리케이션이 디버깅용으로 남긴 설정 덤프나 CI 아티팩트에는 여전히 평문 값이 남는 경우가 많기 때문이다. 이것이 day1의 시크릿 관리와 오늘의 Macie가 한 주에 묶여 있는 이유다 — **시크릿을 잘 관리하는 것과, 그것이 어딘가로 새어 나가지 않았는지 확인하는 것은 별개의 통제다.** 전자만 하고 후자를 빼면 "우리는 시크릿을 안전하게 관리한다"는 믿음만 남고 실제 노출은 방치된다.

### 비용을 통제하며 운영하기

Macie는 스캔한 데이터 양에 비례해 과금되므로, 무차별 전수 스캔은 곧바로 비용 문제가 된다. 운영 순서는 다음과 같이 잡는다.

```bash
# 1단계: 자동 민감 데이터 탐지 — 전체 자산을 샘플링해 지도를 먼저 그린다
aws macie2 update-automated-discovery-configuration --status ENABLED

# 2단계: 위험이 높은 버킷만 표적 job으로 정밀 스캔
aws macie2 create-classification-job \
  --job-type SCHEDULED \
  --schedule-frequency '{"weeklySchedule":{"dayOfWeek":"MONDAY"}}' \
  --name "weekly-pii-scan-prod" \
  --s3-job-definition '{
    "bucketDefinitions":[{"accountId":"111122223333","buckets":["prod-uploads"]}],
    "scoping":{"includes":{"and":[
      {"simpleScopeTerm":{"comparator":"STARTS_WITH","key":"OBJECT_KEY","values":["uploads/"]}}
    ]}}
  }'

# 3단계: 심각도 높은 finding만 조회해 대응 큐로 넘긴다
aws macie2 list-findings \
  --finding-criteria '{"criterion":{"severity.description":{"eq":["High"]}}}'
```

`scoping`으로 프리픽스·파일 확장자·객체 크기를 걸러 내는 것이 비용 통제의 핵심이다. 이미지나 동영상처럼 텍스트 PII가 있을 리 없는 객체를 스캔 대상에서 빼는 것만으로도 비용이 크게 달라진다.

### Findings와 통합

Macie findings는 두 범주다 — **정책 findings**(버킷이 공개로 바뀜, 암호화 비활성화됨 등 구성 위반)와 **민감 데이터 findings**(객체에서 PII 발견). 이 findings는 **EventBridge로 자동 송출**되어 Lambda 자동 교정(예: 버킷 비공개화)이나 **Security Hub 집계**로 흘러간다.

> 🎯 **시나리오**: "민감 데이터가 공개 S3 버킷에 들어가면 즉시 탐지하고 자동으로 비공개 처리하라"가 나오면: Macie가 민감 데이터/정책 finding 생성 → EventBridge 규칙이 finding 캐치 → Lambda가 BPA 적용·버킷 정책 교정. Macie 단독으로는 *탐지*만 하고, *대응 자동화*는 EventBridge+Lambda(또는 Security Hub+자동화)로 연결한다.

```
[ 탐지 → 대응 배선 ]

  Macie (민감 데이터 / 정책 finding)
        │
        ├──────────────→ Security Hub  ──→ 멀티계정 집계·대시보드·심각도 정규화
        │
        └── EventBridge 규칙 (severity=High && type=Policy:*S3BucketPublic)
                  │
                  ├─→ Lambda: PutPublicAccessBlock + 버킷 정책 교정
                  ├─→ SNS: 보안팀 알림
                  └─→ Step Functions: 승인 게이트가 필요한 조치는 사람 확인 후 실행

  ※ 자동 교정은 "되돌릴 수 있는 조치"에만 건다.
     버킷 비공개화는 되돌릴 수 있지만, 객체 삭제는 되돌릴 수 없다 → 삭제는 자동화 금지.
```

자동 교정 설계에서 가장 중요한 원칙은 **되돌릴 수 있는 조치만 자동화한다**는 것이다. BPA를 켜는 것은 잘못 발동해도 정책을 다시 열면 되지만, 객체를 삭제하거나 역할을 지우는 조치가 오탐으로 발동하면 그것 자체가 사고가 된다. 위험한 조치는 Step Functions의 승인 단계나 티켓 생성으로 사람을 경유시킨다.

### 멀티계정에서의 Macie

조직 규모에서는 계정마다 Macie를 켜고 결과를 각자 보는 방식이 성립하지 않는다. Organizations에 **위임 관리자(delegated administrator)**를 지정해 중앙에서 모든 멤버 계정의 S3를 스캔·집계한다. 새 계정이 조직에 합류하면 자동으로 Macie가 활성화되도록 설정할 수도 있다. GuardDuty·Security Hub·Config가 모두 같은 위임 관리자 패턴을 쓰므로, 이 구조를 한 번 이해하면 여러 서비스에 그대로 적용된다.

```bash
# 조직 관리 계정에서 보안 계정을 Macie 위임 관리자로 지정
aws macie2 enable-organization-admin-account --admin-account-id 999988887777

# 위임 관리자 계정에서: 신규 멤버 계정 자동 활성화
aws macie2 update-organization-configuration --auto-enable
```

> 🔍 **더 깊이**: Macie가 객체를 스캔하려면 그 객체를 복호화할 수 있어야 한다. SSE-S3나 SSE-KMS(Macie 서비스 역할이 `kms:Decrypt` 권한을 가진 경우) 객체는 스캔되지만, **SSE-C로 암호화된 객체와 클라이언트 측에서 암호화된 객체는 Macie가 읽을 수 없다** — 키가 AWS에 없기 때문이다. 압축 파일이나 아카이브는 지원되는 형식에 한해 내부까지 들여다보고, 지원되지 않는 형식은 건너뛴다. 즉 "Macie를 켰으니 우리 S3의 민감 데이터를 전부 안다"는 결론은 성립하지 않는다. 무엇이 스캔되지 않았는지(암호화 방식·파일 형식·스코핑에서 제외된 범위)를 아는 것이 스캔 결과를 읽는 것만큼 중요하다.

> ⚠️ **함정**: Macie는 **S3 전용**이다. RDS, DynamoDB, EBS 안의 민감 데이터는 스캔하지 못한다. "DB 안의 PII 탐지"가 나오면 Macie는 오답이다. 또한 Macie는 객체를 샘플링·스캔하므로 **비용**이 데이터 양에 비례한다 — 전체 버킷을 무차별 스캔하기보다 민감할 가능성이 높은 버킷을 표적으로 잡고, 자동 탐지(sampling) 기능으로 비용을 통제한다.

## ACM과 Macie를 함께 보는 관점

두 서비스는 데이터 보호의 양 끝을 맡는다. ACM은 데이터가 *이동하는 채널*(TLS)을 신뢰 가능하게 하고, Macie는 데이터가 *머무는 곳*(S3)에 무엇이 있는지 가시화한다. 종합 방어에서는 Macie로 "여기 카드번호가 있다"를 발견하고 → 그 버킷에 SSE-KMS·Object Lock·BPA를 적용하고 → 접근은 ACM 기반 HTTPS로만 → VPC 엔드포인트로 경로를 제한한다. 이것이 week6 전체가 그리는 시크릿·스토리지·민감데이터 보호의 통합 그림이며, day5에서 시나리오로 엮는다.

> 🔍 **더 깊이**: Macie의 자동 민감 데이터 탐지(automated sensitive data discovery)는 전체 S3 자산을 *지속적으로 샘플링*해 조직 전반의 민감 데이터 분포를 히트맵으로 보여준다 — 일회성 job과 달리 상시 운영되며 비용 효율적이다. 한편 멀티계정 환경에서는 Macie를 **위임 관리자(delegated administrator)**로 Organizations에 통합해 모든 계정의 S3를 중앙에서 스캔·집계한다. GuardDuty·Security Hub와 같은 멀티계정 패턴이다.

> 🎯 **시나리오**: "여러 계정의 S3에 규제 대상 개인정보가 어디에 얼마나 있는지 파악하고, 새로 만들어지는 계정도 자동으로 포함시켜라"가 나오면 조합은 **Organizations + Macie 위임 관리자 + auto-enable + 자동 민감 데이터 탐지**다. 계정마다 개별 job을 만드는 답은 규모 확장성이 없어 오답이고, Config 규칙은 객체 내용을 보지 못하므로 "무엇이 들어 있는가"에 답할 수 없다.

## 한 줄 요약

ACM과 Macie는 데이터 보호의 반대편 끝을 붙잡는다. **ACM은 데이터가 지나가는 채널의 신뢰**를 자동화한다 — 핵심 판단은 DNS 검증(무인 갱신 가능) 대 Email·가져온 인증서(불가), 그리고 개인키를 꺼낼 수 없다는 제약에서 오는 "EC2 직접 설치는 Private CA, 통합 서비스는 퍼블릭 인증서"라는 갈림길이다. **Macie는 데이터가 머무는 곳의 가시성**을 만든다 — S3 한정이라는 경계, 탐지만 하고 대응은 EventBridge·Lambda로 잇는다는 역할 분담, 그리고 비용은 스코핑으로 통제한다는 운영 원칙이 요점이다. 보이지 않는 것은 보호할 수 없고, 신뢰할 수 없는 채널로는 보호된 데이터도 안전하게 옮길 수 없다.

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스에서 직접 TLS를 종단하려 한다. ACM 퍼블릭 인증서를 EC2에 설치하려 했으나 불가능하다. 가장 적절한 대안은?

A) ACM 퍼블릭 인증서의 개인키를 export해 EC2에 복사한다  
B) ALB를 EC2 앞에 두고 ALB에서 ACM 인증서로 TLS를 종단하거나, AWS Private CA에서 발급한 인증서를 export해 EC2에 설치한다  
C) 인증서를 us-east-1에서 발급하면 EC2에 설치된다  
D) Macie로 인증서를 배포한다  

**정답: B**  
해설: ACM 퍼블릭 인증서는 개인키를 내보낼 수 없어 EC2에 직접 설치할 수 없다. 통합 서비스인 ALB/CloudFront/API Gateway에 배포하거나, EC2에서 직접 종단해야 한다면 Private CA가 발급한(export 가능한) 인증서를 설치한다. 퍼블릭 인증서 키는 어떤 리전에서 발급해도 export 불가이며, Macie는 인증서 배포와 무관하다.

---

**문제 2.** 인증서 자동 갱신이 조용히 실패해 만료로 인한 장애가 반복된다. 재발 방지에 가장 적절한 조합은?

A) Email 검증으로 전환하고 갱신마다 수동 확인  
B) DNS 검증을 사용해 무인 자동 갱신을 가능하게 하고, EventBridge/CloudWatch DaysToExpiry로 만료 임박을 경보한다  
C) 인증서를 매년 수동 재발급  
D) 인증서를 Secrets Manager에 저장  

**정답: B**  
해설: DNS 검증은 CNAME 레코드가 지속 존재하므로 ACM이 무인으로 도메인 통제를 재확인해 자동 갱신할 수 있다. 추가로 EventBridge 이벤트나 CloudWatch DaysToExpiry 메트릭으로 만료 임박·갱신 실패를 경보하면 조용한 실패를 막는다. Email 검증·수동 재발급은 자동화에 역행하고, Secrets Manager는 ACM 갱신과 무관하다.

---

**문제 3.** "우리 프로덕션 S3 버킷 어딘가에 평문 신용카드 번호가 저장되어 있는지" 확인하려 한다. 적절한 서비스는?

A) Amazon Macie의 민감 데이터 탐지 작업  
B) AWS Config 규칙  
C) GuardDuty  
D) ACM  

**정답: A**  
해설: Macie는 S3 객체 내용을 스캔해 신용카드 번호 등 민감 데이터를 관리형 식별자로 탐지·분류하고 finding을 생성한다. AWS Config는 리소스 구성 준수를 평가할 뿐 객체 내용을 보지 않고, GuardDuty는 위협 탐지(이상 행위)에 특화되며, ACM은 인증서 관리 서비스다.

---

**문제 4.** RDS 데이터베이스 안에 저장된 PII를 탐지하려 한다. Macie를 쓰려 했으나 적절치 않다. 그 이유는?

A) Macie는 비용이 너무 비싸서  
B) Macie는 S3 전용이며 RDS/DynamoDB/EBS 내부 데이터는 스캔하지 못하기 때문  
C) Macie는 PII를 탐지하지 못하기 때문  
D) Macie는 us-east-1에서만 동작하기 때문  

**정답: B**  
해설: Macie의 민감 데이터 탐지 범위는 S3 객체로 한정된다. RDS·DynamoDB·EBS 안의 데이터는 스캔 대상이 아니므로 "DB 내부 PII 탐지"에는 부적절하다. Macie는 PII 탐지가 주 기능이고 여러 리전에서 동작하며, 비용은 표적 스캔으로 통제할 수 있어 핵심 이유가 아니다.

---

**문제 5.** 민감 데이터가 공개 S3 버킷에 업로드되면 즉시 탐지하고 자동으로 비공개 처리하려 한다. 올바른 아키텍처는?

A) Macie가 단독으로 탐지하고 자동 교정까지 수행한다  
B) Macie가 finding 생성 → EventBridge 규칙이 캐치 → Lambda가 BPA 적용·버킷 정책 교정  
C) ACM이 버킷을 모니터링하고 교정한다  
D) S3 버전 관리가 자동으로 공개를 막는다  

**정답: B**  
해설: Macie는 민감 데이터·정책 finding을 *탐지*하고 EventBridge로 송출하는 역할이며, 자동 *대응*은 EventBridge 규칙이 finding을 받아 Lambda로 BPA 적용·정책 교정을 실행하는 식으로 연결한다. Macie 단독은 교정하지 않고, ACM은 인증서 서비스, 버전 관리는 공개 차단과 무관하다.

---
