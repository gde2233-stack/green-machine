/* Green Machine Stats: single-page app. Data: data/bundle.json (built by tools/build.py). */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let D = null;
const ST = { stats: { span: 'career', eras: null, grp: 'all', q: false, view: 'std', sort: 'PA', desc: true, full: false }, games: { span: 'all', src: 'book' }, player: {}, rec: { span: 'career' }, h2h: { tab: 'opp' }, roster: { who: 'team' } };

/* ---------- definitions (tooltips + glossary) ---------- */
const DEF = {
  G: 'Games with a box score (scorebook games only).', PA: 'Plate appearances.', AB: 'At-bats: PA minus walks, HBP, sac flies and sac bunts.',
  R: 'Runs scored.', H: 'Hits.', '2B': 'Doubles.', '3B': 'Triples.', HR: 'Home runs. Over-limit home runs ruled outs are not counted.',
  RBI: 'Runs batted in. Most scorebooks do not record RBI, so they are reconstructed from base-running. Close, not exact.',
  BB: 'Walks (includes intentional walks).', AVG: 'Batting average: H / AB.', OBP: 'On-base percentage: (H + BB + HBP) / (AB + BB + HBP + SF).',
  SLG: 'Slugging percentage: total bases / AB.', OPS: 'On-base plus slugging.',
  wOBA: 'Weighted on-base average. Each way of reaching base gets a weight from a regression of runs on events in Green Machine games: BB 1.07, 1B 1.13, 2B 1.36, 3B 1.39, HR 1.74, reached on error 0.55.',
  'wOBA+': 'A hitter\'s wOBA compared with the team average in the same view. 100 = team average, 120 = 20% better, 80 = 20% worse.',
  ISO: 'Isolated power: SLG minus AVG. Extra bases per at-bat.', TB: 'Total bases.', XBH: 'Extra-base hits (2B + 3B + HR).',
  'BB%': 'Walks per plate appearance.', 'Out%': 'Share of plate appearances that end in an out (fielder\'s choices and double plays count as outs).',
  'R/G': 'Runs scored per game.',
  'W-L%': 'Winning percentage: (W + ties/2) / games with a known result.', 'RS/G': 'Runs scored per game with a known result.', 'RA/G': 'Runs allowed per game with a known result.',
  'No result': 'Games whose opponent score was not recorded. Never counted as a W, L or T.', Post: 'Postseason record (playoff wins-losses).', Postseason: 'How the playoffs ended.', Playoffs: 'Playoff record against this opponent.',
  Diff: 'Run differential: runs scored minus runs allowed.', 'Box scores': 'Games with a transcribed scorebook box score.', Source: 'Where the record comes from: league site, scorebook games, or team emails.',
  Finish: 'Regular-season finish in the league standings.', Standing: 'Regular-season finish in the league standings.', 'Last met': 'Most recent game against this opponent.', 'PA/G': 'Plate appearances per game.', GAll: 'Games played, including games without a box score.', Q: 'Qualified: at least 2.1 plate appearances per team game in the seasons the player appeared in, within the selected span (Baseball Savant\'s 2.1 rate).'
};
const tipAttr = k => DEF[k] ? ` data-tip="${esc(DEF[k])}"` : '';

/* ---------- stat engine ---------- */
let WT = {};
const KEYS = ['PA', '1B', '2B', '3B', 'HR', 'BB', 'HBP', 'SF', 'SAC', 'K', 'ROE', 'FC', 'DP', 'OUT', 'R', 'RBI'];
const HIT = ['1B', '2B', '3B', 'HR'];
function blank() { const c = { G: 0 }; KEYS.forEach(k => c[k] = 0); return c; }
function addPA(c, pa) { c.PA++; c[pa[2]]++; if (pa[3] === 4) c.R++; c.RBI += pa[4]; }
function merge(a, b) { KEYS.forEach(k => a[k] += b[k]); a.G += b.G; return a; }
function line(c) {
  const H = c['1B'] + c['2B'] + c['3B'] + c.HR, AB = c.PA - c.BB - c.HBP - c.SF - c.SAC;
  const TB = c['1B'] + 2 * c['2B'] + 3 * c['3B'] + 4 * c.HR;
  const AVG = AB ? H / AB : 0, OBP = (AB + c.BB + c.HBP + c.SF) ? (H + c.BB + c.HBP) / (AB + c.BB + c.HBP + c.SF) : 0, SLG = AB ? TB / AB : 0;
  const den = c.PA - c.SAC;
  const wOBA = den ? Object.keys(WT).reduce((s, k) => s + WT[k] * c[k], 0) / den : 0;
  const outs = c.PA - H - c.BB - c.HBP - c.ROE;
  return Object.assign({}, c, { H, AB, TB, AVG, OBP, SLG, OPS: OBP + SLG, ISO: SLG - AVG, wOBA, XBH: c['2B'] + c['3B'] + c.HR,
    'BB%': c.PA ? c.BB / c.PA : 0, 'Out%': c.PA ? outs / c.PA : 0, 'R/G': c.G ? c.R / c.G : 0, 'XBH%': c.PA ? (c['2B'] + c['3B'] + c.HR) / c.PA : 0 });
}
const f3 = x => (x == null || isNaN(x)) ? '—' : (x < 1 && x >= 0 ? x.toFixed(3).slice(1) : x.toFixed(3));
const f1 = x => (x == null || isNaN(x)) ? '—' : x.toFixed(1), pc = x => (x * 100).toFixed(1) + '%';
const QPG = () => D.config.qualify_pa_per_game;

/* ---------- players ---------- */
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const UNKNOWN_OPP = 'Not recorded';
const vsTxt = o => o === UNKNOWN_OPP ? 'vs opponent not recorded' : 'vs ' + esc(o);
const oppLink = (o, txt) => o === UNKNOWN_OPP ? '<span class="sub">Opponent not recorded</span>' : `<a href="#/opp/${encodeURIComponent(o)}" class="opp">${txt ?? esc(o)}</a>`;
const P = id => (own(D.players, id) ? D.players[id] : null) || { name: String(id), member: 'sub' };
function notFound(el, what) { document.title = 'Not found · Green Machine: Archive'; el.innerHTML = `<div class="page-h"><h1>${what} not found</h1><div class="sub">The link may be mistyped or out of date.</div></div><p><a class="btn ghost" href="#/">Home</a> <a class="btn ghost" href="#/players">Players</a> <a class="btn ghost" href="#/h2h">Opponents</a></p>`; }
const pname = id => P(id).name;
const isTeam = id => ['current', 'former'].includes(P(id).member);
const isCur = id => P(id).member === 'current';
const nm = id => { const p = P(id); const n = esc(p.name) + (p.ret ? ' <span class="ret" title="Retired team member">(R)</span>' : ''); return isCur(id) ? `<b>${n}</b>` : n; };
const plink = id => `<a href="#/player/${id}" class="pn${isCur(id) ? ' cur' : ''}">${nm(id)}</a>`;
const posTag = id => P(id).pos ? `<span class="tag pos">${esc(P(id).pos)}</span>` : '';

/* ---------- games, seasons, spans ---------- */
const res = g => g.res ?? (g.op == null ? null : g.gm > g.op ? 'W' : g.gm < g.op ? 'L' : 'T');
const wl = g => { const r = res(g); return r ? `<span class="wl ${r}">${r}</span>` : '<span class="wl U" title="Result unknown: opponent score not recorded">?</span>'; };
const scoreTxt = g => `${g.gm}-${g.op ?? '?'}`;
const fdate = (d, est) => { if (!d) return 'Date unknown'; const [y, m, dd] = d.split('-').map(Number); const s = new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); return est ? s + '*' : s; };
const fdateShort = d => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const SO = { Spring: 0, Summer: 1, Fall: 2 };
const sk = s => { if (!s || !/^\d{4}/.test(s)) return 0; const [y, n] = s.split(' '); return +y * 10 + SO[n]; };
const sLabel = s => { if (!s || !/^\d{4}/.test(s)) return 'Season unknown'; const [y, n] = s.split(' '); return n + ' ' + y; };
const sLink = s => s ? `<a href="#/season/${encodeURIComponent(s)}">${sLabel(s)}</a>` : 'Season unknown';
const seasonOf = g => g.season ? sLabel(g.season) + (g.sest ? ' (est.)' : '') : 'Season unknown';
const eraName = id => { const e = D.config.eras.find(e => e.id === id); return e ? `${e.name} (${e.label})` : ''; };
const bookSeasons = () => [...new Set(D.games.filter(g => g.season).map(g => g.season))].sort((a, b) => sk(b) - sk(a));
/* qualified PA per player: 2.1 x team games in the seasons (within the span) the player appeared in */
function qMap(gf) { const cnt = {}, ps = {}; D.games.filter(gf).forEach(g => { const k = g.season || g.key; cnt[k] = (cnt[k] || 0) + 1; g.bat.forEach(b => (ps[b.p] || (ps[b.p] = new Set())).add(k)); }); const m = {}; Object.entries(ps).forEach(([id, ss]) => m[id] = Math.ceil(QPG() * [...ss].reduce((a, k) => a + cnt[k], 0))); return m; }
function inSpan(g, span) {
  if (span === 'career' || span === 'all') return true;
  if (span.startsWith('era:')) return g.era === span.slice(4);
  if (span.startsWith('y:')) return !!g.season && g.season.startsWith(span.slice(2));
  if (span.startsWith('s:')) return g.season === span.slice(2);
  if (span === 'last3') return g.date && g.date > D.last3;
  return true;
}
function spanOpts(sel, incl = { career: 'Career' }, pid) {
  let ss = bookSeasons(), eras = D.config.eras;
  if (pid) { const mine = new Set(D.games.filter(g => g.bat.some(b => b.p === pid)).map(g => g.season)); ss = ss.filter(s => mine.has(s)); eras = eras.filter(e => (D.playerEras[pid] || new Set()).has(e.id)); }
  const ys = [...new Set(ss.map(s => s.slice(0, 4)))];
  let h = Object.entries(incl).map(([k, v]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${v}</option>`).join('');
  h += `<optgroup label="Eras">` + eras.map(e => `<option value="era:${e.id}" ${sel === 'era:' + e.id ? 'selected' : ''}>${e.name} · ${e.label}</option>`).join('') + '</optgroup>';
  h += `<optgroup label="Seasons">` + ss.map(s => `<option value="s:${s}" ${sel === 's:' + s ? 'selected' : ''}>${sLabel(s)}</option>`).join('') + '</optgroup>';
  h += `<optgroup label="Years">` + ys.map(y => `<option value="y:${y}" ${sel === 'y:' + y ? 'selected' : ''}>${y}</option>`).join('') + '</optgroup>';
  return h;
}
function spanName(span) { return span === 'career' ? 'Career' : span === 'last3' ? 'Last 3 years' : span.startsWith('era:') ? eraName(span.slice(4)) : span.startsWith('y:') ? span.slice(2) : span.startsWith('s:') ? sLabel(span.slice(2)) : 'All'; }
function collect(gameFilter) {
  const P = {}, T = blank(); let n = 0;
  for (const g of D.games) {
    if (!gameFilter(g)) continue; n++; T.G++;
    for (const b of g.bat) { const c = P[b.p] || (P[b.p] = blank()); b.pa.forEach(pa => { addPA(c, pa); addPA(T, pa); }); if (b.xr) { c.R += b.xr; T.R += b.xr; } c.G++; }
  }
  return { players: P, team: T, games: n };
}
function batLine(b) { const c = blank(); c.G = 1; b.pa.forEach(pa => addPA(c, pa)); c.R += b.xr || 0; return line(c); }
function gameLine(L) { const x = [`${L.H}-${L.AB}`]; if (L.HR) x.push((L.HR > 1 ? L.HR + ' ' : '') + 'HR'); if (L['3B']) x.push((L['3B'] > 1 ? L['3B'] + ' ' : '') + '3B'); if (L['2B']) x.push((L['2B'] > 1 ? L['2B'] + ' ' : '') + '2B'); if (L.RBI) x.push(L.RBI + ' RBI'); if (L.R) x.push(L.R + ' R'); if (L.BB) x.push((L.BB > 1 ? L.BB + ' ' : '') + 'BB'); return x.join(', '); }
function boxOf(g) { return g.bat.map(b => ({ b, L: batLine(b) })); }
function topPerf(g, n = 3) { return boxOf(g).map(x => (x.score = x.L.TB + x.L.R + x.L.RBI + 0.5 * x.L.BB + 0.2 * x.L.H + (isCycle(x.b) ? 10 : 0), x)).sort((a, b) => b.score - a.score).slice(0, n); }
const isCycle = b => HIT.every(h => b.pa.some(p => p[2] === h));
const cyclesOf = g => g.bat.filter(isCycle).map(b => b.p);

/* combined list of every game we know about: league/scorebook results plus scorebook games not linked from a result */
function allGames() {
  if (D._all) return D._all;
  const linked = new Set(D.results.filter(r => r.game).map(r => r.game));
  const out = D.results.filter(r => !(r.gm == null && (!r.date || r.date > D.today)) && !(r.gm == null && D.cancelled.includes(r.season))).map(r => {
    const g = r.game ? D.gByKey.get(r.game) : null;
    const book = g && g.op != null; const gm = book ? g.gm : r.gm, op = book ? g.op : r.opp; // scorebook beats the league site
    return { date: r.date || g?.date || null, est: g?.est, season: r.season, opp: r.opponent, gm, op, po: r.playoff, key: r.game, champ: g?.champ, res: gm == null ? null : gm > op ? 'W' : gm < op ? 'L' : 'T', ord: g ? g.ord : null };
  });
  D.games.filter(g => !linked.has(g.key)).forEach(g => out.push({ date: g.date, season: g.season, opp: g.opp, gm: g.gm, op: g.op, po: g.po, key: g.key, champ: g.champ, res: g.res, ord: g.ord, sest: g.sest, est: g.est }));
  out.forEach(x => x.sortk = `${String(sk(x.season)).padStart(5, '0')}|${x.date || (x.ord != null ? D.games[x.ord].od || '' : '')}|${x.date ? 0 : 1}|${String(x.ord ?? 0).padStart(4, '0')}`);
  return D._all = out.sort((a, b) => a.sortk.localeCompare(b.sortk));
}

/* ---------- sortable table ---------- */
function table(el, cols, rows, o = {}) {
  const state = o.state || { sort: o.sort, desc: o.desc !== false };
  const leaders = {};
  if (o.leaders) cols.forEach(c => { if (c.lead === false || !c.v || c.l0) return; const pool = rows.filter(o.leaders); const vals = pool.map(c.v).filter(v => typeof v === 'number'); if (!vals.length) return; leaders[c.k] = c.asc ? Math.min(...vals) : Math.max(...vals); });
  const draw = () => {
    const col = cols.find(c => c.k === state.sort);
    const sorter = (a, b) => { if (!col || !col.v) return 0; const x = col.v(a), y = col.v(b); const r = (typeof x === 'string') ? x.localeCompare(y) : (x ?? -1e9) - (y ?? -1e9); return state.desc ? -r : r; };
    const sections = o.section ? o.section(rows) : [{ rows }];
    let h = `<table class="st ${o.cls || ''}"><thead><tr>` + cols.map(c => {
      const s = state.sort === c.k; const aria = s ? (state.desc ? 'descending' : 'ascending') : 'none';
      return `<th class="${c.l0 ? 'l' : ''} ${c.fz ? 'fz' : ''} ${c.x ? 'x' : ''} ${s ? 'srt' + (state.desc ? '' : ' asc') : ''}" aria-sort="${aria}"${tipAttr(c.tip || c.k) || tipAttr(c.l)}>${c.v ? `<button type="button" data-k="${c.k}">${c.l}</button>` : c.l}</th>`;
    }).join('') + '</tr></thead><tbody>';
    for (const s of sections) {
      if (s.title) h += `<tr class="div"><td colspan="${cols.length}"><span class="dl">${s.title}</span></td></tr>`;
      for (const r of [...s.rows].sort(sorter)) {
        h += `<tr class="${o.rowCls ? o.rowCls(r) : ''}">` + cols.map(c => { const v = c.v ? c.v(r) : null; const ld = leaders[c.k] != null && v === leaders[c.k] && (!o.leaders || o.leaders(r)); return `<td class="${c.l0 ? 'l' : ''} ${c.fz ? 'fz' : ''} ${c.x ? 'x' : ''} ${c.rate ? 'rt' : ''} ${state.sort === c.k ? 'sc' : ''} ${ld ? 'ld' : ''}">${c.f(r)}</td>`; }).join('') + '</tr>';
      }
      if (!s.rows.length && s.empty) h += `<tr><td class="l mu" colspan="${cols.length}">${s.empty}</td></tr>`;
    }
    if (o.foot) h += o.foot;
    h += '</tbody></table>';
    el.innerHTML = h;
    el.querySelectorAll('th button[data-k]').forEach(bt => bt.onclick = () => { const k = bt.dataset.k, c = cols.find(c => c.k === k); if (state.sort === k) state.desc = !state.desc; else { state.sort = k; state.desc = !c.asc && !c.l0; } draw(); });
  };
  draw();
}
const C = { name: { k: 'name', l: 'Player', l0: 1, fz: 1, v: r => pname(r.id), f: r => plink(r.id) } };
function statCols(view) {
  const n = (k, l, o = {}) => ({ k, l, tip: k, v: r => r.L[k], f: r => r.L[k], ...o });
  const r3 = (k, l, o = {}) => ({ k, l, tip: k, rate: 1, v: r => r.L[k], f: r => f3(r.L[k]), ...o });
  const p1 = (k, l, asc) => ({ k, l, tip: k, rate: 1, asc, v: r => r.L[k], f: r => pc(r.L[k]), x: 1 });
  if (view === 'adv') return [C.name, n('PA', 'PA'), r3('wOBA', 'wOBA'),
    { k: 'wOBA+', l: 'wOBA+', tip: 'wOBA+', rate: 1, v: r => r.L['wOBA+'], f: r => Math.round(r.L['wOBA+']) },
    r3('ISO', 'ISO'), n('TB', 'TB', { x: 1 }), n('XBH', 'XBH', { x: 1 }), p1('BB%', 'BB%'), p1('Out%', 'Out%', 1),
    { k: 'R/G', l: 'R/G', tip: 'R/G', rate: 1, v: r => r.L['R/G'], f: r => f1(r.L['R/G']), x: 1 }];
  return [C.name, n('G', 'G'), n('PA', 'PA', { x: 1 }), n('AB', 'AB', { x: 1 }), n('R', 'R', { x: 1 }), n('H', 'H', { x: 1 }), n('2B', '2B', { x: 1 }), n('3B', '3B', { x: 1 }), n('HR', 'HR'),
    n('RBI', 'RBI†'), n('BB', 'BB', { x: 1 }), r3('AVG', 'AVG'), r3('OBP', 'OBP'), r3('SLG', 'SLG'), r3('OPS', 'OPS', { x: 1 })];
}

/* ---------- icons, nav ---------- */
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  players: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.6.2 4.6 2 5.3 5"/>',
  history: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  records: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
};
const TROPHY = '<svg class="trophy" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M17 4h3v2a4 4 0 0 1-4 4M7 4H4v2a4 4 0 0 0 4 4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 13h4v4h-4zM7 20h10v1.5H7zM9 17h6v3H9z" fill="currentColor"/></svg>';
const NAV = [['', 'Home', 'home'], ['stats', 'Stats', 'stats'], ['players', 'Players', 'players'], ['history', 'History', 'history'], ['records', 'Records', 'records'], ['more', 'More', 'more']];
const DESK = [['', 'Home'], ['stats', 'Stats'], ['players', 'Players'], ['games', 'Games'], ['seasons', 'Seasons'], ['history', 'History'], ['records', 'Records'], ['h2h', 'Opponents'], ['more', 'More']];
function navDraw(r) {
  const top = r.split('/')[0];
  const alias = { player: 'players', game: 'more', games: 'more', opp: 'more', h2h: 'more', lineup: 'more', glossary: 'more', season: 'history', seasons: 'history', roster: 'more' };
  const on = own(alias, top) ? alias[top] : top;
  $('#bot').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" class="${on === k ? 'on' : ''}"${on === k ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[i]}</svg>${l}</a>`).join('');
  const dOn = { player: 'players', game: 'games', opp: 'h2h', season: 'seasons', lineup: 'more', glossary: 'more', roster: 'more' }[top] ?? top;
  $('#desk').innerHTML = DESK.map(([k, l]) => `<a href="#/${k}" class="${dOn === k ? 'on' : ''}"${dOn === k ? ' aria-current="page"' : ''}>${l}</a>`).join('');
}

/* ---------- streaks, milestones ---------- */
function streaks() {
  if (D._streaks) return D._streaks;
  const out = {};
  D.games.filter(g => g.season).forEach(g => g.bat.forEach(b => {
    const o = out[b.p] || (out[b.p] = { id: b.p, mh: 0, mhBest: 0, mhEnd: null, hr: 0, hrBest: 0, hrEnd: null, mhStartG: null, hrStartG: null, mhBestStart: null, hrBestStart: null });
    const h = b.pa.filter(p => HIT.includes(p[2])).length, hr = b.pa.some(p => p[2] === 'HR');
    if (h >= 2) { if (!o.mh) o.mhStartG = g; o.mh++; if (o.mh > o.mhBest) { o.mhBest = o.mh; o.mhEnd = g; o.mhBestStart = o.mhStartG; } } else o.mh = 0;
    if (hr) { if (!o.hr) o.hrStartG = g; o.hr++; if (o.hr > o.hrBest) { o.hrBest = o.hr; o.hrEnd = g; o.hrBestStart = o.hrStartG; } } else o.hr = 0;
  }));
  return D._streaks = Object.values(out);
}
const MS = { H: [50, 100, 150, 200, 250, 300, 350, 400, 450, 500], HR: [10, 20, 25, 30, 40, 50, 60, 75, 100], RBI: [50, 100, 150, 200, 250, 300, 350, 400], R: [50, 100, 150, 200, 250, 300, 350, 400], G: [50, 100, 150, 200, 250, 300], TB: [100, 200, 300, 400, 500, 600, 700, 800] };
const MSLAB = { H: 'hits', HR: 'home runs', RBI: 'RBI', R: 'runs', G: 'games', TB: 'total bases' };
function milestoneFeed() {
  if (D._feed) return D._feed;
  const cum = {}, ev = [];
  D.games.forEach(g => g.bat.forEach(b => {
    const c = cum[b.p] || (cum[b.p] = blank()); const before = line(c); c.G++; b.pa.forEach(pa => addPA(c, pa)); const after = line(c);
    Object.keys(MS).forEach(k => MS[k].forEach(m => { if (before[k] < m && after[k] >= m) ev.push({ id: b.p, g, k, m }); }));
  }));
  return D._feed = ev;
}
function milestoneWatch(n = 99) {
  const A = collect(() => true), out = [];
  for (const [id, c] of Object.entries(A.players)) {
    if (!P(id).active || P(id).ret) continue;
    const L = line(c);
    for (const k of Object.keys(MS)) {
      const nx = MS[k].find(m => m > L[k]); if (!nx) continue;
      const gap = nx - L[k]; if (gap <= Math.max(3, Math.round(nx * 0.08))) out.push({ id, k, cur: L[k], next: nx, gap, pct: L[k] / nx });
    }
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, n);
}
const msRow = m => `<div class="ms"><span class="t">${plink(m.id)} <span class="sub">${m.cur} career ${MSLAB[m.k]}</span></span><span class="bar"><i style="width:${Math.min(100, m.pct * 100)}%"></i></span><span class="n">${m.gap} to ${m.next}</span></div>`;
const feedRow = e => `<div class="lead"><span>${plink(e.id)} reached <b>${e.m} career ${MSLAB[e.k]}</b></span><a class="sub" href="#/game/${e.g.key}">${e.g.date ? fdateShort(e.g.date) + ' ' + e.g.date.slice(0, 4) : seasonOf(e.g)}</a></div>`;

/* ---------- recap ---------- */
function recap(g) {
  const r = res(g), tp = topPerf(g, 2), cyc = cyclesOf(g);
  const vs = g.opp === 'Not recorded' ? 'an unrecorded opponent' : g.opp;
  let s = r === 'W' ? `Green Machine beat ${vs} ${g.gm}-${g.op}` : r === 'L' ? `Green Machine lost to ${vs} ${g.op}-${g.gm}` : r === 'T' ? `Green Machine tied ${vs} ${g.gm}-${g.op}` : `Green Machine scored ${g.gm} runs against ${vs}; the opponent's score wasn't recorded`;
  if (g.champ) s += r === 'W' ? ' to win the league championship' : r === 'L' ? ' in the championship game' : ' in the championship game';
  else if (g.po) s += ' in the playoffs';
  s += '.';
  const t = tp[0];
  if (t) { const L = t.L; s += ` ${pname(t.b.p)} went ${L.H}-for-${L.AB}` + (cyc.includes(t.b.p) ? ` and hit for the cycle${L.RBI ? ` with ${L.RBI} RBI` : ''}.` : `${L.HR ? ` with ${L.HR > 1 ? L.HR + ' home runs' : 'a home run'}${L.RBI ? ` and ${L.RBI} RBI` : ''}` : L.RBI ? ` with ${L.RBI} RBI` : ''}.`); }
  cyc.filter(p => p !== t?.b.p).forEach(p => s += ` ${pname(p)} hit for the cycle.`);
  const inn = g.ls.gm.map((v, i) => [v, i + 1]).filter(x => x[0] != null).sort((a, b) => b[0] - a[0])[0];
  if (inn && inn[0] >= 6) s += ` The big inning: ${inn[0]} runs in the ${ord(inn[1])}.`;
  return s;
}
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');

/* ================= PAGES ================= */

/* HOME */
function pgHome(el) {
  const last = [...D.games].filter(g => g.date).sort((a, b) => b.date.localeCompare(a.date) || b.ord - a.ord)[0];
  const curS = D.seasons.filter(s => s.w != null && s.rec_src).slice(-1)[0];
  const at = D.alltime;
  const lsn = bookSeasons().find(s => { const n = D.games.filter(g => g.season === s).length; const row = D.seasons.find(x => x.season === s); return n >= 4 && !(row && row.in_progress); });
  const A = collect(g => g.season === lsn); const qn = Math.ceil(QPG() * A.games);
  const rows = Object.entries(A.players).map(([id, c]) => ({ id, L: line(c) }));
  const lb = (t, k, fmt, rate, tipk) => { const pool = rows.filter(r => !rate || r.L.PA >= qn).sort((a, b) => b.L[k] - a.L[k]).slice(0, 3); return `<div class="card lb"><h3${tipAttr(tipk || k)}>${t}</h3>${pool.map(r => `<div class="lead"><span>${plink(r.id)}</span><b>${fmt(r.L[k])}</b></div>`).join('')}</div>`; };
  const cyc = cyclesOf(last);
  el.innerHTML = `
  <div class="hero"><h1 class="hero-t"><img src="assets/logo.webp" alt="Green Machine" width="460" height="138"><span class="arch">Archive</span></h1>
    <div class="line">${esc(D.history.league)} · ${esc(D.history.park)} · Est. ${D.history.founded}</div>
    <div class="rec"><div><b>${curS.w}-${curS.l}${curS.t ? '-' + curS.t : ''}</b><span>${sLabel(curS.season)}</span></div><div><b>${at.w + at.po_w}-${at.l + at.po_l}${at.t ? '-' + at.t : ''}</b><span>All-time</span></div><div><b class="g">${D.history.league_championships.length}</b><span>League titles</span></div><div><b>${D.history.regular_season_championships.length}</b><span>Reg. season titles</span></div></div>
  </div>
  <h2>Latest game <small>${fdate(last.date, last.est)} · ${sLink(last.season)}</small></h2>
  <a class="card gcard" href="#/game/${last.key}">
    <div class="kick">${last.champ ? TROPHY + ' Championship game' : 'Final' + (last.po ? ' · Playoffs' : '')}${cyc.length ? ' · <span class="cyc">Cycle</span>' : ''}</div>
    <div class="score"><span class="tm">Green Machine</span><span class="rn ${res(last) === 'L' ? 'lo' : ''}">${last.gm}</span></div>
    <div class="score"><span class="tm" style="color:var(--ink2)">${last.opp === UNKNOWN_OPP ? 'Opponent' : esc(last.opp)}</span><span class="rn ${res(last) === 'W' ? 'lo' : ''}">${last.op ?? '?'}</span></div>
    <p class="recap">${esc(recap(last))}</p>
  </a>
  ${upcomingHTML()}
  ${onThisDate()}
  ${(() => { const f = milestoneFeed().slice(-6).reverse(); return f.length ? `<h2>Latest milestones</h2><div class="card">${f.map(feedRow).join('')}</div>` : ''; })()}
  <h2>${sLabel(lsn)} leaders <small>rate stats min. ${qn} PA</small></h2>
  <div class="grid g4">${lb('AVG', 'AVG', f3, 1)}${lb('OPS', 'OPS', f3, 1)}${lb('Home runs', 'HR', String)}${lb('RBI†', 'RBI', String)}</div>
  <h2>Recent games</h2><div class="tw" id="rg"></div>
  ${streakBlock()}
  <h2>Milestone watch <small>active players close to a round number</small></h2><div class="card">${milestoneWatch(8).map(msRow).join('') || '<p class="sub">No one within range.</p>'}
    <div style="margin-top:10px"><button class="btn ghost" onclick="shareCard('${last.key}')">Share last game</button></div></div>`;
  gamesTable($('#rg'), [...D.games].sort((a, b) => b.ord - a.ord).slice(0, 6), true);
}
/* UPCOMING SCHEDULE: unplayed results rows dated today or later */
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${(h + 11) % 12 + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
function upcomingHTML() {
  const up = D.results.filter(r => r.gm == null && r.date && r.date >= D.today && !D.cancelled.includes(r.season)).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  if (!up.length) return '';
  const perDay = {}; up.forEach(r => perDay[r.date] = (perDay[r.date] || 0) + 1); const seen = {};
  const h2h = o => { const g = allGames().filter(x => x.opp === o && x.res); const w = g.filter(x => x.res === 'W').length, l = g.filter(x => x.res === 'L').length, t = g.filter(x => x.res === 'T').length; return g.length ? `${w}-${l}${t ? '-' + t : ''}` : ''; };
  const rec = (season, o) => { const t = (D.standings[season]?.teams || []).find(x => x.team === o); return t ? `${t.w}-${t.l}${t.t ? '-' + t.t : ''}` : ''; };
  const day = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
  const row = r => { seen[r.date] = (seen[r.date] || 0) + 1; const dh = perDay[r.date] > 1 ? `Game ${seen[r.date]}` : ''; const when = r.date === D.today ? 'Tonight' : day(r.date);
    const sub = [rec(r.season, r.opponent) && `<span>Their record ${rec(r.season, r.opponent)}</span>`, h2h(r.opponent) && `<span>All-time vs them ${h2h(r.opponent)}</span>`].filter(Boolean).join(' · ');
    return `<div class="up-row"><div class="up-when"><b>${when}</b>${r.time ? `<span class="up-time">${fmtTime(r.time)}</span>` : ''}${dh ? `<small>${dh}</small>` : ''}</div><div class="up-opp"><a href="#/opp/${encodeURIComponent(r.opponent)}">${r.home === false ? '@' : 'vs'} ${esc(r.opponent)}</a>${r.playoff ? ' <span class="tag po">PO</span>' : ''}${sub ? `<small>${sub}</small>` : ''}</div></div>`; };
  const first = up.slice(0, 3), rest = up.slice(3);
  return `<h2>Upcoming schedule <small>${sLink(up[0].season)} · ${up.length} game${up.length > 1 ? 's' : ''} left</small></h2>
  <div class="card upc">${first.map(row).join('')}${rest.length ? `<details class="up-more"><summary>Show the rest of the season (${rest.length} more)</summary>${rest.map(row).join('')}</details>` : ''}</div>`;
}
function onThisDate() {
  const now = new Date(), md = d => d.slice(5);
  const pad = n => String(n).padStart(2, '0'), today = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dated = allGames().filter(x => x.date && x.gm != null);
  let hits = dated.filter(x => md(x.date) === today), title = 'On this date';
  if (!hits.length) {
    const near = new Set(); for (let i = -3; i <= 3; i++) { const d = new Date(now); d.setDate(d.getDate() + i); near.add(`${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); }
    hits = dated.filter(x => near.has(md(x.date))); title = 'This week in Green Machine history';
  }
  if (!hits.length) return '';
  hits = hits.sort((a, b) => (b.champ ? 1 : 0) - (a.champ ? 1 : 0) || (b.po ? 1 : 0) - (a.po ? 1 : 0) || b.date.localeCompare(a.date)).slice(0, 4);
  return `<h2>${title}</h2><div class="card">${hits.map(x => `<div class="lead"><span>${x.key ? `<a href="#/game/${x.key}">` : ''}${fdate(x.date, x.est)}${x.key ? '</a>' : ''} · ${vsTxt(x.opp)}${x.champ ? ' <span class="tag lc">Final</span>' : x.po ? ' <span class="tag po">PO</span>' : ''}</span><b>${wl(x)} ${scoreTxt(x)}</b></div>`).join('')}</div>`;
}
function streakBlock() {
  const s = streaks().filter(x => P(x.id).active && !P(x.id).ret);
  const mh = s.filter(x => x.mh >= 3).sort((a, b) => b.mh - a.mh).slice(0, 5), hr = s.filter(x => x.hr >= 2).sort((a, b) => b.hr - a.hr).slice(0, 5);
  if (!mh.length && !hr.length) return '';
  const card = (t, arr, k) => `<div class="card lb"><h3>${t}</h3>${arr.length ? arr.map(x => `<div class="lead"><span>${plink(x.id)}</span><b>${x[k]} games</b></div>`).join('') : '<p class="sub">None active.</p>'}</div>`;
  return `<h2>Active streaks <small>through each player's latest game</small></h2><div class="grid g2">${card('Multi-hit games', mh, 'mh')}${card('Games with a home run', hr, 'hr')}</div>`;
}

/* STATS */
function pgStats(el) {
  const s = ST.stats; if (!s.eras) s.eras = new Set(D.config.eras.map(e => e.id));
  const eraFilter = s.span === 'career' || s.span === 'last3';
  el.innerHTML = `<div class="page-h"><h1>Batting stats</h1><div class="sub">Tap a column to sort. Hover or press a column name for its definition. <b>Bold</b> names are current team members.</div></div>
  <div class="ctl"><select id="sspan" aria-label="Span">${spanOpts(s.span, { career: 'Career', last3: 'Last 3 years' })}</select>
  <div class="seg" id="sgrp" role="group" aria-label="Who">${[['all', 'All'], ['team', 'Team members'], ['sub', 'Subs']].map(([k, l]) => `<button data-v="${k}" class="${s.grp === k ? 'on' : ''}" aria-pressed="${s.grp === k}">${l}</button>`).join('')}</div>
  <div class="seg" id="sview" role="group" aria-label="View">${[['std', 'Standard'], ['adv', 'Advanced']].map(([k, l]) => `<button data-v="${k}" class="${s.view === k ? 'on' : ''}" aria-pressed="${s.view === k}">${l}</button>`).join('')}</div>
  <div class="seg" id="sq" role="group" aria-label="Qualified"><button data-v="0" class="${!s.q ? 'on' : ''}">All PA</button><button data-v="1" class="${s.q ? 'on' : ''}"${tipAttr('Q')}>Qualified</button></div>
  <div class="seg mob" id="sfull" role="group" aria-label="Columns"><button data-v="0" class="${!s.full ? 'on' : ''}">Key stats</button><button data-v="1" class="${s.full ? 'on' : ''}">All columns</button></div></div>
  ${eraFilter ? `<div class="ctl eras"><span class="sub">Show players from:</span>${D.config.eras.map(e => `<button class="chipbtn ${s.eras.has(e.id) ? 'on' : ''}" data-e="${e.id}" aria-pressed="${s.eras.has(e.id)}"><b>${e.name}</b><small>${e.label}</small></button>`).join('')}</div>` : ''}
  <div class="tw ${s.full ? 'full' : ''}" id="stb"></div><p class="note" id="snote"></p>`;
  $('#sspan').onchange = e => { s.span = e.target.value; pgStats(el); };
  [['#sgrp', 'grp'], ['#sview', 'view']].forEach(([id, k]) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => { s[k] = b.dataset.v; pgStats(el); }));
  $('#sq').querySelectorAll('button').forEach(b => b.onclick = () => { s.q = b.dataset.v === '1'; pgStats(el); });
  $('#sfull').querySelectorAll('button').forEach(b => b.onclick = () => { s.full = b.dataset.v === '1'; pgStats(el); });
  el.querySelectorAll('.eras button').forEach(b => b.onclick = () => { const e = b.dataset.e; if (s.eras.has(e)) { if (s.eras.size > 1) s.eras.delete(e); } else s.eras.add(e); pgStats(el); });
  const A = collect(g => inSpan(g, s.span)); const T = line(A.team); const qn = Math.ceil(QPG() * A.games); const QM = qMap(g => inSpan(g, s.span)); const isQ = r => r.L.PA >= (QM[r.id] ?? qn);
  const erasOf = pid => D.playerEras[pid] || new Set();
  let rows = Object.entries(A.players).map(([id, c]) => { const L = line(c); L['wOBA+'] = T.wOBA ? 100 * L.wOBA / T.wOBA : 0; return { id, L }; }).filter(r => r.L.PA > 0);
  if (eraFilter) rows = rows.filter(r => [...erasOf(r.id)].some(e => s.eras.has(e)));
  if (s.grp === 'team') rows = rows.filter(r => isTeam(r.id)); if (s.grp === 'sub') rows = rows.filter(r => !isTeam(r.id));
  if (s.q) rows = rows.filter(isQ);
  const cols = statCols(s.view); T['wOBA+'] = 100; T.G = A.games;
  const foot = `<tr class="tot">` + cols.map((c, i) => `<td class="${i ? '' : 'l fz'} ${c.x ? 'x' : ''}">${i ? c.f({ L: T }) : 'Team (' + A.games + ' G)'}</td>`).join('') + '</tr>';
  table($('#stb'), cols, rows, { state: s, leaders: r => isQ(r) && isTeam(r.id), rowCls: r => (isQ(r) ? '' : 'nq'), foot,
    section: s.grp === 'all' ? rs => [{ rows: rs.filter(r => isTeam(r.id)), title: `Team members (${rs.filter(r => isTeam(r.id)).length})` }, { rows: rs.filter(r => !isTeam(r.id)), title: `Subs (${rs.filter(r => !isTeam(r.id)).length})` }] : null });
  $('#snote').innerHTML = `${spanName(s.span)}: ${A.games} box-score games${eraFilter ? `; players who appeared in ${[...s.eras].map(eraName).join(', ')}` : ''}. Qualified = 2.1 PA per team game in the seasons a player appeared in${new Set(D.games.filter(g => inSpan(g, s.span)).map(g => g.season)).size === 1 ? ` (${qn} PA)` : ''}; non-qualifiers' rate stats are grey. Leaders among qualified team members are highlighted. † RBI are mostly reconstructed. <a href="#/glossary">Glossary</a>`;
}

/* PLAYERS */
function pgPlayers(el) {
  const A = collect(() => true);
  const rows = Object.entries(A.players).map(([id, c]) => ({ id, L: line(c) }));
  const grp = st => rows.filter(r => P(r.id).member === st).sort((a, b) => b.L.PA - a.L.PA);
  const yrs = id => { const p = P(id); return p.first ? (p.first === p.last ? `${p.first}` : `${p.first}–${p.last}`) : ''; };
  const card = r => `<a class="pl" href="#/player/${r.id}" data-n="${esc(pname(r.id).toLowerCase())}"><b class="${isCur(r.id) ? 'cur' : ''}">${esc(pname(r.id))}${P(r.id).ret ? ' <span class="ret">(R)</span>' : ''}${posTag(r.id)}</b><span>${r.L.G} G · ${f3(r.L.AVG)}/${f3(r.L.OBP)}/${f3(r.L.SLG)}<br>${yrs(r.id)}</span></a>`;
  el.innerHTML = `<div class="page-h"><h1>Players</h1><div class="sub">Team membership is set by the manager. <b>Bold</b> = current team member. (R) = retired team member (inactive since before 2024, or retired by the manager). Everyone else is a sub.</div></div>
  <div class="pl-search"><input id="psq" type="search" placeholder="Search players by name" aria-label="Search players by name" autocomplete="off" enterkeyhint="go"><span id="psn" class="sub" aria-live="polite"></span></div>
  ${(() => { const tm = [...grp('current'), ...grp('former').filter(r => !P(r.id).ret)], rt = grp('former').filter(r => P(r.id).ret);
    const sec = (t, list) => list.length ? `<section class="pl-sec"><h2>${t} <small>${list.length}</small></h2><div class="pl-list">${list.map(card).join('')}</div></section>` : '';
    return sec('Team members', tm) + sec('Retired team members', rt) + sec('Subs', grp('sub')); })()}
  <p class="sub" id="pnone" hidden>No players match that name.</p>`;
  const q = $('#psq'), norm = x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const run = () => { const v = norm(q.value); let shown = 0;
    el.querySelectorAll('.pl-sec').forEach(sc => { let n = 0; sc.querySelectorAll('.pl').forEach(a => { const ok = !v || norm(a.dataset.n).includes(v); a.hidden = !ok; if (ok) n++; }); sc.hidden = !n; sc.querySelector('h2 small').textContent = n; shown += n; });
    $('#pnone').hidden = shown > 0; $('#psn').textContent = v ? `${shown} match${shown === 1 ? '' : 'es'}` : ''; ST.players = q.value; };
  q.oninput = run;
  q.onkeydown = e => { if (e.key === 'Enter') { const vis = [...el.querySelectorAll('.pl:not([hidden])')]; if (vis.length === 1) location.hash = vis[0].getAttribute('href'); } };
  if (ST.players) { q.value = ST.players; run(); }
}
function pctPool(span) {
  const key = span.startsWith('s:') ? 'season' : span.startsWith('y:') ? 'year' : span.startsWith('era:') ? 'era' : 'career';
  D._pools = D._pools || {}; if (D._pools[key]) return D._pools[key];
  const pool = [];
  const push = (gf) => { const X = collect(gf); const tw = line(X.team).wOBA; Object.values(X.players).forEach(c => { const L = line(c); if (L.PA >= QPG() * X.games) pool.push(L); }); };
  if (key === 'season') bookSeasons().forEach(s => push(g => g.season === s));
  if (key === 'year') [...new Set(bookSeasons().map(s => s.slice(0, 4)))].forEach(y => push(g => g.season && g.season.startsWith(y)));
  if (key === 'era') D.config.eras.forEach(e => push(g => g.era === e.id));
  if (key === 'career') { const A = collect(() => true); Object.entries(A.players).forEach(([id, c]) => { const ss = new Set(D.games.filter(g => g.bat.some(b => b.p === id)).map(g => g.season || g.key)); const tg = D.games.filter(g => ss.has(g.season || g.key)).length; const L = line(c); if (L.PA >= QPG() * tg) pool.push(L); }); }
  return D._pools[key] = pool;
}
const POSXY = { 1: [50, 69], 2: [50, 90], 3: [67, 64], 4: [60, 52], 5: [33, 64], 6: [40, 52], 7: [16, 31], 8: [38, 17], 9: [62, 17], 10: [84, 31] };
function sprayChart(gf, id) {
  const cnt = {}, typ = { fly: 0, liner: 0, pop: 0, ground: 0 }; let n = 0;
  D.games.forEach(g => { if (!gf(g)) return; g.bat.forEach(b => { if (id && b.p !== id) return; b.pa.forEach(pa => { if (pa.length > 5) { cnt[pa[5]] = (cnt[pa[5]] || 0) + 1; typ[pa[6]]++; n++; } }); }); });
  if (!n) return '<p class="sub">No placeable outs in this span.</p>';
  const mx = Math.max(...Object.values(cnt));
  let s = `<svg viewBox="0 0 100 100" class="spray" role="img" aria-label="Where outs were made"><path d="M50 97 L2 49 A68 68 0 0 1 98 49 Z" class="fld"/><path d="M50 95 L32 77 L50 59 L68 77 Z" class="inf"/>`;
  Object.entries(POSXY).forEach(([pos, [x, y]]) => { const c = cnt[pos] || 0; const r = c ? 2.5 + 7 * Math.sqrt(c / mx) : 0; if (c) s += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" class="dot" style="opacity:${(0.35 + 0.65 * c / mx).toFixed(2)}"><title>${D.config.fielders[pos]}: ${c} outs (${Math.round(100 * c / n)}%)</title></circle>`; s += `<text x="${x}" y="${y + (c ? r + 4.2 : 1.5)}" class="lbl">${D.config.fielders[pos]}${c ? ' ' + Math.round(100 * c / n) + '%' : ''}</text>`; });
  s += '</svg>';
  const tt = Object.entries(typ).filter(x => x[1]).map(([k, v]) => `${k === 'ground' ? 'Grounders' : k === 'fly' ? 'Fly balls' : k === 'liner' ? 'Line drives' : 'Pop-ups'} ${Math.round(100 * v / n)}%`).join(' · ');
  return s + `<p class="note">${n} outs placed from scorebook notation (F8 = fly to ${D.config.fielders[8]}, 6-3 = grounder to SS). ${tt}. Outfield: 7 LF, 8 LCF, 9 RCF, 10 RF.</p>`;
}
function pgPlayer(el, id) {
  const p = own(D.players, id) ? D.players[id] : null; if (!p) return notFound(el, 'Player');
  document.title = p.name + ' · Green Machine';
  const ps = ST.player[id] || (ST.player[id] = { span: 'career', spray: 'career' });
  const A = collect(() => true), CL = line(A.players[id] || blank());
  const seasons = bookSeasons().filter(s => D.games.some(g => g.season === s && g.bat.some(b => b.p === id)));
  const tag = p.member === 'current' ? '<span class="tag reg">Team member</span>' : p.member === 'former' ? `<span class="tag fr">Team member${p.ret ? ' · Retired' : ''}</span>` : '<span class="tag sub">Sub</span>';
  // percentiles
  const X = collect(g => inSpan(g, ps.span)); const ML = line(X.players[id] || blank()); const qn = qMap(g => inSpan(g, ps.span))[id] ?? QPG() * X.games;
  const pool = pctPool(ps.span);
  const PCT = [['AVG', 'AVG', f3], ['OBP', 'OBP', f3], ['SLG', 'SLG', f3], ['wOBA', 'wOBA', f3], ['ISO', 'ISO', f3], ['XBH%', 'XBH rate', pc], ['Out%', 'Out rate', pc, 1]];
  const pctl = (k, inv) => { const vs = pool.map(L => L[k]); const below = vs.filter(v => inv ? v > ML[k] : v < ML[k]).length, eq = vs.filter(v => v === ML[k]).length; return Math.min(100, Math.round(100 * (below + eq / 2) / Math.max(1, vs.length))); };
  const colr = q => { const t = q / 100; const a = [29, 95, 168], m = [190, 196, 192], b = [200, 16, 46]; const mix = (x, y, u) => x.map((v, i) => Math.round(v + (y[i] - v) * u)); return `rgb(${t < .5 ? mix(a, m, t * 2) : mix(m, b, (t - .5) * 2)})`; };
  const poolName = ps.span.startsWith('s:') ? 'qualified player-seasons' : ps.span.startsWith('y:') ? 'qualified player-years' : ps.span.startsWith('era:') ? 'qualified player-eras' : 'qualified careers';
  // awards & rings
  const aw = []; Object.entries(D.awards).forEach(([s, a]) => a.list.forEach(x => { if (x.players.includes(id)) aw.push({ s, ...x }); }));
  const rings = D.history.league_championships.filter(s => D.games.some(g => g.season === s && g.bat.some(b => b.p === id)));
  el.innerHTML = `<div class="page-h ph"><div><div class="kick">${tag}</div><h1>${esc(p.name)}${p.ret ? ' <span class="ret">(R)</span>' : ''}${p.pos ? ` <span class="pos1">· ${esc(p.pos)}</span>` : ''}</h1>
    <div class="sub">${p.pos ? 'Usual position: ' + esc(p.pos) + ' · ' : ''}${p.first ? `Box scores ${p.first === p.last ? p.first : p.first + '–' + p.last}` : ''}</div></div>
    <div class="slash">${f3(CL.AVG)} / ${f3(CL.OBP)} / ${f3(CL.SLG)} <span class="sub">career · ${CL.G} G · ${CL.PA} PA · ${CL.HR} HR</span></div></div>
  ${aw.length || rings.length ? `<div class="card shelf"><div class="kick">Trophy case</div><div class="awards">${rings.map(s => `<span class="aw ring">${TROPHY}<b>League champion</b><small>${sLink(s)}</small></span>`).join('')}${aw.map(x => `<span class="aw">${x.award === 'MVP' || x.award === 'Playoff MVP' ? TROPHY : '<svg class="trophy" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6" fill="currentColor"/><path d="M8 14l-2 8 6-3 6 3-2-8" fill="currentColor"/></svg>'}<b>${esc(x.award)}</b><small>${sLink(x.s)} · ${esc(x.value)}</small></span>`).join('')}</div></div>` : ''}
  <div class="grid g2"><div class="card"><div class="cardh"><span class="kick">Percentile rankings</span><select id="pspan" aria-label="Percentile span">${spanOpts(ps.span, { career: 'Career' }, id)}</select></div>
    ${ML.PA ? PCT.map(([k, l, fm, inv]) => { const q = pctl(k, inv); return `<div class="pct"><span${tipAttr(k === 'XBH%' ? 'XBH' : k)}>${l}</span><span class="tr"><i style="width:${q}%;background:${colr(q)}33"></i><b style="left:${q}%;background:${colr(q)}">${q}</b></span><span class="v">${fm(ML[k])}</span></div>`; }).join('') : '<p class="sub">No plate appearances in this span.</p>'}
    <p class="note">${ML.PA} PA in ${spanName(ps.span)}${ML.PA && ML.PA < qn && !ps.span.startsWith('career') ? ` (below the ${Math.ceil(qn)} PA qualifier)` : ''}. Ranked against ${pool.length} ${poolName} (2.1 PA per team game). Red = better, blue = worse.</p></div>
    <div class="card"><div class="cardh"><span class="kick">Where outs go</span><select id="pspray" aria-label="Spray span">${spanOpts(ps.spray, { career: 'Career' }, id)}</select></div>${sprayChart(g => inSpan(g, ps.spray), id)}</div></div>
  <h2>Season by season</h2><div class="tw" id="pss"></div>
  <h2>Splits <small>career</small></h2><div class="tw" id="spl"></div>
  <h2>Game log <small>${CL.G} games, newest first</small></h2><div class="tw" id="pgl"></div>`;
  $('#pspan').onchange = e => { ps.span = e.target.value; pgPlayer(el, id); };
  $('#pspray').onchange = e => { ps.spray = e.target.value; pgPlayer(el, id); };
  const srows = seasons.map(s => { const Y = collect(g => g.season === s); const L = line(Y.players[id]); L['wOBA+'] = 100 * L.wOBA / line(Y.team).wOBA; return { id, s, L }; });
  const nos = D.games.filter(g => !g.season && g.bat.some(b => b.p === id));
  const cols = [{ k: 's', l: 'Season', l0: 1, fz: 1, v: r => sk(r.s), f: r => sLink(r.s) + (D.games.some(g => g.season === r.s && g.sest) ? '<span class="tag est" title="Includes games whose season is estimated">est.</span>' : '') }, ...statCols('std').slice(1).map(c => ({ ...c, x: 0 })), { k: 'wOBA+', l: 'wOBA+', tip: 'wOBA+', rate: 1, v: r => r.L['wOBA+'], f: r => Math.round(r.L['wOBA+']) }];
  CL['wOBA+'] = 100 * CL.wOBA / line(A.team).wOBA;
  const foot = `<tr class="tot">` + cols.map((c, i) => `<td class="${i ? '' : 'l fz'}">${i ? c.f({ L: CL }) : 'Career'}</td>`).join('') + '</tr>';
  table($('#pss'), cols, srows, { sort: 's', desc: true, foot });
  if (nos.length) $('#pss').insertAdjacentHTML('afterend', `<p class="note">Career includes ${nos.length} game${nos.length > 1 ? 's' : ''} whose season can't be placed.</p>`);
  const split = (keyf) => { const m = {}; D.games.forEach(g => g.bat.forEach(b => { if (b.p !== id) return; const k = keyf(g, b); if (k == null) return; const c = m[k] || (m[k] = blank()); c.G++; b.pa.forEach(pa => addPA(c, pa)); })); return Object.entries(m).map(([k, c]) => ({ k, L: line(c) })); };
  const sp = [...split(g => g.po ? 'Playoffs' : 'Regular season'), ...split(g => g.champ ? 'Championship games' : null),
    ...split((g, b) => b.slot <= 3 ? 'Batting 1-3' : b.slot <= 6 ? 'Batting 4-6' : b.slot <= 9 ? 'Batting 7-9' : 'Batting 10+'),
    ...D.config.eras.flatMap(e => split(g => g.era === e.id ? eraName(e.id) : null)),
    ...split(g => 'vs ' + g.opp).filter(r => r.L.PA >= 8).sort((a, b) => b.L.PA - a.L.PA)];
  $('#spl').innerHTML = `<table class="st"><thead><tr><th class="l fz">Split</th><th>G</th><th>PA</th><th${tipAttr('AVG')}>AVG</th><th${tipAttr('OBP')}>OBP</th><th${tipAttr('SLG')}>SLG</th><th>HR</th><th${tipAttr('RBI')}>RBI†</th></tr></thead><tbody>${sp.map(r => `<tr><td class="l fz">${esc(r.k)}</td><td>${r.L.G}</td><td>${r.L.PA}</td><td>${f3(r.L.AVG)}</td><td>${f3(r.L.OBP)}</td><td>${f3(r.L.SLG)}</td><td>${r.L.HR}</td><td>${r.L.RBI}</td></tr>`).join('')}</tbody></table>`;
  const gl = D.games.filter(g => g.bat.some(b => b.p === id)).map(g => { const b = g.bat.find(b => b.p === id); return { g, b, L: batLine(b) }; });
  const gcols = [{ k: 'd', l: 'Date', l0: 1, fz: 1, v: r => r.g.ord, f: r => `<a href="#/game/${r.g.key}">${r.g.date ? fdate(r.g.date, r.g.est) : seasonOf(r.g)}</a>` }, { k: 'o', l: 'Opp', l0: 1, v: r => r.g.opp, f: r => esc(r.g.opp) + (r.g.champ ? '<span class="tag lc">Final</span>' : r.g.po ? '<span class="tag po">PO</span>' : '') },
    { k: 'res', l: 'Res', v: r => r.g.op == null ? null : r.g.gm - r.g.op, f: r => `${wl(r.g)} ${scoreTxt(r.g)}` }, { k: 'slot', l: 'Bat', v: r => r.b.slot, f: r => r.b.slot, asc: 1 },
    ...['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB'].map(k => ({ k, l: k === 'RBI' ? 'RBI†' : k, tip: k, v: r => r.L[k], f: r => r.L[k] })), { k: 'pa', l: 'Plate appearances', l0: 1, f: r => chips(r.b.pa) + (isCycle(r.b) ? ' <span class="cyc">Cycle</span>' : '') }];
  table($('#pgl'), gcols, gl, { sort: 'd', desc: true });
}
function chips(pas) { return `<span class="chips">${pas.map(p => { const c = p[2]; const k = c === 'HR' ? 'hr' : HIT.includes(c) ? 'h' : ['BB', 'HBP'].includes(c) ? 'bb' : ''; return `<span class="chip ${k} ${p[3] === 4 ? 'r' : ''}" title="Inning ${p[0]}${p[3] === 4 ? ', scored' : ''}${p[4] ? ', ' + p[4] + ' RBI' : ''}">${esc(p[1])}</span>`; }).join('')}</span>`; }

/* GAMES */
function gamesTable(el, games, compact) {
  const cols = [{ k: 'd', l: 'Date', l0: 1, fz: 1, v: r => r.ord, f: r => `<a href="#/game/${r.key}">${r.date ? fdate(r.date, r.est) : 'Date unknown'}</a>` },
    { k: 'o', l: 'Opponent', l0: 1, v: r => r.opp, f: r => oppLink(r.opp) + (r.champ ? '<span class="tag lc">Final</span>' : r.po ? '<span class="tag po">PO</span>' : '') },
    { k: 'r', l: 'Result', v: r => r.op == null ? null : r.gm - r.op, f: r => `${wl(r)} ${scoreTxt(r)}` },
    ...(compact ? [] : [{ k: 's', l: 'Season', l0: 1, v: r => r.sk * 1000 + r.ord, f: r => r.season ? sLink(r.season) + (r.sest ? ' <span class="tag est">est.</span>' : '') : 'Season unknown' }]),
    { k: 't', l: 'Top performers', l0: 1, x: 1, f: r => topPerf(r, 2).map(x => `${esc(pname(x.b.p))} ${gameLine(x.L)}${isCycle(x.b) ? ' (cycle)' : ''}`).join(' · ') }];
  table(el, cols, games, { sort: 'd', desc: true, cls: 'games' });
}
function pgGames(el) {
  const s = ST.games;
  el.innerHTML = `<div class="page-h"><h1>Games</h1><div class="sub">Box scores for every transcribed scorebook game, plus every league-site result since 2017.</div></div>
  <div class="ctl"><select id="gspan" aria-label="Span">${spanOpts(s.span, { all: 'All seasons' })}</select>
  <div class="seg" id="gsrc"><button data-v="book" class="${s.src === 'book' ? 'on' : ''}">Box scores</button><button data-v="all" class="${s.src === 'all' ? 'on' : ''}">All results</button></div></div><div class="tw" id="gt"></div><p class="note">* Date estimated from scorebook order. "est." = season estimated from the lineup. ? = opponent's score not recorded.</p>`;
  $('#gspan').onchange = e => { s.span = e.target.value; pgGames(el); };
  $('#gsrc').querySelectorAll('button').forEach(b => b.onclick = () => { s.src = b.dataset.v; pgGames(el); });
  if (s.src === 'book') return gamesTable($('#gt'), D.games.filter(g => inSpan(g, s.span)));
  const rs = allGames().filter(x => inSpan({ season: x.season, date: x.date, era: x.season ? eraOfSeason(x.season) : 'I' }, s.span));
  table($('#gt'), [{ k: 'd', l: 'Date', l0: 1, fz: 1, v: r => r.sortk, f: r => r.key ? `<a href="#/game/${r.key}">${fdate(r.date, r.est)}</a>` : fdate(r.date, r.est) },
    { k: 'o', l: 'Opponent', l0: 1, v: r => r.opp, f: r => oppLink(r.opp) + (r.champ ? '<span class="tag lc">Final</span>' : r.po ? '<span class="tag po">PO</span>' : '') },
    { k: 'r', l: 'Result', v: r => r.op == null ? null : r.gm - r.op, f: r => r.gm == null ? '<span class="sub">No score</span>' : `${wl(r)} ${scoreTxt(r)}` }, { k: 's', l: 'Season', l0: 1, v: r => r.sortk, f: r => sLink(r.season) },
    { k: 'b', l: 'Box', l0: 1, v: r => r.key ? 1 : 0, f: r => r.key ? `<a href="#/game/${r.key}">Box score</a>` : '<span class="sub">—</span>' }], rs, { sort: 'd', desc: true });
}
const eraOfSeason = s => { const y = +s.slice(0, 4); const e = D.config.eras.find(e => y >= e.from && y <= (e.to || 9999)); return e?.id; };
function pgGame(el, key) {
  const g = D.gByKey.get(key); if (!g) return notFound(el, 'Game');
  document.title = `GM ${g.gm}, ${g.opp} ${g.op ?? '?'} · Green Machine`;
  const i = g.ord, prev = D.games[i - 1], next = D.games[i + 1];
  const n = Math.max(g.ls.gm.filter(x => x != null).length, g.ls.opp.filter(x => x != null).length, g.inn || 0, 5);
  const played = Math.max(...[g.ls.gm, g.ls.opp].map(r => r.reduce((m, v, i) => v != null ? i + 1 : m, 0)));
  const cell = (v, k) => v == null ? (k < played ? '<span class="sub">–</span>' : '') : v;
  const rowsLS = [[g.opp === UNKNOWN_OPP ? 'Opponent' : esc(g.opp), g.ls.opp, g.op ?? '?'], ['Green Machine', g.ls.gm, g.gm]]; if (g.home === false) rowsLS.reverse();
  const box = boxOf(g); const tot = blank(); g.bat.forEach(b => { b.pa.forEach(pa => addPA(tot, pa)); tot.R += b.xr || 0; }); const TL = line(tot);
  const cyc = cyclesOf(g);
  const notes = ['2B', '3B', 'HR'].map(k => { const w = box.filter(x => x.L[k]).map(x => esc(pname(x.b.p)) + (x.L[k] > 1 ? ' ' + x.L[k] : '')); return w.length ? `<b>${k}:</b> ${w.join(', ')}` : ''; }).filter(Boolean).join(' · ');
  const r = res(g);
  el.innerHTML = `${g.champ ? `<div class="champ-banner">${TROPHY}<div><b>${esc(g.title || 'Championship game')}</b><span>${r === 'W' ? `${sLabel(g.season)} league champions` : r === 'L' ? 'Lost the final' : sLabel(g.season) + ' final'}</span></div></div>` : ''}
  <div class="page-h"><div class="kick">${g.date ? fdate(g.date, g.est) : 'Date unknown'} · ${g.season ? sLink(g.season) + (g.sest ? ' (est.)' : '') : 'Season unknown'}${g.po && !g.champ ? ' · Playoffs' : ''}</div>
    <h1>${g.op == null ? `Green Machine ${g.gm} · <span class="sub">opponent score not recorded</span>` : `${wl(g)} Green Machine ${g.gm}, ${g.opp === UNKNOWN_OPP ? 'Opponent' : esc(g.opp)} ${g.op}`}</h1><div class="sub">${esc(g.end)}${g.home == null ? '' : g.home ? ' · Home' : ' · Away'} · ${g.opp === UNKNOWN_OPP ? '<span class="sub">Opponent not recorded</span>' : `<a href="#/opp/${encodeURIComponent(g.opp)}">All games ${vsTxt(g.opp)}</a>`}</div></div>
  <p class="recap card">${esc(recap(g))}${cyc.length ? ` <span class="cyc">Cycle: ${cyc.map(p => esc(pname(p))).join(', ')}</span>` : ''}</p>
  <div class="ctl">${prev ? `<a class="btn ghost" href="#/game/${prev.key}">‹ Prev</a>` : ''}${next ? `<a class="btn ghost" href="#/game/${next.key}">Next ›</a>` : ''}<button class="btn" onclick="shareCard('${g.key}')">Share card</button></div>
  <div class="tw"><table class="st ls"><thead><tr><th class="l">Team</th>${Array.from({ length: n }, (_, k) => `<th>${k + 1}</th>`).join('')}<th>R</th></tr></thead><tbody>
  ${rowsLS.map(([t, a, rr]) => `<tr><td class="l"><b>${t}</b></td>${Array.from({ length: n }, (_, k) => `<td>${cell(a[k], k)}</td>`).join('')}<td><b>${rr}</b></td></tr>`).join('')}</tbody></table></div>
  <h2>Batting</h2><div class="tw" id="bx"></div><p class="note">${notes}</p>
  <h2>Plate appearances</h2><div class="card">${box.map(x => `<div class="lead pa"><span>${x.b.slot}. ${plink(x.b.p)}${isCycle(x.b) ? ' <span class="cyc">Cycle</span>' : ''}</span>${chips(x.b.pa)}</div>`).join('')}
    <p class="note">Gold outline = scored. Hover or long-press a chip for inning and RBI.</p></div>
  <p class="note src">Scorebook: ${esc(g.book || '')}${g.note.length ? ' · ' + g.note.map(esc).join(' · ') : ''}</p>`;
  const cols = [{ k: 'slot', l: '#', v: r => r.b.slot, f: r => r.b.slot, asc: 1 }, { k: 'name', l: 'Player', l0: 1, fz: 1, v: r => pname(r.b.p), f: r => plink(r.b.p) },
    ...['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB'].map(k => ({ k, l: k === 'RBI' ? 'RBI†' : k, tip: k, v: r => r.L[k], f: r => r.L[k] }))];
  const foot = `<tr class="tot"><td></td><td class="l fz">Totals</td>${['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB'].map(k => `<td>${TL[k]}</td>`).join('')}</tr>`;
  table($('#bx'), cols, box, { sort: 'slot', desc: false, foot });
}

/* SEASONS */
function pgSeasons(el) {
  const rows = [...D.seasons].reverse();
  el.innerHTML = `<div class="page-h"><h1>Seasons</h1><div class="sub">Every season we have a record, a result or a box score for.</div></div><div class="tw" id="sl"></div>`;
  table($('#sl'), [{ k: 's', l: 'Season', l0: 1, fz: 1, v: r => sk(r.season), f: r => sLink(r.season) },
    { k: 'wl', l: 'W-L', v: r => r.w ?? -1, f: r => r.rec_src ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : `<span class="sub">${esc(r.approx || '—')}</span>` },
    { k: 'po', l: 'Post', f: r => (r.po_w || r.po_l) ? `${r.po_w}-${r.po_l}` : '<span class="sub">—</span>' },
    { k: 'st', l: 'Finish', l0: 1, f: r => esc(r.standing || '') }, { k: 'box', l: 'Box scores', v: r => r.box, f: r => r.box || '<span class="sub">0</span>' },
    { k: 'f', l: 'Titles', l0: 1, f: r => titleTags(r) + ` <span class="sub">${esc(r.postseason || '')}</span>` }], rows, { sort: 's', desc: true, foot: seasonsFoot() });
}
function seasonsFoot() {
  const at = D.alltime, n = at.nos || { w: 0, l: 0, t: 0, box: 0 }, rec = (w, l, t) => `${w}-${l}${t ? '-' + t : ''}`;
  const unk = D.games.filter(g => !g.season);
  const row1 = n.box ? `<tr><td class="l fz">Season unknown</td><td>${rec(n.w, n.l, n.t)}</td><td><span class="sub">—</span></td><td class="l"><span class="sub">Date and season not recorded</span></td><td>${unk.map(g => `<a href="#/game/${g.key}">${n.box}</a>`).slice(0, 1).join('')}</td><td class="l"></td></tr>` : '';
  const box = D.seasons.reduce((a, r) => a + (r.box || 0), 0) + n.box;
  return row1 + `<tr class="tot"><td class="l fz">All-time</td><td>${rec(at.w, at.l, at.t)}</td><td>${at.po_w}-${at.po_l}</td><td class="l">${rec(at.w + at.po_w, at.l + at.po_l, at.t)} overall</td><td>${box}</td><td class="l"></td></tr>`;
}
const titleTags = r => (r.league_champion ? '<span class="tag lc">League champs</span>' : '') + (r.regular_season_champion ? `<span class="tag rc">Reg. season ${r.rs_tie ? 'co-champs' : 'champs'}</span>` : '');
function pgSeason(el, s) {
  const row = D.seasons.find(x => x.season === s); if (!row) return notFound(el, 'Season');
  document.title = sLabel(s) + ' · Green Machine';
  const i = D.seasons.indexOf(row), pv = D.seasons[i - 1], nx = D.seasons[i + 1];
  const bs = D.games.filter(g => g.season === s);
  const list = allGames().filter(x => x.season === s);
  const aw = D.awards[s];
  const po = list.filter(x => x.po);
  const std = D.standings[s];
  const total = row.games ?? list.length;
  el.innerHTML = `<div class="ctl season-nav">${pv ? `<a class="btn ghost" href="#/season/${encodeURIComponent(pv.season)}">‹ ${sLabel(pv.season)}</a>` : ''}<a class="btn ghost" href="#/seasons">All seasons</a>${nx ? `<a class="btn ghost" href="#/season/${encodeURIComponent(nx.season)}">${sLabel(nx.season)} ›</a>` : ''}</div>
  <div class="page-h"><div class="kick">${eraName(row.era)}</div><h1>${sLabel(s)}</h1>
  <div class="season-sum">${row.rec_src ? `<b>${row.w}-${row.l}${row.t ? '-' + row.t : ''}</b> regular season` : row.approx ? `<b>${esc(row.approx)}</b>` : '<span class="sub">Record not known</span>'}${row.po_w || row.po_l ? ` · <b>${row.po_w}-${row.po_l}</b> postseason` : ''}${row.standing ? ' · ' + esc(row.standing) : ''}${row.postseason ? ' · ' + esc(row.postseason) : ''}</div>
  <div style="margin-top:6px">${titleTags(row)}${row.in_progress ? '<span class="tag est">In progress</span>' : ''}</div>
  <div class="sub" style="margin-top:6px">${row.box ? `Box scores for ${row.box}${total ? ` of ${Math.max(total, row.box)}` : ''} games` : 'No box scores for this season'}${row.sest ? ' (some games placed in this season from the lineup)' : ''}${row.rec_src === 'book' ? '. Record is from the scorebook games only.' : row.rec_src === 'archive' ? '. Record from team emails.' : ''}${row.unknown ? ` · ${row.unknown} game${row.unknown > 1 ? 's' : ''} without a known result` : ''}</div></div>
  ${row.league_champion ? `<div class="champ-banner">${TROPHY}<div><b>League champions</b><span>${sLabel(s)}</span></div></div>` : ''}
  ${aw && aw.list.length ? `<h2>Season awards <small>from ${aw.games} box-score games</small></h2><div class="awards grid">${aw.list.map(x => `<div class="card aw2"><div class="kick">${esc(x.award)}</div><div>${x.players.map(plink).join(', ')}</div><div class="sub">${esc(x.value)}</div></div>`).join('')}</div>` : ''}
  ${po.length ? `<h2>Playoff run</h2><div class="run">${po.map((x, k) => `<div class="card rg ${x.res || 'U'}"><div class="kick">${(std && std.bracket || []).find(b => b.date === x.date && ((b.a === x.opp && /green machine/i.test(b.b)) || (b.b === x.opp && /green machine/i.test(b.a))))?.round || (x.champ ? 'Final' : 'Round ' + (k + 1))}${x.date ? ' · ' + fdateShort(x.date) : ''}</div><div>${vsTxt(x.opp)}</div><b>${x.gm == null ? 'Score n/a' : wl(x) + ' ' + scoreTxt(x)}</b>${x.key ? ` <a href="#/game/${x.key}">Box</a>` : ''}</div>`).join('<span class="arr">›</span>')}</div>` : ''}
  ${std && std.teams && std.teams.length ? `<h2>Standings</h2>${standingsTable(std)}${bookDiffNote(s, row)}` : list.some(x => !x.po && x.opp !== 'Not recorded') ? `<h2>Record by opponent</h2>${oppTable(list, row)}` : ''}
  ${std && std.bracket && std.bracket.length ? `<h2>Playoff bracket <small>from the league site${std.bracket.some(b => /round of 16/i.test(b.round)) ? '' : ''}</small></h2>${bracketHTML(std.bracket)}` : ''}
  <h2>Results</h2><div class="tw" id="sr"></div>
  ${bs.length ? `<h2>Team batting</h2><div class="tw" id="sb"></div>` : ''}`;
  table($('#sr'), [{ k: 'd', l: 'Date', l0: 1, fz: 1, v: r => r.sortk, f: r => r.key ? `<a href="#/game/${r.key}">${fdate(r.date, r.est)}</a>` : fdate(r.date, r.est) },
    { k: 'o', l: 'Opponent', l0: 1, v: r => r.opp, f: r => esc(r.opp) + (r.champ ? '<span class="tag lc">Final</span>' : r.po ? '<span class="tag po">PO</span>' : '') },
    { k: 'r', l: 'Result', v: r => r.op == null ? null : r.gm - r.op, f: r => r.gm == null ? '<span class="sub">No score</span>' : `${wl(r)} ${scoreTxt(r)}` },
    { k: 'b', l: 'Box', l0: 1, f: r => r.key ? `<a href="#/game/${r.key}">Box score</a>` : '<span class="sub">—</span>' }], list, { sort: 'd', desc: false });
  if (bs.length) {
    const A = collect(g => g.season === s), T = line(A.team), qn = Math.ceil(QPG() * A.games);
    const rows = Object.entries(A.players).map(([id, c]) => { const L = line(c); L['wOBA+'] = 100 * L.wOBA / T.wOBA; return { id, L }; });
    const cols = statCols('std').map(c => ({ ...c, x: 0 }));
    table($('#sb'), cols, rows, { sort: 'PA', desc: true, leaders: r => r.L.PA >= qn, rowCls: r => r.L.PA < qn ? 'nq' : '', foot: `<tr class="tot">` + cols.map((c, i) => `<td class="${i ? '' : 'l fz'}">${i ? c.f({ L: Object.assign(T, { G: A.games }) }) : 'Team'}</td>`).join('') + '</tr>' });
  }
}
function bookDiffNote(s, row) {
  const rs = (a, b) => Math.sign(a - b);
  const d = D.results.filter(r => r.season === s && !r.playoff && r.site && r.game && D.gByKey.get(r.game) && D.gByKey.get(r.game).op != null && rs(D.gByKey.get(r.game).gm, D.gByKey.get(r.game).op) !== rs(r.site[0], r.site[1]));
  if (!d.length) return '';
  const txt = d.map(r => { const g = D.gByKey.get(r.game); return `${fdate(r.date, g.est)} vs ${esc(r.opponent)} as ${g.gm}-${g.op} (site ${r.site[0]}-${r.site[1]})`; }).join('; ');
  return `<p class="note">League table uses league-site scores. Our scorebook has ${txt}${row.rec_src ? `, so our record is ${row.w}-${row.l}${row.t ? '-' + row.t : ''}` : ''}.</p>`;
}
function oppTable(list, row) {
  const m = {}; list.filter(x => !x.po).forEach(x => { const o = m[x.opp] || (m[x.opp] = { opp: x.opp, W: 0, L: 0, T: 0, U: 0, RS: 0, RA: 0 }); if (!x.res) o.U++; else { o[x.res]++; o.RS += x.gm; o.RA += x.op; } });
  const rows = Object.values(m).sort((a, b) => (b.W + b.L + b.T) - (a.W + a.L + a.T));
  return `<div class="card"><p class="sub" style="margin:0 0 6px">${row.standing ? `Final: <b>${esc(row.standing)}</b>. ` : ''}The league didn't publish a table for this season, so this is our regular-season record against each opponent.</p>${rows.length ? `<div class="tw"><table class="st"><thead><tr><th class="l">Opponent</th><th>W</th><th>L</th><th>T</th><th>RS</th><th>RA</th></tr></thead><tbody>${rows.map(o => `<tr><td class="l">${oppLink(o.opp)}${o.U ? ` <span class="sub">(+${o.U} no score)</span>` : ''}</td><td>${o.W}</td><td>${o.L}</td><td>${o.T}</td><td>${o.RS}</td><td>${o.RA}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">No regular-season results recorded.</p>'}</div>`;
}
function bracketHTML(br) {
  const order = ['Round of 16', 'Quarterfinal', 'Semifinal', 'Final'];
  const rounds = order.filter(r => br.some(b => b.round === r));
  const side = (n, s, w) => `<div class="${w ? 'w' : ''} ${/green machine/i.test(n) ? 'gm' : ''}"><span>${esc(n)}</span><b>${s ?? ''}</b></div>`;
  return `<div class="bracket">${rounds.map(r => `<div class="rd"><h4>${r === 'Final' ? r : r + 's'}</h4>${br.filter(b => b.round === r).map(b => `<div class="m">${side(b.a, b.as, b.as > b.bs)}${side(b.b, b.bs, b.bs > b.as)}<small>${fdate(b.date)}</small></div>`).join('')}</div>`).join('')}</div><p class="note">Source: LeagueLobster. Scores as posted by the league; our box score wins where they differ.</p>`;
}
function standingsTable(std) {
  return `<div class="tw"><table class="st"><thead><tr><th class="l">#</th><th class="l">Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th>${std.teams[0].rs != null ? '<th>RS</th><th>RA</th>' : ''}</tr></thead><tbody>${std.teams.map((t, i) => `<tr class="${/green machine/i.test(t.team) ? 'hl' : ''}"><td class="l">${i + 1}</td><td class="l">${esc(t.team)}</td><td>${t.w}</td><td>${t.l}</td><td>${t.t || 0}</td><td>${f3((t.w + (t.t || 0) / 2) / Math.max(1, t.w + t.l + (t.t || 0)))}</td>${t.rs != null ? `<td>${t.rs}</td><td>${t.ra}</td>` : ''}</tr>`).join('')}</tbody></table></div>${std.source ? `<p class="note">Source: ${esc(std.source)}</p>` : ''}`;
}

/* HISTORY */
function pgHistory(el) {
  const H = D.history, at = D.alltime;
  const lg = D.seasons.filter(s => s.rec_src === 'league');
  let cw = 0, cl = 0, ct = 0; const chartRows = lg.map(s => { cw += s.w; cl += s.l; ct += s.t; return { ...s, cpct: (cw + ct / 2) / (cw + cl + ct) }; });
  const pw = D.seasons.reduce((a, s) => a + (s.po_w || 0), 0), pl = D.seasons.reduce((a, s) => a + (s.po_l || 0), 0);
  el.innerHTML = `<div class="page-h"><h1>Franchise history</h1><div class="sub">${esc(H.league)} · Est. ${H.founded}. All-time record counts every game with a known result since ${sLabel(at.first)}: league-site seasons from 2017, team records and scorebooks before that.${at.nos && at.nos.box ? ` It includes ${at.nos.box} scorebook game with no date or season (${at.nos.w}-${at.nos.l}).` : ''}</div></div>
  <div class="grid g4"><div class="tile"><div class="k">All-time</div><div class="v">${at.w + at.po_w}-${at.l + at.po_l}${at.t ? '-' + at.t : ''}</div><div class="s">${f3((at.w + at.po_w + at.t / 2) / (at.w + at.po_w + at.l + at.po_l + at.t))} · regular season ${at.w}-${at.l}-${at.t}</div></div>
  <div class="tile"><div class="k">Postseason</div><div class="v">${pw}-${pl}</div><div class="s">playoff games with a known score</div></div>
  <div class="tile gold"><div class="k">League (tournament) champs</div><div class="v">${H.league_championships.length}</div><div class="s">since 2012</div></div>
  <div class="tile"><div class="k">Regular-season champs</div><div class="v">${H.regular_season_championships.length}</div><div class="s">1st or tied for 1st</div></div></div>
  <h2>League championships <small>won the season-ending tournament</small></h2><div class="banners">${H.league_championships.map(s => `<div class="bn lc"><small>League champions</small>${sLabel(s)}</div>`).join('')}</div>
  <h2>Regular-season championships <small>finished first in the standings</small></h2><div class="banners">${H.regular_season_championships.map(s => `<div class="bn rc"><small>Reg. season ${D.seasons.find(x => x.season === s)?.rs_tie ? 'co-champions' : 'champions'}</small>${sLabel(s)}</div>`).join('')}</div>
  <p class="note">${esc(H.regular_season_note || '')}</p>
  <h2>Regular-season W-L% <small><span class="tag lc">gold</span> league champion · ● regular-season champion · line = cumulative · league-site seasons</small></h2><div class="card chart">${histChart(chartRows)}</div>
  <h2>Year by year <small>tap a season for its page</small></h2><div class="tw" id="ht"></div>
  <p class="note">"Book" records come from the scorebook games we have, so they can be partial. "Team records" come from emails and texts.</p>`;
  const pct = s => (s.w + s.t / 2) / Math.max(1, s.w + s.l + s.t);
  table($('#ht'), [{ k: 's', l: 'Season', l0: 1, fz: 1, v: r => sk(r.season), f: r => sLink(r.season) },
    { k: 'wl', l: 'W-L', v: r => r.w ?? -1, f: r => r.rec_src ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : `<span class="sub">${esc(r.approx || '—')}</span>` }, { k: 'p', l: 'W-L%', v: r => r.rec_src ? pct(r) : -1, f: r => r.rec_src ? f3(pct(r)) : '' },
    { k: 'src', l: 'Source', l0: 1, f: r => ({ league: 'League site', book: 'Book', archive: 'Team records' }[r.rec_src] || '') },
    { k: 'st', l: 'Standing', l0: 1, f: r => esc(r.standing || '') },
    { k: 'po', l: 'Post', v: r => (r.po_w || 0) - (r.po_l || 0), f: r => (r.po_w || r.po_l) ? `${r.po_w}-${r.po_l}` : '<span class="sub">—</span>' },
    { k: 'rs', l: 'RS', v: r => r.rs ?? -1, f: r => r.rs ?? '' }, { k: 'ra', l: 'RA', v: r => r.ra ?? -1, f: r => r.ra ?? '', asc: 1 },
    { k: 'd', l: 'Diff', v: r => r.rs != null ? r.rs - r.ra : -999, f: r => r.rs != null ? `<span class="${r.rs > r.ra ? 'pos' : r.rs < r.ra ? 'neg' : ''}">${r.rs - r.ra > 0 ? '+' : ''}${r.rs - r.ra}</span>` : '' },
    { k: 'f', l: 'Finish', l0: 1, f: r => titleTags(r) + ` <span class="sub">${esc(r.postseason || '')}</span>` }], D.seasons, { sort: 's', desc: false });
}
function histChart(rows) {
  const W = 760, Hh = 150, n = rows.length, bw = W / n; let s = `<svg viewBox="-30 -10 ${W + 34} ${Hh + 46}" role="img" aria-label="Regular-season winning percentage by season">`;
  [0, .25, .5, .75, 1].forEach(y => { const yy = Hh - y * Hh; s += `<line x1="0" x2="${W}" y1="${yy}" y2="${yy}" style="stroke:var(${y === .5 ? '--half' : '--grid'})" ${y === .5 ? 'stroke-dasharray="3 3"' : ''}/><text x="-5" y="${yy + 3}" font-size="9" style="fill:var(--axis)" text-anchor="end">${y === 1 ? '1.000' : ('' + y.toFixed(3)).slice(1)}</text>`; });
  const pts = []; let lastY = '';
  rows.forEach((r, i) => {
    const p = (r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t), x = i * bw + bw * .17, h = p * Hh, w = bw * .66;
    s += `<a href="#/season/${encodeURIComponent(r.season)}"><rect x="${x}" y="${Hh - h}" width="${w}" height="${h}" style="fill:var(${r.league_champion ? '--gold' : '--bar'})" rx="1.5"><title>${sLabel(r.season)}: ${r.w}-${r.l}${r.t ? '-' + r.t : ''}</title></rect></a>`;
    if (r.regular_season_champion) s += `<circle cx="${x + w / 2}" cy="${Hh - h - 7}" r="4" style="fill:var(--em)"/>`;
    s += `<text x="${x + w / 2}" y="${Hh + 13}" font-size="9" style="fill:var(--axis)" text-anchor="middle">${{ Spring: 'Sp', Summer: 'Su', Fall: 'F' }[r.season.split(' ')[1]]}</text>`;
    const y = r.season.slice(0, 4); if (y !== lastY) { s += `<text x="${i * bw + 2}" y="${Hh + 30}" font-size="11" font-weight="700" style="fill:var(--ink)">${y}</text><line x1="${i * bw}" x2="${i * bw}" y1="${Hh}" y2="${Hh + 34}" style="stroke:var(--grid)"/>`; lastY = y; }
    pts.push(`${x + w / 2},${Hh - r.cpct * Hh}`);
  });
  return s + `<polyline points="${pts.join(' ')}" style="fill:none;stroke:var(--cum);stroke-width:1.8"/></svg>`;
}

/* RECORDS */
function pgRecords(el) {
  const rs = ST.rec;
  const gf = g => inSpan(g, rs.span);
  const sg = []; D.games.filter(gf).forEach(g => g.bat.forEach(b => sg.push({ id: b.p, g, b, L: batLine(b) })));
  const SS = []; bookSeasons().forEach(s => { const X = collect(g => g.season === s && gf(g)); if (!X.games) return; Object.entries(X.players).forEach(([id, c]) => { const L = line(c); SS.push({ id, s, L, q: L.PA >= Math.max(QPG() * X.games, 15) }); }); });
  const car = collect(gf); const CR = Object.entries(car.players).map(([id, c]) => ({ id, L: line(c) }));
  const top = (arr, k, n = 5) => [...arr].sort((a, b) => b.L[k] - a.L[k]).slice(0, n);
  const blk = (t, arr, k, fmt, ctx, tipk) => `<div class="card lb"><h3${tipAttr(tipk || k)}>${t}</h3>${arr.map(r => `<div class="lead"><span>${plink(r.id)} <span class="sub">${ctx(r)}</span></span><b>${fmt(r.L[k])}</b></div>`).join('') || '<p class="sub">None.</p>'}</div>`;
  const gctx = r => `<a href="#/game/${r.g.key}">${r.g.date ? fdateShort(r.g.date) + ' ' + r.g.date.slice(0, 4) : seasonOf(r.g)}</a>`;
  const sgb = (t, k) => blk(t, top(sg, k), k, String, gctx);
  const ssb = (t, k, fmt = String, q) => blk(t, top(q ? SS.filter(x => x.q) : SS, k), k, fmt, r => sLabel(r.s));
  const QM = qMap(gf); const crb = (t, k, fmt = String, q) => blk(t, top(q ? CR.filter(r => r.L.PA >= QM[r.id]) : CR, k), k, fmt, r => `${r.L.PA} PA`);
  const cyc = sg.filter(x => isCycle(x.b)).sort((a, b) => b.g.ord - a.g.ord);
  const stk = streaks();
  const R = allGames().filter(x => x.gm != null && x.op != null && inSpan({ season: x.season, date: x.date, era: x.season ? eraOfSeason(x.season) : 'I' }, rs.span));
  const topN = (arr, key, n = 5) => { if (arr.length <= n) return arr; const cut = key(arr[n - 1]); return arr.filter((r, i) => i < n || key(r) === cut); };
  const tg = (t, arr, fmt) => `<div class="card lb"><h3>${t}</h3>${arr.map(r => `<div class="lead"><span>${r.key ? `<a href="#/game/${r.key}">` : ''}${r.date ? fdateShort(r.date) + ' ' + r.date.slice(0, 4) : sLabel(r.season)} ${vsTxt(r.opp)}${r.key ? '</a>' : ''}</span><b>${fmt(r)}</b></div>`).join('') || '<p class="sub">None.</p>'}</div>`;
  let inn = []; D.games.filter(gf).forEach(g => g.ls.gm.forEach((v, i) => v != null && inn.push({ g, v, i: i + 1 }))); inn = inn.sort((a, b) => b.v - a.v).slice(0, 5);
  const isForfeit = r => (r.gm === 7 && r.op === 0) || (r.gm === 0 && r.op === 7);
  el.innerHTML = `<div class="page-h"><h1>Records book</h1><div class="sub">Individual records come from ${D.games.length} transcribed scorebook games. Team records use every known result. <b>Bold</b> = current team member.</div></div>
  <div class="ctl"><select id="rspan" aria-label="Span">${spanOpts(rs.span, { career: 'All-time' })}</select></div>
  <h2>Cycles <small>a single, double, triple and home run in one game</small></h2><div class="card cycles">${cyc.length ? cyc.map(x => `<div class="lead"><span>${TROPHY} ${plink(x.id)} <span class="sub">${gameLine(x.L)}</span></span><span>${gctx(x)} ${vsTxt(x.g.opp)}</span></div>`).join('') : '<p class="sub">None in this span.</p>'}</div>
  <h2>Single game</h2><div class="grid g4">${sgb('Hits', 'H')}${sgb('Home runs', 'HR')}${sgb('RBI†', 'RBI')}${sgb('Runs', 'R')}${sgb('Total bases', 'TB')}${sgb('Extra-base hits', 'XBH')}</div>
  <h2>Single season <small>AVG/OPS need 2.1 PA per team game</small></h2><div class="grid g4">${ssb('Hits', 'H')}${ssb('Home runs', 'HR')}${ssb('RBI†', 'RBI')}${ssb('Runs', 'R')}${ssb('AVG', 'AVG', f3, 1)}${ssb('OPS', 'OPS', f3, 1)}</div>
  <h2>${rs.span === 'career' ? 'Career' : spanName(rs.span)} <small>AVG/OPS need 2.1 PA per team game in the seasons played</small></h2><div class="grid g4">${crb('Games', 'G')}${crb('Hits', 'H')}${crb('Home runs', 'HR')}${crb('RBI†', 'RBI')}${crb('Runs', 'R')}${crb('Total bases', 'TB')}${crb('AVG', 'AVG', f3, 1)}${crb('OPS', 'OPS', f3, 1)}</div>
  <h2>Streaks <small>games in order; games without a season don't count</small></h2><div class="grid g2">
    <div class="card lb"><h3>Longest multi-hit streak</h3>${[...stk].sort((a, b) => b.mhBest - a.mhBest).slice(0, 5).map(x => `<div class="lead"><span>${plink(x.id)} <span class="sub">${x.mhBestStart ? seasonOf(x.mhBestStart) : ''}${x.mhEnd && x.mhEnd.season !== x.mhBestStart?.season ? ' – ' + seasonOf(x.mhEnd) : ''}</span></span><b>${x.mhBest} G</b></div>`).join('')}</div>
    <div class="card lb"><h3>Longest home run streak</h3>${[...stk].sort((a, b) => b.hrBest - a.hrBest).slice(0, 5).map(x => `<div class="lead"><span>${plink(x.id)} <span class="sub">${x.hrBestStart ? seasonOf(x.hrBestStart) : ''}${x.hrEnd && x.hrEnd.season !== x.hrBestStart?.season ? ' – ' + seasonOf(x.hrEnd) : ''}</span></span><b>${x.hrBest} G</b></div>`).join('')}</div></div>
  <h2>Team game records</h2><div class="grid g4">${tg('Most runs scored', topN([...R].sort((a, b) => b.gm - a.gm), r => r.gm), r => r.gm)}${tg('Biggest wins', topN([...R].filter(r => !isForfeit(r)).sort((a, b) => (b.gm - b.op) - (a.gm - a.op)), r => r.gm - r.op), r => `${r.gm}-${r.op}`)}
  ${tg('Fewest runs allowed (wins)', topN([...R].filter(r => r.gm > r.op && !isForfeit(r)).sort((a, b) => a.op - b.op || (b.gm - b.op) - (a.gm - a.op)), r => r.op), r => `${r.gm}-${r.op}`)}
  <div class="card lb"><h3>Most runs in an inning</h3>${inn.map(r => `<div class="lead"><span><a href="#/game/${r.g.key}">${r.g.date ? fdateShort(r.g.date) + ' ' + r.g.date.slice(0, 4) : seasonOf(r.g)} ${vsTxt(r.g.opp)}</a> <span class="sub">${ord(r.i)} inn</span></span><b>${r.v}</b></div>`).join('')}</div></div>
  <h2>Milestones <small>newest first</small></h2><div class="card">${milestoneFeed().filter(e => gf(e.g)).slice(-25).reverse().map(feedRow).join('') || '<p class="sub">None in this span.</p>'}</div>
  <h2>Milestone watch</h2><div class="card">${milestoneWatch(20).map(msRow).join('') || '<p class="sub">No active player within range.</p>'}</div>`;
  $('#rspan').onchange = e => { rs.span = e.target.value; pgRecords(el); };
}

/* HEAD TO HEAD + HISTORIC STANDINGS */
function pgH2H(el) {
  const t = ST.h2h.tab;
  el.innerHTML = `<div class="page-h"><h1>Opponents & standings</h1></div>
  <div class="ctl"><div class="seg" id="htab"><button data-v="opp" class="${t === 'opp' ? 'on' : ''}">Head-to-head</button><button data-v="std" class="${t === 'std' ? 'on' : ''}">Historic standings</button></div></div><div id="hbody"></div>`;
  $('#htab').querySelectorAll('button').forEach(b => b.onclick = () => { ST.h2h.tab = b.dataset.v; pgH2H(el); });
  const body = $('#hbody');
  if (t === 'opp') {
    const m = {}; allGames().filter(r => r.opp !== UNKNOWN_OPP).forEach(r => { const o = m[r.opp] || (m[r.opp] = { opp: r.opp, G: 0, W: 0, L: 0, T: 0, U: 0, RS: 0, RA: 0, PW: 0, PL: 0, last: null }); o.G++; if (!r.res) { o.U++; } else { o[r.res]++; o.RS += r.gm; o.RA += r.op; if (r.po) o[r.res === 'W' ? 'PW' : 'PL']++; } if (!o.last || r.sortk > o.last.sortk) o.last = r; });
    const rows = Object.values(m); const kn = r => r.W + r.L + r.T; const pct = r => kn(r) ? (r.W + r.T / 2) / kn(r) : -1;
    body.innerHTML = `<p class="sub">Every game we know about: league-site results since 2017 plus scorebook games. Games without a known score count under "No result". 7-0 forfeits included.${(() => { const n = allGames().filter(r => r.opp === UNKNOWN_OPP).length; return n ? ` Not listed: ${n} games whose opponent wasn't recorded (they still count in every record).` : ''; })()}</p><div class="tw" id="hh"></div>`;
    table($('#hh'), [{ k: 'o', l: 'Opponent', l0: 1, fz: 1, v: r => r.opp, f: r => `<a href="#/opp/${encodeURIComponent(r.opp)}">${esc(r.opp)}</a>` }, { k: 'G', l: 'G', tip: 'GAll', v: r => r.G, f: r => r.G },
      { k: 'wl', l: 'W-L', v: pct, f: r => `${r.W}-${r.L}${r.T ? '-' + r.T : ''}` }, { k: 'p', l: 'W-L%', v: pct, f: r => kn(r) ? f3(pct(r)) : '—' }, { k: 'u', l: 'No result', v: r => r.U, f: r => r.U || '' },
      { k: 'po', l: 'Playoffs', v: r => r.PW - r.PL, f: r => (r.PW || r.PL) ? `${r.PW}-${r.PL}` : '—' },
      { k: 'rs', l: 'RS/G', v: r => kn(r) ? r.RS / kn(r) : -1, f: r => kn(r) ? f1(r.RS / kn(r)) : '—' }, { k: 'ra', l: 'RA/G', v: r => kn(r) ? r.RA / kn(r) : -1, f: r => kn(r) ? f1(r.RA / kn(r)) : '—', asc: 1 },
      { k: 'l', l: 'Last met', l0: 1, v: r => r.last.sortk, f: r => `${r.last.date ? fdate(r.last.date, r.last.est) : sLabel(r.last.season)} ${r.last.gm != null ? wl(r.last) + ' ' + scoreTxt(r.last) : ''}` }], rows, { sort: 'G', desc: true });
  } else {
    const rows = [...D.seasons].reverse();
    body.innerHTML = `<p class="sub">Our finish each season. Full league tables show on a season's page once they're loaded.</p><div class="tw" id="hs"></div>`;
    table($('#hs'), [{ k: 's', l: 'Season', l0: 1, fz: 1, v: r => sk(r.season), f: r => sLink(r.season) },
      { k: 'st', l: 'Finish', l0: 1, v: r => r.standing || '', f: r => esc(r.standing || '—') + (D.standings[r.season]?.teams ? ' <span class="tag rc">Table</span>' : '') },
      { k: 'wl', l: 'W-L', v: r => r.rec_src ? (r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t) : -1, f: r => r.rec_src ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : `<span class="sub">${esc(r.approx || '—')}</span>` },
      { k: 'po', l: 'Postseason', l0: 1, f: r => esc(r.postseason || '') }, { k: 't', l: 'Titles', l0: 1, f: titleTags }], rows, { sort: 's', desc: true });
  }
}
function pgOpp(el, opp) {
  const sched = D.results.filter(r => r.opponent === opp);
  if (opp === UNKNOWN_OPP || !opp || (!allGames().some(r => r.opp === opp) && !sched.length)) return notFound(el, 'Opponent');
  if (!allGames().some(r => r.opp === opp)) { const nx = sched.filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date))[0]; document.title = 'vs ' + opp + ' · Green Machine'; el.innerHTML = `<div class="page-h"><div class="kick"><a href="#/h2h">Opponents</a></div><h1>vs ${esc(opp)}</h1><div class="sub">No games yet.${nx ? ` First meeting: ${new Date(nx.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${nx.time ? ', ' + fmtTime(nx.time) : ''}.` : ''}</div></div>`; return; }
  document.title = 'vs ' + opp + ' · Green Machine';
  const rs = allGames().filter(r => r.opp === opp);
  const W = rs.filter(r => r.res === 'W').length, L = rs.filter(r => r.res === 'L').length, T = rs.filter(r => r.res === 'T').length, U = rs.filter(r => !r.res).length;
  const X = collect(g => g.opp === opp); const rows = Object.entries(X.players).map(([id, c]) => ({ id, L: line(c) })).filter(r => r.L.PA >= 4);
  const kn = rs.filter(r => r.res && !((r.gm === 7 && r.op === 0) || (r.gm === 0 && r.op === 7)));
  const big = [...kn].sort((a, b) => (b.gm - b.op) - (a.gm - a.op))[0];
  const bestHitter = rows.filter(r => r.L.PA >= 10).sort((a, b) => b.L.OPS - a.L.OPS)[0];
  el.innerHTML = `<div class="page-h"><div class="kick"><a href="#/h2h">Opponents</a></div><h1>vs ${esc(opp)}</h1><div class="sub">${W}-${L}${T ? '-' + T : ''} all-time${U ? ` · ${U} without a known result` : ''} · ${X.games} games with box scores</div></div>
  ${big || bestHitter ? `<div class="grid g2">${big ? `<div class="card"><div class="kick">Biggest win</div>${big.key ? `<a href="#/game/${big.key}">` : ''}${big.date ? fdate(big.date, big.est) : sLabel(big.season)}${big.key ? '</a>' : ''} · <b>${big.gm}-${big.op}</b></div>` : ''}${bestHitter ? `<div class="card"><div class="kick">Our best hitter vs them</div>${plink(bestHitter.id)} · ${f3(bestHitter.L.AVG)}/${f3(bestHitter.L.OBP)}/${f3(bestHitter.L.SLG)} in ${bestHitter.L.PA} PA</div>` : ''}</div>` : ''}
  <h2>Meetings</h2><div class="tw" id="om"></div><h2>Green Machine hitters vs ${esc(opp)} <small>min. 4 PA</small></h2><div class="tw" id="oh"></div>`;
  table($('#om'), [{ k: 'd', l: 'Date', l0: 1, fz: 1, v: r => r.sortk, f: r => r.key ? `<a href="#/game/${r.key}">${fdate(r.date, r.est)}</a>` : fdate(r.date, r.est) }, { k: 's', l: 'Season', l0: 1, v: r => r.sortk, f: r => sLink(r.season) },
    { k: 'r', l: 'Result', v: r => r.op == null ? null : r.gm - r.op, f: r => (r.gm == null ? '<span class="sub">No score</span>' : `${wl(r)} ${scoreTxt(r)}`) + (r.champ ? '<span class="tag lc">Final</span>' : r.po ? '<span class="tag po">PO</span>' : '') }], rs, { sort: 'd', desc: true });
  if (rows.length) table($('#oh'), statCols('std').map(c => ({ ...c, x: 0 })), rows, { sort: 'PA', desc: true }); else $('#oh').innerHTML = '<p class="sub" style="padding:10px">No box scores yet.</p>';
}

/* ROSTER BY YEAR */
function pgRoster(el) {
  const who = ST.roster.who;
  const ss = [...bookSeasons()].reverse();
  const cnt = {}; D.games.forEach(g => { if (!g.season) return; g.bat.forEach(b => { (cnt[b.p] || (cnt[b.p] = {}))[g.season] = (cnt[b.p][g.season] || 0) + 1; }); });
  let ids = Object.keys(cnt); if (who === 'team') ids = ids.filter(isTeam);
  ids.sort((a, b) => Object.keys(cnt[b]).length - Object.keys(cnt[a]).length || Object.values(cnt[b]).reduce((x, y) => x + y, 0) - Object.values(cnt[a]).reduce((x, y) => x + y, 0) || pname(a).localeCompare(pname(b)));
  const years = [...new Set(ss.map(s => s.slice(0, 4)))];
  el.innerHTML = `<div class="page-h"><h1>Roster by season</h1><div class="sub">Who played in each season with box scores, most seasons first. Darker dot = more of that season's games. Tap a season to open it.</div></div>
  <div class="ctl"><div class="seg" id="rwho"><button data-v="team" class="${who === 'team' ? 'on' : ''}">Team members</button><button data-v="all" class="${who === 'all' ? 'on' : ''}">Everyone</button></div></div>
  <div class="tw"><table class="st roster"><thead><tr class="yr"><th class="l fz"></th>${years.map(y => `<th colspan="${ss.filter(s => s.startsWith(y)).length}">${y}</th>`).join('')}<th></th></tr><tr><th class="l fz">Player</th>${ss.map(s => `<th><a href="#/season/${encodeURIComponent(s)}" title="${sLabel(s)}">${{ Spring: 'Sp', Summer: 'Su', Fall: 'F' }[s.split(' ')[1]]}</a></th>`).join('')}<th>Seasons</th></tr></thead>
  <tbody>${ids.map(id => `<tr><td class="l fz">${plink(id)}</td>${ss.map(s => { const n = cnt[id][s] || 0; const mx = D.games.filter(g => g.season === s).length; return `<td>${n ? `<i class="dot" style="--s:${(0.35 + 0.65 * n / mx).toFixed(2)}" title="${esc(pname(id))}: ${n} of ${mx} games, ${sLabel(s)}"></i>` : ''}</td>`; }).join('')}<td>${Object.keys(cnt[id]).length}</td></tr>`).join('')}</tbody></table></div>`;
  $('#rwho').querySelectorAll('button').forEach(b => b.onclick = () => { ST.roster.who = b.dataset.v; pgRoster(el); });
}

/* LINEUP */
function pgLineup(el) {
  const LS = ST.lineup || (ST.lineup = { span: 'era:' + D.config.current_era });
  const GS = D.games.filter(g => inSpan(g, LS.span));
  const slots = {}; GS.forEach(g => g.bat.forEach(b => { const c = slots[b.slot] || (slots[b.slot] = blank()); c.G++; b.pa.forEach(pa => addPA(c, pa)); }));
  const srows = Object.entries(slots).map(([s, c]) => ({ s: +s, L: line(c) })).filter(r => r.L.G >= Math.min(5, GS.length));
  el.innerHTML = `<div class="page-h"><h1>Lineup lab</h1><div class="sub">How we've actually set the batting order, and how each slot has produced.</div></div>
  <div class="ctl"><select id="lspan" aria-label="Span">${spanOpts(LS.span)}</select><span class="sub">${GS.length} games with a scorebook lineup</span></div>
  ${formations(GS)}
  <h2>Production by lineup slot</h2><div class="tw" id="ls"></div>`;
  $('#lspan').onchange = e => { LS.span = e.target.value; pgLineup(el); };
  table($('#ls'), [{ k: 's', l: 'Slot', fz: 1, v: r => r.s, f: r => r.s, asc: 1 }, { k: 'G', l: 'G', v: r => r.L.G, f: r => r.L.G }, { k: 'PA', l: 'PA/G', v: r => r.L.PA / r.L.G, f: r => f1(r.L.PA / r.L.G) },
    { k: 'R', l: 'R/G', v: r => r.L['R/G'], f: r => f1(r.L['R/G']) }, { k: 'RBI', l: 'RBI†/G', tip: 'RBI', v: r => r.L.RBI / r.L.G, f: r => f1(r.L.RBI / r.L.G) },
    ...['AVG', 'OBP', 'SLG', 'OPS'].map(k => ({ k, l: k, rate: 1, v: r => r.L[k], f: r => f3(r.L[k]) })), { k: 'HR', l: 'HR', v: r => r.L.HR, f: r => r.L.HR }], srows, { sort: 's', desc: false });
}
function formations(GS) {
  if (!GS.length) return '<p class="sub">No games in this span.</p>';
  const short = id => { const n = pname(id).split(' '); return esc(n.length > 1 ? n[0] + ' ' + n[n.length - 1][0] + '.' : n[0]); };
  const rec = gs => { const k = gs.filter(g => g.res); const w = k.filter(g => g.res === 'W').length, l = k.filter(g => g.res === 'L').length, t = k.length - w - l; return `${w}-${l}${t ? '-' + t : ''}`; };
  const rpg = gs => f1(gs.reduce((a, g) => a + g.gm, 0) / gs.length);
  const ordr = g => [...g.bat].sort((a, b) => a.slot - b.slot).map(b => b.p);
  const use = {}; let maxSlot = 0;
  GS.forEach(g => ordr(g).forEach((p, i) => { const u = use[p] || (use[p] = { id: p, n: {}, G: 0, sum: 0 }); const s = Math.min(i + 1, 11); u.n[s] = (u.n[s] || 0) + 1; u.G++; u.sum += i + 1; maxSlot = Math.max(maxSlot, s); }));
  const minG = Math.max(2, Math.round(GS.length * 0.1));
  const U = Object.values(use).filter(u => u.G >= minG).sort((a, b) => a.sum / a.G - b.sum / b.G);
  const cols = Array.from({ length: maxSlot }, (_, i) => i + 1);
  const mx = Math.max(...U.flatMap(u => Object.values(u.n)));
  const mode = u => +Object.entries(u.n).sort((a, b) => b[1] - a[1])[0][0];
  const matrix = `<div class="tw"><table class="st lm"><thead><tr><th class="l fz">Player</th><th>G</th><th>Avg</th>${cols.map(c => `<th>${c === 11 ? '11+' : c}</th>`).join('')}</tr></thead><tbody>${U.map(u => `<tr><td class="l fz">${plink(u.id)}${posTag(u.id)}</td><td>${u.G}</td><td>${f1(u.sum / u.G)}</td>${cols.map(c => { const n = u.n[c] || 0; return `<td style="background:${n ? `rgba(47,163,95,${(0.12 + 0.75 * n / mx).toFixed(2)})` : 'transparent'};${n / mx > .55 ? 'color:#fff;font-weight:700' : ''}${c === mode(u) ? ';outline:2px solid var(--forest);outline-offset:-2px' : ''}">${n || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
  <p class="note">Games batting in each slot. Outlined cell = usual slot. Players with at least ${minG} games in this span, ordered by average slot.</p>`;
  const group = (a, b, min = 2) => { const m = {}; GS.forEach(g => { const o = ordr(g); if (o.length < b) return; const k = o.slice(a - 1, b).join('|'); (m[k] || (m[k] = [])).push(g); }); return Object.entries(m).filter(([, gs]) => gs.length >= min).sort((x, y) => y[1].length - x[1].length).slice(0, 5); };
  const top = group(1, 3);
  const who = s => { const m = {}; GS.forEach(g => { const p = ordr(g)[s - 1]; if (p) (m[p] || (m[p] = [])).push(g); }); return Object.entries(m).sort((a, b) => b[1].length - a[1].length).slice(0, 4); };
  const whoCard = (t, s) => `<div class="card lb"><h3>${t}</h3>${who(s).map(([p, gs]) => `<div class="lead"><span>${plink(p)}${posTag(p)}</span><b>${gs.length} G · ${rec(gs)} · ${rpg(gs)} R/G</b></div>`).join('')}</div>`;
  const last = GS[GS.length - 1];
  const lastCard = `<div class="card lb"><h3>Most recent lineup</h3><div class="sub" style="margin-bottom:4px"><a href="#/game/${last.key}">${last.date ? fdate(last.date, last.est) : seasonOf(last)} ${vsTxt(last.opp)}</a> · ${wl(last)} ${scoreTxt(last)}</div>${ordr(last).map((p, i) => `<div class="lead"><span><span class="sub">${i + 1}.</span> ${plink(p)}${posTag(p)}</span></div>`).join('')}</div>`;
  return `<h2>Our usual batting order <small>current team members' most common slot, ${spanName(ST.lineup.span)}</small></h2>
  <div class="card"><ol class="lu" style="padding:0;margin:0">${U.filter(u => isCur(u.id)).sort((a, b) => mode(a) - mode(b) || a.sum / a.G - b.sum / b.G).slice(0, 12).map(u => `<li><span>${plink(u.id)}${posTag(u.id)}</span><small>usually #${mode(u)} · avg ${f1(u.sum / u.G)} · ${u.G} G</small></li>`).join('') || '<li><span class="sub">No current team members in this span.</span></li>'}</ol>
  <p class="note">The order the team has actually used most, not a recommendation.</p></div>
  <h2>Who bats where</h2>${matrix}
  <div class="grid g2" style="margin-top:12px"><div class="card lb"><h3>Most-used top of the order (1-3)</h3>${top.length ? top.map(([k, gs]) => `<div class="lead" style="align-items:flex-start;gap:10px"><span>${k.split('|').map((p, i) => `<span class="sub">${i + 1}.</span> ${short(p)}`).join(' &nbsp;')}</span><b style="white-space:nowrap">${gs.length} G · ${rec(gs)}</b></div>`).join('') : '<p class="sub">No repeat grouping yet.</p>'}</div>${lastCard}</div>
  <div class="grid g2" style="margin-top:10px">${whoCard('Leadoff hitters', 1)}${whoCard('Cleanup hitters', 4)}</div>`;
}

/* MORE / GLOSSARY */
function pgMore(el) {
  const it = [['games', 'Games', 'Every box score and result'], ['seasons', 'Seasons', 'Season pages: record, awards, playoff run, results'], ['h2h', 'Opponents & standings', 'Head-to-head records and our finish every season'], ['roster', 'Roster by season', 'Who played when'], ['lineup', 'Lineup lab', 'Batting-order history and production by slot'], ['glossary', 'Glossary & data notes', 'How the stats are built']];
  el.innerHTML = `<div class="page-h"><h1>More</h1></div><div class="card more" style="padding:0">${it.map(([k, t, s]) => `<a class="mi" href="#/${k}"><span>${t}<small>${s}</small></span>›</a>`).join('')}</div>`;
}
function pgGlossary(el) {
  const G = [['PA', DEF.PA + ' A pinch runner (tiebreak runner) is not a PA.'], ['AB', DEF.AB], ['AVG / OBP / SLG / OPS', 'Standard definitions. Reached on error and fielder\'s choice count as outs.'], ['wOBA', DEF.wOBA], ['wOBA+', DEF['wOBA+']], ['ISO', DEF.ISO], ['Out%', DEF['Out%']],
    ['RBI†', DEF.RBI], ['Qualified', DEF.Q + ' Percentile rankings use the same rule.'], ['Percentile rankings', 'A season is ranked against every qualified player-season; a year against player-years; an era against player-eras; a career against qualified careers.'],
    ['Where outs go', 'Built from scorebook notation: F = fly ball, L = line drive, P = pop-up, and 6-3 or 4U = a ground ball fielded by that position. Outfield numbering: 7 LF, 8 LCF, 9 RCF, 10 RF.'],
    ['Team member', 'Set by the manager. Bold names are current team members. (R) = a retired team member: inactive since before 2024, or retired by the manager.'], ['Sub', 'Everyone else. Anyone with fewer than 10 games who hasn\'t played in the last 2 years is a sub.'],
    ['Eras', D.config.eras.map(e => `${e.name}: ${e.label}`).join('. ') + '. The Stats page starts with players from every era; tap an era to hide or show its players.'],
    ['Season awards', 'MVP = best wOBA among qualified hitters. Batting Crown = best qualified AVG. Slugger, RBI Crown and Run Crown = most HR (min. 2), RBI and runs. Playoff MVP = best postseason wOBA (min. 5 PA, 2+ playoff box scores). Seasons with at least 4 box scores.'],
    ['Cycle', 'A single, double, triple and home run by one player in one game.'], ['Streaks', 'Multi-hit streak = consecutive games played with 2+ hits. HR streak = consecutive games played with a home run. Only games whose season is known count.'],
    ['Result unknown', 'Games where the opponent\'s score wasn\'t recorded count fully in batting stats but not in any win-loss record.'],
    ['League champions', 'Won the season-ending league tournament.'], ['Regular-season champions', 'Finished first (or tied) in the regular-season standings.']];
  el.innerHTML = `<div class="page-h"><h1>Glossary & data notes</h1></div><div class="card">${G.map(([a, b]) => `<div class="lead" style="display:block"><b>${esc(a)}</b><div class="sub">${esc(b)}</div></div>`).join('')}</div>
  <h2>Data</h2><div class="card note">Individual stats come from ${D.games.length} transcribed scorebook games (${sLabel(D.games[0].season)} onward); the scorebooks are the games the scorekeeper attended. When the scorebook and the league site disagree, the scorebook wins. Undated games are placed in a season only when the lineup makes the season clear. Updated ${esc(D.built)}.</div>`;
}

/* SHARE CARD */
async function shareCard(key) {
  const g = D.gByKey.get(key); const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const x = cv.getContext('2d');
  try { await Promise.all(['700 80px Barlow', '600 40px Barlow', '500 36px Inter', '700 36px Inter'].map(f => document.fonts.load(f))); } catch (e) { }
  const logo = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = 'assets/logo.png'; });
  const gr = x.createLinearGradient(0, 0, 0, 1350); gr.addColorStop(0, '#0F2A1A'); gr.addColorStop(1, '#16402a'); x.fillStyle = gr; x.fillRect(0, 0, 1080, 1350);
  x.fillStyle = g.champ ? '#C9A24A' : '#2FA35F'; x.fillRect(0, 0, 1080, 12);
  if (logo) { const w = 860, h = logo.height * w / logo.width; x.drawImage(logo, 110, 70, w, h); }
  x.textAlign = 'center'; x.fillStyle = '#C9A24A'; x.font = '600 40px Barlow'; x.fillText(`${g.champ ? 'CHAMPIONSHIP' : 'FINAL'}${g.po && !g.champ ? ' · PLAYOFFS' : ''}  ·  ${(g.date ? fdate(g.date) : sLabel(g.season)).toUpperCase()}`, 540, 400);
  const r = res(g);
  const row = (t, rr, y, win) => { x.textAlign = 'left'; x.fillStyle = win ? '#fff' : '#9fb8a6'; x.font = '700 76px Barlow'; x.fillText(t.toUpperCase().slice(0, 22), 90, y); x.textAlign = 'right'; x.font = '700 120px Barlow'; x.fillText(rr, 990, y + 10); };
  row('Green Machine', g.gm, 540, r !== 'L'); row(g.opp, g.op ?? '?', 680, r === 'L');
  x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(90, 740, 900, 2);
  x.textAlign = 'left'; x.fillStyle = '#C9A24A'; x.font = '600 38px Barlow'; x.fillText('TOP PERFORMERS', 90, 810);
  topPerf(g).forEach((t, i) => { const y = 880 + i * 108; x.fillStyle = '#fff'; x.font = '700 44px Inter'; x.fillText(pname(t.b.p) + (isCycle(t.b) ? '  (CYCLE)' : ''), 90, y); x.fillStyle = '#cfe3d4'; x.font = '500 34px Inter'; x.fillText(gameLine(t.L), 90, y + 44); });
  const ms = milestoneFeed().filter(e => e.g === g); if (ms.length) { x.fillStyle = '#2FA35F'; x.font = '700 32px Inter'; x.fillText(`MILESTONE: ${pname(ms[0].id)} reached ${ms[0].m} career ${MSLAB[ms[0].k]}`, 90, 1210); }
  x.textAlign = 'center'; x.fillStyle = '#9fb8a6'; x.font = '500 28px Inter'; x.fillText(`${sLabel(g.season)} · ${D.history.league}`, 540, 1290);
  const url = cv.toDataURL('image/png');
  const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Share card'); m.innerHTML = `<div class="in"><img src="${url}" alt="Share card for this game"><p class="note" style="margin:6px 0 0">Long-press (phone) or right-click (computer) the image to save it.</p><div class="acts"><button class="btn ghost" id="mx">Close</button>${navigator.canShare ? '<button class="btn" id="msh">Share</button>' : ''}</div></div>`;
  document.body.appendChild(m); m.onclick = e => { if (e.target === m) m.remove(); }; $('#mx').onclick = () => m.remove(); $('#mx').focus();
  const sb = $('#msh'); if (sb) sb.onclick = async () => { const b = await (await fetch(url)).blob(); const f = new File([b], `GM_${g.key}.png`, { type: 'image/png' }); if (navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'Green Machine' }); };
}

/* ---------- notation tooltips + legend ---------- */
const POSN = { P: 'Pitcher', C: 'Catcher', '1B': 'First base', '2B': 'Second base', '3B': 'Third base', SS: 'Shortstop', LF: 'Left field', LCF: 'Left-center field', CF: 'Center field', RCF: 'Right-center field', RF: 'Right field', UT: 'Utility (plays several positions)' };
function decorate(root) {
  const set = (sel, fn) => root.querySelectorAll(sel).forEach(e => { if (!e.dataset.tip) { const t = fn(e); if (t) e.dataset.tip = t; } });
  set('.tag.pos', e => 'Usual position: ' + (POSN[e.textContent.trim()] || e.textContent.trim()));
  set('.tag.est', e => /progress/i.test(e.textContent) ? 'Season still being played' : 'Estimated: the scorebook page has no season written, so it was placed from the lineup');
  set('.tag.po', () => 'Playoff game');
  set('.tag.lc', e => /final/i.test(e.textContent) ? 'Championship game' : 'Won the season-ending league tournament');
  set('.tag.rc', () => 'Finished first (or tied) in the regular-season standings');
  set('.tag.reg', () => 'Current team member'); set('.tag.fr', e => /retired/i.test(e.textContent) ? 'Retired team member' : 'Team member'); set('.tag.sub', () => 'Substitute player');
  set('.ret', () => 'Retired team member');
  set('.wl.W', () => 'Win'); set('.wl.L', () => 'Loss'); set('.wl.T', () => 'Tie');
  set('.wl.U', () => "Result unknown: the opponent's score was not recorded");
  set('.cyc', () => 'Hit for the cycle: a single, double, triple and home run in one game');
  set('.trophy', () => 'Championship');
  set('.chip.r', () => 'Scored a run (gold outline)');
}
const LEGEND = [['<b>Bold name</b>', 'Current team member'], ['(R)', 'Retired team member'],
  ['<span class="tag pos">UT</span>', 'Usual position (P, C, 1B, 2B, 3B, SS, LF, LCF, RCF, RF; UT = utility)'], ['<span class="tag est">est.</span>', 'Season estimated from the lineup (not written in the scorebook)'],
  ['Mar 3, 2025*', 'Date estimated from scorebook order'], ['<span class="wl W">W</span> <span class="wl L">L</span> <span class="wl T">T</span> <span class="wl U">?</span>', "Win, loss, tie; ? = opponent's score not recorded (result unknown)"],
  ['<span class="tag po">PO</span>', 'Playoff game'], ['<span class="tag lc">Final</span>', 'Championship game'], ['<span class="tag lc">League champs</span>', 'Won the league tournament'],
  ['<span class="tag rc">Reg. season champs</span>', 'Finished first in the regular season'], ['<span class="cyc">Cycle</span>', 'Single, double, triple and home run in one game'],
  ['RBI†', 'RBI are mostly reconstructed from base-running'], ['<span class="sub">.512</span>', 'Grey rate stat = below the 2.1 PA per team game qualifier'], ['<span class="ldx">.745</span>', 'Highlighted = leader among qualified team members'],
  ['<span class="chip h r">1B</span>', 'Gold outline on a plate appearance = scored']];
const legendHTML = () => `<details class="legend" open><summary>Legend: what the marks mean</summary><div class="lg">${LEGEND.map(([a, b]) => `<div><span class="lk">${a}</span><span>${b}</span></div>`).join('')}</div><p class="note">Hover over (or press and hold) any column name or badge for its meaning. Full definitions: <a href="#/glossary">Glossary</a>.</p></details>`;

/* ---------- tooltips ---------- */
function tipInit() {
  const tip = document.createElement('div'); tip.id = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
  let timer = null;
  const show = el => { tip.textContent = el.dataset.tip; tip.style.display = 'block'; const r = el.getBoundingClientRect(); const w = tip.offsetWidth; let left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)); tip.style.left = left + 'px'; tip.style.top = (r.bottom + 6 + window.scrollY) + 'px'; };
  const hide = () => { tip.style.display = 'none'; };
  document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el) show(el); else hide(); });
  document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) show(el); });
  document.addEventListener('focusout', hide);
  document.addEventListener('touchstart', e => { const el = e.target.closest('[data-tip]'); clearTimeout(timer); if (el) { show(el); timer = setTimeout(hide, 3500); } else hide(); }, { passive: true });
  window.addEventListener('scroll', hide, { passive: true });
}

/* ---------- theme ---------- */
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>', MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
function theme() { return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
function themeBtn() { const b = $('#thm'); if (!b) return; const t = theme(); b.innerHTML = t === 'dark' ? SUN : MOON; b.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'; b.setAttribute('aria-label', b.title); }
function toggleTheme() { const t = theme() === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('gmTheme', t); } catch (e) { } themeBtn(); }

/* ---------- router ---------- */
function route() {
  const el = $('#app'); let r = location.hash.replace(/^#\/?/, ''); let [p, ...rest] = r.split('/'); p = p.toLowerCase();
  let arg = null; try { arg = decodeURIComponent(rest.join('/')).replace(/\/+$/, ''); } catch (e) { arg = null; }
  navDraw(r);
  const TITLES = { '': 'Green Machine: Archive', stats: 'Stats', players: 'Players', games: 'Games', seasons: 'Seasons', history: 'History', records: 'Records', h2h: 'Opponents', lineup: 'Lineup lab', more: 'More', glossary: 'Glossary', roster: 'Roster by season' };
  const map = { '': pgHome, stats: pgStats, players: pgPlayers, games: pgGames, seasons: pgSeasons, history: pgHistory, records: pgRecords, h2h: pgH2H, lineup: pgLineup, more: pgMore, glossary: pgGlossary, roster: pgRoster };
  const detail = { player: pgPlayer, game: pgGame, opp: pgOpp, season: pgSeason };
  document.title = own(TITLES, p) && p ? TITLES[p] + ' · Green Machine: Archive' : 'Green Machine: Archive';
  try {
    if (own(detail, p)) { if (arg == null || arg === '' || arg.length > 200) notFound(el, { player: 'Player', game: 'Game', opp: 'Opponent', season: 'Season' }[p]); else detail[p](el, arg); }
    else if (own(map, p) && !rest.join('')) map[p](el);
    else notFound(el, 'Page');
  } catch (e) { el.innerHTML = `<div class="warn">Something went wrong rendering this page: ${esc(e.message)}</div>`; console.error(e); }
  el.insertAdjacentHTML('beforeend', legendHTML() + `<div class="foot">Green Machine · Est. 2011 · Stats through ${fdate(D.through)} · <a href="#/glossary">Data notes</a></div>`);
  window.scrollTo(0, 0);
}
function prep(b) {
  D = b; WT = D.config.woba_weights;
  D.gByKey = new Map(D.games.map(g => [g.key, g]));
  const now = new Date(); D.today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // local date, so a Monday-night game stays 'today' until midnight
  const t = new Date(D.through); t.setFullYear(t.getFullYear() - 3); D.last3 = t.toISOString().slice(0, 10);
  D.cancelled = ['2020 Spring'];
  D.playerEras = {}; D.games.forEach(g => g.bat.forEach(b => (D.playerEras[b.p] || (D.playerEras[b.p] = new Set())).add(g.era)));
  D.config.current_era = D.config.current_era || D.config.eras[D.config.eras.length - 1].id;
}
themeBtn(); tipInit();
new MutationObserver(() => decorate($('#app'))).observe(document.getElementById('app'), { childList: true, subtree: true });
fetch('data/bundle.json', { cache: 'no-cache' }).then(r => r.json()).then(b => { prep(b); $('#upd').innerHTML = `Through<br>${fdate(D.through)}`; window.addEventListener('hashchange', route); route(); })
  .catch(e => { $('#app').innerHTML = `<div class="warn">Could not load stats: ${esc(e.message)}</div>`; });
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|claudeusercontent/.test(location.hostname)) { navigator.serviceWorker.register('sw.js').catch(() => { }); }
