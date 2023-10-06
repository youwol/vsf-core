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
import { ConnectionsHint } from '../deployers'
import { Flowchart, parseDag } from '../project'

function mergeInstancePools(
    uid: string,
    ...pools: Immutables<Deployers.InstancePool>
) {
    const modules = pools.reduce((acc, e) => [...acc, ...e.modules], [])
    const connections = pools.reduce((acc, e) => [...acc, ...e.connections], [])
    const connectionsHint = pools.reduce(
        (acc, e) => [...acc, ...e.connectionsHint],
        [],
    )
    return new Deployers.InstancePool({
        parentUid: uid,
        modules,
        connections,
        connectionsHint,
    })
}

/**
 * Type factorization for arguments of callbacks related to inner instance pool lifecycle events, gathered in
 * {@link InnerObservablesPool}.
 */
export type OnInnerPoolEventArgs = {
    /**
     * The {@link InnerObservablesPool} managing the state of the pool.
     */
    state: Immutable<InnerObservablesPool>
    /**
     * The {@link Connections.Message} that initiated the instance pool creation.
     */
    fromMessage: Connections.Message
}

/**
 * Type factorization for arguments of callbacks related to inner instance pool lifecycle end events, gathered in
 * {@link InnerObservablesPool}.
 */
export type OnInnerPoolEventEndArgs = OnInnerPoolEventArgs & {
    /**
     * Instance pool to end.
     */
    instancePool: Immutable<Deployers.DeployerTrait>
}

/**
 * Type structure allowing to convert a flowchart into an inner observable from a message.
 */
export type VsfInnerObservable = {
    /**
     * flowchart definition
     */
    flowchart: Flowchart
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
     * If true, the associated instances of a flowchart are removed when the observable is either completed or
     * terminated.
     */
    purgeOnDone: boolean
}

/**
 * Represents a pool of {@link VsfInnerObservable}, each one serving as defining an observables.
 */
export class InnerObservablesPool {
    /**
     * Parent id that will be used to create the children {@link Deployers.InstancePool} from an
     * incoming {@link Connections.Message}.
     */
    public readonly parentUid: string
    /**
     * `instancePool$` gather the 'global' (merged from {@link instancePools}) instance pools of the deployed
     * flowcharts running at a particular point in time.
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
     * Individual context used by each child (generated from a {@link Connections.Message}) to log information.
     */
    public readonly instanceContext: Map<
        Immutable<Connections.Message>,
        Context
    > = new Map()

    /**
     * Individual instance pool created from a {@link Connections.Message}.
     */
    public readonly instancePools: Map<
        Immutable<Connections.Message>,
        Promise<Immutable<Deployers.InstancePool>>
    > = new Map()

    /**
     * Callback called when a flowchart has been deployed.
     */
    onStarted?: (args: OnInnerPoolEventArgs) => void
    /**
     * Callback called when the observable from a flowchart has been completed.
     * Note: if the observable complete, the flowchart is also consider `terminated`.
     */
    onCompleted?: (args: OnInnerPoolEventEndArgs) => void
    /**
     * Callback called when the observable from a flowchart has been terminated.
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
     * Create an inner observable from a {@link VsfInnerObservable}.
     *
     * @param innerObservable specification of the inner observable
     * @param connectionsHint connections hints to establish the connection between the inner modules
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
            tap(({ instancePool, suffix, context }) => {
                context.info('Instance pool deployed', instancePool)

                if (innerObservable.input == undefined) {
                    return
                }
                const { moduleId, slotId } = parseIO(
                    innerObservable.input,
                    suffix,
                    'input',
                )
                const inputModule = instancePool.inspector().getModule(moduleId)
                const input$ = Object.values(inputModule.inputSlots)[slotId]
                    ?.rawMessage$
                if (input$) {
                    context.info(
                        "Send input to flowchart's input slot.",
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
                    `The flowchart do not feature an input slot ${innerObservable.input}`,
                )
            }),
            mergeMap(({ instancePool, suffix, context }) => {
                const { moduleId, slotId } = parseIO(
                    innerObservable.output,
                    suffix,
                    'output',
                )

                context.info(
                    `Stream from flowchart output '${innerObservable.output}'.`,
                    innerObservable.message,
                )
                const outputModule = instancePool
                    .inspector()
                    .getModule(moduleId)
                const output$ = Object.values(outputModule.outputSlots)[slotId]
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
                            this.clearFlowchartInstance({
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
                        this.clearFlowchartInstance({
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
        suffix: string
    }> {
        // Do not be tempted to use this.instancePool$.value as initial pool to avoid the latter 'reduce':
        // this code is executed in parallel and this.instancePool$.value is likely to return the empty InstancePool
        // even if it is not the first call to `newFlowchartInstance`.
        this.index += 1
        const suffix = `#${this.index}`
        const uid = `flowchart${suffix}`
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
            const { modules, connections } = suffixFlowchart(parsed, suffix)
            const input = parseIO(innerObservable.input, suffix, 'input')
            const output = parseIO(innerObservable.output, suffix, 'output')
            const connectionsHints = [
                input
                    ? ({
                          type: 'input',
                          parent: connectionsHint.from,
                          child: input,
                      } as ConnectionsHint)
                    : undefined,
                {
                    type: 'output',
                    parent: connectionsHint.to,
                    child: output,
                } as ConnectionsHint,
            ].filter((d) => d !== undefined)

            const deployment = {
                environment: this.environment,
                scope: {
                    uid,
                },
                chart: {
                    modules,
                    connections,
                },
                connectionsHint: connectionsHints,
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
                suffix: suffix,
            }
        })
    }

    private clearFlowchartInstance({
        message,
        status,
        purgeOnDone,
    }: {
        message: Connections.Message
        status: 'completed' | 'terminated'
        purgeOnDone: boolean
    }) {
        this.overallContext.info('Trigger teardown of flowchart')

        if (this.instancePools.has(message)) {
            this.instancePools.get(message).then((pool) => {
                pool.stop()
                const argsCb = {
                    fromMessage: message,
                    instancePool: pool,
                    state: this,
                }
                status == 'completed' && this.onCompleted(argsCb)
                status == 'terminated' && this.onTerminated(argsCb)

                if (!purgeOnDone) {
                    this.overallContext.info(
                        'Purge on done disable, no flowchart instance deletion',
                    )
                    return
                }
                if (!this.instancePools.has(message)) {
                    // This branch is executed if 'completed' already reached here and cleanup has been done
                    return
                }
                const instancePool = this.instancePool$.value
                const modules = instancePool.modules.filter(
                    (m) => !pool.modules.includes(m),
                )
                const hints = instancePool.connectionsHint.filter((hint) => {
                    return (
                        modules.find((m) => m.uid === hint.child.moduleId) !=
                        undefined
                    )
                })
                const ctx = this.instanceContext.get(message)
                ctx.info('Teardown instance pool')
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

function parseIO(io: string, suffix: string, type: 'input' | 'output') {
    if (!io) {
        return
    }
    const indexOpen = io.indexOf('(')
    const indexClose = io.indexOf(')')
    const slot =
        type == 'input'
            ? io.substring(0, indexOpen)
            : io.substring(indexClose + 1)
    const moduleId = io.substring(indexOpen + 2, indexClose)
    return { slotId: parseInt(slot), moduleId: moduleId + suffix }
}

function suffixFlowchart(
    parsed: {
        modules: Modules.ModuleModel[]
        connections: Connections.ConnectionModel[]
    },
    suffix: string,
) {
    const modules = parsed.modules.map((module) => {
        return { ...module, uid: module.uid + suffix }
    })
    const connections = parsed.connections.map((connection) => {
        return {
            configuration: connection.configuration,
            start: {
                slotId: connection.start.slotId,
                moduleId: connection.start.moduleId + suffix,
            },
            end: {
                slotId: connection.end.slotId,
                moduleId: connection.end.moduleId + suffix,
            },
        } as Connections.ConnectionModel
    })
    return { modules, connections }
}
