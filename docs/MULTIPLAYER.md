# Tingle Craft Multiplayer

The whole game ships as one HTML file (`DINGLECRAFT.html` / `dist/dinglecraft_v7.1.html`),
and the server ships as one dependency-free Python file. No accounts database, no pip
installs, no Node — just `python server.py`.

```
python server.py                        # port 8765, data in server_data/
python server.py --port 9000
python server.py --admin YourName       # flags/creates an admin account
python server.py --data my_data         # custom data folder
```

Open the game, press **Multiplayer**, add a server (`name` + `address`), and log in
(register the first time). The address forms the client understands:

| Address | Meaning |
| --- | --- |
| `127.0.0.1:8765` | plain host + port |
| `ws://host:8765` | explicit websocket |
| `wss://host/tc` | TLS websocket at path `/tc` — reverse proxies |
| `ws://host:8765/tc/ws` | websocket behind a path-mounted proxy |

On an `https://` page a bare `host:port` defaults to `wss://` (browsers forbid mixed
content); be explicit when you need otherwise.

## What the server does

- **Accounts** with salted+hashed passwords (nobody can join as you), admins flagged by
  the server owner (`--admin` or console `op`).
- **A shared world**: the seed plus every block edit, autosaved to `world.json` and
  replayed to everyone who joins.
- **Everything in sync**: the server owns the clock (day/night broadcast every 5 s),
  relays each player's held item, and brokers mobs — one client simulates each mob,
  the server relays it, and the mob can chase and hit *any* nearby player (their own
  client applies the damage).
- **Economy**: balances in DB, a shop (GUI via `/shop`), a sell menu (`/sell`), bounties
  for mob kills, `/pay`.
- **Homes**: `/sethome <name>`, `/home <name>`, `/delhome`, `/homes`, or the Homes GUI
  (5 homes per player, 10 for admins).
- **Admin panel**: pause menu → *Server Admin* — set balances, kick/ban/op/deop, bring
  players, set time/spawn/MOTD, toggle mob spawning, save.
- **Console**: `help`, `op`, `ban`, `passwd`, `money`, `time`, `mobson/mobsoff`, `say`,
  `motd`, `list`, `save`, `stop`.

World data lives in `--data` (`server_data/` by default): `accounts.json`,
`world.json`, `bans.json`. JSON all the way down; back it up while the server runs.

## Reverse proxy

The handshake accepts **any path**, so you can mount the server anywhere. Plain HTTP
requests get a friendly text answer (nice for uptime checks). Both examples below
proxy wss on `/tc` to a server running on `127.0.0.1:8765`.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name games.example.com;
    # ssl_certificate     /etc/letsencrypt/live/games.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/games.example.com/privkey.pem;

    location /tc {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;   # long-lived websocket
        proxy_send_timeout 3600s;
    }
}
```

Players connect with `wss://games.example.com/tc`.

### Caddy

```caddy
games.example.com {
    reverse_proxy /tc/* 127.0.0.1:8765
}
```

Caddy upgrades websockets automatically and provisions TLS. Players connect with
`wss://games.example.com/tc`.

### Notes

- The proxy must forward the `Upgrade`/`Connection` headers (nginx needs the two
  `proxy_set_header` lines above; Caddy does it by itself).
- Raise the read timeout: the game pings every 20 s and the server pings every 30 s,
  but some default proxy timeouts (60 s) are stricter than needed — the values above
  are safe.
- `X-Forwarded-For` is logged on handshake so bans/kicks can be correlated.
- No TLS in server.py itself — terminate TLS at the proxy. For a direct wss:// origin
  without a proxy, put a minimal TLS terminator (caddy `tls internal`, stunnel, etc.)
  in front.
