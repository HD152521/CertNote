# Day 1 - Mail Services: The MTA, MDA, MUA and SMTP, POP3, IMAP Triangle

## 📌 Key Takeaways

- The mail system has an **asymmetric structure: "SMTP to send, POP3/IMAP to retrieve."** Once you can sketch this asymmetry, the ports and config files fall into place.
- Division of roles: **MUA (user client) → MTA (server-to-server transfer) → MDA (final delivery to the mailbox)**.
- Ports to answer instantly: **SMTP 25 · POP3 110 · IMAP 143**, and the encrypted ones: **SMTPS 465 · Submission 587 · IMAPS 993 · POP3S 995**.
- **POP3 downloads and deletes from the server** (single device), **IMAP keeps mail on the server and syncs** (multiple devices). "Multiple devices = IMAP".
- The MTAs are **Sendmail (legacy, `/etc/mail/sendmail.cf`)** and **Postfix (modular, secure, `/etc/postfix/main.cf`)**. Opening `mynetworks` too wide creates an **open relay**.

## The 3 Components of a Mail System — MTA, MDA, MUA

- Mail isn't exchanged directly by people; it is delivered by **a relay of three programs with separate roles**.

| Component | Full name | Role | Typical programs |
|----------|--------|------|---------------|
| MUA | Mail User Agent | Client where the user writes and reads mail | Outlook, Thunderbird, mutt, mail |
| MTA | Mail Transfer Agent | Core engine that transfers (routes) mail between servers | Sendmail, Postfix, Exim |
| MDA | Mail Delivery Agent | Makes the final delivery of mail received by the MTA to the user's mailbox | Procmail, Dovecot's LDA, mail.local |

- Drawn in one line, the flow looks like this.

```text
[Sender MUA] --SMTP--> [Sending MTA] --SMTP--> [Receiving MTA] --MDA--> [Mailbox]
                                                              ↑
                          [Recipient MUA] <--POP3/IMAP-- [Mailbox]
```

The MTA is "the truck hauling between post offices," the MDA is "the mail carrier dropping letters into the mailbox," and the MUA is "a person writing and reading letters." MTAs talk to each other over SMTP, the MDA drops the mail into the mailbox, and then the MUA looks into that mailbox over POP3/IMAP. This division of labor is the backbone of the mail architecture.

**Key distinction**: MTA and MDA are different stages. The MTA is the transfer stage that moves mail **from server to server**, while the MDA is the final delivery stage that **drops that mail into the local user's mailbox**. SMTP is the language of the MTA; POP3/IMAP are the language of the MUA that reads the mailbox.

## Mail Protocols and Ports — The Asymmetry of Sending and Receiving

- This is what the practical exam asks about. You must **memorize the port numbers outright**.

| Protocol | Direction | Plaintext port | Encrypted (SSL/TLS) port |
|----------|------|-----------|----------------------|
| SMTP | Sending (MUA→MTA, MTA→MTA) | 25 | 465 (SMTPS), 587 (STARTTLS submission) |
| POP3 | Receiving (server→MUA, download) | 110 | 995 (POP3S) |
| IMAP | Receiving (server→MUA, kept on server) | 143 | 993 (IMAPS) |

Points to lock into memory:

- **Sending = SMTP = 25**, secure sending = 465 / 587
- **POP3 = 110 → 995**, **IMAP = 143 → 993** (memorizing both by their ending-digit pattern is safe)
- 25 is the standard for relaying between MTAs, 587 is the authenticated port where users "submit" mail

> ⚠️ **Trap**: Some questions mix up 465 and 587. 465 is SMTPS, which wraps the connection in SSL from the start; 587 is the mail submission port that starts in plaintext and is encrypted via STARTTLS. Also, a choice that flips the direction to "receiving = 110/143, sending = 25" is wrong. A choice that attaches 25 to POP3 is wrong as well.

**Key distinction**: POP3 vs IMAP — POP3 **downloads mail to the client and deletes it from the server** (by default), so it suits use on a single device. IMAP **leaves mail on the server and syncs**, so it suits viewing the same mailbox from multiple devices. "Syncing across multiple devices = IMAP" is the signal for the correct answer.

### Try It Yourself — Checking Ports and Services

```bash
# Check whether the mail-related ports are LISTENing
ss -tlnp | grep -E ':(25|110|143|465|587|993|995)'

# Check the standard port definitions in /etc/services
grep -E '^(smtp|pop3|imap|submission|imaps|pop3s)\b' /etc/services

# Local mail delivery test (SMTP conversation via telnet)
telnet localhost 25
# Response: 220 mail.example.com ESMTP Postfix
```

SMTP uses port 25 because it is a historical number assigned back in 1982 in RFC 821. Later, as ISPs blocked outbound port 25 to stop spam, port 587 (RFC 4409) was split off for authenticated users to submit mail. That is why a large share of today's "mail goes out but I can only receive" outages are caused by port 25 being blocked.

## Sendmail vs Postfix — The Showdown of Two MTAs

- Linux's two representative MTAs are the traditional **Sendmail** and the modern **Postfix**.
- The exam asks about **the differences between the two and their config file locations**.

| Item | Sendmail | Postfix |
|------|----------|---------|
| Released | 1983, the oldest MTA | 1998, developed with security and simplicity as goals |
| Architecture | One huge monolithic process | Split into several small processes (modular) |
| Config file | `/etc/mail/sendmail.cf` (generated with m4) | `/etc/postfix/main.cf` (intuitive) |
| Config difficulty | Very complex (.mc → .cf compile) | Relatively easy (key=value) |
| Security | Weak privilege separation (many historical vulnerabilities) | Strong security through privilege separation |
| Current standing | Legacy | De facto standard, the RHEL default |

Postfix replaced Sendmail because "one huge process" was the weak point for security. Postfix splits receiving, queueing, and delivery into small processes with different privileges, designed so that a breach in one part doesn't spread to the whole. "Security and modular = Postfix" is the key.

### Postfix main.cf Key Directives

```bash
# /etc/postfix/main.cf — key settings
myhostname = mail.example.com      # This server's hostname
mydomain = example.com             # Domain name
myorigin = $mydomain               # Domain for outgoing mail (fixes up the sender address)
inet_interfaces = all              # Interfaces to listen on (all = every NIC)
mydestination = $myhostname, localhost, $mydomain   # Domains treated as local delivery
mynetworks = 127.0.0.0/8, 192.168.0.0/24            # Trusted networks allowed to relay
relayhost = [smtp.isp.com]:587     # Relay server that outbound mail goes through
home_mailbox = Maildir/            # Mailbox format (Maildir/ vs mbox)
```

- After changing the configuration, it **must be reloaded**.

```bash
postconf -n                # Print only settings that differ from the defaults (for checking)
postfix check              # Check config syntax
systemctl reload postfix   # Apply config changes without downtime
newaliases                 # Rebuild the DB after changing /etc/aliases
```

> ⚠️ **Trap**: If you set `inet_interfaces` to `localhost`, the server can't receive mail from outside. Also, if you open the `mynetworks` range too wide (e.g., 0.0.0.0/0), anyone can relay mail through this server, making it an **open relay** that gets abused as a spam source. They pair up as "can't receive = inet_interfaces, open relay risk = mynetworks".

**Key distinction**: Mailbox storage format mbox vs Maildir — mbox appends all mail into a single file, so lock conflicts are frequent, while Maildir stores each message as one file in a directory, which is safe for concurrent access. A value ending in a slash (/), like `home_mailbox = Maildir/`, is the signal for Maildir format.

### Mail Aliases and Queue Management

```bash
# /etc/aliases — redirect recipient addresses (aliases)
root:       admin@example.com    # Forward mail addressed to root to admin
webmaster:  root                 # Multi-level aliases are also possible
# After editing, always run
newaliases

# Check and handle the mail queue
mailq              # Show the pending mail queue (same as postqueue -p)
postqueue -f       # Flush the queue immediately (try resending)
postsuper -d ALL   # Delete all mail in the queue
```

It is common for mail not to go out right away and pile up in the queue. Because of a temporary outage on the receiving server, a DNS MX lookup failure, greylisting, and so on, the MTA doesn't discard the mail but keeps it in the queue and retries periodically. So when a report comes in that "mail is delayed," the first thing to do is check the queue state with `mailq`. This is the mail administrator's first diagnostic command.

## Pre-Exam Checklist

- Answer instantly: 25 (SMTP), 110 (POP3), 143 (IMAP), 465 (SMTPS), 587 (submission), 993 (IMAPS), 995 (POP3S)
- MTA (server-to-server transfer) ≠ MDA (mailbox delivery) ≠ MUA (user client)
- Postfix config is `/etc/postfix/main.cf`, Sendmail's is `/etc/mail/sendmail.cf`
- POP3 = download then delete, IMAP = keep on server and sync
- To prevent an open relay, keep mynetworks narrow

## 📖 Glossary

- **MUA (Mail User Agent)** : The client where people write and read mail. Outlook, Thunderbird, mutt, etc.
- **MTA (Mail Transfer Agent)** : The transfer engine that moves mail from server to server. Sendmail and Postfix are the typical ones.
- **MDA (Mail Delivery Agent)** : Handles the final delivery, dropping mail the MTA has received into the local user's mailbox.
- **SMTP** : The protocol for **sending** mail. Both MUA→MTA and MTA→MTA use it.
- **submission (587)** : The dedicated port where users submit mail after authenticating. Encrypted with STARTTLS.
- **SMTPS (465)** : A sending port that connects wrapped in SSL from the start. Easy to confuse with 587.
- **POP3 vs IMAP** : Download-and-delete-from-server (single device) / keep-on-server-and-sync (multiple devices).
- **`inet_interfaces`** : The interfaces on which Postfix receives mail. If set to `localhost`, it can't receive outside mail.
- **`mynetworks`** : The trusted networks allowed to relay. Too wide makes an open relay.
- **Open relay** : A state where anyone can relay mail through this server. Abused as a spam source.
- **`relayhost`** : Specifies the relay server that outbound mail passes through instead of being sent directly.
- **mbox vs Maildir** : Appending all mail into one file / storing each message as one file (safe for concurrent access).
- **`/etc/aliases`** : The alias file that forwards a recipient address to another address. After editing, you must rebuild the DB with `newaliases`.
- **Mail queue** : Where mail that couldn't be sent immediately piles up awaiting retry. View it with `mailq` and push it out with `postqueue -f`.

## 📝 Practice Questions

**Question 1.** Which component in a mail system is responsible for transferring (routing) mail between servers?

A) MUA — the client where users write and read mail

B) MTA — the transfer agent that transfers mail between servers

C) MDA — the agent that makes final delivery of received mail to the user's mailbox

D) MX — a DNS record pointing to a domain's mail server

**Answer: B**

Explanation: The MTA (Mail Transfer Agent), such as Sendmail or Postfix, is the core engine that transfers mail between servers over SMTP. A (MUA) is the user client, C (MDA) is the stage of final delivery to the mailbox, and D (MX) is just a DNS record, not a program. "Server-to-server transfer = MTA" is the key.

---

**Question 2.** Which option correctly pairs the default (plaintext) port numbers of SMTP, POP3, and IMAP, in order?

A) 25, 110, 143

B) 25, 143, 110

C) 110, 25, 143

D) 25, 995, 993

**Answer: A**

Explanation: SMTP is 25, POP3 is 110, and IMAP is 143. B has POP3 and IMAP swapped, C has SMTP and POP3 swapped, and in D, 995 and 993 are the encrypted ports for POP3S and IMAPS respectively, not plaintext ports. Lock in "sending 25 / receiving 110·143".

---

**Question 3.** Which statement about the difference between POP3 and IMAP is correct?

A) POP3 keeps mail on the server, which is good for syncing across multiple devices

B) IMAP downloads mail to the client and deletes it from the server by default

C) POP3 downloads mail and deletes it from the server, while IMAP keeps it on the server and syncs across multiple devices

D) Both are sending protocols for outgoing mail and share port 25

**Answer: C**

Explanation: POP3 deletes from the server after download (by default), which suits a single device, while IMAP keeps and syncs on the server so that multiple devices see the same mailbox. A and B swap the characteristics of the two protocols, and D is wrong because POP3/IMAP are for receiving, not sending. "Multiple devices = IMAP" is the signal for the correct answer.

---

**Question 4.** Which is the correct path of Postfix's main configuration file?

A) `/etc/mail/sendmail.cf`

B) `/etc/postfix/main.cf`

C) `/etc/postfix/aliases.db`

D) `/etc/services`

**Answer: B**

Explanation: Postfix's main configuration file is `/etc/postfix/main.cf`, which holds intuitive key=value directives. A is Sendmail's config file, C is the binary alias database, and D is the port-to-service mapping file, so none relate to Postfix's main configuration. Distinguish "Postfix = main.cf, Sendmail = sendmail.cf".

---

**Question 5.** Which option correctly pairs the port used to send mail encrypted with SSL/TLS (SMTPS) and the IMAP encrypted port (IMAPS)?

A) SMTPS 587, IMAPS 995

B) SMTPS 465, IMAPS 993

C) SMTPS 25, IMAPS 143

D) SMTPS 993, IMAPS 465

**Answer: B**

Explanation: SMTPS is 465 and IMAPS is 993. In A, 587 is the STARTTLS mail submission port and 995 is POP3S, not IMAPS; C is both plaintext ports; D has the two values swapped. Memorize them as a set: "encrypted: SMTPS 465, IMAPS 993, POP3S 995".

---

**Question 6.** Which describes a characteristic of Postfix compared with Sendmail?

A) It has a single huge-process architecture and very complex configuration

B) It separates privileges across several small processes, giving higher security and relatively easy configuration

C) Its config file is `/etc/mail/sendmail.cf` and it must be compiled with m4

D) It is a POP3 receive-only server with no mail transfer function

**Answer: B**

Explanation: Postfix separates receiving, queueing, and delivery into small processes with different privileges, so security is high, and the key=value format of main.cf makes configuration easy. A and C are characteristics of Sendmail, and D is wrong because it denies that Postfix is an MTA (a transfer server). "Modular, secure, main.cf = Postfix" is the key.

---

**Question 7.** What security problem occurs when `mynetworks` in Postfix is set excessively wide, such as `0.0.0.0/0`?

A) The server can't receive mail at all

B) It becomes an open relay through which anyone can relay mail, and is abused for sending spam

C) The POP3 port is closed automatically

D) The mailbox is forcibly changed from mbox to Maildir

**Answer: B**

Explanation: `mynetworks` specifies the trusted networks allowed to relay, and if you open it to everything, anyone outside can relay mail through this server, making it an open relay that gets abused as a spam source. A is a symptom related to inet_interfaces, and C and D have nothing to do with mynetworks. Connect "open relay risk = mynetworks opened too wide".

---
