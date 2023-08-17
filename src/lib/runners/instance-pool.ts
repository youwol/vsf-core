import { Immutable, Immutables } from '../common'
import { Modules, Projects, Configurations } from '..'
import { ImplementationTrait } from '../modules'
import { ReplaySubject } from 'rxjs'
import { ContextLoggerTrait, NoContext } from '@youwol/logging'
import { WorkflowModel, Environment } from '../project'
import { Connection, ConnectionTrait } from './connection'

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

export interface DeployerTrait {
    /**
     * Uid of entity ({@link Modules.Implementation} usually) owning this instance pool.
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
    connections: Immutables<ConnectionTrait>

    /**
     * Return an inspector object to retrieve/search objects from the pool.
     */
    inspector(): Inspector

    /**
     * Deploy a {@link Chart}.
     * Environment is kept unchanged: eventual dependencies should have been installed first (e.g. using
     * {@link Environment.installDependencies}).
     *
     * @param params
     * @param params.chart chart to instantiate
     * @param params.environment running environment
     * @param params.scope Scope bounded to the modules deployed
     * @param context context for logging purposes
     */
    deploy(
        params: {
            chart: Immutable<Chart>
            environment: Immutable<Environment>
            scope: Immutable<{ [k: string]: unknown }>
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

/**
 * This class encapsulates running instances of modules as well as connections.
 *
 */
export class InstancePool implements DeployerTrait {
    public readonly parentUid: string

    terminated$: ReplaySubject<undefined>

    public readonly modules: Immutables<Modules.ImplementationTrait> = []

    public readonly connections: Immutables<ConnectionTrait> = []

    constructor(params: {
        modules?: Immutables<Modules.ImplementationTrait>
        connections?: Immutables<ConnectionTrait>
        parentUid: string
    }) {
        Object.assign(this, { modules: [], connections: [] }, params)
        this.terminated$ = new ReplaySubject(1)
    }

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

    inspector(): Inspector {
        return new Inspector({ pool: this })
    }
}

export class Inspector {
    public readonly pool: Immutable<DeployerTrait>
    public readonly modules: Immutables<ImplementationTrait>
    public readonly connections: Immutables<ConnectionTrait>

    constructor(params: { pool: Immutable<DeployerTrait> }) {
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
        connections: Immutables<ConnectionTrait>
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
                    configuration: Configurations.extractConfigWith({
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
