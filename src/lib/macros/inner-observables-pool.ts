import { BehaviorSubject, from, Observable } from 'rxjs'
import { Context } from '@youwol/logging'
import { finalize, mergeMap, tap } from 'rxjs/operators'

import {
    ExecutionJournal,
    Immutable,
    Immutables,
    EnvironmentTrait,
} from '../common'
import { Modules, Deployers, Connections } from '..'
import { macroToolbox } from './'
import { JsonMap } from '../connections'
import { ConnectionsHint } from '../deployers'

function mergeInstancePools(
    uid: string,
    ...pools: Immutables<Deployers.InstancePool>
) {
    const modules = pools.reduce((acc, e) => [...acc, ...e.modules], [])
    const connections = pools.reduce((acc, e) => [...acc, ...e.connections], [])
    const connectionsHint: Record<
        string,
        Immutable<ConnectionsHint>
    > = pools.reduce((acc, e) => ({ ...acc, ...e.connectionsHint }), {})
    return new Deployers.InstancePool({
        parentUid: uid,
        modules,
        connections,
        connectionsHint,
    })
}

/**
 * Type factorization for arguments of callbacks related to inner macro lifecycle events, gathered in
 * {@link InnerObservablesPool}.
 */
export type OnInnerPoolEventArgs = {
    /**
     * The {@link InnerObservablesPool} managing the state of the pool.
     */
    state: Immutable<InnerObservablesPool>
    /**
     * The {@link Connections.Message} that initiated the macro creation.
     */
    fromMessage: Connections.Message
}

/**
 * Type factorization for arguments of callbacks related to inner macro lifecycle end events, gathered in
 * {@link InnerObservablesPool}.
 */
export type OnInnerPoolEventEndArgs = OnInnerPoolEventArgs & {
    /**
     * Instance of the macro.
     */
    macroModule: Immutable<Modules.ImplementationTrait>
}

/**
 * Type structure allowing to convert a macro into an observable from a message.
 */
export type MacroAsObservableSpec = {
    /**
     * Type id of the macro
     */
    macroTypeId: string
    /**
     * If provided, the message is sent to macro's input slot with this index.
     */
    inputSlot?: number
    /**
     * The output slot that serves as defining the observable
     */
    outputSlot: number
    /**
     * Initiating message
     */
    message: Connections.Message
    /**
     * If true, the associated macro of an observable is removed when the observable is either completed or terminated.
     */
    purgeOnDone: boolean
    /**
     * The configuration to apply on the macro.
     */
    configuration: JsonMap
}

/**
 * `MacrosPoolState` represents a pool of macro, each one serving as defining an observables.
 */
export class InnerObservablesPool {
    /**
     * Parent id that will be used to create the children {@link Deployers.InstancePool}, each one containing the macro
     * that has been created from an incoming {@link Connections.Message}.
     */
    public readonly parentUid: string
    /**
     * `instancePool$` gather the 'global' instance pool of macro.
     * It includes all the macros that are running at a particular point in time.
     */
    public readonly instancePool$: BehaviorSubject<
        Immutable<Deployers.InstancePool>
    >

    /**
     * Environment in which the instances are running.
     */
    public readonly environment: Immutable<EnvironmentTrait>
    /**
     * Journal used to log information
     */
    public readonly journal: ExecutionJournal
    /**
     * Overall context used to log information
     */
    public readonly overallContext: Context
    /**
     * Individual context used by each child macro (generated from a {@link Connections.Message}) to log information.
     */
    public readonly instanceContext: Map<
        Immutable<Connections.Message>,
        Context
    > = new Map()

    /**
     * Individual instance pool containing the macro generated from a {@link Connections.Message}.
     */
    public readonly instancePools: Map<
        Immutable<Connections.Message>,
        Promise<Immutable<Deployers.InstancePool>>
    > = new Map()

    /**
     * Callback called when a macro has been created.
     */
    onStarted?: (args: OnInnerPoolEventArgs) => void
    /**
     * Callback called when the observable from a macro has been completed.
     * Note: if the observable complete, the macro is also consider `terminated`.
     */
    onCompleted?: (args: OnInnerPoolEventEndArgs) => void
    /**
     * Callback called when the observable from a macro has been terminated.
     * If can be either: (i) the observable as completed, or (ii) the observable has been terminated
     * (e.g. because of a switch from a `switchMap`).
     */
    onTerminated?: (args: OnInnerPoolEventEndArgs) => void

    private index = 0

    /**
     *
     * @param params.parentUid see {@link InnerObservablesPool.parentUid}
     * @param params.environment see {@link InnerObservablesPool.environment}
     * @param params.onStarted see {@link InnerObservablesPool.onStarted}
     * @param params.onCompleted see {@link InnerObservablesPool.onCompleted}
     * @param params.onTerminated see {@link InnerObservablesPool.onTerminated}
     */
    constructor(params: {
        parentUid: string
        environment: Immutable<EnvironmentTrait>
        onStarted?: (args: OnInnerPoolEventArgs) => void
        onCompleted?: (args: OnInnerPoolEventEndArgs) => void
        onTerminated?: (args: OnInnerPoolEventEndArgs) => void
    }) {
        Object.assign(this, params)
        this.journal = new ExecutionJournal({
            logsChannels: this.environment.logsChannels,
        })
        this.instancePool$ = new BehaviorSubject(
            new Deployers.InstancePool({ parentUid: this.parentUid }),
        )
        this.overallContext = this.journal.addPage({
            title: `overall`,
        })
        this.onStarted = this.onStarted || noOp
        this.onCompleted = this.onCompleted || noOp
        this.onTerminated = this.onTerminated || noOp
    }

    /**
     * Create an inner observable from a macro by specifying the macro's IO to use, the message used as
     * trigger (used only if `inputSlot` is provided).
     *
     * @param inputSlot index of the input slot of the macro to send the `message`
     * @param outputSlot index of the output slot to use as observable
     * @param message message to forward
     * @param purgeOnDone if true, various data associated to a macro for which the observable complete are deleted.
     * @param configuration macro's configuration
     * @param macroTypeId macro's type id. Should be available in the macro toolbox of the environment provided in the
     * constructor
     * @param connectionsHint connections hints to establish the connection between the inner macro IO
     * and the parent module (mostly graphical when rendering workflows).
     */
    inner$(
        {
            inputSlot,
            outputSlot,
            message,
            purgeOnDone,
            configuration,
            macroTypeId,
        }: MacroAsObservableSpec,
        connectionsHint?: { from: string; to: string },
    ): Observable<Immutable<Modules.OutputMessage>> {
        return from(
            this.newMacroInstance(
                {
                    macroTypeId,
                    message,
                    configuration,
                    inputSlot,
                    outputSlot,
                },
                connectionsHint,
            ),
        ).pipe(
            tap(() => {
                this.onStarted({ fromMessage: message, state: this })
            }),
            tap(({ macro, context }) => {
                context.info('Macro instance created', macro)

                if (inputSlot == undefined) {
                    return
                }
                const inputs: Immutables<Modules.InputSlot> = Object.values(
                    macro.inputSlots,
                )
                if (inputSlot < inputs.length) {
                    context.info("Send input to macro's input slot.", message)
                    inputs[inputSlot].rawMessage$.next({
                        data: message.data,
                        context: message.context,
                    })
                    inputs[inputSlot].rawMessage$.complete()
                    return
                }
                throw Error(
                    `The macro ${macroTypeId} do not feature an input slot #${inputSlot}`,
                )
            }),
            mergeMap(({ macro, context }) => {
                const outputs: Immutables<Modules.OutputSlot> = Object.values(
                    macro.outputSlots,
                )
                context.info(
                    `Stream from macro's output '${outputs[outputSlot].slotId}'.`,
                    message,
                )

                return outputs[outputSlot].observable$.pipe(
                    tap(
                        (m) => {
                            context.info('Send output', m)
                        },
                        (error) => {
                            context.error(error)
                        },
                        () => {
                            context.info('Inner observable completed')
                            this.clearMacroInstance({
                                message,
                                status: 'completed',
                                purgeOnDone,
                            })
                            context.end()
                            // if (this.isOuterObservableCompleted()) {
                            //     this.overallContext.end()
                            // }
                        },
                    ),
                    finalize(() => {
                        this.clearMacroInstance({
                            message,
                            status: 'terminated',
                            purgeOnDone,
                        })
                    }),
                )
            }),
        )
    }

    private async newMacroInstance(
        {
            macroTypeId,
            message,
            configuration,
            inputSlot,
            outputSlot,
        }: {
            macroTypeId: string
            message
            configuration: Connections.JsonMap
            inputSlot: number
            outputSlot: number
        },
        connectionsHint?: { from: string; to: string },
    ): Promise<{
        macro: Immutable<Modules.ImplementationTrait>
        context: Context
    }> {
        // Do not be tempted to use this.instancePool$.value as initial pool to avoid the latter 'reduce':
        // this code is executed in parallel and this.instancePool$.value is likely to return the empty InstancePool
        // even if it is not the first call to `newMacroInstance`.
        this.index += 1
        const uid = `${macroTypeId}#${this.index}`
        return await this.overallContext.withChildAsync(uid, async (ctx) => {
            const instanceCtx = this.journal.addPage({
                title: uid,
                context: ctx,
            })
            this.instanceContext.set(message, instanceCtx)
            const deployment = {
                environment: this.environment,
                scope: {
                    uid,
                    configuration,
                },
                chart: {
                    modules: [
                        {
                            uid,
                            typeId: macroTypeId,
                            configuration,
                            toolboxId: macroToolbox.uid,
                        },
                    ],
                    connections: [],
                },
                connectionsHint: {
                    [uid]: {
                        parent: connectionsHint,
                        inputSlot: inputSlot,
                        outputSlot: outputSlot,
                    },
                },
            }
            this.instancePools.set(
                message,
                new Deployers.InstancePool({
                    parentUid: this.parentUid,
                }).deploy(deployment, instanceCtx),
            )
            const instancePool = await this.instancePools.get(message)
            const reducedPool = mergeInstancePools(
                this.parentUid,
                this.instancePool$.value,
                instancePool,
            )
            this.instancePool$.next(reducedPool)
            return {
                macro: instancePool.modules[0],
                context: instanceCtx,
            }
        })
    }

    private clearMacroInstance({
        message,
        status,
        purgeOnDone,
    }: {
        message: Connections.Message
        status: 'completed' | 'terminated'
        purgeOnDone: boolean
    }) {
        this.overallContext.info('Trigger teardown of macro')

        if (this.instancePools.has(message)) {
            this.instancePools.get(message).then((pool) => {
                pool.stop()
                const macroModule = pool.modules[0]
                const argsCb = {
                    fromMessage: message,
                    macroModule,
                    state: this,
                }
                status == 'completed' && this.onCompleted(argsCb)
                status == 'terminated' && this.onTerminated(argsCb)

                if (!purgeOnDone) {
                    this.overallContext.info(
                        'Purge on done disable, no macro instance deletion',
                    )
                    return
                }
                if (!this.instancePools.has(message)) {
                    // This branch is executed if 'completed' already reached here and cleanup has been done
                    return
                }
                const modules = this.instancePool$.value.modules.filter(
                    (m) => m != macroModule,
                )
                const ctx = this.instanceContext.get(message)
                ctx.info('Teardown macro')
                ctx.end()
                this.instancePools.delete(message)
                this.instancePool$.next(
                    new Deployers.InstancePool({
                        parentUid: this.parentUid,
                        modules,
                        connections: [],
                    }),
                )
            })
        }
    }
}

const noOp = () => {
    /*no op*/
}
