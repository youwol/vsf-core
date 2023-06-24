/**
 * Only import of types are allowed here as it is executed in a worker
 */
import type * as CdnClient from '@youwol/cdn-client'
import type * as RxJS from 'rxjs'
import type * as operators from 'rxjs/operators'
import type { ProjectState } from '../project'
import type { InstancePool } from '../instance-pool'
import type { ImplementationTrait, InputSlot, OutputSlot } from '../../modules'
import type { ConnectionStatusWtoMain } from './utils'
import type { Immutable } from '../../common'

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
export function transmitIO(
    slot: Immutable<InputSlot | OutputSlot>,
    context: CdnClient.WorkersPoolTypes.WorkerContext,
) {
    const kind = slot['rawMessage$'] ? 'InputSlot' : 'OutputSlot'
    const base = {
        step: kind == 'InputSlot' ? 'InputSlotRaw' : 'OutputSlotRaw',
        slotId: slot.slotId,
        moduleId: slot.moduleId,
    }
    const obs$: RxJS.Observable<unknown> =
        kind == 'InputSlot'
            ? (slot as InputSlot).rawMessage$
            : (slot as OutputSlot).observable$
    obs$.subscribe(
        () => context.sendData({ ...base, message: 'data' }),
        () => {
            /* no op*/
        },
        () => context.sendData({ ...base, message: 'closed' }),
    )
}

export function transmitOutput(
    slot: Immutable<OutputSlot>,
    index: number,
    context: CdnClient.WorkersPoolTypes.WorkerContext,
) {
    slot.observable$.subscribe((message) => {
        context.sendData({
            step: 'Output',
            macroOutputSlot: index,
            message,
        })
    })
}

export async function deployInstancePoolWorker({
    args,
    workerScope,
    workerId,
    taskId,
    context,
}) {
    const vsfCore: VsfCore = workerScope.vsfCore
    const cdn: typeof CdnClient = workerScope.CDN
    const rxjs: typeof RxJS & { operators: typeof operators } = workerScope.rxjs
    const transmitIO_: typeof transmitIO = workerScope.transmitIO
    const transmitOutput_: typeof transmitOutput = workerScope.transmitOutput
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

    context.info(`${workerId}: instance pool created (${uid})`)
    const cdnMonitoring = cdn.monitoring()
    context.sendData({
        step: 'Runtime',
        exportedSymbols: cdnMonitoring.exportedSymbols,
        importedBundles: cdnMonitoring.importedBundles,
        latestVersion: cdnMonitoring.latestVersion,
    })

    globalThis[`macro_${uid}`] = {
        instancePool,
        inputs: args.inputs,
        outputs: args.outputs,
    }
    // Connections
    instancePool.connections.forEach((c) => {
        c.status$.subscribe((status) => {
            context.sendData({
                step: 'ConnectionStatus',
                uid: c.uid,
                status,
            } as ConnectionStatusWtoMain)
        })
    })
    // IO slots
    instancePool.modules
        .flatMap((m) => [
            ...Object.values(m.inputSlots),
            ...Object.values(m.outputSlots),
        ])
        .forEach((slot) => transmitIO_(slot, context))

    // Plug outputs to forward messages from worker's instance pool to main
    args.outputs.forEach(({ moduleId, slotId }, index) => {
        const instance = instancePool.getModule(moduleId)
        const slot = Object.values(instance.outputSlots)[slotId]
        transmitOutput_(slot, index, context)
    })
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
    console.log(`${workerId} Ready`, globalThis[`macro_${uid}`])

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
