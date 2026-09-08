# Changelog: V2 → V3

This document summarizes **everything** that changed between the old V2 module and the current V3, reorganized by topic instead of chronologically. For a short, non-technical summary aimed at operators, see `Changelog_From_V2_Simple.md`.

Scope note: V3 is built on `@companion-module/base` v2.1.3 (the foundation for native Companion expression/local-variable support in every field) and is a substantial rebuild of most of the module. Nearly everything below is new or changed since V2.

---

## 1. Platform & compatibility

- **Dropped support for LivePremier/Aquilon firmware below V4.** The dedicated pre-V4 implementation (~2,500 lines duplicating most of the V4 code path) has been removed entirely. Connecting to such a device is now refused outright with a clear "Connection Failure" error instead of silently loading old, unmaintained code. If affected: update the device firmware to V4+ (V6+ recommended), or stay on an older module release from the bitfocus registry.
- **Correct "Alta" product-family naming.** "Alta" (Zenith 100/200) is a completely separate Analog Way product line from `LivePremier4`/Aquilon; Alta/Zenith devices route through the same internal platform as Midra. `Device.Series` correctly reports `"LivePremier ≤ V3"`, `"LivePremier"` (V4+/Aquilon), `"Midra 4K"`, or the Alta/Zenith equivalent.
- **Firmware-version gates.** Features that require a certain device firmware version now check for it precisely and warn you clearly if your device's firmware is too old, instead of the feature just silently failing or behaving unpredictably.
- **Backup and "Layer Properties - Keying" are not offered on Midra/Alta** (Zenith 100/200) - live-confirmed neither concept exists on that platform.
- **Midra's built-in multiviewer (MTVW) no longer appears in physical-output dropdowns** (Testpattern, GPO, Raster Box, ...), matching LivePremier's own architecture. Still fully reachable through the dedicated Multiviewer dropdowns/variables.

## 2. Foundational: expressions, local variables, and option-field behavior

- **Every dropdown-style option field can now be set via Companion expressions**, including local variables (`$(local:...)`) - the core reason for the base-library migration. Verified end-to-end on real workflows (e.g. copy-pasting a button template and only changing one local variable). Companion's new page variables (`$(page:...)`) work the same way here, but only once Companion 5.10 itself is out of beta and released.
- **Concatenated multi-selection syntax** (`'S1S2A1'` for Screens/Auxscreens, `'L1L2'` for Layers, similar for other multi-target fields) lets one field target several items at once via Expression Mode, with no separator needed - extracted tokens are cross-checked against what currently exists and silently dropped if invalid, never sent to a target that doesn't exist.
- **Checkbox fields now interpret truthy/falsy values consistently everywhere** via a shared `parseBoolean` helper (fixes cases where an expression- or variable-driven checkbox wasn't recognized correctly). Note: Companion itself still treats a checkbox expression evaluating to the number/string `0` as `true` (only the literal string `"false"` is recognized) - use a real boolean expression like `$(var) == 1` if this affects you.
- **Dynamic dropdowns behave sensibly while never connected or between reconnects**: Screens, Inputs, Layers, Images, Memories, Timers, Outputs show the full theoretical range for offline pre-programming, with a clear "No device connected"/"No X configured" placeholder when empty instead of a stale entry.

## 3. Layer Properties (the biggest feature area)

A large, consistent family of actions/feedbacks mirroring WebRCS's own per-Layer property panels, all built (or rebuilt) during V3:

- **Position & Size** - rebuilt around WebRCS's 9-point Anchor Point model (Center + 8 directional points, globally shared and WebRCS-synced), with "Keep Aspect Ratio" and optional fixed Reference Width/Height (avoids rounding drift over repeated small steps, e.g. an encoder wheel). Values sent 1:1 to the device's raw units.
- **Transitions, Keying, Opacity, Aspect & Crop, Mask, Border, Effects, Speed, Timing** - the full remaining set of per-Layer property panels, each with a blue "Learn" (Get current values) button.
- **Cut&Fill** - a Layer's Cut&Fill key (Enable/Source/Filter/Transform/Curve/Crop), a structurally distinct property living outside the normal per-preset property tree. Curve is handled as an opaque raw value (learned, not individually edited) since WebRCS itself offers no typeable value and its packed encoding couldn't be reverse-engineered. Crop enforces the same Top+Bottom/Left+Right ≤ 100% live constraint WebRCS itself enforces. Guarded by the device's own `canUseMask` capability flag (a historically-misnamed field that actually tracks Cut&Fill availability per Layer) - a Layer that can't do Cut&Fill is skipped entirely, and any stale "on" state left over from before Cut&Fill was disabled for a Layer is safety-reset to off.
- **Set Anchor Point** and **Reset Size or Ratio** (Source Ratio / Content Size / Fullscreen, mirroring WebRCS's layer toolbar buttons) round out the family.
- **Encoder Adjust** (Layer Properties and Screen/LIVE variants) - relative +/- adjustment actions built for rotary encoders (e.g. a Stream Deck+ dial): pick a property and a step in Raw/Percent/Pixel units, no manual expression math needed.
- **Multi-Layer targeting**: every action in the family now accepts `All Layers` and a concatenated `'L1L2'` Expression Mode string for its Layer field, existence-guarded per Screen, in addition to the original single-Layer selection.
- **"Both (Preview/Program)" Preset targeting**: every action in the family can now apply to both Preset banks in one call (previously only some `LIVE -` actions could). Feedbacks offer two separate combinators instead - **"Both (Preview AND Program)"** (true only if consistent on both banks) and **"Both (Preview OR Program)"** (true if true on either) - since a single "Both" is ambiguous for a read.
- **"Toggle" added everywhere On/Off already existed** (Effects Filter/Transform/Strobe, Border Edge/Shadow enable/Round/Smooth, Keying enable, Transitions Allow Cross Effect/Depth, Speed Linear) - flips the flag relative to its live value at the moment the action runs.
- **Combined "Property Status" feedback** - one feedback with a Property dropdown covering every on/off-style Layer Property (Border, Effects, Keying, Cut&Fill Enable, Mask Active, Aspect Override, Transitions Allow Cross) instead of one feedback per property.
- **"Layer Properties - Layer Source" and "Layer Properties - Cut&Fill Source" feedbacks** - dedicated value-comparison feedbacks (replacing an earlier, less useful on/off "source assigned" check) for checking a Layer's actual Source or Cut&Fill Source against an expected value.
- **Source fields across the family now use this module's own short id convention** (`IN{n}`/`IMG{n}`) instead of the raw AWJ id (`LIVE_n`/`STILL_n`) - the raw id is still accepted as a fallback.
- Numerous targeted bug fixes: a crash (`layer.layerKey.match is not a function`) when picking a specific numbered Layer on Position & Size/Reset Size or Ratio; Learn writing an invalid Preset value when Preview was selected; every Layer Properties action/feedback on LivePremier4 silently targeting the wrong physical preset bank on a screen with Preset Toggle enabled; a newly-created Keying Memory not appearing in the Keying Preset dropdown until an unrelated refresh; the "L1"-style Layer reference on Layer Properties - Source not stripping its prefix and silently writing to a nonexistent path.

## 4. LIVE control (memories, transitions, freeze, selection)

- **Recall Master/Screen/Aux/Layer Memory**, **Take**/**Cut** (renamed from "Take"/"Cut" to "LIVE - Transition TAKE"/"LIVE - Transition CUT" for clarity), **Set T-Bar Position**, **Set Transition Time**, **Copy Program to Preview**, **Lock Screen(s)**, **Screen/Layer/Preset Selection** - all present since V2 but reworked: single-select Screen dropdowns (was multi-select) with a new "First/Only Selected Screen" choice alongside "All Selected Screens", consistent naming, and memory-recall/take/transition-time actions now wait for the device to actually confirm the change before the next action in a sequence runs (fixes "Recall then Take" style sequences).
- **"LIVE - Save/Revert Screen Memory Changes"** and **"LIVE - Save Screen Memory to Slot"** (+ label edit/delete) - new actions mirroring WebRCS's own modified-preset workflow, with a safety checkbox against accidentally overwriting an existing memory.
- **Freeze family, fully rebuilt**: Input Freeze, Output Freeze (LivePremier4/Aquilon), Screen Freeze, Layer Freeze - each with a matching feedback and (for Input/Output) a live `.freeze` variable. Layer Freeze in particular is structurally unusual (an array of up to two physical preset-bank tokens, not a boolean) and treats Program/Preview as fully independent. "Toggle" is a single shared decision across every targeted item (if any is frozen, unfreeze all; only if none are frozen, freeze all) rather than independent per-item toggling, to avoid a partially-frozen result from one press.
- **"LIVE - Source Tally"** - shows whether a source is visible on Program/Preview/either/both across one or more Screens. Reworked to use this module's usual concatenated Expression Mode Screen selection (was Companion's native multi-select) and now combines multiple selected Screens with AND (source must be showing on *every* selected Screen) rather than OR; Source field converted to the module's short id convention; gained the same "Both AND/OR" Preset combinator split as the Layer Properties feedbacks.
- **Preset dropdown ordering standardized**: "Preview" is now listed before "Program" everywhere, and every "Both" choice consistently reads "Both (Preview/Program)"; several fields (Encoder Adjust, Set Transition Time) that previously defaulted to "Both" now default to "Preview" to avoid silently touching Program too.
- **Every Screen/Auxscreen's currently-unused Layers are automatically reset to a safe default state** (LivePremier4/Aquilon) - Source None, full opacity, centered fullscreen, no effects - closing a footgun where a value written to a currently-inactive Layer index could silently resurface already-set once that Layer becomes active again (the device accepts writes to out-of-range indices without validation).

## 5. Preconfig

- **"Preconfig - Inputs - Set Input Keying"** (renamed from "Preconfig - Set Input Keying") - switches an Input's own keying mode among the values already configured for it in WebRCS: Disabled, Chroma Key, Luma Key, **CremaTTe3D** (a separate, more precise external keying system), and **Cut&Fill** (firmware-gated 4.0.254+ - this turned out to be what "Input-level Cut & Fill" actually is, not a separate feature). Only the mode is switchable here; the key parameters themselves still need WebRCS. Input field now uses the module's `IN{n}` short id convention (bare number/raw id also accepted). Matching **"Preconfig - Inputs - Input Keying Status"** feedback added.
- **"Preconfig - Set Background Set Source"** and its matching **"Background Set Source Status"** feedback (LivePremier4/Aquilon) - assigns/reads which Live Input or Still Image a Background Set (1-8) shows on every physical output of a Screen, using this module's own `IN{n}`/`IMG{n}` convention.
- **"Preconfig - Set Input Plug"** and **"Input Plug Status"** feedback (Midra).
- **"Assign Image from Library to Image Store"** (LivePremier4) and **"Assign Image from Library to Foreground/Background Frame"** (Midra, which has no generic per-layer image store and instead uses per-screen Logo/Background frame slots).

## 6. Multiviewer, Timers, Audio

- **Multiviewer**: Recall Memory, Select Source in Widget, Widget Selection actions/feedback - present with consistent naming; multiviewer output variables (`MVW{n}.*`, renamed from a colliding `MV{n}.*`) match Aquilon's own architecture and are correctly excluded from the generic physical-output variable set (where Midra's MTVW output used to leak in).
- **Timers**: Setup, Adjust Time, Transport actions, with a State feedback and `TIMER{n}.value`/`.hms`/`.h`/`.m`/`.s` variables (LivePremier4, gated to firmware 4.03.38+, since the device doesn't send timer values before that).
- **Audio**: Route (Channels)/Route (Block) actions, each with a matching Routing Status feedback (available on LivePremier4, LivePremier, and Midra); block size capped at 8 and clamped to never spill past the 8-channel output module it starts in. **"Audio - Dante Functions"** - Reboot/Factory Reset/bulk-rename up to 64 Dante Receiver/Transmitter channels, gated behind a mandatory confirmation checkbox (Dante channel *renaming* specifically is known not to take effect on the device despite matching WebRCS's own message sequence - Reboot/Factory Reset work correctly). **"LIVE - Stream Audio Mute Status"** (Midra).

## 7. Backups

- **Input Backup** (Set Backup Set to Source, Set Auto Mode) and **Background Set Backup** (same two actions, extended to cover each Screen's 8 Background Set backups) with matching **Active Backup Source Status**/**Auto Mode Status** feedbacks and a full set of `backups.setX.*`/`backups.groupX.*` status variables (all VALID/INVALID for consistent condition logic). Status now reads the device's actual live state instead of the last-requested command value.

## 8. Device-level features

- **Testpatterns**: Set Testpattern (per-platform naming: LivePremier(≤V3)/LivePremier/Midra 4K), with Area/Raw Colors/Color options for the Output group, pattern-specific fields for Grid Custom/Crosshatch/Checkerboard, and a matching "Testpattern Active" feedback per platform. **Raster Box** (Format/AOI overlay) gained a Mode (Enable/Disable/Toggle) selector and its own "Raster Box Active" feedback; "Disable all active Testpatterns" now also clears every Raster Box.
- **GPIO** (GPO/GPI State, LivePremier(≤V3)/LivePremier), **Power** (Wake-on-LAN and related, published even before any connection succeeds, so Wake-on-LAN works in exactly the situation it exists for), **Sync Selection**, **Failover to Hot Backup**.
- **"Show Thumbnail"** feedback - a live preview image of an Input, Output, Image Store slot, or Timer directly on a button (Image Library items can't be previewed this way - the device only ever returns real content for what's actively loaded into an Image Store slot). Protected by a shared poll-per-source/item, an adaptive device-wide throttle once many thumbnails are active at once, a "Live - Thumbnails" auto-generated preset group, and a config-wide "Allow Live Thumbnails" kill switch.
- **Generic device variables**: `Device.Series`, `Device.Model`, `Device.Name`, `Device.Status.Temperature`, `Device.Status.Fans`, `Device.FirmwareVersion`, `Device.FirmwareGeneration` - for condition-driven Companion logic.
- **Health/Signal status**: "Device - Health Alarm" (Temperature/Fan), "Device - Input Signal Present"/"Layer Signal Present".
- **Custom Commands**: send a raw custom AWJ get/replace command directly, for anything not otherwise exposed.

## 9. Variables

- **Renamed the entire dynamic-variable set to a consistent `Object{n}.property` scheme** (`S1.label`, `IN1.status`, `MM1`/`SM1`/`LM1`/`MV1` for the four memory types, `TIMER1.value`, etc.), replacing the old ad-hoc/inconsistent V2 names. **Not a breaking change**: a "Use old (V2) variable names" config checkbox controls which scheme is active, auto-enabled for any config that already existed before this change (existing button text/triggers keep working unchanged); new connections default to the new names.
- **Large set of newly-registered variables** that either didn't exist before or existed but were silently broken (a widespread V2→V3 regression where the value was computed but never actually registered as a Companion variable definition, so it never appeared in the picker): per-layer status/source/position variables, screen/output/multiviewer size and format variables, Input status/freeze, Output freeze/usedin, aspect ratios, Backup status variables, `SelectedLayer.*`/`SelectedScreen.*` selection-derived variables (now also correctly populated immediately after reconnect, not just after a new live selection).
- **`IMG{n}.label`** (renamed from `STILL{n}.label`) for terminology consistency.

## 10. Naming & UI consistency (mostly cosmetic, no impact on existing shows unless noted)

- Actions reorganized under consistent "Category - Name" prefixes (`LIVE -`, `Layer Properties -`, `Multiviewer -`, `Audio -`, `Preconfig -`, `Device -`, `Backups -`, `Custom Commands -`) with a matching, documented sort order in the action/feedback picker (most recently: Freeze folded into the `LIVE -` group instead of its own category).
- "Preset" clarified to "Preset (Program/Preview)" wherever it meant the program/preview swap (not a saved memory) - 17+ sites, display text only.
- "Any"/"Both"/"All" wording unified module-wide: "Any Screen"/"All Screens"/"All Selected Screens" clearly distinguished, "Any (Program/Preview)"/"Both (Program/Preview)" for the preset-side concept.
- Default values for several "currently active side" fields changed from "whichever is selected" to explicit "Preview", as the safer default for most real workflows.

## 11. Reliability & connection

- **WebSocket "zombie connection" detection**: a periodic ping (15s) forces a reconnect if two are missed - previously the module could keep showing "connected" after the host PC woke from sleep even though the socket was already dead.
- **Reconnection now retries at a flat 10-second interval with a live countdown** in the status, replacing an exponential backoff that could silently leave you waiting much longer with no visible indication.
- **Login/authentication crash fixes**: connecting to a password-protected device used to crash the whole module process or silently fail to log in, from three separate bugs in the login flow (redirect handling, an unhandled promise rejection, and reading cookies from the wrong header API) - all fixed and live-verified.
- **A "new address after a local simulator" bug** could silently force port 3000 onto a real device's address - fixed with a live port-detection probe instead of blindly trusting stale config state.
- **Variable-update storms fixed**: rapid WebRCS actions (e.g. dragging a resize handle) used to be able to flood the module with rebuild work (in one case even blocking Companion's own "disable connection" command) - updates are now debounced and only touch what actually changed.
- Several dead/duplicate action registrations, a crash risk in sync-on-connect logic, and a WebSocket resource leak during rapid reconnects were all cleaned up.

## 12. Removed

- Pre-V4 LivePremier/Aquilon firmware support (see §1).
- "Still Image (Library)" as a Thumbnail source (never actually worked - see the detailed release history for why).
- `out{n}.totalwidth`/`.totalheight` (and the `MV{n}` equivalents) - a real but broadcast-engineering-only value with no Companion use case. **If you reference these on an existing button/trigger, they will need updating - these variable ids no longer exist.**

## 13. Known gaps

See `CHANGELOG.md`'s "Planned" and "Midra / Alta - Known Gaps" sections for the exact current list - in short: Input-level Cut & Fill is now done (§5), but Output Freeze, Screen/Layer Freeze, the inactive-Layer cleanup, and Cut&Fill (Layer-level) are all still LivePremier4/Aquilon-only pending Midra hardware verification; a couple of small internal cleanup items (duplicate option-field definitions, an id-convention mismatch on Midra's Source choices) are tracked but not yet fixed. The temporary "(Aquilon)"/"(Midra/Alta)" name suffixes seen throughout the current build are testing aids only and will be removed once testing is complete.
