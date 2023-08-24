import { Modules, Configurations, Contracts } from '../../lib'
import { take } from 'rxjs/operators'

export const configuration = {
    schema: {
        /**
         * The maximum number of next values to emit.
         */
        count: new Configurations.Integer({
            value: 1,
        }),
    },
}

export const inputs = {
    input$: {
        description: 'the input stream',
        contract: Contracts.ofUnknown,
    },
}
export const outputs = (
    arg: Modules.OutputMapperArg<typeof configuration.schema, typeof inputs>,
) => ({
    output$: arg.inputs.input$.pipe(
        // count can not be change at run-time
        take(arg.configuration.count),
    ),
})

export function module(fwdParams) {
    return new Modules.Implementation(
        {
            configuration,
            inputs,
            outputs,
        },
        fwdParams,
    )
}
