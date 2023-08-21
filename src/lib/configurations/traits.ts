import { ConfigInstance, Configuration, Schema } from '.'
import { Immutable } from '../common'

/**
 * Trait for object that can be configured.
 *
 * @typeParam TSchema The type of the schema associated to the configuration of the module.
 */
export interface ConfigurableTrait<TSchema extends Schema> {
    configuration: Immutable<Configuration<TSchema>>
    configurationInstance: Immutable<ConfigInstance<TSchema>>
}

/**
 * Type guard on {@link ConfigurableTrait}.
 * @param object object to test
 */
export function implementsConfigurableTrait(
    object: unknown,
): object is ConfigurableTrait<Schema> {
    const maybeConf = object as ConfigurableTrait<Schema>
    return (
        maybeConf.configuration != undefined &&
        maybeConf.configurationInstance != undefined &&
        maybeConf.configuration.schema != undefined
    )
}
