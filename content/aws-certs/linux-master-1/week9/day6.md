# Day 6 - 데이터베이스 서비스: MySQL/MariaDB 설치부터 백업·복구까지

## 📌 핵심 정리

- **"사용자"는 이름 하나가 아니라 `사용자명@호스트` 한 쌍**이다. `'web'@'localhost'`와 `'web'@'%'`는 이름이 같아도 **다른 계정**이고 권한도 따로 논다.
- 접속 성패는 그 한 쌍과, **`bind-address` + 방화벽 3306번 포트**에서 갈린다.
- **패키지는 `mariadb-server`, 서비스명은 `mariadb`.** `start`만 하고 `enable`을 빠뜨리면 재부팅 후 안 올라온다.
- **`-p`는 password, `-P`는 Port.** 백업은 `mysqldump ... > 파일`, 복구는 `mysql ... < 파일` — **화살표 방향**이 핵심이다.
- **DB 이름만 준 단일 덤프에는 `CREATE DATABASE`가 없다.** 복구 전에 DB를 먼저 만들어야 한다(`--databases`·`--all-databases`는 포함).

## MySQL과 MariaDB — 왜 이름이 둘인가

| 구분 | MySQL | MariaDB |
|------|-------|---------|
| 개발 주체 | Oracle | MariaDB 재단(커뮤니티) |
| 패키지명 | `mysql-server` | `mariadb-server` |
| 기본 포트 / 엔진 | 3306 / InnoDB | 3306 / InnoDB |

> 📚 **유래·사례**: MySQL은 스웨덴 MySQL AB의 제품이었으나 썬(Sun)을 거쳐 2010년 오라클로 넘어갔다. 상용 DB 회사가 대표 오픈소스 DB를 인수하자 원 개발자 몬티 비데니우스가 이를 포크해 만든 것이 **MariaDB**다(딸 이름에서 따왔다). 그래서 RHEL 계열의 기본 배포 DB가 MariaDB로 교체됐다. 클라이언트 명령(`mysql`, `mysqldump`, `mysqladmin`)과 기본 SQL이 호환되므로 아래 내용은 양쪽에 함께 적용된다.

## 설치와 데몬 기동

- 배포판 계열에 따라 **패키지명과 서비스명이 갈리고**, 이 차이가 단답으로 나온다.

```bash
yum install mariadb-server mariadb   # RHEL/CentOS/Rocky (서버 + 클라이언트)
apt install mariadb-server           # 데비안/우분투 (또는 mysql-server)

systemctl start mariadb        # 시작
systemctl enable mariadb       # 부팅 시 자동 시작 등록
systemctl status mariadb       # 상태 확인
systemctl restart mariadb      # 설정 변경 후 재시작
```

| 항목 | RHEL 계열 | 데비안 계열 |
|------|-----------|-------------|
| 서비스(유닛)명 | `mariadb` (MySQL 설치 시 `mysqld`) | `mariadb` 또는 `mysql` |
| 메인 설정 파일 | `/etc/my.cnf` | `/etc/mysql/my.cnf` |
| 데이터 디렉터리 | `/var/lib/mysql` | `/var/lib/mysql` |

> ⚠️ **함정**: **패키지명은 `mariadb-server`인데 서비스명은 `mariadb`**다. `systemctl start mariadb-server`처럼 패키지명을 그대로 서비스명에 쓰는 보기가 오답으로 나온다. MySQL 커뮤니티 패키지를 깔면 서비스명이 `mysqld`가 되는 점, `start`만 하고 `enable`을 빠뜨리면 **재부팅 후 DB가 올라오지 않는다**는 점도 단골이다.

## mysql_secure_installation — 설치 직후의 필수 보안 절차

- 막 설치한 DB는 **비밀번호 없는 root, 익명 사용자, 테스트 DB**가 그대로 열려 있다.
- 이를 한 번에 정리하는 대화형 스크립트가 **`mysql_secure_installation`**이다.

| 단계 | 처리 내용 |
|------|-----------|
| root 비밀번호 | DB 관리자(root) 계정의 비밀번호 설정·변경 |
| 익명 사용자 | 이름 없이 접속 가능한 anonymous user 제거 |
| 원격 root 로그인 | `'root'@'%'` 형태의 원격 root 접속 차단 |
| test 데이터베이스 | 누구나 접근 가능한 기본 `test` DB 삭제 |
| 권한 테이블 재적재 | 변경 사항 즉시 반영(reload privilege tables) |

> 💡 **개념**: 여기서 말하는 **DB의 root는 리눅스 시스템의 root와 완전히 별개의 계정**이다. 이름만 같을 뿐 인증 정보도 권한 체계도 DB 안에 따로 존재하며, 리눅스 root 암호를 바꿔도 DB root 암호는 그대로다. "DB 관리자 계정의 비밀번호를 설정하는 명령"은 `mysql_secure_installation` 또는 `mysqladmin -u root password '새암호'`다.

```bash
mysqladmin -u root password 'NewP@ssw0rd'   # 비대화형으로 root 암호 지정
mysqladmin -u root -p ping                  # 데몬 생존 확인
```

## 접속과 기본 SQL

```bash
mysql -u root -p                          # 로컬 접속(비밀번호는 프롬프트 입력)
mysql -u web -p webdb                     # 접속과 동시에 webdb 선택
mysql -h 192.168.1.50 -P 3306 -u web -p   # 원격 서버 접속
mysql -u root -p -e "SHOW DATABASES;"     # SQL 한 줄 실행 후 종료
```

| 옵션 | 의미 |
|------|------|
| `-u` | 사용자명 |
| `-p` | 비밀번호 입력 프롬프트 (소문자) |
| `-h` | 접속할 호스트(서버 IP·이름) |
| `-P` | 포트 번호 (대문자, 기본 3306) |
| `-e` | 셸에서 SQL 한 줄 실행 후 종료 |

> ⚠️ **함정**: **`-p`(소문자)는 비밀번호, `-P`(대문자)는 포트**다. 대소문자를 바꿔 쓰는 보기가 자주 나온다. `-p` 뒤에 비밀번호를 붙일 때는 **공백 없이** `-pMyPass`로 써야 한다(띄우면 MyPass가 DB 이름으로 해석된다). 명령줄의 비밀번호는 `ps`와 셸 히스토리에 남으므로 실무에서는 `-p`만 쓰고 프롬프트에 입력한다.

- 접속 후 쓰는 기본 SQL은 아래와 같다. SQL 문은 **세미콜론(`;`)으로 끝내야** 실행된다.

```sql
-- 조회
SHOW DATABASES;                 -- 데이터베이스 목록
USE webdb;                      -- 사용할 데이터베이스 선택
SHOW TABLES;                    -- 현재 DB의 테이블 목록
DESC members;                   -- 테이블 구조 확인 (DESCRIBE 와 동일)

-- 생성
CREATE DATABASE webdb DEFAULT CHARACTER SET utf8mb4;
CREATE TABLE members (
    id     INT AUTO_INCREMENT PRIMARY KEY,
    name   VARCHAR(30) NOT NULL,
    email  VARCHAR(60),
    joined DATE
);

-- 조작
INSERT INTO members (name, email, joined) VALUES ('홍길동', 'hong@ex.com', '2026-08-01');
SELECT * FROM members WHERE name = '홍길동';
UPDATE members SET email = 'new@ex.com' WHERE id = 1;
DELETE FROM members WHERE id = 1;

-- 삭제 / 종료
DROP TABLE members;   DROP DATABASE webdb;
EXIT;                           -- QUIT; \q 도 동일
```

| 분류 | 이름 | 대표 명령 |
|------|------|-----------|
| DDL | 데이터 정의어 | `CREATE`, `ALTER`, `DROP`, `TRUNCATE` |
| DML | 데이터 조작어 | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| DCL | 데이터 제어어 | `GRANT`, `REVOKE`, `COMMIT`, `ROLLBACK` |

> 🔍 **더 깊이**: `DELETE`는 DML이라 `WHERE`로 골라 지우고 트랜잭션으로 되돌릴 여지가 있지만, `TRUNCATE`는 DDL이라 테이블을 통째로 비우고 `AUTO_INCREMENT`도 초기화하며 일반적으로 롤백되지 않는다.

## 사용자와 권한 — `'user'@'host'`라는 한 쌍

```sql
-- 계정 생성
CREATE USER 'web'@'localhost' IDENTIFIED BY 'WebP@ss1';    -- 로컬 전용
CREATE USER 'web'@'%' IDENTIFIED BY 'WebP@ss1';            -- 모든 호스트
CREATE USER 'web'@'192.168.1.%' IDENTIFIED BY 'WebP@ss1';  -- 특정 대역만
```

| 호스트 표기 | 허용 범위 |
|-------------|-----------|
| `'user'@'localhost'` | 서버 자기 자신에서의 접속만 |
| `'user'@'%'` | 모든 호스트(원격 포함) |
| `'user'@'192.168.1.%'` | 192.168.1.0/24 대역에서만 |
| `'user'@'192.168.1.50'` | 그 IP 하나에서만 |

- 권한은 **`GRANT`로 주고 `REVOKE`로 회수**한다.

```sql
GRANT ALL PRIVILEGES ON webdb.* TO 'web'@'localhost';            -- 전체 권한
GRANT SELECT, INSERT, UPDATE ON webdb.* TO 'app'@'192.168.1.%';  -- 제한 부여
REVOKE INSERT, UPDATE ON webdb.* FROM 'app'@'192.168.1.%';       -- 회수

SHOW GRANTS FOR 'web'@'localhost';          -- 권한 확인
SELECT user, host FROM mysql.user;          -- 계정 목록
ALTER USER 'web'@'localhost' IDENTIFIED BY 'NewP@ss2';   -- 비밀번호 변경
DROP USER 'web'@'localhost';                -- 계정 삭제
FLUSH PRIVILEGES;                           -- 권한 테이블 재적재
```

- `ON` 다음의 대상 표기는 세 가지다.
  - `*.*` : 모든 DB의 모든 테이블
  - `webdb.*` : webdb의 모든 테이블
  - `webdb.members` : 그 테이블 하나만
- 실무 원칙은 **필요한 DB에만 최소 권한**을 주는 것이다.

> ⚠️ **함정**: `FLUSH PRIVILEGES`는 **`mysql.user` 같은 권한 테이블을 `UPDATE`/`INSERT`로 직접 건드렸을 때** 메모리의 권한 정보를 다시 읽어들이는 명령이다. `GRANT`·`REVOKE`·`CREATE USER`로 정상 경로를 거쳤다면 서버가 자동 반영하므로 원칙적으로 필요 없다. 시험은 "권한 변경을 즉시 적용하는 명령"으로 이를 답하게 하는 경우가 많으니 명령 자체는 반드시 외워 두자.

> 💡 **개념**: `'web'@'localhost'`와 `'web'@'%'`는 이름이 같아도 **서로 다른 계정**이다. localhost 계정에만 권한을 주고 원격에서 붙으면 `Access denied`가 뜬다. 참고로 `-h localhost`는 유닉스 소켓(`/var/lib/mysql/mysql.sock`)으로, `-h 127.0.0.1`은 TCP 3306번으로 붙기 때문에 둘의 결과가 갈리기도 한다.

## 설정 파일 — my.cnf와 bind-address

- 서버 동작은 **`my.cnf`(옵션 파일)**로 제어한다. **위치가 계열마다 다르다**는 점이 시험 포인트다.

| 계열 | 메인 설정 파일 | 추가 설정 디렉터리 |
|------|----------------|--------------------|
| RHEL/CentOS | `/etc/my.cnf` | `/etc/my.cnf.d/` |
| 데비안/우분투 | `/etc/mysql/my.cnf` | `/etc/mysql/mariadb.conf.d/` 또는 `/etc/mysql/mysql.conf.d/` |

- 파일은 대괄호로 묶인 **섹션** 단위로 읽힌다.
- 서버 데몬 설정은 **`[mysqld]`**, `mysql` 클라이언트 설정은 **`[client]`** 섹션에 쓴다.

```ini
[mysqld]
port         = 3306                        # 서비스 포트 (기본 3306/TCP)
bind-address = 0.0.0.0                     # 수신 인터페이스
datadir      = /var/lib/mysql              # 데이터 파일 저장 경로
socket       = /var/lib/mysql/mysql.sock   # 로컬 접속용 소켓 파일
log_error    = /var/log/mariadb/mariadb.log
max_connections      = 200                 # 동시 접속 상한
character-set-server = utf8mb4             # 서버 기본 문자셋
```

| 항목 | 의미 |
|------|------|
| `port` | 서비스 포트. 기본 **3306/TCP** |
| `bind-address` | 접속을 받을 IP. `127.0.0.1`은 로컬 전용, `0.0.0.0`은 모든 인터페이스 |
| `datadir` | 실제 데이터베이스 파일이 놓이는 경로(`/var/lib/mysql`) |
| `socket` | 로컬 접속에 쓰는 유닉스 소켓 파일 경로 |
| `log_error` / `max_connections` | 에러 로그 경로 / 동시 접속 허용 수 |
| `skip-networking` | TCP 수신을 아예 끄고 소켓 접속만 허용 |

> ⚠️ **함정**: 데비안 계열은 기본값이 **`bind-address = 127.0.0.1`**로 잡혀 있어 원격 접속이 막힌다. 계정을 `'user'@'%'`로 만들고 방화벽까지 열었는데 안 된다면 십중팔구 여기다. 반대로 `0.0.0.0`으로 열고 방화벽을 안 잠그면 DB가 그대로 노출된다. 또 하나, **설정을 고쳤으면 `systemctl restart`를 해야 반영된다.**

```bash
# 실제 적용 중인 값은 서버에게 직접 물어본다
mysql -u root -p -e "SHOW VARIABLES LIKE 'bind_address';"
mysql -u root -p -e "SHOW VARIABLES LIKE 'datadir';"
```

## 백업과 복구 — mysqldump

- DB 백업의 표준 도구는 **`mysqldump`**다.
- 이름 그대로 데이터베이스 내용을 **SQL 문(CREATE TABLE, INSERT …)의 텍스트 파일로 뽑아내는(dump)** 도구다.

```bash
mysqldump -u root -p webdb > /backup/webdb.sql             # 단일 DB
mysqldump -u root -p webdb members > /backup/members.sql   # 특정 테이블만
mysqldump -u root -p --databases webdb blogdb > /backup/two.sql   # 여러 DB
mysqldump -u root -p --all-databases > /backup/all.sql     # 서버 전체
```

- 복구는 별도 명령이 아니다 — **덤프된 SQL 파일을 `mysql` 클라이언트에 입력 리다이렉션으로 흘려 넣는 것**이다.

```bash
mysql -u root -p -e "CREATE DATABASE webdb;"     # 대상 DB를 먼저 만들고
mysql -u root -p webdb < /backup/webdb.sql       # 덤프를 흘려 넣어 복구

mysql -u root -p < /backup/all.sql               # --all-databases 덤프는 DB명 없이
```

> ⚠️ **함정**: **백업은 `>`(출력 리다이렉션), 복구는 `<`(입력 리다이렉션)**이며 방향을 바꿔 쓰면 백업 파일이 비워진다. 더 결정적인 것 하나 — **DB 이름만 준 단일 덤프에는 `CREATE DATABASE` 문이 들어 있지 않다.** 복구 전에 대상 DB를 먼저 만들어야 하고, 만들지 않으면 `Unknown database` 오류가 난다. `--databases`나 `--all-databases`로 뜬 덤프에는 DB 생성 문이 포함되므로 DB명 없이 그대로 넣는다.

> 🔍 **더 깊이**: `mysqldump`는 결과물이 SQL 텍스트인 **논리 백업**이라 다른 서버로 옮기기 쉽다. 서비스를 세우지 않고 일관된 백업을 뜨려면 InnoDB 테이블에 `--single-transaction`을 쓴다. 반면 `/var/lib/mysql`을 `tar`로 묶는 물리 백업은 **반드시 데몬을 정지한 뒤** 해야 한다 — 동작 중 복사하면 깨진 파일이 나온다.

## 로그와 문제 해결

- DB가 안 뜨거나 접속이 안 될 때는 **에러 로그부터** 본다.
- 경로는 배포판·패키지마다 다르므로 **설정값을 직접 확인**하는 편이 확실하다.

```bash
mysql -u root -p -e "SHOW VARIABLES LIKE 'log_error';"   # 경로를 직접 확인
tail -f /var/log/mariadb/mariadb.log     # RHEL 계열 MariaDB
tail -f /var/log/mysqld.log              # RHEL 계열 MySQL
tail -f /var/log/mysql/error.log         # 데비안 계열
journalctl -u mariadb -n 50              # 데몬이 아예 안 뜰 때
```

| 로그 종류 | 설정 항목 | 기록 내용 |
|-----------|-----------|-----------|
| 에러 로그 | `log_error` | 기동·정지 메시지, 치명적 오류 |
| 일반 질의 로그 | `general_log` | 모든 질의(부담이 커 상시 사용 비권장) |
| 슬로우 질의 로그 | `slow_query_log` | 지정 시간 초과 질의(튜닝용) |
| 바이너리 로그 | `log_bin` | 변경 이력(복제·시점 복구용) |

- 원격 접속 실패는 **원인이 정해져 있다.** 아래 순서로 좁히면 대부분 잡힌다.

| 증상·원인 | 확인 방법 | 조치 |
|-----------|-----------|------|
| 데몬 미동작 | `systemctl status mariadb` | `systemctl start mariadb` |
| 방화벽 차단 | `firewall-cmd --list-all` | 3306/TCP 허용 |
| `bind-address`가 127.0.0.1 | `SHOW VARIABLES LIKE 'bind_address';` | `0.0.0.0`으로 변경 후 재시작 |
| 계정 호스트가 localhost만 | `SELECT user,host FROM mysql.user;` | `'user'@'%'` 계정 생성 |
| 권한 부족 | `SHOW GRANTS FOR 'user'@'%';` | 필요한 `GRANT` 부여 |

```bash
ss -tlnp | grep 3306                                # 포트가 열려 대기 중인지
firewall-cmd --permanent --add-port=3306/tcp && firewall-cmd --reload
```

> 💡 **개념**: 접속 실패 메시지 두 가지를 구분하면 진단이 반으로 준다. **`Access denied for user ...`**는 서버까지 도달했으나 계정·비밀번호·권한에서 거절된 것(DB 안쪽 문제)이고, **`Can't connect to MySQL server ...`**는 연결 자체가 닿지 않은 것(데몬 미동작·방화벽·`bind-address` 등 바깥쪽 문제)이다.

## 암기 팁 — 헷갈리는 짝 정리

| 헷갈리는 지점 | 기억법 |
|---------------|--------|
| `-p` vs `-P` | 소문자 p는 **p**assword, 대문자 P는 **P**ort |
| 백업 `>` / 복구 `<` | 파일로 **나가면** 백업, 파일에서 **들어오면** 복구 |
| 패키지 vs 서비스 | 패키지 `mariadb-server`, 서비스 `mariadb`(server 없음) |
| my.cnf 위치 | RHEL은 `/etc/my.cnf`(짧다), 데비안은 `/etc/mysql/my.cnf`(한 칸 더) |
| `@'localhost'` vs `@'%'` | `%`는 와일드카드 — "아무 호스트나" |
| 포트 3306 | 3306 MySQL/MariaDB, 5432 PostgreSQL, 1521 Oracle |
| DDL/DML/DCL | 정의(Create) / 조작(Select·Insert) / 제어(Grant) |
| `FLUSH PRIVILEGES` | 권한 테이블을 손으로 고쳤을 때 "다시 읽어라" |

## 직접 쳐보기 — 설치부터 백업까지 한 바퀴

```bash
# 1. 설치·기동·초기 보안
yum install -y mariadb-server mariadb
systemctl start mariadb && systemctl enable mariadb
mysql_secure_installation

# 2. DB와 계정 만들기
mysql -u root -p -e "CREATE DATABASE webdb DEFAULT CHARACTER SET utf8mb4;
  CREATE USER 'web'@'localhost' IDENTIFIED BY 'WebP@ss1';
  GRANT ALL PRIVILEGES ON webdb.* TO 'web'@'localhost';
  SHOW GRANTS FOR 'web'@'localhost';"

# 3. 새 계정으로 접속·테이블 생성 검증
mysql -u web -p webdb -e "CREATE TABLE members (id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL, joined DATE);
  INSERT INTO members VALUES (1,'홍길동','2026-08-01'); SELECT * FROM members;"

# 4. 백업 → 삭제 → 복구 훈련
mysqldump -u root -p webdb > /backup/webdb.sql
mysql -u root -p -e "DROP DATABASE webdb;"
mysql -u root -p -e "CREATE DATABASE webdb;"
mysql -u root -p webdb < /backup/webdb.sql
mysql -u root -p webdb -e "SELECT * FROM members;"
```

- 4번의 **"백업 → DROP → 복구"**를 한 번이라도 손으로 해 보면 단일 덤프에 `CREATE DATABASE`가 없다는 사실이 몸에 남는다.
- 이 감각이 실기 작업형에서 그대로 점수가 된다.

다음 시간에는 이번 주의 서비스들(DNS, DHCP·NTP, Apache, Nginx, DB)을 묶어 종합 복습으로 마무리한다.

## 📖 용어

- **MariaDB** : 오라클의 MySQL 인수 후 원 개발자가 포크한 갈래. 명령·SQL이 호환되며 RHEL 계열의 기본 DB다.
- **DB의 root** : 리눅스 시스템의 root와 **완전히 별개인** 데이터베이스 전용 관리자 계정.
- **`mysql_secure_installation`** : 설치 직후 root 암호·익명 계정·원격 root·test DB를 한 번에 정리하는 대화형 스크립트.
- **`-p` vs `-P`** : 소문자는 password(프롬프트), 대문자는 Port. `-p` 뒤에 암호를 붙일 때는 공백 없이 쓴다.
- **DDL / DML / DCL** : 정의어(CREATE·ALTER·DROP) / 조작어(SELECT·INSERT·UPDATE·DELETE) / 제어어(GRANT·REVOKE·COMMIT).
- **`DELETE` vs `TRUNCATE`** : WHERE로 골라 지우고 되돌릴 여지가 있는 DML / 테이블을 통째로 비우고 AUTO_INCREMENT까지 초기화하는 DDL.
- **`'user'@'host'`** : 계정의 식별 단위. 이름이 같아도 호스트가 다르면 다른 계정이다.
- **`%`(와일드카드)** : 호스트 자리의 "아무 데서나". `'web'@'192.168.1.%'`처럼 대역 지정도 된다.
- **`GRANT` 대상 표기** : `*.*`(전체) · `webdb.*`(그 DB 전부) · `webdb.members`(테이블 하나).
- **`FLUSH PRIVILEGES`** : 권한 테이블을 직접 손댔을 때 메모리의 권한 정보를 다시 읽게 하는 명령.
- **`bind-address`** : 접속을 받을 인터페이스. `127.0.0.1`이면 로컬 전용, `0.0.0.0`이면 모든 인터페이스.
- **`datadir`** : 실제 데이터베이스 파일이 쌓이는 경로. 보통 `/var/lib/mysql`.
- **논리 백업 vs 물리 백업** : SQL 텍스트로 뽑아 옮기기 쉬운 `mysqldump` / 데이터 디렉터리를 통째로 묶는 방식(데몬 정지 필수).
- **`--single-transaction`** : InnoDB에서 서비스를 세우지 않고 일관된 백업을 뜨기 위한 옵션.
- **`Access denied` vs `Can't connect`** : 서버까지 닿았으나 계정·권한에서 거절 / 연결 자체가 닿지 않음(데몬·방화벽·bind-address).

## 📝 연습 문제

**문제 1.** RHEL/CentOS 계열에서 MariaDB 서버를 설치한 뒤 부팅 시 자동으로 시작되도록 등록하는 명령으로 옳은 것은?

A) `systemctl start mariadb-server`
B) `systemctl enable mariadb`
C) `service mariadb autostart`
D) `chkconfig mysqld on --now`

**정답: B**
해설: 패키지명은 `mariadb-server`이지만 systemd 서비스(유닛)명은 `mariadb`다. `start`는 지금 시작만 하고, 부팅 시 자동 시작 등록은 `enable`이 담당한다.

---

**문제 2.** MySQL/MariaDB 설치 직후 실행해 root 비밀번호 설정, 익명 사용자 제거, 원격 root 로그인 차단, test 데이터베이스 삭제를 한 번에 처리하는 명령은?

A) `mysql_install_db`
B) `mysql_secure_installation`
C) `mysqladmin flush-hosts`
D) `mysqlcheck --auto-repair`

**정답: B**
해설: `mysql_secure_installation`은 대화형으로 초기 보안 항목(root 암호, 익명 계정 제거, 원격 root 차단, test DB 삭제, 권한 재적재)을 정리한다. 이 root는 리눅스 root와 무관한 DB 전용 관리자다.

---

**문제 3.** `webdb` 데이터베이스를 `/backup/webdb.sql` 파일로 백업하는 명령으로 옳은 것은?

A) `mysql -u root -p webdb > /backup/webdb.sql`
B) `mysqldump -u root -p webdb < /backup/webdb.sql`
C) `mysqldump -u root -p webdb > /backup/webdb.sql`
D) `mysqlbackup -u root -p webdb -o /backup/webdb.sql`

**정답: C**
해설: 백업은 `mysqldump`가 SQL 텍스트를 표준 출력으로 뽑고 `>`로 파일에 저장한다. 복구는 반대로 `mysql -u root -p webdb < /backup/webdb.sql`처럼 `<`로 흘려 넣는다. 화살표 방향이 바뀐 B는 오답이다.

---

**문제 4.** `mysqldump -u root -p webdb > dump.sql`로 뜬 덤프 파일을 복구할 때 주의할 점으로 옳은 것은?

A) 덤프에 `CREATE DATABASE` 문이 포함되어 있으므로 DB명을 적으면 안 된다
B) 대상 데이터베이스를 미리 생성한 뒤 `mysql -u root -p webdb < dump.sql`로 복구해야 한다
C) 복구 전에 반드시 `FLUSH PRIVILEGES`를 실행해야 한다
D) 덤프 파일은 바이너리라서 `mysqlimport`로만 복구된다

**정답: B**
해설: DB 이름만 지정한 단일 덤프에는 `CREATE DATABASE` 문이 없다. 복구 대상 DB를 먼저 만들고 DB명을 지정해 넣어야 하며, 그러지 않으면 `Unknown database` 오류가 난다. `--databases`나 `--all-databases` 덤프에는 DB 생성 문이 포함된다.

---

**문제 5.** `'web'@'localhost'`와 `'web'@'%'` 계정의 차이로 옳은 것은?

A) 둘은 같은 계정이며 표기만 다르다
B) `%`는 비밀번호가 없는 계정을 의미한다
C) `localhost`는 서버 자신에서의 접속만, `%`는 모든 호스트에서의 접속을 허용하는 별개의 계정이다
D) `localhost`는 읽기 전용, `%`는 읽기·쓰기 계정이다

**정답: C**
해설: 계정은 `사용자명@호스트` 쌍으로 식별되므로 이름이 같아도 호스트가 다르면 다른 계정이고 권한도 따로 줘야 한다. `%`는 모든 호스트를 뜻하는 와일드카드이며, 원격 접속을 허용하려면 `'user'@'%'` 형태의 계정이 필요하다.

---

**문제 6.** MySQL/MariaDB의 기본 서비스 포트와, 접속을 받을 인터페이스를 지정하는 설정 항목이 바르게 짝지어진 것은?

A) 3306 / `bind-address`
B) 5432 / `listen_addresses`
C) 3306 / `datadir`
D) 1521 / `bind-address`

**정답: A**
해설: 기본 포트는 3306/TCP이며 `my.cnf`의 `[mysqld]` 섹션에 있는 `bind-address`가 수신 인터페이스를 정한다. `127.0.0.1`이면 로컬 전용, `0.0.0.0`이면 모든 인터페이스다. 5432는 PostgreSQL, 1521은 Oracle이며 `datadir`은 데이터 파일 경로다.

---

**문제 7.** 원격 클라이언트에서 DB 서버로 접속을 시도하니 `Can't connect to MySQL server`로 연결 자체가 실패한다. 우선 점검할 항목으로 가장 거리가 먼 것은?

A) 데몬이 동작 중인지(`systemctl status mariadb`)
B) 방화벽에서 3306/TCP가 열려 있는지
C) `bind-address`가 `127.0.0.1`로 묶여 있지 않은지
D) 해당 계정에 `SELECT` 권한이 부여되어 있는지

**정답: D**
해설: `Can't connect to ...`는 연결 자체가 닿지 않은 상태로, 데몬 미동작·방화벽 차단·`bind-address` 제한 같은 네트워크 계층 원인을 먼저 본다. 권한이나 비밀번호 문제는 서버까지 도달한 뒤 거절될 때 나타나는 `Access denied for user ...`로 구분된다.

---
