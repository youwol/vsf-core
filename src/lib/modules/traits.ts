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
import { Deployers, Configurations } from '..'
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
        [k: string]: OutputSlot
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
    TSchema extends WithModuleBaseSchema<Configurations.Schema> = WithModuleBaseSchema<Configurations.Schema>,
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
        instancePool$?: BehaviorSubject<Immutable<Deployers.DeployerTrait>>
    }

/**
 * Type of the common configuration's schema shared by all modules.
 */
export type SchemaModuleBase = {
    /**
     * worker pool id, required for deployment of the module in a worker pool.
     */
    workersPoolId?: Configurations.String
}

/**
 * Generate the default instance of {@link SchemaModuleBase}.
 */
export function baseModuleSchemaDefaultInstance() {
    return {
        workersPoolId: new Configurations.String({ value: '' }),
    }
}

/**
 * type helper to include {@link SchemaModuleBase} properties to a provided schema.
 *
 * @typeParam T type of the provided schema
 */
export type WithModuleBaseSchema<T extends Configurations.Schema> =
    Partial<SchemaModuleBase> & T
