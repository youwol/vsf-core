import { mergeMessagesContext } from '../lib/modules'
import { forkJoin, from } from 'rxjs'
import { emptyProject } from './test.utils'
import { MeshStandardMaterial } from 'three'
import { mergeMap, take } from 'rxjs/operators'

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
