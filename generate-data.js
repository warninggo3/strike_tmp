// DB → data.json 정적 파일 생성 스크립트
// 사용법: node generate-data.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(path.join(__dirname, 'strike.db'));
  const db = new SQL.Database(buf);

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  const games = all(`
    SELECT g.id, g.game_date AS date, g.tournament, g.opponent,
      g.strike_score AS our_score, g.opponent_score AS opp_score,
      COALESCE(SUM(gb.hits),   0) AS team_hits,
      COALESCE(SUM(gb.errors), 0) AS team_errors,
      COALESCE(SUM(gb.walks),  0) AS team_walks
    FROM games g
    LEFT JOIN game_batting gb ON gb.game_id = g.id
    GROUP BY g.id ORDER BY g.game_date DESC
  `);

  const players = all(`
    SELECT p.id, p.name, p.display_name, p.student_id, p.number, p.position,
      bc.games AS bc_games, bc.ab, bc.hits, bc.doubles, bc.triples, bc.home_runs,
      bc.total_bases, bc.runs, bc.rbi, bc.walks AS bc_walks,
      bc.hit_by_pitch AS bc_hbp, bc.sac_flies, bc.strikeouts AS bc_so,
      pc.games AS pc_games, pc.wins, pc.losses, pc.innings_pitched,
      pc.strikeouts AS pc_so, pc.earned_runs
    FROM players p
    LEFT JOIN batter_career  bc ON bc.player_id = p.id
    LEFT JOIN pitcher_career pc ON pc.player_id = p.id
    ORDER BY p.number IS NULL, p.number, p.id
  `);

  // 선수별 상세 + 타임라인
  const playerDetails = {};
  for (const player of players) {
    const pid = player.id;
    const timeline = all(`
      SELECT DISTINCT g.id, g.game_date AS date, g.tournament, g.opponent,
        g.strike_score AS our_score, g.opponent_score AS opp_score
      FROM games g
      LEFT JOIN game_batting  gb ON gb.game_id = g.id AND gb.player_id = ?
      LEFT JOIN game_pitching gp ON gp.game_id = g.id AND gp.player_id = ?
      WHERE gb.player_id IS NOT NULL OR gp.player_id IS NOT NULL
      ORDER BY g.game_date DESC
    `, [pid, pid]);

    const batLog = all(`
      SELECT game_id, ab, hits, home_runs, rbi, runs, walks, strikeouts, errors
      FROM game_batting WHERE player_id = ?
    `, [pid]);

    const pitLog = all(`
      SELECT game_id, wins, losses, innings_pitched, strikeouts, earned_runs, hits_allowed, walks
      FROM game_pitching WHERE player_id = ?
    `, [pid]);

    const batMap = Object.fromEntries(batLog.map(r => [r.game_id, r]));
    const pitMap = Object.fromEntries(pitLog.map(r => [r.game_id, r]));
    playerDetails[pid] = {
      ...player,
      timeline: timeline.map(g => ({
        ...g,
        bat:   batMap[g.id] || null,
        pitch: pitMap[g.id] || null,
      }))
    };
  }

  const rankingsBatting = all(`
    SELECT p.id, p.display_name, p.student_id, p.number, p.position,
      bc.games, bc.ab, bc.hits, bc.doubles, bc.triples, bc.home_runs,
      bc.total_bases, bc.runs, bc.rbi, bc.walks, bc.hit_by_pitch, bc.sac_flies, bc.strikeouts
    FROM batter_career bc
    JOIN players p ON p.id = bc.player_id
    WHERE bc.ab > 0
    ORDER BY CAST(bc.hits AS REAL) / NULLIF(bc.ab, 0) DESC
  `);

  const rankingsPitching = all(`
    SELECT p.id, p.display_name, p.student_id, p.number, p.position,
      pc.games, pc.wins, pc.losses, pc.innings_pitched, pc.strikeouts, pc.earned_runs
    FROM pitcher_career pc
    JOIN players p ON p.id = pc.player_id
    WHERE pc.innings_pitched > 0
    ORDER BY CAST(pc.earned_runs * 9 AS REAL) / NULLIF(pc.innings_pitched, 0) ASC
  `);

  db.close();

  fs.writeFileSync(
    path.join(__dirname, 'data.json'),
    JSON.stringify({ games, players, playerDetails, rankingsBatting, rankingsPitching })
  );

  console.log(`✅ data.json 생성 완료! (경기 ${games.length}개, 선수 ${players.length}명)`);
})();
