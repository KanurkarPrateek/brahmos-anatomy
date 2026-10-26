// 3D BrahMos: a lit, textured Three.js model driven by the scroll story in live.js.
// live.js calls M3D.update(state) every frame; this module owns the render loop.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const stage = document.getElementById("stage");
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const R = 0.33;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = "gl";
stage.insertBefore(renderer.domElement, stage.querySelector(".tags"));

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
scene.fog = new THREE.Fog(0x06080b, 26, 75);

// soft vignette sky
{
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#06080b";
  g.fillRect(0, 0, 512, 512);
  const r1 = g.createRadialGradient(330, 300, 0, 330, 300, 360);
  r1.addColorStop(0, "#2a1a0e");
  r1.addColorStop(0.5, "#120f0e");
  r1.addColorStop(1, "#06080b00");
  g.fillStyle = r1;
  g.fillRect(0, 0, 512, 512);
  const r2 = g.createRadialGradient(90, 80, 0, 90, 80, 260);
  r2.addColorStop(0, "#0f1a33");
  r2.addColorStop(1, "#06080b00");
  g.fillStyle = r2;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a120a, 0.35));
const key = new THREE.DirectionalLight(0xfff1e0, 2.0);
key.position.set(4, 9, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 8, bottom: -8, near: 1, far: 40 });
key.shadow.bias = -0.0004;
key.shadow.radius = 6;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xff9a3c, 2.2);
rim.position.set(-6, 3, -8);
scene.add(rim);
const fill = new THREE.DirectionalLight(0x6f8cff, 0.6);
fill.position.set(-4, -2, 6);
scene.add(fill);

// floor: shadow catcher + faint grid
const FLOOR = -1.15;
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(80, 160, 0x2a3440, 0x161d25);
  grid.position.y = FLOOR + 0.001;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);
}

// ---------- textures ----------
const ANISO = renderer.capabilities.getMaxAnisotropy();
function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

// A painted skin for a section from s0 to s1. Canvas x runs round the body
// (front, facing the viewer, at the middle), canvas y runs along the axis (nose up).
function skin(s0, s1, r, o = {}) {
  const CW = 2048;
  const CH = Math.min(4096, Math.max(256, Math.round(((s1 - s0) / (TAU * r)) * CW)));
  const mk = () => Object.assign(document.createElement("canvas"), { width: CW, height: CH });
  const col = mk(), bmp = mk();
  const c = col.getContext("2d"), b = bmp.getContext("2d");
  const Y = (s) => CH * (1 - (s - s0) / (s1 - s0));
  const X = (a) => CW * (0.5 + a / TAU); // a: angle from the front, + goes downward on screen
  const px = (arc) => (arc / (TAU * r)) * CW; // arc length → px round the body

  c.fillStyle = o.base || "#9fa4a0";
  c.fillRect(0, 0, CW, CH);
  b.fillStyle = "#808080";
  b.fillRect(0, 0, CW, CH);
  // light grime and paint variation
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * 0.035})`;
    const w = 4 + Math.random() * 60;
    c.fillRect(Math.random() * CW, Math.random() * CH, w, 1 + Math.random() * 3);
  }
  const shade = c.createLinearGradient(0, 0, CW, 0);
  shade.addColorStop(0, "rgba(0,0,0,.18)");
  shade.addColorStop(0.5, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,.18)");
  c.fillStyle = shade;
  c.fillRect(0, 0, CW, CH);

  for (const [sa, sb, col2] of o.bands || []) {
    c.fillStyle = col2;
    c.fillRect(0, Y(sb), CW, Y(sa) - Y(sb));
  }
  const seam = (s, w = 3) => {
    c.fillStyle = "rgba(20,24,28,.55)";
    c.fillRect(0, Y(s) - w / 2, CW, w);
    b.fillStyle = "#000";
    b.fillRect(0, Y(s) - w, CW, w * 2);
  };
  (o.seams || []).forEach((s) => seam(s));
  const rivetRow = (s, n = 48, size = 3.2) => {
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * CW;
      c.fillStyle = "rgba(60,64,66,.8)";
      c.beginPath(); c.arc(x, Y(s), size, 0, TAU); c.fill();
      c.fillStyle = "rgba(255,255,255,.35)";
      c.beginPath(); c.arc(x - 0.8, Y(s) - 0.8, size * 0.45, 0, TAU); c.fill();
      b.fillStyle = "#e0e0e0";
      b.beginPath(); b.arc(x, Y(s), size, 0, TAU); b.fill();
    }
  };
  (o.rivets || []).forEach((s) => rivetRow(s));
  // panels: [sa, sb, a0, a1, screws?]
  for (const [sa, sb, a0, a1, screws] of o.panels || []) {
    const x0 = X(a0), x1 = X(a1), y0 = Y(sb), y1 = Y(sa);
    c.strokeStyle = "rgba(25,28,32,.7)";
    c.lineWidth = 2.5;
    c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    b.strokeStyle = "#000";
    b.lineWidth = 4;
    b.strokeRect(x0, y0, x1 - x0, y1 - y0);
    if (screws) {
      const pts = [];
      const nx = Math.max(2, Math.round((x1 - x0) / 60)), ny = Math.max(2, Math.round((y1 - y0) / 60));
      for (let i = 0; i <= nx; i++) pts.push([x0 + ((x1 - x0) * i) / nx, y0 + 9], [x0 + ((x1 - x0) * i) / nx, y1 - 9]);
      for (let j = 1; j < ny; j++) pts.push([x0 + 9, y0 + ((y1 - y0) * j) / ny], [x1 - 9, y0 + ((y1 - y0) * j) / ny]);
      for (const [x, y] of pts) {
        c.fillStyle = "rgba(40,44,48,.8)";
        c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill();
        b.fillStyle = "#3a3a3a";
        b.beginPath(); b.arc(x, y, 2.6, 0, TAU); b.fill();
      }
    }
  }
  // painted rectangles: [sa, sb, a0, a1, colour]
  for (const [sa, sb, a0, a1, f] of o.paint || []) {
    c.fillStyle = f;
    c.fillRect(X(a0), Y(sb), X(a1) - X(a0), Y(sa) - Y(sb));
  }
  // stencilled text along the axis: [s, a, sizeInUnits, text, colour, weight]
  for (const [s, a, size, text, f, wt] of o.text || []) {
    c.save();
    c.translate(X(a), Y(s));
    c.rotate(-Math.PI / 2);
    c.font = `${wt || 600} ${px(size)}px "Space Grotesk", "JetBrains Mono", sans-serif`;
    c.fillStyle = f || "#1d2126";
    c.textBaseline = "middle";
    c.fillText(text, 0, 0);
    c.restore();
  }
  // lengthwise lines (raceways, stripes): [sa, sb, a, widthUnits, colour]
  for (const [sa, sb, a, w, f] of o.lines || []) {
    c.fillStyle = f;
    c.fillRect(X(a) - px(w) / 2, Y(sb), px(w), Y(sa) - Y(sb));
    b.fillStyle = "#b0b0b0";
    b.fillRect(X(a) - px(w) / 2, Y(sb), px(w), Y(sa) - Y(sb));
  }
  return { map: canvasTex(col), bumpMap: canvasTex(bmp, false) };
}

// The machined face of a bulkhead.
const bulkTex = (() => {
  const S = 512;
  const cv = Object.assign(document.createElement("canvas"), { width: S, height: S });
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "#5a5f63");
  grd.addColorStop(1, "#30353a");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = "rgba(255,255,255,.07)";
  for (let r = 6; r < S / 2; r += 3) { g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke(); }
  g.strokeStyle = "#15191c";
  g.lineWidth = 3;
  for (const r of [0.92, 0.62, 0.3]) { g.beginPath(); g.arc(S / 2, S / 2, (r * S) / 2, 0, TAU); g.stroke(); }
  g.fillStyle = "#15191c";
  for (const [rr, n] of [[0.84, 24], [0.48, 12]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      g.beginPath(); g.arc(S / 2 + Math.cos(a) * rr * S / 2, S / 2 + Math.sin(a) * rr * S / 2, 5, 0, TAU); g.fill();
    }
  }
  g.fillStyle = "#1d2226";
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.1, 0, TAU); g.fill();
  return canvasTex(cv);
})();

const DOT = (() => {
  const cv = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const g = cv.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "#fff"); r.addColorStop(0.35, "rgba(255,255,255,.6)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();

// ---------- materials ----------
const paint = (tex, extra = {}) =>
  new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.15, clearcoat: 0.2, clearcoatRoughness: 0.45, bumpScale: 1.4, ...tex, ...extra });
const M = {
  fin: () => new THREE.MeshPhysicalMaterial({ color: 0x8f948f, roughness: 0.5, metalness: 0.2, clearcoat: 0.3 }),
  ti: () => new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.32, metalness: 1, side: THREE.DoubleSide }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x040506, roughness: 1, metalness: 0.2, side: THREE.DoubleSide }),
  bulk: () => new THREE.MeshStandardMaterial({ map: bulkTex, roughness: 0.38, metalness: 0.85 }),
  radome: () => new THREE.MeshPhysicalMaterial({ color: 0x2b3036, roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.3, metalness: 1 }),
};

// ---------- geometry helpers ----------
// A turned solid on the missile axis (+x toward the nose). profile: [[s, r], ...]
function lathe(profile, segs = 128) {
  const s0 = profile[0][0], s1 = profile[profile.length - 1][0];
  const geo = new THREE.LatheGeometry(profile.map(([s, r]) => new THREE.Vector2(r, s)), segs, -Math.PI, TAU);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, s1 === s0 ? 0 : (pos.getY(i) - s0) / (s1 - s0));
  geo.rotateZ(-Math.PI / 2);
  return geo;
}
function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
function cap(s, r, facing = 1) {
  const m = mesh(new THREE.CircleGeometry(r, 96), M.bulk(), false);
  m.rotation.y = (facing * Math.PI) / 2;
  m.position.x = s;
  return m;
}
const FIN_ANGLES = [45, 135, 225, 315].map((a) => a * DEG);
function fins(poly, thick, mat) {
  const g = new THREE.Group();
  const shape = new THREE.Shape(poly.map(([s, r]) => new THREE.Vector2(s, r)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.35, bevelSize: thick * 0.35, bevelSegments: 3 });
  geo.translate(0, 0, -thick / 2);
  // a root fairing strip and a hinge line on each fin
  const [a, b2, c2, d] = poly;
  for (const th of FIN_ANGLES) {
    const f = mesh(geo, mat);
    f.rotation.x = th - Math.PI / 2;
    f.userData.sub = true;
    g.add(f);
    const hinge = mesh(new THREE.BoxGeometry(0.004, (c2[1] - b2[1]) * 0.98, thick * 1.9), M.dark(), false);
    const hs = a[0] + (b2[0] - a[0]) * 0.72;
    hinge.position.set(hs, 0, 0);
    hinge.geometry.translate(0, (b2[1] + c2[1]) / 2, 0);
    hinge.rotation.x = th - Math.PI / 2;
    hinge.userData.sub = true;
    g.add(hinge);
    const root = mesh(new THREE.BoxGeometry(b2[0] - a[0] + 0.06, 0.03, thick * 3), mat);
    root.geometry.translate((a[0] + b2[0]) / 2, R, 0);
    root.rotation.x = th - Math.PI / 2;
    root.userData.sub = true;
    g.add(root);
    void d;
  }
  return g;
}

// ---------- effects ----------
const fxMats = [];
function plumeMat(c0, c1, power) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC0: { value: new THREE.Color(c0) }, uC1: { value: new THREE.Color(c1) }, uP: { value: power } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uT,uA,uP; uniform vec3 uC0,uC1; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float h(float n){return fract(sin(n)*43758.5453);}
      void main(){ float t=vUv.y;
        float edge=pow(abs(dot(vN,vV)),1.6);
        float shock=0.6+0.4*smoothstep(.55,1.,sin(t*34.-uT*2.)*.5+.5)*(1.-t);
        float flick=0.85+0.15*h(floor(uT*30.)+floor(t*14.));
        float a=pow(1.-t,uP)*edge*shock*flick*uA;
        vec3 c=mix(uC0,uC1,smoothstep(0.,.55,t));
        gl_FragColor=vec4(c*a*1.6,a); }`,
  });
  fxMats.push(m);
  return m;
}
function plume(r0, len, scale = 1) {
  const g = new THREE.Group();
  const mk = (rr, l, m) => {
    const geo = new THREE.CylinderGeometry(rr * 0.15, rr, l, 48, 24, true);
    geo.translate(0, l / 2, 0);
    geo.rotateZ(Math.PI / 2);
    const p = new THREE.Mesh(geo, m);
    p.renderOrder = 10;
    return p;
  };
  g.add(mk(r0 * 1.25 * scale, len, plumeMat(0xffb04a, 0xff3d00, 1.4)));
  g.add(mk(r0 * 0.6 * scale, len * 0.45, plumeMat(0xfff6d8, 0xffc24a, 1.1)));
  return g;
}
const glow = (color) => {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  fxMats.push(m);
  return m;
};

// ---------- parts ----------
const missile = new THREE.Group();
scene.add(missile);
const parts = {};
const centre = {};
function part(id, c) {
  const g = new THREE.Group();
  g.userData = { id, fx: null };
  parts[id] = g;
  centre[id] = c;
  missile.add(g);
  return g;
}

// 1. Booster
{
  const g = part("booster", 0.4);
  const t = skin(0, 1.7, 0.265, {
    base: "#5d6458",
    seams: [0.04, 0.4, 1.3, 1.62], rivets: [0.07, 1.58],
    bands: [[0.92, 1.04, "#e0862e"]],
    text: [[0.15, 0.3, 0.06, "SOLID ROCKET MOTOR · STAGE 1", "#22261f", 600], [0.15, 0.42, 0.035, "LOT 07 · HANDLE WITH CARE", "#2b3029", 500]],
  });
  g.add(mesh(lathe([[0, 0.265], [1.7, 0.265]]), paint(t)));
  g.add(mesh(lathe([[-0.46, 0.22], [-0.38, 0.165], [-0.28, 0.12], [-0.18, 0.17], [-0.09, 0.24], [0, 0.265]], 96), M.ti()));
  const throat = mesh(lathe([[-0.45, 0.205], [-0.28, 0.105]], 64), M.dark(), false);
  g.add(throat);
  g.add(cap(1.7, 0.265, 1));
  const fx = plume(0.2, 3.4, 1);
  fx.position.x = -0.44;
  g.add(fx);
  g.userData.fx = { boost: fx };
}

// 2. Ramjet + tail fins
{
  const g = part("ramjet", 1.05);
  const t = skin(0.16, 2.1, R, {
    seams: [0.7, 1.5, 2.06], rivets: [0.2, 0.68, 0.72, 1.48, 1.52, 2.02],
    panels: [[0.96, 1.28, -0.3, 0.3, true], [0.3, 0.6, -2.4, -1.9, true]],
    text: [[1.0, -0.42, 0.035, "RAMJET · STAGE 2", "#262a2f", 600], [0.98, 0.42, 0.028, "NO STEP", "#7a2c1c", 700]],
    lines: [[0.2, 2.05, -1.2, 0.04, "#a9ada8"]],
  });
  g.add(mesh(lathe([[0.16, R], [2.1, R]]), paint(t)));
  g.add(mesh(lathe([[0, 0.295], [0.06, 0.315], [0.16, R]], 96), M.ti()));
  // looking into the nozzle: the combustor, flame holders and injector ring
  const inner = mesh(lathe([[0.0, 0.29], [0.3, 0.27]], 64), M.dark(), false);
  g.add(inner);
  const holder = mesh(new THREE.TorusGeometry(0.15, 0.012, 12, 64), M.steel(), false);
  holder.rotation.y = Math.PI / 2;
  holder.position.x = 0.3;
  g.add(holder);
  const back = cap(0.3, 0.27, -1);
  back.material = M.dark();
  g.add(back);
  g.add(cap(2.1, R, 1));
  g.add(fins([[0.2, R - 0.01], [0.84, R - 0.01], [0.74, R + 0.44], [0.46, R + 0.44]], 0.024, M.fin()));
  const fx = plume(0.27, 5.4, 1);
  fx.position.x = 0;
  g.add(fx);
  g.userData.fx = { ram: fx };
}

// 3. Fuel tank + wings
{
  const g = part("tank", 3.4);
  const t = skin(2.1, 4.7, R, {
    seams: [2.14, 3.0, 3.8, 4.66], rivets: [2.17, 2.97, 3.03, 3.77, 3.83, 4.63],
    text: [
      [2.34, -0.13, 0.15, "BRAHMOS", "#1a1e22", 700],
      [2.36, 0.12, 0.042, "PJ-10 · SUPERSONIC CRUISE MISSILE", "#2b3036", 500],
      [3.06, -0.75, 0.03, "FUEL FILL ↓ T-6", "#7a2c1c", 600],
    ],
    paint: [[4.1, 4.36, -0.27, -0.09, "#ff9933"], [4.1, 4.36, -0.09, 0.09, "#f2f2ee"], [4.1, 4.36, 0.09, 0.27, "#138808"]],
    panels: [[3.04, 3.22, -0.85, -0.6, true], [4.42, 4.58, -0.35, 0.35, true]],
  });
  g.add(mesh(lathe([[2.1, R], [4.7, R]]), paint(t)));
  // cable raceway along the top of the body
  const race = mesh(new THREE.BoxGeometry(2.36, 0.022, 0.07), paint({}, { color: 0xb3b7b2 }));
  race.position.set(3.4, R + 0.008, 0);
  g.add(race);
  for (let s = 2.3; s < 4.6; s += 0.24) {
    const clip = mesh(new THREE.BoxGeometry(0.02, 0.026, 0.08), M.steel(), false);
    clip.position.set(s, R + 0.012, 0);
    g.add(clip);
  }
  g.add(cap(2.1, R, -1), cap(4.7, R, 1));
  g.add(fins([[3.18, R - 0.01], [4.08, R - 0.01], [3.94, R + 0.5], [3.56, R + 0.5]], 0.03, M.fin()));
  // fuel flow: sparks running back along the body
  const N = 160;
  const pos = new Float32Array(N * 3);
  const seed = Array.from({ length: N }, () => [Math.random(), (Math.random() - 0.5) * 0.9]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xff9a3c, size: 0.022, map: DOT, alphaTest: 0.01, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  fxMats.push(mat);
  const pts = new THREE.Points(geo, mat);
  pts.userData.tick = (t) => {
    for (let i = 0; i < N; i++) {
      const [u, a] = seed[i];
      const s = 4.6 - ((u + t * 0.25) % 1) * 2.4;
      pos[i * 3] = s;
      pos[i * 3 + 1] = Math.sin(a) * (R + 0.01);
      pos[i * 3 + 2] = Math.cos(a) * (R + 0.01);
    }
    geo.attributes.position.needsUpdate = true;
  };
  g.add(pts);
  g.userData.fx = { fuel: pts };
}

// 4. Warhead
{
  const g = part("warhead", 5.35);
  const t = skin(4.7, 6.0, R, {
    seams: [4.74, 5.96], rivets: [4.77, 5.93],
    bands: [[5.0, 5.12, "#e0862e"], [5.18, 5.22, "#e0862e"]],
    panels: [[5.4, 5.8, -0.28, 0.28, true]],
    text: [[5.44, 0.0, 0.04, "SAP · 200–300 KG", "#1f2328", 600], [5.44, 0.12, 0.028, "HE · INERT TRAINING NO", "#3b4046", 500]],
  });
  g.add(mesh(lathe([[4.7, R], [6.0, R]]), paint(t)));
  g.add(cap(4.7, R, -1), cap(6.0, R, 1));
  const rings = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 8, 128), glow(0xff9a3c));
    r.rotation.y = Math.PI / 2;
    r.position.x = 5.35;
    r.userData.ph = i / 3;
    rings.add(r);
  }
  rings.userData.tick = (t) => rings.children.forEach((r) => {
    const k = (t * 0.6 + r.userData.ph) % 1;
    r.scale.setScalar(R + 0.06 + k * 0.55);
    r.material.opacity = (1 - k) * r.material.userData.a;
  });
  g.add(rings);
  g.userData.fx = { blast: rings };
}

// 5. Guidance bay
{
  const g = part("guidance", 6.5);
  const t = skin(6.0, 7.0, R, {
    seams: [6.04, 6.96], rivets: [6.07, 6.93],
    panels: [[6.16, 6.84, -0.42, 0.42, true], [6.2, 6.8, -0.36, 0.36, false], [6.38, 6.62, -1.3, -0.95, true]],
    text: [[6.24, 0.0, 0.04, "NAV · INS + GNSS", "#1f2328", 600], [6.24, 0.13, 0.028, "G3OM · DATA LINK", "#3b4046", 500]],
  });
  g.add(mesh(lathe([[6.0, R], [7.0, R]]), paint(t)));
  g.add(cap(6.0, R, -1), cap(7.0, R, 1));
  // GNSS antenna blister on top
  const ant = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.018, 48), M.radome());
  ant.position.set(6.5, R + 0.004, 0);
  g.add(ant);
  // satellites and their signals
  const sats = new THREE.Group();
  const satMat = new THREE.MeshStandardMaterial({ color: 0xd9dde0, metalness: 0.8, roughness: 0.3 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b3a5c, metalness: 0.5, roughness: 0.3, emissive: 0x0a1a2a });
  const spots = [[-1.6, 2.4, -0.6], [0.2, 2.9, 0.4], [1.9, 2.3, -0.2]];
  const sigN = 24;
  const sigPos = new Float32Array(spots.length * sigN * 3);
  const sigGeo = new THREE.BufferGeometry();
  sigGeo.setAttribute("position", new THREE.BufferAttribute(sigPos, 3));
  const sigMat = new THREE.PointsMaterial({ color: 0x3ddc97, size: 0.035, map: DOT, alphaTest: 0.01, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  fxMats.push(sigMat);
  const satMeshes = spots.map(([dx, y, z]) => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), satMat));
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.005, 0.12), panelMat);
      p.position.x = side * 0.26;
      s.add(p);
    }
    s.position.set(6.5 + dx, y, z);
    s.visible = false;
    sats.add(s);
    return s;
  });
  sats.add(new THREE.Points(sigGeo, sigMat));
  sats.userData.tick = (t, a) => {
    satMeshes.forEach((s, i) => { s.visible = a > 0.02; s.rotation.y = t * 0.3 + i; s.scale.setScalar(Math.max(0.001, a)); });
    spots.forEach(([dx, y, z], j) => {
      for (let i = 0; i < sigN; i++) {
        const k = (i / sigN + t * 0.5) % 1;
        const o = (j * sigN + i) * 3;
        sigPos[o] = 6.5 + dx * (1 - k);
        sigPos[o + 1] = R + (y - R) * (1 - k);
        sigPos[o + 2] = z * (1 - k);
      }
    });
    sigGeo.attributes.position.needsUpdate = true;
  };
  g.add(sats);
  g.userData.fx = { sats };
}

// 6. Intake cowl
{
  const g = part("intake", 7.45);
  const t = skin(7.0, 7.9, R, {
    seams: [7.04, 7.42], rivets: [7.07, 7.45],
    text: [[7.12, 0.0, 0.03, "AIR INTAKE · KEEP CLEAR", "#7a2c1c", 700]],
    paint: [[7.62, 7.9, -Math.PI, Math.PI, "#b23a22"]],
  });
  g.add(mesh(lathe([[7.0, R], [7.42, R], [7.56, 0.325], [7.7, 0.305], [7.82, 0.285], [7.9, 0.27]]), paint(t)));
  g.add(mesh(lathe([[7.9, 0.27], [7.905, 0.258], [7.9, 0.245]], 96), M.steel()));
  g.add(mesh(lathe([[7.9, 0.245], [7.3, 0.235]], 96), M.dark(), false));
  g.add(cap(7.0, R, -1));
  for (const a of [45, 135, 225, 315]) {
    const st = mesh(new THREE.BoxGeometry(0.12, 0.05, 0.014), M.steel(), false);
    st.geometry.translate(0, 0.225, 0);
    st.position.x = 7.8;
    st.rotation.x = a * DEG;
    g.add(st);
  }
  // air streaming into the ring
  const N = 260;
  const pos = new Float32Array(N * 3);
  const seed = Array.from({ length: N }, () => [Math.random(), Math.random() * TAU, 0.21 + Math.random() * 0.035]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0x8fd3ff, size: 0.016, map: DOT, alphaTest: 0.01, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  fxMats.push(mat);
  const pts = new THREE.Points(geo, mat);
  pts.userData.tick = (t) => {
    for (let i = 0; i < N; i++) {
      const [u, a, r] = seed[i];
      const k = (u + t * 0.9) % 1;
      const s = 11 - k * 3.4;
      const rr = s > 8.9 ? r + (s - 8.9) * 0.18 : r;
      pos[i * 3] = s;
      pos[i * 3 + 1] = Math.sin(a) * rr;
      pos[i * 3 + 2] = Math.cos(a) * rr;
    }
    geo.attributes.position.needsUpdate = true;
  };
  g.add(pts);
  g.userData.fx = { air: pts };
}

// 7. Radar seeker (centre body)
{
  const g = part("seeker", 8.3);
  const prof = [[7.86, 0.205], [8.02, 0.205]];
  for (let i = 1; i <= 24; i++) {
    const u = i / 24;
    prof.push([8.02 + u * 0.82, Math.max(0.002, 0.205 * Math.sqrt(1 - u ** 1.6))]);
  }
  g.add(mesh(lathe(prof), M.radome()));
  const band = mesh(lathe([[7.98, 0.207], [8.02, 0.207]], 96), M.steel());
  g.add(band);
  const tip = mesh(new THREE.SphereGeometry(0.012, 16, 12), M.steel());
  tip.position.x = 8.84;
  g.add(tip);
  g.add(cap(7.86, 0.205, -1));
  const waves = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 8, 96), glow(0xff9a3c));
    r.rotation.y = Math.PI / 2;
    r.userData.ph = i / 4;
    waves.add(r);
  }
  waves.userData.tick = (t) => waves.children.forEach((r) => {
    const k = (t * 0.55 + r.userData.ph) % 1;
    r.position.x = 8.95 + k * 1.3;
    r.scale.setScalar(0.08 + k * 0.32);
    r.material.opacity = Math.sin(k * Math.PI) * r.material.userData.a;
  });
  g.add(waves);
  g.userData.fx = { radar: waves };
}

// centre the missile on the origin (tail −46 → tip 884 → middle ≈ 4.2)
const MID = 4.2;
missile.position.x = -MID;

// per-part material lists for dimming
for (const g of Object.values(parts)) {
  g.userData.mats = [];
  g.traverse((o) => {
    if (!o.isMesh || fxMats.includes(o.material)) return;
    if (o.material.type === "ShaderMaterial") return;
    o.material.transparent = true;
    o.material.userData.sub = !!o.userData.sub;
    g.userData.mats.push(o.material);
  });
}
fxMats.forEach((m) => (m.userData.a = m.userData.a ?? 1));

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.45, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ---------- camera shots ----------
const SHOTS = [
  { at: "seeker", dist: 2.8, az: 48, el: 14, dx: 0.25 },
  { at: "intake", dist: 2.5, az: 62, el: 18, dx: 0.3 },
  { at: "guidance", dist: 3.1, az: 14, el: 38, dx: 0 },
  { at: "warhead", dist: 3.8, az: -14, el: 20, dx: 0 },
  { at: "tank", dist: 5.0, az: 18, el: 24, dx: 0 },
  { at: ["tank", "ramjet"], dist: 9.5, az: -24, el: 30, dx: 0 },
  { at: "ramjet", dist: 4.6, az: -52, el: 16, dx: -0.6 },
  { at: "booster", dist: 4.4, az: -60, el: 12, dx: -0.4 },
];

const state = { e: 0, step: -1, mode: "hero", fx: "", on: [], sub: false, mobile: false, offs: {} };
const cam = { tx: 0, ty: 0, tz: 0, dist: 12, az: 22, el: 16, fx: 0.6, fy: 0.72 };
let camNow = null;
const user = { az: 0, el: 0, vaz: 0, vel: 0, dragging: false };

function partCentre(id) {
  return centre[id] - MID + (state.offs[id] || 0);
}
function shotFor() {
  const m = state.mobile ? 1.65 : 1;
  if (state.step >= 0) {
    const S = SHOTS[state.step];
    const ids = [].concat(S.at);
    const x = ids.reduce((a, id) => a + partCentre(id), 0) / ids.length + S.dx;
    return { tx: x, ty: 0, tz: 0, dist: S.dist * m, az: S.az, el: S.el, fx: state.mobile ? 0.5 : 0.64, fy: state.mobile ? 0.34 : 0.5 };
  }
  const spread = state.e;
  const mid = (partCentre("booster") + partCentre("seeker")) / 2;
  if (state.mode === "hero") return { tx: mid, ty: 0, tz: 0, dist: 15 * m, az: 26, el: 14, fx: state.mobile ? 0.5 : 0.62, fy: state.mobile ? 0.74 : 0.7 };
  return { tx: mid, ty: 0, tz: 0, dist: (15 + spread * 8) * m, az: 20 - spread * 6, el: 16 + spread * 8, fx: 0.5, fy: state.mobile ? 0.6 : 0.62 };
}

// ---------- drag to look around ----------
const el = renderer.domElement;
let lastX = 0, lastY = 0;
el.addEventListener("pointerdown", (ev) => { user.dragging = true; lastX = ev.clientX; lastY = ev.clientY; el.setPointerCapture(ev.pointerId); });
el.addEventListener("pointermove", (ev) => {
  if (!user.dragging) return;
  user.vaz = -(ev.clientX - lastX) * 0.35;
  user.vel = (ev.clientY - lastY) * 0.25;
  user.az += user.vaz;
  user.el = Math.max(-25, Math.min(55, user.el + user.vel));
  lastX = ev.clientX; lastY = ev.clientY;
});
const up = () => (user.dragging = false);
el.addEventListener("pointerup", up);
el.addEventListener("pointercancel", up);

// ---------- loop ----------
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clock = new THREE.Clock();
const v3 = new THREE.Vector3();
const FXKEYS = { radar: "radar", air: "air", sats: "sats", blast: "blast", fuel: "fuel", boost: "boost", ram: "ram" };
const fxAmt = {};

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  const k = (tau) => (still ? 1 : 1 - Math.exp(-dt / tau));

  // explode
  for (const [id, g] of Object.entries(parts)) {
    g.position.x = state.offs[id] || 0;
    const focus = state.mode === "focus";
    const on = state.on.includes(id);
    const target = !focus || on ? 1 : 0.1;
    for (const m of g.userData.mats) {
      const want = on && state.sub && !m.userData.sub ? 0.18 : target;
      m.opacity += (want - m.opacity) * k(0.18);
      m.depthWrite = m.opacity > 0.5;
    }
    // highlight: a warm emissive lift on the part in focus
    for (const m of g.userData.mats) {
      if (!m.emissive) continue;
      const lit = focus && on && (!state.sub || m.userData.sub) ? 0.06 : 0;
      m.emissive.setRGB(lit * 1.0, lit * 0.55, lit * 0.2);
    }
    // effects
    for (const [name, obj] of Object.entries(g.userData.fx || {})) {
      const want = state.fx === FXKEYS[name] ? 1 : 0;
      fxAmt[name] = (fxAmt[name] || 0) + (want - (fxAmt[name] || 0)) * k(0.25);
      const a = fxAmt[name];
      obj.visible = a > 0.003;
      if (!obj.visible) continue;
      obj.traverse((o) => {
        const m = o.material;
        if (!m) return;
        if (m.uniforms) { m.uniforms.uA.value = a; m.uniforms.uT.value = t; }
        else if (o.isPoints) m.opacity = a * 0.9;
        else if (fxMats.includes(m)) m.userData.a = a;
      });
      if (obj.userData.tick) obj.userData.tick(t, a);
    }
  }

  // gentle hover
  missile.position.y = still ? 0 : Math.sin(t * 0.8) * 0.04;
  missile.rotation.x = still ? 0 : Math.sin(t * 0.5) * 0.015;

  // camera
  const s = shotFor();
  if (!camNow) camNow = { ...s };
  for (const key2 of ["tx", "ty", "tz", "dist", "az", "el", "fx", "fy"]) camNow[key2] += (s[key2] - camNow[key2]) * k(0.45);
  if (!user.dragging) {
    user.az *= 1 - k(2.5);
    user.el *= 1 - k(2.5);
  }
  const az = (camNow.az + user.az + (still ? 0 : Math.sin(t * 0.15) * 3)) * DEG;
  const elv = Math.max(-20, Math.min(70, camNow.el + user.el)) * DEG;
  v3.set(Math.sin(az) * Math.cos(elv), Math.sin(elv), Math.cos(az) * Math.cos(elv)).multiplyScalar(camNow.dist);
  camera.position.set(camNow.tx + v3.x, camNow.ty + v3.y, camNow.tz + v3.z);
  camera.lookAt(camNow.tx, camNow.ty, camNow.tz);
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.setViewOffset(w, h, -(camNow.fx - 0.5) * w, -(camNow.fy - 0.5) * h, w, h);
  key.position.set(camNow.tx + 4, 9, 7);
  key.target.position.set(camNow.tx, 0, 0);

  composer.render();
  requestAnimationFrame(frame);
}

window.M3D = {
  update(s) { Object.assign(state, s); },
  // screen position (px in the stage) of a part's centre, lifted by `lift` units
  screen(id, lift = 0.8) {
    v3.set(partCentre(id), lift + missile.position.y, 0).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * stage.clientWidth, y: (-v3.y * 0.5 + 0.5) * stage.clientHeight };
  },
};
stage.classList.add("gl-on");
requestAnimationFrame(frame);
