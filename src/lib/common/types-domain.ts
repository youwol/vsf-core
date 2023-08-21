import { DocumentationTrait, Immutables, Modules, UidTrait } from '..'

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
        modules: Immutables<Modules.Module>
        /**
         * name of the toolbox
         */
        name: string

        icon?: {
            svgString?: string
        }
    }
