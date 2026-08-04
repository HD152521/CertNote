# Day 4 - Nginx와 리버스 프록시: 이벤트 기반 웹 서버의 설계

## 📌 핵심 정리

- **Nginx 설정은 바깥에서 안으로 좁혀지는 블록의 중첩** — `http`(전역) → `server`(가상 호스트) → `location`(URL 경로). 안쪽이 바깥을 상속하고 필요한 부분만 덮어쓴다.
- Apache 대응: **`listen`=Listen, `server_name`=ServerName, `root`=DocumentRoot, `index`=DirectoryIndex.**
- **리버스 프록시**는 `upstream`으로 백엔드 그룹을 정의하고 `proxy_pass`로 전달한다. 백엔드를 숨기고 부하를 나누며 TLS·캐싱을 한곳에서 처리한다.
- 처리 모델이 본질적 차이 — **Apache는 연결당 프로세스/스레드, Nginx는 소수 워커의 이벤트 기반 비동기.** Nginx는 `.htaccess`가 없고 중앙 설정만 쓴다.
- `nginx -t`(문법 검사) → **`nginx -s reload`(무중단 재적용)**. 동시 연결은 `worker_processes × worker_connections`이되 **OS의 fd 한계에 묶인다.**

## Nginx 설치와 디렉터리 구조

```bash
# 설치
yum install nginx

# 데몬 제어
systemctl start nginx
systemctl enable nginx

# 설정 문법 검사 (재시작 전 필수!)
nginx -t

# 설정 무중단 재적용 (연결 끊김 없이 reload)
nginx -s reload
systemctl reload nginx
```

| 경로 | 역할 |
|------|------|
| `/etc/nginx/nginx.conf` | 메인 설정 파일 |
| `/etc/nginx/conf.d/` | 사이트별 설정 분리 디렉터리 |
| `/usr/share/nginx/html/` | 기본 문서 루트 |
| `/var/log/nginx/` | access.log, error.log |

> 💡 **개념**: `nginx -s reload`는 Apache 재시작과 결이 다르다. Nginx는 마스터 프로세스가 새 설정으로 새 워커를 띄우고, 기존 워커는 처리 중인 요청을 마저 끝낸 뒤 종료한다. 그래서 설정을 바꿔도 **연결이 끊기지 않는 무중단 reload**가 가능하다. 운영 중 서비스에 설정을 반영할 때 이 점이 큰 장점이다.

## nginx.conf — 블록의 중첩 구조

- Nginx 설정의 핵심은 **블록(컨텍스트)의 계층**이다.

```nginx
worker_processes auto;            # 워커 프로세스 수(보통 CPU 코어 수)

events {
    worker_connections 1024;      # 워커 하나가 처리할 동시 연결 수
}

http {
    include       mime.types;     # MIME 타입 정의
    default_type  application/octet-stream;
    sendfile      on;             # 커널 수준 파일 전송(효율↑)
    keepalive_timeout 65;

    access_log /var/log/nginx/access.log;

    server {
        listen 80;                # 수신 포트
        server_name www.example.com;   # 가상 호스트 이름
        root /usr/share/nginx/html;    # 문서 루트(Apache의 DocumentRoot)
        index index.html;              # 기본 문서

        location / {
            try_files $uri $uri/ =404;
        }

        location /images/ {       # /images/로 시작하는 요청만 매칭
            root /data;           # → /data/images/ 에서 파일 제공
        }
    }
}
```

| 블록 | 범위 | 주요 역할 |
|------|------|-----------|
| (main) | 전역 | `worker_processes` 등 프로세스 수준 |
| `events` | 연결 처리 | `worker_connections`(동시 연결 한계) |
| `http` | HTTP 전체 | 로그·MIME·sendfile 등 공통 설정 |
| `server` | 가상 호스트 1개 | `listen`, `server_name`, `root` |
| `location` | URL 경로 | 경로별 처리(파일·프록시·리다이렉트) |

| 지시어 | 역할 |
|--------|------|
| `listen` | 수신 포트(Apache의 Listen) |
| `server_name` | 가상 호스트 도메인(Apache의 ServerName) |
| `root` | 문서 루트(Apache의 DocumentRoot) |
| `index` | 기본 문서(Apache의 DirectoryIndex) |
| `location` | URL 경로별 처리 규칙 |
| `try_files` | 파일을 순서대로 찾아 없으면 지정 동작(=404 등) |

> 🔍 **더 깊이**: `worker_processes auto`는 CPU 코어 수만큼 워커를 띄우고, 각 워커는 `worker_connections` 개수만큼의 연결을 비동기로 처리한다. 이론상 동시 처리 가능 연결은 대략 `worker_processes × worker_connections`다. Apache(prefork)가 연결 하나당 프로세스 하나를 쓰는 것과 비교하면, Nginx는 소수의 워커로 수만 연결을 감당한다 — 이것이 정적 콘텐츠와 동시 접속에서 Nginx가 강한 이유다.

> ⚠️ **함정**: `server_name`이 여러 server 블록에서 매칭되지 않거나 비어 있으면, Nginx는 **해당 포트의 첫 server 블록 또는 `default_server`로 표시된 블록**을 기본으로 사용한다. 또한 `location` 매칭에는 우선순위가 있다 — 정확 일치(`=`), 접두사 일치, 정규식(`~`) 순으로 규칙이 적용되며, 이를 혼동하면 엉뚱한 location이 처리된다.

## 리버스 프록시 — Nginx의 대표 용도

- **리버스 프록시(reverse proxy)** : 클라이언트 요청을 받아 뒤편 애플리케이션 서버(백엔드)로 전달하고, 그 응답을 다시 돌려주는 중계자.
- Nginx가 **가장 널리 쓰이는 용도**가 바로 이것이다.

```nginx
http {
    upstream backend {            # 백엔드 서버 그룹 정의
        server 127.0.0.1:8080;
        server 127.0.0.1:8081;    # 여러 대면 자동 부하 분산
    }

    server {
        listen 80;
        server_name www.example.com;

        location / {
            proxy_pass http://backend;              # 요청을 백엔드로 전달
            proxy_set_header Host $host;            # 원래 Host 헤더 보존
            proxy_set_header X-Real-IP $remote_addr; # 실제 클라이언트 IP 전달
        }
    }
}
```

| 지시어 | 역할 |
|--------|------|
| `upstream` | 백엔드 서버 그룹 정의(부하 분산 단위) |
| `proxy_pass` | 매칭된 요청을 지정한 백엔드로 전달 |
| `proxy_set_header` | 백엔드로 전달할 때 헤더 추가·보존 |

```text
[클라이언트] → [Nginx :80] → [앱 서버 :8080]
              (리버스 프록시)   (실제 처리)
```

> 💡 **개념**: 정방향 프록시(forward proxy)는 **클라이언트를 대신해** 외부로 나가는 중계자(예: 회사 내부에서 인터넷 접속을 거르는 프록시)다. 리버스 프록시는 반대로 **서버 앞단에서** 외부 요청을 받아 내부로 분배한다. 클라이언트는 백엔드의 존재를 모르고 Nginx만 본다. 이 구조로 백엔드를 숨기고(보안), 여러 대에 부하를 나누고(확장), TLS 종료·캐싱·압축을 한 곳에서 처리한다.

> 📚 **유래·사례**: Nginx(엔진엑스)는 2004년 이고르 시쇼프(Igor Sysoev)가 C10K 문제 — 한 서버에서 1만 개 동시 연결을 처리하기 — 를 풀기 위해 만들었다. 당시 Apache의 프로세스/스레드 모델은 연결마다 자원을 잡아 1만 연결에서 메모리가 폭발했다. Nginx는 이벤트 기반 비동기 구조로 같은 하드웨어에서 훨씬 많은 연결을 버텼고, 이 효율 덕에 정적 서빙·리버스 프록시·로드 밸런서로 폭발적으로 퍼졌다. 오늘날 대형 사이트의 앞단에 거의 빠짐없이 Nginx가 놓이는 배경이다.

## 부하 분산 방식

- `upstream`에 여러 서버를 두면 Nginx가 요청을 나눠 보낸다. **분배 방식을 지정**할 수 있다.

```nginx
upstream backend {
    # 기본: 라운드 로빈(순서대로 번갈아)
    server 10.0.0.1;
    server 10.0.0.2;

    # least_conn;          # 연결 수가 가장 적은 서버로
    # ip_hash;             # 같은 클라이언트는 항상 같은 서버로(세션 고정)
}
```

| 방식 | 동작 |
|------|------|
| 라운드 로빈(기본) | 순서대로 번갈아 분배 |
| `least_conn` | 현재 연결이 가장 적은 서버로 |
| `ip_hash` | 클라이언트 IP 해시로 고정 서버 매핑(세션 유지) |

## 웹 로그와 튜닝

- Nginx 로그도 **access와 error 두 가지**다.

```bash
# 접근 로그: 요청·상태 코드
tail -f /var/log/nginx/access.log

# 오류 로그
tail -f /var/log/nginx/error.log
```

- 성능 튜닝의 핵심 지시어는 다음과 같다.

```nginx
http {
    sendfile on;              # 커널이 직접 파일 전송(복사 줄임)
    tcp_nopush on;            # 패킷을 모아 전송(효율↑)
    keepalive_timeout 65;     # 연결 재사용 유지 시간
    gzip on;                  # 응답 압축으로 전송량 감소

    worker_rlimit_nofile 65535;   # 워커당 열 수 있는 파일 디스크립터 한계
}
```

| 지시어 | 효과 |
|--------|------|
| `sendfile on` | 파일을 커널 수준에서 바로 전송해 CPU·메모리 절약 |
| `gzip on` | 응답을 압축해 대역폭 절약(텍스트에 효과적) |
| `keepalive_timeout` | 연결을 재사용해 핸드셰이크 비용 절감 |
| `worker_connections` | 워커당 동시 연결 한계(동시 접속 규모 결정) |

> ⚠️ **함정**: 동시 접속이 많은데 연결이 거부된다면, 단순히 `worker_processes`만 늘려선 안 되고 `worker_connections`와 OS의 파일 디스크립터 한계(`worker_rlimit_nofile`, `ulimit -n`)를 함께 올려야 한다. 한쪽만 키우면 다른 쪽이 병목이 된다. "동시 연결 한계 = worker_processes × worker_connections, 단 OS의 fd 한계에 묶임"을 기억하자.

## Apache vs Nginx — 본질적 비교

| 항목 | Apache | Nginx |
|------|--------|-------|
| 처리 모델 | 프로세스/스레드(연결당 하나) | 이벤트 기반 비동기(소수 워커) |
| 동시 접속 효율 | 보통(메모리 많이 씀) | 매우 높음 |
| 정적 파일 서빙 | 보통 | 매우 빠름 |
| 동적 처리 | 모듈로 내장(mod_php 등) | 외부 프로세스에 위임(프록시) |
| 설정 단위 | 디렉터리 + .htaccess | location 블록(런타임 .htaccess 없음) |
| 디렉터리별 분산 설정 | `.htaccess` 지원 | 미지원(중앙 설정만) |
| 대표 용도 | 전통적 웹 호스팅 | 리버스 프록시·정적 서빙·로드 밸런서 |

> 🔍 **더 깊이**: 실무에서는 둘을 **함께** 쓰는 구성이 흔하다. Nginx를 맨 앞단에 두어 정적 파일·TLS·부하 분산을 처리하고, 동적 요청만 뒤편 Apache(또는 애플리케이션 서버)로 프록시하는 식이다. Nginx의 비동기 효율과 Apache의 풍부한 모듈 생태계를 모두 취하는 절충이다. 또한 Nginx에는 `.htaccess`가 없어 디렉터리별 분산 설정이 불가능한데, 이는 단점이 아니라 **모든 설정을 중앙에서 관리해 매 요청마다 디렉터리를 뒤지지 않으므로 더 빠르다**는 설계 철학의 결과다.

## 직접 쳐보기 — Nginx 설정·검증

```bash
# 1. 문법 검사
nginx -t

# 2. 무중단 재적용
nginx -s reload

# 3. 응답 확인
curl -I http://localhost/         # 상태 코드 확인
curl http://localhost/

# 4. 어떤 server 블록·서버 버전이 응답하는지
curl -I http://localhost/ | grep -i server

# 5. 로그 관찰
tail -f /var/log/nginx/access.log
```

- 리버스 프록시 테스트: 백엔드(예: `python3 -m http.server 8080`)를 띄우고 `proxy_pass http://127.0.0.1:8080;`를 설정한 뒤, Nginx 80번 포트로 접속해 **백엔드 응답이 중계되는지** 확인한다.

내일은 이번 주 DNS·DHCP·NTP·Apache·Nginx를 하나로 엮어 종합 복습하고, 연습 문제로 점검한다.

## 📖 용어

- **C10K 문제** : 한 서버에서 동시 접속 1만 개를 감당하는 과제. Nginx가 태어난 이유다.
- **이벤트 루프** : 적은 수의 워커가 여러 연결을 번갈아 비동기로 처리하는 방식. 연결마다 프로세스를 띄우지 않는다.
- **`worker_processes` / `worker_connections`** : 띄울 워커 수(보통 CPU 코어 수) / 워커 하나가 감당할 동시 연결 수.
- **`http` / `server` / `location` 블록** : HTTP 전역 설정 / 가상 호스트 하나 / URL 경로별 처리 규칙.
- **`try_files`** : 지정한 순서대로 파일을 찾아보고 전부 없으면 정해진 동작(=404 등)을 하는 지시어.
- **`default_server`** : 매칭되는 `server_name`이 없을 때 요청을 받을 기본 server 블록 표시.
- **location 매칭 우선순위** : 정확 일치(`=`) → 접두사 일치 → 정규식(`~`) 순. 헷갈리면 엉뚱한 블록이 처리한다.
- **리버스 프록시 vs 정방향 프록시** : 서버 앞단에서 외부 요청을 받아 내부로 분배 / 클라이언트를 대신해 외부로 나가는 중계.
- **`upstream`** : 부하를 나눠 보낼 백엔드 서버 묶음을 정의하는 블록.
- **`proxy_set_header`** : 백엔드로 넘길 때 원래 Host나 실제 클라이언트 IP 같은 정보를 헤더에 실어 주는 지시어.
- **`ip_hash`** : 클라이언트 IP를 해시해 항상 같은 백엔드로 보내는 세션 고정 방식.
- **`sendfile` / `gzip`** : 커널이 파일을 직접 전송해 복사를 줄이는 최적화 / 응답을 압축해 대역폭을 줄이는 옵션.
- **무중단 reload** : 새 설정으로 새 워커를 띄우고 기존 워커는 처리 중인 요청을 마친 뒤 종료하는 방식.
- **파일 디스크립터 한계** : 프로세스가 열 수 있는 파일·소켓 수 상한. `worker_rlimit_nofile`·`ulimit -n`으로 올린다.

## 📝 연습 문제

**문제 1.** Nginx 설정에서 가상 호스트의 문서 루트(Apache의 DocumentRoot에 해당)를 지정하는 지시어는?

A) `listen`
B) `root`
C) `server_name`
D) `location`

**정답: B**
해설: Nginx의 `root`가 문서 루트를 지정하며 Apache의 DocumentRoot에 대응한다. `listen`은 포트(Listen), `server_name`은 도메인(ServerName), `location`은 URL 경로별 처리 규칙이다.

---

**문제 2.** Nginx에서 요청을 뒤편 백엔드 서버로 전달하는(리버스 프록시) 지시어는?

A) `try_files`
B) `proxy_pass`
C) `sendfile`
D) `gzip`

**정답: B**
해설: `proxy_pass http://backend;`가 매칭된 요청을 지정한 백엔드(또는 upstream 그룹)로 전달한다. `try_files`는 파일 탐색, `sendfile`은 파일 전송 최적화, `gzip`은 응답 압축이다.

---

**문제 3.** Nginx 설정 블록의 중첩 범위를 바깥에서 안으로 올바르게 나열한 것은?

A) location → server → http
B) server → http → location
C) http → server → location
D) http → location → server

**정답: C**
해설: 범위는 http(HTTP 전역) → server(가상 호스트 1개) → location(URL 경로)으로 좁혀진다. 안쪽 블록은 바깥 설정을 상속하고 필요한 부분만 덮어쓴다.

---

**문제 4.** Apache와 비교한 Nginx의 처리 모델 특징으로 옳은 것은?

A) 연결마다 별도 프로세스를 생성한다
B) 소수의 워커가 이벤트 기반 비동기로 다수 연결을 처리한다
C) 디렉터리별 .htaccess 분산 설정을 기본 지원한다
D) 동적 언어를 모두 내장 모듈로만 처리한다

**정답: B**
해설: Nginx는 소수 워커가 이벤트 루프로 수많은 연결을 비동기 처리해 동시 접속 효율이 높다. 연결당 프로세스 생성은 Apache(prefork) 방식이고, Nginx는 .htaccess를 지원하지 않으며 동적 처리는 외부로 프록시한다.

---

**문제 5.** Nginx에서 설정을 변경한 뒤 연결을 끊지 않고 새 설정을 적용하는 명령은?

A) `nginx -t`
B) `nginx -s stop`
C) `nginx -s reload`
D) `systemctl kill nginx`

**정답: C**
해설: `nginx -s reload`(또는 `systemctl reload nginx`)는 마스터가 새 워커를 띄우고 기존 워커는 처리 중인 요청을 마친 뒤 종료해 무중단 재적용을 한다. `-t`는 문법 검사, `-s stop`은 중지다.

---

**문제 6.** Nginx upstream 블록에서 같은 클라이언트를 항상 같은 백엔드 서버로 보내(세션을 유지) 분배하는 방식은?

A) 라운드 로빈
B) `least_conn`
C) `ip_hash`
D) `proxy_pass`

**정답: C**
해설: `ip_hash`는 클라이언트 IP를 해시해 항상 같은 백엔드로 보내므로 세션 고정에 쓰인다. 라운드 로빈은 순서 분배, `least_conn`은 연결 최소 서버 선택, `proxy_pass`는 전달 지시어다.

---

**문제 7.** Nginx에서 응답을 압축해 전송 대역폭을 줄이는 지시어는?

A) `sendfile on`
B) `gzip on`
C) `keepalive_timeout`
D) `worker_connections`

**정답: B**
해설: `gzip on`은 텍스트 응답을 압축해 전송량을 줄인다. `sendfile on`은 커널 수준 파일 전송 최적화, `keepalive_timeout`은 연결 재사용 시간, `worker_connections`는 워커당 동시 연결 한계다.

---
