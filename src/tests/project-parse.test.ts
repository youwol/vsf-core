import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { attr$ } from '@youwol/flux-view'
setupCdnHttpConnection()

test('one module', async () => {
    let project = emptyProject()
    const tb = project.getToolbox('@youwol/vs-flow-core/test-toolbox')
    expect(tb.name).toBe('test-toolbox')
    project = await project.parseDag(['(filter#filter)'])
    const [modules, connections] = [
        project.main.modules,
        project.main.connections,
    ]
    expect(modules).toHaveLength(1)
    expect(connections).toHaveLength(0)
    expect(project.getModule('filter')).toBeTruthy()
})

test('only modules, canvas & html', async () => {
    let project = emptyProject()
    project = await project.parseDag('(filter)>#c0>(sphere#sphere)')
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(2)

    expect(connections).toHaveLength(1)
    expect(connections[0].start.slotId).toBe('output$')
    expect(connections[0].end.slotId).toBe('input$')
    expect(project.getConnection('c0')).toBeTruthy()
    const html = project.instancePool
        .getModule('sphere')
        .html({ prefix: 'A test' })
    expect(html.innerText).toBe('A test: sphere html view')
    const canvas = project.instancePool
        .getModule('sphere')
        .canvas({ prefix: 'A test' })
    expect(canvas.innerText).toBe('A test: sphere canvas view')
})

test('modules with IO', async () => {
    let project = emptyProject()
    project = await project.parseDag('(filter)0>>0(sphere)')
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(2)
    expect(connections).toHaveLength(1)
})

test('repl modules with IO & adaptor', async () => {
    let project = emptyProject()
    project = await project.parseDag('(filter)0>#c0>0(sphere)', {
        c0: {
            adaptor: ({ data }) => ({ data, configuration: {} }),
        },
    })
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(2)

    expect(connections).toHaveLength(1)
    const instance = project.instancePool.getConnection('c0')
    expect(instance.configurationInstance.adaptor).toBeTruthy()
    const r = instance.adapt({ data: 5 })
    expect(r).toEqual({ data: 5, configuration: {} })
})

test('repl modules with IO & name', async () => {
    let project = emptyProject()
    project = await project.parseDag([
        '(filter)0>>0(sphere#s0)>0',
        '(filter)0>>0(#s0)',
    ])
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
    project = await project.parseDag('(sphere#s0)', {
        s0: { transform: { translation: { x: 4 } } },
    })
    const { modules } = project.instancePool
    expect(modules).toHaveLength(1)
    const instance = project.instancePool.getModule('s0')
    expect(instance.configurationInstance).toEqual({
        name: 'Sphere',
        radius: 0,
        transform: { translation: { x: 4, y: 0, z: 0 } },
    })
})

test('repl organize', async () => {
    let project = emptyProject()
    project = await project.parseDag([
        '(filter#filter)>>(map#map)>>(mergeMap#m2)',
        '(of#of)>>#m2',
    ])
    project = project.organize([{ layerId: 'foo', uids: ['filter', 'map'] }])
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
    project = await project.parseDag('(timer#t0)>>(filter#f0)>>(map#m0)', {
        t0: { name: '1s' },
        f0: {
            function: ({ data }) => data % 2 == 0,
        },
    })
    project = project.addHtml('Test', (project) => {
        const obs = project.getObservable({
            moduleId: 'm0',
            slotId: 'output$',
        })

        return {
            innerText: attr$(obs, () => new Date().toTimeString()),
        }
    })
    expect(project.views.Test).toBeTruthy()
    project = project.addToCanvas({
        selector: (elem) => elem.uid == 'm0',
        view: () => {
            return {
                innerText: 'custom canvas element',
            }
        },
    })
    expect(project.canvasViews).toHaveLength(1)
})

test('repl misc 0', async () => {
    let project = emptyProject()
    project = await project.parseDag([
        '(filter#filter)>>(map#map)>>(mergeMap#m2)',
        '(of#of)>>(#m2)',
    ])
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(4)
    expect(connections).toHaveLength(3)
})

test('multiple steps', async () => {
    let project = emptyProject()
    project = await project.parseDag([
        '(timer#t0)>>(filter#f0)>>(map#m0)>>(mergeMap#m1)',
    ])
    const project0 = project
    project = await project.parseDag('(of#of)')
    project = await project.parseDag('(#of)>>(#m1)')
    const { modules, connections } = project.instancePool
    expect(modules).toHaveLength(5)
    expect(connections).toHaveLength(4)
    expect(project.main.rootLayer.moduleIds).toHaveLength(5)
    project.instancePool.stop({ keepAlive: project0.instancePool })
    const disconnected = project.instancePool
        .flat()
        .connections.filter((c) => !c.isConnected())
    expect(disconnected).toHaveLength(1)
})

test('repl misc 1', async () => {
    let project = emptyProject()
    project = await project.parseDag('(filter)0>#c0>(sphere)', {
        c0: {
            adaptor: ({ data }) => ({ data, configuration: {} }),
        },
    })
    const { connections } = project.instancePool
    expect(connections).toHaveLength(1)

    const instance = project.instancePool.getConnection('c0')

    expect(instance.configurationInstance.adaptor).toBeTruthy()
    const r = instance.adapt({ data: 5 })
    expect(r).toEqual({ data: 5, configuration: {} })
})
