# Spikes d'ouverture — dérisquage avant écriture

Ouverture du chantier, 31 juillet 2026. Une question par spike, une méthode, un
critère de sortie, une journée maximum. Un spike qui déborde devient un chantier
et se replanifie.

Conception de référence : `2026-07-31-solana-yield-vault-design.md`.

| Version | Date | Changement |
|---|---|---|
| 1.1 | 2026-07-31 | Verdict S2 (la couverture ne porte que sur la logique pure côté hôte, le chemin BPF rend zéro) et verdict partiel S3 (versions tranchées contre le réseau, déploiement devnet restant) |
| 1.0 | 2026-07-31 | Plan initial, 7 spikes |

Aucun programme n'est écrit avant que S1, S2 et S3 aient rendu leur verdict.
Les quatre autres peuvent se mener en parallèle.

---

## S1 — Ce qui déclenche réellement le hook de transfert

**Bloquant.** C'est le spike qui décide si le module de conformité tient.

**Question.** Quelles instructions de Token-2022 invoquent le programme de hook,
et que fait Token-2022 face à une instruction de transfert qui ne l'invoque pas ?
Si une voie de mouvement de parts existe sans passer par le hook, la liste
d'autorisation ne vaut rien.

**Méthode.** Sur un validateur local, créer un mint Token-2022 portant
l'extension de hook pointant vers un programme témoin qui journalise et refuse
tout. Puis tenter, une par une, chaque voie de mouvement plausible : le transfert
simple hérité, le transfert vérifié, le transfert avec frais, la délégation puis
le transfert par le délégataire, la fermeture de compte, le brûlage, et le
délégataire permanent si l'extension est présente. Pour chacune : le hook a-t-il
été appelé, et l'opération a-t-elle été rejetée ?

**Critère de sortie.** Un tableau exhaustif des voies de mouvement avec, pour
chacune, appel du hook oui ou non. Verdict écrit : la liste d'autorisation est
étanche, ou elle ne l'est pas et il faut une extension supplémentaire pour la
rendre étanche.

**Risque si négligé.** Écrire le hook, le déployer, le documenter, et découvrir
tard qu'un transfert hérité le contourne.

## S2 — Mesure de couverture sur des programmes Anchor

**Bloquant** pour le seuil d'intégration continue, pas pour l'écriture.

**Question.** Peut-on mesurer une couverture de lignes sur du code de programme
Solana, et à quel niveau ? Les programmes se compilent pour une cible BPF ;
`cargo-llvm-cov` mesure sur des tests compilés pour l'hôte.

**Méthode.** Sur un programme jouet, comparer trois voies : les tests unitaires
Rust compilés pour l'hôte, les tests contre un environnement de simulation en
processus, et les tests d'intégration en TypeScript contre un validateur local.
Mesurer ce que `cargo-llvm-cov` rend dans chaque cas. Vérifier au passage que le
filtre d'exclusion des fichiers de test se transpose.

**Critère de sortie.** Un chiffre reproductible sur le programme jouet et un
seuil défendable, ou le constat argumenté qu'aucun seuil de ce type n'a de sens
sur Solana, auquel cas la garantie de remplacement se définit avant d'écrire la
moindre ligne.

**Note.** Sur Soroban, le seuil n'était mordant qu'après exclusion des fichiers
de test, qui vivent dans `src/`. Vérifier si la convention Anchor pose le même
piège.

### Verdict — 2026-07-31

**Une couverture est mesurable, mais uniquement sur de la logique pure
compilée côté hôte. Le chemin BPF ne rend rien du tout.**

Mesuré sur un programme témoin issu de `anchor init` en 1.1.2, avec
`cargo-llvm-cov 0.8.7`.

L'ossature par défaut d'Anchor 1.1.2 ne teste plus en TypeScript avec Mocha
mais en **Rust avec LiteSVM** (`[scripts] test = "cargo test"`,
`litesvm 0.10.0` en dépendance de développement). Le test charge le `.so`
compilé et l'exécute en BPF. Résultat mesuré sur un test qui passe et exerce
les deux instructions du programme :

```
instructions/increment.rs    12 lignes    0.00%
instructions/initialize.rs   13 lignes    0.00%
lib.rs                        6 lignes    0.00%
```

Zéro. C'est structurel et non accidentel : le code instrumenté côté hôte n'est
jamais exécuté, la logique tournant dans la machine virtuelle BPF.

Contre-épreuve dans le même programme : un module de logique pure ajouté sous
`src/`, une math de parts avec ses gardes, couvert par cinq tests unitaires
`#[cfg(test)]` compilés côté hôte :

```
shares.rs                    30 lignes  100.00%   (6/6 fonctions, 97,50 % de régions)
```

**Conséquence pour l'architecture**, à répercuter en §3.1 de la conception :
l'arithmétique de parts, la valorisation, les arrondis et les gardes vivent
dans des fonctions pures testées côté hôte ; les gestionnaires Anchor se
réduisent à du câblage, exercé par LiteSVM mais non mesuré. Un seuil de
couverture ne porte que sur le premier ensemble, et c'est défendable : il
couvre la partie où un défaut coûte cher, le câblage restant couvert par des
tests de comportement.

Position plus saine que celle de Soroban, où il avait fallu exclure les
fichiers de test pour que le seuil morde encore. Ici la frontière est
naturelle. Le piège Soroban ne se reproduit pas : les tests d'intégration
vivent sous `tests/`, hors du périmètre mesuré, et les tests unitaires
`#[cfg(test)]` d'un module pur n'en gonflent pas artificiellement le
dénominateur.

**Piège d'outillage rencontré, et sa correction.** `cargo-llvm-cov` échoue
d'emblée sur l'ossature générée, avec un message qui ne nomme pas la cause :

```
error: couldn't read .../target/llvm-cov-target/tmp/../deploy/scaffold1.so:
No such file or directory
```

L'ossature code le chemin du binaire en dur à la compilation :

```rust
include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/prog.so"))
```

Or `cargo-llvm-cov` redirige le répertoire cible vers
`target/llvm-cov-target`, donc `CARGO_TARGET_TMPDIR` devient
`target/llvm-cov-target/tmp` et `../deploy` désigne un répertoire vide, quand
`anchor build` écrit toujours dans `<workspace>/target/deploy`.

Correction retenue, **vérifiée** : lecture à l'exécution plutôt qu'à la
compilation, les deux emplacements essayés dans l'ordre. `include_bytes!` ne
peut pas être rendu conditionnel, la macro exigeant un chemin littéral connu à
la compilation. L'assistant doit vivre sous `tests/common/mod.rs` et non sous
`src/` : `CARGO_TARGET_TMPDIR` n'est défini que pour les cibles de test
d'intégration, et la bibliothèque ne compile pas si elle y fait appel.

```rust
pub fn program_binary(name: &str) -> Vec<u8> {
    let tmp = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let file = format!("{name}.so");
    // 1. cargo test     : <ws>/target/tmp/../deploy
    // 2. cargo llvm-cov : <ws>/target/llvm-cov-target/tmp/../../deploy
    let candidates = [
        tmp.join("..").join("deploy").join(&file),
        tmp.join("..").join("..").join("deploy").join(&file),
    ];
    for path in &candidates {
        if let Ok(bytes) = std::fs::read(path) {
            return bytes;
        }
    }
    panic!("binaire {file} introuvable. Lancer `anchor build` d'abord. \
            Chemins essayes : {}",
        candidates.iter().map(|p| p.display().to_string())
            .collect::<Vec<_>>().join(", "));
}
```

Vérifié en supprimant toute copie manuelle du `.so` : `cargo test` et
`cargo llvm-cov` passent tous deux, sans intervention. À appliquer dès
l'amorçage de l'espace de travail.

## S3 — Alignement des versions et amorçage de l'espace de travail

**Bloquant.** Rien ne se compile avant.

**Question.** Quel triplet Anchor, Agave et Rust est aligné sur le runtime devnet
du jour ?

**Méthode.** Installer `avm`, Anchor et la chaîne d'outillage Agave. Lire la
version du runtime devnet réel plutôt que la documentation : la page
d'installation d'Anchor annonce Agave 2.0.26 alors que la ligne de publication
courante est en 4.x, et marginfi, dépôt de production, épingle
`anchor_version = "1.0.2"` avec `solana_version = "3.1.13"`. Amorcer l'espace de
travail, compiler un programme vide, le déployer sur devnet, en lire
l'identifiant.

**Critère de sortie.** Un `Anchor.toml` épinglé, un programme vide déployé sur
devnet dont l'identifiant est consigné dans `docs/evidence/`, et la première
preuve du dépôt.

### Verdict partiel — 2026-07-31

**Versions tranchées contre le réseau. Reste le déploiement devnet.**

Le runtime devnet annonce `solana-core 4.1.2`, le mainnet 4.1.0, tous deux sur
le jeu de fonctionnalités 3345198602. Agave **4.1.2** installé, et le contrôle
qui compte est concluant : le CLI rend `feat:c763ae0a`, soit exactement ces
3345198602 en hexadécimal. Même version et même état de fonctionnalités que le
réseau visé, pas seulement le même numéro.

La réserve sur la documentation était fondée, et au-delà de ce qui était
supposé : la page d'installation d'Anchor annonce Agave 2.0.26, **deux versions
majeures de retard**. La suivre installe une chaîne inutilisable.

Anchor **1.1.2**, dernière version stable (26 juin 2026), installée en binaire
précompilé `aarch64-apple-darwin`, empreinte SHA-256
`64e64a741d7a8f09b055efe5d44e90059cf4e7ddd225aee95354958505af7f4a`. marginfi
épingle encore Anchor 1.0.2 avec Solana 3.1.13 : leur pin est en retard sur le
réseau et ne sert donc pas de référence, contrairement à ce que la conception
supposait.

Rust : `anchor init` génère un `rust-toolchain.toml` épinglé sur le canal
1.89.0, avec `edition = "2021"` dans le `Cargo.toml` d'espace de travail.

Chaîne éprouvée de bout en bout sur le programme témoin : `anchor build` produit
le `.so` et l'IDL, `cargo test` passe, `cargo llvm-cov` mesure (après la
correction consignée en S2).

**Reste pour clore S3** : amorcer l'espace de travail du dépôt, puis déployer un
programme sur devnet et consigner son identifiant. Bloqué sur un préalable
d'exploitation et non technique : aucune clé Solana n'existe sur la machine, et
le CLI pointe par défaut sur `mainnet-beta`, ce qui est un piège en soi. Le
déploiement consomme du SOL, ce qui rejoint S6.

## S4 — Jupiter Lend en CPI

**Question.** Les quatre marchés du programme Lending devnet portent-ils bien
USDC et EURC en actif sous-jacent, et une CPI de dépôt puis de retrait
fonctionne-t-elle depuis un programme à nous ?

**Méthode.** Récupérer l'IDL du programme devnet et décoder proprement les
quatre comptes de marché, plutôt que de se fier au décodage positionnel du
relevé du 31 juillet. Puis écrire un programme jouet qui construit l'instruction
à la main, discriminateur `sha256("global:deposit")[0..8]` suivi du montant en
`u64` petit-boutiste, et l'invoque avec les dix-sept comptes. Lire au préalable
l'intégration de référence de marginfi, qui déclare les trois programmes Jupiter
Lend en localnet dans son `Anchor.toml`.

**Critère de sortie.** Un dépôt et un retrait réussis sur devnet, signatures
consignées, et la mécanique de valorisation du jeton de reçu comprise : de quel
compte se lit le taux, et comment il convertit un solde de reçu en unités
d'actif.

## S5 — Signature et diffusion Solana via DFNS

**Question.** La chaîne complète tient-elle de bout en bout, du provisionnement
du portefeuille à la confirmation d'une transaction Solana signée par le
fournisseur de garde ?

**Méthode.** Reprendre la chaîne éprouvée sur Stellar en l'adaptant :
provisionner un portefeuille sur `SolanaDevnet`, financer le compte, construire
la transaction, obtenir la signature, diffuser, confirmer. Identifier le point
d'entrée de diffusion adapté à Solana et le format attendu.

**Critère de sortie.** Une transaction Solana signée par un portefeuille DFNS,
confirmée sur devnet, signature consignée. C'est le socle du paquet
`onboarding/`.

## S6 — Trésorerie devnet et runbook de distribution

**Question.** Comment financer une série de portefeuilles de démonstration en
SOL, USDC et EURC sans buter sur les plafonds des robinets ?

**Méthode.** Mesurer les plafonds réels : distribution SOL par le RPC devnet,
robinet Circle pour USDC et EURC. Établir une clé de trésorerie, l'alimenter, et
écrire le script de distribution ainsi que le runbook de recharge.

**Critère de sortie.** Une trésorerie approvisionnée, un script de distribution
éprouvé sur trois adresses, et le coût en temps d'une recharge documenté. Ce
spike n'est pas technique, il est logistique.

## S7 — Validateur local forké du mainnet

**Question.** Peut-on cloner les comptes du mainnet nécessaires à un échange
Jupiter Swap dans un validateur local, et y exécuter une conversion USDC vers
EURC ?

**Méthode.** marginfi montre le motif en déclarant Kamino, Drift et Jupiter Lend
en programmes de localnet. Cloner le programme d'agrégation et les comptes de
pool que la route mainnet emprunte, puis rejouer la conversion hors ligne.

**Critère de sortie.** Une conversion USDC vers EURC exécutée dans le validateur
local, reproductible par une commande consignée, avec la provenance de chaque
compte cloné épinglée. C'est ce qui rend le chemin Jupiter Swap défendable sans
prétendre qu'il tourne sur devnet.

---

## Séquencement

S1, S2 et S3 d'abord, dans cet ordre, parce qu'ils conditionnent respectivement
le module de conformité, la garantie de qualité et la compilation. S4, S5, S6 et
S7 se mènent ensuite en parallèle, S4 et S7 sur la piste de la chaîne, S5 et S6
sur la piste périphérique.

Chaque spike produit une entrée dans ce document, datée, avec son verdict, ses
adresses et ses signatures. Un spike sans verdict écrit n'a pas eu lieu.
