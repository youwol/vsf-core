import { Chart, InstancePool } from '../instance-pool'
import { NoContext } from '@youwol/logging'
import { MacroModel } from '../workflow'
import { ForwardArgs, Implementation, ImplementationTrait } from '../../modules'
import { takeUntil } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { WorkersPoolTypes } from '@youwol/cdn-client'
import { createMacroInputs, createMacroOutputs } from '../macro'
import { Immutable } from '../../common'

import { InstancePoolWorker } from './instance-pool-worker'
import { Probe } from './models'

function transmitInputMessage(
    macroUid: string,
    taskId: string,
    target: { moduleId: string; slotId: number },
    source$: Observable<unknown>,
    workersPool: Immutable<WorkersPoolTypes.WorkersPool>,
) {
    const send = (kind, message = undefined) => {
        workersPool.sendData({
            taskId: taskId,
            data: {
                kind,
                macro: macroUid,
                ...target,
                message,
            },
        })
    }
    source$.subscribe(
        (m) => send('InputMessage', m),
        () => {
            /*no op on error*/
        },
        () => {
            send('InputClosed')
        },
    )
}

export async function deployMacroInWorker(
    {
        macro,
        chart,
        workersPool,
        fwdParams,
    }: {
        macro: MacroModel
        chart: Chart
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
        fwdParams: ForwardArgs
    },
    context = NoContext,
): Promise<ImplementationTrait> {
    return await context.withChildAsync('deployMacroInWorker', async (ctx) => {
        ctx.info('Workers pool', workersPool)

        let instancePoolWorker = await InstancePoolWorker.empty({
            processName: fwdParams.uid,
            workersPool,
            parentUid: fwdParams.uid
        })
        instancePoolWorker = await instancePoolWorker.deploy(
            {
                chart,
                environment: fwdParams.environment,
                scope: {},
                customArgs: { outputs: macro.outputs },
                probes: (instancePool: InstancePool, customArgs) => {
                    // Be careful: this function is executed in a worker: no outside references allowed
                    const notForwarded = () => {
                        return {
                            data: 'Data not forwarded',
                        }
                    }
                    return [
                        ...instancePool.modules
                            .flatMap((m) => Object.values(m.inputSlots))
                            .map((inputSlot) => {
                                return {
                                    kind: 'module.inputSlot.rawMessage$',
                                    id: {
                                        moduleId: inputSlot.moduleId,
                                        slotId: inputSlot.slotId,
                                    },
                                    message: notForwarded,
                                } as Probe<'module.inputSlot.rawMessage$'>
                            }),
                        ...instancePool.modules
                            .flatMap((m) =>
                                Object.values(m.outputSlots).map(
                                    (slot, index) => ({
                                        slot,
                                        index,
                                    }),
                                ),
                            )
                            .map(({ slot, index }) => {
                                // If the following expression is inlined in the ternary operator where it is used below
                                // => consuming project will have an EsLint error at `import '@youwol/vsf-core'`:
                                //  'Parse errors in imported module '@youwol/vsf-core': Identifier expected.'
                                const isMacroOutputs =
                                    customArgs.outputs.find(
                                        (o) =>
                                            o.slotId === index &&
                                            o.moduleId === slot.moduleId,
                                    ) !== undefined
                                return {
                                    kind: 'module.outputSlot.observable$',
                                    id: {
                                        moduleId: slot.moduleId,
                                        slotId: slot.slotId,
                                    },
                                    message: isMacroOutputs
                                        ? (inWorkerMessage) => inWorkerMessage
                                        : notForwarded,
                                } as Probe<'module.outputSlot.observable$'>
                            }),
                        ...instancePool.connections.map((connection) => {
                            return {
                                kind: 'connection.status$',
                                id: { connectionId: connection.uid },
                                message: (inWorkerMessage) => inWorkerMessage,
                            } as Probe<'connection.status$'>
                        }),
                    ]
                },
            },
            ctx,
        )
        const inputs = createMacroInputs(macro)
        const outputs = createMacroOutputs(macro, instancePoolWorker)

        const implementation = new Implementation(
            {
                configuration: macro.configuration,
                inputs,
                outputs,
                instancePool: instancePoolWorker,
                html: macro.html,
            },
            fwdParams,
        )

        macro.inputs.map((input, i) => {
            const inputSlot = Object.values(implementation.inputSlots)[i]

            transmitInputMessage(
                macro.uid,
                instancePoolWorker.processId,
                input,
                inputSlot.preparedMessage$.pipe(
                    takeUntil(instancePoolWorker.terminated$),
                ),
                workersPool,
            )
        })
        return implementation
    })
}
