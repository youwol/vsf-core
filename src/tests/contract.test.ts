/** @format */

import { Context } from '@youwol/logging'
import {
    ExpectationTrait,
    contract,
    of,
    all,
    any,
    attribute,
    count,
    instanceOf,
    single,
    some,
    ofUnknown,
} from '../lib/contracts'

class Material {}
class Mesh {}
class Option1 {}
class Option2 {}

class ExpectCollec {
    static straightLeafNumber: ExpectationTrait<number> = undefined
    static permissiveLeafNumber: ExpectationTrait<number> = undefined
    static permissiveNumber: ExpectationTrait<number> = undefined
    static material = of({
        description: 'material',
        when: (d) => d instanceof Material,
    })
    static mesh = of({
        description: 'mesh',
        when: (d) => d instanceof Mesh,
    })
    static option1 = of({
        description: 'option1',
        when: (d) => d instanceof Option1,
    })
    static option2 = of({
        description: 'option2',
        when: (d) => d instanceof Option2,
    })
}

test('expect free', () => {
    expect(ofUnknown.resolve(42).value).toBe(42)
})

test('straightLeafNumber', () => {
    const context = new Context('Test context', {})
    const straightLeafNumber = of<number>({
        description: `straightLeafNumber`,
        when: (inputData) => typeof inputData == 'number',
        normalizeTo: (accData: number) => accData,
    })

    const scenarios = [
        { data: 5, succeeded: true, value: 5 },
        { data: '5', succeeded: false, value: undefined },
    ]
    scenarios.map((scenario) => {
        const { succeeded, value } = straightLeafNumber.resolve(
            scenario.data,
            context,
        )
        expect(succeeded).toEqual(scenario.succeeded)
        expect(value).toEqual(scenario.value)
    })

    ExpectCollec.straightLeafNumber = straightLeafNumber
})

test('permissiveLeafNumber; no allOf', () => {
    const context = new Context('Test context', {})
    const permissiveLeafNumber = any<number>({
        description: `permissiveLeafNumber`,
        when: [
            ExpectCollec.straightLeafNumber,
            of<number>({
                description: 'stringCompatible',
                when: (inputData) =>
                    typeof inputData == 'string' &&
                    !isNaN(parseFloat(inputData)),
                normalizeTo: (accData: string) => parseFloat(accData),
            }),
        ],
    })

    const scenarios = [
        { data: 5, succeeded: true, value: 5 },
        { data: '5', succeeded: true, value: 5 },
        { data: 'tutu', succeeded: false, value: undefined },
    ]

    scenarios.map((scenario) => {
        const { succeeded, value } = permissiveLeafNumber.resolve(
            scenario.data,
            context,
        )
        expect(succeeded).toEqual(scenario.succeeded)
        expect(value).toEqual(scenario.value)
    })

    ExpectCollec.permissiveLeafNumber = permissiveLeafNumber
})

test('permissiveLeafNumber; with allOf', () => {
    const context = new Context('Test context', {})

    const permissiveLeafNumber = any<number>({
        description: `permissiveLeafNumber`,
        when: [
            ExpectCollec.straightLeafNumber,
            all<number>({
                description: 'stringCompatible',
                when: [
                    of({
                        description: 'is a string',
                        when: (inputData: unknown) =>
                            typeof inputData == 'string',
                    }),
                    of({
                        description: 'can be converted in float',
                        when: (inputData: string) =>
                            !isNaN(parseFloat(inputData)),
                        normalizeTo: (inputData: string) =>
                            parseFloat(inputData),
                    }),
                ],
                normalizeTo: (data: [string, number]) => data[1],
            }),
        ],
        normalizeTo: (accData: number) => accData,
    })

    const scenarios = [
        { data: 5, succeeded: true, value: 5 },
        { data: '5', succeeded: true, value: 5 },
        { data: 'tutu', succeeded: false, value: undefined },
    ]

    scenarios.map((scenario) => {
        const { succeeded, value } = permissiveLeafNumber.resolve(
            scenario.data,
            context,
        )
        expect(succeeded).toEqual(scenario.succeeded)
        expect(value).toEqual(scenario.value)
    })

    ExpectCollec.permissiveLeafNumber = permissiveLeafNumber
})

test('permissiveNumber', () => {
    const context = new Context('Test context', {})

    const permissiveNumber = any<number>({
        description: `permissiveNumber`,
        when: [
            ExpectCollec.permissiveLeafNumber,
            attribute({
                name: 'value',
                when: ExpectCollec.permissiveLeafNumber,
            }),
        ],
        normalizeTo: (accData: number) => accData,
    })

    const scenarios = [
        { data: 5, succeeded: true, value: 5 },
        { data: '5', succeeded: true, value: 5 },
        { data: 'tutu', succeeded: false, value: undefined },
        { data: { value: 5 }, succeeded: true, value: 5 },
        { data: { value: '5' }, succeeded: true, value: 5 },
        { data: { value: 'tutu' }, succeeded: false, value: undefined },
        { data: { tata: 2 }, succeeded: false, value: undefined },
    ]

    scenarios.map((scenario) => {
        const { succeeded, value } = permissiveNumber.resolve(
            scenario.data,
            context,
        )
        expect(succeeded).toEqual(scenario.succeeded)
        expect(value).toEqual(scenario.value)
    })

    ExpectCollec.permissiveNumber = permissiveNumber
})

test('two Numbers; raw', () => {
    const context = new Context('Test context', {})

    const twoNumbers = all<number[]>({
        description: `two numbers`,
        when: [
            of({
                description: 'an array',
                when: (d) => Array.isArray(d),
            }),
            of({
                description: '2 numbers',
                when: (elems: Array<unknown>) => {
                    return (
                        elems.filter(
                            (d) =>
                                ExpectCollec.permissiveNumber.resolve(
                                    d,
                                    context,
                                ).succeeded,
                        ).length == 2
                    )
                },
                normalizeTo: (elems: Array<unknown>) => {
                    return elems
                        .map((d) =>
                            ExpectCollec.permissiveNumber.resolve(d, context),
                        )
                        .filter((d) => d.succeeded)
                        .map((d) => d.value)
                },
            }),
        ],
        normalizeTo: (d: [unknown[], number[]]) => d[1],
    })

    const scenarios = [
        { data: 5, succeeded: false, value: undefined },
        { data: [5, 2], succeeded: true, value: [5, 2] },
        { data: [5, 2, 'aa', 'fef'], succeeded: true, value: [5, 2] },
        { data: [5, 'tutu'], succeeded: false, value: undefined },
        { data: [5, { value: 2 }], succeeded: true, value: [5, 2] },
    ]

    scenarios.map((scenario) => {
        const { succeeded, value } = twoNumbers.resolve(scenario.data, context)
        expect(succeeded).toEqual(scenario.succeeded)
        expect(value).toEqual(scenario.value)
    })
})

test('2 numbers', () => {
    const context = new Context('Test context', {})

    const twoNumbers = count<number>({
        count: 2,
        when: ExpectCollec.permissiveNumber,
    })

    const scenarios = [
        { data: 5, succeeded: false, value: undefined },
        { data: [5, 2], succeeded: true, value: [5, 2] },
        { data: [5, 2, 'aa', 'fef'], succeeded: true, value: [5, 2] },
        { data: [5, 'tutu'], succeeded: false, value: undefined },
        { data: [5, { value: 2 }], succeeded: true, value: [5, 2] },
        { data: ['5', { value: 2 }], succeeded: true, value: [5, 2] },
        { data: [5, { value: 2 }, 7], succeeded: false, value: undefined },
    ]

    scenarios.map((scenario) => {
        const { succeeded, value } = twoNumbers.resolve(scenario.data, context)
        expect(succeeded).toEqual(scenario.succeeded)
        expect(value).toEqual(scenario.value)
    })
})

test('instance of', () => {
    const context = new Context('Test context', {})

    const material = instanceOf<Material>({
        typeName: 'Material',
        Type: Material,
        attNames: ['mat', 'material'],
    })
    const matInstance = new Material()
    const scenarios = [
        { data: matInstance, succeeded: true, value: matInstance },
        { data: { mate: matInstance }, succeeded: false, value: undefined },
        { data: { mat: matInstance }, succeeded: true, value: matInstance },
        {
            data: { material: matInstance },
            succeeded: true,
            value: matInstance,
        },
    ]

    scenarios.map((scenario) => {
        const { succeeded, value } = material.resolve(scenario.data, context)
        expect(succeeded).toEqual(scenario.succeeded)
        expect(value).toEqual(scenario.value)
    })
})

test('some numbers', () => {
    const context = new Context('Test context', {})

    const someNumbers = some<number>({
        description: 'numbers',
        when: ExpectCollec.permissiveNumber,
    })

    const scenarios = [
        { data: 5, succeeded: true, value: [5] },
        { data: [5, 2], succeeded: true, value: [5, 2] },
        {
            data: [5, { value: 2 }, 'aa', 'fef'],
            succeeded: true,
            value: [5, 2],
        },
        { data: 'tutu', succeeded: false, value: undefined },
        { data: ['tutu'], succeeded: false, value: undefined },
    ]

    scenarios.map((scenario) => {
        const { succeeded, value } = someNumbers.resolve(scenario.data, context)
        expect(succeeded).toEqual(scenario.succeeded)
        expect(value).toEqual(scenario.value)
    })
})

test('contract', () => {
    const context = new Context('Test context', {})

    const inputContract = contract({
        description: 'resolve one material & some meshes with some options',
        requirements: {
            mat: single<Material>({ when: ExpectCollec.material }),
            mesh: some<Mesh>({
                description: 'Mesh',
                when: ExpectCollec.mesh,
            }),
        },
        optionals: {
            option1: some<Option1>({
                description: 'Option1',
                when: ExpectCollec.option1,
            }),
            option2: some<Option2>({
                description: 'Option2',
                when: ExpectCollec.option2,
            }),
        },
    })
    const [mesh, mat, option1, option2] = [
        new Mesh(),
        new Material(),
        new Option1(),
        new Option2(),
    ]

    const scenarios = [
        { data: [mesh], succeeded: false, value: undefined },
        {
            data: [mesh, mat],
            succeeded: true,
            value: {
                mesh: [mesh],
                mat: mat,
                option1: undefined,
                option2: undefined,
            },
        },
        { data: [mesh, mat, mat], succeeded: false, value: undefined },
        { data: [5, mesh, 'aa', option1], succeeded: false, value: undefined },
        {
            data: [mesh, mat, mesh, 'aa', option1],
            succeeded: true,
            value: {
                mesh: [mesh, mesh],
                mat: mat,
                option1: [option1],
                option2: undefined,
            },
        },
        {
            data: [mat, mesh, 'aa', option2, option1],
            succeeded: true,
            value: {
                mesh: [mesh],
                mat: mat,
                option1: [option1],
                option2: [option2],
            },
        },
    ]
    scenarios.forEach(({ data, succeeded, value }) => {
        const resolved = inputContract.resolve(data, context)
        expect(resolved.succeeded).toEqual(succeeded)
        expect(resolved.value).toEqual(value)
    })
})
