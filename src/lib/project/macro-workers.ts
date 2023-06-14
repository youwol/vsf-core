import { Chart, InstancePool } from './instance-pool'
import { NoContext } from '@youwol/logging'
import { ProjectState } from './project'
import { MacroModel } from './workflow'
import { Implementation, ImplementationTrait } from '../modules'
import { filter, map, shareReplay, take, tap } from 'rxjs/operators'
import { Subject } from 'rxjs'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import { createMacroInputs } from './macro'

export async function deployMacroInWorker(
    {
        macro,
        chart,
        fwdParams,
    }: {
        macro: MacroModel
        chart: Chart
        fwdParams
    },
    context = NoContext,
): Promise<ImplementationTrait> {
    return await context.withChildAsync('deployMacroInWorker', async (ctx) => {
        const wp = await fwdParams.environment.getWorkersPool(
            {
                id: macro.uid,
                config: macro.workersPool,
                dependencies: {
                    modules: ['@youwol/vsf-core#^0.1.0'],
                    aliases: {
                        vsfCore: '@youwol/vsf-core',
                    },
                },
            },
            ctx,
        )
        ctx.info('Workers pool initialized', wp)
        const inputs = createMacroInputs(macro)

        const outputs$ = macro.outputs.map(() => new Subject())
        const outputs = () =>
            macro.outputs.reduce((acc, e, i) => {
                return {
                    ...acc,
                    [`output_${i}$`]: outputs$[i],
                }
            }, {})

        const implementation = new Implementation(
            {
                configuration: macro.configuration || {
                    schema: {},
                },
                inputs,
                outputs,
                instancePool: new InstancePool(),
                html: macro.html,
            },
            fwdParams,
        )
        return await deployInstancePoolInWorker(
            { wp, macro, chart, outputs$, implementation },
            ctx,
        )
    })
}

async function deployInstancePoolInWorker(
    {
        wp,
        macro,
        chart,
        outputs$,
        implementation,
    }: {
        wp: WorkersPoolTypes.WorkersPool
        macro: MacroModel
        chart: Chart
        outputs$: Subject<unknown>[]
        implementation: ImplementationTrait
    },
    context = NoContext,
): Promise<ImplementationTrait> {
    return await context.withChildAsync(
        'install workflow in worker',
        async (ctxInner) => {
            const instancePool$ = wp.schedule({
                title: 'deploy chart in worker',
                entryPoint: deployInstancePoolWorker,
                args: {
                    uid: macro.uid,
                    chart: serializeChart(chart),
                    inputs: macro.inputs,
                    outputs: macro.outputs,
                },
            })
            const output$ = instancePool$.pipe(
                filter((m) => m.type == 'Data' && m.data['step'] == 'Output'),
                map(
                    ({ data }) =>
                        data as unknown as {
                            macroOutputSlot: number
                            message: unknown
                        },
                ),
            )

            output$.subscribe(({ macroOutputSlot, message }) => {
                ctxInner.info('Forward message from worker pool to main', {
                    macroOutputSlot,
                    message,
                })

                console.log('Forward output', { macroOutputSlot, message })
                outputs$[macroOutputSlot].next(message)
            })

            const ready$ = instancePool$.pipe(
                filter((m) => m.type == 'Data' && m.data['step'] == 'Ready'),
                take(1),
                tap(() => {
                    ctxInner.info(
                        'Workers pool ready: instancePool listening',
                        wp,
                    )
                }),
                shareReplay({ bufferSize: 1, refCount: true }),
            )
            const logs$ = instancePool$.pipe(
                filter((m) => m.type == 'Log'),
                map((m) => m.data as WorkersPoolTypes.MessageLog),
            )
            const ctxWorker = ctxInner.startChild('In worker execution')
            logs$.subscribe((m) => {
                ctxWorker.info(m.text, m.json)
            })

            ready$.subscribe(({ data }) => {
                ctxWorker.end()

                implementation.instancePool$.value.terminated$
                    .pipe(take(1))
                    .subscribe(() => {
                        console.log('Stop signal')
                        wp.sendData({
                            taskId: data.taskId,
                            data: { kind: 'StopSignal' },
                        })
                    })

                macro.inputs.map((input, i) => {
                    const inputSlot = Object.values(implementation.inputSlots)[
                        i
                    ]
                    return inputSlot.preparedMessage$.subscribe((message) => {
                        wp.sendData({
                            taskId: data.taskId,
                            data: {
                                kind: 'InputMessage',
                                macro: macro.uid,
                                moduleId: input.moduleId,
                                slotId: i,
                                message,
                            },
                        })
                    })
                })
            })
            return new Promise((resolve) => {
                ready$.subscribe(() => {
                    resolve(implementation)
                })
            })
        },
    )
}

type VsfCore = typeof import('../index')
async function deployInstancePoolWorker({
    args,
    workerScope,
    workerId,
    taskId,
    context,
}) {
    /**
     *
     */
    const vsfCore: VsfCore = workerScope.vsfCore
    const chart = args.chart
    const uid = args.uid
    const rxjs = workerScope.rxjs
    // TODO handle version
    const toolboxes: Set<string> = new Set(
        chart.modules.map((m) => m.toolboxId),
    )
    context.info(`👋 I'm ${workerId}, starting task ${taskId}`)
    console.log(`👋 I'm ${workerId}, starting task ${taskId}`, {
        vsfCore,
        chart,
        args,
        toolboxes,
    })
    let project: ProjectState = new vsfCore.Projects.ProjectState()

    context.info(`${workerId}: importing ${toolboxes.size} toolbox`, [
        ...toolboxes,
    ])
    project = await project.import(...toolboxes)

    let instancePool: InstancePool = new vsfCore.Projects.InstancePool()
    instancePool = await instancePool.deploy({
        chart,
        environment: project.environment,
        scope: {},
    })

    context.info(`${workerId}: instance pool created (${uid})`)

    globalThis[`macro_${uid}`] = {
        instancePool,
        inputs: args.inputs,
        outputs: args.outputs,
    }

    // Plug outputs to forward messages from worker's instance pool to main
    args.outputs.forEach(({ moduleId, slotId }, index) => {
        const instance = instancePool.getModule(moduleId)
        const slot = Object.values(instance.outputSlots)[slotId]
        slot.observable$.subscribe((message) => {
            console.log('@Worker, Got Output Message', message)
            context.sendData({
                step: 'Output',
                macroOutputSlot: index,
                message,
            })
        })
    })
    const input$ = new rxjs.Subject()
    const stop$ = new rxjs.Subject()
    // Plug input to forward message from main to worker's instance pool
    context.onData = (data) => {
        if (data['kind'] == 'InputMessage') {
            console.log(
                `${workerId}: Transfer message to the related input`,
                args,
            )
            input$.next(data)
        }
        if (data['kind'] == 'StopSignal') {
            console.log(`${workerId}: stop signal`, data)
            stop$.next()
        }
    }
    input$.subscribe(({ moduleId, slotId, message }) => {
        const { data, configuration, context } = message
        const instance = instancePool.getModule(moduleId)
        const targetSlot = Object.values(instance.inputSlots)[slotId]
        targetSlot.rawMessage$.next({
            data,
            configuration: {},
            context: vsfCore.Modules.mergeMessagesContext(context, {
                macroConfig: configuration,
            }),
        })
    })
    context.info(`${workerId}: Ready to operate ✅`)
    console.log(`${workerId} Ready`, globalThis[`macro_${uid}`])
    context.sendData({ step: 'Ready' })
    return new Promise<void>((resolve) => {
        stop$.pipe(rxjs.operators.take(1)).subscribe(() => {
            console.log(`${workerId}: Release`)
            resolve()
        })
        /* need to release worker in due time */
    })
}

function toClonable(obj) {
    // Base case: If the object is not an object or is null, return the original value
    if (typeof obj !== 'object' || obj === null) {
        return obj
    }

    // Create a new object to store the converted values
    const convertedObj = Array.isArray(obj) ? [] : {}

    // Traverse the object properties
    Object.keys(obj).forEach((key) => {
        const value = obj[key]

        if (typeof value === 'function') {
            convertedObj[key] = value.toString()
        } else if (typeof value === 'object') {
            convertedObj[key] = toClonable(value)
        } else {
            convertedObj[key] = value
        }
    })

    return convertedObj
}

function serializeChart(chart: Chart) {
    return {
        connections: chart.connections.map((c) => ({
            ...c,
            configuration: toClonable(c.configuration),
        })),
        modules: chart.modules.map((m) => ({
            ...m,
            configuration: toClonable(m.configuration),
        })),
    }
}
