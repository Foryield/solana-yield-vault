# solana-yield-vault

Open-source Solana programs for a DeFi yield vault whose holder eligibility is
enforced by the token program itself rather than by an off-chain layer.

> **Status: design phase.** No program is deployed yet. The architecture and the
> opening de-risking plan are written and reviewable; code follows once the
> blocking spikes have returned a verdict. Every claim in this repository is
> either verified on-chain or explicitly marked as an open question.

## What this builds

1. **`programs/yield-vault`** — deposit USDC or EURC, mint proportional shares,
   withdraw, admin emergency pause. Shares are a Token-2022 mint.
2. **`programs/compliance-hook`** — a standalone Token-2022 transfer hook
   enforcing an eligibility allowlist at the token level. Any Solana protocol can
   fork this one alone.
3. **`programs/allocator`** — routes capital across Solana lending and strategy
   venues, one adapter per venue, with per-protocol caps and an emergency
   withdrawal path.
4. **An open compliance event schema** — an auditable trail for every deposit,
   redemption, fee accrual and reallocation, published as a free-standing
   versioned specification with a reference implementation.

Components 2 and 4 are designed to be forked on their own: a protocol with no
relationship to this project should be able to take the hook alone, or the
schema alone, without pulling in the rest.

## Documentation

Start at [`docs/README.md`](./docs/README.md), which indexes everything and
tracks what is blocking. Working documents are in French; code, comments and
root-level documents are in English.

- [Architecture and design decisions](./docs/plans/2026-07-31-solana-yield-vault-design.md)
  (French) — scope, verified devnet inventory, programme architecture, proof
  strategy.
- [Opening spikes](./docs/plans/2026-07-31-spikes-ouverture.md) (French) — seven
  time-boxed questions to answer before writing programme code.
- [Evidence log](./docs/evidence/) — one file per deliverable, every proof
  recorded the day it is produced.
- [How to contribute](./CONTRIBUTING.md) — where to start, the working rules,
  and why proofs must name their cluster.

## Verified devnet inventory

Read on-chain against `https://api.devnet.solana.com` on 2026-07-31. Deposit
assets are Circle's devnet USDC and EURC, both owned by the classic SPL token
program; shares will be Token-2022, so the vault handles two token programs.

Lending venues available on devnet: Kamino, marginfi (at a devnet-specific
program id, **not** its mainnet one) and Jupiter Lend. Strategy and swap venues:
Drift, Meteora DLMM and Orca Whirlpool.

**Jupiter Swap is not deployed on devnet.** Only Jupiter Lend is. On devnet the
aggregator address is a System-owned account with zero bytes of data, and the
quote API answers `TOKEN_NOT_TRADABLE` for devnet mints. Devnet rebalancing
therefore goes through Jupiter Lend; the swap leg uses Orca or Meteora on devnet
and Jupiter Swap on mainnet, proven against a mainnet-forked local validator.
Every proof names its cluster. Nothing here will claim Jupiter Swap routing runs
on devnet.

Full addresses and account counts are in section 2 of the design document.

## Prior art

This repository is the Solana counterpart of
[`soroban-yield-vault`](https://github.com/Foryield/soroban-yield-vault), the
same vault built on Stellar. Share maths, rounding conventions, first-depositor
inflation protection, state-before-external-call ordering and the evidence
discipline are carried over rather than reinvented.

## License

[MIT](./LICENSE)
