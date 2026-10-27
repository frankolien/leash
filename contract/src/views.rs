//! The read side. Nothing here changes state.

use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, PublicKey};

use crate::*;

#[near]
impl Leash {
    // ---- views ---------------------------------------------------------------------------

    pub fn get_policy(&self, owner: AccountId, public_key: PublicKey) -> Option<Policy> {
        self.policies.get(&(owner, public_key)).cloned()
    }

    pub fn get_policies(&self, owner: AccountId) -> Vec<(PublicKey, Policy)> {
        self.keys
            .get(&owner)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|k| self.policies.get(&(owner.clone(), k.clone())).cloned().map(|p| (k, p)))
            .collect()
    }

    pub fn get_vault(&self, owner: AccountId, token: AccountId) -> U128 {
        U128(self.vault_of(&owner, &token))
    }

    pub fn is_paused(&self, owner: AccountId) -> bool {
        self.paused.get(&owner).copied().unwrap_or(false)
    }

    /// Yocto NEAR of storage credit the owner still has.
    pub fn get_storage(&self, owner: AccountId) -> U128 {
        U128(self.storage_of(&owner))
    }

    pub fn check(&self, owner: AccountId, public_key: PublicKey, to: AccountId, amount: U128) -> Preflight {
        self.preflight(&owner, &public_key, &to, amount.0)
    }

    /// Live requests only; an expired one is dropped the next time the owner touches it.
    pub fn get_requests(&self, owner: AccountId) -> Vec<Request> {
        let now = env::block_timestamp();
        self.requests.values().filter(|r| r.owner == owner && r.expires_at > now).cloned().collect()
    }

    pub fn get_proposals(&self, owner: AccountId) -> Vec<ProposalView> {
        self.proposals
            .values()
            .filter(|p| p.owner == owner)
            .map(|p| ProposalView { id: p.id, owner: p.owner.clone(), key: p.key.clone(), note: p.note.clone(), created_at: p.created_at, ask: self.asks.get(&p.id).cloned() })
            .collect()
    }

    /// Raises in force, by key.
    pub fn get_raises(&self, owner: AccountId) -> Vec<(PublicKey, Raise)> {
        self.keys
            .get(&owner)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|k| self.raise_of(&owner, &k).map(|r| (k, r)))
            .collect()
    }

    /// Whether a payment id was already used by this key in the last day.
    pub fn was_paid(&self, owner: AccountId, public_key: PublicKey, payment_id: String) -> bool {
        self.was_seen(&owner, &public_key, &payment_id)
    }

    pub fn get_request_ttl(&self, owner: AccountId) -> u64 {
        self.request_ttl_of(&owner)
    }

    pub fn get_log(&self, owner: AccountId, from: Option<u64>, limit: Option<u64>) -> Vec<LogEntry> {
        let entries = self.logs.get(&owner).cloned().unwrap_or_default();
        let from = from.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(LOG_LIMIT as u64) as usize;
        entries.into_iter().skip(from).take(limit).collect()
    }

}
