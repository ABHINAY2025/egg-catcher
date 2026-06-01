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

function postState(roomId, payload) {
  if (!roomId) return;
  fetch('/api/game/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, ...payload }),
  }).catch(() => {});
}

export default function Game({ username, onGameOver, roomId, lanIp, ipCandidates, onSetLanIp }) {
  const canvasRef = React.useRef(null);
  const stageRef = React.useRef(null);

  const [paired, setPaired] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [score, setScore] = React.useState(0);
  const [timeLeft, setTimeLeft] = React.useState(ROUND_MS);
  const [isFs, setIsFs] = React.useState(false);

  const stateRef = React.useRef({
    keys: { left: false, right: false },
    char: { x: GAME_W / 2 - CHAR_W / 2 },
    eggs: [],
    omelets: [],
    cows: [],
    nextCowMs: 2200,
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

  // SSE — receive controller events (left/right/start)
  React.useEffect(() => {
    if (!roomId) return;
    const es = new EventSource(`/api/game/events/${roomId}`);
    es.addEventListener('ready', (e) => {
      try { setPaired(!!JSON.parse(e.data).paired); } catch {}
    });
    es.addEventListener('control', (e) => {
      try {
        const { action } = JSON.parse(e.data);
        if (!paired) setPaired(true);
        if (action === 'left:down') stateRef.current.keys.left = true;
        else if (action === 'left:up') stateRef.current.keys.left = false;
        else if (action === 'right:down') stateRef.current.keys.right = true;
        else if (action === 'right:up') stateRef.current.keys.right = false;
        else if (action === 'start') startRef.current?.();
      } catch {}
    });
    es.onerror = () => {};
    return () => es.close();
  }, [roomId, paired]);

  // Keyboard fallback
  React.useEffect(() => {
    const dn = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') stateRef.current.keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') stateRef.current.keys.right = true;
    };
    const up = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') stateRef.current.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') stateRef.current.keys.right = false;
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
    };
  }, []);

  React.useEffect(() => {
    postState(roomId, { score, running, timeLeft });
  }, [roomId, score, running, timeLeft]);

  React.useEffect(() => {
    const onFsChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    setIsFs(!!document.fullscreenElement);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  const startRef = React.useRef(null);
  const start = React.useCallback(() => {
    const s = stateRef.current;
    if (s.running) return;
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
    setTimeLeft(ROUND_MS);
    setRunning(true);
  }, []);
  startRef.current = start;

  // Main loop
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
        const speed = 4.4;
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

        // omelets age out
        const omRemain = [];
        for (const o of s.omelets) {
          o.ttl -= dt;
          if (o.ttl > 0) omRemain.push(o);
        }
        s.omelets = omRemain;

        // spawn cows occasionally when there are omelets to eat (or just for ambience)
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

        // move cows + eat omelets they walk over
        const cowRemain = [];
        for (const cow of s.cows) {
          cow.x += cow.dir * cow.speed * (dt / 16.67);
          cow.wobble += dt;
          // eat
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

        setTimeLeft(s.timeLeft);
        if (s.timeLeft <= 0) endGameRef.current?.();
      }

      draw(ctx, s);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stageRef.current?.requestFullscreen) await stageRef.current.requestFullscreen();
    } catch {}
  };

  const controllerUrl = roomId
    ? (import.meta.env.PROD
        ? `${window.location.origin}/controller?room=${roomId}`
        : lanIp ? `http://${lanIp}:5173/controller?room=${roomId}` : null)
    : null;

  const qrSrc = controllerUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&color=1A1530&bgcolor=FFF7F1&data=${encodeURIComponent(controllerUrl)}`
    : null;

  return (
    <section className="game game--solo">
      <div className={`game__stage ${isFs ? 'is-fs' : ''}`} ref={stageRef}>
        <div className="game__hud">
          <div className="game__hudCell">
            <span className="game__hudLabel">PLAYER</span>
            <span className="game__hudNum game__hudNum--sm">{username}</span>
          </div>
          <div className="game__hudCell">
            <span className="game__hudLabel">SCORE</span>
            <span className="game__hudNum">{String(score).padStart(4, '0')}</span>
          </div>
          <div className="game__hudCell game__hudCell--actions">
            <button className="game__iconBtn game__iconBtn--alt" onClick={toggleFs} title="Toggle fullscreen">
              {isFs ? '⤓ EXIT FS' : '⤢ FULLSCREEN'}
            </button>
          </div>
        </div>

        <div className="game__canvasWrap">
          <canvas ref={canvasRef} width={GAME_W} height={GAME_H} className="game__canvas" />

          {!running && (
            <div className="game__popup">
              <div className="game__popupInner">
                <div className="game__popupHead">
                  <span className="game__qrDot" />
                  <span className="game__popupTitle">PHONE CONTROLLER</span>
                </div>

                <div className="game__popupBody">
                  <div className="game__popupQrBox">
                    {qrSrc ? (
                      <img src={qrSrc} alt="QR code" />
                    ) : (
                      <div className="game__qrSkeleton">generating…</div>
                    )}
                  </div>

                  <div className="game__popupCopy">
                    {!paired ? (
                      <>
                        <div className="game__popupLine">▸ Scan the QR with your phone.</div>
                        <div className="game__popupLine">▸ Phone &amp; laptop on same wifi.</div>
                        <div className="game__popupLine">▸ Controller will have a START button.</div>
                      </>
                    ) : (
                      <>
                        <div className="game__popupLine game__popupLine--ok">✓ Controller linked.</div>
                        <div className="game__popupLine">Press <strong>START</strong> on your phone to begin.</div>
                      </>
                    )}
                    <div className="game__popupRoom">
                      Room <strong>{roomId || '——'}</strong>
                    </div>
                    {controllerUrl && (
                      <div className="game__popupUrl"><code>{controllerUrl}</code></div>
                    )}
                    {ipCandidates && ipCandidates.length > 1 && (
                      <label className="game__ipPick">
                        <span>QR not opening? Try another adapter:</span>
                        <select value={lanIp || ''} onChange={(e) => onSetLanIp?.(e.target.value)}>
                          {ipCandidates.map((c) => (
                            <option key={c.address} value={c.address}>{c.address} — {c.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </div>

                <div className="game__popupFoot">
                  <span className="game__popupHint">— or use keyboard ↓</span>
                  <button className="btn btn--yellow" onClick={start}>
                    START WITH KEYBOARD ▸
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="game__foot">
          <span className={`game__pill ${paired ? 'is-on' : ''}`}>
            ● {paired ? 'CONTROLLER LINKED' : 'WAITING FOR CONTROLLER'}
          </span>
          <span className="game__pill game__pill--muted">ROOM {roomId || '——'}</span>
        </div>
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

  // grass
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
  // egg-white splash
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(x - 10, y - 2, 20, 4);
  ctx.fillRect(x - 8, y - 4, 16, 2);
  ctx.fillRect(x - 12, y, 24, 2);
  // yolk
  ctx.fillStyle = '#ffd86b';
  ctx.fillRect(x - 4, y - 2, 8, 4);
  ctx.fillRect(x - 3, y - 3, 6, 1);
  ctx.fillStyle = '#f0bf3a';
  ctx.fillRect(x - 2, y - 1, 4, 2);
  // shell shards
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(x - 14, y + 1, 2, 2);
  ctx.fillRect(x + 12, y - 1, 2, 2);
  // outline
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(x - 12, y - 1, 1, 3);
  ctx.fillRect(x + 11, y - 1, 1, 3);
  ctx.globalAlpha = 1;
}

function drawCow(ctx, cow) {
  const { x, dir, wobble } = cow;
  const bob = Math.floor(wobble / 120) % 2; // walk cycle
  const y = GROUND_Y - COW_H + 6 + bob;
  const flip = dir < 0;
  ctx.save();
  if (flip) {
    ctx.translate(x + COW_W, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, 0);
  }

  // body
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(4, y + 4, 22, 10);
  ctx.fillRect(2, y + 6, 26, 6);
  // spots
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(7, y + 5, 4, 3);
  ctx.fillRect(15, y + 8, 5, 3);
  ctx.fillRect(20, y + 5, 3, 2);
  // head
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(22, y + 2, 8, 8);
  ctx.fillRect(24, y, 4, 2);
  // muzzle
  ctx.fillStyle = '#ffb79d';
  ctx.fillRect(28, y + 6, 3, 3);
  // eye
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(26, y + 4, 1, 1);
  // horns
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(23, y - 1, 1, 2);
  ctx.fillRect(27, y - 1, 1, 2);
  // udder
  ctx.fillStyle = '#ffb79d';
  ctx.fillRect(10, y + 13, 4, 3);
  // legs (alternate)
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
  // tail
  ctx.fillRect(2, y + 5, 1, 4);

  // outline
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

  // tube outline
  ctx.fillStyle = '#1a1530';
  ctx.fillRect(ax, ay, aw, ah);
  ctx.fillStyle = '#fff7f1';
  ctx.fillRect(ax + inner, ay + inner, aw - inner * 2, ah - inner * 2);

  // water (bottom-anchored, drains downward as time decreases)
  const waterColor = ratio > 0.4 ? '#5db7e8' : ratio > 0.18 ? '#ffd86b' : '#ff9573';
  ctx.fillStyle = waterColor;
  ctx.fillRect(ax + inner, ay + inner + (innerH - fillH), aw - inner * 2, fillH);

  // water surface — simple pixel ripple
  if (fillH > 2 && running) {
    const surfaceY = ay + inner + (innerH - fillH);
    ctx.fillStyle = '#1a1530';
    ctx.fillRect(ax + inner, surfaceY, aw - inner * 2, 1);
    ctx.fillStyle = '#ffffff';
    const t = Math.floor(performance.now() / 200) % 2;
    ctx.fillRect(ax + inner + (t ? 0 : 4), surfaceY + 1, 4, 1);
  }

  // tick marks every quarter
  ctx.fillStyle = '#1a1530';
  for (let i = 1; i < 4; i++) {
    const ty = ay + inner + Math.floor((innerH * i) / 4);
    ctx.fillRect(ax - 2, ty, 3, 1);
  }
}
