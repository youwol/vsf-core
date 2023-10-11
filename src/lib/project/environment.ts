import {
    Journal,
    LogChannel,
    Log,
    ErrorLog,
    NoContext,
    ContextLoggerTrait,
} from '@youwol/logging'
import { Observable, ReplaySubject } from 'rxjs'
import * as rxjs from 'rxjs'
import { filter, map, scan, shareReplay } from 'rxjs/operators'
import { install, installWorkersPoolModule } from '@youwol/cdn-client'

import { setup } from '../../auto-generated'
import * as vsf from '..'
import {
    EnvironmentTrait,
    Immutable,
    Immutables,
    ToolBox,
    WorkersPoolInstance,
    WorkersPoolModel,
    WorkersPoolRunTime,
} from '../common'
import { Modules, Deployers, Macros, Configurations } from '..'
import { defaultViewsFactory } from './'

export const customModulesToolbox = {
    name: 'Custom Modules',
    uid: 'CustomModules',
    origin: {
        packageName: 'CustomModules',
        version: 'NA',
    },
    modules: [],
}

/**
 * Runtime environment.
 */
export class Environment implements EnvironmentTrait {
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
    public readonly macrosToolbox: Immutable<ToolBox> = Macros.macroToolbox

    /**
     * Toolbox gathering Macros modules.
     *
     * @group Immutable Properties
     */
    public readonly customModulesToolbox: Immutable<ToolBox> =
        customModulesToolbox

    /**
     * Gather all kind of toolboxes.
     *
     * @group Immutable Properties
     */
    public readonly allToolboxes: Immutables<ToolBox>

    /**
     * This is a temporary workaround.
     * @hidden
     */
    public readonly vsf = vsf
    /**
     * This is a temporary workaround.
     * @hidden
     */
    public readonly rxjs = rxjs

    /**
     * Available workers pools, see {@link addWorkersPool}.
     */
    public readonly workersPools: Immutables<WorkersPoolInstance> = []

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
            customModulesToolbox?: Immutable<ToolBox>
            toolboxes?: Immutables<ToolBox>
            viewsFactory?: Immutable<Journal.DataViewsFactory>
            stdToolboxes?: Immutables<ToolBox>
            workersPools?: Immutables<WorkersPoolInstance>
        } = {},
    ) {
        Object.assign(this, params)
        this.allToolboxes = [
            ...this.toolboxes,
            this.macrosToolbox,
            this.customModulesToolbox,
        ]
        this.logsChannels = [
            new LogChannel({
                filter: (log) => log instanceof ErrorLog,
                pipes: [this.errorChannel$],
            }),
        ]
        this.errorChannel$.subscribe((log: ErrorLog<Error>) => {
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
    async instantiateModule(
        {
            typeId,
            moduleId,
            configuration,
            scope,
        }: {
            typeId: string
            moduleId?: string
            configuration?: Configurations.ConfigInstance<Modules.SchemaModuleBase> & {
                [_k: string]: unknown
            }
            scope: Immutable<{ [k: string]: unknown }>
        },
        context: ContextLoggerTrait = NoContext,
    ): Promise<Modules.ImplementationTrait> {
        return context.withChildAsync(
            `instantiateModule '${typeId}'`,
            async (ctx) => {
                const { factory, toolbox } = this.getFactory({ typeId })
                ctx.info(`Found module's factory`, module)
                const fwdParams: Immutable<Modules.ForwardArgs> = {
                    factory,
                    toolbox,
                    uid: moduleId,
                    configurationInstance: configuration,
                    environment: this,
                    scope,
                    context: ctx,
                }
                if (
                    toolbox.uid != Macros.macroToolbox.uid &&
                    configuration?.workersPoolId &&
                    configuration.workersPoolId != ''
                ) {
                    return await Deployers.moduleInstanceInWorker({
                        moduleId,
                        typeId,
                        configuration,
                        scope,
                        workersPoolId: configuration.workersPoolId,
                        toolboxId: toolbox.uid,
                        environment: this,
                        fwdParams,
                    })
                }
                const instance = await factory.getInstance({
                    fwdParams,
                })
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
                    .map((module) => this.getFactory({ typeId: module.typeId }))
                    .filter(({ factory }) => {
                        const deps = factory.declaration.dependencies
                        return deps && Object.keys(deps).length > 0
                    })
                    .reduce(
                        (acc, { factory }) => {
                            const dependencies =
                                factory.declaration.dependencies
                            return {
                                modules: [
                                    ...acc.modules,
                                    ...(dependencies.modules || []),
                                ],
                                scripts: [
                                    ...acc.scripts,
                                    ...(dependencies.scripts || []),
                                ],
                                css: [...acc.css, ...(dependencies.css || [])],
                            }
                        },
                        { modules: [], scripts: [], css: [] },
                    )

                ctx.info('Dependencies installation', {
                    modules,
                    withDependencies,
                })
                if (
                    withDependencies.modules.length +
                        withDependencies.scripts.length +
                        withDependencies.css.length ==
                    0
                ) {
                    return
                }
                await install({
                    modules: [...new Set(withDependencies.modules)],
                    scripts: [...new Set(withDependencies.scripts)],
                    css: [...new Set(withDependencies.css)],
                })
            },
        )
    }

    async addWorkersPool(pool: WorkersPoolModel, context = NoContext) {
        return await context.withChildAsync(
            'Environment.setupWorkersPool',
            async (ctx) => {
                if (this.workersPools[pool.id]) {
                    ctx.info(`WorkerPool ${pool.id} already available`)
                    return this
                }
                const workersModule = await installWorkersPoolModule()
                ctx.info(
                    `Start workerPool creation & wait for readiness of ${pool.startAt} worker(s)`,
                    pool,
                )
                const wpInstance = new workersModule.WorkersPool({
                    install: {
                        modules: [`@youwol/vsf-core#${setup.version}`],
                        aliases: {
                            vsfCore: '@youwol/vsf-core',
                            CDN: '@youwol/cdn-client',
                        },
                    },
                    globals: {
                        transmitProbeToMainThread:
                            Deployers.transmitProbeToMainThread,
                        emitRuntime: Deployers.emitRuntime,
                    },
                    pool,
                })
                const runtimes$: Observable<WorkersPoolRunTime> =
                    wpInstance.mergedChannel$.pipe(
                        filter(
                            (m) =>
                                m.type == 'Data' && m.data['step'] == 'Runtime',
                        ),
                        map(({ data }) => ({
                            workerId: data.workerId,
                            importedBundles: data['importedBundles'],
                        })),
                        scan(
                            (acc, { workerId, importedBundles }) => ({
                                ...acc,
                                [workerId]: {
                                    importedBundles,
                                    workerId,
                                },
                            }),
                            {},
                        ),
                        shareReplay({ bufferSize: 1, refCount: true }),
                    )

                runtimes$.subscribe((r) => console.log('Runtimes', r))
                await wpInstance.ready()
                ctx.info(`workerPool ${pool.id} ready`)
                return new Environment({
                    ...this,
                    workersPools: [
                        ...this.workersPools,
                        { model: pool, instance: wpInstance, runtimes$ },
                    ],
                })
            },
        )
    }

    /**
     * Add a custom module to the project, it will be available in the toolbox {@link customModulesToolbox}.
     *
     * @param module Declaration & implementation of the module
     */
    async addCustomModule(module: Immutable<Modules.Module>) {
        const tb = {
            ...this.customModulesToolbox,
            modules: [...this.customModulesToolbox.modules, module],
        }
        return new Environment({
            ...this,
            customModulesToolbox: tb,
        })
    }

    /**
     * Retrieve a target module factory & associated toolbox.
     * @param toolboxId Parent toolbox id of the module. If omitted does lookup of `typeId` in all toolboxes.
     * @param typeId Type id of the module
     * @return `{factory, toolbox}`
     */
    getFactory({ toolboxId, typeId }: { toolboxId?: string; typeId: string }): {
        factory: Modules.Module<Modules.ImplementationTrait>
        toolbox: ToolBox
    } {
        type Factory = Modules.Module<Modules.ImplementationTrait>
        const moduleFactory: [Factory, ToolBox] = this.allToolboxes
            .filter((tb) =>
                toolboxId == undefined ? true : tb.uid == toolboxId,
            )
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
        return { factory: moduleFactory[0], toolbox: moduleFactory[1] }
    }
}

function assertModuleIsToolbox(moduleId) {
    const throwError = (reason) => {
        console.error(reason)
        throw Error(
            `Can not import the package ${moduleId} as toolbox: ${reason}`,
        )
    }
    if (!globalThis[moduleId]) {
        throwError(
            `The js module of toolbox ${moduleId} did not expose global symbol ${moduleId}`,
        )
    }
    if (!globalThis[moduleId].toolbox) {
        throwError(
            `The js module of toolbox ${moduleId} did not expose a function 'toolbox()'`,
        )
    }
    return true
}
