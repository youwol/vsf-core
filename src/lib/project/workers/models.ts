import { KeysAsUnion } from '../../common'
import { SlotTrait } from '../../modules'
import { Chart } from '../instance-pool'

export type ProbeMessageIdKeys = KeysAsUnion<ProbeMessageId>
export type ProbeMessageId = {
    'module.inputSlot.rawMessage$': {
        moduleId: string
        slotId: string
    }
    'module.inputSlot.preparedMessage$': {
        moduleId: string
        slotId: string
    }
    'module.outputSlot.observable$': {
        moduleId: string
        slotId: string
    }
    'connection.status$': {
        connectionId: string
    }
}

export type ProbeMessageFromWorker<
    T extends keyof ProbeMessageId = ProbeMessageIdKeys,
> = {
    kind: T
    event: 'message' | 'closed'
    id: ProbeMessageId[T]
    message: unknown
}

export function isInputRawMessageProbe(
    d: unknown,
): d is ProbeMessageFromWorker<'module.inputSlot.rawMessage$'> {
    return (d as ProbeMessageFromWorker).kind == 'module.inputSlot.rawMessage$'
}

export function isConnectionMessageProbe(
    d: unknown,
): d is ProbeMessageFromWorker<'connection.status$'> {
    return (d as ProbeMessageFromWorker).kind == 'connection.status$'
}

export function isOutputObservableProbe(
    d: unknown,
): d is ProbeMessageFromWorker<'module.outputSlot.observable$'> {
    return (d as ProbeMessageFromWorker).kind == 'module.outputSlot.observable$'
}

export function isProbe(d: unknown): d is ProbeMessageFromWorker {
    return (
        isInputRawMessageProbe(d) ||
        isConnectionMessageProbe(d) ||
        isOutputObservableProbe(d)
    )
}

export type Probe<T extends keyof ProbeMessageId = ProbeMessageIdKeys> = {
    kind: keyof ProbeMessageId
    id: ProbeMessageId[T]
    message: (m: unknown) => unknown
}

export type ReadyMessage = {
    data: {
        step: 'Ready'
        taskId: string
        workerId: string
        poolDescriber: InstancePoolDescriberFromWorker
    }
}

export type ModuleDescriberFromWorker = {
    uid: string
    typeId: string
    toolboxId: string
    inputSlots: string[]
    outputSlots: string[]
}

export type ConnectionDescriberFromWorker = {
    uid: string
    start: SlotTrait
    end: SlotTrait
}

export type InstancePoolDescriberFromWorker = {
    modules: ModuleDescriberFromWorker[]
    connections: ConnectionDescriberFromWorker[]
}

export type Version = string

export type RuntimeNotification = {
    step: 'Runtime'
    importedBundles: { [k: string]: Version[] }
}

export type InputMessage = {
    kind: 'InputMessage'
    [k: string]: unknown
}

export type StopSignal = {
    kind: 'StopSignal'
}

export type InputClosed = {
    kind: 'InputClosed'
    slotId: string
    moduleId: string
}

export type DeployChart = {
    kind: 'DeployChart'
    chart: Chart
    uidDeployment: number
    probes: string
    customArgs: unknown
    scope: { [k: string]: unknown }
}
