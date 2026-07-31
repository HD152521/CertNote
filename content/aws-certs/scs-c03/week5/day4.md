# Day 4 - 전송 중/저장 암호화: TLS, 서비스별 저장 암호화, 키 회전

암호화는 데이터의 *상태*에 따라 둘로 나뉜다. 디스크·스토리지에 머무는 데이터를 보호하는 **저장 암호화(encryption at rest)**, 네트워크를 이동하는 데이터를 보호하는 **전송 중 암호화(encryption in transit)**다. SCS-C03는 "어느 서비스가 어떤 방식으로 저장 암호화하는가", "전송 암호화를 어떻게 *강제*하는가", "키 회전이 어떻게 동작하는가"를 구체적으로 묻는다. 오늘은 이 셋을 서비스별로 정리한다.

먼저 오늘의 관통 명제를 하나 세워 두자. **암호화는 "켰다/껐다"가 아니라 "누가 켤 수 있고, 안 켜면 어떻게 되는가"의 문제다.** 시험 문항이 `enable`이라는 단어 대신 *ensure*, *enforce*, *guarantee*, *prevent* 같은 동사를 쓰면 정답은 언제나 옵션 하나를 켜는 것이 아니라 **켜지 않으면 요청이 실패하도록 만드는 통제**다. 이 감각 하나로 오늘 나오는 문항의 절반이 풀린다.

```
[ 데이터 한 조각이 지나가는 세 구간과 각 구간의 통제 ]

  클라이언트 ──①전송중──▶ 엣지/LB ──②전송중──▶ 앱 ──③전송중──▶ 스토리지
                                                              │
                                                              ▼
                                                        ④ 저장 시점
                                                        (봉투 암호화)

  ① TLS 강제 : CloudFront viewer-protocol / ALB 리다이렉트 / 최소 TLS 버전
  ② 백엔드 재암호화 : origin-protocol=https-only, TG 프로토콜 HTTPS
  ③ 서비스별 강제 : S3 aws:SecureTransport / RDS force_ssl / EFS -o tls
  ④ 저장 암호화 : SSE-KMS · EBS 기본 암호화 · RDS 생성 시 설정

  "종단 간 암호화"란 ①②③이 모두 끊기지 않는다는 뜻이다.
  하나라도 평문 구간이 있으면 그 구간이 전체 보안 수준이 된다.
```

## 전송 중 암호화: TLS와 강제 기법

전송 암호화의 사실상 표준은 TLS다. 중요한 것은 "TLS를 *지원*하는 것"과 "평문 연결을 *거부*하는 것"이 다르다는 점이다. 보안 시험은 항상 **강제(enforce)**를 묻는다.

- **S3**: 버킷 정책에서 `aws:SecureTransport: false`인 요청을 Deny해 HTTP를 차단한다.

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

- **ALB/CloudFront**: HTTP 리스너를 HTTPS로 리다이렉트하고, viewer protocol policy를 `redirect-to-https`로. 보안 정책(security policy)으로 최소 TLS 버전(예: TLS 1.2+)을 강제.
- **RDS**: 파라미터 그룹의 `rds.force_ssl=1`(PostgreSQL)이나 사용자별 `REQUIRE SSL`(MySQL)로 SSL 연결을 강제. RDS는 인증서 번들(rds-ca)을 제공.
- **API Gateway**: 최소 TLS 버전을 설정하고 HTTPS만 노출.

> 💡 **관련 이론**: `aws:SecureTransport`는 *요청이 TLS로 왔는지*를 나타내는 글로벌 조건 키다. S3에서 이를 Deny 조건으로 쓰면 평문 HTTP 접근이 원천 차단된다. "S3 전송 암호화를 *강제*하라"는 시험 문제의 정답은 거의 항상 이 버킷 정책 Deny다 — 단순히 "HTTPS를 쓴다"가 아니라 "HTTP를 막는다".

### 서비스별 전송 암호화 강제 수단 한눈에

시험은 "이 서비스에서 TLS를 강제하는 *정확한* 손잡이"를 묻는다. 손잡이의 위치가 서비스마다 다르다는 것이 함정의 원천이다.

| 서비스 | 강제 손잡이 | 어디에 있나 |
|--------|-------------|-------------|
| S3 | `aws:SecureTransport: false` Deny | **버킷 정책**(리소스 정책) |
| CloudFront | Viewer protocol policy = `redirect-to-https` 또는 `https-only`, 최소 프로토콜 버전 | 배포 동작(behavior) 설정 |
| ALB | HTTP:80 리스너를 HTTPS로 리다이렉트 + 보안 정책으로 최소 TLS 버전 | 리스너 설정 |
| API Gateway | 사용자 지정 도메인의 보안 정책(TLS 1.2) | 도메인 설정 |
| RDS PostgreSQL | `rds.force_ssl = 1` | **파라미터 그룹** |
| RDS MySQL/MariaDB | `require_secure_transport = ON` 또는 사용자별 `REQUIRE SSL` | 파라미터 그룹 / DB 사용자 정의 |
| Redshift | `require_SSL = true` | 클러스터 파라미터 그룹 |
| EFS | 마운트 시 `-o tls`, + 파일 시스템 정책에서 `aws:SecureTransport` Deny | 클라이언트 옵션 + **리소스 정책** |
| ElastiCache | in-transit encryption(생성 시) + AUTH/RBAC | 클러스터 생성 옵션 |
| DynamoDB / SQS / SNS 등 API 계열 | 엔드포인트가 HTTPS 전용 + IAM/리소스 정책에 `aws:SecureTransport` 조건 | 정책 조건 |

여기서 읽어야 할 패턴이 있다. **강제 수단이 "리소스 정책"인 서비스(S3·EFS)는 어떤 클라이언트가 접속하든 서버가 거절**하지만, **"클라이언트 옵션"인 서비스(EFS 마운트 옵션, ElastiCache 접속)는 클라이언트가 협조해야** 한다. 그래서 EFS는 두 줄에 모두 등장한다 — 마운트 옵션만 믿으면 누군가 옵션 없이 마운트하는 순간 평문이 되므로, 파일 시스템 정책의 Deny로 서버 측에서 못 박아야 완결된다.

```json
// EFS 파일 시스템 정책 — 클라이언트가 TLS 없이 마운트하는 것을 서버가 거절
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyNonTlsMounts",
      "Effect": "Deny",
      "Principal": { "AWS": "*" },
      "Action": "*",
      "Resource": "*",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

> ⚠️ **함정**: "TLS를 켰다"와 "평문을 막았다"를 구분하지 못하면 오답으로 끌려간다. ALB에 HTTPS 리스너를 *추가*해도 HTTP:80 리스너가 살아 있으면 평문 접속은 그대로 가능하다. CloudFront에서 viewer protocol policy를 `HTTP and HTTPS`로 두면 마찬가지다. 강제란 **평문 경로를 없애거나 리다이렉트하는 것**이지 암호 경로를 추가하는 것이 아니다.

### 최소 TLS 버전: 오래된 프로토콜을 끊어내기

TLS를 쓴다고 다 같은 TLS가 아니다. SSLv3·TLS 1.0·TLS 1.1은 알려진 취약점 때문에 규제 요건(예: 카드 결제 관련 표준)에서 배제된다. AWS는 이를 **보안 정책(security policy)** 이라는 이름의 미리 정의된 묶음으로 제공한다.

```bash
# ALB 리스너의 보안 정책을 TLS 1.2 이상만 허용하는 정책으로 교체
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:listener/app/... \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06

# CloudFront 배포의 최소 뷰어 TLS 버전 확인
aws cloudfront get-distribution-config --id E1234ABCDEFGH \
  --query "DistributionConfig.ViewerCertificate.MinimumProtocolVersion"
```

> 🔍 **더 깊이**: 최소 TLS 버전을 올리는 결정은 순수한 보안 결정이 아니라 **호환성과의 거래**다. TLS 1.2 미만을 끊으면 아주 오래된 클라이언트(레거시 임베디드 기기, 구형 자바 런타임, 갱신되지 않은 결제 단말)가 접속하지 못한다. 그래서 실무 순서는 "먼저 끊고 문제를 본다"가 아니라 **"먼저 관측하고 끊는다"** 이다. CloudFront 표준 로그와 ALB 액세스 로그에는 협상된 TLS 프로토콜·암호 스위트 필드가 있으므로, Athena로 최근 30일치를 집계해 TLS 1.0/1.1로 들어오는 클라이언트의 비율과 정체를 먼저 파악한다. 이 데이터 없이 정책을 바꾸면 보안 개선이 곧 장애가 된다. 시험에서도 "레거시 클라이언트가 있다"는 단서가 붙으면 일괄 차단이 아니라 *별도 배포/리스너로 분리하고 기한을 두는* 선택지가 정답이 되곤 한다.

### 네트워크 내부 구간: AWS가 이미 하고 있는 것

"VPC 안이니까 암호화가 필요 없다"는 주장은 반은 맞고 반은 틀리다. AWS는 자사 글로벌 네트워크를 지나는 리전 간 트래픽을 물리 계층에서 암호화하고, Nitro 기반 인스턴스 사이의 VPC 트래픽도 하드웨어 수준에서 암호화한다. 그러나 이것은 **AWS가 제공하는 기반 보호**이지, 애플리케이션이 증명할 수 있는 통제가 아니다.

규제 감사에서 요구되는 것은 대개 "우리가 설정했고 우리가 증명할 수 있는" 암호화다. 그래서 심층 방어 관점의 답은 항상 같다 — 기반 계층의 보호에 기대지 말고 **애플리케이션 계층에서 TLS를 종단 간으로 유지**하고, 그 설정을 Config·Security Hub로 지속 평가한다.

## 저장 암호화: 서비스별 메커니즘

대부분의 AWS 스토리지 서비스는 봉투 암호화(Day 2)를 내부적으로 써서 저장 암호화한다. 차이는 *키 선택권*과 *기본값*이다.

### S3
세 가지 SSE 옵션 + 클라이언트 측 암호화:
- **SSE-S3**(`AES256`): S3가 키를 완전 관리. KMS 통제·감사 없음. 현재 모든 신규 객체에 기본 적용.
- **SSE-KMS**(`aws:kms`): KMS key로 봉투 암호화. 키 정책·CloudTrail 감사·교차계정 통제 가능. Bucket Key로 비용 최적화.
- **SSE-C**: 고객이 키를 매 요청에 제공(S3는 저장하지 않음).
- **CSE**: 클라이언트에서 암호화 후 업로드.

버킷 기본 암호화가 있어도 "반드시 *우리* KMS 키로만 저장되어야 한다"는 요구에는 정책 강제가 필요하다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyWrongEncryptionMethod",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::regulated-bucket/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    },
    {
      "Sid": "DenyWrongKmsKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::regulated-bucket/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id":
            "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-..."
        }
      }
    }
  ]
}
```

첫 문장이 "SSE-KMS가 아니면 거부", 두 번째가 "지정한 그 키가 아니면 거부"다. 두 번째가 없으면 사용자가 *자기 계정의 다른 키*로 암호화해 넣을 수 있고, 그러면 조직이 통제하지 못하는 키에 데이터가 묶인다.

> ⚠️ **함정**: 위와 같은 헤더 기반 Deny 정책은 **버킷 기본 암호화와 상호작용한다.** 기본 암호화가 켜져 있으면 클라이언트가 암호화 헤더를 보내지 않아도 S3가 알아서 암호화하지만, 위 정책은 *헤더가 없는 요청*을 거부해 버린다. 결과적으로 "암호화는 정상적으로 될 요청인데 정책 때문에 실패"하는 상황이 생긴다. 통제 의도가 "무조건 이 키를 쓰게 하라"라면 **버킷 기본 암호화를 그 키로 설정하는 것**이 1차 수단이고, 정책 Deny는 *명시적으로 다른 키를 지정하려는 시도*를 막는 2차 수단으로 설계하는 편이 사고가 적다.

### EBS
- 볼륨 생성 시 암호화 옵션. 계정·리전 단위로 *기본 암호화*를 강제할 수 있다(`Enable EBS encryption by default`).
- 암호화된 볼륨의 스냅샷·복원본·복사본은 *자동으로 암호화*된다.
- 암호화되지 않은 볼륨을 직접 암호화로 전환할 수는 없고, 스냅샷 → 암호화 복사 → 새 볼륨 경로를 쓴다.

```bash
# 리전 단위 기본 암호화 (신규 볼륨에 적용, 기존 볼륨은 바뀌지 않는다)
aws ec2 enable-ebs-encryption-by-default
aws ec2 modify-ebs-default-kms-key-id \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...
aws ec2 get-ebs-encryption-by-default

# 미암호화 스냅샷을 암호화 사본으로 복사 (전환의 핵심 단계)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 --source-snapshot-id snap-0abc \
  --encrypted --kms-key-id alias/app-data-key \
  --description "encrypted copy of snap-0abc"
```

### RDS / Aurora
- DB 인스턴스 생성 시에만 암호화를 켤 수 있다(생성 후 토글 불가).
- 기존 미암호화 DB를 암호화하려면 *암호화된 스냅샷으로 복원*하는 경로를 쓴다.
- 암호화 시 스토리지·자동 백업·읽기 복제본·스냅샷이 모두 암호화된다.

### 기타
- **DynamoDB**: 저장 암호화가 항상 켜져 있고(기본 AWS owned key), customer managed key로 전환 가능.
- **EFS**: 저장 암호화는 생성 시 설정, 전송 암호화는 마운트 옵션(`-o tls`).
- **Redshift / SQS / SNS / CloudWatch Logs / Secrets Manager**: 모두 KMS 기반 저장 암호화 지원.

### 서비스별 저장 암호화 비교표

| 서비스 | 기본값 | 키 선택 | 나중에 켤 수 있나 | 주의점 |
|--------|--------|---------|-------------------|--------|
| **S3** | SSE-S3로 신규 객체 자동 암호화 | SSE-S3 / SSE-KMS / SSE-C / CSE | 가능(기존 객체는 재업로드·복사 필요) | 기본 암호화는 *기존 객체를 소급 적용하지 않는다* |
| **EBS** | 리전별 기본 암호화 설정에 따름 | AWS managed(`aws/ebs`) 또는 CMK | 볼륨 자체는 불가 → 스냅샷 경유 | AWS managed key로 암호화한 스냅샷은 교차계정 공유 불가 |
| **RDS/Aurora** | 꺼짐 | AWS managed(`aws/rds`) 또는 CMK | 인스턴스 토글 불가 → 스냅샷 경유 | 암호화 켜면 백업·복제본·스냅샷까지 전부 암호화 |
| **DynamoDB** | **항상 켜짐**(AWS owned key) | AWS owned / AWS managed / CMK | 키 종류는 전환 가능 | CMK로 바꾸면 KMS 호출·비용이 발생 |
| **EFS** | 꺼짐(생성 시 선택) | AWS managed 또는 CMK | 파일 시스템 생성 후 변경 불가 | 전환하려면 새 파일 시스템 + DataSync 등으로 복사 |
| **CloudWatch Logs** | AWS 관리 암호화 | 로그 그룹에 CMK 연결 가능 | 가능(`associate-kms-key`) | 키를 지우면 로그를 읽을 수 없게 된다 |
| **SQS / SNS** | 꺼짐(SSE 옵션) | AWS managed 또는 CMK | 가능 | **다른 서비스가 메시지를 넣으려면 그 서비스 프린시펄에 키 권한이 필요** |

> ⚠️ **함정**: "기존 미암호화 RDS 인스턴스를 암호화하라" → 인스턴스를 직접 변경할 수 없다. 스냅샷을 만들고 *암호화된 사본으로 복사*한 뒤 그 스냅샷에서 복원한다. EBS도 유사하게 스냅샷 경유 경로다. "암호화 토글로 켜면 된다"는 보기는 오답.

> ⚠️ **함정**: SQS 큐를 CMK로 암호화한 뒤 "SNS 구독이나 EventBridge 규칙에서 메시지가 안 들어온다"는 사고가 잦다. 원인은 큐가 아니라 **키 정책**이다. 메시지를 넣는 주체가 AWS 서비스(`sns.amazonaws.com`, `events.amazonaws.com`)이므로, 그 서비스 프린시펄에 `kms:GenerateDataKey*`와 `kms:Decrypt`를 허용해야 한다. 암호화를 켜는 순간 **키 정책이 새로운 실패 지점이 된다**는 것이 이 패턴의 일반 교훈이다.

> 🎯 **시나리오**: "조직의 모든 신규 EBS 볼륨이 암호화되도록 보장하라." → 각 리전에서 *EBS encryption by default*를 켜고, SCP나 Config 규칙(`ebs-encryption-by-default`, `encrypted-volumes`)으로 누락을 탐지·교정한다.

### 기존 미암호화 리소스를 전환하는 표준 경로

"토글이 없다"는 제약 때문에 전환은 항상 *복사*를 거친다. 이 그림 하나가 EBS·RDS 문항을 공통으로 커버한다.

```
[ 미암호화 → 암호화 전환의 공통 골격 ]

  ① 스냅샷 생성            ② 암호화 사본 복사         ③ 복원
  ─────────────            ───────────────────       ────────
  미암호화 리소스   ──▶   snapshot (미암호화)  ──▶  snapshot (암호화)  ──▶  새 리소스(암호화)
                                              copy --encrypted            restore
                                              --kms-key-id CMK

  EBS  : create-snapshot → copy-snapshot --encrypted → create-volume → 볼륨 교체
  RDS  : create-db-snapshot → copy-db-snapshot --kms-key-id → restore-db-instance-from-db-snapshot
  공통 : ③ 이후 엔드포인트/마운트 전환이 필요하므로 **다운타임 계획이 반드시 따라온다**
         ("무중단으로 암호화 전환" 보기는 대개 오답 신호)
```

> 🔍 **더 깊이**: 이 경로에서 자주 잊히는 것이 **중간 산출물의 수명**이다. ①에서 만든 *미암호화 스냅샷*은 ②·③이 끝난 뒤에도 그대로 남아 있고, 그것 자체가 평문 데이터의 완전한 사본이다. 전환 작업을 "새 리소스가 뜨면 끝"으로 마무리하면 조직 안에 암호화되지 않은 데이터 사본이 조용히 축적된다. 전환 절차의 마지막 단계는 언제나 **원본과 중간 스냅샷의 파기**여야 하고, 감사에서는 그 파기 기록까지 요구된다. Config 규칙이 "미암호화 스냅샷 존재"를 지속 평가하도록 걸어 두는 것이 이 누락을 잡는 실용적 장치다.

## 키 회전: 자동 vs 수동

키 회전은 *같은 논리적 키를 유지하면서 암호화에 쓰이는 키 자료를 갱신*하는 것이다. 시험은 자동/수동의 동작 차이를 자주 묻는다.

회전이 왜 필요한지부터 짚자. 이유는 두 가지다. 하나는 **암호학적 이유** — 하나의 키로 암호화하는 데이터 양이 늘수록 분석 여지가 커지므로 주기적으로 키 자료를 바꾸는 것이 표준 위생이다. 다른 하나는 훨씬 현실적인 **노출 대응** — 키 자료가 어느 시점에 유출됐다면, 회전은 "그 이후에 만들어진 데이터는 안전하다"는 경계선을 그어 준다. 두 번째 이유가 회전의 핵심 가치이며, 동시에 회전의 한계도 여기서 나온다. **회전은 과거를 구제하지 못한다.**

**자동 회전(automatic key rotation)**
- customer managed key에서 켤 수 있다(`enable-key-rotation`). 기본 *매년*(원하면 90~2560일 사이로 주기 설정 가능).
- KMS가 새 키 자료를 만들고, *키 ID·ARN·별칭은 그대로 유지*된다. 과거 키 자료는 보관되어 *옛 데이터도 계속 복호화*된다.
- 애플리케이션 변경이 전혀 필요 없다. 가장 운영 부담이 낮다.
- **AWS managed key**는 회전이 *자동·고정*(끄거나 주기 변경 불가).
- **비대칭 키·EXTERNAL(BYOK)·CloudHSM 키는 자동 회전 불가**.

```bash
aws kms enable-key-rotation --key-id alias/app-data-key
aws kms get-key-rotation-status --key-id alias/app-data-key
```

주기를 지정하거나, 일정과 무관하게 지금 당장 한 번 돌려야 할 때(노출 의심 등)를 위한 명령도 있다.

```bash
# 회전 주기를 180일로 지정
aws kms enable-key-rotation \
  --key-id alias/app-data-key \
  --rotation-period-in-days 180

# 일정과 무관하게 즉시 1회 회전 (키당 실행 횟수에 상한이 있다)
aws kms rotate-key-on-demand --key-id alias/app-data-key

# 이 키가 언제 회전됐는지 이력 확인 — 감사 증적으로 쓰인다
aws kms list-key-rotations --key-id alias/app-data-key
```

```
[ 자동 회전 후 키 내부 상태 ]

  KMS key  (키 ID·ARN·별칭 = 변하지 않음)
    ├── 키 자료 v1  ── 2024년에 만들어진 암호문을 푸는 데 계속 사용 (보관)
    ├── 키 자료 v2  ── 2025년 암호문 (보관)
    └── 키 자료 v3  ── 현재 활성. 새 암호화는 전부 여기로  ◀── 활성

  · 애플리케이션은 여전히 같은 ARN을 호출한다 → 코드 변경 0
  · 옛 암호문은 알아서 옛 키 자료로 풀린다 → 마이그레이션 0
  · 그러나 옛 데이터는 여전히 v1으로 암호화된 상태다 → 재암호화 아님
```

**수동 회전(manual rotation)**
- 새 KMS 키를 만들고 *별칭(alias)을 새 키로 갱신*한다. 자동 회전이 불가능한 키(비대칭·BYOK)나 키 ID 자체를 바꾸고 싶을 때.
- 옛 데이터는 옛 키로 복호화해야 하므로 두 키를 함께 유지한다. 별칭을 가리키게 하면 새 암호화는 새 키로 간다.

```bash
# ① 새 키 생성 → ② 별칭을 새 키로 갱신 → ③ 옛 키는 복호화 전용으로 남긴다
NEW_KEY=$(aws kms create-key --description "app-data-key 2026H2" \
          --query KeyMetadata.KeyId --output text)
aws kms update-alias --alias-name alias/app-data-key --target-key-id "$NEW_KEY"
# 옛 키는 삭제하지 말 것 — 과거 암호문이 아직 그 키에 묶여 있다
```

| 구분 | 자동 회전 | 수동 회전 | 재암호화(ReEncrypt) |
|------|-----------|-----------|---------------------|
| 무엇이 바뀌나 | **키 자료만** | **키 자체**(새 키 ID·ARN) | 데이터 키를 감싼 **키가 바뀜** |
| 키 ID/ARN | 유지 | 변경(별칭으로 흡수) | 대상 암호문의 키 ARN이 바뀜 |
| 애플리케이션 영향 | 없음 | 별칭을 쓰고 있었다면 없음 | 배치 작업 필요 |
| 옛 데이터 | 옛 키 자료로 계속 복호화 | 옛 키를 유지해야 복호화 | **새 키로 이전 완료** |
| 지원 키 종류 | 대칭 CMK만 | 모든 종류(비대칭·BYOK 포함) | KMS 암호문 전반 |
| 운영 부담 | 가장 낮음 | 중간(별칭·옛 키 관리) | 가장 높음 |
| 언제 고르나 | "운영 부담 없이 정기 회전" | "비대칭/BYOK 회전", "키를 갈아치워야 함" | "옛 키 의존을 완전히 끊어야 함" |

> 💡 **관련 이론**: 자동 회전은 *키 자료만* 바뀌고 키 식별자는 그대로라 투명하다. 수동 회전은 *키 자체*가 바뀌어 별칭 갱신과 옛 키 유지가 필요하다. 시험에서 "비대칭 키를 회전하라"면 자동 회전이 안 되므로 수동(새 키 + 별칭 갱신)이 정답이다. "운영 부담 없이 정기 회전" → 대칭 CMK 자동 회전.

> ⚠️ **함정**: 자동 회전을 켜면 *옛날 데이터를 재암호화하지 않는다*. 옛 데이터는 보관된 옛 키 자료로 복호화되고, 회전 후 새 데이터만 새 키 자료로 암호화된다. "회전하면 기존 데이터가 새 키로 다시 암호화된다"는 오해를 노린 보기에 주의.

> ⚠️ **함정**: 수동 회전에서 **옛 키를 지우는 것**이 가장 치명적인 실수다. 별칭을 새 키로 옮기면 새 암호화는 잘 돌아가므로 "이제 옛 키는 필요 없다"고 판단하기 쉬운데, 과거 암호문은 여전히 옛 키에 묶여 있다. 옛 키를 지우는 순간 그 데이터는 영구 복구 불가가 된다. 옛 키를 정리하려면 먼저 `ReEncrypt`로 모든 암호문을 새 키로 옮기고, CloudTrail에서 그 키에 대한 `Decrypt`가 충분히 오랫동안 0인지 확인한 다음에야 삭제를 예약한다.

> 🎯 **시나리오**: "규제 기관이 '암호화 키는 최소 연 1회 교체되며 그 이력을 증빙할 수 있어야 한다'고 요구했다. 애플리케이션 팀은 코드 변경이나 데이터 마이그레이션을 감당할 수 없다고 한다." → 대칭 customer managed key에 **자동 회전을 켜고**, 증빙은 `GetKeyRotationStatus`·`ListKeyRotations`와 CloudTrail의 `EnableKeyRotation`·회전 이벤트로 제출한다. 자동 회전은 키 ARN이 유지되므로 코드 변경이 0이고, 옛 키 자료가 보관되어 마이그레이션도 0이다. 여기에 AWS Config로 "회전이 켜져 있지 않은 CMK"를 지속 평가하면 *증빙*과 *드리프트 탐지*가 동시에 해결된다.

### CloudTrail로 회전과 암호화 동작 읽기

암호화·회전이 실제로 작동하는지는 로그로 증명해야 한다. 오늘 다룬 서비스들의 KMS 호출은 특징적인 흔적을 남긴다.

```json
// EBS 볼륨이 붙을 때 — EC2가 사용자를 대신해 데이터 키를 요청한다
{
  "eventName": "GenerateDataKeyWithoutPlaintext",
  "eventSource": "kms.amazonaws.com",
  "sourceIPAddress": "ec2.amazonaws.com",
  "requestParameters": {
    "encryptionContext": { "aws:ebs:id": "vol-0a1b2c3d4e5f" },
    "keySpec": "AES_256"
  }
}
```

```json
// 회전을 켠 행위 자체도 증적이 된다
{
  "eventName": "EnableKeyRotation",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:iam::111122223333:role/SecurityKeyAdmin" },
  "requestParameters": { "keyId": "1234abcd-...", "rotationPeriodInDays": 365 }
}
```

| 관찰 | 해석 |
|------|------|
| `GenerateDataKeyWithoutPlaintext` + 컨텍스트에 `aws:ebs:id` | EBS 저장 암호화가 실제로 동작 중. 암호화 여부의 직접 증거 |
| `sourceIPAddress`가 `ec2/rds/s3.amazonaws.com` | 서비스 통합 경로. 사람이 직접 부른 것이 아님 |
| `EnableKeyRotation` / `DisableKeyRotation` | 회전 통제의 변경. **Disable은 항상 경보 대상** |
| `Decrypt` 실패(`DisabledException`) 급증 | 키가 disable됐거나 삭제 대기 중 — 서비스 장애의 원인 |
| `Decrypt` 실패(`KMSInvalidStateException`) | 삭제 예약된 키를 계속 쓰고 있다는 신호. 삭제 전 반드시 확인해야 할 지표 |
| 특정 키에 대한 호출이 수개월간 0 | 미사용 키. 정리 후보이되, *분기 배치*가 있을 수 있으니 1년 단위로 확인 |

## TLS 인증서 관리: ACM

전송 암호화의 인증서는 ACM(AWS Certificate Manager)으로 관리한다. ACM 발급 인증서는 *DNS 검증*으로 자동 갱신되고, *프라이빗 키가 추출되지 않으며*, CloudFront(us-east-1)·ALB·API Gateway 등에 통합된다. 외부 발급 인증서를 가져올 수도 있으나 자동 갱신은 ACM 발급 인증서에 한한다. (4주차 Day 4에서 ACM 리전 규칙을 다뤘다.)

이 세 가지 성질을 보안 관점으로 다시 읽으면 각각의 의미가 분명해진다.

| ACM의 성질 | 보안적 의미 | 대비되는 상황 |
|------------|-------------|---------------|
| 프라이빗 키를 추출할 수 없음 | 인증서 키가 개발자 노트북·Git·위키로 새어 나갈 경로 자체가 없다 | 직접 발급한 키는 배포 과정 어딘가에 평문 파일로 존재한다 |
| DNS 검증 + 자동 갱신 | 만료로 인한 장애와 "갱신 담당자 부재" 리스크가 사라진다 | 수동 갱신은 사람의 캘린더에 의존한다 |
| AWS 서비스에 직접 결합 | 인증서 교체 시 서버에 파일을 배포할 필요가 없다 | 서버마다 파일을 갈아 끼우는 순간 드리프트가 생긴다 |

가져온(imported) 인증서는 이 세 가지 이점을 전부 잃는다. 그래서 실무 원칙은 명확하다 — **AWS 서비스 앞단에 붙는 퍼블릭 인증서는 가능한 한 ACM에서 발급받는다.** 외부 CA를 반드시 써야 하는 규제 상황이라면, 최소한 만료 모니터링(ACM의 만료 임박 이벤트, `DaysToExpiry` 지표)만은 반드시 걸어 둔다. 내부 서비스 간 mTLS처럼 조직 자체 CA가 필요하면 **AWS Private CA**가 그 자리를 맡는다.

> 📚 **사례**: 2014년 OpenSSL의 Heartbleed(CVE-2014-0160) 취약점은 TLS 하트비트 확장의 경계 검사 누락 때문에 서버 프로세스 메모리를 조각조각 읽어낼 수 있게 만들었고, 그 조각에 **서버의 프라이빗 키가 포함될 수 있다**는 점이 사태를 심각하게 만들었다. 이때 전 세계 운영자들이 한 일은 패치만이 아니었다 — 키가 새어 나갔을 가능성을 배제할 수 없으니 **모든 인증서를 재발급하고 기존 인증서를 폐기(revoke)** 해야 했고, 이 과정에서 수동으로 키를 관리하던 조직들이 며칠에서 몇 주를 소모했다. 여기서 오늘의 두 주제가 하나로 만난다. 첫째, **회전은 평시의 위생이 아니라 사고 시의 복구 수단**이다. 회전 절차가 자동화되어 있지 않은 조직은 사고가 났을 때 회전을 *못 한다*. 둘째, **키를 꺼낼 수 없게 만드는 설계가 유출 자체를 줄인다** — ACM과 KMS가 프라이빗 키를 서비스 경계 밖으로 내보내지 않는 이유가 정확히 이것이다. 시험에서 "인증서 프라이빗 키 유출 위험을 최소화하라"는 요구에 ACM이 정답인 근거도 같다.

> 🔍 **더 깊이**: TLS 취약점의 역사는 "최소 버전 강제"라는 통제가 왜 필요한지도 함께 설명한다. 2014년 POODLE 공격은 SSL 3.0의 CBC 패딩 처리 방식을 파고들었고, 그 결과 SSL 3.0은 사실상 폐기됐다. 문제는 당시 많은 서버가 **구형 클라이언트 호환을 위해 SSL 3.0으로의 다운그레이드를 허용**하고 있었다는 점이다. 즉 최신 TLS를 *지원*하는 것만으로는 부족하고, 낡은 버전으로 내려앉는 경로를 *닫아야* 안전해진다. 오늘 앞부분의 "지원과 강제는 다르다"는 명제가 프로토콜 버전 차원에서 반복되는 셈이다. ALB·CloudFront의 보안 정책은 바로 그 다운그레이드 경로를 닫는 손잡이다.

## 정리하며

오늘의 뼈대는 세 문장으로 압축된다.

첫째, **전송 암호화의 핵심은 강제다.** TLS를 켜는 것이 아니라 평문 경로를 없애는 것이고, 그 손잡이는 서비스마다 다른 곳에 있다 — S3는 버킷 정책의 `aws:SecureTransport` Deny, RDS는 파라미터 그룹의 `force_ssl`/`require_secure_transport`, ALB·CloudFront는 리다이렉트와 최소 TLS 버전, EFS는 마운트 옵션과 파일 시스템 정책의 조합이다. 리소스 정책으로 막을 수 있는 서비스는 반드시 리소스 정책으로 막는다.

둘째, **저장 암호화의 핵심은 기본값과 전환 경로다.** DynamoDB처럼 항상 켜진 것, S3처럼 기본으로 켜지는 것, RDS·EFS처럼 생성 시에만 정할 수 있는 것이 뒤섞여 있다. 나중에 켤 수 없는 서비스는 *스냅샷 → 암호화 사본 복사 → 복원*이라는 공통 골격을 따르고, 그 절차의 마지막은 언제나 미암호화 원본과 중간 스냅샷의 파기다. 그리고 암호화를 켜는 순간 키 정책이 새로운 실패 지점이 된다 — SQS·SNS·CloudWatch Logs에서 "다른 서비스가 못 쓴다"는 증상의 원인은 대개 큐가 아니라 키다.

셋째, **회전의 핵심은 무엇이 바뀌는지 정확히 아는 것이다.** 자동 회전은 키 자료만 갈아 끼워 키 ARN과 옛 데이터를 그대로 두므로 운영 부담이 0이지만, 대칭 CMK에만 쓸 수 있고 과거 데이터를 재암호화하지 않는다. 비대칭·BYOK는 새 키 + 별칭 갱신의 수동 회전이며, 이때 옛 키를 지우면 과거 데이터가 죽는다. 옛 키 의존을 진짜로 끊고 싶으면 `ReEncrypt` 배치가 필요하다. 마지막으로 인증서는 프라이빗 키를 꺼낼 수 없는 ACM에 맡기고, 만료와 회전 상태를 Config·CloudTrail로 지속 증명한다.

---

## 📝 연습 문제

**문제 1.** S3 버킷에 대한 *전송 중 암호화를 강제*하라는 요구를 받았다. 가장 정확한 구현은?

A) 버킷 기본 암호화를 SSE-KMS로 설정  
B) 버킷 정책에서 `aws:SecureTransport`가 `false`인 요청을 Deny해 평문 HTTP 접근을 차단  
C) CloudFront를 앞에 둔다  
D) 객체에 SSE-C를 적용  

**정답: B**  
해설: 전송 중 암호화 강제는 평문(HTTP) 연결을 *거부*하는 것이다. 버킷 정책에서 `aws:SecureTransport: false`를 Deny하면 TLS가 아닌 요청이 차단된다. SSE-KMS·SSE-C는 *저장* 암호화 방식이라 전송과 무관하고, CloudFront 배치는 HTTP를 막는 강제가 아니다.

---

**문제 2.** 기존에 암호화 없이 운영 중인 RDS MySQL 인스턴스를 저장 암호화하려 한다. 올바른 절차는?

A) 인스턴스 설정에서 암호화 토글을 켠다  
B) 스냅샷을 만들고 *암호화된 사본으로 복사*한 뒤 그 스냅샷에서 새 인스턴스를 복원한다  
C) 파라미터 그룹에서 `force_ssl`을 켠다  
D) DynamoDB로 마이그레이션한다  

**정답: B**  
해설: RDS 암호화는 인스턴스 생성 시에만 설정 가능하고 나중에 토글할 수 없다. 기존 미암호화 인스턴스는 스냅샷 → 암호화된 사본 복사 → 복원 경로로 암호화한다. `force_ssl`은 *전송* 암호화 강제이지 저장 암호화가 아니며, DynamoDB 마이그레이션은 불필요한 과잉 조치다.

---

**문제 3.** 운영 부담 없이 대칭 customer managed key를 정기적으로 회전하려 한다. 자동 키 회전에 대한 설명으로 가장 정확한 것은?

A) 회전 시 키 ID와 ARN이 바뀌므로 애플리케이션을 수정해야 한다  
B) 키 자료만 갱신되고 키 ID·ARN·별칭은 유지되며, 옛 키 자료는 보관되어 기존 데이터도 계속 복호화된다  
C) 회전하면 기존 데이터가 자동으로 새 키로 재암호화된다  
D) 비대칭 키도 동일하게 자동 회전된다  

**정답: B**  
해설: 자동 회전은 키 자료만 투명하게 갱신하고 키 식별자는 그대로라 애플리케이션 변경이 필요 없으며, 옛 키 자료가 보관되어 과거 데이터도 계속 복호화된다. 기존 데이터를 새 키로 재암호화하지는 않는다. 비대칭 키·BYOK는 자동 회전이 불가능하다.

---

**문제 4.** 자동 회전이 불가능한 비대칭 KMS 키를 정기적으로 교체해야 한다. 가장 적절한 방법은?

A) `enable-key-rotation`을 호출한다  
B) 새 비대칭 키를 만들고 별칭(alias)을 새 키로 갱신하며, 옛 키는 과거 데이터 복호화용으로 유지하는 수동 회전을 수행한다  
C) 키를 대칭으로 변환한다  
D) 회전이 불가능하므로 아무것도 하지 않는다  

**정답: B**  
해설: 비대칭 키는 KMS 자동 회전을 지원하지 않으므로, 새 키를 만들고 별칭을 갱신해 새 암호화는 새 키로 보내고 옛 키는 과거 데이터 복호화를 위해 유지하는 수동 회전을 한다. `enable-key-rotation`은 비대칭 키에 적용되지 않고, 키 종류는 변환할 수 없으며, 보안상 정기 교체가 필요한 키를 방치하면 안 된다.

---

**문제 5.** 조직의 모든 신규 EBS 볼륨이 예외 없이 저장 암호화되도록 보장하려 한다. 가장 효과적인 조합은?

A) 사용자에게 암호화 체크박스를 켜라고 안내  
B) 각 리전에서 EBS encryption by default를 활성화하고, AWS Config 규칙(`encrypted-volumes` 등)으로 미암호화 볼륨을 탐지·교정  
C) 볼륨마다 SSE-C 적용  
D) S3 버킷 정책으로 통제  

**정답: B**  
해설: 리전별 EBS encryption by default는 신규 볼륨을 자동 암호화하고, Config 규칙으로 누락·드리프트를 탐지·교정하는 예방+탐지 조합이 보장 요구에 맞는다. 사용자 안내는 강제력이 없고, SSE-C는 S3 객체 암호화 방식이며, S3 버킷 정책은 EBS와 무관하다.

---
