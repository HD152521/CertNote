// English text for the practical drills. Only human-readable text is translated; ids, order, setup commands,
// answers and graders (isDone) are inherited unchanged from drills.ts.
import { SHELL_DRILLS, type ShellDrill } from './drills';

interface ItemText {
  title: string;
  prompt: string;
  conditions: string[];
  explain: string;
}
interface DrillText {
  code: string;
  title: string;
  items: Record<string, ItemText>;
}

const EN: Record<string, DrillText> = {
  'linux-practical-perm': {
    code: 'Practical P1',
    title: '7 practical problems on permissions and ownership',
    items: {
      octal: {
        title: 'Set script permissions',
        prompt: 'Set the permissions of /data/report.sh according to the [Conditions].',
        conditions: ['Owner: read, write and execute', 'Group: read and execute', 'Everyone else: no permissions at all'],
        explain:
          'rwx=7, r-x=5 and ---=0, so the answer is 750. In symbolic form it is chmod u=rwx,g=rx,o= /data/report.sh, with the same result. In the practical exam either numeric or symbolic mode is correct as long as the result matches, but numeric mode is shorter and harder to get wrong.',
      },
      'mkdir-m': {
        title: 'Create a directory with its permissions set from the start',
        prompt: 'In a single command, create the directory /data/secret and give all permissions to the owner only.',
        conditions: ['Do not use a separate chmod after creating the directory', 'Final permissions rwx------'],
        explain:
          'mkdir -m sets the permissions while creating the directory. Like chmod after mkdir, the value you give is used as is regardless of umask, but it finishes in one line.',
      },
      umask: {
        title: 'Set default permissions with umask',
        prompt: 'Set the umask of the current shell so that directories created from now on get rwxr-x---.',
        conditions: ['Do not change the permissions of existing files'],
        explain:
          'Subtract the umask from the directory default 777: 777 - 027 = 750 (rwxr-x---). With the same umask a new file is 666 minus the umask, which gives 640. "Files start from 666, directories from 777" is the key to calculation problems.',
      },
      setuid: {
        title: 'Add SetUID',
        prompt: 'Configure /data/bin/tool so that whoever runs it, it runs with the permissions of the file owner.',
        conditions: ['Leave the other permissions (rwxr-xr-x) as they are'],
        explain:
          'Running with the owner\'s permissions is SetUID, which is 4000 in numeric form. chmod 4755 /data/bin/tool gives the same result. In ls -l the owner execute position becomes s (a capital S if it is set without execute permission).',
      },
      'setgid-dir': {
        title: 'Group shared directory',
        prompt: 'Make /data/share a directory that the dev group uses together.',
        conditions: [
          'The directory\'s group owner is dev',
          'Group members can create files in this directory',
          'Files newly created in this directory belong to the dev group no matter who creates them',
        ],
        explain:
          'Group inheritance is done by the directory\'s SetGID (2000). chmod g+ws also works, and chown :dev /data/share is the same as chgrp. A perennial question is the difference: SetGID on a file means "run with the group\'s permissions" while on a directory it means "inherit the group".',
      },
      sticky: {
        title: 'Everyone can write, but not delete others\' files',
        prompt: 'Configure /data/pub as a directory in which every user can create files.',
        conditions: [
          'Allow read, write and execute for all users',
          'A file must not be deleted or renamed by anyone but the user who created it',
        ],
        explain:
          'What stops people from deleting others\' files is the sticky bit (1000), and /tmp is exactly 1777. chmod a+rwx,o+t /data/pub also works. In ls -l the others execute position shows t.',
      },
      'chown-r': {
        title: 'Hand over a whole directory',
        prompt: 'Change the owner of /data/app and everything under it to kim and the group owner to dev.',
        conditions: ['Do it in a single command'],
        explain:
          '-R applies the change to everything below. Write the owner and group together with a colon, like kim:dev (kim.dev is also accepted but is the old notation). Without -R only /data/app itself changes.',
      },
    },
  },
  'linux-practical-users': {
    code: 'Practical P2',
    title: '8 practical problems on accounts and search',
    items: {
      useradd: {
        title: 'Create a user to specification',
        prompt: 'Create the user devkim according to the [Conditions].',
        conditions: ['UID 1500', 'Home directory /home/devkim (actually created)', 'Login shell /bin/sh', 'Supplementary group dev'],
        explain:
          '-u is the UID, -d the home path, -m actually creates the home directory, -s the shell and -G the supplementary group. Lowercase -g is the primary group, so mixing it up with -G makes the answer wrong. Rocky creates the home by default, but in the exam it is safer to add -m to show your intent.',
      },
      'usermod-ag': {
        title: 'Add a supplementary group',
        prompt: 'Add the user lee to the wheel group.',
        conditions: ['lee must not be removed from the supplementary group dev that lee already belongs to'],
        explain:
          'Typing usermod -G wheel lee without -a "replaces" the supplementary groups with wheel alone, so lee leaves dev. This is the spot where points are lost most often in the practical exam. gpasswd -a lee wheel gives the same result.',
      },
      lock: {
        title: 'Lock an account',
        prompt: 'Lock the account of the user kim, who is leaving the company, so that kim cannot log in with a password.',
        conditions: ['Do not delete the account or the home directory'],
        explain:
          'passwd -l locks the account by putting ! in front of the password in /etc/shadow. usermod -L kim does the same. To unlock use passwd -u or usermod -U. You can check the status (LK) with passwd -S kim.',
      },
      'userdel-r': {
        title: 'Delete the home directory too',
        prompt: 'Delete the user park.',
        conditions: ['Also delete park\'s home directory and the files in it'],
        explain:
          'Without -r only the account is removed and /home/park stays behind as an ownerless directory (shown only by its numeric UID). The leftover files would later go to a user created with the same UID, which is a security risk.',
      },
      groupadd: {
        title: 'Create a group with a given GID',
        prompt: 'Create the group ops with GID 3000.',
        conditions: [],
        explain:
          'groupadd -g sets the GID. The result is one added line, ops:x:3000:, in /etc/group (check with grep ops /etc/group).',
      },
      'find-suid': {
        title: 'Save a list of SetUID files',
        prompt: 'Find every file under /var/data that has SetUID set and save the paths to /root/suid.txt.',
        conditions: ['One path per line', 'Exclude directories'],
        explain:
          '-perm -4000 means "if the 4000 bit is on (whatever the rest is)". Without the -, as in -perm 4000, only files whose permissions are exactly 4000 are found, so the result is empty. d, which is 2755, is SetGID and must be left out.',
      },
      'grep-count': {
        title: 'Count the lines that match',
        prompt: 'Save to /root/bash_count.txt the number of accounts in /etc/passwd whose login shell is /bin/bash.',
        conditions: ['Store only the number in the file'],
        explain:
          'grep -c counts the matching lines. grep /bin/bash /etc/passwd | wc -l gives the same. Anchoring the line end with $ counts only lines that have /bin/bash in the shell field. In this state root, kim and park use bash, so the answer is 3.',
      },
      'find-exec': {
        title: 'Delete one user\'s files in one go',
        prompt: 'Delete only the files owned by kim under /tmp/work.',
        conditions: ['Leave files and directories owned by other users in place'],
        explain:
          '-exec command {} \\; runs the command for every file found. The path replaces {} and \\; ends the command. Without -type f, find would also pass directories (such as /tmp/work/sub) to rm, which fails with an error because rm without -r cannot delete a directory. -exec rm {} + batches them into one run.',
      },
    },
  },
};

/** Korean drills with their human text replaced by English. Graders, setup and answers are inherited unchanged. */
export const SHELL_DRILLS_EN: ShellDrill[] = SHELL_DRILLS.map((d) => {
  const t = EN[d.id];
  return {
    ...d,
    code: t.code,
    title: t.title,
    items: d.items.map((it) => ({ ...it, ...t.items[it.id] })),
  };
});

export function shellDrillsFor(lang: 'ko' | 'en' = 'ko'): ShellDrill[] {
  return lang === 'en' ? SHELL_DRILLS_EN : SHELL_DRILLS;
}

/** Raw English text table, exposed for the parity test. */
export const SHELL_DRILL_TEXT_EN = EN;
