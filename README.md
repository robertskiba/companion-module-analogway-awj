# What's New Since V2 (Short overview)

Please look into the changelog files for a more precise overview!

This module has been substantially rebuilt since V2. Here's what that means for you as an operator - no code, no protocol details, just what you can now do and what to watch out for. For the full technical version, see `Changelog_From_V2.md`.

## The big picture

- You can now use **Companion expressions and local variables** in almost every dropdown field, not just text fields. That means you can build one templated button ("Recall Screen Memory $(local:memory)") and reuse it across many buttons instead of building each one by hand. Companion's new page variables will work here too, once Companion 5.10 itself is out of beta.
- Screen, Layer, and Preset (Program/Preview) selection is more consistent across the whole module: most fields now offer "First/Only Selected", "All Selected", or a specific item, and you can type a combination like `S1S2` to target several at once via Expression Mode.
- Your **old button configurations keep working**. Variable names, for example, can stay on the old scheme via a "Use old (V2) variable names" setting that's automatically turned on for anything you already had set up.

## Layer control got a lot more complete

Nearly every property panel you'd otherwise set by hand in WebRCS now has a matching Companion action *and* a "Learn" button that reads the current live values straight into the action, so you can capture a look you like and reapply it elsewhere:

- Position & Size, Transitions, Keying, Opacity, Aspect & Crop, Mask, Border, Effects, Speed, Timing, Cut&Fill, Anchor Point, and "Reset to Source Ratio/Content Size/Fullscreen".
- Every one of these can now target multiple Layers at once (`L1L2`) and apply to Program, Preview, or **both at the same time** in one button press.
- New rotary-encoder-friendly "Encoder Adjust" actions - turn a dial and nudge Opacity/Position/Size/Crop up or down, no manual math.
- New status feedbacks so you can see at a glance what's currently set (one combined "Property Status" feedback covers most on/off properties; dedicated feedbacks show the actual Source and Cut&Fill Source values).

## Freeze, now a full family

Freeze used to be limited. Now there's a matching action *and* feedback for freezing an Input, an Output, a whole Screen, or a single Layer's Program/Preview content independently - each with sensible "Toggle" behavior when several targets are involved (if any one is frozen, one press unfreezes everyone, rather than fighting itself).

## New things you couldn't do before

- **Save/update a Screen Memory directly from Companion** - save the current on-air look back into the memory that's loaded, or save it into any slot - including a free one, picked automatically with "Next Available" - rename a slot, or delete one. A new `SM.nextavailable` variable shows which slot number that would be, so you can check or display it before saving.
- **Background Set control** - assign what a Background Set shows, and check what it's currently showing.
- **Input Keying mode switching** - flip an Input between Chroma Key, Luma Key, the external **CremaTTe3D** keyer, and (on firmware 4.0.254+) **Cut&Fill**, all from a button. (You still set the actual key parameters - color, threshold - in WebRCS itself.)
- **Live thumbnail previews on buttons** - see a live image of an Input, Output, or Image Store item right on the button, with an adjustable refresh rate. There's a config-wide off switch if this is too much load for your setup.
- **Backups** now also cover Background Sets, not just Inputs, with live status feedback.
- **Dante audio functions** - reboot, factory reset, or bulk-rename Dante channels (note: renaming channels currently doesn't take effect on the device yet, even though everything else works).
- **Health/status monitoring** - feedbacks for device temperature/fan alarms, input/layer signal presence, and general connection health, plus variables like `Device.Model`, `Device.FirmwareVersion` for building your own condition logic.
- **Failover to a Hot Backup device** - configure a standby device that quietly mirrors your show in the background, then hit one confirmed button to swap over to it if the main device fails live; the same button swaps you back afterwards. Once this has been fully tested across all supported device types, it gives you a level of live-show redundancy that nothing else in the event industry offers out of the box. A PreFlight Checklist explaining how to set this up and rehearse it properly will be published alongside the final release.

## Naming clean-up (mostly cosmetic)

- Actions are grouped consistently in the picker: `LIVE -`, `Layer Properties -`, `Preconfig -`, `Device -`, `Backups -`, and so on, so related things sit together instead of being scattered alphabetically.
- "Preset" now says "Preset (Program/Preview)" wherever that's what it means, to avoid confusion with a saved memory preset.
- The Preview/Program dropdown order is now consistent everywhere (Preview first), and "Both" options are more clearly worded - some feedbacks now offer both a "Both (AND)" and a "Both (OR)" version, since "is it true on both sides" and "is it true on either side" are genuinely different questions (useful for a tally light, for example).
- A few defaults changed from "whichever side happens to be active" to explicit "Preview", which is safer for most workflows - check your existing buttons if you relied on the old default behavior.

## Reliability improvements you'll just notice

- The connection no longer gets stuck showing "connected" when it secretly isn't (e.g. after your Companion PC wakes from sleep) - it now detects that and reconnects automatically.
- Reconnect attempts show a live countdown instead of unpredictable waits.
- Button sequences like "Recall memory, then Take" are now reliable even without manual Wait actions in between.
- Logging in to a password-protected device no longer risks crashing the whole module.

## A few things to double-check on your existing shows

- If you use `STILL{n}.label`, it's now `IMG{n}.label`.
- The module no longer supports LivePremier/Aquilon devices on firmware older than V4. If you're still on such a device, you'll need to update its firmware (V6+ recommended) or stay on an older module release.
- You'll currently see "(Aquilon)" or "(Midra/Alta)" after some action/feedback names in the picker - a temporary testing label showing which platform each one has been verified on. It'll be removed once testing is complete.
