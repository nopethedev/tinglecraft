#!/usr/bin/env python3
"""
End-to-end tests for the Tingle Craft multiplayer server (server.py, protocol v2).

No dependencies: speaks RFC 6455 by hand over sockets. Boots the real server on a
random port with a throwaway data folder, then drives several fake clients through
the flows the game uses: auth, block sync, the clock, held items, shop/sell, homes,
admin actions, and the whole mob broker (probe -> resolve -> relay -> hit -> kill).

    python3 scripts/test_mp_server.py
"""

import base64
import hashlib
import json
import os
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time

HOST = "127.0.0.1"
PASS = 0
FAIL = 0


def ok(cond, label):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok: %s" % label)
    else:
        FAIL += 1
        print("  FAIL: %s" % label)


class WS:
    """A minimal blocking websocket client."""

    def __init__(self, port, path="/"):
        self.s = socket.create_connection((HOST, port), timeout=10)
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        req = ("GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\n"
               "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
               "Sec-WebSocket-Version: 13\r\n\r\n" % (path, HOST, port, key))
        self.s.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            c = self.s.recv(4096)
            if not c:
                raise OSError("no handshake reply")
            buf += c
        head, rest = buf.split(b"\r\n\r\n", 1)
        assert b"101" in head.split(b"\r\n")[0], head
        expect = base64.b64encode(hashlib.sha1(
            (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        assert expect in head, "bad Sec-WebSocket-Accept"
        self.buf = rest

    def _read(self, n):
        while len(self.buf) < n:
            c = self.s.recv(65536)
            if not c:
                raise OSError("closed")
            self.buf += c
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, obj):
        data = json.dumps(obj).encode()
        mask = secrets.token_bytes(4)
        hdr = bytes([0x81])
        n = len(data)
        if n < 126:
            hdr += bytes([0x80 | n])
        elif n < 65536:
            hdr += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            hdr += bytes([0x80 | 127]) + struct.pack(">Q", n)
        self.s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv_msg(self, timeout=6.0):
        """Next text message as dict; skips ping frames (auto-pongs)."""
        end = time.time() + timeout
        while time.time() < end:
            self.s.settimeout(max(0.05, end - time.time()))
            try:
                hdr = self._read(2)
            except (socket.timeout, OSError):
                return None
            op = hdr[0] & 0x0F
            ln = hdr[1] & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", self._read(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(ln) if ln else b""
            if op == 0x9:                    # server ping -> pong
                mask = secrets.token_bytes(4)
                fr = bytes([0x8A | 0x00, 0x80 | len(payload)]) + mask
                fr += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
                self.s.sendall(fr)
                continue
            if op == 0x8:
                return {"t": "_closed"}
            if op == 0x1:
                try:
                    return json.loads(payload.decode())
                except ValueError:
                    continue
        return None

    def wait_for(self, t, timeout=6.0, pred=None):
        end = time.time() + timeout
        last = None
        while time.time() < end:
            m = self.recv_msg(timeout=max(0.1, end - time.time()))
            if m is None:
                return None
            last = m
            if m.get("t") == t and (pred is None or pred(m)):
                return m
        return last

    def drain(self, secs=0.4):
        end = time.time() + secs
        out = []
        while time.time() < end:
            m = self.recv_msg(timeout=max(0.05, end - time.time()))
            if m is None:
                break
            out.append(m)
        return out

    def close(self):
        try:
            self.s.close()
        except OSError:
            pass


def http_get(port, path="/"):
    s = socket.create_connection((HOST, port), timeout=5)
    s.sendall(("GET %s HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n" % path).encode())
    buf = b""
    while True:
        c = s.recv(65536)
        if not c:
            break
        buf += c
    s.close()
    return buf


def start_server(port, data_dir, admin="Admin:adminpw"):
    env = dict(os.environ)
    logf = open(os.path.join(data_dir, "server.log"), "w")
    p = subprocess.Popen(
        [sys.executable, "server.py", "--port", str(port), "--data", data_dir,
         "--admin", admin],
        env=env, stdout=logf, stderr=subprocess.STDOUT)
    # wait for the port to accept
    end = time.time() + 10
    while time.time() < end:
        try:
            s = socket.create_connection((HOST, port), timeout=0.4)
            s.close()
            return p
        except OSError:
            if p.poll() is not None:
                logf.close()
                print(open(os.path.join(data_dir, "server.log")).read())
                raise SystemExit("server died on boot")
            time.sleep(0.1)
    raise SystemExit("server never opened the port")


def login(port, name, pw, path="/", register=True):
    ws = WS(port, path)
    ws.send({"t": "register" if register else "login", "name": name, "pass": pw})
    w = ws.wait_for("welcome")
    return ws, w


def collect_until(ws, types, timeout=5.0, preds=None):
    """Read messages until every type in `types` was seen (first match kept).
    preds: optional {type: fn(msg)} — a type only counts when its predicate holds."""
    preds = preds or {}
    got = {}
    end = time.time() + timeout
    while time.time() < end and set(types) - set(got):
        m = ws.recv_msg(timeout=max(0.1, end - time.time()))
        if m and m.get("t") in types and m["t"] not in got:
            pr = preds.get(m["t"])
            if pr is None or pr(m):
                got[m["t"]] = m
    return got


def wait_probe(clients, timeout=14.0):
    """Probes go to one random online player: watch them all."""
    end = time.time() + timeout
    while time.time() < end:
        for c in clients:
            m = c.recv_msg(timeout=0.15)
            if m and m.get("t") == "mobprobe":
                return c, m
    return None, None


def main():
    port = 18770 + (os.getpid() % 500)
    data_dir = tempfile.mkdtemp(prefix="tc_mp_test_")
    print("booting server.py on :%d (data: %s)" % (port, data_dir))
    proc = start_server(port, data_dir)
    try:
        run(port, data_dir)
    finally:
        proc.terminate()
        try:
            proc.wait(5)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(data_dir, ignore_errors=True)
    print("\n%d passed, %d failed" % (PASS, FAIL))
    sys.exit(1 if FAIL else 0)


def run(port, data_dir):
    # ---- plain HTTP fallback (reverse-proxy health checks) -------------
    r = http_get(port, "/anything")
    ok(b"200" in r.split(b"\r\n")[0] and b"TINGLE CRAFT" in r, "plain HTTP GET answers 200")

    # ---- handshake at a proxy path ------------------------------------
    ws, w = login(port, "Admin", "adminpw", path="/tc/ws", register=False)
    ok(w is not None and w.get("admin") == 1, "admin logs in via path /tc/ws (proxy style)")
    if w is None:
        print("  (cannot continue without the admin)")
        return
    ok(w.get("v") == 2, "welcome speaks protocol v2")
    ok(isinstance(w.get("shop"), list) and len(w["shop"]) > 10, "welcome carries the shop catalog")
    ok(isinstance(w.get("sell"), dict), "welcome carries the sell price list")
    ok("homes" in w, "welcome carries homes")
    t0 = w.get("time")
    ok(isinstance(t0, (int, float)) and 0 <= t0 <= 1, "welcome carries the clock")

    # ---- no impersonation ----------------------------------------------
    ws2, w2 = login(port, "Admin", "wrong", register=False)
    ok(w2 is None, "wrong password is denied")

    # ---- second player joins; plist broadcast --------------------------
    pws = WS(port)
    pws.send({"t": "register", "name": "Steve", "pass": "pass1"})
    pw2 = pws.wait_for("welcome")
    ok(pw2 is not None and pw2.get("admin") == 0, "player registers")
    pl = ws.wait_for("plist", pred=lambda m: any(x[0] == "Steve" for x in m.get("ps", [])))
    ok(pl is not None, "plist broadcast lists Steve")

    # ---- block edits sync ----------------------------------------------
    pws.send({"t": "set", "ck": "3,2", "lk": "4,40,5", "id": 27})
    got = ws.wait_for("set", pred=lambda m: m.get("lk") == "4,40,5")
    ok(got is not None and got.get("id") == 27, "block edit relays to other players")

    # ---- held item relay ------------------------------------------------
    pws.send({"t": "pos", "x": 10.5, "y": 41, "z": 12.5, "yaw": 1, "pitch": 0,
              "dim": "over", "hp": 20, "held": 27})
    got = ws.wait_for("pos", pred=lambda m: m.get("name") == "Steve")
    ok(got is not None and got.get("held") == 27, "held item id rides the pos relay")

    # ---- the clock: server broadcasts time ------------------------------
    got = ws.wait_for("time", timeout=8)
    ok(got is not None and isinstance(got.get("v"), (int, float)),
       "server broadcasts the clock")

    # ---- shop: buy via the GUI message ----------------------------------
    bal0 = pw2.get("balance", 0)
    pws.send({"t": "buy", "item": "cobblestone", "count": 2})
    g = collect_until(pws, {"give", "balance"})
    ok(g.get("give", {}).get("id") == 4 and g.get("give", {}).get("count") == 2,
       "buy grants the item")
    ok(g.get("balance", {}).get("amt") == bal0 - 4, "buy charges the balance")

    # ---- sell ------------------------------------------------------------
    pws.send({"t": "sell", "id": 4, "count": 2})
    s = collect_until(pws, {"sold", "balance"})
    ok(s.get("sold", {}).get("earn") == 2, "sell pays the sell price")
    ok(s.get("balance", {}).get("amt") == bal0 - 4 + 2, "sell updates the balance")

    # ---- homes ------------------------------------------------------------
    pws.send({"t": "pos", "x": 55.5, "y": 42.0, "z": -7.5, "dim": "over", "hp": 20})
    pws.drain(0.3)
    pws.send({"t": "sethome", "name": "base"})
    h = pws.wait_for("homes")
    ok(h is not None and "base" in h.get("homes", {}), "sethome stores a home")
    ok(abs(h["homes"]["base"][0] - 55.5) < 0.2, "home stores the position")
    pws.send({"t": "home", "name": "base"})
    tp = pws.wait_for("teleport")
    ok(tp is not None and abs(tp.get("x", 0) - 55.5) < 0.2, "home teleports you back")
    pws.send({"t": "delhome", "name": "base"})
    h = pws.wait_for("homes")
    ok(h is not None and "base" not in h.get("homes", {}), "delhome removes it")

    # ---- admin actions ------------------------------------------------------
    ws.send({"t": "adm", "act": "money", "name": "Steve", "amt": 777})
    b = pws.wait_for("balance")
    ok(b is not None and b.get("amt") == 777, "admin sets a player balance")
    ws.send({"t": "adm", "act": "give", "name": "Steve", "amt": 23})
    b = pws.wait_for("balance")
    ok(b is not None and b.get("amt") == 800, "admin adds DB")
    ws.send({"t": "adm", "act": "time", "val": "midnight"})
    got = pws.wait_for("time")
    ok(got is not None and abs(got.get("v", -1) - 0.75) < 0.01, "admin sets the clock")
    ws.send({"t": "adm", "act": "motd", "txt": "Test MOTD here"})
    got = pws.wait_for("sys", pred=lambda m: "Test MOTD" in m.get("txt", ""))
    ok(got is not None, "admin sets the MOTD")
    ws.send({"t": "adm", "act": "tothem", "name": "Steve"})
    got = pws.wait_for("sys", pred=lambda m: "Teleported" in m.get("txt", "") or True)
    # Steve should get the admin arriving; the admin gets a teleport msg
    got = ws.wait_for("teleport", timeout=3)
    ok(got is not None, "admin teleports to a player")
    ws.send({"t": "adm", "act": "tome", "name": "Steve"})
    got = pws.wait_for("teleport", timeout=3)
    ok(got is not None, "admin brings a player over")
    # mobs toggle
    ws.send({"t": "adm", "act": "mobs", "on": 0})
    got = pws.wait_for("sys", pred=lambda m: "Mob spawning" in m.get("txt", ""))
    ok(got is not None, "admin toggles mob spawning off")
    ws.send({"t": "adm", "act": "mobs", "on": 1})
    pws.drain(0.5)

    # non-admin cannot use adm
    pws.send({"t": "adm", "act": "money", "name": "Steve", "amt": 99999})
    got = pws.wait_for("sys")
    ok(got is not None and "Admins only" in got.get("txt", ""), "adm is admin-gated")

    # ---- machine state relay ----------------------------------------------
    pws.send({"t": "mach", "k": "10,40,11", "on": 1, "burn": 80.5, "burnMax": 80.0})
    got = ws.wait_for("mach")
    ok(got is not None and got.get("on") == 1 and abs(got.get("burn", 0) - 80.5) < 0.01,
       "engine burn state relays to everyone")

    # ---- the mob broker ------------------------------------------------------
    ws.send({"t": "adm", "act": "mobs", "on": 1})
    pws.drain(0.3)
    probed, probe = wait_probe([ws, pws])
    ok(probe is not None and "pid" in probe and "x" in probe,
       "server asks a client to probe a spawn spot")
    if probe is None:
        return
    # resolve it: a pig on the surface (guaranteed loot, so the kill test is deterministic)
    probed.send({"t": "mobres", "pid": probe["pid"], "ok": 1,
                 "x": probe["x"] + 0.5, "y": 41, "z": probe["z"] + 0.5,
                 "dim": "over", "type": "pig"})
    add = ws.wait_for("mobadd")
    ok(add is not None and add.get("type") == "pig" and add.get("own") in ("Admin", "Steve"),
       "resolved mob broadcasts to everyone")
    mid = add["mid"] if add else "m0"
    add2 = pws.wait_for("mobadd", pred=lambda m: m.get("mid") == mid)
    ok(add2 is not None, "the other client sees the mob too")
    # owner streams position; server relays to the other player
    for _ in range(3):
        probed.send({"t": "mobpos", "mid": mid, "x": 11.5, "y": 41.2, "z": 13.5,
                     "yaw": 0.5, "hp": 18})
        time.sleep(0.06)
    got = (pws if probed is ws else ws).wait_for("mobpos", pred=lambda m: m.get("mid") == mid)
    ok(got is not None and got.get("x") == 11.5, "owner position streams to others")
    ok(got is not None and got.get("hp") == 18, "mob hp rides along")
    # forged probe pids must not hatch mobs
    ws.send({"t": "mobres", "pid": "p999999", "ok": 1, "x": 12.5, "y": 41, "z": 14.5,
             "dim": "over", "type": "zombie"})
    leaked = ws.wait_for("mobadd", pred=lambda m: m.get("mid") != mid, timeout=1.2)
    ok(leaked is None, "forged mobres pids are ignored")
    # a third client (not the owner) hits it
    cws = WS(port)
    cws.send({"t": "register", "name": "Alex", "pass": "pass2"})
    aw = cws.wait_for("welcome")
    ok(aw is not None, "third player joins")
    cws.send({"t": "mobhit", "mid": mid, "dmg": 30})
    # server kills it: loot + bounty to Alex, mobdel + announcement to all
    kg = collect_until(cws, {"give", "balance", "sys"}, timeout=5,
                       preds={"sys": lambda m: "slain by Alex" in m.get("txt", "")})
    ok(kg.get("give") is not None, "kill grants loot to the shooter")
    ok(kg.get("balance", {}).get("amt", 0) >= aw.get("balance", 0) + 2, "kill pays a DB bounty")
    dele = ws.wait_for("mobdel", pred=lambda m: m.get("mid") == mid)
    ok(dele is not None, "death broadcasts mobdel")
    ok(kg.get("sys") is not None, "kill is announced")
    # mob hits a player: spawn a fresh mob properly, then relay the blow
    names = {id(ws): "Admin", id(pws): "Steve", id(cws): "Alex"}
    probed2, probe2 = wait_probe([ws, pws, cws])
    if probe2:
        probed2.send({"t": "mobres", "pid": probe2["pid"], "ok": 1,
                      "x": probe2["x"] + 0.5, "y": 41, "z": probe2["z"] + 0.5,
                      "dim": "over", "type": "zombie"})
        add3 = collect_until(cws, {"mobadd"}, timeout=5).get("mobadd")
        if not add3:
            add3 = collect_until(ws, {"mobadd"}, timeout=2).get("mobadd")
        if add3:
            # only the mob's owner may report its melee hits
            probed2.send({"t": "mobhitp", "mid": add3["mid"],
                          "name": names[id(cws)], "dmg": 3})
            dmg = collect_until(cws, {"mobdmg"}, timeout=4).get("mobdmg")
            ok(dmg is not None and dmg.get("dmg") == 3 and dmg.get("type") == "zombie",
               "mob melee relays to the victim's client")
            # and a non-owner cannot fake it: pick a client that owns nothing
            faker = ws if probed2 is not ws else pws
            faker.send({"t": "mobhitp", "mid": add3["mid"], "name": "Alex", "dmg": 30})
            dmg2 = collect_until(cws, {"mobdmg"}, timeout=1.5).get("mobdmg")
            ok(dmg2 is None, "non-owner clients cannot fake mob melee")
        else:
            ok(False, "mob melee relay (second mobadd missing)")
    else:
        ok(False, "mob melee relay (no probe arrived)")

    # ---- kick/ban via the admin panel ---------------------------------------
    ws.send({"t": "adm", "act": "kick", "name": "Alex"})
    got = cws.wait_for("kick")
    ok(got is not None, "admin kicks a player")
    ws.send({"t": "adm", "act": "ban", "name": "Alex"})
    banned, bw = login(port, "Alex", "pass2", register=False)
    ok(bw is None, "banned players cannot rejoin")
    ws.send({"t": "adm", "act": "unban", "name": "Alex"})
    time.sleep(0.3)

    # ---- /shop chat command still works -------------------------------------
    pws.send({"t": "cmd", "txt": "/shop list"})
    got = pws.wait_for("sys", pred=lambda m: "Shop:" in m.get("txt", ""))
    ok(got is not None, "/shop list still answers")

    # ---- homes limit ----------------------------------------------------------
    for nm in ("alpha", "beta", "gamma", "delta", "omega"):
        pws.send({"t": "cmd", "txt": "/sethome " + nm})
    h = pws.wait_for("homes", pred=lambda m: len(m.get("homes", {})) >= 5, timeout=5)
    ok(h is not None, "five homes fit")
    pws.send({"t": "cmd", "txt": "/sethome extra"})
    got = pws.wait_for("sys", pred=lambda m: "already have" in m.get("txt", ""))
    ok(got is not None, "home limit enforced")

    # ---- keepalive: server pings -----------------------------------------------
    ws.send({"t": "ping"})
    got = ws.wait_for("pong")
    ok(got is not None, "app-level ping/pong")

    for x in (ws, pws, cws):
        x.close()


if __name__ == "__main__":
    main()
