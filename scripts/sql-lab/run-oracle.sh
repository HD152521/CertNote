#!/usr/bin/env bash
# 표준 입력의 SQL 을 실습장 기준 세션 설정으로 Oracle 컨테이너에서 실행한다.
# 날짜는 YYYY-MM-DD 로 보이게 맞춘다(실습장 엔진과 같은 표시).
# 사용: echo "SELECT ENAME FROM EMP;" | bash scripts/sql-lab/run-oracle.sh
{
  echo "SET PAGESIZE 100 LINESIZE 200 FEEDBACK OFF TAB OFF TRIMSPOOL ON TRIMOUT ON"
  echo "ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD';"
  cat
} | docker exec -i certnote-oracle sqlplus -S scott/tiger@localhost/FREEPDB1
