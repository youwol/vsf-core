import { Immutables, ToolBox, UidTrait } from '../common'
import { Modules } from '..'
import { ConnectionModel, ModuleModel } from '../project'

/**
 * Parse a string representation of a DAG into {@link ModuleModel} & {@link ConnectionModel}.
 *
 * @param flows string representation of one or multiple flows.
 * Typically `(map#map0)>>(filter#filter0)>#C0>0(take)`
 * -  modules are defined in `()` is: (typeId#moduleId) where typeId is the type id of the module and moduleId its uid (if provided)
 * -  connections are defined in `>>`: `i>#Cid>j` means connection from the output slot indexed `i` of the previous module
 * to the input slot indexed `j` in the next module, with a connection uid `Cid`. By default, `i` & `j is 0.
 * @param configs dictionary of configurations with keys being the UID of the module/connection
 * @param toolboxes list of available toolboxes
 * @param availableModules modules already available in the workflow
 */
export function parseDag({
    flows,
    configs,
    toolboxes,
    availableModules,
}: {
    flows: string | string[]
    configs: { [_k: string]: unknown }
    toolboxes: Immutables<ToolBox>
    availableModules: Immutables<ModuleModel>
}): { modules: ModuleModel[]; connections: ConnectionModel[] } {
    const sanitizedFlows: string[] = Array.isArray(flows) ? flows : [flows]

    const { modules, connections } = sanitizedFlows.reduce(
        (acc, branch) => {
            const { modules, connections } = parseBranch({
                branch,
                configs,
                toolboxes,
                availableModules: [...availableModules, ...acc.modules],
            })
            return {
                modules: [...acc.modules, ...modules],
                connections: [...acc.connections, ...connections],
            }
        },
        { modules: [] as ModuleModel[], connections: [] as ConnectionModel[] },
    )
    const removeDuplicates = (
        modules: Immutables<ModuleModel>,
    ): ModuleModel[] => {
        const newModules = Object.values(modules).filter(
            (m) => availableModules.find((m2) => m2.uid == m.uid) == undefined,
        )
        return Object.values(
            newModules.reduce((acc, m) => ({ ...acc, [m.uid]: m }), {}),
        )
    }
    return { modules: removeDuplicates(modules), connections }
}

function locations(substring, string) {
    const a = []
    let i = -1
    while ((i = string.indexOf(substring, i + 1)) >= 0) {
        a.push(i)
    }
    return a
}

export function parseBranch({
    branch,
    configs,
    toolboxes,
    availableModules,
}: {
    branch: string
    configs
    toolboxes: Immutables<ToolBox>
    availableModules: Immutables<ModuleModel>
}) {
    const starts = locations('(', branch)
    const ends = locations(')', branch)
    const modulesStr = starts.map((i0, i) => {
        return branch.substring(i0 + 1, ends[i])
    })
    const modules = modulesStr
        .map((moduleStr) =>
            parseModule({ moduleStr, configs, toolboxes, availableModules }),
        )
        .filter((m) => m != undefined)

    const connections = ends
        .map((i0, i) => {
            return branch.substring(i0 + 1, starts[i + 1])
        })
        .slice(0, -1)
        .map((connection, i) => {
            return parseConnection({
                connectionStr: connection,
                beforeModule: modules[i],
                afterModule: modules[i + 1],
                configs,
            })
        })
    return {
        modules,
        connections,
    }
}

function parseModule({
    moduleStr,
    configs,
    toolboxes,
    availableModules,
}: {
    moduleStr: string
    configs: { [_k: string]: unknown }
    toolboxes: Immutables<ToolBox>
    availableModules: Immutables<ModuleModel>
}) {
    const idIndex = moduleStr.indexOf('#')
    const [typeId, moduleId] =
        idIndex != -1
            ? [
                  moduleStr.substring(0, idIndex),
                  moduleStr.substring(idIndex + 1),
              ]
            : [moduleStr, undefined]
    if (typeId == '') {
        const module = availableModules.find((m) => m.uid == moduleId)
        if (!module) {
            throw Error(`Can not find module #${moduleId}`)
        }
        return module
    }
    const toolbox = toolboxes.find((tb) =>
        tb.modules.find((m) => m.declaration.typeId == typeId),
    )
    if (toolbox == undefined) {
        throw Error(`Can not find toolbox for module ${typeId}`)
    }
    return {
        typeId,
        uid: moduleId || Modules.uuidv4(),
        configuration: moduleId ? configs[moduleId] : undefined,
        toolboxId: toolbox.origin.packageName,
        toolboxVersion: toolbox.origin.version,
    } as ModuleModel
}

function parseConnection({
    connectionStr,
    beforeModule,
    afterModule,
    configs,
}: {
    connectionStr: string
    beforeModule: UidTrait
    afterModule: UidTrait
    configs
}) {
    const indexes = locations('>', connectionStr)
    let startIndex = 0
    let endIndex = 0
    if (indexes[0] > 0) {
        startIndex = parseInt(connectionStr.substring(0, indexes[0]))
    }
    if (indexes[1] < connectionStr.length - 1) {
        endIndex = parseInt(connectionStr.substring(indexes[1] + 1))
    }
    const content = connectionStr.substring(indexes[0] + 1, indexes[1])
    const uid = content.includes('#')
        ? content.substring(content.indexOf('#') + 1)
        : `(${beforeModule.uid})${startIndex}>>${endIndex}(${afterModule.uid})`

    return {
        start: {
            slotId: startIndex,
            moduleId: beforeModule.uid,
        },
        end: {
            slotId: endIndex,
            moduleId: afterModule.uid,
        },
        configuration: uid && configs[uid] ? configs[uid] : {},
        uid: uid,
    } as ConnectionModel
}

export function parseMacroInput({
    inputStr,
    toolboxes,
    availableModules,
}: {
    inputStr: string
    toolboxes: Immutables<ToolBox>
    availableModules: Immutables<ModuleModel>
}): {
    slotId: number
    moduleId: string
} {
    const { modules } = parseBranch({
        branch: inputStr,
        configs: {},
        toolboxes,
        availableModules,
    })
    return { moduleId: modules[0].uid, slotId: parseInt(inputStr[0]) }
}
export function parseMacroOutput({
    outputStr,
    toolboxes,
    availableModules,
}: {
    outputStr: string
    toolboxes: Immutables<ToolBox>
    availableModules: Immutables<ModuleModel>
}): {
    slotId: number
    moduleId: string
} {
    const { modules } = parseBranch({
        branch: outputStr,
        configs: {},
        toolboxes,
        availableModules,
    })
    return {
        moduleId: modules[0].uid,
        slotId: parseInt(outputStr.slice(-1)[0]),
    }
}
