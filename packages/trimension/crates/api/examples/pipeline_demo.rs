//! End-to-end: DXF in, 3D out, rendered headlessly.
//!
//! ```bash
//! cargo run -p tri-api --example pipeline_demo -- fixtures/dxf/clean-plan.dxf
//! ```
//!
//! This is the same code path `render_view` gives an agent — no window, no browser.

use tri_api::registry::{self, RenderViewArgs, ViewModeArg};
use tri_commit::{Author, Commit, Sequencer};
use tri_import_dxf::{import, DxfImporter, RuleSet};
use tri_solid::pipeline::{build_solids, BuildParams};

fn main() {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "fixtures/dxf/clean-plan.dxf".into());
    let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("could not read {path}: {e}"));
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let mut seq = Sequencer::default();

    println!("=== import: {name} ===");
    let outcome = import(
        &mut seq,
        &DxfImporter::default(),
        &bytes,
        &name,
        &RuleSet::ncs_default(),
    )
    .expect("import");
    print!("{}", outcome.report());

    println!("\n=== 2D -> 3D ===");
    let (ops, report) = build_solids(seq.document(), BuildParams::default());
    if !ops.is_empty() {
        seq.submit(Commit::new(
            seq.head(),
            Author::system("2d-to-3d"),
            ops,
            "extrude walls",
        ))
        .expect("the build must validate");
    }
    println!("{}", report.summary());
    if !report.assumptions.is_empty() {
        println!("\nassumptions a reviewer must check:");
        for (id, field, why) in report.assumptions.iter().take(6) {
            println!("  {id:?}.{field}: {why}");
        }
        if report.assumptions.len() > 6 {
            println!("  ... and {} more", report.assumptions.len() - 6);
        }
    }

    println!("\n=== document ===");
    println!("hash:     {}", seq.document().hash());
    println!("entities: {}", seq.document().entity_count());
    println!("commits:  {}", seq.history().len());

    println!("\n=== headless render (the agent's render_view) ===");
    for (mode, label) in [
        (ViewModeArg::PlanView2d, "plan"),
        (ViewModeArg::ElevationLeft, "elev-left"),
        (ViewModeArg::ElevationRight, "elev-right"),
        (ViewModeArg::TwoPointPerspective, "perspective"),
    ] {
        match registry::render_view(
            seq.document(),
            RenderViewArgs {
                mode: Some(mode),
                width_px: Some(900),
                height_px: Some(600),
                bbox: None,
            },
        ) {
            Ok(r) => {
                let png = base64_decode(&r.png_base64);
                let out = format!("target/demo-{label}.png");
                std::fs::write(&out, &png).expect("write png");
                println!(
                    "{label:<12} {}x{}  {} entities drawn  {:.1}% ink  -> {out}",
                    r.width,
                    r.height,
                    r.entities_drawn,
                    r.ink_fraction * 100.0
                );
            }
            Err(e) => println!("{label:<12} skipped: {e}"),
        }
    }
}

fn base64_decode(s: &str) -> Vec<u8> {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let idx = |c: u8| A.iter().position(|x| *x == c).unwrap_or(0) as u32;
    let clean: Vec<u8> = s
        .bytes()
        .filter(|b| *b != b'=' && !b.is_ascii_whitespace())
        .collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    for chunk in clean.chunks(4) {
        let mut n = 0u32;
        for (i, c) in chunk.iter().enumerate() {
            n |= idx(*c) << (18 - 6 * i);
        }
        out.push((n >> 16) as u8);
        if chunk.len() > 2 {
            out.push((n >> 8) as u8)
        }
        if chunk.len() > 3 {
            out.push(n as u8)
        }
    }
    out
}
