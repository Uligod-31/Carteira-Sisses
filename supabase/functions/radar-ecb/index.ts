// Edge Function "radar-ecb" (Supabase).
// SÓ LEITURA: lê séries oficiais do Portal de Dados do BCE (API aberta, sem chave) e devolve valores já resumidos.
// Não escreve na base de dados, não usa segredos e não recebe dados teus. Quem mostra é a app.
// Fonte: https://data-api.ecb.europa.eu (SDMX). Lista fechada de séries: não aceita chaves vindas do pedido.

const ECB = 'https://data-api.ecb.europa.eu/service/data';
const ORIGINS = ['https://uligod-31.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];

class Fail extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

type Kind = 'level' | 'step' | 'monthly';
interface Def { id: string; label: string; path: string; kind: Kind; days?: number }

const SERIES: Def[] = [
  { id: 'estr', label: '€STR (taxa overnight)', path: 'EST/B.EU000A2X2A25.WT', kind: 'level', days: 75 },
  { id: 'dfr', label: 'Taxa de depósito do BCE', path: 'FM/D.U2.EUR.4F.KR.DFR.LEV', kind: 'step', days: 420 },
  { id: 'mro', label: 'Taxa de refinanciamento (MRO)', path: 'FM/D.U2.EUR.4F.KR.MRR_FR.LEV', kind: 'step', days: 420 },
  { id: 'y2', label: 'Dívida AAA da zona euro, 2 anos', path: 'YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y', kind: 'level', days: 75 },
  { id: 'y10', label: 'Dívida AAA da zona euro, 10 anos', path: 'YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y', kind: 'level', days: 75 },
  { id: 'hicp', label: 'Inflação na zona euro (anual)', path: 'ICP/M.U2.N.000000.4.ANR', kind: 'monthly' },
];

// A chave "anon" é pública e também é um JWT válido, por isso o verify_jwt sozinho não chega:
// confirmamos que o pedido traz a sessão de um utilizador autenticado.
async function requireUser(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new Fail(401, 'Falta o login.');
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  });
  if (!r.ok) throw new Fail(401, 'Sessão inválida. Entra outra vez na app.');
}

interface Obs { date: string; value: number }

// Formato "jsondata" do SDMX: a primeira série, com as datas em structure.dimensions.observation.
// deno-lint-ignore no-explicit-any
function parse(j: any): Obs[] {
  const series = j?.dataSets?.[0]?.series;
  if (!series || typeof series !== 'object') return [];
  // deno-lint-ignore no-explicit-any
  const first: any = Object.values(series)[0];
  const times = j?.structure?.dimensions?.observation?.[0]?.values ?? [];
  const out: Obs[] = [];
  for (const [i, v] of Object.entries(first?.observations ?? {})) {
    const val = (v as unknown[])[0];
    const date = times[Number(i)]?.id;
    if (typeof date === 'string' && typeof val === 'number' && isFinite(val)) out.push({ date, value: val });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysBefore = (date: string, n: number) => isoDay(new Date(Date.parse(date + 'T00:00:00Z') - n * 86400000));

async function load(def: Def) {
  const q = def.kind === 'monthly'
    ? 'lastNObservations=3'
    : `startPeriod=${isoDay(new Date(Date.now() - (def.days ?? 60) * 86400000))}`;
  const url = `${ECB}/${def.path}?${q}&format=jsondata`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (r.status === 404) return { id: def.id, label: def.label, error: 'O BCE não devolveu dados para esta série.' };
    if (!r.ok) return { id: def.id, label: def.label, error: `O BCE respondeu com o erro ${r.status}.` };
    const obs = parse(await r.json());
    if (!obs.length) return { id: def.id, label: def.label, error: 'Sem observações recentes.' };
    const last = obs[obs.length - 1];

    if (def.kind === 'monthly') {
      const prev = obs.length > 1 ? obs[obs.length - 2] : null;
      return { id: def.id, label: def.label, kind: def.kind, data: last.date, valor: r3(last.value), anterior: prev ? { data: prev.date, valor: r3(prev.value) } : null };
    }
    if (def.kind === 'level') {
      const alvo = daysBefore(last.date, 30);
      let ref: Obs | null = null;
      for (const o of obs) if (o.date <= alvo) ref = o;
      return {
        id: def.id, label: def.label, kind: def.kind, data: last.date, valor: r3(last.value),
        ha30d: ref ? { data: ref.date, valor: r3(ref.value) } : null,
        var30d: ref ? r3(last.value - ref.value) : null,
      };
    }
    // step: taxa oficial que só muda em decisões. Procura a última alteração na janela.
    let idx = -1;
    for (let i = obs.length - 1; i >= 0; i--) if (Math.abs(obs[i].value - last.value) > 1e-9) { idx = i; break; }
    return {
      id: def.id, label: def.label, kind: def.kind, data: last.date, valor: r3(last.value),
      alteracao: idx >= 0 ? { data: obs[idx + 1].date, de: r3(obs[idx].value), para: r3(last.value) } : null,
      semAlteracaoDesde: idx < 0 ? obs[0].date : null,
    };
  } catch (_e) {
    return { id: def.id, label: def.label, error: 'Não consegui ligar ao BCE.' };
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);

  try {
    await requireUser(req);
    const series = await Promise.all(SERIES.map(load));
    if (series.every((s) => 'error' in s)) throw new Fail(502, 'O BCE não respondeu. Tenta daqui a pouco.');
    return reply({
      ok: true,
      fonte: 'BCE · Portal de Dados (data.ecb.europa.eu)',
      lidoEm: new Date().toISOString(),
      series,
    });
  } catch (e) {
    if (e instanceof Fail) return reply({ error: e.message }, e.status);
    console.error('radar-ecb', e instanceof Error ? e.message : 'erro desconhecido');
    return reply({ error: 'Erro inesperado na função.' }, 500);
  }
});
