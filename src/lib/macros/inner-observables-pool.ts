import { BehaviorSubject, from, Observable } from 'rxjs'
import { Context } from '@youwol/logging'
import { finalize, mergeMap, tap } from 'rxjs/operators'

import {
    ExecutionJournal,
    Immutable,
    Immutables,
    EnvironmentTrait,
} from '../common'
import { Modules, Deployers, Connections, Projects } from '..'
import { ConnectionsHint } from '../deployers'
import { parseDag } from '../project'

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
 * Type structure allowing to convert a flowchart into an inner observable from a message.
 */
export type VsfInnerObservable = {
    /**
     * id of the inner observable
     */
    id: string
    /**
     * flowchart definition
     */
    flowchart: Projects.Flowchart
    /**
     * If provided, the message is sent this input.
     *
     * Format is e.g. `0(#moduleId)`, where `0` is the index of the input slot & `moduleId`
     * the target module ID in the flowchart.
     */
    input?: string
    /**
     * The output slot that serves as defining the observable.
     *
     * Format is e.g. `(#moduleId)0`, where `0` is the index of the output slot & `moduleId`
     * the target module ID in the flowchart.
     */
    output: string
    /**
     * Initiating message
     */
    message: Connections.Message
    /**
     * If true, the associated macro of an observable is removed when the observable is either completed or terminated.
     */
    purgeOnDone: boolean
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
     * @param innerObservable specification of the inner observable
     * @param connectionsHint connections hints to establish the connection between the inner macro IO
     * and the parent module (mostly graphical when rendering workflows).
     */
    inner$(
        innerObservable: VsfInnerObservable,
        connectionsHint?: { from: string; to: string },
    ): Observable<Immutable<Modules.OutputMessage>> {
        return from(
            this.newFlowchartInstance(innerObservable, connectionsHint),
        ).pipe(
            tap(() => {
                this.onStarted({
                    fromMessage: innerObservable.message,
                    state: this,
                })
            }),
            tap(({ instancePool, context }) => {
                context.info('Instance pool deployed', instancePool)

                if (innerObservable.input == undefined) {
                    return
                }
                const { moduleId, slot } = parseIO(
                    innerObservable.input,
                    'input',
                )
                const inputModule = instancePool.inspector().getModule(moduleId)
                const input$ = Object.values(inputModule.inputSlots)[slot]
                    ?.rawMessage$
                if (input$) {
                    context.info(
                        "Send input to macro's input slot.",
                        innerObservable.message,
                    )
                    input$.next({
                        data: innerObservable.message.data,
                        context: innerObservable.message.context,
                    })
                    input$.complete()
                    return
                }
                throw Error(
                    `The innerObservable ${innerObservable.id} do not feature an input slot ${innerObservable.input}`,
                )
            }),
            mergeMap(({ instancePool, context }) => {
                const { moduleId, slot } = parseIO(
                    innerObservable.output,
                    'output',
                )

                context.info(
                    `Stream from flowchart output '${innerObservable.output}'.`,
                    innerObservable.message,
                )
                const outputModule = instancePool
                    .inspector()
                    .getModule(moduleId)
                const output$ = Object.values(outputModule.outputSlots)[slot]
                    ?.observable$

                return output$.pipe(
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
                                message: innerObservable.message,
                                status: 'completed',
                                purgeOnDone: innerObservable.purgeOnDone,
                            })
                            context.end()
                            // if (this.isOuterObservableCompleted()) {
                            //     this.overallContext.end()
                            // }
                        },
                    ),
                    finalize(() => {
                        this.clearMacroInstance({
                            message: innerObservable.message,
                            status: 'terminated',
                            purgeOnDone: innerObservable.purgeOnDone,
                        })
                    }),
                )
            }),
        )
    }

    private async newFlowchartInstance(
        innerObservable: VsfInnerObservable,
        connectionsHint?: { from: string; to: string },
    ): Promise<{
        instancePool: Immutable<Deployers.DeployerTrait>
        context: Context
    }> {
        // Do not be tempted to use this.instancePool$.value as initial pool to avoid the latter 'reduce':
        // this code is executed in parallel and this.instancePool$.value is likely to return the empty InstancePool
        // even if it is not the first call to `newMacroInstance`.
        this.index += 1
        const uid = `${innerObservable.id}#${this.index}`
        return await this.overallContext.withChildAsync(uid, async (ctx) => {
            const instanceCtx = this.journal.addPage({
                title: uid,
                context: ctx,
            })
            this.instanceContext.set(innerObservable.message, instanceCtx)
            const parsed = parseDag({
                flows: innerObservable.flowchart.branches,
                configs: innerObservable.flowchart.configurations,
                toolboxes: this.environment.allToolboxes,
                availableModules: [],
            })
            const deployment = {
                environment: this.environment,
                scope: {
                    uid,
                },
                chart: {
                    modules: parsed.modules,
                    connections: parsed.connections,
                },
                connectionsHint: {
                    [uid]: {
                        parent: connectionsHint,
                        inputSlot: innerObservable.input,
                        outputSlot: innerObservable.output,
                    },
                },
            }
            this.instancePools.set(
                innerObservable.message,
                new Deployers.InstancePool({
                    parentUid: this.parentUid,
                }).deploy(deployment, instanceCtx),
            )
            const instancePool = await this.instancePools.get(
                innerObservable.message,
            )
            const reducedPool = mergeInstancePools(
                this.parentUid,
                this.instancePool$.value,
                instancePool,
            )
            this.instancePool$.next(reducedPool)
            return {
                instancePool,
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
                const instancePool = this.instancePool$.value
                const modules = instancePool.modules.filter(
                    (m) => m != macroModule,
                )
                const hints = Object.entries(instancePool.connectionsHint)
                    .filter(([k, _]) => k != macroModule.uid)
                    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})
                const ctx = this.instanceContext.get(message)
                ctx.info('Teardown macro')
                ctx.end()
                this.instancePools.delete(message)
                this.instancePool$.next(
                    new Deployers.InstancePool({
                        parentUid: this.parentUid,
                        modules,
                        connections: [],
                        connectionsHint: hints,
                    }),
                )
            })
        }
    }
}

const noOp = () => {
    /*no op*/
}

function parseIO(input: string, type: 'input' | 'output') {
    const indexOpen = input.indexOf('(')
    const indexClose = input.indexOf(')')
    const slot =
        type == 'input'
            ? input.substring(0, indexOpen)
            : input.substring(indexClose + 1)
    const moduleId = input.substring(indexOpen + 2, indexClose)
    return { slot: parseInt(slot), moduleId }
}
