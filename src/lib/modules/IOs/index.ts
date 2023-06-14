import { ExpectationTrait } from './contract'
//export * as Contracts from './contract'
export * from './slot'

export type Input<TData = unknown> = {
    description?: string
    contract?: ExpectationTrait<TData>
}
