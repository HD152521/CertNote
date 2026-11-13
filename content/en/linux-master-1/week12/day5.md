# Day 5 - System Task Mock Exam + Error Notebook: Cementing It with 12 Questions

## 📌 Key Points

- We review this week's entire scope (command options, configuration files, disk/LVM/permissions, processes/scheduling/systemd) with a **12-question mock exam**.
- Task-style questions are a battle of whether you can instantly answer "which **command / option / path** does this task need?"
- Don't just look at the answers; read the explanations of **why the other choices are wrong** to fill in the points where you get confused.
- A good number of questions turn on telling **"works now" from "permanent setting"** - `start`/`mount`/`at` versus `enable`/`fstab`/`crontab`.
- For any question you get wrong, go back to the corresponding Day's text and memorize the tables again.

## Exam Strategy in One Line

- **Octal permissions**: rwx=7, rw-=6, r-x=5, r--=4 - you should be able to convert instantly, as in `chmod 755`=rwxr-xr-x.
- **Recursion is uppercase -R** (chmod/chown), while grep recursion is `-r`.
- **kill -9**=forced termination, **kill -1 (HUP)**=re-read configuration, **kill -15**=graceful termination (default).
- **passwd 7 fields / shadow 9 fields / fstab 6 fields** - you need to know the field counts and order.
- **Disk**: fdisk → mkfs → mount → fstab. **LVM**: pvcreate → vgcreate → lvcreate, and expansion is lvextend + resize2fs.
- **Special permissions**: SetUID 4000, SetGID 2000, Sticky 1000.
- **enable=start at boot, start=start now** - the two are separate.

## 📖 Glossary

- **Task-style question** : A format in the second-round practical exam where you write commands, options, and paths directly. It asks "what do you type", not for a conceptual explanation.
- **Octal permissions** : Notation that converts rwx to numbers. Since r=4, w=2, x=1, rwx=7, rw-=6, r-x=5, r--=4.
- **Recursive option** : An option that applies to subdirectories all at once. For chmod and chown it is uppercase `-R`.
- **SIGHUP(1)** : A signal that tells a daemon to "re-read its configuration file". Used to reload without a restart.
- **umask** : The bits removed from the default permissions of newly created files and directories. Files are 666−umask, directories 777−umask.
- **resize2fs** : The command that, after growing an LV, matches the actual size of an ext2/3/4 filesystem. For xfs, use `xfs_growfs`.
- **vgextend** : The LVM command that adds a new physical volume (PV) to a volume group to grow the storage pool.
- **`enable --now`** : The systemctl option that does autostart registration (enable) and immediate start (start) at once.
- **daemon-reload** : The command that makes systemd pick up changes after you edit a systemd unit file. If you skip it, your edits are ignored.

## 📝 Practice Questions

**Question 1.** Which command changes, in one go, the permissions of all files and directories under the directory `/project` to `rwxr-xr-x`?

A) chmod -r 755 /project
B) chmod -R 755 /project
C) chmod 755 -a /project
D) chmod 644 -R /project

**Answer: B**

Explanation: Recursive application is uppercase `-R`, and rwxr-xr-x is octal 755. Lowercase `-r` is not chmod's recursive option. 644 is rw-r--r--, which is a different permission.

---

**Question 2.** Which command correctly finds only regular files larger than 100MB under the `/data` directory?

A) find /data -size +100M -type f
B) find /data -size -100M -type d
C) grep -size +100M /data
D) find /data -size 100M -type l

**Answer: A**

Explanation: The size condition is `-size +100M` (over 100MB), and regular files are `-type f`. `-100M` means under 100MB, `-type d` is directories, and `-type l` is symbolic links. `grep` is a tool for searching file content and has no size condition.

---

**Question 3.** Which command sends SIGHUP so that a daemon re-reads its configuration file without restarting?

A) kill -9 PID
B) kill -15 PID
C) kill -1 PID
D) kill -19 PID

**Answer: C**

Explanation: SIGHUP is signal number 1, and many daemons reload their configuration when they receive it. 9 is forced termination (KILL), 15 is graceful termination (TERM), and 19 is pause (STOP).

---

**Question 4.** What is the absolute path of the file that stores a user account's UID, home directory, and login shell information?

A) /etc/shadow
B) /etc/group
C) /etc/passwd
D) /etc/login.defs

**Answer: C**

Explanation: The UID (field 3), home directory (field 6), and login shell (field 7) are all in `/etc/passwd` (7 fields in total). `/etc/shadow` holds encrypted passwords and policy, `/etc/group` holds groups, and `/etc/login.defs` holds the default policy values for new accounts.

---

**Question 5.** What does the 6th field of `/etc/fstab` mean, and what value goes in for the root filesystem?

A) dump backup flag, 0
B) fsck check order, 1
C) mount options, defaults
D) filesystem type, ext4

**Answer: B**

Explanation: The 6th field of fstab is the fsck check order at boot: root (/) is 1, others are 2, and no check is 0. The dump backup flag is the 5th field, mount options the 4th, and filesystem type the 3rd.

---

**Question 6.** You want to format the new partition `/dev/sdc1` as xfs and then mount it on `/srv`. Which is the correct format command?

A) mount -t xfs /dev/sdc1 /srv
B) mkfs -t xfs /dev/sdc1
C) fdisk -t xfs /dev/sdc1
D) xfs_growfs /dev/sdc1

**Answer: B**

Explanation: Creating (formatting) a filesystem is `mkfs -t xfs` (or `mkfs.xfs`). `mount` attaches, `fdisk` creates partitions, and `xfs_growfs` expands an already created xfs.

---

**Question 7.** Which command adds the new physical volume `/dev/sdd` to the volume group `vg01` in LVM to increase capacity?

A) lvextend vg01 /dev/sdd
B) pvcreate vg01 /dev/sdd
C) vgextend vg01 /dev/sdd
D) vgcreate vg01 /dev/sdd

**Answer: C**

Explanation: The command that adds a PV to a volume group to grow the pool is `vgextend`. `lvextend` extends a logical volume, `vgcreate` creates a new VG, and `pvcreate` initializes a disk as a PV (note that sdd must already have been pvcreate'd).

---

**Question 8.** After growing a logical volume with `lvextend`, which command extends the actual capacity of the ext4 filesystem?

A) xfs_growfs
B) resize2fs
C) mkfs.ext4
D) vgextend

**Answer: B**

Explanation: Growing an ext2/3/4 filesystem is `resize2fs`. `xfs_growfs` is for xfs only, `mkfs.ext4` is a format (deletes data), and `vgextend` is the VG extension command. Growing only the LV leaves the filesystem unchanged, so the resize step is mandatory.

---

**Question 9.** What is the permission of a newly created directory when the `umask` value is 077?

A) 755
B) 700
C) 644
D) 600

**Answer: B**

Explanation: Subtracting umask 077 from the default directory permission 777 gives 700 (rwx------). 755 is for umask 022, 644 is the file permission for umask 022, and 600 is the file permission for umask 077.

---

**Question 10.** Which command sets up a shared directory like `/tmp` so that anyone can create files but can delete only the files they created?

A) chmod 4777 /tmp
B) chmod 2777 /tmp
C) chmod 1777 /tmp
D) chmod 0777 /tmp

**Answer: C**

Explanation: Setting the Sticky bit (octal 1000) allows deleting only files you own within the directory. `chmod 1777` is the answer, and it appears as `rwxrwxrwt` in `ls -ld`. 4000 is SetUID and 2000 is SetGID.

---

**Question 11.** Which entry registers `/backup.sh` in crontab to run every Sunday at 4 AM?

A) 0 4 * * 0 /backup.sh
B) 4 0 * * 7 /backup.sh
C) 0 4 7 * * /backup.sh
D) 0 4 * * 1 /backup.sh

**Answer: A**

Explanation: The fields are in the order minute-hour-day-month-weekday. Every Sunday at 04:00 is minute=0, hour=4, weekday=0 (Sunday), giving `0 4 * * 0`. In B the minute and hour are swapped, C has day=7, which means the 7th of every month, and D is weekday 1 (Monday).

---

**Question 12.** Which command starts the httpd service immediately and, at the same time, registers it to start automatically at boot, all in one go?

A) systemctl start httpd
B) systemctl enable httpd
C) systemctl enable --now httpd
D) systemctl restart --now httpd

**Answer: C**

Explanation: `enable --now` performs autostart registration (enable) and immediate start (start) at once. `start` alone only starts it now, and `enable` alone only registers it to start at boot without starting it now.

---

## Error Notebook: Summary of Commonly Missed Traps

We regroup the points that most often cause confusion in this week's 12 questions.

| Point of confusion | Accurate summary |
|---------------|-------------|
| Recursive option | chmod/chown use uppercase `-R`; grep recursion is `-r`/`-R` |
| nice priority | **Lower** value means higher priority (positive values yield) |
| kill signals | 9=forced, 15=graceful (default), 1=HUP (reload) |
| Number of file fields | passwd 7 / shadow 9 / group 4 / fstab 6 |
| fstab fields 5 and 6 | 5=dump backup, 6=fsck order (root 1) |
| Four disk steps | fdisk → mkfs → mount → fstab |
| LVM create/extend | pv→vg→lv to create / vgextend→lvextend→resize2fs to extend |
| umask calculation | File 666-umask, directory 777-umask |
| Special permission octals | SetUID 4, SetGID 2, Sticky 1 (leading digit) |
| start vs enable | start=now, enable=start at boot (separate) |
| at vs cron | at=one-time, cron=recurring |
| daemon-reload | Always run after editing a unit file |

> 💡 **Wrap-up**: Half of the task-style questions turn on separating "works now" from "permanent setting". If the scenario contains "even after boot", "even after a reboot", or "periodically", pick a **persistence command** such as `enable`, `/etc/fstab`, `crontab`, or `sysctl -p`. Conversely, for "now" or "once", it is `start`, `mount`, or `at`.

> ⚠️ **Trap roundup**: ① The owner:group separator in `chown` is the colon (`:`). ② `grep -v` selects lines that do **not** match. ③ `find -mtime +7` means **older than** 7 days. ④ If you skip `resize2fs`/`xfs_growfs` after extending an LV, the capacity is not reflected. ⑤ Forgetting `daemon-reload` after editing a unit file. These five are the regular point-loss spots in the practical exam.

If you got any questions wrong, go back to the Day matching the question number - questions 1 and 2 are Day 1 (command options), 4 and 5 are Day 2 (configuration files), 6 to 10 are Day 3 (disk, LVM, permissions), and 11 and 12 are Day 4 (process, systemd). Rewrite the tables by hand and repeat until the commands, options, and paths come out automatically, and the system task section of the second-round practical exam is well within your reach.
