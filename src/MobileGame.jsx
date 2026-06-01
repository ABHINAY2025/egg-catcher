import React from 'react';

const GAME_W = 640;
const GAME_H = 380;
const CHAR_W = 64;
const CHAR_H = 40;
const EGG_R = 14;
const CHAR_TOP = GAME_H - 60;
const GROUND_Y = GAME_H - 22;
const ROUND_MS = 60_000;
const COW_W = 30;
const COW_H = 22;
const OMELET_TTL = 5500;

export default function MobileGame({ username, onGameOver }) {
  const canvasRef = React.useRef(null);
  const [running, setRunning] = React.useState(false);
  const [score, setScore] = React.useState(0);

  const stateRef = React.useRef({
    keys: { left: false, right: false },
    char: { x: GAME_W / 2 - CHAR_W / 2 },
    eggs: [],
    omelets: [],
    cows: [],
    nextCowMs: 2500,
    clouds: [
      { x: 70, y: 44, w: 110, h: 38 },
      { x: 260, y: 30, w: 130, h: 44 },
      { x: 460, y: 50, w: 110, h: 38 },
    ],
    lastSpawn: 0,
    spawnGap: 1300,
    fallSpeed: 1.4,
    score: 0,
    running: false,
    elapsed: 0,
    flash: 0,
    timeLeft: ROUND_MS,
  });

  const endGameRef = React.useRef(null);
  endGameRef.current = async () => {
    const finalScore = stateRef.current.score;
    stateRef.current.running = false;
    setRunning(false);
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, score: finalScore }),
      }).then((r) => r.json());
      onGameOver({ score: finalScore, ...res });
    } catch {
      onGameOver({ score: finalScore, ok: false });
    }
  };

  React.useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let raf = 0;
    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min(48, now - last);
      last = now;
      const s = stateRef.current;

      if (s.running) {
        const speed = 4.6;
        if (s.keys.left) s.char.x -= speed;
        if (s.keys.right) s.char.x += speed;
        s.char.x = Math.max(8, Math.min(GAME_W - CHAR_W - 8, s.char.x));

        s.elapsed += dt;
        s.timeLeft = Math.max(0, s.timeLeft - dt);
        s.lastSpawn += dt;
        s.spawnGap = Math.max(550, 1300 - s.elapsed * 0.04);
        s.fallSpeed = Math.min(3.6, 1.4 + s.elapsed * 0.00012);
        if (s.lastSpawn >= s.spawnGap) {
          s.lastSpawn = 0;
          const cloud = s.clouds[Math.floor(Math.random() * s.clouds.length)];
          s.eggs.push({
            x: cloud.x + Math.random() * (cloud.w - 10) + 5,
            y: cloud.y + cloud.h - 4,
            vy: s.fallSpeed,
          });
        }

        for (const egg of s.eggs) egg.y += egg.vy * (dt / 16.67);

        const remaining = [];
        let scored = 0;
        const left = s.char.x;
        const right = s.char.x + CHAR_W;
        const top = CHAR_TOP - 6;
        const bottom = CHAR_TOP + CHAR_H;
        for (const egg of s.eggs) {
          const cx = Math.max(left, Math.min(egg.x, right));
          const cy = Math.max(top, Math.min(egg.y, bottom));
          const dx = egg.x - cx;
          const dy = egg.y - cy;
          if (dx * dx + dy * dy <= EGG_R * EGG_R) {
            scored += 1;
            continue;
          }
          if (egg.y >= GROUND_Y - 2) {
            s.omelets.push({ x: egg.x, y: GROUND_Y + 2, ttl: OMELET_TTL });
            continue;
          }
          remaining.push(egg);
        }
        s.eggs = remaining;

        s.omelets = s.omelets.filter((o) => (o.ttl -= dt) > 0);

        s.nextCowMs -= dt;
        if (s.nextCowMs <= 0 && s.cows.length < 2) {
          const fromLeft = Math.random() < 0.5;
          s.cows.push({
            x: fromLeft ? -COW_W : GAME_W + COW_W,
            dir: fromLeft ? 1 : -1,
            speed: 0.55 + Math.random() * 0.35,
            wobble: 0,
          });
          s.nextCowMs = 3500 + Math.random() * 4500;
        }

        const cowRemain = [];
        for (const cow of s.cows) {
          cow.x += cow.dir * cow.speed * (dt / 16.67);
          cow.wobble += dt;
          const cowCenter = cow.x + COW_W / 2;
          s.omelets = s.omelets.filter((o) => !(Math.abs(o.x - cowCenter) < 16));
          if (cow.x > -COW_W - 4 && cow.x < GAME_W + COW_W + 4) cowRemain.push(cow);
        }
        s.cows = cowRemain;

        if (scored > 0) {
          s.score += scored * 10;
          s.flash = 6;
          setScore(s.score);
        }
        if (s.flash > 0) s.flash -= 1;

        if (s.timeLeft <= 0) endGameRef.current?.();
      }

      draw(ctx, s);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const start = () => {
    const s = stateRef.current;
    s.score = 0;
    s.eggs = [];
    s.omelets = [];
    s.cows = [];
    s.nextCowMs = 3000;
    s.elapsed = 0;
    s.lastSpawn = 0;
    s.char.x = GAME_W / 2 - CHAR_W / 2;
    s.timeLeft = ROUND_MS;
    s.running = true;
    setScore(0);
    setRunning(true);
  };

  const press = (dir) => (e) => { e.preventDefault(); stateRef.current.keys[dir] = true; };
  const release = (dir) => (e) => { e.preventDefault(); stateRef.current.keys[dir] = false; };

  return (
    <section className="mgame">
      <div className="mgame__hud">
        <div className="mgame__hudCell">
          <span className="mgame__hudLabel">PLAYER</span>
          <span className="mgame__hudNum mgame__hudNum--sm">{username}</span>
        </div>
        <div className="mgame__hudCell">
          <span className="mgame__hudLabel">SCORE</span>
          <span className="mgame__hudNum">{String(score).padStart(4, '0')}</span>
        </div>
      </div>

      <div className="mgame__canvasWrap">
        <canvas ref={canvasRef} width={GAME_W} height={GAME_H} className="mgame__canvas" />
        {!running && (
          <div className="mgame__overlay">
            <div className="mgame__overlayInner">
              <div className="mgame__overlayTitle">EGG-CATCHER</div>
              <div className="mgame__overlayCopy">
                60-second round. Hold ◀ / ▶ to move.
              </div>
              <button className="mgame__startBtn" onClick={start}>START</button>
            </div>
          </div>
        )}
      </div>

      <div className="mgame__pad">
        <button
          type="button"
          className="mgame__btn mgame__btn--left"
          onPointerDown={press('left')}
          onPointerUp={release('left')}
          onPointerCancel={release('left')}
          onPointerLeave={release('left')}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Move left"
        >◀</button>
        <button
          type="button"
          className="mgame__btn mgame__btn--right"
          onPointerDown={press('right')}
          onPointerUp={release('right')}
          onPointerCancel={release('right')}
          onPointerLeave={release('right')}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Move right"
        >▶</button>
      </div>
    </section>
  );
}

/* ---------- drawing ---------- */

function draw(ctx, s) {
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
  grad.addColorStop(0, '#cfe9ff');
  grad.addColorStop(1, '#fde5b1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.fillStyle = '#ffd86b';
  pixelCircle(ctx, 580, 60, 22);

  ctx.fillStyle = '#b8dca0';
  ctx.fillRect(0, GROUND_Y, GAME_W, 22);
  ctx.fillStyle = '#88b86c';
  for (let x = 0; x < GAME_W; x += 18) ctx.fillRect(x, GROUND_Y, 8, 4);

  for (const c of s.clouds) drawCloud(ctx, c);

  for (const o of s.omelets) drawOmelet(ctx, o);
  for (const cow of s.cows) drawCow(ctx, cow);

  for (const e of s.eggs) drawEgg(ctx, e.x, e.y);
  drawBasket(ctx, s.char.x, CHAR_TOP);

  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255, 216, 107, ${s.flash * 0.06})`;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
  }

  drawTimeBar(ctx, s.timeLeft / ROUND_MS, s.running);

  if (!s.running) {
    ctx.fillStyle = 'rgba(26, 21, 48, 0.45)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
  }
}

function pixelCircle(ctx, cx, cy, r) {
  for (let y = -r; y <= r; y += 2) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - w, cy + y, w * 2, 2);
  }
}

function drawCloud(ctx, c) {
  const { x, y, w, h } = c;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 6, y, w - 12, h);
  ctx.fillRect(x, y + 8, w, h - 16);
  ctx.fillStyle = 'rgba(105, 116, 158, 0.35)';
  ctx.fillRect(x + 6, y + h, w - 12, 4);
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(x + Math.floor(w * 0.35), y + Math.floor(h * 0.45), 4, 4);
  ctx.fillRect(x + Math.floor(w * 0.55), y + Math.floor(h * 0.45), 4, 4);
}

function drawEgg(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(26, 21, 48, 0.18)';
  ctx.fillRect(cx - 8, cy + 12, 16, 3);
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(cx - 6, cy - 10, 12, 4);
  ctx.fillRect(cx - 8, cy - 6, 16, 14);
  ctx.fillRect(cx - 6, cy + 8, 12, 2);
  ctx.fillStyle = '#ffd86b';
  ctx.fillRect(cx + 1, cy - 2, 3, 3);
  ctx.fillRect(cx - 4, cy + 2, 2, 2);
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(cx - 6, cy - 11, 12, 1);
  ctx.fillRect(cx - 6, cy + 9, 12, 1);
  ctx.fillRect(cx - 9, cy - 6, 1, 14);
  ctx.fillRect(cx + 8, cy - 6, 1, 14);
}

function drawOmelet(ctx, o) {
  const { x, y, ttl } = o;
  const fade = ttl < 1200 ? Math.max(0.35, ttl / 1200) : 1;
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(x - 10, y - 2, 20, 4);
  ctx.fillRect(x - 8, y - 4, 16, 2);
  ctx.fillRect(x - 12, y, 24, 2);
  ctx.fillStyle = '#ffd86b';
  ctx.fillRect(x - 4, y - 2, 8, 4);
  ctx.fillRect(x - 3, y - 3, 6, 1);
  ctx.fillStyle = '#f0bf3a';
  ctx.fillRect(x - 2, y - 1, 4, 2);
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(x - 14, y + 1, 2, 2);
  ctx.fillRect(x + 12, y - 1, 2, 2);
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(x - 12, y - 1, 1, 3);
  ctx.fillRect(x + 11, y - 1, 1, 3);
  ctx.globalAlpha = 1;
}

function drawCow(ctx, cow) {
  const { x, dir, wobble } = cow;
  const bob = Math.floor(wobble / 120) % 2;
  const y = GROUND_Y - COW_H + 6 + bob;
  const flip = dir < 0;
  ctx.save();
  if (flip) {
    ctx.translate(x + COW_W, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, 0);
  }

  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(4, y + 4, 22, 10);
  ctx.fillRect(2, y + 6, 26, 6);
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(7, y + 5, 4, 3);
  ctx.fillRect(15, y + 8, 5, 3);
  ctx.fillRect(20, y + 5, 3, 2);
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(22, y + 2, 8, 8);
  ctx.fillRect(24, y, 4, 2);
  ctx.fillStyle = '#ffb79d';
  ctx.fillRect(28, y + 6, 3, 3);
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(26, y + 4, 1, 1);
  ctx.fillRect(23, y - 1, 1, 2);
  ctx.fillRect(27, y - 1, 1, 2);
  ctx.fillStyle = '#ffb79d';
  ctx.fillRect(10, y + 13, 4, 3);
  ctx.fillStyle = '#1a1530';
  const legY = y + 14;
  if (bob === 0) {
    ctx.fillRect(5, legY, 2, 6);
    ctx.fillRect(11, legY, 2, 4);
    ctx.fillRect(17, legY, 2, 6);
    ctx.fillRect(23, legY, 2, 4);
  } else {
    ctx.fillRect(5, legY, 2, 4);
    ctx.fillRect(11, legY, 2, 6);
    ctx.fillRect(17, legY, 2, 4);
    ctx.fillRect(23, legY, 2, 6);
  }
  ctx.fillRect(2, y + 5, 1, 4);

  ctx.fillStyle = '#1a1530';
  ctx.fillRect(2, y + 6, 26, 1);
  ctx.fillRect(2, y + 11, 26, 1);
  ctx.fillRect(2, y + 6, 1, 6);
  ctx.fillRect(27, y + 6, 1, 6);
  ctx.fillRect(22, y + 2, 1, 8);
  ctx.fillRect(30, y + 2, 1, 8);
  ctx.fillRect(22, y + 1, 9, 1);
  ctx.fillRect(22, y + 9, 9, 1);

  ctx.restore();
}

function drawBasket(ctx, x, y) {
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(x + 12, y - 14, CHAR_W - 24, 4);
  ctx.fillRect(x + 8, y - 10, 4, 8);
  ctx.fillRect(x + CHAR_W - 12, y - 10, 4, 8);

  ctx.fillStyle = '#ff9573';
  ctx.fillRect(x, y, CHAR_W, CHAR_H);
  ctx.fillStyle = '#ffb79d';
  ctx.fillRect(x + 4, y + 4, CHAR_W - 8, 6);
  ctx.fillStyle = '#ff9573';
  for (let i = 0; i < CHAR_W; i += 8) {
    ctx.fillRect(x + i, y + 12, 4, 4);
    ctx.fillRect(x + i + 4, y + 20, 4, 4);
    ctx.fillRect(x + i, y + 28, 4, 4);
  }
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(x, y, CHAR_W, 2);
  ctx.fillRect(x, y + CHAR_H - 2, CHAR_W, 2);
  ctx.fillRect(x, y, 2, CHAR_H);
  ctx.fillRect(x + CHAR_W - 2, y, 2, CHAR_H);
}

function drawTimeBar(ctx, ratio, running) {
  const ax = 8;
  const ay = 22;
  const aw = 16;
  const ah = GAME_H - 48;
  const inner = 3;
  const innerH = ah - inner * 2;
  const fillH = Math.max(0, Math.min(innerH, Math.floor(innerH * ratio)));

  ctx.fillStyle = '#1a1530';
  ctx.fillRect(ax, ay, aw, ah);
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(ax + inner, ay + inner, aw - inner * 2, ah - inner * 2);

  const waterColor = ratio > 0.4 ? '#5db7e8' : ratio > 0.18 ? '#ffd86b' : '#ff9573';
  ctx.fillStyle = waterColor;
  ctx.fillRect(ax + inner, ay + inner + (innerH - fillH), aw - inner * 2, fillH);

  if (fillH > 2 && running) {
    const surfaceY = ay + inner + (innerH - fillH);
    ctx.fillStyle = '#1a1530';
    ctx.fillRect(ax + inner, surfaceY, aw - inner * 2, 1);
    ctx.fillStyle = '#ffffff';
    const t = Math.floor(performance.now() / 200) % 2;
    ctx.fillRect(ax + inner + (t ? 0 : 4), surfaceY + 1, 4, 1);
  }

  ctx.fillStyle = '#1a1530';
  for (let i = 1; i < 4; i++) {
    const ty = ay + inner + Math.floor((innerH * i) / 4);
    ctx.fillRect(ax - 2, ty, 3, 1);
  }
}
