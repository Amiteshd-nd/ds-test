//! F8's massing export. The failures worth guarding are all silent: a model that opens as
//! a speck at the origin, or as a tangle of triangles reaching back to it.

use tri_commit::{Author, Sequencer};
use tri_doc::Length;
use tri_export_obj::{export, ObjError};
use tri_gen::{apply, plan};
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, RuleSet};

fn generated() -> Sequencer {
    let rules = RuleSet::bbmp_plotted_residential();
    let raw = ParameterSet::from_brief(
        Length::from_mm(9144),
        Length::from_mm(12192),
        Orientation::North,
        2,
        2,
        1,
    )
    .unwrap();
    let derived = derive_parameters(&raw, &rules).unwrap();
    let mut seq = Sequencer::default();
    let g = plan(&derived, &rules).unwrap();
    apply(&mut seq, &g, Author::system("test")).unwrap();
    seq
}

fn parse(bytes: &[u8]) -> (Vec<[f64; 3]>, Vec<[usize; 3]>) {
    let text = String::from_utf8(bytes.to_vec()).expect("OBJ is text");
    let mut v = Vec::new();
    let mut f = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        match parts.next() {
            Some("v") => {
                let n: Vec<f64> = parts.filter_map(|p| p.parse().ok()).collect();
                assert_eq!(n.len(), 3, "{line}");
                v.push([n[0], n[1], n[2]]);
            }
            Some("f") => {
                let n: Vec<usize> = parts.filter_map(|p| p.parse().ok()).collect();
                assert_eq!(n.len(), 3, "{line}");
                f.push([n[0], n[1], n[2]]);
            }
            _ => {}
        }
    }
    (v, f)
}

#[test]
fn every_face_index_points_at_a_vertex_that_exists() {
    // OBJ indices are 1-based and **global to the file**, not per-object. Writing them
    // per-object is the single most common way to produce a mesh that opens as a tangle
    // reaching back to the origin, and every index still parses.
    let seq = generated();
    let (bytes, stats) = export(seq.document()).unwrap();
    let (v, f) = parse(&bytes);

    assert_eq!(v.len(), stats.vertices);
    assert_eq!(f.len(), stats.triangles);
    assert!(stats.solids >= 4, "{stats:?}");
    for tri in &f {
        for i in tri {
            assert!(
                *i >= 1 && *i <= v.len(),
                "face index {i} against {} vertices",
                v.len()
            );
        }
    }
}

#[test]
fn the_model_is_in_metres_and_the_size_of_a_house() {
    // The other silent failure: exporting raw micrometres, which opens as a continent, or
    // dividing twice, which opens as a speck. A 30x40 ft plot is about 9 by 12 metres.
    let seq = generated();
    let (bytes, _) = export(seq.document()).unwrap();
    let (v, _) = parse(&bytes);
    assert!(!v.is_empty());

    let span = |axis: usize| {
        let lo = v.iter().map(|p| p[axis]).fold(f64::MAX, f64::min);
        let hi = v.iter().map(|p| p[axis]).fold(f64::MIN, f64::max);
        hi - lo
    };
    let (x, y, z) = (span(0), span(1), span(2));
    assert!((3.0..30.0).contains(&x), "x spans {x} metres");
    assert!((3.0..30.0).contains(&y), "y spans {y} metres");
    // Wall height: one storey, so somewhere around three metres.
    assert!((2.0..5.0).contains(&z), "z spans {z} metres");
}

#[test]
fn the_header_says_what_this_is_and_is_not() {
    // "Useful for massing only." A file that does not say so will be opened by somebody
    // expecting a BIM model, and the geometry cannot meet that expectation.
    let seq = generated();
    let (bytes, _) = export(seq.document()).unwrap();
    let text = String::from_utf8(bytes).unwrap();
    assert!(text.contains("massing"), "{}", &text[..120]);
    assert!(text.contains("units: metres"));
    assert!(text.contains("not a BIM model"));
    // ASCII only: a byte-oriented parser has no reason to be handed UTF-8.
    assert!(text.is_ascii(), "the file is not ASCII");
}

#[test]
fn a_document_that_has_not_been_extruded_says_so() {
    let empty = Sequencer::default();
    assert_eq!(export(empty.document()).unwrap_err(), ObjError::NoSolids);
}
