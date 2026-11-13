# Day 2 - vi Search and Replace, and Other Editors

## 📌 Key Points

- Search with **`/pattern` (downward) and `?pattern` (upward)**; the next result is **`n`** and the opposite direction is **`N`**.
- The basic form of substitution is **`:s/find/replace/`**.
- **`%` means the whole file, and `g` means everything within a line.** **`:%s/A/B/g`** is the classic form.
- vi settings are stored in **`~/.vimrc`** (personal) and **`/etc/vimrc`** (global).
- **nano shows its shortcut keys at the bottom of the screen**, and **emacs has no modes**. Only vi has modes.

## Search

| Command | Direction |
|------|------|
| **`/pattern`** | Search **downward** from the cursor |
| **`?pattern`** | Search **upward** from the cursor |
| **`n`** | Next result in the **same direction** |
| **`N`** | Next result in the **opposite direction** |

```text
   /error        search downward for error
   ?error        search upward for error
   n             next result
   N             next result in the opposite direction
```

- A search starts **in command mode**. When you press `/`, an input line appears at the bottom of the screen.
- **The relationship between `n` and `N`** is an exam point. `N` is not "upward"; it is **the opposite of the direction you first searched**. If you searched with `?`, `N` goes downward.

| How the search was first made | Where `n` goes | Where `N` goes |
|---------------|------------|------------|
| **`/pattern`** | Down | Up |
| **`?pattern`** | Up | **Down** |

### Symbols Used in Patterns

| Search | What it finds |
|------|--------|
| `/^root` | Lines that **start with** `root` |
| `/bash$` | Lines that **end with** `bash` |
| `/a.c` | **Any single character** between a and c — abc, a1c |
| `/\<the\>` | The **word** the only (excludes there, other) |
| `/\/etc\/hosts` | A string containing slashes — **write it as `\/`** |

- Since `/` itself is the "start search" symbol, if the string you are looking for contains a slash, **put a backslash in front.**
- The search does not stop at the end. It **wraps around to the beginning and keeps looking**, and the bottom line shows `search hit BOTTOM, continuing at TOP`.
- If nothing is found, `E486: Pattern not found: pattern` appears.
- To ignore case, use **`:set ic`**, and to temporarily turn off search highlighting use `:noh` (vim).

## Substitution

```text
   :  %  s / Seoul / Busan / g
   │  │  │    │        │     │
   │  │  │    │        │     └── g  everything on the line
   │  │  │    │        └──────── replacement string
   │  │  │    └───────────────── string to find
   │  │  └────────────────────── s  substitute
   │  └───────────────────────── %  the whole file
   └──────────────────────────── :  ex mode
```

| Command | Range |
|------|------|
| `:s/A/B/` | Only the **first** A on the **line with the cursor** |
| `:s/A/B/g` | **All** A's on the **line with the cursor** |
| **`:%s/A/B/g`** | **All** A's in the **whole file** |
| `:1,10s/A/B/g` | All A's on **lines 1 through 10** |
| `:%s/A/B/gc` | Replace throughout but **confirm each one** (confirm) |

> **Tell `%` and `g` apart.** `%` decides **up to which lines**, and `g` decides **how many within one line**. **`:%s/A/B/g`**, with both attached, means "replace everything in the whole file."

### Before and After Replacing

This is the result of using each of four commands on the same two lines, with the cursor on line 1.

```text
   Original        1  banana apple          2  grape banana

   :s/a/A/         1  bAnana apple          2  grape banana      only the first on the current line
   :s/a/A/g        1  bAnAnA Apple          2  grape banana      all on the current line
   :%s/a/A/        1  bAnana apple          2  grApe banana      only the first on every line
   :%s/a/A/g       1  bAnAnA Apple          2  grApe bAnAnA      all on every line
```

- The third row is the trap. **With only `%`, just "one per line"** is changed. The `banana` on line 2 stayed as it was.

### How to Write a Range

| Range | Target |
|------|------|
| (omitted) | **The line with the cursor** |
| **`%`** | **The whole file** — same as `1,$` |
| `1,10` | Lines 1 through 10 |
| `.,$` | **From the current line to the last line** |
| `10,$` | From line 10 to the last line |
| `.,+5` | The current line and the five lines below it |

- In a range, **`.` is the current line and `$` is the last line**. `%` is shorthand for `1,$`.
- Ranges are used not only for substitution but for other ex commands too — `:1,5d` deletes lines 1 through 5.

### Commonly Used Substitution Forms

| Command | What it does |
|------|--------|
| `:%s/A//g` | **Delete all** A (leave the replacement empty) |
| `:%s/^/#/` | Add **`#` to the start of every line** — comment out everything at once |
| `:%s/^#//` | Remove the `#` at the start of lines |
| `:%s/A/B/gi` | Replace **ignoring case** |
| `:%s#/usr/local#/opt#g` | Use `#` as the delimiter — when replacing **paths with many slashes** |
| `:g/pattern/d` | **Delete entire lines** containing that pattern |

- The delimiter does not have to be `/`. **The character right after `s`** becomes the delimiter.
- If you add `c`, it asks `replace with B (y/n/a/q/l/^E/^Y)?` at each match. **`y` replace, `n` skip, `a` all the rest, `q` stop.**
- If you replaced wrongly, undo it in command mode with **`u`**. One whole substitution is undone at once.
- **The `g` at the end (an option) and the `:g` at the start (a command) are different things.** The option `g` means "everything in a line," and the command `:g` means "run the following command on every line that has the pattern."

## Commonly Used Settings

| Command | What it does |
|------|--------|
| **`:set nu`** | **Show line numbers** |
| `:set nonu` | Hide line numbers |
| `:set ai` | Auto-indent (autoindent) |
| `:set ts=4` | Set tab size (tabstop) |
| `:set ic` | Ignore case when searching (ignorecase) |
| `:set hlsearch` | Highlight search results |
| `:set sw=4` | Auto-indent width (shiftwidth) |
| `:set sm` | Show matching brackets (showmatch) |
| `:set list` | **Show invisible characters**, such as tabs (`^I`) and line ends (`$`) |
| `:set all` | View the current values of all options |
| `:syntax on` | Turn on syntax highlighting (vim) |

| Abbreviation | Full name | Abbreviation | Full name |
|------|-------|------|-------|
| `nu` | number | `ai` | autoindent |
| `ic` | ignorecase | `ts` | tabstop |
| `sw` | shiftwidth | `sm` | showmatch |

- **To turn one off, put `no` in front** — `nonu`, `noai`, `noic`, `nolist`. It is not that each option has its own separate off command.
- **Options that take a value are given with `=`** — `ts=4`. The form differs from on/off options.
- If you want to know the current value, add a question mark. `:set ts?` answers like `tabstop=8` (the default is 8).

- Settings given this way **disappear when you close the editor.**
- To keep using them, write them in a configuration file.

| File | Scope |
|------|------|
| **`~/.vimrc`** | **Personal** settings |
| **`/etc/vimrc`** | **Global** settings (all users) |
| `~/.exrc` | Personal settings file of the old vi |

```text
   " ~/.vimrc example
   set nu
   set ai
   set ts=4
```

- It is the same structure as the shell's `.bashrc`. **If it starts with `~/` it is personal; if `/etc/` it is global.**
- Inside a configuration file, it is usual to write **`set nu` without a colon**. **Comments start with a double quote (`"`)**, unlike the shell's `#`.
- The global file is read first and then overridden by the personal file. The location of the global file varies by distribution: `/etc/vimrc` on the Red Hat family and `/etc/vim/vimrc` on the Debian family.

| Easily confused file | Actual role |
|------------|----------|
| **`~/.vimrc`** | Settings **you write yourself** |
| `~/.viminfo` | A **record vim leaves automatically** — search terms, command history, copied content. It is not a configuration file |
| `~/.exrc` | The configuration file of the **original vi and ex**. vim reads this only when `~/.vimrc` does not exist |
| `.filename.swp` | A **swap file** created during editing. Used for recovery after an abnormal exit |

## Other Editors

### nano

```text
   ^G Get Help    ^O Write Out    ^X Exit
   └ ^ means the Ctrl key
```

| Shortcut | What it does |
|-------|--------|
| **`Ctrl+O`** | **Save** (Write Out) |
| **`Ctrl+X`** | **Exit** (Exit) |
| `Ctrl+W` | Search |
| `Ctrl+K` | Cut one line |
| `Ctrl+G` | Help |

- **There are no modes.** When you open it, you can start typing right away.
- **A list of shortcuts is always visible at the bottom of the screen.** That is why it is easy for beginners.
- It is **an improved version of pico** and was made by the GNU project.

| Shortcut | What it does |
|-------|--------|
| `Ctrl+U` | **Paste** the cut line |
| `Ctrl+R` | **Read in** the contents of another file |
| `Ctrl+\` | **Replace** a string |
| `Ctrl+C` | Show the current cursor position |

```text
   Ctrl+X
   Save modified buffer?   Y Yes   N No   ^C Cancel     ← Y
   File Name to Write: memo.txt                         ← Enter
```

- **If you press `Ctrl+X` after editing, it asks whether to save.** After `Y`, you confirm the file name and press Enter, and it saves and exits. It does not hold out with just a warning, as vi does.
- In the list at the bottom of the screen, **`^` is the Ctrl key and `M-` is the Alt (Meta) key**.
- pico was originally **an editor bundled with the mail program Pine**. nano is its remake as free software.

### emacs

| Shortcut | What it does |
|-------|--------|
| **`Ctrl+X Ctrl+S`** | Save |
| **`Ctrl+X Ctrl+C`** | Exit |
| `Ctrl+G` | Cancel a command |

- It was created by **Richard Stallman**. It is the editor of the GNU project.
- **It has no modes**; instead it invokes every feature with **Ctrl and Meta (Alt) key combinations**.
- Its features can be extended in Lisp, so it is called an environment that goes beyond an editor.

| Shortcut | What it does |
|-------|--------|
| `Ctrl+X Ctrl+F` | Open a file (find file) |
| `Ctrl+S` / `Ctrl+R` | Search downward / upward |
| `Ctrl+K` | Cut from the cursor to the end of the line (kill) |
| `Ctrl+Y` | Paste (yank) |
| `Ctrl+A` / `Ctrl+E` | Start / end of the line |
| `Ctrl+X u` | Undo |

- `Ctrl+X Ctrl+S` means **holding Ctrl while pressing x, then s**. The emacs documentation writes this as **`C-x C-s`**. `C-` is Ctrl and `M-` is Meta (Alt).
- **Both saving and exiting start with `Ctrl+X`** and differ only in the following letter — **with `Ctrl+S` it is save, with `Ctrl+C` it is exit**.
- **The meaning of yank is the opposite of vi.** vi's `yy` is **copy**, while emacs's `Ctrl+Y` is **paste**.
- The `Ctrl+A`, `Ctrl+E`, `Ctrl+K`, and `Ctrl+R` on the bash command line are exactly **emacs-style shortcuts**. The keys we used last week come from here.
- emacs runs on the console and also in a graphical window under X Window.

### Comparing the Three Editors

| Category | **vi / vim** | **emacs** | **nano** |
|------|------------|----------|---------|
| Creator | **Bill Joy** | **Richard Stallman** | GNU (pico improvement) |
| **Modes** | **Yes (3)** | **None** | **None** |
| Save | `:w` | `Ctrl+X Ctrl+S` | `Ctrl+O` |
| Exit | `:q` | `Ctrl+X Ctrl+C` | `Ctrl+X` |
| Configuration file | `~/.vimrc` | `~/.emacs` | `~/.nanorc` |
| Character | Available everywhere | Highly extensible | Easy to learn |

> The answer to **"Which editor has modes?"** is **vi**. emacs and nano have no modes.

### The Same Task in Three Editors

| What you want to do | vi / vim | emacs | nano |
|---------|---------|-------|------|
| Save and quit | `:wq` | `Ctrl+X Ctrl+S` then `Ctrl+X Ctrl+C` | `Ctrl+X` then `Y`, Enter |
| Quit without saving | `:q!` | `Ctrl+X Ctrl+C` then answer no to saving | `Ctrl+X` then `N` |
| Search | `/pattern` | `Ctrl+S` | `Ctrl+W` |
| Cut one line | `dd` | `Ctrl+K` (cursor to end of line) | `Ctrl+K` |
| Paste | `p` | `Ctrl+Y` | `Ctrl+U` |

- **If the shortcut is a `Ctrl` combination it is emacs or nano; if it is a colon or a single letter it is vi.** When they are mixed in the choices, split them by this criterion first.
- **If it ends with a single `Ctrl+X` it is nano; if it takes `Ctrl+X Ctrl+C` twice it is emacs.** The exit keys are similar, so questions swap them.
- `Ctrl+K` is cut in both editors, but pasting differs: `Ctrl+Y` in emacs and `Ctrl+U` in nano.

> Tomorrow we cover running programs: the concept and types of processes.

## 📖 Glossary

- **`/pattern`** : The vi command that searches for a string downward from the cursor.
- **`n` / `N`** : Keys that move through search results in the same direction / the opposite direction.
- **Substitute** : The ex command that replaces strings in the form `:s/A/B/`.
- **`%`** : A range symbol that makes the whole file the target of a substitution.
- **`g`** : An option that makes a substitution replace every match within a line.
- **`~/.vimrc`** : vim's personal configuration file. The global configuration is `/etc/vimrc`.
- **nano** : A GNU editor that improves on pico. It has no modes and shows shortcuts at the bottom of the screen.
- **emacs** : A highly extensible editor created by Richard Stallman. It is operated with key combinations rather than modes.

## 📝 Practice Questions

**Question 1.** Which of the following vi commands replaces every `apple` in the whole file with `orange`?

A) :s/apple/orange/  
B) :%s/apple/orange/g  
C) :s/apple/orange/g  
D) :%s/apple/orange/  

**Answer: B**  
Explanation: `%` sets the whole file as the range, and `g` makes it replace all matches within a line. You need both together for every string in the document to be replaced. Without `%`, only the line with the cursor changes, and without `g`, only the first match on each line changes.

---

**Question 2.** Which of the following vi commands displays line numbers on the screen?

A) :set ai  
B) :set ic  
C) :set nu  
D) :set ts=4  

**Answer: C**  
Explanation: `:set nu` (number) shows a number in front of each line, and you can hide them again with `:set nonu`. `ai` is auto-indent, `ic` is ignoring case when searching, and `ts` is the option that sets the tab size.

---

**Question 3.** Which of the following is the file that stores vim's personal environment settings?

A) ~/.bashrc  
B) /etc/profile  
C) ~/.viminfo  
D) ~/.vimrc  

**Answer: D**  
Explanation: Per-user vim settings are stored in `~/.vimrc` in the home directory, and to apply them to all users you record them in `/etc/vimrc`. `~/.bashrc` is a shell configuration file, and `/etc/profile` is a global login configuration file.

---

**Question 4.** Which of the following editors has no distinct editing modes, so you can type characters immediately after launching it?

A) nano  
B) vi  
C) vim  
D) ex  

**Answer: A**  
Explanation: nano has no mode distinction, so you can type characters as soon as you launch it, and the main shortcuts are shown at the bottom of the screen. vi and vim have three modes (command, insert, and ex) and are in command mode right after launch. ex is a line editor that works line by line.

---

**Question 5.** Which of the following is the shortcut that saves what you have written in the nano editor?

A) Ctrl+X  
B) Ctrl+W  
C) Ctrl+O  
D) Ctrl+S  

**Answer: C**  
Explanation: In nano, saving is `Ctrl+O` (Write Out) and exiting is `Ctrl+X` (Exit). The help at the bottom of the screen shows them like `^O`, where the `^` symbol means the Ctrl key. `Ctrl+W` is the shortcut for searching a string.
