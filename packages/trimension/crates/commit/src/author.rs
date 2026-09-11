//! Who wrote a commit. PRD §4.4: `Author` is what makes agent edits auditable, and
//! `PlanId` is what links them back to the plan a human approved (invariant **I7**).

use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub struct UserId(pub String);

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub struct AgentId(pub String);

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Author {
    Human(UserId),
    /// An agent write always names the plan that authorised it. There is no
    /// `Agent(AgentId)` without a plan — I7 is encoded in the type, so an unapproved
    /// agent write is unrepresentable rather than merely forbidden.
    Agent(AgentId, crate::plan::PlanId),
    /// The importer and lazy migrations. Still a commit, still validated — I1 has no
    /// exemption for imports (this variant exists to *label* them, not to excuse them).
    System(String),
}

impl Author {
    pub fn system(what: impl Into<String>) -> Self {
        Author::System(what.into())
    }

    pub fn is_agent(&self) -> bool {
        matches!(self, Author::Agent(..))
    }

    pub fn plan(&self) -> Option<&crate::plan::PlanId> {
        match self {
            Author::Agent(_, p) => Some(p),
            _ => None,
        }
    }
}

impl fmt::Display for Author {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Author::Human(u) => write!(f, "human:{}", u.0),
            Author::Agent(a, p) => write!(f, "agent:{} (plan {})", a.0, p),
            Author::System(s) => write!(f, "system:{s}"),
        }
    }
}
