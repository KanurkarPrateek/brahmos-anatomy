// Builds index.html: the BrahMos scroll story.
// The missile is drawn with the Anatomy kit (kit/iso-kit.mjs + kit/lathe.mjs):
// every section is a turned solid on one axis, so the take-apart is a slide
// along that axis and the painter's order (tail first, nose last) never changes.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEG = Math.PI / 180;

// ---------- World ----------
// 1 unit ≈ 0.9 cm. Body Ø 66 units ≈ 0.6 m, tail-to-tip ≈ 926 units ≈ 8.4 m.
const R = 33;
const W = 1600;
const H = 820;
const AZ = 70;
const EL = 22;

// How far each section slides along the axis when the missile comes apart.
const OFF = {
  booster: -400,
  ramjet: -175,
  tank: -60,
  warhead: 55,
  guidance: 150,
  intake: 245,
  seeker: 360,
};

const P = k.fitProjection(
  [
    [-46 + OFF.booster - 40, 0, -90],
    [-46 + OFF.booster - 40, 0, 90],
    [880 + OFF.seeker + 120, 0, 90],
    [880 + OFF.seeker + 120, 0, -90],
    [400, 90, 0],
    [400, -90, 0],
  ],
  W,
  H,
  { pad: 30, azimuth: AZ, elevation: EL },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const F = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const FADE = [0.04, 0.42];
const FACE = G.angleToward(F, V); // the angle round the body that looks at the viewer
const pt = (s, r, a) => G.pointOf(F, s, r, a);
const pathOf = k.pathOf;

// ---------- Helpers ----------
const seam = (s, r = R, tone = "faint", slope = 0) => Ln(G.arcOf(F, s, r, P, { slope }), { tone });
const rivets = (s, count = 28, r = R, size = 0.55, tone = "mid") =>
  k.dotsSvg(G.dotsOf(F, s, r + 0.1, count, P, { fade: FADE }), { size, tone });
const capDetail = (s, rings, dots, tone = "lo") =>
  rings.map((r) => Ln(G.circleOf(F, s + 0.2, r, P), { tone })).join("") +
  dots.map(([r, n]) => k.dotsSvg(G.dotsOf(F, s + 0.2, r, n, P, { all: true }), { size: 0.6, tone: "mid" })).join("");

// A path that lies on the body surface between two angles.
const surfaceLine = (s0, s1, a0, a1, r = R + 0.15, n = 18) => {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(at(pt(s0 + ((s1 - s0) * i) / n, r, a0 + ((a1 - a0) * i) / n)));
  return out;
};
const panel = (s0, s1, a0, a1, r = R + 0.15) => {
  const ring = [
    ...surfaceLine(s0, s1, a0, a0, r, 1),
    ...surfaceLine(s1, s1, a0, a1, r),
    ...surfaceLine(s1, s0, a1, a1, r, 1),
    ...surfaceLine(s0, s0, a1, a0, r),
  ];
  return pathOf(ring, true);
};

// A thin plate (fin or wing) in the plane of one radial direction.
function plate(poly, theta, t = 2.6) {
  const d = [0, Math.cos(theta), Math.sin(theta)];
  const tg = [0, -Math.sin(theta), Math.cos(theta)];
  const P3 = (s, r, side) => G.add3(G.add3([s, 0, 0], G.mul3(d, r)), G.mul3(tg, (side * t) / 2));
  const faces = [];
  const sides = [1, -1].map((side) => poly.map(([s, r]) => P3(s, r, side)));
  faces.push({ pts: sides[0], n: tg });
  faces.push({ pts: sides[1], n: G.mul3(tg, -1) });
  const cs = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cr = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const E = G.add3([b[0] - a[0], 0, 0], G.mul3(d, b[1] - a[1]));
    let n = G.unit3(G.cross3(E, tg));
    const mid = G.add3([(a[0] + b[0]) / 2 - cs, 0, 0], G.mul3(d, (a[1] + b[1]) / 2 - cr));
    if (G.dot3(n, mid) < 0) n = G.mul3(n, -1);
    faces.push({ pts: [P3(a[0], a[1], 1), P3(b[0], b[1], 1), P3(b[0], b[1], -1), P3(a[0], a[1], -1)], n });
  }
  const all = sides.flat().map(at);
  const hull = pathOf(G.hullOf(all), true);
  let shades = "";
  for (const f of faces) {
    if (G.dot3(f.n, V) <= 0) continue;
    const tone = Math.min(3, G.toneOf(f.n, P));
    shades += `<path class="iso-shade" data-shade="${tone}" d="${pathOf(f.pts.map(at), true)}"/>`;
  }
  // a hinge line and a stiffener on the visible broad face
  const front = G.dot3(tg, V) > 0 ? 1 : -1;
  const [r0, r1] = [poly[0], poly[1]];
  const tip = poly[2];
  const inset = (u, w) => P3(r0[0] + (r1[0] - r0[0]) * u + (tip[0] - r0[0]) * w * 0.0, r0[1] + (tip[1] - r0[1]) * w, front);
  const stiff = pathOf([P3(r0[0] + (r1[0] - r0[0]) * 0.18, r0[1] + 3, front), P3(poly[3][0] + (tip[0] - poly[3][0]) * 0.2, tip[1] - 4, front)].map(at));
  void inset;
  return `<g class="iso-solid">` +
    `<path class="iso-fill" d="${hull}"/>${shades}` +
    `<path class="iso-line" data-tone="faint" d="${stiff}"/>` +
    `<path class="iso-line iso-edge" data-tone="hi" d="${hull}"/></g>`;
}

const FIN_ANGLES = [45, 135, 225, 315].map((a) => a * DEG);
const isNear = (theta) => Math.cos(theta) * V[1] + Math.sin(theta) * V[2] > 0;
const plates = (poly, which, t) =>
  FIN_ANGLES.filter((a) => (which === "near" ? isNear(a) : !isNear(a))).map((a) => plate(poly, a, t)).join("");

// Flat text laid on the tangent plane of the body at the viewer-facing angle.
function bodyText(s, text, size, angleShift = 0, cls = "mt") {
  const a = FACE + angleShift;
  const o = at(pt(s, R + 0.3, a));
  const ax = k.axisVector(P, [1, 0, 0]);
  const tg = G.tangentOf(F, a);
  let b = k.axisVector(P, tg);
  if (b[1] < 0) b = [-b[0], -b[1]];
  return `<text class="${cls}" transform="matrix(${ax[0].toFixed(4)} ${ax[1].toFixed(4)} ${b[0].toFixed(4)} ${b[1].toFixed(4)} ${o[0].toFixed(1)} ${o[1].toFixed(1)})" font-size="${size}">${text}</text>`;
}
function bodyQuad(s0, s1, h0, h1, angle, cls) {
  // a small painted rectangle on the body (stripes, flag). h is arc length up/down.
  const a0 = FACE + angle + h0 / R;
  const a1 = FACE + angle + h1 / R;
  return `<path class="${cls}" d="${panel(s0, s1, a0, a1, R + 0.25)}"/>`;
}

// Screen-space plume behind a nozzle (exit at s, pointing −x).
function plume(s, r0, length, cls, id) {
  const ax = k.axisVector(P, [1, 0, 0]);
  const L = Math.hypot(...ax);
  const n = [-ax[1] / L, ax[0] / L];
  const top = [];
  const bot = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const w = r0 * KS * (1 + 0.5 * Math.sin(u * Math.PI * 0.9)) * (1 - u) ** 0.7;
    const c = at([s - u * length, 0, 0]);
    top.push([c[0] + n[0] * w, c[1] + n[1] * w]);
    bot.push([c[0] - n[0] * w, c[1] - n[1] * w]);
  }
  const outline = pathOf([...top, ...bot.reverse()], true);
  const tip = at([s - length, 0, 0]);
  const base = at([s, 0, 0]);
  const diamonds = [0.18, 0.36, 0.54, 0.7]
    .map((u, i) => {
      const c = at([s - u * length, 0, 0]);
      const rr = r0 * KS * 0.55 * (1 - u);
      return `<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${(rr * 0.9).toFixed(1)}" ry="${(rr * 0.5).toFixed(1)}" class="diamond" style="animation-delay:${i * 90}ms" transform="rotate(${(Math.atan2(ax[1], ax[0]) / DEG).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)})"/>`;
    })
    .join("");
  return `<g class="fx plume ${cls}"><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${base[0].toFixed(1)}" y1="${base[1].toFixed(1)}" x2="${tip[0].toFixed(1)}" y2="${tip[1].toFixed(1)}"><stop offset="0" stop-color="#fff6d8"/><stop offset=".12" stop-color="#ffc24a"/><stop offset=".45" stop-color="#ff6a1a" stop-opacity=".75"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></linearGradient></defs>` +
    `<g class="flicker" style="transform-origin:${base[0].toFixed(1)}px ${base[1].toFixed(1)}px"><path class="plume-glow" d="${outline}" fill="url(#${id})"/><path d="${outline}" fill="url(#${id})"/>${diamonds}</g></g>`;
}

// ---------- Parts ----------
const parts = {};
const part = (id, svg) => (parts[id] = svg);

// 1. Solid booster — stage one. Rests nested inside the ramjet combustor; only its nozzle shows.
{
  const prof = [[-46, 22], [-38, 16.5, 1], [-28, 12, 1], [-18, 17, 1], [-9, 24, 1], [0, 26.5], [170, 26.5]];
  const body = G.solidOf(prof, F, P);
  let inner = seam(0, 26.5, "lo") + seam(40, 26.5) + seam(130, 26.5) + seam(160, 26.5, "lo");
  inner += k.fadedSvg(G.ribsOf(F, 2, 38, 26.6, 24, P, { fade: FADE }), { tone: "faint" });
  inner += rivets(4, 24, 26.5, 0.5) + rivets(156, 24, 26.5, 0.5);
  inner += `<path class="paint-band" d="${panel(92, 104, FACE - 1.35, FACE + 1.35, 26.75)}"/>`;
  const svg =
    plume(-46, 19, 330, "booster-fire", "gBoost") +
    S(body, { tone: "hi", inner }) +
    capDetail(170, [20, 12], [[16, 12]], "lo") +
    Ln(G.circleOf(F, -45.8, 18.5, P), { tone: "mid" });
  part("booster", svg);
}

// 2. Ramjet — combustor, flame holders and the sustainer nozzle, with the four tail fins.
{
  const prof = [[0, 29.5], [6, 31.5, 1], [16, R], [210, R]];
  const body = G.solidOf(prof, F, P, { fill: "hull" });
  let inner = seam(16) + seam(70) + seam(150) + seam(204, R, "lo");
  inner += rivets(20, 30) + rivets(146, 30) + rivets(200, 30);
  inner += k.fadedSvg(G.ribsOf(F, 70, 150, R + 0.1, 16, P, { fade: [0.15, 0.6] }), { tone: "faint" });
  inner += Ln(panel(96, 128, FACE - 0.3, FACE + 0.3), { tone: "lo" });
  inner += k.dotsSvg([96, 128].flatMap((s) => [-0.3, 0.3].map((da) => at(pt(s + (s > 100 ? -2 : 2), R + 0.2, FACE + da * 0.85)))), { size: 0.55, tone: "hi" });
  const fin = [[20, R - 1], [84, R - 1], [74, R + 44], [46, R + 44]];
  const svg =
    plume(0, 26, 520, "ramjet-fire", "gRam") +
    `<g data-sub="fins">${plates(fin, "far", 2.6)}</g>` +
    S(body, { tone: "hi", inner }) +
    // the open front: flame holders and the fuel injector ring
    capDetail(210, [R - 3, 24, 15, 7], [[19.5, 18], [11, 10]], "lo") +
    Ln(G.spokesOf(F, 210.2, 7, R - 3, 8, P, { phase: 22.5 * DEG }), { tone: "faint" }) +
    `<g data-sub="fins">${plates(fin, "near", 2.6)}</g>`;
  part("ramjet", svg);
}

// 3. Fuel tank — liquid ramjet fuel, with the four mid-body wings.
{
  const body = G.solidOf([[210, R], [470, R]], F, P);
  let inner = seam(214, R, "lo") + seam(300) + seam(380) + seam(466, R, "lo");
  inner += rivets(216, 32) + rivets(464, 32);
  inner += k.dotsSvg(G.dotsOf(F, 300, R + 0.1, 32, P, { fade: FADE }), { size: 0.4, tone: "lo" });
  // a cable raceway running along the top of the body
  const top = 1.2;
  inner += Ln(pathOf(surfaceLine(222, 458, FACE + top, FACE + top, R + 0.2, 2)), { tone: "lo" });
  inner += Ln(pathOf(surfaceLine(222, 458, FACE + top + 0.14, FACE + top + 0.14, R + 0.2, 2)), { tone: "lo" });
  inner += bodyText(236, "BRAHMOS", 15, -0.18);
  inner += bodyText(237, "PJ-10 · SUPERSONIC CRUISE MISSILE", 4.6, -0.42, "mt small");
  inner += bodyQuad(410, 436, -9, -3, -0.05, "flag f1") + bodyQuad(410, 436, -3, 3, -0.05, "flag f2") + bodyQuad(410, 436, 3, 9, -0.05, "flag f3");
  const wing = [[318, R - 1], [408, R - 1], [394, R + 50], [356, R + 50]];
  const svg =
    `<g data-sub="fins">${plates(wing, "far", 3)}</g>` +
    S(body, { tone: "hi", inner }) +
    capDetail(470, [R - 3, 18], [[25, 24]], "lo") +
    `<g class="fx fuel">${Ln(pathOf(surfaceLine(460, 214, FACE + 0.15, FACE + 0.15, R + 0.4, 2)), { tone: "lit", className: "flowline" })}${Ln(pathOf(surfaceLine(460, 214, FACE - 0.35, FACE - 0.35, R + 0.4, 2)), { tone: "lit", className: "flowline" })}</g>` +
    `<g data-sub="fins">${plates(wing, "near", 3)}</g>`;
  part("tank", svg);
}

// 4. Warhead — 200–300 kg semi-armour-piercing.
{
  const body = G.solidOf([[470, R], [600, R]], F, P);
  let inner = seam(474, R, "lo") + seam(596, R, "lo");
  inner += rivets(476, 32) + rivets(594, 32);
  inner += `<path class="paint-band" d="${panel(500, 512, FACE - 1.5, FACE + 1.5, R + 0.2)}"/>`;
  inner += `<path class="paint-band" d="${panel(518, 522, FACE - 1.5, FACE + 1.5, R + 0.2)}"/>`;
  inner += Ln(panel(540, 580, FACE - 0.28, FACE + 0.28), { tone: "lo" });
  inner += bodyText(546, "SAP · 200–300 KG", 4.4, -0.08, "mt small");
  const svg = S(body, { tone: "hi", inner }) + capDetail(600, [R - 3, 20, 9], [[26, 20], [14, 8]], "lo") +
    `<g class="fx blast">${[0, 1, 2].map((i) => `<path class="ring" style="animation-delay:${i * 600}ms" d="${G.circleOf(F, 535, R + 6, P)}"/>`).join("")}</g>`;
  part("warhead", svg);
}

// 5. Guidance bay — INS + multi-GNSS, mission computer, data link.
{
  const body = G.solidOf([[600, R], [700, R]], F, P);
  let inner = seam(604, R, "lo") + seam(696, R, "lo");
  inner += rivets(606, 32) + rivets(694, 32);
  inner += Ln(panel(616, 684, FACE - 0.42, FACE + 0.42), { tone: "mid" });
  inner += Ln(panel(620, 680, FACE - 0.36, FACE + 0.36), { tone: "faint" });
  inner += k.dotsSvg(
    [[618, -0.4], [682, -0.4], [618, 0.4], [682, 0.4], [650, -0.4], [650, 0.4]].map(([s, da]) => at(pt(s, R + 0.2, FACE + da))),
    { size: 0.6, tone: "hi" },
  );
  // GNSS antenna patch on top
  inner += Ln(panel(638, 662, FACE + 0.95, FACE + 1.3), { tone: "mid" });
  inner += Ln(pathOf(surfaceLine(642, 658, FACE + 1.125, FACE + 1.125, R + 0.2, 2)), { tone: "faint" });
  inner += bodyText(626, "NAV · INS + GNSS", 4.4, -0.2, "mt small");
  const ant = at(pt(650, R + 1, FACE + 1.12));
  const sats = [[-150, -190], [30, -225], [215, -185]];
  const svg =
    S(body, { tone: "hi", inner }) +
    capDetail(700, [R - 3, 22, 12], [[27, 20], [17, 10]], "lo") +
    `<g class="fx sats">${sats
      .map(([dx, dy], i) => {
        const s = [ant[0] + dx, ant[1] + dy];
        return `<path class="sig" style="animation-delay:${i * 420}ms" d="M${s[0].toFixed(1)} ${s[1].toFixed(1)}L${ant[0].toFixed(1)} ${ant[1].toFixed(1)}"/>` +
          `<g class="sat" transform="translate(${s[0].toFixed(1)} ${s[1].toFixed(1)})"><rect x="-4" y="-3" width="8" height="6" rx="1"/><rect class="wing" x="-17" y="-1.6" width="11" height="3.2"/><rect class="wing" x="6" y="-1.6" width="11" height="3.2"/></g>`;
      })
      .join("")}<circle class="ant" cx="${ant[0].toFixed(1)}" cy="${ant[1].toFixed(1)}" r="2.2"/></g>`;
  part("guidance", svg);
}

// 6. Intake cowl — the annular air intake around the centre body.
{
  const prof = [[700, R], [742, R], [770, 30.5, 1], [790, 27]];
  const body = G.lathe([[700, 0], ...prof, [790, 23.5]], F, P, { hole: [790, 23.5] });
  let inner = seam(704, R, "lo") + rivets(706, 32) + seam(742) + rivets(745, 32, R, 0.45, "lo");
  inner += k.fadedSvg(G.ribsOf(F, 748, 784, 32.6, 12, P, { r1: 27.8, fade: [0.15, 0.6] }), { tone: "faint" });
  // the duct throat seen through the lip, and the support struts of the centre body
  const duct = `<path class="duct" d="${G.circleOf(F, 789.6, 23.4, P)}"/>` +
    Ln(G.circleOf(F, 780, 21.5, P), { tone: "faint" }) +
    Ln(G.spokesOf(F, 789, 16, 23.2, 4, P, { phase: 45 * DEG }), { tone: "lo" });
  const flows = [-0.9, -0.45, 0, 0.45, 0.9, 1.35, -1.35]
    .map((da, i) => {
      const a = FACE + da;
      const line = [at(pt(1010, 24, a)), at(pt(900, 24.5, a)), at(pt(800, 24, a)), at(pt(792, 23, a))];
      return `<path class="air" style="animation-delay:${i * 130}ms" d="${pathOf(line)}"/>`;
    })
    .join("");
  const svg = S(body, { tone: "hi", inner }) + duct + `<g class="fx airflow">${flows}</g>`;
  part("intake", svg);
}

// 7. Centre-body radome — the active radar seeker.
{
  const ogive = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    const s = 802 + u * 82;
    const r = 20.5 * Math.sqrt(1 - u ** 1.6);
    ogive.push([s, Math.max(r, 0.01), i > 0 && i < 14 ? 1 : 0]);
  }
  const prof = [[786, 20.5], [802, 20.5], ...ogive.slice(1)];
  const body = G.solidOf(prof, F, P);
  let inner = seam(802, 20.5, "lo") + k.dotsSvg(G.dotsOf(F, 794, 20.6, 16, P, { fade: FADE }), { size: 0.45, tone: "mid" });
  inner += Ln(G.arcOf(F, 840, 20.5 * Math.sqrt(1 - (38 / 82) ** 1.6), P, { slope: -0.33 }), { tone: "faint" });
  const tipS = 884;
  const waves = [0, 1, 2, 3]
    .map((i) => `<path class="wave" style="animation-delay:${i * 450}ms" d="${G.circleOf(F, tipS + 26 + i * 34, 14 + i * 13, P)}"/>`)
    .join("");
  const svg = S(body, { tone: "hi", inner, className: "radome" }) + `<g class="fx radar">${waves}</g>`;
  part("seeker", svg);
}

// Anchor points (screen) for each part at rest, for the camera and labels.
const centre = {
  booster: 40, ramjet: 105, tank: 340, warhead: 535, guidance: 650, intake: 745, seeker: 830,
};
const axis = k.axisVector(P, [1, 0, 0]);
const anchors = Object.fromEntries(Object.entries(centre).map(([id, s]) => [id, at([s, 0, 0])]));
const ORDER = ["booster", "ramjet", "tank", "warhead", "guidance", "intake", "seeker"]; // tail → nose = back → front
const halo = (() => {
  const a = at([-60, 0, -R]);
  const b = at([900, 0, -R]);
  return `<path class="shadow" d="M${a[0].toFixed(1)} ${(a[1] + 60).toFixed(1)}L${b[0].toFixed(1)} ${(b[1] + 60).toFixed(1)}"/>`;
})();

// A faint blueprint grid on the floor under the missile.
const grid = (() => {
  const z = -R - 70;
  let d = "";
  for (let x = -500; x <= 1300; x += 50) d += pathOf([at([x, -260, z]), at([x, 260, z])]);
  for (let y = -250; y <= 250; y += 50) d += pathOf([at([-500, y, z]), at([1300, y, z])]);
  return `<path class="floor-grid" d="${d}"/>`;
})();

const missileSvg =
  `<svg class="iso-svg missile-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Isometric drawing of the BrahMos missile. As you scroll it comes apart into seven sections along its axis: solid booster, ramjet, fuel tank with wings, warhead, guidance bay, intake and radar seeker.">` +
  `<g id="cam">${grid}` +
  ORDER.map((id) => `<g class="part" data-part="${id}">${parts[id]}</g>`).join("") +
  `</g></svg>`;

const DATA = { W, H, axis, up: k.axisVector(P, [0, 0, 1]), anchors, off: OFF, order: ORDER };

// ---------- Page ----------
const css = readFileSync(join(HERE, "kit/iso.css"), "utf8");
const page = readFileSync(join(HERE, "src/page.html"), "utf8");
const style = readFileSync(join(HERE, "src/style.css"), "utf8");
const live = readFileSync(join(HERE, "src/live.js"), "utf8");
const gl = readFileSync(join(HERE, "src/gl.js"), "utf8");
const html = page
  .replace("/*ISO_CSS*/", () => css)
  .replace("/*STYLE*/", () => style)
  .replace("<!--MISSILE-->", () => missileSvg)
  .replace("/*DATA*/", () => `const DATA = ${JSON.stringify(DATA)};`)
  .replace("/*LIVE*/", () => live)
  .replace("/*GL*/", () => gl);
writeFileSync(join(HERE, "index.html"), html);
console.log(`index.html written · ${(html.length / 1024).toFixed(0)} KB · svg ${(missileSvg.length / 1024).toFixed(0)} KB`);
