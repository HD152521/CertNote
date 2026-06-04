# Day 11 - Lambda Execution Model: Firecracker MicroVM이 함수를 실행하는 방법

2014년 Amazon은 내부적으로 심각한 문제를 마주하고 있었다. EC2 위에 올라가는 컨테이너 기반 함수 실행 환경은 멀티테넌시 보안 격리가 약했고, 콜드 스타트가 수 초에 달했다. 같은 해 발표된 Lambda는 초창기엔 컨테이너(LXC)로 동작했지만, 이 모델은 보안 경계가 불분명하고 밀도(하드웨어당 동시 실행 수)가 낮았다. 해결책으로 AWS는 2018년 AWS re:Invent에서 **Firecracker**를 공개했다. Rust로 작성된 MicroVM 하이퍼바이저로, 부팅에 125ms 미만, 메모리 오버헤드 5MB 미만을 달성한다. Lambda는 2019년부터 Firecracker 위에서 동작한다.

Firecracker를 이해하면 Lambda의 실행 모델이 한눈에 보인다. 전통적인 VM(QEMU 기반)은 에뮬레이션 레이어가 수백 개의 가상 디바이스를 구현한다. Firecracker는 그 대부분을 버리고 최소한의 가상 NIC, 블록 디바이스, 직렬 포트, 키보드만 남긴다. 결과적으로 코드 크기가 50,000줄 이하로 공격 표면(attack surface)이 극도로 작아진다. KVM(Linux 커널의 하이퍼바이저 레이어)을 그대로 활용하기 때문에 Intel VT-x / AMD-V 하드웨어 가상화를 쓰며, Rust의 메모리 안전성이 버그를 원천 차단한다.

## Lambda 실행 환경의 수명 주기: INIT → INVOKE → SHUTDOWN

Lambda 실행 환경(Execution Environment)은 Firecracker MicroVM 위에서 세 단계를 거친다.

**INIT 단계**는 콜드 스타트의 본질이다. Lambda 서비스는 먼저 MicroVM을 부팅하고, 런타임 프로세스(Python 인터프리터, JVM, Node.js 프로세스 등)를 올린다. 그런 다음 ZIP/컨테이너에서 코드를 꺼내 `/var/task`에 올리고, `import`나 클래스 로딩이 일어난다. 마지막으로 핸들러 외부의 코드 — 글로벌 변수 선언, DB 연결 초기화, 설정 파일 로딩 — 가 실행된다. 이 전체가 INIT이고, 이 시간만큼 첫 요청 응답이 느려진다.

**INVOKE 단계**는 핸들러 함수 자체의 실행이다. 이벤트가 핸들러로 전달되고, 함수가 응답을 반환하면 Lambda 서비스가 결과를 회수한다. 웜 스타트는 이 단계만 실행되기 때문에 빠르다.

**SHUTDOWN 단계**는 일정 시간(대략 수 분 ~ 1시간, 정확한 값은 AWS가 공개하지 않음) 동안 호출이 없을 때 Lambda 서비스가 MicroVM을 회수하는 과정이다. 이후 동일 함수 호출이 오면 다시 INIT부터 시작한다.

```python
import json
import boto3
import logging

# INIT 단계에서 실행 — 콜드 스타트 시 1회
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# DB 연결을 핸들러 외부에 두어야 웜 스타트 시 재사용
s3_client = boto3.client('s3')
_db_connection = None

def get_db():
    global _db_connection
    if _db_connection is None:
        # 실제로는 RDS Proxy나 pymysql 연결
        _db_connection = create_connection()
    return _db_connection

def lambda_handler(event, context):
    """INVOKE 단계에서 실행 — 매 호출마다"""
    logger.info(f"함수: {context.function_name}, 남은 시간: {context.get_remaining_time_in_millis()}ms")
    
    db = get_db()  # 웜 스타트면 이미 연결된 객체 반환
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'ok'})
    }
```

> 💡 **관련 이론**: Lambda의 "한 환경에서 한 번에 하나의 요청만" 처리한다는 규칙은 **공유 상태 없는 함수형 프로그래밍**과 같다. Pure function은 동일 입력에 동일 출력을 반환하며 사이드 이펙트가 없다. 하지만 Lambda는 글로벌 변수로 상태를 캐싱한다 — 이건 의도적으로 허용된 최적화다. 핵심은 같은 환경의 다음 호출에서 그 상태가 보이지만, 다른 환경(다른 MicroVM)에서는 전혀 보이지 않는다는 점이다. 분산 시스템 설계 원칙에서는 이를 "지역 캐싱(local cache)"이라고 부른다.

## 콜드 스타트의 해부: 무엇이 얼마나 걸리는가

콜드 스타트 지연은 세 구간으로 나눌 수 있다.

**런타임 초기화**: Python은 수십 ms, Java(JVM 부팅)는 수백 ms ~ 1초 이상, Go/Rust는 수 ms. JVM이 느린 이유는 클래스 로딩과 JIT 컴파일 warmup이 필요하기 때문이다.

**코드 초기화**: `import boto3`, `import pandas` 같은 대형 패키지 로딩. pandas 자체가 50MB가 넘고, numpy C 확장을 링크한다. 레이어로 분리해도 결국 `/opt`에서 불러야 한다. 코드 크기는 직접 영향을 미친다.

**INIT 코드 실행**: DB 연결, HTTP 클라이언트 초기화, SSM/Secrets Manager에서 시크릿 로딩. 이 부분이 개발자가 통제할 수 있는 가장 큰 변수다.

| 런타임 | 일반 콜드 스타트 | 패키지 최적화 후 |
|--------|----------------|----------------|
| Python 3.12 | 200–500ms | 100–200ms |
| Node.js 20.x | 100–300ms | 50–150ms |
| Java 21 (JVM) | 1000–3000ms | 500–1000ms |
| Java 21 (SnapStart) | 100–300ms | 100–300ms |
| Go 1.x | 50–150ms | 30–100ms |
| .NET 8 | 300–800ms | 200–500ms |

> 💡 **관련 이론**: SnapStart는 Java에서 **체크포인팅(checkpointing)** 아이디어를 구현한 것이다. CRIU(Checkpoint/Restore In Userspace)라는 Linux 기술을 참고했는데, 프로세스의 메모리 상태를 스냅샷 찍어두고 나중에 복원하는 방식이다. Lambda SnapStart는 버전 발행 시점에 JVM이 완전히 초기화된 상태를 S3에 스냅샷으로 저장한다. 이후 호출 시 MicroVM이 그 스냅샷을 그대로 복원하므로 JVM 부팅과 코드 INIT을 건너뛴다. 단, 스냅샷 복원 시 현재 시간, 랜덤 시드, 환경별 자격증명 같은 것들은 재초기화가 필요하다. `CRaC`(Coordinated Restore at Checkpoint) API로 이 시점에 훅을 걸 수 있다.

> ⚠️ **함정**: SnapStart는 **버전을 발행해야 활성화**된다. `$LATEST`에서는 동작하지 않는다. 따라서 Lambda 별칭과 함께 사용해야 하고, CodeDeploy 트래픽 시프트도 함께 설정하는 것이 일반적이다.

## Provisioned Concurrency vs Reserved Concurrency: 완전히 다른 목적

두 개념을 헷갈리는 것이 시험 실패의 가장 흔한 원인이다.

**Reserved Concurrency**는 함수의 동시성 상한(ceiling)이자 하한(floor)이다. `put-function-concurrency --reserved-concurrent-executions 100`으로 설정하면 이 함수는 최대 100개의 MicroVM만 동시에 실행된다. 동시에, 계정 전체 동시성 풀에서 100개가 이 함수에 전용으로 예약되어 다른 함수가 쓸 수 없다. 0으로 설정하면 모든 호출이 즉시 ThrottlingException 429를 받는다 — 함수를 소프트 비활성화하는 방법이다. **Reserved는 비용이 없다.**

**Provisioned Concurrency**는 콜드 스타트를 미리 없애는 기능이다. `put-provisioned-concurrency-config --provisioned-concurrent-executions 20`을 설정하면 20개의 MicroVM이 INIT까지 완료된 웜 상태로 항상 대기한다. 요청이 와도 즉시 INVOKE 단계만 실행된다. **이건 반드시 버전 또는 별칭에만 설정할 수 있고, `$LATEST`에는 불가능하다.** 비용은 초기화된 MicroVM 수 × 시간 × GB로 과금된다.

```bash
# Reserved Concurrency 설정 (상한선 + 전용 할당)
aws lambda put-function-concurrency \
  --function-name payment-service \
  --reserved-concurrent-executions 200

# Provisioned Concurrency (버전에 설정 — $LATEST 불가)
aws lambda publish-version \
  --function-name payment-service
# 출력: {"Version": "5"}

aws lambda put-provisioned-concurrency-config \
  --function-name payment-service \
  --qualifier 5 \
  --provisioned-concurrent-executions 20

# 또는 별칭에 설정
aws lambda create-alias \
  --function-name payment-service \
  --name prod \
  --function-version 5

aws lambda put-provisioned-concurrency-config \
  --function-name payment-service \
  --qualifier prod \
  --provisioned-concurrent-executions 20
```

> 💡 **관련 이론**: Provisioned Concurrency는 자동 확장과도 연동된다. Application Auto Scaling의 **target tracking** 정책으로 `ProvisionedConcurrencyUtilization` 메트릭이 80%를 넘으면 자동으로 Provisioned Concurrency를 늘릴 수 있다. 예측 가능한 트래픽 패턴(오전 9시 spike)이 있다면 **scheduled scaling**으로 사전에 늘려놓는 패턴도 흔하다.

## Lambda 한도: 시험에 나오는 숫자들

| 항목 | 한도 | 비고 |
|------|------|------|
| 메모리 | 128MB ~ 10,240MB | 64MB 단위 증가 |
| vCPU | 메모리에 비례 | 1,769MB = 1 vCPU |
| 타임아웃 | 1초 ~ 900초 | 15분 |
| /tmp 스토리지 | 512MB ~ 10,240MB | |
| 환경 변수 전체 크기 | 4KB | |
| 동기 페이로드 (요청/응답) | 6MB | |
| 비동기 페이로드 | 256KB | |
| Response Streaming | 20MB | Function URL 또는 APIGW |
| ZIP 직접 업로드 | 50MB | |
| ZIP S3 경유 | 250MB (압축 해제) | |
| 컨테이너 이미지 | 10GB | |
| 계정/리전 동시성 기본 | 1,000 | 증가 요청 가능 |
| 초기 버스트 한도 | 500~3,000 | 리전별 상이 |
| 분당 추가 가능 동시성 | +500 | |
| 레이어 최대 개수 | 5개 | |
| 레이어+코드 합계 | 250MB | 압축 해제 기준 |

> 🔍 **더 깊이**: `1,769MB = 1 vCPU`라는 숫자는 Lambda 설계 시 정해진 비율이다. 256MB 함수는 약 0.145 vCPU를 받는다. 이 비율은 CPU-bound 작업에서 메모리를 늘리면 성능이 좋아지는 핵심 이유다. 비선형적이라 2배 메모리가 항상 2배 속도를 의미하지는 않지만, CPU 집약적 작업(이미지 처리, 암호화, JSON 직렬화)에서는 메모리 증가가 실행 시간을 줄여 GB-초 기준 비용이 오히려 낮아지는 경우가 있다.

## VPC Lambda와 Hyperplane ENI

VPC Lambda는 2019년 이전에 악명 높았다. 함수가 VPC에 연결될 때마다 ENI(Elastic Network Interface)를 새로 생성했고, ENI 생성에 10~30초가 걸렸다. 스케일아웃 시 ENI를 수십 개 만들어야 해서 콜드 스타트가 폭발적으로 늘었다.

2019년 9월 AWS는 **Hyperplane ENI**를 도입했다. 핵심 아이디어는 ENI를 함수 인스턴스마다 만드는 대신, VPC 설정(서브넷 + SG 조합)을 공유하는 NAT 계층을 두는 것이다. 실행 환경들이 Hyperplane 네트워크 계층을 공유하고, 그 계층이 VPC ENI를 유지한다. 결과적으로 ENI 생성이 첫 VPC 연결 시 한 번만 일어나고, 이후 확장 시에는 ENI를 재사용한다.

```bash
# VPC 연결 Lambda 생성
aws lambda create-function \
  --function-name rds-connector \
  --runtime python3.12 \
  --handler handler.lambda_handler \
  --role arn:aws:iam::123:role/LambdaVpcRole \
  --zip-file fileb://function.zip \
  --vpc-config SubnetIds=subnet-abc,subnet-def,SecurityGroupIds=sg-xyz \
  --timeout 30 \
  --memory-size 256
```

> ⚠️ **함정**: VPC에 연결된 Lambda는 **인터넷에 직접 접근할 수 없다**. 퍼블릭 서브넷에 놓아도 마찬가지다 — Lambda는 ENI를 통해 VPC에 들어가지만, 공인 IP를 받지 않는다. 인터넷이 필요하면 NAT Gateway + 프라이빗 서브넷, 또는 VPC Endpoint(AWS 서비스용)가 필요하다. "Lambda가 Secrets Manager에 못 붙어요"라는 시나리오에서 VPC Lambda에 VPC Endpoint가 없는 경우가 흔한 함정이다.

## Lambda 권한 모델: 두 가지 정책

Lambda 함수와 관련된 IAM 정책은 성격이 완전히 다른 두 종류다.

**Execution Role(실행 역할)**은 Lambda 함수가 다른 AWS 서비스를 호출할 때 사용하는 역할이다. 함수 코드 안에서 `boto3.client('s3').put_object(...)` 할 때 이 역할의 권한으로 동작한다.

**Resource-based Policy(리소스 기반 정책, Function Policy)**는 반대 방향이다. "누가 이 Lambda를 호출할 수 있는가"를 제어한다. S3가 Lambda를 트리거하려면, SNS가 Lambda를 호출하려면, API Gateway가 Lambda를 invoke하려면 — 모두 이 정책에 principal이 등록되어야 한다.

```bash
# API Gateway가 Lambda를 호출하는 권한 부여
aws lambda add-permission \
  --function-name my-api \
  --statement-id apigateway-prod-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:ap-northeast-2:123456789:abc123/prod/*/orders"
```

> 💡 **관련 이론**: 이 두 정책은 IAM의 **identity-based policy vs resource-based policy** 구분과 정확히 일치한다. Identity-based는 "나(주체)는 무엇을 할 수 있는가", resource-based는 "이 자원에 누가 접근할 수 있는가"다. 같은 이분법이 S3 버킷 정책, SQS 큐 정책, KMS 키 정책에도 적용된다.

## Lambda Extensions: 사이드카 패턴

Lambda Extensions는 함수와 함께 실행되는 별도 프로세스다. **외부 확장**은 독립적인 프로세스로 실행되며, `/opt/extensions/` 경로에 바이너리를 넣으면 Lambda 서비스가 함수와 나란히 실행시킨다. **내부 확장**은 런타임 내부에서 실행되며, 언어별 래퍼 형태다.

실무에서 가장 많이 쓰이는 것은 **AWS Parameters and Secrets Lambda Extension**이다. 이 확장은 함수 코드가 `localhost:2773`으로 HTTP 요청을 보내면 SSM Parameter Store나 Secrets Manager 값을 캐싱해서 반환한다. 함수가 매 호출마다 Secrets Manager API를 호출하면 비용이 발생하고 레이턴시가 늘지만, 확장이 TTL 기간 동안 캐시를 유지하므로 API 호출 횟수가 대폭 줄어든다.

> 📚 **사례**: Datadog, Dynatrace, New Relic 같은 APM 벤더들이 Lambda Extension을 활용한다. 기존엔 Lambda 함수 코드 안에 SDK를 심어야 했지만, Extension을 통해 함수 코드를 수정하지 않고도 메트릭과 트레이스를 수집할 수 있다. AWS re:Invent 2020에서 공식 발표됐고, 이 패턴은 마이크로서비스의 사이드카 패턴(Envoy, Istio)과 철학적으로 동일하다.

## 다른 클라우드와 비교: FaaS 구현체의 차이

| 항목 | AWS Lambda | GCP Cloud Functions (Gen 2) | Azure Functions |
|------|-----------|----------------------------|-----------------|
| 격리 | Firecracker MicroVM | gVisor (Linux syscall 에뮬레이션) | Hyper-V 컨테이너 |
| 콜드 스타트 (Python) | 200–500ms | 100–300ms | 200–600ms |
| 최대 실행 시간 | 15분 | 60분 (HTTP), 9분 (이벤트) | 10분 (Consumption) |
| 최대 메모리 | 10GB | 16GB | 14GB |
| VPC 연동 | ✅ | ✅ | ✅ |
| Snapshottng | SnapStart (Java) | 없음 | 없음 |
| 가격 모델 | 요청 수 + GB-초 | 요청 수 + GHz-초 | 요청 수 + GB-초 |

> 🔍 **더 깊이**: gVisor는 Google이 만든 컨테이너 샌드박스로, 앱과 Linux 커널 사이에 Go로 작성된 커널 에뮬레이션 레이어를 삽입한다. Firecracker가 실제 MicroVM(하드웨어 가상화)인 것과 달리, gVisor는 syscall 인터셉션이라 오버헤드가 다르다. Firecracker는 KVM을 사용하므로 CPU 집약적 작업에서 bare-metal에 더 가깝고, gVisor는 시스템 콜이 많은 I/O 집약적 작업에서 오버헤드가 커질 수 있다. 학술적으로는 2018 OSDI 논문 "gVisor: Reducing Security Overhead with OS-level Virtualization"이 참고 자료다.

## Response Streaming: TTFB 최적화

2023년 출시된 Lambda Response Streaming은 함수가 응답을 다 만들고 한번에 보내는 게 아니라, 청크 단위로 스트리밍하게 한다. HTTP chunked transfer encoding을 기반으로 하며, 최대 20MB까지 스트리밍 가능하다.

**사용 사례**: LLM API 호출 후 토큰 단위 스트리밍(OpenAI처럼), 대용량 JSON 파일 다운로드, 비디오 변환 진행 상황 알림.

**제한**: Function URL 또는 API Gateway HTTP API(payload v2.0)에서만 지원. REST API는 지원 안 된다.

```python
import json

def lambda_handler(event, context):
    # streamify 데코레이터 사용 (Node.js) 또는
    # Python에서 직접 awslambdaric의 streaming response 사용
    def generate():
        for i in range(10):
            yield json.dumps({"chunk": i, "data": "..." * 100}) + "\n"
    
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/x-ndjson"},
        "body": generate()  # 이터레이터를 반환하면 Lambda가 청크로 스트리밍
    }
```

## 과금 모델: 코드에서 비용을 계산하는 법

Lambda 비용은 **요청 수**와 **GB-초** 두 가지로 나온다.

```
월 비용 계산 예시:
- 함수 메모리: 512MB = 0.5GB
- 하루 호출: 100만 회
- 평균 실행 시간: 300ms

GB-초/월 = 0.5 × 0.3 × 1,000,000 × 30 = 4,500,000 GB-초
무료 티어: 400,000 GB-초

청구 GB-초: 4,100,000
비용: 4,100,000 × $0.0000166667 = $68.33/월
요청 비용: 30,000,000 × $0.20 / 1,000,000 = $6/월
총계: 약 $74.33/월
```

> 💡 **관련 이론**: Lambda의 GB-초 과금은 경제학적으로 **시간 기반 가격책정(time-based pricing)**의 변형이다. vCPU가 메모리에 비례하므로, 더 많은 CPU를 원하면 더 많은 메모리를 사야 한다. 이는 EC2의 인스턴스 타입 선택(c5 = 컴퓨팅 최적, r5 = 메모리 최적)과 다른 방식이다. AWS Power Tuning Tool을 사용하면 여러 메모리 설정에서 실행 시간과 비용을 자동으로 벤치마크해 최적 설정을 찾아준다.

## 마무리

Lambda의 실행 모델은 Firecracker MicroVM이라는 독창적인 인프라 위에 세워졌다. 콜드 스타트는 INIT 단계의 필연적 비용이고, Provisioned Concurrency와 SnapStart는 그 비용을 줄이는 두 가지 다른 접근이다. VPC Lambda는 Hyperplane ENI 이후 실용적으로 변했고, Extensions는 Lambda를 더 관찰 가능(observable)하게 만든다. 이 모든 메커니즘을 이해하면 "왜 이 함수가 첫 요청에서 느리지?"나 "왜 RDS에 못 붙지?" 같은 실무 문제가 즉각 진단된다.

다음 글에서는 이 Lambda 함수가 어떤 이벤트로 트리거되는지, SQS·Kinesis·DynamoDB Streams 이벤트 소스 매핑의 내부 폴링 메커니즘을 파고든다.

---

## 📝 연습 문제

**문제 1.** Lambda SnapStart에 대한 가장 정확한 설명은?

A) 모든 런타임에서 기본 활성화된다  
B) 버전 발행 시점에 JVM이 초기화된 스냅샷을 생성하며, $LATEST에서는 동작하지 않는다  
C) 비용이 추가로 발생하며 메모리 크기에 비례한다  
D) Provisioned Concurrency와 동시 활성화할 수 없다  

**정답: B**  
해설: SnapStart는 버전 발행(publish-version) 시점에 JVM 초기화 상태를 스냅샷으로 저장한다. `$LATEST`에는 설정할 수 없어 반드시 발행된 버전 또는 그 버전을 가리키는 별칭을 통해 호출해야 한다. A는 틀렸다 — Java 런타임만 지원하며 기본 비활성이다. C는 틀렸다 — SnapStart 자체는 무료다(스냅샷 저장 S3 비용만 미미하게 발생). D는 틀렸다 — 함께 사용할 수 있다.

---

**문제 2.** 1,769MB 메모리를 가진 Lambda 함수는 몇 vCPU를 받는가?

A) 0.5 vCPU  
B) 1 vCPU  
C) 2 vCPU  
D) 메모리와 vCPU는 무관하다  

**정답: B**  
해설: Lambda는 1,769MB = 1 vCPU라는 비율로 CPU를 할당한다. 512MB는 약 0.29 vCPU, 3,008MB는 약 1.7 vCPU다. 이 때문에 CPU 집약적 작업(JSON 직렬화, 암호화, 이미지 처리)에서 메모리를 늘리면 실행 시간이 줄어 GB-초 비용이 오히려 낮아지는 경우가 있다. AWS Lambda Power Tuning 도구로 최적 메모리를 자동으로 찾을 수 있다.

---

**문제 3.** Lambda 함수가 VPC에 연결되어 있을 때 인터넷 API를 호출하려고 한다. 어떤 설정이 필요한가?

A) VPC 연결을 제거하고 퍼블릭 Lambda로 전환한다  
B) 함수를 퍼블릭 서브넷에 배치한다  
C) 프라이빗 서브넷과 NAT Gateway를 통해 아웃바운드 인터넷 트래픽을 라우팅한다  
D) Security Group에 HTTPS(443) 인바운드 룰을 추가한다  

**정답: C**  
해설: VPC Lambda는 ENI를 통해 VPC 내부 주소를 받지만 공인 IP는 없다. 퍼블릭 서브넷에 배치해도 인터넷으로 나갈 수 없다. 인터넷 접근은 프라이빗 서브넷 + NAT Gateway 또는 프라이빗 서브넷 + VPC Endpoint(AWS 서비스 전용) 조합이 필요하다. B처럼 퍼블릭 서브넷에 배치해도 Lambda ENI는 IGW를 통해 라우팅되지 않기 때문에 의미가 없다.

---

**문제 4.** Provisioned Concurrency와 Reserved Concurrency에 대한 설명 중 옳은 것은?

A) 두 기능 모두 $LATEST 버전에 설정 가능하다  
B) Reserved Concurrency는 미리 초기화된 환경을 유지하여 콜드 스타트를 방지한다  
C) Provisioned Concurrency는 함수 버전 또는 별칭에만 설정할 수 있고, Reserved Concurrency는 $LATEST를 포함한 함수 자체에 설정한다  
D) 두 기능 모두 추가 비용이 발생한다  

**정답: C**  
해설: Provisioned Concurrency는 초기화된 실행 환경을 유지하는 기능으로 반드시 버전 번호 또는 별칭에 설정해야 한다($LATEST 불가). Reserved Concurrency는 함수 전체에 적용되는 동시성 상한선으로 $LATEST를 포함한 모든 호출에 영향을 미치며, 비용이 없다. B는 틀렸다 — Reserved는 콜드 스타트와 무관하다. D는 틀렸다 — Reserved는 무료다.

---

**문제 5.** Lambda 비동기 호출에서 Destination과 DLQ의 차이로 옳은 것은?

A) DLQ는 성공/실패 모두 처리하고, Destination은 실패만 처리한다  
B) Destination은 성공/실패 모두 처리 가능하고, SQS·SNS·EventBridge·Lambda를 대상으로 지원한다  
C) DLQ는 EventBridge를 대상으로 지원하지만, Destination은 지원하지 않는다  
D) 두 기능의 기능은 동일하며 비용만 다르다  

**정답: B**  
해설: Destination은 비동기 호출의 성공(OnSuccess)과 실패(OnFailure) 모두에 대해 SQS, SNS, EventBridge, Lambda를 대상으로 이벤트를 보낼 수 있으며, 요청과 응답 메타데이터를 포함한 풍부한 컨텍스트를 전달한다. 반면 DLQ는 최종 실패 이벤트만 SQS 또는 SNS로 보내며, 기본 페이로드만 포함한다. AWS는 새 설계에서 Destination 사용을 권장한다.

---

**문제 6.** Lambda 함수에서 글로벌 변수를 사용하는 올바른 이유는?

A) Lambda는 멀티스레드이므로 스레드 로컬 스토리지가 필요하다  
B) 같은 실행 환경이 재사용될 때 INIT 코드를 건너뛰어 웜 스타트 성능을 높이기 위해  
C) 여러 함수 인스턴스 간에 상태를 공유하기 위해  
D) Lambda에서 글로벌 변수는 권장되지 않는다  

**정답: B**  
해설: Lambda 실행 환경(MicroVM)이 웜 상태로 재사용될 때, INIT에서 실행한 글로벌 변수 초기화 코드는 다시 실행되지 않는다. DB 연결, boto3 클라이언트, 설정 파일 등을 글로벌에 두면 웜 스타트 시 재사용돼 응답 시간이 크게 줄어든다. 다만 C는 틀렸다 — 서로 다른 MicroVM 인스턴스 간에는 글로벌 변수가 공유되지 않는다. 각 인스턴스는 완전히 분리된 메모리 공간을 갖는다.

---

**문제 7.** Lambda Extensions에 대한 올바른 설명은?

A) Lambda Extensions는 함수 코드 내부에서만 실행된다  
B) 외부 확장은 함수와 별도 프로세스로 실행되며 함수가 끝난 후에도 SHUTDOWN 단계까지 실행을 유지한다  
C) Lambda Extensions는 추가 요금이 없지만 함수 타임아웃을 공유한다  
D) 외부 확장은 함수 메모리 한도 밖에서 실행된다  

**정답: B**  
해설: 외부 Lambda Extension은 `/opt/extensions/`에 배치된 독립 프로세스로, Lambda 서비스가 함수와 나란히 시작한다. INVOKE 단계에서 함수와 동시에 실행되며, SHUTDOWN 단계에서 정리 작업을 수행한다. C는 틀렸다 — 확장도 함수의 타임아웃(최대 15분)을 공유한다. D는 틀렸다 — 확장은 함수 메모리 한도 안에서 실행되므로, 확장이 메모리를 많이 쓰면 함수에서 쓸 수 있는 메모리가 줄어든다. 따라서 확장 사용 시 메모리를 충분히 늘려야 한다.

