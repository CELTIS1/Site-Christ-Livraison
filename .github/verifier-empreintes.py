#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contrôle des ressources chargées depuis l'extérieur du site.

POURQUOI CE FICHIER EXISTE
--------------------------
Les pages du site chargent quelques bibliothèques depuis des serveurs qui ne nous
appartiennent pas (cdnjs, jsDelivr, unpkg). Chacune est déclarée avec une version exacte
et une « empreinte de contrôle » (attribut integrity, dit SRI) : le navigateur recalcule
l'empreinte du fichier reçu et refuse de l'exécuter si elle ne correspond pas.

Cela protège d'un serveur compromis, mais introduit un piège : le jour où quelqu'un monte
une version sans recalculer l'empreinte, les pages concernées cessent de fonctionner d'un
coup, sans message compréhensible. Ce fichier est là pour attraper cette erreur avant
qu'elle n'atteigne le site.

CE QU'IL VÉRIFIE
----------------
 1. Toute ressource externe porte une empreinte et l'attribut crossorigin.
    Sans crossorigin, l'empreinte est purement décorative : le navigateur l'ignore.
 2. Aucune adresse ne contient de plage de versions (^, ~, @2, /latest/), qui laisserait
    le contenu changer d'un jour à l'autre sans décision de notre part.
 3. Les adresses pré-chargées par le service worker (sw.js) sont bien celles des pages.
    Sinon le mode hors-ligne garderait une version morte.
 4. L'empreinte déclarée correspond au fichier réellement servi aujourd'hui.
    Ce contrôle-là a besoin du réseau ; s'il est indisponible, il avertit sans faire échouer.

USAGE
-----
    python3 .github/verifier-empreintes.py            # tout
    python3 .github/verifier-empreintes.py --hors-ligne   # sans le point 4

Code de sortie 0 si tout va bien, 1 sinon.
"""

import base64
import hashlib
import os
import re
import sys
import urllib.error
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Ressources externes dont on accepte sciemment qu'elles n'aient pas d'empreinte,
# avec la raison. Toute autre exception doit être ajoutée ici, explicitement.
DISPENSES = {
    "fonts.googleapis.com":
        "Google Fonts renvoie une feuille de style différente selon le navigateur "
        "(formats de police négociés). Aucune empreinte fixe n'est possible : elle "
        "casserait le site sur une partie des appareils. Le contenu servi se limite "
        "à des déclarations @font-face.",
    "fonts.gstatic.com":
        "Serveur de fichiers de police appelé par la feuille de style Google Fonts ; "
        "jamais référencé directement par une balise du site.",
}

PLAGES = [
    (re.compile(r"@\^"), "plage « ^ » (n'importe quelle version compatible)"),
    (re.compile(r"@~"), "plage « ~ » (n'importe quel correctif)"),
    (re.compile(r"@\d+/"), "numéro majeur seul suivi d'un chemin (ex. @2/dist/…), donc plage"),
    (re.compile(r"@\d+$"), "numéro majeur seul en fin d'adresse (ex. …supabase-js@2), donc plage"),
    (re.compile(r"@\d+\.\d+/"), "numéro majeur.mineur (ex. @2.112/), donc plage de correctifs"),
    (re.compile(r"/latest/"), "« latest » : contenu changeant sans préavis"),
]

BALISE = re.compile(
    r"<(script|link)\b(?P<attrs>[^>]*?)>",
    re.IGNORECASE | re.DOTALL,
)


def attribut(attrs, nom):
    m = re.search(r'\b%s\s*=\s*"([^"]*)"' % nom, attrs, re.IGNORECASE)
    if m:
        return m.group(1)
    return "présent" if re.search(r"\b%s\b" % nom, attrs, re.IGNORECASE) else None


def dispensee(url):
    for domaine, raison in DISPENSES.items():
        if domaine in url:
            return raison
    return None


def relever_pages():
    """Renvoie [(fichier, balise, url, empreinte, crossorigin)] pour tout ce qui vient de l'extérieur."""
    trouvees = []
    for dossier, sous, fichiers in os.walk(RACINE):
        sous[:] = [d for d in sous if d not in (".git", "node_modules")]
        for nom in sorted(fichiers):
            if not nom.endswith(".html"):
                continue
            chemin = os.path.join(dossier, nom)
            rel = os.path.relpath(chemin, RACINE)
            txt = open(chemin, encoding="utf-8").read()
            for m in BALISE.finditer(txt):
                attrs = m.group("attrs")
                url = attribut(attrs, "src") or attribut(attrs, "href")
                if not url or not url.startswith("http"):
                    continue
                if m.group(1).lower() == "link":
                    rel_attr = (attribut(attrs, "rel") or "").lower()
                    if rel_attr not in ("stylesheet", "preload", "modulepreload"):
                        continue  # preconnect, dns-prefetch, icon : rien n'est exécuté
                trouvees.append((rel, m.group(1).lower(), url,
                                 attribut(attrs, "integrity"),
                                 attribut(attrs, "crossorigin")))
    return trouvees


def urls_du_service_worker():
    chemin = os.path.join(RACINE, "sw.js")
    if not os.path.exists(chemin):
        return []
    txt = open(chemin, encoding="utf-8").read()
    bloc = re.search(r"PRECACHE_CDN\s*=\s*\[(.*?)\]", txt, re.DOTALL)
    if not bloc:
        return []
    return re.findall(r"['\"](https://[^'\"]+)['\"]", bloc.group(1))


def empreinte_reelle(url, algo):
    req = urllib.request.Request(url, headers={"User-Agent": "verif-empreintes-CLT"})
    with urllib.request.urlopen(req, timeout=45) as r:
        contenu = r.read()
    h = {"sha256": hashlib.sha256, "sha384": hashlib.sha384, "sha512": hashlib.sha512}[algo]
    return "%s-%s" % (algo, base64.b64encode(h(contenu).digest()).decode()), len(contenu)


def main():
    hors_ligne = "--hors-ligne" in sys.argv
    erreurs, avertissements, ok = [], [], 0

    balises = relever_pages()
    if not balises:
        erreurs.append("Aucune ressource externe trouvée : le contrôle ne sert plus à rien, "
                       "ou le chemin des pages a changé.")

    # ---- 1 et 2 : structure, sans réseau -------------------------------------
    declarees = {}
    for fichier, typ, url, emp, cross in balises:
        raison = dispensee(url)
        if raison:
            ok += 1
            continue

        if not emp:
            erreurs.append("%s : %s « %s » n'a aucune empreinte de contrôle.\n"
                           "    Un serveur compromis pourrait y placer n'importe quel code.\n"
                           "    Ajouter integrity=\"sha384-…\" et crossorigin=\"anonymous\", ou "
                           "inscrire une dispense motivée dans DISPENSES." % (fichier, typ, url))
            continue
        if not cross:
            erreurs.append("%s : « %s » porte une empreinte mais pas crossorigin.\n"
                           "    Sans crossorigin, le navigateur ignore purement et simplement "
                           "l'empreinte : la protection est fictive." % (fichier, url))
            continue

        for motif, libelle in PLAGES:
            if motif.search(url):
                erreurs.append("%s : « %s » utilise une %s.\n"
                               "    Le contenu peut changer sans décision de notre part, ce qui "
                               "rend l'empreinte caduque du jour au lendemain." % (fichier, url, libelle))
                break
        else:
            ok += 1
            declarees.setdefault(url, set()).add(emp)

    for url, emps in declarees.items():
        if len(emps) > 1:
            erreurs.append("« %s » est déclarée avec %d empreintes différentes selon les pages.\n"
                           "    Une seule peut être juste ; les autres pages sont cassées." % (url, len(emps)))

    # ---- 3 : cohérence avec le service worker --------------------------------
    for url in urls_du_service_worker():
        if dispensee(url):
            continue
        if url not in declarees:
            erreurs.append("sw.js pré-charge « %s », qu'aucune page ne demande.\n"
                           "    C'est la trace d'une montée de version faite dans les pages mais "
                           "oubliée dans sw.js : le mode hors-ligne garderait une version morte." % url)
        else:
            ok += 1

    # ---- 4 : l'empreinte correspond-elle au fichier réellement servi ? -------
    if not hors_ligne:
        for url, emps in sorted(declarees.items()):
            attendue = list(emps)[0]
            algo = attendue.split("-", 1)[0]
            try:
                reelle, taille = empreinte_reelle(url, algo)
            except (urllib.error.URLError, OSError, TimeoutError) as e:
                avertissements.append("« %s » n'a pas pu être téléchargée (%s).\n"
                                      "    Contrôle du contenu non concluant — probablement le réseau, "
                                      "pas le site." % (url, e))
                continue
            if reelle != attendue:
                erreurs.append("« %s » : le fichier servi ne correspond PLUS à l'empreinte déclarée.\n"
                               "    déclarée : %s\n    servie   : %s  (%d octets)\n"
                               "    Soit la version a été montée sans recalculer l'empreinte — et les "
                               "pages concernées sont cassées —, soit le contenu du serveur a changé, "
                               "ce qui serait beaucoup plus grave." % (url, attendue, reelle, taille))
            else:
                ok += 1

    # ---- verdict -------------------------------------------------------------
    print("Ressources externes examinées : %d" % len(balises))
    print("Contrôles réussis : %d" % ok)
    for a in avertissements:
        print("\nAVERTISSEMENT — %s" % a)
    for e in erreurs:
        print("\nERREUR — %s" % e)
    if erreurs:
        print("\n%d problème(s). Rien ne doit être publié en l'état." % len(erreurs))
        return 1
    print("\nTout est conforme%s." % (" (contrôle du contenu non effectué)" if hors_ligne else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
