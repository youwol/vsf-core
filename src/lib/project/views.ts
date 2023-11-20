import type {
    FluxViewVirtualDOM,
    VirtualDOM,
    ChildrenLike,
} from '@youwol/rx-vdom'
import { Journal, installJournalModule } from '@youwol/logging'
import * as webpmClient from '@youwol/webpm-client'
import * as fvTree from '@youwol/rx-tree-views'

import { setup } from '../../auto-generated'
import {
    ExecutionJournal,
    Immutable,
    implementsHtmlTrait,
    implementsDocumentationTrait,
    ToolBox,
} from '../common'
import { ProjectState } from './'

async function installFvTree(): Promise<typeof fvTree> {
    const version = setup.runTimeDependencies.externals['@youwol/fv-tree']
    return await webpmClient
        .install({
            modules: [`@youwol/fv-tree#${version}`],
            aliases: {
                fvTree: '@youwol/fv-tree',
            },
        })
        .then((window) => {
            return window['fvTree']
        })
}
export async function installRxVDOM(): Promise<typeof fvTree> {
    return await webpmClient
        .install({
            modules: [`@youwol/rx-vdom#^1.0.0 as rxDOM`],
        })
        .then((window) => {
            return window['rxDOM']
        })
}

/**
 * Default elements for {@link Environment.viewsFactory}.
 *
 * Includes:
 * *  `isCompatible: () => true`  => default view for any data
 * *  `isCompatible: (d) =>  d instanceof ExecutionJournal`  => view for {@link ExecutionJournal}
 * *  `isCompatible: (d) => implementsDocumentationTrait(d)` => view for {@link DocumentationTrait}
 */
export const defaultViewsFactory: Journal.DataViewsFactory = [
    {
        name: 'default',
        description: 'Raw view of data',
        isCompatible: () => true,
        view: (data) => {
            return installFvTree().then(({ ObjectJs }) => {
                const state = new ObjectJs.State({
                    title: ' ',
                    data,
                })
                return new ObjectJs.View({ state }) as FluxViewVirtualDOM
            })
        },
    },
    {
        name: 'ExecutionJournal',
        description: 'ExecutionJournal view',
        isCompatible: (d) => d instanceof ExecutionJournal,
        view: (data: ExecutionJournal) => {
            // @youwol/logging need a new version with @youwol/webpm-client
            return installJournalModule(webpmClient).then((module) => {
                const state = new module.JournalState({
                    journal: {
                        title: "Module's Journal",
                        abstract: '',
                        pages: data.pages,
                    },
                })
                return new module.JournalView({ state }) as FluxViewVirtualDOM
            })
        },
    },
    {
        name: 'Documentation',
        description: 'Expose documentation',
        isCompatible: (d: unknown) => implementsDocumentationTrait(d),
        view: (data: ToolBox) => {
            return {
                tag: 'iframe',
                src: data.documentation,
                width: '100%',
                style: { minHeight: '50vh' },
            }
        },
    },
    {
        name: 'Project',
        description: 'Summarize project',
        isCompatible: (d: unknown) => d instanceof ProjectState,
        view: (project: Immutable<ProjectState>) => {
            return installRxVDOM().then(() => {
                return new ProjectSummaryView({ project })
            })
        },
    },
]

export const basePathDoc = `/api/assets-gateway/raw/package/${setup.assetId}/${setup.version}/dist/docs/classes`

const summary = `This view presents a summary of the project updated dynamically.
It is a native view created using the method <a href='${basePathDoc}/VsfCore.Projects.ProjectState.html#summaryHtml'>ProjectState.summaryHtml()</a>.`

/**
 * View summarizing a {@link ProjectState} (see {@link ProjectState.summaryHtml}).
 *
 */
export class ProjectSummaryView implements VirtualDOM<'div'> {
    /**
     * @group Immutable Properties
     */
    public readonly tag: 'div'
    /**
     * @group Immutable Properties
     */
    public readonly project: Immutable<ProjectState>
    /**
     * @group Immutable DOM Attributes
     */
    public readonly class = 'w-100 h-100 overflow-auto p-2'
    /**
     * @group Immutable DOM Attributes
     */
    public readonly children: ChildrenLike

    constructor(params: { project: Immutable<ProjectState> }) {
        Object.assign(this, params)
        this.children = [
            { tag: 'h2', innerText: 'Project summary' },
            { tag: 'div', class: 'w-50 mx-auto', innerHTML: summary },
            { tag: 'h3', innerText: 'Modules' },
            new ModulesSummaryView(params),
            { tag: 'h3', innerText: 'Connections' },
            new ConnectionsSummaryView(params),
        ]
    }
}
/**
 * @category View
 */
class ModulesSummaryView implements VirtualDOM<'div'> {
    /**
     * @group Immutable Properties
     */
    public readonly tag = 'div'
    /**
     * @group Immutable Properties
     */
    public readonly project: Immutable<ProjectState>
    /**
     * @group Immutable DOM Attributes
     */
    public readonly class = 'w-100 overflow-auto p-2'
    /**
     * @group Immutable DOM Attributes
     */
    public readonly children: ChildrenLike

    constructor(params: { project: Immutable<ProjectState> }) {
        Object.assign(this, params)
        const instances = this.project.instancePool.modules
        const views = this.project.instancePool.modules.filter((m) =>
            implementsHtmlTrait(m),
        )
        this.children = [
            {
                tag: 'div',
                innerText: `The project's roots layer contains ${instances.length} instances:`,
            },
            {
                tag: 'ul',
                children: instances.map((instance) => ({
                    tag: 'li',
                    innerHTML: `The module <b>${instance.uid}</b> of type <a href='${instance.factory.declaration.documentation}'>${instance.factory.declaration.typeId}</a>`,
                })),
            },
            {
                tag: 'div',
                innerText: `Among those, ${views.length} are associated to HTML view: `,
            },

            {
                tag: 'ul',
                children: views.map((view) => ({
                    tag: 'li',
                    innerText: view.uid,
                    children: [view.html()],
                })),
            },
        ]
    }
}
/**
 * @category View
 */
class ConnectionsSummaryView implements VirtualDOM<'div'> {
    /**
     * @group Immutable Properties
     */
    public readonly tag = 'div'
    /**
     * @group Immutable Properties
     */
    public readonly project: Immutable<ProjectState>
    /**
     * @group Immutable DOM Attributes
     */
    public readonly class = 'w-100 overflow-auto p-2'
    /**
     * @group Immutable DOM Attributes
     */
    public readonly children: ChildrenLike

    constructor(params: { project: Immutable<ProjectState> }) {
        Object.assign(this, params)
        const connections = this.project.instancePool.connections
        this.children = [
            {
                tag: 'div',
                innerText: `The project's roots layer contains ${connections.length} connections:`,
            },
            {
                tag: 'ul',
                children: connections.map((c) => ({
                    tag: 'li',
                    innerText: c.uid,
                    children: [
                        {
                            tag: 'div',
                            innerText:
                                "Last message's data having reached the connection's end:",
                        },
                        {
                            tag: 'div',
                            innerText: {
                                source$: c.end$,
                                vdomMap: ({ data }) =>
                                    JSON.stringify(data, null, 4),
                            },
                        },
                    ],
                })),
            },
        ]
    }
}
