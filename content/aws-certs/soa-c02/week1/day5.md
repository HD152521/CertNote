# Day 5 - Week 1 통합 복습: 운영자 시나리오로 다시 보는 첫 주

한 주 동안 본 그림은 **AWS의 물리 지도(Region / AZ / Edge)**, **그 위에서 누가 무엇을 책임지는가(Shared Responsibility)**, **누가 무엇을 할 수 있게 할까(IAM의 6단계 평가 알고리즘)**, 그리고 **수십·수백 개 계정을 한 거버넌스 아래 묶는 법(Organizations / SCP / Identity Center)** 네 가지였다. 이 네 그림이 SOA-C02 모든 시나리오의 배경이다. 시험 문제를 풀 때 답이 바로 안 보이면 "이 시나리오는 네 개 중 어디를 묻는가"부터 분류하는 습관을 들이면, 보기에서 정답이 자연스럽게 떠오른다.

이 주의 내용이 머릿속에 깔려 있어야 다음 주의 CloudWatch·Config·CloudTrail이 자연스럽게 위에 얹힌다. 알람이 울렸을 때 "어느 리전의 어느 AZ에서, 누구(IAM principal)가, 어떤 권한 평가 경로로, 어떤 계정에서, 어떤 SCP·boundary 한도 안에서" 일을 했는지를 거꾸로 추적하는 게 운영자의 일상이다. 그 추적을 가능하게 만드는 인프라가 이 주의 주제였다.

## 운영자의 머릿속 지도: 한 장으로 다시 보기

```
┌─────────────────────────────────────────────────────────┐
│         [AWS Global Infrastructure]                     │
│  Region > AZ > Edge / Local Zones / Outposts            │
│  - Control plane은 us-east-1에 자주 묶임 (IAM/R53/CF)   │
│  - AZ는 격리 최소 단위. NAT GW / EBS / RDS Standby는 AZ │
│  - ZoneId(apne2-az1)만 계정 간 일치, ZoneName은 셔플    │
├─────────────────────────────────────────────────────────┤
│         [Shared Responsibility]                         │
│  AWS: Security OF the Cloud                             │
│  Customer: Security IN the Cloud                        │
│  - 추상화 레벨↑ ⇒ 책임 경계선↑ (EC2 < ECS < Fargate < L)│
│  - 데이터 분류·IAM·암호화 키 정책은 늘 고객                │
├─────────────────────────────────────────────────────────┤
│         [IAM Evaluation 6-step]                         │
│  Explicit Deny → Org SCP → Resource Policy →            │
│   Identity Policy → Permission Boundary →               │
│   Session Policy → 최종 Allow/Deny                      │
│  - Deny는 어디서든 한 번이라도 나오면 즉시 차단            │
│  - Cross-Account는 양쪽 다 Allow가 필요                  │
├─────────────────────────────────────────────────────────┤
│         [Multi-Account Governance]                      │
│  Organizations / SCP / RAM / Control Tower / IdC        │
│  - Management Account엔 SCP 안 통함 (워크로드 두지 말 것)│
│  - Delegated Administrator로 보안 서비스 중앙화         │
│  - Identity Center + IdP 페더레이션 = IAM User 없는 운영 │
└─────────────────────────────────────────────────────────┘
```

운영자의 일상 디버깅 흐름은 이 그림 위에서 다음 순서로 흐른다.

1. **증상 포착**: CloudWatch alarm / Health Dashboard / 사용자 클레임
2. **원인 후보 좁히기**: CloudTrail에서 직전 5~30분의 write API 이벤트
3. **권한 문제 의심**: IAM Policy Simulator + Access Analyzer + errorMessage 정독
4. **인프라 문제 의심**: AWS Health(SHD/PHD) + Service Quotas
5. **계정 단위 보안 위반 의심**: Config + GuardDuty + Security Hub finding
6. **복구 후 사후 점검**: TAM·support 케이스 / RCA 문서화 / Config 룰 보강

이 흐름이 머릿속에 있으면 "장애 났다"는 한 줄에서 "5분 안에 콘솔의 어느 화면을 열어야 하는가"가 자동으로 결정된다. 시험에서 "처음에 봐야 할 도구는?" 같은 문제는 거의 이 표에서 답이 나온다.

## 함정 모음: 운영자가 같은 실수를 반복하는 6가지

이 주의 내용을 종합하면 다음 6가지가 운영자가 같은 사고를 반복하는 패턴이다.

1. **Management Account에 워크로드 두기**: SCP가 안 통하는 계정인데 EC2·RDS를 띄워두면 root 키 유출 시 무방비. AWS Landing Zone 표준은 management = 결제·org 관리만, 워크로드는 별도 OU의 member 계정.
2. **단일 AZ에 NAT GW / RDS Single-AZ / NLB 단일 AZ 등록**: 비용을 아끼려다 AZ 하나가 흔들리면 전체 down. NAT GW는 AZ 단위 리소스이고 자동 페일오버가 없다.
3. **IAM User + access key 영구 발급**: 회전 누락·offboarding 누락이 사고 1순위. 2019년 Capital One, 2022년 Uber 사건 모두 자격증명 관리의 실패였다. 답은 Identity Center + IdP 페더레이션.
4. **us-east-1 의존성 무시**: IAM·Route 53 public zone·CloudFront·Organizations의 write는 us-east-1 컨트롤 플레인에 의존한다. 글로벌 서비스라고 안심하면 2021년 12월 같은 장애에 휘말린다.
5. **IMDSv1을 명시적으로 끄지 않음**: 신규 EC2도 launch template / SCP / Config로 강제하지 않으면 운영자가 실수로 v1을 띄울 수 있다. SSRF 공격의 진입점.
6. **CloudTrail / Config을 member 계정에서 개별 관리**: 누가 비활성화했는지를 그 계정 trail로 확인해야 하는 자기참조 문제. 답은 Organization Trail + Log Archive Account + S3 Object Lock.

이 여섯 가지를 다 피하는 게 운영자의 출발선이다. 시험은 이 함정들을 시나리오로 변형해서 묻는다.

## 운영자 한 줄 명령어 카드: 시험 직전 한 번 더

콘솔이 아니라 CLI로 한 번씩 쳐본 명령은 시험장에서도 기억난다. Week 1 핵심 CLI를 한 카드로 모은다.

```bash
# 1) ZoneId 확인 — cross-account 비용 최적화의 출발점
aws ec2 describe-availability-zones --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId,State]' --output table

# 2) Health 이벤트 — 진행 중 / 예정된 이벤트 모두
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming" --region us-east-1
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming" --region us-west-2

# 3) IAM 최근 사용 — 90일 이상 안 쓴 access key 찾기
aws iam generate-credential-report
aws iam get-credential-report --query 'Content' --output text \
  | base64 --decode

# 4) IAM Access Analyzer — 외부 노출 리소스 점검
aws accessanalyzer list-analyzers
aws accessanalyzer list-findings --analyzer-arn arn:aws:access-analyzer:...

# 5) Organizations 구조 보기
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id r-xxxx
aws organizations list-accounts-for-parent --parent-id ou-xxxx-yyyy

# 6) SCP 효과 확인 — 특정 계정에 적용된 정책 모두
aws organizations list-policies-for-target \
  --target-id 123456789012 --filter SERVICE_CONTROL_POLICY

# 7) Identity Center Permission Set 할당 조회
aws sso-admin list-permission-sets --instance-arn arn:aws:sso:::instance/...

# 8) Policy Simulator — 사전 검증
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111:user/alice \
  --action-names s3:PutObject \
  --resource-arns arn:aws:s3:::my-bucket/key
```

여기서 가장 자주 잊는 게 `generate-credential-report` → `get-credential-report` 두 단계라는 점이다. 첫 호출은 비동기 생성 트리거이고 두 번째 호출이 실제 다운로드다.

> 🔍 **더 깊이**: `simulate-principal-policy`는 SCP, Permission Boundary, Resource Policy까지 한 번에 평가해 실제 운영의 권한 거부 원인을 찾아준다. CloudTrail의 `errorMessage`에 "explicit deny from SCP"라고 찍히는 경우가 가장 친절한 케이스이고, 그렇지 않을 땐 simulator로 한 단계씩 좁혀야 한다. Simulator는 `--context-entries`로 MFA·SourceIp 같은 조건도 흉내 낼 수 있어 IP 화이트리스트 조건 디버깅에도 쓴다.

> 💡 **암기 팁**: 운영자의 "권한 문제 1차 진단 3단 콤보"는 ① CloudTrail의 `errorCode` / `errorMessage` → ② `simulate-principal-policy` → ③ Access Analyzer "Reachable from outside"이다. 이 순서가 머리에 박혀 있으면 어떤 IAM 시나리오 문제도 푼다.

## Week 1 자기진단 체크리스트

다음 11개 질문에 모두 "예"라고 답할 수 있어야 Week 2로 넘어가도 무리가 없다.

- [ ] Region / AZ / Edge의 차이와 NAT GW가 AZ 단위 리소스라는 점을 설명할 수 있는가?
- [ ] us-east-1 컨트롤 플레인 의존성이 왜 IAM·Route 53·CloudFront에까지 영향을 주는지 설명할 수 있는가?
- [ ] ZoneName과 ZoneId의 차이와, 두 계정 간 cross-AZ 데이터 전송 비용을 줄이는 매칭 방법을 안다?
- [ ] 공동 책임 모델에서 EC2 / ECS Fargate / Lambda / S3 각각의 책임 경계 차이를 설명할 수 있는가?
- [ ] IAM 정책 평가 6단계 알고리즘(Deny→SCP→Resource→Identity→Boundary→Session)을 순서대로 떠올릴 수 있는가?
- [ ] SCP와 Permission Boundary와 Session Policy의 차이를 한 줄씩 설명할 수 있는가?
- [ ] Identity Center의 Permission Set이 내부적으로 어떤 IAM Role로 실현되는지 안다?
- [ ] AWS Health Dashboard와 EventBridge `aws.health` 룰을 어느 리전에 둬야 하는지 안다?
- [ ] Organization Trail + Log Archive Account + S3 Object Lock 패턴의 PCI-DSS 가치 설명 가능?
- [ ] IMDSv2 + hop limit 1 + Config rule + SCP 4중 방어가 SSRF를 어떻게 차단하는지 설명 가능?
- [ ] Delegated Administrator로 GuardDuty·Security Hub·Inspector·Macie를 보안 계정에 위임하는 표준 패턴을 안다?

---

## 📝 연습 문제 (시나리오 12문항)

**문제 1.** 한국 사용자 대상 게임 회사가 ap-northeast-2에서 운영 중이다. 운영팀이 us-east-1 장애 중에도 "콘솔 로그인은 가능, 단 새 IAM 사용자 생성·Route 53 레코드 변경 같은 write는 못 할 수 있다"는 사실을 미리 알고 대비하려고 한다. SDK·CLI 측에서 추가로 해야 할 가장 적절한 조치는?

A) STS 글로벌 엔드포인트(sts.amazonaws.com)를 명시적으로 고정한다
B) STS 리전 엔드포인트(sts.ap-northeast-2.amazonaws.com)를 강제하고, IAM·Route 53 같은 글로벌 write는 us-east-1 의존이라는 사실을 런북에 명시한다
C) Route 53 health check로 us-east-1을 차단한다
D) IAM Identity Center 인스턴스를 ap-northeast-2에 만들면 us-east-1 의존이 사라진다

**정답: B**
해설: IAM·Route 53 public zone·CloudFront·Organizations의 컨트롤 플레인은 구조적으로 us-east-1에 있다. 운영팀이 할 수 있는 일은 그 사실을 알고 (a) STS 리전 엔드포인트(`sts.ap-northeast-2.amazonaws.com`)를 명시해 자격증명 발급 같은 데이터 플레인은 ap-northeast-2에서 처리하게 만들고, (b) 글로벌 write는 us-east-1 의존이라는 사실을 런북·DR 시나리오에 명시하는 것이다. STS 글로벌 엔드포인트는 디폴트가 us-east-1 alias라 오히려 us-east-1 장애에 묶인다. Identity Center 인스턴스는 리전을 고를 수 있지만 us-east-1 의존을 완전히 없애지는 못한다.

---

**문제 2.** 한 운영팀이 ASG로 운영 중인 웹 서비스에서 AZ-a 장애 발생 시 모든 트래픽이 끊겼다. 원인 분석 결과 NAT GW가 AZ-a 한 곳에만 있었고, AZ-b·AZ-c의 private subnet 라우팅 테이블도 모두 AZ-a NAT GW를 가리키고 있었다. 정답은?

A) NAT GW를 AZ-b로 옮긴다
B) AZ당 NAT GW를 1개씩 만들고, 각 private subnet의 라우팅 테이블이 자기 AZ의 NAT GW를 가리키게 한다
C) 모든 NAT GW를 NAT Instance로 교체한다
D) NAT GW 대신 Internet Gateway를 private subnet에 연결한다

**정답: B**
해설: NAT GW는 AZ 단위 리소스이고 자동 페일오버가 없다. 단일 AZ NAT GW에 다른 AZ private subnet 라우팅을 묶어두면 그 AZ가 흔들릴 때 전체 다운된다. **AZ당 1개 NAT GW + 각 private subnet 라우팅 테이블이 자기 AZ NAT GW를 가리키게** 하는 것이 정석. 비용 부담 시 NAT Instance(ASG self-heal)나 Fck-NAT 같은 단순화된 NAT 인스턴스로 GB당 \$0.045 처리비를 줄이는 선택지가 있지만 운영 부담을 동반한다. Internet Gateway는 private subnet에 못 붙는다(붙이면 그 subnet은 더 이상 private이 아니다).

---

**문제 3.** EC2 인스턴스가 KMS CMK로 SSE-KMS 암호화된 S3 버킷에 PUT을 시도하는데 AccessDenied. IAM Policy에 `s3:PutObject Allow`가 있고 Bucket Policy에도 Allow가 있다. CloudTrail에는 `s3.amazonaws.com` 이벤트와 `kms.amazonaws.com` 이벤트 두 줄이 모두 실패로 찍혔다. 가장 가능성 높은 원인은?

A) SCP가 PutObject를 차단하고 있다
B) KMS Key Policy에 EC2 Role이 `kms:GenerateDataKey`와 `kms:Decrypt`로 허용돼 있지 않다
C) S3 버킷이 다른 리전에 있어 cross-region PUT이 막혔다
D) IMDSv2가 비활성화돼 있어 자격증명을 못 받는다

**정답: B**
해설: SSE-KMS 객체 PUT은 `kms:GenerateDataKey`(쓰기) / GET은 `kms:Decrypt`(읽기) 권한이 필요하고, IAM Policy + KMS Key Policy 양쪽에서 모두 허용돼야 한다. KMS는 "기본 거부 + Key Policy 명시 허용" 모델이라 IAM Policy만 있고 Key Policy에 해당 principal이 없으면 거부된다. CloudTrail에서 `kms.amazonaws.com` 이벤트와 `s3.amazonaws.com` 이벤트가 동시에 실패로 찍히는 게 전형적 증상. 운영자가 가장 자주 헤매는 함정 중 하나로, 답은 KMS Key Policy에 EC2 Role을 명시적으로 추가하는 것이다.

---

**문제 4.** 회사가 200명 직원에 60개 AWS 계정을 운영 중이다. 직원이 매주 입·퇴사하며, 보안팀은 access key 회전과 offboarding 누락에 지쳤다. 가장 효율적인 변경은?

A) 모든 직원에게 access key 발급, Lambda로 90일마다 회전
B) IAM Identity Center 도입 + 외부 IdP(Azure AD / Okta) 페더레이션 + Permission Set 단위 권한 관리
C) 한 master 계정에 IAM User 두고 다른 계정은 Cross-Account Role로 sts:AssumeRole
D) Secrets Manager에 모든 access key 저장 후 매일 회전

**정답: B**
해설: Identity Center로 IdP에서 한 번 사용자 관리, Permission Set으로 계정·OU별 권한 부여. 직원 퇴사 시 IdP에서 한 번 비활성화하면 전 계정 접근 차단. access key 자체가 거의 사라진다(임시 자격증명만 사용). 2024년부터 AWS가 IAM User를 만들 때 콘솔에 경고를 띄울 만큼 Identity Center가 표준이 됐다. C는 운영은 가능하지만 IAM User 영구 자격증명이 남는다.

---

**문제 5.** 한 회사가 Organizations로 50개 계정을 운영 중이고, 모든 계정에서 `us-east-1`과 `ap-northeast-2` 외 리전을 사용 못하게 강제하려고 한다. 데이터 주권 준수가 목적. 가장 효율적인 방법은?

A) 모든 계정의 모든 IAM Policy에 NotResource Deny 조건을 추가
B) SCP를 root OU에 적용하고, `aws:RequestedRegion` Condition으로 허용 리전 외 Deny + IAM·Route 53 같은 글로벌 서비스는 NotAction으로 예외
C) Config Rule `region-restriction`으로 비준수 탐지 후 SNS 알림
D) CloudFormation Stack Set으로 IAM Policy를 모든 계정에 일괄 배포

**정답: B**
해설: SCP는 계정·OU 단위 가드레일로 전 계정 일괄 적용. `aws:RequestedRegion` 조건으로 허용 리전 외 Deny. IAM / Route 53 / CloudFront / Organizations 같은 글로벌 서비스는 내부적으로 us-east-1로 라우팅되므로 NotAction으로 예외 처리해야 한다(안 하면 IAM User 생성조차 막힘). Config는 탐지만 가능하고 차단은 못 한다.

---

**문제 6.** 운영자가 개발자에게 IAM Role 생성을 위임하되, 그 Role의 effective permission이 회사 표준 정책 범위를 넘지 못하게 강제하려고 한다. 어떤 조합이 정답인가?

A) 개발자에게 AdministratorAccess
B) 개발자에게 `iam:CreateRole`·`iam:AttachRolePolicy` Allow + `iam:PermissionsBoundary` Condition으로 회사 표준 boundary를 강제
C) SCP로 개발자가 만든 IAM Role의 권한 범위를 제한
D) Service Catalog로만 Role 생성을 허용

**정답: B**
해설: Permission Boundary 패턴이다. 개발자가 만든 Role의 effective permission = Role의 정책 ∩ boundary. 위임 IAM Policy에 `iam:PermissionsBoundary` 조건을 걸어 boundary를 안 붙이면 CreateRole 자체가 실패하게 만든다. SCP는 계정 전체에 적용되므로 개발자만 제약하는 용도엔 너무 광범위하다. Service Catalog는 가능한 선택지지만 일상적인 Role 생성을 모두 카탈로그로 강제하면 개발 속도가 떨어진다.

---

**문제 7.** 한 회사가 50개 member 계정의 CloudTrail 로그를 한 곳에 모으고, 운영자가 그 로그를 수정·삭제하지 못하게 하려고 한다. PCI-DSS 10.5.5 요구사항 충족이 목적. 표준 패턴은?

A) Member 계정마다 trail 만들고 cross-account 권한으로 모음
B) Organization Trail + Log Archive Account의 격리된 S3 버킷 + S3 Object Lock (Compliance 모드, WORM)
C) CloudWatch Logs Subscription으로 모든 계정 로그를 한 Log Group으로 모음
D) AWS Backup으로 trail을 매일 백업

**정답: B**
해설: Organization Trail로 모든 member 계정(신규 포함)에 자동 활성화, Log Archive Account의 격리된 S3 버킷에 적재, S3 Object Lock Compliance 모드로 운영자조차 변조 불가. AWS Landing Zone / Control Tower의 표준 패턴이며 PCI-DSS 10.5.5 ("audit trail의 무결성 보장") 요구사항을 정확히 충족한다. CloudWatch Logs Subscription은 실시간 분석엔 좋지만 변조 방지 측면에선 S3 Object Lock에 못 미친다.

---

**문제 8.** 운영팀이 EC2 인스턴스의 메타데이터 SSRF 공격을 막으려고 한다. 가장 강력한 운영 표준 4중 방어는?

A) SG로 169.254.169.254 차단
B) IMDSv2 강제 + hop limit 1 + SCP로 IMDSv1 인스턴스 생성 차단 + Config rule `ec2-imdsv2-check`로 기존 인스턴스 비준수 탐지·자동 수정
C) IAM 역할을 인스턴스에 안 붙임
D) NACL로 메타데이터 IP 차단

**정답: B**
해설: 169.254.169.254는 link-local 주소라 SG·NACL로 막을 수 없다(라우팅 테이블이 아니라 hypervisor 레벨에서 처리). 4중 방어 = ① IMDSv2 강제(PUT 세션 토큰), ② hop limit 1(컨테이너 outside로 메타데이터 못 누출), ③ SCP로 `RunInstances`의 `MetadataOptions.HttpTokens=required`가 아닌 경우 Deny(신규 생성 차단), ④ Config rule로 기존 인스턴스 탐지·자동 수정. C는 SDK가 자격증명을 못 받아 비현실적.

---

**문제 9.** 운영자가 100개 계정의 EC2 인스턴스 인벤토리를 한 번에 보고 싶다. 보안팀은 OS 패치 적용 현황·태그·인스턴스 타입을 알고 싶어 한다. 가장 효율적인 방법은?

A) 각 계정에 로그인해서 EC2 목록 확인
B) Resource Explorer Multi-Account 검색 또는 Systems Manager Inventory + Resource Data Sync로 S3에 집계 후 Athena 쿼리
C) Lambda로 매일 100개 계정을 순회하며 describe-instances 호출
D) CloudFormation Stack Set으로 EC2 메타데이터 수집 스크립트 배포

**정답: B**
해설: Resource Explorer를 organization 단위로 활성화하면 모든 계정 리소스를 한 검색에서 조회. OS 패치·소프트웨어 인벤토리까지 보려면 SSM Inventory + Resource Data Sync로 모든 계정 데이터를 한 S3 버킷에 모은 뒤 Athena·QuickSight로 분석. Lambda 순회는 가능하지만 운영 부담과 throttling 문제. 2022년 출시된 Resource Explorer가 AWS 공식 답이다.

---

**문제 10.** 한 운영팀이 새벽 3시 us-east-1 장애 알림을 받기 위해 EventBridge `aws.health` 룰을 만들었다. 누락 없이 모든 이벤트를 받기 위한 표준 패턴은?

A) us-east-1에 한 룰
B) us-east-1과 us-west-2 양쪽에 동일한 룰을 만들고, 같은 SNS 토픽으로 라우팅 (중복 알람은 dedupe 키로 제거)
C) 활성화된 모든 리전에 룰을 만든다
D) 관리 계정에만 한 번 만들면 자동으로 전 리전 전 계정에 적용된다

**정답: B**
해설: AWS Health API는 us-east-1과 us-west-2 두 곳에서 active-active로 운영되며 자동 페일오버한다. EventBridge `aws.health` source 룰을 양쪽 리전에 만들어야 한쪽이 장애일 때도 누락이 없다. Organizational Health View를 켜면 모든 계정 이벤트를 management account에서도 받을 수 있고, member 계정에서도 자체 룰을 만드는 게 표준.

---

**문제 11.** 보안 운영자가 5개 부서별로 200대 EC2의 시작/중지 권한을 분리해야 한다. 100명 직원과 200대 EC2가 있고, 직원이 매주 입·퇴사하며 부서 이동도 잦다. 가장 확장성 있는 방식은?

A) 부서별로 IAM Group 5개를 만들고 EC2 인스턴스마다 별도 IAM Policy 200개
B) 직원의 IdC `PrincipalTag/Department`와 EC2 `ResourceTag/Department`가 일치할 때만 `ec2:StartInstances`·`ec2:StopInstances`를 Allow하는 ABAC 정책 1개
C) 부서별 IAM User 5명을 만들어 공유 사용
D) Service Catalog로 EC2 launch만 허용

**정답: B**
해설: ABAC(Attribute-Based Access Control) 패턴. 정책 하나로 N×M 권한 조합을 처리. 직원 부서가 IdP에서 바뀌면 SAML attribute가 자동 갱신되며 AWS 권한도 자동 변경. NIST SP 800-162 ABAC 표준의 구현. RBAC로 처리하면 부서·역할 조합마다 Group이 늘어 정책 폭증. IAM User 공유는 보안 사고의 입구다.

---

**문제 12.** 보안 운영자가 100개 계정의 GuardDuty finding·Security Hub 점수·Inspector vulnerability·Macie 데이터 분류 결과를 한 곳에서 보려고 한다. 표준 패턴은?

A) 각 계정 콘솔에 일일이 로그인
B) Security Account를 GuardDuty / Security Hub / Inspector / Macie 각각의 Delegated Administrator로 지정하고, member 계정은 자동 enrollment
C) Lambda로 각 계정 finding을 매시간 수집해 별도 DB에 적재
D) EventBridge로 SNS에 전송 후 별도 SIEM 구축

**정답: B**
해설: Delegated Administrator 패턴은 GuardDuty·Security Hub·Inspector·Macie·Detective 같은 보안 서비스의 표준 중앙화 방식. management account 부담을 분산하면서 한 보안 계정이 organization 전체를 관리. 2020년 이후 모든 보안 서비스가 이 패턴을 지원하며, AWS Landing Zone / Control Tower의 표준 구성. D처럼 EventBridge로 외부 SIEM(Splunk·Datadog) 보내는 건 보완 패턴으로 가능하다.

---

## 다음 주 예고: Week 2 — CloudWatch의 내부 구조

다음 주는 운영자 도구 중 가장 자주 쓰는 **CloudWatch Metrics와 Logs의 내부 구조**다. 모든 알람과 디버깅의 출발점.

- Day 1: Metrics 데이터 모델 — Namespace, Dimension, Resolution(1초 vs 60초), cardinality explosion
- Day 2: Logs Group/Stream/Event 구조와 Subscription Filter, VPC Flow Logs 비용 함정
- Day 3: Logs Insights 쿼리 언어 — 운영자의 SQL, parse / filter / stats 패턴 라이브러리
- Day 4: Metric Filter, EMF 심화, Anomaly Detection의 ML 베이스라인
- Day 5: Week 2 복습 + 시나리오 10문제

Week 2를 다 보고 나면 콘솔의 그래프 더미를 보고 5초 안에 "지금 우리 서비스가 죽고 있는가"를 판단하는 감각이 생긴다. 그 감각이 SOA-C02 시험과 실무 운영의 50%다.
