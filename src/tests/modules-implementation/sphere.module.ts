import { Modules, Attributes } from '../..'
import { Material, SphereGeometry, Mesh } from 'three'
import { map } from 'rxjs/operators'

const configuration = {
    schema: {
        name: new Attributes.String({ value: 'Sphere' }),
        radius: new Attributes.Float({ value: 0, min: 0 }),
        transform: {
            translation: {
                x: new Attributes.Integer({ value: 0 }),
                y: new Attributes.Float({ value: 0 }),
                z: new Attributes.Float({ value: 0 }),
            },
        },
    },
}

const inputs = {
    input$: {
        description: 'Material',
        contract: Modules.expect.contract<{ material: Material }>({
            description: 'Be able to retrieve a Three.Material',
            requirements: {
                material: Modules.expect.instanceOf({
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
                innerText: `${config.prefix}: sphere html view`,
            }),
            canvas: (_, config: { prefix: string }) => ({
                innerText: `${config.prefix}: sphere canvas view`,
            }),
        },
        fwdParams,
    )
}
