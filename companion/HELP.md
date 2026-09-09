# Analog Way AWJ

This module was originally developed by Dorian Meid until 2023. After it appeared to sit unmaintained for almost three years, Robert Skiba took it on to bring it into the modern Companion environment and add many features people had long been waiting for.

**Most important:**  
**[Beware of selection synchronization!](#sync)**  
**There are many presets but many more actions and feedbacks, presets are a good starting point though.**

TOC:  
[Configuration](#configuration)  
[About Variables (old vs. new names)](#variables)  
[Selection, Locking & Presets](#topic-selection)  
[Memories](#topic-memories)  
[Live Transitions](#topic-transitions)  
[Layer Properties](#topic-layerprops)  
[Freeze](#topic-freeze)  
[Multiviewer](#topic-multiviewer)  
[Preconfig](#topic-preconfig)  
[Audio](#topic-audio)  
[Streaming](#topic-streaming)  
[Timers](#topic-timers)  
[Testpatterns](#topic-testpatterns)  
[GPIO](#topic-gpio)  
[Device, Backups & Hot Backup](#topic-device)  
[Custom Commands & Feedback](#topic-custom)  
[Presets](#presets)  
[Deprecated Actions (from V2)](#deprecated)  

This module works with all Analog Way devices that support the AWJ protocol - currently the LivePremier, Alta 4K, and Midra 4K series. Although all these devices share the same protocol, they have quite different capabilities and workflows. This module tries to hide as much of that difference as possible and stay as generic as it can.

All available features are retrieved live from the device, and only what's actually available is shown to you in dropdowns and so on - e.g. you'll only see the inputs your specific device actually has built in, or presets only for memories that currently hold data.
- **While connected**, dropdowns only ever show what your specific device actually has.
- **While not connected**, dropdowns instead show the full theoretical maximum range for that device family (e.g. every possible Screen/Input/Layer/Memory/Timer/Output number), so you can pre-program a whole show offline without needing a simulator. Once you connect to a real device, any selection that doesn't exist on it simply does nothing - exactly like moving a show between devices with different capabilities (see below). If you'd rather build against a real device's exact selection list from the start instead, Analog Way's simulators remain available for free from [https://analogway.com](https://analogway.com).

If you've programmed a show for one device and later switch to a different one, everything you've programmed stays in place in your actions and feedbacks - but of course anything your new device doesn't support simply won't work. For example, an action programmed for Aux 6 on a LivePremier won't do anything on a Midra 4K, and an input plug selection programmed on Midra won't do anything on a LivePremier. Most actions and feedbacks, though, behave identically across every device - transitioning Screen 2, for instance, works the same way on any device that has Screen 2 active.

Alta 4K and Midra 4K share the exact same feature set and behaviour in this module - wherever "Midra 4K" is mentioned, it applies equally to Alta 4K, and the two are never distinguished from each other.

Not every option of every action or feedback is explained in this manual, most of them are self-explanatory. Here you find only general hints and explanations of options that have differences from Analog Way's WebRCS.  
Because of space restrictions on our small Stream Deck buttons, some things are abbreviated on the buttons:
- Master Memory: MM
- Screen Memory: SM
- Layer Memory: LM
- Aux Memory: AM
- Multiviewer Memory: MV
- Multiviewer (the device/output itself, not a memory): MVW
- Screen 1...x: S1 ... Sx
- Aux 1...x: A1 ... Ax
- Program: PGM
- Preview: PRW (matching WebRCS). The historical values PVW and PRV are still accepted everywhere for backward compatibility and as typo-tolerant aliases (e.g. in expressions), but PRW is what you'll see shown in dropdowns.

**Another general piece of advice: a round trip to the device is fast, but not instant.** After you change a parameter, it takes a few milliseconds for it to reach the device, be applied, and have its confirmation travel back and update Companion's own copy of the value.

That delay doesn't matter for a parameter you simply set to a fixed value. It does matter for anything that first *reads* the current state and then acts on it:
- **Toggle actions** read the current state, flip it, send the result, and only actually finish once that new value's confirmation has come back. If you trigger the same toggle again before that confirmation arrives, it still acts on the *original* state, since the toggled value hasn't been received yet.
- **Rapid incrementing/decrementing**, e.g. with a rotary encoder, hits the same problem - a tick can still be computed from the same not-yet-updated value if ticks arrive faster than the round trip.

You can work around either case by slowing down your input frequency, or by not reading the value from the device at all and using a custom variable instead: increment/decrement that variable locally and send its value to the device. The local increment itself is then instant and never races, but you lose two-way sync doing this - if the parameter changes outside of Companion, the variable won't follow.

**Where this no longer applies:** actions that recall a memory, or Take/Cut/change a Transition Time, now queue internally per target screen - a second press on the same screen waits for the first to actually finish instead of racing it. Plain toggle actions (Freeze, Preset Toggle, Stream Control, GPO, ...) and the dedicated Encoder Adjust actions have no such queue, so the behavior described above still applies to those.

## <a name="configuration"></a>Configuration

### Device Network Address

Here you enter the address of the device like you would enter it in the browser if you want to connect to WebRCS.  
You can use an IP address, an IPv6 address or a hostname. For a hostname you need working DNS resolution of course.  
You also can use http:// and https:// but self-signed certificates are considered insecure, so https will only work with a valid certificate (adding a custom CA certificate to your system won't circumvent this).  
If you need to use custom ports, you can add it to the URL with a colon. This module uses the same connection parameters as WebRCS, in WebRCS you will see Companion as another WebRCS client.  
If you are using authentication on your device, you have to add the credentials to the URL like http://username:password@192.168.2.140 The username is always 'admin' and the password is whatever you have chosen. Please note, that authentication adds security on a very low level. Your password will be stored and transmitted in clear text. Everyone who has access to the module configuration can see the password, so you shouldn't use a shared password and you should password-protect access to the Companion GUI as well.  
On a freshly-added connection this field starts out empty on purpose - a failed connection attempt then automatically scans your local network(s) for anything that looks like an AWJ device (real or simulated) and offers the results in a "Found AWJ Devices" dropdown that appears right above this field, so you can just pick one instead of typing an address by hand.

### Connect via Secure HTTP/HTTPS?

Check this to connect via https:// instead of http://. The address above is then automatically switched to https:// and its port corrected to 443.

### Simulated Device?

Check this if the Device Network Address above points to an Analog Way simulator rather than a real device - the port is then corrected to the simulator's plain-HTTP default (3000) instead of a real device's. This also keeps itself in sync automatically: it switches on by itself once a live check confirms the connected device actually is a simulator (e.g. after picking one from "Found AWJ Devices"), and off again for a real device.

### Device MAC Address

The MAC Address of the device as six double-digit hexadecimal values with a delimiter like : or . or - (e.g. `1b:3f:ee:43:2a:b9`).  
You only have to fill in this value yourself if you want to turn on a freshly connected device by wake on lan. If you connect with an already turned-on device, the MAC address will be filled automatically, so you can always turn on the last connected device. On a linked system, every additional linked device (2-4) gets its own MAC address filled in the same way once detected, and "Device Power" wakes all of them at once.

### Turn sync selection on after connection established

If you check this box, the selection synchronization will be automatically turned on after the connection is established. See the action ['Sync selection'](#sync) to learn what that means.

### Show also disabled inputs in dropdowns  

If you disable an input, it won't be included in dropdowns where inputs are shown. If you check this box also disabled inputs are shown and can be used.

### Show also not existing inputs, outputs and image slots in dropdowns

Meant for pre-programming: lists every input/output/image slot up to the theoretical maximum this device family could ever have, regardless of how many the currently connected device actually has, so you can prepare buttons ahead of connecting a bigger or differently equipped device.

### Use old (V2) variable names

Companion's variables were renamed to a clearer, consistent scheme (e.g. `SM1.label` instead of `screenMemory1label`) when this module was rebuilt. Existing connections that already reference the old names in button texts or triggers are automatically switched to keep using them, so nothing breaks on update; a brand new connection starts with this off (using the new names). See [About Variables](#variables) for the full picture of old vs. new names.

### Allow Live Thumbnails

Enables the "Show Thumbnail" feedback (see [Device, Backups & Hot Backup](#topic-device)) to actually poll the device for live preview images. Turn this off to instantly stop all thumbnail polling - e.g. on lower-power Companion hardware, or if many thumbnails are causing too much load - without having to remove every "Show Thumbnail" feedback one by one.

### Colors

Here you can define your preferred default colors, which are used in feedbacks and presets. Remember that these are only default colors, if you drag a preset to a button, that color will be stored at the button and won't change later.

### Enable Hot Backup Device

Available at: LivePremier  
Mirrors a curated set of "safe" recall/transition commands (Recall Screen/Master/Aux/Multiviewer Memory, Take/Cut, Preset selection) to a second device as they're sent to your main one - a one-way mirror, its responses are simply ignored. You are responsible for keeping both devices' saved memory content identical yourself (e.g. save a backup on the main device and load it onto this one before a show) - only the act of recalling/selecting is mirrored, never what a memory slot actually contains.  
Once enabled, you also get a "Hot Backup Device Address" field to enter its address (plain manual entry, no auto-scan/port-correction/simulator-detection like the main address gets), plus an "Enable Automatic Failover" checkbox and its "Automatic Failover Timeout" - both currently just prepared for a future release and have no monitoring/triggering behind them yet; use the "Device - Failover to Hot Backup" action (see [Device, Backups & Hot Backup](#topic-device)) to manually swap the two devices' roles at any time.

## <a name="variables"></a>About Variables

This module dynamically provides a lot of variables, the exact number depends on your device and programming but will usually be in the hundreds. So most of the variables are not promoted in the variables overview but you can use them on buttons anyway. Many presets are making use of variables for dynamic button text. If you want your variables and button texts relying on variables to continue working, you can't rename the label of your connection once you start using presets or you have to modify all variable usages by hand.  
An example: the preset for recalling screen memory 1 contains a variable with the name of screen memory 1. If you use the preset and change the name of the memory later, the new name will be reflected on the button. The variable with the name is provided by the connection. If you change the label of the connection the button can't get the correct variable value any more because it still listens to a variable from a connection with the old label.

Variable names were reworked into a clearer, consistent scheme (e.g. `SM1.label` instead of `screenMemory1label`, `IN1.freeze` instead of `frozen_IN1`). A brand new connection uses the new names by default; a connection that already existed before this change keeps using the old names automatically (matching whatever your buttons/triggers already reference), unless you change the "Use old (V2) variable names" checkbox in the configuration yourself. Every variable table below the following sections lists the **new** names; where a variable's old name isn't simply a different spelling of the same thing (e.g. it used a different value format), that's called out explicitly. In the following tables often there are variables with a 1, usually the ...1 is only an example and variables for all items are available.

One thing worth knowing: **tally variables aren't generated for every possible combination up front.** They only appear once you actually place a matching "Source Tally" feedback on a button - at that point the variable is added and can also be used in triggers. Want a variable for source LIVE_3 on screen S2 preview? Add a Source Tally feedback checking exactly that first.

## <a name="topic-selection"></a>Selection, Locking & Presets

### Screen Selection

Available at: LivePremier, Alta 4K, Midra 4K  
Straight to the interesting part: what are the so-called **intelligent selection** options?

There's an intelligent press option and an intelligent release option, meant to be used together on one button for the same screen - one in the button's press actions, the other in its release actions. To set this up for Screen S1:
1. Put "Screen Selection" for S1 with the **Intelligent PRESS** option in that button's press actions.
2. Put "Screen Selection" for S1 with the **Intelligent RELEASE** option in the *same* button's release actions.
3. Repeat for every other screen on its own button.

**What you get:** pressing just one of these buttons selects that screen exclusively and deselects all others - the same as "Select exclusive". But if you press one and hold it down, you can toggle other screens while still holding the first one down. The functionality mimics the selection process of the old Encore controllers (sending some props to Folsom :-* ).

A few things to keep in mind:
- Setting this up correctly matters - one mistake in the actions or options and the logic won't behave as expected.
- The logic relies on releases just as much as presses. With an emulator, web buttons, or an API, a release is more likely to get missed than with a real physical button - and a missed release locks the logic up. It self-heals after 30 seconds regardless, so a stuck state never lasts long even if you forget about it - or press and release every selection button once by hand, or use the **Reset** option to clear it immediately (this makes no selection changes of its own).
- This logic doesn't work when run from triggers - an intelligent press run from a trigger just does an exclusive selection instead.
- Don't mix buttons using intelligent selection with other selection methods in the same setup. You *can* mix them, but you'll likely just confuse yourself about what's currently selected.

If you want a custom selection (a.k.a. a group) instead, just use this action multiple times on one button: select the first screen exclusively, then add each additional screen with "Select".

**Feedback: Screen Selection** - Available at: LivePremier, Alta 4K, Midra 4K. If selection synchronization is off you will see the selection status of Companion's own selection, if it's on you will see the selection status of the device. To work with the same selection on Companion and WebRCS, turn on selection synchronization on both clients.

### Lock Screen

Available at: LivePremier, Alta 4K, Midra 4K  
If you choose all screens as the target and toggle as the action while some screens are locked and some are not, the action behaves exactly like the general lock button in WebRCS. A partial lock will be toggled to a full lock.

**Feedback: Screen Lock** - Available at: LivePremier, Alta 4K, Midra 4K. Same sync-dependent behavior as "Screen Selection" above - Companion's own lock status while sync is off, the device's while it's on.

### Select Preset

Available at: LivePremier, Alta 4K, Midra 4K  
Don't mistake this for a memory, here you can select either Program or Preview.

**Feedback: Preset Selection** - Available at: LivePremier, Alta 4K, Midra 4K. Same sync-dependent behavior as above.

**Variable:** `selectedPreset` - PGM or PRW, following whichever the "Select Preset" action last chose (or the device, while synced).

### Set Preset Toggle

Available at: LivePremier, Alta 4K, Midra 4K 

**Feedback: Preset Toggle** - Available at: LivePremier, Alta 4K, Midra 4K. Shows if Preset Toggle is turned on or off at the device.

### LIVE - Layer Selection

Available at: LivePremier, Alta 4K, Midra 4K  
Selects, deselects, or toggles which Layer(s) are currently selected, and can also set which Preset side (Program/Preview) is active at the same time - a single "Screen/Auxscreen" and a single "Layer" field instead of the old action's method dropdown and per-screen layer fields, both accepting a concatenated Expression Mode value (`S1S2A1`/`L1L2L3`) to target several at once. The older, deprecated "Select Layer" action is documented at the [end of this manual](#deprecated).

**Feedback: Layer Selection** - Available at: LivePremier, Alta 4K, Midra 4K. Same sync-dependent behavior as above - shows whether a layer is currently selected, on Companion or the device.

### Multiviewer Widget Selection / Select Source in Multiviewer Widget

Available at: LivePremier, Alta 4K, Midra 4K  
"Multiviewer Widget Selection" works best in conjunction with "Select Source in Multiviewer Widget": first select a widget, then choose a source for it. Sometimes you just want to switch the source of one widget without writing many memories, and this covers exactly that.

**Feedback: Widget Selection** - Available at: LivePremier, Alta 4K, Midra 4K. Same sync-dependent behavior as above - shows whether a multiviewer widget is currently selected, on Companion or the device.

### <a name="sync"></a>Sync selection

Available at: LivePremier, Alta 4K, Midra 4K  
With this action, you can turn selection synchronization on or off. It is the same functionality as the toggle 'Selection Synced to Server' in WebRCS. You most likely want to have this turned on most of the time and you can automatically activate synchronization after connecting to a device in the configuration.  
**Selection synchronization is a very relevant concept for your daily work with this module!**  
What is it about: In WebRCS most of the manipulations are a multi-step process. First you select something and then you apply a manipulation to the selection. E.g. first you select a layer and then adjust the source of that layer or first you select a screen and then press Take to transition that screen. WebRCS keeps track of many selections like screen selection, layer selection, widget selection...  
In Companion you have the choice of whether you want to use direct commands like "Transition S1" or you can use the same procedure as WebRCS where you select first and then do something with the selection. That means Companion has to keep track of the selection as well.  
All WebRCS Clients, and Companion is in fact a WebRCS client, have their own selection. Client 1 can e.g. have screen S1 selected and client 2 can have screen S2 selected. If client one hits Take, S1 will transition and if client 2 hits take, S2 will transition, but none of the clients knows which screen is selected in the other client. Your Analog Way device itself also can keep track of all the selections. If you turn selection synchronization on, actually the client now will use the selection of the device instead of its local selection. If you change the selection it will be changed on the device. If other clients also syncronize to the device they will immediately see the changes.  
If you are using only one WebRCS client, selection synchronization doesn't matter, you are absolutely good to go with the local selection of the client. But if you want to integrate Companion into your workflow, usually you want to turn synchronization on on Companion and on your WebRCS client.  
Having said that, there are also situations where you don't want selection synchronization. As far as it concerns Companion then you can either use direct commands or you can permanently or temporarily disable synchronization. You even could turn sync off, select something locally and turn sync on again with one button.  
For your convenience Companion can automatically turn on its synchronization after a connection is established. WebRCS clients although will always start without synchronization and you have to turn it on manually in the client.  

**Feedback: Synchronization of the selection** - Available at: LivePremier, Alta 4K, Midra 4K.

**Variable:** `connectionLabel` - how you labelled the Connection in Companion.

## <a name="topic-memories"></a>Memories

### Recall Master Memory

Available at: LivePremier, Alta 4K, Midra 4K  
A master memory will always be loaded to all screens and auxscreens it is programmed for unless one of the screens is locked.  
Additionally you can choose to select the screens contained in the memory, if you tick that box the according screens will be selected and all other screens will be deselected.	

**Feedback: Master Memory** - Available at: LivePremier, Alta 4K, Midra 4K. Like on WebRCS this feedback indicates the last used master memory. Don't mistake it for a currently used master memory - due to the nature of master memories, it's not possible to show if a master memory is actually active.

**Variable:** `MM1.label` - the label of the Master Memory.

### Recall Screen Memory / Save/Revert Screen Memory Changes / Save Screen Memory to Slot

**Recall Screen Memory** - Available at: LivePremier, Alta 4K, Midra 4K. You can choose one or more screens to load a screen memory to. At LivePremier memories can be loaded to regular screens and auxscreens, on Alta and Midra screen memories can be loaded only on regular screens.  
If you choose selected screens or selected preset this action will work on all screens which are currently selected, i.e. exactly the same behaviour as if you would press a load screen memory button on WebRCS.  
Additionally, you can choose to select the chosen screens, if you tick that box all screens included in the action will be selected and all other screens will be deselected. If you use this action multiple times in one button, the last selection wins. Then you should prefer a dedicated action for selection.  
On LivePremier you also get "Unlock Screen if locked?"/"Relock after change" options - a module-only convenience not found in WebRCS, since a locked target silently doing nothing is easy to miss.

**Save/Revert Screen Memory Changes** - Available at: LivePremier. Mirrors the Save/Revert function in the top-right corner of the WebRCS editor, where you click the loaded Screen Memory's number to either save your current changes into it or discard them and restore the memory to its last saved state. Does nothing on a Screen/Preset where no Screen Memory is currently loaded.

**Save Screen Memory to Slot** - Available at: LivePremier. Saves a Screen/Aux's current live layer configuration into a chosen Screen Memory slot - either a slot you pick explicitly (overwriting whatever is in it) or "Next Available" (the first currently-empty slot, so you never overwrite anything by accident). The same action also doubles as "Update Screen Memory Label" and "Delete Screen Memory", acting purely on the memory slot itself without touching any live Screen. A safety checkbox ("Allow save, update or delete of existing Screen Memory?") guards against accidentally touching a slot that already holds content - leave it unchecked to only ever act on an empty slot.

**Feedback: Screen Memory** - Available at: LivePremier, Alta 4K, Midra 4K. At LivePremier this will work for all screen memories on screens and auxscreens, for Alta and Midra 4K this feedback only reflects screen memories on screens.

**Feedback: Screen Memory Slot Occupied** - Available at: LivePremier, Alta 4K, Midra 4K. Shows whether a Screen Memory slot currently has content saved, as opposed to still being empty - helps avoid accidentally overwriting an existing memory, or find a free slot, when using "Save Screen Memory to Slot".

**Variables:**
- `SM1.label` - the label of the Screen Memory.
- `SM.nextavailable` - the first currently-empty Screen Memory slot number, safe to target with "Save Screen Memory to Slot".
- `S1.pgm.memory.active` / `.prw.memory.active` - the memory currently loaded in screen program/preview.
- `S1.pgm.memory.label` / `.prw.memory.label` - the label of the memory in program/preview.

### Recall Aux Memory

Available at: Alta 4K, Midra 4K  
You can choose one or more auxscreens to load an aux memory to.  
If you choose selected screens or selected preset this action will work on all auxscreens which are currently selected, i.e. exactly the same behaviour as if you would press a load aux memory button on WebRCS.  
Additionally, you can choose to select the chosen auxscreens, if you tick that box all auxscreens included in the action will be selected and all other screens will be deselected. If you use this action multiple times in one button, the last selection wins. Then you should prefer a dedicated action for selection.

**Feedback: Aux Memory** - Available at: Alta 4K, Midra 4K.

**Variables:**
- `AM1.label` - the label of the Aux Memory.
- `A1.pgm.memory.active` / `.prw.memory.active` - the memory currently loaded in aux program/preview.
- `A1.pgm.memory.label` / `.prw.memory.label` - the label of the memory in program/preview.

### Recall Layer Memory

Available at: LivePremier  
Recalls a Layer Memory into one or more specific Layers, loading only that Layer's saved source/position/properties without touching the rest of the Screen or Preset. Rebuilt around a single "Use Currently Selected Layers" checkbox instead of the old version's separate method dropdown. The older, deprecated version of this action is documented at the [end of this manual](#deprecated).

**Variable:** `LM1.label` - the label of the Layer Memory.

### Recall Multiviewer Memory

Available at: LivePremier, Alta 4K, Midra 4K

**Variable:** `MV1.label` - the label of the Multiviewer Memory.

## <a name="topic-transitions"></a>Live Transitions

### Take Screen / Cut Screen

**Take Screen** - Available at: LivePremier, Alta 4K, Midra 4K. You can choose which screens/auxscreens to take. If you choose 'Selected Screens', the action does exactly what the Take button on WebRCS does. Additionally you have the option to take all screens or your own selection of screens. You can also combine 'Selected Screens' with your own selection, and then all currently selected screens and the ones specified will transition. The screen selection status itself is not affected by the action.  
If you are working with a T-Bar at the same time and the T-Bar is not at an end position, the action will do the transition to the opposite side from where you started, e.g. if your T-Bar had been down when you started the transition, the action will finish the transition towards up.  
An additional "Wait for Transition Completion" option lets a following action in the same button/sequence wait until the fade has actually finished, instead of only until the Take command itself was received - useful if that following action depends on the Screen having fully landed on Program. This can only ever cover Transition Times up to a few seconds, since Companion itself won't let a single action run any longer than that - for a longer Transition Time, use a separate Wait action instead.

**Cut Screen** - Available at: LivePremier, Alta 4K, Midra 4K. Same as Take Screen but without effects. The transition time is always zero.

**Feedback: Transition active** - Available at: LivePremier, Alta 4K, Midra 4K.

### Set T-Bar Position

Available at: LivePremier, Alta 4K, Midra 4K  
You can set the T-Bar position. Beware that T-Bar position is not synchronized live between clients, you will not see the position change in WebRCS.   
You can use any numbers in floating point or integer format to enter the position and maximum level. E.g. the following inputs all lead to a position exactly halfway: 50 / 100, 50% / 100, 0.5 / 1, 127 / 255, 13.4 / 26.8   
The input in text format has been chosen to make the action compatible with variables, most notably the internal:t-bar variable. You can use Companion with an X-Keys keyboard with T-Bar, the internal:t-bar variable will hold the value from the T-Bar (0-255). Just program a trigger to run the action whenever the variable changes.

**Variable:** `SelectedScreen.tbarPosition` - T-Bar position (0-100 scale, matching this action's own default Maximum) of the first currently selected Screen/Aux.

### Set Transition Time / Encoder Adjust (Screen)

**Set Transition Time** - Available at: LivePremier, Alta 4K, Midra 4K. You can set the time used for a take transition. At LivePremier there is the possibility to set individual times for program and preview giving you the opportunity of different fade-in and fade-out times at one transition. At Alta and Midra both presets use the same time so the action doesn't give you individual settings when used with Alta or Midra.

**Encoder Adjust (Screen)** - Available at: LivePremier, Alta 4K, Midra 4K. Increments or decrements a Screen's/Auxscreen's T-Bar Position or Transition Time by a step amount - built for rotary encoders, so you don't need a "Set" action plus a separately-read current value. You can step by a Raw amount (same scale as "Set T-Bar Position"'s own fields) or by a Percent of the full range - Raw wins if both are filled in.

**Variables:**
- `S1.pgm.time` / `.prw.time` (and `A1.pgm.time` / `.prw.time`) - the transition time for the screen/aux and preset.
- `SelectedScreen.number` / `.numberOfLayers` / `.TransitionTime.Pgm` / `.TransitionTime.Pvw` - further properties of the first currently selected Screen/Aux, handy for encoder-driven buttons.

### Copy Program to Preview

Available at: LivePremier, Alta 4K, Midra 4K  

## <a name="topic-layerprops"></a>Layer Properties

### Layer Properties

Available at: LivePremier, Alta 4K, Midra 4K  
This is a whole family of actions, one per layer property, all sharing the same targeting shape: a "Screen / Aux" field (First/Only Selected Screen, All Selected Screens, or a specific one - in Expression Mode you can also concatenate several, e.g. `S1S2A1`), a "Preset" field (Program/Preview/Both, or the currently selected one), and a "Layer" field (First/Only Selected Layer, All Layers, All Selected Layers, a specific one, or a concatenated `L1L2` in Expression Mode). Every one of them also offers "Unlock Screen if locked?"/"Relock after change" - a module-only convenience not present in WebRCS, since a locked target silently doing nothing is easy to miss. The older, deprecated "Select Layer Source" action is documented at the [end of this manual](#deprecated).  
The properties covered are:
- **Source** - replaces the deprecated "Select Layer Source" with the same single Screen/Preset/Layer targeting shape instead of the older method-dropdown design.
- **Position & Size** - sets a Layer's raw position/size in pixels (with an optional "keep aspect ratio" and a choice of anchor point), without the older expression-keyword system of the deprecated "Set Position and Size" - available for live layers on Alta/Midra too, not just LivePremier.
- **Transitions** - the Layer's own cross-fade/transition behavior settings.
- **Keying** (LivePremier only, firmware 5.0.128+) - applies an existing Keying preset from the Keyer Bank to a Layer; creating/editing the presets themselves is still done in WebRCS.
- **Cut&Fill** (LivePremier only) - sets up a Layer's Cut&Fill key: Enable, Source, Filter, Transform, and Crop. The Curve itself has to be copied 1:1 from an existing Layer via the Learn button rather than typed in - WebRCS itself only offers a drag-only curve editor with no typeable value.
- **Opacity** - the Layer's transparency.
- **Aspect & Crop** - classic crop and aspect-ratio override.
- **Mask** - the Layer's mask crop.
- **Border** - edge and shadow border styling.
- **Effects** - Filter (Black&White/Negative/Sepia/Solarize), Transform (Flip H/V), and, on LivePremier with firmware 6.0.4+, Strobe.
- **Speed** - the Layer's animation speed.
- **Timing** - the Layer's animation timing/delay.
- **Encoder Adjust** - increments/decrements one of a Layer's continuous properties by a step, built for rotary encoders, the same "Raw wins over Percent" idea as the Screen-level Encoder Adjust.
- **Set Anchor Point** - sets the global Anchor Point (the same WebRCS-wide setting), which determines the reference point used by Position & Size and by the `SelectedLayer.x`/`.y` variables.
- **Reset Size or Ratio** - mirrors WebRCS's own layer-toolbar buttons: resizes a Layer to its source's aspect ratio, to the source's exact pixel resolution, or to fill the whole Screen/Aux.

**Feedback: Layer Properties - Property Status / Layer Source / Cut&Fill Source** - Available at: LivePremier, Alta 4K, Midra 4K (Cut&Fill Source: LivePremier only). The read-side counterparts to the actions above, using the same Screen/Preset/Layer targeting. "Property Status" checks any on/off-style property (Border, Effects, Keying enabled, Cut&Fill enabled, Mask active, Aspect Override, Transitions); "Layer Source"/"Cut&Fill Source" check whether a Layer's actual assigned Source matches a specific value rather than just on/off. "Cut&Fill Source" deliberately reports the stored value even while Cut&Fill itself is off.

**Feedback: Source Tally** - Available at: LivePremier, Alta 4K, Midra 4K. Shows you whether a source can be seen on screen. It is more enhanced than the tally indicators of WebRCS or the device because it tracks the real visibility. A tally will not light if the source is in the layer but the layer is outside of the screen or if the layer has no area or is masked totally or is completely transparent. At Alta and Midra 4K also visibility of inputs in background sets will also be shown. There is no calculation if a layer completely covers another layer as layer content can also be transparent itself.

**Variables:**
- `SelectedLayer.count` / `.x` / `.y` / `.width` / `.height` / `.number` / `.opacity` - properties of the first currently selected Layer.
- `SelectedLayer.Input.Number` / `.Input.Name` / `.Input.width` / `.Input.height` - the source assigned to the first currently selected Layer.
- `SelectedLayer.Crop.Top` / `.Bottom` / `.Left` / `.Right` / `.Mask.Top` / `.Bottom` / `.Left` / `.Right` - crop/mask of the first currently selected Layer.
- `S1.layer1.source` / `.status` / `.width` / `.height` / `.x` / `.y` - a Layer's own source, live signal status, size and position, for currently existing layers only. `S1.layerbg.source` covers the background/native layer.
- `tally_S1_pgm_LIVE_1` - the tally state (0 or 1) of the source LIVE_1 in S1 program (see the caveat on tally variables in [About Variables](#variables)).

## <a name="topic-freeze"></a>Freeze

### Set Input Freeze

Available at: LivePremier , Alta 4K, Midra 4K 
Remember that input freeze is not a functionality done in the layer but in the input. If you change freeze it will immediately impact all occurences of that input in any layer on preview and program.

**Feedback: Input Freeze** - Available at: LivePremier, Alta 4K, Midra 4K.

**Variables:** `IN1.freeze` - whether input 1 is currently frozen (true/false). `IN1.status` - live signal status (VALID/INVALID) of the input. `IN1.label` - the label of the input.

### Set Layer Freeze / LIVE - Layer Freeze

**Set Layer Freeze** - Available at: Alta 4K, Midra 4K. Beware, there is no differentiation between program and preview.

**LIVE - Layer Freeze** - Available at: LivePremier. Freezes, unfreezes, or toggles a Layer's Program and/or Preview content independently of each other - unlike Alta/Midra's "Set Layer Freeze", which has no such distinction. Toggle is a single shared decision across every targeted Layer: if any of them is currently frozen, it unfreezes all of them; only if none are frozen does it freeze them all.

**Feedback: Layer Freeze** - Available at: Alta 4K, Midra 4K.

**Variables:** `frozen_S1_L1` - gives a * if layer 1 of screen 1 is frozen. `frozen_S1_NATIVE` - gives a * if the background layer of screen 1 is frozen. Both only available at Alta 4K and Midra 4K.

### Set Screen Freeze / LIVE - Screen Freeze / LIVE - Output Freeze

**Set Screen Freeze** - Available at: Alta 4K, Midra 4K.

**LIVE - Screen Freeze / LIVE - Output Freeze** - Available at: LivePremier. LivePremier has no single "freeze this whole screen" command of its own, so "LIVE - Screen Freeze" instead freezes/unfreezes/toggles every physical Output assigned to the chosen Screen(s)/Auxscreen(s) at once - the individual outputs can still be frozen/unfrozen on their own via "LIVE - Output Freeze". Toggle, again, is a single shared decision across all targeted outputs.

**Feedback: Screen/Output Freeze** - Available at: LivePremier, Alta 4K, Midra 4K. Mirrors the matching actions above ("Set Screen Freeze" on Alta/Midra; "LIVE - Screen/Output Freeze" on LivePremier).

**Variables:** `frozen_S1` - gives a * if screen 1 is frozen (Alta 4K/Midra 4K only). `OUT1.freeze` - whether output 1 is currently frozen (true/false), LivePremier only for now.

## <a name="topic-multiviewer"></a>Multiviewer

Multiviewer Memory recall, Widget Selection, and Select Source in Multiviewer Widget are documented under [Memories](#topic-memories) and [Selection, Locking & Presets](#topic-selection) respectively, since they share those actions' behavior. This section covers a Multiviewer's own live output status.

**Variables:** `MVW1.width` / `.height` / `.refreshrate` / `.format` / `.formatkind` / `.aspectratio` / `.label` - a Multiviewer's own output signal (the Multiviewer device/output itself, not a Multiviewer Memory).

## <a name="topic-preconfig"></a>Preconfig

### Set Input Plug

Available at: Alta 4K, Midra 4K  

### Preconfig - Inputs - Set Input Keying

Available at: LivePremier, Alta 4K, Midra 4K  
Remember that keying is not a functionality done in the layer but in the input. If you change keying it will immediately impact all occurences of that input in any layer on preview and program. The Mode choices also include CremaTTe3D (a more precise external keying system) and Cut&Fill - on LivePremier, Cut&Fill requires firmware 4.0.254 or newer; on Alta/Midra, whether either mode is actually supported by the device has not been confirmed yet.

**Feedback: Preconfig - Inputs - Input Keying Status** - Available at: LivePremier, Alta 4K, Midra 4K. Shows whether an Input's own keying mode currently matches a selected value - the read-side of the action above.

### Preconfig - Set Background Set Source

Available at: LivePremier  
Assigns the content (a Live Input or a Still Image) that a chosen Background Set (1-8) shows on every physical output of every Screen, all in one action - a Background Set has no processing in front of it, so a Screen spanning several outputs needs one source per output rather than one for the whole Screen. Clearing a Background Set back to empty isn't offered, since WebRCS itself has no direct way to do that either, only a full reset.

**Feedback: Preconfig - Background Set Source Status** - Available at: LivePremier. Shows whether one specific output of a given Background Set currently shows a given content (Live Input, Still Image, or None) - checks exactly one output at a time; combine several into an AND feedback to check a whole multi-output Screen.

### Preconfig - Assign Image from Library

Available at: LivePremier, Alta 4K, Midra 4K  
Assigns an image from the Image Library (or, on LivePremier, a Timer) so it becomes available as a Layer source. On LivePremier this targets an Image Store slot; on Alta/Midra it targets a Foreground or Background Frame slot instead, matching how each platform actually uses library images.

**Variable:** `IMG1.label` - the label of the still image (formerly `STILL_1label`).

## <a name="topic-audio"></a>Audio

### Route audio (block) / Route audio (channels)

**Route audio (block)** - Available at: LivePremier, Alta 4K, Midra 4K. Although this action is available on all platforms it works quite differently on LivePremier on the one hand and Alta and Midra on the other hand.  
LivePremier only includes a static audio routing between any input and output and Dante. With this action, you can change the routes.  
Alta and Midra include an audio layer that works similarly to a video layer and can be used to change audio output and store the assignment in memories. In WebRCS you can assign single inputs to the audio layer or one of ten custom blocks. At Midra and Alta this action will set the channels of the custom blocks, using the blocks itself still has to be done in WebRCS.  
This action routes audio channels in one continuous block. You define the first input, the first output and the number of channels. There is one speciality: if you choose 'No Source' as the first channel, no source will be applied to all outputs of the block.  
When you are on Alta or Midra 4K and you use this action multiple times to change routes within one custom block, you should use a tiny delay between the actions because internally block channels are not routed individually but replaced as one bunch. You want to make sure that the first action is complete and feedback has been received before you start the next route. You are safe to route as many channels as you like in one action though or many actions without delays affecting different custom blocks.

**Route audio (channels)** - Available at: LivePremier, Alta 4K, Midra 4K. Same as with Route audio block but here you don't have to use continuous audio channels. You define the first output channel and an individual selection of input channels to route there. Remember, you don't have to route all channels in one action, you can use this action multiple times. But timing concerns for Alta and Midra 4K are the same as with the Route audio (block) action.

**Feedback: Audio - Routing Status / Block Routing Status** - Available at: LivePremier, Alta 4K, Midra 4K. Shows whether one or more Audio Input Channels are currently routed to the corresponding Output Channel(s) - mirroring "Route audio (channels)"/"Route audio (block)" respectively.

### Audio - Dante Functions

Available at: LivePremier, Alta 4K, Midra 4K  
Bundles Dante Reboot, Dante Factory Reset, and renaming Receiver/Transmitter channels into one action, guarded by a safety checkbox since all of these can briefly or permanently interrupt Dante audio. Reboot and Factory Reset are confirmed working; channel renaming currently does not take effect on the device despite sending the same commands WebRCS itself does, and is included only as a preview of a planned feature.

## <a name="topic-streaming"></a>Streaming

### Stream Control / Stream Audio Mute

Available at: Alta 4K, Midra 4K  

**Feedback: Stream Running State / Stream Audio Mute Status** - Available at: Alta 4K, Midra 4K.

## <a name="topic-timers"></a>Timers

### Timer Setup / Timer Adjust Time / Timer Transport

Available at: LivePremier, Alta 4K, Midra 4K  
The timer control is split into three different actions: Timer Setup, Timer Adjust Time and Timer Transport.  
With Timer Setup you can adjust the general parameters of the timer like the mode or colors. With Timer Adjust Time you set the time and with Timer Transport you can start and stop the timer.  
For your convenience there are two options that toggle the running state: start/pause and start/stop.
Note, that Timer Transport doesn't work on Midra Simulator but it works on the real device.
Times for the Adjust Time command can be entered in the action or any variable with a matching content can be used.

**Feedback: Timer State** - Available at: LivePremier, Alta 4K, Midra 4K. Each feedback visualizes one timer state. Remember that you can add multiple feedbacks to one button to monitor different states on one button.

**Variables:**
- `TIMER1.status` - Running or Stopped and so on.
- `TIMER1.value` - current time of timer in milliseconds. Only available at LivePremier since firmware 4.03.38.
- `TIMER1.value.hms` / `.value.h` / `.value.m` / `.value.s` - current time of timer, formatted as hh:mm:ss or split into hours/minutes/seconds.

## <a name="topic-testpatterns"></a>Testpatterns

### Set Testpattern / Set Testpattern Raster Box

**Set Testpattern** - Available at: LivePremier, Alta 4K, Midra 4K. There are options to individually turn on or off and select testpatterns, as well as turn off all testpatterns. Turning off all testpatterns also clears the Raster Box overlay (see below) on every output.

**Set Testpattern Raster Box** - Available at: LivePremier. Turns the Raster Box overlay (Format and/or AOI alignment/centering markers) on or off for an Output - independent of whether a Testpattern itself is enabled on it.

**Feedback: Testpattern Active** - Available at: LivePremier, Alta 4K, Midra 4K. Shows whether a given Testpattern is currently active on a given Screen Canvas/Output/Input Group.

**Feedback: Testpattern Raster Box Active** - Available at: LivePremier. Shows whether a specific Raster Box (Format/AOI) is currently enabled on an Output.

## <a name="topic-gpio"></a>GPIO

### Set GPO

Available at: LivePremier  
If your GPOs are not configured to do Tally, you're able to set them with this action. Just use your Aquilon as a GPO interface :-)

**Feedback: GPI State / GPO State** - Available at: LivePremier.

## <a name="topic-device"></a>Device, Backups & Hot Backup

### Device Power

Available at: LivePremier, Alta 4K, Midra 4K
Depending on your platform this action will have different options because LivePremier can handle wake on LAN and has no standby mode and Alta and Midra have standby but can't wake on LAN.

### Backups - Set Backup Set to Source / Set Auto Mode

Available at: LivePremier (firmware 6.0.4+)  
Manually switches a Backup Set (or every Set in a Backup Group) to show its Primary source, Backup 1, or Backup 2 - the same manual override WebRCS offers per Backup Set - or turns Auto Mode (automatically switching to a Backup source if the Primary signal is lost) on, off, or toggles it.

**Feedback: Backups - Active Backup Source / Auto Mode Status** - Available at: LivePremier (firmware 6.0.4+). Shows which source (Primary/Backup1/Backup2) is currently active for a Backup Set or Group, or whether Auto Mode is currently on or off for it - the read-side of the action above.

**Variables:**
- `backups.set1.activeslot` / `.activesource` / `.automode` / `.primary.source` / `.primary.status` / `.backup1.source` / `.backup1.status` / `.backup2.source` / `.backup2.status` - one Backup Set's full status (LivePremier, firmware 6.0.4+).
- `backups.group1.activeslot` / `.label` / `.automode` / `.allprimaries.status` / `.allbackup1.status` / `.allbackup2.status` - one Backup Group's full status, worst-case across its members.

### Device - Failover to Hot Backup

Available at: LivePremier  
Swaps the "Hot Backup Device Address" with the current "Device Network Address" and reconnects to what was the Hot Backup Device - use this immediately if the main device fails during a show. The old main device becomes the new Hot Backup Device address, so this same action is also how you swap back afterwards. Guarded by a safety checkbox and a short cooldown against an accidental double-press swapping straight back. Requires "Enable Hot Backup Device" in the configuration to be checked with a valid address entered.

**Feedback: Device - Connection Status** - Available at: LivePremier, Alta 4K, Midra 4K. Shows whether the Main Device, or (if configured) the Hot Backup Device, is currently in a given connection status - more granular than Companion's own built-in connection feedback.

**Feedback: Device - Health Alarm** - Available at: LivePremier, Alta 4K, Midra 4K. Shows whether the device currently reports a Temperature or Fan alarm/warning.

**Feedback: Device - Input/Layer Signal Present** - Available at: LivePremier, Alta 4K, Midra 4K. Shows whether an Input currently has a live signal, or whether the source a Layer is currently showing has one - always true unless it's a live Input that has lost its signal (Still/Color/Timer/Screen-reinsertion sources have no signal-loss concept and always count as present).

**Feedback: LIVE - Show Thumbnail** - Available at: LivePremier, Alta 4K, Midra 4K. Shows a periodically-refreshed live preview image of an Input, Output, Still Image (Store), or Timer, fetched directly from the device. Requires "Allow Live Thumbnails" to be checked in the configuration; using it extensively (many buttons, short Refresh Rates) can noticeably increase CPU load depending on the Companion device it runs on, so the Refresh Rate is deliberately adjustable per button.

**Variables:**
- `Device.Series` / `Device.Model` / `Device.Name` - the device's model series, specific model, and user-configurable device name.
- `Device.FirmwareVersion` / `Device.FirmwareGeneration` - the device's firmware version and generation (e.g. V4).
- `Device.IP` / `Device.Serial` - the device's own reported IP address and serial number.
- `Device.NumberOfInputs` / `Device.NumberOfOutputs` - the number of really installed inputs/outputs.
- `Device.Status.Temperature` / `Device.Status.Fans` - aggregated temperature/fan alarm status.
- `Device.Connected.Maindevice` - this connection's own connection status.
- `Device.Connected.Hotbackupdevice` / `Device.IP.Hotbackup` - Hot Backup Device connection status/address (LivePremier only, "not_configured" while disabled).
- `S1.label` / `A1.label` - the label of the screen/aux screen.
- `S1.width` / `.height` / `.aspectratio` - a Screen's/Aux's own canvas resolution, for currently-enabled screens/auxes only.
- `OUT1.width` / `.height` / `.refreshrate` / `.format` / `.formatkind` / `.aspectratio` / `.label` - a physical output's current signal and label.
- `OUT1.hdcp` / `.colorspace` / `.sinkdetected` / `.sinkname` - a physical output's connected-sink status.
- `OUT1.usedin` - which Screen/Aux a physical output is currently feeding, blank if unused.

## <a name="topic-custom"></a>Custom Commands & Feedback

### Send custom AWJ replace command

Available at: LivePremier, Alta 4K, Midra 4K  

This is a very powerful action - you can send any AWJ command to your device and automate almost everything with it.

**Before reaching for this, though:** get in touch with the maintainer at info@konferenzregie.de and describe which action, feedback, or variable you're missing. A proper, tested built-in implementation is more reliable long-term than hand-rolling it through raw protocol commands here - and your request might already cover something others need too.

You can download the AWJ programmers guide for your device from Analog Way's website for the full protocol documentation. In short, AWJ addresses a parameter with a *path* - a bit like a URL or a file path - and then sets that parameter to a value. With this action you can set any available parameter at any path to any value, as long as it's a command the AWJ protocol actually supports - everything selection-related, for example, isn't part of the protocol at all and can only be done with the dedicated actions, never with a custom AWJ command.

Parameters can also be taken from existing or custom variables, for extra flexibility.

This module offers a few mechanisms that make working with raw AWJ noticeably easier:

1. **Learn.** Push the Learn button to pull the path and value from your last manipulation straight into the input fields. Say you just renamed a memory in WebRCS - hit Learn, and you get the exact path/value that did it; change the value and run your action, and you've just renamed a memory from Companion. The memory number sits right there in the path too, so you can edit it to target a different one.  
   Two caveats: a single WebRCS action can internally send several commands (recalling a memory changes many layers at once, for instance), and Learn only ever captures the *last* one received (the Action Recorder can capture more than one, if you need that) - and the path to change a value is sometimes different from the path to read it. In either case, Learn won't get you the right command and you'll need the programmer's guide instead.
2. **Program/Preview instead of the hardware preset.** Internally, the device's image scalers are arranged in presets, and Take swaps which one is shown on Program vs. Preview - so raw AWJ can't address "Program"/"Preview" directly, only the underlying hardware preset ("A"/"B" or "UP"/"DOWN"). This module handles that for you: wherever you'd otherwise have to enter "A"/"B"/"UP"/"DOWN", you can instead write "pgm"/"pvw" - or "PGM"/"PRW" if you want it to always follow whichever bank is currently on air, rather than a fixed side - and the action resolves it to the correct address at execution time.
3. **xUpdate.** Many commands only change a stored parameter, and the visual output won't follow along until a so-called xUpdate command tells the processors to actually apply it. A checkbox on this action appends that xUpdate automatically - if you're not sure whether you need it, just try without it first.
4. **Variables everywhere.** The path, text value, and object value fields all accept variables. To set e.g. an input's name from a custom variable, use it in the text value field; for boolean or numeric values, use the object value field instead, with the data in the matching format.

### Send custom AWJ get command

Available at: LivePremier, Alta 4K, Midra 4K  

This is the get equivalent to "Send custom AWJ replace command" above: it sends any AWJ get command to your device, retrieves the value, and stores it in a custom variable. Variable parsing for the path works the same way, and the Learn button for the path behaves exactly like the replace command's - see that section for both.

A couple of things specific to reading values:
- **Constantly-updated data** (temperature, time, ...) can still be read, but its frequent updates hide it from the Learn button and Action Recorder - enter the AWJ path by hand for those instead.
- **The retrieved value** goes into your chosen custom variable; its type can optionally go into a second one. If nothing is found at the path, both come back as `"undefined"`. A boolean value reads as `1` or `0`; an object value is stringified, in the same format you'd use to type it into the custom AWJ replace command.

**Feedback: Custom Feedback** - Available at: LivePremier, Alta 4K, Midra 4K  
This Feedback is a very powerful tool, able to visualize almost every parameter not covered by the other feedbacks.  
You have to enter an AWJ path and every time the property of that path changes the feedback will be evaluated. The path has to point to exactly one property. Wildcards are not allowed with one exception: instead of the preset designators A and B, you can also use PVW and PGM (or PRW/PGM for whichever side is currently Preview/Program). If you use one of these the feedback will always check a property in preview or program.  
You can specify how the result should be interpreted and according to that have different options to generate a decision if the feedback is active or not.  
The actual value does not necessarily have to be of the type you want it to be interpreted as. If you e.g. receive a text with the content "12" and interpret it as a number, it will be converted to the number 12. However, if you want to interpret a text like "#12" as a number, it will not work.  
If you want to use Regular Expression matching for text, the expression has to be entered without the slashes or modifiers.
If you interpret the value as an object, at the moment no options are available to do further checks. The feedback will be true if something has been received at all.  
There is a checkbox to invert the status of the feedback. That means if you use e.g. the numeric comparison > and invert the result, you have an overall <= comparison.  

There is a learn button available to automatically fill the options. In order to automatically fill options you have to make a change in WebRCS to the property you want to monitor. Then press the learn button. The options will be filled with the last received path and value, which are most likely the ones corresponding to your change. Note: some actions in WebRCS do change many parameters, even if it sometimes looks to you as if it was only one parameter. Only the last received change will be learned in the feedback and this may not be the one you are looking for. You should always check the path if it looks like you expect. If you don't get the correct path, then you can't use the learn button and have to refer to the AWJ programmers guide available from Analog Way.

Each time you add a custom feedback also a variable for that feedback will be generated. In that variable, you can monitor the value received by that feedback.  
So it is possible to monitor e.g. device temperature, notifications, input status, connected monitors, memory validity...  
Despite popular demand, it is not possible to monitor the times of timers this way - use the dedicated `TIMER{n}.value` variable described above instead.  
If you interpret the value as boolean, the value will be inverted according to the option and the variable will hold the result either as a 1 or as a 0.  
The variable will be automatically named after your AWJ path (without the $ or @ characters), if you want to have a mofe conveniant name, you can enter it in the variable name option.

### Action Recorder

You can use the Action Recorder with this module to record actions as you make some changes on the device. The Action Recorder only records custom AWJ replace commands, even if you do a change where a dedicated action would be available. Additionally, received global updates will not be included in the recorded custom AWJ replace command for a value change but in a separate command that holds only the global update.  
You will see that depending on what type of values you change your device sends a lot of global updates, you are advised to review your recording and see if there are any global updates and if there are some, delete all but the last one.  
Also depending on what type of values you change you will record status messages. Most of them are only sent by the device but not meant to be set by a third-party application. You are advised to delete status messages as well.
If you want to record changes for e.g. positions or any other values with a range, it is better to enter the final value in WebRCS numerically. If you drag around a layer you will record every single position along your way.

## <a name="presets"></a>Presets

This module provides a good amount of presets but most of them are generated dynamically. E.g. if you write a screen memory, you'll find a preset to load that screen memory, but there are no presets for invalid memories.
Once you've dragged a preset to a button it will stay there and its parameters will not change. If you for example delete a screen memory, then the preset will disappear but your button will still be there and try to load that non-existent memory.  
Many presets use variables in the button text so the button will follow your setup to a degree. If you rename a memory then the new name will be reflected on the button. If you want to use a different label on your Companion button, just edit it.  
Please use the presets as a quick way to get your programming started and adjust them as you need.

All presets also have color information. In the config you can set up your preferred default colors and all presets will use your provided colors. Presets for memories automatically use the color you have chosen in WebRCS. Again, after you dragged a preset to a button it will stay static. Changes in the default colors or memory colors in WebRCS will not be reflected on programmed buttons.

There is also a "Live - Thumbnails" preset category with one ready-made "Show Thumbnail" button per currently available Input, Output, Still Image (Store) and Timer - see the matching feedback above, including its "Allow Live Thumbnails" configuration switch.

## <a name="deprecated"></a>Deprecated Actions (from V2)

These are older versions of actions that were later rebuilt with a cleaner design. They're kept exactly as they always worked, purely so buttons programmed with them keep working - **don't use them for new buttons**, use the current version (linked below each one) instead.

### Recall Layer Memory (Deprecated from V2)

Available at: LivePremier  
The original V2 version of this action, kept working exactly as before for existing buttons. New buttons should use the current ["Recall Layer Memory"](#topic-memories) instead.

### Select Layer Source (Deprecated from V2)

Available at: LivePremier, Alta 4K, Midra 4K  
The original V2 version of this action, kept working exactly as before for existing buttons. New buttons should use ["Layer Properties - Source"](#topic-layerprops) instead.  
At LivePremier you could also use layer memories for this, but sometimes it is more convenient to just switch a source without the need of a memory and at Alta and Midra this action is especially useful because you don't have layer memories there.  
Although this action is available on all platforms, due to the very different layer types an existing setup may not transfer very well to a different system.  
If you choose the option to set the source for selected layers, you'll get a separate dropdown for all types of layer sources. At Livepremier these are regular layer sources and background sets for the native layer, at Alta and Midra there are additionally aux-background-layer sources and foreground sources. At the time of programming the button Companion can't know what type of layer will be selected at execution time, so when the action is executed for every selected layer the chosen input will be set. There is also a don't change option which will not execute a source change if a layer of that type is selected.  
Imagine you have image one set in background set 1 and as foreground image 1. If you now choose background set 1 as the native layer source and foreground image 1 as the foreground layer source and image 1 as the layer aux-background-layer source, you can switch image 1 to all layers with the same button and Companion always chooses the correct type.

### Set Position and Size (Deprecated from V2)

Available at: LivePremier, Alta 4K, Midra 4K (only for live layers on Alta/Midra)  
The original V2 version of this action, kept working exactly as before for existing buttons. New buttons should use ["Layer Properties - Position & Size"](#topic-layerprops) instead, which offers the same anchor-point-based positioning without needing the expression-keyword system described below.  
Positioning and sizing on steroids. You can either select a specific layer to work on use the selected layers or do a combination of selection and specification. E.g. you can use all selected layers but only for one specified screen or you can use a specified layer for the selected screens.  
Layers of locked screens / presets will not be touched.  
For each layer to touch, you can choose which parameters to act on: vertical and horizontal position, width and height. If you e.g. include the X Position but not the Y Position, the layer will only be touched in the horizontal position and the vertical position will stay the same.
Unlike WebRCS this action does not always refer to the layer position from the center of the layer but offers detailed settings for the anchor point in X and Y directions inside or outside of the layer.

All input fields of this action support Companion variables can even be used with an expression like syntax. The functions of the Companion expressions can't be used but all operators like +, -, *, /, (), %, ternary ? : and so on are working. That means you can use something like "$(internal:custom_var1) + 0.5 * $(internal:custom_var2)".  
There are several special keywords available to be placed in an expression. If you use a keyword, it will be replaced with the actual values at runtime for each layer individually. The keywords are:  
- sw - screen width
- sh - screen height
- sa - screen aspect ratio
- lx - position of left edge of the layer within screen
- ly - position of the top edge of the layer within screen
- lw - layer width
- lh - layer height
- la - current aspect ratio of the layer
- bx - position of left edge of the bounding box of all selected layers within current screen
- by - position of the top edge of the bounding box of all selected layers within current screen
- bw - width of the bounding box of all selected layers within current screen
- bh - height of the bounding box of all selected layers within current screen
- ba - aspect ratio of the bounding box of all selected layers within current screen
- iw - width of the source currently assigned to the layer, 0 if empty
- ih - height of the source currently assigned to the layer, 0 if empty
- ia - aspect ratio of the source currently assigned to the layer, none if empty
- l1x - position of left edge of the first layer of the selection within screen
- l1y - position of the top edge of the first layer of the selection within screen
- l1w - first layer of the selection width
- l1h - first layer of the selection height
- l1a - current aspect ratio of the first layer of the selection
- screen - name of the screen, e.g. S2
- layer - name of the layer, e.g. 3 for layer three
- index - the index of the layer being adjusted. Will be 0 for one layer but if you have a selection of multiple layers it will show you which one is processed right now.
- amount - the count of processible layers in the selection, e.g. a background layer could be selected but as it can't be positioned it will not be included

The general way how this action works is:
1. Do movement if needed. The anchor point position is moved to the X and Y coordinates. For the anchor point, you will usually want the center of the layer, this is the same behavior as WebRCS and is given as default entries. The anchor points have to be entered in pixels as well and so the horizontal center is to be calculated by the layer x position + half of the layer width. The expression is `lx + 0.5 * lw`. For the vertical anchor, it is `ly + 0.5 * lh`.
You can think of the anchor point as the origin of a coordinate system. When you use the positioning part of this action, you define the origin with the anchor point and then you offset the coordinate system. If you set your anchor point to be at the top left corner of the layer, it will move the top left corner to the destination. If you set the anchor point to the center of the layer, the center will be positioned at the X / Y values.
2. Do resizing if needed. If you do resizing, the anchor position stays at the same spot and everything else will be resized.
Again you can think of a transformation of a coordinate system with its origin at the (new) anchor point position. IF your anchor point was at the top left corner before movement, it will be at the top left corner after movement and now during the resize that top left corner will stay at ist position and the other corners may change. If your anchor position is outside of the layer area, the layer will also appear to move from resize only. Once again, the anchor stays at its spot and the whole coordinate system is scaled.  
This size change is easier to understand for relative sizing and you can do that by using factors. But usually you will enter a value and this will be the target size of the layer.

All results positioning expressions will be rounded to full integers before being sent to the device as AWJ does not support positioning by floating point numbers. That is also a little problem when resizing a layer because the wanted aspect ratio can not always be reached exactly with integer numbers. If you want to retrieve the current aspect ratio, you have two options:  
1. calculate it yourself by using lw / lh. You'll get the de facto aspect ratio of the layer.
2. use the keywords la, sa, ba or ia. These values are calculated by an algorithm that compares the the actual aspect ratio to several common aspect ratios and if the actual aspect ratio is very close to a common aspect ratio but a tiny bit off because of a rounding error, it will return the common aspect ratio. For example, if your layer is 1000px wide and should be 16/9, the height would need to be 562.5px. You can only enter heights of 563px or 562px, which would both give different aspect ratios from 16/9. The algorithm detects that your ar is close enough to 16/9 and that there is no way to have exactly 16/9, so it assumes you wanted the ar to be exactly 16/9 and gives that as a result. The algorithm is smart enough to only detect the nearest possible pixels, e.g. 999/563 will not be replaced by 16/9.  
la is thus the preferred keyword to use for aspect ratio retaining resizing of layers. There will be no rounding error introduced as long as you are not working with tiny layer sizes.

If you choose to touch x or y position, the anchor point will be positioned at the according values.

With the keywords you can do many fancy things like right aligning a layer to the screen with X position of 'sw' and Anchor X of 'lx + lw'. Or you can center the layer in the screen with X position of '0.5 * sw' and Anchor X of 'lx + 0.5 * lw'. With the anchor you define the original position and with the x and y the position to go to.  
IF you want to scale many layers and want them to keep their relative positions, you have to use the keywords for the bounding box of the layers, e.g. you want them to be scaled up by 5% from the middle of the layers use 'bx + 0.5 * bw' for the Anchor X. For the width you can use 'lw * 1.05'

Even more, you can preceed your input field with "inc" for increase or "dec" for decrease. If you use one of these keywords the value will not be set in absolute fashion but it will be incremented. If you e.g. use inc 10 for X Position and 0.5 for Anchor X, the layer will move 10 pixels to the right with every execution of the action. If you use inc 0.05 * sw for X Position and 0.5 for Anchor X, the layer will move 5% of the screen to the right with every execution of the action.

The same syntax of the positioning inputs can also be used for width and height inputs. If you use both, width and height, the layer aspect ratio will be changed to whatever the result is. If you use only one, width or height, you get the option how to treat aspect ratio of the layer.  
By default only the selected parameter will be changed and the other one will be left untouched, resulting in a change of aspect ratio. Write "keep" or "la" in the input field and the other parameter will be adjusted to keep the current aspect ratio. Write any number or a fraction like 16/9 to set the aspect ratio to that value. If you e.g. just want to fix the a/r without changing the current width, you can use lw for the width and 4/3 for the a/r. Additionally with the Anchor fields you can set the direction where the layer should be extended.

Last, but not least the action also offers the learn button. Push it to get the position, size and aspect ratio of the selected or specified layer. After learning X Position, Y Position, Width and Height are selected for a complete status of the layer. So aspect ratio is not visible but the field will be updated with a numerical representation of the aspect ratio. If you disable Width or Height you can see the field and use also a/r.  
Because you can use math in the input fields this functionality is also quite useful for mathematical one-time adjustments, e.g. learn the status of a layer, add "*1.2" to Width and Height and Test fire the action to increase layer size by 20%. The learned position will reflect to the entered anchor, make sure you have entered your desired anchor position before hitting learn. Actually it doesn't matter at all which anchor position you use here if your only goal is to reproduce the position. But if you want to edit the values later to resize the layer, you need to use the same anchor because the position reflects to it. Simply put if you e.g. enter `lx + lw` for anchor x position, the learned x Position will be the right edge of the layer. 

### Select Layer (Deprecated from V2)

Available at: LivePremier, Alta 4K, Midra 4K  
The original V2 version of this action, kept working exactly as before for existing buttons. New buttons should use ["LIVE - Layer Selection"](#topic-selection) instead.  
There are different strategies how to select layers. Either you can use the currently selected screens and then select one or more layers on the selected screens or you can specify the screens where to select the layer or layers. If you choose one of the select options, then all layers which are not chosen for selection are getting deselected. If you choose one of the toggle options, the specified layer or layers are toggled. Companion can't know the number of layers available at the selected screen when you set up the action, so for the options with selected screens, you get the maximum possible layer options. There is no harm if you include a layer that is not available later.

## Version History

You can find the version History of this module at the [readme page](https://github.com/bitfocus/companion-module-analogway-awj#readme) of the source repository
