# Day 4 - ACM과 Macie: 인증서 수명주기·통합, Macie 민감정보(PII) 탐지·분류

전송 중 암호화(encryption in transit)는 TLS 인증서가 떠받친다. 그리고 저장된 데이터 어디에 민감정보가 숨어 있는지 아는 것은 데이터 보호의 출발점이다. 오늘은 두 서비스를 다룬다 — **AWS Certificate Manager(ACM)**는 TLS 인증서의 발급·갱신·배포를 자동화하고, **Amazon Macie**는 S3에 저장된 데이터에서 PII 같은 민감정보를 머신러닝으로 탐지·분류한다. 전자는 *암호화 채널의 신뢰*를, 후자는 *데이터의 가시성*을 책임진다.

## ACM: 인증서 수명주기 자동화

TLS 인증서 운영의 고전적 사고는 "갱신을 잊어 인증서가 만료되고 서비스가 중단되는" 것이다. ACM의 핵심 가치는 **자동 갱신(managed renewal)**으로 이 위험을 제거하는 것이다.

ACM 인증서는 두 종류다:
- **퍼블릭 인증서**: ACM이 무료로 발급, 공개 신뢰 CA 체인. 인터넷에 면한 엔드포인트용.
- **프라이빗 인증서**: **AWS Private CA**(유료)로 발급, 내부 신뢰 체인. 내부 서비스 간 mTLS 등.

### 도메인 검증: DNS vs Email

퍼블릭 인증서 발급 시 도메인 소유를 증명해야 한다:
- **DNS 검증(권장)**: ACM이 준 CNAME 레코드를 도메인 DNS에 추가하면, ACM이 이를 확인하고 **자동 갱신까지 무인으로** 처리한다. Route 53이면 버튼 한 번으로 레코드를 꽂아준다.
- **Email 검증**: 도메인 등록 연락처로 온 메일의 링크를 클릭. 갱신 시마다 사람이 개입해야 해 자동화가 깨진다.

> 💡 **관련 이론**: DNS 검증이 갱신 자동화의 열쇠인 이유는, CNAME 레코드가 *지속적으로 존재*하기 때문이다. ACM은 갱신 시점에 그 레코드의 존재를 다시 확인해 도메인 통제가 유지됨을 증명한다. Email 검증은 일회성 증명이라 갱신 때마다 재증명이 필요하다. 즉 "지속 가능한 소유 증명"이 무인 갱신을 가능케 한다. PKI의 신뢰는 키 소유뿐 아니라 *도메인 통제의 지속성*에 기댄다.

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
```

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

### Findings와 통합

Macie findings는 두 범주다 — **정책 findings**(버킷이 공개로 바뀜, 암호화 비활성화됨 등 구성 위반)와 **민감 데이터 findings**(객체에서 PII 발견). 이 findings는 **EventBridge로 자동 송출**되어 Lambda 자동 교정(예: 버킷 비공개화)이나 **Security Hub 집계**로 흘러간다.

> 🎯 **시나리오**: "민감 데이터가 공개 S3 버킷에 들어가면 즉시 탐지하고 자동으로 비공개 처리하라"가 나오면: Macie가 민감 데이터/정책 finding 생성 → EventBridge 규칙이 finding 캐치 → Lambda가 BPA 적용·버킷 정책 교정. Macie 단독으로는 *탐지*만 하고, *대응 자동화*는 EventBridge+Lambda(또는 Security Hub+자동화)로 연결한다.

> ⚠️ **함정**: Macie는 **S3 전용**이다. RDS, DynamoDB, EBS 안의 민감 데이터는 스캔하지 못한다. "DB 안의 PII 탐지"가 나오면 Macie는 오답이다. 또한 Macie는 객체를 샘플링·스캔하므로 **비용**이 데이터 양에 비례한다 — 전체 버킷을 무차별 스캔하기보다 민감할 가능성이 높은 버킷을 표적으로 잡고, 자동 탐지(sampling) 기능으로 비용을 통제한다.

## ACM과 Macie를 함께 보는 관점

두 서비스는 데이터 보호의 양 끝을 맡는다. ACM은 데이터가 *이동하는 채널*(TLS)을 신뢰 가능하게 하고, Macie는 데이터가 *머무는 곳*(S3)에 무엇이 있는지 가시화한다. 종합 방어에서는 Macie로 "여기 카드번호가 있다"를 발견하고 → 그 버킷에 SSE-KMS·Object Lock·BPA를 적용하고 → 접근은 ACM 기반 HTTPS로만 → VPC 엔드포인트로 경로를 제한한다. 이것이 week6 전체가 그리는 시크릿·스토리지·민감데이터 보호의 통합 그림이며, day5에서 시나리오로 엮는다.

> 🔍 **더 깊이**: Macie의 자동 민감 데이터 탐지(automated sensitive data discovery)는 전체 S3 자산을 *지속적으로 샘플링*해 조직 전반의 민감 데이터 분포를 히트맵으로 보여준다 — 일회성 job과 달리 상시 운영되며 비용 효율적이다. 한편 멀티계정 환경에서는 Macie를 **위임 관리자(delegated administrator)**로 Organizations에 통합해 모든 계정의 S3를 중앙에서 스캔·집계한다. GuardDuty·Security Hub와 같은 멀티계정 패턴이다.

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
