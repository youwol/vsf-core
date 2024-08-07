import {
    ExecutionJournal,
    Configurations,
    Contracts,
    Immutable,
    mergeWith,
} from '..'
import { Context } from '@youwol/logging'
import { Observable, of, ReplaySubject } from 'rxjs'
import { catchError, filter, map } from 'rxjs/operators'

import {
    GetGenericInput,
    GetGenericObservable,
    InputMessage,
    OutputsMapper,
    OutputsReturn,
    ProcessingMessage,
    Scope,
    Input,
    InputSlot,
    OutputSlot,
    OverrideType,
} from './'

type PrepareMessageArgs = {
    moduleId: string
    slotId: string
    defaultConfiguration: Immutable<
        Configurations.Configuration<Configurations.Schema<OverrideType>>
    >
    staticConfiguration: { [_k: string]: unknown }
    contract: Contracts.ExpectationTrait<unknown>
    scope: Immutable<{ [k: string]: unknown }>
    rawMessage: InputMessage
    executionJournal: ExecutionJournal
}

function prepareMessage({
    moduleId,
    slotId,
    defaultConfiguration,
    staticConfiguration,
    contract,
    scope,
    rawMessage,
    executionJournal,
}: PrepareMessageArgs): ProcessingMessage {
    const ctx = executionJournal.addPage({
        title: `Enter slot ${slotId}`,
    })
    ctx.info('Received message', rawMessage)
    const step1 = { ...rawMessage, context: ctx }

    if (!contract) {
        contract = Contracts.ofUnknown
    }
    const resolution = contract.resolve(step1.data, step1.context)
    step1.context.info('Contract resolution done', resolution)
    if (!resolution.succeeded) {
        step1.context.error(
            Error(`Contract resolution failed for ${moduleId}`),
            { contract: contract, resolution, message: step1 },
        )
        return undefined
    }
    const inputMessage = {
        data: resolution.value,
        configuration: Configurations.extractConfigWith(
            {
                configuration: defaultConfiguration,
                values: mergeWith(
                    {},
                    staticConfiguration || {},
                    step1.configuration || {},
                ),
            },
            step1.context,
        ),
        scope,
        context: rawMessage.context,
        logger: step1.context,
    }
    step1.context.info("Module's input message prepared", inputMessage)
    return inputMessage
}

/**
 *
 * @ignore
 */
export function moduleConnectors<
    TSchema extends Configurations.Schema,
    TInputs,
    TState,
>(params: {
    moduleUid: string
    state?: Immutable<TState>
    inputs?: Immutable<{
        [Property in keyof TInputs]: TInputs[Property]
    }>
    outputs?: OutputsMapper<TSchema, TInputs, TState>
    defaultConfiguration: Immutable<
        Configurations.Configuration<Configurations.Schema<OverrideType>>
    >
    scope: Scope
    staticConfiguration: { [_k: string]: unknown }
    executionJournal: ExecutionJournal
    context: Context
}): {
    inputSlots: {
        [Property in keyof TInputs]: InputSlot<
            GetGenericInput<TInputs[Property]>
        >
    }
    outputSlots: {
        [Property in keyof OutputsReturn<TSchema, TInputs>]: OutputSlot<
            GetGenericObservable<OutputsReturn<TSchema, TInputs>[Property]>
        >
    }
} {
    const inputSlots = Object.entries(params.inputs || {}).map(
        ([slotId, input]: [string, Input]) => {
            const rawMessage$ = new ReplaySubject<InputMessage>()
            const preparedMessage$ = rawMessage$.pipe(
                map((rawMessage) => {
                    return prepareMessage({
                        moduleId: params.moduleUid,
                        slotId: slotId,
                        defaultConfiguration: params.defaultConfiguration,
                        staticConfiguration: params.staticConfiguration,
                        contract: input.contract,
                        scope: params.scope,
                        rawMessage: rawMessage,
                        executionJournal: params.executionJournal,
                    })
                }),
                filter((message) => message != undefined),
            )
            return new InputSlot({
                slotId: slotId,
                moduleId: params.moduleUid,
                description: input.description,
                contract: input.contract,
                rawMessage$,
                preparedMessage$,
            })
        },
    )
    const observers = inputSlots.reduce(
        (acc, e) => ({ ...acc, [e.slotId]: e.preparedMessage$ }),
        {},
    ) as {
        [Property in keyof TInputs]: Observable<
            ProcessingMessage<
                GetGenericInput<TInputs[Property]>,
                Configurations.ConfigInstance<TSchema>
            >
        >
    }
    const outputSlots = Object.entries(
        params.outputs({
            inputs: observers,
            state: params.state,
            logContext: params.context,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- pass the ts compiler but IDE report an error
            // @ts-ignore
            configuration: Configurations.extractConfigWith(
                {
                    configuration: params.defaultConfiguration,
                    values: {
                        ...params.staticConfiguration,
                    },
                },
                params.context,
            ),
        }),
    ).map(([id, observable$]: [string, Observable<ProcessingMessage>]) => {
        return new OutputSlot<unknown>({
            slotId: id,
            moduleId: params.moduleUid,
            observable$: observable$.pipe(
                catchError((err) => {
                    console.error(
                        `Error  in module processing (${params.moduleUid})`,
                    )
                    const ctx = params.executionJournal.addPage({
                        title: 'Error in module processing',
                    })
                    ctx.error(err)
                    return of(err)
                }),
                filter((maybeError) => !(maybeError instanceof Error)),
                // The following is tempting, for now `shareReplay`is an opt-in feature
                // the user can add using the `ShareReplay` module of `vsf-rxjs` toolbox.
                //shareReplay({ bufferSize: 1, refCount: true }),
            ),
        })
    })
    return {
        inputSlots: inputSlots.reduce(
            (acc, e) => ({ ...acc, [e.slotId]: e }),
            {},
        ) as {
            [Property in keyof TInputs]: InputSlot<
                GetGenericInput<TInputs[Property]>
            >
        },
        outputSlots: outputSlots.reduce(
            (acc, e) => ({ ...acc, [e.slotId]: e }),
            {},
        ) as {
            [Property in keyof OutputsReturn<TSchema, TInputs>]: OutputSlot<
                GetGenericObservable<OutputsReturn<TSchema, TInputs>[Property]>
            >
        },
    }
}
