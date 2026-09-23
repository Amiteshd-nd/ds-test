//! Round-tripping the parameter set through a document component.
//!
//! The set is stored as a [`Component::Custom`] entry via the type registry, which is
//! how PRD §4.3 says to extend the model: "add via the registry, not via new enum
//! variants in `doc`". That keeps floor-plan vocabulary out of the general document
//! crate — `doc` should not know what a setback is.
//!
//! Each field is written as a [`CanonicalValue::Tracked`], so the provenance the typed
//! struct carries survives storage and is visible to `provenance_records`, the query
//! layer and the compliance panel without any of them knowing about this crate.

use crate::layers::LayerScheme;
use crate::set::{DoorSize, Orientation, ParameterSet, ParamsError};
use crate::units::Units;
use std::collections::BTreeMap;
use tri_doc::component::{CanonicalValue, Component, ComponentKey, TypeDef};
use tri_doc::{Document, EntityId, Length, Provenance, Tracked};

pub const TYPE_NAME: &str = "ParameterSet";

/// The registry entry. Required fields are the tier 1 ones — a set missing those is not
/// an incomplete brief, it is not a brief.
pub fn type_definition() -> TypeDef {
    let required = [
        "plot_width",
        "plot_depth",
        "road_facing",
        "bedrooms",
        "floors",
        "car_parking",
    ];
    TypeDef {
        name: TYPE_NAME.to_string(),
        fields: required.iter().map(|f| (f.to_string(), true)).collect(),
    }
}

fn wrap<T>(t: &Tracked<T>, value: CanonicalValue) -> CanonicalValue {
    CanonicalValue::tracked(value, t.provenance(), t.reason())
}

fn len(v: Length) -> CanonicalValue {
    CanonicalValue::Length(v)
}

fn int(v: i64) -> CanonicalValue {
    CanonicalValue::Int(v)
}

fn door(d: DoorSize) -> CanonicalValue {
    CanonicalValue::Map(BTreeMap::from([
        ("width".to_string(), len(d.width)),
        ("height".to_string(), len(d.height)),
    ]))
}

/// Typed set → document component.
pub fn to_component(p: &ParameterSet) -> Component {
    let mut data: BTreeMap<String, CanonicalValue> = BTreeMap::new();
    let mut put = |k: &str, v: CanonicalValue| {
        data.insert(k.to_string(), v);
    };

    put("plot_width", wrap(&p.plot_width, len(p.plot_width.get())));
    put("plot_depth", wrap(&p.plot_depth, len(p.plot_depth.get())));
    put(
        "road_facing",
        wrap(
            &p.road_facing,
            CanonicalValue::Text(p.road_facing.get().as_str().to_string()),
        ),
    );
    put(
        "north_angle_mdeg",
        wrap(&p.north_angle_mdeg, int(p.north_angle_mdeg.get() as i64)),
    );
    put(
        "road_width_mm",
        wrap(&p.road_width_mm, len(p.road_width_mm.get())),
    );
    put("bedrooms", wrap(&p.bedrooms, int(p.bedrooms.get() as i64)));
    put("floors", wrap(&p.floors, int(p.floors.get() as i64)));
    put(
        "car_parking",
        wrap(&p.car_parking, int(p.car_parking.get() as i64)),
    );

    put(
        "far_permitted_x1000",
        wrap(&p.far_permitted_x1000, int(p.far_permitted_x1000.get())),
    );
    put(
        "built_up_permitted_mm2",
        wrap(
            &p.built_up_permitted_mm2,
            int(p.built_up_permitted_mm2.get()),
        ),
    );
    put(
        "ground_coverage_permitted_x100",
        wrap(
            &p.ground_coverage_permitted_x100,
            int(p.ground_coverage_permitted_x100.get()),
        ),
    );
    put(
        "setback_front",
        wrap(&p.setback_front, len(p.setback_front.get())),
    );
    put(
        "setback_rear",
        wrap(&p.setback_rear, len(p.setback_rear.get())),
    );
    put(
        "setback_left",
        wrap(&p.setback_left, len(p.setback_left.get())),
    );
    put(
        "setback_right",
        wrap(&p.setback_right, len(p.setback_right.get())),
    );
    put("toilets", wrap(&p.toilets, int(p.toilets.get() as i64)));
    put(
        "staircase_footprint_mm2",
        wrap(
            &p.staircase_footprint_mm2,
            int(p.staircase_footprint_mm2.get()),
        ),
    );
    put(
        "overhead_tank_litres",
        wrap(&p.overhead_tank_litres, int(p.overhead_tank_litres.get())),
    );
    put(
        "sump_litres",
        wrap(&p.sump_litres, int(p.sump_litres.get())),
    );

    put(
        "entry_units",
        wrap(
            &p.entry_units,
            CanonicalValue::Text(p.entry_units.get().suffix().to_string()),
        ),
    );
    for (key, t) in [
        ("all_bedrooms_attached", &p.all_bedrooms_attached),
        ("include_puja", &p.include_puja),
        ("include_balcony", &p.include_balcony),
        ("closed_kitchen", &p.closed_kitchen),
        ("vaastu", &p.vaastu),
    ] {
        put(key, wrap(t, CanonicalValue::Bool(t.get())));
    }
    put(
        "balcony_depth",
        wrap(&p.balcony_depth, len(p.balcony_depth.get())),
    );
    put(
        "two_wheeler_slots",
        wrap(&p.two_wheeler_slots, int(p.two_wheeler_slots.get() as i64)),
    );
    {
        let l = p.layers.value();
        let names = [
            ("walls", &l.walls),
            ("wall_hatch", &l.wall_hatch),
            ("doors", &l.doors),
            ("windows", &l.windows),
            ("dimensions", &l.dimensions),
            ("text", &l.text),
            ("furniture", &l.furniture),
            ("grid", &l.grid),
        ];
        put(
            "layers",
            wrap(
                &p.layers,
                CanonicalValue::Map(
                    names
                        .iter()
                        .map(|(k, v)| (k.to_string(), CanonicalValue::Text((*v).clone())))
                        .collect(),
                ),
            ),
        );
    }

    put(
        "external_wall",
        wrap(&p.external_wall, len(p.external_wall.get())),
    );
    put(
        "internal_wall",
        wrap(&p.internal_wall, len(p.internal_wall.get())),
    );
    put(
        "floor_to_floor",
        wrap(&p.floor_to_floor, len(p.floor_to_floor.get())),
    );
    put("main_door", wrap(&p.main_door, door(p.main_door.get())));
    put(
        "internal_door",
        wrap(&p.internal_door, door(p.internal_door.get())),
    );
    put(
        "toilet_door",
        wrap(&p.toilet_door, door(p.toilet_door.get())),
    );

    Component::Custom {
        type_name: TYPE_NAME.to_string(),
        data,
    }
}

struct Reader<'a>(&'a BTreeMap<String, CanonicalValue>);

impl Reader<'_> {
    fn raw(&self, k: &str) -> Result<&CanonicalValue, ParamsError> {
        self.0
            .get(k)
            .ok_or_else(|| ParamsError::Missing(k.to_string()))
    }

    /// The provenance and reason a stored field carries.
    ///
    /// Absent provenance is an error rather than a default. A field that arrived without
    /// one has lost the only thing that makes it reviewable, and silently calling it
    /// `Assumed` would manufacture a record nobody wrote.
    fn meta(&self, k: &str) -> Result<(Provenance, String), ParamsError> {
        match self.raw(k)? {
            CanonicalValue::Tracked {
                provenance, reason, ..
            } => Ok((*provenance, reason.clone())),
            _ => Err(ParamsError::Malformed {
                field: k.to_string(),
                message: "stored without provenance".into(),
            }),
        }
    }

    fn length(&self, k: &str) -> Result<Tracked<Length>, ParamsError> {
        let (p, r) = self.meta(k)?;
        let v = self
            .raw(k)?
            .as_length()
            .ok_or_else(|| ParamsError::Malformed {
                field: k.to_string(),
                message: "expected a length".into(),
            })?;
        Ok(rebuild(v, p, r))
    }

    fn int<T: TryFrom<i64>>(&self, k: &str) -> Result<Tracked<T>, ParamsError> {
        let (p, r) = self.meta(k)?;
        let v = self
            .raw(k)?
            .as_i64()
            .ok_or_else(|| ParamsError::Malformed {
                field: k.to_string(),
                message: "expected an integer".into(),
            })?;
        let v = T::try_from(v).map_err(|_| ParamsError::Malformed {
            field: k.to_string(),
            message: format!("{v} is out of range for this field"),
        })?;
        Ok(rebuild(v, p, r))
    }

    fn orientation(&self, k: &str) -> Result<Tracked<Orientation>, ParamsError> {
        let (p, r) = self.meta(k)?;
        let text = self
            .raw(k)?
            .as_text()
            .ok_or_else(|| ParamsError::Malformed {
                field: k.to_string(),
                message: "expected a compass direction".into(),
            })?;
        let v = Orientation::parse(text).ok_or_else(|| ParamsError::Malformed {
            field: k.to_string(),
            message: format!("{text:?} is not one of north, south, east, west"),
        })?;
        Ok(rebuild(v, p, r))
    }

    fn boolean(&self, k: &str) -> Result<Tracked<bool>, ParamsError> {
        let (p, r) = self.meta(k)?;
        let v = self
            .raw(k)?
            .as_bool()
            .ok_or_else(|| ParamsError::Malformed {
                field: k.to_string(),
                message: "expected true or false".into(),
            })?;
        Ok(rebuild(v, p, r))
    }

    fn units(&self, k: &str) -> Result<Tracked<Units>, ParamsError> {
        let (p, r) = self.meta(k)?;
        let text = self
            .raw(k)?
            .as_text()
            .ok_or_else(|| ParamsError::Malformed {
                field: k.to_string(),
                message: "expected a unit suffix".into(),
            })?;
        let v = Units::parse(text).ok_or_else(|| ParamsError::Malformed {
            field: k.to_string(),
            message: format!("{text:?} is not a unit this tool knows"),
        })?;
        Ok(rebuild(v, p, r))
    }

    fn layers(&self, k: &str) -> Result<Tracked<LayerScheme>, ParamsError> {
        let (p, r) = self.meta(k)?;
        let bad = |m: String| ParamsError::Malformed {
            field: k.to_string(),
            message: m,
        };
        let CanonicalValue::Map(m) = self.raw(k)?.bare() else {
            return Err(bad("expected a map of layer names".into()));
        };
        let pick = |name: &str| -> Result<String, ParamsError> {
            m.get(name)
                .and_then(|v| v.as_text())
                .map(str::to_owned)
                .ok_or_else(|| bad(format!("missing the {name} layer")))
        };
        Ok(rebuild(
            LayerScheme {
                walls: pick("walls")?,
                wall_hatch: pick("wall_hatch")?,
                doors: pick("doors")?,
                windows: pick("windows")?,
                dimensions: pick("dimensions")?,
                text: pick("text")?,
                furniture: pick("furniture")?,
                grid: pick("grid")?,
            },
            p,
            r,
        ))
    }

    fn door(&self, k: &str) -> Result<Tracked<DoorSize>, ParamsError> {
        let (p, r) = self.meta(k)?;
        let bad = |m: &str| ParamsError::Malformed {
            field: k.to_string(),
            message: m.to_string(),
        };
        let CanonicalValue::Map(m) = self.raw(k)?.bare() else {
            return Err(bad("expected a width and height"));
        };
        let width = m
            .get("width")
            .and_then(|v| v.as_length())
            .ok_or_else(|| bad("missing width"))?;
        let height = m
            .get("height")
            .and_then(|v| v.as_length())
            .ok_or_else(|| bad("missing height"))?;
        Ok(rebuild(DoorSize { width, height }, p, r))
    }
}

fn rebuild<T>(value: T, p: Provenance, reason: String) -> Tracked<T> {
    match p {
        Provenance::Measured => Tracked::measured(value, reason),
        Provenance::Inferred => Tracked::inferred(value, reason),
        Provenance::Assumed => Tracked::assumed(value, reason),
    }
}

/// Document component → typed set.
pub fn from_component(c: &Component) -> Result<ParameterSet, ParamsError> {
    let Component::Custom { type_name, data } = c else {
        return Err(ParamsError::Malformed {
            field: "component".into(),
            message: "not a custom component".into(),
        });
    };
    if type_name != TYPE_NAME {
        return Err(ParamsError::Malformed {
            field: "component".into(),
            message: format!("expected {TYPE_NAME}, got {type_name}"),
        });
    }
    let r = Reader(data);

    Ok(ParameterSet {
        plot_width: r.length("plot_width")?,
        plot_depth: r.length("plot_depth")?,
        road_facing: r.orientation("road_facing")?,
        north_angle_mdeg: r.int("north_angle_mdeg")?,
        road_width_mm: r.length("road_width_mm")?,
        bedrooms: r.int("bedrooms")?,
        floors: r.int("floors")?,
        car_parking: r.int("car_parking")?,

        far_permitted_x1000: r.int("far_permitted_x1000")?,
        built_up_permitted_mm2: r.int("built_up_permitted_mm2")?,
        ground_coverage_permitted_x100: r.int("ground_coverage_permitted_x100")?,
        setback_front: r.length("setback_front")?,
        setback_rear: r.length("setback_rear")?,
        setback_left: r.length("setback_left")?,
        setback_right: r.length("setback_right")?,
        toilets: r.int("toilets")?,
        staircase_footprint_mm2: r.int("staircase_footprint_mm2")?,
        overhead_tank_litres: r.int("overhead_tank_litres")?,
        sump_litres: r.int("sump_litres")?,

        entry_units: r.units("entry_units")?,
        all_bedrooms_attached: r.boolean("all_bedrooms_attached")?,
        include_puja: r.boolean("include_puja")?,
        include_balcony: r.boolean("include_balcony")?,
        closed_kitchen: r.boolean("closed_kitchen")?,
        vaastu: r.boolean("vaastu")?,
        balcony_depth: r.length("balcony_depth")?,
        two_wheeler_slots: r.int("two_wheeler_slots")?,
        layers: r.layers("layers")?,

        external_wall: r.length("external_wall")?,
        internal_wall: r.length("internal_wall")?,
        floor_to_floor: r.length("floor_to_floor")?,
        main_door: r.door("main_door")?,
        internal_door: r.door("internal_door")?,
        toilet_door: r.door("toilet_door")?,
    })
}

/// The single parameter set on a document, if it has one.
pub fn find(doc: &Document) -> Option<(EntityId, ParameterSet)> {
    let key = ComponentKey::Custom(TYPE_NAME.to_string());
    doc.iter_with(key.clone()).find_map(|(id, set)| {
        let c = set.get(&key)?;
        from_component(c).ok().map(|p| (id, p))
    })
}
