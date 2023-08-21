import { Configurations } from '../lib'
import { Context } from '@youwol/logging'
import { ObservableInput } from 'rxjs'

test('configuration', async () => {
    const context = new Context('conf-test', {})
    const conf = {
        schema: {
            name: new Configurations.String({ value: 'test-conf' }),
            radius: new Configurations.Float({ value: 0, min: 0 }),
            transform: {
                translation: {
                    x: new Configurations.Float({ value: 0 }),
                    y: new Configurations.Float({ value: 0 }),
                    z: new Configurations.Float({ value: 0 }),
                },
            },
            object: new Configurations.AnyObject({
                value: { name: 'foo', id: 'bar' },
            }),
            custom: new Configurations.CustomAttribute<
                ObservableInput<unknown>
            >({
                value: [{}],
            }),
        },
    }

    expect(conf).toBeTruthy()
    const values = Configurations.extractConfigWith(
        {
            configuration: conf,
            values: {
                radius: 1,
                transform: { translation: { x: 1 } },
                object: { name: 'baz' },
                custom: new Promise<void>((resolve) => {
                    resolve()
                }),
            },
        },
        context,
    )
    const base = { ...values }
    delete base.custom
    expect(base).toEqual({
        name: 'test-conf',
        radius: 1,
        transform: {
            translation: {
                x: 1,
                y: 0,
                z: 0,
            },
        },
        object: {
            name: 'baz',
        },
    })
    expect(values.custom).toBeInstanceOf(Promise)
})

test('jsCode', async () => {
    const context = new Context('conf-test', {})
    const conf = {
        schema: {
            fct1: new Configurations.JsCode({ value: () => 42 }),
            fct2: new Configurations.JsCode({ value: '() => 42' }),
            fct3: new Configurations.JsCode({ value: 'return () => 42' }),
            fct4: new Configurations.JsCode({
                value: ' \n \t return () => 42',
            }),
            fct5: new Configurations.JsCode({ value: () => 42 }),
            fct6: new Configurations.JsCode({ value: () => 42 }),
        },
    }
    const values = Configurations.extractConfigWith(
        {
            configuration: conf,
            values: {
                fct5: () => 43,
                fct6: '() => 43',
            },
        },
        context,
    )
    expect(values.fct1()).toBe(42)
    expect(values.fct2()).toBe(42)
    expect(values.fct3()).toBe(42)
    expect(values.fct4()).toBe(42)
    expect(values.fct5()).toBe(43)
    expect(values.fct6()).toBe(43)
})
