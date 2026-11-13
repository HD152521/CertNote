# Day 1 - First Steps in the Shell: How to Read a Single Command Line

## 📌 Key Takeaways

- The **`$`** at the end of the prompt means a **regular user**, and **`#`** means **root**. That single character tells you your privilege level.
- Read a command in three chunks: **`command [options] [arguments]`**.
- Options come in a **short form (`-a`)** and a **long form (`--all`)**, and short forms **can be combined, like `-la`.**
- **A path starting with `/` is absolute**; otherwise it is relative to your current location. `.` = current, `..` = parent, `~` = home.
- Look up unfamiliar commands with **`man command`**. **Tab completion** and the **↑ history** cut down on typos.

## Reading the Prompt

When you log in, a line like this appears. This is the **prompt**, the sign that the shell is waiting for a command.

```text
   user@localhost:~$
    │      │      ││
    │      │      │└── $ = regular user,  # = root
    │      │      └─── current directory (~ is the home directory)
    │      └────────── hostname (the computer's name)
    └───────────────── name of the logged-in user
```

- **Telling `$` and `#` apart is the most important thing.** In textbooks and docs, a command that starts with `#` means "run this with administrator privileges."
- The rule is not to stay logged in as root. Raise your privileges briefly with `sudo` only when you need to.

### The Prompt Looks Different on Each Distribution

The prompt is drawn according to the format stored in a variable called `PS1`. The defaults differ by distribution, so the same situation looks different.

| Family | What it looks like | Characteristics |
|------|-----------|------|
| RedHat family (CentOS · Rocky) | `[user@localhost ~]$` | Wrapped in square brackets, and shows **only the last name** of the current directory |
| Debian family (Ubuntu) | `user@localhost:~$` | Joined with a colon, and shows the **full path** of the current directory |

```text
[user@localhost ~]$ cd /usr/share/doc
[user@localhost doc]$ su -
Password:
[root@localhost ~]#
```

- Exam passages use the RedHat-family style, such as `[root@www ~]#`. Even if the look differs, **the way you read it is the same** — user, host, location, and the final `$` / `#`.
- In the example above, once we moved to `/usr/share/doc` the location slot changed to `doc`, and once we became root with `su -` the final character changed to `#`.
- You can also check each piece of the prompt with a command.

```bash
whoami       # user         ← name of the logged-in user
hostname     # localhost    ← hostname
pwd          # /home/user   ← full path of the current directory
```

## Structure of a Command

```text
   $ ls -l /home
     │   │    │
     │   │    └── argument — on what
     │   └─────── option   — how
     └─────────── command  — what to do
```

| Chunk | Description | Example |
|------|------|-----|
| **Command** | Name of the program to run | `ls`, `cp`, `mkdir` |
| **Option** | Changes how it behaves. Usually starts with `-` | `-l`, `-a`, `--help` |
| **Argument** | The target. A file name, directory, or string | `/home`, `a.txt` |

- The shell **splits chunks at spaces.** So if a file name contains a space, you have to wrap it in quotes or escape it with `\ `.
- Commands are **case-sensitive.** `LS` is not `ls`.
- Options and arguments can **both be omitted.** Typing just `ls` works, and so does giving only an argument with no option, like `ls /home`. The square brackets `[ ]` mean "optional."

### Spaces Split Chunks — When You Need Quotes

```bash
touch my file.txt        # two files get created: my and file.txt
touch "my file.txt"      # one file containing a space
touch my\ file.txt       # same as above (\ protects the one space right after it)
```

| Notation | What the shell does |
|------|-------------|
| `"..."` double quotes | Protect spaces but **substitute `$variable` with its value** |
| `'...'` single quotes | Keep every character inside **exactly as written** |
| `\` backslash | Protects **only the one character right after it** |

```bash
echo "$HOME"     # /home/user   ← the variable's value is printed
echo '$HOME'     # $HOME        ← printed literally
```

### Multiple Commands on One Line

| Symbol | Meaning | Example |
|------|-----|-----|
| `;` | Run in order **regardless of** whether the previous command succeeded | `cd /tmp; ls` |
| `&&` | Run the next command **only if the previous one succeeded** | `mkdir work && cd work` |
| `\|\|` | Run the next command **only if the previous one failed** | `cd work \|\| echo "not found"` |

### Two Forms of Options

| Form | Look | Characteristics |
|------|------|------|
| Short form | `-a` | One letter. **Several can be combined** → `-l -a` = `-la` |
| Long form | `--all` | The meaning is clear. Cannot be combined |

```bash
ls -l -a /home     # written separately
ls -la /home       # combined — same meaning
ls --all /home     # long form
```

> Pitfall: a long form starts with **`--` (two hyphens)**. If you write it with one hyphen like `-all`, it is interpreted as `-a -l -l`.

### Options That Take a Value

Some options are followed by a **value**. Short forms usually separate it with a space, and long forms usually join it with `=`.

```bash
head -n 5 a.txt          # short form + value
head --lines=5 a.txt     # long form + value — same meaning
```

- Here `5` is not an argument but **the value of the `-n` option**. The target the command processes (the argument) is just `a.txt`.
- Most GNU commands accept **`--help`** (usage) and **`--version`** (version) in common. If you can't remember an option, start by typing `command --help`.

## Where the Shell Looks for Commands

The reason typing just `ls` works is that the shell **searches the directories listed in the `PATH` variable from the front, one by one,** looking for an executable file with the same name.

```bash
echo $PATH
# /usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin:/home/user/bin
which cp
# /usr/bin/cp
```

What we type as a "command" is really one of three kinds.

| Kind | Description | Example |
|------|------|-----|
| **Builtin command** | A command that lives inside the shell program. No separate executable file is needed | `cd`, `echo`, `history`, `exit` |
| **External command** | A command that exists as an executable file on disk. Found via `PATH` | `ls`, `cp`, `man` |
| **Alias** | A short name attached to a longer command | `ll` → `ls -l` |

```bash
type cd      # cd is a shell builtin
type ls      # ls is aliased to `ls --color=auto'
type cp      # cp is /usr/bin/cp
```

- If you get **`command not found`**, it is one of three things — a typo, the program is not installed, or the executable is outside `PATH`.
- **The current directory is not in `PATH`.** So to run an executable in your current location, you **add a path** like `./script.sh`.
- `which` finds the **location of an executable** in `PATH`, while `type` also tells you **whether the name is a builtin, an alias, or external**. A builtin may have no executable file of its own, so checking with `type` is more accurate.

## Reading Paths

| Notation | Meaning |
|------|-----|
| `/` | **The root directory.** The starting point of every path |
| `.` | The current directory |
| `..` | One level up (the parent directory) |
| `~` | The current user's home directory |
| `-` | The directory you were in just before (`cd -`) |

```text
   Absolute path   /home/user/docs/a.txt     ← starts with /. Same place wherever you run it
   Relative path   docs/a.txt                ← relative to the current location
                   ../user2/b.txt            ← go up one level, then down
```

- Whether a path is absolute or relative depends only on **whether it starts with `/`**. This one line is an exam point.

## How to Look Things Up When You Don't Know

| Command | What it does |
|------|--------|
| `man command` | **Manual page.** The most standard help |
| `command --help` | A brief usage summary |
| `info command` | GNU's detailed documentation |
| `whatis command` | A one-line description |
| `apropos keyword` | **Search** for commands by keyword |
| `which command` | The **path** of the file that gets executed |
| `type command` | Whether it is a command, an alias, or a builtin |

### Section Numbers of man Pages

When the same name is both a command and a configuration file, sections tell them apart.

| Section | Contents |
|------|------|
| **1** | General user commands |
| **5** | **Configuration file formats** |
| **8** | System administration commands |

```bash
man 1 passwd      # the passwd command
man 5 passwd      # the format of the /etc/passwd file
```

- Inside `man`, **press `q` to quit**, page with the arrow keys or `Space`, and search with `/word`.
- If you don't specify a section, you get **only the first one found** in a fixed search order. That is why `man passwd` shows the command (1), and you must specify 5 to see the file format.

There are originally nine sections. The exam mostly asks about 1, 5, and 8, but knowing the whole picture keeps you from getting confused.

| Section | Contents | Section | Contents |
|------|------|------|------|
| **1** | General user commands | 6 | Games |
| 2 | System calls | 7 | Miscellaneous (conventions, standards, etc.) |
| 3 | Library functions | **8** | System administration commands |
| 4 | Special files (devices) | 9 | Kernel routines |
| **5** | Configuration file formats | | |

### What Makes Up One man Page

| Item | What it contains |
|------|--------|
| **NAME** | The command name and a one-line description |
| **SYNOPSIS** | Usage format — in what order to write options and arguments |
| **DESCRIPTION** | Detailed explanation |
| **OPTIONS** | Explanation of each option |
| **FILES** | Related configuration files |
| **SEE ALSO** | Other manuals to look at together |

```text
SYNOPSIS
       ls [OPTION]... [FILE]...
```

- **`[ ]`** means optional, and **`...`** means you can chain several. The line above reads as "you can give no options and no files, and you can also give several."
- The number in parentheses in `SEE ALSO`, like `passwd(5)`, is exactly the **section number**.

### How the Help Commands Relate

| Command | The `man` option that does the same | How it searches |
|------|------------------------|----------|
| `whatis name` | `man -f name` | The one-line description of manuals whose name **matches exactly** |
| `apropos keyword` | `man -k keyword` | Every manual whose name or description **contains** the keyword |

```bash
whatis passwd
# passwd (1)   - update user's authentication tokens
# passwd (5)   - password file
apropos "copy files"
# cp (1)       - copy files and directories
```

- **If you know the command name, use `whatis`; if you only know what you want to do, use `apropos`.**
- For builtin commands, it is faster to use the shell's `help`, like **`help cd`**, than `man`.

## Habits That Save Your Fingers

| Key | What it does |
|----|--------|
| **Tab** | **Auto-completes** commands and file names. Press twice for a list of candidates |
| **↑ / ↓** | Recall previously typed commands |
| `history` | View the command history |
| **Ctrl + C** | **Interrupt** the running command |
| **Ctrl + D** | End input / log out |
| **Ctrl + L** | Clear the screen (same as `clear`) |

> Tab completion not only cuts down typos but is also a **way to check that a path is right**. If it won't complete, that path doesn't exist.

### Ctrl + C · Z · D Each Do a Different Thing

All three look like they "stop" something, but the results differ.

| Key | What actually happens | Afterward |
|----|------------------|------|
| **Ctrl + C** | Sends an **interrupt signal (SIGINT)** to the running command | The command **ends** |
| **Ctrl + Z** | Sends a **suspend signal** | The command **stays, stopped.** Resume it with `fg` |
| **Ctrl + D** | Not a signal but a marker meaning **"input has ended" (EOF)** | A command waiting for input exits normally. At an empty prompt, it logs you out |

```text
$ sleep 100
^Z
[1]+  Stopped                 sleep 100
$ fg
sleep 100
^C
$
```

- A command stopped with `Ctrl + Z` has not disappeared. If you meant to terminate it, you should have used `Ctrl + C`.
- When editing a line, **Ctrl + A** (to the start of the line) · **Ctrl + E** (to the end of the line) · **Ctrl + U** (erase before the cursor) are handy.

> Tomorrow we will learn the commands that handle real files and directories using this syntax.

## 📖 Glossary

- **Prompt** : The sign that the shell is waiting for a command. It shows the user, host, current location, and privilege.
- **Option** : A marker that changes how a command behaves. There are short forms like `-a` and long forms like `--all`.
- **Argument** : The target a command processes. A file name or directory name goes here.
- **Absolute path** : A full path starting from `/`. It points to the same place regardless of the current location.
- **Relative path** : A path based on the current directory.
- **Home directory** : A personal directory assigned to a user. Abbreviated as `~`.
- **man page** : A command's official manual. Section numbers distinguish identical names.
- **Auto-completion** : A feature that fills in the rest of a command or path with the Tab key.
- **Builtin command** : A command that lives inside the shell, like `cd`. Check it with `type` and see its help with `help`.
- **PATH** : The list of directories the shell searches for a command's executable. The current directory is not in it.

## 📝 Practice Questions

**Question 1.** When the last character of the shell prompt is `#`, which of the following can you tell?

A) The current directory is the home directory  
B) You are logged in with root privileges  
C) It means a command is running  
D) The shell is some kind other than bash  

**Answer: B**  
Explanation: The `$` at the end of the prompt indicates a regular user, and `#` indicates root (administrator). A command that starts with `#` in docs or textbooks means administrator privileges are required. The current directory is shown after the `:` in the prompt, and the home directory is written as `~`.

---

**Question 2.** Which of the following commands has the same meaning as `ls -l -a`?

A) ls -la  
B) ls --la  
C) ls -l--a  
D) ls l a  

**Answer: A**  
Explanation: Short-form options are one letter each, so they can be combined under a single hyphen like `-la`. Two hyphens (`--`) are used for long-form options such as `--all` and cannot be combined. Written without a hyphen, they are interpreted as arguments, not options.

---

**Question 3.** Which of the following is an absolute path?

A) docs/report.txt  
B) ../user2/b.txt  
C) ./a.txt  
D) /home/user/docs/a.txt  

**Answer: D**  
Explanation: An absolute path is the full path written from the root directory `/` to the destination, and it points to the same location wherever you run it. All the others are relative paths based on the current directory, where `.` means current and `..` means the parent directory.

---

**Question 4.** Which command should you use to view the manual for the **format of the `/etc/passwd` file**?

A) man 1 passwd  
B) man 5 passwd  
C) man 8 passwd  
D) whatis passwd  

**Answer: B**  
Explanation: man pages use section numbers to distinguish identical names. Section 1 is general user commands, 5 is configuration file formats, and 8 is system administration commands. `passwd` is both the command that changes passwords and the name of the file holding user information, so to see the file format you must specify section 5.

---

**Question 5.** Which of the following key combinations is used to forcibly interrupt a running command?

A) Ctrl + D  
B) Ctrl + L  
C) Ctrl + C  
D) Ctrl + Z  

**Answer: C**  
Explanation: Ctrl + C sends an interrupt signal to the currently running command. Ctrl + D signals the end of input to log out or end input, and Ctrl + L clears the screen. Ctrl + Z does not interrupt but suspends the job and sends it to the background.
