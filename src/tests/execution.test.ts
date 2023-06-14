import { mergeMap } from 'rxjs/operators'
import { Mesh, MeshStandardMaterial } from 'three'
import { from } from 'rxjs'
import { emptyProject } from './test.utils'

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('execution', (done) => {
    from(
        emptyProject().parseDag(['(of#of)>>(filter#filter)>#a0>(sphere#s0)'], {
            a0: {
                adaptor: ({ context }) => {
                    return { data: new MeshStandardMaterial(), context }
                },
            },
        }),
    )
        .pipe(
            mergeMap((project) => {
                return project.getObservable({
                    moduleId: 's0',
                    slotId: 'output$',
                })
            }),
        )
        .subscribe(({ data }) => {
            expect(data).toBeInstanceOf(Mesh)
            done()
        })
})
