import { module as plotModule } from './modules-implementation/plot.module'
import { Modules } from '..'
import { module as ofModule } from './modules-implementation/of.module'
import { module as delayModule } from './modules-implementation/delay.module'
import { module as delayWhenModule } from './modules-implementation/delay-when.module'
import { module as mapModule } from './modules-implementation/map.module'
import { module as filterModule } from './modules-implementation/filter.module'
import { module as mergeMapModule } from './modules-implementation/merge-map.module'
import { module as consoleModule } from './modules-implementation/console.module'
import { module as timerModule } from './modules-implementation/timer.module'
import { module as sphereModule } from './modules-implementation/sphere.module'
import { module as takeModule } from './modules-implementation/take.module'
import { module as combineLatestModule } from './modules-implementation/combine-latest.module'

export const toolbox = {
    name: 'test-toolbox',
    uid: '@youwol/vs-flow-core/test-toolbox',
    origin: {
        packageName: '@youwol/vs-flow-core/test-toolbox',
        version: '0.1.0-wip',
    },
    modules: [
        new Modules.Module({
            declaration: {
                typeId: 'of',
            },
            implementation: ({ fwdParams }) => {
                return ofModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'delay',
            },
            implementation: ({ fwdParams }) => {
                return delayModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'delayWhen',
            },
            implementation: ({ fwdParams }) => {
                return delayWhenModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'map',
            },
            implementation: ({ fwdParams }) => {
                return mapModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'filter',
            },
            implementation: ({ fwdParams }) => {
                return filterModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'mergeMap',
            },
            implementation: ({ fwdParams }) => {
                return mergeMapModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'take',
            },
            implementation: ({ fwdParams }) => {
                return takeModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'combineLatest',
            },
            implementation: ({ fwdParams }) => {
                return combineLatestModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'console',
            },
            implementation: ({ fwdParams }) => {
                return consoleModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'timer',
            },
            implementation: ({ fwdParams }) => {
                return timerModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'sphere',
                dependencies: {},
            },
            implementation: ({ fwdParams }) => {
                return sphereModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'plot',
            },
            implementation: ({ fwdParams }) => {
                return plotModule(fwdParams)
            },
        }),
        new Modules.Module({
            declaration: {
                typeId: 'plot',
            },
            implementation: ({ fwdParams }) => {
                return plotModule(fwdParams)
            },
        }),
    ],
}
