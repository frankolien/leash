//! Tasks: an agent carves a budget for one job and hands it to a sub-agent's key. The child pays by
//! signed instruction only, never past the task's budget or the parent's own limits, and revoking or
//! pausing the parent stops every child with it. One level: a child cannot open tasks of its own.

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, CurveType, PublicKey};

use crate::*;

#[near]
impl Leash {
    /// Opens a task under the calling agent key and names the child key that may spend it.
    pub fn open_task(&mut self, task: TaskInput) -> u64 {
        self.open_task_for(env::predecessor_account_id(), env::signer_account_pk(), task)
    }

    pub fn open_task_signed(&mut self, intent: String, signature: Base64VecU8) -> u64 {
        let i = self.verified(&intent, &signature, "open_task");
        self.once(&i.owner, &i.key, &i.payment_id);
        self.open_task_for(i.owner, i.key, i.task.expect("intent has no task"))
    }

    /// Ends a task early. The owner may close any of theirs; an agent may close its own.
    pub fn close_task(&mut self, task_id: u64) {
        self.close_task_for(env::predecessor_account_id(), env::signer_account_pk(), task_id)
    }

    pub fn close_task_signed(&mut self, intent: String, signature: Base64VecU8) {
        let i = self.verified(&intent, &signature, "close_task");
        self.once(&i.owner, &i.key, &i.payment_id);
        self.close_task_for(i.owner, i.key, i.task_id.expect("intent has no task_id"))
    }

    pub fn get_tasks(&self, owner: AccountId) -> Vec<Task> {
        self.tasks.values().filter(|t| t.owner == owner).cloned().collect()
    }

    /// The task a child key spends from, if it is one.
    pub fn get_task_of(&self, owner: AccountId, public_key: PublicKey) -> Option<Task> {
        self.task_for(&owner, &public_key)
    }
}

impl Leash {
    pub(crate) fn task_for(&self, owner: &AccountId, key: &PublicKey) -> Option<Task> {
        let id = self.task_of.get(&(owner.clone(), key.clone()))?;
        self.tasks.get(id).cloned()
    }

    fn open_task_for(&mut self, owner: AccountId, parent: PublicKey, input: TaskInput) -> u64 {
        let policy = self.policies.get(&(owner.clone(), parent.clone())).cloned().expect("no policy for this key");
        assert!(policy.active, "key revoked");
        assert!(input.child.curve_type() == CurveType::ED25519, "a child key is ed25519");
        assert!(input.child != parent, "a task needs its own key");
        let child_id = (owner.clone(), input.child.clone());
        assert!(self.policies.get(&child_id).is_none() && self.task_of.get(&child_id).is_none(), "that key already has a role");
        assert!(!input.label.is_empty() && input.label.len() <= 40, "a label is 1 to 40 characters");
        assert!((MIN_TASK_SECS..=MAX_TASK_SECS).contains(&input.for_secs), "a task lasts a minute to 7 days");
        assert!(input.allow.len() <= 10, "a task names at most 10 recipients");
        let (daily, _) = self.caps(&owner, &parent, &policy);
        assert!(input.budget.0 > 0 && input.budget.0 <= daily, "a task's budget is above zero and within the daily cap");
        let now = env::block_timestamp();
        let open = self.tasks.values().filter(|t| t.owner == owner && t.parent == parent && t.active && t.expires_at > now).count();
        assert!(open < TASK_LIMIT, "too many open tasks for this agent");

        let before = env::storage_usage();
        let id = self.next_task;
        self.next_task += 1;
        let task = Task {
            id,
            owner: owner.clone(),
            parent: parent.clone(),
            child: input.child.clone(),
            label: input.label.clone(),
            budget: input.budget,
            spent: U128(0),
            allow: input.allow,
            created_at: now,
            expires_at: now + input.for_secs * NS_PER_SEC,
            active: true,
        };
        self.tasks.insert(id, task.clone());
        self.task_of.insert(child_id, id);
        self.record(&owner, Some(&parent), "task_opened", None, Some(input.budget), Some(&input.label));
        emit("task_opened", json!({ "owner": owner, "key": parent, "task": task }));
        self.charge(&owner, before);
        id
    }

    fn close_task_for(&mut self, owner: AccountId, caller: PublicKey, task_id: u64) {
        let mut task = self.tasks.get(&task_id).cloned().expect("no such task");
        assert_eq!(task.owner, owner, "not your task");
        let is_owner = self.policies.get(&(owner.clone(), caller.clone())).is_none() && self.task_of.get(&(owner.clone(), caller.clone())).is_none();
        assert!(is_owner || caller == task.parent, "only the owner or the agent that opened it can close a task");
        let before = env::storage_usage();
        task.active = false;
        self.tasks.insert(task_id, task.clone());
        self.record(&owner, Some(&task.parent), "task_closed", None, Some(task.spent), Some(&task.label));
        emit("task_closed", json!({ "owner": owner, "id": task_id, "spent": task.spent }));
        self.charge(&owner, before);
    }

    /// A child key's verdict: the task's own limits first, then everything the parent would face.
    pub(crate) fn task_preflight(&self, owner: &AccountId, task: &Task, to: &AccountId, amount: u128) -> Preflight {
        let parent = self.preflight(owner, &task.parent, to, amount);
        let left = task.budget.0.saturating_sub(task.spent.0);
        let remaining = U128(left.min(parent.remaining_today.0));
        let refuse = |reason: &str| Preflight { ok: false, reason: Some(reason.to_string()), can_request: false, remaining_today: remaining, vault: parent.vault };
        if !task.active {
            return refuse("task closed");
        }
        if env::block_timestamp() >= task.expires_at {
            return refuse("task expired");
        }
        if !task.allow.is_empty() && !task.allow.contains(to) {
            return refuse("recipient not in this task");
        }
        if amount > left {
            return refuse("over task budget");
        }
        if !parent.ok {
            return refuse(parent.reason.as_deref().unwrap_or("parent refused"));
        }
        Preflight { ok: true, reason: None, can_request: false, remaining_today: remaining, vault: parent.vault }
    }
}
