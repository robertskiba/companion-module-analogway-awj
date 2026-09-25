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
- [ ] Take / Cut (Screen) - all Screen-targeting modes; confirm "First/Only Selected Screen" resolves correctly (this had a bug on Midra's Cut action historically - retest explicitly). *(Partial 2026-09-22: Take on a single named screen works. The targeting sweep and Cut are still open.)*
- [x] Set T-Bar Position (verified 2026-09-22: writes `control/pp/tbarPosition`, device follows; `SelectedScreen.tbarPosition` reports the absolute bar position 0-100, where 0 is down and 100 is up. A Take does **not** move the bar back - neither on the device nor in WebRCS - so a variable standing at 100 after a transition is correct, not stale. Needed a subscription-pattern fix first; the Midra screen group lives under `device/transition/screenList` with bare numeric item keys, not `device/screenAuxGroupList`/`S1`).
- [x] Set Transition Time - defaults to Preview; test Both (Preview/Program) too (verified 2026-09-22).
- [x] Screen - Encoder Adjust (T-Bar Position / Transition Time, Raw/Percent/Pixel steps) (verified 2026-09-22: Transition Time worked immediately; T-Bar Position needed the same path fix plus a rewrite of the stepping. Now absolute - "+" up, "-" down, a no-op at either end - and stepped in whole percent, converting to raw only at the end, because the raw range does not divide evenly by a typical step and the other order landed on 50.01%. The earlier "always advance the transition" model is deliberately abandoned: over-turning at the top ran the bar back down and triggered a take).
- [ ] Copy Program to Preview.
- [ ] Lock Screen(s) / Select Preset (Program/Preview) / Select Screen / Select Layer (+ V3 variant) - all target-resolution modes. *(Partial 2026-09-22: Select Layer verified with Sync Selection both on and off, and consumed by a Layer Properties action via "First/Only Selected Layer". Needed a fix first - with Sync off the selection action read LOCAL/layerIds raw and called findIndex on it, so the first selection on a fresh connection threw before storing anything and every later "selected layer" resolved to nothing. Lock, Select Preset and Select Screen still open.)*
- [ ] Input Freeze - Freeze/Unfreeze/Toggle, `IN1`/bare number/`IN_1` all accepted, `IN{n}.freeze` variable live-updates.
- [ ] Screen Freeze (Midra's own single-flag implementation) - Freeze/Unfreeze/Toggle.
- [ ] Layer Freeze (Midra's own single-flag implementation) **(Midra/Alta)** - Freeze/Unfreeze/Toggle.
- [ ] Source Tally - single screen, `All Screens`, concatenated `S1S2` (AND-across-screens behavior); Both (AND) vs. Both (OR) preset combinators; Source field short-id (`IN{n}`) vs. whatever Midra's raw id actually is (see gap above).
- [x] Save Screen Memory to Slot - implemented and verified 2026-09-22, all three actions (save, update label, delete). The save path does not appear in the REST snapshot at all, so it was read off the websocket while saving in WebRCS: `device/preset/bank/control/save/screenList/items/{screen}/presetList/items/{PROGRAM|PREVIEW}/slotList/items/{slot}/pp/xRequest`. The screen is a bare number and the preset segment is the *logical* PROGRAM/PREVIEW, not the UP/DOWN that `getPreset()` returns here. Auxes are covered too, added right after with the same capture for their own bank: the two keep entirely separate 200-slot banks, so the form carries a slot list for each and shows the one matching the Screen/Aux chosen above.
  - Two bugs only repeated testing exposed, both silent. The Aux support wired the bank through every path except the save request itself, which stayed pointed at the Screen bank - a valid path for a different screen, so nothing happened and nothing complained. And `xRequest` is edge-triggered while keeping its last value, so a bare `true` saved exactly once per slot and preset and then never again; it is pulsed false-then-true now, like every other x-command here. Worth remembering for any future capture: WebRCS's *first* save in a trace is a plain `true` and only the repeats are pulses, so a single-shot capture hides this.
  - Both false alarms during the test were the shared safety checkbox, which blocks relabel and delete on an occupied slot just as it blocks overwriting one. Kept exactly as it is, per explicit decision, but it no longer fails silently - it logs which checkbox to tick.
- [x] Save/Revert Screen Memory Changes - implemented and verified 2026-09-22, both modes, on Screens and Auxes and with "All Screens". Captured on the wire: saving is the *same* command as saving to a slot, just aimed at whichever slot is loaded - there is no separate update command. Reverting was never captured on either bank, so it reloads the same memory, which is what restoring the saved state means; confirmed working that way. Both preset spellings are needed and are not interchangeable - the command paths take the logical PROGRAM/PREVIEW, the loaded slot number is read from the physical UP/DOWN bank.
- [ ] `SM.nextavailable` variable - confirm it now live-updates correctly on Midra too (this session's subscription-path fix, not yet simulator-tested).

## 4. Layer Properties

For every item below: single Layer, "All Selected Layers"/"First/Only Selected Layer", concatenated `L1L2`; Preview/Program/Both (Preview/Program) on the action side; "Both (Preview AND Program)"/"Both (Preview OR Program)" on the feedback side.

- [x] Position & Size (V3) - verified 2026-09-22 on numbered layers and the Foreground. The Foreground is positioned but not resized (it has no size node); a note in the form says so. "Use Global Anchor Point" and the "Set Anchor Point" action are gone here: Midra has no global anchor at all - its REMOTE snapshot carries no live/screens/layers node and positions are always centre-relative, so a fullscreen 1920x1080 layer reads 960/540. The per-action anchor choices stay, since the corner-to-centre conversion is done by this module rather than the device.
- [x] Reset Size or Ratio - verified 2026-09-22 in all three modes (Fullscreen, Source Ratio, Content Size), including the anchor staying visually fixed while the box resizes. Source Ratio and Content Size deliberately do nothing without a source of known resolution, the same rule as crop in pixels. Background and Foreground are skipped, having no size node, and the Screen dropdown offers no Auxes on Midra.
- [x] Source (V3) - verified 2026-09-22. One Source field drives every target; `INPUT_n` confirmed as the real wire id and shown as `IN{n}`; Aux background, Foreground image, Background Set and Color all apply, invalid picks are dropped. Round-trip and Learn confirmed.
- [x] Per-Layer variables (`Sx.{pgm|prw}.layerY.*`, `.layerbg`, `.layerfg`) - verified 2026-09-22 including a Take, after which Program and Preview swap correctly. Needed three fixes first: the layer count was read from a screen field Midra does not have (so no numbered layer variables existed at all), the live preset key was read as control/pp/presetUp under the S1-style key (so even layerbg stayed blank), and the subscription watched source/pp/inputNum, position-node sizes and presetUp - none of which match on Midra. Variables were also split per bank and gained a Foreground entry in the same pass.
- [x] Transitions - verified 2026-09-22 on numbered layers, Background and Foreground. Needed three fixes: the cross flags use a different vocabulary on Midra (a single negative DISABLE_CROSS_EFFECT / DISABLE_CROSS_DEPTH rather than LivePremier's FORCE_CROSS/FORCE_TRANSITION pair and DEPTH_CUT_* family, so turning one on means removing a token), "Wipe 2" does not exist there, and the Flying Curve offers only Linear and the two arcs. A Background accepts only Fade or Cut, so anything else collapses to Cut, and its Way, flags and flying curve are not sent at all.
- [x] Opacity (verified 2026-09-22: numbered layers, Background and Foreground) + Encoder Adjust - verified 2026-09-22 across all five modes (Opacity, Position, Size, Crop, Mask). Three fixes went in alongside it: Mask in pixels normalized against a hardcoded 1920x1080 for any layer without a size node of its own, which is Midra's Background and Foreground (right by accident on a 1920x1080 Screen, half-size on a 4K one); Width/Height could be driven negative; and the Opacity and Mask modes were not checked against `layerSupports` at all. The skip for a Midra Aux, which has neither node, is enforced in code rather than device-tested - an Aux has no positionable layer to aim an encoder at in the first place.
- [x] Aspect & Crop - verified 2026-09-22. A later pass on the Encoder found that 100% was being sent as 65536, one past what the field holds, so the device ignored it and a crop at 90.01% would not take a 10% step - the divisor is 65536 but the top value is 65535. Also confirmed, by reproducing it in WebRCS, that crop in pixels doing nothing on a layer with `source: NONE` is the device's own behaviour and not a module bug: crop is a fraction of the *source's* resolution, so with no source there is no pixel reference. Midra has its own value list: no NONE, but GLOBAL_SETTING first and INPUT_SETTING (the equivalent of LivePremier's NONE) last, both read back off the device rather than guessed. Foreground is offered without Aspect Override, which only numbered layers have.
- [x] Mask - verified 2026-09-22 on all three layer kinds, pixels and percent. Pixel round-trip is exact within the device's own 16-bit resolution (150px of 1080 stores as 9102 = 149.9963px; this module rounds back to 150, WebRCS displays 149).
- [x] Border - verified 2026-09-22 on numbered layers. The value list turned out to be identical to LivePremier's (`EDGE`, `SMOOTH`, `ROUNDED`), read off the device rather than assumed. Background and Foreground are not offered Border at all; that side is enforced in code (`layerSupports`) rather than device-tested, since the nodes do not exist there.
- [x] Effects (Filter/Transform) - verified 2026-09-22 on numbered layers; the Filter and Transform vocabularies are also identical to LivePremier's (`BLACK_N_WHITE`, `NEGATIVE`, `SEPIA`, `SOLAR`, `FLIP_H`, `FLIP_V`). As with Border, Background and Foreground are not offered Effects.
- [x] ~~Strobe~~ - confirmed not applicable to Midra (2026-09-22): the feature does not exist on the platform at all, so this is not a firmware gate but a permanent absence, and the field is hidden via a constant rather than a firmware comparison. If Analog Way ever adds it, it will show up in their release notes and the constant can be flipped then.
- [x] Speed - verified 2026-09-22. Pt1/Pt2 work on all three layer kinds. The Linear/Smooth switch is removed on Midra: WebRCS has no such setting and the device stores a plain 'SMOOTH' rather than LivePremier's 'SMOOTH_TRANSITION'/'LINEAR_TRANSITION'.
- [x] Timing - verified 2026-09-22. Needed a fix first: the ms-to-raw conversion reads the screen's transition time, and did so the LivePremier way (screen group keyed by 'S1', presetUp/presetDown, takeUpTime/takeDownTime). Midra keys by the bare number and has a single takeTime, so every write was silently skipped.
- [x] "Toggle" choice on every on/off flag - verified 2026-09-22. Transitions' Allow Cross Effect/Depth were the interesting half, since Midra encodes them as a single negative `DISABLE_*` token whose presence means "off", so a toggle has to read the state inverted before flipping it. Effects and Border are positively encoded and confirmed too, including Edge on a Preview layer. Speed Linear does not exist on Midra. Checked while testing that the state cache a toggle reads from cannot be stale: the state machine writes every incoming patch regardless of which subscriptions are registered, and both `effects/pp/flags` and `border/{edge,shadow}/pp/style` really exist on an Eikos.
  - One false alarm worth remembering: "First/Only Selected Screen" + "First/Only Selected Layer" appeared broken and was a selection that had not been made. With Sync off the two selections are independent and the layer list is filtered against the selected screens, so no selected screen means no target regardless of the layer. Documented in HELP.md's Sync section rather than changed - per explicit decision, the two selections stay independent.
- [x] Property Status feedback - verified 2026-09-22 across the dropdown and both Both-combinators. Three changes went in with it. "Cut&Fill - Enabled" is gone here: it reads a layer's canUseMask flag and cutNFill/pp/type, neither of which exists on a Midra layer, and the matching action is not registered either. Aspect Override gained Midra's own Global Settings and Input Setting, which the action could set but nothing could read back; the four inherited entries kept their ids so earlier RC buttons still work. And the Layer list now offers the Background and Foreground, with the callback asking `layerSupports` so a property a given layer does not have reports off instead of reading a phantom node - live-confirmed that a Screen's background has a mask but no aspect override, its foreground has crop edges and a mask, and an Aux background is the mirror image.
- [x] Layer Source feedback - verified 2026-09-22, including with a local variable in the Source field. Needed a fix first: three subscription patterns ended in source/pp/inputNum (LivePremier's field name) and so never fired on Midra, where it is source/pp/input. The feedback was therefore only ever evaluated once, at connect - whichever input was set then stayed true and every other stayed false, which looked like a comparison bug. The same patterns feed SelectedLayer.Input.* and Sx.layerY.source, both confirmed live-updating again.
- [x] ~~Global Anchor Point feedback~~ - removed for Midra (2026-09-22): confirmed in the protocol that its REMOTE snapshot has no live/screens/layers node and no anchorPoint anywhere, so the feedback could only ever report CENTER for a setting the device does not have. Nothing to test.
- [ ] ~~Cut&Fill action/feedback~~ - see Known Gaps above, not yet registered.
- [x] ~~Keying (per Layer)~~ - confirmed not applicable to Midra (2026-09-22): a layer node carries `source, position, size, opacity, effects, color, crop, mask, border, transition, flying, timing, speed, status` and no `keying` at all. **This is only the per-Layer property.** Keying at the *input* does exist on Midra and is a different feature - `inputList/items/{n}/plugList/items/{p}/settings/keying/` with its own `control/pp/mode` plus chroma, luma, cutNFill and assistant branches - covered by "Preconfig - Inputs - Set Input Keying" in section 8, which stays open.

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

- [x] Set Input Plug + its feedback - verified 2026-09-22 on an Eikos 4K simulator. Gained an `IN{n}.activeplug` variable in the same pass, reporting the connector by the name the action's own Plug list uses; registered only for an Input with more than one available plug, which here is Inputs 1 and 2 (HDMI + SDI) while the rest carry a single SDI.
- [x] Inputs - Set Input Keying + Input Keying Status feedback - verified 2026-09-22, both sides. The mode list now matches the platform: CremaTTe3D is Aquilon-only and is gone here, and Cut&Fill works again - it had been blocked outright by a guard testing for Aquilon firmware 4.0.254, which Midra's own numbering can never reach, so only Chroma and Luma ever got through. It is gated per input on `status/keying/cutNFill/pp/isAvailable` instead, live-confirmed true for Inputs 1/3/5/7/9 and false for 2/4/6/8/10: the odd Input carries the Fill and the even one after it automatically becomes the Cut. Note that the neighbouring `status/keying/pp/isAvailable` is useless as a gate - it reads false on every Input, including one actively set to LUMA.
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

## 9a. The four Midra models, and why Eikos is enough

Surveyed in the simulator on 2026-09-22. The models differ only in which preconfig templates they offer, and the Eikos offers all of them:

| Model | Templates | Note |
|---|---|---|
| **Eikos 4K** | Mixer, Matrix, Softedge | the superset - what this list is tested against |
| **Pulse 4K** | Mixer, Matrix | otherwise identical to Eikos; no Softedge mode |
| **QuickMatrix 4K** | Matrix only | two Screens, one live Layer each |
| **QuickVu 4K** | Mixer only | S1 + A1 |

So an Eikos can be put into every configuration any of the others can reach, and verifying here covers all four - no per-model testing pass is needed, and there is nothing to gate per model. Checked while writing this down: the module never reads `templateUsed` or the Softedge/`isCoveringEnabled` flag at all, and the `SOFTEDGE` entries in the code are a test pattern named "Covering", unrelated to the blending mode. The preconfig subscription deliberately matches the whole `CURRENT` subtree rather than named fields, precisely so a model that carries a difference in a field an Eikos does not move still triggers a rebuild.

`maxScreens`/`maxAuxScreens` are 4 on this platform, which is the Eikos's count; a model with fewer simply reports the rest as disabled and they never get variables.

## 9b. Aux screens

Found and fixed 2026-09-22 after the user noticed that Aux screens delivered no usable variables. An Aux on Midra turned out to be a very different object from a Screen, and several pieces of shared code were reading Screen-shaped paths for both. All of it is confirmed against an Eikos 4K simulator; **none of it is confirmed on Alta**, which runs through the same `midra` platform class - re-check each line in the RC3 Alta pass.

- [x] Transition state comes from the Aux's own node. Midra splits `device/transition/screenList` and `device/transition/auxiliaryScreenList`, and the two genuinely disagree (Aux 1 at AT_DOWN while Screen 1 sat at AT_UP), so every Aux variable had been reporting the same-numbered Screen's bank. LivePremier keeps both in one list, so its two constants are the identical array and nothing there changes.
- [x] Background source reads the right property. Midra has three names for it - `source/pp/input` on a numbered layer, `source/pp/set` (a Background Set's bare number) on a Screen background, `source/pp/content` on an Aux background - and the shared reader used one for all three, so both kinds of background reported a permanent "NONE".
- [x] An Aux no longer claims a numbered layer, a Foreground or a memory. Its preset carries `background` and nothing else - no `liveLayerList`, no `top`.
- [x] `A{n}.width`/`.height`/`.aspectratio` come from the output the Aux feeds (no canvas node of its own).
- [x] Screen/Aux labels read the device's own name. A first look found all eight empty and concluded the platform had no naming feature, and a generated "Screen 1"/"Aux 1" fallback was built on that - wrong: the user then named Screen 1 and Aux 1 in WebRCS's canvas settings and both appeared at `control/pp/label`, exactly where the module already reads them. The fallback is gone again; an unnamed Screen reports an empty string here as it does everywhere else. Worth remembering as a method note: an empty field proves nothing about whether the feature exists, the same trap as the Cross Depth flag earlier in this list.
- [x] Enabling/disabling a Screen or Aux in the preconfig updates the variables live (S1+A1 / S1+S2 / S1 with two outputs on an Eikos). The inherited subscription watched `status/pp/mode` on the screen, which Midra does not have, so nothing reacted at all.
- [x] Aux background accepts a Screen's Program (`PROGRAM_{n}`, listed as `S1 PGM`) and a colour.
- [x] `OUT{n}.usedin` reports the Screen or Aux each output feeds. The inherited subscription reads `canvas/status/pp/usedInScreenAux`, which Midra does not have - only a boolean `isUsedInScreen` - so it was empty on every Midra. Built by inverting the preconfig's per-Screen/per-Aux `pp/outputList` arrays, deliberately *not* from the output's own `pp/usedOnScreen`/`usedOnAux`: those are stale defaults, live-confirmed with outputs 3-6 at `mode: DISABLE` still claiming `usedOnScreen: "1"`, and with output 2 feeding Aux 1 in MIXER while reporting `usedOnScreen: "2"`.
- [x] **Resolved 2026-09-22:** Aux Memories are entirely real - `device/preset/auxBank`, 200 slots, saved, recalled, relabelled and deleted live. Recall, save-to-slot and save/revert-changes all work on an Aux. What the Aux genuinely does not report is *which* memory is loaded in a way worth exposing as a variable, which is why only the `A{n}.*.memory.*` read-back variables were dropped - the actions were right to stay.

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
