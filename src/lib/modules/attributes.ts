import { OverrideType } from './traits'
import { Configurations } from '..'

/**
 *  A wrapper function for annotating a {@link Configurations.AttributeTrait} by {@link OverrideType} to be used
 *  as a module's configuration attribute.
 *
 *  @param classFactory - The class of the actual {@link Configurations.AttributeTrait} to convert
 *  (e.g. {@link Configurations.Integer}).
 *  @param params - The parameters forwarded as first constructor's parameter of `classFactory`.
 *  @param options - (Optional) Additional options for configuring the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const makeAttribute = <
    TR extends Configurations.AttributeTrait<unknown, TOverride>,
    T extends new (p: unknown, mode: OverrideType) => TR,
    TParams extends ConstructorParameters<T>[0],
    TOverride extends OverrideType,
>(
    classFactory: T,
    params: TParams,
    options?: { override?: OverrideType },
) => new classFactory(params, options?.override || 'overridable')

/**
 * A wrapper function for annotating a {@link Configurations.Integer} by {@link OverrideType}  to be used as a
 * module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.Integer}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const integerAttribute = <
    TOverride extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<typeof Configurations.Integer>[0],
    annotations?: { override: TOverride },
): Configurations.Integer<TOverride> =>
    makeAttribute(Configurations.Integer<TOverride>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.Float} by {@link OverrideType} to be used as a
 * module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.Float}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const floatAttribute = <TOverride extends OverrideType = 'overridable'>(
    attrParams: ConstructorParameters<typeof Configurations.Float>[0],
    annotations?: { override: TOverride },
): Configurations.Float<TOverride> =>
    makeAttribute(Configurations.Float<TOverride>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.StringLiteral} by {@link OverrideType} to be used as
 * a module's configuration
 * attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of
 * {@link Configurations.StringLiteral}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const stringLiteralAttribute = <
    TLiteral,
    TOverride extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<
        typeof Configurations.StringLiteral<TLiteral>
    >[0],
    annotations?: { override: TOverride },
): Configurations.StringLiteral<TLiteral, TOverride> =>
    makeAttribute(
        Configurations.StringLiteral<TLiteral, TOverride>,
        attrParams,
        annotations,
    )

/**
 * A wrapper function for annotating a {@link Configurations.String} by {@link OverrideType} to be used as a module's
 * configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.String}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const stringAttribute = <TOverride extends OverrideType = 'overridable'>(
    attrParams: ConstructorParameters<typeof Configurations.String>[0],
    annotations?: { override: TOverride },
): Configurations.String<TOverride> =>
    makeAttribute(Configurations.String<TOverride>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.JsCode} by {@link OverrideType} to be used as a
 * module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.JsCode}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const jsCodeAttribute = <
    TFct extends (...d: unknown[]) => unknown,
    TOverride extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<typeof Configurations.JsCode<TFct>>[0],
    annotations?: { override: TOverride },
): Configurations.JsCode<TFct, TOverride> =>
    makeAttribute(
        Configurations.JsCode<TFct, TOverride>,
        attrParams,
        annotations,
    )

/**
 * A wrapper function for annotating a {@link Configurations.Boolean} by {@link OverrideType} to be used as a
 * module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.Boolean}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const booleanAttribute = <
    TOverride extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<typeof Configurations.Boolean>[0],
    annotations?: { override: TOverride },
): Configurations.Boolean<TOverride> =>
    makeAttribute(Configurations.Boolean<TOverride>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.AnyObject} by {@link OverrideType}  to be used as a
 * module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.AnyObject}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const anyObjectAttribute = <
    TOverride extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<typeof Configurations.AnyObject>[0],
    annotations?: { override: TOverride },
): Configurations.AnyObject<TOverride> =>
    makeAttribute(Configurations.AnyObject<TOverride>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.Any} by {@link OverrideType} to be used as a
 * module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of {@link Configurations.Any}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const anyAttribute = <TOverride extends OverrideType = 'overridable'>(
    attrParams: ConstructorParameters<typeof Configurations.Any>[0],
    annotations?: { override: TOverride },
): Configurations.Any<TOverride> =>
    makeAttribute(Configurations.Any<TOverride>, attrParams, annotations)

/**
 * A wrapper function for annotating a {@link Configurations.CustomAttribute} by {@link OverrideType} to be used as
 * a module's configuration attribute.
 *
 * @param attrParams - The parameters forwarded as first constructor's parameter of
 * {@link Configurations.CustomAttribute}.
 * @param annotations - (Optional) Additional options for annotating the attribute, for now the 'override' annotation.
 *  Use by default the annotation `overridable`.
 */
export const customAttribute = <
    TAttr,
    TOverride extends OverrideType = 'overridable',
>(
    attrParams: ConstructorParameters<
        typeof Configurations.CustomAttribute<TAttr>
    >[0],
    annotations?: { override: TOverride },
): Configurations.CustomAttribute<TAttr, TOverride> =>
    makeAttribute(
        Configurations.CustomAttribute<TAttr, TOverride>,
        attrParams,
        annotations,
    )
