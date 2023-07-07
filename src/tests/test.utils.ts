import './mock-requests'
import { toolbox } from './toolbox'
import { Environment, ProjectState } from '../lib/project'
import { RootRouter } from '@youwol/http-primitives'
import { Client, backendConfiguration } from '@youwol/cdn-client'

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
