import { Modules, Configurations } from '../../lib'
import { delayWhen } from 'rxjs/operators'
import { interval } from 'rxjs'

export const configuration = {
    schema: {
        delayDurationSelector: new Configurations.JsCode({
            value: (value, index) => interval(0),
        }),
    },
}

export const inputs = {
    input$: {
        description: 'the input stream',
        contract: Modules.expect.ofUnknown,
    },
}

export const outputs = (
    arg: Modules.OutputMapperArg<typeof configuration.schema, typeof inputs>,
) => ({
    output$: arg.inputs.input$.pipe(
        delayWhen((m, i) => {
            return arg.configuration.delayDurationSelector(m, i)
        }),
    ),
})

export function module(fwdParams) {
    return new Modules.Implementation<typeof configuration.schema>(
        {
            configuration,
            outputs,
            inputs,
        },
        fwdParams,
    )
}
