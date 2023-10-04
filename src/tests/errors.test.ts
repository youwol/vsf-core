import { from } from 'rxjs'
import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { mergeMap } from 'rxjs/operators'

setupCdnHttpConnection()

console.error = () => {
    /*do not display expected errors*/
}

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('error in adaptor', (done) => {
    from(
        emptyProject().with({
            flowchart: {
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
    )
        .pipe(
            mergeMap((project) => {
                return project.environment.errorChannel$
            }),
        )
        .subscribe((error) => {
            expect(error.context).toBeTruthy()
            expect(error.text).toBe(
                "Cannot read properties of undefined (reading 'b')",
            )
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('error in contract', (done) => {
    from(
        emptyProject().with({
            flowchart: { branches: ['(of#of)>>(sphere#s0)>>(console)'] },
        }),
    )
        .pipe(
            mergeMap((project) => {
                return project.environment.errorChannel$
            }),
        )
        .subscribe((error) => {
            expect(error.context).toBeTruthy()
            expect(error.text).toBe('Contract resolution failed for s0')
            done()
        })
})

// eslint-disable-next-line jest/no-done-callback -- more readable that way
test('error in module', (done) => {
    from(
        emptyProject().with({
            flowchart: {
                branches: ['(of#of)>>(map#map)>>(console)'],
                configurations: {
                    map: {
                        project: ({ data }) => data.a.b,
                    },
                },
            },
        }),
    )
        .pipe(
            mergeMap((project) => {
                return project.environment.errorChannel$
            }),
        )
        .subscribe((error) => {
            expect(error.context).toBeTruthy()
            expect(error.context.title).toBe('Error in module processing')
            expect(error.text).toBe(
                "Cannot read properties of undefined (reading 'b')",
            )
            done()
        })
})
