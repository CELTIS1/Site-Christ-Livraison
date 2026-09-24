/* PARCOURS — « À TRAITER » : UNE LISTE, UN BOUTON « QUE FAIRE ? » (chantier N, lot 13, 25/09/2026)
   ==========================================================================================
   Celtis : « surtout pour la gestion des colis retour et des colis reportés, les membres de mon
   équipe ont du mal à bien utiliser, bien comprendre ».

   Dans un vrai Chromium, sur l'écran du bureau : un colis reporté dont le jour est passé, un
   signalement de cliente et une demande de passage sont dans la même liste que les retours ;
   le bureau remet le reporté à sa journée, prend le signalement en charge, et « Programmer »
   sur la demande ouvre Tournées sur le bon jour, cliente et nombre déjà remplis. Sur téléphone,
   la nuit, rien ne déborde et tout fait 44 px.

   Lancer à la main :  node tests/parcours/a-traiter.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, aujourdhui, ADMIN, LIVREUR, CLIENTE1, CLIENTE2 } from './_monde.mjs';

const monde = nouveauMonde();
const avantHier = (() => { const d = new Date(aujourdhui + 'T12:00:00'); d.setDate(d.getDate() - 2); return d.toISOString().slice(0, 10); })();
const demain = (() => { const d = new Date(aujourdhui + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
const REPORTE = colis(80, { numero: 'CLT-REP-80', statut: 'en_attente', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-4, 8), reporte_au: avantHier, destination: 'Angré 8e tranche', commune_destination: 'Cocody', destinataire_telephone: '0707000080' });
const NON_LIVRE = colis(81, { numero: 'CLT-NL-81', statut: 'non_livre', fournisseur_id: CLIENTE2, livreur_id: LIVREUR, created_at: iso(0, 8), recupere_at: iso(0, 9), non_livre_at: iso(0, 14), motif_non_livraison: 'client_absent', destination: 'Rue 12', commune_destination: 'Yopougon', destinataire_telephone: '0707000081' });
monde.TABLES.colis.push(REPORTE, NON_LIVRE);
monde.TABLES.reclamations_clientes.push({ id: 'rc-1', fournisseur_id: CLIENTE1, colis_id: null, motif: 'montant_faux', texte: 'On m\'a compté 2 000 F', statut: 'ouverte', created_at: iso(-1, 9) });
monde.TABLES.demandes_de_passage.push({ id: 'dp-1', jour: demain, fournisseur_id: CLIENTE2, note: 'Après 14 h', nb_colis: 3, statut: 'en_attente' });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const ligneDe = (sel) => page.locator('#retours-liste .rt-ligne' + sel).first();

titre('1. Une seule liste, cinq genres, le plus urgent en premier');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(1200);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => showEquipeTab('retours'));
await dodo(1000);
verifier('l\'onglet s\'appelle « À traiter »', /À traiter/.test(await texte(page.locator('#clt-toptabs [data-eqtab="retours"]'))));
const vues = page.locator('#section-retours [data-rt-vue]');
// Le monde de base a déjà un non livré : deux non livrés, un reporté, un signalement, une demande.
const nNl = monde.TABLES.colis.filter(c => c.statut === 'non_livre').length, nTout = nNl + 3;
verifier('six vues avec leur compte : Tout · Non livrés · Retours (0) · Reportés 1 · Signalements 1 · Demandes 1', (await vues.count()) === 6 && (await texte(vues.nth(0))) === 'Tout ' + nTout && (await texte(vues.nth(1))) === '⚠️ Non livrés ' + nNl && (await texte(vues.nth(2))) === '↩️ Retours' && /Reportés 1/.test(await texte(vues.nth(3))) && /Signalements 1/.test(await texte(vues.nth(4))) && /Demandes 1/.test(await texte(vues.nth(5))), await texte(page.locator('#section-retours .rt-genres')));
const lignes = page.locator('#retours-liste .rt-ligne');
verifier('une ligne par chose à traiter, chacune avec sa pastille de genre et UN bouton « Que faire ? », aucun geste à nu', (await lignes.count()) === nTout && (await page.locator('#retours-liste .rt-genre').count()) === nTout && (await page.locator('#retours-liste [data-rt-quefaire]').count()) === nTout && (await page.locator('#retours-liste [data-rt-geste]').count()) === 0);
verifier('le reporté dû depuis deux jours et le signalement d\'hier passent avant le non livré du jour', (await lignes.nth(0).getAttribute('data-rt-cle')) === 'reporte:' + REPORTE.id && (await lignes.nth(1).getAttribute('data-rt-cle')) === 'reclam:rc-1', [await lignes.nth(0).getAttribute('data-rt-cle'), await lignes.nth(1).getAttribute('data-rt-cle')].join(' / '));
const lRep = ligneDe('[data-rt-cle="reporte:' + REPORTE.id + '"]');
verifier('la ligne du reporté : « dû depuis 2 jours », l\'adresse, le livreur', /dû depuis 2 jours/.test(await texte(lRep)) && /Cocody/.test(await texte(lRep)) && /Koffi Livreur/.test(await texte(lRep)), await texte(lRep));

titre('2. Le reporté : « Que faire ? » → remettre à sa journée');
await lRep.locator('[data-rt-quefaire]').click();
await dodo(400);
verifier('deux issues, expliquées : remettre à sa journée, changer le jour', (await lRep.locator('.rt-choix [data-rt-remettre]').count()) === 1 && (await lRep.locator('.rt-choix [data-rt-changer-jour]').count()) === 1 && /revient dans la journée/.test(await texte(lRep.locator('.rt-choix'))), await texte(lRep.locator('.rt-choix')));
await lRep.locator('[data-rt-changer-jour]').click();
await dodo(300);
verifier('« Changer le jour » déplie un champ date, demain par défaut', (await lRep.locator('.rt-jour-input').inputValue()) === demain);
await lRep.locator('[data-rt-reprog-annuler]').click();
await dodo(300);
await lRep.locator('[data-rt-remettre]').click();
await dodo(300);
verifier('« Remettre » demande confirmation', /remettre à sa journée/i.test(await texte(page.locator('#clt-modal-title'))), await texte(page.locator('#clt-modal-title')));
await page.locator('#clt-modal-ok').click();
await dodo(1200);
verifier('en base : reporte_au effacé ; la ligne a quitté la liste', REPORTE.reporte_au === null && (await lRep.count()) === 0, JSON.stringify({ r: REPORTE.reporte_au }));

titre('3. Le signalement : pris en charge depuis la même liste');
const lRec = ligneDe('[data-reclam="rc-1"]');
verifier('la ligne du signalement : cliente, motif, ses mots', /Awa Boutique/.test(await texte(lRec)) && /Montant incorrect/.test(await texte(lRec)) && /2 000 F/.test(await texte(lRec)), await texte(lRec));
await lRec.locator('[data-rt-quefaire]').click();
await dodo(400);
await lRec.locator('[data-reclam-geste="en_cours"]').click();
await dodo(1200);
const rc = monde.TABLES.reclamations_clientes.find(r => r.id === 'rc-1');
verifier('en base : en_cours, au nom du bureau ; la ligne le dit', rc.statut === 'en_cours' && rc.traitee_par === ADMIN && /prise en charge/.test(await texte(lRec)), await texte(lRec));

titre('4. La demande de passage : « Programmer » ouvre Tournées, tout rempli');
const lDem = ligneDe('[data-demande="dp-1"]');
verifier('la ligne : cliente, « 3 colis », pour demain, la note', /Mariam Mode/.test(await texte(lDem)) && /3 colis/.test(await texte(lDem)) && /pour demain/.test(await texte(lDem)) && /Après 14 h/.test(await texte(lDem)), await texte(lDem));
await lDem.locator('[data-rt-quefaire]').click();
await dodo(400);
verifier('trois issues : programmer, traitée autrement, refuser (en rouge)', (await lDem.locator('.rt-choix [data-rt-demande="programmer"]').count()) === 1 && (await lDem.locator('.rt-choix [data-rt-demande="traitee"]').count()) === 1 && (await lDem.locator('.rt-choix [data-rt-demande="refusee"].rt-choix-item--danger').count()) === 1);
await lDem.locator('[data-rt-demande="programmer"]').click();
await dodo(1500);
verifier('Tournées est ouvert sur demain, cliente / nombre / note remplis, livreur à choisir', await page.locator('#section-programmation').isVisible() && (await page.locator('#prog-jour').inputValue()) === demain && (await page.locator('#prog-fournisseur').inputValue()) === CLIENTE2 && (await page.locator('#prog-nb-colis').inputValue()) === '3' && (await page.locator('#prog-note').inputValue()) === 'Après 14 h' && (await page.locator('#prog-livreur').inputValue()) === '', [await page.locator('#prog-jour').inputValue(), await page.locator('#prog-fournisseur').inputValue(), await page.locator('#prog-nb-colis').inputValue()].join(' / '));

titre('5. Le non livré : trois issues, puis « le livreur le rapporte »');
await page.evaluate(() => showEquipeTab('retours'));
await dodo(800);
const lNl = ligneDe('[data-rt-id="' + NON_LIVRE.id + '"]');
await lNl.locator('[data-rt-quefaire]').click();
await dodo(400);
verifier('réessayer, le rapporter, appeler (0707000081)', (await lNl.locator('.rt-choix [data-rt-reprog]').count()) === 1 && (await lNl.locator('.rt-choix [data-rt-geste="vers_retour"]').count()) === 1 && (await lNl.locator('.rt-choix a[href="tel:0707000081"]').count()) === 1);
await lNl.locator('[data-rt-geste="vers_retour"]').click();
await dodo(300);
await page.locator('#clt-modal-ok').click();
await dodo(1200);
verifier('en base : statut retour ; la ligne passe dans « Retours » avec son détenteur', NON_LIVRE.statut === 'retour' && /Retours 1/.test(await texte(vues.nth(2))), await texte(vues.nth(2)));

titre('6. Sur téléphone, la nuit');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await dodo(600);
if ((await lNl.locator('.rt-choix').count()) === 0) { await lNl.locator('[data-rt-quefaire]').click(); await dodo(400); }
const mesures = await page.evaluate(() => {
  const l = document.querySelector('#retours-liste .rt-ligne--ouverte');
  const choix = [...l.querySelectorAll('.rt-choix-item')].map(b => Math.round(b.getBoundingClientRect().height));
  const q = l.querySelector('[data-rt-quefaire]').getBoundingClientRect();
  const vues = [...document.querySelectorAll('#section-retours [data-rt-vue]')].map(b => Math.round(b.getBoundingClientRect().height));
  const cs = getComputedStyle(l.querySelector('.rt-choix-lib'));
  return { deborde: document.documentElement.scrollWidth > window.innerWidth, choix, q: Math.round(q.height), vues, lib: cs.color };
});
verifier('rien ne déborde ; « Que faire ? » ≥ 44 px ; chaque issue ≥ 52 px ; les vues ≥ 44 px', !mesures.deborde && mesures.q >= 44 && mesures.choix.every(h => h >= 52) && mesures.vues.every(h => h >= 44), JSON.stringify(mesures));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
