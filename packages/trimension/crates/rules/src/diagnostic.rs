//! What a rule says when it is unhappy.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tri_doc::component::{CanonicalValue, Component, TypeDef};
use tri_doc::{EntityId, Op};

pub const TYPE_NAME: &str = "Diagnostic";

/// How much a failure matters.
///
/// Note what is missing: there is no variant that blocks anything. The most severe thing
/// a bylaw rule can do is tell the generator to try again and tell the architect why.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    /// The generator must not emit a plan that fails this. If one is on screen anyway —
    /// because the architect drew it — it is drawn in red and the panel says so.
    Hard,
    /// Worth knowing, not worth refusing. Light, ventilation, circulation efficiency.
    /// Amber on the canvas; the architect overrides.
    Soft,
    /// Preference, not compliance. Vaastu lives here.
    Advisory,
}

impl Severity {
    pub fn blocks_generation(self) -> bool {
        self == Severity::Hard
    }

    pub fn label(self) -> &'static str {
        match self {
            Severity::Hard => "hard",
            Severity::Soft => "soft",
            Severity::Advisory => "advisory",
        }
    }
}

/// One rule's verdict on one document.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Diagnostic {
    /// Stable id, so the UI can suppress or explain a specific rule.
    pub rule_id: String,
    pub severity: Severity,
    /// Written for an architect, not a developer. Names the number and the limit.
    pub message: String,
    /// What the rule is complaining about. Empty means the whole document.
    pub entities: Vec<EntityId>,
    /// The clause behind the rule, so a reviewer can look it up.
    pub source: String,
    /// The measured value and the limit, for the compliance panel's gauges.
    pub measured: Option<i64>,
    pub limit: Option<i64>,
}

impl Diagnostic {
    pub fn is_hard(&self) -> bool {
        self.severity == Severity::Hard
    }
}

/// The verdict on a whole document.
#[derive(Clone, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
pub struct DiagnosticSet {
    pub diagnostics: Vec<Diagnostic>,
    /// Which ruleset produced this, and when it took effect.
    pub authority: String,
    pub effective: String,
}

impl DiagnosticSet {
    pub fn hard(&self) -> Vec<&Diagnostic> {
        self.diagnostics.iter().filter(|d| d.is_hard()).collect()
    }

    pub fn by_severity(&self, s: Severity) -> Vec<&Diagnostic> {
        self.diagnostics
            .iter()
            .filter(|d| d.severity == s)
            .collect()
    }

    /// Would the generator accept this layout?
    pub fn passes_hard_rules(&self) -> bool {
        self.hard().is_empty()
    }

    pub fn summary(&self) -> String {
        if self.diagnostics.is_empty() {
            return format!("no issues against {} ({})", self.authority, self.effective);
        }
        let (h, s, a) = (
            self.by_severity(Severity::Hard).len(),
            self.by_severity(Severity::Soft).len(),
            self.by_severity(Severity::Advisory).len(),
        );
        format!(
            "{h} hard, {s} soft, {a} advisory against {} ({})",
            self.authority, self.effective
        )
    }
}

pub fn type_definition() -> TypeDef {
    TypeDef {
        name: TYPE_NAME.to_string(),
        fields: [("rule_id", true), ("severity", true), ("message", true)]
            .iter()
            .map(|(f, r)| (f.to_string(), *r))
            .collect(),
    }
}

/// Freeze a diagnostic set into the document as components.
///
/// Opt-in, and rarely what you want. Diagnostics are a pure function of the document and
/// the ruleset, so storing them duplicates state that can go stale, and committing them
/// on every wall drag would bury the real edits in history. Use this when a frozen record
/// is the point — a report, or a snapshot going out for review.
pub fn attach(set: &DiagnosticSet) -> Vec<Op> {
    let mut ops = vec![Op::RegisterType {
        def: type_definition(),
    }];
    for d in &set.diagnostics {
        let mut data = BTreeMap::from([
            (
                "rule_id".to_string(),
                CanonicalValue::Text(d.rule_id.clone()),
            ),
            (
                "severity".to_string(),
                CanonicalValue::Text(d.severity.label().to_string()),
            ),
            (
                "message".to_string(),
                CanonicalValue::Text(d.message.clone()),
            ),
            ("source".to_string(), CanonicalValue::Text(d.source.clone())),
            (
                "entities".to_string(),
                CanonicalValue::List(
                    d.entities
                        .iter()
                        .map(|e| CanonicalValue::Int(e.raw() as i64))
                        .collect(),
                ),
            ),
        ]);
        if let Some(m) = d.measured {
            data.insert("measured".to_string(), CanonicalValue::Int(m));
        }
        if let Some(l) = d.limit {
            data.insert("limit".to_string(), CanonicalValue::Int(l));
        }
        ops.push(Op::CreateEntity {
            components: vec![Component::Custom {
                type_name: TYPE_NAME.to_string(),
                data,
            }],
        });
    }
    ops
}
