//! Shared by every module: the policy check, the ledger moves, the log and the storage billing.

use near_sdk::json_types::U128;
use near_sdk::{env, AccountId, NearToken, PublicKey};

use crate::*;

impl Leash {
    // ---- internals -----------------------------------------------------------------------

    /// An owner method must come from a key that has no policy. The owner's own full-access key never
    /// has one, and an agent key always does, so an agent can never approve its own request even if
    /// someone widened its method list by mistake.
    pub(crate) fn owner_caller(&self) -> AccountId {
        let owner = env::predecessor_account_id();
        let key = env::signer_account_pk();
        assert!(self.policies.get(&(owner.clone(), key)).is_none(), "an agent key cannot manage policies");
        owner
    }

    pub(crate) fn request_ttl_of(&self, owner: &AccountId) -> u64 {
        self.request_ttl.get(owner).copied().unwrap_or(DEFAULT_REQUEST_TTL_SECS)
    }

    pub(crate) fn storage_of(&self, owner: &AccountId) -> u128 {
        self.storage.get(owner).copied().unwrap_or(0)
    }

    /// Bill the bytes this call added to the owner's storage credit. Bytes freed are credited back,
    /// so a revoke or a decided request costs nothing. A call that would overdraw the credit fails,
    /// which is the owner's signal to top up; the contract never pays for state itself.
    pub(crate) fn charge(&mut self, owner: &AccountId, before: u64) {
        // The store collections keep writes in memory until the call ends, so without a flush the
        // measurement would always read zero bytes added.
        self.policies.flush();
        self.keys.flush();
        self.vaults.flush();
        self.paused.flush();
        self.storage.flush();
        self.requests.flush();
        self.logs.flush();
        self.proposals.flush();
        self.request_ttl.flush();
        self.seen.flush();
        self.raises.flush();
        self.asks.flush();
        self.tasks.flush();
        self.task_of.flush();
        self.settle(owner, before, env::storage_usage());
    }

    pub(crate) fn settle(&mut self, owner: &AccountId, before: u64, after: u64) {
        let credit = self.storage_of(owner);
        let byte = env::storage_byte_cost().as_yoctonear();
        let next = if after >= before {
            let cost = u128::from(after - before) * byte;
            assert!(credit >= cost, "owner has no storage credit: deposit_storage first");
            credit - cost
        } else {
            credit + u128::from(before - after) * byte
        };
        self.storage.insert(owner.clone(), next);
    }

    pub(crate) fn vault_of(&self, owner: &AccountId, token: &AccountId) -> u128 {
        self.vaults.get(&(owner.clone(), token.clone())).copied().unwrap_or(0)
    }

    /// The raise in force for this key, if one was granted and has not lapsed.
    pub(crate) fn raise_of(&self, owner: &AccountId, key: &PublicKey) -> Option<Raise> {
        self.raises.get(&(owner.clone(), key.clone())).filter(|r| r.until > env::block_timestamp()).cloned()
    }

    /// The caps that apply right now: the policy's, or a live raise's where it names one.
    pub(crate) fn caps(&self, owner: &AccountId, key: &PublicKey, policy: &Policy) -> (u128, u128) {
        let raise = self.raise_of(owner, key);
        let daily = raise.as_ref().and_then(|r| r.daily_cap).map_or(policy.daily_cap.0, |c| c.0);
        let per_payment = raise.as_ref().and_then(|r| r.per_payment_cap).map_or(policy.per_payment_cap.0, |c| c.0);
        (daily, per_payment)
    }

    pub(crate) fn remaining(&self, owner: &AccountId, key: &PublicKey) -> U128 {
        if let Some(task) = self.task_for(owner, key) {
            let left = task.budget.0.saturating_sub(task.spent.0);
            return U128(left.min(self.remaining(owner, &task.parent).0));
        }
        match self.policies.get(&(owner.clone(), key.clone())) {
            Some(policy) => {
                let now = env::block_timestamp();
                let spent = if policy.day_started_at == 0 || now.saturating_sub(policy.day_started_at) >= DAY_NS { 0 } else { policy.spent_today.0 };
                U128(self.caps(owner, key, policy).0.saturating_sub(spent))
            }
            None => U128(0),
        }
    }

    pub(crate) fn preflight(&self, owner: &AccountId, key: &PublicKey, to: &AccountId, amount: u128) -> Preflight {
        let refuse = |reason: &str, can_request: bool, remaining: U128, vault: U128| Preflight {
            ok: false,
            reason: Some(reason.to_string()),
            can_request,
            remaining_today: remaining,
            vault,
        };
        let Some(policy) = self.policies.get(&(owner.clone(), key.clone())) else {
            if let Some(task) = self.task_for(owner, key) {
                return self.task_preflight(owner, &task, to, amount);
            }
            return refuse("no policy for this key", false, U128(0), U128(0));
        };
        let vault = U128(self.vault_of(owner, &policy.token));
        let remaining = self.remaining(owner, key);
        if !policy.active {
            return refuse("key revoked", false, remaining, vault);
        }
        if self.is_paused(owner.clone()) {
            return refuse("owner paused all keys", false, remaining, vault);
        }
        let now = env::block_timestamp();
        if policy.expires_at != 0 && now / NS_PER_SEC >= policy.expires_at {
            return refuse("key expired", false, remaining, vault);
        }
        if amount == 0 {
            return refuse("amount is zero", false, remaining, vault);
        }
        let raise = self.raise_of(owner, key);
        let (_, per_payment_cap) = self.caps(owner, key, policy);
        let raised_allow = raise.as_ref().is_some_and(|r| r.allow.contains(to));
        if !policy.allowlist.is_empty() && !policy.allowlist.contains(to) && !raised_allow {
            return refuse("recipient not in allowlist", true, remaining, vault);
        }
        if policy.last_paid_at != 0 && now.saturating_sub(policy.last_paid_at) < policy.cooldown_secs * NS_PER_SEC {
            return refuse("cooldown not elapsed", true, remaining, vault);
        }
        if amount > per_payment_cap {
            return refuse("over per-payment cap", true, remaining, vault);
        }
        if amount > remaining.0 {
            return refuse("over daily cap", true, remaining, vault);
        }
        if amount > vault.0 {
            return refuse("vault too low", false, remaining, vault);
        }
        Preflight { ok: true, reason: None, can_request: true, remaining_today: remaining, vault }
    }

    pub(crate) fn transfer(
        &mut self,
        owner: AccountId,
        key: PublicKey,
        token: AccountId,
        to: AccountId,
        amount: u128,
        memo: Option<String>,
        counted: bool,
        payment_id: Option<String>,
    ) -> near_sdk::Promise {
        ext_ft::ext(token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(to.clone(), U128(amount), memo)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_pay(owner, key, token, to, U128(amount), counted, payment_id),
            )
    }

    pub(crate) fn record(&mut self, owner: &AccountId, key: Option<&PublicKey>, event: &str, to: Option<&AccountId>, amount: Option<U128>, detail: Option<&str>) {
        let mut entries = self.logs.get(owner).cloned().unwrap_or_default();
        entries.push(LogEntry {
            at: env::block_timestamp(),
            key: key.cloned(),
            event: event.to_string(),
            to: to.cloned(),
            amount,
            detail: detail.map(|d| d.to_string()),
        });
        if entries.len() > LOG_LIMIT {
            let excess = entries.len() - LOG_LIMIT;
            entries.drain(0..excess);
        }
        self.logs.insert(owner.clone(), entries);
    }
}
