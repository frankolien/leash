//! The token's callback when USDC arrives, and the settlement of every transfer the contract sends.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, PromiseOrValue, PublicKey};

use crate::*;
use near_sdk::PromiseError;

#[near]
impl Leash {
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
        payment_id: Option<String>,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> PayOutcome {
        match result {
            Ok(()) => {
                // Only money that arrived makes a recipient known; a failed transfer is no payment.
                if !self.first_paid.contains_key(&(owner.clone(), to.clone())) {
                    self.first_paid.insert((owner.clone(), to.clone()), env::block_timestamp());
                }
                emit("pay_settled", json!({ "owner": owner, "key": key, "to": to, "amount": amount }));
                PayOutcome { accepted: true, reason: None, remaining_today: self.remaining(&owner, &key) }
            }
            Err(_) => {
                let vault = self.vault_of(&owner, &token);
                self.vaults.insert((owner.clone(), token.clone()), vault + amount.0);
                if counted {
                    let task = self.task_for(&owner, &key);
                    let payer = task.as_ref().map_or(key.clone(), |t| t.parent.clone());
                    let id = (owner.clone(), payer);
                    if let Some(mut policy) = self.policies.get(&id).cloned() {
                        policy.spent_today = U128(policy.spent_today.0.saturating_sub(amount.0));
                        self.policies.insert(id, policy);
                    }
                    if let Some(mut t) = task {
                        t.spent = U128(t.spent.0.saturating_sub(amount.0));
                        self.tasks.insert(t.id, t);
                    }
                }
                // The payment never happened, so its id is free for an honest retry.
                if let Some(pid) = &payment_id {
                    self.forget(&owner, &key, pid);
                }
                self.record(&owner, Some(&key), "pay_failed", Some(&to), Some(amount), Some("transfer failed"));
                emit("pay_failed", json!({ "owner": owner, "key": key, "to": to, "amount": amount }));
                PayOutcome { accepted: false, reason: Some("transfer failed, refunded".into()), remaining_today: self.remaining(&owner, &key) }
            }
        }
    }

}
