//! Ce que Token-2022 appelle a chaque transfert de parts.
//!
//! Deux verifications, et elles ne protegent pas de la meme chose.
//!
//! La premiere est la GARDE DE TRANSFERT. Cette instruction est publique comme
//! n'importe quelle autre : rien n'empeche un tiers de l'invoquer directement
//! avec les comptes de son choix. Token-2022 pose un drapeau sur les deux
//! comptes pendant l'appel et le retire ensuite ; on l'exige. Un appel direct
//! n'a aucun moyen de le poser.
//!
//! La seconde est la LISTE D'AUTORISATION proprement dite, verifiee sur le
//! DESTINATAIRE. Un porteur eligible doit pouvoir sortir vers un tiers
//! eligible ; ce qu'on interdit, c'est qu'une part atterrisse chez quelqu'un
//! qui n'a pas franchi les controles d'entree.

use crate::{error::HookError, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

/// Comptes imposes par l'interface de hook de transfert, dans cet ordre exact.
/// L'entree de liste vient ensuite : Token-2022 la derive lui-meme depuis la
/// liste de comptes supplementaires, a partir du proprietaire du compte de
/// destination.
#[derive(Accounts)]
pub struct Execute<'info> {
    /// AUCUNE contrainte d'autorite ici, et c'est deliberé. Lors d'un transfert
    /// DELEGUE, Token-2022 passe le delegataire en quatrieme compte, pas le
    /// proprietaire du compte source. Exiger `token::authority = owner`
    /// cassait donc toute delegation, y compris vers un destinataire autorise.
    ///
    /// Defaut trouve a la tache 4 en exigeant le CODE d'erreur d'un refus :
    /// le test attendait un echec, il l'obtenait, mais pour la mauvaise raison.
    /// L'autorisation de l'autorite est de toute facon verifiee par Token-2022
    /// AVANT l'appel du hook ; la revalider ici serait une garde dupliquee,
    /// donc une garde qui peut diverger.
    #[account(token::mint = mint)]
    pub source_token: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(token::mint = mint)]
    pub destination_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: autorite de la source, verifiee par Token-2022 lui-meme.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: liste de comptes supplementaires, lue par Token-2022.
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// Entree de liste du DESTINATAIRE. Son adresse est derivee par Token-2022
    /// depuis les donnees du compte de destination, donc l'appelant ne peut pas
    /// en designer une autre. La contrainte de graines la revalide ici : si le
    /// drapeau de transfert venait a etre contournable, cette seconde barriere
    /// tiendrait encore.
    ///
    /// `UncheckedAccount` deliberement : quand l'entree n'existe pas, le compte
    /// derive est vide, et on veut rendre « non autorise » plutot que « compte
    /// non initialise ». Le refus doit nommer sa cause metier.
    ///
    /// CHECK: verifie a la main ci-dessous.
    #[account(
        seeds = [ALLOW_SEED, mint.key().as_ref(), destination_token.owner.as_ref()],
        bump,
    )]
    pub destination_entry: UncheckedAccount<'info>,
}

pub fn handle_execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    require!(en_cours_de_transfert(&ctx)?, HookError::NotATransfer);

    let entry = &ctx.accounts.destination_entry;
    require!(
        entry.owner == ctx.program_id && !entry.data_is_empty(),
        HookError::NotAllowed
    );

    // Deserialisation complete plutot que simple test d'existence : un compte
    // detenu par ce programme mais d'un AUTRE type serait accepte par le seul
    // test de proprietaire. Le discriminant Anchor ferme cette porte.
    let data = entry.try_borrow_data()?;
    let mut tranche: &[u8] = &data;
    let entree =
        AllowlistEntry::try_deserialize(&mut tranche).map_err(|_| HookError::NotAllowed)?;
    require_keys_eq!(
        entree.holder,
        ctx.accounts.destination_token.owner,
        HookError::NotAllowed
    );

    Ok(())
}

/// Lit le drapeau que Token-2022 pose sur le compte source pendant un
/// transfert. Absent hors transfert, donc impossible a poser par un appelant
/// direct.
fn en_cours_de_transfert(ctx: &Context<Execute>) -> Result<bool> {
    use spl_token_2022::extension::{
        transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions,
    };

    let info = ctx.accounts.source_token.to_account_info();
    let data = info.try_borrow_data()?;
    let etat = StateWithExtensions::<spl_token_2022::state::Account>::unpack(&data)
        .map_err(|_| HookError::NotATransfer)?;
    match etat.get_extension::<TransferHookAccount>() {
        Ok(ext) => Ok(bool::from(ext.transferring)),
        Err(_) => Ok(false),
    }
}
