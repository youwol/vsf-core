import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { attr$ } from '@youwol/flux-view'
import { Connection } from '../lib/connections'
import { Configurations, Modules, Contracts, Projects } from '../lib'
import { map } from 'rxjs/operators'

setupCdnHttpConnection()

test('one module', async () => {
    let project = emptyProject()
    const tb = project.getToolbox('@youwol/vs-flow-core/test-toolbox')
    expect(tb.name).toBe('test-toolbox')
    project = await project.with({
        flowchart: { branches: ['(filter#filter)'] },
    })
    const [modules, connections] = [
        project.main.modules,
        project.main.connections,
    ]
    expect(modules).toHaveLength(1)
    expect(connections).toHaveLength(0)
    expect(project.getModule('filter')).toBeTruthy()
})

test('error: module not available', async () => {
    await expect(() =>
        new Projects.ProjectState().with({
            flowchart: { branches: ['(module-not-exist)'] },
        }),
    ).rejects.toThrow()
})

test('only modules, canvas & html', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: { branches: ['(filter)>#c0>(sphere#sphere)'] },
    })
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(2)

    expect(connections).toHaveLength(1)
    expect(
        [...modules, ...connections].filter((e) =>
            Configurations.implementsConfigurableTrait(e),
        ),
    ).toHaveLength(3)
    expect(connections[0].start.slotId).toBe('output$')
    expect(connections[0].end.slotId).toBe('input$')
    expect(project.getConnection('c0')).toBeTruthy()
    const html = project.instancePool
        .inspector()
        .getModule('sphere')
        .html({ prefix: 'A test' })
    expect(html.innerText).toBe('A test: sphere html view')
    const canvas = project.instancePool
        .inspector()
        .getModule('sphere')
        .canvas({ prefix: 'A test' })
    expect(canvas.innerText).toBe('A test: sphere canvas view')
})

test('modules with IO', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: { branches: ['(filter)0>>0(sphere)'] },
    })
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(2)
    expect(connections).toHaveLength(1)
})

test('repl modules with IO & adaptor', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: {
            branches: ['(filter)0>#c0>0(sphere)'],
            configurations: {
                c0: {
                    adaptor: ({ data }) => ({ data, configuration: {} }),
                },
            },
        },
    })

    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(2)

    expect(connections).toHaveLength(1)
    const instance = project.instancePool
        .inspector()
        .getConnection('c0') as Connection
    expect(instance.configurationInstance.adaptor).toBeTruthy()
    const r = instance.adapt({ data: 5 })
    expect(r).toEqual({ data: 5, configuration: {} })
})

test('repl modules with IO & name', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: {
            branches: ['(filter)0>>0(sphere#s0)>0', '(filter)0>>0(#s0)'],
        },
    })
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(3)
    expect(modules[1].uid).toBe('s0')

    expect(connections).toHaveLength(2)
    expect(connections[0].end.moduleId).toBe('s0')
    expect(connections[0].end.slotId).toBe('input$')
    expect(connections[1].end).toEqual(connections[0].end)
})

test('repl modules with config', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: {
            branches: ['(sphere#s0)'],
            configurations: {
                s0: { transform: { translation: { x: 4 } } },
            },
        },
    })

    const { modules } = project.instancePool
    expect(modules).toHaveLength(1)
    const instance = project.instancePool.inspector().getModule('s0')
    expect(instance.configurationInstance).toEqual({
        name: 'Sphere',
        radius: 0,
        transform: { translation: { x: 4, y: 0, z: 0 } },
        workersPoolId: '',
    })
})

test('repl organize', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: {
            branches: [
                '(filter#filter)>>(map#map)>>(mergeMap#m2)',
                '(of#of)>>#m2',
            ],
        },
        canvas: {
            layers: [{ layerId: 'foo', moduleIds: ['filter', 'map'] }],
        },
    })
    expect(project.main.rootLayer.moduleIds).toEqual(['m2', 'of'])
    expect(project.main.rootLayer.children).toHaveLength(1)
    expect(project.main.rootLayer.children[0].moduleIds).toEqual([
        'filter',
        'map',
    ])
    expect(project.main.rootLayer.children[0].children).toHaveLength(0)
})

test('repl with view & canvas', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: {
            branches: ['(timer#t0)>>(filter#f0)>>(map#m0)'],
            configurations: {
                t0: { name: '1s' },
                f0: {
                    function: ({ data }) => data % 2 == 0,
                },
            },
        },
        views: [
            {
                id: 'Test',
                html: (project) => {
                    const obs = project.inspector().getObservable({
                        moduleId: 'm0',
                        slotId: 'output$',
                    })

                    return {
                        innerText: attr$(obs, () => new Date().toTimeString()),
                    }
                },
            },
        ],
        canvas: {
            annotations: [
                {
                    selector: (elem) => elem.uid === 'm0',
                    html: () => {
                        return {
                            innerText: 'custom canvas element',
                        }
                    },
                },
            ],
        },
    })

    expect(project.views.Test).toBeTruthy()
    expect(project.canvasViews).toHaveLength(1)
})

test('repl misc 0', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: {
            branches: [
                '(filter#filter)>>(map#map)>>(mergeMap#m2)',
                '(of#of)>>(#m2)',
            ],
        },
    })
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(4)
    expect(connections).toHaveLength(3)
})

test('multiple steps', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: {
            branches: ['(timer#t0)>>(filter#f0)>>(map#m0)>>(mergeMap#m1)'],
        },
    })

    const project0 = project
    project = await project.with({
        flowchart: {
            branches: ['(of#of)'],
        },
    })
    project = await project.with({
        flowchart: {
            branches: ['(#of)>>(#m1)'],
        },
    })
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(5)
    expect(connections).toHaveLength(4)
    expect(project.main.rootLayer.moduleIds).toHaveLength(5)
    project.instancePool.stop({ keepAlive: project0.instancePool })
    const disconnected = project.instancePool
        .inspector()
        .flat()
        .connections.filter((c) => c.status$.value == 'disconnected')
    expect(disconnected).toHaveLength(1)
})

test('repl misc 1', async () => {
    let project = emptyProject()
    project = await project.with({
        flowchart: {
            branches: ['(filter)0>#c0>(sphere)'],
            configurations: {
                c0: {
                    adaptor: ({ data }) => ({ data, configuration: {} }),
                },
            },
        },
    })
    const { connections } = project.instancePool
    expect(connections).toHaveLength(1)

    const instance = project.instancePool
        .inspector()
        .getConnection('c0') as Connection

    expect(instance.configurationInstance.adaptor).toBeTruthy()
    const r = instance.adapt({ data: 5 })
    expect(r).toEqual({ data: 5, configuration: {} })
})

test('custom module', async () => {
    const module = new Modules.Module({
        declaration: {
            typeId: 'custom',
        },
        implementation: ({ fwdParams }) => {
            return new Modules.Implementation(
                {
                    configuration: {
                        schema: {
                            coefficient: new Configurations.Float({ value: 1 }),
                        },
                    },
                    inputs: {
                        data$: {
                            description: 'the input stream',
                            contract: Contracts.of<number>({
                                description: 'number',
                                when: () => true,
                            }),
                        },
                    },
                    outputs: (arg) => ({
                        value$: arg.inputs.data$.pipe(
                            map(({ data, configuration, context }) => ({
                                data: configuration.coefficient * data,
                                context,
                            })),
                        ),
                    }),
                },
                fwdParams,
            )
        },
    })
    const project = await emptyProject().with({
        customModules: [module],
        flowchart: {
            branches: ['(custom#m)'],
            configurations: {
                m: {
                    coefficient: 2,
                },
            },
        },
    })
    const instance = project.instancePool.inspector().getModule('m')

    expect(instance).toBeTruthy()
    expect(instance.inputSlots.data$).toBeTruthy()
    expect(instance.outputSlots.value$).toBeTruthy()
    expect(instance.configurationInstance.coefficient).toBe(2)
})

test('worksheets', async () => {
    let project = emptyProject()
    const received = []
    const stdLog = console.log
    console.log = (_, d) => received.push(d)
    project = await project.with({
        worksheets: [
            {
                id: 'test-ws',
                flowchart: {
                    branches: ['(of#of)>>(map#map)>>(console)'],
                },
            },
        ],
    })

    expect(project.worksheets).toHaveLength(1)
    expect(project.runningWorksheets).toHaveLength(0)
    project = await project.runWorksheet('test-ws')
    expect(project.runningWorksheets).toHaveLength(1)
    expect(project.runningWorksheets[0].worksheetId).toBe('test-ws')
    const instancePool = project.runningWorksheets[0].instancePool
    expect(instancePool.modules).toHaveLength(3)
    expect(instancePool.connections).toHaveLength(2)
    expect(instancePool.connections[0].status$.value).toBe('completed')
    expect(instancePool.connections[1].status$.value).toBe('completed')
    expect(received).toHaveLength(1)
    const project2 = await project.runWorksheet('test-ws')
    expect(project).toBe(project2)
    const uid = project.runningWorksheets[0].uid
    project = project.stopWorksheets([uid])
    expect(project.worksheets).toHaveLength(1)
    expect(project.runningWorksheets).toHaveLength(0)
    expect(instancePool.connections[0].status$.value).toBe('disconnected')
    expect(instancePool.connections[1].status$.value).toBe('disconnected')
    console.log = stdLog
})
