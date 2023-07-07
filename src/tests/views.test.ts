import { emptyProject, setupCdnHttpConnection } from './test.utils'
import { ProjectSummaryView } from '../lib/project'
import { install } from '@youwol/cdn-client'

setupCdnHttpConnection({ localOnly: false })

test('ProjectSummaryView', async () => {
    let project = emptyProject()
    project = await project.parseDag([
        '(timer#t0)>>(filter#f0)>>(map#m0)>>(mergeMap#m1)',
    ])
    await install({ modules: ['@youwol/flux-view#^1.0.0'] })
    const view = new ProjectSummaryView({ project })
    expect(view).toBeTruthy()
})
