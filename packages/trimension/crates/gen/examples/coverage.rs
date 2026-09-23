//! Print what the library actually does, plot by plot and bedroom count by bedroom count.
//!
//! An authoring tool, not a test. Adding a template raises one question the unit tests
//! cannot answer — which briefs does the library now serve, and which does it still turn
//! away — and this prints the answer as a table. The ten fixtures in `tests/library.rs`
//! were chosen by reading this output rather than by guessing plot sizes.
//!
//! ```bash
//! cargo run -p tri-gen --example coverage
//! ```

use tri_doc::Length;
use tri_gen::{plan, solve};
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, report, RuleSet, Severity, Standing};

fn main() {
    let r = RuleSet::bbmp_plotted_residential();
    let mm = |ft: f64| Length::from_mm((ft * 304.8).round() as i64);
    for (w, d) in [
        (20.0, 30.0),
        (25.0, 40.0),
        (30.0, 40.0),
        (30.0, 50.0),
        (40.0, 40.0),
        (30.0, 60.0),
        (40.0, 60.0),
        (50.0, 60.0),
        (40.0, 80.0),
        (60.0, 80.0),
        (50.0, 80.0),
        (60.0, 40.0),
    ] {
        for beds in 1..=4u8 {
            let Ok(raw) = ParameterSet::from_brief(mm(w), mm(d), Orientation::North, beds, 2, 1)
            else {
                println!("{w}x{d} {beds}BHK  brief rejected");
                continue;
            };
            let Ok(p) = derive_parameters(&raw, &r) else {
                println!("{w}x{d} {beds}BHK  no ruleset band");
                continue;
            };
            match solve(&p, &r) {
                Err(e) => println!("{w}x{d} {beds}BHK  REFUSED {}", first_line(&e.to_string())),
                Ok((t, l)) => {
                    let opts = tri_gen::candidates(&p, &r).unwrap();
                    let mut von = p.clone();
                    von.vaastu = tri_doc::Tracked::measured(true, "coverage example");
                    if let Ok(v) = tri_gen::candidates(&von, &r) {
                        println!(
                            "{w}x{d} {beds}BHK vaastu: {}",
                            v.iter()
                                .map(|o| format!(
                                    "{} [{}%, {}]",
                                    o.key,
                                    o.vaastu.as_ref().map(|a| a.score).unwrap_or(0),
                                    o.cost_note()
                                ))
                                .collect::<Vec<_>>()
                                .join("  |  ")
                        );
                    }
                    println!(
                        "{w}x{d} {beds}BHK options: {}",
                        opts.iter()
                            .map(|o| format!("{} [{}]", o.key, o.ranking_note()))
                            .collect::<Vec<_>>()
                            .join("  |  ")
                    );
                    let mut seq = tri_commit::Sequencer::default();
                    let g = plan(&p, &r).unwrap();
                    tri_gen::apply(&mut seq, &g, tri_commit::Author::system("x")).unwrap();
                    let rep = report(seq.document(), &r);
                    let over: Vec<String> = rep
                        .metrics
                        .iter()
                        .filter(|m| m.standing == Standing::Over)
                        .map(|m| {
                            format!("{}={:.1}/{:.1}", m.label, m.value, m.limit.unwrap_or(0.0))
                        })
                        .chain(
                            rep.diagnostics
                                .iter()
                                .filter(|x| x.severity == Severity::Hard)
                                .map(|x| x.message.clone()),
                        )
                        .collect();
                    let smallest = l
                        .cells
                        .iter()
                        .map(|c| (c.area_mm2(), c.name))
                        .min()
                        .unwrap();
                    println!(
                        "{w}x{d} {beds}BHK  {:<24} env {:.1}x{:.1}m  min room {} {:.1}m²  {}",
                        t.id,
                        l.envelope_width().as_mm_f64() / 1000.0,
                        l.envelope_depth().as_mm_f64() / 1000.0,
                        smallest.1,
                        smallest.0 as f64 / 1e6,
                        if over.is_empty() {
                            "ok".into()
                        } else {
                            over.join("; ")
                        }
                    );
                }
            }
        }
    }
}

fn first_line(s: &str) -> String {
    s.lines().map(|l| l.trim()).collect::<Vec<_>>().join(" | ")
}
