# Keybound

Online freeze tag in the dark for 2–12 players, each on their own device (PC or phone).
Everyone has a headlight, and walls block it, so you only see what's in your line of sight.

## How to play

- At the start of each round, players are picked at random to be **IT** (taggers): 1 for 2–6 players, 2 for 7–12. Everyone else is a **runner**. Everyone plays as a clay man or woman (pick one in the lobby).
- Runners get a 5-second head start. Then a tagger who catches up to a runner and **left-clicks** **freezes** them, and frozen runners can't move.
- A free runner who gets next to a frozen one and **left-clicks** **unfreezes** them. They can't be tagged for 2 seconds afterwards.
- **Taggers win** if every runner is frozen before time runs out. **Runners win** if at least one is still free when the timer ends.
- **On your own?** If you're the only one in the room, the button says **Explore the map**: you walk around the chosen map with no tagger and no clock. Press **L** or the **← Lobby** button to go back.
- The host picks the map and the round length (1, 2, 3, 5 or 8 minutes) in the lobby. "Play again" picks new taggers.
- **Noise traps** (broken glass, tin cans, bubble wrap, squeaky toys, twigs, leaves... depending on the map) are scattered around. A runner who steps on one makes a noise that every tagger within 14 tiles hears, and it flashes on their screen and minimap. You only see a trap when it's in your light, so watch where you step, or **jump** over it (Space): in the air you don't set it off. A trap goes quiet for 8 seconds after it goes off.
- Press **Space** to jump (double-tap on a phone). Everyone sees you hop.
- Runners always see where the other runners are (frozen ones are marked with ❄), so they can go and rescue them. Taggers only show up when you can actually see them. When a tagger gets close you hear a heartbeat and the chase music.

The rules' numbers (tagger speed, tag and unfreeze reach, head start, round lengths...) are at the top of `public/shared.js`.

## Hide clay (the other game mode)

The host can switch the lobby's **Game mode** from Freeze tag to **Hide clay**:

1. **Sculpt (2 minutes).** Everyone gets a lump of clay on a turntable and shapes it however they like. **Grab** drags bits of clay out (ears, arms, tails), **Pull** and **Push** build it up or press it in, **Smooth** softens it, and **Paint** colors it. **Mirror** makes both sides match. Drag the background to turn the clay; scroll or pinch to zoom. Press **I'm done** when you're happy (or it's sent when time runs out).
2. **Hide (45 seconds).** Everyone walks the map, and nobody can see anyone else. Press **F** or left-click (on a phone, the round button) to put your sculpture down just in front of you. Press it again to move it.
3. **Hunt (the round length).** Everyone goes back to the start and is shown someone else's sculpture to find. Walk up to it and press **F** (or left-click) to pick it up: that's 100 points, plus up to 150 more the sooner you find it. Then you're given another one to find. Your own sculpture earns you a point for every second it stays hidden.

The round ends when time runs out or every sculpture has been found; the highest score wins. The timings and points are at the top of `public/shared.js`.

## Arena fights (the third game mode)

Pick **Arena fights** as the lobby's game mode.

- **Make your fighter** (the button in the lobby): the **character editor**. A green block skeleton stands in a T-pose on a round stand: a head, a torso, hips, and on each side an upper arm (shoulder to elbow), a forearm (elbow to hand), a thigh (hip to knee) and a shin (knee to foot). **Drag body parts** onto it: a head, a snout, a neck, a chest, a belly, a pelvis, upper arms, forearms, hands, claw hands, thighs, shins, feet, claw feet and ball joints. Each one goes onto its own bone (the left or right one, whichever side you drop it on; with Mirror on, the other side gets one too), sized to fit, and the Size slider makes it thicker or thinner. The **proportion** sliders make the arms, legs and body longer or shorter, and everything on them stretches to fit, so you can make a lanky long-limbed creature or a stubby one. Or **drag any shape** from the palette onto it (or click a shape, then click the character): flat and tall boxes, rounded boxes, cylinders, balls, cones, capsules and rings, plus curly hair, long hair, eyes and horns (up to 90 shapes). Each shape sticks to the body part you drop it on and moves with it; a shape dropped on a bone lines up along it (a capsule on the upper arm becomes the upper arm). Shapes don't blend: each part keeps its own shape, with a clean edge where it meets the next, like a jointed figure, and the body bends at the joints. Pick a color, a **Size**, **Mirror** (a matching shape on the other side: make one arm, get both) and **Subtract** (cut away instead of adding); these apply to the next shape, or to the shape you've picked. Click a shape on the character to pick it, then drag its handles to move, turn or stretch it. Undo with Ctrl+Z. The preview buttons play your fighter's moves. Fighters move like real fighters: they bounce lightly in their guard and breathe, walk with their hands up while the hips sway and the shoulders turn against them, and every move has a wind-up, a strike timed to land with the hit, and a recovery (jabs come from the left and right hands in turn, each winding back before the shoulder drives it out; a hook kick raises the leg out to the side, straightens it past the target and whips the heel back across; a jump tucks the knees high; a knock-out staggers back and falls flat). Poses ease into each other instead of snapping. A fighter with no shapes fights as the block skeleton. The **Character abilities** tab picks your **special move**:
  - **Kamehameha**: cup your hands at your side, twisted back, as a blue ball of energy grows between them, then thrust both palms forward and fire a blue beam. Quick to charge.
  - **Final Flash**: fling your arms wide with a yellow ball in each palm, then slam your palms together in front and fire a huge yellow beam. Slower to charge, but wider and stronger.

  You stand still while you charge and fire, and a hit while you're charging stops it. A beam shoots straight ahead for a moment and hits once; **jump** over it to dodge it.

  Your fighter is saved on your device. Fighters are normal smooth-shaded 3D characters (not clay), in every view: the top-down view plays pictures of your 3D fighter, taken in every move.
- **Try it out** (in the editor, or next to Make your fighter in the lobby): your fighter, as it is right now, in a plain white room with a training dummy. Walk with WASD, jab (J or left-click, left and right hands in turn), hook kick (K or right-click), block (Shift), dodge (C), jump (Space) and use your special (F; its meter fills by itself here). The dummy shows the damage of each hit and gets back up after a knock-out. Esc (or Back to editor) goes back to building.
- Everyone goes into a **knockout bracket** in a random order (with an odd number of players, someone gets a bye). One match at a time: the two fighters go into the ring (a plain white room with a low barrier around it) and everyone else watches from the stands. A match is **best of 3 rounds**; a round lasts 60 seconds and ends with a knock-out, or when time runs out (then whoever has more health takes it). The winner goes through, until one **champion** is left.
- **Fighting:** you always face your opponent.
  - **Jab** (left-click or J): quick, 7 damage; left and right hands in turn.
  - **Hook kick** (right-click or K): slower, 14 damage, knocks them back.
  - **Block** (hold Shift): you take only a quarter of the damage from the front, but you move slowly.
  - **Dodge** (C): a quick roll that nothing can hit.
  - **Special** (F): when your meter is full. Dealing and taking hits fills it.
  - **Jump** (Space): fighters jump high (well over a beam), knees tucked.
  - On a phone, use the buttons in the corner (double-tap to jump).

All the fight numbers (damage, reach, speeds, round length) are in `Shared.FIGHT` near the top of `public/shared.js`.

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
- **PC:** WASD or the arrow keys move you. Your headlight points the way you're walking. Left-click to tag or unfreeze. Space jumps.
- **Phone/tablet:** drag anywhere to move. Tap the round **TAG** / **UNFREEZE** button to tag or unfreeze; it lights up when someone's in reach. Double-tap to jump.

**First / third person**
- **PC:** click the game to look around with the mouse (Esc frees the mouse). W/S walk, A/D step sideways, ←/→ or Q/E turn. Left-click to tag or unfreeze. Space jumps.
- **Phone/tablet:** drag up/down to walk, left/right to turn. Tap the round button to tag or unfreeze. Double-tap to jump.

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
- `public/fighter.js`, `public/fighter3d.js`, `public/fightersprite.js` and `public/fightui.js`: arena fights: the saved fighter, building a fighter from its shapes on a skeleton (`public/sdfmesh.js` joins the shapes into one skinned body) (with a pose for every move), its pictures for the top-down view, and the character editor; `public/practice.js` is the Try it out room. `public/arena2d.js` and `public/arena3d.js` draw the arena.
- `public/sculpt.js`: the hide-clay sculpting screen; `public/clayobj.js` turns a sculpture's data into a clay model (and little pictures of it for the top-down view).
- `public/shared.js`: map generation (rooms, hallways and furniture), pathfinding and collision, used by both sides. Maps with two real floors (the library) have a second grid for the floor above and walkable staircases (`ramps`); everyone has a floor, and you're upstairs once you're past halfway up a staircase.

Gameplay settings (speeds, tag and unfreeze distances, head start, round lengths) are at the top of `public/shared.js`.
