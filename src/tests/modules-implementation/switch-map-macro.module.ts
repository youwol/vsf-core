// noinspection JSValidateJSDoc

import { concatMap, exhaustMap, map, mergeMap, switchMap } from 'rxjs/operators'
import { Configurations, Modules, Contracts } from '../../lib'
import {
    InnerMacrosOrchestrationTrait,
    InnerMacrosPool,
} from '../../lib/project'

export type Policy = 'switch' | 'merge' | 'concat' | 'exhaust'
export const partialConfiguration = {
    schema: {
        innerMacro: {
            macroTypeId: new Configurations.String({ value: '' }),
            configuration: {
                workersPoolId: new Configurations.String({ value: '' }),
            },
            inputIndex: new Configurations.Integer({ value: 0 }),
            outputIndex: new Configurations.Integer({ value: 0 }),
        },
        purgeOnTerminated: new Configurations.Boolean({ value: true }),
        policy: new Configurations.StringLiteral<Policy>({
            value: 'switch',
        }),
    },
}

export const inputs = {
    input$: {
        description: 'the input stream',
        contract: Contracts.ofUnknown,
    },
}

export const outputs = (
    arg: Modules.OutputMapperArg<
        typeof partialConfiguration.schema,
        typeof inputs,
        InnerMacrosPool
    >,
) => {
    return {
        output$: arg.state.result$({
            outer$: arg.inputs.input$,
        }),
        instancePool$: arg.state.instancePool$.pipe(
            map((pool) => ({ data: pool, context: {} })),
        ),
    }
}

export function module(fwdParams: Modules.ForwardArgs) {
    const model = fwdParams.environment.macrosToolbox.modules.find(
        (m) =>
            m.declaration.typeId ==
            fwdParams.configurationInstance.innerMacro['macroTypeId'],
    ).declaration['macroModel']
    const configuration = Configurations.extendConfig({
        configuration: partialConfiguration,
        target: ['innerMacro', 'configuration'],
        with: model.configuration.schema,
    })
    const configInstance = Configurations.extractConfigWith({
        configuration,
        values: fwdParams.configurationInstance,
    })

    const base = {
        onInnerMacroStarted: ({ state, fromOuterMessage }) => {
            state.started = state.started
                ? [...state.started, fromOuterMessage]
                : [fromOuterMessage]
        },
        onInnerMacroCompleted: ({ state, fromOuterMessage }) => {
            state.completed = state.completed
                ? [...state.completed, fromOuterMessage]
                : [fromOuterMessage]
        },
        onInnerMacroTerminated: ({ state, fromOuterMessage }) => {
            state.terminated = state.terminated
                ? [...state.terminated, fromOuterMessage]
                : [fromOuterMessage]
        },
        onOuterObservableCompleted: ({ state }) => {
            state.outerCompleted = true
        },
    }
    const orchestrators: Record<Policy, InnerMacrosOrchestrationTrait> = {
        switch: {
            ...base,
            orchestrate: switchMap,
        },
        merge: {
            ...base,
            orchestrate: mergeMap,
        },
        concat: {
            ...base,
            orchestrate: concatMap,
        },
        exhaust: {
            ...base,
            orchestrate: exhaustMap,
        },
    }
    const state = new InnerMacrosPool({
        parentUid: fwdParams.uid,
        environment: fwdParams.environment,
        purgeOnTerminated: configInstance.purgeOnTerminated,
        orchestrator: orchestrators[configInstance.policy],
    })
    return new Modules.Implementation(
        {
            configuration,
            inputs,
            outputs,
            state,
            journal: state.journal,
            instancePool: state.instancePool$,
        },
        fwdParams,
    )
}
