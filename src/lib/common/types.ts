import { BehaviorSubject, Observable, ReplaySubject, Subject } from 'rxjs'
import { AnyArray, Builtin } from 'ts-essentials'
/**
 * Raw type casting for contexts where Immutable to Mutable conversion is needed.
 * @param object Object to cast
 */
export function asMutable<T>(object) {
    return object as T
}

/**
 * Type casting to {@link Immutable}.
 * @param object Object to cast
 */
export function asImmutable<T>(object: T) {
    return object as Immutable<T>
}

export type ImmutableObj<T, Depth extends 'deep' | 'shallow' = 'deep'> = {
    readonly [K in keyof T]: Depth extends 'deep' ? Immutable<T[K]> : T[K]
}

/**
 * Convert an object type in its immutable version recursively through its properties.
 *
 * For arrays & observables see shorthands {@link Immutables} and {@link Immutable$}.
 *
 * Implementation is based on [ts-essentials implementation](https://github.com/ts-essentials/ts-essentials/blob/master/lib/deep-readonly/index.ts)
 * with modifications:
 * *  handle Observable
 * *  do not handle Tuple (cause errors)
 * *  do not handle IsUnknown (cause errors)
 */
export type Immutable<T> =
    T extends Exclude<Builtin, Error>
        ? T
        : T extends Map<infer Keys, infer Values>
          ? ReadonlyMap<Immutable<Keys>, Immutable<Values>>
          : T extends ReadonlyMap<infer Keys, infer Values>
            ? ReadonlyMap<Immutable<Keys>, Immutable<Values>>
            : T extends WeakMap<infer Keys, infer Values>
              ? WeakMap<Immutable<Keys>, Immutable<Values>>
              : T extends Set<infer Values>
                ? Set<Immutable<Values>>
                : T extends ReadonlySet<infer Values>
                  ? ReadonlySet<Immutable<Values>>
                  : T extends WeakSet<infer Values>
                    ? WeakSet<Immutable<Values>>
                    : T extends Promise<infer Value>
                      ? Promise<Immutable<Value>>
                      : T extends BehaviorSubject<infer Value>
                        ? BehaviorSubject<Immutable<Value>>
                        : T extends ReplaySubject<infer Value>
                          ? ReplaySubject<Immutable<Value>>
                          : T extends Subject<infer Value>
                            ? Subject<Immutable<Value>>
                            : T extends Observable<infer Value>
                              ? Observable<Immutable<Value>>
                              : T extends AnyArray<infer Values>
                                ? Immutables<Values> //T extends IsTuple<T> ? ImmutableObj<T> : Immutables<Values>
                                : T extends object
                                  ? ImmutableObj<T>
                                  : Readonly<T>
/**
 * Shorthand utility type for `Observable<Immutable<T>>`
 */
export type Immutable$<T> = Observable<Immutable<T>>

/**
 * Shorthand utility type for `readonly Immutable<T>[]`
 */
export type Immutables<T> = readonly Immutable<T>[]

/**
 * Convert keys' type of object as union of them
 */
export type KeysAsUnion<T> = T extends T ? keyof T : never
