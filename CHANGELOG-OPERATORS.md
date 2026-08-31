# Analog Way AWJ – Beta 5 – What's New for Operators

This is a plain-language summary of Beta 5 for people programming and running shows with this module – no technical details, just what changed and what to do about it.

## New things you can put on a button

- **Backup status feedbacks** – see at a glance whether a Backup Set is currently running on Primary, Backup 1, or Backup 2, and whether Auto Mode is on. Works for both Input backups and Background Set backups.
- **Audio Routing status feedbacks** – a button that lights up when the audio routing you expect is actually in effect (single channels, or a whole block). Now available on LivePremier, LivePremier4, and Midra – previously only LivePremier4.
- **Input Signal Present** / **Layer Signal Present** – instantly see which inputs have a real incoming signal, or which layers are currently showing a source with no signal.
- **Device Health Alarm** – a button that turns red if the device has a temperature or fan warning.
- **Screen Memory Slot Occupied** – see which memory slots are empty and which are already used, before you save over one by accident.
- **Layer Properties – Property Status** – one flexible feedback covering almost every on/off layer setting (Border, Effects/Filters, Keying, Mask, Aspect Override, Transition options) – just pick which property to watch from a dropdown.
- **Midra only**: Input Plug Status, Stream Audio Mute Status.
- **New action: "Audio - Dante Functions"** – Reboot, Factory Reset, or bulk-rename Dante channels from one action. A safety checkbox must be ticked or nothing happens at all, not even Reboot.

## Please double-check these on your existing buttons

- **"Live Thumbnail" feedback** – if you already use this on a button, open it once and re-pick the source. The way you choose what to show (Input/Output/Image/Timer) changed from a two-step picker to one dropdown, so existing buttons may show a blank/wrong source until you re-select it.
- **"Audio - Route (Block)"** – Block Size is now capped at 8, and a block can no longer spill into the next output module even if you had a larger value configured before. If you were using a bigger block, split it into two actions.

## Known issue – please don't rely on this yet

- **Dante channel renaming** (inside the new "Audio - Dante Functions" action) does not currently work, even though it looks and behaves like it should. Reboot and Factory Reset in the same action work correctly. We're aware of this and are looking into it with Analog Way – for now, rename Dante channels the usual way (WebRCS/Dante Controller).

## Fixed since Beta 4 (you don't need to do anything, just good to know)

- The module could keep showing "Connected" after your computer woke up from sleep, even though the connection was actually dead. It now notices and reconnects on its own.
- "Active Backup Source" feedback/variable sometimes showed the wrong source after a manual switch – fixed, and a real automatic failover now shows up immediately too.
- A couple of the newer feedbacks (Backup status, Audio Routing status) weren't updating live on their own – fixed, they now react immediately.
- Midra's "Screen Freeze Status" showed wrong information for Auxscreens.
- "Screen Lock" feedback was missing its color styling (only showed a small icon).
- "Audio Source Tally" could incorrectly light up for "No Source".
