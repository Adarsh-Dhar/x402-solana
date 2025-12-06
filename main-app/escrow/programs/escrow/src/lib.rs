use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("DccimEEydWnNLzaBX5CCFYvEMfZ1VRiakZpEKJBVwJUN");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, usdc_mint: Pubkey) -> Result<()> {
        let escrow_state = &mut ctx.accounts.escrow_state;
        escrow_state.authority = ctx.accounts.authority.key();
        escrow_state.usdc_mint = usdc_mint;
        escrow_state.bump = ctx.bumps.escrow_state;
        
        msg!("Escrow initialized with authority: {:?}", escrow_state.authority);
        msg!("USDC mint: {:?}", escrow_state.usdc_mint);
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, agent_id: String, amount: u64) -> Result<()> {
        require!(agent_id.len() <= 64, EscrowError::InvalidAgentId);
        require!(amount > 0, EscrowError::InvalidAmount);

        // Transfer USDC from user to escrow token account
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Update or create agent balance
        let agent_balance = &mut ctx.accounts.agent_balance;
        
        // If account already exists, verify agent_wallet matches
        if agent_balance.agent_id != "" {
            require!(
                agent_balance.agent_wallet == ctx.accounts.agent_wallet.key(),
                EscrowError::InvalidAgentWallet
            );
            require!(
                agent_balance.agent_id == agent_id,
                EscrowError::InvalidAgentId
            );
        } else {
            // First time creating the account
            agent_balance.agent_id = agent_id.clone();
            agent_balance.escrow_state = ctx.accounts.escrow_state.key();
            agent_balance.agent_wallet = ctx.accounts.agent_wallet.key();
            agent_balance.balance = 0;
        }
        
        agent_balance.balance = agent_balance.balance.checked_add(amount).ok_or(EscrowError::Overflow)?;

        msg!("Deposited {} USDC for agent: {}", amount, agent_id);
        msg!("Agent balance: {}", agent_balance.balance);
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);

        let agent_balance = &mut ctx.accounts.agent_balance;
        
        // Verify the signer is the agent wallet
        require!(
            ctx.accounts.agent_wallet.key() == agent_balance.agent_wallet,
            EscrowError::UnauthorizedWithdrawal
        );

        // Check sufficient balance
        require!(
            agent_balance.balance >= amount,
            EscrowError::InsufficientBalance
        );

        // Transfer USDC from escrow to agent's token account
        let escrow_state = &ctx.accounts.escrow_state;
        let seeds = &[
            b"escrow_state".as_ref(),
            &[escrow_state.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.agent_token_account.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        // Update agent balance
        agent_balance.balance = agent_balance.balance.checked_sub(amount).ok_or(EscrowError::Underflow)?;

        msg!("Withdrew {} USDC for agent: {}", amount, agent_balance.agent_id);
        msg!("Remaining balance: {}", agent_balance.balance);
        Ok(())
    }
}

#[account]
pub struct EscrowState {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

impl EscrowState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // usdc_mint
        1;   // bump
}

#[account]
pub struct AgentBalance {
    pub agent_id: String,
    pub balance: u64,
    pub escrow_state: Pubkey,
    pub agent_wallet: Pubkey,
}

impl AgentBalance {
    pub const MAX_AGENT_ID_LEN: usize = 64;
    pub const LEN: usize = 8 + // discriminator
        4 + Self::MAX_AGENT_ID_LEN + // agent_id (String with length prefix)
        8 + // balance
        32 + // escrow_state
        32;  // agent_wallet
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = EscrowState::LEN,
        seeds = [b"escrow_state"],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = escrow_state,
        seeds = [b"escrow_token", escrow_state.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// CHECK: We're just reading the mint address
    pub usdc_mint: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(agent_id: String)]
pub struct Deposit<'info> {
    #[account(
        seeds = [b"escrow_state"],
        bump = escrow_state.bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"escrow_token", escrow_state.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        space = AgentBalance::LEN,
        seeds = [
            b"agent_balance",
            agent_id.as_bytes(),
            escrow_state.key().as_ref()
        ],
        bump
    )]
    pub agent_balance: Account<'info, AgentBalance>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    /// CHECK: Agent wallet address (not necessarily a signer for deposit)
    pub agent_wallet: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [b"escrow_state"],
        bump = escrow_state.bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"escrow_token", escrow_state.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            b"agent_balance",
            agent_balance.agent_id.as_bytes(),
            escrow_state.key().as_ref()
        ],
        bump
    )]
    pub agent_balance: Account<'info, AgentBalance>,

    /// CHECK: Agent wallet must sign to withdraw
    pub agent_wallet: Signer<'info>,

    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Invalid agent ID length")]
    InvalidAgentId,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Unauthorized withdrawal")]
    UnauthorizedWithdrawal,
    #[msg("Invalid agent wallet")]
    InvalidAgentWallet,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic underflow")]
    Underflow,
}
