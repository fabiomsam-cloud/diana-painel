#!/bin/zsh
# Deploy do Diana · Central de Comando → GitHub Pages
# 1º uso: cria o repo e publica. Usos seguintes: só atualiza.
set -e
cd "$(dirname "$0")"

# cria o repo no 1º uso (ignora erro se já existir) e sobe o main
gh repo create fabiomsam-cloud/diana-painel --public \
  --description "Diana · Central de Comando — acompanhamento de alunos das mentorias Grupo SOU" \
  2>/dev/null || true
git push -u origin main

# build + publica no branch gh-pages
npm run build
npx gh-pages -d dist

echo ""
echo "✅ Painel publicado: https://fabiomsam-cloud.github.io/diana-painel/"
echo "   (1ª publicação pode levar ~2 min para o Pages ativar)"
