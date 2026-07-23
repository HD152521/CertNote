# Day 3 - Cognito: 인증과 인가를 두 개의 풀로 나눈 이유

웹·모바일 앱을 만들다 보면 거의 모든 개발자가 같은 순서로 같은 함정에 빠진다. 처음엔 사용자 테이블에 비밀번호를 직접 저장한다(평문으로). 그러다 해싱을 배워 bcrypt를 쓴다. 그다음 비밀번호 재설정, 이메일 검증, MFA, 소셜 로그인, 토큰 만료, 리프레시 토큰 회전을 차례로 구현하다가 "이걸 왜 내가 다 만들고 있지?"라는 깨달음에 도달한다. 인증(authentication, 너는 누구냐)과 인가(authorization, 너는 뭘 할 수 있냐)는 보안의 가장 깨지기 쉬운 영역이고, 직접 만든 인증 시스템은 거의 항상 어딘가에 구멍이 있다. Amazon Cognito는 이 "직접 만들지 마라" 영역을 통째로 관리형으로 가져간 서비스다.

Cognito가 DVA-C02 시험에서 까다로운 이유는 **두 개의 별개 구성요소(User Pool과 Identity Pool)** 가 비슷한 이름으로 헷갈리게 공존하기 때문이다. 둘은 푸는 문제가 완전히 다르다 — User Pool은 "로그인을 처리하고 신분증(JWT)을 발급"하고, Identity Pool은 "그 신분증을 AWS 리소스 출입증(IAM 임시 자격증명)으로 교환"한다. 이 분리를 이해하면 Cognito 문제의 대부분이 풀린다. 이번 글은 왜 둘이 나뉘었는지, JWT 세 종류가 각각 무슨 역할인지, 그리고 Lambda 트리거로 인증 흐름을 어떻게 확장하는지를 본다.

## 인증과 인가가 다른 문제라서 풀이 둘이다

OAuth와 OpenID Connect를 공부하면 가장 먼저 부딪히는 개념이 "인증과 인가는 다르다"이다. **인증(Authentication)** 은 "이 사람이 정말 user@example.com인가?"를 확인하는 것이고, **인가(Authorization)** 는 "이 사람이 S3 버킷에 쓸 수 있는가?"를 결정하는 것이다. 신분증을 발급받는 일(여권 발급)과 그 신분증으로 출입 허가를 받는 일(비자 발급)이 다른 것과 같다.

Cognito는 이 두 문제를 별개의 서비스로 나눴다.

| 구분 | User Pool | Identity Pool |
|------|-----------|---------------|
| 푸는 문제 | 인증(너는 누구냐) | 인가(AWS 리소스 접근) |
| 입력 | username/password, 소셜 로그인 | User Pool의 JWT(또는 외부 IdP 토큰) |
| 출력 | **JWT 토큰** 3종 | **IAM 임시 자격증명**(STS) |
| 쓰임 | API Gateway 인증, 사용자 디렉터리 | S3·DynamoDB에 SDK로 직접 접근 |
| 게스트 | 불가 | 가능(미인증 역할) |

> 💡 **관련 이론**: 이 분리는 OAuth 2.0 / OIDC 명세의 구조를 그대로 반영한다. OIDC는 "ID Token으로 신원을 증명"하고, OAuth 2.0은 "Access Token으로 자원 접근을 인가"한다 — 두 명세가 별개로 존재하는 이유가 바로 인증과 인가가 다른 관심사이기 때문이다. User Pool은 OIDC IdP 역할(신원 발급자)을, Identity Pool은 토큰을 AWS 자격증명으로 바꾸는 토큰 교환기 역할을 맡는다. AWS는 이 표준 구조를 두 풀로 물리적으로 분리해, "JWT만 필요한 앱"은 User Pool만 쓰고 "AWS 리소스 직접 접근이 필요한 앱"만 Identity Pool을 추가하도록 설계했다.

> ⚠️ **함정**: 시험에서 가장 흔한 함정이 둘을 뒤바꾸는 것이다. "모바일 앱이 S3에 직접 파일을 업로드해야 한다"가 나오면 정답은 **Identity Pool**(JWT를 IAM 자격증명으로 교환해 S3에 직접 접근)이다. User Pool의 JWT만으로는 S3 SDK를 호출할 수 없다 — JWT는 신분증이지 AWS 자격증명이 아니기 때문이다. 반대로 "사용자 로그인/회원가입을 처리하고 API Gateway에서 토큰을 검증"은 **User Pool**이다.

## JWT 세 토큰: 신분증, 출입증, 갱신권

User Pool 로그인에 성공하면 세 가지 토큰을 받는다. 셋의 역할 구분이 시험에 자주 나온다.

| 토큰 | 담은 정보 | 용도 | 기본 만료 |
|------|-----------|------|-----------|
| **ID Token** | 사용자 신원(sub, email, name, groups) | "이 사람이 누구인지" 증명 | 1시간 |
| **Access Token** | OAuth scope, 사용자 식별자 | "어떤 작업이 인가됐는지" | 1시간 |
| **Refresh Token** | (불투명) | ID/Access 토큰 갱신 | 30일(1일~10년 설정) |

```json
// ID Token 페이로드 (디코딩 시)
{
  "sub": "a1b2c3d4-...",
  "email": "user@example.com",
  "cognito:groups": ["Admin"],
  "iss": "https://cognito-idp.ap-northeast-2.amazonaws.com/<poolId>",
  "aud": "<appClientId>",
  "token_use": "id",
  "exp": 1721000000
}
```

> 🔍 **더 깊이**: JWT(JSON Web Token)는 `Header.Payload.Signature` 세 부분을 점으로 이은 문자열이다. 헤더·페이로드는 단순 Base64URL 인코딩일 뿐 **암호화가 아니다** — 누구나 디코딩해 내용을 읽을 수 있다. 보안은 서명(Signature)에서 온다. Cognito는 RS256(RSA 비대칭 서명)으로 토큰을 서명하고, 검증자는 Cognito가 공개한 JWKS(`/.well-known/jwks.json`)의 공개키로 서명을 확인한다. 비대칭 서명이라 검증자(API Gateway, 백엔드)는 공개키만 있으면 되고 비밀키는 Cognito만 가진다. 그래서 "JWT에 비밀번호를 넣어도 되나?" 같은 질문의 답은 단호히 No다 — 페이로드는 평문이나 다름없으므로 민감 정보를 넣으면 그대로 노출된다. `token_use` 클레임으로 ID인지 Access인지 구분하는 것도 검증 시 중요한 포인트다.

> ⚠️ **함정**: API Gateway에 **Cognito Authorizer**를 붙이면 기본적으로 **ID Token**을 검증한다. 반면 HTTP API의 **JWT Authorizer**는 보통 **Access Token**을 검증하며 scope 기반 인가를 내장 지원한다. 시험에서 "REST API + Cognito Authorizer → ID Token", "HTTP API + JWT Authorizer → Access Token + scope"의 조합을 묻는다. 토큰 종류를 헷갈리면 검증이 실패한다.

## User Pool의 인증 흐름: 비밀번호를 네트워크에 안 흘리는 SRP

User Pool은 여러 인증 흐름(Auth Flow)을 지원하는데, 그중 권장되는 `USER_SRP_AUTH`는 비밀번호를 네트워크로 전송하지 않는다.

| 흐름 | 동작 |
|------|------|
| **USER_SRP_AUTH**(권장) | SRP 프로토콜 — 비밀번호 자체를 네트워크로 안 보냄 |
| **USER_PASSWORD_AUTH** | 비밀번호를 직접 전송(TLS 필수), 레거시 마이그레이션용 |
| **ADMIN_USER_PASSWORD_AUTH** | 백엔드(관리자 권한)에서 인증 |
| **REFRESH_TOKEN_AUTH** | Refresh Token으로 토큰 갱신 |
| **CUSTOM_AUTH** | Lambda 트리거로 커스텀 챌린지 정의 |

> 💡 **관련 이론**: SRP(Secure Remote Password)는 1998년 Stanford에서 나온 **PAKE(Password-Authenticated Key Exchange)** 프로토콜이다. 핵심 아이디어는 클라이언트와 서버가 비밀번호를 직접 주고받지 않고도, 양쪽이 같은 비밀번호를 안다는 사실을 수학적으로(이산로그 문제 기반) 증명하는 것이다. 서버는 비밀번호의 verifier만 저장하고 원본 비밀번호는 모른다 — 그래서 서버 DB가 털려도 비밀번호가 직접 새지 않는다. TLS가 이미 전송을 암호화하는데도 SRP를 쓰는 이유는 "TLS 종료 지점(로드밸런서·프록시)에서 평문 비밀번호가 잠깐이라도 노출되는 것"까지 막기 위해서다. 방어 심층화(defense in depth)의 한 예다.

## Lambda 트리거: 인증 흐름에 코드 끼워넣기

Cognito의 진짜 유연함은 인증 생애주기의 특정 시점에 Lambda를 끼워넣을 수 있다는 데서 온다. 11종의 트리거가 있고, 시험은 "어느 시점에 어느 트리거"를 묻는다.

| 트리거 | 시점 | 흔한 용도 |
|--------|------|-----------|
| `PreSignUp` | 회원가입 직전 | 이메일 도메인 검증, 자동 승인 |
| `PostConfirmation` | 이메일/SMS 확인 후 | 사용자를 앱 DB에 추가, 환영 메일 |
| `PreAuthentication` | 로그인 시도 시 | 차단 목록 검사 |
| `PostAuthentication` | 로그인 성공 후 | 감사 로그, 마지막 로그인 기록 |
| `PreTokenGeneration` | JWT 발급 직전 | 커스텀 클레임 추가, 그룹 주입 |
| `DefineAuthChallenge` 등 | 커스텀 인증 흐름 | OTP·캡차 같은 자체 챌린지 |
| `UserMigration` | 로그인/비번재설정 시 | 외부 IdP에서 점진적 마이그레이션 |
| `CustomMessage` | 메시지 발송 전 | 이메일/SMS 문구 커스텀 |

```python
# PreSignUp 트리거 - 특정 도메인만 가입 허용 + 자동 승인
def lambda_handler(event, context):
    email = event['request']['userAttributes'].get('email', '')
    if not email.endswith('@mycompany.com'):
        raise Exception("회사 이메일만 가입할 수 있습니다.")
    # 사내 도메인은 이메일 검증 없이 자동 승인
    event['response']['autoConfirmUser'] = True
    event['response']['autoVerifyEmail'] = True
    return event   # 반드시 event를 반환해야 흐름이 이어진다
```

> 🔍 **더 깊이**: `UserMigration` 트리거는 레거시 인증 시스템에서 Cognito로 **무중단 마이그레이션**할 때 쓰는 영리한 패턴이다. 모든 사용자를 한 번에 옮기는 대신, 사용자가 처음 Cognito에 로그인을 시도하면 Cognito가 "이 사용자를 못 찾았다"며 UserMigration Lambda를 호출한다. Lambda는 옛 시스템에 그 자격증명으로 인증을 시도하고, 성공하면 그 사용자를 즉석에서 User Pool에 생성한다. 사용자는 한 번 로그인하는 것만으로 자동 이전되고, 옛 시스템은 사용자가 점점 줄다가 결국 비게 된다. "빅뱅 마이그레이션" 대신 "사용 기반 점진 마이그레이션"을 가능케 하는 트리거다.

> 📚 **사례**: `PreTokenGeneration` 트리거의 흔한 실수 — 토큰에 너무 많은 정보를 넣어 JWT가 비대해지는 것이다. 한 팀이 사용자의 모든 권한 목록을 ID Token 클레임에 넣었더니 토큰이 8KB를 넘어 일부 브라우저·프록시의 헤더 크기 한도(보통 8KB)를 초과해 간헐적 401이 발생했다. JWT는 매 요청마다 헤더로 실려 가므로 클레임은 꼭 필요한 식별자·그룹 정도로 최소화하고, 무거운 권한 데이터는 백엔드에서 sub로 조회하는 게 안전하다. 토큰은 신분증이지 권한 데이터베이스가 아니다.

## Identity Pool: JWT를 AWS 출입증으로 바꾸는 2단계

User Pool에서 JWT를 받았어도, 그것만으로는 S3나 DynamoDB를 SDK로 호출할 수 없다. AWS SDK는 IAM 자격증명(AccessKey/SecretKey/SessionToken)을 요구하기 때문이다. Identity Pool이 이 교환을 두 단계로 처리한다.

```python
import boto3
ci = boto3.client('cognito-identity')

# 1) GetId - JWT를 제시하고 Identity ID를 받는다
logins = {'cognito-idp.ap-northeast-2.amazonaws.com/<poolId>': id_token}
identity_id = ci.get_id(IdentityPoolId='ap-northeast-2:<poolId>', Logins=logins)['IdentityId']

# 2) GetCredentialsForIdentity - STS 임시 자격증명을 받는다
creds = ci.get_credentials_for_identity(IdentityId=identity_id, Logins=logins)['Credentials']

# 이제 IAM 자격증명으로 S3 직접 호출
s3 = boto3.client('s3',
    aws_access_key_id=creds['AccessKeyId'],
    aws_secret_access_key=creds['SecretKey'],
    aws_session_token=creds['SessionToken'])
```

> 🔍 **더 깊이**: Identity Pool의 자격증명은 내부적으로 STS의 `AssumeRoleWithWebIdentity`로 발급된다. JWT(웹 신원 토큰)를 제시하면 STS가 그것을 검증하고, Identity Pool에 매핑된 IAM 역할을 assume해 임시 자격증명을 돌려준다. 여기서 핵심은 **역할 매핑(role mapping)** 이다 — 모든 인증 사용자에게 같은 역할을 줄 수도 있고(Default), JWT의 클레임(`cognito:groups`)에 따라 다른 역할을 줄 수도 있다(Rules-based 또는 `cognito:preferred_role` Token-based). 예를 들어 Admin 그룹 사용자는 AdminRole을, 일반 사용자는 UserRole을 받게 하면, 같은 앱에서 사용자 그룹별로 S3 prefix 접근을 분리할 수 있다. 이게 "JWT의 그룹 정보를 IAM 권한으로 변환"하는 다리다.

게스트(미인증) 접근도 Identity Pool만의 기능이다. 로그인하지 않은 사용자에게 제한된 미인증 역할(unauthenticated role)을 부여해, 예를 들어 공개 읽기 전용 S3 접근만 허용할 수 있다.

## 외부 IdP 페더레이션

User Pool은 자체 사용자 디렉터리를 가질 수도 있지만, 외부 IdP(Google, Facebook, Apple, SAML 2.0, OIDC)를 페더레이션할 수도 있다. 사용자가 Google로 로그인하면 그 신원이 User Pool에 미러링(Just-in-time 프로비저닝)되고, 앱은 여전히 동일한 Cognito JWT를 받는다 — 로그인 출처가 어디든 앱 입장에서는 일관된 토큰 인터페이스를 얻는다.

> 💡 **관련 이론**: 이 "여러 IdP를 하나의 토큰 인터페이스로 통합"하는 패턴이 페더레이션(federation)의 본질이다. 앱이 Google·Apple·자체 로그인을 각각 다르게 처리하면 코드가 N배로 늘지만, User Pool을 중간 브로커로 두면 앱은 Cognito 토큰 하나만 다루면 된다. SAML(엔터프라이즈 SSO)과 OIDC(소셜)를 같은 풀에 섞을 수 있어, B2B와 B2C를 동시에 지원하는 앱에 유용하다. 신원의 출처를 추상화하는 어댑터 레이어인 셈이다.

## 정리하며

Cognito가 두 개의 풀로 나뉜 건 인증과 인가가 다른 문제이기 때문이다. User Pool은 로그인을 처리하고 JWT 3종(신분증 ID, 출입증 Access, 갱신권 Refresh)을 발급하며, Identity Pool은 그 JWT를 STS 임시 자격증명으로 교환해 AWS 리소스 직접 접근을 가능케 한다. JWT는 서명만 검증할 뿐 평문이라 민감 정보를 넣으면 안 되고, Lambda 트리거 11종으로 인증 흐름을 확장하며, Identity Pool의 역할 매핑으로 그룹별 IAM 권한을 분기한다 — 이 구조가 시험 함정의 뼈대다.

다음 글에서는 인증된 사용자가 들어온 뒤가 아니라, **들어오기 전 트래픽 자체를 막는** 방어 계층 — WAF·Shield·ACM을 본다.

---

## 📝 연습 문제

**문제 1.** 모바일 앱이 사용자별로 S3 버킷의 자기 폴더에 직접 파일을 업로드해야 한다. 사용자는 Cognito로 로그인한다. 올바른 구성은?

A) User Pool JWT를 그대로 S3 SDK에 전달
B) User Pool로 로그인 → Identity Pool에서 IAM 임시 자격증명 교환 → S3 직접 접근
C) User Pool JWT를 API Gateway에 보내 Lambda가 대신 업로드
D) Identity Pool만 사용해 게스트 자격증명으로 업로드

**정답: B**

해설: AWS SDK(S3 직접 호출)는 IAM 자격증명을 요구하므로 User Pool JWT만으로는 호출이 안 된다. User Pool에서 받은 JWT를 Identity Pool에 제시해 STS 임시 자격증명으로 교환한 뒤 S3에 직접 접근한다. 역할 매핑으로 사용자별 prefix를 분리할 수 있다. A) JWT는 신분증이지 AWS 자격증명이 아님. C) Lambda 경유는 가능하지만 "직접 업로드" 요구에 비해 불필요한 우회. D) 게스트 자격증명은 로그인한 사용자별 폴더 분리에 부적합. "S3 직접 접근"이 보이면 Identity Pool이다.

---

**문제 2.** API Gateway **REST API**에 Cognito Authorizer를 붙였다. 클라이언트가 기본적으로 어떤 토큰을 보내야 하는가?

A) Refresh Token
B) Access Token
C) ID Token
D) IAM 임시 자격증명

**정답: C**

해설: REST API의 Cognito Authorizer는 기본적으로 **ID Token**을 검증한다. 반면 HTTP API의 JWT Authorizer는 보통 Access Token을 검증하며 scope 기반 인가를 내장한다. 이 토큰 종류 차이가 시험 빈출 포인트다. A) Refresh Token은 토큰 갱신용이지 API 인증에 직접 쓰지 않는다. D) IAM 자격증명은 IAM 인증(SigV4) 방식이지 Cognito Authorizer가 아니다.

---

**문제 3.** 회원가입 시 회사 도메인(@mycompany.com) 이메일만 허용하고 자동 승인하려 한다. 어떤 Cognito 기능을 써야 하는가?

A) `PostAuthentication` Lambda 트리거
B) `PreSignUp` Lambda 트리거
C) Identity Pool 역할 매핑
D) API Gateway Authorizer

**정답: B**

해설: `PreSignUp` 트리거는 회원가입이 완료되기 **직전**에 실행돼 이메일 도메인 검증을 하고, `event['response']['autoConfirmUser']`/`autoVerifyEmail`을 설정해 자동 승인까지 처리할 수 있다. A) PostAuthentication은 로그인 성공 후라 가입 검증 시점이 아니다. C) 역할 매핑은 가입이 아닌 IAM 권한 분기. D) Authorizer는 API 요청 인증이지 가입 검증이 아니다.

---

**문제 4.** JWT ID Token에 사용자 비밀번호나 다른 민감 정보를 넣어도 되는가? 그 이유는?

A) 된다, JWT는 암호화되어 안전하다
B) 안 된다, JWT 페이로드는 Base64 인코딩일 뿐 누구나 디코딩해 읽을 수 있다
C) 된다, 단 Access Token에만
D) 안 된다, JWT는 100바이트로 제한된다

**정답: B**

해설: JWT는 `Header.Payload.Signature` 구조이며 헤더·페이로드는 **Base64URL 인코딩**일 뿐 암호화가 아니다 — 누구나 디코딩해 평문으로 읽을 수 있다. 보안은 서명(RS256)에서 오며, 서명은 "내용이 변조되지 않았음"을 보장할 뿐 "내용을 숨기는" 것이 아니다. 따라서 비밀번호 등 민감 정보를 넣으면 그대로 노출된다. 토큰에는 식별자·그룹 정도만 넣고 무거운 권한 데이터는 백엔드에서 조회해야 한다.

---

**문제 5.** 기존 레거시 인증 시스템의 사용자를 다운타임 없이 점진적으로 Cognito로 옮기려 한다. 가장 적합한 방법은?

A) 모든 사용자를 CSV로 한 번에 import
B) `UserMigration` Lambda 트리거로 첫 로그인 시 자동 이전
C) `PreTokenGeneration` 트리거 사용
D) Identity Pool 게스트 역할 활용

**정답: B**

해설: `UserMigration` 트리거는 사용자가 Cognito에 처음 로그인(또는 비번 재설정)을 시도해 "사용자 없음"이 감지될 때 호출된다. Lambda가 레거시 시스템에 그 자격증명으로 인증을 시도하고 성공하면 즉석에서 User Pool에 사용자를 생성한다. 사용자는 한 번 로그인하는 것만으로 자동 이전돼 빅뱅 마이그레이션의 다운타임·일괄 비밀번호 재설정을 피한다. A) CSV import는 비밀번호를 옮길 수 없어 전원 재설정이 필요. C) PreTokenGeneration은 클레임 커스터마이즈용. D) 게스트 역할은 무관.

---

**문제 6.** Identity Pool에서 Admin 그룹 사용자에게는 AdminRole을, 일반 사용자에게는 UserRole을 부여하려 한다. 어떤 기능을 사용하는가?

A) User Pool MFA 설정
B) Identity Pool 역할 매핑(Rules-based 또는 Token-based)
C) PreSignUp 트리거
D) KMS Grant

**정답: B**

해설: Identity Pool의 역할 매핑은 JWT의 클레임(`cognito:groups`)에 따라 다른 IAM 역할을 assume하게 한다. Rules-based 매핑은 클레임 값으로 규칙을 정의하고, Token-based는 `cognito:preferred_role` 클레임을 사용한다. 이로써 같은 앱에서 그룹별로 S3 prefix·DynamoDB 접근을 분리할 수 있다. A) MFA는 인증 강화이지 권한 분기가 아니다. C) PreSignUp은 가입 검증. D) KMS Grant는 키 권한.

---

**문제 7.** Cognito User Pool에 Google·Apple 소셜 로그인과 자체 로그인을 모두 지원하려 한다. 앱이 받는 토큰은 로그인 출처에 따라 어떻게 달라지는가?

A) 출처마다 다른 형식의 토큰을 받아 앱에서 분기 처리해야 한다
B) 출처와 무관하게 동일한 Cognito JWT를 받는다(페더레이션 추상화)
C) 소셜 로그인은 IAM 자격증명을, 자체 로그인은 JWT를 받는다
D) 소셜 로그인은 토큰을 받지 못한다

**정답: B**

해설: User Pool에 외부 IdP를 페더레이션하면 사용자가 Google·Apple로 로그인해도 그 신원이 User Pool에 미러링(JIT 프로비저닝)되고, 앱은 출처와 무관하게 **동일한 Cognito JWT**를 받는다. 앱은 토큰 인터페이스 하나만 다루면 되므로 로그인 출처별 분기 코드가 필요 없다 — 이것이 페더레이션의 추상화 가치다. SAML(엔터프라이즈)과 OIDC(소셜)를 한 풀에 섞을 수도 있다.
