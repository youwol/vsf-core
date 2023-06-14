import { MacroModel, ModuleModel } from './workflow'
import { ImplementationTrait, mergeMessagesContext, Module } from '../modules'
import { extractConfigWith, Immutables, Modules } from '..'
import { InstancePool } from './instance-pool'
import { ofUnknown } from '../modules/IOs/contract'
import { takeUntil } from 'rxjs/operators'
import { ContextLoggerTrait, NoContext } from '@youwol/logging'
import { deployMacroInWorker } from './macro-workers'

function gatherDependencies(_modules: Immutables<ModuleModel>) {
    return {}
}

export function createMacroInputs(macro: MacroModel) {
    return macro.inputs.reduce((acc, e, i) => {
        return {
            ...acc,
            [`input_${i}$`]: {
                description: e,
                contrat: ofUnknown,
            },
        }
    }, {})
}

export function createChart({ macro, dynamicConfig }, context = NoContext) {
    return context.withChild('Create chart deployment model', (ctx) => {
        const configInstance = extractConfigWith(
            {
                configuration: macro.configuration || {
                    schema: {},
                },
                values: dynamicConfig,
            },
            ctx,
        )
        const configMap = macro.configMapper
            ? macro.configMapper(configInstance)
            : {}
        ctx.info('ConfigMap', configMap)
        const patchConf = (base) => ({
            ...base,
            configuration: configMap[base.uid],
        })
        const chart = {
            modules: macro.modules.map((m) =>
                configMap[m.uid] ? patchConf(m) : m,
            ),
            connections: macro.connections.map((c) =>
                configMap[c.uid] ? patchConf(c) : c,
            ),
            metadata: {
                configInstance,
            },
        }
        ctx.info('Chart created', chart)
        return chart
    })
}

export function macroInstance(macro: MacroModel): Module<ImplementationTrait> {
    return new Module({
        declaration: {
            typeId: macro.uid,
            dependencies: gatherDependencies(macro.modules),
        },
        implementation: async (
            {
                fwdParams,
            }: {
                fwdParams: Modules.ForwardArgs
            },
            _context: ContextLoggerTrait = NoContext,
        ) => {
            const ctx = fwdParams.context

            const chart = createChart(
                { macro, dynamicConfig: fwdParams.configurationInstance },
                ctx,
            )

            return macro.workersPool
                ? deployMacroInWorker(
                      {
                          macro,
                          chart,
                          fwdParams,
                      },
                      ctx,
                  )
                : deployMacroInMainThread(
                      {
                          macro,
                          chart,
                          fwdParams,
                      },
                      ctx,
                  )
        },
    })
}

async function deployMacroInMainThread(
    { fwdParams, chart, macro },
    context = NoContext,
) {
    return await context.withChildAsync(
        'deployMacroInMainThread',
        async (ctx) => {
            const { inputs, outputs, instancePool } = await ctx.withChildAsync(
                'Preparation inner instance pool & IO',
                async (ctxInner) => {
                    let instancePool = new InstancePool()
                    instancePool = await instancePool.deploy(
                        {
                            chart,
                            environment: fwdParams.environment,
                            scope: {
                                uid: fwdParams.uid,
                                configuration: chart.metadata.configInstance,
                            },
                        },
                        ctxInner,
                    )

                    ctxInner.info("macro's instancePool", instancePool)
                    const inputs = createMacroInputs(macro)

                    const outputs = () =>
                        macro.outputs.reduce((acc, e, i) => {
                            const module = instancePool.getModule(e.moduleId)
                            const slot = Object.values(module.outputSlots)[
                                e.slotId
                            ]
                            return {
                                ...acc,
                                [`output_${i}$`]: slot.observable$,
                            }
                        }, {})
                    return { inputs, outputs, instancePool, chart }
                },
            )

            const implementation = new Modules.Implementation(
                {
                    configuration: macro.configuration || {
                        schema: {},
                    },
                    inputs,
                    outputs,
                    instancePool,
                    html: macro.html,
                },
                fwdParams,
            )
            ctx.withChild("connect macro's API", () => {
                macro.inputs.forEach((input, i) => {
                    const inputSlot = Object.values(implementation.inputSlots)[
                        i
                    ]
                    const instance = instancePool.getModule(input.moduleId)
                    const targetSlot = Object.values(instance.inputSlots)[
                        input.slotId
                    ]
                    inputSlot.preparedMessage$
                        .pipe(takeUntil(instancePool.terminated$))
                        .subscribe(
                            ({ data, configuration, context }) => {
                                targetSlot.rawMessage$.next({
                                    data,
                                    configuration: {},
                                    context: mergeMessagesContext(context, {
                                        macroConfig: configuration,
                                    }),
                                })
                            },
                            (e) => {
                                console.error(
                                    'Macro: error while forwarding message in inner module',
                                    e,
                                )
                            },
                            () => {
                                targetSlot.rawMessage$.complete()
                            },
                        )
                })
            })
            return implementation
        },
    )
}
