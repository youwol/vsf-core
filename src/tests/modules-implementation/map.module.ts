import { Modules, Contracts } from '../../lib'
import { map } from 'rxjs/operators'

export const configuration = {
    schema: {
        project: Modules.jsCodeAttribute(
            {
                value: (
                    message: Modules.ProcessingMessage,
                    // eslint-disable-next-line unused-imports/no-unused-vars -- for documentation purposes
                    index,
                ): Modules.OutputMessage<unknown> => message,
            },
            { override: 'overridable' },
        ),
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
        map((message, i) => {
            return message.configuration.project(message, i)
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
