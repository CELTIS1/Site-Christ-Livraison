/* PARCOURS — LES NUMÉROS ÉTRANGERS (21 septembre 2026)
   ==========================================================================================
   Celtis : « nous avons des clients qui ont des numéros américains, canadiens, français, burkinabés —
   souvent leurs numéros WhatsApp. Quand on les enregistre, on ne peut pas leur envoyer de message. »

   Dans les VRAIS écrans, avec un destinataire au Canada, un en France, et une cliente dont le compte porte
   l'ancien défaut (« 225 » posé devant son numéro américain) :
     1. le livreur lit « +1 416 555 1234 », l'appelle avec le « + », et son WhatsApp ouvre le bon numéro ;
     2. un destinataire ivoirien : rien n'a changé ;
     3. le bureau envoie le point de la cliente au bon numéro, malgré l'ancien défaut ;
     4. la saisie accepte un numéro étranger écrit avec son indicatif, refuse ce qu'on ne peut pas deviner.

   Lancer à la main :  node tests/parcours/les-numeros-etrangers.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, LIVREUR, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
monde.TABLES.colis.length = 0;
monde.TABLES.colis.push(
  colis(701, { numero: 'CLT-CANADA-701', statut: 'en_livraison', created_at: iso(0, 8), recupere_at: iso(0, 9), en_livraison_at: iso(0, 10), fournisseur_id: CLIENTE1, livreur_id: LIVREUR, destinataire_telephone: '+14165551234' }),
  colis(702, { numero: 'CLT-FRANCE-702', statut: 'en_livraison', created_at: iso(0, 8), recupere_at: iso(0, 9), en_livraison_at: iso(0, 10), fournisseur_id: CLIENTE1, livreur_id: LIVREUR, destinataire_telephone: '0033 6 12 34 56 78' }),
  colis(703, { numero: 'CLT-ABIDJAN-703', statut: 'en_livraison', created_at: iso(0, 8), recupere_at: iso(0, 9), en_livraison_at: iso(0, 10), fournisseur_id: CLIENTE1, livreur_id: LIVREUR, destinataire_telephone: '0701020304' }),
);
monde.PROFILS.find((p) => p.id === CLIENTE1).phone = '22519055551211';   // l'ancien défaut, tel que mesuré en base

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;

titre('1. Chez le livreur : un destinataire au Canada, un en France');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(2500);
const liens = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('.colis-item').forEach((it) => {
    const num = (it.textContent.match(/CLT-[A-Z]+-\d+/) || [''])[0];
    if (!num) return;
    const tel = it.querySelector('a[href^="tel:"].colis-tel, a.colis-tel');
    out[num] = { tel: tel ? tel.getAttribute('href') : '', texte: tel ? tel.textContent.replace(/\s+/g, ' ').trim() : '' };
  });
  return out;
});
verifier('Canada : il lit « +1 416 555 1234 » et l\'appelle AVEC le « + »', liens['CLT-CANADA-701'] && liens['CLT-CANADA-701'].tel === 'tel:+14165551234' && /\+1 416 555 1234/.test(liens['CLT-CANADA-701'].texte), JSON.stringify(liens));
verifier('France, saisi « 0033 6 12… » : « +33 6 12 34 56 78 »', liens['CLT-FRANCE-702'] && liens['CLT-FRANCE-702'].tel === 'tel:+33612345678' && /\+33 6 12 34 56 78/.test(liens['CLT-FRANCE-702'].texte), JSON.stringify(liens['CLT-FRANCE-702']));
const wa = await page.evaluate(() => ({ canada: numeroInternational('+14165551234'), france: numeroInternational('0033 6 12 34 56 78'), abidjan: numeroInternational('0701020304'), vieux: numeroInternational('2250701020304') }));
verifier('son WhatsApp ouvre le bon numéro : 1416…, 33612…', wa.canada === '14165551234' && wa.france === '33612345678', JSON.stringify(wa));

titre('2. Un destinataire ivoirien : rien n\'a changé');
verifier('« 07 01 02 03 04 » à l\'écran, composé comme avant, WhatsApp en 225 + dix chiffres', liens['CLT-ABIDJAN-703'] && liens['CLT-ABIDJAN-703'].tel === 'tel:0701020304' && /07 01 02 03 04/.test(liens['CLT-ABIDJAN-703'].texte) && wa.abidjan === '2250701020304' && wa.vieux === '2250701020304', JSON.stringify(liens['CLT-ABIDJAN-703']));

titre('3. Le bureau : le point de la cliente part au bon numéro, malgré l\'ancien défaut « 225 » devant');
await N.ouvrirConnecte('equipe.html', ADMIN);
await page.evaluate(() => showEquipeTab('suivi'));
await dodo(2500);
await page.evaluate(() => { const c = document.getElementById('recap-fournisseur'); if (c && !c.classList.contains('open') && typeof toggleRecap === 'function') toggleRecap(); });
await dodo(2500);
await page.locator('#recap-body .recap-client-card').first().click();
await dodo(1500);
await page.locator('#releve-message').click();
await dodo(600);
const parti = await page.evaluate(() => window.__cltOuverts[window.__cltOuverts.length - 1] || '');
verifier('« Message seul » ouvre wa.me/1905… — plus « 2251905… », qui n\'existe nulle part', parti.indexOf('https://wa.me/19055551211?text=') === 0, parti.slice(0, 60));

titre('4. La saisie : on accepte ce qui est écrit avec son indicatif, on ne devine jamais un pays');
const controle = await page.evaluate(() => {
  const ligne = (tel) => ({ description: 'Robe', commune: 'Cocody', destination: 'Rue 12', telephone: tel, montantArticle: '5000', montantLivraison: '1500' });
  const essai = (tel) => { const r = verifierLotAvantEnvoi([ligne(tel)], { telephoneObligatoire: true }); return { ok: r.problemes.length === 0, motif: (r.problemes[0] || {}).motif || '' }; };
  return { canada: essai('+1 416 555 1234'), burkina: essai('00226 70 12 34 56'), ivoirien: essai('07 01 02 03 04'), sansIndicatif: essai('4165551234'), francaisLocal: essai('06 12 34 56 78'),
    range: { canada: cleTelCarnet('+1 416 555 1234'), ivoirien: cleTelCarnet('+225 07 01 02 03 04') } };
});
verifier('+1 416 555 1234 et 00226 70 12 34 56 : acceptés', controle.canada.ok && controle.burkina.ok, JSON.stringify(controle));
verifier('07 01 02 03 04 : accepté, comme toujours', controle.ivoirien.ok);
verifier('un numéro américain SANS « +1 », un « 06 » français : refusés, et le message dit quoi écrire', !controle.sansIndicatif.ok && !controle.francaisLocal.ok && /indicatif du pays/.test(controle.sansIndicatif.motif), JSON.stringify(controle.sansIndicatif));
verifier('rangé : l\'étranger garde son « + », l\'ivoirien ses dix chiffres', controle.range.canada === '+14165551234' && controle.range.ivoirien === '0701020304', JSON.stringify(controle.range));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
