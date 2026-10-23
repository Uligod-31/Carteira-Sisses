#!/bin/sh
# Falha se ficheiros da app mudaram sem subir o número em version.js. Correr antes de cada commit/push.
# Uso: sh scripts/verificar-versao.sh
cd "$(dirname "$0")/.." || exit 1
base=$(git rev-parse origin/main 2>/dev/null || git rev-parse HEAD)
mudou=$(git diff --name-only "$base" -- app.js index.html styles.css sw.js config.js manifest.webmanifest vendor icons fonts supabase/functions; git ls-files --others --exclude-standard -- app.js index.html styles.css sw.js config.js)
[ -z "$mudou" ] && { echo "Sem alterações à app. OK."; exit 0; }
atual=$(sed -n 's/.*v: *\([0-9][0-9]*\).*/\1/p' version.js | head -1)
antes=$(git show "$base:version.js" 2>/dev/null | sed -n 's/.*v: *\([0-9][0-9]*\).*/\1/p' | head -1)
[ -z "$antes" ] && antes=0
if [ "$atual" -le "$antes" ]; then
  echo "ERRO: a app mudou mas a versão continua v$atual. Sobe version.js (v, data, nota) antes de publicar."; echo "$mudou"; exit 1
fi
grep -q 'CADERNETA_VERSION.v' sw.js || { echo "ERRO: sw.js já não usa version.js."; exit 1; }
echo "OK: versão v$antes -> v$atual"
