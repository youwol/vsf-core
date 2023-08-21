import {
    Deployers,
    ExecutionJournal,
    Immutable,
    Immutables,
    Modules,
    ToolBox,
} from '..'
import { VirtualDOM } from '@youwol/flux-view'
import { BehaviorSubject, Observable } from 'rxjs'
import { ContextLoggerTrait, LogChannel } from '@youwol/logging'
import { WorkersPoolTypes } from '@youwol/cdn-client'

/**
 * Trait for object with unique ID
 */
export interface UidTrait {
    uid: string
}

/**
 * Trait identifying object included in a toolbox.
 */
export interface ToolboxObjectTrait {
    /**
     * Type id of the object
     */
    typeId: string

    /**
     * Id of the object's parent toolbox (package's name).
     */
    toolboxId: string

    /**
     * Version of the object's parent toolbox - if applicable
     */
    toolboxVersion?: string
}
/**
 * Trait for object that can provide run-tim info on execution using {@link ExecutionJournal}.
 */
export interface JournalTrait {
    journal: ExecutionJournal
}

/**
 * Trait for objects that can be rendered in an HTML document.
 */
export interface HtmlTrait {
    html: (config?) => VirtualDOM
}
export function implementsHtmlTrait(object: unknown): object is HtmlTrait {
    return (object as HtmlTrait).html != undefined
}

/**
 * Trait for objects that can be rendered in a (3D) canvas.
 */
export interface CanvasTrait {
    canvas: (config?) => VirtualDOM
}

/**
 * Trait for object that can emit status.
 */
export interface StatusTrait<TStatus> {
    status$: BehaviorSubject<TStatus>
}

/**
 * Trait for object documented.
 */
export interface DocumentationTrait {
    /**
     * URL to the documentation
     */
    documentation?: string
}
export function implementsDocumentationTrait(
    object: unknown,
): object is DocumentationTrait {
    return (object as DocumentationTrait).documentation != undefined
}

/**
 * Trait for objects that logging runtime information.
 */
export interface LoggerTrait {
    /**
     * Broadcasting channels
     */
    logsChannels: Immutables<LogChannel>
}

/**
 * Runtime environment.
 */
export interface InstallerTrait {
    instantiateModule<T>(
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
        context: ContextLoggerTrait,
    ): Promise<T & Modules.ImplementationTrait>

    installDependencies(
        {
            modules,
        }: {
            modules: Immutables<{ typeId: string }>
        },
        context: ContextLoggerTrait,
    )

    getFactory({ toolboxId, typeId }: { toolboxId?: string; typeId: string }): {
        factory: Modules.Module<Modules.ImplementationTrait>
        toolbox: ToolBox
    }
}

/**
 * Provides information on a workers pool run-time
 */
export type WorkersPoolRunTime = {
    /**
     * Keys are workers' id
     */
    [k: string]: {
        importedBundles: { [k: string]: Deployers.Version[] }
        executingTaskName?: string
    }
}
export type WorkersPoolModel = {
    id: string
    startAt?: number
    stretchTo?: number
}

export type WorkersPoolInstance = {
    model: WorkersPoolModel
    instance: WorkersPoolTypes.WorkersPool
    runtimes$: Observable<WorkersPoolRunTime>
}

export type EnvironmentTrait = LoggerTrait &
    InstallerTrait & {
        workersPools: Immutables<WorkersPoolInstance>
        toolboxes: Immutables<ToolBox>
        macrosToolbox: Immutable<ToolBox>
    }
