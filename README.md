# RaceLab v2.0 Pro Edition

Analyse de chronos simracing dans le navigateur : React, TypeScript, Vite, Tailwind CSS, Recharts et Lucide. Sessions stockées sur l’appareil, sans compte ni service de télémétrie. Site : **https://boubiprime.github.io/Number1/**. L’analyse IA facultative utilise un backend séparé ; toutes les autres fonctions restent autonomes.

## Fonctionnalités

- Dashboard : sessions, tours, records séparés par circuit/configuration, dernière session et indicateur de progression à voiture et jeu identiques.
- Sessions : création, consultation, modification, suppression confirmée, historique avec recherche, filtres et pagination de 50 sessions.
- Tours : chronos manuels, édition, suppression, validité et écarts au meilleur. Formats `1:37.317` ou `97.317` avec trois décimales ; calculs en millisecondes entières.
- Graphiques interactifs : chronos exacts, écarts, marqueurs invalides rouges, meilleurs tours verts et plage ajustable au-delà de 60 tours. Tous les tours restent enregistrés.
- Consistency Analysis : moyenne, amplitude, écart-type de population, pourcentage de validité et évolution descriptive du rythme.
- Sector Analysis : S1/S2/S3 facultatifs, meilleurs secteurs, tour idéal théorique et tableau détaillé.
- Driver Progress : meilleurs chronos, moyennes, régularité, gain en secondes et pourcentage ; filtres par configuration de circuit, voiture et jeu.
- Comparaison avancée : deux sessions compatibles, deux courbes, tableau tour par tour, secteurs, idéal et écarts de performance. Les différences de contexte et les conditions inconnues sont signalées.
- Personal Records : référence valide par circuit/configuration, voiture, jeu, date et session source.
- Import/export JSON, import CSV prévisualisé et protection contre les conflits entre onglets.
- Analyse IA : sélection d’une session, performance descriptive, régularité /100, priorité, résumé de trois phrases et trois conseils. Déclenchement sur clic uniquement, relance explicite, états de chargement/erreur et mode non configuré.

Les démos sont fictives, signalées et supprimables avec confirmation. Les données personnelles ne sont jamais ajoutées au code public. Aucune vitesse, trajectoire, pression de pneus ou mesure de freinage n’est inventée.

## Activer l’Analyse IA — sans installation sur votre ordinateur

Le site reste sur **GitHub Pages**. Seule l’IA nécessite un petit service **Cloudflare Workers**, car GitHub Pages ne peut pas garder une clé secrète côté serveur. L’API OpenAI est facturée séparément de ChatGPT ; un abonnement ChatGPT ne fournit pas de crédit API.

Après validation et publication de cette modification :

1. Dans **Cloudflare → Workers & Pages → Create → Import a repository**, connecter le dépôt GitHub `BoubiPrime/Number1`. Créer le Worker `racelab-ai`. Garder la racine du dépôt, laisser la commande de build vide et utiliser la commande de déploiement `npm run api:deploy`. Cloudflare installe les dépendances du dépôt. Le fichier `backend/wrangler.jsonc` configure le service et son compteur de quota persistant.
2. Dans **le Worker `racelab-ai` → Settings → Variables and Secrets**, ajouter deux valeurs de type **Secret** : **`OPENAI_API_KEY`** (la clé créée dans votre projet OpenAI) et **`ANALYSIS_ACCESS_CODE`** (un autre code aléatoire de 32 à 128 caractères `A–Z`, `a–z`, `0–9`, `_` ou `-`, généré par un gestionnaire de mots de passe). Enregistrer/déployer cette configuration. **Ne mettre aucune de ces valeurs dans GitHub, dans le code, dans la configuration publique ni dans cette conversation.**
3. Copier l’adresse HTTPS donnée par Cloudflare et lui ajouter `/analyze`, par exemple `https://racelab-ai.votre-compte.workers.dev/analyze`. Cet exemple n’est pas une adresse déjà déployée.
4. Dans GitHub, modifier **`public/ai-config.json` sur la branche source** : remplacer la chaîne vide par cette URL, sans clé ni paramètre. Lors de la publication Pages, ce fichier devient **`ai-config.json` à la racine de `gh-pages`**. Après publication du nouveau frontend, cette URL peut aussi être modifiée directement dans ce fichier de `gh-pages` depuis GitHub ; reporter ensuite le changement dans `public/ai-config.json` pour le conserver au prochain build.
5. Ouvrir RaceLab → **Analyse IA**. Choisir une session avec **au moins 3 tours valides**, saisir **le code d’accès IA**, puis cliquer sur **Analyser avec l’IA**. Le résultat doit afficher la performance, la régularité, la priorité et trois conseils. **La clé OpenAI ne se saisit jamais dans RaceLab.**

Sans URL ou sans secrets serveur, un message « non configurée » apparaît et l’application continue de fonctionner. Le code d’accès reste seulement en mémoire pendant la visite de cette section ; il n’est pas enregistré dans LocalStorage, SessionStorage ou un cookie. Il est envoyé uniquement dans l’en-tête `Authorization` au backend HTTPS. Ce code distinct de la clé OpenAI limite l’usage de l’IA aux personnes à qui vous le donnez.

**Si l’analyse ne démarre pas :** vérifier l’URL `/analyze`, les deux secrets, les crédits et l’accès API du projet OpenAI. `ALLOWED_ORIGIN` est déjà fixé à `https://boubiprime.github.io` (sans `/Number1/`). Un autre domaine doit être explicitement configuré côté serveur. Le backend refuse toute requête sans origine autorisée et sans code correct ; CORS seul n’est pas utilisé comme authentification.

### API vérifiée et interprétation

La référence officielle OpenAI consultée le **23 octobre 2026** documente bien **`POST /v1/decisions`**, les questions `choice`/`predicate` et le modèle **`gpt-6-luna`**. RaceLab utilise cet endpoint pour classer l’exécution, choisir une priorité et noter la pertinence des conseils candidats, **en un seul appel**. Les sources et les limites de vérification sont dans [docs/ai-api-verification.md](docs/ai-api-verification.md).

Si ce modèle/API n’est pas accessible à votre projet OpenAI, définir **`OPENAI_API=responses`** dans les variables du Worker (et reporter ce choix dans `backend/wrangler.jsonc` pour les déploiements suivants). Ce mode utilise **`POST /v1/responses`**, `gpt-4.1-mini`, une sortie JSON structurée stricte, `store: false` et un maximum de 400 tokens de sortie. **Aucun basculement automatique ni appel de secours facturé.** Ne pas inventer un nom de modèle en modifiant le navigateur.

La note de régularité est calculée côté serveur avec les fonctions statistiques existantes : `arrondi(max(0, 100 − 20 × (écart-type / moyenne × 100)))`. Une dispersion relative de 1 % donne 80/100. Ce barème est descriptif, pas une notation officielle du niveau du pilote. Les tours invalides sont exclus des statistiques de temps ; leur proportion reste visible.

La performance est une appréciation IA de l’exécution **au sein de la session sélectionnée**, basée sur la dispersion, l’écart moyen au meilleur tour et la validité. Elle ne mesure pas la compétitivité absolue et ne compare aucun circuit à un autre. Les conseils sont sélectionnés parmi des propositions vérifiées et éligibles aux données ; le résumé est assemblé avec les chiffres calculés et la priorité choisie. Il ne s’agit pas d’un texte libre prétendant disposer de télémétrie. Aucun freinage, virage précis, incident, pneu, carburant ou résultat n’est déduit. Le modèle actuel ne stocke pas de position d’arrivée.

### Données et coût

- Le navigateur transmet uniquement le circuit/configuration, la voiture, le jeu, le type de session, l’indication démo et les chronos/validités/secteurs de la session choisie. Les identifiants, dates, notes/conditions libres, provenance CSV et autres sessions ne sont pas transmis.
- Le serveur valide puis recalcule les agrégats. **OpenAI reçoit uniquement ces statistiques et le contexte utile**, jamais le tableau complet des tours. Les libellés circuit/voiture/jeu sont traités comme des données et non comme des instructions.
- Le backend ne stocke ni sessions ni analyses et ne journalise pas les corps de requête. Seuls les compteurs de quota persistent. Les politiques de traitement et de conservation du fournisseur OpenAI s’appliquent ; l’API Decisions vérifiée n’expose pas de paramètre `store: false`, et le code n’en invente pas.
- **2 appels maximum par minute et 20 par jour UTC pour tout le service**, même sur plusieurs instances serverless. `AI_DAILY_LIMIT` accepte de 1 à 100. Le compteur est atomique et persistant dans un Durable Object SQLite. Une erreur ou un délai dépassé après réservation consomme aussi un appel ; une panne de compteur empêche tout appel payant.
- Aucun appel au chargement ou lors d’un changement de session, aucun retry automatique. **Relancer** consomme un nouvel appel. Annuler l’attente dans le navigateur n’annule pas forcément un appel déjà reçu par OpenAI. Les anciens résultats ne s’affichent pas sur une autre session.
- Limites IA : **2 000 tours, 256 Kio, 160 caractères par libellé, 24 h maximum par chrono**, 25 s de délai fournisseur. Ces limites ne changent ni les données ni les limites des autres fonctions RaceLab. Le serveur refuse les fichiers invalides et les sorties IA inconnues ou incomplètes.
- Les résultats restent en mémoire, avec un petit cache de cinq analyses pour les changements de sélection. Ils sont invalidés quand la session change et disparaissent quand on quitte la section ou recharge la page. Les sessions et exports JSON existants restent inchangés.

### Développement du backend (facultatif)

`.env.example` contient uniquement des noms et des valeurs non secrètes. Pour tester localement le backend, le copier dans **`backend/.dev.vars`**, fichier ignoré par Git, puis y saisir les secrets dans votre environnement privé. Ne jamais créer de variable `VITE_OPENAI_API_KEY` : les variables `VITE_*` sont publiques.

```sh
npm ci
npm run api:dev       # Worker local sur le port 8787 ; sans secrets, renvoie « non configurée »
npm run dev          # frontend, dans un second terminal
npm run typecheck    # frontend ET backend
npm test             # calculs, validation, contrats OpenAI, CORS, authentification, quotas
npm run api:build     # compilation du Worker à blanc, aucune publication
npm run test:worker   # vrai moteur Workers + SQLite, OpenAI simulé et réseau intercepté
npm run build        # frontend GitHub Pages
```

Pour le développement uniquement, `public/ai-config.json` peut contenir `http://127.0.0.1:8787/analyze` et `ALLOWED_ORIGIN` doit correspondre à l’origine Vite choisie (exemple : `http://127.0.0.1:5173`). Les URL HTTP locales sont refusées dans le build de production. Remettre l’URL HTTPS ou la chaîne vide avant publication. Dans le cloud avec répertoire personnel non accessible : utiliser `XDG_CONFIG_HOME=/tmp/racelab-config WRANGLER_SEND_METRICS=false` devant les commandes `api:*`.

**Validation de cette livraison :** les tests OpenAI utilisent des réponses simulées, sans frais. Aucun appel OpenAI réel n’a été exécuté faute de clé ; l’accès effectif de votre projet au modèle reste à vérifier après configuration. Le Worker local a été démarré et le mode sans clé vérifié. La préparation et les tests ne publient pas automatiquement cette fonctionnalité.

Résultats : **84 tests unitaires**, **24 parcours navigateur**, **1 parcours du build sous `/Number1/`** et **4 scénarios dans le moteur Workers avec SQLite** réussis. TypeScript frontend/backend, build frontend et compilation Worker à blanc réussis. Les scénarios Workers vérifient également les appels concurrents, la persistance du quota après redémarrage et le refus des redirections. Une compilation avec deux valeurs sentinelles factices a confirmé qu’aucun secret serveur ni appel direct à OpenAI n’est présent dans les fichiers publics. Aucun lint n’est configuré.

Fichiers de l’ajout IA :

- Interface : `src/AiAnalysis.tsx`, `src/ai/client.ts`, `src/ai/contracts.ts` (créés) ; `src/App.tsx`, `src/styles.css` (modifiés).
- Backend : `backend/worker.ts`, `backend/openai.ts`, `backend/analysis.ts`, `backend/wrangler.jsonc`, `backend/tsconfig.json` (créés).
- Configuration : `public/ai-config.json`, `.env.example` (créés) ; `.gitignore`, `package.json`, `package-lock.json` (modifiés).
- Tests : `src/ai.test.ts`, `backend/worker.test.ts`, `e2e/ai.spec.ts`, `scripts/test-worker.mjs` (créés) ; `deployment-tests/hosting.spec.ts` (modifié).
- Documentation : ce `README.md` (modifié) et `docs/ai-api-verification.md` (créé).

Les fichiers du modèle de sessions et du stockage existants sont inchangés. Aucune migration de données n’est nécessaire.

## Données, compatibilité et secteurs

La clé existante **`racelab.sessions.v1` est conservée**. Les identifiants, tours et champs additionnels restent en place. Aucune migration destructive ni remplacement des données existantes n’est effectué au chargement.

Le modèle ajoute uniquement des champs facultatifs :

- `Session.layout?: string` : configuration (GP, National, tracé 2024…).
- `Lap.sectors?: [number, number, number]` : trois millisecondes entières positives.
- `Lap.csvSource?: string` : provenance utilisée pour détecter un réimport après renumérotation.

Les anciens tours sans secteurs restent pleinement utilisables. Si des secteurs sont saisis, les trois sont requis et **leur somme doit égaler exactement le chrono à 1 ms près de résolution** (aucun écart accepté). Une incohérence est refusée avant l’enregistrement, y compris à l’import.

Les meilleurs secteurs et le tour idéal utilisent exclusivement les tours valides avec trois secteurs cohérents. L’idéal est la somme des meilleurs S1, S2 et S3 observés, sans garantie qu’ils soient réalisables ensemble. L’écart « réel − idéal » peut être négatif lorsque le meilleur tour réel n’a pas de secteurs connus ; il est affiché comme tel, sans modifier les chronos.

## Méthodes de calcul et configurations

Les tours invalides restent dans les graphiques et les tableaux, mais sont exclus de tous les calculs de chronos et de secteurs. Sans tour valide, les statistiques affichent `—`, jamais `NaN`. Avec un seul tour, l’écart-type est zéro.

La progression est calculée entre les premières et dernières sessions contenant un tour valide, dans l’ordre des dates. Gain = premier meilleur − dernier meilleur ; gain relatif = gain / premier meilleur × 100. Positif indique une amélioration. Une session unique donne un écart zéro sans établir une tendance. Les sessions d’une même date sont départagées de façon stable par identifiant : l’heure des runs n’est pas connue.

La comparaison et la progression exigent un même nom de circuit et une même configuration normalisés (casse, accents et espaces). Aucun rapprochement approximatif de variantes n’est réalisé. Une configuration vide constitue un groupe distinct : sa compatibilité réelle n’est pas vérifiée. Les anciennes sessions restent dans ce groupe tant que l’utilisateur ne précise pas leur configuration.

Les filtres voiture/jeu réduisent les biais ; les conditions, pneus, carburant et réglages ne sont pas mesurés. Les écarts sont descriptifs et ne prouvent pas à eux seuls une progression du pilote. À record égal, la session la plus ancienne est retenue, puis son identifiant.

L’évolution du rythme au sein d’une session compare deux blocs valides de taille `min(3, floor(nombre de tours valides / 2))`, sans chevauchement. Les numéros utilisés sont affichés ; le tour central d’un effectif impair peut être omis. Moins de deux tours valides : aucune évolution calculée.

## Sauvegardes JSON

L’export inclut toutes les sessions et tous les tours (invalides, secteurs et démos compris) :

```json
{
  "formatVersion": 2,
  "exportedAt": "2026-10-20T18:00:00.000Z",
  "sessions": []
}
```

Les sauvegardes v1 et v2 sont acceptées. Une version inconnue, des identifiants dupliqués, des dates impossibles ou des chronos/secteurs invalides sont refusés. L’import est un **remplacement confirmé**, jamais une fusion implicite. Réimporter le même fichier ne multiplie pas les sessions. Limite : 10 Mo.

Un import refusé ou une panne de stockage pendant la restauration conserve la collection actuelle. Les données locales illisibles restent intactes jusqu’à un remplacement ou une réinitialisation explicitement confirmés. Les sauvegardes JSON contiennent vos informations en clair : conservez-les comme vos autres fichiers personnels.

## Import CSV réellement pris en charge

CSV **générique UTF-8 avec en-têtes**, séparé par virgule, point-virgule ou tabulation (détection automatique). BOM, guillemets doubles, guillemets échappés et sauts de ligne dans un champ entre guillemets sont pris en charge. Limites : **2 Mo et 10 000 lignes**. L’aperçu affiche jusqu’à 200 lignes, mais toutes sont validées.

Exemple fictif disponible dans l’interface et dans [public/exemple-chronos.csv](public/exemple-chronos.csv) :

```csv
tour;chrono;valide;s1;s2;s3
1;1:37.317;true;30.000;31.000;36.317
2;98.000;true;30.500;31.100;36.400
3;96.890;false;30.100;30.900;35.890
```

1. Créer ou choisir la session de destination, avec ses métadonnées réelles.
2. Choisir le fichier, puis associer les colonnes au chrono et facultativement au numéro, à la validité et aux trois secteurs. Les noms courants sont suggérés ; les autres noms se sélectionnent manuellement.
3. Prévisualiser les chronos, erreurs, validités et doublons potentiels.
4. Corriger le fichier ou confirmer explicitement l’exclusion des lignes en erreur. Les doublons potentiels sont exclus par défaut et peuvent être réinclus explicitement.
5. Confirmer le nombre de tours à ajouter. Aucun tour existant n’est remplacé. Les tours suivent l’ordre du fichier et sont renumérotés à la suite de la session.

Chronos et secteurs utilisent un point décimal et trois chiffres : `97.317`, `1:37.317`, `32.439`. Les nombres bruts en millisecondes, les décimales avec virgule et les exports natifs de jeux ne sont **pas** convertis automatiquement. Les statuts reconnus sont `true/false`, `1/0`, `oui/non`, `yes/no`, `valid/invalid`, `valide/invalide` ; une cellule vide ou une colonne non associée signifie valide.

Avec un numéro source, les réimports identiques sont reconnus même après renumérotation grâce à la provenance. Un numéro répété dans le fichier est une erreur. Sans numéro, même chrono, validité et secteurs indiquent un doublon **potentiel** : deux tours identiques peuvent être légitimes, d’où le choix explicite de les inclure. Aucune compatibilité avec tous les formats d’ACC, iRacing, PMR ou F1 n’est revendiquée.

## Fiabilité entre onglets

La v2 vérifie la version locale avant chaque écriture et réagit aux changements `storage` et au retour de focus. Les écritures sont sérialisées avec **Web Locks** lorsque l’API est disponible (navigateurs récents sous HTTPS, dont GitHub Pages). Sans cette API, les contrôles préalables et les avertissements restent actifs, mais il n’existe pas de transaction atomique entre onglets.

En cas de conflit : la copie de cet onglet reste consultable et exportable, ses nouvelles modifications restent en mémoire et n’écrasent pas l’autre version. Exportez votre copie, puis choisissez explicitement de charger la version externe. Il n’y a pas de fusion automatique. Une ancienne v1 ouverte ne respecte pas les verrous v2 : fermer les anciens onglets pendant la mise à niveau reste recommandé.

En cas de quota ou d’accès refusé, les ajouts/éditions restent en mémoire avec un avertissement ; exportez-les avant de fermer l’onglet. Les restaurations JSON et CSV exigent une sauvegarde réussie avant validation. L’effacement volontaire du stockage navigateur reste hors du contrôle de l’application.

Les données sont propres au navigateur et à l’origine HTTPS. Une publication v2 sur **la même adresse** conserve la clé. Changer de navigateur ou de domaine ne transfère pas les sessions : exporter depuis l’ancienne origine puis importer dans la nouvelle.

## Développement et vérifications

Aucune installation n’est nécessaire pour utiliser le site hébergé. Pour développer uniquement : Node.js 24 LTS et npm.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Le chemin de base est **`/Number1/`** dans Vite. Ouvrir l’adresse incluant ce chemin indiquée par le serveur. Dans les environnements où le cache npm personnel est inaccessible : `npm ci --cache /tmp/racelab-npm`.

```sh
npx playwright install chromium
npm run test:e2e
npm run test:production
```

Dans l’environnement cloud disposant du navigateur système : préfixer les deux dernières commandes par `CHROMIUM_PATH=/usr/bin/chromium`. Les tests de développement utilisent une base `/` dédiée ; le test de production utilise bien **`/Number1/`**. Aucun lint n’est configuré ; aucun résultat de lint n’est revendiqué.

Les tests couvrent les fonctions v1, les secteurs incohérents, les variantes incompatibles, le CSV, les sauvegardes JSON v1/v2, les conflits réels entre onglets, le refus d’écraser une version externe, les pannes de stockage, la persistance et les vues mobiles. Les vérifications de volume couvrent 2 500 sessions dans les calculs, 250 sessions dans l’historique paginé et 500 tours dans l’interface. Les tests v1 incluent 150 000 tours pour les calculs seuls, pas pour le rendu complet. Les tableaux de tours et les comparaisons ne sont pas virtualisés ; de très grands runs peuvent ralentir le navigateur.

## Préparation GitHub Pages — publication sur accord uniquement

Le dépôt comporte le code source sur `main` et la version statique actuellement publiée sur `gh-pages`. **Ne pas pousser sur `gh-pages` sans accord** : cette branche déclenche la publication.

La commande `npm run build` produit `dist/` avec les liens CSS/JS sous `/Number1/`. La navigation des pages reste interne à React : l’actualisation conserve les données, pas nécessairement la vue courante. Aucun compte ou serveur d’API n’est requis pour les fonctionnalités locales ; seule l’analyse IA utilise le Worker facultatif.

Après autorisation de publication :

1. Enregistrer et faire revoir les changements de source v2.
2. Exécuter les contrôles, les tests et le build.
3. Mettre le contenu de `dist/` à la racine de la branche `gh-pages`, conserver `.nojekyll` et copier `index.html` vers `404.html` pour le repli statique. Préserver l’historique de la branche ; ne pas forcer son remplacement.
4. Pousser cette branche seulement après accord, puis vérifier le succès du déploiement Pages et l’application sur `https://boubiprime.github.io/Number1/` (ressources, actualisation, LocalStorage, CSV et secteurs).
5. Exporter une sauvegarde avant la première utilisation de la v2 et fermer les anciens onglets v1. Le format JSON 2 n’est pas destiné à être réimporté dans la v1.

Le build local ne constitue pas une vérification d’un nouveau déploiement public. La livraison de l’interface IA conserve un endpoint vide tant que le backend sécurisé et ses secrets ne sont pas configurés : la publication du site ne suffit pas à activer OpenAI. La configuration Vercel historique reste disponible avec une surcharge de base `/` pour son build à la racine, mais n’est pas nécessaire à GitHub Pages. Ne jamais copier `.worker-build/`, `backend/`, `.env*` ou `.dev.vars*` sur `gh-pages` : seul `dist/` est public.
