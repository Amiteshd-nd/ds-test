//! Generate a 2BHK and render it.
//!
//! ```bash
//! cargo run -p tri-gen --example generate_demo -- 30 40
//! ```

use tri_commit::{Author, Sequencer, UserId};
use tri_gen::{apply, plan};
use tri_params::{Brief, Orientation, Units};
use tri_render::camera::{Camera, ViewMode};
use tri_rules::{check, derive_parameters, RuleSet};

fn main() {
    let args: Vec<f64> = std::env::args()
        .skip(1)
        .filter_map(|a| a.parse().ok())
        .collect();
    let (w, d) = (
        args.first().copied().unwrap_or(30.0),
        args.get(1).copied().unwrap_or(40.0),
    );

    let rules = RuleSet::bbmp_plotted_residential();
    println!("ruleset: {}\n", rules.provenance_line());

    // Through the intake form, as the UI will.
    let mut form = Brief::new(Units::Feet, w, d, Orientation::North, 2, 2, 1);
    form.vaastu = Some(false);
    let brief = form.into_parameters().expect("in scope");
    let derived = derive_parameters(&brief, &rules).expect("a band covers this plot");

    println!("=== brief ===");
    println!("plot {w} x {d} ft  ({:.1} m²)", derived.plot_area_sqm());
    for (field, prov, reason) in derived.needs_review() {
        println!("  {field:<32} {prov:?}  {reason}");
    }

    let p = plan(&derived, &rules).expect("the template fits");
    println!("\n=== plan (nothing committed yet) ===");
    print!("{}", p.approval_summary());
    println!("\nrooms:");
    for (name, kind, area) in &p.rooms {
        println!(
            "  {name:<20} {kind:<9} {:>6.2} m²",
            *area as f64 / 1_000_000.0
        );
    }

    let mut seq = Sequencer::default();
    let ids = apply(&mut seq, &p, Author::Human(UserId("demo".into()))).expect("commits");
    println!("\n=== applied ===");
    println!("{} commits: {}", ids.len(), seq.document().hash());
    println!("{} entities", seq.document().entity_count());

    let d = check(seq.document(), &rules);
    println!("\n=== room programme (tier 2, not stored) ===");
    for t in tri_rules::derive_program(&derived, &rules) {
        println!(
            "  {:<9} x{}  {:>6.2} m²  {}",
            t.kind,
            t.count,
            t.target_area_mm2 as f64 / 1_000_000.0,
            t.reason
        );
    }

    println!("\n=== compliance ===");
    println!("{}", d.summary());
    for diag in &d.diagnostics {
        println!("  [{}] {}", diag.severity.label(), diag.message);
    }

    for (mode, name) in [
        (ViewMode::PlanView2d, "plan"),
        (ViewMode::TwoPointPerspective, "perspective"),
    ] {
        let doc = seq.document();
        let Some(b) = tri_render::scene::document_bounds(doc) else {
            continue;
        };
        let (z0, z1) = tri_render::scene::document_height(doc);
        let camera = Camera::fit_for(b, z0, z1, 1000, 700, mode);
        let scene = tri_render::scene::build(doc, camera, mode);
        match pollster::block_on(tri_render::Renderer::headless()) {
            Ok(r) => {
                let img = r.render_to_image(&scene, 1000, 700).expect("render");
                let path = format!("target/generated-{name}.png");
                std::fs::write(&path, img.to_png()).expect("write");
                println!(
                    "\n{name}: {} entities, {:.1}% ink -> {path}",
                    scene.drawn.len(),
                    img.ink_fraction(scene.background_srgb(), 4) * 100.0
                );
            }
            Err(e) => println!("\n{name}: no GPU ({e})"),
        }
    }
}
