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
    /// The plan a human has approved, if any. Writes are refused without it (I7).
    approved: Option<tri_api::tri_commit::ApprovedPlan>,
    user: String,
}

#[wasm_bindgen]
impl Session {
    #[wasm_bindgen(constructor)]
    pub fn new(user: String) -> Session {
        Session {
            seq: Sequencer::default(),
            approved: None,
            user,
        }
    }

    /// Adopt a snapshot from the session server.
    #[wasm_bindgen(js_name = loadSnapshot)]
    pub fn load_snapshot(&mut self, json: &str) -> Result<(), JsValue> {
        let doc: Document = serde_json::from_str(json).map_err(err)?;
        self.seq = Sequencer::new(doc);
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
        self.seq.history().len()
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

        let (ops, report) = build_solids(self.seq.document(), BuildParams::default());
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
            "walls": report.walls_built,
            "openings": report.openings_cut,
            "paired": report.paired,
            "unpaired": report.unpaired,
            "assumptions": report.assumptions.len(),
            "summary": report.summary(),
        }))
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

            let scene = tri_api::tri_render::scene::build(doc, camera, self.mode);

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
