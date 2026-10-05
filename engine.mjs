export const WORLD = {
  width: 420,
  height: 680,
  left: 36,
  right: 384,
  floor: 640,
  rim: 128,
  danger: 168,
  spawnY: 78,
};

export const FRUITS = [
  { id: "cherry", name: "Cherry", r: 22, score: 1, fill: "#e23b4a", shade: "#b42334", mark: "#f7d5d8" },
  { id: "strawberry", name: "Strawberry", r: 28, score: 3, fill: "#ef4d5b", shade: "#c43140", mark: "#ffe8a3" },
  { id: "grape", name: "Grape", r: 36, score: 6, fill: "#7d4eaf", shade: "#5b3484", mark: "#e4d2f5" },
  { id: "orange", name: "Orange", r: 46, score: 10, fill: "#f28c28", shade: "#d36e12", mark: "#ffe0b8" },
  { id: "lemon", name: "Lemon", r: 56, score: 15, fill: "#f2c84b", shade: "#d9a41f", mark: "#fff4c8" },
  { id: "apple", name: "Apple", r: 68, score: 21, fill: "#d83a3a", shade: "#a82424", mark: "#f6d2d2" },
  { id: "pear", name: "Pear", r: 80, score: 28, fill: "#c5d86a", shade: "#8eae3e", mark: "#f4f8d4" },
  { id: "peach", name: "Peach", r: 94, score: 36, fill: "#f6b3a0", shade: "#e08b74", mark: "#fff0ea" },
  { id: "pineapple", name: "Pineapple", r: 108, score: 45, fill: "#e6b423", shade: "#c48a12", mark: "#fff1c2" },
  { id: "melon", name: "Melon", r: 122, score: 55, fill: "#9ccc65", shade: "#6a9a38", mark: "#eef6d4" },
  { id: "watermelon", name: "Watermelon", r: 136, score: 66, fill: "#2f9a52", shade: "#1c6b38", mark: "#b7e7c4" },
];

const MAX_LEVEL = FRUITS.length - 1;
const DROP_LEVELS = 5;
const GRAVITY = 2400;
const SUBSTEP = 1 / 120;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rollSmall(rng) {
  return Math.floor(rng() * DROP_LEVELS);
}

export function createGame(rng = Math.random) {
  const game = {
    bodies: [],
    nextId: 1,
    score: 0,
    alive: true,
    overTimer: 0,
    dropLock: 0,
    acc: 0,
    current: 0,
    next: 0,
    aimX: (WORLD.left + WORLD.right) / 2,
    rng,
  };
  game.current = rollSmall(rng);
  game.next = rollSmall(rng);
  game.aimX = clampAim(game, game.aimX);
  return game;
}

function clampAim(game, x) {
  const fruit = FRUITS[game.current];
  return clamp(x, WORLD.left + fruit.r, WORLD.right - fruit.r);
}

export function setAim(game, x) {
  if (!game.alive) return;
  game.aimX = clampAim(game, x);
}

export function drop(game) {
  if (!game.alive || game.dropLock > 0) return false;
  const fruit = FRUITS[game.current];
  game.bodies.push({
    id: game.nextId,
    level: game.current,
    x: game.aimX,
    y: WORLD.spawnY,
    vx: 0,
    vy: 0,
    r: fruit.r,
    age: 0,
    fresh: false,
  });
  game.nextId += 1;
  game.current = game.next;
  game.next = rollSmall(game.rng);
  game.aimX = clampAim(game, game.aimX);
  game.dropLock = 0.4;
  return true;
}

function mass(body) {
  return body.r * body.r;
}

function constrainWalls(body) {
  if (body.x - body.r < WORLD.left) {
    body.x = WORLD.left + body.r;
    if (body.vx < 0) body.vx *= -0.12;
  }
  if (body.x + body.r > WORLD.right) {
    body.x = WORLD.right - body.r;
    if (body.vx > 0) body.vx *= -0.12;
  }
  if (body.y + body.r > WORLD.floor) {
    body.y = WORLD.floor - body.r;
    if (body.vy > 0) body.vy *= -0.08;
    body.vx *= 0.82;
  }
}

function collide(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (dist >= min) return;
  if (dist < 0.001) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const same = a.level === b.level && a.level < MAX_LEVEL && !a.fresh && !b.fresh;
  if (same) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = min - dist;
  const ma = mass(a);
  const mb = mass(b);
  const share = 1 / (ma + mb);
  a.x -= nx * overlap * mb * share;
  a.y -= ny * overlap * mb * share;
  b.x += nx * overlap * ma * share;
  b.y += ny * overlap * ma * share;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const relN = rvx * nx + rvy * ny;
  if (relN < 0) {
    const impulse = -(1.05 * relN) / (1 / ma + 1 / mb);
    a.vx -= (impulse * nx) / ma;
    a.vy -= (impulse * ny) / ma;
    b.vx += (impulse * nx) / mb;
    b.vy += (impulse * ny) / mb;
  }
  const tx = -ny;
  const ty = nx;
  const relT = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
  const friction = relT * 0.28;
  a.vx += (friction * tx) / 2;
  a.vy += (friction * ty) / 2;
  b.vx -= (friction * tx) / 2;
  b.vy -= (friction * ty) / 2;
}

function physics(game, dt) {
  for (const body of game.bodies) {
    body.vy += GRAVITY * dt;
    body.vx *= Math.exp(-0.4 * dt);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.age += dt;
  }
  for (let pass = 0; pass < 6; pass += 1) {
    for (const body of game.bodies) constrainWalls(body);
    const list = game.bodies;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) collide(list[i], list[j]);
    }
  }
  for (const body of game.bodies) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed < 12) {
      body.vx = 0;
      body.vy = 0;
    }
  }
}

function resolveMerges(game) {
  const list = game.bodies;
  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (a.level !== b.level || a.level >= MAX_LEVEL || a.fresh || b.fresh) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const overlap = a.r + b.r - dist;
      if (overlap > 0.5) pairs.push({ a, b, overlap });
    }
  }
  pairs.sort((p, q) => q.overlap - p.overlap);
  const used = new Set();
  const merges = [];
  const remove = new Set();
  const born = [];
  for (const pair of pairs) {
    if (used.has(pair.a.id) || used.has(pair.b.id)) continue;
    used.add(pair.a.id);
    used.add(pair.b.id);
    remove.add(pair.a.id);
    remove.add(pair.b.id);
    const level = pair.a.level + 1;
    const fruit = FRUITS[level];
    const body = {
      id: game.nextId,
      level,
      x: (pair.a.x + pair.b.x) / 2,
      y: (pair.a.y + pair.b.y) / 2,
      vx: (pair.a.vx + pair.b.vx) / 2,
      vy: Math.min(0, (pair.a.vy + pair.b.vy) / 2) - 30,
      r: fruit.r,
      age: 1,
      fresh: true,
    };
    game.nextId += 1;
    constrainWalls(body);
    born.push(body);
    game.score += fruit.score;
    merges.push({ x: body.x, y: body.y, level, score: fruit.score, name: fruit.name });
  }
  if (!born.length) return merges;
  game.bodies = list.filter((body) => !remove.has(body.id)).concat(born);
  return merges;
}

function updateDanger(game, dt) {
  let threat = false;
  for (const body of game.bodies) {
    const speed = Math.hypot(body.vx, body.vy);
    const top = body.y - body.r;
    if (body.age > 0.45 && speed < 90 && top < WORLD.danger) threat = true;
  }
  if (threat) game.overTimer += dt;
  else game.overTimer = Math.max(0, game.overTimer - dt);
  if (game.overTimer > 1.05) game.alive = false;
}

export function step(game, dt) {
  if (!game.alive) return [];
  const capped = Math.min(Math.max(dt, 0), 0.05);
  if (game.dropLock > 0) game.dropLock = Math.max(0, game.dropLock - capped);
  for (const body of game.bodies) body.fresh = false;
  game.acc += capped;
  let guard = 0;
  while (game.acc >= SUBSTEP && guard < 8) {
    game.acc -= SUBSTEP;
    guard += 1;
    physics(game, SUBSTEP);
  }
  const merges = resolveMerges(game);
  updateDanger(game, capped);
  return merges;
}
