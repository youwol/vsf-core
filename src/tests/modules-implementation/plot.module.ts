import { Modules, Contracts } from '../../lib'

const inputs = {
    input$: {
        description: 'the input stream',
        contract: Contracts.ofUnknown,
    },
}
const configuration = {
    schema: {
        name: Modules.stringAttribute({
            value: 'Plot',
        }),
        circles: [
            {
                x: Modules.floatAttribute({ value: 50 }),
                y: Modules.floatAttribute({ value: 50 }),
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
                tag: 'div',
                innerText: 'plot html view',
            }),
            canvas: () => ({
                tag: 'div',
                innerText: 'plot canvas view',
            }),
        },
        fwdParams,
    )
}
