/**
 * This class holds all the device specific constants.
 * Mainly these are paths where a feature is located in the AWJ device model.
 */
export default class Constants {
    constructor() {}

    static readonly maxScreens: number = 24
    static readonly maxAuxScreens: number = 96
    static readonly maxInputs: number = 256
    static readonly maxLayers: number = 128
    static readonly maxScreenMemories: number = 1000
    /** Aux Memories are a Midra/Alta concept - LivePremier has no separate aux bank, so the generic ceiling
     * just mirrors maxScreenMemories rather than claiming a number of its own. */
    static readonly maxAuxMemories: number = 1000
    static readonly maxMasterMemories: number = 500
    static readonly maxMultiviewerMemories: number = 50
    static readonly maxStills: number = 192
    static readonly maxTimers: number = 4

    static readonly presetTogglePath = ['device','screenGroupList','items','S1','control','pp','copyMode']
    static readonly presetToggleValueValid: boolean = false

    static readonly lockPrefixScreen: string = 'S'
    static readonly lockPrefixAux: string = 'A'

    static readonly macAddressPath = 'DEVICE/device/system/network/adapter/pp/macAddress'

    // LivePremier4 overrides this to 'screenAuxGroupList' (see livepremier4/constants.ts) - this base value is
    // only actually used as-is before a platform has been detected, or as the fallback for an unrecognized
    // platform string (see AWJinstance.setDevice()'s default branch).
    static readonly xUpdatePath: string = '"device","screenGroupList","control","pp","xUpdate"'
    // static readonly xUpdatePath = '""device","preset","control","pp","xUpdate"' // midra

    static readonly screenGroupPath = ['device', 'screenAuxGroupList']
    static readonly auxGroupPath = ['device', 'screenAuxGroupList']

    static readonly screenPath = ['device', 'screenList']
    static readonly auxPath = ['device', 'auxiliaryList']

    static readonly lastUsedMasterPresetPath = ['device', 'masterPresetBank', 'status', 'lastUsed']

    static readonly screenMemoryPath = ['device','presetBank','bankList']
    static readonly activeScreenMemoryIdPath = ['presetId','status','pp','id']
    static readonly activeScreenMemoryIsModifiedPath = ['presetId','status','pp','isNotModified']
    static readonly activeScreenMemoryValueValid: boolean = true

    static readonly screenSizePath = ['status', 'size', 'pp']
    static readonly propsSizePath = ['position', 'pp']
    static readonly propsPositionPath = ['position', 'pp']
    static readonly propsCroppingPath = ['cropping', 'classic', 'pp']
    static readonly propsMaskPath = ['cropping', 'mask', 'pp']

    /** Tail of the path that tells which preset bank is currently live, appended to screenGroupPath.
     * LivePremier exposes it as control/pp/presetUp, Midra/Alta as status/pp/transition. */
    static readonly presetSideIndicator: string[] = ['control', 'pp', 'presetUp']

    /** How a Layer transition's "Allow Cross Effect" is expressed in transition/pp/flags. LivePremier uses
     * a mutually exclusive FORCE_CROSS / FORCE_TRANSITION pair; Midra/Alta instead carries a single negative
     * DISABLE_CROSS_EFFECT token, whose presence means the cross effect is off - so its "on" adds nothing and
     * just clears that token again. */
    static readonly crossEffectFlags: { on: string | null, off: string | null, clear: string[] } =
        { on: 'FORCE_CROSS', off: 'FORCE_TRANSITION', clear: ['FORCE_CROSS', 'FORCE_TRANSITION'] }

    /** Same shape as crossEffectFlags, for "Allow Cross Depth". LivePremier expresses "off" as one of
     * several DEPTH_CUT_* tokens (hence the prefix used to clear them); Midra/Alta uses the single
     * negative DISABLE_CROSS_DEPTH, matching how it handles the cross effect. "On" adds nothing on either
     * platform - it simply clears whatever was there. */
    static readonly crossDepthFlags: { on: string | null, off: string | null, clear: string[], clearPrefix?: string } =
        { on: null, off: 'DEPTH_CUT_MIDDLE', clear: [], clearPrefix: 'DEPTH_CUT_' }
    /** The two `speed/pp/type` enum values, or null on a platform that has no Linear/Smooth speed switch at
     * all - Midra/Alta only offers Pt1/Pt2 and stores a plain 'SMOOTH', so there is nothing to write there. */
    static readonly layerSpeedTypes: { linear: string, smooth: string } | null = { linear: 'LINEAR_TRANSITION', smooth: 'SMOOTH_TRANSITION' }

    /** The property under a layer's `source/pp` that names its source. LivePremier calls it `inputNum`,
     * Midra/Alta calls it `input` (live-confirmed on an Eikos 4K simulator). */
    static readonly layerSourceProp: string = 'inputNum'
    /** Prefix of `device/inputList`'s own item keys, and of the id a layer stores for a live input.
     * LivePremier uses `IN_` (with `LIVE_` appearing as the layer-side spelling), Midra/Alta uses `INPUT_`
     * on both sides - live-confirmed that its inputList keys and a layer's source read `INPUT_1` alike. */
    static readonly inputKeyPrefix: string = 'IN_'

    static readonly screenLayerList = ['layerList', 'items']

    static readonly subSyncselectionPat = 'system/network/websocketServer/clients'

    static readonly multiviewerWidgetSelectionPath: string = 'REMOTE/live/multiviewers/widgetSelection/widgetIds'
    static readonly multiviewerWidgetSelectionMap = (key: any) => key
    static readonly multiviewerMemoryPath: string = 'DEVICE/device/monitoringBank/bankList'

    static readonly stillLibraryPath: string = 'DEVICE/device/stillList/library/bankList'

    /** Whether device/outputList/items/{n}/status/pp/rate is reported in milliHertz (divide by 1000 for Hz) or already in plain Hz. */
    static readonly outputRateInMilliHertz: boolean = true

    
    
    
}