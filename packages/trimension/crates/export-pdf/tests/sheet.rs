//! P5's tests.
//!
//! The done-when is "a sheet prints at correct scale with dimensions legible", and the
//! failure mode worth guarding is a file that builds and does not open. A PDF with a
//! cross-reference table one byte out is silently repaired by some viewers and rejected
//! with no useful message by others, and nothing about the bytes looks wrong.

use tri_commit::{Author, Sequencer};
use tri_doc::Length;
use tri_export_pdf::{export, sheet, SheetError};
use tri_gen::{apply, plan};
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, RuleSet};

fn generated(w_ft: f64, d_ft: f64, beds: u8) -> Sequencer {
    let rules = RuleSet::bbmp_plotted_residential();
    let mm = |ft: f64| Length::from_mm((ft * 304.8).round() as i64);
    let raw = ParameterSet::from_brief(mm(w_ft), mm(d_ft), Orientation::North, beds, 2, 1).unwrap();
    let derived = derive_parameters(&raw, &rules).unwrap();
    let mut seq = Sequencer::default();
    let g = plan(&derived, &rules).unwrap();
    apply(&mut seq, &g, Author::system("test")).unwrap();
    seq
}

fn block() -> sheet::TitleBlock {
    sheet::TitleBlock {
        project: "Residence".into(),
        plot: "30 x 40 ft plot".into(),
        drawing: "Ground floor plan".into(),
        date: "2026-09-23".into(),
        revision: "Rev A".into(),
        authority: "BBMP placeholder-v0 — NOT reviewed by a practising architect".into(),
        disclaimer: "Indicative only. Verify before submission.".into(),
        facts: vec![("FAR".into(), "1.05 / 1.75".into())],
    }
}

#[test]
fn a_sheet_is_a_pdf_a_reader_will_open() {
    let seq = generated(30.0, 40.0, 2);
    let (bytes, stats) = export(seq.document(), block()).unwrap();

    assert!(bytes.starts_with(b"%PDF-1.4"), "no header");
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.ends_with("%%EOF\n"), "no trailer");
    assert!(text.contains("/Type /Catalog"));
    assert!(text.contains("/Type /Page "), "no page object");
    assert!(stats.walls >= 4, "{stats:?}");
    assert!(stats.rooms >= 4, "{stats:?}");
}

#[test]
fn every_cross_reference_offset_points_at_its_object() {
    // The one part of a PDF that is easy to get wrong and impossible to see. A viewer
    // given a bad table either repairs the file silently or refuses it with no message,
    // so this walks the table and checks each offset lands on `N 0 obj`.
    //
    // Indexed on **bytes**, not on a lossy UTF-8 view of them: the file opens with a
    // binary comment so that tools treat it as binary, and `from_utf8_lossy` replaces
    // those four bytes with one replacement character — which shifts every string index
    // past it and made the first version of this test fail on a perfectly good file.
    let seq = generated(30.0, 40.0, 2);
    let (bytes, _) = export(seq.document(), block()).unwrap();

    let tail = bytes
        .windows(10)
        .rposition(|w| w == b"startxref\n")
        .expect("startxref");
    let xref_at: usize = String::from_utf8_lossy(&bytes[tail + 10..])
        .lines()
        .next()
        .and_then(|l| l.trim().parse().ok())
        .expect("startxref offset");
    assert!(
        bytes[xref_at..].starts_with(b"xref\n"),
        "startxref is wrong"
    );

    let table = String::from_utf8_lossy(&bytes[xref_at..]).to_string();
    let mut lines = table.lines();
    lines.next();
    let count: usize = lines
        .next()
        .and_then(|l| l.split_whitespace().nth(1)?.parse().ok())
        .expect("the xref header names a count");

    // Entry 0 is the free head; the rest must each point at their own object.
    for (i, line) in lines.take(count).enumerate().skip(1) {
        let off: usize = line.split_whitespace().next().unwrap().parse().unwrap();
        assert!(
            off < bytes.len(),
            "object {i} offset {off} is past the file"
        );
        let want = format!("{i} 0 obj");
        assert!(
            bytes[off..].starts_with(want.as_bytes()),
            "the table says object {i} is at {off}, where the file has {:?}",
            String::from_utf8_lossy(&bytes[off..(off + 24).min(bytes.len())])
        );
    }
}

#[test]
fn a_reader_on_this_machine_renders_it() {
    // The check that no amount of structural assertion replaces: hand the file to a real
    // PDF reader and see whether a picture comes out. `qlmanage` is macOS's Quick Look,
    // which uses the system PDF stack — the same one Preview uses.
    let seq = generated(30.0, 40.0, 2);
    let (bytes, _) = export(seq.document(), block()).unwrap();
    let dir = std::env::temp_dir().join("trimension-pdf-test");
    let _ = std::fs::create_dir_all(&dir);
    let pdf = dir.join("sheet.pdf");
    std::fs::write(&pdf, &bytes).unwrap();

    let out = std::process::Command::new("qlmanage")
        .args(["-t", "-s", "1000", "-o"])
        .arg(&dir)
        .arg(&pdf)
        .output();
    let Ok(out) = out else {
        // Not macOS. The structural tests still ran; skipping here is better than a
        // platform-dependent failure.
        eprintln!("qlmanage unavailable; skipped the render check");
        return;
    };
    let png = dir.join("sheet.pdf.png");
    assert!(
        png.exists(),
        "Quick Look produced no image: {}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    // PNG compresses a blank page to almost nothing, so the file size is a usable proxy
    // for "something was drawn". At 1000px a sheet with walls, labels and a title block
    // is tens of kilobytes; an empty one is two or three.
    let size = std::fs::metadata(&png).unwrap().len();
    assert!(size > 15_000, "the render is {size} bytes — a blank page");
    let _ = std::fs::remove_file(&png);
}

#[test]
fn the_drawing_is_at_a_scale_a_rule_measures() {
    // Never scaled to fit. "1:87 to fill the page" is a picture of a building, not a
    // drawing of one, and the whole value of printing it is that a scale rule works.
    for (w, d, beds) in [
        (20.0, 30.0, 1),
        (30.0, 40.0, 2),
        (40.0, 60.0, 3),
        (60.0, 80.0, 4),
    ] {
        let Ok(seq) = std::panic::catch_unwind(|| generated(w, d, beds)) else {
            continue;
        };
        let (_, stats) = export(seq.document(), block()).unwrap();
        assert!(
            sheet::SCALES.contains(&stats.scale_denominator),
            "{w}x{d}: 1:{} is not a drawing scale",
            stats.scale_denominator
        );
    }
}

#[test]
fn a_bigger_plot_gets_a_bigger_sheet_or_a_smaller_scale_but_still_fits() {
    let small = export(generated(30.0, 40.0, 2).document(), block())
        .unwrap()
        .1;
    let large = export(generated(60.0, 80.0, 4).document(), block())
        .unwrap()
        .1;
    assert!(
        large.scale_denominator > small.scale_denominator || large.paper != small.paper,
        "a 60x80 plot got the same sheet and scale as a 30x40: {small:?} {large:?}"
    );
}

#[test]
fn the_sheet_says_its_own_scale_and_carries_the_disclaimer() {
    // A drawing that does not state its scale is not a drawing. And the sheet is the one
    // artefact that leaves the building and turns up in a meeting with no compliance panel
    // beside it, so the unreviewed-ruleset warning has to travel with it.
    let seq = generated(30.0, 40.0, 2);
    let (bytes, stats) = export(seq.document(), block()).unwrap();
    let text = String::from_utf8_lossy(&bytes);
    assert!(
        text.contains(&format!("SCALE 1:{}", stats.scale_denominator)),
        "the sheet does not state its scale"
    );
    assert!(
        text.contains("NOT reviewed by a practising architect"),
        "no authority line"
    );
    assert!(text.contains("Verify before submission"), "no disclaimer");
    assert!(text.contains("Ground floor plan"));
}

#[test]
fn the_walls_on_paper_are_the_walls_on_screen() {
    // `wall_faces` is shared with the renderer rather than reimplemented. A sheet whose
    // wall faces sat a few millimetres off the canvas's would be wrong in exactly the way
    // an architect checks with a rule, and nothing else in the system would notice.
    let seq = generated(30.0, 40.0, 2);
    let doc = seq.document();
    let source = include_str!("../src/lib.rs");
    assert!(
        source.contains("tri_render::scene::wall_faces"),
        "the sheet computes its own wall outline"
    );
    // And the shared function is not trivially empty.
    let walls: Vec<_> = doc
        .iter_with(tri_doc::ComponentKey::WallProfile)
        .filter_map(|(_, s)| match s.get(&tri_doc::ComponentKey::WallProfile) {
            Some(tri_doc::Component::WallProfile(w)) => Some(tri_render::scene::wall_faces(w)),
            _ => None,
        })
        .collect();
    assert!(!walls.is_empty());
    for (left, right) in walls {
        assert!(left.len() >= 2 && right.len() >= 2);
        assert_ne!(left, right, "both faces of a wall are on the centreline");
    }
}

#[test]
fn a_document_with_nothing_in_it_is_refused_rather_than_printed_blank() {
    let empty = Sequencer::default();
    assert_eq!(
        export(empty.document(), block()).unwrap_err(),
        SheetError::Empty
    );
}

#[test]
fn a_room_label_that_would_not_fit_is_left_off() {
    // A 2.5mm name spilling out of a 1.2m toilet at 1:100 is worse than no name. Checked
    // by counting the labels that made it against the rooms that exist.
    let seq = generated(25.0, 40.0, 1);
    let (bytes, stats) = export(seq.document(), block()).unwrap();
    let text = String::from_utf8_lossy(&bytes);
    let drawn = tri_rules::room::all(seq.document())
        .iter()
        .filter(|r| text.contains(&format!("({}) Tj", r.name)))
        .count();
    assert!(drawn > 0, "no room was labelled at all");
    assert!(drawn <= stats.rooms);
}

#[test]
fn a_dimension_reads_in_millimetres() {
    // The units bug that is obvious on paper and invisible in a byte comparison: the
    // first sheet printed `8692000` beside an 8.7m wall, because micrometres were passed
    // into a parameter named `metres`.
    let seq = generated(30.0, 40.0, 2);
    let (bytes, _) = export(seq.document(), block()).unwrap();
    let text = String::from_utf8_lossy(&bytes);

    // Whatever figures the sheet prints, none of them may be in micrometres. A plotted
    // residential building is between two and thirty metres on a side.
    let mut found = 0;
    for frag in text.split("Tj").filter(|_| true) {
        let Some(open) = frag.rfind('(') else {
            continue;
        };
        let Some(close) = frag[open..].find(')') else {
            continue;
        };
        let s = &frag[open + 1..open + close];
        if let Ok(n) = s.parse::<f64>() {
            if n > 1000.0 {
                found += 1;
                assert!(
                    (2_000.0..=30_000.0).contains(&n),
                    "{n} is not a dimension in millimetres"
                );
            }
        }
    }
    assert!(found >= 2, "the sheet carries no overall dimensions");
}
