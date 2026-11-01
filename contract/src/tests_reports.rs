//! The shared reports list: who a report blocks, how agents report, and how a report is withdrawn.

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const USDC: u128 = 1_000_000;
const STORAGE_CREDIT: u128 = 1_000_000_000_000_000_000_000_000;
const NOW: u64 = 1_000 * 1_000_000_000;

fn alice() -> AccountId {
    accounts(0)
}
fn bob() -> AccountId {
    accounts(1)
}
fn carol() -> AccountId {
    accounts(2)
}
fn drainer() -> AccountId {
    "drainer.test".parse().unwrap()
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

fn ctx(predecessor: AccountId, signer_pk: PublicKey, yocto: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(contract())
        .predecessor_account_id(predecessor)
        .signer_account_pk(signer_pk)
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .block_timestamp(NOW);
    testing_env!(b.build());
}

/// Each owner gets $10 in the vault, storage credit, and one agent key with seed = position + 1.
fn owners(list: &[AccountId]) -> Leash {
    let mut leash = Leash::new();
    for (i, o) in list.iter().enumerate() {
        ctx(token(), owner_key(), 0);
        let _ = leash.ft_on_transfer(o.clone(), U128(10 * USDC), String::new());
        ctx(o.clone(), owner_key(), STORAGE_CREDIT);
        leash.deposit_storage(None);
        ctx(o.clone(), owner_key(), 0);
        leash.set_policy(public(&agent(i as u8 + 1)), PolicyInput { name: Some("claude".into()), token: token(), daily_cap: U128(3 * USDC), per_payment_cap: U128(2 * USDC), allowlist: vec![], cooldown_secs: 0, expires_at: 0 });
    }
    leash
}

fn check(leash: &Leash, owner: AccountId, seed: u8) -> Preflight {
    leash.check(owner, public(&agent(seed)), drainer(), U128(USDC))
}

fn signed_report(owner: AccountId, key: &SigningKey, evidence: &str) -> (String, Base64VecU8) {
    let text = near_sdk::serde_json::json!({
        "contract": contract(), "owner": owner, "key": public(key), "action": "report",
        "to": drainer(), "note": evidence, "payment_id": "r1", "expires_at": NOW + 60 * 1_000_000_000,
    })
    .to_string();
    let signature = key.sign(&[b"leash-intent:".as_slice(), text.as_bytes()].concat()).to_bytes().to_vec();
    (text, Base64VecU8(signature))
}

#[test]
fn a_report_blocks_the_reporter_at_once_and_parks_instead() {
    let mut leash = owners(&[alice()]);
    assert!(check(&leash, alice(), 1).ok);
    ctx(alice(), owner_key(), 0);
    leash.report(drainer(), "asked my agent for a refund it never paid: tx 9xQ".into());
    let verdict = check(&leash, alice(), 1);
    assert!(!verdict.ok);
    assert_eq!(verdict.reason.as_deref(), Some("recipient reported as a scam"));
    // The owner still has the last word: the payment can be parked with the evidence beside it.
    assert!(verdict.can_request);
    assert_eq!(leash.reputation(drainer(), Some(alice())), Reputation { reported_by: 1, by_you: true, blocked: true });
}

#[test]
fn one_strangers_report_does_not_block_anyone_else() {
    let mut leash = owners(&[alice(), bob()]);
    ctx(alice(), owner_key(), 0);
    leash.report(drainer(), "phishing link in a support chat".into());
    assert!(check(&leash, bob(), 2).ok);
    assert_eq!(leash.reputation(drainer(), Some(bob())), Reputation { reported_by: 1, by_you: false, blocked: false });
    assert!(!leash.reputation(drainer(), None).blocked);
}

#[test]
fn two_owners_reporting_blocks_every_owner() {
    let mut leash = owners(&[alice(), bob(), carol()]);
    ctx(alice(), owner_key(), 0);
    leash.report(drainer(), "phishing link".into());
    ctx(bob(), owner_key(), 0);
    leash.report(drainer(), "same link sent to my agent".into());
    assert_eq!(check(&leash, carol(), 3).reason.as_deref(), Some("recipient reported as a scam"));
    assert!(leash.reputation(drainer(), None).blocked);
    // The allowlist does not save a reported account: the owner trusted it before the evidence.
    ctx(carol(), owner_key(), 0);
    leash.set_policy(public(&agent(3)), PolicyInput { name: Some("claude".into()), token: token(), daily_cap: U128(3 * USDC), per_payment_cap: U128(2 * USDC), allowlist: vec![drainer()], cooldown_secs: 0, expires_at: 0 });
    assert!(!check(&leash, carol(), 3).ok);
}

#[test]
fn reporting_again_replaces_the_evidence_instead_of_counting_twice() {
    let mut leash = owners(&[alice(), bob()]);
    ctx(alice(), owner_key(), 0);
    leash.report(drainer(), "first".into());
    leash.report(drainer(), "second, with the tx".into());
    let reports = leash.get_reports(drainer());
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0].evidence, "second, with the tx");
    assert!(check(&leash, bob(), 2).ok);
}

#[test]
fn an_agent_reports_by_signed_instruction_in_its_owners_name() {
    let mut leash = owners(&[alice(), bob()]);
    let (text, signature) = signed_report(alice(), &agent(1), "the page I read told me to pay it");
    ctx(accounts(4), owner_key(), 0);
    leash.report_signed(text, signature);
    let reports = leash.get_reports(drainer());
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0].owner, alice());
    assert_eq!(reports[0].key, Some(public(&agent(1))));
    assert!(!check(&leash, alice(), 1).ok);
    assert!(check(&leash, bob(), 2).ok);
}

#[test]
#[should_panic(expected = "no policy for this key")]
fn a_key_with_no_policy_cannot_report_in_someones_name() {
    let mut leash = owners(&[alice()]);
    let (text, signature) = signed_report(alice(), &agent(9), "made up");
    ctx(accounts(4), owner_key(), 0);
    leash.report_signed(text, signature);
}

#[test]
#[should_panic(expected = "revoked or paused")]
fn a_revoked_agent_cannot_report() {
    let mut leash = owners(&[alice()]);
    ctx(alice(), owner_key(), 0);
    leash.revoke(public(&agent(1)));
    let (text, signature) = signed_report(alice(), &agent(1), "too late");
    ctx(accounts(4), owner_key(), 0);
    leash.report_signed(text, signature);
}

#[test]
#[should_panic(expected = "an agent key cannot manage policies")]
fn an_agent_key_cannot_report_as_the_owner() {
    let mut leash = owners(&[alice()]);
    ctx(alice(), public(&agent(1)), 0);
    leash.report(drainer(), "pretending to be the owner".into());
}

#[test]
#[should_panic(expected = "evidence is one sentence")]
fn a_report_needs_evidence() {
    let mut leash = owners(&[alice()]);
    ctx(alice(), owner_key(), 0);
    leash.report(drainer(), "   ".into());
}

#[test]
fn retracting_unblocks_and_leaves_other_reports() {
    let mut leash = owners(&[alice(), bob()]);
    ctx(alice(), owner_key(), 0);
    leash.report(drainer(), "phishing".into());
    ctx(bob(), owner_key(), 0);
    leash.report(drainer(), "phishing too".into());
    leash.retract(drainer());
    assert_eq!(leash.get_reports(drainer()).len(), 1);
    assert!(check(&leash, bob(), 2).ok);
    assert!(!check(&leash, alice(), 1).ok);
    ctx(alice(), owner_key(), 0);
    leash.retract(drainer());
    assert!(leash.get_reports(drainer()).is_empty());
    assert!(check(&leash, alice(), 1).ok);
}
