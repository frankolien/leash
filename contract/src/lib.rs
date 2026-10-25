//! Leash: a bounded account for AI agents on NEAR.
//!
//! The owner keeps the money. An agent holds an ed25519 key that the owner added to the owner's own
//! account as a function-call key restricted to this contract's `pay` and `request`. The contract reads
//! which key signed and applies that key's policy. Nothing an agent can sign reaches any other contract.
//!
//! Layout: `types` holds every struct the API speaks; `owner` the methods only the owner's key may
//! call; `agent` the two methods an agent key may call; `token` the NEP-141 callback and the transfer
//! settlement; `views` the read side; `internals` the policy check, the ledger moves and the storage
//! billing that the other modules share.

use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{log, near, AccountId, Gas, PanicOnDefault, PublicKey};

mod agent;
mod internals;
mod owner;
mod token;
mod types;
mod views;
#[cfg(test)]
mod tests;

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
        }
    }
}

pub(crate) fn emit(event: &str, data: near_sdk::serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": event, "data": [data] })
    );
}
