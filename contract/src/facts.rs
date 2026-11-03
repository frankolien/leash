//! A stranger is paid only on the word of the relay. The relay fetches what an indexer knows about a
//! recipient (when the account was made, when its code last changed, how busy it is), signs it with
//! a key this contract pins, and the agent hands the signed text in with the payment. The agent
//! never holds that key, so it cannot invent a three-year-old account for a scammer made this
//! morning; the contract checks the signature and the age itself and refuses on its own. Only the
//! first payment to a recipient needs it: after that the owner has paid them, and a recipient the
//! owner listed never did.

use near_sdk::{env, near, AccountId, CurveType, PublicKey};

use crate::*;

#[near]
impl Leash {
    /// Pins the key whose facts count, or clears it. Only the contract's own account may; it is the
    /// one promise the whole contract makes to every owner at once.
    pub fn set_facts_key(&mut self, key: Option<PublicKey>) {
        assert_eq!(env::predecessor_account_id(), env::current_account_id(), "only the contract account pins the facts key");
        if let Some(k) = &key {
            assert!(k.curve_type() == CurveType::ED25519, "the facts key is ed25519");
        }
        self.facts_key = key;
    }

    pub fn get_facts_key(&self) -> Option<PublicKey> {
        self.facts_key.clone()
    }

    /// Whether this owner's next payment to `to` needs signed facts.
    pub fn needs_facts(&self, owner: AccountId, public_key: PublicKey, to: AccountId) -> bool {
        self.facts_key.is_some() && !self.known(&owner, &public_key, &to)
    }
}

impl Leash {
    /// The owner has paid `to`, listed it, or is it.
    pub(crate) fn known(&self, owner: &AccountId, key: &PublicKey, to: &AccountId) -> bool {
        if to == owner || self.first_paid.contains_key(&(owner.clone(), to.clone())) {
            return true;
        }
        if self.raise_of(owner, key).is_some_and(|r| r.allow.contains(to)) {
            return true;
        }
        match self.task_for(owner, key) {
            Some(task) => task.allow.contains(to) || self.policies.get(&(owner.clone(), task.parent)).is_some_and(|p| p.allowlist.contains(to)),
            None => self.policies.get(&(owner.clone(), key.clone())).is_some_and(|p| p.allowlist.contains(to)),
        }
    }

    /// Why a payment to a stranger is refused, or nothing when it may go ahead. Every refusal here
    /// can be parked for the owner, who may know the recipient.
    pub(crate) fn stranger_check(&self, owner: &AccountId, key: &PublicKey, to: &AccountId, facts: Option<&SignedFacts>) -> Option<String> {
        let signer = self.facts_key.as_ref()?;
        if self.known(owner, key, to) {
            return None;
        }
        let Some(signed) = facts else { return Some("first payment to a stranger needs the relay's signed facts".into()) };
        let Ok(f) = near_sdk::serde_json::from_str::<Facts>(&signed.text) else { return Some("facts are not valid JSON".into()) };
        if f.contract != env::current_account_id() || f.to != *to {
            return Some("facts are about another recipient or contract".into());
        }
        let pk: &[u8; 32] = signer.as_bytes()[1..].try_into().expect("ed25519 key is 32 bytes");
        let Ok(sig) = <&[u8; 64]>::try_from(signed.signature.0.as_slice()) else { return Some("facts signature is not 64 bytes".into()) };
        let message = [b"leash-facts:".as_slice(), signed.text.as_bytes()].concat();
        if !env::ed25519_verify(sig, message, pk) {
            return Some("facts are not signed by the relay".into());
        }
        let now = env::block_timestamp();
        if now.saturating_sub(f.observed_at) > FACTS_MAX_AGE_NS || f.observed_at > now + FACTS_MAX_AGE_NS {
            return Some("facts are stale".into());
        }
        if f.created_at != 0 && now.saturating_sub(f.created_at) < YOUNG_ACCOUNT_NS {
            return Some("recipient account is under a day old".into());
        }
        if f.code_changed_at != 0 && now.saturating_sub(f.code_changed_at) < FRESH_CODE_NS {
            return Some("recipient's contract code changed this week".into());
        }
        None
    }
}
