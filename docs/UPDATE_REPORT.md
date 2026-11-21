AboveGround (T-Verse) — Research Synthesis & Feature Upgrade Report

1. Evidence Baseline: What Actually Breaks on the MBTA in 2026

Any copy, AI prompts, seed data, or pitch metrics in AboveGround must reflect verified June–November 2026 rider evidence rather than outdated 2023 assumptions:

⚬ Do NOT center the app on "slow zones": Massachusetts reported clearing existing subway speed restrictions in December 2024 after removing more than 220. The Boston Region MPO later reported FY25 annual averages of only 2.18% of directional revenue miles under performance restrictions for heavy rail, 0.30% for light rail, and 1.68% for Commuter Rail.
⚬ Planned closures are an ongoing reality: The MBTA's November 19 announcement projects 100 days of planned disruptions in 2027, following 132 reported in 2026.
⚬ Five core rider failure modes validated across Reddit (r/mbta, r/boston, r/CambridgeMA, r/Somerville) and X:
  1. Stale predictions & late alerts: Riders repeatedly see an imminent arrival or "normal" status while service is already stuck—such as a failed 3-minute Orange Line prediction at Downtown Crossing (Aug 17), a Pawtucket/Central Falls screen showing an arrival time that had already passed (Oct 28), and a Fitchburg rider seeing normal status while sitting on a stopped train (Nov 7).
  2. Branch-level gaps hidden by trunk averages: Trunk-level status hides severe branch waits—for example, four Union Square Green Line trains passing before one packed Medford/Tufts train (Sept 2), a 30+ minute Green-D wait with a train passing without stopping during shortened Riverside–Kenmore service (Nov 15), a 20+ minute Ashmont wait at Park Street (Nov 17), back-to-back Braintree trains pulled out of service (Nov 16), and recurring Blue Line holds near Airport–Wonderland alongside overhead-wire inspections (July 28, Aug 6, Nov 18).
  3. Shuttle transfer confusion & fare friction during closures: During planned diversions, riders lose substantial time locating pickups and re-entering rail—including a 25-minute wait and missed shuttle from standing at the wrong Central Square pickup (July 21 Red Line closure), learning of a Green Line closure only after transferring at Park Street (Sept 20), a 50-minute Green St → Back Bay shuttle trip (Sept 10 Orange Line), a broken-down shuttle during the Nov 20 Red Line work, and needing staff assistance at Back Bay to avoid paying a double fare when re-entering rail after a Green Line shuttle (Nov 15).
  4. Boarding denials (pass-ups) & localized crowding: Green-B riders report being unable to board downtown, a Green-D train passed a stop without opening doors, and Salem-bound Commuter Rail riders at Lynn reported being unable to board even during added October event service.
  5. Cancellation recovery blindness: After cancellations or terminations (such as Providence/Stoughton trains terminating at Ruggles with limited announcements and multi-hour delays), riders lack clear guidance on the next actually usable train.

2. Strategic Product Positioning (For UX & Pitch Alignment)

Claude Code should align UI labels, copy, and interactions around five non-negotiable product rules:

1. Transparency & Agency > Generic Arcade Gaming ("Clash Royale" Check): Do not frame the delay interaction as a generic time-killer (riders would rather play Clash Royale or scroll social media). Frame the 3D station repair module as a Behind-the-Scenes Disruption Visualizer: when a line is held or shut down (e.g., Green Line signal modernization or Blue Line overhead-wire inspection), riders tap the 3D station to inspect what crews are actually fixing inside the tunnel and interact with a 15-second schematic repair step to build empathy and clarity.
2. Low-Friction 1-Tap Reports Alongside T-Feed: Commuters rushing with bags will not type long posts. Keep the Instagram-style T-Feed for food finds, station vibes, and photos, and pair it with a 1-tap "Waze for the T" Quick-Check bar requiring zero typing.
3. Underground / Low-Signal Resilience: Boston riders lose cell service inside underground tunnels and stations. Pre-cache lightweight 3D .glb station models and static route geometry locally (browser/Service Worker cache), and queue 1-tap reports in localStorage to auto-sync when connectivity returns.
4. Single Cohesive Track Focus: Keep everything unified inside one Transit Gamification experience—do not fork separate apps or unrelated side-projects.
5. MLH Gemini API Integration: Wire the AI Plain-English Delay Translator and Tourist Station Narrator through the official google-genai SDK (GEMINI_API_KEY from env), while always keeping rich deterministic local fallbacks so demos never stall on API latency or missing keys.

3. Concrete Feature Additions to Consider & Implement

Feature A: 1-Tap "Waze for the T" Quick-Check Bar (Directly Solves Problems 01, 02, 05)

Add a compact, thumb-friendly floating check-in strip at the bottom of any selected Station Drawer (and inside T-Feed) awarding +10 CharliePoints per tap with zero typing:

⚬ Ghost Train / Stale Prediction Flag: Prediction Accurate? → On Time | Ghost / Stale (directly addresses riders seeing imminent predictions while trains are stopped). If 2+ reports or an automated shadow-check detect a vehicle stalled while predictions still tick down, surface an amber Unverified / Stale ETA badge on that stop.
⚬ Boarding & Crowding Check: Can You Board? → Seats Open | Packed | Pass-Up (Too Full) (tracks localized crowding and boarding denials on Green-B/D, Red branches, and Commuter Rail).
⚬ Station & Car Conditions: 1-tap chips for Elevator Out (cross-referenced with MBTA V3 /facilities), Spill / Mess, No AC / Heat, and Shuttle Confusion.
⚬ Offline Queue: If navigator.onLine === false or the POST fails, store the report in localStorage under pending_t_reports, show a "Queued — will sync at next stop" pill, and flush automatically on the browser online event.

Feature B: Branch-Level Headway Gap & "Next Usable Train" Badge (Solves Problems 02 & 04)

⚬ Instead of showing a single generic "Green Line: Normal" pill, compute branch-specific arrival gaps per stop and direction (e.g., Green-B, Green-D, Green-E, Red-Ashmont, Red-Braintree, Blue-Wonderland).
⚬ Flag any branch whose next arrival exceeds 1.5× scheduled headway (or > 15 min on rapid transit) with a clear amber Branch Gap Alert indicator so riders know whether they are watching four Union Square trains pass before their Medford/Tufts train.
⚬ When an active alert indicates a short-turn, termination, or cancellation, highlight the Next Actually Usable Departure (e.g., "Terminating at Kenmore — next full-route train in 14m") rather than displaying a dead trip.

Feature C: Planned-Closure "Shuttle Wayfinder & Re-Entry" Card (Solves Problem 03)

Because the MBTA has 100 planned disruption days scheduled for 2027, upgrade any closed/diverted station on the 3D map so tapping it shows:

⚬ Exact Shuttle Pickup Pin dropped visually on the 3D street grid above the station (eliminating wrong-side pickup waits like the July 21 Central Square diversion).
⚬ Walking Time & Accessibility Note from the T exit to the shuttle curb.
⚬ Fare Re-Entry Reminder when re-boarding rail after a shuttle transfer (e.g., "Ask station ambassador at Back Bay gates for free shuttle transfer re-entry").

Feature D: Upgrade "Fix the T" Into a Real-Work 3D Disruption Visualizer + Gemini API

⚬ Seed realistic 2026 disruption scenarios grounded in actual MBTA failure modes:
  1. Boylston / Green Line Signal Modernization (track circuit & signal relay schematic)
  2. Blue Line Airport–Wonderland Overhead Wire Inspection (catenary tension / power contact check)
  3. Harvard / Red Line Signal Delay & Disabled Train Recovery (switch clearance & reroute)
  4. Chinatown / Orange Line Track Problem & Shuttle Bridge (rail fastener inspection + shuttle dispatch)
⚬ Wire /backend/ai_translator.py to use the official Python google-genai client (from google import genai) reading GEMINI_API_KEY to generate:
  ⚬ Plain-English Disruption Translation (2 sentences: what physically broke + why the wait takes X minutes + smartest alternate move).
  ⚬ Tourist Station Mini-Stories (short 2-sentence above-ground fact read via window.speechSynthesis).
  ⚬ AI Line Vibe Summary (optional 1-line summary of the last 5 T-Feed posts + 1-tap reports for each line).
⚬ Always wrap Gemini calls in a 4-second timeout with instant pre-written fallback text.

4. Blender (bpy) + Three.js 3D Station Pipeline Spec

To upgrade station visuals without slowing down mobile browsers or wasting hours sculpting by hand, generate stylized low-poly .glb models via headless Blender Python (bpy) and load them through Three.js GLTFLoader.

Strict Performance & Geometry Budget

⚬ Triangle count: < 2,500–3,000 triangles per .glb file.
⚬ File size: < 300 KB per .glb file (fast load + trivial offline caching).
⚬ Materials: Flat/stylized Principled BSDF materials with Emission Color + Emission Strength (1.5–3.0) on windows, T-signs, and neon transit trim (Green #00843D, Red #DA291C, Orange #ED8B00, Blue #003DA5). Zero external PNG textures.
⚬ Coordinate & Axis Invariant:
  ⚬ Build each station centered at (0, 0, 0) with base resting at z = 0, scaled in real-world meters (~15–25m wide).
  ⚬ Export with export_format='GLB', export_yup=True, export_apply=True (converts Blender Z-up to glTF/Three.js Y-up).
  ⚬ Inside MapLibre's Three.js CustomLayerInterface, keep rotateX(Math.PI / 2) on the Mercator model transform so Y-up stands upright off the map plane.

4 Iconic Boston Station Models (/scripts/generate_stations.py → /frontend/public/models/)

1. park_street.glb: Classic sloped green-copper headhouse roof, illuminated arched entry, and glowing circular "T" lollipop sign post.
2. kenmore.glb: Curved steel-and-glass busway canopy with glowing neon Green Line (#00843D) trim strips and interior platform glow.
3. harvard.glb: Curved dark-brick circular headhouse kiosk with glowing Red Line (#DA291C) dome ring.
4. bu_central.glb: Sleek street-level glass transit shelter with overhead tram catenary arch and scarlet/green LED accents.

Three.js Loader Integration (ThreeOverlayLayer.ts)

⚬ Load and cache all 4 .glb assets once via GLTFLoader (three/examples/jsm/loaders/GLTFLoader.js), cloning cached scenes for reusable stops.
⚬ Keep existing procedural meshes as an instant fallback while .glb files load.
⚬ Add subtle pulsing red emissive tint + rotating warning ring over any station with hasActiveAlert === true, and drop a glowing cyan Shuttle Curb Pin adjacent to any station in planned_closure state.

5. Prioritized Execution Checklist for Claude Code

Execute strictly in priority order, verifying builds (npm run build / uvicorn health check) after each tier so the demo stays shippable at every minute:

⚬ P0 (High-Impact Judge Differentiators — Do First):
  1. Add 1-Tap Quick-Check Bar (Stale ETA, Packed / Pass-Up, Elevator Out, Car Issue) with offline localStorage queue + +10 CharliePoints reward.
  2. Wire google-genai into the AI Delay Translator & Tourist Narrator (with 4s timeout + fallback) for the MLH Gemini track.
  3. Update seed alerts & copy to reflect real 2026 disruptions (Green Line signal work, Blue Line wire inspection, Red Line Harvard hold, Orange Line track disruption — remove any outdated slow-zone claims).
⚬ P1 (Visual & Technical Wow-Factor — Do Next):
  4. Generate the 4 low-poly .glb Boston station models via /scripts/generate_stations.py (under 300 KB each) and integrate them into ThreeOverlayLayer.ts via GLTFLoader.
  5. Add Branch-Level Gap Alert (> 1.5x headway warning) and Planned-Closure Shuttle Pickup Pin + Re-Entry Tip onto the station drawer and 3D map.
⚬ P2 (Polish If Time Permits):
  6. Add a lightweight Service Worker / Cache Storage pre-loader for /models/*.glb so the app demonstrates true underground/offline 3D resilience live.
  7. Add an AI Line Vibe Summary 1-liner at the top of T-Feed summarizing recent rider reports per line via Gemini.