import { Configurations } from '..'
/**
 * Trait for object with attribute behavior.
 */
export interface AttributeTrait<TValue, TAnnotation> {
    readonly annotation?: TAnnotation
    /**
     * return the value of the attribute
     */
    getValue(): TValue

    withValue(value: unknown): AttributeTrait<TValue, TAnnotation>
}

/**
 * Attribute representing javascript function
 */
export class JsCode<
    TFct extends (...d: unknown[]) => unknown,
    TAnnotation = never,
> implements AttributeTrait<TFct, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: TFct

    constructor(params: { value?: string | TFct }, annotation?: TAnnotation) {
        this.annotation = annotation
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
        return new JsCode<TFct, TAnnotation>({ value })
    }

    private sanitizeStr(raw: string) {
        return raw.trim().startsWith('return') ? raw : `return ${raw}`
    }
}

/**
 * Attribute representing float
 */
export class Float<TAnnotation = never>
    implements AttributeTrait<number, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: number
    public readonly min?: number
    public readonly max?: number

    constructor(
        params: { value?: number; min?: number; max?: number },
        annotation?: TAnnotation,
    ) {
        Object.assign(this, params)
        this.annotation = annotation
        this.__value = params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: number) {
        return new Float<TAnnotation>({ value }, this.annotation)
    }
}

/**
 * Attribute representing string
 */
export class String<TAnnotation = never>
    implements AttributeTrait<string, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: string
    constructor(params: { value: string }, annotation?: TAnnotation) {
        Object.assign(this, params)
        this.annotation = annotation
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: string) {
        return new Configurations.String<TAnnotation>(
            { value },
            this.annotation,
        )
    }
}

/**
 * Attribute representing string literal
 */
export class StringLiteral<T, TAnnotation = never>
    implements AttributeTrait<T, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: T
    constructor(params: { value: T }, annotation?: TAnnotation) {
        Object.assign(this, params)
        this.annotation = annotation
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: T) {
        return new StringLiteral<T, TAnnotation>({ value }, this.annotation)
    }
}

/**
 * Attribute representing integer
 */
export class Integer<TAnnotation = never>
    implements AttributeTrait<number, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: number
    public readonly min?: number
    public readonly max?: number
    constructor(
        params: { value: number; min?: number; max?: number },
        annotation?: TAnnotation,
    ) {
        Object.assign(this, params)
        this.annotation = annotation
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: number) {
        return new Integer<TAnnotation>({ value }, this.annotation)
    }
}

/**
 * Attribute representing boolean
 */
export class Boolean<TAnnotation = never>
    implements AttributeTrait<boolean, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: boolean

    constructor(params: { value: boolean }, annotation?: TAnnotation) {
        Object.assign(this, params)
        this.annotation = annotation
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: boolean) {
        return new Configurations.Boolean<TAnnotation>(
            { value },
            this.annotation,
        )
    }
}

/**
 * Attribute representing an unknown object `{ [k: string]: unknown }`
 */
export class AnyObject<TAnnotation = never>
    implements AttributeTrait<{ [k: string]: unknown }, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: { [k: string]: unknown }

    constructor(
        params: { value: { [k: string]: unknown } },
        annotation?: TAnnotation,
    ) {
        Object.assign(this, params)
        this.annotation = annotation
        this.__value = params.value && params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: { [k: string]: unknown }) {
        return new AnyObject<TAnnotation>({ value }, this.annotation)
    }
}

/**
 * Attribute representing an unknown object `{ [k: string]: unknown }`
 */
export class Any<TAnnotation = never>
    implements AttributeTrait<unknown, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: unknown

    constructor(params: { value: unknown }, annotation?: TAnnotation) {
        Object.assign(this, params)
        this.annotation = annotation
        this.__value = params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: unknown) {
        return new Any<TAnnotation>({ value }, this.annotation)
    }
}

/**
 * Attribute representing a custom attribute of given type.
 */
export class CustomAttribute<T, TAnnotation = never>
    implements AttributeTrait<T, TAnnotation>
{
    readonly annotation?: TAnnotation
    public readonly __value: T

    constructor(params: { value: T }, annotation?: TAnnotation) {
        Object.assign(this, params)
        this.annotation = annotation
        this.__value = params.value
    }

    getValue() {
        return this.__value
    }

    withValue(value: T) {
        return new CustomAttribute<T, TAnnotation>({ value }, this.annotation)
    }
}
