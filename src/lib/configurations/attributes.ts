import { Configurations } from '..'
/**
 * Trait for object with attribute behavior.
 */
export interface AttributeTrait<TValue> {
    /**
     * return the value of the attribute
     */
    getValue(): TValue

    withValue(value: unknown): AttributeTrait<TValue>
}

/**
 * Attribute representing javascript function
 */
export class JsCode<TFct extends (...d: unknown[]) => unknown>
    implements AttributeTrait<TFct>
{
    public readonly __value: TFct

    constructor(params: { value?: string | TFct }) {
        this.__value =
            typeof params.value == 'string'
                ? new Function(this.sanitizeStr(params.value))()
                : params.value
    }

    execute(...args: Parameters<TFct>): ReturnType<TFct> {
        return this.__value(...args) as ReturnType<TFct>
    }

    getValue() {
        return this.__value
    }

    withValue(value: string | TFct) {
        return new JsCode<TFct>({ value })
    }

    private sanitizeStr(raw: string) {
        return raw.trim().startsWith('return') ? raw : `return ${raw}`
    }
}

/**
 * Attribute representing float
 */
export class Float implements AttributeTrait<number> {
    public readonly __value: number
    public readonly min?: number
    public readonly max?: number

    constructor(params: { value?: number; min?: number; max?: number }) {
        Object.assign(this, params)
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: number) {
        return new Float({ value })
    }
}

/**
 * Attribute representing string
 */
export class String implements AttributeTrait<string> {
    public readonly __value: string
    constructor(params: { value: string }) {
        Object.assign(this, params)
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: string) {
        return new Configurations.String({ value })
    }
}

/**
 * Attribute representing string literal
 */
export class StringLiteral<T> implements AttributeTrait<T> {
    public readonly __value: T
    constructor(params: { value: T }) {
        Object.assign(this, params)
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: T) {
        return new StringLiteral<T>({ value })
    }
}

/**
 * Attribute representing integer
 */
export class Integer implements AttributeTrait<number> {
    public readonly __value: number
    public readonly min?: number
    public readonly max?: number
    constructor(params: { value: number; min?: number; max?: number }) {
        Object.assign(this, params)
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: number) {
        return new Integer({ value })
    }
}

/**
 * Attribute representing boolean
 */
export class Boolean implements AttributeTrait<boolean> {
    public readonly __value: boolean

    constructor(params: { value: boolean }) {
        Object.assign(this, params)
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: boolean) {
        return new Configurations.Boolean({ value })
    }
}

/**
 * Attribute representing an unknown object `{ [k: string]: unknown }`
 */
export class AnyObject implements AttributeTrait<{ [k: string]: unknown }> {
    public readonly __value: { [k: string]: unknown }

    constructor(params: { value: { [k: string]: unknown } }) {
        Object.assign(this, params)
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: { [k: string]: unknown }) {
        return new AnyObject({ value })
    }
}

/**
 * Attribute representing an unknown object `{ [k: string]: unknown }`
 */
export class Any implements AttributeTrait<unknown> {
    public readonly __value: unknown

    constructor(params: { value: unknown }) {
        Object.assign(this, params)
        this.__value = params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: unknown) {
        return new Any({ value })
    }
}

/**
 * Attribute representing a custom attribute of given type.
 */
export class CustomAttribute<T> implements AttributeTrait<T> {
    public readonly __value: T

    constructor(params: { value: T }) {
        Object.assign(this, params)
        this.__value = params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: T) {
        return new CustomAttribute<T>({ value })
    }
}
