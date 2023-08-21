import { filter, takeWhile } from 'rxjs/operators'
import { BehaviorSubject, Observable, ReplaySubject } from 'rxjs'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import * as CdnClient from '@youwol/cdn-client'

import { EnvironmentTrait, Immutable } from '../common'
import { Modules, Connections } from '..'
import {
    Chart,
    InstancePool,
    ConnectionDescriberFromWorker,
    InstancePoolDescriberFromWorker,
    isConnectionMessageProbe,
    isInputRawMessageProbe,
    isOutputObservableProbe,
    ModuleDescriberFromWorker,
    ProbeMessageFromWorker,
    RuntimeNotification,
} from './'

const noOp = () => {
    /*No op*/
}

export const NotAvailableMessage = {
    data: 'Not available',
    context: {},
}
export const NotAvailableMessage$ = new BehaviorSubject(NotAvailableMessage)

export function toClonable(obj) {
    // Base case: If the object is not an object or is null, return the original value
    if (typeof obj !== 'object' || obj === null) {
        return obj
    }
    if (obj instanceof SharedArrayBuffer) {
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

export function createInstancePoolProxy({
    instancePool,
    probe$,
    environment,
    parentUid,
}: {
    instancePool: InstancePoolDescriberFromWorker
    probe$: Observable<ProbeMessageFromWorker>
    environment: Immutable<EnvironmentTrait>
    parentUid: string
}) {
    return new InstancePool({
        modules: instancePool.modules.map((description) =>
            toModuleProxy({
                description,
                environment,
                probe$,
            }),
        ),
        connections: instancePool.connections.map((description) =>
            toConnectionProxy({ description, probe$ }),
        ),
        parentUid,
    })
}

function toModuleProxy({
    description,
    environment,
    probe$,
}: {
    description: Immutable<ModuleDescriberFromWorker>
    environment: Immutable<EnvironmentTrait>
    probe$: Observable<ProbeMessageFromWorker>
}): Modules.ImplementationTrait {
    const guards = {
        in: isInputRawMessageProbe,
        out: isOutputObservableProbe,
    }
    const toSlotObservable = (guard: 'in' | 'out', { slotId, moduleId }) => {
        const message$ = new ReplaySubject(1)
        probe$
            .pipe(
                filter(
                    (m) =>
                        guards[guard](m) &&
                        m.id.moduleId == moduleId &&
                        m.id.slotId == slotId,
                ),
                takeWhile((m) => {
                    return m.event != 'closed'
                }),
            )
            .subscribe(
                (m) => {
                    message$.next(m.message)
                },
                noOp,
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
                rawMessage$: toSlotObservable('in', {
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
                observable$: toSlotObservable('out', {
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

function toConnectionProxy({
    description,
    probe$,
}: {
    description: ConnectionDescriberFromWorker
    probe$: Observable<ProbeMessageFromWorker>
}): Connections.ConnectionTrait {
    const status$ = new BehaviorSubject<Connections.ConnectionStatus>(
        'connected',
    )
    probe$
        .pipe(
            filter(
                (m) =>
                    isConnectionMessageProbe(m) &&
                    m.id.connectionId == description.uid,
            ),
        )
        .subscribe((m) =>
            status$.next(m.message as Connections.ConnectionStatus),
        )

    return {
        ...description,
        configuration: { schema: {} },
        configurationInstance: {},
        status$,
        connect: noOp,
        disconnect: noOp,
        start$: NotAvailableMessage$,
        end$: NotAvailableMessage$,
        // Remaining fields are TODO
        // They need to be recovered from the worker
        journal: undefined,
    }
}

export function emitRuntime(context: WorkersPoolTypes.WorkerContext) {
    const cdnClient: typeof CdnClient = globalThis.CDN
    context.sendData({
        step: 'Runtime',
        importedBundles: cdnClient.monitoring().importedBundles,
    } as RuntimeNotification)
}
