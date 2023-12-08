import {
    setupCdnHttpConnection,
    installTestWorkersEnvironment,
} from './test.utils'
import { ProjectState } from '../lib/project'
import { firstValueFrom, from, of } from 'rxjs'
import { mergeMap, tap } from 'rxjs/operators'

beforeAll(async () => {
    setupCdnHttpConnection({ localOnly: false })
    await installTestWorkersEnvironment()
})

console.log = () => {
    /*no op*/
}
test('one module', async () => {
    //const tb = project.getToolbox('@youwol/vs-flow-core/test-toolbox')
    //expect(tb.name).toBe('test-toolbox')
    const test$ = of(new ProjectState()).pipe(
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
            return project.instancePool.inspector().getModule('log').inputSlots
                .input$.preparedMessage$
        }),
        tap(({ data }) => {
            expect(data).toBe(2)
        }),
    )
    await firstValueFrom(test$)
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
