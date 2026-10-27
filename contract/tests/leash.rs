//! The README's six steps against a real NEAR sandbox: a mock USDC, an agent signing with a true
//! function-call key, the cross-contract transfer, the refund when a transfer fails, the storage
//! credit, and the protocol refusing a deleted key.

use anyhow::Result;
use near_workspaces::types::{AccessKey, Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};

const USDC: u128 = 1_000_000;
const REGISTRATION: NearToken = NearToken::from_yoctonear(1_250_000_000_000_000_000_000);

async fn register(ft: &Contract, payer: &Account, who: &AccountId) -> Result<()> {
    payer
        .call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": who }))
        .deposit(REGISTRATION)
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn balance(ft: &Contract, who: &AccountId) -> Result<u128> {
    let raw: String = ft.view("ft_balance_of").args_json(json!({ "account_id": who })).await?.json()?;
    Ok(raw.parse()?)
}

async fn vault(leash: &Contract, owner: &AccountId, ft: &AccountId) -> Result<u128> {
    let raw: String = leash.view("get_vault").args_json(json!({ "owner": owner, "token": ft })).await?.json()?;
    Ok(raw.parse()?)
}

async fn credit(leash: &Contract, owner: &AccountId) -> Result<u128> {
    let raw: String = leash.view("get_storage").args_json(json!({ "owner": owner })).await?.json()?;
    Ok(raw.parse()?)
}

async fn pay(agent: &Account, leash: &Contract, to: &AccountId, amount: u128) -> Result<Value> {
    Ok(agent
        .call(leash.id(), "pay")
        .args_json(json!({ "to": to, "amount": amount.to_string(), "memo": "sandbox" }))
        .gas(Gas::from_tgas(60))
        .transact()
        .await?
        .json()?)
}

struct World {
    worker: Worker<near_workspaces::network::Sandbox>,
    ft: Contract,
    leash: Contract,
    owner: Account,
    vendor: Account,
}

/// Builds a contract with cargo-near and reads the optimised binary, so the sandbox always runs the
/// source as it stands. `cargo test` therefore needs cargo-near on the path, which the README's
/// install step covers. LEASH_SKIP_BUILD=1 reuses what is there.
fn built(dir: &str, name: &str) -> Result<Vec<u8>> {
    let path = format!("{dir}/target/near/{name}.wasm");
    if std::env::var("LEASH_SKIP_BUILD").is_err() || std::fs::metadata(&path).is_err() {
        let status = std::process::Command::new("cargo")
            .args(["near", "build", "non-reproducible-wasm"])
            .current_dir(dir)
            .status()?;
        anyhow::ensure!(status.success(), "cargo near build failed in {dir}");
    }
    Ok(std::fs::read(path)?)
}

async fn world() -> Result<World> {
    let worker = near_workspaces::sandbox().await?;
    let ft_wasm = built("./tests/mock-ft", "mock_ft")?;
    let leash_wasm = built(".", "leash")?;
    let ft = worker.dev_deploy(&ft_wasm).await?;
    let leash = worker.dev_deploy(&leash_wasm).await?;
    ft.call("new").transact().await?.into_result()?;
    leash.call("new").transact().await?.into_result()?;
    let owner = worker.dev_create_account().await?;
    let vendor = worker.dev_create_account().await?;
    for who in [owner.id(), vendor.id(), leash.id()] {
        register(&ft, &owner, who).await?;
    }
    ft.call("mint").args_json(json!({ "account_id": owner.id(), "amount": (100 * USDC).to_string() })).transact().await?.into_result()?;
    Ok(World { worker, ft, leash, owner, vendor })
}

/// The agent is the owner's account signing with a key that may only call the contract.
async fn grant(w: &World, daily: u128, per_payment: u128, allowlist: Vec<&AccountId>) -> Result<(Account, SecretKey)> {
    let key = SecretKey::from_random(KeyType::ED25519);
    w.owner
        .batch(w.owner.id())
        .add_key(key.public_key(), AccessKey::function_call_access(w.leash.id(), &["pay", "request"], Some(NearToken::from_near(1))))
        .transact()
        .await?
        .into_result()?;
    w.owner
        .call(w.leash.id(), "set_policy")
        .args_json(json!({
            "public_key": key.public_key().to_string(),
            "policy": { "token": w.ft.id(), "daily_cap": daily.to_string(), "per_payment_cap": per_payment.to_string(), "allowlist": allowlist, "cooldown_secs": 0, "expires_at": 0 }
        }))
        .transact()
        .await?
        .into_result()?;
    let agent = Account::from_secret_key(w.owner.id().clone(), key.clone(), &w.worker);
    Ok((agent, key))
}

#[tokio::test]
async fn the_six_steps_run_against_a_real_chain() -> Result<()> {
    let w = world().await?;
    let owner_id = w.owner.id().clone();

    // Step 2: storage credit and a deposit through ft_transfer_call.
    w.owner.call(w.leash.id(), "deposit_storage").args_json(serde_json::json!({})).deposit(NearToken::from_millinear(500)).transact().await?.into_result()?;
    let credit_before_policy = credit(&w.leash, &owner_id).await?;
    w.owner
        .call(w.ft.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": w.leash.id(), "amount": (10 * USDC).to_string(), "msg": "" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(60))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(vault(&w.leash, &owner_id, w.ft.id()).await?, 10 * USDC);
    assert_eq!(balance(&w.ft, w.leash.id()).await?, 10 * USDC, "the token moved to the contract");

    // Step 3: the grant costs bytes, paid by the owner.
    let (agent, key) = grant(&w, 3 * USDC, 2 * USDC, vec![w.vendor.id()]).await?;
    assert!(credit(&w.leash, &owner_id).await? < credit_before_policy, "the policy was billed");

    // Step 4: two payments land.
    for _ in 0..2 {
        let outcome = pay(&agent, &w.leash, w.vendor.id(), USDC).await?;
        assert_eq!(outcome["accepted"], true, "{outcome}");
    }
    assert_eq!(balance(&w.ft, w.vendor.id()).await?, 2 * USDC);
    assert_eq!(vault(&w.leash, &owner_id, w.ft.id()).await?, 8 * USDC);

    // Step 5: the third is refused, parked, approved by the owner, and lands.
    let refused = pay(&agent, &w.leash, w.vendor.id(), 2 * USDC).await?;
    assert_eq!(refused["accepted"], false);
    assert_eq!(refused["reason"], "over daily cap");
    let id: u64 = agent
        .call(w.leash.id(), "request")
        .args_json(json!({ "to": w.vendor.id(), "amount": (2 * USDC).to_string(), "memo": "please" }))
        .transact()
        .await?
        .json()?;
    let approved: Value = w.owner.call(w.leash.id(), "approve").args_json(json!({ "request_id": id })).gas(Gas::from_tgas(60)).transact().await?.json()?;
    assert_eq!(approved["accepted"], true, "{approved}");
    assert_eq!(balance(&w.ft, w.vendor.id()).await?, 4 * USDC);
    assert_eq!(vault(&w.leash, &owner_id, w.ft.id()).await?, 6 * USDC);
    let requests: Vec<Value> = w.leash.view("get_requests").args_json(json!({ "owner": owner_id })).await?.json()?;
    assert!(requests.is_empty());

    // The agent key cannot approve its own request: the protocol stops it before the contract.
    let sneaky = agent.call(w.leash.id(), "approve").args_json(json!({ "request_id": 1 })).transact().await;
    assert!(sneaky.is_err() || !sneaky?.is_success(), "a function-call key limited to pay and request cannot approve");

    // Step 6: revoke, delete the key, and the next call never reaches the contract.
    w.owner.call(w.leash.id(), "revoke").args_json(json!({ "public_key": key.public_key().to_string() })).transact().await?.into_result()?;
    w.owner.batch(w.owner.id()).delete_key(key.public_key()).transact().await?.into_result()?;
    let after = pay(&agent, &w.leash, w.vendor.id(), USDC).await;
    assert!(after.is_err(), "the deleted key must be rejected by the protocol");
    Ok(())
}

#[tokio::test]
async fn a_failed_transfer_is_refunded_on_chain() -> Result<()> {
    let w = world().await?;
    let owner_id = w.owner.id().clone();
    w.owner.call(w.leash.id(), "deposit_storage").args_json(serde_json::json!({})).deposit(NearToken::from_millinear(500)).transact().await?.into_result()?;
    w.owner
        .call(w.ft.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": w.leash.id(), "amount": (5 * USDC).to_string(), "msg": "" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(60))
        .transact()
        .await?
        .into_result()?;
    let (agent, _key) = grant(&w, 3 * USDC, 2 * USDC, vec![]).await?;

    // A stranger who never registered on the token cannot receive it, so the transfer fails inside
    // the token contract and the callback must give the vault and the daily counter back.
    let stranger = w.worker.dev_create_account().await?;
    let outcome = pay(&agent, &w.leash, stranger.id(), 2 * USDC).await?;
    assert_eq!(outcome["accepted"], false, "{outcome}");
    assert_eq!(outcome["reason"], "transfer failed, refunded");
    assert_eq!(outcome["remaining_today"], (3 * USDC).to_string());
    assert_eq!(vault(&w.leash, &owner_id, w.ft.id()).await?, 5 * USDC);
    assert_eq!(balance(&w.ft, w.leash.id()).await?, 5 * USDC, "the token never left");
    Ok(())
}

#[tokio::test]
async fn an_owner_without_storage_credit_cannot_add_state() -> Result<()> {
    let w = world().await?;
    let key = SecretKey::from_random(KeyType::ED25519);
    let result = w
        .owner
        .call(w.leash.id(), "set_policy")
        .args_json(json!({
            "public_key": key.public_key().to_string(),
            "policy": { "token": w.ft.id(), "daily_cap": USDC.to_string(), "per_payment_cap": USDC.to_string(), "allowlist": [], "cooldown_secs": 0, "expires_at": 0 }
        }))
        .transact()
        .await?;
    assert!(!result.is_success());
    assert!(format!("{:?}", result.failures()).contains("owner has no storage credit"));
    Ok(())
}

/// The live contract upgrades in place, so this replays it: the previous release's state (a vault,
/// a policy) survives `migrate`; a stranger delivers a payment the agent signed off chain, once and
/// only once; then the agent opens a task and its sub-agent's key spends from it. Runs when
/// LEASH_PREV_WASM points at a build of the previous release.
#[tokio::test]
async fn previous_state_survives_the_upgrade_and_signed_payments_relay() -> Result<()> {
    use ed25519_dalek::{Signer, SigningKey};
    let Ok(v1_path) = std::env::var("LEASH_PREV_WASM") else { return Ok(()) };
    let worker = near_workspaces::sandbox().await?;
    let ft = worker.dev_deploy(&built("./tests/mock-ft", "mock_ft")?).await?;
    let leash = worker.dev_deploy(&std::fs::read(v1_path)?).await?;
    ft.call("new").transact().await?.into_result()?;
    leash.call("new").transact().await?.into_result()?;
    let owner = worker.dev_create_account().await?;
    let vendor = worker.dev_create_account().await?;
    for who in [owner.id(), vendor.id(), leash.id()] {
        register(&ft, &owner, who).await?;
    }
    ft.call("mint").args_json(json!({ "account_id": owner.id(), "amount": (100 * USDC).to_string() })).transact().await?.into_result()?;
    owner.call(leash.id(), "deposit_storage").args_json(json!({})).deposit(NearToken::from_millinear(500)).transact().await?.into_result()?;
    owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": leash.id(), "amount": (10 * USDC).to_string(), "msg": "" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(60))
        .transact()
        .await?
        .into_result()?;

    // The agent's key is only a signing key: it never needs to be an access key on any account.
    let agent = SigningKey::from_bytes(&[42; 32]);
    let agent_pk = format!("ed25519:{}", bs58::encode(agent.verifying_key().as_bytes()).into_string());
    owner
        .call(leash.id(), "set_policy")
        .args_json(json!({ "public_key": agent_pk, "policy": { "name": "claude", "token": ft.id(), "daily_cap": (3 * USDC).to_string(), "per_payment_cap": (2 * USDC).to_string() } }))
        .transact()
        .await?
        .into_result()?;

    leash.as_account().deploy(&built(".", "leash")?).await?.into_result()?;
    leash.call("migrate").transact().await?.into_result()?;
    assert_eq!(vault(&leash, owner.id(), ft.id()).await?, 10 * USDC, "the vault survived the upgrade");
    let policies: Vec<Value> = leash.view("get_policies").args_json(json!({ "owner": owner.id() })).await?.json()?;
    assert_eq!(policies[0][1]["name"], "claude", "the policy survived the upgrade");

    let now: u64 = worker.view_block().await?.timestamp();
    let text = json!({
        "contract": leash.id(), "owner": owner.id(), "key": agent_pk, "action": "pay", "to": vendor.id(),
        "amount": USDC.to_string(), "payment_id": "inv-1", "expires_at": now + 600_000_000_000u64,
    })
    .to_string();
    let message = [b"leash-intent:".as_slice(), text.as_bytes()].concat();
    let signature = near_sdk::base64::Engine::encode(&near_sdk::base64::engine::general_purpose::STANDARD, agent.sign(&message).to_bytes());
    let deliver = || vendor.call(leash.id(), "pay_signed").args_json(json!({ "intent": text, "signature": signature })).gas(Gas::from_tgas(80)).transact();

    let first: Value = deliver().await?.json()?;
    assert_eq!(first["accepted"], true, "{first}");
    assert_eq!(balance(&ft, vendor.id()).await?, USDC, "the vendor was paid by a payment a stranger delivered");
    let again: Value = deliver().await?.json()?;
    assert!(again["reason"].as_str().unwrap_or_default().starts_with("already paid"), "{again}");
    assert_eq!(balance(&ft, vendor.id()).await?, USDC, "a replay moved nothing");
    assert_eq!(vault(&leash, owner.id(), ft.id()).await?, 9 * USDC);

    // A task: the agent hands a sub-agent $1 for one job; its key pays by signed instruction too.
    let child = SigningKey::from_bytes(&[43; 32]);
    let child_pk = format!("ed25519:{}", bs58::encode(child.verifying_key().as_bytes()).into_string());
    let sign = |k: &SigningKey, t: &str| near_sdk::base64::Engine::encode(&near_sdk::base64::engine::general_purpose::STANDARD, k.sign(&[b"leash-intent:".as_slice(), t.as_bytes()].concat()).to_bytes());
    let open = json!({
        "contract": leash.id(), "owner": owner.id(), "key": agent_pk, "action": "open_task", "payment_id": "task-1", "expires_at": now + 600_000_000_000u64,
        "task": { "label": "research", "budget": USDC.to_string(), "for_secs": 3600, "child": child_pk },
    })
    .to_string();
    vendor.call(leash.id(), "open_task_signed").args_json(json!({ "intent": open, "signature": sign(&agent, &open) })).gas(Gas::from_tgas(80)).transact().await?.into_result()?;
    let child_pay = |id: &str, amount: u128| {
        json!({ "contract": leash.id(), "owner": owner.id(), "key": child_pk, "action": "pay", "to": vendor.id(), "amount": amount.to_string(), "payment_id": id, "expires_at": now + 600_000_000_000u64 }).to_string()
    };
    let small = child_pay("c-1", USDC / 2);
    let paid: Value = vendor.call(leash.id(), "pay_signed").args_json(json!({ "intent": small, "signature": sign(&child, &small) })).gas(Gas::from_tgas(80)).transact().await?.json()?;
    assert_eq!(paid["accepted"], true, "{paid}");
    let big = child_pay("c-2", USDC);
    let refused: Value = vendor.call(leash.id(), "pay_signed").args_json(json!({ "intent": big, "signature": sign(&child, &big) })).gas(Gas::from_tgas(80)).transact().await?.json()?;
    assert_eq!(refused["reason"], "over task budget", "{refused}");
    let tasks: Vec<Value> = leash.view("get_tasks").args_json(json!({ "owner": owner.id() })).await?.json()?;
    assert_eq!(tasks[0]["spent"], (USDC / 2).to_string());
    assert_eq!(vault(&leash, owner.id(), ft.id()).await?, 9 * USDC - USDC / 2);
    Ok(())
}
