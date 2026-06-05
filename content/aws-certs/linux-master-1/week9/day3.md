# Day 3 - Apache 웹 서버: httpd.conf와 가상 호스트의 모든 것

웹 브라우저에 주소를 치면 어딘가의 서버가 그 요청을 받아 HTML을 돌려준다. 그 "어딘가의 서버" 소프트웨어 중 가장 오래되고 널리 쓰인 것이 **Apache HTTP Server**다. 한 대의 물리 서버에서 수십 개의 웹사이트를 동시에 서비스하고, 디렉터리별로 접근 권한을 다르게 주며, 모듈을 끼워 기능을 확장하는 이 유연함이 Apache를 25년 넘게 표준으로 만들었다. 오늘은 Apache의 설치와 디렉터리 구조, `httpd.conf`의 핵심 지시어, 그리고 한 서버에서 여러 사이트를 돌리는 **가상 호스트(Virtual Host)**의 이름 기반·IP 기반 방식을 정밀하게 익힌다.

핵심 통찰: **웹 서버 설정은 "어떤 요청을, 어느 파일로, 누구에게 보여 줄 것인가"를 지시어로 선언하는 일이다.** `DocumentRoot`가 파일의 위치를, `Directory` 블록이 접근 권한을, `VirtualHost`가 사이트별 분기를 정한다. 이 세 축만 잡으면 httpd.conf 전체가 읽힌다.

## Apache 설치와 디렉터리 구조

RHEL/CentOS 계열에서 Apache의 패키지·데몬 이름은 모두 **httpd**다(데비안 계열은 `apache2`).

```bash
# 설치
yum install httpd

# 데몬 제어
systemctl start httpd
systemctl enable httpd          # 부팅 시 자동 시작
systemctl status httpd

# 설정 문법 검사 (재시작 전 필수!)
httpd -t                        # Syntax OK 확인
apachectl configtest            # 동일

# 적용된 가상 호스트 목록 확인
httpd -S
```

| 경로 | 역할 |
|------|------|
| `/etc/httpd/conf/httpd.conf` | 메인 설정 파일 |
| `/etc/httpd/conf.d/` | 추가 설정(가상 호스트 등)을 분리해 두는 디렉터리 |
| `/etc/httpd/conf.modules.d/` | 모듈 로드 설정 |
| `/var/www/html/` | 기본 DocumentRoot(웹 문서 루트) |
| `/var/log/httpd/` | access_log, error_log |

> 💡 **개념**: `httpd.conf` 안의 `Include conf.d/*.conf` 덕분에 가상 호스트나 추가 설정을 메인 파일에 욱여넣지 않고 `conf.d/`에 파일로 분리할 수 있다. 메인 설정은 깔끔히 두고 사이트별 설정은 별도 파일로 — 이것이 운영에서 권장되는 구조다. 설정을 고쳤다면 반드시 `httpd -t`로 문법을 검사한 뒤 재시작해야, 오타 한 줄로 서버 전체가 죽는 사고를 막는다.

## httpd.conf 핵심 지시어

Apache 설정의 단위는 **지시어(Directive)**다. 실기에서 각 지시어의 역할을 단답으로 묻는다.

```apache
ServerRoot "/etc/httpd"          # Apache 설치 기준 디렉터리
Listen 80                        # 수신 포트 (443은 HTTPS)
ServerName www.example.com:80    # 서버의 정식 이름·포트
DocumentRoot "/var/www/html"     # 웹 문서가 놓이는 최상위 디렉터리
DirectoryIndex index.html index.php   # 디렉터리 요청 시 보여 줄 기본 파일
ServerAdmin admin@example.com    # 오류 페이지에 표시될 관리자 메일

User apache                      # 데몬이 동작할 사용자
Group apache                     # 데몬이 동작할 그룹

ErrorLog "logs/error_log"        # 오류 로그 경로
CustomLog "logs/access_log" combined   # 접근 로그 경로·형식
LogLevel warn                    # 로그 기록 수준
```

| 지시어 | 역할 |
|--------|------|
| `Listen` | Apache가 대기할 포트(기본 80, HTTPS 443) |
| `ServerName` | 서버의 정식 호스트명. 가상 호스트 매칭에 사용 |
| `DocumentRoot` | URL 루트(`/`)에 대응하는 실제 파일 경로 |
| `DirectoryIndex` | 디렉터리만 요청했을 때 보여 줄 기본 문서 |
| `ServerRoot` | 설정·로그·모듈의 기준 경로 |
| `User` / `Group` | 보안을 위해 root가 아닌 전용 계정으로 동작 |
| `LogLevel` | 로그 상세도(debug/info/warn/error 등) |

> 🔍 **더 깊이**: Apache는 root 권한으로 시작해 80번 포트(1024 미만은 root만 바인딩 가능)를 연 뒤, 실제 요청 처리는 권한이 낮은 `apache` 계정으로 내려가서(privilege drop) 처리한다. 그래서 `User apache`/`Group apache` 설정이 보안의 핵심이다 — 혹시 웹 애플리케이션이 뚫려도 root가 아닌 제한된 계정으로만 동작하므로 피해 범위가 줄어든다. `User root`로 두는 것은 심각한 보안 실수다.

## Directory 블록 — 디렉터리별 접근 제어

특정 디렉터리에 대한 권한·옵션은 `<Directory>` 블록으로 지정한다.

```apache
<Directory "/var/www/html">
    Options Indexes FollowSymLinks    # 디렉터리 기능 옵션
    AllowOverride None                # .htaccess 허용 범위
    Require all granted               # 접근 허용(2.4 문법)
</Directory>
```

| 지시어 | 역할 |
|--------|------|
| `Options Indexes` | index 파일 없을 때 파일 목록 자동 표시 |
| `Options FollowSymLinks` | 심볼릭 링크를 따라가도록 허용 |
| `AllowOverride` | 해당 디렉터리에서 `.htaccess` 파일로 설정 재정의 허용 범위 |
| `Require all granted` | 모든 접근 허용 (Apache 2.4) |
| `Require all denied` | 모든 접근 차단 |

> ⚠️ **함정**: Apache 2.2와 2.4는 접근 제어 문법이 다르다. **2.2는 `Order allow,deny` / `Allow from` / `Deny from`**을, **2.4는 `Require all granted` / `Require ip ...`**을 쓴다. 또한 `Options Indexes`를 켜 두면 index.html이 없는 디렉터리의 파일 목록이 그대로 노출되는 보안 문제가 생긴다 — 운영 서버에서는 보통 끈다. `AllowOverride None`이면 .htaccess가 아예 무시된다는 점도 함정으로 나온다.

## 가상 호스트 — 한 서버에서 여러 사이트

물리 서버 한 대로 `site-a.com`과 `site-b.com`을 동시에 서비스하려면 **가상 호스트**를 쓴다. 방식은 두 가지다.

| 방식 | 구분 기준 | IP 필요량 | 용도 |
|------|-----------|-----------|------|
| 이름 기반(Name-based) | 요청의 Host 헤더(도메인명) | IP 1개로 다수 사이트 | 가장 일반적 |
| IP 기반(IP-based) | 접속한 IP 주소 | 사이트마다 IP 1개 | HTTPS 일부·격리 필요 시 |

**이름 기반 가상 호스트** — 하나의 IP에서 도메인 이름으로 구분:

```apache
<VirtualHost *:80>
    ServerName www.site-a.com
    DocumentRoot "/var/www/site-a"
    ErrorLog "logs/site-a-error_log"
</VirtualHost>

<VirtualHost *:80>
    ServerName www.site-b.com
    DocumentRoot "/var/www/site-b"
    ErrorLog "logs/site-b-error_log"
</VirtualHost>
```

같은 `*:80`(모든 IP의 80번 포트)을 듣지만, Apache는 클라이언트가 보낸 HTTP **Host 헤더**의 도메인명을 보고 어느 `ServerName`과 일치하는지로 사이트를 가른다.

**IP 기반 가상 호스트** — 서버에 여러 IP를 두고 IP로 구분:

```apache
<VirtualHost 192.168.1.10:80>
    ServerName www.site-a.com
    DocumentRoot "/var/www/site-a"
</VirtualHost>

<VirtualHost 192.168.1.20:80>
    ServerName www.site-b.com
    DocumentRoot "/var/www/site-b"
</VirtualHost>
```

> 💡 **개념**: 이름 기반 가상 호스트가 가능한 이유는 HTTP/1.1부터 요청에 **Host 헤더**가 필수가 되어, 같은 IP로 들어와도 "어느 도메인을 원하는지"가 요청 안에 담기기 때문이다. 이 덕분에 IP 하나로 수백 개 사이트를 돌릴 수 있다. 만약 도메인과 무관하게 들어온 요청(매칭되는 ServerName 없음)은 **첫 번째로 정의된 VirtualHost**가 기본으로 처리한다.

> 📚 **유래·사례**: 초창기 웹(HTTP/1.0)에는 Host 헤더가 없어서, 서로 다른 사이트를 같은 서버에서 돌리려면 사이트마다 공인 IP를 따로 사 줘야 했다(IP 기반). IPv4 주소가 고갈되기 시작하면서 이는 큰 낭비였고, HTTP/1.1이 Host 헤더를 의무화하며 이름 기반 가상 호스트가 표준이 됐다. 오늘날 클라우드에서 도메인 하나당 IP를 사지 않고도 무수한 사이트를 운영할 수 있는 것이 이 변화의 결과다.

## 모듈 — Apache의 확장 구조

Apache는 핵심 기능 외의 것을 **모듈(module)**로 끼워 확장한다. SSL, 재작성(rewrite), PHP 연동 등이 모두 모듈이다.

```apache
LoadModule rewrite_module modules/mod_rewrite.so   # URL 재작성
LoadModule ssl_module modules/mod_ssl.so           # HTTPS
```

```bash
# 적재된 모듈 확인
httpd -M
```

| 모듈 | 역할 |
|------|------|
| `mod_ssl` | HTTPS(TLS) 지원 |
| `mod_rewrite` | URL 재작성·리다이렉트 |
| `mod_proxy` | 리버스 프록시·로드 밸런싱 |
| `mod_dir` | DirectoryIndex 처리 |

> 🔍 **더 깊이**: Apache의 동작 모델은 **MPM(Multi-Processing Module)**으로 결정된다. `prefork`는 요청마다 프로세스를 띄워 안정적이지만 메모리를 많이 쓰고(전통적 PHP 환경), `worker`/`event`는 스레드를 써서 동시 접속에 효율적이다. 한 서버에 동시 접속이 많아 메모리가 부족하다면 MPM 선택과 `MaxRequestWorkers` 같은 한계값 조정이 튜닝의 출발점이 된다.

## 로그 — access_log와 error_log

Apache는 두 가지 핵심 로그를 남긴다.

```bash
# 접근 로그: 누가 무엇을 요청했는가
tail -f /var/log/httpd/access_log
# 예: 192.168.1.5 - - [05/Jun/2026:10:00:00] "GET /index.html HTTP/1.1" 200 1024

# 오류 로그: 무엇이 잘못됐는가
tail -f /var/log/httpd/error_log
```

access_log의 `combined` 형식은 클라이언트 IP, 시각, 요청 줄, **응답 상태 코드(200, 404, 500 등)**, 전송 바이트, 리퍼러, 브라우저 정보를 담는다. 상태 코드만 봐도 정상(2xx)·리다이렉트(3xx)·클라이언트 오류(4xx)·서버 오류(5xx)를 가를 수 있다.

> ⚠️ **함정**: `CustomLog`(또는 access_log)는 모든 요청을 기록하고, `ErrorLog`는 오류·진단 메시지를 기록한다. 둘을 혼동해 "404가 access_log가 아닌 error_log에만 남는다"는 식의 보기는 틀린다 — 404 같은 응답 코드는 access_log에 상태 코드로 남고, 설정 오류·모듈 실패 등은 error_log에 남는다.

## 직접 쳐보기 — Apache 설정·검증

```bash
# 1. 기본 페이지 만들기
echo "<h1>Hello Apache</h1>" > /var/www/html/index.html

# 2. 설정 문법 검사 후 시작
httpd -t
systemctl restart httpd

# 3. 로컬에서 응답 확인
curl http://localhost/
curl -I http://localhost/         # 헤더만(상태 코드 확인)

# 4. 가상 호스트 매칭 점검
httpd -S                          # 정의된 VirtualHost 목록

# 5. 로그 실시간 관찰
tail -f /var/log/httpd/access_log
```

`curl -I`로 받은 첫 줄 `HTTP/1.1 200 OK`가 보이면 정상이다. 가상 호스트를 테스트할 때는 `curl -H "Host: www.site-a.com" http://localhost/`처럼 Host 헤더를 지정해 어느 사이트가 응답하는지 확인할 수 있다.

## 마무리

오늘은 Apache 웹 서버를 "요청을 파일로 매핑하는 기계"로 이해했다. **`DocumentRoot`가 URL 루트의 실제 위치를, `<Directory>`가 디렉터리별 접근 권한을, `<VirtualHost>`가 사이트별 분기를 정한다.** 가상 호스트는 이름 기반(Host 헤더로 구분, IP 하나로 다수 사이트)과 IP 기반(IP로 구분, 사이트마다 IP)으로 나뉘며, HTTP/1.1의 Host 헤더 의무화가 이름 기반을 표준으로 만들었다. 보안의 핵심은 `User apache`로 권한을 낮추고, `Options Indexes`를 운영에서 끄며, Apache 2.4의 `Require` 문법을 쓰는 것이다. 설정을 고쳤으면 반드시 `httpd -t`로 검사한 뒤 재시작한다. 내일은 또 다른 웹 서버의 강자 Nginx로 넘어가, 이벤트 기반 구조와 리버스 프록시, 그리고 Apache와의 비교를 다룬다.

## 📝 연습 문제

**문제 1.** Apache httpd.conf에서 웹 문서가 놓이는 최상위 디렉터리(URL 루트 `/`에 대응하는 실제 경로)를 지정하는 지시어는?

A) ServerRoot
B) DocumentRoot
C) DirectoryIndex
D) ServerName

**정답: B**
해설: `DocumentRoot`가 URL의 루트에 대응하는 실제 파일 시스템 경로(`/var/www/html`)를 지정한다. `ServerRoot`는 Apache 설치 기준 디렉터리, `DirectoryIndex`는 기본 문서, `ServerName`은 서버 호스트명이다.

---

**문제 2.** 하나의 IP 주소에서 여러 도메인을 서비스할 때, Apache가 어느 사이트로 보낼지 판단하는 기준은?

A) 클라이언트의 MAC 주소
B) HTTP 요청의 Host 헤더(도메인명)
C) 접속한 포트 번호만
D) DNS의 SOA 레코드

**정답: B**
해설: 이름 기반 가상 호스트는 클라이언트가 보낸 HTTP Host 헤더의 도메인명을 각 VirtualHost의 ServerName과 비교해 사이트를 가른다. HTTP/1.1에서 Host 헤더가 필수가 되어 가능해진 방식이다.

---

**문제 3.** Apache 설정을 수정한 뒤 재시작 전에 문법 오류를 검사하는 명령은?

A) `httpd -S`
B) `httpd -M`
C) `httpd -t`
D) `httpd -v`

**정답: C**
해설: `httpd -t`(또는 `apachectl configtest`)는 설정 파일의 문법을 검사해 `Syntax OK`를 출력한다. `-S`는 가상 호스트 목록, `-M`은 적재된 모듈 목록, `-v`는 버전 정보다.

---

**문제 4.** `<Directory>` 블록에서 `Options Indexes`를 켜 두었을 때 발생하는 동작은?

A) 심볼릭 링크를 따라간다
B) index 파일이 없으면 디렉터리의 파일 목록을 자동 표시한다
C) .htaccess 파일을 허용한다
D) 모든 접근을 차단한다

**정답: B**
해설: `Options Indexes`는 DirectoryIndex 파일(index.html 등)이 없을 때 디렉터리의 파일 목록을 자동으로 노출한다. 보안상 운영 서버에서는 보통 끈다. 심볼릭 링크는 `FollowSymLinks`, .htaccess는 `AllowOverride`가 담당한다.

---

**문제 5.** IP 기반 가상 호스트와 이름 기반 가상 호스트의 차이로 옳은 것은?

A) 이름 기반은 사이트마다 별도의 IP가 필요하다
B) IP 기반은 Host 헤더로 사이트를 구분한다
C) 이름 기반은 하나의 IP로 여러 사이트를 서비스할 수 있다
D) 두 방식 모두 HTTP/1.0에서만 동작한다

**정답: C**
해설: 이름 기반은 IP 하나에서 Host 헤더로 다수 사이트를 구분하므로 IP를 절약한다. IP 기반은 사이트마다 IP가 필요하다. 이름 기반은 HTTP/1.1의 Host 헤더가 있어야 동작한다.

---

**문제 6.** Apache가 root로 시작해 포트를 연 뒤, 실제 요청 처리는 권한이 낮은 계정으로 내려가 동작하도록 지정하는 지시어는?

A) `ServerAdmin`
B) `User` / `Group`
C) `Listen`
D) `LogLevel`

**정답: B**
해설: `User apache` / `Group apache`로 데몬이 동작할 비특권 계정을 지정한다. 80번 포트를 여는 동안만 root 권한이 필요하고, 이후 요청 처리는 낮은 권한으로 내려가 보안 피해 범위를 줄인다. `ServerAdmin`은 관리자 메일, `Listen`은 포트, `LogLevel`은 로그 상세도다.

---

**문제 7.** Apache 2.4에서 특정 디렉터리에 대한 모든 접근을 허용하는 지시어는?

A) `Order allow,deny`
B) `Allow from all`
C) `Require all granted`
D) `Deny from none`

**정답: C**
해설: Apache 2.4는 `Require all granted`(허용) / `Require all denied`(차단) 문법을 쓴다. `Order allow,deny`와 `Allow from`은 구버전(2.2) 문법으로, 2.4에서는 호환 모듈 없이는 동작하지 않는다.

---
