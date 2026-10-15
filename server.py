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
  * everything in sync: the server owns the clock (day/night), it relays
    the item every player is holding, and it brokers mobs (one client
    simulates each mob, the server relays it to everyone else)
  * chat, whispers, a player list, join/leave messages
  * commands: /help /list /money /pay /rtp /tpa /tpaccept /tpdeny /msg
    /spawn /backrooms /home /sethome /delhome /homes /shop /sell, and for
    admins: /kick /ban /op /deop /say /time /mobson /mobsoff
  * an economy: every account has a balance ("DB" in game). /shop opens a
    shop GUI (or /shop buy <item> [count]), /sell opens a sell GUI, /pay
    sends money to another player, /homes manages your homes
  * a server console: type commands like "op Steve", "ban Griefer", "say hi"

Behind a reverse proxy (nginx/caddy) it just works: the handshake accepts
any path, so mount it at any location and proxy wss:// to it. Plain HTTP
GETs get a friendly text answer (handy for health checks). See
docs/MULTIPLAYER.md for ready-made nginx and Caddy configs.

World data lives in the --data folder: accounts.json, world.json, bans.json.
Everything is JSON so you can inspect or back it up while the server runs.
"""

import argparse
import asyncio
import base64
import hashlib
import json
import math
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
PROTO_VERSION = 3
MOTD = "Welcome to Tingle Craft. Be nice, build things, mind the Backrooms."
FEATURED_ADDR = "play.arcside.us.kg"   # shown in every client's server list
START_MONEY = 100
RTP_RADIUS = 2000          # /rtp picks a random spot within this range
TPA_TTL = 60.0             # /tpa requests expire after this many seconds
SAVE_EVERY = 30.0          # periodic autosave, seconds
DAY_LEN = 600.0            # seconds per in-game day (matches the client)
MOB_CAP = 24               # server-relayed mobs at once
MOB_SPAWN_EVERY = 2.5      # seconds between mob spawn attempts
TIME_BROADCAST = 5.0       # seconds between clock syncs
HOME_LIMIT = 5             # homes per account (admins get 10)
PING_EVERY = 30.0          # server->client keepalive pings
STALE_AFTER = 95.0         # drop a client silent for this long
NAME_RE = re.compile(r"^[A-Za-z0-9_-]{2,16}$")

# The Backrooms: each level lives 6400 blocks further out on the x axis
# (400 chunks of 16). Level 0 is the classic yellow maze at x 0..6399.
BACK_STRIDE = 6400
BACK_MAX = 22              # 0..20 lore levels, 21 poolrooms, 22 the exit

# -- very simple anticheat -------------------------------------------------
# The client simulates its own world, so the server watches for the tells:
# impossible movement, edits out of reach, kills from across the map, and an
# inventory that grows without a server-witnessed source (the classic
# "give yourself diamonds" cheat). Admins are exempt from all of it.
AC_SPEED = 46.0            # horizontal blocks/second that cannot be honest
AC_REACH = 12.0            # max distance for a block edit
AC_HIT_RANGE = 10.0        # max distance for a mob hit
AC_PVP_RANGE = 160.0       # max distance for a gun shot claim
AC_SNAP_SLACK = 64         # inventory may exceed the ledger by this much
AC_KICK_STRIKES = 8        # movement/edit strikes before a kick
AC_INV_STRIKES = 3         # inventory strikes before a kick
AC_INV_BAN = 5             # inventory strikes before a ban

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
    {"n": "iron ingot", "id": 102, "p": 22},
    {"n": "coal",       "id": 101, "p": 6},
    {"n": "steam engine", "id": 248, "p": 120},
    {"n": "conveyor",   "id": 249, "p": 18},
    {"n": "M9",         "id": 366, "p": 150},
    {"n": "AK47",       "id": 367, "p": 260},
    {"n": "Remington",  "id": 368, "p": 180},
    {"n": "ship helm",  "id": 369, "p": 400},
    {"n": "bullet",     "id": 190, "p": 3},
    {"n": "shell",      "id": 191, "p": 6},
    # the Create pack (v7.3)
    {"n": "andesite",   "id": 376, "p": 3},
    {"n": "casing",     "id": 377, "p": 12},
    {"n": "cogwheel",   "id": 378, "p": 10},
    {"n": "shaft",      "id": 379, "p": 6},
    {"n": "water wheel","id": 380, "p": 60},
    {"n": "press",      "id": 381, "p": 220},
    {"n": "depot",      "id": 382, "p": 14},
    {"n": "millstone",  "id": 383, "p": 160},
    {"n": "mixer",      "id": 384, "p": 200},
    {"n": "basin",      "id": 385, "p": 20},
    {"n": "funnel",     "id": 386, "p": 40},
    {"n": "chute",      "id": 387, "p": 24},
    {"n": "vault",      "id": 388, "p": 150},
    {"n": "bearing",    "id": 390, "p": 120},
    {"n": "sail",       "id": 392, "p": 8},
    {"n": "grate",      "id": 393, "p": 5},
    {"n": "andesite alloy", "id": 370, "p": 18},
    {"n": "iron sheet", "id": 371, "p": 26},
    {"n": "bread",      "id": 374, "p": 6},
]

# What the /sell GUI pays for one unit (DB). Things the shop sells are
# worth less used than new; drops and farmables have their own prices.
SELL = {
    2: 1, 4: 1, 5: 1, 8: 1, 9: 2, 10: 2, 11: 2, 12: 2, 16: 2, 17: 6,
    18: 12, 19: 20, 20: 40, 26: 2, 37: 2, 23: 1, 27: 2, 28: 2,
    101: 3, 102: 10, 103: 18, 104: 45, 105: 2, 106: 3,
    107: 4, 108: 3, 109: 1, 110: 2, 111: 3, 113: 3, 114: 4, 115: 2,
}

# Loot the server grants a player who kills a relayed mob (type -> [(id,min,max)]).
MOB_LOOT = {
    "pig":    [(111, 1, 2)],          # porkchop
    "cow":    [(113, 1, 2)],          # beef
    "sheep":  [(26, 1, 1)],           # wool block
    "zombie": [(115, 0, 2)],          # flesh
    "skel":   [(109, 0, 2)],          # arrows
    "boomer": [(107, 1, 3)],          # gunpowder
    "spider": [(108, 0, 2)],          # string
    "alien":  [(102, 0, 1)],          # iron
}
MOB_REWARD = {"pig": 2, "cow": 2, "sheep": 2, "zombie": 4, "skel": 4,
              "boomer": 5, "spider": 4, "alien": 6}   # DB bounty to the killer

# What mining each block is worth to the economy ledger (only ids the shop
# trades in are tracked). Keyed by the block id that was broken; the value
# is {granted item id: count}.
ECON_IDS = set(SELL) | set(i["id"] for i in SHOP)
BREAK_CREDIT = {
    2: {2: 1},      # dirt -> dirt
    4: {4: 1},      # cobblestone
    5: {5: 1},      # oak planks
    8: {8: 1},      # sand
    9: {9: 1},      # gravel
    16: {16: 1},    # glass (the shop sells it, so the ledger tracks it)
    17: {101: 1},   # coal ore -> coal
    20: {104: 1},   # diamond ore -> diamond
    23: {23: 1},    # sandstone
    26: {26: 1},    # wool
    27: {27: 1},    # brick block
    37: {105: 4},   # clay -> 4 clay balls
    104: {104: 1},  # diamond block
    101: {101: 1},  # coal block
    102: {102: 1},  # iron block
    103: {103: 1},  # gold block
}
for _bid in (10, 11, 12, 19, 28):
    if _bid in ECON_IDS:
        BREAK_CREDIT[_bid] = {_bid: 1}   # logs, gold ore, stone bricks


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
                     "spawn": None, "time": 0.3, "motd": MOTD, "edits": {},
                     "mobs_on": True}
            print("[world] new world, seed %d" % world["seed"])
        self.world = world
        self.world.setdefault("edits", {})
        self.world.setdefault("mobs_on", True)
        self.world.setdefault("time", 0.3)
        self.dirty = False
        if admin_name:
            nm, _, pw = admin_name.partition(":")
            acc = self.account(nm)
            if acc is None:
                if pw:
                    self.create_account(nm, pw)
                else:
                    self.create_account(nm, secrets.token_urlsafe(12))
                    print("[admin] created account %r with a random password "
                          "(console: passwd %s <new> to set one)" % (nm, nm))
                acc = self.accounts[nm]
            acc["admin"] = True
            self.save_accounts()
            print("[admin] %r is an admin" % nm)

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
        # read the HTTP request headers (any path works: put this server behind
        # a reverse proxy at whatever location you like)
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
        path = ""
        for line in head[0].decode("latin1").split("\r\n"):
            low = line.lower()
            if low.startswith("sec-websocket-key:"):
                key = line.split(":", 1)[1].strip()
            elif low.startswith("x-forwarded-for:"):
                fwd = line.split(":", 1)[1].strip()
                print("[ws] handshake via proxy from %s" % fwd)
            elif line.startswith("GET "):
                path = line.split(" ")[1][:120]
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
        self.held = 0                 # block/item id in hand, relayed to others
        self.rtp_wait = None          # (candidates, expiry): /rtp waiting for the client's surface reply
        self.tpa_from = None          # {name: expiry} of incoming requests
        self.enter_pos = None         # where you were before you noclipped into the Backrooms
        self.last_pos = 0.0
        # anticheat bookkeeping
        self.ac_x = None              # last audited position
        self.ac_t = 0.0
        self.ac_grace = 0.0           # teleports buy a few seconds of trust
        self.ac_strikes = 0
        self.ac_bucket = {}           # per-message-type rate limiter
        self.ride_ship = None         # sid while driving a ship
        self.last_seen = time.time()  # any frame received; the reaper drops stale sockets

    def strike(self, n, why):
        self.ac_strikes += n
        now = time.time()
        if self.ac_strikes >= AC_KICK_STRIKES:
            print("[anticheat] %s kicked: %s" % (self.name, why))
            try:
                asyncio.ensure_future(self.ws.send_json(
                    {"t": "kick", "reason": "Anticheat: " + why}))
            except (RuntimeError, ConnectionError):
                pass
            global_drop(self.name, "anticheat: " + why)
        elif self.ac_strikes >= AC_KICK_STRIKES - 3 and now - self.ac_t > 2:
            self.ac_t = now
            try:
                asyncio.ensure_future(self.ws.send_json(
                    {"t": "sys", "txt": "[Server] That does not look possible. (%s)" % why}))
            except (RuntimeError, ConnectionError):
                pass

    def allow(self, kind, per_sec):
        """Token-bucket-ish rate limit: True if this message type is welcome."""
        now = time.time()
        win, cnt = self.ac_bucket.get(kind, (now, 0))
        if now - win >= 1.0:
            win, cnt = now, 0
        cnt += 1
        self.ac_bucket[kind] = (win, cnt)
        return cnt <= per_sec


def global_drop(name, why):
    """drop() needs the Server instance; anticheat lives on the Player, so the
    kick path routes through this late-bound hook set by Server.__init__."""
    srv = getattr(global_drop, "srv", None)
    if srv:
        srv.drop(name, why)


class Server:
    def __init__(self, host, port, store):
        self.host = host
        self.port = port
        self.store = store
        global_drop.srv = self
        self.players = {}             # name -> Player
        self.consoles = []            # admin players subscribed to console output
        self.tpa_out = {}             # name -> {target: expiry}
        self.mobs = {}                # mid -> {type,x,y,z,yaw,hp,dim,owner,last}
        self.mob_next = 1
        self.probes = set()           # outstanding mobprobe pids
        self.mob_tick = 0.0
        self.time_tick = 0.0
        self.ping_tick = 0.0
        self.ships = {}               # sid -> {d,x,y,z,yaw,rider,last}
        self.ships_dirty = False
        w = store.world
        w.setdefault("ships", {})
        w.setdefault("be", {})
        w.setdefault("pvp", True)
        w.setdefault("nukes", [])

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
        for n, p in list(self.players.items()):   # a drop may mutate mid-loop
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
            asyncio.ensure_future(self.reassign_mobs(name))
            asyncio.ensure_future(self.plist_all())

    # ------------------------------------------------------ player list --
    def plist_obj(self):
        return {"t": "plist",
                "ps": [[n, 1 if p.admin else 0] for n, p in self.players.items()],
                "motd": self.store.world.get("motd", MOTD),
                "mobs": 1 if self.store.world.get("mobs_on", True) else 0}

    async def plist_all(self):
        await self.broadcast(self.plist_obj())

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
                # not a websocket: if it looks like plain HTTP (a browser, a
                # reverse-proxy health check), answer with a friendly page;
                # otherwise just close.
                try:
                    writer.write(
                        b"HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\n"
                        b"Content-Length: 74\r\nConnection: close\r\n\r\n"
                        b"TINGLE CRAFT multiplayer server is running here.\r\n"
                        b"Connect from the game's Multiplayer menu.\r\n")
                    await writer.drain()
                except (ConnectionError, OSError):
                    pass
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
                player.last_seen = time.time()
                await self.dispatch(player, msg)
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        except Exception as e:  # never let one client kill the loop
            import traceback
            self.console("error handling %r: %r\n%s" % (name, e, traceback.format_exc()))
        finally:
            if name and name in self.players and self.players[name].ws is ws:
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
        # the account's saved player state (inventory, position, hp, xp...)
        # is handed back so rejoining never wipes progress again
        st = acc.get("st") if isinstance(acc.get("st"), dict) else None
        if st:
            player.x, player.y, player.z = st.get("x", player.x), st.get("y", player.y), st.get("z", player.z)
            player.dim = str(st.get("dim", "over"))[:16]
        # welcome: the seed, the whole edit list, spawn, balance, clock, shop
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
            "shop": SHOP,
            "sell": SELL,
            "homes": acc.get("homes", {}),
            "mobs": 1 if w.get("mobs_on", True) else 0,
            "st": st,
            "set": acc.get("set") if isinstance(acc.get("set"), dict) else None,
            "be": w.get("be", {}),
            "nukes": w.get("nukes", []),
            "ships": [[sid, s["d"], s["x"], s["y"], s["z"], s["yaw"]]
                      for sid, s in self.ships.items()],
            "mobs_list": [[mid, mo["type"], mo["x"], mo["y"], mo["z"], mo["yaw"],
                           mo["hp"], mo["dim"], mo["owner"]]
                          for mid, mo in self.mobs.items()],
        })
        if w.get("spawn") and not st:
            player.x, player.y, player.z = w["spawn"]
        print("[join] %s%s" % (name, " (admin)" if player.admin else ""))
        await self.broadcast({"t": "join", "name": name}, exclude=name)
        await self.sys_all(name + " joined the game")
        await self.plist_all()
        return name

    # ---------------------------------------------------------- dispatch
    async def dispatch(self, p, m):
        t = m.get("t")
        if t in ("login", "register"):
            await p.ws.send_json({"t": "denied", "reason": "Already logged in as %r." % p.name})
            return
        if t == "pos":
            try:
                nx = float(m.get("x", p.x)); ny = float(m.get("y", p.y)); nz = float(m.get("z", p.z))
            except (TypeError, ValueError):
                return
            if not (math.isfinite(nx) and math.isfinite(ny) and math.isfinite(nz)):
                p.strike(2, "NaN position")
                return
            p.x, p.y, p.z = nx, ny, nz
            p.yaw = float(m.get("yaw", p.yaw))
            p.pitch = float(m.get("pitch", p.pitch))
            p.dim = str(m.get("dim", p.dim))[:16]
            try:
                p.held = int(m.get("held", 0)) & 0xFFFF
            except (TypeError, ValueError):
                p.held = 0
            self.ac_move(p)
            now = time.time()
            if now - p.last_pos > 0.05:      # ~20 Hz cap
                p.last_pos = now
                await self.broadcast({
                    "t": "pos", "name": p.name, "x": round(p.x, 2), "y": round(p.y, 2),
                    "z": round(p.z, 2), "yaw": round(p.yaw, 3), "pitch": round(p.pitch, 3),
                    "dim": p.dim, "hp": int(m.get("hp", 20)), "held": p.held,
                }, exclude=p.name)
        elif t == "set":
            await self.block_edit(p, str(m.get("ck", ""))[:32], str(m.get("lk", ""))[:24],
                                  m.get("id", 0), m.get("old"))
        elif t == "sets":
            lst = m.get("list")
            if not isinstance(lst, list) or not p.allow("sets", 4):
                return
            for it in lst[:4000]:
                if not isinstance(it, (list, tuple)) or len(it) < 3:
                    continue
                await self.block_edit(p, str(it[0])[:32], str(it[1])[:24],
                                      it[2], it[3] if len(it) > 3 else None)
        elif t == "state":
            await self.save_state(p, m)
        elif t == "settings":
            d = m.get("d")
            if isinstance(d, dict):
                acc = self.store.account(p.name)
                acc["set"] = {str(k)[:24]: (1 if v else 0) if isinstance(v, bool) else v
                              for k, v in list(d.items())[:40]}
                self.store.save_accounts()
        elif t == "be":
            # a chest/furnace/engine's contents changed on this client: store + relay
            if not p.allow("be", 8):
                return
            k = str(m.get("k", ""))[:64]
            d = m.get("d")
            if k and isinstance(d, dict) and len(json.dumps(d)) < 60000:
                self.store.world["be"][k] = d
                self.store.dirty = True
                await self.broadcast({"t": "be", "k": k, "d": d}, exclude=p.name)
        elif t == "dropadd":
            await self.drop_add(p, m)
        elif t == "dropdel":
            did = str(m.get("did", ""))[:48]
            if did and p.allow("dropdel", 20):
                await self.broadcast({"t": "dropdel", "did": did}, exclude=p.name)
        elif t == "nukex":
            await self.nuke_x(p, m)
        elif t == "shipadd":
            await self.ship_add(p, m)
        elif t == "shippos":
            await self.ship_pos(p, m)
        elif t == "shipride":
            await self.ship_ride(p, m)
        elif t == "shipdel":
            await self.ship_del(p, m)
        elif t == "pvp":
            await self.pvp_hit(p, m)
        elif t == "idied":
            by = str(m.get("by", ""))[:40]
            how = str(m.get("how", ""))[:24]
            await self.sys_all("%s died%s" % (p.name, (" (" + by + ")") if by else ""))
        elif t == "chat":
            txt = str(m.get("txt", "")).strip()[:200]
            if txt and p.allow("chat", 6):
                await self.broadcast({"t": "chat", "from": p.name, "txt": txt})
        elif t == "cmd":
            if p.allow("cmd", 12):
                await self.command(p, str(m.get("txt", "")))
        elif t == "rtp_res":
            self.rtp_resolved(p, m)
        elif t == "spawnset":
            if not self.store.world.get("spawn"):
                sp = [round(float(m.get("x", 0)), 1), round(float(m.get("y", 40)), 1),
                      round(float(m.get("z", 0)), 1)]
                self.store.world["spawn"] = sp
                self.store.dirty = True
                self.console("spawn set to %r" % sp)
        elif t == "buy":
            if p.allow("buy", 5):
                await self.shop_buy(p, str(m.get("item", "")), m.get("count", 1))
        elif t == "sell":
            if p.allow("sell", 5):
                await self.sell(p, m.get("id", 0), m.get("count", 0))
        elif t == "sethome":
            await self.sethome(p, str(m.get("name", "")))
        elif t == "home":
            await self.go_home(p, str(m.get("name", "")))
        elif t == "delhome":
            await self.delhome(p, str(m.get("name", "")))
        elif t == "homes":
            await self.send_homes(p)
        elif t == "mach":
            # machine (steam engine) state relay: keep everyone's burn timers honest
            m2 = {"t": "mach", "k": str(m.get("k", ""))[:40],
                  "on": 1 if m.get("on") else 0,
                  "burn": max(0.0, min(600.0, float(m.get("burn", 0) or 0))),
                  "burnMax": max(0.0, min(600.0, float(m.get("burnMax", 0) or 0)))}
            await self.broadcast(m2, exclude=p.name)
        elif t == "adm":
            await self.admin_action(p, m)
        elif t == "mobres":
            await self.mob_resolved(p, m)
        elif t == "mobpos":
            self.mob_relay(p, m)
        elif t == "mobhit":
            await self.mob_hit(p, m)
        elif t == "mobhitp":
            await self.mob_hit_player(p, m)
        elif t == "mobdead":
            await self.mob_dead(p, m)
        elif t == "ping":
            await p.ws.send_json({"t": "pong"})
        # unknown types are ignored

    # -------------------------------------------------------- anticheat --
    def ac_move(self, p):
        """Position plausibility: nothing honest crosses 46 blocks a second."""
        if p.admin:
            return
        now = time.time()
        if now < p.ac_grace:
            p.ac_x = (p.x, p.z)
            return
        if p.ac_x is not None:
            dt = now - p.ac_t
            if dt > 0.05:
                d = math.hypot(p.x - p.ac_x[0], p.z - p.ac_x[1])
                if d / dt > AC_SPEED:
                    p.strike(1, "moved %d blocks in %.1fs" % (int(d), dt))
        p.ac_x = (p.x, p.z)
        p.ac_t = now

    async def block_edit(self, p, ck, lk, bid, old):
        try:
            bid = int(bid) & 0xFFFF   # chunks are Uint16Array since v7.3 (Create blocks 300+)
        except (TypeError, ValueError):
            return
        if not ck or "," not in ck or "," not in lk:
            return
        if not p.allow("set", 45):
            return
        try:
            parts = lk.split(",")
            bx, by, bz = float(parts[0]), float(parts[1]), float(parts[2])
        except (TypeError, ValueError):
            return
        if not p.admin:
            d = math.hypot(bx + 0.5 - p.x, by + 0.5 - p.y, bz + 0.5 - p.z)
            if d > AC_REACH:
                p.strike(1, "edited a block %d blocks away" % int(d))
                return
        old_id = None
        try:
            old_id = int(old) & 0xFFFF if old is not None else None
        except (TypeError, ValueError):
            old_id = None
        self.store.world["edits"].setdefault(ck, {})[lk] = bid
        self.store.dirty = True
        await self.broadcast({"t": "set", "ck": ck, "lk": lk, "id": bid},
                             exclude=p.name)
        # economy ledger: a witnessed block break credits the drop table
        if old_id and old_id != bid and not p.admin:
            for gid, n in BREAK_CREDIT.get(old_id, {}).items():
                acc = self.store.account(p.name)
                led = acc.setdefault("led", {})
                led[str(gid)] = min(100000, int(led.get(str(gid), 0)) + n)

    async def save_state(self, p, m):
        """The client's periodic player-state snapshot: position, inventory,
        hp, hunger, xp, armor. Stored per account and handed back on rejoin."""
        if not p.allow("state", 2):
            return
        try:
            inv = m.get("inv")
            if not isinstance(inv, list):
                return
            inv = inv[:36]
            st = {
                "x": round(max(-30000000, min(30000000, float(m.get("x", 0)))), 2),
                "y": round(max(-40, min(400, float(m.get("y", 40)))), 2),
                "z": round(max(-30000000, min(30000000, float(m.get("z", 0)))), 2),
                "yaw": round(float(m.get("yaw", 0)), 3),
                "pitch": round(float(m.get("pitch", 0)), 3),
                "dim": str(m.get("dim", "over"))[:16],
                "hp": max(0, min(20, int(m.get("hp", 20)))),
                "hun": max(0, min(20, int(m.get("hun", 20)))),
                "sel": max(0, min(8, int(m.get("sel", 0)))),
                "xp": max(0, min(100000, int(m.get("xp", 0)))),
                "inv": [([int(s[0]) & 0xFFFF, int(s[1]) & 0xFFF,
                          int(s[2]) & 0xFFFF if len(s) > 2 and s[2] is not None else None]
                         if isinstance(s, (list, tuple)) and len(s) >= 2 else None)
                        for s in inv],
                "armor": [[int(a[0]) & 0xFFFF,
                           int(a[1]) & 0xFFFF if len(a) > 1 and a[1] is not None else None]
                          for a in (m.get("armor") or [])[:4]
                          if isinstance(a, (list, tuple)) and len(a) >= 1],
                "spawn": m.get("spawn") if isinstance(m.get("spawn"), list) else None,
            }
        except (TypeError, ValueError):
            return
        acc = self.store.account(p.name)
        acc["st"] = st
        # anticheat: reconcile the inventory ledger against the snapshot
        if not p.admin:
            await self.ac_inv_audit(p, st["inv"])
        # entering the Backrooms the normal way is remembered for the way out
        if st["dim"] != "backrooms" and p.dim != "backrooms":
            p.enter_pos = [st["x"], st["y"], st["z"]]

    async def ac_inv_audit(self, p, inv):
        acc = self.store.account(p.name)
        led = acc.setdefault("led", {})
        snap = {}
        for s in inv:
            if not isinstance(s, (list, tuple)) or len(s) < 2:
                continue                      # empty slot
            iid = str(s[0])
            if int(iid) in ECON_IDS:
                snap[iid] = snap.get(iid, 0) + int(s[1])
        if not acc.get("led_init"):
            # first snapshot this account has ever reported: baseline it
            acc["led_init"] = True
            for k, v in snap.items():
                led[k] = max(int(led.get(k, 0)), v)
            return
        strikes = 0
        for k, v in snap.items():
            if v - int(led.get(k, 0)) > AC_SNAP_SLACK:
                print("[anticheat] %s: %s x%d unaccounted (ledger %d)"
                      % (p.name, k, v, int(led.get(k, 0))))
                led[k] = v          # resync so one burst cannot repeat
                strikes += 1
        if strikes:
            inv_strikes = int(acc.get("inv_strikes", 0)) + strikes
            acc["inv_strikes"] = inv_strikes
            if inv_strikes >= AC_INV_BAN:
                if p.name.lower() not in [b.lower() for b in self.store.bans]:
                    self.store.bans.append(p.name)
                    self.store.save_bans()
                await p.ws.send_json({"t": "kick", "reason": "Anticheat: duped items"})
                global_drop(p.name, "anticheat: duped items")
            elif inv_strikes >= AC_INV_STRIKES:
                await p.ws.send_json({"t": "kick",
                                      "reason": "Anticheat: items you did not earn (%s)" %
                                                ", ".join(sorted(snap)[:3])})
                global_drop(p.name, "anticheat: unearned items")

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
                "/tpaccept [player] /tpdeny /msg <player> <text> /spawn /backrooms [0-22]",
                "/shop (GUI) /sell (GUI) /home [name] /sethome <name> /delhome <name> /homes",
            ]
            if p.admin:
                lines.append("Admin: /kick /ban /op /deop /say /give <player> <amount> "
                             "/time <0-1|day|night> /mobson /mobsoff /pvp /backrooms <level>")
                lines.append("WorldEdit is // commands (//help, //wand, //set ...) - run them "
                             "from chat right here; the loader is in the pause menu.")
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
            # a handful of candidate spots; the client checks each against the
            # real terrain (seeded, so it can judge without loading chunks) and
            # answers with the first one that is honest dry land
            cands = []
            for _ in range(10):
                ang = random.random() * 6.28318
                d = random.uniform(200, RTP_RADIUS)
                cands.append([int(p.x + math.cos(ang) * d), int(p.z + math.sin(ang) * d)])
            p.rtp_wait = (cands, time.time() + 15)
            p.ac_grace = time.time() + 5
            await p.ws.send_json({"t": "rtp_req", "cs": cands})
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
            lvl = None
            if args:
                named = {"pool": 21, "poolrooms": 21, "exit": 22, "lobby": 0}
                if args[0].lower() in named:
                    lvl = named[args[0].lower()]
                elif args[0].lstrip("-").isdigit():
                    lvl = int(args[0])
                if lvl is not None:
                    if not p.admin:
                        await self.sys_to(p, "Only admins can jump to a specific level. Plain /backrooms works for anyone.")
                        return
                    if not (0 <= lvl <= BACK_MAX):
                        await self.sys_to(p, "Levels are 0-%d (21 poolrooms, 22 the exit)." % BACK_MAX)
                        return
            if p.dim == "backrooms" and lvl is None:
                # leaving: back to where you noclipped in (or world spawn)
                sp = p.enter_pos or self.store.world.get("spawn") or [0.5, 40, 0.5]
                if p.enter_pos and len(p.enter_pos) > 3:
                    back_dim = p.enter_pos[3]
                else:
                    back_dim = "over"
                await p.ws.send_json({"t": "teleport", "x": sp[0], "y": sp[1], "z": sp[2],
                                      "dim": back_dim})
                p.enter_pos = None
                await self.sys_to(p, "You found an exit. Reality resumes.")
            else:
                if lvl is None:
                    lvl = 0
                    p.enter_pos = [round(p.x, 1), round(p.y, 1), round(p.z, 1), p.dim]
                tx = lvl * BACK_STRIDE + 2.5
                await p.ws.send_json({"t": "teleport", "x": tx, "y": 9.05, "z": 2.5,
                                      "dim": "backrooms"})
                p.ac_grace = time.time() + 5
                nm = ("Level %d" % lvl) if lvl <= 20 else ("the Poolrooms" if lvl == 21 else "The Exit")
                await self.sys_to(p, "You noclipped into the Backrooms: %s. /backrooms to leave." % nm)
        elif cmd == "pvp":
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            self.store.world["pvp"] = not self.store.world.get("pvp", True)
            self.store.dirty = True
            await self.sys_all("PvP is now %s." % ("ON" if self.store.world["pvp"] else "OFF"))
        elif cmd == "shop":
            if not args or args[0].lower() == "list":
                await self.sys_to(p, "Shop: " + ", ".join("%s %dDB" % (i["n"], i["p"]) for i in SHOP))
                await self.sys_to(p, "Buy: /shop buy <item> [count]  (or just /shop for the shop GUI)")
                return
            if args[0].lower() == "buy":
                if len(args) < 2:
                    await self.sys_to(p, "Usage: /shop buy <item> [count]")
                    return
                count = 1
                if len(args) > 2:
                    try:
                        count = max(1, min(64, int(args[2])))
                    except ValueError:
                        count = 1
                await self.shop_buy(p, args[1], count)
                return
            await self.sys_to(p, "Usage: /shop [list|buy <item> [count]]")
        elif cmd == "sell":
            # /sell opens the sell GUI on the client; /sell <id> <count> sells directly
            if len(args) >= 2:
                try:
                    await self.sell(p, int(args[0]), int(args[1]))
                except (TypeError, ValueError):
                    await self.sys_to(p, "Usage: /sell (GUI) or /sell <itemId> <count>")
            else:
                await p.ws.send_json({"t": "opensell"})
        elif cmd == "sethome":
            await self.sethome(p, " ".join(args))
        elif cmd in ("home", "h"):
            await self.go_home(p, " ".join(args) or "home")
        elif cmd == "delhome":
            await self.delhome(p, " ".join(args))
        elif cmd == "homes":
            await self.send_homes(p)
        elif cmd == "time":
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            v = self.parse_time(args[0] if args else "")
            if v is None:
                await self.sys_to(p, "Usage: /time <0..1 | day | noon | night | midnight>")
                return
            self.store.world["time"] = v
            self.store.dirty = True
            await self.broadcast({"t": "time", "v": v})
            await self.sys_all("Time set by %s." % p.name)
        elif cmd in ("mobson", "mobsoff"):
            if not need_admin():
                await self.sys_to(p, "Admins only.")
                return
            on = cmd == "mobson"
            self.store.world["mobs_on"] = on
            self.store.dirty = True
            if not on and self.mobs:
                for mid in list(self.mobs):
                    await self.mob_del(mid, "mob spawns are off")
            await self.sys_all("Mob spawning is now %s." % ("on" if on else "off"))
            await self.plist_all()
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
            print("          time <0-1|day|night> | mobson | mobsoff | list | save | motd <text> | stop")
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
        elif cmd == "time":
            v = self.parse_time(args[0] if args else "")
            if v is None:
                print("usage: time <0..1 | day | noon | night | midnight>")
            else:
                self.store.world["time"] = v
                self.store.dirty = True
                await self.broadcast({"t": "time", "v": v})
                print("time set to %s" % v)
        elif cmd in ("mobson", "mobsoff"):
            on = cmd == "mobson"
            self.store.world["mobs_on"] = on
            self.store.dirty = True
            if not on and self.mobs:
                for mid in list(self.mobs):
                    await self.mob_del(mid, "mob spawns are off")
            print("mob spawning is %s" % ("on" if on else "off"))
            await self.plist_all()
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
        last = time.time()
        while True:
            await asyncio.sleep(1.0)
            now = time.time()
            dt = now - last
            last = now
            try:
                # the server owns the clock: advance it, and sync clients
                if self.players:
                    self.store.world["time"] = (float(self.store.world.get("time", 0.3))
                                                + dt / DAY_LEN) % 1.0
                    self.time_tick += dt
                    if self.time_tick >= TIME_BROADCAST:
                        self.time_tick = 0.0
                        await self.broadcast({"t": "time",
                                              "v": float(self.store.world["time"])})
                # keepalive: ping silent clients; drop the ones that never answer
                self.ping_tick += dt
                if self.ping_tick >= PING_EVERY:
                    self.ping_tick = 0.0
                    for n, pl in list(self.players.items()):
                        await pl.ws.send_frame(0x9, b"tc")
                # the mob broker: spawn, reassign, despawn
                self.mob_tick += dt
                if self.mob_tick >= MOB_SPAWN_EVERY:
                    self.mob_tick = 0.0
                    await self.mob_spawn_tick()
                await self.mob_prune()
                if self.store.dirty or self.ships_dirty:
                    self.ships_dirty = False
                    self.store.save_world()
                self.store.save_accounts()
            except Exception as e:
                self.console("autosave error: %r" % e)

    # ------------------------------------------------------------ economy
    def parse_time(self, s):
        s = (s or "").lower()
        named = {"day": 0.05, "morning": 0.05, "noon": 0.25, "sunset": 0.47,
                 "night": 0.55, "midnight": 0.75, "sunrise": 0.97}
        if s in named:
            return named[s]
        try:
            v = float(s)
        except (TypeError, ValueError):
            return None
        if 0 <= v <= 1:
            return v
        return None

    async def shop_buy(self, p, item_name, count):
        item = next((i for i in SHOP if i["n"].lower() == item_name.lower()
                     or str(i["id"]) == item_name), None)
        if not item:
            await self.sys_to(p, "No such item. The shop GUI lists everything.")
            return
        try:
            count = max(1, min(64, int(count)))
        except (TypeError, ValueError):
            count = 1
        cost = item["p"] * count
        acc = self.store.account(p.name)
        if int(acc.get("money", 0)) < cost:
            await self.sys_to(p, "Not enough DB: %d x %s costs %d, you have %d."
                              % (count, item["n"], cost, int(acc.get("money", 0))))
            return
        acc["money"] = int(acc.get("money", 0)) - cost
        led = acc.setdefault("led", {})
        led[str(item["id"])] = min(100000, int(led.get(str(item["id"]), 0)) + count)
        self.store.save_accounts()
        await p.ws.send_json({"t": "balance", "amt": int(acc["money"])})
        await p.ws.send_json({"t": "give", "id": item["id"], "count": count,
                              "name": item["n"]})
        await self.sys_to(p, "Bought %d x %s for %d DB." % (count, item["n"], cost))

    async def sell(self, p, item_id, count):
        try:
            item_id = int(item_id)
            count = max(1, min(2304, int(count)))
        except (TypeError, ValueError):
            await self.sys_to(p, "Bad sell request.")
            return
        price = SELL.get(item_id)
        if not price:
            await self.sys_to(p, "The shop does not buy that item.")
            return
        # the server pays only for items it can account for: mining, loot and
        # purchases are all credited to a per-account ledger; anything more is
        # the give-yourself-stuff cheat talking
        acc = self.store.account(p.name)
        led = acc.setdefault("led", {})
        held = int(led.get(str(item_id), 0))
        if held < count:
            await self.sys_to(p, "The ledger only counts %d of those (mine or buy a "
                                 "little first — this stops duped items)." % held)
            return
        led[str(item_id)] = held - count
        earn = price * count
        acc["money"] = int(acc.get("money", 0)) + earn
        self.store.save_accounts()
        await p.ws.send_json({"t": "balance", "amt": int(acc["money"])})
        await p.ws.send_json({"t": "sold", "id": item_id, "count": count,
                              "earn": earn})
        await self.sys_to(p, "Sold %d x %s for %d DB." % (count, item_id, earn))

    # -------------------------------------------------------------- homes
    def home_limit(self, p):
        return 10 if p.admin else HOME_LIMIT

    async def send_homes(self, p):
        acc = self.store.account(p.name)
        await p.ws.send_json({"t": "homes", "homes": acc.get("homes", {})})

    async def sethome(self, p, name):
        name = (name or "").strip()[:24] or "home"
        if not re.match(r"^[A-Za-z0-9_\- ]{1,24}$", name):
            await self.sys_to(p, "Home name: letters, digits, spaces, _ or -.")
            return
        acc = self.store.account(p.name)
        homes = acc.setdefault("homes", {})
        if name not in homes and len(homes) >= self.home_limit(p):
            await self.sys_to(p, "You already have %d homes. Delete one first."
                              % self.home_limit(p))
            return
        homes[name] = [round(p.x, 1), round(p.y, 1), round(p.z, 1), p.dim]
        self.store.save_accounts()
        await self.sys_to(p, "Home '%s' set here. (%s)" % (name, homes[name][:3]))
        await p.ws.send_json({"t": "homes", "homes": homes})

    async def go_home(self, p, name):
        acc = self.store.account(p.name)
        h = acc.get("homes", {}).get(name)
        if not h:
            await self.sys_to(p, "No home named %r. /homes lists yours." % name)
            return
        await p.ws.send_json({"t": "teleport", "x": h[0], "y": h[1], "z": h[2],
                              "dim": h[3] if len(h) > 3 else "over"})
        await self.sys_to(p, "Home sweet home: %s." % name)

    async def delhome(self, p, name):
        acc = self.store.account(p.name)
        homes = acc.get("homes", {})
        if name in homes:
            del homes[name]
            self.store.save_accounts()
            await self.sys_to(p, "Home '%s' deleted." % name)
            await p.ws.send_json({"t": "homes", "homes": homes})
        else:
            await self.sys_to(p, "No home named %r." % name)

    # -------------------------------------------------------------- admin
    async def admin_action(self, p, m):
        if not p.admin:
            await self.sys_to(p, "Admins only.")
            return
        act = str(m.get("act", ""))
        name = str(m.get("name", ""))[:16]
        tgt = self.online(name)
        acc = self.store.account(name) if name else None
        if act == "money":
            try:
                amt = max(0, min(1000000, int(m.get("amt", 0))))
            except (TypeError, ValueError):
                return
            if not acc:
                await self.sys_to(p, "No account named %r." % name)
                return
            acc["money"] = amt
            self.store.save_accounts()
            if tgt:
                await tgt.ws.send_json({"t": "balance", "amt": amt})
            await self.sys_to(p, "Set %s to %d DB." % (name, amt))
            if tgt:
                await self.sys_to(tgt, "%s set your balance to %d DB." % (p.name, amt))
        elif act == "give":
            try:
                amt = max(0, min(1000000, int(m.get("amt", 0))))
            except (TypeError, ValueError):
                return
            if not acc:
                await self.sys_to(p, "No account named %r." % name)
                return
            acc["money"] = int(acc.get("money", 0)) + amt
            self.store.save_accounts()
            if tgt:
                await tgt.ws.send_json({"t": "balance", "amt": int(acc["money"])})
                await self.sys_to(tgt, "%s gave you %d DB." % (p.name, amt))
            await self.sys_to(p, "Gave %s %d DB." % (name, amt))
        elif act == "kick":
            if tgt:
                await tgt.ws.send_json({"t": "kick", "reason": "Kicked by %s" % p.name})
                self.drop(tgt.name, "kicked by " + p.name)
                await self.sys_all("%s kicked %s" % (p.name, name))
        elif act == "ban":
            if not name:
                return
            if name.lower() not in [b.lower() for b in self.store.bans]:
                self.store.bans.append(name)
                self.store.save_bans()
            if tgt:
                await tgt.ws.send_json({"t": "kick", "reason": "Banned by %s" % p.name})
                self.drop(tgt.name, "banned by " + p.name)
            await self.sys_all("%s banned %s" % (p.name, name))
        elif act == "unban":
            self.store.bans = [b for b in self.store.bans if b.lower() != name.lower()]
            self.store.save_bans()
            await self.sys_to(p, "Unbanned %s (if they were banned)." % name)
        elif act == "op":
            if not acc:
                await self.sys_to(p, "No account named %r." % name)
                return
            acc["admin"] = True
            self.store.save_accounts()
            if tgt:
                tgt.admin = True
                if tgt.name not in self.consoles:
                    self.consoles.append(tgt.name)
                await tgt.ws.send_json({"t": "admin", "on": 1})
            await self.sys_all("%s op'd %s" % (p.name, name))
            await self.plist_all()
        elif act == "deop":
            if not acc:
                await self.sys_to(p, "No account named %r." % name)
                return
            acc["admin"] = False
            self.store.save_accounts()
            if tgt:
                tgt.admin = False
                if tgt.name in self.consoles:
                    self.consoles.remove(tgt.name)
                await tgt.ws.send_json({"t": "admin", "on": 0})
            await self.sys_all("%s deop'd %s" % (p.name, name))
            await self.plist_all()
        elif act == "tome":
            if tgt:
                await tgt.ws.send_json({"t": "teleport", "x": round(p.x, 2), "y": round(p.y, 2),
                                        "z": round(p.z, 2), "dim": p.dim})
                await self.sys_to(tgt, "%s brought you over." % p.name)
                await self.sys_to(p, "Brought %s to you." % tgt.name)
        elif act == "tothem":
            if tgt:
                await p.ws.send_json({"t": "teleport", "x": round(tgt.x, 2), "y": round(tgt.y, 2),
                                      "z": round(tgt.z, 2), "dim": tgt.dim})
                await self.sys_to(p, "Teleported to %s." % tgt.name)
        elif act == "time":
            v = self.parse_time(str(m.get("val", "")))
            if v is not None:
                self.store.world["time"] = v
                self.store.dirty = True
                await self.broadcast({"t": "time", "v": v})
                await self.sys_all("Time set by %s." % p.name)
        elif act == "spawn":
            sp = [round(p.x, 1), round(p.y, 1), round(p.z, 1)]
            self.store.world["spawn"] = sp
            self.store.dirty = True
            await self.sys_all("Server spawn set to (%d, %d, %d) by %s."
                               % (sp[0], sp[1], sp[2], p.name))
        elif act == "motd":
            txt = str(m.get("txt", ""))[:300]
            if txt:
                self.store.world["motd"] = txt
                self.store.dirty = True
                await self.sys_all("MOTD is now: " + txt)
        elif act == "mobs":
            on = 1 if m.get("on") else 0
            self.store.world["mobs_on"] = bool(on)
            self.store.dirty = True
            if not on and self.mobs:
                for mid in list(self.mobs):
                    await self.mob_del(mid, "mob spawns are off")
            await self.sys_all("Mob spawning is now %s." % ("on" if on else "off"))
            await self.plist_all()
        elif act == "save":
            self.store.save_all()
            await self.sys_to(p, "Saved everything.")

    # ---------------------------------------------------------- mob broker
    async def mob_spawn_tick(self):
        """Ask one player to resolve a spawn spot for a new relayed mob."""
        if not self.store.world.get("mobs_on", True):
            return
        if len(self.mobs) >= MOB_CAP or not self.players:
            return
        owner = random.choice(list(self.players.values()))
        ang = random.random() * 6.28318
        dist = random.uniform(18, 44)
        tx = int(owner.x + math.cos(ang) * dist)
        tz = int(owner.z + math.sin(ang) * dist)
        pid = "p%d" % self.mob_next
        self.probes.add(pid)
        await owner.ws.send_json({"t": "mobprobe", "pid": pid, "x": tx, "z": tz})
        self.mob_next += 1

    async def mob_resolved(self, p, m):
        pid = str(m.get("pid", ""))
        if pid not in self.probes:            # only real probes hatch mobs
            return
        self.probes.discard(pid)
        if not m.get("ok"):
            return
        mt = str(m.get("type", ""))
        if mt not in MOB_LOOT:
            return
        if len(self.mobs) >= MOB_CAP:
            return
        try:
            x = round(float(m.get("x")), 2); y = round(float(m.get("y")), 2)
            z = round(float(m.get("z")), 2)
        except (TypeError, ValueError):
            return
        dim = str(m.get("dim", "over"))[:16]
        if dim != "over":
            return
        mid = "m%d" % self.mob_next
        self.mob_next += 1
        self.mobs[mid] = {"type": mt, "x": x, "y": y, "z": z, "yaw": 0.0,
                          "hp": 20, "dim": dim, "owner": p.name,
                          "last": time.time()}
        await self.broadcast({"t": "mobadd", "mid": mid, "type": mt, "x": x, "y": y,
                              "z": z, "dim": dim, "own": p.name})

    def mob_relay(self, p, m):
        mid = str(m.get("mid", ""))[:12]
        mob = self.mobs.get(mid)
        if not mob or mob["owner"] != p.name:
            return
        try:
            mob["x"] = round(float(m.get("x")), 2)
            mob["y"] = round(float(m.get("y")), 2)
            mob["z"] = round(float(m.get("z")), 2)
            mob["yaw"] = round(float(m.get("yaw", 0)), 3)
            mob["hp"] = max(0, min(1024, int(m.get("hp", 20))))
        except (TypeError, ValueError):
            return
        mob["last"] = time.time()
        if mob["hp"] <= 0:
            # the simulating client killed it (fall, lava, its own AI): settle
            # the kill through the server so loot and the corpse stay in sync
            asyncio.ensure_future(self.mob_kill(mid, p))
            return
        m2 = {"t": "mobpos", "mid": mid, "x": mob["x"], "y": mob["y"], "z": mob["z"],
              "yaw": mob["yaw"], "hp": mob["hp"]}
        asyncio.ensure_future(self.broadcast(m2, exclude=p.name))

    async def mob_hit(self, p, m):
        """A non-owner client reports damaging a relayed mob."""
        mid = str(m.get("mid", ""))[:12]
        mob = self.mobs.get(mid)
        if not mob:
            return
        if not p.allow("mobhit", 12):
            return
        if not p.admin:
            d = math.hypot(mob["x"] - p.x, mob["z"] - p.z)
            if d > AC_HIT_RANGE:
                p.strike(1, "hit a mob %d blocks away" % int(d))
                return
        try:
            dmg = max(0, min(30, int(m.get("dmg", 1))))
        except (TypeError, ValueError):
            return
        mob["hp"] -= dmg
        mob["last"] = time.time()
        if mob["hp"] <= 0:
            await self.mob_kill(mid, p)
        else:
            await self.broadcast({"t": "mobhp", "mid": mid, "hp": mob["hp"]})

    async def mob_hit_player(self, p, m):
        """The simulating client says a mob reached and hit another player."""
        mid = str(m.get("mid", ""))[:12]
        mob = self.mobs.get(mid)
        if not mob or mob["owner"] != p.name:
            return
        tgt = self.online(str(m.get("name", ""))[:16])
        try:
            dmg = max(0, min(20, int(m.get("dmg", 0))))
        except (TypeError, ValueError):
            return
        if tgt and dmg > 0:
            await tgt.ws.send_json({"t": "mobdmg", "mid": mid, "dmg": dmg,
                                    "type": mob["type"]})

    async def mob_dead(self, p, m):
        """The simulating client says the mob died on its own (burned, fell)."""
        mid = str(m.get("mid", ""))[:12]
        mob = self.mobs.get(mid)
        if not mob or mob["owner"] != p.name:
            return
        await self.mob_del(mid, "died")

    async def mob_kill(self, mid, killer):
        """Server-side kill: grant loot + bounty to the killer, tell everyone."""
        mob = self.mobs.get(mid)
        if not mob:
            return
        mt = mob["type"]
        if killer:
            kacc = self.store.account(killer.name)
            kled = kacc.setdefault("led", {})
            rolls = MOB_LOOT.get(mt, [])
            for item_id, lo, hi in rolls:
                n = random.randint(lo, hi)
                if n > 0:
                    if item_id in ECON_IDS:
                        kled[str(item_id)] = min(100000, int(kled.get(str(item_id), 0)) + n)
                    await killer.ws.send_json({"t": "give", "id": item_id, "count": n,
                                               "name": "loot"})
            self.store.save_accounts()
            reward = MOB_REWARD.get(mt, 0)
            if reward:
                acc = self.store.account(killer.name)
                acc["money"] = int(acc.get("money", 0)) + reward
                self.store.save_accounts()
                await killer.ws.send_json({"t": "balance", "amt": int(acc["money"])})
                await self.sys_to(killer, "%s slain: +%d DB bounty." % (mt, reward))
        await self.broadcast({"t": "mobdel", "mid": mid})
        await self.sys_all("%s was slain by %s" % (mt, killer.name if killer else "something"))
        self.mobs.pop(mid, None)

    async def mob_del(self, mid, why):
        self.mobs.pop(mid, None)
        await self.broadcast({"t": "mobdel", "mid": mid})

    async def mob_prune(self):
        """Despawn mobs nobody is near, or whose owner went silent."""
        if not self.mobs:
            return
        now = time.time()
        for mid in list(self.mobs):
            mob = self.mobs[mid]
            owner = self.players.get(mob["owner"])
            if owner is None:
                await self.reassign_one(mid)
                continue
            if owner.dim != mob["dim"]:
                # the owner left the dimension; hand the mob to someone there
                others = [q for q in self.players.values() if q.dim == mob["dim"]]
                if others:
                    await self.mob_own_to(mid, random.choice(others))
                continue
            near = False
            for q in self.players.values():
                if q.dim != mob["dim"]:
                    continue
                d2 = (q.x - mob["x"]) ** 2 + (q.z - mob["z"]) ** 2
                if d2 < 130 * 130:
                    near = True
                    break
            if not near or now - mob["last"] > STALE_AFTER:
                await self.mob_del(mid, "despawned")

    async def mob_own_to(self, mid, p):
        mob = self.mobs.get(mid)
        if not mob:
            return
        mob["owner"] = p.name
        mob["last"] = time.time()
        await p.ws.send_json({"t": "mobown", "mid": mid, "type": mob["type"],
                              "x": mob["x"], "y": mob["y"], "z": mob["z"],
                              "yaw": mob["yaw"], "hp": mob["hp"], "dim": mob["dim"]})

    async def reassign_one(self, mid):
        mob = self.mobs.get(mid)
        if not mob:
            return
        cands = [q for q in self.players.values() if q.dim == mob["dim"]]
        if not cands:
            await self.mob_del(mid, "nobody around")
            return
        cands.sort(key=lambda q: (q.x - mob["x"]) ** 2 + (q.z - mob["z"]) ** 2)
        await self.mob_own_to(mid, cands[0])

    async def reassign_mobs(self, name):
        for mid in list(self.mobs):
            if self.mobs[mid]["owner"] == name:
                await self.reassign_one(mid)

    # ------------------------------------------------------------ rtp v2 --
    def rtp_resolved(self, p, m):
        """The client judged the candidate list against the real terrain and
        picked the first honest, dry spot (index i)."""
        pend = p.rtp_wait
        p.rtp_wait = None
        if not pend or time.time() > pend[1]:
            return
        cands, _ = pend
        try:
            i = int(m.get("i", -1))
        except (TypeError, ValueError):
            return
        if not (0 <= i < len(cands)):
            # the client found no dry land among the candidates
            asyncio.ensure_future(self.sys_to(p, "RTP could not find land, try again."))
            return
        tx, tz = cands[i]
        try:
            x = float(m.get("x", tx + 0.5)); y = float(m.get("y", 40)); z = float(m.get("z", tz + 0.5))
        except (TypeError, ValueError):
            return
        if abs(x - (tx + 0.5)) > 2 or abs(z - (tz + 0.5)) > 2:
            return
        p.ac_grace = time.time() + 5
        asyncio.ensure_future(p.ws.send_json(
            {"t": "teleport", "x": x, "y": y, "z": z, "dim": "over"}))
        asyncio.ensure_future(self.sys_to(p, "RTP: whoosh. (%d, %d)" % (tx, tz)))

    # ------------------------------------------------------------- drops --
    async def drop_add(self, p, m):
        """A player threw an item: validate lightly, relay to everyone else."""
        if not p.allow("dropadd", 20):
            return
        try:
            x = round(float(m.get("x")), 2); y = round(float(m.get("y")), 2)
            z = round(float(m.get("z")), 2)
            vx = round(float(m.get("vx", 0)), 2); vy = round(float(m.get("vy", 0)), 2)
            vz = round(float(m.get("vz", 0)), 2)
            iid = int(m.get("id", 0)) & 0xFFFF
            count = max(1, min(999, int(m.get("count", 1))))
        except (TypeError, ValueError):
            return
        m2 = {"t": "dropadd", "did": str(m.get("did", ""))[:48] or p.name,
              "id": iid, "count": count, "x": x, "y": y, "z": z,
              "vx": vx, "vy": vy, "vz": vz}
        if m.get("dur") is not None:
            try:
                m2["dur"] = max(0, min(65535, int(m.get("dur"))))
            except (TypeError, ValueError):
                pass
        if isinstance(m.get("ench"), str) and len(m["ench"]) < 2000:
            m2["ench"] = m["ench"]
        await self.broadcast(m2, exclude=p.name)

    # -------------------------------------------------------------- nukes --
    async def nuke_x(self, p, m):
        """The Big Dingle went off: store the crater and tell everyone."""
        if not p.allow("nukex", 2):
            return
        try:
            x = int(m.get("x")); y = int(m.get("y")); z = int(m.get("z"))
            dim = int(m.get("dim", 0))
        except (TypeError, ValueError):
            return
        if not (0 <= dim <= 4):
            dim = 0
        nukes = self.store.world.setdefault("nukes", [])
        nukes.append([x, y, z, dim])
        if len(nukes) > 128:
            del nukes[:len(nukes) - 128]
        self.store.dirty = True
        self.console("%s detonated a nuke at (%d, %d, %d)" % (p.name, x, y, z))
        await self.broadcast({"t": "nukex", "x": x, "y": y, "z": z, "dim": dim},
                             exclude=p.name)

    # -------------------------------------------------------------- ships --
    async def ship_add(self, p, m):
        if not p.allow("shipadd", 3):
            return
        sid = str(m.get("sid", ""))[:24]
        d = str(m.get("d", ""))
        cap = 900000 if p.admin else 60000   # admins assemble whole districts
        if not sid or not d or len(d) > cap:
            return
        try:
            x = round(float(m.get("x")), 2); y = round(float(m.get("y")), 2)
            z = round(float(m.get("z")), 2); yaw = round(float(m.get("yaw", 0)), 3)
        except (TypeError, ValueError):
            return
        self.ships[sid] = {"d": d, "x": x, "y": y, "z": z, "yaw": yaw,
                           "rider": p.name, "last": time.time()}
        self.ships_dirty = True
        p.ride_ship = sid
        p.ac_grace = time.time() + 4
        await self.broadcast({"t": "shipadd", "sid": sid, "d": d, "x": x, "y": y,
                              "z": z, "yaw": yaw, "rider": p.name}, exclude=p.name)

    async def ship_pos(self, p, m):
        sid = str(m.get("sid", ""))[:24]
        sh = self.ships.get(sid)
        if not sh or sh.get("rider") != p.name:
            return
        try:
            sh["x"] = round(float(m.get("x")), 2); sh["y"] = round(float(m.get("y")), 2)
            sh["z"] = round(float(m.get("z")), 2); sh["yaw"] = round(float(m.get("yaw", 0)), 3)
        except (TypeError, ValueError):
            return
        sh["last"] = time.time()
        self.ships_dirty = True
        m2 = {"t": "shippos", "sid": sid, "x": sh["x"], "y": sh["y"], "z": sh["z"],
              "yaw": sh["yaw"]}
        asyncio.ensure_future(self.broadcast(m2, exclude=p.name))

    async def ship_ride(self, p, m):
        sid = str(m.get("sid", ""))[:24]
        on = 1 if m.get("on") else 0
        sh = self.ships.get(sid)
        if not sh:
            return
        if on:
            if sh.get("rider") and sh.get("rider") != p.name:
                r = self.online(sh["rider"])
                if r and r.ride_ship == sid:
                    await self.sys_to(p, "Someone is already at the helm.")
                    return
            sh["rider"] = p.name
            p.ride_ship = sid
        else:
            if sh.get("rider") == p.name:
                sh["rider"] = None
            if p.ride_ship == sid:
                p.ride_ship = None
        await self.broadcast({"t": "shipride", "sid": sid, "name": p.name, "on": on})

    async def ship_del(self, p, m):
        sid = str(m.get("sid", ""))[:24]
        sh = self.ships.pop(sid, None)
        if not sh:
            return
        self.ships_dirty = True
        if sh.get("rider") == p.name:
            p.ride_ship = None
        await self.broadcast({"t": "shipdel", "sid": sid})

    # ---------------------------------------------------------------- pvp --
    async def pvp_hit(self, p, m):
        """This client's bullet reached another player. Validate roughly, then
        let the target's client apply the damage."""
        if not self.store.world.get("pvp", True) or not p.allow("pvp", 6):
            return
        tgt = self.online(str(m.get("name", ""))[:16])
        if not tgt or tgt is p:
            return
        try:
            dmg = max(0, min(20, int(m.get("dmg", 0))))
        except (TypeError, ValueError):
            return
        if dmg <= 0:
            return
        if not p.admin:
            d = math.hypot(tgt.x - p.x, tgt.z - p.z)
            if d > AC_PVP_RANGE:
                p.strike(1, "shot a player %d blocks away" % int(d))
                return
        how = str(m.get("how", "gun"))[:24]
        await tgt.ws.send_json({"t": "pvdmg", "dmg": dmg, "from": p.name, "how": how})


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
    ap.add_argument("--admin", default=None,
                    help="account to flag as admin (Name, or Name:password to set one)")
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
