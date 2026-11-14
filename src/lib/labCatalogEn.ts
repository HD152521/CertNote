// English edition of the practice-lab catalog (labCatalog.ts). Same ids / kinds / order as the Korean
// catalog; codes are identical except the Korean practical-exam prefix, which is translated to "Practical".
// labCatalogEn.test.ts enforces this. Related-note hrefs point at the English notes
// (/en/<slug>/weekN/dayM). Like labCatalog.ts this file must not import any simulator engine,
// because the sidebar (present on every page) can import it.
import type { LabEntry, LabKind } from './labCatalog';

export const LAB_GROUPS_EN: { kind: LabKind; title: string; description: string }[] = [
  {
    kind: 'linux',
    title: 'Linux Shell',
    description:
      'Type the Linux Master Level 2 topics (file system commands, permissions, users and groups) into a Rocky Linux 8.8 simulator. Output and error messages were compared one by one against what a real Rocky 8.8 prints.',
  },
  {
    kind: 'practical',
    title: 'Linux Master Practical Prep',
    description:
      'Hands-on problems in the style of the Level 1 second-round practical exam: you are given conditions and have to build exactly that. Grading looks at the state after your commands run, not at the characters you typed, so chmod 750 and chmod u=rwx,g=rx,o= are equally correct. The model answer of every problem was verified on a real Rocky 8.8.',
  },
  {
    kind: 'sql',
    title: 'SQL (SQLD)',
    description:
      'Run SQL against the EMP, DEPT and SALGRADE sample tables using the same Oracle syntax the SQLD exam uses. Results and error messages were compared one by one against a real Oracle Database. Tasks are graded by result, not by query text, so any other query that returns the same result is also correct.',
  },
  {
    kind: 'aws',
    title: 'AWS CLI',
    description:
      'Work with Regions, S3 and IAM in a virtual account that imitates AWS CLI v2. The exam does not test command spelling, but the behavior you run into while typing commands (ZoneId, versioning, deleting a user that still has a policy attached) is tested as is.',
  },
];

type LabInfoEn = Omit<LabEntry, 'id' | 'kind' | 'code'>;

const LINUX_EN: Record<string, LabInfoEn> = {
  'linux-perm-basics': {
    title: 'Change permissions with numbers and symbols, and check umask',
    summary:
      'See for yourself how chmod numeric and symbolic modes work, which permissions a new file gets from umask, and how setuid shows up in ls -l.',
    intro: [
      'Permission questions appear in almost every Linux Master Level 2 sitting. Many of them ask you to calculate: "rwxr-x--- as a number", "the permissions of a new directory when umask is 027". Changing permissions by hand once and checking with ls -l keeps you from mixing them up.',
      'This lab starts in /root/perm, which holds two files, report.txt and run.sh. Every time you run a command, you can watch the permission string change in the strip below.',
    ],
    related: [
      { href: '/en/linux-master-2/week4/day1', label: 'The Structure of Permissions: rwx and Octal' },
      { href: '/en/linux-master-2/week4/day2', label: 'Ownership and umask' },
      { href: '/en/linux-master-2/week4/day3', label: 'Special Permissions: SetUID · SetGID · Sticky bit' },
    ],
  },
  'linux-links': {
    title: 'Tell hard links and symbolic links apart',
    summary:
      'Create a hard link and a symbolic link, compare their inode numbers and link counts, then see how the two behave differently once the original is deleted.',
    intro: [
      'It is faster to look at inode numbers yourself than to memorize a diagram of hard links versus symbolic links. A hard link adds one more name to the same inode; a symbolic link is a separate file that holds a path.',
      'This lab starts in /root/links, which has a single file, notes.txt. Pay attention to the first column (inode) and the third column (link count) of ls -li.',
    ],
    related: [
      { href: '/en/linux-master-2/week2/day3', label: 'File Systems: What to Lay Over the Divided Space' },
      { href: '/en/linux-master-2/week3/day2', label: 'Working with Directories and Files' },
    ],
  },
  'linux-users': {
    title: 'Create a user and run into permission denials as that user',
    summary:
      'Create a user with useradd, add a supplementary group with usermod -aG, then become that user with su and run into Permission denied yourself.',
    intro: [
      'If you only practice as root, every permission check passes and it is hard to feel why permissions matter. Create a regular user, switch to it and try to look inside /root, and you see right away what Permission denied blocks.',
      'The difference between usermod -G and -aG, and the fact that userdel needs -r to remove the home directory too, are classic exam traps.',
    ],
    related: [{ href: '/en/linux-master-2/week3/day4', label: 'User and Account Management' }],
  },
  'linux-shared-dir': {
    title: 'Build a team shared directory: setgid and the sticky bit',
    summary:
      "Set setgid on a directory a team shares so files inherit the group, and use the sticky bit so people cannot delete each other's files, switching between two users as you go.",
    intro: [
      'SetGID and the sticky bit are easy to mix up if you only memorize their definitions. In practice you set both for one purpose: "people in the same group share files, but nobody can delete anyone else\'s files".',
      'This lab starts in /srv with two users, kim and lee, in the dev group. Switch users with su and check what works and what is blocked in the same directory.',
    ],
    related: [
      { href: '/en/linux-master-2/week4/day3', label: 'Special Permissions: SetUID · SetGID · Sticky bit' },
      { href: '/en/linux-master-2/week4/day5', label: 'Week 4 Review: Permissions on One Page' },
    ],
  },
  'linux-find': {
    title: 'Find matching files with find and process them in one go',
    summary:
      'Find files by name, permission and owner with find, and delete everything found at once with -exec. You also check the difference between -perm 4000, -4000 and /4000.',
    intro: [
      'find looks like it has a lot of options, but you can read it as three chunks: "where (path) + what (conditions) + how (action)". The exam often asks security-audit questions such as finding setuid files (-perm -4000) or files with no owner (-nouser).',
      'This lab starts in /root/find/data, which mixes log files, temporary files and a config file with setuid set. In the last step, check that the temporary files in the strip below disappear.',
    ],
    related: [
      { href: '/en/linux-master-2/week3/day3', label: 'Viewing and Finding Contents' },
      { href: '/en/linux-master-2/week4/day3', label: 'Special Permissions: SetUID · SetGID · Sticky bit' },
    ],
  },
  'linux-grep-pipe': {
    title: 'Read /etc/passwd with grep and pipes',
    summary:
      'Pick through /etc/passwd with grep and learn the -c, -v and -n options, the ^ regular expression, and counting by piping into wc.',
    intro: [
      '/etc/passwd is a text file with one account per line, which makes it the best material for practicing grep. You can prepare for account-management questions and grep questions at the same time.',
      'This lab starts with two regular users, kim and lee. The numbers in the results follow the default account count of a real Rocky Linux 8.8.',
    ],
    related: [
      { href: '/en/linux-master-2/week3/day3', label: 'Viewing and Finding Contents' },
      { href: '/en/linux-master-2/week5/day4', label: 'Redirection · Aliases · History' },
      { href: '/en/linux-master-2/week3/day4', label: 'User and Account Management' },
    ],
  },
  'linux-ownership': {
    title: 'Hand over project ownership with chown and chgrp',
    summary:
      'Hand over the owner and group of files and a whole directory tree (-R) with chown, change only the group with chgrp, then confirm that a regular user cannot give ownership away.',
    intro: [
      'chown kim:dev, chown :dev and chgrp dev all change ownership, but they change different fields. The exam mixes these forms into the answer choices and also asks "can a regular user do this?".',
      'This lab starts in /srv/proj, created by root. In the strip below you can watch the owner:group of each item change.',
    ],
    related: [
      { href: '/en/linux-master-2/week4/day2', label: 'Ownership and umask' },
      { href: '/en/linux-master-2/week4/day5', label: 'Week 4 Review: Permissions on One Page' },
    ],
  },
};

const PRACTICAL_EN: Record<string, LabInfoEn> = {
  'linux-practical-perm': {
    title: '7 practical problems on permissions and ownership',
    summary:
      'Seven problems where you build exactly what the conditions ask for: numeric and symbolic permissions, mkdir -m, umask, SetUID, a SetGID shared directory, the sticky bit and chown -R.',
    intro: [
      'The Linux Master Level 1 second round is scored 40% written (short answer and descriptive) and 60% hands-on practical. Practical tasks demand a result ("configure it so that these conditions hold"), so what decides your score is not whether you memorized the commands but whether you can produce the result exactly.',
      'Each problem has its own starting state, and every time you run a command it is graded immediately against all the conditions. Any other command that produces the same result is accepted as well. If you get stuck, open the model answer and explanation.',
    ],
    related: [
      { href: '/en/linux-master-2/week4/day1', label: 'The Structure of Permissions: rwx and Octal' },
      { href: '/en/linux-master-2/week4/day2', label: 'Ownership and umask' },
      { href: '/en/linux-master-2/week4/day3', label: 'Special Permissions: SetUID · SetGID · Sticky bit' },
    ],
  },
  'linux-practical-users': {
    title: '8 practical problems on accounts and search',
    summary:
      'Eight problems where you carry out the conditions as stated: useradd option combinations, usermod -aG, locking an account, userdel -r, groupadd -g, find -perm and -exec, and grep -c.',
    intro: [
      'Account management and file search are areas where practical exams often lose points. Typical slips are dropping -a from usermod -G so the existing groups disappear, or dropping the - from find -perm 4000 so the result comes back empty.',
      'This set is built so that making such mistakes is caught by the grader. When you get one wrong, check why with the terminal output (id, ls -l, cat).',
    ],
    related: [
      { href: '/en/linux-master-2/week3/day4', label: 'User and Account Management' },
      { href: '/en/linux-master-2/week4/day3', label: 'Special Permissions: SetUID · SetGID · Sticky bit' },
    ],
  },
};

const SQL_EN: Record<string, LabInfoEn> = {
  'sql-select-basics': {
    title: 'Pick the rows you want with SELECT, functions and WHERE',
    summary:
      'Eight tasks solved by running them against the EMP table: salary arithmetic with NULLs, DISTINCT, LIKE, BETWEEN and IN, IS NULL, string and date functions, and CASE.',
    intro: [
      'SQLD Subject 2 has many questions of the form "what is the result of this SQL?". If you only picture the result in your head, it is easy to fall into traps such as arithmetic with NULL or = NULL, so running it yourself once is the safer way.',
      'For each task, write a SELECT that meets the condition and run it, and it is graded immediately. If the result is the same, different aliases or different functions are still correct; if it is wrong, you are told whether the row count differs, the values differ, or only the order differs.',
    ],
    related: [
      { href: '/en/sqld/week3/day1', label: 'Relational Databases and SELECT' },
      { href: '/en/sqld/week3/day4', label: 'NULL Functions and CASE·DECODE' },
      { href: '/en/sqld/week3/day5', label: 'The WHERE Clause' },
    ],
  },
  'sql-group-join': {
    title: 'Group and connect with GROUP BY, HAVING and joins',
    summary:
      'Eight tasks solved by running them: GROUP BY and HAVING, aggregates and NULL, EQUI and Non-EQUI joins, the COUNT(*) trap in outer joins, and self joins.',
    intro: [
      'GROUP BY and joins often appear in SQLD as questions that make you work out the number of result rows and their values. Seeing the result table yourself makes it stick: why COUNT(*) and COUNT(column) differ in an outer join, and where HAVING and WHERE part ways.',
      'Whether you write the Oracle-style (+) join or an ANSI JOIN, it is correct as long as the result is the same. When an error occurs, you get the same ORA number and message as a real Oracle.',
    ],
    related: [
      { href: '/en/sqld/week4/day1', label: 'GROUP BY and Aggregate Functions' },
      { href: '/en/sqld/week4/day4', label: 'Joins (EQUI, Non-EQUI, (+))' },
      { href: '/en/sqld/week4/day5', label: 'Standard Joins (ANSI)' },
    ],
  },
  'sql-subquery-rollup': {
    title: 'Ask and aggregate in one query with subqueries, set operators and ROLLUP',
    summary:
      'Seven tasks solved by running them: single-row, multi-column and correlated subqueries, the NOT IN and NULL trap, UNION, ROLLUP subtotals and grand totals, and telling subtotal rows apart with GROUPING.',
    intro: [
      'With subqueries and ROLLUP, counting in your head how many result rows there are and which values appear is easy to get wrong. Many behaviors, like the trap where a NULL in NOT IN makes the result 0 rows, click at once when you run them yourself.',
      'If the result is the same, writing a join or EXISTS instead of a subquery is also correct. ROLLUP subtotal rows show up as NULL, so also check where NULL goes when you match the ordering.',
    ],
    related: [
      { href: '/en/sqld/week5/day1', label: 'Subquery Basics' },
      { href: '/en/sqld/week5/day4', label: 'Group Functions ROLLUP and CUBE' },
      { href: '/en/sqld/week5/day5', label: 'GROUPING SETS and the GROUPING Function' },
    ],
  },
  'sql-window-hierarchy': {
    title: 'Rank with window functions, Top-N and hierarchical queries, and unfold the tree',
    summary:
      'Seven tasks solved by running them: DENSE_RANK and ROW_NUMBER rankings, picking the top of each department, running totals, LAG, the top 3 (ROWNUM and FETCH FIRST), and CONNECT BY org charts and reporting lines.',
    intro: [
      'The difference between window functions and hierarchical queries is obvious once you look at the result table yourself. How RANK and DENSE_RANK split on ties, and which side PRIOR goes on to make the tree unfold upside down, are laid bare in the result.',
      'Window functions cannot be used directly in WHERE, so the lab also includes practice wrapping them in an inline view. If the result is the same, either ROWNUM or FETCH FIRST is correct.',
    ],
    related: [
      { href: '/en/sqld/week6/day1', label: 'Ranking Functions' },
      { href: '/en/sqld/week6/day3', label: 'Top-N Queries' },
      { href: '/en/sqld/week6/day4', label: 'Hierarchical Queries' },
    ],
  },
  'sql-pivot-dml': {
    title: 'Reshape and change data with PIVOT, regular expressions, DML and transactions',
    summary:
      'Eight tasks solved by running them: PIVOT, REGEXP_COUNT and masking names, INSERT, UPDATE and DELETE (foreign key order), undoing part of the work with SAVEPOINT, and creating a table with constraints.',
    intro: [
      'With DML and transactions, the answer is the state of the data after the statements run. In these tasks, your statement is executed, a check query then reads the table contents, and they are compared with the contents after running the model answer.',
      'The sample tables go back to their initial state every time you run, so feel free to delete and change anything. If you delete in the wrong order because of a foreign key, you get the same ORA-02292 as Oracle, and only that statement is cancelled.',
    ],
    related: [
      { href: '/en/sqld/week7/day1', label: 'The PIVOT and UNPIVOT Clauses' },
      { href: '/en/sqld/week7/day3', label: 'Data Manipulation Language, DML (INSERT·UPDATE·DELETE·MERGE)' },
      { href: '/en/sqld/week7/day4', label: 'Transaction Control Language, TCL (COMMIT·ROLLBACK·SAVEPOINT)' },
    ],
  },
};

const AWS_EN: Record<string, LabInfoEn> = {
  'regions-azs': {
    title: 'Map out Regions and Availability Zones',
    summary:
      'List Regions and Availability Zones, pull out ZoneName and ZoneId with --query, and confirm that the "a" in a name can be a different AZ in different accounts.',
    intro: [
      'An Availability Zone name (ap-northeast-2a) is mapped to a different physical data center in each account, while the ZoneId (apne2-az1) is the same in every account. Questions about placing resources in the same AZ as another account test exactly this difference.',
      'You also build the habit of checking who you are right now with sts get-caller-identity.',
    ],
    related: [{ href: '/en/saa-c03/week1/day1', label: 'The Map of AWS Infrastructure: Regions, AZs, and Shared Responsibility' }],
  },
  's3-first-bucket': {
    title: 'Create your first bucket in the Seoul Region',
    summary:
      'Run into the error that shows why LocationConstraint is needed when creating a bucket in the Seoul Region, then turn on versioning and upload a file.',
    intro: [
      'Running s3api create-bucket in any Region other than us-east-1 without extra arguments fails. Reading the error message and fixing it shows you the Region concept of S3 directly.',
      'You confirm for yourself that versioning, once enabled, can only be suspended and never turned off, and that S3 has no folders, only key names.',
    ],
    related: [{ href: '/en/saa-c03/week4/day1', label: 'S3: The Internal Architecture of Object Storage' }],
  },
  'iam-least-privilege': {
    title: 'Create a read-only user and clean up',
    summary:
      'Create an IAM user and attach ReadOnlyAccess, then see from the error that a user with a policy attached cannot be deleted right away.',
    intro: [
      'A new IAM user has no permissions at all (implicit deny); permissions only exist once you attach a policy. Here you also learn that the account-ID slot in a managed policy ARN is aws.',
      'In the cleanup step you read why delete-user fails and go through the order of detaching first.',
    ],
    related: [{ href: '/en/saa-c03/week1/day2', label: 'IAM Fundamentals: Who Gets to Do What' }],
  },
};

const INFO_EN: Record<LabKind, Record<string, LabInfoEn>> = {
  linux: LINUX_EN,
  practical: PRACTICAL_EN,
  sql: SQL_EN,
  aws: AWS_EN,
};

// [kind, id, code] in the same order as the Korean LAB_CATALOG.
const LAB_KEYS: ReadonlyArray<readonly [LabKind, string, string]> = [
  ['linux', 'linux-perm-basics', 'LAB L1'],
  ['linux', 'linux-links', 'LAB L2'],
  ['linux', 'linux-users', 'LAB L3'],
  ['linux', 'linux-shared-dir', 'LAB L4'],
  ['linux', 'linux-find', 'LAB L5'],
  ['linux', 'linux-grep-pipe', 'LAB L6'],
  ['linux', 'linux-ownership', 'LAB L7'],
  ['practical', 'linux-practical-perm', 'Practical P1'],
  ['practical', 'linux-practical-users', 'Practical P2'],
  ['sql', 'sql-select-basics', 'SQL S1'],
  ['sql', 'sql-group-join', 'SQL S2'],
  ['sql', 'sql-subquery-rollup', 'SQL S3'],
  ['sql', 'sql-window-hierarchy', 'SQL S4'],
  ['sql', 'sql-pivot-dml', 'SQL S5'],
  ['aws', 'regions-azs', 'LAB 01'],
  ['aws', 's3-first-bucket', 'LAB 02'],
  ['aws', 'iam-least-privilege', 'LAB 03'],
];

export const LAB_CATALOG_EN: LabEntry[] = LAB_KEYS.map(([kind, id, code]) => ({
  id,
  kind,
  code,
  ...INFO_EN[kind][id],
}));
