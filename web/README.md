# Demonstration web - devnet

Interface minimale du coffre : deposer, retirer, et **transferer des parts**,
qui est la seule surface ou le controle d'eligibilite se voit.

Aucune logique de composition ici. Les instructions viennent du paquet
`@foryield/solana-yield-vault-client`, qui ne depend ni d'un portefeuille ni
d'un navigateur ; cette page se contente de fournir le signataire, la ligne de
commande d'administration fournit le sien. C'est ce qui evite d'ecrire deux fois
la derivation des comptes.

## Pile

- Next.js 14 en export statique : pas de serveur, pas de demarrage a froid
- `@solana/wallet-adapter-react` pour la connexion, sans liste d'adaptateurs :
  les portefeuilles se declarent par le Wallet Standard, qui les decouvre seul

## En local

```bash
cp .env.example .env.local
npm ci --prefix ../client   # le paquet client se construit a son installation
npm ci
npm run dev                 # http://localhost:3000
```

## Variables

Toutes obligatoires, aucune valeur par defaut. Une valeur manquante arrete la
page en nommant ce qui manque, plutot que d'afficher des soldes faux avec
l'aplomb des vrais. Les valeurs de devnet sont dans `.env.example`, et le
blueprint `render.yaml` porte les memes.

| Variable | Sens |
|---|---|
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Point d'acces. Un hote de production est REFUSE |
| `NEXT_PUBLIC_VAULT_PROGRAM_ID` | Programme du coffre |
| `NEXT_PUBLIC_HOOK_PROGRAM_ID` | Programme du module de conformite |
| `NEXT_PUBLIC_DEPOSIT_MINT` | Actif depose |
| `NEXT_PUBLIC_PORTEUR_AUTORISE` | Prereglage de transfert, sur la liste |
| `NEXT_PUBLIC_PORTEUR_NON_AUTORISE` | Prereglage de transfert, hors liste |

## Ce que la page montre

Deposer et retirer sont ouverts a tous : une frappe et une destruction ne sont
pas des transferts, donc le hook ne les voit jamais. Transferer, en revanche,
passe par la liste : vers un porteur autorise le transfert aboutit, vers un
autre il est refuse, et **le motif du refus s'affiche dans les mots du
programme** plutot qu'en code hexadecimal.

## Tests

```bash
npm test
```

Ils ne touchent pas le reseau et portent sur les trois endroits ou la page peut
mentir sans qu'aucun type ne s'en apercoive : la traduction d'un refus,
l'affichage d'un montant et la lecture d'une saisie.
