import { Chart, InstancePool } from '../instance-pool'
import { filter, map, shareReplay, take, takeWhile, tap } from 'rxjs/operators'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import { BehaviorSubject, Observable, ReplaySubject } from 'rxjs'
import { Context } from '@youwol/logging'
import {
    ConnectionStatus,
    ConnectionTrait,
    ImplementationTrait,
    SlotTrait,
} from '../../modules'
import { Environment } from '../environment'
import { Immutable } from '../../common'

export const NotAvailableMessage = {
    data: 'Not available',
    context: {},
}
export const NotAvailableMessage$ = new BehaviorSubject(NotAvailableMessage)

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
type SlotStatusWtoMain = {
    moduleId: string
    slotId: string
    message: 'data' | 'closed'
}

type InputSlotStatusWtoMain = SlotStatusWtoMain
type OutputSlotStatusWtoMain = SlotStatusWtoMain

export function filterConnectionStatus$(
    connectionStatus$: Observable<ConnectionStatusWtoMain>,
    uid: string,
): BehaviorSubject<ConnectionStatus> {
    const status$ = new BehaviorSubject<ConnectionStatus>('connected')
    connectionStatus$
        .pipe(
            filter((c) => c.uid == uid),
            map(({ status }) => status),
        )
        .subscribe((status) => status$.next(status))
    return status$
}

type ModuleDescriberFromWorker = {
    uid: string
    typeId: string
    toolboxId: string
    inputSlots: string[]
    outputSlots: string[]
}

type ConnectionDescriberFromWorker = {
    uid: string
    start: SlotTrait
    end: SlotTrait
}

type InstancePoolDescriberFromWorker = {
    modules: ModuleDescriberFromWorker[]
    connections: ConnectionDescriberFromWorker[]
}

export function createGhostInstancePool({
    instancePool,
    connectionStatus$,
    inputSlotsRaw$,
    outputSlotsRaw$,
    environment,
}: {
    instancePool: InstancePoolDescriberFromWorker
    connectionStatus$: Observable<ConnectionStatusWtoMain>
    inputSlotsRaw$: Observable<InputSlotStatusWtoMain>
    outputSlotsRaw$: Observable<OutputSlotStatusWtoMain>
    environment: Immutable<Environment>
}) {
    return new InstancePool({
        modules: instancePool.modules.map((description) =>
            toGhostModule({
                description,
                environment,
                inputSlotsRaw$,
                outputSlotsRaw$,
            }),
        ),
        connections: instancePool.connections.map((description) =>
            toGhostConnection({ description, connectionStatus$ }),
        ),
    })
}

function toGhostModule({
    inputSlotsRaw$,
    outputSlotsRaw$,
    description,
    environment,
}: {
    description: Immutable<ModuleDescriberFromWorker>
    environment: Immutable<Environment>
    inputSlotsRaw$: Observable<InputSlotStatusWtoMain>
    outputSlotsRaw$: Observable<OutputSlotStatusWtoMain>
}): ImplementationTrait {
    const toSlotObservable = (
        source$: Observable<SlotStatusWtoMain>,
        { slotId, moduleId },
    ) => {
        const message$ = new ReplaySubject(1)
        source$
            .pipe(
                filter((m) => m.moduleId == moduleId && m.slotId == slotId),
                takeWhile((m) => {
                    return m.message != 'closed'
                }),
            )
            .subscribe(
                (m) => {
                    message$.next(m)
                },
                () => {
                    /*no op*/
                },
                () => {
                    message$.complete()
                },
            )
        return message$
    }

    const inputSlots = description.inputSlots
        .map((slotId) => {
            return {
                slotId,
                moduleId: description.uid,
                rawMessage$: toSlotObservable(inputSlotsRaw$, {
                    moduleId: description.uid,
                    slotId,
                }),
            }
        })
        .reduce((acc, d) => ({ ...acc, [d.slotId]: d }), {})

    const outputSlots = description.outputSlots
        .map((slotId) => {
            return {
                slotId,
                moduleId: description.uid,
                observable$: toSlotObservable(outputSlotsRaw$, {
                    moduleId: description.uid,
                    slotId,
                }),
            }
        })
        .reduce((acc, d) => ({ ...acc, [d.slotId]: d }), {})

    return {
        uid: description.uid,
        typeId: description.typeId,
        environment,
        factory: environment.getFactory({
            toolboxId: description.toolboxId,
            typeId: description.typeId,
        }).factory,
        toolboxId: description.toolboxId,
        inputSlots,
        outputSlots,
        // Remaining fields are TODO
        // They need to be recovered from the worker
        configuration: undefined,
        configurationInstance: undefined,
        journal: undefined,
    }
}

function toGhostConnection({
    description,
    connectionStatus$,
}: {
    description: ConnectionDescriberFromWorker
    connectionStatus$: Observable<ConnectionStatusWtoMain>
}): ConnectionTrait {
    return {
        ...description,
        configuration: { schema: {} },
        configurationInstance: {},
        status$: filterConnectionStatus$(connectionStatus$, description.uid),
        connect: () => {
            /*no op*/
        },
        disconnect: () => {
            /*no op*/
        },
        start$: NotAvailableMessage$,
        end$: NotAvailableMessage$,
        // Remaining fields are TODO
        // They need to be recovered from the worker
        journal: undefined,
    }
}
