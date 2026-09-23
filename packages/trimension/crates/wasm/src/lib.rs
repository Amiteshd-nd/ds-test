//! `tri-wasm` — the wasm-bindgen boundary. Thin. No logic.
//!
//! # Responsibility
//! Marshalling only: JS calls in, `tri-api` does the work, results marshal out. If a
//! function here contains a decision, it belongs in `api`.
//!
//! # Invariant **I2**, and why this file looks the way it does
//! TypeScript holds zero entity data. Every function below either returns a *view* of
//! the document (a query result, a summary, a measurement) or takes a command in. There
//! is deliberately no `get_document()`, no `get_entities()`, and no way for JS to obtain
//! anything it could reconstruct the model from. The document lives in this module's
//! linear memory and nowhere else.
//!
//! # Must NOT depend on
//! Anything but `tri-api`. Nothing in the workspace may depend on this crate.

use tri_api::registry::{
    self, ApplyCommandsArgs, DescribeRegionArgs, MeasureArgs, QueryEntitiesArgs,
};
use tri_api::tri_commit::{AgentId, Author, Commit, Plan, PlanId, Sequencer, UserId};
use tri_api::tri_doc::Document;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// A live document session in Wasm linear memory.
///
/// JS holds this handle and nothing else. Rayon's lesson, quoted in PRD §2: the data is
/// too large to exist in two places, so you must choose one. We chose this one.
#[wasm_bindgen]
pub struct Session {
    pub(crate) seq: Sequencer,
    /// The generated options, each a branch forked from the commit before generation.
    /// `seq` above is whichever one is in front.
    pub(crate) options: tri_api::tri_commit::Branches,
    /// The plan a human has approved, if any. Writes are refused without it (I7).
    approved: Option<tri_api::tri_commit::ApprovedPlan>,
    /// The two things the correction log cannot read out of the commit history: which
    /// option is in front, and whether anything was exported. Everything else is derived.
    session: tri_api::tri_corrections::Session,
    user: String,
}

#[wasm_bindgen]
impl Session {
    #[wasm_bindgen(constructor)]
    pub fn new(user: String) -> Session {
        Session {
            seq: Sequencer::default(),
            options: tri_api::tri_commit::Branches::new(),
            approved: None,
            session: tri_api::tri_corrections::Session::default(),
            user,
        }
    }

    /// Adopt a snapshot from the session server.
    #[wasm_bindgen(js_name = loadSnapshot)]
    pub fn load_snapshot(&mut self, json: &str) -> Result<(), JsValue> {
        let doc: Document = serde_json::from_str(json).map_err(err)?;
        self.seq = Sequencer::new(doc);
        // The remembered generation root is not part of this document's history any more.
        self.options.forget_root();
        Ok(())
    }

    /// Apply a commit broadcast by the server. Validated here too — the same code the
    /// server ran, compiled for this target.
    #[wasm_bindgen(js_name = applyRemoteCommit)]
    pub fn apply_remote_commit(&mut self, json: &str) -> Result<(), JsValue> {
        let commit: Commit = serde_json::from_str(json).map_err(err)?;
        self.seq.submit(commit).map(|_| ()).map_err(err)
    }

    #[wasm_bindgen(js_name = documentHash)]
    pub fn document_hash(&self) -> String {
        self.seq.document().hash().to_hex()
    }

    #[wasm_bindgen(js_name = entityCount)]
    pub fn entity_count(&self) -> usize {
        self.seq.document().entity_count()
    }

    #[wasm_bindgen(js_name = commitCount)]
    pub fn commit_count(&self) -> usize {
        // How deep the *document* is, not how long the log is. After an undo those differ,
        // and reporting the log would have the header claim four commits while the drawing
        // showed three. `historyState` exposes both for the undo controls.
        self.seq.applied()
    }

    /// Layers, for the layer panel. Names and visibility only — no geometry.
    #[wasm_bindgen(js_name = layerList)]
    pub fn layer_list(&self) -> Result<JsValue, JsValue> {
        let v: Vec<_> = self
            .seq
            .document()
            .layers()
            .iter()
            .map(|(id, l)| {
                serde_json::json!({
                    "id": id.raw(),
                    "name": l.name,
                    "visible": l.visible,
                    "color": l.color,
                })
            })
            .collect();
        to_js(&v)
    }

    // ---- the read tools, exactly as the agent sees them (I3) ------------------

    #[wasm_bindgen(js_name = queryEntities)]
    pub fn query_entities(&self, args_json: &str) -> Result<JsValue, JsValue> {
        let args: QueryEntitiesArgs = serde_json::from_str(args_json).map_err(err)?;
        to_js(&registry::query_entities(self.seq.document(), args))
    }

    #[wasm_bindgen(js_name = describeRegion)]
    pub fn describe_region(&self, args_json: &str) -> Result<JsValue, JsValue> {
        let args: DescribeRegionArgs = serde_json::from_str(args_json).map_err(err)?;
        to_js(&registry::describe_region(self.seq.document(), args))
    }

    #[wasm_bindgen(js_name = measure)]
    pub fn measure(&self, args_json: &str) -> Result<JsValue, JsValue> {
        let args: MeasureArgs = serde_json::from_str(args_json).map_err(err)?;
        to_js(&registry::measure(self.seq.document(), args))
    }

    // ---- writes (I1, I3, I7) --------------------------------------------------

    /// A human's edit. Same command registry the agent uses; the only difference is the
    /// `Author` recorded on the commit.
    #[wasm_bindgen(js_name = applyUserCommands)]
    pub fn apply_user_commands(
        &mut self,
        commands_json: &str,
        message: &str,
    ) -> Result<JsValue, JsValue> {
        let commands: Vec<tri_api::Command> = serde_json::from_str(commands_json).map_err(err)?;
        let author = Author::Human(UserId(self.user.clone()));

        let mut ops = Vec::new();
        for c in &commands {
            ops.extend(
                c.to_ops(self.seq.document(), &author.to_string())
                    .map_err(err)?,
            );
        }
        let commit = Commit::new(self.seq.head(), author, ops, message.to_string());
        let sequenced = self.seq.submit(commit).map_err(err)?;
        to_js(&serde_json::json!({
            "commit": sequenced.id().to_hex(),
            "hash": self.seq.document().hash().to_hex(),
            "wire": serde_json::to_string(&sequenced).map_err(err)?,
        }))
    }

    /// Record a human's approval of an agent plan. Until this is called, every agent
    /// write is refused — invariant I7, and the reason `ApprovedPlan` has a private
    /// constructor.
    #[wasm_bindgen(js_name = approvePlan)]
    pub fn approve_plan(&mut self, plan_json: &str) -> Result<(), JsValue> {
        let plan: Plan = serde_json::from_str(plan_json).map_err(err)?;
        self.approved = Some(plan.approve(UserId(self.user.clone())));
        Ok(())
    }

    /// Withdraw approval. Called when the human rejects a plan, and after a plan
    /// completes — approval is per-plan, never standing.
    #[wasm_bindgen(js_name = revokeApproval)]
    pub fn revoke_approval(&mut self) {
        self.approved = None;
    }

    #[wasm_bindgen(js_name = approvedPlanId)]
    pub fn approved_plan_id(&self) -> Option<String> {
        self.approved.as_ref().map(|p| p.id().0.clone())
    }

    /// An agent's write. Refused unless a human has approved the cited plan.
    #[wasm_bindgen(js_name = applyAgentCommands)]
    pub fn apply_agent_commands(&mut self, args_json: &str) -> Result<JsValue, JsValue> {
        let args: ApplyCommandsArgs = serde_json::from_str(args_json).map_err(err)?;
        let result =
            registry::apply_commands(&mut self.seq, self.approved.as_ref(), args).map_err(err)?;
        to_js(&result)
    }

    /// Run the 2D→3D pipeline and commit the result.
    ///
    /// Emitted as a commit like everything else — invariant I1 has no exemption for a
    /// derived-geometry pass, and this is the place it would be most tempting to take.
    #[wasm_bindgen(js_name = buildSolids)]
    pub fn build_solids(&mut self) -> Result<JsValue, JsValue> {
        use tri_api::tri_solid::pipeline::{build_solids, BuildParams};

        // Which preparation depends on where the geometry came from, and getting it
        // wrong is silent. This binding used to always take the messy path, so a
        // generated plan was re-healed and re-paired on every rebuild: each wall had
        // nothing to pair with, fell back to the rule set's 100mm default, and the
        // 230mm the architect asked for was quietly replaced. The compliance panel
        // showed the wrong setbacks and nothing else complained.
        //
        // A document carrying a brief was generated by us and is clean by construction;
        // one without was imported from someone else's drawing and is not.
        let generated = tri_api::tri_params::component::find(self.seq.document()).is_some();
        let params = if generated {
            BuildParams::clean()
        } else {
            BuildParams::default()
        };

        let (ops, report) = build_solids(self.seq.document(), params);
        if ops.is_empty() {
            return to_js(&serde_json::json!({ "walls": 0, "summary": "nothing to extrude" }));
        }
        let commit = Commit::new(
            self.seq.head(),
            tri_api::tri_commit::Author::system("2d-to-3d"),
            ops,
            "extrude walls",
        );
        self.seq.submit(commit).map_err(err)?;

        to_js(&serde_json::json!({
            "clean": generated,
            "walls": report.walls_built,
            "openings": report.openings_cut,
            "paired": report.paired,
            "unpaired": report.unpaired,
            "assumptions": report.assumptions.len(),
            "summary": report.summary(),
        }))
    }

    /// Generate a floor plan from a brief.
    ///
    /// The whole product flow in one call: the six intake answers become a parameter set,
    /// the ruleset derives tier 2, the template lays out, and the result lands as commits
    /// like every other edit. Returns the plan's own summary so the UI can show what was
    /// done and what it had to assume.
    /// Generate the options for a brief, each on its own branch.
    ///
    /// Every option is applied through the ordinary commit path onto a fork of the
    /// sequencer as it stands, so the four of them are genuine siblings of one parent
    /// commit rather than four documents that happen to look related. The best-ranked one
    /// is brought to the front so the canvas is not empty while the architect decides.
    #[wasm_bindgen(js_name = generate)]
    pub fn generate(&mut self, brief_json: &str) -> Result<JsValue, JsValue> {
        use tri_api::tri_commit::Branch;
        use tri_api::tri_rules::{derive_parameters, RuleSet};

        let brief: tri_api::tri_params::Brief = serde_json::from_str(brief_json).map_err(err)?;
        let params = brief.into_parameters().map_err(err)?;
        let rules = RuleSet::bbmp_plotted_residential();
        let derived = derive_parameters(&params, &rules).map_err(err)?;
        let candidates = tri_gen::candidates(&derived, &rules).map_err(err)?;

        // Everything that was in the document before any plan was generated. Remembered
        // by `Branches`, so a second brief starts where the first one did.
        let root = self.options.root(&self.seq);
        let base = root.head();
        let author = Author::Human(UserId(self.user.clone()));
        let mut built: Vec<Branch> = Vec::new();
        let mut summaries = Vec::new();
        for c in &candidates {
            let plan = tri_gen::plan_for(c, &derived).map_err(err)?;
            // A fork of the pre-generation document, not of whatever plan is in front:
            // an option branches from the document's own history, so an imported drawing
            // survives, and an earlier generated plan does not come along with it.
            let mut fork = root.clone();
            tri_gen::apply(&mut fork, &plan, author.clone()).map_err(err)?;
            summaries.push(serde_json::json!({
                "key": plan.option_key,
                "label": plan.option_label,
                "template": plan.template_id,
                "note": c.ranking_note(),
                "awkward": c.awkward,
                // Vaastu, when the brief asked for it. `null` is "off", which is not the
                // same as a score of zero.
                "vaastu": c.vaastu.as_ref().map(|v| serde_json::json!({
                    "score": v.score,
                    "conflicts": v.conflicts,
                    "authority": v.authority,
                    "placements": v.placements,
                })),
                "cost": c.cost_note(),
                "summary": plan.approval_summary(),
                "rooms": plan.rooms.iter().map(|(n, k, a)| serde_json::json!({
                    "name": n, "kind": k, "area_mm2": a
                })).collect::<Vec<_>>(),
                "assumptions": plan.assumptions.iter().map(|(f, w)| serde_json::json!({
                    "field": f, "reason": w
                })).collect::<Vec<_>>(),
                "hash": fork.document().hash().to_hex(),
            }));
            built.push(Branch::new(
                plan.option_key.clone(),
                plan.option_label.clone(),
                c.ranking_note(),
                fork,
                base,
            ));
        }

        let first = built
            .first()
            .map(|b| b.key.clone())
            .ok_or_else(|| err("generation produced no options"))?;
        self.session.options_offered = summaries
            .iter()
            .filter_map(|s| s["key"].as_str().map(str::to_string))
            .collect();
        self.options.replace(built);
        // No write-back: `replace` cleared the selection, so there is no slot the working
        // sequencer belongs to.
        let chosen = self
            .options
            .switch(&first, self.seq.clone())
            .ok_or_else(|| err("the chosen option vanished"))?;
        self.seq = chosen;
        self.session.chosen_option = Some(first.clone());

        to_js(&serde_json::json!({
            "chosen": first,
            "options": summaries,
        }))
    }

    /// The layered DXF. The PRD's primary deliverable.
    ///
    /// **This is the first caller `tri-export-dxf` has had.** P3 built the exporter, tested
    /// it against a round trip, and wired it to nothing — so the output the PRD says the
    /// product will be judged on ("an architect opens it in AutoCAD and decides in five
    /// seconds whether you are serious") could not be obtained from the product. A crate
    /// with no caller is a crate nobody can use.
    #[wasm_bindgen(js_name = exportDxf)]
    pub fn export_dxf(&mut self) -> Result<JsValue, JsValue> {
        let (bytes, stats) = tri_api::tri_export_dxf::export(self.seq.document())
            .map_err(|e| err(format!("{e:?}")))?;
        self.record_export("dxf");
        to_js(&serde_json::json!({
            "bytes": bytes,
            "summary": stats.summary(),
            "name": "plan.dxf",
        }))
    }

    /// A printable plan sheet.
    ///
    /// Drawn at a standard scale and carrying the compliance authority line, because the
    /// sheet is the one artefact that leaves the building and turns up in a meeting with
    /// no panel beside it.
    #[wasm_bindgen(js_name = exportPdf)]
    pub fn export_pdf(&mut self) -> Result<JsValue, JsValue> {
        use tri_api::tri_export_pdf::sheet::TitleBlock;
        let doc = self.seq.document();
        let rules = tri_api::tri_rules::RuleSet::bbmp_plotted_residential();
        let report = tri_api::tri_rules::report(doc, &rules);
        let params = tri_api::tri_params::component::find(doc);

        let plot = params
            .as_ref()
            .map(|(_, p)| {
                format!(
                    "{:.1} x {:.1} m plot, {} facing",
                    p.plot_width.get().as_mm_f64() / 1000.0,
                    p.plot_depth.get().as_mm_f64() / 1000.0,
                    p.road_facing.get().as_str()
                )
            })
            .unwrap_or_else(|| "imported drawing".to_string());
        let facts = report
            .metrics
            .iter()
            .filter(|m| matches!(m.id.as_str(), "far" | "ground_coverage" | "built_up"))
            .map(|m| {
                (
                    m.label.clone(),
                    match m.limit {
                        Some(l) => format!("{:.2} / {:.2} {}", m.value, l, m.unit),
                        None => format!("{:.2} {}", m.value, m.unit),
                    },
                )
            })
            .collect();

        let title = TitleBlock {
            project: "Residence".into(),
            plot,
            drawing: "Ground floor plan".into(),
            date: String::new(),
            revision: format!("{} commits", self.seq.applied()),
            authority: report.authority.clone(),
            disclaimer: report.disclaimer.clone(),
            facts,
        };
        let (bytes, stats) =
            tri_api::tri_export_pdf::export(doc, title).map_err(|e| err(e.to_string()))?;
        self.record_export("pdf");
        to_js(&serde_json::json!({
            "bytes": bytes,
            "summary": stats.summary(),
            "name": "plan.pdf",
        }))
    }

    /// The extrusion as a mesh, for massing.
    ///
    /// Not a BIM model and the file says so in its header. The PRD scopes it exactly:
    /// "the 3D extrusion exports as a simple solid, useful for massing only".
    #[wasm_bindgen(js_name = exportObj)]
    pub fn export_obj(&mut self) -> Result<JsValue, JsValue> {
        let (bytes, stats) =
            tri_api::tri_export_obj::export(self.seq.document()).map_err(|e| err(e.to_string()))?;
        self.record_export("obj");
        to_js(&serde_json::json!({
            "bytes": bytes,
            "summary": stats.summary(),
            "name": "massing.obj",
        }))
    }

    /// The correction log: what the solver drew, and where the architect moved it.
    ///
    /// Derived from the commit history every time it is asked for, rather than accumulated
    /// as events. A second account of what happened, kept beside the first, would disagree
    /// with it the moment somebody missed a call site.
    ///
    /// Nothing sends this anywhere. It is the architect's project data, and shipping it by
    /// default would be their decision to make.
    #[wasm_bindgen(js_name = corrections)]
    pub fn corrections(&self) -> Result<JsValue, JsValue> {
        let l = tri_api::tri_corrections::log(&self.seq, &self.session);
        to_js(&serde_json::json!({
            "summary": l.summary(),
            "exported": l.exported,
            "wallEditsBeforeExport": l.wall_edits_before_export,
            "corrections": l.corrections,
            "chosenOption": l.chosen_option,
            "optionsOffered": l.options_offered,
            "exports": l.exports,
        }))
    }

    /// The log as a downloadable file.
    #[wasm_bindgen(js_name = exportCorrections)]
    pub fn export_corrections(&self) -> Result<JsValue, JsValue> {
        let l = tri_api::tri_corrections::log(&self.seq, &self.session);
        to_js(&serde_json::json!({
            "bytes": l.to_json(),
            "summary": l.summary(),
            "name": "corrections.json",
        }))
    }

    /// Note an export against the commit the document is at.
    ///
    /// The step matters: a session that exports at commit 3 and one that exports at
    /// commit 30 are different stories, and the PRD's "median under 8 wall edits" needs
    /// to know which edits came first.
    fn record_export(&mut self, format: &str) {
        self.session.exports.push(tri_api::tri_corrections::Export {
            format: format.to_string(),
            at_step: self.seq.applied(),
        });
    }

    /// Is this entity a wall? The canvas asks before starting a drag.
    ///
    /// Cheaper and clearer than trying the move and reading the failure: a drag on a room
    /// label is not an error the user should ever see, it is simply not a drag.
    #[wasm_bindgen(js_name = isWall)]
    pub fn is_wall(&self, entity: u64) -> bool {
        self.seq
            .document()
            .component(
                tri_api::tri_doc::EntityId::from_raw(entity),
                &tri_api::tri_doc::ComponentKey::WallProfile,
            )
            .is_some()
    }

    /// Move a wall, as a mouse drag does.
    ///
    /// Goes through the same `Command::MoveWall` an agent calls — invariant I3 in the
    /// place it is easiest to break, because a canvas is the obvious spot to reach past
    /// the registry and mutate the document directly. There is no drag-specific path here
    /// and there must not be one: the undo stack would then know about mouse edits and not
    /// about agent edits, and the two would diverge on the first bug.
    #[wasm_bindgen(js_name = moveWall)]
    pub fn move_wall(&mut self, entity: u64, dx_mm: f64, dy_mm: f64) -> Result<JsValue, JsValue> {
        let author = Author::Human(UserId(self.user.clone()));
        let cmd = tri_api::command::Command::MoveWall {
            entity,
            dx_mm,
            dy_mm,
        };
        let ops = cmd
            .to_ops(self.seq.document(), &author.to_string())
            .map_err(|e| err(format!("{e:?}")))?;
        let commit = Commit::new(
            self.seq.head(),
            author,
            ops,
            format!("move wall {entity} by {dx_mm:.0}x{dy_mm:.0}mm"),
        );
        let sequenced = self.seq.submit(commit).map_err(err)?;
        // The option this edit belongs to keeps it, so switching away and back does not
        // lose the drag (F5's write-back only happens on a switch).
        self.options.save(self.seq.clone());
        to_js(&serde_json::json!({
            "commit": sequenced.id().to_hex(),
            "hash": self.seq.document().hash().to_hex(),
        }))
    }

    /// Step back one commit. Rebuild-and-replay; see `Sequencer::undo`.
    #[wasm_bindgen(js_name = undo)]
    pub fn undo(&mut self) -> bool {
        let moved = self.seq.undo();
        if moved {
            self.options.save(self.seq.clone());
        }
        moved
    }

    #[wasm_bindgen(js_name = redo)]
    pub fn redo(&mut self) -> bool {
        let moved = self.seq.redo();
        if moved {
            self.options.save(self.seq.clone());
        }
        moved
    }

    /// What the undo controls should show.
    #[wasm_bindgen(js_name = historyState)]
    pub fn history_state(&self) -> Result<JsValue, JsValue> {
        to_js(&serde_json::json!({
            "applied": self.seq.applied(),
            "total": self.seq.history().len(),
            "canUndo": self.seq.can_undo(),
            "canRedo": self.seq.can_redo(),
            "last": self.seq.history().iter().nth(self.seq.applied().wrapping_sub(1))
                .map(|c| c.message().to_string()),
        }))
    }

    /// Read a one-line brief with no model and no network.
    ///
    /// The offline path, and the answer to the PRD's open question about users with no
    /// key. It reads the common brief shapes and reports everything else as *not stated*
    /// rather than guessing — the returned `guessed` list is what the confirmation card
    /// marks for review, because `ParameterSet::from_brief` will stamp these `Measured`
    /// and only an architect looking at them makes that true.
    #[wasm_bindgen(js_name = readBrief)]
    pub fn read_brief(&self, text: &str) -> Result<JsValue, JsValue> {
        let got = tri_api::tri_intake::local::parse(text).map_err(err)?;
        to_js(&serde_json::json!({
            "brief": got.brief,
            "stated": got.stated.iter().map(|f| f.as_str()).collect::<Vec<_>>(),
            "guessed": got.guessed().iter().map(|f| f.as_str()).collect::<Vec<_>>(),
            "chips": got.open_chips().iter().map(|(field, question)| serde_json::json!({
                "field": field, "question": question
            })).collect::<Vec<_>>(),
            "source": "local",
        }))
    }

    /// Every option from the last generation, in rank order.
    #[wasm_bindgen(js_name = options)]
    pub fn options(&self) -> Result<JsValue, JsValue> {
        let current = self.options.current_key().map(|s| s.to_string());
        to_js(&serde_json::json!({
            "current": current,
            "options": self.options.iter().map(|b| serde_json::json!({
                "key": b.key,
                "label": b.label,
                "note": b.note,
                "commits": b.depth(),
                "hash": b.document().hash().to_hex(),
            })).collect::<Vec<_>>(),
        }))
    }

    /// Bring an option to the front.
    ///
    /// Lossless in both directions: the branch being left keeps whatever was done to it,
    /// because the working sequencer is written back before the new one is taken.
    #[wasm_bindgen(js_name = chooseOption)]
    pub fn choose_option(&mut self, key: &str) -> Result<JsValue, JsValue> {
        let next = self
            .options
            .switch(key, self.seq.clone())
            .ok_or_else(|| err(format!("no option called {key}")))?;
        self.seq = next;
        // Every switch, not only the last: which options an architect looked at and
        // rejected is as informative as the one they kept.
        self.session.chosen_option = Some(key.to_string());
        to_js(&serde_json::json!({
            "chosen": key,
            "hash": self.seq.document().hash().to_hex(),
            "entities": self.seq.document().entity_count(),
        }))
    }

    /// The compliance report: metrics, diagnostics, authority and disclaimer.
    ///
    /// A view over data that already exists. The panel renders this; it computes nothing
    /// itself, because a panel that derives its own numbers is a second implementation of
    /// the rules and the two will disagree at the worst moment.
    #[wasm_bindgen(js_name = compliance)]
    pub fn compliance(&self) -> Result<JsValue, JsValue> {
        let rules = tri_api::tri_rules::RuleSet::bbmp_plotted_residential();
        to_js(&tri_api::tri_rules::report(self.seq.document(), &rules))
    }

    /// Vertical extent of the model in millimetres, for framing an elevation.
    #[wasm_bindgen(js_name = heightRangeMm)]
    pub fn height_range_mm(&self) -> Vec<f64> {
        let (lo, hi) = tri_api::tri_render::scene::document_height(self.seq.document());
        vec![lo as f64 / 1000.0, hi as f64 / 1000.0]
    }

    /// Everything an agent did under a plan, for the audit panel.
    #[wasm_bindgen(js_name = commitsForPlan)]
    pub fn commits_for_plan(&self, plan_id: &str) -> Result<JsValue, JsValue> {
        let v: Vec<_> = self
            .seq
            .history()
            .by_plan(&PlanId(plan_id.to_string()))
            .iter()
            .map(|c| {
                serde_json::json!({
                    "id": c.id().to_hex(),
                    "message": c.message(),
                    "author": c.author().to_string(),
                    "ops": c.ops().len(),
                })
            })
            .collect();
        to_js(&v)
    }

    /// History, for the audit trail. Metadata only — the ops themselves are not exposed
    /// to JS (I2).
    #[wasm_bindgen(js_name = history)]
    pub fn history(&self) -> Result<JsValue, JsValue> {
        let v: Vec<_> = self
            .seq
            .history()
            .iter()
            .map(|c| {
                serde_json::json!({
                    "id": c.id().short(),
                    "message": c.message(),
                    "author": c.author().to_string(),
                    "isAgent": c.author().is_agent(),
                    "plan": c.author().plan().map(|p| p.0.clone()),
                    "ops": c.ops().len(),
                })
            })
            .collect();
        to_js(&v)
    }
}

/// The command registry's JSON Schema, so the UI builds its palette from the same source
/// the agent's tools come from (I3).
#[wasm_bindgen(js_name = commandSchema)]
pub fn command_schema() -> Result<JsValue, JsValue> {
    to_js(&tri_api::schema::command_schema())
}

/// The tool definitions, for the agent host.
#[wasm_bindgen(js_name = toolDefinitions)]
pub fn tool_definitions() -> Result<JsValue, JsValue> {
    to_js(&tri_api::schema::all_tool_definitions())
}

#[wasm_bindgen(js_name = buildTarget)]
pub fn build_target() -> String {
    tri_api::probe()
}

/// Marshal a Rust value to JS.
///
/// `serialize_maps_as_objects` is essential, not cosmetic: by default
/// `serde_wasm_bindgen` turns every Rust map — including any `serde_json::Value::Object`
/// — into a JS `Map`, so `result.color` reads as `undefined` on the other side while
/// looking perfectly correct in Rust. Every structured return here must be a plain
/// object for JS to index it.
fn to_js<T: serde::Serialize>(v: &T) -> Result<JsValue, JsValue> {
    let s = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    v.serialize(&s)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

pub(crate) fn err<E: std::fmt::Display>(e: E) -> JsValue {
    JsValue::from_str(&e.to_string())
}

/// Unused, but keeps the agent id type reachable from JS-facing code without a warning.
#[wasm_bindgen(js_name = agentAuthor)]
pub fn agent_author(agent: &str, plan: &str) -> String {
    Author::Agent(AgentId(agent.into()), PlanId(plan.into())).to_string()
}

// ---------------------------------------------------------------------------
// Viewports: the real renderer, on a real canvas
// ---------------------------------------------------------------------------
//
// Browser-only. `wgpu::SurfaceTarget::Canvas` and `web_sys::HtmlCanvasElement` do not
// exist on a host target, so building the workspace natively — which CI and
// `cargo test --workspace` both do — would fail on this module. Everything above compiles
// for both targets and is covered by the native test suite.
#[cfg(target_arch = "wasm32")]
mod viewport {
    use super::{err, Session};
    use tri_api::tri_render::camera::{Camera, ViewMode};
    use wasm_bindgen::prelude::*;

    /// One canvas driven by the wgpu renderer.
    ///
    /// This is the path invariant **I6** describes from the other side: the same
    /// `tri_render` code that produces a headless PNG for an agent draws these pixels, with
    /// a canvas swapchain instead of an offscreen texture. There is no second renderer and no
    /// JS 3D library anywhere near it.
    ///
    /// It also closes a hole. The shell previously drew through a 2D canvas fed by
    /// `render_outlines`, which meant coordinates crossing into JS — tolerable, but a
    /// weakening of **I2**. With the geometry going straight from Wasm to the GPU, no entity
    /// data reaches JavaScript at all.
    #[wasm_bindgen]
    pub struct Viewport {
        renderer: tri_api::tri_render::Renderer,
        surface: wgpu::Surface<'static>,
        width: u32,
        height: u32,
        mode: ViewMode,
        /// Yaw for the perspective view, in milli-degrees. Ignored by the orthographic modes.
        yaw_mdeg: i32,
    }

    #[wasm_bindgen]
    impl Viewport {
        /// Attach to a canvas. Async because adapter and device requests are.
        #[wasm_bindgen(js_name = attach)]
        pub async fn attach(
            canvas: web_sys::HtmlCanvasElement,
            mode: &str,
        ) -> Result<Viewport, JsValue> {
            let width = canvas.width().max(1);
            let height = canvas.height().max(1);

            let instance =
                wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
            let surface = instance
                .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
                .map_err(err)?;

            let renderer = tri_api::tri_render::Renderer::for_surface(&surface)
                .await
                .map_err(err)?;

            let mut vp = Viewport {
                renderer,
                surface,
                width,
                height,
                mode: parse_mode(mode)?,
                yaw_mdeg: 35_000,
            };
            vp.configure();
            Ok(vp)
        }

        /// Configure the swapchain. The renderer decides the format — a WebGPU canvas will
        /// not take the sRGB format the pipeline uses, so it configures linear and hands back
        /// an sRGB view format. See `Renderer::surface_config`.
        fn configure(&mut self) {
            let config = self
                .renderer
                .surface_config(&self.surface, self.width, self.height);
            self.surface.configure(self.renderer.device(), &config);
        }

        #[wasm_bindgen(js_name = resize)]
        pub fn resize(&mut self, width: u32, height: u32) {
            let (w, h) = (width.max(1), height.max(1));
            if (w, h) == (self.width, self.height) {
                return;
            }
            self.width = w;
            self.height = h;
            self.configure();
        }

        #[wasm_bindgen(js_name = setMode)]
        pub fn set_mode(&mut self, mode: &str) -> Result<(), JsValue> {
            self.mode = parse_mode(mode)?;
            Ok(())
        }

        /// Orbit the perspective view. A no-op for the orthographic modes, because a "rotated
        /// elevation" is not a thing a drafter wants.
        #[wasm_bindgen(js_name = orbit)]
        pub fn orbit(&mut self, delta_mdeg: i32) {
            if self.mode == ViewMode::TwoPointPerspective {
                self.yaw_mdeg = (self.yaw_mdeg + delta_mdeg).rem_euclid(360_000);
            }
        }

        #[wasm_bindgen(js_name = yawDegrees)]
        pub fn yaw_degrees(&self) -> f32 {
            self.yaw_mdeg as f32 / 1000.0
        }

        /// Which entity is under a click, if any.
        ///
        /// Implemented for the plan view only. Unprojecting a screen point in plan is exact;
        /// in an elevation or a perspective it is a ray that can hit several walls, and
        /// picking one of them without saying which would be a guess presented as a fact.
        /// Returning `None` is the honest answer until there is a real ray cast to do it
        /// with. Coordinates are in canvas backing-store pixels.
        #[wasm_bindgen(js_name = pick)]
        pub fn pick(&self, session: &Session, x_px: f64, y_px: f64) -> Option<u64> {
            if self.mode != ViewMode::PlanView2d {
                return None;
            }
            let doc = session.seq.document();
            let (z_min, z_max) = tri_api::tri_render::scene::document_height(doc);
            let bounds = tri_api::tri_render::scene::document_bounds(doc)?;
            let camera = Camera::fit_for(bounds, z_min, z_max, self.width, self.height, self.mode);

            // Screen → world, using the same µm/px the projection used.
            //
            // Scale in floating point and cast once, at the end. Casting the normalised
            // coordinate first truncates it to -1, 0 or 1, so every click in the viewport
            // resolves to one of three columns — which presents as picking being broken
            // rather than as arithmetic being wrong.
            let (hx, hy) = camera.half_extent_um();
            let ndc_x = (x_px / self.width as f64) * 2.0 - 1.0;
            let ndc_y = (y_px / self.height as f64) * 2.0 - 1.0;
            let wx = camera.centre.x.as_um() + (ndc_x * hx as f64) as i64;
            let wy = camera.centre.y.as_um() - (ndc_y * hy as f64) as i64;

            // Pick tolerance, in world units. Eight pixels is about a fingertip on a
            // trackpad and comfortably wider than a drawn line.
            let slop = camera.um_per_px * 8;
            let mm = |v: i64| v as f64 / 1000.0;
            let hits = tri_api::query::query_entities(
                doc,
                Some(tri_api::query::BoxMm {
                    min_x: mm(wx - slop),
                    min_y: mm(wy - slop),
                    max_x: mm(wx + slop),
                    max_y: mm(wy + slop),
                }),
                None,
                None,
                Some(1),
            );
            hits.entities.first().map(|e| e.id)
        }

        /// How many millimetres one canvas pixel covers, at the current fit.
        ///
        /// A drag is a screen delta and a command takes millimetres, so something has to
        /// convert. It is computed here from the same camera `pick` and `render` use,
        /// rather than in TypeScript from the document bounds — that would be the second
        /// implementation of the projection, and the two would disagree the first time the
        /// fit logic changed.
        #[wasm_bindgen(js_name = mmPerPixel)]
        pub fn mm_per_pixel(&self, session: &Session) -> f64 {
            let doc = session.seq.document();
            let (z_min, z_max) = tri_api::tri_render::scene::document_height(doc);
            match tri_api::tri_render::scene::document_bounds(doc) {
                Some(b) => {
                    let camera =
                        Camera::fit_for(b, z_min, z_max, self.width, self.height, self.mode);
                    camera.um_per_px as f64 / 1000.0
                }
                None => 0.0,
            }
        }

        /// Draw the session's document into this canvas.
        #[wasm_bindgen(js_name = render)]
        pub fn render(&mut self, session: &Session) -> Result<usize, JsValue> {
            let doc = session.seq.document();
            let (z_min, z_max) = tri_api::tri_render::scene::document_height(doc);

            let mut camera = match tri_api::tri_render::scene::document_bounds(doc) {
                Some(b) => Camera::fit_for(b, z_min, z_max, self.width, self.height, self.mode),
                None => Camera {
                    width_px: self.width,
                    height_px: self.height,
                    ..Camera::default()
                },
            };
            camera.yaw_mdeg = self.yaw_mdeg;

            // Flagged geometry is coloured in the drawing, not listed beside it.
            let rules = tri_api::tri_rules::RuleSet::bbmp_plotted_residential();
            let report = tri_api::tri_rules::report(doc, &rules);
            let highlights = tri_api::tri_render::scene::Highlights {
                failing: report
                    .failing_entities()
                    .into_iter()
                    .map(tri_api::tri_doc::EntityId::from_raw)
                    .collect(),
                warning: report
                    .warning_entities()
                    .into_iter()
                    .map(tri_api::tri_doc::EntityId::from_raw)
                    .collect(),
            };
            let scene = tri_api::tri_render::scene::build_with(doc, camera, self.mode, &highlights);

            // A canvas swapchain goes stale for ordinary reasons — the element had no layout
            // on the first frame, the window moved to a different-DPI display, the tab was
            // restored. Reconfiguring and drawing once more is the fix; reporting it as a
            // GPU failure, as this did at first, makes every viewport look broken on load.
            match self
                .renderer
                .render_to_surface(&scene, &self.surface, self.width, self.height)
            {
                Err(tri_api::tri_render::RenderError::SurfaceOutdated) => {
                    self.configure();
                    self.renderer
                        .render_to_surface(&scene, &self.surface, self.width, self.height)
                        .map_err(err)?;
                }
                other => other.map_err(err)?,
            }
            Ok(scene.drawn.len())
        }

        /// Draw one *option* rather than the working document.
        ///
        /// The option strip is four of these, each a small canvas in plan view. Every one
        /// builds the same [`Scene`](tri_api::tri_render::scene::Scene) the main viewport
        /// does and runs the same shader, so a thumbnail cannot disagree with the drawing
        /// it is a picture of.
        ///
        /// **Why a surface and not `render_to_image`.** The headless path reads the
        /// framebuffer back with `device.poll(wait)` and a blocking channel receive. That
        /// is correct on a server and would hang a browser tab: wasm has one thread, and
        /// WebGPU resolves the buffer mapping on the event loop that the blocking receive
        /// is stopping from running. Reading pixels back in a browser needs an async
        /// readback, which is worth writing when something actually needs the bytes —
        /// a PDF sheet, or thumbnails rendered server-side for a shared link. Drawing to
        /// a canvas needs no readback at all, so the strip does that instead. The
        /// headless path is exercised by `tri-gen`'s own test, on the platform where it
        /// works.
        #[wasm_bindgen(js_name = renderOption)]
        pub fn render_option(&mut self, session: &Session, key: &str) -> Result<usize, JsValue> {
            let branch = session
                .options
                .get(key)
                .ok_or_else(|| err(format!("no option called {key}")))?;
            let doc = branch.document();
            let (z_min, z_max) = tri_api::tri_render::scene::document_height(doc);
            let camera = match tri_api::tri_render::scene::document_bounds(doc) {
                Some(b) => Camera::fit_for(b, z_min, z_max, self.width, self.height, self.mode),
                None => Camera {
                    width_px: self.width,
                    height_px: self.height,
                    ..Camera::default()
                },
            };
            // Flagged geometry is coloured in the thumbnail too. An option that breaks a
            // setback should look wrong at 160 pixels, not only once it is selected.
            let rules = tri_api::tri_rules::RuleSet::bbmp_plotted_residential();
            let report = tri_api::tri_rules::report(doc, &rules);
            let highlights = tri_api::tri_render::scene::Highlights {
                failing: report
                    .failing_entities()
                    .into_iter()
                    .map(tri_api::tri_doc::EntityId::from_raw)
                    .collect(),
                warning: report
                    .warning_entities()
                    .into_iter()
                    .map(tri_api::tri_doc::EntityId::from_raw)
                    .collect(),
            };
            let scene = tri_api::tri_render::scene::build_with(doc, camera, self.mode, &highlights);
            match self
                .renderer
                .render_to_surface(&scene, &self.surface, self.width, self.height)
            {
                Err(tri_api::tri_render::RenderError::SurfaceOutdated) => {
                    self.configure();
                    self.renderer
                        .render_to_surface(&scene, &self.surface, self.width, self.height)
                        .map_err(err)?;
                }
                other => other.map_err(err)?,
            }
            Ok(scene.drawn.len())
        }
    }

    fn parse_mode(m: &str) -> Result<ViewMode, JsValue> {
        Ok(match m {
            "plan" | "plan_view2d" => ViewMode::PlanView2d,
            "elevation_left" | "left" => ViewMode::ElevationLeft,
            "elevation_right" | "right" => ViewMode::ElevationRight,
            "perspective" | "two_point_perspective" => ViewMode::TwoPointPerspective,
            other => {
                return Err(JsValue::from_str(&format!(
                    "unknown view mode {other:?}; expected plan, elevation_left, \
                 elevation_right or perspective"
                )))
            }
        })
    }
} // mod viewport
