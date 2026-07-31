# Day 5 - Week 6 종합: 시크릿·스토리지·민감데이터 시나리오 통합 복습

이번 주는 데이터 보호의 두 번째 축 — 시크릿(Secrets Manager), 스토리지 보안(S3 암호화·접근통제·노출방지), 인증서(ACM), 민감정보 분류(Macie) — 를 다뤘다. 오늘은 개별 서비스를 *시나리오*로 엮어, 시험이 실제로 묻는 방식(여러 통제를 조합해 하나의 요구를 충족시키기)으로 복습한다. 핵심은 "각 서비스가 무엇을 하느냐"가 아니라 "어떤 요구에 어떤 조합이 정답이냐"다.

## 통합 멘탈 모델: 데이터 보호의 4층

```
[1. 발견·분류]  Macie → "어디에 무엇이 있는가" (민감도 라벨링)
       ↓
[2. 저장 암호화] SSE-KMS / DSSE-KMS / Object Lock → "정지 상태 보호 + 불변성"
       ↓
[3. 접근 통제]  버킷 정책 / Access Point / BPA / VPC 엔드포인트 → "누가·어디서 접근"
       ↓
[4. 채널·시크릿] ACM(TLS) + Secrets Manager(자격증명 회전) → "전송 보호 + 자격증명 수명주기"
```

> 💡 **관련 이론**: 이 4층은 *심층 방어(defense in depth)*의 데이터 평면 구현이다. 어느 한 층이 뚫려도(예: 자격증명 탈취) 다음 층이 막는다 — 탈취된 키로 S3에 접근해도 KMS 키 정책이 복호화를 거부하고(2층), VPC 엔드포인트 조건이 외부 경로를 차단하며(3층), Object Lock Compliance가 데이터 삭제를 물리적으로 막는다(2층). 단일 통제에 의존하지 않고 *독립적으로 실패하는 여러 통제*를 겹치는 것이 핵심이다.

### 통제를 배치하는 전체 그림

```
                        ┌──────────── 조직 경계 (Organizations) ────────────┐
                        │  SCP: 계정 전체의 권한 상한                        │
                        │  aws:PrincipalOrgID / aws:ResourceOrgID           │
                        └───────────────────┬───────────────────────────────┘
                                            │
   [발견]        Macie ──finding──→ EventBridge ──→ Lambda 자동 교정
                 IAM Access Analyzer ──외부 노출 리소스 목록
                                            │
   [경로]        VPC 엔드포인트(정책) ──→ S3 / Secrets Manager / KMS
                 aws:SourceVpce Deny 로 다른 경로 차단
                                            │
   [인가]        IAM ∩ 버킷정책 ∩ AP정책      (명시적 Deny 우선)
                                            │
   [암호화]      SSE-KMS(+Bucket Key) / DSSE-KMS   ← KMS 키 정책 = 2차 관문
                 Secrets Manager(CMK) ← 회전 Lambda만 Decrypt
                                            │
   [불변성]      버전 관리 → Object Lock → 별도 백업 계정
                                            │
   [증거]        CloudTrail 관리/데이터 이벤트 · 서버 액세스 로그 · Security Hub
```

이 그림에서 층 사이를 이어 주는 접착제가 **조건 키**와 **EventBridge**다. 조건 키는 정적 통제를 서로 물리게 하고(암호화 없는 업로드 거부, VPC 밖 접근 거부), EventBridge는 탐지와 대응을 동적으로 잇는다. 시험 시나리오는 대부분 "이 그림의 어느 층이 비어 있는가"를 묻는 문제로 환원된다.

> 📚 **사례**: 2019년 Capital One 침해를 이 4층 모델에 대입해 보면 각 층이 왜 필요한지가 선명해진다. 공격자는 SSRF로 EC2 메타데이터에서 역할 자격증명을 얻어 S3 데이터를 읽어 갔다. 버킷은 공개가 아니었고 데이터는 암호화되어 있었지만, *정당한 권한을 가진 주체의 정상 API 호출*이었기 때문에 3층(접근 통제)이 그대로 열렸다. 이 사건을 week6의 통제로 되짚으면 이렇게 된다 — 역할에 부여된 S3 권한이 최소였다면 읽을 수 있는 범위가 좁았을 것이고(3층), SSE-KMS 키 정책이 그 역할의 `kms:Decrypt`를 허용하지 않았다면 복호화에서 막혔을 것이며(2층), 버킷 정책에 `aws:SourceVpce` 조건이 있었다면 그 경로가 애초에 성립하지 않았을 것이고(3층), CloudTrail S3 데이터 이벤트가 켜져 있었다면 대량 읽기를 훨씬 빨리 알아챘을 것이다(가시성). 어느 한 층만 있어도 피해가 줄었을 상황이며, 이것이 심층 방어가 "여러 개를 겹치면 좋다"가 아니라 **"하나가 뚫릴 것을 전제로 설계한다"**는 뜻인 이유다.

## 시나리오 1: 회전되는 DB 자격증명 + 무중단

**요구**: RDS 마스터 비밀번호를 30일마다 자동 회전하되 인증 실패 0건. 회전 Lambda는 프라이빗 서브넷 DB에 접근.

**조합**:
- Secrets Manager + alternating-users 회전 전략 → 무중단
- 회전 Lambda를 DB와 같은 VPC에 배치 + Secrets Manager용 VPC 엔드포인트(또는 NAT) → API 호출 경로 확보
- CMK로 시크릿 암호화 → 키 정책으로 회전 Lambda 역할만 Decrypt 허용
- 애플리케이션은 캐싱 클라이언트로 GetSecretValue 호출 최소화

> ⚠️ **함정 정리**: single-user는 순간 인증 실패 가능 → alternating-users + 마스터 시크릿 참조. 회전 Lambda가 VPC 안에서 Secrets Manager에 닿지 못하면 회전이 타임아웃. ARN 정책은 `-*` 접미사 와일드카드 필요.

**진단 순서**(회전이 조용히 실패할 때):

```
1. CloudTrail: RotationFailed 이벤트가 있는가?  → 없으면 회전이 아예 트리거되지 않음
2. Lambda 로그: 어느 step에서 예외인가?
      createSecret / finishSecret 실패 → Lambda ↔ Secrets Manager 경로·권한
      setSecret / testSecret 실패      → Lambda ↔ DB 경로·DB 사용자 권한
3. 권한 확인: PutSecretValue, UpdateSecretVersionStage, kms:Decrypt/GenerateDataKey
4. 네트워크 확인: 인터페이스 VPC 엔드포인트 + 프라이빗 DNS + SG 443
```

```bash
aws secretsmanager describe-secret --secret-id prod/db/mysql \
  --query '{Enabled:RotationEnabled,Last:LastRotatedDate,Next:NextRotationDate}'
aws secretsmanager rotate-secret --secret-id prod/db/mysql --rotate-immediately
```

## 시나리오 2: 규제 데이터의 불변 보관

**요구**: 감사 로그를 7년간 보관하되 루트 계정조차 삭제 불가. 이중 암호화 규제 적용.

**조합**:
- 버전 관리 + Object Lock **Compliance 모드**(7년) → 루트도 삭제 불가
- **DSSE-KMS** → 이중 암호화 규제 충족
- 버킷 정책에 `aws:SecureTransport:false` Deny → 전송 보호
- MFA Delete는 Compliance 모드와 중복(Compliance가 이미 절대 불변)

> 🎯 핵심 구분: "권한자도 우회 가능해야 함(운영 유연성)" → Governance. "누구도 절대 불가" → Compliance. "이중 암호화 규제" → DSSE-KMS(아니면 SSE-KMS).

여기에 한 겹을 더 얹으면 랜섬웨어까지 커버된다. 백업을 **별도 계정**에 두고 그 계정에서 Object Lock을 거는 것이다. 운영 계정이 완전히 장악되어도 백업 계정의 보존된 버전은 손댈 수 없다.

```
프로덕션 계정 A                     백업 계정 B (자격증명 경계 분리)
┌──────────────┐  교차계정 복제     ┌───────────────────────────┐
│ 운영 버킷     │ ─────────────────→ │ 백업 버킷                  │
│ 버전 관리 ON  │                   │ 버전 관리 + Object Lock     │
└──────────────┘                   │ COMPLIANCE + MFA Delete    │
                                   │ 계정 A에 삭제 권한 없음      │
                                   └───────────────────────────┘
```

> ⚠️ **함정 정리**: Object Lock은 **버킷 생성 시점**에 켜야 한다(사후 활성화는 예외적 절차). 버전 관리가 전제이며, 보존 기간 내 객체는 **수명주기 정책으로도 삭제되지 않는다** — 보존과 비용 최적화가 충돌하면 보존이 이긴다. Compliance는 기간 **연장만** 가능하고 단축·해제가 불가하므로, 검증은 Governance로 하고 프로덕션만 Compliance로 넘긴다.

## 시나리오 3: 데이터 유출 방지(exfiltration)

**요구**: 회사 기밀 버킷의 데이터가 회사 VPC 밖으로 절대 나가지 못하게 한다.

**조합**:
- S3 게이트웨이 VPC 엔드포인트 생성
- 버킷 정책: `aws:SourceVpce` StringNotEquals Deny → 지정 엔드포인트 외 모든 경로 차단
- VPC 엔드포인트 정책: `aws:ResourceOrgID` 조건 → 이 엔드포인트는 우리 조직 버킷으로만
- 양방향 봉쇄로 *데이터 경계(data perimeter)* 구축

> 💡 데이터 경계는 신뢰 신원(PrincipalOrgID) + 신뢰 자원(ResourceOrgID) + 신뢰 네트워크(SourceVpce)의 조합이다. 하나만으로는 불완전하다.

세 축을 각각 무엇이 막는지 분리해서 기억하면 오답을 피할 수 있다.

| 축 | 막는 것 | 막지 못하는 것 | 조건 키 |
|----|---------|----------------|---------|
| 신뢰 신원 | 외부 계정이 우리 버킷을 읽는 것 | 우리 직원이 외부 버킷으로 복사하는 것 | `aws:PrincipalOrgID` |
| 신뢰 자원 | 우리 주체가 외부 버킷에 쓰는 것 | 외부에서 우리 버킷으로 들어오는 것 | `aws:ResourceOrgID`, `s3:ResourceAccount` |
| 신뢰 네트워크 | 통제 밖 경로로 오가는 것 | 통제된 경로 안에서의 오남용 | `aws:SourceVpce`, `aws:SourceIp` |

버킷 정책 쪽(들어오는 것을 거른다)과 VPC 엔드포인트 정책·SCP 쪽(나가는 것을 거른다)을 함께 걸어야 양방향이 닫힌다.

```json
{
  "Sid": "EndpointAllowsOnlyOrgBuckets",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceOrgID": "o-abcd1234ef",
      "aws:PrincipalOrgID": "o-abcd1234ef"
    }
  }
}
```

> ⚠️ **함정**: 조직 경계 Deny를 걸 때 **AWS 서비스 주체 예외**를 빼먹으면 CloudTrail 로그 전달, S3 복제, Config 스냅샷 같은 정당한 경로가 함께 끊긴다. `aws:PrincipalIsAWSService`를 `BoolIfExists`로 함께 평가해 서비스 주체를 제외하는 것이 실무의 정석이다. 또한 VPC 엔드포인트를 경유하는 요청에는 퍼블릭 소스 IP가 없으므로 `aws:SourceIp` 조건이 매칭되지 않는다 — 사무실 IP 화이트리스트와 VPC 엔드포인트 조건은 별도 Statement로 나눠 열어야 한다.

## 시나리오 4: 고트래픽 + KMS 비용·스로틀

**요구**: SSE-KMS 버킷에서 KMS ThrottlingException, 비용 급증.

**조합**: **S3 Bucket Key 활성화** — 객체별 KMS 호출을 버킷 수준 키 파생으로 대체해 호출 99% 감소. (DSSE-KMS는 Bucket Key 비호환이므로 이 경우 부적합.)

## 시나리오 5: 민감 데이터 발견 → 자동 대응

**요구**: 공개 버킷에 PII가 업로드되면 즉시 탐지·비공개화.

**조합**:
- Macie 민감 데이터 탐지 + 버킷 보안 자세 평가 → finding 생성
- EventBridge 규칙이 finding 캐치 → Lambda가 BPA 적용·정책 교정
- Security Hub로 멀티계정 집계
- (Macie는 S3 전용 — DB PII는 대상 아님)

## 시나리오 6: 교차계정 시크릿 + 인증서

**요구**: 계정 B 앱이 계정 A 시크릿을 읽고, 앱은 ACM 인증서로 HTTPS 서빙.

**조합**:
- 시크릿: CMK 암호화 + 리소스 정책(계정 B 허용) + KMS 키 정책(계정 B Decrypt) + 계정 B IAM 정책 → 세 정책 교집합
- TLS: ALB + ACM 퍼블릭 인증서(DNS 검증, 자동 갱신). CloudFront면 us-east-1 발급.

```
[ 세 관문 ]
계정 B 역할 ──GetSecretValue──→ ┌ 계정 B IAM 정책
                                ├ 계정 A 시크릿 리소스 정책
                                └ 계정 A CMK 키 정책 (kms:Decrypt)
  오류가 KMS를 가리키면 세 번째, Secrets Manager를 가리키면 앞의 둘.
```

## 시나리오 7: 정적 사이트를 공개 없이 서비스

**요구**: 정적 웹사이트를 인터넷에 제공하되 S3 버킷은 절대 공개하지 않는다.

**조합**:
- BPA 4개 스위치 유지 + Object Ownership `BucketOwnerEnforced`
- CloudFront + **OAC**(Origin Access Control)로 오리진 접근
- 버킷 정책은 `cloudfront.amazonaws.com` 서비스 주체를 허용하되 `AWS:SourceArn` 조건으로 **특정 배포**만 한정

> ⚠️ `AWS:SourceArn` 조건을 빼면 아무 CloudFront 배포나 이 버킷을 오리진으로 삼을 수 있는 혼동된 대리자(confused deputy) 문제가 생긴다. 신규 구성에서 구형 OAI를 고르는 답은 오답이다(OAC가 SSE-KMS 오리진을 지원한다).

## 시나리오 8: 이미 저장된 수백만 객체를 SSE-KMS로 전환

**요구**: 기존 SSE-S3 객체 전량을 특정 CMK 기반 SSE-KMS로 바꾼다.

**조합**:
- 버킷 기본 암호화를 SSE-KMS로 변경 → **앞으로 들어올 객체에만** 적용
- 기존 객체는 **S3 Batch Operations의 Copy 작업**으로 전량 재작성
- 이후 재발 방지를 위해 버킷 정책에 조건부 Deny(SSE-KMS 아니면 거부 + 지정 키 아니면 거부)
- 고트래픽이면 Bucket Key 함께 활성화

> ⚠️ "기본 암호화를 바꾸면 기존 객체도 자동 전환된다"는 보기는 오답이다. 암호화 방식은 객체를 **다시 쓸 때** 결정된다.

## 시나리오 9: 같은 데이터를 역할별로 다른 민감도로 제공

**요구**: 분석팀에는 개인정보를 마스킹한 결과를, 감사팀에는 원본을 제공한다. 데이터 사본은 늘리지 않는다.

**조합**:
- **S3 Object Lambda Access Point** — GetObject 응답을 Lambda가 변형해 마스킹
- 분석팀 역할은 Object Lambda AP만, 감사팀 역할은 표준 AP를 통해 접근
- 버킷 정책은 `s3:DataAccessPointArn`이 `Null`인 직접 접근을 Deny해 우회를 차단

> 🎯 "데이터를 두 벌로 복사해 하나를 마스킹한다"는 답은 사본이 늘어 유출면과 정합성 문제가 커지므로 열등하다.

## 시나리오 10: 유출된 자격증명에 대한 즉각 대응

**요구**: 개발자 계정 침해 정황. 시크릿과 데이터에 대한 대응 순서를 정하라.

**조합(순서가 답이다)**:
1. 의심 주체의 권한 차단 — 역할 신뢰 정책 수정·세션 무효화
2. 노출 가능성이 있는 **시크릿 즉시 회전**(`rotate-secret --rotate-immediately`)
3. CloudTrail로 실제 조회·다운로드 범위 확정(S3는 **데이터 이벤트**가 켜져 있어야 확인 가능)
4. 대상 서비스(DB 등) 기존 세션 강제 종료, 필요 시 KMS 키 정책으로 복호화 주체 축소

> ⚠️ "시크릿을 삭제한다"는 오답이다. 삭제는 복구 대기 기간 때문에 즉시 효과가 없고 애플리케이션만 멈춘다. **유출의 해독제는 삭제가 아니라 회전이다.**

## 로그·핀딩을 읽는 관점

시나리오 문항의 절반은 "무엇을 켜 두었어야 했는가"를 묻는다. 도구별 답하는 질문을 헷갈리지 않는 것이 관건이다.

| 도구 | 답하는 질문 | 기본값 |
|------|-------------|--------|
| CloudTrail 관리 이벤트 | 버킷 정책·BPA·암호화 설정을 누가 언제 바꿨나 | 켜짐 |
| CloudTrail **데이터 이벤트** | 어떤 객체를 누가 읽어 갔나 | **꺼짐**(별도 설정·과금) |
| S3 서버 액세스 로그 | 어떤 요청이 어떤 응답 코드를 받았나 | 꺼짐 |
| IAM Access Analyzer | 조직 밖에서 접근 가능한 리소스가 있나 | 별도 활성화 |
| AWS Config | 구성이 규칙을 지키고 있나(암호화·BPA 등) | 별도 활성화 |
| GuardDuty | 접근 패턴이 평소와 다른가 | 별도 활성화 |
| Macie | 그 안에 민감 데이터가 있나 | 별도 활성화 |

> 🎯 **시나리오**: "데이터 유출이 의심된다. 어떤 객체가 실제로 유출됐는지 확인하라"가 나오면, 정답의 전제는 **CloudTrail S3 데이터 이벤트**다. 켜 두지 않았다면 "정책이 언제 바뀌었는가"까지만 알 수 있고 "무엇이 읽혔는가"는 영원히 알 수 없다. 비용 때문에 전 버킷에 켜지 말고 민감 버킷·프리픽스로 범위를 좁히는 것이 정답 패턴이다.

## 빠른 결정 표

| 요구 키워드 | 정답 |
|------------|------|
| DB 비밀번호 자동 회전 | Secrets Manager + Lambda 회전 |
| 무중단 회전 | alternating-users 전략 |
| 회전 불필요·비용 최소 단순 비밀 | Parameter Store SecureString |
| 교차계정 시크릿 | CMK + 리소스 정책 + KMS 키 정책 |
| 키 접근 분리·감사 필요 | SSE-KMS |
| 이중 암호화 규제 | DSSE-KMS |
| AWS에 키 안 맡김 | SSE-C |
| KMS 비용·스로틀 완화 | S3 Bucket Key |
| 루트도 삭제 불가 보존 | Object Lock Compliance |
| 권한자 우회 허용 보존 | Object Lock Governance |
| 의도치 않은 공개 차단 | Block Public Access |
| 특정 키만 암호화 강제 | 버킷 정책 조건부 Deny |
| HTTPS 강제 | aws:SecureTransport:false Deny |
| VPC 밖 유출 방지 | aws:SourceVpce Deny + 엔드포인트 정책 |
| 거대 버킷 정책 분할 | S3 Access Point |
| 외부 노출 버킷 상시 탐지 | IAM Access Analyzer |
| S3 PII 탐지·분류 | Macie |
| TLS 인증서 무인 갱신 | ACM + DNS 검증 |
| EC2 직접 TLS 종단 | ALB+ACM 또는 Private CA export |
| 외부 CA 인증서를 ACM에 올림 | 자동 갱신 **안 됨** — 만료 모니터링 필수 |
| mTLS·IoT 디바이스 인증서 | Private CA + CRL/OCSP 폐기 |
| 공개 없이 정적 사이트 서빙 | CloudFront + OAC(+ `AWS:SourceArn` 조건) |
| 기존 객체 암호화 방식 전환 | S3 Batch Operations Copy |
| 역할별 마스킹된 뷰 제공 | S3 Object Lambda Access Point |
| 직접 버킷 접근 차단(AP 강제) | `s3:DataAccessPointArn` Null Deny |
| 어떤 객체가 읽혔는지 추적 | CloudTrail **데이터 이벤트**(사전 활성화) |
| 자격증명 유출 대응 | 삭제가 아니라 **즉시 회전** |
| 백업까지 지워지는 랜섬웨어 | 별도 계정 + Object Lock + 버전 관리 |
| 조직 밖 계정으로의 데이터 반출 | `aws:ResourceOrgID`(엔드포인트 정책·SCP) |
| 정책 Deny 걸 때 서비스 주체 예외 | `aws:PrincipalIsAWSService` BoolIfExists |

### 헷갈리는 짝 정리

| 짝 | 가르는 한 마디 |
|----|---------------|
| SSE-KMS vs DSSE-KMS | 문항에 "두 개의 독립된 암호화 계층" 규제 문구가 있는가 |
| Governance vs Compliance | "권한자도 우회 불가·루트 포함"인가 |
| single vs alternating | "인증 실패 0건·무중단"인가 |
| Secrets Manager vs Parameter Store | 회전·교차계정이 필요한가, 비용이 우선인가 |
| Access Analyzer vs Macie | 노출 *경로*를 묻는가, 데이터 *내용*을 묻는가 |
| Config vs GuardDuty | 구성 준수인가, 이상 행위인가 |
| BPA vs 버킷 정책 | 공개 차단(가드레일)인가, 세밀한 인가인가 |
| OAC vs OAI | 신규 구성이면 항상 OAC(SSE-KMS 오리진 지원) |
| `StringNotEquals` vs `...IfExists` | 헤더가 **없을 때** 거부해야 하는가 아닌가 |

> 🔍 **더 깊이**: 시험의 함정은 대개 "비슷하지만 미묘하게 틀린" 보기다. SSE-KMS vs DSSE-KMS(이중 암호화 규제 키워드 유무), Governance vs Compliance(우회 가능 여부), single vs alternating(무중단 여부), Macie의 S3 한정(DB는 오답), ACM 퍼블릭 인증서의 EC2 직접 설치 불가, CloudFront 인증서의 us-east-1 발급 — 이 경계들을 정확히 구분하는 것이 합격선과 불합격선을 가른다. "무엇을 하는가"는 모두가 알지만, "언제 이것이고 언제 저것인가"가 Specialty의 깊이다.

## 한 줄 요약

이번 주의 모든 통제는 하나의 질문으로 수렴한다 — **"이 층이 뚫렸을 때 다음은 무엇이 막는가?"** 시크릿은 회전으로 유출의 유효 수명을 줄이고, 암호화는 KMS 키 정책이라는 두 번째 인가 관문을 만들고, 접근 통제는 조건부 Deny로 경로와 방식을 못 박고, 불변성은 권한이 완전히 무너진 뒤에도 데이터를 남기고, 가시성은 이 모두가 실패했을 때 무슨 일이 일어났는지 답한다. 시험이 시나리오로 묻는 것도 결국 이것이다 — 요구 문장에서 *어느 층이 비어 있는지*를 찾고, 그 층을 채우는 통제를 고르는 일. 서비스 이름을 외우는 사람은 비슷한 보기 앞에서 흔들리지만, 층을 아는 사람은 흔들리지 않는다.

---

## 📝 연습 문제

**문제 1.** 감사 로그를 7년간 보관해야 하며, 침해로 루트 자격증명이 탈취되더라도 보존 기간 내 삭제가 절대 불가능해야 한다. 또한 규제가 이중 암호화 계층을 요구한다. 올바른 조합은?

A) SSE-S3 + Object Lock Governance + 버전 관리  
B) DSSE-KMS + Object Lock Compliance + 버전 관리  
C) SSE-KMS + MFA Delete + 버전 관리  
D) SSE-C + Object Lock Governance  

**정답: B**  
해설: "루트조차 삭제 불가"는 Object Lock Compliance(버전 관리 전제)가 유일하게 충족하고, "이중 암호화 규제"는 DSSE-KMS가 충족한다. Governance는 우회 권한자가 삭제할 수 있어 부적합하고, MFA Delete는 MFA를 가진 루트가 여전히 삭제 가능하며, SSE-S3/SSE-C는 이중 암호화가 아니다.

---

**문제 2.** 회사 기밀 버킷의 데이터가 회사가 통제하는 VPC 네트워크 밖으로 나가지 못하게 하려 한다. 가장 완전한 조합은?

A) Block Public Access만 활성화  
B) 버킷 정책에 aws:SourceVpce StringNotEquals Deny를 걸고, VPC 엔드포인트 정책에 ResourceOrgID 조건으로 조직 버킷만 허용  
C) SSE-KMS로 암호화  
D) Macie로 버킷을 스캔  

**정답: B**  
해설: 데이터 경계는 양방향 봉쇄로 완성된다 — 버킷 정책은 `aws:SourceVpce`로 "내 버킷은 이 엔드포인트로만" 접근을 강제하고, 엔드포인트 정책은 `aws:ResourceOrgID`로 "이 엔드포인트는 우리 조직 버킷으로만" 향하게 한다. BPA는 공개 차단일 뿐 VPC 경로를 강제하지 못하고, 암호화는 유출 경로를 막지 못하며, Macie는 탐지 도구다.

---

**문제 3.** RDS 마스터 비밀번호를 자동 회전하려는데 회전 Lambda가 프라이빗 서브넷의 DB에 접근해야 하고, 회전 중 인증 실패가 없어야 한다. 누락하면 회전이 실패하는 핵심 요소 두 가지는?

A) alternating-users 전략과, Lambda를 DB VPC에 두고 Secrets Manager VPC 엔드포인트(또는 NAT) 제공  
B) single-user 전략과 공개 서브넷 배치  
C) Parameter Store 전환과 MFA  
D) DSSE-KMS와 Object Lock  

**정답: A**  
해설: 무중단 회전은 alternating-users 전략으로 달성하고, 프라이빗 DB 접근 + Secrets Manager API 호출을 위해 회전 Lambda를 같은 VPC에 두고 Secrets Manager VPC 엔드포인트(또는 NAT)를 제공해야 한다. 둘 중 하나라도 빠지면 회전이 실패하거나 인증 실패가 발생한다. single-user는 순간 실패 위험, Parameter Store는 회전 미지원, DSSE/Object Lock은 회전과 무관하다.

---

**문제 4.** SSE-KMS를 사용하는 매우 높은 트래픽의 버킷에서 KMS ThrottlingException과 비용 급증이 동시에 발생한다. 단, 이중 암호화 규제는 없다. 최적 해결책은?

A) DSSE-KMS로 전환  
B) S3 Bucket Key를 활성화  
C) SSE-C로 전환  
D) 암호화를 비활성화  

**정답: B**  
해설: S3 Bucket Key는 버킷 수준 키를 KMS에서 한 번 받아 객체 데이터 키를 S3가 로컬 파생하므로 KMS 호출을 최대 99% 줄여 스로틀과 비용을 동시에 해결한다. DSSE-KMS는 KMS 호출이 늘고 Bucket Key와 비호환이며, SSE-C는 키 관리 부담이 크고, 암호화 비활성화는 보안 위반이다.

---

**문제 5.** 계정 B의 애플리케이션이 계정 A의 Secrets Manager 시크릿을 읽어야 한다. 어떤 정책 구성이 모두 필요한가?

A) 계정 B의 IAM 정책만  
B) 시크릿 리소스 정책(계정 B 허용) + CMK 키 정책(계정 B Decrypt 허용) + 계정 B IAM 정책(GetSecretValue·Decrypt)  
C) 버킷 정책과 BPA  
D) 시크릿을 AWS 관리형 키로 암호화하고 리소스 정책만  

**정답: B**  
해설: 교차계정 시크릿 접근은 세 정책의 교집합으로 인가된다 — 시크릿 리소스 정책이 계정 B를 허용하고, 시크릿이 CMK로 암호화되어 그 키 정책이 계정 B의 Decrypt를 허용하며, 계정 B IAM 정책이 GetSecretValue와 kms:Decrypt를 부여해야 한다. IAM 정책만으로는 리소스·키 정책이 막고, AWS 관리형 키는 키 정책 편집이 불가해 교차계정 복호화를 허용할 수 없다. 버킷 정책/BPA는 S3 통제로 무관하다.

---
