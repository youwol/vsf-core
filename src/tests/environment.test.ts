import { Environment } from '../lib/project'
import { from } from 'rxjs'
import { mergeMap, tap } from 'rxjs/operators'
import {
    installTestWorkersEnvironment,
    setupCdnHttpConnection,
} from './test.utils'

jest.setTimeout(15 * 1000)
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
    expect(globalThis['THREE']).toBeFalsy()
    await env.installDependencies({ modules: [{ typeId: 'toThree' }] })
    expect(globalThis['THREE']).toBeTruthy()
    const module = await env.instantiateModule({ typeId: 'toThree', scope: {} })
    expect(module).toBeTruthy()
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('add workers pool', (done) => {
    from(installTestWorkersEnvironment())
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
