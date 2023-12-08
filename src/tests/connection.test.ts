import { mergeMessagesContext } from '../lib/modules'
import { firstValueFrom, forkJoin, from } from 'rxjs'
import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { MeshStandardMaterial } from 'three'
import { map, mergeMap, reduce, take } from 'rxjs/operators'

setupCdnHttpConnection()

test('merge context message', () => {
    const merged = mergeMessagesContext(
        { a: { b: 4 } },
        { a: { c: { d: 5 } }, e: 6 },
    )
    expect(merged).toEqual({
        a: {
            b: 4,
            c: {
                d: 5,
            },
        },
        e: 6,
    })
})

test('start$ & end$', async () => {
    const test$ = from(
        emptyProject().with({
            workflow: {
                branches: ['(of#of)>>(delay#delay)>#a0>(sphere#s0)'],
                configurations: {
                    a0: {
                        adaptor: ({ context }) => {
                            return { data: new MeshStandardMaterial(), context }
                        },
                    },
                    debounce: {
                        due: 10,
                    },
                },
            },
        }),
    ).pipe(
        mergeMap((project) => {
            return forkJoin([
                project.getConnection('a0').start$.pipe(take(1)),
                project.getConnection('a0').end$.pipe(take(1)),
            ])
        }),
    )
    const [start, end] = await firstValueFrom(test$)
    expect(start.data).toEqual({})
    expect(end.data).toBeInstanceOf(MeshStandardMaterial)
})

test('transmission delay', async () => {
    const test$ = from(
        emptyProject().with({
            workflow: {
                branches: ['(of#of)>#a0>(map#map)'],
                configurations: {
                    a0: {
                        transmissionDelay: 50,
                    },
                    of: {
                        args: [10, 20, 30],
                        spread: true,
                    },
                },
            },
        }),
    ).pipe(
        mergeMap((project) => {
            return project.getConnection('a0').end$.pipe(map(() => Date.now()))
        }),
        reduce((acc, e) => [...acc, e], []),
    )
    const ends = await firstValueFrom(test$)
    const stamps = ends.map((e) => e - ends[0])
    expect(stamps[0]).toBe(0)
    expect(stamps[1]).toBeGreaterThanOrEqual(49)
    expect(stamps[1]).toBeLessThanOrEqual(55)
    expect(stamps[2]).toBeGreaterThanOrEqual(100)
    expect(stamps[2]).toBeLessThanOrEqual(105)
})
