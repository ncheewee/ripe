import { FRUITS, WORLD, createGame, drop, setAim, step } from "./engine.mjs";

const BEST_KEY = "ripe-best";

const board = document.getElementById("board");
const preview = document.getElementById("preview");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const scoreBox = document.getElementById("score-box");
const nextName = document.getElementById("next-name");
const newBtn = document.getElementById("new");
const installBtn = document.getElementById("install");
const note = document.getElementById("note");
const net = document.getElementById("net");
const status = document.getElementById("status");
const app = document.getElementById("app");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalActions = document.getElementById("modal-actions");

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let game = createGame();
let best = readBest();
let broke = false;
let modalKind = null;
let deferredPrompt = null;
let pointerId = null;
let effects = [];
let shake = 0;
let shownNext = -1;
let lastScore = -1;
let overShown = false;
const born = new Map();

function readBest() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
  } catch {
    return 0;
  }
}

function writeBest() {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Private mode can block storage. The crate still plays for this visit.
  }
}

function setStatus(text) {
  status.textContent = text;
}

function rememberBodies(now) {
  const live = new Set();
  for (const body of game.bodies) {
    live.add(body.id);
    if (!born.has(body.id)) born.set(body.id, body.fresh ? now : now - 1000);
  }
  for (const id of born.keys()) {
    if (!live.has(id)) born.delete(id);
  }
}

function startNew() {
  game = createGame();
  broke = false;
  overShown = false;
  effects = [];
  shake = 0;
  born.clear();
  shownNext = -1;
  lastScore = -1;
  rememberBodies(performance.now() - 1000);
  closeModal();
  drawPreview();
  syncHud(0);
  setStatus("New game.");
}

function syncHud(gained) {
  if (game.score > best) {
    best = game.score;
    broke = true;
    writeBest();
  }
  if (game.score !== lastScore) {
    scoreEl.textContent = String(game.score);
    lastScore = game.score;
  }
  bestEl.textContent = String(best);
  if (gained > 0) {
    scoreBox.classList.remove("bump");
    void scoreBox.offsetWidth;
    scoreBox.classList.add("bump");
    const floater = document.createElement("em");
    floater.className = "gain";
    floater.textContent = `+${gained}`;
    scoreBox.appendChild(floater);
    floater.addEventListener("animationend", () => floater.remove());
    setTimeout(() => floater.remove(), 700);
  }
}

function closeModal() {
  modalKind = null;
  modal.hidden = true;
  app.removeAttribute("aria-hidden");
  document.activeElement?.blur?.();
}

function focusables() {
  return [...modalActions.querySelectorAll("button:not([disabled])")];
}

function openModal(kind) {
  modalKind = kind;
  const scoreLine = broke
    ? `Score ${game.score}. That's a new best.`
    : `Score ${game.score}. Best is ${best}.`;
  const copy = {
    over: ["Crate's full", scoreLine, ["fresh"]],
    confirm: ["New game?", "This crate clears. Your best score stays.", ["fresh", "dismiss"]],
  };
  const [title, body, actions] = copy[kind];
  modalTitle.textContent = title;
  modalBody.textContent = body;
  modalActions.replaceChildren();
  const labels = {
    fresh: [kind === "confirm" ? "Start over" : "New game", false],
    dismiss: ["Keep playing", true],
  };
  for (const action of actions) {
    const [label, ghost] = labels[action];
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (ghost) button.className = "ghost";
    button.addEventListener("click", () => runAction(action));
    modalActions.appendChild(button);
  }
  modal.hidden = false;
  app.setAttribute("aria-hidden", "true");
  focusables()[0]?.focus();
}

function runAction(action) {
  if (action === "dismiss") {
    closeModal();
    return;
  }
  if (action === "fresh") startNew();
}

function askNewGame() {
  if (modalKind) return;
  if (game.bodies.length === 0 && game.score === 0) startNew();
  else openModal("confirm");
}

function endRound() {
  if (overShown) return;
  overShown = true;
  setStatus(`Crate's full. Score ${game.score}.`);
  openModal("over");
}

function worldX(event) {
  const rect = board.getBoundingClientRect();
  if (!rect.width) return game.aimX;
  return ((event.clientX - rect.left) / rect.width) * WORLD.width;
}

function tryDrop() {
  if (!game.alive || modalKind) return;
  const dropped = drop(game);
  if (!dropped) return;
  const body = game.bodies[game.bodies.length - 1];
  setStatus(`Dropped a ${FRUITS[body.level].name}.`);
}

function spawnJuice(merge) {
  if (reduced) return;
  const fruit = FRUITS[merge.level];
  const count = merge.level === FRUITS.length - 1 ? 16 : 9;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 70 + Math.random() * 150;
    effects.push({
      x: merge.x,
      y: merge.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 50,
      life: 0.42,
      age: 0,
      r: 2.2 + Math.random() * 2.4,
      color: i % 2 ? fruit.mark : fruit.fill,
    });
  }
  shake = Math.min(1, shake + (merge.level === FRUITS.length - 1 ? 1 : 0.45));
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function fruitFill(ctx, level, x, y, r) {
  const fruit = FRUITS[level];
  const gradient = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y + r * 0.15, r);
  gradient.addColorStop(0, fruit.mark);
  gradient.addColorStop(0.42, fruit.fill);
  gradient.addColorStop(1, fruit.shade);
  ctx.fillStyle = gradient;
}

function gloss(ctx, x, y, r) {
  ctx.save();
  circle(ctx, x, y, r);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.4, r * 0.3, r * 0.16, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function stem(ctx, x, y, r, lean = 0.2) {
  ctx.strokeStyle = "#5c3a22";
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.62);
  ctx.quadraticCurveTo(x + r * 0.15, y - r * 0.95, x + r * lean, y - r * 1.18);
  ctx.stroke();
}

function leaf(ctx, x, y, r, tilt = -0.7) {
  ctx.fillStyle = "#3c8f3a";
  ctx.beginPath();
  ctx.ellipse(x + r * 0.32, y - r * 0.92, r * 0.28, r * 0.13, tilt, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(30, 80, 30, 0.45)";
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.beginPath();
  ctx.moveTo(x + r * 0.08, y - r * 0.9);
  ctx.lineTo(x + r * 0.52, y - r * 0.98);
  ctx.stroke();
}

function paintBody(ctx, level, x, y, r) {
  fruitFill(ctx, level, x, y, r);
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(42, 33, 28, 0.22)";
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.stroke();
}

function clipDisc(ctx, x, y, r, draw) {
  ctx.save();
  circle(ctx, x, y, r * 0.98);
  ctx.clip();
  draw();
  ctx.restore();
}

function drawFruit(ctx, level, x, y, r) {
  if (level === 4) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.78, 1.12);
    paintBody(ctx, level, 0, 0, r);
    gloss(ctx, 0, 0, r);
    ctx.restore();
    return;
  }

  if (level === 6) {
    fruitFill(ctx, level, x, y - r * 0.42, r * 0.62);
    circle(ctx, x, y - r * 0.55, r * 0.5);
    ctx.fill();
  }

  paintBody(ctx, level, x, y, r);
  const fruit = FRUITS[level];

  if (level === 0) {
    stem(ctx, x, y, r, 0.35);
    leaf(ctx, x, y, r, -0.5);
  } else if (level === 1) {
    ctx.fillStyle = "#3f8f3a";
    for (const angle of [-0.7, 0, 0.7]) {
      ctx.beginPath();
      ctx.ellipse(
        x + Math.sin(angle) * r * 0.28,
        y - r * 0.78,
        r * 0.2,
        r * 0.12,
        angle,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    clipDisc(ctx, x, y, r, () => {
      ctx.fillStyle = fruit.mark;
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const sx = x + (col - 1) * r * 0.36 + (row % 2) * r * 0.12;
          const sy = y - r * 0.25 + row * r * 0.28;
          ctx.beginPath();
          ctx.ellipse(sx, sy, r * 0.055, r * 0.085, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  } else if (level === 2) {
    clipDisc(ctx, x, y, r, () => {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      for (const [ox, oy] of [
        [-0.28, -0.15],
        [0.22, -0.28],
        [0, -0.48],
        [0.02, 0.18],
        [-0.24, 0.32],
        [0.3, 0.2],
      ]) {
        circle(ctx, x + ox * r, y + oy * r, r * 0.26);
        ctx.fill();
      }
    });
    stem(ctx, x, y, r, 0);
  } else if (level === 3) {
    clipDisc(ctx, x, y, r, () => {
      ctx.fillStyle = "rgba(255, 236, 210, 0.45)";
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        circle(ctx, x + Math.cos(angle) * r * 0.45, y + Math.sin(angle) * r * 0.45, r * 0.07);
        ctx.fill();
      }
    });
    ctx.fillStyle = "#3c8f3a";
    circle(ctx, x + r * 0.08, y - r * 0.82, r * 0.14);
    ctx.fill();
  } else if (level === 5) {
    stem(ctx, x - r * 0.05, y, r, 0.05);
    leaf(ctx, x, y, r);
    ctx.strokeStyle = fruit.shade;
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.arc(x, y - r * 0.78, r * 0.2, 0.15, Math.PI - 0.15);
    ctx.stroke();
  } else if (level === 6) {
    stem(ctx, x, y - r * 0.35, r * 0.7, 0.1);
  } else if (level === 7) {
    leaf(ctx, x - r * 0.1, y + r * 0.05, r * 0.8, -0.4);
    ctx.strokeStyle = "rgba(150, 60, 50, 0.4)";
    ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.55);
    ctx.quadraticCurveTo(x + r * 0.22, y, x - r * 0.02, y + r * 0.7);
    ctx.stroke();
  } else if (level === 8) {
    clipDisc(ctx, x, y, r, () => {
      ctx.strokeStyle = "rgba(110, 68, 12, 0.4)";
      ctx.lineWidth = Math.max(1, r * 0.045);
      for (let i = -5; i <= 5; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + i * r * 0.28 - r, y - r);
        ctx.lineTo(x + i * r * 0.28 + r, y + r);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + i * r * 0.28 + r, y - r);
        ctx.lineTo(x + i * r * 0.28 - r, y + r);
        ctx.stroke();
      }
    });
    ctx.fillStyle = "#2f8a38";
    for (const angle of [-0.55, -0.2, 0.15, 0.5]) {
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(angle) * r * 0.2, y - r * 0.95, r * 0.11, r * 0.34, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (level === 9) {
    clipDisc(ctx, x, y, r, () => {
      ctx.fillStyle = "rgba(70, 120, 40, 0.28)";
      for (const ox of [-0.48, -0.16, 0.16, 0.48]) {
        ctx.fillRect(x + ox * r - r * 0.07, y - r, r * 0.14, r * 2);
      }
    });
  } else if (level === 10) {
    clipDisc(ctx, x, y, r, () => {
      ctx.fillStyle = "rgba(10, 70, 32, 0.38)";
      for (const ox of [-0.55, 0, 0.55]) {
        ctx.beginPath();
        ctx.ellipse(x + ox * r * 0.72, y, r * 0.16, r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.strokeStyle = "rgba(210, 240, 200, 0.45)";
    ctx.lineWidth = Math.max(2, r * 0.07);
    circle(ctx, x, y, r * 0.9);
    ctx.stroke();
  }

  gloss(ctx, x, y, r);
}

function drawPreview() {
  if (game.next === shownNext && preview.width > 0) {
    nextName.textContent = FRUITS[game.next].name;
    return;
  }
  shownNext = game.next;
  const fruit = FRUITS[game.next];
  nextName.textContent = fruit.name;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const size = 84;
  preview.width = Math.round(size * dpr);
  preview.height = Math.round(size * dpr);
  const ctx = preview.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const shown = 15 + (fruit.r / FRUITS[4].r) * 18;
  drawFruit(ctx, game.next, size / 2, size / 2 + 6, shown);
}

function boardContext() {
  const rect = board.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round((rect.width * WORLD.height) / WORLD.width * dpr));
  if (board.width !== width || board.height !== height) {
    board.width = width;
    board.height = height;
  }
  const ctx = board.getContext("2d");
  const scale = (rect.width / WORLD.width) * dpr;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return ctx;
}

function drawCrate(ctx, now) {
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  sky.addColorStop(0, "#ffe3b0");
  sky.addColorStop(0.22, "#f7ead4");
  sky.addColorStop(1, "#f4efe4");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const sun = ctx.createRadialGradient(78, 64, 4, 78, 64, 70);
  sun.addColorStop(0, "rgba(255, 236, 170, 0.95)");
  sun.addColorStop(1, "rgba(255, 214, 120, 0)");
  ctx.fillStyle = sun;
  circle(ctx, 78, 54, 70);
  ctx.fill();

  const innerW = WORLD.right - WORLD.left;
  const innerH = WORLD.floor - WORLD.rim;
  const cavity = ctx.createLinearGradient(0, WORLD.rim, 0, WORLD.floor);
  cavity.addColorStop(0, "#f8e7c4");
  cavity.addColorStop(1, "#e7c48a");
  ctx.fillStyle = cavity;
  ctx.fillRect(WORLD.left, WORLD.rim, innerW, innerH);

  if (game.overTimer > 0) {
    const wash = ctx.createLinearGradient(0, WORLD.rim, 0, WORLD.danger + 30);
    const alpha = Math.min(0.38, game.overTimer / 1.05 * 0.38);
    wash.addColorStop(0, `rgba(226, 59, 74, ${alpha})`);
    wash.addColorStop(1, "rgba(226, 59, 74, 0)");
    ctx.fillStyle = wash;
    ctx.fillRect(WORLD.left, WORLD.rim, innerW, WORLD.danger - WORLD.rim + 24);
  }

  ctx.save();
  ctx.strokeStyle = game.overTimer > 0 ? "rgba(196, 45, 59, 0.85)" : "rgba(196, 45, 59, 0.4)";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(WORLD.left + 10, WORLD.danger);
  ctx.lineTo(WORLD.right - 10, WORLD.danger);
  ctx.stroke();
  ctx.restore();

  const shade = ctx.createLinearGradient(0, WORLD.rim, 0, WORLD.rim + 36);
  shade.addColorStop(0, "rgba(90, 48, 20, 0.16)");
  shade.addColorStop(1, "rgba(90, 48, 20, 0)");
  ctx.fillStyle = shade;
  ctx.fillRect(WORLD.left, WORLD.rim, innerW, 36);

  ctx.save();
  if (shake > 0.01 && !reduced) ctx.translate(Math.sin(now / 22) * shake * 5, 0);
  const bodies = [...game.bodies].sort((a, b) => a.y - b.y);
  for (const body of bodies) {
    const age = (now - (born.get(body.id) ?? now)) / 180;
    const pop = reduced ? 1 : Math.min(1, 0.72 + 0.28 * Math.max(0, age));
    ctx.save();
    ctx.translate(body.x, body.y + body.r * 0.78);
    ctx.fillStyle = "rgba(80, 46, 18, 0.16)";
    ctx.beginPath();
    ctx.ellipse(0, 0, body.r * 0.72, body.r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.scale(pop, pop);
    drawFruit(ctx, body.level, 0, 0, body.r);
    ctx.restore();
  }
  ctx.restore();

  function plank(x, y, w, h) {
    const grain = ctx.createLinearGradient(x, y, x + w, y);
    grain.addColorStop(0, "#c48955");
    grain.addColorStop(0.18, "#8d552f");
    grain.addColorStop(0.5, "#6e4328");
    grain.addColorStop(0.82, "#a86b40");
    grain.addColorStop(1, "#5a341c");
    ctx.fillStyle = grain;
    ctx.fillRect(x, y, w, h);
  }

  plank(8, WORLD.rim - 8, WORLD.left - 4, WORLD.height - (WORLD.rim - 8));
  plank(WORLD.right - 4, WORLD.rim - 8, WORLD.width - WORLD.right - 4, WORLD.height - (WORLD.rim - 8));
  plank(8, WORLD.floor - 8, WORLD.width - 16, WORLD.height - (WORLD.floor - 8));

  ctx.strokeStyle = "rgba(255, 236, 214, 0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, WORLD.rim);
  ctx.lineTo(14, WORLD.height - 14);
  ctx.moveTo(WORLD.width - 14, WORLD.rim);
  ctx.lineTo(WORLD.width - 14, WORLD.height - 14);
  ctx.stroke();

  if (game.alive) {
    const fruit = FRUITS[game.current];
    const bob = reduced ? 0 : Math.sin(now / 260) * 3;
    let guideBottom = WORLD.floor - 14;
    for (const body of game.bodies) {
      if (Math.abs(body.x - game.aimX) < body.r + 6) {
        guideBottom = Math.min(guideBottom, body.y - body.r - 6);
      }
    }
    const guideTop = WORLD.spawnY + fruit.r + bob + 4;
    if (guideBottom > guideTop + 12) {
      ctx.save();
      ctx.strokeStyle = "rgba(42, 33, 28, 0.2)";
      ctx.setLineDash([3, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(game.aimX, guideTop);
      ctx.lineTo(game.aimX, guideBottom);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(game.aimX, WORLD.spawnY + bob);
    if (game.dropLock > 0) ctx.scale(0.9, 0.9);
    drawFruit(ctx, game.current, 0, 0, fruit.r);
    ctx.restore();
  }

  for (const speck of effects) {
    const left = 1 - speck.age / speck.life;
    ctx.globalAlpha = Math.max(0, left);
    ctx.fillStyle = speck.color;
    circle(ctx, speck.x, speck.y, speck.r * left);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function tickEffects(dt) {
  shake = Math.max(0, shake - dt * 1.6);
  for (const speck of effects) {
    speck.age += dt;
    speck.vy += 700 * dt;
    speck.x += speck.vx * dt;
    speck.y += speck.vy * dt;
  }
  effects = effects.filter((speck) => speck.age < speck.life);
}

let last = performance.now();
rememberBodies(last - 1000);

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (game.alive) {
    const merges = step(game, dt);
    let gained = 0;
    for (const merge of merges) {
      gained += merge.score;
      spawnJuice(merge);
      if (merge.level === FRUITS.length - 1) setStatus("Watermelon.");
      else setStatus(`${merge.name}. Plus ${merge.score}.`);
    }
    if (gained || game.score !== lastScore) syncHud(gained);
    rememberBodies(now);
    if (!game.alive) endRound();
  }
  tickEffects(dt);
  const ctx = boardContext();
  drawCrate(ctx, now);
  drawPreview();
  requestAnimationFrame(frame);
}

board.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !game.alive || modalKind) return;
  pointerId = event.pointerId;
  try {
    board.setPointerCapture(event.pointerId);
  } catch {
    // Capture can fail for an untrusted pointer. Aim still follows the move events.
  }
  setAim(game, worldX(event));
});

board.addEventListener("pointermove", (event) => {
  if (pointerId !== event.pointerId) return;
  setAim(game, worldX(event));
});

function finishPointer(event, shouldDrop) {
  if (pointerId !== event.pointerId) return;
  pointerId = null;
  setAim(game, worldX(event));
  if (shouldDrop) tryDrop();
}

board.addEventListener("pointerup", (event) => finishPointer(event, true));
board.addEventListener("pointercancel", (event) => finishPointer(event, false));

window.addEventListener("keydown", (event) => {
  if (modalKind && event.key === "Escape") {
    event.preventDefault();
    if (modalKind === "confirm") runAction("dismiss");
    return;
  }
  if (modalKind && event.key === "Tab") {
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  if (event.target instanceof Element && event.target.closest("button")) return;
  if (modalKind) return;

  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
    event.preventDefault();
    setAim(game, game.aimX - 18);
  } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
    event.preventDefault();
    setAim(game, game.aimX + 18);
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
  } else if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    if (!event.repeat) tryDrop();
  }
});

newBtn.addEventListener("click", askNewGame);

function syncNet() {
  net.hidden = navigator.onLine;
}

window.addEventListener("online", syncNet);
window.addEventListener("offline", syncNet);

const standalone =
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (standalone) note.textContent = "Drag to aim, then let go. Arrows and space work too.";
else if (ios) {
  note.textContent = "Drag to aim, then let go. To keep it: Share, then Add to Home Screen. It works offline after that.";
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try {
    await deferredPrompt.userChoice;
  } catch {
    // The prompt can be dismissed before a choice comes back.
  }
  deferredPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installBtn.hidden = true;
  note.textContent = "Drag to aim, then let go. Arrows and space work too.";
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Registration fails on file:// and on a few locked-down browsers. The game still plays online.
  });
}

syncHud(0);
drawPreview();
syncNet();
requestAnimationFrame(frame);
