import { Context } from '@youwol/logging'
import { Immutable, Immutables } from '../common'

/**
 * Return value of a {@link ExpectationTrait} resolution.
 * ExpectationStatus has a tree structure, the same way expectations have.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export interface Resolution<T> {
    /**
     * Related expectation
     *
     * @group Immutable Properties
     */
    expectation: Immutable<ExpectationTrait<T>>

    /**
     * Data from which the expectation has been tested against
     *
     * @group Immutable Properties
     */
    fromValue: Immutable<unknown>

    /**
     * Status of children expectation
     *
     * @group Immutable Properties
     */
    children?: Immutables<Resolution<unknown>>

    /**
     * Whether the expectation is fulfilled
     *
     * @group Immutable Properties
     */
    succeeded?: Immutable<boolean>

    /**
     * Normalized value, defined only for {@link Fulfilled}
     *
     * @group Immutable Properties
     */
    value?: Immutable<T>
}

/**
 * The case of a fulfilled {@link Resolution}.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export class Fulfilled<T> implements Resolution<T> {
    public readonly expectation: ExpectationTrait<T>
    public readonly children: Immutables<Resolution<unknown>>
    public readonly succeeded = true
    public readonly fromValue: Immutable<unknown>
    public readonly value: Immutable<T>

    constructor(
        expectation: ExpectationTrait<T>,
        value: T,
        fromValue: unknown,
        children?: Array<Resolution<unknown>> | undefined,
    ) {
        Object.assign(this, { expectation, value, fromValue, children })
    }
}

/**
 * The case of a rejected {@link Resolution}.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export class Rejected<T> implements Resolution<T> {
    public readonly expectation: ExpectationTrait<T>
    public readonly children: Immutables<Resolution<unknown>>
    public readonly succeeded = false
    public readonly fromValue: Immutable<unknown>

    /**
     * @param expectation the related expectation
     * @param children the status of *expectation* children
     * @param fromValue the value (data) from which the expectation has been resolved
     */
    constructor(
        expectation: ExpectationTrait<T>,
        fromValue: unknown,
        children?: Array<Resolution<unknown>> | undefined,
    ) {
        Object.assign(this, { expectation, fromValue, children })
    }
}

/**
 * The case of unresolved {@link Resolution}.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export class Unresolved<T> implements Resolution<T> {
    public readonly expectation: ExpectationTrait<T>
    public readonly fromValue: unknown
    public readonly children: Immutables<Resolution<unknown>>
    public readonly succeeded = undefined
    public readonly value: Immutable<T>
    /**
     * @param expectation the related expectation
     * @param fromValue the value (data) from which the expectation has been resolved
     */
    constructor(expectation: ExpectationTrait<T>, fromValue: unknown) {
        Object.assign(this, { expectation, fromValue })
    }
}

/**
 * Trait for expectations.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export interface ExpectationTrait<T> {
    /**
     * description of the expectation
     */
    readonly description: string

    /**
     * Resolve the expectation
     *
     * @param inputData Input data to evaluate the expectation on
     * @param context
     * @return Three case:
     * -    the expectation is resolved: {@link Fulfilled}
     * -    the expectation is failed:  {@link Rejected}
     * -    the expectation does not need to be resolved:  {@link Unresolved}
     */
    resolve(inputData: Immutable<unknown>, context?: Context): Resolution<T>
}

/**
 * @ignore
 */
export class Of<T> implements ExpectationTrait<T> {
    constructor(
        public readonly description: string,
        public readonly when: (inputData: unknown) => boolean,
        public readonly normalizeTo: (
            leafData: Immutable<unknown>,
            context: Context,
        ) => T = (leafData) => leafData as T,
    ) {}

    resolve(inputData: unknown, context: Context): Resolution<T> {
        const succeeded = this.when(inputData)
        return succeeded
            ? new Fulfilled(
                  this,
                  this.normalizeTo(inputData, context),
                  inputData,
              )
            : new Rejected(this, inputData)
    }
}

/**
 *
 * Represents the leafs of the expectation trees; it resolves a provided function.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export function of<T>({
    description,
    when,
    normalizeTo,
}: {
    description: string
    when: (inputData: unknown) => boolean
    normalizeTo?: (data: Immutable<unknown>, context: Context) => T
}): ExpectationTrait<T> {
    return new Of<T>(description, when, normalizeTo)
}

/**
 * @ignore
 */
export class AnyOf<T> implements ExpectationTrait<T> {
    constructor(
        public readonly description: string,
        public readonly expectations: Array<ExpectationTrait<T>>,
        public readonly normalizeTo: (
            accData: unknown,
            context: Context,
        ) => T = (accData) => accData as T,
    ) {}

    resolve(inputData: unknown, context: Context): Resolution<T> {
        let done = false
        const children = this.expectations.map((expectation) => {
            if (done) {
                return new Unresolved(expectation, inputData)
            }
            const resolved = expectation.resolve(inputData, context)
            done = resolved.succeeded
            return resolved
        })

        const resolved = children.reduce(
            (acc, status) =>
                acc.succeeded || !status.succeeded
                    ? acc
                    : { succeeded: true, value: status.value },
            { succeeded: false, value: undefined },
        )

        return resolved.succeeded
            ? new Fulfilled(
                  this,
                  this.normalizeTo(resolved.value, context),
                  inputData,
                  children,
              )
            : new Rejected(this, inputData, children)
    }
}

/**
 * Combine a list of children expectations and gets fulfilled if at least one of the children
 * is; this child is used to return the normalized data.
 *
 * Children expectations beyond the first fulfilled one get associated to {@link Unresolved}.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export function any<T>({
    description,
    when,
    normalizeTo,
}: {
    description: string
    when: Array<ExpectationTrait<T>>
    normalizeTo?: (data: Immutable<unknown>, context: Context) => T
}): ExpectationTrait<T> {
    return new AnyOf<T>(description, when, normalizeTo)
}

/**
 * @ignore
 */
export class AllOf<T> implements ExpectationTrait<T> {
    constructor(
        public readonly description,
        public readonly expectations: Array<ExpectationTrait<T>>,
        public readonly normalizeTo: (
            accData: Immutable<unknown>,
            context: Context,
        ) => T = (accData) => accData as T,
    ) {}

    resolve(inputData: unknown, context: Context): Resolution<T> {
        let done = false
        const children = this.expectations.map((expectation) => {
            if (done) {
                return new Unresolved(expectation, inputData)
            }
            const resolved = expectation.resolve(inputData, context)
            done = !resolved.succeeded
            return resolved
        })
        const resolveds = children.reduce(
            (acc, status) => {
                if (!acc.succeeded) {
                    return acc
                }

                return {
                    succeeded: acc.succeeded && status.succeeded,
                    elems: status.succeeded
                        ? acc.elems.concat([status.value])
                        : acc.elems,
                }
            },
            { succeeded: true, elems: [] },
        )
        return resolveds.succeeded
            ? new Fulfilled(
                  this,
                  this.normalizeTo(resolveds.elems, context),
                  inputData,
                  children,
              )
            : new Rejected(this, inputData, children)
    }
}

/**
 * Combine a list of children expectations and gets fulfilled only if all the children are.
 * The evaluation stops at the first {@link Rejected} and children beyond that are
 * {@link Unresolved}.
 *
 * The normalized data in case of {@link Fulfilled} is the result of the provided *normalizeTo* function
 * evaluated from the list of the normalized data returned by each child.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export function all<T>({
    description,
    when,
    normalizeTo,
}: {
    description: string
    when: Array<ExpectationTrait<T>>
    normalizeTo?: (accData: Immutable<unknown>[]) => T
}): ExpectationTrait<T> {
    return new AllOf<T>(description, when, normalizeTo)
}

/**
 * @ignore
 */
export class OptionalsOf<T> implements ExpectationTrait<T> {
    constructor(
        public readonly description,
        public readonly expectations: Array<ExpectationTrait<T>>,
        public readonly normalizeTo: (accData: Immutable<unknown>, ctx) => T = (
            accData,
        ) => accData as T,
    ) {}

    resolve(inputData: unknown, context: Context): Resolution<T> {
        const children = this.expectations.map((expectation) =>
            expectation.resolve(inputData, context),
        )
        const resolved = children.reduce(
            (acc, status) => acc.concat([status.value]),
            [],
        )
        return new Fulfilled(
            this,
            this.normalizeTo(resolved, context),
            inputData,
            children,
        )
    }
}

/**
 * OptionalsOf are always {@link Fulfilled}, even if some of its children are {@link Rejected}.
 *
 * The evaluation always go through all the children (no {@link Unresolved}).
 *
 * The normalized data is the result of the provided *normalizeTo* function
 * evaluated from the list of the normalized data returned by each child.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export function optionals<T>({
    description,
    when,
    normalizeTo,
}: {
    description: string
    when: Array<ExpectationTrait<T>>
    normalizeTo?: (accData: Immutable<unknown>[]) => T
}): ExpectationTrait<T> {
    return new OptionalsOf<T>(description, when, normalizeTo)
}

/**
 * @ignore
 */
export class SomeOf<T, TConverted = T[]>
    implements ExpectationTrait<TConverted>
{
    constructor(
        public readonly description,
        public readonly expectation: ExpectationTrait<T>,
        public readonly count?: number,
        public readonly normalizeTo: (
            accData: Immutables<T>,
            ctx,
        ) => TConverted = (d) => d as unknown as TConverted,
    ) {}

    resolve(
        inputData: unknown | Array<unknown>,
        context: Context,
    ): Resolution<TConverted> {
        const arrayData = Array.isArray(inputData) ? inputData : [inputData]

        const children = arrayData.map((data) =>
            this.expectation.resolve(data, context),
        )

        const dataResolved = children
            .filter((expectation) => expectation.succeeded)
            .map((child) => child.value)

        const normalized = this.normalizeTo(dataResolved, context)

        if (
            dataResolved.length == 0 ||
            (this.count && dataResolved.length != this.count)
        ) {
            return new Rejected<TConverted>(this, inputData, children)
        }

        if (this.count == undefined || dataResolved.length == this.count) {
            return new Fulfilled<TConverted>(
                this,
                normalized,
                inputData,
                children,
            )
        }
    }
}

/**
 * Evaluate an expectation against a value:
 * *  that is an array -> resolve if at least one element of the array pass the expectation.
 * The normalized data is the result of the provided *normalizeTo* function
 * evaluated from the list of the elements of the array that have resolved successfully.
 * *  not an array -> resolve if that value pass the expectation.
 * The normalized data is the result of the provided *normalizeTo* function
 * evaluated from the value.
 *
 * @typeParam T The type normalized value when the expectation is fulfilled.
 */
export function some<T, TConverted = T[]>({
    description,
    when,
    count,
    normalizeTo,
}: {
    description: string
    when: ExpectationTrait<T>
    count?: number
    normalizeTo?: (d: Immutable<T>[]) => TConverted
}): ExpectationTrait<TConverted> {
    const fullDescription = count
        ? `${count} of "${description}"`
        : `1 or more of "${description}"`
    return new SomeOf(fullDescription, when, count, normalizeTo)
}

/**
 * @ignore
 */
export class ExpectAttribute<T> implements ExpectationTrait<T> {
    public readonly description: string
    constructor(
        public readonly attName: string,
        public readonly expectation: ExpectationTrait<T>,
        public readonly normalizeTo: (accData: unknown, ctx) => T = (accData) =>
            accData as T,
    ) {
        this.description = `expect attribute ${attName}`
    }

    resolve(inputData: unknown, context: Context): Resolution<T> {
        if (inputData[this.attName] == undefined) {
            return new Rejected(this, inputData)
        }

        const resolved = this.expectation.resolve(
            inputData[this.attName],
            context,
        )
        return resolved.succeeded
            ? new Fulfilled(
                  this,
                  this.normalizeTo(resolved.value, context),
                  inputData,
                  [resolved],
              )
            : new Rejected(this, inputData, [resolved])
    }
}

/**
 * The expectation get fulfilled if both: (i) the attribute of provided name exists in the inputData,
 * and (ii) the `when` expectation resolve to {@link Fulfilled} when applied on *inputData[attName]*.
 *
 * If the attribute does not exist in the inputData, the expectation is not evaluated.
 *
 * @typeParam T The type of the attribute when the expectation is fulfilled.
 */
export function attribute<T>({
    name,
    when,
}: {
    name: string
    when: ExpectationTrait<T>
}): ExpectationTrait<T> {
    return new ExpectAttribute<T>(name, when)
}

/**
 * @ignore
 */
export class OfFree<T> implements ExpectationTrait<T> {
    description = 'No expectation'
    constructor() {
        /**no op*/
    }

    resolve(inputData: T): Resolution<T> {
        return new Fulfilled<T>(this, inputData, inputData, [])
    }
}

/**
 * Expect nothing (always fulfilled) and do not apply any data normalization (directly return the inputData).
 */
export function free<T = unknown>(): ExpectationTrait<T> {
    return new OfFree<T>()
}

//export const ofAny = free<never>()
export const ofUnknown = free<unknown>()

/**
 * The function expectInstanceOf aims at ensuring that at least one element of target
 * instance type exists in input data.
 *
 * The expectation get fulfilled if any of the following get fulfilled:
 * -    the inputData is an instance of *Type*
 * -    the inputData have an attribute in *attNames* that is an instance of *Type*
 *
 * In that case, the normalized data is the instance of *Type* retrieved.
 *
 * @param typeName display name of the type
 * @param Type the target type
 * @param attNames candidate attribute names
 * @param normalizeTo normalizer
 *
 * @typeParam T The type of tested data
 * @typeParam TConverted The type of normalized data
 *
 * @returns IExpectation that resolve eventually to a type TConverted
 */
export function instanceOf<T, TConverted = T>({
    typeName,
    Type,
    attNames,
    normalizeTo,
}: {
    typeName: string
    Type
    attNames?: Array<string>
    normalizeTo?: (data: T, context: Context) => TConverted
}): ExpectationTrait<TConverted> {
    attNames = attNames || []
    const when = of<TConverted>({
        description: `A direct instance of ${typeName}`,
        when: (d) => d instanceof Type,
    })

    const attExpectations = attNames.map((name) => attribute({ name, when }))
    const fullDescription =
        attNames.length == 0
            ? `A direct instance of ${typeName}`
            : `A direct instance of ${typeName}, or such instance in attributes [${attNames}]`
    return any<TConverted>({
        description: fullDescription,
        when: [when, ...attExpectations],
        normalizeTo,
    })
}

/**
 * The function aims at ensuring that exactly *count* elements in some *inputData*
 * are fulfilled with respect to a given expectation.
 *
 * The expectation get fulfilled if both:
 * -    (i) the inputData is an array
 * -    (ii) there exist exactly *count* elements in the array that verifies *when*
 *
 * In that case, the normalized data is an array containing the normalized data of the elements fulfilled.
 * (of length *count*).
 *
 * @param count the expected count
 * @param when the expectation
 * @param normalizeTo
 *
 * @typeParam T The type of tested data
 * @typeParam TConverted The type of normalized data
 *
 * @returns IExpectation that resolve eventually to a type T[] of length *count*
 */
export function count<T, TConverted = T[]>({
    count,
    when,
    normalizeTo,
}: {
    count: number
    when: ExpectationTrait<T>
    normalizeTo?: (d: Immutables<T>) => TConverted
}): ExpectationTrait<TConverted> {
    return some({
        description: when.description,
        when,
        count,
        normalizeTo,
    })
}

/**
 * Shorthand of {@link count} for `count = 1`.
 */
export function single<T>({ when }: { when: ExpectationTrait<T> }) {
    return count<T, Immutable<T>>({
        count: 1,
        when,
        normalizeTo: (d: Immutables<T>) => d[0],
    })
}

/**
 * @ignore
 */
export class Contract<_T> implements ExpectationTrait<unknown> {
    /**
     * @param description expectation's description
     * @param requirements set of required expectations provided as a mapping using a given name
     * @param optionals set of optionals expectations provided as a mapping using a given name
     */
    constructor(
        public readonly description: string,
        public readonly requirements: {
            [key: string]: ExpectationTrait<unknown>
        },
        public readonly optionals: {
            [key: string]: ExpectationTrait<unknown>
        } = {},
    ) {}

    resolve(
        data: unknown,
        context: Context,
    ): Resolution<{ [key: string]: unknown }> {
        const requiredStatus = new AllOf<unknown>(
            'requirements',
            Object.values(this.requirements),
        ).resolve(data, context)
        const optionalStatus = optionals({
            description: 'optionals',
            when: Object.values(this.optionals),
        }).resolve(data, context)

        const valuesRequired = requiredStatus.succeeded
            ? Object.entries(this.requirements).reduce((acc, [k, _v], i) => {
                  return { ...acc, ...{ [k]: requiredStatus.value[i] } }
              }, {})
            : {}
        const valuesOptional = Object.entries(this.optionals).reduce(
            (acc, [k, _v], i) => {
                return { ...acc, ...{ [k]: optionalStatus.value[i] } }
            },
            {},
        )
        const values = { ...valuesRequired, ...valuesOptional }

        return requiredStatus.succeeded
            ? new Fulfilled(this, values, data, [
                  requiredStatus,
                  optionalStatus,
              ])
            : new Rejected(this, data, [requiredStatus, optionalStatus])
    }
}

/**
 * The objects Contract are an expectation that gather required and optional expectations.
 * The expectation get fulfilled if all the provided requirements {@link ExpectationTrait} are.
 *
 * The normalized data is provided as dictionary `{[key:string]: normalizedData(key)}` where
 * *key* reference the keys in `requirements' &  `optionals` and *normalizedData(key)* the normalized data
 * of the associated expectation.
 */
export function contract<T = unknown>({
    description,
    requirements,
    optionals,
}: {
    description: string
    requirements: { [_key: string]: ExpectationTrait<unknown> }
    optionals?: { [_key: string]: ExpectationTrait<unknown> }
}): ExpectationTrait<T> {
    return new Contract<T>(
        description,
        requirements,
        optionals,
    ) as unknown as ExpectationTrait<T>
}
