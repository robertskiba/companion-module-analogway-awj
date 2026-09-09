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
- [ ] **Midra's `INPUT_n` vs. this module's `IN{n}` id convention** - confirm live whether `INPUT_n` is really what the device expects on the wire, or just an artifact of `getLiveInputArray()`'s id reconstruction. This affects every Source dropdown built from `getSourceChoices()` (Layer Properties - Source, Cut&Fill, Source Tally, ...) - if it's a real wire-level id, this module's short-id conversion needs to learn to recognize it too.
- [ ] **Duplicate `sourceFront`/`sourceBack` option fields** in Midra's `deviceSelectSourceV3` override (`src/midra/actions.ts`) - defined twice with conflicting shapes (textinput vs. dropdown). Clean up as its own small fix; retest "Layer Properties - Source" afterward to make sure nothing regresses.

---

## 2. Explicitly not available on Midra - confirm still cleanly absent

Live-confirmed missing in earlier sessions. Just needs a quick sanity check that nothing shows a broken/half-working option for these instead of being cleanly hidden:

- [ ] **Backup** (Input Backup + Background Set Backup) - actions/feedbacks/variables should not appear at all for a Midra connection.
- [ ] **Layer Properties - Keying** - action should not appear at all for a Midra connection.

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

- [ ] Position & Size (V3) + Reset Size or Ratio (Source Ratio / Content Size / Fullscreen) + Set Anchor Point.
- [ ] Source (V3) - short-id (`IN{n}`/`IMG{n}`) resolution, raw id fallback; "Get current values" (Learn).
- [ ] Transitions.
- [ ] Opacity + Encoder Adjust (Opacity/Position/Size/Crop/Mask).
- [ ] Aspect & Crop.
- [ ] Mask.
- [ ] Border.
- [ ] Effects (Filter/Transform/Strobe - note Strobe needs firmware 6.0.4+, confirm the simulator's reported firmware and that the gate behaves correctly either way).
- [ ] Speed.
- [ ] Timing.
- [ ] "Toggle" choice on every on/off flag (Effects, Border, Transitions Allow Cross, Speed Linear).
- [ ] Property Status feedback - every property in the dropdown, both Both-combinators.
- [ ] Layer Source feedback.
- [ ] Global Anchor Point feedback.
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
- [ ] `TIMER{n}.value`/`.hms`/`.h`/`.m`/`.s` variables - note these are currently gated to LivePremier4 firmware 4.03.38+; confirm what Midra's actual equivalent behavior/gate should be (untested assumption right now).

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
- [ ] Expression Mode / local variables work on every option field that should support them (spot-check a handful across different action families, not just Layer Properties).
- [ ] "(Midra/Alta)" name suffixes - once everything above is confirmed working, this is the point where those suffixes get removed from the Midra-tested items (leave Alta-only-relevant uncertainty in place until RC3, if the code truly can't tell them apart yet).

---

**When this list is done**: update `CHANGELOG.md`'s "Midra / Alta - Known Gaps" section to reflect whatever's left (hopefully close to nothing), update `Changelog_From_V2.md`'s §13 accordingly, and remove "(Midra/Alta)" suffixes from every action/feedback confirmed working here.
