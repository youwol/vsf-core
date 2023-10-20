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
import {
    OutputSlot,
    GetGenericInput,
    Module,
    Input,
    InputSlot,
    stringAttribute,
} from './'

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
export interface ApiTrait<TInputs> {
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
    TSchema extends WithModuleBaseSchema<
        Configurations.Schema<OverrideType>
    > = WithModuleBaseSchema<Configurations.Schema<OverrideType>>,
    TInputs = Record<string, Input>,
    TState = unknown,
> = ApiTrait<TInputs> &
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
 * This type literal specifies the override kind of a module's configuration attribute.
 * It is used as an annotation for the {@link Configurations.AttributeTrait}.
 *
 * The distinction becomes relevant when processing a message in a module's output definition
 * and dealing with the {@link ProcessingMessage}'s configuration:
 * * An attribute marked as 'final' maintains a value that is equal to the one defined at the module's construction and
 * cannot be changed.
 * * An attribute marked as 'overridable' initially has a value equal to the one defined at the module's construction
 * by default. However, it can be overridden if the {@link InputMessage}'s configuration provides a new value for
 * this attribute.
 */
export type OverrideType = 'final' | 'overridable'

/**
 * The {@link Configurations.Schema} specification for defining a module's configuration now includes the addition of
 * annotations of type {@link OverrideType} to its attributes.
 */
export type SchemaModule = Configurations.Schema<OverrideType>

/**
 * Type of the common configuration's schema shared by all modules.
 */
export type SchemaModuleBase = {
    /**
     * worker pool id, required for deployment of the module in a worker pool.
     */
    workersPoolId?: Configurations.String<'overridable'>
}

/**
 * Generate the default instance of {@link SchemaModuleBase}.
 */
export function baseModuleSchemaDefaultInstance() {
    return {
        workersPoolId: stringAttribute({ value: '' }),
    }
}

/**
 * type helper to include {@link SchemaModuleBase} properties to a provided schema.
 *
 * @typeParam T type of the provided schema
 */
export type WithModuleBaseSchema<T extends SchemaModule> =
    Partial<SchemaModuleBase> & T
