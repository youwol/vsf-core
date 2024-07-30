import './mock-requests'
import { toolbox } from './toolbox'
import { Environment, ProjectState } from '../lib/project'
import * as vsfCore from '../lib'
import { RootRouter, raiseHTTPErrors } from '@youwol/http-primitives'
import {
    Client,
    backendConfiguration,
    WorkersPoolTypes,
    installTestWorkersPoolModule,
    normalizeInstallInputs,
} from '@youwol/webpm-client'
import { setup } from '../auto-generated'
import { readFileSync } from 'fs'
import path from 'path'
import { AssetsGateway } from '@youwol/http-clients'
import { mergeMap, take } from 'rxjs/operators'
import { lastValueFrom } from 'rxjs'

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

export async function installTestWorkersEnvironment() {
    await installVsfCore$()
    return installTestWorkersPoolModule({
        onBeforeWorkerInstall: ({
            message,
        }: {
            message: WorkersPoolTypes.MessageInstall
        }) => {
            // We replace the request to install @youwol/vsf-core
            // This module will be picked from the actual sources of this project.
            const install = normalizeInstallInputs(message.cdnInstallation)
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

export async function installVsfCore$() {
    // For tests involving web-workers, the @youwol/vsf-core module must be installed in the worker.
    // The package is installed in the CDN using the current `cdn.zip` file in the root directory of the project.
    const assetsGtw = new AssetsGateway.AssetsGatewayClient()
    const install$ = assetsGtw.explorer.getDefaultUserDrive$().pipe(
        raiseHTTPErrors(),
        mergeMap((resp) => {
            const fileName = 'cdn.zip'

            const buffer = readFileSync(
                path.join(__dirname, '..', '..', fileName),
            )
            const arraybuffer = Uint8Array.from(buffer).buffer

            return assetsGtw.cdn
                .upload$({
                    queryParameters: { folderId: resp.homeFolderId },
                    body: {
                        fileName,
                        blob: new Blob([arraybuffer]),
                    },
                })
                .pipe(take(1))
        }),
    )
    return lastValueFrom(install$)
}
