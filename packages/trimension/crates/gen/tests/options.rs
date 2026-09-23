//! F5: options as branches, and thumbnails through the headless renderer.
//!
//! The branch semantics themselves are tested in `tri-commit`. What is tested here is the
//! join: that a generation produces several branches from one parent, that each is a real
//! validated document, and that the headless render path can turn one into a picture
//! without a window.

use tri_commit::{Author, Branch, Branches, Sequencer};
use tri_doc::Length;
use tri_gen::{apply, candidates, plan_for};
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, report, RuleSet, Severity};

fn rules() -> RuleSet {
    RuleSet::bbmp_plotted_residential()
}

fn brief(w_ft: f64, d_ft: f64, bedrooms: u8) -> ParameterSet {
    let mm = |ft: f64| Length::from_mm((ft * 304.8).round() as i64);
    let raw =
        ParameterSet::from_brief(mm(w_ft), mm(d_ft), Orientation::North, bedrooms, 2, 1).unwrap();
    derive_parameters(&raw, &rules()).unwrap()
}

/// What the wasm session does: fork the sequencer per option and apply through the
/// ordinary commit path.
fn generate(p: &ParameterSet) -> Branches {
    let r = rules();
    let base = Sequencer::default();
    let mut set = Branches::new();
    for c in candidates(p, &r).unwrap() {
        let plan = plan_for(&c, p).unwrap();
        let mut fork = base.clone();
        apply(&mut fork, &plan, Author::system("test")).unwrap();
        set.push(Branch::new(
            plan.option_key.clone(),
            plan.option_label.clone(),
            c.ranking_note(),
            fork,
            base.head(),
        ));
    }
    set
}

#[test]
fn a_generation_produces_several_branches_from_one_parent() {
    let set = generate(&brief(40.0, 60.0, 3));
    assert!(set.len() >= 3, "only {} options", set.len());
    let bases: Vec<_> = set.iter().map(|b| b.base).collect();
    assert!(
        bases.windows(2).all(|w| w[0] == w[1]),
        "options do not share a parent commit"
    );
}

#[test]
fn every_option_is_a_document_that_passes_its_own_hard_rules() {
    // An option that breaks a bylaw is allowed to exist — that is the whole point of
    // diagnostics not being violations. But the *generator* should not be producing one,
    // and offering four options quadruples the chance of shipping one unnoticed.
    let r = rules();
    for (w, d, beds) in [(30.0, 50.0, 2), (40.0, 60.0, 3), (60.0, 80.0, 4)] {
        for b in generate(&brief(w, d, beds)).iter() {
            let rep = report(b.document(), &r);
            let hard: Vec<&str> = rep
                .diagnostics
                .iter()
                .filter(|x| x.severity == Severity::Hard)
                .map(|x| x.message.as_str())
                .collect();
            assert!(hard.is_empty(), "{w}x{d} {}: {hard:?}", b.key);
        }
    }
}

#[test]
fn every_option_carries_the_brief_that_produced_it() {
    // Switching to an option must not switch off the compliance panel. Each branch is a
    // whole document, so each one needs its own copy of the parameter set.
    for b in generate(&brief(40.0, 60.0, 3)).iter() {
        assert!(
            tri_params::component::find(b.document()).is_some(),
            "{} has no brief, so nothing can check it",
            b.key
        );
    }
}

#[test]
fn an_option_renders_headlessly_to_a_thumbnail() {
    // "Thumbnails via the headless renderer" (F5), and invariant I6 being used rather
    // than only tested: no window, no canvas, no browser.
    //
    // The browser draws its strip to small canvases instead. Not because this path is
    // wrong there, but because reading the framebuffer back needs `device.poll(wait)` and
    // a blocking receive, and wasm has one thread — the receive would stop the event loop
    // that WebGPU resolves the mapping on. This is the path a server would use.
    use tri_render::camera::{Camera, ViewMode};

    let set = generate(&brief(40.0, 60.0, 3));
    let branch = set.iter().next().expect("at least one option");
    let doc = branch.document();

    let (w, h) = (160, 160);
    let (z_min, z_max) = tri_render::scene::document_height(doc);
    let bounds = tri_render::scene::document_bounds(doc).expect("a generated plan has bounds");
    let camera = Camera::fit_for(bounds, z_min, z_max, w, h, ViewMode::PlanView2d);

    let image = tri_render::view(doc, camera, ViewMode::PlanView2d)
        .expect("headless render; on CI install mesa-vulkan-drivers and set WGPU_BACKEND=vulkan");
    assert_eq!((image.width, image.height), (w, h));

    // Something was actually drawn. An all-background image would pass every assertion
    // about size and is exactly what a broken camera produces.
    let bg = image.pixel(0, 0);
    let ink = (0..h)
        .flat_map(|y| (0..w).map(move |x| (x, y)))
        .filter(|(x, y)| image.pixel(*x, *y) != bg)
        .count();
    assert!(
        ink > (w * h / 100) as usize,
        "only {ink} of {} pixels differ from the background",
        w * h
    );
}

#[test]
fn two_options_do_not_render_to_the_same_picture() {
    // The strip is only a choice if the thumbnails differ. Comparing the scenes rather
    // than the pixels: it is the same comparison the parity test trusts, and it does not
    // need a GPU.
    use tri_render::camera::{Camera, ViewMode};

    let set = generate(&brief(40.0, 60.0, 3));
    let scenes: Vec<_> = set
        .iter()
        .map(|b| {
            let doc = b.document();
            let (z_min, z_max) = tri_render::scene::document_height(doc);
            let bounds = tri_render::scene::document_bounds(doc).unwrap();
            let camera = Camera::fit_for(bounds, z_min, z_max, 160, 160, ViewMode::PlanView2d);
            (
                b.key.clone(),
                tri_render::scene_for(doc, camera, ViewMode::PlanView2d),
            )
        })
        .collect();
    for (i, (ka, a)) in scenes.iter().enumerate() {
        for (kb, b) in &scenes[i + 1..] {
            assert_ne!(a.lines, b.lines, "{ka} and {kb} draw the same plan");
        }
    }
}
