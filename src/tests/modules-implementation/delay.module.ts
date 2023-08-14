import { Modules, Configurations, Contracts } from '../../lib'
import { delay } from 'rxjs/operators'

export const configuration = {
    schema: {
        due: new Configurations.Float({
            value: 0,
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
    output$: arg.inputs.input$.pipe(delay(arg.configuration.due)),
})

export function module(fwdParams) {
    return new Modules.Implementation(
        {
            configuration,
            outputs,
            inputs,
        },
        fwdParams,
    )
}
