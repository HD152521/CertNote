# Day 3 - Environment Configuration Files

## 📌 Key Points

- Configuration files are split into two layers: **global (`/etc/`) and user (`~/`)**. **The global one is read first and then overridden by the user's.**
- A **login shell** reads `/etc/profile` → `~/.bash_profile`, in that order.
- A **non-login shell** (such as when you open a new terminal window) reads **`~/.bashrc`**.
- At logout, **`~/.bash_logout`** is executed.
- To **apply edited settings without logging in again**, use **`source`** or **`.`**.

## Two Layers, Two Branches

```text
          Global (all users)            User (me only)
        ┌──────────────────┐      ┌──────────────────┐
Login    │  /etc/profile     │  →   │  ~/.bash_profile  │
        └──────────────────┘      └──────────────────┘

Non-login│  /etc/bashrc      │  →   │  ~/.bashrc        │
        └──────────────────┘      └──────────────────┘

Logout                              ~/.bash_logout
```

| Axis | What it distinguishes |
|----|---------|
| **Global vs user** | Under `/etc/` applies **to everyone**, under `~/` applies **only to that person** |
| **Login vs non-login** | Did you go through the login process, or did you just launch a new shell while already logged in? |

- **Only root can edit global files.** Each user edits their own files.
- If the same value is set on both sides, **the user file, read later, wins.**

## What Each File Does

| File | Scope | When |
|------|------|------|
| **`/etc/profile`** | Global | At **login** |
| `/etc/bashrc` (`/etc/bash.bashrc`) | Global | When a shell is **newly launched** |
| **`~/.bash_profile`** | Personal | At **login** |
| `~/.bash_login`, `~/.profile` | Personal | **Used instead** when `.bash_profile` **does not exist** |
| **`~/.bashrc`** | Personal | When a shell is **newly launched** |
| **`~/.bash_logout`** | Personal | At **logout** |

> File names differ slightly between distributions. The global bashrc is **`/etc/bashrc`** on the Red Hat family and **`/etc/bash.bashrc`** on the Debian family.

### What Goes Where

| What to write | Where to put it | Why |
|----------|--------|------|
| **Environment variables** (`PATH`, `LANG`) | **`.bash_profile`** | Set once and they are passed on to children |
| **Aliases** (`alias`), prompt | **`.bashrc`** | Needed fresh in every shell |

- Environment variables are handed down to children via `export`, so **once at login** is enough.
- Aliases are not passed to children, so they must be set **every time a shell is launched**.

### Opening the Actual Files

```bash
# ~/.bash_profile  (default contents on the Red Hat family)
if [ -f ~/.bashrc ]; then
        . ~/.bashrc
fi
PATH=$PATH:$HOME/.local/bin:$HOME/bin
export PATH
```

```bash
# ~/.bashrc  (default contents on the Red Hat family plus one alias line)
if [ -f /etc/bashrc ]; then
        . /etc/bashrc
fi
alias ll='ls -l'
```

- **`[ -f file ]` means "if that file exists"**, and **`.` is `source`**. So it means "if `.bashrc` exists, read it in the current shell."
- The structure is that `.bash_profile` **calls** `.bashrc`, and `.bashrc` **calls** `/etc/bashrc`. It is not that bash reads everything on its own; **one line written inside each file** calls the next file.
- Debian and Ubuntu ship **`~/.profile`** by default instead of `~/.bash_profile`, and call `~/.bashrc` from inside it. The global `/etc/bash.bashrc` is read directly by bash. **The way the files are connected differs by distribution, but the skeleton, "the login file calls bashrc," is the same.**

### `/etc/profile.d/` — Where Global Settings Are Split Up

```bash
ls /etc/profile.d/
# colorls.sh  lang.sh  less.sh  vim.sh  which2.sh
```

- Near its end, `/etc/profile` **reads every `*.sh` file in this directory.**
- Instead of editing `/etc/profile` directly, a package **drops one file of its own here**. To remove it, you only delete that file.
- When an administrator adds global settings, it is safer to **create a new `.sh` file here** than to edit `/etc/profile`.

### `/etc/skel` — Where a New Account's Configuration Files Come From

```bash
ls -a /etc/skel
# .  ..  .bash_logout  .bash_profile  .bashrc
```

- When you create an account with `useradd`, **the files in this directory are copied to the new home directory.** skel is short for skeleton.
- Editing here affects **only accounts created afterward**. The home directories of existing users are not changed.

## Reading Order

### Login Shell

This applies to console login, SSH connections, and `su -`.

```text
   1. /etc/profile            global
        │
        └─► /etc/profile.d/*.sh   (settings may be split up here)
   2. ~/.bash_profile         personal
        │
        └─► ~/.bashrc         (usually called from here)
             │
             └─► /etc/bashrc
```

- In step 2, **if `~/.bash_profile` does not exist it reads `~/.bash_login`, and if that does not exist either, `~/.profile`.** It reads **only the first one of the three that it finds**.
- Most distributions put **a line that calls `.bashrc`** inside `.bash_profile`. That is what makes aliases apply in login shells too.

### Non-Login Shell

This applies when you open a new terminal window or run `bash` while already logged in.

```text
   ~/.bashrc
      │
      └─► /etc/bashrc
```

- **`/etc/profile` and `~/.bash_profile` are not read.**
- So environment variables written only in `.bash_profile` are used by **inheriting them from the parent shell**.

| Situation | Is it a login shell? |
|------|-------------|
| SSH connection | **Login shell** |
| Console login | **Login shell** |
| `su -` | **Login shell** |
| `su` (without hyphen) | Non-login |
| Opening a new terminal window | Non-login |
| Running `bash` | Non-login |

> **This is where the difference between `su` and `su -` shows.** Adding the hyphen starts a login shell and reads from `/etc/profile` all over again, so the environment switches completely.

### Checking Whether the Current Shell Is a Login Shell

```bash
echo $0
# -bash                 ← a leading hyphen means a login shell
shopt login_shell
# login_shell     on
bash                    # launch one more shell
echo $0
# bash
shopt login_shell
# login_shell     off
```

### An Experiment to See the Order for Yourself

Put `echo ">> .bash_profile"` on the **first line** of `~/.bash_profile` and `echo ">> .bashrc"` on the **first line** of `~/.bashrc`, then try the following.

| What you did | What is printed on screen | Files read |
|---------|---------------|----------|
| New SSH connection | `>> .bash_profile` followed by `>> .bashrc` | Both (profile called bashrc) |
| Run `bash` inside it | `>> .bashrc` only | bashrc only |
| Run a script with `bash script.sh` | Nothing | Neither is read |

- The third row is the trap. **The shell that runs a script does not read `.bashrc` either.** That is why an alias defined in `.bashrc` does not work inside a script.
- When the experiment is over, **be sure to delete the lines you added.** If a configuration file prints text to the screen, file transfers such as `scp` may fail.

### `su` and `su -` Side by Side

```text
[user@server1 work]$ su
Password:
[root@server1 work]# pwd
/home/user/work              ← still in the same place
[root@server1 work]# exit

[user@server1 work]$ su -
Password:
[root@server1 ~]# pwd
/root                        ← moved to root's home, and the environment is root's too
```

- `su` **changes only the user** and leaves the working directory and most existing environment variables as they are.
- `su -` creates **the same state as a fresh login as root**. It reads `/etc/profile` and root's `~/.bash_profile` from the beginning.
- If you write **a user name after the hyphen**, as in `su - alice`, you enter that user's login shell.

## Applying Edited Settings Immediately

```bash
source ~/.bashrc     # re-read in the current shell
. ~/.bashrc          # a single dot means the same thing
```

- **`source` and `.` (dot) are the same command.**
- Configuration files are read **only once at login**, so editing them does not affect that shell. You must re-read them with `source`.
- **You must not run it like `bash ~/.bashrc`.** It would be read in a new shell and finish, leaving nothing in the current shell. The key point is that **`source` runs inside the current shell**.

### Points That Cause Confusion with source

| Notation | Meaning |
|------|-----|
| **`. ~/.bashrc`** | There is a **space after** the dot — same as `source`. Reads in the current shell |
| `./script.sh` | The dot and slash are **joined** — **executes** "that file in the current directory" |

- You distinguish a single dot used as a **command** from one used as a **path**. The criterion is whether there is a space.
- `source` only **reads** the file, so it works **even without execute permission**. Running with `./script.sh` requires execute permission.
- You need to read the file you edited. If you edited `.bash_profile`, it is `source ~/.bash_profile`.

```bash
# when ~/.bashrc contains  export PATH=$PATH:/opt/bin
source ~/.bashrc
source ~/.bashrc
echo $PATH
# /usr/local/bin:/usr/bin:/opt/bin:/opt/bin:/opt/bin
```

> ⚠️ **Every time you `source`, that line runs again.** A line that appends to `$PATH` adds the same path once more each time it is read. It does no harm to how things work, but if you delete the line to get rid of the value and then `source`, **the values already appended do not disappear.** In that case, log in again.

## At Logout

```bash
# ~/.bash_logout example
clear                  # clear the screen
rm -f ~/tmp/*          # clean up temporary files
```

- It runs **only when you exit a login shell**. It does not run when you close a non-login shell.

## Choosing a File by Situation

| What you want to do | Where to edit |
|------------|--------|
| Add a path to **every user's** `PATH` | `/etc/profile` (or add a `.sh` file to `/etc/profile.d/`) |
| Give **every user** the same alias | `/etc/bashrc` |
| An environment variable **only I** use | `~/.bash_profile` |
| An alias or prompt **only I** use | `~/.bashrc` |
| Default settings for **accounts created in the future** | Files under `/etc/skel/` |
| Automatic cleanup at logout | `~/.bash_logout` |
| Apply your edits **right now** | `source file` |

- When reading a question, you only need to find two things, **"for whom" (global/personal)** and **"when" (login/when launching a shell/logout)**, and the file is determined.

| Appears in related lists but is not a configuration file | Actual role |
|----------------------------------|----------|
| `~/.bash_history` | The file where the **history** of executed commands accumulates |
| `/etc/shells` | The **list of shells** that can be used |
| `/etc/passwd` | Account information. The 7th field is the login shell |

> Tomorrow we cover redirection, which sends a command's input and output elsewhere, as well as aliases and history.

## 📖 Glossary

- **Login shell** : A shell started through the login process. It reads `/etc/profile` and `~/.bash_profile`.
- **Non-login shell** : A shell newly launched while already logged in. It reads only `~/.bashrc`.
- **`/etc/profile`** : The global login configuration file that applies to all users.
- **`~/.bash_profile`** : A personal login configuration file. Mainly holds environment variables.
- **`~/.bashrc`** : A personal configuration file read every time a shell is launched. Mainly holds aliases and the prompt.
- **`~/.bash_logout`** : A file executed when logging out of a login shell.
- **`source`** : A command that re-reads a configuration file in the current shell to apply it immediately. Same as `.`.
- **`/etc/profile.d/`** : A directory that holds global login settings split into separate files. `/etc/profile` reads the `*.sh` files here.
- **`/etc/skel`** : The place holding the default configuration files that are copied into the home directory when a new account is created.

## 📝 Practice Questions

**Question 1.** Which of the following is the personal configuration file read when a non-login shell starts, such as when you open a new terminal window?

A) ~/.bash_profile  
B) /etc/profile  
C) ~/.bashrc  
D) ~/.bash_logout  

**Answer: C**  
Explanation: A non-login shell reads `~/.bashrc`. `/etc/profile` and `~/.bash_profile` are read only when going through the login process, and `~/.bash_logout` runs when exiting a login shell. This is why alias and prompt settings are placed in `.bashrc`.

---

**Question 2.** Which of the following is the global login configuration file that applies to all users?

A) ~/.profile  
B) /etc/profile  
C) ~/.bashrc  
D) /etc/shells  

**Answer: B**  
Explanation: `/etc/profile` is the global configuration file applied to all users at login, and only root can modify it. Files starting with `~/` apply only to the individual user, and `/etc/shells` is a file containing the list of available shells.

---

**Question 3.** Which of the following commands applies an edited configuration file to the current shell immediately, without logging in again?

A) source ~/.bashrc  
B) bash ~/.bashrc  
C) exec ~/.bashrc  
D) sh ~/.bashrc  

**Answer: A**  
Explanation: `source` reads the specified file inside the current shell, so the settings are applied right away. A single dot (`.`) does the same thing. In contrast, running it with `bash` or `sh` reads it in a new shell and exits, leaving no change in the current shell.

---

**Question 4.** Which of the following configuration files is executed at logout?

A) ~/.bashrc  
B) ~/.bash_logout  
C) /etc/profile  
D) ~/.bash_history  

**Answer: B**  
Explanation: `~/.bash_logout` runs when exiting a login shell, and you put wrap-up tasks in it such as clearing the screen or deleting temporary files. `~/.bash_history` is the file where the history of executed commands is saved, not a configuration file.

---

**Question 5.** Which of the following files is read instead when `~/.bash_profile` does not exist in a login shell?

A) ~/.bashrc  
B) ~/.bash_logout  
C) /etc/bashrc  
D) ~/.profile  

**Answer: D**  
Explanation: A login shell reads only the first one it finds among `~/.bash_profile`, `~/.bash_login`, and `~/.profile`. So if `.bash_profile` does not exist it reads `.bash_login`, and if that does not exist either, `.profile`. `~/.bashrc` is the file read by non-login shells.
