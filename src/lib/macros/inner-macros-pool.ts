import {
    BehaviorSubject,
    from,
    Observable,
    ObservableInput,
    ObservedValueOf,
    OperatorFunction,
} from 'rxjs'
import { Context } from '@youwol/logging'
import { finalize, mergeMap, tap } from 'rxjs/operators'

import {
    ExecutionJournal,
    Immutable,
    Immutables,
    macroToolbox,
    EnvironmentTrait,
} from '../common'
import { Modules, Runners } from '..'
import { MacroSchema } from './'

const getMacroDeployment = ({
    environment,
    uid,
    configuration,
}: {
    environment: Immutable<EnvironmentTrait>
    uid: string
    configuration: Immutable<InnerMacroSpecTrait['innerMacro']>
}) => ({
    environment: environment,
    scope: {
        uid,
        configuration: configuration,
    },
    chart: {
        modules: [
            {
                uid,
                typeId: configuration.macroTypeId,
                configuration: configuration.configuration,
                toolboxId: macroToolbox.uid,
            },
        ],
        connections: [],
    },
})

function mergeInstancePools(
    uid: string,
    ...pools: Immutables<Runners.InstancePool>
) {
    const modules = pools.reduce((acc, e) => [...acc, ...e.modules], [])
    const connections = pools.reduce((acc, e) => [...acc, ...e.connections], [])
    return new Runners.InstancePool({
        parentUid: uid,
        modules,
        connections,
    })
}

/**
 * Trait for specifying a macro running as a producer of an inner observable.
 *
 */
export type InnerMacroSpecTrait = {
    /**
     * inner macro specification
     */
    innerMacro: {
        /**
         * type of the macro
         */
        macroTypeId: string
        /**
         * configuration of the macro.
         *
         * This can only specifies the static part of the configuration,
         * it gets completed at run time by the configuration declared for the macro.
         */
        configuration: MacroSchema
        /**
         * input index in which outer observable messages are forwarded in the inner macro.
         */
        inputIndex: number
        /**
         * output index that defines the inner observable.
         */
        outputIndex: number
    }
}

/**
 * Type of message from the outer observable that gets forwarded in the inner macro.
 *
 * There is no constraints on the ̀data` attribute of {@link Modules.ProcessingMessage},
 * but its `configuration` attribute is constrained by {@link InnerMacroSpecTrait}.
 */
export type TriggerMessage = Immutable<
    Modules.ProcessingMessage<unknown, InnerMacroSpecTrait>
>

/**
 * Type factorization for arguments of callbacks related to inner macro lifecycle events, gathered in
 * {@link InnerMacrosOrchestrationTrait}.
 */
export type OnInnerMacroEventArgs = {
    /**
     * The {@link InnerMacrosPool} managing the state of the pool.
     */
    state: Immutable<InnerMacrosPool>
    /**
     * The {@link TriggerMessage} that initiated the macro creation.
     */
    fromOuterMessage: TriggerMessage
}

/**
 * Type factorization for arguments of callbacks related to inner macro lifecycle end events, gathered in
 * {@link InnerMacrosOrchestrationTrait}.
 */
export type OnInnerMacroEventEndArgs = OnInnerMacroEventArgs & {
    /**
     * Instance of the macro.
     */
    macroModule: Immutable<Modules.ImplementationTrait>
}

/**
 * Specification of the trait for an orchestrator of inner macro.
 *
 * Central to this structure is {@link InnerMacrosOrchestrationTrait.orchestrate} that represents
 * an higher order mapping operator (e.g. `switchMap`, `mergeMap`, etc).
 *
 */
export interface InnerMacrosOrchestrationTrait {
    /**
     * Callback called when an inner macro has been created.
     */
    onInnerMacroStarted?: (args: OnInnerMacroEventArgs) => void
    /**
     * Callback called when the observable of an inner macro has been completed.
     * Note: if the observable complete, the macro is also consider `terminated`.
     */
    onInnerMacroCompleted?: (args: OnInnerMacroEventEndArgs) => void
    /**
     * Callback called when the observable of an inner macro has been terminated.
     * If can be either: (i) the observable as completed, or (ii) the observable has been terminated
     * (e.g. because of a switch from a `switchMap`).
     */
    onInnerMacroTerminated?: (args: OnInnerMacroEventEndArgs) => void

    /**
     *
     * Callback called when the outer observable complete.
     */
    onOuterObservableCompleted?: ({
        state,
    }: {
        state: Immutable<InnerMacrosPool>
    }) => void

    /**
     * The orchestration policy: an higher order mapping operator (e.g. `switchMap`, `mergeMap`, etc)
     */
    orchestrate: {
        (
            project: (
                value: TriggerMessage,
                index: number,
            ) => ObservableInput<unknown>,
        ): OperatorFunction<
            TriggerMessage,
            ObservedValueOf<ObservableInput<unknown>>
        >
    }
}

/**
 * `InnerMacroPool` represents a pool of macro, each one defining an inner observables.
 * These inner observables are orchestrated using {@link InnerMacrosOrchestrationTrait}.
 */
export class InnerMacrosPool {
    /**
     * Parent id that will be used to create the children {@link InstancePool}, each one containing the macro
     * that has been created from an incoming {@link TriggerMessage}.
     * Individual element are gathered in {@link instancePools}.
     */
    public readonly parentUid: string
    /**
     * `instancePool$` gather the 'global' instance pool of macro.
     * It includes all the macros that are running at a particular point in time.
     */
    public readonly instancePool$: BehaviorSubject<
        Immutable<Runners.InstancePool>
    >
    /**
     * If `true`, terminated macro are not kept in memory.
     */
    public readonly purgeOnTerminated: boolean
    /**
     * Orchestrator, see {@link InnerMacrosOrchestrationTrait}.
     */
    public readonly orchestrator: Immutable<InnerMacrosOrchestrationTrait>
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
     * Individual context used by each child macro (generated from a {@link TriggerMessage}) to log information.
     */
    public readonly instanceContext: Map<Immutable<TriggerMessage>, Context> =
        new Map()

    /**
     * Individual instance pool containing the macro generated from a {@link TriggerMessage}.
     */
    public readonly instancePools: Map<
        Immutable<TriggerMessage>,
        Promise<Immutable<Runners.InstancePool>>
    > = new Map()
    private index = 0
    private sourceCompleted = false

    /**
     *
     * @param params.parentUid see {@link InnerMacrosPool.parentUid}
     * @param params.environment see {@link InnerMacrosPool.environment}
     * @param params.purgeOnTerminated see {@link InnerMacrosPool.purgeOnTerminated}
     * @param params.orchestrator see {@link InnerMacrosOrchestrationTrait}
     */
    constructor(params: {
        parentUid: string
        environment: Immutable<EnvironmentTrait>
        purgeOnTerminated: boolean
        orchestrator: Immutable<InnerMacrosOrchestrationTrait>
    }) {
        Object.assign(this, params)
        this.journal = new ExecutionJournal({
            logsChannels: this.environment.logsChannels,
        })
        this.instancePool$ = new BehaviorSubject(
            new Runners.InstancePool({ parentUid: this.parentUid }),
        )
        this.overallContext = this.journal.addPage({
            title: `overall`,
        })
    }

    /**
     * Create the resulting observable resulting from the orchestration of the inner observables.
     * @param source$ outer observables
     */
    result$({
        outer$,
    }: {
        outer$: Observable<TriggerMessage>
    }): Observable<Immutable<Modules.OutputMessage<unknown>>> {
        return outer$.pipe(
            tap((m) => this.overallContext.info('message received', m)),
            finalize(() => this.outerObservableCompleted()),
            this.orchestrator.orchestrate((message) => {
                return this.innerObservable(message).pipe(
                    finalize(() => {
                        this.clearMacroInstance(message, 'terminated')
                    }),
                )
            }),
        ) as Observable<Immutable<Modules.OutputMessage<unknown>>>
    }

    /**
     * Return whether the outer observable is completed
     */
    isOuterObservableCompleted() {
        return this.sourceCompleted
    }

    private innerObservable(
        fromOuterMessage: TriggerMessage,
    ): Observable<Immutable<Modules.OutputMessage<unknown>>> {
        const onStart = this.orchestrator.onInnerMacroStarted || noOp
        return from(this.newMacroInstance(fromOuterMessage)).pipe(
            tap(() => {
                onStart({ fromOuterMessage, state: this })
            }),
            tap(({ macro, context }) => {
                context.info('Macro instance created', macro)
                const indexInput =
                    fromOuterMessage.configuration.innerMacro.inputIndex
                const inputs: Immutables<Modules.InputSlot> = Object.values(
                    macro.inputSlots,
                )
                if (indexInput < inputs.length) {
                    context.info(
                        "Send input to first macro's input slot.",
                        fromOuterMessage,
                    )
                    inputs[indexInput].rawMessage$.next({
                        data: fromOuterMessage.data,
                        context: fromOuterMessage.context,
                    })
                    inputs[indexInput].rawMessage$.complete()
                } else {
                    console.error('Can not find corresponding entry slot', {
                        availableSlots: macro.inputSlots,
                        indexInput,
                    })
                    throw Error('Can not find corresponding entry slot')
                }
            }),
            mergeMap(({ macro, context }) => {
                const outputs: Immutables<Modules.OutputSlot> = Object.values(
                    macro.outputSlots,
                )
                const outputIndex =
                    fromOuterMessage.configuration.innerMacro.outputIndex
                context.info(
                    `Stream from macro's output '${outputs[outputIndex].slotId}'.`,
                    fromOuterMessage,
                )

                return outputs[outputIndex].observable$.pipe(
                    tap(
                        (m) => {
                            context.info('Send output', m)
                        },
                        (error) => {
                            context.error(error)
                        },
                        () => {
                            context.info('Inner observable completed')
                            this.clearMacroInstance(
                                fromOuterMessage,
                                'completed',
                            )
                            context.end()
                            if (this.isOuterObservableCompleted()) {
                                this.overallContext.end()
                            }
                        },
                    ),
                )
            }),
        )
    }

    private outerObservableCompleted() {
        this.sourceCompleted = true
        this.orchestrator.onOuterObservableCompleted({ state: this })
        this.overallContext.info('Source observable completed')
    }

    private async newMacroInstance(message: TriggerMessage): Promise<{
        macro: Immutable<Modules.ImplementationTrait>
        context: Context
    }> {
        // Do not be tempted to use this.instancePool$.value as initial pool to avoid the latter 'reduce':
        // this code is executed in parallel and this.instancePool$.value is likely to return the empty InstancePool
        // even if it is not the first call to `newMacroInstance`.
        this.index += 1
        const innerMacroSpec = message.configuration.innerMacro
        const uid = `${innerMacroSpec.macroTypeId}#${this.index}`
        return await this.overallContext.withChildAsync(uid, async (ctx) => {
            const instanceCtx = this.journal.addPage({
                title: uid,
                context: ctx,
            })
            this.instanceContext.set(message, instanceCtx)
            const deployment: {
                chart: Immutable<Runners.Chart>
                environment: Immutable<EnvironmentTrait>
                scope: Immutable<{ [p: string]: unknown }>
            } = getMacroDeployment({
                environment: this.environment,
                uid,
                configuration: innerMacroSpec,
            })
            this.instancePools.set(
                message,
                new Runners.InstancePool({ parentUid: this.parentUid }).deploy(
                    deployment,
                    instanceCtx,
                ),
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

    private clearMacroInstance(
        message: TriggerMessage,
        status: 'completed' | 'terminated',
    ) {
        this.overallContext.info('Trigger teardown of macro')

        if (this.instancePools.has(message)) {
            this.instancePools.get(message).then((pool) => {
                pool.stop()
                const macroModule = pool.modules[0]
                const argsCb = {
                    fromOuterMessage: message,
                    macroModule,
                    state: this,
                }
                status == 'completed' &&
                    this.orchestrator.onInnerMacroCompleted &&
                    this.orchestrator.onInnerMacroCompleted(argsCb)

                status == 'terminated' &&
                    this.orchestrator.onInnerMacroTerminated &&
                    this.orchestrator.onInnerMacroTerminated(argsCb)

                if (!this.purgeOnTerminated) {
                    this.overallContext.info(
                        'Purge on done disable, no macro instance deletion',
                    )
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
                    new Runners.InstancePool({
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
