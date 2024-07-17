import './mock-requests'
import { toolbox } from './toolbox'
import { Environment, ProjectState } from '../lib/project'
import { RootRouter } from '@youwol/http-primitives'
import {
    Client,
    backendConfiguration,
    WorkersPoolTypes,
    installTestWorkersPoolModule,
    normalizeInstallInputs,
} from '@youwol/webpm-client'
import { setup } from '../auto-generated'

export function emptyProject() {
    return new ProjectState({
        environment: new Environment({
            toolboxes: [toolbox],
        }),
    })
}

function getPyYouwolBasePath() {
    const url = globalThis.youwolJestPresetGlobals.integrationUrl
    if (globalThis.youwolJestPresetGlobals.debug) {
        console.log('URL in common.ts : ', url)
    }
    return url
}

export function setupCdnHttpConnection(
    { localOnly }: { localOnly: boolean } = { localOnly: true },
) {
    RootRouter.HostName = getPyYouwolBasePath()
    RootRouter.Headers = {
        'py-youwol-local-only': localOnly ? 'true' : 'false',
    }
    Client.BackendConfiguration = backendConfiguration({
        origin: { port: 2001 },
        pathLoadingGraph:
            '/api/assets-gateway/cdn-backend/queries/loading-graph',
        pathResource: '/api/assets-gateway/raw/package',
    })
    Client.Headers = RootRouter.Headers
}

export function installTestWorkersEnvironment() {
    return installTestWorkersPoolModule({
        onBeforeWorkerInstall: ({
            message,
        }: {
            message: WorkersPoolTypes.MessageInstall
        }) => {
            // We replace the request to install @youwol/vsf-core
            // This module will be picked from the actual sources of this project.
            const install = normalizeInstallInputs(message.cdnInstallation)
            const vsfCore = `@youwol/vsf-core#${setup.version}`
            install.esm.modules = install.esm.modules.filter(
                (item) => item !== `@youwol/vsf-core#${setup.version}`,
            )
            const alias = Object.entries(install.esm.aliases).find(
                ([_, v]) =>
                    typeof v === 'string' && v.includes('@youwol/vsf-core'),
            )[0]
            globalThis[alias] = vsfCore
        },
    })
}
