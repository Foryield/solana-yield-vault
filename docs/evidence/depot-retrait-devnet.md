# Dépôt et retrait sur devnet - USDC et EURC de Circle

## 2026-08-01 - Le cycle complet, sur les deux actifs réels

**Ce que ça prouve** : dépôt, émission de parts proportionnelles, retrait
partiel et retrait intégral fonctionnent contre le réseau, sur les actifs émis
par Circle et non sur un jeton fabriqué pour l'occasion. **La réserve inscrite
dans les journaux précédents est levée.**

**Cluster** : Solana **devnet** (`https://api.devnet.solana.com`).

### USDC - `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

Coffre `SWmEZGD1QjPZZqPXBkRfVsmbZpTEd18uJ3RgMEJCwVW`, parts
`4R5iTggafNoLwo4KDQsPS8981eqeFw35gUB2JDm6Q5ps`.

| Opération | Effet mesuré | Signature |
|---|---|---|
| Dépôt de 10 USDC | 9 999 000 parts au déposant, **1 000 parts mortes verrouillées** | [`5wtaJ2QL…uhVL`](https://explorer.solana.com/tx/5wtaJ2QLWPpcrpPMakb8eYZUHYNnnxxR89SzG5wE7xND9pSeD88SkHgrviu382nt9fLc5NdqSJu3ofwaF2LDuhVL?cluster=devnet) |
| Retrait de 3 000 000 parts | 3 USDC restitués, coffre à 7 000 000 | [`4iWB3DpG…fER7`](https://explorer.solana.com/tx/4iWB3DpGAHYwZdFNv2vR4n4vTwqXetPsbbNfWa1szomAFsmrLpjsWPRf66AtVDvnAWQjR3YTaqxK1xt7PY9afER7?cluster=devnet) |
| Retrait des 6 999 000 parts restantes | porteur à 0 part, **coffre à exactement 1 000** | [`369xdjjh…ioJu`](https://explorer.solana.com/tx/369xdjjhtuZX42r8D5jiWHvZXHMG9dsmpTkiU7AqRiVyGxD1hwDRgNqTsJFhyRv9BqjpAacktazZn3VUFUR7ioJu?cluster=devnet) |

Le porteur repart avec 19 999 000 unités sur les 20 000 000 dont il disposait.
L'écart de 1 000, soit un millième d'USDC, est la contrepartie des parts mortes,
immobilisée à jamais. C'est le coût du modèle, annoncé au plan d'implémentation
avant d'être écrit, et le voici mesuré.

### EURC - `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr`

Coffre `3HDgK4vurCfZRU8cPTJAH3KVEcbsypHzefqLtVXYpXAq`, parts
`DvXRRdbpuBisRY2q5G6Gi7R9rwcyGFJwb1p5wJxY9grb`, configuration du hook
`BaLxiBjKyEcBbY1bQFqnJHckPPdVQQKmvWbNumZKkjn2`.

| Opération | Signature |
|---|---|
| Initialisation | [`5GjZBV59…tSYJ`](https://explorer.solana.com/tx/5GjZBV59CCGKd4WXdgn6FUZ2cAtKsDrW8idcuScSex3EoeKC8Z8Bx7hhT9XoycxhLWVKhJoW3VYAhYCnUJwptSYJ?cluster=devnet) |
| Dépôt de 5 EURC | [`3mrAfjC8…7S8X`](https://explorer.solana.com/tx/3mrAfjC8htmCtD1rsbXi61n99zzdKqsvN5W5SaQ8onPDvUit4oFQjhB2heNpxxa51JLAm9uKuNgZSbYuG7LZ7S8X?cluster=devnet) |
| Retrait intégral | [`5rENHLdk…sUFm`](https://explorer.solana.com/tx/5rENHLdk2tFPsKKpqtqu3hugVRd51deFG4TsZxx1oJbrs56oUze5uy9L3gyQHuedXpnNhBYmMdV6mUHkqU7zsUFm?cluster=devnet) |
| Attachement du hook | [`4HU2Viyn…N2SP`](https://explorer.solana.com/tx/4HU2ViynXkKXJCmHgTP9Fv1UUWRnWiGqMkzAaav5s3uvMMzFthZHJ42ghrmPF8Kb15N12W4GdTryVJV3oPzDN2SP?cluster=devnet) |

Comportement identique à l'unité près : 4 999 000 parts au déposant, 1 000
verrouillées, et 1 000 unités qui restent au coffre après retrait intégral.

## Ce que la séquence a confirmé sans qu'on le cherche

Le dépôt et le retrait sur EURC ont abouti **avant** que le hook soit attaché au
mint des parts. C'est une confirmation contre le réseau d'un point de conception
jusqu'ici seulement raisonné : une frappe et une destruction ne sont pas des
transferts, donc Token-2022 n'invoque pas le hook. Le contrôle d'éligibilité ne
porte que sur les mouvements entre porteurs.

Les montants mesurés correspondent exactement à ce que rend le module
d'arithmétique pure, éprouvé par 21 tests et couvert à 100 %. La fonction pure
et le réseau disent la même chose.

## Coût

0,027 SOL pour les onze opérations des deux cycles, dépôts de non-expiration
compris. Solde d'exploitation 13,288 → 13,261 SOL.

## Ce qui reste hors de portée de cette entrée

Le **transfert de parts entre porteurs**, seule surface où le contrôle
d'éligibilité se voit, n'est pas exercé ici. Il l'est en simulateur par les six
cas du spike de dérisquage, et il demandera un second porteur avec son propre
compte.

> **Levé le 2026-08-01**, le même jour : le transfert est exercé contre le
> réseau, refus compris, dans `compliance-hook.md`.
