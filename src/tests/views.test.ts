import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { defaultViewsFactory, installRxVDOM } from '../lib/project'
import { ExecutionJournal } from '../lib'

beforeAll(async () => {
    setupCdnHttpConnection({ localOnly: false })
})

test('ViewsFactory#default', async () => {
    const data = {
        value: 42,
    }
    const factories = defaultViewsFactory.filter((f) => f.isCompatible(data))
    const view = await factories.reverse()[0].view(data)
    expect(view).toBeTruthy()
})
test('ViewsFactory#journal', async () => {
    const journal = new ExecutionJournal({})
    const context = journal.addPage({ title: 'test ViewsFactory#journal' })

    await context.withChildAsync('create view', async (ctx) => {
        const factories = defaultViewsFactory.filter((f) =>
            f.isCompatible(journal),
        )
        ctx.info('factory element', factories)
        const view = await factories.reverse()[0].view(journal)
        expect(view).toBeTruthy()
    })
})

test('ViewsFactory#documentation', async () => {
    const doc = {
        documentation: 'some-url',
    }
    const factories = defaultViewsFactory.filter((f) => f.isCompatible(doc))
    const view = await factories.reverse()[0].view(doc)
    expect(view).toBeTruthy()
})

test('ViewsFactory#project', async () => {
    let project = emptyProject()
    project = await project.with({
        workflow: {
            branches: ['(timer#t0)>>(filter#f0)>>(map#m0)>>(mergeMap#m1)'],
        },
    })
    const factories = defaultViewsFactory.filter((f) => f.isCompatible(project))
    const view = await factories.reverse()[0].view(project)
    expect(view).toBeTruthy()
})

test('Project.summaryHtml', async () => {
    let project = emptyProject()
    project = await project.with({
        workflow: {
            branches: ['(timer#t0)>>(filter#f0)>>(map#m0)>>(mergeMap#m1)'],
        },
    })
    await installRxVDOM()
    const view = project.summaryHtml()
    expect(view).toBeTruthy()
})
