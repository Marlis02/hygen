#!/usr/bin/env python3
"""Coastline silhouette for the map-marker scene, traced from Natural Earth land polygons.

    python3 engine/py/trace_map.py ne_50m_land.geojson --lon -66 -37 --lat 36 54 \
        --out engine/assets/maps/north-atlantic.svg --name "North Atlantic"

Equirectangular projection of a lon/lat box onto the map window of the frame (x 60–1020, y 150–990).
Keep the box aspect ≈ 960/840 after the cos(latitude) squeeze, or the land is stretched. Rings are
clipped to the window plus a margin, simplified (Douglas–Peucker) and written as SVG path data:
water = window rectangle with the land cut out (evenodd), coast = land outlines. Also prints where
given points land in frame px (--mark lon lat), e.g. the marker position for video.json.
"""
import argparse
import json
import math

X0, Y0, W, H = 60.0, 150.0, 960.0, 840.0
MARGIN = 40.0


def clip_ring(pts, xmin, ymin, xmax, ymax):
    def edge(points, inside, cut):
        out = []
        if not points:
            return out
        prev = points[-1]
        for cur in points:
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
            prev = cur
        return out

    def at_x(p, q, x):
        t = (x - p[0]) / (q[0] - p[0])
        return (x, p[1] + t * (q[1] - p[1]))

    def at_y(p, q, y):
        t = (y - p[1]) / (q[1] - p[1])
        return (p[0] + t * (q[0] - p[0]), y)

    pts = edge(pts, lambda p: p[0] >= xmin, lambda p, q: at_x(p, q, xmin))
    pts = edge(pts, lambda p: p[0] <= xmax, lambda p, q: at_x(p, q, xmax))
    pts = edge(pts, lambda p: p[1] >= ymin, lambda p, q: at_y(p, q, ymin))
    pts = edge(pts, lambda p: p[1] <= ymax, lambda p, q: at_y(p, q, ymax))
    return pts


def simplify(pts, eps):
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, index = 0.0, -1
        for i in range(a + 1, b):
            if norm < 1e-6:                       # closed ring: the base collapses to a point, use the radius
                d = math.hypot(pts[i][0] - ax, pts[i][1] - ay)
            else:
                d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / norm
            if d > best:
                best, index = d, i
        if best > eps:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(pts, keep) if k]


def area(pts):
    return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("geojson")
    ap.add_argument("--lon", type=float, nargs=2, required=True)
    ap.add_argument("--lat", type=float, nargs=2, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--eps", type=float, default=1.0)
    ap.add_argument("--min-area", type=float, default=40.0)
    ap.add_argument("--mark", type=float, nargs=2, action="append", default=[])
    a = ap.parse_args()
    lon0, lon1 = a.lon
    lat0, lat1 = a.lat
    kx, ky = W / (lon1 - lon0), H / (lat1 - lat0)

    def proj(lon, lat):
        return (X0 + (lon - lon0) * kx, Y0 + (lat1 - lat) * ky)

    rings = []
    for feature in json.load(open(a.geojson, encoding="utf-8"))["features"]:
        geom = feature["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            outer = poly[0]
            if not any(lon0 - 5 <= p[0] <= lon1 + 5 and lat0 - 5 <= p[1] <= lat1 + 5 for p in outer):
                continue
            pts = clip_ring([proj(p[0], p[1]) for p in outer], X0 - MARGIN, Y0 - MARGIN, X0 + W + MARGIN, Y0 + H + MARGIN)
            if len(pts) < 3 or area(pts) < a.min_area:
                continue
            pts = simplify(pts + [pts[0]], a.eps)[:-1]
            if len(pts) >= 3:
                rings.append(pts)
    land = " ".join("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in r) + " Z" for r in rings)
    frame = f"M{X0:.0f} {Y0:.0f} H{X0 + W:.0f} V{Y0 + H:.0f} H{X0:.0f} Z"
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" data-fill-rule="evenodd" '
        f'data-name="{a.name}" data-lon="{lon0} {lon1}" data-lat="{lat0} {lat1}">\n'
        f'  <path data-role="water" fill-rule="evenodd" fill="#121110" d="{frame} {land}"/>\n'
        f'  <path data-role="coast" fill="none" stroke="#ECE7DE" d="{land}"/>\n'
        f"</svg>\n"
    )
    open(a.out, "w", encoding="utf-8").write(svg)
    print(f"{a.out}: {len(rings)} rings, {sum(len(r) for r in rings)} points, {len(svg)} bytes")
    for lon, lat in a.mark:
        x, y = proj(lon, lat)
        print(f"  mark {lon}, {lat} → x {x:.0f}, y {y:.0f}")


if __name__ == "__main__":
    main()
