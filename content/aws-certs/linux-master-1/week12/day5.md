# Day 5 - 시스템 작업형 모의고사 + 오답노트: 12문항으로 굳히기

이번 주는 2차 실기 시스템 작업형의 핵심 — 명령어 옵션, 설정 파일, 디스크·LVM·권한, 프로세스·스케줄링·systemd — 를 정밀하게 다졌다. 오늘은 그 전 범위를 한 번에 점검하는 **12문항 모의고사**다. 실기는 "이 작업을 하려면 어떤 명령/옵션/경로?"를 정확히 떠올릴 수 있느냐의 싸움이다. 한 문제를 풀 때마다 단순히 정답만 보지 말고, **왜 다른 보기가 틀렸는지** 오답 해설까지 읽어 헷갈리는 지점을 메워라. 틀린 문제는 반드시 해당 Day 본문으로 돌아가 표를 다시 외우는 것이 이번 주 마무리다.

## 시험 전략 한 줄 정리

- **권한 8진수**: rwx=7, rw-=6, r-x=5, r--=4 — `chmod 755`=rwxr-xr-x를 즉답하라.
- **재귀는 대문자 -R** (chmod/chown), grep 재귀는 `-r`.
- **kill -9**=강제 종료, **kill -1(HUP)**=설정 재읽기, **kill -15**=정상 종료(기본).
- **passwd 7필드 / shadow 9필드 / fstab 6필드** — 필드 개수와 순서를 외워라.
- **디스크**: fdisk → mkfs → mount → fstab. **LVM**: pvcreate → vgcreate → lvcreate, 확장은 lvextend + resize2fs.
- **특수 권한**: SetUID 4000, SetGID 2000, Sticky 1000.
- **enable=부팅 자동 시작, start=지금 시작** — 둘은 별개다.

## 📝 연습 문제

**문제 1.** 디렉터리 `/project` 이하 모든 파일·디렉터리의 권한을 `rwxr-xr-x`로 한 번에 변경하는 명령은?

A) chmod -r 755 /project
B) chmod -R 755 /project
C) chmod 755 -a /project
D) chmod 644 -R /project

**정답: B**

해설: 재귀 적용은 대문자 `-R`이며 rwxr-xr-x는 8진수 755다. 소문자 `-r`은 chmod의 재귀 옵션이 아니다. 644는 rw-r--r--로 다른 권한이다.

---

**문제 2.** `/data` 디렉터리 아래에서 100MB보다 큰 일반 파일만 찾는 명령으로 옳은 것은?

A) find /data -size +100M -type f
B) find /data -size -100M -type d
C) grep -size +100M /data
D) find /data -size 100M -type l

**정답: A**

해설: 크기 조건은 `-size +100M`(100MB 초과), 일반 파일은 `-type f`다. `-100M`은 100MB 미만, `-type d`는 디렉터리, `-type l`은 심볼릭 링크다. `grep`은 파일 내용 검색 도구로 크기 조건이 없다.

---

**문제 3.** 데몬에게 설정 파일을 재시작 없이 다시 읽게 하려고 SIGHUP을 보내는 명령은?

A) kill -9 PID
B) kill -15 PID
C) kill -1 PID
D) kill -19 PID

**정답: C**

해설: SIGHUP은 시그널 번호 1이며 많은 데몬이 이를 받으면 설정을 reload한다. 9는 강제 종료(KILL), 15는 정상 종료(TERM), 19는 일시 정지(STOP)다.

---

**문제 4.** 사용자 계정의 UID, 홈 디렉터리, 로그인 셸 정보가 저장되는 파일의 절대 경로는?

A) /etc/shadow
B) /etc/group
C) /etc/passwd
D) /etc/login.defs

**정답: C**

해설: UID(3필드), 홈 디렉터리(6필드), 로그인 셸(7필드)은 모두 `/etc/passwd`(총 7필드)에 있다. `/etc/shadow`는 암호화된 비밀번호와 정책, `/etc/group`은 그룹, `/etc/login.defs`는 새 계정 기본 정책값이다.

---

**문제 5.** `/etc/fstab`의 6번째 필드가 의미하는 것과 루트 파일시스템에 들어갈 값은?

A) dump 백업 여부, 0
B) fsck 검사 순서, 1
C) 마운트 옵션, defaults
D) 파일시스템 종류, ext4

**정답: B**

해설: fstab 6번째 필드는 부팅 시 fsck 검사 순서로, 루트(/)는 1, 나머지는 2, 검사 안 함은 0이다. dump 백업 여부는 5번째, 마운트 옵션은 4번째, 파일시스템 종류는 3번째 필드다.

---

**문제 6.** 새 파티션 `/dev/sdc1`을 xfs로 포맷한 뒤 `/srv`에 마운트하려 한다. 포맷 명령으로 옳은 것은?

A) mount -t xfs /dev/sdc1 /srv
B) mkfs -t xfs /dev/sdc1
C) fdisk -t xfs /dev/sdc1
D) xfs_growfs /dev/sdc1

**정답: B**

해설: 파일시스템 생성(포맷)은 `mkfs -t xfs`(또는 `mkfs.xfs`)다. `mount`는 연결, `fdisk`는 파티션 생성, `xfs_growfs`는 이미 만들어진 xfs를 확장하는 명령이다.

---

**문제 7.** LVM에서 볼륨 그룹 `vg01`에 새 물리 볼륨 `/dev/sdd`를 추가해 용량을 늘리는 명령은?

A) lvextend vg01 /dev/sdd
B) pvcreate vg01 /dev/sdd
C) vgextend vg01 /dev/sdd
D) vgcreate vg01 /dev/sdd

**정답: C**

해설: 볼륨 그룹에 PV를 추가해 풀을 키우는 명령은 `vgextend`다. `lvextend`는 논리 볼륨 확장, `vgcreate`는 VG 새로 생성, `pvcreate`는 디스크를 PV로 초기화하는 명령이다(단, sdd는 미리 pvcreate 되어 있어야 함).

---

**문제 8.** 논리 볼륨을 `lvextend`로 늘린 뒤 ext4 파일시스템의 실제 용량까지 확장하는 명령은?

A) xfs_growfs
B) resize2fs
C) mkfs.ext4
D) vgextend

**정답: B**

해설: ext2/3/4 파일시스템 확장은 `resize2fs`다. `xfs_growfs`는 xfs 전용, `mkfs.ext4`는 포맷(데이터 삭제), `vgextend`는 VG 확장 명령이다. LV만 늘리면 파일시스템은 그대로이므로 resize 단계가 반드시 필요하다.

---

**문제 9.** `umask` 값이 077일 때 새로 생성되는 디렉터리의 권한은?

A) 755
B) 700
C) 644
D) 600

**정답: B**

해설: 디렉터리 기본 권한 777에서 umask 077을 빼면 700(rwx------)이 된다. 755는 umask 022, 644는 umask 022일 때의 파일 권한, 600은 umask 077일 때의 파일 권한이다.

---

**문제 10.** 공유 디렉터리 `/tmp`처럼 누구나 파일을 만들 수 있지만 자기가 만든 파일만 삭제할 수 있게 설정하는 명령은?

A) chmod 4777 /tmp
B) chmod 2777 /tmp
C) chmod 1777 /tmp
D) chmod 0777 /tmp

**정답: C**

해설: Sticky bit(8진수 1000)를 설정하면 디렉터리에서 본인 소유 파일만 삭제 가능하다. `chmod 1777`이 정답이며 `ls -ld`에서 `rwxrwxrwt`로 나타난다. 4000은 SetUID, 2000은 SetGID다.

---

**문제 11.** 매주 일요일 새벽 4시에 `/backup.sh`를 실행하도록 crontab에 등록하는 항목은?

A) 0 4 * * 0 /backup.sh
B) 4 0 * * 7 /backup.sh
C) 0 4 7 * * /backup.sh
D) 0 4 * * 1 /backup.sh

**정답: A**

해설: 필드는 분-시-일-월-요일 순이다. 매주 일요일 04:00은 분=0, 시=4, 요일=0(일요일)으로 `0 4 * * 0`이다. B는 분시가 뒤바뀌었고, C는 일=7로 매월 7일을 뜻하며, D는 요일 1(월요일)이다.

---

**문제 12.** httpd 서비스를 지금 즉시 시작하면서 동시에 부팅 시 자동 시작되도록 한 번에 등록하는 명령은?

A) systemctl start httpd
B) systemctl enable httpd
C) systemctl enable --now httpd
D) systemctl restart --now httpd

**정답: C**

해설: `enable --now`는 부팅 자동 시작 등록(enable)과 즉시 시작(start)을 한 번에 수행한다. `start`만은 지금만 시작, `enable`만은 부팅 시 시작 등록만 하며 지금은 시작하지 않는다.

---

## 오답노트: 자주 틀리는 함정 정리

이번 주 12문항에서 가장 자주 헷갈리는 지점을 다시 묶는다.

| 헷갈림 포인트 | 정확한 정리 |
|---------------|-------------|
| 재귀 옵션 | chmod/chown은 대문자 `-R`, grep도 재귀는 `-r`/`-R` |
| nice 우선순위 | 값이 **낮을수록** 우선순위 높음 (양수는 양보) |
| kill 시그널 | 9=강제, 15=정상(기본), 1=HUP(reload) |
| 파일 필드 수 | passwd 7 / shadow 9 / group 4 / fstab 6 |
| fstab 5·6필드 | 5=dump 백업, 6=fsck 순서(루트 1) |
| 디스크 4단계 | fdisk → mkfs → mount → fstab |
| LVM 생성/확장 | pv→vg→lv 생성 / vgextend→lvextend→resize2fs 확장 |
| umask 계산 | 파일 666-umask, 디렉터리 777-umask |
| 특수 권한 8진수 | SetUID 4, SetGID 2, Sticky 1 (맨 앞 자리) |
| start vs enable | start=지금, enable=부팅 자동 시작 (별개) |
| at vs cron | at=일회성, cron=반복 |
| daemon-reload | 유닛 파일 수정 후 반드시 실행 |

> 💡 **마무리**: 작업형은 "지금 동작"과 "영구 설정"을 가르는 문제가 절반이다. 시나리오에 "부팅 후에도", "재부팅해도", "정기적으로"가 보이면 `enable`, `/etc/fstab`, `crontab`, `sysctl -p` 같은 **영구화 명령**을 골라야 한다. 반대로 "지금", "한 번"이면 `start`, `mount`, `at`이다.

> ⚠️ **함정 총정리**: ① `chown`의 소유자:그룹 구분자는 콜론(`:`). ② `grep -v`는 일치하지 **않는** 줄. ③ `find -mtime +7`은 7일보다 **오래된** 것. ④ LV 확장 후 `resize2fs`/`xfs_growfs`를 빠뜨리면 용량 미반영. ⑤ 유닛 파일 수정 후 `daemon-reload` 누락. 이 다섯이 실기 단골 감점 포인트다.

틀린 문제가 있다면 번호에 해당하는 Day로 돌아가라 — 1·2번은 Day1(명령어 옵션), 4·5번은 Day2(설정 파일), 6~10번은 Day3(디스크·LVM·권한), 11·12번은 Day4(프로세스·systemd)다. 표를 손으로 다시 써보며 명령·옵션·경로가 자동으로 나올 때까지 반복하면 2차 실기 시스템 작업형은 충분히 정복된다.
