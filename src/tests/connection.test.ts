import { mergeMessagesContext } from '../lib/modules'
import { forkJoin, from } from 'rxjs'
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

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('start$ & end$', (done) => {
    from(
        emptyProject().parseDag(['(of#of)>>(delay#delay)>#a0>(sphere#s0)'], {
            a0: {
                adaptor: ({ context }) => {
                    return { data: new MeshStandardMaterial(), context }
                },
            },
            debounce: {
                due: 10,
            },
        }),
    )
        .pipe(
            mergeMap((project) => {
                return forkJoin([
                    project.getConnection('a0').start$.pipe(take(1)),
                    project.getConnection('a0').end$.pipe(take(1)),
                ])
            }),
        )
        .subscribe(([start, end]) => {
            expect(start.data).toEqual({})
            expect(end.data).toBeInstanceOf(MeshStandardMaterial)
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('transmission delay', (done) => {
    from(
        emptyProject().parseDag(['(of#of)>#a0>(map#map)'], {
            a0: {
                transmissionDelay: 50,
            },
            of: {
                args: [10, 20, 30],
                spread: true,
            },
        }),
    )
        .pipe(
            mergeMap((project) => {
                return project
                    .getConnection('a0')
                    .end$.pipe(map(() => Date.now()))
            }),
            reduce((acc, e) => [...acc, e], []),
        )
        .subscribe((ends) => {
            const stamps = ends.map((e) => e - ends[0])
            expect(stamps[0]).toBe(0)
            expect(stamps[1]).toBeGreaterThanOrEqual(50)
            expect(stamps[1]).toBeLessThanOrEqual(55)
            expect(stamps[2]).toBeGreaterThanOrEqual(100)
            expect(stamps[2]).toBeLessThanOrEqual(105)
            done()
        })
})
