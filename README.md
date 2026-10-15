# Keybound

Online freeze tag in the dark for 2–12 players, each on their own device (PC or phone).
Everyone has a headlight, and walls block it, so you only see what's in your line of sight.

## How to play

- At the start of each round, players are picked at random to be **IT** (taggers): 1 for 2–6 players, 2 for 7–12. Everyone else is a **runner**. Everyone plays as a clay man or woman (pick one in the lobby).
- Runners get a 5-second head start. Then a tagger who touches a runner **freezes** them, and frozen runners can't move.
- A free runner who stands next to a frozen one for 0.75 seconds **unfreezes** them. They can't be tagged for 2 seconds afterwards.
- **Taggers win** if every runner is frozen before time runs out. **Runners win** if at least one is still free when the timer ends.
- The host picks the map and the round length (1, 2, 3, 5 or 8 minutes) in the lobby. "Play again" picks new taggers.
- **Noise traps** (broken glass, tin cans, bubble wrap, squeaky toys, twigs, leaves... depending on the map) are scattered around. A runner who steps on one makes a noise that every tagger within 14 tiles hears, and it flashes on their screen and minimap. You only see a trap when it's in your light, so watch where you step, or **jump** over it (Space): in the air you don't set it off. A trap goes quiet for 8 seconds after it goes off.
- Press **Space** to jump (double-tap on a phone). Everyone sees you hop.
- Runners always see where the other runners are (frozen ones are marked with ❄), so they can go and rescue them. Taggers only show up when you can actually see them. When a tagger gets close you hear a heartbeat and the chase music.

The rules' numbers (tagger speed, unfreeze time, head start, round lengths...) are at the top of `public/shared.js`.

## Maps

The host picks the map in the lobby:

- **Building:** a single floor of rooms, hallways and doorways, different every game.
- **Forest:** a forest at night. Runners start at a campfire; winding paths lead off through the trees. Trees block your way and your light; bushes, rocks, logs and the pond (cross it by the bridge) only block your way. There's an abandoned cabin in the woods.
- **Office (lights on):** a bright open-plan office floor based on a real floor plan: glass-walled meeting rooms, a staff lounge, a collaboration lounge with yellow sofas by the windows, desk pods, toilets, a copy room and a server room. Runners start in the elevator lobby. The lights are on, so you can see all around you, but walls still block your view (glass walls don't). In the 3D views the whole office, characters included, is made of clay.
- **Mall (daytime):** a sunny shopping mall. A wide promenade under a glass skylight runs from the entrance doors, with a fountain, benches, planters, kiosk carts and an escalator (closed). Nine shops with glass fronts line both sides (fashion, shoes, toys, electronics, books, a café, sports, a pharmacy and a jeweller), some with back doors onto staff corridors that loop behind them. There's a food court with stalls, and toilets off a staff passage. The lights are on, as in the office, and in the 3D views it's all clay.
- **Library (2 floors):** a big sunny library with two real floors, one above the other. A grand red-carpeted staircase climbs up the middle of the atrium, and plainer ones climb by each end wall: walk up them to go upstairs, no teleporting. The atrium is open all the way up to a glass roof, and upstairs a gallery with a railing runs round it, so you can look down into the atrium (and be seen from it). Downstairs: the lobby and front desk (runners start here), reading tables, a reading room with a fireplace, the fiction and science stacks, newspapers and computers, a children's corner with a play castle, and a café. Upstairs: a study hall with carrels and a globe, the history stacks, the rare-books archive, a computer lab, group-study tables, and an exhibition with a clay dinosaur. You can only tag, rescue or hear someone on your own floor (or near you on a staircase). In the 3D views it's all clay.
- **Apartment (3 floors):** a hallway down each floor with flats on both sides and a stairwell at each end. Walk onto a staircase (▲ up, ▼ down) to change floors. Runners start on the top floor, and everyone can chase or flee up and down the stairs.

## Views

Each player picks their own view in the lobby: **Top-down**, **Third person** or **First person**. Press **V** during a game to switch. Press **M** to turn the background music (`public/music.mp3`) on or off. When a tagger is close behind you, a chase sound (`public/chase.mp3`) plays, louder the closer they get.

## Controls

**Top-down**
- **PC:** WASD or the arrow keys move you. Your headlight points the way you're walking. Space jumps.
- **Phone/tablet:** drag anywhere to move.

**First / third person**
- **PC:** click the game to look around with the mouse (Esc frees the mouse). W/S walk, A/D step sideways, ←/→ or Q/E turn, Space jumps.
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

- `server.js`: serves the game and runs every room's round of freeze tag: it picks the taggers, decides who gets frozen and unfrozen, and who wins.
- `public/client.js`: lobby screens, the top-down view (2D canvas), line-of-sight lighting, the clay man and woman characters, heartbeat sound, HUD, keyboard/touch input. Vision settings (`R_NEAR`, `R_FAR`, `CONE`) are at the top. Your own movement runs locally so it feels instant, and the server checks it so nobody can walk through walls or teleport.
- `public/view3d.js`: the first- and third-person views (with the characters modelled in clay), drawn with Three.js (served from `node_modules`, so run `npm install`). It only loads when someone picks a 3D view.
- `public/clay.js`: the clay look used by the Office and the Mall in 3D: rounded, slightly lumpy shapes, a matte clay material with dents and fingerprints, soft contact shadows (ambient occlusion, skipped on phones), and helpers for placing pieces and building walls. `public/office3d.js` and `public/mall3d.js` build the two clay maps with it (`office2d.js` and `mall2d.js` draw them top-down). The library is the same: `library3d.js` and `library2d.js`.
- `public/shared.js`: map generation (rooms, hallways and furniture), pathfinding and collision, used by both sides. Maps with two real floors (the library) have a second grid for the floor above and walkable staircases (`ramps`); everyone has a floor, and you're upstairs once you're past halfway up a staircase.

Gameplay settings (speeds, tag and unfreeze distances, head start, round lengths) are at the top of `public/shared.js`.
