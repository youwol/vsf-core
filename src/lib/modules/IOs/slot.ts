import { Observable, Subject } from 'rxjs'
import { Contracts } from '../..'
import { InputMessage, ProcessingMessage, OutputMessage } from '../module'
import { SlotTrait } from '../traits'

/**
 * An input slot, referenced in e.g. {@link Implementation}.
 */
export class InputSlot<T = unknown, TConfigInstance = unknown>
    implements SlotTrait
{
    public readonly slotId: string
    public readonly moduleId: string
    /**
     * Description of the slot
     */
    public readonly description: string
    /**
     * Contract
     */
    public readonly contract: Contracts.ExpectationTrait<unknown>
    /**
     * Prepared message: after configuration have been merged with module's default configuration.
     * See {@link ProcessingMessage}.
     */
    public readonly preparedMessage$: Observable<
        ProcessingMessage<T, TConfigInstance>
    >
    /**
     * Raw message. See {@link ProcessingMessage}.
     */
    public readonly rawMessage$: Subject<InputMessage<T>>

    constructor(params: {
        slotId: string
        moduleId: string
        description: string
        contract: Contracts.ExpectationTrait<unknown>
        rawMessage$: Subject<InputMessage<T>>
        preparedMessage$: Observable<ProcessingMessage<T>>
    }) {
        Object.assign(this, params)
    }
}

/**
 * An output slot, referenced in e.g. {@link Implementation}.
 */
export class OutputSlot<T = unknown> implements SlotTrait {
    slotId: string
    moduleId: string
    observable$: Observable<OutputMessage<T>>

    constructor(params: {
        slotId: string
        moduleId: string
        observable$: Observable<OutputMessage<T>>
    }) {
        Object.assign(this, params)
    }
}
