import { Configurations } from '../lib'

test('JScode attribute', () => {
    const att = new Configurations.JsCode({
        value: (a: number) => 2 * a,
    })
    expect(att.__value(5)).toBe(10)
})

test('JScode attribute from string', () => {
    const att = new Configurations.JsCode<(a: number) => number>({
        value: 'return (a) => 2 * a',
    })
    expect(att.__value(5)).toBe(10)
})

test('JScode attribute from string with sanitizing needed', () => {
    const att = new Configurations.JsCode<(a: number) => number>({
        value: ' \n\t  \n  \t  return (a) => 2 * a \n  \n  ',
    })
    expect(att.__value(5)).toBe(10)
})

test('bool attribute', () => {
    const att = new Configurations.Boolean({
        value: true,
    })
    expect(att.getValue()).toBeTruthy()
})

test('string literal attribute', () => {
    const att = new Configurations.StringLiteral<'one' | 'two'>({
        value: 'one',
    })
    expect(att.getValue()).toBe('one')
})
