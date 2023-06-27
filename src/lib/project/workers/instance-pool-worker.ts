import {
    Chart,
    InstancePoolTrait,
    Inspector,
    InstancePool,
} from '../instance-pool'
import { Immutable, Immutables } from '../../common'
import { Environment } from '../environment'
import { ContextLoggerTrait } from '@youwol/logging'
import { Observable, ReplaySubject } from 'rxjs'
import { Modules } from '../..'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import { startWorkerShadowPool } from './in-worker'
import { createInstancePoolProxy, serializeChart } from './utils'
import { filter, map, mergeMap, shareReplay, take, tap } from 'rxjs/operators'
import {
    isProbe,
    ProbeMessageFromWorker,
    ProbeMessageIdKeys,
    ReadyMessage,
    Probe,
} from './models'

export type ImplementationProxy = Modules.ImplementationTrait
export type ConnectionProxy = Modules.ConnectionTrait

type LocalisationInWorkerPool = {
    workerId: string
    taskId: string
}

export class InstancePoolWorker implements InstancePoolTrait {
    public readonly modules: Immutables<ImplementationProxy>
    public readonly connections: Immutables<ConnectionProxy>
    public readonly workersPool: Immutable<WorkersPoolTypes.WorkersPool>

    private readonly ready$: Observable<unknown>
    private readonly channel$: Observable<WorkersPoolTypes.Message>
    public localisation: Immutable<LocalisationInWorkerPool>

    /**
     * Emit when the pool is {@link stop}.
     *
     * @group Observable
     */
    public readonly terminated$ = new ReplaySubject<undefined>()

    constructor(params: {
        modules?: Immutables<ImplementationProxy>
        connections?: Immutables<ConnectionProxy>
        localisation?: Immutable<LocalisationInWorkerPool>
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
        channel$?: Observable<WorkersPoolTypes.Message>
        ready$?: Observable<unknown>
    }) {
        Object.assign(this, { modules: [], connections: [] }, params)
        this.terminated$ = new ReplaySubject(1)
        if (this.channel$) {
            return
        }
        this.channel$ = this.workersPool.schedule({
            title: 'deploy chart in worker',
            entryPoint: startWorkerShadowPool,
            args: {},
        })
        this.ready$ = this.channel$.pipe(
            filter((m) => m.type == 'Data' && m.data['step'] == 'Ready'),
            take(1),
            tap(({ data }) => {
                this.localisation = {
                    taskId: data['taskId'],
                    workerId: data['workerId'],
                }
            }),
            map((m) => m as unknown as ReadyMessage),
            shareReplay({ bufferSize: 1, refCount: true }),
        )
    }

    static empty(params: {
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
    }) {
        return new InstancePoolWorker(params)
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
            environment: Immutable<Environment>
            scope: Immutable<{ [k: string]: unknown }>
            customArgs: TArgs
            probes: (
                instancePool: InstancePool,
                customArgs: TArgs,
            ) => Probe<ProbeMessageIdKeys>[]
        },
        context: ContextLoggerTrait,
    ): Promise<InstancePoolWorker> {
        const ctx = context.startChild('InstancePoolWorker.deploy')
        const newPool$ = this.ready$.pipe(
            take(1),
            mergeMap(() => {
                ctx.info('Start deployment in worker')
                const uidDeployment = Math.floor(Math.random() * 1e6)
                this.workersPool.sendData({
                    taskId: this.localisation.taskId,
                    data: {
                        kind: 'DeployChart',
                        chart: serializeChart(chart),
                        uidDeployment,
                        customArgs,
                        scope,
                        probes: 'return ' + probes.toString(),
                    },
                })
                return this.channel$.pipe(
                    filter(
                        (m) =>
                            m.type == 'Data' &&
                            m.data['step'] == 'ChartDeployed' &&
                            m.data['uidDeployment'] == uidDeployment,
                    ),
                    take(1),
                )
            }),
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
                })
                return new InstancePoolWorker({
                    modules: [...this.modules, ...modules],
                    connections: [...this.connections, ...connections],
                    localisation: this.localisation,
                    workersPool: this.workersPool,
                    channel$: this.channel$,
                    ready$: this.ready$,
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

    stop({ keepAlive }: { keepAlive?: Immutable<InstancePoolWorker> }) {
        if (keepAlive) {
            throw Error(
                "The 'keepAlive' option is not available in 'InstancePoolWorker'",
            )
        }
        this.workersPool.sendData({
            taskId: this.localisation.taskId,
            data: { kind: 'StopSignal' },
        })
        this.terminated$.next()
    }
}
