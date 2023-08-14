import { Modules, Configurations } from '../../index'

import { ofUnknown } from '../../lib/modules/IOs/contract'

const inputs = {
    input$: {
        description: 'the input stream',
        contract: ofUnknown,
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
