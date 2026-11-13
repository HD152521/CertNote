# Day 5 - Final Wrong-Answer and Flashcard Roundup and Exam-Day Strategy (Wrapping Up the 70 Days)

## 📌 Key Points

- On the last day we add no new material. All that remains are the **flashcards to review right before the exam** and the **exam-day time and mindset strategy**.
- What decides a pass is not the questions you don't know, but **not getting wrong the questions you do know through carelessness**.
- Once the exam starts, **write the port table, signals, and runlevels in the margin first** and then solve the questions. You get them out before nerves blur your memory.
- Use your time in **2 passes** — one quick lap through what you know, then focus on the starred questions. Don't hang on a single question for more than 1 minute.
- Three kinds of traps: underline **negative question stems** ("Which is NOT correct"), be suspicious of **extreme wording** ("always," "must," "never"), and **short answers in the secondary exam must have exact spelling and options**.
- A shifted answer sheet throws away the whole pass. Check the numbers against the marking every 5 questions, and recheck everything before submitting.

## Flashcard 1: The Port Table You Must Never Get Wrong

- These are the key ports worth writing in the margin of the exam paper right after the exam starts.

| Port | Service | Port | Service |
|------|--------|------|--------|
| 20/21 | FTP | 110 | POP3 |
| 22 | SSH | 123 | NTP |
| 23 | Telnet | 143 | IMAP |
| 25 | SMTP | 443 | HTTPS |
| 53 | DNS | 514 | Syslog |
| 80 | HTTP | 111 | rpcbind (NFS) |

**Using the margin**: When the exam starts, you may be shaking and unable to remember. If you **write the port table, signals, and runlevels in the margin first** and then solve the questions, you make fewer mistakes.

## Flashcard 2: Signals and Runlevels

| Signal | Name | Meaning |
|--------|------|------|
| 1 | SIGHUP | Reload configuration |
| 2 | SIGINT | Ctrl+C |
| 9 | SIGKILL | Forced termination (cannot be ignored) |
| 15 | SIGTERM | Graceful termination (default) |

| Runlevel | Target | Meaning |
|--------|------|------|
| 0 | poweroff | Shutdown |
| 1 | rescue | Single-user |
| 3 | multi-user | Text multi-user |
| 5 | graphical | GUI multi-user |
| 6 | reboot | Reboot |

## Flashcard 3: Quick Table of Permissions and Special Permissions

| Permission | Number | Permission | Number |
|------|------|------|------|
| r (read) | 4 | SetUID | 4000 |
| w (write) | 2 | SetGID | 2000 |
| x (execute) | 1 | Sticky | 1000 |

- umask is subtracted from 666 for files and 777 for directories. `umask 022` → files 644, directories 755.

> ⚠️ **Easily confused pairs**: SetUID (4000) = owner privileges, SetGID (2000) = group privileges and directory inheritance, Sticky (1000) = deletion restriction as in `/tmp`. The number and the meaning pair up.

## Flashcard 4: Configuration File Path Collection

| File | Purpose |
|------|------|
| `/etc/passwd` | Account information |
| `/etc/shadow` | Encrypted passwords |
| `/etc/group` | Group information |
| `/etc/fstab` | Mount information |
| `/etc/resolv.conf` | DNS servers |
| `/etc/hosts` | Local host mappings |
| `/etc/ssh/sshd_config` | SSH server |
| `/etc/crontab` | System cron |
| `/var/log/messages` | General system log |
| `/var/log/secure` | Authentication and security log |

**The 7 passwd fields**: username:password(x):UID:GID:description:home:shell. The `x` in the password field indicates that the actual password is in `/etc/shadow`.

## Flashcard 5: Confusing Command Pairs Roundup

| Category | A | B |
|------|---|---|
| Usage | `df` (filesystem) | `du` (directory) |
| Package | `rpm` (manual dependencies) | `yum` (automatic resolution) |
| Service | `start` (now) | `enable` (at boot) |
| Mail | `POP3` (downloads) | `IMAP` (synchronizes) |
| FTP | Active (server→client) | Passive (client→server) |
| Permission display | `s` (x present) | `S` (x absent) |

These 6 pairs take the form of asking "which of the two is it?" You only need to firmly grasp one key word for each difference.

## Exam-Day Strategy 1: Time Allocation

- The primary written exam has a fixed number of questions per subject.
- **Don't hang on questions you don't know** — spend no more than 1 minute on a question; star it and move on.
- After one lap through everything, return to the starred questions.

**2-pass strategy**: 1st pass (quickly through what you know) → 2nd pass (focus on starred ones). It prevents the worst case of running out of time under pressure without solving the questions you do know.

## Exam-Day Strategy 2: Avoiding Traps and Mindset

- **Beware negative question stems**: Underline "Which is NOT correct?" and "Which is not...?" The most common mistake is misreading them as positive and flipping the answer.
- **Be suspicious of extreme wording**: Choices containing "always," "must," or "never" are likely to be wrong.
- **Secondary practical exam spelling**: For short answers, spelling and options must be exact. Writing `useradd` as `usradd` gets zero points. Practice by writing by hand regularly.

> ⚠️ **Check your marking**: A shifted answer sheet throws away the whole pass. Check the numbers against the marking every 5 questions, and recheck everything before submitting.

You have completed all 70 days, from the Linux history of Week 1 to today's exam strategy. What you need now is not new knowledge but **calm and a final check**. Skim the flashcards once the day before the exam and once before entering the room, and take the exam with the 2-pass approach.

## 📖 Glossary

- **Flashcard** : The smallest-unit summary to pull out right before and right after the exam starts. Ports, signals, runlevels, and permission numbers are the core.
- **rpcbind (111)** : The port mapper that tells you the ports of RPC services. It must be running for NFS to work.
- **SIGKILL (9)** : A forced-termination signal that a process cannot ignore. The default for `kill` is SIGTERM (15).
- **Runlevel ↔ target** : The correspondence between the old SysV system-state numbers and systemd units. 3 = multi-user, 5 = graphical.
- **SetUID / SetGID / Sticky** : Run with owner privileges (4000) / group privileges and inheritance (2000) / delete only your own files (1000).
- **Lowercase s vs uppercase S** : The normal state where the execute permission (x) is also present / the conflict state where only the special bit is on without x.
- **df vs du** : Usage per filesystem / usage per directory or file. People often make the mistake of memorizing the roles swapped.
- **Automatic dependency resolution** : The property by which `yum` and `apt` fetch the needed packages from the repository along with it. `rpm` and `dpkg` lack it.
- **2-pass strategy** : A time allocation method of making a quick lap through the questions you know first, then solving again only the questions you marked.
- **Negative question stem** : A question that makes you pick the wrong choice, like "Which is NOT correct?" Underline it to prevent misreading.
- **Shifted answer sheet** : An accident where question numbers and marking positions get misaligned. Prevent it with periodic checks and a recheck before submitting.

## 📝 Practice Questions

**Question 1.** Which is the correct field layout of the `/etc/passwd` file?

A) username:UID:GID:password:home:shell:description
B) username:password:UID:GID:description:home:shell
C) username:password:GID:UID:home:shell:description
D) UID:username:password:GID:description:shell:home

**Answer: B**
Explanation: The 7 passwd fields are, in order, username:password(x):UID:GID:description(GECOS):home directory:login shell. The x in the password field means the actual hash is in shadow.

---

**Question 2.** Which option correctly pairs the command that checks usage of the whole disk's filesystems with the command that checks usage of a specific directory?

A) `du` - `df`
B) `df` - `du`
C) `df` - `fsck`
D) `du` - `mount`

**Answer: B**
Explanation: `df` shows overall usage per filesystem, and `du` shows usage per directory/file. People often make the mistake of memorizing the roles swapped.

---

**Question 3.** What is the most appropriate response when you encounter a negative question stem like "Which is NOT correct?" on the exam?

A) Quickly pick one correct choice and answer
B) Underline the stem and look for the wrong choice
C) Choose the longest choice as the answer
D) Review the first choice first

**Answer: B**
Explanation: Negative stems are easy to misread as positive, so underline the stem and look for the "wrong" choice. The most common mistake is picking the correct one and being marked wrong.

---

**Question 4.** What character appears in the permission display when SetUID is set on a file that has no execute permission (x)?

A) Lowercase `s`
B) Uppercase `S`
C) Lowercase `t`
D) Uppercase `T`

**Answer: B**
Explanation: With execute permission it shows lowercase `s`, and without it uppercase `S` (indicating a permission conflict). For Sticky as well, it is `t` if x is present and `T` if not.

---

**Question 5.** Which tool cannot resolve dependencies automatically during package installation and only outputs an error if any are missing?

A) `yum`
B) `dnf`
C) `rpm`
D) `apt`

**Answer: C**
Explanation: `rpm` (and dpkg) are low-level tools and cannot resolve dependencies automatically. `yum`/`dnf`/`apt` fetch and resolve dependent packages from the repository automatically.

---

**Question 6.** Which is the most appropriate recommended action right after the exam starts?

A) Solve the questions that look hardest first
B) Write memorized material such as ports, signals, and runlevels in the margin first
C) Read all the questions closely and then solve from the beginning
D) Solve in reverse order, starting from the last question

**Answer: B**
Explanation: If you write the key memorization tables in the margin before nerves blur your memory, you can refer to them while solving and reduce mistakes. Fixating on hard questions leads to lost time.

---

**Question 7.** Which option correctly distinguishes the command that 'starts a service now' from the command that 'starts it automatically at boot'?

A) `start` - automatic at boot / `enable` - start now
B) `start` - start now / `enable` - automatic at boot
C) Both start it now
D) Both start it only at boot

**Answer: B**
Explanation: `systemctl start` starts it immediately, and `systemctl enable` sets it to start automatically at boot. They are independent, so if you need both, use `enable --now`.

---

**Question 8.** What is the most important point to watch out for in the secondary practical short-answer exam?

A) As long as the meaning of the command is right, spelling can be wrong
B) You must write the spelling of commands and options exactly
C) Listing several commands earns partial credit
D) It is multiple choice, so guessing is fine

**Answer: B**
Explanation: In the secondary practical short-answer exam, an answer is accepted only if the spelling and options are exact. Typos such as writing `useradd` as `usradd` get zero points, so practicing writing exactly by hand is important.

---

**Question 9.** What is the general tendency when a choice contains extreme wording such as "always," "must," or "never"?

A) It is very likely to be correct
B) It is relatively likely to be wrong
C) It has nothing to do with correctness
D) It is always correct

**Answer: B**
Explanation: Extreme absolute statements easily become false because of exceptional cases, so they are relatively likely to be wrong. However, it is not an absolute rule, so you should judge by the content itself.

---

**Question 10.** What is the most effective way to prevent a shifted answer sheet (marking error) while filling in answers?

A) Mark everything at once after solving all the questions
B) Check the numbers against the marking every set number of questions and recheck everything before submitting
C) Leave confusing questions blank and fill them in later
D) Do the marking if time remains

**Answer: B**
Explanation: If you check the numbers against the marking periodically, such as every 5 questions, and recheck everything before submitting, you can prevent the accident of losing the pass to a shifted answer sheet. Marking everything in one batch carries the greatest risk of shifting.

---
