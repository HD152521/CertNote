# 🐧 리눅스마스터 1급 14주 학습 커리큘럼

> **목표**: 리눅스마스터 1급(KAIT 한국정보통신진흥협회 주관, 국가공인) 취득
> **총 학습 기간**: 14주 × 5일 = 70일
> **타겟**: 리눅스 기본기 보유자의 출퇴근 학습 (하루 15-25분 핵심 / 주말 실습)
> **핵심**: 1급은 명령어·설정파일 암기 비중이 큼 — 매 day마다 직접 쳐보는 실습 권장

---

## 📋 시험 정보

| 항목 | 내용 |
|------|------|
| 주관 | KAIT(한국정보통신진흥협회), 국가공인 |
| 1차(필기) | 객관식, 3과목 — ① 리눅스 실무의 이해 ② 리눅스 시스템 관리 ③ 리눅스 네트워크와 서비스의 활용 |
| 2차(실기) | 단답·작업형 — 명령어/옵션/설정파일 중심 |
| 합격 기준 | 과목당 40% 이상 + 전체 평균 60% 이상 (1차/2차 각각) |
| 응시 자격 | 2차는 1차 합격(또는 면제) 후 응시 |

---

## 🎯 2급과 1급의 결정적 차이

| 항목 | 2급 | 1급 |
|------|-----|-----|
| 범위 | 기본 운영·활용 | 시스템/네트워크/서비스/보안 심화 |
| 깊이 | 개념 위주 | 설정파일 지시어·명령어 옵션 정밀 |
| 실기 | 없음(필기 2차) | 단답·작업형 실기 |
| 핵심 | 이해 | "직접 칠 수 있는가" |

---

## 📅 14주 학습 계획

### Phase 1 — 기초 다지기 (Week 1~2) · 리눅스 실무의 이해

#### Week 1: 리눅스와 운영체제의 이해
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week1/day1.md](week1/day1.md) | 운영체제 개념, 커널·셸 구조, 리눅스 역사·철학 |
| 화 | [week1/day2.md](week1/day2.md) | 라이선스(GPL/LGPL/BSD), 배포판 계열 |
| 수 | [week1/day3.md](week1/day3.md) | 설치·파티션 설계, 부트로더(GRUB2), 부팅 과정 |
| 목 | [week1/day4.md](week1/day4.md) | 디렉터리 구조(FHS), 파일 종류, 링크(하드/심볼릭) |
| 금 | [week1/day5.md](week1/day5.md) | Week 1 복습 + 연습문제 |

#### Week 2: 기본 명령어와 편집기
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week2/day1.md](week2/day1.md) | 파일·디렉터리 명령(ls/cp/mv/rm/find/locate) |
| 화 | [week2/day2.md](week2/day2.md) | 텍스트 처리(cat/grep/sed/awk/sort/cut/wc) |
| 수 | [week2/day3.md](week2/day3.md) | vi/vim 정밀, nano/emacs 개요 |
| 목 | [week2/day4.md](week2/day4.md) | 압축·아카이브(tar/gzip/xz/zip), 도움말(man/info) |
| 금 | [week2/day5.md](week2/day5.md) | Week 2 복습 + 연습문제 |

### Phase 2 — 시스템 관리 (Week 3~7)

#### Week 3: 셸(bash)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week3/day1.md](week3/day1.md) | 셸 종류·기능, 환경변수/셸 변수 |
| 화 | [week3/day2.md](week3/day2.md) | 리다이렉션·파이프·필터, 메타문자 |
| 수 | [week3/day3.md](week3/day3.md) | alias, history, 작업 제어(jobs/fg/bg) |
| 목 | [week3/day4.md](week3/day4.md) | 셸 스크립트 기초(조건·반복·함수) |
| 금 | [week3/day5.md](week3/day5.md) | Week 3 복습 + 연습문제 |

#### Week 4: 사용자·권한 관리
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week4/day1.md](week4/day1.md) | 계정 파일(passwd/shadow/group/gshadow) |
| 화 | [week4/day2.md](week4/day2.md) | 계정 명령(useradd/usermod/userdel, su/sudo) |
| 수 | [week4/day3.md](week4/day3.md) | 권한(chmod/chown/chgrp, umask) |
| 목 | [week4/day4.md](week4/day4.md) | 특수권한(SetUID/SetGID/Sticky), ACL |
| 금 | [week4/day5.md](week4/day5.md) | Week 4 복습 + 연습문제 |

#### Week 5: 파일시스템·디스크
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week5/day1.md](week5/day1.md) | 파일시스템 종류(ext4/xfs/btrfs), inode |
| 화 | [week5/day2.md](week5/day2.md) | 파티션(fdisk/parted), mkfs, mount, /etc/fstab |
| 수 | [week5/day3.md](week5/day3.md) | LVM(PV/VG/LV), 스왑 |
| 목 | [week5/day4.md](week5/day4.md) | RAID, 디스크 쿼터, 점검(fsck/df/du) |
| 금 | [week5/day5.md](week5/day5.md) | Week 5 복습 + 연습문제 |

#### Week 6: 프로세스·스케줄링·systemd
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week6/day1.md](week6/day1.md) | 프로세스, ps/top/pgrep, 시그널/kill, nice |
| 화 | [week6/day2.md](week6/day2.md) | 데몬, 포그라운드/백그라운드, 좀비/고아 |
| 수 | [week6/day3.md](week6/day3.md) | init vs systemd, target, systemctl/journalctl |
| 목 | [week6/day4.md](week6/day4.md) | 작업 예약(cron/crontab, at/batch) |
| 금 | [week6/day5.md](week6/day5.md) | Week 6 복습 + 연습문제 |

#### Week 7: 패키지·커널·주변장치·백업
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week7/day1.md](week7/day1.md) | RPM(rpm/yum/dnf), DEB(dpkg/apt) |
| 화 | [week7/day2.md](week7/day2.md) | 소스 컴파일(configure/make), 라이브러리 |
| 수 | [week7/day3.md](week7/day3.md) | 커널 구조·모듈(lsmod/modprobe), 컴파일 |
| 목 | [week7/day4.md](week7/day4.md) | 장치 관리(/dev, udev), 프린터(CUPS) |
| 금 | [week7/day5.md](week7/day5.md) | 백업(tar/dump/rsync) + Week 7 복습 |

### Phase 3 — 네트워크와 서비스 (Week 8~11)

#### Week 8: 네트워크 기초·설정
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week8/day1.md](week8/day1.md) | OSI 7계층·TCP/IP, IP/서브넷/CIDR |
| 화 | [week8/day2.md](week8/day2.md) | 네트워크 설정(ip/ifconfig, nmcli), 라우팅 |
| 수 | [week8/day3.md](week8/day3.md) | 진단(ping/traceroute/netstat/ss/dig) |
| 목 | [week8/day4.md](week8/day4.md) | 본딩/티밍, OSI별 장비 |
| 금 | [week8/day5.md](week8/day5.md) | Week 8 복습 + 연습문제 |

#### Week 9: 인프라 서비스(DNS·DHCP·Web)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week9/day1.md](week9/day1.md) | DNS 개념·레코드, BIND(named.conf, zone) |
| 화 | [week9/day2.md](week9/day2.md) | DHCP(dhcpd.conf), NTP/chrony |
| 수 | [week9/day3.md](week9/day3.md) | Apache 설치·httpd.conf, 가상호스트 |
| 목 | [week9/day4.md](week9/day4.md) | Nginx 기본, 웹 로그·튜닝 |
| 금 | [week9/day5.md](week9/day5.md) | Week 9 복습 + 연습문제 |

#### Week 10: 메일·FTP·원격접속
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week10/day1.md](week10/day1.md) | 메일 구조(MTA/MDA/MUA), Postfix/Sendmail |
| 화 | [week10/day2.md](week10/day2.md) | FTP(vsftpd), 보안 FTP |
| 수 | [week10/day3.md](week10/day3.md) | SSH(sshd_config, 키 인증), scp/sftp |
| 목 | [week10/day4.md](week10/day4.md) | VNC, X 윈도 |
| 금 | [week10/day5.md](week10/day5.md) | Week 10 복습 + 연습문제 |

#### Week 11: 파일공유·보안
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week11/day1.md](week11/day1.md) | Samba(smb.conf) |
| 화 | [week11/day2.md](week11/day2.md) | NFS(exports) |
| 수 | [week11/day3.md](week11/day3.md) | 방화벽(iptables, firewalld) |
| 목 | [week11/day4.md](week11/day4.md) | 보안(TCP Wrapper, SELinux), 로그(rsyslog/logrotate) |
| 금 | [week11/day5.md](week11/day5.md) | Week 11 복습 + 연습문제 |

### Phase 4 — 2차 실기 집중 (Week 12~13)

#### Week 12: 실기 ① 시스템 작업형
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week12/day1.md](week12/day1.md) | 명령어 옵션 빈출 100선(권한·검색·프로세스) |
| 화 | [week12/day2.md](week12/day2.md) | 설정파일 경로·지시어 암기 |
| 수 | [week12/day3.md](week12/day3.md) | 디스크·LVM·권한 작업형 |
| 목 | [week12/day4.md](week12/day4.md) | 프로세스·스케줄링·systemd 작업형 |
| 금 | [week12/day5.md](week12/day5.md) | 작업형 모의 + 오답 |

#### Week 13: 실기 ② 네트워크·서비스 작업형
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week13/day1.md](week13/day1.md) | 네트워크 설정·진단 작업형 |
| 화 | [week13/day2.md](week13/day2.md) | 서비스 설정파일(httpd/named/vsftpd/smb) 단답 |
| 수 | [week13/day3.md](week13/day3.md) | 셸 스크립트 작성형 |
| 목 | [week13/day4.md](week13/day4.md) | 보안·방화벽·로그 작업형 |
| 금 | [week13/day5.md](week13/day5.md) | 작업형 모의 + 오답 |

### Phase 5 — 마무리 (Week 14)

#### Week 14: 종합 복습·모의고사
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week14/day1.md](week14/day1.md) | 1차 과목① 약점 정리 + 모의 |
| 화 | [week14/day2.md](week14/day2.md) | 1차 과목② 약점 정리 + 모의 |
| 수 | [week14/day3.md](week14/day3.md) | 1차 과목③ 약점 정리 + 모의 |
| 목 | [week14/day4.md](week14/day4.md) | 2차 실기 종합 모의(단답·작업형) |
| 금 | [week14/day5.md](week14/day5.md) | 최종 오답·암기카드 + 시험 전략 |

---

## 📚 학습 방법

### 출퇴근 학습 (하루 15-25분)
1. 개념·원리 핵심 — 5분
2. 명령어·옵션·설정파일 — 7분 (눈으로 익히고 메모)
3. 연습 문제 한두 개 — 5분

### 주말 실습 (하루 1-2시간)
1. 그날 배운 명령어를 **직접 터미널에서 실행**(VirtualBox/WSL/클라우드 VM)
2. 설정파일을 열어 지시어를 바꿔보고 서비스 재시작
3. 연습 문제 전부 풀고 오답 분석

> 🐧 70일의 여정. 1급은 "직접 칠 수 있는가"를 묻습니다. 매일 한 번씩 터미널을 여세요. 화이팅!
