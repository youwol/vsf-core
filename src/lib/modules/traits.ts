import { BehaviorSubject } from 'rxjs'

import {
    EnvironmentTrait,
    Immutable,
    ToolboxObjectTrait,
    CanvasTrait,
    HtmlTrait,
    JournalTrait,
    UidTrait,
} from '../common'
import { Runners, Configurations } from '..'
import { OutputSlot, GetGenericInput, Module, Input, InputSlot } from './'

/**
 * Trait for slot.
 */
export interface SlotTrait {
    /**
     * ID of the slot
     */
    slotId: string
    /**
     * Module ID in which the slot belongs
     */
    moduleId: string
}

/**
 * Trait for object with API defined as observables
 */
export interface Api$Trait<TInputs> {
    inputSlots: Immutable<{
        [Property in keyof TInputs]: InputSlot<
            GetGenericInput<TInputs[Property]>
        >
    }>
    outputSlots: Immutable<{
        [k: string]: OutputSlot<unknown>
    }>
}

/**
 * Trait for a module's implementation.
 *
 * @typeParam TSchema The type of the schema associated to the configuration of the module.
 * @typeParam TInputs The type of the inputs associated to the module.
 * @typeParam TState The type of the (optional) state associated to the module.
 */
export type ImplementationTrait<
    TSchema extends Configurations.Schema = Configurations.Schema,
    TInputs = Record<string, Input>,
    TState = unknown,
> = Api$Trait<TInputs> &
    Configurations.ConfigurableTrait<TSchema> &
    UidTrait &
    JournalTrait &
    ToolboxObjectTrait &
    Partial<HtmlTrait> &
    Partial<CanvasTrait> & {
        factory: Module
        environment: Immutable<EnvironmentTrait>
        state?: Immutable<TState>
        instancePool$?: BehaviorSubject<Immutable<Runners.DeployerTrait>>
    }

/**
 * Trait for objects with side effects.
 */
export interface SideEffectsTrait {
    apply()

    dispose()
}
