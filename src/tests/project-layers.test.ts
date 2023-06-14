import { emptyProject } from './test.utils'

test('import', async () => {
    let project = emptyProject()
    project = await project.parseDag('(filter)')
    expect(project.main.modules).toHaveLength(1)
})

test('project layer simple', async () => {
    let project = emptyProject()
    expect(project).toBeTruthy()
    project = await project.parseDag(
        '(timer#m0)>>(filter#m1)>>(map#m2)>>(sphere#m3)',
    )
    expect(project.main.modules).toHaveLength(4)
    expect(project.main.connections).toHaveLength(3)
    expect(project.main.rootLayer.moduleIds).toHaveLength(4)
    expect(project.main.rootLayer.children).toHaveLength(0)
    project = project.addLayer({
        layerId: 'foo',
        uids: ['m1', 'm2', 'm3'],
    })
    expect(project.main.rootLayer.moduleIds).toHaveLength(1)
    expect(project.main.rootLayer.children).toHaveLength(1)
    expect(project.main.rootLayer.children[0].uid).toBe('foo')
    expect(project.main.rootLayer.children[0].moduleIds).toHaveLength(3)
    expect(project.main.rootLayer.children[0].children).toHaveLength(0)

    project = project.addLayer({
        parentLayerId: 'foo',
        layerId: 'bar',
        uids: ['m2', 'm3'],
    })
    expect(project.main.rootLayer.moduleIds).toHaveLength(1)
    expect(project.main.rootLayer.children).toHaveLength(1)
    expect(project.main.rootLayer.children[0].uid).toBe('foo')
    expect(project.main.rootLayer.children[0].moduleIds).toHaveLength(1)
    expect(project.main.rootLayer.children[0].children).toHaveLength(1)

    expect(project.main.rootLayer.children[0].children[0].uid).toBe('bar')
    expect(
        project.main.rootLayer.children[0].children[0].moduleIds,
    ).toHaveLength(2)
    expect(
        project.main.rootLayer.children[0].children[0].children,
    ).toHaveLength(0)
})
