//! Leash: a bounded account for AI agents on NEAR.
//!
//! The owner keeps the money. An agent holds an ed25519 key that the owner added to the owner's own
//! account as a function-call key restricted to this contract's `pay` and `request`. The contract reads
//! which key signed and applies that key's policy. Nothing an agent can sign reaches any other contract.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, ext_contract, log, near, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault,
    PromiseError, PromiseOrValue, PublicKey,
};

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

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
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

    // ---- owner methods -------------------------------------------------------------------

    /// Put NEAR down for storage. Every byte a policy, a request or a log entry adds is paid from
    /// this, so an owner who never funds it cannot grow the contract.
    #[payable]
    pub fn deposit_storage(&mut self) {
        let owner = self.owner_caller();
        let credit = self.storage_of(&owner) + env::attached_deposit().as_yoctonear();
        self.storage.insert(owner, credit);
    }

    #[payable]
    pub fn set_policy(&mut self, public_key: PublicKey, policy: PolicyInput) {
        let owner = self.owner_caller();
        let before = env::storage_usage();
        if env::attached_deposit().as_yoctonear() > 0 {
            let credit = self.storage_of(&owner) + env::attached_deposit().as_yoctonear();
            self.storage.insert(owner.clone(), credit);
        }
        assert!(policy.per_payment_cap.0 <= policy.daily_cap.0, "per_payment_cap above daily_cap");
        let stored = Policy {
            token: policy.token.clone(),
            daily_cap: policy.daily_cap,
            per_payment_cap: policy.per_payment_cap,
            allowlist: policy.allowlist.clone(),
            cooldown_secs: policy.cooldown_secs,
            expires_at: policy.expires_at,
            active: true,
            spent_today: U128(0),
            day_started_at: 0,
            last_paid_at: 0,
        };
        self.policies.insert((owner.clone(), public_key.clone()), stored);
        let mut list = self.keys.get(&owner).cloned().unwrap_or_default();
        if !list.contains(&public_key) {
            list.push(public_key.clone());
            self.keys.insert(owner.clone(), list);
        }
        self.record(&owner, Some(&public_key), "policy_set", None, Some(policy.daily_cap), None);
        emit(
            "policy_set",
            json!({ "owner": owner, "key": public_key, "token": policy.token, "daily_cap": policy.daily_cap,
                    "per_payment_cap": policy.per_payment_cap, "allowlist": policy.allowlist,
                    "cooldown_secs": policy.cooldown_secs, "expires_at": policy.expires_at }),
        );
        self.charge(&owner, before);
    }

    pub fn revoke(&mut self, public_key: PublicKey) {
        let owner = self.owner_caller();
        let id = (owner.clone(), public_key.clone());
        let mut policy = self.policies.get(&id).cloned().expect("no policy for that key");
        policy.active = false;
        self.policies.insert(id, policy);
        self.record(&owner, Some(&public_key), "policy_revoked", None, None, None);
        emit("policy_revoked", json!({ "owner": owner, "key": public_key }));
    }

    pub fn pause(&mut self) {
        let owner = self.owner_caller();
        self.paused.insert(owner.clone(), true);
        self.record(&owner, None, "paused", None, None, None);
        emit("paused", json!({ "owner": owner }));
    }

    pub fn resume(&mut self) {
        let owner = self.owner_caller();
        self.paused.insert(owner.clone(), false);
        self.record(&owner, None, "resumed", None, None, None);
        emit("resumed", json!({ "owner": owner }));
    }

    pub fn approve(&mut self, request_id: u64) -> PromiseOrValue<PayOutcome> {
        let owner = self.owner_caller();
        let before = env::storage_usage();
        let request = self.requests.get(&request_id).cloned().expect("no such request");
        assert_eq!(request.owner, owner, "not your request");
        self.requests.remove(&request_id);
        if env::block_timestamp() >= request.expires_at {
            self.record(&owner, Some(&request.key), "request_expired", Some(&request.to), Some(request.amount), None);
            emit("request_expired", json!({ "owner": owner, "id": request_id }));
            self.charge(&owner, before);
            return PromiseOrValue::Value(PayOutcome { accepted: false, reason: Some("request expired".into()), remaining_today: self.remaining(&owner, &request.key) });
        }
        self.charge(&owner, before);
        let vault = self.vault_of(&owner, &request.token);
        if vault < request.amount.0 {
            self.record(&owner, Some(&request.key), "request_denied", Some(&request.to), Some(request.amount), Some("vault too low"));
            emit("request_denied", json!({ "owner": owner, "id": request_id, "reason": "vault too low" }));
            return PromiseOrValue::Value(PayOutcome { accepted: false, reason: Some("vault too low".into()), remaining_today: self.remaining(&owner, &request.key) });
        }
        self.vaults.insert((owner.clone(), request.token.clone()), vault - request.amount.0);
        self.record(&owner, Some(&request.key), "request_approved", Some(&request.to), Some(request.amount), None);
        emit("request_approved", json!({ "owner": owner, "id": request_id, "to": request.to, "amount": request.amount }));
        // An approved request is the owner's own decision, so it does not count against the agent's
        // daily cap; the `pay` promise it becomes still refunds the vault on failure.
        PromiseOrValue::Promise(self.transfer(owner, request.key, request.token, request.to, request.amount.0, request.memo, false))
    }

    pub fn deny(&mut self, request_id: u64) {
        let owner = self.owner_caller();
        let before = env::storage_usage();
        let request = self.requests.get(&request_id).cloned().expect("no such request");
        assert_eq!(request.owner, owner, "not your request");
        self.requests.remove(&request_id);
        self.record(&owner, Some(&request.key), "request_denied", Some(&request.to), Some(request.amount), None);
        emit("request_denied", json!({ "owner": owner, "id": request_id }));
        self.charge(&owner, before);
    }

    /// How long a parked request waits for the owner, in seconds.
    pub fn set_request_ttl(&mut self, secs: u64) {
        let owner = self.owner_caller();
        assert!(secs >= 60, "a request must live at least a minute");
        self.request_ttl.insert(owner, secs);
    }

    pub fn dismiss_proposal(&mut self, proposal_id: u64) {
        let owner = self.owner_caller();
        let before = env::storage_usage();
        let proposal = self.proposals.get(&proposal_id).cloned().expect("no such proposal");
        assert_eq!(proposal.owner, owner, "not your proposal");
        self.proposals.remove(&proposal_id);
        self.record(&owner, Some(&proposal.key), "proposal_dismissed", None, None, Some(&proposal.note));
        emit("proposal_dismissed", json!({ "owner": owner, "id": proposal_id }));
        self.charge(&owner, before);
    }

    pub fn withdraw(&mut self, token: AccountId, amount: U128) -> near_sdk::Promise {
        let owner = self.owner_caller();
        let vault = self.vault_of(&owner, &token);
        assert!(vault >= amount.0, "vault too low");
        self.vaults.insert((owner.clone(), token.clone()), vault - amount.0);
        self.record(&owner, None, "withdraw", None, Some(amount), None);
        emit("withdraw", json!({ "owner": owner, "token": token, "amount": amount }));
        ext_ft::ext(token)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(owner, amount, Some("leash withdraw".into()))
    }

    // ---- agent methods -------------------------------------------------------------------

    /// Pay within policy. A refusal is an answer, not a panic, so the attempt is logged and the agent
    /// learns the reason.
    pub fn pay(&mut self, to: AccountId, amount: U128, memo: Option<String>) -> PromiseOrValue<PayOutcome> {
        let owner = env::predecessor_account_id();
        let key = env::signer_account_pk();
        let before = env::storage_usage();
        let verdict = self.preflight(&owner, &key, &to, amount.0);
        if !verdict.ok {
            let reason = verdict.reason.clone().unwrap_or_default();
            self.record(&owner, Some(&key), "pay_refused", Some(&to), Some(amount), Some(&reason));
            emit("pay_refused", json!({ "owner": owner, "key": key, "to": to, "amount": amount, "reason": reason }));
            self.charge(&owner, before);
            return PromiseOrValue::Value(PayOutcome { accepted: false, reason: Some(reason), remaining_today: verdict.remaining_today });
        }
        let id = (owner.clone(), key.clone());
        let mut policy = self.policies.get(&id).cloned().expect("policy");
        let now = env::block_timestamp();
        if policy.day_started_at == 0 || now.saturating_sub(policy.day_started_at) >= DAY_NS {
            policy.day_started_at = now;
            policy.spent_today = U128(0);
        }
        policy.spent_today = U128(policy.spent_today.0 + amount.0);
        policy.last_paid_at = now;
        let token = policy.token.clone();
        self.policies.insert(id, policy);
        let vault = self.vault_of(&owner, &token);
        self.vaults.insert((owner.clone(), token.clone()), vault - amount.0);
        self.record(&owner, Some(&key), "pay", Some(&to), Some(amount), memo.as_deref());
        emit("pay", json!({ "owner": owner, "key": key, "token": token, "to": to, "amount": amount, "memo": memo }));
        self.charge(&owner, before);
        PromiseOrValue::Promise(self.transfer(owner, key, token, to, amount.0, memo, true))
    }

    /// Park a payment the policy would refuse for the owner to decide. Only a reason the owner can
    /// override is parked; a revoked or paused key gets nothing.
    pub fn request(&mut self, to: AccountId, amount: U128, memo: Option<String>) -> u64 {
        let owner = env::predecessor_account_id();
        let key = env::signer_account_pk();
        let before = env::storage_usage();
        let verdict = self.preflight(&owner, &key, &to, amount.0);
        assert!(verdict.can_request, "{}", verdict.reason.unwrap_or_else(|| "nothing to request".into()));
        let policy = self.policies.get(&(owner.clone(), key.clone())).cloned().expect("policy");
        let id = self.next_request;
        self.next_request += 1;
        let reason = verdict.reason.unwrap_or_else(|| "within policy".into());
        self.requests.insert(
            id,
            Request {
                id,
                owner: owner.clone(),
                key: key.clone(),
                token: policy.token,
                to: to.clone(),
                amount,
                memo,
                reason: reason.clone(),
                created_at: env::block_timestamp(),
                expires_at: env::block_timestamp() + self.request_ttl_of(&owner) * NS_PER_SEC,
            },
        );
        self.record(&owner, Some(&key), "request_parked", Some(&to), Some(amount), Some(&reason));
        emit("request_parked", json!({ "owner": owner, "key": key, "id": id, "to": to, "amount": amount, "reason": reason }));
        self.charge(&owner, before);
        id
    }

    /// The agent asks for a wider policy in one sentence. Nothing changes until the owner acts; the
    /// note is stored so the owner sees it beside the key, and it costs the owner's storage credit,
    /// so an agent cannot spam it for free either.
    pub fn ask_more(&mut self, note: String) -> u64 {
        let owner = env::predecessor_account_id();
        let key = env::signer_account_pk();
        assert!(self.policies.get(&(owner.clone(), key.clone())).is_some(), "no policy for this key");
        assert!(!note.is_empty() && note.len() <= 280, "a note is one short sentence");
        let before = env::storage_usage();
        let id = self.next_proposal;
        self.next_proposal += 1;
        self.proposals.insert(id, Proposal { id, owner: owner.clone(), key: key.clone(), note: note.clone(), created_at: env::block_timestamp() });
        self.record(&owner, Some(&key), "proposal_made", None, None, Some(&note));
        emit("proposal_made", json!({ "owner": owner, "key": key, "id": id, "note": note }));
        self.charge(&owner, before);
        id
    }

    // ---- token callback ------------------------------------------------------------------

    /// The token contract calls this after it has moved the tokens, so crediting here is safe. The
    /// whole amount is kept.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let _ = msg;
        let vault = self.vault_of(&sender_id, &token);
        self.vaults.insert((sender_id.clone(), token.clone()), vault + amount.0);
        self.record(&sender_id, None, "deposit", None, Some(amount), None);
        emit("deposit", json!({ "owner": sender_id, "token": token, "amount": amount }));
        PromiseOrValue::Value(U128(0))
    }

    /// Settles a transfer. On failure the vault, and the daily counter if this was an agent payment,
    /// get the amount back, so a refused transfer never costs the owner anything.
    #[private]
    pub fn on_pay(
        &mut self,
        owner: AccountId,
        key: PublicKey,
        token: AccountId,
        to: AccountId,
        amount: U128,
        counted: bool,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> PayOutcome {
        match result {
            Ok(()) => {
                emit("pay_settled", json!({ "owner": owner, "key": key, "to": to, "amount": amount }));
                PayOutcome { accepted: true, reason: None, remaining_today: self.remaining(&owner, &key) }
            }
            Err(_) => {
                let vault = self.vault_of(&owner, &token);
                self.vaults.insert((owner.clone(), token.clone()), vault + amount.0);
                if counted {
                    let id = (owner.clone(), key.clone());
                    if let Some(mut policy) = self.policies.get(&id).cloned() {
                        policy.spent_today = U128(policy.spent_today.0.saturating_sub(amount.0));
                        self.policies.insert(id, policy);
                    }
                }
                self.record(&owner, Some(&key), "pay_failed", Some(&to), Some(amount), Some("transfer failed"));
                emit("pay_failed", json!({ "owner": owner, "key": key, "to": to, "amount": amount }));
                PayOutcome { accepted: false, reason: Some("transfer failed, refunded".into()), remaining_today: self.remaining(&owner, &key) }
            }
        }
    }

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

    pub fn get_proposals(&self, owner: AccountId) -> Vec<Proposal> {
        self.proposals.values().filter(|p| p.owner == owner).cloned().collect()
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

    // ---- internals -----------------------------------------------------------------------

    /// An owner method must come from a key that has no policy. The owner's own full-access key never
    /// has one, and an agent key always does, so an agent can never approve its own request even if
    /// someone widened its method list by mistake.
    fn owner_caller(&self) -> AccountId {
        let owner = env::predecessor_account_id();
        let key = env::signer_account_pk();
        assert!(self.policies.get(&(owner.clone(), key)).is_none(), "an agent key cannot manage policies");
        owner
    }

    fn request_ttl_of(&self, owner: &AccountId) -> u64 {
        self.request_ttl.get(owner).copied().unwrap_or(DEFAULT_REQUEST_TTL_SECS)
    }

    fn storage_of(&self, owner: &AccountId) -> u128 {
        self.storage.get(owner).copied().unwrap_or(0)
    }

    /// Bill the bytes this call added to the owner's storage credit. Bytes freed are credited back,
    /// so a revoke or a decided request costs nothing. A call that would overdraw the credit fails,
    /// which is the owner's signal to top up; the contract never pays for state itself.
    fn charge(&mut self, owner: &AccountId, before: u64) {
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
        self.settle(owner, before, env::storage_usage());
    }

    fn settle(&mut self, owner: &AccountId, before: u64, after: u64) {
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

    fn vault_of(&self, owner: &AccountId, token: &AccountId) -> u128 {
        self.vaults.get(&(owner.clone(), token.clone())).copied().unwrap_or(0)
    }

    fn remaining(&self, owner: &AccountId, key: &PublicKey) -> U128 {
        match self.policies.get(&(owner.clone(), key.clone())) {
            Some(policy) => {
                let now = env::block_timestamp();
                let spent = if policy.day_started_at == 0 || now.saturating_sub(policy.day_started_at) >= DAY_NS { 0 } else { policy.spent_today.0 };
                U128(policy.daily_cap.0.saturating_sub(spent))
            }
            None => U128(0),
        }
    }

    fn preflight(&self, owner: &AccountId, key: &PublicKey, to: &AccountId, amount: u128) -> Preflight {
        let refuse = |reason: &str, can_request: bool, remaining: U128, vault: U128| Preflight {
            ok: false,
            reason: Some(reason.to_string()),
            can_request,
            remaining_today: remaining,
            vault,
        };
        let Some(policy) = self.policies.get(&(owner.clone(), key.clone())) else {
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
        if !policy.allowlist.is_empty() && !policy.allowlist.contains(to) {
            return refuse("recipient not in allowlist", true, remaining, vault);
        }
        if policy.last_paid_at != 0 && now.saturating_sub(policy.last_paid_at) < policy.cooldown_secs * NS_PER_SEC {
            return refuse("cooldown not elapsed", true, remaining, vault);
        }
        if amount > policy.per_payment_cap.0 {
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

    fn transfer(
        &mut self,
        owner: AccountId,
        key: PublicKey,
        token: AccountId,
        to: AccountId,
        amount: u128,
        memo: Option<String>,
        counted: bool,
    ) -> near_sdk::Promise {
        ext_ft::ext(token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(to.clone(), U128(amount), memo)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_pay(owner, key, token, to, U128(amount), counted),
            )
    }

    fn record(&mut self, owner: &AccountId, key: Option<&PublicKey>, event: &str, to: Option<&AccountId>, amount: Option<U128>, detail: Option<&str>) {
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

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": event, "data": [data] })
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const USDC: u128 = 1_000_000;

    fn owner() -> AccountId {
        accounts(0)
    }

    fn vendor() -> AccountId {
        accounts(1)
    }

    fn token() -> AccountId {
        "usdc.test".parse().unwrap()
    }

    fn agent_key() -> PublicKey {
        "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw2yTbTx3F7BaxbU".parse().unwrap()
    }

    fn owner_key() -> PublicKey {
        "ed25519:H9k5eiU4xXS3M4z8HzKJSLaZdqGdGwBG49o7orNC4eZW".parse().unwrap()
    }

    fn ctx(predecessor: AccountId, key: PublicKey, now: u64) {
        ctx_with_deposit(predecessor, key, now, 0);
    }

    fn ctx_with_deposit(predecessor: AccountId, key: PublicKey, now: u64, yocto: u128) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("leash.test".parse().unwrap())
            .predecessor_account_id(predecessor)
            .signer_account_id(owner())
            .signer_account_pk(key)
            .attached_deposit(NearToken::from_yoctonear(yocto))
            .block_timestamp(now);
        testing_env!(builder.build());
    }

    const STORAGE_CREDIT: u128 = 1_000_000_000_000_000_000_000_000;

    fn funded(daily: u128, per_payment: u128) -> Leash {
        let mut leash = Leash::new();
        ctx(token(), owner_key(), 1);
        leash.ft_on_transfer(owner(), U128(10 * USDC), String::new());
        ctx_with_deposit(owner(), owner_key(), 1, STORAGE_CREDIT);
        leash.set_policy(
            agent_key(),
            PolicyInput { token: token(), daily_cap: U128(daily), per_payment_cap: U128(per_payment), allowlist: vec![], cooldown_secs: 0, expires_at: 0 },
        );
        ctx(owner(), owner_key(), 1);
        leash
    }

    #[test]
    #[should_panic(expected = "owner has no storage credit")]
    fn bytes_added_without_storage_credit_are_refused() {
        let mut leash = Leash::new();
        ctx(owner(), owner_key(), 1);
        leash.settle(&owner(), 1_000, 1_100);
    }

    #[test]
    fn storage_credit_falls_with_bytes_added_and_returns_when_they_go() {
        // The mocked chain does not move storage_usage with writes, so the arithmetic is tested here
        // and the measured path in the sandbox test.
        let mut leash = Leash::new();
        ctx_with_deposit(owner(), owner_key(), 1, STORAGE_CREDIT);
        leash.deposit_storage();
        let byte = env::storage_byte_cost().as_yoctonear();
        leash.settle(&owner(), 1_000, 1_100);
        assert_eq!(leash.get_storage(owner()).0, STORAGE_CREDIT - 100 * byte);
        leash.settle(&owner(), 1_100, 1_060);
        assert_eq!(leash.get_storage(owner()).0, STORAGE_CREDIT - 60 * byte);
    }

    fn refused(outcome: PromiseOrValue<PayOutcome>) -> String {
        match outcome {
            PromiseOrValue::Value(v) => {
                assert!(!v.accepted);
                v.reason.unwrap()
            }
            PromiseOrValue::Promise(_) => panic!("expected a refusal"),
        }
    }

    fn accepted(outcome: PromiseOrValue<PayOutcome>) {
        assert!(matches!(outcome, PromiseOrValue::Promise(_)), "expected the transfer promise");
    }

    #[test]
    fn deposit_credits_the_vault_of_the_token_that_called() {
        let leash = funded(3 * USDC, 2 * USDC);
        assert_eq!(leash.get_vault(owner(), token()).0, 10 * USDC);
        assert_eq!(leash.get_vault(owner(), vendor()).0, 0);
    }

    #[test]
    fn two_payments_land_and_the_third_hits_the_daily_cap() {
        let mut leash = funded(3 * USDC, 2 * USDC);
        ctx(owner(), agent_key(), 10);
        accepted(leash.pay(vendor(), U128(USDC), None));
        accepted(leash.pay(vendor(), U128(USDC), None));
        assert_eq!(leash.get_vault(owner(), token()).0, 8 * USDC);
        let third = leash.pay(vendor(), U128(2 * USDC), None);
        assert_eq!(refused(third), "over daily cap");
        assert_eq!(leash.check(owner(), agent_key(), vendor(), U128(USDC)).remaining_today.0, USDC);
    }

    #[test]
    fn the_daily_window_rolls_by_elapsed_time() {
        let mut leash = funded(2 * USDC, 2 * USDC);
        ctx(owner(), agent_key(), 10);
        accepted(leash.pay(vendor(), U128(2 * USDC), None));
        assert_eq!(refused(leash.pay(vendor(), U128(USDC), None)), "over daily cap");
        ctx(owner(), agent_key(), 10 + DAY_NS);
        accepted(leash.pay(vendor(), U128(USDC), None));
    }

    #[test]
    fn per_payment_cap_allowlist_cooldown_and_expiry_each_refuse() {
        let mut leash = Leash::new();
        ctx(token(), owner_key(), 1);
        leash.ft_on_transfer(owner(), U128(10 * USDC), String::new());
        ctx_with_deposit(owner(), owner_key(), 1, STORAGE_CREDIT);
        leash.set_policy(
            agent_key(),
            PolicyInput { token: token(), daily_cap: U128(5 * USDC), per_payment_cap: U128(USDC), allowlist: vec![vendor()], cooldown_secs: 60, expires_at: 1_000 },
        );
        ctx(owner(), agent_key(), 10 * NS_PER_SEC);
        assert_eq!(refused(leash.pay(vendor(), U128(2 * USDC), None)), "over per-payment cap");
        assert_eq!(refused(leash.pay(accounts(2), U128(USDC), None)), "recipient not in allowlist");
        accepted(leash.pay(vendor(), U128(USDC), None));
        assert_eq!(refused(leash.pay(vendor(), U128(USDC), None)), "cooldown not elapsed");
        ctx(owner(), agent_key(), 80 * NS_PER_SEC);
        accepted(leash.pay(vendor(), U128(USDC), None));
        ctx(owner(), agent_key(), 1_000 * NS_PER_SEC);
        assert_eq!(refused(leash.pay(vendor(), U128(USDC), None)), "key expired");
    }

    #[test]
    fn revoke_and_pause_stop_the_key_and_cannot_be_requested_around() {
        let mut leash = funded(3 * USDC, 2 * USDC);
        ctx(owner(), owner_key(), 5);
        leash.pause();
        ctx(owner(), agent_key(), 6);
        assert_eq!(refused(leash.pay(vendor(), U128(USDC), None)), "owner paused all keys");
        assert!(!leash.check(owner(), agent_key(), vendor(), U128(USDC)).can_request);
        ctx(owner(), owner_key(), 7);
        leash.resume();
        leash.revoke(agent_key());
        ctx(owner(), agent_key(), 8);
        assert_eq!(refused(leash.pay(vendor(), U128(USDC), None)), "key revoked");
    }

    #[test]
    fn an_over_cap_payment_parks_and_the_owner_approves_it() {
        let mut leash = funded(3 * USDC, 2 * USDC);
        ctx(owner(), agent_key(), 10);
        let id = leash.request(vendor(), U128(5 * USDC), Some("invoice 7".into()));
        assert_eq!(leash.get_requests(owner()).len(), 1);
        assert_eq!(leash.get_requests(owner())[0].reason, "over per-payment cap");
        ctx(owner(), owner_key(), 11);
        accepted(leash.approve(id));
        assert_eq!(leash.get_vault(owner(), token()).0, 5 * USDC);
        assert!(leash.get_requests(owner()).is_empty());
        // The owner's decision does not eat the agent's own allowance.
        assert_eq!(leash.check(owner(), agent_key(), vendor(), U128(USDC)).remaining_today.0, 3 * USDC);
    }

    #[test]
    fn an_old_request_expires_instead_of_paying() {
        let mut leash = funded(3 * USDC, 2 * USDC);
        ctx(owner(), agent_key(), 10);
        let id = leash.request(vendor(), U128(5 * USDC), None);
        assert_eq!(leash.get_requests(owner()).len(), 1);
        let later = 10 + (DEFAULT_REQUEST_TTL_SECS + 1) * NS_PER_SEC;
        ctx(owner(), owner_key(), later);
        assert!(leash.get_requests(owner()).is_empty(), "an expired request is not shown");
        assert_eq!(refused(leash.approve(id)), "request expired");
        assert_eq!(leash.get_vault(owner(), token()).0, 10 * USDC, "nothing moved");
        assert_eq!(leash.get_log(owner(), None, None).last().unwrap().event, "request_expired");
    }

    #[test]
    fn an_agent_can_ask_for_more_and_the_owner_dismisses_it() {
        let mut leash = funded(3 * USDC, 2 * USDC);
        ctx(owner(), agent_key(), 10);
        let id = leash.ask_more("Need 10 a day for the compute bill".into());
        assert_eq!(leash.get_proposals(owner()).len(), 1);
        assert_eq!(leash.get_policy(owner(), agent_key()).unwrap().daily_cap.0, 3 * USDC, "asking changes nothing");
        ctx(owner(), owner_key(), 11);
        leash.dismiss_proposal(id);
        assert!(leash.get_proposals(owner()).is_empty());
    }

    #[test]
    #[should_panic(expected = "an agent key cannot manage policies")]
    fn an_agent_key_cannot_approve_its_own_request() {
        let mut leash = funded(3 * USDC, 2 * USDC);
        ctx(owner(), agent_key(), 10);
        let id = leash.request(vendor(), U128(5 * USDC), None);
        leash.approve(id);
    }

    #[test]
    fn a_failed_transfer_refunds_the_vault_and_the_daily_counter() {
        let mut leash = funded(3 * USDC, 2 * USDC);
        ctx(owner(), agent_key(), 10);
        accepted(leash.pay(vendor(), U128(2 * USDC), None));
        assert_eq!(leash.get_vault(owner(), token()).0, 8 * USDC);
        ctx("leash.test".parse().unwrap(), owner_key(), 11);
        let outcome = leash.on_pay(owner(), agent_key(), token(), vendor(), U128(2 * USDC), true, Err(PromiseError::Failed));
        assert!(!outcome.accepted);
        assert_eq!(leash.get_vault(owner(), token()).0, 10 * USDC);
        assert_eq!(outcome.remaining_today.0, 3 * USDC);
    }

    #[test]
    fn the_log_keeps_the_last_hundred_decisions() {
        let mut leash = funded(1_000 * USDC, 1_000 * USDC);
        // Each payment runs in its own transaction, as on chain; one mocked context cannot hold the
        // gas and promises of a hundred and twenty of them.
        for i in 0..120u64 {
            ctx(owner(), agent_key(), 10 + i);
            accepted(leash.pay(vendor(), U128(1), None));
        }
        let log = leash.get_log(owner(), None, None);
        assert_eq!(log.len(), LOG_LIMIT);
        assert!(log.iter().all(|e| e.event == "pay"));
    }
}
