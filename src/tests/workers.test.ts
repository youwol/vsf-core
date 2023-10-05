import {
    InstallInputs,
    installTestWorkersPoolModule,
    WorkersPoolTypes,
} from '@youwol/cdn-client'
import { ProjectState } from '../lib/project'
import { createChart, macroInstance, deployMacroInWorker } from '../lib/macros'
import { from, Observable } from 'rxjs'
import { map, mergeMap, reduce, tap } from 'rxjs/operators'
import {
    implementWorkerProcessTrait,
    InstancePoolWorker,
    toClonable,
} from '../lib/deployers'
import { Configurations } from '../lib'
import { setupCdnHttpConnection } from './test.utils'
import { setup } from '../auto-generated'

console.log = () => {
    /*no op*/
}
beforeAll(async () => {
    setupCdnHttpConnection({ localOnly: false })
    await installTestWorkersPoolModule({
        onBeforeWorkerInstall: ({
            message,
        }: {
            message: WorkersPoolTypes.MessageInstall
        }) => {
            const install = message.cdnInstallation as InstallInputs
            const vsfCore = `@youwol/vsf-core#${setup.version}`
            install.modules = install.modules.filter(
                (item) => item !== `@youwol/vsf-core#${setup.version}`,
            )
            const alias = Object.entries(install.aliases).find(
                ([_, v]) =>
                    typeof v === 'string' && v.includes('@youwol/vsf-core'),
            )[0]
            globalThis[alias] = vsfCore
        },
    })
})

function addMapTakeMacro() {
    return (project$: Observable<ProjectState>) => {
        return project$.pipe(
            mergeMap((project) =>
                project.with({
                    macros: [
                        {
                            typeId: 'test-macro',
                            flowchart: {
                                branches: ['(map#map)>>(take#take)'],
                                configurations: {
                                    map: {
                                        project: ({ data }) => ({
                                            data: 2 * data,
                                        }),
                                    },
                                    take: {
                                        count: 1,
                                    },
                                },
                            },
                            api: {
                                inputs: ['0(#map)'],
                                outputs: ['(#take)0'],
                                configuration: {
                                    schema: {
                                        takeCount: new Configurations.Integer({
                                            value: 1,
                                        }),
                                    },
                                    mapper: (instance) => {
                                        return {
                                            take: {
                                                count: instance.takeCount,
                                            },
                                        }
                                    },
                                },
                            },
                        },
                    ],
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
                    project.with({
                        workersPools: [
                            {
                                id,
                                startAt: 1,
                                stretchTo: 1,
                            },
                        ],
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
    from(project.with({ toolboxes: ['@youwol/vsf-rxjs'] }))
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
    from(project.with({ toolboxes: ['@youwol/vsf-rxjs'] }))
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
    from(project.with({ toolboxes: ['@youwol/vsf-rxjs'] }))
        .pipe(
            addWorkerPool('A'),
            addMapTakeMacro(),
            mergeMap((project) =>
                from(
                    project.with({
                        flowchart: {
                            branches: [
                                '(of#of)>>(test-macro#macro)>>(reduce#reduce)',
                            ],
                            configurations: {
                                of: {
                                    args: 42,
                                },
                                macro: {
                                    workersPoolId: 'A',
                                },
                            },
                        },
                    }),
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
    from(project.with({ toolboxes: ['@youwol/vsf-rxjs'] }))
        .pipe(
            addWorkerPool('A'),
            addMapTakeMacro(),
            mergeMap((project) =>
                from(
                    project.with({
                        flowchart: {
                            branches: [
                                '(timer#timer)>>(test-macro#macro)>>(reduce#reduce)',
                            ],
                            configurations: {
                                timer: {
                                    interval: 150,
                                },
                                macro: {
                                    workersPoolId: 'A',
                                    takeCount: 4,
                                },
                            },
                        },
                    }),
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
