# Day 1 - KMS 심화: 봉투 암호화의 수학, Key Policy의 권한 모델, 멀티 리전 키

암호화를 처음 설계하는 엔지니어가 가장 먼저 부딪히는 모순이 있다. "데이터를 암호화하려면 키가 필요한데, 그 키는 또 어디에 안전하게 보관하나?" 키를 데이터 옆에 평문으로 두면 암호화의 의미가 없고, 키를 사람이 외워서 매번 입력하는 것도 비현실적이다. 이 "키를 보호하는 키" 문제(key management problem)는 암호학에서 수십 년 묵은 난제이고, 클라우드는 이를 **하드웨어 기반 루트 키 + 봉투 암호화(envelope encryption)**라는 구조로 푼다. AWS KMS(Key Management Service)는 바로 이 구조를 관리형으로 제공하는 서비스다.

SAP-C02 시험에서 KMS는 "어떤 키 유형을 골라야 하나", "Key Policy와 IAM의 권한이 충돌하면 어떻게 되나", "Cross-Account·Cross-Region 복호화를 어떻게 설계하나", "컴플라이언스가 FIPS 140-2 Level 3을 요구하면 무엇을 쓰나"라는 아키텍처 의사결정으로 출제된다. 오늘은 KMS의 내부 동작을 봉투 암호화의 수학까지 들어가 분해하고, 권한 모델의 미묘한 함정과 멀티 리전 키의 DR 설계를 정리한다.

## 봉투 암호화 — 왜 KMS는 데이터를 직접 암호화하지 않는가

가장 흔한 오해는 "KMS가 내 데이터를 암호화한다"는 것이다. 사실 KMS는 당신의 큰 데이터(수 GB의 S3 객체, EBS 볼륨)를 직접 암호화하지 **않는다**. KMS의 `Encrypt` API는 최대 4KB까지만 받는다. 그렇다면 거대한 데이터는 어떻게 암호화되는가? 답이 **봉투 암호화(envelope encryption)**다.

흐름은 이렇다. 데이터를 암호화할 때 KMS에 `GenerateDataKey`를 호출하면, KMS는 두 가지를 돌려준다. (1) **평문 데이터 키(plaintext DEK)** — 실제로 데이터를 암호화하는 데 쓸 AES-256 키, (2) **암호화된 데이터 키(encrypted DEK)** — 그 DEK를 당신의 KMS 마스터 키(CMK)로 감싼 버전. 애플리케이션은 평문 DEK로 데이터를 빠르게 로컬 암호화한 뒤, **평문 DEK는 메모리에서 즉시 폐기**하고, 암호화된 데이터 옆에 암호화된 DEK만 저장한다.

```
[암호화]
GenerateDataKey(CMK) → 평문 DEK + 암호화된 DEK
   ↓
데이터 ← 평문 DEK로 로컬 암호화 (AES-256)
   ↓
저장: [암호화된 데이터] + [암호화된 DEK]   ← 평문 DEK는 즉시 폐기

[복호화]
암호화된 DEK → KMS Decrypt(CMK) → 평문 DEK
   ↓
암호화된 데이터 ← 평문 DEK로 로컬 복호화
```

이 구조의 핵심은 "마스터 키(CMK)는 절대 KMS 하드웨어를 떠나지 않는다"는 것이다. CMK는 HSM 안에서만 존재하며 `Encrypt`/`Decrypt` 요청이 들어올 때만 HSM 내부에서 연산하고 평문 키는 밖으로 나오지 않는다. 데이터를 실제로 암호화하는 DEK만 잠깐 평문으로 노출됐다가 사라진다.

> 💡 **관련 이론**: 왜 굳이 2단계로 나누는가? 세 가지 이유가 수학·운영 양면에서 작동한다. 첫째 **성능** — 대칭 암호(AES)는 빠르지만 KMS 왕복(네트워크 호출)은 느리다. GB 단위 데이터를 4KB씩 쪼개 KMS에 보내면 수백만 번 왕복해야 한다. DEK를 한 번만 받아 로컬에서 암호화하면 네트워크 왕복이 1회로 끝난다. 둘째 **키 회전의 효율** — 마스터 키를 교체해도 데이터 자체를 다시 암호화할 필요 없이 "암호화된 DEK"만 다시 감싸면 된다(re-wrap). 페타바이트 데이터를 재암호화하지 않고 키를 회전할 수 있다. 셋째 **격리** — 평문 마스터 키가 절대 애플리케이션 메모리에 노출되지 않아, 메모리 덤프 공격에도 마스터 키는 안전하다. 이 패턴은 PGP의 세션 키 구조, TLS의 키 교환과 본질적으로 같은 아이디어다 — 느리고 안전한 비대칭/마스터 키로 빠른 대칭 세션 키를 보호한다.

> 🔍 **더 깊이**: DEK 캐싱(`aws-encryption-sdk`의 data key caching)은 봉투 암호화의 성능을 한 단계 더 끌어올린다. 매 객체마다 `GenerateDataKey`를 호출하면 KMS API 호출 비용($0.03/10,000회)과 지연이 쌓인다. AWS Encryption SDK는 하나의 DEK를 설정된 횟수·바이트·시간 한도 내에서 재사용해 KMS 호출을 줄인다. 단 보안 트레이드오프가 있다 — 같은 DEK를 너무 오래/많이 재사용하면 하나의 DEK 유출 시 영향 범위가 커진다. NIST SP 800-38D는 단일 키로 암호화하는 데이터량에 상한을 두라고 권고하며(GCM 모드의 nonce 재사용 위험), 캐시 한도는 이 권고와 비용 사이의 균형점이다.

## KMS 키 유형 — 소유와 통제의 스펙트럼

| 유형 | 키 소유·생성 | 자동 로테이션 | 정책 통제 | 대표 사용처 |
|------|-------------|--------------|-----------|------------|
| **AWS Owned Key** | AWS (공유) | AWS 자동 | 불가(안 보임) | 서비스 기본 암호화 |
| **AWS Managed Key** (`aws/service`) | AWS (계정별) | 1년 자동(강제) | 제한적 | 서비스 통합 기본 |
| **Customer Managed Key (CMK)** | 고객 | 활성화 시 1년 | 완전 통제 | 정책·감사·회전 제어 |
| **Imported Key Material (BYOK)** | 고객(외부 생성) | **불가** | 완전 통제 | 키 출처 통제·컴플라이언스 |
| **Custom Key Store (CloudHSM)** | 고객(전용 HSM) | 가능 | 완전 통제 | FIPS 140-2 L3·단일 테넌트 |

세 유형의 차이를 "통제권의 스펙트럼"으로 보면 명확하다. AWS Owned는 당신 눈에 보이지도 않고(키 ID도 없음), AWS Managed는 보이지만 정책을 거의 못 건드리며, CMK는 키 정책·로테이션·삭제·태그를 완전히 통제한다. 시험에서 "키 정책을 직접 통제해야 한다", "회전 주기를 제어해야 한다", "CloudTrail로 키 사용을 감사해야 한다"는 요구가 나오면 거의 항상 **CMK**가 정답이다.

> 🔍 **더 깊이**: AWS Managed Key와 Customer Managed Key는 비용 구조가 다르다. AWS Managed Key는 월 사용료가 없고 API 호출 비용만 든다. CMK는 키당 **월 $1**의 보관료 + API 호출 비용이 든다. 그래서 "수만 개의 테넌트마다 별도 CMK"를 만드는 멀티테넌시 설계는 비용 폭탄이 된다. 이 경우 **하나의 CMK + 테넌트별 DEK**(봉투 암호화) 또는 **Encryption Context**로 논리적 분리를 하는 게 표준 패턴이다. SAP 시험에서 "수천 테넌트 격리 + 비용"이 나오면 "테넌트마다 CMK"는 함정이고, 공유 CMK + 컨텍스트 분리가 정답인 경우가 많다.

> 📚 **사례**: 한 핀테크는 규제상 "키 머터리얼은 우리가 생성하고, AWS는 그것을 절대 영구 보관해선 안 된다"는 요구를 받았다. 해법은 **BYOK(Imported Key Material)** — 자사 온프레미스 HSM에서 키를 생성해 KMS에 import했다. 트레이드오프가 분명했다. 장점: 키 출처를 자사가 완전히 통제하고, import한 키는 만료일을 설정하면 KMS가 캐시만 보관하다 만료 시 삭제한다. 단점: **자동 로테이션이 불가능**해 회전 때마다 새 키를 직접 생성·import해야 하고, KMS가 키를 분실하면(리전 장애 등) 복구는 오직 자사 HSM의 원본 재import뿐이다. 교훈: BYOK는 통제권을 얻는 대신 운영 부담과 자동 로테이션을 포기하는 거래다. 시험에서 "외부 생성 키 + 만료 설정"이면 Imported, 동시에 "자동 로테이션"을 요구하면 모순이므로 그 선택지는 오답이다.

## 권한 모델 — Key Policy, IAM, Grant의 3중 체크

KMS 권한이 헷갈리는 이유는 일반적인 AWS 서비스와 권한 평가 순서가 다르기 때문이다. 대부분의 서비스는 IAM Policy만으로 접근을 허용할 수 있다. 그러나 KMS는 **Key Policy가 모든 권한의 루트**다. 키마다 붙는 Key Policy가 "이 키에 누가 접근할 수 있는가"의 최종 권위이며, IAM Policy는 Key Policy가 명시적으로 위임했을 때만 효력을 가진다.

권한은 세 가지 메커니즘으로 부여된다.

1. **Key Policy** (필수·루트) — 키 자체에 붙는 리소스 기반 정책. 기본 Key Policy는 보통 계정 루트(`arn:aws:iam::123456789012:root`)에 `kms:*`를 허용하는 한 줄을 포함하는데, 이것이 "IAM에게 권한 위임"을 의미한다.
2. **IAM Policy** — 호출자(역할·사용자)에 붙는 정책. **Key Policy가 IAM 위임을 허용한 경우에만** 효력이 있다.
3. **Grant** — 임시·세분화·취소 가능한 위임. AWS 서비스가 당신 대신 키를 잠깐 쓸 때 자동 생성하며(예: EBS가 볼륨 암호화 시), `RetireGrant`/`RevokeGrant`로 즉시 회수된다.

핵심 함정은 **"IAM Policy만으로 KMS 권한을 줄 수 있다"는 착각**이다. Key Policy에 "계정 루트에 위임" 한 줄이 없으면, 아무리 IAM에서 `kms:Decrypt`를 허용해도 거부된다. 반대로 Key Policy에서 특정 역할을 직접 허용하면 IAM 정책 없이도 작동한다.

> 💡 **관련 이론**: KMS의 이 모델은 보안 이론의 **fail-safe defaults(안전한 기본값)** 원칙을 구현한 것이다. 1975년 Saltzer와 Schroeder가 정리한 보안 설계 8원칙 중 하나로, "접근은 명시적 허가에 기반해야지 명시적 거부에 기반해선 안 된다(기본은 거부)"는 내용이다. KMS는 Key Policy라는 단일 권위를 두어 "어떤 IAM 관리자도 키 소유자의 의도를 우회할 수 없게" 만든다. Cross-Account 시나리오에서 이 설계가 빛난다 — 다른 계정이 내 키를 쓰려면 (1) 내 Key Policy가 그 계정을 명시적으로 허용하고, (2) 그 계정의 IAM이 자기 역할에 권한을 줘야 한다. **양쪽 모두** 허용해야 하므로, 한쪽 계정 관리자가 실수로 권한을 열어도 다른 쪽이 막혀 있으면 안전하다(defense in depth).

> ⚠️ **함정**: "Lambda 함수가 KMS로 복호화하게 하라"는 시나리오에서 "Lambda 실행 역할에 IAM으로 `kms:Decrypt`만 주면 된다"를 고르면 **불완전(오답 가능)**하다. Key Policy에 계정 루트 위임이 없으면 IAM 권한이 무효다. 정답 구성은 (1) Key Policy에 `Principal: {AWS: "arn:...:root"}` + `Action: kms:*` 위임이 존재하고, (2) Lambda 역할 IAM에 `kms:Decrypt`를 부여하는 것이다. 시험 선택지에서 "Key Policy 수정 없이 IAM만으로"는 종종 함정이다.

> 🔍 **더 깊이**: **Grant vs Key Policy 수정**의 선택은 "변경 빈도·세분화·자동화"로 갈린다. Key Policy는 키당 32KB 크기 제한이 있고, 수정하려면 `PutKeyPolicy` 권한이 필요하며 변경이 감사 로그에 남는다. 수백 개의 단기 위임을 Key Policy에 다 적으면 금세 한도를 넘고 관리가 불가능하다. **Grant**는 이를 위한 메커니즘 — 프로그래밍적으로 생성/회수 가능하고, 특정 작업(`Encrypt`만 등)으로 세분화하며, `GrantToken`으로 즉시 효력이 발생하고(정책 전파 지연 없음), 작업이 끝나면 `RetireGrant`로 자동 회수된다. AWS 서비스 통합(EBS, RDS, Redshift 등)이 내부적으로 Grant를 쓰는 이유가 이것이다. 시험에서 "서비스가 일시적으로 키를 사용 후 즉시 회수" "세분화된 임시 위임"은 Grant가 정답이다.

## 키 로테이션 — 자동·수동·BYOK의 차이

키 로테이션은 "오래된 키일수록 노출 위험이 누적된다"는 전제에서 나온 보안 관행이다. KMS의 로테이션은 세 가지로 나뉜다.

- **자동 로테이션**: 대칭 CMK에서 활성화하면 KMS가 **1년(365일)마다** 새 키 머터리얼을 생성한다. 중요한 점 — **키 ID와 ARN은 그대로** 유지되고 내부 백킹 키만 교체된다. 그래서 애플리케이션은 아무것도 바꿀 필요가 없고, 과거 데이터는 과거 키 버전으로 자동 복호화된다(KMS가 모든 버전을 보관). 2022년부터는 자동 로테이션 주기를 90일~2560일 범위로 설정할 수 있게 됐다.
- **수동 로테이션**: 완전히 새 키를 만들고 **alias를 새 키로 이동**시킨다. 키 ID가 바뀌므로 과거 데이터는 옛 키로, 신규 데이터는 새 키로 암호화된다. BYOK나 비대칭 키처럼 자동 로테이션이 안 되는 경우에 쓴다.
- **Imported Key(BYOK)**: 자동 로테이션 **불가**. 회전하려면 새 키 머터리얼을 만들어 다시 import해야 한다.

> 💡 **관련 이론**: "키 ID는 그대로, 백킹 키만 교체"라는 자동 로테이션 설계가 운영적으로 결정적인 이유는 봉투 암호화와 맞물린다. 데이터 자체는 DEK로 암호화돼 있고, DEK는 CMK로 감싸여 있다. CMK가 회전해도 과거에 만든 "암호화된 DEK"는 과거 CMK 버전으로 복호화되며(KMS가 버전을 다 보관), 새로 만드는 DEK만 새 CMK 버전으로 감싸인다. 즉 **데이터를 재암호화하지 않고도** 마스터 키가 회전한다. 이것이 페타바이트 규모에서도 키 로테이션이 무중단·무비용에 가깝게 가능한 이유다.

> ⚠️ **함정**: "키 삭제는 즉시 되는가?" — **아니다**. KMS 키 삭제(`ScheduleKeyDeletion`)는 최소 **7일~최대 30일**의 대기 기간(PendingDeletion)을 강제한다. 이 기간 동안 키는 비활성 상태이지만 복구(`CancelKeyDeletion`) 가능하다. 이유: 키를 삭제하면 그 키로 암호화한 **모든 데이터가 영구히 복구 불가능**해지기 때문에, 실수 방지를 위한 강제 유예다. 시험에서 "즉시 키 삭제"는 불가능하며, 이 7~30일 유예가 정답 포인트로 자주 나온다.

## Multi-Region Key — Cross-Region DR의 게임 체인저

기본 KMS 키는 **리전 종속**이다. us-east-1에서 만든 키로 암호화한 데이터를 ap-northeast-2에서 복호화하려면, 매번 us-east-1 KMS를 호출하거나(Cross-Region 지연·의존성) 데이터를 re-encrypt해야 했다. **Multi-Region Key(MRK)**는 2021년 출시돼 이 문제를 푼다.

MRK는 같은 키 머터리얼을 여러 리전에 **복제**한다. Primary 키를 만들고 `replicate-key`로 다른 리전에 Replica를 생성하면, 두 키는 동일한 키 머터리얼을 공유한다. 핵심 — **키 ID가 동일**하다(`mrk-` 접두사 + 같은 suffix). 그래서 us-east-1에서 암호화한 ciphertext를 ap-northeast-2의 Replica 키로 **별도 호출 없이 직접 복호화**할 수 있다. DR 시나리오에서 RDS 스냅샷·S3 객체를 다른 리전으로 복사한 뒤 즉시 복호화 가능해진다.

각 리전의 MRK는 **독립된 Key Policy·Grant·로테이션 상태**를 가진다. 즉 키 머터리얼은 공유하지만 권한은 리전별로 따로 관리한다(데이터 주권·리전별 접근 통제 요구 충족).

```
[us-east-1: MRK Primary]  ──암호화──▶  ciphertext
        │ replicate-key
        ▼
[ap-northeast-2: MRK Replica]  ──직접 복호화──▶  평문
   (Cross-Region KMS 호출 불필요, 동일 키 ID)
```

> 🔍 **더 깊이**: MRK는 "모든 키를 멀티 리전으로 만들면 되지 않나"라는 유혹을 부르지만, AWS는 **단일 리전 키를 기본으로** 권장한다. 이유: MRK는 키 머터리얼이 여러 리전에 복제되므로 **공격 표면이 넓어지고**, 리전 간 키 동기화라는 복잡성이 추가된다. 또 한번 MRK로 만들면 단일 리전 키로 되돌릴 수 없다. 따라서 MRK는 "정말로 Cross-Region 복호화가 필요한 데이터"(DR 대상, 글로벌 복제 데이터)에만 선택적으로 써야 한다. 시험에서 "Cross-Region DR + 동일 키로 복호화"는 MRK, 단순 단일 리전 암호화는 일반 CMK가 정답이다.

> 🎯 **시나리오**: "us-east-1의 암호화된 RDS 스냅샷을 ap-northeast-2로 복사해 DR 대기 환경을 구성하되, 장애 시 추가 KMS 호출이나 re-encrypt 없이 즉시 복원해야 한다. 또 두 리전의 키 접근 권한은 각각 다르게 통제해야 한다." → **Multi-Region Key**. Primary(us-east-1)로 스냅샷을 암호화하고 Replica(ap-northeast-2)를 생성하면, 스냅샷을 복사한 뒤 Replica 키로 직접 복호화·복원할 수 있다. 리전별 Key Policy를 따로 둬 접근 통제도 분리된다. 일반 CMK는 리전 종속이라 Cross-Region 복호화에 추가 호출이 필요하고, BYOK는 자동 로테이션이 안 되며 복제 메커니즘이 없다.

## CloudHSM과 Custom Key Store — FIPS 140-2 Level 3이 필요할 때

KMS의 멀티 테넌트 HSM은 **FIPS 140-2 Level 2(일부 Level 3 검증)**를 충족한다. 그러나 일부 규제(금융·정부)는 **단일 테넌트 전용 HSM + FIPS 140-2 Level 3**을 요구한다. 이때 **CloudHSM**(전용 HSM 클러스터)을 쓰거나, KMS의 **Custom Key Store** 기능으로 CloudHSM 클러스터를 KMS의 백엔드로 연결한다.

| 항목 | KMS (기본) | CloudHSM |
|------|-----------|----------|
| 테넌시 | 멀티 테넌트 | 단일 테넌트 전용 |
| FIPS 140-2 | Level 2/3 | **Level 3** |
| 키 통제 | AWS 관리형 API | 고객이 HSM 직접 통제 |
| 추가 용도 | 암·복호화 | SSL 오프로드·Oracle TDE·커스텀 암호 연산 |
| 운영 부담 | 0 (완전 관리형) | 클러스터·사용자·백업 직접 관리 |

Custom Key Store는 "KMS의 편리한 API + CloudHSM의 단일 테넌트 격리"를 결합한다 — KMS API로 키를 호출하지만, 실제 키 머터리얼은 당신의 전용 CloudHSM 클러스터 안에만 존재한다.

> 📚 **사례**: 한 결제 회사는 PCI DSS와 자국 금융 규제로 "암호화 키는 단일 테넌트 HSM에서만 생성·보관, FIPS 140-2 Level 3 인증 필수"를 요구받았다. 순수 KMS는 멀티 테넌트라 요건 미달이었다. 해법은 **KMS Custom Key Store + CloudHSM 클러스터** — 개발팀은 익숙한 KMS API(`Encrypt`/`Decrypt`)를 그대로 쓰면서, 실제 키는 전용 CloudHSM 안에만 존재했다. 트레이드오프: CloudHSM 클러스터(시간당 과금, 다중 AZ HA 구성, 사용자·백업 직접 관리)의 운영 부담이 추가됐다. 교훈: "단일 테넌트 + FIPS L3"이라는 명시적 컴플라이언스 요구가 있을 때만 CloudHSM을 선택한다 — 그 요구가 없으면 KMS의 0 운영 부담이 거의 항상 더 낫다.

## 정리하며

KMS의 핵심은 "키를 보호하는 키" 문제를 **봉투 암호화(마스터 키는 HSM을 떠나지 않고, 빠른 DEK가 데이터를 암호화) + 3중 권한 체크(Key Policy 루트 + IAM 위임 + Grant 임시) + 멀티 리전 복제(DR)**로 푸는 것이다. 마스터 키(CMK)는 절대 평문으로 노출되지 않고, 데이터는 로컬에서 DEK로 빠르게 암호화되며, 키 회전은 데이터 재암호화 없이 이뤄진다.

SAP 시험 단골 매핑: (1) "키 정책·로테이션·감사 직접 통제" → **CMK**, (2) "외부 생성 키 + 만료 + 자동 로테이션 불가" → **Imported(BYOK)**, (3) "Cross-Region 동일 키 복호화 + DR" → **MRK**, (4) "단일 테넌트 + FIPS 140-2 L3" → **CloudHSM / Custom Key Store**, (5) "IAM만으로 KMS 권한" → 오답(Key Policy 위임 필수), (6) "서비스의 임시·취소 가능 위임" → **Grant**, (7) "키 즉시 삭제" → 불가(7~30일 PendingDeletion). 다음 day는 탐지 3총사 Macie·GuardDuty·Inspector를 본다.

---

## 📝 연습 문제

**문제 1.** us-east-1에서 암호화한 RDS 스냅샷을 ap-northeast-2로 복사해 DR 환경을 구성한다. 장애 시 추가 KMS 호출이나 re-encrypt 없이 즉시 복원해야 하고, 두 리전의 키 접근 권한은 각각 다르게 통제하고 싶다. 가장 적합한 것은?

A) 단일 리전 CMK + Cross-Region Snapshot Copy 시 매번 re-encrypt

B) Multi-Region Key (Primary + Replica)

C) Imported Key Material을 두 리전에 각각 import

D) AWS Managed Key

**정답: B**
해설: MRK는 같은 키 머터리얼을 여러 리전에 복제하고 키 ID가 동일해, 한 리전에서 암호화한 ciphertext를 다른 리전의 Replica로 별도 호출 없이 직접 복호화한다. 리전별 Key Policy를 따로 둬 접근 통제도 분리된다. A는 일반 CMK가 리전 종속이라 Cross-Region 복호화에 추가 호출·재암호화가 필요해 비효율적이다. C는 두 import 키가 서로 다른 키가 되어(동일 ciphertext를 양쪽에서 복호화 불가) DR에 부적합하고 자동 로테이션도 안 된다. D는 정책·회전을 통제할 수 없고 리전 종속이다. 함정: "Cross-Region 동일 키 복호화 + DR"은 MRK.

---

**문제 2.** Lambda 함수가 KMS CMK로 데이터를 복호화해야 한다. Lambda 실행 역할 IAM에 `kms:Decrypt`를 부여했는데도 AccessDenied가 발생한다. 가장 가능성 높은 원인과 해결은?

A) Lambda는 KMS를 호출할 수 없다

B) Key Policy에 계정 루트로의 IAM 위임이 없어 IAM 권한이 무효 — Key Policy에 위임을 추가

C) Grant를 반드시 먼저 생성해야 한다

D) SCP가 모든 KMS를 차단하고 있다

**정답: B**
해설: KMS는 Key Policy가 권한의 루트다. Key Policy에 `Principal: {AWS: account-root}` + `kms:*` 같은 IAM 위임 구문이 없으면, IAM에서 아무리 `kms:Decrypt`를 허용해도 효력이 없다. 해결은 Key Policy에 IAM 위임을 명시하거나 Lambda 역할을 Key Policy에서 직접 허용하는 것이다. A는 틀림(Lambda는 KMS 호출 가능). C는 Grant가 필수는 아니다(IAM 위임으로 충분). D는 일반적 원인이 아니며 단서가 없다. 함정: "IAM만 줬는데 거부"의 전형적 원인은 Key Policy 위임 누락.

---

**문제 3.** 규제상 암호화 키 머터리얼을 자사 온프레미스에서 생성하고, AWS가 키를 영구 보관하지 않으며, 키에 만료일을 설정해야 한다. 자동 로테이션은 요구되지 않는다. 가장 적합한 것은?

A) Customer Managed Key (KMS 생성) + 자동 로테이션

B) Imported Key Material (BYOK)

C) AWS Managed Key

D) Multi-Region Key

**정답: B**
해설: BYOK(Imported Key Material)는 키 머터리얼을 외부(자사 HSM)에서 생성해 KMS로 import하며, 만료일을 설정하면 KMS가 캐시만 보관하다 만료 시 삭제한다. A는 키를 KMS가 생성하므로 "자사 생성" 요건에 맞지 않고, BYOK는 자동 로테이션이 불가하다(문제에서 자동 로테이션 불요이므로 BYOK가 적합). C는 통제권이 없다. D는 키 출처·만료 요건과 무관. 함정: "외부 생성 + 만료 설정"은 Imported, 단 "자동 로테이션 필요"가 함께 나오면 모순이므로 그 선택지는 오답.

---

**문제 4.** 단일 테넌트 전용 HSM에서 FIPS 140-2 Level 3 인증된 키 관리가 필요하면서, 개발팀은 기존 KMS API(`Encrypt`/`Decrypt`)를 그대로 쓰고 싶다. 가장 적합한 것은?

A) 순수 KMS CMK (멀티 테넌트)

B) KMS Custom Key Store + CloudHSM 클러스터

C) Secrets Manager

D) Imported Key Material

**정답: B**
해설: Custom Key Store는 KMS의 익숙한 API를 유지하면서 실제 키 머터리얼은 고객 전용 CloudHSM 클러스터(단일 테넌트, FIPS 140-2 Level 3) 안에만 보관한다. A는 멀티 테넌트라 "단일 테넌트 L3" 요건 미달. C는 비밀 저장소이지 HSM 키 관리가 아니다. D는 import한 키도 KMS의 멀티 테넌트 HSM에 저장되어 단일 테넌트 요건을 충족하지 못한다. 함정: "단일 테넌트 + FIPS L3 + KMS API 유지"는 Custom Key Store + CloudHSM.

---

**문제 5.** AWS 서비스(예: EBS)가 당신의 CMK를 볼륨 암호화에 일시적으로 사용한 뒤, 작업이 끝나면 그 위임이 즉시 회수되어야 한다. 세분화된 임시 위임이 필요하다. 어떤 메커니즘인가?

A) Key Policy에 서비스 Principal 영구 추가

B) IAM Role 추가

C) KMS Grant

D) STS AssumeRole

**정답: C**
해설: Grant는 프로그래밍적으로 생성·회수 가능한 임시·세분화 위임으로, 특정 작업만 허용하고 `RetireGrant`/`RevokeGrant`로 즉시 회수된다. AWS 서비스 통합(EBS·RDS 등)이 내부적으로 Grant를 쓴다. A는 영구 위임이라 "즉시 회수" 요건에 맞지 않고 Key Policy가 비대해진다. B(IAM Role)는 KMS 권한의 임시 회수 메커니즘이 아니다. D(STS)는 자격 증명 발급이지 KMS 키 위임이 아니다. 함정: "서비스의 임시·취소 가능 세분화 위임"은 Grant.

---

**문제 6.** 보안팀이 실수로 운영 중인 CMK를 삭제 예약했다. 이 키로 수 TB의 S3 데이터가 암호화돼 있다. 어떤 일이 일어나는가?

A) 키가 즉시 삭제되고 데이터는 영구 복구 불가

B) 7~30일 PendingDeletion 대기 기간이 있어 그 안에 삭제를 취소할 수 있다

C) 키 삭제는 불가능하다

D) 데이터가 자동으로 AWS Managed Key로 재암호화된다

**정답: B**
해설: KMS 키 삭제는 최소 7일~최대 30일의 PendingDeletion 대기 기간을 강제하며, 그 안에는 `CancelKeyDeletion`으로 복구할 수 있다. 키를 삭제하면 그 키로 암호화한 모든 데이터가 영구 복구 불가능해지므로, 실수 방지를 위한 강제 유예다. A는 틀림(즉시 삭제 안 됨). C도 틀림(대기 후 삭제는 가능). D는 그런 자동 재암호화 메커니즘이 없다. 함정: KMS 키는 "즉시 삭제 불가, 7~30일 유예 후 삭제"가 핵심.

---

**문제 7.** KMS의 `Encrypt` API는 최대 4KB만 받는다. 수 GB의 S3 객체를 KMS로 효율적으로 암호화하려면 어떤 방식이 표준인가?

A) 객체를 4KB씩 쪼개 KMS Encrypt를 수백만 번 호출

B) 봉투 암호화 — GenerateDataKey로 받은 평문 DEK로 객체를 로컬 암호화하고, 암호화된 DEK만 객체와 함께 저장

C) CloudHSM에 직접 객체 전송

D) KMS는 큰 객체를 암호화할 수 없으므로 평문 저장

**정답: B**
해설: 봉투 암호화에서 GenerateDataKey는 평문 DEK와 암호화된 DEK를 돌려준다. 평문 DEK로 큰 객체를 로컬에서 빠르게(AES-256) 암호화하고 평문 DEK는 즉시 폐기하며, 암호화된 DEK만 객체와 함께 저장한다. 복호화 시 암호화된 DEK를 KMS로 풀어 평문 DEK를 얻는다. A는 네트워크 왕복이 폭증해 비효율적이고 비용이 크다(안티패턴). C는 동작 방식이 아니다. D는 보안 위반. 함정: "큰 데이터 + KMS"는 항상 봉투 암호화이며, KMS는 마스터 키로 작은 DEK만 보호한다.
