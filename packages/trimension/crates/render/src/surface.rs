//! The two surfaces behind one API (invariant **I6**).
//!
//! Both variants drive the identical pipeline, shader and scene data. The only thing
//! that differs is where the colour attachment comes from: a swapchain texture owned by
//! a canvas, or an offscreen texture we allocate ourselves and read back.
//!
//! A headless render needs no window, no canvas, no display server and no browser. That
//! is what lets an agent's `render_view` tool see what it made (PRD §4.7) and what the
//! CI parity test asserts.

use crate::scene::Scene;

/// A rendered image. Row-major RGBA8, top-left origin.
#[derive(Clone, PartialEq, Eq)]
pub struct Rgba8Image {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

impl std::fmt::Debug for Rgba8Image {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Rgba8Image({}x{}, {} bytes)",
            self.width,
            self.height,
            self.pixels.len()
        )
    }
}

impl Rgba8Image {
    pub fn pixel(&self, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * self.width + x) * 4) as usize;
        self.pixels
            .get(i..i + 4)
            .map(|s| [s[0], s[1], s[2], s[3]])
            .unwrap_or([0; 4])
    }

    /// Fraction of pixels differing by more than `per_channel`. The parity test uses
    /// this, but see `scene` module docs on why it is the weaker of the two checks.
    pub fn difference(&self, other: &Rgba8Image, per_channel: u8) -> f32 {
        if self.width != other.width || self.height != other.height {
            return 1.0;
        }
        let differing = self
            .pixels
            .chunks(4)
            .zip(other.pixels.chunks(4))
            .filter(|(a, b)| {
                a.iter()
                    .zip(b.iter())
                    .any(|(x, y)| x.abs_diff(*y) > per_channel)
            })
            .count();
        differing as f32 / (self.width * self.height).max(1) as f32
    }

    /// How much of the image is not the background colour — a cheap "did anything
    /// actually draw" check that does not depend on exact pixel values.
    pub fn ink_fraction(&self, background: [u8; 4], tolerance: u8) -> f32 {
        let inked = self
            .pixels
            .chunks(4)
            .filter(|p| {
                p.iter()
                    .zip(background.iter())
                    .any(|(x, y)| x.abs_diff(*y) > tolerance)
            })
            .count();
        inked as f32 / (self.width * self.height).max(1) as f32
    }

    pub fn to_png(&self) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, self.width, self.height);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            let mut w = enc.write_header().expect("png header");
            w.write_image_data(&self.pixels).expect("png data");
        }
        out
    }

    pub fn from_png(bytes: &[u8]) -> Option<Rgba8Image> {
        let decoder = png::Decoder::new(std::io::Cursor::new(bytes));
        let mut reader = decoder.read_info().ok()?;
        let mut buf = vec![0; reader.output_buffer_size()?];
        let info = reader.next_frame(&mut buf).ok()?;
        buf.truncate(info.buffer_size());
        Some(Rgba8Image {
            width: info.width,
            height: info.height,
            pixels: buf,
        })
    }
}

/// Where a frame is drawn.
pub enum Target<'w> {
    /// Offscreen texture, read back to CPU. No window, no display server.
    Headless { width: u32, height: u32 },
    /// A canvas-backed swapchain. The browser path.
    Surface {
        surface: &'w wgpu::Surface<'w>,
        width: u32,
        height: u32,
    },
}

impl Target<'_> {
    pub fn size(&self) -> (u32, u32) {
        match self {
            Target::Headless { width, height } | Target::Surface { width, height, .. } => {
                (*width, *height)
            }
        }
    }

    pub fn is_headless(&self) -> bool {
        matches!(self, Target::Headless { .. })
    }
}

/// Draw data plus the target it goes to. Kept as a struct so that adding a target does
/// not change any signature in `view`.
pub struct Frame<'a, 'w> {
    pub scene: &'a Scene,
    pub target: Target<'w>,
}
