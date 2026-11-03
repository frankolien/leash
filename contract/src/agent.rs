//! What an agent key may do: pay within policy, park a request, ask for more. Each comes two ways:
//! signed as a transaction by the agent's function-call key, or signed off chain as an `Intent` that
//! anyone may deliver, which lets an agent act without holding NEAR for gas.

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, CurveType, PromiseOrValue, PublicKey};

use crate::*;

#[near]
impl Leash {
    // ---- agent methods -------------------------------------------------------------------

    /// Pay within policy. A refusal is an answer, not a panic, so the attempt is logged and the agent
    /// learns the reason. A `payment_id` makes a retry safe: the same id never pays twice. The first
    /// payment to a recipient the owner never paid or listed needs the relay's signed `facts`.
    pub fn pay(&mut self, to: AccountId, amount: U128, memo: Option<String>, payment_id: Option<String>, facts: Option<SignedFacts>) -> PromiseOrValue<PayOutcome> {
        self.pay_for(env::predecessor_account_id(), env::signer_account_pk(), to, amount, memo, payment_id, facts)
    }

    /// Park a payment the policy would refuse for the owner to decide. Only a reason the owner can
    /// override is parked; a revoked or paused key gets nothing.
    pub fn request(&mut self, to: AccountId, amount: U128, memo: Option<String>) -> u64 {
        self.request_for(env::predecessor_account_id(), env::signer_account_pk(), to, amount, memo)
    }

    /// The agent asks for a wider policy in one sentence, optionally with the exact terms it wants
    /// for a while. Nothing changes until the owner grants it; the note costs the owner's storage
    /// credit, so an agent cannot spam it for free either.
    pub fn ask_more(&mut self, note: String, ask: Option<Ask>) -> u64 {
        self.ask_for(env::predecessor_account_id(), env::signer_account_pk(), note, ask)
    }

    pub fn pay_signed(&mut self, intent: String, signature: Base64VecU8, facts: Option<SignedFacts>) -> PromiseOrValue<PayOutcome> {
        let i = self.verified(&intent, &signature, "pay");
        let (to, amount) = (i.to.expect("intent has no recipient"), i.amount.expect("intent has no amount"));
        self.pay_for(i.owner, i.key, to, amount, i.memo, Some(i.payment_id), facts)
    }

    pub fn request_signed(&mut self, intent: String, signature: Base64VecU8) -> u64 {
        let i = self.verified(&intent, &signature, "request");
        self.once(&i.owner, &i.key, &i.payment_id);
        self.request_for(i.owner, i.key, i.to.expect("intent has no recipient"), i.amount.expect("intent has no amount"), i.memo)
    }

    pub fn ask_more_signed(&mut self, intent: String, signature: Base64VecU8) -> u64 {
        let i = self.verified(&intent, &signature, "ask_more");
        self.once(&i.owner, &i.key, &i.payment_id);
        self.ask_for(i.owner, i.key, i.note.expect("intent has no note"), i.ask)
    }
}

impl Leash {
    /// The intent, if `signature` is the named key's ed25519 signature over `leash-intent:` and the
    /// exact text, for this contract and this action, and still fresh. The prefix keeps a signature
    /// made for Leash from ever passing as anything else.
    pub(crate) fn verified(&self, text: &str, signature: &Base64VecU8, action: &str) -> Intent {
        let intent: Intent = near_sdk::serde_json::from_str(text).expect("intent is not valid JSON");
        assert_eq!(intent.contract, env::current_account_id(), "intent is for another contract");
        assert_eq!(intent.action, action, "intent is for another action");
        let now = env::block_timestamp();
        assert!(intent.expires_at > now, "intent expired");
        assert!(intent.expires_at <= now + MAX_INTENT_NS, "intent lives longer than an hour");
        assert!(!intent.payment_id.is_empty() && intent.payment_id.len() <= 64, "payment_id is 1 to 64 characters");
        assert!(intent.key.curve_type() == CurveType::ED25519, "only ed25519 keys sign intents");
        let key: &[u8; 32] = intent.key.as_bytes()[1..].try_into().expect("ed25519 key is 32 bytes");
        let sig: &[u8; 64] = signature.0.as_slice().try_into().expect("signature is 64 bytes");
        let message = [b"leash-intent:".as_slice(), text.as_bytes()].concat();
        assert!(env::ed25519_verify(sig, message, key), "signature does not match the key");
        intent
    }

    pub(crate) fn pay_for(&mut self, owner: AccountId, key: PublicKey, to: AccountId, amount: U128, memo: Option<String>, payment_id: Option<String>, facts: Option<SignedFacts>) -> PromiseOrValue<PayOutcome> {
        let before = env::storage_usage();
        if let Some(pid) = &payment_id {
            if self.was_seen(&owner, &key, pid) {
                let remaining = self.remaining(&owner, &key);
                return PromiseOrValue::Value(PayOutcome { accepted: true, reason: Some("already paid with this payment_id; nothing moved again".into()), remaining_today: remaining });
            }
        }
        let verdict = self.preflight(&owner, &key, &to, amount.0);
        let stranger = if verdict.ok { self.stranger_check(&owner, &key, &to, facts.as_ref()) } else { None };
        if !verdict.ok || stranger.is_some() {
            let reason = stranger.or(verdict.reason.clone()).unwrap_or_default();
            self.record(&owner, Some(&key), "pay_refused", Some(&to), Some(amount), Some(&reason));
            emit("pay_refused", json!({ "owner": owner, "key": key, "to": to, "amount": amount, "reason": reason }));
            self.charge(&owner, before);
            return PromiseOrValue::Value(PayOutcome { accepted: false, reason: Some(reason), remaining_today: verdict.remaining_today });
        }
        // A child key spends its task and, through it, its parent's day.
        let task = self.task_for(&owner, &key);
        let payer = task.as_ref().map_or(key.clone(), |t| t.parent.clone());
        let id = (owner.clone(), payer);
        let mut policy = self.policies.get(&id).cloned().expect("policy");
        let now = env::block_timestamp();
        if let Some(mut t) = task {
            t.spent = U128(t.spent.0 + amount.0);
            self.tasks.insert(t.id, t);
        }
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
        if let Some(pid) = &payment_id {
            self.remember(&owner, &key, pid);
        }
        self.record(&owner, Some(&key), "pay", Some(&to), Some(amount), memo.as_deref());
        emit("pay", json!({ "owner": owner, "key": key, "token": token, "to": to, "amount": amount, "memo": memo, "payment_id": payment_id }));
        self.charge(&owner, before);
        PromiseOrValue::Promise(self.transfer(owner, key, token, to, amount.0, memo, true, payment_id))
    }

    pub(crate) fn request_for(&mut self, owner: AccountId, key: PublicKey, to: AccountId, amount: U128, memo: Option<String>) -> u64 {
        let before = env::storage_usage();
        let verdict = self.preflight(&owner, &key, &to, amount.0);
        assert!(verdict.can_request, "{}", verdict.reason.unwrap_or_else(|| "nothing to request".into()));
        let policy = self.policies.get(&(owner.clone(), key.clone())).cloned().expect("policy");
        let id = self.next_request;
        self.next_request += 1;
        // Within policy but refused by `pay` all the same: the owner should see why it waited.
        let stranger = self.facts_key.is_some() && !self.known(&owner, &key, &to);
        let reason = verdict.reason.unwrap_or_else(|| if stranger { "first payment to a stranger".into() } else { "within policy".into() });
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

    pub(crate) fn ask_for(&mut self, owner: AccountId, key: PublicKey, note: String, ask: Option<Ask>) -> u64 {
        assert!(self.policies.get(&(owner.clone(), key.clone())).is_some(), "no policy for this key");
        assert!(!note.is_empty() && note.len() <= 280, "a note is one short sentence");
        if let Some(a) = &ask {
            assert!(a.daily_cap.is_some() || a.per_payment_cap.is_some() || !a.allow.is_empty(), "an ask names a cap or a recipient");
            assert!(a.allow.len() <= 10, "ask for at most 10 recipients");
            assert!(a.for_secs == 0 || (MIN_RAISE_SECS..=MAX_RAISE_SECS).contains(&a.for_secs), "a raise lasts an hour to 30 days");
        }
        let before = env::storage_usage();
        let id = self.next_proposal;
        self.next_proposal += 1;
        self.proposals.insert(id, Proposal { id, owner: owner.clone(), key: key.clone(), note: note.clone(), created_at: env::block_timestamp() });
        if let Some(a) = ask.clone() {
            self.asks.insert(id, a);
        }
        self.record(&owner, Some(&key), "proposal_made", None, None, Some(&note));
        emit("proposal_made", json!({ "owner": owner, "key": key, "id": id, "note": note, "ask": ask }));
        self.charge(&owner, before);
        id
    }

    fn fresh_seen(&self, owner: &AccountId, key: &PublicKey) -> Vec<(String, u64)> {
        let now = env::block_timestamp();
        let mut ids = self.seen.get(&(owner.clone(), key.clone())).cloned().unwrap_or_default();
        ids.retain(|(_, at)| now.saturating_sub(*at) < DAY_NS);
        ids
    }

    pub(crate) fn was_seen(&self, owner: &AccountId, key: &PublicKey, payment_id: &str) -> bool {
        self.fresh_seen(owner, key).iter().any(|(id, _)| id == payment_id)
    }

    pub(crate) fn remember(&mut self, owner: &AccountId, key: &PublicKey, payment_id: &str) {
        let mut ids = self.fresh_seen(owner, key);
        ids.push((payment_id.to_string(), env::block_timestamp()));
        if ids.len() > SEEN_LIMIT {
            let excess = ids.len() - SEEN_LIMIT;
            ids.drain(0..excess);
        }
        self.seen.insert((owner.clone(), key.clone()), ids);
    }

    pub(crate) fn forget(&mut self, owner: &AccountId, key: &PublicKey, payment_id: &str) {
        let mut ids = self.fresh_seen(owner, key);
        ids.retain(|(id, _)| id != payment_id);
        self.seen.insert((owner.clone(), key.clone()), ids);
    }

    /// A signed request or ask is delivered once; a repeat is someone replaying it.
    pub(crate) fn once(&mut self, owner: &AccountId, key: &PublicKey, payment_id: &str) {
        assert!(!self.was_seen(owner, key, payment_id), "this instruction was already delivered");
        self.remember(owner, key, payment_id);
    }
}
