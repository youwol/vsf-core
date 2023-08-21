import { VirtualDOM } from '@youwol/flux-view'

import { ToolboxObjectTrait } from '../common'
import { Configurations, Modules, Macros, Workflows } from '..'
/**
 * Specification of a {@link MacroModel} API.
 */
export type MacroApi = {
    configMapper?: (
        configInstance: Configurations.ConfigInstance<Configurations.Schema>,
    ) => {
        [k: string]: { [k: string]: unknown }
    }
    inputs?: {
        slotId: number
        moduleId: string
    }[]
    outputs?: {
        slotId: number
        moduleId: string
    }[]
    html: (instance: Modules.ImplementationTrait, config: unknown) => VirtualDOM
}

/**
 * Specification of a macro for latter instantiation.
 */
export type MacroModel = Workflows.WorkflowModel &
    Partial<Configurations.ConfigurableTrait<Macros.MacroSchema>> &
    Partial<MacroApi> &
    ToolboxObjectTrait
