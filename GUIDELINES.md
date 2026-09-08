# Guidelines

Recurring principles this module's code should always follow. Unlike CHANGELOG.md/README.md (what changed, when), this file is about what should stay true regardless of when a piece of code was written - the kind of thing that's easy to get right once and then quietly drift away from in the next feature if it isn't written down anywhere.

When building something new, check here first. When a guideline turns out to be wrong or needs an exception, fix the guideline, don't just silently violate it.

## Addressing conventions (short IDs)

Every source/target type has a short, human-typeable id used everywhere user-facing (options, variables, expressions). AWJ's own internal/raw ids are only ever used at the read/write boundary (building the actual device path), never exposed to the user.

| Type | Short id | AWJ internal id | Notes |
|---|---|---|---|
| Live Input | `IN{n}` | `LIVE_n` / `IN_n` | |
| Still Image | `IMG{n}` | `STILL_n` | |
| Physical Output | `OUT{n}` | plain numeric key `{n}` | no prefix at the wire level |
| Screen | `S{n}` | same | |
| Auxscreen | `A{n}` | same | |
| Background Set (native) | `BS{n}` | `NATIVE_n` | |
| Multiviewer | `MVW{n}` | platform-specific | |
| Timer | `TIMER{n}` | `TIMER_n` | |
| Layer (numbered) | `L{n}` (Expression Mode token) / plain `{n}` (option value) | plain numeric | Background Layer is `BG` / `NATIVE` |

`formatSourceShort()` (`src/awjdevice/subscriptions.ts`) is the canonical translator for sources shown in variables. Do not invent a second convention for a new source type - extend this one.

### Bare numbers are only valid when the type is unambiguous

A field whose dropdown can only ever resolve to **one** source type (e.g. an "Input" field that only ever offers Inputs, never Images too) should accept a bare number as well as the prefixed Short id in Expression Mode - `3` alongside `IN3` - since there's no ambiguity about what it refers to. See "LIVE - Input Freeze"/"LIVE - Output Freeze".

This bare-number leniency and concatenated multi-selection (below) are mutually exclusive on the same field: `12` is ambiguous between `1`+`2` and the literal number `12`, so a field that accepts bare numbers cannot also parse a concatenated multi-value expression, and vice versa.

A field whose dropdown can resolve to **more than one** source type (e.g. Inputs and Images together) must never accept a bare number - always require the Short id prefix (`IN3`/`IMG3`), since a bare number would be ambiguous about which type it names.

### Short-id concatenation should work everywhere it makes sense

Wherever a field's value is a type's own Short id, it should also accept a concatenated multi-selection expression with no separator (matching the `S1S2A1`/`L1L2` convention - e.g. `IN1IN2IMG3` for a mixed Input/Image field), wherever selecting several at once is a meaningful use case for that field - not only for Screens/Layers. Treat this as the default expectation for any new multi-capable field rather than something to add later; where it's still missing on an existing field (see the Planned entries), that's a gap to close, not an intentional limitation.

### Raw AWJ protocol ids should also be accepted

Alongside the Short id (and the bare number, where unambiguous), a field should also accept the raw AWJ-internal id it actually translates to/from (e.g. `LIVE_1`/`IN_1` for an Input, `STILL_1` for a Still Image, `NATIVE_1` for a Background Set) - for advanced users who already think in AWJ's own vocabulary and would rather type that directly than look up this module's Short id. "LIVE - Input Freeze"'s `IN1`/`1`/`IN_1` acceptance already does this (originally framed as V2 compatibility, but `IN_1` is simultaneously the literal AWJ id - the same leniency is worth having even where there's no V2 predecessor to justify it). Extend this to every Short-id-accepting field going forward, not just ones that happen to have a V2 history.

## Multi-target Screen/Auxscreen fields

A single `dropdown` option (never Companion's native multi-select `multidropdown`, and never a fixed set of per-screen fields toggled via `isVisibleExpression`), with `allowInvalidValues: true` and choices in this order:

```
[{ id: 'first', label: 'First/Only Selected Screen' },
 { id: 'all',   label: 'All Screens' },
 { id: 'sel',   label: 'Selected Screens' },
 ...choices.getScreenAuxChoices()]
```

(Drop `first` if the feature has no meaningful "just the first one" reading; drop `all`/`sel` individually if genuinely inapplicable - but don't invent new keywords for the same concepts.)

Resolve with `choices.getChosenScreenAuxes(value)` (handles `all`/`sel` and - critically - also accepts a **concatenated multi-id Expression Mode string with no separator**, e.g. `'S1S2A1'`, via `expandScreenAuxTokens()`). `'first'` needs its own one-line special case (`getSelectedScreens().slice(0, 1)`) since `getChosenScreenAuxes()` doesn't know it.

If the feature genuinely cannot support Auxscreens (confirmed live, not assumed), use `choices.getScreenChoices()`/`getScreensArray()` instead of the Aux-inclusive variants - and filter out any Aux id that still reaches the resolver via a raw Expression Mode value, rather than erroring.

## Multi-target Layer fields

Same shape as Screens, one level down - `first`/`all`/`sel`/individual Layer number, and a concatenated Expression Mode string like `'L1L2'` via `choices.getChosenLayers()`, existence-guarded per Screen via `getLayersAsArray()`/`normalizeLayerId()` before anything is sent (see "Never write to a target that doesn't currently exist" below).

Every "Layer Properties" action now uses this shape consistently (rollout completed 2026-09-08). Feedbacks in that family are multi-Layer too (Layer Source, Cut&Fill Source) with one exception: "Property Status" is still single-Screen/single-Layer only - a deliberate gap, not an oversight (see CHANGELOG).

## Preset (Program/Preview) fields

Use `choices.choicesPreset` (`[{id:'prw', label:'Preview'}, {id:'pgm', label:'Program'}]` - Preview listed first) as the base, with whichever combinator the feature needs appended/prefixed as appropriate:
- `{ id: 'sel', label: 'Selected Preset' }` (goes *before* `choicesPreset`) when "whatever's currently being edited in WebRCS" is a meaningful option
- On an **action** (something that can apply to both banks in one call without ambiguity): `{ id: 'all', label: 'Both (Preview/Program)' }` (goes *after* `choicesPreset`)
- On a **feedback** (a read that must resolve to a single true/false): two separate choices instead of one, since "Both" is ambiguous for a read - `{ id: 'both_and', label: 'Both (Preview AND Program)' }` (true only if it matches on both) and `{ id: 'both_or', label: 'Both (Preview OR Program)' }` (true if it matches on either) - both go *after* `choicesPreset`. Pick AND when the natural reading is "is this consistently true regardless of which bank is live" (e.g. Property Status, Layer/Cut&Fill Source); pick OR when the natural reading is "is this true anywhere" (e.g. a tally light - see "LIVE - Source Tally"). Don't default to just one of the two - offer both and let the button author choose.

Resolve `'sel'` via `choices.getPresetSelection('sel')`; resolve a screen-specific bank letter via `choices.getPreset(screen, preset)` - never re-derive the T-Bar `AT_UP`/`AT_DOWN` + `presetUp`/`presetDown` logic by hand in a new feature, reuse these. `'all'`/`'both_and'`/`'both_or'` are never valid input to `getPreset()`/`isLocked()` - expand to an explicit `['pgm', 'prw']` list first. An action's callback restructures into a per-(target, Preset) write loop (with per-(Screen, Preset) lock/unlock/relock tracking, since a Screen can be locked on one bank and not the other); a feedback's callback runs its single-preset check once per bank and combines the two results with `&&`/`||` as appropriate.

## Stay expression/variable-capable

Prefer flat, always-visible option lists over dynamic per-target fields shown/hidden via `isVisibleExpression`. Companion requires `disableAutoExpression: true` on both the controlling field and every field that depends on it for `isVisibleExpression` to work at all - and that flag strips expression/variable capability from those fields. A field a user might reasonably want to drive from a variable (to build a dynamic Stream Deck page, etc.) must never lose that capability just to gain conditional visibility. When in doubt, ask whether the dynamic-visibility convenience is worth the expression capability it costs - it usually isn't.

## Variable registration scope

Only register a variable for an entity that is actually available on the connected device right now (`isAvailable`-style check), never for the platform's full theoretical range (e.g. 256 possible inputs) - that is what caused a real 1486-variable spike in an earlier audit.

Before adding a per-combination variable set (Screen × Layer × something, Output × something), check whether the combinatorial space is actually bounded and useful. If it isn't (e.g. up to 24 Screens × many Layers × Preset direction for Layer Freeze), don't create the variables - rely on a feedback instead. Every "Layer Properties" family member already follows this (feedback-only, no per-layer status variable); match it rather than reintroducing variables for a new property.

## Never write to a target that doesn't currently exist

AWJ does not reject a write to an out-of-range index (a Layer number beyond a Screen's current `layerCount`, and likely other similarly-sized lists) - it silently accepts it. That value can persist invisibly and resurface as already-set the moment the target range grows to include it (live-confirmed for Layer Freeze, 2026-09-08: freezing a nonexistent Layer 22 risked it showing up already frozen if the Screen was later reconfigured to have 22+ Layers).

Any action that resolves a target from a raw number, a dropdown value, or a concatenated Expression Mode string (not from a live "what currently exists" list like `getScreenOutputArray()`/`getLayersAsArray()`) must filter the resolved target(s) against the real, currently-configured set before sending anything - per-Screen where the valid range can differ by Screen (Layer counts), not just once globally. Silently drop anything that doesn't currently exist rather than sending it or raising an error - the same "doesn't exist right now" case a keyword like `all` already resolves to nothing for.

## V2/V3 variable naming

New variables use the V3 scheme (`Object{n}.property`, e.g. `IN{n}.status`). Only add the `useOldVariableNames`-gated V2-compatible alias (via the `varName()` helper) when a real V2 predecessor of that exact variable existed and worked - not for a variable that's genuinely new in V3, even if it conceptually resembles something from V2 (see the Input Freeze variable-registration fix, 2026-09-08, which dropped V2 compatibility for exactly this reason: the V2 version had a different bug profile and was never actually usable during any V3 beta).

## Composite/derived feedback subscription wiring

A feedback whose result is computed from data another subscription already tracks must have its own id added to that subscription's `fbk` list too - not just a correct `callback`. Without this it only ever evaluates once (button creation/connect) and looks "stuck", not simply wrong; a full rewrite of the callback logic will not fix it. See `layerFreezeV3`/`outputFreeze` for the pattern, and the incident this was learned from (`deviceScreenFreezeOutputs`, 2026-09-08).

This applies to *every* piece of state a feedback's `callback` reads, not just the "obvious" one its name suggests. `deviceLayerFreezeV3` reads two independent things - the freeze array itself (`layerFreezeV3` subscription) *and* which physical bank currently means "Program"/"Preview" (`screenAuxGroupList/.../status/pp/transition`, tracked by the `screenPreset` subscription) - a Take changes the second without touching the first, so the feedback's true result flips with no trigger unless *both* subscriptions list its id. When building a feedback, list every state source its callback actually reads and check each one has this feedback wired into its `fbk` list, not just the most obviously-related one.

## Every action needs a matching feedback

If a value can be set, there should be a way to read it back. When adding a new action, check whether its counterpart feedback already exists; if not, build it alongside rather than leaving a gap for a later audit to find.

## Toggle mode semantics must be an explicit decision, not a default

"Toggle" never has one universally-correct meaning once more than one target can be affected by a single button press. Decide per feature, and say so in the description/comment:
- **Independent per-target** (each target's own current state decides its own new state) - e.g. Layer Properties flag toggles, Layer Freeze's Program/Preview (explicitly independent of each other).
- **Shared/collective decision** (one decision computed once, applied to every target) - e.g. "LIVE - Screen Freeze": if any targeted Output is frozen, Toggle unfreezes all of them; only if none are frozen does it freeze them all - chosen specifically because independent-per-output toggling could leave a Screen only partially frozen after one press.

Neither is "more correct" in general - pick whichever matches what a single button press should feel like for that specific feature, and don't assume the other Toggle-affected feature nearby set the precedent.

## Live testing overrides documentation

Analog Way's own release notes are the starting point for firmware gates and behavior, but a live-confirmed discrepancy against a real device always wins (see the Backup firmware threshold: docs said 5.0.128, live testing on real 5.0.128 hardware showed the feature didn't actually work until 6.0.4). Note the live-confirmed date and device when overriding documentation, so a future contributor can tell it wasn't a guess.

## Firmware gates are precise, not major-version-only

`isFirmwareAtLeast()` compares the full dotted version string. A gate written as "V6+" when the real threshold is "5.0.128" hides a feature from users on perfectly capable firmware.

## Action/Feedback/Preset ordering (sortName and category)

Companion's action and feedback definitions have no native `category` field - only `sortName`, a single flat string Companion sorts the whole picker list by. This module fakes grouping by giving every `sortName` a two-digit numeric prefix shared by everything in that group, so the group's items sort together and the groups themselves sort in prefix order:

```
01 LIVE -
02 Multiviewer -
03 Layer Properties -
04 Timers -
05 Audio -
06 Preconfig -
07 Device -
08 Backups -
09 Custom Commands - (actions) / 09 Custom Feedback (feedbacks)
10 Deprecated from V2 -
```

Within a group, a second number continues the same pattern where the sub-items need a specific order rather than alphabetical (e.g. `03 Layer Properties - 04 Keying`, `01 LIVE - 08 Set Transition Time`) - omit it where alphabetical-by-suffix is fine as-is. Freeze (action and feedback) is **not** its own top-level group - it's `01 LIVE - <n> Freeze - <Input/Layer/Screen/Output>`, appended after the rest of that group's own items (Freeze is conceptually a LIVE control, not a separate category). A few sortNames are built from a template shared across platforms/variants (`` `07 ${name}` ``, `` `07 Device - 03 ${name}` `` etc., in `deviceTestpatterns_common`/`deviceTestpatternRasterBox_common`/`deviceTestpatternActive_common`/`deviceTestpatternRasterBoxActive_common`) - when renumbering a group, grep for these too, not just the plain-quoted `sortName: 'NN ...'` literals, since a plain-string search misses them.

When adding a new action/feedback, put it in the existing group its name's own prefix already implies (an action named `'Preconfig - ...'` belongs in the `06 Preconfig -` group, not wherever seemed convenient) - don't invent a new top-level number without a good reason, and if you do, renumber every group after it to keep the sequence contiguous (gaps aren't harmful to Companion, but they make the scheme harder to read/extend).

**Presets** are different - `CompanionPresetDefinitions` entries do have a native, free-text `category` field, sorted alphabetically by Companion itself, so no numeric-prefix trick is needed or used there. Existing category names follow a plain `"Group - Specific description"` shape (e.g. `'Layers - Assign Source to selected Layer'`, `'Screens - Lock Screens'`) - match the existing group name if extending one, don't invent a near-duplicate (`'Layer' `vs `'Layers -'`, etc.).
