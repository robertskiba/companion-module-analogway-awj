import Constants from "../awjdevice/constants.js"

/**
 * This class holds all the device specific constants.
 * Mainly these are paths where a feature is located in the AWJ device model.
 */
export default class ConstantsLivepremier4 extends Constants {
    constructor() {
        super()
    }

    // The only two constants that actually differ from the base class's own Aquilon/LivePremier defaults -
    // LivePremier4 uses the unified 'screenAuxGroupList' (screenGroupPath/auxGroupPath already point there in
    // the base class) where the base's own copyMode/xUpdate paths still use 'screenGroupList'. Every other
    // field previously duplicated here was byte-identical to its inherited base value - removed to avoid
    // implying a difference that doesn't exist.
    static override readonly presetTogglePath = ['device','screenAuxGroupList','items','S1','control','pp','copyMode']
    static override readonly xUpdatePath = '"device","screenAuxGroupList","control","pp","xUpdate"' // livepremier4
}
