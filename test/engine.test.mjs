import assert from "node:assert/strict";
import test from "node:test";
import { FRUITS, WORLD, createGame, drop, setAim, step } from "../engine.mjs";

function settle(game, seconds = 3) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) step(game, 1 / 60);
}

test("a dropped fruit comes to rest on the floor", () => {
  const game = createGame(() => 0);
  setAim(game, 200);
  assert.equal(drop(game), true);
  settle(game, 3);
  assert.equal(game.bodies.length, 1);
  const body = game.bodies[0];
  assert.ok(Math.abs(body.y - (WORLD.floor - body.r)) < 1.5);
  assert.ok(Math.abs(body.vy) < 1);
  assert.ok(body.x > WORLD.left && body.x < WORLD.right);
});

test("two cherries combine into a strawberry and score it", () => {
  const game = createGame(() => 0);
  game.bodies.push(
    { id: 1, level: 0, x: 180, y: 400, vx: 20, vy: 0, r: FRUITS[0].r, age: 2, fresh: false },
    { id: 2, level: 0, x: 200, y: 400, vx: -20, vy: 0, r: FRUITS[0].r, age: 2, fresh: false },
  );
  game.nextId = 3;
  let saw = null;
  for (let i = 0; i < 40 && !saw; i += 1) {
    const merges = step(game, 1 / 60);
    saw = merges.find((merge) => merge.level === 1) || null;
  }
  assert.ok(saw);
  assert.equal(saw.name, "Strawberry");
  assert.equal(game.score, FRUITS[1].score);
  assert.ok(game.bodies.some((body) => body.level === 1));
});

test("different fruits do not merge", () => {
  const game = createGame(() => 0);
  game.bodies.push(
    { id: 1, level: 0, x: 200, y: 400, vx: 0, vy: 0, r: FRUITS[0].r, age: 2, fresh: false },
    { id: 2, level: 1, x: 210, y: 400, vx: 0, vy: 0, r: FRUITS[1].r, age: 2, fresh: false },
  );
  game.nextId = 3;
  step(game, 1 / 60);
  assert.equal(game.score, 0);
  assert.equal(game.bodies.length, 2);
});

test("two watermelons stay two watermelons", () => {
  const game = createGame(() => 0);
  const r = FRUITS[10].r;
  game.bodies.push(
    { id: 1, level: 10, x: 160, y: 400, vx: 30, vy: 0, r, age: 2, fresh: false },
    { id: 2, level: 10, x: 200, y: 400, vx: -30, vy: 0, r, age: 2, fresh: false },
  );
  game.nextId = 3;
  for (let i = 0; i < 20; i += 1) step(game, 1 / 60);
  assert.equal(game.bodies.filter((body) => body.level === 10).length, 2);
  assert.equal(game.score, 0);
});

test("the fruit in hand is only ever a small one", () => {
  const game = createGame(() => 0.99);
  assert.ok(game.current < 5);
  assert.ok(game.next < 5);
  drop(game);
  assert.ok(game.current < 5);
  assert.ok(game.next < 5);
});

test("a second drop waits out the lock", () => {
  const game = createGame(() => 0);
  assert.equal(drop(game), true);
  assert.equal(drop(game), false);
  for (let i = 0; i < 30; i += 1) step(game, 1 / 60);
  assert.equal(drop(game), true);
});

test("a short round stays inside the crate", () => {
  const game = createGame(() => 0.37);
  let drops = 0;
  for (let i = 0; i < 60 * 25 && game.alive && drops < 16; i += 1) {
    if (game.dropLock === 0) {
      setAim(game, WORLD.left + 50 + (drops % 6) * 48);
      if (drop(game)) drops += 1;
    }
    step(game, 1 / 60);
  }
  for (let i = 0; i < 180 && game.alive; i += 1) step(game, 1 / 60);
  assert.ok(drops >= 8);
  assert.ok(game.score >= 0);
  for (const body of game.bodies) {
    assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y));
    assert.ok(body.x > WORLD.left - 0.5 && body.x < WORLD.right + 0.5);
    assert.ok(body.y < WORLD.floor + 0.5);
    assert.ok(body.y > WORLD.rim - body.r - 40);
    assert.ok(Math.hypot(body.vx, body.vy) < 2500);
  }
});

test("a fruit stuck above the line ends the round", () => {
  const game = createGame(() => 0);
  const r = FRUITS[10].r;
  const x = (WORLD.left + WORLD.right) / 2;
  game.bodies.push(
    { id: 1, level: 10, x, y: WORLD.floor - r, vx: 0, vy: 0, r, age: 3, fresh: false },
    { id: 2, level: 10, x, y: WORLD.floor - r * 3, vx: 0, vy: 0, r, age: 3, fresh: false },
  );
  game.nextId = 3;
  assert.ok(game.bodies[1].y - r < WORLD.danger);
  settle(game, 2);
  assert.equal(game.alive, false);
});
