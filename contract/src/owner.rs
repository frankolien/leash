//! What the owner's own key may do: policies, the kill switch, decisions, the vault.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, NearToken, PromiseOrValue, PublicKey};

use crate::*;

#[near]
impl Leash {
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
        assert!(policy.name.as_ref().map_or(true, |n| !n.is_empty() && n.len() <= 32), "a name is at most 32 characters");
        let stored = Policy {
            name: policy.name.clone(),
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
            json!({ "owner": owner, "key": public_key, "name": policy.name, "token": policy.token, "daily_cap": policy.daily_cap,
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

}
