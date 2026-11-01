//! Leash: a bounded account for AI agents on NEAR.
//!
//! The owner keeps the money. An agent holds an ed25519 key that the owner added to the owner's own
//! account as a function-call key restricted to this contract's `pay`, `request` and `ask_more`. The
//! contract reads which key signed and applies that key's policy. Nothing an agent can sign reaches
//! any other contract. An agent can also sign an instruction off chain for anyone to deliver
//! (`pay_signed` and friends): the contract verifies the signature itself, so the agent never needs
//! NEAR for gas and a relayer can neither forge nor repeat a payment. An agent can also open a task:
//! a budget for one job, spent by a sub-agent's key within the parent's own limits.
//!
//! Layout: `types` holds every struct the API speaks; `owner` the methods only the owner's key may
//! call; `agent` the two methods an agent key may call; `token` the NEP-141 callback and the transfer
//! settlement; `reports` the shared list of accounts caught scamming agents; `views` the read side;
//! `internals` the policy check, the ledger moves and the storage billing that the other modules share.

use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{log, near, AccountId, Gas, PanicOnDefault, PublicKey};

mod agent;
mod internals;
mod owner;
mod reports;
mod tasks;
mod token;
mod types;
mod views;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_signed;
#[cfg(test)]
mod tests_reports;
#[cfg(test)]
mod tests_tasks;

pub use types::*;

const DAY_NS: u64 = 86_400_000_000_000;
const NS_PER_SEC: u64 = 1_000_000_000;
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);
// The dashboard reads recent decisions; a fixed window keeps an owner's storage flat however many
// payments an agent makes.
const LOG_LIMIT: usize = 100;
// A human decides parked requests, so an hour by default; the owner can set their own window.
const DEFAULT_REQUEST_TTL_SECS: u64 = 3_600;
// Long enough for a relayer to deliver, short enough that a leaked instruction is soon worthless.
const MAX_INTENT_NS: u64 = 3_600 * NS_PER_SEC;
// Payment ids are remembered for a day per key, which outlives any instruction, and at most this
// many, which bounds the owner's storage.
const SEEN_LIMIT: usize = 64;
const MIN_RAISE_SECS: u64 = 3_600;
const MAX_RAISE_SECS: u64 = 30 * 86_400;
const DEFAULT_RAISE_SECS: u64 = 86_400;
const MIN_TASK_SECS: u64 = 60;
const MAX_TASK_SECS: u64 = 7 * 86_400;
// Open tasks per parent key, so one agent cannot run up the owner's storage.
const TASK_LIMIT: usize = 10;
// Owners who must report an account before it is blocked for everyone; one owner's report blocks it
// only for themselves.
const REPORTS_TO_BLOCK_ALL: usize = 2;
// Reports kept per account: past the threshold more add evidence, not protection.
const REPORT_LIMIT: usize = 20;
const EVENT_STANDARD: &str = "leash";
const EVENT_VERSION: &str = "1.0.0";

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Leash {
    policies: LookupMap<(AccountId, PublicKey), Policy>,
    keys: LookupMap<AccountId, Vec<PublicKey>>,
    vaults: LookupMap<(AccountId, AccountId), u128>,
    paused: LookupMap<AccountId, bool>,
    /// Yocto NEAR each owner has put down for the bytes their policies, requests and log take.
    /// The contract never pays for a stranger's state.
    storage: LookupMap<AccountId, u128>,
    requests: IterableMap<u64, Request>,
    next_request: u64,
    logs: LookupMap<AccountId, Vec<LogEntry>>,
    proposals: IterableMap<u64, Proposal>,
    next_proposal: u64,
    request_ttl: LookupMap<AccountId, u64>,
    /// Recent payment ids per agent key, with when they were used.
    seen: LookupMap<(AccountId, PublicKey), Vec<(String, u64)>>,
    raises: LookupMap<(AccountId, PublicKey), Raise>,
    asks: LookupMap<u64, Ask>,
    tasks: IterableMap<u64, Task>,
    next_task: u64,
    /// Which task a child key spends from.
    task_of: LookupMap<(AccountId, PublicKey), u64>,
    /// Reports per reported account, at most one per owner.
    reports: LookupMap<AccountId, Vec<Report>>,
}

/// The state before reports, read once by `migrate`.
#[near(serializers = [borsh])]
struct LeashV3 {
    policies: LookupMap<(AccountId, PublicKey), Policy>,
    keys: LookupMap<AccountId, Vec<PublicKey>>,
    vaults: LookupMap<(AccountId, AccountId), u128>,
    paused: LookupMap<AccountId, bool>,
    storage: LookupMap<AccountId, u128>,
    requests: IterableMap<u64, Request>,
    next_request: u64,
    logs: LookupMap<AccountId, Vec<LogEntry>>,
    proposals: IterableMap<u64, Proposal>,
    next_proposal: u64,
    request_ttl: LookupMap<AccountId, u64>,
    seen: LookupMap<(AccountId, PublicKey), Vec<(String, u64)>>,
    raises: LookupMap<(AccountId, PublicKey), Raise>,
    asks: LookupMap<u64, Ask>,
    tasks: IterableMap<u64, Task>,
    next_task: u64,
    task_of: LookupMap<(AccountId, PublicKey), u64>,
}

#[near]
impl Leash {
    #[init]
    pub fn new() -> Self {
        Self {
            policies: LookupMap::new(StorageKey::Policies),
            keys: LookupMap::new(StorageKey::Keys),
            vaults: LookupMap::new(StorageKey::Vaults),
            paused: LookupMap::new(StorageKey::Paused),
            storage: LookupMap::new(StorageKey::Storage),
            requests: IterableMap::new(StorageKey::Requests),
            next_request: 1,
            logs: LookupMap::new(StorageKey::Logs),
            proposals: IterableMap::new(StorageKey::Proposals),
            next_proposal: 1,
            request_ttl: LookupMap::new(StorageKey::RequestTtl),
            seen: LookupMap::new(StorageKey::Seen),
            raises: LookupMap::new(StorageKey::Raises),
            asks: LookupMap::new(StorageKey::Asks),
            tasks: IterableMap::new(StorageKey::Tasks),
            next_task: 1,
            task_of: LookupMap::new(StorageKey::TaskOf),
            reports: LookupMap::new(StorageKey::Reports),
        }
    }

    /// Carries a v3 deployment's state over unchanged and adds the reports.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: LeashV3 = near_sdk::env::state_read().expect("no v3 state to migrate");
        Self {
            policies: old.policies,
            keys: old.keys,
            vaults: old.vaults,
            paused: old.paused,
            storage: old.storage,
            requests: old.requests,
            next_request: old.next_request,
            logs: old.logs,
            proposals: old.proposals,
            next_proposal: old.next_proposal,
            request_ttl: old.request_ttl,
            seen: old.seen,
            raises: old.raises,
            asks: old.asks,
            tasks: old.tasks,
            next_task: old.next_task,
            task_of: old.task_of,
            reports: LookupMap::new(StorageKey::Reports),
        }
    }
}

pub(crate) fn emit(event: &str, data: near_sdk::serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": event, "data": [data] })
    );
}
