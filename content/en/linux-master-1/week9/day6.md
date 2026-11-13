# Day 6 - Database Services: From Installing MySQL/MariaDB to Backup and Recovery

## 📌 Key Takeaways

- **A "user" is not a single name but a `username@host` pair.** `'web'@'localhost'` and `'web'@'%'` are **different accounts** even with the same name, and their privileges are separate.
- Whether a connection succeeds comes down to that pair, plus **`bind-address` + firewall port 3306**.
- **The package is `mariadb-server`, and the service name is `mariadb`.** If you only `start` and forget `enable`, it will not come up after a reboot.
- **`-p` is password, `-P` is Port.** Backup is `mysqldump ... > file`, restore is `mysql ... < file` — the **arrow direction** is the key.
- **A single dump given only a DB name has no `CREATE DATABASE`.** You must create the DB before restoring (`--databases` and `--all-databases` include it).

## MySQL and MariaDB — Why Are There Two Names?

| Aspect | MySQL | MariaDB |
|------|-------|---------|
| Developed by | Oracle | MariaDB Foundation (community) |
| Package name | `mysql-server` | `mariadb-server` |
| Default port / engine | 3306 / InnoDB | 3306 / InnoDB |

MySQL was a product of Sweden's MySQL AB, passed through Sun, and went to Oracle in 2010. When a commercial DB company acquired the flagship open-source DB, the original developer Monty Widenius forked it, and the result is **MariaDB** (named after his daughter). That is why the default distribution DB of the RHEL family was switched to MariaDB. The client commands (`mysql`, `mysqldump`, `mysqladmin`) and the basic SQL are compatible, so what follows applies to both.

## Installation and Starting the Daemon

- Depending on the distribution family, **package names and service names diverge**, and this difference comes up as short-answer questions.

```bash
yum install mariadb-server mariadb   # RHEL/CentOS/Rocky (server + client)
apt install mariadb-server           # Debian/Ubuntu (or mysql-server)

systemctl start mariadb        # Start
systemctl enable mariadb       # Register auto-start at boot
systemctl status mariadb       # Check status
systemctl restart mariadb      # Restart after a config change
```

| Item | RHEL family | Debian family |
|------|-----------|-------------|
| Service (unit) name | `mariadb` (`mysqld` if MySQL is installed) | `mariadb` or `mysql` |
| Main config file | `/etc/my.cnf` | `/etc/mysql/my.cnf` |
| Data directory | `/var/lib/mysql` | `/var/lib/mysql` |

> ⚠️ **Trap**: **The package name is `mariadb-server` but the service name is `mariadb`.** A choice that uses the package name as-is for the service name, like `systemctl start mariadb-server`, appears as a wrong answer. Other traps: installing the MySQL community package makes the service name `mysqld`, and if you only `start` and forget `enable`, **the DB does not come up after a reboot**.

## mysql_secure_installation — The Essential Security Step Right After Installation

- A freshly installed DB leaves **a root with no password, anonymous users, and a test DB** wide open.
- The interactive script that cleans these up in one go is **`mysql_secure_installation`**.

| Step | What it does |
|------|-----------|
| root password | Set or change the password of the DB administrator (root) account |
| Anonymous users | Remove the anonymous user that can connect without a name |
| Remote root login | Block remote root access in the form `'root'@'%'` |
| test database | Delete the default `test` DB that anyone can access |
| Reload privilege tables | Apply changes immediately (reload privilege tables) |

**The DB's root is a completely separate account from the Linux system's root.** Only the name is the same; the credentials and privilege system live separately inside the DB, and changing the Linux root password leaves the DB root password unchanged. The "command that sets the DB administrator account's password" is `mysql_secure_installation` or `mysqladmin -u root password 'new-password'`.

```bash
mysqladmin -u root password 'NewP@ssw0rd'   # Set the root password non-interactively
mysqladmin -u root -p ping                  # Check the daemon is alive
```

## Connecting and Basic SQL

```bash
mysql -u root -p                          # Local connection (password entered at the prompt)
mysql -u web -p webdb                     # Select webdb at the same time as connecting
mysql -h 192.168.1.50 -P 3306 -u web -p   # Connect to a remote server
mysql -u root -p -e "SHOW DATABASES;"     # Run one line of SQL and exit
```

| Option | Meaning |
|------|------|
| `-u` | Username |
| `-p` | Password input prompt (lowercase) |
| `-h` | Host to connect to (server IP or name) |
| `-P` | Port number (uppercase, default 3306) |
| `-e` | Run one line of SQL from the shell and exit |

> ⚠️ **Trap**: **`-p` (lowercase) is the password and `-P` (uppercase) is the port.** There are choices that swap the cases. When attaching the password after `-p`, you must write it **with no space**, as `-pMyPass` (with a space, MyPass is interpreted as the DB name). A password on the command line is left in `ps` and the shell history, so in practice you use just `-p` and type it at the prompt.

- The basic SQL used after connecting is below. An SQL statement **must end with a semicolon (`;`)** to run.

```sql
-- Query
SHOW DATABASES;                 -- List of databases
USE webdb;                      -- Select the database to use
SHOW TABLES;                    -- List of tables in the current DB
DESC members;                   -- Check table structure (same as DESCRIBE)

-- Create
CREATE DATABASE webdb DEFAULT CHARACTER SET utf8mb4;
CREATE TABLE members (
    id     INT AUTO_INCREMENT PRIMARY KEY,
    name   VARCHAR(30) NOT NULL,
    email  VARCHAR(60),
    joined DATE
);

-- Manipulate
INSERT INTO members (name, email, joined) VALUES ('John Smith', 'john@ex.com', '2026-08-01');
SELECT * FROM members WHERE name = 'John Smith';
UPDATE members SET email = 'new@ex.com' WHERE id = 1;
DELETE FROM members WHERE id = 1;

-- Delete / exit
DROP TABLE members;   DROP DATABASE webdb;
EXIT;                           -- QUIT; and \q are the same
```

| Category | Name | Representative commands |
|------|------|-----------|
| DDL | Data Definition Language | `CREATE`, `ALTER`, `DROP`, `TRUNCATE` |
| DML | Data Manipulation Language | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| DCL | Data Control Language | `GRANT`, `REVOKE`, `COMMIT`, `ROLLBACK` |

`DELETE` is DML, so it picks rows with `WHERE` and can be undone via a transaction, whereas `TRUNCATE` is DDL, empties the whole table, also resets `AUTO_INCREMENT`, and generally cannot be rolled back.

## Users and Privileges — The `'user'@'host'` Pair

```sql
-- Create accounts
CREATE USER 'web'@'localhost' IDENTIFIED BY 'WebP@ss1';    -- Local only
CREATE USER 'web'@'%' IDENTIFIED BY 'WebP@ss1';            -- All hosts
CREATE USER 'web'@'192.168.1.%' IDENTIFIED BY 'WebP@ss1';  -- Specific range only
```

| Host notation | Allowed scope |
|-------------|-----------|
| `'user'@'localhost'` | Connections only from the server itself |
| `'user'@'%'` | All hosts (including remote) |
| `'user'@'192.168.1.%'` | Only from the 192.168.1.0/24 range |
| `'user'@'192.168.1.50'` | Only from that one IP |

- Privileges are **given with `GRANT` and taken back with `REVOKE`**.

```sql
GRANT ALL PRIVILEGES ON webdb.* TO 'web'@'localhost';            -- Full privileges
GRANT SELECT, INSERT, UPDATE ON webdb.* TO 'app'@'192.168.1.%';  -- Limited grant
REVOKE INSERT, UPDATE ON webdb.* FROM 'app'@'192.168.1.%';       -- Revoke

SHOW GRANTS FOR 'web'@'localhost';          -- Check privileges
SELECT user, host FROM mysql.user;          -- Account list
ALTER USER 'web'@'localhost' IDENTIFIED BY 'NewP@ss2';   -- Change password
DROP USER 'web'@'localhost';                -- Delete account
FLUSH PRIVILEGES;                           -- Reload privilege tables
```

- There are three target notations after `ON`.
  - `*.*` : all tables of all DBs
  - `webdb.*` : all tables of webdb
  - `webdb.members` : just that one table
- The practical principle is to give **minimum privileges only on the DBs needed**.

`FLUSH PRIVILEGES` is the command that re-reads the in-memory privilege information **when you have touched privilege tables such as `mysql.user` directly with `UPDATE`/`INSERT`**. If you went through the proper path with `GRANT`, `REVOKE`, or `CREATE USER`, the server reflects it automatically, so in principle it is not needed. It can be the answer to a question asking for "the command that applies privilege changes immediately".

`'web'@'localhost'` and `'web'@'%'` are **different accounts** even with the same name. If you grant privileges only to the localhost account and connect remotely, `Access denied` appears. As a side note, `-h localhost` connects via the Unix socket (`/var/lib/mysql/mysql.sock`) while `-h 127.0.0.1` connects via TCP port 3306, so the two can give different results.

## Configuration File — my.cnf and bind-address

- Server behavior is controlled by **`my.cnf` (the option file)**. The exam point is that **the location differs by family**.

| Family | Main config file | Additional config directory |
|------|----------------|--------------------|
| RHEL/CentOS | `/etc/my.cnf` | `/etc/my.cnf.d/` |
| Debian/Ubuntu | `/etc/mysql/my.cnf` | `/etc/mysql/mariadb.conf.d/` or `/etc/mysql/mysql.conf.d/` |

- The file is read in units of **sections** enclosed in square brackets.
- Server daemon settings go in the **`[mysqld]`** section, and `mysql` client settings go in the **`[client]`** section.

```ini
[mysqld]
port         = 3306                        # Service port (default 3306/TCP)
bind-address = 0.0.0.0                     # Listening interface
datadir      = /var/lib/mysql              # Path where data files are stored
socket       = /var/lib/mysql/mysql.sock   # Socket file for local connections
log_error    = /var/log/mariadb/mariadb.log
max_connections      = 200                 # Upper limit of concurrent connections
character-set-server = utf8mb4             # Server default character set
```

| Item | Meaning |
|------|------|
| `port` | Service port. Default **3306/TCP** |
| `bind-address` | IP to accept connections on. `127.0.0.1` is local only, `0.0.0.0` is all interfaces |
| `datadir` | Path where the actual database files are placed (`/var/lib/mysql`) |
| `socket` | Path of the Unix socket file used for local connections |
| `log_error` / `max_connections` | Error log path / number of concurrent connections allowed |
| `skip-networking` | Turns off TCP listening entirely and allows only socket connections |

The Debian family has a default of **`bind-address = 127.0.0.1`**, which blocks remote connections. If you created the account as `'user'@'%'` and even opened the firewall but it still fails, nine times out of ten this is it. Conversely, if you open it to `0.0.0.0` and do not lock the firewall, the DB is exposed as-is. One more thing: **after editing the configuration you must `systemctl restart` for it to take effect.**

```bash
# Ask the server directly for the values actually in effect
mysql -u root -p -e "SHOW VARIABLES LIKE 'bind_address';"
mysql -u root -p -e "SHOW VARIABLES LIKE 'datadir';"
```

## Backup and Restore — mysqldump

- The standard tool for DB backup is **`mysqldump`**.
- As the name says, it is a tool that **dumps** the contents of a database **as a text file of SQL statements (CREATE TABLE, INSERT ...)**.

```bash
mysqldump -u root -p webdb > /backup/webdb.sql             # Single DB
mysqldump -u root -p webdb members > /backup/members.sql   # Specific table only
mysqldump -u root -p --databases webdb blogdb > /backup/two.sql   # Multiple DBs
mysqldump -u root -p --all-databases > /backup/all.sql     # Entire server
```

- Restore is not a separate command — it is **feeding the dumped SQL file into the `mysql` client with input redirection**.

```bash
mysql -u root -p -e "CREATE DATABASE webdb;"     # Create the target DB first, then
mysql -u root -p webdb < /backup/webdb.sql       # Feed in the dump to restore

mysql -u root -p < /backup/all.sql               # An --all-databases dump goes without a DB name
```

**Backup is `>` (output redirection), restore is `<` (input redirection)**, and if you use the wrong direction the backup file gets emptied. One more decisive point — **a single dump given only a DB name does not contain a `CREATE DATABASE` statement.** You must create the target DB before restoring, and if you do not, you get an `Unknown database` error. A dump made with `--databases` or `--all-databases` includes DB creation statements, so you feed it in as-is without a DB name.

`mysqldump` is a **logical backup** whose output is SQL text, so it is easy to move to another server. To take a consistent backup without stopping the service, use `--single-transaction` on InnoDB tables. On the other hand, a physical backup that bundles `/var/lib/mysql` with `tar` **must be done only after stopping the daemon** — copying while it is running yields broken files.

## Logs and Troubleshooting

- When the DB does not come up or you cannot connect, look at the **error log first**.
- Paths differ by distribution and package, so it is more reliable to **check the setting value directly**.

```bash
mysql -u root -p -e "SHOW VARIABLES LIKE 'log_error';"   # Check the path directly
tail -f /var/log/mariadb/mariadb.log     # MariaDB on the RHEL family
tail -f /var/log/mysqld.log              # MySQL on the RHEL family
tail -f /var/log/mysql/error.log         # Debian family
journalctl -u mariadb -n 50              # When the daemon does not come up at all
```

| Log type | Setting | What it records |
|-----------|-----------|-----------|
| Error log | `log_error` | Startup/shutdown messages, fatal errors |
| General query log | `general_log` | All queries (heavy load, not recommended for constant use) |
| Slow query log | `slow_query_log` | Queries exceeding a set time (for tuning) |
| Binary log | `log_bin` | Change history (for replication and point-in-time recovery) |

- Remote connection failures have **a fixed set of causes.** Narrowing down in the order below catches most of them.

| Symptom / cause | How to check | Fix |
|-----------|-----------|------|
| Daemon not running | `systemctl status mariadb` | `systemctl start mariadb` |
| Firewall blocking | `firewall-cmd --list-all` | Allow 3306/TCP |
| `bind-address` is 127.0.0.1 | `SHOW VARIABLES LIKE 'bind_address';` | Change to `0.0.0.0` and restart |
| Account host is only localhost | `SELECT user,host FROM mysql.user;` | Create a `'user'@'%'` account |
| Insufficient privileges | `SHOW GRANTS FOR 'user'@'%';` | Grant the needed `GRANT` |

```bash
ss -tlnp | grep 3306                                # Is the port open and listening
firewall-cmd --permanent --add-port=3306/tcp && firewall-cmd --reload
```

Telling the two connection-failure messages apart cuts diagnosis in half. **`Access denied for user ...`** means it reached the server but was rejected on account, password, or privileges (an inside-the-DB problem), and **`Can't connect to MySQL server ...`** means the connection itself did not reach (an outside problem such as daemon not running, firewall, or `bind-address`).

## Memory Tips — Sorting Out the Confusing Pairs

| Confusing point | Mnemonic |
|---------------|--------|
| `-p` vs `-P` | Lowercase p is **p**assword, uppercase P is **P**ort |
| Backup `>` / restore `<` | **Going out** to a file is backup, **coming in** from a file is restore |
| Package vs service | Package `mariadb-server`, service `mariadb` (no server) |
| my.cnf location | RHEL is `/etc/my.cnf` (short), Debian is `/etc/mysql/my.cnf` (one more level) |
| `@'localhost'` vs `@'%'` | `%` is a wildcard — "any host" |
| Port 3306 | 3306 MySQL/MariaDB, 5432 PostgreSQL, 1521 Oracle |
| DDL/DML/DCL | Definition (Create) / manipulation (Select, Insert) / control (Grant) |
| `FLUSH PRIVILEGES` | "Read it again" when you edited the privilege tables by hand |

## Try It Yourself — A Full Lap from Installation to Backup

```bash
# 1. Install, start, initial security
yum install -y mariadb-server mariadb
systemctl start mariadb && systemctl enable mariadb
mysql_secure_installation

# 2. Create a DB and an account
mysql -u root -p -e "CREATE DATABASE webdb DEFAULT CHARACTER SET utf8mb4;
  CREATE USER 'web'@'localhost' IDENTIFIED BY 'WebP@ss1';
  GRANT ALL PRIVILEGES ON webdb.* TO 'web'@'localhost';
  SHOW GRANTS FOR 'web'@'localhost';"

# 3. Verify by connecting with the new account and creating a table
mysql -u web -p webdb -e "CREATE TABLE members (id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL, joined DATE);
  INSERT INTO members VALUES (1,'John Smith','2026-08-01'); SELECT * FROM members;"

# 4. Backup → delete → restore drill
mysqldump -u root -p webdb > /backup/webdb.sql
mysql -u root -p -e "DROP DATABASE webdb;"
mysql -u root -p -e "CREATE DATABASE webdb;"
mysql -u root -p webdb < /backup/webdb.sql
mysql -u root -p webdb -e "SELECT * FROM members;"
```

- If you do step 4's **"backup → DROP → restore"** by hand even once, the fact that a single dump has no `CREATE DATABASE` stays with you.
- This feel turns directly into points in the practical exam's hands-on tasks.

In the next session we wrap up with a comprehensive review that ties together this week's services (DNS, DHCP/NTP, Apache, Nginx, DB).

## 📖 Glossary

- **MariaDB** : The branch forked by the original developer after Oracle acquired MySQL. Commands and SQL are compatible, and it is the default DB of the RHEL family.
- **DB root** : A database-only administrator account **completely separate** from the Linux system's root.
- **`mysql_secure_installation`** : An interactive script that cleans up the root password, anonymous accounts, remote root, and test DB in one go right after installation.
- **`-p` vs `-P`** : Lowercase is password (prompt), uppercase is Port. When attaching the password after `-p`, write it with no space.
- **DDL / DML / DCL** : Definition language (CREATE, ALTER, DROP) / manipulation language (SELECT, INSERT, UPDATE, DELETE) / control language (GRANT, REVOKE, COMMIT).
- **`DELETE` vs `TRUNCATE`** : DML that picks rows with WHERE and can be undone / DDL that empties the whole table and even resets AUTO_INCREMENT.
- **`'user'@'host'`** : The identifying unit of an account. Even with the same name, a different host means a different account.
- **`%` (wildcard)** : "From anywhere" in the host slot. A range can also be specified, as in `'web'@'192.168.1.%'`.
- **`GRANT` target notation** : `*.*` (everything) · `webdb.*` (all of that DB) · `webdb.members` (one table).
- **`FLUSH PRIVILEGES`** : A command that makes the server re-read in-memory privilege info when the privilege tables were touched directly.
- **`bind-address`** : The interface to accept connections on. `127.0.0.1` means local only, `0.0.0.0` means all interfaces.
- **`datadir`** : The path where the actual database files accumulate. Usually `/var/lib/mysql`.
- **Logical vs physical backup** : `mysqldump`, which dumps SQL text and is easy to move / bundling the whole data directory (daemon stop required).
- **`--single-transaction`** : An option for taking a consistent backup on InnoDB without stopping the service.
- **`Access denied` vs `Can't connect`** : Reached the server but rejected on account or privileges / the connection itself did not reach (daemon, firewall, bind-address).

## 📝 Practice Questions

**Question 1.** After installing a MariaDB server on the RHEL/CentOS family, which command correctly registers it to start automatically at boot?

A) `systemctl start mariadb-server`
B) `systemctl enable mariadb`
C) `service mariadb autostart`
D) `chkconfig mysqld on --now`

**Answer: B**
Explanation: The package name is `mariadb-server`, but the systemd service (unit) name is `mariadb`. `start` only starts it now, and registering auto-start at boot is handled by `enable`.

---

**Question 2.** Which command, run right after installing MySQL/MariaDB, handles setting the root password, removing anonymous users, blocking remote root login, and deleting the test database in one go?

A) `mysql_install_db`
B) `mysql_secure_installation`
C) `mysqladmin flush-hosts`
D) `mysqlcheck --auto-repair`

**Answer: B**
Explanation: `mysql_secure_installation` interactively cleans up the initial security items (root password, removing anonymous accounts, blocking remote root, deleting the test DB, reloading privileges). This root is a DB-only administrator unrelated to the Linux root.

---

**Question 3.** Which is the correct command to back up the `webdb` database to the file `/backup/webdb.sql`?

A) `mysql -u root -p webdb > /backup/webdb.sql`
B) `mysqldump -u root -p webdb < /backup/webdb.sql`
C) `mysqldump -u root -p webdb > /backup/webdb.sql`
D) `mysqlbackup -u root -p webdb -o /backup/webdb.sql`

**Answer: C**
Explanation: For backup, `mysqldump` outputs SQL text to standard output and `>` saves it to a file. Restore is the reverse, feeding it in with `<` as in `mysql -u root -p webdb < /backup/webdb.sql`. B, with the arrow direction swapped, is wrong.

---

**Question 4.** Which is correct about what to watch for when restoring a dump file made with `mysqldump -u root -p webdb > dump.sql`?

A) The dump contains a `CREATE DATABASE` statement, so you must not specify the DB name
B) You must create the target database in advance and restore with `mysql -u root -p webdb < dump.sql`
C) You must run `FLUSH PRIVILEGES` before restoring
D) The dump file is binary, so it can be restored only with `mysqlimport`

**Answer: B**
Explanation: A single dump with only a DB name has no `CREATE DATABASE` statement. You must create the target DB first and feed it in with the DB name specified; otherwise you get an `Unknown database` error. A dump made with `--databases` or `--all-databases` includes DB creation statements.

---

**Question 5.** Which is correct about the difference between the accounts `'web'@'localhost'` and `'web'@'%'`?

A) They are the same account with different notation
B) `%` means an account with no password
C) They are separate accounts: `localhost` allows connections only from the server itself, and `%` allows connections from all hosts
D) `localhost` is read-only and `%` is a read/write account

**Answer: C**
Explanation: An account is identified by the `username@host` pair, so even with the same name a different host means a different account, and privileges must be granted separately. `%` is a wildcard meaning all hosts, and to allow remote connections you need an account of the form `'user'@'%'`.

---

**Question 6.** Which correctly pairs MySQL/MariaDB's default service port with the setting item that specifies the interface to accept connections on?

A) 3306 / `bind-address`
B) 5432 / `listen_addresses`
C) 3306 / `datadir`
D) 1521 / `bind-address`

**Answer: A**
Explanation: The default port is 3306/TCP, and `bind-address` in the `[mysqld]` section of `my.cnf` decides the listening interface. `127.0.0.1` is local only, and `0.0.0.0` is all interfaces. 5432 is PostgreSQL, 1521 is Oracle, and `datadir` is the data file path.

---

**Question 7.** A remote client trying to connect to the DB server fails at the connection itself with `Can't connect to MySQL server`. Which of the following is the furthest from the items to check first?

A) Whether the daemon is running (`systemctl status mariadb`)
B) Whether 3306/TCP is open in the firewall
C) Whether `bind-address` is bound to `127.0.0.1`
D) Whether the `SELECT` privilege has been granted to that account

**Answer: D**
Explanation: `Can't connect to ...` is a state where the connection itself did not reach, so you look first at network-layer causes such as the daemon not running, firewall blocking, or a `bind-address` restriction. Privilege or password problems are distinguished by `Access denied for user ...`, which appears when the request reaches the server and is then rejected.

---
