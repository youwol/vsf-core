import { filter, takeUntil, takeWhile } from 'rxjs/operators'
import { BehaviorSubject, Observable, ReplaySubject } from 'rxjs'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import * as CdnClient from '@youwol/cdn-client'

import { EnvironmentTrait, Immutable, Immutables } from '../common'
import { Modules, Connections, Deployers, Configurations } from '..'
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
import { NoContext } from '@youwol/logging'
import { WithModuleBaseSchema } from '../modules'
import * as IOs from '../modules/IOs'
import { Environment } from '../project'

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
        configuration: { schema: {} },
        configurationInstance: {},
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

export function getProbes(
    instancePool: Immutable<Deployers.InstancePool>,
    customArgs: { outputs: Immutables<{ slotId?: number; moduleId: string }> },
) {
    const notForwarded = () => {
        return {
            data: 'Data not forwarded',
        }
    }
    return [
        ...instancePool.modules
            .flatMap((m) => Object.values(m.inputSlots))
            .map((inputSlot) => {
                return {
                    kind: 'module.inputSlot.rawMessage$',
                    id: {
                        moduleId: inputSlot.moduleId,
                        slotId: inputSlot.slotId,
                    },
                    message: notForwarded,
                } as Deployers.Probe<'module.inputSlot.rawMessage$'>
            }),
        ...instancePool.modules
            .flatMap((m) =>
                Object.values(m.outputSlots).map((slot, index) => ({
                    slot,
                    index,
                })),
            )
            .map(({ slot, index }) => {
                // If the following expression is inlined in the ternary operator where it is used below
                // => consuming project will have an EsLint error at `import '@youwol/vsf-core'`:
                //  'Parse errors in imported module '@youwol/vsf-core': Identifier expected.'
                const isMacroOutputs =
                    customArgs.outputs.find((o) => {
                        if (!o.slotId) {
                            return o.moduleId === slot.moduleId
                        }
                        return (
                            o.slotId === index && o.moduleId === slot.moduleId
                        )
                    }) !== undefined
                return {
                    kind: 'module.outputSlot.observable$',
                    id: {
                        moduleId: slot.moduleId,
                        slotId: slot.slotId,
                    },
                    message: isMacroOutputs
                        ? (inWorkerMessage) => inWorkerMessage
                        : notForwarded,
                } as Deployers.Probe<'module.outputSlot.observable$'>
            }),
        ...instancePool.connections.map((connection) => {
            return {
                kind: 'connection.status$',
                id: { connectionId: connection.uid },
                message: (inWorkerMessage) => inWorkerMessage,
            } as Deployers.Probe<'connection.status$'>
        }),
    ]
}

export async function moduleInstanceInWorker(
    {
        typeId,
        moduleId,
        toolboxId,
        configuration,
        scope,
        workersPoolId,
        environment,
        fwdParams,
    }: {
        typeId: string
        workersPoolId: string
        toolboxId: string
        moduleId: string
        configuration?: { [_k: string]: unknown }
        scope: Immutable<{ [k: string]: unknown }>
        environment: Environment
        fwdParams: Immutable<Modules.ForwardArgs>
    },
    context = NoContext,
): Promise<Modules.ImplementationTrait> {
    return await context.withChildAsync('deployMacroInWorker', async (ctx) => {
        const workersPool = environment.workersPools.find((wp) => {
            return wp.model.id == workersPoolId
        })
        if (!workersPool) {
            throw Error(
                `Worker pool '${workersPoolId}' not found to deploy module '${typeId}' with id '${moduleId}'`,
            )
        }

        ctx.info('Workers pool', workersPool)
        const chart = {
            modules: [
                {
                    uid: moduleId,
                    typeId,
                    toolboxId,
                    configuration: {
                        ...configuration,
                        workersPoolId: '',
                    },
                },
            ],
            connections: [],
        }
        let instancePoolWorker = await Deployers.InstancePoolWorker.empty({
            processName: moduleId,
            workersPool: workersPool.instance,
            parentUid: moduleId,
        })
        instancePoolWorker = await instancePoolWorker.deploy(
            {
                chart,
                environment,
                scope,
                customArgs: { outputs: [{ moduleId: moduleId }] },
                probes: Deployers.getProbes,
            },
            ctx,
        )
        const moduleProxy: Immutable<Modules.ImplementationTrait> =
            instancePoolWorker.inspector().getModule(moduleId)
        const inputs = Object.entries(moduleProxy.inputSlots).reduce(
            (acc, [k, slot]) => {
                return {
                    ...acc,
                    [k]: {
                        description: slot.description,
                        contrat: slot.contract,
                    },
                }
            },
            {},
        )
        const outputs = () =>
            Object.entries(moduleProxy.outputSlots).reduce((acc, [k, slot]) => {
                return {
                    ...acc,
                    [k]: slot.observable$,
                }
            }, {})
        type TSchema = WithModuleBaseSchema<
            Configurations.Schema<Modules.OverrideType>
        >
        type TInputs = Record<string, IOs.Input>
        const params: Modules.UserArgs<TSchema> = {
            configuration: moduleProxy.configuration,
            inputs,
            outputs,
            instancePool: instancePoolWorker,
            html: () => ({
                innerText: `Can not access html for modules running in workers pool (#${moduleId})`,
            }),
        }
        const implementation = new Modules.Implementation<TSchema, TInputs>(
            params,
            fwdParams,
        )

        Object.values(implementation.inputSlots).map(
            (inputSlot: Modules.InputSlot, i) => {
                Deployers.transmitInputMessage(
                    moduleId,
                    instancePoolWorker.processId,
                    { moduleId, slotId: i },
                    inputSlot.preparedMessage$.pipe(
                        takeUntil(instancePoolWorker.terminated$),
                    ),
                    workersPool.instance,
                )
            },
        )
        return implementation
    })
}
