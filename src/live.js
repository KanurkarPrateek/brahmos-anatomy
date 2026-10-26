// Scroll story runtime. Scroll progress is eased toward its target every
// frame, and everything (take-apart, camera, cards, flight) is drawn from that.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (a, b, x) => clamp((x - a) / (b - a));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const { W, H, axis, anchors, off, order } = DATA;
  const story = $("#story");
  const stage = $("#stage");
  const cam = $("#cam");
  const partEls = Object.fromEntries($$(".part").map((g) => [g.dataset.part, g]));
  const cards = $$(".card");
  const railItems = $$(".rail li");
  const railFill = $("#railFill");
  const hudState = $("#hudState");
  const beats = Object.fromEntries($$(".beat").map((b) => [b.dataset.beat, b]));
  const svg = $(".missile-svg");

  // ---------- timeline of the story ----------
  const T = { origin: 0.045, split: 0.1, apart: 0.17, steps: 0.195, step: 0.087, outro: 0.9 };
  const STEPS = [
    { parts: ["seeker"], fx: "radar", zoom: 3.3, nudge: [70, 0], hud: "SEEKER" },
    { parts: ["intake"], fx: "air", zoom: 3.0, nudge: [60, 0], hud: "INTAKE" },
    { parts: ["guidance"], fx: "sats", zoom: 2.1, nudge: [0, -110], hud: "GUIDANCE" },
    { parts: ["warhead"], fx: "blast", zoom: 2.7, nudge: [0, 0], hud: "WARHEAD" },
    { parts: ["tank"], fx: "fuel", zoom: 1.9, nudge: [0, 0], hud: "FUEL TANK" },
    { parts: ["tank", "ramjet"], sub: true, fx: "", zoom: 1.25, nudge: [0, 0], hud: "WINGS & FINS" },
    { parts: ["ramjet"], fx: "ram", zoom: 1.45, nudge: [-190, 0], hud: "RAMJET · STAGE 2" },
    { parts: ["booster"], fx: "boost", zoom: 1.45, nudge: [-130, 0], hud: "BOOSTER · STAGE 1" },
  ];
  const TAGS = [
    ["seeker", "Seeker"], ["intake", "Intake"], ["guidance", "Guidance"], ["warhead", "Warhead"],
    ["tank", "Fuel + wings"], ["ramjet", "Ramjet + fins"], ["booster", "Booster"],
  ];
  const leader = $("#leader"), ldPath = $("#ldPath"), ldDot = $("#ldDot"), reticle = $("#reticle"), ldLabel = $("#ldLabel");
  const LD = { seeker: "ACTIVE RADAR", intake: "ANNULAR INLET", guidance: "INS + GNSS BAY", warhead: "SAP WARHEAD", tank: "FUEL · WINGS", ramjet: "STAGE 2", booster: "STAGE 1" };
  let ldStep = -1, ldDrawT = 0;
  const tagsEl = $("#tags");
  const tagEls = TAGS.map(([id, name], i) => {
    const t = document.createElement("div");
    t.className = "tag";
    t.innerHTML = `<span>0${i + 1}</span>${name}<i></i>`;
    tagsEl.appendChild(t);
    return { id, el: t };
  });

  // the explode, staggered so the outer parts leave first
  const maxOff = Math.max(...Object.values(off).map(Math.abs));
  const partE = (id, e) => {
    const d = (1 - Math.abs(off[id]) / maxOff) * 0.35;
    return ease(clamp((e - d) / (1 - d)));
  };
  const posOf = (id, e) => {
    const f = partE(id, e) * off[id];
    return [anchors[id][0] + axis[0] * f, anchors[id][1] + axis[1] * f];
  };
  const centreAt = (e) => {
    const a = posOf("booster", e);
    const b = posOf("seeker", e);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };

  // camera target for a given story progress
  // Put world-drawing point c at viewport fraction (fx, fy) with zoom z.
  function place(c, z, fx, fy) {
    const m = svg.getScreenCTM();
    if (!m || !m.a) return [c[0], c[1], z];
    const tx = (fx * innerWidth - m.e) / m.a;
    const ty = (fy * innerHeight - m.f) / m.d;
    return [c[0] - (tx - W / 2) / z, c[1] - (ty - H / 2) / z, z];
  }
  function cameraFor(p, e, mobile) {
    if (p < T.steps || p >= T.outro) {
      const c = centreAt(e);
      if (p < T.origin) return mobile ? place(c, 1.6, 0.5, 0.76) : place(c, 1.1, 0.6, 0.74);
      const z = mobile ? lerp(1.6, 1.0, e) : lerp(1.1, 1.0, e);
      return mobile ? place(c, z, 0.5, 0.6) : place(c, z, 0.5, 0.64);
    }
    const i = Math.min(STEPS.length - 1, Math.floor((p - T.steps) / T.step));
    const S = STEPS[i];
    let c = [0, 0];
    S.parts.forEach((id) => { const q = posOf(id, e); c[0] += q[0] / S.parts.length; c[1] += q[1] / S.parts.length; });
    c = [c[0] + S.nudge[0], c[1] + S.nudge[1]];
    return mobile ? place(c, S.zoom * 1.7, 0.5, 0.32) : place(c, S.zoom, 0.63, 0.52);
  }

  // ---------- launch scene ----------
  const fp = $("#flightPath");
  const L = fp.getTotalLength();
  const trail = $("#trail");
  const trailGlow = $("#trailGlow");
  trail.style.strokeDasharray = trailGlow.style.strokeDasharray = `${L} ${L}`;
  const lenAtX = (x) => {
    let lo = 0, hi = L;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (fp.getPointAtLength(m).x < x) lo = m; else hi = m; }
    return hi;
  };
  const F_SEP = lenAtX(292) / L;
  const F_CRUISE = lenAtX(560) / L;
  const F_TERM = lenAtX(1160) / L;
  const F_SKIM = lenAtX(1330) / L;
  const F_HIT = lenAtX(1416) / L;
  const PINS = [[0.0005, "LAUNCH"], [F_SEP, "BOOSTER OFF"], [lenAtX(720) / L, "RAMJET CRUISE"], [F_TERM, "DESCENT"], [F_SKIM, "SEA-SKIM"]];
  const pinsEl = $("#pins");
  pinsEl.innerHTML = PINS.map(([f, label], i) => {
    const q = fp.getPointAtLength(f * L);
    const up = i === 4 ? 24 : -16;
    return `<g data-f="${f}"><circle cx="${q.x}" cy="${q.y}" r="4.5"/><text x="${q.x + 9}" y="${q.y + up}">${label}</text></g>`;
  }).join("");
  const pinEls = $$("#pins g");
  const mis = $("#mis");
  const misBoost = $("#misBoost");
  const misFlame = $("#misFlame");
  const spent = $("#spent");
  const flash = $("#flash");
  const ship = $("#ship");
  const lcards = $$("#lcards article");
  const rPhase = $("#rPhase"), rStage = $("#rStage"), rMach = $("#rMach"), rAlt = $("#rAlt");
  const sepPt = fp.getPointAtLength(F_SEP * L);
  const gMach = $("#gMach"), gNeedle = $("#gNeedle"), tapeFill = $("#tapeFill"), tapeMark = $("#tapeMark");
  const pip1 = $("#pip1"), pip2 = $("#pip2"), segs = $$("#rSegs u");
  const GLEN = gMach.getTotalLength();
  gMach.style.strokeDasharray = `${GLEN} ${GLEN}`;
  const launch = $("#launch");

  function drawFlight(lp) {
    const f = clamp(seg(0.04, 0.9, lp));
    const at = f * L;
    const q = fp.getPointAtLength(at);
    const q2 = fp.getPointAtLength(Math.min(L, at + 2));
    const q0 = fp.getPointAtLength(Math.max(0, at - 2));
    const ang = (Math.atan2(q2.y - q0.y, q2.x - q0.x) * 180) / Math.PI;
    const hit = f >= F_HIT;
    mis.setAttribute("transform", `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(.9)`);
    mis.style.opacity = hit ? 0 : 1;
    trail.style.strokeDashoffset = trailGlow.style.strokeDashoffset = (L - at).toFixed(1);
    const boosting = f < F_SEP;
    misBoost.style.opacity = boosting ? 1 : 0;
    const flick = 0.9 + Math.random() * 0.2;
    const fl = lp < 0.04 ? 0 : boosting ? 1.25 * flick : 0.7 * flick;
    misFlame.setAttribute("transform", `scale(${fl.toFixed(2)} ${(boosting ? 1.3 : 0.8).toFixed(2)})`);
    // spent booster tumbles away after separation
    if (f > F_SEP) {
      const t = (f - F_SEP) * 9;
      const x = sepPt.x - 26 - 50 * t;
      const y = Math.min(668, sepPt.y + 340 * t * t + 10 * t);
      spent.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-20 + 160 * t).toFixed(0)})`);
      spent.setAttribute("opacity", (y >= 668 ? 0 : 1).toString());
    } else spent.setAttribute("opacity", "0");
    // impact
    const k = seg(F_HIT, 1, f);
    flash.setAttribute("r", (k > 0 ? 40 + 160 * ease(k) : 0).toFixed(1));
    flash.style.opacity = k > 0 ? (1 - k * 0.6).toFixed(2) : 0;
    ship.style.opacity = hit ? 0.35 : 1;
    pinEls.forEach((g) => g.classList.toggle("hit", f >= +g.dataset.f));
    // readouts
    let ph = 0;
    if (lp >= 0.04) ph = 1;
    if (f >= F_SEP) ph = 2;
    if (f >= F_CRUISE) ph = 3;
    if (f >= F_TERM) ph = 4;
    if (f >= F_SKIM) ph = 5;
    lcards.forEach((c, i) => c.classList.toggle("show", i === ph));
    rPhase.textContent = ["Ready", "Boost", "Transition", "Cruise", "Terminal", hit ? "Impact" : "Strike"][ph];
    rStage.textContent = ph === 0 ? "—" : boosting ? "1 · solid booster" : "2 · ramjet";
    let mach = 0;
    if (ph >= 1) mach = boosting ? 2.0 * ease(f / F_SEP) : lerp(2.0, 2.8, ease(seg(F_SEP, F_CRUISE, f)));
    rMach.textContent = mach.toFixed(1);
    let alt;
    if (lp < 0.04) alt = 0;
    else if (q.x < 720) alt = Math.max(0, ((504 - q.y) / 334) * 15000);
    else alt = Math.max(10, ((660 - q.y) / 490) * 15000);
    gMach.style.strokeDashoffset = (GLEN * (1 - clamp(mach / 3))).toFixed(1);
    gNeedle.setAttribute("transform", `rotate(${(-90 + 180 * clamp(mach / 3)).toFixed(1)} 50 52)`);
    const altF = hit ? 0 : clamp(alt / 15000);
    tapeFill.style.height = `${(altF * 100).toFixed(1)}%`;
    tapeMark.style.bottom = `${(altF * 100).toFixed(1)}%`;
    segs.forEach((u, i) => u.classList.toggle("on", i < ph + (hit ? 1 : 0)));
    pip1.classList.toggle("on", ph >= 1 && boosting);
    pip2.classList.toggle("on", ph >= 1 && !boosting);
    rAlt.textContent = hit ? "0 m" : alt >= 1000 ? `${(alt / 1000).toFixed(1)} km` : `${Math.round(alt)} m`;
  }

  // ---------- frame loop ----------
  let sp = 0, lpS = 0;
  let camNow = null;
  let last = performance.now();
  let lastStep = -2;
  let lastCam = "";
  const lastPart = {};
  const progressOf = (el) => {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight));
  };

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = still ? 1 : 1 - Math.exp(-dt / 0.11);
    const pTarget = progressOf(story);
    sp += (pTarget - sp) * k;
    if (Math.abs(pTarget - sp) < 1e-5) sp = pTarget;
    const p = sp;
    const mobile = innerWidth < 860;

    // explode amount
    const e = seg(T.split, T.apart, p) * (1 - seg(T.outro, T.outro + 0.06, p));
    for (const id of order) {
      const f = partE(id, e) * off[id];
      const t = `translate(${(axis[0] * f).toFixed(1)} ${(axis[1] * f).toFixed(1)})`;
      if (lastPart[id] !== t) { partEls[id].setAttribute("transform", t); lastPart[id] = t; }
    }

    // which beat / step
    const inSteps = p >= T.steps && p < T.outro;
    const step = inSteps ? Math.min(STEPS.length - 1, Math.floor((p - T.steps) / T.step)) : -1;
    const local = inSteps ? (p - T.steps - step * T.step) / T.step : 0;
    let mode = "hero";
    if (p >= T.origin) mode = "intro";
    if (p >= T.apart - 0.01 && !inSteps) mode = "apart";
    if (inSteps) mode = "focus";
    if (p >= T.outro) mode = "outro";
    stage.dataset.mode = mode;
    beats.hero.classList.toggle("show", p < T.origin);
    beats.origin.classList.toggle("show", p >= T.origin && p < T.split + 0.01);
    beats.split.classList.toggle("show", p >= T.split + 0.01 && p < T.steps - 0.005);
    beats.outro.classList.toggle("show", p >= T.outro + 0.03);

    if (step !== lastStep) {
      lastStep = step;
      cards.forEach((c, i) => c.classList.toggle("show", i === step));
      railItems.forEach((li, i) => li.classList.toggle("on", i === step));
      for (const id of order) partEls[id].classList.remove("on", "subonly");
      if (step >= 0) {
        const S = STEPS[step];
        S.parts.forEach((id) => { partEls[id].classList.add("on"); if (S.sub) partEls[id].classList.add("subonly"); });
        stage.dataset.fx = S.fx;
        hudState.textContent = `${String(step + 1).padStart(2, "0")} / 08 · ${S.hud}`;
      } else {
        stage.dataset.fx = "";
        hudState.textContent = e > 0.98 ? "EXPLODED · 7 SECTIONS" : e > 0.01 ? "SEPARATING" : "ASSEMBLED";
      }
    }
    if (step >= 0) {
      $$(".flow li", cards[step]).forEach((li, j) => li.classList.toggle("in", local > 0.08 + j * 0.16));
    }
    railFill.style.height = `${(clamp((p - T.steps) / (T.outro - T.steps)) * 100).toFixed(1)}%`;

    // 3D model (src/gl.js), when WebGL is up
    if (window.M3D) {
      const offs = {};
      for (const id of order) offs[id] = (partE(id, e) * off[id]) / 100;
      const S = step >= 0 ? STEPS[step] : null;
      window.M3D.update({ e, step, mode, mobile, offs, on: S ? S.parts : [], sub: !!(S && S.sub), fx: S ? S.fx : "" });
    }

    // camera
    const target = cameraFor(p, e, mobile);
    if (!camNow) camNow = target.slice();
    const kc = still ? 1 : 1 - Math.exp(-dt / 0.38);
    for (let i = 0; i < 3; i++) camNow[i] += (target[i] - camNow[i]) * kc;
    const [cx, cy, z] = camNow;
    const camStr = `translate(${W / 2} ${H / 2}) scale(${z.toFixed(4)}) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})`;
    if (camStr !== lastCam) { cam.setAttribute("transform", camStr); lastCam = camStr; }

    // tags over the exploded drawing
    if (mode === "apart" && window.M3D) {
      tagEls.forEach(({ id, el }) => {
        const q = window.M3D.screen(id, id === "tank" ? 1.0 : id === "ramjet" ? 0.95 : 0.5);
        el.style.left = `${q.x}px`;
        el.style.top = `${q.y}px`;
      });
    } else if (mode === "apart") {
      const m = svg.getScreenCTM();
      const up = DATA.up;
      tagEls.forEach(({ id, el }) => {
        const q = posOf(id, e);
        const lift = id === "tank" ? 90 : id === "ramjet" ? 80 : 46;
        const wx = (q[0] + up[0] * lift - cx) * z + W / 2;
        const wy = (q[1] + up[1] * lift - cy) * z + H / 2;
        el.style.left = `${m.a * wx + m.e}px`;
        el.style.top = `${m.d * wy + m.f}px`;
      });
    }

    // leader line from the text to the part, ending in a reticle
    if (window.M3D && step >= 0 && !mobile) {
      const S = STEPS[step];
      const id = S.parts[0];
      if (step !== ldStep) {
        ldStep = step;
        leader.classList.remove("drawn");
        ldDrawT = now + 350;
        ldLabel.textContent = LD[id] || "";
      }
      const h = cards[step].querySelector("h3").getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      const a = [h.left - sr.left + Math.min(h.width, 420) + 24, h.top - sr.top + h.height / 2];
      const b = window.M3D.screen(id, S.sub ? 0.75 : 0);
      const midX = a[0] + Math.max(30, (b.x - a[0]) * 0.35);
      const d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)}H${midX.toFixed(1)}L${(b.x - 48).toFixed(1)} ${b.y.toFixed(1)}`;
      ldPath.setAttribute("d", d);
      const len = midX - a[0] + Math.hypot(b.x - 48 - midX, b.y - a[1]);
      ldPath.style.setProperty("--len", Math.ceil(len + 2));
      ldDot.setAttribute("cx", a[0].toFixed(1));
      ldDot.setAttribute("cy", a[1].toFixed(1));
      reticle.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`);
      ldLabel.setAttribute("x", (b.x + 54).toFixed(1));
      ldLabel.setAttribute("y", (b.y - 40).toFixed(1));
      leader.classList.add("on");
      if (now > ldDrawT) leader.classList.add("drawn");
    } else {
      leader.classList.remove("on", "drawn");
      ldStep = -1;
    }

    // launch
    const lpT = progressOf(launch);
    lpS += (lpT - lpS) * k;
    const lr = launch.getBoundingClientRect();
    if (lr.top < innerHeight && lr.bottom > 0) drawFlight(lpS);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- small things ----------
  railItems.forEach((li) => li.addEventListener("click", () => {
    const i = +li.dataset.go;
    const top = story.offsetTop + (T.steps + (i + 0.45) * T.step) * (story.offsetHeight - innerHeight);
    scrollTo({ top, behavior: "smooth" });
  }));

  // hero counters
  $$("[data-count]").forEach((el) => {
    const to = +el.dataset.count;
    const dec = +(el.dataset.dec || 0);
    const t0 = performance.now() + 500;
    const tick = (now) => {
      const t = still ? 1 : clamp((now - t0) / 1600);
      const v = to * (1 - (1 - t) ** 3);
      el.textContent = el.dataset.sep !== undefined ? Math.round(v).toLocaleString("en-US") : v.toFixed(dec);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // stars over the launch sky
  {
    let st = "";
    for (let i = 0; i < 170; i++) {
      const x = Math.random() * 1600, y = Math.random() * 520 * Math.random();
      const r = Math.random() < 0.08 ? 1.4 : 0.4 + Math.random() * 0.7;
      st += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" opacity="${(0.25 + Math.random() * 0.6).toFixed(2)}"${Math.random() < 0.3 ? ` class="tw" style="animation-delay:${(Math.random() * 3).toFixed(2)}s"` : ""}/>`;
    }
    $("#stars").innerHTML = st;
  }

  // page progress, glass header, timeline fill
  const prog = $("#prog"), topBar = $("#top"), tl = $("#tl"), tlFill = $("#tlFill");
  const tlItems = $$("#tl li");
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.width = `${((scrollY / max) * 100).toFixed(2)}%`;
    topBar.classList.toggle("solid", scrollY > story.offsetHeight - innerHeight * 0.5);
    const r = tl.getBoundingClientRect();
    const reach = clamp((innerHeight * 0.62 - r.top) / r.height);
    tlFill.style.height = `${(reach * 100).toFixed(1)}%`;
    tlItems.forEach((li) => li.classList.toggle("lit", li.getBoundingClientRect().top + 14 < innerHeight * 0.62));
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // spotlight on variant cards
  $$(".vcard").forEach((c) => c.addEventListener("pointermove", (ev) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${ev.clientX - r.left}px`);
    c.style.setProperty("--my", `${ev.clientY - r.top}px`);
  }));

  // big stat counters, started when they come into view
  const countUp = (el) => {
    const to = +el.dataset.to, dec = +(el.dataset.dec || 0), t0 = performance.now();
    const tick = (now) => {
      const t = still ? 1 : clamp((now - t0) / 1800);
      const v = to * (1 - (1 - t) ** 4);
      el.textContent = el.dataset.sep !== undefined ? Math.round(v).toLocaleString("en-US") : v.toFixed(dec);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io2 = new IntersectionObserver((list) => list.forEach((en) => {
    if (!en.isIntersecting) return;
    $$("[data-to]", en.target).forEach(countUp);
    io2.unobserve(en.target);
  }), { threshold: 0.4 });
  $$(".bs").forEach((b) => io2.observe(b));

  $("#toTop").addEventListener("click", (ev) => { ev.preventDefault(); scrollTo({ top: 0, behavior: "smooth" }); });

  // reveal blocks
  const io = new IntersectionObserver((list) => list.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.15 });
  $$(".reveal").forEach((el, i) => { el.style.transitionDelay = `${(i % 6) * 70}ms`; io.observe(el); });
})();
