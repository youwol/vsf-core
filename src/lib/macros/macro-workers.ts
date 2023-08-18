import { NoContext } from '@youwol/logging'
import { takeUntil } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { WorkersPoolTypes } from '@youwol/cdn-client'

import { Immutable } from '../common'
import { Runners, Modules } from '..'
import { createMacroInputs, createMacroOutputs } from './'
import { MacroModel } from '../project'

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
export function getProbes(instancePool: Runners.InstancePool, customArgs) {
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
                } as Runners.Probe<'module.inputSlot.rawMessage$'>
            }),
        ...instancePool.modules
            .flatMap((m) =>
                Object.values(m.outputSlots).map((slot, index) => ({
                    slot,
                    index,
                })),
            )
            .map(({ slot, index }) => {
                // If the following expression is inlined in the ternary operator where it is used below
                // => consuming project will have an EsLint error at `import '@youwol/vsf-core'`:
                //  'Parse errors in imported module '@youwol/vsf-core': Identifier expected.'
                const isMacroOutputs =
                    customArgs.outputs.find(
                        (o) =>
                            o.slotId === index && o.moduleId === slot.moduleId,
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
                } as Runners.Probe<'module.outputSlot.observable$'>
            }),
        ...instancePool.connections.map((connection) => {
            return {
                kind: 'connection.status$',
                id: { connectionId: connection.uid },
                message: (inWorkerMessage) => inWorkerMessage,
            } as Runners.Probe<'connection.status$'>
        }),
    ]
}
export async function deployMacroInWorker(
    {
        macro,
        chart,
        workersPool,
        fwdParams,
    }: {
        macro: Immutable<MacroModel>
        chart: Runners.Chart
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
        fwdParams: Modules.ForwardArgs
    },
    context = NoContext,
): Promise<Modules.ImplementationTrait> {
    return await context.withChildAsync('deployMacroInWorker', async (ctx) => {
        ctx.info('Workers pool', workersPool)

        let instancePoolWorker = await Runners.InstancePoolWorker.empty({
            processName: fwdParams.uid,
            workersPool,
            parentUid: fwdParams.uid,
        })
        instancePoolWorker = await instancePoolWorker.deploy(
            {
                chart,
                environment: fwdParams.environment,
                scope: {},
                customArgs: { outputs: macro.outputs },
                probes: getProbes,
            },
            ctx,
        )
        const inputs = createMacroInputs(macro)
        const outputs = createMacroOutputs(macro, instancePoolWorker)

        const implementation = new Modules.Implementation(
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
