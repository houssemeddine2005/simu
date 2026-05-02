# Simulateur de Salaire – Guide de déploiement Hostinger

## Structure du projet

```
simulateur-salaire/
└── index.html   ← fichier unique, tout-en-un (HTML + CSS + JS)
```

## Déploiement sur Hostinger

### Option 1 – File Manager (sans FTP)
1. Connectez-vous à votre panneau Hostinger (hPanel)
2. Allez dans **Files → File Manager**
3. Naviguez dans `public_html/`
4. Cliquez **Upload** et déposez `index.html`
5. Votre site est en ligne à `https://votre-domaine.com`

### Option 2 – FTP (FileZilla)
- Hôte : `ftp.votre-domaine.com`
- Identifiants dans hPanel → **FTP Accounts**
- Déposez `index.html` dans `/public_html/`

### Option 3 – Git (si Hostinger Git intégration activée)
```bash
git init
git add index.html
git commit -m "Simulateur de salaire v1"
git remote add origin <url-repo>
git push
```
Puis connectez le dépôt dans hPanel → **Git**.

## Personnalisation rapide

| Ce que vous voulez changer | Où dans le code |
|---|---|
| Nom du site / logo | Balise `<div class="logo">` |
| Couleur accent (bleu) | Variable `--accent: #1a3fff` dans `:root` |
| Taux de cotisations | Objet `const TAUX = { ... }` |
| Plafond SS | Constante `PASS_MENSUEL` |
| Barème IR | Tableau `const BAREME_IR` |

## Ce que calcule le simulateur

- **Brut → Net** et **Net → Brut**
- Cotisations salariales détaillées (vieillesse, retraite complémentaire AGIRC-ARRCO, CEG, CET)
- CSG déductible, CSG non déductible, CRDS
- Estimation de l'impôt sur le revenu (barème 2024, quotient familial)
- Prélèvement à la source (PAS) paramétrable
- Options : mutuelle, tickets restaurant, heures supplémentaires
- Coût employeur estimé
- Affichage mensuel / annuel / horaire

## Données 2024

- Plafond Sécurité Sociale mensuel : **3 864 €**
- Barème IR mis à jour pour 2024
- Taux AGIRC-ARRCO 2024

## Remarque légale

Ce simulateur est indicatif. Ajoutez une mention légale adaptée dans le `<footer>` avant mise en production.
