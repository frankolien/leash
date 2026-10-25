//! Every type the contract's API speaks, and the storage keys of its collections.

use near_sdk::json_types::U128;
use near_sdk::{ext_contract, near, AccountId, BorshStorageKey, PublicKey};

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[derive(BorshStorageKey)]
#[near]
pub(crate) enum StorageKey {
    Policies,
    Keys,
    Vaults,
    Paused,
    Storage,
    Requests,
    Proposals,
    RequestTtl,
    Logs,
}

/// What an agent key may do. Amounts are in the token's smallest unit; times are seconds.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Policy {
    /// What the owner calls this agent, so a request reads "claude wants to pay" to anyone.
    pub name: Option<String>,
    pub token: AccountId,
    pub daily_cap: U128,
    pub per_payment_cap: U128,
    /// Empty means any recipient.
    pub allowlist: Vec<AccountId>,
    pub cooldown_secs: u64,
    /// Zero means never.
    pub expires_at: u64,
    pub active: bool,
    pub spent_today: U128,
    /// Nanoseconds. The window rolls from the first payment, not from midnight, so there is no
    /// double spend across a calendar boundary.
    pub day_started_at: u64,
    pub last_paid_at: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PolicyInput {
    #[serde(default)]
    pub name: Option<String>,
    pub token: AccountId,
    pub daily_cap: U128,
    pub per_payment_cap: U128,
    #[serde(default)]
    pub allowlist: Vec<AccountId>,
    #[serde(default)]
    pub cooldown_secs: u64,
    #[serde(default)]
    pub expires_at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Request {
    pub id: u64,
    pub owner: AccountId,
    pub key: PublicKey,
    pub token: AccountId,
    pub to: AccountId,
    pub amount: U128,
    pub memo: Option<String>,
    pub reason: String,
    pub created_at: u64,
    /// Nanoseconds. After this the owner can no longer approve; the request is dropped on the next
    /// touch and logged as expired, so an agent is never waiting on a decision that is not coming.
    pub expires_at: u64,
}

/// An agent asking for a wider policy. Nothing changes until the owner acts on it.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub id: u64,
    pub owner: AccountId,
    pub key: PublicKey,
    pub note: String,
    pub created_at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub at: u64,
    pub key: Option<PublicKey>,
    pub event: String,
    pub to: Option<AccountId>,
    pub amount: Option<U128>,
    pub detail: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Preflight {
    pub ok: bool,
    pub reason: Option<String>,
    /// True when the amount would pass as a parked request even though `pay` refuses it.
    pub can_request: bool,
    pub remaining_today: U128,
    pub vault: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct PayOutcome {
    pub accepted: bool,
    pub reason: Option<String>,
    pub remaining_today: U128,
}
