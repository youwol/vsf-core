import { Context, Journal, LogChannel } from '@youwol/logging'
import { asMutable, Immutable, Immutables } from './types'

/**
 * A journal gathering logs about code execution.
 */
export class ExecutionJournal implements Journal.Journal {
    /**
     * Title of the journal.
     *
     * @group Immutable Properties
     */
    public readonly title = 'Execution Journal'

    /**
     * Abstract of the journal.
     *
     * @group Immutable Properties
     */
    public readonly abstract = ''

    /**
     * Broadcasting channels for logs.
     *
     * @group Immutable Properties
     */
    public readonly logsChannels: Immutable<LogChannel[]> = []

    /**
     * Pages of the journal
     *
     * @group Mutable Variables
     */
    pages: Journal.Page[] = []

    /**
     *
     * @param params.logsChannels broadcasting logsChannels from @youwol/logging
     */
    constructor(params: { logsChannels?: Immutables<LogChannel> }) {
        Object.assign(this, params)
    }

    /**
     * Add a new page.
     *
     * @param title title of the page
     * @param abstract abstract of the page
     * @param context if provided this context is used as root of the page,
     * otherwise one is created from title & userData
     * @return associated context of the page
     */
    addPage({
        title,
        abstract,
        context,
    }: {
        title: string
        abstract?: string
        context?: Context
    }) {
        context =
            context ||
            new Context(title, {}, asMutable<LogChannel[]>(this.logsChannels))

        this.pages = this.pages
            .filter((j) => j.title != title)
            .concat([{ title, abstract, entryPoint: context }])
        return context
    }
}
