import { Config } from 'jest'

const jestConfig: Config = {
    preset: '@youwol/jest-preset',
    modulePathIgnorePatterns: [],
    testSequencer: './src/tests/test-sequencer.js',
}
export default jestConfig
