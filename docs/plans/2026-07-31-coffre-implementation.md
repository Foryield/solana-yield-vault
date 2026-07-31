# Implémentation du coffre — plan

Plan d'exécution du programme `yield-vault`. Suppose lues la conception
(`2026-07-31-solana-yield-vault-design.md`) et les verdicts des trois spikes
bloquants.

| Version | Date | Changement |
|---|---|---|
| 1.6 | 2026-07-31 | Tâche 6 livrée : les six tâches du coffre sont closes ; seuil de couverture éprouvé par retrait d'un test |
| 1.5 | 2026-07-31 | Tâche 5 livrée ; la suspension ne gèle pas le marché secondaire des parts, décision explicitée |
| 1.4 | 2026-07-31 | Tâche 4 livrée ; le retrait intégral laisse à jamais la contrepartie des parts mortes au coffre |
| 1.3 | 2026-07-31 | Tâche 3 livrée ; deux pièges consignés (pile BPF, test négatif qui passe pour n'importe quelle raison) |
| 1.2 | 2026-07-31 | Tâche 2 livrée ; le seuil de couverture devra viser le module pur nommément, le total tombant à 87 % dès qu'un gestionnaire existe |
| 1.1 | 2026-07-31 | Tâche 1 livrée ; stratégie de test des tâches 2 à 5 tranchée (le simulateur en processus suffit, rien à vendoriser) |
| 1.0 | 2026-07-31 | Plan initial, 6 tâches |

---

## Contrainte qui structure tout le reste

S2 a établi qu'un instrument de couverture ne voit rien du chemin BPF. Le
découpage n'est donc pas un choix de style : **l'arithmétique vit dans des
fonctions pures**, sans `Context` ni compte Anchor en argument, et les
gestionnaires d'instruction se réduisent à du câblage. Le module pur est le seul
endroit mesurable, et c'est celui où un défaut coûte des fonds.

Corollaire de méthode : le module pur se développe en test d'abord. Les
gestionnaires, eux, se vérifient par comportement sous LiteSVM.

## Décisions de conception à trancher ici

### Largeur arithmétique

Les montants de jetons Solana sont des `u64`. Le produit `montant × parts` déborde
un `u64` bien avant les bornes réalistes : 10^9 unités d'actif contre 10^9 parts
suffisent à le faire.

Deux options. Calculer en `u64` avec `checked_mul` et refuser au débordement :
simple, mais refuse des dépôts parfaitement légitimes, ce qui est un défaut
fonctionnel déguisé en garde. Ou élargir en `u128` pour le produit puis
redescendre en `u64` après division, en refusant seulement si le résultat ne
tient pas.

**Retenu : l'élargissement en `u128`.** Le débordement du produit intermédiaire
n'est pas une anomalie métier, c'est un artefact de largeur. Seul le résultat
doit tenir dans un `u64`, puisque c'est lui qui devient un solde de jeton. C'est
d'ailleurs la même logique que le `i128` du coffre Soroban, qui avait la place
pour le produit.

### Les parts mortes face à un mint réel

Sur Soroban, les parts mortes étaient comptées dans le total sans être
attribuées : le contrat tenait lui-même le registre, il pouvait se le permettre.
Ici les parts sont un mint Token-2022 et l'offre est la somme des soldes. Une
part comptée sans détenteur n'existe pas.

Deux options. Tenir un décalage dans l'état du coffre et n'émettre que la part
du déposant : l'offre du mint cesserait alors de refléter le total des parts, et
tout lecteur externe, tableau de bord ou explorateur, lirait un ratio faux. Ou
émettre réellement les parts mortes vers un compte de jeton détenu par le PDA du
coffre, sans aucun chemin de rachat.

**Retenu : l'émission réelle vers un compte mort.** L'offre du mint reste la
vérité, ce qui compte pour un produit dont l'auditabilité est l'argument. Le coût
est un compte de jeton supplémentaire, créé une fois.

### Forme du résultat de dépôt

La genèse produit deux montants, celui du déposant et celui des parts mortes. Les
renvoyer séparément plutôt que de faire calculer la soustraction à l'appelant :
le gestionnaire ne doit pas rejouer d'arithmétique, sans quoi le découpage perd
son sens.

## Invariants portés depuis la version Soroban

Ils ont été payés par une revue qui y a trouvé un défaut critique de genèse. Ils
ne sont pas rediscutés, ils sont transcrits.

- parts égale montant multiplié par le total des parts divisé par les actifs
  d'avant, tronqué ; l'arrondi est toujours en faveur du coffre ;
- montant du retrait égal aux parts multipliées par les actifs divisés par le
  total des parts, sur l'état d'avant destruction, tronqué de même ;
- à la genèse, les actifs déjà détenus par le coffre entrent dans le total, pour
  que l'égalité entre parts et actifs vaille dès l'origine, y compris après une
  donation ;
- un dépôt de genèse qui n'excède pas les parts mortes est refusé ;
- un dépôt qui tronque à zéro part est refusé plutôt que d'encaisser sans
  contrepartie ;
- un retrait qui tronque à zéro unité est refusé plutôt que de détruire des parts
  pour rien ;
- des parts existantes sans aucun actif font refuser le dépôt, plutôt que
  diviser par zéro.

## Ce que la genèse fait de l'actif déjà détenu

Point établi en écrivant les tests de propriété, et qui mérite d'être écrit
plutôt que subi : **à la genèse, le premier déposant capte l'actif déjà détenu
moins les parts mortes.**

La mécanique est celle-ci. Une donation faite à un coffre vide n'est adossée à
aucune part. La genèse fait entrer cette donation dans le total, ce qui est
nécessaire pour que l'égalité entre parts et actifs vaille dès l'origine, sans
quoi le donateur offrirait des parts au déposant. Mais l'égalité posée, le
premier déposant détient toutes les parts sauf les parts mortes, donc il peut
retirer tout l'actif sauf leur contrepartie.

Ce n'est pas une fuite, c'est le prix du modèle, et c'est précisément ce que les
parts mortes bornent : elles fixent le coût minimal d'une attaque par inflation
de la première part. Le comportement est identique sur la version Soroban.

La propriété est verrouillée par une **égalité** et non par une inégalité, pour
qu'une dérive future se voie. Une première rédaction affirmait qu'un aller-retour
ne rend jamais plus que le montant déposé ; elle était fausse à la genèse, et
elle est passée au vert par simple manque de chance d'échantillonnage avant qu'une
mutation ne fasse apparaître le contre-exemple. Une propriété qui passe peut être
fausse et sous-échantillonnée à la fois : d'où le tirage porté à 2 048 cas et la
séparation du cas de genèse, dont le paramètre n'est plus tiré au sort.

## Stratégie de test des tâches 2 à 5, établie le 31/07

Question tranchée avant d'écrire : le simulateur en processus suffit-il à
éprouver un coffre dont les parts sont un mint Token-2022 à extension, ou
faut-il vendoriser des binaires comme la version Soroban l'avait fait pour ses
venues ?

**Le simulateur suffit, et rien n'est à vendoriser.** Mesuré sur une sonde
jetable : un `LiteSVM` par défaut embarque Token-2022 et il est réellement
exécutable, pas seulement présent. La sonde a créé un mint portant l'extension
de hook de transfert en une transaction, avec le programme de hook correctement
enregistré dans l'extension à la relecture. Taille du mint dans cette
configuration : 234 octets.

Vérification faite en l'exerçant, pas en lisant sa présence : le compte du
programme ne fait que 36 octets, la forme d'un programme évolutif qui porte ses
données ailleurs, et un tel compte peut être présent sans être invocable.

Conséquence : les tâches 2 à 5 se testent intégralement en processus, sans
validateur local ni fourche du mainnet. Ces derniers restent nécessaires pour le
seul chemin Jupiter Swap, qui relève de l'allocateur.

## Deux pièges rencontrés à la tâche 3

**La pile BPF déborde silencieusement.** Le dépôt manipule dix comptes dont sept
structures désérialisées, et l'instruction échouait avant même d'entrer dans le
gestionnaire, sur un « Access violation in stack frame 5 » qui ne nomme pas sa
cause. Chaque frame BPF est plafonnée à 4 Ko. Remède : mettre les comptes
désérialisés sur le tas. À appliquer d'emblée à toute instruction dépassant
quelques comptes, plutôt que d'attendre l'erreur.

**Un test négatif passe pour n'importe quelle raison.** Au rouge de la tâche 3,
les deux tests de refus étaient au vert alors que rien n'était implémenté : le
gestionnaire paniquait sur son `todo!()`, la transaction échouait, et
`is_err()` s'en satisfaisait. Un `todo!()` non implémenté, une contrainte de
compte mal câblée et un refus légitime y étaient indiscernables.

Correction : les tests de refus lisent le **code d'erreur** et non le seul
échec. Le durcissement a été éprouvé par mutation, en traduisant une erreur du
module pur vers une autre variante : le test tombe, donc il discrimine.

## Tâches

**1. Module d'arithmétique pure.** Les deux fonctions et leurs erreurs typées,
en test d'abord, couverture intégrale. Aucune dépendance à Anchor.

**2. État du coffre et instruction d'initialisation.** Compte PDA, mint des parts
en Token-2022 avec l'extension de hook, compte de jeton du coffre, compte mort.

**3. Dépôt.** Câblage : lire les soldes, appeler la fonction pure, émettre les
parts, transférer l'actif. État d'abord, appel externe ensuite.

**4. Retrait.** Symétrique.

**5. Pause administrateur.**

Périmètre tranché à l'écriture : suspendre bloque dépôts et retraits, et **rien
d'autre**. Les parts restent transférables entre porteurs éligibles, le hook
n'ayant pas connaissance de la pause. C'est délibéré : une suspension protège le
coffre d'une anomalie sur ses propres flux, elle ne gèle pas le marché
secondaire des parts. Geler ce dernier demanderait de faire lire l'état du
coffre au hook à chaque transfert, donc de coupler deux programmes que la
conception a précisément séparés.

Basculer vers l'état courant est admis plutôt que refusé : c'est idempotent, et
un refus obligerait tout appelant à lire l'état avant d'agir. En situation
d'incident, on veut pouvoir suspendre sans savoir si quelqu'un vient de le
faire.

**6. Intégration continue.** Compilation, tests, format, clippy, et seuil de
couverture sur le module pur.

Chiffre à connaître avant d'écrire ce seuil, relevé à la tâche 2 : le module
d'arithmétique se mesure à 100 %, mais le **total de l'espace de travail tombe à
87 %** dès qu'un gestionnaire d'instruction existe, puisqu'il ne s'exécute qu'en
BPF. Le seuil doit donc porter sur le module pur nommément, jamais sur le total,
sans quoi il baissera mécaniquement à chaque instruction ajoutée et finira par
être desserré pour de mauvaises raisons. C'est le pendant Solana du filtre
d'exclusion qui rendait le seuil mordant sur la version Soroban.

Chaque tâche est une PR. Le hook de conformité et son propre jeu de tests, dont
les six cas arrêtés au verdict S1, font l'objet d'un chantier distinct.

## Hors périmètre

L'allocateur, le schéma d'événements, les frais de performance. Le coffre est
d'abord un coffre de garde pure : la stratégie se branche derrière l'interface de
dépôt et de retrait sans casser le ratio de parts, comme sur la version Soroban.
