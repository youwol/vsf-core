import { firstValueFrom, from } from 'rxjs'
import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { mergeMap } from 'rxjs/operators'

setupCdnHttpConnection()

console.error = () => {
    /*do not display expected errors*/
}

test('error in adaptor', async () => {
    const test$ = from(
        emptyProject().with({
            workflow: {
                branches: ['(of#of)>#a0>(sphere#s0)'],
                configurations: {
                    a0: {
                        adaptor: ({ data, context }) => {
                            return { data: data.a.b, context }
                        },
                    },
                },
            },
        }),
    ).pipe(
        mergeMap((project) => {
            return project.environment.errorChannel$
        }),
    )
    const error = await firstValueFrom(test$)
    expect(error.context).toBeTruthy()
    expect(error.text).toBe("Cannot read properties of undefined (reading 'b')")
})

test('error in contract', async () => {
    const test$ = from(
        emptyProject().with({
            workflow: { branches: ['(of#of)>>(sphere#s0)>>(console)'] },
        }),
    ).pipe(
        mergeMap((project) => {
            return project.environment.errorChannel$
        }),
    )

    const error = await firstValueFrom(test$)
    expect(error.context).toBeTruthy()
    expect(error.text).toBe('Contract resolution failed for s0')
})

test('error in module', async () => {
    const test$ = from(
        emptyProject().with({
            workflow: {
                branches: ['(of#of)>>(map#map)>>(console)'],
                configurations: {
                    map: {
                        project: ({ data }) => data.a.b,
                    },
                },
            },
        }),
    ).pipe(
        mergeMap((project) => {
            return project.environment.errorChannel$
        }),
    )

    const error = await firstValueFrom(test$)
    expect(error.context).toBeTruthy()
    expect(error.context.title).toBe('Error in module processing')
    expect(error.text).toBe("Cannot read properties of undefined (reading 'b')")
})
