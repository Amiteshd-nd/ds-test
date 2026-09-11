//! Invariant **I7**: plan before apply.
//!
//! An agent's multi-commit operation is proposed as a [`Plan`], surfaced to a human, and
//! only becomes writable once approved. Approval is represented by [`ApprovedPlan`],
//! which has a private constructor — the same trick as `Validated`, for the same reason:
//! an unapproved agent write should be impossible to express, not merely discouraged.

use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub struct PlanId(pub String);

impl fmt::Display for PlanId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A proposed sequence of commits with a human-readable summary.
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub struct Plan {
    pub id: PlanId,
    pub agent: crate::author::AgentId,
    /// What the agent says it is about to do, in a sentence a drafter would understand.
    pub summary: String,
    pub steps: Vec<PlanStep>,
}

/// One step of a plan.
///
/// # Why `commands` is opaque here
/// The obvious type is `Vec<Op>`, and it is wrong twice over. First, invariant **I3**
/// says the agent uses the *same commands* the UI dispatches; a plan carrying raw ops
/// would hand the agent a lower-level write path than any human has, which is the exact
/// inversion of the Motif lesson in PRD §2. Second, `Command` lives in `tri-api`, and
/// `commit` may only depend on `tri-doc` (PRD Prompt 1's dependency rules) — so this
/// crate could not name the right type even if it wanted to.
///
/// The resolution: `commit` does not interpret step payloads at all. It carries them,
/// records the plan id on every commit made under the plan, and leaves translation to
/// `tri-api`, which owns the registry. `commit`'s job is authorship and audit, not
/// knowing what a wall is.
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub struct PlanStep {
    pub message: String,
    /// Commands from `tri_api::Command`, uninterpreted at this layer.
    pub commands: Vec<serde_json::Value>,
}

impl Plan {
    /// Total commands across all steps — what the approval UI counts.
    pub fn command_count(&self) -> usize {
        self.steps.iter().map(|s| s.commands.len()).sum()
    }

    /// Consume a human decision. The only constructor of [`ApprovedPlan`].
    pub fn approve(self, approver: crate::author::UserId) -> ApprovedPlan {
        ApprovedPlan {
            plan: self,
            approver,
        }
    }
}

/// A plan a human has signed off. Cannot be constructed except via [`Plan::approve`].
#[derive(Clone, PartialEq, Debug)]
pub struct ApprovedPlan {
    plan: Plan,
    approver: crate::author::UserId,
}

impl ApprovedPlan {
    pub fn id(&self) -> &PlanId {
        &self.plan.id
    }

    pub fn plan(&self) -> &Plan {
        &self.plan
    }

    pub fn approver(&self) -> &crate::author::UserId {
        &self.approver
    }

    pub fn steps(&self) -> &[PlanStep] {
        &self.plan.steps
    }

    pub fn author(&self) -> crate::author::Author {
        crate::author::Author::Agent(self.plan.agent.clone(), self.plan.id.clone())
    }
}
