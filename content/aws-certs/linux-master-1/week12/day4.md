# Day 4 - 프로세스·스케줄링·systemd 작업형: 운영 명령을 시나리오로 굳히기

## 📌 핵심 정리

- 시스템 운영은 **프로세스를 다루고, 작업을 예약하고, 서비스를 관리하는 일**이다. 시나리오를 명령으로 옮기는 능력이 관건이다.
- nice 값은 **낮을수록 우선순위가 높다**(-20~+19). 새 프로세스는 `nice`, 실행 중인 것은 `renice`. 음수는 root만 가능하다.
- 작업 제어: `&`(백그라운드), `Ctrl+Z`(일시 정지), `jobs`·`bg %N`·`fg %N`, 로그아웃 후 유지는 `nohup ... &`.
- 예약은 **반복이면 cron, 한 번이면 at**. `crontab -e/-l/-r` 중 `-r`은 확인 없이 전부 지우니 주의.
- systemd에서 **`start`는 지금, `enable`은 부팅 시**로 서로 별개다. 한 번에 하려면 `enable --now`.
- 유닛 파일을 고쳤으면 반드시 **`systemctl daemon-reload`**. 서비스 로그는 `journalctl -u 서비스`로 본다.

## 프로세스 우선순위: nice / renice

- 리눅스 프로세스는 **nice 값**(-20 ~ +19)으로 우선순위를 조절한다.
- **값이 낮을수록 우선순위가 높다**.

```bash
# nice: 새 프로세스를 특정 우선순위로 시작
nice -n 10 command       # nice 값 +10 (우선순위 낮춤)으로 실행
nice -n -5 command       # nice 값 -5 (우선순위 높임, root 필요)
nice command             # 기본 +10으로 실행

# renice: 이미 실행 중인 프로세스의 우선순위 변경
renice -n 5 -p 1234      # PID 1234를 nice 5로
renice -n -10 -p 1234    # 우선순위 높임 (root 필요)
renice -n 5 -u alice     # alice의 모든 프로세스
```

| nice 값 | 우선순위 | 권한 |
|---------|----------|------|
| -20 | 가장 높음 | root만 가능 |
| 0 | 기본값 | 일반 사용자 |
| +19 | 가장 낮음 | 일반 사용자 |

> 💡 **개념**: nice 값은 **낮을수록 우선순위가 높다**(-20이 최고, +19가 최저). 일반 사용자는 우선순위를 **낮추기만**(양수로) 할 수 있고, 높이려면(음수) root 권한이 필요하다. 새 프로세스는 `nice`, 실행 중인 것은 `renice`다.

> ⚠️ **함정**: `nice -n 10`은 우선순위를 **낮춘다**(양보한다). 직관과 반대다. "nice할수록(양보할수록) 우선순위가 낮아진다"고 외우면 헷갈리지 않는다. `renice`는 PID에는 `-p`, 사용자에는 `-u` 옵션을 쓴다.

## 작업 제어: 포그라운드 / 백그라운드 / jobs

- 셸에서 실행 중인 작업을 전환하는 것이 작업 제어(job control)다.

```bash
command &            # 백그라운드로 실행
Ctrl + Z             # 실행 중 작업을 일시 정지(suspend)
jobs                 # 현재 셸의 작업 목록
jobs -l              # PID와 함께 표시
bg %1                # 1번 작업을 백그라운드에서 재개
fg %1                # 1번 작업을 포그라운드로 가져옴
kill %1              # 작업 번호로 종료
nohup command &      # 로그아웃해도 계속 실행
disown %1            # 작업을 셸에서 분리
```

| 동작 | 명령/키 |
|------|---------|
| 백그라운드 실행 | `command &` |
| 일시 정지 | `Ctrl + Z` (SIGTSTP) |
| 작업 목록 | `jobs` |
| 백그라운드 재개 | `bg %번호` |
| 포그라운드 전환 | `fg %번호` |
| 로그아웃 후 유지 | `nohup ... &` |

> 📚 **빈출**: `Ctrl + Z`는 작업을 **일시 정지**(멈춤), `Ctrl + C`는 **종료**(SIGINT)다. 멈춘 작업은 `bg`로 백그라운드 재개하거나 `fg`로 다시 불러온다. 작업은 `%번호`로 가리킨다. 로그아웃해도 살아남게 하려면 `nohup`을 앞에 붙이고 `&`로 백그라운드 실행한다.

## 정기 작업 예약: crontab

- `crontab`은 정기 반복 작업을 예약한다.
- 어제 파일 구조를 봤다면 오늘은 명령 사용법이다.

```bash
crontab -e           # 현재 사용자의 crontab 편집
crontab -l           # 등록된 cron 작업 목록
crontab -r           # 모든 cron 작업 삭제 (주의!)
crontab -u alice -e  # alice의 crontab 편집 (root)
crontab -u alice -l  # alice의 crontab 목록

# 작성 예시 (분 시 일 월 요일 명령)
0 3 * * *      /backup/daily.sh      # 매일 03:00
30 2 * * 0     /backup/weekly.sh     # 매주 일요일 02:30
0 0 1 * *      /backup/monthly.sh    # 매월 1일 00:00
*/15 * * * *   /check/health.sh      # 15분마다
0 9-18 * * 1-5 /work/poll.sh         # 평일 9~18시 매시 정각
```

> 💡 **개념**: `crontab -e`(편집), `crontab -l`(목록), `crontab -r`(전체 삭제)이 핵심 3종이다. `-r`은 확인 없이 전부 지우므로 위험하다. "매일 새벽 3시"는 `0 3 * * *`처럼 분-시-일-월-요일 순으로 적는다.

> ⚠️ **함정**: `crontab -r`은 **확인 없이 모든 작업을 삭제**한다. 편집(`-e`)과 혼동하면 큰일이다. cron 사용 허용/차단은 `/etc/cron.allow`(허용 목록)와 `/etc/cron.deny`(차단 목록)로 제어한다. allow가 있으면 거기 적힌 사용자만, 없으면 deny에 없는 사용자가 쓸 수 있다.

## 일회성 작업 예약: at

- `at`은 미래의 **한 번**만 실행할 작업을 예약한다(반복은 cron).

```bash
at 10:30                 # 오늘 10:30에 실행 (대화형 입력)
at now + 2 hours         # 2시간 뒤
at 9am tomorrow          # 내일 오전 9시
at 14:00 2026-06-10      # 특정 날짜·시각
# 입력 후 명령 적고 Ctrl+D로 등록

atq                      # 예약된 at 작업 목록
atrm 3                   # 3번 작업 삭제
batch                    # 시스템 부하가 낮을 때 실행
```

| 도구 | 용도 | 반복 |
|------|------|------|
| `cron` | 정기 반복 작업 | 반복 O |
| `at` | 일회성 미래 작업 | 반복 X |
| `batch` | 부하 낮을 때 한 번 | 반복 X |

> 🔍 **더 깊이**: `at`은 한 번, `cron`은 반복이라는 점이 핵심 구분이다. `at` 작업 목록은 `atq`, 삭제는 `atrm`이다. `at` 사용 권한도 `/etc/at.allow`, `/etc/at.deny`로 제어한다.

## 서비스 관리: systemd / systemctl

- 현대 리눅스는 **systemd**가 서비스(데몬)를 관리한다.
- `systemctl`이 핵심 명령이다.

```bash
# 서비스 제어
systemctl start nginx          # 시작
systemctl stop nginx           # 중지
systemctl restart nginx        # 재시작
systemctl reload nginx         # 설정만 다시 읽기(무중단)
systemctl status nginx         # 상태 확인

# 부팅 자동 시작
systemctl enable nginx         # 부팅 시 자동 시작 등록
systemctl disable nginx        # 자동 시작 해제
systemctl enable --now nginx   # 등록 + 즉시 시작
systemctl is-enabled nginx     # 자동시작 여부 확인
systemctl is-active nginx      # 실행 중 여부 확인

# 전체 목록
systemctl list-units --type=service       # 실행 중 서비스
systemctl list-unit-files --type=service  # 모든 서비스 + enable 여부
```

| 작업 | 명령 |
|------|------|
| 즉시 시작 | `systemctl start 서비스` |
| 부팅 자동 시작 등록 | `systemctl enable 서비스` |
| 등록 + 즉시 시작 | `systemctl enable --now 서비스` |
| 상태 확인 | `systemctl status 서비스` |
| 설정 reload | `systemctl reload 서비스` |

> 📚 **빈출**: `start`/`stop`은 **지금** 동작, `enable`/`disable`은 **부팅 시** 자동 시작 여부다. 둘은 별개다 — `enable`만 하면 지금은 안 돌고, `start`만 하면 재부팅 후 안 돈다. "부팅 후에도 자동 시작"이 조건이면 반드시 `enable`이 필요하다. 한 번에 하려면 `enable --now`.

```bash
# 런레벨 ↔ systemd target
systemctl get-default                  # 기본 부팅 target 확인
systemctl set-default multi-user.target  # CLI 모드로 부팅
systemctl set-default graphical.target   # GUI 모드로 부팅
systemctl isolate multi-user.target      # 즉시 전환

# 전원 관리
systemctl reboot         # 재부팅
systemctl poweroff       # 종료
```

| 옛 런레벨 | systemd target | 의미 |
|-----------|----------------|------|
| 0 | poweroff.target | 종료 |
| 1 | rescue.target | 단일 사용자 |
| 3 | multi-user.target | 텍스트 다중 사용자 |
| 5 | graphical.target | GUI |
| 6 | reboot.target | 재부팅 |

> 🔍 **더 깊이**: 런레벨 3(텍스트)은 `multi-user.target`, 런레벨 5(GUI)는 `graphical.target`에 대응한다. 기본 부팅 모드는 `systemctl set-default`로 바꾼다. 옛 `init 3`, `init 5`도 systemd가 호환 처리한다.

## systemd 유닛 파일

- 서비스 정의는 **유닛 파일**(`.service`)에 담긴다.
- 위치와 핵심 섹션을 알아두자.

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Application
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/myapp
Restart=on-failure
User=appuser

[Install]
WantedBy=multi-user.target
```

```bash
# 유닛 파일 수정 후 반드시
systemctl daemon-reload        # systemd가 유닛 변경 다시 읽기
systemctl restart myapp
```

| 위치 | 용도 |
|------|------|
| `/usr/lib/systemd/system/` | 패키지가 설치한 기본 유닛 |
| `/etc/systemd/system/` | 관리자가 만든/덮어쓴 유닛(우선) |

> ⚠️ **함정**: 유닛 파일을 새로 만들거나 고친 뒤에는 반드시 `systemctl daemon-reload`를 실행해야 systemd가 변경을 인식한다. 이걸 빼면 `start`해도 옛 설정이 적용된다. 또 부팅 자동 시작은 유닛의 `[Install]` 섹션 `WantedBy`와 `systemctl enable`로 완성된다.

## 로그 확인: journalctl

```bash
journalctl                     # 전체 로그
journalctl -u nginx            # 특정 서비스 로그
journalctl -f                  # 실시간 추적(tail -f처럼)
journalctl -b                  # 이번 부팅 이후 로그
journalctl --since "1 hour ago"  # 최근 1시간
journalctl -p err              # 에러 레벨 이상만
```

> 💡 **개념**: systemd 환경의 로그는 `journalctl`로 본다. 특정 서비스는 `-u 서비스명`, 실시간 추적은 `-f`다. 전통적 `/var/log/messages`, `/var/log/syslog`도 여전히 있지만 systemd 서비스 로그는 journal에 모인다.

## 직접 쳐보기

```bash
# 프로세스 우선순위 실험
nice -n 10 sleep 100 &
ps -o pid,ni,cmd -p $!    # nice 값(NI) 확인

# 작업 제어 실험
sleep 200 &              # 백그라운드 실행
jobs -l                  # 작업 목록 + PID
fg %1                    # 포그라운드로 (Ctrl+Z로 멈춰보기)
bg %1                    # 다시 백그라운드로

# cron 확인
crontab -l 2>/dev/null   # 현재 cron 목록

# systemd 상태 확인 (조회만)
systemctl status         # 시스템 전체 상태
systemctl list-units --type=service --state=running | head
systemctl get-default    # 기본 부팅 target
journalctl -n 20 --no-pager   # 최근 20줄 로그
```

## 작업 시나리오 암기 카드

| 시나리오 | 명령 |
|----------|------|
| 새 프로세스 우선순위 낮춰 실행 | `nice -n 10 명령` |
| 실행 중 프로세스 우선순위 변경 | `renice -n 값 -p PID` |
| 작업 백그라운드 재개 | `bg %번호` |
| 로그아웃 후에도 실행 유지 | `nohup 명령 &` |
| 매일 새벽 3시 작업 등록 | `crontab -e` → `0 3 * * * 스크립트` |
| cron 목록 보기 | `crontab -l` |
| 일회성 미래 작업 예약 | `at 시각` |
| 서비스 지금 시작 | `systemctl start 서비스` |
| 부팅 자동 시작 등록 | `systemctl enable 서비스` |
| 등록+즉시 시작 한 번에 | `systemctl enable --now 서비스` |
| 유닛 파일 수정 후 | `systemctl daemon-reload` |
| 기본 부팅 모드를 CLI로 | `systemctl set-default multi-user.target` |
| 특정 서비스 로그 보기 | `journalctl -u 서비스` |

시나리오에 "부팅 후에도", "정기적으로"가 들어가면 영구 설정 명령을 골라야 한다. 다음 날은 오늘까지 배운 시스템 작업형 전체를 12문항 모의고사와 오답노트로 점검한다.

## 📖 용어

- **nice 값** : 프로세스의 양보 정도(-20~+19). **낮을수록 우선순위가 높다**. 음수로 낮추려면 root가 필요하다.
- **renice** : 이미 실행 중인 프로세스의 nice 값을 바꾸는 명령. PID는 `-p`, 사용자는 `-u`로 지정한다.
- **작업 제어(job control)** : 셸에서 실행 중인 작업을 포그라운드·백그라운드·정지 상태로 옮기는 기능.
- **nohup** : 로그아웃해도 프로세스가 죽지 않게 하는 명령. 보통 `&`와 함께 백그라운드로 쓴다.
- **crontab -r** : 그 사용자의 cron 작업을 **확인 없이 전부** 삭제하는 위험한 옵션. `-e`와 헷갈리면 안 된다.
- **cron.allow / cron.deny** : cron 사용을 허용·차단할 사용자 목록. allow가 있으면 거기 적힌 사람만 쓸 수 있다.
- **at** : 미래의 한 시점에 **한 번만** 실행할 작업을 예약하는 명령. 목록은 `atq`, 삭제는 `atrm`.
- **systemd** : 현대 리눅스의 서비스·부팅 관리자. `systemctl`로 조작한다.
- **start vs enable** : 지금 서비스를 켜는 것 / 부팅할 때 자동으로 켜지게 등록하는 것. 서로 별개다.
- **유닛 파일(.service)** : 서비스의 실행 방법을 정의한 설정 파일. `[Unit]`·`[Service]`·`[Install]` 섹션으로 구성된다.
- **daemon-reload** : 유닛 파일 변경을 systemd가 다시 읽게 하는 명령. 빼먹으면 옛 설정이 그대로 적용된다.
- **target** : 옛 런레벨에 대응하는 systemd의 시스템 상태. 텍스트는 `multi-user`, GUI는 `graphical`.
- **journalctl** : systemd가 모은 로그를 조회하는 명령. `-u`로 서비스 지정, `-f`로 실시간 추적.

## 📝 연습 문제

**문제 1.** 실행 중인 PID 2000 프로세스의 nice 값을 5로 변경하는 명령은?

A) nice -n 5 -p 2000
B) renice -n 5 -p 2000
C) renice 5 2000 -p
D) nice -p 2000 -n 5

**정답: B**

해설: 이미 실행 중인 프로세스의 우선순위 변경은 `renice`이며 PID 지정은 `-p` 옵션이다. `nice`는 새 프로세스를 시작할 때 쓴다. nice 값이 높을수록(양수) 우선순위가 낮아진다.

---

**문제 2.** 셸에서 `Ctrl + Z`를 눌렀을 때 일어나는 동작은?

A) 현재 작업을 완전히 종료한다
B) 현재 작업을 일시 정지(suspend)한다
C) 현재 작업을 백그라운드로 보낸다
D) 현재 작업을 강제로 재시작한다

**정답: B**

해설: `Ctrl + Z`는 SIGTSTP를 보내 현재 작업을 일시 정지한다. 정지된 작업은 `bg`로 백그라운드 재개하거나 `fg`로 다시 불러올 수 있다. 종료는 `Ctrl + C`(SIGINT)다.

---

**문제 3.** 매일 새벽 2시 30분에 `/backup.sh`를 실행하도록 crontab에 등록하는 항목으로 옳은 것은?

A) 30 2 * * * /backup.sh
B) 2 30 * * * /backup.sh
C) * * 2 30 * /backup.sh
D) 30 2 * * 0 /backup.sh

**정답: A**

해설: crontab 필드는 분-시-일-월-요일 순이다. 매일 02:30은 분=30, 시=2, 나머지는 *로 `30 2 * * *`이다. B는 분시가 뒤바뀌었고, D는 요일 0(일요일)이 붙어 매주 일요일만 실행된다.

---

**문제 4.** nginx 서비스를 부팅 시 자동으로 시작되도록 등록하는 systemctl 명령은?

A) systemctl start nginx
B) systemctl status nginx
C) systemctl enable nginx
D) systemctl restart nginx

**정답: C**

해설: 부팅 시 자동 시작 등록은 `systemctl enable`이다. `start`는 지금 한 번 시작할 뿐 재부팅 후 자동 시작과는 무관하다. 등록과 즉시 시작을 함께 하려면 `enable --now`를 쓴다.

---

**문제 5.** 일회성으로 미래의 특정 시각에 한 번만 작업을 실행하도록 예약하는 명령은?

A) crontab
B) at
C) systemctl timer
D) batch -r

**정답: B**

해설: `at`은 지정한 미래 시각에 한 번만 실행하는 일회성 예약 명령이다. `crontab`은 정기 반복용이며, `batch`는 시스템 부하가 낮을 때 한 번 실행한다(시각 지정 아님).

---

**문제 6.** systemd 유닛 파일(`.service`)을 새로 작성한 뒤 systemd가 이를 인식하게 하려면 반드시 실행해야 하는 명령은?

A) systemctl reload-or-restart
B) systemctl daemon-reload
C) systemctl reset-failed
D) systemctl reenable

**정답: B**

해설: 유닛 파일을 추가하거나 수정한 뒤에는 `systemctl daemon-reload`로 systemd가 유닛 정의를 다시 읽게 해야 한다. 이를 생략하면 변경 사항이 반영되지 않은 채 동작한다.

---

**문제 7.** 시스템 기본 부팅 모드를 텍스트(CLI) 다중 사용자 모드로 변경하는 명령은?

A) systemctl set-default graphical.target
B) systemctl isolate rescue.target
C) systemctl set-default multi-user.target
D) systemctl get-default multi-user.target

**정답: C**

해설: 텍스트 다중 사용자 모드는 `multi-user.target`(옛 런레벨 3)이며 기본 부팅 모드 변경은 `set-default`로 한다. `graphical.target`은 GUI(런레벨 5), `get-default`는 현재 값 조회 명령이다.

---
