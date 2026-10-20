# RaceLab v2.0 Pro Edition

Analyse de chronos simracing dans le navigateur : React, TypeScript, Vite, Tailwind CSS, Recharts et Lucide. Aucun compte, backend ou service de télémétrie. Le site public reste en v1 tant que la publication v2 n’a pas été autorisée et effectuée.

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

Les démos sont fictives, signalées et supprimables avec confirmation. Les données personnelles ne sont jamais ajoutées au code public. Aucune vitesse, trajectoire, pression de pneus ou mesure de freinage n’est inventée.

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

La commande `npm run build` produit `dist/` avec les liens CSS/JS sous `/Number1/`. La navigation des pages reste interne à React : l’actualisation conserve les données, pas nécessairement la vue courante. Aucun compte ou serveur d’API n’est requis.

Après autorisation de publication :

1. Enregistrer et faire revoir les changements de source v2.
2. Exécuter les contrôles, les tests et le build.
3. Mettre le contenu de `dist/` à la racine de la branche `gh-pages`, conserver `.nojekyll` et copier `index.html` vers `404.html` pour le repli statique. Préserver l’historique de la branche ; ne pas forcer son remplacement.
4. Pousser cette branche seulement après accord, puis vérifier le succès du déploiement Pages et l’application sur `https://boubiprime.github.io/Number1/` (ressources, actualisation, LocalStorage, CSV et secteurs).
5. Exporter une sauvegarde avant la première utilisation de la v2 et fermer les anciens onglets v1. Le format JSON 2 n’est pas destiné à être réimporté dans la v1.

Le build local ne constitue pas une vérification d’un nouveau déploiement public. Aucun déploiement v2 n’est effectué par cette préparation. La configuration Vercel historique reste disponible avec une surcharge de base `/` pour son build à la racine, mais n’est pas nécessaire à GitHub Pages.
