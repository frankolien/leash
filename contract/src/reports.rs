//! Reports: one list every owner shares, of accounts caught scamming agents, each with evidence.
//! A report blocks that recipient at once for the owner who made it. Reports from two different
//! owners block it for every owner, so one owner alone can never cut a stranger off from everyone.
//! A blocked payment can still be parked: the owner sees the evidence and has the last word. A report
//! costs the reporter's storage credit and can be withdrawn.

use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, PublicKey};

use crate::*;

#[near]
impl Leash {
    /// The owner reports an account. Reporting the same account again replaces the evidence.
    pub fn report(&mut self, account: AccountId, evidence: String) {
        let owner = self.owner_caller();
        self.report_for(owner, None, account, evidence)
    }

    /// An agent reports an account by signed instruction (`to` names it, `note` carries the evidence),
    /// so no agent key needs another method. The report is made in its owner's name.
    pub fn report_signed(&mut self, intent: String, signature: Base64VecU8) {
        let i = self.verified(&intent, &signature, "report");
        let parent = self.task_for(&i.owner, &i.key).map_or(i.key.clone(), |t| t.parent);
        let policy = self.policies.get(&(i.owner.clone(), parent)).expect("no policy for this key");
        assert!(policy.active && !self.is_paused(i.owner.clone()), "this key cannot act: revoked or paused");
        self.once(&i.owner, &i.key, &i.payment_id);
        self.report_for(i.owner, Some(i.key), i.to.expect("intent names no account"), i.note.expect("intent has no evidence"))
    }

    /// The owner withdraws their report; the bytes it took are credited back.
    pub fn retract(&mut self, account: AccountId) {
        let owner = self.owner_caller();
        let before = env::storage_usage();
        let mut list = self.reports.get(&account).cloned().unwrap_or_default();
        let had = list.len();
        list.retain(|r| r.owner != owner);
        assert!(list.len() < had, "you have not reported this account");
        if list.is_empty() {
            self.reports.remove(&account);
        } else {
            self.reports.insert(account.clone(), list);
        }
        self.record(&owner, None, "report_retracted", Some(&account), None, None);
        emit("report_retracted", json!({ "owner": owner, "account": account }));
        self.charge(&owner, before);
    }

    pub fn get_reports(&self, account: AccountId) -> Vec<Report> {
        self.reports.get(&account).cloned().unwrap_or_default()
    }

    /// What the reports mean for `owner`'s agents, or for every owner's when `owner` is not given.
    pub fn reputation(&self, account: AccountId, owner: Option<AccountId>) -> Reputation {
        let list = self.reports.get(&account).cloned().unwrap_or_default();
        let by_you = owner.as_ref().is_some_and(|o| list.iter().any(|r| &r.owner == o));
        Reputation { reported_by: list.len() as u32, by_you, blocked: by_you || list.len() >= REPORTS_TO_BLOCK_ALL }
    }
}

impl Leash {
    pub(crate) fn report_for(&mut self, owner: AccountId, key: Option<PublicKey>, account: AccountId, evidence: String) {
        let evidence = evidence.trim().to_string();
        assert!(!evidence.is_empty() && evidence.len() <= 280, "evidence is one sentence, a link or a transaction hash, up to 280 characters");
        assert!(account != owner, "an owner cannot report their own account");
        assert!(account != env::current_account_id(), "the Leash contract cannot be reported");
        let before = env::storage_usage();
        let mut list = self.reports.get(&account).cloned().unwrap_or_default();
        list.retain(|r| r.owner != owner);
        assert!(list.len() < REPORT_LIMIT, "this account already has as many reports as the list keeps");
        list.push(Report { owner: owner.clone(), key: key.clone(), evidence: evidence.clone(), at: env::block_timestamp() });
        self.reports.insert(account.clone(), list);
        self.record(&owner, key.as_ref(), "reported", Some(&account), None, Some(&evidence));
        emit("reported", json!({ "owner": owner, "key": key, "account": account, "evidence": evidence }));
        self.charge(&owner, before);
    }

    /// Payments from `owner`'s agents to `to` are refused: they reported it, or enough owners did.
    pub(crate) fn blocked(&self, owner: &AccountId, to: &AccountId) -> bool {
        self.reports.get(to).is_some_and(|list| list.len() >= REPORTS_TO_BLOCK_ALL || list.iter().any(|r| &r.owner == owner))
    }
}
