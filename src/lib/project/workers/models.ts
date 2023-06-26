import { KeysAsUnion } from '../../common'
import { SlotTrait } from '../../modules'

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

export type ReadyMessage = {
    data: {
        step: 'Ready'
        taskId: string
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
