import { describe, expect, it } from 'vitest';
import { SHELL_DRILLS, drillInitialState, type DrillItem } from './drills';
import { runLine } from './run';
import { createInitialState } from './state';

const item = (id: string): DrillItem => SHELL_DRILLS.flatMap((d) => d.items).find((i) => i.id === id)!;

/** 처음 상태에서 줄들을 차례로 실행하고, 마지막 줄 뒤에 통과했는지 */
function solves(it: DrillItem, lines: string[]): boolean {
  let st = drillInitialState(it);
  let passed = false;
  for (const line of lines) {
    const r = runLine(line, st);
    st = r.state;
    passed = it.isDone({ state: st, result: r });
  }
  return passed;
}

describe('shell drills', () => {
  for (const drill of SHELL_DRILLS) {
    for (const it_ of drill.items) {
      it(`${drill.id}/${it_.id}: setup runs cleanly and is not already solved`, () => {
        let st = drillInitialState(it_);
        const r = runLine('pwd', st);
        st = r.state;
        expect(it_.isDone({ state: st, result: r })).toBe(false);
      });
      it(`${drill.id}/${it_.id}: the model answer passes`, () => {
        expect(solves(it_, it_.answer.split('\n'))).toBe(true);
      });
    }
  }

  it('every setup command succeeds', () => {
    for (const it_ of SHELL_DRILLS.flatMap((d) => d.items)) {
      let st = createInitialState();
      for (const line of it_.setup) {
        const r = runLine(line, st);
        expect(r.exitCode, `${it_.id}: ${line}
${r.stderr}`).toBe(0);
        st = r.state;
      }
    }
  });

  it('accepts equivalent answers', () => {
    expect(solves(item('octal'), ['chmod u=rwx,g=rx,o= /data/report.sh'])).toBe(true);
    expect(solves(item('setuid'), ['chmod 4755 /data/bin/tool'])).toBe(true);
    expect(solves(item('setgid-dir'), ['chown :dev /data/share', 'chmod g+ws /data/share'])).toBe(true);
    expect(solves(item('sticky'), ['chmod a+rwx,o+t /data/pub'])).toBe(true);
    expect(solves(item('lock'), ['usermod -L kim'])).toBe(true);
    expect(solves(item('grep-count'), ['grep /bin/bash /etc/passwd | wc -l > /root/bash_count.txt'])).toBe(true);
    expect(solves(item('find-exec'), ['find . -user kim -type f -exec rm {} +'])).toBe(true);
  });

  it('rejects the classic mistakes', () => {
    expect(solves(item('usermod-ag'), ['usermod -G wheel lee'])).toBe(false);
    expect(solves(item('find-suid'), ['find /var/data -type f -perm 4000 > /root/suid.txt'])).toBe(false);
    expect(solves(item('find-suid'), ['find /var/data -perm -2000 > /root/suid.txt'])).toBe(false);
    expect(solves(item('mkdir-m'), ['mkdir /data/secret', 'chmod 700 /data/secret', 'ls -ld /data/secret'])).toBe(false);
    expect(solves(item('mkdir-m'), ['mkdir -m 755 /data/x; mkdir /data/secret; chmod 700 /data/secret'])).toBe(false);
    expect(solves(item('mkdir-m'), ['cd /data', 'mkdir -m 0700 secret'])).toBe(true);
    expect(solves(item('chown-r'), ['chown kim:dev /data/app'])).toBe(false);
    expect(solves(item('userdel-r'), ['userdel park'])).toBe(false);
    expect(solves(item('useradd'), ['useradd -u 1500 -d /home/devkim -m -s /bin/sh -g dev devkim'])).toBe(false);
    expect(solves(item('setgid-dir'), ['chgrp dev /data/share', 'chmod 775 /data/share'])).toBe(false);
  });
});
