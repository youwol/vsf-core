import {
    Journal,
    LogChannel,
    Log,
    ErrorLog,
    NoContext,
    ContextLoggerTrait,
} from '@youwol/logging'
import { Observable, ReplaySubject } from 'rxjs'
import { filter, map, scan, shareReplay } from 'rxjs/operators'
import {
    install,
    installWorkersPoolModule,
    normalizeInstallInputs,
} from '@youwol/webpm-client'
// eslint-disable-next-line unused-imports/no-unused-imports -- For documentation in `install`
import { ProjectElements } from './models'
import { setup } from '../../auto-generated'
import * as vsf from '../..'
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
import { asMutable } from '../..'

export const customModulesToolbox = {
    name: 'Custom Modules',
    uid: 'CustomModules',
    origin: {
        packageName: 'CustomModules',
        version: 'NA',
    },
    modules: [],
}

export type LibrariesStore = { [_k: string]: unknown }
/**
 * Runtime environment.
 */
export class Environment implements EnvironmentTrait {
    /**
     * The libraries installed using {@link install}.
     *
     * The key is either:
     * *  the name of the library if no alias provided (e.g. `install(['@youwol/rx-vdom'])`)
     * *  the alias of the library if an alias has been provided  (e.g. `install(['@youwol/rx-vdom as rxDOM'])`)
     */
    public readonly libraries: Immutable<LibrariesStore> = {
        vsf,
    }

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
            libraries?: Immutable<LibrariesStore>
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
     * Install toolboxes & libraries.
     *
     * @param targets.toolboxes list of toolboxes to install, see {@link ProjectElements.toolboxes}
     * @param targets.libraries list of libraries to install, see {@link ProjectElements.libraries}
     */
    async install(targets: {
        toolboxes: Immutables<string>
        libraries: Immutables<string>
    }): Promise<Environment> {
        // The next 'if' branch is because there are no guard in cdn-client for empty installation.
        // In tests, it can lead to failures because the cdnClient's backend config may be not defined for scenario
        // in which nothing is expected to be installed.
        if (targets.toolboxes.length + targets.libraries.length == 0) {
            return this
        }
        const { toolboxes, libraries } = targets
        const tbInstalled = this.toolboxes.map((tb) => tb.uid)
        const tbToInstall = toolboxes.filter(
            (tbId) => !tbInstalled.includes(tbId),
        )

        const libToInstall = libraries
            .filter((library) => !library.startsWith('~'))
            .map((library) => {
                if (!library.includes(' as ')) {
                    const name = library.split('#')[0]
                    return { name, alias: name, target: library }
                }
                const target = library.split(' as ')[0]
                return {
                    target,
                    name: target.split('#')[0],
                    alias: library.split(' as ')[1],
                }
            })

        const installed = await install({
            modules: [
                ...libToInstall.map(({ target }) => target),
                ...tbToInstall,
            ],
        })

        const tbModules = toolboxes
            .filter((id) => assertModuleIsToolbox(id))
            .map((id) => globalThis[id].toolbox())

        const indirectDependencies = libraries
            .filter((library) => library.startsWith('~'))
            .map((target) => {
                const name = target.split(' as ')[0].substring(1)
                const alias = target.split(' as ')[1]
                return { name, alias }
            })
        const libModules = [...libToInstall, ...indirectDependencies].reduce(
            (acc, { name, alias }) => ({
                ...acc,
                [alias]: installed[name],
            }),
            {},
        )

        return Promise.resolve(
            new Environment({
                ...this,
                toolboxes: [...this.toolboxes, ...tbModules],
                libraries: { ...this.libraries, ...libModules },
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
                            const dependencies = normalizeInstallInputs(
                                asMutable(factory.declaration.dependencies),
                            )
                            return {
                                esm: {
                                    modules: [
                                        ...acc.esm.modules,
                                        ...(dependencies.esm.modules || []),
                                    ],
                                    scripts: [
                                        ...acc.esm.scripts,
                                        ...(dependencies.esm.scripts || []),
                                    ],
                                },
                                backends: {
                                    modules: [
                                        ...acc.backends.modules,
                                        ...(dependencies.backends.modules ||
                                            []),
                                    ],
                                },
                                pyodide: {
                                    modules: [
                                        ...acc.pyodide.modules,
                                        ...(dependencies.pyodide.modules || []),
                                    ],
                                },
                                css: [...acc.css, ...(dependencies.css || [])],
                            }
                        },
                        {
                            esm: { modules: [], scripts: [] },
                            backends: { modules: [] },
                            pyodide: { modules: [] },
                            css: [],
                        },
                    )

                ctx.info('Dependencies installation', {
                    modules,
                    withDependencies,
                })
                if (
                    withDependencies.esm.modules.length +
                        withDependencies.esm.scripts.length +
                        withDependencies.backends.modules.length +
                        withDependencies.pyodide.modules.length +
                        withDependencies.css.length ==
                    0
                ) {
                    return
                }
                await install({
                    esm: {
                        modules: Array.from(
                            new Set(withDependencies.esm.modules),
                        ),
                        scripts: Array.from(
                            new Set(withDependencies.esm.scripts),
                        ),
                    },
                    backends: {
                        modules: Array.from(
                            new Set(withDependencies.backends.modules),
                        ),
                    },
                    pyodide: {
                        modules: Array.from(
                            new Set(withDependencies.pyodide.modules),
                        ),
                    },
                    css: Array.from(new Set(withDependencies.css)),
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
                            CDN: '@youwol/webpm-client',
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

function assertModuleIsToolbox(moduleId: string) {
    const throwError = (reason: string) => {
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
