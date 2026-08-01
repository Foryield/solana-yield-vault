# Instance devnet - coffre USDC et son module de conformité

## 2026-08-01 - Un coffre existe sur l'USDC de Circle, gouverné par le hook

**Ce que ça prouve** : les deux programmes fonctionnent ensemble contre le
réseau, sur un actif réel et non sur un jeton fabriqué pour l'occasion. Jusqu'ici
tout le comportement n'était éprouvé qu'en simulateur.

**Cluster** : Solana **devnet** (`https://api.devnet.solana.com`).

| Élément | Adresse |
|---|---|
| Actif déposé - USDC de Circle | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Coffre | `SWmEZGD1QjPZZqPXBkRfVsmbZpTEd18uJ3RgMEJCwVW` |
| Mint des parts (Token-2022) | `4R5iTggafNoLwo4KDQsPS8981eqeFw35gUB2JDm6Q5ps` |
| Compte d'actif du coffre | `6CDYZCWjqjq8zkYwdEVqJg3KdSUL6AH52zuY7sZYUPaS` |
| Compte des parts mortes | `BnXh3avVK3PvMUes1cyKuzmjLopjW4vyd7mFAfTCNvEa` |
| Configuration du hook | `6k2tFZzAaVCmGSbj4Bx8Jo3NL42jdiowXos4sbCsjXkN` |
| Liste de comptes supplémentaires | `HVMJRsxz7yUF4MQ88uRHLX6pLMfKkAMWxoWZimBAu9SE` |
| Administrateur | `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP` |

**Signatures.** Initialisation du coffre :
[`3vaMGWDs…d1fn`](https://explorer.solana.com/tx/3vaMGWDsTuSbtEsKAtQsbxXGMWvSym3KucfdwTe61BSEeBj2qtqgKCD8SpT1ofDwSrFafv6gb38VsLXNciUZd1fn?cluster=devnet).
Attachement du hook au mint des parts :
[`5a64G8ik…pemr`](https://explorer.solana.com/tx/5a64G8ikjaGaJ91nVc3hAsdZENTcVrdNyHLtSHU3iBKpqLrXMoSQS6Ro2c1afbXz7P6mDmponn1fBrJBpXPipemr?cluster=devnet).

**Coût.** 0,011 SOL pour les deux opérations, dépôts de non-expiration compris.
Solde d'exploitation 3,288 → 3,277 SOL.

## Le raccordement, relu on-chain

Le point que rien n'avait encore prouvé contre le réseau est que le coffre et le
hook se connaissent. Relu depuis le mint des parts, avec la bibliothèque de
Token-2022 plutôt qu'un décodage maison :

- **six décimales**, alignées sur celles de l'USDC ;
- **offre nulle**, aucun dépôt n'ayant eu lieu ;
- **autorité d'émission** : le PDA du coffre, donc lui seul peut créer des
  parts ;
- **programme de hook** : le module de conformité déployé ;
- **autorité du hook** : le PDA du coffre.

La liste de comptes supplémentaires, que Token-2022 lira à chaque transfert,
existe et appartient bien au module de conformité.

**Les adresses correspondent exactement aux fixtures** utilisées par les tests.
La dérivation TypeScript est donc confrontée à celle des programmes de quatre
façons désormais : par les fixtures produites en Rust, par les tests
d'instructions contre l'IDL, par la lecture d'état, et par la création réelle
de ces comptes.

## Ce que cette entrée ne prouve pas encore

**Aucun dépôt n'a été exécuté.** Le compte d'actif du coffre est vide et l'offre
de parts est nulle. Déposer demande de l'USDC de test, dont le robinet de Circle
est limité par adresse : c'est une dépendance d'approvisionnement, pas une
dépendance technique.

Le transfert de parts entre porteurs, qui est la seule surface où le contrôle
d'éligibilité se voit, n'a pas non plus été exercé sur le réseau. Il l'est en
simulateur par les six cas du spike de dérisquage.

> **Les deux réserves sont levées le 2026-08-01** : le dépôt et le retrait dans
> `depot-retrait-devnet.md`, le transfert et son refus dans
> `compliance-hook.md`.
