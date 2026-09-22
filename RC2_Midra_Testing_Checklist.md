# RC2 Goal: Full Midra Verification (Simulator)

**Roadmap context**: RC2's goal is to have every Midra-relevant action, feedback, and variable verified against the Midra/Eikos 4K simulator. RC3 will do the same pass for Alta/Zenith. Once both are done and confirmed working, the temporary "(Aquilon)"/"(Midra/Alta)" name suffixes can be removed for the final v3.0.0 release.

**How to use this list**: work top to bottom. Section 1 is the highest-value work - each item there currently blocks something from being tested at all, or needs a decision before it even reaches "tested/not tested". Sections 2+ are the systematic sweep through every Midra-registered action/feedback/variable, grouped the same way the action picker itself is grouped.

---

## 1. Known Gaps - decide + verify first

These are called out in `CHANGELOG.md`'s "Midra / Alta - Known Gaps" section. Each needs a decision (enable it for Midra now that it can be tested, confirm it's genuinely not applicable, or leave it deferred) before/while testing.

- [ ] **Output Freeze** - not yet enabled for Midra (`actionsToUse`/`feedbacksToUse`/`subscriptionsToUse` in `src/midra/*.ts`). Check whether Midra has a per-output freeze concept in the simulator's state tree at all; if yes, register the three ids and test; if no, note it as "not applicable to Midra" instead of "gap".
- [ ] **"LIVE - Screen Freeze" / "LIVE - Layer Freeze" (the newer LivePremier4-style actions/feedbacks)** - Midra currently keeps its own older, simpler `deviceScreenFreeze`/`deviceLayerFreeze` implementation instead (see section 3 below - that's the one to actually test as Midra's current behavior). Decide whether the newer pattern should eventually replace it, or whether the old one stays Midra's permanent implementation.
- [ ] **Automatic "reset unused Layers to a safe default" cleanup** - Aquilon-only. Confirm in the simulator whether Midra's Layer list is a fixed-size array the same way LivePremier4's is, or something else - needed before this can even be attempted for Midra.
- [ ] **"Layer Properties - Cut&Fill" action** - not registered for Midra. Check whether the simulator's layer object has a `cutNFill` property at all; if yes, register `deviceLayerCutFillV3` and test against it; if no, confirm Cut&Fill genuinely doesn't exist on Midra (same way Keying was confirmed absent).
- [ ] **"Layer Properties - Cut&Fill Source" feedback** - same as above, tied to the same registration.
- [ ] **`canUseMask` capability guard** - only registered for LivePremier4. Check whether Midra layers expose an equivalent `status.pp.canUseMask` (or similarly-named) flag; if Cut&Fill turns out not to exist on Midra at all, this becomes moot.
- [x] **Midra's `INPUT_n` vs. this module's `IN{n}` id convention** - resolved (2026-09-22, Eikos 4K simulator): `INPUT_n` is the device's real wire-level id, not an artifact - both `device/inputList`'s item keys and a layer's `source/pp/input` read `INPUT_1`, the same namespace on both sides. The short-id conversion now recognises it and converts back per platform, so every Source dropdown shows `IN{n}`. Round-trip verified live (picked `IN2`, device received `INPUT_2`, Learn returned `IN2`).
- [x] **Duplicate `sourceFront`/`sourceBack` option fields** in Midra's `deviceSelectSourceV3` override - resolved. Worse than a cosmetic duplicate: the two definitions used different "don't change" sentinels (`''` vs `'keep'`) against a callback checking `!== ''`, so whichever won, one path was wrong. Both fields are gone entirely - the Aux background and the foreground frame are now driven by the single shared "Source" field, with per-target validation. Companion no longer logs the duplicate-id warning. Retested live: Aux background, Foreground image, Background Set and Color all apply correctly.

---

## 2. Explicitly not available on Midra - confirm still cleanly absent

Live-confirmed missing in earlier sessions. Just needs a quick sanity check that nothing shows a broken/half-working option for these instead of being cleanly hidden:

- [ ] **Backup** (Input Backup + Background Set Backup) - actions/feedbacks/variables should not appear at all for a Midra connection.
- [ ] **Layer Properties - Keying** - action should not appear at all for a Midra connection.
- [x] **Layer Memories** - confirmed genuinely absent (2026-09-22, Eikos 4K simulator state): `device/preset` holds only `bank` (200 Screen Memory slots), `auxBank` (200) and `masterBank` (50), with no layer bank of any kind. The commented-out `deviceLayerMemory` action and the missing `layerMemoryLabel`/`layerMemoriesChange` subscriptions are correct, not an oversight, so there is no `LM{n}.label` on Midra. Nothing to enable.

---

## 3. LIVE control

- [ ] Recall Screen Memory (Midra's own `deviceScreenMemory`, not the LivePremier4 preset-bank version) - recall on Program, Preview, both; single screen, "First/Only Selected Screen", "All Selected Screens", concatenated `S1S2` expression.
- [ ] Recall Aux Memory **(Midra/Alta)** - same target-resolution sweep as above.
- [ ] Recall Master Memory - all Screens variant, per-screen variant.
- [ ] Recall Multiviewer Memory.
- [ ] Take / Cut (Screen) - all Screen-targeting modes; confirm "First/Only Selected Screen" resolves correctly (this had a bug on Midra's Cut action historically - retest explicitly).
- [ ] Set T-Bar Position.
- [ ] Set Transition Time - defaults to Preview; test Both (Preview/Program) too.
- [ ] Screen - Encoder Adjust (T-Bar Position / Transition Time, Raw/Percent/Pixel steps).
- [ ] Copy Program to Preview.
- [ ] Lock Screen(s) / Select Preset (Program/Preview) / Select Screen / Select Layer (+ V3 variant) - all target-resolution modes.
- [ ] Input Freeze - Freeze/Unfreeze/Toggle, `IN1`/bare number/`IN_1` all accepted, `IN{n}.freeze` variable live-updates.
- [ ] Screen Freeze (Midra's own single-flag implementation) - Freeze/Unfreeze/Toggle.
- [ ] Layer Freeze (Midra's own single-flag implementation) **(Midra/Alta)** - Freeze/Unfreeze/Toggle.
- [ ] Source Tally - single screen, `All Screens`, concatenated `S1S2` (AND-across-screens behavior); Both (AND) vs. Both (OR) preset combinators; Source field short-id (`IN{n}`) vs. whatever Midra's raw id actually is (see gap above).
- [ ] Save/Revert Screen Memory Changes / Save Screen Memory to Slot - **currently NOT registered for Midra** (`deviceUpdatePreset`/`deviceSaveScreenMemory` commented out, pending verification of whether a matching `device/preset/bank/control/save/...` path exists). Decide: verify against the simulator and enable, or leave as a permanent LivePremier4-only feature and update the docs accordingly.
- [ ] `SM.nextavailable` variable - confirm it now live-updates correctly on Midra too (this session's subscription-path fix, not yet simulator-tested).

## 4. Layer Properties

For every item below: single Layer, "All Selected Layers"/"First/Only Selected Layer", concatenated `L1L2`; Preview/Program/Both (Preview/Program) on the action side; "Both (Preview AND Program)"/"Both (Preview OR Program)" on the feedback side.

- [x] Position & Size (V3) - verified 2026-09-22 on numbered layers and the Foreground. The Foreground is positioned but not resized (it has no size node); a note in the form says so. "Use Global Anchor Point" and the "Set Anchor Point" action are gone here: Midra has no global anchor at all - its REMOTE snapshot carries no live/screens/layers node and positions are always centre-relative, so a fullscreen 1920x1080 layer reads 960/540. The per-action anchor choices stay, since the corner-to-centre conversion is done by this module rather than the device. Reset Size or Ratio still open.
- [x] Source (V3) - verified 2026-09-22. One Source field drives every target; `INPUT_n` confirmed as the real wire id and shown as `IN{n}`; Aux background, Foreground image, Background Set and Color all apply, invalid picks are dropped. Round-trip and Learn confirmed.
- [x] Per-Layer variables (`Sx.{pgm|prw}.layerY.*`, `.layerbg`, `.layerfg`) - verified 2026-09-22 including a Take, after which Program and Preview swap correctly. Needed three fixes first: the layer count was read from a screen field Midra does not have (so no numbered layer variables existed at all), the live preset key was read as control/pp/presetUp under the S1-style key (so even layerbg stayed blank), and the subscription watched source/pp/inputNum, position-node sizes and presetUp - none of which match on Midra. Variables were also split per bank and gained a Foreground entry in the same pass.
- [x] Transitions - verified 2026-09-22 on numbered layers, Background and Foreground. Needed three fixes: the cross flags use a different vocabulary on Midra (a single negative DISABLE_CROSS_EFFECT / DISABLE_CROSS_DEPTH rather than LivePremier's FORCE_CROSS/FORCE_TRANSITION pair and DEPTH_CUT_* family, so turning one on means removing a token), "Wipe 2" does not exist there, and the Flying Curve offers only Linear and the two arcs. A Background accepts only Fade or Cut, so anything else collapses to Cut, and its Way, flags and flying curve are not sent at all.
- [ ] Opacity (verified 2026-09-22: numbered layers, Background and Foreground) + Encoder Adjust (Opacity/Position/Size/Crop/Mask) - Encoder Adjust still open.
- [x] Aspect & Crop - verified 2026-09-22. Midra has its own value list: no NONE, but GLOBAL_SETTING first and INPUT_SETTING (the equivalent of LivePremier's NONE) last, both read back off the device rather than guessed. Foreground is offered without Aspect Override, which only numbered layers have.
- [x] Mask - verified 2026-09-22 on all three layer kinds, pixels and percent. Pixel round-trip is exact within the device's own 16-bit resolution (150px of 1080 stores as 9102 = 149.9963px; this module rounds back to 150, WebRCS displays 149).
- [ ] Border.
- [ ] Effects (Filter/Transform/Strobe - note Strobe needs firmware 6.0.4+, confirm the simulator's reported firmware and that the gate behaves correctly either way).
- [x] Speed - verified 2026-09-22. Pt1/Pt2 work on all three layer kinds. The Linear/Smooth switch is removed on Midra: WebRCS has no such setting and the device stores a plain 'SMOOTH' rather than LivePremier's 'SMOOTH_TRANSITION'/'LINEAR_TRANSITION'.
- [x] Timing - verified 2026-09-22. Needed a fix first: the ms-to-raw conversion reads the screen's transition time, and did so the LivePremier way (screen group keyed by 'S1', presetUp/presetDown, takeUpTime/takeDownTime). Midra keys by the bare number and has a single takeTime, so every write was silently skipped.
- [ ] "Toggle" choice on every on/off flag (Effects, Border, Transitions Allow Cross, Speed Linear).
- [ ] Property Status feedback - every property in the dropdown, both Both-combinators.
- [x] Layer Source feedback - verified 2026-09-22, including with a local variable in the Source field. Needed a fix first: three subscription patterns ended in source/pp/inputNum (LivePremier's field name) and so never fired on Midra, where it is source/pp/input. The feedback was therefore only ever evaluated once, at connect - whichever input was set then stayed true and every other stayed false, which looked like a comparison bug. The same patterns feed SelectedLayer.Input.* and Sx.layerY.source, both confirmed live-updating again.
- [x] ~~Global Anchor Point feedback~~ - removed for Midra (2026-09-22): confirmed in the protocol that its REMOTE snapshot has no live/screens/layers node and no anchorPoint anywhere, so the feedback could only ever report CENTER for a setting the device does not have. Nothing to test.
- [ ] ~~Cut&Fill action/feedback~~ - see Known Gaps above, not yet registered.
- [ ] ~~Keying~~ - confirmed not applicable to Midra, nothing to test.

## 5. Multiviewer

- [ ] Recall Multiviewer Memory (also listed under LIVE above - just the one action).
- [ ] Select Source in Widget.
- [ ] Widget Selection feedback.
- [ ] Multiviewer output variables (`MVW{n}.*`) - confirm these populate correctly and don't leak an `outMTVW` entry into the generic `OUT{n}.*` set (this was the original bug this session's naming fix addressed - worth a direct regression check).

## 6. Timers

- [ ] Timer Setup / Adjust Time / Transport.
- [ ] Timer State feedback.
- [x] `TIMER{n}.value`/`.hms`/`.h`/`.m`/`.s` variables - confirmed impossible on Midra (2026-09-22, Eikos 4K simulator state): a timer carries only `control/pp` (type, label, `countdownDuration`, the transport flags) and `status/pp/state`. The device reports no running time at all, so there is nothing to expose - `countdownDuration` is the configured length, not a live value. The `timerValue` subscription staying LivePremier4-only is correct; only `TIMER{n}.status` exists here. Nothing to enable.

## 7. Audio

- [ ] Route (Channels) / Route (Block) - block size cap/clamp behavior at output-module boundaries.
- [ ] Audio Routing Status / Block Routing Status feedbacks.
- [ ] Dante Functions - Reboot/Factory Reset only (renaming is known broken everywhere, not Midra-specific) - confirm the safety-confirmation checkbox gating still works.
- [ ] Stream Control **(Midra/Alta)**.
- [ ] Mute Stream **(Midra/Alta)** + Stream Running State feedback **(Midra/Alta)** + Stream Audio Mute Status feedback **(Midra/Alta)**.

## 8. Preconfig

- [ ] Inputs - Set Input Keying - confirm whether CremaTTe3D and Cut&Fill actually exist/work on Midra's `mode` field at all - both are only live-confirmed on a real Aquilon so far, and Midra's own callback override doesn't carry over the base's `isFirmwareAtLeast('4.0.254')` guard on Cut&Fill (it just sends it unconditionally). If either mode doesn't exist on Midra, remove it from the choices there rather than adding a Midra-specific firmware gate. Input field short-id/bare-number/raw-id resolution.
- [ ] Inputs - Input Keying Status feedback - same mode coverage.
- [ ] Set Input Plug **(Midra/Alta)** + Input Plug Status feedback **(Midra/Alta)**.
- [ ] Assign Image from Library to Foreground/Background Frame **(Midra/Alta)** - Logo vs. Background frame type, all 4 slots, "None (clear)".
- [ ] ~~Set Background Set Source / Background Set Source Status~~ - Aquilon-only by design (no Background Set concept assumed the same way on Midra) - confirm this assumption is actually correct rather than just unverified.

## 9. Device-level

- [ ] Set Testpattern (Midra 4K naming) - Screen Canvas + Output groups, Area/Raw Colors/Color options, Grid Custom/Crosshatch/Checkerboard pattern-specific fields, Pathological pattern, 30bit Testpattern #1/#2.
- [ ] Testpattern Active feedback (Midra 4K) - matching coverage.
- [ ] Raster Box action/feedback - confirm intentionally unavailable on Midra (models patterns as two booleans instead of one array, per existing notes) rather than silently broken.
- [ ] GPIO (GPO/GPI State) - confirm current registration status; the base `deviceGpioOut`/`deviceGpioIn` feedbacks are commented out in `feedbacksToUse` (line 55-56) - decide if that's intentional for Midra or should be enabled.
- [ ] Power (Wake-on-LAN etc.).
- [ ] Sync Selection.
- [ ] Failover to Hot Backup - swap over, swap back, 30s cooldown; confirm the mirrored command set (Recall/Take/Cut/Preset/lock/selection) actually applies cleanly to a second Midra simulator instance if one is available, otherwise test the config/UI path as far as possible.
- [ ] Show Thumbnail feedback - Input/Output/Image Store/Timer sources, refresh rate, throttling under many active thumbnails.
- [ ] Generic device variables (`Device.Series` should read "Midra 4K", `Device.Model`, `Device.Name`, `Device.Status.Temperature`, `Device.Status.Fans`, `Device.FirmwareVersion`, `Device.FirmwareGeneration`).
- [ ] Health Alarm feedback / Input Signal Present / Layer Signal Present feedbacks.
- [ ] Connection Status feedback - Main Device states; Hot Backup Device state once configured.
- [ ] Custom Commands (raw get/replace).

## 10. Cross-cutting regression checks

Things this session touched broadly that are worth spot-checking specifically on Midra, since most live verification so far was done against Aquilon:

- [ ] sortName ordering - action/feedback picker groups appear in the documented order (LIVE → Multiviewer → Layer Properties → Timers → Audio → Preconfig → Device → Custom Commands) with nothing missing or duplicated for Midra's specific action set.
- [ ] Dynamic dropdowns (Screens, Inputs, Layers, Images, Memories, Timers, Outputs) behave correctly while disconnected and immediately after connecting to the simulator - full theoretical range offline, real range once connected, no stale entries after a reconnect.
  - Known starting point: Midra's `getMasterMemoryArray()` and `getAuxMemoryArray()` (`src/midra/choices.ts`) are full re-implementations that drop the base class's `syntheticRangeIfNeverConnected()` call, so those two dropdowns are empty while disconnected instead of offering the full theoretical range for pre-programming. Screen Memories, Multiviewer Memories, Inputs and Timers are unaffected (they either go through the base with Midra's own `constants.screenMemoryPath`, or handle the offline case themselves). Decide whether the two overrides are needed at all, or whether a path constant would let them use the base like Screen Memories do.
- [x] Platform constants match the real device (2026-09-22, Eikos 4K simulator state): Inputs 16, Screen Memories 200, Master Memories 50, Multiviewer Memories 20, Stills 50, Timers 3 - all exactly as declared in `src/midra/constants.ts`. The device additionally reports 4 Screens, 4 Aux screens, 7 Outputs and 27 Multiviewer widgets. One loose end, cosmetic only: `auxMemoryLabel`'s `ini` hardcodes `200` (`src/awjdevice/subscriptions.ts`) instead of a constant, and no `maxAuxMemories` exists - the number happens to be right.
- [ ] Expression Mode / local variables work on every option field that should support them (spot-check a handful across different action families, not just Layer Properties).
- [ ] "(Midra/Alta)" name suffixes - once everything above is confirmed working, this is the point where those suffixes get removed from the Midra-tested items (leave Alta-only-relevant uncertainty in place until RC3, if the code truly can't tell them apart yet).

---

**When this list is done**: update `CHANGELOG.md`'s "Midra / Alta - Known Gaps" section to reflect whatever's left (hopefully close to nothing), update `Changelog_From_V2.md`'s §13 accordingly, and remove "(Midra/Alta)" suffixes from every action/feedback confirmed working here.
