import { Modules, Attributes } from '../../lib'
import { filter } from 'rxjs/operators'

export const configuration = {
    schema: {
        predicate: new Attributes.JsCode({
            value: (
                message: Modules.ProcessingMessage,
                // eslint-disable-next-line unused-imports/no-unused-vars -- for documentation purpose
                index: number,
            ): boolean => message.data != undefined,
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
        filter((message, i) => {
            return message.configuration.predicate(message, i)
        }),
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
