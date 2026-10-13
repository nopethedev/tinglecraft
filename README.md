# TINGLE CRAFT

**Tingle Craft** is a fan-made, Minecraft-style voxel sandbox that ships as **one HTML file** — and it is built on
**DINGLECRAFT**, the original one-file voxel sandbox by **Dan Dingle** ([dandingle.store/dinglecraft](https://dandingle.store/dinglecraft)).
All of the original game's code, art and ideas are his: this fork continues his work with full credit, and adds
**multiplayer** (with a Python server), **The Backrooms** dimension and **mobile touch polish**.

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

That writes `dist/dinglecraft_v7.0.html` — every texture is inside it, three.js is bundled, no internet needed.

### Multiplayer

1. **The host runs the server** (pure Python standard library, no pip installs):

   ```
   python server.py                       # port 8765, data in server_data/
   python server.py --admin YourName      # creates/flags your admin account
   python server.py --port 9000 --data my_data
   ```

2. **Players open the game → Multiplayer** on the title screen, **Add Server** (name + address, like
   `127.0.0.1:8765` or your host's IP), then **Join**.
3. **Register** an account with a username + password (hashed, stored server-side in `server_data/accounts.json`).
   Nobody can join as you by typing your name — the account is the identity, and only the server owner can make
   someone an admin (`--admin`, the console `op` command, or in-game `/op` for existing admins).

**Server commands:** `/help` `/list` `/money` `/pay <player> <amount>` `/rtp` `/tpa <player>` `/tpaccept`
`/tpdeny` `/msg` `/spawn` `/backrooms` `/shop [buy <item> [count]]` — plus `/kick` `/ban` `/op` `/deop` `/say`
`/give` for admins. **Server console:** `help` `op` `deop` `kick` `ban` `unban` `passwd` `money` `say` `motd`
`list` `save` `stop`.

The world (seed + every block edit), the balances and the bans persist in `server_data/` (`world.json`,
`accounts.json`, `bans.json`) — back that folder up and you have backed up the server. Money ("DB") starts at 100;
`/shop` sells blocks, `/pay` sends it to other players, admins grant it with `/give`.

### Mobile

The game auto-enables touch controls on phones and tablets: a joystick, JUMP / SNEAK / DROP / INV / PAUSE buttons,
tap to place, hold to mine, drag to look — plus the new **CHAT** and **FULL(screen)** buttons. The Multiplayer
menu, login and chat all work by touch.

## The Backrooms

A new dimension of mono-yellow rooms, damp carpet and the hum of fluorescent lights. Craft an **Exit Door**
(planks + glowstone + diamond, makes 2), place it and click it — or type `/backrooms` in chat (singleplayer or
on a server). Click the door again to leave. Do not noclip on purpose.

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
- `src/net/` — the multiplayer client (WebSocket, remote players, chat bridge).
- `src/backrooms/` — The Backrooms dimension.
- `src/` — the whole game, one file per system, ~41,000 lines of plain JavaScript on three.js r128.
- `docs/` — how everything works (start with `docs/ARCHITECTURE.md`).

## Credits

- **Dan Dingle (dandingle)** — creator of **DINGLECRAFT**, the original game: all original systems, art, music,
  worlds and ideas. Tingle Craft is a fork that stands on his shoulders. Thank you, Dan.
- Tingle Craft additions (multiplayer client + server, The Backrooms, touch polish) by the Tingle Craft fork
  maintainers.
- three.js r128 (MIT), and the third-party models listed in [THIRD_PARTY.md](THIRD_PARTY.md) and on the in-game
  Credits screen.

## Licence

Inherited from the original project: source-available, no redistribution — you may play it, read it, tinker with
it and make videos of it, but not hand it out or sell it. The full terms are in [LICENSE](LICENSE). Third-party
components keep their own licences ([THIRD_PARTY.md](THIRD_PARTY.md)). Nothing in this repository includes an AI
API key.
