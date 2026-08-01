#!/usr/bin/env bash
#
# Sonde de la demonstration publique, de bout en bout.
#
# Ce qu'elle verifie, dans l'ordre ou un visiteur le rencontre : la page
# repond, le paquet servi porte bien un point d'acces, ce point d'acces repond,
# et le coffre s'y lit. Un maillon casse arrete la sonde avec un code non nul.
#
# ELLE NE PORTE AUCUN SECRET, et ce n'est pas un oubli. L'URL du point d'acces
# est dans le paquet servi, parce qu'un export statique n'a pas de serveur pour
# la cacher : la sonde la lit exactement comme le navigateur d'un visiteur. Ce
# qui protege cette cle est sa restriction au domaine d'origine, d'ou l'en-tete
# `Origin` ci-dessous, sans lequel le fournisseur refuserait.
#
# Usage : scripts/veille-demonstration.sh [url]
set -uo pipefail

SITE="${1:-https://solana.for-yield.com}"
COFFRE="SWmEZGD1QjPZZqPXBkRfVsmbZpTEd18uJ3RgMEJCwVW"

echec() { echo "ECHEC : $*" >&2; exit 1; }

# 1. La page repond, et c'est bien la notre.
page=$(curl -sS --max-time 20 -w '\n%{http_code}' "$SITE") || echec "la page est injoignable"
code=$(printf '%s' "$page" | tail -1)
[ "$code" = "200" ] || echec "la page rend $code"
printf '%s' "$page" | grep -q "ForYield" || echec "la page repond mais ne porte pas notre contenu"
echo "page : 200"

# 2. Le point d'acces, lu dans le paquet servi.
#
# Les identifiants de morceaux et leurs empreintes changent a chaque
# construction : on lit la table du runtime webpack plutot que de figer un nom
# de fichier, qui serait faux au deploiement suivant.
runtime=$(printf '%s' "$page" | grep -oE '/_next/static/chunks/webpack-[a-f0-9]+\.js' | head -1)
[ -n "$runtime" ] || echec "runtime webpack introuvable dans la page"

rpc=""
for paire in $(curl -sS --max-time 20 "$SITE$runtime" | grep -oE '[0-9]+:"[a-f0-9]{16}"' | tr -d '"'); do
  id="${paire%%:*}"; empreinte="${paire##*:}"
  for nom in "$id.$empreinte.js" "$id-$empreinte.js"; do
    trouve=$(curl -sS --max-time 20 "$SITE/_next/static/chunks/$nom" 2>/dev/null \
      | grep -oE 'https://[a-z0-9.-]+/v2/[A-Za-z0-9_-]+' | head -1)
    [ -n "$trouve" ] && { rpc="$trouve"; break 2; }
  done
done
[ -n "$rpc" ] || echec "aucun point d'acces dedie dans le paquet servi (retour au point d'acces public ?)"
echo "point d'acces : ${rpc%/v2/*}/v2/... (dedie)"

# 3. Le point d'acces repond, et le coffre s'y lit.
reponse=$(curl -sS --max-time 20 -X POST "$rpc" \
  -H "Content-Type: application/json" \
  -H "Origin: $SITE" \
  -H "Referer: $SITE/" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$COFFRE\",{\"encoding\":\"base64\"}]}") \
  || echec "le point d'acces est injoignable"

printf '%s' "$reponse" | grep -q '"error"' && echec "le point d'acces refuse : $(printf '%s' "$reponse" | head -c 200)"
printf '%s' "$reponse" | grep -q '"owner"' || echec "le coffre est illisible : $(printf '%s' "$reponse" | head -c 200)"
echo "coffre : lisible"

echo "OK"
