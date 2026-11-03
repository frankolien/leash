//! Every type the contract's API speaks, and the storage keys of its collections.

use near_sdk::json_types::{Base64VecU8, U128};
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
    Seen,
    Raises,
    Asks,
    Tasks,
    TaskOf,
    Reports,
    FirstPaid,
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

/// What an agent asks for beside its note, so the owner can grant it in one step. Each field is the
/// new value while the raise lasts; `allow` adds recipients. `for_secs` is how long it should last.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Ask {
    #[serde(default)]
    pub daily_cap: Option<U128>,
    #[serde(default)]
    pub per_payment_cap: Option<U128>,
    #[serde(default)]
    pub allow: Vec<AccountId>,
    #[serde(default)]
    pub for_secs: u64,
}

/// A temporary widening the owner granted from an agent's ask. It lapses on its own at `until`
/// (nanoseconds), so a one-off need never becomes a permanent policy.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Raise {
    pub daily_cap: Option<U128>,
    pub per_payment_cap: Option<U128>,
    pub allow: Vec<AccountId>,
    pub until: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ProposalView {
    pub id: u64,
    pub owner: AccountId,
    pub key: PublicKey,
    pub note: String,
    pub created_at: u64,
    pub ask: Option<Ask>,
}

/// An instruction an agent signed with its key, as the JSON text it signed. Anyone may deliver it,
/// so the agent needs no NEAR for gas; the contract checks the signature against the key named here
/// and that key's policy, and never accepts the same `payment_id` twice.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Intent {
    pub contract: AccountId,
    pub owner: AccountId,
    pub key: PublicKey,
    /// "pay", "request" or "ask_more".
    pub action: String,
    #[serde(default)]
    pub to: Option<AccountId>,
    #[serde(default)]
    pub amount: Option<U128>,
    #[serde(default)]
    pub memo: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub ask: Option<Ask>,
    #[serde(default)]
    pub task: Option<TaskInput>,
    #[serde(default)]
    pub task_id: Option<u64>,
    pub payment_id: String,
    /// Nanoseconds. A signed instruction is only good for a short while.
    pub expires_at: u64,
}

/// A budget an agent carves out for one job and hands to a sub-agent's key. The child key pays only
/// within it, by signed instruction, and every payment also counts against the parent's own policy,
/// so a task can narrow what the parent may do but never widen it.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Task {
    pub id: u64,
    pub owner: AccountId,
    pub parent: PublicKey,
    pub child: PublicKey,
    pub label: String,
    pub budget: U128,
    pub spent: U128,
    /// Empty means whatever the parent may pay.
    pub allow: Vec<AccountId>,
    pub created_at: u64,
    /// Nanoseconds.
    pub expires_at: u64,
    pub active: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct TaskInput {
    pub label: String,
    pub budget: U128,
    pub for_secs: u64,
    pub child: PublicKey,
    #[serde(default)]
    pub allow: Vec<AccountId>,
}

/// One owner's report that an account scams agents, with the evidence a reader can check.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Report {
    /// The owner who reported, directly or through one of their agents.
    pub owner: AccountId,
    /// The agent key that reported, when it was an agent.
    pub key: Option<PublicKey>,
    /// A sentence, a link or a transaction hash.
    pub evidence: String,
    pub at: u64,
}

/// What the shared reports say about an account, for one owner or for everyone.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Reputation {
    /// Distinct owners who reported it.
    pub reported_by: u32,
    /// Whether the asking owner reported it themselves.
    pub by_you: bool,
    /// Whether payments to it are refused: for the asking owner, or for every owner when none is given.
    pub blocked: bool,
}

/// What the Leash relay found out about a recipient, as the exact JSON text it signed. Times are
/// nanoseconds; zero means the indexer had no record.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Facts {
    pub contract: AccountId,
    pub to: AccountId,
    pub created_at: u64,
    pub code_changed_at: u64,
    pub tx_count: u64,
    pub observed_at: u64,
}

/// The facts and the relay's ed25519 signature over `leash-facts:` and the text.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SignedFacts {
    pub text: String,
    pub signature: Base64VecU8,
}
