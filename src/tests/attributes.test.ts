import { Attributes } from '../lib'

test('JScode attribute', () => {
    const att = new Attributes.JsCode({
        value: (a: number) => 2 * a,
    })
    expect(att.__value(5)).toBe(10)
})

test('JScode attribute from string', () => {
    const att = new Attributes.JsCode<(a: number) => number>({
        value: 'return (a) => 2 * a',
    })
    expect(att.__value(5)).toBe(10)
})

test('bool attribute', () => {
    const att = new Attributes.Boolean({
        value: true,
    })
    expect(att.getValue()).toBeTruthy()
})

test('string literal attribute', () => {
    const att = new Attributes.StringLiteral<'one' | 'two'>({
        value: 'one',
    })
    expect(att.getValue()).toBe('one')
})
