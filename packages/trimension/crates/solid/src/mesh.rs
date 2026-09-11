//! Triangle meshes in exact integer coordinates.

use tri_doc::component::Solid3d;

/// A mesh in document µm. Integers all the way to the renderer, for the reason in
/// `tri_doc::units`: a mesh built on wasm32 and the same mesh built on the server must
/// be bit-identical, and the moment a float enters the pipeline that stops being true.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Mesh {
    pub positions: Vec<[i64; 3]>,
    pub indices: Vec<u32>,
}

impl Mesh {
    pub fn is_empty(&self) -> bool {
        self.indices.is_empty()
    }

    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    pub fn vertex(&mut self, p: [i64; 3]) -> u32 {
        // Deduplicating vertices keeps the buffer small and, more importantly, makes the
        // output canonical: the same solid always produces the same index list.
        if let Some(i) = self.positions.iter().position(|q| *q == p) {
            return i as u32;
        }
        self.positions.push(p);
        (self.positions.len() - 1) as u32
    }

    pub fn triangle(&mut self, a: [i64; 3], b: [i64; 3], c: [i64; 3]) {
        let (ia, ib, ic) = (self.vertex(a), self.vertex(b), self.vertex(c));
        if ia == ib || ib == ic || ia == ic {
            return; // degenerate
        }
        self.indices.extend([ia, ib, ic]);
    }

    /// Two triangles, wound counter-clockwise when seen from the front.
    pub fn quad(&mut self, a: [i64; 3], b: [i64; 3], c: [i64; 3], d: [i64; 3]) {
        self.triangle(a, b, c);
        self.triangle(a, c, d);
    }

    pub fn extend(&mut self, other: &Mesh) {
        for tri in other.indices.chunks(3) {
            if tri.len() == 3 {
                self.triangle(
                    other.positions[tri[0] as usize],
                    other.positions[tri[1] as usize],
                    other.positions[tri[2] as usize],
                );
            }
        }
    }

    /// Signed volume × 6, in µm³. Exact. Positive for a closed, outward-wound solid — so
    /// this doubles as a closure check.
    pub fn signed_volume_6x(&self) -> i128 {
        self.indices
            .chunks(3)
            .filter(|t| t.len() == 3)
            .map(|t| {
                let a = self.positions[t[0] as usize];
                let b = self.positions[t[1] as usize];
                let c = self.positions[t[2] as usize];
                let (a, b, c) = (
                    [a[0] as i128, a[1] as i128, a[2] as i128],
                    [b[0] as i128, b[1] as i128, b[2] as i128],
                    [c[0] as i128, c[1] as i128, c[2] as i128],
                );
                a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
                    + a[2] * (b[0] * c[1] - b[1] * c[0])
            })
            .sum()
    }

    pub fn volume_m3(&self) -> f64 {
        (self.signed_volume_6x().abs() as f64 / 6.0) / 1e18
    }

    /// Every edge appears exactly twice in a closed manifold, once in each direction.
    /// Cheap, exact, and it catches the failure mode that matters — a boolean that left
    /// a hole.
    pub fn is_closed(&self) -> bool {
        let mut edges: std::collections::BTreeMap<(u32, u32), i32> = Default::default();
        for t in self.indices.chunks(3) {
            if t.len() < 3 {
                return false;
            }
            for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
                let key = (a.min(b), a.max(b));
                *edges.entry(key).or_insert(0) += if a < b { 1 } else { -1 };
            }
        }
        edges.values().all(|v| *v == 0)
    }

    pub fn to_component(&self) -> Solid3d {
        Solid3d {
            positions: self.positions.clone(),
            indices: self.indices.clone(),
        }
    }
}
