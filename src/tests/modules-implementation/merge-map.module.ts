import { Modules, Attributes } from '../../lib'
import { mergeMap } from 'rxjs/operators'
import { Observable, of } from 'rxjs'

export const configuration = {
    schema: {
        project: new Attributes.JsCode({
            value: (
                message: Modules.ProcessingMessage,
            ): Observable<Modules.OutputMessage> => of(message),
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
        mergeMap((p) => p.configuration.project(p)),
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
