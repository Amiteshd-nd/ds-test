//! F7's own tests. The two that matter are the orientation convention and the refusal
//! that cannot happen.

use tri_vaastu::{assess, Compass, Room, RuleSet, Sector, Verdict};

fn rules() -> RuleSet {
    RuleSet::traditional()
}

#[test]
fn a_north_facing_plot_has_its_road_to_the_north() {
    // The convention that is easy to get backwards and impossible to notice afterwards:
    // every room would land in the opposite sector and the layer would be confidently
    // wrong rather than obviously broken. The document's +Y runs *away* from the road, so
    // on a north-facing plot it points south.
    let c = Compass::new("north", 0);
    assert_eq!(c.plus_y_mdeg, 180_000);
    // A room at the far end of the plot from the road is therefore in the south.
    assert_eq!(c.sector(0, 10_000_000, 1_000_000), Sector::South);
    // And one beside the road is in the north.
    assert_eq!(c.sector(0, -10_000_000, 1_000_000), Sector::North);

    // A south-facing plot is the mirror of that.
    let s = Compass::new("south", 0);
    assert_eq!(s.plus_y_mdeg, 0);
    assert_eq!(s.sector(0, 10_000_000, 1_000_000), Sector::North);
}

#[test]
fn every_road_orientation_maps_to_a_different_axis() {
    let mut seen: Vec<i32> = ["north", "east", "south", "west"]
        .iter()
        .map(|o| Compass::new(o, 0).plus_y_mdeg)
        .collect();
    let n = seen.len();
    seen.sort_unstable();
    seen.dedup();
    assert_eq!(seen.len(), n);
}

#[test]
fn the_north_angle_rotates_the_whole_frame() {
    let square = Compass::new("south", 0);
    let skewed = Compass::new("south", 90_000);
    assert_eq!(square.sector(0, 10_000_000, 0), Sector::North);
    assert_eq!(skewed.sector(0, 10_000_000, 0), Sector::East);
}

#[test]
fn the_middle_of_the_plot_is_its_own_sector() {
    // The brahmasthan. Folding it into one of the eight would lose the one preference
    // every school agrees on.
    let c = Compass::new("north", 0);
    assert_eq!(c.sector(100, 100, 1_000_000), Sector::Centre);
    assert_ne!(c.sector(2_000_000, 0, 1_000_000), Sector::Centre);
}

/// A plot 10m square, centred at the origin, road to the north.
fn plot() -> (Compass, (i64, i64), (i64, i64)) {
    (Compass::new("north", 0), (0, 0), (5_000_000, 5_000_000))
}

#[test]
fn a_kitchen_in_the_south_east_scores_better_than_one_in_the_north_east() {
    let (c, centre, half) = plot();
    // Road to the north, so +Y is south. South-east in compass terms is -Y, +X... but the
    // point of the test is the comparison, not the arithmetic: place the kitchen in each
    // sector by asking the compass where each corner lands.
    let corner = |dx: i64, dy: i64| {
        let rooms = [Room {
            kind: "kitchen",
            name: "Kitchen",
            cx_um: dx,
            cy_um: dy,
        }];
        assess(&rooms, c, centre, half, &rules())
    };
    let mut best = 0u8;
    let mut worst = 100u8;
    for (dx, dy) in [
        (3_000_000, 3_000_000),
        (-3_000_000, 3_000_000),
        (3_000_000, -3_000_000),
        (-3_000_000, -3_000_000),
    ] {
        let a = corner(dx, dy);
        best = best.max(a.score);
        worst = worst.min(a.score);
    }
    assert!(best > worst, "every corner scored the same for a kitchen");
    assert_eq!(best, 100, "no corner is the preferred one");
}

#[test]
fn a_toilet_in_the_north_east_is_a_named_conflict() {
    let (c, centre, half) = plot();
    // Road north means +Y is south, +X is west. North-east is therefore -Y, -X.
    let rooms = [Room {
        kind: "toilet",
        name: "Toilet",
        cx_um: -3_000_000,
        cy_um: -3_000_000,
    }];
    let a = assess(&rooms, c, centre, half, &rules());
    assert_eq!(a.placements[0].sector, "north-east");
    assert_eq!(a.placements[0].verdict, Verdict::Avoid);
    assert_eq!(a.conflicts.len(), 1);
    assert!(a.conflicts[0].contains("Toilet"), "{:?}", a.conflicts);
    assert!(a.summary().contains("misplaced"), "{}", a.summary());
}

#[test]
fn a_kind_the_ruleset_says_nothing_about_is_not_a_miss() {
    // A corridor has no preference. Counting it as a failure would penalise a template for
    // having circulation, which is not a Vaastu opinion, it is an arithmetic accident.
    let (c, centre, half) = plot();
    let with = [
        Room {
            kind: "kitchen",
            name: "Kitchen",
            cx_um: 3_000_000,
            cy_um: 3_000_000,
        },
        Room {
            kind: "corridor",
            name: "Corridor",
            cx_um: 0,
            cy_um: 2_000_000,
        },
    ];
    let without = [with[0].clone()];
    let a = assess(&with, c, centre, half, &rules());
    let b = assess(&without, c, centre, half, &rules());
    assert_eq!(a.score, b.score);
    assert_eq!(a.placements.len(), 1, "the corridor was scored");
}

#[test]
fn a_layout_with_nothing_recognisable_sits_in_the_middle() {
    // Not zero. A layout the ruleset has no opinion about is not a bad layout, and
    // reporting it as one would make the toggle punish templates it cannot read.
    let (c, centre, half) = plot();
    let rooms = [Room {
        kind: "corridor",
        name: "Corridor",
        cx_um: 0,
        cy_um: 2_000_000,
    }];
    assert_eq!(assess(&rooms, c, centre, half, &rules()).score, 50);
}

#[test]
fn the_score_stays_inside_its_range_for_any_arrangement() {
    let (c, centre, half) = plot();
    let kinds = [
        "kitchen",
        "bedroom-master",
        "puja",
        "toilet",
        "living",
        "entry",
    ];
    for dx in [-4_000_000i64, 0, 4_000_000] {
        for dy in [-4_000_000i64, 0, 4_000_000] {
            let rooms: Vec<Room> = kinds
                .iter()
                .map(|k| Room {
                    kind: k,
                    name: k,
                    cx_um: dx,
                    cy_um: dy,
                })
                .collect();
            let a = assess(&rooms, c, centre, half, &rules());
            assert!(a.score <= 100, "{} at {dx},{dy}", a.score);
        }
    }
}

#[test]
fn the_ruleset_says_it_has_not_been_reviewed() {
    // The same promise the bylaws make. Vaastu needs it more, not less: it is not a code,
    // nobody enforces it, and its schools disagree.
    let r = rules();
    assert!(r.reviewed_by.is_none());
    let line = r.provenance_line();
    assert!(line.contains("NOT reviewed"), "{line}");
    assert!(line.contains("not a building code"), "{line}");
}

#[test]
fn this_crate_cannot_express_a_refusal() {
    // The PRD: Vaastu "never blocks generation". That is structural rather than
    // remembered — `tri-gen` is absent from this crate's dependencies, so nothing here can
    // name a `TemplateError` or a `SelectError`, and `assess` returns an `Assessment`
    // rather than a `Result`. This test guards the dependency, which is the load-bearing
    // half.
    let manifest = include_str!("../Cargo.toml");
    let deps = manifest.split("[dependencies]").nth(1).unwrap_or("");
    assert!(
        !deps.contains("tri-gen"),
        "tri-vaastu depends on tri-gen; it could then refuse a plan"
    );
    assert!(!deps.contains("tri-commit"), "{deps}");
}
