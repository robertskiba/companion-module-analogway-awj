# Analog Way AWJ – RC3 – What's New for Operators

This is a plain-language summary for people programming and running shows with this module – no technical details, just what changed and what to do about it. There was no public RC2, so this covers everything since RC1.

## New things you can put on a button

- **"LIVE - Screen Active"** – a button that lights up while a Screen or Aux is switched on in the preconfig. It also lists the screens that are currently off, so you can just as well light a button when S3 is off. Handy as a condition in Triggers.
- **Saving memories on Alta 4K / Midra 4K** – "Save Screen/Aux Memory to Slot" (save, rename, delete) and "Save/Revert Screen Memory Changes" now work on these series too, for Screens and Auxes. No more reaching for WebRCS just to save.
- **Hot Backup can switch your router too** – in the connection settings you can enter a Companion button that is pressed automatically on every failover, e.g. to switch a crossbar at the same moment. The module keeps track of which direction is next.
- **Alta 4K / Midra 4K Aux background** – can now show a Screen's Program output or a plain colour.
- **New variables:**
  - `S1.active` – exists (and reads `true`) while that screen is switched on.
  - `S1.pgm.layer1.source` / `S1.prw.layer1.source` – what a layer shows on Program and what is lined up on Preview. Also `.status`, `.width`, `.height`, `.x`, `.y`, and the background as `S1.pgm.layerbg.source`.
  - `IN1.activeplug` (Alta/Midra) – which connector an input is using, e.g. HDMI or SDI.
  - `Device.GlobalAnchorPoint` (LivePremier) – the anchor point currently selected in WebRCS.

## Please double-check these on your existing buttons

- **Layer variables built during RC1** – `S1.layer1.source` and friends are now `S1.pgm.layer1.source` (Program) and `S1.prw.layer1.source` (Preview). Update button texts and expressions that use the old names.
- **Source Tally variable** – the variable behind "LIVE - Source Tally" has a new name, e.g. `S1.pgm.tally.IN1` instead of `tally_S1_pgm_LIVE_1`. If you show it in button text, update it. Connections set to "Use old (V2) variable names" keep the old name.
- **Alta 4K / Midra 4K: "Layer Properties - Source"** – now has one Source field for everything (layer, background, foreground, Aux). Open buttons you built with this action in RC1 once and check the source.
- **Alta 4K / Midra 4K: options that don't exist on these devices are gone** – the Speed "Linear" switch, Strobe, CremaTTe3D keying and the "Global Anchor Point" feedback. Buttons that used them never did anything on these devices; you can remove them.
- **"Deprecated from V2 - Recall Layer Memory"** – is exactly as in V2 again. The "Unlock if locked" option it briefly had is gone; use the V3 "LIVE - Recall Layer Memory" if you need it.

## Good to know

- **Switched-off screens no longer get stuck in the selection.** If you disable a screen in the preconfig while it is selected, the module now deselects it on the device automatically (with Sync Selection on). Before, it stayed selected invisibly and "First/Only Selected Screen" did nothing.
- **Encoders stop at the limit.** Turning past 100% gives 100%, turning below 0% gives 0% – nothing is skipped and nothing jumps.
- **The T-Bar encoder behaves like a real lever.** "+" moves it up, "-" moves it down, and at either end it simply stops – turning too far no longer starts another transition.
- **Buttons from V2 open cleanly.** Values that were renamed in V3 (e.g. Preview) are converted automatically, so fields no longer show as invalid.

## Fixed since RC1 (you don't need to do anything, just good to know)

- "First/Only Selected Screen" did nothing on Take, Cut and other actions when a switched-off screen was still in the selection.
- With Sync Selection off, "Screen Selection" and "Layer Selection" didn't remember anything, so every "Selected" option did nothing.
- A Take on several screens could stop completely because of one screen – now that screen is skipped and the others are taken.
- The Program/Preview layer variables were swapped whenever the T-Bar rested at the bottom (LivePremier).
- Memory numbers typed as `SM5` (instead of `5`) in expressions were ignored.
- "Screen Memory – is Modified" showed the opposite on Aquilon.
- "Reset Size or Ratio" was missing its "Unlock if locked" option.
- A crop or mask at 90% couldn't be pushed all the way to 100%.
- Connecting to a large device was very slow.
- **Alta 4K / Midra 4K:**
  - Background colour had no effect.
  - Masks came out half size on 4K screens.
  - The T-Bar encoder cut on every press.
  - The Cross Effect / Cross Depth toggles did nothing.
  - Layer Timing did nothing.
  - Several variables stayed empty or frozen: input freeze, layer sources, T-Bar position, transition time, Aux screens, `OUT1.usedin`.
  - Changing the Screen/Aux setup in the preconfig now updates everything live, without reconnecting.
  - Alta (Zenith) is shown as its own series and no longer gets Midra firmware advice.

## Not yet on Alta 4K / Midra 4K

These work on LivePremier/Aquilon but are not available on Alta/Midra yet: Output Freeze, the newer Screen/Layer Freeze actions, and the Cut&Fill layer actions.
