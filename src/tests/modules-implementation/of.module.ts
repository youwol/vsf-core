import { Modules, Attributes } from '../../lib'
import { of } from 'rxjs'

/**
 * ## Examples
 * ### Emit a single value:
 * ```
 * {
 *     args: 1
 * }
 * ```
 * ### Emit values sequentially:
 *```
 *{
 *   args: () => [1, 2, 3],
 *   spread: true
 *}
 *```
 */
export const configuration = {
    schema: {
        /** Argument to emit. If this argument is an array and {@link spread} is `true`, the individual value
         * of the array are emitted separately.
         *
         * Default to `{}`.
         */
        args: new Attributes.Any({
            value: {},
        }),
        /** If {@link args} is an array and this attribute is `true`, the individual value
         * of the array are emitted separately.
         *
         * Default to `false`.
         */
        spread: new Attributes.Boolean({
            value: false,
        }),
    },
}

export const outputs = (
    arg: Modules.OutputMapperArg<typeof configuration.schema, never>,
) => {
    const value = arg.configuration.args
    const spread = Array.isArray(value) && arg.configuration.spread
    const output$ = spread
        ? of(
              ...(value as unknown[]).map((data) => ({
                  data,
                  context: {},
              })),
          )
        : of({
              data: value,
              context: {},
          })
    return {
        output$,
    }
}

export function module(fwdParams) {
    return new Modules.Implementation(
        {
            configuration,
            outputs,
        },
        fwdParams,
    )
}
