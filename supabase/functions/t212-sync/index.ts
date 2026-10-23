// Edge Function "t212-sync" (Supabase).
// SÓ LEITURA: lê a pie na Trading 212 e devolve as posições já normalizadas.
// Não escreve na base de dados e não envia ordens. Quem grava é a app, com o teu login.
//
// Segredos (Supabase > Edge Functions > Secrets), NUNCA no código nem no chat:
//   T212_API_KEY      chave da API da Trading 212
//   T212_API_SECRET   segredo da API da Trading 212
// Opcionais:
//   T212_PIE_ID       id da pie (se a conta tiver mais do que uma e quiseres fixar)
//   T212_PIE_NAME     nome da pie a procurar (por omissão "Carteirisses (Base)")
//   T212_BASE_URL     por omissão https://live.trading212.com/api/v0 (demo: https://demo.trading212.com/api/v0)

const BASE = (Deno.env.get('T212_BASE_URL') ?? 'https://live.trading212.com/api/v0').replace(/\/$/, '');
const ORIGINS = ['https://uligod-31.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];

class Fail extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// "VWCEd_EQ" -> "VWCE"
const baseTicker = (t: string) => t.match(/^[A-Z0-9]+/)?.[0] ?? t;
// A Trading 212 chama DBXT ao ETF que na Caderneta se chama XEON.
const ALIAS: Record<string, string> = { DBXT: 'XEON' };
const caderneta = (t: string) => ALIAS[baseTicker(t)] ?? baseTicker(t);

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

async function t212(path: string, basic: string) {
  const r = await fetch(BASE + path, { headers: { Authorization: basic } });
  if (r.status === 429) throw new Fail(429, 'A Trading 212 limita os pedidos. Espera 30 segundos e tenta outra vez.');
  if (r.status === 401 || r.status === 403) {
    throw new Fail(502, 'A Trading 212 recusou o acesso. Confirma a chave, o segredo e a permissão de leitura das pies.');
  }
  if (!r.ok) throw new Fail(502, `A Trading 212 respondeu com o erro ${r.status}.`);
  return await r.json();
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

    const key = (Deno.env.get('T212_API_KEY') ?? '').trim();
    const secret = (Deno.env.get('T212_API_SECRET') ?? '').trim();
    if (!key || !secret) throw new Fail(500, 'A função ainda não tem os segredos T212_API_KEY e T212_API_SECRET.');
    // Chaves são texto simples: sem espaços, acentos nem aspas tipográficas.
    const simples = /^[\x21-\x7E]+$/;
    if (!simples.test(key)) throw new Fail(500, 'O segredo T212_API_KEY tem caracteres inválidos. Apaga-o e cola de novo só a chave, sem espaços nem texto extra.');
    if (!simples.test(secret)) throw new Fail(500, 'O segredo T212_API_SECRET tem caracteres inválidos. Apaga-o e cola de novo só o segredo, sem espaços nem texto extra.');
    const basic = 'Basic ' + btoa(`${key}:${secret}`);

    const pies = await t212('/equity/pies', basic);
    if (!Array.isArray(pies) || pies.length === 0) throw new Fail(404, 'Não encontrei nenhuma pie nesta conta.');

    let pieId = Deno.env.get('T212_PIE_ID') ?? '';
    // deno-lint-ignore no-explicit-any
    let detail: any = null;

    if (!pieId) {
      if (pies.length === 1) {
        pieId = String(pies[0].id);
      } else {
        // Vários pies: procura pelo nome (a API limita os detalhes a 1 pedido / 5 s).
        const wanted = (Deno.env.get('T212_PIE_NAME') ?? 'Carteirisses (Base)').trim().toLowerCase();
        const seen: string[] = [];
        for (const p of pies.slice(0, 6)) {
          if (seen.length) await sleep(5200);
          const d = await t212(`/equity/pies/${p.id}`, basic);
          const name = String(d?.settings?.name ?? '');
          seen.push(`${p.id} = ${name || 'sem nome'}`);
          if (name.trim().toLowerCase() === wanted) { pieId = String(p.id); detail = d; break; }
        }
        if (!pieId) {
          throw new Fail(404, `Não encontrei a pie "${Deno.env.get('T212_PIE_NAME') ?? 'Carteirisses (Base)'}". Define o segredo T212_PIE_ID. Pies: ${seen.join('; ')}.`);
        }
      }
    }

    // deno-lint-ignore no-explicit-any
    const pie = pies.find((p: any) => String(p.id) === pieId);
    if (!pie) throw new Fail(404, `A pie ${pieId} não existe nesta conta.`);
    if (!detail) detail = await t212(`/equity/pies/${pieId}`, basic);

    // deno-lint-ignore no-explicit-any
    const instrumentos = (detail.instruments ?? []).map((i: any) => ({
      ticker: caderneta(String(i.ticker)),
      t212Ticker: String(i.ticker),
      quantidade: Number(i.ownedQuantity) || 0,
      valor: round2(i.result?.priceAvgValue),
      ganho: round2(i.result?.priceAvgResult),
      pesoAtual: i.currentShare ?? null,
      pesoAlvo: i.expectedShare ?? null,
    }));
    const cash = round2(pie.cash);
    const total = round2(instrumentos.reduce((a: number, i: { valor: number }) => a + i.valor, 0) + cash);

    return reply({
      ok: true,
      pieId,
      nome: detail.settings?.name ?? null,
      cash,
      total,
      instrumentos,
      lidoEm: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof Fail) return reply({ error: e.message }, e.status);
    console.error('t212-sync', e instanceof Error ? e.message : 'erro desconhecido');
    return reply({ error: 'Erro inesperado na função.' }, 500);
  }
});
