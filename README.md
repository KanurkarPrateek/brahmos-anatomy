# BrahMos Anatomy

A scroll story through the BrahMos supersonic cruise missile. A detailed 3D model (Three.js) comes apart into its seven sections, and the camera visits each one: radar seeker, air intake, guidance bay, warhead, fuel tank and wings, ramjet with tail fins, and the solid booster. After that comes the flight from canister to target, the variants, a timeline and a spec sheet.

**Live:** https://kanurkarprateek.github.io/brahmos-anatomy/

## Build

```sh
node build.mjs   # writes index.html
```

- `src/gl.js` – the 3D model, lighting, effects and camera
- `src/live.js` – the scroll timeline that drives it
- `src/page.html`, `src/style.css` – the page
- `kit/` – the [Anatomy](https://github.com/wheresryan22/anatomy) kit (MIT), used for the SVG fallback drawing

An educational explainer built from public sources. Not affiliated with BrahMos Aerospace, DRDO or any government.

Made with ♥ by [Prateek Kanurkar](https://github.com/prateekkanurkar)
