//! Signed instructions, payment ids and raises, on the mocked chain with real ed25519 signatures.

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken, PromiseError, PromiseOrValue};

const USDC: u128 = 1_000_000;
const STORAGE_CREDIT: u128 = 1_000_000_000_000_000_000_000_000;
const NOW: u64 = 1_000 * 1_000_000_000;

fn owner() -> AccountId {
    accounts(0)
}
fn vendor() -> AccountId {
    accounts(1)
}
fn relayer() -> AccountId {
    accounts(3)
}
fn token() -> AccountId {
    "usdc.test".parse().unwrap()
}
fn contract() -> AccountId {
    "leash.test".parse().unwrap()
}
fn owner_key() -> PublicKey {
    "ed25519:H9k5eiU4xXS3M4z8HzKJSLaZdqGdGwBG49o7orNC4eZW".parse().unwrap()
}

fn agent(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

fn public(k: &SigningKey) -> PublicKey {
    format!("ed25519:{}", bs58::encode(k.verifying_key().as_bytes()).into_string()).parse().unwrap()
}

fn ctx(predecessor: AccountId, signer_pk: PublicKey, now: u64, yocto: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(contract())
        .predecessor_account_id(predecessor)
        .signer_account_id(relayer())
        .signer_account_pk(signer_pk)
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .block_timestamp(now);
    testing_env!(b.build());
}

/// A vault with $10 and one policy per given agent key: $3 a day, $2 a payment.
fn funded(keys: &[&SigningKey]) -> Leash {
    let mut leash = Leash::new();
    ctx(token(), owner_key(), NOW, 0);
    let _ = leash.ft_on_transfer(owner(), U128(10 * USDC), String::new());
    for k in keys {
        ctx(owner(), owner_key(), NOW, STORAGE_CREDIT);
        leash.set_policy(public(k), PolicyInput { name: Some("claude".into()), token: token(), daily_cap: U128(3 * USDC), per_payment_cap: U128(2 * USDC), allowlist: vec![], cooldown_secs: 0, expires_at: 0 });
    }
    leash
}

fn intent(key: &SigningKey, action: &str, amount: u128, payment_id: &str) -> String {
    near_sdk::serde_json::json!({
        "contract": contract(), "owner": owner(), "key": public(key), "action": action,
        "to": vendor(), "amount": U128(amount), "payment_id": payment_id, "expires_at": NOW + 60 * 1_000_000_000,
    })
    .to_string()
}

fn sign(key: &SigningKey, text: &str) -> Base64VecU8 {
    let message = [b"leash-intent:".as_slice(), text.as_bytes()].concat();
    Base64VecU8(key.sign(&message).to_bytes().to_vec())
}

/// Delivered by a relayer whose own key has no policy, as a meta-transaction or plain call would be.
fn deliver(leash: &mut Leash, text: &str, sig: Base64VecU8) -> PromiseOrValue<PayOutcome> {
    ctx(relayer(), owner_key(), NOW, 0);
    leash.pay_signed(text.to_string(), sig, None)
}

fn paid(outcome: &PromiseOrValue<PayOutcome>) -> bool {
    matches!(outcome, PromiseOrValue::Promise(_))
}

#[test]
fn a_relayer_delivers_a_payment_the_agent_signed() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    let text = intent(&claude, "pay", USDC, "inv-1");
    assert!(paid(&deliver(&mut leash, &text, sign(&claude, &text))));
    assert_eq!(leash.get_vault(owner(), token()).0, 9 * USDC);
    assert!(leash.was_paid(owner(), public(&claude), "inv-1".into()));
}

#[test]
fn the_same_signed_payment_never_pays_twice() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    let text = intent(&claude, "pay", USDC, "inv-1");
    let sig = sign(&claude, &text);
    assert!(paid(&deliver(&mut leash, &text, sig.clone())));
    match deliver(&mut leash, &text, sig) {
        PromiseOrValue::Value(v) => assert!(v.accepted && v.reason.unwrap().starts_with("already paid")),
        PromiseOrValue::Promise(_) => panic!("a replay moved money"),
    }
    assert_eq!(leash.get_vault(owner(), token()).0, 9 * USDC);
}

#[test]
#[should_panic(expected = "signature does not match the key")]
fn a_relayer_cannot_change_the_amount() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    let sig = sign(&claude, &intent(&claude, "pay", USDC, "inv-1"));
    let _ = deliver(&mut leash, &intent(&claude, "pay", 2 * USDC, "inv-1"), sig);
}

#[test]
#[should_panic(expected = "signature does not match the key")]
fn one_agent_cannot_spend_under_another_agents_policy() {
    let (claude, codex) = (agent(7), agent(9));
    let mut leash = funded(&[&claude, &codex]);
    let text = intent(&claude, "pay", USDC, "inv-1");
    let _ = deliver(&mut leash, &text, sign(&codex, &text));
}

#[test]
#[should_panic(expected = "intent expired")]
fn an_old_instruction_is_worthless() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    let text = intent(&claude, "pay", USDC, "inv-1");
    let sig = sign(&claude, &text);
    ctx(relayer(), owner_key(), NOW + 61 * 1_000_000_000, 0);
    let _ = leash.pay_signed(text, sig, None);
}

#[test]
#[should_panic(expected = "intent is for another action")]
fn a_signed_request_cannot_be_delivered_as_a_payment() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    let text = intent(&claude, "request", USDC, "inv-1");
    let _ = deliver(&mut leash, &text, sign(&claude, &text));
}

#[test]
fn signed_payments_still_obey_the_policy() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    let text = intent(&claude, "pay", 5 * USDC, "big");
    match deliver(&mut leash, &text, sign(&claude, &text)) {
        PromiseOrValue::Value(v) => assert_eq!(v.reason.unwrap(), "over per-payment cap"),
        PromiseOrValue::Promise(_) => panic!("over the cap and paid"),
    }
}

#[test]
fn a_failed_transfer_frees_its_payment_id_for_an_honest_retry() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    let text = intent(&claude, "pay", USDC, "inv-1");
    assert!(paid(&deliver(&mut leash, &text, sign(&claude, &text))));
    ctx(contract(), owner_key(), NOW, 0);
    leash.on_pay(owner(), public(&claude), token(), vendor(), U128(USDC), true, Some("inv-1".into()), Err(PromiseError::Failed));
    assert!(!leash.was_paid(owner(), public(&claude), "inv-1".into()));
    assert_eq!(leash.get_vault(owner(), token()).0, 10 * USDC);
}

#[test]
fn a_payment_id_dedupes_direct_payments_too() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    ctx(owner(), public(&claude), NOW, 0);
    assert!(paid(&leash.pay(vendor(), U128(USDC), None, Some("inv-9".into()), None)));
    match leash.pay(vendor(), U128(USDC), None, Some("inv-9".into()), None) {
        PromiseOrValue::Value(v) => assert!(v.accepted),
        PromiseOrValue::Promise(_) => panic!("paid twice"),
    }
    assert_eq!(leash.get_vault(owner(), token()).0, 9 * USDC);
}

#[test]
fn a_granted_ask_widens_the_caps_until_it_lapses() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    ctx(owner(), public(&claude), NOW, 0);
    let ask = Ask { daily_cap: Some(U128(8 * USDC)), per_payment_cap: Some(U128(5 * USDC)), allow: vec![], for_secs: 3_600 };
    let id = leash.ask_more("Renewing the annual plan today".into(), Some(ask.clone()));
    assert_eq!(leash.get_proposals(owner())[0].ask, Some(ask));

    ctx(owner(), owner_key(), NOW, 0);
    leash.grant(id, None);
    assert!(leash.get_proposals(owner()).is_empty());
    assert_eq!(leash.get_raises(owner()).len(), 1);
    assert!(leash.check(owner(), public(&claude), vendor(), U128(5 * USDC)).ok);
    assert_eq!(leash.check(owner(), public(&claude), vendor(), U128(5 * USDC)).remaining_today.0, 8 * USDC);

    ctx(owner(), owner_key(), NOW + 3_601 * 1_000_000_000, 0);
    assert!(leash.get_raises(owner()).is_empty());
    assert_eq!(leash.check(owner(), public(&claude), vendor(), U128(5 * USDC)).reason.unwrap(), "over per-payment cap");
}

#[test]
fn a_raise_can_add_a_recipient_for_a_while() {
    let claude = agent(7);
    let mut leash = Leash::new();
    ctx(token(), owner_key(), NOW, 0);
    let _ = leash.ft_on_transfer(owner(), U128(10 * USDC), String::new());
    ctx(owner(), owner_key(), NOW, STORAGE_CREDIT);
    leash.set_policy(public(&claude), PolicyInput { name: None, token: token(), daily_cap: U128(3 * USDC), per_payment_cap: U128(2 * USDC), allowlist: vec![accounts(2)], cooldown_secs: 0, expires_at: 0 });
    ctx(owner(), public(&claude), NOW, 0);
    let id = leash.ask_more("Pay the new vendor this week".into(), Some(Ask { allow: vec![vendor()], ..Default::default() }));
    ctx(owner(), owner_key(), NOW, 0);
    leash.grant(id, Some(7 * 86_400));
    assert!(leash.check(owner(), public(&claude), vendor(), U128(USDC)).ok);
    leash.end_raise(public(&claude));
    assert_eq!(leash.check(owner(), public(&claude), vendor(), U128(USDC)).reason.unwrap(), "recipient not in allowlist");
}

#[test]
#[should_panic(expected = "this ask names no terms")]
fn a_note_without_terms_cannot_be_granted() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    ctx(owner(), public(&claude), NOW, 0);
    let id = leash.ask_more("Could you raise my limit?".into(), None);
    ctx(owner(), owner_key(), NOW, 0);
    leash.grant(id, None);
}

#[test]
#[should_panic(expected = "an agent key cannot manage policies")]
fn an_agent_cannot_grant_its_own_ask() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    ctx(owner(), public(&claude), NOW, 0);
    let id = leash.ask_more("More please".into(), Some(Ask { daily_cap: Some(U128(100 * USDC)), ..Default::default() }));
    leash.grant(id, None);
}

#[test]
#[should_panic(expected = "this instruction was already delivered")]
fn a_signed_request_cannot_be_replayed() {
    let claude = agent(7);
    let mut leash = funded(&[&claude]);
    let text = intent(&claude, "request", 5 * USDC, "req-1");
    let sig = sign(&claude, &text);
    ctx(relayer(), owner_key(), NOW, 0);
    leash.request_signed(text.clone(), sig.clone());
    leash.request_signed(text, sig);
}
