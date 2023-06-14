import { Attributes } from '..'
import { emptyProject } from './test.utils'
import {
    BatchCells,
    CellTrait,
    JsCell,
    ProjectsStore,
    ProjectState,
} from '../lib/project'
import { BehaviorSubject, from } from 'rxjs'
import { mergeMap, reduce } from 'rxjs/operators'

test('JsCell no view', async () => {
    let project = emptyProject()
    const source = new Attributes.JsCode({
        value: async ({ project }: { project: ProjectState }) => {
            return await project.parseDag('(map#map)')
        },
    })
    const cell = new JsCell({
        source,
        viewsFactory: [],
    })
    project = await cell.execute(project)
    expect(project.instancePool.modules).toHaveLength(1)
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('JsCell with display', (done) => {
    const project = emptyProject()
    const source = new Attributes.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.parseDag('(map#map)')
            cell.display('a test', { innerText: 'test' })
            return project
        },
    })

    const cell = new JsCell({
        source,
        viewsFactory: [],
    })

    from(cell.execute(project))
        .pipe(
            mergeMap(() => {
                return cell.outputs$
            }),
            reduce((acc, e) => [...acc, e], []),
        )
        .subscribe((outputs) => {
            // expect the element displayed + success elements
            expect(outputs).toHaveLength(2)
            // success element
            expect(outputs[1]).toEqual({
                class: 'fas fa-check fv-text-success',
            })
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('JsCell with log', (done) => {
    const project = emptyProject()
    const source = new Attributes.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.parseDag('(map#map)')
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
                    return { innerText: `value is ${d.value}` }
                },
            },
            {
                name: 'twice the solution',
                isCompatible: (d) => (d as { value: number }).value == 84,
                view: (d: { value: 84 }) => {
                    return Promise.resolve({
                        id: 'test-2',
                        innerText: `value is ${d.value}`,
                    })
                },
            },
        ],
    })

    from(cell.execute(project))
        .pipe(
            mergeMap(() => {
                return cell.outputs$
            }),
            reduce((acc, e) => [...acc, e], []),
        )
        .subscribe((outputs) => {
            // expect the element displayed + success elements
            expect(outputs).toHaveLength(5)
            // success element
            expect(outputs[0]).toEqual({
                class: 'fv-text-focus',
                innerHTML: '<b>a test</b>',
            })
            expect(outputs[1]).toEqual({
                innerText: 'value is 42',
            })
            expect(outputs[2]).toEqual({
                class: 'fv-text-focus',
                innerHTML: '<b>a second test</b>',
            })
            expect(outputs[3].children[0]).toEqual({
                id: 'test-2',
                innerText: 'value is 84',
            })
            expect(outputs[4]).toEqual({
                class: 'fas fa-check fv-text-success',
            })
            done()
        })
})

test('BatchCells', async () => {
    let project = emptyProject()
    const projectsStore$ = new BehaviorSubject<ProjectsStore<CellTrait>>(
        new Map(),
    )
    const source0 = new Attributes.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.parseDag('(map#map)')
            return project
        },
    })
    const source1 = new Attributes.JsCode({
        value: async ({ project }: { project: ProjectState; cell: JsCell }) => {
            project = await project.parseDag('(#map)>>(filter#filter)')
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
