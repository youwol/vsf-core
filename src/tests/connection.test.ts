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
    const expectInRange = (
        value: number,
        { from, to }: { from: number; to: number },
    ) => {
        expect(value).toBeGreaterThanOrEqual(from)
        expect(value).toBeLessThanOrEqual(to)
    }
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
    // The following assertions account for a margin beyond the anticipated delay to accommodate variability.
    // While ideally, we expect the timings to be stamps[1] -> 50 and stamps[2] -> 100, deviations are notably more
    // pronounced in macOS jobs during the py-youwol nightly builds.
    // This discrepancy has led to a high failure rate in certain vsf-core test suites, as tracked in TG-2062.
    expectInRange(stamps[1], { from: 40, to: 75 })
    expectInRange(stamps[2], { from: 90, to: 125 })
})
