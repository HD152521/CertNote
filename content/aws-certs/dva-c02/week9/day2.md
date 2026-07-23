# Day 2 - Secrets Manager와 Parameter Store: 비밀을 코드 밖으로 꺼내기

"비밀번호를 코드에 박지 마라"는 모든 개발자가 첫날 배우는 규칙이지만, 정작 그걸 어디 둘지는 아무도 명쾌하게 가르쳐주지 않는다. 환경변수에 넣으면 프로세스 환경을 덤프하는 순간 새고, 설정 파일에 넣으면 그 파일을 또 git에서 빼야 하며, 한 번 새어나간 비밀번호는 모든 서버에서 동시에 바꿔야 하는 운영 악몽이 된다. 게다가 진짜 보안 조직은 "비밀번호를 새지 않게 하는 것"을 넘어 "정기적으로 자동으로 바꾸는 것"을 요구한다. 사람이 90일마다 DB 비밀번호를 손으로 바꾸는 조직은 없다 — 귀찮으니까 안 바꾼다. AWS Secrets Manager와 SSM Parameter Store는 이 "비밀을 코드 밖에 두고, 가능하면 자동으로 회전시킨다"는 문제를 두 가지 다른 무게로 푼다.

DVA-C02 시험에서 이 둘은 거의 항상 **비교 문제**로 나온다. "이 시나리오에서 Secrets Manager인가 Parameter Store인가?"를 가르는 기준은 단 세 가지 — 자동 회전이 필요한가, 크기가 8KB를 넘는가, 비용이 최우선인가 — 다. 이번 글은 두 서비스가 각각 어떤 문제를 풀려고 태어났는지, 자동 회전이 내부에서 어떻게 다운타임 없이 동작하는지, 그리고 Lambda Extension으로 호출 비용을 줄이는 실무 패턴까지 본다.

## 두 서비스가 나뉘어 태어난 이유

흥미롭게도 Parameter Store가 먼저(2016년, Systems Manager의 일부)였고 Secrets Manager는 나중(2018년)이다. Parameter Store는 원래 "EC2 인스턴스가 부팅할 때 읽을 설정값 저장소"로 시작했다. 그런데 사람들이 거기에 비밀번호를 SecureString으로 넣어 비밀 저장소로도 쓰기 시작했다. AWS는 "설정과 비밀은 요구사항이 다르다"는 걸 인식했다 — 비밀은 **자동 회전**, **세밀한 버전 관리**, **RDS 같은 서비스와의 통합 회전**, **크로스 계정 공유**가 필요한데 Parameter Store는 거기까지 설계되지 않았다. 그래서 비밀 전용으로 Secrets Manager를 따로 내놨다.

이 출생 배경이 두 서비스의 성격을 그대로 결정한다. Parameter Store는 "가볍고 계층적인 설정 저장소(비밀도 담을 수 있음)", Secrets Manager는 "회전과 통합에 특화된 비싼 비밀 전용 금고"다.

| 차원 | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| 비용 | 비밀당 **$0.40/월** + API | Standard **무료**, Advanced $0.05/월 |
| 자동 회전 | **지원**(Lambda 기반) | 미지원 |
| 크기 한도 | 64KB | Standard 4KB / Advanced 8KB |
| 계층 구조 | 경로 기반 | 경로 기반(`/app/env/key`) |
| RDS 통합 회전 | **네이티브** | 없음 |
| 크로스 리전 복제 | 지원 | 없음 |

> 💡 **관련 이론**: 이 분리는 소프트웨어 설계의 **관심사 분리(separation of concerns)** 의 클라우드 버전이다. 12-Factor App 방법론은 "설정(config)을 코드에서 분리하라"고 말하지만, 설정 안에서도 "공개해도 되는 설정(타임존, 기능 플래그)"과 "절대 새면 안 되는 비밀(DB 비밀번호, API 키)"은 보호 수준과 수명 관리가 다르다. 회전 주기, 감사 강도, 접근 통제가 다른 두 종류를 하나의 저장소에 욱여넣으면 결국 가장 엄격한 요구에 맞춰 전체를 과보호하거나(비싸짐) 가장 느슨한 쪽으로 새어나간다(위험해짐). AWS는 둘을 분리해 각각에 맞는 비용·기능 곡선을 제공한다.

> ⚠️ **함정**: "둘 다 KMS 암호화를 지원하는가?"는 시험에 자주 나오는데, 답은 **그렇다**이다. Parameter Store의 SecureString도 내부적으로 KMS로 암호화된다. 그래서 "암호화 지원"만으로는 둘을 못 가른다. 진짜 차이는 **자동 회전**과 **RDS 통합**이다. "DB 비밀번호를 30일마다 자동으로 바꿔야 한다"가 보이면 무조건 Secrets Manager다 — Parameter Store는 회전 기능 자체가 없다.

## 자동 회전: 다운타임 없이 비밀번호를 바꾸는 두 전략

Secrets Manager의 핵심 가치는 자동 회전이다. 그런데 "비밀번호를 바꾼다"는 작업에는 미묘한 함정이 있다 — 비밀번호를 바꾸는 그 순간, 아직 옛 비밀번호를 들고 있는 애플리케이션 인스턴스들이 모두 인증 실패에 빠질 수 있다. 이 문제를 어떻게 다루느냐에 따라 두 가지 회전 전략이 나뉜다.

| 전략 | 동작 | 다운타임 |
|------|------|----------|
| **Single-User** | 한 사용자의 비밀번호를 새 값으로 교체 | 전환 순간 짧게 가능 |
| **Alternating-Users** | 두 사용자(A↔B)를 번갈아 사용 | 거의 없음(권장) |

Single-User는 단순하다. 같은 DB 사용자의 비밀번호를 새로 만들어 바꾼다. 하지만 비밀번호가 바뀐 직후, 캐싱된 옛 비밀번호로 연결을 시도하는 클라이언트는 잠깐 실패할 수 있다.

Alternating-Users는 영리하다. `myapp_user`와 `myapp_user_clone` 두 계정을 두고, 회전 시 **현재 안 쓰는 쪽**의 비밀번호를 먼저 바꾼 다음 그쪽으로 전환한다. 옛 계정은 한동안 그대로 두므로 옛 비밀번호를 든 클라이언트도 회전 직후 일정 시간 동안은 여전히 접속된다.

> 🔍 **더 깊이**: Secrets Manager의 회전은 Lambda 함수가 **4단계 스텝**(`createSecret` → `setSecret` → `testSecret` → `finishSecret`)으로 진행한다. ① createSecret: 새 비밀번호를 생성해 `AWSPENDING` 라벨로 저장(아직 DB엔 미적용). ② setSecret: DB에 새 비밀번호를 실제로 설정. ③ testSecret: 새 비밀번호로 실제 접속을 테스트해 동작을 확인. ④ finishSecret: `AWSPENDING` 라벨을 `AWSCURRENT`로 승격(이제 애플리케이션이 받는 기본 버전이 새 비밀번호). 핵심은 ③ **testSecret에서 검증에 실패하면 회전이 중단되고 옛 비밀번호(AWSCURRENT)가 그대로 유지**된다는 점이다. 즉 회전이 깨져도 서비스는 옛 비밀번호로 계속 동작한다 — 이 "검증 후 승격" 구조가 회전을 안전하게 만든다.

> 📚 **사례**: 한 팀이 RDS 비밀번호 회전을 켰는데 회전 직후 간헐적 인증 실패가 났다. 원인은 애플리케이션이 부팅 시 비밀번호를 한 번 읽어 **메모리에 영구 캐싱**하고 있었기 때문이다. 회전으로 DB 비밀번호가 바뀌었는데 앱은 옛 값을 계속 들고 있었다. 해결은 Alternating-Users 전략으로 바꿔 옛 계정을 한 회전 주기 동안 살려두고, 동시에 앱이 인증 실패 시 Secrets Manager를 다시 읽어 캐시를 갱신하도록 재시도 로직을 넣는 것이었다. 자동 회전을 켜는 것만으로 끝이 아니라 "클라이언트가 비밀을 어떻게 캐싱하는가"까지 함께 봐야 한다는 교훈.

```python
import boto3, json

sm = boto3.client('secretsmanager')

# 비밀 읽기 - 항상 AWSCURRENT(최신) 버전을 받는다
resp = sm.get_secret_value(SecretId='prod/myapp/db')
secret = json.loads(resp['SecretString'])

conn = connect(
    host=secret['host'],
    user=secret['username'],
    password=secret['password'],   # 코드에 하드코딩 없음
    database=secret['dbname'],
)
```

## RDS 통합 회전: AWS가 회전 Lambda를 대신 만들어준다

비밀 회전 Lambda를 직접 짜는 건 까다롭다 — 위의 4단계를 DB 종류별로 올바르게 구현해야 한다. Secrets Manager의 진짜 강점은 RDS·DocumentDB·Redshift에 대해 **AWS가 검증된 회전 Lambda를 자동 생성**해준다는 점이다.

| DB | 회전 방식 |
|----|-----------|
| RDS MySQL / PostgreSQL / MariaDB | AWS 관리 Lambda (Single 또는 Alternating) |
| RDS Oracle / SQL Server | AWS 관리 Lambda |
| DocumentDB | AWS 관리 Lambda |
| Redshift | AWS 관리 Lambda |
| 그 외(타사 API 키 등) | 사용자 정의 Lambda |

> ⚠️ **함정**: "RDS 비밀번호 자동 회전"이 나오면 사용자가 Lambda를 직접 짤 필요가 없다는 게 포인트다. 콘솔에서 회전을 켜면 AWS가 적절한 Lambda를 자동 배포한다. 시험 보기에 "Lambda로 직접 구현"이 있으면 그건 보통 오답이고(불필요하게 복잡), "Secrets Manager 자동 회전 활성화"가 정답이다. 단 타사 SaaS API 키처럼 AWS가 모르는 시스템은 사용자 정의 Lambda가 필요하다.

## Parameter Store: 가볍고 계층적인 설정 저장소

Parameter Store는 비밀이 아닌 평범한 설정값을 다루는 데 최적이다. 세 가지 타입이 있다.

- **String**: 평문 설정값
- **StringList**: 쉼표로 구분된 목록
- **SecureString**: KMS로 암호화된 값(비밀번호, 토큰)

```bash
# 평문 설정값
aws ssm put-parameter --name /myapp/prod/db-url \
  --value "postgres://mydb.rds.amazonaws.com:5432/app" --type String

# 암호화 비밀값 (KMS)
aws ssm put-parameter --name /myapp/prod/db-password \
  --value "s3cr3t" --type SecureString --key-id alias/myapp-key

# 복호화 포함 조회
aws ssm get-parameter --name /myapp/prod/db-password --with-decryption

# 경로 단위 일괄 조회 - 계층 구조의 핵심
aws ssm get-parameters-by-path --path /myapp/prod --recursive --with-decryption
```

> 🔍 **더 깊이**: `--with-decryption` 옵션이 없으면 SecureString은 **암호화된 채로** 반환된다. 이게 의도된 동작이다 — 복호화하려면 호출자가 그 KMS 키에 대한 `kms:Decrypt` 권한을 가져야 하므로, SecureString 조회 권한과 복호화 권한을 분리할 수 있다. 즉 "파라미터 존재는 볼 수 있지만 평문은 못 보는" 역할을 만들 수 있다. 시험에서 "SecureString을 평문으로 가져오려면?"의 답이 `--with-decryption`인 이유다.

계층 구조는 Parameter Store의 강력한 무기다. `/myapp/prod/...`, `/myapp/staging/...` 처럼 경로로 환경을 나누고, IAM 정책을 경로 단위로 걸어 권한을 분리한다.

```json
{
  "Effect": "Allow",
  "Action": "ssm:GetParametersByPath",
  "Resource": "arn:aws:ssm:ap-northeast-2:111122223333:parameter/myapp/prod/*"
}
```

> 💡 **관련 이론**: 경로 기반 권한 분리는 파일시스템의 디렉터리 권한 모델과 같다. `/myapp/prod/*`에 prod 운영자만 접근하게 하고 `/myapp/staging/*`은 개발팀에 열어주는 식으로, 자원을 트리로 조직하고 서브트리 단위로 권한을 거는 패턴은 Unix 파일 권한부터 S3 prefix 정책, IAM 리소스 ARN 와일드카드까지 클라우드 전반에 반복된다. 계층을 평면 네이밍(`myapp_prod_db_url`)으로 만들면 이 서브트리 권한을 못 쓰므로, 처음부터 슬래시 경로로 설계하는 게 중요하다.

Standard와 Advanced 티어의 차이도 시험 포인트다.

| 항목 | Standard | Advanced |
|------|----------|----------|
| 파라미터 수 | 10,000 | 100,000 |
| 크기 | 4KB | 8KB |
| 정책(만료 등) | 없음 | 지원 |
| 가격 | 무료 | $0.05/파라미터/월 |

## Public Parameters: AWS가 공개하는 파라미터

Parameter Store에는 AWS가 제공하는 **공개 파라미터**도 있다. 최신 AMI ID나 ECS 최적화 이미지 ID 등을 하드코딩하지 않고 항상 최신값으로 가져올 수 있다.

```bash
# 최신 Amazon Linux 2023 AMI ID를 항상 최신으로
aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64
```

CloudFormation에서 이걸 참조하면 AMI ID를 템플릿에 박지 않아도 항상 최신 패치된 AMI로 인스턴스를 띄울 수 있다.

## Lambda Extension으로 호출 비용 줄이기

Lambda 함수가 매 호출마다 Secrets Manager나 Parameter Store를 API로 읽으면 ① 호출 비용 ② 콜드/웜 양쪽에서의 레이턴시가 누적된다. AWS의 **Parameters and Secrets Lambda Extension**은 이걸 함수 옆 로컬 HTTP 캐시로 해결한다.

```python
import urllib.request, os, json

def get_secret(name):
    # Extension이 localhost:2773에 캐시 프록시를 띄운다
    url = f"http://localhost:2773/secretsmanager/get?secretId={name}"
    req = urllib.request.Request(url)
    req.add_header("X-Aws-Parameters-Secrets-Token", os.environ["AWS_SESSION_TOKEN"])
    return json.loads(urllib.request.urlopen(req).read())
```

> 🔍 **더 깊이**: 이 Extension은 Lambda 실행 환경 안에 별도 프로세스로 떠서 localhost 포트(기본 2773)에 캐시된 비밀을 서빙한다. 함수 코드는 Secrets Manager SDK 대신 localhost로 HTTP 요청을 보내고, Extension이 캐시 미스일 때만 실제 API를 호출한다. 같은 실행 환경(웜 컨테이너)이 재사용되는 동안 캐시가 유지되므로 호출당 API 요청이 극적으로 줄어든다. TTL은 환경변수로 조절한다. 콜드 스타트 시 첫 1회는 실제 호출이 일어나지만, 이후 웜 호출들은 전부 로컬 캐시 히트라 비용·레이턴시가 모두 내려간다. 비밀을 코드에 캐싱하는 위험한 패턴을 AWS가 관리하는 안전한 캐시로 대체하는 셈이다.

## 비용으로 보는 선택 기준

실무에서 선택을 가르는 가장 현실적인 축은 비용이다.

```
100개 비밀을 1년간 보관할 때:
  Parameter Store (Standard):  $0
  Parameter Store (Advanced):  $60   ($0.05 × 100 × 12)
  Secrets Manager:             $480   ($0.40 × 100 × 12) + API
```

자동 회전이나 RDS 통합이 필요 없는 단순 설정값이라면 Parameter Store Standard가 압도적으로 싸다. Secrets Manager의 $0.40/월은 회전·통합·64KB·크로스 리전 복제라는 부가 가치에 대한 값이다.

> ⚠️ **함정**: "비용 최우선 + 자동 회전 불필요 + 8KB 이하"가 모두 만족되면 Parameter Store가 정답이다. 반대로 셋 중 하나라도 회전이 끼면 Secrets Manager로 넘어가야 한다. 시험은 이 결정 트리를 시나리오로 위장해 묻는다: "자동 회전 필요?" → YES면 Secrets Manager, NO면 "크기 8KB 초과?" → YES면 Secrets Manager, NO면 "RDS 통합?" → YES면 Secrets Manager, 전부 NO면 Parameter Store.

## 정리하며

Parameter Store는 "가볍고 계층적인 설정 저장소"로 출발해 SecureString으로 가벼운 비밀까지 담고, Secrets Manager는 "회전·RDS 통합·크로스 리전"이라는 무거운 요구를 위해 따로 태어났다. 둘을 가르는 기준은 자동 회전·크기·비용 세 가지로 압축되며, 회전이 끼면 항상 Secrets Manager다. 회전이 4단계 검증 구조라 깨져도 옛 비밀이 유지된다는 점, SecureString은 `--with-decryption` 없이는 암호문으로 나온다는 점, Lambda Extension으로 호출 비용을 줄인다는 점이 실무·시험 양쪽의 핵심이다.

다음 글에서는 비밀의 다른 측면 — 사용자 인증 자체를 관리하는 Cognito를 본다. 비밀번호를 안전하게 회전하는 것을 넘어, 사용자가 누구인지 증명하고 그 증명을 AWS 리소스 접근 권한으로 바꾸는 흐름이다.

---

## 📝 연습 문제

**문제 1.** 프로덕션 RDS MySQL의 DB 비밀번호를 30일마다 자동으로 회전해야 한다. 가장 적합한 서비스는?

A) SSM Parameter Store SecureString + EventBridge 스케줄
B) AWS Secrets Manager 자동 회전
C) Lambda로 직접 회전 로직 구현 + Parameter Store 저장
D) KMS 자동 키 회전

**정답: B**

해설: Secrets Manager는 RDS MySQL에 대해 AWS가 검증한 회전 Lambda를 자동 생성·관리한다. 콘솔에서 회전을 켜면 4단계(createSecret → setSecret → testSecret → finishSecret) 회전이 검증과 함께 동작한다. A) Parameter Store는 회전 기능 자체가 없어 스케줄을 걸어도 회전 로직을 직접 짜야 한다. C) 직접 구현은 불필요하게 복잡하고 AWS 관리 Lambda를 재발명하는 격. D) KMS 키 회전은 암호화 키이지 DB 비밀번호와 무관. "RDS + 자동 회전"이 보이면 Secrets Manager다.

---

**문제 2.** SSM Parameter Store에서 SecureString 파라미터를 **평문으로** 가져오는 CLI 명령은?

A) `aws ssm get-parameter --name /key`
B) `aws ssm get-parameter --name /key --with-decryption`
C) `aws ssm get-secure-parameter --name /key`
D) `aws kms decrypt --parameter /key`

**정답: B**

해설: SecureString은 기본적으로 **암호화된 채** 반환되며, 평문을 받으려면 `--with-decryption`을 추가해야 한다. 이때 호출자는 해당 KMS 키에 대한 `kms:Decrypt` 권한이 필요하다. 이 분리 덕분에 "파라미터 존재는 보지만 평문은 못 보는" 역할을 만들 수 있다. C) `get-secure-parameter`라는 명령은 없다. D) KMS decrypt를 직접 부르는 게 아니라 SSM이 복호화를 대행한다.

---

**문제 3.** Secrets Manager와 Parameter Store가 **둘 다** 제공하는 기능은?

A) Lambda 기반 자동 회전
B) RDS 통합 회전
C) KMS를 이용한 저장 암호화
D) 64KB 비밀 저장

**정답: C**

해설: 두 서비스 모두 KMS로 저장 데이터를 암호화한다 — Parameter Store는 SecureString 타입이 KMS 암호화다. 그래서 "암호화 지원"만으로는 둘을 가를 수 없다. A·B) 자동 회전과 RDS 통합 회전은 Secrets Manager 전용이다. D) 64KB는 Secrets Manager만, Parameter Store는 Standard 4KB / Advanced 8KB. 진짜 차이는 회전·통합·크기이지 암호화 여부가 아니라는 게 함정 포인트.

---

**문제 4.** 자동 회전이 불필요하고, 값이 2KB이며, 비용을 최소화하려는 단순 설정값(예: 기능 플래그)을 저장하려 한다. 가장 적합한 선택은?

A) Secrets Manager
B) Parameter Store Standard
C) Parameter Store Advanced
D) S3 객체

**정답: B**

해설: 자동 회전 불필요 + 8KB 이하 + 비용 최우선이면 Parameter Store Standard가 정답이다. Standard는 4KB 한도 안에 들고 **무료**다. A) Secrets Manager는 비밀당 $0.40/월로 회전 없는 단순 설정에는 과한 비용. C) Advanced는 8KB·정책 기능이 필요할 때이지 2KB 단순값엔 불필요. D) S3는 설정 조회용으로는 권한·계층·암호화 통합이 약하다. 결정 트리상 "회전 NO → 크기 NO → RDS NO → 비용 최우선"의 종착점이 Parameter Store Standard.

---

**문제 5.** Lambda 함수가 매 호출마다 Secrets Manager를 API로 읽어 비용과 레이턴시가 누적된다. 비밀을 코드에 영구 캐싱하지 않으면서 호출을 줄이는 AWS 권장 방법은?

A) 비밀을 Lambda 환경변수에 평문으로 복사
B) Parameters and Secrets Lambda Extension으로 로컬 캐싱
C) 비밀을 S3에 복제해 읽기
D) Provisioned Concurrency 증설

**정답: B**

해설: AWS Parameters and Secrets Lambda Extension은 실행 환경 안에 localhost(기본 2773) 캐시 프록시를 띄워, 웜 컨테이너가 재사용되는 동안 캐시 히트로 실제 API 호출을 줄인다. 비밀을 코드/환경변수에 평문 캐싱하는 위험을 AWS 관리 캐시로 대체한다. A) 환경변수 평문 복사는 노출 위험 + 회전 시 갱신 안 됨. C) S3 복제는 비밀 노출면을 늘림. D) Provisioned Concurrency는 콜드 스타트용이지 비밀 호출 비용과 무관.

---

**문제 6.** Alternating-Users 회전 전략이 Single-User보다 권장되는 핵심 이유는?

A) 비용이 더 저렴해서
B) 회전 중 옛 사용자를 한동안 살려둬 다운타임이 거의 없어서
C) Parameter Store에서도 동작해서
D) KMS 키도 함께 회전해서

**정답: B**

해설: Alternating-Users는 두 DB 계정(A↔B)을 번갈아 써서, 회전 시 현재 안 쓰는 쪽 비밀번호를 먼저 바꾼 뒤 전환하고 옛 계정을 한동안 유지한다. 덕분에 옛 비밀번호를 캐싱한 클라이언트도 회전 직후 일정 시간 접속을 이어가 다운타임이 거의 없다. Single-User는 같은 계정 비밀번호를 즉시 교체해 전환 순간 짧은 인증 실패가 가능하다. A) 비용과 무관. C) 회전은 Secrets Manager 기능. D) DB 비밀번호 회전이지 KMS 키 회전이 아니다.

---

**문제 7.** EC2 Auto Scaling 시작 템플릿에서 AMI ID를 하드코딩하지 않고 항상 최신 Amazon Linux 2023 이미지를 쓰려 한다. 가장 적합한 방법은?

A) Secrets Manager에 AMI ID 저장
B) Parameter Store Public Parameter(`/aws/service/ami-amazon-linux-latest/...`) 참조
C) Lambda로 매일 AMI ID 조회해 템플릿 수정
D) AMI ID를 환경변수로 주입

**정답: B**

해설: AWS는 최신 AMI ID 등을 Parameter Store **Public Parameter**로 공개한다. `/aws/service/ami-amazon-linux-latest/al2023-...`를 참조하면 항상 최신 패치 AMI를 하드코딩 없이 가져올 수 있고, CloudFormation/시작 템플릿에서 직접 참조 가능하다. A) Secrets Manager는 비밀 저장용이라 부적합하고 자동 갱신도 안 됨. C) 직접 조회 자동화는 불필요한 복잡성. D) 환경변수 주입은 갱신을 사람이 해야 한다.
