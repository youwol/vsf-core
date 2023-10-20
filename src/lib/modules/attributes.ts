import { OverrideType } from './traits'
import { Configurations } from '..'

/**
 *  A wrapper function for annotating a {@link Configurations.AttributeTrait} to be used as a module's
 *  configuration attribute.
 *
 *  @param classFactory - The class of the actual {@link Configurations.AttributeTrait} to convert
 *  (e.g. {@link Configurations.Integer}).
 *  @param params - The parameters forwarded as first constructor's parameter of `classFactory`.
 *  @param options - (Optional) Additional options for configuring the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const makeAttribute = <
    TR extends Configurations.AttributeTrait<unknown, TRunTime>,
    T extends new (p: unknown, mode: OverrideType) => TR,
    TParams extends ConstructorParameters<T>[0],
    TRunTime extends OverrideType,
>(
    classFactory: T,
    params: TParams,
    options?: { override?: OverrideType },
) => new classFactory(params, options?.override || 'overridable')

/**
 * A wrapper function for annotating a {@link Configurations.Integer} to be used as a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.Integer}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const integerAttribute = <TRunTime extends OverrideType = 'overridable'>(
    attrParams: ConstructorParameters<typeof Configurations.Integer>[0],
    annotations?: { override: TRunTime },
): Configurations.Integer<TRunTime> =>
    makeAttribute(Configurations.Integer<TRunTime>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.Float} to be used as a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.Float}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const floatAttribute = <TRunTime extends OverrideType = 'overridable'>(
    attrParams: ConstructorParameters<typeof Configurations.Float>[0],
    annotations?: { override: TRunTime },
): Configurations.Float<TRunTime> =>
    makeAttribute(Configurations.Float<TRunTime>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.StringLiteral} to be used as a module's configuration
 * attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of
 * {@link Configurations.StringLiteral}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const stringLiteralAttribute = <
    TLiteral,
    TRunTime extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<
        typeof Configurations.StringLiteral<TLiteral>
    >[0],
    annotations?: { override: TRunTime },
): Configurations.StringLiteral<TLiteral, TRunTime> =>
    makeAttribute(
        Configurations.StringLiteral<TLiteral, TRunTime>,
        attrParams,
        annotations,
    )

/**
 * A wrapper function for annotating a {@link Configurations.String} to be used as a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.String}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const stringAttribute = <TRunTime extends OverrideType = 'overridable'>(
    attrParams: ConstructorParameters<typeof Configurations.String>[0],
    annotations?: { override: TRunTime },
): Configurations.String<TRunTime> =>
    makeAttribute(Configurations.String<TRunTime>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.JsCode} to be used as a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.JsCode}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const jsCodeAttribute = <
    TFct extends (...d: unknown[]) => unknown,
    TRunTime extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<typeof Configurations.JsCode<TFct>>[0],
    annotations?: { override: TRunTime },
): Configurations.JsCode<TFct, TRunTime> =>
    makeAttribute(
        Configurations.JsCode<TFct, TRunTime>,
        attrParams,
        annotations,
    )

/**
 * A wrapper function for annotating a {@link Configurations.Boolean} to be used as a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.Boolean}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const booleanAttribute = <TRunTime extends OverrideType = 'overridable'>(
    attrParams: ConstructorParameters<typeof Configurations.Boolean>[0],
    annotations?: { override: TRunTime },
): Configurations.Boolean<TRunTime> =>
    makeAttribute(Configurations.Boolean<TRunTime>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.AnyObject} to be used as a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.AnyObject}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const anyObjectAttribute = <
    TRunTime extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<typeof Configurations.AnyObject>[0],
    annotations?: { override: TRunTime },
): Configurations.AnyObject<TRunTime> =>
    makeAttribute(Configurations.AnyObject<TRunTime>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.Any} to be used as a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.Any}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const anyAttribute = <TRunTime extends OverrideType = 'overridable'>(
    attrParams: ConstructorParameters<typeof Configurations.Any>[0],
    annotations?: { override: TRunTime },
): Configurations.Any<TRunTime> =>
    makeAttribute(Configurations.Any<TRunTime>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.CustomAttribute} to be used as a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of
 * {@link Configurations.CustomAttribute}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const customAttribute = <
    TAttr,
    TRunTime extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<
        typeof Configurations.CustomAttribute<TAttr>
    >[0],
    annotations?: { override: TRunTime },
): Configurations.CustomAttribute<TAttr, TRunTime> =>
    makeAttribute(
        Configurations.CustomAttribute<TAttr, TRunTime>,
        attrParams,
        annotations,
    )
