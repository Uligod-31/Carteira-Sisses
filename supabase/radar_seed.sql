-- Radar: fichas de referência (justETF, Trackinsight) lidas a 2026-10-23.
-- Requer a tabela cf_radar_refs (supabase/schema.sql). Seguro para voltar a correr (upsert).
-- Corre no SQL Editor: o utilizador é o único da conta (registos novos desativados).
insert into public.cf_radar_refs (user_id, ticker, fonte, campo, valor_num, valor_txt, data_ref, url)
select u.id, v.ticker, v.fonte, v.campo, v.valor_num, v.valor_txt, v.data_ref::date, v.url
from (select id from auth.users order by created_at limit 1) u,
(values
 ('VWCE','justetf','ter',0.14,null,'2026-10-23','https://www.justetf.com/en-it/asset-comparisons/etf-comparisons/IE00BK5BQT80-vanguard-ftse-all-world-acc-vs-LU0290358497-xtrackers-eur-overnight-rate-swap-acc'),
 ('VWCE','justetf','aum_m',55656,null,'2026-10-23',null),
 ('VWCE','justetf','dd_5a',-19.59,null,'2026-10-23',null),
 ('VWCE','justetf','dd_max',-33.48,null,'2026-10-23',null),
 ('VWCE','justetf','replicacao',null,'Física','2026-10-23',null),
 ('VWCE','justetf','indice',null,'FTSE All-World','2026-10-23',null),
 ('XEON','justetf','ter',0.10,null,'2026-10-23','https://www.justetf.com/en-it/asset-comparisons/etf-comparisons/IE00BK5BQT80-vanguard-ftse-all-world-acc-vs-LU0290358497-xtrackers-eur-overnight-rate-swap-acc'),
 ('XEON','justetf','aum_m',23502,null,'2026-10-23',null),
 ('XEON','justetf','dd_5a',-0.47,null,'2026-10-23',null),
 ('XEON','justetf','dd_max',-3.70,null,'2026-10-23',null),
 ('XEON','justetf','replicacao',null,'Sintética (swap)','2026-10-23',null),
 ('XEON','justetf','indice',null,'Solactive €STR +8.5 Daily','2026-10-23',null),
 ('VWCE','trackinsight','ter',0.1412,null,'2026-10-19','https://www.trackinsight.com/en/fund/VWCE'),
 ('VWCE','trackinsight','aum_m',55170,null,'2026-10-19',null),
 ('VWCE','trackinsight','ytd',12.52,null,'2026-10-19',null),
 ('VWCE','trackinsight','replicacao',null,'Amostragem otimizada','2026-10-19',null),
 ('VWCE','trackinsight','indice',null,'FTSE All World (retorno total líquido, USD)','2026-10-19',null),
 ('XEON','trackinsight','ter',0.10,null,'2026-10-20','https://www.trackinsight.com/en/fund/XEON'),
 ('XEON','trackinsight','aum_m',23520,null,'2026-10-20',null),
 ('XEON','trackinsight','ytd',1.69,null,'2026-10-20',null),
 ('XEON','trackinsight','replicacao',null,'Swap sem fundos (unfunded)','2026-10-20',null),
 ('XEON','trackinsight','indice',null,'Solactive €STR +8.5 Daily (retorno total, EUR)','2026-10-20',null)
) as v(ticker, fonte, campo, valor_num, valor_txt, data_ref, url)
on conflict (user_id, ticker, fonte, campo) do update
  set valor_num = excluded.valor_num, valor_txt = excluded.valor_txt, data_ref = excluded.data_ref, url = excluded.url, updated_at = now();
