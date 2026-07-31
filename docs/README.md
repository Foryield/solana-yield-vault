# Documentation — point d'entrée

Ce dossier contient les documents de travail du projet. Ils sont en français ;
le code, ses commentaires et les documents racine sont en anglais.

## Par où commencer

1. [Conception](./plans/2026-07-31-solana-yield-vault-design.md) — ce qu'on
   construit, pourquoi, et l'inventaire devnet sur lequel ça repose. C'est le
   document de référence : toute décision d'architecture y est tracée avec les
   alternatives écartées.
2. [Spikes d'ouverture](./plans/2026-07-31-spikes-ouverture.md) — les sept
   questions à trancher avant d'écrire du programme.
3. [Journal de preuves](./evidence/) — vide pour l'instant, il se remplit au fil
   des déploiements et des transactions.

Les règles de travail (plan avant code, tout par PR, preuve le jour même) sont
dans [`CONTRIBUTING.md`](../CONTRIBUTING.md) à la racine.

## État des spikes

| Spike | Sujet | Bloquant | État |
|---|---|---|---|
| S1 | Ce qui déclenche réellement le hook de transfert | oui | à faire |
| S2 | Mesure de couverture sur cible BPF | oui | à faire |
| S3 | Alignement des versions et amorçage | oui | à faire |
| S4 | Jupiter Lend en CPI | non | à faire |
| S5 | Signature et diffusion Solana via DFNS | non | à faire |
| S6 | Trésorerie devnet et runbook de distribution | non | à faire |
| S7 | Validateur local forké du mainnet | non | à faire |

S1, S2 et S3 sont ordonnés et conditionnent tout le reste. Les quatre autres
sont indépendants entre eux et se mènent en parallèle une fois les trois
premiers rendus.

Chaque spike inscrit son verdict, ses adresses et ses signatures directement
dans le document de spikes, daté. Un spike sans verdict écrit n'a pas eu lieu.

## Ce qui n'est pas encore là

Aucun programme, aucune chaîne d'outillage épinglée, aucune intégration
continue, aucun déploiement. La démonstration web et le paquet d'onboarding sont
décrits en section 3.5 de la conception mais n'existent pas.

Le point à surveiller en priorité : si S1 révèle qu'une voie de transfert
contourne le hook, la section 3.2 de la conception est à reprendre avant toute
écriture.
