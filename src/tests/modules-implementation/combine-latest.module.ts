import { Modules, Configurations } from '../../lib'
import { map } from 'rxjs/operators'
import { createVariableInputs } from './common'
import { combineLatest } from 'rxjs'

/**
 * ## Example
 *
 * ```
 * {
 *     inputsCount: 3
 * }
 * ```
 */
export const configuration = {
    schema: {
        /**
         * Number of inputs of the module.
         *
         * Default to `2`.
         */
        inputsCount: new Configurations.Integer({
            value: 2,
        }),
    },
}

export const inputs = (fwdParameters) =>
    createVariableInputs(fwdParameters.configurationInstance)

export const outputs = (
    arg: Modules.OutputMapperArg<
        typeof configuration.schema,
        ReturnType<typeof inputs>
    >,
) => ({
    output$: combineLatest(Object.values(arg.inputs)).pipe(
        map((messages) => {
            return {
                data: messages.map((m) => m.data),
                context: Modules.mergeMessagesContext(
                    ...messages.map((m) => m.context),
                ),
            }
        }),
    ),
})

export function module(fwdParams) {
    return new Modules.Implementation(
        {
            configuration,
            inputs: inputs(fwdParams),
            outputs,
        },
        fwdParams,
    )
}
