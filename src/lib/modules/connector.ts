import { ofUnknown } from './IOs/contract'
import {
    ExecutionJournal,
    ConfigInstance,
    Configuration,
    extractConfigWith,
    Schema,
    Immutable,
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
} from './module'
import { Input, InputSlot, OutputSlot } from './IOs'

function prepareMessage(
    moduleId,
    slotId,
    defaultConfiguration,
    staticConfiguration,
    contract,
    scope,
    rawMessage: InputMessage,
    executionJournal,
): ProcessingMessage {
    const ctx = executionJournal.addPage({
        title: `Enter slot ${slotId}`,
        userData: rawMessage.context,
    })
    ctx.info('Received message', rawMessage)
    const step1 = { ...rawMessage, context: ctx }

    if (!contract) {
        contract = ofUnknown
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
        configuration: extractConfigWith(
            {
                configuration: defaultConfiguration,
                values: {
                    ...staticConfiguration,
                    ...step1.configuration,
                },
            },
            step1.context,
        ),
        scope,
        context: rawMessage.context,
    }
    step1.context.info("Module's input message prepared", inputMessage)
    return inputMessage
}

/**
 *
 * @ignore
 */
export function moduleConnectors<
    TSchema extends Schema,
    TInputs,
    TState,
>(params: {
    moduleUid: string
    state?: Immutable<TState>
    inputs?: Immutable<{
        [Property in keyof TInputs]: TInputs[Property]
    }>
    outputs?: OutputsMapper<TSchema, TInputs, TState>
    defaultConfiguration: Immutable<Configuration<TSchema>>
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
        ([slotId, input]: [string, Input<unknown>]) => {
            const rawMessage$ = new ReplaySubject<InputMessage>()
            const preparedMessage$ = rawMessage$.pipe(
                map((rawMessage) => {
                    return prepareMessage(
                        params.moduleUid,
                        slotId,
                        params.defaultConfiguration,
                        params.staticConfiguration,
                        input.contract,
                        params.scope,
                        rawMessage,
                        params.executionJournal,
                    )
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
                ConfigInstance<TSchema>
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
            configuration: extractConfigWith(
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
