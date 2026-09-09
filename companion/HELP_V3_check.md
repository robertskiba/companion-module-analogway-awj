# HELP.md Review — was veraltet ist

## 1. Direkter Fehler: Kurzform-Tabelle (Zeilen 18–23)

- **„Multiviewer Memory: VM“ ist falsch.** GUIDELINES.md legt (aus dieser Session) explizit
  `MV{n}` für Multiviewer Memory fest, gerade *weil* es früher mit dem Multiviewer-Output
  kollidierte. Die Dropdown-Beschriftung wurde im Code bereits von „VM“ auf „MV“ umgestellt
  (`getMultiviewerMemoryChoices()`). Muss lauten: **„Multiviewer Memory: MV“**.
- **„Multiviewer: MV“ kollidiert jetzt mit obigem Fix.** Der Multiviewer-*Output* (nicht die
  Memory) heißt im Code und in allen Variablen `MVW{n}` (z. B. `MVW1.width`), exakt um die
  Kollision mit `MV{n}` (Memory) zu vermeiden. Muss lauten: **„Multiviewer: MVW“**.
- **„Screen Memory: SM or M“** — im aktuellen Code gibt es keinen bloßen „M“-Fallback mehr
  (`stripMemoryPrefix()` wird überall nur mit dem vollen Zwei-Buchstaben-Code aufgerufen,
  „SM“). Der „oder M“-Zusatz sollte raus, sonst suggeriert er eine nicht mehr existierende
  Schreibweise.

## 2. „Recall Layer Memory“ (Zeilen 81–83)

Komplett veraltet:
- Die hier beschriebene Action ist im Code jetzt explizit **„Deprecated from V2“** — es gibt
  seit dem V3-Rebuild eine neue **„LIVE - Recall Layer Memory“ (V3)** mit eigenem
  Options-Layout (Screen/Preset/Layer-Felder statt Method-Dropdown, "Unlock if locked"/
  "Relock"-Optionen). Von beidem steht nichts in der Doku.
- „Available at: LivePremier“ ist ungenau — das ist Aquilon-spezifisch (LivePremier4), nicht
  die alte reine „LivePremier“-Linie. Betrifft vermutlich auch andere „Available at“-Zeilen,
  die das nicht genauer differenzieren (siehe Punkt 6).

## 3. Massive fehlende Abdeckung — komplette Actions/Feedbacks fehlen

Das Dokument spiegelt im Wesentlichen den Funktionsstand von V2/frühem V3 wider. Folgende
Actions existieren im Code, tauchen aber **nirgends** in der Doku auf:

**Layer Properties (V3-Familie, je mit Screen/Preset/Layer-Feldern, Unlock/Relock-Optionen):**
Position & Size V3, Source V3, Keying (Aquilon, Firmware-gated), Cut&Fill (Aquilon),
Opacity, Aspect & Crop, Mask, Border, Effects, Speed, Timing, Encoder Adjust, Set Anchor
Point, Reset Size or Ratio, Layer Selection V3, Screen Encoder Adjust V3.

**Backup / Hot Backup (komplett neues Feature, prominent im CHANGELOG beworben):**
„Backups - Set Backup Set to Source“, „Backups - Set Auto Mode“, „Device - Failover to Hot
Backup“ — dazu die komplette Config-Sektion „Enable Hot Backup Device“/„Hot Backup Device
Address“, die unter „Configuration“ ebenfalls komplett fehlt.

**Preconfig-Actions:** „Preconfig - Set Background Set Source“, „Preconfig - Assign Image
from Library to Image Store/Frame“, „Preconfig - Inputs - Set Input Keying“.

**Sonstige neue Actions:** „LIVE - Output Freeze“ (Aquilon), „Audio - Dante Functions“,
„Device - Set Testpattern Raster Box“.

**Feedbacks komplett unerwähnt:** Layer Properties - Property Status / Layer Source /
Cut&Fill Source, „LIVE - Screen Memory Slot Occupied“, Device - Input/Layer Signal Present,
Device - Health Alarm, Device - Connection Status, Testpattern Raster Box Active, **„LIVE -
Show Thumbnail“** (eigenes größeres Feature mit Live-Preview-Bildern!), Backups - Active
Backup Source / Auto Mode Status, Preconfig - Background Set Source Status, Preconfig -
Input Keying Status, Audio - Routing Status / Block Routing Status.

## 4. Variablen-Tabelle (Zeilen 462–493) ist zu >80 % veraltet

- Zeigt **ausschließlich die alten (V2-Style) Variablennamen** (`screenS1memoryPGM`,
  `frozen_IN1`, `INPUT_1label` …), ohne die neue Standardbenennung zu erwähnen, die für
  jede neue Verbindung jetzt der **Default** ist (`S1.pgm.memory.active`, `IN1.freeze`,
  `IN1.label`, `SM1.label` …) — nur bestehende Configs mit „Use old (V2) variable names“
  behalten die alten Namen. Das ist ein zentraler Verhaltensunterschied, der komplett fehlt.
- **`frozen_IN1` existiert so nicht mehr.** Die Input-Freeze-Variable heißt jetzt `IN{n}.freeze`
  und ist ein Boolean (`true`/`false`), keine „*“-Zeichenkette mehr — anders als
  `frozen_S1`/`frozen_S1_L1`/`frozen_S1_NATIVE` (Midra), die tatsächlich noch das alte
  „*“/„ “-Schema nutzen und insofern korrekt dokumentiert sind.
- **`timer1` (Millisekunden, „Only available at LivePremier since v4.3“) ist veraltet.**
  Die Variable heißt jetzt `TIMER{n}.value` (plus neu: `.value.hms`, `.value.h`, `.value.m`,
  `.value.s`), gated auf Firmware **4.03.38** (nicht „v4.3“), und nur auf LivePremier4/Aquilon.
- **`STILL_1label`** wurde für neue Configs zu **`IMG{n}.label`** umbenannt (an die
  „Image Store“/„Image Library“-Terminologie angeglichen) — alte Configs behalten
  `STILL_{n}label`, das fehlt als Hinweis.
- Komplett fehlende Variablen-Familien: `SM.nextavailable`, alle `Device.*`
  (Series/Model/Name/FirmwareVersion/FirmwareGeneration/IP/Serial/NumberOfInputs/
  NumberOfOutputs/Status.Temperature/Status.Fans/Connected.Maindevice/
  Connected.Hotbackupdevice/IP.Hotbackup), alle `OUT{n}.*` (width/height/refreshrate/
  format/formatkind/aspectratio/label/hdcp/colorspace/sinkdetected/sinkname/usedin/freeze),
  alle `MVW{n}.*`, `S{n}`/`A{n}.width/.height/.aspectratio` und `.layer{x}.*`, die komplette
  `backups.set{n}.*`/`backups.group{n}.*`-Familie, sowie `SelectedLayer.*`/`SelectedScreen.*`
  (für Encoder-Bauten gedacht).

## 5. Kleinere Ungenauigkeiten

- Zeile 328 („Set GPO … Available at: LivePremier“): korrekt, aber es gibt inzwischen auch
  ein GPI/GPO-**Feedback**-Pendant, das schon dokumentiert ist (Zeile 430) — nur die
  Reihenfolge/Querverweis fehlt, kein echter Fehler.
- Der einleitende Absatz über „Alta 4K, Midra 4K, LivePremier“ als gleichrangige Plattformen
  ist im Kern richtig, aber der Code selbst gruppiert Alta technisch **mit Midra** (eigener
  Code-Pfad `midra/`, viele Beschreibungen im Code sagen wörtlich „(Midra/Alta)“) — nicht mit
  LivePremier. Das Dokument macht diesen Unterschied nirgends explizit, was bei den ganzen
  „Available at: LivePremier, Alta 4K, Midra 4K“-Zeilen technisch irreführend ist, wenn eine
  Funktion in Wirklichkeit *nur* Aquilon (LivePremier4) betrifft — siehe Punkt 2.

## Empfehlung

Das Dokument ist der ursprüngliche V2/früh-V3-Hilfetext und wurde nicht mit dem restlichen
V3-Rebuild synchronisiert. Eine Detailkorrektur einzelner Zeilen würde die Grundschieflage
(riesige fehlende Abschnitte) nicht beheben. Sinnvoller wäre vermutlich ein neuer Durchgang,
der Abschnitt für Abschnitt am aktuellen `actionsToUse`/`feedbacksToUse`/Variablen-Bestand
entlang neu aufgebaut wird, statt den bestehenden Text nur zu patchen.