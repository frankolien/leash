//! Tasks: a parent agent hands a sub-agent's key a budget for one job, within its own limits.

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken, PromiseError, PromiseOrValue};

const USDC: u128 = 1_000_000;
const STORAGE_CREDIT: u128 = 1_000_000_000_000_000_000_000_000;
const NOW: u64 = 1_000 * 1_000_000_000;
const HOUR: u64 = 3_600;

fn owner() -> AccountId {
    accounts(0)
}
fn vendor() -> AccountId {
    accounts(1)
}
fn other() -> AccountId {
    accounts(2)
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
fn key(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}
fn public(k: &SigningKey) -> PublicKey {
    format!("ed25519:{}", bs58::encode(k.verifying_key().as_bytes()).into_string()).parse().unwrap()
}

fn ctx(predecessor: AccountId, signer_pk: PublicKey, now: u64, yocto: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(contract()).predecessor_account_id(predecessor).signer_account_id(owner()).signer_account_pk(signer_pk).attached_deposit(NearToken::from_yoctonear(yocto)).block_timestamp(now);
    testing_env!(b.build());
}

/// $10 in the vault; the parent may spend $5 a day, $3 a payment, to anyone.
fn world(parent: &SigningKey) -> Leash {
    let mut leash = Leash::new();
    ctx(token(), owner_key(), NOW, 0);
    let _ = leash.ft_on_transfer(owner(), U128(10 * USDC), String::new());
    ctx(owner(), owner_key(), NOW, STORAGE_CREDIT);
    leash.set_policy(public(parent), PolicyInput { name: Some("claude".into()), token: token(), daily_cap: U128(5 * USDC), per_payment_cap: U128(3 * USDC), allowlist: vec![], cooldown_secs: 0, expires_at: 0 });
    leash
}

fn open(leash: &mut Leash, parent: &SigningKey, child: &SigningKey, budget: u128, allow: Vec<AccountId>) -> u64 {
    ctx(owner(), public(parent), NOW, 0);
    leash.open_task(TaskInput { label: "research".into(), budget: U128(budget), for_secs: HOUR, child: public(child), allow })
}

fn child_pays(leash: &mut Leash, child: &SigningKey, to: AccountId, amount: u128, id: &str, now: u64) -> PromiseOrValue<PayOutcome> {
    let text = near_sdk::serde_json::json!({
        "contract": contract(), "owner": owner(), "key": public(child), "action": "pay",
        "to": to, "amount": U128(amount), "payment_id": id, "expires_at": now + 60 * 1_000_000_000,
    })
    .to_string();
    let sig = Base64VecU8(child.sign(&[b"leash-intent:".as_slice(), text.as_bytes()].concat()).to_bytes().to_vec());
    ctx(accounts(3), owner_key(), now, 0);
    leash.pay_signed(text, sig, None)
}

fn refusal(outcome: PromiseOrValue<PayOutcome>) -> String {
    match outcome {
        PromiseOrValue::Value(v) => v.reason.unwrap(),
        PromiseOrValue::Promise(_) => panic!("expected a refusal"),
    }
}

#[test]
fn a_child_spends_its_task_and_the_parents_day_together() {
    let (parent, child) = (key(7), key(8));
    let mut leash = world(&parent);
    let id = open(&mut leash, &parent, &child, 4 * USDC, vec![]);
    assert!(matches!(child_pays(&mut leash, &child, vendor(), 2 * USDC, "a", NOW), PromiseOrValue::Promise(_)));
    let task = leash.get_tasks(owner()).into_iter().find(|t| t.id == id).unwrap();
    assert_eq!(task.spent.0, 2 * USDC);
    assert_eq!(leash.check(owner(), public(&parent), vendor(), U128(1)).remaining_today.0, 3 * USDC, "the parent's day went down too");
    assert_eq!(leash.check(owner(), public(&child), vendor(), U128(1)).remaining_today.0, 2 * USDC, "the child sees what is left of its task");
}

#[test]
fn a_child_never_spends_past_its_budget() {
    let (parent, child) = (key(7), key(8));
    let mut leash = world(&parent);
    open(&mut leash, &parent, &child, 2 * USDC, vec![]);
    assert!(matches!(child_pays(&mut leash, &child, vendor(), 2 * USDC, "a", NOW), PromiseOrValue::Promise(_)));
    assert_eq!(refusal(child_pays(&mut leash, &child, vendor(), 1, "b", NOW)), "over task budget");
}

#[test]
fn a_task_can_narrow_recipients_but_not_widen_the_parent() {
    let (parent, child) = (key(7), key(8));
    let mut leash = world(&parent);
    open(&mut leash, &parent, &child, 5 * USDC, vec![vendor()]);
    assert_eq!(refusal(child_pays(&mut leash, &child, other(), USDC, "a", NOW)), "recipient not in this task");
    assert_eq!(refusal(child_pays(&mut leash, &child, vendor(), 4 * USDC, "b", NOW)), "over per-payment cap", "the parent's per-payment cap still holds");
}

#[test]
fn revoking_the_parent_stops_every_child() {
    let (parent, child) = (key(7), key(8));
    let mut leash = world(&parent);
    open(&mut leash, &parent, &child, 4 * USDC, vec![]);
    ctx(owner(), owner_key(), NOW, 0);
    leash.revoke(public(&parent));
    assert_eq!(refusal(child_pays(&mut leash, &child, vendor(), USDC, "a", NOW)), "key revoked");
}

#[test]
fn a_task_ends_on_time_or_when_closed() {
    let (parent, child) = (key(7), key(8));
    let mut leash = world(&parent);
    let id = open(&mut leash, &parent, &child, 4 * USDC, vec![]);
    assert_eq!(refusal(child_pays(&mut leash, &child, vendor(), USDC, "a", NOW + (HOUR + 1) * 1_000_000_000)), "task expired");
    ctx(owner(), owner_key(), NOW, 0);
    leash.close_task(id);
    assert_eq!(refusal(child_pays(&mut leash, &child, vendor(), USDC, "b", NOW)), "task closed");
}

#[test]
fn a_failed_transfer_gives_the_task_and_the_parent_their_money_back() {
    let (parent, child) = (key(7), key(8));
    let mut leash = world(&parent);
    let id = open(&mut leash, &parent, &child, 4 * USDC, vec![]);
    let _ = child_pays(&mut leash, &child, vendor(), 2 * USDC, "a", NOW);
    ctx(contract(), owner_key(), NOW, 0);
    leash.on_pay(owner(), public(&child), token(), vendor(), U128(2 * USDC), true, Some("a".into()), Err(PromiseError::Failed));
    assert_eq!(leash.get_tasks(owner()).into_iter().find(|t| t.id == id).unwrap().spent.0, 0);
    assert_eq!(leash.check(owner(), public(&parent), vendor(), U128(1)).remaining_today.0, 5 * USDC);
}

#[test]
#[should_panic(expected = "no policy for this key")]
fn a_child_cannot_open_tasks_of_its_own() {
    let (parent, child, grandchild) = (key(7), key(8), key(9));
    let mut leash = world(&parent);
    open(&mut leash, &parent, &child, 4 * USDC, vec![]);
    open(&mut leash, &child, &grandchild, USDC, vec![]);
}

#[test]
#[should_panic(expected = "within the daily cap")]
fn a_task_cannot_hold_more_than_the_parents_day() {
    let (parent, child) = (key(7), key(8));
    let mut leash = world(&parent);
    open(&mut leash, &parent, &child, 6 * USDC, vec![]);
}

#[test]
#[should_panic(expected = "only the owner or the agent that opened it")]
fn another_agent_cannot_close_a_task() {
    let (parent, child, stranger) = (key(7), key(8), key(10));
    let mut leash = world(&parent);
    ctx(owner(), owner_key(), NOW, STORAGE_CREDIT);
    leash.set_policy(public(&stranger), PolicyInput { name: Some("codex".into()), token: token(), daily_cap: U128(USDC), per_payment_cap: U128(USDC), allowlist: vec![], cooldown_secs: 0, expires_at: 0 });
    let id = open(&mut leash, &parent, &child, 4 * USDC, vec![]);
    ctx(owner(), public(&stranger), NOW, 0);
    leash.close_task(id);
}

#[test]
#[should_panic(expected = "over task budget")]
fn a_child_cannot_park_requests_for_the_owner() {
    let (parent, child) = (key(7), key(8));
    let mut leash = world(&parent);
    open(&mut leash, &parent, &child, USDC, vec![]);
    ctx(owner(), public(&child), NOW, 0);
    leash.request(vendor(), U128(2 * USDC), None);
}
