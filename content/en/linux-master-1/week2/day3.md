# Day 3 - Mastering vi/vim: The Beauty of an Editor You Never Have to Take Your Hands Off

## 📌 Key Takeaways

- `vi` is **mode**-based. Command mode (default) ↔ Insert mode (`i`·`a`·`o`) ↔ Last-line mode (`:`).
- The keys that enter insert mode differ by position — `i` before the cursor, `a` after the cursor, `I` start of line, `A` end of line, `o` line below, `O` line above.
- The three editing essentials: `dd` (delete line = cut) · `yy` (copy line) · `p`/`P` (paste). Undo with `u`.
- Save and quit: `:wq` always rewrites the file, while `:x` and `ZZ` save **only if changed**.
- Global substitution is `:%s/old/new/g`. `%` means "all lines in the file," and the syntax shares one root with `sed`.

## The Heart of vi: Three Modes

`vi` exists almost without exception on remote servers with no graphical environment and on minimal installations. That is why it is not an option but a must for administrators.

**From vi to vim.** `vi` (visual editor) is an editor created by Bill Joy in 1976. `vim` (Vi IMproved) is a modern version made by Bram Moolenaar in 1991 by improving `vi`, adding syntax highlighting, multi-level undo, split windows, and more. On most Linux systems today, typing `vi` actually runs `vim`.

- The key to understanding `vi` is the mode. Pressing the same key behaves completely differently depending on which mode you are in.

| Mode | Role | How to enter |
|------|------|-----------|
| Command mode | Cursor movement, copy/delete, running commands | Default at startup, return with `Esc` |
| Insert mode | Typing actual text | `i`, `a`, `o`, etc. |
| Last-line (ex) mode | Save, quit, search/substitute | `:` from command mode |

- When you start `vi`, you begin in **command mode**.
- To type text, press `i` or similar to enter **insert mode**, and when you are done typing, return to command mode with `Esc`.
- To save or quit, press `:` in command mode to enter **last-line mode**.

**Why were modes separated?** In a typical editor, a letter key is input and functions are handled with Ctrl or Alt combinations. `vi` flips that idea: in command mode every letter key acts as an editing command. Thanks to this, you can do powerful editing in one or two keystrokes without moving your hands, as with `dd` (delete line) and `yy` (copy line). This efficiency is why `vi` has been loved for decades.

## Entering Insert Mode

Even for the same insert mode, the cursor position differs depending on the key you enter with. This is an easily confusing area.

| Key | Action |
|----|------|
| `i` | Start typing before the cursor (at the current position) (insert) |
| `a` | Start typing after the cursor (append) |
| `I` | Start typing at the very beginning of the line |
| `A` | Start typing at the very end of the line |
| `o` | Open a new line below the current line and type (open) |
| `O` | Open a new line above the current line and type |

> ⚠️ **Pitfall: the difference between i and a, o and O**
> If the exam asks "Which key starts typing from after the cursor position?", the answer is `a` (append), not `i` (insert). You also need to distinguish exactly that `o` opens the line below and `O` (uppercase) the line above, and that `I` is the start of the line and `A` is the end of the line. A single uppercase or lowercase letter completely changes the result.

## Cursor Movement in Command Mode

The real value of `vi` is in moving around while keeping your hands on the home position.

```
h  ←  One column left
l  →  One column right
j  ↓  One line down
k  ↑  One line up
w     To the start of the next word
b     To the start of the previous word
e     To the end of the word
0     To the very start of the line (column 0)
^     To the first character of the line (excluding whitespace)
$     To the very end of the line
gg    To the first line of the file
G     To the last line of the file
5G    To line 5 (or :5)
Ctrl+f  One screen down (forward)
Ctrl+b  One screen up (backward)
```

**Why hjkl became arrows.** The ADM-3A terminal used by Bill Joy, who created `vi`, had no arrow keys, and the h/j/k/l keys had arrows printed on them. That is why these four keys became the movement keys. Thanks to this convention that has lasted to this day, vim users can move quickly without lifting their hands off the home position.

## Delete, Copy, and Paste

These are the editing commands performed in command mode.

| Command | Action |
|------|------|
| `x` | Delete the single character at the cursor |
| `dd` | Delete (cut) the current line |
| `3dd` | Delete 3 lines starting from the current line |
| `dw` | Delete from the cursor to the end of the word |
| `D` | Delete from the cursor to the end of the line |
| `yy` | Copy (yank) the current line |
| `3yy` | Copy 3 lines |
| `p` | Paste the copied/deleted content after (below) the cursor |
| `P` | Paste before (above) the cursor |
| `u` | Undo |
| `Ctrl+r` | Redo |
| `.` | Repeat the previous command (repeat) |

**vi's "cut" is also a copy.** Instead of a separate clipboard, `vi` has a temporary storage space called a register. When you delete a line with `dd`, its content is stored in a register, so you can paste it elsewhere with `p`. In other words, `dd` is both "delete" and "cut." That is why, when rearranging the order of lines, a common pattern is to press `dd` and then `p` at the desired position.

## Searching

- In command mode, searching starts with `/` (downward) and `?` (upward).
- You can use regular expressions in a search. For example, `/^root` finds lines that start with root.

```
/error      Search downward for error
?error      Search upward for error
n           Go to the next match (same direction)
N           Go to the previous match (opposite direction)
```

## Last-line (ex) Mode: Saving and Quitting

Pressing `:` in command mode takes you into ex mode, where you type commands at the very bottom of the screen.

| Command | Action |
|------|------|
| `:w` | Save (write) |
| `:w filename` | Save under another name |
| `:q` | Quit |
| `:q!` | Force quit without saving |
| `:wq` | Save and quit |
| `:x` | Save and quit only if changed |
| `ZZ` | (command mode) Save and quit — equivalent to :wq |
| `:wq!` | Force save and quit |
| `:5` | Go to line 5 |
| `:set nu` | Show line numbers (number) |
| `:set nonu` | Hide line numbers |

> ⚠️ **Pitfall: the subtle differences among :wq, :x, and ZZ**
> `:wq` always rewrites the file regardless of whether it changed (the timestamp is updated). `:x` and `ZZ` save **only if changed**, so if you changed nothing they don't touch the file and the timestamp is preserved. It is a subtle difference, but it is tested on the exam, and it also matters in practice in environments where timestamps matter, such as build systems.

## Substitution: A Powerful Feature of ex Mode

- In ex mode, the `s` (substitute) command replaces text. The syntax is very similar to `sed`.
- `%` is a range specifier meaning "all lines in the file." `:%s/.../.../g` is the classic pattern.

```
:s/old/new/          Replace the first old in the current line with new
:s/old/new/g         Replace all old in the current line with new
:%s/old/new/g        Replace all old in the whole file with new
:%s/old/new/gc       Replace in the whole file, confirming each time (confirm)
:1,10s/old/new/g     Replace within the range of lines 1 to 10
:%s/old/new/gi       Replace across the whole file, ignoring case
```

**vi's substitution and the roots of sed.** It is no coincidence that `vi`'s ex-mode substitution `:%s/old/new/g` resembles `sed`'s `s/old/new/g`. Both belong to one family descended from the line editor `ed`. If you know the lineage `ed` → `ex` → `vi`, it becomes natural to understand why ex-mode commands have this syntax.

## Configuration: .vimrc

- You can permanently configure vim's behavior with the `.vimrc` file in your home directory.
- If you write into this file what you set temporarily with the `:set` command in ex mode, it is applied every time.

```vim
set number          " Show line numbers
set autoindent      " Automatic indentation
set tabstop=4       " Tab width of 4 columns
set expandtab       " Convert tabs to spaces
set hlsearch        " Highlight search results (highlight)
set ignorecase      " Ignore case when searching
syntax on           " Turn on syntax highlighting
```

**Configuration files that start with a dot (.).** Files that start with a dot, like `.vimrc` and `.bashrc`, are hidden files that `ls` doesn't show by default. The trailing `rc` is short for "run commands," meaning a collection of commands a program runs automatically when it starts. It is an old convention that originates from "runcom" in the early Unix-era CTSS system.

## nano Overview: A Beginner-Friendly Editor

- `nano` is an editor with the opposite philosophy of `vi`.
- It has no modes, you can type right away as soon as you start it, and a guide to the shortcut keys is always displayed at the bottom of the screen.

```bash
nano file.txt       # Open a file with nano
```

Main shortcuts (`^` is the Ctrl key):

| Shortcut | Action |
|--------|------|
| `Ctrl+O` | Save (write Out) |
| `Ctrl+X` | Exit |
| `Ctrl+W` | Search (Where is) |
| `Ctrl+K` | Cut line |
| `Ctrl+U` | Paste |
| `Ctrl+G` | Help |

- `nano` is convenient for simple configuration edits, but it lacks `vi`'s powerful editing commands and its guaranteed availability everywhere.

## emacs Overview: Another Giant

- `emacs` is counted alongside `vi` as one of the two great Unix editors. Created by Richard Stallman, it is so extensible that it is practically closer to an operating system.
- If `vi` is mode-based, `emacs` invokes every function with Ctrl/Meta (Alt) key combinations.

| Shortcut | Action |
|--------|------|
| `Ctrl+X Ctrl+S` | Save |
| `Ctrl+X Ctrl+C` | Exit |
| `Ctrl+K` | Cut to the end of the line |
| `Ctrl+Y` | Paste |
| `Ctrl+S` | Search |

**The vi vs emacs debate.** In the "editor wars" that lasted for decades, `vi` formed its camp on being lightweight and available everywhere, and `emacs` on being infinitely extensible. From an exam and practical standpoint, the safest choice is to know how to use `vi`, which is installed on any minimal system.

## Try It Yourself

You have to learn `vi` with your hands. Follow along with the following yourself.

```bash
# 1. Create a new file with vi
vi practice.txt

# Inside vi, in order:
# Press i to enter insert mode
# Type the content below:
#   Hello Linux
#   This is vi practice
#   Line three
# Press Esc to return to command mode

# 2. Cursor movement practice (in command mode)
# gg → to the first line, G → to the last line
# w → move by word, $ → end of line, 0 → start of line

# 3. Editing practice
# dd → delete a line, u → undo
# yy then p → copy and paste a line

# 4. Search and substitute
# Type /vi then Enter → search for vi, n for the next one
# Type :%s/Line/Row/g → replace Line with Row everywhere

# 5. Save and quit
# Type :wq then Enter

# 6. Check the result
cat practice.txt
rm practice.txt
```

- At first the mode switching is confusing, but once you get into the rhythm of "if letters aren't going in, press Esc and then i first," it quickly becomes comfortable.
- Just getting `dd`, `yy`, `p`, and `:wq` into your fingers solves 90% of server work.

## 📖 Glossary

- **Mode** : A state of vi that makes the same key behave differently. There are three: command, insert, and last-line (ex).
- **Command mode** : The state you first enter when you start vi. All letter keys act as editing commands.
- **ex mode (last-line mode)** : The command line at the bottom of the screen that you enter by pressing `:`. You save, quit, and substitute here.
- **Register** : A temporary storage space equivalent to vi's clipboard. What you `dd` is held here and revived with `p`.
- **yank** : vi's word for "copy." This is why copying a line is `yy`.
- **`:x` / `ZZ`** : Commands that save and exit only if the contents changed. Unlike `:wq`, they preserve the timestamp.
- **`%` (range specifier)** : In ex commands it means "all lines in the file." This is why `:%s/old/new/g` is a global substitution.
- **`.vimrc`** : The personal configuration file vim reads at startup. The trailing `rc` stands for "run commands."
- **hjkl** : vi's left, down, up, right movement keys. They originate from the ADM-3A terminal, which had no arrow keys.
- **nano** : A beginner-oriented editor with no modes and shortcuts shown at the bottom. `Ctrl+O` saves, `Ctrl+X` exits.
- **emacs** : An extensible editor that invokes every function with Ctrl/Meta combinations. It is one of the two great pillars alongside vi.

## 📝 Practice Questions

**Question 1.** In `vi`, which key starts typing text after (behind) the current cursor position?

A) `i`
B) `a`
C) `o`
D) `I`

**Answer: B**
Explanation: `a` (append) starts typing after the cursor. `i` (insert) starts before the cursor, `o` opens a new line below, and `I` starts typing at the very beginning of the line.

---

**Question 2.** In `vi` command mode, which command deletes the current line?

A) `x`
B) `dw`
C) `dd`
D) `yy`

**Answer: C**
Explanation: `dd` deletes (cuts) the entire current line. `x` deletes one character, `dw` deletes a word, and `yy` copies a line (it is not a delete).

---

**Question 3.** In `vi`, which command force-quits without saving?

A) `:wq`
B) `:q`
C) `:q!`
D) `:x`

**Answer: C**
Explanation: `:q!` discards changes and force-quits. `:wq` saves and quits, `:q` refuses to quit if there are changes, and `:x` saves and quits only if changed.

---

**Question 4.** In `vi` ex mode, which command replaces every `apple` in the whole file with `orange`?

A) `:s/apple/orange/`
B) `:s/apple/orange/g`
C) `:%s/apple/orange/g`
D) `:1,5s/apple/orange/g`

**Answer: C**
Explanation: `%` means all lines in the file and `g` means all matches within a line, so `:%s/apple/orange/g` replaces every match in the whole file. A handles only the first match on the current line, B only the current line, and D only lines 1 to 5.

---

**Question 5.** In `vi`, which command pastes content that was copied (yanked)?

A) `y`
B) `p`
C) `c`
D) `d`

**Answer: B**
Explanation: `p` (paste/put) pastes content that was copied or deleted. `y` is copy (yank), `c` is change, and `d` is delete.

---

**Question 6.** To permanently set vim to show line numbers, which entry should you add to `.vimrc`?

A) `set number`
B) `set autoindent`
C) `syntax on`
D) `set hlsearch`

**Answer: A**
Explanation: `set number` (or `set nu`) shows line numbers. `set autoindent` is automatic indentation, `syntax on` is syntax highlighting, and `set hlsearch` highlights search results.

---

**Question 7.** In the `nano` editor, which shortcut saves (writes out) the file?

A) `Ctrl+X`
B) `Ctrl+O`
C) `Ctrl+W`
D) `Ctrl+K`

**Answer: B**
Explanation: In `nano`, `Ctrl+O` (write Out) is save. `Ctrl+X` is exit, `Ctrl+W` is search (Where is), and `Ctrl+K` is cut line.

---
