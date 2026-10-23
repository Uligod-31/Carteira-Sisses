# Caderneta · Conselheiro Financeiro

App instalável (PWA) com login e base de dados Supabase (projeto Caderneta212).

## 1. Criar as tabelas (uma vez)
1. Supabase > projeto Caderneta212 > SQL Editor > New query.
2. Cola o conteúdo de `supabase/schema.sql` e carrega em Run.

## 2. Publicar no GitHub Pages
1. GitHub > New repository (por exemplo `caderneta`), público.
2. Add file > Upload files: arrasta TODO o conteúdo desta pasta (incluindo as pastas `fonts`, `icons`, `vendor`, `supabase`). Commit.
3. Settings > Pages > Source: Deploy from a branch > `main` / `(root)` > Save.
4. Ao fim de ~1 minuto o endereço fica `https://O-TEU-UTILIZADOR.github.io/caderneta/`.

## 3. Autenticação (Supabase > Authentication > URL Configuration)
- Site URL: o endereço do GitHub Pages acima.
- Redirect URLs: o mesmo endereço.

## 4. Instalar no telemóvel
- Android (Chrome): abre o endereço > menu ⋮ > Instalar app (ou botão Instalar na aba Revisões > Conta).
- iPhone (Safari): botão Partilhar > Adicionar ao ecrã principal.

## 5. Primeiro uso
1. Abre a app, escreve email e password (mín. 8) e carrega em Criar conta. Confirma o email e entra.
2. Na aba Pie carrega em "Carregar dados iniciais".
3. Depois de criares a tua conta: Supabase > Authentication > Sign In / Providers > desativa "Allow new users to sign up".

## 6. Sincronizar com a Trading 212 (opcional, só leitura)
A app nunca guarda a chave da Trading 212: ela vive como segredo na Edge Function `t212-sync` (`supabase/functions/t212-sync/index.ts`), que só lê a pie e devolve os valores. Quem grava na base de dados é a app, com o teu login.

1. Trading 212 > Definições > API: cria uma chave só com permissões de leitura (sem ordens). A Trading 212 dá-te uma chave e um segredo.
2. Supabase > Edge Functions > Secrets: cria `T212_API_KEY` e `T212_API_SECRET`. Opcionais: `T212_PIE_ID`, `T212_PIE_NAME`.
3. Publica a função (`supabase functions deploy t212-sync --project-ref epywsjqmfzklpfvhhycn`) ou cola o ficheiro no editor de Edge Functions.
4. Na aba Pie, "Sincronizar com a Trading 212" mostra os valores para confirmares antes de atualizar.

A API de Pies da Trading 212 está marcada como obsoleta (continua a funcionar, mas sem novas atualizações). Se deixar de funcionar, a atualização manual continua disponível.

## 7. Radar (BCE + fichas dos ETFs)
Separador só de leitura. Não recomenda comprar nem vender.
1. SQL: corre `supabase/schema.sql` (cria `cf_radar_refs`) e depois `supabase/radar_seed.sql` (fichas iniciais de VWCE e XEON).
2. Publica a Edge Function `radar-ecb` (`supabase/functions/radar-ecb/index.ts`). Não precisa de segredos: lê a API aberta do BCE.
3. Na aba Radar, "Atualizar" lê o €STR, as taxas do BCE, a dívida AAA da zona euro e a inflação.
4. As fichas (justETF, Trackinsight) guardam a data e a ligação da fonte. Em conflito vale a factsheet do emissor.

A chave em `config.js` é a chave pública (anon). É seguro estar no GitHub: os dados estão protegidos pelo login e pelas regras RLS.
