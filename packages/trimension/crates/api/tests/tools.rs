//! M6's tests (PRD §6, Prompt 7): the agent tool surface, honouring I3, I5 and I7.

use tri_api::command::{Command, PointMm};
use tri_api::query::EntityKind;
use tri_api::registry::{
    self, ApplyCommandsArgs, DescribeRegionArgs, MeasureArgs, QueryEntitiesArgs, RenderViewArgs,
    ToolError, ToolKind, ViewModeArg,
};
use tri_api::{schema, TOOLS};
use tri_commit::{AgentId, Plan, PlanId, PlanStep, Sequencer, UserId};
use tri_doc::Op;

fn pt(x: f64, y: f64) -> PointMm {
    PointMm { x, y }
}

/// A session with a small building in it, built through the command surface.
fn seeded() -> Sequencer {
    let mut seq = Sequencer::default();
    let plan = Plan {
        id: PlanId("seed".into()),
        agent: AgentId("test".into()),
        summary: "seed".into(),
        steps: vec![PlanStep {
            message: "seed".into(),
            commands: vec![],
        }],
    }
    .approve(UserId("amitesh".into()));

    registry::apply_commands(
        &mut seq,
        Some(&plan),
        ApplyCommandsArgs {
            plan_id: "seed".into(),
            message: "create a layer".into(),
            commands: vec![Command::CreateLayer {
                name: "A-WALL".into(),
                parent: None,
            }],
        },
    )
    .expect("layer");

    registry::apply_commands(
        &mut seq,
        Some(&plan),
        ApplyCommandsArgs {
            plan_id: "seed".into(),
            message: "create walls".into(),
            commands: vec![
                Command::CreateWall {
                    centreline_mm: vec![pt(0.0, 0.0), pt(6000.0, 0.0)],
                    thickness_mm: 230.0,
                    height_mm: Some(3000.0),
                    layer: Some(1),
                },
                Command::CreateWall {
                    centreline_mm: vec![pt(0.0, 0.0), pt(0.0, 4000.0)],
                    thickness_mm: 230.0,
                    height_mm: None, // deliberately defaulted
                    layer: Some(1),
                },
            ],
        },
    )
    .expect("walls");

    seq
}

// ---------------------------------------------------------------------------
// I3: schemas are generated and cannot drift
// ---------------------------------------------------------------------------

#[test]
fn every_tool_in_the_registry_has_a_generated_schema() {
    for def in TOOLS {
        let s = schema::schema_for_tool(def.name)
            .unwrap_or_else(|| panic!("tool {:?} has no generated schema", def.name));
        assert!(s.is_object(), "{}: schema is not an object", def.name);
        assert!(
            schema::tool_definition(def.name).is_some(),
            "{}: no tool definition",
            def.name
        );
    }
    assert_eq!(TOOLS.len(), 5, "PRD 4.7 defines five tools");
}

#[test]
fn every_committed_schema_file_corresponds_to_a_registered_tool() {
    // The other half of the drift check: a schema file with no tool behind it.
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("schemas");
    let mut found = 0;
    for e in std::fs::read_dir(&dir)
        .expect("schemas directory must exist")
        .flatten()
    {
        let name = e.file_name().to_string_lossy().to_string();
        let Some(stem) = name.strip_suffix(".json") else {
            continue;
        };
        if stem == "_commands" {
            continue;
        }
        assert!(
            registry::tool(stem).is_some(),
            "schemas/{name} has no matching tool in the registry — run cargo xtask gen-schemas"
        );
        found += 1;
    }
    assert_eq!(
        found,
        TOOLS.len(),
        "schema count does not match the registry"
    );
}

#[test]
fn the_committed_schemas_match_what_generation_produces() {
    // This is what CI enforces with `git diff --exit-code`; asserting it here as well
    // means a developer finds out before pushing.
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("schemas");
    for def in TOOLS {
        let path = dir.join(format!("{}.json", def.name));
        let on_disk = std::fs::read_to_string(&path)
            .unwrap_or_else(|_| panic!("missing {}: run cargo xtask gen-schemas", path.display()));
        let generated = schema::to_pretty(&schema::tool_definition(def.name).unwrap());
        assert_eq!(
            on_disk,
            generated,
            "{} is stale; run cargo xtask gen-schemas",
            path.display()
        );
    }
}

#[test]
fn the_generated_command_schema_covers_every_registry_variant() {
    let s = schema::command_schema();
    let variants = s
        .get("oneOf")
        .and_then(|v| v.as_array())
        .expect("Command should generate a oneOf");
    assert_eq!(
        variants.len(),
        Command::ALL.len(),
        "the generated schema and Command::ALL disagree about how many commands exist"
    );
    let text = serde_json::to_string(&s).unwrap();
    for name in Command::ALL {
        assert!(
            text.contains(name),
            "{name} missing from the generated schema"
        );
    }
}

#[test]
fn tool_definitions_declare_which_calls_need_approval() {
    for def in TOOLS {
        let d = schema::tool_definition(def.name).unwrap();
        assert_eq!(
            d["requires_approval"].as_bool().unwrap(),
            def.kind == ToolKind::Write,
            "{}: approval flag disagrees with the registry",
            def.name
        );
    }
    // Exactly one write tool, and it is the command one.
    let writes: Vec<_> = TOOLS.iter().filter(|t| t.kind == ToolKind::Write).collect();
    assert_eq!(writes.len(), 1);
    assert_eq!(writes[0].name, "apply_commands");
}

#[test]
fn the_tool_surface_exposes_no_raw_op_type() {
    // I3: an agent must not have a lower-level write path than the UI. If `Op` ever
    // appears in a generated schema, someone has re-introduced `apply_commit(ops)`.
    for def in TOOLS {
        let text = serde_json::to_string(&schema::tool_definition(def.name).unwrap()).unwrap();
        for leaked in [
            "CreateEntity",
            "SetComponent",
            "RemoveComponent",
            "AddSourceEntity",
        ] {
            assert!(
                !text.contains(leaked),
                "{}: raw op variant {leaked:?} leaked into the tool schema",
                def.name
            );
        }
    }
    let _ = Op::SetFormatVersion { version: 1 };
}

// ---------------------------------------------------------------------------
// I5: no whole-model context
// ---------------------------------------------------------------------------

#[test]
fn query_entities_caps_results_and_flags_truncation() {
    let mut seq = Sequencer::default();
    let plan = Plan {
        id: PlanId("bulk".into()),
        agent: AgentId("t".into()),
        summary: "bulk".into(),
        steps: vec![],
    }
    .approve(UserId("a".into()));

    // 300 polylines — more than the cap.
    let commands: Vec<Command> = (0..300)
        .map(|i| Command::CreatePolyline {
            points_mm: vec![pt(i as f64 * 10.0, 0.0), pt(i as f64 * 10.0, 100.0)],
            closed: false,
            layer: None,
        })
        .collect();
    registry::apply_commands(
        &mut seq,
        Some(&plan),
        ApplyCommandsArgs {
            plan_id: "bulk".into(),
            commands,
            message: "bulk".into(),
        },
    )
    .unwrap();

    let r = registry::query_entities(seq.document(), QueryEntitiesArgs::default_all());
    assert_eq!(r.entities.len(), tri_api::query::MAX_RESULTS);
    assert_eq!(r.total_matched, 300);
    assert!(
        r.truncated,
        "300 results came back without a truncation flag"
    );
}

#[test]
fn the_cap_cannot_be_raised_by_the_caller() {
    let mut seq = Sequencer::default();
    let plan = Plan {
        id: PlanId("bulk".into()),
        agent: AgentId("t".into()),
        summary: "".into(),
        steps: vec![],
    }
    .approve(UserId("a".into()));
    let commands: Vec<Command> = (0..250)
        .map(|i| Command::CreatePolyline {
            points_mm: vec![pt(i as f64, 0.0), pt(i as f64, 10.0)],
            closed: false,
            layer: None,
        })
        .collect();
    registry::apply_commands(
        &mut seq,
        Some(&plan),
        ApplyCommandsArgs {
            plan_id: "bulk".into(),
            commands,
            message: "m".into(),
        },
    )
    .unwrap();

    let r = registry::query_entities(
        seq.document(),
        QueryEntitiesArgs {
            limit: Some(100_000),
            ..QueryEntitiesArgs::default_all()
        },
    );
    assert_eq!(
        r.entities.len(),
        tri_api::query::MAX_RESULTS,
        "a caller raised the result cap"
    );
}

#[test]
fn query_entities_filters_by_box_layer_and_kind() {
    let seq = seeded();
    let doc = seq.document();

    let walls = registry::query_entities(
        doc,
        QueryEntitiesArgs {
            kind: Some(EntityKind::Wall),
            ..QueryEntitiesArgs::default_all()
        },
    );
    assert_eq!(walls.entities.len(), 2);
    assert!(walls
        .entities
        .iter()
        .all(|e| e.layer.as_deref() == Some("A-WALL")));

    let by_layer = registry::query_entities(
        doc,
        QueryEntitiesArgs {
            layer: Some("nonexistent".into()),
            ..QueryEntitiesArgs::default_all()
        },
    );
    assert!(by_layer.entities.is_empty());

    let boxed = registry::query_entities(
        doc,
        QueryEntitiesArgs {
            bbox: Some(tri_api::query::BoxMm {
                min_x: -10.0,
                min_y: -10.0,
                max_x: 100.0,
                max_y: 100.0,
            }),
            ..QueryEntitiesArgs::default_all()
        },
    );
    assert_eq!(boxed.entities.len(), 2, "both walls start at the origin");
}

#[test]
fn describe_region_returns_aggregates_not_entity_lists() {
    let seq = seeded();
    let d = registry::describe_region(seq.document(), DescribeRegionArgs { bbox: None });

    assert_eq!(d.entity_count, 2);
    assert_eq!(d.by_kind.get("Wall"), Some(&2));
    assert_eq!(d.by_layer.get("A-WALL"), Some(&2));
    assert!(d.total_wall_length_mm > 9_000.0);
    assert!(d.headline.contains("Assumed"), "{}", d.headline);

    // The result must not be a smuggled entity dump.
    let json = serde_json::to_value(&d).unwrap();
    assert!(json.get("entities").is_none());
    assert!(!serde_json::to_string(&json).unwrap().contains("centreline"));
}

#[test]
fn measure_returns_numbers_with_their_provenance() {
    let seq = seeded();
    let m = registry::measure(seq.document(), MeasureArgs { ids: vec![1, 2] });
    assert_eq!(m.len(), 2);

    // Wall 1 got an explicit height, so nothing about it is assumed except the base.
    let w1 = &m[0];
    assert_eq!(w1.length_mm, Some(6000.0));
    assert_eq!(w1.height_mm, Some(3000.0));
    assert!((w1.volume_m3.unwrap() - 6.0 * 0.23 * 3.0).abs() < 1e-9);
    assert!(w1.provenance.contains_key("height"));
    assert!(
        w1.provenance["height"].starts_with("Measured"),
        "{}",
        w1.provenance["height"]
    );

    // Wall 2 defaulted its height and must say so.
    let w2 = &m[1];
    assert!(w2.contains_assumptions);
    assert!(
        w2.provenance["height"].starts_with("Assumed") && w2.provenance["height"].contains("2700"),
        "{}",
        w2.provenance["height"]
    );
}

// ---------------------------------------------------------------------------
// I7: plan before apply
// ---------------------------------------------------------------------------

#[test]
fn a_write_without_an_approved_plan_is_refused() {
    let mut seq = Sequencer::default();
    let err = registry::apply_commands(
        &mut seq,
        None,
        ApplyCommandsArgs {
            plan_id: "made-up".into(),
            commands: vec![Command::CreateLayer {
                name: "X".into(),
                parent: None,
            }],
            message: "sneaky".into(),
        },
    )
    .expect_err("an unapproved write must be refused");

    assert!(matches!(
        err,
        ToolError::ApprovalRequired { expected: None, .. }
    ));
    assert!(err.to_string().contains("A human must approve"));
    assert_eq!(seq.document().layers().len(), 0, "the write landed anyway");
}

#[test]
fn a_write_citing_the_wrong_plan_is_refused() {
    let mut seq = Sequencer::default();
    let approved = Plan {
        id: PlanId("plan-a".into()),
        agent: AgentId("claude".into()),
        summary: "".into(),
        steps: vec![],
    }
    .approve(UserId("amitesh".into()));

    let err = registry::apply_commands(
        &mut seq,
        Some(&approved),
        ApplyCommandsArgs {
            plan_id: "plan-b".into(),
            commands: vec![Command::CreateLayer {
                name: "X".into(),
                parent: None,
            }],
            message: "wrong plan".into(),
        },
    )
    .expect_err("citing a different plan must be refused");
    assert!(matches!(
        err,
        ToolError::ApprovalRequired {
            expected: Some(_),
            ..
        }
    ));
    assert_eq!(seq.document().layers().len(), 0);
}

#[test]
fn an_approved_write_lands_and_is_attributed_to_the_agent_and_the_plan() {
    let seq = seeded();
    assert_eq!(seq.history().len(), 2);
    for c in seq.history().iter() {
        assert!(c.author().is_agent());
        assert_eq!(c.author().plan(), Some(&PlanId("seed".into())));
    }
    assert_eq!(seq.history().by_plan(&PlanId("seed".into())).len(), 2);
}

// ---------------------------------------------------------------------------
// I3: the UI and the agent share one command path
// ---------------------------------------------------------------------------

#[test]
fn a_human_click_and_an_agent_call_produce_identical_ops() {
    let seq = seeded();
    let doc = seq.document();
    let command = Command::SetLabel {
        entity: 1,
        label: "W-01".into(),
    };

    // The UI dispatches the command directly.
    let from_ui = command.to_ops(doc, "human:amitesh").unwrap();
    // The agent's tool call deserialises to the same value and dispatches identically.
    let json = serde_json::to_string(&command).unwrap();
    let from_agent: Command = serde_json::from_str(&json).unwrap();
    let agent_ops = from_agent.to_ops(doc, "human:amitesh").unwrap();

    assert_eq!(from_ui, agent_ops, "the two paths diverged");
    assert_eq!(command, from_agent, "the command did not round-trip");
}

#[test]
fn a_command_with_bad_arguments_is_rejected_before_it_reaches_the_document() {
    let seq = seeded();
    let doc = seq.document();

    assert!(Command::CreateWall {
        centreline_mm: vec![pt(0.0, 0.0)],
        thickness_mm: 230.0,
        height_mm: None,
        layer: None,
    }
    .to_ops(doc, "t")
    .is_err());

    assert!(Command::CreateWall {
        centreline_mm: vec![pt(0.0, 0.0), pt(1.0, 0.0)],
        thickness_mm: -5.0,
        height_mm: None,
        layer: None,
    }
    .to_ops(doc, "t")
    .is_err());

    assert!(Command::DeleteEntity { entity: 9999 }
        .to_ops(doc, "t")
        .is_err());
    assert!(Command::SetLayerVisible {
        layer: 9999,
        visible: true
    }
    .to_ops(doc, "t")
    .is_err());
}

#[test]
fn setting_a_wall_height_requires_a_reason() {
    // I4, enforced at the command boundary rather than left to good intentions.
    let seq = seeded();
    let err = Command::SetWallHeight {
        entity: 1,
        height_mm: 3300.0,
        reason: "   ".into(),
    }
    .to_ops(seq.document(), "agent")
    .expect_err("an empty reason must be rejected");
    assert!(err.to_string().contains("I4"), "{err}");
}

#[test]
fn a_stated_height_is_measured_and_a_defaulted_one_is_assumed() {
    let mut seq = seeded();
    let plan = Plan {
        id: PlanId("h".into()),
        agent: AgentId("t".into()),
        summary: "".into(),
        steps: vec![],
    }
    .approve(UserId("a".into()));

    registry::apply_commands(
        &mut seq,
        Some(&plan),
        ApplyCommandsArgs {
            plan_id: "h".into(),
            commands: vec![Command::SetWallHeight {
                entity: 2,
                height_mm: 3300.0,
                reason: "section A-A shows 3300 to underside of slab".into(),
            }],
            message: "correct the height".into(),
        },
    )
    .unwrap();

    let m = registry::measure(seq.document(), MeasureArgs { ids: vec![2] });
    assert_eq!(m[0].height_mm, Some(3300.0));
    assert!(m[0].provenance["height"].starts_with("Measured"));
    assert!(m[0].provenance["height"].contains("section A-A"));
}

// ---------------------------------------------------------------------------
// render_view — the tool that closes the perception loop
// ---------------------------------------------------------------------------

#[test]
fn render_view_returns_a_png_the_caller_can_actually_look_at() {
    let seq = seeded();
    match registry::render_view(
        seq.document(),
        RenderViewArgs {
            mode: Some(ViewModeArg::PlanView2d),
            width_px: Some(320),
            height_px: Some(240),
            bbox: None,
        },
    ) {
        Ok(r) => {
            assert_eq!((r.width, r.height), (320, 240));
            assert!(r.entities_drawn > 0, "the camera framed nothing");
            // Bounded on both sides. A lower bound alone passed for months against a
            // metric that always returned 1.0 because it compared sRGB readback bytes
            // against a linear clear colour. A plan of thin lines inks a few percent.
            assert!(
                r.ink_fraction > 0.001,
                "the render is blank ({:.4})",
                r.ink_fraction
            );
            assert!(
                r.ink_fraction < 0.5,
                "half the frame is ink — the background is being counted ({:.4})",
                r.ink_fraction
            );
            // Valid base64 of a real PNG.
            assert!(r.png_base64.len() > 100);
            assert!(
                r.png_base64.starts_with("iVBOR"),
                "not a PNG: {}",
                &r.png_base64[..8]
            );
        }
        Err(e) => {
            assert!(
                std::env::var_os("TRIMENSION_REQUIRE_GPU").is_none(),
                "TRIMENSION_REQUIRE_GPU is set but no wgpu adapter is available: {e}"
            );
            eprintln!("SKIPPING GPU test: {e}");
        }
    }
}

#[test]
fn render_view_clamps_absurd_sizes() {
    let seq = seeded();
    match registry::render_view(
        seq.document(),
        RenderViewArgs {
            mode: None,
            width_px: Some(100_000),
            height_px: Some(1),
            bbox: None,
        },
    ) {
        Ok(r) => {
            assert_eq!(r.width, 2048);
            assert_eq!(r.height, 64);
        }
        Err(e) => {
            assert!(
                std::env::var_os("TRIMENSION_REQUIRE_GPU").is_none(),
                "TRIMENSION_REQUIRE_GPU is set but no wgpu adapter is available: {e}"
            );
            eprintln!("SKIPPING GPU test: {e}");
        }
    }
}

// Small helper so the tests above read cleanly.
trait DefaultAll {
    fn default_all() -> Self;
}
impl DefaultAll for QueryEntitiesArgs {
    fn default_all() -> Self {
        QueryEntitiesArgs {
            bbox: None,
            layer: None,
            kind: None,
            limit: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Spatial predicate
// ---------------------------------------------------------------------------

#[test]
fn a_box_matches_a_segment_that_crosses_it_without_containing_an_endpoint() {
    // The bug this guards: a vertex-only test loses any wall long enough that both ends
    // are off-screen, and makes clicking the middle of a wall select nothing.
    let seq = seeded();
    let doc = seq.document();

    // A small box over the middle of the 6m south wall. Neither endpoint is inside it.
    let mid = registry::query_entities(
        doc,
        QueryEntitiesArgs {
            bbox: Some(tri_api::query::BoxMm {
                min_x: 2900.0,
                min_y: -50.0,
                max_x: 3100.0,
                max_y: 50.0,
            }),
            ..QueryEntitiesArgs::default_all()
        },
    );
    assert_eq!(
        mid.entities.len(),
        1,
        "a box over the middle of a wall found nothing: {mid:?}"
    );
    assert_eq!(mid.entities[0].id, 1);

    // A box nowhere near it still matches nothing.
    let away = registry::query_entities(
        doc,
        QueryEntitiesArgs {
            bbox: Some(tri_api::query::BoxMm {
                min_x: 50_000.0,
                min_y: 50_000.0,
                max_x: 51_000.0,
                max_y: 51_000.0,
            }),
            ..QueryEntitiesArgs::default_all()
        },
    );
    assert!(
        away.entities.is_empty(),
        "matched something far away: {away:?}"
    );
}

#[test]
fn a_box_entirely_inside_a_wall_run_still_matches_it() {
    let seq = seeded();
    let r = registry::query_entities(
        seq.document(),
        QueryEntitiesArgs {
            bbox: Some(tri_api::query::BoxMm {
                min_x: 1000.0,
                min_y: -1.0,
                max_x: 1001.0,
                max_y: 1.0,
            }),
            ..QueryEntitiesArgs::default_all()
        },
    );
    assert_eq!(r.entities.len(), 1);
}
