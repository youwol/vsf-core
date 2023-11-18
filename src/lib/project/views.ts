import { VirtualDOM } from '@youwol/flux-view'
import { Journal, installJournalModule } from '@youwol/logging'
import * as webpmClient from '@youwol/webpm-client'
import type * as CdnClient from '@youwol/cdn-client'
import * as fvTree from '@youwol/fv-tree'

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
export async function installFluxView(): Promise<typeof fvTree> {
    return await cdnClient
        .install({
            modules: [`@youwol/flux-view#1.x`],
            aliases: {
                fv: '@youwol/flux-view',
            },
        })
        .then((window) => {
            return window['fv']
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
                return new ObjectJs.View({ state }) as VirtualDOM
            })
        },
    },
    {
        name: 'ExecutionJournal',
        description: 'ExecutionJournal view',
        isCompatible: (d) => d instanceof ExecutionJournal,
        view: (data: ExecutionJournal) => {
            // @youwol/logging need a new version with @youwol/webpm-client
            return installJournalModule(
                webpmClient as unknown as typeof CdnClient,
            ).then((module) => {
                const state = new module.JournalState({
                    journal: {
                        title: "Module's Journal",
                        abstract: '',
                        pages: data.pages,
                    },
                })
                return new module.JournalView({ state })
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
            return installFluxView().then(() => {
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
export class ProjectSummaryView {
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
    public readonly children: VirtualDOM[]

    constructor(params: { project: Immutable<ProjectState> }) {
        Object.assign(this, params)
        this.children = [
            { tag: 'h2', innerText: 'Project summary' },
            { class: 'w-50 mx-auto', innerHTML: summary },
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
class ModulesSummaryView {
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
    public readonly children: VirtualDOM[]

    constructor(params: { project: Immutable<ProjectState> }) {
        Object.assign(this, params)
        const instances = this.project.instancePool.modules
        const views = this.project.instancePool.modules.filter((m) =>
            implementsHtmlTrait(m),
        )
        this.children = [
            {
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
class ConnectionsSummaryView {
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
    public readonly children: VirtualDOM[]

    constructor(params: { project: Immutable<ProjectState> }) {
        Object.assign(this, params)
        const connections = this.project.instancePool.connections
        if (!globalThis['@youwol/flux-view']) {
            throw Error(
                'The package `@youwol/flux-view` needs to be available to create `ConnectionsSummaryView`',
            )
        }
        const fv = globalThis['@youwol/flux-view']
        this.children = [
            {
                innerText: `The project's roots layer contains ${connections.length} connections:`,
            },
            {
                tag: 'ul',
                children: connections.map((c) => ({
                    tag: 'li',
                    innerText: c.uid,
                    children: [
                        {
                            innerText:
                                "Last message's data having reached the connection's end:",
                        },
                        {
                            innerText: fv.attr$(c.end$, ({ data }) =>
                                JSON.stringify(data, null, 4),
                            ),
                        },
                    ],
                })),
            },
        ]
    }
}
