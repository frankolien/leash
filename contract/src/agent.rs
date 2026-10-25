//! What an agent key may do: pay within policy, park a request, ask for more.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, PromiseOrValue};

use crate::*;

#[near]
impl Leash {
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

}
