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
import { Configurations, Deployers } from '../lib'

function addMacro() {
    return (project$: Observable<ProjectState>) => {
        return project$.pipe(
            mergeMap((project) =>
                from(
                    project.with({
                        macros: [
                            {
                                typeId: 'test-macro',
                                workflow: {
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
                                api: {
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
                const state = new Deployers.InnerObservablesPool({
                    parentUid: 'test',
                    environment: project.environment,
                })
                return state.inner$({
                    workflow: {
                        branches: ['(test-macro#macro)'],
                        configurations: { macro: { takeCount: 2 } },
                    },
                    input: '0(#macro)',
                    output: '(#macro)0',
                    message: { data: 5 },
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
    let state: Deployers.InnerObservablesPool
    of(project)
        .pipe(
            addMacro(),
            tap((project) => {
                state = new Deployers.InnerObservablesPool({
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
                        workflow: {
                            branches: ['(test-macro#macro)'],
                            configurations: {
                                macro: { takeCount: 3, interval: 100 },
                            },
                        },
                        input: '0(#macro)',
                        output: '(#macro)0',
                        message: { data },
                        purgeOnDone: false,
                    })
                    .pipe(delay(0))
            }),
            reduce((acc, e) => [...acc, e], []),
        )
        .subscribe((d) => {
            expect(d).toHaveLength(6)
            const values = d.map(({ data }) => data)
            // mergeMap does not enforce a particular policy, we may end in practice one
            // of the two following possibilities
            const expected = [
                [2, 2, 10, 2, 10, 10],
                [2, 2, 2, 10, 10, 10],
            ]
            expect(expected).toContainEqual(values)
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('with switch map', (done) => {
    const project = emptyProject()
    let state: Deployers.InnerObservablesPool
    of(project)
        .pipe(
            addMacro(),
            tap((project) => {
                state = new Deployers.InnerObservablesPool({
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
                        workflow: {
                            branches: ['(test-macro#macro)'],
                            configurations: {
                                macro: { takeCount: 3, interval: 100 },
                            },
                        },
                        message: { data },
                        input: '0(#macro)',
                        output: '(#macro)0',
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
    let state: Deployers.InnerObservablesPool
    of(project)
        .pipe(
            addMacro(),
            tap((project) => {
                state = new Deployers.InnerObservablesPool({
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
                    workflow: {
                        branches: ['(test-macro#macro)'],
                        configurations: {
                            macro: { takeCount: 3, interval: 100 },
                        },
                    },
                    message: { data },
                    input: '0(#macro)',
                    output: '(#macro)0',
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
