import { VirtualDOM } from '@youwol/flux-view'
import { Context, ContextLoggerTrait } from '@youwol/logging'
import { InstallInputs } from '@youwol/cdn-client'
import { BehaviorSubject, Observable } from 'rxjs'

import {
    ExecutionJournal,
    Immutable,
    DocumentationTrait,
    ToolBox,
    mergeWith,
    EnvironmentTrait,
} from '../common'
import { Configurations, Deployers, Connections } from '..'
import { ImplementationTrait, moduleConnectors } from './'
import * as IOs from './IOs'

/**
 * Helper function to generate uuidv4.
 */
export function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        function (c) {
            const r = (Math.random() * 16) | 0,
                v = c == 'x' ? r : (r & 0x3) | 0x8
            return v.toString(16)
        },
    )
}

/**
 * Module's declaration.
 */
export type Declaration = Partial<DocumentationTrait> & {
    /**
     * Unique id of the type of module (within the toolbox associated).
     */
    typeId: string
    /**
     * Dependencies of the module that need to be installed before being able to instantiate it {@link Implementation}.
     */
    dependencies?: InstallInputs
}

/**
 * The context part of the message that is usually propagated from module to module.
 */
export type MessageContext = {
    [k: string]: unknown
}

/**
 * Helper function to (deep) merge {@link MessageContext}.
 *
 * @param ctx list of {@link MessageContext} to merge.
 */
export function mergeMessagesContext(...ctx: MessageContext[]) {
    const context = {}
    ctx.filter((c) => c != undefined).reduce((acc, e) => {
        mergeWith(context, e)
        return context
    }, context)
    return context
}

/**
 * Message emitted from {@link InputSlot.rawMessage$}.
 *
 * @typeParam TData the type of the data part of the message.
 */
export type InputMessage<TData = unknown> = Connections.Message<TData> & {
    configuration?: Connections.JsonMap
}

/**
 * Message emitted from {@link OutputSlot.observable$}
 *
 * @typeParam TData the type of the data part of the message.
 */
export type OutputMessage<TData = unknown> = {
    data: Immutable<TData>
    context: MessageContext
}

/**
 * Messages emitted from {@link InputSlot.preparedMessage$}.
 *
 * @typeParam TData the type of the data part of the message.
 * @typeParam TConfigInstance the type of the module's instantiated configuration part of the message.
 */
export type ProcessingMessage<TData = unknown, TConfigInstance = unknown> = {
    data: Immutable<TData>
    context: MessageContext
    configuration: Immutable<TConfigInstance>
    scope: Scope
}

/**
 * Type alias for modules' inputs as provided by the developer ({@link UserArgs}).
 * It is a mapping where the keys are the input's id, and the values the
 * {@link Input} specification.
 */
export type InputsMap<TInputs> = {
    [Property in keyof TInputs]: TInputs[Property] extends IOs.Input
        ? TInputs[Property]
        : never
}

/**
 * Parameters required to define a module's implementation.
 *
 * @typeParam TSchema The type of the schema associated to the configuration of the module.
 * @typeParam TInputs The type of the inputs map.
 * @typeParam TState The type of the (optional) state associated to the module.
 */
export type UserArgs<
    TSchema extends Configurations.Schema,
    TInputs = Record<string, IOs.Input>,
    TState = NoState,
> = {
    /**
     * Module's configuration model.
     */
    configuration: Immutable<Configurations.Configuration<TSchema>>
    /**
     * Module's inputs.
     */
    inputs?: Immutable<InputsMap<TInputs>>
    /**
     * Module's outputs.
     */
    outputs?: OutputsMapper<TSchema, TInputs, TState>

    /**
     * If provided, the module will use this journal to log information.
     * Enable logging information related to the module prior to module construction.
     */
    journal?: ExecutionJournal

    /**
     * Module's representation in the 3D canvas.
     */
    canvas?: (
        instance: ImplementationTrait<TSchema, TInputs, TState>,
        config?: unknown,
    ) => VirtualDOM

    /**
     * Module's representation as HTML element
     */
    html?: (
        instance: ImplementationTrait<TSchema, TInputs, TState>,
        config?: unknown,
    ) => VirtualDOM
    /**
     * Module's state
     */
    state?: TState

    /**
     * Eventual {@link Projects.InstancePool} associated to the module.
     * Relevant if for instance the module needs to deploy other children modules.
     */
    instancePool?:
        | Immutable<Deployers.DeployerTrait>
        | BehaviorSubject<Immutable<Deployers.DeployerTrait>>
}

/**
 * Generic type of {@link Input}, or never if not possible.
 * @typeParam Type IOs.Input type
 */
export type GetGenericInput<Type> = Type extends IOs.Input<infer X> ? X : never

/**
 * Generic type of Observable, or never if not possible.
 * @typeParam Type IOs.Input type
 */
export type GetGenericObservable<Type> = Type extends Observable<infer X>
    ? X
    : never

/**
 * Alias for a module with no associated state.
 */
export type NoState = never

/**
 * Argument of the {@link OutputsMapper}.
 *
 * @typeParam TSchema The type of the schema associated to the configuration of the module.
 * @typeParam TInputs The type of the inputs map.
 * @typeParam TState The type of the (optional) state associated to the module.
 */
export type OutputMapperArg<
    TSchema extends Configurations.Schema,
    TInputs,
    TState = NoState,
> = {
    /**
     * The inputs' observables as an object with key being the inputs' id and values the associated observables.
     * The observable convey message of type {@link ProcessingMessage}.
     */
    inputs: {
        [Property in keyof TInputs]: Observable<
            ProcessingMessage<
                GetGenericInput<TInputs[Property]>,
                Configurations.ConfigInstance<TSchema>
            >
        >
    }
    /**
     * The eventual state associated to the module.
     */
    state: Immutable<TState>
    /**
     * An object used to log information in the contructor's journal of the module
     */
    logContext: Context
    /**
     * The static configuration: the module's configuration when loaded.
     */
    configuration: Immutable<Configurations.ConfigInstance<TSchema>>
}

/**
 * Outputs of a module: a function that essentially map the
 * available inputs (provided as Observables) to one or more outputs (Observables as well).
 *
 * Precisely, the function takes a single argument {@link OutputMapperArg} and return a javascript object
 * in which the keys are the id of the outputs, and the values the associated observables.
 *
 * @typeParam TSchema The type of the schema associated to the configuration of the module.
 * @typeParam TInputs The type of the inputs map.
 * @typeParam TState The type of the (optional) state associated to the module.
 */
export type OutputsMapper<
    TSchema extends Configurations.Schema,
    TInputs = Record<string, IOs.Input>,
    TState = NoState,
> = ({
    inputs,
    state,
    logContext,
    configuration,
}: OutputMapperArg<TSchema, TInputs, TState>) => {
    [k: string]: Observable<OutputMessage>
}

/**
 * Shorthand notation of `ReturnType<OutputsMapper<TSchema, TInputs>>`
 */
export type OutputsReturn<
    TSchema extends Configurations.Schema,
    TInputs = Record<string, IOs.Input>,
> = ReturnType<OutputsMapper<TSchema, TInputs>>

/**
 * A scope gathers immutable data related to the parent instance of modules.
 * It is used for instance when deploying using {@link Projects.InstancePool}.
 */
export type Scope = Immutable<{ [k: string]: unknown }>

/**
 * 'System' arguments that needs to be propagated to the module.
 */
export type ForwardArgs = {
    /**
     * Module's factory
     */
    factory: Module<ImplementationTrait>

    /**
     * Owning toolbox
     */
    toolbox: ToolBox

    /**
     * Module's uid
     */
    uid?: string
    /**
     * Module's configuration instance: values included
     * here overrides the default one of the module.
     */
    configurationInstance?: { [_k: string]: unknown }
    /**
     * Run time environment
     */
    environment: Immutable<EnvironmentTrait>

    /**
     * {@link Scope} associated to the module
     */
    scope: Scope

    /**
     * Context for logging purposes
     */
    context: ContextLoggerTrait
}

/**
 * Implementation of a module.
 *
 * @typeParam TSchema The type of the schema associated to the configuration of the module.
 * @typeParam TInputs The type of the {@link InputsMap}.
 * @typeParam TState The type of the (optional) state associated to the module.
 */
export class Implementation<
    TSchema extends Configurations.Schema,
    TInputs = Record<string, IOs.Input>,
    TState = NoState,
> implements ImplementationTrait<TSchema, TInputs, TState>
{
    /**
     * Factory of the module, can be used for instance to duplicate a module
     *
     * @group Immutable Properties
     */
    public readonly factory: Module

    /**
     * `typeId` of the module within its toolbox.
     */
    public readonly typeId: string

    /**
     * Parent's toolbox id
     */
    public readonly toolboxId: string

    /**
     * Parent's toolbox id
     */
    public readonly toolboxVersion: string

    /**
     * uid of the module, see {@link UidTrait}
     *
     * @group Immutable Properties
     */
    public readonly uid: string = uuidv4()
    /**
     * Environment
     *
     * @group Immutable Properties
     */
    public readonly environment: Immutable<EnvironmentTrait>
    /**
     * Configuration of the module, as defined by the developer in {@link UserArgs}
     *
     * @group Immutable Properties
     */
    public readonly configuration: Immutable<
        Configurations.Configuration<TSchema>
    >
    /**
     * The static configuration instance. This is the model extracted from the declared module's configuration
     * and merged with eventual properties of `configurationInstance` of {@link ForwardArgs} at module's creation time.
     *
     * @group Immutable Properties
     */
    public readonly configurationInstance: Immutable<
        Configurations.ConfigInstance<TSchema>
    >
    /**
     * Inputs of the module as provided by the developer
     *
     * @group Immutable Properties
     */
    public readonly inputs: Immutable<{
        [Property in keyof TInputs]: TInputs[Property]
    }>
    /**
     * Outputs of the module as provided by the developer
     *
     * @group Immutable Properties
     */
    public readonly outputs?: OutputsMapper<TSchema, TInputs, TState> =
        () => ({})

    /**
     * Inputs slots of the module: provides handle on the actual observables
     *
     * @group Immutable Properties
     */
    public readonly inputSlots: Immutable<{
        [Property in keyof TInputs]: IOs.InputSlot<
            GetGenericInput<TInputs[Property]>,
            Configurations.ConfigInstance<TSchema>
        >
    }>

    /**
     * Outputs slots of the module: provides handle on the actual observables
     *
     * @group Immutable Properties
     */
    public readonly outputSlots: Immutable<{
        [Property in keyof OutputsReturn<TSchema, TInputs>]: IOs.OutputSlot<
            GetGenericObservable<OutputsReturn<TSchema, TInputs>[Property]>
        >
    }>

    /**
     * Scope associated to the module
     */
    public readonly scope: Scope

    /**
     * Execution journal, see {@link ExecutionJournal}
     * Providing the `journal` attribute in {@link UserArgs} allows the module to continue logging
     * in the consumer defined journal, otherwise the {@link Implementation.constructor} creates one.
     * @group Immutable Properties
     */
    public readonly journal: ExecutionJournal

    /**
     * The state of the module, if any provided by the developer
     *
     * @group Immutable Properties
     */
    public readonly state?: Immutable<TState>

    /**
     * A runtime associated to the module, if any provided by the developer.
     *
     */
    public readonly instancePool$?: BehaviorSubject<
        Immutable<Deployers.DeployerTrait>
    >

    public readonly canvas?: (config?) => VirtualDOM
    public readonly html?: (config?) => VirtualDOM

    /**
     *
     * @param params Arguments provided by the developer of the module
     * @param fwdParameters Arguments provided by the system and propagated here (from {@link Module.getInstance})
     */
    constructor(
        params: UserArgs<TSchema, TInputs, TState>,
        fwdParameters: ForwardArgs,
    ) {
        Object.assign(this, params, fwdParameters)
        this.typeId = this.factory.declaration.typeId
        this.toolboxId = fwdParameters.toolbox.uid
        if (Deployers.implementsDeployerTrait(params.instancePool)) {
            this.instancePool$ = new BehaviorSubject<
                Immutable<Deployers.DeployerTrait>
            >(params.instancePool)
        }
        if (
            params.instancePool &&
            params.instancePool instanceof BehaviorSubject
        ) {
            this.instancePool$ = params.instancePool
        }
        this.html = params.html && ((config) => params.html(this, config))
        this.canvas = params.canvas && ((config) => params.canvas(this, config))

        this.uid = this.uid || uuidv4()
        this.journal =
            this.journal ||
            new ExecutionJournal({
                logsChannels: fwdParameters.environment.logsChannels,
            })
        const context = this.journal.addPage({
            title: 'constructor',
            context:
                fwdParameters.context instanceof Context
                    ? fwdParameters.context.startChild(
                          'Implementation.constructor',
                      )
                    : undefined,
        })
        context.info('Parameters', { userParams: params, fwdParameters })
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- pass the ts compiler but IDE report an error
        // @ts-ignore
        this.configurationInstance = extractConfigWith(
            {
                configuration: this.configuration,
                values: fwdParameters.configurationInstance,
            },
            context,
        )

        const { inputSlots, outputSlots } = moduleConnectors<
            TSchema,
            TInputs,
            TState
        >({
            moduleUid: this.uid,
            state: this.state,
            inputs: this.inputs,
            outputs: this.outputs,
            executionJournal: this.journal,
            defaultConfiguration: this.configuration,
            staticConfiguration: fwdParameters.configurationInstance,
            scope: this.scope,
            context,
        })
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- A type A should be assignable to Immutable<A>
        // @ts-ignore
        this.inputSlots = inputSlots
        this.outputSlots = outputSlots
        context.end()
    }
}

/**
 * Module specification: union of a {@link Declaration} and an {@link Implementation}.
 *
 * Used for instance to specifies modules within Toolbox.
 *
 * @typeParam TImplementation the type of the module's created; usually {@link Implementation}.
 */
export class Module<
    TImplementation extends ImplementationTrait = ImplementationTrait,
    TDeclaration extends Declaration = Declaration,
> {
    /**
     * Module's declaration.
     *
     * @group Immutable Properties
     */
    public readonly declaration: Immutable<TDeclaration>

    /**
     * Module's implementation.
     *
     * @group Immutable Properties
     */
    public readonly implementation: ({
        fwdParams,
    }: {
        fwdParams: ForwardArgs
    }) => Promise<TImplementation> | TImplementation

    /**
     *
     * @param params.declaration Module declaration
     * @param params.implementation Module implementation
     */
    constructor(params: {
        declaration: TDeclaration
        implementation: ({
            fwdParams,
        }: {
            fwdParams: ForwardArgs
        }) => Promise<TImplementation> | TImplementation
    }) {
        Object.assign(this, params)
    }

    /**
     * Instantiate the module, usually called by {@link Projects.Environment} classes.
     * @param params.fwdParams 'System' argument
     */
    async getInstance(params: { fwdParams: ForwardArgs }) {
        const result = this.implementation(params)
        return result instanceof Promise ? await result : result
    }
}
