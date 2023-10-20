import { Immutable, UidTrait } from '../common'
import { VirtualDOM } from '@youwol/flux-view'

import { Configurations, Deployers, Modules, Connections } from '..'

/**
 * Represents an HTML view generator function that produces a Virtual DOM (VirtualDOM) for rendering in HTML page.
 *
 * The `HtmlView` type is a function that generates an HTML view represented as a VirtualDOM.
 * A Virtual DOM is a data structure that resembles JSON and serves as a formal representation of HTML elements.
 * However, what sets it apart is its capability to associate not only static values but also observables with
 * attributes or child elements.
 * For more detailed information, you can refer to the documentation available at
 * <a href='https://l.youwol.com/doc/@youwol/flux-view' target='_blank'>@youwol/flux-view</a>.
 *
 * The `instancePool` parameter provides access to available instances, allowing you to gather views
 *  associated with specific modules within the instance pool. You can also add reactive elements to the view by
 *  utilizing any observables available in the `instancePool` (e.g. associated to module's slots or connections).
 *
 * @param instancePool An immutable representation of the Deployers.InstancePool that gathers available instances
 *                     in the context of the view generation.
 * @param config eventual 'configuration' that gets forwarded from the caller.
 * @returns A Virtual DOM (VirtualDOM) representation of the HTML view.
 */
export type HtmlView = (
    instancePool: Immutable<Deployers.InstancePool>,
    config?: unknown,
) => VirtualDOM

/**
 * Small (usually) graphical elements definition added to a flowchart.
 *
 * It is composed by a selector function to choose specific elements within a flowchart
 * (such as modules or connections) and a view function to provide associated graphical elements for
 * the selected elements.
 */
export type FlowchartAnnotation = {
    /**
     * A selector function that determines whether an element should be associated with this view.
     *
     * The `selector` function takes an `elem` parameter, which is an immutable representation of an
     * element with a unique identifier (`UidTrait`). It returns `true` if the element should be
     * associated with this view and have its graphical representation rendered, or `false` otherwise.
     *
     * @param elem An immutable element with a unique identifier.
     * @returns `true` if the element should be associated with this view, `false` otherwise.
     */
    selector: (elem: Immutable<UidTrait>) => boolean

    /**
     * A function that generates a graphical representation for the associated elements.
     *
     * The `html` function takes an `elem` parameter, which is an immutable representation of the
     * associated element. It is responsible for creating and returning a virtual DOM
     * representation of the graphical element that should be displayed on the flowchart for
     * the associated element.
     *
     * @param elem An immutable representation of the associated element.
     * @returns A virtual DOM (VirtualDOM) representation of the graphical element.
     */
    html: (
        elem: Immutable<
            Modules.ImplementationTrait | Connections.ConnectionTrait
        >,
    ) => VirtualDOM
}

/**
 * Represents a FlowchartLayer configuration for organizing elements within a flowchart.
 *
 * A `FlowchartLayer` object allows you to group modules (and associated connections, widgets, etc.) within a
 * flowchart into a layer. This grouping simplifies the reading and organization of the flowchart elements.
 */
export type FlowchartLayer = {
    /**
     * The `parentLayerId` property specifies the ID of the target layer in which the group is created. This parent
     * layer contains the newly formed group of elements.
     * If not provided the root layer is used.
     */
    parentLayerId?: string

    /**
     * The `layerId` property defines the chosen ID for the layer that represents the group. All elements
     * grouped together within this layer will share this ID.
     * Should be unique across the corresponding flowchart.
     */
    layerId: string

    /**
     * The `moduleIds` property contains an array of UIDs of the modules included in the group within the
     * specified `layerId`. These UIDs uniquely identify the elements within the group.
     */
    moduleIds: string[]
}
/**
 * Definition (or extension) of a workflow.
 *
 * A workflow is a visual representation of a sequence of steps or actions that needs to be performed.
 * It is specified as a sequence of modules connected by connections.
 *
 * The following code snippet demonstrates this data structure for defining a workflow. It assumes the availability
 * of a toolbox that collects modules of various types, including `moduleA`, `moduleB`, `moduleC`, `moduleD`,
 * `moduleE`, and `moduleF`.
 *
 * Example Usage:
 * ```
 * const workflow = {
 *      branches: [
 *          '(moduleA#A)>>(moduleB#B)>#BtoC>(moduleC#C)0>>(moduleD#D)',
 *          '(moduleE#E)>>1(#C)1>>(moduleF#F)'
 *      ],
 *      configurations: {
 *          // Overriding module's default configuration can be provided, e.g., for module `A`
 *          A: {
 *              // Override parameters of moduleA's configuration here
 *          },
 *          // Overriding connection's default configuration can be provided, e.g., for connection `BtoC`
 *          BtoC: {
 *              adaptor: ({data, context}) => ({data, context}) // An example adaptor function (for illustration)
 *          }
 *      },
 * }
 * ```
 *
 * Regarding the format to define the branches:
 * - The symbol `(moduleA#A)` signifies the instantiation of a **module** of type `moduleA` with an ID of `A`.
 *   IDs are optional in general but required if a configuration needs to be associated with a specific module.
 * - The symbol `>>` denotes the instantiation of an unidirectional **connection** from the previous (on the left) to
 *   the next (on the right) modules in the workflow.
 *   By default, it connects the entry/exit slots with index '0'. You can explicitly provide indices for
 *   input and output slots, e.g., `1>>0` (exit slot #1 of the previous module connected to input slot #0 of
 *   the next one). In order to be configured, the connection can have an id (starting with '#'), such as
 *   `#BtoC` in the previous example.
 */
export type Workflow = {
    /**
     * Branches of the workflow.
     * Each branch is represented as a string that defines the flow of modules and connections.
     */
    branches?: string[]

    /**
     * Configurations of the modules and connections.
     * Keys are the module or connection IDs, and values are used to override parameter values of the default
     * configuration for the associated module or connection. This allows for customization of specific modules
     * or connections within the workflow.
     */
    configurations?: { [k: string]: unknown }
}

/**
 * A `ProjectView` object wraps an HTML view with an ID. It is commonly used to provide views to projects.
 *
 */
export type ProjectView = {
    /**
     * The ID of the view, should be unique across the project's views
     */
    id: string
    /**
     *  The HTML view associated, typically used for rendering content within a project.
     */
    html: HtmlView
}

/**
 * Represents a Worksheet, which can be thought of as a self-contained project or a "side project" that can be used
 * independently of the main.
 *
 */
export type Worksheet = {
    /**
     * The ID of the worksheet, should be unique across the project's worksheets.
     */
    id: string
    /**
     * A workflow that describes the modules and their connections within the worksheet.
     */
    workflow: Workflow
    /**
     * Custom HTML views that can be associated with the worksheet.
     */
    views?: ProjectView[]
}

/**
 * Configuration to render and display workflows on screen using flowchart.
 * It allows you to organize modules into layers and add graphical elements.
 */
export type Flowchart = {
    /**
     * Flowchart layers are used to group modules together, helping to organize and manage the
     * visual representation of the flowchart. Each layer can contain a subset of modules or other layers.
     */
    layers?: FlowchartLayer[]

    /**
     * Annotations are graphical elements that can be added to the flowchart to enhance its
     * visual representation. These views elements designed to provide context or information about the
     * underlying workflow.
     */
    annotations?: FlowchartAnnotation[]
}
/**
 * Represents a collection of the values of module configuration's attributes with string keys.
 *
 * A `ModuleAttributes` object is a dictionary-like structure that allows you to store module's configuration attributes
 * using string keys and associated values of type `unknown`. It is used usually with th {@link MacroConfigMapper},
 * to map the configuration of a macro, to the configuration of its inner modules.
 *
 * @example
 * ```typescript
 * const attributes: ModuleAttributes = {
 *     policy: 'merge',
 *     timeout: 5,
 *     map: ({data}) => 2*data,
 *     // ...
 * };
 * ```
 *
 * @remarks
 *
 * The `unknown` type allows for flexibility in the type of values associated with the attributes.
 * The actual type should match the actual type declare for the module's configuration {@link Configurations.Schema}.
 */
export type ModuleAttributes = { [attributeName: string]: unknown }

/**
 * A function type that maps a macro's configuration instances to inner-modules attributes,
 * see {@link MacroConfiguration} with its example.
 *
 * @template TSchema Type of the configuration's schema of the macro.
 * @param macroConfiguration A {@link Configurations.ConfigInstance | configuration instance} of the macro.
 * @returns An object where keys are module IDs, and values are corresponding {@link ModuleAttributes}.
 */
export type MacroConfigMapper<TSchema extends Configurations.Schema> = (
    macroConfiguration: Configurations.ConfigInstance<TSchema>,
) => {
    [moduleId: string]: ModuleAttributes
}

/**
 * Represents the configuration for a macro.
 *
 * A `MacroConfiguration` object defines the configuration attributes (types and metadata) of a macro.
 * It includes two important properties:
 * - `schema`: This property specifies the type of the configuration's schema for the macro,
 *   which defines the available attributes with their types and eventually some metadata.
 *   See {@link Configurations.AttributeTrait}.
 * - `mapper`: The `mapper` property is a function that allows you to map an instance of the macro's `TSchema`
 *   to the configuration's attributes of inner modules. This mapping is useful for translating the macro's
 *   configuration into the specific attributes required by inner modules.
 *
 * @template TSchema Type of the configuration's schema of the macro.
 *
 * @example
 * ```typescript
 * const configuration: MacroConfiguration<MySchema> = {
 *     schema: {
 *          att1: new Configurations.Boolean({value: true}),
 *          nested: {
 *              att2: new Configurations.Float({value: 0.5, min:0, max:1}),
 *          }
 *     },
 *     mapper: (schemaInstance: {att1: boolean, nested:{att2: number}}) => {
 *         return {
 *              innerModuleA: {
 *                  activated: schemaInstance.att1
 *              },
 *              innerModuleB: {
 *                  factor: schemaInstance.nested.att2
 *              }
 *         }
 *     },
 * };
 * ```
 */
export type MacroConfiguration<TSchema extends Configurations.Schema> = {
    /**
     * The schema that defines the configuration attributes and their types for the macro.
     */
    schema: TSchema
    /**
     * A function that maps an instance of the macro's `TSchema` to the configuration's attributes
     * of inner modules.
     */
    mapper: MacroConfigMapper<TSchema>
}
/**
 * Represents the API of a macro, specifying how to instantiate the associated macro and consume it.
 *
 * A `MacroAPI` object defines various aspects of a macro, including its configuration, available inputs, and available outputs.
 *
 * @template TSchema Type of the configuration's schema of the macro.
 *
 * @example
 * The following example define a macro with some configuration (see {@link MacroConfiguration}) which expose:
 * *  one input: any data reaching it is forwarded to the first input of 'innerModuleA'
 * *  one output: it forwards any data emitted by the second output of 'innerModuleB'.
 * ```typescript
 * const macroAPI: MacroAPI<MySchema> = {
 *     configuration: // see MacroConfiguration documentation,
 *     inputs: ['0(#innerModuleA)'],  // first input of 'innerModuleA'.
 *     outputs: [(#innerModuleB)1],  // second output of 'innerModuleB'.
 * };
 * ```
 */
export type MacroAPI<TSchema extends Configurations.Schema> = {
    /**
     * Configuration for the macro, typically used to configure inner modules upon the macro's instantiation.
     */
    configuration?: MacroConfiguration<TSchema> // (Optional) Configuration for the macro.
    /**
     * An array of strings specifying available inputs of the macro, they are references to inner module inputs.
     */
    inputs?: string[]
    /**
     * An array of strings specifying available outputs of the macro, they are references to inner module outputs.
     */
    outputs?: string[]
}

/**
 * Specification of a macro.
 *
 * Macros function as a container for modules, including the capability to incorporate other macros,
 * and their connections.
 * They offer the flexibility to be instantiated multiple times with varying configurations at any location
 * within the workflows.
 * Much like functions are essential in traditional software development, macros hold a central role in
 * Visual Studio Flow.
 *
 * They typically serve three primary use cases:
 * *  Enabling the encapsulation of a specific workflows into an independent and reusable module.
 * *  Facilitating the offloading of associated logic from the main thread to a {@link WorkersPool}.
 * *  Acting as a replacement for observable generators, often serving as inner observables within various modules
 * (e.g. those exposing the operators <a href='https://rxjs.dev/api/operators/mergeMap' target='_blank'>mergeMap</a>,
 *  <a href='https://rxjs.dev/api/operators/switchMap' target='_blank'>switchMap</a>,
 *  <a href='https://rxjs.dev/api/operators/concatMap' target='_blank'>concatMap</a>, *etc*)
 *
 *
 * @template TSchema Type of the configuration's schema of the macro.
 * @example
 *
 * const macro : Macro = {
 *      typeId:'lightMacro',
 *      workflow:{
 *          branches:[
 *              '(of#of)>>(hemisphereLight#hemLight)>>0(combineLatest#combLights)>>(group#grpLights)',
 *              '(#of)>>(pointLight#pointLight)>>1(#combLights)',
 *          ],
 *          configurations:{
 *              combLights: { inputsCount:2 },
 *              hemLight:   { groundColor: 0x000001 },
 *              pointLight: { position: {x:10, y:10, z:10} }
 *          }
 *      },
 *      api:{
 *          inputs:[],
 *          outputs: ['(#grpLights)0'],
 *          configuration: {
 *              schema: {
 *                  color: Configurations.Float({value:0x0000FF})
 *              },
 *              mapper: (schemaInstance: {color: number}) => ({
 *                  hemLight: {groundColor: schemaInstance.color}
 *              })
 *          }
 *      }
 * }
 */
export type Macro<TSchema extends Configurations.Schema> = {
    /**
     * This property specifies the type of the macro.
     * It is important that the macro typeId is unique within the project's macros.
     */
    typeId: string

    /**
     * This property represents the specification of the workflow associated with the macro.
     * Please refer to the {@link Workflow} documentation.
     */
    workflow?: Workflow

    /**
     * This property specifies the API (Application Programming Interface) for the macro:
     * *  its configuration, and how it maps to inner modules' configuration.
     * *  the exposed inputs
     * *  the exposed outputs
     */
    api?: MacroAPI<TSchema>

    /**
     * This property defines the structure and appearance of the macro when it is executed. A view is typically used
     * to aggregate in a specific layout the individual views of some inner modules (included in the {@link workflow}).
     *
     * @param instance Macro instance
     * @param config eventual 'configuration' that gets forwarded from the caller.
     */
    html?: (
        instance: Immutable<Modules.ImplementationTrait>,
        config?: unknown,
    ) => VirtualDOM
}

/**
 * Specification of a worker pool.
 *
 * Worker pools are especially useful in scenarios where there is a need for parallelism and concurrent processing.
 * {@link Macro}  has the capability to be instantiated within a worker pool instead of the main thread.
 * This can be achieved by specifying a non-empty `workerPoolId` attribute when instantiating the macro through its
 * configuration (`workerPoolId` is always available as configuration's attribute of a macro).
 * In this case, the provided value must correspond to the ID of an existing worker pool available for use.
 *
 * @example
 *
 * ```
 * const project: ProjectState = new ProjectState().with({
 *      toolboxes: ['@youwol/vsf-rxjs', '@youwol/vsf-debug'],
 *      workersPools: [{
 *          id: 'A',
 *          startAt: 1,
 *          stretchTo: 4
 *      }],
 *      macros:[{
 *          typeId: 'factorial',
 *          workflow:{
 *              branches:['(map#toFactorial)'],
 *              configurations:{
 *                  toFactorial:{
 *                      project: ({data}) => {
 *                          const factorialFct = (n)=> n <= 1 ? 1 : n * factorial(n - 1)
 *                          return factorialFct(data)
 *                      }
 *                  }
 *              }
 *          },
 *          api:{ inputs: ['0(#map)'], outputs:['(#map)0'] }
 *      }],
 *      workflow: {
 *          branches: ['(of#of)>>(factorial#factorial)>>(console)'],
 *          configurations: {
 *              of: { args: 42 },
 *              factorial: { workersPoolId: 'A'}
 *          }
 *      }
 * })
 * ```
 *
 * @remarks
 *
 * When creating an instance of a macro within a worker pool, certain restrictions come into play concerning the
 * operations that can be executed within the worker and the data transferred to and from it.
 *
 * In terms of operational limitations, the primary concern revolves around the incapacity to perform operations
 * related to the Document Object Model (DOM). These operations, which are typically associated with web browser
 * environments, are unavailable within the worker context.
 *
 * Regarding the transferred data, including the macro's configuration as well as input and output data,
 * it's essential to ensure consistency with the
 * <a href='https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm'>structured clone algorithm</a>.
 * This algorithm dictates that the data must be compatible with the requirements for cloning data structures
 * to and from the worker environment.
 *
 * It's important to be mindful of these restrictions and data consistency requirements to ensure the smooth
 * execution of tasks.
 *
 */
export type WorkersPool = {
    /**
     * ID of the worker pool, should be unique across the project's workers pools.
     * It corresponds to the `workerPoolId` used when instantiating a macro within a workers pool.
     */
    id: string

    /**
     * minimal number of workers.
     *
     * This property represents the minimum number of workers that should be initially created in the worker pool.
     * Workers are threads or processes that can perform tasks concurrently. The `startAt` value specifies the
     * lower limit for the number of workers available in the pool.
     */
    startAt: number

    /**
     * maximal number of workers.
     *
     * This property represents the maximum number of workers that the worker pool can have at any given time.
     * When the demand for parallel processing increases, the worker pool can dynamically create additional workers
     * up to the specified `stretchTo limit to handle the increased workload.
     */
    stretchTo: number
}

/**
 * Gather the elements that can extend a project.
 *
 * Elements are extending the project in the following order:
 * *  1 - toolboxes & libraries & workersPools
 * *  2 - customModules
 * *  2 - macros
 * *  3 - workflow
 * *  4 - views, worksheets & flowchart
 *
 */
export type ProjectElements = {
    /**
     * Toolboxes to import
     *
     * @example
     *
     * ```
     * (project: ProjectState) => {
     *      return project.with({
     *          toolboxes:[
     *              '@youwol/vsf-rxjs', // implicit 'latest' version
     *              '@youwol/vsf-debug#^0.1.0' // explicit version using semantic versioning
     *              ]
     *      })
     * }
     * ```
     *
     *
     */
    toolboxes?: string[]

    /**
     * Libraries to import
     *
     * @example
     *
     * ```
     * (project: ProjectState) => {
     *      project = await project.with({
     *          libraries:[
     *              // implicit 'latest' version, explicit export name
     *              '@youwol/flux-view as fv',
     *              // explicit version using semantic versioning, default export name (i.e. library name)
     *              '@youwol/http-clients#^2.0.6',
     *              // recover an indirect dependencies with an alias
     *              '~rxjs as rxjs'
     *              ]
     *      })
     *      const { fv, rxjs } = project.environment.libraries
     *      const httpClients = project.environment.libraries['@youwol/http-clients']
     * }
     * ```
     */
    libraries?: string[]

    /**
     * A workflow representation. Additional information can be found in the documentation of {@link Workflow}.
     *
     * @example
     *
     * ```
     * (project: ProjectState) => {
     *      return project.with({
     *          // next line is for a sake of completeness: it makes the referenced modules available
     *          toolboxes:['@youwol/vsf-rxjs', '@youwol/vsf-debug'],
     *          // this is an example of workflow definition:
     *          workflow: {
     *              branches:['(timer#timer)>>(take#take)>>(console)']
     *              configurations:{
     *                  take:{ count: 3 }
     *              }
     *          }
     *      })
     * }
     * ```
     *
     */
    workflow?: Workflow

    /**
     * Declare views of project, it allows to gather individual views of some modules of the workflow into
     * specific layouts. Additional information can be found in the documentation of {@link ProjectView}.
     *
     * @example
     *
     * ```
     *  (project: ProjectState) => {
     *      return project.with({     *
     *          toolboxes: ['@youwol/vsf-rxjs', '@youwol/vsf-flux-view'],
     *          workflow:{
     *              branches:['(timer#timer)>>(view#DateView)'],
     *              configurations:{
     *                  DateView:{
     *                      vDomMap: (message) => ({
     *                          innerText: new Date().toLocaleString()
     *                      }),
     *                 }
     *              }
     *          },
     *          // The following view gather the 'DateView' module's view within a predefined layout
     *          // In regular case, there would most likely be multiple modules' view.
     *          views:[{
     *              id: 'foo',
     *              class: 'd-flex align-items-center',
     *              html: (instances) => {
     *                  return {
     *                      children:[
     *                          {
     *                              innerText: 'It is:'
     *                          },
     *                          instances.inspector().get('DateView').html()
     *                      ]
     *                  }
     *              }
     *          }]
     *      })
     * }
     * ```
     */
    views?: ProjectView[]

    /**
     * Elements related to the display of flowcharts (e.g. organization in layers, display of widgets,
     * *etc*).
     *
     * Those elements do not have side effects on data processing: they are only visual hints regarding the display of
     * workflow.
     *
     * Additional information can be found in the documentation of {@link Flowchart}.
     *
     *  @example
     *
     *  ```
     *  (project: ProjectState) => {
     *      return project.with({
     *          toolboxes: ['@youwol/vsf-rxjs', '@youwol/vsf-debug'],
     *          workflow:{
     *              branches:['(of#A)>>(map#B)>>(console)']
     *          },
     *          flowchart: [{
     *              // This creates a nested layer within the flowchart including the modules `A`& `B`.
     *              layers:[{
     *                  layerId: 'nestedModules',
     *                  uids: ['A', 'B']
     *              }],
     *              // This creates a custom module's view within the flowchart associated to module `A`.
     *              annotations: [{
     *                  selector: ({uid}) => uid === 'A',
     *                  html: (module) => {
     *                      // module can be used to retrieve input/output observables and create reactive element here.
     *                      // Not done here for the sake of simplicity.
     *                      // Please refer to the @youwol/flux-view (https://l.youwol.com/doc/@youwol/flux-view)
     *                      // documentation to create reactive elements.
     *                      return {
     *                          innerText: 'Module A'
     *                      }
     *                  }
     *              }]
     *          }]
     *      })
     * }
     * ```
     *
     */
    flowchart?: Flowchart

    /**
     * Side project that can be instantiated independently of the main one, themselves including workflow, HTML views,
     * *etc*.
     * Additional information can be found in the documentation of {@link Worksheet}.
     *
     * @example
     *
     * ```
     * (project: ProjectState) => {
     *      return await project.with({
     *          toolboxes: ['@youwol/vsf-rxjs', '@youwol/vsf-debug'],
     *          worksheets: [{
     *              id: 'test worksheet',
     *              workflow:{
     *                  branches:['(timer#timer)>>(view#DateView)'],
     *                  configurations:{
     *                      DateView:{
     *                          vDomMap: (message) => ({
     *                              innerText: new Date().toLocaleString()
     *                          }),
     *                      }
     *                  }
     *              },
     *              views:[{
     *                  id: 'foo',
     *                  class: 'd-flex align-items-center',
     *                  html: (instances) => {
     *                      return {
     *                          children:[
     *                              {
     *                                  innerText: 'It is:'
     *                              },
     *                              instances.inspector().get('DateView').html()
     *                          ]
     *                      }
     *                  }
     *              }]
     *          }]
     *      })
     * }
     * ```
     */
    worksheets?: Worksheet[]

    /**
     *  Definition of reusable 'block' composed by modules, connections, as well as other macros.
     *  Additional information can be found in the documentation of {@link Macro}.
     *
     *  @example
     *
     *  ```
     *  (project: ProjectState) => {
     *      return await project.with({
     *          toolboxes: ['@youwol/vsf-rxjs', '@youwol/vsf-debug'],
     *          macros: [{
     *              typeId:'foo',
     *              workflow:{
     *                  branches:['(timer#timer)>>(take#take)'],
     *                  configurations:{
     *                      take:{ count: 3 }
     *                  }
     *              },
     *              api:{
     *                  // the macro has no inputs
     *                  inputs:[],
     *                  // the macro has one output: the first (and only) output of the `take` module
     *                  outputs:['(#take)0'],
     *                  // the following defines the configuration of the macro & how it maps to the configuration
     *                  // of inner modules
     *                  configuration: {
     *                      schema: {
     *                          takeCount:  new Configurations.Integer({value:1})
     *                      },
     *                      mapper: (d:{takeCount:number}) => {
     *                          return {
     *                              take: { count: takeCount }
     *                          }
     *                      }
     *                  }
     *              }
     *          }],
     *          // This illustrates how to instantiate the macro
     *          workflow:{
     *              branches: ['(foo#fooMacro)>>(console)'],
     *              configurations: {
     *                  fooMacro:{ takeCount: 4 }
     *              }
     *          }
     *      })
     * }
     * ```
     *
     */
    macros?: Macro<Configurations.Schema>[]

    /**
     * Specification of pools of workers allowing to offload macro execution from the main thread.     *
     *  Additional information can be found in the documentation of {@link WorkersPool}.
     *
     * @example
     *
     * ```
     * (project: ProjectState) => {
     *     return await project.with({
     *         workersPools:[{
     *             id: 'A',
     *             startAt: 1,
     *             stretchTo: 4
     *         }]
     *     })
     * }
     * ```
     */
    workersPools?: WorkersPool[]

    /**
     * Definition of custom modules.
     * Additional information can be found in the documentation of {@link Modules.Module}.
     *
     * @example
     *
     * The following example illustrates a `times` module that multiply incoming data by a given factor define in its
     * configuration.
     *
     * ```
     * (project: ProjectState) => {
     *      const configuration =  {
     *          schema: {
     *              factor: new Configurations.Float({value:1})
     *          }
     *      }
     *      const inputs = {
     *          input$: {
     *              description: 'Single input of the module, the incoming value is multiplied by a factor',
     *              contract: Contracts.of<number>({
     *                  description: "The incoming data is a number"
     *                  when: (data) => typeof data === 'number'
     *              })
     *          }
     *      }
     *      const outputs = (arg: Modules.OutputsMapperArg<typeof configuration.schema, typeof inputs>) => ({
     *          output$: arg.inputs.input$.pipe(
     *              // in typescript, type of 'data' and 'configuration' will be inferred
     *              // (respectively 'number' and '{factor:number}')
     *              // rxjs (RxJS library) is supposed to be available in the scope
     *              rxjs.operators.map(({data, configuration}) => data*configuration.factor )
     *          )
     *      })
     *      const module = new Modules.Module({
     *          declaration: {
     *              typeId: 'times'
     *          },
     *          implementation: ({fwdParams}) => {
     *              return new Modules.Implementation({
     *                  configuration,
     *                  inputs,
     *                  outputs,
     *                  // a simple view for the module is provided below
     *                   // fv (@youwol/flux-view library) is supposed to be available in the scope
     *                  html: (self: Immutable<Modules.ImplementationTrait>) => ({
     *                      innerText: fv.attr$(self.outputSlots.output$.observable$, (v) => `last value emitted: ${v}`)
     *                  })
     *              },
     *              fwdParams)
     *          }
     *     })
     *     return await project.with({
     *         customModules:[module]
     *     })
     * }
     * ```
     */
    customModules?: Modules.Module[]
}
