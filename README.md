This is a fork of the original companion-module-analogway-awj repository. It is under active development with the goal of eventually contributing these changes back to the upstream project via pull request.

# Changelog

# v3.0.0 Beta 5 – Changes (2026-08-31)

This release closes a large batch of the "action has no matching feedback" gaps found by an audit of the whole module, rounds out Layer Properties with a combined on/off Property Status feedback (now including Aspect Override and the Transition "Allow Cross" flags), extends Audio Routing Status coverage to LivePremier and Midra, and fixes a real connection-reliability bug where the module could keep showing "connected" after the host PC woke from sleep even though the WebSocket was already dead.

## New Actions

- **"Audio - Dante Functions"** – Reboot, Factory Reset, or bulk-rename up to 64 Dante Receiver and 64 Transmitter channels in one action, gated behind a mandatory safety confirmation checkbox (no confirmation, no action – including Reboot). Rename fields are pre-filled with each channel's current name and only send a change for channels you actually edit. **Known limitation**: Reboot and Factory Reset work correctly; Dante channel renaming does not currently take effect on the device, even though the exact same message sequence sent from WebRCS itself succeeds – root cause not found despite extensive live investigation, see the action's own description for details.

## New Feedbacks

- **"Backups - Active Backup Source Status"** and **"Backups - Auto Mode Status"** – live boolean status for both Input and Background Set backups.
- **"Audio - Routing Status"** and **"Audio - Block Routing Status"** – mirrors "Audio - Route (Channels)"/"Audio - Route (Block)", showing whether the routing they describe is currently in effect. Available on LivePremier4, LivePremier, and Midra.
- **"Device - Input Signal Present"** and **"Device - Layer Signal Present"** – whether a physical Input (or the Input currently shown on a given Layer) has a valid incoming signal.
- **"Device - Health Alarm"** – whether the device currently has a Temperature or Fan alarm active.
- **"LIVE - Screen Memory Slot Occupied"** – whether a given Screen Memory slot currently holds a saved memory.
- **"Layer Properties - Property Status"** – one combined feedback with a Property dropdown covering every on/off-style Layer Property: Border (Edge/Shadow Enabled/Rounded/Smoothed), Effects (Filters, Flip H/V, Strobe), Keying Enabled (firmware V6+), Mask Active (inferred from whether any of the four crop values is non-zero, since Mask has no dedicated flag in the protocol), Aspect Override (1:1/Centered/Fullscreen/Cropped), and Transition "Allow Cross Effect"/"Allow Cross Depth" (mapping not yet verified live – see the feedback's description).
- **Midra only**: **"Preconfig - Input Plug Status"** and **"LIVE - Stream Audio Mute Status"**.

## Changed

- **"Live Thumbnail"'s Source field** collapsed from a two-step category-then-item picker into a single flat dropdown. This changes the option's stored shape – existing buttons using this feedback will need their Source re-selected once. Only affects buttons built during the V3 beta cycle; no automatic upgrade is provided since this feedback didn't exist before Beta 3.
- **"Audio - Route (Block)"/"Audio - Route (Channels)"**: Block Size is now capped at 8, and a block can no longer extend past the end of the 8-channel output module it starts in regardless of the configured Block Size (e.g. starting at Output 1 Channel 7 only ever reaches channels 7-8) – a safety measure against accidentally routing into the wrong output module with a mistyped value. The matching new "Audio - Block Routing Status" feedback uses the identical clamp.

## Reliability

- **The WebSocket connection now sends a periodic ping (every 15s) and forces a reconnect if two are missed in a row.** Previously, the connection had no way to detect a "zombie" connection – e.g. after the host PC wakes from sleep/standby, the status could keep showing green/connected while the underlying socket was already dead, with no automatic recovery until something else (a send failure) happened to notice.
- **"Backups - Active Backup Source Status" and its underlying variable now read the device's actual live state** (`status.pp.activeSlot`) instead of the last-requested command value (`control.pp.xSelectSlot`) – previously a manual backup source change could show the wrong result, and a real (automatic) backup failover wasn't reflected promptly or at all.
- **Several newly-added feedbacks (Backup status, Audio Routing status) now actually live-update.** They were missing subscription wiring and previously only evaluated once, at the moment they were first placed on a button.

## Fixed

- **"Audio - Source Tally"** could incorrectly report "true" for a "No Source"/Background Set source due to an operator-precedence bug in the check.
- **Midra's "Screen Freeze Status"** feedback queried Auxscreens through the Screen path instead of the Auxscreen path, always reporting the wrong live state on an Aux.
- **"LIVE - Screen Lock Status"** was missing its default color style (only had an icon), making the button's state much harder to read at a glance.

# v3.0.0 Beta 4 – Changes (2026-08-28)

This release completes the "Layer Properties" action family (now covering nearly every WebRCS layer panel), adds the long-requested "Save to Screen Memory"/"Save-Revert" workflow, extends Backup support to Background Sets, and closes out a large batch of reliability fixes so buttons behave correctly in tight action-list sequences and while the device is offline.

## New Actions

- **"LIVE - Save/Revert Screen Memory Changes"** (LivePremier4) – mirrors WebRCS's own "*" modified-preset workflow: Save writes the Screen/Aux's current live state back into whichever Screen Memory is already loaded; Revert discards unsaved changes by reloading that same memory. Screen Memories only – WebRCS has no equivalent "Update/Reset" concept for Master or Layer Memories, so none was added for those.
- **"LIVE - Save Screen Memory to Slot (+ edit label/delete Screen Memory)"** (LivePremier4) – the more flexible sibling: save the current state of a Screen/Aux into any Screen Memory slot (an explicit slot or "Next Available"), rename a slot's label, or delete a slot – three operations in one action. A new **"Allow save, update or delete of existing Screen Memory?"** checkbox (default off) prevents accidentally overwriting an already-used memory. Leaving the Label blank auto-generates one from the device's own clock when saving into an empty slot, or leaves an existing slot's name untouched when overwriting its content.
- **Background Set Backups**: "Backups - Set Backup Set to Source" and "Backups - Set Auto Mode" now also cover every screen's 8 Background Set backups (BS1-BS8), alongside matching live status variables – previously only Input backups were supported.
- Completed the **"Layer Properties - X"** action family: **Source, Transitions, Keying, Opacity, Aspect & Crop, Mask, Border, Effects, Speed,** and **Timing** are all now built (joining the already-shipped Position & Size), giving near-complete per-property layer control from Companion, mirrored panel-for-panel after WebRCS's own layer editor. Every action in the family has a blue **"Learn"** button that reads the first selected layer's current values straight into the action's fields.
- **"Layer Properties - Encoder Adjust"** and **"Screen - Encoder Adjust"** – two new relative-adjustment actions built for rotary encoders (e.g. a Stream Deck+ dial): pick a property (layer Opacity/Position/Size/Crop/Mask, or screen T-Bar Position/Transition Time) and a step in Raw, Percent, or Pixel units, and the action adds or subtracts that step from the property's current value – no manual expression math required. Defaults to a sensible 1% step if left completely untouched.

## New Variables

- **`SelectedLayer.opacity`**, **`.Crop.Top/.Bottom/.Left/.Right`**, **`.Mask.Top/.Bottom/.Left/.Right`** – live values in the same units as their matching Layer Properties actions.
- **`SelectedScreen.tbarPosition`** (0-100) and **`SelectedScreen.TransitionTime.Pgm`/`.Pvw`** (seconds) – scaled to match "Set T-Bar Position"/"Set Transition Time"'s own fields, so they can be read straight back into those actions.
- **`S{n}`/`A{n}.layer{x}.status/.source/.width/.height/.x/.y`** – live per-layer variables for every currently-configured layer on every screen/aux (`.status`: VALID/INVALID; `.source`: a short id like `IN2`/`IMG4`/`BS1`/`SCR1`; `.x`/`.y` follow the currently selected global Anchor Point, same as `SelectedLayer.x/.y`). Only real, existing layers get variables – no fixed theoretical-maximum range.
- **`S{n}`/`A{n}.layerbg.source`** – the background/NATIVE layer's source.
- **`IN{n}.status`** – a real per-input availability signal (VALID/INVALID), unlike the existing enabled-flag which stays true even for inputs that don't physically exist.
- **`OUT{n}.usedin`** – which Screen/Aux a physical output currently feeds (blank if unused).
- **`S{n}`/`A{n}.aspectratio`**, **`OUT{n}.aspectratio`**, **`MVW{n}.aspectratio`** – real computed aspect ratios (previously `$NA` or a non-numeric mode string on some outputs).
- **Backup variables**: `backups.setX.{activeslot, automode, primary.source, primary.status, backup1.source, backup1.status, backup2.source, backup2.status}` per ungrouped Backup Set, and `backups.groupX.{activeslot, label, automode, allprimaries.status, allbackup1.status, allbackup2.status}` per Backup Group – all status values are a plain **VALID/INVALID** so a single condition style works everywhere. A Backup Set that's a member of a Group only appears under its Group's variables, not on its own.
- **`IMG{n}.label`** – renamed from `STILL{n}.label` for consistency with this module's "Image Store"/"Image Library" terminology. If you already reference `STILL{n}.label` on a button, it will need to be updated to `IMG{n}.label`.

## Changed

- **Action names reorganized under consistent "Category - Name" prefixes** (e.g. "Screen -", "Multiviewer -", "Audio -", "Device -", "Layer Properties -", "Backups -"), with a consistent sort order, so related actions sit together in the action picker instead of being scattered alphabetically.
- **Several Screen/Auxscreen selector fields switched from multi-select to single-select dropdowns**, each gaining a new **"First/Only Selected Screen"** choice alongside "All Selected Screens" and the explicit list: Recall Screen Memory, Recall Aux Memory, Take, Cut, Set T-Bar Position, Set Transition Time, the new Encoder Adjust actions, Copy Program to Preview, and Lock Screen(s). This also produces plain Expression Mode values (e.g. `S1` instead of `["S1"]`) and fixes a couple of these fields occasionally showing duplicate/conflicting dropdowns.
- **'PRV' is now accepted as a typo-tolerant alias for Preview** everywhere 'PVW'/'PRW' were already accepted, and a confusing duplicate "Preview (legacy value...)" dropdown entry was removed – existing configs keep working unchanged.
- **Midra's built-in multiviewer (MTVW) no longer appears in any Output dropdown** (Testpattern, GPO, Raster Box, etc.), matching LivePremier's own architecture where the multiviewer was never mixed into the physical-output list in the first place. It remains fully reachable through the dedicated Multiviewer dropdowns.
- **"LIVE - Take" and "LIVE - Cut" renamed to "LIVE - Transition TAKE" and "LIVE - Transition CUT"** for clarity – purely a display-name change, existing buttons keep working unchanged.
- **"Backups - Set Backup Set to Source"/"Set Auto Mode" and "Layer Properties - Keying" now detect insufficient device firmware** (LivePremier/LivePremier4 older than firmware V6, where these features don't exist yet): instead of silently failing, the action's options are replaced with a clear notice to update the device's firmware.
- **Backup and "Layer Properties - Keying" are no longer offered on Midra/Alta** (Zenith 100/200) – live-confirmed against a Zenith 200 simulator that neither concept exists on that platform; previously they were offered there but never actually worked.

## Reliability

- **The module now publishes its generic action set immediately on load**, before any connection to the device has succeeded. Previously, no actions existed at all until the device had answered at least once – which meant **Wake-on-LAN was unusable in exactly the situation it exists for** (device powered off/unreachable). Wake-on-LAN and the other connection-independent actions are now always available.
- **Dynamic dropdowns behave sensibly while never connected or between reconnects**: Screens, Inputs, Layers, Images, Memories, Timers, and Outputs show the full theoretical range so a show can be pre-programmed offline, and empty dropdowns show a clear "No device connected"/"No X configured" placeholder instead of a stale or confusing entry.
- **Recall Screen Memory, Take, Set Transition Time, Save/Revert Screen Memory Changes, Save Screen Memory to Slot, and several other memory-related actions now wait for the device to actually confirm the change before the next action in the list runs** – even in a plain (non-Sequential) action list. This fixes "Recall then Take" style button sequences, and makes tight stress-test loops with no manual Wait actions reliable.
- **New "Wait for Transition Completion" checkbox on Take** – optionally waits for a transition to fully finish before the button's next action runs. Due to a hard limit in Companion's own action-execution timeout, this can only reliably cover Transition Times up to roughly **4.5 seconds**; longer transitions still need a manual Companion "Wait" action.
- Sending a command and immediately taking or recalling something else on a **different, unrelated Screen/Aux** is never blocked by the above waiting – only actions targeting the same Screen(s)/Aux(es) queue behind each other.
- **Reconnection now retries at a flat 10-second interval, with a live countdown shown in the connection status** (e.g. "Disconnected, retrying in 8s...") – replaces the previous exponential backoff, which could silently leave you waiting much longer between attempts without any visible indication of when the next one would happen.

## Fixed

- **`OUT{n}.sinkdetected`** now always reports `true` for SDI/QUAD_SDI outputs, since SDI is unidirectional and the device can never actually detect a connected sink there – previously it could misleadingly show "not connected" on a working SDI output.
- **Disabling a Screen/Aux no longer leaves old variables stuck at their last value forever** – `.label`, `.pgm.time`/`.prw.time`, memory active/modified fields, and the newer per-layer variable set now all disappear on disable and repopulate correctly when the Screen/Aux is re-enabled.
- **The Backup Set/Group dropdown now refreshes immediately** when a new Backup Set or Group is configured on the device, instead of only updating after some unrelated change triggered a republish.
- **Backup variable updates no longer rebuild every Backup variable on every change** – e.g. toggling one Backup Set's Auto Mode no longer makes every other Backup variable briefly disappear and reappear, which could otherwise misfire a Companion Trigger watching for "variable changed" during a live show.
- **Layer position/size variables no longer freeze on a freshly-connected instance** that hasn't had a live Take/Cut yet – they now read the screen's actual current Program/Preview state directly instead of a cache that was only ever updated by a live Take/Cut event.
- **A layer's live-input source is now recognized correctly** regardless of whether the device reports it internally as `LIVE_n` or `IN_n` – fixes `SelectedLayer.Input.*` and the new per-layer `.status` variable both showing blank or wrong after assigning a live input to a layer via drag-and-drop.
- **Multiviewer output variables renamed `MV{n}.*` → `MVW{n}.*`** to stop colliding with Multiviewer Memory's own `MV{n}.label` (two unrelated numbering domains were sharing one prefix).
- **Newly-enabled Multiviewer outputs (and similar topology changes after connect) now get their variables registered live**, instead of only ever being considered at the moment Companion first connects.
- **Fixed a live incident where rapid WebRCS actions (e.g. dragging a layer's resize handle) could flood the module with rebuild work**, in one observed case even blocking Companion's own "disable connection" command. Variable updates for Backups and Layer properties are now debounced and only add/remove the exact items that actually changed, instead of tearing down and rebuilding the entire variable set on every update.
- Midra's Cut action didn't correctly handle the new "First/Only Selected Screen" choice, silently resolving to zero screens.

# v3.0.0 Beta 3 – Changes (2026-08-21)

## New

- **"Show Thumbnail" feedback**: live preview image of an Input, Output, Image Store slot, or Timer directly on the button, with an adjustable Refresh Rate (1–120 sec).
  - New config option **"Allow Live Thumbnails"** (default: on) – instantly disables all thumbnail polling instance-wide.
  - Protects the device automatically: shared polling per source/item, adaptive throttling when many thumbnails are active at once, device-wide request queue.
  - **Important**: only images currently loaded into an Image Store slot can be shown as a live preview – the device does not provide live previews of the Image Library itself this way.
  - Looks really good on the wide touch buttons of the Streamdeck XL Plus ;-)
- **New "Live - Thumbnails" preset group**: automatically generates one preset per currently-available Input, Output, Image Store image, and Timer.

## Changed

- **"Disable all active Testpatterns"** (in the testpattern action) now also turns off all Raster Boxes (Format/AOI) on LivePremier/LivePremier4 – previously these stayed on independently.
- **"Set Testpattern" fields** now reliably show/hide correctly, without the Output/Screen/Input/Pattern dropdowns losing their expression/variable capability.
- **Preset categories** renamed consistently to an "Area - Description" scheme (e.g. "Multiviewer - Select Widgets", "Screens - Lock Screens") and sorted alphabetically.

## New Actions

- **Assign Image from Library to Foreground/Background Frame** (Midra only) – assigns a Still Image Library item to a screen's Foreground/Background Frame slot.
- **Set LivePremier(≤V3)/LivePremier Testpattern Raster Box** (LivePremier/LivePremier4) – enables, disables, or toggles the Format/AOI Raster Box overlay on an output, independent of the testpattern enable state.

## New Feedbacks

- **Show Thumbnail** (all platforms) – see above.
- **Midra 4K/LivePremier(≤V3)/LivePremier Testpattern Active** (all platforms) – shows whether the selected testpattern is currently active on the selected screen/output/input.
- **LivePremier(≤V3)/LivePremier Testpattern Raster Box Active** (LivePremier/LivePremier4) – shows whether the selected Raster Box (Format/AOI) is currently enabled on an output.

In addition, we checked the compliance to Midra Systems by using the Midra Simulator. Fixed a lot of new and old bugs and special behaviours of Midra. 


 


## v3.0.0-beta.2  (work in progress, 2026-08-20)

### Added

- **New action: "Assign Image from Library to Image Store"** — assigns an image from the Image Library (or one of the 4 device timers) to an Image Store slot, with an "Allow Downscale" option.
- **New action: "Set Anchor Point"** — sets the globally shared Anchor Point on its own (see below), e.g. for a dedicated row of anchor-point buttons.
- **New action: "Reset Layer Size or Ratio"** — mirrors WebRCS's layer toolbar buttons:
  - *Source Ratio* — keeps the current height, derives the width from the source's aspect ratio.
  - *Content Size* — sets the layer to the source's pixel-exact resolution.
  - *Fullscreen* — fills the screen/aux exactly, ignoring aspect ratio.
- **"Set Layer Position and Size V3" rebuilt around WebRCS's 9-point Anchor Point model**:
  - New **Anchor Point** option (Center + 8 directional points), matching WebRCS's own Position & Size panel exactly, including its pixel-rounding behavior.
  - The Anchor Point is now a **globally shared, WebRCS-synced setting** — changing it here updates WebRCS's own display and vice versa (confirmed live).
  - Resizing now keeps the chosen anchor point visually fixed in place for all 8 non-Center anchors (previously the box only ever grew/shrank symmetrically around center).
  - New **Keep Aspect Ratio** option: if only Width or only Height is given, the other is derived from the aspect ratio and rounded correctly.
  - New optional **Reference Width / Reference Height** fields: pins the aspect-ratio calculation to a fixed value instead of the layer's ever-changing current size, avoiding rounding drift over many repeated small steps (e.g. an encoder wheel).
- **New feedback: "Global Anchor Point"** — reflects the currently selected global Anchor Point.
- **New status variables**, all scoped to the current selection (not a per-layer/per-screen set):
  - `SelectedLayer.x` / `.y` / `.width` / `.height` / `.number` / `.count`
  - `SelectedLayer.Input.Number` / `.Name` / `.width` / `.height` — the source (input or still image) assigned to the selected layer, including its native resolution.
  - `SelectedScreen.number` / `.numberOfLayers`
  - All `SelectedLayer.*` variables describe the **first** (Ctrl-clicked first in WebRCS) layer of a multi-selection — same layer WebRCS itself highlights differently from the rest.

### Changed

- **Layer-selection dropdowns** in "Set Layer Position and Size V3" and "Reset Layer Size or Ratio" now distinguish **"All Selected Layers"** from **"First/Only Selected Layer"** (now the default), to avoid accidentally re-applying a value read from `SelectedLayer.*` (which only ever reflects the first layer) to an entire multi-selection.
- Generic (screen-unspecified) Layer dropdowns now size themselves to the layer count actually configured on the connected device, instead of the platform's theoretical maximum (e.g. no more scrolling through 128 entries on LivePremier4 when only 4 layers exist).
- Checkbox-type options are now interpreted consistently everywhere in the module (`parseBoolean` helper) — fixes cases where a checkbox driven by an expression or page/local variable wasn't recognized correctly.

### Fixed

- WebSocket resource leak: a previous connection attempt's socket could remain open during a rapid reconnect storm, eventually exhausting OS socket buffers ("no buffer space available").
- Selection-derived variables (`SelectedLayer.*`, `SelectedScreen.*`, global Anchor Point) could stay blank after a reconnect until the user made a new selection, since that part of the protocol only streams changes, not an initial snapshot.
- A crash risk in the sync-on-connect logic when switching sync mode before the device's client list was fully populated.
- Several dead/duplicate action registrations left over from the base migration.
- A copy-paste bug in the input-selection presets (LivePremier/LivePremier4) referencing a field that only exists on Midra.
- Audio input routing numbering on multi-device linked systems (continuous video numbering vs. per-device audio address padding).

### Known limitations

- Companion itself has a pre-existing coercion quirk where a checkbox driven by an expression evaluating to the number/string `0` is treated as `true` (only the literal string `"false"` is recognized correctly) — not fixable from this module's side; use a real boolean expression (e.g. `$(var) == 1`) rather than plain `0`/`1` text if this affects you.


## v3.0.0Beta1 (work in progress, 2026-08-19)

### Major: migrated to `@companion-module/base` v2.1.3

Upgraded from `@companion-module/base` ~1.9.0 to ^2.1.3, the foundation for native Companion v4.3+/v5.x expression and local-variable support in every option field. This is a breaking-change migration touching nearly the whole codebase.

- Tooling: Node engine bumped to `^22.20 || ^26.5`, `@companion-module/tools` to `^3.0.2`, `typescript` to `^7.0.2`, `@types/node` to `^22.20.1`, tsconfig switched to the `node22/recommended-esm` preset. Fixed several extension-less relative imports required by the stricter Node16 module resolution.
- `companion/manifest.json`: added required root-level `"type": "connection"`, changed `runtime.type` from `"node18"` to `"node22"` (schema now only allows `node22`/`node26`).
- New module entrypoint convention: `export default` class instead of calling `runEntrypoint()`.
- Preset API restructured: `setPresetDefinitions(structure, presets)` now takes an explicit `CompanionPresetSection[]` structure (derived from each preset's `category` field) alongside the presets themselves; preset `type: 'button'` renamed to `'simple'`.
- Variable definitions converted to the new record-keyed-by-id shape (was an array of `{variableId, name}`).
- All manual `parseVariablesInString()` calls removed — Companion now resolves variables/expressions before the callback fires, so this hand-rolled parsing is no longer needed.
- All ~83 `isVisible` JS-function fields converted to the new `isVisibleExpression` string syntax (+ `disableAutoExpression: true` added to every field referenced by another field's expression).
- Historic upgrade scripts (`src/upgrades.ts`) updated to emit the new `{value, isExpression}` wrapper shape for migrated option values.

### New feature: variable / local-variable support for option fields

The actual goal of the migration — dropdown-style fields can now be set via Companion expressions, including local variables (`$(local:...)`) and Companion 5.1's new page variables (`$(page:...)`), verified end-to-end by the user on real workflows (e.g. copy-pasting a "Recall Screen Memory" button template and only changing one local variable instead of every option field by hand).

- Added `allowInvalidValues: true` to every screen/aux-identifying option field (`screens`, `screen`, `memory` — actions and feedbacks, all platforms), since Companion silently skips an action entirely if an expression-computed value doesn't match the field's static choice list.
- Added `expandScreenAuxTokens` parsing in `src/awjdevice/choices.ts`: a screen/aux multidropdown expression can now be written as a plain concatenated string like `S1S2A1` (no separator needed) instead of a JSON array; extracted tokens are cross-checked against currently-existing screens/auxes and silently dropped if invalid.
- Renamed "VM" → "MV" prefix in Multiviewer Memory preset button text (correct abbreviation, purely cosmetic).

### Bug fixes (pre-existing, found and fixed during this session's testing — unrelated to the base v2 migration itself)

- **Multiviewer Memories presets all collapsed into one preset.** Operator-precedence bug in a ternary (`'Load VM' + memory.id + multimulti ? x : y` parses as `(concat) ? x : y`), so every memory's preset used the same object key and only the last one survived. (`src/awjdevice/presets.ts`)
- **Audio input routing numbering wrong on multi-card devices with non-max-capacity cards** (LivePremier v4, e.g. Aquilon C+/RS-series). AWJ audio addressing reserves a fixed 8-address block per physical card slot, independent of the slot's real input count, while video input numbering is continuous — the two only coincide when every card is at max (8) capacity. Added `getAudioInputSlotCapacities`/`audioInputNumberToVideoInputNumber` in `src/livepremier4/choices.ts` to translate correctly; live-verified against multiple card configurations on the simulator. (Not yet applied to the pre-v4-firmware `src/livepremier/choices.ts` path or to audio *outputs* — see Known issues.)
- **"Select Layer Source" throws `"e.options[r] is not iterable"` on Midra/Zenith devices.** A template literal used the wrong variable (`` `layer${screen}` `` where `screen` had been reassigned to an object instead of its id string), producing a field id that never exists. Matches upstream [issue #41](https://github.com/bitfocus/companion-module-analogway-awj/issues/41). (`src/midra/actions.ts`)
- **"Set Transition Time" wrote the duration to the wrong T-Bar direction** on LivePremier/LivePremier4, causing inconsistent Take transition timing. Two actions (`deviceTakeScreen` and `deviceTakeTime`) disagreed on which physical T-Bar direction (up/down) corresponds to "PGM" for a given state; fixed to agree. Matches upstream [issue #52](https://github.com/bitfocus/companion-module-analogway-awj/issues/52). (`src/awjdevice/actions.ts`)
- **Connecting to a password-protected device crashed the entire module process, or silently never logged in.** Confirmed fixed and live-verified against a password-protected simulator. Three causes, all fixed, matching upstream [issue #40](https://github.com/bitfocus/companion-module-analogway-awj/issues/40):
  1. The login request used `redirect: 'error'` + default `throwHttpErrors: true`, treating the redirect some firmware versions send back after a successful login as a hard failure before the response could even be inspected. Now `redirect: 'manual'` + `throwHttpErrors: false`.
  2. The error-handling path used `return Promise.reject(error)` inside `connect()`, but nothing calling `connect()` ever `.catch()`es its result — turning every login failure into an unhandled promise rejection, which crashes the Node process. Now returns normally after logging + a clear `AuthenticationFailure` status, instead of silently crash-looping.
  3. `res.headers['set-cookie']` — `res.headers` is a `Headers` class instance (fetch API), not a plain object; bracket access always returns `undefined`. Fixed to `res.headers.get('set-cookie')`. Likely the true original root cause, independent of firmware version. Fixed in both the main login flow and the duplicate one inside `restPOST()`. (`src/connection.ts`)

### Experimental: `devicePositionSizeV3` action scaffold

Split off a new `devicePositionSizeV3` action (id `devicePositionSizeV3`) as the future home for a rebuilt anchor/coordinate model (WebRCS/Aquilon-style 9-anchor-point selection). The old `devicePositionSize` action id is a **fully independent copy**, not derived from V3 — deliberately duplicated code so the V3 rebuild can freely change without touching or risking the old action. Old action's display name changed to `"Set Position and Size (V2, deprecated, please upgrade to new action V3)"` (cosmetic only, doesn't affect stored configs); every option field on it has `disableAutoExpression: true` to keep the new expression/local-variable toggle exclusive to V3 as an incentive to migrate (safe: this action never had that capability before, so nothing can regress).

V3 itself was drastically decluttered from the old action's model, as a first step toward the real rebuild:
- Removed the entire "expression context" system (the `lw`/`lh`/`lx`/`ly`/`bw`/`bh`/`sw`/`sh`/`ia`/... keyword substitution, cross-layer bounding-box math, and the custom `@nx-js/compiler-util` formula parser) — none of that carries over.
- Removed the Anchor X/Y fields entirely.
- Removed the "Act on" parameter selector; X/Y/W/H are now always-present fields where an **empty field means "leave this value untouched"** and a filled field sends that value.
- X/Y/W/H are now sent **1:1 to the device's raw `posH`/`posV`/`sizeH`/`sizeV`** with no conversion (no more left-edge-vs-center translation, no aspect-ratio derivation) — this is deliberate for now, so the actual raw AWJ values are directly visible while the real anchor-based UX gets designed. (`src/awjdevice/actions.ts`, `src/midra/actions.ts`, `actionsToUse` in all three platform `actions.ts`)

### New: screen/aux size variables (`S1.width`, `A1.height`, ...)

Added live module variables for every existing screen's and auxscreen's canvas resolution — `S{n}.width`, `S{n}.height`, `A{n}.width`, `A{n}.height` — so users can build their own expressions (e.g. `$(modulname:S1.width) / 2 + 50`) instead of the module doing formula evaluation itself. Registered and kept live via a new `screenSize` subscription (`src/awjdevice/subscriptions.ts`, opted into by all three platform subscription lists) that both defines the variables (on connect, mirroring the real screen/aux list) and updates their values whenever the canvas resolution changes on the device (e.g. changed live in RCS) — no polling, no manual refresh needed. Registration is always-on (the screen/aux set is small and bounded, unlike the planned layer-level variables — see Known issues).

### Bug fix: most dynamic module variables never appeared in Companion's variable list

Root cause: Companion's variable picker is driven entirely by variable *definitions* (`setVariableDefinitions`), not by which variable ids have ever received a value. Almost every dynamic variable documented in [HELP.md](companion/HELP.md#variables) (memory labels, screen/input labels, timer status/value, transition times, ...) was only ever set via `setVariableValues` — the corresponding `addVariable`/definition call was missing everywhere except 2 sites in `feedback.ts`. The values were always computed correctly; they just never became visible/selectable in Companion's UI (matches this session's own `screenSize` variables suffering the same issue on first attempt).

Fixed by adding the missing `addVariable(...)` registration, gated by an "does this actually exist on the connected device" check (isValid for memories/stills, isEnabled/isAvailable for inputs, presence in the real screen/aux list for screens) rather than registering the full theoretical range (e.g. not 1000 screen memory slots on LivePremier, only the ones actually holding data) — across `src/awjdevice/subscriptions.ts`, `src/livepremier/subscriptions.ts`, `src/livepremier4/subscriptions.ts`, `src/midra/subscriptions.ts`: `timerState`, `timerValue` (LivePremier4, current time in ms), `screenMemoryLabel` (+ per-screen `screen{n}memoryLabelPGM/PVW`), `masterMemoryLabel`, `multiviewerMemoryLabel`, `layerMemoryLabel`, `stillLabel`, `screenLabel`, `auxscreenLabel`, `inputLabel`/`plugChange` (Midra), `screenTransitionTime`/`auxScreenTransitionTime`.

Along the way, fixed two more pre-existing bugs discovered while diagnosing this:
- Several subscriptions' `pat` regex had no capturing group (`timerValue`, `screenTransitionTime` on both LivePremier and Midra, and this session's own new `screenSize`) — the subscription runner decides purely on `pat.indexOf('(') === -1` whether to run its `ini` initializer at all, so these never populated their variables on initial connect, only reacting to live updates afterward.
- Midra's `multiviewerMemoryLabel` subscription had a path typo (`bankList/item/` singular vs the real device's `bankList/items/` plural) that silently broke it entirely, independent of the registration issue.
- The `timerState` subscription's regex captured the trailing `/` along with the timer number (`match(/(?<=TIMER_)(\d)\//)`, then wrongly read the full match `timer[0]` instead of the capture group `timer[1]`), producing a malformed variable id like `timer1/_status` — only became visible once the variable started actually appearing in the list.

Not covered by this fix (documented but not yet implemented at all, not a registration bug): `frozen_IN1`/`frozen_S1`/`frozen_S1_L1`/`frozen_S1_NATIVE` (still just a commented-out stub in `src/variables.ts`), and Midra's `auxMemory{n}label` (no subscription exists for it yet).

### New: renamed dynamic variables to a consistent scheme (V3), with V2-compatible opt-out

Renamed the ad-hoc/inconsistent old variable ids (`screenMemory1label`, `SCREEN_1label`, `INPUT_1label`, ...) to a consistent `Object{n}.property` scheme: `S1.label`, `A1.label`, `IN1.label`, `MM1.label` (master memory), `SM1.label` (screen memory), `LM1.label` (layer memory), `MV1.label` (multiviewer memory), `STILL1.label`, `TIMER1.status`, `TIMER1.value` (+ new `TIMER1.value.hms`/`.h`/`.m`/`.s`), `S1.pgm.time`/`S1.pvw.time` (+ new `.ms` variants), `S1.pgm.memory.label`/`S1.pvw.memory.label`.

Because these ids can appear as free text in existing button labels/triggers (which can't be auto-rewritten the way structured action options can), this is **not a breaking rename**: a new config checkbox "Use old (V2) variable names" controls which scheme is active. An upgrade script sets it to `true` automatically for every config that already existed before this change (old names keep working, zero visible change on update); brand new connections default to `false` (clean new names from the start). Presets that generate button text referencing these variables were updated to respect the same setting. (`src/config.ts`, `src/upgrades.ts`, `varName()` helper in `src/awjdevice/subscriptions.ts` and `src/awjdevice/presets.ts`)

### New: physical output variables (`out1.width`, `out1.height`, `out1.refreshrate`)

Added live variables for each physical output's actual signal status, sourced from the AWJ `$output` object's `status/pp`: `out{n}.width`/`.height` (`sizeH`/`sizeV`), `.refreshrate` (`rate`, given in mHz by the device so divided by 1000, rounded to 2 decimals, e.g. `59.97`), `.format` (e.g. `"CINEMA_2K"`), `.formatkind`, `.totalwidth`/`.totalheight` (`totalH`/`totalV`, including blanking), `.aspectratio`. Outputs are distinct from screens (a screen can span multiple physical outputs) and were previously not exposed as variables at all. Also added, from each output's first plug (`plugList/items/1/status/pp`, discovered live via the "custom AWJ get command" action): `out{n}.hdcp` (`isHdcp`), `out{n}.colorspace` (`colorSpace`), `out{n}.sinkdetected`/`out{n}.sinkname` (`isMonitorDetected`/`monitorName` — the closest available equivalent to "EDID"; there is no raw EDID field exposed by AWJ. Named "sink" rather than "monitor", the correct AV/HDMI term for whatever is on the receiving end — monitor, projector, LED wall, ...). No dynamic-range property was found on the device at all (checked `status/pp` on both the output and its plug) — left off for now, flagged as a follow-up if a path for it ever turns up. Registration is adaptive to `device/outputList/itemKeys` + `isAvailable`, same pattern as `screenSize`.

### Clarified naming: "Preset" now says "(Program/Preview)" where it meant that, not a memory

"Preset" is industry-ambiguous — it also commonly means a saved memory. Renamed the display names (cosmetic only, no id changes, doesn't affect stored configs) of everything that specifically means the program/preview swap concept: actions "Select Preset" → "Select Preset (Program/Preview)", "Set Preset Toggle" → "Set Preset Toggle (Program/Preview)"; feedbacks "Preset Selection" → "Preset Selection (Program/Preview)", "Preset Toggle" → "Preset Toggle Status (Program/Preview)"; the `selectedPreset` variable's description; and the "Toggle Preset"/"Preset Toggle" preset templates. Left the many in-context "Preset" option-field labels inside memory-recall actions untouched — there the surrounding action name already disambiguates.

### New: Midra — "Assign Image from Library to Foreground/Background Frame" action (2026-08-21)

Live-verified against a Midra (Eikos 4K) simulator, which was not previously available for testing. Fixed the `stillLibraryPath` constant for Midra (`src/midra/constants.ts`) — it inherited LivePremier4's `device/stillList/library/bankList` path, which doesn't exist on Midra at all; the real path is `device/stillLibrary/bankList` (already used correctly, but only hard-coded, in an existing `midra/subscriptions.ts` subscription — the shared `getStillLibraryChoices()`/`getStillLibraryArray()` helpers in `awjdevice/choices.ts` were silently returning nothing for Midra until this fix).

Unlike LivePremier4's flat 192-slot Image Store, Midra has no generic per-layer image store at all — instead each screen has its own 4 "Foreground/Logo" slots (`topFrameList`) and 4 "Background" slots (`backFrameList`), each independently pointing at one of the 50 shared Image Library slots via a `librarySlot` field. Added a new, Midra-only action `deviceAssignImageLibraryToFrame` ("Assign Image from Library to Foreground/Background Frame": Screen(s) + Frame Type (Logo/Background) + Slot 1-4 + Library Image, with a "None (clear)" option) — live-verified end-to-end with real images on the simulator.

### New: generic device variables (`Device.Series`, `Device.Model`, `Device.Name`, `Device.Status.Temperature`, `Device.Status.Fans`) (2026-08-21)

Added for all platforms (LivePremier, LivePremier4, Midra), useful for IF/THEN-style feedback/trigger logic. `Device.Series` (e.g. "Midra 4K", "LivePremier", "Alta 4K") and `Device.Model` (e.g. "Eikos 4k", "Aquilon RS2") are resolved once at connect using the device-family detection already used for the connect log line. `Device.Name` live-tracks the device's configurable label. `Device.Status.Temperature` reuses AWJ's own aggregate temperature alarm field (`NONE`/`WARNING`/`ALARM`). `Device.Status.Fans` (`OK`/`ALARM`) has no protocol-provided aggregate to reuse, so it's computed by scanning the whole fan status subtree for any active alarm, adapting to whatever fan sub-lists a platform actually has rather than assuming a fixed layout. Live-verified end-to-end on a Midra (Eikos 4K) simulator; LivePremier/LivePremier4 use the same linked-device path fallback already proven elsewhere in the codebase but aren't yet live-verified on that hardware.

### New: multiviewer output variables (`MV1.width`, `MV1.height`, ...), matched to Aquilon's own structure (2026-08-21)

Discovered that the pre-existing generic `out{n}.*` physical-output variables ([above](#new-physical-output-variables-out1width-out1height-out1refreshrate)) picked up an extra `outMTVW.*` entry on Midra only, since Midra happens to fold its built-in multiviewer's output into the same `device/outputList` as physical outputs (confirmed live: identical status shape, `sizeH`/`sizeV`/`rate`/etc.), while Aquilon keeps its multiviewer output in a completely separate `device/monitoringList` structure and never surfaced there at all. Per explicit user direction ("Aquilon sollte immer das Maß der Dinge sein"): excluded the multiviewer entry from the physical-output variable set on all platforms, and added a proper `MV{n}.width`/`.height`/`.refreshrate`/`.format`/`.formatkind`/`.aspectratio` variable set instead, sourced from Aquilon's native `monitoringList` (base) or Midra's `outputList` "MTVW" entry (override) via the same `getMultiviewerArray()` id enumeration already used elsewhere for multiviewer choices - so the variable set is consistent and correctly scoped on both platforms, not just an accidental Midra side-effect.

Also fixed along the way: `out{n}.refreshrate` unconditionally divided the device's `rate` field by 1000 assuming milliHertz - live-confirmed correct for the documented LivePremier4 case, but wrong for Midra, which reports plain Hz already (would have shown e.g. `0.06` instead of `60`). Now platform-aware via a new `outputRateInMilliHertz` constant.

Also removed `out{n}.totalwidth`/`.totalheight` (and the new `MV{n}` equivalents) entirely, per user request - these reflect the raw AWJ `totalH`/`totalV` fields (full video timing including blanking, e.g. 2200x1125 for a 1920x1080@60Hz signal per CEA-861), a real but broadcast-engineering-only value with no use case in Companion logic. **Compatibility note**: any existing button/trigger referencing `out{n}.totalwidth` or `out{n}.totalheight` will need updating - these variable ids no longer exist.

### Fixed: "Set Layer Position and Size V3" could show multiple, conflicting "Layer" fields at once (2026-08-21)

Live-observed on Midra: with "Screen / Aux" = "Selected Screen(s)", the action's option form showed the "Layer" dropdown **three times simultaneously** (two showing the same value, one invalid/empty) instead of the single field that should be visible. Root cause: the action used to have one hidden "Layer" field per screen (`layerS1`, `layerA1`, ...), each shown/hidden via `isVisibleExpression` depending on the "Screen / Aux" field's current value - and that field needed `disableAutoExpression: true` for those `isVisibleExpression` references to work at all. Companion's `isVisibleExpression` evaluation turned out to be unreliable specifically for fields depending on another field that has `disableAutoExpression` set, occasionally leaving several of the per-screen fields visible at once instead of exactly one.

**Fix**: removed the whole per-screen field set and the cross-field dependency entirely. A single "Layer" field now covers every "Screen / Aux" choice (a specific screen, "Selected Screen(s)", or the new "First/Only Selected Screen" below) - nothing else references `$(options:screen)` anymore, so `disableAutoExpression` is no longer needed on that field either, and as a direct side benefit **"Screen / Aux" can now be set via expression/local variable**, which it couldn't before. Along the way also fixed a related pre-existing bug in the same resolution logic: picking a specific layer number while "Screen / Aux" was "Selected Screen(s)" resolved to one bogus target using the literal string `"sel"` as the screen id instead of that layer number on every actually-selected screen.

### Fixed: same "multiple Layer dropdowns visible at once" bug on "Reset Layer Size or Ratio", and added "First/Only Selected Screen" there too

Same root cause and fix as the "Set Layer Position and Size V3" fix above - removed the per-screen hidden "Layer" fields and the `disableAutoExpression` cross-field dependency on "Screen / Aux" that caused it, and added the same "First/Only Selected Screen" option (now the default, same reasoning as V3: Source Ratio/Content Size resize relative to each layer's own current size, so applying to layers on every selected screen at once could resize them differently than intended). Not yet applied to `deviceSelectSource` or `selectLayer` (both `awjdevice/actions.ts`), which have the same disableAutoExpression pattern and the same latent risk - not reported as broken yet, but worth applying the same fix proactively if they come up. Deliberately left untouched: the deprecated V2 "Set Position and Size" action, which has this same pattern on every field by design (frozen on purpose, see its own doc comment) and is meant to stay exactly as-is.

### New: "First/Only Selected Screen" option on "Set Layer Position and Size V3", now the default

Mirrors the existing "First/Only Selected Layer" safety option: when several screens are selected at once (common in daily use), applying X/Y/W/H values read from the `SelectedLayer.*`/`SelectedScreen.*` variables to *every* selected screen could move layers on screens that were only incidentally selected alongside the intended one. "First/Only Selected Screen" (now the default, replacing "Selected Screen(s)") targets just the first-selected screen instead, matching what those variables actually describe. Also clarified the `SelectedScreen.number`/`SelectedScreen.numberOfLayers` variable descriptions to explicitly say "first selected screen" (they already only ever reflected the first one - only the wording was ambiguous).

### Cosmetic: unified "Selected Screen(s)"/"Selected" wording to "All Selected Screens" everywhere

For consistency with the "First/Only Selected Screen"/"First/Only Selected Layer" naming introduced above. Display text only - no action/option ids or stored values changed, so no impact on existing shows.

### Clarified naming and default: "Preset" option fields, and default now "Preview" where it means "currently relevant side" (2026-08-21)

Per user request, to reduce confusion around "Preset" (industry-ambiguous - also commonly means a saved memory, see the earlier "(Program/Preview)" action/feedback name clarification): relabeled every option field literally named "Preset" to "Preset (Program/Preview)" (17 sites across actions and feedbacks - display text only, no id/value changes, no impact on existing shows).

Also changed the default value from "Selected"/"Selected Preset" (= whichever side happens to be currently active) to explicit "Preview" on the 9 fields where that "currently active side" default existed (Recall Screen/Aux/Master Memory, Select Layer Source, Set Layer Position and Size V3, Reset Layer Size or Ratio, the deprecated V2 position/size action) - reasoning: Preview is the side actually being worked on in the vast majority of real workflows, so it's a safer default for newly-added actions than silently following whatever happens to be selected. Deliberately left unchanged: fields with an "Any"/"Both" option (feedbacks matching either side by default - narrowing that by default was judged too behavior-changing), fields that are plain Program-vs-Preview with no "selected/any" concept at all (e.g. Lock Screen, Screen Lock/Preset Selection feedbacks), and the "Select Preset (Program/Preview)" action's own Toggle-capable field (a "default direction" doesn't make sense for a toggle).

### Cosmetic: clarified "Any"/"Both" choice labels

"Any"/"Both" was used for at least three different, unrelated concepts across the module - screens, layers, and Program/Preview - all with the identical bare label "Any", which was ambiguous out of context. Now: "Any (Program/Preview)" / "Both (Program/Preview)" where it means either preset side (5 sites, including one previously-missed "Selected Preset"-labeled field on the "Layer Selection" feedback, now also relabeled "Preset (Program/Preview)"), "Any Screen" where it means any screen/auxscreen (11 sites), "Any Layer" where it means any layer (2 sites). Display text only.

### Cosmetic: unified "All"/"ALL" to "All Screens" where it means every screen

7 sites (Take Screen, Cut Screen, Set T-Bar Position, Set Transition Time, Copy Program to Preview, Lock Screen, Screen Lock feedback) used inconsistent "All"/"ALL" for "every screen, not just selected ones" - now uniformly "All Screens", and clearly distinct from the unrelated "All Selected Screens" (currently-selected) and "Any Screen" (feedback: matches any one) wording used elsewhere. Left the 4 "All" choices in "Set Testpattern"'s Group selector alone - there "All" means "every field group" (Screen Canvas/Output/Input), a different concept. Display text only.

### Cosmetic: platform-specific "Set Testpattern" action names

The three platforms' "Set Testpattern" action shared the exact same display name, making it hard to tell them apart when e.g. searching the action picker. Renamed to "Set LivePremier Testpattern" / "Set Alta 4K Testpattern" / "Set Midra 4K Testpattern" - matching the platform "Series" names already used by the `Device.Series` variable. Action id unchanged (`deviceTestpatterns`), no impact on existing shows.

### Cosmetic: clarified "Set Testpattern" Group "All" wording

Across all three platform-specific Testpattern actions: Group choice "All" → "All active Testpatterns", and its Pattern field's only choice "Off" → "Disable all active Testpatterns" (this group can only disable, not set a specific pattern everywhere, since screens and outputs use different pattern vocabularies - the old bare "Off" label didn't make that clear). Display text only.

### New: "Set Testpattern" gained Area/Raw Colors/Color options (Output group only), and the Raster Box action gained a Mode selector plus a matching feedback

Live-confirmed on a real Aquilon (RS6, fw 6.2.73): outputs have three more pattern-related properties beyond type/inhibit, all under `device/outputList/items/{id}/pattern/...` - `control/pp/fitArea` (Format/AOI), `control/pp/disableColorimetry` (Raw Colors), and `color/pp/{red,green,blue}` (only meaningful for the "Solid Color" pattern, default white/`FFFFFF`). Added as three new fields (Area dropdown, Raw Colors checkbox, Color picker - the last only visible when Pattern = Solid Color) to "Set Testpattern" across all platforms, built once in the shared `deviceTestpatterns_common` helper since these fields are identical everywhere.

The Raster Box action ("Set LivePremier(≤V3) Testpattern Raster Box") gained a "Mode" dropdown (Enable/Disable/Toggle) alongside its existing Format/AOI multi-select - reads the output's current `centering` array and only adds/removes/flips the specifically selected box(es), leaving the other one untouched, instead of always overwriting the whole array. Also added the matching feedback "LivePremier(≤V3) Testpattern Raster Box Active" (Output + Format/AOI -> true if that box is currently enabled). Both action and feedback user-confirmed working end-to-end on the real RS6.

### New: pattern-specific "Set Testpattern" options for Grid Custom, Crosshatch, Checkerboard (Output group)

Live-confirmed on a real Aquilon: `device/outputList/items/{id}/pattern/{grid,cross,checker}/pp/...`. Added, each only visible when its matching Pattern is selected: Grid Custom gets Color (shares the same field as Solid Color), Thickness (0-16), H Size (32-4096), V Size (16-4096), Show IDs; Crosshatch gets H Size (32-4096)/V Size (32-2160); Checkerboard gets H Size (1-4096)/V Size (1-2160). Built in the shared `deviceTestpatterns_common` helper alongside the Area/Raw Colors/Color fields above, so it applies to all platforms uniformly.

### FIXED: incorrect "Alta 4K" naming for the livepremier4 platform

User correction: "Alta" is a completely separate Analog Way product family (Zenith 100/200), unrelated to the `livepremier4` internal platform (firmware major ≥4 Aquilon devices, e.g. a real RS2 on fw 6.x) - which this session had incorrectly labeled "Alta 4K" in several places added today. Zenith 100/200 devices already correctly route through the *`midra`* platform internally (pre-existing, unrelated to this session - see `connection.ts`'s `ZEN100`/`ZEN200` device-string branches), consistent with `index.ts`'s existing doc comment "AWJMidra - ... overriding some stuff for Midra and Alta devices". Renamed accordingly, per user's naming choice: `Device.Series` is now `"LivePremier ≤ V3"` (was just `"LivePremier"`) for the old platform and `"LivePremier"` (was `"Alta 4K"`) for the new one; the Testpattern action/feedback names follow the same split ("Set LivePremier ≤ V3 Testpattern" / "Set LivePremier Testpattern", and the matching "... Testpattern Active" feedback names).

### New: `Device.FirmwareVersion` and `Device.FirmwareGeneration` variables

Added alongside the naming fix, for Companion project condition checks against firmware capability differences. `Device.FirmwareVersion` is the full version string (e.g. `"6.2.73"`); `Device.FirmwareGeneration` is just the major version prefixed with `V` (e.g. `"V6"`), parsed from the same value already used internally for `livepremier`/`livepremier4` platform detection.

### FIXED (Midra): "Set Testpattern"'s Screen Canvas group never actually worked - wrong id sent

Live-confirmed via a raw websocket test: the "Screen" dropdown in the Screen Canvas group used `getScreenChoices()`, which returns ids like `"S1"` (the id convention used almost everywhere else in the module) - but `device/screenList/items/{id}/...` only recognizes the *plain* item key (`"1"`, `"2"`, ...; confirmed live, `screenList.itemKeys` is `["1","2","3","4"]`, no `"S1"` entry exists). Sending `"S1"` is silently accepted by the websocket layer but has no effect on any real item, which is why Screen Canvas patterns "did nothing" while Output patterns (whose ids happen to already be plain, e.g. `"1"`, `"MTVW"`) worked fine. This is a pre-existing bug (not introduced this session) that got carried over into the new "Testpattern Active" feedback's Screen field too, since it copied the same choices source. Fixed both the action and the feedback to build the Screen choices from `getScreensArray()` with the `"S"` prefix stripped from the id (keeping it in the label for display). Applied the same fix to LivePremier and LivePremier4 (both action and feedback) too - same underlying bug there (confirmed by code inspection, not live-verified on either platform yet, no simulator available). LivePremier's version had an extra wrinkle: its Screen field used `getScreenAuxChoices()`, mixing in Auxscreens - which would have been doubly broken, since auxscreens live under a completely different top-level list (`auxiliaryList`) that this group's path never addresses at all. The fix's screens-only source removes that too.

### New: "Testpattern Active" feedback, per platform series ("Midra 4K Testpattern Active" / "LivePremier Testpattern Active" / "Alta 4K Testpattern Active")

Without this, there was no way to build a Testpattern control page in Companion that shows which pattern is currently active - only the action to set one. Mirrors the matching platform's "Set Testpattern" action structure exactly (Group -> Screen/Output[/Input Group where supported] -> Pattern), reading the same `pattern/control/pp/type`/`inhibit` path the action writes to. True when the selected item's current pattern type matches the selected pattern AND patterns are actually enabled there (`inhibit` false) - checking `inhibit` too (not just `type`) matters because the device keeps the last-selected type value even after disabling patterns, so a type-only check would stay stuck "on". "Off"/NONE/NO_PATTERN is true exactly when `inhibit` is true, regardless of `type`. Needed a new `testpatternActive` subscription (`subscriptions.ts`, registered on all three platforms) so the feedback actually re-evaluates on live device changes, not just once when the button loads. Live-verified by the user on the Midra/Eikos 4K simulator (Output group, switching between Pathological/Covering and toggling patterns off).

### New: "Pathological" in Output patterns (Midra)

Added `PATHOLOGICAL` to the Output pattern choices for Midra, confirmed live (WebRCS bundle + user-verified visible switching in WebRCS on the Output group, unlike Screen Canvas which doesn't visibly render on the simulator).

### New: "30bit Testpattern #1"/"#2" in Screen Canvas patterns (Midra, LivePremier)

Added `THIRTY_BPP_1`/`THIRTY_BPP_2` to the Screen Canvas pattern choices for Midra and LivePremier (LivePremier4/Alta 4K not yet checked - not confirmed to exist there). Confirmed live against the Midra/Eikos 4K simulator: the enum ids and their order come directly from WebRCS's own bundled JS, and the simulator's default screen state already had `THIRTY_BPP_1` active, so these are real, currently-reachable protocol values, not a guess.

### FIXED: "Set Testpattern"/"Testpattern Active" - Group-dependent fields (Screen/Output/Input, Pattern, Area, Raw Colors, Color, Grid/Crosshatch/Checkerboard options) not reliably hiding

Same root cause as the earlier "3x Layer dropdown" bug: any field whose `isVisibleExpression` reads another field's value via `$(options:X)` requires that referenced field X to have `disableAutoExpression: true` - this is a hard requirement of Companion's expression evaluation (an unresolved expression can't be read synchronously), not something specific to this module. Only two fields in the whole "Set Testpattern" family are actually *referenced* this way: "Group" (referenced by Screen/Output/Input/Pattern) and each platform's Output "Pattern" field (referenced by the Area/Raw Colors/Color/Grid/Crosshatch/Checkerboard fields) - both already had `disableAutoExpression: true` correctly.

First attempt (reverted, see below) additionally added `disableAutoExpression: true` to the *dependent* fields themselves (Screen, Output, Input, etc.), on the theory that this would also stabilize their own hide/show behavior. It compiled and was reported working, but has an unacceptable side effect: `disableAutoExpression` fully disables a field's own "switch to expression" toggle - so Output (and Screen/Input) could no longer be set via expression/local variable at all, which defeats the actual purpose of a templated "set pattern on output $(local:target)"-style button. Reverted: removed `disableAutoExpression` from every field that isn't structurally required to have it (Screen, Output, Input, the "All active Testpatterns" Pattern field, and each group's own Pattern field except Output's, which stays disabled because the pattern-specific Output fields depend on it) - restoring full expression/local-variable support on Screen, Output and Input in both the action and the feedback, across all three platforms.

### New: "Show Thumbnail" feedback (live preview images on buttons)

Replaces the user's previous manual workaround (a separate generic HTTP-GET Companion connector pointed at the device). Uses the AWJ REST snapshot API, documented as `http://<address>/api/device/snapshots/{inputs|outputs|images|timers}/{n}` (1-based item number, PNG up to 256x256, black-bordered to the source aspect ratio) - added `AWJconnection.getSnapshot()` (`connection.ts`) reusing the existing `ky`-based REST/auth-cookie infrastructure already used for device-state sync and image uploads. Same feedback definition works unchanged on all three platforms (protocol identical), just added once to each platform's `feedbacksToUse`.

Source dropdown: Input / Output / Still Image (Library) / Still Image (Store) / Timer, each revealing its own item dropdown with live, currently-available choices formatted like the rest of the module (e.g. "Input 3 - Camera", "Image 12 - photo.png (1920x1080)"). Still Image (Store) is a separate option from (Library): a Store slot (~24, what's actually usable as a layer source) merely references one Library image (up to 192, the full uploaded repository) via its own `control/pp/source` - the snapshot API only ever addresses Library indices, so selecting a Store slot resolves to whichever Library image it currently references, re-read fresh on every poll so a live re-assignment of the store slot is picked up automatically. The four item dropdowns (not the Source dropdown itself) stay expression/local-variable-capable, for per-button templating the same way "Recall Screen Memory" already is - see the `disableAutoExpression` note in the "Set Testpattern" fix above for why it has to be exactly the other way round (Source needs it, the items must not have it).

Documented device limit: max 1 snapshot request/second *per item*. Implemented as a shared poll per selection (not per button) - if several buttons show the same source/item, they share one HTTP poll instead of each hammering the device independently; if their Refresh Rate options differ, the fastest one wins for that shared poll. Refresh Rate option is clamped 1-120s in the UI to match; the description warns instead that heavy use (many buttons/short Refresh Rates) can meaningfully raise CPU load on whatever device Companion itself runs on.

Two additional safeguards against a "thumbnail wall" page silently becoming the dominant load on whatever's running Companion (worse on constrained hardware like a Raspberry Pi):
- **Global adaptive throttle** (`recalculateThumbnailThrottle` in `feedback.ts`): once more than 16 distinct polls are active at once, every poller's interval is stretched so the combined poll rate stays near ~16/second instead of growing unbounded (e.g. 32 distinct thumbnails end up polling every ~2s each). A button's own Refresh Rate is always honored as a floor - this only ever slows pollers down further, never speeds them up beyond what was asked for. Recalculated live whenever the pool of active pollers grows or shrinks (a feedback (re-)registers or unsubscribes).
- **New config option "Allow Live Thumbnails"** (`config.ts`, default on): an instant kill switch for all thumbnail polling instance-wide, for when even the throttled rate is still too much for a given setup. Turning it off actually tears down every running poller immediately (not just hides the result) via `Feedbacks.stopAllThumbnailPollers()`, called from `configUpdated()` in `index.ts`; turning it back on re-registers every existing "Show Thumbnail" feedback via `checkFeedbacks('deviceThumbnail')`. Needed an upgrade script (`upgrades.ts`) to backfill `true` into configs saved before this option existed - `parseBoolean(undefined)` reads as false, which would otherwise silently turn thumbnails off for existing users on upgrade even though the intended default is on.

Had to be built as an `'advanced'` feedback (not the more common `'boolean'`): a boolean feedback's image (`style.png64`) can only come from a single fixed `defaultStyle` set once at feedback-definition time - it cannot return a *different* freshly-fetched image per button/per poll tick. Only `'advanced'` feedbacks return their style live from the callback on every invocation, which is what a periodically-changing thumbnail needs. Companion's UI marks this as a "legacy style feedback" - investigated whether a newer mechanism exists: Companion does have a new composite/layered graphics system in development, but as of this writing it only exists in unreleased nightly builds of `@companion-module/base` (checked `2.2.0-nightly-main-20260812-...`), and even there it is a new *preset* type (`'layered'`), not a new feedback type - the feedback API itself (`boolean`/`value`/`advanced`) is unchanged even in that nightly. User decided to stay on the stable `'advanced'`/`png64` approach for now rather than depend on an unreleased API.

Companion's feedback API (v2.1.3) has no `subscribe` hook to start a poller when the feedback is first added to a button - worked around the same way `deviceCustom` already does (idempotent lazy registration inside the callback itself, torn down in `unsubscribe`).

### FIXED: "Show Thumbnail" - "Still Image (Library)" removed, it never actually worked

Live-confirmed on a real Aquilon (192.168.20.112): despite the protocol doc's stated range for the "images" snapshot category reading 1-192 (matching the Image Library's own capacity, not the ~24-slot Image Store), the endpoint only ever returns real content for indices that are actually loaded into an Image Store slot. Fetched several valid, uploaded Library-only images (ids outside the Store's range) and got byte-for-byte identical ~875 byte responses every time - a fixed placeholder (solid black), not the real picture - while Store-range ids returned real, differently-sized images. There is no way to snapshot an arbitrary Library image through this API, only what a Store slot is actively showing right now.

The original "Still Image (Store)" implementation made this worse by resolving through `control/pp/source` to the Store slot's underlying Library index before fetching - backwards, since "images/{n}" needed the Store's own slot number all along, not a Library index. Removed "Still Image (Library)" entirely (its own dropdown always showed black beyond whatever coincidentally overlapped with the Store), and simplified "Still Image (Store)" to fetch its own slot number directly, no resolution needed. Also removed the now-nonexistent Library option from the generated "Live - Thumbnails" presets.

### FIXED: "Show Thumbnail" - preset-browser previews could overwhelm the device and leak background pollers

Live-discovered once ~190 "Live - Thumbnails" presets existed for the Still Image Library: Companion actually executes an `'advanced'` feedback's callback once just to render its preset-browser preview thumbnail, even for a preset nobody has placed on a button yet. This isn't true of `'boolean'` feedbacks, which have a static `defaultStyle` Companion can show for an unplaced preview without running anything - `'advanced'` feedbacks have no such fallback, so Companion has no way to know what to draw without actually calling the callback. Opening the preset category fired ~190 snapshot requests at once, which overwhelmed the device (documented limit: 1/second *per item*) and left some thumbnails permanently blank/grey.

Two fixes:
- **Device-wide request queue** (`AWJconnection.getSnapshot()`, `connection.ts`): every snapshot request, regardless of what triggered it (our own polling, or Companion's preview rendering), is now serialized through a single queue that fires at most 1/second. The existing per-item poller throttle only ever protected our own deliberate polling - it did nothing to stop a burst of one-off preview calls, since those don't come through the poller at all.
- **Stale-subscriber self-cleanup** (`feedback.ts`): a preset-browser preview calls the callback exactly once and never again (Companion doesn't track it as a real ongoing instance), but the callback's own bookkeeping had no way to tell that apart from a real placed button - meaning every opened preview was quietly starting a `setInterval` poller that would run forever with no `unsubscribe` ever coming to stop it. Fixed by tracking each poller subscriber's `lastSeen` timestamp, renewed every time its own poll cycle re-triggers the callback (which a real button does forever, but a one-off preview never does again) - a subscriber not renewed within 60s (or 3x its own Refresh Rate, whichever is larger) is dropped, and a poller left with zero subscribers self-terminates on its own next tick instead of continuing to poll for nobody.

### FIXED: "Disable all active Testpatterns" now also clears Raster Boxes on every output (LivePremier/LivePremier4)

Raster Boxes (the Format/AOI centering overlay, set via the separate "Set LivePremier(≤V3) Testpattern Raster Box" action) are independent of the testpattern enable state, so the existing "All active Testpatterns" → "Disable all active Testpatterns" action left them untouched - easy to forget before a show, since they're barely visible on their own. Now clears `centering` to empty on every output alongside disabling every pattern. Deliberately Raster-Box-action-gated (`this.actionsToUse.includes('deviceTestpatternRasterBox')`), so this only runs on LivePremier/LivePremier4 - Midra models the same concept as two separate booleans instead of one array and has no Raster Box action built yet, so nothing changes there.

### Known issues / not yet done

- Dragging some presets onto a Companion page produces an empty button — root cause not yet found; may be related to Companion 5.1's new "linked presets" feature (in beta) rather than our own preset structure. Not yet resolved.
- A handful of fields (`deviceSelectSource`/`selectLayer`'s `screen` field) can't be set via expression themselves because they're referenced by other fields' `isVisibleExpression` (which requires `disableAutoExpression`) — a genuine Companion v2 API trade-off, not yet resolved, needs a systematic decision across all occurrences of this pattern.
- Audio input numbering fix not yet applied to `src/livepremier/choices.ts` (pre-v4-firmware path) or to `getAudioOutputChoices` (outputs) — only confirmed as an input-side issue so far.
- Planned: replace the single "Device Network Address" field with four separate config fields (host, "Simulator?" checkbox for auto port `:3000`, password, "HTTPS?" checkbox with ignored certificate validation), with an upgrade script to auto-migrate existing configs.
- Multiviewer memory recall has no "currently active memory" feedback support — confirmed via live protocol investigation that AWJ doesn't expose this status at all (unlike screen/master presets); flagged as a firmware feature request to Analog Way.
- "Timer Type" field in Timer Adjust, and the Audio Routing `in`/`out` fields, not yet made expression-capable (same `allowInvalidValues` treatment as screen/aux fields).
- Planned: `S{n}.L{m}.width`/`height`/`x`/`y` layer-level variables (same expression-friendly idea as the new screen size variables, one layer down). Deferred because the set is unbounded (many layers × many screens) unlike screens/auxes. Current thinking: register lazily, likely opt-in per button (e.g. only once `devicePositionSizeV3` is actively configured for a specific screen/layer) rather than eagerly for everything — similar in spirit to the vMix Companion module's opt-in variable groups, which exists specifically to keep load low on constrained hardware (Raspberry Pi etc.).
