import {
	CompanionActionSchemaWithoutResult,
	CompanionActionSchemaWithResult,
	CompanionFeedbackSchema,
	CompanionOptionValues,
	CompanionPresetDefinitions,
	CompanionVariableDefinitions,
	CompanionVariableValues,
	JsonValue,
	combineRgb,
	InstanceBase,
	InstanceStatus,
	SomeCompanionConfigField,
} from '@companion-module/base'
import { AWJconnection } from './connection.js'
import { AWJdevice } from './awjdevice/awjdevice.js'
import { Config, GetConfigFields } from './config.js'
import { initVariables, TrackedVariable } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { StateMachine } from './state.js'
import Constants from './awjdevice/constants.js'
import ConstantsLivepremier from './livepremier/constants.js'
import ConstantsLivepremier4 from './livepremier4/constants.js'
import ConstantsMidra from './midra/constants.js'
import Choices from './awjdevice/choices.js'
import ChoicesLivepremier from './livepremier/choices.js'
import ChoicesLivepremier4 from './livepremier4/choices.js'
import ChoicesMidra from './midra/choices.js'
import Actions from './awjdevice/actions.js'
import ActionsLivepremier from './livepremier/actions.js'
import ActionsLivepremier4 from './livepremier4/actions.js'
import ActionsMidra from './midra/actions.js'
import Feedbacks from './awjdevice/feedback.js'
import FeedbacksLivepremier from './livepremier/feedback.js'
import FeedbacksLivepremier4 from './livepremier4/feedback.js'
import FeedbacksMidra from './midra/feedback.js'
import Presets from './awjdevice/presets.js'
import PresetsLivepremier from './livepremier/presets.js'
import PresetsLivepremier4 from './livepremier4/presets.js'
import PresetsMidra from './midra/presets.js'
import Subscriptions from './awjdevice/subscriptions.js'
import SubscriptionsLivepremier from './livepremier/subscriptions.js'
import SubscriptionsLivepremier4 from './livepremier4/subscriptions.js'
import SubscriptionsMidra from './midra/subscriptions.js'
export const regexAWJpath = '^DeviceObject(?:\\/(@items|@props|\\$?[A-Za-z0-9_-]+))+$'

/**
 * This the general setup of this module:
 * 1. When module is instanciated, init is called
 * 2. in init an AWJconnection is created and AWJconnection.connect is called
 * 3. AWJconnection tries to connect to webserver and if it succeeds it calls AWJinstance.createDevice  
 *    the created device will hold the internal state and has all the methods to manipulate the state, get the right data out of state and to provide actions, feedbacks and so on
 * 4. AWJconnection opens the websocket connection to the webserver and hooks all incoming messges to be applied to the internal state
 * 5. AWJconnection downloads the state object from the API and calls AWJinstance.handleApiStateResponse with it
 * 6. handleApiStateResponse will call initSubscriptions, which sets up a lot of feedbacks, choices, variables, presets...
 * Done
 * 
 * This module uses several classes:
 * @class AWJinstance - the Companion class for the module instance derived from InstanceBase
 * @class AWJconnection - methods for connecting to an AWJ device with REST and websocket
 * @class AWJState - methods of holding and manipulating state
 * @class AWJdevice - actually doing all the stuff needed for Companion, derived from State
 * @class AWJLivePremier - derived from AWJdevice, overriding some stuff for LivePremier devices up to v3
 * @class AWJLivePremier4 - derived from AWJdevice, overriding some stuff for LivePremier devices with v4
 * @class AWJMidra - derived from AWJdevice, overriding some stuff for Midra and Alta devices
 */

/**
 * Manifest of the schema for this instance. Actions, feedbacks and variables are kept loosely typed
 * (the permissive default shape) since this module builds its option definitions dynamically per platform.
 */
export type AWJInstanceSchema = {
	config: Config
	secrets: undefined
	actions: Record<string, CompanionActionSchemaWithoutResult<CompanionOptionValues> | CompanionActionSchemaWithResult<CompanionOptionValues, JsonValue>>
	feedbacks: Record<string, CompanionFeedbackSchema<CompanionOptionValues>>
	variables: CompanionVariableValues
}

/**
 * Companion instance class for the Analog Way AWJ API products.
 */
export class AWJinstance extends InstanceBase<AWJInstanceSchema> {
	/**
	 * Create an instance of an AWJ module.
	 */
	public state!: StateMachine

	/** holds all constants for this particular type of device */
    constants!: typeof Constants

    /** reference to the connection with the device */
    public connection!: AWJconnection

    /** generates lists and choices from current state */
    public choices!: Choices

    /** holds action definitions */
    private actions!: Actions

    /** holds feedback definitions */
    private feedbacks!: Feedbacks

    /** holds preset definitions */
    private presets!: Presets

    /** holds subscription definitions and checks incoming data against them */
    public subscriptions!: Subscriptions

	/** @deprecated device class */
	public device!: AWJdevice
	
	/** variables storage */
	private variables!: TrackedVariable[]
	
	/** the instance configuration */
	public config!: Config
	private oldlabel = ''
	public isRecording = false

	/**
	 * FIFO queues backing serialize() below - one chained Promise per key (a Screen/Aux id, e.g. "S1"/"A2"),
	 * so a serialize() call only ever waits for PRIOR calls that touched at least one of the same keys.
	 */
	private actionQueues = new Map<string, Promise<unknown>>()

	/**
	 * Runs `fn` only after every previously-serialize()'d call sharing at least one of `keys` has finished (or
	 * errored) - guaranteeing FIFO execution order for actions that touch the same Screen(s)/Aux(es), while
	 * leaving actions on unrelated screens completely independent. Added (2026-08-28) because Companion's own
	 * default action-list execution is CONCURRENT (fires every action in a button's list at once, not one after
	 * another), and only an explicit "Sequential" Action Group actually waits for one action before starting
	 * the next. Without this, an async action like "Recall Screen Memory" that awaits the device's confirmation
	 * before returning would NOT reliably precede a following "Take" on the very same button unless the user
	 * manually wrapped both in a Sequential Action Group - not something a normal user should need to know or
	 * do for a sequence as basic as "load a memory, then take it".
	 *
	 * `keys` MUST be the actual Screen/Aux id(s) the action targets (e.g. `['S1']`, or `['S1','A2']` for
	 * something spanning several at once like Recall Master Memory) - NEVER a single fixed key for the whole
	 * module. This is a hard requirement, not an optimization: with a real Aquilon, multiple operators commonly
	 * control different Screens through the same Companion instance at once (e.g. one running a livestream
	 * output, another an LED wall) - a 20-second "Wait for Transition Completion" on one operator's Screen
	 * must NEVER hold up an unrelated action on a different Screen. A single shared key was tried first and
	 * explicitly rejected by the user once this cross-operator scenario came up: "ein screen darf niemals von
	 * einer laufenden transition eines anderen screens abhängig sein."
	 *
	 * Relies on Companion still CALLING each action's callback in the button's authored order even though it
	 * doesn't await between them (true as long as it kicks them off via something like
	 * `actions.map(a => run(a))` before racing their promises) - each callback enqueues itself onto the shared
	 * chain(s) synchronously, before its own first `await`, so the enqueue order matches the call order even
	 * though the actual work happens later. A rejected `fn` does not poison the queue for subsequent calls.
	 */
	public serialize<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
		const uniqueKeys = [...new Set(keys)]
		const prior = Promise.all(uniqueKeys.map((key) => this.actionQueues.get(key) ?? Promise.resolve()))
		const result = prior.then(fn, fn)
		const settled = result.then(
			() => undefined,
			() => undefined
		)
		for (const key of uniqueKeys) {
			this.actionQueues.set(key, settled)
		}
		return result
	}

	constructor(system: unknown) {
		super(system)
		this.instanceOptions.disableVariableValidation = true
	}

	/**
	 * Main initialization function called once the module
	 * is OK to start doing things.
	 */
	public async init(config: Config): Promise<void> {
		this.updateStatus(InstanceStatus.Disconnected, 'Init')

		this.config = config
		this.oldlabel = this.label
		this.variables = []
		this.state = new StateMachine(this)
		this.connection = new AWJconnection(this)

		this.setDevice('awjdevice') // initialize all Companion Bits with the generic AWJ device, while it is still unclear which device we'll connect to

		if (this.config.deviceaddr === undefined) {
			// config never been set?
			console.log('brand new config')
			this.config.deviceaddr = 'http://192.168.2.140'
			this.config.macaddress = ''
			this.config.sync = true
			this.config.showDisabled = false
			this.config.color_bright = 16777215
			this.config.color_dark = 2239025
			this.config.color_highlight = combineRgb(24,111,173)
			this.config.color_green = combineRgb(0,203,56)
			this.config.color_greendark = combineRgb(0,115,27)
			this.config.color_greengrey = combineRgb(45,79,49)
			this.config.color_red = combineRgb(213,0,0)
			this.config.color_reddark = combineRgb(82,0,0)
			this.config.color_redgrey = combineRgb(79,31,31)
			this.config.useOldVariableNames = false
			this.config.allowLiveThumbnails = true
			this.saveConfig(this.config)
		}

		this.variables = initVariables(this)
		this.updateVariableDefinitions(this.variables)
		this.setVariableValues({connectionLabel: this.label})

		// Publish the generic (platform-unknown) action/feedback/preset set immediately, before attempting to
		// connect - previously this only ever happened deep inside connection.ts's post-connect success path,
		// so if the device was never reachable (powered off, wrong address) NO actions existed at all,
		// including "Device - Power"'s Wake-on-LAN option - the one action that specifically needs to work
		// while the device is unreachable. Safe against a completely empty state (confirmed 2026-08-28): every
		// choice-list builder already falls back to a "No X configured" placeholder (see placeholderIfEmpty()
		// in choices.ts) instead of an empty/crashing list. setDevice('awjdevice') above already instantiated
		// the generic Actions/Feedbacks/Presets classes, which is what makes this available here - once a real
		// platform is detected after connecting, updateInstance() runs again with the real, richer action set.
		await this.updateInstance()

		this.connection.connect(this.config.deviceaddr)
		//this.device = new AWJdevice(this.state, this.connection)
	}

	/**
	 * Sets all the device dependent members to match the real device.  
	 * @param platform name of the platform or generic awjdevice if no match
	 */
	setDevice(platform: string): void {
		if (platform !== this.state.platform) {
			this.state.platform = platform
			switch (platform) {
				case 'livepremier':
					this.constants = ConstantsLivepremier // instanciate first because other classes may need the constants
					this.choices = new ChoicesLivepremier(this) // instanciate second because actions/feedbacks need choices
					this.actions = new ActionsLivepremier(this)
					this.feedbacks = new FeedbacksLivepremier(this)
					this.presets = new PresetsLivepremier(this)
					this.subscriptions = new SubscriptionsLivepremier(this)
					break

				case 'livepremier4':
					this.constants = ConstantsLivepremier4 // instanciate first because other classes may need the constants
					this.choices = new ChoicesLivepremier4(this) // instanciate second because actions/feedbacks need choices
					this.actions = new ActionsLivepremier4(this)
					this.feedbacks = new FeedbacksLivepremier4(this)
					this.presets = new PresetsLivepremier4(this)
					this.subscriptions = new SubscriptionsLivepremier4(this)
					break

				case 'midra':
					this.constants = ConstantsMidra // instanciate first because other classes may need the constants
					this.choices = new ChoicesMidra(this) // instanciate second because actions/feedbacks need choices
					this.actions = new ActionsMidra(this)
					this.feedbacks = new FeedbacksMidra(this)
					this.presets = new PresetsMidra(this)
					this.subscriptions = new SubscriptionsMidra(this)
					break
			
				default:
					this.constants = Constants // instanciate first because other classes may need the constants
					this.choices = new Choices(this) // instanciate second because actions/feedbacks need choices
					this.actions = new Actions(this)
					this.feedbacks = new Feedbacks(this)
					this.presets = new Presets(this)
					this.subscriptions = new Subscriptions(this)
					break
			}
			this.log('debug', 'switched to platform ' + platform)
		}
	}

	/**
	 * Clean up the instance before it is destroyed.
	 */
	public async destroy(): Promise<void> {
		this.state.clearTimers()
		this.connection.destroy()

		this.log('debug' ,'destroy '+this.id)
	}

	/**
	 * Creates the configuration fields for instance config.
	 */
	public getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/**
	 * Process an updated configuration array.
	 */
	public async configUpdated(config: Config): Promise<void> {
		// console.log('Config Update called', this.oldlabel, this.label)
		const oldconfig = {  ...this.config }
		this.config = config

		if (this.config.deviceaddr !== oldconfig.deviceaddr) {
			// new address, reconnect
			this.updateStatus(InstanceStatus.Connecting)
			this.connection.disconnect()
			this.connection.connect(this.config.deviceaddr)
		}
		if (this.config.allowLiveThumbnails !== oldconfig.allowLiveThumbnails) {
			if (!this.config.allowLiveThumbnails) {
				// stop instantly, not just "stop showing" - tears down the actual HTTP polling, not just the
				// button image, since the point of the toggle is to cut the load, not just hide the result
				this.feedbacks.stopAllThumbnailPollers()
			} else {
				// re-registers every existing "Show Thumbnail" feedback's poller (callback is idempotent)
				this.checkFeedbacks('deviceThumbnail')
			}
		}
		if (
			this.label !== this.oldlabel ||
			this.config.showDisabled !== oldconfig.showDisabled ||
			this.config.color_bright !== oldconfig.color_bright || 
			this.config.color_dark !== oldconfig.color_dark || 
			this.config.color_green !== oldconfig.color_green || 
			this.config.color_greendark !== oldconfig.color_greendark || 
			this.config.color_greengrey !== oldconfig.color_greengrey|| 
			this.config.color_red !== oldconfig.color_red || 
			this.config.color_reddark !== oldconfig.color_reddark || 
			this.config.color_redgrey !== oldconfig.color_redgrey|| 
			this.config.color_highlight !== oldconfig.color_highlight
			) {
				await this.updateInstance()
		}
		this.oldlabel = this.label

	}

	/**
	 * @description sets actions, variables, presets and feedbacks available for this instance
	 */
	public async updateInstance(): Promise<void> {

		this.log('debug', 'updating instance')

		this.setFeedbackDefinitions(this.feedbacks.allFeedbacks)
		this.setActionDefinitions(this.actions.allActions)
		// cast: presets/actions/feedbacks are intentionally kept loosely typed (see AWJInstanceSchema), so the
		// preset structure's nested references to them don't line up 1:1 with this specific schema instantiation
		this.setPresetDefinitions(this.presets.presetStructure, this.presets.allPresets as CompanionPresetDefinitions<AWJInstanceSchema>)
		this.setVariableValues({ connectionLabel: this.label })

		let preset: string,
				vartext = 'PGM'
		if (this.state.syncSelection) {
			preset = this.state.get('REMOTE/live/screens/presetModeSelection/presetMode')
		} else {
			preset = this.state.get('LOCAL/presetMode')
		}
		if (preset === 'PREVIEW') {
			vartext = this.config.useOldVariableNames ? 'PVW' : 'PRW'
		}
		this.setVariableValues({ selectedPreset: vartext })
	}

	connectDevice(): void {
		const address = this.config.deviceaddr
		this.connection.connect(address)
	}

	handleStartStopRecordActions(isRecording: boolean): void {
		this.isRecording = isRecording
	}

	/**
	 * updates the variable definitions of this instance with the values of this.variables or the optional parameter
	 * @param variables 
	 */
	public updateVariableDefinitions(variables = this.variables) {
		// make set with unique variableIds
		const varIds = new Set(variables.map(variable => variable.variableId))
		const vars: CompanionVariableDefinitions<CompanionVariableValues> = {}
		varIds.forEach(varId => {
			vars[varId] = { name: variables.find(vari => vari.variableId === varId)?.name ?? '' }
		})
		this.setVariableDefinitions(vars)
	}

	/**
	 * Adds a custom variable to the internal list of variables from this instance  
	 * the same variableId can be added by multiple Id, it will be exposed only once and only removed when the last Id removes it
	 * @param {Object} newVariable - Object with the new variable
	 * @param {string} newVariable.id - ID of the variable, e.g. the ID of the feedback generating it, not exposed to user.
	 * @param {string} newVariable.variableId - unique to the instance ID of the variable with which the user can reference it.
	 * @param {string} newVariable.name - human readable description of the variable's content.
	 * @returns 
	 */
	public addVariable(newVariable: TrackedVariable): void {
		if (this.variables.some(variable => variable.id === newVariable.id && variable.variableId === newVariable.variableId)) {
			// already registered by this same id, nothing to do (feedbacks may call this on every check, not just once)
			return
		}
		this.variables.push(newVariable)
		if (this.variables.some(variable => (variable.variableId === newVariable.variableId && variable.id !== newVariable.id))) { // the variable already exists from another id
			return
		} else {
			this.updateVariableDefinitions()
		}
	}

	/**
	 * Removes a custom variable from the internal list of variables from this instance
	 * @param id internal ID of the variable to remove
	 * @param remVariable variableId of the variable to remove, if undefined remove all variables from that ID
	 */
	public removeVariable(id: string, remVariable?: string): void {
		if (remVariable === undefined && this.variables.findIndex(vari => vari.id === id) != -1) {
			const newvars = this.variables.filter(vari => vari.id !== id)
			this.variables = newvars
			this.updateVariableDefinitions()
		} else if (this.variables.findIndex(vari => (vari.id === id && vari.variableId === remVariable)) != -1) {
			const newvars = this.variables.filter(vari => !(vari.id === id && vari.variableId === remVariable))
			this.variables = newvars
			this.updateVariableDefinitions()
		}
	}

	/**
	 * Switches sync on or off
	 * @param action 0: switch off, 1: switch on, 2: toggle, 3: resend local sync state
	 * @param attempt internal retry counter - do not pass this in from calling code
	 */
	public switchSync(action: number, attempt = 0): void {
		const clients = this.state.get('REMOTE/system/network/websocketServer/clients')
		// this.log('debug', 'REMOTE ' + JSON.stringify(this.device.get('REMOTE')))
		const myid: string = this.state.get('LOCAL/socketId')
		// The REMOTE client list and our own socket id only arrive via the websocket's separate,
		// asynchronous INIT message, which races against the REST-based device state download that
		// triggers this call right after connect - so either can still be missing here. Retry briefly
		// instead of crashing (clients undefined) or silently sending a broken path (myid not found yet).
		if (!Array.isArray(clients) || !myid) {
			if (attempt < 10) {
				setTimeout(() => this.switchSync(action, attempt + 1), 300)
			} else {
				this.log('warn', 'Could not enable/disable remote sync selection: REMOTE client list never became available')
			}
			return
		}
		let syncstate: boolean
		const myindex = clients.findIndex((elem: Record<string, unknown>) => {
			if (elem.id === myid) {
				return true
			} else {
				return false
			}
		})
		if (myindex === -1) {
			if (attempt < 10) {
				setTimeout(() => this.switchSync(action, attempt + 1), 300)
			} else {
				this.log('warn', 'Could not enable/disable remote sync selection: own client id not found in REMOTE client list')
			}
			return
		}
		switch (action) {
			case 0:
				syncstate = false
				break
			case 1:
				syncstate = true
				break
			case 2:
				if (this.state.get(`REMOTE/system/network/websocketServer/clients/${myindex}/isRemoteSelectionEnabled`)) {
					syncstate = false
				} else {
					syncstate = true
				}
				break
			case 3:
				if (this.state.syncSelection) {
					syncstate = true
				} else {
					syncstate = false
				}
				break
			default:
				syncstate = false
				break
		}
		this.state.set('LOCAL/syncSelection', syncstate)
		this.connection.sendRawWSmessage(
			`{"channel":"REMOTE","data":{"name":"enableRemoteSelection","path":"/system/network/websocketServer/clients/${myindex}","args":[${syncstate}]}}`
		)
	}

	/**
	 * Sends a global update command
	 * @param platform 
	 */
	sendXupdate(): void {
        this.connection.sendRawWSmessage(`{"channel":"DEVICE","data":{"path":[${this.constants.xUpdatePath}],"value":false}}`)
        this.connection.sendRawWSmessage(`{"channel":"DEVICE","data":{"path":[${this.constants.xUpdatePath}],"value":true}}`)
	}

	/**
	 * AWJ paths have some differences to JSON paths and the internal object, this function converts AWJ to JSON path.
	 * Additionally it converts PGM and PVW/PRW to the actual preset which is on program or preview (A or B)
	 * @param awjPath the AWJ path as a string
	 * @returns an array containing the path components of a JSON path
	 */
	AWJtoJsonPath(awjPath: string): string[] {
		if (awjPath.match(new RegExp(regexAWJpath)) === null) {
			return []
		}
		const parts = awjPath.split('/')
		for (let i = 0; i < parts.length; i += 1) {
			parts[i] = parts[i].replace(/^\$(\w+)/, '$1List')
			parts[i] = parts[i].replace(/^@props$/, 'pp')
			parts[i] = parts[i].replace(/^@items$/, 'items')
			parts[i] = parts[i].replace(/^DeviceObject$/, 'device')
		}
		if (
			parts[1] === 'screenList' &&
			parts[2] === 'items' &&
			parts[4] === 'presetList' &&
			parts[5] === 'items' &&
			parts[6].toLowerCase() === 'pgm'
		) {
			if (this.state.get(`LOCAL/screens/S${parts[3].replace(/\D/g, '')}/pgm/preset`)) {
				parts[6] = this.state.get(`LOCAL/screens/S${parts[3].replace(/\D/g, '')}/pgm/preset`)
				if (this.state.platform === 'midra') parts[6] = parts[6].replace('A', 'DOWN').replace('B', 'UP')
			}
		} else if (
			parts[1] === 'screenList' &&
			parts[2] === 'items' &&
			parts[4] === 'presetList' &&
			parts[5] === 'items' &&
			['pvw', 'prw', 'prv'].includes(parts[6].toLowerCase())
		) {
			if (this.state.get(`LOCAL/screens/S${parts[3].replace(/\D/g, '')}/pvw/preset`)) {
				parts[6] = this.state.get(`LOCAL/screens/S${parts[3].replace(/\D/g, '')}/pvw/preset`)
				if (this.state.platform === 'midra') parts[6] = parts[6].replace('A', 'DOWN').replace('B', 'UP')
			}
		} else if (
			parts[1] === 'auxiliaryList' &&
			parts[2] === 'items' &&
			parts[4] === 'presetList' &&
			parts[5] === 'items' &&
			parts[6].toLowerCase() === 'pgm'
		) {
			if (this.state.get(`LOCAL/screens/A${parts[3].replace(/\D/g, '')}/pgm/preset`)) {
				parts[6] = this.state.get(`LOCAL/screens/S${parts[3].replace(/\D/g, '')}/pgm/preset`)
				if (this.state.platform === 'midra') parts[6] = parts[6].replace('A', 'DOWN').replace('B', 'UP')
			}
		} else if (
			parts[1] === 'auxiliaryList' &&
			parts[2] === 'items' &&
			parts[4] === 'presetList' &&
			parts[5] === 'items' &&
			['pvw', 'prw', 'prv'].includes(parts[6].toLowerCase())
		) {
			if (this.state.get(`LOCAL/screens/A${parts[3].replace(/\D/g, '')}/pvw/preset`)) {
				parts[6] = this.state.get(`LOCAL/screens/S${parts[3].replace(/\D/g, '')}/pvw/preset`)
				if (this.state.platform === 'midra') parts[6] = parts[6].replace('A', 'DOWN').replace('B', 'UP')
			}
		} else if (
			parts[1] === 'auxiliaryScreenList' &&
			parts[2] === 'items' &&
			parts[4] === 'presetList' &&
			parts[5] === 'items' &&
			parts[6].toLowerCase() === 'pgm'
		) {
			if (this.state.get(`LOCAL/screens/A${parts[3].replace(/\D/g, '')}/pgm/preset`)) {
				parts[6] = this.state.get(`LOCAL/screens/A${parts[3].replace(/\D/g, '')}/pgm/preset`)
				if (this.state.platform === 'midra') parts[6] = parts[6].replace('A', 'DOWN').replace('B', 'UP')
			}
		} else if (
			parts[1] === 'auxiliaryScreenList' &&
			parts[2] === 'items' &&
			parts[4] === 'presetList' &&
			parts[5] === 'items' &&
			['pvw', 'prw', 'prv'].includes(parts[6].toLowerCase())
		) {
			if (this.state.get(`LOCAL/screens/A${parts[3].replace(/\D/g, '')}/pvw/preset`)) {
				parts[6] = this.state.get(`LOCAL/screens/A${parts[3].replace(/\D/g, '')}/pvw/preset`)
				if (this.state.platform === 'midra') parts[6] = parts[6].replace('A', 'DOWN').replace('B', 'UP')
			}
		}
		return parts
	}

	/**
	 * AWJ paths have some differences to JSON paths and the internal object, this function converts JSON to AWJ path.
	 * Additionally it converts A and B presets to pgm or pvw (program or preview)
	 * @param jsonPath the json path
	 * @returns a string with the AWJ path
	 */
	jsonToAWJpath(jsonPath: string | string[]): string {
		let tpath: string
		if (Array.isArray(jsonPath)) {
			tpath = jsonPath.join('/')
		} else {
			tpath = jsonPath
		}
		tpath = tpath.replace(/\/(\w+)List\/items\//g, '/$$$1/@items/')
		tpath = tpath.replace(/\/pp\//g, '/@props/')
		tpath = tpath.replace(/^device\//, 'DeviceObject/')
		const apath = tpath.split('/')
		if ((apath[1] === '$screen' || apath[1] === '$auxiliary' || apath[1] === '$auxiliaryScreen') && apath[2] === '@items' && apath[4] === '$preset' && apath[5] === '@items') {
			if (this.state.get(`LOCAL/screens/${apath[3]}/pgm/preset`) === apath[6]) {
				apath[6] = 'pgm'
			} else {
				apath[6] = 'pvw'
			}
		}
		return apath.join('/')
	}
}

export { UpgradeScripts }
export default AWJinstance
