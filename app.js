'use strict';
(function () {
  /* ---------- utilidades ---------- */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const num = (v) => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const eur0 = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
  const pc = (n, d = 2) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0) + ' %';
  const sg = (n) => (n < 0 ? '−' : '+') + eur(Math.abs(n));
  const sp = (n, d = 2) => (n < 0 ? '−' : '+') + pc(Math.abs(n), d);
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => iso(new Date());
  const fdate = (s) => { if (!s) return 'Histórico'; const p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const deb = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const COLORS = ['var(--accent)', 'var(--c2)', 'var(--c3)', 'var(--neg)', 'var(--muted)'];

  /* ---------- estado ---------- */
  const DEF_P = { contrib: 10, anos: 10, peso: null, xe: 2, pess: 0, base: 5, opt: 8, shock: -20 };
  const emptyS = () => ({ holdings: [], snaps: [], aportes: [], notes: [], budget: [], goals: [], cfg: { p: { ...DEF_P }, rendimento: 0, checks: {} } });
  let S = emptyS();
  let user = null;
  let loadedFor = null;
  let offline = false;
  let lastSync = null;
  let installEvt = null;

  const CFG = window.CADERNETA_CONFIG;
  const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  /* ---------- feedback ---------- */
  let toastT;
  function toast(msg, bad) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 3200);
  }
  function setSync(kind, text) { const s = $('#sync'); s.className = 'sync ' + kind; $('#sync-t').textContent = text; }
  function banner(msg) { const b = $('#banner'); if (msg) { b.textContent = msg; b.hidden = false; } else b.hidden = true; }

  /* ---------- cache local (só leitura offline) ---------- */
  const cacheKey = () => 'cad.cache.v1.' + (user ? user.id : '');
  function persist() { try { localStorage.setItem(cacheKey(), JSON.stringify(S)); } catch (e) { /* ignora */ } }
  function readCache() { try { const r = localStorage.getItem(cacheKey()); return r ? JSON.parse(r) : null; } catch (e) { return null; } }

  /* ---------- base de dados ---------- */
  const nH = (r) => ({ id: r.id, ticker: r.ticker, nome: r.nome, classe: r.classe, valor: +r.valor, ganho: +r.ganho, alvo: +r.alvo_pct, ordem: r.ordem });
  const dbH = (h) => ({ id: h.id, user_id: user.id, ticker: h.ticker, nome: h.nome, classe: h.classe, valor: h.valor, ganho: h.ganho, alvo_pct: h.alvo, ordem: h.ordem, updated_at: new Date().toISOString() });
  const mergeCfg = (d) => { d = d || {}; return { p: { ...DEF_P, ...(d.p || {}) }, rendimento: +d.rendimento || 0, checks: d.checks || {} }; };

  async function w(promise, okMsg) {
    if (offline || !navigator.onLine) { toast('Sem ligação. A alteração não foi guardada.', true); return false; }
    try {
      const { error } = await promise;
      if (error) throw error;
      persist(); lastSync = new Date(); setSync('ok', 'Guardado'); if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      toast('Não foi possível guardar: ' + (e.message || e), true); setSync('err', 'Erro');
      return false;
    }
  }

  async function refresh() {
    try {
      const r = await Promise.all([
        sb.from('cf_holdings').select('*').order('ordem'),
        sb.from('cf_snapshots').select('*').order('data'),
        sb.from('cf_aportes').select('*').order('data'),
        sb.from('cf_notes').select('*').order('created_at', { ascending: false }),
        sb.from('cf_budget').select('*').order('nome'),
        sb.from('cf_goals').select('*').order('nome'),
        sb.from('cf_settings').select('data').maybeSingle()
      ]);
      r.forEach((x) => { if (x.error) throw x.error; });
      S.holdings = r[0].data.map(nH);
      S.snaps = r[1].data.map((x) => ({ id: x.id, data: x.data, valor: +x.valor, depositado: +x.depositado }));
      S.aportes = r[2].data.map((x) => ({ id: x.id, data: x.data, valor: +x.valor, ticker: x.ticker, nota: x.nota }));
      S.notes = r[3].data.map((x) => ({ id: x.id, tipo: x.tipo, data: x.data, texto: x.texto }));
      S.budget = r[4].data.map((x) => ({ id: x.id, tipo: x.tipo, nome: x.nome, valor: +x.valor }));
      S.goals = r[5].data.map((x) => ({ id: x.id, nome: x.nome, alvo: +x.alvo, prazo: x.prazo, base: x.base }));
      S.cfg = mergeCfg(r[6].data && r[6].data.data);
      offline = false; lastSync = new Date(); persist(); banner(''); setSync('ok', 'Sincronizado');
    } catch (e) {
      const msg = String((e && e.message) || e);
      if ((e && e.code === 'PGRST205') || /schema cache|does not exist|relation/i.test(msg)) {
        banner('A base de dados ainda não tem as tabelas da Caderneta. Corre o ficheiro supabase/schema.sql no SQL Editor do Supabase e abre a app outra vez.');
        setSync('err', 'Sem tabelas');
      } else {
        const c = readCache();
        offline = true; setSync('off', 'Offline');
        if (c) { S = { ...emptyS(), ...c }; banner('Sem ligação: a mostrar a última cópia guardada neste telemóvel. Só podes consultar.'); }
        else banner('Não consegui ligar à base de dados. Verifica a internet e tenta outra vez.');
      }
    }
    renderAll();
  }

  /* ---------- cálculos ---------- */
  function totals() {
    const hs = S.holdings;
    const tot = hs.reduce((a, h) => a + h.valor, 0);
    const gan = hs.reduce((a, h) => a + h.ganho, 0);
    const inv = hs.filter((h) => h.classe !== 'caixa');
    const base = inv.reduce((a, h) => a + h.valor, 0);
    const custo = tot - gan;
    return { tot, gan, custo, ret: custo > 0 ? gan / custo * 100 : 0, base, inv };
  }
  function pesoAlvoAcoes() {
    const inv = S.holdings.filter((h) => h.classe !== 'caixa');
    const sa = inv.reduce((a, h) => a + h.alvo, 0);
    if (sa > 0) return inv.filter((h) => h.classe === 'acoes').reduce((a, h) => a + h.alvo, 0) / sa * 100;
    const b = inv.reduce((a, h) => a + h.valor, 0);
    return b > 0 ? inv.filter((h) => h.classe === 'acoes').reduce((a, h) => a + h.valor, 0) / b * 100 : 70;
  }
  const poupTotal = () => S.budget.filter((b) => b.tipo === 'poupanca').reduce((a, b) => a + b.valor, 0);
  const despTotal = () => S.budget.filter((b) => b.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);

  function rebalance(inv, D) {
    const base = inv.reduce((a, h) => a + h.valor, 0);
    const alvos = inv.filter((h) => h.alvo > 0);
    const sa = alvos.reduce((a, h) => a + h.alvo, 0);
    if (!alvos.length || sa <= 0) return [];
    const t = base + D;
    const need = alvos.map((h) => ({ h, n: Math.max(0, h.alvo / sa * t - h.valor) }));
    const s = need.reduce((a, x) => a + x.n, 0);
    if (s > D && s > 0) need.forEach((x) => { x.n = x.n * D / s; });
    else { const ex = D - s; need.forEach((x) => { x.n += ex * x.h.alvo / sa; }); }
    return need;
  }

  function project(v0, c, years, rate, firstRate) {
    const out = [v0]; let v = v0;
    for (let m = 1; m <= years * 12; m++) {
      const r = (firstRate != null && m <= 12) ? firstRate : rate;
      v = v * Math.pow(1 + r, 1 / 12) + c; out.push(v);
    }
    return out;
  }
  function etaMonths(v0, target, c, rate) {
    if (v0 >= target) return 0;
    let v = v0; const rm = Math.pow(1 + rate, 1 / 12) - 1;
    for (let m = 1; m <= 600; m++) { v = v * (1 + rm) + c; if (v >= target) return m; }
    return null;
  }
  const fmtMonths = (m) => { const y = Math.floor(m / 12), r = m % 12; return (y ? y + (y === 1 ? ' ano' : ' anos') : '') + (y && r ? ' e ' : '') + (r || !y ? r + (r === 1 ? ' mês' : ' meses') : ''); };
  function niceMax(x) { const e = Math.pow(10, Math.floor(Math.log10(x || 1))); const f = x / e; const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10; return n * e; }

  /* ---------- gráficos ---------- */
  function lineChart(o) {
    const W = 640, H = 280, L = 62, R = 14, T = 12, B = 26;
    const ys = o.series.flatMap((s) => s.pts.map((p) => p[1]));
    let lo = o.ymin === null ? Math.min(...ys) : o.ymin, hi = Math.max(...ys);
    if (o.ymin === null) { const pad = (hi - lo) * 0.25 || Math.max(1, hi * 0.02); lo = Math.max(0, lo - pad); hi += pad; } else hi = niceMax(hi);
    const X = (x) => L + (o.xmax ? x / o.xmax : 0) * (W - L - R);
    const Y = (v) => T + (1 - (v - lo) / ((hi - lo) || 1)) * (H - T - B);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y + 3.5) + '" text-anchor="end">' + esc(o.yfmt(v)) + '</text>'; }
    o.xticks.forEach((t, i) => { const a = i === 0 ? 'start' : i === o.xticks.length - 1 ? 'end' : 'middle'; g += '<text class="ax" x="' + X(t.x) + '" y="' + (H - 8) + '" text-anchor="' + a + '">' + esc(t.label) + '</text>'; });
    let ln = '';
    o.series.forEach((s) => {
      const pts = s.pts.map((p) => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ');
      ln += '<polyline fill="none" stroke="' + s.c + '" stroke-width="' + (s.w || 2.2) + '"' + (s.dash ? ' stroke-dasharray="5 4"' : '') + ' stroke-linejoin="round" points="' + pts + '"/>';
      if (s.main && s.pts.length) { const p = s.pts[s.pts.length - 1]; ln += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>'; }
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label) + '">' + g + ln + '</svg>';
  }
  function barsChart(items, meta) {
    const W = 640, H = 220, L = 52, R = 10, T = 16, B = 28;
    const n = items.length; if (!n) return '';
    const ymax = niceMax(Math.max(meta || 0, ...items.map((i) => i.v), 1));
    const Y = (v) => T + (1 - v / ymax) * (H - T - B);
    const slot = (W - L - R) / n, bw = Math.min(46, slot * 0.6);
    let g = '';
    for (let i = 0; i <= 3; i++) { const v = ymax * i / 3, y = Y(v); g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y + 3.5) + '" text-anchor="end">' + esc(eur0(v)) + '</text>'; }
    let b = '';
    items.forEach((it, i) => {
      const x = L + i * slot + (slot - bw) / 2, y = Y(it.v);
      b += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(0, H - B - y) + '" rx="4" fill="' + (it.v > 0 ? 'var(--accent)' : 'var(--line)') + '"/>';
      b += '<text class="ax" x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(it.label) + '</text>';
      if (n <= 8 && it.v > 0) b += '<text class="ax" x="' + (x + bw / 2) + '" y="' + (y - 4) + '" text-anchor="middle">' + esc(eur0(it.v)) + '</text>';
    });
    if (meta > 0) b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(meta) + '" y2="' + Y(meta) + '" stroke="var(--c2)" stroke-width="1.5" stroke-dasharray="5 4"/>';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Aportes por mês">' + g + b + '</svg>';
  }

  /* ---------- CARTEIRA ---------- */
  function rCart() {
    const t = totals();
    $('#seedbox').hidden = !(S.holdings.length === 0 && S.snaps.length === 0 && S.notes.length === 0) || offline;
    $('#total').textContent = eur(t.tot);
    $('#ganho').innerHTML = S.holdings.length ? '<span class="' + (t.gan >= 0 ? 'pos' : 'neg') + '">' + sg(t.gan) + ' · ' + sp(t.ret) + '</span> <span class="muted">desde o início</span>' : '';
    $('#bar').innerHTML = t.inv.map((h, i) => '<i style="width:' + (t.base > 0 ? h.valor / t.base * 100 : 0) + '%;background:' + COLORS[i % COLORS.length] + '"></i>').join('');
    $('#bar-note').textContent = t.inv.length ? 'Alvo: ' + t.inv.filter((h) => h.alvo > 0).map((h) => h.ticker + ' ' + pc(h.alvo, 0)).join(' · ') : '';
    const rows = t.inv.map((h, i) => {
      const wgt = t.base > 0 ? h.valor / t.base * 100 : 0, d = wgt - h.alvo;
      return '<tr><td><span class="dot" style="background:' + COLORS[i % COLORS.length] + '"></span>' + esc(h.ticker) + '</td><td>' + eur(h.valor) + '</td><td>' + pc(wgt) + ' / ' + pc(h.alvo, 0) + '</td><td class="' + (Math.abs(d) < 1 ? 'muted' : d > 0 ? 'pos' : 'neg') + '">' + (d < 0 ? '−' : '+') + pc(Math.abs(d)) + '</td></tr>';
    }).join('');
    const cx = S.holdings.filter((h) => h.classe === 'caixa').reduce((a, h) => a + h.valor, 0);
    $('#alloc').innerHTML = rows + (cx ? '<tr><td class="muted">Caixa</td><td>' + eur(cx) + '</td><td></td><td></td></tr>' : '');
    // alertas
    const sa = t.inv.reduce((a, h) => a + h.alvo, 0), msgs = [];
    if (t.inv.length && Math.abs(sa - 100) > 0.01) msgs.push('Os alvos somam ' + pc(sa) + '. Ajusta para 100 %.');
    t.inv.filter((h) => h.alvo > 0).forEach((h) => {
      const d = (t.base > 0 ? h.valor / t.base * 100 : 0) - h.alvo;
      if (Math.abs(d) > 5) msgs.push(h.ticker + ' está ' + pc(Math.abs(d), 1) + (d < 0 ? ' abaixo' : ' acima') + ' do alvo.' + (d < 0 ? ' Reforça-o no próximo aporte, sem vender nada.' : ''));
    });
    $('#drift').hidden = !msgs.length; $('#drift').innerHTML = msgs.map(esc).join('<br>');
    // rebalance
    const D = Math.max(0, num($('#dep').value));
    if (D > 0 && t.inv.length) {
      const need = rebalance(t.inv, D);
      $('#rebal').innerHTML = need.length ? need.map((x) => '<div class="split"><span>Comprar ' + esc(x.h.ticker) + '</span><b class="num">' + eur(x.n) + '</b></div>').join('') +
        '<p class="small muted" style="margin-top:8px">Com o AutoInvest a repartir pelos pesos da pie, o desvio corrige-se sozinho ao longo dos meses.</p>' : '<p class="small muted">Define os alvos das posições para ver a divisão.</p>';
    } else $('#rebal').innerHTML = '<p class="small muted">Escreve um valor para ver a divisão.</p>';
  }
  function rHoldEdit() {
    $('#hold-edit').innerHTML = S.holdings.length ? S.holdings.map((h) =>
      '<div class="hold" data-id="' + esc(h.id) + '"><div class="hd"><span>' + esc(h.ticker) + ' <small class="muted">' + esc(h.nome) + '</small></span><button class="x" data-del-h aria-label="Remover ' + esc(h.ticker) + '">×</button></div>' +
      '<label>Valor (€)<input data-f="valor" inputmode="decimal" value="' + String(h.valor).replace('.', ',') + '"></label>' +
      '<label>Ganho (€)<input data-f="ganho" inputmode="decimal" value="' + String(h.ganho).replace('.', ',') + '"></label>' +
      '<label>Alvo (%)<input data-f="alvo" inputmode="decimal" value="' + String(h.alvo).replace('.', ',') + '"></label></div>').join('') : '<p class="small muted">Sem posições.</p>';
  }
  const saveHold = {};
  function queueHold(h) {
    if (!saveHold[h.id]) saveHold[h.id] = deb(async () => { await w(sb.from('cf_holdings').upsert(dbH(S.holdings.find((x) => x.id === h.id)))); }, 700);
    saveHold[h.id]();
  }
  async function snapToday() {
    const t = totals(); if (!S.holdings.length) return;
    const row = { user_id: user.id, data: today(), valor: +t.tot.toFixed(2), depositado: +t.custo.toFixed(2) };
    const ok = await w(sb.from('cf_snapshots').upsert(row, { onConflict: 'user_id,data' }), 'Registo de hoje guardado');
    if (ok) { await loadSnaps(); renderAll(); }
  }
  async function loadSnaps() {
    const r = await sb.from('cf_snapshots').select('*').order('data');
    if (!r.error) { S.snaps = r.data.map((x) => ({ id: x.id, data: x.data, valor: +x.valor, depositado: +x.depositado })); persist(); }
  }

  /* ---------- sincronizar com a Trading 212 (só leitura, via Edge Function) ---------- */
  async function syncT212() {
    if (!needOnline()) return;
    const btn = $('#t212-sync'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'A ler a Trading 212…';
    try {
      const { data, error } = await sb.functions.invoke('t212-sync', { method: 'POST', body: {} });
      if (error) {
        let m = error.message;
        try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) { /* ignora */ }
        throw new Error(m);
      }
      if (!data || !data.ok || !Array.isArray(data.instrumentos)) throw new Error('Resposta inesperada da função.');

      const cash = +data.cash || 0;
      const linhas = data.instrumentos.map((p) => p.ticker + ': ' + eur(p.valor) + ' (' + sg(p.ganho) + ')');
      if (cash) linhas.push('Caixa: ' + eur(cash));
      if (!confirm('Trading 212' + (data.nome ? ' · ' + data.nome : '') + '\n' + linhas.join('\n') + '\nTotal: ' + eur(data.total) + '\n\nAtualizar valores e ganhos na Caderneta? Alvos e nomes ficam como estão.')) return;

      const ups = [], novas = [], semPie = [];
      data.instrumentos.forEach((p) => {
        const h = S.holdings.find((x) => x.classe !== 'caixa' && x.ticker.toUpperCase() === p.ticker);
        if (h) ups.push({ ...h, valor: p.valor, ganho: p.ganho });
        else novas.push({ id: uuid(), ticker: p.ticker, nome: p.ticker, classe: 'acoes', valor: p.valor, ganho: p.ganho, alvo: 0, ordem: S.holdings.length + novas.length + 1 });
      });
      S.holdings.filter((h) => h.classe !== 'caixa' && !data.instrumentos.some((p) => p.ticker === h.ticker.toUpperCase())).forEach((h) => semPie.push(h.ticker));
      const cx = S.holdings.find((x) => x.classe === 'caixa');
      if (cx) ups.push({ ...cx, valor: cash, ganho: 0 });
      else if (cash > 0) novas.push({ id: uuid(), ticker: 'CAIXA', nome: 'Caixa', classe: 'caixa', valor: cash, ganho: 0, alvo: 0, ordem: S.holdings.length + novas.length + 1 });

      const rows = ups.concat(novas).map(dbH);
      if (!rows.length) { toast('A pie não devolveu posições.', true); return; }
      if (await w(sb.from('cf_holdings').upsert(rows))) {
        S.holdings = S.holdings.map((h) => ups.find((u) => u.id === h.id) || h).concat(novas).sort((a, b) => a.ordem - b.ordem);
        persist(); rHoldEdit(); recompute();
        let msg = 'Posições atualizadas. Toca em "Guardar registo de hoje" para fixar o mês.';
        if (novas.some((n) => n.classe !== 'caixa')) msg += ' Há posições novas: define o alvo em Editar posições.';
        if (semPie.length) msg += ' ' + semPie.join(', ') + ' não vem na pie e ficou como estava.';
        toast(msg);
      }
    } catch (e) {
      toast('Não foi possível sincronizar: ' + (e.message || e), true);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  }

  /* ---------- PROJEÇÃO ---------- */
  const saveCfg = deb(async () => { await w(sb.from('cf_settings').upsert({ user_id: user.id, data: S.cfg, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })); }, 700);
  function rProj() {
    const p = S.cfg.p, t = totals(), v0 = t.tot;
    const years = Math.min(40, Math.max(1, Math.round(p.anos) || 1));
    const wgt = Math.min(100, Math.max(0, p.peso == null ? pesoAlvoAcoes() : p.peso)) / 100, xe = p.xe / 100;
    const rate = (e) => wgt * e / 100 + (1 - wgt) * xe;
    const c = Math.max(0, p.contrib);
    const sP = project(v0, c, years, rate(p.pess)), sB = project(v0, c, years, rate(p.base)), sO = project(v0, c, years, rate(p.opt));
    const sS = project(v0, c, years, rate(p.base), wgt * p.shock / 100 + (1 - wgt) * xe);
    const dep = sB.map((_, m) => v0 + c * m);
    const pts = (a) => a.map((v, m) => [m, v]);
    const step = years <= 10 ? 1 : years <= 20 ? 2 : 5, xt = [];
    for (let a = 0; a <= years; a += step) xt.push({ x: a * 12, label: String(a) });
    $('#chart').innerHTML = lineChart({
      series: [{ pts: pts(dep), c: 'var(--muted)', dash: true, w: 1.6 }, { pts: pts(sP), c: 'var(--c2)' }, { pts: pts(sS), c: 'var(--neg)', dash: true, w: 1.8 }, { pts: pts(sO), c: 'var(--c3)' }, { pts: pts(sB), c: 'var(--accent)', w: 3, main: true }],
      xmax: years * 12, xticks: xt, ymin: 0, yfmt: eur0, label: 'Evolução projetada do valor da carteira ao longo de ' + years + ' anos'
    });
    const n0 = project(v0, 0, years, rate(p.base)), last = (a) => a[a.length - 1];
    $('#onlyNow').textContent = eur(last(n0));
    $('#onlyNowSub').textContent = 'Cenário base, ' + years + ' anos. Ganho de ' + eur(last(n0) - v0) + '.';
    $('#withC').textContent = eur(last(sB));
    $('#withCSub').textContent = c > 0 ? 'Depositas ' + eur(c * years * 12) + ' e o mercado soma ' + eur(last(sB) - last(dep)) + '.' : 'Sem contribuição, igual ao cartão da esquerda.';
    const hs = [1, 3, 5, 10, years].filter((a) => a <= years).filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
    $('#ptable').innerHTML = hs.map((a) => { const m = a * 12; return '<tr><td>' + a + '</td><td>' + eur0(dep[m]) + '</td><td>' + eur0(sP[m]) + '</td><td><b>' + eur0(sB[m]) + '</b></td><td>' + eur0(sO[m]) + '</td><td>' + eur0(sS[m]) + '</td></tr>'; }).join('');
    $('#pnote').textContent = 'Taxa combinada no cenário base: ' + pc(rate(p.base) * 100) + ' ao ano, com reequilíbrio perfeito e sem custos nem impostos. Os resultados reais variam e as ações podem ter anos negativos.';
    $('#p-hint').textContent = p.peso == null ? 'O peso em ações vem do alvo da pie (' + pc(pesoAlvoAcoes(), 1) + ').' : 'Peso em ações definido por ti. Toca em "Usar o peso-alvo da pie" para voltar ao alvo.';
  }
  function fillProjInputs() {
    const p = S.cfg.p, f = (n) => String(+n.toFixed(2)).replace('.', ',');
    $('#p-contrib').value = f(p.contrib); $('#p-anos').value = String(p.anos);
    $('#p-peso').value = f(p.peso == null ? pesoAlvoAcoes() : p.peso);
    $('#p-xe').value = f(p.xe); $('#p-pess').value = f(p.pess); $('#p-base').value = f(p.base); $('#p-opt').value = f(p.opt); $('#p-shock').value = f(p.shock);
  }

  /* ---------- RETORNO ---------- */
  function rRet() {
    const a = S.snaps.slice().sort((x, y) => x.data < y.data ? -1 : 1), last = a[a.length - 1];
    if (last) {
      const cum = last.depositado > 0 ? (last.valor - last.depositado) / last.depositado * 100 : 0;
      $('#r-cum').innerHTML = '<span class="' + (cum >= 0 ? 'pos' : 'neg') + '">' + sp(cum) + '</span>';
      $('#r-sub').textContent = sg(last.valor - last.depositado) + ' sobre ' + eur(last.depositado) + ' depositados, a ' + fdate(last.data) + '.';
    } else { $('#r-cum').textContent = '—'; $('#r-sub').textContent = 'Ainda sem registos.'; }
    $('#snapchart-card').hidden = a.length < 2;
    if (a.length >= 2) {
      const d0 = Date.parse(a[0].data + 'T00:00:00Z') / 86400000, day = (s) => Date.parse(s + 'T00:00:00Z') / 86400000 - d0;
      const xmax = day(a[a.length - 1].data) || 1, xt = [];
      for (let i = 0; i <= 3; i++) { const dd = new Date((d0 + xmax * i / 3) * 86400000); const s = String(dd.getUTCDate()).padStart(2, '0') + '/' + String(dd.getUTCMonth() + 1).padStart(2, '0'); xt.push({ x: xmax * i / 3, label: s }); }
      $('#snapchart').innerHTML = lineChart({
        series: [{ pts: a.map((s) => [day(s.data), s.depositado]), c: 'var(--c2)', dash: true, w: 1.8 }, { pts: a.map((s) => [day(s.data), s.valor]), c: 'var(--accent)', w: 2.8, main: true }],
        xmax, xticks: xt, ymin: null, yfmt: eur, label: 'Valor da pie e total depositado ao longo do tempo'
      });
    }
    $('#stable').innerHTML = a.map((s, i) => {
      let per = 'início', cl = 'muted';
      if (i > 0) { const pr = a[i - 1], g = s.valor - pr.valor - (s.depositado - pr.depositado), r = pr.valor > 0 ? g / pr.valor * 100 : 0; per = sp(r); cl = r >= 0 ? 'pos' : 'neg'; }
      const cum = s.depositado > 0 ? (s.valor - s.depositado) / s.depositado * 100 : 0;
      return '<tr><td>' + fdate(s.data) + '</td><td>' + eur(s.valor) + '</td><td>' + eur(s.depositado) + '</td><td class="' + cl + '">' + per + '</td><td class="' + (cum >= 0 ? 'pos' : 'neg') + '">' + sp(cum) + '</td><td><button class="x" data-del-s="' + esc(s.id) + '" aria-label="Apagar registo">×</button></td></tr>';
    }).join('');
    rAportes();
  }
  function rAportes() {
    const sel = $('#ap-t'), cur = sel.value;
    sel.innerHTML = S.holdings.filter((h) => h.classe !== 'caixa').map((h) => '<option>' + esc(h.ticker) + '</option>').join('') + '<option value="">Pie (geral)</option>';
    if (cur) sel.value = cur;
    const byM = {}; S.aportes.forEach((x) => { const m = x.data.slice(0, 7); byM[m] = (byM[m] || 0) + x.valor; });
    const now = today().slice(0, 7), keys = Object.keys(byM).sort();
    $('#aptotal').textContent = eur(S.aportes.reduce((a, x) => a + x.valor, 0));
    let streak = 0, d = new Date(); d.setDate(1);
    const key = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    if (!byM[now]) d.setMonth(d.getMonth() - 1);
    while (byM[key(d)] > 0) { streak++; d.setMonth(d.getMonth() - 1); }
    $('#streak').textContent = String(streak);
    if (keys.length) {
      const items = []; const first = keys[0]; let dt = new Date(first + '-01T12:00:00');
      const end = new Date(now + '-01T12:00:00');
      while (dt <= end) { const k = key(dt); items.push({ label: k.slice(5) + '/' + k.slice(2, 4), v: byM[k] || 0 }); dt.setMonth(dt.getMonth() + 1); }
      $('#apchart').innerHTML = barsChart(items.slice(-12), S.cfg.p.contrib);
    } else $('#apchart').innerHTML = '<p class="small muted">Regista cada compra mensal para veres a tua consistência. A linha tracejada é a contribuição mensal da projeção.</p>';
    $('#aplist').innerHTML = S.aportes.slice(-12).reverse().map((x) => '<div class="li"><div class="grow">' + fdate(x.data) + ' · <b>' + esc(x.ticker || 'Pie') + '</b></div><b class="num">' + eur(x.valor) + '</b><button class="x" data-del-a="' + esc(x.id) + '" aria-label="Apagar aporte">×</button></div>').join('');
  }

  /* ---------- PLANO ---------- */
  function budgetRows(tipo) {
    const l = S.budget.filter((b) => b.tipo === tipo);
    return l.length ? l.map((b) => '<div class="li" data-id="' + esc(b.id) + '"><div class="grow">' + esc(b.nome) + '</div><input data-bf inputmode="decimal" value="' + String(b.valor).replace('.', ',') + '" aria-label="Valor de ' + esc(b.nome) + '"><button class="x" data-del-b aria-label="Remover ' + esc(b.nome) + '">×</button></div>').join('') : '<p class="small muted">Ainda sem itens.</p>';
  }
  function rBudgetLists() { $('#b-desp-list').innerHTML = budgetRows('despesa'); $('#b-poup-list').innerHTML = budgetRows('poupanca'); }
  function rPlano() {
    const sobra = S.cfg.rendimento - despTotal();
    $('#b-desp').textContent = eur(despTotal());
    $('#b-sobra').innerHTML = '<span class="' + (sobra >= 0 ? 'pos' : 'neg') + '">' + eur(sobra) + '</span>';
    const pat = totals().tot + poupTotal(); $('#b-pat').textContent = eur(pat);
    const p = S.cfg.p, wgt = (p.peso == null ? pesoAlvoAcoes() : p.peso) / 100, rate = wgt * p.base / 100 + (1 - wgt) * p.xe / 100, c = Math.max(0, p.contrib);
    $('#g-list').innerHTML = S.goals.length ? S.goals.map((g) => {
      const v = g.base === 'patrimonio' ? pat : totals().tot, prog = Math.min(100, v / g.alvo * 100);
      const eta = etaMonths(v, g.alvo, c, rate); let txt;
      if (eta === 0) txt = 'Objetivo atingido.';
      else if (eta === null) txt = 'No cenário base, com ' + eur0(c) + '/mês, demora mais de 50 anos.';
      else {
        txt = 'No cenário base, com ' + eur0(c) + '/mês: cerca de ' + fmtMonths(eta) + '.';
        if (g.prazo) { const left = Math.round((Date.parse(g.prazo + 'T12:00:00') - Date.now()) / (30.44 * 86400000)); txt += eta <= left ? ' Dentro do prazo.' : ' Fora do prazo.'; }
      }
      return '<div class="goal" data-id="' + esc(g.id) + '"><div class="row between"><b>' + esc(g.nome) + '</b><span class="row"><b class="num ' + (prog >= 100 ? 'pos' : '') + '">' + prog.toFixed(0) + ' %</b><button class="x" data-del-g aria-label="Remover objetivo">×</button></span></div>' +
        '<div class="prog"><i style="width:' + prog + '%"></i></div><div class="small muted">' + eur(v) + ' de ' + eur(g.alvo) + (g.prazo ? ' · até ' + fdate(g.prazo) : '') + (g.base === 'patrimonio' ? ' · património' : ' · pie') + '</div><div class="small">' + esc(txt) + '</div></div>';
    }).join('') : '<p class="small muted" style="margin-top:12px">Cria o teu primeiro objetivo. O progresso e a data estimada usam o cenário base da Projeção.</p>';
  }

  /* ---------- REVISÕES ---------- */
  const CHECKS = [['autoinvest', 'AutoInvest do dia 13 cumprido'], ['registo', 'Registo do mês guardado (separador Retorno)'], ['semmexidas', 'Sem alterações impulsivas entre revisões'], ['pendentes', 'Pendentes revistos']];
  function rRev() {
    const ym = today().slice(0, 7), t = totals();
    $('#rv-title').textContent = 'Revisão de ' + new Date(ym + '-15T12:00:00').toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    $('#rv-val').innerHTML = eur(t.tot) + '<br><span class="' + (t.gan >= 0 ? 'pos' : 'neg') + '">' + sp(t.ret) + '</span>';
    const ds = t.inv.filter((h) => h.alvo > 0).map((h) => (t.base > 0 ? h.valor / t.base * 100 : 0) - h.alvo);
    const maxd = ds.length ? ds.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0) : 0;
    $('#rv-drift').textContent = ds.length ? (maxd < 0 ? '−' : '+') + pc(Math.abs(maxd)).replace(' %', ' pp') : '—';
    const chk = S.cfg.checks[ym] || {}, hasSnap = S.snaps.some((s) => s.data.slice(0, 7) === ym);
    $('#rv-checks').innerHTML = CHECKS.map(([k, l]) => { const auto = k === 'registo' && hasSnap; return '<label class="check"><input type="checkbox" data-ck="' + k + '"' + (chk[k] || auto ? ' checked' : '') + (auto ? ' disabled' : '') + '>' + esc(l) + '</label>'; }).join('');
    rNotes();
  }
  const KL = { pendente: 'Pendente', decisao: 'Decisão', rejeitado: 'Fechado', nota: 'Nota', revisao: 'Revisão' };
  function rNotes() {
    const f = $('#n-f').value, l = S.notes.filter((n) => !f || n.tipo === f);
    $('#notes').innerHTML = l.length ? l.map((n) => '<div class="note"><span class="pill ' + esc(n.tipo) + '">' + esc(KL[n.tipo] || 'Nota') + '</span><div class="body"><div>' + esc(n.texto) + '</div><div class="small muted">' + fdate(n.data) + '</div></div><button class="x" data-del-n="' + esc(n.id) + '" aria-label="Apagar nota">×</button></div>').join('') : '<p class="small muted">Sem notas.</p>';
  }
  function rConta() {
    $('#c-email').textContent = user ? user.email : '';
    $('#c-sync').textContent = lastSync ? lastSync.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }

  function renderAll() { rCart(); rHoldEdit(); fillProjInputs(); rProj(); rRet(); rBudgetLists(); $('#b-rend').value = String(S.cfg.rendimento).replace('.', ','); rPlano(); rRev(); rConta(); }
  function recompute() { rCart(); rProj(); rRet(); rPlano(); rRev(); fillPesoIfAuto(); }
  function fillPesoIfAuto() { if (S.cfg.p.peso == null && document.activeElement !== $('#p-peso')) $('#p-peso').value = String(+pesoAlvoAcoes().toFixed(2)).replace('.', ','); }

  /* ---------- dados iniciais ---------- */
  async function seed() {
    const hs = [
      { id: uuid(), ticker: 'VWCE', nome: 'Vanguard FTSE All-World', classe: 'acoes', valor: 52.21, ganho: 0.79, alvo: 70, ordem: 1 },
      { id: uuid(), ticker: 'XEON', nome: 'Xtrackers II EUR Overnight Rate Swap', classe: 'defensivo', valor: 22.20, ganho: 0.07, alvo: 30, ordem: 2 },
      { id: uuid(), ticker: 'CAIXA', nome: 'Caixa', classe: 'caixa', valor: 0.01, ganho: 0, alvo: 0, ordem: 3 }
    ];
    const N = (tipo, texto) => ({ user_id: user.id, tipo, data: null, texto });
    const notes = [
      N('pendente', 'Avaliar um ETF de obrigações governamentais da zona euro a 1–3 anos como âncora defensiva ao lado do XEON. Candidatos: iShares Core € Govt Bond, Xtrackers II Eurozone Government Bond, Vanguard EUR Eurozone Government Bond.'),
      N('decisao', 'Manter o perfil defensivo 70 / 30. Sem alterações entre revisões. Small caps globais ficam de fora, a menos que o perfil de risco mude.'),
      N('rejeitado', 'USA Tech 100: instrumento CFD/índice, não é ETF UCITS, e a tecnologia já está no VWCE.'),
      N('rejeitado', 'SPYY e EUNL: sobreposição quase total com o VWCE (correlação de 0,99 no SPYY). A diferença de custo não compensa.'),
      N('rejeitado', 'Pie Magnificent 7 + Broadcom: aposta setorial concentrada, redundante com o VWCE e contrária à estratégia.')
    ];
    const rs = await Promise.all([
      sb.from('cf_holdings').insert(hs.map((h) => dbH(h))),
      sb.from('cf_snapshots').upsert({ user_id: user.id, data: '2026-10-21', valor: 74.42, depositado: 73.56 }, { onConflict: 'user_id,data' }),
      sb.from('cf_notes').insert(notes),
      sb.from('cf_settings').upsert({ user_id: user.id, data: S.cfg, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    ]);
    const err = rs.find((r) => r.error);
    if (err) { toast('Não foi possível carregar os dados: ' + err.error.message, true); return; }
    await refresh(); toast('Dados iniciais carregados');
  }

  /* ---------- eventos ---------- */
  function bindNum(id, get, set, after) {
    const el = $(id);
    el.addEventListener('input', () => { set(num(el.value)); saveCfg(); after(); });
  }
  function showTab(name) {
    $$('.views section').forEach((s) => { s.hidden = s.id !== 't-' + name; });
    $$('#nav button').forEach((b) => { if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    window.scrollTo(0, 0);
  }
  const needOnline = () => { if (offline || !navigator.onLine) { toast('Sem ligação. Tenta outra vez quando estiveres online.', true); return false; } return true; };

  function bindApp() {
    $$('#nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('#seed-go').addEventListener('click', async () => { if (needOnline()) { $('#seed-go').disabled = true; await seed(); $('#seed-go').disabled = false; } });
    $('#snap-today').addEventListener('click', async () => { if (needOnline()) await snapToday(); });
    $('#t212-sync').addEventListener('click', syncT212);
    $('#dep').addEventListener('input', rCart);

    // posições
    $('#hold-edit').addEventListener('input', (e) => {
      const inp = e.target.closest('input[data-f]'); if (!inp) return;
      const h = S.holdings.find((x) => x.id === inp.closest('.hold').dataset.id); if (!h) return;
      h[inp.dataset.f] = num(inp.value); queueHold(h); recompute();
    });
    $('#hold-edit').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del-h]'); if (!b) return;
      const id = b.closest('.hold').dataset.id, h = S.holdings.find((x) => x.id === id);
      if (!h || !needOnline() || !confirm('Remover ' + h.ticker + '?')) return;
      if (await w(sb.from('cf_holdings').delete().eq('id', id), 'Posição removida')) { S.holdings = S.holdings.filter((x) => x.id !== id); rHoldEdit(); recompute(); }
    });
    $('#hn-add').addEventListener('click', async () => {
      const tk = $('#hn-t').value.trim().toUpperCase(); if (!tk) { toast('Escreve o ticker.', true); return; }
      if (!needOnline()) return;
      const h = { id: uuid(), ticker: tk, nome: $('#hn-n').value.trim() || tk, classe: $('#hn-c').value, valor: num($('#hn-v').value), ganho: num($('#hn-g').value), alvo: Math.min(100, Math.max(0, num($('#hn-a').value))), ordem: S.holdings.length + 1 };
      if (await w(sb.from('cf_holdings').insert(dbH(h)), 'Posição adicionada')) {
        S.holdings.push(h); ['hn-t', 'hn-n', 'hn-v'].forEach((i) => { $('#' + i).value = ''; }); $('#hn-g').value = '0'; $('#hn-a').value = '0';
        rHoldEdit(); recompute();
      }
    });

    // projeção
    bindNum('#p-contrib', 0, (v) => { S.cfg.p.contrib = v; }, () => { rProj(); rPlano(); rAportes(); });
    bindNum('#p-anos', 0, (v) => { S.cfg.p.anos = v; }, rProj);
    bindNum('#p-peso', 0, (v) => { S.cfg.p.peso = v; }, () => { rProj(); rPlano(); });
    bindNum('#p-xe', 0, (v) => { S.cfg.p.xe = v; }, () => { rProj(); rPlano(); });
    bindNum('#p-pess', 0, (v) => { S.cfg.p.pess = v; }, rProj);
    bindNum('#p-base', 0, (v) => { S.cfg.p.base = v; }, () => { rProj(); rPlano(); });
    bindNum('#p-opt', 0, (v) => { S.cfg.p.opt = v; }, rProj);
    bindNum('#p-shock', 0, (v) => { S.cfg.p.shock = v; }, rProj);
    $('#p-peso-alvo').addEventListener('click', () => { S.cfg.p.peso = null; saveCfg(); fillProjInputs(); rProj(); rPlano(); });
    $$('[data-c]').forEach((b) => b.addEventListener('click', () => { S.cfg.p.contrib = num(b.dataset.c); saveCfg(); fillProjInputs(); rProj(); rPlano(); rAportes(); }));

    // retorno
    $('#s-d').value = today(); $('#ap-d').value = today(); $('#n-d').value = today();
    $('#s-fill').addEventListener('click', () => {
      const t = totals(); $('#s-v').value = t.tot.toFixed(2).replace('.', ','); $('#s-i').value = t.custo.toFixed(2).replace('.', ',');
      $('#s-msg').textContent = 'Preenchido com o valor e o ganho da Carteira. Confirma o total depositado.'; $('#s-msg').className = 'msg';
    });
    $('#s-add').addEventListener('click', async () => {
      const d = $('#s-d').value, v = num($('#s-v').value), i = num($('#s-i').value), m = $('#s-msg');
      if (!d || v <= 0 || i <= 0) { m.textContent = 'Preenche a data, o valor da pie e o total depositado.'; m.className = 'msg bad'; return; }
      if (!needOnline()) return;
      if (await w(sb.from('cf_snapshots').upsert({ user_id: user.id, data: d, valor: v, depositado: i }, { onConflict: 'user_id,data' }), 'Registo guardado')) { await loadSnaps(); m.textContent = ''; recompute(); }
    });
    $('#stable').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del-s]'); if (!b || !needOnline()) return;
      if (await w(sb.from('cf_snapshots').delete().eq('id', b.dataset.delS), 'Registo apagado')) { S.snaps = S.snaps.filter((x) => x.id !== b.dataset.delS); rRet(); rRev(); }
    });
    $('#ap-add').addEventListener('click', async () => {
      const v = num($('#ap-v').value), d = $('#ap-d').value, m = $('#ap-msg');
      if (v <= 0 || !d) { m.textContent = 'Indica a data e um valor maior que zero.'; m.className = 'msg bad'; return; }
      if (!needOnline()) return;
      const row = { id: uuid(), user_id: user.id, data: d, valor: v, ticker: $('#ap-t').value, nota: '' };
      if (await w(sb.from('cf_aportes').insert(row), 'Aporte registado')) { S.aportes.push({ id: row.id, data: d, valor: v, ticker: row.ticker, nota: '' }); S.aportes.sort((a, b) => a.data < b.data ? -1 : 1); $('#ap-v').value = ''; m.textContent = ''; rAportes(); }
    });
    $('#aplist').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del-a]'); if (!b || !needOnline()) return;
      if (await w(sb.from('cf_aportes').delete().eq('id', b.dataset.delA), 'Aporte apagado')) { S.aportes = S.aportes.filter((x) => x.id !== b.dataset.delA); rAportes(); }
    });

    // plano
    $('#b-rend').addEventListener('input', () => { S.cfg.rendimento = num($('#b-rend').value); saveCfg(); rPlano(); });
    $('#b-use').addEventListener('click', () => {
      const s = Math.max(0, Math.floor(S.cfg.rendimento - despTotal()));
      S.cfg.p.contrib = s; saveCfg(); fillProjInputs(); rProj(); rPlano(); rAportes();
      $('#b-msg').textContent = 'Contribuição da projeção: ' + eur0(s) + '/mês.';
    });
    const addBudget = (tipo, n, v) => async () => {
      const nome = $(n).value.trim(); if (!nome || !needOnline()) return;
      const row = { id: uuid(), user_id: user.id, tipo, nome, valor: num($(v).value) };
      if (await w(sb.from('cf_budget').insert(row))) { S.budget.push({ id: row.id, tipo, nome, valor: row.valor }); $(n).value = ''; $(v).value = ''; rBudgetLists(); rPlano(); }
    };
    $('#bd-add').addEventListener('click', addBudget('despesa', '#bd-n', '#bd-v'));
    $('#bp-add').addEventListener('click', addBudget('poupanca', '#bp-n', '#bp-v'));
    const saveB = {};
    const budgetEvents = (el) => {
      el.addEventListener('input', (e) => {
        const inp = e.target.closest('input[data-bf]'); if (!inp) return;
        const id = inp.closest('.li').dataset.id, b = S.budget.find((x) => x.id === id); if (!b) return;
        b.valor = num(inp.value);
        if (!saveB[id]) saveB[id] = deb(async () => { await w(sb.from('cf_budget').update({ valor: S.budget.find((x) => x.id === id).valor }).eq('id', id)); }, 700);
        saveB[id](); rPlano();
      });
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-del-b]'); if (!b || !needOnline()) return;
        const id = b.closest('.li').dataset.id;
        if (await w(sb.from('cf_budget').delete().eq('id', id))) { S.budget = S.budget.filter((x) => x.id !== id); rBudgetLists(); rPlano(); }
      });
    };
    budgetEvents($('#b-desp-list')); budgetEvents($('#b-poup-list'));
    $('#g-add').addEventListener('click', async () => {
      const nome = $('#g-n').value.trim(), alvo = num($('#g-a').value); if (!nome || alvo <= 0 || !needOnline()) { if (!nome || alvo <= 0) toast('Indica o nome e um alvo maior que zero.', true); return; }
      const row = { id: uuid(), user_id: user.id, nome, alvo, prazo: $('#g-p').value || null, base: $('#g-b').value };
      if (await w(sb.from('cf_goals').insert(row), 'Objetivo criado')) { S.goals.push({ id: row.id, nome, alvo, prazo: row.prazo, base: row.base }); ['g-n', 'g-a', 'g-p'].forEach((i) => { $('#' + i).value = ''; }); rPlano(); }
    });
    $('#g-list').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del-g]'); if (!b || !needOnline()) return;
      const id = b.closest('.goal').dataset.id;
      if (await w(sb.from('cf_goals').delete().eq('id', id))) { S.goals = S.goals.filter((x) => x.id !== id); rPlano(); }
    });

    // revisões
    $('#rv-checks').addEventListener('change', (e) => {
      const c = e.target.closest('input[data-ck]'); if (!c) return;
      const ym = today().slice(0, 7); S.cfg.checks[ym] = { ...(S.cfg.checks[ym] || {}), [c.dataset.ck]: c.checked }; saveCfg();
    });
    $('#rv-save').addEventListener('click', async () => {
      const ym = today().slice(0, 7), t = totals(), chk = S.cfg.checks[ym] || {}, hasSnap = S.snaps.some((s) => s.data.slice(0, 7) === ym), m = $('#rv-msg');
      const done = CHECKS.filter(([k]) => chk[k] || (k === 'registo' && hasSnap)).map(([, l]) => l);
      const txt = ('Revisão ' + ym + ' · ' + eur(t.tot) + ' · ' + sp(t.ret) + (done.length ? '\nFeito: ' + done.join('; ') + '.' : '') + ($('#rv-t').value.trim() ? '\n' + $('#rv-t').value.trim() : '')).slice(0, 4000);
      if (!needOnline()) return;
      const row = { id: uuid(), user_id: user.id, tipo: 'revisao', data: today(), texto: txt };
      if (await w(sb.from('cf_notes').insert(row), 'Revisão guardada')) { S.notes.unshift({ id: row.id, tipo: 'revisao', data: row.data, texto: txt }); $('#rv-t').value = ''; m.textContent = ''; rNotes(); }
    });
    $('#n-add').addEventListener('click', async () => {
      const t = $('#n-t').value.trim(); if (!t || !needOnline()) return;
      const row = { id: uuid(), user_id: user.id, tipo: $('#n-k').value, data: $('#n-d').value || null, texto: t };
      if (await w(sb.from('cf_notes').insert(row), 'Nota adicionada')) { S.notes.unshift({ id: row.id, tipo: row.tipo, data: row.data, texto: t }); $('#n-t').value = ''; rNotes(); }
    });
    $('#n-f').addEventListener('change', rNotes);
    $('#notes').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del-n]'); if (!b || !needOnline()) return;
      if (await w(sb.from('cf_notes').delete().eq('id', b.dataset.delN), 'Nota apagada')) { S.notes = S.notes.filter((x) => x.id !== b.dataset.delN); rNotes(); }
    });

    // conta
    $('#c-out').addEventListener('click', async () => { await sb.auth.signOut(); });
    $('#c-export').addEventListener('click', async () => {
      const txt = JSON.stringify({ exportado_em: new Date().toISOString(), ...S }, null, 2);
      try { await navigator.clipboard.writeText(txt); toast('Cópia de segurança copiada'); } catch (e) { toast('Não foi possível copiar neste dispositivo.', true); }
    });
    $('#c-install').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* ignora */ } installEvt = null; $('#c-install').hidden = true; });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#c-install').hidden = false; });
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $('#c-ios').hidden = false;
  }

  /* ---------- sessão ---------- */
  function showAuth(mode) {
    $('#app').hidden = true; $('#auth').hidden = false;
    $('#auth-form').hidden = mode === 'newpass'; $('#newpass-form').hidden = mode !== 'newpass';
  }
  function showApp() { $('#auth').hidden = true; $('#app').hidden = false; }
  const amsg = (t, bad) => { const m = $('#auth-msg'); m.textContent = t; m.className = 'msg' + (bad ? ' bad' : ''); };
  const authErr = (e) => {
    const m = String((e && e.message) || e);
    if (/Invalid login/i.test(m)) return 'Email ou password incorretos.';
    if (/not confirmed/i.test(m)) return 'Confirma primeiro o email que te enviámos.';
    if (/already registered|already been registered/i.test(m)) return 'Já existe uma conta com este email. Usa "Entrar".';
    if (/rate limit|too many/i.test(m)) return 'Demasiadas tentativas. Espera um pouco e tenta outra vez.';
    if (/signups? (are )?(not allowed|disabled)/i.test(m)) return 'A criação de contas está desativada nesta app.';
    return 'Não foi possível concluir: ' + m;
  };
  function bindAuth() {
    $('#auth-form').addEventListener('submit', async (e) => {
      e.preventDefault(); amsg('A entrar…');
      const { error } = await sb.auth.signInWithPassword({ email: $('#a-email').value.trim(), password: $('#a-pass').value });
      if (error) amsg(authErr(error), true); else amsg('');
    });
    $('#a-up').addEventListener('click', async () => {
      const email = $('#a-email').value.trim(), password = $('#a-pass').value;
      if (!email) { amsg('Escreve o teu email.', true); return; }
      if (password.length < 8) { amsg('A password precisa de pelo menos 8 caracteres.', true); return; }
      amsg('A criar conta…');
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) { amsg(authErr(error), true); return; }
      amsg(data.session ? '' : 'Enviámos um email de confirmação. Abre o link e volta aqui para entrar.');
    });
    $('#a-reset').addEventListener('click', async () => {
      const email = $('#a-email').value.trim(); if (!email) { amsg('Escreve primeiro o teu email.', true); return; }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      amsg(error ? authErr(error) : 'Se o email existir, enviámos um link para definires nova password.', !!error);
    });
    $('#newpass-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const p = $('#np-pass').value;
      if (p.length < 8) { amsg('A password precisa de pelo menos 8 caracteres.', true); return; }
      const { error } = await sb.auth.updateUser({ password: p });
      if (error) amsg(authErr(error), true); else { amsg('Password atualizada.'); $('#np-pass').value = ''; showApp(); startFor(user); }
    });
  }
  async function startFor(u) {
    if (!u) return;
    user = u; showApp();
    if (loadedFor === u.id) return;
    loadedFor = u.id; S = emptyS(); setSync('', 'A carregar');
    await refresh();
  }

  /* ---------- arranque ---------- */
  async function init() {
    bindAuth(); bindApp(); showTab('carteira');
    window.addEventListener('online', () => { if (user) refresh(); });
    window.addEventListener('offline', () => { offline = true; setSync('off', 'Offline'); });
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { user = session && session.user; showAuth('newpass'); amsg('Define a tua nova password.'); return; }
      if (event === 'SIGNED_OUT') { user = null; loadedFor = null; S = emptyS(); showAuth('login'); return; }
      if (session && session.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) setTimeout(() => startFor(session.user), 0);
    });
    const { data } = await sb.auth.getSession();
    if (data.session) startFor(data.session.user); else if (!$('#app').hidden === false) showAuth('login');
    if (!data.session) showAuth('login');
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  init();
})();
