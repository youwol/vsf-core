import { Environment } from '../lib/project'
import { firstValueFrom, from } from 'rxjs'
import { mergeMap, tap } from 'rxjs/operators'
import {
    installTestWorkersEnvironment,
    setupCdnHttpConnection,
} from './test.utils'

// Typically, the default timeout duration of 5 seconds is sufficient. However, the installation process from remote
// environments, as encountered in this test suite, has occasionally failed (as observed in nightly builds).
// The purpose of extending the timeout is to assess its effect on this issue.
// TG-2062 : High rate of failure for some vsf-core tests suites
jest.setTimeout(30 * 1000)

console.log = () => {
    /*no op*/
}
beforeAll(async () => {
    setupCdnHttpConnection({ localOnly: false })
})

test('import toolboxes', async () => {
    const env = new Environment()
    await env.install({ toolboxes: ['@youwol/vsf-rxjs'], libraries: [] })
    expect(globalThis['@youwol/vsf-rxjs']).toBeTruthy()
    const vsfRxjs = globalThis['@youwol/vsf-rxjs']
    const tb = vsfRxjs.toolbox()
    expect(tb.uid).toBe('@youwol/vsf-rxjs')
    expect(tb).toHaveProperty('modules')
})

test('import libraries', async () => {
    const env = await new Environment().install({
        libraries: [
            '@youwol/rx-vdom as rxDOM',
            `@youwol/http-clients#^1.0.0`,
            `~rxjs as rxjs`,
        ],
        toolboxes: [],
    })
    expect(env.libraries.vsf).toBeTruthy()
    expect(env.libraries.rxDOM).toBeTruthy()
    expect(env.libraries.rxjs).toBeTruthy()
    expect(env.libraries['@youwol/http-clients']).toBeTruthy()
})

test('install dependencies', async () => {
    let env = new Environment()
    env = await env.install({ toolboxes: ['@youwol/vsf-pmp'], libraries: [] })
    expect(globalThis['three']).toBeFalsy()
    await env.installDependencies({ modules: [{ typeId: 'toThree' }] })
    expect(globalThis['three']).toBeTruthy()
    const module = await env.instantiateModule({ typeId: 'toThree', scope: {} })
    expect(module).toBeTruthy()
})

test('add workers pool', async () => {
    const test$ = from(installTestWorkersEnvironment()).pipe(
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
    await firstValueFrom(test$)
})

test('import wrong package (not a toolbox)', async () => {
    const env = new Environment()
    await expect(() =>
        env.install({ toolboxes: ['@youwol/rx-vdom'], libraries: [] }),
    ).rejects.toThrow()
})

test('get factory : module does not exist', async () => {
    const env = new Environment()
    await env.install({ toolboxes: ['@youwol/vsf-rxjs'], libraries: [] })
    expect(() => {
        env.getFactory({ typeId: 'module-not-exist' })
    }).toThrow()
})
