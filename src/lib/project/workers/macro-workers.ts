import { Chart, InstancePool } from '../instance-pool'
import { NoContext } from '@youwol/logging'
import { MacroModel } from '../workflow'
import { ForwardArgs, Implementation, ImplementationTrait } from '../../modules'
import { filter, take } from 'rxjs/operators'
import { Observable, Subject } from 'rxjs'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import { createMacroInputs } from '../macro'
import { Immutable } from '../../common'
import { deployInstancePoolWorker } from './in-worker'
import {
    createGhostInstancePool,
    getObservables,
    serializeChart,
} from './utils'

function transmitStopSignal(
    taskId: string,
    instancePool: Immutable<InstancePool>,
    workersPool: Immutable<WorkersPoolTypes.WorkersPool>,
) {
    instancePool.terminated$.pipe(take(1)).subscribe(() => {
        workersPool.sendData({
            taskId,
            data: { kind: 'StopSignal' },
        })
    })
}
function transmitInputMessage(
    macroUid: string,
    taskId: string,
    target: { moduleId: string; slotId: number },
    source$: Observable<unknown>,
    workersPool: Immutable<WorkersPoolTypes.WorkersPool>,
) {
    const send = (kind, message = undefined) => {
        workersPool.sendData({
            taskId: taskId,
            data: {
                kind,
                macro: macroUid,
                ...target,
                message,
            },
        })
    }
    source$.subscribe(
        (m) => send('InputMessage', m),
        () => {
            /*no op on error*/
        },
        () => {
            send('InputClosed')
        },
    )
}

export async function deployMacroInWorker(
    {
        macro,
        chart,
        workersPool,
        fwdParams,
    }: {
        macro: MacroModel
        chart: Chart
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
        fwdParams: ForwardArgs
    },
    context = NoContext,
): Promise<ImplementationTrait> {
    return await context.withChildAsync('deployMacroInWorker', async (ctx) => {
        ctx.info('Workers pool', workersPool)
        const inputs = createMacroInputs(macro)

        const outputs$ = macro.outputs.map(() => new Subject())
        const outputs = () =>
            macro.outputs.reduce((acc, e, i) => {
                return {
                    ...acc,
                    [`output_${i}$`]: outputs$[i],
                }
            }, {})

        return await deployInstancePoolInWorker(
            { workersPool, macro, chart, outputs$, inputs, outputs, fwdParams },
            ctx,
        )
    })
}

async function deployInstancePoolInWorker(
    {
        workersPool,
        macro,
        chart,
        outputs$,
        inputs,
        outputs,
        fwdParams,
    }: {
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
        macro: MacroModel
        chart: Chart
        outputs$: Subject<unknown>[]
        inputs
        outputs
        fwdParams: ForwardArgs
    },
    context = NoContext,
): Promise<ImplementationTrait> {
    return await context.withChildAsync(
        'install workflow in worker',
        async (ctxInner) => {
            const ctxWorker = ctxInner.startChild('In worker execution')
            const instancePool$ = workersPool.schedule({
                title: 'deploy chart in worker',
                entryPoint: deployInstancePoolWorker,
                args: {
                    uid: macro.uid,
                    chart: serializeChart(chart),
                    inputs: macro.inputs,
                    outputs: macro.outputs,
                },
            })
            const {
                ready$,
                output$,
                connectionStatus$,
                inputSlotsRaw$,
                outputSlotsRaw$,
            } = getObservables(instancePool$, ctxInner, ctxWorker)

            output$.subscribe(({ macroOutputSlot, message }) => {
                ctxInner.info('Forward message from worker pool to main', {
                    macroOutputSlot,
                    message,
                })
                outputs$[macroOutputSlot].next(message)
            })

            return new Promise((resolve) => {
                ready$.subscribe(({ data }) => {
                    const ghostPool = createGhostInstancePool({
                        instancePool: data.poolDescriber,
                        connectionStatus$,
                        inputSlotsRaw$,
                        outputSlotsRaw$,
                        environment: fwdParams.environment,
                    })

                    const implementation = new Implementation(
                        {
                            configuration: macro.configuration || {
                                schema: {},
                            },
                            inputs,
                            outputs,
                            instancePool: ghostPool,
                            html: macro.html,
                        },
                        fwdParams,
                    )
                    ctxWorker.end()
                    transmitStopSignal(
                        data.taskId,
                        implementation.instancePool$.value,
                        workersPool,
                    )

                    macro.inputs.map((input, i) => {
                        const inputSlot = Object.values(
                            implementation.inputSlots,
                        )[i]
                        const targetModule = ghostPool.getModule(input.moduleId)
                        const targetSlot = Object.values(
                            targetModule.inputSlots,
                        )[input.slotId]

                        transmitInputMessage(
                            macro.uid,
                            data.taskId,
                            input,
                            inputSlot.preparedMessage$,
                            workersPool,
                        )
                        inputSlotsRaw$
                            .pipe(
                                filter(
                                    ({ moduleId, slotId, message }) =>
                                        message == 'closed' &&
                                        moduleId == targetSlot.moduleId &&
                                        slotId == targetSlot.slotId,
                                ),
                                take(1),
                            )
                            .subscribe(() => targetSlot.rawMessage$.complete())
                    })

                    resolve(implementation)
                })
            })
        },
    )
}
