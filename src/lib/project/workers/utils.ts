import { Chart, InstancePool } from '../instance-pool'
import { filter, map, shareReplay, take, takeWhile, tap } from 'rxjs/operators'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import { BehaviorSubject, Observable, ReplaySubject } from 'rxjs'
import { Context } from '@youwol/logging'
import { ConnectionStatus } from '../../modules'

function toClonable(obj) {
    // Base case: If the object is not an object or is null, return the original value
    if (typeof obj !== 'object' || obj === null) {
        return obj
    }

    // Create a new object to store the converted values
    const convertedObj = Array.isArray(obj) ? [] : {}

    // Traverse the object properties
    Object.keys(obj).forEach((key) => {
        const value = obj[key]

        if (typeof value === 'function') {
            convertedObj[key] = value.toString()
        } else if (typeof value === 'object') {
            convertedObj[key] = toClonable(value)
        } else {
            convertedObj[key] = value
        }
    })

    return convertedObj
}

export function serializeChart(chart: Chart) {
    return {
        connections: chart.connections.map((c) => ({
            ...c,
            configuration: toClonable(c.configuration),
        })),
        modules: chart.modules.map((m) => ({
            ...m,
            configuration: toClonable(m.configuration),
        })),
    }
}

export type ReadyMessage = {
    data: {
        step: 'Ready'
        taskId: string
        poolDescriber: InstancePoolDescriberFromWorker
    }
}
export function getObservables(
    instancePool$: Observable<WorkersPoolTypes.Message>,
    contextMain: Context,
    contextWorker: Context,
) {
    const output$ = instancePool$.pipe(
        filter((m) => m.type == 'Data' && m.data['step'] == 'Output'),
        map(
            ({ data }) =>
                data as unknown as {
                    macroOutputSlot: number
                    message: unknown
                },
        ),
    )

    const ready$ = instancePool$.pipe(
        filter((m) => m.type == 'Data' && m.data['step'] == 'Ready'),
        take(1),
        tap(() => {
            contextMain.info('Workers pool ready: instancePool listening')
        }),
        map((m) => m as unknown as ReadyMessage),
        shareReplay({ bufferSize: 1, refCount: true }),
    )
    const logs$ = instancePool$.pipe(
        filter((m) => m.type == 'Log'),
        map((m) => m.data as WorkersPoolTypes.MessageLog),
    )
    logs$.subscribe((m) => {
        contextWorker.info(m.text, m.json)
    })
    const connectionStatus$ = instancePool$.pipe(
        filter((m) => m.type == 'Data' && m.data['step'] == 'ConnectionStatus'),
        map((m) => m.data as unknown as ConnectionStatusWtoMain),
    )
    const inputSlotsRaw$ = instancePool$.pipe(
        filter((m) => m.type == 'Data' && m.data['step'] == 'InputSlotRaw'),
        map(
            (m) =>
                m.data as unknown as {
                    slotId: string
                    moduleId: string
                    message: 'data' | 'closed'
                },
        ),
    )
    const outputSlotsRaw$ = instancePool$.pipe(
        filter((m) => m.type == 'Data' && m.data['step'] == 'OutputSlotRaw'),
        map(
            (m) =>
                m.data as unknown as {
                    slotId: string
                    moduleId: string
                    message: 'data' | 'closed'
                },
        ),
    )

    return {
        ready$,
        output$,
        connectionStatus$,
        inputSlotsRaw$,
        outputSlotsRaw$,
    }
}

export type ConnectionStatusWtoMain = {
    step: 'ConnectionStatus'
    uid: string
    status: ConnectionStatus
}
type InputSlotStatusWtoMain = { moduleId: string; slotId: string }
type OutputSlotStatusWtoMain = {
    moduleId: string
    slotId: string
    message: 'data' | 'closed'
}

export function filterConnectionStatus$(
    connectionStatus$: Observable<ConnectionStatusWtoMain>,
    uid: string,
) {
    const status$ = new BehaviorSubject('connected')
    connectionStatus$
        .pipe(
            filter((c) => c.uid == uid),
            map(({ status }) => status),
        )
        .subscribe((status) => status$.next(status))
    return status$
}

type InstancePoolDescriberFromWorker = {
    modules: {
        uid: string
        typeId: string
        toolboxId: string
        inputSlots: string[]
        outputSlots: string[]
    }[]
    connections: any[]
}

export function createGhostInstancePool({
    instancePool,
    connectionStatus$,
    inputSlotsRaw$,
    outputSlotsRaw$,
}: {
    instancePool: InstancePoolDescriberFromWorker
    connectionStatus$: Observable<ConnectionStatusWtoMain>
    inputSlotsRaw$: Observable<InputSlotStatusWtoMain>
    outputSlotsRaw$: Observable<OutputSlotStatusWtoMain>
}) {
    const connections = instancePool.connections.map(({ uid, start, end }) => {
        return {
            uid,
            start,
            end,
            configuration: { schema: {} },
            status$: filterConnectionStatus$(connectionStatus$, uid),
        }
    }) as any[]

    const modules = instancePool.modules.map((ghostModule) => {
        const inputSlots = ghostModule.inputSlots
            .map((slotId) => {
                const rawMessage$ = new ReplaySubject(1)
                inputSlotsRaw$
                    .pipe(
                        filter(
                            (m) =>
                                m.moduleId == ghostModule.uid &&
                                m.slotId == slotId,
                        ),
                    )
                    .subscribe((m) => {
                        rawMessage$.next(m)
                    })
                return [
                    slotId,
                    { moduleId: ghostModule.uid, slotId, rawMessage$ },
                ]
            })
            .reduce(
                (acc, [k, v]: [k: string, v: any]) => ({
                    ...acc,
                    [k]: v,
                }),
                {},
            )
        const outputSlots = ghostModule.outputSlots
            .map((slotId) => {
                const observable$ = new ReplaySubject(1)
                outputSlotsRaw$
                    .pipe(
                        filter(
                            (m) =>
                                m.moduleId == ghostModule.uid &&
                                m.slotId == slotId,
                        ),
                        takeWhile((m) => {
                            return m.message != 'closed'
                        }),
                    )
                    .subscribe(
                        (m) => {
                            observable$.next(m)
                        },
                        () => {
                            /*no op*/
                        },
                        () => {
                            observable$.complete()
                        },
                    )
                return [
                    slotId,
                    { moduleId: ghostModule.uid, slotId, observable$ },
                ]
            })
            .reduce(
                (acc, [k, v]: [k: string, v: any]) => ({
                    ...acc,
                    [k]: v,
                }),
                {},
            )
        const module = {
            uid: ghostModule.uid,
            typeId: ghostModule.typeId,
            factory: { declaration: { typeId: ghostModule.typeId } },
            toolboxId: ghostModule.toolboxId,
            inputSlots,
            outputSlots,
        }
        return module
    }) as any[]
    return new InstancePool({
        modules,
        connections,
    })
}
