const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

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

const db = new Database(path.join(__dirname, 'strike.db'), { readonly: true });

// ── API Routes ───────────────────────────────────────────────

// 경기 목록 (팀 기록, 홈 화면)
app.get('/api/games', (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT
        g.id,
        g.game_date     AS date,
        g.tournament,
        g.opponent,
        g.strike_score  AS our_score,
        g.opponent_score AS opp_score,
        COALESCE(SUM(gb.hits),   0) AS team_hits,
        COALESCE(SUM(gb.errors), 0) AS team_errors,
        COALESCE(SUM(gb.walks),  0) AS team_walks
      FROM games g
      LEFT JOIN game_batting gb ON gb.game_id = g.id
      GROUP BY g.id
      ORDER BY g.game_date DESC
    `).all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 선수 목록 (career 기반)
app.get('/api/players', (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT
        p.id, p.name, p.display_name, p.student_id, p.number, p.position,
        bc.games      AS bc_games,
        bc.ab,  bc.hits, bc.doubles, bc.triples, bc.home_runs,
        bc.total_bases, bc.runs, bc.rbi,
        bc.walks      AS bc_walks,
        bc.hit_by_pitch AS bc_hbp,
        bc.sac_flies,
        bc.strikeouts AS bc_so,
        pc.games      AS pc_games,
        pc.wins, pc.losses,
        pc.innings_pitched,
        pc.strikeouts AS pc_so,
        pc.earned_runs
      FROM players p
      LEFT JOIN batter_career  bc ON bc.player_id = p.id
      LEFT JOIN pitcher_career pc ON pc.player_id = p.id
      ORDER BY p.number IS NULL, p.number, p.id
    `).all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 선수 상세
app.get('/api/players/:id', (req, res) => {
  try {
    const pid = Number(req.params.id);
    const p = db.prepare(`
      SELECT
        p.id, p.name, p.display_name, p.student_id, p.number, p.position,
        bc.games      AS bc_games,
        bc.ab,  bc.hits, bc.doubles, bc.triples, bc.home_runs,
        bc.total_bases, bc.runs, bc.rbi,
        bc.walks      AS bc_walks,
        bc.hit_by_pitch AS bc_hbp,
        bc.sac_flies,
        bc.strikeouts AS bc_so,
        pc.games      AS pc_games,
        pc.wins, pc.losses,
        pc.innings_pitched,
        pc.strikeouts AS pc_so,
        pc.earned_runs
      FROM players p
      LEFT JOIN batter_career  bc ON bc.player_id = p.id
      LEFT JOIN pitcher_career pc ON pc.player_id = p.id
      WHERE p.id = ?
    `).get(pid);

    if (!p) return res.status(404).json({ error: 'Not found' });

    // 경기 타임라인
    const timeline = db.prepare(`
      SELECT DISTINCT
        g.id, g.game_date AS date, g.tournament, g.opponent,
        g.strike_score AS our_score, g.opponent_score AS opp_score
      FROM games g
      LEFT JOIN game_batting  gb ON gb.game_id = g.id AND gb.player_id = ?
      LEFT JOIN game_pitching gp ON gp.game_id = g.id AND gp.player_id = ?
      WHERE gb.player_id IS NOT NULL OR gp.player_id IS NOT NULL
      ORDER BY g.game_date DESC
    `).all(pid, pid);

    // 경기별 타자 기록
    const batLog = db.prepare(`
      SELECT game_id, ab, hits, home_runs, rbi, runs, walks, strikeouts, errors
      FROM game_batting
      WHERE player_id = ?
    `).all(pid);

    // 경기별 투수 기록
    const pitLog = db.prepare(`
      SELECT game_id, wins, losses, innings_pitched, strikeouts, earned_runs, hits_allowed, walks
      FROM game_pitching
      WHERE player_id = ?
    `).all(pid);

    // 타임라인에 per-game 통계 합산
    const batMap  = Object.fromEntries(batLog.map(r => [r.game_id, r]));
    const pitMap  = Object.fromEntries(pitLog.map(r => [r.game_id, r]));
    const tl = timeline.map(g => ({
      ...g,
      bat:   batMap[g.id]  || null,
      pitch: pitMap[g.id] || null,
    }));

    res.json({ ...p, timeline: tl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 타자 랭킹
app.get('/api/rankings/batting', (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT
        p.id, p.display_name, p.student_id, p.number, p.position,
        bc.games, bc.ab, bc.hits, bc.doubles, bc.triples, bc.home_runs,
        bc.total_bases, bc.runs, bc.rbi,
        bc.walks, bc.hit_by_pitch, bc.sac_flies,
        bc.strikeouts
      FROM batter_career bc
      JOIN players p ON p.id = bc.player_id
      WHERE bc.ab > 0
      ORDER BY CAST(bc.hits AS REAL) / NULLIF(bc.ab, 0) DESC
    `).all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 투수 랭킹
app.get('/api/rankings/pitching', (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT
        p.id, p.display_name, p.student_id, p.number, p.position,
        pc.games, pc.wins, pc.losses,
        pc.innings_pitched, pc.strikeouts, pc.earned_runs
      FROM pitcher_career pc
      JOIN players p ON p.id = pc.player_id
      WHERE pc.innings_pitched > 0
      ORDER BY CAST(pc.earned_runs * 9 AS REAL) / NULLIF(pc.innings_pitched, 0) ASC
    `).all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`⚾  STRIKE Web → http://localhost:${PORT}`));
