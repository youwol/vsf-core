import { InnerMacrosPool, ProjectState } from '../lib/project'
import { from, interval, Observable } from 'rxjs'
import { delay, map, mergeMap, tap } from 'rxjs/operators'
import { Float, Integer } from '../lib/common/configurations/attributes'
import { emptyProject, setupCdnHttpConnection } from './test.utils'

const noOp = () => {
    /*no op*/
}
beforeAll(async () => {
    setupCdnHttpConnection({ localOnly: false })
})

function addMacro() {
    return (project$: Observable<ProjectState>) => {
        return project$.pipe(
            mergeMap((project) =>
                from(
                    project.parseDag(
                        [
                            '(map#map)>>(combineLatest#comb)>#c>(take#take)',
                            '(timer#timer)>>1(#comb)',
                        ],
                        {
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
                        'test-macro',
                    ),
                ),
            ),
            map((project) =>
                project.exposeMacro('test-macro', {
                    inputs: ['0(#map)'],
                    outputs: ['(#take)0'],
                    configuration: {
                        schema: {
                            takeCount: new Integer({ value: 1 }),
                            dueTime: new Float({ value: 0 }),
                            interval: new Float({ value: 100 }),
                        },
                    },
                    configMapper: (instance) => {
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
                }),
            ),
        )
    }
}

function baseTest(options: {
    of: number[]
    delayWhen?: (m) => number
    adaptor?: (m) => { dueTime: number; interval: number }
    purgeOnTerminated: boolean
    policy: 'merge' | 'switch' | 'concat' | 'exhaust'
    takeCount?: number
    dueTime?: number
    interval?: number
}) {
    const project = emptyProject()
    return from(project.import('@youwol/vsf-rxjs')).pipe(
        addMacro(),
        mergeMap((project) =>
            from(
                project.parseDag(
                    '(of#of)>>(delayWhen#delay)>#c>(switchMapMacroTest#macro)>>(reduce#reduce)',
                    {
                        of: {
                            args: options.of,
                            spread: true,
                        },
                        delay: {
                            delayDurationSelector: (m) =>
                                options.delayWhen
                                    ? interval(options.delayWhen(m))
                                    : interval(0),
                        },
                        c: {
                            adaptor: options.adaptor
                                ? (m) => ({
                                      data: m.data,
                                      configuration: {
                                          innerMacro: {
                                              configuration: options.adaptor(m),
                                          },
                                      },
                                      context: m.context,
                                  })
                                : (d) => d,
                        },
                        macro: {
                            innerMacro: {
                                macroTypeId: 'test-macro',
                                configuration: {
                                    takeCount: options.takeCount || 1,
                                    dueTime: options.dueTime || 0,
                                    interval: options.interval || 0,
                                },
                            },
                            purgeOnTerminated: options.purgeOnTerminated,
                            policy: options.policy,
                        },
                    },
                ),
            ),
        ),
        mergeMap((project) => {
            const module = project.instancePool.inspector().getModule('reduce')
            expect(module).toBeTruthy()
            return from(Object.values(module.outputSlots)[0].observable$).pipe(
                map((m) => ({ message: m, project })),
            )
        }),
        delay(0),
        map(({ message, project }) => {
            const macro = project.instancePool.inspector().getModule('macro')
            const state: InnerMacrosPool =
                macro.state as unknown as InnerMacrosPool
            const pool = state.instancePool$.value
            const flatten = project.instancePool
                .inspector()
                .toFlatWorkflowModel()
            expect(macro.state['outerCompleted']).toBeTruthy()
            if (!options.purgeOnTerminated) {
                expect(pool.inspector().modules).toHaveLength(options.of.length)
                expect(flatten.modules).toHaveLength(
                    4 + 4 * options.of.length + options.of.length,
                )
            } else {
                expect(pool.inspector().modules).toHaveLength(0)
                expect(flatten.modules).toHaveLength(4)
            }
            // pool.inspector().modules.forEach((m) => {
            //     m.instancePool$.value.terminated$.subscribe((terminated) => {
            //         expect(terminated).toBeTruthy()
            //     })
            // })
            return { message, project, macro, pool }
        }),
    )
}

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('switch [42]x1 with purge', (done) => {
    const expects = ({ message }) => {
        expect(message.data).toHaveLength(1)
        expect(message.data).toEqual([84])
    }
    baseTest({
        of: [42],
        purgeOnTerminated: true,
        policy: 'switch',
    })
        .pipe(tap(expects))
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('switch [42]x3 with purge', (done) => {
    const expects = ({ message }) => {
        expect(message.data).toHaveLength(3)
        expect(message.data).toEqual([84, 84, 84])
    }
    baseTest({
        of: [42],
        takeCount: 3,
        purgeOnTerminated: true,
        policy: 'switch',
    })
        .pipe(tap(expects))
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('switch [42, 43]x3 with purge', (done) => {
    const expects = ({ message }) => {
        expect(message.data).toHaveLength(3)
        expect(message.data).toEqual([86, 86, 86])
    }
    baseTest({
        of: [42, 43],
        takeCount: 3,
        purgeOnTerminated: true,
        policy: 'switch',
    })
        .pipe(tap(expects))
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('switch [42, 43, 44]x2 without purge', (done) => {
    const expects = ({ message, macro }) => {
        expect(message.data).toHaveLength(2)
        expect(message.data).toEqual([88, 88])
        // everybody as started because of the 'delayWhen'
        expect(macro.state['started'].map((m) => m.data)).toEqual([42, 43, 44])
        expect(macro.state['completed'].map((m) => m.data)).toEqual([44])
        expect(macro.state['terminated'].map((m) => m.data)).toEqual([
            42, 43, 44,
        ])
    }
    baseTest({
        of: [42, 43, 44],
        takeCount: 2,
        purgeOnTerminated: false,
        policy: 'switch',
    })
        .pipe(tap(expects))
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('switch [42, 43]x2 second first then first, without purge', (done) => {
    const expects = ({ message, macro }) => {
        expect(message.data).toHaveLength(4)
        expect(message.data).toEqual([86, 86, 84, 84])
        // everybody as started because of the 'delayWhen'
        expect(macro.state['started'].map((m) => m.data)).toEqual([43, 42])
        expect(macro.state['completed'].map((m) => m.data)).toEqual([43, 42])
        expect(macro.state['terminated'].map((m) => m.data)).toEqual([43, 42])
    }
    const dueTimes = {
        42: 25,
        43: 0,
    }
    baseTest({
        of: [42, 43],
        delayWhen: (m) => (m.data == 42 ? 100 : 0),
        adaptor: (m) => ({
            dueTime: dueTimes[m.data],
            interval: 50,
        }),
        takeCount: 2,
        purgeOnTerminated: false,
        interval: 100,
        policy: 'switch',
    })
        .pipe(tap(expects))
        .subscribe(noOp, noOp, () => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('switch [42, 43]x2 second first + only one, then first, without purge', (done) => {
    const expects = ({ message, macro }) => {
        expect(message.data).toHaveLength(3)
        expect(message.data).toEqual([86, 84, 84])
        // everybody as started because of the 'delayWhen'
        expect(macro.state['started'].map((m) => m.data)).toEqual([43, 42])
        expect(macro.state['completed'].map((m) => m.data)).toEqual([42])
        expect(macro.state['terminated'].map((m) => m.data)).toEqual([43, 42])
    }
    baseTest({
        of: [42, 43],
        delayWhen: (m) => (m.data == 42 ? 25 : 0),
        adaptor: () => ({
            dueTime: 0,
            interval: 50,
        }),
        takeCount: 2,
        purgeOnTerminated: false,
        interval: 100,
        policy: 'switch',
    })
        .pipe(tap(expects))
        .subscribe(noOp, noOp, () => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('merge [42, 43, 44]x2 without purge', (done) => {
    const expects = ({ message, macro }) => {
        expect(message.data).toHaveLength(6)
        expect(message.data).toEqual([84, 86, 88, 84, 86, 88])
        expect(macro.state['started'].map((m) => m.data)).toEqual([42, 43, 44])
        expect(macro.state['completed'].map((m) => m.data)).toEqual([
            42, 43, 44,
        ])
        //expect(macro.state['terminated']).toBeFalsy()
    }
    baseTest({
        of: [42, 43, 44],
        takeCount: 2,
        purgeOnTerminated: false,
        policy: 'merge',
    })
        .pipe(tap(expects))
        .subscribe(noOp, noOp, () => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('merge [42, 43]x2 interleaved, without purge', (done) => {
    const expects = ({ message, macro }) => {
        expect(message.data).toHaveLength(4)
        expect(message.data).toEqual([86, 84, 86, 84])
        expect(macro.state['started'].map((m) => m.data)).toEqual([42, 43])
        expect(macro.state['completed'].map((m) => m.data)).toEqual([43, 42])
    }
    const dueTimes = {
        42: 25,
        43: 0,
    }
    baseTest({
        of: [42, 43],
        adaptor: (m) => ({
            dueTime: dueTimes[m.data],
            interval: 25,
        }),
        takeCount: 2,
        purgeOnTerminated: false,
        interval: 100,
        policy: 'merge',
    })
        .pipe(tap(expects))
        .subscribe(noOp, noOp, () => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('merge [42, 43]x2, 43 done first, with purge', (done) => {
    const expects = ({ message, macro }) => {
        expect(message.data).toHaveLength(4)
        expect(message.data).toEqual([86, 86, 84, 84])
        expect(macro.state['started'].map((m) => m.data)).toEqual([42, 43])
        expect(macro.state['completed'].map((m) => m.data)).toEqual([43, 42])
    }
    const dueTimes = {
        42: 60,
        43: 0,
    }
    baseTest({
        of: [42, 43],
        adaptor: (m) => ({
            dueTime: dueTimes[m.data],
            interval: 50,
        }),
        takeCount: 2,
        purgeOnTerminated: false,
        interval: 100,
        policy: 'merge',
    })
        .pipe(tap(expects))
        .subscribe(noOp, noOp, () => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('concat [42, 43]x2, 43 done first, with purge', (done) => {
    const expects = ({ message, macro }) => {
        expect(message.data).toHaveLength(4)
        expect(message.data).toEqual([84, 84, 86, 86])
        expect(macro.state['started'].map((m) => m.data)).toEqual([42, 43])
        expect(macro.state['completed'].map((m) => m.data)).toEqual([42, 43])
    }
    const dueTimes = {
        42: 60,
        43: 0,
    }
    baseTest({
        of: [42, 43],
        adaptor: (m) => ({
            dueTime: dueTimes[m.data],
            interval: 50,
        }),
        takeCount: 2,
        purgeOnTerminated: true,
        interval: 100,
        policy: 'concat',
    })
        .pipe(tap(expects))
        .subscribe(noOp, noOp, () => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('exhaust [42, 43]x2, 43 done first, with purge', (done) => {
    const expects = ({ message, macro }) => {
        expect(message.data).toHaveLength(2)
        expect(message.data).toEqual([84, 84])
        expect(macro.state['started'].map((m) => m.data)).toEqual([42])
        expect(macro.state['completed'].map((m) => m.data)).toEqual([42])
    }
    const dueTimes = {
        42: 60,
        43: 0,
    }
    baseTest({
        of: [42, 43],
        adaptor: (m) => ({
            dueTime: dueTimes[m.data],
            interval: 50,
        }),
        takeCount: 2,
        purgeOnTerminated: true,
        interval: 100,
        policy: 'exhaust',
    })
        .pipe(tap(expects))
        .subscribe(noOp, noOp, () => {
            done()
        })
})

// test('merge [42, 43, 44]x2 without purge', (done) => {
//     const expects = ({ message, macro }) => {
//         expect(message.data).toHaveLength(3)
//         expect(message.data).toEqual([84, 86, 88])
//         expect(macro.state['started'].map((m) => m.data)).toEqual([42, 43, 44])
//         expect(macro.state['completed'].map((m) => m.data)).toEqual([42, 43, 44])
//         expect(macro.state['terminated']).toBeFalsy()
//     }
//     merge(
//         baseTest({
//             of: [42, 43, 44],
//             purgeOnDone: false,
//             policy: 'merge',
//         }),
//         baseTest({
//             of: [42, 43, 44],
//             purgeOnDone: true,
//             policy: 'merge',
//         }),
//     )
//         .pipe(tap((d) => expects(d)))
//         .subscribe(noOp, noOp, () => {
//             done()
//         })
// })
