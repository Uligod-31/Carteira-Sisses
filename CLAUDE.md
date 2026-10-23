# Caderneta · regras para quem altera este repositório

## Versão da app (obrigatório)
- A versão vive só em `version.js` (`v` = número inteiro, `data`, `nota`). O service worker usa-a no nome da cache e a app mostra-a no cabeçalho, no ecrã de entrada e em Revisões > Conta (com o botão "Procurar atualização").
- Qualquer alteração a `app.js`, `index.html`, `styles.css`, `sw.js`, `config.js`, ícones ou fontes obriga a subir `v` em +1, atualizar `data` e `nota`.
- Antes de publicar: `sh scripts/verificar-versao.sh` (tem de dar OK).
- Ao dizer ao Ulisses que publicaste, indica sempre a versão ("v7") para ele conferir no telemóvel. Se a versão no ecrã for menor, ele toca em "Procurar atualização" ou recarrega duas vezes.
- Alterações só no backend (SQL, Edge Functions) não mudam a app, mas regista a versão da função no histórico do projeto.
- Registar a nova versão em `claude/historico-alteracoes.md` e `claude/projeto-estado.md` (projeto Invest'Sisses).
