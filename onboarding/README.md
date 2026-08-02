# @foryield/solana-yield-vault-onboarding

Le parcours ou l'utilisateur ne manipule ni extension de navigateur ni phrase de
recuperation : le portefeuille est cree par un fournisseur de garde a partir
d'un simple identifiant, il signe sur demande, et il depose dans le coffre de
demonstration. **Devnet uniquement, et le paquet le verifie.**

Cinq briques, chacune autonome, chacune imprimant **une ligne JSON** sur la
sortie standard et ses erreurs sur la sortie d'erreur. C'est ce qui les rend
appelables en sous-processus depuis n'importe quel dorsal, quel que soit son
langage.

## Mise en place

```bash
mkdir -p ~/.config/foryield
cp .env.example ~/.config/foryield/solana-onboarding.env
chmod 600 ~/.config/foryield/solana-onboarding.env
npm install
```

**Le fichier d'identifiants vit hors de ce depot, exprès.** Ce depot est public,
et ces valeurs sont un jeton de compte de service et une cle de signature. Un
fichier pose dans l'arbre de travail est a un `git add -f`, a une regression de
`.gitignore` ou a une archive de repertoire de sa publication. Il n'existe aucun
repli vers un `.env` local : un repli restaurerait le risque en silence.
`ONBOARDING_ENV_FILE` deplace le fichier ; les variables deja exportees
l'emportent sur lui.

## Les trois verrous d'environnement

Ce paquet est le premier endroit du depot qui touche des identifiants de garde.
Il n'y entre donc que des identifiants de test, et cela repose sur trois choses,
pas sur une seule.

**Le compte de service** doit etre dedie a cette demonstration et cadre a ses
seules operations : creer un portefeuille, le relire, creer une transaction, et
relire cette transaction. Quatre, plus la creation de cle que le fournisseur
ajoute de lui-meme. Rien d'autre : ni mise a jour, ni etiquettes, ni transferts
natifs, ni permissions, ni politiques. C'est un geste d'exploitation, que le
paquet ne peut pas verifier lui-meme.

**Le reseau** est `SolanaDevnet`, fige dans le code, et il n'existe aucune
variable d'environnement pour s'en ecarter. C'est le seul des trois verrous
qu'un programme puisse tenir, et il remplace un controle qu'on avait cru
possible : le fournisseur n'a pas d'API de bac a sable, un seul hote sert le
mainnet et les reseaux de test, donc aucune verification d'URL ne separe la
production du reste. En complement, toute brique qui touche la chaine lit son
**empreinte de genese** et refuse de continuer si ce n'est pas celle de devnet.
Un point d'acces peut s'appeler comme il veut ; sa chaine de genese, non.

**La residence des identifiants** est hors du depot, sans repli, et un test de
non-regression echoue si le chemin par defaut resout un jour a l'interieur.

## Les briques

**Provisionner** : creer le portefeuille chez le fournisseur.

```bash
npm run provisionner -- <identifiant>
# {"identifiant":"...","reseau":"SolanaDevnet","walletId":"wa-...","adresse":"..."}
```

**Financer** : doter l'adresse en SOL et en actif, et ouvrir ses deux comptes de
jeton. Signe avec la cle de tresorerie. C'est la brique que la version Stellar
n'a pas. Solana a bien un robinet appelable par RPC, `requestAirdrop`, mais il
est a sec en pratique (mesure du 02/08 : erreur interne a 1 SOL, 429 a 0,5 SOL)
et surtout il ne distribue que du SOL. L'actif depose, lui, n'a aucun robinet
appelable par programme : celui de son emetteur est une page web plafonnee a
deux demandes par tranche de huit heures et par adresse. Cette brique serait
donc necessaire meme si l'airdrop repondait.

```bash
npm run financer -- <adresse> [actif-en-unites] [lamports]
# {"beneficiaire":"...","lamports":"10000000","actif":"500000","comptes":{...},"signature":"..."}
```

**Enveloppe** : composer la transaction de depot, non signee. **Aucun
identifiant de garde n'est lu ici** : composer ne demande aucun pouvoir de
signature. L'empreinte de bloc qu'elle porte expire en quelques dizaines de
secondes.

```bash
npm run enveloppe -- <adresse-du-deposant> <montant-en-unites>
# {"deposant":"...","montant":"500000","hex":"0x...","comptes":{...}}
```

**Diffuser** : faire signer et diffuser par le fournisseur, puis attendre
l'inclusion on-chain. Deux attentes se suivent, et elles ne portent pas sur la
meme chose : une demande de diffusion est **asynchrone**, elle passe par
`Pending` puis `Executing` avant `Broadcasted`, et ces etats deviendront la
regle sous une politique d'approbation. La brique relit donc la demande jusqu'a
un etat terminal, puis seulement interroge le reseau. C'est aussi pourquoi la
relecture des transactions figure dans les operations du compte.

```bash
npm run diffuser -- <walletId> <transaction-hex>
# {"walletId":"wa-...","signature":"...","slot":123,"aboutie":true,"lien":"https://explorer..."}
```

**Parcours** : la chaine entiere, depuis un seul identifiant.

```bash
npm run parcours -- <identifiant> [montant-en-unites]
```

L'ordre n'est pas interchangeable : l'enveloppe se construit **apres** la
dotation et juste avant la diffusion, parce qu'elle porte une empreinte de bloc
qui expire. La construire plus tot fait echouer la chaine sur une transaction
expiree, ce qui ressemble a une panne du fournisseur alors que c'est une faute
d'ordonnancement.

## Codes de sortie

`0` succes, `1` erreur, `2` transaction incluse mais en echec on-chain, le
resume etant imprime quand meme. Le `2` existe parce qu'un depot refuse par une
regle du programme n'est pas une panne : la chaine a tenu, le geste a ete
refuse, et confondre les deux ferait passer une regle appliquee pour un
incident.

## Ce qui se verifie sans aucun identifiant

`npm test` et `npx tsc --noEmit` tournent sans configuration ni compte : la
composition d'enveloppe, la lecture de configuration, l'ordonnancement du
parcours, la traduction des refus et les codes de sortie sont tous hors ligne.
C'est ce que l'integration continue execute. Seuls les appels reels au
fournisseur demandent un compte, et ils constituent la preuve, consignee dans
`docs/evidence/`.

## Notes

- Le nom du portefeuille est l'identifiant brut dans cette demonstration. Ne pas
  transporter ce choix vers un usage reel sans traiter ce nom comme une donnee
  personnelle.
- `DFNS_CRED_ID` **n'est pas reclame**. Le signataire fourni par le SDK l'exige
  en argument de constructeur, mais en lisant son code on voit qu'il ne s'en
  sert que pour verifier qu'il figure parmi les credentials que le defi
  autorise, puis le recopier. Le defi porte deja cette liste : notre signataire
  l'y lit (`src/signataire.ts`), comme le fait le dorsal de la maison depuis
  longtemps. La variable ne reste utile que pour trancher entre plusieurs
  credentials de type cle sur un meme compte, et l'erreur les enumere alors.
- Les montants sont en unites minimales. Aucun flottant n'entre dans un montant,
  ici comme ailleurs dans ce depot.
