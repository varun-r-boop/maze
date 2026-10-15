# Keybound

Online freeze tag in the dark for 2–12 players, each on their own device (PC or phone).
Everyone has a headlight, and walls block it, so you only see what's in your line of sight.

## How to play

- At the start of each round, players are picked at random to be **IT** (taggers): 1 for 2–6 players, 2 for 7–12. Everyone else is a **runner**. Everyone plays as a clay man or woman (pick one in the lobby).
- Runners get a 5-second head start. Then a tagger who catches up to a runner and **left-clicks** (or presses Space) **freezes** them, and frozen runners can't move.
- A free runner who gets next to a frozen one and **left-clicks** (or presses Space) **unfreezes** them. They can't be tagged for 2 seconds afterwards.
- **Taggers win** if every runner is frozen before time runs out. **Runners win** if at least one is still free when the timer ends.
- **On your own?** If you're the only one in the room, the button says **Explore the map**: you walk around the chosen map with no tagger and no clock. Press **L** or the **← Lobby** button to go back.
- The host picks the map and the round length (1, 2, 3, 5 or 8 minutes) in the lobby. "Play again" picks new taggers.
- Runners always see where the other runners are (frozen ones are marked with ❄), so they can go and rescue them. Taggers only show up when you can actually see them. When a tagger gets close you hear a heartbeat and the chase music.

The rules' numbers (tagger speed, tag and unfreeze reach, head start, round lengths...) are at the top of `public/shared.js`.

## Maps

The host picks the map in the lobby:

- **Building:** a single floor of rooms, hallways and doorways, different every game.
- **Forest:** a forest at night. Runners start at a campfire; winding paths lead off through the trees. Trees block your way and your light; bushes, rocks, logs and the pond (cross it by the bridge) only block your way. There's an abandoned cabin in the woods.
- **Office (lights on):** a bright open-plan office floor based on a real floor plan: glass-walled meeting rooms, a staff lounge, a collaboration lounge with yellow sofas by the windows, desk pods, toilets, a copy room and a server room. Runners start in the elevator lobby. The lights are on, so you can see all around you, but walls still block your view (glass walls don't). In the 3D views the whole office, characters included, is made of clay.
- **Apartment (3 floors):** a hallway down each floor with flats on both sides and a stairwell at each end. Walk onto a staircase (▲ up, ▼ down) to change floors. Runners start on the top floor, and everyone can chase or flee up and down the stairs.

## Views

Each player picks their own view in the lobby: **Top-down**, **Third person** or **First person**. Press **V** during a game to switch. Press **M** to turn the background music (`public/music.mp3`) on or off. When a tagger is close behind you, a chase sound (`public/chase.mp3`) plays, louder the closer they get.

## Controls

**Top-down**
- **PC:** WASD or the arrow keys move you. Your headlight points the way you're walking. Left-click (or Space) to tag or unfreeze.
- **Phone/tablet:** drag anywhere to move. Tap the round **TAG** / **UNFREEZE** button to tag or unfreeze; it lights up when someone's in reach.

**First / third person**
- **PC:** click the game to look around with the mouse (Esc frees the mouse). W/S walk, A/D step sideways, ←/→ or Q/E turn. Left-click (or Space) to tag or unfreeze.
- **Phone/tablet:** drag up/down to walk, left/right to turn. Tap the round button to tag or unfreeze.

## Run the server

Requires Node.js 18+.

```bash
npm install
npm start
```

Open http://localhost:3000, enter your name, and click **Host game**. Share the invite link shown in the lobby.

## Letting friends connect

**Same Wi-Fi:** the lobby's invite link (`http://192.168.x.x:3000/?room=CODE`) works as is. The first time you start the server, Windows may ask whether Node.js can use the network. Allow **Private networks**.

**Friends somewhere else (quickest, free, no account):** run a Cloudflare quick tunnel next to the server:

```bash
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a `https://something.trycloudflare.com` address. Open that address yourself, host the game from it, and send your friend the invite link the lobby shows. The address changes each time you start the tunnel.

**Always-on hosting:** deploy this folder to any Node host that supports WebSockets, such as Render, Railway or Fly.io. Use `npm start` as the start command. The server reads the `PORT` environment variable.

## How it works

- `server.js`: serves the game and runs every room's round of freeze tag: it picks the taggers, decides who gets frozen and unfrozen, and who wins.
- `public/client.js`: lobby screens, the top-down view (2D canvas), line-of-sight lighting, the clay man and woman characters, heartbeat sound, HUD, keyboard/touch input. Vision settings (`R_NEAR`, `R_FAR`, `CONE`) are at the top. Your own movement runs locally so it feels instant, and the server checks it so nobody can walk through walls or teleport.
- `public/view3d.js`: the first- and third-person views (with the characters modelled in clay), drawn with Three.js (served from `node_modules`, so run `npm install`). It only loads when someone picks a 3D view.
- `public/clay.js`: the clay look used by the Office in 3D: rounded, slightly lumpy shapes, a matte clay material with dents and fingerprints, and soft contact shadows (ambient occlusion, skipped on phones). `public/office3d.js` builds the clay office with it.
- `public/shared.js`: map generation (rooms, hallways and furniture), pathfinding and collision, used by both sides.

Gameplay settings (speeds, tag and unfreeze distances, head start, round lengths) are at the top of `public/shared.js`.
