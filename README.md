# Pixel Panic

Build a complete 2D top-down pixel-art survival horror game called "TXT: FLOOR ZERO" (subtitle: "Zombie Survival Game") using only HTML, CSS, and JavaScript. Use an HTML5 Canvas for the game. Put everything in 3 files: index.html, style.css, game.js. No external libraries and no image files. Draw all pixel-art characters, zombies, walls, and items with code (fillRect) so the game runs by just opening index.html. Use "TXT: FLOOR ZERO" as the page title, the main menu title, and the game complete screen title.



=== STORY ===

Yeonjun wakes up inside a zombie-infested 5-level building (Ground Floor + Floors 1-4, plus a Rooftop). His four friends are trapped inside. He has to rescue them and escape alive. Yeonjun is the ONLY playable character the whole game.



=== CHARACTERS (pixel-art look, easy to tell apart) ===

- Yeonjun: dark burgundy hair, black jacket, dark pants, red inner shirt/scarf (red accent)

- Taehyun: chestnut brown hair, beige/brown jacket (gold accent)

- Beomgyu: dark blue-black hair, dark green oversized jacket (green accent)

- Soobin: black hair, navy/black hoodie (blue accent)

- Huening Kai: white/platinum hair, light gray/white jacket (ice blue accent)

- Zombies: clearly GREEN skin (bright zombie green, e.g. #4CAF50 / #6FBF3A with darker green shading), torn clothes, red eyes. All normal zombies must look obviously green so they stand out in the dark.

- Zombie Kai: looks like Kai (white hair) but with pale sickly-green skin, glowing red eyes, and blood stains. He is bigger and faster than normal zombies.



=== CONTROLS ===

- Move: WASD or Arrow Keys

- Interact (doors, items, talking): E

- Use stun device: SPACE

- Pause: P or ESC



=== HEALTH SYSTEM ===

- 3 hearts (❤️❤️❤️). A zombie touch removes 1 heart.

- After a hit, Yeonjun gets about 1.5 seconds of invincibility (blinking) so he can run away.

- Hearts reach 0 -> show "YOU DIED - The infection got you." with buttons [TRY AGAIN] and [MAIN MENU]. Try Again restarts the current floor.



=== HUD (always visible) ===

Current floor name, hearts, stun device charges (e.g. "⚡ STUN DEVICE: 3"), and the current objective (e.g. "Find Soobin").



=== THE COLD STORAGE SAFE ROOM (important rule) ===

It is a refrigerated room on the Ground Floor. Zombies can never enter it. When Yeonjun rescues a friend, that friend does NOT follow him. A special security door opens, the friend walks in, and the door closes. Show the message: "[NAME] HAS BEEN MOVED TO THE COLD SAFE ROOM." Then Yeonjun is alone again. Do not make friends AI followers (except Kai in the escort section at the end).



=== GAME FLOW ===



MAIN MENU: Title "TXT: FLOOR ZERO" with the subtitle "Zombie Survival Game", a spooky flickering-light effect, buttons [START GAME] and [CONTROLS].



PROLOGUE - GROUND FLOOR:

- Yeonjun wakes up. Flickering lights, only emergency lights work. Dialogue: "Where... am I?"

- He finds his phone: "No signal."

- BANG sounds from a nearby door. A green zombie appears. This teaches movement. The player escapes it.

- Yeonjun finds a building map: Floor 1 -> Taehyun, Floor 2 -> Beomgyu, Floor 3 -> Soobin, Floor 4 -> Kai, "SAFE ROOM - GROUND FLOOR".

- Yeonjun: "They're all here..." New objective: RESCUE EVERYONE.

- Ground floor exploration: reception desk, storage room, broken elevator, emergency supplies, locked cabinets, scattered documents, a few green zombies.

- Hidden item: a locked maintenance box (needs a key found in the storage room). Inside is the ⚡ EMERGENCY STUN DEVICE with 5 charges. The player doesn't yet know how important it is.

- Stairs lead to Floor 1.



FLOOR 1 - TAEHYUN (maze, easy):

- A maze of walls, rooms, dead ends, and corridors. Few green zombies (this is the learning level).

- Player must find keys, avoid zombies, and find the locked room with Taehyun.

- Dialogue: Taehyun "Yeonjun?" / Yeonjun "Taehyun! Are you okay?" / Taehyun "I'm fine. But you need to leave." / Yeonjun "Not without you."

- The door opens, "EMERGENCY EVACUATION ROUTE ACTIVATED", a security door opens, Taehyun asks "What's that?", Yeonjun says "I don't know." Taehyun enters, the door closes, and the message "TAEHYUN HAS BEEN MOVED TO THE COLD SAFE ROOM." appears.



FLOOR 2 - BEOMGYU (riddle):

- A massive security door with a password keypad. The wall text says:

  "I have no mouth, but I can speak. I have no ears, but I can hear. I have no body, but I come alive with wind."

- Answer: ECHO (the player types letters on a keypad UI).

- Correct: "ACCESS GRANTED". Wrong: "ACCESS DENIED". After 3 wrong attempts the alarm goes off and extra green zombies spawn nearby.

- Beomgyu: "I thought nobody was coming." / Yeonjun: "We're getting out." Then the same emergency system sends him to the Cold Safe Room.



FLOOR 3 - SOOBIN (first real combat):

- Starts silent, then many green zombies appear.

- The game tells the player: "Press SPACE to use the stun device."

- SPACE fires a short-range stun/kill pulse in front of Yeonjun and uses 1 charge. Add a cooldown, so no spamming. Zombies are killed or stunned for a few seconds.

- Hidden battery pickups around the floor add more charges. The player must dodge, conserve charges, and choose when to attack.

- After the zombie area, Yeonjun finds Soobin (injured). Soobin: "Don't go upstairs." / Yeonjun: "Kai is there." / Soobin: "I know." (pause) "That's the problem."

- Before Yeonjun can ask, the emergency system sends Soobin to the Cold Safe Room.



FLOOR 4 - KAI (boss fight):

- Different feel: no crowd, no maze, no puzzle. Silent, flickering lights, blood stains, empty hallway.

- Yeonjun sees white-haired Kai. Yeonjun: "Kai!" / Kai: "Yeonjun..." / Kai: "You shouldn't have come." Then Kai ATTACKS.

- BOSS: Zombie Kai is faster than normal zombies, chases Yeonjun, and attacks repeatedly. Give him a health bar, and he needs several stun hits. He pauses briefly after each stun. Give him a simple pattern: chase, dash, short rest. Stun charges are limited, but a few pickups spawn in the arena.

- When defeated: "KAI DEFEATED", fade to black. Yeonjun: "Kai..."



ROOFTOP SECRET:

- Behind where Zombie Kai appeared, a hidden staircase appears with a sign "ROOFTOP ACCESS" (no floor number). Yeonjun climbs.

- The rooftop is dark with one small locked room. Inside is white-haired Kai, weak but alive.

- Yeonjun: "...Kai?" / Kai: "Yeonjun?" / Yeonjun: "Then... who did I just..." / Kai: "I don't know."

- The player realizes the Kai on Floor 4 was NOT the real Kai. Keep the explanation simple: the zombies infect and transform people, and that creature had already turned but looked like Kai. Soobin knew something was wrong with Floor 4, which is why he warned Yeonjun.



ESCORT SECTION (short and simple):

- Real Kai is weak and follows Yeonjun slowly down through the floors. Very few green zombies remain because the route was already cleared. Add a couple of easy zombies so it isn't empty. If Yeonjun gets far ahead, show "Wait for Kai".

- They reach the Ground Floor and the Cold Storage Safe Room.



FINAL - SAFE ROOM:

- Taehyun, Beomgyu, and Soobin are inside waiting. Kai enters and the door closes.

- Text: "SAFE ROOM SEALED / Temperature: LOW / ZOMBIE ACCESS: IMPOSSIBLE / STATUS: SAFE".

- Everyone is together. There is an EMERGENCY EXIT door inside. Taehyun finds the control panel: "If this works..." He presses it, BEEP, the door unlocks, and everyone walks toward it. Yeonjun looks back at the building where the green zombies are still wandering but can't reach them.



ENDING SCENE:

- Early morning, the sky slowly gets brighter. No zombies, alarms, locked doors, puzzles, or darkness. Just silence.

- Taehyun: "We actually made it." / Beomgyu: "Don't say that yet." / Soobin: "Why?" Beomgyu points behind them. The building is still standing, then the doors close. Nothing else happens. No extra villain, no one watching them, no second conspiracy. Just the five of them walking away.

- Show "GAME COMPLETE" with the title "TXT: FLOOR ZERO" and a [PLAY AGAIN] button.



=== TECHNICAL REQUIREMENTS ===

- Canvas around 960x640, scaled with CSS to fit the screen, with image-rendering: pixelated.

- Use a game loop with requestAnimationFrame and delta time.

- Each floor is a tile map (2D array) with walls, floors, doors, stairs, and items.

- Collision detection for walls and doors.

- Simple zombie AI: wander, then chase when the player is within range, slow speed. Zombies can't walk through walls.

- Dialogue box system at the bottom of the screen with a speaker name, typewriter text, and E to continue.

- Darkness/flashlight effect: dark overlay with a light circle around Yeonjun, plus flickering lights. Make sure the green zombies are still clearly visible inside the light.

- Simple sound effects using the Web Audio API (hit, stun zap, door, alarm) with a mute button. No audio files.

- Game states: menu, playing, dialogue, paused, gameover, ending.

- Smooth fade transitions between floors.

- Clean, commented, beginner-friendly code split into sections (player, zombies, maps, UI, dialogue, boss).

- Dark horror UI style in CSS: dark background, pixel font fallback (monospace), red accent glow on buttons, and a green glow on the "TXT: FLOOR ZERO" title to match the zombies.



=== OUTPUT ===

Give me the full code of all 3 files, ready to run. Do not skip any part and do not use placeholders like "add more here".

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7c73d913-d85f-4836-8531-ebdb0cdbb3cc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
