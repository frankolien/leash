//! Signed facts about a stranger, on the mocked chain with real ed25519 signatures.

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken, PromiseOrValue};

const USDC: u128 = 1_000_000;
const STORAGE_CREDIT: u128 = 1_000_000_000_000_000_000_000_000;
const NOW: u64 = 100 * DAY_NS;

fn owner() -> AccountId {
    accounts(0)
}
fn stranger() -> AccountId {
    accounts(1)
}
fn listed() -> AccountId {
    accounts(2)
}
fn token() -> AccountId {
    "usdc.test".parse().unwrap()
}
fn contract() -> AccountId {
    "leash.test".parse().unwrap()
}
fn agent_key() -> PublicKey {
    "ed25519:H9k5eiU4xXS3M4z8HzKJSLaZdqGdGwBG49o7orNC4eZW".parse().unwrap()
}
fn owner_key() -> PublicKey {
    "ed25519:2gG5oTQAEnT4KYgCv1nYHgmQ8M9cZw1Ck5wZ8yFhUxMk".parse().unwrap()
}

fn relay() -> SigningKey {
    SigningKey::from_bytes(&[9; 32])
}

fn public(k: &SigningKey) -> PublicKey {
    format!("ed25519:{}", bs58::encode(k.verifying_key().as_bytes()).into_string()).parse().unwrap()
}

fn ctx(predecessor: AccountId, signer_pk: PublicKey, yocto: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(contract()).predecessor_account_id(predecessor).signer_account_pk(signer_pk).attached_deposit(NearToken::from_yoctonear(yocto)).block_timestamp(NOW);
    testing_env!(b.build());
}

/// A vault with $10, one agent allowed to pay anyone but with `listed` on its allowlist too, and the
/// relay's key pinned.
fn funded(pin: bool) -> Leash {
    let mut leash = Leash::new();
    ctx(token(), owner_key(), 0);
    let _ = leash.ft_on_transfer(owner(), U128(10 * USDC), String::new());
    ctx(owner(), owner_key(), STORAGE_CREDIT);
    leash.set_policy(agent_key(), PolicyInput { name: Some("claude".into()), token: token(), daily_cap: U128(5 * USDC), per_payment_cap: U128(2 * USDC), allowlist: vec![], cooldown_secs: 0, expires_at: 0 });
    if pin {
        ctx(contract(), owner_key(), 0);
        leash.set_facts_key(Some(public(&relay())));
    }
    leash
}

fn facts(key: &SigningKey, to: &AccountId, created_at: u64, code_changed_at: u64, observed_at: u64) -> SignedFacts {
    let text = near_sdk::serde_json::json!({ "contract": contract(), "to": to, "created_at": created_at, "code_changed_at": code_changed_at, "tx_count": 12, "observed_at": observed_at }).to_string();
    let message = [b"leash-facts:".as_slice(), text.as_bytes()].concat();
    SignedFacts { text, signature: Base64VecU8(key.sign(&message).to_bytes().to_vec()) }
}

fn pay(leash: &mut Leash, to: AccountId, f: Option<SignedFacts>) -> Result<(), String> {
    ctx(owner(), agent_key(), 0);
    match leash.pay(to, U128(USDC), None, None, f) {
        PromiseOrValue::Promise(_) => Ok(()),
        PromiseOrValue::Value(v) => Err(v.reason.unwrap_or_default()),
    }
}

#[test]
fn only_the_contract_account_pins_the_key() {
    let mut leash = funded(false);
    ctx(contract(), owner_key(), 0);
    leash.set_facts_key(Some(public(&relay())));
    assert_eq!(leash.get_facts_key(), Some(public(&relay())));
    ctx(owner(), owner_key(), 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| leash.set_facts_key(None))).is_err());
}

#[test]
fn without_a_pinned_key_a_stranger_needs_no_facts() {
    let mut leash = funded(false);
    assert!(!leash.needs_facts(owner(), agent_key(), stranger()));
    assert_eq!(pay(&mut leash, stranger(), None), Ok(()));
}

#[test]
fn a_stranger_is_refused_without_facts_and_the_refusal_can_be_parked() {
    let mut leash = funded(true);
    assert!(leash.needs_facts(owner(), agent_key(), stranger()));
    assert_eq!(pay(&mut leash, stranger(), None), Err("first payment to a stranger needs the relay's signed facts".into()));
    assert_eq!(leash.get_vault(owner(), token()).0, 10 * USDC);
    assert!(leash.check(owner(), agent_key(), stranger(), U128(USDC)).can_request);
    let log = leash.get_log(owner(), None, None);
    assert_eq!(log.last().unwrap().event, "pay_refused");
}

#[test]
fn good_facts_pay_and_the_second_payment_needs_none() {
    let mut leash = funded(true);
    let f = facts(&relay(), &stranger(), NOW - 30 * DAY_NS, 0, NOW - 60 * NS_PER_SEC);
    assert_eq!(pay(&mut leash, stranger(), Some(f)), Ok(()));
    assert!(!leash.needs_facts(owner(), agent_key(), stranger()));
    assert_eq!(pay(&mut leash, stranger(), None), Ok(()));
    assert_eq!(leash.get_vault(owner(), token()).0, 8 * USDC);
}

#[test]
fn a_day_old_account_or_fresh_code_is_refused() {
    let mut leash = funded(true);
    let young = facts(&relay(), &stranger(), NOW - 3 * 3_600 * NS_PER_SEC, 0, NOW);
    assert_eq!(pay(&mut leash, stranger(), Some(young)), Err("recipient account is under a day old".into()));
    let fresh = facts(&relay(), &stranger(), NOW - 30 * DAY_NS, NOW - 2 * DAY_NS, NOW);
    assert_eq!(pay(&mut leash, stranger(), Some(fresh)), Err("recipient's contract code changed this week".into()));
    let unknown = facts(&relay(), &stranger(), 0, 0, NOW);
    assert_eq!(pay(&mut leash, stranger(), Some(unknown)), Ok(()));
}

#[test]
fn forged_stale_or_misdirected_facts_are_refused() {
    let mut leash = funded(true);
    let forged = facts(&SigningKey::from_bytes(&[3; 32]), &stranger(), NOW - 30 * DAY_NS, 0, NOW);
    assert_eq!(pay(&mut leash, stranger(), Some(forged)), Err("facts are not signed by the relay".into()));
    let stale = facts(&relay(), &stranger(), NOW - 30 * DAY_NS, 0, NOW - 2 * FACTS_MAX_AGE_NS);
    assert_eq!(pay(&mut leash, stranger(), Some(stale)), Err("facts are stale".into()));
    let other = facts(&relay(), &listed(), NOW - 30 * DAY_NS, 0, NOW);
    assert_eq!(pay(&mut leash, stranger(), Some(other)), Err("facts are about another recipient or contract".into()));
    let mut cut = facts(&relay(), &stranger(), NOW - 30 * DAY_NS, 0, NOW);
    cut.text.push('x');
    assert!(pay(&mut leash, stranger(), Some(cut)).is_err());
    assert_eq!(leash.get_vault(owner(), token()).0, 10 * USDC);
}

#[test]
fn a_listed_recipient_and_the_owner_need_no_facts() {
    let mut leash = funded(true);
    ctx(owner(), owner_key(), STORAGE_CREDIT);
    leash.set_policy(agent_key(), PolicyInput { name: Some("claude".into()), token: token(), daily_cap: U128(5 * USDC), per_payment_cap: U128(2 * USDC), allowlist: vec![listed()], cooldown_secs: 0, expires_at: 0 });
    assert!(!leash.needs_facts(owner(), agent_key(), listed()));
    assert_eq!(pay(&mut leash, listed(), None), Ok(()));
    assert!(!leash.needs_facts(owner(), agent_key(), owner()));
}
