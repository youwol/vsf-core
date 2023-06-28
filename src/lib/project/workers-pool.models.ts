import { WorkersPoolTypes } from '@youwol/cdn-client'
import { Observable } from 'rxjs'
import { Version } from './workers/models'

/**
 * Provides information on a workers pool run-time
 */
export type WorkersPoolRunTime = {
    /**
     * Keys are workers' id
     */
    [k: string]: {
        importedBundles: { [k: string]: Version[] }
        executingTaskName?: string
    }
}
export type WorkersPoolModel = {
    id: string
    startAt?: number
    stretchTo?: number
}

export type WorkersPoolInstance = {
    model: WorkersPoolModel
    instance: WorkersPoolTypes.WorkersPool
    runtimes$: Observable<WorkersPoolRunTime>
}
