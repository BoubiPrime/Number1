# RaceLab v1.0 — Motorsport Analytics

Application React + TypeScript + Vite, Tailwind CSS, Recharts et Lucide React. Interface en français, responsive, sans backend, API, compte ou connexion à un simulateur.

## Installation et lancement

Pour le développement local, Node.js 24 LTS et npm sont nécessaires. Pour utiliser la version hébergée, seul un navigateur est nécessaire.

```sh
npm ci
npm run dev
```

Ouvrir l’adresse affichée par Vite (port 5173 par défaut).

```sh
npm run typecheck # vérification TypeScript seule
npm test          # tests unitaires des chronos, statistiques et données
npm run build    # contrôle TypeScript et compilation de production
npm run preview  # servir la compilation localement
```

Pour un cache npm non accessible : `npm ci --cache /tmp/racelab-npm`.

## Utilisation

- Le dashboard sépare les records personnels par circuit et affiche la dernière session et les sessions récentes.
- Créer une session, puis saisir des tours avec exactement trois décimales : `1:37.317`, `97.317`, `2:05.840`.
- Depuis le détail, « Modifier la session » permet de corriger circuit, voiture, jeu, date et type sans changer son identifiant ni perdre ses tours. Project Motor Racing et F1 24 font partie des suggestions de jeux.
- Chaque tour peut être modifié avec le bouton crayon, marqué valide ou invalide et supprimé. L’édition conserve son identifiant et son numéro ; une annulation laisse les données inchangées. Les numéros sont recalculés après suppression.
- Les tours invalides sont visibles dans le graphique (croix rose) mais exclus des records, moyennes, amplitudes et écarts-types. Leur écart au meilleur reste consultable hors classement.
- L’écart-type est celui de la population des tours valides. Avec un seul tour, il vaut zéro ; sans tour valide, les statistiques affichent un tiret.
- Dans l’historique, rechercher par circuit, filtrer par jeu et cocher deux sessions du même circuit pour les comparer. Les différences de voiture sont signalées ; les conditions peuvent être déclarées manuellement, sans mesure ni vérification automatique.
- Les sessions initiales sont fictives et identifiées « Démo ». Leur suppression nécessite une confirmation, tout comme celle d’une session.

## Données locales

Les sessions sont stockées uniquement dans le LocalStorage du navigateur, sous `racelab.sessions.v1`. Les données persistent après rechargement ; les démos ne sont chargées qu’à la première ouverture, jamais après une suppression volontaire. Changer de navigateur, d’origine ou de port crée un autre espace de stockage. Effacer les données du navigateur efface l’historique ; aucun service distant n’en conserve une copie.

Les données chargées sont validées. Un stockage corrompu est conservé sans écrasement automatique et une réinitialisation explicite est proposée. Si l’écriture est impossible, un avertissement indique que les modifications restent uniquement en mémoire.

Aucune télémétrie réelle n’est inventée : cette application analyse uniquement des chronos saisis manuellement. Les records par circuit peuvent regrouper plusieurs voitures et jeux ; leur contexte reste accessible dans chaque session.

## Tests navigateur

```sh
npx playwright install chromium
npm run test:e2e
```

Les tests démarrent Vite automatiquement. Dans les environnements où le répertoire personnel n’est pas accessible, préfixer les deux commandes avec `PLAYWRIGHT_BROWSERS_PATH=/tmp/racelab-browsers`.

Dans cette instance cloud, Chromium est déjà installé : `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. Le téléchargement de Playwright peut être bloqué par la politique réseau ; cette commande utilise le navigateur système.

Le scénario de régression navigateur couvre la création d’une session, cinq chronos, l’invalidation du meilleur tour avec vérification de toutes les statistiques, l’édition et la suppression d’un chrono, l’édition de la session, la persistance après rechargement et la suppression définitive de la session.

## Analyse des performances

- **Consistency Analysis**, dans le détail d’une session : écart-type de population, amplitude, écart moyen au meilleur et pourcentage de tours valides. L’écart moyen est la moyenne valide moins le meilleur tour valide.
- L’évolution du rythme compare les moyennes des premiers et derniers blocs de tours valides, de même taille et sans chevauchement : `min(3, floor(nombre de tours valides / 2))`. Le tour central d’un effectif impair peut être omis. Les numéros des tours utilisés sont affichés. La différence est « fin − début » ; aucune tendance n’est calculée avec moins de deux tours valides, et aucune cause n’est déduite.
- Les infobulles des graphiques affichent le chrono exact, la validité et l’écart au meilleur valide de la session. Les invalides restent visibles et n’entrent dans aucune statistique de chrono. L’échelle en secondes suit les données, avec une marge minimale de 5 ms.
- **Session Comparison**, accessible depuis la navigation ou la comparaison existante de l’historique : deux sessions distinctes du même circuit, deux courbes alignées par numéro de tour, contexte et écart des meilleurs chronos. Une session plus courte n’est pas prolongée ; les points manquants ne sont ni interpolés ni inventés.
- Le champ facultatif **Conditions de piste** est conservé dans la même clé LocalStorage versionnée. Les anciennes sessions sans ce champ sont compatibles. Les différences de voiture, jeu, date, type ou conditions sont signalées ; les conditions absentes restent explicitement inconnues. Même des déclarations identiques ne prouvent pas l’équivalence des pneus, carburant, réglages ou météo.
- **Personal Records**, dans la navigation et sur le dashboard : référence par circuit, voiture, jeu, date et lien vers la session. Les records sont recalculés depuis les tours valides à chaque ajout, édition, changement de validité ou suppression. Aucun record n’est conservé dans un cache séparé. À égalité, la session la plus ancienne est retenue, puis les identifiants départagent les sessions d’une même date.

L’application analyse des chronos manuels, sans données de vitesse, freinage, trajectoire ou secteurs. L’import de télémétrie et la mesure automatique des conditions ne font pas partie de cette version.

## Sauvegarder et restaurer

Les boutons **Exporter JSON** et **Importer JSON** sont accessibles sur toutes les pages. Le traitement reste intégralement dans le navigateur.

1. Exporter télécharge toutes les sessions et tous les tours, y compris les démos et les invalides, dans `racelab-v1-AAAA-MM-JJ.json`.
2. Importer sélectionne un fichier JSON (10 Mo maximum), vérifie la version, la date d’exportation, les champs, les chronos entiers positifs, l’ordre des tours et l’unicité des identifiants de sessions et de tours dans chaque session.
3. Un récapitulatif demande confirmation avant de **remplacer** toute la collection. Un fichier vide valide peut aussi vider l’historique après confirmation. Exportez votre collection actuelle avant de la remplacer.
4. Annuler ou fournir un fichier invalide ne modifie aucune donnée. Si l’écriture LocalStorage échoue, l’import est refusé et la collection actuelle est préservée.
5. Il n’y a pas de fusion : réimporter la même sauvegarde ne multiplie pas les sessions. Les identifiants dupliqués dans un fichier sont refusés, jamais corrigés silencieusement.

Format :

```json
{
  "formatVersion": 1,
  "exportedAt": "2026-10-18T12:00:00.000Z",
  "sessions": []
}
```

La version LocalStorage reste `racelab.sessions.v1` : aucune migration destructive. Les anciens champs facultatifs absents restent compatibles et les champs additionnels des sessions sont conservés. Une version de sauvegarde inconnue est refusée avant remplacement. Les fichiers exportés contiennent vos données en clair : conservez-les comme vos autres fichiers personnels.

## Vérifications et limites de la v1.0

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Aucun lint n’est configuré dans ce dépôt ; aucun résultat de lint n’est donc revendiqué. Les tests navigateur couvrent aussi téléchargement réel et restauration, annulation, import invalide, doublons, panne de stockage, identifiants de session particuliers, recherche sans résultat et navigation mobile sans erreur console. Les tests unitaires incluent des calculs sur 150 000 tours ; ce volume ne constitue pas une validation de performance de l’interface entière.

Au-delà de 60 tours, le graphique propose une plage ajustable (40 tours affichés initialement). Les poignées se déplacent à la souris ou au clavier avec les flèches. Tous les tours restent enregistrés ; le tableau et les statistiques concernent la session complète.

Les capacités de stockage dépendent du navigateur. Les très grands historiques peuvent ralentir les tableaux, qui ne sont pas virtualisés. Utilisez de préférence un seul onglet d’édition : les modifications concurrentes entre onglets ne sont pas fusionnées. Il n’y a ni synchronisation distante, ni connexion à un jeu, ni télémétrie automatique. La météo, le carburant, les pneus et les réglages restent non mesurés. Aucun hébergement de production n’a été déployé par cette tâche.

## Déploiement Vercel gratuit, sans terminal

Le projet est une application statique Vite. Aucun backend, aucune variable secrète et aucune base de données ne sont nécessaires. Le fichier `vercel.json` définit `npm ci`, `npm run build`, le dossier `dist` et le repli des chemins vers `index.html`. Node.js 24.x est déclaré dans `package.json`. L’offre Hobby de Vercel convient à un usage personnel non commercial, dans ses limites d’utilisation.

### 1. Mettre le projet complet sur GitHub

Attention : les fichiers préparés dans l’espace de travail ne sont pas automatiquement présents dans le dépôt GitHub. Un dépôt contenant seulement le README ne permet pas de déployer RaceLab.

1. Récupérer l’archive `RaceLab-Vercel.zip`, puis utiliser **Extraire tout** dans Windows (aucune installation nécessaire).
2. Ouvrir `https://github.com/BoubiPrime/Number1` et choisir **Add file → Upload files**. Si le menu n’est pas disponible, vérifier que le compte connecté peut modifier le dépôt.
3. Glisser **le contenu** du dossier extrait dans la page : `package.json`, `package-lock.json`, `vercel.json`, `index.html`, les configurations et les dossiers `src`, `public`, `e2e`. Ne pas envoyer le ZIP lui-même, `node_modules` ou `dist`.
4. Vérifier que `package.json`, `vercel.json` et `src` sont bien à la racine du dépôt, puis choisir **Commit changes** lorsque vous décidez d’enregistrer les fichiers sur GitHub.

Si un projet Vercel est déjà relié à ce dépôt, un commit peut déclencher un déploiement automatique. Ne valider les changements qu’au moment où cette publication est souhaitée.

### 2. Créer le site depuis Vercel

1. Aller sur `https://vercel.com`, se connecter avec GitHub et choisir l’offre personnelle **Hobby**.
2. Choisir **Add New → Project**, autoriser uniquement le dépôt nécessaire et importer `BoubiPrime/Number1`.
3. Vérifier **Framework Preset : Vite** et **Root Directory : ./** (racine du dépôt).
4. Vérifier les réglages hérités du projet : **Install Command : npm ci**, **Build Command : npm run build**, **Output Directory : dist**, **Node.js : 24.x**. Aucune variable d’environnement n’est requise.
5. Le bouton **Deploy** publie le site : cliquer uniquement lorsque vous confirmez la publication. Vercel fournit ensuite une adresse HTTPS en `.vercel.app`.
6. Tester la création d’une session, actualiser et vérifier sa présence. Tester aussi le téléchargement et la restauration d’une sauvegarde JSON.

Les libellés de l’interface Vercel peuvent varier. Un dépôt privé est compatible ; le site déployé peut néanmoins être accessible publiquement. Garder le dépôt privé ne rend pas automatiquement le site privé. Après connexion de GitHub, les nouveaux commits peuvent provoquer des redéploiements.

### Navigation et données

La navigation actuelle (dashboard, historique, détail, comparaison et records) est interne à React, sur l’URL `/`. Le repli SPA évite une erreur serveur en ouvrant un autre chemin ; il ne crée pas de liens directs persistants vers une session et n’enregistre pas la vue courante après actualisation.

Les sessions restent dans le LocalStorage **du navigateur de chaque visiteur**, sous `racelab.sessions.v1`. Vercel n’en reçoit ni ne synchronise les valeurs. Une mise à jour du site sur la même origine ne les efface pas. Elles ne sont pas partagées entre appareils, navigateurs, adresses de prévisualisation ou domaines personnalisés. Exporter les données depuis l’ancienne adresse, puis importer le JSON depuis la nouvelle adresse pour les transférer. La navigation privée ou l’effacement des données du navigateur peut supprimer les sessions.

La compilation et les tests locaux ne constituent pas une validation d’un déploiement Vercel réel. Aucun site n’a été publié par l’assistant et aucune intégration de déploiement Vercel n’est disponible dans cette conversation.

Pour répéter les vérifications de la compilation servie localement : `npm run build`, puis `CHROMIUM_PATH=/usr/bin/chromium npm run test:production` dans cette instance cloud. Le test contrôle les fichiers statiques, le repli SPA de Vite Preview, la navigation, les sessions, les tours, le LocalStorage et l’import/export. Le comportement du réseau Vercel reste à vérifier après publication.
