import { WorkersPoolTypes } from '@youwol/cdn-client'
import { Observable } from 'rxjs'

export type WorkersPoolModel = {
    id: string
    startAt?: number
    stretchTo?: number
}

export type WorkersPoolInstance = {
    model: WorkersPoolModel
    instance: WorkersPoolTypes.WorkersPool
    runtimes$: Observable<{ importedBundles }>
}
