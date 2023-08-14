//export * as Contracts from './contract'
export * from './slot'
import { Contracts } from '../..'
export type Input<TData = unknown> = {
    description?: string
    contract?: Contracts.ExpectationTrait<TData>
}
