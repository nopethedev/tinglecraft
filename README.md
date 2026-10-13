# TINGLE CRAFT

**Tingle Craft** is a fan-made, Minecraft-style voxel sandbox that ships as **one HTML file** — and it is built on
**DINGLECRAFT**, the original one-file voxel sandbox by **Dan Dingle** ([dandingle.store/dinglecraft](https://dandingle.store/dinglecraft)).
All of the original game's code, art and ideas are his: this fork continues his work with full credit, and adds
**multiplayer** (with a Python server), **The Backrooms** dimension, **machines** (steam engines and conveyor
belts) and **mobile touch polish**.

> Tingle Craft and DINGLECRAFT are independent fan-made games. NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR
> ASSOCIATED WITH MOJANG OR MICROSOFT. Other names belong to their owners.

---

## Play it

### Singleplayer

Download or build the game HTML and double-click it — the whole game is one file, on Windows, macOS or Linux
(desktop Chrome or Edge is the safest bet; it also plays on mobile browsers, see Mobile below).

```
npm run build        # Node.js 20+ (22 recommended), no npm packages needed
```

That writes `dist/dinglecraft_v7.2.html` — every texture is inside it, three.js is bundled, no internet needed.

### Multiplayer

1. **The host runs the server** (pure Python standard library, no pip installs):

   ```
   python server.py                       # port 8765, data in server_data/
   python server.py --admin YourName      # creates/flags your admin account
   python server.py --port 9000 --data my_data
   ```

2. **Players open the game → Multiplayer** on the title screen, **Add Server** (name + address, like
   `127.0.0.1:8765`, `ws://host:port/path` or `wss://host/tc` behind a proxy), then **Join**.
3. **Register** an account with a username + password (hashed, stored server-side in `server_data/accounts.json`).
   Nobody can join as you by typing your name — the account is the identity, and only the server owner can make
   someone an admin (`--admin`, the console `op` command, or in-game `/op` for existing admins).

**Server commands:** `/help` `/list` `/money` `/pay <player> <amount>` `/rtp` `/tpa <player>` `/tpaccept`
`/tpdeny` `/msg` `/spawn` `/backrooms [0-22]` `/shop` `/sell` `/home` `/sethome` `/delhome` `/homes` — plus `/kick`
`/ban` `/op` `/deop` `/say` `/give` `/time` `/mobson` `/mobsoff` `/pvp` `/backrooms <level>` for admins. **Server console:** `help` `op`
`deop` `kick` `ban` `unban` `passwd` `money` `time` `mobson` `mobsoff` `say` `motd` `list` `save` `stop`.

The world (seed + every block edit), the balances, the homes and the bans persist in `server_data/` (`world.json`,
`accounts.json`, `bans.json`) — back that folder up and you have backed up the server. Money ("DB") starts at 100;
`/shop` opens the shop GUI, `/sell` opens the sell menu, `/pay` sends it to other players, admins grant it with
`/give` or the **Server Admin** panel (set balances, kick/ban/op, bring players, set the time, spawn, MOTD and mob
spawning).

**Everything stays in sync — and saves:** the server owns the clock (one shared day/night), it relays each
player's held item, and it brokers the mobs (they spawn, roam, chase and hit every nearby player the same way
for everyone, and they are all there the moment you join). Rejoining restores your whole self from your
account: inventory, armour, position, dimension, hunger, xp, hotbar. Chests, furnaces and steam engines sync
and persist. Admins' game rules follow them between sessions. `/rtp` only lands you on dry land. A very simple
anticheat watches for impossible movement, out-of-reach edits, cross-map kills and duped items — cheats get
kicked, repeat offenders banned. Ships (see below) sync and persist too. The multiplayer list ships with a
featured server (`play.arcside.us.kg`) pinned at the top.

**Behind a reverse proxy** (nginx, Caddy): the handshake accepts any path, so `wss://your.host/tc` just works —
ready-made configs are in [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md). Plain HTTP health checks get a friendly
answer.

### Ships

Build a boat out of ship blocks (planks, logs, glass, wool, chests, furnaces, doors — 25+ of them), craft the
**Magical Ship Helm** (planks + sticks + a diamond), aim it at your ship and use it: the whole structure lifts
out of the world as one drivable ship and the helm becomes the **driver's seat**. WASD to sail (fast on water,
slow beached), Shift to step off, sneak + right-click to break it back into blocks (the helm pops off). In
multiplayer everyone sees your ship move, and ships persist in the world save.

### The armoury

Alongside the classic iron/gold/diamond guns: the **M9**, the full-auto **AK47** and the **Remington 870**
(nine-pellet pump) — craft them or buy them in the server shop. In multiplayer their bullets can hit other
players through a server-validated relay (`/pvp` toggles it), and deaths are announced with the culprit's name.
Hover any item in any inventory to see what it does.

### Machines (a Create-flavoured pack)

- **Steam Engine** — right-click it and feed it coal or planks. While it burns it puffs smoke and powers every
  conveyor belt within 3 blocks.
- **Conveyor Belt** — carries drops, mobs and you along its axis while powered; belts line up with their
  neighbours. A belt next to a **burning furnace** is a heated section: drops that ride over it get smelted —
  ore in one end, ingots out the other.
- Craft them (iron + furnace + cobble; iron for belts), or buy them in the server shop.

### Mobile

The game auto-enables touch controls on phones and tablets: a joystick, JUMP / SNEAK / DROP / INV / PAUSE buttons,
tap to place, hold to mine, drag to look — plus the new **CHAT** and **FULL(screen)** buttons. The Multiplayer
menu, login and chat all work by touch.

## The Backrooms

A dimension of mono-yellow rooms, damp carpet and the hum of fluorescent lights — and now a whole descent.
**Twenty-two levels**: fall through a hole in the floor to noclip deeper (the Lobby, Pipe Dreams, the Terror
Hotel, Lights Out, Thalassophobia, the Cave System, the Suburbs, the Field of Wheat, the Endless City, the
Matrix, Paradise, the Flooded Halls, the Carrier, the Attic, the Warehouse...), rare **Exit Doors** climb back
up, and level 0's door still leaves for good (rarer now, as it should be). **Level 21 is the Poolrooms**;
**level 22 is The Exit** — a small bright room whose door takes you home. Admins jump anywhere:
`/backrooms 1-20` (also `pool`, `exit`). Leaving no longer NaNs you into the void: where you noclipped in is
where you come out. Do not noclip on purpose.

## Controls

WASD to move, Space to jump, Shift to sneak, hold left mouse to mine or attack, right mouse to place, 1-9 or the
scroll wheel for the hotbar, E for the inventory, Q to drop, F to change camera, **T or Enter for chat** (also the
CHAT button on touch), Esc to pause, F3 for the debug overlay. The full list is in Help & Controls on the title
screen.

## Building, testing, contributing

```
npm run build          # concatenates src/ (in src/ORDER.txt order) into the one-file game
npm run test:quick     # build + the repo checks + static suites + core logic (~30 s)
python3 server.py      # the multiplayer server (no dependencies)
```

- `server.py` — the multiplayer server (pure Python stdlib; protocol: JSON over WebSocket).
- `src/net/` — the multiplayer client (WebSocket, remote players, server GUIs, chat bridge).
- `src/backrooms/` — The Backrooms dimension.
- `src/machines/` — the Steam Engine and Conveyor Belts.
- `src/` — the whole game, one file per system, ~41,000 lines of plain JavaScript on three.js r128.
- `docs/` — how everything works (start with `docs/ARCHITECTURE.md`; multiplayer + proxy configs in
  `docs/MULTIPLAYER.md`).

## Credits

- **Dan Dingle (dandingle)** — creator of **DINGLECRAFT**, the original game: all original systems, art, music,
  worlds and ideas. Tingle Craft is a fork that stands on his shoulders. Thank you, Dan.
- Tingle Craft additions (multiplayer client + server, The Backrooms, machines, touch polish) by the Tingle Craft
  fork maintainers.
- three.js r128 (MIT), and the third-party models listed in [THIRD_PARTY.md](THIRD_PARTY.md) and on the in-game
  Credits screen.

## Licence

Inherited from the original project: source-available, no redistribution — you may play it, read it, tinker with
it and make videos of it, but not hand it out or sell it. The full terms are in [LICENSE](LICENSE). Third-party
components keep their own licences ([THIRD_PARTY.md](THIRD_PARTY.md)). Nothing in this repository includes an AI
API key.
