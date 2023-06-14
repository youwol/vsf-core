import { Modules, Attributes } from '../../lib'

export const configuration = {
    schema: {
        prefix: new Attributes.String({
            value: '',
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
    _: Modules.OutputMapperArg<typeof configuration.schema, typeof inputs>,
) => ({})

export function module(fwdParams) {
    const impl = new Modules.Implementation(
        {
            configuration,
            inputs,
            outputs,
        },
        fwdParams,
    )
    impl.inputSlots.input$.preparedMessage$.subscribe((d) => {
        console.log(impl.configurationInstance.prefix, d)
    })
    return impl
}
