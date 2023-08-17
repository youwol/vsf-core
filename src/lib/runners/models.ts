import { KeysAsUnion } from '../common'
import { ProcessingMessage, SlotTrait } from '../modules'
import { Chart } from './instance-pool'

/**
 * Type literals for id kind of probe messages.
 */
export type ProbeMessageIdKeys = KeysAsUnion<ProbeMessageId>

/**
 * Type specification of id for the various {@link ProbeMessageIdKeys}.
 */
export type ProbeMessageId = {
    // noinspection JSValidateJSDoc -> Ok for typedoc
    /**
     * Probe message bound to a `rawMessage$` of a {@link Modules.InputSlot}.
     */
    'module.inputSlot.rawMessage$': {
        moduleId: string
        slotId: string
    }

    // noinspection JSValidateJSDoc -> Ok for typedoc
    /**
     * Probe message bound to `preparedMessage$` of an {@link Modules.InputSlot}.
     */
    'module.inputSlot.preparedMessage$': {
        moduleId: string
        slotId: string
    }

    // noinspection JSValidateJSDoc -> Ok for typedoc
    /**
     * Probe message bound to `observable$` of an {@link Modules.OutputSlot}..
     */
    'module.outputSlot.observable$': {
        moduleId: string
        slotId: string
    }
    // noinspection JSValidateJSDoc -> Ok for typedoc
    /**
     * Probe message bound to `status$` of a {@link Modules.Connection}.
     */
    'connection.status$': {
        connectionId: string
    }
}

/**
 * Probe message structure emitted from a worker.
 */
export type ProbeMessageFromWorker<
    T extends keyof ProbeMessageId = ProbeMessageIdKeys,
> = {
    /**
     * Any of {@link ProbeMessageIdKeys}
     */
    kind: T
    /**
     * If `message`: the datastructure represent the data emitted by the underlying observable.
     * If `closed`: the underlying observable is not emitting anymore.
     */
    event: 'message' | 'closed'
    /**
     * Id of the probe message, see {@link ProbeMessageId}
     */
    id: ProbeMessageId[T]
    /**
     * If {@link event} is `message`, the projected data emitted by the underlying observable
     * (see `message` projection function of {@link Probe}).
     */
    message: unknown
}

/**
 * Type guard on {@link ProbeMessageFromWorker} templated with `module.inputSlot.rawMessage$`.
 * @param d
 */
export function isInputRawMessageProbe(
    d: unknown,
): d is ProbeMessageFromWorker<'module.inputSlot.rawMessage$'> {
    return (d as ProbeMessageFromWorker).kind == 'module.inputSlot.rawMessage$'
}

/**
 * Type guard on {@link ProbeMessageFromWorker} templated with `connection.status$`.
 * @param d
 */
export function isConnectionMessageProbe(
    d: unknown,
): d is ProbeMessageFromWorker<'connection.status$'> {
    return (d as ProbeMessageFromWorker).kind == 'connection.status$'
}

/**
 *
 * Type guard on {@link ProbeMessageFromWorker} templated with `module.outputSlot.observable$`.
 * @param d
 */
export function isOutputObservableProbe(
    d: unknown,
): d is ProbeMessageFromWorker<'module.outputSlot.observable$'> {
    return (d as ProbeMessageFromWorker).kind == 'module.outputSlot.observable$'
}
/**
 * Type guard on {@link ProbeMessageFromWorker} templated with any {@link ProbeMessageIdKeys}.
 * @param d
 */
export function isProbe(d: unknown): d is ProbeMessageFromWorker {
    return (
        isInputRawMessageProbe(d) ||
        isConnectionMessageProbe(d) ||
        isOutputObservableProbe(d)
    )
}

/**
 * Type definition of a probe.
 * A probe is bounded to an observable of predefined type (see {@link ProbeMessageIdKeys}),
 * conveys an `id`, and a projection function that project the data emitted by the observable (from a worker)
 * to a suitable form to be consumed in the main thread.
 *
 * @typeParam T type identifier of the underlying observable
 */
export type Probe<T extends keyof ProbeMessageId = ProbeMessageIdKeys> = {
    /**
     * Kind of the probe.
     */
    kind: keyof ProbeMessageId
    /**
     * Id of the probe.
     */
    id: ProbeMessageId[T]
    /**
     * Projection function.
     *
     * The resulting projected message should be compatible with the structure cloned algorithm in order
     * to be sent from a worker to the main thread.
     * @param m message emitted by the observable (in worker)
     * @return message actually sent to the main thread
     */
    message: (m: unknown) => unknown
}
/**
 * Message sent from a worker to inform on its readiness status.
 */
export type ReadyMessage = {
    data: {
        step: 'Ready'
        taskId: string
        workerId: string
        poolDescriber: InstancePoolDescriberFromWorker
    }
}
// noinspection JSValidateJSDoc -> Ok for typedoc
/**
 * Message sent from a worker to retrieve a {@link Modules.Implementation} description in the main thread.
 */
export type ModuleDescriberFromWorker = {
    uid: string
    typeId: string
    toolboxId: string
    inputSlots: string[]
    outputSlots: string[]
}
// noinspection JSValidateJSDoc -> Ok for typedoc
/**
 * Message sent from a worker to retrieve a {@link Modules.Connection} description in the main thread
 */
export type ConnectionDescriberFromWorker = {
    uid: string
    start: SlotTrait
    end: SlotTrait
}
/**
 * Message sent from a worker to retrieve an {@link InstancePool} description in the main thread.
 */
export type InstancePoolDescriberFromWorker = {
    modules: ModuleDescriberFromWorker[]
    connections: ConnectionDescriberFromWorker[]
}

/**
 * Type alias for version.
 */
export type Version = string

/**
 * Message sent from a worker to retrieve runtime information
 */
export type RuntimeNotification = {
    step: 'Runtime'
    importedBundles: { [k: string]: Version[] }
}
// noinspection JSValidateJSDoc -> Ok for typedoc
/**
 * Message send by the main thread to a worker to notify on an incoming {@link Modules.ProcessingMessage}
 * on a particular slot.
 */
export type InputMessage = {
    kind: 'InputMessage'
    slotId: string
    moduleId: string
    message: ProcessingMessage
}

/**
 * Message send by the main thread to a worker to ask for its release.
 */
export type StopSignal = {
    kind: 'StopSignal'
}

/**
 * Message send by the main thread to a worker to notify that a particular input slot is closed
 * (not receiving data anymore).
 */
export type InputClosed = {
    kind: 'InputClosed'
    slotId: string
    moduleId: string
}

/**
 * Message send by the main thread to a worker to notify for {@link Chart} deployment.
 */
export type DeployChart = {
    kind: 'DeployChart'
    chart: Chart
    uidDeployment: number
    probes: string
    customArgs: unknown
    scope: { [k: string]: unknown }
}
