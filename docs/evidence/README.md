# Evidence log

One file per deliverable. Every proof is recorded **the day it is produced**,
not reconstructed afterwards.

Planned files:

| File | Deliverable |
|---|---|
| `depot-retrait-devnet.md` | Deposit and withdrawal on real Circle USDC and EURC (**done**) |
| `devnet-instance.md` | Live devnet instance: vault on Circle USDC, hook attached (**done**) |
| `bootstrap.md` | Workspace, pinned toolchain, first devnet deployment (**done**) |
| `vault-core.md` | Anchor YieldVault on devnet: deposit, shares, withdraw, pause (**deployed**) |
| `compliance-hook.md` | Token-2022 transfer hook enforcing the eligibility allowlist (**done**) |
| `demonstration-web.md` | Public devnet demo: connect, deposit, withdraw, transfer (**live**) |
| `provisionnement-sous-garde.md` | Custody-provisioned wallet deposits with no extension and no seed phrase (**done**) |
| `allocator.md` | CPI into Kamino, marginfi and Jupiter Lend; strategy adapter (**Jupiter Lend deposit and withdrawal proven on devnet**; other venues pending) |
| `routing.md` | Best-execution swap and rebalancing; devnet and mainnet-fork proofs |
| `event-schema.md` | Compliance event schema v1 published as an open specification |

Each entry records:

- **Date** (UTC)
- **What it proves** (one line)
- **Transaction signature** + explorer link, with the cluster named explicitly
- **Program ID**, when a (re)deployment
- **Pull request** link, when code
- **Media** (screenshot / video) path or URL, when visual

Two rules that are not negotiable. The cluster is always named: a proof produced
on a mainnet-forked local validator is never presented as a devnet proof.
Nothing sensitive belongs here: public addresses only, and no key material.
