import {
    ConfigInstance,
    Configuration,
    ExecutionJournal,
    Immutable,
    Schema,
} from '..'
import { VirtualDOM } from '@youwol/flux-view'
import { Observable } from 'rxjs'

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
    status$: Observable<TStatus>
}

/**
 * Trait for object that can be configured.
 *
 * @typeParam TSchema The type of the schema associated to the configuration of the module.
 */
export interface ConfigurableTrait<TSchema extends Schema> {
    configuration: Immutable<Configuration<TSchema>>
    configurationInstance: Immutable<ConfigInstance<TSchema>>
}

/**
 * Type guard on {@link ConfigurableTrait}.
 * @param object object to test
 */
export function implementsConfigurableTrait(
    object: unknown,
): object is ConfigurableTrait<Schema> {
    const maybeConf = object as ConfigurableTrait<Schema>
    return (
        maybeConf.configuration != undefined &&
        maybeConf.configurationInstance != undefined &&
        maybeConf.configuration.schema != undefined
    )
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
