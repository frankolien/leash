//! Unit tests on the mocked chain. The sandbox tests in tests/ cover the cross-contract paths.

use super::*;
use near_sdk::json_types::U128;
use near_sdk::{env, NearToken, PromiseError, PromiseOrValue};
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
    let _ = leash.ft_on_transfer(owner(), U128(10 * USDC), String::new());
    ctx_with_deposit(owner(), owner_key(), 1, STORAGE_CREDIT);
    leash.set_policy(
        agent_key(),
        PolicyInput { name: Some("claude".into()), token: token(), daily_cap: U128(daily), per_payment_cap: U128(per_payment), allowlist: vec![], cooldown_secs: 0, expires_at: 0 },
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
    leash.deposit_storage(None);
    let byte = env::storage_byte_cost().as_yoctonear();
    leash.settle(&owner(), 1_000, 1_100);
    assert_eq!(leash.get_storage(owner()).0, STORAGE_CREDIT - 100 * byte);
    leash.settle(&owner(), 1_100, 1_060);
    assert_eq!(leash.get_storage(owner()).0, STORAGE_CREDIT - 60 * byte);
}

#[test]
fn a_sponsor_can_pay_storage_for_a_new_owner() {
    let mut leash = Leash::new();
    ctx_with_deposit(vendor(), owner_key(), 1, STORAGE_CREDIT);
    leash.deposit_storage(Some(owner()));
    assert_eq!(leash.get_storage(owner()).0, STORAGE_CREDIT);
    assert_eq!(leash.get_storage(vendor()).0, 0);
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
    let _ = leash.ft_on_transfer(owner(), U128(10 * USDC), String::new());
    ctx_with_deposit(owner(), owner_key(), 1, STORAGE_CREDIT);
    leash.set_policy(
        agent_key(),
        PolicyInput { name: Some("claude".into()), token: token(), daily_cap: U128(5 * USDC), per_payment_cap: U128(USDC), allowlist: vec![vendor()], cooldown_secs: 60, expires_at: 1_000 },
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
    let _ = leash.approve(id);
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
