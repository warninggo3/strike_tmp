import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Stat Utilities ───────────────────────────────────────────
const n0 = v => v ?? 0;
const fmt3 = n => Number(n).toFixed(3).replace(/^0\./, '.');
const fmt2 = n => Number(n).toFixed(2);

// display_name 우선, 없으면 name 폴백
const dname = p => p.display_name || p.name || '-';
// student_id → "25학번" 형식
const fmtSid = sid => (sid != null && String(sid).trim() !== '') ? `${sid}학번` : '학번 없음';

function calcAVG(hits, ab) {
  const h = n0(hits), a = n0(ab);
  return a > 0 ? fmt3(h / a) : '.000';
}
function calcOBP(hits, walks, hbp, ab, sf) {
  const h = n0(hits), bb = n0(walks), hp = n0(hbp), a = n0(ab), s = n0(sf);
  const num = h + bb + hp;
  const den = a + bb + hp + s;
  return den > 0 ? fmt3(num / den) : '.000';
}
function calcSLG(tb, ab) {
  const t = n0(tb), a = n0(ab);
  return a > 0 ? fmt3(t / a) : '.000';
}
function calcOPS(hits, walks, hbp, ab, sf, tb) {
  const h = n0(hits), bb = n0(walks), hp = n0(hbp), a = n0(ab), s = n0(sf), t = n0(tb);
  const obp = (a + bb + hp + s) > 0 ? (h + bb + hp) / (a + bb + hp + s) : 0;
  const slg = a > 0 ? t / a : 0;
  return fmt3(obp + slg);
}
// innings_pitched는 야구 표기법 저장 (0.33 = 1아웃, 0.67 = 2아웃, 2.67 = 2이닝 2아웃)
// DB값 → 실제 아웃수 변환
function ipToOuts(ip) {
  if (!ip) return 0;
  const full = Math.floor(ip);
  const frac = ip - full;
  return full * 3 + Math.round(frac * 3); // 0.33→1, 0.67→2
}
// 아웃수 → 야구 이닝 표기 (10아웃 → "3.1", 11 → "3.2", 12 → "4.0")
function outsToIPStr(outs) {
  const full = Math.floor(outs / 3);
  const rem  = outs % 3;
  return `${full}.${rem}`;
}
// ERA = (자책 * 9) / 실이닝, 이닝 0이면 0.00
function calcERA(er, ip) {
  const outs = ipToOuts(ip);
  return outs > 0 ? fmt2((n0(er) * 9) / (outs / 3)) : '0.00';
}
// 이닝 표시용 (DB값 → 야구 표기 문자열)
function fmtIP(ip) {
  if (ip == null) return '-';
  return outsToIPStr(ipToOuts(ip));
}

// ── API ──────────────────────────────────────────────────────
const _cache = {};
async function api(url) {
  if (_cache[url]) return _cache[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API ${url} → ${r.status}`);
  const d = await r.json();
  _cache[url] = d;
  return d;
}

// ── HOME PAGE ────────────────────────────────────────────────
async function renderHome(container) {
  container.innerHTML = `
    <div id="logo-wrap"><canvas id="logo-canvas"></canvas><span class="logo-hint">탭하면 회전</span></div>
    <p class="section-label">경기 일정 · 결과</p>
    <div id="cal-mount"></div>
    <p class="section-label">선수 랭킹</p>
    <div id="rp-mount"></div>
    <p class="section-label">Instagram</p>
    <div id="ig-mount"></div>
  `;

  initLogo();

  const games = await api('/api/games');
  renderCalendar(document.getElementById('cal-mount'), games);
  renderRankPreview(document.getElementById('rp-mount'));
  renderInstagram(document.getElementById('ig-mount'));
}

// Three.js Logo
function initLogo() {
  const wrap   = document.getElementById('logo-wrap');
  const canvas = document.getElementById('logo-canvas');
  if (!canvas) return;

  const W = 220, H = 220;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(3, 4, 3);
  scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xff6b79, 0.4);
  dl2.position.set(-3, -2, -1);
  scene.add(dl2);

  let model = null;
  let spinV = 0;

  new GLTFLoader().load('/logo.glb', gltf => {
    model = gltf.scene;
    const box    = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    model.position.sub(center);
    camera.position.z = Math.max(size.x, size.y, size.z) * 2.2;
    scene.add(model);
  }, undefined, () => {
    // fallback sphere if GLB fails
    const geo = new THREE.SphereGeometry(1, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe63946 });
    model = new THREE.Mesh(geo, mat);
    scene.add(model);
  });

  wrap.addEventListener('click', () => { spinV = 0.18; });

  (function animate() {
    requestAnimationFrame(animate);
    if (model) {
      model.rotation.y += 0.006 + spinV;
      spinV *= 0.92;
      if (spinV < 0.001) spinV = 0;
    }
    renderer.render(scene, camera);
  })();
}

// Calendar
function renderCalendar(mount, games) {
  const now = new Date();
  // Default to most-recent game month if current month has no games
  const lastGame = games[0];
  let year  = now.getFullYear();
  let month = now.getMonth();
  if (lastGame) {
    const ld = new Date(lastGame.date);
    const hasThisMonth = games.some(g => {
      const d = new Date(g.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    if (!hasThisMonth) { year = ld.getFullYear(); month = ld.getMonth(); }
  }

  function draw() {
    const first     = new Date(year, month, 1).getDay();
    const daysCount = new Date(year, month+1, 0).getDate();
    const months    = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

    const gameDates = {};
    games.forEach(g => {
      const d = new Date(g.date);
      if (d.getFullYear() === year && d.getMonth() === month) gameDates[d.getDate()] = g;
    });

    let cells = '';
    for (let i = 0; i < first; i++) cells += `<div class="cal-cell"></div>`;
    for (let d = 1; d <= daysCount; d++) {
      const g   = gameDates[d];
      const res = g ? (g.our_score > g.opp_score ? 'win' : g.our_score < g.opp_score ? 'loss' : '') : '';
      const isToday = d === now.getDate() && year === now.getFullYear() && month === now.getMonth();
      cells += `<div class="cal-cell ${g?'has-game':''} ${res} ${isToday?'today':''}"
        ${g ? `data-game='${JSON.stringify(g).replace(/'/g,"&#39;")}'` : ''}
        data-day="${d}">
        <span class="cal-date">${d}</span>${g ? '<span class="cal-dot"></span>' : ''}
      </div>`;
    }

    mount.innerHTML = `
      <div class="calendar">
        <div class="cal-head">
          <button class="cal-nav" id="cal-prev">‹</button>
          <span class="cal-title">${year}년 ${months[month]}</span>
          <button class="cal-nav" id="cal-next">›</button>
        </div>
        <div class="cal-grid">
          ${['일','월','화','수','목','금','토'].map(d=>`<div class="cal-dname">${d}</div>`).join('')}
          ${cells}
        </div>
      </div>`;

    mount.querySelector('#cal-prev').onclick = () => { month--; if(month<0){month=11;year--;} draw(); };
    mount.querySelector('#cal-next').onclick = () => { month++; if(month>11){month=0;year++;} draw(); };

    mount.querySelectorAll('.cal-cell.has-game').forEach(el => {
      el.onclick = () => showGamePopup(JSON.parse(el.dataset.game.replace(/&#39;/g,"'")));
    });
  }
  draw();
}

function showGamePopup(g) {
  const popup = document.getElementById('game-popup');
  const res   = g.our_score > g.opp_score ? 'win' : g.our_score < g.opp_score ? 'loss' : 'draw';
  const resKo = res === 'win' ? '승' : res === 'loss' ? '패' : '무';
  popup.innerHTML = `
    <div class="popup-inner" style="position:relative">
      <button class="popup-close" id="popup-close">✕</button>
      <div class="popup-league">${g.tournament || ''}</div>
      <div class="popup-vs">vs ${g.opponent}</div>
      <div class="popup-score ${res}">
        <span>${g.our_score}</span>
        <span class="score-sep">-</span>
        <span>${g.opp_score}</span>
        <span class="res-badge">${resKo}</span>
      </div>
      <div class="popup-stats">
        <div class="stat-row"><span>KNU STRIKE</span><span>R ${n0(g.our_score)} · H ${n0(g.team_hits)} · E ${n0(g.team_errors)} · B ${n0(g.team_walks)}</span></div>
        <div class="stat-row"><span style="color:var(--dim)">${g.date || ''}</span><span style="color:var(--dim)">${g.tournament || ''}</span></div>
      </div>
    </div>`;
  popup.classList.remove('hidden');
  popup.querySelector('#popup-close').onclick = () => popup.classList.add('hidden');
  popup.onclick = e => { if (e.target === popup) popup.classList.add('hidden'); };
}

// Ranking Preview
async function renderRankPreview(mount) {
  const [bat, pit] = await Promise.all([api('/api/rankings/batting'), api('/api/rankings/pitching')]);

  function col(title, rows) {
    return `<div class="rp-col">
      <div class="rp-col-title">${title}</div>
      ${rows.map((r,i) => `<div class="rp-row"><span class="rp-rank">${i+1}</span><span class="rp-name">${r.name}</span><span class="rp-val">${r.val}</span></div>`).join('')}
    </div>`;
  }

  const batRows = [
    { title:'타율', rows: bat.slice(0,3).map(p=>({ name:dname(p), val:calcAVG(p.hits, p.ab) })) },
    { title:'홈런', rows: [...bat].sort((a,b)=>n0(b.home_runs)-n0(a.home_runs)).slice(0,3).map(p=>({ name:dname(p), val:n0(p.home_runs) })) },
    { title:'타점', rows: [...bat].sort((a,b)=>n0(b.rbi)-n0(a.rbi)).slice(0,3).map(p=>({ name:dname(p), val:n0(p.rbi) })) },
  ];
  const pitRows = [
    { title:'ERA',  rows: pit.slice(0,3).map(p=>({ name:dname(p), val:calcERA(p.earned_runs, p.innings_pitched) })) },
    { title:'승',   rows: [...pit].sort((a,b)=>n0(b.wins)-n0(a.wins)).slice(0,3).map(p=>({ name:dname(p), val:n0(p.wins) })) },
    { title:'탈삼진', rows: [...pit].sort((a,b)=>n0(b.strikeouts)-n0(a.strikeouts)).slice(0,3).map(p=>({ name:dname(p), val:n0(p.strikeouts) })) },
  ];

  mount.innerHTML = `
    <div class="rank-preview">
      <div class="rp-tabs">
        <button class="rp-tab active" data-rp="bat">타자 랭킹</button>
        <button class="rp-tab" data-rp="pit">투수 랭킹</button>
      </div>
      <div class="rp-body active" id="rp-bat">
        <div class="rp-grid">${batRows.map(c=>col(c.title,c.rows)).join('')}</div>
      </div>
      <div class="rp-body" id="rp-pit">
        <div class="rp-grid">${pitRows.map(c=>col(c.title,c.rows)).join('')}</div>
      </div>
    </div>`;

  mount.querySelectorAll('.rp-tab').forEach(btn => {
    btn.onclick = () => {
      mount.querySelectorAll('.rp-tab, .rp-body').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      mount.querySelector(`#rp-${btn.dataset.rp}`).classList.add('active');
    };
  });
}

// Instagram Card
function renderInstagram(mount) {
  const emojis = ['⚾','🏟','🧢','⚾','🥇','🔥'];
  const posts  = emojis.map(e => `<div class="ig-post">${e}</div>`).join('');
  mount.innerHTML = `
    <div class="ig-card">
      <div class="ig-head">
        <div class="ig-avatar">
          <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        </div>
        <div class="ig-meta">
          <div class="ig-name">STRIKE</div>
          <div class="ig-handle">@knu_strike</div>
        </div>
        <a href="https://instagram.com/knu_strike" target="_blank" rel="noopener" class="ig-btn">팔로우</a>
      </div>
      <div class="ig-posts">${posts}</div>
    </div>`;
}

// ── TEAM PAGE ────────────────────────────────────────────────
async function renderTeam(container) {
  container.innerHTML = `
    <div class="page-header"><div class="page-title">팀 기록</div><div class="page-sub">경기별 승패 · 기록</div></div>
    <div class="filter-row" id="team-filters"></div>
    <div id="game-list" class="game-list"></div>`;

  const games = await api('/api/games');
  const tournaments = ['전체', ...new Set(games.map(g => g.tournament).filter(Boolean))];
  let active = '전체';

  function drawFilters() {
    document.getElementById('team-filters').innerHTML =
      tournaments.map(t => `<button class="chip ${t===active?'active':''}" data-t="${t}">${t}</button>`).join('');
    document.querySelectorAll('#team-filters .chip').forEach(btn => {
      btn.onclick = () => { active = btn.dataset.t; drawFilters(); drawGames(); };
    });
  }

  function drawGames() {
    const list = active === '전체' ? games : games.filter(g => g.tournament === active);
    document.getElementById('game-list').innerHTML = list.length
      ? list.map(g => gameCard(g)).join('')
      : `<div class="empty"><div class="empty-icon">⚾</div>경기 기록 없음</div>`;
    document.querySelectorAll('.game-card').forEach(el => {
      el.onclick = () => showGamePopup(JSON.parse(el.dataset.game));
    });
  }

  drawFilters(); drawGames();
}

function gameCard(g) {
  const res   = n0(g.our_score) > n0(g.opp_score) ? 'win' : n0(g.our_score) < n0(g.opp_score) ? 'loss' : '';
  const resKo = res === 'win' ? '승' : res === 'loss' ? '패' : '무';
  const d     = g.date ? new Date(g.date) : null;
  const dateStr = d ? `${d.getMonth()+1}/${d.getDate()}` : '';
  return `
    <div class="game-card" data-game='${JSON.stringify(g).replace(/'/g,"&#39;")}'>
      <div class="gc-top">
        <span class="gc-league">${g.tournament || ''}</span>
        <span class="gc-date">${g.date || ''} ${dateStr ? `(${dateStr})` : ''}</span>
      </div>
      <div class="gc-main">
        <div class="gc-opp">vs ${g.opponent || ''}</div>
        <div class="gc-score-wrap">
          <span class="gc-score us ${res}">${n0(g.our_score)}</span>
          <span class="score-sep2">-</span>
          <span class="gc-score them">${n0(g.opp_score)}</span>
          <span class="result-pill ${res}">${resKo}</span>
        </div>
      </div>
      <div class="gc-rheb">
        <div class="rheb-team">KNU</div>
        <div class="rheb-stat"><span class="rheb-lbl">R</span><span class="rheb-val">${n0(g.our_score)}</span></div>
        <div class="rheb-stat"><span class="rheb-lbl">H</span><span class="rheb-val">${n0(g.team_hits)}</span></div>
        <div class="rheb-stat"><span class="rheb-lbl">E</span><span class="rheb-val">${n0(g.team_errors)}</span></div>
        <div class="rheb-stat"><span class="rheb-lbl">B</span><span class="rheb-val">${n0(g.team_walks)}</span></div>
      </div>
    </div>`;
}

// ── PLAYERS PAGE ─────────────────────────────────────────────
async function renderPlayers(container) {
  container.innerHTML = `
    <div class="page-header"><div class="page-title">선수 기록</div></div>
    <div class="search-wrap">
      <div class="search-box">
        <span class="search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
        <input id="player-search" class="search-input" type="text" placeholder="선수 이름 검색">
      </div>
    </div>
    <div id="player-list" class="player-list"></div>`;

  const players = await api('/api/players');
  let query = '';

  function draw() {
    const q = query.toLowerCase();
    const filtered = q
      ? players.filter(p => (p.display_name || '').includes(q) || (p.name || '').includes(q))
      : players;
    document.getElementById('player-list').innerHTML = filtered.length
      ? filtered.map(p => playerCard(p)).join('')
      : `<div class="empty"><div class="empty-icon">🔍</div>검색 결과 없음</div>`;
    document.querySelectorAll('.player-card').forEach(el => {
      el.onclick = () => openPlayerModal(Number(el.dataset.id));
    });
  }

  document.getElementById('player-search').addEventListener('input', e => { query = e.target.value.trim(); draw(); });
  draw();
}

function playerCard(p) {
  const hasBat = n0(p.ab) > 0;
  const hasPit = n0(p.innings_pitched) > 0;

  const batStats = hasBat ? `
    <div class="stat-section-label">타자</div>
    <div class="stats-grid">
      ${statBox('G',   n0(p.bc_games))}
      ${statBox('AVG', calcAVG(p.hits, p.ab))}
      ${statBox('HR',  n0(p.home_runs))}
      ${statBox('RBI', n0(p.rbi))}
      ${statBox('OPS', calcOPS(p.hits, p.bc_walks, p.bc_hbp, p.ab, p.sac_flies, p.total_bases))}
    </div>` : '';

  const pitStats = hasPit ? `
    <div class="stat-section-label">투수</div>
    <div class="stats-grid">
      ${statBox('G',   n0(p.pc_games))}
      ${statBox('ERA', calcERA(p.earned_runs, p.innings_pitched))}
      ${statBox('W',   n0(p.wins))}
      ${statBox('L',   n0(p.losses))}
      ${statBox('K',   n0(p.pc_so))}
    </div>` : '';

  const noRecord = !hasBat && !hasPit ? `<div class="no-record">기록 없음</div>` : '';

  return `
    <div class="player-card" data-id="${p.id}">
      <div class="pc-head">
        <div class="pc-avatar">${n0(p.number) || '?'}</div>
        <div>
          <div class="pc-name">${dname(p)}</div>
          <div class="pc-meta">#${p.number ?? '-'} · ${p.position || '-'} · ${fmtSid(p.student_id)}</div>
        </div>
      </div>
      ${batStats}${pitStats}${noRecord}
    </div>`;
}

function statBox(label, value) {
  return `<div class="stat-box"><span class="stat-lbl">${label}</span><span class="stat-val">${value ?? '-'}</span></div>`;
}

async function openPlayerModal(id) {
  const modal = document.getElementById('player-modal');
  modal.innerHTML = `<div class="loading">불러오는 중...</div>`;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  const p = await api(`/api/players/${id}`);
  const hasBat = n0(p.ab) > 0;
  const hasPit = n0(p.innings_pitched) > 0;
  const timeline = p.timeline || [];

  const batSection = hasBat ? `
    <div class="modal-section">
      <div class="modal-section-title">타자 기록</div>
      <div class="stats-grid" style="padding-bottom:16px">
        ${statBox('G',   n0(p.bc_games))}
        ${statBox('AVG', calcAVG(p.hits, p.ab))}
        ${statBox('HR',  n0(p.home_runs))}
        ${statBox('H',   n0(p.hits))}
        ${statBox('R',   n0(p.runs))}
        ${statBox('RBI', n0(p.rbi))}
        ${statBox('BB',  n0(p.bc_walks))}
        ${statBox('K',   n0(p.bc_so))}
        ${statBox('OPS', calcOPS(p.hits, p.bc_walks, p.bc_hbp, p.ab, p.sac_flies, p.total_bases))}
        <div></div>
      </div>
    </div>` : '';

  const pitSection = hasPit ? `
    <div class="modal-section">
      <div class="modal-section-title">투수 기록</div>
      <div class="stats-grid" style="padding-bottom:16px">
        ${statBox('G',   n0(p.pc_games))}
        ${statBox('ERA', calcERA(p.earned_runs, p.innings_pitched))}
        ${statBox('W',   n0(p.wins))}
        ${statBox('L',   n0(p.losses))}
        ${statBox('IP',  fmtIP(p.innings_pitched))}
        ${statBox('K',   n0(p.pc_so))}
        ${statBox('ER',  n0(p.earned_runs))}
        <div></div>
      </div>
    </div>` : '';

  const tlItems = timeline.map(g => {
    const res   = n0(g.our_score) > n0(g.opp_score) ? 'win' : n0(g.our_score) < n0(g.opp_score) ? 'loss' : '';
    const resKo = res === 'win' ? '승' : res === 'loss' ? '패' : '무';
    const lines = [];
    if (g.bat)   lines.push(`타격: ${n0(g.bat.hits)}/${n0(g.bat.ab)} HR ${n0(g.bat.home_runs)} RBI ${n0(g.bat.rbi)}`);
    if (g.pitch) lines.push(`투구: ${fmtIP(g.pitch.innings_pitched)}IP ERA ${calcERA(g.pitch.earned_runs, g.pitch.innings_pitched)} K ${n0(g.pitch.strikeouts)}`);
    return `
      <div class="tl-item">
        <div class="tl-dot"></div>
        <div>
          <div class="tl-game">vs ${g.opponent || ''} <span class="tl-result ${res}">${resKo}</span> · ${g.date || ''}</div>
          <div class="tl-league">${g.tournament || ''}</div>
          <div class="tl-stats">${lines.join('<br>')}</div>
        </div>
      </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="modal-bar">
      <button class="modal-back" id="modal-back">‹</button>
      <div class="modal-title">${dname(p)}</div>
      <div class="modal-number">#${p.number ?? '-'} · ${p.position || '-'} · ${fmtSid(p.student_id)}</div>
    </div>
    ${batSection}${pitSection}
    <div class="modal-section"><div class="modal-section-title">경기 타임라인</div></div>
    <div class="timeline">${tlItems || '<div class="empty"><div class="empty-icon">📋</div>출전 기록 없음</div>'}</div>`;

  document.getElementById('modal-back').onclick = () => {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };
}

// ── RANKINGS PAGE ────────────────────────────────────────────
async function renderRankings(container) {
  container.innerHTML = `
    <div class="page-header"><div class="page-title">랭킹</div></div>
    <div class="rank-type-row">
      <button class="rank-type-btn active" data-type="bat">타자</button>
      <button class="rank-type-btn" data-type="pit">투수</button>
    </div>
    <div id="ranking-body"><div class="loading">불러오는 중...</div></div>`;

  let type = 'bat';
  const [bat, pit] = await Promise.all([api('/api/rankings/batting'), api('/api/rankings/pitching')]);

  function draw() {
    const list = type === 'bat' ? bat : pit;
    if (!list.length) {
      document.getElementById('ranking-body').innerHTML = `<div class="empty"><div class="empty-icon">📊</div>기록 없음</div>`;
      return;
    }
    const [top, ...rest] = list;
    let html = `<div class="ranking-list">`;

    // #1 card
    if (type === 'bat') {
      html += `<div class="rank-card-top">
        <div class="rank-crown">👑</div>
        <div class="rank-top-name">${dname(top)}</div>
        <div class="rank-top-pos">#${top.number ?? '-'} · ${top.position || '-'} · ${fmtSid(top.student_id)}</div>
        <div class="rank-top-stats">
          ${topStat('AVG', calcAVG(top.hits, top.ab))}
          ${topStat('OPS', calcOPS(top.hits, top.walks, top.hit_by_pitch, top.ab, top.sac_flies, top.total_bases))}
          ${topStat('HR',  n0(top.home_runs))}
          ${topStat('RBI', n0(top.rbi))}
          ${topStat('H',   n0(top.hits))}
          ${topStat('G',   n0(top.games))}
        </div>
      </div>`;
    } else {
      html += `<div class="rank-card-top">
        <div class="rank-crown">👑</div>
        <div class="rank-top-name">${dname(top)}</div>
        <div class="rank-top-pos">#${top.number ?? '-'} · ${top.position || '-'} · ${fmtSid(top.student_id)}</div>
        <div class="rank-top-stats">
          ${topStat('ERA', calcERA(top.earned_runs, top.innings_pitched))}
          ${topStat('IP',  fmtIP(top.innings_pitched))}
          ${topStat('W',   n0(top.wins))}
          ${topStat('L',   n0(top.losses))}
          ${topStat('K',   n0(top.strikeouts))}
          ${topStat('G',   n0(top.games))}
        </div>
      </div>`;
    }

    // Rest
    rest.forEach((p, i) => {
      html += `<div class="rank-card">
        <div class="rank-num">${i+2}</div>
        <div class="rank-info">
          <div class="rank-name">${dname(p)}</div>
          <div class="rank-pos">#${p.number ?? '-'} · ${p.position || '-'} · ${fmtSid(p.student_id)}</div>
          <div class="rank-stats-row">
            ${type === 'bat'
              ? `${rsItem('AVG', calcAVG(p.hits,p.ab), true)}${rsItem('OPS',calcOPS(p.hits,p.walks,p.hit_by_pitch,p.ab,p.sac_flies,p.total_bases),true)}${rsItem('HR',n0(p.home_runs))}${rsItem('RBI',n0(p.rbi))}${rsItem('G',n0(p.games))}`
              : `${rsItem('ERA', calcERA(p.earned_runs,p.innings_pitched), true)}${rsItem('IP',fmtIP(p.innings_pitched))}${rsItem('W',n0(p.wins))}${rsItem('K',n0(p.strikeouts))}${rsItem('G',n0(p.games))}`
            }
          </div>
        </div>
      </div>`;
    });

    html += `</div>`;
    document.getElementById('ranking-body').innerHTML = html;
  }

  container.querySelectorAll('.rank-type-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.rank-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      type = btn.dataset.type;
      draw();
    };
  });

  draw();
}

function topStat(label, val) {
  return `<div class="rank-top-stat"><span class="lbl">${label}</span><span class="val">${val}</span></div>`;
}
function rsItem(label, val, hi = false) {
  return `<div class="rs-item"><span class="rs-lbl">${label}</span><span class="rs-val ${hi?'hi':''}">${val}</span></div>`;
}

// ── Navigation ───────────────────────────────────────────────
const pages = { home: renderHome, team: renderTeam, players: renderPlayers, rankings: renderRankings };
const inited = {};

function navigate(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.querySelector(`[data-page="${name}"]`).classList.add('active');
  if (!inited[name]) { inited[name] = true; pages[name](document.getElementById(`page-${name}`)); }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

navigate('home');
