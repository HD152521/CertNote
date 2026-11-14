// English text for the shell practice labs. Only human-readable text is translated; ids, order, setup commands,
// answers and graders (isDone) are inherited unchanged from the Korean definitions in labs.ts, so grading
// can never drift between languages.
import { SHELL_LABS, type ShellLab } from './labs';

interface StepText {
  title: string;
  task: string;
  hint: string;
  takeaway: string;
}
interface LabText {
  topic: string;
  title: string;
  source: string;
  steps: Record<string, StepText>;
}

const EN: Record<string, LabText> = {
  'linux-perm-basics': {
    topic: 'Permissions',
    title: 'Change permissions with numbers and symbols, and check umask',
    source: 'Linux Master Level 2 · File system commands, permissions and groups',
    steps: {
      octal: {
        title: 'Numeric mode: rwxr-xr--',
        task: 'Set the permissions of report.txt to rwx for the owner, r-x for the group and r-- for others. Then check the result with ls -l.',
        hint: 'Add up r=4, w=2, x=1. Owner 7, group 5, others 4.',
        takeaway:
          'Numeric mode overwrites all three digits at once. 754 → rwxr-xr--. The exam may ask the reverse, such as "write -rwxr-x--- as a number" (750).',
      },
      symbolic: {
        title: 'Symbolic mode: remove owner execute, add group write',
        task: "Using symbolic mode instead of numbers, remove the owner's execute permission and add write permission for the group on report.txt.",
        hint: 'Who (u, g, o, a) + operator (+ - =) + permission (r w x). Join two changes with a comma.',
        takeaway:
          'Symbolic mode changes only the bits you name and leaves the rest alone. Applying u-x,g+w to 754 gives 674 (rw-rwxr--).',
      },
      umask: {
        title: 'Create files under umask 027',
        task: 'Set umask to 027, create one new file and one new directory, then check their permissions with ls -l.',
        hint: 'umask 027 → touch newfile → mkdir newdir → ls -l',
        takeaway:
          'New files start from 666 and directories from 777, minus the umask. With 027 a file gets 640 (rw-r-----) and a directory 750 (rwxr-x---). Files never get the execute bit by default.',
      },
      setuid: {
        title: 'Reading special permissions',
        task: 'Add setuid to run.sh (4755) and check with ls -l how the owner execute column looks.',
        hint: 'Special permissions are the leading digit: setuid 4, setgid 2, sticky 1.',
        takeaway:
          'The owner execute column shows s (rwsr-xr-x). If setuid is set without execute permission it shows a capital S. /usr/bin/passwd is the classic setuid file.',
      },
    },
  },
  'linux-links': {
    topic: 'Links',
    title: 'Tell hard links and symbolic links apart',
    source: 'Linux Master Level 2 · File system commands',
    steps: {
      hard: {
        title: 'Create a hard link',
        task: 'Create a hard link named hard.txt to notes.txt.',
        hint: 'ln <original> <link name>',
        takeaway: 'A hard link adds another name to the same inode, so the link count in ls -l goes from 1 to 2.',
      },
      soft: {
        title: 'Create a symbolic link',
        task: 'Create a symbolic link named soft.txt that points to notes.txt.',
        hint: 'ln with the -s option',
        takeaway:
          'A symbolic link is a separate file that holds the original "path". Its permissions always show as lrwxrwxrwx and its size is the number of characters in the path (9).',
      },
      inode: {
        title: 'Compare inode numbers',
        task: 'List the directory so that inode numbers are shown. Which two names share the same number?',
        hint: 'Add -i to ls. Combined with -l it also shows the link count.',
        takeaway:
          'notes.txt and hard.txt have the same inode and soft.txt has a different one. A hard link cannot cross file systems or point to a directory.',
      },
      delete: {
        title: 'What if the original is deleted?',
        task: 'Delete notes.txt, then read hard.txt and soft.txt with cat one after the other.',
        hint: 'rm notes.txt → cat hard.txt → cat soft.txt',
        takeaway:
          'The hard link keeps the content. The symbolic link loses the path it pointed to and fails with "No such file or directory" (a broken link).',
      },
    },
  },
  'linux-users': {
    topic: 'Users',
    title: 'Create a user and run into permission denials as that user',
    source: 'Linux Master Level 2 · Users, groups and permissions',
    steps: {
      useradd: {
        title: 'Create a user',
        task: 'Create a regular user kim with a home directory and check it with id.',
        hint: 'useradd -m <name> → id <name>',
        takeaway:
          'Rocky also creates a group with the same name when it creates a user (USERGROUPS_ENAB). The first regular user gets UID and GID 1000.',
      },
      group: {
        title: 'Add a supplementary group',
        task: "Create a group dev and add it to kim as a supplementary group while keeping kim's existing groups.",
        hint: 'groupadd dev → usermod -aG dev kim. Using -G without -a erases the existing supplementary groups.',
        takeaway: 'usermod -G "overwrites" the supplementary group list and -aG "adds" to it. A favorite exam trap.',
      },
      denied: {
        title: 'Switch to kim and look into /root',
        task: 'Become kim with su, then list /root. What happens?',
        hint: 'su - kim → whoami → ls /root',
        takeaway:
          '/root is dr-xr-x--- (550), so others have no read or execute permission. root is exempt from permission checks but regular users are not.',
      },
      cleanup: {
        title: 'Return to root and clean up',
        task: 'Go back to root with exit, then delete kim together with the home directory.',
        hint: 'exit → userdel -r kim',
        takeaway: 'Plain userdel leaves /home/kim behind. You need -r to remove the home and the mail spool (/var/spool/mail/kim) too.',
      },
    },
  },
  'linux-shared-dir': {
    topic: 'Special permissions',
    title: 'Build a team shared directory: setgid and the sticky bit',
    source: 'Linux Master Level 2 · Special permissions (SetGID, Sticky bit)',
    steps: {
      group: {
        title: 'Give the shared directory to the dev group',
        task: 'Create a share directory under /srv and change its group owner to dev. (kim and lee are already in dev.)',
        hint: 'mkdir share → chgrp dev share',
        takeaway: 'chgrp changes only the group while chown changes the owner (and group). chown :dev share gives the same result.',
      },
      setgid: {
        title: 'Inherit the group with setgid',
        task: "Give share group write permission together with setgid (rwxrwsr-x). Then switch to kim, create a file inside share and check the file's group.",
        hint: 'setgid is the leading digit 2 → chmod 2775 share. Switch user with su kim and come back with exit.',
        takeaway:
          "A file created inside a setgid directory inherits the directory's group (dev), not the creator's primary group (kim). The group execute column shows s.",
      },
      sticky: {
        title: 'Stop others from deleting your files with the sticky bit',
        task: 'Return to root and add the sticky bit to share. Then switch to lee and try to delete the file kim created.',
        hint: 'chmod +t share → su lee → rm -f share/<file kim created>',
        takeaway:
          "With the sticky bit (t), you cannot delete other people's files even if you have write permission on the directory (Operation not permitted). That is why /tmp is drwxrwxrwt.",
      },
      own: {
        title: 'You can still delete your own files',
        task: "Still as lee, create a file of lee's in share and then delete it.",
        hint: 'touch share/lee.txt → rm share/lee.txt',
        takeaway:
          'The sticky bit blocks only other people\'s files. The file owner, the directory owner and root can delete. Shared directories are usually 3775, which is 2775 plus t.',
      },
    },
  },
  'linux-find': {
    topic: 'find',
    title: 'Find matching files with find and process them in one go',
    source: 'Linux Master Level 2 · Viewing and searching content',
    steps: {
      name: {
        title: 'Find by name',
        task: 'Find every file under data whose name ends in .log.',
        hint: "find <where> -name '<pattern>'. Quote the pattern so the shell does not expand it first.",
        takeaway:
          "-name is case sensitive (-iname is not). If you leave '*.log' unquoted and the current directory has .log files, the shell expands it first and you get odd results.",
      },
      perm: {
        title: 'Find files with setuid',
        task: 'Find files under data that have the setuid bit set. This is a common command in security audits.',
        hint: '-perm -4000: files that "include" the setuid bit. The leading - means "if all of these bits are set".',
        takeaway:
          '-perm 4000 matches permissions of exactly 4000, -perm -4000 matches files that include the 4000 bit, and -perm /4000 matches files that share any bit. The exam asks about all three.',
      },
      user: {
        title: 'Find by owner',
        task: 'Find files under data that are owned by kim.',
        hint: 'find data -user <user>',
        takeaway: '-user and -group also accept numbers (UID, GID) instead of names. Files of deleted users are found with -nouser.',
      },
      exec: {
        title: 'Find and delete in one go',
        task: 'Find and delete every .tmp file under data with a single find command.',
        hint: '-exec <command> {} \\; — the found path replaces {}, and \\; marks the end of the command.',
        takeaway:
          '-exec ... \\; runs the command once per file, while -exec ... {} + batches the files into one run. Watch the strip below to see tmp become empty.',
      },
    },
  },
  'linux-grep-pipe': {
    topic: 'grep · pipe',
    title: 'Read /etc/passwd with grep and pipes',
    source: 'Linux Master Level 2 · Viewing and searching content, redirection',
    steps: {
      bash: {
        title: 'Accounts that use bash',
        task: 'Print only the lines of /etc/passwd whose login shell is bash.',
        hint: 'grep <what to find> <file>',
        takeaway:
          'The seven fields of /etc/passwd are name:x:UID:GID:comment:home:shell. If the last field is /sbin/nologin the account is a system account that cannot log in.',
      },
      count: {
        title: 'Count accounts that cannot log in',
        task: 'Print, as a single number, how many lines contain nologin.',
        hint: 'grep -c counts the matching lines.',
        takeaway: '-c prints only the line count, -n adds line numbers, -v shows only the non-matching lines and -i ignores case.',
      },
      pipe: {
        title: 'Chain commands with a pipe',
        task: 'Conversely, select the lines that do "not" contain nologin and count them with wc. Join the two commands with |.',
        hint: 'Select with grep -v, then | wc -l',
        takeaway:
          'A pipe (|) passes the output of the first command to the input of the next. wc -l counts lines, -w words and -c bytes.',
      },
      anchor: {
        title: 'Match only at the start of a line',
        task: 'Print only the lines of /etc/passwd that start with kim, together with their line numbers.',
        hint: 'In a regular expression ^ is the start of the line. Add line numbers with -n.',
        takeaway: '^ is the start of a line and $ is the end. ^root picks lines that start with root and bash$ picks lines that end with bash.',
      },
    },
  },
  'linux-ownership': {
    topic: 'Ownership',
    title: 'Hand over project ownership with chown and chgrp',
    source: 'Linux Master Level 2 · Ownership and umask',
    steps: {
      chown: {
        title: 'Change the owner of one file',
        task: 'Change the owner of proj/README to kim.',
        hint: 'chown <user> <file>',
        takeaway: 'If you change only the owner, the group stays (root). In ls -l the third column is the owner and the fourth is the group.',
      },
      recursive: {
        title: 'Hand over a whole directory',
        task: 'Change the proj directory and everything inside it to owner kim and group dev in one command.',
        hint: 'chown with -R (recursive) and the user:group form',
        takeaway:
          'Without -R only the directory itself changes and its contents stay as they are. user.group also works in place of user:group, but : is the standard.',
      },
      chgrp: {
        title: 'Change only the group',
        task: 'Change only the group of proj/src/main.c back to root. Leave the owner (kim) alone.',
        hint: 'chgrp <group> <file>',
        takeaway: 'chgrp root file is the same as chown :root file. The exam mixes the two forms in its choices.',
      },
      denied: {
        title: 'A regular user cannot give a file away',
        task: "Switch to kim, then try to hand proj/README, which is kim's file, over to root.",
        hint: 'su kim → chown root proj/README',
        takeaway:
          'Only root can change the owner. You cannot give away even your own file (Operation not permitted). The group can only be changed to a group you belong to.',
      },
    },
  },
};

/** Korean labs with their human text replaced by English. Graders, setup, answers and ids are inherited unchanged. */
export const SHELL_LABS_EN: ShellLab[] = SHELL_LABS.map((lab) => {
  const t = EN[lab.id];
  return {
    ...lab,
    topic: t.topic,
    title: t.title,
    source: t.source,
    steps: lab.steps.map((s) => ({ ...s, ...t.steps[s.id] })),
  };
});

export function shellLabsFor(lang: 'ko' | 'en' = 'ko'): ShellLab[] {
  return lang === 'en' ? SHELL_LABS_EN : SHELL_LABS;
}

/** Raw English text table, exposed for the parity test. */
export const SHELL_LAB_TEXT_EN = EN;
