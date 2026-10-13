#!/usr/bin/env python3
"""
TINGLE CRAFT - multiplayer server (server.py)

A simple, dependency-free Minecraft-SMP-style server for the Tingle Craft
browser game (the one-HTML-file voxel sandbox based on DINGLECRAFT).
Pure Python standard library: no pip installs, ever. Run it and point the
game's Multiplayer menu at your machine's address.

    python server.py                       # port 8765, data in server_data/
    python server.py --port 9000
    python server.py --admin YourName      # creates/flags an admin account
    python server.py --data my_data        # custom data folder

What it gives you (like a simple Minecraft SMP):
  * accounts with salted+hashed passwords, so nobody can join as you by
    typing your name; admins are flagged by the server owner only
  * a shared, persistent world: the seed plus every block edit, saved to
    disk (world.json) and replayed to everyone who joins
  * chat, whispers, a player list, join/leave messages
  * commands: /help /list /money /pay /rtp /tpa /tpaccept /tpdeny /msg
    /spawn /backrooms /shop, and for admins: /kick /ban /op /deop /say
  * an economy: every account has a balance ("DB" in game). /shop buys
    blocks, /pay sends money to another player
  * a server console: type commands like "op Steve", "ban Griefer", "say hi"

World data lives in the --data folder: accounts.json, world.json, bans.json.
Everything is JSON so you can inspect or back it up while the server runs.
"""

import argparse
import asyncio
import base64
import hashlib
import json
import os
import random
import re
import secrets
import signal
import socket
import sys
import threading
import time

DEFAULT_PORT = 8765
PROTO_VERSION = 1
MOTD = "Welcome to Tingle Craft. Be nice, build things, mind the Backrooms."
START_MONEY = 100
RTP_RADIUS = 2000          # /rtp picks a random spot within this range
TPA_TTL = 60.0             # /tpa requests expire after this many seconds
SAVE_EVERY = 30.0          # periodic autosave, seconds
NAME_RE = re.compile(r"^[A-Za-z0-9_\-]{2,16}$")

# The in-game shop: id = the game's block/item id, price in DB (per unit).
SHOP = [
    {"n": "dirt",       "id": 2,   "p": 1},
    {"n": "cobblestone","id": 4,   "p": 2},
    {"n": "planks",     "id": 5,   "p": 2},
    {"n": "sandstone",  "id": 23,  "p": 3},
    {"n": "brick",      "id": 27,  "p": 5},
    {"n": "glass",      "id": 16,  "p": 6},
    {"n": "wool",       "id": 26,  "p": 5},
    {"n": "torch",      "id": 33,  "p": 4},
    {"n": "glowstone",  "id": 82,  "p": 10},
    {"n": "obsidian",   "id": 84,  "p": 18},
    {"n": "steak",      "id": 114, "p": 8},
    {"n": "diamond",    "id": 104, "p": 60},
]


# ---------------------------------------------------------------- storage --
def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 60000
    ).hex()


class Store:
    """All server state that touches the disk."""

    def __init__(self, data_dir, admin_name):
        self.dir = data_dir
        os.makedirs(self.dir, exist_ok=True)
        self.accounts_path = os.path.join(self.dir, "accounts.json")
        self.world_path = os.path.join(self.dir, "world.json")
        self.bans_path = os.path.join(self.dir, "bans.json")
        self.accounts = load_json(self.accounts_path, {})
        self.bans = load_json(self.bans_path, [])
        world = load_json(self.world_path, None)
        if world is None:
            world = {"seed": random.randrange(-2**31, 2**31),
                     "spawn": None, "time": 0.3, "motd": MOTD, "edits": {}}
            print("[world] new world, seed %d" % world["seed"])
        self.world = world
        self.world.setdefault("edits", {})
        self.dirty = False
        if admin_name:
            acc = self.account(admin_name)
            if acc is None:
                self.create_account(admin_name, secrets.token_urlsafe(12))
                acc = self.accounts[admin_name]
                print("[admin] created account %r with a random password "
                      "(console: passwd %s <new> to set one)" % (admin_name, admin_name))
            acc["admin"] = True
            self.save_accounts()
            print("[admin] %r is an admin" % admin_name)

    # -- accounts ----------------------------------------------------------
    def account(self, name):
        return self.accounts.get(name)

    def create_account(self, name, password):
        salt = secrets.token_hex(16)
        self.accounts[name] = {
            "salt": salt,
            "hash": hash_password(password, salt),
            "admin": False,
            "money": START_MONEY,
            "created": int(time.time()),
        }
        self.save_accounts()

    def check_login(self, name, password):
        acc = self.account(name)
        if not acc:
            return "No account named %r here. Use Register." % name
        if hash_password(password, acc["salt"]) != acc["hash"]:
            return "Wrong password for %r." % name
        return None

    def save_accounts(self):
        save_json(self.accounts_path, self.accounts)

    # -- bans --------------------------------------------------------------
    def banned(self, name):
        return name.lower() in [b.lower() for b in self.bans]

    def save_bans(self):
        save_json(self.bans_path, self.bans)

    # -- world -------------------------------------------------------------
    def save_world(self):
        save_json(self.world_path, self.world)
        self.dirty = False

    def save_all(self):
        self.save_accounts()
        self.save_bans()
        self.save_world()


# ------------------------------------------------------------------ wire --
class WS:
    """Minimal RFC 6455 websocket on top of an asyncio stream."""

    def __init__(self, reader, writer):
        self.r = reader
        self.w = writer
        self.alive = True
        self.buf = b""          # bytes read past the handshake (pipelined frames)

    async def _read(self, n):
        """Read n bytes, consuming any handshake leftovers first."""
        while len(self.buf) < n:
            c = await self.r.read(65536)
            if not c:
                raise asyncio.IncompleteReadError(self.buf, n)
            self.buf += c
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    @staticmethod
    def accept_key(key):
        GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        return base64.b64encode(
            hashlib.sha1((key + GUID).encode("ascii")).digest()
        ).decode("ascii")

    @classmethod
    async def handshake(cls, reader, writer):
        # read the HTTP request headers
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = await asyncio.wait_for(reader.read(4096), 10)
            if not chunk:
                return None
            data += chunk
            if len(data) > 65536:
                return None
        head = data.split(b"\r\n\r\n", 1)
        rest = head[1] if len(head) > 1 else b""
        key = None
        for line in head[0].decode("latin1").split("\r\n"):
            if line.lower().startswith("sec-websocket-key:"):
                key = line.split(":", 1)[1].strip()
        if not key:
            return None
        resp = ("HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                "Sec-WebSocket-Accept: %s\r\n\r\n" % cls.accept_key(key))
        writer.write(resp.encode("ascii"))
        await writer.drain()
        ws = cls(reader, writer)
        ws.buf = rest
        return ws

    async def recv(self):
        """Returns (opcode, payload) for a full message, or None on close."""
        buf = b""
        opcode = None
        while self.alive:
            try:
                hdr = await self._read(2)
            except (asyncio.IncompleteReadError, ConnectionError):
                return None
            fin = hdr[0] & 0x80
            op = hdr[0] & 0x0F
            masked = hdr[1] & 0x80
            ln = hdr[1] & 0x7F
            if ln == 126:
                ext = await self._read(2)
                ln = int.from_bytes(ext, "big")
            elif ln == 127:
                ext = await self._read(8)
                ln = int.from_bytes(ext, "big")
            if ln > 4 * 1024 * 1024:      # 4 MB cap per frame
                return None
            mask = await self._read(4) if masked else b"\0\0\0\0"
            payload = await self._read(ln) if ln else b""
            if masked:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if op == 0x8:                 # close
                await self.send_frame(0x8, payload[:2])
                return None
            if op == 0x9:                 # ping -> pong
                await self.send_frame(0xA, payload)
                continue
            if op == 0xA:                 # pong
                continue
            if op in (0x1, 0x2):
                opcode = op
                buf = payload
            elif op == 0x0 and opcode is not None:
                buf += payload            # continuation
            if fin and opcode is not None:
                out = (opcode, buf)
                opcode = None
                buf = b""
                return out

    async def send_frame(self, op, payload):
        if not self.alive:
            return False
        try:
            n = len(payload)
            if n < 126:
                hdr = bytes([0x80 | op, n])
            elif n < 65536:
                hdr = bytes([0x80 | op, 126]) + n.to_bytes(2, "big")
            else:
                hdr = bytes([0x80 | op, 127]) + n.to_bytes(8, "big")
            self.w.write(hdr + payload)
            await self.w.drain()
            return True
        except (ConnectionError, RuntimeError):
            self.alive = False
            return False

    async def send_json(self, obj):
        return await self.send_frame(0x1, json.dumps(obj, separators=(",", ":")).encode("utf-8"))

    async def close(self):
        self.alive = False
        try:
            self.w.close()
        except Exception:
            pass


# ---------------------------------------------------------------- server --
class Player:
    def __init__(self, ws, name, admin):
        self.ws = ws
        self.name = name
        self.admin = admin
        self.x = 0.5
        self.y = 40.0
        self.z = 0.5
        self.yaw = 0.0
        self.pitch = 0.0
        self.dim = "over"
        self.hp = 20
        self.rtp_wait = None          # (tx, tz, expiry): /rtp waiting for the client's surface reply
        self.tpa_from = None          # {name: expiry} of incoming requests
        self.last_pos = 0.0


class Server:
    def __init__(self, host, port, store):
        self.host = host
        self.port = port
        self.store = store
        self.players = {}             # name -> Player
        self.consoles = []            # admin players subscribed to console output
        self.tpa_out = {}             # name -> {target: expiry}

    # ------------------------------------------------------------- helpers
    def online(self, name):
        for n, p in self.players.items():
            if n.lower() == name.lower():
                return p
        return None

    def online_names(self):
        return list(self.players.keys())

    async def broadcast(self, obj, exclude=None):
        dead = []
        for n, p in self.players.items():
            if exclude and n == exclude:
                continue
            if not await p.ws.send_json(obj):
                dead.append(n)
        for n in dead:
            self.drop(n, "connection lost")

    async def sys_to(self, player, txt):
        await player.ws.send_json({"t": "sys", "txt": str(txt)[:400]})

    async def sys_all(self, txt):
        await self.broadcast({"t": "sys", "txt": str(txt)[:400]})

    def console(self, txt):
        print("[server] " + txt)

    def drop(self, name, why):
        p = self.players.pop(name, None)
        if p:
            self.tpa_out.pop(name, None)
            print("[left] %s (%s)" % (name, why))
            asyncio.ensure_future(self.broadcast({"t": "leave", "name": name}))

    # ---------------------------------------------------------- connection
    async def handle(self, reader, writer):
        ws = None
        name = None
        try:
            peer = writer.get_extra_info("peername")
            try:
                ws = await WS.handshake(reader, writer)
            except (asyncio.TimeoutError, ConnectionError, OSError):
                ws = None
            if not ws:
                writer.close()
                return
            while ws.alive and name is None:
                msg = await self.recv_json(ws)
                if msg is None:
                    return
                name = await self.hello(ws, msg)   # None until logged in
                if name is None and msg.get("t") not in ("login", "register"):
                    return
            if name is None:
                return
            player = self.players[name]
            while ws.alive:
                msg = await self.recv_json(ws)
                if msg is None:
                    break
                await self.dispatch(player, msg)
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        except Exception as e:  # never let one client kill the loop
            import traceback
            self.console("error handling %r: %r\n%s" % (name, e, traceback.format_exc()))
        finally:
            if name and name in self.players:
                self.drop(name, "disconnected")
            if ws:
                await ws.close()
            try:
                writer.close()
            except Exception:
                pass

    async def recv_json(self, ws):
        got = await ws.recv()
        if got is None:
            return None
        op, payload = got
        if op != 0x1:
            return {}
        try:
            m = json.loads(payload.decode("utf-8"))
            return m if isinstance(m, dict) else {}
        except (ValueError, UnicodeDecodeError):
            return {}

    async def hello(self, ws, m):
        t = m.get("t")
        if t not in ("login", "register"):
            return None
        name = str(m.get("name", "")).strip()
        pw = str(m.get("pass", ""))
        if not NAME_RE.match(name):
            await ws.send_json({"t": "denied", "reason":
                                "Name: 2-16 letters, digits, _ or -."})
            return None
        if self.store.banned(name):
            await ws.send_json({"t": "denied", "reason": "You are banned from this server."})
            return None
        if t == "register":
            if self.store.account(name):
                await ws.send_json({"t": "denied", "reason":
                                    "That name is taken. Pick another or Log In."})
                return None
            if len(pw) < 4:
                await ws.send_json({"t": "denied", "reason":
                                    "Password: at least 4 characters."})
                return None
            self.store.create_account(name, pw)
            self.console("registered %s" % name)
        err = self.store.check_login(name, pw)
        if err:
            await ws.send_json({"t": "denied", "reason": err})
            return None
        if name in self.players:      # an old tab is still open: kick it
            old = self.players[name]
            await old.ws.send_json({"t": "kick", "reason": "You joined from another tab."})
            self.drop(name, "rejoined")
            await old.ws.close()
        acc = self.store.account(name)
        player = Player(ws, name, bool(acc.get("admin")))
        w = self.store.world
        self.players[name] = player
        if acc.get("admin"):
            self.consoles.append(name)
        # welcome: the seed, the whole edit list, spawn, balance
        await ws.send_json({
            "t": "welcome",
            "v": PROTO_VERSION,
            "name": name,
            "seed": w["seed"],
            "time": w.get("time", 0.3),
            "motd": w.get("motd", MOTD),
            "spawn": w.get("spawn"),
            "edits": w["edits"],
            "balance": int(acc.get("money", 0)),
            "admin": player.admin,
            "players": self.online_names(),
        })
        if w.get("spawn"):
            player.x, player.y, player.z = w["spawn"]
        print("[join] %s%s" % (name, " (admin)" if player.admin else ""))
        await self.broadcast({"t": "join", "name": name}, exclude=name)
        await self.sys_all(name + " joined the game")
        return name

    # ---------------------------------------------------------- dispatch
    async def dispatch(self, p, m):
        t = m.get("t")
        if t in ("login", "register"):
            await p.ws.send_json({"t": "denied", "reason": "Already logged in as %r." % p.name})
            return
        if t == "pos":
            p.x = float(m.get("x", p.x))
            p.y = float(m.get("y", p.y))
            p.z = float(m.get("z", p.z))
            p.yaw = float(m.get("yaw", p.yaw))
            p.pitch = float(m.get("pitch", p.pitch))
            p.dim = str(m.get("dim", p.dim))[:16]
            now = time.time()
            if now - p.last_pos > 0.05:      # ~20 Hz cap
                p.last_pos = now
                await self.broadcast({
                    "t": "pos", "name": p.name, "x": round(p.x, 2), "y": round(p.y, 2),
                    "z": round(p.z, 2), "yaw": round(p.yaw, 3), "pitch": round(p.pitch, 3),
                    "dim": p.dim, "hp": int(m.get("hp", 20)),
                }, exclude=p.name)
        elif t == "set":
            ck = str(m.get("ck", ""))[:32]
            lk = str(m.get("lk", ""))[:24]
            try:
                bid = int(m.get("id", 0)) & 0xFF
            except (TypeError, ValueError):
                return
            if not ck or "," not in ck or "," not in lk:
                return
            self.store.world["edits"].setdefault(ck, {})[lk] = bid
            self.store.dirty = True
            await self.broadcast({"t": "set", "ck": ck, "lk": lk, "id": bid},
                                 exclude=p.name)
        elif t == "chat":
            txt = str(m.get("txt", "")).strip()[:200]
            if txt:
                await self.broadcast({"t": "chat", "from": p.name, "txt": txt})
        elif t == "cmd":
            await self.command(p, str(m.get("txt", "")))
        elif t == "rtp_res":
            pend = p.rtp_wait
            p.rtp_wait = None
            if pend and time.time() < pend[2] and abs(float(m.get("x", 1e9)) - pend[0]) < 1 and abs(float(m.get("z", 1e9)) - pend[1]) < 1:
                try:
                    x = float(m.get("x")); y = float(m.get("y")); z = float(m.get("z"))
                    dim = str(m.get("dim", "over"))[:16]
                    await p.ws.send_json({"t": "teleport", "x": x, "y": y, "z": z, "dim": dim})
                    await self.sys_to(p, "RTP: whoosh. (%d, %d)" % (int(x), int(z)))
                except (TypeError, ValueError):
                    await self.sys_to(p, "RTP failed, try again.")
            else:
                await self.sys_to(p, "RTP failed, try again.")
        elif t == "spawnset":
            if not self.store.world.get("spawn"):
                sp = [round(float(m.get("x", 0)), 1), round(float(m.get("y", 40)), 1),
                      round(float(m.get("z", 0)), 1)]
                self.store.world["spawn"] = sp
                self.store.dirty = True
                self.console("spawn set to %r" % sp)
        elif t == "ping":
            await p.ws.send_json({"t": "pong"})
        # unknown types are ignored

    # ---------------------------------------------------------- commands
    async def command(self, p, raw):
        raw = raw.strip()
        if not raw.startswith("/"):
            return
        parts = raw[1:].split()
        cmd = parts[0].lower() if parts else ""
        args = parts[1:]

        def need_admin():
            return p.admin

        if cmd in ("help", "?"):
            lines = [
                "Commands: /list /money /pay <player> <amount> /rtp /tpa <player>",
                "/tpaccept [player] /tpdeny /msg <player> <text> /spawn /backrooms",
                "/shop [buy <item> [count]]",
            ]
            if p.admin:
                lines.append("Admin: /kick <player> /ban <player> /op <player> "
                             "/deop <player> /say <text> /give <player> <amount>")
            await self.sys_to(p, " | ".join(lines))
        elif cmd in ("list", "players", "online"):
            await self.sys_to(p, "Online (%d): %s" % (len(self.players), ", ".join(self.online_names())))
        elif cmd == "money":
            acc = self.store.account(p.name)
            await self.sys_to(p, "Balance: %d DB" % int(acc.get("money", 0)))
        elif cmd == "pay":
            if len(args) < 2 or not args[1].lstrip("-").isdigit():
                await self.sys_to(p, "Usage: /pay <player> <amount>")
                return
            to = self.online(args[0])
            amt = int(args[1])
            if not to:
                await self.sys_to(p, "Nobody online named %r." % args[0])
                return
            if to is p:
                await self.sys_to(p, "Paying yourself is just pocketing.")
                return
            if amt <= 0:
                await self.sys_to(p, "Amount must be positive.")
                return
            me = self.store.account(p.name)
            if int(me.get("money", 0)) < amt:
                await self.sys_to(p, "Not enough DB. You have %d." % int(me.get("money", 0)))
                return
            me["money"] = int(me.get("money", 0)) - amt
            tgt = self.store.account(to.name)
            tgt["money"] = int(tgt.get("money", 0)) + amt
            self.store.save_accounts()
            await p.ws.send_json({"t": "balance", "amt": int(me["money"])})
            await to.ws.send_json({"t": "balance", "amt": int(tgt["money"])})
            await self.sys_to(p, "Paid %d DB to %s." % (amt, to.name))
            await self.sys_to(to, "%s paid you %d DB." % (p.name, amt))
        elif cmd == "rtp":
            ang = random.random() * 6.28318
            d = random.uniform(200, RTP_RADIUS)
            tx, tz = int(p.x + __import__("math").cos(ang) * d), int(p.z + __import__("math").sin(ang) * d)
            p.rtp_wait = (tx, tz, time.time() + 10)
            await p.ws.send_json({"t": "rtp_req", "tx": tx, "tz": tz})
        elif cmd == "tpa":
            to = self.online(args[0]) if args else None
            if not to:
                await self.sys_to(p, "Usage: /tpa <player>")
                return
            if to is p:
                await self.sys_to(p, "You are already yourself.")
                return
            self.tpa_out.setdefault(p.name, {})[to.name] = time.time() + TPA_TTL
            await self.sys_to(to, "%s wants to teleport to you. /tpaccept or /tpdeny" % p.name)
            await self.sys_to(p, "Request sent to %s." % to.name)
        elif cmd == "tpaccept":
            inc = p.tpa_from or {}
            # requests sent TO p live in tpa_out[other][p.name]
            who = None
            for other, exp in self.tpa_out.items():
                if p.name in exp and exp[p.name] > time.time():
                    if not who or other.lower() == " ".join(args).lower():
                        who = other
                        if args and other.lower() == args[0].lower():
                            break
            if not who:
                await self.sys_to(p, "No pending teleport requests.")
                return
            self.tpa_out[who].pop(p.name, None)
            src = self.online(who)
            if not src:
                await self.sys_to(p, "%r left already." % who)
                return
            await src.ws.send_json({"t": "teleport", "x": round(p.x, 2), "y": round(p.y, 2),
                                    "z": round(p.z, 2), "dim": p.dim})
            await self.sys_to(src, "%s accepted your teleport." % p.name)
            await self.sys_to(p, "%s teleported to you." % who)
        elif cmd == "tpdeny":
            who = None
            for other, exp in self.tpa_out.items():
                if p.name in exp and exp[p.name] > time.time():
                    who = other
                    break
            if who:
                self.tpa_out[who].pop(p.name, None)
                src = self.online(who)
                if src:
                    await self.sys_to(src, "%s denied your teleport." % p.name)
                await self.sys_to(p, "Denied.")
            else:
                await self.sys_to(p, "No pending teleport requests.")
        elif cmd in ("msg", "w", "tell", "whisper"):
            to = self.online(args[0]) if args else None
            txt = " ".join(args[1:]) if len(args) > 1 else ""
            if not to or not txt:
                await self.sys_to(p, "Usage: /msg <player> <text>")
                return
            await to.ws.send_json({"t": "whisper", "from": p.name, "txt": txt[:300]})
            await self.sys_to(p, "You whisper to %s: %s" % (to.name, txt[:300]))
        elif cmd == "spawn":
            sp = self.store.world.get("spawn")
            if sp:
                await p.ws.send_json({"t": "teleport", "x": sp[0], "y": sp[1], "z": sp[2],
                                      "dim": "over"})
            else:
                await self.sys_to(p, "Spawn is not set yet (the first joiner sets it).")
        elif cmd == "backrooms":
            if p.dim == "backrooms":
                sp = self.store.world.get("spawn") or [0.5, 40, 0.5]
                await p.ws.send_json({"t": "teleport", "x": sp[0], "y": sp[1], "z": sp[2],
                                      "dim": "over"})
                await self.sys_to(p, "You found an exit. Reality resumes.")
            else:
                await p.ws.send_json({"t": "teleport", "x": 2.5, "y": 9.05, "z": 2.5,
                                      "dim": "backrooms"})
                await self.sys_to(p, "You noclipped into the Backrooms. /backrooms to leave.")
        elif cmd == "shop":
            if not args or args[0].lower() == "list":
                await self.sys_to(p, "Shop: " + ", ".join("%s %dDB" % (i["n"], i["p"]) for i in SHOP))
                await self.sys_to(p, "Buy: /shop buy <item> [count]")
                return
            if args[0].lower() == "buy":
                if len(args) < 2:
                    await self.sys_to(p, "Usage: /shop buy <item> [count]")
                    return
                item = next((i for i in SHOP if i["n"] == args[1].lower()), None)
                if not item:
                    await self.sys_to(p, "No such item. /shop shows the list.")
                    return
                count = 1
                if len(args) > 2:
                    try:
                        count = max(1, min(64, int(args[2])))
                    except ValueError:
                        count = 1
                cost = item["p"] * count
                acc = self.store.account(p.name)
                if int(acc.get("money", 0)) < cost:
                    await self.sys_to(p, "Not enough DB: %d x %s costs %d, you have %d."
                                      % (count, item["n"], cost, int(acc.get("money", 0))))
                    return
                acc["money"] = int(acc.get("money", 0)) - cost
                self.store.save_accounts()
                await p.ws.send_json({"t": "balance", "amt": int(acc["money"])})
                await p.ws.send_json({"t": "give", "id": item["id"], "count": count,
                                      "name": item["n"]})
                await self.sys_to(p, "Bought %d x %s for %d DB." % (count, item["n"], cost))
                return
            await self.sys_to(p, "Usage: /shop [list|buy <item> [count]]")
        elif cmd == "kick":
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            to = self.online(args[0]) if args else None
            if not to:
                await self.sys_to(p, "Usage: /kick <player>")
                return
            await to.ws.send_json({"t": "kick", "reason": "Kicked by %s" % p.name})
            self.drop(to.name, "kicked by " + p.name)
            await self.sys_all("%s kicked %s" % (p.name, args[0]))
        elif cmd == "ban":
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            if not args:
                await self.sys_to(p, "Usage: /ban <player>")
                return
            nm = args[0]
            if nm.lower() not in [b.lower() for b in self.store.bans]:
                self.store.bans.append(nm)
                self.store.save_bans()
            to = self.online(nm)
            if to:
                await to.ws.send_json({"t": "kick", "reason": "Banned by %s" % p.name})
                self.drop(to.name, "banned by " + p.name)
            await self.sys_all("%s banned %s" % (p.name, nm))
        elif cmd == "op":
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            if not args:
                await self.sys_to(p, "Usage: /op <player> (online or not)")
                return
            acc = self.store.account(args[0])
            if not acc:
                await self.sys_to(p, "No account named %r (they must register first)." % args[0])
                return
            acc["admin"] = True
            self.store.save_accounts()
            tgt = self.online(args[0])
            if tgt:
                tgt.admin = True
                if tgt.name not in self.consoles:
                    self.consoles.append(tgt.name)
                await tgt.ws.send_json({"t": "admin", "on": 1})
            await self.sys_all("%s op'd %s" % (p.name, args[0]))
        elif cmd == "deop":
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            if not args:
                await self.sys_to(p, "Usage: /deop <player>")
                return
            acc = self.store.account(args[0])
            if not acc:
                await self.sys_to(p, "No account named %r." % args[0])
                return
            acc["admin"] = False
            self.store.save_accounts()
            tgt = self.online(args[0])
            if tgt:
                tgt.admin = False
                if tgt.name in self.consoles:
                    self.consoles.remove(tgt.name)
                await tgt.ws.send_json({"t": "admin", "on": 0})
            await self.sys_all("%s deop'd %s" % (p.name, args[0]))
        elif cmd == "say":
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            txt = " ".join(args)[:300]
            if txt:
                await self.broadcast({"t": "sys", "txt": "[Server] " + txt})
        elif cmd == "give":
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            if len(args) < 2 or not args[1].lstrip("-").isdigit():
                await self.sys_to(p, "Usage: /give <player> <amount>")
                return
            to = self.online(args[0])
            amt = max(0, min(1000000, int(args[1])))
            if not to:
                await self.sys_to(p, "Nobody online named %r." % args[0])
                return
            acc = self.store.account(to.name)
            acc["money"] = int(acc.get("money", 0)) + amt
            self.store.save_accounts()
            await to.ws.send_json({"t": "balance", "amt": int(acc["money"])})
            await self.sys_to(to, "%s gave you %d DB." % (p.name, amt))
            await self.sys_to(p, "Gave %s %d DB." % (to.name, amt))
        else:
            await self.sys_to(p, "Unknown command. Type /help")

    # ---------------------------------------------------------- console
    async def console_cmd(self, line):
        parts = line.split()
        if not parts:
            return
        cmd = parts[0].lower()
        args = parts[1:]
        if cmd == "help":
            print("console: op <name> | deop <name> | kick <name> | ban <name> | unban <name>")
            print("          passwd <name> <newpass> | money <name> <amount> | say <text>")
            print("          list | save | motd <text> | stop")
        elif cmd == "op" and args:
            acc = self.store.account(args[0])
            if acc:
                acc["admin"] = True
                self.store.save_accounts()
                tgt = self.online(args[0])
                if tgt:
                    tgt.admin = True
                    if tgt.name not in self.consoles:
                        self.consoles.append(tgt.name)
                    await tgt.ws.send_json({"t": "admin", "on": 1})
                print("op'd %s" % args[0])
            else:
                print("no account named %r" % args[0])
        elif cmd == "deop" and args:
            acc = self.store.account(args[0])
            if acc:
                acc["admin"] = False
                self.store.save_accounts()
                tgt = self.online(args[0])
                if tgt:
                    tgt.admin = False
                    if tgt.name in self.consoles:
                        self.consoles.remove(tgt.name)
                    await tgt.ws.send_json({"t": "admin", "on": 0})
                print("deop'd %s" % args[0])
        elif cmd in ("kick", "ban", "unban") and args:
            nm = args[0]
            if cmd == "kick":
                to = self.online(nm)
                if to:
                    await to.ws.send_json({"t": "kick", "reason": "Kicked from the console"})
                    self.drop(to.name, "kicked from console")
                    print("kicked %s" % nm)
                else:
                    print("%s is not online" % nm)
            elif cmd == "ban":
                if nm.lower() not in [b.lower() for b in self.store.bans]:
                    self.store.bans.append(nm)
                    self.store.save_bans()
                to = self.online(nm)
                if to:
                    await to.ws.send_json({"t": "kick", "reason": "Banned from the console"})
                    self.drop(to.name, "banned from console")
                print("banned %s" % nm)
            else:
                self.store.bans = [b for b in self.store.bans if b.lower() != nm.lower()]
                self.store.save_bans()
                print("unbanned %s" % nm)
        elif cmd == "passwd" and len(args) >= 2:
            acc = self.store.account(args[0])
            if acc:
                salt = secrets.token_hex(16)
                acc["salt"] = salt
                acc["hash"] = hash_password(args[1], salt)
                self.store.save_accounts()
                print("password reset for %s" % args[0])
            else:
                print("no account named %r" % args[0])
        elif cmd == "money" and len(args) >= 2 and args[1].lstrip("-").isdigit():
            acc = self.store.account(args[0])
            if acc:
                acc["money"] = max(0, int(args[1]))
                self.store.save_accounts()
                tgt = self.online(args[0])
                if tgt:
                    await tgt.ws.send_json({"t": "balance", "amt": int(acc["money"])})
                print("set %s to %s DB" % (args[0], args[1]))
            else:
                print("no account named %r" % args[0])
        elif cmd == "say":
            txt = line.split(None, 1)
            if len(txt) > 1:
                await self.broadcast({"t": "sys", "txt": "[Server] " + txt[1][:300]})
        elif cmd == "motd":
            txt = line.split(None, 1)
            if len(txt) > 1:
                self.store.world["motd"] = txt[1][:300]
                self.store.dirty = True
                print("motd set")
        elif cmd == "list":
            print("online (%d): %s" % (len(self.players), ", ".join(self.online_names()) or "-"))
            print("accounts (%d): %s" % (len(self.store.accounts), ", ".join(self.store.accounts) or "-"))
        elif cmd == "save":
            self.store.save_all()
            print("saved.")
        elif cmd == "stop":
            print("stopping...")
            for n in list(self.players):
                p = self.players[n]
                try:
                    await p.ws.send_json({"t": "kick", "reason": "Server is stopping"})
                except Exception:
                    pass
            import signal as _signal
            os.kill(os.getpid(), _signal.SIGINT)   # the main loop saves and exits
        else:
            print("unknown console command (try help)")

    # ---------------------------------------------------------- autosave
    async def autosave_loop(self):
        while True:
            await asyncio.sleep(SAVE_EVERY)
            try:
                if self.store.dirty:
                    self.store.save_world()
                self.store.save_accounts()
            except Exception as e:
                self.console("autosave error: %r" % e)


def console_thread(server, loop):
    """Read the terminal and run console commands on the main loop."""
    while True:
        try:
            line = input()
        except EOFError:
            return
        if not line.strip():
            continue
        loop.call_soon_threadsafe(
            lambda l=line: asyncio.ensure_future(server.console_cmd(l)))


async def main():
    ap = argparse.ArgumentParser(description="Tingle Craft multiplayer server")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--admin", default=None, help="account to flag as admin")
    ap.add_argument("--data", default="server_data", help="data folder")
    args = ap.parse_args()

    store = Store(args.data, args.admin)
    server = Server(args.host, args.port, store)

    loop = asyncio.get_event_loop()
    tcp = await asyncio.start_server(server.handle, args.host, args.port)
    t = threading.Thread(target=console_thread, args=(server, loop), daemon=True)
    t.start()
    asyncio.ensure_future(server.autosave_loop())

    # clean stop on Ctrl-C / SIGTERM: set the event, save, close (works even
    # though Python 3.11+'s asyncio.run turns SIGINT into a task cancellation)
    stop_ev = asyncio.Event()
    def _req_stop():
        print("SIGINT/SIGTERM received, saving...", flush=True)
        stop_ev.set()
    try:
        loop.add_signal_handler(signal.SIGINT, _req_stop)
        loop.add_signal_handler(signal.SIGTERM, _req_stop)
        have_sig = True
    except (NotImplementedError, AttributeError, RuntimeError):
        have_sig = False     # Windows: fall back to KeyboardInterrupt below

    print("TINGLE CRAFT server listening on %s:%d (data: %s)" %
          (args.host if args.host != "0.0.0.0" else _lan_ip(), args.port, args.data))
    print("Console commands: help")
    try:
        if have_sig:
            await stop_ev.wait()
            print("stopping: closing client connections...", flush=True)
            for n in list(server.players):
                pl = server.players[n]
                try:
                    await pl.ws.send_json({"t": "kick", "reason": "Server is stopping"})
                except Exception:
                    pass
                await pl.ws.close()
                server.drop(n, "server stopping")
        else:
            await tcp.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        tcp.close()
        try:
            await asyncio.wait_for(tcp.wait_closed(), 2)
        except (asyncio.TimeoutError, ConnectionError, OSError):
            pass
        store.save_all()
        print("saved and closed.", flush=True)


def _lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    # a server started in the background of a non-interactive shell inherits
    # SIGINT/SIGTERM ignored; take them back so stop signals work everywhere
    for _sig in (signal.SIGINT, signal.SIGTERM):
        if signal.getsignal(_sig) is signal.SIG_IGN:
            signal.signal(_sig, signal.SIG_DFL)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
