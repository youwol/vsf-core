import { mergeMap } from 'rxjs/operators'
import { Mesh, MeshStandardMaterial } from 'three'
import { firstValueFrom, from } from 'rxjs'
import { emptyProject, setupCdnHttpConnection } from './test.utils'

setupCdnHttpConnection()

test('execution', async () => {
    const test$ = from(
        emptyProject().with({
            workflow: {
                branches: ['(of#of)>>(filter#filter)>#a0>(sphere#s0)'],
                configurations: {
                    a0: {
                        adaptor: ({ context }) => {
                            return { data: new MeshStandardMaterial(), context }
                        },
                    },
                },
            },
        }),
    ).pipe(
        mergeMap((project) => {
            return project.getObservable({
                moduleId: 's0',
                slotId: 'output$',
            })
        }),
    )
    const { data } = await firstValueFrom(test$)
    expect(data).toBeInstanceOf(Mesh)
})
