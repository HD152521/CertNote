# Day 3 - The Standard for Remote Access: SSH, sshd_config, Key Authentication, and Port Forwarding

## 📌 Key Takeaways

- SSH is not just a remote shell; it is a **comprehensive secure channel that layers authentication, file transfer, and port forwarding on top of an encrypted tunnel**. **Port 22 alone** handles shell, scp, sftp, and tunnels.
- **SSH 22 (encrypted) vs Telnet 23 (plaintext).** The server config is **`sshd_config` (with the d)**, the client config is `ssh_config`.
- Three security directives: **`PermitRootLogin no`**, `PasswordAuthentication no` (keys only), `MaxAuthTries 3`.
- For public key authentication, put the **public key (.pub) in the server's `authorized_keys` and keep the private key on the client**. Permissions are **`~/.ssh` 700, key files 600** — if they're too loose, SSH ignores the key.
- Forwarding is distinguished by direction — **`-L` local (from my side, out beyond the remote) / `-R` remote (from the remote side, back to my side) / `-D` dynamic (SOCKS)**. scp's port option is uppercase `-P`, ssh's is lowercase `-p`.

## Telnet vs SSH — The Decisive Difference Between Plaintext and Encryption

| Item | Telnet | SSH |
|------|--------|-----|
| Port | 23 | 22 |
| Encryption | None (plaintext transmission) | Encrypted end to end |
| Credentials | ID and password exposed as-is | Encrypted, can't be eavesdropped |
| Authentication method | Password only | Password + public key |
| Extra features | Shell access only | scp, sftp, port forwarding, X11 forwarding |
| Current standing | Effectively obsolete (for internal testing) | Standard |

> ⚠️ **Trap**: Telnet is port 23, SSH is port 22. A choice that swaps the ports is wrong. The exact opposite statements, such as "Telnet encrypts" or "SSH is plaintext," are traps too. Telnet's only remaining use is as "a tool to test whether a port is open" (`telnet host 80`), not for actual remote access.

SSH is secure because at the start of a connection it safely agrees on a session encryption key through **key exchange**. Since every command, output, and password afterward flows encrypted with this key, anyone intercepting in the middle sees only meaningless ciphertext. Telnet has no such process, so passwords are exposed as-is.

## Key sshd_config Security Directives

- The behavior of the SSH server is determined by **`/etc/ssh/sshd_config`**.
- **Do not confuse** it with `/etc/ssh/ssh_config`, the client configuration.

```bash
# /etc/ssh/sshd_config — key security directives
Port 22                          # Connection port (sometimes changed for security)
ListenAddress 0.0.0.0            # Address to listen on
Protocol 2                       # SSH protocol version (1 is vulnerable, use only 2)

PermitRootLogin no               # Block direct root login (security essential)
PasswordAuthentication yes       # Allow password authentication (no if keys only)
PubkeyAuthentication yes         # Allow public key authentication
PermitEmptyPasswords no          # Forbid login with an empty password

MaxAuthTries 3                   # Limit authentication attempts (brute-force defense)
LoginGraceTime 60                # Time limit to complete login (seconds)
AllowUsers alice bob             # Whitelist of users allowed to connect
DenyUsers guest                  # Users denied connection

ClientAliveInterval 300          # Interval for checking idle sessions
X11Forwarding yes                # Allow X11 GUI forwarding
```

- After changing the settings, the **daemon must be made to reload**.

```bash
sshd -t                          # Check config syntax (important: avoid locking yourself out with a bad config)
systemctl restart sshd           # Restart the daemon
```

> ⚠️ **Trap**: `PermitRootLogin no` is a representative security directive. It blocks direct root login, removing the number one target of brute-force attacks. Also, don't mix up `sshd_config` (server) and `ssh_config` (client). "The sshd_config with the daemon d is the server config."

**Key distinction**: Changing to `PasswordAuthentication no` completely blocks password login and allows **only public key authentication**. This is a strong security setting in practice. However, if you turn this on without registering your key beforehand, even you can't get in, so you must apply it only after registering the key.

An SSH server exposed to the internet is constantly hit by botnet brute-force attacks. The combination of `PermitRootLogin no` + `PasswordAuthentication no` (keys only) + `MaxAuthTries 3` is the standard defense. On top of that, changing the port from 22 can evade a good share of automated scans, so it is often used in practice (though the fundamental defense is key authentication).

## Public Key Authentication — Safe Login Without a Password

- The crown jewel of SSH is **public key authentication**, which lets you log in safely without a password.
- Principle: create a key pair, **leave the public key on the server, and prove your identity with the private key**.

```bash
# 1. Generate a key pair on the client
ssh-keygen -t ed25519 -C "alice@laptop"
#   -t : key algorithm (ed25519 recommended, for rsa use -b 4096)
#   Output: ~/.ssh/id_ed25519 (private key), ~/.ssh/id_ed25519.pub (public key)

# 2. Register the public key on the server (easiest way)
ssh-copy-id alice@192.168.1.10
#   → The public key is appended to the server's ~/.ssh/authorized_keys

# 3. Afterward, connect without a password
ssh alice@192.168.1.10
```

- Key authentication has **strict permission requirements.** If they're too loose, SSH rejects the key for security.

```bash
chmod 700 ~/.ssh                       # The directory is 700
chmod 600 ~/.ssh/authorized_keys       # The file is 600
chmod 600 ~/.ssh/id_ed25519            # The private key is 600 too
```

Public key authentication can be understood as "the public key is the lock, the private key is the key." The lock (public key) is safe to leave openly in the server's authorized_keys, and the client never leaks the key (private key). When the client answers, with its key, the challenge the server issued with the lock, its identity is proven without a password.

What you register on the server is the **public key (.pub)**, and what the client keeps is the **private key**. A choice that reverses this, saying "upload the private key to the server," is wrong (leaking a private key is fatal). Another trap: if the `~/.ssh` permissions are loose, key authentication is ignored and the password is asked for again.

**Key distinction**: `authorized_keys` (kept on the server, the list of public keys allowed to connect) and `known_hosts` (kept on the client, a record of the host keys of servers you've connected to) are different. The former is about "who do we let in," the latter about "is this the right server (detecting man-in-the-middle attacks)."

### Try It Yourself — Setting Up Key Authentication

```bash
# Check the generated keys
ls -l ~/.ssh/
# id_ed25519  id_ed25519.pub  authorized_keys  known_hosts

# Check the registered public keys on the server side
cat ~/.ssh/authorized_keys

# Trace the authentication process with verbose logging (when diagnosing problems)
ssh -v alice@192.168.1.10
```

## scp and sftp — File Transfer Over SSH

- Files are also moved **safely** over the SSH channel. No separate FTP server is needed.

```bash
# scp : copy with a single command line
scp report.txt alice@192.168.1.10:/home/alice/    # Local→remote upload
scp alice@192.168.1.10:/var/log/app.log ./        # Remote→local download
scp -r project/ alice@192.168.1.10:/srv/          # Whole directory (-r)
scp -P 2222 file user@host:/path/                 # Specify the port with uppercase -P

# sftp : interactive file transfer (similar to FTP commands but with SSH security)
sftp alice@192.168.1.10
sftp> put backup.tar
sftp> get config.yaml
sftp> bye
```

scp's port option is **uppercase `-P`**, while ssh's port option is **lowercase `-p`**. The case is reversed, so it's easy to mix up. Another point is that scp uses SSH (port 22) as-is, so a secure transfer works without a separate FTP server.

## SSH Port Forwarding (Tunneling) — The Magic of the Encrypted Tunnel

- SSH can **carry other connections inside its encrypted tunnel**. It is powerful for bypassing firewalls and for safe access.

| Type | Command option | Behavior |
|------|-----------|------|
| Local forwarding | `-L local_port:target:target_port` | Sends connections arriving at my local port through the remote to the target |
| Remote forwarding | `-R remote_port:target:target_port` | Sends connections arriving at the remote server's port to a target on my side |
| Dynamic forwarding | `-D local_port` | Acts as a SOCKS proxy (browsers, etc.) |

```bash
# Local forwarding: my 8080 → via the SSH server → internal DB (3306)
ssh -L 8080:db.internal:3306 alice@gateway
#   Now connecting to localhost:8080 is safely tunneled to internal db.internal:3306

# Dynamic forwarding: send all traffic beyond SSH through a SOCKS proxy
ssh -D 1080 alice@gateway
```

Local forwarding (-L) is "a passage linking a port on my computer to a service beyond the remote." It lets you use an internal-network DB you can't reach directly as if it were on your localhost, with the SSH gateway as a stepping stone. Every passage is encrypted by SSH, so it's safe. Summarize it as "an internal service you can't reach directly = local forwarding."

**Key distinction**: Local (-L) **starts from my side and goes out beyond the remote**, while remote (-R) **starts from the remote side and comes in to my side**. The directions are exactly opposite. Dynamic (-D) differs in that it accepts any destination as a SOCKS proxy rather than a specific target.

## Pre-Exam Checklist

- SSH 22 / Telnet 23, SSH is encrypted, Telnet is plaintext
- Server config = sshd_config, client config = ssh_config
- PermitRootLogin no / PasswordAuthentication no (keys only) / MaxAuthTries
- ssh-keygen → public key (.pub) goes in the server's authorized_keys, the private key stays on the client
- ~/.ssh 700, authorized_keys and private key 600
- scp port -P (uppercase), ssh port -p (lowercase)
- Forwarding: -L local, -R remote, -D dynamic (SOCKS)

## 📖 Glossary

- **SSH (Secure Shell)** : The standard remote access protocol that encrypts everything end to end. It uses port 22.
- **Key exchange** : The process of safely agreeing on a session encryption key at the start of a connection. It's why SSH resists eavesdropping.
- **`sshd_config` vs `ssh_config`** : Server (daemon) config / client config. **The one with the d is the server**.
- **`PermitRootLogin`** : Whether root may log in directly over SSH. Setting it to `no` is the baseline defense.
- **`PasswordAuthentication no`** : A setting that blocks password login and allows only public key authentication. Turn it on after registering your key.
- **`MaxAuthTries`** : The number of authentication attempts allowed per connection. Used to defend against brute force.
- **Public key / Private key** : The lock you leave openly on the server / the key only the client holds. Leaking the private key is fatal.
- **`ssh-keygen` / `ssh-copy-id`** : The command that creates a key pair / the command that registers the created public key on the server.
- **`authorized_keys`** : The server-side list of "these public keys are let in."
- **`known_hosts`** : The record, accumulated on the client, of "host keys of servers you've connected to." Used to detect man-in-the-middle attacks.
- **scp / sftp** : Copy with a one-line command / exchange interactively. Both ride SSH port 22 as-is.
- **Local forwarding (`-L`)** : A tunnel linking connections arriving at my local port to a target beyond the SSH server.
- **Remote forwarding (`-R`)** : A tunnel pulling connections arriving at the remote server's port to a target on my side. The direction is opposite to `-L`.
- **Dynamic forwarding (`-D`)** : A method that acts as a SOCKS proxy with no specific target and accepts every destination.

## 📝 Practice Questions

**Question 1.** Which correctly states the most essential difference of SSH compared with Telnet, and SSH's standard port?

A) SSH transmits in plaintext and uses port 23

B) SSH encrypts all communication and uses port 22

C) Telnet encrypts and uses port 22

D) SSH supports only password authentication and uses port 23

**Answer: B**

Explanation: SSH is a port 22 remote access protocol that encrypts end to end. A wrongly describes SSH as plaintext and port 23, C mixes up the characteristics of Telnet and SSH, and D gets both wrong: SSH also supports key authentication, and the port is 22. "SSH = encrypted, port 22; Telnet = plaintext, port 23" is the key.

---

**Question 2.** Which sshd_config directive blocks direct login of the root account on an SSH server?

A) `PasswordAuthentication no`

B) `PermitRootLogin no`

C) `PubkeyAuthentication no`

D) `PermitEmptyPasswords no`

**Answer: B**

Explanation: `PermitRootLogin no` is the security directive that blocks root's direct SSH login, removing the number one target of brute-force attacks. A turns off password authentication itself, C turns off public key authentication, and D blocks login with an empty password, so none relate to blocking root. "Block direct root login = PermitRootLogin no".

---

**Question 3.** When setting up public key authentication, which is the correct key to register on the server, and its file?

A) Register the private key in the server's `~/.ssh/known_hosts`

B) Register the public key (.pub) in the server's `~/.ssh/authorized_keys`

C) Register the private key in the server's `~/.ssh/authorized_keys`

D) Register the public key in the client's `~/.ssh/known_hosts`

**Answer: B**

Explanation: Public key authentication registers the client's public key (.pub) in the server's `~/.ssh/authorized_keys`, and the client keeps the private key. As in A and C, the private key must not be uploaded to the server (fatal if leaked), and in D, known_hosts is a different file that records the host keys of servers you've connected to. "Public key on the server, authorized_keys" is the key.

---

**Question 4.** What is the recommended permission on the `~/.ssh/authorized_keys` file for SSH key authentication to work?

A) 777

B) 644

C) 600

D) 755

**Answer: C**

Explanation: For security, SSH requires 600 permission, readable and writable only by the owner, on `authorized_keys` and private keys, and the `~/.ssh` directory must be 700. If read permission is open to other users, as with A (777), B (644), or D (755), SSH ignores the key and asks for the password again. Remember "key-related files are 600".

---

**Question 5.** Which is the correct port forwarding command to safely connect, via a gateway, to an internal-network database (db.internal:3306) that can't be reached directly, from my localhost:8080 using SSH?

A) `ssh -R 8080:db.internal:3306 alice@gateway`

B) `ssh -L 8080:db.internal:3306 alice@gateway`

C) `ssh -D 8080 alice@gateway`

D) `ssh -P 8080 alice@gateway`

**Answer: B**

Explanation: Local forwarding `-L local_port:target:target_port` safely links connections arriving at my localhost:8080 to db.internal:3306 beyond the gateway. A (-R) is remote forwarding with the opposite direction, C (-D) is a SOCKS proxy, and D's `-P` is scp's port option, not a forwarding command. "Linking to an internal service = local forwarding -L".

---

**Question 6.** Which correctly pairs the SSH server config file and the client config file?

A) Server `/etc/ssh/ssh_config`, client `/etc/ssh/sshd_config`

B) Server `/etc/ssh/sshd_config`, client `/etc/ssh/ssh_config`

C) Both server and client `/etc/ssh/ssh_config`

D) Server `~/.ssh/config`, client `/etc/ssh/sshd_config`

**Answer: B**

Explanation: The daemon config `sshd_config` (with the d) is the server configuration, and `ssh_config` is the client configuration. A pairs them exactly backwards, C omits the server config, and D puts the client file on the server by mistake. The distinction "the sshd_config with the d is the server" is the key.

---

**Question 7.** Which is the correct option to specify the port when copying a file with scp to a remote server using port 2222?

A) Lowercase `-p 2222`

B) Uppercase `-P 2222`

C) `--port=2222`

D) `-L 2222`

**Answer: B**

Explanation: scp's port option is uppercase `-P` (ssh uses lowercase `-p`). The lowercase `-p` in A is scp's option for preserving timestamps, which differs from specifying a port; C is a format scp doesn't support; D (-L) is an ssh port forwarding option. The case difference "scp port is uppercase -P, ssh port is lowercase -p" is the trap.

---
