import { Configurations, Modules } from '../lib'
import { AssertTrue as Assert, IsExact } from 'conditional-type-checks'
import { Observable } from 'rxjs'

test('JScode attribute', () => {
    const att = Modules.jsCodeAttribute(
        {
            value: (a: number) => 2 * a,
        },
        { override: 'final' },
    )
    expect(att.__value(5)).toBe(10)
    expect(att.annotation).toBe('final')
    type _ = Assert<
        IsExact<
            typeof att,
            Configurations.JsCode<(a: number) => number, 'final'>
        >
    >
})

test('JScode attribute from string', () => {
    const att = Modules.jsCodeAttribute<(a: number) => number>({
        value: 'return (a) => 2 * a',
    })
    expect(att.__value(5)).toBe(10)
    expect(att.annotation).toBe('overridable')
    type _ = Assert<
        IsExact<
            typeof att,
            Configurations.JsCode<(a: number) => number, 'overridable'>
        >
    >
})

test('JScode attribute from string with sanitizing needed', () => {
    const att = Modules.jsCodeAttribute<(a: number) => number, 'final'>(
        {
            value: ' \n\t  \n  \t  return (a) => 2 * a \n  \n  ',
        },
        { override: 'final' },
    )
    expect(att.__value(5)).toBe(10)
    expect(att.annotation).toBe('final')
    type _ = Assert<
        IsExact<
            typeof att,
            Configurations.JsCode<(a: number) => number, 'final'>
        >
    >
})

test('bool attribute', () => {
    const att = Modules.booleanAttribute(
        {
            value: true,
        },
        { override: 'final' },
    )
    expect(att.getValue()).toBeTruthy()
    type _ = Assert<IsExact<typeof att, Configurations.Boolean<'final'>>>
})

test('string literal attribute', () => {
    const att = Modules.stringLiteralAttribute<'one' | 'two', 'final'>(
        {
            value: 'one',
        },
        { override: 'final' },
    )
    expect(att.getValue()).toBe('one')
    expect(att.annotation).toBe('final')
    type _ = Assert<
        IsExact<
            typeof att,
            Configurations.StringLiteral<'one' | 'two', 'final'>
        >
    >
})

test('string attribute', () => {
    const att = Modules.stringAttribute(
        {
            value: 'one',
        },
        { override: 'overridable' },
    )
    expect(att.getValue()).toBe('one')
    expect(att.annotation).toBe('overridable')
    type _ = Assert<IsExact<typeof att, Configurations.String<'overridable'>>>
})

test('anyObjectAttribute attribute', () => {
    const value = { content: 'foo' }
    const att = Modules.anyObjectAttribute(
        {
            value,
        },
        { override: 'final' },
    )
    expect(att.getValue()).toBe(value)
    expect(att.annotation).toBe('final')
    type _ = Assert<IsExact<typeof att, Configurations.AnyObject<'final'>>>
})

test('anyAttribute attribute', () => {
    const value = new Observable()
    const att = Modules.anyAttribute({
        value,
    })
    expect(att.getValue()).toBe(value)
    expect(att.annotation).toBe('overridable')
    type _ = Assert<IsExact<typeof att, Configurations.Any<'overridable'>>>
})

test('customAttribute attribute', () => {
    const value = new Observable()
    const att = Modules.customAttribute<Observable<unknown>, 'final'>(
        {
            value,
        },
        { override: 'final' },
    )
    expect(att.getValue()).toBe(value)
    expect(att.annotation).toBe('final')
    type _ = Assert<
        IsExact<
            typeof att,
            Configurations.CustomAttribute<Observable<unknown>, 'final'>
        >
    >
})
