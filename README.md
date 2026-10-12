# Keybound

Top-down online co-op escape game for 1–4 players, each on their own device (PC or phone).
You explore a dark building with a headlight. Walls block your light, so you only see what's in your line of sight.

## Views

Each player picks their own view in the lobby: **Top-down**, **Third person** or **First person**. Press **V** during a game to switch. Press **M** to turn the background music (`public/music.mp3`) on or off. When the entity is hunting you, a chase sound (`public/chase.mp3`) plays, louder the closer it gets.

## Controls

**Top-down**
- **PC:** WASD or the arrow keys move you. Your headlight points the way you're walking.
- **Phone/tablet:** drag anywhere to move.

**First / third person**
- **PC:** click the game to look around with the mouse (Esc frees the mouse). W/S walk, A/D step sideways, ←/→ or Q/E turn.
- **Phone/tablet:** drag up/down to walk, left/right to turn.

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

- `server.js`: serves the game and runs every room. It decides where keys, the entity, safe zones, catches and the gate are. Each player receives a personal update with only **their own** key, and the entity only when it's inside their light.
- `public/client.js`: lobby screens, the top-down view (2D canvas), line-of-sight lighting, the carrot-man characters, heartbeat sound, HUD, keyboard/touch input. Vision settings (`R_NEAR`, `R_FAR`, `CONE`) are at the top. Your own movement runs locally so it feels instant, and the server checks it so nobody can walk through walls or teleport.
- `public/view3d.js`: the first- and third-person views, drawn with Three.js (served from `node_modules`, so run `npm install`). It only loads when someone picks a 3D view.
- `public/shared.js`: map generation (rooms, hallways and furniture), pathfinding and collision, used by both sides.

Gameplay settings (speeds, vision radius, lives, safe-zone timer) are at the top of `public/shared.js`.
