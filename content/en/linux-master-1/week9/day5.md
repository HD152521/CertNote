# Day 5 - Week 9 Comprehensive Review: Names, Addresses, Time, and the Web on One Page

## 📌 Key Takeaways

- Every network service boils down to **"in which config file, with which directive, declaring what"**.
- Only the commands differ per service; the rhythm is the same — **install → configure → syntax check → start/reapply → check status**.
- Instant port recall: **DNS 53 · DHCP 67/68 · NTP 123 · HTTP 80 · HTTPS 443.** Daemons: bind→named, dhcp→dhcpd, chrony→chronyd, httpd, nginx.
- Instant check-command recall: **`named-checkconf` (DNS) · `httpd -t` (Apache) · `nginx -t` (Nginx)**.
- Three traps: **you must bump the Serial when editing a zone**, **169.254 is a DHCP failure signal**, **stratum 0 is the reference clock and 16 is unsynchronized**.

## The 5 Major Services in One Table — Package, Daemon, Config, Port

| Service | Package | Daemon | Key config file | Port |
|--------|--------|------|----------------|------|
| DNS | bind | named | /etc/named.conf, /var/named/*.zone | 53 (UDP/TCP) |
| DHCP | dhcp-server | dhcpd | /etc/dhcp/dhcpd.conf | 67/68 (UDP) |
| NTP | chrony | chronyd | /etc/chrony.conf | 123 (UDP) |
| Apache | httpd | httpd | /etc/httpd/conf/httpd.conf | 80/443 |
| Nginx | nginx | nginx | /etc/nginx/nginx.conf | 80/443 |

Memory anchors:

- **Instant port numbers**: DNS 53, DHCP 67/68, NTP 123, HTTP 80, HTTPS 443.
- On the RHEL family, Apache's package and daemon are both `httpd`, and DNS is `named` (the package is bind).
- Check tools after a config change: `named-checkconf` (DNS), `httpd -t` (Apache), `nginx -t` (Nginx).

Every service rides the same rhythm of "install → edit config file → syntax check → start/reapply daemon → check status". Only the commands differ per service; the flow is identical. Once this rhythm is in your bones, you can handle a service you have never seen the same way.

## DNS Review — Records and Zone Files

| Record | Role |
|--------|------|
| A / AAAA | Name→IPv4 / Name→IPv6 |
| CNAME | Alias→canonical name |
| MX | Mail server (lower priority number wins) |
| NS | Authoritative name server for the zone |
| PTR | IP→name (reverse, in-addr.arpa) |
| SOA | Zone authority start and refresh clock (one per zone) |

- SOA 5-timer order: **Serial (serial number) → Refresh (check interval) → Retry → Expire (discard limit) → Minimum (negative cache)**.

> ⚠️ **Trap review**: In a zone file, if a name does not end with a dot, the zone name (origin) is appended automatically — the targets of CNAME, NS, and MX are safest with a trailing dot (FQDN). When you modify a zone you **must increase the Serial** for the secondary server to receive the change. You cannot place a CNAME at the top of the domain (@).

## DHCP and NTP Review — Addresses and Time

- The 4 DHCP steps are **DORA** — Discover → Offer → Request → Ack.
- The first DISCOVER goes out as a **broadcast** because there is no IP yet, and beyond a router a **relay** is needed.

| dhcpd.conf directive | Role |
|-------------------|------|
| `range` | Dynamic distribution IP pool |
| `option routers` | Default gateway |
| `option domain-name-servers` | DNS server |
| `hardware ethernet` + `fixed-address` | MAC-based fixed IP reservation |

- For NTP stratum, **the lower the number, the more accurate** (0 = reference clock, 1 = primary server, 16 = unsynchronized).
- chrony sets **sources with `server`/`pool` and the client range with `allow`** in `chrony.conf`.
- Check status with `chronyc sources`, `chronyc tracking`, and `timedatectl`.

> ⚠️ **Trap review**: The DHCP failure signal is 169.254.x.x (APIPA). NTP stratum 0 is not unsynchronized but the reference clock itself, and 16 is unsynchronized. It is safest to keep dhcpd.conf fixed IPs outside the dynamic `range`.

## Web Server Review — Apache vs Nginx Mapping Table

| Concept | Apache | Nginx |
|------|--------|-------|
| Listening port | `Listen` | `listen` |
| Virtual host name | `ServerName` | `server_name` |
| Document root | `DocumentRoot` | `root` |
| Default document | `DirectoryIndex` | `index` |
| Virtual host block | `<VirtualHost>` | `server { }` |
| Per-path handling | `<Directory>`/`<Location>` | `location { }` |
| Syntax check | `httpd -t` | `nginx -t` |
| Per-directory distributed config | `.htaccess` supported | Not supported (centralized) |

- Virtual hosts: **name-based** (distinguished by the Host header, many sites on 1 IP) vs **IP-based** (distinguished by IP, one IP per site).
- HTTP/1.1 **making the Host header mandatory** made name-based the standard.

Apache is stable with a process per connection (prefork) but uses a lot of memory, while Nginx is event-driven and asynchronous, strong at concurrent connections and static serving. In practice, a combination is common with Nginx in front (reverse proxy, static, TLS) and Apache or an app server behind. A reverse proxy is configured with `upstream` + `proxy_pass`, and unlike a forward proxy (acting for clients), it distributes requests in front of the servers.

## Summary of Config-Check and Status Commands

```bash
# DNS
named-checkconf                         # named.conf syntax
named-checkzone example.com zonefile    # zone syntax
dig www.example.com / dig -x 1.2.3.4    # Forward/reverse lookup

# DHCP
systemctl status dhcpd
cat /var/lib/dhcpd/dhcpd.leases         # Lease status

# NTP/chrony
chronyc sources                         # Time source list
chronyc tracking                        # Sync accuracy and stratum
timedatectl                             # Time, timezone, NTP sync status

# Apache
httpd -t                                # Syntax check
httpd -S                                # Virtual host list
httpd -M                                # Loaded modules

# Nginx
nginx -t                                # Syntax check
nginx -s reload                         # Zero-downtime reapply
```

This week's services are the history of internet infrastructure itself. DNS (1983) solved the limits of the hosts file with a distributed system, DHCP (1993) extended BOOTP to complete IP automation, NTP (1985) synchronized the clocks of distributed systems, Apache (1995) popularized the web, and Nginx (2004) solved the C10K problem and made large-scale services possible. Today no web request is completed without passing through these five.

## Integrated Scenario — The Journey of One Request

- From the moment a user types `www.example.com` until they receive the page, let's connect in one line how this week's services cooperate.

```
1. (DHCP) At boot, the PC leases an IP, gateway, and DNS server (DORA)
2. (DNS)  The local DNS asks the BIND authoritative server about www.example.com and gets the IP
3. (NTP)  Servers sync their clocks with chrony to keep certificates and logs consistent
4. (Nginx) The front Nginx receives the request, serves static files directly and proxies dynamic ones to the backend
5. (Apache) The backend Apache generates the dynamic content and responds
```

- These five steps must mesh smoothly for the user to see a single page.
- If any one link breaks, everything stops — **DHCP failure = no IP, DNS failure = cannot resolve names, NTP drift = certificate errors, web server down = 503**.
- Understanding network services as a **"chain"** is this week's conclusion.

## 📖 Glossary

- **Zone file** : A file gathering the records of one domain zone. It starts with a single SOA.
- **Serial** : The zone's serial number. You must raise this after editing for secondary servers to pick up the change.
- **Trailing dot** : The dot after a name in a zone file. Without it, the zone name is appended automatically.
- **DORA** : DHCP's 4 steps Discover → Offer → Request → Ack.
- **DHCP relay** : A feature that forwards requests on a client's behalf past a router that broadcasts cannot cross.
- **`range` vs `fixed-address`** : The IP pool to hand out dynamically / a reservation that always gives the same IP to a specific MAC.
- **stratum** : The distance from the reference clock. 0 is the clock itself, 1 is a primary server, 16 is unsynchronized.
- **`chronyc tracking`** : A command that shows sync quality such as the current reference server, offset, and stratum.
- **DocumentRoot / root** : The actual path the URL root points to. The same concept in Apache and Nginx, with different names.
- **Virtual host** : Configuration that serves multiple sites from one server. There are name-based and IP-based kinds.
- **Reverse proxy** : A relay that receives external requests in front of the server and distributes them to internal backends. `upstream` + `proxy_pass`.
- **`.htaccess`** : The distributed configuration file Apache places in each directory. Nginx does not support it.

## 📝 Practice Questions

**Question 1.** Which is correct for the daemon name and port used by the DNS server BIND?

A) bind, port 80
B) named, port 53
C) dhcpd, port 67
D) httpd, port 443

**Answer: B**
Explanation: BIND's daemon name is named, and the DNS port is 53 (UDP/TCP). The package name is bind, but the running daemon is named. 67 is DHCP, and 80/443 are the web.

---

**Question 2.** Which is the correct order of the five timer fields of an SOA record?

A) Refresh → Serial → Retry → Minimum → Expire
B) Serial → Refresh → Retry → Expire → Minimum
C) Serial → Retry → Refresh → Minimum → Expire
D) Expire → Serial → Refresh → Retry → Minimum

**Answer: B**
Explanation: The SOA field order is Serial (serial number) → Refresh (check interval) → Retry → Expire (discard limit) → Minimum (negative cache TTL). Serial comes first, and you must raise this value when editing for the secondary server to update.

---

**Question 3.** Which lists the 4 steps of DHCP IP assignment in order?

A) Offer → Discover → Ack → Request
B) Discover → Offer → Request → Ack
C) Request → Offer → Discover → Ack
D) Discover → Request → Offer → Ack

**Answer: B**
Explanation: The DORA order — Discover → Offer → Request → Ack. The first DISCOVER is sent as a broadcast because there is no IP yet.

---

**Question 4.** Which of the following is correct about NTP stratum?

A) Stratum 0 is the unsynchronized state
B) The larger the stratum number, the closer to the reference clock
C) Stratum 1 is a primary server directly connected to the reference clock
D) Stratum is a concept used only in chrony

**Answer: C**
Explanation: Stratum 0 is the reference clock itself (GPS, atomic clock), and stratum 1 is the primary server directly connected to it. The smaller the number the more accurate, and 16 means unsynchronized. Stratum is a standard NTP concept.

---

**Question 5.** Which directive combination in dhcpd.conf is used to always assign the same IP to a device with a specific MAC address?

A) `range` + `option routers`
B) `hardware ethernet` + `fixed-address`
C) `default-lease-time` + `max-lease-time`
D) `subnet` + `netmask`

**Answer: B**
Explanation: Inside a `host` block, identify the MAC with `hardware ethernet` and specify the fixed IP with `fixed-address`. `range` is the dynamic pool, lease-time is the lease duration, and subnet/netmask define the network.

---

**Question 6.** Which Nginx directive corresponds to Apache's DocumentRoot?

A) `listen`
B) `server_name`
C) `root`
D) `proxy_pass`

**Answer: C**
Explanation: Nginx's `root` is the document root and corresponds to Apache's DocumentRoot. `listen` = Listen (port), `server_name` = ServerName (domain), and `proxy_pass` is the reverse proxy forwarding directive.

---

**Question 7.** Which correctly pairs the virtual host method that serves several domains with a single IP address and the criterion Apache uses to distinguish sites?

A) IP-based — Host header
B) Name-based — HTTP Host header
C) Name-based — client MAC
D) IP-based — port number

**Answer: B**
Explanation: Name-based virtual hosts serve several domains with one IP and distinguish sites by the HTTP request's Host header. This became possible because HTTP/1.1 made the Host header mandatory. IP-based distinguishes by IP and needs an IP per site.

---

**Question 8.** Which directive combination is used in Nginx to forward requests to backend servers behind it and distribute load across several backends?

A) `root` + `index`
B) `upstream` + `proxy_pass`
C) `server_name` + `listen`
D) `gzip` + `sendfile`

**Answer: B**
Explanation: Define the backend server group with `upstream` and forward requests with `proxy_pass http://group-name;`. This is the core configuration for reverse proxying and load balancing. root/index are for static serving, and gzip/sendfile are performance tuning.

---

**Question 9.** Which of the following pairs a service with the wrong config syntax check command?

A) DNS — `named-checkconf`
B) Apache — `httpd -t`
C) Nginx — `nginx -t`
D) DHCP — `chronyc sources`

**Answer: D**
Explanation: `chronyc sources` is the command to check NTP (chrony) time source status, not a DHCP check. DHCP is checked with `dhcpd -t` or `systemctl status dhcpd`. The others are paired correctly.

---

**Question 10.** A client could not find a DHCP server and ended up with an IP in the 169.254.x.x range. Which is the correct description of this state?

A) It properly received a private IP from DHCP
B) It is an APIPA (link-local) address, a signal that no DHCP server was found
C) It is a loopback address, so the network is fine
D) It received a public IP

**Answer: B**
Explanation: 169.254.0.0/16 is the APIPA (automatic private IP assignment, link-local) range, automatically assigned when no DHCP response is received. That is, it is a signal of "DHCP server not found". 127 is loopback, and the private ranges are 10/172.16-31/192.168.

---

**Question 11.** Which of the following about the differences between Nginx and Apache is NOT correct?

A) Nginx handles many connections asynchronously and event-driven
B) Apache supports per-directory distributed configuration with .htaccess
C) Nginx also supports .htaccess by default, so per-directory configuration is possible
D) Apache traditionally uses a process/thread per connection

**Answer: C**
Explanation: Nginx does not support .htaccess and manages all configuration centrally (faster because it does not dig through directories on every request). So C is the incorrect statement. All the others are correct.

---

**Question 12.** When a user requests a web page, which is the most appropriate order of cooperation among this week's services?

A) Get an IP from DNS, then resolve the name with DHCP
B) Acquire an IP with DHCP → convert the domain to an IP with DNS → the web server responds
C) Web server responds → DNS lookup → DHCP lease
D) DNS works only after time is synchronized with NTP

**Answer: B**
Explanation: The PC first leases its IP and DNS server info via DHCP (securing an address), converts the domain to an IP via DNS (name resolution), then connects to the web server (Nginx/Apache) at that IP and receives the response. NTP is supporting infrastructure for clock consistency between servers and is not a precondition for DNS to work.

---
