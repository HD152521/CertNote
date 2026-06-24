# Day 1 - 보안 도메인은 왜 "정책 평가 순서"라는 한 줄의 알고리즘으로 수렴하나

SAA 시험에서 보안 도메인(영역 1)은 전체의 30%로 가장 큰 비중을 차지한다. 그런데 많은 수험생이 이 도메인을 "IAM·KMS·WAF·GuardDuty 같은 서비스 이름 외우기"로 접근하다가 시나리오 문제에서 무너진다. 이유는 단순하다. 시험이 묻는 것은 서비스 이름이 아니라 **"이 요청이 허용되는가, 막히는가, 그리고 왜인가"**라는 판정 문제이기 때문이다. 그리고 그 판정은 거의 항상 하나의 알고리즘 — IAM 정책 평가 로직 — 으로 환원된다. 보안 도메인을 제대로 복습한다는 건 25개 키워드를 서비스에 매핑하는 동시에, 그 매핑 뒤에 깔린 **평가 순서·신뢰 경계·암호화 계층 구조**라는 세 축을 이해하는 것이다.

이 글은 도메인 1을 단순 암기표가 아니라 "요청 하나가 AWS에 도착했을 때 어떤 순서로 검문을 통과하는가"라는 흐름으로 다시 엮는다. 자격 증명(누구인가)에서 시작해 권한 평가(무엇을 할 수 있는가), 암호화(데이터를 어떻게 보호하는가), 네트워크 경계(어디까지 들어올 수 있는가), 그리고 탐지·대응(무엇이 잘못됐는가)까지를 하나의 검문 체인으로 따라간다. 시험의 함정 대부분은 이 체인의 어느 단계가 다른 단계를 이긴다는 **우선순위 규칙**을 헷갈리게 만드는 데서 나온다.

> 💡 **관련 이론**: 보안 설계의 근간에는 정보보안의 고전 모델인 **CIA Triad**(Confidentiality 기밀성·Integrity 무결성·Availability 가용성)가 있다. 이 세 축은 1970년대 미 국방부의 보안 연구에서 정립됐고, 현대 보안 표준의 뿌리다. AWS의 보안 서비스를 이 축에 매핑하면 시야가 잡힌다 — KMS·암호화·IAM은 기밀성, 객체 잠금(Object Lock)·서명·해시는 무결성, Shield·Multi-AZ·백업은 가용성을 담당한다. 여기에 **Defense in Depth**(다층 방어, NSA가 군사 전략에서 차용)와 **Zero Trust**(NIST SP 800-207이 정의한 "절대 신뢰하지 말고 항상 검증하라" 모델)를 겹치면, AWS가 왜 SG·NACL·WAF·IAM을 여러 겹으로 두는지가 설명된다. 단일 방어선이 뚫려도 다음 계층이 막는 구조다.

## IAM 정책 평가는 "명시적 거부가 모든 것을 이긴다"는 단 하나의 규칙으로 시작한다

IAM이 어떤 요청을 허용할지 결정하는 과정은 직관과 다르게 동작한다. 많은 사람이 "Allow가 하나라도 있으면 허용"이라고 생각하지만, 실제 알고리즘은 더 엄격하다. AWS는 요청 하나가 들어오면 **① 명시적 Deny가 있는가 → 있으면 즉시 차단**, ② SCP(조직 가드레일)가 허용하는가, ③ Resource 정책·Permission Boundary·Session 정책의 교집합 안에 있는가, ④ Identity 정책에 명시적 Allow가 있는가를 순서대로 평가한다. 이 중 **명시적 Deny는 그 어떤 Allow보다 우선**한다 — 한 정책이 Allow하고 다른 정책이 Deny하면 결과는 무조건 Deny다. 기본값은 "암묵적 거부(implicit deny)"이고, Allow가 없으면 자동으로 막힌다.

이 평가 순서를 이해하면 도메인 1의 자격·권한 키워드가 한 줄로 정렬된다. **IAM**은 사용자·역할·정책의 본체다. **SCP**(Service Control Policy)는 조직 전체에 씌우는 천장으로, SCP가 막으면 계정 관리자가 Allow를 줘도 소용없다(가드레일). **Permission Boundary**는 개별 사용자/역할의 천장으로, 위임받은 관리자가 자기 권한 이상을 부여하지 못하게 막는 안전장치다. **STS**는 임시 자격증명을 발급하는 엔진이고, 그 위에 직원 SSO용 **IAM Identity Center**, 앱 사용자 로그인용 **Cognito User Pool**(JWT 발급), 그 사용자를 AWS 리소스 접근 가능한 임시 역할로 바꾸는 **Cognito Identity Pool**이 올라간다.

> 🔍 **더 깊이**: EC2가 S3에 접근할 때 액세스 키를 코드에 박지 않는 내부 원리는 **인스턴스 메타데이터 서비스(IMDS)**에 있다. EC2에 IAM Role을 붙이면, AWS는 169.254.169.254라는 링크로컬 주소의 메타데이터 엔드포인트에 임시 자격증명(STS가 발급한 키+세션 토큰, 보통 6시간마다 자동 갱신)을 꽂아 둔다. SDK는 이 엔드포인트를 자동으로 조회해 키를 얻으므로 코드에 비밀이 남지 않는다. 여기서 시험과 실무의 핵심은 **IMDSv2**다 — v1은 단순 HTTP GET이라 SSRF(서버 측 요청 위조) 공격으로 메타데이터를 탈취당할 수 있었지만, v2는 PUT으로 세션 토큰을 먼저 받아야 조회되는 **세션 지향 방식**이라 SSRF로 토큰을 우회하기 어렵다. 2019년 Capital One 사고가 바로 이 IMDSv1 + SSRF 조합으로 1억 건의 고객 데이터가 유출된 사건이라, AWS는 이후 IMDSv2를 기본·강제하는 방향으로 밀고 있다.

> 📚 **사례**: 2019년 7월 Capital One 데이터 유출은 클라우드 보안 역사상 가장 많이 인용되는 사고다. 한 외부 공격자(전직 AWS 직원)가 잘못 구성된 WAF를 통해 SSRF 공격을 성공시켰고, EC2 인스턴스의 IMDSv1에서 IAM Role 임시 자격증명을 빼냈다. 이 자격증명의 권한이 과도하게 넓어(과잉 권한, least privilege 위반) S3 버킷 전체를 읽을 수 있었고, 약 1억 600만 건의 신용카드 신청 정보가 유출됐다. 교훈은 세 겹이다 — ① IMDSv2로 SSRF 경로를 막고, ② IAM Role에 **최소 권한**만 부여하며, ③ 방화벽 설정(WAF/SG) 오류 하나가 전체 체인을 무너뜨린다. SAA 시험이 "EC2는 키 하드코딩 대신 Role"을 반복해서 묻는 이유가 여기 있다.

## 암호화는 "키를 누가 쥐고 있나"라는 봉투 구조로 계층화된다

암호화 키워드가 헷갈리는 이유는 KMS·CloudHSM·Secrets Manager·Parameter Store가 비슷해 보이기 때문이다. 그러나 이들은 **봉투 암호화(envelope encryption)**라는 한 구조 안에서 각자 다른 층을 맡는다. 봉투 암호화란 실제 데이터는 빠른 대칭키(DEK, Data Encryption Key)로 암호화하고, 그 DEK 자체를 다시 마스터키(CMK/KEK)로 암호화해 데이터 옆에 보관하는 방식이다. 데이터를 풀 때는 KMS에 "이 암호화된 DEK를 풀어 달라"고 요청하고, 받은 평문 DEK로 데이터를 복호화한 뒤 즉시 메모리에서 지운다. 이렇게 하면 대용량 데이터를 KMS로 직접 암호화하는 비효율(KMS는 4KB까지만 직접 처리)을 피하면서도, 마스터키는 KMS 밖으로 절대 나오지 않는 안전성을 얻는다.

이 구조에서 각 서비스의 자리가 정해진다. **KMS CMK**는 마스터키를 관리하는 멀티테넌트 서비스다. **CloudHSM**은 FIPS 140-2 Level 3 인증을 받은 전용(single-tenant) 하드웨어 보안 모듈로, 규제상 키를 고객 전용 하드웨어에 둬야 할 때 쓴다. **Secrets Manager**는 DB 비밀번호·API 키를 저장하고 **자동 회전**(Lambda로 주기적 교체)까지 해 주는 게 차별점이다. **Parameter Store**는 구성값과 SecureString을 저장하지만 자동 회전 기능이 없어 더 단순·저렴하다. S3 쪽에서는 **SSE-S3**(AWS 관리 키)와 **SSE-KMS**(고객 KMS 키, 키 정책으로 통제)가 갈리고, KMS 호출 비용이 부담되면 **S3 Bucket Keys**로 호출량을 줄인다.

> 💡 **관련 이론**: 봉투 암호화는 암호학의 **키 계층(key hierarchy)** 원리를 클라우드에 적용한 것이다. 모든 데이터를 하나의 마스터키로 직접 암호화하면 그 키 노출 시 전부 위험하고, 키 회전 시 모든 데이터를 재암호화해야 한다. 반면 DEK를 데이터마다 분리하면 마스터키 회전 시 DEK를 다시 감싸기만 하면 되고(데이터 재암호화 불필요), 마스터키는 HSM/KMS 안에서만 사용돼 노출면이 극소화된다. 대칭키(AES-256, 빠름)로 데이터를, 더 안전하게 보관되는 키로 그 키를 보호하는 이 패턴은 TLS의 세션 키 교환, 디스크 암호화(LUKS) 등 보안 시스템 전반에서 반복되는 보편 설계다.

> ⚠️ **함정**: SSE-KMS는 "버킷에 KMS 암호화를 켜면 끝"이 아니다. 다른 계정이나 역할이 그 객체를 읽으려면 **KMS 키 정책에도 해당 주체가 명시**돼 있어야 한다 — 버킷 정책만 열어 줘선 안 된다. 암호화된 객체 접근에는 ① 객체에 대한 S3 권한, ② 그 객체를 감싼 KMS 키에 대한 `kms:Decrypt` 권한이 **둘 다** 필요하기 때문이다. 시험에서 "Cross-account로 암호화된 S3 객체에 접근이 안 된다"는 시나리오가 나오면, 정답은 거의 항상 "KMS 키 정책에 대상 계정/역할을 추가"다. 마찬가지로 자동 회전이 필요하면 Parameter Store가 아니라 Secrets Manager여야 한다는 점도 단골이다.

## 네트워크 경계는 Stateful과 Stateless, Allow-only와 Deny-가능의 조합으로 갈린다

네트워크 보안 키워드의 핵심은 **Security Group과 NACL의 차이**를 정확히 아는 것이다. 둘 다 트래픽을 거르지만 동작 모델이 정반대다. **Security Group**은 인스턴스(ENI) 레벨에서 동작하는 **stateful** 방화벽으로, Allow 규칙만 쓸 수 있고(Deny 불가) 들어온 요청의 응답은 규칙 없이도 자동 허용된다. 반면 **NACL**(Network ACL)은 서브넷 레벨의 **stateless** 필터로, Allow와 **Deny를 모두** 쓸 수 있지만 인바운드·아웃바운드를 따로 명시해야 하고 응답 트래픽도 별도 규칙이 필요하다. 그래서 "특정 악성 IP를 차단하라"는 요구가 나오면 답은 무조건 NACL이다 — SG는 Deny 규칙 자체가 없기 때문이다.

이 위에 애플리케이션 계층 방어와 탐지 서비스가 올라간다. **WAF**는 L7(HTTP) 공격(SQL 주입·XSS)을 막고 CloudFront·ALB·API Gateway·AppSync·Cognito에 통합된다. **Shield**는 L3/L4 DDoS 방어(Standard 무료, Advanced 유료+SLA+DRT 지원)다. 탐지 3종 세트는 역할이 또렷이 갈린다 — **GuardDuty**는 로그(VPC Flow·DNS·CloudTrail)를 ML로 분석해 **위협 행동**을 잡고, **Inspector**는 EC2/컨테이너의 **OS·소프트웨어 취약점(CVE)**을 스캔하며, **Macie**는 S3의 **PII(개인정보)**를 자동 분류·탐지한다. 이들을 한 화면에 모으는 게 **Security Hub**(통합 점수·규정 준수), 사고를 그래프로 파고드는 게 **Detective**, 조직 전체에 WAF/SG 규칙을 강제하는 게 **Firewall Manager**다.

> 🔍 **더 깊이**: SG가 stateful이라는 말의 정확한 의미는 **연결 추적(connection tracking)** 테이블을 유지한다는 것이다. 인스턴스가 외부로 나가는 연결을 열면, AWS의 하이퍼바이저 수준 방화벽이 그 연결의 5-튜플(출발지·목적지 IP/포트, 프로토콜)을 기억해 두고, 그에 대한 응답 패킷은 인바운드 규칙을 확인하지 않고 통과시킨다. 이 때문에 SG는 "응답은 자동 허용"이 된다. NACL은 이런 상태 테이블이 없어 모든 패킷을 규칙 테이블과 대조하므로(번호 순서대로 첫 매칭 적용), 응답 포트(보통 1024~65535 임시 포트)에 대한 아웃바운드 Allow를 명시하지 않으면 응답이 막힌다. 이 stateless 특성이 NACL 설정을 까다롭게 만들고, 그래서 실무에서는 광역 차단(특정 CIDR Deny)에만 NACL을 쓰고 세밀한 제어는 SG에 맡기는 게 표준 패턴이다.

> ⚠️ **함정**: "GuardDuty / Inspector / Macie를 같은 것으로 보는 것"이 도메인 1 최대 함정이다. 시나리오 키워드로 즉시 구분하라 — "비정상적 API 호출·암호화폐 채굴·알려진 악성 IP와 통신"이면 **GuardDuty**(위협), "EC2에 패치 안 된 CVE·소프트웨어 취약점"이면 **Inspector**(취약점), "S3에 신용카드·주민번호 같은 민감정보가 있는지"면 **Macie**(PII). 그리고 이 셋 모두 탐지만 할 뿐 자동 차단은 하지 않는다 — 차단은 EventBridge로 Lambda를 트리거하거나 Security Hub의 자동화로 연결해야 한다.

## 데이터 보호와 우선순위 규칙 — Block Public Access는 왜 모든 것을 이기나

도메인 1의 마지막 축은 "실수로 데이터를 노출하지 않게 막는 안전장치"다. **S3 Block Public Access(BPA)**가 대표적인데, 이것의 강력함은 **IAM 정책이나 버킷 정책이 public 허용을 해도 BPA가 켜져 있으면 무조건 차단**한다는 데 있다. 즉 BPA는 정책 평가 위에 덮이는 최종 차단막이라, 누군가 실수로 버킷을 public으로 열어도 데이터가 새지 않는다. WORM(Write Once Read Many) 규제 요구는 **S3 Object Lock**(또는 Glacier Vault Lock)으로 객체를 일정 기간 삭제·변경 불가로 잠가 충족한다. 전송 중 암호화 강제는 버킷 정책의 `aws:SecureTransport` 조건(HTTP 거부, HTTPS만 허용)으로, 멀티 리전 키 공유는 **KMS Multi-Region Key**로 해결한다.

여기서 핵심은 보안 도메인 전체를 관통하는 **"명시적 차단·전역 가드레일이 개별 허용을 이긴다"**는 일관된 원리다. SCP가 계정 권한을 이기고, 명시적 Deny가 Allow를 이기고, BPA가 버킷 정책을 이긴다. 시험은 이 우선순위를 거꾸로 묻는 함정을 즐겨 낸다 — "버킷 정책으로 public을 허용했는데 왜 접근이 안 되나?" 같은 식이다.

> 💡 **관련 이론**: 이 "차단 우선" 설계는 보안 공학의 **fail-safe defaults**(안전 기본값) 원칙의 구현이다. 1975년 Saltzer와 Schroeder가 정리한 보안 설계 8원칙 중 하나로, "접근 결정의 기본값은 거부여야 하며, 권한은 명시적으로 부여돼야 한다"는 뜻이다. IAM의 암묵적 거부(아무 정책도 없으면 막힘), BPA의 무조건 차단, NACL/SG의 화이트리스트 모델이 모두 이 원칙을 따른다. 반대 모델(기본 허용·예외만 차단)은 규칙 하나를 빠뜨리면 곧장 노출로 이어지므로, 클라우드처럼 설정 항목이 수천 개인 환경에서는 위험하다. AWS가 일관되게 "기본 거부 + 명시 허용 + 전역 차단막"을 채택한 이유다.

> 📚 **사례**: 2017년 이후 수없이 반복된 "S3 버킷 노출" 사고들 — Verizon(1400만 고객 기록), Accenture(내부 인증정보), 미 국방부 협력사(수 TB의 정보수집 데이터) 등 — 의 공통 원인은 버킷을 실수로 public-read로 설정한 것이었다. 이 사고들이 너무 잦자 AWS는 2018년 **Block Public Access**를 도입하고, 이후 신규 버킷에 기본으로 BPA를 켜는 방향으로 정책을 바꿨다. 교훈은 "보안은 사람의 실수를 전제로 설계해야 한다"는 것이다 — 정책을 올바로 짜라고 교육하는 것보다, 잘못 짜도 노출되지 않는 최종 차단막을 두는 게 훨씬 효과적이다. SAA에서 BPA가 "정책을 이긴다"로 출제되는 배경이다.

## 다른 클라우드의 보안 모델 비교

AWS의 보안 서비스를 상대화하면 키워드 매핑이 더 또렷해진다.

| 구분 | AWS | Azure | GCP |
|------|-----|-------|-----|
| 자격·권한 | IAM + STS | Entra ID(구 AAD) + RBAC | Cloud IAM |
| 조직 가드레일 | SCP | Azure Policy / Management Group | Organization Policy |
| 키 관리 | KMS / CloudHSM | Key Vault / Managed HSM | Cloud KMS / Cloud HSM |
| 비밀 관리·회전 | Secrets Manager | Key Vault Secrets | Secret Manager |
| 위협 탐지 | GuardDuty | Microsoft Defender for Cloud | Security Command Center |
| 통합 보안 점수 | Security Hub | Defender for Cloud | Security Command Center |

세 클라우드 모두 "정책 기반 접근 제어 + 키 관리 + 위협 탐지 + 통합 대시보드"라는 같은 골격을 갖는다. 차이는 명칭과 통합 방식이다 — Azure는 Defender for Cloud 하나가 탐지와 점수화를 모두 묶는 반면, AWS는 GuardDuty(탐지)·Inspector(취약점)·Macie(데이터)·Security Hub(통합)로 잘게 나눠 각각을 켜고 끌 수 있게 했다. 이 모듈성이 AWS 시험에서 "어떤 신호어가 어떤 서비스인가"를 정밀하게 묻는 이유다.

> 🔍 **더 깊이**: 모든 보안 도메인 결정의 배경에는 **공동 책임 모델(Shared Responsibility Model)**이 깔려 있다. AWS는 "클라우드 자체의 보안(of the cloud)" — 물리 데이터센터·하이퍼바이저·관리형 서비스 인프라 — 을 책임지고, 고객은 "클라우드 안에서의 보안(in the cloud)" — IAM 설정·암호화 선택·SG 규칙·패치 — 을 책임진다. 이 경계는 서비스 추상화 수준에 따라 움직인다. EC2(IaaS)는 OS 패치·방화벽이 모두 고객 몫이지만, RDS(관리형)는 OS·DB 엔진 패치가 AWS 몫이고, Lambda·S3(서버리스/관리형)는 고객이 코드·데이터·접근 정책만 책임진다. 시험에서 "이 보안 작업은 누구 책임인가?"가 나오면, **서비스가 관리형일수록 AWS 책임이 커진다**는 이 슬라이딩 규칙으로 푼다.

## CLI로 직접 확인하기

```bash
# IAM 정책 시뮬레이터로 특정 요청의 허용/거부 평가
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/AppRole \
  --action-names s3:GetObject --resource-arns arn:aws:s3:::my-bucket/*

# S3 Block Public Access 전역 차단 켜기
aws s3api put-public-access-block --bucket my-bucket \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Secrets Manager 자동 회전 설정 (30일 주기)
aws secretsmanager rotate-secret --secret-id prod/db/password \
  --rotation-lambda-arn arn:aws:lambda:...:function:RotateFn \
  --rotation-rules AutomaticallyAfterDays=30

# EC2 IMDSv2 강제 (SSRF 방어)
aws ec2 modify-instance-metadata-options --instance-id i-0abc \
  --http-tokens required --http-endpoint enabled

# GuardDuty 활성화
aws guardduty create-detector --enable
```

## 정리하며

보안 도메인은 25개 키워드의 암기처럼 보이지만, 실제로는 **"명시적 차단·전역 가드레일이 개별 허용을 이긴다"**는 하나의 평가 원리 위에 세 축이 쌓인 구조다. ① **자격·권한**은 IAM 평가 순서(명시적 Deny > SCP > Boundary > Allow)로 정렬되고, EC2는 Role+IMDSv2로 키 하드코딩을 없앤다. ② **암호화**는 봉투 암호화(KMS 마스터키 > DEK)로 계층화되며, 자동 회전은 Secrets Manager, FIPS L3는 CloudHSM, 멀티 리전은 KMS MRK다. ③ **네트워크·탐지**는 SG(stateful, Allow-only)와 NACL(stateless, Deny 가능)의 차이, GuardDuty(위협)·Inspector(취약점)·Macie(PII)의 역할 분담으로 갈린다. 그리고 이 모든 결정 위에 공동 책임 모델이 "관리형일수록 AWS 책임"이라는 슬라이딩 규칙으로 덮인다. Capital One·반복된 S3 노출 사고는 "최소 권한과 최종 차단막"이 왜 시험의 단골인지를 현실로 증명한다.

다음 글에서는 도메인 2 복원력 아키텍처를 같은 방식으로 — 키워드가 아니라 "장애 반경과 복제 모드"라는 원리로 — 다시 엮는다.

---

## 📝 연습 문제

**문제 1.** 한 IAM 사용자가 S3 버킷 읽기 권한을 부여하는 Identity 정책을 가지고 있다. 그런데 그 사용자가 속한 조직의 SCP가 해당 S3 작업을 명시적으로 거부(Deny)하고 있다. 결과는?

A) Identity 정책의 Allow가 우선해 접근 허용된다
B) SCP의 명시적 Deny가 우선해 접근이 차단된다
C) 둘이 충돌하므로 관리자 승인 후 결정된다
D) 버킷 정책이 있으면 그것이 최종 결정한다

**정답: B**

해설: IAM 정책 평가에서 **명시적 Deny는 그 어떤 Allow보다 우선**하며, SCP는 조직 전체에 씌우는 가드레일(천장)이라 계정 내 Identity 정책이 Allow를 줘도 SCP가 Deny하면 무조건 차단된다. 평가 순서는 명시적 Deny → SCP 허용 여부 → Boundary/Resource/Session 교집합 → Identity Allow다. A는 평가 순서를 거꾸로 본 오답, C는 IAM에 그런 충돌 승인 메커니즘이 없으며, D는 버킷 정책도 명시적 Deny나 SCP를 이기지 못한다. 핵심 신호: "SCP가 Deny" = 그 위 모든 Allow 무효.

---

**문제 2.** 한 EC2 애플리케이션이 S3에 접근해야 한다. 보안상 가장 권장되는 방식과, 함께 적용해야 할 방어는?

A) 액세스 키를 코드에 하드코딩하고 환경변수로 관리
B) IAM Role을 인스턴스에 부여하고 IMDSv2를 강제한다
C) 버킷을 public-read로 열어 키 없이 접근
D) NAT Gateway를 통해 접근 권한을 우회

**정답: B**

해설: EC2가 AWS API를 호출할 때는 액세스 키 하드코딩 대신 **IAM Role(인스턴스 프로파일)**을 붙여 IMDS가 임시 자격증명을 자동 제공하게 한다. 여기에 **IMDSv2를 강제**해야 SSRF 공격으로 메타데이터의 자격증명을 탈취당하는 것을 막을 수 있다 — 2019년 Capital One 사고가 정확히 IMDSv1+SSRF로 1억 건이 유출된 사례다. A는 키 노출 위험, C는 데이터 전체 노출, D는 권한과 무관한 네트워크 경로(NAT는 인증을 제공하지 않음)다. "EC2 → API = Role + IMDSv2"는 보안 도메인 단골 정답.

---

**문제 3.** 한 회사가 S3에 저장한 대용량 데이터를 KMS로 암호화하면서 KMS API 호출 비용을 줄이고 싶다. 또한 다른 계정이 이 암호화된 객체를 읽어야 한다. 필요한 조치 두 가지는?

A) S3 Bucket Keys 활성화 + 대상 계정을 KMS 키 정책에 추가
B) SSE-S3로 전환 + 버킷 정책만 수정
C) CloudHSM으로 키를 옮기고 버킷 정책 수정
D) Parameter Store에 키를 저장하고 IAM 사용자 추가

**정답: A**

해설: KMS 호출 비용 절감은 **S3 Bucket Keys**로 객체별 KMS 호출을 버킷 레벨 키로 줄여 해결한다. Cross-account 접근은 **KMS 키 정책에 대상 계정/역할을 명시**해야 하는데, 암호화된 객체 읽기에는 S3 권한과 `kms:Decrypt` 권한이 둘 다 필요하기 때문이다. B의 SSE-S3는 고객 KMS 키를 안 쓰므로 키 정책 통제·Bucket Keys 비용 모델과 맞지 않고, C의 CloudHSM은 FIPS L3 전용 HSM 요구가 없는 한 과잉이며, D는 KMS 마스터키 관리와 무관하다. "Cross-account 암호화 객체 = KMS 키 정책 추가"가 핵심.

---

**문제 4.** 보안팀이 (1) EC2에 패치되지 않은 CVE가 있는지, (2) 누군가 비정상적으로 암호화폐 채굴 통신을 하는지, (3) S3에 주민번호 같은 PII가 있는지를 각각 탐지하려 한다. 올바른 서비스 조합은?

A) (1) GuardDuty (2) Inspector (3) Config
B) (1) Inspector (2) GuardDuty (3) Macie
C) (1) Macie (2) Inspector (3) GuardDuty
D) (1) Config (2) Macie (3) Inspector

**정답: B**

해설: 세 탐지 서비스는 역할이 또렷이 갈린다 — **Inspector**는 EC2/컨테이너의 OS·소프트웨어 **취약점(CVE)** 스캔, **GuardDuty**는 로그를 ML 분석해 암호화폐 채굴·악성 IP 통신 같은 **위협 행동** 탐지, **Macie**는 S3의 **PII** 자동 분류다. 이 셋을 헷갈리게 만드는 게 도메인 1 최대 함정이다. 키워드 매칭: "CVE/패치" → Inspector, "비정상 행동/채굴/악성 IP" → GuardDuty, "민감정보/PII" → Macie. 셋 다 탐지만 하고 차단은 EventBridge+Lambda로 연결해야 한다.

---

**문제 5.** 한 버킷에 버킷 정책으로 public-read를 허용했는데도 외부에서 객체에 접근할 수 없다. 가장 가능성 높은 원인은?

A) IAM 사용자에게 권한이 없어서
B) S3 Block Public Access가 켜져 있어 버킷 정책의 public 허용을 무효화하기 때문
C) KMS 키가 만료되어서
D) NACL이 트래픽을 막아서

**정답: B**

해설: **S3 Block Public Access(BPA)**는 버킷 정책이나 ACL이 public을 허용해도 무조건 차단하는 최종 차단막이다 — "전역 차단이 개별 허용을 이긴다"는 보안 도메인의 일관된 원리다. 반복된 S3 노출 사고(Verizon·Accenture 등) 이후 AWS가 도입했고 신규 버킷에 기본 활성화된다. A는 외부(비인증) 접근 시나리오와 맞지 않고, C는 암호화 객체라도 BPA가 우선 원인이며, D의 NACL은 보통 이런 정책 우선순위 문제의 원인이 아니다. "정책으로 public 열었는데 안 됨" = BPA 의심.

---

**문제 6.** 한 회사가 규제로 인해 암호화 키를 자사 전용 하드웨어에서 FIPS 140-2 Level 3 인증 환경으로 관리해야 한다. 적절한 서비스는?

A) KMS CMK B) CloudHSM C) Secrets Manager D) Parameter Store

**정답: B**

해설: **CloudHSM**은 FIPS 140-2 Level 3 인증을 받은 **단독(single-tenant) 전용 하드웨어 보안 모듈**로, 키를 고객 전용 하드웨어에 격리해야 하는 규제 요구에 쓴다. KMS(A)는 편리하지만 멀티테넌트 관리형이라 "전용 HSM·FIPS L3" 요구를 직접 만족하지 못한다(KMS도 HSM 기반이나 공유 모델). Secrets Manager(C)·Parameter Store(D)는 키 저장·비밀 관리 서비스지 HSM이 아니다. "전용 HSM / FIPS Level 3 / 키를 내 하드웨어에" = CloudHSM이 정답 신호다.

---

**문제 7.** 한 팀이 특정 악성 IP 대역(CIDR)에서 들어오는 트래픽을 서브넷 전체에서 차단하려 한다. 적절한 도구는?

A) Security Group에 Deny 규칙 추가
B) NACL에 해당 CIDR Deny 규칙 추가
C) IAM 정책으로 IP 거부
D) KMS 키 정책 수정

**정답: B**

해설: 특정 IP를 **차단(Deny)**하려면 **NACL**을 써야 한다 — NACL은 서브넷 레벨의 stateless 필터로 Allow와 **Deny 규칙을 모두** 지원한다. **Security Group은 Allow 규칙만 가능하고 Deny가 없으므로**(A) IP 차단을 할 수 없다. IAM 정책(C)은 AWS API 권한을 다루지 네트워크 패킷을 거르지 않고, KMS 키 정책(D)은 암호화 권한과 무관하다. "IP 차단 / 광역 서브넷 차단" = NACL Deny가 정답. SG와 NACL의 Allow-only vs Deny-가능 차이는 도메인 1 핵심 구분점이다.

---

## 📌 핵심 요약

보안 도메인(30%)은 "명시적 차단·전역 가드레일이 개별 허용을 이긴다"는 하나의 평가 원리 위에 세 축이 쌓인 구조다. ① 자격·권한은 IAM 평가 순서(명시적 Deny > SCP > Boundary > Identity Allow)로 정렬되고 EC2는 Role+IMDSv2로 키를 없앤다(Capital One 사고의 교훈). ② 암호화는 봉투 암호화(KMS 마스터키 > DEK)로 계층화되며 자동 회전=Secrets Manager, FIPS L3=CloudHSM, Cross-account 암호화 객체는 KMS 키 정책 추가가 필수다. ③ 네트워크·탐지는 SG(stateful·Allow-only)와 NACL(stateless·Deny 가능)의 차이, GuardDuty(위협)·Inspector(취약점)·Macie(PII)의 분담, BPA가 버킷 정책을 이긴다는 fail-safe 원칙으로 갈린다. 모든 책임 경계는 공동 책임 모델의 "관리형일수록 AWS 책임" 규칙으로 푼다.
