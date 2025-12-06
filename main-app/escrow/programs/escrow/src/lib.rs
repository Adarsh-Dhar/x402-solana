use anchor_lang::prelude::*;

declare_id!("DccimEEydWnNLzaBX5CCFYvEMfZ1VRiakZpEKJBVwJUN");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
