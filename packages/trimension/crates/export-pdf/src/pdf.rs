//! A minimal PDF writer: vector paths and base-14 Helvetica, nothing else.
//!
//! # Why by hand
//! See the note in `Cargo.toml`. The short version is that a plan sheet needs no images,
//! no embedded fonts and no compression, and every coordinate on the page has to be one
//! this crate put there.
//!
//! # The format, briefly
//! A PDF is a list of numbered objects, a cross-reference table giving each one's **byte
//! offset** from the start of the file, and a trailer pointing at the table. The byte
//! offsets are the only part that is easy to get wrong and impossible to see: a viewer
//! given a table that is one byte out will either repair the file silently or refuse it
//! with no useful message. So offsets are recorded as the bytes are written, never
//! computed afterwards.
//!
//! Units are PostScript points, 1/72 inch, with the origin at the bottom-left of the page.

use std::fmt::Write as _;

/// One page being built.
pub struct Page {
    pub width_pt: f64,
    pub height_pt: f64,
    content: String,
}

/// Millimetres to points. Everything a caller gives is in millimetres of paper.
pub fn mm(v: f64) -> f64 {
    v * 72.0 / 25.4
}

impl Page {
    pub fn new(width_mm: f64, height_mm: f64) -> Page {
        Page {
            width_pt: mm(width_mm),
            height_pt: mm(height_mm),
            content: String::new(),
        }
    }

    /// Set the stroke colour and line width. Width is in millimetres of paper, because
    /// that is how a drafter specifies a pen.
    pub fn pen(&mut self, rgb: [f64; 3], width_mm: f64) -> &mut Self {
        let _ = writeln!(
            self.content,
            "{:.3} {:.3} {:.3} RG {:.3} w",
            rgb[0],
            rgb[1],
            rgb[2],
            mm(width_mm)
        );
        self
    }

    /// A polyline through points given in millimetres of paper.
    pub fn polyline(&mut self, pts: &[(f64, f64)], close: bool) -> &mut Self {
        let Some(first) = pts.first() else {
            return self;
        };
        let _ = writeln!(self.content, "{:.3} {:.3} m", mm(first.0), mm(first.1));
        for p in &pts[1..] {
            let _ = writeln!(self.content, "{:.3} {:.3} l", mm(p.0), mm(p.1));
        }
        self.content.push_str(if close { "s\n" } else { "S\n" });
        self
    }

    pub fn line(&mut self, a: (f64, f64), b: (f64, f64)) -> &mut Self {
        self.polyline(&[a, b], false)
    }

    pub fn rect(&mut self, x: f64, y: f64, w: f64, h: f64) -> &mut Self {
        let _ = writeln!(
            self.content,
            "{:.3} {:.3} {:.3} {:.3} re S",
            mm(x),
            mm(y),
            mm(w),
            mm(h)
        );
        self
    }

    /// Text at a point, with a cap height in millimetres of paper.
    ///
    /// Helvetica is one of the fourteen fonts every reader is required to have, so nothing
    /// is embedded and the file opens the same everywhere.
    pub fn text(&mut self, x: f64, y: f64, height_mm: f64, s: &str) -> &mut Self {
        let _ = writeln!(
            self.content,
            "BT /F1 {:.2} Tf {:.3} {:.3} Td ({}) Tj ET",
            mm(height_mm),
            mm(x),
            mm(y),
            escape(s)
        );
        self
    }

    /// Right-aligned text, using Helvetica's own widths so the alignment is real rather
    /// than a guess at an average character.
    pub fn text_right(&mut self, x: f64, y: f64, height_mm: f64, s: &str) -> &mut Self {
        let w = text_width_mm(s, height_mm);
        self.text(x - w, y, height_mm, s)
    }

    pub fn text_centred(&mut self, x: f64, y: f64, height_mm: f64, s: &str) -> &mut Self {
        let w = text_width_mm(s, height_mm);
        self.text(x - w / 2.0, y, height_mm, s)
    }
}

/// Width of a string set in Helvetica, in millimetres.
///
/// Helvetica's advance widths are per-glyph and the real table is 256 entries. This is the
/// average over the printable ASCII range at 0.5 em, plus the handful that are visibly
/// different — enough to centre a label without it looking hand-placed, and honest about
/// being an approximation rather than pretending to metric accuracy.
pub fn text_width_mm(s: &str, height_mm: f64) -> f64 {
    let em: f64 = s
        .chars()
        .map(|c| match c {
            'i' | 'j' | 'l' | '.' | ',' | '\'' | '|' | ' ' if c == ' ' => 0.278,
            'i' | 'j' | 'l' | '.' | ',' | '\'' | '|' => 0.222,
            'f' | 't' | 'r' | '(' | ')' | '/' => 0.278,
            'm' | 'M' | 'W' | 'w' => 0.833,
            'A'..='Z' => 0.667,
            '0'..='9' => 0.556,
            _ => 0.5,
        })
        .sum();
    em * height_mm
}

fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '(' | ')' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            // PDF string literals are bytes. Anything outside Latin-1 is transliterated
            // rather than emitted raw, which would produce a viewer-dependent mess. The
            // one that actually turns up is the superscript two in m².
            '²' => out.push('2'),
            '·' => out.push('-'),
            '—' | '–' => out.push('-'),
            c if (c as u32) < 128 => out.push(c),
            _ => out.push('?'),
        }
    }
    out
}

/// Assemble the pages into a PDF file.
pub fn document(pages: &[Page], title: &str) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    // Offsets are recorded as bytes are written. Computing them afterwards is the one
    // mistake a viewer will not tell you about.
    let mut offsets: Vec<usize> = Vec::new();
    let push = |out: &mut Vec<u8>, offsets: &mut Vec<usize>, body: &str| {
        offsets.push(out.len());
        out.extend_from_slice(body.as_bytes());
    };

    out.extend_from_slice(b"%PDF-1.4\n");
    // A binary comment, so tools that sniff text-versus-binary treat this as binary and
    // do not helpfully convert the line endings.
    out.extend_from_slice(b"%\xE2\xE3\xCF\xD3\n");

    // 1: catalog. 2: pages. 3: font. Then two objects per page.
    let page_ids: Vec<usize> = (0..pages.len()).map(|i| 4 + i * 2).collect();
    let kids: String = page_ids
        .iter()
        .map(|id| format!("{id} 0 R"))
        .collect::<Vec<_>>()
        .join(" ");

    push(
        &mut out,
        &mut offsets,
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    );
    push(
        &mut out,
        &mut offsets,
        &format!(
            "2 0 obj\n<< /Type /Pages /Count {} /Kids [{kids}] >>\nendobj\n",
            pages.len()
        ),
    );
    push(
        &mut out,
        &mut offsets,
        "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica \
         /Encoding /WinAnsiEncoding >>\nendobj\n",
    );

    for (i, page) in pages.iter().enumerate() {
        let id = page_ids[i];
        push(
            &mut out,
            &mut offsets,
            &format!(
                "{id} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.3} {:.3}] \
                 /Resources << /Font << /F1 3 0 R >> >> /Contents {} 0 R >>\nendobj\n",
                page.width_pt,
                page.height_pt,
                id + 1
            ),
        );
        push(
            &mut out,
            &mut offsets,
            &format!(
                "{} 0 obj\n<< /Length {} >>\nstream\n{}endstream\nendobj\n",
                id + 1,
                page.content.len(),
                page.content
            ),
        );
    }

    let info_id = 4 + pages.len() * 2;
    push(
        &mut out,
        &mut offsets,
        &format!(
            "{info_id} 0 obj\n<< /Title ({}) /Producer (trimension) >>\nendobj\n",
            escape(title)
        ),
    );

    let xref_at = out.len();
    let count = offsets.len() + 1;
    let mut xref = format!("xref\n0 {count}\n0000000000 65535 f \n");
    for off in &offsets {
        // Exactly twenty bytes per entry, which the spec requires and some readers
        // enforce: ten digits, a space, five digits, a space, `n`, a space, a newline.
        let _ = writeln!(xref, "{off:010} 00000 n ");
    }
    let _ = write!(
        xref,
        "trailer\n<< /Size {count} /Root 1 0 R /Info {info_id} 0 R >>\n\
         startxref\n{xref_at}\n%%EOF\n"
    );
    out.extend_from_slice(xref.as_bytes());
    out
}
