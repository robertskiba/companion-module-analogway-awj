# Changelog: V2 → V3

This document summarizes **everything** that changed between the old V2 module and the current V3, reorganized by topic instead of chronologically. For a short, non-technical summary aimed at operators, see `Changelog_From_V2_Simple.md`.

Scope note: V3 is built on `@companion-module/base` v2.1.3 (the foundation for native Companion expression/local-variable support in every field) and is a substantial rebuild of most of the module. Nearly everything below is new or changed since V2. Items that **did not exist at all in V2** are marked **[NEW ACTION]**, **[NEW FEEDBACK]**, or **[NEW VARIABLE(S)]**; everything else existed in V2 in some form and was changed, extended, renamed, or fixed.

---

## 1. Platform & compatibility

- **Dropped support for LivePremier/Aquilon firmware below V4.** The dedicated pre-V4 implementation (~2,500 lines duplicating most of the V4 code path) has been removed entirely. Connecting to such a device is now refused outright with a clear "Connection Failure" error instead of silently loading old, unmaintained code. If affected: update the device firmware to V4+ (V6+ recommended), or stay on an older module release from the bitfocus registry.
- **Correct "Alta" product-family naming.** "Alta" (Zenith 100/200) is a completely separate Analog Way product line from `LivePremier4`/Aquilon; Alta/Zenith devices route through the same internal platform as Midra. `Device.Series` correctly reports `"LivePremier"` (Aquilon), `"Midra 4K"`, or the Alta/Zenith equivalent.
- **Firmware-version gates.** Features that require a certain device firmware version now check for it precisely and warn you clearly if your device's firmware is too old, instead of the feature just silently failing or behaving unpredictably.
- **Backup and "Layer Properties - Keying" are not offered on Midra/Alta** (Zenith 100/200) - live-confirmed neither concept exists on that platform.
- **Midra's built-in multiviewer (MTVW) no longer appears in physical-output dropdowns** (Testpattern, GPO, Raster Box, ...), matching LivePremier's own architecture. Still fully reachable through the dedicated Multiviewer dropdowns/variables.

## 2. Foundational: expressions, local variables, and option-field behavior

- **Every dropdown-style option field can now be set via Companion expressions**, including local variables (`$(local:...)`) - the core reason for the base-library migration. Verified end-to-end on real workflows (e.g. copy-pasting a button template and only changing one local variable). Companion's new page variables (`$(page:...)`) work the same way here, but only once Companion 5.10 itself is out of beta and released.
- **Concatenated multi-selection syntax** (`'S1S2A1'` for Screens/Auxscreens, `'L1L2'` for Layers, similar for other multi-target fields) lets one field target several items at once via Expression Mode, with no separator needed - extracted tokens are cross-checked against what currently exists and silently dropped if invalid, never sent to a target that doesn't exist.
- **Checkbox fields now interpret truthy/falsy values consistently everywhere** via a shared `parseBoolean` helper (fixes cases where an expression- or variable-driven checkbox wasn't recognized correctly). Note: Companion itself still treats a checkbox expression evaluating to the number/string `0` as `true` (only the literal string `"false"` is recognized) - use a real boolean expression like `$(var) == 1` if this affects you.
- **Dynamic dropdowns behave sensibly while never connected or between reconnects**: Screens, Inputs, Layers, Images, Memories, Timers, Outputs show the full theoretical range for offline pre-programming, with a clear "No device connected"/"No X configured" placeholder when empty instead of a stale entry.

## 3. Layer Properties (the biggest feature area)

A large, consistent family of actions/feedbacks mirroring WebRCS's own per-Layer property panels:

- **Position & Size** - rebuilt around WebRCS's 9-point Anchor Point model (Center + 8 directional points, globally shared and WebRCS-synced), with "Keep Aspect Ratio" and optional fixed Reference Width/Height (avoids rounding drift over repeated small steps, e.g. an encoder wheel). Values sent 1:1 to the device's raw units. The old keyword-substitution formula system (`lw`/`lh`/`lx`/`ly`/etc. and cross-layer bounding-box math), the separate Anchor X/Y fields, and the "Act on" parameter selector are gone - X/Y/W/H are now always-present fields where leaving one blank means "leave this value untouched". The old action is kept around unchanged as "Set Position and Size (V2, deprecated)" for anyone still relying on its exact old behavior.
- **[NEW ACTIONS] Transitions, Keying, Opacity, Aspect & Crop, Mask, Border, Effects, Speed, Timing** - the full remaining set of per-Layer property panels, each with a blue "Learn" (Get current values) button. None of these existed as dedicated Companion actions in V2.
- **[NEW ACTION] Cut&Fill** - a Layer's Cut&Fill key (Enable/Source/Filter/Transform/Curve/Crop), a structurally distinct property living outside the normal per-preset property tree. Curve is handled as an opaque raw value (learned, not individually edited) since WebRCS itself offers no typeable value and its packed encoding couldn't be reverse-engineered. Crop enforces the same Top+Bottom/Left+Right ≤ 100% live constraint WebRCS itself enforces. Guarded by the device's own `canUseMask` capability flag (a historically-misnamed field that actually tracks Cut&Fill availability per Layer) - a Layer that can't do Cut&Fill is skipped entirely, and any stale "on" state left over from before Cut&Fill was disabled for a Layer is safety-reset to off.
- **[NEW ACTIONS] Set Anchor Point** and **Reset Size or Ratio** (Source Ratio / Content Size / Fullscreen, mirroring WebRCS's layer toolbar buttons). **[NEW FEEDBACK] Global Anchor Point** shows the currently selected global Anchor Point.
- **[NEW ACTIONS] Encoder Adjust** (Layer Properties and Screen/LIVE variants) - relative +/- adjustment actions built for rotary encoders (e.g. a Stream Deck+ dial): pick a property and a step in Raw/Percent/Pixel units, no manual expression math needed.
- **Multi-Layer targeting**: every action in the family now accepts `All Layers` and a concatenated `'L1L2'` Expression Mode string for its Layer field, existence-guarded per Screen, in addition to the original single-Layer selection.
- **"Both (Preview/Program)" Preset targeting**: every action in the family can apply to both Preset banks in one call. Feedbacks offer two separate combinators instead - **"Both (Preview AND Program)"** (true only if consistent on both banks) and **"Both (Preview OR Program)"** (true if true on either) - since a single "Both" is ambiguous for a read.
- **"Toggle" added everywhere On/Off already existed** (Effects Filter/Transform/Strobe, Border Edge/Shadow enable/Round/Smooth, Keying enable, Transitions Allow Cross Effect/Depth, Speed Linear) - flips the flag relative to its live value at the moment the action runs.
- **[NEW FEEDBACK] Combined "Property Status" feedback** - one feedback with a Property dropdown covering every on/off-style Layer Property (Border, Effects, Keying, Cut&Fill Enable, Mask Active, Aspect Override, Transitions Allow Cross).
- **[NEW FEEDBACKS] "Layer Properties - Layer Source" and "Layer Properties - Cut&Fill Source"** - check a Layer's actual Source, or its Cut&Fill key's Source, against an expected value.
- **Source fields across the family now use this module's own short id convention** (`IN{n}`/`IMG{n}`) instead of the raw AWJ id (`LIVE_n`/`STILL_n`) - the raw id is still accepted as a fallback.

## 4. LIVE control (memories, transitions, freeze, selection)

- **Recall Master/Screen/Aux/Layer Memory**, **Take**/**Cut** (renamed from "Take"/"Cut" to "LIVE - Transition TAKE"/"LIVE - Transition CUT" for clarity), **Set T-Bar Position**, **Set Transition Time**, **Copy Program to Preview**, **Lock Screen(s)**, **Screen/Layer/Preset Selection**, **Input Freeze** - all present since V2 but reworked: single-select Screen dropdowns (was multi-select) with a new "First/Only Selected Screen" choice alongside "All Selected Screens", consistent naming, and memory-recall/take/transition-time actions now wait for the device to actually confirm the change before the next action in a sequence runs (fixes "Recall then Take" style sequences).
- **[NEW ACTIONS] "LIVE - Save/Revert Screen Memory Changes"** and **"LIVE - Save Screen Memory to Slot"** - mirror WebRCS's own modified-preset workflow. "Save/Revert" updates whichever Screen Memory is already loaded (Save writes the Screen/Aux's current live state back into it, Revert discards unsaved changes by reloading it). "Save Screen Memory to Slot" is the more flexible one: save the current state into any slot - an explicit slot number or "Next Available" to grab a free one - as well as rename or delete a slot, all from the same action; a safety checkbox (off by default) guards against accidentally overwriting or deleting an already-used memory. **[NEW FEEDBACK] "LIVE - Screen Memory Slot Occupied"** shows whether a given slot currently holds a saved memory. **[NEW VARIABLE] `SM.nextavailable`** exposes that same free-slot number for building your own safe "always save to an empty slot" button.
- **Freeze family**: Input Freeze existed in V2 (fixed and extended, see §14). **[NEW ACTION + FEEDBACK] Output Freeze** (LivePremier4/Aquilon) is entirely new. **[NEW ACTION + FEEDBACK] Screen Freeze and Layer Freeze on LivePremier4/Aquilon** are new, purpose-built implementations (Midra already had its own, simpler equivalents). Layer Freeze in particular is structurally unusual (an array of up to two physical preset-bank tokens, not a boolean) and treats Program/Preview as fully independent. "Toggle" is a single shared decision across every targeted item (if any is frozen, unfreeze all; only if none are frozen, freeze all) rather than independent per-item toggling, to avoid a partially-frozen result from one press.
- **"LIVE - Source Tally"** - shows whether a source is visible on Program/Preview/either/both across one or more Screens; existed in V2. Now uses this module's usual concatenated Expression Mode Screen selection (was Companion's native multi-select) and combines multiple selected Screens with AND (source must be showing on *every* selected Screen) rather than OR; Source field converted to the module's short id convention; Preset field now offers separate "Both (AND)"/"Both (OR)" combinators.
- **Preset dropdown ordering standardized**: "Preview" is listed before "Program" everywhere, and every "Both" choice consistently reads "Both (Preview/Program)"; Encoder Adjust and Set Transition Time both default to "Preview", so a button doesn't silently touch Program too unless that's actually intended.
- **Every Screen/Auxscreen's currently-unused Layers are automatically reset to a safe default state** (LivePremier4/Aquilon) - Source None, full opacity, centered fullscreen, no effects - closing a footgun where a value written to a currently-inactive Layer index could silently resurface already-set once that Layer becomes active again (the device accepts writes to out-of-range indices without validation).

## 5. Preconfig

- **"Preconfig - Inputs - Set Input Keying"** - existed in V2, extended: switches an Input's own keying mode among the values already configured for it in WebRCS: Disabled, Chroma Key, Luma Key, **CremaTTe3D**, and **Cut&Fill** (firmware-gated 4.0.254+ - both new choices). Only the mode is switchable here; the key parameters themselves still need WebRCS. Input field now uses the module's `IN{n}` short id convention (bare number/raw id also accepted). **[NEW FEEDBACK] "Preconfig - Inputs - Input Keying Status"** added.
- **[NEW ACTION + FEEDBACK] "Preconfig - Set Background Set Source"** and its matching **"Background Set Source Status"** feedback (LivePremier4/Aquilon) - assigns/reads which Live Input or Still Image a Background Set (1-8) shows on every physical output of a Screen, using this module's own `IN{n}`/`IMG{n}` convention.
- **"Preconfig - Set Input Plug"** (Midra), with a **[NEW FEEDBACK] "Input Plug Status"**.
- **[NEW ACTION] "Assign Image from Library to Image Store"** (LivePremier4) and **[NEW ACTION] "Assign Image from Library to Foreground/Background Frame"** (Midra, which has no generic per-layer image store and instead uses per-screen Logo/Background frame slots).

## 6. Multiviewer, Timers, Audio

- **Multiviewer**: Recall Memory, Select Source in Widget, Widget Selection actions/feedback - existed in V2, consistent naming applied; multiviewer output variables (`MVW{n}.*`, renamed from a colliding `MV{n}.*`) match Aquilon's own architecture and are correctly excluded from the generic physical-output variable set (where Midra's MTVW output used to leak in).
- **Timers**: Setup, Adjust Time, Transport actions and a State feedback - existed in V2. `TIMER{n}.value`/`.hms`/`.h`/`.m`/`.s` variables (LivePremier4, gated to firmware 4.03.38+, since the device doesn't send timer values before that) - existed conceptually but were fixed (see §14).
- **Audio**: Route (Channels)/Route (Block) actions existed in V2; block size now capped at 8 and clamped to never spill past the 8-channel output module it starts in. **[NEW FEEDBACKS] "Audio - Routing Status" and "Audio - Block Routing Status"** (LivePremier4, LivePremier, Midra). **[NEW ACTION] "Audio - Dante Functions"** - Reboot/Factory Reset/bulk-rename up to 64 Dante Receiver/Transmitter channels, gated behind a mandatory confirmation checkbox (Dante channel *renaming* specifically is known not to take effect on the device despite matching WebRCS's own message sequence - Reboot/Factory Reset work correctly). **[NEW FEEDBACK] "LIVE - Stream Audio Mute Status"** (Midra).

## 7. Backups

- **Input Backup** (Set Backup Set to Source, Set Auto Mode) existed in V2; extended to also cover each Screen's 8 **Background Set** backups. **[NEW FEEDBACKS] "Active Backup Source Status"** and **"Auto Mode Status"** (both Input and Background Set backups) - status now reads the device's actual live state instead of the last-requested command value. **[NEW VARIABLES]** a full set of `backups.setX.*`/`backups.groupX.*` status variables (all VALID/INVALID for consistent condition logic).

## 8. Device-level features

- **Testpatterns**: Set Testpattern (per-platform naming: LivePremier/Midra 4K) existed in V2, extended with Area/Raw Colors/Color options for the Output group and pattern-specific fields for Grid Custom/Crosshatch/Checkerboard. **[NEW FEEDBACK] "Testpattern Active"**, per platform. **[NEW ACTION] Raster Box** (Format/AOI overlay), with a Mode (Enable/Disable/Toggle) selector and its own **[NEW FEEDBACK] "Raster Box Active"**; "Disable all active Testpatterns" now also clears every Raster Box.
- **GPIO** (GPO/GPI State, LivePremier/Aquilon), **Power** (Wake-on-LAN and related, now published even before any connection succeeds, so Wake-on-LAN works in exactly the situation it exists for), **Sync Selection** - all existed in V2.
- **[NEW ACTION] "Device - Failover to Hot Backup"** - maintains a live, send-only mirror connection to a standby device (mirroring Recall/Take/Cut/Preset and screen-lock/selection commands as they happen) and swaps over to it with one confirmed button press if the main device fails during a show; the old main device becomes the new Hot Backup address, so the same action swaps back afterwards. A 30-second cooldown guards against an accidental double-press undoing the swap. **[NEW VARIABLES]** `Device.Connected.Hotbackupdevice`/`Device.IP.Hotbackup`, plus a new "Hot Backup Device" option on the "Device - Connection Status" feedback.
- **[NEW FEEDBACK] "Show Thumbnail"** - a live preview image of an Input, Output, Image Store slot, or Timer directly on a button (Image Library items can't be previewed this way - the device only ever returns real content for what's actively loaded into an Image Store slot). Protected by a shared poll-per-source/item, an adaptive device-wide throttle once many thumbnails are active at once, a "Live - Thumbnails" auto-generated preset group, and a config-wide "Allow Live Thumbnails" kill switch.
- **[NEW VARIABLES] Generic device variables**: `Device.Series`, `Device.Model`, `Device.Name`, `Device.Status.Temperature`, `Device.Status.Fans`, `Device.FirmwareVersion`, `Device.FirmwareGeneration` - for condition-driven Companion logic.
- **[NEW FEEDBACKS] Health/Signal status**: "Device - Health Alarm" (Temperature/Fan), "Device - Input Signal Present"/"Layer Signal Present".
- **Custom Commands**: send a raw custom AWJ get/replace command directly - existed in V2.

## 9. Variables

- **Renamed the entire dynamic-variable set to a consistent `Object{n}.property` scheme** (`S1.label`, `IN1.status`, `MM1`/`SM1`/`LM1`/`MV1` for the four memory types, `TIMER1.value`, etc.), replacing the old ad-hoc/inconsistent V2 names - a rename, not new variables. **Not a breaking change**: a "Use old (V2) variable names" config checkbox controls which scheme is active, auto-enabled for any config that already existed before this change (existing button text/triggers keep working unchanged); new connections default to the new names.
- **[NEW VARIABLES]** A large set of variables that did not exist in V2 at all: per-layer status/source/position variables (`S{n}.layer{x}.*`), screen/output/multiviewer size and format variables, `IN{n}.status`, `OUT{n}.usedin`, aspect ratio variables, `SelectedLayer.*`/`SelectedScreen.*` selection-derived variables. A separate, large group of variables that already existed conceptually in V2 is now correctly registered and visible in Companion - see §14, "Variable registration".
- **`IMG{n}.label`** (renamed from `STILL{n}.label`) for terminology consistency - a rename, not new.

## 10. Naming & UI consistency (mostly cosmetic, no impact on existing shows unless noted)

- Actions reorganized under consistent "Category - Name" prefixes (`LIVE -`, `Layer Properties -`, `Multiviewer -`, `Audio -`, `Preconfig -`, `Device -`, `Backups -`, `Custom Commands -`) with a matching, documented sort order in the action/feedback picker.
- "Preset" clarified to "Preset (Program/Preview)" wherever it meant the program/preview swap (not a saved memory) - 17+ sites, display text only.
- "Any"/"Both"/"All" wording unified module-wide: "Any Screen"/"All Screens"/"All Selected Screens" clearly distinguished, "Any (Program/Preview)"/"Both (Program/Preview)" for the preset-side concept.
- Default values for several "currently active side" fields changed from "whichever is selected" to explicit "Preview", as the safer default for most real workflows.

## 11. Reliability & connection

- **WebSocket "zombie connection" detection**: a periodic ping (15s) forces a reconnect if two are missed - previously the module could keep showing "connected" after the host PC woke from sleep even though the socket was already dead.
- **Reconnection now retries at a flat 10-second interval with a live countdown** in the status, replacing an exponential backoff that could silently leave you waiting much longer with no visible indication.
- **Variable-update storms fixed**: rapid WebRCS actions (e.g. dragging a resize handle) used to be able to flood the module with rebuild work - updates are now debounced and only touch what actually changed.

See §14 for the individual connection/login bugs that were fixed.

## 12. Removed

- Pre-V4 LivePremier/Aquilon firmware support (see §1).

## 13. Known gaps

See `CHANGELOG.md`'s "Planned" and "Midra / Alta - Known Gaps" sections for the exact current list - in short: Input-level Cut & Fill is now done (§5), but Output Freeze, Screen/Layer Freeze, the inactive-Layer cleanup, and Cut&Fill (Layer-level) are all still LivePremier4/Aquilon-only pending Midra hardware verification; a couple of small internal cleanup items (duplicate option-field definitions, an id-convention mismatch on Midra's Source choices) are tracked but not yet fixed. The temporary "(Aquilon)"/"(Midra/Alta)" name suffixes seen throughout the current build are testing aids only and will be removed once testing is complete.

## 14. All bugs fixed since V2

Every bug fix across the V3 development line, grouped by area.

**Variable registration & values**
- Most dynamic module variables never appeared in Companion's variable list at all (memory labels, screen/input labels, timer status/value, transition times, and more) - the value was always computed correctly, but the corresponding variable *definition* was missing, so Companion never made it selectable.
- `LIVE - Input Freeze` feedback's status variable was never actually registered, so it never appeared anywhere in Companion even though it was being computed on every evaluation.
- Several subscriptions' pattern had no capturing group, so they never populated their variables on initial connect, only reacting to later live updates.
- Midra's multiviewer-memory-label subscription had a path typo, silently breaking it entirely.
- The Timer state subscription produced a malformed variable id (captured a stray trailing slash).
- Selection-derived variables (`SelectedLayer.*`, `SelectedScreen.*`, global Anchor Point) could stay blank after a reconnect until a new selection was made, since that part of the protocol only streams changes, not an initial snapshot.
- Disabling a Screen/Aux left its variables stuck at their last value forever instead of clearing and correctly repopulating on re-enable.
- Layer position/size variables could freeze on a freshly-connected instance that hadn't had a live Take/Cut yet.
- A layer's live-input source wasn't recognized correctly depending on whether the device reported it internally as `LIVE_n` or `IN_n`.
- Multiviewer output variables collided with an unrelated Multiviewer Memory variable sharing the same `MV{n}` prefix.
- Newly-enabled Multiviewer outputs (and similar topology changes after connect) didn't get their variables registered until a full reconnect.
- Backup variable updates rebuilt the *entire* Backup variable set on every single change, which could misfire a Companion Trigger watching for "variable changed" during a live show.
- `OUT{n}.sinkdetected` always misleadingly reported "not connected" on SDI outputs, which are physically unable to report sink detection at all.

**Layer Properties**
- "Layer Properties - Source" (and the new Cut&Fill action) used the device's raw internal id instead of this module's own short id convention, which also broke typing a short id via Expression Mode entirely.
- "Layer Properties - Source"'s Layer field silently accepted an `L1`-style Expression Mode reference without stripping the prefix, writing to a Layer path that doesn't exist and failing completely silently.
- "Layer Properties - Position & Size" and "Reset Size or Ratio" crashed outright when a specific numbered Layer (not "First"/"All Selected") was picked from the Layer dropdown.
- Every "Layer Properties" action/feedback on LivePremier4 could silently target the wrong physical preset bank on a screen with "Preset Toggle" enabled - writes were accepted but had no visible effect, and reads came back blank.
- "Get current values" (Learn) on Layer Properties actions wrote an invalid value into the Preset option whenever Preview was the currently-selected preset.
- A newly-created Keying Memory didn't appear in the Keying Preset dropdown until something unrelated happened to trigger a refresh.
- "Set Layer Position and Size" could show multiple, conflicting "Layer" dropdowns visible at once instead of exactly one - the same underlying bug also affected "Reset Layer Size or Ratio".

**Source Tally & Audio**
- "LIVE - Source Tally"'s Source option used the device's raw internal id instead of this module's own short id convention.
- "Audio - Source Tally" (predecessor of "LIVE - Source Tally") could incorrectly report "true" for a "No Source"/Background Set source due to an operator-precedence bug in the check.
- Audio input routing numbering was wrong on multi-card devices whose cards weren't all at maximum capacity - video and audio addressing use different numbering schemes that only coincidentally matched on fully-populated cards.

**Freeze & screen state**
- Midra's "Screen Freeze Status" feedback queried Auxscreens through the wrong internal path, always reporting the wrong live state on an Aux.
- Midra's "Cut" action didn't correctly handle the "First/Only Selected Screen" choice, silently resolving to zero screens.

**Testpatterns**
- Midra's "Set Testpattern" Screen Canvas group never actually worked - the wrong internal id was being sent to the device.
- "Set Testpattern"/"Testpattern Active" fields (Screen/Output/Input, Pattern, and the pattern-specific option groups) didn't reliably show/hide.
- "Disable all active Testpatterns" didn't also clear Raster Boxes (LivePremier/LivePremier4), leaving them on and easy to forget before a show.

**Show Thumbnail**
- Opening the preset browser for the Thumbnail preset group could fire a burst of requests at the device all at once (one per preset shown) and leave background pollers running forever with nothing to stop them.

**Presets & UI**
- Several Multiviewer Memory presets all collapsed into a single preset due to an operator-precedence bug, instead of one per memory.
- A copy-paste bug in an input-selection preset referenced a field that only exists on Midra.
- "LIVE - Screen Lock Status" was missing its default color style, making its state much harder to read at a glance.

**Connection & login**
- The module could keep showing "connected" after the host PC woke from sleep/standby even though the underlying connection was already dead, with no automatic recovery.
- Connecting to a password-protected device could crash the entire module process, or silently never log in - three separate causes in the login flow, all fixed.
- Typing a new device address right after having connected to a local simulator could silently force the simulator's port onto the new, real address.
- A WebSocket resource leak during a rapid reconnect storm could eventually exhaust the OS's available socket buffers.
- A crash risk existed in the sync-on-connect logic when switching sync mode before the device's client list had fully populated.

**Other**
- "Select Layer Source" threw an outright error on Midra/Zenith devices due to a variable mix-up.
- "Set Transition Time" wrote the duration to the wrong T-Bar direction on LivePremier/LivePremier4, causing inconsistent Take transition timing.
- Several dead/duplicate action registrations left over from an earlier migration were cleaned up.
