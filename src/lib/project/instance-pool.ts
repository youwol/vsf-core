import { extractConfigWith, Immutable, Immutables } from '../common'
import { Modules, Projects } from '..'
import { Connection, ConnectionTrait, ImplementationTrait } from '../modules'
import { Environment } from './environment'
import { ReplaySubject } from 'rxjs'
import { ContextLoggerTrait, NoContext } from '@youwol/logging'
import { WorkflowModel } from './workflow'

/**
 * Specifies resources of a deployment.
 */
export type Chart = {
    /**
     * Modules to deploy.
     *
     * @group Immutable Properties
     */
    modules: Immutables<Projects.ModuleModel>
    /**
     * Connections to deploy.
     *
     * @group Immutable Properties
     */
    connections: Immutables<Projects.ConnectionModel>

    /**
     * Optional metadata associated to the chart
     */
    metadata?: Immutable<{ [k: string]: unknown }>
}

export interface InstancePoolTrait {
    /**
     * Uid of entity ({@link Implementation} usually) owning this instance pool.
     */
    parentUid: string

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
    connections: Immutables<Modules.ConnectionTrait>

    /**
     * Provides an inspector object to retrieve instances of the pool.
     */
    inspector(): Inspector

    /**
     * Deploy a {@link Chart}.
     * Environment is kept unchanged: eventual dependencies should have been installed first (e.g. using
     * {@link deploy} instead}.
     * @param chart chart to instantiate
     * @param environment forwarded environment in instantiation
     * @param scope Scope associated to the modules deployed
     * @param context context for logging purposes
     */
    deploy(
        {
            chart,
            environment,
            scope,
        }: {
            chart: Immutable<Chart>
            environment: Immutable<Environment>
            scope: Immutable<{ [k: string]: unknown }>
        },
        context: ContextLoggerTrait,
    ): Promise<InstancePoolTrait>

    stop({ keepAlive }: { keepAlive?: Immutable<InstancePoolTrait> })
}

export function implementsDeployableTrait(d: unknown): d is InstancePoolTrait {
    return (
        d != undefined &&
        (d as InstancePoolTrait).deploy != undefined &&
        (d as InstancePoolTrait).modules != undefined &&
        (d as InstancePoolTrait).connections != undefined
    )
}

/**
 * This class encapsulates running instances of modules as well as connections.
 *
 */
export class InstancePool implements InstancePoolTrait {
    public readonly parentUid: string

    /**
     * Emit when the pool is {@link stop}.
     *
     * @group Observable
     */
    terminated$: ReplaySubject<undefined>

    /**
     * Included modules
     *
     * @group Immutable Properties
     */
    public readonly modules: Immutables<Modules.ImplementationTrait> = []

    /**
     * Included connections
     *
     * @group Immutable Properties
     */
    public readonly connections: Immutables<Modules.ConnectionTrait> = []

    constructor(params: {
        modules?: Immutables<Modules.ImplementationTrait>
        connections?: Immutables<Modules.ConnectionTrait>
        parentUid: string
    }) {
        Object.assign(this, { modules: [], connections: [] }, params)
        this.terminated$ = new ReplaySubject(1)
    }

    /**
     * Deploy a {@link Chart}.
     * Environment is kept unchanged: eventual dependencies should have been installed first (e.g. using
     * {@link deploy} instead}.
     * @param chart chart to instantiate
     * @param environment forwarded environment in instantiation
     * @param scope Scope associated to the modules deployed
     * @param context context for logging purposes
     */
    async deploy(
        {
            chart,
            environment,
            scope,
        }: {
            chart: Immutable<Chart>
            environment: Immutable<Environment>
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
                return new Connection({
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
            })
        })
    }

    /**
     * Stop the pool, eventually keeping alive elements from another {@link InstancePool}.
     * @param keepAlive if provided, keep the elements of this pool alive.
     */
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
        this.terminated$.next()
    }

    /**
     * Provides an inspector object to retrieve instances of the pool.
     */
    inspector(): Inspector {
        return new Inspector({ pool: this })
    }
}

export class Inspector {
    public readonly pool: Immutable<InstancePoolTrait>
    public readonly modules: Immutables<ImplementationTrait>
    public readonly connections: Immutables<ConnectionTrait>

    constructor(params: { pool: Immutable<InstancePoolTrait> }) {
        Object.assign(this, params)
        this.modules = this.pool.modules
        this.connections = this.pool.connections
    }
    /**
     * Get a module running instance.
     * @param moduleId UID of the module
     */
    getModule(moduleId: string): Immutable<ImplementationTrait> {
        return this.modules.find((m) => m.uid == moduleId)
    }

    /**
     * Get a connection running instance.
     * @param connectionId UID of the connection
     */
    getConnection(connectionId: string): Immutable<ConnectionTrait> {
        return this.connections.find((c) => c.uid == connectionId)
    }

    /**
     * Get a running instance, either module or connection
     * @param id id of the instance
     */
    get(id: string): Immutable<ConnectionTrait | ImplementationTrait> {
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
        connections: Immutables<Modules.ConnectionTrait>
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

    toFlatWorkflowModel(): WorkflowModel {
        const flattened = this.flat()
        return {
            uid: '',
            modules: flattened.modules.map((m) => ({
                uid: m.uid,
                typeId: m.typeId,
                toolboxId: m.toolboxId,
                toolboxVersion: m.toolboxVersion,
            })),
            connections: flattened.connections.map((c) => {
                return {
                    ...c,
                    configuration: extractConfigWith({
                        configuration: c.configuration,
                        values: {},
                    }),
                }
            }),
            rootLayer: new Projects.Layer({
                moduleIds: this.modules.map((m) => m.uid),
            }),
        }
    }
}
