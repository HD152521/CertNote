# Day 4 - Filesystem Structure and File Types: Everything Is a File

## 📌 Key Takeaways

- Linux is a **single-root (`/`)** tree, and the directory layout is agreed upon by the **FHS** standard.
- `/proc` and `/sys` are **virtual filesystems** that the kernel generates in memory, not on disk.
- There are 7 file types, shown by the first character of `ls -l` — `-` d l b c s p.
- The essence of a file is not its name but its **inode**. The name exists only in a directory's "name → inode number" table.
- **Hard link = another name for the same inode** (not allowed across partitions or for directories), **symbolic link = a new inode that holds a path** (both allowed).

## FHS — The Agreement on Directory Structure

We'll look at how the "everything is a file" philosophy we met in Day 1 is actually implemented, starting with its first pillar, the **spatial structure**.

- Layouts such as `/bin`, `/etc`, and `/var` are not random; they follow an official convention called the **FHS (Filesystem Hierarchy Standard)**.
- Thanks to this, whichever distribution you use, the promise "configuration files are in `/etc`, logs are in `/var/log`" holds. Without this standard, locations would vary by distribution and administration would be impossible.
- It is fundamentally different from Windows. Windows has a separate root for each drive, like `C:` and `D:`, but Linux is a **single hierarchical tree** that extends from **one root (`/`)**.
- Other disks or USB drives are "mounted" on a specific directory of this tree and merged in as branches.

| Directory | Role | Key contents |
|---------|------|----------|
| `/` | Root | The starting point of the whole tree |
| `/bin` | Essential commands | Basic commands for all users, such as ls, cp, cat |
| `/sbin` | System commands | Administrator commands such as fdisk, ip |
| `/etc` | Configuration files | System-wide settings such as passwd, fstab |
| `/home` | User homes | Personal directories of regular users |
| `/root` | Administrator home | Home directory of the root account |
| `/var` | Variable data | Logs (/var/log), mail, cache |
| `/tmp` | Temporary files | Temporary space that may be deleted on reboot |
| `/usr` | User programs | Additionally installed applications (/usr/bin) |
| `/dev` | Device files | Representations of hardware such as disks and terminals |
| `/proc` | Process information | Virtual filesystem, kernel/process state |
| `/sys` | System information | Virtual filesystem, hardware/driver information |
| `/lib` | Shared libraries | Libraries used by /bin and /sbin |
| `/boot` | Boot files | Kernel (vmlinuz), initramfs, GRUB |
| `/mnt`, `/media` | Mount points | Temporary mounts (/mnt), automatic mounts (/media) |
| `/opt` | Optional packages | Large third-party applications |

`/bin` and `/sbin` have different uses. `/bin` holds general commands used by all users (ls, cp), while `/sbin` holds system administration commands mainly used by the administrator (root), such as fdisk and reboot. The "s" stands for system or superuser. Likewise, `/usr/bin` and `/usr/sbin` follow the same distinction. Recent distributions are trending toward merging `/bin` into `/usr/bin` as a symbolic link (usrmerge).

## Virtual Filesystems — /proc and /sys

- `/proc` and `/sys` are not files that actually exist on disk, but **virtual filesystems** that the kernel generates in memory in real time.
- This is where the "everything is a file" philosophy shows up most dramatically.
- You can inspect the kernel's internal state, such as process information, CPU information, and memory usage, just by reading files.

```bash
# /proc - read kernel and process information like files
cat /proc/cpuinfo           # Detailed CPU information
cat /proc/meminfo           # Memory usage status
cat /proc/version           # Kernel version
ls /proc/1/                 # Information directory of the PID 1 process

# /sys - hardware and driver information
cat /sys/class/net/eth0/address    # MAC address of the network interface

# Try it yourself: count your CPU cores from the file
grep -c processor /proc/cpuinfo
```

Each numeric directory in `/proc` (`/proc/1234`) corresponds to the process with PID 1234. By reading `status`, `cmdline`, and `fd/` inside it, you can find out what command that process was started with and which files it has open. Tools like `top` and `ps` actually work by reading `/proc` internally. Virtual filesystem files appear to be 0 bytes in size, but reading them produces real-time data.

## The 7 Kinds of Files

The single first character of the `ls -l` output tells you the file's type. This identifier character is a point tested on the Level 1 exam.

| Identifier | Type | Description |
|--------|------|------|
| `-` | Regular file | Text, executable binaries, images, etc. |
| `d` | Directory | A folder that holds other files |
| `l` | Symbolic link | A shortcut pointing to another file |
| `b` | Block device | Block-unit I/O like a disk (e.g., /dev/sda) |
| `c` | Character device | Character-unit I/O like a keyboard (e.g., /dev/tty) |
| `s` | Socket | Bidirectional communication between processes |
| `p` | Pipe (named pipe, FIFO) | Unidirectional communication between processes |

```bash
# Check the file type from the first character of ls -l
ls -l /dev/sda              # Starts with b → block device
ls -l /dev/tty             # Starts with c → character device
ls -l /etc/passwd          # Starts with - → regular file
ls -ld /etc                # Starts with d → directory

# Determine the file type from its content with the file command
file /etc/passwd           # ASCII text
file /bin/ls               # ELF executable binary
```

- **Block device (b)**: Reads and writes data in fixed-size blocks, with buffering and random access possible. Disks, SSDs, USB drives.
- **Character device (c)**: Streams data sequentially, one character at a time. Keyboards, mice, serial ports, terminals.
- **Socket (s) and pipe (p)**: Means of inter-process communication (IPC). A pipe (FIFO, named pipe) flows in one direction only, while a socket is bidirectional and is also used for network communication.

> ⚠️ **Pitfall**: If the exam asks "What kind of device file is the disk /dev/sda?", the answer is **block device (b)**. If it asks "What about a keyboard or terminal?", it's **character device (c)**. It is easy to confuse the distinction between block (random access, buffered) and character (sequential, stream). The 's' in `/dev/sda` stands for SCSI/SATA, not the 's' of socket.

## inode — The True Identity of a File

To understand links, you first need to know the **inode** (index node). It is the most fundamental concept in Linux filesystems.

- People often think "file = name + content," but on Linux the essence of a file is the **inode**. An inode is a data structure that holds all the metadata about a file.
  - File type and access permissions (rwx)
  - Owner (UID) and group (GID)
  - File size
  - Timestamps (modification, access, and change times)
  - Link count (the number of names pointing to this inode)
  - **The addresses of the disk blocks where the actual data is stored**
- The key point is that **the file name is not included in the inode**. The file name is simply stored inside a directory as a "name → inode number" mapping.
- In other words, a directory is really "a table holding pairs of names and inode numbers."

```bash
# Check the inode number
ls -i file.txt             # Show the file's inode number
stat file.txt              # Details: inode number, size, permissions, timestamps, etc.
df -i                      # inode usage per filesystem
```

The number of inodes is fixed when a filesystem is created. Even if disk capacity remains, once inodes are exhausted you can no longer create files (check with `df -i`). The "No space left on device" error with space still available on a mail server or other system that creates countless small files is caused by exactly this inode exhaustion. This is why inodes matter in practice.

## Hard Link vs. Symbolic Link — The Key Comparison

This is a key topic in scope for the Level 1 exam.

- **Hard link** = **another name pointing to the same inode**.
  - It doesn't create a new inode; it only adds one more name (directory entry) that points to the existing inode.
  - The original and the hard link have **exactly the same** inode number and are effectively equivalent. You can't tell which of the two is the "original."
  - The inode's link count increases by 1, and the actual data is deleted only when all names are removed and the link count reaches 0.
- **Symbolic link (soft link)** = **a separate file that holds the path (name) of another file**. It is like a Windows "shortcut."
  - It has its own new inode, and inside it the "path of the target" is stored as a string.
  - To reach the original, it follows that path.

| Item | Hard link | Symbolic link |
|------|---------|-----------|
| inode | Same as the original | Its own new inode |
| What it points to | The inode (data) directly | A path (name) string |
| When the original is deleted | Data is kept (only the link count decreases) | Becomes a broken (dangling) link |
| Across filesystems | Impossible | Possible |
| Directory target | Impossible (in general) | Possible |
| Size | Same as the original | Length of the target path string |

```bash
# Create a hard link (ln, no options)
ln original.txt hardlink.txt
ls -li original.txt hardlink.txt   # Confirm the inode numbers are identical

# Create a symbolic link (ln -s)
ln -s original.txt symlink.txt
ls -li original.txt symlink.txt    # Different inode numbers, shown with l

# Try it yourself: delete the original and observe the difference
echo "hello" > orig.txt
ln orig.txt hard.txt
ln -s orig.txt soft.txt
rm orig.txt
cat hard.txt               # Prints normally (data is kept)
cat soft.txt               # No such file (broken link)
```

- The exercise above best shows the essential difference between the two kinds of links.
- Even if you delete the original `orig.txt`, the hard link `hard.txt` points directly to the same inode, so the data survives (the link count simply dropped from 2 to 1).
- The symbolic link `soft.txt`, on the other hand, stores "the path orig.txt," and since that path is gone, it becomes a broken link.

> ⚠️ **Pitfall**: "A symbolic link can point to another filesystem (partition) and to a directory, but a hard link can do neither" is the key exam point. The reason is clear. Hard links share an inode number, and inode numbers are unique only within each filesystem, so they cannot cross partitions. Directory hard links are prohibited to prevent loops from forming in the filesystem tree, which would send tools like `find` into infinite repetition.

If you view a directory with `ls -l`, there is a number next to the permissions (e.g., `drwxr-xr-x 2`). That number is the inode's **link count**. When you create a new directory, the link count is 2 by default. This is because 2 hard links are created automatically: `.` pointing to itself, and the name by which the parent points to the child. Each time you create a subdirectory, the `..` inside it points to the parent, so the parent's link count increases by 1.

Even Dennis Ritchie has said he doesn't remember exactly where the name "inode" came from. The most likely theory is that it's short for "index node," meaning a node that indexes a file's information. This concept, born in the early Unix filesystem design of the early 1970s, is still alive 50 years later as the foundation of Linux filesystems such as ext4 and XFS.

## Absolute Paths and Relative Paths

- **Absolute path**: A complete path that starts from the root (`/`). It always starts with `/` and points to the same file regardless of the current location. Example: `/home/user/docs/file.txt`.
- **Relative path**: A path based on the current working directory (pwd). It does not start with `/`.
- Special symbols: `.` (current directory), `..` (parent directory), `~` (home directory).

```bash
pwd                        # Show the current working directory (absolute path)
cd /etc                    # Move using an absolute path
cd ../var                  # Relative path: go up to the parent, then into var
cd ~                       # To the home directory
cd -                       # Toggle to the previous directory
```

`.` and `..` are not mere symbols but hard links that actually exist in every directory. If you view with `ls -a`, every directory shows `.` (itself) and `..` (parent). This connects to why a directory's default link count is 2.

Next time, we'll do a comprehensive review of this week's operating system concepts, licenses, booting, and filesystems, and check your skills with exam-style questions.

## 📖 Glossary

- **FHS**: The standard that decides what to put where in Linux directories. It's why locations are the same even across different distributions.
- **Mount**: Attaching a separate disk or partition to a specific directory of the tree to merge it into one tree.
- **Virtual filesystem**: Files like `/proc` and `/sys` that the kernel generates in memory in real time, not on disk.
- **inode**: The data structure holding a file's metadata (permissions, owner, size, data block addresses). The file name is not in it.
- **inode exhaustion**: A state where capacity remains but all inodes are used up so files can't be created. Check with `df -i`.
- **Link count**: The number of names pointing to one inode. The actual data is erased only when it reaches 0.
- **Hard link**: Another name pointing to the same inode. It can't cross partitions and can't be made for directories.
- **Symbolic link**: A separate file holding the target's path string. It becomes a broken link when the original disappears.
- **Block device / character device**: A device with block-unit random access (disk) and a device that streams one character at a time (keyboard, terminal).
- **FIFO (named pipe)**: A one-way inter-process communication channel that looks like a file. Shown as `p` in `ls -l`.
- **Absolute path / relative path**: A complete address starting from `/`, and an address based on the current location.

## 📝 Practice Questions

**Question 1.** In the `ls -l` output, which pairing of the leading identifier character and file type is NOT correct?

A) `b` is a block device file that does block-unit I/O like a disk
B) `c` is a character device file that does character-unit I/O like a keyboard
C) `l` is a symbolic link file that holds the path of another file
D) `p` is a socket file used for bidirectional communication between processes

**Answer: D**

Explanation: `p` is a pipe (named pipe, FIFO) used for unidirectional communication, and the socket for bidirectional communication is shown as `s`. Therefore D is wrong. A is correct. `b` is a block device (disk). B is correct. `c` is a character device (keyboard, terminal). C is correct. `l` is a symbolic link that holds a path.

---

**Question 2.** Which is a correct description of the difference between hard links and symbolic links?

A) A hard link has a different inode from the original, and a symbolic link has the same inode as the original
B) A hard link can be created across filesystems (partitions), but a symbolic link cannot
C) A hard link points to the same inode as the original, so the data is kept even if the original is deleted
D) A symbolic link always keeps the data and does not break even if the original is deleted

**Answer: C**

Explanation: A hard link is another name pointing to the same inode as the original, so even if you delete the original name, only the inode's link count decreases and the data is kept. A is the opposite. The hard link has the same inode, and the symbolic link has a new inode. B is the opposite. A hard link cannot cross partitions because it shares the inode, while a symbolic link can. D is wrong. A symbolic link becomes a broken (dangling) link when the original disappears.

---

**Question 3.** Which information is NOT stored in an inode in a Linux filesystem?

A) The file's access permissions (rwx), owner (UID), and group (GID)
B) The file's name (filename)
C) The file size and timestamps (modification and access times)
D) The addresses of the disk blocks where the actual data is stored

**Answer: B**

Explanation: An inode holds the file's metadata (permissions, owner, size, timestamps, data block addresses, etc.), but it does not include the file name. The file name is stored separately inside a directory as a "name → inode number" mapping. This is the fundamental principle that makes hard links possible. A, C, and D are all information that the inode holds.

---

**Question 4.** Which of the following directory roles according to the FHS (Filesystem Hierarchy Standard) is NOT correct?

A) `/etc` holds system-wide configuration files such as passwd and fstab
B) `/var` holds frequently changing data such as logs (/var/log), mail, and cache
C) `/proc` holds the kernel image (vmlinuz) and GRUB files needed for booting
D) `/dev` holds device files that represent hardware such as disks and terminals

**Answer: C**

Explanation: The kernel image (vmlinuz) and bootloader (GRUB) files are located in `/boot`. `/proc` is a virtual filesystem that shows kernel and process information in real time, so C is wrong. A is correct. `/etc` is the global configuration directory. B is correct. `/var` holds variable data (logs, etc.). D is correct. `/dev` is the device file directory.

---

**Question 5.** Which is a correct description of the `/proc` and `/sys` directories?

A) They are stored as real files on disk and their contents are preserved after reboot
B) They are virtual filesystems that the kernel generates in memory in real time
C) They are part of the home directory that stores users' personal documents
D) They are optional package directories for installing third-party applications

**Answer: B**

Explanation: /proc and /sys do not exist on disk; they are virtual filesystems the kernel generates in memory in real time, and you can read process information (/proc) and hardware/driver information (/sys) like files. A is wrong. Being virtual filesystems, they are not stored on disk and are regenerated on reboot. C describes /home. D describes /opt.

---

**Question 6.** After running the following commands in order, which is the correct result of the final `cat soft.txt`?

```
echo "data" > orig.txt
ln orig.txt hard.txt
ln -s orig.txt soft.txt
rm orig.txt
```

A) "data" is printed normally, because the symbolic link keeps the data itself
B) A "No such file or directory" error occurs, because the path the symbolic link pointed to is gone
C) An empty line is printed, because a symbolic link automatically becomes an empty file when the original is deleted
D) "data" is printed, because the symbolic link automatically follows the hard link hard.txt

**Answer: B**

Explanation: The symbolic link soft.txt holds the path string "orig.txt," and when orig.txt is deleted with rm, that path disappears and the link becomes broken, so cat gives a "No such file or directory" error. For reference, hard.txt points to the same inode, so its data is kept. A is wrong. A symbolic link does not keep data; it holds only a path. C is wrong. It doesn't become an empty file; an error occurs. D is wrong. The symbolic link points to the vanished orig.txt path, not to hard.txt.

---
