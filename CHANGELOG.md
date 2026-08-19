# Changelog

## Unreleased (work in progress, 2026-08-20)

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

### Known issues / not yet done

- Dragging some presets onto a Companion page produces an empty button — root cause not yet found; may be related to Companion 5.1's new "linked presets" feature (in beta) rather than our own preset structure. Not yet resolved.
- A handful of fields (`deviceSelectSource`/`selectLayer`'s `screen` field) can't be set via expression themselves because they're referenced by other fields' `isVisibleExpression` (which requires `disableAutoExpression`) — a genuine Companion v2 API trade-off, not yet resolved, needs a systematic decision across all occurrences of this pattern.
- Audio input numbering fix not yet applied to `src/livepremier/choices.ts` (pre-v4-firmware path) or to `getAudioOutputChoices` (outputs) — only confirmed as an input-side issue so far.
- Planned: replace the single "Device Network Address" field with four separate config fields (host, "Simulator?" checkbox for auto port `:3000`, password, "HTTPS?" checkbox with ignored certificate validation), with an upgrade script to auto-migrate existing configs.
- Multiviewer memory recall has no "currently active memory" feedback support — confirmed via live protocol investigation that AWJ doesn't expose this status at all (unlike screen/master presets); flagged as a firmware feature request to Analog Way.
- "Timer Type" field in Timer Adjust, and the Audio Routing `in`/`out` fields, not yet made expression-capable (same `allowInvalidValues` treatment as screen/aux fields).
