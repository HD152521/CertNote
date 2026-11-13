# Day 1 - The Three Modes of the vi Editor

## 📌 Key Points

- Editors are divided into **line editors that work one line at a time (ed, ex)** and **screen editors that work on the whole screen (vi, emacs)**.
- **vi was created by Bill Joy.** He is the same person who created the C shell (csh).
- vi has three modes: **command mode, insert mode, and ex mode**. **It starts in command mode.**
- You switch modes with three keys: **`i` (to insert), `ESC` (to command), and `:` (to ex)**.
- Save with **`:w`**, quit with **`:q`**, save and quit with **`:wq`**, and force quit with **`:q!`**.

## Branches of Editors

| Category | Unit it works on | Examples |
|------|-----------|-----|
| **Line editor** | **One line at a time** | **ed, ex, sed** |
| **Screen editor** | **The whole screen** | **vi, vim, emacs, nano, pico** |

| Editor | Features |
|-------|------|
| **vi** | Developed by **Bill Joy**. Included by default on almost every Unix |
| **vim** | **Vi IMproved** — an improved version of vi. The current standard on Linux |
| **emacs** | Developed by **Richard Stallman**. Extremely extensible |
| **pico** | For beginners. Simple |
| **nano** | **An improved version of pico** (GNU). Shortcut keys are shown at the bottom of the screen |
| **gedit** | The graphical editor of the GNOME desktop |

> **You may be asked directly who created each one.** **vi is Bill Joy, emacs is Richard Stallman.** It also helps to remember that Bill Joy created the C shell (csh) too.

### How They Came About

```text
   ed (line editor)  →  ex (line editor, Bill Joy)  →  vi (ex's screen mode, 1976)  →  vim (Bram Moolenaar, 1991)

   pico (editor of the mail program Pine)  →  nano (GNU)
```

- **vi is ex with a "visual mode for editing while looking at the screen" attached.** The name also comes from visual. The commands you call with `:` inside vi are precisely **ex commands**, which is why the third mode is called ex mode.
- **`sed` is a non-interactive stream editor.** It does not open a file and edit it; it processes edits specified by commands as the data flows through. It works line by line, so it is classified with the line editors.
- On modern Linux, running `vi` **usually launches vim in reality**. Depending on the distribution, a reduced-feature version may be installed.

| Runtime environment | Editors |
|---------|-------|
| **Console (terminal)** | vi, vim, emacs, nano, pico |
| **Graphical (X Window)** | gedit (GNOME), kate and kwrite (KDE), emacs |

- Questions that ask you to pick the one of a different kind come in one of two criteria: **line/screen** or **console/graphical**.

## The Three Modes

```text
              ┌──────────────────┐
              │   Command mode    │  ← you start here
              │  (command mode)  │     move · delete · copy
              └──────────────────┘
            i a o  │        ▲  │  :
                   ▼   ESC  │  ▼
      ┌──────────────┐   ┌──────────────┐
      │  Insert mode  │   │   ex mode     │
      │ (insert mode)│   │ (last line)  │
      │  type text    │   │ save · quit   │
      └──────────────┘   └──────────────┘
```

| Mode | What it does | How to enter |
|------|--------|-----------|
| **Command mode** | Move, delete, copy, paste | **Starting state**, `ESC` |
| **Insert mode** | Actually **typing text** | `i`, `a`, `o`, `I`, `A`, `O` |
| **ex mode** | **Save, quit, search and replace** | **`:`** (colon) |

- **When you open vi, you are in command mode.** If you start typing right away, the characters are not entered but interpreted as commands. This is where beginners get most flustered.
- **Whatever mode you are in, pressing `ESC` brings you back to command mode.** When confused, press `ESC` first.
- You can enter ex mode **only from command mode**. If you type `:` in insert mode, a plain colon character is entered.

### Same Mode, Different Names

Textbooks and questions call the modes by different names. You only need to know **they refer to the same thing**.

| Name used in this document | Other names |
|-------------|---------------|
| **Command mode** | command mode, normal mode |
| **Insert mode** | insert mode, edit mode |
| **ex mode** | last line mode, colon mode, execute mode |

- **There is no direct route between insert mode and ex mode.** You must go through command mode with `ESC`. That is why there is no arrow between the two boxes in the figure.
- A command in ex mode **runs when you press Enter and automatically returns you to command mode.** To cancel, press `ESC`.

### Reading the Bottom Line of the Screen

```text
   ~
   ~
   "test.txt" [New File]              ← when you opened a nonexistent file
   -- INSERT --                       ← after pressing i (vim)
   :wq                                ← after ESC, pressing : makes input appear here
   "test.txt" 3L, 42C written         ← save result — 3 lines, 42 characters
```

- **The bottom line tells you the current state.** In vim, if you see `-- INSERT --` it is insert mode, and if there is nothing it is command mode.
- **The `~` at the start of a line is not file content.** It marks the empty screen after the end of the file.
- ex mode is called "last line mode" **because the command is typed on the last line of the screen**.

## Keys That Enter Insert Mode

| Key | Position relative to the cursor |
|----|-------------|
| **`i`** | Insert **before the cursor** (insert) |
| **`a`** | Insert **after the cursor** (append) |
| `I` | Insert at the **start of the line** |
| `A` | Insert at the **end of the line** |
| **`o`** | Create a **new line below** and insert (open) |
| `O` | Create a **new line above** and insert |

- **Lowercase and uppercase come in pairs.** Lowercase works near the cursor, uppercase works relative to the whole line.
- The difference between `i` and `a` — **before or after** is the fork.

```text
   Original line    Linux        (cursor is on the n)

   i then X  →  LiXnux       before the cursor
   a then X  →  LinXux       after the cursor
   I then X  →  XLinux       start of the line
   A then X  →  LinuxX       end of the line
```

There are also keys that enter insert mode while making changes.

| Key | What it does | Mode afterward |
|----|--------|-----------|
| **`r`** | **Replaces just the one character** at the cursor with another (replace) | **Stays in command mode** |
| `R` | **Overwrites** from the spot where pressed | Keeps overwriting until you press `ESC` |
| `s` | Deletes the one character at the cursor and enters input | Insert mode |
| `cw` | Deletes from the cursor **to the end of the word** and enters input (change word) | Insert mode |
| `cc` | Deletes the **whole line** and enters input | Insert mode |

- **`r` does not go to insert mode.** It changes one character and stays in command mode. `r` or `x` appear in the answer choices as "keys that do not switch to insert mode."

## What You Do in Command Mode

### Moving

| Key | Direction |
|----|------|
| **`h` `j` `k` `l`** | **Left, down, up, right** |
| `0` | The **start** of the line |
| `$` | The **end** of the line |
| **`gg`** | The **first line** of the file |
| **`G`** | The **last line** of the file |
| `numberG` | To that **line number** |
| `w` / `b` | Next / previous word |

- Questions ask for the **order of `h j k l`**. It follows the keyboard layout: **left, down, up, right**. The middle two are easy to mix up.

| Key | Direction |
|----|------|
| `^` | The **first non-blank character** of the line |
| `e` | The **end** of the word |
| `H` / `M` / `L` | The **top / middle / bottom** line of the screen |
| `Ctrl+f` / `Ctrl+b` | **One screen** down (forward) / up (backward) |
| `Ctrl+d` / `Ctrl+u` | **Half a screen** down (down) / up (up) |
| `:number` | To that **line number** (`:10`) |
| `:$` | To the **last line** of the file |

- **Putting a number in front repeats it that many times.** `5j` is five lines down, and `3w` is three words ahead.
- **`$` means different things depending on where it is used.** `$` in command mode is **the end of the line**, while `:$` in ex mode is **the last line of the file**.
- There are several routes to the same place — the first line is `gg`, `1G`, or `:1`, and the last line is `G` or `:$`.
- **`G` is uppercase, `gg` is lowercase twice.** You can also move with the arrow keys, but the exam asks about `h j k l`.

### Delete, Copy, Paste

| Key | What it does |
|----|--------|
| **`x`** | Delete **one character** at the cursor |
| **`dd`** | **Delete one line** (cut) |
| `numberdd` | Delete that many lines — `3dd` is three lines |
| `dw` | Delete one word |
| **`yy`** | **Copy one line** (yank) |
| `numberyy` | Copy that many lines |
| **`p`** | Paste **below** the cursor (paste) |
| `P` | Paste **above** the cursor |
| **`u`** | **Undo** |
| `Ctrl+r` | Redo |

- **`dd` is both delete and cut.** The deleted content stays in the buffer and can be pasted with `p`.
- **`yy` (copy), `dd` (cut), and `p` (paste)** are a set.

| Key | What it does |
|----|--------|
| `X` | Delete one character **before** the cursor |
| `D` | Delete from the cursor **to the end of the line** (same as `d$`) |
| `d0` | Delete from before the cursor **to the start of the line** |
| `dG` | Delete from the current line **to the end of the file** |
| `yw` | Copy one word |
| `J` | **Join the next line onto the end of the current line** (join) |
| `U` | Undo **all changes made on that line** |
| `.` | **Repeat the previous command** |

- There is one rule — **action (`d` delete, `y` copy, `c` change) + range (`w` word, `$` end of line, `G` end of file)**. Typing the same letter twice (`dd`, `yy`, `cc`) targets the **whole line**.
- **`3dd` is three lines downward starting from the line where the cursor is.** The lines above are untouched.
- Where `p` pastes depends on what is in the buffer. **If it is line-based (`dd`, `yy`), it goes on the next line down**, and if it is character-based (`x`, `dw`), it goes after the cursor.

| What you want to do | Key sequence |
|------------|--------|
| **Move** a line elsewhere | `dd` → go to the destination → `p` |
| **Duplicate** a line | `yy` → `p` |
| Copy five lines and paste them at the end of the file | `5yy` → `G` → `p` |
| Undo the deletion you just made | `u` |

## ex Mode — Saving and Quitting

| Command | What it does |
|------|--------|
| **`:w`** | **Save** (write) |
| **`:q`** | **Quit** (quit) |
| **`:wq`** | **Save and quit** |
| **`:q!`** | **Force quit without saving** |
| `:w!` | Force save (read-only files, etc.) |
| `:w filename` | Save under another name |
| `:set nu` | **Show line numbers** |
| `ZZ` | Save and quit (same as `:wq`, in **command mode**) |

> **`!` means force.** If you edit and then do `:q`, a warning "not saved" appears. To discard changes and leave, use **`:q!`**. For questions asking about this command, you need to distinguish it from the wrong answer choices.

```bash
vi test.txt        # open a file (creates it if it does not exist)
vi +10 test.txt    # open at line 10
vi -R test.txt     # open read-only
```

### Warning Messages and the Exclamation Mark

```text
   E37: No write since last change (add ! to override)     ← when you did :q after editing
   E45: 'readonly' option is set (add ! to override)       ← when you did :w in a file opened read-only
```

- Both messages tell you **"add `!` to force it."** In the first case it is `:q!` or `:wq`, and in the second it is `:w!`.
- However, **even `:w!` cannot get past permissions.** If a regular user opened a file they have no write permission for, such as `/etc/passwd`, `:w!` will not save it either. In that case, leave with `:q!` and reopen with root privileges.

| Command | What it does |
|------|--------|
| `:x` | Save and quit — same as `:wq`, but saves **only if something changed** |
| `:wq!` | Force save and then quit |
| `:e filename` | Open another file |
| `:e!` | Discard your edits and **revert to the last saved state** |
| `:r filename` | **Insert** that file's contents **below the cursor** (read) |
| `:!command` | **Run a shell command** without leaving vi — `:!ls` |
| `:sh` | Step out to a shell temporarily. `exit` returns you to vi |
| `:1,5d` | Delete lines 1 through 5 |

- **`:w` is write, `:r` is read in.** The directions are opposite.
- **`ZZ` has no colon.** You press uppercase Z twice in command mode. It is not an ex command.
- There are two ways to discard changes — **`:q!` discards and exits**, **`:e!` discards and keeps editing**.

### Options Given at Launch

| Launch | What it does |
|------|--------|
| `vi + file` | Open at the **last line** |
| `vi +number file` | Open at that line number |
| `vi +/pattern file` | Open at the **first line where that pattern appears** |
| **`vi -R file`** | Open **read-only** (same as `view file`) |
| **`vi -r file`** | **Recover from the swap file** the edits from an abnormal exit |

- **`-R` (uppercase) is read-only, `-r` (lowercase) is recovery.** One letter's case changes the meaning.
- While you edit, vim creates a hidden swap file such as **`.test.txt.swp`**. If the terminal was cut off before you could save, you use this file to bring the work back.

> Tomorrow we cover vi's search and replace, settings, and other editors.

## 📖 Glossary

- **Line editor** : An editor that edits one line at a time. ed and ex belong here.
- **Screen editor** : An editor that edits while viewing the whole screen. vi, emacs, and nano belong here.
- **Command mode** : The mode you are in when you first launch vi. You move, delete, and copy.
- **Insert mode** : The mode where you actually type text. Entered with `i`, `a`, `o`, etc.
- **ex mode** : The mode entered with a colon. It performs saving, quitting, and substitution.
- **`dd`** : The command that cuts one line. It stays in the buffer and can be pasted with `p`.
- **`yy`** : The command that copies one line (yank).
- **`:q!`** : The command that force-quits without saving changes.

## 📝 Practice Questions

**Question 1.** Which of the following is the mode you are in when you first launch the vi editor?

A) Insert mode  
B) ex mode  
C) Command mode  
D) Visual mode  

**Answer: C**  
Explanation: vi starts in command mode. In this state, characters you type do not go into the document but are interpreted as move or delete commands. To enter text, you must switch to insert mode by pressing `i`, `a`, `o`, and so on.

---

**Question 2.** Which of the following commands force-quits the vi editor without saving changes?

A) :q!  
B) :wq  
C) :w!  
D) :q  

**Answer: A**  
Explanation: The exclamation mark means forced execution, so `:q!` discards your edits and exits. Entering only `:q` gives a warning and does not quit if there are changes. `:wq` saves and quits, and `:w!` is a forced save.

---

**Question 3.** Which of the following commands deletes the entire line the cursor is on in the vi editor?

A) x  
B) dd  
C) yy  
D) p  

**Answer: B**  
Explanation: `dd` deletes the whole line where the cursor is, and the deleted content stays in the buffer and can be pasted again with `p`. `x` deletes one character, `yy` copies one line, and `p` pastes.

---

**Question 4.** Who developed the vi editor?

A) Richard Stallman  
B) Linus Torvalds  
C) Brian Fox  
D) Bill Joy  

**Answer: D**  
Explanation: vi was developed by Bill Joy, who also created the C shell (csh). Richard Stallman created emacs and the GNU project, Linus Torvalds created the Linux kernel, and Brian Fox created bash.

---

**Question 5.** Which of the following keys creates a new line below the cursor and switches to insert mode in the vi editor?

A) i  
B) a  
C) o  
D) A  

**Answer: C**  
Explanation: `o` creates a blank line below the line where the cursor is and enters insert mode. Uppercase `O` creates a new line above. `i` inserts before the cursor, `a` inserts after the cursor, and `A` moves to the end of the line and inserts.
