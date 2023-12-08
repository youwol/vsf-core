import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { firstValueFrom, from, Observable, of } from 'rxjs'
import { mergeMap, tap } from 'rxjs/operators'
import { Configurations } from '../lib'
import { MacroConfiguration, ProjectState } from '../lib/project'
setupCdnHttpConnection()

test('add a macro - no instance', async () => {
    let project = emptyProject()
    project = await project.with({
        macros: [
            {
                typeId: 'test-macro',
                workflow: {
                    branches: ['(map#map)'],
                    configurations: {
                        c0: {
                            adaptor: ({ data }) => ({
                                data,
                                configuration: {},
                            }),
                        },
                    },
                },
            },
        ],
    })
    expect(project.macros).toHaveLength(1)
    expect(project.macros[0].uid).toBe('test-macro')
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(0)
    expect(connections).toHaveLength(0)
})

test('add a macro & layer - no instance', async () => {
    let project = emptyProject()
    project = await project.with({
        macros: [
            {
                typeId: 'test-macro',
                workflow: {
                    branches: ['(map#map)>>(map#map2)'],
                },
            },
        ],
    })

    project = project.addLayer({
        layerId: 'layer',
        macroId: 'test-macro',
        uids: ['map'],
    })
    expect(project.macros).toHaveLength(1)
    const macro = project.macros[0]
    expect(macro.uid).toBe('test-macro')
    expect(macro.modules).toHaveLength(2)
    expect(macro.connections).toHaveLength(1)
    expect(macro.rootLayer.moduleIds).toEqual(['map2'])
    expect(macro.rootLayer.children[0].uid).toBe('layer')
    expect(macro.rootLayer.children[0].moduleIds).toEqual(['map'])
})

test('add a macro + API (index) + instance', async () => {
    let project = emptyProject()
    project = await project.with({
        macros: [
            {
                typeId: 'test-macro',
                workflow: {
                    branches: ['(map#map0)>#c0>(map#map1)'],
                    configurations: {
                        c0: {
                            adaptor: ({ data }) => ({
                                data,
                                configuration: {},
                            }),
                        },
                    },
                },
                api: {
                    inputs: ['0(#map0)'],
                    outputs: ['(#map1)0'],
                },
                html: (instance, config: { prefix: string }) => {
                    const pool = instance.instancePool$.value
                    const [m0, c0, m1] = ['map0', 'c0', 'map1'].map((e) =>
                        pool.inspector().get(e),
                    )
                    return {
                        tag: 'div',
                        innerText: `${config.prefix}: ${m0.uid}>${c0.uid}>${m1.uid}`,
                    }
                },
            },
        ],
    })
    project = await project.parseDag('(test-macro#macro)')
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(1)
    expect(connections).toHaveLength(0)
    expect(modules[0].instancePool$.value.modules).toHaveLength(2)
    expect(modules[0].instancePool$.value.connections).toHaveLength(1)
    expect(project.environment.macrosToolbox.modules).toHaveLength(1)
    const macroInstance = project.instancePool.inspector().getModule('macro')
    const vDOM = macroInstance.html({ prefix: 'test-config' })
    expect(vDOM.innerText).toBe('test-config: map0>c0>map1')
    project.dispose()
    project.instancePool.connections.forEach((c) => {
        expect(c.status$.value).toBe('disconnected')
    })
    modules[0].instancePool$.value.connections.forEach((c) => {
        expect(c.status$.value).toBe('disconnected')
    })
})

test('add 2 macros & play', async () => {
    const project = emptyProject()
    const test$ = of(project).pipe(
        mergeMap(() => {
            return from(
                project.with({
                    workflow: {
                        branches: [
                            '(test-macro0#macroOf)>>(test-macro1#macroMap)',
                        ],
                    },
                    macros: [
                        {
                            typeId: 'test-macro0',
                            workflow: { branches: ['(of#of)>>(map#map)'] },
                            api: {
                                outputs: ['(#map)0'],
                            },
                        },
                        {
                            typeId: 'test-macro1',
                            workflow: { branches: ['(map#map)'] },
                            api: {
                                inputs: ['0(#map)'],
                                outputs: ['(#map)0'],
                            },
                        },
                    ],
                }),
            )
        }),
        tap((project) => {
            const { modules, connections } = project.instancePool
            expect(modules).toHaveLength(2)
            expect(connections).toHaveLength(1)
            expect(project.environment.macrosToolbox.modules).toHaveLength(2)
            const flatPool = project.instancePool.inspector().flat()
            expect(flatPool.connections).toHaveLength(2)
            expect(flatPool.modules).toHaveLength(5)
        }),
        mergeMap((project) => {
            return project.instancePool.inspector().getObservable({
                moduleId: 'macroMap',
                slotId: 'output_0$',
            })
        }),
    )
    const message = await firstValueFrom(test$)
    expect(message.data).toEqual({})
})

function createMacro() {
    return (obs: Observable<ProjectState>) => {
        const schema = {
            value: new Configurations.Float({
                value: 42,
            }),
            factor: new Configurations.Float({
                value: 1,
            }),
        }
        return obs.pipe(
            mergeMap((project) => {
                return from(
                    project.with({
                        macros: [
                            {
                                typeId: 'test-macro0',
                                workflow: {
                                    branches: ['(of#of)>#c>(map#map)'],
                                    configurations: {
                                        c: {
                                            adaptor: (d) => d,
                                        },
                                    },
                                },
                                api: {
                                    inputs: [],
                                    outputs: ['(#map)0'],
                                    configuration: {
                                        schema,
                                        mapper: (config) => ({
                                            of: {
                                                args: config.value,
                                            },
                                            c: {
                                                adaptor: ({
                                                    data,
                                                    context,
                                                }) => {
                                                    return {
                                                        data:
                                                            data *
                                                            config.factor,
                                                        context,
                                                    }
                                                },
                                            },
                                        }),
                                    } as MacroConfiguration<typeof schema>,
                                },
                            },
                        ],
                    }),
                )
            }),
        )
    }
}

test('add 2 macros + default config & play', async () => {
    const project = emptyProject()
    const test$ = of(project).pipe(
        createMacro(),
        mergeMap((project) => {
            return from(
                project.with({
                    workflow: { branches: ['(test-macro0#macro)'] },
                }),
            )
        }),
        mergeMap((project) => {
            return project.instancePool.inspector().getObservable({
                moduleId: 'macro',
                slotId: 'output_0$',
            })
        }),
    )

    const message = await firstValueFrom(test$)
    expect(message.data).toBe(42)
})

test('add 2 macros + dyn. config & play', async () => {
    const project = emptyProject()
    const test$ = of(project).pipe(
        createMacro(),
        mergeMap((project) => {
            return from(
                project.with({
                    workflow: {
                        branches: ['(test-macro0#macro)'],
                        configurations: {
                            macro: {
                                value: 1,
                                factor: 10,
                            },
                        },
                    },
                }),
            )
        }),
        mergeMap((project) => {
            return project.instancePool.inspector().getObservable({
                moduleId: 'macro',
                slotId: 'output_0$',
            })
        }),
    )
    const message = await firstValueFrom(test$)
    expect(message.data).toBe(10)
})
