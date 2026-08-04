# Day 1 - 명령어 옵션 빈출 정리: 실기 단답으로 굳히는 핵심 명령

## 📌 핵심 정리

- 1급 2차 실기는 **빈칸에 명령어·옵션·경로를 직접 적는 단답형**이다. 이해만으로는 부족하고 정밀 암기가 필요하다.
- 권한 8진수는 `r=4, w=2, x=1`의 합. `755=rwxr-xr-x`, `644=rw-r--r--`를 양방향으로 즉답할 수 있어야 한다. 재귀는 **대문자 `-R`**.
- `find`는 **파일을 조건으로**, `grep`은 **내용에서 패턴을** 찾는다. find는 기본 재귀라 `-r`이 필요 없고, grep만 `-r`이 필요하다.
- `-mtime +7`은 7일보다 **오래된**, `-7`은 7일 **이내**. `-exec 명령 {} \;`의 `{} \;` 짝은 통째로 외운다.
- 시그널: `-15`(TERM, 기본) 정상 종료, `-9`(KILL) 강제 종료, `-1`(HUP) 설정 재읽기. **9와 19만 무시 불가**.
- 링크: `ln`은 하드(같은 inode, 파티션·디렉터리 불가), `ln -s`는 심볼릭(별도 inode, 원본 삭제 시 깨짐).

## 권한 명령어: chmod / chown / chgrp

- 권한은 실기 단골 중의 단골이다.
- `chmod`는 권한을, `chown`은 소유자를, `chgrp`는 그룹을 바꾼다.

```bash
# 8진수(절대 모드) 방식
chmod 755 script.sh      # rwxr-xr-x
chmod 644 file.txt       # rw-r--r--
chmod 700 secret/        # rwx------
chmod 600 id_rsa         # rw------- (SSH 개인키 권한)

# 기호(상대 모드) 방식
chmod u+x script.sh      # 소유자에게 실행 권한 추가
chmod g-w file.txt       # 그룹의 쓰기 권한 제거
chmod o=r file.txt       # 기타 사용자를 읽기 전용으로 설정
chmod a+x script.sh      # 모두(all)에게 실행 권한 추가
chmod ug+rw file.txt     # 소유자·그룹에 읽기·쓰기 추가
```

- 8진수는 `r=4, w=2, x=1`을 더해서 만든다.
- `rwx = 4+2+1 = 7`, `rw- = 4+2 = 6`, `r-x = 4+1 = 5`, `r-- = 4`.
- 세 자리는 순서대로 **소유자(u) / 그룹(g) / 기타(o)**를 뜻한다.

> 💡 **개념**: `chmod 755`를 보면 즉시 `rwxr-xr-x`가 떠올라야 한다. 7=rwx(소유자), 5=r-x(그룹), 5=r-x(기타). 거꾸로 `rw-r--r--`를 보면 644라고 답할 수 있어야 한다.

| 8진수 | 권한 문자 | 흔한 용도 |
|-------|-----------|-----------|
| 777 | rwxrwxrwx | (위험) 모두 모든 권한 |
| 755 | rwxr-xr-x | 실행 파일·디렉터리 |
| 700 | rwx------ | 개인 전용 디렉터리 |
| 644 | rw-r--r-- | 일반 문서 파일 |
| 600 | rw------- | SSH 개인키, 민감 파일 |
| 640 | rw-r----- | 그룹만 읽기 허용 |

```bash
# 소유자/그룹 변경
chown user1 file.txt              # 소유자만 변경
chown user1:staff file.txt        # 소유자와 그룹 동시 변경
chown :staff file.txt             # 그룹만 변경 (콜론 앞 비움)
chown -R user1:staff /data        # 하위 디렉터리까지 재귀 변경
chgrp staff file.txt              # 그룹만 변경 (전용 명령)
```

> 📚 **빈출**: `-R`(대문자) 옵션은 chmod/chown/chgrp 모두 "재귀(recursive)"를 의미한다. 디렉터리 트리 전체에 적용할 때 반드시 필요하다. 소문자 `-r`이 아니라 **대문자 -R**임에 주의.

> ⚠️ **함정**: `chown`에서 소유자와 그룹을 가르는 구분자는 콜론 `:`이 표준이다. 과거에는 점 `.`도 허용했지만 현재 시험·교재 기준은 콜론이다. `chown user1.staff`는 옛 방식이니 `chown user1:staff`로 답하라.

## 검색 명령어: find / grep

- `find`는 **파일을 조건으로 찾고**, `grep`은 **파일 내용에서 패턴을 찾는다**.
- 둘의 역할 구분이 핵심이다.

```bash
# find: 이름으로 찾기
find /home -name "*.log"          # 이름이 .log로 끝나는 파일
find /home -iname "readme*"       # 대소문자 무시 검색
find / -name "passwd" -type f     # 일반 파일만 (-type f)
find /var -type d -name "log"     # 디렉터리만 (-type d)

# find: 시간/크기 조건
find /tmp -mtime +7               # 7일보다 오래 전 수정된 파일
find /tmp -mtime -1               # 24시간 이내 수정된 파일
find / -size +100M                # 100MB보다 큰 파일
find /home -size +1G -type f      # 1GB 넘는 일반 파일

# find: 권한/소유자 조건
find / -perm 4755                 # SetUID 설정된 파일
find /home -user alice            # alice 소유 파일
find /data -group staff           # staff 그룹 파일

# find: 찾은 결과로 명령 실행
find /tmp -name "*.tmp" -exec rm {} \;   # 찾아서 삭제
find /log -name "*.log" -mtime +30 -delete  # 30일 지난 로그 삭제
```

- `-mtime`의 부호가 핵심이다.
- `+7`은 "7일 **이전**(더 오래된)", `-7`은 "7일 **이내**(더 최근)", `7`은 정확히 7일 전이다.

> 💡 **개념**: `find`의 `-exec` 구문은 `-exec 명령 {} \;` 형태로 끝난다. `{}`는 찾은 파일 이름이 들어갈 자리, `\;`는 명령의 끝을 표시한다. 이 `{} \;` 짝을 통째로 외워라.

```bash
# grep: 내용에서 패턴 찾기
grep "error" /var/log/messages    # error가 포함된 줄
grep -i "error" log.txt           # 대소문자 무시
grep -v "debug" log.txt           # debug가 없는 줄만 (반전)
grep -n "main" code.c             # 줄 번호와 함께 출력
grep -r "TODO" /project           # 디렉터리 재귀 검색
grep -c "200" access.log          # 일치하는 줄의 개수
grep -w "root" /etc/passwd        # 단어 단위 정확 일치
grep -E "cat|dog" file.txt        # 확장 정규식(OR)
grep -l "func" *.py               # 일치하는 파일명만 출력
```

| 옵션 | 의미 | find vs grep |
|------|------|--------------|
| `-i` | 대소문자 무시 | grep(`-i`) / find(`-iname`) |
| `-v` | 반전(일치 안 하는 것) | grep 전용 |
| `-n` | 줄 번호 출력 | grep 전용 |
| `-r`/`-R` | 재귀 검색 | grep 전용(find는 기본 재귀) |
| `-c` | 개수 세기 | grep 전용 |
| `-w` | 단어 단위 일치 | grep 전용 |

> ⚠️ **함정**: `grep -v`는 "패턴이 **없는** 줄"을 뽑는다. 반대로 알면 정답이 정반대가 된다. 그리고 `find`는 기본적으로 하위 디렉터리를 재귀 탐색하므로 별도 `-r` 옵션이 필요 없다. `grep`만 재귀에 `-r`이 필요하다는 점이 자주 헷갈린다.

## 프로세스 명령어: ps / kill / top

- 프로세스 상태 확인과 종료는 실기 작업형의 핵심이다.

```bash
# ps: 프로세스 목록
ps aux                # 모든 사용자의 모든 프로세스 (BSD 스타일)
ps -ef                # 모든 프로세스 + 부모 PID 표시 (System V 스타일)
ps -ef | grep nginx   # 특정 프로세스 찾기
ps -u alice           # 특정 사용자의 프로세스
ps -p 1234            # 특정 PID의 프로세스
```

- `ps aux`와 `ps -ef`는 거의 같은 정보를 다른 형식으로 보여준다.
- `aux`는 CPU·메모리 사용률(%CPU, %MEM)을, `-ef`는 PPID(부모 프로세스 ID)와 시작 시각을 강조한다.

```bash
# kill: 시그널 보내기
kill 1234             # 기본 시그널 TERM(15) 전송 — 정상 종료 요청
kill -9 1234          # KILL(9) — 강제 종료(무시 불가)
kill -15 1234         # TERM(15) — 정상 종료(기본값과 동일)
kill -1 1234          # HUP(1) — 설정 재읽기(데몬 reload)
kill -SIGKILL 1234    # 시그널 이름으로도 가능
killall nginx         # 이름으로 모든 nginx 프로세스 종료
pkill -u alice        # alice의 모든 프로세스 종료
pgrep -l sshd         # sshd의 PID를 이름과 함께 출력
```

| 시그널 | 번호 | 의미 | 무시 가능? |
|--------|------|------|-----------|
| SIGHUP | 1 | 재시작/설정 재읽기 | 가능 |
| SIGINT | 2 | 인터럽트(Ctrl+C) | 가능 |
| SIGKILL | 9 | 강제 종료 | **불가능** |
| SIGTERM | 15 | 정상 종료(기본) | 가능 |
| SIGSTOP | 19 | 일시 정지 | **불가능** |
| SIGCONT | 18 | 정지 해제(재개) | 가능 |

> 📚 **빈출**: `kill -9`(SIGKILL)은 프로세스가 무시할 수 없는 강제 종료, `kill -15`(SIGTERM, 기본값)는 정리 후 정상 종료다. 멈춘 프로세스를 확실히 죽이려면 `-9`. 데몬 설정만 다시 읽히려면 `kill -1`(SIGHUP). 이 세 가지는 반드시 구분.

> 🔍 **더 깊이**: `kill`에 아무 시그널을 안 주면 기본이 15(TERM)다. 그래서 `kill 1234`와 `kill -15 1234`는 같다. SIGKILL(9)과 SIGSTOP(19)만이 프로세스가 가로채거나 무시할 수 없는 두 시그널이다.

```bash
# top / 우선순위
top                   # 실시간 프로세스 모니터링(CPU 사용률 정렬)
nice -n 10 command    # 우선순위를 낮춰(+10) 명령 실행
renice -n 5 -p 1234   # 실행 중인 1234의 우선순위 변경
```

## 파일 명령어: ls / ln / 기타

```bash
# ls: 목록 보기
ls -l                 # 자세히(권한·소유자·크기·날짜)
ls -a                 # 숨김 파일(.으로 시작) 포함
ls -al                # 둘을 합친 가장 흔한 조합
ls -lh                # 사람이 읽기 쉬운 크기(K/M/G)
ls -lt                # 수정 시간 순 정렬(최신 먼저)
ls -ltr               # 시간 역순(오래된 것 먼저)
ls -i                 # inode 번호 표시
ls -ld /dir           # 디렉터리 자체 정보(내용 말고)
ls -R                 # 하위 디렉터리까지 재귀 출력
```

- `ls -l`의 첫 글자는 파일 종류를 나타낸다.
- `-`(일반), `d`(디렉터리), `l`(심볼릭 링크), `b`(블록 장치), `c`(문자 장치), `p`(파이프), `s`(소켓).

```bash
# ln: 링크 만들기
ln file.txt hardlink         # 하드 링크 생성
ln -s file.txt symlink       # 심볼릭(소프트) 링크 생성
ln -s /opt/app/v2 current    # 디렉터리 심볼릭 링크
```

| 구분 | 하드 링크 | 심볼릭 링크 |
|------|-----------|-------------|
| 옵션 | `ln`(기본) | `ln -s` |
| inode | 원본과 동일 | 별도 inode |
| 원본 삭제 시 | 데이터 유지 | 깨진 링크(dangling) |
| 다른 파일시스템 | 불가능 | 가능 |
| 디렉터리 링크 | 불가능 | 가능 |

> ⚠️ **함정**: 심볼릭 링크는 반드시 `-s` 옵션. `ln`만 쓰면 하드 링크가 생긴다. 하드 링크는 **같은 inode를 공유**하므로 원본을 지워도 데이터가 남지만, 심볼릭 링크는 경로만 가리키므로 원본이 사라지면 깨진다. 또한 하드 링크는 **다른 파티션·디렉터리 불가**, 심볼릭 링크는 가능하다는 차이도 단골 출제다.

> 🔍 **더 깊이**: `ls -i`로 inode 번호를 보면 하드 링크끼리는 같은 번호, 심볼릭 링크는 원본과 다른 번호임을 확인할 수 있다. 실기에서 "원본과 같은 inode를 가지는 링크는?"이라고 물으면 답은 하드 링크다.

## 직접 쳐보기

```bash
# 1) 권한 실습: 파일 만들고 권한 변경
touch test.sh
chmod 755 test.sh
ls -l test.sh          # -rwxr-xr-x 확인
chmod u-x,go-rx test.sh
ls -l test.sh          # -rw------- (600) 확인

# 2) 검색 실습
find /etc -name "*.conf" -type f | head
grep -n "root" /etc/passwd
grep -c "/bin/bash" /etc/passwd

# 3) 프로세스 실습
ps aux | grep $$       # 현재 셸의 PID 확인
sleep 300 &            # 백그라운드 프로세스 생성
jobs                   # 작업 목록
kill %1                # 작업 번호로 종료

# 4) 링크 실습
echo "original" > orig.txt
ln orig.txt hard.txt
ln -s orig.txt soft.txt
ls -li *.txt           # inode 비교
rm orig.txt
cat hard.txt           # 여전히 출력됨
cat soft.txt           # No such file (깨진 링크)
```

## 단답 암기 카드

| 작업 | 명령/옵션 |
|------|-----------|
| 파일을 rwxr-xr-x로 | `chmod 755` |
| 소유자·그룹 동시 변경, 하위까지 | `chown -R user:grp 대상` |
| 이름이 *.log인 파일 찾기 | `find 경로 -name "*.log"` |
| 7일보다 오래된 파일 찾기 | `find 경로 -mtime +7` |
| 100MB 넘는 파일 찾기 | `find 경로 -size +100M` |
| 패턴 없는 줄만 출력 | `grep -v 패턴 파일` |
| 줄 번호와 함께 검색 | `grep -n 패턴 파일` |
| 모든 프로세스 + PPID | `ps -ef` |
| 프로세스 강제 종료 | `kill -9 PID` |
| 데몬 설정 재읽기 | `kill -1 PID` 또는 `kill -HUP` |
| 이름으로 프로세스 종료 | `killall 이름` |
| 심볼릭 링크 생성 | `ln -s 원본 링크` |
| 숨김 파일 포함 자세히 | `ls -al` |
| 최신 수정순 정렬 | `ls -lt` |

표를 그냥 읽지 말고 직접 터미널에 쳐보며 출력 결과까지 눈에 익혀야 단답형에서 막힘없이 적을 수 있다. 다음 날은 설정 파일 경로와 핵심 지시어를 빈칸 채우기 형태로 굳힌다.

## 📖 용어

- **8진수 권한** : `r=4, w=2, x=1`을 더해 만든 세 자리 수. 순서는 소유자·그룹·기타.
- **-R (재귀)** : chmod·chown·chgrp에서 디렉터리 트리 전체에 적용하는 대문자 옵션. 소문자 `-r`이 아니다.
- **-iname** : find에서 파일 이름을 대소문자 구분 없이 찾는 옵션. grep의 `-i`에 해당한다.
- **-mtime** : find의 수정 시각 조건. `+N`은 N일보다 오래된, `-N`은 N일 이내를 뜻한다.
- **-exec {} \;** : find가 찾은 파일마다 명령을 실행하는 구문. `{}`는 파일 이름 자리, `\;`는 명령의 끝.
- **grep -v** : 패턴이 **없는** 줄만 뽑는 반전 옵션. 방향을 반대로 알면 정답이 정반대가 된다.
- **PPID** : 부모 프로세스의 ID. `ps -ef`가 이 값을 보여준다.
- **SIGTERM(15)** : 프로세스에게 정리하고 끝내라고 요청하는 기본 종료 시그널. 무시될 수 있다.
- **SIGKILL(9)** : 프로세스가 가로채거나 무시할 수 없는 강제 종료 시그널. SIGSTOP(19)과 함께 유이한 예외다.
- **SIGHUP(1)** : 데몬에게 설정 파일을 다시 읽으라고 알리는 시그널.
- **하드 링크** : 원본과 **같은 inode**를 공유하는 링크. 원본을 지워도 데이터가 남지만 다른 파티션·디렉터리에는 못 만든다.
- **심볼릭 링크** : 경로만 가리키는 별도 inode의 링크(`ln -s`). 원본이 사라지면 깨진다.

## 📝 연습 문제

**문제 1.** 파일의 권한을 `rwxr-xr-x`로 설정하는 chmod 명령으로 옳은 것은?

A) chmod 644 file
B) chmod 755 file
C) chmod 777 file
D) chmod 700 file

**정답: B**

해설: rwx=4+2+1=7, r-x=4+1=5, r-x=5 이므로 755다. 644는 rw-r--r--, 777은 rwxrwxrwx, 700은 rwx------이다.

---

**문제 2.** 디렉터리 `/data` 이하의 모든 파일의 소유자를 `alice`, 그룹을 `staff`로 한 번에 바꾸는 명령은?

A) chown alice.staff /data
B) chown -r alice:staff /data
C) chown -R alice:staff /data
D) chgrp -R alice:staff /data

**정답: C**

해설: 재귀 옵션은 대문자 `-R`이며, 소유자와 그룹은 콜론으로 구분한다. 소문자 `-r`은 chown의 재귀 옵션이 아니다. `chgrp`는 그룹만 변경하므로 소유자까지 바꿀 수 없다.

---

**문제 3.** `/tmp` 아래에서 7일보다 더 오래 전에 수정된 파일을 찾는 명령은?

A) find /tmp -mtime -7
B) find /tmp -mtime 7
C) find /tmp -mtime +7
D) find /tmp -atime +7

**정답: C**

해설: `-mtime +7`은 7일보다 더 오래된(이전) 수정 파일을 의미한다. `-7`은 7일 이내(최근), `7`은 정확히 7일 전, `-atime`은 접근 시간 기준이다.

---

**문제 4.** 파일 내용에서 "error"가 포함되지 **않은** 줄만 출력하는 grep 옵션은?

A) grep -i error file
B) grep -n error file
C) grep -c error file
D) grep -v error file

**정답: D**

해설: `-v`는 반전(invert) 옵션으로 패턴이 일치하지 않는 줄을 출력한다. `-i`는 대소문자 무시, `-n`은 줄 번호 출력, `-c`는 일치하는 줄의 개수를 센다.

---

**문제 5.** PID 1234 프로세스를 무시할 수 없게 강제로 종료하는 명령은?

A) kill -1 1234
B) kill -15 1234
C) kill -9 1234
D) kill -HUP 1234

**정답: C**

해설: 시그널 9(SIGKILL)는 프로세스가 가로채거나 무시할 수 없는 강제 종료 시그널이다. -1(HUP)은 설정 재읽기, -15(TERM)는 정상 종료 요청(기본값)이다.

---

**문제 6.** 원본과 같은 inode를 공유하며 다른 파티션에는 만들 수 없는 링크를 생성하는 명령은?

A) ln -s orig link
B) ln orig link
C) ln -h orig link
D) cp -l orig link

**정답: B**

해설: 옵션 없는 `ln`은 하드 링크를 만들며, 원본과 같은 inode를 공유한다. 하드 링크는 다른 파일시스템·디렉터리에 만들 수 없다. `-s`는 심볼릭 링크 옵션이다.

---

**문제 7.** 데몬에게 설정 파일을 다시 읽도록 SIGHUP 시그널을 보내는 명령으로 옳은 것은?

A) kill -9 PID
B) kill -1 PID
C) kill -15 PID
D) kill -19 PID

**정답: B**

해설: SIGHUP은 시그널 번호 1이며, 많은 데몬이 이를 받으면 재시작 없이 설정 파일을 다시 읽는다(reload). 9는 KILL, 15는 TERM, 19는 STOP(일시 정지)이다.

---
