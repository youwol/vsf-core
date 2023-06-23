import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { from, Observable, of } from 'rxjs'
import { map, mergeMap, tap } from 'rxjs/operators'
import { Attributes } from '../lib'
import { ProjectState } from '../lib/project'
setupCdnHttpConnection()

test('add a macro - no instance', async () => {
    let project = emptyProject()
    project = await project.parseDag(
        '(map#map)',
        {
            c0: {
                adaptor: ({ data }) => ({ data, configuration: {} }),
            },
        },
        'test-macro',
    )
    expect(project.macros).toHaveLength(1)
    expect(project.macros[0].uid).toBe('test-macro')
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(0)
    expect(connections).toHaveLength(0)
})

test('add a macro & layer - no instance', async () => {
    let project = emptyProject()
    project = await project.parseDag(
        '(map#map)>>(map#map2)',
        {
            c0: {
                adaptor: ({ data }) => ({ data, configuration: {} }),
            },
        },
        'test-macro',
    )
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
    project = await project.parseDag(
        '(map#map0)>#c0>(map#map1)',
        {
            c0: {
                adaptor: ({ data }) => ({ data, configuration: {} }),
            },
        },
        'test-macro',
    )
    project = await project.exposeMacro('test-macro', {
        inputs: ['0(#map0)'],
        outputs: ['(#map1)0'],
        html: (instance, config: { prefix: string }) => {
            const pool = instance.instancePool$.value
            const [m0, c0, m1] = ['map0', 'c0', 'map1'].map((e) => pool.get(e))
            return {
                innerText: `${config.prefix}: ${m0.uid}>${c0.uid}>${m1.uid}`,
            }
        },
    })
    project = await project.parseDag('(test-macro#macro)')
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(1)
    expect(connections).toHaveLength(0)
    expect(modules[0].instancePool$.value.modules).toHaveLength(2)
    expect(modules[0].instancePool$.value.connections).toHaveLength(1)
    expect(project.environment.macrosToolbox.modules).toHaveLength(1)
    const macroInstance = project.instancePool.getModule('macro')
    const vDOM = macroInstance.html({ prefix: 'test-config' })
    expect(vDOM.innerText).toBe('test-config: map0>c0>map1')
    project.dispose()
    project.instancePool.connections.forEach((c) => {
        expect(c.isConnected()).toBeFalsy()
    })
    modules[0].instancePool$.value.connections.forEach((c) => {
        expect(c.isConnected()).toBeFalsy()
    })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('add 2 macros & play', (done) => {
    const project = emptyProject()
    of(project)
        .pipe(
            mergeMap(() => {
                return from(
                    project.parseDag('(of#of)-(map#map)', {}, 'test-macro0'),
                )
            }),
            map((project) => {
                return project.exposeMacro('test-macro0', {
                    inputs: [],
                    outputs: ['(#of)0'],
                })
            }),
            mergeMap((project) => {
                return from(project.parseDag('(map#map)', {}, 'test-macro1'))
            }),
            map((project) => {
                return project.exposeMacro('test-macro1', {
                    inputs: ['0(#map)'],
                    outputs: ['(#map)0'],
                })
            }),
            mergeMap((project) => {
                return from(
                    project.parseDag(
                        '(test-macro0#macroOf)>>(test-macro1#macroMap)',
                    ),
                )
            }),
            tap((project) => {
                const { modules, connections } = project.instancePool
                expect(modules).toHaveLength(2)
                expect(connections).toHaveLength(1)
                expect(project.environment.macrosToolbox.modules).toHaveLength(
                    2,
                )
                const flatPool = project.instancePool.flat()
                expect(flatPool.connections).toHaveLength(2)
                expect(flatPool.modules).toHaveLength(5)
            }),
            mergeMap((project) => {
                return project.instancePool.getObservable({
                    moduleId: 'macroMap',
                    slotId: 'output_0$',
                })
            }),
        )
        .subscribe((message) => {
            expect(message.data).toEqual({})
            done()
        })
})

function createMacro() {
    return (obs: Observable<ProjectState>) => {
        return obs.pipe(
            mergeMap((project) => {
                return from(
                    project.parseDag(
                        '(of#of)>#c>(map#map)',
                        {
                            c: {
                                adaptor: (d) => d,
                            },
                        },
                        'test-macro0',
                    ),
                )
            }),
            map((project) => {
                return project.exposeMacro('test-macro0', {
                    configuration: {
                        schema: {
                            value: new Attributes.Float({
                                value: 42,
                            }),
                            factor: new Attributes.Float({
                                value: 1,
                            }),
                        },
                    },
                    configMapper: (config) => ({
                        of: {
                            args: config.value,
                        },
                        c: {
                            adaptor: ({ data, context }) => {
                                return {
                                    data: data * config.factor,
                                    context,
                                }
                            },
                        },
                    }),
                    inputs: [],
                    outputs: ['(#map)0'],
                })
            }),
        )
    }
}
// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('add 2 macros + default config & play', (done) => {
    const project = emptyProject()
    of(project)
        .pipe(
            createMacro(),
            mergeMap((project) => {
                return from(project.parseDag('(test-macro0#macro)', {}))
            }),
            mergeMap((project) => {
                return project.instancePool.getObservable({
                    moduleId: 'macro',
                    slotId: 'output_0$',
                })
            }),
        )
        .subscribe((message) => {
            expect(message.data).toBe(42)
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('add 2 macros + dyn. config & play', (done) => {
    const project = emptyProject()
    of(project)
        .pipe(
            createMacro(),
            mergeMap((project) => {
                return from(
                    project.parseDag('(test-macro0#macro)', {
                        macro: {
                            value: 1,
                            factor: 10,
                        },
                    }),
                )
            }),
            mergeMap((project) => {
                return project.instancePool.getObservable({
                    moduleId: 'macro',
                    slotId: 'output_0$',
                })
            }),
        )
        .subscribe((message) => {
            expect(message.data).toBe(10)
            done()
        })
})
