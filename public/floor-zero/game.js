/* =========================================================================
   TXT: FLOOR ZERO — Zombie Survival Game
   A 2D top-down pixel-art survival horror game.
   Pure HTML5 Canvas + JavaScript. No libraries, no image files.
   Everything you see is drawn with fillRect().

   SECTIONS
     1.  Setup & constants
     2.  Audio (Web Audio API sound effects)
     3.  Input
     4.  Palettes & pixel-art drawing (characters, zombies)
     5.  Maps (tile maps for every floor)
     6.  Tiles (drawing + collision)
     7.  Game state
     8.  Script / dialogue system (cutscenes, typewriter text)
     9.  Player
     10. Zombies
     11. Boss (Zombie Kai)
     12. Stun device
     13. Level loading & floor logic (story)
     14. Escort section & final safe room
     15. Ending scene
     16. Rendering (world, darkness, HUD, dialogue)
     17. UI overlays (menu, pause, game over, keypad)
     18. Main loop
   ========================================================================= */
'use strict';

/* ======================= 1. SETUP & CONSTANTS ========================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const TILE = 32, COLS = 30, ROWS = 20;
const W = canvas.width, H = canvas.height; // 960 x 640
ctx.imageSmoothingEnabled = false;

// Off-screen canvases: one for the static tile map, one for the darkness
const levelCanvas = document.createElement('canvas');
levelCanvas.width = W; levelCanvas.height = H;
const lctx = levelCanvas.getContext('2d');
const darkCanvas = document.createElement('canvas');
darkCanvas.width = W; darkCanvas.height = H;
const dctx = darkCanvas.getContext('2d');

// Small helpers
const tc = (n) => n * TILE + TILE / 2;            // tile index -> pixel center
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function hash(x, y) {                              // stable pseudo-random per tile
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/* ======================= 2. AUDIO ===================================== */
let actx = null;
let muted = false;
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
// Play a simple tone. f2 = slide to this frequency.
function tone(f, dur, type = 'square', vol = 0.15, f2 = null, delay = 0) {
  if (muted) return;
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
// Play a burst of noise (bangs, hits)
function noise(dur, vol = 0.3, delay = 0, freq = 800) {
  if (muted) return;
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const filt = a.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(a.destination);
  src.start(t); src.stop(t + dur + 0.05);
}
const sfx = {
  hit:    () => { tone(200, 0.3, 'sawtooth', 0.2, 50); noise(0.2, 0.25); },
  zap:    () => { tone(1400, 0.25, 'square', 0.1, 180); tone(500, 0.3, 'sawtooth', 0.07, 2000); noise(0.15, 0.12, 0, 4000); },
  door:   () => { tone(90, 0.4, 'triangle', 0.25, 50); noise(0.35, 0.12, 0, 500); },
  alarm:  () => { for (let i = 0; i < 8; i++) tone(i % 2 ? 880 : 620, 0.22, 'square', 0.1, null, i * 0.22); },
  evac:   () => { for (let i = 0; i < 4; i++) tone(440 + i * 110, 0.18, 'triangle', 0.15, null, i * 0.2); },
  bang:   () => { noise(0.3, 0.6, 0, 400); tone(70, 0.35, 'sine', 0.4, 30); },
  pickup: () => { tone(660, 0.08, 'square', 0.1); tone(990, 0.14, 'square', 0.1, null, 0.08); },
  beep:   () => tone(1000, 0.25, 'sine', 0.22),
  grant:  () => { tone(700, 0.12, 'square', 0.12); tone(1050, 0.25, 'square', 0.12, null, 0.12); },
  deny:   () => { tone(160, 0.45, 'square', 0.15); },
  blip:   () => tone(540, 0.025, 'square', 0.025),
  roar:   () => { tone(130, 0.7, 'sawtooth', 0.22, 45); noise(0.5, 0.18, 0, 300); },
  groan:  () => { tone(rand(90, 130), 0.9, 'sawtooth', 0.06, 60); },
  empty:  () => tone(180, 0.12, 'square', 0.08),
  die:    () => { tone(300, 1.4, 'sawtooth', 0.2, 35); noise(1, 0.15, 0, 300); },
  kill:   () => { noise(0.2, 0.2, 0, 1200); tone(300, 0.2, 'square', 0.06, 80); },
};

/* ======================= 3. INPUT ===================================== */
const keys = new Set();     // keys currently held (up/down/left/right)
const pressed = new Set();  // keys pressed this frame (e, space, pause, enter)
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyE: 'e', Space: 'space', KeyP: 'pause', Escape: 'pause', Enter: 'enter',
};
window.addEventListener('keydown', (e) => {
  audio();
  // Keypad typing has its own keyboard handling
  if (state === 'keypad') {
    if (/^Key[A-Z]$/.test(e.code)) kpPress(e.code.slice(3));
    else if (e.code === 'Backspace') kpDelete();
    else if (e.code === 'Enter') kpSubmit();
    else if (e.code === 'Escape') closeKeypad();
    e.preventDefault();
    return;
  }
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  keys.add(k);
  if (!e.repeat) pressed.add(k);
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
window.addEventListener('blur', () => keys.clear());
// Clicking / tapping the canvas continues dialogue
canvas.addEventListener('pointerdown', () => { audio(); if (dialog) sayAdvance = true; });

// Touch buttons
document.querySelectorAll('#touch button').forEach((b) => {
  const k = b.dataset.k;
  const down = (e) => { e.preventDefault(); audio(); keys.add(k); pressed.add(k); };
  const up = (e) => { e.preventDefault(); keys.delete(k); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', up);
  b.addEventListener('pointercancel', up);
});

/* ======================= 4. PALETTES & PIXEL ART ====================== */
const PAL = {
  yeonjun: { hair: '#5a1424', hair2: '#3a0a16', skin: '#f1c9a5', jacket: '#141418', jacket2: '#2a2a33', pants: '#1d1d25', accent: '#d0202a', eye: '#1a0f0f' },
  taehyun: { hair: '#7b4320', hair2: '#55290f', skin: '#f1c9a5', jacket: '#b89a6e', jacket2: '#8f7550', pants: '#3a3028', accent: '#e0b030', eye: '#1a0f0f' },
  beomgyu: { hair: '#151b30', hair2: '#0a0e1c', skin: '#f0c8a2', jacket: '#2f4f2a', jacket2: '#203a1c', pants: '#2a2a2a', accent: '#4fd06a', eye: '#1a0f0f' },
  soobin:  { hair: '#0b0b0e', hair2: '#000000', skin: '#f3cfae', jacket: '#1b2444', jacket2: '#111830', pants: '#15151c', accent: '#3a7bff', eye: '#1a0f0f' },
  kai:     { hair: '#eef0f5', hair2: '#c3c8d2', skin: '#f3d3b8', jacket: '#cfd2d8', jacket2: '#a5a9b2', pants: '#4a4d55', accent: '#9fe4ff', eye: '#1a0f0f' },
  // Normal zombie: BRIGHT zombie green skin with darker green shading
  zombie:  { hair: '#2b2a17', hair2: '#1a1a0c', skin: '#6FBF3A', skin2: '#3E7D22', jacket: '#5a4d3e', jacket2: '#3c3228', pants: '#34302a', accent: '#7a1c1c', eye: '#ff2020' },
  // Zombie Kai: white hair, pale sickly green skin, red eyes
  zkai:    { hair: '#e8ece0', hair2: '#b5bfae', skin: '#a8c99a', skin2: '#7fa070', jacket: '#b3b7b0', jacket2: '#878b85', pants: '#3e413e', accent: '#8b0000', eye: '#ff1010' },
};
// Speaker name colors in the dialogue box
const SPEAKER_COLOR = {
  YEONJUN: '#ff4d5a', TAEHYUN: '#ffcc44', BEOMGYU: '#5fe07a', SOOBIN: '#5a9bff',
  KAI: '#aee8ff', 'HUENING KAI': '#aee8ff', SYSTEM: '#9fe4ff', 'WALL TEXT': '#ff3b3b',
  'BUILDING MAP': '#e8d9a8', NOTE: '#cccccc', PHONE: '#9fb4ff',
};

/**
 * Draw a pixel-art person. (x, y) is the feet position.
 * p = palette, dir = 'up'|'down'|'left'|'right', frame = 0/1 walk frame.
 * o = { scale, zombie, blood, point, alpha }
 */
function drawPerson(x, y, p, dir, frame, o = {}) {
  const S = o.scale || 2;
  const ox = Math.round(x - 6 * S), oy = Math.round(y - 13 * S);
  const px = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + a * S, oy + b * S, w * S, h * S); };
  const oldAlpha = ctx.globalAlpha;
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(x, y + S, 5 * S, 1.5 * S, 0, 0, Math.PI * 2); ctx.fill();

  // Legs + shoes (walk cycle)
  const f = frame % 2;
  px(3, 10, 2, 3 - f, p.pants); px(7, 10, 2, 2 + f, p.pants);
  px(3, 13 - f, 2, 1, '#0a0a0c'); px(7, 12 + f, 2, 1, '#0a0a0c');

  // Torso / jacket
  px(2, 6, 8, 5, p.jacket);
  px(2, 6, 1, 5, p.jacket2); px(9, 6, 1, 5, p.jacket2); px(2, 10, 8, 1, p.jacket2);
  if (dir !== 'up') { px(5, 6, 2, 4, p.accent); px(4, 6, 4, 1, p.accent); }   // inner shirt / scarf
  else px(4, 6, 4, 1, p.accent);                                              // collar seen from behind

  // Arms
  if (o.zombie) {
    // Zombies reach forward with green hands
    if (dir === 'left') { px(-2, 7, 4, 1, p.jacket2); px(-3, 7, 1, 1, p.skin); }
    else if (dir === 'right') { px(10, 7, 4, 1, p.jacket2); px(14, 7, 1, 1, p.skin); }
    else { px(1, 6, 1, 3, p.jacket2); px(10, 6, 1, 3, p.jacket2); px(1, 9, 1, 1, p.skin); px(10, 9, 1, 1, p.skin); }
    // Torn clothes: green skin shows through holes
    px(3, 8, 1, 1, p.skin); px(8, 9, 1, 1, p.skin); px(6, 10, 1, 1, p.skin2);
    px(2, 10, 1, 1, '#000'); px(9, 7, 1, 1, '#000');
  } else {
    px(1, 6, 1, 4, p.jacket2); px(10, 6, 1, 4, p.jacket2);
    px(1, 10, 1, 1, p.skin); px(10, 10, 1, 1, p.skin);
    if (o.point) { px(-3, 7, 4, 1, p.jacket); px(-4, 7, 1, 1, p.skin); }
  }

  // Head
  px(3, 0, 6, 1, p.hair); px(2, 1, 8, 2, p.hair);
  if (dir === 'up') {
    px(2, 3, 8, 3, p.hair); px(3, 5, 6, 1, p.hair2);
  } else {
    px(3, 3, 6, 3, p.skin);
    if (p.skin2) { px(3, 5, 6, 1, p.skin2); px(8, 3, 1, 2, p.skin2); }
    px(2, 3, 1, 2, p.hair); px(9, 3, 1, 2, p.hair);
    px(3, 2, 2, 1, p.hair2);
    const e = p.eye;
    if (dir === 'down') { px(4, 4, 1, 1, e); px(7, 4, 1, 1, e); }
    else if (dir === 'left') { px(3, 4, 1, 1, e); px(5, 4, 1, 1, e); px(8, 3, 2, 3, p.hair); }
    else { px(6, 4, 1, 1, e); px(8, 4, 1, 1, e); px(2, 3, 2, 3, p.hair); }
    if (o.zombie) px(5, 5, 2, 1, '#2a0a0a');   // open mouth
  }
  // Blood stains
  if (o.blood) {
    px(4, 8, 2, 1, '#8a0f0f'); px(7, 7, 1, 2, '#8a0f0f'); px(3, 11, 1, 1, '#8a0f0f');
    if (dir !== 'up') px(8, 4, 1, 1, '#8a0f0f');
  }
  ctx.globalAlpha = oldAlpha;
}

// Glowing red eyes drawn AFTER the darkness, so zombies are visible in the dark
function drawEyeGlow(x, y, dir, S = 2) {
  if (dir === 'up') return;
  const ox = Math.round(x - 6 * S), oy = Math.round(y - 13 * S);
  let eyes = dir === 'down' ? [4, 7] : dir === 'left' ? [3, 5] : [6, 8];
  for (const ex of eyes) {
    ctx.fillStyle = 'rgba(255,0,0,0.25)';
    ctx.fillRect(ox + ex * S - S, oy + 4 * S - S, S * 3, S * 3);
    ctx.fillStyle = '#ff3030';
    ctx.fillRect(ox + ex * S, oy + 4 * S, S, S);
  }
}

/* ======================= 5. MAPS ====================================== */
/*
  Tile legend:
  #  wall              .  floor            C  cold storage floor (safe room)
  p  player start      f  friend position  z  zombie spawn
  D  door (press E)    d  open door        L  locked door (needs a key)
  G  security door     g  open security    V  keypad vault door
  U  stairs up         H  hidden stairs    Y  revealed rooftop stairs
  k  key               b  battery          h  phone       m  building map
  x  maintenance box   y  opened box       o  document    s  emergency supplies
  r  reception desk    e  broken elevator  c  cabinet / vent
  n  keypad            ~  blood stain      Q  banging door
  X  emergency exit    O  exit (open)      P  control panel
*/
const LEVELS = {
  GF: {
    name: 'GROUND FLOOR', dark: 0.86, flickChance: 0.25,
    theme: { floor: '#25272d', floor2: '#1c1e23', wall: '#3a3e48', top: '#4c5260' },
    lights: [[3.5, 3, 140, '120,200,255'], [15, 7, 90, '255,40,40'], [26, 13, 80, '255,40,40'], [5, 16, 80, '255,40,40'], [25, 3, 70, '255,60,40']],
    docs: [
      '"EMERGENCY NOTICE: Infected individuals are hostile. Do NOT let them touch you."',
      '"Maintenance memo: the key for the maintenance box is kept in the STORAGE ROOM."',
      '"Cold Storage is refrigerated and sealed. The infected won\'t go near the cold."',
    ],
    map: [
      '###X#P########################',
      '#CCCCCC#......#..s...#......U#',
      '#CCCCCC#..o...#......#.......#',
      '#CCCCCC#......#..k...#.......#',
      '#CCCCCC#...h..#......#..z....#',
      '#CCCCCC#......###.####.......#',
      '####G###.....................#',
      '#...........................e#',
      '#..p....rrrrr..........~....e#',
      '#.......r...r................#',
      '#.......r.m.r.......###.######',
      '#.......................#....#',
      '#####Q####....o.........#..x.#',
      '#cc......#..............D....#',
      '#........#.....z........#~...#',
      '#..s.....#..............#....#',
      '#........#......cc......######',
      '#...o....#...................#',
      '#ccc.....#......s.....z......#',
      '##############################',
    ],
  },
  F1: {
    name: 'FLOOR 1', dark: 0.86, flickChance: 0.15,
    theme: { floor: '#22261f', floor2: '#1a1d17', wall: '#39432f', top: '#4a5640' },
    lights: [[1.5, 1.5, 80, '255,60,40'], [27, 14, 90, '255,200,80'], [14, 11, 70, '255,40,40'], [7, 16, 70, '255,40,40']],
    docs: [
      '"Floor 1 renovation: temporary walls everywhere. Beware of dead ends."',
      '"Security left the spare keys in the side rooms."',
    ],
    map: [
      '##############################',
      '#p...#.......#......#.....#..#',
      '#.##.#.#####.#.####.#.###.#..#',
      '#.#..#.#...#...#....#...#.#..#',
      '#.#.##.#.#.#####.######.#.#..#',
      '#.#....#.#.....#......#.#....#',
      '#.######.#####.#.####.#.######',
      '#........#...#.#.#..#.#......#',
      '####.###.#.#.#.#.#.##.######.#',
      '#....#k#.#.#...#.#....#....#.#',
      '#.####.#.#.#####.####.#.##.#.#',
      '#......#...#.....#....#..#...#',
      '#.###########.####.####.####L#',
      '#.#.........#....#.#.....#...#',
      '#.#.#######.#.##.#.#.###.#.f.#',
      '#...#..z..#.#..#.#.#.#.#.#...#',
      '###.#..k..#.##.#...#.#.#.##G##',
      '#...L.....#....###.#...#.....#',
      '#U..#.....#..z.....z...#..z..#',
      '##############################',
    ],
  },
  F2: {
    name: 'FLOOR 2', dark: 0.86, flickChance: 0.15,
    theme: { floor: '#25222a', floor2: '#1c1a20', wall: '#423848', top: '#54485c' },
    lights: [[21, 4, 110, '255,40,40'], [4, 15, 80, '255,40,40'], [26, 12, 80, '255,40,40'], [25, 4, 70, '120,255,140']],
    docs: [
      '"New password policy: the answer to the riddle on the wall. — Security"',
      '"Who keeps setting riddles as passwords?! Hint from IT: listen in an empty room."',
    ],
    map: [
      '##############################',
      '#.......#.............#......#',
      '#.p.....#.....o.......#..f...#',
      '#.......#............n#......#',
      '#.......#.............V......#',
      '#.....................V......#',
      '#.......#.............#......#',
      '####.####.............#......#',
      '#.......#.............#......#',
      '#.......#.....~.......###G####',
      '#.......#....................#',
      '#..z....######.#######.......#',
      '#.......#..........#.........#',
      '#.......#..z.......#....z....#',
      '####.####..........#.........#',
      '#.................~#.........#',
      '#.......#..........####.######',
      '#..z....#...................U#',
      '#.......#........o...........#',
      '##############################',
    ],
  },
  F3: {
    name: 'FLOOR 3', dark: 0.85, flickChance: 0.2,
    theme: { floor: '#26221f', floor2: '#1d1a17', wall: '#4a3a32', top: '#5c4a40' },
    lights: [[3.5, 2, 90, '255,60,40'], [24.5, 2, 100, '120,170,255'], [15, 11, 90, '255,40,40'], [6, 17, 70, '255,40,40'], [24, 15, 80, '255,40,40']],
    docs: [
      '"Spare batteries for the stun devices are scattered around this floor."',
      '"They came up from the stairwell. So many of them..."',
    ],
    map: [
      '##############################',
      '#......#............#...f....#',
      '#..p...#..##....##..#........#',
      '#......#..##....##...........#',
      '#..................b####G#####',
      '#......................#...#.#',
      '#..##........##........#####.#',
      '#..##...b....##..............#',
      '#...........................b#',
      '#......##..........##........#',
      '#......##..........##........#',
      '#............................#',
      '#..##........##........##....#',
      '#..##...b....##........##.b..#',
      '#............................#',
      '#........##.........##.......#',
      '#........##.........##.......#',
      '#.b..........................#',
      '#.....................U......#',
      '##############################',
    ],
  },
  F4: {
    name: 'FLOOR 4', dark: 0.9, flickChance: 0.45,
    theme: { floor: '#2a2020', floor2: '#201818', wall: '#3d2b2b', top: '#4e3838' },
    lights: [[14, 3, 90, '255,30,30'], [4, 12, 60, '255,30,30'], [25, 12, 60, '255,30,30']],
    docs: ['"...it looked exactly like one of us. It wasn\'t."'],
    map: [
      '##############################',
      '##############H###############',
      '#.....~..............~.......#',
      '#............................#',
      '#...##..........~.......##...#',
      '#...##..................##...#',
      '#..........~.................#',
      '#............................#',
      '#....~.......................#',
      '#............................#',
      '#...##..................##...#',
      '#...##......~...........##...#',
      '#............................#',
      '#.....................~......#',
      '#############..###############',
      '#############.~###############',
      '#############..###############',
      '#############..###############',
      '#############p.###############',
      '##############################',
    ],
  },
  ROOF: {
    name: 'ROOFTOP', dark: 0.9, flickChance: 0.05,
    theme: { floor: '#2b2d30', floor2: '#232528', wall: '#565b62', top: '#6b7178' },
    lights: [[23, 5, 70, '200,220,255'], [27, 17, 60, '255,60,40']],
    docs: [],
    map: [
      '##############################',
      '#............................#',
      '#..cc...................cc...#',
      '#...................######...#',
      '#...................#....#...#',
      '#...................#..f.#...#',
      '#...................#....#...#',
      '#......cc...........##D###...#',
      '#............................#',
      '#............................#',
      '#.............cc.............#',
      '#............................#',
      '#...cc.......................#',
      '#.....................cc.....#',
      '#............................#',
      '#............................#',
      '#............................#',
      '#..p.........................#',
      '#............................#',
      '##############################',
    ],
  },
};

/* ======================= 6. TILES ===================================== */
// Tiles nobody can walk through
const SOLID = new Set(['#', 'r', 'e', 'c', 'D', 'L', 'G', 'V', 'Q', 'x', 'y', 'n', 'H', 'X', 'P']);
// Extra tiles that zombies cannot enter (the Cold Safe Room!)
const ZOMBIE_BLOCK = new Set(['C', 'g', 'O']);
// Tiles you can press E on
const INTERACT = new Set(['h', 'm', 'x', 'y', 'o', 's', 'c', 'e', 'r', 'D', 'L', 'G', 'V', 'n', 'X', 'P', 'Q']);

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return '#';
  return game.tiles[y][x];
}
function isSolid(x, y, forZombie) {
  const ch = tileAt(x, y);
  return SOLID.has(ch) || (forZombie && ZOMBIE_BLOCK.has(ch));
}
function setTile(x, y, ch) { game.tiles[y][x] = ch; renderTiles(); }
function findTile(ch) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (game.tiles[y][x] === ch) return { x, y };
  return null;
}

// Draw a single tile into the off-screen level canvas
function drawTile(c, ch, x, y) {
  const X = x * TILE, Y = y * TILE;
  const th = LEVELS[game.level].theme;
  const r = hash(x, y), r2 = hash(y + 7, x + 3);
  const rect = (a, b, w, h, col) => { c.fillStyle = col; c.fillRect(X + a, Y + b, w, h); };

  const floor = () => {
    rect(0, 0, 32, 32, th.floor);
    rect(0, 0, 32, 1, th.floor2); rect(0, 0, 1, 32, th.floor2);
    rect(Math.floor(r * 28), Math.floor(r2 * 28), 2, 2, 'rgba(255,255,255,0.04)');
    if (r > 0.8) rect(Math.floor(r2 * 24), Math.floor(r * 24), 5, 1, 'rgba(0,0,0,0.25)');
  };
  const ice = () => {
    rect(0, 0, 32, 32, '#5b8a9e'); rect(1, 1, 30, 30, '#8fbdd0');
    rect(3, 3, 7, 2, '#c9ebf7'); rect(4 + Math.floor(r * 18), 20, 3, 3, '#d8f2fb');
    rect(14, 10 + Math.floor(r2 * 8), 2, 2, '#b4dcea');
  };
  const wall = () => {
    rect(0, 0, 32, 32, th.wall); rect(0, 0, 32, 8, th.top);
    rect(0, 19, 32, 1, 'rgba(0,0,0,0.3)');
    rect(y % 2 ? 8 : 24, 8, 1, 11, 'rgba(0,0,0,0.3)');
    rect(y % 2 ? 20 : 4, 20, 1, 12, 'rgba(0,0,0,0.3)');
    const below = tileAt(x, y + 1);
    if (!SOLID.has(below)) rect(0, 28, 32, 4, 'rgba(0,0,0,0.5)');
  };
  const door = (col) => {
    rect(0, 0, 32, 32, '#2a1a0c'); rect(3, 2, 26, 30, col);
    rect(6, 5, 9, 10, 'rgba(0,0,0,0.2)'); rect(17, 5, 9, 10, 'rgba(0,0,0,0.2)');
    rect(6, 18, 9, 10, 'rgba(0,0,0,0.2)'); rect(17, 18, 9, 10, 'rgba(0,0,0,0.2)');
    rect(23, 16, 3, 3, '#c9a227');
  };
  const stairs = () => {
    floor();
    for (let i = 0; i < 4; i++) { rect(3, 3 + i * 7, 26, 6, ['#6a6e78', '#585c66', '#474a53', '#363840'][i]); rect(3, 3 + i * 7, 26, 1, '#8a8e98'); }
    c.fillStyle = '#e8e8e8'; c.beginPath(); c.moveTo(X + 16, Y + 6); c.lineTo(X + 22, Y + 13); c.lineTo(X + 10, Y + 13); c.fill();
  };
  const hazard = (top) => {
    for (let i = 0; i < 8; i++) rect(i * 4, top, 4, 4, i % 2 ? '#111' : '#e0b020');
  };

  switch (ch) {
    case '#': case 'H': wall(); break;
    case 'C': ice(); break;
    case '~':
      floor();
      c.fillStyle = '#5a0b0b';
      c.beginPath(); c.arc(X + 12 + r * 6, Y + 14, 7, 0, 7); c.fill();
      c.beginPath(); c.arc(X + 22, Y + 20 + r2 * 4, 4, 0, 7); c.fill();
      rect(6, 22, 3, 3, '#5a0b0b'); rect(24, 6, 2, 2, '#5a0b0b');
      break;
    case 'D': door('#5d3a1c'); break;
    case 'Q': door('#4a2e16'); rect(8, 8, 14, 1, '#140a04'); rect(12, 9, 1, 12, '#140a04'); rect(18, 14, 8, 1, '#140a04'); break;
    case 'L': door('#5d3a1c'); rect(12, 14, 9, 8, '#e0b030'); c.strokeStyle = '#e0b030'; c.lineWidth = 2; c.strokeRect(X + 14, Y + 9, 5, 6); rect(15, 17, 2, 3, '#3a2a00'); break;
    case 'd': floor(); rect(0, 0, 3, 32, '#3a2410'); rect(29, 0, 3, 32, '#3a2410'); break;
    case 'G':
      rect(0, 0, 32, 32, '#59606b'); rect(2, 4, 28, 24, '#6c7480'); hazard(0); hazard(28);
      rect(15, 4, 2, 24, '#40464f');
      if (game.level === 'GF') { c.fillStyle = '#bfefff'; c.font = '14px monospace'; c.textAlign = 'center'; c.fillText('❄', X + 16, Y + 21); }
      break;
    case 'g':
      if (game.level === 'GF') ice(); else floor();
      rect(0, 0, 4, 32, '#59606b'); rect(28, 0, 4, 32, '#59606b');
      for (let i = 0; i < 8; i++) { rect(0, i * 4, 4, 2, i % 2 ? '#111' : '#e0b020'); rect(28, i * 4, 4, 2, i % 2 ? '#111' : '#e0b020'); }
      break;
    case 'V':
      rect(0, 0, 32, 32, '#3e4552'); rect(2, 2, 28, 28, '#4c5464');
      rect(2, 10, 28, 3, '#363c48'); rect(2, 20, 28, 3, '#363c48');
      rect(4, 4, 2, 2, '#8a92a0'); rect(26, 4, 2, 2, '#8a92a0'); rect(4, 26, 2, 2, '#8a92a0'); rect(26, 26, 2, 2, '#8a92a0');
      rect(13, 14, 6, 4, '#ff2020');
      break;
    case 'n':
      wall(); rect(9, 6, 14, 20, '#15171b'); rect(10, 7, 12, 4, '#0b3a1a');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rect(11 + i * 4, 13 + j * 4, 3, 3, '#7a808c');
      rect(20, 7, 2, 2, '#ff2020');
      break;
    case 'U': stairs(); break;
    case 'Y': stairs(); rect(0, 0, 32, 2, '#9fe4ff'); break;
    case 'r': floor(); rect(0, 3, 32, 26, '#4a3019'); rect(0, 3, 32, 6, '#7a5532'); rect(0, 27, 32, 2, '#2a1a0c'); break;
    case 'e':
      rect(0, 0, 32, 32, '#4a505a'); rect(2, 2, 28, 30, '#646c78'); rect(15, 2, 2, 30, '#3a3f47');
      rect(12, 4, 8, 4, '#200'); rect(14, 5, 4, 2, '#ff3030');
      break;
    case 'c':
      floor(); rect(3, 2, 26, 28, '#4d525a'); rect(3, 2, 26, 3, '#6a707a');
      rect(5, 11, 22, 1, '#30343a'); rect(5, 20, 22, 1, '#30343a'); rect(14, 7, 4, 2, '#9aa0aa'); rect(14, 15, 4, 2, '#9aa0aa'); rect(14, 24, 4, 2, '#9aa0aa');
      break;
    case 'k':
      floor(); c.strokeStyle = '#f0c040'; c.lineWidth = 2; c.beginPath(); c.arc(X + 10, Y + 16, 4, 0, 7); c.stroke();
      rect(14, 15, 12, 3, '#f0c040'); rect(22, 18, 2, 3, '#f0c040'); rect(25, 18, 1, 3, '#f0c040');
      break;
    case 'b':
      floor(); rect(10, 8, 12, 18, '#2c2c2c'); rect(13, 6, 6, 2, '#888'); rect(12, 10, 8, 14, '#1a1a1a');
      rect(12, 18, 8, 6, '#40e070'); rect(12, 13, 8, 4, '#40e070');
      rect(15, 11, 2, 5, '#ffe040'); rect(14, 15, 4, 2, '#ffe040');
      break;
    case 'h': floor(); rect(11, 8, 10, 17, '#0d0d0f'); rect(12, 10, 8, 11, '#3a6fa0'); rect(15, 22, 2, 2, '#444'); break;
    case 'm': floor(); rect(6, 8, 20, 16, '#d8caa0'); rect(15, 8, 1, 16, '#b5a67e'); rect(8, 11, 6, 1, '#8a7a50'); rect(18, 14, 6, 1, '#8a7a50'); rect(8, 17, 5, 1, '#8a7a50'); rect(20, 18, 3, 3, '#c02020'); break;
    case 'x': floor(); rect(5, 6, 22, 20, '#6a6f78'); rect(5, 6, 22, 4, '#8a909a'); rect(5, 14, 22, 2, '#e0b020'); rect(14, 18, 5, 5, '#e0b030'); break;
    case 'y': floor(); rect(5, 6, 22, 20, '#4a4f58'); rect(7, 10, 18, 14, '#15171a'); rect(5, 2, 22, 4, '#8a909a'); break;
    case 'o': floor(); rect(9, 10, 13, 15, '#d9d9d0'); rect(11, 13, 9, 1, '#888'); rect(11, 16, 9, 1, '#888'); rect(11, 19, 6, 1, '#888'); break;
    case 's': floor(); rect(7, 9, 18, 15, '#e8e8e8'); rect(7, 9, 18, 3, '#c0c0c0'); rect(14, 13, 4, 10, '#d01818'); rect(11, 16, 10, 4, '#d01818'); break;
    case 'X': rect(0, 0, 32, 32, '#2c3a2c'); rect(3, 4, 26, 28, '#3e4e3e'); rect(6, 1, 20, 7, '#200'); c.fillStyle = '#ff3030'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('EXIT', X + 16, Y + 7); break;
    case 'O': ice(); rect(0, 0, 32, 4, '#2c3a2c'); rect(6, 0, 20, 7, '#031'); c.fillStyle = '#40ff70'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('EXIT', X + 16, Y + 6); break;
    case 'P': wall(); rect(8, 8, 16, 18, '#2d3640'); rect(10, 10, 12, 6, '#102018'); rect(11, 19, 3, 3, '#40e070'); rect(18, 19, 3, 3, '#ff3030'); break;
    default: floor();
  }
}
function renderTiles() {
  lctx.fillStyle = '#000'; lctx.fillRect(0, 0, W, H);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) drawTile(lctx, game.tiles[y][x], x, y);
}

// Axis-separated collision movement. e = entity with x,y. Returns which axis got blocked.
function blockedAt(x, y, hw, hh, z) {
  const x0 = Math.floor((x - hw) / TILE), x1 = Math.floor((x + hw) / TILE);
  const y0 = Math.floor((y - hh) / TILE), y1 = Math.floor((y + hh) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty, z)) return true;
  return false;
}
function moveEntity(e, dx, dy, hw, hh, z) {
  const res = { bx: false, by: false };
  if (dx) { if (!blockedAt(e.x + dx, e.y, hw, hh, z)) e.x += dx; else res.bx = true; }
  if (dy) { if (!blockedAt(e.x, e.y + dy, hw, hh, z)) e.y += dy; else res.by = true; }
  return res;
}
function faceTo(e, dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right';
  else if (dy !== 0) e.dir = dy < 0 ? 'up' : 'down';
}
const frameOf = (e) => Math.floor((e.walk || 0) * 8) % 2;

/* ======================= 7. GAME STATE ================================ */
// state: menu | controls | playing | paused | keypad | gameover | ending | complete
let state = 'menu';
let time = 0;
const player = { x: 0, y: 0, dir: 'down', walk: 0 };
const game = {
  level: 'GF', tiles: [], zombies: [], npcs: [], boss: null, follower: null,
  flags: {}, keys: 0, hearts: 3, charges: 0, hasStun: false, stunCd: 0, invuln: 0,
  objective: '', pulses: [], trail: [], escort: false, dead: false,
  flick: 1, flickT: 0, docIdx: 0, snap: null, zspawns: [], friend: null, lightBoost: 0,
};
let toast = null;          // small message at the top { text, t }
let shake = 0, flashRed = 0;
let fade = 0, fadeTarget = 0;
let menuZombies = [];

function showToast(text, dur = 2.2) {
  if (toast && toast.text === text && toast.t > 0.5) { toast.t = Math.max(toast.t, 0.8); return; }
  toast = { text, t: dur };
}

/* ======================= 8. SCRIPT / DIALOGUE SYSTEM =================== */
/*
  Cutscenes are a queue of small "steps". While the queue is not empty
  the player and zombies freeze (unless a scene lets zombies keep moving).
  Step types: say, banner, wait, fn, fade, move
*/
const script = [];
let dialog = null;        // { who, text, shown }
let banner = null;        // { text, color }
let sayAdvance = false;

const say = (who, text) => ({ type: 'say', who, text });
const bannerStep = (text, dur = 2, color = '#ff3b3b') => ({ type: 'banner', text, dur, color });
const wait = (dur) => ({ type: 'wait', dur });
const fn = (f) => ({ type: 'fn', f });
const fadeTo = (to) => ({ type: 'fade', to });
const move = (list, speed = 60) => ({ type: 'move', list, speed }); // list: [[actor, px, py], ...]

function runScript(steps) { script.push(...steps); }
function clearScript() { script.length = 0; dialog = null; banner = null; sayAdvance = false; }

function updateScript(dt) {
  let guard = 0;
  while (script.length && guard++ < 50) {
    const s = script[0];
    if (!s.started) {
      s.started = true; s.t = 0;
      if (s.type === 'say') { dialog = { who: s.who, text: s.text, shown: 0 }; sayAdvance = false; }
      if (s.type === 'banner') banner = { text: s.text, color: s.color };
      if (s.type === 'fade') fadeTarget = s.to;
    }
    s.t += dt;
    let done = false;
    switch (s.type) {
      case 'fn': s.f(); done = true; break;
      case 'wait': done = s.t >= s.dur; break;
      case 'banner': done = s.t >= s.dur; if (done) banner = null; break;
      case 'fade': done = fade === s.to; break;
      case 'say': {
        const before = Math.floor(dialog.shown);
        dialog.shown = Math.min(dialog.text.length, dialog.shown + dt * 45);
        if (Math.floor(dialog.shown) !== before && Math.floor(dialog.shown) % 3 === 0) sfx.blip();
        if (sayAdvance) {
          sayAdvance = false;
          if (dialog.shown < dialog.text.length) dialog.shown = dialog.text.length;
          else { done = true; dialog = null; }
        }
        break;
      }
      case 'move': {
        let all = true;
        for (const [a, tx, ty] of s.list) {
          const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
          if (d > 1.5) {
            all = false;
            const st = Math.min(d, s.speed * dt);
            a.x += (dx / d) * st; a.y += (dy / d) * st;
            a.walk = (a.walk || 0) + dt;
            faceTo(a, dx, dy);
          }
        }
        done = all;
        break;
      }
    }
    if (!done) break;
    if (script[0] === s) script.shift();
    dt = 0; // following instant steps run this same frame
  }
}

/* ======================= 9. PLAYER ==================================== */
const PLAYER_SPEED = 125;

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys.has('left')) dx--;
  if (keys.has('right')) dx++;
  if (keys.has('up')) dy--;
  if (keys.has('down')) dy++;
  if (dx || dy) {
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    moveEntity(player, dx * PLAYER_SPEED * dt, dy * PLAYER_SPEED * dt, 7, 6, false);
    player.walk += dt;
    faceTo(player, dx, dy);
    // Breadcrumb trail so Kai can follow during the escort
    const last = game.trail[game.trail.length - 1];
    if (!last || Math.hypot(last.x - player.x, last.y - player.y) > 8) game.trail.push({ x: player.x, y: player.y });
    if (game.trail.length > 400) game.trail.shift();
  }

  if (pressed.has('space')) useStun();
  if (pressed.has('e') || pressed.has('enter')) interact();

  // Tiles you trigger by walking on them
  const tx = Math.floor(player.x / TILE), ty = Math.floor(player.y / TILE);
  const ch = tileAt(tx, ty);
  if (ch === 'k') {
    setTile(tx, ty, '.'); game.keys++; sfx.pickup(); showToast('🔑 Picked up a KEY');
  } else if (ch === 'b') {
    setTile(tx, ty, '.'); sfx.pickup();
    if (game.hasStun) { game.charges += 2; showToast('⚡ BATTERY: +2 STUN CHARGES'); }
    else { game.flags.storedCharges = (game.flags.storedCharges || 0) + 2; showToast('Found a battery... for some kind of device?'); }
  } else if ((ch === 'U' || ch === 'Y') && !game.escort) {
    const L = Logic[game.level];
    if (L.stairs) L.stairs();
  }
}

// Press E: find the closest interactive tile around the player
function interact() {
  const ptx = Math.floor(player.x / TILE), pty = Math.floor(player.y / TILE);
  const fv = dirVec(player.dir);
  let best = null, bestD = 1e9;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const x = ptx + ox, y = pty + oy, ch = tileAt(x, y);
    if (!INTERACT.has(ch)) continue;
    let d = Math.hypot(tc(x) - player.x, tc(y) - player.y);
    if (ox === fv[0] && oy === fv[1]) d -= 12;  // prefer the tile we face
    if (d < 48 && d < bestD) { bestD = d; best = { x, y, ch }; }
  }
  if (!best) return;
  const L = Logic[game.level];
  if (L.interact && L.interact(best.ch, best.x, best.y)) return;
  genericInteract(best.ch, best.x, best.y);
}

function genericInteract(ch, x, y) {
  const L = LEVELS[game.level];
  switch (ch) {
    case 'o':
      if (!L.docs.length) return;
      runScript([say('NOTE', L.docs[game.docIdx % L.docs.length])]); game.docIdx++; break;
    case 's':
      if (game.hearts < 3) { game.hearts++; setTile(x, y, '.'); sfx.pickup(); showToast('❤ Emergency supplies: +1 HEART'); }
      else showToast("Emergency supplies. I'm okay for now.");
      break;
    case 'c': showToast(game.level === 'ROOF' ? 'An air vent. Cold air rushes out.' : 'A locked cabinet. It won\'t budge.'); break;
    case 'e': runScript([say('YEONJUN', "The elevator's broken. Sparks everywhere... Stairs it is.")]); break;
    case 'r': showToast('Reception desk. Papers everywhere.'); break;
    case 'D': setTile(x, y, 'd'); sfx.door(); break;
    case 'L':
      if (game.keys > 0) { game.keys--; setTile(x, y, 'd'); sfx.door(); showToast('🔑 Unlocked!'); }
      else { showToast('Locked. I need a key.'); sfx.empty(); }
      break;
    case 'G': showToast(game.level === 'GF' ? 'COLD STORAGE — SECURITY DOOR. Sealed.' : 'A heavy security door. Sealed tight.'); break;
    case 'V': showToast('A massive vault door. There\'s a keypad on the wall.'); break;
    case 'n': showToast('Keypad. It\'s dead.'); break;
    case 'X': showToast('EMERGENCY EXIT — LOCKED.'); break;
    case 'P': showToast('A control panel. No power... yet.'); break;
    case 'y': showToast('The maintenance box is empty now.'); break;
    case 'Q': showToast('Something is on the other side...'); break;
    case 'h': case 'm': case 'x': break;
  }
}

function hurtPlayer() {
  if (game.invuln > 0 || game.dead || state !== 'playing') return;
  game.hearts--; game.invuln = 1.5; shake = 0.3; flashRed = 0.4; sfx.hit();
  if (game.hearts <= 0) die();
}
function die() {
  game.dead = true; sfx.die();
  clearScript();
  state = 'gameover';
  showOverlay('gameover');
}

/* ======================= 10. ZOMBIES ================================== */
function spawnZombie(tx, ty, opt = {}) {
  game.zombies.push({
    x: tc(tx), y: tc(ty), dir: 'down', walk: 0,
    speed: opt.speed || 38, chase: opt.chase || 56, range: opt.range || 170,
    wt: 0, wdx: 0, wdy: 0, stun: 0, alive: true, dead: 0, groanT: rand(2, 8),
  });
}

function updateZombies(dt, frozen) {
  const inSafe = tileAt(Math.floor(player.x / TILE), Math.floor(player.y / TILE)) === 'C';
  for (const z of game.zombies) {
    if (!z.alive) { z.dead += dt; continue; }
    if (z.stun > 0) { z.stun -= dt; continue; }
    if (frozen) continue;
    const d = dist(z, player);
    z.groanT -= dt;
    if (z.groanT <= 0) { z.groanT = rand(4, 10); if (d < 260) sfx.groan(); }
    if (d < z.range && !inSafe && !game.flags.final) {
      // CHASE the player
      const vx = (player.x - z.x) / d, vy = (player.y - z.y) / d;
      const r = moveEntity(z, vx * z.chase * dt, vy * z.chase * dt, 7, 6, true);
      faceTo(z, vx, vy); z.walk += dt;
      if (r.bx && r.by) { z.wt = 0.4; z.wdx = rand(-1, 1); z.wdy = rand(-1, 1); }
    } else {
      // WANDER around
      z.wt -= dt;
      if (z.wt <= 0) {
        z.wt = rand(1, 3);
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]];
        const p = dirs[Math.floor(Math.random() * dirs.length)];
        z.wdx = p[0]; z.wdy = p[1];
      }
      if (z.wdx || z.wdy) {
        const r = moveEntity(z, z.wdx * z.speed * 0.6 * dt, z.wdy * z.speed * 0.6 * dt, 7, 6, true);
        faceTo(z, z.wdx, z.wdy); z.walk += dt * 0.7;
        if (r.bx || r.by) z.wt = 0;
      }
    }
    if (d < 20 && !script.length) hurtPlayer();
  }
  game.zombies = game.zombies.filter((z) => z.alive || z.dead < 0.6);
}

/* ======================= 11. BOSS — ZOMBIE KAI ======================== */
function makeBoss(tx, ty) {
  return { x: tc(tx), y: tc(ty), hp: 6, max: 6, mode: 'idle', t: 0, stun: 0, dx: 0, dy: 0, dir: 'down', walk: 0, revealed: false };
}
// Pattern: CHASE -> WINDUP -> DASH -> REST -> CHASE ...  (stunned after each hit)
function updateBoss(dt) {
  const b = game.boss;
  if (!b || b.mode === 'idle' || b.mode === 'dead') return;
  if (b.stun > 0) { b.stun -= dt; if (b.stun <= 0) { b.mode = 'chase'; b.t = 0; } return; }
  b.t += dt;
  const d = dist(b, player) || 1;
  const vx = (player.x - b.x) / d, vy = (player.y - b.y) / d;
  switch (b.mode) {
    case 'chase':
      moveEntity(b, vx * 92 * dt, vy * 92 * dt, 9, 7, true); faceTo(b, vx, vy); b.walk += dt * 1.3;
      if (b.t > 2.4) { b.mode = 'windup'; b.t = 0; }
      break;
    case 'windup':
      faceTo(b, vx, vy);
      if (b.t > 0.5) { b.mode = 'dash'; b.t = 0; b.dx = vx; b.dy = vy; sfx.roar(); }
      break;
    case 'dash': {
      const r = moveEntity(b, b.dx * 290 * dt, b.dy * 290 * dt, 9, 7, true); b.walk += dt * 3;
      if (b.t > 0.55 || (r.bx && r.by)) { b.mode = 'rest'; b.t = 0; }
      break;
    }
    case 'rest':
      if (b.t > 1.1) { b.mode = 'chase'; b.t = 0; }
      break;
  }
  if (d < 26 && !script.length) hurtPlayer();
}
function hitBoss() {
  const b = game.boss;
  if (!b || b.mode === 'idle' || b.mode === 'dead' || b.stun > 0) return;
  b.hp--; b.stun = 1.6; b.mode = 'rest'; shake = 0.25; sfx.roar();
  const d = dist(b, player) || 1;
  moveEntity(b, ((b.x - player.x) / d) * 30, ((b.y - player.y) / d) * 30, 9, 7, true);
  if (b.hp <= 0) bossDefeated();
}

/* ======================= 12. STUN DEVICE ============================== */
function dirVec(d) { return d === 'up' ? [0, -1] : d === 'down' ? [0, 1] : d === 'left' ? [-1, 0] : [1, 0]; }

function useStun() {
  if (!game.hasStun) { showToast("I've got nothing to fight with. RUN!"); return; }
  if (game.stunCd > 0) return;
  if (game.charges <= 0) { showToast('⚡ NO CHARGES LEFT! Find batteries.'); sfx.empty(); game.stunCd = 0.3; return; }
  game.charges--; game.stunCd = 0.8; shake = 0.12; sfx.zap();
  const [fx, fy] = dirVec(player.dir);
  const cx = player.x + fx * 30, cy = player.y - 8 + fy * 30;
  game.pulses.push({ x: cx, y: cy, t: 0 });
  for (const z of game.zombies) {
    if (!z.alive) continue;
    const d = Math.hypot(z.x - cx, z.y - 8 - cy);
    if (d < 48) { z.alive = false; z.dead = 0; sfx.kill(); }   // close: killed
    else if (d < 80) z.stun = 3;                               // further: stunned
  }
  if (game.boss && Math.hypot(game.boss.x - cx, game.boss.y - 12 - cy) < 70) hitBoss();
}

/* ======================= 13. LEVEL LOADING & STORY ==================== */
function loadLevel(id, opts = {}) {
  const L = LEVELS[id];
  game.level = id;
  game.escort = !!opts.escort;
  game.tiles = L.map.map((row) => row.padEnd(COLS, '#').slice(0, COLS).split(''));
  game.zombies = []; game.npcs = []; game.boss = null; game.follower = null;
  game.flags = {}; game.keys = 0; game.pulses = []; game.trail = []; game.zspawns = [];
  game.invuln = 0; game.dead = false; game.hearts = 3; game.friend = null; game.lightBoost = 0; game.docIdx = 0;
  game.snap = { charges: game.charges, hasStun: game.hasStun };

  let start = { x: 1, y: 1 }, friendPos = null;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = game.tiles[y][x];
    if (ch === 'p') { start = { x, y }; game.tiles[y][x] = '.'; }
    else if (ch === 'f') { friendPos = { x, y }; game.tiles[y][x] = '.'; }
    else if (ch === 'z') { game.zspawns.push({ x, y }); game.tiles[y][x] = '.'; }
  }
  game.friendPos = friendPos;

  if (game.escort) {
    // Route already cleared: doors open, no keys needed
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const ch = game.tiles[y][x];
      if (ch === 'L' || ch === 'D' || ch === 'Q') game.tiles[y][x] = 'd';
      if (ch === 'V') game.tiles[y][x] = '.';
      if (ch === 'H') game.tiles[y][x] = 'Y';
      if (ch === 'k' || ch === 'h' || ch === 'm') game.tiles[y][x] = '.';
    }
    start = { x: ESCORT[id].start[0], y: ESCORT[id].start[1] };
  }

  player.x = tc(start.x); player.y = tc(start.y); player.dir = 'down'; player.walk = 0;
  renderTiles();

  if (game.escort) escortStart();
  else Logic[id].start(opts);
}

// Fade out, load a level, fade in
function goTo(id, opts = {}, middle = []) {
  runScript([fadeTo(1), ...middle, fn(() => loadLevel(id, opts)), fadeTo(0)]);
}

function mkNpc(key, tx, ty) {
  return { key, pal: PAL[key], x: tc(tx), y: tc(ty), dir: 'down', walk: 0, visible: true, injured: false, point: false };
}

/* Generic "emergency system sends the friend to the Cold Safe Room" sequence */
function rescueFriend(npc, name, lines, afterOpenLines, nextObjective) {
  game.flags.rescuing = true;
  const gp = findTile('G');
  const fy = Math.floor(npc.y / TILE);
  const dirY = Math.sign(gp.y - fy) || 1;
  runScript([
    ...lines.map((l) => (l.wait ? wait(l.wait) : say(l[0], l[1]))),
    fn(() => sfx.evac()),
    bannerStep('EMERGENCY EVACUATION ROUTE ACTIVATED', 2.2, '#ffcc33'),
    fn(() => { setTile(gp.x, gp.y, 'g'); sfx.door(); shake = 0.2; }),
    wait(0.6),
    ...afterOpenLines.map((l) => say(l[0], l[1])),
    move([[npc, tc(gp.x), npc.y]], 55),
    move([[npc, tc(gp.x), tc(gp.y)]], 55),
    move([[npc, tc(gp.x), tc(gp.y + dirY)]], 55),
    fn(() => { npc.visible = false; }),
    fn(() => { setTile(gp.x, gp.y, 'G'); sfx.door(); shake = 0.2; }),
    bannerStep(`${name} HAS BEEN MOVED TO THE COLD SAFE ROOM.`, 2.8, '#9fe4ff'),
    fn(() => { game.flags.rescued = true; game.objective = nextObjective; showToast('The stairs are open now.'); }),
  ]);
}

// Shared friend-proximity check used by floors 1-3 and the rooftop
function checkFriend(onReach) {
  const f = game.friend;
  if (!f || !f.visible || game.flags.rescuing || game.flags.rescued) return;
  if (dist(f, player) < 58) { f.dir = player.x < f.x ? 'left' : player.x > f.x + 10 ? 'right' : 'down'; onReach(f); }
}

const Logic = {
  /* ---------------- PROLOGUE: GROUND FLOOR ---------------- */
  GF: {
    start() {
      game.objective = 'Look around (E to interact)';
      runScript([
        bannerStep('GROUND FLOOR', 1.8, '#7dff5a'),
        say('YEONJUN', '...'),
        say('YEONJUN', 'Where... am I?'),
        say('YEONJUN', 'Only the emergency lights are working...'),
        say('YEONJUN', 'My phone. I need my phone.'),
        fn(() => { game.objective = 'Find your phone'; }),
      ]);
    },
    interact(ch, x, y) {
      if (ch === 'h') {
        setTile(x, y, '.');
        runScript([
          say('YEONJUN', 'There it is!'),
          say('PHONE', 'NO SIGNAL.'),
          say('YEONJUN', 'No signal...'),
          fn(() => { sfx.bang(); shake = 0.3; }), bannerStep('BANG!', 0.7),
          fn(() => { sfx.bang(); shake = 0.4; }), bannerStep('BANG!!', 0.7),
          fn(() => { sfx.bang(); shake = 0.5; }), bannerStep('BANG!!!', 0.8),
          fn(() => {
            setTile(5, 12, 'd'); sfx.door(); sfx.roar(); shake = 0.6;
            spawnZombie(5, 13, { chase: 52, range: 220 });
            for (const s of game.zspawns) spawnZombie(s.x, s.y);
          }),
          say('YEONJUN', "What the— Is that... a ZOMBIE?!"),
          fn(() => { game.objective = 'RUN! Move with WASD / Arrow Keys'; game.flags.bang = true; game.flags.bangT = 0; }),
        ]);
        return true;
      }
      if (ch === 'm') {
        setTile(x, y, '.');
        runScript([
          say('YEONJUN', 'A building map...'),
          say('BUILDING MAP', 'FLOOR 1 → TAEHYUN     FLOOR 2 → BEOMGYU     FLOOR 3 → SOOBIN     FLOOR 4 → KAI'),
          say('BUILDING MAP', 'SAFE ROOM — GROUND FLOOR (COLD STORAGE)'),
          say('YEONJUN', "They're all here..."),
          fn(() => sfx.evac()),
          bannerStep('NEW OBJECTIVE:\nRESCUE EVERYONE', 2.4, '#ffcc33'),
          fn(() => { game.flags.mapRead = true; game.objective = 'RESCUE EVERYONE — Stairs to Floor 1 (top right)'; }),
        ]);
        return true;
      }
      if (ch === 'x') {
        if (game.keys > 0) {
          game.keys--; setTile(x, y, 'y'); sfx.door();
          game.hasStun = true; game.charges = 5 + (game.flags.storedCharges || 0);
          runScript([
            fn(() => sfx.grant()),
            bannerStep('⚡ EMERGENCY STUN DEVICE\n' + game.charges + ' CHARGES', 2.2, '#5fd0ff'),
            say('YEONJUN', 'Some kind of emergency stun device...'),
            say('YEONJUN', 'Might come in handy. (SPACE to use)'),
          ]);
        } else runScript([say('YEONJUN', 'A locked maintenance box. I need a key... maybe the storage room?')]);
        return true;
      }
      if (ch === 'Q' && !game.flags.bang) { showToast('Thump... thump... Something is on the other side.'); return true; }
      return false;
    },
    update(dt) {
      if (game.flags.bang && !game.flags.hint) {
        game.flags.bangT += dt;
        if (game.flags.bangT > 7) { game.flags.hint = true; if (!game.flags.mapRead) game.objective = 'Search the reception desk'; }
      }
    },
    stairs() {
      if (!game.flags.mapRead) { showToast("I should figure out where I am first..."); return; }
      goTo('F1');
    },
  },

  /* ---------------- FLOOR 1: TAEHYUN (MAZE) ---------------- */
  F1: {
    start() {
      game.friend = mkNpc('taehyun', game.friendPos.x, game.friendPos.y); game.npcs.push(game.friend);
      for (const s of game.zspawns) spawnZombie(s.x, s.y, { range: 140 });
      game.objective = "Find the keys. Reach Taehyun's room";
      runScript([
        bannerStep('FLOOR 1', 1.8, '#7dff5a'),
        say('YEONJUN', 'Taehyun should be somewhere on this floor...'),
        say('YEONJUN', 'This place is a maze. And those doors are locked.'),
      ]);
    },
    update() {
      checkFriend((f) => rescueFriend(f, 'TAEHYUN', [
        ['TAEHYUN', 'Yeonjun?'],
        ['YEONJUN', 'Taehyun! Are you okay?'],
        ['TAEHYUN', "I'm fine. But you need to leave."],
        ['YEONJUN', 'Not without you.'],
      ], [
        ['TAEHYUN', "What's that?"],
        ['YEONJUN', "I don't know."],
      ], 'Find Beomgyu — Stairs to Floor 2 (bottom left)'));
    },
    stairs() {
      if (!game.flags.rescued) { showToast("I can't leave without Taehyun."); return; }
      goTo('F2');
    },
  },

  /* ---------------- FLOOR 2: BEOMGYU (RIDDLE) ---------------- */
  F2: {
    start() {
      game.friend = mkNpc('beomgyu', game.friendPos.x, game.friendPos.y); game.npcs.push(game.friend);
      for (const s of game.zspawns) spawnZombie(s.x, s.y);
      game.objective = 'Solve the keypad riddle (E at keypad)';
      runScript([
        bannerStep('FLOOR 2', 1.8, '#7dff5a'),
        say('YEONJUN', "A massive security door... and there's writing on the wall."),
        say('WALL TEXT', '"I have no mouth, but I can speak. I have no ears, but I can hear. I have no body, but I come alive with wind."'),
        say('YEONJUN', 'A riddle. The password must be the answer.'),
      ]);
    },
    interact(ch) {
      if (ch === 'n') { if (!game.flags.granted) openKeypad(); else showToast('ACCESS GRANTED'); return true; }
      return false;
    },
    granted() {
      game.flags.granted = true;
      runScript([
        fn(() => sfx.grant()),
        bannerStep('ACCESS GRANTED', 1.6, '#7dff5a'),
        fn(() => {
          for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (game.tiles[y][x] === 'V') game.tiles[y][x] = '.';
          renderTiles(); sfx.door(); shake = 0.3;
          game.objective = 'Find Beomgyu';
        }),
      ]);
    },
    alarm() {
      sfx.alarm(); shake = 0.4;
      runScript([
        bannerStep('ALARM TRIGGERED!', 1.8, '#ff2020'),
        fn(() => { for (const p of [[12, 3], [18, 6], [15, 9], [11, 7]]) spawnZombie(p[0], p[1], { range: 240, chase: 58 }); }),
        say('YEONJUN', "Great. That woke them up. Think, Yeonjun... what speaks without a mouth?"),
      ]);
    },
    update() {
      if (!game.flags.granted) return;
      checkFriend((f) => rescueFriend(f, 'BEOMGYU', [
        ['BEOMGYU', 'I thought nobody was coming.'],
        ['YEONJUN', "We're getting out."],
      ], [], 'Find Soobin — Stairs to Floor 3 (bottom right)'));
    },
    stairs() {
      if (!game.flags.rescued) { showToast("Beomgyu is still behind that door."); return; }
      goTo('F3');
    },
  },

  /* ---------------- FLOOR 3: SOOBIN (FIRST COMBAT) ---------------- */
  F3: {
    start() {
      game.friend = mkNpc('soobin', game.friendPos.x, game.friendPos.y); game.friend.injured = true; game.npcs.push(game.friend);
      game.objective = 'Find Soobin';
      const steps = [bannerStep('FLOOR 3', 1.8, '#7dff5a')];
      if (!game.hasStun) {
        steps.push(fn(() => { game.hasStun = true; game.charges = 3 + (game.flags.storedCharges || 0); sfx.pickup(); }),
          say('YEONJUN', 'Someone dropped an emergency stun device here... 3 charges.'));
      }
      steps.push(say('YEONJUN', "It's... quiet."), say('YEONJUN', 'Too quiet.'));
      runScript(steps);
    },
    update() {
      if (!game.flags.horde && player.y > 6 * TILE) {
        game.flags.horde = true;
        const spots = [[3, 9], [12, 8], [18, 8], [26, 9], [5, 14], [11, 14], [17, 14], [22, 11], [27, 12], [4, 17], [14, 17], [24, 17], [9, 11], [18, 16], [26, 15], [8, 17]];
        runScript([
          fn(() => { sfx.roar(); sfx.alarm(); shake = 0.5; }),
          bannerStep("THEY'RE COMING!", 1.5, '#ff2020'),
          fn(() => {
            for (const s of spots) if (Math.hypot(tc(s[0]) - player.x, tc(s[1]) - player.y) > 150) spawnZombie(s[0], s[1], { range: 260, chase: 54 });
          }),
          say('SYSTEM', 'Press SPACE to use the stun device. It has limited charges — find batteries ⚡.'),
          fn(() => { game.objective = 'Survive (SPACE = stun). Find Soobin (top right)'; }),
        ]);
      }
      checkFriend((f) => rescueFriend(f, 'SOOBIN', [
        ['SOOBIN', "Yeonjun... Don't go upstairs."],
        ['YEONJUN', 'Kai is there.'],
        ['SOOBIN', 'I know.'],
        { wait: 1.4 },
        ['SOOBIN', "That's the problem."],
        ['YEONJUN', 'What do you mean—'],
      ], [], 'Go to Floor 4 — find Kai (stairs bottom)'));
    },
    stairs() {
      if (!game.flags.rescued) { showToast('I have to find Soobin first.'); return; }
      goTo('F4');
    },
  },

  /* ---------------- FLOOR 4: KAI (BOSS) ---------------- */
  F4: {
    start() {
      if (!game.hasStun) game.hasStun = true;
      game.boss = makeBoss(14, 3);
      game.objective = 'Find Kai';
      const steps = [bannerStep('FLOOR 4', 2, '#ff3b3b')];
      if (game.charges < 3) steps.push(fn(() => { game.charges = 3; showToast('⚡ Found spare batteries. Charges: 3'); sfx.pickup(); }));
      steps.push(say('YEONJUN', "...It's so quiet up here."), say('YEONJUN', 'Blood... everywhere.'));
      runScript(steps);
    },
    update(dt) {
      const b = game.boss;
      if (!game.flags.met && player.y < 12 * TILE) {
        game.flags.met = true;
        runScript([
          say('YEONJUN', 'Kai!'),
          say('KAI', 'Yeonjun...'),
          say('KAI', "You shouldn't have come."),
          fn(() => { b.revealed = true; sfx.roar(); shake = 0.7; flashRed = 0.4; }),
          bannerStep('ZOMBIE KAI ATTACKS!', 1.6, '#ff2020'),
          fn(() => {
            b.mode = 'chase'; b.t = 0; game.flags.fight = true; game.flags.batT = 0;
            spawnBattery(); spawnBattery();
            game.objective = 'SURVIVE — Stun Zombie Kai (SPACE)';
          }),
        ]);
      }
      // Batteries keep appearing in the arena during the fight
      if (game.flags.fight) {
        game.flags.batT += dt;
        if (game.flags.batT > 6) { game.flags.batT = 0; spawnBattery(); }
      }
    },
    stairs() { goTo('ROOF'); },
  },

  /* ---------------- ROOFTOP SECRET ---------------- */
  ROOF: {
    start() {
      game.friend = mkNpc('kai', game.friendPos.x, game.friendPos.y); game.friend.injured = true; game.npcs.push(game.friend);
      game.objective = 'Check the small locked room';
      runScript([
        bannerStep('ROOFTOP', 2, '#9fe4ff'),
        say('YEONJUN', 'The rooftop... That sign had no floor number.'),
        say('YEONJUN', "There's a small locked room over there."),
      ]);
    },
    interact(ch, x, y) {
      if (ch === 'D') { setTile(x, y, 'd'); sfx.door(); showToast('The rusted lock breaks open.'); return true; }
      return false;
    },
    update() {
      checkFriend((k) => {
        game.flags.rescuing = true;
        runScript([
          say('YEONJUN', '...Kai?'),
          say('KAI', 'Yeonjun?'),
          say('YEONJUN', 'Then... who did I just...'),
          say('KAI', "I don't know."),
          wait(1),
          say('KAI', "The zombies... they don't just bite. They change people."),
          say('KAI', 'I saw one of them turn. It looked exactly like me. So I hid up here.'),
          say('YEONJUN', "So that thing on Floor 4 was never you... That's why Soobin warned me."),
          say('KAI', "I'm so weak... I can barely walk."),
          say('YEONJUN', "Then we go slow. Everyone else is waiting in the Cold Safe Room. Let's go."),
          fn(() => { game.flags.rescued = true; }),
          fn(() => goTo('F4', { escort: true })),
        ]);
      });
    },
  },
};

function spawnBattery() {
  let count = 0;
  for (const row of game.tiles) for (const ch of row) if (ch === 'b') count++;
  if (count >= 2) return;
  for (let i = 0; i < 50; i++) {
    const x = 1 + Math.floor(Math.random() * 28), y = 2 + Math.floor(Math.random() * 12);
    if (game.tiles[y][x] === '.' && Math.hypot(tc(x) - player.x, tc(y) - player.y) > 110) { setTile(x, y, 'b'); return; }
  }
}

function bossDefeated() {
  const b = game.boss;
  b.mode = 'dead'; game.flags.fight = false;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (game.tiles[y][x] === 'b') game.tiles[y][x] = '.';
  renderTiles();
  runScript([
    bannerStep('KAI DEFEATED', 2.4, '#ff3b3b'),
    fadeTo(1),
    wait(0.8),
    say('YEONJUN', 'Kai...'),
    fn(() => { game.boss = null; setTile(14, 1, 'Y'); sfx.door(); }),
    wait(0.5),
    fadeTo(0),
    say('YEONJUN', "A staircase... right behind where he was standing?"),
    say('YEONJUN', '"ROOFTOP ACCESS"... No floor number.'),
    fn(() => { game.objective = 'Climb the ROOFTOP ACCESS stairs'; }),
  ]);
}

/* ======================= 14. ESCORT & FINAL SAFE ROOM ================== */
const ESCORT = {
  F4: { start: [14, 2], exit: [13, 18], zombies: [[5, 8], [24, 8]], next: () => goTo('F3', { escort: true }) },
  F3: {
    start: [21, 18], exit: [3, 2], zombies: [[10, 11], [20, 14], [6, 8]],
    next: () => runScript([
      fadeTo(1),
      bannerStep('FLOOR 2... FLOOR 1...\nThe route is already clear.', 2.8, '#aaaaaa'),
      fn(() => loadLevel('GF', { escort: true })),
      fadeTo(0),
    ]),
  },
  GF: { start: [27, 2], exit: [4, 7], zombies: [[15, 14], [22, 18], [24, 4]], next: () => finalCutscene() },
};

function escortStart() {
  const E = ESCORT[game.level];
  const kai = mkNpc('kai', E.start[0], E.start[1]); kai.injured = true;
  kai.y -= 4;
  game.follower = kai; game.npcs.push(kai);
  for (const z of E.zombies) spawnZombie(z[0], z[1], { speed: 28, chase: 40, range: 130 });
  game.objective = game.level === 'GF' ? 'Bring Kai to the COLD SAFE ROOM (top left)' : 'Escort Kai downstairs (green arrow)';
  const steps = [bannerStep(LEVELS[game.level].name, 1.6, '#9fe4ff')];
  if (game.level === 'F4') steps.push(say('KAI', "Go slow, okay? I can't run."), say('YEONJUN', "I've got you. Stay behind me."));
  if (game.level === 'GF') steps.push(say('YEONJUN', "Ground floor. The safe room is right there. Almost there, Kai."));
  runScript(steps);
}

// Kai follows the player's footsteps (breadcrumb trail), slowly
function updateFollower(dt) {
  const k = game.follower; if (!k) return;
  const d = dist(k, player);
  if (d < 34) { game.trail.length = 0; return; }
  const target = game.trail[0] || player;
  const dx = target.x - k.x, dy = target.y - k.y, td = Math.hypot(dx, dy);
  if (td < 3) { game.trail.shift(); return; }
  const sp = 66 * dt;
  k.x += (dx / td) * Math.min(sp, td); k.y += (dy / td) * Math.min(sp, td);
  k.walk += dt * 0.8; faceTo(k, dx, dy);
}

function updateEscort() {
  const E = ESCORT[game.level];
  if (game.flags.exiting) return;
  const ex = tc(E.exit[0]), ey = tc(E.exit[1]);
  if (Math.hypot(player.x - ex, player.y - ey) < 22) {
    if (dist(player, game.follower) < 80) { game.flags.exiting = true; E.next(); }
    else showToast('Wait for Kai', 0.6);
  }
}

function finalCutscene() {
  game.flags.final = true;
  const K = game.follower;
  const T = mkNpc('taehyun', 2, 2), B = mkNpc('beomgyu', 5, 2), S = mkNpc('soobin', 2, 4);
  S.injured = true; T.dir = 'down'; B.dir = 'down';
  game.npcs.push(T, B, S);
  // A few zombies outside — they can see us, but can never get in
  spawnZombie(9, 9, { range: 400, chase: 40 }); spawnZombie(3, 10, { range: 400, chase: 40 }); spawnZombie(12, 7, { range: 400, chase: 40 });
  game.lightBoost = 1;
  runScript([
    fn(() => { setTile(4, 6, 'g'); sfx.door(); sfx.evac(); }),
    bannerStep('COLD STORAGE — SECURITY DOOR OPEN', 1.4, '#9fe4ff'),
    move([[K, tc(4), tc(6)]], 50),
    move([[K, tc(4), tc(4)], [player, tc(4), tc(6)]], 55),
    move([[K, tc(5), tc(4)], [player, tc(4), tc(5)]], 55),
    fn(() => { setTile(4, 6, 'G'); sfx.door(); shake = 0.3; game.flags.zombiesLive = true; }),
    bannerStep('SAFE ROOM SEALED\nTemperature: LOW\nZOMBIE ACCESS: IMPOSSIBLE\nSTATUS: SAFE', 4.2, '#9fe4ff'),
    fn(() => { T.dir = 'right'; B.dir = 'left'; S.dir = 'right'; }),
    say('SOOBIN', 'Kai...! You\'re alive.'),
    say('KAI', 'The one on Floor 4 was never me.'),
    say('SOOBIN', "I saw it change. That's why I told you not to go upstairs."),
    say('BEOMGYU', "Everyone's here. All five of us."),
    say('YEONJUN', "We're together. That's all that matters."),
    say('TAEHYUN', 'Wait. Look — an EMERGENCY EXIT.'),
    move([[T, tc(5), tc(1)]], 55),
    fn(() => { T.dir = 'up'; }),
    say('TAEHYUN', 'If this works...'),
    fn(() => sfx.beep()), bannerStep('BEEP', 0.9, '#7dff5a'),
    fn(() => { setTile(3, 0, 'O'); sfx.grant(); sfx.door(); }),
    bannerStep('EMERGENCY EXIT UNLOCKED', 1.6, '#7dff5a'),
    say('TAEHYUN', "It's open!"),
    fn(() => { player.dir = 'down'; }),
    wait(1.2),
    say('YEONJUN', "(looking back) ...They're still out there."),
    say('YEONJUN', "But they can't reach us anymore."),
    wait(0.8),
    move([[T, tc(3), tc(1)], [B, tc(3), tc(2)], [S, tc(3), tc(3)], [K, tc(4), tc(3)], [player, tc(3), tc(4)]], 50),
    move([[T, tc(3), tc(-1)], [B, tc(3), tc(1)], [S, tc(3), tc(2)], [K, tc(3), tc(3)], [player, tc(3), tc(4)]], 50),
    fadeTo(1),
    fn(() => startEnding()),
  ]);
}

/* ======================= 15. ENDING SCENE ============================= */
let END = null;
function startEnding() {
  clearScript();
  state = 'ending';
  const order = ['yeonjun', 'taehyun', 'beomgyu', 'soobin', 'kai'];
  END = { t: 0, walking: true, point: false, door: 1, closing: false, doorSound: false,
    chars: order.map((k, i) => ({ key: k, pal: PAL[k], x: 330 + (4 - i) * 46, y: 548, dir: 'right', walk: i * 0.1 })) };
  fade = 1;
  runScript([
    fadeTo(0),
    wait(3),
    say('TAEHYUN', 'We actually made it.'),
    say('BEOMGYU', "Don't say that yet."),
    say('SOOBIN', 'Why?'),
    fn(() => { END.walking = false; END.point = true; END.chars.forEach((c) => (c.dir = 'left')); }),
    wait(1.6),
    fn(() => { END.closing = true; }),
    wait(3.2),
    fn(() => { END.point = false; }),
    wait(2),
    fn(() => { END.walking = true; END.chars.forEach((c) => (c.dir = 'right')); }),
    wait(6),
    fadeTo(1),
    fn(() => { state = 'complete'; fadeTarget = 0; showOverlay('complete'); }),
  ]);
}
function updateEnding(dt) {
  END.t += dt;
  if (END.walking) END.chars.forEach((c) => { c.x += 16 * dt; c.walk += dt * 0.6; });
  if (END.closing && END.door > 0) {
    if (!END.doorSound) { END.doorSound = true; sfx.door(); }
    END.door = Math.max(0, END.door - dt * 0.5);
  }
}
function lerpC(a, b, k) { return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`; }
function renderEnding() {
  const k = Math.min(1, END.t / 32);
  // Sky slowly gets brighter: night -> dawn -> early morning
  const g = ctx.createLinearGradient(0, 0, 0, 470);
  g.addColorStop(0, lerpC([8, 12, 30], [118, 168, 220], k));
  g.addColorStop(1, lerpC([28, 24, 48], [255, 200, 150], k));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 470);
  // Fading stars
  ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
  for (let i = 0; i < 40; i++) ctx.fillRect(Math.floor(hash(i, 1) * W), Math.floor(hash(i, 2) * 300), 2, 2);
  // Rising sun
  ctx.fillStyle = `rgba(255,214,150,${0.2 + 0.8 * k})`;
  ctx.beginPath(); ctx.arc(790, 500 - k * 170, 44, 0, Math.PI * 2); ctx.fill();
  // Distant city
  ctx.fillStyle = lerpC([14, 14, 24], [90, 100, 125], k);
  for (let i = 0; i < 12; i++) { const bh = 40 + hash(i, 5) * 90; ctx.fillRect(360 + i * 52, 470 - bh, 46, bh); }
  // Ground and road
  ctx.fillStyle = lerpC([16, 22, 16], [62, 92, 58], k); ctx.fillRect(0, 470, W, 170);
  ctx.fillStyle = lerpC([26, 26, 28], [88, 88, 94], k); ctx.fillRect(0, 520, W, 50);
  ctx.fillStyle = lerpC([60, 60, 40], [220, 210, 160], k);
  for (let x = 0; x < W; x += 60) ctx.fillRect(x, 544, 30, 3);
  // The building — still standing
  const bc = lerpC([24, 26, 32], [78, 84, 98], k);
  ctx.fillStyle = bc; ctx.fillRect(40, 110, 270, 410);
  ctx.fillStyle = lerpC([36, 38, 46], [100, 106, 120], k); ctx.fillRect(40, 110, 270, 10);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
    ctx.fillStyle = (r + c) % 4 === 0 ? '#0a0b0e' : lerpC([12, 13, 18], [52, 58, 70], k);
    ctx.fillRect(62 + c * 50, 140 + r * 50, 28, 30);
  }
  ctx.fillStyle = '#7dff5a'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.globalAlpha = 0.4; ctx.fillText('FLOOR ZERO', 175, 128); ctx.globalAlpha = 1;
  // Entrance doors (they close slowly)
  ctx.fillStyle = '#050506'; ctx.fillRect(140, 440, 70, 80);
  const open = END.door * 33;
  ctx.fillStyle = lerpC([50, 54, 62], [120, 126, 138], k);
  ctx.fillRect(140, 440, 35 - open, 80); ctx.fillRect(175 + open, 440, 35 - open, 80);
  ctx.fillStyle = '#222'; ctx.fillRect(140, 438, 70, 3);
  // The five of them
  const cs = [...END.chars].sort((a, b) => a.y - b.y);
  for (const c of cs) drawPerson(c.x, c.y, c.pal, c.dir, END.walking ? frameOf(c) : 0, { scale: 3, point: END.point && c.key === 'beomgyu' });
}

/* ======================= 16. RENDERING ================================ */
function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-4, 4) * shake * 3, rand(-4, 4) * shake * 3);
  ctx.fillStyle = '#000'; ctx.fillRect(-20, -20, W + 40, H + 40);

  if (state === 'menu' || state === 'controls') renderMenuBg();
  else if (state === 'ending' || state === 'complete') renderEnding();
  else renderWorld();
  ctx.restore();

  if (flashRed > 0) { ctx.fillStyle = `rgba(200,0,0,${flashRed * 0.6})`; ctx.fillRect(0, 0, W, H); }
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  drawBanner();
  drawDialog();
}

function renderWorld() {
  ctx.drawImage(levelCanvas, 0, 0);

  // Rooftop sign + exit arrow
  if (game.level === 'F4' && tileAt(14, 1) === 'Y') {
    ctx.fillStyle = '#0b1a22'; ctx.fillRect(14 * TILE - 34, 4, 100, 18);
    ctx.strokeStyle = '#9fe4ff'; ctx.strokeRect(14 * TILE - 34, 4, 100, 18);
    ctx.fillStyle = '#9fe4ff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('ROOFTOP ACCESS', 14 * TILE + 16, 17);
  }
  if (game.level === 'F2' && !game.flags.granted) {
    ctx.fillStyle = 'rgba(200,30,30,0.75)'; ctx.font = 'italic 9px monospace'; ctx.textAlign = 'left';
    ctx.fillText('"I have no mouth, but I can speak..."', 9 * TILE + 4, 20);
  }
  if (game.escort && !game.flags.final) {
    const E = ESCORT[game.level];
    const bob = Math.sin(time * 5) * 4;
    ctx.fillStyle = 'rgba(80,255,120,0.8)';
    const ax = tc(E.exit[0]), ay = tc(E.exit[1]) - 22 + bob;
    ctx.beginPath(); ctx.moveTo(ax - 8, ay - 8); ctx.lineTo(ax + 8, ay - 8); ctx.lineTo(ax, ay + 4); ctx.fill();
  }

  // Collect and depth-sort all characters
  const ents = [];
  for (const n of game.npcs) if (n.visible) ents.push({ y: n.y, d: () => drawPerson(n.x, n.y, n.pal, n.dir, frameOf(n), { blood: n.injured }) });
  for (const z of game.zombies) {
    ents.push({ y: z.y, d: () => {
      const a = z.alive ? (z.stun > 0 ? 0.6 + Math.sin(time * 30) * 0.3 : 1) : Math.max(0, 1 - z.dead / 0.6);
      drawPerson(z.x, z.y, PAL.zombie, z.dir, frameOf(z), { zombie: true, alpha: a });
      if (z.stun > 0 && z.alive) { ctx.fillStyle = '#9fe4ff'; ctx.fillRect(z.x - 8 + Math.sin(time * 20) * 6, z.y - 30, 3, 3); ctx.fillRect(z.x + 6 - Math.sin(time * 20) * 6, z.y - 26, 3, 3); }
    } });
  }
  const b = game.boss;
  if (b && b.mode !== 'dead') {
    ents.push({ y: b.y, d: () => {
      let bx = b.x, by = b.y;
      if (b.mode === 'windup') { bx += rand(-2, 2); by += rand(-2, 2); }
      const a = b.stun > 0 ? 0.55 + Math.sin(time * 30) * 0.35 : 1;
      drawPerson(bx, by, b.revealed ? PAL.zkai : PAL.kai, b.dir, frameOf(b), { scale: 3, zombie: b.revealed, blood: true, alpha: a });
    } });
  }
  const blink = game.invuln > 0 && Math.floor(time * 14) % 2 === 0;
  if (!blink) ents.push({ y: player.y, d: () => drawPerson(player.x, player.y, PAL.yeonjun, player.dir, frameOf(player)) });
  ents.sort((a, b2) => a.y - b2.y).forEach((e) => e.d());

  // Stun pulses
  for (const p of game.pulses) {
    const k = p.t / 0.35;
    ctx.strokeStyle = `rgba(160,230,255,${1 - k})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, 12 + k * 60, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,160,${0.5 * (1 - k)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 + k * 30, 0, Math.PI * 2); ctx.fill();
  }

  drawDarkness();

  // Red eyes glow in the dark
  for (const z of game.zombies) if (z.alive) drawEyeGlow(z.x, z.y, z.dir);
  if (b && b.revealed && b.mode !== 'dead') drawEyeGlow(b.x, b.y, b.dir, 3);

  drawHUD();
}

function hole(x, y, r) {
  const g = dctx.createRadialGradient(x, y, r * 0.3, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  dctx.fillStyle = g; dctx.beginPath(); dctx.arc(x, y, r, 0, Math.PI * 2); dctx.fill();
}
// Darkness overlay with a flashlight circle around Yeonjun + flickering emergency lights
function drawDarkness() {
  const L = LEVELS[game.level];
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = `rgba(0,0,0,${L.dark})`;
  dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = 'destination-out';
  const pr = (165 + Math.sin(time * 9) * 3) * (0.75 + 0.25 * game.flick) + game.lightBoost * 120;
  hole(player.x, player.y - 10, pr);
  for (const l of L.lights) hole(tc(l[0]) - 16, tc(l[1]) - 16, l[2] * (0.6 + 0.4 * game.flick));
  if (game.follower) hole(game.follower.x, game.follower.y - 10, 70);
  for (const p of game.pulses) hole(p.x, p.y, 110 * (1 - p.t / 0.35));
  dctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkCanvas, 0, 0);
  // Colored glow of emergency lights
  ctx.globalCompositeOperation = 'lighter';
  for (const l of L.lights) {
    const x = tc(l[0]) - 16, y = tc(l[1]) - 16, r = l[2] * (0.6 + 0.4 * game.flick);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${l[3]},0.22)`); g.addColorStop(1, `rgba(${l[3]},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawHeart(x, y, full) {
  const rows = [' XX XX ', 'XXXXXXX', 'XXXXXXX', ' XXXXX ', '  XXX  ', '   X   '];
  ctx.fillStyle = full ? '#e0202a' : '#3a1a1a';
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'X') ctx.fillRect(x + i * 3, y + j * 3, 3, 3); });
  if (full) { ctx.fillStyle = '#ff8a8a'; ctx.fillRect(x + 3, y + 3, 3, 3); }
}
function drawHUD() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = '#5a1010'; ctx.fillRect(0, 30, W, 1);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#7dff5a'; ctx.fillText(LEVELS[game.level].name + (game.escort ? ' ↓' : ''), 10, 16);
  for (let i = 0; i < 3; i++) drawHeart(150 + i * 26, 7, i < game.hearts);
  ctx.font = '13px monospace';
  ctx.fillStyle = game.hasStun ? '#9fe4ff' : '#555';
  ctx.fillText('⚡ STUN DEVICE: ' + (game.hasStun ? game.charges : '--'), 240, 16);
  if (game.keys > 0) { ctx.fillStyle = '#f0c040'; ctx.fillText('🔑 x' + game.keys, 420, 16); }
  // Objective (right side)
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffcc33';
  let obj = 'OBJECTIVE: ' + game.objective;
  while (ctx.measureText(obj).width > 470 && obj.length > 10) obj = obj.slice(0, -2);
  ctx.fillText(obj, W - 10, 16);
  ctx.textBaseline = 'alphabetic';

  // Boss health bar
  const b = game.boss;
  if (b && b.revealed && b.mode !== 'dead') {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(W / 2 - 160, 38, 320, 26);
    ctx.fillStyle = '#300'; ctx.fillRect(W / 2 - 150, 52, 300, 8);
    ctx.fillStyle = '#e01818'; ctx.fillRect(W / 2 - 150, 52, 300 * (b.hp / b.max), 8);
    ctx.fillStyle = '#ff6060'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('ZOMBIE KAI', W / 2, 48);
  }
  // Wait for Kai
  if (game.follower && !game.flags.final && dist(game.follower, player) > 210) {
    ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(174,232,255,${0.6 + Math.sin(time * 6) * 0.4})`;
    ctx.fillText('Wait for Kai', W / 2, 92);
  }
  // Toast
  if (toast && toast.t > 0) {
    ctx.font = '14px monospace'; ctx.textAlign = 'center';
    const tw = ctx.measureText(toast.text).width + 30;
    ctx.globalAlpha = Math.min(1, toast.t * 3);
    ctx.fillStyle = 'rgba(10,0,0,0.85)'; ctx.fillRect(W / 2 - tw / 2, 104, tw, 28);
    ctx.strokeStyle = '#8a1a1a'; ctx.strokeRect(W / 2 - tw / 2, 104, tw, 28);
    ctx.fillStyle = '#f2e6e6'; ctx.fillText(toast.text, W / 2, 123);
    ctx.globalAlpha = 1;
  }
}

function drawBanner() {
  if (!banner) return;
  const lines = banner.text.split('\n');
  const h = 30 + lines.length * 36;
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, H / 2 - h / 2 - 20, W, h);
  ctx.textAlign = 'center'; ctx.font = 'bold 28px monospace';
  ctx.shadowColor = banner.color; ctx.shadowBlur = 16; ctx.fillStyle = banner.color;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - h / 2 + 22 + i * 36));
  ctx.shadowBlur = 0;
}

function wrapText(text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function drawDialog() {
  if (!dialog) return;
  const x = 20, y = H - 140, w = W - 40, h = 124;
  ctx.fillStyle = 'rgba(6,6,8,0.92)'; ctx.fillRect(x, y, w, h);
  const col = SPEAKER_COLOR[dialog.who] || '#ddd';
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  // Name tag
  ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left';
  const nw = ctx.measureText(dialog.who).width + 24;
  ctx.fillStyle = '#0a0a0c'; ctx.fillRect(x + 16, y - 14, nw, 26);
  ctx.strokeRect(x + 16, y - 14, nw, 26);
  ctx.fillStyle = col; ctx.fillText(dialog.who, x + 28, y + 4);
  // Typewriter text
  ctx.font = '17px monospace'; ctx.fillStyle = '#eee';
  const shown = dialog.text.slice(0, Math.floor(dialog.shown));
  wrapText(shown, w - 50).slice(0, 4).forEach((l, i) => ctx.fillText(l, x + 24, y + 38 + i * 24));
  if (dialog.shown >= dialog.text.length && Math.floor(time * 3) % 2 === 0) {
    ctx.font = '12px monospace'; ctx.textAlign = 'right'; ctx.fillStyle = col;
    ctx.fillText('▼ E', x + w - 14, y + h - 12);
  }
}

// Main menu background: dark hallway, flickering light, green zombies shuffling
function renderMenuBg() {
  ctx.fillStyle = '#060708'; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#0c0d10' : '#0e0f13';
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
  const on = game.flick > 0.8;
  if (on) {
    const g = ctx.createRadialGradient(W / 2, 60, 0, W / 2, 60, 420);
    g.addColorStop(0, 'rgba(255,240,200,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = on ? '#fff3c8' : '#333'; ctx.fillRect(W / 2 - 30, 40, 60, 6);
  for (const z of menuZombies) {
    drawPerson(z.x, z.y, PAL.zombie, z.dir, frameOf(z), { zombie: true, scale: 3, alpha: on ? 1 : 0.6 });
    drawEyeGlow(z.x, z.y, z.dir, 3);
  }
}

/* ======================= 17. UI OVERLAYS ============================== */
const OVERLAYS = ['menu', 'controls', 'pause', 'gameover', 'complete', 'keypad'];
function showOverlay(id) { OVERLAYS.forEach((o) => document.getElementById(o).classList.toggle('hidden', o !== id)); }
function hideOverlays() { OVERLAYS.forEach((o) => document.getElementById(o).classList.add('hidden')); }

function newGame() {
  game.hearts = 3; game.charges = 0; game.hasStun = false;
  clearScript(); END = null;
  hideOverlays();
  state = 'playing';
  fade = 1; fadeTarget = 1;
  loadLevel('GF');
  script.unshift(fadeTo(0));
}
function retry() {
  game.charges = game.snap.charges; game.hasStun = game.snap.hasStun;
  clearScript(); hideOverlays();
  state = 'playing';
  fade = 1; fadeTarget = 1;
  loadLevel(game.level, { escort: game.escort, retry: true });
  script.unshift(fadeTo(0));
}
function toMenu() {
  clearScript(); state = 'menu'; fade = 0; fadeTarget = 0; showOverlay('menu');
}
function pauseGame() { state = 'paused'; showOverlay('pause'); }
function resumeGame() { state = 'playing'; hideOverlays(); }

document.getElementById('btn-start').onclick = () => { audio(); newGame(); };
document.getElementById('btn-controls').onclick = () => { state = 'controls'; showOverlay('controls'); };
document.getElementById('btn-back').onclick = () => { state = 'menu'; showOverlay('menu'); };
document.getElementById('btn-resume').onclick = resumeGame;
document.getElementById('btn-pause-menu').onclick = toMenu;
document.getElementById('btn-retry').onclick = retry;
document.getElementById('btn-go-menu').onclick = toMenu;
document.getElementById('btn-again').onclick = () => { audio(); newGame(); };
const muteBtn = document.getElementById('mute');
muteBtn.onclick = () => { muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊'; muteBtn.blur(); };

/* ----- Keypad (Floor 2 riddle) ----- */
let kpCode = '';
const kpDisplay = document.getElementById('kp-display');
const kpStatus = document.getElementById('kp-status');
const kpKeys = document.getElementById('kp-keys');
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch) => {
  const b = document.createElement('button');
  b.textContent = ch; b.onclick = () => kpPress(ch);
  kpKeys.appendChild(b);
});
document.getElementById('kp-del').onclick = () => kpDelete();
document.getElementById('kp-enter').onclick = () => kpSubmit();
document.getElementById('kp-close').onclick = () => closeKeypad();

function kpSetStatus(text, cls = '') { kpStatus.textContent = text; kpStatus.className = 'kp-status ' + cls; }
function kpRefresh() { kpDisplay.textContent = kpCode || '_'; }
function openKeypad() {
  state = 'keypad'; kpCode = ''; kpRefresh();
  const left = 3 - ((game.flags.wrong || 0) % 3);
  kpSetStatus(`ENTER PASSWORD  (${left} tries before alarm)`);
  keys.clear();
  showOverlay('keypad');
}
function closeKeypad() { hideOverlays(); state = 'playing'; keys.clear(); }
function kpPress(ch) { if (kpCode.length < 8) { kpCode += ch; sfx.blip(); kpRefresh(); } }
function kpDelete() { kpCode = kpCode.slice(0, -1); kpRefresh(); }
function kpSubmit() {
  if (!kpCode) return;
  if (kpCode === 'ECHO') {
    kpSetStatus('ACCESS GRANTED', 'ok');
    setTimeout(() => { closeKeypad(); Logic.F2.granted(); }, 600);
    sfx.grant();
    return;
  }
  game.flags.wrong = (game.flags.wrong || 0) + 1;
  sfx.deny(); kpCode = ''; kpRefresh();
  if (game.flags.wrong % 3 === 0) {
    kpSetStatus('ACCESS DENIED — ALARM!', 'bad');
    setTimeout(() => { closeKeypad(); Logic.F2.alarm(); }, 600);
  } else {
    kpSetStatus(`ACCESS DENIED  (${3 - (game.flags.wrong % 3)} tries before alarm)`, 'bad');
  }
}

/* ======================= 18. MAIN LOOP ================================ */
function update(dt) {
  time += dt;
  // Global light flicker
  const L = LEVELS[game.level];
  game.flickT -= dt;
  if (game.flickT <= 0) {
    game.flickT = rand(0.05, 0.35);
    const chance = state === 'menu' || state === 'controls' ? 0.3 : L.flickChance;
    game.flick = Math.random() < chance ? rand(0.3, 0.7) : rand(0.92, 1.05);
  }
  // Fade toward its target
  if (fade < fadeTarget) fade = Math.min(fadeTarget, fade + dt * 1.6);
  else if (fade > fadeTarget) fade = Math.max(fadeTarget, fade - dt * 1.6);
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
  shake = Math.max(0, shake - dt);
  flashRed = Math.max(0, flashRed - dt);

  // Pause toggle
  if (pressed.has('pause')) {
    if (state === 'playing') { pauseGame(); return; }
    if (state === 'paused') { resumeGame(); return; }
  }
  // Continue dialogue
  if (dialog && (pressed.has('e') || pressed.has('enter') || pressed.has('space'))) { sayAdvance = true; pressed.delete('e'); pressed.delete('enter'); pressed.delete('space'); }

  if (state === 'menu' || state === 'controls') {
    for (const z of menuZombies) { z.x += 18 * dt; z.walk += dt * 0.6; if (z.x > W + 40) z.x = -40; }
    return;
  }
  if (state === 'ending') { updateScript(dt); if (END) updateEnding(dt); return; }
  if (state !== 'playing') return;

  updateScript(dt);
  const busy = script.length > 0;
  game.invuln = Math.max(0, game.invuln - dt);
  game.stunCd = Math.max(0, game.stunCd - dt);
  if (!busy) {
    updatePlayer(dt);
    if (state !== 'playing') return;
    if (game.escort) { updateFollower(dt); updateEscort(); }
    else { const lg = Logic[game.level]; if (lg.update) lg.update(dt); }
  }
  updateZombies(dt, busy && !game.flags.zombiesLive);
  if (!busy) updateBoss(dt);
  for (const p of game.pulses) p.t += dt;
  game.pulses = game.pulses.filter((p) => p.t < 0.35);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  pressed.clear();
  requestAnimationFrame(loop);
}

// Initial setup: menu zombies + an initial map so the canvas has something to show
for (let i = 0; i < 4; i++) menuZombies.push({ x: i * 260 + 40, y: 590, dir: 'right', walk: i * 0.3 });
game.tiles = LEVELS.GF.map.map((r) => r.split(''));
showOverlay('menu');
requestAnimationFrame(loop);
