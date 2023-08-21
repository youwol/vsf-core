// noinspection JSValidateJSDoc

import { VirtualDOM } from '@youwol/flux-view'

import {
    Immutable,
    Immutables,
    ToolBox,
    UidTrait,
    WorkersPoolModel,
} from '../common'
import {
    Modules,
    Configurations,
    Connections,
    Macros,
    Deployers,
    Workflows,
} from '..'
import {
    Environment,
    parseMacroInput,
    parseMacroOutput,
    parseDag,
    ProjectSummaryView,
} from './'
export type HtmlView = (
    instancePool: Immutable<Deployers.InstancePool>,
) => VirtualDOM

export type HtmlViewsStore = { [k: string]: HtmlView }

/**
 * Define a canvas view.
 */
export type CanvasView = {
    /**
     * Specify on which elements the view apply.
     * @param elem either {@link Modules.Implementation} or {@link Modules.Connection}
     */
    selector: (elem: Immutable<UidTrait>) => boolean
    /**
     * View factory.
     * @param elem either {@link Modules.Implementation} or {@link Modules.Connection}
     */
    view: (elem: Immutable<unknown>) => VirtualDOM
}

/**
 * Store for canvas views.
 */
export type CanvasViewsStore = CanvasView[]

/**
 * State of a project.
 * It is immutable : each modification applied on the state actually create a new one.
 */
export class ProjectState {
    /**
     * @group Static Properties
     */
    static readonly macrosToolbox = 'Macros'

    /**
     * Main workflow: instantiated directly
     *
     * @group Immutable Properties
     */
    public readonly main: Immutable<Workflows.WorkflowModel> =
        Workflows.emptyWorkflowModel()
    /**
     * List of available macros
     *
     * @group Immutable Properties
     */
    public readonly macros: Immutables<Macros.MacroModel> = []
    /**
     * HTML views associated to the project
     *
     * @group Immutable Properties
     */
    public readonly views: Immutable<HtmlViewsStore> = {}
    /**
     * HTML views associated to the project
     *
     * @group Immutable Properties
     */
    public readonly canvasViews: Immutables<CanvasView> = []

    /**
     * Supporting environment
     *
     * @group Immutable Properties
     */
    public readonly environment: Immutable<Environment> = new Environment()

    /**
     * Modules & connections instances of {@link main}.
     *
     * @group Immutable Properties
     */
    public readonly instancePool: Immutable<Deployers.InstancePool> =
        new Deployers.InstancePool({
            parentUid: 'main',
        })

    constructor(
        params: {
            main?: Immutable<Workflows.WorkflowModel>
            macros?: Immutables<Macros.MacroModel>
            instancePool?: Immutable<Deployers.InstancePool>
            views?: Immutable<HtmlViewsStore>
            environment?: Immutable<Environment>
        } = {},
    ) {
        Object.assign(this, params)
    }

    /**
     * Import some toolboxes in the environment.
     *
     * @param toolboxIds UIDs of the toolbox, can include semantic versioning using e.g. `@youwol/vsf-rxjs#^0.1.2`.
     */
    async import(...toolboxIds: string[]) {
        const newEnv = await this.environment.import(toolboxIds)

        return new ProjectState({ ...this, environment: newEnv })
    }

    /**
     * Get a toolbox definition from the environment.
     * @param toolboxId UID of the toolbox
     */
    getToolbox(toolboxId): Immutable<ToolBox> {
        return this.environment.allToolboxes.find((t) => t.uid == toolboxId)
    }

    /**
     * Get a module from the {@link main} workflow.
     * @param moduleId UID of the module
     */
    getModule(moduleId): Immutable<Modules.ImplementationTrait> {
        return this.instancePool.modules.find((m) => m.uid == moduleId)
    }

    /**
     * Get a module's output slot from the {@link main} workflow.
     * @param moduleId UID of the module
     * @param slotId UID of the slot
     */
    getObservable({ moduleId, slotId }: { moduleId: string; slotId: string }) {
        return this.instancePool.modules.find((m) => m.uid == moduleId)
            .outputSlots[slotId].observable$
    }

    /**
     * Get a connection from the {@link main} workflow.
     *
     * @param connectionId UID of the connection
     */
    getConnection(
        connectionId: string,
    ): Immutable<Connections.ConnectionTrait> {
        return this.instancePool.connections.find((c) => c.uid == connectionId)
    }

    /**
     * Parse a DAG, see {@link parseDag}.
     *
     * @param flows string representation of one or multiple branches
     * @param configs dictionary of configurations with keys being the UID of the module/connection
     * @param macroUid includes the parsed DAG in the workflow with this UID if provided, otherwise in main
     */
    async parseDag(
        flows: string | string[],
        configs: { [k: string]: unknown } = {},
        macroUid?: string,
    ) {
        const wfBase = macroUid
            ? this.macros.find((m) => m.uid == macroUid) || {
                  uid: macroUid,
                  modules: [],
                  connections: [],
                  rootLayer: new Workflows.Layer(),
              }
            : this.main
        const model = parseDag({
            flows,
            configs,
            toolboxes: this.environment.allToolboxes,
            availableModules: wfBase.modules,
        })
        const modulesSet = new Set([...wfBase.modules, ...model.modules])
        const connectionsSet = new Set([
            ...wfBase.connections,
            ...model.connections,
        ])
        const root = wfBase.rootLayer
        const rootModuleIds = new Set([
            ...root.moduleIds,
            ...model.modules.map((m) => m.uid),
        ])
        const newWf = {
            uid: wfBase.uid,
            modules: [...modulesSet],
            connections: [...connectionsSet],
            rootLayer: new Workflows.Layer({
                uid: wfBase.rootLayer.uid,
                children: wfBase.rootLayer.children,
                moduleIds: [...rootModuleIds],
            }),
        }
        const instancePool = macroUid
            ? this.instancePool
            : await this.instancePool.deploy({
                  environment: this.environment,
                  chart: {
                      modules: model.modules,
                      connections: model.connections,
                  },
                  // Scope for top level modules is for now empty
                  scope: {},
              })

        return new ProjectState({
            ...this,
            environment: this.environment,
            instancePool,
            main: macroUid ? this.main : newWf,
            macros: macroUid
                ? [...this.macros.filter((m) => m.uid != macroUid), newWf]
                : this.macros,
        })
    }

    exposeMacro<TSchema extends Configurations.Schema>(
        macroUid: string,
        definition: {
            configuration?: Configurations.Configuration<TSchema>
            inputs: string[]
            outputs: string[]
            configMapper?: (
                configInstance: Configurations.ConfigInstance<TSchema>,
            ) => {
                [k: string]: { [k: string]: unknown }
            }
            workerPool?: {
                startAt?: number
                stretchTo?: number
            }
            html?: (
                instance: Modules.ImplementationTrait,
                config?: unknown,
            ) => VirtualDOM
        },
    ) {
        const macro = this.macros.find((m) => m.uid == macroUid)
        const configuration = {
            schema: {
                ...Macros.defaultMacroConfig.schema,
                ...(definition.configuration?.schema || {}),
            },
        }
        const newMacro: Macros.MacroModel = {
            ...macro,
            ...definition,
            configuration,
            typeId: macroUid,
            toolboxId: ProjectState.macrosToolbox,
            inputs: definition.inputs.map((inputStr) =>
                parseMacroInput({
                    inputStr,
                    toolboxes: this.environment.allToolboxes,
                    availableModules: macro.modules,
                }),
            ),
            outputs: definition.outputs.map((outputStr) =>
                parseMacroOutput({
                    outputStr,
                    toolboxes: this.environment.allToolboxes,
                    availableModules: macro.modules,
                }),
            ),
        }
        const module = Macros.macroInstance(newMacro)

        return new ProjectState({
            ...this,
            main: this.main,
            macros: [...this.macros.filter((m) => m.uid != macroUid), newMacro],
            environment: this.environment.addMacros({
                modules: [module],
            }),
        })
    }
    /**
     * Add a layer to the workflow.
     *
     * @param parentLayerId parent layer UID
     * @param layerId layer UID, uuidv4 if not provided
     * @param macroId the macro targeted, if not provided takes place in {@link main}
     * @param uids list of module or layers UIDs included in the layer
     */
    addLayer({
        parentLayerId,
        layerId,
        macroId,
        uids,
    }: {
        parentLayerId?: string
        layerId?: string
        macroId?: string
        uids: string[]
    }): ProjectState {
        const workflow = macroId
            ? this.macros.find((m) => m.uid == macroId)
            : this.main
        const moduleIds = uids.filter((uid) =>
            workflow.modules.find((m) => m.uid == uid),
        )
        const layers = workflow.rootLayer.filter((l) => uids.includes(l.uid))

        const layer = new Workflows.Layer({
            uid: layerId,
            moduleIds: moduleIds,
            children: layers,
        })
        const rootLayer = workflow.rootLayer.merge({
            include: layer,
            at: parentLayerId,
        })
        const newWorkflow = {
            ...workflow,
            rootLayer,
        }
        return new ProjectState({
            ...this,
            main: macroId ? this.main : newWorkflow,
            macros: macroId
                ? [...this.macros.filter((m) => m.uid != macroId), newWorkflow]
                : this.macros,
            environment: this.environment,
        })
    }

    /**
     * Add multiple layers in a row, see {@link addLayer}.
     *
     * @param data each elements of data will be forwarded to {@link addLayer}.
     */
    organize(
        data: [{ layerId: string; parentLayerId?: string; uids: string[] }],
    ): ProjectState {
        return data.reduce((acc, e) => {
            return acc.addLayer(e)
        }, this)
    }

    /**
     * Add a worker pool to the project.
     *
     * @param pool worker pool characteristics
     */
    async addWorkersPool(pool: WorkersPoolModel) {
        const newEnv = await this.environment.addWorkersPool(pool)
        return new ProjectState({ ...this, environment: newEnv })
    }

    /**
     * Add an HTML view to the project.
     *
     * @param viewId UID of the view
     * @param vDOM Virtual DOM generator, takes the {@link InstancePool} as argument.
     */
    addHtml(
        viewId: string,
        vDOM: (instances: Deployers.InstancePool) => VirtualDOM,
    ): ProjectState {
        return new ProjectState({
            ...this,
            views: {
                ...this.views,
                [viewId]: vDOM,
            },
        })
    }

    /**
     * Register {@link CanvasView} elements in the project.
     * Any element of the workflow rendered in the canvas (e.g. modules, connections, layers) matching
     * the {@link CanvasView}'s selector will have their corresponding view displayed.
     *
     * Below is an example displaying the html view of a module with `uid='view'` & implementing {@link HtmlTrait}:
     *
     * ```
     * project = project.addToCanvas({
     *      selector: (elem) => elem.uid == 'view',
     *      view: (elem: HtmlTrait) => elem.html()
     * })
     * ```
     * Below is an example displaying the data part of a message reaching the end of a {@link Modules.Connection} with `uid='c'`:
     *
     * ```
     * project = project.addToCanvas({
     *      selector: (elem) => elem.uid == 'c',
     *      view: (connection: Connection) => ({
     *          innerText: env.fv.attr$( connection.end$, ({data}) =>  data),
     *      })
     * })
     * ```
     * @param elements List of {@link CanvasView}
     */
    addToCanvas(...elements: CanvasView[]) {
        return new ProjectState({
            ...this,
            canvasViews: [...this.canvasViews, ...elements],
        })
    }

    /**
     * Dispose all active subscriptions.
     */
    dispose() {
        this.instancePool.stop()
    }

    /**
     * Creates a dynamic view summarizing the project.
     *
     * It can then be used to populate project's HTML views:
     * ```
     * const summary =  project.summaryHtml()
     * project = project.addHtml("View", summary)
     * ```
     */
    summaryHtml() {
        return new ProjectSummaryView({ project: this })
    }
}
