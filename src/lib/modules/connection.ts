import { Api$Trait, SlotTrait } from './traits'
import { concatMap, delay, map } from 'rxjs/operators'
import { InputMessage } from './module'
import { BehaviorSubject, of, ReplaySubject, Subscription } from 'rxjs'
import { Environment } from '../project'
import { extractConfigWith, Attributes, Immutable, Immutable$ } from '..'
import {
    UidTrait,
    JournalTrait,
    StatusTrait,
    ExecutionJournal,
    ConfigurableTrait,
} from '../common'

export type AnyJson = boolean | number | string | null | JsonArray | JsonMap
export type JsonMap = {
    [key: string]: AnyJson
}
export type JsonArray = Array<AnyJson>

export type UserContext = { [key: string]: unknown }

/**
 * Type of the message conveyed by {@link Connection}.
 *
 * @typeParam TData the type of the data part of the message.
 */
export type Message<TData = unknown> = {
    /**
     * data part of the message
     */
    data: TData
    /**
     * context part of the message.
     * Context are set up using {@link Adaptor} and propagated along the branches of the
     * {@link Projects.WorkflowModel}.
     */
    context?: UserContext
}

/**
 * Adaptor are associated to  {@link Connection} and transforms  {@link Message} to {@link InputMessage}.
 *
 * They are typically used for:
 * *  providing dynamic configuration properties of the module connected at the end of the connection.
 * *  providing context that will be propagated through the branch of the workflows.
 */
export type Adaptor = (Message) => InputMessage

/**
 * Type of connection status as emitted by {@link Connection.status$}
 */
export type ConnectionStatus =
    | 'created'
    | 'connected'
    | 'started'
    | 'completed'
    | 'disconnected'

export type ConnectableTrait = StatusTrait<ConnectionStatus> & {
    start: Immutable<SlotTrait>
    end: Immutable<SlotTrait>
    start$: Immutable$<Message>
    end$: Immutable$<Message>
    connect: ({ apiFinder }) => void
    disconnect: () => void
}

export type ConnectionTrait = UidTrait &
    ConfigurableTrait<{
        adaptor?: Attributes.JsCode<(Message) => Message>
        transmissionDelay?: Attributes.Integer
    }> &
    JournalTrait &
    ConnectableTrait

/**
 * Connection conveys {@link Message} between {@link InputSlot} & {@link OutputSlot} of 2 modules.
 */
export class Connection implements ConnectionTrait {
    /**
     * Runtime environment.
     *
     * @group Immutable Properties
     */
    public readonly environment: Immutable<Environment>

    /**
     * Reference the start of the connection (an {@link OutputSlot} of a module {@link Implementation}).
     *
     * @group Immutable Properties
     */
    public readonly start: Immutable<SlotTrait>

    /**
     * Reference the end of the connection (an {@link InputSlot} of a module {@link Implementation}).
     *
     * @group Immutable Properties
     */
    public readonly end: Immutable<SlotTrait>

    /**
     * uid
     *
     * @group Immutable Properties
     */
    public readonly uid: string

    /**
     * Connection's configuration model, eventually defining an {@link Adaptor}.
     *
     * @group Immutable Properties
     */
    public readonly configuration = {
        schema: {
            adaptor: new Attributes.JsCode({
                value: undefined,
            }),
            transmissionDelay: new Attributes.Integer({ value: 0 }),
        },
    }
    /**
     * Actual configuration instance.
     *
     * @group Immutable Properties
     */
    public readonly configurationInstance: Immutable<{
        adaptor?: Adaptor
        transmissionDelay: number
    }>

    /**
     * Journal of Execution.
     *
     * @group Immutable Properties
     */
    public readonly journal: ExecutionJournal

    private subscription: Subscription

    /**
     * Observable that emit {@link ConnectionStatus} updates.
     *
     * @group Immutable Properties
     */
    public readonly status$ = new BehaviorSubject<ConnectionStatus>('created')

    private _start$: ReplaySubject<Message>
    private _end$: ReplaySubject<Message>

    /**
     * observable that emits the messages as emitted by the {@link start} slot.
     */
    get start$() {
        if (!this._start$) {
            this._start$ = new ReplaySubject<Message>(1)
        }
        return this._start$
    }

    /**
     * observable that emits the messages as emitted by the {@link end} slot.
     */
    get end$() {
        if (!this._end$) {
            this._end$ = new ReplaySubject<Message>(1)
        }
        return this._end$
    }

    constructor({
        uid,
        start,
        end,
        configuration,
        environment,
    }: {
        uid: string
        start: Immutable<SlotTrait>
        end: Immutable<SlotTrait>
        configuration: { adaptor?: Adaptor }
        environment: Immutable<Environment>
    }) {
        this.environment = environment
        this.start = start
        this.end = end
        this.journal = new ExecutionJournal({
            logsChannels: this.environment.logsChannels,
        })
        this.configurationInstance = extractConfigWith(
            {
                configuration: this.configuration,
                values: configuration,
            },
            this.journal.addPage({
                title: 'constructor',
            }),
        )

        this.uid = uid
    }

    /**
     * Connect the connection (subscribing associated observables).
     *
     * @param apiFinder a function that returns connectable entities ({@link Api$Trait}) for particular uid.
     */
    connect({
        apiFinder,
    }: {
        apiFinder: (uid: string) => Immutable<Api$Trait<unknown>>
    }) {
        const startModule = apiFinder(this.start.moduleId)
        const endModule = apiFinder(this.end.moduleId)
        const startSlot = startModule.outputSlots[this.start.slotId]

        const endSlot = endModule.inputSlots[this.end.slotId]

        const adaptor = this.configurationInstance.adaptor
        const transmissionDelay = this.configurationInstance.transmissionDelay
        this.status$.next('connected')

        const adapted$ = startSlot.observable$.pipe(
            map((message: Message<unknown>) => {
                this.status$.next('started')
                const ctx = this.journal.addPage({
                    title: 'data transiting',
                })
                this._start$ && this._start$.next(message)
                ctx.info('Incoming message', message)
                const adapted = adaptor ? adaptor(message) : message
                ctx.info('Adapted message', adapted)
                return adapted
            }),
        )
        const delayed$ =
            transmissionDelay > 0
                ? adapted$.pipe(
                      concatMap((message, i) =>
                          of(message).pipe(
                              delay(i == 0 ? 0 : transmissionDelay),
                          ),
                      ),
                  )
                : adapted$
        this.subscription = delayed$.subscribe(
            (adaptedMessage: InputMessage<unknown>) => {
                this._end$ && this._end$.next(adaptedMessage)
                endSlot.rawMessage$.next(adaptedMessage)
            },
            (error) => {
                console.error(
                    `Error while retrieving connection's input data (${this.uid})`,
                )
                const ctx = this.journal.addPage({
                    title: "Error while retrieving connection's input data",
                })
                ctx.error(error)
            },
            () => {
                endSlot.rawMessage$.complete()
                this._start$ && this._start$.complete()
                this._end$ && this._end$.complete()
                this.status$.next('completed')
            },
        )
    }

    /**
     * Disconnect the connection (unsubscribe associated subscriptions).
     */
    disconnect() {
        if (this.subscription) {
            this.subscription.unsubscribe()
            this.subscription = undefined
            this.status$.next('disconnected')
        }
    }

    /**
     * Apply the adaptor
     * @param d
     */
    adapt(d: Message<unknown>) {
        return this.configurationInstance.adaptor(d)
    }
}
