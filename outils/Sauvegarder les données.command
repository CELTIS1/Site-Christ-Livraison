#!/bin/bash
# Sauvegarde les données de CLT dans le Drive. Double-cliquez ce fichier.
#
# POURQUOI (17/09/2026, point 6.5 de la feuille de route)
# Il n'existait aucune copie des données en dehors de Supabase. Si le projet disparaissait —
# fausse manœuvre, compte fermé, incident chez l'hébergeur — la société perdait ses colis, ses
# clientes, sa comptabilité et sa paie, sans recours.
#
# Ce que ça fait : ça lit toutes les tables et écrit une copie datée dans le Drive, puis ça RELIT
# ce qui vient d'être écrit et compare avec ce que la base annonce. S'il manque quoi que ce soit,
# ça le dit en clair plutôt que d'afficher « terminé ».
#
# Ça ne modifie RIEN dans la base, et ça n'efface aucune ancienne sauvegarde.

set -u

DOSSIER="$(cd "$(dirname "$0")/.." && pwd)"
DEPOT="$DOSSIER/Site web (connecté à GitHub)"
SCRIPT="$DEPOT/outils/sauvegarde-des-donnees.py"

# Le Drive, tel qu'il est monté sur ce Mac. On prend le premier qui répond.
for D in "$HOME/Library/CloudStorage/GoogleDrive-celtisadje@gmail.com/Mon Drive/Christ Livraison & Transport SARL" \
         "$HOME/Google Drive/Mon Drive/Christ Livraison & Transport SARL"; do
  [ -d "$D" ] && DRIVE="$D" && break
done
DEST="${DRIVE:-}/08 - Application & Technique/Sauvegardes"

echo ""
echo "==============================================="
echo "  Sauvegarder les données de CLT"
echo "==============================================="
echo ""

if [ ! -f "$SCRIPT" ]; then
  echo "❌ Script introuvable : $SCRIPT"
  echo "   Appliquez d'abord la mise à jour de Claude."
  echo ""; read -r -p "Entrée pour fermer. " _; exit 1
fi
if [ -z "${DRIVE:-}" ]; then
  echo "❌ Le Drive n'est pas monté sur ce Mac."
  echo "   Ouvrez Google Drive, attendez qu'il se synchronise, puis relancez."
  echo ""; read -r -p "Entrée pour fermer. " _; exit 1
fi

mkdir -p "$DEST"
python3 "$SCRIPT" "$DEST"
CODE=$?

echo ""
if [ $CODE -eq 0 ]; then
  echo "📁 La copie est dans : Drive › 08 - Application & Technique › Sauvegardes"
  echo "   Google Drive va la synchroniser : elle ne dépend plus de ce Mac."
elif [ $CODE -eq 2 ]; then
  echo "   (Rien n'a été sauvegardé : la clé n'est pas encore installée — voir ci-dessus.)"
else
  echo "⚠️  La sauvegarde n'est pas complète. Montrez ce message à Claude."
fi

echo ""
read -r -p "Appuyez sur Entrée pour fermer cette fenêtre. " _
