import { NoContext } from '@youwol/logging'
import { takeUntil } from 'rxjs/operators'
import { WorkersPoolTypes } from '@youwol/cdn-client'

import { Immutable } from '../common'
import { Deployers, Modules } from '..'
import { createMacroInputs, createMacroOutputs, MacroModel } from './'

export async function deployMacroInWorker(
    {
        macro,
        chart,
        workersPool,
        fwdParams,
    }: {
        macro: Immutable<MacroModel>
        chart: Deployers.Chart
        workersPool: Immutable<WorkersPoolTypes.WorkersPool>
        fwdParams: Modules.ForwardArgs
    },
    context = NoContext,
): Promise<Modules.ImplementationTrait> {
    return await context.withChildAsync('deployMacroInWorker', async (ctx) => {
        ctx.info('Workers pool', workersPool)

        let instancePoolWorker = await Deployers.InstancePoolWorker.empty({
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
                probes: Deployers.getProbes,
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

            Deployers.transmitInputMessage(
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
