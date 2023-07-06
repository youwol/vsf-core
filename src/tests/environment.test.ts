import { Environment } from '../lib/project'
import { installTestWorkersPoolModule } from '@youwol/cdn-client'
import { from } from 'rxjs'
import { mergeMap, tap } from 'rxjs/operators'
import { setupCdnHttpConnection } from './test.utils'

beforeAll(async () => {
    setupCdnHttpConnection({ localOnly: false })
})

test('import toolboxes', async () => {
    const env = new Environment()
    await env.import(['@youwol/vsf-rxjs'])
    expect(globalThis['@youwol/vsf-rxjs']).toBeTruthy()
    const vsfRxjs = globalThis['@youwol/vsf-rxjs']
    const tb = vsfRxjs.toolbox()
    expect(tb.uid).toBe('@youwol/vsf-rxjs')
    expect(tb).toHaveProperty('modules')
})

test('install dependencies', async () => {
    let env = new Environment()
    env = await env.import(['@youwol/vsf-pmp'])
    expect(globalThis['THREE']).toBeFalsy()
    await env.installDependencies({ modules: [{ typeId: 'toThree' }] })
    expect(globalThis['THREE']).toBeTruthy()
    const module = await env.instantiateModule({ typeId: 'toThree', scope: {} })
    expect(module).toBeTruthy()
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('add workers pool', (done) => {
    from(installTestWorkersPoolModule())
        .pipe(
            mergeMap(() => {
                return from(
                    new Environment().addWorkersPool({
                        id: 'A',
                        startAt: 1,
                        stretchTo: 1,
                    }),
                )
            }),
            tap((env) => {
                expect(env).toBeTruthy()
                const wp = env.workersPools.find((w) => w.model.id == 'A')
                expect(wp).toBeTruthy()
            }),
        )
        .subscribe(() => done())
})
