/**
 * Only import of types are allowed here as it is executed in a worker
 */
import type * as CdnClient from '@youwol/cdn-client'
import type * as RxJS from 'rxjs'
import type * as operators from 'rxjs/operators'
import type { Chart, InstancePool } from '../instance-pool'
import type { ImplementationTrait } from '../../modules'
import type { ProjectState } from '../project'
import type { Probe } from './macro-workers'
import type { ProbeMessageId, ProbeMessageIdKeys } from './models'

type VsfCore = typeof import('../../index')

type InputMessage = {
    kind: 'InputMessage'
    [k: string]: unknown
}
type StopSignal = {
    kind: 'StopSignal'
}
type InputClosed = {
    kind: 'InputClosed'
    slotId: string
    moduleId: string
}

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
    context: CdnClient.WorkersPoolTypes.WorkerContext
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

export async function deployInstancePoolWorker({
    args,
    workerScope,
    workerId,
    taskId,
    context,
}: {
    args: {
        uid: string
        chart: Chart
        customArgs
        probes: string
    }
    workerScope
    workerId: string
    taskId: string
    context: CdnClient.WorkersPoolTypes.WorkerContext
}) {
    const vsfCore: VsfCore = workerScope.vsfCore
    const cdn: typeof CdnClient = workerScope.CDN
    const rxjs: typeof RxJS & { operators: typeof operators } = workerScope.rxjs
    const transmitProbeToMainThread_: typeof transmitProbeToMainThread =
        workerScope.transmitProbeToMainThread

    const probesFct = new Function(args.probes)()
    const chart = args.chart
    const uid = args.uid
    // TODO handle version
    const toolboxes: Set<string> = new Set(
        chart.modules.map((m) => m.toolboxId),
    )

    context.info(`👋 I'm ${workerId}, starting task ${taskId}`)
    console.log(`👋 I'm ${workerId}, starting task ${taskId}`, {
        vsfCore,
        chart,
        args,
        toolboxes,
    })
    let project: ProjectState = new vsfCore.Projects.ProjectState()

    context.info(`${workerId}: importing ${toolboxes.size} toolbox`, [
        ...toolboxes,
    ])
    project = await project.import(...toolboxes)

    let instancePool: InstancePool = new vsfCore.Projects.InstancePool()
    instancePool = await instancePool.deploy({
        chart,
        environment: project.environment,
        scope: {},
    })
    const probes = probesFct(
        instancePool,
        args.customArgs,
    ) as Probe<ProbeMessageIdKeys>[]

    context.info(`${workerId}: instance pool created (${uid})`)
    const cdnMonitoring = cdn.monitoring()
    context.sendData({
        step: 'Runtime',
        exportedSymbols: cdnMonitoring.exportedSymbols,
        importedBundles: cdnMonitoring.importedBundles,
        latestVersion: cdnMonitoring.latestVersion,
    })

    globalThis[`macro_${uid}`] = { instancePool }
    const probesFactory = {
        'module.outputSlot.observable$': (id) => {
            const slot = instancePool.getModule(id['moduleId']).outputSlots[
                id['slotId']
            ]
            return slot.observable$
        },
        'module.inputSlot.rawMessage$': (id) => {
            const slot = instancePool.getModule(id['moduleId']).inputSlots[
                id['slotId']
            ]
            return slot.rawMessage$
        },
        'connection.status$': (id) => {
            const c = instancePool.getConnection(id['connectionId'])
            return c.status$
        },
    }
    function transmit<T extends ProbeMessageIdKeys>({
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
    probes.forEach(transmit)

    const input$ = new rxjs.Subject()
    const stop$ = new rxjs.Subject()
    // Plug input to forward message from main to worker's instance pool
    context.onData = (data: InputMessage | StopSignal | InputClosed) => {
        if (data.kind == 'InputMessage') {
            input$.next(data)
        }
        if (data.kind == 'StopSignal') {
            stop$.next()
        }
        if (data.kind == 'InputClosed') {
            const { moduleId, slotId } = data
            const instance = instancePool.getModule(moduleId)
            const targetSlot = Object.values(instance.inputSlots)[slotId]
            targetSlot.rawMessage$.complete()
        }
    }
    input$.subscribe(({ moduleId, slotId, message }) => {
        const { data, configuration, context } = message
        const instance = instancePool.getModule(moduleId)
        const targetSlot = Object.values(instance.inputSlots)[slotId]
        targetSlot.rawMessage$.next({
            data,
            configuration: {},
            context: vsfCore.Modules.mergeMessagesContext(context, {
                macroConfig: configuration,
            }),
        })
    })
    context.info(`${workerId}: Ready to operate ✅`)
    console.log(`${workerId}: Ready to operate ✅`, globalThis[`macro_${uid}`])

    const poolDescriber = {
        modules: instancePool.modules.map((m: ImplementationTrait) => ({
            uid: m.uid,
            typeId: m.typeId,
            toolboxId: m.toolboxId,
            inputSlots: Object.keys(m.inputSlots),
            outputSlots: Object.keys(m.outputSlots),
        })),
        connections: instancePool.connections.map(({ uid, start, end }) => ({
            uid,
            start,
            end,
        })),
    }
    context.sendData({ step: 'Ready', poolDescriber })
    return new Promise<void>((resolve) => {
        stop$.pipe(rxjs.operators.take(1)).subscribe(() => {
            console.log(`${workerId}: Release`)
            resolve()
        })
        /* need to release worker in due time */
    })
}
