import { setupCdnHttpConnection } from './test.utils'
import {
    InstallInputs,
    installTestWorkersPoolModule,
    WorkersPoolTypes,
} from '@youwol/cdn-client'
import { setup } from '../auto-generated'
import { ProjectState } from '../lib/project'
import { from, of } from 'rxjs'
import { mergeMap, tap } from 'rxjs/operators'

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

/* eslint-disable-next-line jest/no-done-callback -- TODO: return Promise from subscription instead of using done() */
test('one module', (done) => {
    //const tb = project.getToolbox('@youwol/vs-flow-core/test-toolbox')
    //expect(tb.name).toBe('test-toolbox')
    of(new ProjectState())
        .pipe(
            mergeMap((project) => {
                return from(
                    project.with({
                        toolboxes: ['@youwol/vsf-rxjs', '@youwol/vsf-debug'],
                        workersPools: [
                            {
                                id: 'A',
                                startAt: 1,
                                stretchTo: 1,
                            },
                        ],
                        workflow: {
                            branches: ['(of#of)>>(map#map)>>(console#log)'],
                            configurations: {
                                map: {
                                    workersPoolId: 'A',
                                    project: ({ context }) => {
                                        return {
                                            data: 2,
                                            context,
                                        }
                                    },
                                },
                            },
                        },
                    }),
                )
            }),
            tap((project: ProjectState) => {
                const view = project.instancePool
                    .inspector()
                    .getModule('map')
                    .html()
                expect(view.innerText).toBeTruthy()
            }),
            mergeMap((project: ProjectState) => {
                return project.instancePool.inspector().getModule('log')
                    .inputSlots.input$.preparedMessage$
            }),
            tap(({ data }) => {
                expect(data).toBe(2)
            }),
        )
        .subscribe(() => {
            done()
        })
})

test('error: worker pool does not exist', async () => {
    //const tb = project.getToolbox('@youwol/vs-flow-core/test-toolbox')
    //expect(tb.name).toBe('test-toolbox')
    await expect(() =>
        new ProjectState().with({
            toolboxes: ['@youwol/vsf-rxjs', '@youwol/vsf-debug'],
            workersPools: [],
            workflow: {
                branches: ['(of#of)>>(map#map)>>(console#log)'],
                configurations: {
                    map: {
                        workersPoolId: 'A',
                        project: ({ context }) => {
                            return {
                                data: 2,
                                context,
                            }
                        },
                    },
                },
            },
        }),
    ).rejects.toThrow()
})
