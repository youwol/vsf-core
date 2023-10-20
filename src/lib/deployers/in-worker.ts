/**
 * Only import of types are allowed here as it is executed in a worker
 */
import type { WorkersPoolTypes } from '@youwol/cdn-client'
import type * as RxJS from 'rxjs'
import type * as operators from 'rxjs/operators'

import type { Modules } from '..'
import type {
    InstancePool,
    DeployChart,
    InputClosed,
    InputMessage,
    Probe,
    ProbeMessageId,
    ProbeMessageIdKeys,
    StopSignal,
    emitRuntime,
} from './'
import type { ProjectState } from '../project'

type VsfCore = typeof import('../../index')

export function transmitProbeToMainThread<T extends keyof ProbeMessageId>({
    obs$,
    kind,
    id,
    message,
    context,
}: {
    obs$: RxJS.Observable<unknown>
    kind: ProbeMessageIdKeys
    id: ProbeMessageId[T]
    message: (m: unknown) => unknown
    context: WorkersPoolTypes.WorkerContext
}) {
    obs$.subscribe(
        (d) =>
            context.sendData({
                kind,
                event: 'message',
                id,
                message: message(d),
            }),
        () => {
            /* no op*/
        },
        () =>
            context.sendData({
                kind,
                event: 'closed',
                id,
            }),
    )
}

export async function startWorkerShadowPool({
    args,
    workerScope,
    workerId,
    taskId,
    context,
}: {
    args: {
        parentUid: string
    }
    workerScope
    workerId: string
    taskId: string
    context: WorkersPoolTypes.WorkerContext
}) {
    const vsfCore: VsfCore = workerScope.vsfCore
    const rxjs: typeof RxJS & { operators: typeof operators } = workerScope.rxjs
    const transmitProbeToMainThread_: typeof transmitProbeToMainThread =
        workerScope.transmitProbeToMainThread

    const emitRuntime_: typeof emitRuntime = workerScope.emitRuntime

    context.info(`👋 I'm ${workerId}, starting shadow pool with task ${taskId}`)
    console.log(
        `👋 I'm ${workerId}, starting shadow pool with task ${taskId}`,
        {
            vsfCore,
        },
    )
    emitRuntime_(context)

    let project: ProjectState = new vsfCore.Projects.ProjectState()
    let instancePool: InstancePool = new vsfCore.Deployers.InstancePool({
        parentUid: args.parentUid,
    })

    const stop$ = new rxjs.Subject()

    const probesFactory = {
        'module.outputSlot.observable$': (id) => {
            const slot = instancePool.inspector().getModule(id['moduleId'])
                .outputSlots[id['slotId']]
            return slot.observable$
        },
        'module.inputSlot.rawMessage$': (id) => {
            const slot = instancePool.inspector().getModule(id['moduleId'])
                .inputSlots[id['slotId']]
            return slot.rawMessage$
        },
        'connection.status$': (id) => {
            const c = instancePool.inspector().getConnection(id['connectionId'])
            return c.status$
        },
    }

    function plugProb<T extends ProbeMessageIdKeys>({
        kind,
        id,
        message,
    }: {
        kind: ProbeMessageIdKeys
        id: ProbeMessageId[T]
        message
    }) {
        transmitProbeToMainThread_({
            obs$: probesFactory[kind](id),
            kind,
            id,
            message,
            context,
        })
    }

    // Plug input to forward message from main to worker's instance pool
    context.onData = async (
        data: InputMessage | StopSignal | InputClosed | DeployChart,
    ) => {
        if (data.kind == 'InputMessage') {
            const { moduleId, slotId, message } = data as unknown as {
                moduleId: string
                slotId: string
                message: Modules.ProcessingMessage
            }
            const instance = instancePool.inspector().getModule(moduleId)
            const targetSlot = Object.values(instance.inputSlots)[slotId]
            targetSlot.rawMessage$.next({
                data: message.data,
                configuration: {},
                context: vsfCore.Modules.mergeMessagesContext(message.context, {
                    macroConfig: message.configuration,
                }),
            })
        }
        if (data.kind == 'StopSignal') {
            stop$.next()
        }
        if (data.kind == 'InputClosed') {
            const { moduleId, slotId } = data
            const instance = instancePool.inspector().getModule(moduleId)
            const targetSlot = Object.values(instance.inputSlots)[slotId]
            targetSlot.rawMessage$.complete()
        }
        if (data.kind == 'DeployChart') {
            const { chart, uidDeployment, customArgs, scope } = data
            const toolboxes: Set<string> = new Set(
                chart.modules.map((m) => m.toolboxId),
            )
            context.info(`${workerId}: importing ${toolboxes.size} toolbox`, [
                ...toolboxes,
            ])
            project = await project.install({
                toolboxes: [...toolboxes],
                libraries: [],
            })

            emitRuntime_(context)

            instancePool = await instancePool.deploy({
                chart: data.chart,
                environment: project.environment,
                scope,
            })
            const probes = workerScope.deserializeFunction(data.probes)(
                instancePool,
                customArgs,
            ) as Probe[]
            probes.forEach(plugProb)

            const poolDescriber = {
                modules: instancePool.modules.map(
                    (m: Modules.ImplementationTrait) => ({
                        uid: m.uid,
                        typeId: m.typeId,
                        toolboxId: m.toolboxId,
                        inputSlots: Object.keys(m.inputSlots),
                        outputSlots: Object.keys(m.outputSlots),
                    }),
                ),
                connections: instancePool.connections.map(
                    ({ uid, start, end }) => ({
                        uid,
                        start,
                        end,
                    }),
                ),
            }
            context.sendData({
                step: 'ChartDeployed',
                poolDescriber,
                uidDeployment,
            })
        }
    }

    context.info(`${workerId}: Ready to operate ✅`)
    console.log(`${workerId}: Ready to operate ✅`)
    context.sendData({ step: 'Ready' })
    return new Promise<void>((resolve) => {
        stop$.pipe(rxjs.operators.take(1)).subscribe(() => {
            resolve()
        })
        /* need to release worker in due time */
    })
}
