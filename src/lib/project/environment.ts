import {
    DocumentationTrait,
    Immutable,
    Immutables,
    Modules,
    UidTrait,
} from '..'
import { ImplementationTrait } from '../modules'
import {
    Journal,
    LogChannel,
    Log,
    ErrorLog,
    NoContext,
    ContextLoggerTrait,
} from '@youwol/logging'

import * as vsf from '..'
import { ReplaySubject } from 'rxjs'
import * as rxjs from 'rxjs'
import { defaultViewsFactory } from './views'
import {
    install,
    installWorkersPoolModule,
    WorkersPoolTypes,
} from '@youwol/cdn-client'
import { ProjectState } from './project'

/**
 * Gathers related modules.
 */
export type ToolBox = UidTrait &
    Partial<DocumentationTrait> & {
        /**
         *
         */
        origin: {
            packageName: string
            version: string
        }
        /**
         * list of included modules
         */
        modules: Immutables<Modules.Module<ImplementationTrait>>
        /**
         * name of the toolbox
         */
        name: string

        icon?: {
            svgString?: string
        }
    }

const macroToolbox = {
    name: 'Macros',
    uid: ProjectState.macrosToolbox,
    origin: {
        packageName: 'Macros',
        version: 'NA',
    },
    modules: [],
}

/**
 * Runtime environment.
 */
export class Environment {
    /**
     * Standard toolboxes are toolboxes provided at construction
     * and already instantiated. They can be imported without download step.
     *
     * @group Immutable Properties
     */
    public readonly stdToolboxes: Immutables<ToolBox> = []
    /**
     * Imported toolboxes.
     *
     * @group Immutable Properties
     */
    public readonly toolboxes: Immutables<ToolBox> = []

    /**
     * Toolbox gathering Macros modules.
     *
     * @group Immutable Properties
     */
    public readonly macrosToolbox: Immutable<ToolBox> = macroToolbox

    /**
     * Gather all kind of toolboxes.
     *
     * @group Immutable Properties
     */
    public readonly allToolboxes: Immutables<ToolBox>

    public readonly vsf = vsf
    public readonly rxjs = rxjs

    /**
     * Factory for views displayed in journals.
     *
     * See {@link defaultViewsFactory} for default elements.
     *
     * @group Immutable Properties
     */
    public readonly viewsFactory: Immutable<Journal.DataViewsFactory> =
        defaultViewsFactory
    /**
     * Channel broadcasting errors
     */
    public readonly errorChannel$: Immutable<ReplaySubject<Log>> =
        new ReplaySubject<Log>()

    /**
     * Broadcasting channels
     */
    public readonly logsChannels: Immutables<LogChannel>

    constructor(
        params: {
            macrosToolbox?: Immutable<ToolBox>
            toolboxes?: Immutables<ToolBox>
            viewsFactory?: Immutable<Journal.DataViewsFactory>
            stdToolboxes?: Immutables<ToolBox>
        } = {},
    ) {
        Object.assign(this, params)
        this.allToolboxes = [...this.toolboxes, this.macrosToolbox]
        this.logsChannels = [
            new LogChannel({
                filter: (log) => log instanceof ErrorLog,
                pipes: [this.errorChannel$],
            }),
        ]
        this.errorChannel$.subscribe((log: ErrorLog<Error, unknown>) => {
            console.error(log.error)
            console.error(log.data)
        })
    }

    /**
     * Import a toolbox.
     *
     * @param toolboxIds name of the toolbox, can include semantic versioning using e.g. `@youwol/vsf-rxjs#^0.1.2`.
     */
    async import(toolboxIds: string[]): Promise<Environment> {
        const installed = this.toolboxes.map((tb) => tb.uid)
        const toInstall = toolboxIds.filter((tbId) => !installed.includes(tbId))
        await install({ modules: toInstall })
        const toolboxes = toolboxIds
            .filter((id) => assertModuleIsToolbox(id))
            .map((id) => globalThis[id].toolbox())

        return Promise.resolve(
            new Environment({
                ...this,
                toolboxes: [...this.toolboxes, ...toolboxes],
            }),
        )
    }

    /**
     * Instantiate a module.
     *
     * @param typeId typeId as referenced in the toolbox
     * @param moduleId id of the created module if provided, uuidv4() otherwise
     * @param configuration configuration's attributes overriding default's module configuration
     * @param scope the {@link Modules.Scope} associated to the module
     * @param context used for logging if provided.
     */
    async instantiateModule<T>(
        {
            typeId,
            moduleId,
            configuration,
            scope,
        }: {
            typeId: string
            moduleId?: string
            configuration?: { [_k: string]: unknown }
            scope: Immutable<{ [k: string]: unknown }>
        },
        context: ContextLoggerTrait = NoContext,
    ): Promise<T & Modules.ImplementationTrait> {
        return context.withChildAsync(
            `instantiateModule '${typeId}'`,
            async (ctx) => {
                const [moduleFactory, toolbox] = this.getFactory(typeId)
                ctx.info(`Found module's factory`, module)
                const instance = (await moduleFactory.getInstance({
                    fwdParams: {
                        factory: moduleFactory,
                        toolbox,
                        uid: moduleId,
                        configurationInstance: configuration,
                        environment: this,
                        scope,
                        context: ctx,
                    },
                })) as T & Modules.ImplementationTrait
                ctx.info(`Instance created`, instance)
                return instance
            },
        )
    }

    /**
     * Add macro models in the {@link macrosToolbox} toolbox.
     * @param modules modules to add
     */
    addMacros({
        modules,
    }: {
        modules: Modules.Module<Modules.ImplementationTrait>[]
    }): Environment {
        const tb = {
            ...this.macrosToolbox,
            modules: [...this.macrosToolbox.modules, ...modules],
        }
        return new Environment({
            ...this,
            macrosToolbox: tb,
        })
    }

    /**
     * Install dependencies of modules.
     * @param modules list of modules' {@link Modules.Declaration}
     * @param context logging context
     */
    installDependencies(
        {
            modules,
        }: {
            modules: Immutables<{ typeId: string }>
        },
        context: ContextLoggerTrait = NoContext,
    ): Promise<void> {
        return context.withChildAsync(
            "Install modules' dependencies",
            async (ctx) => {
                const withDependencies = modules
                    .filter(({ typeId }) => typeId != '')
                    .map((module) => this.getFactory(module.typeId))
                    .filter(([factory]) => {
                        const deps = factory.declaration.dependencies
                        return deps && Object.keys(deps).length > 0
                    })

                ctx.info('Dependencies installation', {
                    modules,
                    withDependencies,
                })
                await Promise.all(
                    withDependencies.map(([factory]) =>
                        install(asMutable(factory.declaration.dependencies)),
                    ),
                )
            },
        )
    }

    private workersPools: { [k: string]: WorkersPoolTypes.WorkersPool } = {}

    async getWorkersPool({ id, config, dependencies }, context = NoContext) {
        return await context.withChildAsync(
            'Environment.getWorkersPool',
            async (ctx) => {
                if (this.workersPools[id]) {
                    ctx.info(`WorkerPool ${id} already available`)
                    return this.workersPools[id]
                }
                const workersModule = await installWorkersPoolModule()
                ctx.info(
                    `Start workerPool creation & wait for readiness of ${config.startAt} worker(s)`,
                    { id, dependencies, config },
                )
                const wp = new workersModule.WorkersPool({
                    install: dependencies,
                    pool: config,
                })
                await wp.ready()
                ctx.info(`workerPool ${id} ready`)
                this.workersPools[id] = wp
                return wp
            },
        )
    }

    private getFactory(typeId) {
        type Factory = Modules.Module<Modules.ImplementationTrait>
        const moduleFactory: [Factory, ToolBox] = this.allToolboxes
            .reduce(
                (acc, toolbox) => [
                    ...acc,
                    ...toolbox.modules.map((m) => [m, toolbox]),
                ],
                [],
            )
            .find(([module]) => {
                return module.declaration.typeId == typeId
            })
        if (!moduleFactory) {
            console.error(`Can not find factory of module '${typeId}'`, {
                toolboxes: this.toolboxes,
                stdToolboxes: this.stdToolboxes,
            })
            throw Error(`Can not find factory of module ${typeId}`)
        }
        return moduleFactory
    }
}

function assertModuleIsToolbox(moduleId) {
    if (!globalThis[moduleId]) {
        console.error(
            `The js module of toolbox ${moduleId} did not expose global symbol ${moduleId}`,
        )
        return false
    }
    if (!globalThis[moduleId].toolbox) {
        console.error(
            `The js module of toolbox ${moduleId} did not expose a function 'toolbox()'`,
        )
        return false
    }
    return true
}
