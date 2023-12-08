import { Configurations } from '..'
import { emptyProject, setupCdnHttpConnection } from './test.utils'
import {
    BatchCells,
    CellTrait,
    insertCell,
    JsCell,
    ProjectsStore,
    ProjectState,
} from '../lib/project'
import { BehaviorSubject, firstValueFrom, from } from 'rxjs'
import { mergeMap, reduce } from 'rxjs/operators'
setupCdnHttpConnection()

test('JsCell no view', async () => {
    let project = emptyProject()
    const source = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState }) => {
            return await project.with({
                workflow: { branches: ['(map#map)'] },
            })
        },
    })
    const cell = new JsCell({
        source,
        viewsFactory: [],
    })
    project = await cell.execute(project)
    expect(project.instancePool.modules).toHaveLength(1)
})

test('JsCell with display', async () => {
    const project = emptyProject()
    const source = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.with({
                workflow: { branches: ['(map#map)'] },
            })
            cell.display('a test', { tag: 'div', innerText: 'test' })
            return project
        },
    })

    const cell = new JsCell({
        source,
        viewsFactory: [],
    })

    const test$ = from(cell.execute(project)).pipe(
        mergeMap(() => {
            return cell.outputs$
        }),
        reduce((acc, e) => [...acc, e], []),
    )
    const outputs = await firstValueFrom(test$)
    // expect the element displayed + success elements
    expect(outputs).toHaveLength(2)
    // success element
    expect(outputs[1]).toEqual({
        tag: 'div',
        class: 'fas fa-check fv-text-success',
    })
})

test('JsCell with log', async () => {
    const project = emptyProject()
    const source = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.with({
                workflow: { branches: ['(map#map)'] },
            })
            cell.log('a test', { value: 42 })
            cell.log('a second test', { value: 84 })
            return project
        },
    })

    const cell = new JsCell({
        source,
        viewsFactory: [
            {
                name: 'the solution',
                isCompatible: (d) => (d as { value: number }).value == 42,
                view: (d: { value: 42 }) => {
                    return { tag: 'div', innerText: `value is ${d.value}` }
                },
            },
            {
                name: 'twice the solution',
                isCompatible: (d) => (d as { value: number }).value == 84,
                view: (d: { value: 84 }) => {
                    return Promise.resolve({
                        tag: 'div',
                        id: 'test-2',
                        innerText: `value is ${d.value}`,
                    })
                },
            },
        ],
    })

    const test$ = from(cell.execute(project)).pipe(
        mergeMap(() => {
            return cell.outputs$
        }),
        reduce((acc, e) => [...acc, e], []),
    )
    const outputs = await firstValueFrom(test$)
    // expect the element displayed + success elements
    expect(outputs).toHaveLength(5)
    // success element
    expect(outputs[0]).toEqual({
        tag: 'div',
        class: 'fv-text-focus',
        innerHTML: '<b>a test</b>',
    })
    expect(outputs[1]).toEqual({
        tag: 'div',
        innerText: 'value is 42',
    })
    expect(outputs[2]).toEqual({
        tag: 'div',
        class: 'fv-text-focus',
        innerHTML: '<b>a second test</b>',
    })
    expect(outputs[3].children[0]).toEqual({
        tag: 'div',
        id: 'test-2',
        innerText: 'value is 84',
    })
    expect(outputs[4]).toEqual({
        tag: 'div',
        class: 'fas fa-check fv-text-success',
    })
})

test('BatchCells', async () => {
    let project = emptyProject()
    const projectsStore$ = new BehaviorSubject<ProjectsStore<CellTrait>>(
        new Map(),
    )
    const source0 = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.with({
                workflow: { branches: ['(map#map)'] },
            })
            return project
        },
    })
    const source1 = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.with({
                workflow: { branches: ['(#map)>>(filter#filter)'] },
            })
            return project
        },
    })
    const cell0 = new JsCell({ source: source0 })
    const cell1 = new JsCell({ source: source1 })

    const batch = new BatchCells({
        cells: [cell0, cell1],
        projectsStore$,
    })
    project = await batch.execute(project)
    expect(project.instancePool.modules).toHaveLength(2)
    expect(project.instancePool.connections).toHaveLength(1)
    // projectsStore$ store the state corresponding to a cell's starting project => only cell1 has one
    expect(projectsStore$.value.has(cell1)).toBeTruthy()
    const projectCell1 = projectsStore$.value.get(cell1)
    expect(projectCell1.instancePool.modules).toHaveLength(1)
})

test('BatchCells when no cells', async () => {
    const project = emptyProject()
    const projectsStore$ = new BehaviorSubject<ProjectsStore<CellTrait>>(
        new Map(),
    )
    const batch = new BatchCells({
        cells: [],
        projectsStore$,
    })
    const project1 = await batch.execute(project)
    expect(project1).toBe(project)
})

test('insert cell', async () => {
    const project = emptyProject()
    const projectsStore$ = new BehaviorSubject<ProjectsStore<CellTrait>>(
        new Map(),
    )
    const source0 = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.with({
                workflow: { branches: ['(map#map)'] },
            })
            return project
        },
    })
    const source1 = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.with({
                workflow: { branches: ['(map#map)>>(filter#filter)'] },
            })
            return project
        },
    })
    const cell0 = new JsCell({ source: source0 })
    const cell1 = new JsCell({ source: source1 })

    const batch = new BatchCells({
        cells: [cell0, cell1],
        projectsStore$,
    })
    await batch.execute(project)
    const source2 = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.with({
                workflow: { branches: ['(of#of)>>(#map)'] },
            })
            return project
        },
    })
    const cell2 = new JsCell({ source: source2 })
    let { newStore, newCells } = insertCell({
        cells: [cell0, cell1],
        cellRef: cell1,
        newCell: cell2,
        where: 'before',
        store: projectsStore$.value,
        statePreserved: false,
    })
    expect(newStore.size).toBe(1)
    expect(newStore.has(cell2)).toBeTruthy()
    expect(newCells).toHaveLength(3)
    projectsStore$.next(newStore)
    // we have [cell0, cell2, cell1] and cell2 has its 'starting' state in projectsStore$
    // upon execution of the next batch, we expect cell1 to have its 'starting' state in projectsStore$
    await new BatchCells({
        cells: newCells,
        projectsStore$,
    }).execute(project)
    newStore = projectsStore$.value
    expect(newStore.size).toBe(2)
    expect(newStore.has(cell2)).toBeTruthy()
    expect(newStore.has(cell1)).toBeTruthy()
    expect(newCells).toHaveLength(3)
    const source3 = new Configurations.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            // No effect
            return project
        },
    })
    const cell3 = new JsCell({ source: source3 })
    ;({ newStore, newCells } = insertCell({
        cells: newCells,
        cellRef: newCells[2],
        newCell: cell3,
        where: 'after',
        store: projectsStore$.value,
        statePreserved: true,
    }))
    // we have now [cell0, cell2, cell1, cell3], cell2 & cell1 still in projectStore
    expect(newStore.size).toBe(2)
    expect(newStore.has(cell2)).toBeTruthy()
    expect(newStore.has(cell1)).toBeTruthy()
    expect(newCells).toHaveLength(4)
})
