import { ContextLoggerTrait } from '@youwol/logging'
import { Observable, ReplaySubject } from 'rxjs'
import { filter, map, shareReplay, take } from 'rxjs/operators'
import { WorkersPoolTypes } from '@youwol/webpm-client'

import { Immutable, Immutables, EnvironmentTrait } from '../common'
import { Modules, Connections } from '..'
import {
    startWorkerShadowPool,
    createInstancePoolProxy,
    serializeChart,
    Chart,
    DeployerTrait,
    Inspector,
    InstancePool,
    isProbe,
    ProbeMessageFromWorker,
    ReadyMessage,
    Probe,
} from './'
export type ImplementationProxy = Modules.ImplementationTrait
export type ConnectionProxy = Connections.ConnectionTrait

/**
 * A trait for object related to a worker within a workers pool
 */
export type WorkerEnvironmentTrait = {
    workersPool: Immutable<WorkersPoolTypes.WorkersPool>
    workerId: string
}

/**
 * Return whether the argument match {@link WorkerEnvironmentTrait}
 * @param d
 */
export function implementWorkerEnvironmentTrait(
    d: unknown,
): d is WorkerEnvironmentTrait {
    const env = d as WorkerEnvironmentTrait
    return env.workersPool != undefined && env.workerId != undefined
}
/**
 * A trait for object related to a process executing in a worker within a workers pool
 */
export type WorkerProcessTrait = WorkerEnvironmentTrait & {
    processId: string
    processName: string
}
/**
 * Return whether the argument match {@link WorkerProcessTrait}
 * @param d
 */
export function implementWorkerProcessTrait(
    d: unknown,
): d is WorkerProcessTrait {
    const process = d as WorkerProcessTrait
    return (
        implementWorkerEnvironmentTrait(d) &&
        process.processId != undefined &&
        process.processName != undefined
    )
}

export class InstancePoolWorker implements DeployerTrait, WorkerProcessTrait {
    public readonly parentUid: string
    public readonly modules: Immutables<ImplementationProxy>
    public readonly connections: Immutables<ConnectionProxy>
    public readonly workersPool: Immutable<WorkersPoolTypes.WorkersPool>
    public readonly workerId: string
    public readonly processId: string
    public readonly processName: string
    public readonly channel$: Observable<WorkersPoolTypes.Message>

    /**
     * Emit when the pool is {@link stop}.
     *
     * @group Observable
     */
    public readonly terminated$ = new ReplaySubject<undefined>()

    private constructor(params: {
        parentUid: string
        processName: string
        modules?: Immutables<ImplementationProxy>
        connections?: Immutables<ConnectionProxy>
        processId: string
        workerId: string
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
        channel$: Observable<WorkersPoolTypes.Message>
    }) {
        Object.assign(this, { modules: [], connections: [] }, params)
        this.terminated$ = new ReplaySubject(1)
    }

    static empty({
        parentUid,
        processName,
        workersPool,
    }: {
        parentUid: string
        processName: string
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
    }): Promise<InstancePoolWorker> {
        const channel$ = workersPool.schedule({
            title: processName,
            entryPoint: startWorkerShadowPool,
            args: {
                parentUid,
            },
        })
        const ready$ = channel$.pipe(
            filter((m) => m.type == 'Data' && m.data['step'] == 'Ready'),
            take(1),
            map((m: unknown) => m as ReadyMessage),
            shareReplay({ bufferSize: 1, refCount: true }),
        )

        return new Promise((resolve) => {
            ready$.subscribe(({ data }) => {
                resolve(
                    new InstancePoolWorker({
                        parentUid: parentUid,
                        processName,
                        workerId: data.workerId,
                        processId: data.taskId,
                        channel$,
                        workersPool,
                    }),
                )
            })
        })
    }

    get(id: string) {
        return this.inspector().get(id)
    }

    inspector() {
        return new Inspector({ pool: this })
    }

    async deploy<TArgs>(
        {
            chart,
            environment,
            scope,
            customArgs,
            probes,
        }: {
            chart: Immutable<Chart>
            environment: Immutable<EnvironmentTrait>
            scope: Immutable<{ [k: string]: unknown }>
            customArgs: TArgs
            probes: (instancePool: InstancePool, customArgs: TArgs) => Probe[]
        },
        context: ContextLoggerTrait,
    ): Promise<InstancePoolWorker> {
        const ctx = context.startChild('InstancePoolWorker.deploy')
        ctx.info('Start deployment in worker')
        const uidDeployment = Math.floor(Math.random() * 1e6)
        this.workersPool.sendData({
            taskId: this.processId,
            data: {
                kind: 'DeployChart',
                chart: serializeChart(chart),
                uidDeployment,
                customArgs,
                scope,
                probes: this.workersPool
                    .getWebWorkersProxy()
                    .serializeFunction(probes),
            },
        })

        const newPool$ = this.channel$.pipe(
            filter(
                (m) =>
                    m.type == 'Data' &&
                    m.data['step'] == 'ChartDeployed' &&
                    m.data['uidDeployment'] == uidDeployment,
            ),
            take(1),
            map((message) => {
                ctx.info('Start main thread instance pool proxy creation')
                const probe$ = this.channel$.pipe(
                    filter((m) => m.type == 'Data' && isProbe(m.data)),
                    map((m) => m.data as unknown as ProbeMessageFromWorker),
                )
                const { modules, connections } = createInstancePoolProxy({
                    instancePool: message.data['poolDescriber'],
                    probe$,
                    environment,
                    parentUid: this.parentUid,
                })
                return new InstancePoolWorker({
                    ...this,
                    modules: [...this.modules, ...modules],
                    connections: [...this.connections, ...connections],
                })
            }),
        )
        return new Promise((resolve) => {
            newPool$.subscribe((pool) => {
                ctx.end()
                resolve(pool)
            })
        })
    }

    stop() {
        // keep alive optimization is not implemented for workers
        this.workersPool.sendData({
            taskId: this.processId,
            data: { kind: 'StopSignal' },
        })
        this.terminated$.next(undefined)
    }
}

export function transmitInputMessage(
    macroUid: string,
    taskId: string,
    target: { moduleId: string; slotId: number },
    source$: Observable<unknown>,
    workersPool: Immutable<WorkersPoolTypes.WorkersPool>,
) {
    const send = (kind, message = undefined) => {
        workersPool.sendData({
            taskId: taskId,
            data: {
                kind,
                macro: macroUid,
                ...target,
                // The 'logger' attribute cannot be serialized.
                // It will be created within the worker by the modules.
                message: message && {
                    data: message.data,
                    configuration: message.configuration,
                    context: message.context,
                    scope: message.scope,
                },
            },
        })
    }
    source$.subscribe(
        (m) => send('InputMessage', m),
        () => {
            /*no op on error*/
        },
        () => {
            send('InputClosed')
        },
    )
}
