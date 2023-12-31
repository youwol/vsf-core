import { Immutable, Immutables, UidTrait } from '../common'
import { Modules, Connections } from '..'
/**
 * Layers specifies a hierarchical organization of a workflow.
 */
export class Layer implements UidTrait {
    /**
     * Layer's UID
     *
     * @group Immutable Properties
     */
    public readonly uid: Immutable<string>
    /**
     * UID of included modules in the layer
     *
     * @group Immutable Properties
     */
    public readonly moduleIds: Immutable<string[]> = []

    /**
     * Children layers
     *
     * @group Immutable Properties
     */
    public readonly children: Immutables<Layer> = []

    /**
     *
     * @param params.uid Layer's UID
     * @param params.moduleIds UID of included modules in the layer
     * @param params.children Children layers
     */
    constructor(
        params: {
            uid?: Immutable<string>
            moduleIds?: Immutable<string[]>
            children?: Immutables<Layer>
        } = {},
    ) {
        Object.assign(this, params)
        this.uid = this.uid || Modules.uuidv4()
    }

    /**
     * Reduce recursively along the layers' tree using a provided function.
     * @param fct reducing function
     * @param v0 seed
     * @return reduced result
     */
    reduce<TRes>(fct: (acc: TRes, e: Layer) => TRes, v0: TRes): TRes {
        return this.children.reduce(
            (acc, e) => {
                return e.reduce(fct, acc)
            },
            fct(v0, this),
        )
    }

    /**
     * Map to a new {@link Layer} using a provided mapping function.
     * @param fct mapping function
     * @return new layer tree
     */
    map(fct: (l: Layer) => Layer): Layer {
        const { uid, moduleIds, children } = fct(this)
        const newChildren = children.map((c) => c.map(fct))
        return new Layer({ uid, moduleIds, children: newChildren })
    }

    /**
     * Filter all layers according to a provided filter function.
     * @param fct filter function
     * @return list of filtered layers (flat)
     */
    filter(fct: (l: Layer) => boolean): Layer[] {
        const l = fct(this) ? this : undefined
        const c = this.children.map((l) => l.filter(fct)).flat()
        return [l, ...c].filter((l) => l != undefined)
    }

    /**
     * @return a flat list of all the layers.
     */
    flat(): Layer[] {
        return this.reduce((acc, e) => [...acc, e], [])
    }

    /**
     * Merge with another layer.
     * @param include the layer to merge with
     * @param at the uid of the target layer to merge into
     * @return new layer tree
     */
    merge({ include, at }: { include: Layer; at?: string }): Layer {
        return merge({ from: this, include, at })
    }
}

function merge({
    from,
    include,
    at,
}: {
    from: Layer
    include: Layer
    at?: string
}) {
    at = at || from.uid
    const allIncludedIds: string[] = include.reduce(
        (acc, l) => [...acc, ...l.moduleIds, ...l.children.map((l) => l.uid)],
        [],
    )

    const base = from.map((l) => {
        return new Layer({
            uid: l.uid,
            moduleIds: l.moduleIds.filter(
                (uid) => !allIncludedIds.includes(uid),
            ),
            children: l.children.filter(
                ({ uid }) => !allIncludedIds.includes(uid),
            ),
        })
    })
    return base.map((l) => {
        return l.uid == at
            ? new Layer({ ...l, children: [...l.children, include] })
            : l
    })
}

/**
 * Specification of a workflow for latter instantiation.
 */
export type WorkflowModel = UidTrait & {
    readonly modules: Immutables<Modules.ModuleModel>
    readonly connections: Immutables<Connections.ConnectionModel>
    readonly rootLayer: Immutable<Layer>
}

/**
 * Shorthand for empty workflow creation.
 */
export function emptyWorkflowModel(): WorkflowModel {
    return {
        uid: Modules.uuidv4(),
        modules: [],
        connections: [],
        rootLayer: new Layer({ uid: 'root' }),
    }
}
