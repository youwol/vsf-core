import { emptyProject } from './test.utils'
import { from, merge, Observable, of } from 'rxjs'
import { ProjectState } from '../lib/project'
import {
    concatMap,
    delay,
    map,
    mergeMap,
    reduce,
    switchMap,
    tap,
} from 'rxjs/operators'
import { Configurations, Macros } from '../lib'

function addMacro() {
    return (project$: Observable<ProjectState>) => {
        return project$.pipe(
            mergeMap((project) =>
                from(
                    project.with({
                        macros: [
                            {
                                typeId: 'test-macro',
                                flowchart: {
                                    branches: [
                                        '(map#map)>>(combineLatest#comb)>#c>(delay)>>(take#take)',
                                        '(timer#timer)>>1(#comb)',
                                    ],
                                    configurations: {
                                        comb: {
                                            inputsCount: 2,
                                        },
                                        c: {
                                            adaptor: ({ data }) => {
                                                return {
                                                    data: data[0],
                                                    context: {},
                                                }
                                            },
                                        },
                                        map: {
                                            project: ({ data }) => {
                                                return { data: 2 * data }
                                            },
                                        },
                                        take: {
                                            count: 1,
                                        },
                                        timer: {
                                            dueTime: 0,
                                            interval: 100,
                                        },
                                    },
                                },
                                API: {
                                    inputs: ['0(#map)'],
                                    outputs: ['(#take)0'],
                                    configuration: {
                                        schema: {
                                            takeCount:
                                                new Configurations.Integer({
                                                    value: 1,
                                                }),
                                            dueTime: new Configurations.Float({
                                                value: 0,
                                            }),
                                            interval: new Configurations.Float({
                                                value: 100,
                                            }),
                                        },
                                        mapper: (instance) => {
                                            return {
                                                take: {
                                                    count: instance.takeCount,
                                                },
                                                timer: {
                                                    dueTime: instance.dueTime,
                                                    interval: instance.interval,
                                                },
                                            }
                                        },
                                    },
                                },
                            },
                        ],
                    }),
                ),
            ),
        )
    }
}

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('some test', (done) => {
    const project = emptyProject()

    of(project)
        .pipe(
            addMacro(),
            mergeMap((project) => {
                const state = new Macros.InnerObservablesPool({
                    parentUid: 'test',
                    environment: project.environment,
                })
                return state.inner$({
                    inputSlot: 0,
                    outputSlot: 0,
                    message: { data: 5 },
                    configuration: { takeCount: 2 },
                    macroTypeId: 'test-macro',
                    purgeOnDone: true,
                })
            }),
            tap((d) => {
                console.log(d)
            }),
            reduce((acc, e) => [...acc, e], []),
        )
        .subscribe((d) => {
            expect(d).toHaveLength(2)
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('with merge map', (done) => {
    const project = emptyProject()
    let state: Macros.InnerObservablesPool
    of(project)
        .pipe(
            addMacro(),
            tap((project) => {
                state = new Macros.InnerObservablesPool({
                    parentUid: 'test',
                    environment: project.environment,
                })
            }),
            mergeMap(() => {
                // outer observable
                return merge(of(1).pipe(delay(0)), of(5).pipe(delay(200))).pipe(
                    map((data) => ({ data })),
                )
            }),
            mergeMap(({ data }) => {
                return state
                    .inner$({
                        inputSlot: 0,
                        outputSlot: 0,
                        message: { data },
                        configuration: { takeCount: 3, interval: 100 },
                        macroTypeId: 'test-macro',
                        purgeOnDone: false,
                    })
                    .pipe(delay(0))
            }),
            reduce((acc, e) => [...acc, e], []),
        )
        .subscribe((d) => {
            expect(d).toHaveLength(6)
            const values = d.map(({ data }) => data)
            expect(values).toEqual([2, 2, 10, 2, 10, 10])
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('with switch map', (done) => {
    const project = emptyProject()
    let state: Macros.InnerObservablesPool
    of(project)
        .pipe(
            addMacro(),
            tap((project) => {
                state = new Macros.InnerObservablesPool({
                    parentUid: 'test',
                    environment: project.environment,
                })
            }),
            mergeMap(() => {
                // outer observable
                return merge(of(1).pipe(delay(0)), of(5).pipe(delay(200))).pipe(
                    map((data) => ({ data })),
                )
            }),
            switchMap(({ data }) => {
                return state
                    .inner$({
                        inputSlot: 0,
                        outputSlot: 0,
                        message: { data },
                        configuration: { takeCount: 3, interval: 100 },
                        macroTypeId: 'test-macro',
                        purgeOnDone: false,
                    })
                    .pipe(delay(0))
            }),
            reduce((acc, e) => [...acc, e], []),
        )
        .subscribe((d) => {
            expect(d).toHaveLength(5)
            const values = d.map(({ data }) => data)
            expect(values).toEqual([2, 2, 10, 10, 10])
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('with concat map', (done) => {
    const project = emptyProject()
    let state: Macros.InnerObservablesPool
    of(project)
        .pipe(
            addMacro(),
            tap((project) => {
                state = new Macros.InnerObservablesPool({
                    parentUid: 'test',
                    environment: project.environment,
                })
            }),
            mergeMap(() => {
                // outer observable
                return merge(of(1).pipe(delay(0)), of(5).pipe(delay(200))).pipe(
                    map((data) => ({ data })),
                )
            }),
            concatMap(({ data }) => {
                const args = {
                    inputSlot: 0,
                    outputSlot: 0,
                    message: { data },
                    configuration: { takeCount: 3, interval: 100 },
                    macroTypeId: 'test-macro',
                    purgeOnDone: false,
                }
                return state.inner$(args).pipe(delay(0))
            }),
            reduce((acc, e) => [...acc, e], []),
        )
        .subscribe((d) => {
            expect(d).toHaveLength(6)
            const values = d.map(({ data }) => data)
            expect(values).toEqual([2, 2, 2, 10, 10, 10])
            done()
        })
})
