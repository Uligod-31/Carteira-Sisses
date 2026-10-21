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
2. Na aba Carteira carrega em "Carregar dados iniciais".
3. Depois de criares a tua conta: Supabase > Authentication > Sign In / Providers > desativa "Allow new users to sign up".

A chave em `config.js` é a chave pública (anon). É seguro estar no GitHub: os dados estão protegidos pelo login e pelas regras RLS.
