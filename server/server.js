import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { networkInterfaces } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { MongoClient } from 'mongodb';

const {
  MONGO_URI,
  MONGO_DB = 'news',
  MONGO_COLLECTION = 'egg_catcher_scores',
} = process.env;

const PORT = process.env.PORT || process.env.API_PORT || 5174;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const SERVE_STATIC = existsSync(DIST_DIR);

if (!MONGO_URI) {
  console.error('[egg-catcher] MONGO_URI is missing from .env');
  process.exit(1);
}

const mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
let scores;

async function connectMongo() {
  await mongo.connect();
  const db = mongo.db(MONGO_DB);
  scores = db.collection(MONGO_COLLECTION);
  await scores.createIndex({ username_lower: 1 }, { unique: true });
  await scores.createIndex({ best: -1 });
  console.log(`[egg-catcher] mongo connected — ${MONGO_DB}.${MONGO_COLLECTION}`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));

/* ------- helpers ------- */

const USERNAME_RE = /^[A-Za-z0-9_\-]{2,16}$/;

function cleanUsername(raw) {
  return String(raw || '').trim();
}

/* ------- leaderboard endpoints ------- */

app.post('/api/user/check', async (req, res) => {
  const username = cleanUsername(req.body?.username);
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ ok: false, error: 'Username must be 2-16 letters, numbers, _ or -' });
  }
  const existing = await scores.findOne({ username_lower: username.toLowerCase() });
  res.json({ ok: true, exists: !!existing, best: existing?.best || 0 });
});

app.post('/api/score', async (req, res) => {
  const username = cleanUsername(req.body?.username);
  const score = Math.max(0, Math.min(1_000_000, Number(req.body?.score) || 0));
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ ok: false, error: 'invalid username' });
  }
  const key = username.toLowerCase();
  const now = new Date();
  const existing = await scores.findOne({ username_lower: key });

  if (!existing) {
    await scores.insertOne({
      username,
      username_lower: key,
      best: score,
      lastScore: score,
      games: 1,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await scores.updateOne(
      { username_lower: key },
      {
        $set: {
          username,
          lastScore: score,
          updatedAt: now,
          ...(score > (existing.best || 0) ? { best: score } : {}),
        },
        $inc: { games: 1 },
      },
    );
  }

  const updated = await scores.findOne({ username_lower: key });
  const rank = (await scores.countDocuments({ best: { $gt: updated.best } })) + 1;
  const total = await scores.countDocuments({});
  res.json({ ok: true, rank, total, best: updated.best, lastScore: updated.lastScore });
});

app.get('/api/leaderboard', async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const username = cleanUsername(req.query.username);
  const top = await scores
    .find({}, { projection: { _id: 0, username: 1, best: 1, games: 1, updatedAt: 1 } })
    .sort({ best: -1, updatedAt: 1 })
    .limit(limit)
    .toArray();

  let me = null;
  if (USERNAME_RE.test(username)) {
    const entry = await scores.findOne({ username_lower: username.toLowerCase() });
    if (entry) {
      const rank = (await scores.countDocuments({ best: { $gt: entry.best } })) + 1;
      me = {
        username: entry.username,
        best: entry.best,
        games: entry.games,
        rank,
      };
    }
  }

  const total = await scores.countDocuments({});
  res.json({ ok: true, top, total, me });
});

app.get('/api/health', async (_req, res) => {
  try {
    const count = await scores.estimatedDocumentCount();
    res.json({ ok: true, mongo: 'up', count });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/* ============================================================
   GAME ROOMS — SSE relay between laptop and phone controller
   ============================================================ */

const ROOM_TTL_MS = 1000 * 60 * 30;
const rooms = new Map();

function newRoomId() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function pruneRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS && !room.game && room.controllers.size === 0) {
      rooms.delete(id);
    }
  }
}
setInterval(pruneRooms, 60_000).unref?.();

function getLocalIps() {
  const nets = networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push({ name, address: net.address });
    }
  }
  const isVirtual = (n) => /vethernet|hyper-v|wsl|virtualbox|vmware|loopback|docker|local area connection\*/i.test(n);
  const isWifi = (n) => /wi-?fi|wlan|wireless/i.test(n);
  const isLan = (a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  const score = (c) => {
    let s = 0;
    if (isVirtual(c.name)) s += 100;
    if (!isLan(c.address)) s += 10;
    if (isWifi(c.name)) s -= 5;
    return s;
  };
  out.sort((a, b) => score(a) - score(b));
  return out;
}

app.get('/api/game/local-ip', (_req, res) => {
  const ips = getLocalIps();
  res.json({ ip: ips[0]?.address || 'localhost', candidates: ips });
});

app.post('/api/game/room', (_req, res) => {
  const id = newRoomId();
  rooms.set(id, { game: null, controllers: new Set(), createdAt: Date.now(), username: null });
  res.json({ roomId: id });
});

function sseHeaders(res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
}

app.get('/api/game/events/:roomId', (req, res) => {
  const { roomId } = req.params;
  let room = rooms.get(roomId);
  if (!room) {
    room = { game: null, controllers: new Set(), createdAt: Date.now(), username: null };
    rooms.set(roomId, room);
  }
  sseHeaders(res);
  room.game = res;
  res.write(`event: ready\ndata: ${JSON.stringify({ roomId, paired: room.controllers.size > 0 })}\n\n`);
  for (const c of room.controllers) c.write(`event: paired\ndata: {}\n\n`);

  const ping = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch {}
  }, 15_000);

  req.on('close', () => {
    clearInterval(ping);
    if (room.game === res) room.game = null;
  });
});

app.get('/api/game/controller-events/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) return res.status(404).end();
  sseHeaders(res);
  room.controllers.add(res);
  res.write(`event: ready\ndata: {"paired":${room.game ? 'true' : 'false'}}\n\n`);

  const ping = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch {}
  }, 15_000);

  req.on('close', () => {
    clearInterval(ping);
    room.controllers.delete(res);
  });
});

app.post('/api/game/control', (req, res) => {
  const { roomId, action } = req.body || {};
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'room not found' });
  if (!room.game) return res.status(409).json({ error: 'game not connected' });
  const safe = String(action || '').slice(0, 32);
  try {
    room.game.write(`event: control\ndata: ${JSON.stringify({ action: safe })}\n\n`);
  } catch {}
  res.json({ ok: true });
});

app.post('/api/game/state', (req, res) => {
  const { roomId, ...state } = req.body || {};
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'room not found' });
  const payload = JSON.stringify(state).slice(0, 512);
  for (const c of room.controllers) {
    try { c.write(`event: state\ndata: ${payload}\n\n`); } catch {}
  }
  res.json({ ok: true });
});

/* ------- start ------- */

// ------- static frontend (production) -------

if (SERVE_STATIC) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
  console.log(`[egg-catcher] serving static frontend from ${DIST_DIR}`);
}

connectMongo()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[egg-catcher] listening on http://0.0.0.0:${PORT}`);
      if (!SERVE_STATIC) {
        console.log(`[egg-catcher] LAN ips: ${getLocalIps().map((c) => `${c.address} (${c.name})`).join(', ')}`);
      }
    });
  })
  .catch((err) => {
    console.error('[egg-catcher] mongo connect failed:', err.message);
    process.exit(1);
  });
