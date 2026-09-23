//! Write a sheet to a file, for looking at.
use tri_commit::{Author, Sequencer};
use tri_doc::Length;
use tri_export_pdf::{export, sheet};
use tri_gen::{apply, plan};
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, RuleSet};

fn main() {
    let rules = RuleSet::bbmp_plotted_residential();
    let mm = |ft: f64| Length::from_mm((ft * 304.8).round() as i64);
    let raw = ParameterSet::from_brief(mm(30.0), mm(40.0), Orientation::North, 2, 2, 1).unwrap();
    let derived = derive_parameters(&raw, &rules).unwrap();
    let mut seq = Sequencer::default();
    let g = plan(&derived, &rules).unwrap();
    apply(&mut seq, &g, Author::system("x")).unwrap();

    let t = sheet::TitleBlock {
        project: "Residence at Kempapura".into(),
        plot: "30 x 40 ft plot, north facing".into(),
        drawing: "Ground floor plan".into(),
        date: "2026-09-23".into(),
        revision: "Rev A".into(),
        authority:
            "BBMP placeholder-v0, effective 2024-04-01 - NOT reviewed by a practising architect"
                .into(),
        disclaimer: "Indicative only. Verify against the sanctioning authority before submission."
            .into(),
        facts: vec![
            ("FAR".into(), "1.05 / 1.75".into()),
            ("Ground coverage".into(), "52.5% / 70%".into()),
            ("Built-up".into(), "117.0 m2".into()),
        ],
    };
    let (bytes, stats) = export(seq.document(), t).unwrap();
    let out = std::env::args().nth(1).unwrap_or("/tmp/sheet.pdf".into());
    std::fs::write(&out, &bytes).unwrap();
    println!("{} -> {}", stats.summary(), out);
}
