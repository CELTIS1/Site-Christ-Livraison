# Edge Functions — CLT Express

Ces deux fonctions ne sont pas déployées automatiquement (le déploiement se
fait depuis le tableau de bord Supabase, comme pour les fonctions existantes
`inscrire-fournisseur` et `demander-reset-password`).

## À faire dans Supabase (une fois par fonction)

1. Exécuter d'abord `supabase_express.sql` (à la racine du site) dans
   **Supabase > SQL Editor**, si ce n'est pas déjà fait — les fonctions en
   dépendent (table `express_courses`, colonnes ajoutées à `profiles`, bucket
   `express-kyc`).
2. Aller dans **Supabase > Edge Functions > Create a new function**.
3. Nom de la fonction : `inscrire-client-express` (pour le premier dossier)
   ou `inscrire-coursier-express` (pour le second) — le nom doit être exact,
   c'est lui que le site appelle.
4. Coller le contenu de `index.ts` du dossier correspondant, puis **Deploy**.
5. Vérifier que les variables d'environnement `SUPABASE_URL` et
   `SUPABASE_SERVICE_ROLE_KEY` sont bien disponibles pour la fonction (elles
   le sont généralement par défaut sur tous les projets Supabase, comme pour
   les fonctions déjà en place).

## Ce que fait chaque fonction

- **creer-client** *(août 2026)* : crée un compte **client** depuis le tableau de
  bord Équipe, avec un mot de passe choisi par l'équipe, actif immédiatement
  (`status = 'valide'`). En base, le rôle écrit est `fournisseur` — c'est le même
  objet que le « client » affiché dans l'interface, voir le commentaire en tête du
  fichier. Seule une personne connectée en `equipe` ou `admin` peut l'appeler : la
  fonction relit le rôle de l'appelant en base avant d'accepter.
  À ne pas confondre avec `inscrire-fournisseur`, qui sert à l'inscription depuis
  la page de connexion et laisse le compte `en_attente` de validation.
- **inscrire-client-express** : crée un compte grand public `client_express`,
  validé automatiquement (peut commander une livraison dès l'inscription).
- **inscrire-coursier-express** : crée un compte `coursier_express`, avec la
  pièce d'identité envoyée en photo, et le statut `en_attente` — il apparaît
  ensuite dans le panneau "Comptes en attente" du tableau de bord équipe,
  exactement comme les inscriptions clients/fournisseurs actuelles.
