import { ConfigurableTrait, Immutable, Schema, ToolboxObjectTrait } from '..'
import { OutputSlot } from './IOs'
import { Environment, InstancePool } from '../project'
import { CanvasTrait, HtmlTrait, JournalTrait, UidTrait } from '../common'
import { GetGenericInput, Module } from './module'
import * as IOs from './IOs'
import { BehaviorSubject } from 'rxjs'

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
        [Property in keyof TInputs]: IOs.InputSlot<
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
    TSchema extends Schema = Schema,
    TInputs = Record<string, IOs.Input>,
    TState = unknown,
> = Api$Trait<TInputs> &
    ConfigurableTrait<TSchema> &
    UidTrait &
    JournalTrait &
    ToolboxObjectTrait &
    Partial<HtmlTrait> &
    Partial<CanvasTrait> & {
        factory: Module
        environment: Immutable<Environment>
        state?: Immutable<TState>
        instancePool$?: BehaviorSubject<Immutable<InstancePool>>
    }

/**
 * Trait for objects with side effects.
 */
export interface SideEffectsTrait {
    apply()

    dispose()
}
