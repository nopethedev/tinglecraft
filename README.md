# TINGLE CRAFT

**Tingle Craft** is a fan-made, Minecraft-style voxel sandbox that ships as **one HTML file** — and it is built on
**DINGLECRAFT**, the original one-file voxel sandbox by **Dan Dingle** ([dandingle.store/dinglecraft](https://dandingle.store/dinglecraft)).
All of the original game's code, art and ideas are his: this fork continues his work with full credit, and adds
**multiplayer** (with a Python server), **The Backrooms** dimension, a **Create-flavoured factory pack**, 
**WorldEdit + litematic/schematic loading**, buildable **ships**, **guns** and **mobile touch polish**.

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

- **Kinetic power** — machine blocks that touch form a network. A burning **Steam Engine** supplies 256, a
  **Water Wheel** sitting in water supplies 128, a spinning **Windmill Bearing** supplies 32 per sail (six or
  more sails to start it). Cogwheels and shafts carry power across the network; belts no longer need an engine
  in arm's reach.
- **Mechanical Press** — stomps the gap under itself every 1.4 s: iron into iron sheets, gold into gold sheets,
  sand into sandstone, clay into bricks.
- **Millstone** — grinds drops on top of it: cobble to gravel, gravel to sand, wheat into flour (flour bakes
  into bread), logs into planks.
- **Mechanical Mixer + Basin** — washes drops on an adjacent basin: gravel becomes sand, with iron panning out
  now and then.
- **Brass Funnel / Chute** — funnels file the drops on top of them into the container below (chest, vault,
  furnace, engine); chutes drop items straight down their column.
- **Item Vault** — a 54-slot chest. **Depot** — a stable pedestal for pressing. **Iron Grate / Industrial Iron /
  Andesite / Andesite Casing / Fluid Tank** — the builder's kit.
- **Conveyor Belt** — carries drops, mobs and you along its axis while powered; belts next to a **burning
  furnace** become a heated section: ore rides in one end, ingots out the other.
- Everything craftable and in the **Create** creative tab and the server shop. Andesite veins the stone now.

### WorldEdit & schematics

The classic builder kit lives on the **double slash**: `//help` lists the commands — `//wand`, `//pos1`,
`//pos2`, `//hpos1`, `//hpos2`, `//set`, `//replace`, `//walls`, `//outline`, `//count`, `//size`, `//expand`,
`//contract`, `//shift`, `//copy`, `//cut`, `//paste`, `//undo`, `//redo`, `//limit`. The **wand** is a
craftable item (left-click = position 1, right-click = position 2). Block names accept the game's names, ids
and the usual Minecraft names. The pause menu's **Schematics** button (or `//schem`) loads `.litematic`,
Sponge `.schem` and legacy `.schematic` files and pastes them at your feet as real blocks — unknown blocks land
as cobblestone, and pastes are undoable. In multiplayer WorldEdit is admin-only.

### The wilds, dressed

Five new overworld structures, deterministic from the seed: **desert pyramids** (a tomb, a chest, a TNT
surprise), **igloos** (furnace included), **ruined watchtowers**, **glowstone-capped stone circles** and
**shipwrecks** beached or sunk. Bedrock has a ragged four-layer shoulder now — dig accordingly.

### Mobile

The game auto-enables touch controls on phones and tablets: a joystick, JUMP / SNEAK / DROP / INV / PAUSE buttons,
tap to place, hold to mine, drag to look — plus the new **CHAT** and **FULL(screen)** buttons. The Multiplayer
menu, login and chat all work by touch.

## The Backrooms

A dimension of mono-yellow rooms, damp carpet and the hum of fluorescent lights — and now a whole descent.
**Twenty-two levels**: fall through a hole in the floor to noclip deeper (the Lobby, Pipe Dreams, the Terror
Hotel, Lights Out, Thalassophobia, the Cave System, the Suburbs, the Field of Wheat, the Endless City, the
Matrix, Paradise, the Flooded Halls, the Carrier, the Attic, the Warehouse...), rare **Exit Doors** climb back
up, and level 0's door still leaves for good (rarer now, as it should be). Every level now wears its true
materials: stained wallpaper and buzzing light panels in the Lobby, concrete and supply crates in the Habitable
Zone, pipe-lined tunnels in Pipe Dreams, drywall desks in the Abandoned Office, red carpet and numbered doors
in the Terror Hotel, pitch-black metal in Lights Out, glass-windowed towers in the Endless City, green code on
the Matrix's walls, crates to the ceiling in the Warehouse, and white tile with skylights and pools of every
depth in the Poolrooms. **Level 21 is the Poolrooms**;
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
