import { toolbox } from './toolbox'
import {
    emptyWorkflowModel,
    Environment,
    InstancePool,
    ProjectState,
} from '../lib/project'
import { setup } from '../auto-generated'
import * as SphereModule from './modules-implementation/sphere.module'

export function emptyProject() {
    const auxModuleSphere = 'test-sphere-module'
    window[`${setup.name}/${auxModuleSphere}_API${setup.apiVersion}`] =
        SphereModule
    const environment = new Environment({
        toolboxes: [toolbox],
    })
    return new ProjectState({
        main: emptyWorkflowModel(),
        instancePool: new InstancePool(),
        macros: [],
        environment,
    })
}
