# Spec: skill-tracker — Production Deployment

## Objective

Mettre skill-tracker (v1.0.0, deja publie manuellement sur npm) en production avec un workflow GitHub-first :
- Code source sur GitHub public
- Tests automatiques a chaque push/PR
- Publication npm automatique a chaque tag de version

**User** : Developpeur solo (Jesuisleon) qui veut un workflow propre pour maintenir et distribuer l'outil.

## Tech Stack

- **Repository** : github.com/Jesuisleon/skill-tracker (public)
- **CI/CD** : GitHub Actions
- **Registry** : npm (package `skill-tracker`, deja reserve)
- **Versioning** : semver via `npm version` + git tags

## Workflow cible

```
  Developer                    GitHub                         npm
     |                            |                             |
     |-- git push branch -------->|                             |
     |                            |-- CI: test + typecheck ---->|
     |                            |                             |
     |-- npm version patch ------>|                             |
     |-- git push --tags -------->|                             |
     |                            |-- CI: test ----------------->|
     |                            |-- CD: npm publish --------->|
     |                            |                             |
     |                            |          skill-tracker@1.0.1 published
```

## Fichiers a creer

| Fichier | Role |
|---------|------|
| `.github/workflows/ci.yml` | Tests + typecheck sur chaque push et PR |
| `.github/workflows/publish.yml` | Publish npm sur push de tag `v*` |
| `.gitignore` | Exclure node_modules, dist, .env |

## GitHub Actions — CI

Declencheur : `push` et `pull_request` sur toutes les branches.

Steps :
1. Checkout
2. Setup Node.js 18
3. `npm ci`
4. `npx tsc --noEmit`
5. `npm test`

## GitHub Actions — Publish

Declencheur : `push` de tags `v*` (ex: `v1.0.1`).

Steps :
1. Checkout
2. Setup Node.js 18 avec registry npm
3. `npm ci`
4. `npm test`
5. `npm publish --access public`

Necessite : secret `NPM_TOKEN` configure dans le repo GitHub (Settings → Secrets).

## Workflow de release

```bash
# 1. Faire les changements, committer
git add . && git commit -m "fix: ..."

# 2. Bumper la version
npm version patch   # ou minor / major

# 3. Push code + tag
git push && git push --tags

# 4. GitHub Actions publie automatiquement sur npm
```

## .gitignore

```
node_modules/
dist/
*.tgz
.env
```

## Secret npm

Le repo GitHub a besoin d'un secret `NPM_TOKEN` :
- npmjs.com → Access Tokens → Granular Token avec bypass 2FA + read/write packages
- GitHub repo → Settings → Secrets → Actions → New secret → `NPM_TOKEN`

## Success Criteria

- [ ] Repo GitHub public accessible a github.com/Jesuisleon/skill-tracker
- [ ] Push sur main declenche CI (tests + typecheck) — vert
- [ ] Push d'un tag `v*` declenche publish npm automatique
- [ ] `npx skill-tracker` fonctionne pour n'importe qui apres publish
- [ ] README visible sur GitHub et npm

## Boundaries

- **Always** : Tests passent avant publish, tag semver pour chaque release
- **Ask first** : Changement de nom de package, ajout de dependances
- **Never** : Committer node_modules, dist, ou des tokens/secrets

## Open Questions

Aucune — scope clair.
