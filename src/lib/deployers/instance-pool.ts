import { ReplaySubject } from 'rxjs'
import { ContextLoggerTrait, NoContext } from '@youwol/logging'

import { Immutable, Immutables, EnvironmentTrait } from '../common'
import { Modules, Connections } from '..'

/**
 * Specifies resources of a deployment.
 */
export type Chart = {
    /**
     * Modules to deploy.
     *
     * @group Immutable Properties
     */
    modules: Immutables<Modules.ModuleModel>
    /**
     * Connections to deploy.
     *
     * @group Immutable Properties
     */
    connections: Immutables<Connections.ConnectionModel>

    /**
     * Optional metadata associated to the chart
     */
    metadata?: Immutable<{ [k: string]: unknown }>
}

export interface DeployerTrait {
    /**
     * Uid of entity ({@link Modules.Implementation} usually) owning this instance pool.
     */
    parentUid: string

    /**
     * Hint regarding connections of some of the included modules with respect to the parent
     * entity ({@link Modules.Implementation} usually) - if any.
     *
     * Keys are uid of included modules in the pool.
     */
    connectionsHint?: Immutables<ConnectionsHint>

    /**
     * Emit when the pool is {@link stop}.
     *
     * @group Observable
     */
    terminated$: ReplaySubject<undefined>

    /**
     * modules instances
     */
    modules: Immutables<Modules.ImplementationTrait>

    /**
     * connections instances
     */
    connections: Immutables<Connections.ConnectionTrait>

    /**
     * Return an inspector object to retrieve/search objects from the pool.
     */
    inspector(): Inspector

    /**
     * Get a running instance, either module or connection.
     *
     * Short access for {@link Inspector.get}.
     *
     * @param id id of the instance
     */
    get(
        id: string,
    ): Immutable<Connections.ConnectionTrait | Modules.ImplementationTrait>

    /**
     * Deploy a {@link Chart}.
     * Environment is kept unchanged: eventual dependencies should have been installed first (e.g. using
     * {@link EnvironmentTrait}).
     *
     * @param params
     * @param params.chart chart to instantiate
     * @param params.environment running environment
     * @param params.scope scope bounded to the modules deployed
     * @param params.connectionsHint hint regarding connections of some of the included modules with respect to
     * the parent entity ({@link Modules.Implementation} usually) - if any.
     * Keys are uid of included modules in the pool.
     * @param context context for logging purposes
     */
    deploy(
        params: {
            chart: Immutable<Chart>
            environment: Immutable<EnvironmentTrait>
            scope: Immutable<{ [k: string]: unknown }>
            connectionsHint?: Immutables<ConnectionsHint>
        },
        context: ContextLoggerTrait,
    ): Promise<DeployerTrait>

    /**
     * Stop the pool, eventually keeping alive elements from another {@link InstancePool}.
     * @param keepAlive if provided, keep the elements of this pool alive.
     */
    stop({ keepAlive }: { keepAlive?: Immutable<DeployerTrait> })
}

export function implementsDeployerTrait(d: unknown): d is DeployerTrait {
    return (
        d != undefined &&
        (d as DeployerTrait).deploy != undefined &&
        (d as DeployerTrait).modules != undefined &&
        (d as DeployerTrait).connections != undefined
    )
}

export type ConnectionsHint = {
    type: 'input' | 'output'
    parent: string
    child: { moduleId: string; slotId: number }
}
/**
 * This class encapsulates running instances of modules as well as connections.
 *
 */
export class InstancePool implements DeployerTrait {
    public readonly parentUid: string

    public readonly terminated$: ReplaySubject<undefined>

    public readonly modules: Immutables<Modules.ImplementationTrait> = []

    public readonly connections: Immutables<Connections.ConnectionTrait> = []

    public readonly connectionsHint?: Immutables<ConnectionsHint> = []

    constructor(params: {
        modules?: Immutables<Modules.ImplementationTrait>
        connections?: Immutables<Connections.ConnectionTrait>
        parentUid: string
        connectionsHint?: Immutables<ConnectionsHint>
    }) {
        Object.assign(this, { modules: [], connections: [] }, params)
        this.terminated$ = new ReplaySubject(1)
    }

    async deploy(
        {
            chart,
            connectionsHint,
            environment,
            scope,
        }: {
            chart: Immutable<Chart>
            connectionsHint?: Immutables<ConnectionsHint>
            environment: Immutable<EnvironmentTrait>
            scope: Immutable<{ [k: string]: unknown }>
        },
        context: ContextLoggerTrait = NoContext,
    ) {
        return context.withChildAsync('Deploy chart', async (ctx) => {
            ctx.info(
                `Chart contains ${chart.modules.length} module(s) and ${chart.connections.length} connection(s)`,
                chart,
            )

            await environment.installDependencies(
                {
                    modules: chart.modules,
                },
                ctx,
            )
            const modules = await Promise.all(
                chart.modules
                    .filter((m) => m.typeId)
                    .map((m) => {
                        return environment.instantiateModule(
                            {
                                typeId: m.typeId,
                                moduleId: m.uid,
                                configuration: m.configuration,
                                scope,
                            },
                            ctx,
                        )
                    }),
            )
            ctx.info('All modules instantiated', modules)
            const byUid = [...this.modules, ...modules].reduce(
                (acc, e) => ({ ...acc, [e.uid]: e }),
                {},
            )
            const connections = chart.connections.map((connection) => {
                const beforeModule = byUid[connection.start.moduleId]
                const afterModule = byUid[connection.end.moduleId]
                return new Connections.Connection({
                    start: {
                        slotId: Object.values(beforeModule.outputSlots)[
                            connection.start.slotId
                        ].slotId,
                        moduleId: beforeModule.uid,
                    },
                    end: {
                        slotId: Object.values(afterModule.inputSlots)[
                            connection.end.slotId
                        ].slotId,
                        moduleId: afterModule.uid,
                    },
                    configuration: connection.configuration,
                    uid: connection.uid,
                    environment,
                })
            })
            ctx.withChild('Connect new connections', (ctxConnection) => {
                ctxConnection.info(`Connect ${connections.length} connections`)
                connections.forEach((c) => {
                    c.connect({ apiFinder: (uid) => byUid[uid] })
                })
            })

            ctx.info('Chart is running')
            return new InstancePool({
                modules: [...modules, ...this.modules],
                connections: [...connections, ...this.connections],
                parentUid: this.parentUid,
                connectionsHint: [
                    ...this.connectionsHint,
                    ...(connectionsHint || []),
                ],
            })
        })
    }

    stop({ keepAlive }: { keepAlive?: Immutable<InstancePool> } = {}) {
        const toKeep = keepAlive
            ? keepAlive.inspector().flat()
            : { connections: [], modules: [] }
        this.connections
            .filter((c) => !toKeep.connections.includes(c))
            .forEach((c) => {
                c.disconnect()
            })
        this.modules
            .filter((m) => !toKeep.modules.includes(m))
            .filter((m) => m.instancePool$ != undefined)
            .forEach((m) => {
                m.instancePool$.value.stop({ keepAlive })
            })
        this.terminated$.next(undefined)
    }

    inspector(): Inspector {
        return new Inspector({ pool: this })
    }

    get(
        id: string,
    ): Immutable<Connections.ConnectionTrait | Modules.ImplementationTrait> {
        return this.inspector().get(id)
    }
}

export class Inspector {
    public readonly pool: Immutable<DeployerTrait>
    public readonly modules: Immutables<Modules.ImplementationTrait>
    public readonly connections: Immutables<Connections.ConnectionTrait>

    constructor(params: { pool: Immutable<DeployerTrait> }) {
        Object.assign(this, params)
        this.modules = this.pool.modules
        this.connections = this.pool.connections
    }
    /**
     * Get a module running instance.
     * @param moduleId UID of the module
     */
    getModule(moduleId: string): Immutable<Modules.ImplementationTrait> {
        return this.modules.find((m) => m.uid == moduleId)
    }

    /**
     * Get a connection running instance.
     * @param connectionId UID of the connection
     */
    getConnection(
        connectionId: string,
    ): Immutable<Connections.ConnectionTrait> {
        return this.connections.find((c) => c.uid == connectionId)
    }

    /**
     * Get a running instance, either module or connection
     * @param id id of the instance
     */
    get(
        id: string,
    ): Immutable<Connections.ConnectionTrait | Modules.ImplementationTrait> {
        return this.getModule(id) || this.getConnection(id)
    }

    /**
     * Get a module's output slot.
     * @param moduleId UID of the module
     * @param slotId UID of the slot
     */
    getObservable({ moduleId, slotId }: { moduleId: string; slotId: string }) {
        return this.modules.find((m) => m.uid == moduleId).outputSlots[slotId]
            .observable$
    }

    flat(): {
        modules: Immutables<Modules.ImplementationTrait>
        connections: Immutables<Connections.ConnectionTrait>
    } {
        return this.modules
            .filter((module) => module.instancePool$ != undefined)
            .reduce(
                (acc, e) => {
                    const instancePool: Immutable<InstancePool> =
                        e.instancePool$.value
                    const { modules, connections } = instancePool
                        .inspector()
                        .flat()
                    return {
                        connections: [...acc.connections, ...connections],
                        modules: [...acc.modules, ...modules],
                    }
                },
                { connections: this.connections, modules: this.modules },
            )
    }
}
