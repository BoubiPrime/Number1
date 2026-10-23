# RaceLab v2.0 Pro Edition — Analyse IA

Site : https://boubiprime.github.io/Number1/

Version statique produite depuis le commit source `ae080abc478a23d15a85b3c5a05670ed7d3e1659`.

L’interface Analyse IA est disponible ; son endpoint reste désactivé tant que le backend Cloudflare et les secrets serveur ne sont pas configurés. Aucune clé API ni donnée utilisateur n’est publiée dans cette branche. Les sessions restent dans le navigateur avec la clé existante `racelab.sessions.v1`.

Base Vite : `/Number1/`. Seul le contenu de `dist/` est publié, avec le repli `404.html` et `.nojekyll`. Les anciens assets hachés sont conservés pour les onglets déjà ouverts.

Vérifications avant livraison : TypeScript frontend/backend, 84 tests unitaires, 24 parcours navigateur, 1 parcours du build de production et 4 scénarios Workers/SQLite réussis. Les appels OpenAI sont simulés ; aucun appel réel sans clé.
