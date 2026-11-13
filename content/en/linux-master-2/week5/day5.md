# Day 5 - Week 5 Comprehensive Review: The Shell on One Page

## 📌 Key Points

- There are only two families of shells: the **Bourne family (sh, ksh, bash, zsh, dash)** and the **C family (csh, tcsh)**. **Only the two with a c in their name are C family.**
- **A shell variable reaches only the current shell; an environment variable reaches children.** The promotion command is **`export`**.
- **A login shell reads `.bash_profile`, and a non-login shell reads `.bashrc`.**
- **`>` overwrites and `>>` appends**, and **errors use channel 2**.
- To apply settings immediately use **`source`**, and to remove an alias use **`unalias`**.

## The Shell on One Page

```text
   Shell families
     Bourne family   sh(Bourne) · ksh(Korn) · bash(Fox) · zsh · dash
     C family        csh(Joy) · tcsh                    ← only these two!

   Variables
     NAME=value          shell variable        → check with set   (up to the current shell)
     export NAME=value   environment variable  → check with env   (down to children)

   Configuration files
     Login       /etc/profile  →  ~/.bash_profile  →  (calls ~/.bashrc)
     Non-login                    ~/.bashrc
     Logout                       ~/.bash_logout
     Apply now   source file   or   . file

   Input/output
     0 stdin      <
     1 stdout     >   >>          &>  both
     2 stderr     2>  2>>         2> /dev/null  discard
     Pipe         command | command

   Convenience
     alias / unalias       aliases
     history · !! · !number  history
```

## From Login to Logout — The Week as One Flow

What we learned separately over four days is really **the order of what the shell does in a day**.

```text
   ① Connect        Looks at the 7th field of /etc/passwd and launches /bin/bash as the login shell
   ② Read settings  /etc/profile → ~/.bash_profile → ~/.bashrc → /etc/bashrc
   ③ Prepare vars   Variables like PATH, HOME, PS1 are filled in
   ④ Prompt         Shows [user@server1 ~]$ in the PS1 format and waits for input
   ⑤ Enter command  ll *.log > out.txt 2> err.txt
   ⑥ Interpret      ll → ls -l (alias) · *.log → file names (wildcard) · connect > and 2>
   ⑦ Execute        Finds ls in PATH, runs it as a child process, and waits for it to finish
   ⑧ Result         Stores the exit status in $? and shows the prompt again
   ⑨ Logout         Runs ~/.bash_logout and writes history to ~/.bash_history
```

| Step | Day learned | Questions that come from that step |
|------|-------|--------------------|
| ① | Day 1 | Where is the login shell written, and how do you change it? |
| ②, ⑨ | Day 3 | Which files are read, and in what order? |
| ③, ④, ⑧ | Day 2 | Shell variables and environment variables, `PATH`, `PS1`, `$?` |
| ⑤, ⑥ | Day 4 | Redirection, pipes, wildcards, aliases |
| ⑦ | Day 1, 2 | Builtin and external commands, PATH search order |

- In ⑥, **the shell is what resolves aliases, wildcards, and variables.** `ls` receives only the fully resolved result.
- In ②, `.bashrc` and `/etc/bashrc` are not read by bash automatically; **one line inside the preceding file calls them** (on the Red Hat family).

## Finding the Cause from the Symptom

| Symptom | Cause | Fix |
|------|------|------|
| You added a variable to `/etc/profile` but a user who is already connected cannot see it | Configuration files are read **at login** | Log in again or `source /etc/profile` |
| You created `MYDIR=/data` but it is empty inside `bash backup.sh` | It is a **shell variable**, so it did not go to the child | `export MYDIR` |
| After `ls > list.txt`, yesterday's contents are gone | `>` **empties first** and then writes | Use `>>` |
| `find / -name core > r.txt` but Permission denied floods the screen | Errors are on **channel 2**, so `>` does not catch them | Add `2> /dev/null` |
| You ran `chsh -s /bin/zsh` but `echo $SHELL` is unchanged | It applies **from the next login** | Log in again |
| You became root with `su` but the location and environment are unchanged | No hyphen, so it is a **non-login shell** | `su -` |
| You wrote an alias in `~/.bashrc` but get `command not found` | The current shell read the file **before it was edited** | `source ~/.bashrc` |
| `run.sh` is right in front of you but typing only its name gives `command not found` | The current directory is **not in PATH** | `./run.sh` |
| After editing `PATH`, even `ls` fails | You overwrote it **without `$PATH`** | Revive with `export PATH=/usr/bin:/bin` |
| `echo '$HOME'` prints `$HOME` as is | **Single quotes** do not expand variables | Change to double quotes |

## Reading Redirection Practice

`ls /etc /nodir` is a command that produces **both** results and errors. Follow what goes where for each notation.

| Command | What you see on screen | What is put in the file |
|------|---------------|---------------|
| `ls /etc /nodir > a` | Error | Results |
| `ls /etc /nodir 2> a` | Results | Error |
| `ls /etc /nodir > a 2> b` | Nothing | Results in a, error in b |
| `ls /etc /nodir &> a` | Nothing | Results and error |
| `ls /etc /nodir > a 2>&1` | Nothing | Results and error |
| `ls /etc /nodir 2>&1 > a` | **Error** | Results |
| `ls /etc /nodir 2> /dev/null` | Results | Nothing (the error is discarded) |
| `ls /etc /nodir \| wc -l` | **Error** and the line count | — (a pipe passes only 1) |

## Symbols at a Glance

| Symbol | Meaning | Symbol | Meaning |
|------|-----|------|-----|
| `" "` | **Expands** variables | `' '` | **Does not expand** variables |
| `` ` ` `` · `$( )` | Result of running a command | `\` | Removes the special meaning of the next character |
| `;` | Continue unconditionally | `&&` | If the previous one **succeeded** |
| `\|\|` | If the previous one **failed** | `&` | To the background |
| `*` | Any number of characters | `?` | One character |
| `[abc]` | One character from them | `[!abc]` | One character other than those |
| `!!` | The whole previous command | `!$` | The last argument of the previous command |
| `$?` | Exit status of the previous command | `$$` | PID of the current shell |

## Contrasting Easily Confused Pairs

| Category | A | B | Distinguishing criterion |
|------|---|---|-----------|
| Bourne vs C family | sh, ksh, bash, zsh, dash | **csh, tcsh** | Does the name have a c? |
| Shell variable vs environment variable | Up to the current shell | **Down to children** | Was it exported? |
| `set` vs `env` | **Everything** | Environment variables only | Scope |
| `.bash_profile` vs `.bashrc` | **Login** shell | Non-login shell | Whether the login process happened |
| `.bash_profile` vs `.profile` | bash-specific | **Used instead when absent** | Priority |
| `su` vs `su -` | Non-login | **Login shell** | Presence of hyphen |
| `>` vs `>>` | **Overwrites** | Appends | Preserving existing contents |
| `>` vs `2>` | Standard output | **Standard error** | Channel number |
| `>` vs `\|` | To a **file** | To the next **command** | What it passes to |
| `*` vs `?` | No limit on number of characters | **One character** | Count |
| `source` vs `bash` | Applies to the **current shell** | Ends in a new shell | Where it runs |
| `alias` vs `unalias` | Create | Remove | — |
| `$SHELL` vs `$0` | **Login shell** | The shell currently running | Point in time |

## Commonly Missed Points

1. **zsh is C family** → No. It is **Bourne family**. The C family is **only csh and tcsh**.
2. **`NAME = linux`** → You must **not put spaces** around the equals sign. `NAME=linux`.
3. **You add `$` when creating a variable too** → No. Only **when retrieving** it.
4. **`env` shows everything** → No. **`set` shows everything**; `env` shows only environment variables.
5. **The PATH separator is a semicolon** → It is the **colon (`:`)**. The semicolon is Windows.
6. **`export PATH=/opt/bin`** → The existing paths are lost. Always include **`$PATH:`**.
7. **`$?` being 1 means success** → **0 is success**.
8. **A new terminal window reads `/etc/profile`** → It does not. **A non-login shell reads only `.bashrc`**.
9. **Edited settings apply immediately** → No. You must re-read them with **`source`** or log in again.
10. **`>` saves errors too** → No. Errors are redirected separately with **`2>`**.
11. **You remove an alias with `unset`** → It is **`unalias`**. `unset` is for variables.
12. **`$SHELL` is the shell currently running** → It is the **login shell**. For the current one, look at `echo $0` or `ps -p $$`.
13. **The first shell to add history and aliases was bash** → It was **csh**. bash inherited them.
14. **`> a 2>&1` and `2>&1 > a` are the same** → They differ. With the latter, **the error stays on the screen**.
15. **`.bash_logout` runs every time you close a terminal window** → **Only when leaving a login shell.**
16. **`. file` and `./file` are the same** → The former **reads in the current shell** (source), the latter **executes**.
17. **`/sbin/nologin` means the account was deleted** → The account stays, and **only login** is blocked.

## Values That Appear on the Exam as They Are

| Value | What it is |
|-----|------|
| **0 / 1 / 2** | Standard input / standard output / standard error |
| **`:`** | The separator in `PATH` |
| **7th** | The field in `/etc/passwd` that holds the login shell |
| **`/etc/shells`** | The file listing available shells |
| **`/dev/null`** | Where things are thrown away |
| **0** | The value meaning success in `$?` |

| Shell | Creator |
|----|---------|
| **sh** | Stephen **Bourne** |
| **csh** | Bill **Joy** |
| **ksh** | David **Korn** |
| **bash** | Brian **Fox** |

### Files at a Glance

| File | One-line role |
|------|----------|
| `/etc/passwd` | Account information. **The 7th field is the login shell** |
| `/etc/shells` | The **list** of shells usable as a login shell |
| `/etc/profile` | **Global, login** settings |
| `/etc/profile.d/` | Directory holding global login settings split into files |
| `/etc/bashrc` | **Global, when a shell is launched** settings (`/etc/bash.bashrc` on the Debian family) |
| `~/.bash_profile` | **Personal, login** settings. Holds environment variables |
| `~/.bashrc` | **Personal, when a shell is launched** settings. Holds aliases |
| `~/.bash_logout` | Executed at logout |
| `~/.bash_history` | Stores command history |
| `/etc/skel/` | Default configuration files copied to a new account's home |
| `/dev/null` | Where things are thrown away |

### Commands at a Glance

| Command | One-line role |
|------|----------|
| `chsh -s` | Change the login shell |
| `export` | Shell variable → environment variable |
| `set` / `env` | View all variables / only environment variables |
| `unset` | Delete a variable |
| `source` (`.`) | Read a file in the current shell |
| `alias` / `unalias` | Create / remove an alias |
| `history` | View command history |
| `type` / `which` | What a command is / where it was found in PATH |

> Next week is editors and processes. We cover vi's three modes and process commands such as `ps` and `kill`.

## 📖 Glossary

- **Bourne family / C family** : The two branches that divide shells. The C family is only csh and tcsh.
- **`export`** : The command that promotes a shell variable to an environment variable.
- **Login shell / non-login shell** : The configuration files read differ depending on whether the login process was gone through.
- **`source`** : The command that re-reads a configuration file in the current shell. Same as the dot (`.`).
- **File descriptor** : The number attached to an input/output channel. 0, 1, 2 are standard input, output, and error.
- **`/dev/null`** : A special file that discards any data sent to it.

## 📝 Practice Questions

**Question 1.** Which of the following shells does **not** belong to the Bourne shell family?

A) bash  
B) tcsh  
C) ksh  
D) dash  

**Answer: B**  
Explanation: Shells are divided into the Bourne family and the C family, and the C family is only csh and its improved version tcsh. bash, ksh, dash, and zsh are all Bourne-family shells that branched off from the Bourne shell.

---

**Question 2.** Which of the following commands prints both shell variables and environment variables?

A) set  
B) env  
C) printenv  
D) export  

**Answer: A**  
Explanation: `set` prints both the shell variables and environment variables of the current shell, so its output is the longest. `env` and `printenv` show only environment variables, and `export` is a command that promotes a variable to an environment variable or shows that list.

---

**Question 3.** Which of the following notations saves both the standard output and standard error of a command into a single file?

A) > file  
B) 2> file  
C) < file  
D) &> file  

**Answer: D**  
Explanation: `&>` sends standard output and standard error together to the specified file. `> file 2>&1` gives the same result. `>` sends only standard output, `2>` sends only standard error, and `<` is a symbol that changes the input direction.

---

**Question 4.** Which of the following is the personal configuration file read when you connect remotely over SSH?

A) ~/.bashrc  
B) ~/.bash_logout  
C) ~/.bash_profile  
D) ~/.bash_history  

**Answer: C**  
Explanation: An SSH connection goes through the login process, so it starts as a login shell and reads `~/.bash_profile` after `/etc/profile`. `~/.bashrc` is the file read by non-login shells, but most distributions set `.bash_profile` to call `.bashrc` from inside it.

---

**Question 5.** Which of the following commands adds `/opt/bin` to the `PATH` environment variable while keeping the existing value?

A) export PATH=$PATH:/opt/bin  
B) export PATH=/opt/bin  
C) export /opt/bin=$PATH  
D) PATH=/opt/bin export  

**Answer: A**  
Explanation: To keep the existing paths, you must include `$PATH` and append the new path to it. If you specify it without `$PATH`, all the existing search paths disappear and even basic commands such as `ls` can no longer run.

---

**Question 6.** Which of the following gives the special variable that lets you check whether the previous command succeeded, and the value meaning success?

A) `$!`, value 1  
B) `$?`, value 0  
C) `$$`, value 0  
D) `$?`, value 1  

**Answer: B**  
Explanation: `$?` holds the exit status of the previous command; 0 means a normal exit and non-zero means an error. This is easy to confuse because it is the opposite of the common convention of expressing true as 1. `$$` is the PID of the current shell, and `$!` is the PID of the last background job.
