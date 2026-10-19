# The Glass Engine

A jet engine and an electric drive unit cut entirely from crystal glass. Light splits into colour at every edge, focuses into caustics that dance on the floor, and an inner fire lights the hot section like jewellery. The machine turns slowly; hold still and the picture refines itself, frame by frame, into a photoreal still. It is staged like a luxury product launch, not an engineering diagram.

Everything is procedural: no model files, no textures, no HDRIs. Built on three.js r186 and Vite 8, following `THREEJS_PLAYBOOK.md`.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. `npm run build` produces a static site in `dist/` (`npm run preview` serves it).

Useful URL parameters: `?skip` jumps past the intro, `?model=drivetrain` starts on the EV drive unit, `?preset=prism` starts from a look. The address bar carries the full state as `#s=…`, so any look can be shared as a link (the share button copies it).

## What you can do

| | |
|---|---|
| **Orbit** | drag · right-drag pans · wheel zooms · `1`–`6` jump to named camera views (Intake, Profile, Exhaust… for the turbofan; Gears, Profile, Motor end… for the drive unit). Views are relative to the machine, so they stay true however far the turntable has turned · `R` returns to the hero view |
| **Hold still** | the engine comes to rest for its portrait and the image refines (anti-aliasing, true depth of field, soft shadows, soft caustics and a continuous spectrum converge over up to 1024 frames). Any interaction brings it back to life |
| **Double-click** | sets the focus plane for depth of field on the part under the cursor |
| **Click a part** | selects its glass in the panel · hover for its name and spec |
| **Looks** | eight curated presets: Launch, Sapphire, Rose Quartz, Smoke, Prism, Ice, Obsidian, Cinema |
| **Model** | Turbofan or EV Drive Unit · explode · cutaway wedge (position, shells only or the core too) · per-part visibility |
| **Glass** | six glass roles (shell, primary rotor, inner stages, hot section, drive, details), each with tint, IOR, dispersion, roughness, thickness, depth tint and reach, iridescence, clearcoat, inner fire · global edge-rainbow strength, spread, edge tightness, drift, and fire reach |
| **Light** | five studio rigs (Showroom, Duotone, Gold Rim, Noir, Arctic) · environment intensity and rotation · key light intensity, azimuth, elevation, softness and colour · rim, fill, sparkle · inner fire |
| **Floor** | colour, roughness · planar reflection strength, blur and resolution · caustic strength, spread, contrast, blur and dance · shadow · horizon fade |
| **Motion** | turntable, fan and core speed, counter-rotation, float · what happens while refining: rest, crawl or keep turning · settle, turn and rest timings · pause (`Space`) |
| **Refine** | on/off · sample count · anti-aliasing · aperture and focus · light size · spectral sampling · progress HUD |
| **Image** | exposure · tone mapping (ACES, AgX, Neutral, Filmic, Reinhard, Linear) · bloom · vignette, grain, lens aberration · letterbox · backdrop mode and colours · resolution · refraction resolution |
| **Tools** | save a still (`S`), copy a share link, hide the interface (`H`), help (`?`), `D` shows frame stats |

## How it works

**Glass.** Every part wears one of six `GlassMaterial`s (`src/scene/materials.js`): a `MeshPhysicalMaterial` with transmission, dispersion, iridescence and clearcoat, extended through `onBeforeCompile` with an edge rainbow (a fresnel-weighted spectral rim, weighted by screen-space curvature so flat plates stay clean), an inner fire (emissive glow falling off from the hot axis) and a hover highlight. Parameters that would flip shader defines are clamped to a tiny epsilon, so all six slots share one program and never recompile. Transmissive glass is sorted front to back: it writes depth and samples a pre-rendered buffer, so order does not change the result and early depth rejection removes most overdraw.

**Caustics** (`src/render/caustics.js`). Every glass triangle is rendered from the key light's point of view, but each vertex is moved to where its refracted ray meets the floor. The ratio of a triangle's original footprint to its refracted footprint is the light concentration. Three passes with slightly different IORs write the red, green and blue channels, giving the rainbow fringes; max blending keeps stacked layers from piling up; a separable blur softens the result. The floor adds it as key irradiance × the fraction the shadow removed × Lambert, so clear glass gives back exactly the light its shadow took away, and the focus lines go brighter.

**Refinement** (`src/render/jitter.js`, `accumulate.js`). When the camera is still and the machine has come to rest, every frame jitters the camera by a sub-pixel offset, moves it on a thin-lens aperture disc while shearing the projection so the focus plane stays put, moves the key light on its disc, and nudges every slot's IOR across its dispersion band. The linear HDR frames are averaged in a ping-pong buffer before bloom and tone mapping. The result converges to anti-aliased edges, true bokeh, soft shadows, soft caustics and a continuous spectrum. Any change resets it.

**Motion director** (`src/main.js`). Turn → rest → turn. After the viewer settles, the engine keeps turning for a few seconds, glides to a halt, holds its photoreal portrait, then stirs again. Interaction resumes motion at once. Policies: rest, crawl (long-exposure blur) or keep turning (short-window accumulation).

**Studio** (`src/scene/studio.js`). The environment map is baked with PMREM from a dark room with emissive softbox panels; five rigs are data in `src/core/content.js`. One shadow-casting key light also drives the caustics; a rim, a hemisphere fill, two short-range sparkle lights and the inner-fire point light complete a constant light count. The floor is a `MeshPhysicalMaterial` patched with a planar reflection (the scene rendered from the mirrored camera into a mip-mapped texture, sampled in screen space with roughness-driven blur), the projected caustic texture, damped direct specular and a horizon fade into the backdrop. The backdrop is an inverted sphere with a gradient and a soft glow that always sits behind the model.

**Models** (`src/scene/engine/`). The turbofan: nacelle and core cowl as closed lathe shells, 22 swept fan blades, three LP and six HP compressor stages, stator rows, a 14-can combustor, two HP and four LP turbine stages, exhaust plug, two shafts, bypass struts, flanges and bead rings — about 276k triangles in 17 draws. The EV drive unit: motor housing with fins, a 48-slot stator with hairpin end windings, an 8-pole rotor, a 17/57 and 21/73 two-stage gear train with correctly meshing teeth, differential and half-shafts, an open gear frame and the inverter. Blades are lofted NACA-style airfoil sections with chord taper, twist, camber, sweep and rounded tips (`bladeGeo`); gears are rounded-tooth outlines extruded with a bevel (`gearGeo`, `gearPhase`). Each part merges into one mesh per glass role, so parts can be hidden, exploded and cut individually.

**State** (`src/core/state.js`). A plain object tree outside the scene graph; the scene reflects it. Presets are patches over the defaults; the URL hash holds the diff.

## Layout

```
index.html                 the page: canvas, title, toolbar, deck, views, HUD, help, loader
src/main.js                renderer, camera, store dispatch, motion director, refine state machine, picking, loop
src/style.css              the look of the interface
src/core/   state.js       defaults, store, presets merge, URL serialisation
            content.js     strings, models, roles, studio rigs, presets, camera views, help
            geo.js         primitives, lathe-around-Z, airfoil blade loft, gears, radial arrays, merge
            rng.js, tween.js
src/scene/  materials.js   glass, floor, backdrop, tone-mapping table
            studio.js      environment, lights, backdrop, floor
            assembly.js    parts, spools, explode, cutaway planes, bounds
            engine/jet.js, drivetrain.js, parts.js
src/render/ post.js        Render → Accumulate → Bloom → Output → Finish
            accumulate.js  progressive average with NaN guards
            jitter.js      camera / lens / light jitter, camera-still tracker
            caustics.js    light-space refracted caustics
            reflection.js  planar floor reflection
            quality.js     real-frame statistics for adaptive resolution
src/ui/     ui.js, controls.js
```

## Measured

At 1440×900 and pixel ratio 1.5 on the turbofan: about 155 draws and 2.1M triangles per frame across every pass (shadow map, three caustic channel passes, half-resolution reflection with its own refraction pass, the refraction pre-pass, the beauty pass and the post chain), 17 of which are the engine itself. The accumulation converges in about four seconds at 60 fps with the default 256 samples.

## Known limits

- three's transmission shows glass behind glass only through back faces, so inner parts seen through the nacelle are their interior surfaces. It reads as glass, but a path tracer would show more.
- Caustics use a single refraction per surface with a controllable blend towards straight-through for thin glass; they are an artistic approximation, not photon mapping.
- The planar reflection renders the scene a second time; set reflection resolution to ⅓ or off on slower machines. Resolution "Auto" steps down when real frames fall below about 28 fps.
