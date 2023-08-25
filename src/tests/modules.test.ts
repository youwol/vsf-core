import { toolbox } from './toolbox'
import { Environment } from '../lib/project'
import { setup } from '../auto-generated'
import { Modules } from '../lib'
import * as SphereModule from './modules-implementation/sphere.module'

test('filter module', async () => {
    const env = new Environment({ toolboxes: [toolbox] })
    const module = await env.instantiateModule({
        typeId: 'filter',
        scope: {},
    })
    expect(module).toBeTruthy()
})

test('mergeMap module', async () => {
    const env = new Environment({ toolboxes: [toolbox] })
    const module = await env.instantiateModule({
        typeId: 'mergeMap',
        scope: {},
    })
    expect(module).toBeTruthy()
    const inputSlotIndex = Modules.getInputSlot(module, 0)
    expect(inputSlotIndex).toBeTruthy()
    const inputSlotName = Modules.getInputSlot(module, 'input$')
    expect(inputSlotIndex).toEqual(inputSlotName)
    const outputSlotIndex = Modules.getOutputSlot(module, 0)
    expect(outputSlotIndex).toBeTruthy()
    const outputSlotName = Modules.getOutputSlot(module, 'output$')
    expect(outputSlotIndex).toEqual(outputSlotName)
})

test('sphere module', async () => {
    const auxModuleSphere = 'test-sphere-module'
    window[`${setup.name}/${auxModuleSphere}_API${setup.apiVersion}`] =
        SphereModule
    const env = new Environment({ toolboxes: [toolbox] })
    const module = await env.instantiateModule({
        typeId: 'sphere',
        scope: {},
    })
    expect(module).toBeTruthy()
})

test('plot module', async () => {
    const env = new Environment({ toolboxes: [toolbox] })

    const module = await env.instantiateModule({
        typeId: 'plot',
        scope: {},
    })
    expect(module).toBeTruthy()
    expect(module.html).toBeDefined()
    const view = module.html()
    expect(view).toBeTruthy()
})
