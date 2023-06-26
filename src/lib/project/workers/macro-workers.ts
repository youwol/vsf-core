import { Chart, InstancePool } from '../instance-pool'
import { NoContext } from '@youwol/logging'
import { MacroModel } from '../workflow'
import { ForwardArgs, Implementation, ImplementationTrait } from '../../modules'
import { filter, map, shareReplay, take, takeUntil, tap } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import { createMacroInputs } from '../macro'
import { Immutable } from '../../common'
import { deployInstancePoolWorker } from './in-worker'
import { createGhostInstancePool, serializeChart } from './utils'
import {
    ReadyMessage,
    isProbe,
    ProbeMessageFromWorker,
    ProbeMessageId,
    ProbeMessageIdKeys,
} from './models'
import { Environment } from '../environment'

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
        return await deployInstancePoolInWorker(
            { workersPool, macro, chart, fwdParams },
            ctx,
        )
    })
}

async function deployInstancePoolInWorker(
    {
        workersPool,
        macro,
        chart,
        fwdParams,
    }: {
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
        macro: MacroModel
        chart: Chart
        fwdParams: ForwardArgs
    },
    context = NoContext,
): Promise<ImplementationTrait> {
    return await context.withChildAsync(
        'install workflow in worker',
        async (ctxInner) => {
            //const ctxWorker = ctxInner.startChild('In worker execution')
            const { ghostPool, taskId } = await createInWorkerInstancePool({
                uid: macro.uid,
                chart,
                workersPool,
                environment: fwdParams.environment,
                customArgs: { outputs: macro.outputs },
                probes: (instancePool: InstancePool, customArgs) => [
                    ...instancePool.modules
                        .flatMap((m) => Object.values(m.inputSlots))
                        .map((inputSlot) => {
                            return {
                                kind: 'module.inputSlot.rawMessage$',
                                id: {
                                    moduleId: inputSlot.moduleId,
                                    slotId: inputSlot.slotId,
                                },
                                message: (_) => ({
                                    data: 'Data not forwarded',
                                }),
                            } as Probe<'module.inputSlot.rawMessage$'>
                        }),
                    ...instancePool.modules
                        .flatMap((m) =>
                            Object.values(m.outputSlots).map((slot, index) => ({
                                slot,
                                index,
                            })),
                        )
                        .map(({ slot, index }) => {
                            return {
                                kind: 'module.outputSlot.observable$',
                                id: {
                                    moduleId: slot.moduleId,
                                    slotId: slot.slotId,
                                },
                                message:
                                    customArgs.outputs.find(
                                        (o) =>
                                            o.slotId == index &&
                                            o.moduleId == slot.moduleId,
                                    ) == undefined
                                        ? () => ({
                                              data: 'Data not forwarded',
                                          })
                                        : (inWorkerMessage) => inWorkerMessage,
                            } as Probe<'module.outputSlot.observable$'>
                        }),
                    ...instancePool.connections.map((connection) => {
                        return {
                            kind: 'connection.status$',
                            id: { connectionId: connection.uid },
                            message: (inWorkerMessage) => inWorkerMessage,
                        } as Probe<'connection.status$'>
                    }),
                ],
                ctxInner,
            })
            const inputs = createMacroInputs(macro)
            const outputs = () =>
                macro.outputs.reduce((acc, e, i) => {
                    const module = ghostPool.getModule(e.moduleId)
                    const slot = Object.values(module.outputSlots)[e.slotId]
                    return {
                        ...acc,
                        [`output_${i}$`]: slot.observable$,
                    }
                }, {})
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
            macro.inputs.map((input, i) => {
                const inputSlot = Object.values(implementation.inputSlots)[i]

                transmitInputMessage(
                    macro.uid,
                    taskId,
                    input,
                    inputSlot.preparedMessage$.pipe(
                        takeUntil(ghostPool.terminated$),
                    ),
                    workersPool,
                )
            })
            ghostPool.terminated$.pipe(take(1)).subscribe(() => {
                workersPool.sendData({
                    taskId,
                    data: { kind: 'StopSignal' },
                })
            })
            return implementation
        },
    )
}

export type Probe<T extends keyof ProbeMessageId = ProbeMessageIdKeys> = {
    kind: keyof ProbeMessageId
    id: ProbeMessageId[T]
    message: (m: unknown) => unknown
}

export function createInWorkerInstancePool<TCustomArgs>({
    uid,
    chart,
    workersPool,
    environment,
    ctxInner,
    probes,
    customArgs,
}: {
    uid: string
    chart: Immutable<Chart>
    workersPool: Immutable<WorkersPoolTypes.WorkersPool>
    environment: Immutable<Environment>
    ctxInner
    probes: (
        instancePool: InstancePool,
        customArgs: TCustomArgs,
    ) => Probe<ProbeMessageIdKeys>[]
    customArgs: TCustomArgs
}): Promise<{
    ghostPool: InstancePool
    taskId: string
}> {
    const channel$ = workersPool.schedule({
        title: 'deploy chart in worker',
        entryPoint: deployInstancePoolWorker,
        args: {
            uid,
            chart: serializeChart(chart),
            probes: 'return ' + probes.toString(),
            customArgs,
        },
    })
    const ready$ = channel$.pipe(
        filter((m) => m.type == 'Data' && m.data['step'] == 'Ready'),
        take(1),
        tap(() => {
            ctxInner.info('Workers pool ready: instancePool listening')
        }),
        map((m) => m as unknown as ReadyMessage),
        shareReplay({ bufferSize: 1, refCount: true }),
    )
    const probe$ = channel$.pipe(
        filter((m) => m.type == 'Data' && isProbe(m.data)),
        map((m) => m.data as unknown as ProbeMessageFromWorker),
    )
    return new Promise((resolve) => {
        ready$.subscribe(({ data }) => {
            const ghostPool = createGhostInstancePool({
                instancePool: data.poolDescriber,
                probe$,
                environment,
            })
            resolve({ ghostPool, taskId: data.taskId })
        })
    })
}
