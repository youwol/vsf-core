import * as Attributes from './attributes'
import { NoContext } from '@youwol/logging'
import { Immutable } from '../common'

/**
 * Formalize a JSON-like data-structure in terms of attributes.
 *
 * Used in the definition of a module's {@link Configuration},
 * see {@link AttributeTrait} for the list of available attributes.
 */
export type Schema<TAnnotation = unknown> = {
    [k: string]:
        | Schema<TAnnotation>
        | Schema<TAnnotation>[]
        | Attributes.AttributeTrait<unknown, TAnnotation>
}

/** Helper to define the type of instantiated configuration from the schema type.
 *
 * @typeParam TSchema The type of the schema associated to the configuration of the module.
 */
export type ConfigInstance<TSchema> = {
    [Property in keyof TSchema]: TSchema[Property] extends Attributes.AttributeTrait<
        unknown,
        unknown
    >
        ? ReturnType<TSchema[Property]['getValue']>
        : ConfigInstance<TSchema[Property]>
}

/** Configuration object.
 *
 * @typeParam TSchema The type of the schema associated.
 */
export type Configuration<TSchema extends Schema> = {
    /**
     * schema of the configuration
     */
    schema: TSchema
}

/**
 * @ignore
 */
export function extractConfigWith<T extends Schema>(
    {
        configuration,
        values,
    }: {
        configuration: Immutable<Configuration<T>>
        values?: { [_k: string]: unknown }
    },
    context = NoContext,
): ConfigInstance<T> {
    return context.withChild('Attempt extractWith', (childContext) => {
        const rawExtracted = parseObject(
            configuration.schema as unknown as Schema,
            values || {},
        )
        childContext.info('extracted', rawExtracted)
        return rawExtracted
    })
}

function parseObject<TSchema extends Schema>(model: TSchema, values) {
    return Object.entries(model).reduce((acc, [k, v]) => {
        const asAttribute = v as Attributes.AttributeTrait<unknown, unknown>
        if ('getValue' in asAttribute) {
            return {
                ...acc,
                [k]:
                    values?.[k] != undefined
                        ? asAttribute.withValue(values[k]).getValue()
                        : asAttribute.getValue(),
            }
        }
        return { ...acc, [k]: parseObject(v as Schema, values?.[k]) }
    }, {})
}
