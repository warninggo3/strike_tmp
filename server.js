const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname, {
  index: 'index.html',
  dotfiles: 'deny',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.glb')) res.set('Content-Type', 'model/gltf-binary');
  }
}));

// generate-data.js로 생성된 정적 JSON 로드 (SQLite 런타임 불필요)
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));

// ── API Routes ───────────────────────────────────────────────

app.get('/api/games',              (req, res) => res.json(DATA.games));
app.get('/api/players',            (req, res) => res.json(DATA.players));
app.get('/api/rankings/batting',   (req, res) => res.json(DATA.rankingsBatting));
app.get('/api/rankings/pitching',  (req, res) => res.json(DATA.rankingsPitching));

app.get('/api/players/:id', (req, res) => {
  const p = DATA.playerDetails[req.params.id];
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`⚾  STRIKE Web → http://localhost:${PORT}`));
}

module.exports = app;
