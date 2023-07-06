import { installTestWorkersPoolModule } from '@youwol/cdn-client'
import * as vsfCore from '..'
import { createChart, macroInstance, ProjectState } from '../lib/project'
import { from, Observable } from 'rxjs'
import { map, mergeMap, reduce, tap } from 'rxjs/operators'
import {
    implementWorkerProcessTrait,
    InstancePoolWorker,
} from '../lib/project/workers'
import { deployMacroInWorker } from '../lib/project/workers/macro-workers'
import { toClonable } from '../lib/project/workers/utils'
import { Integer } from '../lib/common/configurations/attributes'
import { setupCdnHttpConnection } from './test.utils'

beforeAll(async () => {
    setupCdnHttpConnection({ localOnly: false })
    await installTestWorkersPoolModule()
    // Replacing module normally fetched by the CDN with actual source should be possible in the above call, e.g.:
    //  await installTestWorkersPoolModule({inlinedModules:{'@youwol/vsf-core': vsfCore}})
    // For now we use the following hack, the other extremity of the hack is in the file `in-worker.ts`
    globalThis['vsfCoreTest'] = vsfCore
})

function addMapTakeMacro() {
    return (project$: Observable<ProjectState>) => {
        return project$.pipe(
            mergeMap((project) =>
                from(
                    project.parseDag(
                        '(map#map)>>(take#take)',
                        {
                            map: {
                                project: ({ data }) => ({ data: 2 * data }),
                            },
                            take: {
                                count: 1,
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
                        },
                    },
                    configMapper: (instance) => {
                        return {
                            take: {
                                count: instance.takeCount,
                            },
                        }
                    },
                }),
            ),
        )
    }
}

function addWorkerPool(id: string) {
    return (project$: Observable<ProjectState>) => {
        return project$.pipe(
            mergeMap((project) =>
                from(
                    project.addWorkersPool({
                        id,
                        startAt: 1,
                        stretchTo: 1,
                    }),
                ),
            ),
        )
    }
}

test('to clonable', () => {
    const obj0 = {
        att: () => console.log('test fct'),
    }
    const obj0Cloned = toClonable(obj0)
    expect(typeof obj0Cloned.att).toBe('string')

    const obj1 = {
        att: [true, '42', 42, null],
    }
    const obj1Cloned = toClonable(obj1)
    expect(obj1Cloned.att).toEqual([true, '42', 42, null])

    const obj2 = {
        att: new SharedArrayBuffer(1),
    }
    const obj2Cloned = toClonable(obj2)
    expect(obj2Cloned.att).toBeInstanceOf(SharedArrayBuffer)
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('InstancePoolWorker.empty', (done) => {
    const uid = 'test'
    const project = new ProjectState()
    from(project.import('@youwol/vsf-rxjs'))
        .pipe(
            addWorkerPool('A'),
            mergeMap((project) => {
                const wp = project.environment.workersPools.find(
                    (w) => w.model.id == 'A',
                )
                return from(
                    InstancePoolWorker.empty({
                        parentUid: 'test',
                        processName: uid,
                        workersPool: wp.instance,
                    }),
                ).pipe(
                    tap((instancePool) => {
                        expect(
                            implementWorkerProcessTrait(instancePool),
                        ).toBeTruthy()
                        expect(instancePool.modules).toHaveLength(0)
                        expect(instancePool.connections).toHaveLength(0)
                    }),
                    map((instancePool) => ({
                        instancePool,
                        runtime$: wp.runtimes$,
                    })),
                )
            }),
            mergeMap(({ runtime$ }) => {
                return runtime$
            }),
            tap((runtime) => {
                expect(Object.values(runtime)).toHaveLength(1)
                expect(Object.values(runtime)[0]).toHaveProperty(
                    'importedBundles',
                )
                const importedBundles = Object.keys(
                    Object.values(runtime)[0].importedBundles,
                )
                expect(
                    importedBundles.includes('@youwol/vsf-core'),
                ).toBeTruthy()
                expect(
                    importedBundles.includes('@youwol/cdn-client'),
                ).toBeTruthy()
            }),
        )
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('deployMacroInWorker', (done) => {
    const project = new ProjectState()
    from(project.import('@youwol/vsf-rxjs'))
        .pipe(
            addWorkerPool('A'),
            addMapTakeMacro(),
            mergeMap((project) => {
                const wp = project.environment.workersPools.find(
                    (w) => w.model.id == 'A',
                )
                const macro = project.macros[0]
                const chart = createChart({
                    macro: macro,
                    dynamicConfig: {},
                })
                return from(
                    deployMacroInWorker({
                        macro,
                        chart,
                        workersPool: wp.instance,
                        fwdParams: {
                            uid: 'test',
                            environment: project.environment,
                            factory: macroInstance(macro),
                            toolbox: project.getToolbox(
                                ProjectState.macrosToolbox,
                            ),
                            scope: {},
                            configurationInstance: { workersPoolId: 'A' },
                            context: undefined,
                        },
                    }),
                )
            }),
            tap((module) => {
                const instancePool = module.instancePool$.value
                expect(implementWorkerProcessTrait(instancePool)).toBeTruthy()
                expect(instancePool.parentUid).toBe('test')
                expect(instancePool.modules).toHaveLength(2)
                expect(instancePool.connections).toHaveLength(1)
                expect(module.configurationInstance).toEqual({
                    workersPoolId: 'A',
                    takeCount: 1,
                })
            }),
            mergeMap((module) => {
                const [input, output] = [
                    module.inputSlots,
                    module.outputSlots,
                ].map((slots) => Object.values(slots)[0])
                input.rawMessage$.next({
                    data: 42,
                    configuration: {},
                    context: {},
                })
                return output.observable$
            }),
            reduce((acc, e) => [...acc, e], []),
            tap(([m]) => {
                expect(m.data).toBe(84)
            }),
        )
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('simple project with workers pool', (done) => {
    const project = new ProjectState()
    from(project.import('@youwol/vsf-rxjs'))
        .pipe(
            addWorkerPool('A'),
            addMapTakeMacro(),
            mergeMap((project) =>
                from(
                    project.parseDag(
                        '(of#of)>>(test-macro#macro)>>(reduce#reduce)',
                        {
                            of: {
                                args: 42,
                            },
                            macro: {
                                workersPoolId: 'A',
                            },
                        },
                    ),
                ),
            ),
            mergeMap((project) => {
                const module = project.instancePool
                    .inspector()
                    .getModule('reduce')
                expect(module).toBeTruthy()
                return from(Object.values(module.outputSlots)[0].observable$)
            }),
            tap((m) => {
                expect(m.data).toHaveLength(1)
                expect(m.data[0]).toBe(84)
            }),
        )
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('simple project with workers pool + stop', (done) => {
    const project = new ProjectState()
    from(project.import('@youwol/vsf-rxjs'))
        .pipe(
            addWorkerPool('A'),
            addMapTakeMacro(),
            mergeMap((project) =>
                from(
                    project.parseDag(
                        '(timer#timer)>>(test-macro#macro)>>(reduce#reduce)',
                        {
                            timer: {
                                interval: 150,
                            },
                            macro: {
                                workersPoolId: 'A',
                                takeCount: 4,
                            },
                        },
                    ),
                ),
            ),
            mergeMap((project) => {
                const inspector = project.instancePool.inspector()
                const macro = inspector.getModule('macro')
                setTimeout(() => macro.instancePool$.value.stop({}), 200)
                const module = inspector.getModule('reduce')
                return from(Object.values(module.outputSlots)[0].observable$)
            }),
            tap((m) => {
                // the timer emit at (ms) 0, 150, 300, 450, ...; the macro take the first 4;
                // but the stop signal is emitted at 200 ms => only 2 items
                expect(m.data).toHaveLength(2)
            }),
        )
        .subscribe(() => {
            done()
        })
})
