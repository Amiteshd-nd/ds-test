//! Deterministic document hashing.
//!
//! Required by M1: the same hash across process runs *and across compile targets*.
//! That rules out `#[derive(Hash)]` (SipHash keys vary), `HashMap` iteration, and any
//! serialisation format with implementation-defined ordering.
//!
//! Instead: an explicit canonical encoding fed to BLAKE3. Every value is written with a
//! domain-separation tag and a length prefix, so no two distinct documents can produce
//! the same byte stream by concatenation ambiguity. Everything written is an integer or
//! a byte string — there are no floats in document state (see `units`), so there is
//! nothing whose bit pattern can differ between wasm32 and x86_64.

use crate::component::{
    CanonicalValue, Component, ComponentKey, ComponentSet, Opening, Polyline2d, Solid3d, Transform,
    TypeDef, TypeRegistry, WallProfile,
};
use crate::layer::LayerTree;
use crate::provenance::{Provenance, Tracked};
use crate::source::{ImportRecord, SourceEntity, SourceSchema};
use crate::units::{Length, Point2};
use std::fmt;

/// A 32-byte content hash of a document.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct DocHash([u8; 32]);

impl DocHash {
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    pub fn to_hex(self) -> String {
        self.0.iter().map(|b| format!("{b:02x}")).collect()
    }
}

impl fmt::Debug for DocHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "DocHash({}…)", &self.to_hex()[..16])
    }
}

impl fmt::Display for DocHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_hex())
    }
}

/// Canonical encoder. Tags are arbitrary but must never be reused or renumbered —
/// changing one changes every hash in existence, which invalidates stored golden files.
pub struct Canonical {
    inner: blake3::Hasher,
}

impl Default for Canonical {
    fn default() -> Self {
        Self::new()
    }
}

impl Canonical {
    pub fn new() -> Self {
        Canonical {
            inner: blake3::Hasher::new(),
        }
    }

    pub fn finish(self) -> DocHash {
        DocHash(*self.inner.finalize().as_bytes())
    }

    pub fn tag(&mut self, t: u8) -> &mut Self {
        self.inner.update(&[t]);
        self
    }

    pub fn u64(&mut self, v: u64) -> &mut Self {
        self.inner.update(&v.to_le_bytes());
        self
    }

    pub fn i64(&mut self, v: i64) -> &mut Self {
        self.inner.update(&v.to_le_bytes());
        self
    }

    pub fn i32(&mut self, v: i32) -> &mut Self {
        self.inner.update(&v.to_le_bytes());
        self
    }

    pub fn u32(&mut self, v: u32) -> &mut Self {
        self.inner.update(&v.to_le_bytes());
        self
    }

    pub fn bool(&mut self, v: bool) -> &mut Self {
        self.inner.update(&[v as u8]);
        self
    }

    pub fn bytes(&mut self, v: &[u8]) -> &mut Self {
        self.u64(v.len() as u64);
        self.inner.update(v);
        self
    }

    pub fn str(&mut self, v: &str) -> &mut Self {
        self.bytes(v.as_bytes())
    }

    pub fn len(&mut self, n: usize) -> &mut Self {
        self.u64(n as u64)
    }
}

/// Types that contribute to the document hash.
pub trait CanonicalHash {
    fn hash_into(&self, c: &mut Canonical);
}

impl<T: CanonicalHash> CanonicalHash for Option<T> {
    fn hash_into(&self, c: &mut Canonical) {
        match self {
            None => {
                c.tag(0x00);
            }
            Some(v) => {
                c.tag(0x01);
                v.hash_into(c);
            }
        }
    }
}

impl<T: CanonicalHash> CanonicalHash for Vec<T> {
    fn hash_into(&self, c: &mut Canonical) {
        c.len(self.len());
        for v in self {
            v.hash_into(c);
        }
    }
}

impl CanonicalHash for String {
    fn hash_into(&self, c: &mut Canonical) {
        c.str(self);
    }
}

impl CanonicalHash for bool {
    fn hash_into(&self, c: &mut Canonical) {
        c.bool(*self);
    }
}

impl CanonicalHash for i64 {
    fn hash_into(&self, c: &mut Canonical) {
        c.i64(*self);
    }
}

impl CanonicalHash for Length {
    fn hash_into(&self, c: &mut Canonical) {
        c.i64(self.as_um());
    }
}

impl CanonicalHash for Point2 {
    fn hash_into(&self, c: &mut Canonical) {
        c.i64(self.x.as_um()).i64(self.y.as_um());
    }
}

impl CanonicalHash for Provenance {
    fn hash_into(&self, c: &mut Canonical) {
        c.tag(match self {
            Provenance::Measured => 0x10,
            Provenance::Inferred => 0x11,
            Provenance::Assumed => 0x12,
        });
    }
}

impl<T: CanonicalHash> CanonicalHash for Tracked<T> {
    fn hash_into(&self, c: &mut Canonical) {
        c.tag(0x20);
        self.value().hash_into(c);
        self.provenance().hash_into(c);
        c.str(self.reason());
    }
}

impl CanonicalHash for CanonicalValue {
    fn hash_into(&self, c: &mut Canonical) {
        match self {
            CanonicalValue::Null => {
                c.tag(0x30);
            }
            CanonicalValue::Bool(b) => {
                c.tag(0x31).bool(*b);
            }
            CanonicalValue::Int(i) => {
                c.tag(0x32).i64(*i);
            }
            CanonicalValue::Length(l) => {
                c.tag(0x33).i64(l.as_um());
            }
            CanonicalValue::Text(s) => {
                c.tag(0x34).str(s);
            }
            CanonicalValue::List(v) => {
                c.tag(0x35);
                v.hash_into(c);
            }
            CanonicalValue::Map(m) => {
                c.tag(0x36).len(m.len());
                // BTreeMap iterates in key order — this is why it is a BTreeMap.
                for (k, v) in m {
                    c.str(k);
                    v.hash_into(c);
                }
            }
        }
    }
}

impl CanonicalHash for Transform {
    fn hash_into(&self, c: &mut Canonical) {
        self.translation.hash_into(c);
        c.i32(self.rotation_mdeg).i64(self.scale_ppm);
    }
}

impl CanonicalHash for Polyline2d {
    fn hash_into(&self, c: &mut Canonical) {
        self.points.hash_into(c);
        c.bool(self.closed);
    }
}

impl CanonicalHash for WallProfile {
    fn hash_into(&self, c: &mut Canonical) {
        self.centreline.hash_into(c);
        self.thickness.hash_into(c);
        self.height.hash_into(c);
        self.base_elevation.hash_into(c);
    }
}

impl CanonicalHash for Opening {
    fn hash_into(&self, c: &mut Canonical) {
        c.u64(self.host.raw());
        c.tag(match self.kind {
            crate::component::OpeningKind::Door => 0x40,
            crate::component::OpeningKind::Window => 0x41,
            crate::component::OpeningKind::Passage => 0x42,
        });
        self.position.hash_into(c);
        self.width.hash_into(c);
        self.height.hash_into(c);
        self.sill.hash_into(c);
    }
}

impl CanonicalHash for Solid3d {
    fn hash_into(&self, c: &mut Canonical) {
        c.len(self.positions.len());
        for p in &self.positions {
            c.i64(p[0]).i64(p[1]).i64(p[2]);
        }
        c.len(self.indices.len());
        for i in &self.indices {
            c.u32(*i);
        }
    }
}

impl CanonicalHash for ComponentKey {
    fn hash_into(&self, c: &mut Canonical) {
        match self {
            ComponentKey::Transform => c.tag(0x50),
            ComponentKey::Polyline2d => c.tag(0x51),
            ComponentKey::WallProfile => c.tag(0x52),
            ComponentKey::Opening => c.tag(0x53),
            ComponentKey::Solid3d => c.tag(0x54),
            ComponentKey::LayerRef => c.tag(0x55),
            ComponentKey::SourceRef => c.tag(0x56),
            ComponentKey::Provenance => c.tag(0x57),
            ComponentKey::Label => c.tag(0x58),
            ComponentKey::Custom(name) => c.tag(0x59).str(name),
        };
    }
}

impl CanonicalHash for Component {
    fn hash_into(&self, c: &mut Canonical) {
        self.key().hash_into(c);
        match self {
            Component::Transform(t) => t.hash_into(c),
            Component::Polyline2d(p) => p.hash_into(c),
            Component::WallProfile(w) => w.hash_into(c),
            Component::Opening(o) => o.hash_into(c),
            Component::Solid3d(s) => s.hash_into(c),
            Component::LayerRef(l) => {
                c.u64(l.raw());
            }
            Component::SourceRef(ids) => {
                c.len(ids.len());
                for id in ids {
                    c.u64(id.raw());
                }
            }
            Component::Provenance { provenance, reason } => {
                provenance.hash_into(c);
                c.str(reason);
            }
            Component::Label(s) => {
                c.str(s);
            }
            Component::Custom { type_name, data } => {
                c.str(type_name).len(data.len());
                for (k, v) in data {
                    c.str(k);
                    v.hash_into(c);
                }
            }
        }
    }
}

impl CanonicalHash for ComponentSet {
    fn hash_into(&self, c: &mut Canonical) {
        c.len(self.len());
        for (_, comp) in self.iter() {
            comp.hash_into(c);
        }
    }
}

impl CanonicalHash for LayerTree {
    fn hash_into(&self, c: &mut Canonical) {
        c.len(self.len());
        for (id, layer) in self.iter() {
            c.u64(id.raw()).str(&layer.name);
            layer.parent.map(|p| p.raw()).hash_into(c);
            c.bool(layer.visible).bytes(&layer.color);
        }
    }
}

impl CanonicalHash for u64 {
    fn hash_into(&self, c: &mut Canonical) {
        c.u64(*self);
    }
}

impl CanonicalHash for TypeDef {
    fn hash_into(&self, c: &mut Canonical) {
        c.str(&self.name).len(self.fields.len());
        for (k, required) in &self.fields {
            c.str(k).bool(*required);
        }
    }
}

impl CanonicalHash for TypeRegistry {
    fn hash_into(&self, c: &mut Canonical) {
        c.len(self.iter().count());
        for (_, def) in self.iter() {
            def.hash_into(c);
        }
    }
}

impl CanonicalHash for SourceEntity {
    fn hash_into(&self, c: &mut Canonical) {
        c.str(&self.kind).str(&self.layer);
        self.handle.clone().hash_into(c);
        c.len(self.attributes.len());
        for (k, v) in &self.attributes {
            c.str(k);
            v.hash_into(c);
        }
    }
}

impl CanonicalHash for ImportRecord {
    fn hash_into(&self, c: &mut Canonical) {
        c.str(&self.file_name).str(&self.format);
        self.unit_scale.hash_into(c);
        c.u64(self.entity_count as u64);
    }
}

impl CanonicalHash for SourceSchema {
    fn hash_into(&self, c: &mut Canonical) {
        c.len(self.len());
        for (id, e) in self.iter() {
            c.u64(id.raw());
            e.hash_into(c);
        }
        self.imports.hash_into(c);
    }
}

// ---- ops ------------------------------------------------------------------
// Needed by `tri-commit` to content-address a commit. Kept here so that the tag
// numbering stays in one place and cannot be duplicated by accident.

impl CanonicalHash for crate::layer::Layer {
    fn hash_into(&self, c: &mut Canonical) {
        c.str(&self.name);
        self.parent.map(|p| p.raw()).hash_into(c);
        c.bool(self.visible).bytes(&self.color);
    }
}

impl CanonicalHash for crate::op::Op {
    fn hash_into(&self, c: &mut Canonical) {
        use crate::op::Op;
        match self {
            Op::CreateEntity { components } => {
                c.tag(0x60);
                components.hash_into(c);
            }
            Op::DeleteEntity { id } => {
                c.tag(0x61).u64(id.raw());
            }
            Op::SetComponent { id, component } => {
                c.tag(0x62).u64(id.raw());
                component.hash_into(c);
            }
            Op::RemoveComponent { id, key } => {
                c.tag(0x63).u64(id.raw());
                key.hash_into(c);
            }
            Op::CreateLayer { layer } => {
                c.tag(0x64);
                layer.hash_into(c);
            }
            Op::ReparentLayer { id, new_parent } => {
                c.tag(0x65).u64(id.raw());
                new_parent.map(|p| p.raw()).hash_into(c);
            }
            Op::RenameLayer { id, name } => {
                c.tag(0x66).u64(id.raw()).str(name);
            }
            Op::SetLayerVisible { id, visible } => {
                c.tag(0x67).u64(id.raw()).bool(*visible);
            }
            Op::DeleteLayer { id } => {
                c.tag(0x68).u64(id.raw());
            }
            Op::RegisterType { def } => {
                c.tag(0x69);
                def.hash_into(c);
            }
            Op::AddSourceEntity { entity } => {
                c.tag(0x6A);
                entity.hash_into(c);
            }
            Op::RecordImport { record } => {
                c.tag(0x6B);
                record.hash_into(c);
            }
            Op::SetFormatVersion { version } => {
                c.tag(0x6C).u32(*version);
            }
        }
    }
}
