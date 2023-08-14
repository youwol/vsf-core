import { Modules, Configurations, Contracts } from '../../index'

const inputs = {
    input$: {
        description: 'the input stream',
        contract: Contracts.ofUnknown,
    },
}
const configuration = {
    schema: {
        name: new Configurations.String({
            value: 'Plot',
        }),
        circles: [
            {
                x: new Configurations.Float({ value: 50 }),
                y: new Configurations.Float({ value: 50 }),
            },
        ],
    },
}

export function module(fwdParams) {
    return new Modules.Implementation(
        {
            configuration,
            inputs,
            html: () => ({
                innerText: 'plot html view',
            }),
            canvas: () => ({
                innerText: 'plot canvas view',
            }),
        },
        fwdParams,
    )
}
