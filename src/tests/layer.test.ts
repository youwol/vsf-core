import { Layer } from '../lib/workflows'

const l = new Layer({
    uid: 'l0',
    moduleIds: ['m0', 'm1'],
    children: [
        new Layer({
            uid: 'l1',
            moduleIds: ['m2', 'm3'],
            children: [
                new Layer({
                    uid: 'l2',
                    moduleIds: ['m4'],
                }),
            ],
        }),
        new Layer({
            uid: 'l3',
            moduleIds: ['m5'],
        }),
    ],
})

test('map', () => {
    const removedIds = ['m0', 'm2', 'm4']
    const root = l.map(
        (l) =>
            new Layer({
                ...l,
                moduleIds: l.moduleIds.filter(
                    (uid) => !removedIds.includes(uid),
                ),
            }),
    )
    expect(root.moduleIds).toEqual(['m1'])
    expect(root.children[0].moduleIds).toEqual(['m3'])
    expect(root.children[0].children[0].moduleIds).toEqual([])
    expect(root.children[1].moduleIds).toEqual(['m5'])
})

test('reduce', () => {
    const allModuleIds = l.reduce((acc, e) => [...acc, ...e.moduleIds], [])
    expect(allModuleIds).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5'])
})

test('find', () => {
    const layers = l.filter((l) => l.moduleIds.length == 1)
    expect(layers).toHaveLength(2)
    expect(layers[0].uid).toBe('l2')
    expect(layers[1].uid).toBe('l3')
})

test('merge', () => {
    const mergeWith = new Layer({
        uid: 'l4',
        moduleIds: ['m1', 'm2', 'm5'],
        children: [],
    })
    const layers = l
        .merge({ include: mergeWith })
        .flat()
        .reduce((acc, e) => ({ ...acc, [e.uid]: e }), {})
    expect(layers['l0'].moduleIds).toEqual(['m0'])
    expect(layers['l1'].moduleIds).toEqual(['m3'])
    expect(layers['l2'].moduleIds).toEqual(['m4'])
    expect(layers['l3'].moduleIds).toEqual([])
    expect(layers['l4'].moduleIds).toEqual(['m1', 'm2', 'm5'])
})

test('merge with included layer', () => {
    const mergeWith = new Layer({
        uid: 'l4',
        moduleIds: ['m1', 'm2', 'm5'],
        children: [],
    })
    const layers = l
        .merge({ include: mergeWith })
        .flat()
        .reduce((acc, e) => ({ ...acc, [e.uid]: e }), {})
    expect(layers['l0'].moduleIds).toEqual(['m0'])
    expect(layers['l1'].moduleIds).toEqual(['m3'])
    expect(layers['l2'].moduleIds).toEqual(['m4'])
    expect(layers['l3'].moduleIds).toEqual([])
    expect(layers['l4'].moduleIds).toEqual(['m1', 'm2', 'm5'])
})
