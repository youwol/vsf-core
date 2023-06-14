import { asImmutable } from '../lib'
import { AssertTrue as Assert, IsExact } from 'conditional-type-checks'

test('asImmutable', async () => {
    const mutable = { a: [1], b: { c: [2, 3] } }
    const immutable = asImmutable(mutable)
    type A = {
        a: readonly number[]
        b: { c: readonly number[] }
    }
    // Test is realized at compile time
    type _cases = [Assert<IsExact<typeof immutable, A>>]
    expect(true).toBeTruthy()
})
