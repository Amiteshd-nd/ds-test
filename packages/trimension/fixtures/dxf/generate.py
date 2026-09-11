#!/usr/bin/env python3
"""Generate the M2 test fixtures.

Committed alongside the .dxf files it produces, so a reviewer can see what each fixture
is *meant* to contain rather than reverse-engineering it from DXF group codes. Run:

    python3 fixtures/dxf/generate.py

Each fixture stays well under the 200KB budget in PRD Prompt 3.
"""
import math, pathlib

OUT = pathlib.Path(__file__).parent

# $INSUNITS values
UNITLESS, INCHES, FEET, MM, CM, M = 0, 1, 2, 4, 5, 6


def pairs(*items):
    return "".join(f"{code}\n{value}\n" for code, value in items)


def header(insunits):
    if insunits is None:
        return pairs((0, "SECTION"), (2, "HEADER")) + pairs((0, "ENDSEC"))
    return (
        pairs((0, "SECTION"), (2, "HEADER"))
        + pairs((9, "$INSUNITS"), (70, insunits))
        + pairs((0, "ENDSEC"))
    )


def tables(layers):
    out = pairs((0, "SECTION"), (2, "TABLES"), (0, "TABLE"), (2, "LAYER"), (70, len(layers)))
    for name, colour in layers:
        out += pairs((0, "LAYER"), (2, name), (70, 0), (62, colour), (6, "CONTINUOUS"))
    out += pairs((0, "ENDTAB"), (0, "ENDSEC"))
    return out


def lwpolyline(layer, pts, closed=False, linetype=None, lineweight=None):
    out = pairs((0, "LWPOLYLINE"), (8, layer))
    if linetype:
        out += pairs((6, linetype))
    if lineweight is not None:
        out += pairs((370, lineweight))
    out += pairs((90, len(pts)), (70, 1 if closed else 0))
    for x, y in pts:
        out += pairs((10, f"{x:.3f}"), (20, f"{y:.3f}"))
    return out


def line(layer, p1, p2, linetype=None):
    out = pairs((0, "LINE"), (8, layer))
    if linetype:
        out += pairs((6, linetype))
    return out + pairs(
        (10, f"{p1[0]:.3f}"), (20, f"{p1[1]:.3f}"),
        (11, f"{p2[0]:.3f}"), (21, f"{p2[1]:.3f}"),
    )


def arc(layer, centre, radius, start, end):
    return pairs(
        (0, "ARC"), (8, layer),
        (10, f"{centre[0]:.3f}"), (20, f"{centre[1]:.3f}"),
        (40, f"{radius:.3f}"), (50, f"{start:.3f}"), (51, f"{end:.3f}"),
    )


def circle(layer, centre, radius):
    return pairs(
        (0, "CIRCLE"), (8, layer),
        (10, f"{centre[0]:.3f}"), (20, f"{centre[1]:.3f}"), (40, f"{radius:.3f}"),
    )


def insert(layer, name, at, rotation=0.0):
    return pairs(
        (0, "INSERT"), (8, layer), (2, name),
        (10, f"{at[0]:.3f}"), (20, f"{at[1]:.3f}"), (50, f"{rotation:.3f}"),
    )


def text(layer, at, value, height=200.0):
    return pairs(
        (0, "TEXT"), (8, layer),
        (10, f"{at[0]:.3f}"), (20, f"{at[1]:.3f}"), (40, f"{height:.3f}"), (1, value),
    )


def document(insunits, layers, entities):
    return (
        header(insunits)
        + tables(layers)
        + pairs((0, "SECTION"), (2, "ENTITIES"))
        + entities
        + pairs((0, "ENDSEC"))
        + pairs((0, "EOF"))
    )


# ---------------------------------------------------------------------------
# 1. clean-plan.dxf — two rooms, NCS layers, millimetres declared.
# ---------------------------------------------------------------------------
def clean_plan():
    layers = [("A-WALL", 7), ("A-DOOR", 3), ("A-GLAZ", 4), ("A-ANNO", 2), ("A-GRID", 8)]
    e = ""
    # Outer envelope: 8000 x 5000, drawn as four separate wall runs so pairing has
    # something realistic to chew on in M4.
    e += lwpolyline("A-WALL", [(0, 0), (8000, 0)])
    e += lwpolyline("A-WALL", [(8000, 0), (8000, 5000)])
    e += lwpolyline("A-WALL", [(8000, 5000), (0, 5000)])
    e += lwpolyline("A-WALL", [(0, 5000), (0, 0)])
    # Internal partition splitting the plan.
    e += lwpolyline("A-WALL", [(4500, 0), (4500, 5000)])
    # Openings as block references, the well-behaved case.
    e += insert("A-DOOR", "DOOR-900", (4500, 1200), 90.0)
    e += insert("A-DOOR", "DOOR-900", (2000, 0))
    e += insert("A-GLAZ", "WIN-1200", (6200, 5000))
    e += insert("A-GLAZ", "WIN-1200", (0, 2500), 90.0)
    # Annotation and reference geometry that must NOT become fabric.
    e += text("A-ANNO", (1500, 2400), "LIVING")
    e += text("A-ANNO", (6000, 2400), "BEDROOM")
    e += line("A-GRID", (-500, 2500), (8500, 2500))
    return document(MM, layers, e)


# ---------------------------------------------------------------------------
# 2. curved-plan.dxf — arcs, a circular bay, a bulged polyline.
# ---------------------------------------------------------------------------
def curved_plan():
    layers = [("A-WALL", 7), ("A-DOOR", 3), ("A-ANNO", 2)]
    e = ""
    e += lwpolyline("A-WALL", [(0, 0), (6000, 0)])
    e += lwpolyline("A-WALL", [(0, 0), (0, 4000)])
    e += lwpolyline("A-WALL", [(0, 4000), (2000, 4000)])
    # A bay window wall: half-round, 1800 radius.
    e += arc("A-WALL", (4000, 4000), 1800.0, 0.0, 180.0)
    e += lwpolyline("A-WALL", [(6000, 0), (6000, 4000)])
    # A curved partition drawn as a shallow arc.
    e += arc("A-WALL", (3000, -2000), 3000.0, 45.0, 135.0)
    # A circular column — closed, and short, so it must not read as a wall run.
    e += circle("A-WALL", (3000, 2000), 200.0)
    e += insert("A-DOOR", "DOOR-900", (1000, 0))
    e += text("A-ANNO", (3000, 1000), "BAY")
    return document(MM, layers, e)


# ---------------------------------------------------------------------------
# 3. messy-plan.dxf — the one that must fail honestly.
# ---------------------------------------------------------------------------
def messy_plan():
    """Deliberate defects, each of which should show up in provenance:

    1. No $INSUNITS at all, and coordinates in metres — the unit trap.
    2. Wall endpoints that miss each other by 3-18mm — gaps that healing must close.
    3. Two exactly duplicated wall lines.
    4. Structural walls sitting on layer "0" and on a house-style layer the NCS rule
       set has never heard of.
    5. A door drawn as loose geometry rather than a block, so it cannot be hosted.
    6. Real geometry parked on DEFPOINTS, which must be ignored.
    7. A dashed line that looks structural but is setting-out.
    """
    layers = [("0", 7), ("WALLS-EXTERNAL", 7), ("DEFPOINTS", 8), ("MISC", 1), ("A-ANNO", 2)]
    e = ""
    # Metres, with no header to say so. Extents ~8, implausible as mm.
    e += lwpolyline("WALLS-EXTERNAL", [(0.000, 0.000), (8.000, 0.000)])
    # 3mm gap.
    e += lwpolyline("WALLS-EXTERNAL", [(8.003, 0.000), (8.003, 5.000)])
    # 18mm gap — beyond a 5mm tolerance, so healing must NOT silently close it.
    e += lwpolyline("WALLS-EXTERNAL", [(8.003, 5.018), (0.000, 5.018)])
    # Duplicate of the first wall, exactly.
    e += lwpolyline("WALLS-EXTERNAL", [(0.000, 0.000), (8.000, 0.000)])
    # Structural wall on layer 0 — no layer signal at all, geometry heuristic only.
    e += lwpolyline("0", [(4.500, 0.000), (4.500, 5.000)])
    # Wall on a layer no rule set knows.
    e += lwpolyline("MISC", [(0.000, 2.500), (4.500, 2.500)])
    # Door as loose geometry: a leaf line plus a swing arc, not a block.
    e += line("MISC", (2.000, 0.000), (2.000, 0.900))
    e += arc("MISC", (2.000, 0.000), 0.900, 0.0, 90.0)
    # Real-looking geometry on DEFPOINTS.
    e += lwpolyline("DEFPOINTS", [(0.000, -1.000), (8.000, -1.000)])
    # Dashed setting-out line that would otherwise read as a wall.
    e += lwpolyline("MISC", [(0.000, 4.000), (8.000, 4.000)], linetype="DASHED")
    e += text("A-ANNO", (1.000, 1.000), "SCALE 1:50 - DO NOT SCALE")
    return document(None, layers, e)


# ---------------------------------------------------------------------------
# 4. paired-plan.dxf — walls drawn as two faces, the way real drawings do it.
# ---------------------------------------------------------------------------
def paired_plan():
    """The fixtures above draw each wall as a single line, which never exercises the
    parallel-polyline pairing in geom2d — the highest-consequence inference in the
    pipeline. This one draws every wall as two faces 230mm apart, so pairing has to
    produce a real centreline and a real thickness rather than falling back to a
    default."""
    layers = [("A-WALL", 7), ("A-DOOR", 3), ("A-GLAZ", 4)]
    t = 230.0  # wall thickness
    e = ""
    # Outer envelope, 8000 x 5000 to the *centrelines*, drawn as inner and outer faces.
    h = t / 2
    for (x1, y1, x2, y2) in [
        (0, 0, 8000, 0),        # south
        (8000, 0, 8000, 5000),  # east
        (0, 5000, 8000, 5000),  # north
        (0, 0, 0, 5000),        # west
        (4500, 0, 4500, 5000),  # internal partition
    ]:
        if y1 == y2:  # horizontal: offset in y
            e += lwpolyline("A-WALL", [(x1, y1 - h), (x2, y2 - h)])
            e += lwpolyline("A-WALL", [(x1, y1 + h), (x2, y2 + h)])
        else:          # vertical: offset in x
            e += lwpolyline("A-WALL", [(x1 - h, y1), (x2 - h, y2)])
            e += lwpolyline("A-WALL", [(x1 + h, y1), (x2 + h, y2)])
    e += insert("A-DOOR", "DOOR-900", (2000, 0))
    e += insert("A-GLAZ", "WIN-1200", (6200, 5000))
    return document(MM, layers, e)


for name, content in [
    ("clean-plan.dxf", clean_plan()),
    ("curved-plan.dxf", curved_plan()),
    ("messy-plan.dxf", messy_plan()),
    ("paired-plan.dxf", paired_plan()),
]:
    path = OUT / name
    path.write_text(content)
    print(f"{name}: {len(content):,} bytes")
