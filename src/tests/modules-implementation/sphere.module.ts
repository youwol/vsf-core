import { Modules, Contracts } from '../../lib'
import { Material, SphereGeometry, Mesh } from 'three'
import { map } from 'rxjs/operators'

const configuration = {
    schema: {
        name: Modules.stringAttribute({ value: 'Sphere' }),
        radius: Modules.floatAttribute({ value: 0, min: 0 }),
        transform: {
            translation: {
                x: Modules.floatAttribute({ value: 0 }),
                y: Modules.floatAttribute({ value: 0 }),
                z: Modules.floatAttribute({ value: 0 }),
            },
        },
    },
}

const inputs = {
    input$: {
        description: 'Material',
        contract: Contracts.contract<{ material: Material }>({
            description: 'Be able to retrieve a Three.Material',
            requirements: {
                material: Contracts.instanceOf({
                    typeName: 'Three.Material',
                    Type: Material,
                }),
            },
        }),
    },
}

const outputs = (
    arg: Modules.OutputMapperArg<typeof configuration.schema, typeof inputs>,
) => ({
    output$: arg.inputs.input$.pipe(
        map((m) => {
            const geometry = new SphereGeometry(m.configuration.radius, 10, 10)
            // should apply the transformation
            return {
                data: new Mesh(geometry, m.data.material),
                context: m.context,
            }
        }),
    ),
})

export function module(fwdParams) {
    return new Modules.Implementation(
        {
            configuration,
            outputs,
            inputs,
            html: (_, config: { prefix: string }) => ({
                tag: 'div',
                innerText: `${config.prefix}: sphere html view`,
            }),
            canvas: (_, config: { prefix: string }) => ({
                tag: 'div',
                innerText: `${config.prefix}: sphere canvas view`,
            }),
        },
        fwdParams,
    )
}
